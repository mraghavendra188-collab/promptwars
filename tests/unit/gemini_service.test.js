'use strict';

/**
 * SmartStadium AI — Unit Tests: Gemini Service
 * Uses jest.mock() to prevent actual API calls.
 */

// ── Mock the Google GenAI SDK before requiring the service ────────────────
const mockGenerateContentStream = jest.fn();
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContentStream: mockGenerateContentStream,
  generateContent: mockGenerateContent,
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
  },
}));

// Set env var BEFORE requiring the module so getModel() doesn't guard-throw
process.env.GEMINI_API_KEY = 'test-api-key-for-unit-tests';

const geminiService = require('../../server/services/gemini');

// ─── Helper to build mock stream chunks ──────────────────────────────────
function makeMockStream(chunks) {
  return {
    stream: (async function* () {
      for (const text of chunks) {
        yield { text: () => text };
      }
    })(),
    response: Promise.resolve({ text: () => chunks.join('') }),
  };
}

// ─── buildGateRecommendationPrompt ───────────────────────────────────────

describe('buildGateRecommendationPrompt', () => {
  test('includes gate data in the prompt', () => {
    const gateData = [
      { gateId: 'gate-a', waitTime: 3, queueLength: 450 },
      { gateId: 'gate-b', waitTime: 1, queueLength: 150 },
    ];
    const prompt = geminiService.buildGateRecommendationPrompt(gateData, 'Section 23');
    expect(prompt).toContain('gate-a');
    expect(prompt).toContain('gate-b');
    expect(prompt).toContain('Section 23');
  });

  test('handles empty gate list gracefully', () => {
    const prompt = geminiService.buildGateRecommendationPrompt([], 'VIP');
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('returns a string', () => {
    const prompt = geminiService.buildGateRecommendationPrompt([], 'A1');
    expect(typeof prompt).toBe('string');
  });
});

// ─── buildAnnouncementPrompt ─────────────────────────────────────────────

describe('buildAnnouncementPrompt', () => {
  test('includes zone and density in announcement prompt', () => {
    const prompt = geminiService.buildAnnouncementPrompt('north-stand', 85);
    expect(prompt).toContain('north-stand');
    expect(prompt).toContain('85');
  });

  test('returns a non-empty string', () => {
    const prompt = geminiService.buildAnnouncementPrompt('east-stand', 50);
    expect(prompt).toBeTruthy();
  });
});

// ─── sanitizeUserQuery ────────────────────────────────────────────────────

describe('sanitizeUserQuery', () => {
  test('strips HTML tags', () => {
    const result = geminiService.sanitizeUserQuery('<script>alert("xss")</script>hello');
    expect(result).not.toContain('<script>');
    expect(result).toContain('hello');
  });

  test('trims whitespace', () => {
    expect(geminiService.sanitizeUserQuery('  hello world  ')).toBe('hello world');
  });

  test('truncates very long queries', () => {
    const longQuery = 'a'.repeat(5000);
    const result = geminiService.sanitizeUserQuery(longQuery);
    expect(result.length).toBeLessThanOrEqual(2000);
  });

  test('handles empty string', () => {
    expect(geminiService.sanitizeUserQuery('')).toBe('');
  });

  test('handles null/undefined gracefully', () => {
    expect(geminiService.sanitizeUserQuery(null)).toBe('');
    expect(geminiService.sanitizeUserQuery(undefined)).toBe('');
  });
});

// ─── generateRecommendation (streaming) ──────────────────────────────────

describe('generateRecommendation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('calls generateContentStream with the correct prompt', async () => {
    mockGenerateContentStream.mockResolvedValue(makeMockStream(['Go to Gate B.']));

    const chunks = [];
    await geminiService.generateRecommendation('Where is the shortest queue?', (chunk) => {
      chunks.push(chunk);
    });

    expect(mockGenerateContentStream).toHaveBeenCalledTimes(1);
    expect(chunks.join('')).toBe('Go to Gate B.');
  });

  test('handles API errors gracefully', async () => {
    mockGenerateContentStream.mockRejectedValue(new Error('API quota exceeded'));

    await expect(
      geminiService.generateRecommendation('test query', jest.fn())
    ).rejects.toThrow('API quota exceeded');
  });

  test('sanitizes the query before sending to Gemini', async () => {
    mockGenerateContentStream.mockResolvedValue(makeMockStream(['Safe response.']));

    await geminiService.generateRecommendation(
      '<b>malicious</b> query',
      jest.fn()
    );

    const calledWith = mockGenerateContentStream.mock.calls[0][0];
    const promptText = typeof calledWith === 'string' ? calledWith : JSON.stringify(calledWith);
    expect(promptText).not.toContain('<b>');
  });
});

// ─── generateAnnouncement ────────────────────────────────────────────────

describe('generateAnnouncement', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns a string announcement from Gemini', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'Please move to Gate C, which has shorter queues.' },
    });

    const announcement = await geminiService.generateAnnouncement('north-stand', 90);
    expect(typeof announcement).toBe('string');
    expect(announcement.length).toBeGreaterThan(0);
  });

  test('handles Gemini errors by returning a fallback announcement', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Service unavailable'));

    const announcement = await geminiService.generateAnnouncement('south-stand', 95);
    expect(typeof announcement).toBe('string');
    expect(announcement.length).toBeGreaterThan(0);
  });
});
