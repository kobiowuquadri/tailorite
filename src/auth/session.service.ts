import { Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { randomToken, sha256Hex } from '../common/security/tokens.js';
import type { AuthContext } from '../common/http/request-context.js';

const DAY = 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** `__Host-` prefix (Secure, Path=/, no Domain) whenever cookies are marked Secure. */
  get cookieName(): string {
    return this.config.env.COOKIE_SECURE ? '__Host-tl_session' : 'tl_session';
  }

  private cookieOptions(expires: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      expires,
    };
  }

  async create(
    userId: string,
    opts: { userAgent?: string; ttlMs?: number } = {},
  ): Promise<{ token: string; expiresAt: Date }> {
    const now = Date.now();
    const token = randomToken();
    const absoluteExpiresAt = new Date(now + (opts.ttlMs ?? this.config.env.SESSION_TTL_DAYS * DAY));
    const idleExpiresAt = new Date(Math.min(now + this.config.env.SESSION_IDLE_DAYS * DAY, absoluteExpiresAt.getTime()));
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256Hex(token),
        idleExpiresAt,
        absoluteExpiresAt,
        userAgent: opts.userAgent?.slice(0, 200),
      },
    });
    return { token, expiresAt: absoluteExpiresAt };
  }

  /** Resolves a cookie token to an auth context, sliding the idle expiry at most once an hour. */
  async resolve(token: string): Promise<(AuthContext & { expiresAt: Date }) | null> {
    if (!token || token.length > 128) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: {
        user: {
          include: {
            memberships: { orderBy: { createdAt: 'asc' }, take: 1 },
          },
        },
      },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) {
      return null;
    }
    let idleExpiresAt = session.idleExpiresAt;
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      idleExpiresAt = new Date(
        Math.min(now.getTime() + this.config.env.SESSION_IDLE_DAYS * DAY, session.absoluteExpiresAt.getTime()),
      );
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: now, idleExpiresAt },
      });
    }
    const membership = session.user.memberships[0] ?? null;
    return {
      userId: session.userId,
      userName: session.user.name,
      sessionId: session.id,
      studioId: membership?.studioId ?? null,
      role: membership?.role ?? null,
      isDemoUser: session.user.isDemo,
      expiresAt: idleExpiresAt,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  setCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(this.cookieName, token, this.cookieOptions(expiresAt));
  }

  clearCookie(res: Response) {
    res.clearCookie(this.cookieName, { ...this.cookieOptions(new Date(0)), expires: undefined });
  }

  /** Housekeeping: remove sessions that can no longer be used. */
  async purgeExpired(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { absoluteExpiresAt: { lt: new Date() } },
          { revokedAt: { lt: new Date(Date.now() - DAY) } },
        ],
      },
    });
    return result.count;
  }
}
