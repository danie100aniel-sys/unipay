'use strict';
/**
 * OUTBOUND signed callbacks — the fulfillment signal to the originating website.
 * Payload: { order_id, status, paid_amount, paid_asset, metadata, site stuff }
 * Header:  X-Pay-Timestamp + X-Pay-Signature = HMAC_SHA256(secret, `${ts}.${body}`)
 * The receiving site's SDK verifies this — fulfillment NEVER happens on an
 * unverified callback (else anyone can POST fake "COMPLETED" and steal goods).
 */
const crypto = require('crypto');
const db = require('../db');

async function queueCallback(orderId, client = db) {
  const { rows: [order] } = await client.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
  const { rows: [site] } = await client.query('SELECT * FROM merchant_keys WHERE site_id = $1', [order.site_id]);
  const { rows: [pay] } = await client.query(
    'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1', [orderId]);

  const body = JSON.stringify({
    order_id: order.order_id, status: order.status,
    paid_amount: pay?.paid_amount || null, paid_asset: order.paid_asset,
    tx_ref: pay?.rail_ref || null,
    product_id: order.product_id, amount_usd: order.amount_usd,
    customer_ref: order.customer_ref, metadata: order.metadata,
  });

  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac('sha256', site.callback_secret)
    .update(`${ts}.${body}`).digest('hex');

  const { rows: [{ id: callbackId }] } = await client.query(
    `INSERT INTO callbacks (order_id, site_id, body, body_text, callback_ts, signature)
    VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING id`,
    [orderId, order.site_id, body, body, ts, signature]);
  return callbackId;
}

module.exports = { queueCallback };
