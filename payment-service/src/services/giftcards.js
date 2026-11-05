'use strict';
/**
 * Rail 3 — gift cards. Code (+photo) -> Internal manual escrow queue -> 
 * Admin reviews/redeems manually -> Order marked completed.
 * Photo rules: EXIF stripped, private storage, signed URLs, image deleted after
 * resolution (photo_sha256 kept forever for audit).
 */
const crypto = require('crypto');
const db = require('../db');

const KEY = Buffer.from(process.env.GIFT_CARD_CIPHER || crypto.randomBytes(32).toString('hex'), 'hex');

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

function decrypt(value) {
  const [ivText, tagText, encryptedText] = String(value).split('.');
  if (!ivText || !tagText || !encryptedText) throw new Error('invalid encrypted value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivText, 'base64'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** brand-specific code format pre-check BEFORE any submission locks */
const CODE_PATTERNS = {
  AMAZON: /^[A-Z0-9]{14}$/,
  APPLE: /^[A-Z0-9]{16}$/,
  STEAM: /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/,
};
function validCode(brand, code) {
  return (CODE_PATTERNS[brand] || /^[A-Z0-9-]{8,32}$/).test(code.trim().toUpperCase());
}

async function rateTable() {
  return {   // server-side config only — the widget never carries percentages
    PHOTO_RATE: { AMAZON: 0.84, APPLE: 0.82, STEAM: 0.78 },
    ECODE_RATE: { AMAZON: 0.71, APPLE: 0.69, STEAM: 0.65 },
  };
}

async function quote(brand, faceValueUsd, tier) {
  const rate = (await rateTable())[tier]?.[brand.toUpperCase()];
  if (!rate) throw Object.assign(new Error('unsupported brand/tier'), { status: 400 });
  return { credit_usd: +(faceValueUsd * rate).toFixed(2), rate, valid_until: new Date(Date.now() + 5 * 60 * 1000).toISOString() };
}

async function lockQuote(order, fields) {
  const q = await quote(fields.brand, fields.face_value_usd, fields.tier);
  if (q.credit_usd < order.amount_usd) {
    throw Object.assign(new Error(`card credit $${q.credit_usd} is below the $${order.amount_usd} due`), { status: 400 });
  }
  return q;
}

async function storeSubmission(order, fields, file) {
  const brand = fields.brand.toUpperCase();
  if (!validCode(brand, fields.code)) {
    throw Object.assign(new Error(`that doesn't look like a ${brand} code — check and retry`), { status: 400 });
  }

  let photoRef = null, photoSha = null;
  if (file) {
    // TODO: strip EXIF (sharp/exiftool) before hashing + storage
    photoSha = crypto.createHash('sha256').update(file.buffer).digest('hex');
    photoRef = `gc/${order.order_id}/${photoSha.slice(0, 16)}.jpg`;
    // TODO: put to private bucket, private ACL, signed-url getter only
  }

  // Generate an internal tracking reference for the manual admin review queue
  const tradeRef = `GC-MANUAL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  // Save the submission as pending review in the database
  await db.query(
    `INSERT INTO giftcards (
       order_id, brand, face_value_usd, encrypted_code, code_encrypted,
       photo_ref, photo_hash, photo_sha256, tier, escrow_state
     ) VALUES ($1,$2,$3,$4,$4,$5,$6,$6,$7,'PENDING_REVIEW')`,
    [order.order_id, brand, fields.face_value_usd, encrypt(fields.code.trim()), photoRef, photoSha, fields.tier]);

  return { tradeRef };
}

module.exports = { rateTable, quote, lockQuote, storeSubmission, encrypt, decrypt, validCode };