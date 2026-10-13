import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { Errors } from '../errors/app-error.js';
import { zodFieldErrors } from '../errors/http-exception.filter.js';

/** Validates and transforms a request body/query/param with a shared contract schema. */
@Injectable()
export class ZodPipe<T extends ZodType> implements PipeTransform<unknown, unknown> {
  constructor(private readonly schema: T) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw Errors.validation('Check the highlighted fields and try again.', zodFieldErrors(result.error));
    }
    return result.data;
  }
}

export function parseOrThrow<T extends ZodType>(schema: T, value: unknown) {
  return new ZodPipe(schema).transform(value) as import('zod').infer<T>;
}
