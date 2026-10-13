import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AppError, Errors } from '../common/errors/app-error.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from '../common/security/password.js';
import { RATE_LIMITS, RateLimitService } from '../common/security/rate-limit.service.js';
import { SessionService } from './session.service.js';
import type { LoginInput, RegisterInput, SessionDto } from '../contracts/auth.js';
import type { AuthContext } from '../common/http/request-context.js';
import { toStudioDto } from '../studios/studio.mapper.js';

type ClientMeta = { ip: string; userAgent?: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly rateLimits: RateLimitService,
  ) {}

  async register(input: RegisterInput, meta: ClientMeta) {
    await this.rateLimits.consume('register:ip', meta.ip, RATE_LIMITS.registerPerIp);
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError('CONFLICT', 'An account with this email already exists. Sign in instead.', 409, {
        fieldErrors: { email: ['An account with this email already exists'] },
      });
    }
    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash },
    });
    return this.sessions.create(user.id, { userAgent: meta.userAgent });
  }

  async login(input: LoginInput, meta: ClientMeta) {
    await this.rateLimits.consume('login:ip', meta.ip, RATE_LIMITS.loginPerIp);
    await this.rateLimits.consume('login:email', input.email, RATE_LIMITS.loginPerEmail);
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Always run one password verification so response time does not reveal whether the email exists.
    const valid = await verifyPassword(input.password, user?.passwordHash ?? (await dummyPasswordHash()));
    if (!user || !user.passwordHash || !valid) {
      throw new AppError('UNAUTHENTICATED', 'Email or password is incorrect.', 401);
    }
    return this.sessions.create(user.id, { userAgent: meta.userAgent });
  }

  async sessionInfo(auth: AuthContext & { expiresAt?: Date }): Promise<SessionDto> {
    const user = await this.prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw Errors.unauthenticated();
    const studio = auth.studioId ? await this.prisma.studio.findUnique({ where: { id: auth.studioId } }) : null;
    return {
      user: { id: user.id, name: user.name, email: user.email, isDemo: user.isDemo },
      studio: studio ? toStudioDto(studio) : null,
      role: auth.role,
      expiresAt: (auth.expiresAt ?? new Date()).toISOString(),
    };
  }
}
