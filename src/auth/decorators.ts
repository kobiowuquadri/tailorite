import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { AppRequest, AuthContext } from '../common/http/request-context.js';
import { Errors } from '../common/errors/app-error.js';

export const IS_PUBLIC = 'tailorite:isPublic';
export const ALLOW_WITHOUT_STUDIO = 'tailorite:allowWithoutStudio';

/** Route does not require an owner session (landing, login, customer portal, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Signed-in users who have not finished onboarding may call this route. */
export const AllowWithoutStudio = () => SetMetadata(ALLOW_WITHOUT_STUDIO, true);

/** The authenticated context. Only valid on non-public routes. */
export const Auth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw Errors.unauthenticated();
  return req.auth;
});

/**
 * Tenant id derived from the authenticated membership — never from client input.
 * Every tenant-scoped query must be filtered by this value.
 */
export const StudioId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) throw Errors.unauthenticated();
  if (!req.auth.studioId) throw Errors.onboardingRequired();
  return req.auth.studioId;
});

export type Actor =
  | { type: 'USER'; userId: string; label: string }
  | { type: 'CUSTOMER'; label: string }
  | { type: 'SYSTEM'; label?: string };

export type UserActor = Extract<Actor, { type: 'USER' }>;

export function actorOf(auth: AuthContext): UserActor {
  return { type: 'USER', userId: auth.userId, label: auth.userName };
}
