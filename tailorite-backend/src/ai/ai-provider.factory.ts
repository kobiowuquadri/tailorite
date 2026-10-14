import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import type { AiProvider } from './provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { FixtureProvider } from './fixture.provider.js';
import { FakeTestProvider } from './fake.provider.js';

export type AiRunMode = 'LIVE' | 'FIXTURE' | 'TEST';

/**
 * Chooses the provider explicitly. Missing credentials never silently fall back to fixtures:
 * live mode without a key is reported as "not configured" and manual work continues.
 */
@Injectable()
export class AiProviderFactory {
  private gemini: GeminiProvider | null = null;
  private readonly fixture = new FixtureProvider();
  private readonly fake = new FakeTestProvider();

  constructor(private readonly config: AppConfig) {}

  /** The mode a new job for this studio would run in, or null when AI is unavailable. */
  modeFor(studio: { isDemo: boolean; demoSeedKey: string | null }): AiRunMode | null {
    if (this.config.isTest && this.config.env.AI_TEST_FAKE) return 'TEST';
    const availability = this.config.aiAvailability({ isDemoSandbox: studio.isDemo && !studio.demoSeedKey });
    if (!availability.available) return null;
    return availability.mode === 'fixture' ? 'FIXTURE' : 'LIVE';
  }

  get(mode: AiRunMode): AiProvider {
    if (mode === 'TEST') {
      if (!this.config.isTest) throw new Error('The test provider is only available in tests.');
      return this.fake;
    }
    if (mode === 'FIXTURE') return this.fixture;
    const e = this.config.env;
    if (!e.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
    this.gemini ??= new GeminiProvider({
      apiKey: e.GEMINI_API_KEY,
      extractionModel: e.GEMINI_EXTRACTION_MODEL,
      transcriptionModel: e.GEMINI_TRANSCRIPTION_MODEL,
      maxOutputTokens: e.AI_MAX_OUTPUT_TOKENS,
      timeoutMs: e.AI_REQUEST_TIMEOUT_MS,
    });
    return this.gemini;
  }
}
