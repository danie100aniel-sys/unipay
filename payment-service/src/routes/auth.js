'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  authenticator
} = require('@simplewebauthn/server');
const db = require('../db');
const { verifyAdminToken } = require('./admin');

const router = express.Router();

const RP_ID = process.env.RP_ID || 'localhost';
const EXPECTED_ORIGIN = process.env.ORIGIN || 'http://localhost:3000';

const challengeStore = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const setChallenge = (key, challenge, ttlMs = CHALLENGE_TTL_MS) => {
  challengeStore.set(key, { challenge, expiresAt: Date.now() + ttlMs });
};

const getChallenge = (key) => {
  const entry = challengeStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    challengeStore.delete(key);
    return null;
  }
  return entry.challenge;
};

const clearChallenge = (key) => challengeStore.delete(key);

/**
 * 1. REGISTER: Generate Registration Challenge Options
 */
router.post('/register-challenge', verifyAdminToken, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM admin_users WHERE admin_id = $1', [req.admin.admin_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Operator not found' });
    const admin = rows[0];

    const { rows: existingAuths } = await db.query('SELECT credential_id FROM admin_authenticators WHERE admin_id = $1', [admin.admin_id]);

    const options = await generateRegistrationOptions({
      rpName: 'UniPay Admin PWA',
      rpID: RP_ID,
      userID: Buffer.from(String(admin.admin_id)),
      userName: admin.username,
      attestationType: 'none',
      excludeCredentials: existingAuths.map(row => {
        let credId = row.credential_id;
        if (Buffer.isBuffer(credId)) credId = credId.toString('base64url');
        return {
          id: credId,
          type: 'public-key',
        };
      }),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
        authenticatorAttachment: 'platform',
      },
    });

    setChallenge(admin.username, options.challenge);
    return res.json({ success: true, options });
  } catch (e) {
    console.error('Register Challenge Error:', e);
    next(e);
  }
});

/**
 * 2. REGISTER: Verify and Store Device Passkey
 */
router.post('/register-verify', verifyAdminToken, async (req, res, next) => {
  try {
    const { credential } = req.body;
    const { rows } = await db.query('SELECT * FROM admin_users WHERE admin_id = $1', [req.admin.admin_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Operator not found' });
    const admin = rows[0];

    const expectedChallenge = getChallenge(admin.username);
    if (!expectedChallenge) return res.status(400).json({ error: 'Challenge expired or missing' });

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Passkey registration verification failed' });
    }

    const { credential: regCredential } = verification.registrationInfo;
    const credentialId = Buffer.from(regCredential.id, 'base64url');
    const publicKey = Buffer.from(regCredential.publicKey);

    await db.query(
      `INSERT INTO admin_authenticators (admin_id, credential_id, public_key, counter, transports)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (credential_id) DO NOTHING`,
      [
        admin.admin_id,
        credentialId,
        publicKey,
        regCredential.counter,
        regCredential.transports || []
      ]
    );

    clearChallenge(admin.username);
    return res.json({ success: true });
  } catch (e) {
    console.error('Register Verify Error:', e);
    next(e);
  }
});

/**
 * 3. LOGIN: Generate Authentication Challenge Options (Biometric Login Step 1)
 */
router.post('/challenge', async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    const { rows } = await db.query('SELECT * FROM admin_users WHERE username = $1 OR email = $1', [username]);
    if (rows.length === 0) return res.status(404).json({ error: 'Operator not found' });
    const admin = rows[0];

    const { rows: authRows } = await db.query('SELECT * FROM admin_authenticators WHERE admin_id = $1', [admin.admin_id]);
    if (authRows.length === 0) {
      return res.json({ success: true, needsRegistration: true });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: authRows.map(row => {
        let credId = row.credential_id;
        if (Buffer.isBuffer(credId)) credId = credId.toString('base64url');
        return {
          id: credId,
          type: 'public-key',
        };
      }),
      userVerification: 'required',
    });

    setChallenge(admin.username, options.challenge);
    return res.json({ success: true, options, needsRegistration: false });
  } catch (e) {
    console.error('Auth Challenge Error:', e);
    next(e);
  }
});

/**
 * 4. LOGIN: Verify Authentication Signature (Biometric Login Step 2)
 */
router.post('/verify', async (req, res, next) => {
  try {
    const { username, credential } = req.body;
    if (!username || !credential) return res.status(400).json({ error: 'Username and credential required' });

    const { rows } = await db.query('SELECT * FROM admin_users WHERE username = $1 OR email = $1', [username]);
    if (rows.length === 0) return res.status(404).json({ error: 'Operator not found' });
    const admin = rows[0];

    const expectedChallenge = getChallenge(admin.username);
    if (!expectedChallenge) return res.status(400).json({ error: 'Challenge expired or missing' });

    let dbCredentialId = Buffer.from(credential.id, 'base64url');
    const { rows: authRows } = await db.query(
      'SELECT * FROM admin_authenticators WHERE admin_id = $1 AND credential_id = $2',
      [admin.admin_id, dbCredentialId]
    );
    if (authRows.length === 0) return res.status(400).json({ error: 'Authenticator not registered for this operator' });
    const authenticator = authRows[0];

    let pubKeyBuffer = authenticator.public_key;
    if (typeof pubKeyBuffer === 'string') {
      pubKeyBuffer = Buffer.from(pubKeyBuffer, /^(?:[0-9a-fA-F]{2})+$/.test(pubKeyBuffer) ? 'hex' : 'base64');
    }
    if (!Buffer.isBuffer(pubKeyBuffer)) {
      pubKeyBuffer = Buffer.from(pubKeyBuffer);
    }

    let credId = authenticator.credential_id;
    if (Buffer.isBuffer(credId)) {
      credId = credId.toString('base64url');
    }

    // Safely coerce counter from DB (which may be string, null, or undefined) into a number
    const dbCounter = authenticator.counter !== null && authenticator.counter !== undefined
      ? Number(authenticator.counter)
      : 0;

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: credId,
        publicKey: pubKeyBuffer,
        counter: dbCounter,
      },
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Biometric verification failed' });
    }

    await db.query(
      'UPDATE admin_authenticators SET counter = $1 WHERE credential_id = $2',
      [verification.authenticationInfo.newCounter, authenticator.credential_id]
    );

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + 8 * 3600 * 1000);

    await db.query(
      `INSERT INTO admin_sessions (admin_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [admin.admin_id, tokenHash, req.ip || '127.0.0.1', req.headers['user-agent'] || 'Unknown', expiresAt]
    );

    clearChallenge(admin.username);
    return res.json({
      success: true,
      sessionToken,
      admin: { admin_id: admin.admin_id, username: admin.username, role: admin.role }
    });
  } catch (e) {
    console.error('Auth Verify Error:', e);
    next(e);
  }
});
/**
 * 5. LOGIN: Email & Password Login
 */
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

router.post('/login', async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Identifier and password required' });

    const attemptKey = `${req.ip || 'unknown'}:${String(identifier).toLowerCase()}`;
    const now = Date.now();
    const attempt = loginAttempts.get(attemptKey);
    if (attempt && attempt.expiresAt > now && attempt.count >= LOGIN_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }
    if (!attempt || attempt.expiresAt <= now) {
      loginAttempts.set(attemptKey, { count: 0, expiresAt: now + LOGIN_WINDOW_MS });
    }

    const { rows } = await db.query(
      'SELECT * FROM admin_users WHERE username = $1 OR email = $1',
      [identifier]
    );
    if (rows.length === 0) {
      const current = loginAttempts.get(attemptKey);
      if (current) current.count += 1;
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const admin = rows[0];

    if (!admin.password_hash) {
      return res.status(400).json({ error: 'Password not set for this account. Use biometric setup.' });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password_hash);
    if (!passwordMatch) {
      const current = loginAttempts.get(attemptKey);
      if (current) current.count += 1;
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    loginAttempts.delete(attemptKey);

    const { rows: authRows } = await db.query(
      'SELECT * FROM admin_authenticators WHERE admin_id = $1',
      [admin.admin_id]
    );

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + 8 * 3600 * 1000);

    await db.query(
      `INSERT INTO admin_sessions (admin_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [admin.admin_id, tokenHash, req.ip || '127.0.0.1', req.headers['user-agent'] || 'Unknown', expiresAt]
    );

    return res.json({
      success: true,
      sessionToken,
      needsBiometricEnrollment: authRows.length === 0,
      admin: { admin_id: admin.admin_id, username: admin.username, role: admin.role }
    });
  } catch (e) {
    console.error('Login Error:', e);
    next(e);
  }
});

/**
 * 6. CREATE ADMIN: Dashboard Action to Add Operators
 */
router.post('/create-admin', verifyAdminToken, async (req, res, next) => {
  try {
    if (req.admin.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden: Superadmin access required' });
    }

    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const { rows } = await db.query(
      `INSERT INTO admin_users (username, email, password_hash, role) 
       VALUES ($1, $2, $3, $4) RETURNING admin_id, username, email, role`,
      [username, email, passwordHash, 'admin']
    );

    return res.json({ success: true, admin: rows[0] });
  } catch (e) {
    console.error('Create Admin Error:', e);
    next(e);
  }
});

module.exports = router;