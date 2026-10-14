import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.js';
import { Errors } from '../common/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { RATE_LIMITS, RateLimitService } from '../common/security/rate-limit.service.js';
import type { UserActor } from '../auth/decorators.js';
import { AiProviderFactory } from '../ai/ai-provider.factory.js';
import { QueueService } from './queue.service.js';
import { currentInputSet, jobInclude, toJobDto } from './extraction-common.js';
import { lockOrder } from '../orders/order-lock.js';
import { startOfDayUtc, todayInZone } from '../common/time/dates.js';
import { MB } from '../config/env.js';
import type { ExtractionJobDto, ExtractionOverviewDto, StartExtractionInput } from '../contracts/extraction.js';

@Injectable()
export class ExtractionJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly rateLimits: RateLimitService,
    private readonly queue: QueueService,
    private readonly providers: AiProviderFactory,
  ) {}

  private async context(studioId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, studioId },
      include: { studio: true, draft: { select: { revision: true, changeRequestId: true } } },
    });
    if (!order || !order.draft) throw Errors.notFound('Order');
    return order;
  }

  /** Why a new job cannot start right now (null when it can). */
  private async blocker(order: Awaited<ReturnType<ExtractionJobsService['context']>>, sourceCount: number, bytes: number) {
    const e = this.config.env;
    if (!this.providers.modeFor(order.studio)) return this.config.aiAvailability().message;
    if (order.productionStatus === 'CANCELLED' || order.archivedAt) return 'This order is closed.';
    if (order.activeVersionId && !order.draft?.changeRequestId) {
      return 'The approved agreement is locked. Start a change proposal to process new material.';
    }
    if (sourceCount === 0) return 'Add at least one message, picture or voice note first.';
    if (sourceCount > e.AI_MAX_SOURCES_PER_JOB) {
      return `AI processing handles up to ${e.AI_MAX_SOURCES_PER_JOB} sources at a time. Remove some sources or add the details manually.`;
    }
    if (bytes > e.AI_MAX_INPUT_MB_PER_JOB * MB) {
      return `These sources are larger than the ${e.AI_MAX_INPUT_MB_PER_JOB} MB processing limit.`;
    }
    const startOfToday = startOfDayUtc(order.studio.timeZone, todayInZone(order.studio.timeZone));
    const usedToday = await this.prisma.extractionJob.count({
      where: { studioId: order.studioId, createdAt: { gte: startOfToday } },
    });
    if (usedToday >= e.AI_MAX_JOBS_PER_STUDIO_PER_DAY) {
      return `Your studio has used today's ${e.AI_MAX_JOBS_PER_STUDIO_PER_DAY} AI processing runs. You can continue manually.`;
    }
    return null;
  }

  async overview(studioId: string, orderId: string): Promise<ExtractionOverviewDto> {
    const order = await this.context(studioId, orderId);
    const jobs = await this.prisma.extractionJob.findMany({
      where: { orderId, studioId },
      include: jobInclude,
      orderBy: { createdAt: 'desc' },
      take: 6,
    });
    const input = await currentInputSet(this.prisma, orderId);
    const lastSucceeded = jobs.find((j) => j.status === 'SUCCEEDED');
    const reason = await this.blocker(order, input.sources.length, input.bytes);
    return {
      latest: jobs[0] ? toJobDto(jobs[0]) : null,
      history: jobs.slice(1).map(toJobDto),
      sourcesChangedSinceLatest: Boolean(lastSucceeded && lastSucceeded.inputHash !== input.hash),
      canStart: reason === null,
      cannotStartReason: reason,
    };
  }

  async start(studioId: string, actor: UserActor, orderId: string, input: StartExtractionInput): Promise<ExtractionJobDto> {
    await this.rateLimits.consume('extract:studio', studioId, RATE_LIMITS.extractionPerStudio);
    const order = await this.context(studioId, orderId);
    const mode = this.providers.modeFor(order.studio);
    if (!mode) throw Errors.aiNotConfigured(this.config.aiAvailability().message);

    const job = await this.prisma.$transaction(async (tx) => {
      await lockOrder(tx, studioId, orderId);
      const repeat = await tx.extractionJob.findFirst({ where: { orderId, idempotencyKey: input.idempotencyKey }, include: jobInclude });
      if (repeat) return repeat;
      const active = await tx.extractionJob.findFirst({
        where: { orderId, status: { in: ['QUEUED', 'RUNNING'] } },
        include: jobInclude,
      });
      if (active) return active;

      const set = await currentInputSet(tx, orderId);
      const reason = await this.blocker(order, set.sources.length, set.bytes);
      if (reason) throw Errors.invalidState(reason);
      const draft = await tx.briefDraft.findUniqueOrThrow({ where: { orderId }, select: { revision: true } });

      const created = await tx.extractionJob.create({
        data: {
          studioId,
          orderId,
          mode,
          inputHash: set.hash,
          inputSources: set.sources,
          draftRevision: draft.revision,
          idempotencyKey: input.idempotencyKey,
          maxAttempts: this.config.env.EXTRACTION_MAX_ATTEMPTS,
          createdById: actor.userId,
        },
        include: jobInclude,
      });
      await tx.sourceAsset.updateMany({
        where: { id: { in: set.sources.map((s) => s.sourceId) } },
        data: { processingState: 'QUEUED', processingError: null },
      });
      await this.audit.record(tx, {
        studioId,
        orderId,
        actor,
        type: 'EXTRACTION_STARTED',
        summary: `${mode === 'FIXTURE' ? 'Example (demo fixture)' : 'AI'} processing started for ${set.sources.length} source${set.sources.length === 1 ? '' : 's'}`,
        data: { jobId: created.id, mode },
      });
      return created;
    });

    if (job.status === 'QUEUED' && !job.dispatchedAt) {
      const dispatched = await this.queue.dispatchExtraction(job.id, job.attempts + 1);
      if (dispatched) {
        await this.prisma.extractionJob.updateMany({ where: { id: job.id, dispatchedAt: null }, data: { dispatchedAt: new Date() } });
      }
    }
    return toJobDto(await this.prisma.extractionJob.findUniqueOrThrow({ where: { id: job.id }, include: jobInclude }));
  }

  /** A failed job is retried as a new job over the current input set. */
  async retry(studioId: string, actor: UserActor, orderId: string, jobId: string): Promise<ExtractionJobDto> {
    const failed = await this.prisma.extractionJob.findFirst({ where: { id: jobId, orderId, studioId } });
    if (!failed) throw Errors.notFound('Processing job');
    if (failed.status !== 'FAILED') throw Errors.invalidState('Only failed processing can be retried.');
    return this.start(studioId, actor, orderId, { idempotencyKey: `retry-${failed.id}` });
  }
}
