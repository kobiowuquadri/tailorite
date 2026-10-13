import { Injectable, type PipeTransform } from '@nestjs/common';
import { Errors } from '../errors/app-error.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids must be UUIDs; anything else is simply "not found" (no format hints, no existence leaks). */
@Injectable()
export class IdPipe implements PipeTransform<string, string> {
  constructor(private readonly what = 'Item') {}

  transform(value: string): string {
    if (typeof value !== 'string' || !UUID.test(value)) throw Errors.notFound(this.what);
    return value.toLowerCase();
  }
}

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
