import { z } from 'zod';
import { IsoDate, optionalText, PaginationQuery } from './common.js';
import { MeasurementUnit } from './studio.js';

/** Common measurement fields offered in forms. None is mandatory; custom labels are allowed. */
export const COMMON_MEASUREMENTS = [
  { key: 'bust', label: 'Bust' },
  { key: 'underbust', label: 'Underbust' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'shoulder', label: 'Shoulder width' },
  { key: 'sleeveLength', label: 'Sleeve length' },
  { key: 'upperArm', label: 'Upper arm (round)' },
  { key: 'wrist', label: 'Wrist (round)' },
  { key: 'neck', label: 'Neck (round)' },
  { key: 'napeToWaist', label: 'Nape to waist' },
  { key: 'shoulderToFloor', label: 'Shoulder to floor' },
  { key: 'waistToFloor', label: 'Waist to floor' },
  { key: 'thigh', label: 'Thigh (round)' },
  { key: 'inseam', label: 'Inseam' },
  { key: 'height', label: 'Height' },
] as const;

export const MeasurementValue = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,47}$/, 'Invalid measurement key'),
  label: z.string().trim().min(1, 'Enter a label').max(60),
  value: z.number('Enter a number').positive('Must be greater than zero').max(500, 'Value looks too large'),
});
export type MeasurementValue = z.infer<typeof MeasurementValue>;

const uniqueKeys = (values: { key: string }[]) => new Set(values.map((v) => v.key)).size === values.length;

export const MeasurementProfileInput = z.object({
  unit: MeasurementUnit,
  recordedOn: IsoDate,
  takenBy: optionalText(80),
  notes: optionalText(500),
  values: z
    .array(MeasurementValue)
    .min(1, 'Add at least one measurement')
    .max(40)
    .refine(uniqueKeys, 'Each measurement can only appear once'),
});
export type MeasurementProfileInput = z.infer<typeof MeasurementProfileInput>;

export type MeasurementProfileDto = {
  unit: MeasurementUnit;
  recordedOn: string;
  takenBy: string | null;
  notes: string | null;
  values: MeasurementValue[];
  updatedAt: string;
};

export const CustomerInput = z.object({
  name: z.string().trim().min(2, 'Enter the customer name').max(100),
  phone: optionalText(32),
  email: z
    .union([z.literal(''), z.email('Enter a valid email address').max(254)])
    .nullable()
    .optional()
    .transform((v) => (v ? v.trim().toLowerCase() : null)),
  notes: optionalText(1000),
});
export type CustomerInput = z.infer<typeof CustomerInput>;

export const CustomerListQuery = PaginationQuery.extend({
  search: z.string().trim().max(100).optional(),
});
export type CustomerListQuery = z.infer<typeof CustomerListQuery>;

export type CustomerSummaryDto = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  orderCount: number;
  hasMeasurements: boolean;
  isSynthetic: boolean;
  updatedAt: string;
};

export type CustomerDto = CustomerSummaryDto & {
  notes: string | null;
  createdAt: string;
  measurementProfile: MeasurementProfileDto | null;
};
