# UniPay Payment Gateway

UniPay is a hosted payment service with an embeddable checkout widget. A merchant creates an order from a server-side application, receives a short-lived widget token, and renders the widget on its checkout page. UniPay processes or records the selected payment method and sends a signed server-to-server callback when an order reaches `COMPLETED`.

This document is the implementation manual for developers, operators, and coding agents.

## 1. What A Merchant Means

A **merchant** is the website, business, or application that sells the product or service being paid for.

In this system, a merchant is represented by one row in `merchant_keys`:

- `site_id`: stable identifier for the merchant website.
- `display_name`: human-readable name.
- `api_key_hash`: hash of the secret API key used by the merchant backend.
- `callback_url`: endpoint on the merchant website that receives payment completion events.
- `callback_secret`: secret used to verify UniPay callbacks.
- `active`: whether the merchant API key is enabled.

The merchant API key belongs only on the merchant's server. It must never be placed in browser JavaScript, HTML, the widget, or a mobile app.

The customer is not a merchant. The customer receives a short-lived `widget_token` for one order only.

## 2. System Roles

There are three distinct participants:

1. **Merchant website**: creates orders and fulfills products after a verified callback.
2. **UniPay service**: owns the order state, widget session, payment integrations, webhooks, and callback delivery.
3. **Customer**: uses the widget and supplies a payment, card code, or voucher PIN.

## 3. Payment Lifecycle

The normal lifecycle is:

```text
Merchant server
  -> POST /v1/orders with x-api-key
  <- order_id + widget_token

Merchant checkout page
  -> loads widget.js with widget_token
  -> customer chooses a payment method

Payment provider or manual review
  -> signed provider webhook or administrator resolution
  -> UniPay changes the order state

UniPay callback worker
  -> POST callback_url with HMAC signature

Merchant server
  -> verifies signature
  -> fulfills only on status COMPLETED
```

The order states currently used by the state machine are:

```text
CREATED -> AWAITING_PAYMENT -> DETECTED -> CONFIRMING -> COMPLETED
                                      \-> FAILED
CREATED/AWAITING_PAYMENT -> EXPIRED
CONFIRMING -> DISPUTED -> COMPLETED or FAILED
```

Do not fulfill from browser state, redirects, screenshots, or customer claims. Fulfill only after verifying the signed callback and checking `status === "COMPLETED"`.

## 4. Requirements

### Runtime requirements

- Node.js with built-in `fetch` support.
- PostgreSQL.
- A public HTTPS URL for provider webhooks in production.
- A public HTTPS callback URL for each merchant.
- Provider accounts and credentials for the rails you enable.

Redis is not required by the current callback worker. Callback jobs are stored and retried from PostgreSQL.

### Install and migrate

```bash
cd payment-service
npm install
cp .env.example .env
# edit .env
npm run migrate
npm start
```

Run the worker in a second process:

```bash
npm run worker
```

The worker handles callback delivery, expiry sweeps, and photo retention.

## 5. Environment Configuration

At minimum configure:

```env
PORT=5000
DATABASE_URL=postgres://user:password@host:5432/unipay
PUBLIC_BASE_URL=https://payments.example.com
ALLOWED_ORIGINS=https://shop.example.com,https://admin.example.com
ORDER_TTL_MINUTES=30
GIFT_CARD_PHOTO_TTL_DAYS=30
GIFT_CARD_CIPHER=<64-hex-character-key>
```

For self-hosted Bitcoin payments:

```env
LNBITS_URL=https://your-lnbits.example
LNBITS_API_KEY=<secret>
LNBITS_WEBHOOK_SECRET=<secret>
```

For Phoenixd:

```env
PHOENIXD_URL=http://phoenixd.internal:9740
PHOENIXD_PASSWORD=<secret>
PHOENIXD_WEBHOOK_SECRET=<secret>
```

For NOWPayments:

```env
NOWPAYMENTS_API_URL=https://api.nowpayments.io/v1
NOWPAYMENTS_API_KEY=<secret>
NOWPAYMENTS_IPN_SECRET=<secret>
```

WebAuthn/admin configuration should also be set in production:

```env
RP_ID=admin.example.com
ORIGIN=https://admin.example.com
```

Passkey registration and sign-in require a secure browser context. HTTPS is
required for deployed sites; the browser's `localhost` exception does not apply
to a LAN IP opened over HTTP. Use password sign-in for HTTP LAN testing, or
serve the admin PWA over HTTPS and set `RP_ID` and `ORIGIN` to that host.

Never commit `.env`. Rotate any credential that has been exposed or copied into logs, screenshots, chat, or source control.

`ALLOWED_ORIGINS` must contain the exact browser origins that embed the widget or use the API, including scheme and port. Do not use `*` with credentialed requests.

## 6. Merchant Integration With The Node SDK

The SDK is in `sdk/node/index.js`.

```js
const { UniPay } = require('/path/to/payment-service/sdk/node');

const pay = UniPay.init({
  apiKey: process.env.UNIPAY_API_KEY,
  baseUrl: 'https://payments.example.com',
});
```

Create an order from the merchant backend:

```js
const order = await pay.orders.create({
  product_id: 'vip-gold',
  amount_usd: 25.00,
  currency: 'USD',
  customer_ref: String(user.id),
  metadata: {
    plan: 'vip-gold',
  },
});

// Pass only this short-lived token to the checkout page.
res.render('checkout', {
  widgetToken: order.widget_token,
});
```

Accepted order fields:

- `product_id`: required string, maximum 128 characters.
- `amount_usd`: required positive number, maximum 1,000,000.
- `currency`: optional three-character currency code; defaults to `USD`.
- `customer_ref`: optional merchant-owned reference.
- `metadata`: optional JSON object. Do not place passwords, API keys, or unnecessary personal data here.

The order response contains `order_id`, status, amount fields, expiry, and `widget_token`.

Retrieve an order from the merchant backend:

```js
const order = await pay.orders.get(orderId);
```

## 7. Embed The Widget

On the merchant checkout page:

```html
<div id="unipay-checkout"></div>
<script src="https://payments.example.com/widget.js"></script>
<script>
  YourPay.mount('#unipay-checkout', {
    token: 'wt_...'
  });
</script>
```

The widget token is scoped to one order and expires. Never reuse it for another customer or order.

If the widget script is hosted on a different origin from the merchant page, add the merchant page origin to `ALLOWED_ORIGINS` on the payment service.

For local development:

```env
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Do not test an authenticated widget from a `file:` or `data:` page. Those pages have an origin that is not a normal merchant origin and commonly fail CORS preflight.

## 8. Merchant Callback Handling

When UniPay completes an order, it posts JSON to the merchant's `callback_url` with:

```text
X-Pay-Timestamp: unix timestamp
X-Pay-Signature: hex HMAC-SHA256
```

The signed message is:

```text
<timestamp>.<exact JSON request body>
```

Using the SDK middleware:

```js
const express = require('express');
const { verifyMiddleware } = require('/path/to/payment-service/sdk/node');

const app = express();
app.use(express.json());

app.post(
  '/payment-callback',
  verifyMiddleware(process.env.UNIPAY_CALLBACK_SECRET),
  async (req, res) => {
    const payment = req.body;

    if (payment.status === 'COMPLETED') {
      // Make fulfillment idempotent using payment.order_id.
      await fulfillOnce({
        orderId: payment.order_id,
        customerRef: payment.customer_ref,
        productId: payment.product_id,
        metadata: payment.metadata,
      });
    }

    res.json({ ok: true });
  },
);
```

Important callback rules:

- Store the callback secret only on the merchant server.
- Reject missing, stale, or invalid signatures.
- Make fulfillment idempotent because callbacks may be retried.
- Return a successful response only after the callback has been safely accepted.
- Do not trust `paid_amount`, metadata, or status without signature verification.

## 9. Payment Methods

### 9.1 LNbits Lightning

Customer flow:

1. Customer selects `Lightning Network`.
2. UniPay calls LNbits to create an invoice.
3. The widget displays the Lightning invoice.
4. Customer pays it.
5. LNbits calls `/webhooks/lnbits`.
6. UniPay verifies the provider signature and transitions the order.
7. UniPay queues a signed merchant callback in PostgreSQL.

Required settings:

- `LNBITS_URL`
- `LNBITS_API_KEY`
- `LNBITS_WEBHOOK_SECRET`
- `PUBLIC_BASE_URL`

The public callback URL must be reachable by LNbits.

### 9.2 Phoenix Bitcoin On-Chain

Customer flow:

1. Customer selects `Bitcoin On-Chain`.
2. UniPay requests an address from Phoenixd.
3. The widget displays the address.
4. Customer sends native BTC on-chain.
5. Phoenixd must send a signed event to `/webhooks/phoenixd`.
6. UniPay transitions the order and eventually sends the merchant callback.

Required settings:

- `PHOENIXD_URL`
- `PHOENIXD_PASSWORD`
- `PHOENIXD_WEBHOOK_SECRET`

Before production, verify that the Phoenixd webhook payload, signature format, and confirmation semantics match `src/routes/webhooks.js`. The address creation path exists; confirmation depends on the configured Phoenixd event integration.

### 9.3 NOWPayments Altcoins

Customer flow:

1. Customer chooses an asset and network.
2. UniPay creates a NOWPayments payment.
3. NOWPayments returns a deposit address.
4. The widget displays the address and network.
5. NOWPayments sends an IPN to `/webhooks/nowpayments`.
6. UniPay verifies the IPN signature and maps the provider status to the order state.
7. UniPay queues the signed merchant callback when completed.

Required settings:

- `NOWPAYMENTS_API_URL`
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`
- `PUBLIC_BASE_URL`

Test with a provider sandbox or a deliberately small amount before enabling production fulfillment.

### 9.4 Gift Cards

This is currently a manual-review rail, not an automated gift-card redemption integration.

Customer flow:

1. Customer chooses a supported brand.
2. Customer enters face value and selects physical-photo or e-code tier.
3. UniPay calculates a conversion quote.
4. Customer submits the code and optional photo.
5. UniPay encrypts the code and stores a pending review record.
6. An administrator verifies and redeems the card manually.
7. The administrator resolves the review as approved or rejected.
8. Only an approved/completed order triggers the merchant callback.

Current configured brands and rates are defined in `src/services/giftcards.js`.

The photo storage path is not a complete object-storage implementation yet. The code contains TODOs for EXIF stripping and private storage. Do not treat physical-card submissions as production-safe until those are implemented.

### 9.5 Voucher Submission

This is also currently a manual-review rail.

Customer flow:

1. Customer submits a 16-digit voucher PIN in the widget.
2. UniPay encrypts the PIN and stores a pending review record.
3. The submission appears in the admin review queue.
4. An administrator retrieves the voucher through the admin UI and redeems it manually.
5. The administrator clicks `Complete` or `Reject` in the admin UI.
6. `Complete` changes the order to `COMPLETED` and queues the signed merchant callback.

### 9.6 Card Guide

The card option does not process bank cards. It links the customer to external gift-card stores or crypto on-ramps. The customer then returns to the widget and pays with a gift card or cryptocurrency.

## 10. Provider Webhooks

UniPay exposes:

```text
POST /webhooks/lnbits
POST /webhooks/phoenixd
POST /webhooks/nowpayments
```

Provider webhook requirements:

- Use HTTPS in production.
- Configure the exact public URL with the provider.
- Configure the matching webhook secret.
- Do not bypass signature verification.
- Monitor `webhook_log` for invalid signatures and provider failures.

## 11. Callback Worker

Start it separately:

```bash
npm run worker
```

The worker polls `callbacks` for undelivered rows, sends signed callbacks, records attempts, and retries failures with backoff. PostgreSQL is the callback queue; Redis is not required.

Run one worker process per deployment unless you add explicit row-locking/claiming for multiple workers.

## 12. Local Verification Checklist

Health:

```bash
curl http://localhost:5000/health
```

Create an order from a merchant backend or SDK. Then verify:

- The response is HTTP `201`.
- A `widget_token` is returned.
- The widget config endpoint returns HTTP `200`.
- The widget status endpoint returns HTTP `200`.
- An invalid widget token returns HTTP `401`.
- Invalid payment input returns HTTP `400`.
- The browser page origin is listed in `ALLOWED_ORIGINS`.

When opening the admin PWA from another device on the LAN, include the exact
frontend origin (for example, `http://192.168.1.13:3000`) in `ALLOWED_ORIGINS`
alongside `http://localhost:3000` if both are used. Restart the payment service
after changing this setting. Do not use a wildcard origin.

Build checks:

```bash
npm run migrate
node --check src/server.js
npm run build # run from unipay-admin-pwa
```

For real provider tests, use sandbox credentials or a small test payment. Do not mark an order completed manually just to test the merchant callback unless the test is isolated from real fulfillment.

## 13. Deployment Checklist

Before production:

- Use PostgreSQL with backups and restricted network access.
- Run all migrations.
- Use HTTPS for the API, widget host, provider webhooks, and merchant callback URLs.
- Set exact `ALLOWED_ORIGINS` values.
- Set real `RP_ID` and `ORIGIN` for WebAuthn.
- Store secrets in a secret manager or protected environment variables.
- Rotate any credentials that were exposed during development.
- Configure LNbits, Phoenix, or NOWPayments only for the rails you will actually accept.
- Start the API and callback worker as supervised processes.
- Configure monitoring for failed callbacks, invalid webhooks, expired orders, and provider outages.
- Make merchant fulfillment idempotent.
- Test backup restoration and callback retry behavior.
- Do not enable gift-card or voucher fulfillment until manual review and secure photo handling are operational.

## 14. Current Limitations And Unimplemented Remnants

The following are not complete active integrations:

- Gift-card stacking is shown in the widget, but the backend currently enforces one active rail per order.
- `recordPartialPayment()` exists as an unused helper and is not the active settlement path.
- Phoenixd confirmation must be validated against the deployed Phoenixd webhook behavior.
- The admin frontend still needs production hardening and lint cleanup before being considered a production operations console.

## 15. Short Integration Summary

For a normal website integration:

1. Register the website as a merchant and store its API key and callback secret securely.
2. Initialize the Node SDK on the website backend.
3. Call `pay.orders.create(...)` when a customer starts checkout.
4. Render `widget.js` with the returned `widget_token`.
5. Add the website origin to UniPay `ALLOWED_ORIGINS`.
6. Expose a callback endpoint and verify it with `pay.webhooks.verify(...)`.
7. Fulfill the order exactly once when the verified callback says `COMPLETED`.
8. Run the UniPay API, PostgreSQL, migrations, and callback worker in deployment.
9. Test each enabled provider independently before accepting real customer payments.

UniPay can be deployed and used after these requirements are satisfied. LNbits and Phoenix require valid credentials and publicly reachable webhook URLs; gift-card and voucher rails require manual review operations and should not be advertised as automatic redemption.
