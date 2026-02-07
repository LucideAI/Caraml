import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const TOOLCHAIN = {
  compiler: 'ocaml-base-compiler.5.6.0',
  merlin: 'merlin.5.6.1-504',
  ocamlformat: 'ocamlformat.0.28.1',
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(scriptDir);
const localSwitchDir = join(rootDir, '_opam');

function fail(message) {
  console.error(`\n[setup:ocaml] ${message}\n`);
  process.exit(1);
}

function describeSpawnError(cmd, error) {
  if (error.code === 'ENOENT') {
    return `Command not found: ${cmd}. Install opam first: https://opam.ocaml.org/doc/Install.html`;
  }
  if (error.code === 'EPERM' || error.code === 'EACCES') {
    return `Cannot execute ${cmd} (${error.code}). Check terminal permissions and ensure opam is installed correctly.`;
  }
  return `${cmd} failed to start: ${error.message}`;
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    fail(describeSpawnError(cmd, result.error));
  }

  if (result.status !== 0) {
    fail(`${cmd} ${args.join(' ')} failed with exit code ${result.status}`);
  }
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

console.log('\n[setup:ocaml] Checking opam...');
const opamVersion = capture('opam', ['--version']);
if (!opamVersion) {
  fail('opam is not available in PATH. Install it first: https://opam.ocaml.org/doc/Install.html');
}
console.log(`[setup:ocaml] opam ${opamVersion}`);

console.log('\n[setup:ocaml] Updating opam package index...');
run('opam', ['update', '--yes']);

if (!existsSync(localSwitchDir)) {
  console.log(`\n[setup:ocaml] Creating local switch in ${localSwitchDir}...`);
  run('opam', ['switch', 'create', '.', TOOLCHAIN.compiler, '--yes', '--no-install']);
} else {
  console.log(`\n[setup:ocaml] Reusing existing local switch at ${localSwitchDir}...`);
  run('opam', ['switch', 'set', '.', '--yes']);
}

console.log('\n[setup:ocaml] Installing OCaml tooling...');
run('opam', [
  'install',
  '--yes',
  TOOLCHAIN.compiler,
  TOOLCHAIN.merlin,
  TOOLCHAIN.ocamlformat,
]);

const ocamlVersion = capture('opam', ['exec', '--switch=.', '--', 'ocaml', '-version']) || 'not found';
const merlinVersion = capture('opam', ['exec', '--switch=.', '--', 'ocamlmerlin', '-version']) || 'not found';
const ocamlformatVersion = capture('opam', ['exec', '--switch=.', '--', 'ocamlformat', '--version']) || 'not found';

console.log('\n[setup:ocaml] Installed toolchain:');
console.log(`  ocaml:       ${ocamlVersion}`);
console.log(`  ocamlmerlin: ${merlinVersion}`);
console.log(`  ocamlformat: ${ocamlformatVersion}`);

console.log('\n[setup:ocaml] Done. You can now run: npm run dev\n');
