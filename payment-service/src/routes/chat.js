'use strict';

const express = require('express');
const db = require('../db');
const { verifyAdminToken } = require('./admin');

const router = express.Router();

/**
 * GET /api/admin/chat
 * Fetch recent chat history and broadcasts
 */
router.get('/admin/chat', verifyAdminToken, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT m.*, u.username as sender_name 
      FROM admin_chat_messages m
      JOIN admin_users u ON m.sender_id = u.admin_id
      ORDER BY m.created_at DESC
      LIMIT 50
    `);
    res.json({ success: true, messages: rows.reverse() });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/admin/chat
 * Send a direct message or superadmin broadcast
 */
router.post('/admin/chat', verifyAdminToken, async (req, res, next) => {
  try {
    const { recipient_id, message, is_broadcast } = req.body;

    if (!message) {
      const err = new Error('Message content required');
      err.status = 400;
      return next(err);
    }

    const { rows } = await db.query(
      `INSERT INTO admin_chat_messages (sender_id, recipient_id, message, is_broadcast)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.admin.admin_id, recipient_id || null, message, Boolean(is_broadcast) && req.admin.role === 'superadmin']
    );

    res.json({ success: true, message: rows[0] });
  } catch (e) {
    next(e);
  }
});

module.exports = router;