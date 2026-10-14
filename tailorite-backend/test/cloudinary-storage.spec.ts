import { Readable } from 'node:stream';

const sdk = vi.hoisted(() => ({ uploadStream: vi.fn(), destroy: vi.fn(), ping: vi.fn(), config: vi.fn() }));

vi.mock('cloudinary', () => ({
  v2: {
    config: sdk.config,
    url: (publicId: string, o: { resource_type: string; type: string; sign_url?: boolean }) =>
      `https://res.cloudinary.test/demo/${o.resource_type}/${o.type}/${o.sign_url ? 's--sig--/' : ''}v1/${publicId}`,
    uploader: { upload_stream: sdk.uploadStream, destroy: sdk.destroy },
    api: { ping: sdk.ping },
  },
}));

const { CloudinaryStorageService, StorageObjectMissingError } = await import('../src/storage/cloudinary-storage.js');

const settings = { cloudName: 'demo', apiKey: 'key', apiSecret: 'secret', folder: 'tailorite' };
const key = 'studios/s1/orders/o1/sources/x1/original.wav';
const body = Buffer.from('0123456789abcdef');

async function read(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

describe('Cloudinary storage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stores exact bytes as a private raw file under the folder', async () => {
    let written: Buffer | null = null;
    sdk.uploadStream.mockImplementation((options: Record<string, unknown>, done: (e?: unknown, r?: unknown) => void) => ({
      end: (buf: Buffer) => {
        written = buf;
        done(undefined, { public_id: options.public_id });
      },
    }));
    await new CloudinaryStorageService(settings).put(key, body);
    expect(sdk.uploadStream.mock.calls[0][0]).toMatchObject({
      resource_type: 'raw',
      type: 'authenticated',
      public_id: `tailorite/${key}`,
      overwrite: true,
    });
    expect(written).toEqual(body);
  });

  it('turns Cloudinary errors into readable messages', async () => {
    sdk.uploadStream.mockImplementation((_o: unknown, done: (e?: unknown) => void) => ({
      end: () => done({ message: 'File size too large. Got 12000000. Maximum is 10485760.', http_code: 400, name: 'Error' }),
    }));
    await expect(new CloudinaryStorageService(settings).put(key, body)).rejects.toThrow(
      /Cloudinary upload failed \(HTTP 400\): File size too large/,
    );
  });

  it('reads a whole file through a signed URL', async () => {
    fetchMock.mockResolvedValue(new Response(body, { status: 200, headers: { 'content-length': String(body.length) } }));
    const object = await new CloudinaryStorageService(settings).get(key);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://res.cloudinary.test/demo/raw/authenticated/s--sig--/v1/tailorite/${key}`);
    expect(object).toMatchObject({ size: body.length, contentLength: body.length, range: null });
    expect(await read(object.stream)).toEqual(body);
  });

  it('passes byte ranges through, and slices locally when the CDN ignores them', async () => {
    const storage = new CloudinaryStorageService(settings);
    fetchMock.mockResolvedValueOnce(
      new Response(body.subarray(4, 8), { status: 206, headers: { 'content-range': `bytes 4-7/${body.length}`, 'content-length': '4' } }),
    );
    const partial = await storage.get(key, { start: 4, end: 7 });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Range: 'bytes=4-7' } });
    expect(partial).toMatchObject({ size: body.length, contentLength: 4 });
    expect((await read(partial.stream)).toString()).toBe('4567');

    fetchMock.mockResolvedValueOnce(new Response(body, { status: 200 }));
    const sliced = await storage.get(key, { start: 10, end: 15 });
    expect(sliced).toMatchObject({ size: body.length, contentLength: 6, range: { start: 10, end: 15 } });
    expect((await read(sliced.stream)).toString()).toBe('abcdef');
  });

  it('reports missing files distinctly and deletes idempotently', async () => {
    fetchMock.mockResolvedValue(new Response('Not found', { status: 404 }));
    const storage = new CloudinaryStorageService(settings);
    await expect(storage.get(key)).rejects.toBeInstanceOf(StorageObjectMissingError);

    sdk.destroy.mockResolvedValue({ result: 'not found' });
    await storage.delete(key);
    expect(sdk.destroy).toHaveBeenCalledWith(`tailorite/${key}`, { resource_type: 'raw', type: 'authenticated', invalidate: true });
  });

  it('rejects unsafe keys before calling Cloudinary', async () => {
    await expect(new CloudinaryStorageService(settings).put('../escape.txt', body)).rejects.toThrow(/Invalid storage key/);
    expect(sdk.uploadStream).not.toHaveBeenCalled();
  });
});
