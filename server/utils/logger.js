'use strict';

/**
 * SmartStadium AI — Cloud Logging Utility
 * Structured logger with Google Cloud Logging integration.
 * Falls back to console in local development.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

let cloudLogger;

async function getCloudLogger() {
  if (cloudLogger) return cloudLogger;
  try {
    const { Logging } = require('@google-cloud/logging');
    const logging = new Logging({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
    cloudLogger = logging.log('smartstadium-api');
  } catch {
    cloudLogger = null;
  }
  return cloudLogger;
}

/**
 * Write a structured log entry.
 * @param {'INFO'|'WARNING'|'ERROR'|'DEBUG'} severity
 * @param {string} message
 * @param {Object} [meta]
 */
async function writeLog(severity, message, meta = {}) {
  const entry = {
    severity,
    message,
    timestamp: new Date().toISOString(),
    service: 'smartstadium-api',
    ...meta,
  };

  if (IS_PROD) {
    try {
      const log = await getCloudLogger();
      if (log) {
        const logEntry = log.entry({ severity }, entry);
        await log.write(logEntry);
        return;
      }
    } catch {
      // Fall through to console
    }
  }

  const consoleFn = severity === 'ERROR' ? console.error : severity === 'WARNING' ? console.warn : console.log;
  consoleFn(JSON.stringify(entry));
}

const logger = {
  info:  (msg, meta) => writeLog('INFO', msg, meta),
  warn:  (msg, meta) => writeLog('WARNING', msg, meta),
  error: (msg, meta) => writeLog('ERROR', msg, meta),
  debug: (msg, meta) => writeLog('DEBUG', msg, meta),
};

module.exports = { logger };
