'use strict';
const express = require('express');
const { z } = require('zod');
const { merchantAuth } = require('../middleware/auth');
const orders = require('../models/order');

const router = express.Router();

/**
 * Zod Schema: Input validation for creating a new order.
 * Ensures the main website passes valid data types and limits.
 */
const CreateOrder = z.object({
  product_id: z.string().min(1).max(128),
  amount_usd: z.number().positive().max(1_000_000), // Max order limit ($1M)
  currency: z.string().length(3).optional(),      // Defaults to USD if omitted
  customer_ref: z.string().max(128).optional(),      // Merchant's anonymous user identifier
  metadata: z.record(z.any()).optional(),        // Custom metadata attached to the order

  // SPLIT BALANCE ADDITION:
  // Allows the merchant website to optionally define a minimum single transaction chunk
  // (e.g., forcing vouchers to be at least $25 to prevent spam submissions)
  min_split_usd: z.number().positive().optional(),
});

/**
 * POST /orders
 * Called by your main website's backend to register a new purchase intent.
 * Generates an order in the DB along with a temporary widget access token.
 */
router.post('/orders', merchantAuth, async (req, res, next) => {
  try {
    // 1. Validate incoming JSON payload against the Zod schema above
    const body = CreateOrder.parse(req.body);

    // 2. Persist the new order in PostgreSQL/Database via the order model
    const order = await orders.createOrder(req.site, body);

    // 3. Generate a secure single-use widget session token bound to this order_id
    const widget_token = await orders.createWidgetSession(order.order_id);

    // 4. Return order state, balance calculations, and session token to caller
    res.status(201).json({
      ...order,
      widget_token
    });
  } catch (e) {
    // Forward schema validation or DB errors to Express central error handler
    next(e);
  }
});

/**
 * GET /orders/:id
 * Fetches the current state, split-balance summary, and complete audit log of an order.
 */
router.get('/orders/:id', merchantAuth, async (req, res, next) => {
  try {
    // 1. Fetch order details from DB using order ID param
    const order = await orders.getOrder(req.params.id);

    // 2. Security Check: Ensure order exists AND belongs to the requesting merchant/site
    if (!order || order.site_id !== req.site.site_id) {
      return res.status(404).json({ error: 'not found' });
    }

    // 3. Fetch chronological audit log of state changes (e.g., PENDING -> PARTIALLY_PAID -> PAID)
    const { rows: events } = await require('../db').query(
      'SELECT event_type, from_status, to_status, payload, created_at FROM order_events WHERE order_id = $1 ORDER BY event_id',
      [order.order_id]
    );

    // 4. Return order object along with full event trail
    res.json({
      ...order,
      events
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;