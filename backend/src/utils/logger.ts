import pino from 'pino';
import { env } from '../config/env';

/**
 * Structured logger. Sensitive fields are redacted at the serializer level so passwords,
 * tokens and cookies can never reach log storage.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.token',
      '*.passwordHash',
    ],
    censor: '[redacted]',
  },
  transport:
    !env.isProd && !env.isTest
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});
