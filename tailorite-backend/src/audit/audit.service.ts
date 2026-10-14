import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../common/prisma/prisma.service.js';
import type { Actor } from '../auth/decorators.js';
import type { TimelineEventDto } from '../contracts/timeline.js';

export type AuditType =
  | 'STUDIO_CREATED'
  | 'STUDIO_UPDATED'
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_UPDATED'
  | 'MEASUREMENTS_UPDATED'
  | 'ORDER_CREATED'
  | 'ORDER_UPDATED'
  | 'SOURCE_ADDED'
  | 'SOURCE_UPDATED'
  | 'SOURCE_REMOVED'
  | 'TRANSCRIPT_CORRECTED'
  | 'EXTRACTION_STARTED'
  | 'EXTRACTION_SUCCEEDED'
  | 'EXTRACTION_FAILED'
  | 'SUGGESTION_ACCEPTED'
  | 'SUGGESTION_REJECTED'
  | 'ISSUE_CREATED'
  | 'ISSUE_RESOLVED'
  | 'ISSUE_DISMISSED'
  | 'MEASUREMENTS_COPIED'
  | 'DRAFT_RESET'
  | 'VERSION_PUBLISHED'
  | 'VERSION_SUPERSEDED'
  | 'VERSION_WITHDRAWN'
  | 'LINK_CREATED'
  | 'LINK_REVOKED'
  | 'PORTAL_OPENED'
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'REVISION_DECLINED'
  | 'CHANGE_REQUESTED_BY_CUSTOMER'
  | 'CHANGE_STARTED'
  | 'CHANGE_DECLINED'
  | 'CHANGE_WITHDRAWN'
  | 'PAYMENT_RECORDED'
  | 'PAYMENT_REVERSED'
  | 'PRODUCTION_UPDATED'
  | 'ORDER_CANCELLED'
  | 'ORDER_ARCHIVED'
  | 'ORDER_UNARCHIVED';

export type AuditInput = {
  studioId: string;
  orderId?: string | null;
  actor: Actor;
  type: AuditType;
  summary: string;
  /** Identifiers and small facts only — never customer conversation content. */
  data?: Record<string, unknown>;
};

/** Append-only application history (UPDATE/DELETE are blocked by a database trigger). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(db: Tx | PrismaService, event: AuditInput): Promise<void> {
    await db.auditEvent.create({
      data: {
        studioId: event.studioId,
        orderId: event.orderId ?? null,
        actorType: event.actor.type,
        actorUserId: event.actor.type === 'USER' ? event.actor.userId : null,
        actorLabel: event.actor.label ?? null,
        type: event.type,
        summary: event.summary,
        data: event.data ? JSON.parse(JSON.stringify(event.data, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))) : undefined,
      },
    });
  }

  async orderTimeline(studioId: string, orderId: string, limit = 200): Promise<TimelineEventDto[]> {
    const events = await this.prisma.auditEvent.findMany({
      where: { studioId, orderId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return events.map((e) => ({
      id: e.id,
      type: e.type,
      summary: e.summary,
      actorType: e.actorType,
      actorLabel: e.actorLabel,
      createdAt: e.createdAt.toISOString(),
    }));
  }
}
