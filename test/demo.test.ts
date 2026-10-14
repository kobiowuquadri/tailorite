import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { client, createOwner, startTestApp, type TestApp } from './helpers/app.js';
import { WorkerModule } from '../src/worker.module.js';
import { ExtractionProcessor } from '../src/jobs/extraction.processor.js';
import { DemoPurgeService } from '../src/demo/demo-purge.service.js';
import { DemoService } from '../src/demo/demo.service.js';

let t: TestApp;
let worker: INestApplicationContext;

beforeAll(async () => {
  t = await startTestApp({ AI_MODE: 'live', GEMINI_API_KEY: '', DEMO_SANDBOX_AI: 'fixture', DEMO_OWNER_PASSWORD: 'demo-password-123' });
  worker = await NestFactory.createApplicationContext(WorkerModule.register(t.config), { logger: false });
});
afterAll(async () => {
  await worker.close();
  await t.close();
});

async function sandbox() {
  const visitor = client(t.server);
  const res = await visitor.post('/api/demo/sessions').expect(201);
  const orderId = /\/orders\/([0-9a-f-]{36})\/brief/.exec(res.body.redirectTo)![1];
  return { visitor, orderId };
}

describe('public demo sandboxes', () => {
  it('gives each visitor an isolated studio with synthetic data in every workflow state', async () => {
    const { visitor, orderId } = await sandbox();
    const session = (await visitor.get('/api/auth/session').expect(200)).body;
    expect(session.user.isDemo).toBe(true);
    expect(session.studio.isDemo).toBe(true);
    expect(session.studio.demoExpiresAt).not.toBeNull();

    const dashboard = (await visitor.get('/api/dashboard').expect(200)).body;
    expect(dashboard.counts).toEqual({
      draft: 2,
      needsClarification: 0,
      awaitingApproval: 1,
      approvedNotStarted: 1,
      dueSoon: 1, // the completed order due in 2 days is excluded
      changeRequested: 1,
    });
    const order = (await visitor.get(`/api/orders/${orderId}`).expect(200)).body;
    expect(order.title).toBe('Navy evening dress');
    expect(order.isSynthetic).toBe(true);
    const sources = (await visitor.get(`/api/orders/${orderId}/sources`).expect(200)).body.sources;
    expect(sources.map((s: { kind: string }) => s.kind)).toEqual(['TEXT', 'AUDIO', 'IMAGE']);
    expect(sources[1].durationMs).toBeGreaterThan(8000);

    const other = await sandbox();
    await other.visitor.get(`/api/orders/${orderId}`).expect(404);
  });

  it('runs clearly labelled example extraction on the demo sources, including the sleeve conflict', async () => {
    const { visitor, orderId } = await sandbox();
    const ai = (await visitor.get('/api/ai/status').expect(200)).body;
    expect(ai.mode).toBe('fixture');
    expect(ai.label).toBe('Example results');
    const job = (await visitor.post(`/api/orders/${orderId}/extractions`, { idempotencyKey: crypto.randomUUID() }).expect(201)).body;
    expect(job.mode).toBe('FIXTURE');
    await worker.get(ExtractionProcessor).process(job.id);

    const overview = (await visitor.get(`/api/orders/${orderId}/extractions`).expect(200)).body;
    expect(overview.latest.status).toBe('SUCCEEDED');
    expect(overview.latest.result.isExample).toBe(true);
    expect(overview.latest.result.evidenceRejected).toBe(0);
    expect(overview.latest.result.warnings.join(' ')).toMatch(/slit/i);
    // The voice note had no transcript when the job started; the job's own transcript is part of
    // what it processed, so the result is current.
    expect(overview.latest.result.stale).toBe(false);
    expect(overview.sourcesChangedSinceLatest).toBe(false);

    const brief = (await visitor.get(`/api/orders/${orderId}/brief`).expect(200)).body;
    const conflict = brief.issues.find((i: { kind: string }) => i.kind === 'CONFLICT');
    expect(conflict.fieldKey).toBe('sleeves');
    expect(conflict.candidates.map((c: { value: string }) => c.value)).toEqual(['Long and fitted', 'Elbow length']);
    const audio = (await visitor.get(`/api/orders/${orderId}/sources`).expect(200)).body.sources.find((s: { kind: string }) => s.kind === 'AUDIO');
    expect(audio.transcript.origin).toBe('FIXTURE');
    expect(audio.transcript.segments).toHaveLength(3);
    const elbow = conflict.candidates[1].evidence[0];
    expect(elbow.sourceId).toBe(audio.id);
    expect(elbow.startMs).toBe(0);
    const visual = brief.suggestions.find((s: { basis: string }) => s.basis === 'VISUAL_OBSERVATION');
    expect(visual.needsHumanReview).toBe(true);
  });

  it('purges expired sandboxes completely without touching real studios', async () => {
    const real = await createOwner(t.server, { studioName: 'A real studio' });
    const { visitor } = await sandbox();
    const session = (await visitor.get('/api/auth/session').expect(200)).body;
    const studioId = session.studio.id;
    await t.prisma.studio.update({ where: { id: studioId }, data: { demoExpiresAt: new Date(Date.now() - 1000) } });
    const purged = await worker.get(DemoPurgeService).purgeExpiredSandboxes();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await t.prisma.studio.count({ where: { id: studioId } })).toBe(0);
    expect(await t.prisma.briefVersion.count({ where: { studioId } })).toBe(0);
    expect(await t.prisma.auditEvent.count({ where: { studioId } })).toBe(0);
    await visitor.get('/api/auth/session').expect(401);
    expect(await t.prisma.studio.count({ where: { id: real.studioId } })).toBe(1);
    // Append-only protection still applies outside the purge path.
    await expect(t.prisma.auditEvent.deleteMany({ where: { studioId: real.studioId } })).rejects.toThrow();
  });
});

describe('presenter demo seed', () => {
  it('is repeatable and only resets the flagged demo studio', async () => {
    const demo = t.app.get(DemoService);
    const first = await demo.seedPresenterStudio();
    const second = await demo.seedPresenterStudio();
    expect(second.studioId).not.toBe(first.studioId);
    expect(await t.prisma.studio.count({ where: { demoSeedKey: 'amina-atelier' } })).toBe(1);
    const presenter = client(t.server);
    const login = await presenter.post('/api/auth/login', { email: 'demo@tailorite.local', password: 'demo-password-123' }).expect(200);
    expect(login.body.studio.name).toBe('Amina Atelier');
    // The presenter studio is flagged as demo data but is not a temporary sandbox.
    expect(login.body.studio.isDemo).toBe(true);
    expect(login.body.studio.demoExpiresAt).toBeNull();
  });
});
