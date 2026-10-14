import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.js';
import { AppError, Errors } from '../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { RATE_LIMITS, RateLimitService } from '../common/security/rate-limit.service.js';
import { safeEqual, sha256Hex } from '../common/security/tokens.js';
import { Prisma } from '../generated/prisma/client.js';
import { AgreementStateService } from '../briefs/agreement-state.service.js';
import { BriefContent, presentBrief } from '../contracts/brief.js';
import {
  PORTAL_CONFIRMATION_TEXT,
  type PortalChangeRequestInput,
  type PortalDecisionInput,
  type PortalReviewDto,
  type PortalState,
  type VersionSnapshot,
} from '../contracts/approvals.js';
import { lockOrderById } from '../orders/order-lock.js';
import { buildComparison } from '../approvals/snapshot.js';
import { USAGE_ORDER_APPROVED } from '../studios/studios.service.js';
import { dbToDateOnly } from '../common/time/dates.js';
import { SourcesService } from '../sources/sources.service.js';
import { signPortalSession } from './portal-session.js';

type CustomerMessage = { name: string; message: string; at: string };

const linkInvalid = () =>
  new AppError('LINK_INVALID', 'This link is not valid. Check that you opened the complete link your tailor sent.', 404);
const linkRevoked = () =>
  new AppError('LINK_REVOKED', 'This link was replaced or turned off by the studio. Ask them for the latest link.', 410);
const linkExpired = () =>
  new AppError('LINK_EXPIRED', 'This link has expired. Ask the studio to send you a new one.', 410);

function assertUsable(access: { revokedAt: Date | null; expiresAt: Date }) {
  if (access.revokedAt) throw linkRevoked();
  if (access.expiresAt.getTime() <= Date.now()) throw linkExpired();
}

const DECISION_FOR: Record<PortalDecisionInput['decision'], 'APPROVED' | 'CHANGES_REQUESTED' | 'DECLINED'> = {
  APPROVE: 'APPROVED',
  REQUEST_CHANGES: 'CHANGES_REQUESTED',
  DECLINE: 'DECLINED',
};

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly rateLimits: RateLimitService,
    private readonly agreementState: AgreementStateService,
    private readonly sources: SourcesService,
  ) {}

  /** Exchanges a link token for a short-lived, path-scoped portal session. */
  async exchange(accessId: string, token: string, ip: string): Promise<{ cookieValue: string; expiresAt: Date }> {
    await this.rateLimits.consume('portal:exchange', ip, RATE_LIMITS.portalExchangePerIp);
    const access = await this.prisma.customerPortalAccess.findUnique({ where: { id: accessId } });
    if (!access || !safeEqual(access.tokenHash, sha256Hex(token))) throw linkInvalid();
    assertUsable(access);
    const sessionTtl = this.config.env.PORTAL_SESSION_TTL_MINUTES * 60_000;
    const expiresAt = new Date(Math.min(Date.now() + sessionTtl, access.expiresAt.getTime()));
    const firstUse = !access.lastUsedAt;
    await this.prisma.$transaction(async (tx) => {
      await tx.customerPortalAccess.update({ where: { id: accessId }, data: { lastUsedAt: new Date() } });
      if (firstUse) {
        await this.audit.record(tx, {
          studioId: access.studioId,
          orderId: access.orderId,
          actor: { type: 'CUSTOMER', label: 'Customer' },
          type: 'PORTAL_OPENED',
          summary: `Customer opened the ${access.purpose === 'APPROVAL' ? 'approval' : 'change-request'} link`,
          data: { accessId },
        });
      }
    });
    return { cookieValue: signPortalSession(this.config.env.SESSION_SECRET, accessId, expiresAt), expiresAt };
  }

  private async loadAccess(accessId: string) {
    const access = await this.prisma.customerPortalAccess.findUnique({
      where: { id: accessId },
      include: {
        version: true,
        approvalRequest: { include: { event: true } },
        order: {
          include: {
            studio: true,
            activeVersion: { select: { id: true, versionNumber: true } },
            changeRequests: { where: { openSlot: { not: null } }, take: 1 },
          },
        },
      },
    });
    if (!access) throw linkInvalid();
    assertUsable(access);
    return access;
  }

  async review(accessId: string): Promise<PortalReviewDto> {
    const access = await this.loadAccess(accessId);
    const { order, version, approvalRequest } = access;
    const snapshot = version.snapshot as unknown as VersionSnapshot;
    const brief = BriefContent.parse(snapshot.brief);
    const isActive = order.activeVersionId === version.id;
    const cancelled = order.productionStatus === 'CANCELLED';
    const openChange = order.changeRequests[0] ?? null;

    let state: PortalState;
    let stateMessage: string;
    if (cancelled) {
      state = 'ORDER_CANCELLED';
      stateMessage = 'The studio has cancelled this order. Contact them if you have questions.';
    } else if (access.purpose === 'APPROVAL' && approvalRequest) {
      switch (approvalRequest.status) {
        case 'PENDING':
          state = 'PENDING';
          stateMessage =
            version.kind === 'REVISION'
              ? 'Please review the proposed change. Your current agreement stays in force until you approve it.'
              : 'Please review the details below. Nothing is agreed until you approve this version.';
          break;
        case 'APPROVED':
          state = 'APPROVED';
          stateMessage = isActive
            ? `You approved version ${version.versionNumber}. This is the agreement the studio is working from.`
            : `You approved version ${version.versionNumber}. A newer version (version ${order.activeVersion?.versionNumber}) is now the agreement.`;
          break;
        case 'CHANGES_REQUESTED':
          state = 'CHANGES_REQUESTED';
          stateMessage = 'You asked for changes to this version. The studio will send an updated version for you to review.';
          break;
        case 'DECLINED':
          state = 'DECLINED';
          stateMessage = 'You declined this proposed change. Your previous agreement remains in force.';
          break;
        case 'SUPERSEDED':
          state = 'SUPERSEDED';
          stateMessage = 'The studio replaced this version with a newer one. Ask them for the latest link.';
          break;
        default:
          state = 'WITHDRAWN';
          stateMessage = 'The studio withdrew this version. Contact them for the latest details.';
      }
    } else {
      state = 'VIEW';
      stateMessage = isActive
        ? `This is your approved agreement (version ${version.versionNumber}). You can ask the studio for a change below.`
        : `A newer agreement (version ${order.activeVersion?.versionNumber}) has replaced this version.`;
    }

    const requestPending = access.purpose === 'APPROVAL' && approvalRequest?.status === 'PENDING';
    const canDecide = !cancelled && requestPending;
    const changeWindowOpen =
      !cancelled && isActive && order.productionStatus !== 'COMPLETED' && !order.archivedAt && openChange?.status !== 'AWAITING_APPROVAL';
    const canRequestChange =
      changeWindowOpen &&
      (access.purpose === 'CHANGE_REQUEST' || (access.purpose === 'APPROVAL' && approvalRequest?.status === 'APPROVED'));

    let change: PortalReviewDto['change'] = null;
    if (version.kind === 'REVISION' && version.basedOnVersionId) {
      const base = await this.prisma.briefVersion.findUnique({ where: { id: version.basedOnVersionId } });
      if (base) {
        const baseSnapshot = base.snapshot as unknown as VersionSnapshot;
        change = {
          ...buildComparison(
            { versionNumber: base.versionNumber, brief: BriefContent.parse(baseSnapshot.brief) },
            { label: `Version ${version.versionNumber}`, brief },
            snapshot.change?.reason ?? null,
          ),
          previousVersionNumber: base.versionNumber,
        };
      }
    }

    const event = approvalRequest?.event ?? null;
    const showContent = !(state === 'SUPERSEDED' || state === 'WITHDRAWN');
    return {
      access: { id: access.id, purpose: access.purpose, expiresAt: access.expiresAt.toISOString() },
      studio: { name: snapshot.studio.name, phone: snapshot.studio.phone, city: snapshot.studio.city },
      customerName: snapshot.customer.name,
      order: { reference: snapshot.order.reference, title: snapshot.order.title },
      version: {
        number: version.versionNumber,
        kind: version.kind,
        publishedAt: version.publishedAt.toISOString(),
        contentHash: version.contentHash,
        isActive,
      },
      activeVersionNumber: order.activeVersion?.versionNumber ?? null,
      state,
      stateMessage,
      sections: showContent ? presentBrief(brief) : [],
      references: showContent
        ? snapshot.references.map((r) => ({
            id: r.sourceId,
            label: r.label,
            note: r.note,
            url: `/api/portal/${access.id}/media/${r.sourceId}`,
            width: r.width,
            height: r.height,
          }))
        : [],
      terms: {
        totalPriceKobo: Number(version.totalPriceKobo),
        depositRequiredKobo: Number(version.depositRequiredKobo),
        deliveryDate: dbToDateOnly(version.deliveryDate),
        fittingDate: dbToDateOnly(version.fittingDate),
        paymentNote: brief.terms.paymentNote,
      },
      change: showContent ? change : null,
      decision: event
        ? {
            decision: event.decision,
            customerName: event.customerName,
            comment: event.comment,
            contentHash: event.contentHash,
            at: event.createdAt.toISOString(),
          }
        : null,
      permissions: { canDecide, canDecline: canDecide && version.kind === 'REVISION', canRequestChange },
      openChangeRequest:
        openChange && isActive
          ? {
              createdAt: openChange.createdAt.toISOString(),
              messages: (openChange.customerMessages as CustomerMessage[]) ?? [],
            }
          : null,
      confirmationText: PORTAL_CONFIRMATION_TEXT,
      timeZone: snapshot.studio.timeZone,
    };
  }

  /** Reference images that were explicitly selected for this version — nothing else. */
  async media(accessId: string, sourceId: string) {
    const access = await this.loadAccess(accessId);
    const snapshot = access.version.snapshot as unknown as VersionSnapshot;
    if (!snapshot.references.some((r) => r.sourceId === sourceId)) throw Errors.notFound('Image');
    const source = await this.prisma.sourceAsset.findFirst({ where: { id: sourceId, orderId: access.orderId } });
    if (!source || source.kind !== 'IMAGE') throw Errors.notFound('Image');
    return this.sources.openSourceFile(source, 'preview', undefined);
  }

  /**
   * Records the customer's decision on exactly one immutable version. Serialized per order
   * (row lock), guarded by a status-conditioned update and a unique decision record, and
   * revalidated on every call — so duplicate clicks and simultaneous approve/reject cannot both win.
   */
  async decide(accessId: string, input: PortalDecisionInput, meta: { userAgent?: string }): Promise<PortalReviewDto> {
    await this.rateLimits.consume('portal:decision', accessId, RATE_LIMITS.portalDecisionPerAccess);
    const head = await this.prisma.customerPortalAccess.findUnique({ where: { id: accessId }, select: { orderId: true } });
    if (!head) throw linkInvalid();

    await this.prisma.$transaction(
      async (tx) => {
        await lockOrderById(tx, head.orderId);
        const access = await tx.customerPortalAccess.findUniqueOrThrow({
          where: { id: accessId },
          include: { approvalRequest: { include: { version: true, event: true } }, order: true },
        });
        assertUsable(access);
        if (access.purpose !== 'APPROVAL' || !access.approvalRequest) {
          throw Errors.forbidden('This link lets you view your agreement and ask for changes; it cannot approve a version.');
        }
        const request = access.approvalRequest;
        const decision = DECISION_FOR[input.decision];
        if (request.status !== 'PENDING') {
          // A repeated submission of the same decision is a no-op; anything else is already settled.
          if (request.event?.decision === decision) return;
          throw Errors.alreadyDecided({ status: request.status });
        }
        const order = access.order;
        if (order.productionStatus === 'CANCELLED') throw Errors.invalidState('The studio has cancelled this order.');
        if (request.version.contentHash !== input.contentHash) {
          throw Errors.conflict('The version you reviewed is not the one awaiting a decision. Reload the page and review it again.');
        }
        if (input.decision === 'DECLINE' && request.kind !== 'REVISION') {
          throw Errors.validation('Only a proposed change can be declined. Use "Request changes" to ask for edits.');
        }
        if (request.kind === 'REVISION' && order.activeVersionId !== request.baseVersionId) {
          throw Errors.staleVersion('This proposal was based on an agreement that is no longer active. Ask the studio for the latest version.');
        }

        const now = new Date();
        try {
          await tx.approvalEvent.create({
            data: {
              studioId: order.studioId,
              orderId: order.id,
              approvalRequestId: request.id,
              versionId: request.versionId,
              contentHash: request.version.contentHash,
              decision,
              customerName: input.name,
              comment: input.decision === 'APPROVE' ? null : (input.comment ?? null),
              confirmationText: input.decision === 'APPROVE' ? PORTAL_CONFIRMATION_TEXT : null,
              accessId,
              userAgent: meta.userAgent?.slice(0, 200),
            },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw Errors.alreadyDecided();
          throw error;
        }
        const closed = await tx.approvalRequest.updateMany({
          where: { id: request.id, status: 'PENDING' },
          data: { status: decision, pendingSlot: null, closedAt: now },
        });
        if (closed.count !== 1) throw Errors.alreadyDecided();

        const customer = { type: 'CUSTOMER' as const, label: input.name };
        const v = request.version.versionNumber;

        if (decision === 'APPROVED') {
          const previous = order.activeVersionId
            ? await tx.briefVersion.findUnique({ where: { id: order.activeVersionId }, select: { versionNumber: true } })
            : null;
          await tx.order.update({
            where: { id: order.id },
            data: {
              activeVersionId: request.versionId,
              dueDate: request.version.deliveryDate,
              firstApprovedAt: order.firstApprovedAt ?? now,
            },
          });
          // Usage counts a newly approved order once; revision approvals never add usage.
          await tx.usageEvent.createMany({
            data: [{ studioId: order.studioId, orderId: order.id, type: USAGE_ORDER_APPROVED }],
            skipDuplicates: true,
          });
          if (request.changeRequestId) {
            await tx.changeRequest.update({
              where: { id: request.changeRequestId },
              data: { status: 'APPROVED', openSlot: null, closedAt: now },
            });
          }
          await tx.briefDraft.update({
            where: { orderId: order.id },
            data: { baseVersionId: request.versionId, changeRequestId: null },
          });
          await this.audit.record(tx, {
            studioId: order.studioId,
            orderId: order.id,
            actor: customer,
            type: 'APPROVED',
            summary: previous
              ? `${input.name} approved version ${v}; it replaces version ${previous.versionNumber} as the active agreement`
              : `${input.name} approved version ${v}`,
            data: { versionId: request.versionId, contentHash: request.version.contentHash },
          });
        } else if (decision === 'CHANGES_REQUESTED') {
          const comment = input.decision === 'REQUEST_CHANGES' ? input.comment : '';
          await tx.clarificationIssue.create({
            data: {
              studioId: order.studioId,
              orderId: order.id,
              kind: 'CUSTOMER_FEEDBACK',
              origin: 'CUSTOMER',
              question: `${input.name} asked for changes to version ${v}: ${comment}`,
            },
          });
          if (request.changeRequestId) {
            const cr = await tx.changeRequest.findUniqueOrThrow({ where: { id: request.changeRequestId } });
            const messages = [...((cr.customerMessages as CustomerMessage[]) ?? []), { name: input.name, message: comment, at: now.toISOString() }];
            await tx.changeRequest.update({ where: { id: cr.id }, data: { status: 'DRAFTING', customerMessages: messages } });
          }
          await this.audit.record(tx, {
            studioId: order.studioId,
            orderId: order.id,
            actor: customer,
            type: 'CHANGES_REQUESTED',
            summary: `${input.name} requested changes to version ${v}`,
            data: { versionId: request.versionId },
          });
        } else {
          const cr = request.changeRequestId
            ? await tx.changeRequest.findUniqueOrThrow({ where: { id: request.changeRequestId } })
            : null;
          if (cr) {
            const comment = input.decision === 'DECLINE' ? input.comment : undefined;
            const messages = comment
              ? [...((cr.customerMessages as CustomerMessage[]) ?? []), { name: input.name, message: comment, at: now.toISOString() }]
              : cr.customerMessages;
            await tx.changeRequest.update({
              where: { id: cr.id },
              data: { status: 'DECLINED_BY_CUSTOMER', openSlot: null, closedAt: now, customerMessages: messages as Prisma.InputJsonValue },
            });
          }
          // The working brief returns to the agreement that remains in force.
          const active = await tx.briefVersion.findUniqueOrThrow({ where: { id: order.activeVersionId! } });
          await tx.briefDraft.update({
            where: { orderId: order.id },
            data: {
              content: (active.snapshot as unknown as VersionSnapshot).brief as unknown as Prisma.InputJsonValue,
              changeRequestId: null,
              revision: { increment: 1 },
            },
          });
          await this.audit.record(tx, {
            studioId: order.studioId,
            orderId: order.id,
            actor: customer,
            type: 'REVISION_DECLINED',
            summary: `${input.name} declined the proposed change (version ${v}); version ${active.versionNumber} remains the agreement`,
            data: { versionId: request.versionId },
          });
        }
        await this.agreementState.refresh(tx, order.studioId, order.id);
      },
      { timeout: 30_000 },
    );
    return this.review(accessId);
  }

  /** A customer suggests a change to the active approved version; only the studio can propose terms. */
  async requestChange(accessId: string, input: PortalChangeRequestInput): Promise<PortalReviewDto> {
    await this.rateLimits.consume('portal:change', accessId, RATE_LIMITS.portalChangePerAccess);
    const head = await this.prisma.customerPortalAccess.findUnique({ where: { id: accessId }, select: { orderId: true } });
    if (!head) throw linkInvalid();
    await this.prisma.$transaction(async (tx) => {
      await lockOrderById(tx, head.orderId);
      const access = await tx.customerPortalAccess.findUniqueOrThrow({
        where: { id: accessId },
        include: { approvalRequest: true, order: { include: { changeRequests: { where: { openSlot: { not: null } }, take: 1 } } } },
      });
      assertUsable(access);
      const order = access.order;
      const allowedByPurpose =
        access.purpose === 'CHANGE_REQUEST' || (access.purpose === 'APPROVAL' && access.approvalRequest?.status === 'APPROVED');
      if (!allowedByPurpose || order.activeVersionId !== access.versionId) {
        throw Errors.forbidden('Changes can only be requested on the approved agreement.');
      }
      if (order.productionStatus === 'CANCELLED' || order.productionStatus === 'COMPLETED' || order.archivedAt) {
        throw Errors.invalidState('Change requests are closed for this order. Contact the studio directly.');
      }
      const now = new Date();
      const message = { name: input.name, message: input.message, at: now.toISOString() };
      const open = order.changeRequests[0];
      if (open?.status === 'AWAITING_APPROVAL') {
        throw Errors.invalidState('A proposed change is already waiting for your decision. Use the latest link from the studio.');
      }
      if (open) {
        await tx.changeRequest.update({
          where: { id: open.id },
          data: { customerMessages: [...((open.customerMessages as CustomerMessage[]) ?? []), message] },
        });
      } else {
        await tx.changeRequest.create({
          data: {
            studioId: order.studioId,
            orderId: order.id,
            baseVersionId: order.activeVersionId!,
            initiator: 'CUSTOMER',
            status: 'REQUESTED',
            openSlot: order.id,
            customerMessages: [message],
          },
        });
      }
      await this.audit.record(tx, {
        studioId: order.studioId,
        orderId: order.id,
        actor: { type: 'CUSTOMER', label: input.name },
        type: 'CHANGE_REQUESTED_BY_CUSTOMER',
        summary: open ? `${input.name} added details to the open change request` : `${input.name} asked for a change`,
      });
    });
    return this.review(accessId);
  }
}
