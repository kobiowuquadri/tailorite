import { createPostgresBackend, Queue, Worker, type Job, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/app-config.js';

export const EXTRACTION_QUEUE = 'tailorite-extraction';

/** The BullMQ payload only identifies the durable database job; all state lives in PostgreSQL. */
export type ExtractionJobData = { extractionJobId: string };

/** Minimal producer surface shared by the Redis and PostgreSQL backends. */
export type ExtractionQueue = {
  add(name: string, data: ExtractionJobData, opts?: JobsOptions): Promise<unknown>;
  waitUntilReady(): Promise<unknown>;
  close(): Promise<void>;
};

export type ExtractionWorker = {
  close(): Promise<void>;
  on(event: 'failed', listener: (job: Job | undefined, error: Error) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
};

export function queueBackendLabel(config: AppConfig): string {
  const backend = config.env.JOB_QUEUE_BACKEND;
  if (backend === 'database') return 'Job table polling (PostgreSQL)';
  return backend === 'redis' ? 'BullMQ (Redis)' : 'BullMQ (PostgreSQL backend)';
}

/** BullMQ's own tables live in the `bullmq` schema of the same database (migrated idempotently). */
function postgresConnection(config: AppConfig, max: number) {
  return { connectionString: config.env.DATABASE_URL, max, migrate: true };
}

export function createExtractionQueue(config: AppConfig): ExtractionQueue {
  if (config.env.JOB_QUEUE_BACKEND === 'redis') {
    // Producer connection fails fast: if Redis is down the API keeps the job queued in
    // PostgreSQL and the worker's recovery sweep dispatches it later.
    const connection = new Redis(config.env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    connection.on('error', () => {
      /* surfaced through readiness checks and dispatch failures */
    });
    return new Queue(EXTRACTION_QUEUE, { connection }) as unknown as ExtractionQueue;
  }
  return new Queue(
    EXTRACTION_QUEUE,
    { connection: postgresConnection(config, 2) },
    createPostgresBackend,
  ) as unknown as ExtractionQueue;
}

export function createExtractionWorker(
  config: AppConfig,
  processor: (job: Job<ExtractionJobData>) => Promise<void>,
): ExtractionWorker {
  const concurrency = config.env.WORKER_CONCURRENCY;
  if (config.env.JOB_QUEUE_BACKEND === 'redis') {
    const connection = new Redis(config.env.REDIS_URL!, { maxRetriesPerRequest: null });
    return new Worker(EXTRACTION_QUEUE, processor, { connection, concurrency }) as unknown as ExtractionWorker;
  }
  return new Worker(
    EXTRACTION_QUEUE,
    processor as (job: Job) => Promise<void>,
    { connection: postgresConnection(config, concurrency + 2), concurrency },
    createPostgresBackend,
  ) as unknown as ExtractionWorker;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
