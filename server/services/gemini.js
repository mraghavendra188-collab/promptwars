'use strict';

/**
 * SmartStadium AI — Gemini Service
 * Wraps @google/generative-ai with streaming support, prompt builders,
 * input sanitization, and safe fallbacks.
 */

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const { LIMITS } = require('../constants');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const MAX_QUERY_LENGTH = LIMITS.MAX_QUERY_LENGTH;

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

const SYSTEM_CONTEXT = `You are SmartStadium AI, an intelligent assistant helping fans navigate 
a large cricket stadium during an IPL match. You provide concise, helpful recommendations about 
crowd flow, gate selection, food stall queues, and restroom availability. 
Always be positive, safety-conscious, and brief (under 100 words per response).`;

let genAI;
let model;

function getModel() {
  if (!model) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      safetySettings: SAFETY_SETTINGS,
    });
  }
  return model;
}

/**
 * Sanitize user input by stripping HTML, removing potential injection characters,
 * and enforcing length limits.
 * @param {string|null|undefined} input - The raw user input.
 * @returns {string} The cleaned input.
 */
function sanitizeUserQuery(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/[<>'";\\]/g, '') // Remove potential command/injection characters
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

/**
 * Build a structured gate recommendation prompt.
 * @param {Array<{gateId: string, waitTime: number, queueLength: number}>} gateData
 * @param {string} userSection - Fan's current section
 * @returns {string}
 */
function buildGateRecommendationPrompt(gateData, userSection) {
  const gateList = gateData.length > 0
    ? gateData.map((g) => `  - ${g.gateId}: ${g.waitTime} min wait (${g.queueLength} people)`).join('\n')
    : '  - No gate data currently available';

  return `${SYSTEM_CONTEXT}

Current gate wait times:
${gateList}

Fan's current section: ${userSection || 'Unknown'}

Recommend the best gate to use right now. Be specific and mention the time savings.`;
}

/**
 * Build a PA announcement prompt for a high-density zone.
 * @param {string} zoneId
 * @param {number} density
 * @returns {string}
 */
function buildAnnouncementPrompt(zoneId, density) {
  return `${SYSTEM_CONTEXT}

Generate a brief, calm PA announcement for stadium staff. 
Zone: ${zoneId} is at ${density}% capacity.
The announcement should direct fans to alternative areas and remain calm and reassuring.
Keep it under 50 words.`;
}

/**
 * Stream a Gemini response for a user query, calling onChunk for each token.
 * @param {string} rawQuery - Raw user input (will be sanitized)
 * @param {(chunk: string) => void} onChunk - Called for each streamed token
 * @returns {Promise<void>}
 */
async function generateRecommendation(rawQuery, onChunk) {
  const query = sanitizeUserQuery(rawQuery);
  const prompt = `${SYSTEM_CONTEXT}\n\nFan question: ${query}`;

  const result = await getModel().generateContentStream(prompt);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) onChunk(text);
  }
}

/**
 * Generate a non-streaming PA announcement via Gemini.
 * Falls back to a pre-written announcement if Gemini fails.
 * @param {string} zoneId
 * @param {number} density
 * @param {string} zoneId - The ID of the zone.
 * @param {number} density - The current density percentage.
 * @returns {Promise<string>} The generated announcement.
 */
async function generateAnnouncement(zoneId, density) {
  try {
    const prompt = buildAnnouncementPrompt(zoneId, density);
    const result = await getModel().generateContent(prompt);
    return result.response.text();
  } catch (err) {
    // Graceful fallback — never block stadium operations due to AI failure
    return `Attention: ${zoneId.replace(/-/g, ' ')} is at ${density}% capacity. ` +
           `Please consider moving to an alternative area. Thank you.`;
  }
}

module.exports = {
  generateRecommendation,
  generateAnnouncement,
  sanitizeUserQuery,
  buildGateRecommendationPrompt,
  buildAnnouncementPrompt,
  // Exposed for testing only — resets the cached model singleton
  _resetForTesting: () => { model = null; genAI = null; },
};
