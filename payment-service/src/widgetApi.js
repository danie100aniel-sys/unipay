'use strict';
/**
 * The API the widget.js browser bundle calls. Same single-order token auth as
 * routes/widget.js — mounted separately so widget.js can use relative paths
 * when served from this same origin.
 */
const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const { widgetAuth } = require('./middleware/auth');

const router = express.Router();

/** public status for the widget's poller */
router.get('/api/widget/:token/status', widgetAuth, async (req, res) => {
  const { rows: [pay] } = await db.query(
    `SELECT method, rail_ref, address, expected_amount, expected_asset FROM payments
      WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [req.order.order_id]);
  res.json({ order_id: req.order.order_id, status: req.order.status, payment: pay || null });
});

/** SSE push — the poller's upgrade; widget falls back to polling if SSE fails */
router.get('/api/widget/:token/events', widgetAuth, async (req, res) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  const send = async () => {
    const { rows: [o] } = await db.query('SELECT status FROM orders WHERE order_id = $1', [req.order.order_id]);
    if (o) res.write(`data: ${JSON.stringify({ status: o.status })}\n\n`);
  };
  await send();
  const timer = setInterval(send, 3000);
  req.on('close', () => clearInterval(timer));
});

/** good-photo guide + generic assets the widget needs */
router.get('/api/widget/:token', widgetAuth, async (req, res) => {
  const giftcards = require('./services/giftcards');
  res.json({
    order_id: req.order.order_id,
    status: req.order.status,
    amount_usd: req.order.amount_usd,
    currency: req.order.currency,
    expires_at: req.order.expires_at,
    rates: await giftcards.rateTable(),
    brands: Object.keys((await giftcards.rateTable()).PHOTO_RATE),
    card_guide: {
      egift: [
        { brand: 'Amazon', url: 'https://www.amazon.com/gp/product/B0865RRSVV' },
        { brand: 'Apple', url: 'https://www.apple.com/shop/gift-cards' },
      ],
      onramps: [
        { name: 'MoonPay', url: 'https://www.moonpay.com/buy' },
        { name: 'Ramp', url: 'https://ramp.network/buy' },
      ],
    },
  });
});

module.exports = router;
