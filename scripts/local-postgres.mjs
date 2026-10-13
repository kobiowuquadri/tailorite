// Starts a local PostgreSQL server for development without Docker.
// Uses real PostgreSQL binaries shipped through the `embedded-postgres` npm package.
// Data persists in .local/postgres. Credentials/port/database come from DATABASE_URL.
//
//   pnpm db:local        # runs in the foreground; Ctrl+C stops the server cleanly
import 'dotenv/config';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import net from 'node:net';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { pgIsRunning, pgStart, pgStop } from './pg-control.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const parsed = new URL(url);
if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
  console.error(`DATABASE_URL points at "${parsed.hostname}". db:local only starts a server on localhost.`);
  process.exit(1);
}
const port = Number(parsed.port || 5432);
const user = decodeURIComponent(parsed.username || 'postgres');
const password = decodeURIComponent(parsed.password || 'postgres');
const database = decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'postgres');
const dataDir = resolve(process.env.LOCAL_PG_DATA_DIR ?? '.local/postgres');
const logFile = resolve(dataDir, '..', 'postgres.log');

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

mkdirSync(dataDir, { recursive: true });
let startedHere = false;

if (await pgIsRunning(dataDir)) {
  console.log(`PostgreSQL for ${dataDir} is already running; reusing it.`);
} else if (await portInUse(port)) {
  console.log(`Port ${port} is used by another server; assuming it is your PostgreSQL.`);
  console.log('Stop it or change the port in DATABASE_URL to use the embedded one.');
  setInterval(() => {}, 1 << 30); // keep `concurrently -k` from stopping the other processes
} else {
  if (!existsSync(resolve(dataDir, 'PG_VERSION'))) {
    console.log(`Initialising a new PostgreSQL cluster in ${dataDir} ...`);
    // initdb only: UTF-8 is required for customer names, the Naira sign and BullMQ's SQL
    // (initdb on Windows otherwise defaults to the WIN1252 code page).
    await new EmbeddedPostgres({
      databaseDir: dataDir,
      user,
      password,
      port,
      authMethod: 'scram-sha-256',
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => {},
      onError: () => {},
    }).initialise();
  }
  await pgStart({ dataDir, port, logFile });
  startedHere = true;
}

const client = new pg.Client({ host: '127.0.0.1', port, user, password, database: 'postgres' });
await client.connect();
const encoding = (await client.query('SHOW server_encoding')).rows[0].server_encoding;
if (encoding !== 'UTF8') {
  await client.end();
  if (startedHere) await pgStop(dataDir);
  console.error(
    `The cluster in ${dataDir} uses ${encoding} encoding; Tailorite requires UTF8.\n` +
      'Delete that folder (it only holds local development data) and run `pnpm db:local` again.',
  );
  process.exit(1);
}
const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
if (exists.rowCount === 0) {
  await client.query(`CREATE DATABASE "${database.replaceAll('"', '""')}" ENCODING 'UTF8' TEMPLATE template0`);
  console.log(`Created database "${database}".`);
}
await client.end();
console.log(`PostgreSQL is ready on localhost:${port} (database "${database}", user "${user}"). Logs: ${logFile}`);

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  if (startedHere) {
    console.log('Stopping PostgreSQL ...');
    await pgStop(dataDir).catch((error) => console.error(error.message));
  }
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);
setInterval(() => {}, 1 << 30);
