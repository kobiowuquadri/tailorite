import { parseEnv } from '../src/config/env.js';

const base = {
  APP_ORIGIN: 'https://tailorite.example.com',
  SESSION_SECRET: 'x'.repeat(40),
  DATABASE_URL: 'postgresql://user:pass@db.example.com:5432/app',
};

describe('environment from hosting add-ons', () => {
  it('uses a linked PostgreSQL add-on over TLS when DATABASE_URL is not set', () => {
    const env = parseEnv({ ...base, DATABASE_URL: '', POSTGRESQL_ADDON_URI: 'postgresql://u:p@pg.example.com:50013/db' });
    expect(env.DATABASE_URL).toBe('postgresql://u:p@pg.example.com:50013/db?sslmode=require&uselibpqcompat=true');
    // An explicit DATABASE_URL always wins.
    expect(parseEnv({ ...base, POSTGRESQL_ADDON_URI: 'postgresql://other/db' }).DATABASE_URL).toBe(base.DATABASE_URL);
  });

  it('maps Cellar credentials to the S3 settings, adding https:// to a bare host', () => {
    const env = parseEnv({
      ...base,
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'tailorite-media',
      CELLAR_ADDON_HOST: 'cellar-c2.services.clever-cloud.com',
      CELLAR_ADDON_KEY_ID: 'key-id',
      CELLAR_ADDON_KEY_SECRET: 'key-secret',
    });
    expect(env.S3_ENDPOINT).toBe('https://cellar-c2.services.clever-cloud.com');
    expect(env.S3_ACCESS_KEY_ID).toBe('key-id');
    expect(env.S3_SECRET_ACCESS_KEY).toBe('key-secret');
  });

  it('accepts the database-polling queue and still requires private object storage in production', () => {
    expect(parseEnv({ ...base, JOB_QUEUE_BACKEND: 'database' }).JOB_QUEUE_BACKEND).toBe('database');
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/STORAGE_DRIVER/);
  });
});

describe('Cloudinary storage settings', () => {
  it('reads CLOUDINARY_URL and selects the Cloudinary driver when none is set', () => {
    const env = parseEnv({ ...base, NODE_ENV: 'production', CLOUDINARY_URL: 'cloudinary://123456:s3cr%2Bet@my-cloud' });
    expect(env.STORAGE_DRIVER).toBe('cloudinary');
    expect(env.CLOUDINARY_CLOUD_NAME).toBe('my-cloud');
    expect(env.CLOUDINARY_API_KEY).toBe('123456');
    expect(env.CLOUDINARY_API_SECRET).toBe('s3cr+et');
    expect(env.CLOUDINARY_FOLDER).toBe('tailorite');
  });

  it('accepts the value pasted with its "CLOUDINARY_URL=" prefix, and explicit parts win', () => {
    const env = parseEnv({
      ...base,
      STORAGE_DRIVER: 'cloudinary',
      CLOUDINARY_URL: 'CLOUDINARY_URL=cloudinary://key:secret@cloud-a',
      CLOUDINARY_CLOUD_NAME: 'cloud-b',
    });
    expect(env.CLOUDINARY_CLOUD_NAME).toBe('cloud-b');
    expect(env.CLOUDINARY_API_KEY).toBe('key');
  });

  it('requires credentials for the Cloudinary driver', () => {
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: 'cloudinary' })).toThrow(/CLOUDINARY_API_SECRET/);
    expect(() => parseEnv({ ...base, STORAGE_DRIVER: 'cloudinary', CLOUDINARY_URL: 'https://not-cloudinary' })).toThrow(/CLOUDINARY_CLOUD_NAME/);
  });
});
