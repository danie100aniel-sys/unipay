'use strict';

const db = require('./db');
const { sendAdminNotification } = require('./services/notifications');

const TRANSITIONS = Object.freeze({
  CREATED: ['AWAITING_PAYMENT'],
  AWAITING_PAYMENT: ['DETECTED', 'COMPLETED', 'EXPIRED', 'FAILED'],
  DETECTED: ['CONFIRMING', 'FAILED'],
  CONFIRMING: ['COMPLETED', 'DISPUTED', 'FAILED'],
  DISPUTED: ['COMPLETED', 'FAILED'],
});

const TERMINAL = Object.freeze(['COMPLETED', 'EXPIRED', 'FAILED']);

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);
const isTerminal = (s) => TERMINAL.includes(s);

async function transition(orderId, to, opts = {}) {
  const ownClient = !opts.client;
  const client = opts.client || (await db.connect());
  const actor = opts.actor || 'system';
  const eventType = opts.eventType || to;
  const payload = JSON.stringify(opts.payload || {});
  const railRef = opts.railRef || null;

  try {
    if (ownClient) await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT status, site_id, amount_usd FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (!rows.length) throw Object.assign(new Error('order not found'), { code: 'ORDER_NOT_FOUND' });

    const from = rows[0].status;
    const siteId = rows[0].site_id;
    const amountUsd = rows[0].amount_usd;

    if (isTerminal(from)) {
      throw Object.assign(new Error(`order already terminal (${from})`), { code: 'TERMINAL_STATE' });
    }
    if (!canTransition(from, to)) {
      throw Object.assign(new Error(`illegal transition ${from} -> ${to}`), { code: 'ILLEGAL_TRANSITION' });
    }

    const guarded = await client.query(
      `UPDATE orders
          SET status       = $2,
              updated_at   = now(),
              completed_at = CASE WHEN $2 = 'COMPLETED' THEN now() ELSE completed_at END,
              rail_ref     = COALESCE($3, rail_ref)
        WHERE order_id = $1 AND status = $4`,
      [orderId, to, railRef, from]);

    if (guarded.rowCount !== 1) {
      throw Object.assign(new Error('concurrent status change — re-read and retry'),
        { code: 'CONCURRENT_UPDATE' });
    }

    await client.query(
      `INSERT INTO order_events (order_id, actor, event_type, from_status, to_status, payload, rail_ref)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [orderId, actor, eventType, from, to, payload, railRef]);

    if (ownClient) await client.query('COMMIT');

    // Trigger push notification to all administrators on critical state transitions
    if (to === 'DISPUTED') {
      sendAdminNotification('⚠️ Order Disputed', `Order ${orderId} on site ${siteId} ($${amountUsd}) requires manual review.`, '/admin/', 'all');
    } else if (to === 'COMPLETED' && actor === 'admin') {
      sendAdminNotification('✅ Order Resolved', `Order ${orderId} was approved and completed.`, '/admin/', 'all');
    } else if (to === 'DETECTED') {
      sendAdminNotification('🔍 Payment Detected', `Incoming payment detected for order ${orderId} ($${amountUsd}).`, '/admin/', 'all');
    }

    return { from, to };
  } catch (err) {
    if (ownClient) await client.query('ROLLBACK').catch(() => { });
    throw err;
  } finally {
    if (ownClient) client.release();
  }
}

async function selectRail(orderId, method, payment) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT status FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    if (!rows.length) throw Object.assign(new Error('order not found'), { code: 'ORDER_NOT_FOUND' });
    if (rows[0].status !== 'CREATED') {
      throw Object.assign(new Error('rail already selected — one active rail per order'),
        { code: 'RAIL_LOCKED' });
    }

    await client.query(
      `INSERT INTO payments (order_id, method, rail_ref, address, expected_amount, expected_asset, quote)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [orderId, method,
        payment.railRef || null, payment.address || null,
        payment.expectedAmount || null, payment.expectedAsset || null,
        JSON.stringify({
          ...(payment.quote || {}),
          ...(Number.isFinite(Number(payment.amount_sats)) && payment.amount_sats != null
            ? { amount_sats: Number(payment.amount_sats) }
            : {})
        })]);

    await transition(orderId, 'AWAITING_PAYMENT', {
      actor: 'system', eventType: 'METHOD_SELECTED', payload: { method },
      railRef: payment.railRef || null, client,
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { transition, selectRail, canTransition, isTerminal, TRANSITIONS, TERMINAL };