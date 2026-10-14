import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { AppError } from '../errors/app-error.js';
import type { AppRequest } from '../http/request-context.js';

export const CSRF_HEADER = 'x-tailorite-csrf';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie-authenticated mutations must come from the app itself:
 *  1. a custom header (cross-site forms cannot send it; cross-origin fetch would need a CORS
 *     preflight, which this API never grants), and
 *  2. when the browser sends Origin (or Referer), it must equal APP_ORIGIN.
 * Combined with SameSite cookies this is the "verified origin" CSRF protection.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (SAFE.has(req.method)) return true;

    const reject = () => {
      throw new AppError('CSRF_REJECTED', 'This request was blocked for your security. Reload the page and try again.', 403);
    };

    if (req.header(CSRF_HEADER) !== '1') reject();

    const allowed = this.config.env.APP_ORIGIN;
    const origin = req.header('origin');
    if (origin) {
      if (origin !== allowed) reject();
      return true;
    }
    const referer = req.header('referer');
    if (referer) {
      try {
        if (new URL(referer).origin !== allowed) reject();
      } catch {
        reject();
      }
    }
    return true;
  }
}
