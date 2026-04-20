'use strict';

const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');
const { LIMITS } = require('../constants');

/**
 * General API rate limiter — 100 requests per 15 minutes per IP.
 * @returns {Function} Express rate limit middleware.
 */
function createApiLimiter() {
  return rateLimit({
    windowMs: LIMITS.API_WINDOW_MS,
    max: LIMITS.API_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again in 15 minutes.' },
  });
}

/**
 * Strict limiter for Gemini endpoints — 20 requests per minute per IP.
 * @returns {Function} Express rate limit middleware.
 */
function createGeminiLimiter() {
  return rateLimit({
    windowMs: LIMITS.GEMINI_WINDOW_MS,
    max: LIMITS.GEMINI_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Gemini rate limit reached. Please wait a moment.' },
  });
}

/**
 * Auth endpoints — 10 requests per 15 minutes to prevent brute force.
 * @returns {Function} Express rate limit middleware.
 */
function createAuthLimiter() {
  return rateLimit({
    windowMs: LIMITS.AUTH_WINDOW_MS,
    max: LIMITS.AUTH_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts. Please try again later.' },
  });
}

module.exports = { createApiLimiter, createGeminiLimiter, createAuthLimiter };
