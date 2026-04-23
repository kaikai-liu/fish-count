// Placeholder logger. Plan 02 (OPS-06 structured logging) replaces this with full pino config.
// DO NOT delete this export shape — src/hooks.server.ts imports it.
export const logger = {
  info: (...a: unknown[]) => console.log(JSON.stringify({ level: 'info', msg: a })),
  warn: (...a: unknown[]) => console.warn(JSON.stringify({ level: 'warn', msg: a })),
  error: (...a: unknown[]) => console.error(JSON.stringify({ level: 'error', msg: a })),
  child: (_bindings: Record<string, unknown>) => logger
};
