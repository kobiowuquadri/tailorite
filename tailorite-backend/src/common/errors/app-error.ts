import type { ErrorCode } from '../../contracts/common.js';

export type AppErrorDetails = {
  fieldErrors?: Record<string, string[]>;
  meta?: Record<string, unknown>;
  retryAfterSeconds?: number;
};

/** An expected, user-facing error. Messages must be safe to show to the person using the app. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly details: AppErrorDetails = {},
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (message: string, fieldErrors?: Record<string, string[]>) =>
    new AppError('VALIDATION_FAILED', message, 422, { fieldErrors }),
  unauthenticated: (message = 'Please sign in to continue.') => new AppError('UNAUTHENTICATED', message, 401),
  forbidden: (message = 'You do not have access to this.') => new AppError('FORBIDDEN', message, 403),
  onboardingRequired: () =>
    new AppError('ONBOARDING_REQUIRED', 'Finish setting up your studio to continue.', 403),
  notFound: (what = 'Item') => new AppError('NOT_FOUND', `${what} was not found.`, 404),
  conflict: (message: string, meta?: Record<string, unknown>) => new AppError('CONFLICT', message, 409, { meta }),
  invalidState: (message: string, meta?: Record<string, unknown>) =>
    new AppError('INVALID_STATE', message, 409, { meta }),
  staleRevision: (currentRevision: number) =>
    new AppError(
      'STALE_REVISION',
      'This brief was changed elsewhere (for example in another tab or by applying a suggestion). Reload to see the latest version.',
      409,
      { meta: { currentRevision } },
    ),
  staleVersion: (message = 'A newer agreement is now active, so this proposal can no longer be applied.') =>
    new AppError('STALE_VERSION', message, 409),
  alreadyDecided: (meta?: Record<string, unknown>) =>
    new AppError('ALREADY_DECIDED', 'A decision has already been recorded for this version.', 409, { meta }),
  publishBlocked: (meta: Record<string, unknown>) =>
    new AppError('PUBLISH_BLOCKED', 'Some agreement details still need attention before sharing.', 422, { meta }),
  payloadTooLarge: (message: string) => new AppError('PAYLOAD_TOO_LARGE', message, 413),
  unsupportedMedia: (message: string) => new AppError('UNSUPPORTED_MEDIA', message, 415),
  limitReached: (message: string, meta?: Record<string, unknown>) =>
    new AppError('LIMIT_REACHED', message, 429, { meta }),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError('RATE_LIMITED', 'Too many attempts. Please wait a moment and try again.', 429, {
      retryAfterSeconds,
      meta: { retryAfterSeconds },
    }),
  aiNotConfigured: (message: string) => new AppError('AI_NOT_CONFIGURED', message, 503),
};
