import { z } from 'zod';
import { PaginationQuery, Uuid } from './common.js';

export const AgreementStatus = z.enum([
  'DRAFT',
  'NEEDS_CLARIFICATION',
  'READY_FOR_REVIEW',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REVISION_DRAFT',
  'REVISION_AWAITING_APPROVAL',
]);
export type AgreementStatus = z.infer<typeof AgreementStatus>;

export const ProductionStatus = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'READY_FOR_FITTING',
  'READY_FOR_COLLECTION',
  'COMPLETED',
  'CANCELLED',
]);
export type ProductionStatus = z.infer<typeof ProductionStatus>;

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  DRAFT: 'Draft',
  NEEDS_CLARIFICATION: 'Needs clarification',
  READY_FOR_REVIEW: 'Ready for customer review',
  AWAITING_APPROVAL: 'Awaiting customer approval',
  APPROVED: 'Approved version',
  REVISION_DRAFT: 'Change being prepared',
  REVISION_AWAITING_APPROVAL: 'Change awaiting approval',
};

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  READY_FOR_FITTING: 'Ready for fitting',
  READY_FOR_COLLECTION: 'Ready for collection',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export function orderReference(orderNumber: number): string {
  return `ORD-${String(orderNumber).padStart(4, '0')}`;
}

export const CreateOrderInput = z.object({
  customerId: Uuid,
  title: z.string().trim().min(2, 'Give the order a short title').max(120),
  garmentType: z.string().trim().min(2, 'Enter the garment type').max(80),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

export const UpdateOrderInput = z.object({
  title: z.string().trim().min(2).max(120),
});
export type UpdateOrderInput = z.infer<typeof UpdateOrderInput>;

export const OrderView = z.enum(['active', 'archived', 'all']);

export const ORDER_FILTERS = [
  'drafts',
  'needs_clarification',
  'awaiting_approval',
  'approved_not_started',
  'due_soon',
  'change_requested',
] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

export const ORDER_FILTER_LABELS: Record<OrderFilter, string> = {
  drafts: 'Draft orders',
  needs_clarification: 'Needs clarification',
  awaiting_approval: 'Awaiting customer approval',
  approved_not_started: 'Approved, not started',
  due_soon: 'Due within 7 days',
  change_requested: 'Change requested by customer',
};

/** "Due soon" window used by the dashboard (includes overdue orders). */
export const DUE_SOON_DAYS = 7;

export const OrderListQuery = PaginationQuery.extend({
  search: z.string().trim().max(100).optional(),
  agreement: AgreementStatus.optional(),
  production: ProductionStatus.optional(),
  /** Dashboard shortcuts. */
  filter: z.enum(ORDER_FILTERS).optional(),
  customerId: Uuid.optional(),
  view: OrderView.default('active'),
});
export type OrderListQuery = z.infer<typeof OrderListQuery>;

export type NextStep = {
  kind:
    | 'ADD_SOURCES'
    | 'CONTINUE_BRIEF'
    | 'RESOLVE_ISSUES'
    | 'SHARE_FOR_REVIEW'
    | 'AWAIT_APPROVAL'
    | 'REVIEW_CHANGE_REQUEST'
    | 'FINISH_CHANGE'
    | 'AWAIT_CHANGE_APPROVAL'
    | 'START_PRODUCTION'
    | 'UPDATE_PRODUCTION'
    | 'ARCHIVE'
    | 'NONE';
  label: string;
};

export type OrderSummaryDto = {
  id: string;
  number: number;
  reference: string;
  title: string;
  garmentType: string;
  customer: { id: string; name: string };
  agreementStatus: AgreementStatus;
  productionStatus: ProductionStatus;
  activeVersionNumber: number | null;
  pendingVersionNumber: number | null;
  /** Agreed delivery date of the active approved version. */
  dueDate: string | null;
  openChangeRequest: boolean;
  isSynthetic: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  nextStep: NextStep;
};

export type DashboardDto = {
  counts: {
    draft: number;
    needsClarification: number;
    awaitingApproval: number;
    approvedNotStarted: number;
    dueSoon: number;
    changeRequested: number;
  };
  dueSoonDays: number;
  today: string;
  attention: OrderSummaryDto[];
  recent: OrderSummaryDto[];
  totals: { orders: number; customers: number };
};

export const PRODUCTION_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  NOT_STARTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['READY_FOR_FITTING', 'READY_FOR_COLLECTION', 'CANCELLED'],
  READY_FOR_FITTING: ['IN_PROGRESS', 'READY_FOR_COLLECTION', 'CANCELLED'],
  READY_FOR_COLLECTION: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const ProductionTransitionInput = z.object({
  to: ProductionStatus.exclude(['CANCELLED']),
  note: z.string().trim().max(500).optional(),
});
export type ProductionTransitionInput = z.infer<typeof ProductionTransitionInput>;

export const CancelOrderInput = z.object({
  reason: z.string().trim().min(3, 'Give a short reason').max(500),
});
export type CancelOrderInput = z.infer<typeof CancelOrderInput>;

export type VersionStatus =
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'DECLINED'
  | 'SUPERSEDED'
  | 'WITHDRAWN';

export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  AWAITING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
  DECLINED: 'Declined by customer',
  SUPERSEDED: 'Replaced by a newer version',
  WITHDRAWN: 'Withdrawn',
};

export type DecisionDto = {
  decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'DECLINED';
  customerName: string;
  comment: string | null;
  contentHash: string;
  at: string;
};

export type VersionSummaryDto = {
  id: string;
  number: number;
  kind: 'INITIAL' | 'REVISION';
  status: VersionStatus;
  isActive: boolean;
  contentHash: string;
  totalPriceKobo: number;
  depositRequiredKobo: number;
  deliveryDate: string;
  fittingDate: string | null;
  publishedAt: string;
  basedOnVersionNumber: number | null;
  changeRequestId: string | null;
  decision: DecisionDto | null;
};

export type OrderDetailDto = OrderSummaryDto & {
  customer: { id: string; name: string; phone: string | null };
  cancelledAt: string | null;
  cancelReason: string | null;
  firstApprovedAt: string | null;
  allowedProductionTransitions: ProductionStatus[];
  canCancel: boolean;
  canArchive: boolean;
  activeVersion: VersionSummaryDto | null;
  pendingVersion: VersionSummaryDto | null;
  versions: VersionSummaryDto[];
  sourceCount: number;
  openIssueCount: number;
  hasUnpublishedChanges: boolean;
  draftRevision: number;
};
