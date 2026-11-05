'use strict';
const express = require('express');
const { z } = require('zod');
const multer = require('multer');
const db = require('../db');
const { widgetAuth } = require('../middleware/auth');
const { selectRail, transition } = require('../stateMachine');
const lnbitsLightning = require('../services/lnbitsLightning');
const phoenixdOnchain = require('../services/phoenixdOnchain');
const nowpayments = require('../services/nowpayments');
const giftcards = require('../services/giftcards');
const vouchers = require('../services/vouchers');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    /^image\/(jpeg|png|webp)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('images only')),
});

/** widget config for one order: which tabs, which rates, order state + IP/region capture */
router.get('/widget/:token', widgetAuth, async (req, res, next) => {
  try {
    const o = req.order;

    // Capture client IP and region on widget load
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || null;
    const region = req.headers['cf-ipcountry'] || 'UNKNOWN';

    await db.query(
      `UPDATE orders SET client_ip = COALESCE(client_ip, $1), region = COALESCE(region, $2) WHERE order_id = $3`,
      [clientIp, region, o.order_id]
    );

    res.json({
      order_id: o.order_id,
      status: o.status,
      amount_usd: o.amount_usd,
      currency: o.currency,
      methods: ['LNBITS_LIGHTNING', 'PHOENIXD_ONCHAIN', 'NOWPAYMENTS', 'GIFT_CARD', 'VOUCHER', 'CARD_GUIDE'],
      rates: await giftcards.rateTable(),
      expires_at: o.expires_at,
    });
  } catch (e) {
    next(e);
  }
});

/** gift card / voucher quote — priced at display time */
router.post('/widget/:token/rate-quote', widgetAuth, async (req, res, next) => {
  try {
    const { brand, face_value_usd, tier } = z.object({
      brand: z.string(), face_value_usd: z.number().positive(),
      tier: z.enum(['PHOTO_RATE', 'ECODE_RATE']),
    }).parse(req.body);
    res.json(await giftcards.quote(brand, face_value_usd, tier));
  } catch (e) { next(e); }
});

/** tab 1 — Lightning or On-chain invoice via self-hosted LNbits/phoenixd stack */
router.post('/widget/:token/invoice', widgetAuth, async (req, res, next) => {
  try {
    const { method } = z.object({ method: z.enum(['LNBITS_LIGHTNING', 'PHOENIXD_ONCHAIN']) }).parse(req.body);

    let inv;
    if (method === 'LNBITS_LIGHTNING') {
      inv = await lnbitsLightning.createInvoice(req.order);
    } else {
      inv = await phoenixdOnchain.createOnchainInvoice(req.order);
    }

    await selectRail(req.order.order_id, method, inv);
    res.json(inv);
  } catch (e) { next(e); }
});

/** tab 2 — altcoin deposit address for a chosen asset+network */
router.post('/widget/:token/deposit', widgetAuth, async (req, res, next) => {
  try {
    const { asset, network } = z.object({ asset: z.string(), network: z.string() }).parse(req.body);
    const dep = await nowpayments.createDeposit(req.order, asset, network);
    await selectRail(req.order.order_id, 'NOWPAYMENTS', dep);
    res.json(dep);
  } catch (e) { next(e); }
});

/** tab 3 — gift card code (+ optional photo) */
router.post('/widget/:token/giftcard', widgetAuth, upload.single('photo'), async (req, res, next) => {
  try {
    const fields = z.object({
      brand: z.string(), face_value_usd: z.number().positive(),
      code: z.string().min(8), tier: z.enum(['PHOTO_RATE', 'ECODE_RATE']),
    }).parse(req.body);

    if (fields.tier === 'PHOTO_RATE' && !req.file) {
      return res.status(400).json({ error: 'photo tier requires a card photo' });
    }
    const quote = await giftcards.lockQuote(req.order, fields);
    const stored = await giftcards.storeSubmission(req.order, fields, req.file);
    await selectRail(req.order.order_id, 'GIFT_CARD', { railRef: stored.tradeRef, quote });
    await db.query(
      `INSERT INTO admin_review (order_id, reason)
       VALUES ($1, $2)
       ON CONFLICT (order_id) DO NOTHING`,
      [req.order.order_id, `Gift card submission: ${fields.brand}`]
    );
    res.status(201).json({ status: 'AWAITING_PAYMENT', credit_usd: quote.credit_usd, note: 'gift card submitted — this cannot be cancelled' });
  } catch (e) { next(e); }
});

/** tab 4 — 16-digit voucher PIN */
router.post('/widget/:token/voucher', widgetAuth, async (req, res, next) => {
  try {
    const fields = z.object({
      pin: z.string().regex(/^\d{16}$/), rail: z.literal('VOUCHER'),
    }).parse(req.body);
    const stored = await vouchers.redeem(req.order, fields);
    await selectRail(req.order.order_id, 'VOUCHER', { railRef: stored.redemption_ref });
    await db.query(
      `INSERT INTO admin_review (order_id, reason)
       VALUES ($1, $2)
       ON CONFLICT (order_id) DO NOTHING`,
      [req.order.order_id, 'Voucher submission']
    );
    res.status(201).json({ status: 'AWAITING_PAYMENT', note: 'voucher submitted for manual review' });
  } catch (e) { next(e); }
});

/** lightweight status for polling */
router.get('/widget/:token/status', widgetAuth, async (req, res) => {
  const { rows: [pay] } = await db.query(
    `SELECT method, rail_ref, address, expected_amount, expected_asset FROM payments
     WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [req.order.order_id]);
  res.json({ order_id: req.order.order_id, status: req.order.status, payment: pay || null });
});

module.exports = router;