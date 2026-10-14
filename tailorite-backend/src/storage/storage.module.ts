import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { StorageService } from './storage.service.js';
import { LocalStorageService } from './local-storage.js';
import { S3StorageService } from './s3-storage.js';
import { CloudinaryStorageService } from './cloudinary-storage.js';

export function createStorage(config: AppConfig): StorageService {
  const e = config.env;
  if (e.STORAGE_DRIVER === 's3') {
    return new S3StorageService({
      endpoint: e.S3_ENDPOINT!,
      region: e.S3_REGION,
      bucket: e.S3_BUCKET!,
      accessKeyId: e.S3_ACCESS_KEY_ID!,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY!,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      createBucketIfMissing: e.S3_CREATE_BUCKET ?? !config.isProduction,
    });
  }
  if (e.STORAGE_DRIVER === 'cloudinary') {
    return new CloudinaryStorageService({
      cloudName: e.CLOUDINARY_CLOUD_NAME!,
      apiKey: e.CLOUDINARY_API_KEY!,
      apiSecret: e.CLOUDINARY_API_SECRET!,
      folder: e.CLOUDINARY_FOLDER,
    });
  }
  return new LocalStorageService(e.STORAGE_LOCAL_DIR);
}

@Global()
@Module({
  providers: [{ provide: StorageService, useFactory: createStorage, inject: [AppConfig] }],
  exports: [StorageService],
})
export class StorageModule {}
