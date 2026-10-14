import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../common/prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.js';
import { Errors } from '../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { UserActor } from '../auth/decorators.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AgreementStateService } from '../briefs/agreement-state.service.js';
import { formatIsoDate, formatKobo, type Evidence } from '../contracts/brief.js';
import type { PortalAccessPurpose, PublishInput, PublishResultDto, ShareLinkDto, SnapshotReference } from '../contracts/approvals.js';
import { buildShareLink, buildSnapshot } from './snapshot.js';
import { randomToken, sha256Hex } from '../common/security/tokens.js';
import { dateOnlyToDb, dbToDateOnly } from '../common/time/dates.js';
import { lockOrder } from '../orders/order-lock.js';
import { toVersionSummary, versionSummaryInclude } from '../orders/order-views.js';

const DAY = 86_400_000;

@Injectable()
export class PublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly agreementState: AgreementStateService,
    private readonly config: AppConfig,
  ) {}

  /** Creates a customer link. Only the SHA-256 of the 256-bit token is stored. */
  async createAccess(
    tx: Tx,
    input: {
      studioId: string;
      orderId: string;
      versionId: string;
      approvalRequestId: string | null;
      purpose: PortalAccessPurpose;
      ttlDays: number;
      createdById: string;
    },
  ) {
    const token = randomToken(32);
    const access = await tx.customerPortalAccess.create({
      data: {
        studioId: input.studioId,
        orderId: input.orderId,
        versionId: input.versionId,
        approvalRequestId: input.approvalRequestId,
        purpose: input.purpose,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + input.ttlDays * DAY),
        createdById: input.createdById,
      },
    });
    return { access, token };
  }

  shareLink(
    access: { id: string; purpose: PortalAccessPurpose; expiresAt: Date },
    token: string,
    ctx: { versionNumber: number; kind: 'INITIAL' | 'REVISION'; customerName: string; customerPhone: string | null; studioName: string; title: string },
  ): ShareLinkDto {
    return buildShareLink({
      appOrigin: this.config.env.APP_ORIGIN,
      accessId: access.id,
      token,
      purpose: access.purpose,
      expiresAt: access.expiresAt,
      ...ctx,
    });
  }

  /**
   * Publishes the working brief as an immutable version and opens an approval request for it.
   * Initial publications and change proposals share this path; a newer publication supersedes
   * (and revokes the links of) any request still awaiting a decision.
   */
  async publish(studioId: string, actor: UserActor, orderId: string, input: PublishInput): Promise<PublishResultDto> {
    const { versionId, link } = await this.prisma.$transaction(
      async (tx) => {
        await lockOrder(tx, studioId, orderId);
        const duplicate = await tx.briefVersion.findFirst({
          where: { orderId, publishIdempotencyKey: input.idempotencyKey },
        });
        if (duplicate) {
          throw Errors.conflict(
            `This was already shared as version ${duplicate.versionNumber}. Create a new link from the order page if you need it again.`,
            { versionId: duplicate.id, versionNumber: duplicate.versionNumber },
          );
        }

        const order = await tx.order.findFirst({
          where: { id: orderId, studioId },
          include: { studio: true, customer: true, draft: true, activeVersion: true },
        });
        if (!order || !order.draft) throw Errors.notFound('Order');
        if (order.productionStatus === 'CANCELLED') throw Errors.invalidState('This order is cancelled.');
        if (order.archivedAt) throw Errors.invalidState('This order is archived.');
        if (order.draft.revision !== input.expectedRevision) throw Errors.staleRevision(order.draft.revision);

        let kind: 'INITIAL' | 'REVISION' = 'INITIAL';
        let changeRequest: Prisma.ChangeRequestGetPayload<object> | null = null;
        if (order.activeVersion) {
          if (!order.draft.changeRequestId) {
            throw Errors.invalidState(
              `Version ${order.activeVersion.versionNumber} is approved. Start a change proposal to share a revision.`,
            );
          }
          changeRequest = await tx.changeRequest.findFirst({
            where: { id: order.draft.changeRequestId, orderId, openSlot: { not: null } },
          });
          if (!changeRequest) throw Errors.invalidState('This change request is no longer open.');
          if (changeRequest.baseVersionId !== order.activeVersionId) throw Errors.staleVersion();
          kind = 'REVISION';
        }

        const { readiness, content } = await this.agreementState.draftState(tx, studioId, orderId);
        if (!readiness.ready) throw Errors.publishBlocked({ blocking: readiness.blocking });

        const now = new Date();
        const max = await tx.briefVersion.aggregate({ where: { orderId }, _max: { versionNumber: true } });
        const versionNumber = (max._max.versionNumber ?? 0) + 1;

        const pending = await tx.approvalRequest.findFirst({
          where: { orderId, status: 'PENDING' },
          include: { version: { select: { versionNumber: true } } },
        });
        if (pending) {
          await tx.approvalRequest.update({
            where: { id: pending.id },
            data: { status: 'SUPERSEDED', pendingSlot: null, closedAt: now, closedReason: `Replaced by version ${versionNumber}` },
          });
          await tx.customerPortalAccess.updateMany({
            where: { approvalRequestId: pending.id, revokedAt: null },
            data: { revokedAt: now, revokedReason: `Superseded by version ${versionNumber}` },
          });
          await this.audit.record(tx, {
            studioId,
            orderId,
            actor,
            type: 'VERSION_SUPERSEDED',
            summary: `Version ${pending.version.versionNumber} replaced by version ${versionNumber} before the customer decided; its link stopped working`,
          });
        }

        const refRows = await tx.sourceAsset.findMany({
          where: { orderId, id: { in: content.references.map((r) => r.sourceId) } },
        });
        const references: SnapshotReference[] = content.references.map((r) => {
          const s = refRows.find((row) => row.id === r.sourceId)!;
          return { sourceId: s.id, label: s.label, note: r.note, mimeType: 'image/webp', width: s.width, height: s.height };
        });

        const terms = content.terms;
        const active = order.activeVersion;
        const change =
          kind === 'REVISION' && active
            ? {
                reason: changeRequest?.reason ?? null,
                baseVersionNumber: active.versionNumber,
                previousTotalKobo: Number(active.totalPriceKobo),
                previousDeliveryDate: dbToDateOnly(active.deliveryDate),
                priceAdjustmentKobo: terms.totalPriceKobo! - Number(active.totalPriceKobo),
              }
            : null;

        const { snapshot, hash } = buildSnapshot({
          order,
          studio: order.studio,
          customerName: order.customer.name,
          versionNumber,
          kind,
          basedOnVersionNumber: active?.versionNumber ?? null,
          brief: content,
          references,
          change,
          publishedAt: now,
        });

        const version = await tx.briefVersion.create({
          data: {
            studioId,
            orderId,
            versionNumber,
            kind,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            contentHash: hash,
            sourceDraftRevision: order.draft.revision,
            publishIdempotencyKey: input.idempotencyKey,
            basedOnVersionId: kind === 'REVISION' ? order.activeVersionId : null,
            changeRequestId: changeRequest?.id ?? null,
            totalPriceKobo: BigInt(terms.totalPriceKobo!),
            depositRequiredKobo: BigInt(terms.depositRequiredKobo!),
            deliveryDate: dateOnlyToDb(terms.deliveryDate!),
            fittingDate: terms.fittingDate ? dateOnlyToDb(terms.fittingDate) : null,
            publishedById: actor.userId,
            publishedAt: now,
          },
        });

        // Record every source this version depends on so it is retained.
        const evidence: Evidence[] = [
          ...Object.values(content.fields).flatMap((f) => f.evidence),
          ...content.exclusions.flatMap((e) => e.evidence),
        ];
        const dependencies = [
          ...references.map((r) => ({ sourceId: r.sourceId, role: 'REFERENCE' as const })),
          ...[...new Set(evidence.map((e) => e.sourceId))].map((sourceId) => ({ sourceId, role: 'EVIDENCE' as const })),
        ];
        if (dependencies.length) {
          await tx.briefVersionSource.createMany({
            data: dependencies.map((d) => ({ versionId: version.id, orderId, studioId, ...d })),
            skipDuplicates: true,
          });
        }

        const request = await tx.approvalRequest.create({
          data: {
            studioId,
            orderId,
            versionId: version.id,
            kind,
            baseVersionId: kind === 'REVISION' ? order.activeVersionId : null,
            changeRequestId: changeRequest?.id ?? null,
            status: 'PENDING',
            pendingSlot: orderId,
            createdById: actor.userId,
          },
        });

        const { access, token } = await this.createAccess(tx, {
          studioId,
          orderId,
          versionId: version.id,
          approvalRequestId: request.id,
          purpose: 'APPROVAL',
          ttlDays: input.linkTtlDays ?? this.config.env.APPROVAL_LINK_TTL_DAYS,
          createdById: actor.userId,
        });

        if (changeRequest && change) {
          await tx.changeRequest.update({
            where: { id: changeRequest.id },
            data: { status: 'AWAITING_APPROVAL', proposedVersionId: version.id, priceAdjustmentKobo: BigInt(change.priceAdjustmentKobo) },
          });
        }

        await this.audit.record(tx, {
          studioId,
          orderId,
          actor,
          type: 'VERSION_PUBLISHED',
          summary:
            kind === 'REVISION'
              ? `Change proposal shared as version ${versionNumber}: ${formatKobo(terms.totalPriceKobo)} (${change!.priceAdjustmentKobo >= 0 ? '+' : '−'}${formatKobo(Math.abs(change!.priceAdjustmentKobo))}), delivery ${formatIsoDate(terms.deliveryDate)}`
              : `Version ${versionNumber} shared for customer approval: ${formatKobo(terms.totalPriceKobo)}, delivery ${formatIsoDate(terms.deliveryDate)}`,
          data: { versionId: version.id, versionNumber, contentHash: hash, accessId: access.id },
        });
        await this.agreementState.refresh(tx, studioId, orderId);

        return {
          versionId: version.id,
          link: this.shareLink(access, token, {
            versionNumber,
            kind,
            customerName: order.customer.name,
            customerPhone: order.customer.phone,
            studioName: order.studio.name,
            title: order.title,
          }),
        };
      },
      { timeout: 30_000 },
    );
    const version = await this.prisma.briefVersion.findUniqueOrThrow({ where: { id: versionId }, include: versionSummaryInclude });
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { activeVersionId: true } });
    return { version: toVersionSummary(version, order.activeVersionId), link };
  }
}
