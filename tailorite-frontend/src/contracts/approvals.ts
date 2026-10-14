// GENERATED FILE — do not edit. Source of truth: tailorite-backend/src/contracts.
// Run `pnpm contracts:sync` after changing the backend contracts.
import { z } from 'zod';
import { IdempotencyKey } from './common';
import type { BriefContent, FieldChange, PresentedSection } from './brief';
import type { DecisionDto, VersionSummaryDto } from './orders';

// ─────────────────────────────────────────────── publication & links

export const PublishInput = z.object({
  expectedRevision: z.number().int().min(1),
  idempotencyKey: IdempotencyKey,
  linkTtlDays: z.number().int().min(1).max(30).optional(),
});
export type PublishInput = z.infer<typeof PublishInput>;

export const CreateLinkInput = z.object({
  ttlDays: z.number().int().min(1).max(30).optional(),
});
export type CreateLinkInput = z.infer<typeof CreateLinkInput>;

export type PortalAccessPurpose = 'APPROVAL' | 'CHANGE_REQUEST';

/** Returned once when a link is created. The raw token is never stored or shown again. */
export type ShareLinkDto = {
  accessId: string;
  purpose: PortalAccessPurpose;
  versionNumber: number;
  url: string;
  expiresAt: string;
  messageText: string;
  whatsappUrl: string;
};

export type PortalAccessDto = {
  id: string;
  purpose: PortalAccessPurpose;
  versionNumber: number;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
};

export type PublishResultDto = { version: VersionSummaryDto; link: ShareLinkDto };

/** Builds a WhatsApp "click to chat" URL. Opening it does not send anything by itself. */
export function whatsappShareUrl(text: string, phone?: string | null): string {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  let international = '';
  if (digits.startsWith('+')) international = digits.slice(1);
  else if (digits.startsWith('234')) international = digits;
  else if (digits.startsWith('0') && digits.length === 11) international = `234${digits.slice(1)}`;
  const base = international.length >= 10 ? `https://wa.me/${international}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

// ─────────────────────────────────────────────── snapshot

export type SnapshotReference = {
  sourceId: string;
  label: string;
  note: string | null;
  mimeType: string;
  width: number | null;
  height: number | null;
};

/** Complete, immutable agreement content stored in BriefVersion.snapshot. */
export type VersionSnapshot = {
  schemaVersion: 1;
  order: { id: string; number: number; reference: string; title: string };
  studio: {
    name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    currency: 'NGN';
    timeZone: string;
  };
  customer: { name: string };
  version: { number: number; kind: 'INITIAL' | 'REVISION'; basedOnVersionNumber: number | null };
  brief: BriefContent;
  references: SnapshotReference[];
  change: {
    reason: string | null;
    baseVersionNumber: number;
    previousTotalKobo: number;
    previousDeliveryDate: string;
    priceAdjustmentKobo: number;
  } | null;
  publishedAt: string;
};

export type VersionDetailDto = VersionSummaryDto & {
  order: { id: string; reference: string; title: string };
  studio: VersionSnapshot['studio'];
  customerName: string;
  sections: PresentedSection[];
  /** Internal brief content including evidence (studio only). */
  brief: BriefContent;
  references: (SnapshotReference & { previewUrl: string })[];
  change: VersionSnapshot['change'];
  comparisonToBase: VersionComparisonDto | null;
};

export type VersionComparisonDto = {
  baseVersionNumber: number;
  proposedLabel: string;
  before: { totalPriceKobo: number | null; depositRequiredKobo: number | null; deliveryDate: string | null; fittingDate: string | null };
  after: { totalPriceKobo: number | null; depositRequiredKobo: number | null; deliveryDate: string | null; fittingDate: string | null };
  priceDifferenceKobo: number | null;
  deliveryShiftDays: number | null;
  fields: FieldChange[];
  reason: string | null;
};

// ─────────────────────────────────────────────── customer portal

export const PORTAL_CONFIRMATION_TEXT = 'I have reviewed the design details, price, and delivery date.';

export const PortalExchangeInput = z.object({
  accessId: z.uuid(),
  token: z.string().min(20).max(200),
});
export type PortalExchangeInput = z.infer<typeof PortalExchangeInput>;

const CustomerName = z.string().trim().min(2, 'Enter your name').max(80);
const ContentHash = z.string().regex(/^[a-f0-9]{64}$/, 'Invalid version reference');

export const PortalDecisionInput = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('APPROVE'),
    name: CustomerName,
    confirmed: z.literal(true, 'Please confirm you have reviewed the details'),
    contentHash: ContentHash,
  }),
  z.object({
    decision: z.literal('REQUEST_CHANGES'),
    name: CustomerName,
    comment: z.string().trim().min(3, 'Describe the changes you would like').max(2000),
    contentHash: ContentHash,
  }),
  z.object({
    decision: z.literal('DECLINE'),
    name: CustomerName,
    comment: z.string().trim().max(2000).optional(),
    contentHash: ContentHash,
  }),
]);
export type PortalDecisionInput = z.infer<typeof PortalDecisionInput>;

export const PortalChangeRequestInput = z.object({
  name: CustomerName,
  message: z.string().trim().min(3, 'Describe the change you would like').max(2000),
});
export type PortalChangeRequestInput = z.infer<typeof PortalChangeRequestInput>;

export type PortalState =
  | 'PENDING'
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'DECLINED'
  | 'SUPERSEDED'
  | 'WITHDRAWN'
  | 'ORDER_CANCELLED'
  | 'VIEW';

export type PortalReviewDto = {
  access: { id: string; purpose: PortalAccessPurpose; expiresAt: string };
  studio: { name: string; phone: string | null; city: string | null };
  customerName: string;
  order: { reference: string; title: string };
  version: { number: number; kind: 'INITIAL' | 'REVISION'; publishedAt: string; contentHash: string; isActive: boolean };
  activeVersionNumber: number | null;
  state: PortalState;
  stateMessage: string;
  sections: PresentedSection[];
  references: { id: string; label: string; note: string | null; url: string; width: number | null; height: number | null }[];
  terms: {
    totalPriceKobo: number;
    depositRequiredKobo: number;
    deliveryDate: string;
    fittingDate: string | null;
    paymentNote: string | null;
  };
  change: (VersionComparisonDto & { previousVersionNumber: number }) | null;
  decision: DecisionDto | null;
  permissions: { canDecide: boolean; canDecline: boolean; canRequestChange: boolean };
  openChangeRequest: { createdAt: string; messages: { name: string; message: string; at: string }[] } | null;
  confirmationText: string;
  timeZone: string;
};

export type PortalSessionDto = { accessId: string; expiresAt: string };
