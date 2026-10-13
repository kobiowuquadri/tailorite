import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import { AppConfig } from '../config/app-config.js';

/**
 * Single-file multipart parsing into memory with limits taken from runtime configuration.
 * The per-type size limit is enforced again after the content has been identified.
 */
@Injectable()
export class SourceUploadInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;

  constructor(config: AppConfig) {
    const limits = config.uploadLimits;
    const Interceptor = FileInterceptor('file', {
      limits: {
        fileSize: Math.max(limits.audioBytes, limits.imageBytes),
        files: 1,
        fields: 10,
        fieldSize: 4 * 1024,
        parts: 12,
      },
    });
    this.delegate = new Interceptor();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> | Promise<Observable<unknown>> {
    return this.delegate.intercept(context, next);
  }
}
