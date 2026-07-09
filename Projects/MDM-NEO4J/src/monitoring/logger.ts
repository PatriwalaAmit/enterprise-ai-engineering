import winston from 'winston';
import path from 'path';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// ─────────────────────────────────────────────────────────────────────────────
// Custom log format
// ─────────────────────────────────────────────────────────────────────────────

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
});

// ─────────────────────────────────────────────────────────────────────────────
// Logger instance
// ─────────────────────────────────────────────────────────────────────────────

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    // Console (colorized for dev)
    new winston.transports.Console({
      format: combine(colorize({ all: true }), logFormat),
    }),
    // File — all logs
    new winston.transports.File({
      filename: path.join('logs', 'app.log'),
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    }),
    // File — errors only
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// Convenience helpers
// ─────────────────────────────────────────────────────────────────────────────

export function logQuery(
  query: string,
  intent: string,
  source: string,
  latencyMs: number
) {
  logger.info('Query processed', { query, intent, source, latencyMs });
}

export function logGraphHit(nodeLabel: string, edgeType: string) {
  logger.debug('Graph hit', { nodeLabel, edgeType });
}

export function logGeminiFallback(query: string, tempNodesCreated: number) {
  logger.warn('Gemini fallback triggered', { query, tempNodesCreated });
}

export function logMerge(promoted: number, rejected: number) {
  logger.info('Merge curator run complete', { promoted, rejected });
}
