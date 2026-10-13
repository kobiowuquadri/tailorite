import { compareBriefs, type BriefContent } from '../contracts/brief.js';
import {
  whatsappShareUrl,
  type PortalAccessPurpose,
  type ShareLinkDto,
  type SnapshotReference,
  type VersionComparisonDto,
  type VersionSnapshot,
} from '../contracts/approvals.js';
import { orderReference } from '../contracts/orders.js';
import { contentHash } from '../common/canonical-json.js';
import { diffDays } from '../common/time/dates.js';

export function buildSnapshot(input: {
  order: { id: string; orderNumber: number; title: string };
  studio: { name: string; phone: string | null; email: string | null; city: string | null; timeZone: string };
  customerName: string;
  versionNumber: number;
  kind: 'INITIAL' | 'REVISION';
  basedOnVersionNumber: number | null;
  brief: BriefContent;
  references: SnapshotReference[];
  change: VersionSnapshot['change'];
  publishedAt: Date;
}): { snapshot: VersionSnapshot; hash: string } {
  const snapshot: VersionSnapshot = {
    schemaVersion: 1,
    order: {
      id: input.order.id,
      number: input.order.orderNumber,
      reference: orderReference(input.order.orderNumber),
      title: input.order.title,
    },
    studio: {
      name: input.studio.name,
      phone: input.studio.phone,
      email: input.studio.email,
      city: input.studio.city,
      currency: 'NGN',
      timeZone: input.studio.timeZone,
    },
    customer: { name: input.customerName },
    version: { number: input.versionNumber, kind: input.kind, basedOnVersionNumber: input.basedOnVersionNumber },
    brief: input.brief,
    references: input.references,
    change: input.change,
    publishedAt: input.publishedAt.toISOString(),
  };
  return { snapshot, hash: contentHash(snapshot) };
}

/** Field-level comparison of an approved brief and a proposal, with money and date consequences. */
export function buildComparison(
  base: { versionNumber: number; brief: BriefContent },
  proposed: { label: string; brief: BriefContent },
  reason: string | null,
): VersionComparisonDto {
  const terms = (b: BriefContent) => ({
    totalPriceKobo: b.terms.totalPriceKobo,
    depositRequiredKobo: b.terms.depositRequiredKobo,
    deliveryDate: b.terms.deliveryDate,
    fittingDate: b.terms.fittingDate,
  });
  const before = terms(base.brief);
  const after = terms(proposed.brief);
  return {
    baseVersionNumber: base.versionNumber,
    proposedLabel: proposed.label,
    before,
    after,
    priceDifferenceKobo:
      before.totalPriceKobo !== null && after.totalPriceKobo !== null ? after.totalPriceKobo - before.totalPriceKobo : null,
    deliveryShiftDays: before.deliveryDate && after.deliveryDate ? diffDays(before.deliveryDate, after.deliveryDate) : null,
    // Price and dates are shown separately above the field list.
    fields: compareBriefs(base.brief, proposed.brief).filter((c) => !c.key.startsWith('terms.')),
    reason,
  };
}

export function buildShareLink(input: {
  appOrigin: string;
  accessId: string;
  token: string;
  purpose: PortalAccessPurpose;
  expiresAt: Date;
  versionNumber: number;
  kind: 'INITIAL' | 'REVISION';
  customerName: string;
  customerPhone: string | null;
  studioName: string;
  title: string;
}): ShareLinkDto {
  // The token travels in the URL fragment: browsers never send it to servers, logs or referrers.
  const url = `${input.appOrigin}/review/${input.accessId}#${input.token}`;
  const firstName = input.customerName.split(/\s+/)[0] || input.customerName;
  const expires = input.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
  let body: string;
  if (input.purpose === 'CHANGE_REQUEST') {
    body = `You can view your approved ${input.title} and ask for a change here:`;
  } else if (input.kind === 'REVISION') {
    body = `We've prepared the change to your ${input.title} (version ${input.versionNumber}), including any price and delivery date changes. Please review it and approve, or tell us what to change:`;
  } else {
    body = `Here is the summary of your ${input.title} (version ${input.versionNumber}): the design details, price and delivery date. Please review it and approve, or tell us what to change:`;
  }
  const messageText = `Hello ${firstName}, this is ${input.studioName}. ${body}\n${url}\n\nThis link is personal to you and expires on ${expires}.`;
  return {
    accessId: input.accessId,
    purpose: input.purpose,
    versionNumber: input.versionNumber,
    url,
    expiresAt: input.expiresAt.toISOString(),
    messageText,
    whatsappUrl: whatsappShareUrl(messageText, input.customerPhone),
  };
}
