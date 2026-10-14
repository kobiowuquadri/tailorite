// GENERATED FILE — do not edit. Source of truth: tailorite-backend/src/contracts.
// Run `pnpm contracts:sync` after changing the backend contracts.
import { z } from 'zod';
import { IdempotencyKey } from './common';

export const ChangeRequestStatus = z.enum([
  'REQUESTED',
  'DRAFTING',
  'AWAITING_APPROVAL',
  'APPROVED',
  'DECLINED_BY_STUDIO',
  'DECLINED_BY_CUSTOMER',
  'WITHDRAWN',
]);
export type ChangeRequestStatus = z.infer<typeof ChangeRequestStatus>;

export const OPEN_CHANGE_STATUSES: readonly ChangeRequestStatus[] = ['REQUESTED', 'DRAFTING', 'AWAITING_APPROVAL'];

export const CHANGE_STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  REQUESTED: 'Requested by customer',
  DRAFTING: 'Proposal being prepared',
  AWAITING_APPROVAL: 'Change awaiting approval',
  APPROVED: 'Change approved',
  DECLINED_BY_STUDIO: 'Declined by studio',
  DECLINED_BY_CUSTOMER: 'Declined by customer',
  WITHDRAWN: 'Withdrawn',
};

export const StartChangeInput = z.object({
  /** Shown to the customer with the proposal: what is changing and why. */
  reason: z.string().trim().min(3, 'Describe the change').max(1000),
});
export type StartChangeInput = z.infer<typeof StartChangeInput>;

export const DeclineChangeInput = z.object({
  note: z.string().trim().min(3, 'Explain the decision').max(1000),
});
export type DeclineChangeInput = z.infer<typeof DeclineChangeInput>;

export const SubmitChangeInput = z.object({
  expectedRevision: z.number().int().min(1),
  idempotencyKey: IdempotencyKey,
  linkTtlDays: z.number().int().min(1).max(30).optional(),
});
export type SubmitChangeInput = z.infer<typeof SubmitChangeInput>;

export const IssueChangeLinkInput = z.object({
  ttlDays: z.number().int().min(1).max(30).optional(),
});
export type IssueChangeLinkInput = z.infer<typeof IssueChangeLinkInput>;

export type ChangeRequestDto = {
  id: string;
  initiator: 'CUSTOMER' | 'STUDIO';
  status: ChangeRequestStatus;
  baseVersionNumber: number;
  proposedVersionNumber: number | null;
  reason: string | null;
  customerMessages: { name: string; message: string; at: string }[];
  priceAdjustmentKobo: number | null;
  decisionNote: string | null;
  createdAt: string;
  closedAt: string | null;
};
