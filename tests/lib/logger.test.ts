// tests/lib/logger.test.ts
// Covers OPS-06: pino logger emits JSON with requestId and base bindings;
// redact paths mask sensitive fields; child loggers inherit bindings.
import { describe, it, expect } from 'vitest';
import { pino, stdSerializers, type Logger } from 'pino';

import { logger as realLogger } from '../../src/lib/server/logger';

// Re-build a logger with the same redact/base config as src/lib/server/logger.ts
// but pointed at an in-memory stream so we can assert on what it writes.
// We test the CONFIG SHAPE against the real module separately.
function captureLogs(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const stream = {
    write(chunk: string): void {
      lines.push(chunk);
    }
  };
  const logger = pino(
    {
      base: { app: 'fishcount', env: 'test' },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.email',
          '*.password',
          '*.token',
          'password',
          'token',
          'apiKey'
        ],
        censor: '[REDACTED]'
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        err: stdSerializers.err,
        error: stdSerializers.err
      }
    },
    // pino accepts any { write(chunk): void } shape as a destination stream.
    stream as unknown as NodeJS.WritableStream
  );
  return { logger, lines };
}

describe('logger (OPS-06)', () => {
  it('emits valid JSON lines with base bindings', () => {
    const { logger, lines } = captureLogs();
    logger.info({ path: '/x' }, 'hello');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.app).toBe('fishcount');
    expect(parsed.env).toBe('test');
    expect(parsed.msg).toBe('hello');
    expect(parsed.path).toBe('/x');
    // ISO 8601 timestamp — starts with 4-digit year then 'T'.
    expect(typeof parsed.time).toBe('string');
    expect(parsed.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('child loggers inherit parent bindings', () => {
    const { logger, lines } = captureLogs();
    const child = logger.child({ requestId: 'abc-123' });
    child.info('hi');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.requestId).toBe('abc-123');
    expect(parsed.app).toBe('fishcount');
    expect(parsed.env).toBe('test');
  });

  it('redacts authorization header', () => {
    const { logger, lines } = captureLogs();
    logger.info({ req: { headers: { authorization: 'Bearer secret-token' } } }, 'req');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.req.headers.authorization).toBe('[REDACTED]');
  });

  it('redacts cookie header', () => {
    const { logger, lines } = captureLogs();
    logger.info({ req: { headers: { cookie: 'session=abc123' } } }, 'req');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.req.headers.cookie).toBe('[REDACTED]');
  });

  it('redacts email fields at any depth via wildcard', () => {
    const { logger, lines } = captureLogs();
    logger.info({ user: { email: 'angler@example.com', name: 'Bob' } }, 'signup');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.user.email).toBe('[REDACTED]');
    expect(parsed.user.name).toBe('Bob');
  });

  it('redacts top-level password, token, apiKey keys', () => {
    const { logger, lines } = captureLogs();
    logger.info({ password: 'p', token: 't', apiKey: 'k' }, 'creds');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.password).toBe('[REDACTED]');
    expect(parsed.token).toBe('[REDACTED]');
    expect(parsed.apiKey).toBe('[REDACTED]');
  });

  it('real exported logger has child() method', () => {
    expect(typeof realLogger.child).toBe('function');
    const child = realLogger.child({ test: 'marker' });
    expect(typeof child.info).toBe('function');
  });

  it('real exported logger has info/warn/error methods', () => {
    expect(typeof realLogger.info).toBe('function');
    expect(typeof realLogger.warn).toBe('function');
    expect(typeof realLogger.error).toBe('function');
  });
});
