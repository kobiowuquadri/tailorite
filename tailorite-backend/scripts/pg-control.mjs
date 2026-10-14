// Graceful control of the embedded PostgreSQL binaries with pg_ctl.
// embedded-postgres is used to install the binaries and run initdb; it stops servers on Windows
// with `taskkill /f /t`, which skips a clean shutdown and can leave orphaned processes holding
// shared memory. pg_ctl start/stop avoids both problems on every platform.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const PLATFORM_PACKAGES = {
  'win32-x64': 'windows-x64',
  'linux-x64': 'linux-x64',
  'linux-arm64': 'linux-arm64',
  'darwin-x64': 'darwin-x64',
  'darwin-arm64': 'darwin-arm64',
};

let binaries;

/** { pg_ctl, initdb, postgres } absolute paths for this platform. */
export async function pgBinaries() {
  if (binaries) return binaries;
  const name = PLATFORM_PACKAGES[`${process.platform}-${process.arch}`];
  if (!name) throw new Error(`embedded-postgres has no binaries for ${process.platform}-${process.arch}`);
  const fromEmbedded = createRequire(createRequire(import.meta.url).resolve('embedded-postgres'));
  binaries = await import(pathToFileURL(fromEmbedded.resolve(`@embedded-postgres/${name}`)).href);
  return binaries;
}

/**
 * Runs pg_ctl without pipes: the server it starts would otherwise inherit our stdout/stderr and
 * keep them open, so waiting for the pipes to close would never finish (notably on Windows).
 * Resolves with the exit code.
 */
async function pgCtl(args) {
  const { pg_ctl } = await pgBinaries();
  return new Promise((resolve, reject) => {
    const child = spawn(pg_ctl, args, { stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

export async function pgIsRunning(dataDir) {
  return (await pgCtl(['status', '-D', dataDir])) === 0;
}

/** Starts the server in the background and waits until it accepts connections. */
export async function pgStart({ dataDir, port, logFile }) {
  const code = await pgCtl(['start', '-D', dataDir, '-o', `-p ${port} -c io_method=sync`, '-l', logFile, '-w', '-t', '60']);
  if (code !== 0) throw new Error(`${basename(dataDir)}: PostgreSQL did not start (pg_ctl exit ${code}). See ${logFile}`);
}

/** Fast, clean shutdown (rolls back open transactions, no crash recovery on next start). */
export async function pgStop(dataDir) {
  if (!(await pgIsRunning(dataDir))) return;
  const code = await pgCtl(['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '60']);
  if (code !== 0) throw new Error(`${basename(dataDir)}: PostgreSQL did not stop cleanly (pg_ctl exit ${code}).`);
}
