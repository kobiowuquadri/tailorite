import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Errors } from '../errors/app-error.js';
import { sha256Hex } from './tokens.js';

export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  loginPerIp: { limit: 20, windowSeconds: 15 * 60 },
  loginPerEmail: { limit: 8, windowSeconds: 15 * 60 },
  registerPerIp: { limit: 10, windowSeconds: 60 * 60 },
  portalExchangePerIp: { limit: 30, windowSeconds: 15 * 60 },
  portalDecisionPerAccess: { limit: 10, windowSeconds: 15 * 60 },
  portalChangePerAccess: { limit: 10, windowSeconds: 60 * 60 },
  uploadsPerStudio: { limit: 120, windowSeconds: 60 * 60 },
  extractionPerStudio: { limit: 20, windowSeconds: 60 * 60 },
  demoPerIp: { limit: 6, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window counters in PostgreSQL, shared by every API instance (no Redis required).
 * Keys are hashed so IPs/emails are not stored in clear text.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async consume(scope: string, subject: string, rule: RateLimitRule): Promise<void> {
    const now = Date.now();
    const windowMs = rule.windowSeconds * 1000;
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const expiresAt = new Date(windowStart.getTime() + windowMs);
    const key = `${scope}:${sha256Hex(subject).slice(0, 32)}`;

    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
      VALUES (${key}, ${windowStart}, 1, ${expiresAt})
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
      RETURNING "count"`;
    const count = Number(rows[0]?.count ?? 1);
    if (count > rule.limit) {
      throw Errors.rateLimited(Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)));
    }
  }

  /** Housekeeping: drop expired windows. */
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return result.count;
  }
}
