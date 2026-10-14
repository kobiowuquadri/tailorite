import type { LoggerService } from '@nestjs/common';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Structured JSON logs on stdout. Callers pass identifiers and measurements only —
 * never request bodies, customer conversations, tokens or file contents.
 */
export class JsonLogger implements LoggerService {
  constructor(
    private readonly minLevel: Level = 'info',
    private readonly service = 'api',
  ) {}

  private write(level: Level, message: unknown, context?: string, extra?: Record<string, unknown>) {
    if (ORDER[level] < ORDER[this.minLevel]) return;
    const entry: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      service: this.service,
    };
    if (context) entry.context = context;
    if (message instanceof Error) {
      entry.msg = message.message;
      entry.errorName = message.name;
      if (level === 'error' && message.stack) entry.stack = message.stack;
    } else if (typeof message === 'object' && message !== null) {
      Object.assign(entry, message);
    } else {
      entry.msg = String(message);
    }
    if (extra) Object.assign(entry, extra);
    const line = JSON.stringify(entry, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }

  log(message: unknown, context?: string) {
    this.write('info', message, context);
  }
  error(message: unknown, stackOrContext?: string, context?: string) {
    // Nest calls error(message, stack, context); keep the stack only for error-level output.
    const ctx = context ?? (stackOrContext && !stackOrContext.includes('\n') ? stackOrContext : undefined);
    const stack = stackOrContext && stackOrContext.includes('\n') ? stackOrContext : undefined;
    this.write('error', message, ctx, stack ? { stack } : undefined);
  }
  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }
  verbose(message: unknown, context?: string) {
    this.write('debug', message, context);
  }
  /** Structured event with explicit fields. */
  event(level: Level, msg: string, fields: Record<string, unknown>, context?: string) {
    this.write(level, { msg, ...fields }, context);
  }
}

let shared: JsonLogger = new JsonLogger('info');

export function setSharedLogger(logger: JsonLogger) {
  shared = logger;
}

/** Process-wide logger for code outside Nest's DI (and for structured events inside it). */
export function logger(): JsonLogger {
  return shared;
}
