#!/usr/bin/env node
// Production start for the web app: serves the standalone build created by `pnpm build`.
// The standalone output does not include static assets, so they are copied next to the server.
//   PORT (default 3000), WEB_HOST (default 0.0.0.0)
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
if (!existsSync(".next/standalone/server.js")) {
  console.error("No production build found. Run `pnpm build` first.");
  process.exit(1);
}
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });

const server = spawn(process.execPath, [".next/standalone/server.js"], {
  env: { ...process.env, NODE_ENV: "production", PORT: process.env.PORT ?? "3000", HOSTNAME: process.env.WEB_HOST ?? "0.0.0.0" },
  stdio: "inherit",
});
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill());
