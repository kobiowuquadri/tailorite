import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.js';
import { Errors } from '../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../auth/decorators.js';
import {
  PRICING_HYPOTHESIS,
  type AiStatusDto,
  type OnboardingInput,
  type StudioDto,
  type UpdateStudioInput,
  type UsageDto,
} from '../contracts/studio.js';
import { isValidTimeZone, toStudioDto } from './studio.mapper.js';
import { startOfDayUtc, todayInZone } from '../common/time/dates.js';

export const USAGE_ORDER_APPROVED = 'ORDER_FIRST_APPROVED';

@Injectable()
export class StudiosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  async createForUser(userId: string, userName: string, input: OnboardingInput): Promise<StudioDto> {
    if (!isValidTimeZone(input.timeZone)) {
      throw Errors.validation('Choose a valid time zone.', { timeZone: ['Unknown time zone'] });
    }
    const existing = await this.prisma.membership.findFirst({ where: { userId } });
    if (existing) throw Errors.conflict('Your studio is already set up.');

    const studio = await this.prisma.$transaction(async (tx) => {
      const created = await tx.studio.create({
        data: {
          name: input.studioName,
          ownerName: input.ownerName,
          phone: input.phone,
          email: input.email,
          city: input.city,
          measurementUnit: input.measurementUnit,
          timeZone: input.timeZone,
          currency: input.currency,
          memberships: { create: { userId, role: 'OWNER' } },
        },
      });
      await this.audit.record(tx, {
        studioId: created.id,
        actor: { type: 'USER', userId, label: userName },
        type: 'STUDIO_CREATED',
        summary: `Studio "${created.name}" created`,
      });
      return created;
    });
    return toStudioDto(studio);
  }

  async get(studioId: string): Promise<StudioDto> {
    const studio = await this.prisma.studio.findUnique({ where: { id: studioId } });
    if (!studio) throw Errors.notFound('Studio');
    return toStudioDto(studio);
  }

  async update(studioId: string, actor: Actor, input: UpdateStudioInput): Promise<StudioDto> {
    if (input.timeZone && !isValidTimeZone(input.timeZone)) {
      throw Errors.validation('Choose a valid time zone.', { timeZone: ['Unknown time zone'] });
    }
    const studio = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.studio.update({
        where: { id: studioId },
        data: {
          name: input.studioName,
          ownerName: input.ownerName,
          phone: input.phone,
          email: input.email,
          city: input.city,
          measurementUnit: input.measurementUnit,
          timeZone: input.timeZone,
        },
      });
      await this.audit.record(tx, {
        studioId,
        actor,
        type: 'STUDIO_UPDATED',
        summary: 'Studio settings updated',
        data: { fields: Object.keys(input) },
      });
      return updated;
    });
    return toStudioDto(studio);
  }

  async usage(studioId: string): Promise<UsageDto> {
    const studio = await this.prisma.studio.findUniqueOrThrow({ where: { id: studioId } });
    const startOfToday = startOfDayUtc(studio.timeZone, todayInZone(studio.timeZone));
    const [approvedOrders, ordersCreated, customers, aiJobsToday, aiJobsLast30Days, storage] = await Promise.all([
      this.prisma.usageEvent.count({ where: { studioId, type: USAGE_ORDER_APPROVED } }),
      this.prisma.order.count({ where: { studioId } }),
      this.prisma.customer.count({ where: { studioId } }),
      this.prisma.extractionJob.count({ where: { studioId, createdAt: { gte: startOfToday } } }),
      this.prisma.extractionJob.count({
        where: { studioId, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      }),
      this.prisma.sourceAsset.aggregate({ where: { studioId }, _sum: { byteSize: true } }),
    ]);
    const billable = Math.max(0, approvedOrders - PRICING_HYPOTHESIS.freeApprovedOrders);
    return {
      approvedOrders,
      freeApprovedOrdersRemaining: Math.max(0, PRICING_HYPOTHESIS.freeApprovedOrders - approvedOrders),
      hypotheticalChargeKobo: billable * PRICING_HYPOTHESIS.proposedPricePerApprovedOrderKobo,
      ordersCreated,
      customers,
      aiJobsToday,
      aiJobsLast30Days,
      storageBytes: storage._sum.byteSize ?? 0,
      pricing: PRICING_HYPOTHESIS,
    };
  }

  async aiStatus(studioId: string): Promise<AiStatusDto> {
    const studio = await this.prisma.studio.findUniqueOrThrow({ where: { id: studioId } });
    const availability = this.config.aiAvailability({ isDemoSandbox: studio.isDemo && !studio.demoSeedKey });
    const startOfToday = startOfDayUtc(studio.timeZone, todayInZone(studio.timeZone));
    const [usedToday, heartbeat] = await Promise.all([
      this.prisma.extractionJob.count({ where: { studioId, createdAt: { gte: startOfToday } } }),
      this.prisma.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: 'desc' } }),
    ]);
    const e = this.config.env;
    return {
      worker: {
        online: Boolean(heartbeat && Date.now() - heartbeat.lastSeenAt.getTime() < 60_000),
        lastSeenAt: heartbeat?.lastSeenAt.toISOString() ?? null,
      },
      ...availability,
      models:
        availability.mode === 'live' && availability.available
          ? { extraction: e.GEMINI_EXTRACTION_MODEL, transcription: e.GEMINI_TRANSCRIPTION_MODEL }
          : null,
      limits: {
        jobsPerDay: e.AI_MAX_JOBS_PER_STUDIO_PER_DAY,
        usedToday,
        maxSourcesPerJob: e.AI_MAX_SOURCES_PER_JOB,
      },
    };
  }
}
