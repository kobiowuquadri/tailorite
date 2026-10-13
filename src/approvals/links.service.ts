import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.js';
import { Errors } from '../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { UserActor } from '../auth/decorators.js';
import type { CreateLinkInput, PortalAccessDto, ShareLinkDto } from '../contracts/approvals.js';
import type { IssueChangeLinkInput } from '../contracts/changes.js';
import { PublicationService } from './publication.service.js';
import { lockOrder } from '../orders/order-lock.js';

@Injectable()
export class LinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly publication: PublicationService,
    private readonly config: AppConfig,
  ) {}

  async list(studioId: string, orderId: string): Promise<PortalAccessDto[]> {
    const order = await this.prisma.order.count({ where: { id: orderId, studioId } });
    if (!order) throw Errors.notFound('Order');
    const rows = await this.prisma.customerPortalAccess.findMany({
      where: { orderId, studioId },
      include: { version: { select: { versionNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const now = Date.now();
    return rows.map((a) => ({
      id: a.id,
      purpose: a.purpose,
      versionNumber: a.version.versionNumber,
      createdAt: a.createdAt.toISOString(),
      expiresAt: a.expiresAt.toISOString(),
      revokedAt: a.revokedAt?.toISOString() ?? null,
      lastUsedAt: a.lastUsedAt?.toISOString() ?? null,
      status: a.revokedAt ? 'REVOKED' : a.expiresAt.getTime() <= now ? 'EXPIRED' : 'ACTIVE',
    }));
  }

  /** New approval link for the version awaiting approval; earlier links for it stop working. */
  async regenerateApprovalLink(studioId: string, actor: UserActor, orderId: string, input: CreateLinkInput): Promise<ShareLinkDto> {
    return this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const pending = await tx.approvalRequest.findFirst({
        where: { orderId, studioId, status: 'PENDING' },
        include: { version: true, order: { include: { customer: true, studio: true } } },
      });
      if (!pending) throw Errors.invalidState('No version is waiting for customer approval.');
      const now = new Date();
      await tx.customerPortalAccess.updateMany({
        where: { approvalRequestId: pending.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'Replaced by a new link' },
      });
      const { access, token } = await this.publication.createAccess(tx, {
        studioId,
        orderId,
        versionId: pending.versionId,
        approvalRequestId: pending.id,
        purpose: 'APPROVAL',
        ttlDays: input.ttlDays ?? this.config.env.APPROVAL_LINK_TTL_DAYS,
        createdById: actor.userId,
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'LINK_CREATED',
        summary: `New approval link created for version ${pending.version.versionNumber}; earlier links for it stopped working`,
        data: { accessId: access.id },
      });
      return this.publication.shareLink(access, token, {
        versionNumber: pending.version.versionNumber,
        kind: pending.kind,
        customerName: pending.order.customer.name,
        customerPhone: pending.order.customer.phone,
        studioName: pending.order.studio.name,
        title: pending.order.title,
      });
    });
  }

  /**
   * Fresh, expiring access to the approved version so the customer can ask for a change later.
   * It can never decide an approval request.
   */
  async issueChangeLink(studioId: string, actor: UserActor, orderId: string, input: IssueChangeLinkInput): Promise<ShareLinkDto> {
    return this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const order = await tx.order.findFirstOrThrow({
        where: { id: orderId, studioId },
        include: { activeVersion: true, customer: true, studio: true },
      });
      if (!order.activeVersion) throw Errors.invalidState('There is no approved version to share yet.');
      if (order.productionStatus === 'CANCELLED' || order.productionStatus === 'COMPLETED' || order.archivedAt) {
        throw Errors.invalidState('Change requests are closed for this order.');
      }
      const { access, token } = await this.publication.createAccess(tx, {
        studioId,
        orderId,
        versionId: order.activeVersion.id,
        approvalRequestId: null,
        purpose: 'CHANGE_REQUEST',
        ttlDays: input.ttlDays ?? this.config.env.CHANGE_LINK_TTL_DAYS,
        createdById: actor.userId,
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'LINK_CREATED',
        summary: `Change-request link created for approved version ${order.activeVersion.versionNumber}`,
        data: { accessId: access.id },
      });
      return this.publication.shareLink(access, token, {
        versionNumber: order.activeVersion.versionNumber,
        kind: order.activeVersion.kind,
        customerName: order.customer.name,
        customerPhone: order.customer.phone,
        studioName: order.studio.name,
        title: order.title,
      });
    });
  }

  async revoke(studioId: string, actor: UserActor, orderId: string, accessId: string): Promise<PortalAccessDto[]> {
    await this.prisma.$transaction(async (tx) => {
      const access = await tx.customerPortalAccess.findFirst({ where: { id: accessId, orderId, studioId } });
      if (!access) throw Errors.notFound('Link');
      if (access.revokedAt) return;
      await tx.customerPortalAccess.update({
        where: { id: accessId },
        data: { revokedAt: new Date(), revokedReason: 'Revoked by the studio' },
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'LINK_REVOKED',
        summary: `${access.purpose === 'APPROVAL' ? 'Approval' : 'Change-request'} link revoked`,
        data: { accessId },
      });
    });
    return this.list(studioId, orderId);
  }
}
