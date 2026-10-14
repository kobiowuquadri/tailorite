// GENERATED FILE — do not edit. Source of truth: tailorite-backend/src/contracts.
// Run `pnpm contracts:sync` after changing the backend contracts.
import { z } from 'zod';
import type { StudioDto } from './studio';

const Email = z
  .email('Enter a valid email address')
  .max(254)
  .transform((v) => v.trim().toLowerCase());

export const PASSWORD_MIN = 10;

export const RegisterInput = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: Email,
  password: z
    .string()
    .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
    .max(128, 'Use at most 128 characters'),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: Email,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof LoginInput>;

export type SessionUserDto = {
  id: string;
  name: string;
  email: string;
  isDemo: boolean;
};

export type SessionDto = {
  user: SessionUserDto;
  studio: StudioDto | null;
  role: 'OWNER' | 'STAFF' | null;
  expiresAt: string;
};
