import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors/app-error.js';
import { BriefContent, presentBrief } from '../contracts/brief.js';
import type { VersionComparisonDto, VersionDetailDto, VersionSnapshot } from '../contracts/approvals.js';
import type { VersionSummaryDto } from '../contracts/orders.js';
import { toVersionSummary, versionSummaryInclude } from '../orders/order-views.js';
import { buildComparison } from './snapshot.js';

@Injectable()
export class VersionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(studioId: string, orderId: string): Promise<VersionSummaryDto[]> {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, studioId }, select: { activeVersionId: true } });
    if (!order) throw Errors.notFound('Order');
    const rows = await this.prisma.briefVersion.findMany({
      where: { orderId, studioId },
      include: versionSummaryInclude,
      orderBy: { versionNumber: 'desc' },
    });
    return rows.map((v) => toVersionSummary(v, order.activeVersionId));
  }

  async detail(studioId: string, orderId: string, versionId: string): Promise<VersionDetailDto> {
    const version = await this.prisma.briefVersion.findFirst({
      where: { id: versionId, orderId, studioId },
      include: { ...versionSummaryInclude, order: { select: { activeVersionId: true } }, basedOn: true },
    });
    if (!version) throw Errors.notFound('Version');
    const snapshot = version.snapshot as unknown as VersionSnapshot;
    const brief = BriefContent.parse(snapshot.brief);
    let comparisonToBase: VersionComparisonDto | null = null;
    if (version.basedOn) {
      const base = version.basedOn.snapshot as unknown as VersionSnapshot;
      comparisonToBase = buildComparison(
        { versionNumber: version.basedOn.versionNumber, brief: BriefContent.parse(base.brief) },
        { label: `Version ${version.versionNumber}`, brief },
        snapshot.change?.reason ?? null,
      );
    }
    return {
      ...toVersionSummary(version, version.order.activeVersionId),
      basedOnVersionNumber: version.basedOn?.versionNumber ?? null,
      order: { id: orderId, reference: snapshot.order.reference, title: snapshot.order.title },
      studio: snapshot.studio,
      customerName: snapshot.customer.name,
      sections: presentBrief(brief),
      brief,
      references: snapshot.references.map((r) => ({
        ...r,
        previewUrl: `/api/orders/${orderId}/sources/${r.sourceId}/preview`,
      })),
      change: snapshot.change,
      comparisonToBase,
    };
  }

  /** Active approved version vs the current working draft (the proposal being prepared). */
  async compareDraft(studioId: string, orderId: string): Promise<VersionComparisonDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, studioId },
      include: { activeVersion: true, draft: true, changeRequests: { where: { openSlot: { not: null } }, take: 1 } },
    });
    if (!order || !order.draft) throw Errors.notFound('Order');
    if (!order.activeVersion) throw Errors.invalidState('There is no approved version to compare with yet.');
    const active = order.activeVersion.snapshot as unknown as VersionSnapshot;
    return buildComparison(
      { versionNumber: order.activeVersion.versionNumber, brief: BriefContent.parse(active.brief) },
      { label: 'Proposed change', brief: BriefContent.parse(order.draft.content) },
      order.changeRequests[0]?.reason ?? null,
    );
  }
}
