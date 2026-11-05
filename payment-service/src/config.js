'use strict';
try { require('dotenv').config(); } catch { /* dotenv optional in prod envs */ }

const parseCsvList = (value, fallback = []) => {
  if (!value) return fallback;
  return value.split(',').map(item => item.trim()).filter(Boolean);
};

module.exports = {
  port: parseInt(process.env.PORT || '5000', 10),
  databaseUrl: process.env.DATABASE_URL,
  orderTtlMinutes: parseInt(process.env.ORDER_TTL_MINUTES || '30', 10),
  giftCardPhotoTtlDays: parseInt(process.env.GIFT_CARD_PHOTO_TTL_DAYS || '30', 10),
  allowedOrigins: parseCsvList(process.env.ALLOWED_ORIGINS, ['http://localhost:3000']),
  lnbits: {
    url: process.env.LNBITS_URL,
    apiKey: process.env.LNBITS_API_KEY,
  },
  phoenixd: {
    url: process.env.PHOENIXD_URL,
    password: process.env.PHOENIXD_PASSWORD,
  },
  nowpayments: {
    apiKey: process.env.NOWPAYMENTS_API_KEY,
    apiUrl: process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1',
    ipnSecret: process.env.NOWPAYMENTS_IPN_SECRET,
  },
  webhookSecrets: {
    lnbits: process.env.LNBITS_WEBHOOK_SECRET,
    phoenixd: process.env.PHOENIXD_WEBHOOK_SECRET,
    nowpayments: process.env.NOWPAYMENTS_IPN_SECRET,
  },
};