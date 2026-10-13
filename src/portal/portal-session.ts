import { randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { hmacBase64Url, safeEqual } from '../common/security/tokens.js';

export const PORTAL_COOKIE = 'tl_portal';

/**
 * Short-lived customer session created by exchanging a link token. The cookie is HMAC-signed,
 * HttpOnly, SameSite=Strict and path-scoped to one access (/api/portal/<accessId>), so two
 * review links in the same browser never interfere. Access status is revalidated per request.
 */
export function signPortalSession(secret: string, accessId: string, expiresAt: Date): string {
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const nonce = randomBytes(9).toString('base64url');
  const sig = hmacBase64Url(secret, `portal.v1|${accessId}|${exp}|${nonce}`);
  return `${exp}.${nonce}.${sig}`;
}

export function verifyPortalSession(secret: string, accessId: string, value: string | undefined): boolean {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [expRaw, nonce, sig] = parts;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return false;
  return safeEqual(sig, hmacBase64Url(secret, `portal.v1|${accessId}|${exp}|${nonce}`));
}

export function portalCookieOptions(accessId: string, secure: boolean, expires: Date): CookieOptions {
  return { httpOnly: true, secure, sameSite: 'strict', path: `/api/portal/${accessId}`, expires };
}

export function setPortalCookie(res: Response, value: string, accessId: string, secure: boolean, expires: Date) {
  res.cookie(PORTAL_COOKIE, value, portalCookieOptions(accessId, secure, expires));
}
