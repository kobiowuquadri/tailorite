// GENERATED FILE — do not edit. Source of truth: tailorite-backend/src/contracts.
// Run `pnpm contracts:sync` after changing the backend contracts.
import { z } from 'zod';
import { IdempotencyKey, IsoDate, optionalText, PositiveKobo } from './common';

export const PaymentKind = z.enum(['DEPOSIT', 'PAYMENT', 'REFUND', 'REVERSAL']);
export type PaymentKind = z.infer<typeof PaymentKind>;

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  DEPOSIT: 'Deposit received',
  PAYMENT: 'Payment received',
  REFUND: 'Refund given',
  REVERSAL: 'Correction (reversal)',
};

export const RecordPaymentInput = z.object({
  kind: z.enum(['DEPOSIT', 'PAYMENT', 'REFUND']),
  amountKobo: PositiveKobo,
  receivedOn: IsoDate,
  method: optionalText(40),
  note: optionalText(500),
  idempotencyKey: IdempotencyKey,
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentInput>;

export const ReversePaymentInput = z.object({
  note: z.string().trim().min(3, 'Explain the correction').max(500),
  idempotencyKey: IdempotencyKey,
});
export type ReversePaymentInput = z.infer<typeof ReversePaymentInput>;

export type PaymentDto = {
  id: string;
  kind: PaymentKind;
  amountKobo: number;
  /** Effect on money received: positive for deposits/payments, negative for refunds. */
  signedAmountKobo: number;
  method: string | null;
  receivedOn: string;
  note: string | null;
  recordedBy: string | null;
  createdAt: string;
  reversesId: string | null;
  reversedById: string | null;
};

export type FinanceDto = {
  currency: 'USD';
  /** Terms of the active approved version (the agreement in force). */
  agreed: { versionNumber: number; totalKobo: number; depositRequiredKobo: number } | null;
  /** Proposed terms that are not yet agreed (draft or version awaiting approval). */
  proposed: {
    source: 'PENDING_VERSION' | 'DRAFT';
    versionNumber: number | null;
    totalKobo: number | null;
    depositRequiredKobo: number | null;
    adjustmentKobo: number | null;
  } | null;
  received: {
    depositsKobo: number;
    paymentsKobo: number;
    refundsKobo: number;
    reversalsKobo: number;
    netKobo: number;
  };
  /** activeApprovedTotal − netRecordedPayments, floored at 0. Null without an approved agreement. */
  balanceDueKobo: number | null;
  /** Positive when recorded payments exceed the agreed total: the studio owes a refund/credit. */
  creditDueKobo: number | null;
  depositOutstandingKobo: number | null;
  /** For unapproved orders: proposed total − net recorded payments (an estimate, not agreed). */
  estimatedBalanceKobo: number | null;
  entries: PaymentDto[];
};
