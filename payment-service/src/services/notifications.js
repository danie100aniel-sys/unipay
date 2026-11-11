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

async function sendAdminNotification(title, body, url = '/admin/', roleFilter = null) {
  const result = { sent: 0, failed: 0, removed: 0 };

  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
      return { ...result, error: 'VAPID configuration is missing' };
    }

    let query = `
      SELECT subscription, u.role
      FROM admin_push_subscriptions s
      JOIN admin_users u ON s.admin_id = u.admin_id
      WHERE u.is_active = TRUE
    `;

    const params = [];

    // "all" means every active administrator, not a literal role.
    if (roleFilter && roleFilter !== 'all') {
      query += ' AND u.role = $1';
      params.push(roleFilter);
    }

    const { rows: subscriptions } = await db.query(query, params);

    if (subscriptions.length === 0) {
      return result;
    }

    const payload = JSON.stringify({ title, body, url });

    await Promise.all(subscriptions.map(async (row) => {
      let sub;

      try {
        sub = typeof row.subscription === 'string'
          ? JSON.parse(row.subscription)
          : row.subscription;

        await webpush.sendNotification(sub, payload);
        result.sent += 1;
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.query(
            `DELETE FROM admin_push_subscriptions
             WHERE subscription->>'endpoint' = $1`,
            [sub.endpoint]
          );
          result.removed += 1;
        } else {
          result.failed += 1;
          console.error('Error sending push notification:', err.message);
        }
      }
    }));

    return result;
  } catch (e) {
    console.error('Failed to dispatch admin push notifications:', e);
    return { ...result, error: 'Notification dispatch failed' };
  }
}

module.exports = { sendAdminNotification };
