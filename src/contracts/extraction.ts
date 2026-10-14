// GENERATED FILE — do not edit. Source of truth: tailorite-backend/src/contracts.
// Run `pnpm contracts:sync` after changing the backend contracts.
import { z } from 'zod';
import { IdempotencyKey } from './common';

export const JobStatus = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']);
export type JobStatus = z.infer<typeof JobStatus>;

export const StartExtractionInput = z.object({
  idempotencyKey: IdempotencyKey,
});
export type StartExtractionInput = z.infer<typeof StartExtractionInput>;

export type ExtractionJobDto = {
  id: string;
  status: JobStatus;
  mode: 'LIVE' | 'FIXTURE' | 'TEST';
  attempts: number;
  maxAttempts: number;
  sourceCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  provider: string | null;
  model: string | null;
  result: {
    id: string;
    suggestionCount: number;
    issueCount: number;
    warnings: string[];
    /** True when the brief or sources changed while this job was processing. */
    stale: boolean;
    staleReason: string | null;
    isExample: boolean;
    evidenceRejected: number;
  } | null;
};

export type ExtractionOverviewDto = {
  latest: ExtractionJobDto | null;
  history: ExtractionJobDto[];
  /** Sources that changed (added/corrected) since the latest successful extraction. */
  sourcesChangedSinceLatest: boolean;
  canStart: boolean;
  cannotStartReason: string | null;
};
