import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionService } from './session.service.js';
import { ALLOW_WITHOUT_STUDIO, IS_PUBLIC } from './decorators.js';
import { Errors } from '../common/errors/app-error.js';
import type { AppRequest } from '../common/http/request-context.js';

/** Global guard: every route requires an owner session unless marked @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const req = context.switchToHttp().getRequest<AppRequest>();

    const token = (req.cookies as Record<string, string> | undefined)?.[this.sessions.cookieName];
    if (token) {
      const auth = await this.sessions.resolve(token);
      if (auth) req.auth = auth;
    }
    if (isPublic) return true;
    if (!req.auth) throw Errors.unauthenticated();

    const allowWithoutStudio = this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_STUDIO, targets);
    if (!allowWithoutStudio && !req.auth.studioId) throw Errors.onboardingRequired();
    return true;
  }
}
