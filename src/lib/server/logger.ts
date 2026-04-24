// src/lib/server/logger.ts
// Source: 00-RESEARCH.md §Q5 "pino configuration"; §Security Domain redact paths.
// This replaces the Plan 00 placeholder. The API shape (info/warn/error/child)
// is preserved so existing DAL and scheduler imports keep working across phases.
import { pino, stdSerializers, type Logger } from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',

  // Dev: pretty-print to a TTY. Prod: JSON lines for log shippers.
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' }
        }
      }
    : {}),

  // Every line carries these — makes Better Stack filtering trivial.
  base: {
    app: 'fishcount',
    env: process.env.NODE_ENV ?? 'production'
  },

  // Redaction: strip sensitive fields before they hit stdout.
  // Paths per 00-RESEARCH.md §Security Domain: authorization headers,
  // cookies, any email field, password/token keys at any depth.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'request.headers.authorization',
      'request.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      '*.email',
      '*.password',
      '*.token',
      'password',
      'token',
      'apiKey',
      'access_token',
      'refresh_token',
      'secret'
    ],
    censor: '[REDACTED]'
  },

  // ISO timestamps are human-readable in log tools; numeric epoch is faster
  // but harder to debug. Better Stack handles ISO natively.
  timestamp: pino.stdTimeFunctions.isoTime,

  // Serialize errors so stack traces survive JSON encoding.
  // (pino's types only expose stdTimeFunctions on the `pino` namespace,
  // not stdSerializers — so we import the latter as a named value.)
  serializers: {
    err: stdSerializers.err,
    error: stdSerializers.err
  }
});
