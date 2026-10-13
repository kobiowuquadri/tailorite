import type { Readable } from 'node:stream';

export type ByteRange = { start: number; end: number };

export type StoredObject = {
  stream: Readable;
  /** Total object size in bytes. */
  size: number;
  /** Bytes in this response (differs from size for range reads). */
  contentLength: number;
  range: ByteRange | null;
};

/**
 * Private object storage. Objects are never publicly addressable: the API streams them only
 * after authorizing the studio session or customer portal scope.
 */
export abstract class StorageService {
  abstract readonly driver: 'local' | 's3';
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  abstract get(key: string, range?: ByteRange): Promise<StoredObject>;
  abstract getBuffer(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
  /** Readiness probe; throws when storage is unusable. */
  abstract check(): Promise<void>;
}

const KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,400}$/;

export function assertSafeKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes('..') || key.includes('//')) {
    throw new Error('Invalid storage key');
  }
}

export function sourceObjectKey(studioId: string, orderId: string, sourceId: string, name: 'original' | 'preview', ext: string) {
  return `studios/${studioId}/orders/${orderId}/sources/${sourceId}/${name}.${ext}`;
}

/** Parses a single "bytes=a-b" range header against an object size. Returns null when absent/invalid. */
export function parseRangeHeader(header: string | undefined, size: number): ByteRange | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, a, b] = match;
  let start: number;
  let end: number;
  if (a === '' && b === '') return null;
  if (a === '') {
    const suffix = Number(b);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(a);
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}
