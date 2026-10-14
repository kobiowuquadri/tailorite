import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';
import { inject } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { client, createOwner, startTestApp, type TestApp } from './helpers/app.js';
import { createOrder } from './helpers/fixtures.js';
import { WorkerModule } from '../src/worker.module.js';
import { WorkerRunner } from '../src/jobs/worker-runner.js';
import { ExtractionProcessor } from '../src/jobs/extraction.processor.js';

// JOB_QUEUE_BACKEND=database: no message queue at all — the worker polls the ExtractionJob table.
// Used with small hosted databases whose connection limit cannot also carry a queue backend.
// The poller takes due jobs from every studio, so this file gets its own database: other test
// files' queued jobs would otherwise be picked up (and processed) here.
let t: TestApp;
let worker: INestApplicationContext;
const shared = new URL(inject('databaseUrl'));
const isolated = new URL(shared);
isolated.pathname = `${shared.pathname}_polling`;
const maintenance = new URL(shared);
maintenance.pathname = '/postgres';

async function admin(sql: string) {
  const c = new pg.Client({ connectionString: maintenance.toString() });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

beforeAll(async () => {
  const name = isolated.pathname.slice(1);
  await admin(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0`);
  execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: isolated.toString() },
    stdio: 'pipe',
  });
  t = await startTestApp({
    DATABASE_URL: isolated.toString(),
    AI_TEST_FAKE: 'true',
    JOB_QUEUE_BACKEND: 'database',
    WORKER_CONCURRENCY: '1',
  });
  worker = await NestFactory.createApplicationContext(WorkerModule.register(t.config), { logger: false });
}, 120_000);
afterAll(async () => {
  await worker?.close();
  await t?.close();
  await admin(`DROP DATABASE IF EXISTS "${isolated.pathname.slice(1)}" WITH (FORCE)`);
});

describe('database-polling job queue', () => {
  it('reports itself in readiness and processes queued jobs by polling, one claim per job', async () => {
    const health = await client(t.server).get('/api/health/ready').expect(200);
    expect(health.body.checks.queue).toMatchObject({ status: 'ok', backend: 'Job table polling (PostgreSQL)' });

    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    await c
      .post(`/api/orders/${orderId}/sources/text`, { text: 'Navy-blue floor-length dress with a square neckline.', sender: 'Customer' })
      .expect(201);
    const job = (await c.post(`/api/orders/${orderId}/extractions`, { idempotencyKey: crypto.randomUUID() }).expect(201)).body;
    expect(job.status).toBe('QUEUED');

    const runner = worker.get(WorkerRunner);
    // Overlapping polls never start the same job twice.
    const started = await Promise.all([runner.pollDueJobs(), runner.pollDueJobs()]);
    expect(started.reduce((a, b) => a + b, 0)).toBe(1);

    await expect
      .poll(async () => (await c.get(`/api/orders/${orderId}/extractions`).expect(200)).body.latest.status, { timeout: 15_000 })
      .toBe('SUCCEEDED');
    const row = await t.prisma.extractionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.attempts).toBe(1);
    expect(row.deployment).toBe(t.config.deploymentId);
    expect(await runner.pollDueJobs()).toBe(0);
  });

  it('leaves jobs created by another deployment alone (for example a live job seen from a laptop)', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    await c.post(`/api/orders/${orderId}/sources/text`, { text: 'Sleeves elbow length.', sender: 'Customer' }).expect(201);
    const job = (await c.post(`/api/orders/${orderId}/extractions`, { idempotencyKey: crypto.randomUUID() }).expect(201)).body;
    await t.prisma.extractionJob.update({ where: { id: job.id }, data: { deployment: 'https://another-deployment.example' } });

    expect(await worker.get(WorkerRunner).pollDueJobs()).toBe(0);
    expect(await worker.get(ExtractionProcessor).process(job.id)).toBe('skipped');
    const row = await t.prisma.extractionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: 'QUEUED', attempts: 0 });
  });
});
