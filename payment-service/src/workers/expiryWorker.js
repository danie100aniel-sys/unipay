// src/workers/expiryWorker.js
'use strict';
const db = require('../db');
const { transition } = require('../stateMachine');
async function sweepOnce() {
  const { rows } = await db.query(
    `SELECT order_id FROM orders WHERE status IN ('CREATED','AWAITING_PAYMENT')
       AND expires_at < now() LIMIT 200`);
  for (const { order_id } of rows) {
    try { await transition(order_id, 'EXPIRED', { actor: 'system', eventType: 'ORDER_EXPIRED' }); }
    catch (e) {
      if (e.code === 'TERMINAL_STATE' || e.code === 'ILLEGAL_TRANSITION') continue;
      console.error('expiry sweep', order_id, e.message);
    }
  }
}
function start() {
  setInterval(() => sweepOnce().catch((e) => console.error('expiryWorker', e.message)), 30000);
  sweepOnce().catch((e) => console.error('expiryWorker', e.message));
}
module.exports = { start };