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

    /** redis: BullMQ on Redis · postgres: BullMQ's PostgreSQL backend · database: the worker polls the
     *  ExtractionJob table directly (no extra connections; for small databases with tight limits). */
    JOB_QUEUE_BACKEND: z.enum(['redis', 'postgres', 'database']).default('postgres'),
    JOB_POLL_INTERVAL_MS: positiveInt.min(250).max(60_000).default(2000),
    /** Run the extraction worker inside the API process (single-service hosting, e.g. free tiers). */
    WORKER_IN_API: bool.default(false),
    REDIS_URL: z.string().optional(),
    WORKER_CONCURRENCY: positiveInt.max(16).default(2),
    EXTRACTION_MAX_ATTEMPTS: positiveInt.max(10).default(3),
    /** Delay before the first automatic retry; later retries back off ×4 (capped at 10 minutes). */
    EXTRACTION_RETRY_BASE_MS: positiveInt.max(600_000).default(20_000),

    STORAGE_DRIVER: z.enum(['local', 's3', 'cloudinary']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('.local/storage'),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: bool.default(true),
    /** Create the private bucket on first use when it is missing. Defaults to true outside production. */
    S3_CREATE_BUCKET: bool.optional(),
    /** Cloudinary: set CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud>) or the three parts. */
    CLOUDINARY_URL: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    CLOUDINARY_FOLDER: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)*$/, 'letters, digits, "-", "_" and "/" only')
      .default('tailorite'),

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
    if (env.STORAGE_DRIVER === 'cloudinary') {
      for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'is required when STORAGE_DRIVER=cloudinary (or set CLOUDINARY_URL)' });
        }
      }
    }
    if (env.NODE_ENV === 'production') {
      if (env.STORAGE_DRIVER === 'local') {
        ctx.addIssue({
          code: 'custom',
          path: ['STORAGE_DRIVER'],
          message: 'must be "s3" or "cloudinary" in production (local disk is not durable private object storage)',
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
/** Encrypted connection without certificate verification (libpq `sslmode=require` semantics). */
export const DATABASE_TLS_PARAMS = 'sslmode=require&uselibpqcompat=true';

/**
 * Hosting add-ons inject their own variable names (Clever Cloud: PostgreSQL and Cellar). They are
 * used only when Tailorite's own variables are not set, so explicit configuration always wins.
 */
export function withPlatformDefaults(source: Record<string, string | undefined>): Record<string, string | undefined> {
  const env = { ...source };
  const blank = (key: string) => !env[key] || env[key]!.trim() === '';
  if (blank('DATABASE_URL') && env.POSTGRESQL_ADDON_URI) {
    const uri = env.POSTGRESQL_ADDON_URI;
    env.DATABASE_URL = /[?&]sslmode=/.test(uri) ? uri : `${uri}${uri.includes('?') ? '&' : '?'}${DATABASE_TLS_PARAMS}`;
  }
  if (blank('S3_ENDPOINT') && env.CELLAR_ADDON_HOST) {
    env.S3_ENDPOINT = /^https?:\/\//.test(env.CELLAR_ADDON_HOST) ? env.CELLAR_ADDON_HOST : `https://${env.CELLAR_ADDON_HOST}`;
  }
  if (blank('S3_ACCESS_KEY_ID') && env.CELLAR_ADDON_KEY_ID) env.S3_ACCESS_KEY_ID = env.CELLAR_ADDON_KEY_ID;
  if (blank('S3_SECRET_ACCESS_KEY') && env.CELLAR_ADDON_KEY_SECRET) env.S3_SECRET_ACCESS_KEY = env.CELLAR_ADDON_KEY_SECRET;
  // Cloudinary shows one "API environment variable": cloudinary://<api_key>:<api_secret>@<cloud_name>.
  const cloudinary = parseCloudinaryUrl(env.CLOUDINARY_URL);
  if (cloudinary) {
    if (blank('CLOUDINARY_CLOUD_NAME')) env.CLOUDINARY_CLOUD_NAME = cloudinary.cloudName;
    if (blank('CLOUDINARY_API_KEY')) env.CLOUDINARY_API_KEY = cloudinary.apiKey;
    if (blank('CLOUDINARY_API_SECRET')) env.CLOUDINARY_API_SECRET = cloudinary.apiSecret;
    if (blank('STORAGE_DRIVER')) env.STORAGE_DRIVER = 'cloudinary';
  }
  return env;
}

export function parseCloudinaryUrl(value: string | undefined): { cloudName: string; apiKey: string; apiSecret: string } | null {
  const text = value?.trim().replace(/^CLOUDINARY_URL=/, '');
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'cloudinary:' || !url.hostname || !url.username || !url.password) return null;
    return { cloudName: url.hostname, apiKey: decodeURIComponent(url.username), apiSecret: decodeURIComponent(url.password) };
  } catch {
    return null;
  }
}

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  // Treat empty strings as "not set" so optional values in .env files behave intuitively.
  const cleaned = Object.fromEntries(
    Object.entries(withPlatformDefaults(source)).filter(([, value]) => value !== undefined && value.trim() !== ''),
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
