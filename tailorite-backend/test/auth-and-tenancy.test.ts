import { client, createCustomer, createOwner, PASSWORD, startTestApp, type TestApp } from './helpers/app.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('authentication and sessions', () => {
  it('registers, onboards and keeps the session across a fresh page load', async () => {
    const { client: c, email } = await createOwner(t.server, { studioName: 'Ìfẹ́ Couture' });
    const session = await c.get('/api/auth/session').expect(200);
    expect(session.body.user.email).toBe(email);
    expect(session.body.studio.name).toBe('Ìfẹ́ Couture');
    expect(session.body.studio.currency).toBe('USD');
    expect(session.body.studio.timeZone).toBe('Africa/Lagos');

    // The session cookie is HttpOnly and never readable by scripts.
    const login = await client(t.server).post('/api/auth/login', { email, password: PASSWORD }).expect(200);
    const cookie = String(login.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('stores only a hash of the session token and the password as argon2id', async () => {
    const { email } = await createOwner(t.server);
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email }, include: { sessions: true } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(user.sessions[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects wrong passwords with a generic message', async () => {
    const { email } = await createOwner(t.server);
    const res = await client(t.server).post('/api/auth/login', { email, password: 'not-the-password' }).expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.body.error.message).toBe('Email or password is incorrect.');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('logs out by revoking the session', async () => {
    const { client: c } = await createOwner(t.server);
    await c.post('/api/auth/logout').expect(200);
    await c.get('/api/auth/session').expect(401);
  });

  it('requires onboarding before studio data can be used', async () => {
    const c = client(t.server);
    await c
      .post('/api/auth/register', { name: 'New Owner', email: `new-${Date.now()}@example.com`, password: PASSWORD })
      .expect(201);
    const res = await c.get('/api/customers').expect(403);
    expect(res.body.error.code).toBe('ONBOARDING_REQUIRED');
  });

  it('blocks cookie-authenticated mutations without the CSRF header or from another origin', async () => {
    const { client: c } = await createOwner(t.server);
    const noHeader = await c.agent.post('/api/customers').send({ name: 'X Y' }).expect(403);
    expect(noHeader.body.error.code).toBe('CSRF_REJECTED');
    const otherOrigin = await c.agent
      .post('/api/customers')
      .set('x-tailorite-csrf', '1')
      .set('origin', 'https://attacker.example')
      .send({ name: 'X Y' })
      .expect(403);
    expect(otherOrigin.body.error.code).toBe('CSRF_REJECTED');
  });

  it('rate-limits repeated failed logins per email', async () => {
    const { email } = await createOwner(t.server);
    let last = 0;
    for (let i = 0; i < 9; i++) {
      const res = await client(t.server).post('/api/auth/login', { email, password: 'wrong-password!' });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe('tenant isolation', () => {
  it('prevents one studio from reading or changing another studio\'s customers', async () => {
    const a = await createOwner(t.server, { studioName: 'Studio A' });
    const b = await createOwner(t.server, { studioName: 'Studio B' });
    const customerB = await createCustomer(b.client, 'Customer of B');

    await a.client.get(`/api/customers/${customerB.id}`).expect(404);
    await a.client.patch(`/api/customers/${customerB.id}`, { name: 'Hijacked' }).expect(404);
    await a.client
      .put(`/api/customers/${customerB.id}/measurements`, {
        unit: 'INCH',
        recordedOn: '2026-10-01',
        values: [{ key: 'waist', label: 'Waist', value: 30 }],
      })
      .expect(404);

    const listA = await a.client.get('/api/customers').expect(200);
    expect(listA.body.items.map((c: { id: string }) => c.id)).not.toContain(customerB.id);

    const stillB = await b.client.get(`/api/customers/${customerB.id}`).expect(200);
    expect(stillB.body.name).toBe('Customer of B');
    expect(stillB.body.measurementProfile).toBeNull();
  });

  it('ignores any client-supplied studio id', async () => {
    const a = await createOwner(t.server);
    const b = await createOwner(t.server);
    const res = await a.client.post('/api/customers', { name: 'Smuggled', studioId: b.studioId }).expect(201);
    const row = await t.prisma.customer.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.studioId).toBe(a.studioId);
  });
});

describe('customers and measurements', () => {
  it('creates, searches and records measurements with an explicit unit and date', async () => {
    const { client: c } = await createOwner(t.server);
    const created = await createCustomer(c, 'Chiamaka Eze');
    await createCustomer(c, 'Bola Ade');

    const search = await c.get('/api/customers?search=chiam').expect(200);
    expect(search.body.items).toHaveLength(1);
    expect(search.body.items[0].name).toBe('Chiamaka Eze');

    const saved = await c
      .put(`/api/customers/${created.id}/measurements`, {
        unit: 'CM',
        recordedOn: '2026-10-10',
        values: [
          { key: 'bust', label: 'Bust', value: 92.5 },
          { key: 'custom_sleeveOpening', label: 'Sleeve opening', value: 28 },
        ],
      })
      .expect(200);
    expect(saved.body.measurementProfile.unit).toBe('CM');
    expect(saved.body.measurementProfile.recordedOn).toBe('2026-10-10');
    expect(saved.body.measurementProfile.values).toHaveLength(2);

    const invalid = await c
      .put(`/api/customers/${created.id}/measurements`, {
        unit: 'CM',
        recordedOn: '10/10/2026',
        values: [{ key: 'bust', label: 'Bust', value: -1 }],
      })
      .expect(422);
    expect(invalid.body.error.fieldErrors.recordedOn).toBeTruthy();
    expect(invalid.body.error.fieldErrors['values.0.value']).toBeTruthy();
  });
});
