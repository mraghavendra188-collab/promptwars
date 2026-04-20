'use strict';

const { verifyToken } = require('../services/firebase-admin');
const { logger } = require('../utils/logger');

/**
 * Middleware: Verify Firebase ID token from Authorization header.
 * Attaches decoded user to req.user.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    const token = header.slice(7);
    const decoded = await verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn('Auth verification failed', { error: err.message });
    return res.status(401).json({ error: 'Unauthorized — invalid token' });
  }
}

/**
 * Middleware factory: Require a specific role.
 * @param {...string} roles - Allowed roles (e.g. 'admin', 'staff')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user?.role || req.user?.customClaims?.role || 'attendee';
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: `Forbidden — requires one of: ${roles.join(', ')}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
