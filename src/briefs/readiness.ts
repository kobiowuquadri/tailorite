import {
  FIELD_DEFS,
  fieldLabel,
  type BriefContent,
  type Readiness,
  type ReadinessItem,
} from '../contracts/brief.js';
import { canonicalJson } from '../common/canonical-json.js';

export type ReadinessContext = {
  content: BriefContent;
  openIssues: { id: string; kind: string; question: string; fieldKey: string | null }[];
  /** Sources on the order that can be referenced, keyed by id. */
  sources: Map<string, { kind: 'TEXT' | 'IMAGE' | 'AUDIO'; removed: boolean; label: string }>;
  /** Today in the studio's time zone (YYYY-MM-DD). */
  today: string;
  /** For revisions: the active approved content the proposal must differ from. */
  activeContent: BriefContent | null;
};

/**
 * Server-side publication check. Publishing is blocked while any blocking item remains:
 * required details (or an explicit "Not applicable"), the measurement plan, terms and dates,
 * valid references, and every open clarification issue.
 */
export function computeReadiness(ctx: ReadinessContext): Readiness {
  const { content, today } = ctx;
  const blocking: ReadinessItem[] = [];
  const warnings: ReadinessItem[] = [];

  for (const def of FIELD_DEFS) {
    if (!def.required) continue;
    const field = content.fields[def.key];
    if (!field.value && !field.notApplicable) {
      blocking.push({
        code: 'FIELD_REQUIRED',
        section: def.section,
        field: def.key,
        message: def.allowNotApplicable
          ? `Add the ${def.label.toLowerCase()} or mark it "Not applicable".`
          : `Add the ${def.label.toLowerCase()}.`,
      });
    }
  }

  if (!content.fields.fabric.notApplicable && !content.fabricSupplier) {
    blocking.push({
      code: 'FABRIC_SUPPLIER_REQUIRED',
      section: 'fabric',
      field: 'fabricSupplier',
      message: 'Say who supplies the fabric.',
    });
  }

  const m = content.measurements;
  if (!m.mode) {
    blocking.push({
      code: 'MEASUREMENTS_REQUIRED',
      section: 'measurements',
      message: 'Record measurements, agree a fitting, or explain why measurements are not needed.',
    });
  } else if (m.mode === 'MEASURED') {
    if (!m.unit) {
      blocking.push({ code: 'MEASUREMENT_UNIT_REQUIRED', section: 'measurements', message: 'Choose the measurement unit.' });
    }
    if (m.values.length === 0) {
      blocking.push({
        code: 'MEASUREMENT_VALUES_REQUIRED',
        section: 'measurements',
        message: 'Add the measurements this garment needs, or copy them from the customer profile.',
      });
    }
  } else if (m.mode === 'AT_FITTING') {
    if (!content.terms.fittingDate) {
      blocking.push({
        code: 'FITTING_DATE_REQUIRED',
        section: 'measurements',
        field: 'fittingDate',
        message: 'Agree the fitting date when measurements will be taken.',
      });
    }
  } else if (m.mode === 'NOT_NEEDED' && !m.notNeededReason) {
    blocking.push({
      code: 'NOT_NEEDED_REASON_REQUIRED',
      section: 'measurements',
      message: 'Explain why measurements are not needed for this garment.',
    });
  }

  const t = content.terms;
  if (t.totalPriceKobo === null || t.totalPriceKobo <= 0) {
    blocking.push({ code: 'PRICE_REQUIRED', section: 'terms', field: 'totalPrice', message: 'Enter the quoted total price.' });
  }
  if (t.depositRequiredKobo === null) {
    blocking.push({
      code: 'DEPOSIT_REQUIRED',
      section: 'terms',
      field: 'depositRequired',
      message: 'Enter the deposit required (enter 0 if no deposit is needed).',
    });
  } else if (t.totalPriceKobo !== null && t.depositRequiredKobo > t.totalPriceKobo) {
    blocking.push({
      code: 'DEPOSIT_EXCEEDS_TOTAL',
      section: 'terms',
      field: 'depositRequired',
      message: 'The deposit cannot be more than the total price.',
    });
  }
  if (!t.deliveryDate) {
    blocking.push({ code: 'DELIVERY_DATE_REQUIRED', section: 'terms', field: 'deliveryDate', message: 'Agree the delivery date.' });
  } else if (t.deliveryDate < today) {
    blocking.push({
      code: 'DELIVERY_DATE_PAST',
      section: 'terms',
      field: 'deliveryDate',
      message: 'The delivery date is in the past.',
    });
  }
  if (t.fittingDate) {
    if (t.deliveryDate && t.fittingDate > t.deliveryDate) {
      blocking.push({
        code: 'FITTING_AFTER_DELIVERY',
        section: 'terms',
        field: 'fittingDate',
        message: 'The fitting date must be on or before the delivery date.',
      });
    } else if (t.fittingDate < today) {
      warnings.push({
        code: 'FITTING_AFTER_DELIVERY',
        section: 'terms',
        field: 'fittingDate',
        message: 'The fitting date is in the past. Update it if the fitting has not happened yet.',
      });
    }
  }

  for (const ref of content.references) {
    const source = ctx.sources.get(ref.sourceId);
    if (!source || source.kind !== 'IMAGE' || source.removed) {
      blocking.push({
        code: 'REFERENCE_UNAVAILABLE',
        section: 'references',
        message: 'A selected reference is no longer available. Remove it from the selected references.',
      });
    } else if (!ref.note) {
      warnings.push({
        code: 'REFERENCE_UNAVAILABLE',
        section: 'references',
        message: `Say what to take from "${source.label}" — the customer may not want every detail it shows.`,
      });
    }
  }

  for (const issue of ctx.openIssues) {
    blocking.push({
      code: 'OPEN_ISSUE',
      section: 'issues',
      issueId: issue.id,
      field: issue.fieldKey ?? undefined,
      message: `${fieldLabel(issue.fieldKey)}: ${issue.question}`,
    });
  }

  if (ctx.activeContent && canonicalJson(stripEvidence(ctx.activeContent)) === canonicalJson(stripEvidence(content))) {
    blocking.push({
      code: 'NO_CHANGES',
      section: 'terms',
      message: 'This proposal does not change the approved agreement yet.',
    });
  }

  return { ready: blocking.length === 0, blocking, warnings };
}

/** Evidence and origin metadata do not change what the customer agrees to. */
export function stripEvidence(content: BriefContent): unknown {
  return {
    ...content,
    fields: Object.fromEntries(
      Object.entries(content.fields).map(([k, f]) => [k, { value: f.value, notApplicable: f.notApplicable, note: f.note }]),
    ),
    exclusions: content.exclusions.map((e) => e.text),
  };
}
