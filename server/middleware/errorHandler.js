'use strict';

const { logger } = require('../utils/logger');

/**
 * Global Error Handler
 * Ensures consistent error responses and structured logging.
 */
module.exports = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error('Unhandled request error', {
    status,
    message,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });

  res.status(status).json({
    error: process.env.NODE_ENV === 'production' 
      ? (status === 500 ? 'Internal server error' : message)
      : message,
    timestamp: new Date().toISOString(),
  });
};
