import type { Evidence } from '../contracts/brief.js';
import type { TranscriptSegment } from '../contracts/sources.js';
import type { AiEvidence } from './schema.js';

/** A source as the validator knows it: only sources in the job's fixed input set are present. */
export type EvidenceSource = {
  ref: string;
  sourceId: string;
  kind: 'TEXT' | 'AUDIO' | 'IMAGE';
  /** Original text (TEXT) or the transcript the model saw (AUDIO). */
  text: string | null;
  transcriptId: string | null;
  /** Character spans of validated transcript segments within `text`. */
  segmentSpans: { start: number; end: number; startMs: number; endMs: number }[] | null;
};

export type EvidenceStats = { rejected: number };

/** Character spans of segments joined with single spaces (matches how transcripts are stored). */
export function segmentSpans(segments: TranscriptSegment[] | null): EvidenceSource['segmentSpans'] {
  if (!segments?.length) return null;
  const spans: NonNullable<EvidenceSource['segmentSpans']> = [];
  let offset = 0;
  for (const s of segments) {
    spans.push({ start: offset, end: offset + s.text.length, startMs: s.startMs, endMs: s.endMs });
    offset += s.text.length + 1;
  }
  return spans;
}

const FOLD: Record<string, string> = { '‘': "'", '’': "'", '`': "'", '´': "'", '“': '"', '”': '"', '–': '-', '—': '-', ' ': ' ' };

function normalizeWithMap(s: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < s.length; i++) {
    let ch = FOLD[s[i]] ?? s[i];
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      ch = ' ';
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
    }
    norm += ch.toLowerCase();
    map.push(i);
  }
  return { norm, map };
}

/**
 * Finds `quote` in `text` exactly, or after folding case, typographic quotes/dashes and whitespace.
 * Returns the matching range in the ORIGINAL text, or null when the words are not really there.
 */
export function findQuote(text: string, quote: string): { start: number; end: number } | null {
  const q = quote.trim().replace(/^["'“”‘’]+|["'“”‘’.,;:!?]+$/g, '').trim();
  if (q.length < 3) return null;
  const exact = text.indexOf(q);
  if (exact !== -1) return { start: exact, end: exact + q.length };
  const t = normalizeWithMap(text);
  const n = normalizeWithMap(q).norm.trim();
  if (!n) return null;
  const k = t.norm.indexOf(n);
  if (k === -1) return null;
  return { start: t.map[k], end: t.map[k + n.length - 1] + 1 };
}

/**
 * Turns model evidence into validated Evidence. Anything pointing outside the job's input set,
 * or quoting words that are not in the source, is dropped and counted.
 */
export function resolveEvidence(raw: AiEvidence[], sources: Map<string, EvidenceSource>, stats: EvidenceStats): Evidence[] {
  const out: Evidence[] = [];
  for (const e of raw) {
    const source = sources.get(e.sourceRef.trim().toUpperCase());
    if (!source) {
      stats.rejected++;
      continue;
    }
    if (source.kind === 'IMAGE') {
      out.push({ sourceId: source.sourceId, quote: null, charStart: null, charEnd: null, transcriptId: null, startMs: null, endMs: null, note: null });
      continue;
    }
    if (!e.quote || !source.text) {
      stats.rejected++;
      continue;
    }
    const range = findQuote(source.text, e.quote);
    if (!range) {
      stats.rejected++;
      continue;
    }
    let startMs: number | null = null;
    let endMs: number | null = null;
    if (source.kind === 'AUDIO' && source.segmentSpans) {
      const overlapping = source.segmentSpans.filter((s) => s.start < range.end && s.end > range.start);
      if (overlapping.length) {
        startMs = Math.min(...overlapping.map((s) => s.startMs));
        endMs = Math.max(...overlapping.map((s) => s.endMs));
      }
    }
    out.push({
      sourceId: source.sourceId,
      quote: source.text.slice(range.start, range.end),
      charStart: range.start,
      charEnd: range.end,
      transcriptId: source.kind === 'AUDIO' ? source.transcriptId : null,
      startMs,
      endMs,
      note: null,
    });
  }
  // Same source + same range only once.
  const seen = new Set<string>();
  return out.filter((e) => {
    const key = `${e.sourceId}:${e.charStart}:${e.charEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
