import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { createOwner, startTestApp, type Client, type TestApp } from './helpers/app.js';
import { createOrder, getBrief, saveBrief, wavBuffer } from './helpers/fixtures.js';
import { WorkerModule } from '../src/worker.module.js';
import { ExtractionProcessor } from '../src/jobs/extraction.processor.js';
import { RecoveryService } from '../src/jobs/recovery.service.js';

const TEXT_A = 'I want a navy-blue floor-length dress with a square neckline.\nPlease make the sleeves long and fitted. No slit.\nI will provide the fabric.';

let t: TestApp;
let worker: INestApplicationContext;
let processor: ExtractionProcessor;

beforeAll(async () => {
  t = await startTestApp({ AI_TEST_FAKE: 'true', EXTRACTION_MAX_ATTEMPTS: '2' });
  worker = await NestFactory.createApplicationContext(WorkerModule.register(t.config), { logger: false });
  processor = worker.get(ExtractionProcessor);
});
afterAll(async () => {
  await worker.close();
  await t.close();
});

async function orderWithSources(c: Client, text = TEXT_A, withAudio = true) {
  const { orderId } = await createOrder(c);
  await c.post(`/api/orders/${orderId}/sources/text`, { text, sender: 'Customer' }).expect(201);
  if (withAudio) {
    await c
      .upload(`/api/orders/${orderId}/sources/files`)
      .attach('file', wavBuffer(6), { filename: 'voice-note.wav', contentType: 'audio/wav' })
      .expect(201);
  }
  return orderId;
}

async function start(c: Client, orderId: string, key = crypto.randomUUID()) {
  return (await c.post(`/api/orders/${orderId}/extractions`, { idempotencyKey: key }).expect(201)).body;
}

describe('AI extraction pipeline (deterministic test provider)', () => {
  it('turns messages and a voice note into reviewable suggestions and surfaces the sleeve conflict', async () => {
    const { client: c } = await createOwner(t.server);
    const orderId = await orderWithSources(c);
    const before = await getBrief(c, orderId);
    const job = await start(c, orderId);
    expect(job.status).toBe('QUEUED');
    expect(job.mode).toBe('TEST');

    expect(await processor.process(job.id)).toBe('processed');
    const overview = (await c.get(`/api/orders/${orderId}/extractions`).expect(200)).body;
    expect(overview.latest.status).toBe('SUCCEEDED');

    const brief = await getBrief(c, orderId);
    // Suggestions never change the draft by themselves.
    expect(brief.content).toEqual(before.content);
    const keys = brief.suggestions.map((s: { fieldKey: string }) => s.fieldKey).sort();
    expect(keys).toEqual(['color', 'embellishments', 'exclusion', 'fabricSupplier', 'length', 'neckline']);
    const conflict = brief.issues.find((i: { kind: string }) => i.kind === 'CONFLICT');
    expect(conflict.fieldKey).toBe('sleeves');
    expect(conflict.candidates.map((x: { value: string }) => x.value)).toEqual(['Long and fitted', 'Elbow length']);
    expect(brief.issues.some((i: { kind: string; fieldKey: string }) => i.kind === 'MISSING' && i.fieldKey === 'fit')).toBe(true);
    expect((await c.get(`/api/orders/${orderId}`)).body.agreementStatus).toBe('NEEDS_CLARIFICATION');

    // The machine transcript is kept, labelled, and timed against the real duration.
    const sources = (await c.get(`/api/orders/${orderId}/sources`).expect(200)).body.sources;
    const audio = sources.find((s: { kind: string }) => s.kind === 'AUDIO');
    expect(audio.transcript.origin).toBe('MACHINE');
    expect(audio.transcript.segments).toHaveLength(3);
    expect(audio.processingState).toBe('PROCESSED');
    const beading = brief.suggestions.find((s: { fieldKey: string }) => s.fieldKey === 'embellishments');
    expect(beading.evidence[0].sourceId).toBe(audio.id);
    expect(beading.evidence[0].startMs).toBe(4000);

    // Resolve the conflict with the voice note's value: the brief records its evidence.
    const resolved = await c
      .post(`/api/orders/${orderId}/issues/${conflict.id}/resolve`, {
        expectedRevision: brief.revision,
        resolution: { type: 'CANDIDATE', candidateIndex: 1, note: 'Customer confirmed elbow length' },
      })
      .expect(200);
    expect(resolved.body.content.fields.sleeves.value).toBe('Elbow length');
    expect(resolved.body.content.fields.sleeves.evidence[0].sourceId).toBe(audio.id);

    const neck = resolved.body.suggestions.find((s: { fieldKey: string }) => s.fieldKey === 'neckline');
    const accepted = await c
      .post(`/api/orders/${orderId}/suggestions/${neck.id}/accept`, { expectedRevision: resolved.body.revision })
      .expect(200);
    expect(accepted.body.content.fields.neckline.value).toBe('Square neckline');
    expect(accepted.body.content.fields.neckline.origin).toBe('AI_ACCEPTED');
  });

  it('is idempotent: repeated starts return the same job and duplicate deliveries do nothing', async () => {
    const { client: c } = await createOwner(t.server);
    const orderId = await orderWithSources(c, TEXT_A, false);
    const key = crypto.randomUUID();
    const a = await start(c, orderId, key);
    const b = await start(c, orderId, key);
    const other = await start(c, orderId);
    expect(b.id).toBe(a.id);
    expect(other.id).toBe(a.id);
    expect(await processor.process(a.id)).toBe('processed');
    expect(await processor.process(a.id)).toBe('skipped');
    expect(await t.prisma.extractionResult.count({ where: { orderId } })).toBe(1);
    expect(await t.prisma.sourceAsset.count({ where: { orderId } })).toBe(1);
  });

  it('never overwrites edits made while processing and flags the result as stale', async () => {
    const { client: c } = await createOwner(t.server);
    const orderId = await orderWithSources(c, TEXT_A, false);
    const job = await start(c, orderId);
    const brief = await getBrief(c, orderId);
    brief.content.fields.color.value = 'Midnight blue (confirmed in person)';
    await saveBrief(c, orderId, brief.content, brief.revision);
    await processor.process(job.id);
    const after = await getBrief(c, orderId);
    expect(after.content.fields.color.value).toBe('Midnight blue (confirmed in person)');
    const color = after.suggestions.find((s: { fieldKey: string }) => s.fieldKey === 'color');
    expect(color.currentValue).toBe('Midnight blue (confirmed in person)');
    const overview = (await c.get(`/api/orders/${orderId}/extractions`).expect(200)).body;
    expect(overview.latest.result.stale).toBe(true);
  });

  it('retries temporary failures with backoff and fails permanently without touching the draft', async () => {
    const { client: c } = await createOwner(t.server);
    const flaky = await orderWithSources(c, `${TEXT_A} [[ai:transient-once]]`, false);
    const job = await start(c, flaky);
    await processor.process(job.id);
    let row = await t.prisma.extractionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('QUEUED');
    expect(row.errorCode).toBe('PROVIDER_UNAVAILABLE');
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(await processor.process(job.id)).toBe('skipped'); // not due yet
    await t.prisma.extractionJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date() } });
    await processor.process(job.id);
    row = await t.prisma.extractionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe('SUCCEEDED');
    expect(row.attempts).toBe(2);

    const broken = await orderWithSources(c, `${TEXT_A} [[ai:invalid]]`, false);
    const before = await getBrief(c, broken);
    const bad = await start(c, broken);
    await processor.process(bad.id);
    await t.prisma.extractionJob.update({ where: { id: bad.id }, data: { nextAttemptAt: new Date() } });
    await processor.process(bad.id);
    const failed = (await c.get(`/api/orders/${broken}/extractions`).expect(200)).body.latest;
    expect(failed.status).toBe('FAILED');
    expect(failed.errorCode).toBe('INVALID_RESPONSE');
    expect(failed.retryable).toBe(true);
    expect((await getBrief(c, broken)).content).toEqual(before.content);
    const source = (await c.get(`/api/orders/${broken}/sources`)).body.sources[0];
    expect(source.processingState).toBe('FAILED');

    const retried = (await c.post(`/api/orders/${broken}/extractions/${failed.id}/retry`).expect(201)).body;
    expect(retried.id).not.toBe(failed.id);
    expect(retried.status).toBe('QUEUED');
  });

  it('rejects evidence pointing outside the submitted sources', async () => {
    const { client: c } = await createOwner(t.server);
    const orderId = await orderWithSources(c, `${TEXT_A} [[ai:foreign-evidence]] [[ai:bad-quote]]`, false);
    const job = await start(c, orderId);
    await processor.process(job.id);
    const overview = (await c.get(`/api/orders/${orderId}/extractions`).expect(200)).body;
    expect(overview.latest.result.evidenceRejected).toBe(2);
    const brief = await getBrief(c, orderId);
    const lining = brief.suggestions.find((s: { fieldKey: string }) => s.fieldKey === 'lining');
    expect(lining.basis).toBe('INFERENCE');
    expect(lining.evidence).toHaveLength(0);
    expect(lining.needsHumanReview).toBe(true);
  });

  it('recovers jobs whose dispatch was lost or whose worker died', async () => {
    const { client: c } = await createOwner(t.server);
    const orderId = await orderWithSources(c, TEXT_A, false);
    const job = await start(c, orderId);
    await t.prisma.extractionJob.update({
      where: { id: job.id },
      data: { status: 'RUNNING', attempts: 1, leaseExpiresAt: new Date(Date.now() - 1000), dispatchedAt: new Date() },
    });
    const recovery = worker.get(RecoveryService);
    await recovery.sweep();
    const recovered = await t.prisma.extractionJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(recovered.status).toBe('QUEUED');
    expect(recovered.dispatchedAt).not.toBeNull(); // re-dispatched in the same sweep
    await processor.process(job.id);
    expect((await t.prisma.extractionJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('SUCCEEDED');
  });
});

describe('AI not configured', () => {
  it('says so and leaves manual work available', async () => {
    const manual = await startTestApp({ AI_MODE: 'live', GEMINI_API_KEY: '' });
    try {
      const { client: c } = await createOwner(manual.server);
      const status = (await c.get('/api/ai/status').expect(200)).body;
      expect(status.available).toBe(false);
      expect(status.message).toBe('AI extraction is not configured. You can still add every detail manually.');
      const { orderId } = await createOrder(c);
      await c.post(`/api/orders/${orderId}/sources/text`, { text: TEXT_A }).expect(201);
      const res = await c.post(`/api/orders/${orderId}/extractions`, { idempotencyKey: crypto.randomUUID() }).expect(503);
      expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
      const overview = (await c.get(`/api/orders/${orderId}/extractions`).expect(200)).body;
      expect(overview.canStart).toBe(false);
      // Manual editing still works.
      const brief = await getBrief(c, orderId);
      brief.content.fields.color.value = 'Navy blue';
      await saveBrief(c, orderId, brief.content, brief.revision);
    } finally {
      await manual.close();
    }
  });
});
