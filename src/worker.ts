import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './bootstrap.js';
import { WorkerModule } from './worker.module.js';
import { WorkerRunner } from './jobs/worker-runner.js';
import { JsonLogger, setSharedLogger } from './common/logging/json-logger.js';

// Separate process for expensive AI/media work. Scale it independently of the API.
const config = loadConfig();
const log = new JsonLogger(config.env.LOG_LEVEL, 'worker');
setSharedLogger(log);
const app = await NestFactory.createApplicationContext(WorkerModule.register(config), { logger: log });
app.enableShutdownHooks();
await app.get(WorkerRunner).start();
