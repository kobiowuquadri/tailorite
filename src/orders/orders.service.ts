import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { Actor, UserActor } from '../auth/decorators.js';
import type { Prisma } from '../generated/prisma/client.js';
import { BriefContent, emptyBriefContent } from '../contracts/brief.js';
import {
  DUE_SOON_DAYS,
  orderReference,
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_TRANSITIONS,
  type CancelOrderInput,
  type CreateOrderInput,
  type DashboardDto,
  type OrderDetailDto,
  type OrderListQuery,
  type OrderSummaryDto,
  type ProductionTransitionInput,
  type UpdateOrderInput,
} from '../contracts/orders.js';
import type { Page } from '../contracts/common.js';
import type { VersionSnapshot } from '../contracts/approvals.js';
import { addDays, dateOnlyToDb, todayInZone } from '../common/time/dates.js';
import { AgreementStateService } from '../briefs/agreement-state.service.js';
import { canonicalJson } from '../common/canonical-json.js';
import { stripEvidence } from '../briefs/readiness.js';
import { lockOrder } from './order-lock.js';
import {
  orderSummaryInclude,
  toOrderSummary,
  toVersionSummary,
  versionSummaryInclude,
} from './order-views.js';

const orderDetailInclude = {
  ...orderSummaryInclude,
  customer: { select: { id: true, name: true, phone: true } },
  draft: { select: { revision: true, content: true, changeRequestId: true } },
  versions: { include: versionSummaryInclude, orderBy: { versionNumber: 'desc' } },
  _count: { select: { sources: { where: { removedAt: null } }, issues: { where: { status: 'OPEN' } } } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly agreementState: AgreementStateService,
  ) {}

  async create(studioId: string, actor: UserActor, input: CreateOrderInput): Promise<OrderSummaryDto> {
    const order = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId, studioId, archivedAt: null } });
      if (!customer) {
        throw Errors.validation('Choose a customer from your studio.', { customerId: ['Customer not found'] });
      }
      // The studio row lock serializes order numbering per studio.
      const counter = await tx.studio.update({
        where: { id: studioId },
        data: { nextOrderNumber: { increment: 1 } },
        select: { nextOrderNumber: true },
      });
      const orderNumber = counter.nextOrderNumber - 1;
      const created = await tx.order.create({
        data: {
          studioId,
          customerId: customer.id,
          orderNumber,
          title: input.title,
          garmentType: input.garmentType,
          createdById: actor.userId,
        },
      });
      await tx.briefDraft.create({
        data: { studioId, orderId: created.id, content: emptyBriefContent(input.garmentType) },
      });
      await this.audit.record(tx, {
        studioId,
        orderId: created.id,
        actor,
        type: 'ORDER_CREATED',
        summary: `Order ${orderReference(orderNumber)} created for ${customer.name}`,
      });
      return tx.order.findUniqueOrThrow({ where: { id: created.id }, include: orderSummaryInclude });
    });
    return toOrderSummary(order);
  }

  private async today(studioId: string): Promise<string> {
    const studio = await this.prisma.studio.findUniqueOrThrow({ where: { id: studioId }, select: { timeZone: true } });
    return todayInZone(studio.timeZone);
  }

  private filterWhere(filter: OrderListQuery['filter'], dueSoonLimit: string): Prisma.OrderWhereInput {
    const notCancelled: Prisma.OrderWhereInput = { productionStatus: { not: 'CANCELLED' } };
    switch (filter) {
      case 'drafts':
        return { agreementStatus: { in: ['DRAFT', 'READY_FOR_REVIEW'] }, ...notCancelled };
      case 'needs_clarification':
        return { agreementStatus: 'NEEDS_CLARIFICATION', ...notCancelled };
      case 'awaiting_approval':
        return { agreementStatus: { in: ['AWAITING_APPROVAL', 'REVISION_AWAITING_APPROVAL'] }, ...notCancelled };
      case 'approved_not_started':
        return { activeVersionId: { not: null }, productionStatus: 'NOT_STARTED' };
      case 'due_soon':
        return {
          dueDate: { lte: dateOnlyToDb(dueSoonLimit) },
          productionStatus: { notIn: ['COMPLETED', 'CANCELLED'] },
        };
      case 'change_requested':
        return { changeRequests: { some: { status: 'REQUESTED' } }, ...notCancelled };
      default:
        return {};
    }
  }

  async list(studioId: string, query: OrderListQuery): Promise<Page<OrderSummaryDto>> {
    const today = await this.today(studioId);
    const and: Prisma.OrderWhereInput[] = [{ studioId }];
    if (query.view === 'active') and.push({ archivedAt: null });
    if (query.view === 'archived') and.push({ archivedAt: { not: null } });
    if (query.agreement) and.push({ agreementStatus: query.agreement });
    if (query.production) and.push({ productionStatus: query.production });
    if (query.customerId) and.push({ customerId: query.customerId });
    if (query.filter) and.push(this.filterWhere(query.filter, addDays(today, DUE_SOON_DAYS)));
    const search = query.search?.trim();
    if (search) {
      const numberMatch = /^(?:ord-?)?0*(\d{1,7})$/i.exec(search);
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { garmentType: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
          ...(numberMatch ? [{ orderNumber: Number(numberMatch[1]) }] : []),
        ],
      });
    }
    const where: Prisma.OrderWhereInput = { AND: and };
    const orderBy: Prisma.OrderOrderByWithRelationInput[] =
      query.filter === 'due_soon' ? [{ dueDate: 'asc' }, { id: 'asc' }] : [{ updatedAt: 'desc' }, { id: 'desc' }];
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: orderSummaryInclude,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map(toOrderSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async dashboard(studioId: string): Promise<DashboardDto> {
    const today = await this.today(studioId);
    const dueLimit = addDays(today, DUE_SOON_DAYS);
    const base: Prisma.OrderWhereInput = { studioId, archivedAt: null };
    const count = (filter: OrderListQuery['filter']) =>
      this.prisma.order.count({ where: { AND: [base, this.filterWhere(filter, dueLimit)] } });
    const [draft, needsClarification, awaitingApproval, approvedNotStarted, dueSoon, changeRequested, orders, customers] =
      await Promise.all([
        count('drafts'),
        count('needs_clarification'),
        count('awaiting_approval'),
        count('approved_not_started'),
        count('due_soon'),
        count('change_requested'),
        this.prisma.order.count({ where: { studioId } }),
        this.prisma.customer.count({ where: { studioId } }),
      ]);
    const attentionRows = await this.prisma.order.findMany({
      where: {
        ...base,
        productionStatus: { notIn: ['COMPLETED', 'CANCELLED'] },
        OR: [
          { agreementStatus: { in: ['NEEDS_CLARIFICATION', 'READY_FOR_REVIEW', 'REVISION_DRAFT'] } },
          { changeRequests: { some: { status: 'REQUESTED' } } },
          { activeVersionId: { not: null }, productionStatus: 'NOT_STARTED' },
          { dueDate: { lte: dateOnlyToDb(dueLimit) } },
        ],
      },
      include: orderSummaryInclude,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 8,
    });
    const recentRows = await this.prisma.order.findMany({
      where: base,
      include: orderSummaryInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 6,
    });
    return {
      counts: { draft, needsClarification, awaitingApproval, approvedNotStarted, dueSoon, changeRequested },
      dueSoonDays: DUE_SOON_DAYS,
      today,
      attention: attentionRows.map(toOrderSummary),
      recent: recentRows.map(toOrderSummary),
      totals: { orders, customers },
    };
  }

  async detail(studioId: string, orderId: string): Promise<OrderDetailDto> {
    const full = await this.prisma.order.findFirst({ where: { id: orderId, studioId }, include: orderDetailInclude });
    if (!full) throw Errors.notFound('Order');
    const summary = toOrderSummary(full);
    const versions = full.versions.map((v) => toVersionSummary(v, full.activeVersionId));
    const active = versions.find((v) => v.isActive) ?? null;
    const pending = versions.find((v) => v.status === 'AWAITING_APPROVAL') ?? null;

    let hasUnpublishedChanges = false;
    const activeRow = full.versions.find((v) => v.id === full.activeVersionId);
    if (activeRow && full.draft) {
      const activeBrief = BriefContent.parse((activeRow.snapshot as unknown as VersionSnapshot).brief);
      const draftBrief = BriefContent.parse(full.draft.content);
      hasUnpublishedChanges = canonicalJson(stripEvidence(activeBrief)) !== canonicalJson(stripEvidence(draftBrief));
    }

    const cancelled = full.productionStatus === 'CANCELLED';
    const allowed = cancelled || full.archivedAt
      ? []
      : PRODUCTION_TRANSITIONS[full.productionStatus].filter(
          (to) => to !== 'CANCELLED' && (full.activeVersionId !== null || to === 'NOT_STARTED'),
        );
    return {
      ...summary,
      customer: full.customer,
      cancelledAt: full.cancelledAt?.toISOString() ?? null,
      cancelReason: full.cancelReason,
      firstApprovedAt: full.firstApprovedAt?.toISOString() ?? null,
      allowedProductionTransitions: allowed,
      canCancel: !cancelled && full.productionStatus !== 'COMPLETED' && !full.archivedAt,
      canArchive: !full.archivedAt && (full.productionStatus === 'COMPLETED' || cancelled),
      activeVersion: active,
      pendingVersion: pending,
      versions,
      sourceCount: full._count.sources,
      openIssueCount: full._count.issues,
      hasUnpublishedChanges,
      draftRevision: full.draft?.revision ?? 0,
    };
  }

  async update(studioId: string, actor: Actor, orderId: string, input: UpdateOrderInput): Promise<OrderDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.updateMany({ where: { id: orderId, studioId }, data: { title: input.title } });
      if (result.count === 0) throw Errors.notFound('Order');
      await this.audit.record(tx, { studioId, orderId, actor, type: 'ORDER_UPDATED', summary: `Title changed to "${input.title}"` });
    });
    return this.detail(studioId, orderId);
  }

  async transitionProduction(
    studioId: string,
    actor: Actor,
    orderId: string,
    input: ProductionTransitionInput,
  ): Promise<OrderDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (order.archivedAt) throw Errors.invalidState('Archived orders cannot be updated.');
      if (order.productionStatus === input.to) return;
      if (!PRODUCTION_TRANSITIONS[order.productionStatus].includes(input.to)) {
        throw Errors.invalidState(
          `An order that is "${PRODUCTION_STATUS_LABELS[order.productionStatus]}" cannot move to "${PRODUCTION_STATUS_LABELS[input.to]}".`,
        );
      }
      if (!order.activeVersionId) {
        throw Errors.invalidState('Production can only start once the customer has approved a version of the brief.');
      }
      await tx.order.update({
        where: { id: orderId },
        data: { productionStatus: input.to, productionUpdatedAt: new Date() },
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'PRODUCTION_UPDATED',
        summary: `Production: ${PRODUCTION_STATUS_LABELS[order.productionStatus]} → ${PRODUCTION_STATUS_LABELS[input.to]}${input.note ? ` — ${input.note}` : ''}`,
        data: { from: order.productionStatus, to: input.to },
      });
    });
    return this.detail(studioId, orderId);
  }

  async cancel(studioId: string, actor: Actor, orderId: string, input: CancelOrderInput): Promise<OrderDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (order.productionStatus === 'CANCELLED') return;
      if (order.productionStatus === 'COMPLETED') throw Errors.invalidState('Completed orders cannot be cancelled.');
      const now = new Date();
      await tx.order.update({
        where: { id: orderId },
        data: { productionStatus: 'CANCELLED', cancelledAt: now, cancelReason: input.reason, productionUpdatedAt: now },
      });
      await this.closeOpenAgreementWork(tx, orderId, 'Order cancelled', now);
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'ORDER_CANCELLED',
        summary: `Order cancelled — ${input.reason}`,
      });
      await this.agreementState.refresh(tx, studioId, orderId);
    });
    return this.detail(studioId, orderId);
  }

  /** Withdraws pending approvals, revokes every customer link and closes open change requests. */
  async closeOpenAgreementWork(tx: Tx, orderId: string, reason: string, now = new Date()) {
    await tx.approvalRequest.updateMany({
      where: { orderId, status: 'PENDING' },
      data: { status: 'WITHDRAWN', pendingSlot: null, closedAt: now, closedReason: reason },
    });
    await tx.customerPortalAccess.updateMany({
      where: { orderId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
    await tx.changeRequest.updateMany({
      where: { orderId, openSlot: { not: null } },
      data: { status: 'WITHDRAWN', openSlot: null, closedAt: now, decisionNote: reason },
    });
    await tx.briefDraft.updateMany({ where: { orderId }, data: { changeRequestId: null } });
  }

  async setArchived(studioId: string, actor: Actor, orderId: string, archived: boolean): Promise<OrderDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (archived) {
        if (order.archivedAt) return;
        if (order.productionStatus !== 'COMPLETED' && order.productionStatus !== 'CANCELLED') {
          throw Errors.invalidState('Only completed or cancelled orders can be archived.');
        }
      } else if (!order.archivedAt) {
        return;
      }
      await tx.order.update({ where: { id: orderId }, data: { archivedAt: archived ? new Date() : null } });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: archived ? 'ORDER_ARCHIVED' : 'ORDER_UNARCHIVED',
        summary: archived ? 'Order archived' : 'Order restored from the archive',
      });
    });
    return this.detail(studioId, orderId);
  }

  async timeline(studioId: string, orderId: string) {
    const exists = await this.prisma.order.count({ where: { id: orderId, studioId } });
    if (!exists) throw Errors.notFound('Order');
    return this.audit.orderTimeline(studioId, orderId);
  }
}
