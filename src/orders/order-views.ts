import type { Prisma } from '../generated/prisma/client.js';
import {
  orderReference,
  type NextStep,
  type OrderSummaryDto,
  type VersionStatus,
  type VersionSummaryDto,
} from '../contracts/orders.js';
import { dbToDateOnly } from '../common/time/dates.js';

export const orderSummaryInclude = {
  customer: { select: { id: true, name: true } },
  activeVersion: { select: { versionNumber: true } },
  approvalRequests: {
    where: { status: 'PENDING' },
    select: { version: { select: { versionNumber: true } } },
    take: 1,
  },
  changeRequests: { where: { openSlot: { not: null } }, select: { status: true }, take: 1 },
  _count: { select: { sources: { where: { removedAt: null } } } },
} satisfies Prisma.OrderInclude;

export type OrderSummaryRow = Prisma.OrderGetPayload<{ include: typeof orderSummaryInclude }>;

export function nextStepFor(o: {
  agreementStatus: OrderSummaryDto['agreementStatus'];
  productionStatus: OrderSummaryDto['productionStatus'];
  archivedAt: Date | null;
  sourceCount: number;
  openChangeStatus: string | null;
  pendingVersionNumber: number | null;
}): NextStep {
  if (o.archivedAt) return { kind: 'NONE', label: 'Archived' };
  if (o.productionStatus === 'CANCELLED') return { kind: 'NONE', label: 'Order cancelled' };
  if (o.openChangeStatus === 'REQUESTED') {
    return { kind: 'REVIEW_CHANGE_REQUEST', label: 'Review the customer’s change request' };
  }
  switch (o.agreementStatus) {
    case 'DRAFT':
      return o.sourceCount === 0
        ? { kind: 'ADD_SOURCES', label: 'Add the customer’s messages, images or voice notes' }
        : { kind: 'CONTINUE_BRIEF', label: 'Continue the brief' };
    case 'NEEDS_CLARIFICATION':
      return { kind: 'RESOLVE_ISSUES', label: 'Resolve the open questions' };
    case 'READY_FOR_REVIEW':
      return { kind: 'SHARE_FOR_REVIEW', label: 'Share for customer review' };
    case 'AWAITING_APPROVAL':
      return { kind: 'AWAIT_APPROVAL', label: `Waiting for the customer to approve version ${o.pendingVersionNumber ?? ''}`.trim() };
    case 'REVISION_DRAFT':
      return { kind: 'FINISH_CHANGE', label: 'Finish the change proposal' };
    case 'REVISION_AWAITING_APPROVAL':
      return { kind: 'AWAIT_CHANGE_APPROVAL', label: 'Waiting for the customer to approve the change' };
    case 'APPROVED':
      if (o.productionStatus === 'NOT_STARTED') return { kind: 'START_PRODUCTION', label: 'Start production' };
      if (o.productionStatus === 'COMPLETED') return { kind: 'ARCHIVE', label: 'Completed — archive when ready' };
      return { kind: 'UPDATE_PRODUCTION', label: 'Update production progress' };
  }
}

export function toOrderSummary(row: OrderSummaryRow): OrderSummaryDto {
  const pendingVersionNumber = row.approvalRequests[0]?.version.versionNumber ?? null;
  const openChange = row.changeRequests[0] ?? null;
  return {
    id: row.id,
    number: row.orderNumber,
    reference: orderReference(row.orderNumber),
    title: row.title,
    garmentType: row.garmentType,
    customer: row.customer,
    agreementStatus: row.agreementStatus,
    productionStatus: row.productionStatus,
    activeVersionNumber: row.activeVersion?.versionNumber ?? null,
    pendingVersionNumber,
    dueDate: dbToDateOnly(row.dueDate),
    openChangeRequest: Boolean(openChange),
    isSynthetic: row.isSynthetic,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    nextStep: nextStepFor({
      agreementStatus: row.agreementStatus,
      productionStatus: row.productionStatus,
      archivedAt: row.archivedAt,
      sourceCount: row._count.sources,
      openChangeStatus: openChange?.status ?? null,
      pendingVersionNumber,
    }),
  };
}

export const versionSummaryInclude = {
  approvalRequest: { select: { status: true, event: true } },
  basedOn: { select: { versionNumber: true } },
} satisfies Prisma.BriefVersionInclude;

export type VersionRow = Prisma.BriefVersionGetPayload<{ include: typeof versionSummaryInclude }>;

export function toVersionSummary(v: VersionRow, activeVersionId: string | null): VersionSummaryDto {
  const request = v.approvalRequest;
  const status: VersionStatus = (request?.status === 'PENDING' ? 'AWAITING_APPROVAL' : request?.status) ?? 'WITHDRAWN';
  const event = request?.event ?? null;
  return {
    id: v.id,
    number: v.versionNumber,
    kind: v.kind,
    status,
    isActive: v.id === activeVersionId,
    contentHash: v.contentHash,
    totalPriceKobo: Number(v.totalPriceKobo),
    depositRequiredKobo: Number(v.depositRequiredKobo),
    deliveryDate: dbToDateOnly(v.deliveryDate),
    fittingDate: dbToDateOnly(v.fittingDate),
    publishedAt: v.publishedAt.toISOString(),
    basedOnVersionNumber: v.basedOn?.versionNumber ?? null,
    changeRequestId: v.changeRequestId,
    decision: event
      ? {
          decision: event.decision,
          customerName: event.customerName,
          comment: event.comment,
          contentHash: event.contentHash,
          at: event.createdAt.toISOString(),
        }
      : null,
  };
}
