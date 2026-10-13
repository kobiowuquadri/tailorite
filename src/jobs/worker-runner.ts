import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { createExtractionWorker, type ExtractionWorker } from './queue.js';
import { ExtractionProcessor } from './extraction.processor.js';
import { RecoveryService } from './recovery.service.js';
import { HousekeepingService } from './housekeeping.service.js';
import { logger } from '../common/logging/json-logger.js';

/** Owns the worker process loop: BullMQ consumer, recovery sweep, heartbeat and housekeeping. */
@Injectable()
export class WorkerRunner implements OnApplicationShutdown {
  private worker: ExtractionWorker | null = null;
  private timers: NodeJS.Timeout[] = [];
  private stopping = false;

  constructor(
    private readonly config: AppConfig,
    private readonly processor: ExtractionProcessor,
    private readonly recovery: RecoveryService,
    private readonly housekeeping: HousekeepingService,
  ) {}

  async start(): Promise<void> {
    this.worker = createExtractionWorker(this.config, async (job) => {
      await this.processor.process(job.data.extractionJobId);
    });
    this.worker.on('error', (error) => logger().event('error', 'queue_worker_error', { error: error.message }));

    const every = (ms: number, label: string, fn: () => Promise<unknown>) => {
      const run = () => {
        if (this.stopping) return;
        fn().catch((error: Error) => logger().event('warn', `${label}_failed`, { error: error.message }));
      };
      run();
      this.timers.push(setInterval(run, ms));
    };
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

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    for (const t of this.timers) clearInterval(t);
    // close() waits for jobs in progress; unfinished work is recovered from PostgreSQL later.
    await this.worker?.close().catch(() => undefined);
    await this.recovery.removeHeartbeat().catch(() => undefined);
    logger().event('info', 'worker_stopped', { workerId: this.recovery.workerId });
  }
}
