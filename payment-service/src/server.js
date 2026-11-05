'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const webpush = require('web-push');
const config = require('./config');

const app = express();

const allowlist = new Set(config.allowedOrigins);
app.use(helmet({
  crossOriginResourcePolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowlist.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Configure web-push with your VAPID keys (store these in config.js or environment variables)
// Run `npx web-push generate-vapid-keys` to generate them if you haven't already.
if (config.vapidPublicKey && config.vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:admin@unipay.local',
    config.vapidPublicKey,
    config.vapidPrivateKey
  );
}

// Provider callbacks must receive the original raw request body.
app.use(require('./routes/webhooks'));

// Parse JSON for the remaining application routes.
app.use(express.json({ limit: '256kb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

// Mount WebAuthn Authentication & Operator Chat routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/biometrics'));
app.use('/api', require('./routes/chat'));

app.use(require('./serveWidget'));                    // GET /widget.js
app.use(require('./widgetApi'));                    // /api/widget/* for the bundle
app.use('/v1', require('./routes/orders'));        // website backends (merchant key)
app.use('/v1', require('./routes/widget'));        // browser widget (single-order token)


app.use('/api/admin', require('./routes/admin'));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.message === 'Not allowed by CORS' ? 403 : err.name === 'ZodError' ? 400 : err.code === 'ILLEGAL_TRANSITION' ? 409 : 500);
  res.status(status).json({ error: err.message, code: err.code });
});

app.listen(config.port, '0.0.0.0', () => console.log(`unipay listening on :${config.port}`));