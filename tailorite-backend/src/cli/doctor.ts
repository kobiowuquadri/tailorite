/* eslint-disable no-console -- command-line output for the person running the checks */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { GoogleGenAI } from '@google/genai';
import { loadConfig } from '../bootstrap.js';
import { createStorage } from '../storage/storage.module.js';

// Checks the settings a deployment depends on, without starting the API or its worker.
//   pnpm build && pnpm doctor                                   (uses .env)
//   pnpm build && node --env-file=.env.production dist/cli/doctor.js
const config = loadConfig();
const e = config.env;
let failures = 0;

async function step(name: string, run: () => Promise<string>, hint: string) {
  const started = Date.now();
  try {
    const detail = await run();
    console.log(`  ✓ ${name.padEnd(9)} ${detail} (${Date.now() - started} ms)`);
  } catch (error) {
    failures++;
    console.log(`  ✗ ${name.padEnd(9)} ${(error as Error).message.split('\n')[0]}`);
    console.log(`    ${hint}`);
  }
}

console.log('\nTailorite doctor');
console.log(`  · Settings  NODE_ENV=${e.NODE_ENV}, storage=${e.STORAGE_DRIVER}, queue=${e.JOB_QUEUE_BACKEND}, AI_MODE=${e.AI_MODE}, worker in API=${e.WORKER_IN_API}`);

await step(
  'Database',
  async () => {
    const client = new pg.Client({ connectionString: e.DATABASE_URL, connectionTimeoutMillis: 15_000 });
    await client.connect();
    try {
      const version = (await client.query<{ v: string }>("select current_setting('server_version') as v")).rows[0]?.v;
      const latest = await client
        .query<{ name: string }>('select migration_name as name from _prisma_migrations where finished_at is not null order by finished_at desc limit 1')
        .then((r) => r.rows[0]?.name ?? 'none')
        .catch(() => 'not migrated yet');
      return `PostgreSQL ${version}; latest migration ${latest}`;
    } finally {
      await client.end();
    }
  },
  'Check DATABASE_URL (and that the database accepts connections from this machine).',
);

await step(
  'Storage',
  async () => {
    const storage = createStorage(config);
    await storage.check();
    const key = `doctor/${randomUUID()}.txt`;
    const body = Buffer.from('Tailorite storage check — safe to delete.\n');
    await storage.put(key, body, 'text/plain');
    try {
      const whole = await storage.getBuffer(key);
      if (!whole.equals(body)) throw new Error('read back different bytes than were written');
      const part = await storage.get(key, { start: 0, end: 7 });
      const chunks: Buffer[] = [];
      for await (const chunk of part.stream) chunks.push(Buffer.from(chunk as Uint8Array));
      if (!Buffer.concat(chunks).equals(body.subarray(0, 8))) throw new Error('range read returned the wrong bytes');
    } finally {
      await storage.delete(key);
    }
    return `${storage.driver}: upload, read, range read and delete work`;
  },
  e.STORAGE_DRIVER === 'cloudinary'
    ? 'Check CLOUDINARY_URL (Cloudinary console → Settings → API Keys → "API environment variable").'
    : e.STORAGE_DRIVER === 's3'
      ? 'Check S3_ENDPOINT, S3_REGION, S3_BUCKET and the access keys (the bucket must already exist in production).'
      : 'Local disk works only on this machine; production needs STORAGE_DRIVER=cloudinary or s3.',
);

await step(
  'AI',
  async () => {
    const availability = config.aiAvailability();
    if (!availability.available) throw new Error(`${availability.label}: ${availability.message}`);
    if (availability.mode !== 'live') return `${availability.label} (no live AI calls)`;
    const ai = new GoogleGenAI({ apiKey: e.GEMINI_API_KEY! });
    const models = [...new Set([e.GEMINI_EXTRACTION_MODEL, e.GEMINI_TRANSCRIPTION_MODEL])];
    for (const model of models) {
      await ai.models.generateContent({ model, contents: 'Reply with the single word OK.', config: { maxOutputTokens: 16 } });
    }
    return `Gemini answered with ${models.join(' and ')}`;
  },
  'Set GEMINI_API_KEY (Google AI Studio → Get API key) and AI_MODE=live; if the model is not found, set GEMINI_EXTRACTION_MODEL and GEMINI_TRANSCRIPTION_MODEL to a model your key can use.',
);

if (e.NODE_ENV === 'production' && e.JOB_QUEUE_BACKEND !== 'redis' && !e.WORKER_IN_API) {
  console.log('  ! Worker   WORKER_IN_API is false: AI jobs only run if a separate worker process is deployed.');
}
console.log(failures ? `\n${failures} check(s) failed.\n` : '\nAll checks passed.\n');
process.exitCode = failures ? 1 : 0;
