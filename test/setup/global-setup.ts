// Vitest global setup: a real PostgreSQL (embedded binaries) with a fresh database per run and
// all Prisma migrations applied. Tests never touch the development database.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import { resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

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
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'tailorite_test',
    password: 'tailorite_test',
    port,
    persistent: true,
    authMethod: 'scram-sha-256',
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {},
  });
  if (!existsSync(resolve(dataDir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();

  const database = `tailorite_test_${Date.now()}`;
  const client = pg.getPgClient();
  await client.connect();
  // Remove databases left behind by interrupted runs.
  const stale = await client.query<{ datname: string }>(
    "SELECT datname FROM pg_database WHERE datname LIKE 'tailorite_test_%'",
  );
  for (const row of stale.rows) await client.query(`DROP DATABASE IF EXISTS "${row.datname}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${database}" ENCODING 'UTF8' TEMPLATE template0`);
  await client.end();

  const url = `postgresql://tailorite_test:tailorite_test@127.0.0.1:${port}/${database}`;
  migrate(url);
  project.provide('databaseUrl', url);

  return async () => {
    const admin = pg.getPgClient();
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.end();
    await pg.stop();
  };
}

function migrate(url: string) {
  execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
