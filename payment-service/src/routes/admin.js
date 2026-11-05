'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db');
const { transition } = require('../stateMachine');
const { queueCallback } = require('../services/callbacks');
const { sendAdminNotification } = require('../services/notifications');
const paymentEvents = require('../services/events'); // 🔥 Added Event Emitter
const giftcards = require('../services/giftcards');
const { assertPublicCallbackUrl } = require('../utils/networkSafety');

const router = express.Router();

const verifyAdminToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'] || '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  const token = rawToken;

  if (!token) {
    const err = new Error('Unauthorized: No admin session token provided');
    err.status = 401;
    return next(err);
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const { rows } = await db.query(
      `SELECT u.admin_id, u.username, u.role, u.lock_timeout_minutes, u.is_active 
       FROM admin_sessions s
       JOIN admin_users u ON s.admin_id = u.admin_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
      [tokenHash]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      const err = new Error('Unauthorized: Invalid or expired admin session');
      err.status = 401;
      return next(err);
    }

    req.admin = rows[0];
    next();
  } catch (e) {
    next(e);
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.admin || req.admin.role !== 'superadmin') {
    const err = new Error('Forbidden: Superadmin access required');
    err.status = 403;
    return next(err);
  }
  next();
};


router.post('/merchants/:siteId/rotate-key', verifyAdminToken, requireSuperAdmin, async (req, res, next) => {
  const { siteId } = req.params;

  try {
    const existing = await db.query(
      `SELECT site_id, display_name, callback_url, active
       FROM merchant_keys
       WHERE site_id = $1`,
      [siteId]
    );

    if (!existing.rows.length) {
      const err = new Error(`Merchant with site_id '${siteId}' not found`);
      err.status = 404;
      return next(err);
    }

    const apiKey = `up_${crypto.randomBytes(32).toString('hex')}`;

    const apiKeyHash = crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');

    const { rows } = await db.query(
      `UPDATE merchant_keys
       SET api_key_hash = $1
       WHERE site_id = $2
       RETURNING site_id, display_name, callback_url, active, created_at`,
      [apiKeyHash, siteId]
    );

    const merchant = rows[0];

    await db.query(
      `INSERT INTO admin_activities
        (admin_id, username, action_type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.admin.admin_id,
        req.admin.username,
        'MERCHANT_API_KEY_ROTATED',
        `Admin '${req.admin.username}' rotated the API key for merchant '${siteId}'.`,
        JSON.stringify({
          site_id: siteId,
        }),
      ]
    );

    res.status(200).json({
      success: true,
      merchant: {
        ...merchant,
        api_key: apiKey,
      },
    });
  } catch (e) {
    next(e);
  }
});





/**
 * 6. Track SDK Open / Purchase Intent (Public Route)
 */
router.post('/sdk/opened', async (req, res, next) => {
  const { site_id, item_type, amount_usd } = req.body;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

  try {
    const description = `Client opened payment SDK for ${item_type || 'Product'} (${amount_usd ? `$${amount_usd}` : 'Custom Amount'})`;

    await db.query(
      `INSERT INTO admin_activities (action_type, description, metadata) 
       VALUES ($1, $2, $3)`,
      ['SDK_OPENED', description, JSON.stringify({ site_id, item_type, amount_usd, ip: clientIp })]
    );

    sendAdminNotification(
      '🛒 Checkout Started',
      description,
      '/admin/',
      'all'
    );

    paymentEvents.emit('admin_liveliness_feed', {
      type: 'SDK_OPENED',
      site_id,
      item_type,
      amount_usd,
      ip: clientIp,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, message: 'Activity logged and notification dispatched' });
  } catch (e) {
    next(e);
  }
});

router.post('/auth/login', async (req, res, next) => {
  const { username, password } = req.body;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown device';

  if (!username || !password) {
    const err = new Error('Username and password required');
    err.status = 400;
    return next(err);
  }

  try {
    const { rows } = await db.query(
      `SELECT admin_id, username, password_hash, role, lock_timeout_minutes, is_active FROM admin_users WHERE username = $1`,
      [username]
    );

    if (rows.length === 0 || !rows[0].is_active) {
      sendAdminNotification('🚨 Failed Admin Login Attempt', `Failed login attempt for username '${username}' from IP ${clientIp}.`, '/admin/', 'superadmin');
      const err = new Error('Invalid credentials or inactive account');
      err.status = 401;
      return next(err);
    }

    const admin = rows[0];
    const passwordValid = await bcrypt.compare(password, admin.password_hash);
    if (!passwordValid) {
      sendAdminNotification('🚨 Failed Admin Login Attempt', `Incorrect password for admin '${username}' from IP ${clientIp}.`, '/admin/', 'superadmin');
      const err = new Error('Invalid credentials');
      err.status = 401;
      return next(err);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, $3)`,
      [tokenHash, admin.admin_id, expiresAt]
    );

    await db.query(
      `INSERT INTO admin_activities (admin_id, username, action_type, description, metadata) 
       VALUES ($1, $2, $3, $4, $5)`,
      [
        admin.admin_id,
        admin.username,
        'LOGIN',
        `Admin '${admin.username}' logged in successfully.`,
        JSON.stringify({ ip: clientIp, userAgent })
      ]
    );

    if (admin.role !== 'superadmin') {
      sendAdminNotification('👤 Admin Logged In', `Admin '${username}' logged in successfully using ${userAgent} from IP ${clientIp}.`, '/admin/', 'superadmin');
    }

    res.json({
      success: true,
      token,
      admin: {
        username: admin.username,
        role: admin.role,
        lock_timeout_minutes: admin.lock_timeout_minutes
      }
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// PROTECTED ADMIN ROUTES (Require Authentication)
// ==========================================
router.use(verifyAdminToken);

// ==========================================
// MERCHANT MANAGEMENT
// ==========================================

router.post('/merchants', requireSuperAdmin, async (req, res, next) => {
  const {
    site_id,
    display_name,
    callback_url,
  } = req.body;

  if (!site_id || !display_name || !callback_url) {
    const err = new Error('site_id, display_name, and callback_url are required');
    err.status = 400;
    return next(err);
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(site_id)) {
    const err = new Error(
      'site_id may contain only letters, numbers, hyphens, and underscores'
    );
    err.status = 400;
    return next(err);
  }

  try {
    callback_url = await assertPublicCallbackUrl(callback_url);
  } catch (e) {
    e.status = 400;
    return next(e);
  }

  try {
    const existing = await db.query(
      `SELECT site_id FROM merchant_keys WHERE site_id = $1`,
      [site_id]
    );

    if (existing.rows.length > 0) {
      const err = new Error(
        `Merchant with site_id '${site_id}' already exists`
      );
      err.status = 409;
      return next(err);
    }

    const apiKey = `up_${crypto.randomBytes(32).toString('hex')}`;
    const callbackSecret = `ucs_${crypto.randomBytes(32).toString('hex')}`;

    const apiKeyHash = crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');

    const { rows } = await db.query(
      `INSERT INTO merchant_keys
        (site_id, display_name, api_key_hash, callback_secret, callback_url, active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING site_id, display_name, callback_url, active, created_at`,
      [
        site_id,
        display_name,
        apiKeyHash,
        callbackSecret,
        callback_url,
      ]
    );

    const merchant = rows[0];

    await db.query(
      `INSERT INTO admin_activities
        (admin_id, username, action_type, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.admin.admin_id,
        req.admin.username,
        'MERCHANT_CREATED',
        `Admin '${req.admin.username}' created merchant '${site_id}'.`,
        JSON.stringify({
          site_id,
          display_name,
          callback_url,
        }),
      ]
    );

    res.status(201).json({
      success: true,
      merchant: {
        ...merchant,
        api_key: apiKey,
        callback_secret: callbackSecret,
      },
    });
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error(
        `Merchant with site_id '${site_id}' already exists`
      );
      err.status = 409;
      return next(err);
    }

    next(e);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    await db.query('DELETE FROM admin_sessions WHERE token_hash = $1', [crypto.createHash('sha256').update(token).digest('hex')]);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.get('/users', requireSuperAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT admin_id, username, role, lock_timeout_minutes, is_active, created_at FROM admin_users ORDER BY created_at DESC`
    );
    res.json({ success: true, users: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/users', requireSuperAdmin, async (req, res, next) => {
  const { username, password, role = 'admin', lock_timeout_minutes = 3 } = req.body;
  if (!username || !password) {
    const err = new Error('Username and password are required');
    err.status = 400;
    return next(err);
  }

  try {
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const { rows } = await db.query(
      `INSERT INTO admin_users (username, password_hash, role, lock_timeout_minutes)
       VALUES ($1, $2, $3, $4)
       RETURNING admin_id, username, role, lock_timeout_minutes, created_at`,
      [username, passwordHash, role, lock_timeout_minutes]
    );

    sendAdminNotification('🛡️ New Admin Account Created', `Superadmin '${req.admin.username}' created new ${role} account: '${username}'.`, '/admin/', 'superadmin');

    res.status(201).json({ success: true, admin: rows[0] });
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error('Username already exists');
      err.status = 409;
      return next(err);
    }
    next(e);
  }
});

router.put('/users/:id/password', requireSuperAdmin, async (req, res, next) => {
  const { newPassword } = req.body;
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 12) {
    const err = new Error('New password must be at least 12 characters');
    err.status = 400;
    return next(err);
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const { rows } = await db.query(
      `UPDATE admin_users SET password_hash = $1 WHERE admin_id = $2 RETURNING admin_id, username`,
      [passwordHash, req.params.id]
    );
    if (!rows.length) {
      const err = new Error('Admin user not found');
      err.status = 404;
      return next(err);
    }
    res.json({ success: true, user: rows[0] });
  } catch (e) {
    next(e);
  }
});

// 🔥 SSE Stream endpoint for the Admin Dashboard UI
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

  const activityListener = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  paymentEvents.on('admin_liveliness_feed', activityListener);

  const heartbeat = setInterval(() => {
    res.write(`:ping\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    paymentEvents.off('admin_liveliness_feed', activityListener);
  });
});

router.get('/profile', (req, res) => {
  res.json({
    success: true,
    admin: {
      username: req.admin.username,
      role: req.admin.role,
      lock_timeout_minutes: req.admin.lock_timeout_minutes
    }
  });
});

router.get('/orders', async (req, res, next) => {
  try {
    const { site_id, status, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT o.*, m.display_name as site_name 
      FROM orders o
      JOIN merchant_keys m ON o.site_id = m.site_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (site_id) {
      query += ` AND o.site_id = $${paramIndex++}`;
      params.push(site_id);
    }
    if (status) {
      query += ` AND o.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(Number(limit), Number(offset));

    const { rows } = await db.query(query, params);
    res.json({ success: true, count: rows.length, orders: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/review/queue', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        ar.order_id,
        ar.reason,
        ar.opened_at,
        o.site_id,
        o.amount_usd,
        o.client_ip,
        o.region,
        o.status as order_status,
        g.brand as giftcard_brand,
        g.face_value_usd,
        g.encrypted_code,
        g.photo_hash,
        v.rail as voucher_rail
      FROM admin_review ar
      JOIN orders o ON ar.order_id::text = o.order_id
      LEFT JOIN giftcards g ON o.order_id = g.order_id
      LEFT JOIN vouchers v ON o.order_id = v.order_id
      WHERE ar.resolved_at IS NULL
      ORDER BY ar.opened_at ASC;
    `);
    res.json({ success: true, queue: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/review/:orderId/resolve', async (req, res, next) => {
  const { orderId } = req.params;
  const { resolution, note } = req.body;

  if (!['APPROVED', 'REJECTED'].includes(resolution)) {
    const err = new Error("Invalid resolution value. Must be 'APPROVED' or 'REJECTED'.");
    err.status = 400;
    return next(err);
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE admin_review 
       SET resolution = $1, resolved_at = NOW()
      WHERE order_id = $2`,
      [note ? `${resolution}: ${note}` : resolution, orderId]
    );

    const targetStatus = resolution === 'APPROVED' ? 'COMPLETED' : 'FAILED';

    await transition(orderId, targetStatus, {
      actor: 'admin',
      eventType: `MANUAL_REVIEW_${resolution}`,
      payload: { note, resolved_by: req.admin.username }
    });

    sendAdminNotification(
      `💼 Order ${resolution}`,
      `Admin '${req.admin.username}' manually ${resolution.toLowerCase()} order ${orderId}.${note ? ` Note: ${note}` : ''}`,
      '/admin/',
      'superadmin'
    );

    await client.query('COMMIT');

    if (resolution === 'APPROVED') {
      await queueCallback(orderId);
    }

    paymentEvents.emit(`payment_update_${orderId}`, {
      status: targetStatus,
      resolution_note: note
    });

    res.json({ success: true, orderId, status: targetStatus });
  } catch (e) {
    await client.query('ROLLBACK');
    next(e);
  } finally {
    client.release();
  }
});

router.post('/push/subscribe', async (req, res, next) => {
  try {
    const subscription = req.body;
    await db.query(
      `INSERT INTO admin_push_subscriptions (admin_id, subscription) VALUES ($1::uuid, $2)`,
      [req.admin.admin_id, JSON.stringify(subscription)]
    );
    res.json({ success: true, message: 'Push subscription registered successfully' });
  } catch (e) {
    next(e);
  }
});

router.get('/logs/webhooks', async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    const { rows } = await db.query(
      `SELECT id, provider, signature_valid, order_id, processed_at, created_at 
       FROM webhook_log 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [Number(limit)]
    );
    res.json({ success: true, logs: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/giftcards', async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, brand } = req.query;
    let query = `
      SELECT g.*, o.site_id, o.status as order_status, o.amount_usd, o.client_ip, o.region, o.created_at as order_created_at
      FROM giftcards g
      JOIN orders o ON g.order_id = o.order_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (brand) {
      query += ` AND g.brand ILIKE $${paramIndex++}`;
      params.push(`%${brand}%`);
    }

    query += ` ORDER BY g.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(Number(limit), Number(offset));

    const { rows } = await db.query(query, params);
    res.json({ success: true, count: rows.length, giftcards: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/giftcards/:id/audit', async (req, res, next) => {
  const { id } = req.params;
  const { action } = req.body;

  try {
    const { rows } = await db.query(
      `SELECT g.*, o.site_id FROM giftcards g JOIN orders o ON g.order_id = o.order_id WHERE g.giftcard_id = $1`,
      [id]
    );

    if (rows.length === 0) {
      const err = new Error('Gift card not found');
      err.status = 404;
      return next(err);
    }

    const gc = rows[0];
    const description = `Admin '${req.admin.username}' (${req.admin.role}) performed action [${action}] on gift card brand '${gc.brand}' (ID: ${id}) from site ${gc.site_id}`;

    await db.query(
      `INSERT INTO admin_activities (action_type, description, metadata) VALUES ($1, $2, $3)`,
      ['GIFTCARD_SENSITIVE_ACCESS', description, JSON.stringify({ admin: req.admin.username, role: req.admin.role, action, giftcard_id: id, brand: gc.brand })]
    );

    if (req.admin.role !== 'superadmin') {
      sendAdminNotification(
        '⚠️ Sensitive Giftcard Data Accessed',
        description,
        '/admin/',
        'superadmin'
      );
    }

    res.json({ success: true, message: 'Audit logged and notification dispatched' });
  } catch (e) {
    next(e);
  }
});

router.get('/giftcards/:id/reveal', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM giftcards WHERE giftcard_id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Gift card not found' });
    await db.query(
      `INSERT INTO admin_activities (admin_id, username, action_type, description, metadata)
       VALUES ($1, $2, 'GIFTCARD_REVEALED', $3, $4)`,
      [req.admin.admin_id, req.admin.username, `Gift card ${req.params.id} revealed by ${req.admin.username}`, JSON.stringify({ giftcard_id: req.params.id })]
    );
    res.json({ code: giftcards.decrypt(rows[0].code_encrypted || rows[0].encrypted_code) });
  } catch (e) { next(e); }
});

router.get('/vouchers', async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, rail } = req.query;
    let query = `
      SELECT v.*, o.site_id, o.status as order_status, o.amount_usd, o.client_ip, o.region, o.created_at as order_created_at
      FROM vouchers v
      JOIN orders o ON v.order_id = o.order_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (rail) {
      query += ` AND v.rail = $${paramIndex++}`;
      params.push(rail);
    }

    query += ` ORDER BY v.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(Number(limit), Number(offset));

    const { rows } = await db.query(query, params);
    res.json({ success: true, count: rows.length, vouchers: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/vouchers/:id/audit', async (req, res, next) => {
  const { id } = req.params;
  const { action } = req.body;

  try {
    const { rows } = await db.query(
      `SELECT v.*, o.site_id FROM vouchers v JOIN orders o ON v.order_id = o.order_id WHERE v.voucher_id = $1`,
      [id]
    );

    if (rows.length === 0) {
      const err = new Error('Voucher not found');
      err.status = 404;
      return next(err);
    }

    const vc = rows[0];
    const description = `Admin '${req.admin.username}' (${req.admin.role}) performed action [${action}] on voucher rail '${vc.rail}' (ID: ${id}) from site ${vc.site_id}`;

    await db.query(
      `INSERT INTO admin_activities (action_type, description, metadata) VALUES ($1, $2, $3)`,
      ['VOUCHER_SENSITIVE_ACCESS', description, JSON.stringify({ admin: req.admin.username, role: req.admin.role, action, voucher_id: id, rail: vc.rail })]
    );

    if (req.admin.role !== 'superadmin') {
      sendAdminNotification(
        '⚠️ Sensitive Voucher PIN Accessed',
        description,
        '/admin/',
        'superadmin'
      );
    }

    res.json({ success: true, message: 'Voucher audit logged and notification dispatched' });
  } catch (e) {
    next(e);
  }
});

router.get('/vouchers/:id/reveal', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM vouchers WHERE voucher_id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Voucher not found' });
    await db.query(
      `INSERT INTO admin_activities (admin_id, username, action_type, description, metadata)
       VALUES ($1, $2, 'VOUCHER_REVEALED', $3, $4)`,
      [req.admin.admin_id, req.admin.username, `Voucher ${req.params.id} revealed by ${req.admin.username}`, JSON.stringify({ voucher_id: req.params.id })]
    );
    res.json({ pin: giftcards.decrypt(rows[0].pin_encrypted) });
  } catch (e) { next(e); }
});


router.get('/sites', async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT site_id, display_name as domain, active as is_active, created_at FROM merchant_keys ORDER BY created_at DESC`);
    res.json({ success: true, sites: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/merchant-keys', async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM merchant_keys ORDER BY created_at DESC`);
    res.json({ success: true, keys: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/widget-sessions', async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    const { rows } = await db.query(`SELECT * FROM admin_sessions ORDER BY expires_at DESC LIMIT $1`, [Number(limit)]);
    res.json({ success: true, sessions: rows });
  } catch (e) {
    next(e);
  }
});


router.patch('/users/:id/status', requireSuperAdmin, async (req, res, next) => {
  const { id } = req.params;
  const { is_active } = req.body;

  try {
    const { rows } = await db.query(
      `UPDATE admin_users SET is_active = $1 WHERE admin_id = $2 RETURNING admin_id, username, is_active`,
      [is_active, id]
    );

    if (rows.length === 0) {
      const err = new Error('Admin user not found');
      err.status = 404;
      return next(err);
    }

    sendAdminNotification(
      '🛡️ Admin Status Updated',
      `Superadmin '${req.admin.username}' updated status for user ID ${id} to active: ${is_active}`,
      '/admin/',
      'superadmin'
    );

    res.json({ success: true, user: rows[0] });
  } catch (e) {
    next(e);
  }
});


router.get('/activities', async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT id, username, action_type, description, metadata, created_at 
      FROM admin_activities
      ORDER BY created_at DESC LIMIT $1 OFFSET $2
    `;
    const params = [Number(limit), Number(offset)];
    const { rows } = await db.query(query, params);
    res.json({ success: true, activities: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/messages', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT id, sender_username, message, is_broadcast, created_at 
      FROM admin_messages 
      ORDER BY created_at DESC 
      LIMIT 50
    `);
    res.json({ success: true, messages: rows.reverse() });
  } catch (e) {
    next(e);
  }
});

router.post('/messages', async (req, res, next) => {
  const { message, is_broadcast = false } = req.body;
  if (!message) {
    const err = new Error('Message content required');
    err.status = 400;
    return next(err);
  }

  if (is_broadcast && req.admin.role !== 'superadmin') {
    const err = new Error('Forbidden: Only superadmin can send global broadcasts');
    err.status = 403;
    return next(err);
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO admin_messages (sender_id, sender_username, message, is_broadcast) 
       VALUES ($1::uuid, $2, $3, $4) 
       RETURNING id, sender_username, message, is_broadcast, created_at`,
      [req.admin.admin_id, req.admin.username, message, is_broadcast]
    );

    if (is_broadcast) {
      sendAdminNotification('📢 Superadmin Broadcast', `${req.admin.username}: ${message}`, '/admin/', 'all');
    }

    res.json({ success: true, message: rows[0] });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.verifyAdminToken = verifyAdminToken;