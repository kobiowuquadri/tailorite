import { ApiError, FileState, GoogleGenAI, ThinkingLevel, type GenerateContentResponse, type Part } from '@google/genai';
import { AiExtraction, AiTranscript, parseTimestamp, toGeminiJsonSchema } from './schema.js';
import {
  AiProviderError,
  type AiProvider,
  type AiUsage,
  type ExtractInput,
  type ExtractOutput,
  type TranscribeInput,
  type TranscriptResult,
} from './provider.js';
import { EXTRACTION_SYSTEM_PROMPT, PROMPT_VERSION, TRANSCRIPTION_SYSTEM_PROMPT, extractionUserText } from './prompts.js';
import type { TranscriptSegment } from '../contracts/sources.js';

const INLINE_LIMIT_BYTES = 14 * 1024 * 1024; // keeps the base64 request under Gemini's 20 MB inline limit

const EXTRACTION_SCHEMA = toGeminiJsonSchema(AiExtraction);
const TRANSCRIPT_SCHEMA = toGeminiJsonSchema(AiTranscript);

export type GeminiSettings = {
  apiKey: string;
  extractionModel: string;
  transcriptionModel: string;
  maxOutputTokens: number;
  timeoutMs: number;
};

function usageOf(res: GenerateContentResponse): AiUsage {
  return {
    inputTokens: res.usageMetadata?.promptTokenCount ?? null,
    outputTokens: (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0) || null,
  };
}

/** Maps SDK/network failures to safe, classified errors (never includes customer content). */
export function classifyGeminiError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if ((error as Error)?.name === 'AbortError' || /aborted|timed out/i.test((error as Error)?.message ?? '')) {
    return new AiProviderError('TIMEOUT', 'The AI service took too long to respond.', true);
  }
  if (error instanceof ApiError) {
    const s = error.status;
    // Gemini's error text names the offending argument or limit; it is logged, not shown.
    const detail = `HTTP ${s}: ${String(error.message).slice(0, 500)}`;
    if (s === 429) return new AiProviderError('RATE_LIMITED', 'The AI service is busy right now.', true, detail);
    if (s === 401 || s === 403) {
      return new AiProviderError('NOT_CONFIGURED', 'The AI service rejected the configured API key.', false, detail);
    }
    if (s === 404) return new AiProviderError('MODEL_NOT_FOUND', 'The configured AI model is not available.', false, detail);
    if (s === 400) {
      return new AiProviderError('INVALID_REQUEST', 'The AI service could not process these sources (for example an unsupported file).', false, detail);
    }
    if (s >= 500) return new AiProviderError('PROVIDER_UNAVAILABLE', 'The AI service is temporarily unavailable.', true, detail);
  }
  if (/fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket/i.test((error as Error)?.message ?? '')) {
    return new AiProviderError('NETWORK', 'Could not reach the AI service.', true);
  }
  return new AiProviderError('INTERNAL', 'The AI request failed unexpectedly.', false);
}

function readJson(res: GenerateContentResponse): unknown {
  const reason = res.candidates?.[0]?.finishReason;
  if (reason && ['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'RECITATION'].includes(String(reason))) {
    throw new AiProviderError('BLOCKED', 'The AI service declined to process this material.', false);
  }
  if (reason === 'MAX_TOKENS') {
    throw new AiProviderError('INVALID_RESPONSE', 'The AI response was cut off before it finished.', true);
  }
  const text = res.text;
  if (!text) throw new AiProviderError('INVALID_RESPONSE', 'The AI service returned an empty response.', true);
  try {
    return JSON.parse(text);
  } catch {
    throw new AiProviderError('INVALID_RESPONSE', 'The AI service returned a response that was not valid JSON.', true);
  }
}

/** Live Gemini provider using `models.generateContent` with JSON-schema structured output. */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly mode = 'LIVE' as const;
  readonly promptVersion = PROMPT_VERSION;
  private readonly client: GoogleGenAI;

  constructor(private readonly settings: GeminiSettings) {
    this.client = new GoogleGenAI({ apiKey: settings.apiKey });
  }

  private thinking(model: string) {
    // Thinking levels exist for the Gemini 3 family only.
    return model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {};
  }

  private async audioPart(input: TranscribeInput, signal: AbortSignal): Promise<{ part: Part; cleanup: () => Promise<void> }> {
    if (input.audio.length <= INLINE_LIMIT_BYTES) {
      return {
        part: { inlineData: { data: input.audio.toString('base64'), mimeType: input.mimeType } },
        cleanup: async () => undefined,
      };
    }
    const uploaded = await this.client.files.upload({
      file: new Blob([new Uint8Array(input.audio)], { type: input.mimeType }),
      config: { mimeType: input.mimeType, abortSignal: signal },
    });
    let file = uploaded;
    const deadline = Date.now() + 120_000;
    while (file.state === FileState.PROCESSING && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      file = await this.client.files.get({ name: file.name! });
    }
    if (file.state !== FileState.ACTIVE || !file.uri) {
      throw new AiProviderError('PROVIDER_UNAVAILABLE', 'The AI service could not prepare the audio file.', true);
    }
    return {
      part: { fileData: { fileUri: file.uri, mimeType: input.mimeType } },
      cleanup: async () => {
        await this.client.files.delete({ name: file.name! }).catch(() => undefined);
      },
    };
  }

  async transcribeAudio(input: TranscribeInput, signal: AbortSignal): Promise<TranscriptResult> {
    const model = this.settings.transcriptionModel;
    let cleanup = async () => undefined as void;
    try {
      const audio = await this.audioPart(input, signal);
      cleanup = audio.cleanup;
      const res = await this.client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [audio.part, { text: `Transcribe "${input.label}".` }] }],
        config: {
          systemInstruction: TRANSCRIPTION_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: TRANSCRIPT_SCHEMA,
          maxOutputTokens: this.settings.maxOutputTokens,
          abortSignal: signal,
          ...this.thinking(model),
        },
      });
      const parsed = AiTranscript.safeParse(readJson(res));
      if (!parsed.success) throw new AiProviderError('INVALID_RESPONSE', 'The transcript did not match the expected format.', true);
      return { ...validateSegments(parsed.data, input.durationMs), model, usage: usageOf(res) };
    } catch (error) {
      throw classifyGeminiError(error);
    } finally {
      await cleanup();
    }
  }

  async extractBrief(input: ExtractInput, signal: AbortSignal): Promise<ExtractOutput> {
    const model = this.settings.extractionModel;
    const parts: Part[] = [{ text: extractionUserText(input) }];
    for (const s of input.sources) {
      if (s.kind === 'IMAGE') {
        parts.push({ text: `Image for ${s.ref} (${s.label}):` });
        parts.push({ inlineData: { data: s.image.toString('base64'), mimeType: s.mimeType } });
      }
    }
    try {
      const res = await this.client.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: EXTRACTION_SCHEMA,
          maxOutputTokens: this.settings.maxOutputTokens,
          abortSignal: signal,
          ...this.thinking(model),
        },
      });
      return { raw: readJson(res), model, usage: usageOf(res) };
    } catch (error) {
      throw classifyGeminiError(error);
    }
  }
}

/**
 * Keeps segment timing only when it is internally consistent and fits the measured duration;
 * otherwise the transcript is kept without clickable timestamps.
 */
export function validateSegments(
  data: { language: string | null; segments: { start: string; end: string; text: string }[] },
  durationMs: number | null,
): { text: string; segments: TranscriptSegment[] | null; language: string | null } {
  const cleaned = data.segments.map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() })).filter((s) => s.text);
  const text = cleaned.map((s) => s.text).join(' ');
  if (!durationMs) return { text, segments: null, language: data.language };
  const segments: TranscriptSegment[] = [];
  let previousEnd = 0;
  for (const s of cleaned) {
    const startMs = parseTimestamp(s.start);
    const endMs = parseTimestamp(s.end);
    const tolerance = 1500;
    if (startMs === null || endMs === null || endMs < startMs || startMs + 999 < previousEnd - tolerance || endMs > durationMs + tolerance) {
      return { text, segments: null, language: data.language };
    }
    segments.push({ startMs, endMs: Math.min(endMs, durationMs), text: s.text });
    previousEnd = endMs;
  }
  return { text, segments: segments.length ? segments : null, language: data.language };
}
