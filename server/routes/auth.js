'use strict';

const express = require('express');
const router = express.Router();
const { createAuthLimiter } = require('../middleware/rateLimit');
const { logger } = require('../utils/logger');

const authLimiter = createAuthLimiter();

/**
 * POST /api/auth/verify
 * Verify a Firebase ID token and return user profile + role.
 * Token is validated server-side via Firebase Admin SDK.
 */
router.post('/verify', authLimiter, async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }
    const token = header.slice(7);
    const { verifyToken } = require('../services/firebase-admin');
    const decoded = await verifyToken(token);

    const role = decoded.role || decoded.customClaims?.role || 'attendee';
    logger.info('Token verified', { uid: decoded.uid, role });

    res.json({
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      role,
      emailVerified: decoded.email_verified,
    });
  } catch (err) {
    logger.warn('Token verification failed', { error: err.message });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

/**
 * GET /api/auth/config
 * Return public Firebase config for client-side initialization.
 * Only returns non-secret config values.
 */
router.get('/config', (req, res) => {
  res.json({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
    apiKey: process.env.FIREBASE_WEB_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    storageBucket: process.env.STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    geminiApiKey: process.env.GEMINI_WEB_API_KEY || '',
  });
});

module.exports = router;
