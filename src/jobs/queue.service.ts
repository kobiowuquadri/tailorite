import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { createExtractionQueue, withTimeout, type ExtractionQueue } from './queue.js';
import { logger } from '../common/logging/json-logger.js';

/**
 * Dispatches durable extraction jobs to BullMQ. Dispatch is best-effort: the database row is the
 * source of truth, and the worker's recovery sweep re-dispatches anything that was not delivered.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private queue: ExtractionQueue | null = null;

  constructor(private readonly config: AppConfig) {}

  private getQueue(): ExtractionQueue {
    this.queue ??= createExtractionQueue(this.config);
    return this.queue;
  }

  /** Returns false when dispatch failed; the job stays QUEUED in PostgreSQL for recovery. */
  async dispatchExtraction(extractionJobId: string, attempt: number, delayMs = 0): Promise<boolean> {
    try {
      await withTimeout(
        this.getQueue().add(
          'extract',
          { extractionJobId },
          {
            // Deterministic id per attempt: duplicate dispatches of the same attempt are ignored.
            jobId: `${extractionJobId}-a${attempt}`,
            delay: delayMs,
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: { count: 200 },
          },
        ),
        5000,
        'queue dispatch',
      );
      return true;
    } catch (error) {
      logger().event('warn', 'queue_dispatch_failed', {
        extractionJobId,
        attempt,
        error: (error as Error).message,
      });
      return false;
    }
  }

  async check(): Promise<void> {
    await withTimeout(this.getQueue().waitUntilReady(), 5000, 'queue readiness');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close().catch(() => undefined);
  }
}
