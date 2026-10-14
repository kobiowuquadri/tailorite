#!/usr/bin/env node
// Isolated API + worker for the browser tests (started by tailorite-frontend `pnpm test:e2e`).
//
//  - Database: "<DATABASE_URL name>_e2e" on the same PostgreSQL server, dropped and recreated on
//    every run (or E2E_DATABASE_URL, whose database name must also end in "_e2e"). No other
//    database is ever touched.
//  - NODE_ENV=test with the deterministic fake AI provider (refused outside tests); the Gemini key
//    is blanked so no real provider call can happen.
//  - Private files in .local/e2e-storage, wiped on every run.
//  - Set E2E_SKIP_BUILD=1 to reuse an existing dist/ build.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
dotenv.config({ quiet: true });

const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? 'http://localhost:3100';

function databaseUrl() {
  const raw = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) throw new Error('Set DATABASE_URL (or E2E_DATABASE_URL) to a PostgreSQL server for the browser tests.');
  const url = new URL(raw);
  if (!process.env.E2E_DATABASE_URL) url.pathname = `/${url.pathname.replace(/^\//, '') || 'tailorite'}_e2e`;
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+_e2e$/.test(name)) {
    throw new Error(`Refusing to reset "${name}": the browser-test database name must end in "_e2e".`);
  }
  return { url: url.toString(), name };
}

async function recreateDatabase(url, name) {
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: maintenance.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0`);
  } finally {
    await admin.end();
  }
}

function run(command, args, env) {
  // pnpm is a .cmd shim on Windows and needs a shell; node is run directly (its path may contain spaces).
  const shell = process.platform === 'win32' && command === 'pnpm';
  const result = spawnSync(command, args, { env, stdio: 'inherit', shell });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status}).`);
}

const { url, name } = databaseUrl();
console.log(`[e2e] resetting database "${name}"`);
await recreateDatabase(url, name);
run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { ...process.env, DATABASE_URL: url });
if (!process.env.E2E_SKIP_BUILD) run('pnpm', ['-s', 'build'], process.env);

const storage = '.local/e2e-storage';
rmSync(storage, { recursive: true, force: true });
mkdirSync(storage, { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: 'test',
  AI_TEST_FAKE: 'true',
  AI_MODE: 'live',
  GEMINI_API_KEY: '',
  PORT: String(API_PORT),
  APP_ORIGIN: WEB_ORIGIN,
  TRUST_PROXY: 'loopback',
  DATABASE_URL: url,
  DATABASE_POOL_MAX: '5',
  SESSION_SECRET: randomBytes(32).toString('base64url'),
  COOKIE_SECURE: 'false',
  JOB_QUEUE_BACKEND: 'postgres',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: storage,
  EXTRACTION_RETRY_BASE_MS: '1500',
  WORKER_CONCURRENCY: '2',
  DEMO_SANDBOX_ENABLED: 'true',
  DEMO_SANDBOX_AI: 'fixture',
  LOG_LEVEL: process.env.E2E_LOG_LEVEL ?? 'warn',
};

const children = ['main', 'worker'].map((entry) => {
  const child = spawn(process.execPath, ['--enable-source-maps', `dist/${entry}.js`], { env, stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    console.log(`[e2e] ${entry} exited (${signal ?? code})`);
    shutdown(code ?? 1);
  });
  return child;
});

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  setTimeout(() => process.exit(code), 500).unref();
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
console.log(`[e2e] API on http://localhost:${API_PORT} (fake AI provider, database "${name}")`);
