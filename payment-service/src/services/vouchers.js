'use strict';
/** Voucher rail — PIN -> encrypted record -> administrator review. */
const crypto = require('crypto');
const giftcards = require('./giftcards');
const db = require('../db');

async function redeem(order, fields) {
  // Generate a local manual tracking reference instead of an API placeholder
  const redemptionRef = `VOUCHER-MANUAL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  // Encrypt the PIN for secure storage, and insert it with a PENDING_REVIEW state
  await db.query(
    `INSERT INTO vouchers (order_id, pin_encrypted, rail, reference, redemption_ref, status)
     VALUES ($1,$2,$3,$4,$4,'PENDING_REVIEW')`,
    [order.order_id, giftcards.encrypt(fields.pin), fields.rail, redemptionRef]);

  return { redemption_ref: redemptionRef };
}

module.exports = { redeem };