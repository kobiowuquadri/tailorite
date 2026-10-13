import { z } from 'zod';
import { optionalText } from './common.js';

export const MeasurementUnit = z.enum(['INCH', 'CM']);
export type MeasurementUnit = z.infer<typeof MeasurementUnit>;

export const MEASUREMENT_UNIT_LABELS: Record<MeasurementUnit, string> = {
  INCH: 'Inches',
  CM: 'Centimetres',
};
export const MEASUREMENT_UNIT_SHORT: Record<MeasurementUnit, string> = { INCH: 'in', CM: 'cm' };

/** Time zones offered in the UI. The API accepts any valid IANA zone. */
export const COMMON_TIME_ZONES = [
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Abidjan',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Europe/London',
  'America/New_York',
] as const;

export const SUPPORTED_CURRENCIES = ['NGN'] as const;

const studioFields = {
  studioName: z.string().trim().min(2, 'Enter the studio name').max(80),
  ownerName: z.string().trim().min(2, 'Enter the owner name').max(80),
  phone: optionalText(32),
  email: z
    .union([z.literal(''), z.email('Enter a valid email address').max(254)])
    .nullable()
    .optional()
    .transform((v) => (v ? v.trim().toLowerCase() : null)),
  city: optionalText(80),
  measurementUnit: MeasurementUnit,
  timeZone: z.string().trim().min(3).max(64).default('Africa/Lagos'),
  currency: z.enum(SUPPORTED_CURRENCIES).default('NGN'),
};

export const OnboardingInput = z.object(studioFields);
export type OnboardingInput = z.infer<typeof OnboardingInput>;

export const UpdateStudioInput = z.object(studioFields).partial();
export type UpdateStudioInput = z.infer<typeof UpdateStudioInput>;

export type StudioDto = {
  id: string;
  name: string;
  ownerName: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  currency: 'NGN';
  timeZone: string;
  measurementUnit: MeasurementUnit;
  isDemo: boolean;
  createdAt: string;
};

export type AiStatusDto = {
  mode: 'live' | 'fixture' | 'off';
  available: boolean;
  label: string;
  message: string;
  models: { extraction: string; transcription: string } | null;
  limits: { jobsPerDay: number; usedToday: number; maxSourcesPerJob: number };
  /** Whether a background worker has reported in within the last minute. */
  worker: { online: boolean; lastSeenAt: string | null };
};

/** Pricing is a hypothesis; billing is not active in this release. */
export const PRICING_HYPOTHESIS = {
  freeApprovedOrders: 3,
  proposedPricePerApprovedOrderKobo: 50_000,
  billingActive: false,
} as const;

export type UsageDto = {
  approvedOrders: number;
  freeApprovedOrdersRemaining: number;
  /** What would be billed under the proposed pricing (not charged — billing is inactive). */
  hypotheticalChargeKobo: number;
  ordersCreated: number;
  customers: number;
  aiJobsToday: number;
  aiJobsLast30Days: number;
  storageBytes: number;
  pricing: typeof PRICING_HYPOTHESIS;
};
