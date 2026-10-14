import { AiProviderError, type AiProvider, type ExtractInput, type ExtractOutput, type TranscribeInput, type TranscriptResult } from './provider.js';
import type { AiExtraction } from './schema.js';

type Field = AiExtraction['fields'][number];

const RULES: { pattern: RegExp; key: Field['key']; value: string | number }[] = [
  { pattern: /navy[- ]blue/i, key: 'color', value: 'Navy blue' },
  { pattern: /floor[- ]length/i, key: 'length', value: 'Floor length' },
  { pattern: /square neckline/i, key: 'neckline', value: 'Square neckline' },
  { pattern: /sleeves long and fitted/i, key: 'sleeves', value: 'Long and fitted' },
  { pattern: /sleeves elbow[- ]length/i, key: 'sleeves', value: 'Elbow length' },
  { pattern: /no slit/i, key: 'exclusion', value: 'No slit' },
  { pattern: /i will provide the fabric/i, key: 'fabricSupplier', value: 'CUSTOMER' },
  { pattern: /light beading around the neckline/i, key: 'embellishments', value: 'Light beading around the neckline' },
];

const transientSeen = new Set<string>();

/**
 * Deterministic provider for automated tests only (NODE_ENV=test and AI_TEST_FAKE=true).
 * It is never used for demos or presented as AI. Markers in text trigger failure paths:
 *   [[ai:transient-once]] [[ai:transient]] [[ai:invalid]] [[ai:foreign-evidence]] [[ai:bad-quote]] [[ai:fatal]]
 */
export class FakeTestProvider implements AiProvider {
  readonly name = 'test-fake';
  readonly mode = 'TEST' as const;
  readonly promptVersion = 'test-fake-1';

  async transcribeAudio(input: TranscribeInput): Promise<TranscriptResult> {
    const sentences = [
      'Please make the sleeves elbow length.',
      'Keep the square neckline and no slit.',
      'Can we add light beading around the neckline?',
    ];
    const d = input.durationMs;
    return {
      text: sentences.join(' '),
      segments: d ? sentences.map((text, i) => ({ startMs: Math.round((d * i) / 3), endMs: Math.round((d * (i + 1)) / 3), text })) : null,
      language: 'English',
      model: 'test-fake',
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  async extractBrief(input: ExtractInput): Promise<ExtractOutput> {
    type Spoken = { ref: string; text: string; basis: 'explicit_text' | 'audio_transcript' };
    const texts = input.sources.flatMap((s): Spoken[] =>
      s.kind === 'TEXT'
        ? [{ ref: s.ref, text: s.text, basis: 'explicit_text' }]
        : s.kind === 'AUDIO'
          ? [{ ref: s.ref, text: s.transcript, basis: 'audio_transcript' }]
          : [],
    );
    const all = texts.map((t) => t.text).join('\n');
    if (all.includes('[[ai:fatal]]')) throw new AiProviderError('INVALID_REQUEST', 'The AI service could not process these sources.', false);
    if (all.includes('[[ai:transient]]')) throw new AiProviderError('RATE_LIMITED', 'The AI service is busy right now.', true);
    if (all.includes('[[ai:transient-once]]') && !transientSeen.has(all)) {
      transientSeen.add(all);
      throw new AiProviderError('PROVIDER_UNAVAILABLE', 'The AI service is temporarily unavailable.', true);
    }
    if (all.includes('[[ai:invalid]]')) return { raw: { schemaVersion: '1', nonsense: true }, model: 'test-fake', usage: { inputTokens: 0, outputTokens: 0 } };

    const fields: Field[] = [];
    for (const t of texts) {
      for (const rule of RULES) {
        const match = rule.pattern.exec(t.text);
        if (match) {
          fields.push({ key: rule.key, proposedValue: rule.value, unit: null, basis: t.basis, evidence: [{ sourceRef: t.ref, quote: match[0] }], needsHumanReview: false });
        }
      }
    }
    if (all.includes('[[ai:foreign-evidence]]')) {
      fields.push({ key: 'lining', proposedValue: 'Silk lining', unit: null, basis: 'explicit_text', evidence: [{ sourceRef: 'S99', quote: 'silk lining' }], needsHumanReview: false });
    }
    if (all.includes('[[ai:bad-quote]]')) {
      fields.push({ key: 'back', proposedValue: 'Open back', unit: null, basis: 'explicit_text', evidence: [{ sourceRef: texts[0]?.ref ?? 'S1', quote: 'an open back with crystals' }], needsHumanReview: false });
    }
    for (const s of input.sources) {
      if (s.kind === 'IMAGE') {
        fields.push({ key: 'otherDetails', proposedValue: 'Reference picture provided', unit: null, basis: 'visual_observation', evidence: [{ sourceRef: s.ref, quote: null }], needsHumanReview: true });
      }
    }
    const raw: AiExtraction = {
      schemaVersion: '1',
      garmentType: { value: null, evidence: [] },
      fields,
      missingFields: [{ key: 'fit', question: 'How fitted should it be?' }],
      conflicts: [],
      warnings: [],
    };
    return { raw, model: 'test-fake', usage: { inputTokens: 0, outputTokens: 0 } };
  }
}
