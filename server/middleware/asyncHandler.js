'use strict';

/**
 * Async Handler Wrapper
 * Eliminates the need for try/catch blocks in every route.
 * @param {Function} fn - The async route handler
 */
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
