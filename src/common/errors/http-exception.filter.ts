import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import type { ApiErrorBody, ErrorCode } from '../../contracts/common.js';
import { AppError } from './app-error.js';
import { requestIdOf } from '../http/request-context.js';
import { logger } from '../logging/json-logger.js';

export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/** Maps every thrown error to the shared ApiErrorBody shape. Unexpected errors never leak details. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest();
    const requestId = requestIdOf(req);

    const send = (status: number, code: ErrorCode, message: string, extra: Partial<ApiErrorBody['error']> = {}) => {
      if (res.headersSent) return;
      const body: ApiErrorBody = { error: { code, message, requestId, ...extra } };
      res.status(status).json(body);
    };

    if (exception instanceof AppError) {
      if (exception.details.retryAfterSeconds) {
        res.setHeader('Retry-After', String(exception.details.retryAfterSeconds));
      }
      return send(exception.status, exception.code, exception.message, {
        fieldErrors: exception.details.fieldErrors,
        meta: exception.details.meta,
      });
    }

    if (exception instanceof ZodError) {
      return send(422, 'VALIDATION_FAILED', 'Check the highlighted fields and try again.', {
        fieldErrors: zodFieldErrors(exception),
      });
    }

    if ((exception as Error)?.name === 'MulterError') {
      if ((exception as { code?: string }).code === 'LIMIT_FILE_SIZE') {
        return send(413, 'PAYLOAD_TOO_LARGE', 'That file is larger than the upload limit.');
      }
      return send(422, 'VALIDATION_FAILED', 'The upload could not be read. Try again with a single file.');
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') return send(404, 'NOT_FOUND', 'Item was not found.');
      if (exception.code === 'P2002') {
        return send(409, 'CONFLICT', 'This change conflicts with an existing record. Refresh and try again.');
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 404) return send(404, 'NOT_FOUND', 'The requested endpoint does not exist.');
      if (status === 413) return send(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
      if (status === 400) {
        return send(400, 'VALIDATION_FAILED', 'The request could not be understood. Check the data and try again.');
      }
      if (status < 500) return send(status, 'VALIDATION_FAILED', exception.message);
    }

    // body-parser errors (malformed JSON, oversized bodies) arrive as plain errors with a status.
    const status = (exception as { status?: number; type?: string })?.status;
    if (status === 413) return send(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
    if (status === 400) return send(400, 'VALIDATION_FAILED', 'The request body is not valid JSON.');

    logger().event('error', 'unhandled_error', {
      requestId,
      errorName: (exception as Error)?.name,
      error: (exception as Error)?.message,
      stack: (exception as Error)?.stack,
    });
    return send(500, 'INTERNAL', 'Something went wrong on our side. Please try again.');
  }
}
