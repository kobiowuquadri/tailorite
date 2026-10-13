import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { logger } from '../common/logging/json-logger.js';

/**
 * Removes synthetic demo studios. This is the only code that deletes agreement history, and it
 * refuses to touch any studio that is not flagged as a demo.
 */
@Injectable()
export class DemoPurgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async purgeExpiredSandboxes(): Promise<number> {
    const expired = await this.prisma.studio.findMany({
      where: { isDemo: true, demoSeedKey: null, demoExpiresAt: { lt: new Date() } },
      select: { id: true },
      take: 20,
    });
    for (const studio of expired) await this.purgeDemoStudio(studio.id);
    return expired.length;
  }

  async purgeDemoStudio(studioId: string): Promise<void> {
    const studio = await this.prisma.studio.findUnique({ where: { id: studioId }, select: { isDemo: true } });
    if (!studio) return;
    if (!studio.isDemo) throw new Error('Refusing to purge a studio that is not a demo studio.');
    const files = await this.prisma.sourceAsset.findMany({ where: { studioId }, select: { storageKey: true, previewKey: true } });
    await this.prisma.$transaction(
      async (tx) => {
        // Transaction-local flag recognised by the integrity triggers (see the integrity_guards migration).
        await tx.$executeRaw`SELECT set_config('tailorite.purge', 'on', true)`;
        const members = await tx.membership.findMany({ where: { studioId }, select: { userId: true } });
        await tx.studio.delete({ where: { id: studioId } });
        await tx.user.deleteMany({ where: { id: { in: members.map((m) => m.userId) }, isDemo: true } });
      },
      { timeout: 30_000 },
    );
    for (const key of files.flatMap((f) => [f.storageKey, f.previewKey]).filter((k): k is string => Boolean(k))) {
      await this.storage.delete(key).catch(() => undefined);
    }
    logger().event('info', 'demo_studio_purged', { studioId, files: files.length });
  }
}
