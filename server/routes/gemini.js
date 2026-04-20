'use strict';

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { generateRecommendation, generateAnnouncement } = require('../services/gemini');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validateGeminiQuery, validateAnnouncement } = require('../middleware/validation');
const { createGeminiLimiter } = require('../middleware/rateLimit');

const geminiLimiter = createGeminiLimiter();

/**
 * POST /api/gemini/recommend
 * Stream a Gemini recommendation for the user's crowd query.
 * Rate-limited: 20 req/min per IP.
 */
router.post('/recommend', geminiLimiter, validateGeminiQuery, async (req, res) => {
  try {
    const { query } = req.body;

    // Use SSE for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await generateRecommendation(query, (chunk) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    logger.error('POST /gemini/recommend failed', { error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI recommendation failed. Please try again.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
      res.end();
    }
  }
});

/**
 * POST /api/gemini/announce
 * Generate a PA announcement for a crowd-dense zone (admin/staff only).
 */
router.post('/announce', requireAuth, requireRole('admin', 'staff'), validateAnnouncement, async (req, res) => {
  try {
    const { zoneId, density } = req.body;
    const announcement = await generateAnnouncement(zoneId, density);
    logger.info('Announcement generated', { zoneId, density, requestedBy: req.user.uid });
    res.json({ announcement, zoneId, density, generatedAt: new Date().toISOString() });
  } catch (err) {
    logger.error('POST /gemini/announce failed', { error: err.message });
    res.status(500).json({ error: 'Announcement generation failed' });
  }
});

module.exports = router;
