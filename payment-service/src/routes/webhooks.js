'use strict';

/**
 * Inbound provider callbacks.
 *
 * Rules:
 * 1. Every raw callback is logged, including invalid signatures.
 * 2. Signature verification happens before order processing.
 * 3. Payment records must match both order ID and payment method.
 * 4. Only verified, sufficiently paid events can complete an order.
 */

const express = require('express');
const crypto = require('crypto');

const db = require('../db');
const config = require('../config');
const { transition } = require('../stateMachine');
const { queueCallback } = require('../services/callbacks');
const { lookupPayment } = require('../services/lnbitsLightning');

const router = express.Router();

router.use(express.raw({ type: '*/*' }));

// --------------------------------------------------
// WEBHOOK LOGGING AND SIGNATURE VERIFICATION
// --------------------------------------------------

async function logAndVerify(provider, req, verifyFn) {
  let signatureValid = false;

  try {
    signatureValid = verifyFn(req) === true;
  } catch {
    signatureValid = false;
  }

  await db.query(
    `INSERT INTO webhook_log
      (provider, headers, raw_body, signature_valid)
     VALUES ($1, $2::jsonb, $3, $4)`,
    [
      provider,
      JSON.stringify(req.headers),
      req.body.toString('utf8'),
      signatureValid
    ]
  );

  if (!signatureValid) {
    const error = new Error('Invalid webhook signature');
    error.status = 401;
    throw error;
  }
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function recursivelySort(value) {
  if (Array.isArray(value)) {
    return value.map(recursivelySort);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = recursivelySort(value[key]);
      return result;
    }, {});
  }

  return value;
}

function compactAsset(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Supports both:
 *
 * Legacy: USDT@TRON
 * Current: usdttrc20
 *
 * The current format is the exact currency code stored
 * by the NOWPayments service.
 */
function matchesExpectedAsset(paidAsset, network, expectedAsset) {
  const paid = compactAsset(paidAsset);
  const expectedText = String(expectedAsset || '').trim();

  if (!paid || !expectedText) {
    return false;
  }

  // Legacy format: USDT@TRON
  if (expectedText.includes('@')) {
    const parts = expectedText.split('@');

    if (parts.length !== 2) {
      return false;
    }

    const expectedCombined =
      compactAsset(parts[0]) + compactAsset(parts[1]);

    return Boolean(expectedCombined) && paid === expectedCombined;
  }

  // Current format: usdttrc20, usdtsol, usdcbase, etc.
  return paid === compactAsset(expectedText);
}

function positiveNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? number
    : null;
}

function amountIsSufficient(actual, expected) {
  const actualNumber = positiveNumber(actual);
  const expectedNumber = positiveNumber(expected);

  return (
    actualNumber !== null &&
    expectedNumber !== null &&
    actualNumber + 1e-8 >= expectedNumber
  );
}

async function openReview(orderId, reason) {
  if (!orderId) return;

  await db.query(
    `INSERT INTO admin_review (order_id, reason)
     VALUES ($1, $2)
     ON CONFLICT (order_id) DO NOTHING`,
    [orderId, reason]
  );
}

// --------------------------------------------------
// PROVIDER EVENT NORMALIZERS
// --------------------------------------------------

const NORMALIZERS = {
  lnbits(payload) {
    return {
      orderId: payload.extra?.order_id || payload.order_id,
      railRef: payload.payment_hash,
      paid: payload.paid === true || payload.pending === false,
      paidAsset: 'SAT',
    };
  },

  nowpayments(payload) {
    return {
      orderId: payload.order_id,
      railRef: String(payload.payment_id || ''),
      status: payload.payment_status,
      paidAsset: payload.pay_currency,
      paidAmount: payload.actually_paid,
      network: payload.network,
    };
  },

  phoenixd() {
    // Automatic completion remains disabled until reliable
    // payment-to-order mapping and signature verification exist.
    return null;
  },
};

// --------------------------------------------------
// SIGNATURE COMPARISON
// --------------------------------------------------

const timingSafeEqual = (a, b) => {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));

  return (
    first.length === second.length &&
    crypto.timingSafeEqual(first, second)
  );
};

// --------------------------------------------------
// WEBHOOK ROUTE HANDLER
// --------------------------------------------------

function mount(path, provider, verifyFn) {
  router.post(path, async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        const error = new Error('Webhook raw body unavailable');
        error.status = 400;
        throw error;
      }

      await logAndVerify(provider, req, verifyFn);

      let payload;

      try {
        payload = JSON.parse(req.body.toString('utf8'));
      } catch {
        const error = new Error('Invalid webhook JSON');
        error.status = 400;
        throw error;
      }

      const event = NORMALIZERS[provider](payload);

      // Phoenixd is authenticated and logged, but not automatically
      // allowed to complete orders yet.
      if (provider === 'phoenixd' || !event) {
        return res.json({
          ok: true,
          action: 'manual-verification-required'
        });
      }

      if (!event.orderId || !event.railRef) {
        return res.json({
          ok: true,
          action: 'ignored-unmatched-event'
        });
      }

      let actualAmount;
      let actualAsset;
      let storedPayment;

      // --------------------------------------------------
      // LNBITS LIGHTNING
      // --------------------------------------------------

      if (provider === 'lnbits') {
        if (!event.paid) {
          return res.json({
            ok: true,
            action: 'not-settled'
          });
        }

        storedPayment = await db.query(
          `SELECT
             p.order_id,
             p.method,
             p.rail_ref,
             p.expected_amount,
             p.expected_asset,
             p.quote,
             o.status
           FROM payments p
           JOIN orders o ON o.order_id = p.order_id
           WHERE p.order_id = $1
             AND p.rail_ref = $2
             AND p.method = 'LNBITS_LIGHTNING'
           LIMIT 1`,
          [event.orderId, event.railRef]
        );

        if (!storedPayment.rows.length) {
          return res.json({
            ok: true,
            action: 'payment-record-mismatch'
          });
        }

        const payment = storedPayment.rows[0];

        let verification;

        try {
          verification = await lookupPayment(event.railRef);
        } catch {
          await openReview(
            event.orderId,
            'LNbits settlement lookup failed'
          );

          return res.json({
            ok: true,
            action: 'manual-review-required'
          });
        }

        if (!verification || verification.settled !== true) {
          await openReview(
            event.orderId,
            'LNbits settlement could not be confirmed'
          );

          return res.json({
            ok: true,
            action: 'manual-review-required'
          });
        }

        const quote = payment.quote || {};

        const quotedSats = positiveNumber(
          quote.amount_sats ??
          quote.amountSats ??
          quote.sats
        );

        const actualSats = positiveNumber(
          verification.amountSats
        );

        if (!quotedSats || !actualSats) {
          await openReview(
            event.orderId,
            'LNbits payment amount requires manual verification'
          );

          return res.json({
            ok: true,
            action: 'manual-review-required'
          });
        }

        if (!amountIsSufficient(actualSats, quotedSats)) {
          await openReview(
            event.orderId,
            'LNbits underpayment requires manual review'
          );

          return res.json({
            ok: true,
            action: 'manual-review-required'
          });
        }

        actualAmount = actualSats;
        actualAsset = 'SAT';
      }

      // --------------------------------------------------
      // NOWPAYMENTS
      // --------------------------------------------------

      else if (provider === 'nowpayments') {

        // Partial payments never complete orders automatically.
        if (event.status === 'partially_paid') {
          storedPayment = await db.query(
            `SELECT p.order_id, p.rail_ref
             FROM payments p
             WHERE p.order_id = $1
               AND p.rail_ref = $2
               AND p.method = 'NOWPAYMENTS'
             LIMIT 1`,
            [event.orderId, event.railRef]
          );

          if (storedPayment.rows.length) {
            await openReview(
              event.orderId,
              'NOWPayments partial payment requires manual review'
            );
          }

          return res.json({
            ok: true,
            action: 'manual-review-required'
          });
        }

        // Only finished is treated as final success.
        if (event.status !== 'finished') {
          return res.json({
            ok: true,
            action: 'non-final-event-ignored'
          });
        }

        storedPayment = await db.query(
          `SELECT
             p.order_id,
             p.method,
             p.rail_ref,
             p.expected_amount,
             p.expected_asset,
             o.status
           FROM payments p
           JOIN orders o ON o.order_id = p.order_id
           WHERE p.order_id = $1
             AND p.rail_ref = $2
             AND p.method = 'NOWPAYMENTS'
           LIMIT 1`,
          [event.orderId, event.railRef]
        );

        if (!storedPayment.rows.length) {
          return res.json({
            ok: true,
            action: 'payment-record-mismatch'
          });
        }

        const payment = storedPayment.rows[0];

        // Verify the actual asset against the stored expected asset.
        if (!matchesExpectedAsset(
          event.paidAsset,
          event.network,
          payment.expected_asset
        )) {
          await openReview(
            event.orderId,
            'NOWPayments asset mismatch requires manual review'
          );

          return res.json({
            ok: true,
            action: 'manual-review-required'
          });
        }

        // Verify the received amount.
        if (!amountIsSufficient(
          event.paidAmount,
          payment.expected_amount
        )) {
          await openReview(
            event.orderId,
            'NOWPayments underpayment requires manual review'
          );

          return res.json({
            ok: true,
            action: 'manual-review-required'
          });
        }

        actualAmount = Number(event.paidAmount);
        actualAsset = event.paidAsset;
      }

      // --------------------------------------------------
      // ATOMIC ORDER COMPLETION
      // --------------------------------------------------

      const client = await db.connect();

      try {
        await client.query('BEGIN');

        const locked = await client.query(
          `SELECT status
           FROM orders
           WHERE order_id = $1
           FOR UPDATE`,
          [event.orderId]
        );

        if (!locked.rows.length) {
          await client.query('ROLLBACK');

          return res.json({
            ok: true,
            action: 'order-not-found'
          });
        }

        const currentStatus = locked.rows[0].status;

        if (currentStatus === 'COMPLETED') {
          await client.query('COMMIT');

          return res.json({
            ok: true,
            action: 'already-completed'
          });
        }

        if (currentStatus !== 'AWAITING_PAYMENT') {
          await client.query('ROLLBACK');

          await openReview(
            event.orderId,
            `${provider}: payment received in state ${currentStatus}`
          );

          return res.json({
            ok: true,
            action: 'manual-review-required'
          });
        }

        await transition(event.orderId, 'COMPLETED', {
          actor: 'provider',
          eventType: `${provider.toUpperCase()}_COMPLETED`,
          railRef: event.railRef,
          payload: {
            paidAsset: actualAsset,
            paidAmount: actualAmount,
          },
          client,
        });

        const paymentMethod = provider === 'nowpayments'
          ? 'NOWPAYMENTS'
          : 'LNBITS_LIGHTNING';

        const paymentUpdate = await client.query(
          `UPDATE payments
           SET paid_amount = $3
           WHERE order_id = $1
             AND rail_ref = $2
             AND method = $4`,
          [
            event.orderId,
            event.railRef,
            actualAmount,
            paymentMethod
          ]
        );

        if (paymentUpdate.rowCount !== 1) {
          throw new Error(
            'Payment record changed during completion'
          );
        }

        await client.query(
          `UPDATE orders
           SET paid_asset = $2
           WHERE order_id = $1`,
          [event.orderId, actualAsset]
        );

        // Queue the callback inside the same transaction.
        await queueCallback(event.orderId, client);

        await client.query('COMMIT');

        return res.json({
          ok: true,
          action: 'completed'
        });

      } catch (completionError) {
        await client.query('ROLLBACK').catch(() => {});

        await openReview(
          event.orderId,
          `${provider}: verified payment requires manual state resolution`
        );

        return res.json({
          ok: true,
          action: 'manual-review-required'
        });

      } finally {
        client.release();
      }

    } catch (error) {
      next(error);
    }
  });
}

// --------------------------------------------------
// LNBITS SIGNATURE VERIFICATION
// --------------------------------------------------

mount('/webhooks/lnbits', 'lnbits', (req) => {
  const sig = req.headers['x-lnbits-signature'] || '';
  const secret = config.webhookSecrets.lnbits;

  if (!secret || !sig) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('hex');

  return timingSafeEqual(sig, expected);
});

// --------------------------------------------------
// PHOENIXD SIGNATURE VERIFICATION
// --------------------------------------------------

mount('/webhooks/phoenixd', 'phoenixd', (req) => {
  const sig = req.headers['x-phoenixd-signature'] || '';
  const secret = config.webhookSecrets.phoenixd;

  if (!secret || !sig) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('hex');

  return timingSafeEqual(sig, expected);
});

// --------------------------------------------------
// NOWPAYMENTS SIGNATURE VERIFICATION
// --------------------------------------------------

mount('/webhooks/nowpayments', 'nowpayments', (req) => {
  const sig = req.headers['x-nowpayments-sig'] || '';
  const secret = config.webhookSecrets.nowpayments;

  if (!secret || !sig) return false;

  let payload;

  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return false;
  }

  const canonicalPayload = recursivelySort(payload);

  const expected = crypto
    .createHmac('sha512', secret)
    .update(JSON.stringify(canonicalPayload))
    .digest('hex');

  return timingSafeEqual(sig, expected);
});

module.exports = router;