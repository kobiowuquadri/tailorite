import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppConfig } from '../config/app-config.js';
import { Errors } from '../common/errors/app-error.js';
import { RATE_LIMITS, RateLimitService } from '../common/security/rate-limit.service.js';
import { hashPassword } from '../common/security/password.js';
import { SessionService } from '../auth/session.service.js';
import { StudiosService } from '../studios/studios.service.js';
import { DemoScenarioService } from './demo-scenario.service.js';
import { DemoPurgeService } from './demo-purge.service.js';
import { DEMO } from './demo-content.js';

@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly rateLimits: RateLimitService,
    private readonly sessions: SessionService,
    private readonly studios: StudiosService,
    private readonly scenario: DemoScenarioService,
    private readonly purge: DemoPurgeService,
  ) {}

  /**
   * "Explore demo": a private, temporary studio filled with synthetic data for one visitor.
   * No shared account, no access to real studios; purged automatically after the TTL.
   */
  async createSandbox(meta: { ip: string; userAgent?: string }) {
    const e = this.config.env;
    if (!e.DEMO_SANDBOX_ENABLED) throw Errors.notFound('Demo');
    await this.rateLimits.consume('demo:ip', meta.ip, RATE_LIMITS.demoPerIp);
    const ttlMs = e.DEMO_SANDBOX_TTL_HOURS * 3_600_000;
    const user = await this.prisma.user.create({
      data: { email: `sandbox-${randomUUID()}@demo.tailorite.invalid`, name: 'Demo visitor', isDemo: true },
    });
    try {
      const studio = await this.studios.createForUser(user.id, user.name, {
        studioName: `${DEMO.studioName} (demo)`,
        ownerName: DEMO.ownerName,
        phone: null,
        email: null,
        city: 'Lagos',
        measurementUnit: 'INCH',
        timeZone: 'Africa/Lagos',
        currency: 'USD',
      });
      await this.prisma.studio.update({
        where: { id: studio.id },
        data: { isDemo: true, demoExpiresAt: new Date(Date.now() + ttlMs) },
      });
      const { demoOrderId } = await this.scenario.build(studio.id, { type: 'USER', userId: user.id, label: DEMO.ownerName });
      const session = await this.sessions.create(user.id, { userAgent: meta.userAgent, ttlMs });
      return { ...session, redirectTo: `/orders/${demoOrderId}/brief` };
    } catch (error) {
      const studio = await this.prisma.membership.findFirst({ where: { userId: user.id }, select: { studioId: true } });
      if (studio) await this.purge.purgeDemoStudio(studio.studioId).catch(() => undefined);
      await this.prisma.user.deleteMany({ where: { id: user.id, isDemo: true } });
      throw error;
    }
  }

  /**
   * Guarded, repeatable seed of the presenter studio "Amina Atelier". Only the studio flagged with
   * the demo seed key is reset; real studios and users are never touched.
   */
  async seedPresenterStudio(): Promise<{ email: string; studioId: string; demoOrderId: string }> {
    const e = this.config.env;
    if (this.config.isProduction && !e.ALLOW_DEMO_SEED) {
      throw new Error('Refusing to seed demo data with NODE_ENV=production. Set ALLOW_DEMO_SEED=true on a dedicated demo deployment.');
    }
    if (!e.DEMO_OWNER_PASSWORD || e.DEMO_OWNER_PASSWORD.length < 10) {
      throw new Error('Set DEMO_OWNER_PASSWORD (10+ characters) in .env before seeding the demo studio.');
    }
    const email = e.DEMO_OWNER_EMAIL.trim().toLowerCase();
    const existingStudio = await this.prisma.studio.findUnique({ where: { demoSeedKey: DEMO.seedKey } });
    if (existingStudio) await this.purge.purgeDemoStudio(existingStudio.id);

    let user = await this.prisma.user.findUnique({ where: { email }, include: { memberships: { include: { studio: true } } } });
    if (user && user.memberships.some((m) => !m.studio.isDemo)) {
      throw new Error(`${email} belongs to a real studio. Choose a different DEMO_OWNER_EMAIL.`);
    }
    const passwordHash = await hashPassword(e.DEMO_OWNER_PASSWORD);
    if (user) {
      await this.prisma.membership.deleteMany({ where: { userId: user.id } });
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash, name: DEMO.ownerName } });
    } else {
      user = await this.prisma.user.create({
        data: { email, name: DEMO.ownerName, passwordHash },
        include: { memberships: { include: { studio: true } } },
      });
    }
    const studio = await this.studios.createForUser(user.id, DEMO.ownerName, {
      studioName: DEMO.studioName,
      ownerName: DEMO.ownerName,
      phone: '08030000099',
      email: null,
      city: 'Lagos',
      measurementUnit: 'INCH',
      timeZone: 'Africa/Lagos',
      currency: 'USD',
    });
    await this.prisma.studio.update({ where: { id: studio.id }, data: { isDemo: true, demoSeedKey: DEMO.seedKey } });
    const { demoOrderId } = await this.scenario.build(studio.id, { type: 'USER', userId: user.id, label: DEMO.ownerName });
    return { email, studioId: studio.id, demoOrderId };
  }
}
