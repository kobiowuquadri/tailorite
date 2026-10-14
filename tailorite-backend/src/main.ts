import { NestFactory } from '@nestjs/core';
import { createApiApp, loadConfig } from './bootstrap.js';
import { logger } from './common/logging/json-logger.js';
import { queueBackendLabel } from './jobs/queue.js';
import { WorkerModule } from './worker.module.js';
import { WorkerRunner } from './jobs/worker-runner.js';

const config = loadConfig();
const app = await createApiApp(config);
await app.listen(config.env.PORT);

// Single-service hosting (e.g. a free web service with no background workers): run the worker in
// this process. It is the same code as `dist/worker.js`, in its own module context.
if (config.env.WORKER_IN_API) {
  const worker = await NestFactory.createApplicationContext(WorkerModule.register(config), { logger: false });
  worker.enableShutdownHooks();
  await worker.get(WorkerRunner).start();
}

const ai = config.aiAvailability();
logger().event('info', 'api_started', {
  port: config.env.PORT,
  appOrigin: config.env.APP_ORIGIN,
  storage: config.env.STORAGE_DRIVER,
  queue: queueBackendLabel(config),
  workerInApi: config.env.WORKER_IN_API,
  aiMode: ai.mode,
  aiAvailable: ai.available,
});
