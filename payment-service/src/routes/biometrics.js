'use strict';

const express = require('express');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const db = require('../db');
const { verifyAdminToken } = require('./admin');

const router = express.Router();

const rpName = 'UniPay Secure Admin';
const rpID = process.env.RP_ID || 'localhost'; // Update to your domain in production
const expectedOrigin = process.env.ORIGIN || 'http://localhost:3000';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const challengeStore = new Map();

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
 * 1. Generate registration options for binding a device biometric (FaceID/TouchID)
 */
router.post('/admin/biometric/register-options', verifyAdminToken, async (req, res, next) => {
  try {
    const adminId = req.admin.admin_id;

    const { rows: existingKeys } = await db.query(
      `SELECT credential_id FROM admin_authenticators WHERE admin_id = $1`,
      [adminId]
    );

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(adminId),
      userName: req.admin.username,
      attestationType: 'none',
      excludeCredentials: existingKeys.map(k => ({
        id: k.credential_id,
        type: 'public-key',
      })),
      authenticatorSelection: {
        authenticatorAttachment: 'platform', // Forces device biometrics (Face ID/Touch ID/Windows Hello)
        userVerification: 'required',
      },
    });

    setChallenge(adminId, options.challenge);
    res.json(options);
  } catch (e) {
    next(e);
  }
});

/**
 * 2. Verify and save the device biometric registration response
 */
router.post('/admin/biometric/register-verify', verifyAdminToken, async (req, res, next) => {
  try {
    const adminId = req.admin.admin_id;
    const expectedChallenge = getChallenge(adminId);
    const body = req.body;

    if (!expectedChallenge) {
      return res.status(400).json({ error: 'No active challenge found' });
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialPublicKey, counter } = verification.registrationInfo;

      const credentialId = Buffer.from(credential.id, 'base64url');
      await db.query(
        `INSERT INTO admin_authenticators (credential_id, admin_id, public_key, counter, transports)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (credential_id) DO NOTHING`,
        [
          credentialId,
          adminId,
          Buffer.from(credentialPublicKey),
          counter,
          credential.transports || []
        ]
      );

      clearChallenge(adminId);
      return res.json({ success: true });
    }

    res.status(400).json({ success: false, error: 'Verification failed' });
  } catch (e) {
    next(e);
  }
});

/**
 * 3. Generate authentication challenge for unlocking/logging in via biometrics
 */
router.post('/admin/biometric/auth-options', async (req, res, next) => {
  try {
    const { username } = req.body;
    const { rows: userRows } = await db.query(`SELECT admin_id FROM admin_users WHERE username = $1`, [username]);

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const adminId = userRows[0].admin_id;

    const { rows: authRows } = await db.query(
      `SELECT credential_id, transports FROM admin_authenticators WHERE admin_id = $1`,
      [adminId]
    );

    if (authRows.length === 0) {
      return res.status(400).json({ error: 'No biometrics registered for this account' });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: authRows.map(row => ({
        id: row.credential_id,
        type: 'public-key',
        transports: row.transports,
      })),
      userVerification: 'required',
    });

    setChallenge(adminId, options.challenge);
    res.json({ options, adminId });
  } catch (e) {
    next(e);
  }
});

/**
 * 4. Verify biometric assertion to unlock or login
 */
router.post('/admin/biometric/auth-verify', async (req, res, next) => {
  try {
    const { adminId, body } = req.body;
    const expectedChallenge = getChallenge(adminId);

    if (!expectedChallenge) {
      return res.status(400).json({ error: 'Challenge expired or missing' });
    }

    const { rows: authRows } = await db.query(
      `SELECT public_key, counter, transports FROM admin_authenticators WHERE credential_id = $1 AND admin_id = $2`,
      [body.id, adminId]
    );

    if (authRows.length === 0) {
      return res.status(404).json({ error: 'Authenticator not registered' });
    }

    const authenticator = authRows[0];

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: body.id,
        publicKey: Buffer.isBuffer(authenticator.public_key)
          ? authenticator.public_key
          : Buffer.from(authenticator.public_key, typeof authenticator.public_key === 'string' && /^(?:[0-9a-fA-F]{2})+$/.test(authenticator.public_key) ? 'hex' : 'base64'),
        counter: Number(authenticator.counter),
      },
    });

    if (verification.verified) {
      await db.query(
        `UPDATE admin_authenticators SET counter = $1 WHERE credential_id = $2`,
        [verification.authenticationInfo.newCounter, body.id]
      );
      clearChallenge(adminId);
      return res.json({ success: true, message: 'Biometric authorization successful' });
    }

    res.status(400).json({ success: false, error: 'Biometric check failed' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;