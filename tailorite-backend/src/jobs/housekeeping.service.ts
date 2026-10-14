import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RateLimitService } from '../common/security/rate-limit.service.js';
import { DemoPurgeService } from '../demo/demo-purge.service.js';
import { logger } from '../common/logging/json-logger.js';

/** Periodic cleanup of data that is no longer usable. Never touches agreement history. */
@Injectable()
export class HousekeepingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimits: RateLimitService,
    private readonly demoPurge: DemoPurgeService,
  ) {}

  async run(): Promise<void> {
    const now = new Date();
    const sessions = await this.prisma.session.deleteMany({
      where: { OR: [{ absoluteExpiresAt: { lt: now } }, { revokedAt: { lt: new Date(now.getTime() - 86_400_000) } }] },
    });
    const buckets = await this.rateLimits.purgeExpired();
    const heartbeats = await this.prisma.workerHeartbeat.deleteMany({ where: { lastSeenAt: { lt: new Date(now.getTime() - 86_400_000) } } });
    const sandboxes = await this.demoPurge.purgeExpiredSandboxes();
    logger().event('info', 'housekeeping', {
      sessions: sessions.count,
      rateLimitBuckets: buckets,
      heartbeats: heartbeats.count,
      demoSandboxes: sandboxes,
    });
  }
}
