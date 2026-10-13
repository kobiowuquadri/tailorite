import { createOwner, startTestApp, type TestApp } from './helpers/app.js';
import { completeBrief, createOrder, futureDate, getBrief, pngBuffer, saveBrief } from './helpers/fixtures.js';
import { decide, openPortal, parseLink, publish, publishCompleteBrief, review } from './helpers/portal.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.close();
});

const approve = (contentHash: string, name = 'Ada Okafor') => ({ decision: 'APPROVE', name, confirmed: true, contentHash });

describe('publication', () => {
  it('blocks publication while required details are missing', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const res = await publish(c, orderId, 422);
    expect(res.body.error.code).toBe('PUBLISH_BLOCKED');
    const codes = res.body.error.meta.blocking.map((b: { code: string }) => b.code);
    expect(codes).toEqual(expect.arrayContaining(['PRICE_REQUIRED', 'DELIVERY_DATE_REQUIRED', 'MEASUREMENTS_REQUIRED']));
  });

  it('freezes the published snapshot: later draft, profile and database edits cannot change it', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId, customerId } = await createOrder(c);
    const { version, link } = await publishCompleteBrief(c, orderId);
    expect(version.number).toBe(1);
    expect(link.url).toMatch(/\/review\/[0-9a-f-]{36}#[A-Za-z0-9_-]{43}$/);
    expect(link.whatsappUrl).toMatch(/^https:\/\/wa\.me\/2348030000000\?text=/);

    const before = (await c.get(`/api/orders/${orderId}/versions/${version.id}`).expect(200)).body;

    const edited = completeBrief();
    edited.fields.sleeves.value = 'Long sleeves';
    await saveBrief(c, orderId, edited);
    await c.patch(`/api/customers/${customerId}`, { name: 'Renamed Customer' }).expect(200);

    const after = (await c.get(`/api/orders/${orderId}/versions/${version.id}`).expect(200)).body;
    expect(after.contentHash).toBe(before.contentHash);
    expect(after.brief.fields.sleeves.value).toBe('Elbow-length sleeves');
    expect(after.customerName).toBe('Ada Okafor');

    await expect(
      t.prisma.briefVersion.update({ where: { id: version.id }, data: { contentHash: 'tampered' } }),
    ).rejects.toThrow(/immutable/);
  });
});

describe('customer approval portal', () => {
  it('exchanges the link for a session, shows only selected references and approves exactly once', async () => {
    const { client: c, studioId } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const selected = await c
      .upload(`/api/orders/${orderId}/sources/files`)
      .attach('file', await pngBuffer(100, 100, '#00bfb3'), { filename: 'ref.png', contentType: 'image/png' })
      .expect(201);
    const unselected = await c
      .upload(`/api/orders/${orderId}/sources/files`)
      .attach('file', await pngBuffer(100, 100, '#ff6a55'), { filename: 'other.png', contentType: 'image/png' })
      .expect(201);
    const { link, version } = await publishCompleteBrief(c, orderId, { referenceId: selected.body.source.id });

    const { accessId } = parseLink(link);
    const wrong = await openPortal(t.server, { ...link, url: `${link.url.split('#')[0]}#${'x'.repeat(43)}` }).catch((e) => e);
    expect(String(wrong)).toMatch(/404/);

    const { customer } = await openPortal(t.server, link);
    const view = await review(customer, accessId);
    expect(view.state).toBe('PENDING');
    expect(view.permissions.canDecide).toBe(true);
    expect(view.version.number).toBe(1);
    expect(view.terms.totalPriceKobo).toBe(8_500_000);
    expect(JSON.stringify(view)).not.toContain('evidence');
    expect(view.references).toHaveLength(1);
    await customer.get(view.references[0].url).expect(200);
    await customer.get(`/api/portal/${accessId}/media/${unselected.body.source.id}`).expect(404);

    // The portal session never grants studio access.
    await customer.get(`/api/orders/${orderId}`).expect(401);

    const missingConfirmation = await decide(customer, accessId, { decision: 'APPROVE', name: 'Ada', contentHash: version.contentHash }, 422);
    expect(missingConfirmation.body.error.fieldErrors.confirmed).toBeTruthy();

    const approved = await decide(customer, accessId, approve(version.contentHash));
    expect(approved.body.state).toBe('APPROVED');
    // A repeated click is a no-op; a contradicting decision is refused.
    await decide(customer, accessId, approve(version.contentHash));
    const contradicting = await decide(customer, accessId, { decision: 'REQUEST_CHANGES', name: 'Ada', comment: 'Wait', contentHash: version.contentHash }, 409);
    expect(contradicting.body.error.code).toBe('ALREADY_DECIDED');

    expect(await t.prisma.approvalEvent.count({ where: { orderId } })).toBe(1);
    expect(await t.prisma.usageEvent.count({ where: { orderId } })).toBe(1);
    const order = (await c.get(`/api/orders/${orderId}`).expect(200)).body;
    expect(order.agreementStatus).toBe('APPROVED');
    expect(order.activeVersion.number).toBe(1);
    expect(order.activeVersion.decision.customerName).toBe('Ada Okafor');
    const usage = (await c.get('/api/studio/usage').expect(200)).body;
    expect(usage.approvedOrders).toBe(1);
    expect(studioId).toBeTruthy();

    // The approved agreement can no longer be edited directly.
    const brief = await getBrief(c, orderId);
    expect(brief.editable).toBe(false);
    await saveBrief(c, orderId, completeBrief(), brief.revision, 409);
  });

  it('lets only one of two simultaneous decisions win', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const { link, version } = await publishCompleteBrief(c, orderId);
    const { accessId } = parseLink(link);
    const a = await openPortal(t.server, link);
    const b = await openPortal(t.server, link);
    const results = await Promise.all([
      a.customer.post(`/api/portal/${accessId}/decision`, approve(version.contentHash)),
      b.customer.post(`/api/portal/${accessId}/decision`, {
        decision: 'REQUEST_CHANGES',
        name: 'Someone else',
        comment: 'Make it red',
        contentHash: version.contentHash,
      }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(await t.prisma.approvalEvent.count({ where: { orderId } })).toBe(1);
  });

  it('refuses expired, revoked, superseded and cancelled-order links', async () => {
    const { client: c } = await createOwner(t.server);

    // Expired
    const one = await createOrder(c);
    const p1 = await publishCompleteBrief(c, one.orderId);
    const s1 = await openPortal(t.server, p1.link);
    await t.prisma.customerPortalAccess.update({ where: { id: s1.accessId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await decide(s1.customer, s1.accessId, approve(p1.version.contentHash), 410);
    expect(expired.body.error.code).toBe('LINK_EXPIRED');

    // Revoked (and a regenerated link works)
    const two = await createOrder(c, 'Bisi Ola');
    const p2 = await publishCompleteBrief(c, two.orderId);
    const s2 = await openPortal(t.server, p2.link);
    const regenerated = (await c.post(`/api/orders/${two.orderId}/links/approval`, {}).expect(201)).body;
    const revoked = await decide(s2.customer, s2.accessId, approve(p2.version.contentHash), 410);
    expect(revoked.body.error.code).toBe('LINK_REVOKED');
    const fresh = await openPortal(t.server, regenerated);
    await decide(fresh.customer, fresh.accessId, approve(p2.version.contentHash));

    // Superseded by a newer publication
    const three = await createOrder(c, 'Chidi Okeke');
    const p3 = await publishCompleteBrief(c, three.orderId);
    const s3 = await openPortal(t.server, p3.link);
    const edited = completeBrief();
    edited.fields.color.value = 'Emerald green';
    await saveBrief(c, three.orderId, edited);
    const v2 = (await publish(c, three.orderId)).body;
    expect(v2.version.number).toBe(2);
    const superseded = await decide(s3.customer, s3.accessId, approve(p3.version.contentHash), 410);
    expect(superseded.body.error.code).toBe('LINK_REVOKED');
    const versions = (await c.get(`/api/orders/${three.orderId}/versions`).expect(200)).body;
    expect(versions.map((v: { status: string }) => v.status)).toEqual(['AWAITING_APPROVAL', 'SUPERSEDED']);

    // Cancelled order
    const four = await createOrder(c, 'Dayo Ade');
    const p4 = await publishCompleteBrief(c, four.orderId);
    const s4 = await openPortal(t.server, p4.link);
    await c.post(`/api/orders/${four.orderId}/cancel`, { reason: 'Customer travelled' }).expect(200);
    const cancelled = await decide(s4.customer, s4.accessId, approve(p4.version.contentHash), 410);
    expect(cancelled.body.error.code).toBe('LINK_REVOKED');
  });

  it('records requested changes without altering the published version, then approves the next version', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const { link, version } = await publishCompleteBrief(c, orderId);
    const { customer, accessId } = await openPortal(t.server, link);
    const res = await decide(customer, accessId, {
      decision: 'REQUEST_CHANGES',
      name: 'Ada Okafor',
      comment: 'Please use emerald green instead.',
      contentHash: version.contentHash,
    });
    expect(res.body.state).toBe('CHANGES_REQUESTED');
    const order = (await c.get(`/api/orders/${orderId}`).expect(200)).body;
    expect(order.agreementStatus).toBe('NEEDS_CLARIFICATION');
    expect(order.activeVersion).toBeNull();

    const brief = await getBrief(c, orderId);
    const feedback = brief.issues.find((i: { kind: string }) => i.kind === 'CUSTOMER_FEEDBACK');
    expect(feedback.question).toContain('emerald green');
    const content = brief.content;
    content.fields.color.value = 'Emerald green';
    const saved = await saveBrief(c, orderId, content, brief.revision);
    const resolved = await c
      .post(`/api/orders/${orderId}/issues/${feedback.id}/resolve`, {
        expectedRevision: saved.body.revision,
        resolution: { type: 'NOTE_ONLY', note: 'Colour updated to emerald green' },
      })
      .expect(200);
    expect(resolved.body.readiness.ready).toBe(true);

    const v2 = (await publish(c, orderId)).body;
    expect(v2.version.number).toBe(2);
    const v1 = (await c.get(`/api/orders/${orderId}/versions/${version.id}`).expect(200)).body;
    expect(v1.brief.fields.color.value).toBe('Navy blue');
    expect(v1.status).toBe('CHANGES_REQUESTED');

    const s2 = await openPortal(t.server, v2.link);
    await decide(s2.customer, s2.accessId, approve(v2.version.contentHash));
    const final = (await c.get(`/api/orders/${orderId}`).expect(200)).body;
    expect(final.activeVersion.number).toBe(2);
  });
});

describe('change management and money (demo scenario)', () => {
  it('keeps V1 authoritative while V2 is pending, then switches totals exactly once', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const v1 = await publishCompleteBrief(c, orderId);
    const portal = await openPortal(t.server, v1.link);
    await decide(portal.customer, portal.accessId, approve(v1.version.contentHash));

    await c
      .post(`/api/orders/${orderId}/payments`, {
        kind: 'DEPOSIT',
        amountKobo: 3_000_000,
        receivedOn: futureDate(0),
        method: 'Bank transfer',
        idempotencyKey: 'deposit-key-1',
      })
      .expect(201);
    // Retrying the same submission does not double-count.
    let finance = (
      await c
        .post(`/api/orders/${orderId}/payments`, {
          kind: 'DEPOSIT',
          amountKobo: 3_000_000,
          receivedOn: futureDate(0),
          idempotencyKey: 'deposit-key-1',
        })
        .expect(201)
    ).body;
    expect(finance.received.netKobo).toBe(3_000_000);
    expect(finance.agreed.totalKobo).toBe(8_500_000);
    expect(finance.balanceDueKobo).toBe(5_500_000);

    // Customer asks for heavier beading through the approved-version portal.
    const asked = await portal.customer
      .post(`/api/portal/${portal.accessId}/change-requests`, { name: 'Ada Okafor', message: 'Heavier beading on the neckline, please.' })
      .expect(200);
    expect(asked.body.openChangeRequest.messages).toHaveLength(1);
    const requests = (await c.get(`/api/orders/${orderId}/change-requests`).expect(200)).body;
    expect(requests[0].status).toBe('REQUESTED');
    expect((await c.get(`/api/orders/${orderId}`)).body.nextStep.kind).toBe('REVIEW_CHANGE_REQUEST');

    await c
      .post(`/api/orders/${orderId}/change-requests/${requests[0].id}/start`, {
        reason: 'Heavier neckline beading: additional ₦15,000 and two more days.',
      })
      .expect(200);
    const draft = await getBrief(c, orderId);
    expect(draft.editable).toBe(true);
    const proposal = draft.content;
    proposal.fields.embellishments.value = 'Heavier beading around the neckline';
    proposal.terms.totalPriceKobo = 10_000_000;
    const originalDelivery = proposal.terms.deliveryDate;
    const newDelivery = new Date(`${originalDelivery}T00:00:00Z`);
    newDelivery.setUTCDate(newDelivery.getUTCDate() + 2);
    proposal.terms.deliveryDate = newDelivery.toISOString().slice(0, 10);
    await saveBrief(c, orderId, proposal, draft.revision);

    const comparison = (await c.get(`/api/orders/${orderId}/compare`).expect(200)).body;
    expect(comparison.priceDifferenceKobo).toBe(1_500_000);
    expect(comparison.deliveryShiftDays).toBe(2);
    expect(comparison.fields.map((f: { key: string }) => f.key)).toEqual(['embellishments']);

    const v2 = (await publish(c, orderId)).body;
    expect(v2.version.number).toBe(2);
    expect(v2.version.kind).toBe('REVISION');

    // While V2 is pending, V1 and its ₦85,000 total stay in force.
    let order = (await c.get(`/api/orders/${orderId}`).expect(200)).body;
    expect(order.agreementStatus).toBe('REVISION_AWAITING_APPROVAL');
    expect(order.activeVersion.number).toBe(1);
    expect(order.pendingVersion.number).toBe(2);
    finance = (await c.get(`/api/orders/${orderId}/payments`).expect(200)).body;
    expect(finance.agreed.totalKobo).toBe(8_500_000);
    expect(finance.balanceDueKobo).toBe(5_500_000);
    expect(finance.proposed.adjustmentKobo).toBe(1_500_000);

    const s2 = await openPortal(t.server, v2.link);
    const pendingView = await review(s2.customer, s2.accessId);
    expect(pendingView.change.priceDifferenceKobo).toBe(1_500_000);
    expect(pendingView.change.previousVersionNumber).toBe(1);
    expect(pendingView.permissions.canDecline).toBe(true);

    await decide(s2.customer, s2.accessId, approve(v2.version.contentHash));
    order = (await c.get(`/api/orders/${orderId}`).expect(200)).body;
    expect(order.activeVersion.number).toBe(2);
    expect(order.agreementStatus).toBe('APPROVED');
    expect(order.dueDate).toBe(proposal.terms.deliveryDate);
    expect(order.versions.map((v: { number: number; status: string }) => `${v.number}:${v.status}`)).toEqual([
      '2:APPROVED',
      '1:APPROVED',
    ]);
    finance = (await c.get(`/api/orders/${orderId}/payments`).expect(200)).body;
    expect(finance.agreed.totalKobo).toBe(10_000_000);
    expect(finance.balanceDueKobo).toBe(7_000_000);
    // Revision approvals never add usage.
    expect(await t.prisma.usageEvent.count({ where: { orderId } })).toBe(1);

    // The old V1 approval link can never change the agreement again: repeating its own decision is a
    // no-op and any other decision is refused.
    await decide(portal.customer, portal.accessId, approve(v1.version.contentHash));
    expect((await c.get(`/api/orders/${orderId}`)).body.activeVersion.number).toBe(2);
    const stale = await decide(
      portal.customer,
      portal.accessId,
      { decision: 'REQUEST_CHANGES', name: 'Ada', comment: 'Undo', contentHash: v1.version.contentHash },
      409,
    );
    expect(stale.body.error.code).toBe('ALREADY_DECIDED');
    const oldView = await review(portal.customer, portal.accessId);
    expect(oldView.version.isActive).toBe(false);
    expect(oldView.permissions.canRequestChange).toBe(false);
  });

  it('a declined or withdrawn change leaves the active agreement untouched', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const v1 = await publishCompleteBrief(c, orderId);
    const p = await openPortal(t.server, v1.link);
    await decide(p.customer, p.accessId, approve(v1.version.contentHash));

    await c.post(`/api/orders/${orderId}/change-requests`, { reason: 'Shorter delivery' }).expect(201);
    const draft = await getBrief(c, orderId);
    draft.content.terms.totalPriceKobo = 12_000_000;
    await saveBrief(c, orderId, draft.content, draft.revision);
    const v2 = (await publish(c, orderId)).body;
    const s2 = await openPortal(t.server, v2.link);
    const declined = await decide(s2.customer, s2.accessId, {
      decision: 'DECLINE',
      name: 'Ada Okafor',
      comment: 'Too expensive, keep the original.',
      contentHash: v2.version.contentHash,
    });
    expect(declined.body.state).toBe('DECLINED');
    const order = (await c.get(`/api/orders/${orderId}`).expect(200)).body;
    expect(order.activeVersion.number).toBe(1);
    expect(order.activeVersion.totalPriceKobo).toBe(8_500_000);
    expect(order.agreementStatus).toBe('APPROVED');
    expect((await getBrief(c, orderId)).content.terms.totalPriceKobo).toBe(8_500_000);

    // A studio-withdrawn proposal also leaves V1 in force and kills its link.
    await c.post(`/api/orders/${orderId}/change-requests`, { reason: 'Add lining' }).expect(201);
    const d2 = await getBrief(c, orderId);
    d2.content.fields.lining.value = 'Silk lining';
    await saveBrief(c, orderId, d2.content, d2.revision);
    const v3 = (await publish(c, orderId)).body;
    const crs = (await c.get(`/api/orders/${orderId}/change-requests`).expect(200)).body;
    await c.post(`/api/orders/${orderId}/change-requests/${crs[0].id}/decline`, { note: 'Not needed after all' }).expect(200);
    const s3 = await openPortal(t.server, v3.link).catch((e) => e);
    expect(String(s3)).toMatch(/410/);
    expect((await c.get(`/api/orders/${orderId}`)).body.activeVersion.number).toBe(1);
  });

  it('renewed change-request access cannot decide approvals and expires with the agreement it points to', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const v1 = await publishCompleteBrief(c, orderId);
    const p = await openPortal(t.server, v1.link);
    await decide(p.customer, p.accessId, approve(v1.version.contentHash));
    const changeLink = (await c.post(`/api/orders/${orderId}/links/change`, {}).expect(201)).body;
    expect(changeLink.purpose).toBe('CHANGE_REQUEST');
    const s = await openPortal(t.server, changeLink);
    const view = await review(s.customer, s.accessId);
    expect(view.state).toBe('VIEW');
    expect(view.permissions.canDecide).toBe(false);
    expect(view.permissions.canRequestChange).toBe(true);
    const forbidden = await decide(s.customer, s.accessId, approve(v1.version.contentHash), 403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  it('keeps exact money arithmetic through refunds, reversals and credit due', async () => {
    const { client: c } = await createOwner(t.server);
    const { orderId } = await createOrder(c);
    const v1 = await publishCompleteBrief(c, orderId);
    const p = await openPortal(t.server, v1.link);
    await decide(p.customer, p.accessId, approve(v1.version.contentHash));
    const pay = (kind: string, amountKobo: number, key: string) =>
      c.post(`/api/orders/${orderId}/payments`, { kind, amountKobo, receivedOn: futureDate(0), idempotencyKey: key }).expect(201);
    await pay('DEPOSIT', 3_000_000, 'key-deposit-1');
    const afterPayment = (await pay('PAYMENT', 6_000_050, 'key-payment-1')).body;
    expect(afterPayment.received.netKobo).toBe(9_000_050);
    expect(afterPayment.balanceDueKobo).toBe(0);
    expect(afterPayment.creditDueKobo).toBe(500_050);
    const afterRefund = (await pay('REFUND', 500_050, 'key-refund-1')).body;
    expect(afterRefund.creditDueKobo).toBe(0);
    expect(afterRefund.balanceDueKobo).toBe(0);

    const paymentEntry = afterRefund.entries.find((e: { kind: string }) => e.kind === 'PAYMENT');
    const reversed = (
      await c
        .post(`/api/orders/${orderId}/payments/${paymentEntry.id}/reverse`, { note: 'Entered twice by mistake', idempotencyKey: 'key-reversal-1' })
        .expect(201)
    ).body;
    expect(reversed.received.netKobo).toBe(2_499_950); // 3,000,000 + 6,000,050 − 500,050 − 6,000,050
    expect(reversed.balanceDueKobo).toBe(6_000_050);
    expect(reversed.entries).toHaveLength(4);
    const again = await c
      .post(`/api/orders/${orderId}/payments/${paymentEntry.id}/reverse`, { note: 'Again', idempotencyKey: 'key-reversal-2' })
      .expect(409);
    expect(again.body.error.code).toBe('INVALID_STATE');
    await expect(t.prisma.manualPayment.delete({ where: { id: paymentEntry.id } })).rejects.toThrow();
  });
});
