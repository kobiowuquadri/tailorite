import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './request-context.js';
import { logger } from '../logging/json-logger.js';

const VALID_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Assigns a request id (or accepts a well-formed one from the trusted proxy), echoes it in the
 * response and writes one structured access-log line. Logs contain the path without query string,
 * never bodies or tokens (customer link tokens travel in URL fragments, which servers never receive).
 */
export function requestIdMiddleware(req: AppRequest, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID();
  req.startedAt = performance.now();
  res.setHeader('x-request-id', req.requestId);

  res.on('finish', () => {
    const path = (req.originalUrl ?? req.url).split('?')[0];
    if (path.startsWith('/api/health')) return;
    logger().event(res.statusCode >= 500 ? 'error' : 'info', 'request', {
      requestId: req.requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Math.round(performance.now() - req.startedAt),
      studioId: req.auth?.studioId ?? undefined,
    });
  });
  next();
}
