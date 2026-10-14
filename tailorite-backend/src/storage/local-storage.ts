import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile, access, constants } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertSafeKey, StorageService, type ByteRange, type StoredObject } from './storage.service.js';

/**
 * Private files on local disk, outside any web root. Intended for development on machines
 * without object storage; production configuration requires the S3 driver.
 */
export class LocalStorageService extends StorageService {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(dir: string) {
    super();
    this.root = resolve(dir);
  }

  private pathFor(key: string): string {
    assertSafeKey(key);
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, body, { flag: 'wx' });
    await rename(temp, target);
  }

  async get(key: string, range?: ByteRange): Promise<StoredObject> {
    const path = this.pathFor(key);
    const info = await stat(path);
    const stream = range ? createReadStream(path, { start: range.start, end: range.end }) : createReadStream(path);
    return {
      stream,
      size: info.size,
      contentLength: range ? range.end - range.start + 1 : info.size,
      range: range ?? null,
    };
  }

  async getBuffer(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async check(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root, constants.W_OK | constants.R_OK);
  }
}
