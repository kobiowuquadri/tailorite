import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { assertSafeKey, StorageService, type ByteRange, type StoredObject } from './storage.service.js';
import { logger } from '../common/logging/json-logger.js';

export type S3Settings = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  createBucketIfMissing: boolean;
};

/** Private bucket on any S3-compatible service (MinIO locally, AWS S3 / Cloudflare R2 in production). */
export class S3StorageService extends StorageService {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private bucketChecked = false;

  constructor(private readonly settings: S3Settings) {
    super();
    this.client = new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: settings.forcePathStyle,
      credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
      // Only send/verify the newer default checksums when an operation requires them: several
      // S3-compatible services (e.g. Clever Cloud Cellar) reject them otherwise.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketChecked) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.settings.bucket }));
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 && this.settings.createBucketIfMissing) {
        await this.client.send(new CreateBucketCommand({ Bucket: this.settings.bucket }));
        logger().event('info', 'storage_bucket_created', { bucket: this.settings.bucket });
      } else {
        throw error;
      }
    }
    this.bucketChecked = true;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      }),
    );
  }

  async get(key: string, range?: ByteRange): Promise<StoredObject> {
    assertSafeKey(key);
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
        Range: range ? `bytes=${range.start}-${range.end}` : undefined,
      }),
    );
    const contentLength = Number(result.ContentLength ?? 0);
    let size = contentLength;
    const contentRange = result.ContentRange; // "bytes 0-99/1234"
    if (contentRange) {
      const total = Number(contentRange.split('/')[1]);
      if (Number.isFinite(total)) size = total;
    }
    return {
      stream: result.Body as Readable,
      size,
      contentLength,
      range: range ?? null,
    };
  }

  async getBuffer(key: string): Promise<Buffer> {
    const object = await this.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of object.stream) chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: key }));
  }

  async check(): Promise<void> {
    this.bucketChecked = false;
    await this.ensureBucket();
  }
}
