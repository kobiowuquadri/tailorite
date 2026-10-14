import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { UserActor } from '../auth/decorators.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AgreementStateService } from '../briefs/agreement-state.service.js';
import type { ChangeRequestDto, DeclineChangeInput, StartChangeInput } from '../contracts/changes.js';
import type { VersionSnapshot } from '../contracts/approvals.js';
import { lockOrder } from '../orders/order-lock.js';

type CrRow = Prisma.ChangeRequestGetPayload<{
  include: { baseVersion: { select: { versionNumber: true } }; proposedVersion: { select: { versionNumber: true } } };
}>;

function toDto(cr: CrRow): ChangeRequestDto {
  return {
    id: cr.id,
    initiator: cr.initiator,
    status: cr.status,
    baseVersionNumber: cr.baseVersion.versionNumber,
    proposedVersionNumber: cr.proposedVersion?.versionNumber ?? null,
    reason: cr.reason,
    customerMessages: (cr.customerMessages as ChangeRequestDto['customerMessages']) ?? [],
    priceAdjustmentKobo: cr.priceAdjustmentKobo === null ? null : Number(cr.priceAdjustmentKobo),
    decisionNote: cr.decisionNote,
    createdAt: cr.createdAt.toISOString(),
    closedAt: cr.closedAt?.toISOString() ?? null,
  };
}

const crInclude = {
  baseVersion: { select: { versionNumber: true } },
  proposedVersion: { select: { versionNumber: true } },
} as const;

@Injectable()
export class ChangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly agreementState: AgreementStateService,
  ) {}

  async list(studioId: string, orderId: string): Promise<ChangeRequestDto[]> {
    const exists = await this.prisma.order.count({ where: { id: orderId, studioId } });
    if (!exists) throw Errors.notFound('Order');
    const rows = await this.prisma.changeRequest.findMany({
      where: { orderId, studioId },
      include: crInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  private async approvedOrder(tx: Tx, studioId: string, orderId: string) {
    await lockOrder(tx, studioId, orderId);
    const order = await tx.order.findFirstOrThrow({
      where: { id: orderId, studioId },
      include: { activeVersion: true, changeRequests: { where: { openSlot: { not: null } }, take: 1 } },
    });
    if (!order.activeVersion) throw Errors.invalidState('Changes start from an approved version of the brief.');
    if (order.productionStatus === 'CANCELLED' || order.archivedAt) throw Errors.invalidState('This order is closed.');
    if (order.productionStatus === 'COMPLETED') throw Errors.invalidState('This order is completed.');
    return order;
  }

  /** The studio starts a change proposal based on the active approved version. */
  async startFromStudio(studioId: string, actor: UserActor, orderId: string, input: StartChangeInput): Promise<ChangeRequestDto> {
    const id = await this.prisma.$transaction(async (tx) => {
      const order = await this.approvedOrder(tx, studioId, orderId);
      const open = order.changeRequests[0];
      if (open?.status === 'REQUESTED') {
        throw Errors.conflict('The customer has an open change request. Start the proposal from their request.', {
          changeRequestId: open.id,
        });
      }
      if (open) throw Errors.invalidState('A change is already being prepared for this order.');
      const cr = await tx.changeRequest.create({
        data: {
          studioId,
          orderId,
          baseVersionId: order.activeVersion!.id,
          initiator: 'STUDIO',
          status: 'DRAFTING',
          openSlot: orderId,
          reason: input.reason,
          createdById: actor.userId,
        },
      });
      await tx.briefDraft.update({
        where: { orderId },
        data: { changeRequestId: cr.id, baseVersionId: order.activeVersion!.id },
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'CHANGE_STARTED',
        summary: `Change proposal started from version ${order.activeVersion!.versionNumber}: ${input.reason}`,
        data: { changeRequestId: cr.id },
      });
      await this.agreementState.refresh(tx, studioId, orderId);
      return cr.id;
    });
    return this.get(studioId, orderId, id);
  }

  /** The studio accepts to work on a customer's request; the customer still approves the final proposal. */
  async startFromRequest(
    studioId: string,
    actor: UserActor,
    orderId: string,
    changeRequestId: string,
    input: StartChangeInput,
  ): Promise<ChangeRequestDto> {
    await this.prisma.$transaction(async (tx) => {
      const order = await this.approvedOrder(tx, studioId, orderId);
      const cr = await tx.changeRequest.findFirst({ where: { id: changeRequestId, orderId, studioId } });
      if (!cr) throw Errors.notFound('Change request');
      if (cr.status === 'DRAFTING') return;
      if (cr.status !== 'REQUESTED') throw Errors.invalidState('This change request is no longer open.');
      if (cr.baseVersionId !== order.activeVersionId) throw Errors.staleVersion();
      await tx.changeRequest.update({ where: { id: cr.id }, data: { status: 'DRAFTING', reason: input.reason } });
      await tx.briefDraft.update({
        where: { orderId },
        data: { changeRequestId: cr.id, baseVersionId: order.activeVersion!.id },
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'CHANGE_STARTED',
        summary: `Started a proposal for the customer's change request: ${input.reason}`,
        data: { changeRequestId: cr.id },
      });
      await this.agreementState.refresh(tx, studioId, orderId);
    });
    return this.get(studioId, orderId, changeRequestId);
  }

  /**
   * Declines a customer request or withdraws a studio proposal. Any proposal awaiting approval is
   * withdrawn (its links stop working) and the working brief returns to the active agreement.
   */
  async decline(
    studioId: string,
    actor: UserActor,
    orderId: string,
    changeRequestId: string,
    input: DeclineChangeInput,
  ): Promise<ChangeRequestDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const cr = await tx.changeRequest.findFirst({ where: { id: changeRequestId, orderId, studioId } });
      if (!cr) throw Errors.notFound('Change request');
      if (!cr.openSlot) throw Errors.invalidState('This change request is already closed.');
      const now = new Date();
      if (cr.status === 'AWAITING_APPROVAL') {
        const pending = await tx.approvalRequest.findMany({ where: { changeRequestId: cr.id, status: 'PENDING' } });
        for (const request of pending) {
          await tx.approvalRequest.update({
            where: { id: request.id },
            data: { status: 'WITHDRAWN', pendingSlot: null, closedAt: now, closedReason: 'Change withdrawn by the studio' },
          });
          await tx.customerPortalAccess.updateMany({
            where: { approvalRequestId: request.id, revokedAt: null },
            data: { revokedAt: now, revokedReason: 'Change withdrawn by the studio' },
          });
        }
      }
      const status = cr.initiator === 'CUSTOMER' ? 'DECLINED_BY_STUDIO' : 'WITHDRAWN';
      await tx.changeRequest.update({
        where: { id: cr.id },
        data: { status, openSlot: null, closedAt: now, decisionNote: input.note },
      });
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { activeVersion: true } });
      const draft = await tx.briefDraft.findUniqueOrThrow({ where: { orderId } });
      if (draft.changeRequestId === cr.id && order.activeVersion) {
        await tx.briefDraft.update({
          where: { orderId },
          data: {
            content: (order.activeVersion.snapshot as unknown as VersionSnapshot).brief as unknown as Prisma.InputJsonValue,
            changeRequestId: null,
            revision: { increment: 1 },
          },
        });
      }
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: status === 'WITHDRAWN' ? 'CHANGE_WITHDRAWN' : 'CHANGE_DECLINED',
        summary:
          status === 'WITHDRAWN'
            ? `Change proposal withdrawn — ${input.note}`
            : `Customer's change request declined — ${input.note}`,
        data: { changeRequestId: cr.id },
      });
      await this.agreementState.refresh(tx, studioId, orderId);
    });
    return this.get(studioId, orderId, changeRequestId);
  }

  private async get(studioId: string, orderId: string, id: string): Promise<ChangeRequestDto> {
    const row = await this.prisma.changeRequest.findFirst({ where: { id, orderId, studioId }, include: crInclude });
    if (!row) throw Errors.notFound('Change request');
    return toDto(row);
  }
}
