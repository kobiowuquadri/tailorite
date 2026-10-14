import { client, createCustomer, createOwner, startTestApp, type TestApp } from './helpers/app.js';
import { completeBrief, createOrder, getBrief, noisyPng, pngBuffer, saveBrief, wavBuffer } from './helpers/fixtures.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp({ UPLOAD_MAX_IMAGE_MB: '1' });
});
afterAll(async () => {
  await t.close();
});

describe('orders', () => {
  it('creates an order with a draft brief and per-studio numbering', async () => {
    const { client: c } = await createOwner(t.server);
    const first = await createOrder(c);
    const second = await createOrder(c, 'Bisi Ola');
    const a = await c.get(`/api/orders/${first.orderId}`).expect(200);
    const b = await c.get(`/api/orders/${second.orderId}`).expect(200);
    expect(a.body.reference).toBe('ORD-0001');
    expect(b.body.reference).toBe('ORD-0002');
    expect(a.body.agreementStatus).toBe('DRAFT');
    expect(a.body.productionStatus).toBe('NOT_STARTED');
    expect(a.body.nextStep.kind).toBe('ADD_SOURCES');
    const brief = await getBrief(c, first.orderId);
    expect(brief.content.fields.garmentType.value).toBe('Dress');
    expect(brief.editable).toBe(true);
  });

  it('refuses to link another studio\'s customer to an order', async () => {
    const a = await createOwner(t.server);
    const b = await createOwner(t.server);
    const foreign = await createCustomer(b.client, 'Not yours');
    const res = await a.client
      .post('/api/orders', { customerId: foreign.id, title: 'Attempt', garmentType: 'Dress' })
      .expect(422);
    expect(res.body.error.fieldErrors.customerId).toBeTruthy();
  });

  it('isolates orders between studios and paginates/searches on the server', async () => {
    const a = await createOwner(t.server);
    const b = await createOwner(t.server);
    const { orderId } = await createOrder(a.client, 'Zainab Bello');
    for (let i = 0; i < 3; i++) await createOrder(a.client, `Customer ${i}`);
    await b.client.get(`/api/orders/${orderId}`).expect(404);
    await b.client.get(`/api/orders/${orderId}/brief`).expect(404);
    await b.client.get(`/api/orders/${orderId}/timeline`).expect(404);
    const listB = await b.client.get('/api/orders').expect(200);
    expect(listB.body.total).toBe(0);
    const page = await a.client.get('/api/orders?pageSize=2&page=2').expect(200);
    expect(page.body.total).toBe(4);
    expect(page.body.items).toHaveLength(2);
    const search = await a.client.get('/api/orders?search=zainab').expect(200);
    expect(search.body.items.map((o: { id: string }) => o.id)).toEqual([orderId]);
    const byNumber = await a.client.get('/api/orders?search=ORD-0001').expect(200);
    expect(byNumber.body.items).toHaveLength(1);
  });

  it('only starts production after an approved agreement', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const res = await c.post(`/api/orders/${orderId}/production`, { to: 'IN_PROGRESS' }).expect(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });
});

describe('sources', () => {
  it('stores text sources and ignores exact duplicates and retries', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const text = 'I want a navy-blue floor-length dress with a square neckline.';
    const first = await c.post(`/api/orders/${orderId}/sources/text`, { text, sender: 'Customer (WhatsApp)' }).expect(201);
    expect(first.body.duplicate).toBe(false);
    expect(first.body.source.label).toBe('Message 1');
    const again = await c.post(`/api/orders/${orderId}/sources/text`, { text }).expect(201);
    expect(again.body.duplicate).toBe(true);
    expect(again.body.source.id).toBe(first.body.source.id);
    const list = await c.get(`/api/orders/${orderId}/sources`).expect(200);
    expect(list.body.sources).toHaveLength(1);
    expect(list.body.policy.maxSources).toBeGreaterThan(0);
  });

  it('validates uploads by content, size and type', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);

    const png = await pngBuffer(320, 200);
    const ok = await c
      .upload(`/api/orders/${orderId}/sources/files`)
      .attach('file', png, { filename: 'ref.png', contentType: 'image/png' })
      .field('sender', 'Customer')
      .expect(201);
    expect(ok.body.source.kind).toBe('IMAGE');
    expect(ok.body.source.mimeType).toBe('image/png');
    expect(ok.body.source.width).toBe(320);
    expect(ok.body.source.previewUrl).toMatch(/\/preview$/);

    // A text file pretending to be an image is rejected by its content.
    const fake = await c
      .upload(`/api/orders/${orderId}/sources/files`)
      .attach('file', Buffer.from('<script>alert(1)</script>'.repeat(10)), { filename: 'evil.png', contentType: 'image/png' })
      .expect(415);
    expect(fake.body.error.code).toBe('UNSUPPORTED_MEDIA');

    // The image limit is 1 MB in this test configuration.
    const big = await noisyPng(800, 600);
    expect(big.length).toBeGreaterThan(1024 * 1024);
    const tooBig = await c
      .upload(`/api/orders/${orderId}/sources/files`)
      .attach('file', big, { filename: 'big.png', contentType: 'image/png' })
      .expect(413);
    expect(tooBig.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    const wav = await c
      .upload(`/api/orders/${orderId}/sources/files`)
      .attach('file', wavBuffer(2), { filename: 'note.wav', contentType: 'audio/wav' })
      .field('origin', 'RECORDED')
      .expect(201);
    expect(wav.body.source.kind).toBe('AUDIO');
    expect(wav.body.source.label).toBe('Voice note 1');
    expect(wav.body.source.durationMs).toBe(2000);
  });

  it('serves private files only to the owning studio, with byte ranges', async () => {
    const a = await createOwner(t.server);
    const b = await createOwner(t.server);
    const { orderId } = await createOrder(a.client);
    const wav = wavBuffer(1);
    const uploaded = await a.client
      .upload(`/api/orders/${orderId}/sources/files`)
      .attach('file', wav, { filename: 'note.wav', contentType: 'audio/wav' })
      .expect(201);
    const url = uploaded.body.source.contentUrl as string;

    const full = await a.client.get(url).buffer(true).expect(200);
    expect(full.headers['content-type']).toBe('audio/wav');
    expect(full.headers['cache-control']).toContain('no-store');
    expect(Buffer.from(full.body).equals(wav)).toBe(true);

    const partial = await a.client.get(url).set('range', 'bytes=0-43').buffer(true).expect(206);
    expect(partial.headers['content-range']).toBe(`bytes 0-43/${wav.length}`);
    expect(Buffer.from(partial.body).subarray(0, 4).toString('latin1')).toBe('RIFF');

    await b.client.get(url).expect(404);
    await client(t.server).get(url).expect(401);
  });

  it('keeps machine transcripts and records corrections as new rows', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const up = await c
      .upload(`/api/orders/${orderId}/sources/files`)
      .attach('file', wavBuffer(1), { filename: 'n.wav', contentType: 'audio/wav' })
      .expect(201);
    const sourceId = up.body.source.id;
    const first = await c
      .post(`/api/orders/${orderId}/sources/${sourceId}/transcripts`, { text: 'Make the sleeves elbow length.', basedOnTranscriptId: null })
      .expect(201);
    expect(first.body.transcript.origin).toBe('HUMAN');
    const stale = await c
      .post(`/api/orders/${orderId}/sources/${sourceId}/transcripts`, { text: 'Another', basedOnTranscriptId: null })
      .expect(409);
    expect(stale.body.error.code).toBe('CONFLICT');
    const second = await c
      .post(`/api/orders/${orderId}/sources/${sourceId}/transcripts`, {
        text: 'Please make the sleeves elbow length.',
        basedOnTranscriptId: first.body.transcript.id,
      })
      .expect(201);
    expect(second.body.transcriptVersions).toBe(2);
    expect(second.body.transcript.correctsId).toBe(first.body.transcript.id);
  });
});

describe('brief workbench', () => {
  it('rejects stale saves and moves from draft to ready as details are completed', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const start = await getBrief(c, orderId);
    expect(start.readiness.ready).toBe(false);
    expect(start.readiness.blocking.map((b: { code: string }) => b.code)).toContain('PRICE_REQUIRED');

    const saved = await saveBrief(c, orderId, completeBrief(), start.revision);
    expect(saved.body.revision).toBe(start.revision + 1);
    expect(saved.body.readiness.ready).toBe(true);

    const stale = await saveBrief(c, orderId, completeBrief(), start.revision, 409);
    expect(stale.body.error.code).toBe('STALE_REVISION');
    expect(stale.body.error.meta.currentRevision).toBe(start.revision + 1);

    const order = await c.get(`/api/orders/${orderId}`).expect(200);
    expect(order.body.agreementStatus).toBe('READY_FOR_REVIEW');

    // An open question blocks publication until it is resolved.
    const withIssue = await c.post(`/api/orders/${orderId}/issues`, { question: 'Lining colour?', fieldKey: 'lining' }).expect(201);
    expect(withIssue.body.readiness.ready).toBe(false);
    expect((await c.get(`/api/orders/${orderId}`)).body.agreementStatus).toBe('NEEDS_CLARIFICATION');
    const issueId = withIssue.body.issues[0].id;
    const resolved = await c
      .post(`/api/orders/${orderId}/issues/${issueId}/resolve`, {
        expectedRevision: withIssue.body.revision,
        resolution: { type: 'VALUE', value: 'Navy lining', note: 'Confirmed by phone' },
      })
      .expect(200);
    expect(resolved.body.content.fields.lining.value).toBe('Navy lining');
    expect(resolved.body.content.fields.lining.origin).toBe('CLARIFICATION');
    expect((await c.get(`/api/orders/${orderId}`)).body.agreementStatus).toBe('READY_FOR_REVIEW');
  });

  it('requires a reason when a required detail is marked not applicable and validates terms', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const brief = completeBrief();
    brief.fields.sleeves = { value: null, notApplicable: true, note: 'Sleeveless gown', evidence: [], origin: 'MANUAL' };
    brief.terms.depositRequiredKobo = 9_000_000; // more than the total
    const res = await saveBrief(c, orderId, brief);
    const codes = res.body.readiness.blocking.map((b: { code: string }) => b.code);
    expect(codes).toContain('DEPOSIT_EXCEEDS_TOTAL');
    expect(codes).not.toContain('FIELD_REQUIRED');

    const both = completeBrief();
    both.fields.sleeves = { value: 'Long', notApplicable: true, note: null, evidence: [], origin: 'MANUAL' };
    await saveBrief(c, orderId, both, undefined, 422);
  });

  it('copies measurements as a snapshot that later profile edits do not change', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId, customerId } = await createOrder(c);
    await c
      .put(`/api/customers/${customerId}/measurements`, {
        unit: 'INCH',
        recordedOn: '2026-10-05',
        values: [
          { key: 'bust', label: 'Bust', value: 36 },
          { key: 'waist', label: 'Waist', value: 29 },
        ],
      })
      .expect(200);
    const brief = await getBrief(c, orderId);
    const copied = await c
      .post(`/api/orders/${orderId}/brief/measurements/copy`, { expectedRevision: brief.revision, keys: ['waist'] })
      .expect(200);
    expect(copied.body.content.measurements.values).toEqual([{ key: 'waist', label: 'Waist', value: 29 }]);
    await c
      .put(`/api/customers/${customerId}/measurements`, {
        unit: 'INCH',
        recordedOn: '2026-10-06',
        values: [{ key: 'waist', label: 'Waist', value: 31 }],
      })
      .expect(200);
    const after = await getBrief(c, orderId);
    expect(after.content.measurements.values[0].value).toBe(29);
    expect(after.content.measurements.recordedOn).toBe('2026-10-05');
  });

  it('rejects evidence or references that point at another order\'s sources', async () => {
    const { client: c } = await createOwner(t.server);
    const one = await createOrder(c);
    const two = await createOrder(c, 'Other customer');
    const foreign = await c
      .upload(`/api/orders/${two.orderId}/sources/files`)
      .attach('file', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' })
      .expect(201);
    const brief = completeBrief({ referenceId: foreign.body.source.id });
    const res = await saveBrief(c, one.orderId, brief, undefined, 422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
