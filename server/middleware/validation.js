'use strict';

const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware: Return 422 with field errors if validation failed.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  next();
}

/** Validation chain for POST /api/crowd/checkin */
const validateCheckIn = [
  body('zoneId').trim().notEmpty().isString().isLength({ max: 50 }),
  body('seatNumber').trim().notEmpty().isString().isLength({ max: 20 }),
  handleValidationErrors,
];

/** Validation chain for POST /api/gemini/recommend */
const validateGeminiQuery = [
  body('query')
    .trim()
    .notEmpty().withMessage('query is required')
    .isString()
    .isLength({ min: 1, max: 2000 }).withMessage('query must be 1–2000 characters'),
  handleValidationErrors,
];

/** Validation chain for POST /api/gemini/announce */
const validateAnnouncement = [
  body('zoneId').trim().notEmpty().isString().isLength({ max: 50 }),
  body('density').isFloat({ min: 0, max: 100 }),
  handleValidationErrors,
];

module.exports = {
  handleValidationErrors,
  validateCheckIn,
  validateGeminiQuery,
  validateAnnouncement,
};
