import { z } from 'zod';
import { IsoDate, Kobo, Uuid } from './common.js';
import { MeasurementValue } from './customers.js';
import { MeasurementUnit, MEASUREMENT_UNIT_SHORT } from './studio.js';

// ─────────────────────────────────────────────── evidence

export const EvidenceBasis = z.enum([
  'EXPLICIT_TEXT',
  'AUDIO_TRANSCRIPT',
  'VISUAL_OBSERVATION',
  'INFERENCE',
]);
export type EvidenceBasis = z.infer<typeof EvidenceBasis>;

export const EVIDENCE_BASIS_LABELS: Record<EvidenceBasis, string> = {
  EXPLICIT_TEXT: 'Stated in a message',
  AUDIO_TRANSCRIPT: 'From a voice note transcript',
  VISUAL_OBSERVATION: 'Seen in a reference image',
  INFERENCE: 'Inferred — not stated by the customer',
};

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .nullable()
    .default(null)
    .transform((v) => (v === '' ? null : v));

/** A pointer from a brief value to the original material that supports it. */
export const Evidence = z.object({
  sourceId: Uuid,
  /** Exact text found in the source (or in its transcript for audio). */
  quote: z.string().max(500).nullable().default(null),
  /** Character range of `quote` in the source text / transcript. */
  charStart: z.number().int().min(0).nullable().default(null),
  charEnd: z.number().int().min(0).nullable().default(null),
  /** Transcript the quote was found in (audio sources). */
  transcriptId: Uuid.nullable().default(null),
  /** Validated audio time range, only when reliable timing is available. */
  startMs: z.number().int().min(0).nullable().default(null),
  endMs: z.number().int().min(0).nullable().default(null),
  note: z.string().max(300).nullable().default(null),
});
export type Evidence = z.infer<typeof Evidence>;

export const FieldOrigin = z.enum(['MANUAL', 'AI_ACCEPTED', 'AI_EDITED', 'CLARIFICATION']);
export type FieldOrigin = z.infer<typeof FieldOrigin>;

/** A free-text brief value that can be explicitly marked "Not applicable". */
export const BriefField = z.object({
  value: nullableText(2000),
  notApplicable: z.boolean().default(false),
  note: nullableText(1000),
  evidence: z.array(Evidence).max(12).default(() => []),
  origin: FieldOrigin.default('MANUAL'),
});
export type BriefField = z.infer<typeof BriefField>;

// ─────────────────────────────────────────────── field registry

export type FieldSection = 'garment' | 'design' | 'fabric' | 'extras';

export const TEXT_FIELD_KEYS = [
  'garmentType',
  'overallStyle',
  'neckline',
  'sleeves',
  'length',
  'fit',
  'back',
  'closure',
  'lining',
  'otherDetails',
  'fabric',
  'color',
  'embellishments',
  'specialRequests',
] as const;
export type TextFieldKey = (typeof TEXT_FIELD_KEYS)[number];

export type FieldDef = {
  key: TextFieldKey;
  section: FieldSection;
  label: string;
  /** Required fields must have a value or be explicitly marked "Not applicable" (when allowed). */
  required: boolean;
  allowNotApplicable: boolean;
  placeholder: string;
};

export const FIELD_DEFS: readonly FieldDef[] = [
  { key: 'garmentType', section: 'garment', label: 'Garment', required: true, allowNotApplicable: false, placeholder: 'e.g. Floor-length dress' },
  { key: 'overallStyle', section: 'design', label: 'Overall style', required: true, allowNotApplicable: false, placeholder: 'e.g. Fitted evening gown, clean silhouette' },
  { key: 'neckline', section: 'design', label: 'Neckline', required: true, allowNotApplicable: true, placeholder: 'e.g. Square neckline' },
  { key: 'sleeves', section: 'design', label: 'Sleeves', required: true, allowNotApplicable: true, placeholder: 'e.g. Elbow-length, fitted' },
  { key: 'length', section: 'design', label: 'Length', required: true, allowNotApplicable: true, placeholder: 'e.g. Floor length' },
  { key: 'fit', section: 'design', label: 'Fit preference', required: true, allowNotApplicable: true, placeholder: 'e.g. Fitted through the bodice, relaxed skirt' },
  { key: 'back', section: 'design', label: 'Back details', required: false, allowNotApplicable: true, placeholder: 'e.g. Concealed zip, modest back' },
  { key: 'closure', section: 'design', label: 'Closure', required: false, allowNotApplicable: true, placeholder: 'e.g. Invisible side zip' },
  { key: 'lining', section: 'design', label: 'Lining', required: false, allowNotApplicable: true, placeholder: 'e.g. Fully lined' },
  { key: 'otherDetails', section: 'design', label: 'Other design details', required: false, allowNotApplicable: true, placeholder: 'Anything else agreed about the design' },
  { key: 'fabric', section: 'fabric', label: 'Fabric', required: true, allowNotApplicable: true, placeholder: 'e.g. Crepe, medium weight' },
  { key: 'color', section: 'fabric', label: 'Colour', required: true, allowNotApplicable: true, placeholder: 'e.g. Navy blue' },
  { key: 'embellishments', section: 'extras', label: 'Embellishments', required: false, allowNotApplicable: true, placeholder: 'e.g. Light beading around the neckline' },
  { key: 'specialRequests', section: 'extras', label: 'Special requests', required: false, allowNotApplicable: true, placeholder: 'e.g. Extra seam allowance at the waist' },
];

export const FIELD_DEF_BY_KEY: Record<TextFieldKey, FieldDef> = Object.fromEntries(
  FIELD_DEFS.map((d) => [d.key, d]),
) as Record<TextFieldKey, FieldDef>;

export const SECTION_TITLES: Record<FieldSection | 'measurements' | 'terms' | 'references' | 'exclusions' | 'notes', string> = {
  garment: 'Customer and garment',
  design: 'Design details',
  fabric: 'Fabric and colour',
  extras: 'Embellishments and special requests',
  exclusions: 'Explicitly excluded',
  references: 'Selected references',
  measurements: 'Measurements',
  terms: 'Price and dates',
  notes: 'Notes for the customer',
};

/** Keys the AI may propose values for (text fields plus structured terms). */
export const SUGGESTION_KEYS = [
  ...TEXT_FIELD_KEYS,
  'fabricSupplier',
  'exclusion',
  'totalPrice',
  'depositRequired',
  'deliveryDate',
  'fittingDate',
] as const;
export type SuggestionKey = (typeof SUGGESTION_KEYS)[number];

export const SUGGESTION_KEY_LABELS: Record<SuggestionKey, string> = {
  ...(Object.fromEntries(FIELD_DEFS.map((d) => [d.key, d.label])) as Record<TextFieldKey, string>),
  fabricSupplier: 'Fabric supplied by',
  exclusion: 'Excluded',
  totalPrice: 'Total price',
  depositRequired: 'Deposit required',
  deliveryDate: 'Delivery date',
  fittingDate: 'Fitting date',
};

export function fieldLabel(key: string | null | undefined): string {
  if (!key) return 'General';
  return (SUGGESTION_KEY_LABELS as Record<string, string>)[key] ?? key;
}

// ─────────────────────────────────────────────── brief content

export const FabricSupplier = z.enum(['CUSTOMER', 'STUDIO']);
export type FabricSupplier = z.infer<typeof FabricSupplier>;
export const FABRIC_SUPPLIER_LABELS: Record<FabricSupplier, string> = {
  CUSTOMER: 'Customer provides the fabric',
  STUDIO: 'Studio sources the fabric',
};

export const MeasurementMode = z.enum(['MEASURED', 'AT_FITTING', 'NOT_NEEDED']);
export type MeasurementMode = z.infer<typeof MeasurementMode>;
export const MEASUREMENT_MODE_LABELS: Record<MeasurementMode, string> = {
  MEASURED: 'Measurements recorded',
  AT_FITTING: 'Measurements will be taken at a fitting',
  NOT_NEEDED: 'Measurements not needed',
};

export const Exclusion = z.object({
  id: z.string().min(1).max(40),
  text: z.string().trim().min(1, 'Describe what is excluded').max(200),
  evidence: z.array(Evidence).max(12).default(() => []),
  origin: FieldOrigin.default('MANUAL'),
});
export type Exclusion = z.infer<typeof Exclusion>;

export const ReferenceSelection = z.object({
  sourceId: Uuid,
  /** What to take from this reference (it may show details the customer does not want). */
  note: nullableText(300),
});
export type ReferenceSelection = z.infer<typeof ReferenceSelection>;

export const BriefMeasurements = z.object({
  mode: MeasurementMode.nullable().default(null),
  unit: MeasurementUnit.nullable().default(null),
  values: z.array(MeasurementValue).max(40).default(() => []),
  recordedOn: IsoDate.nullable().default(null),
  fittingNote: nullableText(500),
  notNeededReason: nullableText(300),
});
export type BriefMeasurements = z.infer<typeof BriefMeasurements>;

export const BriefTerms = z.object({
  totalPriceKobo: Kobo.nullable().default(null),
  depositRequiredKobo: Kobo.nullable().default(null),
  deliveryDate: IsoDate.nullable().default(null),
  fittingDate: IsoDate.nullable().default(null),
  paymentNote: nullableText(500),
});
export type BriefTerms = z.infer<typeof BriefTerms>;

export const BriefFields = z.object(
  Object.fromEntries(TEXT_FIELD_KEYS.map((k) => [k, BriefField.default(() => BriefField.parse({}))])) as {
    [K in TextFieldKey]: z.ZodDefault<typeof BriefField>;
  },
);

export const BriefContent = z
  .object({
    schemaVersion: z.literal(1).default(1),
    fields: BriefFields.default(() => BriefFields.parse({})),
    fabricSupplier: FabricSupplier.nullable().default(null),
    fabricSupplierNote: nullableText(300),
    exclusions: z.array(Exclusion).max(20).default(() => []),
    references: z.array(ReferenceSelection).max(12).default(() => []),
    measurements: BriefMeasurements.default(() => BriefMeasurements.parse({})),
    terms: BriefTerms.default(() => BriefTerms.parse({})),
    customerNotes: nullableText(2000),
  })
  .superRefine((brief, ctx) => {
    const refIds = brief.references.map((r) => r.sourceId);
    if (new Set(refIds).size !== refIds.length) {
      ctx.addIssue({ code: 'custom', path: ['references'], message: 'Each reference can only be selected once' });
    }
    const exclusionIds = brief.exclusions.map((e) => e.id);
    if (new Set(exclusionIds).size !== exclusionIds.length) {
      ctx.addIssue({ code: 'custom', path: ['exclusions'], message: 'Duplicate exclusion id' });
    }
    for (const key of TEXT_FIELD_KEYS) {
      const field = brief.fields[key];
      if (field.notApplicable && field.value) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', key, 'value'],
          message: 'Clear the value or untick "Not applicable"',
        });
      }
      if (field.notApplicable && !FIELD_DEF_BY_KEY[key].allowNotApplicable) {
        ctx.addIssue({ code: 'custom', path: ['fields', key], message: 'This detail cannot be marked not applicable' });
      }
    }
  });
export type BriefContent = z.infer<typeof BriefContent>;

export function emptyBriefContent(garmentType?: string | null): BriefContent {
  const content = BriefContent.parse({});
  if (garmentType) content.fields.garmentType.value = garmentType.trim();
  return content;
}

// ─────────────────────────────────────────────── readiness, issues, suggestions

export type ReadinessSection = FieldSection | 'measurements' | 'terms' | 'references' | 'issues';

export type ReadinessItem = {
  code:
    | 'FIELD_REQUIRED'
    | 'FABRIC_SUPPLIER_REQUIRED'
    | 'MEASUREMENTS_REQUIRED'
    | 'MEASUREMENT_VALUES_REQUIRED'
    | 'MEASUREMENT_UNIT_REQUIRED'
    | 'FITTING_DATE_REQUIRED'
    | 'NOT_NEEDED_REASON_REQUIRED'
    | 'PRICE_REQUIRED'
    | 'DEPOSIT_REQUIRED'
    | 'DEPOSIT_EXCEEDS_TOTAL'
    | 'DELIVERY_DATE_REQUIRED'
    | 'DELIVERY_DATE_PAST'
    | 'FITTING_AFTER_DELIVERY'
    | 'REFERENCE_UNAVAILABLE'
    | 'OPEN_ISSUE'
    | 'NO_CHANGES';
  section: ReadinessSection;
  message: string;
  field?: string;
  issueId?: string;
};

export type Readiness = {
  ready: boolean;
  blocking: ReadinessItem[];
  warnings: ReadinessItem[];
};

export const IssueKind = z.enum(['MISSING', 'CONFLICT', 'QUESTION', 'CUSTOMER_FEEDBACK']);
export type IssueKind = z.infer<typeof IssueKind>;
export const IssueStatus = z.enum(['OPEN', 'RESOLVED', 'DISMISSED']);
export type IssueStatus = z.infer<typeof IssueStatus>;

export const ISSUE_KIND_LABELS: Record<IssueKind, string> = {
  MISSING: 'Missing detail',
  CONFLICT: 'Conflicting instructions',
  QUESTION: 'Question to confirm',
  CUSTOMER_FEEDBACK: 'Customer requested changes',
};

export type ConflictCandidate = { value: string; evidence: Evidence[] };

export type IssueDto = {
  id: string;
  kind: IssueKind;
  origin: 'AI' | 'SYSTEM' | 'STUDIO' | 'CUSTOMER';
  fieldKey: string | null;
  fieldLabel: string;
  question: string;
  candidates: ConflictCandidate[] | null;
  evidence: Evidence[] | null;
  status: IssueStatus;
  resolutionNote: string | null;
  resolvedValue: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export const CreateIssueInput = z.object({
  question: z.string().trim().min(3, 'Describe what needs confirming').max(500),
  fieldKey: z.enum(SUGGESTION_KEYS).nullable().optional(),
});
export type CreateIssueInput = z.infer<typeof CreateIssueInput>;

const resolutionNote = z.string().trim().max(500).optional();

export const ResolveIssueInput = z.object({
  expectedRevision: z.number().int().min(1),
  resolution: z.discriminatedUnion('type', [
    z.object({ type: z.literal('CANDIDATE'), candidateIndex: z.number().int().min(0).max(10), note: resolutionNote }),
    z.object({ type: z.literal('VALUE'), value: z.string().trim().min(1, 'Enter the agreed value').max(2000), note: resolutionNote }),
    z.object({ type: z.literal('NOT_APPLICABLE'), note: resolutionNote }),
    z.object({ type: z.literal('NOTE_ONLY'), note: z.string().trim().min(2, 'Add a short note').max(500) }),
  ]),
});
export type ResolveIssueInput = z.infer<typeof ResolveIssueInput>;

export const DismissIssueInput = z.object({
  note: z.string().trim().min(2, 'Say why this is not relevant').max(500),
});
export type DismissIssueInput = z.infer<typeof DismissIssueInput>;

export const SuggestionStatus = z.enum(['PENDING', 'ACCEPTED', 'EDITED', 'REJECTED', 'SUPERSEDED']);
export type SuggestionStatus = z.infer<typeof SuggestionStatus>;

export type SuggestionDto = {
  id: string;
  resultId: string;
  fieldKey: SuggestionKey;
  fieldLabel: string;
  proposedValue: string | number | null;
  displayValue: string;
  unit: string | null;
  basis: EvidenceBasis;
  evidence: Evidence[];
  needsHumanReview: boolean;
  status: SuggestionStatus;
  /** Current draft value for the same field, for side-by-side review. */
  currentValue: string | null;
  createdAt: string;
};

export const AcceptSuggestionInput = z.object({
  expectedRevision: z.number().int().min(1),
  /** Present when the tailor edited the value before accepting. */
  value: z.string().trim().min(1).max(2000).optional(),
});
export type AcceptSuggestionInput = z.infer<typeof AcceptSuggestionInput>;

export const SaveBriefInput = z.object({
  expectedRevision: z.number().int().min(1),
  content: BriefContent,
  internalNotes: z.string().trim().max(5000).nullable(),
});
export type SaveBriefInput = z.infer<typeof SaveBriefInput>;

export const CopyMeasurementsInput = z.object({
  expectedRevision: z.number().int().min(1),
  /** Measurement keys to copy from the customer's current profile. Empty = all. */
  keys: z.array(z.string().max(48)).max(40).default(() => []),
});
export type CopyMeasurementsInput = z.infer<typeof CopyMeasurementsInput>;

export type BriefDto = {
  orderId: string;
  revision: number;
  content: BriefContent;
  internalNotes: string | null;
  baseVersionId: string | null;
  baseVersionNumber: number | null;
  changeRequestId: string | null;
  editable: boolean;
  lockReason: string | null;
  readiness: Readiness;
  issues: IssueDto[];
  suggestions: SuggestionDto[];
  /** True when the draft differs from the active approved version. */
  hasUnpublishedChanges: boolean;
  pendingVersion: { id: string; number: number } | null;
  customer: { id: string; name: string; hasMeasurements: boolean; measurementUnit: string | null };
  updatedAt: string;
};

// ─────────────────────────────────────────────── presentation & comparison (pure, shared)

export type PresentedRow = {
  key: string;
  label: string;
  value: string;
  note: string | null;
  notApplicable: boolean;
  empty: boolean;
};

export type PresentedSection = { key: string; title: string; rows: PresentedRow[] };

/** Cents → "$850" or "$850.50". */
export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function textRow(content: BriefContent, key: TextFieldKey): PresentedRow {
  const def = FIELD_DEF_BY_KEY[key];
  const f = content.fields[key];
  const empty = !f.value && !f.notApplicable;
  return {
    key,
    label: def.label,
    value: f.notApplicable ? 'Not applicable' : (f.value ?? (def.required ? 'Not specified' : 'None specified')),
    note: f.note,
    notApplicable: f.notApplicable,
    empty,
  };
}

function measurementsRows(m: BriefMeasurements, terms: BriefTerms): PresentedRow[] {
  const rows: PresentedRow[] = [];
  const unit = m.unit ? MEASUREMENT_UNIT_SHORT[m.unit] : '';
  rows.push({
    key: 'measurements.mode',
    label: 'Plan',
    value: m.mode ? MEASUREMENT_MODE_LABELS[m.mode] : 'Not specified',
    note: m.mode === 'NOT_NEEDED' ? m.notNeededReason : m.mode === 'AT_FITTING' ? m.fittingNote : null,
    notApplicable: false,
    empty: !m.mode,
  });
  if (m.mode === 'AT_FITTING') {
    rows.push({
      key: 'measurements.fittingDate',
      label: 'Fitting date',
      value: formatIsoDate(terms.fittingDate),
      note: null,
      notApplicable: false,
      empty: !terms.fittingDate,
    });
  }
  if (m.mode === 'MEASURED') {
    if (m.recordedOn) {
      rows.push({ key: 'measurements.recordedOn', label: 'Recorded on', value: formatIsoDate(m.recordedOn), note: null, notApplicable: false, empty: false });
    }
    for (const v of m.values) {
      rows.push({ key: `measurements.${v.key}`, label: v.label, value: `${v.value} ${unit}`.trim(), note: null, notApplicable: false, empty: false });
    }
  }
  return rows;
}

function termsRows(t: BriefTerms): PresentedRow[] {
  return [
    { key: 'terms.totalPrice', label: 'Total price', value: formatMoney(t.totalPriceKobo), note: null, notApplicable: false, empty: t.totalPriceKobo === null },
    { key: 'terms.deposit', label: 'Deposit required', value: formatMoney(t.depositRequiredKobo), note: t.paymentNote, notApplicable: false, empty: t.depositRequiredKobo === null },
    { key: 'terms.deliveryDate', label: 'Delivery date', value: formatIsoDate(t.deliveryDate), note: null, notApplicable: false, empty: !t.deliveryDate },
    { key: 'terms.fittingDate', label: 'Fitting date', value: t.fittingDate ? formatIsoDate(t.fittingDate) : 'No fitting scheduled', note: null, notApplicable: false, empty: !t.fittingDate },
  ];
}

/**
 * Customer-facing presentation of a brief. Contains no evidence, internal notes or source text,
 * so it is safe to send to the customer portal.
 */
export function presentBrief(content: BriefContent): PresentedSection[] {
  const sections: PresentedSection[] = [];
  const bySection = (section: FieldSection) =>
    FIELD_DEFS.filter((d) => d.section === section)
      .map((d) => textRow(content, d.key))
      .filter((row) => FIELD_DEF_BY_KEY[row.key as TextFieldKey].required || !row.empty);

  sections.push({ key: 'garment', title: SECTION_TITLES.garment, rows: bySection('garment') });
  sections.push({ key: 'design', title: SECTION_TITLES.design, rows: bySection('design') });
  const fabricRows = bySection('fabric');
  fabricRows.push({
    key: 'fabricSupplier',
    label: 'Fabric supplied by',
    value: content.fabricSupplier ? FABRIC_SUPPLIER_LABELS[content.fabricSupplier] : 'Not specified',
    note: content.fabricSupplierNote,
    notApplicable: false,
    empty: !content.fabricSupplier,
  });
  sections.push({ key: 'fabric', title: SECTION_TITLES.fabric, rows: fabricRows });
  sections.push({ key: 'extras', title: SECTION_TITLES.extras, rows: FIELD_DEFS.filter((d) => d.section === 'extras').map((d) => textRow(content, d.key)) });
  sections.push({
    key: 'exclusions',
    title: SECTION_TITLES.exclusions,
    rows: content.exclusions.length
      ? content.exclusions.map((e) => ({ key: `exclusion.${e.id}`, label: 'Excluded', value: e.text, note: null, notApplicable: false, empty: false }))
      : [{ key: 'exclusions.none', label: 'Excluded', value: 'Nothing explicitly excluded', note: null, notApplicable: false, empty: true }],
  });
  sections.push({ key: 'measurements', title: SECTION_TITLES.measurements, rows: measurementsRows(content.measurements, content.terms) });
  sections.push({ key: 'terms', title: SECTION_TITLES.terms, rows: termsRows(content.terms) });
  if (content.customerNotes) {
    sections.push({
      key: 'notes',
      title: SECTION_TITLES.notes,
      rows: [{ key: 'customerNotes', label: 'Notes', value: content.customerNotes, note: null, notApplicable: false, empty: false }],
    });
  }
  return sections;
}

export type FieldChange = {
  key: string;
  label: string;
  section: string;
  before: string;
  after: string;
};

/** Field-level differences between two briefs (customer-facing values only). */
export function compareBriefs(before: BriefContent, after: BriefContent): FieldChange[] {
  const flatten = (content: BriefContent) => {
    const map = new Map<string, { label: string; section: string; value: string }>();
    for (const section of presentBrief(content)) {
      for (const row of section.rows) {
        const value = row.note ? `${row.value} (${row.note})` : row.value;
        map.set(row.key, { label: row.label, section: section.title, value });
      }
    }
    for (const ref of content.references) {
      map.set(`reference.${ref.sourceId}`, {
        label: 'Reference',
        section: SECTION_TITLES.references,
        value: ref.note ? `Selected — ${ref.note}` : 'Selected',
      });
    }
    return map;
  };
  const a = flatten(before);
  const b = flatten(after);
  const keys = new Set([...a.keys(), ...b.keys()]);
  const changes: FieldChange[] = [];
  for (const key of keys) {
    const x = a.get(key);
    const y = b.get(key);
    const beforeValue = x?.value ?? 'Not included';
    const afterValue = y?.value ?? 'Not included';
    if (beforeValue !== afterValue) {
      changes.push({
        key,
        label: (y ?? x)!.label,
        section: (y ?? x)!.section,
        before: beforeValue,
        after: afterValue,
      });
    }
  }
  return changes;
}
