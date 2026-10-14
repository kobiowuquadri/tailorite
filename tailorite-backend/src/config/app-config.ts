import { MB, parseEnv, type Env } from './env.js';

export type AiAvailability = {
  mode: 'live' | 'fixture' | 'off';
  /** True when the configured mode can actually run (e.g. live mode has an API key). */
  available: boolean;
  label: string;
  message: string;
};

/** Typed, validated configuration shared by the API, the worker and CLI entrypoints. */
export class AppConfig {
  constructor(public readonly env: Env) {}

  static fromProcessEnv(overrides: Record<string, string | undefined> = {}): AppConfig {
    return new AppConfig(parseEnv({ ...process.env, ...overrides }));
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  /** Stamped on background jobs so a worker never takes another deployment's job (whose files it may not reach). */
  get deploymentId(): string {
    return this.env.DEPLOYMENT_ID ?? this.env.APP_ORIGIN;
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  get uploadLimits() {
    const e = this.env;
    return {
      imageBytes: e.UPLOAD_MAX_IMAGE_MB * MB,
      audioBytes: e.UPLOAD_MAX_AUDIO_MB * MB,
      audioSeconds: e.UPLOAD_MAX_AUDIO_SECONDS,
      recordingSeconds: 300,
      orderTotalBytes: e.UPLOAD_MAX_ORDER_TOTAL_MB * MB,
      sourcesPerOrder: e.UPLOAD_MAX_SOURCES_PER_ORDER,
      textChars: e.TEXT_SOURCE_MAX_CHARS,
    };
  }

  /** AI availability for the given studio kind. Demo sandboxes default to labelled fixtures. */
  aiAvailability(opts: { isDemoSandbox?: boolean } = {}): AiAvailability {
    const e = this.env;
    if (this.isTest && e.AI_TEST_FAKE) {
      return {
        mode: 'live',
        available: true,
        label: 'Test provider',
        message: 'Automated tests use a deterministic fake provider.',
      };
    }
    const mode = opts.isDemoSandbox && e.DEMO_SANDBOX_AI === 'fixture' ? 'fixture' : e.AI_MODE;
    if (mode === 'off') {
      return {
        mode,
        available: false,
        label: 'Manual mode',
        message: 'AI extraction is turned off. Add details manually; every other step works the same.',
      };
    }
    if (mode === 'fixture') {
      return {
        mode,
        available: true,
        label: 'Example results',
        message:
          'Demo mode returns prepared example results for the synthetic demo sources. They are labelled as examples, not live AI.',
      };
    }
    if (!e.GEMINI_API_KEY) {
      return {
        mode,
        available: false,
        label: 'Not configured',
        message: 'AI extraction is not configured. You can still add every detail manually.',
      };
    }
    return {
      mode,
      available: true,
      label: 'Gemini',
      message: `AI extraction uses Google Gemini (${e.GEMINI_EXTRACTION_MODEL}). Suggestions always need your review.`,
    };
  }
}
