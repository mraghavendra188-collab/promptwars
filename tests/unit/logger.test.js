'use strict';

/**
 * SmartStadium AI — Unit Tests: Logger Utility
 */

const { logger } = require('../../server/utils/logger');

describe('Logger Utility', () => {
  let consoleLogSpy, consoleWarnSpy, consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('logger.info calls console.log in development', async () => {
    await logger.info('Test Info', { user: '123' });
    expect(consoleLogSpy).toHaveBeenCalled();
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(output.severity).toBe('INFO');
    expect(output.message).toBe('Test Info');
    expect(output.user).toBe('123');
  });

  test('logger.warn calls console.warn in development', async () => {
    await logger.warn('Test Warning');
    expect(consoleWarnSpy).toHaveBeenCalled();
    const output = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
    expect(output.severity).toBe('WARNING');
  });

  test('logger.error calls console.error in development', async () => {
    await logger.error('Test Error');
    expect(consoleErrorSpy).toHaveBeenCalled();
    const output = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(output.severity).toBe('ERROR');
  });

  test('logger.debug calls console.log in development', async () => {
    await logger.debug('Test Debug');
    expect(consoleLogSpy).toHaveBeenCalled();
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(output.severity).toBe('DEBUG');
  });
});
