import { findQuote, resolveEvidence, segmentSpans, type EvidenceSource } from '../src/ai/evidence.js';
import { normalizeExtraction } from '../src/ai/normalize.js';
import { validateSegments } from '../src/ai/gemini.provider.js';
import { emptyBriefContent } from '../src/contracts/brief.js';
import type { AiExtraction } from '../src/ai/schema.js';

const TEXT = 'I want a navy-blue floor-length dress with a square neckline.\nPlease make the sleeves long and fitted. No slit.\nI will provide the fabric.';
const SPOKEN = 'Please make the sleeves elbow length. Keep the square neckline and no slit. Can we add light beading around the neckline?';
const TEXT_ID = '01a135d0-0000-7000-8000-000000000001';
const AUDIO_ID = '01a135d0-0000-7000-8000-000000000002';
const IMAGE_ID = '01a135d0-0000-7000-8000-000000000003';
const TRANSCRIPT_ID = '01a135d0-0000-7000-8000-0000000000aa';

function sources(): Map<string, EvidenceSource> {
  const segments = [
    { startMs: 0, endMs: 2400, text: 'Please make the sleeves elbow length.' },
    { startMs: 2400, endMs: 5000, text: 'Keep the square neckline and no slit.' },
    { startMs: 5000, endMs: 8200, text: 'Can we add light beading around the neckline?' },
  ];
  return new Map<string, EvidenceSource>([
    ['S1', { ref: 'S1', sourceId: TEXT_ID, kind: 'TEXT', text: TEXT, transcriptId: null, segmentSpans: null }],
    ['S2', { ref: 'S2', sourceId: AUDIO_ID, kind: 'AUDIO', text: SPOKEN, transcriptId: TRANSCRIPT_ID, segmentSpans: segmentSpans(segments) }],
    ['S3', { ref: 'S3', sourceId: IMAGE_ID, kind: 'IMAGE', text: null, transcriptId: null, segmentSpans: null }],
  ]);
}

describe('evidence validation', () => {
  it('finds exact and typographically different quotes and maps them to the original range', () => {
    expect(findQuote(TEXT, 'No slit')).toEqual({ start: TEXT.indexOf('No slit'), end: TEXT.indexOf('No slit') + 7 });
    const curly = findQuote("I'll bring the customer’s fabric", 'customer\'s FABRIC');
    expect(curly).not.toBeNull();
    const spaced = findQuote(TEXT, 'sleeves   long and\nfitted');
    expect(TEXT.slice(spaced!.start, spaced!.end)).toBe('sleeves long and fitted');
    expect(findQuote(TEXT, 'an open back with crystals')).toBeNull();
    expect(findQuote(TEXT, 'a')).toBeNull();
  });

  it('rejects evidence outside the input set or quoting words that are not there, and times audio quotes', () => {
    const stats = { rejected: 0 };
    const evidence = resolveEvidence(
      [
        { sourceRef: 'S1', quote: 'square neckline' },
        { sourceRef: 'S99', quote: 'square neckline' },
        { sourceRef: 'S1', quote: 'green velvet' },
        { sourceRef: 'S2', quote: 'light beading around the neckline' },
        { sourceRef: 'S3', quote: 'should be ignored for images' },
      ],
      sources(),
      stats,
    );
    expect(stats.rejected).toBe(2);
    expect(evidence).toHaveLength(3);
    const audio = evidence.find((e) => e.sourceId === AUDIO_ID)!;
    expect(audio.startMs).toBe(5000);
    expect(audio.endMs).toBe(8200);
    expect(audio.transcriptId).toBe(TRANSCRIPT_ID);
    expect(evidence.find((e) => e.sourceId === IMAGE_ID)!.quote).toBeNull();
  });

  it('keeps transcript timing only when it fits the measured duration', () => {
    const data = { language: 'English', segments: [{ start: '00:00', end: '00:03', text: 'Hello there.' }, { start: '00:03', end: '00:07', text: 'Elbow length.' }] };
    expect(validateSegments(data, 7000).segments).toHaveLength(2);
    expect(validateSegments(data, 4000).segments).toBeNull();
    expect(validateSegments(data, null).segments).toBeNull();
    expect(validateSegments(data, null).text).toBe('Hello there. Elbow length.');
  });
});

describe('normalization and deterministic conflict checks', () => {
  const base: AiExtraction = {
    schemaVersion: '1',
    garmentType: { value: null, evidence: [] },
    fields: [],
    missingFields: [],
    conflicts: [],
    warnings: [],
  };

  it('turns different values for the same detail into a conflict instead of choosing the latest', () => {
    const result = normalizeExtraction(
      {
        ...base,
        fields: [
          { key: 'sleeves', proposedValue: 'Long and fitted', unit: null, basis: 'explicit_text', evidence: [{ sourceRef: 'S1', quote: 'sleeves long and fitted' }], needsHumanReview: false },
          { key: 'sleeves', proposedValue: 'Elbow length', unit: null, basis: 'audio_transcript', evidence: [{ sourceRef: 'S2', quote: 'sleeves elbow length' }], needsHumanReview: false },
          { key: 'neckline', proposedValue: 'Square neckline', unit: null, basis: 'explicit_text', evidence: [{ sourceRef: 'S1', quote: 'square neckline' }], needsHumanReview: false },
        ],
      },
      sources(),
      emptyBriefContent('Dress'),
    );
    expect(result.suggestions.map((s) => s.fieldKey)).toEqual(['neckline']);
    const conflict = result.issues.find((i) => i.kind === 'CONFLICT');
    expect(conflict?.fieldKey).toBe('sleeves');
    expect(conflict && 'candidates' in conflict ? conflict.candidates.map((c) => c.value) : []).toEqual(['Long and fitted', 'Elbow length']);
  });

  it('downgrades unsupported claims, never invents terms, and skips what the brief already says', () => {
    const current = emptyBriefContent('Dress');
    current.fields.color.value = 'Navy blue';
    const result = normalizeExtraction(
      {
        ...base,
        fields: [
          { key: 'back', proposedValue: 'Open back', unit: null, basis: 'explicit_text', evidence: [{ sourceRef: 'S1', quote: 'open back' }], needsHumanReview: false },
          { key: 'color', proposedValue: 'Navy blue', unit: null, basis: 'explicit_text', evidence: [{ sourceRef: 'S1', quote: 'navy-blue' }], needsHumanReview: false },
          { key: 'deliveryDate', proposedValue: 'next Friday', unit: null, basis: 'explicit_text', evidence: [], needsHumanReview: true },
          { key: 'totalPrice', proposedValue: '85k', unit: null, basis: 'explicit_text', evidence: [], needsHumanReview: false },
        ],
        missingFields: [
          { key: 'fit', question: 'How fitted?' },
          { key: 'totalPrice', question: 'What is the price?' },
        ],
      },
      sources(),
      current,
    );
    const back = result.suggestions.find((s) => s.fieldKey === 'back')!;
    expect(back.basis).toBe('INFERENCE');
    expect(back.needsHumanReview).toBe(true);
    expect(result.stats.downgraded).toBe(2); // the unsupported "open back" and the price claimed without evidence
    expect(result.suggestions.find((s) => s.fieldKey === 'color')).toBeUndefined();
    expect(result.suggestions.find((s) => s.fieldKey === 'deliveryDate')).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/delivery date was mentioned/i);
    const price = result.suggestions.find((s) => s.fieldKey === 'totalPrice')!;
    expect(price.proposedValue).toBe(85000);
    expect(price.needsHumanReview).toBe(true);
    expect(result.issues.map((i) => i.fieldKey)).toEqual(['fit']);
  });
});
