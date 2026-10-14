import { Injectable } from '@nestjs/common';
import { hostname } from 'node:os';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.js';
import { ownJobs } from './extraction-common.js';
import { QueueService } from './queue.service.js';
import { queueBackendLabel } from './queue.js';
import { logger } from '../common/logging/json-logger.js';

/**
 * PostgreSQL is the source of truth for jobs. This sweep makes dispatch reliable even if a queue
 * message is lost (Redis restart, API crash between commit and dispatch) or a worker dies mid-job.
 */
@Injectable()
export class RecoveryService {
  readonly workerId = `${hostname()}:${process.pid}`;
  private readonly startedAt = new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly config: AppConfig,
  ) {}

  async sweep(): Promise<{ redispatched: number; recovered: number; failed: number }> {
    const now = Date.now();
    let redispatched = 0;
    let recovered = 0;
    let failed = 0;

    // Recover jobs whose worker died first, so they are re-dispatched in this same sweep.
    const expired = await this.prisma.extractionJob.findMany({
      where: { status: 'RUNNING', leaseExpiresAt: { lt: new Date(now) }, AND: [ownJobs(this.config.deploymentId)] },
      take: 50,
    });
    for (const job of expired) {
      if (job.attempts < job.maxAttempts) {
        const moved = await this.prisma.extractionJob.updateMany({
          where: { id: job.id, status: 'RUNNING', leaseExpiresAt: { lt: new Date(now) } },
          data: {
            status: 'QUEUED',
            nextAttemptAt: new Date(),
            leaseExpiresAt: null,
            dispatchedAt: null,
            errorCode: 'TIMEOUT',
            errorMessage: 'Processing was interrupted. Retrying automatically.',
          },
        });
        recovered += moved.count;
      } else {
        const moved = await this.prisma.extractionJob.updateMany({
          where: { id: job.id, status: 'RUNNING', leaseExpiresAt: { lt: new Date(now) } },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            leaseExpiresAt: null,
            errorCode: 'TIMEOUT',
            errorMessage: 'Processing did not finish. Your brief was not changed — try again.',
          },
        });
        if (moved.count) {
          await this.prisma.sourceAsset.updateMany({
            where: { id: { in: (job.inputSources as { sourceId: string }[]).map((s) => s.sourceId) }, processingState: { in: ['QUEUED', 'PROCESSING'] } },
            data: { processingState: 'FAILED', processingError: 'Processing did not finish.' },
          });
        }
        failed += moved.count;
      }
    }
    // Fresh clock: jobs recovered above became due during this sweep.
    const dueBy = Date.now();
    const due = await this.prisma.extractionJob.findMany({
      where: {
        status: 'QUEUED',
        nextAttemptAt: { lte: new Date(dueBy) },
        OR: [{ dispatchedAt: null }, { dispatchedAt: { lt: new Date(dueBy - 2 * 60_000) } }],
        AND: [ownJobs(this.config.deploymentId)],
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: 50,
    });
    for (const job of due) {
      if (await this.queue.dispatchExtraction(job.id, job.attempts + 1)) {
        await this.prisma.extractionJob.updateMany({ where: { id: job.id, status: 'QUEUED' }, data: { dispatchedAt: new Date() } });
        redispatched++;
      }
    }

    if (redispatched || recovered || failed) {
      logger().event('info', 'job_recovery_sweep', { redispatched, recovered, failed });
    }
    return { redispatched, recovered, failed };
  }

  async heartbeat(): Promise<void> {
    await this.prisma.workerHeartbeat.upsert({
      where: { id: this.workerId },
      create: {
        id: this.workerId,
        startedAt: this.startedAt,
        lastSeenAt: new Date(),
        backend: queueBackendLabel(this.config),
        concurrency: this.config.env.WORKER_CONCURRENCY,
      },
      update: { lastSeenAt: new Date() },
    });
  }

  async removeHeartbeat(): Promise<void> {
    await this.prisma.workerHeartbeat.deleteMany({ where: { id: this.workerId } });
  }

  /** Queue backlog measurement for logs/ops. */
  async backlog(): Promise<{ queued: number; running: number; oldestQueuedSeconds: number | null }> {
    const [queued, running, oldest] = await Promise.all([
      this.prisma.extractionJob.count({ where: { status: 'QUEUED', AND: [ownJobs(this.config.deploymentId)] } }),
      this.prisma.extractionJob.count({ where: { status: 'RUNNING', AND: [ownJobs(this.config.deploymentId)] } }),
      this.prisma.extractionJob.findFirst({ where: { status: 'QUEUED', AND: [ownJobs(this.config.deploymentId)] }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    return {
      queued,
      running,
      oldestQueuedSeconds: oldest ? Math.round((Date.now() - oldest.createdAt.getTime()) / 1000) : null,
    };
  }
}
