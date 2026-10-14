import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { UserActor } from '../auth/decorators.js';
import { CustomersService } from '../customers/customers.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { SourcesService } from '../sources/sources.service.js';
import { BriefsService } from '../briefs/briefs.service.js';
import { PublicationService } from '../approvals/publication.service.js';
import { PortalService } from '../portal/portal.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { BriefContent, type TextFieldKey } from '../contracts/brief.js';
import type { MeasurementValue } from '../contracts/customers.js';
import { addDays, todayInZone } from '../common/time/dates.js';
import { DEMO, DEMO_AUDIO_FILE, DEMO_IMAGE_FILE } from './demo-content.js';

type OtherOrder = {
  customer: string;
  phone: string;
  title: string;
  garmentType: string;
  message: string;
  fields: Partial<Record<TextFieldKey, string>>;
  priceNaira: number;
  depositNaira: number;
  deliveryInDays: number;
  measurements: MeasurementValue[] | 'AT_FITTING';
  target: 'READY' | 'AWAITING' | 'APPROVED_CHANGE_REQUESTED' | 'IN_PROGRESS_DUE_SOON' | 'COMPLETED';
};

const ADA_MEASUREMENTS: MeasurementValue[] = [
  { key: 'bust', label: 'Bust', value: 36 },
  { key: 'underbust', label: 'Underbust', value: 31 },
  { key: 'waist', label: 'Waist', value: 29 },
  { key: 'hips', label: 'Hips', value: 40 },
  { key: 'shoulder', label: 'Shoulder width', value: 15.5 },
  { key: 'sleeveLength', label: 'Sleeve length', value: 23 },
  { key: 'upperArm', label: 'Upper arm (round)', value: 11 },
  { key: 'shoulderToFloor', label: 'Shoulder to floor', value: 58 },
];

/** Five more fictional orders so the dashboard shows every workflow state with real records. */
const OTHER_ORDERS: OtherOrder[] = [
  {
    customer: 'Chioma Eze',
    phone: '08030000001',
    title: 'Aso-ebi iro and buba',
    garmentType: 'Iro and buba',
    message: 'Gold and wine aso-ebi for my cousin’s wedding. Loose buba, wrapper with a neat fold. No sequins please.',
    fields: { overallStyle: 'Classic iro and buba', neckline: 'Round neckline', sleeves: 'Wide three-quarter sleeves', length: 'Ankle-length wrapper', fit: 'Relaxed buba, wrapper tied at the waist', fabric: 'Customer’s aso-oke and lace', color: 'Gold and wine' },
    priceNaira: 45_000,
    depositNaira: 20_000,
    deliveryInDays: 18,
    measurements: [
      { key: 'bust', label: 'Bust', value: 38 },
      { key: 'waist', label: 'Waist', value: 32 },
      { key: 'hips', label: 'Hips', value: 42 },
    ],
    target: 'READY',
  },
  {
    customer: 'Tunde Bakare',
    phone: '08030000002',
    title: 'Wedding agbada',
    garmentType: 'Agbada',
    message: 'Cream agbada with matching cap for my wedding. Simple embroidery on the chest only.',
    fields: { overallStyle: 'Three-piece agbada with fila', neckline: 'Round neck with placket', sleeves: 'Full agbada sleeves', length: 'Full length', fit: 'Relaxed', fabric: 'Cashmere-blend (studio sources)', color: 'Cream', embellishments: 'Tone-on-tone embroidery on the chest' },
    priceNaira: 120_000,
    depositNaira: 60_000,
    deliveryInDays: 25,
    measurements: [
      { key: 'shoulder', label: 'Shoulder width', value: 19 },
      { key: 'sleeveLength', label: 'Sleeve length', value: 26 },
      { key: 'neck', label: 'Neck (round)', value: 16 },
    ],
    target: 'AWAITING',
  },
  {
    customer: 'Grace Adeyemi',
    phone: '08030000003',
    title: 'Reception gown',
    garmentType: 'Evening gown',
    message: 'Emerald reception gown, off-shoulder, with a short train.',
    fields: { overallStyle: 'Mermaid reception gown', neckline: 'Off-shoulder', sleeves: 'Not applicable', length: 'Floor length with a short train', fit: 'Fitted to the knee', fabric: 'Satin (studio sources)', color: 'Emerald green' },
    priceNaira: 150_000,
    depositNaira: 75_000,
    deliveryInDays: 30,
    measurements: 'AT_FITTING',
    target: 'APPROVED_CHANGE_REQUESTED',
  },
  {
    customer: 'Halima Musa',
    phone: '08030000004',
    title: 'Embroidered kaftan',
    garmentType: 'Kaftan',
    message: 'Navy kaftan with white embroidery at the neck and cuffs, side pockets.',
    fields: { overallStyle: 'Straight kaftan', neckline: 'Mandarin collar', sleeves: 'Long, straight', length: 'Ankle length', fit: 'Straight', fabric: 'Linen (customer provides)', color: 'Navy', embellishments: 'White embroidery at neck and cuffs', specialRequests: 'Two side pockets' },
    priceNaira: 35_000,
    depositNaira: 20_000,
    deliveryInDays: 5,
    measurements: [
      { key: 'shoulder', label: 'Shoulder width', value: 17 },
      { key: 'sleeveLength', label: 'Sleeve length', value: 24 },
    ],
    target: 'IN_PROGRESS_DUE_SOON',
  },
  {
    customer: 'Ngozi Obi',
    phone: '08030000005',
    title: 'Senator suit',
    garmentType: 'Senator suit',
    message: 'Charcoal senator suit for church, slim trousers.',
    fields: { overallStyle: 'Two-piece senator suit', neckline: 'Round neck', sleeves: 'Long sleeves', length: 'Tunic to mid-thigh', fit: 'Slim', fabric: 'Wool blend (studio sources)', color: 'Charcoal' },
    priceNaira: 40_000,
    depositNaira: 20_000,
    deliveryInDays: 2,
    measurements: [
      { key: 'shoulder', label: 'Shoulder width', value: 18 },
      { key: 'waist', label: 'Waist', value: 34 },
      { key: 'inseam', label: 'Inseam', value: 31 },
    ],
    target: 'COMPLETED',
  },
];

/**
 * Builds the synthetic demonstration scenario through the real services, so every record obeys
 * the same rules as user-created data. All people and studios are fictional and flagged synthetic.
 */
@Injectable()
export class DemoScenarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly orders: OrdersService,
    private readonly sources: SourcesService,
    private readonly briefs: BriefsService,
    private readonly publication: PublicationService,
    private readonly portal: PortalService,
    private readonly payments: PaymentsService,
  ) {}

  async build(studioId: string, actor: UserActor): Promise<{ demoOrderId: string }> {
    const today = todayInZone('Africa/Lagos');
    const demoOrderId = await this.buildAdaOrder(studioId, actor, today);
    for (const spec of OTHER_ORDERS) await this.buildOtherOrder(studioId, actor, today, spec);
    await this.prisma.customer.updateMany({ where: { studioId }, data: { isSynthetic: true } });
    await this.prisma.order.updateMany({ where: { studioId }, data: { isSynthetic: true } });
    await this.prisma.sourceAsset.updateMany({ where: { studioId }, data: { isSynthetic: true } });
    return { demoOrderId };
  }

  /** The order the five-minute demo is built around: sources only, ready for AI processing. */
  private async buildAdaOrder(studioId: string, actor: UserActor, today: string): Promise<string> {
    const ada = await this.customers.create(studioId, actor, {
      name: DEMO.customerName,
      phone: DEMO.customerPhone,
      email: null,
      notes: 'Fictional customer for the Tailorite demonstration.',
    });
    await this.customers.saveMeasurements(studioId, actor, ada.id, {
      unit: 'INCH',
      recordedOn: addDays(today, -3),
      takenBy: 'Amina (synthetic demo values)',
      notes: 'Synthetic demonstration values — not a real person.',
      values: ADA_MEASUREMENTS,
    });
    const order = await this.orders.create(studioId, actor, {
      customerId: ada.id,
      title: DEMO.orderTitle,
      garmentType: DEMO.garmentType,
    });
    await this.sources.addText(studioId, actor, order.id, {
      text: DEMO.textA,
      label: 'Message from Ada',
      sender: 'Ada Okafor (WhatsApp)',
      context: 'Selected messages, 10 Oct',
      idempotencyKey: undefined,
    });
    if (existsSync(DEMO_AUDIO_FILE)) {
      const buffer = readFileSync(DEMO_AUDIO_FILE);
      await this.sources.addFile(studioId, actor, order.id, { buffer, originalname: 'voice-note-ada.wav', size: buffer.length }, {
        label: 'Voice note from Ada',
        sender: 'Ada Okafor (WhatsApp)',
        context: 'Sent two days after the message',
        origin: 'UPLOADED',
        idempotencyKey: undefined,
      });
    }
    if (existsSync(DEMO_IMAGE_FILE)) {
      const buffer = readFileSync(DEMO_IMAGE_FILE);
      await this.sources.addFile(studioId, actor, order.id, { buffer, originalname: 'reference-navy-gown.png', size: buffer.length }, {
        label: 'Reference picture',
        sender: 'Ada Okafor (WhatsApp)',
        context: 'Inspiration picture',
        origin: 'UPLOADED',
        idempotencyKey: undefined,
      });
    }
    // The tailor has already priced the work and taken measurements; design details come from the sources.
    const brief = await this.briefs.get(studioId, order.id);
    const content = brief.content;
    content.terms = {
      totalPriceKobo: 8_500_000,
      depositRequiredKobo: 3_000_000,
      deliveryDate: addDays(today, 21),
      fittingDate: null,
      paymentNote: 'Deposit before cutting; balance on collection.',
    };
    const saved = await this.briefs.save(studioId, actor, order.id, {
      expectedRevision: brief.revision,
      content,
      internalNotes: 'Demo order. Price and delivery date agreed by phone.',
    });
    await this.briefs.copyMeasurements(studioId, actor, order.id, { expectedRevision: saved.revision, keys: [] });
    return order.id;
  }

  private async buildOtherOrder(studioId: string, actor: UserActor, today: string, spec: OtherOrder) {
    const customer = await this.customers.create(studioId, actor, { name: spec.customer, phone: spec.phone, email: null, notes: null });
    const order = await this.orders.create(studioId, actor, { customerId: customer.id, title: spec.title, garmentType: spec.garmentType });
    await this.sources.addText(studioId, actor, order.id, {
      text: spec.message,
      label: 'Message 1',
      sender: `${spec.customer} (WhatsApp)`,
      context: null,
      idempotencyKey: undefined,
    });
    const draft = await this.briefs.get(studioId, order.id);
    const content = BriefContent.parse({
      fields: Object.fromEntries(
        Object.entries({ garmentType: spec.garmentType, ...spec.fields }).map(([key, value]) => [
          key,
          value === 'Not applicable'
            ? { value: null, notApplicable: true, note: 'Strapless design', evidence: [], origin: 'MANUAL' }
            : { value, notApplicable: false, note: null, evidence: [], origin: 'MANUAL' },
        ]),
      ),
      fabricSupplier: /customer/i.test(spec.fields.fabric ?? '') ? 'CUSTOMER' : 'STUDIO',
      exclusions: /no sequins/i.test(spec.message) ? [{ id: 'nosequins', text: 'No sequins', evidence: [], origin: 'MANUAL' }] : [],
      measurements:
        spec.measurements === 'AT_FITTING'
          ? { mode: 'AT_FITTING', fittingNote: 'Bring the shoes you will wear' }
          : { mode: 'MEASURED', unit: 'INCH', values: spec.measurements, recordedOn: addDays(today, -7) },
      terms: {
        totalPriceKobo: spec.priceNaira * 100,
        depositRequiredKobo: spec.depositNaira * 100,
        deliveryDate: addDays(today, spec.deliveryInDays),
        fittingDate: spec.measurements === 'AT_FITTING' ? addDays(today, 7) : null,
      },
    });
    await this.briefs.save(studioId, actor, order.id, { expectedRevision: draft.revision, content, internalNotes: null });
    if (spec.target === 'READY') return;

    const latest = await this.briefs.get(studioId, order.id);
    const published = await this.publication.publish(studioId, actor, order.id, {
      expectedRevision: latest.revision,
      idempotencyKey: randomUUID(),
      linkTtlDays: 14,
    });
    if (spec.target === 'AWAITING') return;

    const accessId = published.link.accessId;
    await this.portal.decide(
      accessId,
      { decision: 'APPROVE', name: spec.customer, confirmed: true, contentHash: published.version.contentHash },
      { userAgent: 'Tailorite demo seed' },
    );
    if (spec.target === 'APPROVED_CHANGE_REQUESTED') {
      await this.portal.requestChange(accessId, { name: spec.customer, message: 'Could the train be a little longer, about 30 cm?' });
      return;
    }
    await this.payments.record(studioId, actor, order.id, {
      kind: 'DEPOSIT',
      amountKobo: spec.depositNaira * 100,
      receivedOn: addDays(today, -2),
      method: 'Bank transfer',
      note: null,
      idempotencyKey: `seed-deposit-${order.id}`,
    });
    await this.orders.transitionProduction(studioId, actor, order.id, { to: 'IN_PROGRESS' });
    if (spec.target === 'COMPLETED') {
      await this.orders.transitionProduction(studioId, actor, order.id, { to: 'READY_FOR_COLLECTION' });
      await this.payments.record(studioId, actor, order.id, {
        kind: 'PAYMENT',
        amountKobo: (spec.priceNaira - spec.depositNaira) * 100,
        receivedOn: today,
        method: 'Cash',
        note: 'Balance paid on collection',
        idempotencyKey: `seed-balance-${order.id}`,
      });
      await this.orders.transitionProduction(studioId, actor, order.id, { to: 'COMPLETED' });
    }
  }
}
