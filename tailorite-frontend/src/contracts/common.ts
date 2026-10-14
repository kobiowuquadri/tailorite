// GENERATED FILE — do not edit. Source of truth: tailorite-backend/src/contracts.
// Run `pnpm contracts:sync` after changing the backend contracts.
// Shared request/response contracts. This folder must only import `zod` and sibling files:
// the web app receives a generated copy (tailorite-frontend: `pnpm contracts:sync`).
import { z } from 'zod';

export const Uuid = z.uuid('Invalid identifier');

/** Calendar date without time (YYYY-MM-DD), interpreted in the studio's time zone. */
export const IsoDate = z.iso.date('Use a date in YYYY-MM-DD format');

/**
 * Money is always an integer number of cents (US$1 = 100 cents). Upper bound $1,000,000,000.
 * Field names ending in `Kobo` date from before the switch to US dollars; they are kept because approved
 * versions are sealed snapshots that use those keys. They hold cents.
 */
export const MAX_KOBO = 100_000_000_000;
export const Kobo = z
  .number('Enter an amount')
  .int('Amounts are whole cents')
  .min(0, 'Amount cannot be negative')
  .max(MAX_KOBO, 'Amount is too large');
export const PositiveKobo = Kobo.min(1, 'Amount must be greater than zero');

export const IdempotencyKey = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Invalid idempotency key');

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'ONBOARDING_REQUIRED',
  'CSRF_REJECTED',
  'NOT_FOUND',
  'CONFLICT',
  'STALE_REVISION',
  'STALE_VERSION',
  'ALREADY_DECIDED',
  'INVALID_STATE',
  'PUBLISH_BLOCKED',
  'LINK_EXPIRED',
  'LINK_REVOKED',
  'LINK_INVALID',
  'PORTAL_SESSION_REQUIRED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA',
  'LIMIT_REACHED',
  'RATE_LIMITED',
  'AI_NOT_CONFIGURED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Every error response uses this shape. */
export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    fieldErrors?: Record<string, string[]>;
    requestId: string;
    meta?: Record<string, unknown>;
  };
};

export type Ok = { ok: true };

/**
 * Friendlier default messages for missing values. Call once per process (API, worker, web app).
 */
export function installZodErrorMessages(): void {
  z.config({
    customError: (issue) => {
      if (issue.code === 'invalid_type' && (issue.input === undefined || issue.input === null)) {
        return 'This field is required';
      }
      return undefined;
    },
  });
}
