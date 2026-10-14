#!/usr/bin/env node
// Waits until a dependency is reachable (used by `pnpm dev:all`).
//   node scripts/wait-for.mjs db    -> TCP connect to the DATABASE_URL host:port
//   node scripts/wait-for.mjs api   -> GET http://localhost:$PORT/api/health/live returns 200
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
const target = process.argv[2];
const deadline = Date.now() + Number(process.env.WAIT_TIMEOUT_MS ?? 120_000);

function tcp(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(2000);
    socket.once('connect', () => (socket.end(), resolve(true)));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
    socket.once('error', () => resolve(false));
  });
}

async function http(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let check;
let label;
if (target === 'db') {
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/tailorite');
  label = `PostgreSQL at ${url.hostname}:${url.port || 5432}`;
  check = () => tcp(url.hostname, Number(url.port || 5432));
} else if (target === 'api') {
  const url = `http://localhost:${process.env.PORT ?? 4000}/api/health/live`;
  label = `the API at ${url}`;
  check = () => http(url);
} else {
  console.error('Usage: node scripts/wait-for.mjs <db|api>');
  process.exit(2);
}

while (!(await check())) {
  if (Date.now() > deadline) {
    console.error(`Timed out waiting for ${label}.`);
    process.exit(1);
  }
  await delay(1000);
}
console.log(`${label} is ready.`);
