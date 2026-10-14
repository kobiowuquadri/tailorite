import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { assertSafeKey, StorageService, type ByteRange, type StoredObject } from './storage.service.js';

export type CloudinarySettings = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Prefix for every stored file, e.g. "tailorite". */
  folder: string;
};

/** Raw files keep their exact bytes; "authenticated" files open only through URLs signed with the API secret. */
const ASSET = { resource_type: 'raw', type: 'authenticated' } as const;

/** Lets callers tell "not stored" apart from other failures. */
export class StorageObjectMissingError extends Error {
  constructor(key: string) {
    super(`Stored file not found: ${key}`);
    this.name = 'StorageObjectMissingError';
  }
}

function asError(error: unknown, action: string): Error {
  if (error instanceof Error) return error;
  const body = (error as { error?: { message?: string; http_code?: number } })?.error ?? (error as { message?: string; http_code?: number });
  const status = body?.http_code ? ` (HTTP ${body.http_code})` : '';
  return new Error(`Cloudinary ${action} failed${status}: ${body?.message ?? 'unknown error'}`);
}

/**
 * Private files on Cloudinary. The API still streams every file to browsers after its own access checks,
 * so Cloudinary URLs never reach studios or customers; the signed URLs below are only used server-side.
 */
export class CloudinaryStorageService extends StorageService {
  readonly driver = 'cloudinary' as const;
  private checkedAt = 0;

  constructor(private readonly settings: CloudinarySettings) {
    super();
    cloudinary.config({
      cloud_name: settings.cloudName,
      api_key: settings.apiKey,
      api_secret: settings.apiSecret,
      secure: true,
      urlAnalytics: false,
    });
  }

  private publicId(key: string): string {
    assertSafeKey(key);
    return `${this.settings.folder}/${key}`;
  }

  private signedUrl(key: string): string {
    return cloudinary.url(this.publicId(key), { ...ASSET, sign_url: true, secure: true });
  }

  async put(key: string, body: Buffer): Promise<void> {
    const publicId = this.publicId(key);
    await new Promise<UploadApiResponse>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        { ...ASSET, public_id: publicId, overwrite: true, invalidate: true, unique_filename: false, use_filename: false },
        (error, result) => (error || !result ? reject(asError(error, 'upload')) : resolve(result)),
      );
      upload.end(body);
    });
  }

  async get(key: string, range?: ByteRange): Promise<StoredObject> {
    const response = await fetch(this.signedUrl(key), {
      headers: range ? { Range: `bytes=${range.start}-${range.end}` } : {},
    });
    if (response.status === 404) throw new StorageObjectMissingError(key);
    if (!response.ok || !response.body) throw new Error(`Cloudinary download failed (HTTP ${response.status})`);

    const length = Number(response.headers.get('content-length'));
    if (range && response.status === 206) {
      const total = Number(response.headers.get('content-range')?.split('/')[1]);
      const contentLength = Number.isFinite(length) && length > 0 ? length : range.end - range.start + 1;
      return { stream: Readable.fromWeb(response.body as WebReadableStream), size: Number.isFinite(total) ? total : range.end + 1, contentLength, range };
    }
    if (!range && Number.isFinite(length) && length > 0) {
      return { stream: Readable.fromWeb(response.body as WebReadableStream), size: length, contentLength: length, range: null };
    }
    // No length header, or the CDN answered a range request with the whole file: buffer and slice here.
    const whole = Buffer.from(await response.arrayBuffer());
    if (!range) return { stream: Readable.from(whole), size: whole.length, contentLength: whole.length, range: null };
    const part = whole.subarray(range.start, range.end + 1);
    return { stream: Readable.from(part), size: whole.length, contentLength: part.length, range };
  }

  async getBuffer(key: string): Promise<Buffer> {
    const object = await this.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of object.stream) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    try {
      // "not found" is a successful result here: deleting is idempotent.
      await cloudinary.uploader.destroy(this.publicId(key), { ...ASSET, invalidate: true });
    } catch (error) {
      throw asError(error, 'delete');
    }
  }

  /** Verifies the credentials. Cached for five minutes: the Admin API is rate-limited. */
  async check(): Promise<void> {
    if (Date.now() - this.checkedAt < 5 * 60_000) return;
    try {
      await cloudinary.api.ping();
    } catch (error) {
      throw asError(error, 'credentials check');
    }
    this.checkedAt = Date.now();
  }
}
