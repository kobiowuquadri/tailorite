import sharp from 'sharp';
import type { Client } from './app.js';
import { createCustomer } from './app.js';

export async function pngBuffer(width = 64, height = 48, color = '#0666ff'): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

/** Random noise compresses badly, which makes it easy to exceed size limits. */
export async function noisyPng(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
  return sharp(raw, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
}

/** 16-bit mono PCM WAV of silence with a correct header (duration is parseable). */
export function wavBuffer(seconds = 1.5, sampleRate = 8000): Buffer {
  const samples = Math.round(seconds * sampleRate);
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'latin1');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'latin1');
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

export function futureDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A complete, publishable brief (the demo scenario's confirmed V1). */
type TestField = { value: string | null; notApplicable: boolean; note: string | null; evidence: unknown[]; origin: string };

export function completeBrief(opts: { referenceId?: string; deliveryInDays?: number } = {}) {
  const field = (value: string): TestField => ({ value, notApplicable: false, note: null, evidence: [], origin: 'MANUAL' });
  const empty = (): TestField => ({ value: null, notApplicable: false, note: null, evidence: [], origin: 'MANUAL' });
  return {
    schemaVersion: 1,
    fields: {
      garmentType: field('Floor-length dress'),
      overallStyle: field('Navy-blue floor-length evening dress'),
      neckline: field('Square neckline'),
      sleeves: field('Elbow-length sleeves'),
      length: field('Floor length'),
      fit: field('Fitted bodice'),
      back: empty(),
      closure: empty(),
      lining: empty(),
      otherDetails: empty(),
      fabric: field('Customer-supplied crepe'),
      color: field('Navy blue'),
      embellishments: field('Light beading around the neckline'),
      specialRequests: empty(),
    },
    fabricSupplier: 'CUSTOMER',
    fabricSupplierNote: null,
    exclusions: [{ id: 'noslit', text: 'No slit', evidence: [], origin: 'MANUAL' }],
    references: opts.referenceId ? [{ sourceId: opts.referenceId, note: 'Neckline shape only' as string | null }] : [],
    measurements: {
      mode: 'MEASURED',
      unit: 'INCH',
      values: [
        { key: 'bust', label: 'Bust', value: 36 },
        { key: 'waist', label: 'Waist', value: 29 },
      ],
      recordedOn: '2026-10-01',
      fittingNote: null,
      notNeededReason: null,
    },
    terms: {
      totalPriceKobo: 8_500_000 as number | null,
      depositRequiredKobo: 3_000_000 as number | null,
      deliveryDate: futureDate(opts.deliveryInDays ?? 21),
      fittingDate: null as string | null,
      paymentNote: null as string | null,
    },
    customerNotes: null,
  };
}

export async function createOrder(c: Client, customerName = 'Ada Okafor') {
  const customer = await createCustomer(c, customerName);
  const res = await c
    .post('/api/orders', { customerId: customer.id, title: 'Navy evening dress', garmentType: 'Dress' })
    .expect(201);
  return { orderId: res.body.id as string, customerId: customer.id };
}

export async function getBrief(c: Client, orderId: string) {
  return (await c.get(`/api/orders/${orderId}/brief`).expect(200)).body;
}

export async function saveBrief(c: Client, orderId: string, content: unknown, expected?: number, status = 200) {
  const revision = expected ?? (await getBrief(c, orderId)).revision;
  return c.put(`/api/orders/${orderId}/brief`, { expectedRevision: revision, content, internalNotes: null }).expect(status);
}
