'use strict';

const webpush = require('web-push');
const db = require('../db');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_CONTACT || 'mailto:admin@unipay.local',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Broadcast a push notification to all registered admin devices (or filter for superadmin).
 */
async function sendAdminNotification(title, body, url = '/admin/', roleFilter = null) {
  try {
    let query = `SELECT subscription, u.role FROM admin_push_subscriptions s JOIN admin_users u ON s.admin_id = u.admin_id`;
    const params = [];
    if (roleFilter) {
      query += ` WHERE u.role = $1`;
      params.push(roleFilter);
    }
    const { rows: subscriptions } = await db.query(query, params);
    
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({ title, body, url });

    const notifications = subscriptions.map(async (row) => {
      const sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
      try {
        await webpush.sendNotification(sub, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.query(`DELETE FROM admin_push_subscriptions WHERE subscription->>'endpoint' = $1`, [sub.endpoint]);
        } else {
          console.error('Error sending push notification:', err);
        }
      }
    });

    await Promise.all(notifications);
  } catch (e) {
    console.error('Failed to dispatch admin push notifications:', e);
  }
}

module.exports = { sendAdminNotification };