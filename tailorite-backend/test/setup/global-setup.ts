// Vitest global setup: a real PostgreSQL (embedded binaries) with a fresh database per run and
// all Prisma migrations applied. Tests never touch the development database.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import type { TestProject } from 'vitest/node';
import { pgStart, pgStop } from '../../scripts/pg-control.mjs';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const USER = 'tailorite_test';
const PASSWORD = 'tailorite_test';

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = net.createServer();
    server.unref();
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => done(port));
    });
  });
}

export default async function setup(project: TestProject) {
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    // Use an existing server (e.g. CI service container). The database must be disposable.
    migrate(external);
    project.provide('databaseUrl', external);
    return;
  }

  const dataDir = resolve('.local/test-postgres');
  mkdirSync(dataDir, { recursive: true });
  // A previous run that was interrupted may have left the server running.
  await pgStop(dataDir).catch(() => undefined);
  if (!existsSync(resolve(dataDir, 'PG_VERSION'))) {
    await new EmbeddedPostgres({
      databaseDir: dataDir,
      user: USER,
      password: PASSWORD,
      authMethod: 'scram-sha-256',
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => {},
      onError: () => {},
    }).initialise();
  }
  const port = await freePort();
  await pgStart({ dataDir, port, logFile: resolve(dataDir, '..', 'test-postgres.log') });

  const database = `tailorite_test_${Date.now()}`;
  const admin = new pg.Client({ host: '127.0.0.1', port, user: USER, password: PASSWORD, database: 'postgres' });
  await admin.connect();
  // Remove databases left behind by interrupted runs.
  const stale = await admin.query<{ datname: string }>("SELECT datname FROM pg_database WHERE datname LIKE 'tailorite_test_%'");
  for (const row of stale.rows) await admin.query(`DROP DATABASE IF EXISTS "${row.datname}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${database}" ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();

  const url = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${port}/${database}`;
  migrate(url);
  project.provide('databaseUrl', url);

  return async () => {
    const cleanup = new pg.Client({ host: '127.0.0.1', port, user: USER, password: PASSWORD, database: 'postgres' });
    await cleanup.connect();
    await cleanup.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await cleanup.end();
    await pgStop(dataDir);
  };
}

function migrate(url: string) {
  execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
