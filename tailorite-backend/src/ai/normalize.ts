import {
  FIELD_DEF_BY_KEY,
  fieldLabel,
  TEXT_FIELD_KEYS,
  type BriefContent,
  type ConflictCandidate,
  type Evidence,
  type EvidenceBasis,
  type SuggestionKey,
} from '../contracts/brief.js';
import { parseIsoDateValue, parseMoneyToCents, currentValueFor } from '../briefs/apply-value.js';
import { resolveEvidence, type EvidenceSource, type EvidenceStats } from './evidence.js';
import type { AiExtraction } from './schema.js';

export type NormalizedSuggestion = {
  fieldKey: SuggestionKey;
  proposedValue: string | number;
  unit: string | null;
  basis: EvidenceBasis;
  evidence: Evidence[];
  needsHumanReview: boolean;
};

export type NormalizedIssue =
  | { kind: 'CONFLICT'; fieldKey: SuggestionKey; question: string; candidates: ConflictCandidate[] }
  | { kind: 'MISSING'; fieldKey: SuggestionKey; question: string };

export type NormalizedResult = {
  suggestions: NormalizedSuggestion[];
  issues: NormalizedIssue[];
  warnings: string[];
  stats: { evidenceRejected: number; downgraded: number; dropped: number };
};

const BASIS: Record<AiExtraction['fields'][number]['basis'], EvidenceBasis> = {
  explicit_text: 'EXPLICIT_TEXT',
  audio_transcript: 'AUDIO_TRANSCRIPT',
  visual_observation: 'VISUAL_OBSERVATION',
  inference: 'INFERENCE',
};

const isTextKey = (k: string) => (TEXT_FIELD_KEYS as readonly string[]).includes(k);
const TERMS_KEYS = new Set(['totalPrice', 'depositRequired', 'deliveryDate', 'fittingDate']);

export function comparable(value: unknown): string {
  const text = typeof value === 'string' ? value : value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value as number | boolean);
  return text
    .toLowerCase()
    .replace(/[‘’'"“”.,;:!?()]/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Coerces a model value into the shape the brief field expects, or null when it does not fit. */
function coerce(key: SuggestionKey, value: string | number | null): string | number | null {
  if (value === null) return null;
  if (isTextKey(key) || key === 'exclusion') {
    const text = String(value).replace(/\s+/g, ' ').trim().slice(0, 500);
    return text || null;
  }
  if (key === 'fabricSupplier') {
    const v = String(value).trim().toUpperCase();
    return v === 'CUSTOMER' || v === 'STUDIO' ? v : null;
  }
  if (key === 'totalPrice' || key === 'depositRequired') {
    const cents = parseMoneyToCents(value);
    return cents === null || cents <= 0 ? null : cents / 100;
  }
  if (key === 'deliveryDate' || key === 'fittingDate') return parseIsoDateValue(String(value));
  return null;
}

function basisFromEvidence(evidence: Evidence[], sources: Map<string, EvidenceSource>): EvidenceBasis {
  const kinds = new Set(evidence.map((e) => [...sources.values()].find((s) => s.sourceId === e.sourceId)?.kind));
  if (kinds.has('TEXT')) return 'EXPLICIT_TEXT';
  if (kinds.has('AUDIO')) return 'AUDIO_TRANSCRIPT';
  if (kinds.has('IMAGE')) return 'VISUAL_OBSERVATION';
  return 'INFERENCE';
}

function mergeEvidence(a: Evidence[], b: Evidence[]): Evidence[] {
  const seen = new Set(a.map((e) => `${e.sourceId}:${e.charStart}:${e.charEnd}`));
  return [...a, ...b.filter((e) => !seen.has(`${e.sourceId}:${e.charStart}:${e.charEnd}`))].slice(0, 12);
}

/**
 * Validated model output → reviewable suggestions and clarification issues.
 * Deterministic checks: evidence must exist in the input set; differing values for the same detail
 * become a conflict (never "latest wins"); suggestions equal to the current brief are skipped;
 * missing required details become questions.
 */
export function normalizeExtraction(raw: AiExtraction, sources: Map<string, EvidenceSource>, current: BriefContent): NormalizedResult {
  const stats: EvidenceStats = { rejected: 0 };
  let downgraded = 0;
  let dropped = 0;
  const warnings: string[] = [];
  const candidates: NormalizedSuggestion[] = [];

  const push = (key: SuggestionKey, rawValue: string | number | null, basisIn: EvidenceBasis | null, evidenceRaw: AiExtraction['fields'][number]['evidence'], needsReview: boolean, unit: string | null) => {
    const value = coerce(key, rawValue);
    if (value === null) {
      dropped++;
      if ((key === 'deliveryDate' || key === 'fittingDate') && rawValue !== null) {
        warnings.push(`A ${fieldLabel(key).toLowerCase()} was mentioned but not as a full date. Confirm it with the customer.`);
      }
      return;
    }
    const evidence = resolveEvidence(evidenceRaw, sources, stats);
    let basis = basisIn ?? basisFromEvidence(evidence, sources);
    let review = needsReview;
    if ((basis === 'EXPLICIT_TEXT' || basis === 'AUDIO_TRANSCRIPT') && evidence.length === 0) {
      basis = 'INFERENCE';
      review = true;
      downgraded++;
    }
    if (basis === 'INFERENCE' || basis === 'VISUAL_OBSERVATION' || TERMS_KEYS.has(key)) review = true;
    candidates.push({ fieldKey: key, proposedValue: value, unit, basis, evidence, needsHumanReview: review });
  };

  if (raw.garmentType.value) push('garmentType', raw.garmentType.value, null, raw.garmentType.evidence, false, null);
  for (const f of raw.fields) push(f.key, f.proposedValue, BASIS[f.basis], f.evidence, f.needsHumanReview, f.unit);

  // Conflicts reported by the model.
  const conflicts = new Map<SuggestionKey, { question: string; candidates: ConflictCandidate[] }>();
  for (const c of raw.conflicts) {
    if (c.key === 'exclusion') continue;
    const list: ConflictCandidate[] = [];
    for (const cand of c.candidates) {
      const value = coerce(c.key, cand.value);
      if (value === null) continue;
      const evidence = resolveEvidence(cand.evidence, sources, stats);
      const existing = list.find((x) => comparable(x.value) === comparable(value));
      if (existing) existing.evidence = mergeEvidence(existing.evidence, evidence);
      else list.push({ value: String(value), evidence });
    }
    if (list.length >= 2) {
      const prior = conflicts.get(c.key);
      conflicts.set(c.key, { question: prior?.question ?? c.question, candidates: [...(prior?.candidates ?? []), ...list] });
    }
  }

  // Deterministic check: the same detail with different values from the sources is a conflict.
  const byKey = new Map<SuggestionKey, NormalizedSuggestion[]>();
  for (const s of candidates) {
    if (s.fieldKey === 'exclusion') continue;
    byKey.set(s.fieldKey, [...(byKey.get(s.fieldKey) ?? []), s]);
  }
  for (const [key, list] of byKey) {
    const distinct = new Map<string, NormalizedSuggestion>();
    for (const s of list) {
      const k = comparable(s.proposedValue);
      const prev = distinct.get(k);
      distinct.set(k, prev ? { ...prev, evidence: mergeEvidence(prev.evidence, s.evidence) } : s);
    }
    if (distinct.size >= 2 || conflicts.has(key)) {
      const existing = conflicts.get(key);
      const merged: ConflictCandidate[] = [...(existing?.candidates ?? [])];
      for (const s of distinct.values()) {
        const same = merged.find((m) => comparable(m.value) === comparable(s.proposedValue));
        if (same) same.evidence = mergeEvidence(same.evidence, s.evidence);
        else merged.push({ value: String(s.proposedValue), evidence: s.evidence });
      }
      if (merged.length >= 2) {
        conflicts.set(key, {
          question:
            existing?.question ??
            `The sources disagree about the ${fieldLabel(key).toLowerCase()}. Which one did the customer finally want?`,
          candidates: merged.slice(0, 5),
        });
      }
    }
  }

  // Suggestions: one per key (exclusions may repeat), not part of a conflict, not already in the brief.
  const suggestions: NormalizedSuggestion[] = [];
  for (const s of candidates) {
    if (s.fieldKey !== 'exclusion' && conflicts.has(s.fieldKey)) continue;
    const same = suggestions.find((x) => x.fieldKey === s.fieldKey && comparable(x.proposedValue) === comparable(s.proposedValue));
    if (same) {
      same.evidence = mergeEvidence(same.evidence, s.evidence);
      continue;
    }
    const currentValue =
      s.fieldKey === 'exclusion'
        ? current.exclusions.some((e) => comparable(e.text) === comparable(s.proposedValue))
          ? String(s.proposedValue)
          : null
        : currentValueFor(current, s.fieldKey);
    const currentComparable =
      s.fieldKey === 'totalPrice' || s.fieldKey === 'depositRequired'
        ? current.terms[s.fieldKey === 'totalPrice' ? 'totalPriceKobo' : 'depositRequiredKobo'] !== null
          ? String(current.terms[s.fieldKey === 'totalPrice' ? 'totalPriceKobo' : 'depositRequiredKobo']! / 100)
          : null
        : currentValue;
    if (currentComparable !== null && comparable(currentComparable) === comparable(s.proposedValue)) continue;
    suggestions.push(s);
  }

  const issues: NormalizedIssue[] = [...conflicts.entries()].map(([fieldKey, c]) => ({
    kind: 'CONFLICT' as const,
    fieldKey,
    question: c.question,
    candidates: c.candidates,
  }));

  const covered = new Set<string>([...suggestions.map((s) => s.fieldKey), ...conflicts.keys()]);
  const asked = new Set<string>();
  for (const m of raw.missingFields) {
    if (TERMS_KEYS.has(m.key) || m.key === 'exclusion' || covered.has(m.key) || asked.has(m.key)) continue;
    const required = isTextKey(m.key) ? FIELD_DEF_BY_KEY[m.key as keyof typeof FIELD_DEF_BY_KEY].required : m.key === 'fabricSupplier';
    if (!required) continue;
    const hasValue =
      m.key === 'fabricSupplier'
        ? current.fabricSupplier !== null
        : Boolean(current.fields[m.key as keyof BriefContent['fields']].value || current.fields[m.key as keyof BriefContent['fields']].notApplicable);
    if (hasValue) continue;
    asked.add(m.key);
    issues.push({ kind: 'MISSING', fieldKey: m.key, question: m.question.trim().slice(0, 300) });
  }

  for (const w of raw.warnings) {
    const text = w.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (text && !warnings.includes(text) && warnings.length < 10) warnings.push(text);
  }

  return { suggestions, issues, warnings, stats: { evidenceRejected: stats.rejected, downgraded, dropped } };
}
