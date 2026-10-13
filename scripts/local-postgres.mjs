// Starts a local PostgreSQL server for development without Docker.
// Uses real PostgreSQL binaries shipped through the `embedded-postgres` npm package.
// Data persists in .local/postgres. Credentials/port/database come from DATABASE_URL.
//
//   pnpm db:local        # runs in the foreground; Ctrl+C stops the server cleanly
import 'dotenv/config';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const parsed = new URL(url);
const host = parsed.hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`DATABASE_URL points at "${host}". db:local only starts a server on localhost.`);
  process.exit(1);
}
const port = Number(parsed.port || 5432);
const user = decodeURIComponent(parsed.username || 'postgres');
const password = decodeURIComponent(parsed.password || 'postgres');
const database = decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'postgres');
const dataDir = resolve(process.env.LOCAL_PG_DATA_DIR ?? '.local/postgres');

function portInUse(p) {
  return new Promise((done) => {
    const socket = net.connect({ port: p, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
  });
}

if (await portInUse(port)) {
  console.log(`Something is already listening on port ${port}; assuming PostgreSQL is running.`);
  console.log('Stop the other server or change the port in DATABASE_URL to use the embedded one.');
  // Stay alive so `concurrently -k` does not tear down the other processes.
  setInterval(() => {}, 1 << 30);
} else {
  mkdirSync(dataDir, { recursive: true });
  const initialised = existsSync(resolve(dataDir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: true,
    authMethod: 'scram-sha-256',
    // UTF-8 is required: customer names, the Naira sign and BullMQ's SQL all need it.
    // (initdb on Windows otherwise defaults to the WIN1252 code page.)
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: (message) => {
      const text = String(message ?? '');
      if (text.trim()) console.error(`[postgres] ${text.trim()}`);
    },
  });

  if (!initialised) {
    console.log(`Initialising a new PostgreSQL cluster in ${dataDir} ...`);
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  const encoding = (await client.query('SHOW server_encoding')).rows[0].server_encoding;
  if (encoding !== 'UTF8') {
    await client.end();
    await pg.stop();
    console.error(
      `The cluster in ${dataDir} uses ${encoding} encoding; Tailorite requires UTF8.\n` +
        'Delete that folder (it only holds local development data) and run `pnpm db:local` again.',
    );
    process.exit(1);
  }
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (exists.rowCount === 0) {
    await client.query(
      `CREATE DATABASE "${database.replaceAll('"', '""')}" ENCODING 'UTF8' TEMPLATE template0`,
    );
    console.log(`Created database "${database}".`);
  }
  await client.end();

  console.log(`PostgreSQL is ready on localhost:${port} (database "${database}", user "${user}").`);

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log('Stopping PostgreSQL ...');
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('SIGHUP', stop);
}
