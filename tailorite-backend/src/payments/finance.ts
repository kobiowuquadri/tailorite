import type { FinanceDto } from '../contracts/payments.js';

export type LedgerEntry = { kind: 'DEPOSIT' | 'PAYMENT' | 'REFUND' | 'REVERSAL'; signedAmountKobo: bigint };

/**
 * Exact integer (kobo) arithmetic for money received and balances.
 *   balanceDue = activeApprovedTotal − netRecordedPayments
 * A negative balance is reported as credit/refund due, never silently clamped away.
 */
export function computeFinance(input: {
  agreed: { versionNumber: number; totalKobo: bigint; depositRequiredKobo: bigint } | null;
  proposed: FinanceDto['proposed'];
  entries: LedgerEntry[];
}): Omit<FinanceDto, 'currency' | 'entries'> {
  let deposits = 0n;
  let payments = 0n;
  let refunds = 0n;
  let reversals = 0n;
  for (const e of input.entries) {
    if (e.kind === 'DEPOSIT') deposits += e.signedAmountKobo;
    else if (e.kind === 'PAYMENT') payments += e.signedAmountKobo;
    else if (e.kind === 'REFUND') refunds += -e.signedAmountKobo;
    else reversals += e.signedAmountKobo;
  }
  const net = deposits + payments - refunds + reversals;
  const agreed = input.agreed;
  const max0 = (v: bigint) => (v > 0n ? v : 0n);
  return {
    agreed: agreed
      ? {
          versionNumber: agreed.versionNumber,
          totalKobo: Number(agreed.totalKobo),
          depositRequiredKobo: Number(agreed.depositRequiredKobo),
        }
      : null,
    proposed: input.proposed,
    received: {
      depositsKobo: Number(deposits),
      paymentsKobo: Number(payments),
      refundsKobo: Number(refunds),
      reversalsKobo: Number(reversals),
      netKobo: Number(net),
    },
    balanceDueKobo: agreed ? Number(max0(agreed.totalKobo - net)) : null,
    creditDueKobo: agreed ? Number(max0(net - agreed.totalKobo)) : null,
    depositOutstandingKobo: agreed ? Number(max0(agreed.depositRequiredKobo - net)) : null,
    estimatedBalanceKobo:
      !agreed && input.proposed?.totalKobo !== null && input.proposed?.totalKobo !== undefined
        ? input.proposed.totalKobo - Number(net)
        : null,
  };
}
