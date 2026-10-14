import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { AppError } from '../common/errors/app-error.js';
import type { AppRequest } from '../common/http/request-context.js';
import { isUuid } from '../common/validation/id.pipe.js';
import { PORTAL_COOKIE, verifyPortalSession } from './portal-session.js';

export type PortalRequest = AppRequest & { portalAccessId?: string };

/** Requires a valid portal session for the access id in the URL. */
@Injectable()
export class PortalSessionGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<PortalRequest>();
    const accessId = req.params.accessId;
    const cookie = (req.cookies as Record<string, string> | undefined)?.[PORTAL_COOKIE];
    if (!isUuid(accessId) || !verifyPortalSession(this.config.env.SESSION_SECRET, accessId.toLowerCase(), cookie)) {
      throw new AppError(
        'PORTAL_SESSION_REQUIRED',
        'Your review session has ended. Open the link from your tailor again to continue.',
        401,
      );
    }
    req.portalAccessId = accessId.toLowerCase();
    return true;
  }
}
