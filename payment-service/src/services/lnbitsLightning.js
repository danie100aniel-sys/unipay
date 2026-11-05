'use strict';
const config = require('../config');

async function api(path, method = 'GET', body) {
  const res = await fetch(`${config.lnbits.url}/api/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'X-Api-Key': config.lnbits.apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`lnbits lightning error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function usdToSats(usd) {
  const res = await fetch(`${config.lnbits.url}/api/v1/rate/usd`);
  if (!res.ok) throw new Error('lnbits rate feed unavailable');
  const usdPerBtc = parseFloat(await res.text());
  return Math.max(1, Math.round((usd / usdPerBtc) * 1e8));
}

async function createInvoice(order) {
  const amount = await usdToSats(order.amount_usd);
  const inv = await api('/payments', 'POST', {
    out: false,
    amount,
    memo: `Order ${order.order_id.slice(0, 8)}`,
    unit: 'sat',
    webhook: `${process.env.PUBLIC_BASE_URL}/webhooks/lnbits`,
    extra: { order_id: order.order_id },
  });
  return {
    railRef: inv.payment_hash,
    address: inv.payment_request, // BOLT11 string
    expectedAmount: order.amount_usd,
    expectedAsset: 'BTC_LN',
    amount_sats: amount,
    quote: {
      amount_sats: amount,
      usd_amount: Number(order.amount_usd),
    },
  };
}

async function lookupPayment(paymentHash) {
  const pay = await api(`/payments/${paymentHash}`);
  return {
    settled: pay.pending === false,
    amountSats: pay.amount / 1000,
    memo: pay.memo,
  };
}

module.exports = { createInvoice, lookupPayment };