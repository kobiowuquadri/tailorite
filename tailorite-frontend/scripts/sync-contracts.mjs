// Copies the shared request/response contracts from the backend (single source of truth) into
// src/contracts. The copy is committed so the web app builds on its own.
//
//   pnpm contracts:sync    # copy from ../tailorite-backend/src/contracts
//   pnpm contracts:check   # fail if the copy is out of date (run in CI / before builds)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const check = process.argv.includes('--check');
const sourceDir = resolve(process.env.TAILORITE_BACKEND_DIR ?? '../tailorite-backend', 'src/contracts');
const targetDir = resolve('src/contracts');
const HEADER =
  '// GENERATED FILE — do not edit. Source of truth: tailorite-backend/src/contracts.\n' +
  '// Run `pnpm contracts:sync` after changing the backend contracts.\n';

if (!existsSync(sourceDir)) {
  if (check) {
    console.log(`Backend contracts not found at ${sourceDir}; skipping drift check (standalone checkout).`);
    process.exit(0);
  }
  console.error(`Backend contracts not found at ${sourceDir}. Set TAILORITE_BACKEND_DIR.`);
  process.exit(1);
}

const files = readdirSync(sourceDir).filter((f) => f.endsWith('.ts'));
const lf = (text) => text.replaceAll('\r\n', '\n');
// The backend compiles with NodeNext (relative imports end in `.js`); the bundler resolves
// extensionless specifiers, so the copy drops the suffix.
const forBundler = (text) => text.replace(/(from\s+['"]\.{1,2}\/[^'"]+?)\.js(['"])/g, '$1$2');
const expected = new Map(
  files.map((f) => [f, HEADER + forBundler(lf(readFileSync(join(sourceDir, f), 'utf8')))]),
);

if (check) {
  const drift = [];
  for (const [file, content] of expected) {
    const target = join(targetDir, file);
    if (!existsSync(target) || lf(readFileSync(target, 'utf8')) !== content) drift.push(file);
  }
  if (existsSync(targetDir)) {
    for (const file of readdirSync(targetDir)) if (!expected.has(file)) drift.push(`${file} (stale)`);
  }
  if (drift.length) {
    console.error(`Contracts are out of date: ${drift.join(', ')}\nRun \`pnpm contracts:sync\`.`);
    process.exit(1);
  }
  console.log(`Contracts are in sync (${files.length} files).`);
} else {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  for (const [file, content] of expected) writeFileSync(join(targetDir, file), content);
  console.log(`Synced ${files.length} contract files into src/contracts.`);
}
