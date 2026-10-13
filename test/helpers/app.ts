import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import request from 'supertest';
import { inject } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createApiApp } from '../../src/bootstrap.js';
import { AppConfig } from '../../src/config/app-config.js';
import { parseEnv } from '../../src/config/env.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';

export const APP_ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'correct-horse-battery';

export type TestApp = {
  app: INestApplication;
  server: Server;
  config: AppConfig;
  prisma: PrismaService;
  storageDir: string;
  close: () => Promise<void>;
};

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  const storageDir = overrides.STORAGE_LOCAL_DIR ?? mkdtempSync(join(tmpdir(), 'tailorite-test-'));
  return new AppConfig(
    parseEnv({
      NODE_ENV: 'test',
      APP_ORIGIN,
      TRUST_PROXY: 'true',
      DATABASE_URL: inject('databaseUrl'),
      DATABASE_POOL_MAX: '6',
      SESSION_SECRET: 'test-session-secret-that-is-long-enough-123',
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_DIR: storageDir,
      JOB_QUEUE_BACKEND: 'postgres',
      AI_MODE: 'off',
      LOG_LEVEL: 'error',
      ...overrides,
    }),
  );
}

export async function startTestApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  const config = testConfig(overrides);
  const app = await createApiApp(config, { logger: false });
  await app.init();
  const server = app.getHttpServer() as Server;
  return {
    app,
    server,
    config,
    prisma: app.get(PrismaService),
    storageDir: config.env.STORAGE_LOCAL_DIR,
    close: async () => {
      await app.close();
      rmSync(config.env.STORAGE_LOCAL_DIR, { recursive: true, force: true });
    },
  };
}

/** A cookie-keeping client that behaves like the web app (CSRF header, origin, its own IP). */
export function client(server: Server, ip = `10.${rand()}.${rand()}.${rand()}`) {
  const agent = request.agent(server);
  const withHeaders = <T extends request.Test>(req: T) =>
    req.set('x-tailorite-csrf', '1').set('origin', APP_ORIGIN).set('x-forwarded-for', ip);
  return {
    agent,
    ip,
    get: (url: string) => agent.get(url).set('x-forwarded-for', ip),
    post: (url: string, body?: unknown) => withHeaders(agent.post(url)).send(body as object),
    put: (url: string, body?: unknown) => withHeaders(agent.put(url)).send(body as object),
    patch: (url: string, body?: unknown) => withHeaders(agent.patch(url)).send(body as object),
    delete: (url: string) => withHeaders(agent.delete(url)),
    upload: (url: string) => withHeaders(agent.post(url)),
  };
}
export type Client = ReturnType<typeof client>;

function rand() {
  return Math.floor(Math.random() * 250) + 1;
}

/** Registers an owner and completes onboarding. */
export async function createOwner(server: Server, opts: { studioName?: string } = {}) {
  const c = client(server);
  const email = `owner-${randomUUID()}@example.com`;
  await c.post('/api/auth/register', { name: 'Test Owner', email, password: PASSWORD }).expect(201);
  const studio = await c
    .post('/api/studios', {
      studioName: opts.studioName ?? 'Test Studio',
      ownerName: 'Test Owner',
      measurementUnit: 'INCH',
    })
    .expect(201);
  return { client: c, email, studioId: studio.body.id as string };
}

export async function createCustomer(c: Client, name = 'Ada Okafor') {
  const res = await c.post('/api/customers', { name, phone: '08030000000' }).expect(201);
  return res.body as { id: string; name: string };
}
