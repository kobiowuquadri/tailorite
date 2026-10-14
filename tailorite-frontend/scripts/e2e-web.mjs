#!/usr/bin/env node
// Production build of the web app for the browser tests, served on :3100 by the standalone
// server and proxying /api/* to the isolated test API (tailorite-backend/scripts/e2e-stack.mjs).
// `next dev` writes to .next/dev, so this build can run while a dev server is open.
// Set E2E_SKIP_BUILD=1 to reuse the last build.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const apiUrl = process.env.E2E_API_URL ?? "http://localhost:4100";
const port = process.env.E2E_WEB_PORT ?? "3100";
// Rewrites are fixed at build time, so the build must know the test API's address.
const env = { ...process.env, API_INTERNAL_URL: apiUrl, NEXT_TELEMETRY_DISABLED: "1" };

if (!process.env.E2E_SKIP_BUILD || !existsSync(".next/standalone/server.js")) {
  const build = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
// The standalone server only serves static assets that are copied next to it.
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });

const server = spawn(process.execPath, [".next/standalone/server.js"], {
  env: { ...env, NODE_ENV: "production", PORT: port, HOSTNAME: "localhost" },
  stdio: "inherit",
});
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill());
