import { z } from 'zod';
import { SUGGESTION_KEYS } from '../contracts/brief.js';

/**
 * Model-facing structured output (schemaVersion "1"). Sources are referenced by short aliases
 * ("S1", "S2", …) that the server maps back to real source ids after validation.
 */
export const AiEvidence = z.object({
  sourceRef: z.string().max(10).describe('Source id exactly as given, e.g. "S1"'),
  quote: z
    .string()
    .max(400)
    .nullable()
    .describe('Exact words copied verbatim from that source text or transcript. Null for images.'),
});
export type AiEvidence = z.infer<typeof AiEvidence>;

export const AiBasis = z.enum(['explicit_text', 'audio_transcript', 'visual_observation', 'inference']);

export const AiField = z.object({
  key: z.enum(SUGGESTION_KEYS),
  proposedValue: z.union([z.string().max(500), z.number(), z.null()]),
  unit: z.string().max(20).nullable(),
  basis: AiBasis,
  evidence: z.array(AiEvidence).max(6),
  needsHumanReview: z.boolean(),
});

export const AiExtraction = z.object({
  schemaVersion: z.enum(['1']),
  garmentType: z.object({
    value: z.string().max(200).nullable(),
    evidence: z.array(AiEvidence).max(6),
  }),
  fields: z.array(AiField).max(60),
  missingFields: z
    .array(z.object({ key: z.enum(SUGGESTION_KEYS), question: z.string().max(300) }))
    .max(20),
  conflicts: z
    .array(
      z.object({
        key: z.enum(SUGGESTION_KEYS),
        candidates: z
          .array(z.object({ value: z.string().max(300), evidence: z.array(AiEvidence).max(6) }))
          .min(2)
          .max(5),
        question: z.string().max(300),
      }),
    )
    .max(20),
  warnings: z.array(z.string().max(400)).max(20),
});
export type AiExtraction = z.infer<typeof AiExtraction>;

export const AiTranscript = z.object({
  language: z.string().max(40).nullable().describe('Main spoken language, e.g. "English", "Yoruba", "Nigerian Pidgin"'),
  segments: z
    .array(
      z.object({
        start: z.string().max(8).describe('Segment start as MM:SS'),
        end: z.string().max(8).describe('Segment end as MM:SS'),
        text: z.string().max(2000).describe('Verbatim words spoken in this segment'),
      }),
    )
    .max(400),
});
export type AiTranscript = z.infer<typeof AiTranscript>;

/**
 * Converts a Zod schema to the JSON Schema subset Gemini accepts for `responseJsonSchema`
 * (no $schema/const; `const` becomes a single-value enum).
 */
export function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any' }) as Record<string, unknown>;
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '$schema' || key === 'additionalProperties') continue;
      if (key === 'const') {
        out.enum = [value];
        continue;
      }
      out[key] = clean(value);
    }
    return out;
  };
  return clean(json) as Record<string, unknown>;
}

/** "02:31" → 151000 ms; also accepts "H:MM:SS" and plain seconds. */
export function parseTimestamp(value: string): number | null {
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 1000);
  const parts = v.split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 2) return Math.round((parts[0] * 60 + parts[1]) * 1000);
  if (parts.length === 3) return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000);
  return null;
}
