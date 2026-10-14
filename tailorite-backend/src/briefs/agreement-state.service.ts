import { Injectable } from '@nestjs/common';
import type { Tx } from '../common/prisma/prisma.service.js';
import { BriefContent, type Readiness } from '../contracts/brief.js';
import type { AgreementStatus } from '../contracts/orders.js';
import type { VersionSnapshot } from '../contracts/approvals.js';
import { computeReadiness } from './readiness.js';
import { todayInZone } from '../common/time/dates.js';
import { Errors } from '../common/errors/app-error.js';

export type DraftState = {
  readiness: Readiness;
  content: BriefContent;
  activeContent: BriefContent | null;
};

/**
 * Agreement state is derived, never set ad hoc:
 *   pending approval request        → AWAITING_APPROVAL / REVISION_AWAITING_APPROVAL
 *   approved, change being drafted  → REVISION_DRAFT
 *   approved                        → APPROVED
 *   otherwise from the draft:         NEEDS_CLARIFICATION (open issues) / READY_FOR_REVIEW / DRAFT
 */
@Injectable()
export class AgreementStateService {
  async draftState(db: Tx, studioId: string, orderId: string): Promise<DraftState> {
    const order = await db.order.findFirst({
      where: { id: orderId, studioId },
      include: {
        studio: { select: { timeZone: true } },
        draft: true,
        activeVersion: { select: { snapshot: true } },
        issues: { where: { status: 'OPEN' }, select: { id: true, kind: true, question: true, fieldKey: true } },
        sources: { select: { id: true, kind: true, removedAt: true, label: true } },
      },
    });
    if (!order || !order.draft) throw Errors.notFound('Order');
    const content = BriefContent.parse(order.draft.content);
    const activeContent =
      order.activeVersion && order.draft.changeRequestId
        ? BriefContent.parse((order.activeVersion.snapshot as unknown as VersionSnapshot).brief)
        : null;
    const readiness = computeReadiness({
      content,
      openIssues: order.issues,
      sources: new Map(order.sources.map((s) => [s.id, { kind: s.kind, removed: Boolean(s.removedAt), label: s.label }])),
      today: todayInZone(order.studio.timeZone),
      activeContent,
    });
    return { readiness, content, activeContent };
  }

  async refresh(db: Tx, studioId: string, orderId: string): Promise<AgreementStatus> {
    const order = await db.order.findFirst({
      where: { id: orderId, studioId },
      select: {
        activeVersionId: true,
        agreementStatus: true,
        draft: { select: { changeRequestId: true } },
        approvalRequests: { where: { status: 'PENDING' }, select: { kind: true }, take: 1 },
      },
    });
    if (!order) throw Errors.notFound('Order');

    let status: AgreementStatus;
    const pending = order.approvalRequests[0];
    if (pending) {
      status = pending.kind === 'REVISION' ? 'REVISION_AWAITING_APPROVAL' : 'AWAITING_APPROVAL';
    } else if (order.activeVersionId) {
      status = order.draft?.changeRequestId ? 'REVISION_DRAFT' : 'APPROVED';
    } else {
      const { readiness } = await this.draftState(db, studioId, orderId);
      const hasOpenIssues = readiness.blocking.some((b) => b.code === 'OPEN_ISSUE');
      status = hasOpenIssues ? 'NEEDS_CLARIFICATION' : readiness.ready ? 'READY_FOR_REVIEW' : 'DRAFT';
    }
    if (status !== order.agreementStatus) {
      await db.order.update({ where: { id: orderId }, data: { agreementStatus: status } });
    }
    return status;
  }
}
