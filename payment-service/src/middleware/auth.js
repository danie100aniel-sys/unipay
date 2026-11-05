'use strict';
const crypto = require('crypto');
const db = require('../db');

/** Server-to-server: website backends present x-api-key (hashed at rest). */
async function merchantAuth(req, res, next) {
  try {
    const key = req.headers['x-api-key'];
    if (!key) return res.status(401).json({ error: 'missing x-api-key' });
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const { rows } = await db.query(
      'SELECT * FROM merchant_keys WHERE api_key_hash = $1 AND active', [hash]);
    if (!rows.length) return res.status(401).json({ error: 'invalid api key' });
    req.site = rows[0];
    next();
  } catch (e) { next(e); }
}

/** Browser-side: widget presents its single-order bearer token. */
async function widgetAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ error: 'missing widget token' });
    const { rows } = await db.query(
      `SELECT o.* FROM widget_sessions ws JOIN orders o ON o.order_id = ws.order_id
       WHERE ws.token_hash = $1 AND ws.expires_at > now()`,
      [crypto.createHash('sha256').update(token).digest('hex')]);
    if (!rows.length) return res.status(401).json({ error: 'invalid or expired widget token' });
    req.order = rows[0];
    next();
  } catch (e) { next(e); }
}

module.exports = { merchantAuth, widgetAuth };
