import type { Server } from 'node:http';
import { client, type Client } from './app.js';
import { completeBrief, getBrief, saveBrief } from './fixtures.js';

export type ShareLink = { accessId: string; url: string; expiresAt: string; messageText: string; whatsappUrl: string };

export function parseLink(link: ShareLink) {
  const [path, token] = link.url.split('#');
  return { accessId: path.split('/review/')[1], token };
}

/** A fresh browser (no studio session) that opens the customer link. */
export async function openPortal(server: Server, link: ShareLink) {
  const customer = client(server);
  const { accessId, token } = parseLink(link);
  await customer.post(`/api/portal/${accessId}/session`, { token }).expect(200);
  return { customer, accessId };
}

export async function review(customer: Client, accessId: string) {
  return (await customer.get(`/api/portal/${accessId}/review`).expect(200)).body;
}

export async function publish(c: Client, orderId: string, expected = 201) {
  const brief = await getBrief(c, orderId);
  return c
    .post(`/api/orders/${orderId}/versions`, { expectedRevision: brief.revision, idempotencyKey: crypto.randomUUID() })
    .expect(expected);
}

/** Owner → complete brief → publish V1. Returns the share link. */
export async function publishCompleteBrief(c: Client, orderId: string, opts: { referenceId?: string } = {}) {
  await saveBrief(c, orderId, completeBrief(opts));
  const res = await publish(c, orderId);
  return res.body as { version: { id: string; number: number; contentHash: string }; link: ShareLink };
}

export async function decide(customer: Client, accessId: string, body: Record<string, unknown>, expected = 200) {
  return customer.post(`/api/portal/${accessId}/decision`, body).expect(expected);
}
