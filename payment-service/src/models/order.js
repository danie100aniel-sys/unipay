'use strict';
const db = require('../db');
const crypto = require('crypto');

/**
 * Creates a new order in the database.
 * Sets up initial balance fields for tracking split-payments.
 */
async function createOrder(site, { product_id, amount_usd, currency, customer_ref, metadata }) {
  const ttl = parseInt(process.env.ORDER_TTL_MINUTES || '30', 10);
  const orderId = `ord_${crypto.randomBytes(12).toString('base64url')}`;

  // 1. Insert order record with amount_paid initialized to 0 and remaining_balance set to full amount
  const { rows } = await db.query(
    `INSERT INTO orders (
      order_id,
      site_id,
      product_id,
      amount_usd,
      amount_paid_usd,
      remaining_balance_usd,
      currency,
      customer_ref,
      metadata,
      expires_at
    )
    VALUES ($1, $2, $3, $4, 0.00, $4, $5, $6, $7::jsonb, now() + ($8 || ' minutes')::interval)
    RETURNING order_id, status, amount_usd, amount_paid_usd, remaining_balance_usd, expires_at`,
    [
      orderId,
      site.site_id,
      product_id,
      amount_usd,
      currency || 'USD',
      customer_ref || null,
      JSON.stringify(metadata || {}),
      ttl
    ]
  );

  const order = rows[0];

  // 2. Record initial event in the audit trail
  await db.query(
    `INSERT INTO order_events (order_id, actor, event_type, from_status, to_status, payload)
     VALUES ($1, 'system', 'ORDER_CREATED', NULL, 'CREATED', $2::jsonb)`,
    [order.order_id, JSON.stringify({ product_id, amount_usd })]
  );

  return order;
}

/**
 * Retrieves an order by its unique ID.
 */
const getOrder = (orderId) =>
  db.query('SELECT * FROM orders WHERE order_id = $1', [orderId]).then(r => r.rows[0] || null);

/**
 * Generates a short-lived, single-order access token for the embedded checkout widget.
 */
async function createWidgetSession(orderId) {
  const token = 'wt_' + crypto.randomBytes(24).toString('base64url');

  await db.query(
    `INSERT INTO widget_sessions (token_hash, order_id, expires_at)
     VALUES ($1, $2, now() + interval '2 hours')`,
    [crypto.createHash('sha256').update(token).digest('hex'), orderId]
  );

  return token;
}

/**
 * SPLIT BALANCE ADDITION: Atomic Partial Payment Deductor
 * Called whenever a voucher, gift card, or partial crypto transaction is redeemed.
 * Atomically updates amounts, calculates new remaining balance, updates status,
 * and logs an immutable audit event.
 *
 * @param {string} orderId - Target order ID
 * @param {number} paymentAmountUsd - Dollar value of the redeemed card/voucher
 * @param {string} paymentType - e.g., 'voucher', 'amazon_gift_card', 'bitcoin'
 * @param {string} codeReference - Hashed PIN or transaction ID (prevents double spending)
 */
async function recordPartialPayment(orderId, paymentAmountUsd, paymentType, codeReference) {
  const client = await db.getClient(); // Obtain client from pool for transaction isolation
  try {
    await client.query('BEGIN');

    // 1. Fetch current order with row locking (FOR UPDATE) to prevent concurrency race conditions
    const res = await client.query('SELECT * FROM orders WHERE order_id = $1 FOR UPDATE', [orderId]);
    const order = res.rows[0];

    if (!order) throw new Error('ORDER_NOT_FOUND');
    if (order.status === 'PAID' || order.status === 'EXPIRED') {
      throw new Error(`ORDER_CANNOT_BE_PAID: Status is ${order.status}`);
    }

    // 2. Perform balance calculations
    const currentPaid = parseFloat(order.amount_paid_usd || 0);
    const totalRequired = parseFloat(order.amount_usd);
    const newPaid = currentPaid + parseFloat(paymentAmountUsd);
    const newRemaining = Math.max(0, totalRequired - newPaid);

    // 3. Determine new status: 'PAID' if remaining is zero, otherwise 'PARTIALLY_PAID'
    const newStatus = newRemaining === 0 ? 'PAID' : 'PARTIALLY_PAID';
    const oldStatus = order.status;

    // 4. Update the order record atomically
    const updateRes = await client.query(
      `UPDATE orders
       SET amount_paid_usd = $1,
           remaining_balance_usd = $2,
           status = $3,
           updated_at = now()
       WHERE order_id = $4
       RETURNING order_id, status, amount_usd, amount_paid_usd, remaining_balance_usd`,
      [newPaid, newRemaining, newStatus, orderId]
    );

    // 5. Audit event payload
    const eventPayload = {
      payment_type: paymentType,
      amount_applied: paymentAmountUsd,
      code_ref_hash: crypto.createHash('sha256').update(codeReference).digest('hex'),
      previous_balance: order.remaining_balance_usd,
      new_balance: newRemaining
    };

    // 6. Record immutable event log
    await client.query(
      `INSERT INTO order_events (order_id, actor, event_type, from_status, to_status, payload)
       VALUES ($1, 'payment_service', 'PARTIAL_PAYMENT_RECEIVED', $2, $3, $4::jsonb)`,
      [orderId, oldStatus, newStatus, JSON.stringify(eventPayload)]
    );

    await client.query('COMMIT');
    return updateRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createOrder,
  getOrder,
  createWidgetSession,
  recordPartialPayment
};