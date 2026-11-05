'use strict';
/**
 * Server-side SDK for website backends. The secret key NEVER leaves the server.
 *
 *   const pay = UniPay.init({ apiKey: 'sk_live_site2_...', baseUrl: 'https://pay.yourdomain.com' });
 *
 *   // at checkout:
 *   const order = await pay.orders.create({ product_id: 'vip-gold', amount_usd: 150, customer_ref: 'user_5521' });
 *   // → { order_id, widget_token, expires_at } → mount the widget with widget_token
 *
 *   // fulfillment (this runs even if the payer closed the tab):
 *   app.post('/payment-callback', pay.webhooks.verify('YOUR_CALLBACK_SECRET'), (req, res) => {
 *     if (req.body.status === 'COMPLETED') upgradeUser(req.body.customer_ref, req.body.metadata);
 *     res.json({ ok: true });
 *   });
 */
const crypto = require('crypto');

class UniPay {
  static init({ apiKey, baseUrl }) { return new UniPay(apiKey, baseUrl); }

  constructor(apiKey, baseUrl) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.orders = {
      create: (body) => this._post('/v1/orders', body),
      get:    (id)   => this._get(`/v1/orders/${id}`),
    };
    this.webhooks = { verify: (secret) => verifyMiddleware(secret) };
  }

  async _post(path, body) {
    const r = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`unipay ${r.status}: ${await r.text()}`);
    return r.json();
  }

  async _get(path) {
    const r = await fetch(this.baseUrl + path, { headers: { 'x-api-key': this.apiKey } });
    if (!r.ok) throw new Error(`unipay ${r.status}: ${await r.text()}`);
    return r.json();
  }
}

/** Express middleware — fulfillment happens ONLY on a verified signature. */
function verifyMiddleware(secret) {
  return (req, res, next) => {
    const ts = req.headers['x-pay-timestamp'];
    const sig = req.headers['x-pay-signature'];
    if (!ts || !sig) return res.status(401).json({ error: 'missing signature headers' });
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.status(401).json({ error: 'stale callback' });
    const expected = crypto.createHmac('sha256', secret).update(`${ts}.${JSON.stringify(req.body)}`).digest('hex');
    const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return res.status(401).json({ error: 'invalid callback signature' });
    next();   // req.body is the verified payload
  };
}

module.exports = { UniPay, verifyMiddleware };
