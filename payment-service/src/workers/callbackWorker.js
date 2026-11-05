'use strict';
/**
 * Delivers signed callbacks from the PostgreSQL callbacks table. Failure is
 * expected (sites go down), so rows are retried with exponential backoff.
 */
const db = require('../db');
const { assertPublicCallbackUrl } = require('../utils/networkSafety');

const MAX_ATTEMPTS = 8;
const backoffMs = (attempt) => Math.min(60_000 * 2 ** attempt, 60 * 60 * 1000); // 1m,2m,4m...1h cap

async function deliver(callbackId) {
  const { rows: [cb] } = await db.query(
    `SELECT c.*, m.callback_url
       FROM callbacks c
       JOIN merchant_keys m ON m.site_id = c.site_id
      WHERE c.id = $1`, [callbackId]);
  if (!cb || cb.delivered_at) return;                       // already delivered or gone

  let ok = false, status = 0;
  try {
    const body = cb.body_text || JSON.stringify(cb.body);
    const ts = cb.callback_ts || Math.floor(new Date(cb.created_at).getTime() / 1000).toString();
    const callbackUrl = await assertPublicCallbackUrl(cb.callback_url);
    const res = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pay-timestamp': ts,
        'x-pay-signature': cb.signature,
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    ok = res.ok;
    status = res.status;
  } catch { ok = false; }

  await db.query(
    `UPDATE callbacks SET attempts = attempts + 1,
            delivered_at = CASE WHEN $2 THEN now() ELSE NULL END,
            next_attempt_at = CASE WHEN $2 THEN next_attempt_at
                                   ELSE now() + ($3 || ' milliseconds')::interval END
      WHERE id = $1`,
    [callbackId, ok, backoffMs(cb.attempts + 1)]);

  if (!ok && cb.attempts + 1 >= MAX_ATTEMPTS) {
    console.error(`callback ${callbackId} exhausted retries (site ${cb.site_id}, http ${status})`);
  }
}

async function pollOnce() {
  const { rows } = await db.query(
    `SELECT id FROM callbacks
      WHERE delivered_at IS NULL
        AND attempts < $1
        AND next_attempt_at <= now()
      ORDER BY next_attempt_at, created_at
      LIMIT 20`, [MAX_ATTEMPTS]);
  for (const callback of rows) {
    await deliver(callback.id);
  }
}

function start() {
  setInterval(() => pollOnce().catch((e) => console.error('callbackWorker', e.message)), 5000);
  pollOnce().catch((e) => console.error('callbackWorker', e.message));
}
module.exports = { start, pollOnce };
