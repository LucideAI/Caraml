import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const TOOLCHAIN = {
  compiler: 'ocaml-base-compiler.5.4.0',
  merlin: 'merlin.5.6.1-504',
  ocamlformat: 'ocamlformat.0.28.1',
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(scriptDir);
const localSwitchDir = join(rootDir, '_opam');
const OPAM_BIN = (process.env.CARAML_OPAM_BIN || 'opam').trim();

function fail(message) {
  console.error(`\n[setup:ocaml] ${message}\n`);
  process.exit(1);
}

function describeSpawnError(cmd, error) {
  if (error.code === 'ENOENT') {
    return `Command not found: ${cmd}. Install opam first (Windows: winget install Git.Git OCaml.opam): https://opam.ocaml.org/doc/Install.html`;
  }
  if (error.code === 'EPERM' || error.code === 'EACCES') {
    return `Cannot execute ${cmd} (${error.code}). Check terminal permissions and ensure opam is installed correctly.`;
  }
  return `${cmd} failed to start: ${error.message}`;
}

function run(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: rootDir,
      stdio: 'inherit',
      ...options,
    });

    const startedAt = Date.now();
    const phase = args[0] || cmd;
    const heartbeat = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
      const minutes = Math.floor(elapsedSec / 60);
      const seconds = elapsedSec % 60;
      console.log(`[setup:ocaml] still running (${minutes}m${seconds}s): ${phase}`);
    }, 30000);

    if (typeof heartbeat.unref === 'function') {
      heartbeat.unref();
    }

    child.on('error', (error) => {
      clearInterval(heartbeat);
      fail(describeSpawnError(cmd, error));
    });

    child.on('close', (code) => {
      clearInterval(heartbeat);
      if (code !== 0) {
        fail(`${cmd} ${args.join(' ')} failed with exit code ${code}`);
      }
      resolve();
    });
  });
}

function capture(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') return null;
    fail(describeSpawnError(cmd, result.error));
  }

  if (result.status !== 0) {
    return null;
  }

  return (result.stdout || '').trim();
}

function status(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: 'ignore',
  });

  if (result.error) {
    return { ok: false, code: null };
  }

  return { ok: result.status === 0, code: result.status };
}

async function ensureOpamInitialized() {
  const initialized = status(OPAM_BIN, ['var', 'root']);
  if (initialized.ok) return;

  console.log('\n[setup:ocaml] opam is not initialized yet. Running opam init...');
  const initArgs = ['init', '--yes', '--no-setup', '--disable-sandboxing'];
  if (process.platform === 'win32') {
    // Avoid interactive Unix toolchain selection on Windows.
    initArgs.push('--cygwin-internal-install');
  }
  await run(OPAM_BIN, initArgs);
}

async function main() {
  console.log('\n[setup:ocaml] Checking opam...');
  const opamVersion = capture(OPAM_BIN, ['--version']);
  if (!opamVersion) {
    fail(`opam is not available (tried: ${OPAM_BIN}). Install it first (Windows: winget install Git.Git OCaml.opam): https://opam.ocaml.org/doc/Install.html`);
  }
  console.log(`[setup:ocaml] opam ${opamVersion}`);

  await ensureOpamInitialized();

  console.log('\n[setup:ocaml] Updating opam package index...');
  await run(OPAM_BIN, ['update', '--yes']);

  if (!existsSync(localSwitchDir)) {
    console.log(`\n[setup:ocaml] Creating local switch in ${localSwitchDir}...`);
    await run(OPAM_BIN, ['switch', 'create', '.', TOOLCHAIN.compiler, '--yes', '--no-install']);
  } else {
    console.log(`\n[setup:ocaml] Reusing existing local switch at ${localSwitchDir}...`);
    await run(OPAM_BIN, ['switch', 'set', '.', '--yes']);
  }

  console.log('\n[setup:ocaml] Installing OCaml tooling (this can take several minutes on first run)...');
  await run(OPAM_BIN, [
    'install',
    '--yes',
    TOOLCHAIN.compiler,
    TOOLCHAIN.merlin,
    TOOLCHAIN.ocamlformat,
  ]);

  const ocamlVersion = capture(OPAM_BIN, ['exec', '--switch=.', '--', 'ocaml', '-version']) || 'not found';
  const merlinVersion = capture(OPAM_BIN, ['exec', '--switch=.', '--', 'ocamlmerlin', '-version']) || 'not found';
  const ocamlformatVersion = capture(OPAM_BIN, ['exec', '--switch=.', '--', 'ocamlformat', '--version']) || 'not found';

  console.log('\n[setup:ocaml] Installed toolchain:');
  console.log(`  ocaml:       ${ocamlVersion}`);
  console.log(`  ocamlmerlin: ${merlinVersion}`);
  console.log(`  ocamlformat: ${ocamlformatVersion}`);
  console.log('\n[setup:ocaml] Done. You can now run: npm run dev\n');
}

await main();
