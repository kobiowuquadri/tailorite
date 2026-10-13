import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { UserActor } from '../auth/decorators.js';
import { BriefContent, formatKobo } from '../contracts/brief.js';
import {
  PAYMENT_KIND_LABELS,
  type FinanceDto,
  type PaymentDto,
  type RecordPaymentInput,
  type ReversePaymentInput,
} from '../contracts/payments.js';
import { dateOnlyToDb, dbToDateOnly, todayInZone } from '../common/time/dates.js';
import { lockOrder } from '../orders/order-lock.js';
import { computeFinance } from './finance.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async finance(studioId: string, orderId: string): Promise<FinanceDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, studioId },
      include: {
        activeVersion: true,
        draft: { select: { content: true, changeRequestId: true } },
        approvalRequests: { where: { status: 'PENDING' }, include: { version: true }, take: 1 },
        payments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { reversedBy: { select: { id: true } } } },
      },
    });
    if (!order) throw Errors.notFound('Order');

    const agreed = order.activeVersion
      ? {
          versionNumber: order.activeVersion.versionNumber,
          totalKobo: order.activeVersion.totalPriceKobo,
          depositRequiredKobo: order.activeVersion.depositRequiredKobo,
        }
      : null;
    const pending = order.approvalRequests[0]?.version ?? null;
    let proposed: FinanceDto['proposed'] = null;
    if (pending) {
      proposed = {
        source: 'PENDING_VERSION',
        versionNumber: pending.versionNumber,
        totalKobo: Number(pending.totalPriceKobo),
        depositRequiredKobo: Number(pending.depositRequiredKobo),
        adjustmentKobo: agreed ? Number(pending.totalPriceKobo - agreed.totalKobo) : null,
      };
    } else if (order.draft && (!agreed || order.draft.changeRequestId)) {
      const terms = BriefContent.parse(order.draft.content).terms;
      proposed = {
        source: 'DRAFT',
        versionNumber: null,
        totalKobo: terms.totalPriceKobo,
        depositRequiredKobo: terms.depositRequiredKobo,
        adjustmentKobo: agreed && terms.totalPriceKobo !== null ? terms.totalPriceKobo - Number(agreed.totalKobo) : null,
      };
    }

    const recorderIds = [...new Set(order.payments.map((p) => p.recordedById).filter((id): id is string => Boolean(id)))];
    const recorders = new Map(
      (await this.prisma.user.findMany({ where: { id: { in: recorderIds } }, select: { id: true, name: true } })).map((u) => [
        u.id,
        u.name,
      ]),
    );
    const entries: PaymentDto[] = order.payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      amountKobo: Number(p.amountKobo),
      signedAmountKobo: Number(p.signedAmountKobo),
      method: p.method,
      receivedOn: dbToDateOnly(p.receivedOn),
      note: p.note,
      recordedBy: p.recordedById ? (recorders.get(p.recordedById) ?? null) : null,
      createdAt: p.createdAt.toISOString(),
      reversesId: p.reversesId,
      reversedById: p.reversedBy?.id ?? null,
    }));

    return {
      currency: 'NGN',
      ...computeFinance({ agreed, proposed, entries: order.payments }),
      entries,
    };
  }

  async record(studioId: string, actor: UserActor, orderId: string, input: RecordPaymentInput): Promise<FinanceDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const existing = await tx.manualPayment.findFirst({ where: { orderId, idempotencyKey: input.idempotencyKey } });
      if (existing) return;
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (order.archivedAt) throw Errors.invalidState('This order is archived.');
      const amount = BigInt(input.amountKobo);
      await tx.manualPayment.create({
        data: {
          studioId,
          orderId,
          kind: input.kind,
          amountKobo: amount,
          signedAmountKobo: input.kind === 'REFUND' ? -amount : amount,
          method: input.method,
          receivedOn: dateOnlyToDb(input.receivedOn),
          note: input.note,
          idempotencyKey: input.idempotencyKey,
          recordedById: actor.userId,
        },
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'PAYMENT_RECORDED',
        summary: `${PAYMENT_KIND_LABELS[input.kind]}: ${formatKobo(input.amountKobo)}${input.method ? ` (${input.method})` : ''} — recorded by studio`,
        data: { kind: input.kind, amountKobo: input.amountKobo },
      });
    });
    return this.finance(studioId, orderId);
  }

  /** Corrections never edit or delete history: they add an opposite entry linked to the original. */
  async reverse(
    studioId: string,
    actor: UserActor,
    orderId: string,
    paymentId: string,
    input: ReversePaymentInput,
  ): Promise<FinanceDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const existing = await tx.manualPayment.findFirst({ where: { orderId, idempotencyKey: input.idempotencyKey } });
      if (existing) return;
      const payment = await tx.manualPayment.findFirst({
        where: { id: paymentId, orderId, studioId },
        include: { reversedBy: { select: { id: true } }, order: { include: { studio: { select: { timeZone: true } } } } },
      });
      if (!payment) throw Errors.notFound('Payment');
      if (payment.kind === 'REVERSAL') throw Errors.invalidState('A correction cannot itself be reversed. Record a new entry instead.');
      if (payment.reversedBy) throw Errors.invalidState('This entry has already been reversed.');
      await tx.manualPayment.create({
        data: {
          studioId,
          orderId,
          kind: 'REVERSAL',
          amountKobo: payment.amountKobo,
          signedAmountKobo: -payment.signedAmountKobo,
          receivedOn: dateOnlyToDb(todayInZone(payment.order.studio.timeZone)),
          note: input.note,
          reversesId: payment.id,
          idempotencyKey: input.idempotencyKey,
          recordedById: actor.userId,
        },
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'PAYMENT_REVERSED',
        summary: `Reversed ${PAYMENT_KIND_LABELS[payment.kind].toLowerCase()} of ${formatKobo(Number(payment.amountKobo))} — ${input.note}`,
        data: { paymentId },
      });
    });
    return this.finance(studioId, orderId);
  }
}
