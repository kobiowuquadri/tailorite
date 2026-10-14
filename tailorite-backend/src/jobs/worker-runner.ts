import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { ownJobs } from './extraction-common.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { createExtractionWorker, type ExtractionWorker } from './queue.js';
import { ExtractionProcessor } from './extraction.processor.js';
import { RecoveryService } from './recovery.service.js';
import { HousekeepingService } from './housekeeping.service.js';
import { logger } from '../common/logging/json-logger.js';

/**
 * Owns the worker process loop: job consumption (BullMQ, or polling the job table when
 * JOB_QUEUE_BACKEND=database), recovery sweep, heartbeat and housekeeping.
 */
@Injectable()
export class WorkerRunner implements OnApplicationShutdown {
  private worker: ExtractionWorker | null = null;
  private timers: NodeJS.Timeout[] = [];
  private stopping = false;
  private readonly inFlight = new Set<Promise<unknown>>();
  private polling = false;

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly processor: ExtractionProcessor,
    private readonly recovery: RecoveryService,
    private readonly housekeeping: HousekeepingService,
  ) {}

  async start(): Promise<void> {
    const pollsDatabase = this.config.env.JOB_QUEUE_BACKEND === 'database';
    if (!pollsDatabase) {
      this.worker = createExtractionWorker(this.config, async (job) => {
        await this.processor.process(job.data.extractionJobId);
      });
      this.worker.on('error', (error) => logger().event('error', 'queue_worker_error', { error: error.message }));
    }

    const every = (ms: number, label: string, fn: () => Promise<unknown>) => {
      const run = () => {
        if (this.stopping) return;
        fn().catch((error: Error) => logger().event('warn', `${label}_failed`, { error: error.message }));
      };
      run();
      this.timers.push(setInterval(run, ms));
    };
    if (pollsDatabase) every(this.config.env.JOB_POLL_INTERVAL_MS, 'job_poll', () => this.pollDueJobs());
    every(15_000, 'heartbeat', () => this.recovery.heartbeat());
    every(20_000, 'recovery_sweep', () => this.recovery.sweep());
    every(60_000, 'backlog', async () => {
      const backlog = await this.recovery.backlog();
      if (backlog.queued || backlog.running) logger().event('info', 'job_backlog', backlog);
    });
    every(10 * 60_000, 'housekeeping', () => this.housekeeping.run());
    logger().event('info', 'worker_started', {
      workerId: this.recovery.workerId,
      concurrency: this.config.env.WORKER_CONCURRENCY,
      backend: this.config.env.JOB_QUEUE_BACKEND,
      aiMode: this.config.aiAvailability().mode,
      aiAvailable: this.config.aiAvailability().available,
    });
  }

  /**
   * Polling mode: starts due jobs up to the concurrency limit. `process` claims each job with a
   * status-conditioned update, so several workers polling the same table never run a job twice.
   */
  async pollDueJobs(): Promise<number> {
    if (this.polling || this.stopping) return 0;
    this.polling = true;
    try {
      const free = this.config.env.WORKER_CONCURRENCY - this.inFlight.size;
      if (free <= 0) return 0;
      const due = await this.prisma.extractionJob.findMany({
        where: { status: 'QUEUED', nextAttemptAt: { lte: new Date() }, AND: [ownJobs(this.config.deploymentId)] },
        orderBy: { nextAttemptAt: 'asc' },
        take: free,
        select: { id: true },
      });
      for (const { id } of due) {
        const run = this.processor
          .process(id)
          .catch((error: Error) => logger().event('error', 'job_poll_process_failed', { jobId: id, error: error.message }))
          .finally(() => this.inFlight.delete(run));
        this.inFlight.add(run);
      }
      return due.length;
    } finally {
      this.polling = false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    for (const t of this.timers) clearInterval(t);
    // close() waits for jobs in progress; unfinished work is recovered from PostgreSQL later.
    await this.worker?.close().catch(() => undefined);
    await Promise.allSettled(this.inFlight);
    await this.recovery.removeHeartbeat().catch(() => undefined);
    logger().event('info', 'worker_stopped', { workerId: this.recovery.workerId });
  }
}
