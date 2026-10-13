import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const positiveInt = z.coerce.number().int().positive();

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: positiveInt.default(4000),
    APP_ORIGIN: z
      .url({ message: 'must be an absolute URL such as http://localhost:3000' })
      .transform((v) => v.replace(/\/+$/, '')),
    TRUST_PROXY: z.string().default('loopback'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    DATABASE_URL: z
      .string({ message: 'is required (PostgreSQL connection string)' })
      .regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// connection string'),
    DATABASE_POOL_MAX: positiveInt.default(10),

    SESSION_SECRET: z
      .string({ message: 'is required (32+ random characters)' })
      .min(32, 'must be at least 32 characters'),
    SESSION_TTL_DAYS: positiveInt.default(30),
    SESSION_IDLE_DAYS: positiveInt.default(7),
    COOKIE_SECURE: bool.default(false),

    JOB_QUEUE_BACKEND: z.enum(['redis', 'postgres']).default('postgres'),
    REDIS_URL: z.string().optional(),
    WORKER_CONCURRENCY: positiveInt.max(16).default(2),
    EXTRACTION_MAX_ATTEMPTS: positiveInt.max(10).default(3),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('.local/storage'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(true),

    AI_MODE: z.enum(['live', 'fixture', 'off']).default('live'),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_EXTRACTION_MODEL: z.string().min(1).default('gemini-3.8-flash'),
    GEMINI_TRANSCRIPTION_MODEL: z.string().min(1).default('gemini-3.8-flash'),
    AI_REQUEST_TIMEOUT_MS: positiveInt.default(120_000),
    AI_MAX_OUTPUT_TOKENS: positiveInt.default(8192),
    AI_MAX_JOBS_PER_STUDIO_PER_DAY: positiveInt.default(40),
    AI_MAX_SOURCES_PER_JOB: positiveInt.default(12),
    AI_MAX_INPUT_MB_PER_JOB: positiveInt.default(30),

    UPLOAD_MAX_IMAGE_MB: positiveInt.default(10),
    UPLOAD_MAX_AUDIO_MB: positiveInt.default(25),
    UPLOAD_MAX_AUDIO_SECONDS: positiveInt.default(600),
    UPLOAD_MAX_ORDER_TOTAL_MB: positiveInt.default(150),
    UPLOAD_MAX_SOURCES_PER_ORDER: positiveInt.default(40),
    TEXT_SOURCE_MAX_CHARS: positiveInt.default(20_000),

    APPROVAL_LINK_TTL_DAYS: positiveInt.max(90).default(14),
    CHANGE_LINK_TTL_DAYS: positiveInt.max(90).default(7),
    PORTAL_SESSION_TTL_MINUTES: positiveInt.max(24 * 60).default(120),

    DEMO_SANDBOX_ENABLED: bool.default(true),
    DEMO_SANDBOX_TTL_HOURS: positiveInt.default(24),
    DEMO_SANDBOX_AI: z.enum(['fixture', 'live']).default('fixture'),
    ALLOW_DEMO_SEED: bool.default(false),
    DEMO_OWNER_EMAIL: z.string().default('demo@tailorite.local'),
    DEMO_OWNER_PASSWORD: z.string().optional(),

    /** Test-only switch: replaces the AI provider with a deterministic fake. Ignored outside NODE_ENV=test. */
    AI_TEST_FAKE: bool.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.JOB_QUEUE_BACKEND === 'redis' && !env.REDIS_URL) {
      ctx.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'is required when JOB_QUEUE_BACKEND=redis' });
    }
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'is required when STORAGE_DRIVER=s3' });
      }
    }
    if (env.NODE_ENV === 'production') {
      if (env.STORAGE_DRIVER === 'local') {
        ctx.addIssue({
          code: 'custom',
          path: ['STORAGE_DRIVER'],
          message: 'must be "s3" in production (local disk is not durable private object storage)',
        });
      }
      if (/replace-with|change-me|placeholder/i.test(env.SESSION_SECRET)) {
        ctx.addIssue({ code: 'custom', path: ['SESSION_SECRET'], message: 'still contains the example placeholder' });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Parses process.env into typed configuration, collecting every problem into one readable error. */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  // Treat empty strings as "not set" so optional values in .env files behave intuitively.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const key = issue.path.join('.') || '(root)';
      const message =
        issue.code === 'invalid_type' && issue.input === undefined ? 'is required' : issue.message;
      return `${key} ${message}`;
    });
    throw new ConfigError(problems);
  }
  return result.data;
}

export const MB = 1024 * 1024;
