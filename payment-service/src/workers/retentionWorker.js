// src/workers/retentionWorker.js
'use strict';
const db = require('../db');
const ttlDays = parseInt(process.env.GIFT_CARD_PHOTO_TTL_DAYS || '30', 10);
async function purgeOnce() {
  const { rows } = await db.query(
    `UPDATE giftcards SET photo_ref = NULL, photo_deleted_at = now()
      WHERE photo_ref IS NOT NULL AND photo_deleted_at IS NULL
        AND escrow_state IN ('RELEASED','REJECTED')
        AND created_at < now() - ($1 || ' days')::interval
      RETURNING order_id`, [ttlDays]);
  for (const { order_id } of rows) console.log(`photo purged for order ${order_id} (sha256 retained)`);
}
function start() {
  setInterval(() => purgeOnce().catch((e) => console.error('retentionWorker', e.message)), 3600000);
  purgeOnce().catch((e) => console.error('retentionWorker', e.message));
}
module.exports = { start };