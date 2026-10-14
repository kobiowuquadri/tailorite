import { randomUUID } from 'node:crypto';
import {
  FIELD_DEF_BY_KEY,
  TEXT_FIELD_KEYS,
  type BriefContent,
  type Evidence,
  type FieldOrigin,
  type TextFieldKey,
} from '../contracts/brief.js';
import { MAX_KOBO } from '../contracts/common.js';
import { Errors } from '../common/errors/app-error.js';

const isTextKey = (key: string): key is TextFieldKey => (TEXT_FIELD_KEYS as readonly string[]).includes(key);

/** "₦85,000", "85000", "85k", 85000 → kobo. Values are naira as written by people. */
export function parseNairaToKobo(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  }
  const cleaned = value.toLowerCase().replace(/naira|ngn|₦|,|\s/g, '');
  const match = /^(\d+(?:\.\d{1,2})?)(k|m)?$/.exec(cleaned);
  if (!match) return null;
  const multiplier = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : 1;
  const kobo = Math.round(Number(match[1]) * multiplier * 100);
  return kobo <= MAX_KOBO ? kobo : null;
}

export function parseIsoDateValue(value: string | number): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[0]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[0] ? null : match[0];
}

function parseSupplier(value: string | number): 'CUSTOMER' | 'STUDIO' | null {
  const v = String(value).trim().toLowerCase();
  if (v === 'customer') return 'CUSTOMER';
  if (v === 'studio') return 'STUDIO';
  if (/studio|tailor|we will source|we'll source/.test(v)) return 'STUDIO';
  if (/customer|client|i will provide|i'll provide|bring|my own/.test(v)) return 'CUSTOMER';
  return null;
}

/**
 * Applies a person-confirmed value to the working brief. Returns a new content object.
 * Throws a validation error when the value does not fit the field (e.g. an unreadable amount).
 */
export function applyFieldValue(
  content: BriefContent,
  key: string,
  value: string | number | null,
  opts: { evidence?: Evidence[]; origin: FieldOrigin; notApplicable?: boolean; note?: string | null },
): BriefContent {
  const next: BriefContent = structuredClone(content);
  const evidence = opts.evidence ?? [];

  if (isTextKey(key)) {
    const def = FIELD_DEF_BY_KEY[key];
    if (opts.notApplicable) {
      if (!def.allowNotApplicable) throw Errors.validation(`${def.label} cannot be marked not applicable.`);
      next.fields[key] = { value: null, notApplicable: true, note: opts.note ?? null, evidence, origin: opts.origin };
      return next;
    }
    const text = value === null ? '' : String(value).trim();
    if (!text) throw Errors.validation(`Enter a value for ${def.label.toLowerCase()}.`);
    next.fields[key] = {
      value: text.slice(0, 2000),
      notApplicable: false,
      note: opts.note ?? next.fields[key].note,
      evidence,
      origin: opts.origin,
    };
    return next;
  }

  if (opts.notApplicable) throw Errors.validation('This detail cannot be marked not applicable.');
  if (value === null) throw Errors.validation('Enter a value.');

  switch (key) {
    case 'fabricSupplier': {
      const supplier = parseSupplier(value);
      if (!supplier) throw Errors.validation('Choose whether the customer or the studio supplies the fabric.');
      next.fabricSupplier = supplier;
      return next;
    }
    case 'exclusion': {
      const text = String(value).trim();
      if (!text) throw Errors.validation('Describe what is excluded.');
      if (!next.exclusions.some((e) => e.text.toLowerCase() === text.toLowerCase())) {
        next.exclusions.push({ id: randomUUID().slice(0, 8), text: text.slice(0, 200), evidence, origin: opts.origin });
      }
      return next;
    }
    case 'totalPrice':
    case 'depositRequired': {
      const kobo = parseNairaToKobo(value);
      if (kobo === null) throw Errors.validation('Enter the amount in naira, for example 85000.');
      if (key === 'totalPrice') next.terms.totalPriceKobo = kobo;
      else next.terms.depositRequiredKobo = kobo;
      return next;
    }
    case 'deliveryDate':
    case 'fittingDate': {
      const iso = parseIsoDateValue(value);
      if (!iso) throw Errors.validation('Enter the date as YYYY-MM-DD.');
      if (key === 'deliveryDate') next.terms.deliveryDate = iso;
      else next.terms.fittingDate = iso;
      return next;
    }
    default:
      throw Errors.validation('This detail cannot be set from here.');
  }
}

/** Human-readable current value for side-by-side review of a suggestion. */
export function currentValueFor(content: BriefContent, key: string): string | null {
  if (isTextKey(key)) {
    const f = content.fields[key];
    return f.notApplicable ? 'Not applicable' : f.value;
  }
  switch (key) {
    case 'fabricSupplier':
      return content.fabricSupplier === 'CUSTOMER' ? 'Customer' : content.fabricSupplier === 'STUDIO' ? 'Studio' : null;
    case 'exclusion':
      return content.exclusions.length ? content.exclusions.map((e) => e.text).join('; ') : null;
    case 'totalPrice':
      return content.terms.totalPriceKobo !== null ? `₦${(content.terms.totalPriceKobo / 100).toLocaleString('en-NG')}` : null;
    case 'depositRequired':
      return content.terms.depositRequiredKobo !== null ? `₦${(content.terms.depositRequiredKobo / 100).toLocaleString('en-NG')}` : null;
    case 'deliveryDate':
      return content.terms.deliveryDate;
    case 'fittingDate':
      return content.terms.fittingDate;
    default:
      return null;
  }
}
