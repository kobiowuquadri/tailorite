import type { TranscriptSegment } from '../contracts/sources.js';

export type AiUsage = { inputTokens: number | null; outputTokens: number | null };

export type TranscribeInput = {
  audio: Buffer;
  /** MIME type in the provider's supported list (e.g. audio/m4a). */
  mimeType: string;
  durationMs: number | null;
  label: string;
};

export type TranscriptResult = {
  text: string;
  /** Validated against the file duration; null when timing is not reliable. */
  segments: TranscriptSegment[] | null;
  language: string | null;
  model: string;
  usage: AiUsage;
};

type SourceMeta = {
  ref: string;
  label: string;
  sender: string | null;
  context: string | null;
  /** SHA-256 of the original upload/text (identifies the material; not sent to providers). */
  sha256: string;
};

export type ExtractSource =
  | (SourceMeta & { kind: 'TEXT'; text: string })
  | (SourceMeta & { kind: 'AUDIO'; transcript: string; transcriptOrigin: 'MACHINE' | 'FIXTURE' | 'HUMAN' })
  | (SourceMeta & { kind: 'IMAGE'; image: Buffer; mimeType: string });

export type ExtractInput = {
  orderTitle: string;
  garmentType: string;
  sources: ExtractSource[];
};

export type ExtractOutput = { raw: unknown; model: string; usage: AiUsage };

/**
 * One configured provider behind a small interface. Conflict detection is deterministic
 * (see normalize.ts), so only transcription and one extraction pass call the model.
 */
export interface AiProvider {
  readonly name: string;
  readonly mode: 'LIVE' | 'FIXTURE' | 'TEST';
  readonly promptVersion: string;
  transcribeAudio(input: TranscribeInput, signal: AbortSignal): Promise<TranscriptResult>;
  extractBrief(input: ExtractInput, signal: AbortSignal): Promise<ExtractOutput>;
}

export type AiErrorCode =
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'INVALID_RESPONSE'
  | 'INVALID_REQUEST'
  | 'BLOCKED'
  | 'MODEL_NOT_FOUND'
  | 'NO_EXAMPLE'
  | 'STORAGE'
  | 'INTERNAL';

/** Safe, user-facing provider failure. `retryable` drives the bounded retry policy. */
export class AiProviderError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly retryable: boolean,
    /** The provider's own error text, for server logs only (never shown to users, never customer content). */
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export const RETRYABLE_CODES: ReadonlySet<AiErrorCode> = new Set([
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'TIMEOUT',
  'NETWORK',
  'INVALID_RESPONSE',
  'STORAGE',
]);
