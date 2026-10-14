import { createHash } from 'node:crypto';
import { AiProviderError, type AiProvider, type ExtractInput, type ExtractOutput, type TranscribeInput, type TranscriptResult } from './provider.js';
import type { AiExtraction } from './schema.js';
import { DEMO, demoAssetHashes, demoAudioTiming, normalizeText } from '../demo/demo-content.js';

const NO_EXAMPLE =
  'Example results exist only for the synthetic demo order. Configure Gemini to process other orders, or add the details manually.';

/**
 * Demo fixtures: deterministic, clearly labelled example results for the synthetic demo sources
 * only. It never pretends to process other material.
 */
export class FixtureProvider implements AiProvider {
  readonly name = 'fixture';
  readonly mode = 'FIXTURE' as const;
  readonly promptVersion = 'demo-fixture-1';

  async transcribeAudio(input: TranscribeInput): Promise<TranscriptResult> {
    const hash = createHash('sha256').update(input.audio).digest('hex');
    if (!demoAssetHashes().audio || hash !== demoAssetHashes().audio) throw new AiProviderError('NO_EXAMPLE', NO_EXAMPLE, false);
    const timing = demoAudioTiming();
    const segments =
      timing && input.durationMs && timing.every((s) => s.endMs <= input.durationMs! + 1500) ? timing : null;
    return {
      text: segments ? segments.map((s) => s.text).join(' ') : DEMO.voiceNoteB,
      segments,
      language: 'English',
      model: 'demo-fixture',
      usage: { inputTokens: null, outputTokens: null },
    };
  }

  async extractBrief(input: ExtractInput): Promise<ExtractOutput> {
    const hashes = demoAssetHashes();
    const text = input.sources.find((s) => s.kind === 'TEXT' && normalizeText(s.text) === normalizeText(DEMO.textA));
    const voice = input.sources.find((s) => s.kind === 'AUDIO' && normalizeText(s.transcript).includes('elbow length'));
    // Images reach providers as sanitized previews, so they are identified by the original file hash.
    const imageRef = input.sources.find((s) => s.kind === 'IMAGE' && hashes.image !== null && s.sha256 === hashes.image);
    if (!text && !voice) throw new AiProviderError('NO_EXAMPLE', NO_EXAMPLE, false);

    const A = text?.ref;
    const B = voice?.ref;
    const C = imageRef?.ref;
    const ev = (ref: string | undefined, quote: string | null) => (ref ? [{ sourceRef: ref, quote }] : []);

    const raw: AiExtraction = {
      schemaVersion: '1',
      garmentType: { value: 'Floor-length dress', evidence: ev(A, 'navy-blue floor-length dress') },
      fields: [
        ...(A
          ? ([
              { key: 'overallStyle', proposedValue: 'Navy-blue floor-length dress', unit: null, basis: 'explicit_text', evidence: ev(A, 'I want a navy-blue floor-length dress'), needsHumanReview: false },
              { key: 'color', proposedValue: 'Navy blue', unit: null, basis: 'explicit_text', evidence: ev(A, 'navy-blue'), needsHumanReview: false },
              { key: 'length', proposedValue: 'Floor length', unit: null, basis: 'explicit_text', evidence: ev(A, 'floor-length dress'), needsHumanReview: false },
              { key: 'fabricSupplier', proposedValue: 'CUSTOMER', unit: null, basis: 'explicit_text', evidence: ev(A, 'I will provide the fabric'), needsHumanReview: false },
              { key: 'sleeves', proposedValue: 'Long and fitted', unit: null, basis: 'explicit_text', evidence: ev(A, 'Please make the sleeves long and fitted'), needsHumanReview: false },
            ] as const)
          : []),
        { key: 'neckline', proposedValue: 'Square neckline', unit: null, basis: A ? 'explicit_text' : 'audio_transcript', evidence: [...ev(A, 'with a square neckline'), ...ev(B, 'Keep the square neckline')], needsHumanReview: false },
        { key: 'exclusion', proposedValue: 'No slit', unit: null, basis: A ? 'explicit_text' : 'audio_transcript', evidence: [...ev(A, 'No slit'), ...ev(B, 'no slit')], needsHumanReview: false },
        ...(B
          ? ([
              { key: 'sleeves', proposedValue: 'Elbow length', unit: null, basis: 'audio_transcript', evidence: ev(B, 'Please make the sleeves elbow length'), needsHumanReview: false },
              { key: 'embellishments', proposedValue: 'Light beading around the neckline', unit: null, basis: 'audio_transcript', evidence: ev(B, 'Can we add light beading around the neckline?'), needsHumanReview: true },
            ] as const)
          : []),
        ...(C
          ? ([
              { key: 'otherDetails', proposedValue: 'Reference picture: fitted bodice with a straight floor-length skirt', unit: null, basis: 'visual_observation', evidence: ev(C, null), needsHumanReview: true },
            ] as const)
          : []),
      ],
      missingFields: [
        { key: 'fit', question: 'How fitted should the bodice and waist be — close-fitting, or with some ease?' },
        { key: 'fabric', question: 'Which fabric will the customer bring, and is there enough for floor length?' },
      ],
      conflicts: [],
      warnings: C
        ? [
            'The reference picture shows a side slit and long sleeves. The customer wrote "No slit", so use the picture for the neckline and silhouette only.',
          ]
        : [],
    };
    return { raw, model: 'demo-fixture', usage: { inputTokens: null, outputTokens: null } };
  }
}
