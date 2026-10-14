import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256-bit URL-safe random token (session cookies, customer links). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens are high-entropy, so a fast hash is appropriate for at-rest storage. */
export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacBase64Url(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
