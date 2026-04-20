'use strict';

const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware: Return 422 with field errors if express-validator found issues.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Next middleware.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  next();
}

/** Validation chain for POST /api/crowd/checkin (User check-in) */
const validateCheckIn = [
  body('zoneId').trim().notEmpty().isString().isLength({ max: 50 }).escape(),
  body('seatNumber').trim().notEmpty().isString().isLength({ max: 20 }).escape(),
  handleValidationErrors,
];

/** Validation chain for POST /api/gemini/recommend (AI chat) */
const validateGeminiQuery = [
  body('query')
    .trim()
    .notEmpty().withMessage('query is required')
    .isString()
    .isLength({ min: 1, max: 2000 }).withMessage('query must be 1–2000 characters')
    .escape(),
  handleValidationErrors,
];

/** Validation chain for POST /api/gemini/announce (Admin PA announcement) */
const validateAnnouncement = [
  body('zoneId').trim().notEmpty().isString().isLength({ max: 50 }).escape(),
  body('density').isFloat({ min: 0, max: 100 }),
  handleValidationErrors,
];

module.exports = {
  handleValidationErrors,
  validateCheckIn,
  validateGeminiQuery,
  validateAnnouncement,
};
