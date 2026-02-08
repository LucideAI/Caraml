import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { delimiter, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const localSwitchDir = join(rootDir, '_opam');

function runQuiet(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: 'ignore',
    ...options,
  });
}

function runInherit(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options,
  });
}

function commandAvailable(cmd) {
  const result = runQuiet(cmd, ['--version']);
  return !result.error && result.status === 0;
}

function findExecutableInPath(executableName) {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const rawPath = process.env[pathKey] || '';
  const entries = rawPath.split(delimiter).map((entry) => entry.trim()).filter(Boolean);

  for (const dir of entries) {
    const candidate = join(dir.replace(/^"(.*)"$/, '$1'), executableName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveOpamCommand() {
  const envOverride = process.env.CARAML_OPAM_BIN;
  if (envOverride && existsSync(envOverride)) {
    return envOverride;
  }

  if (commandAvailable('opam')) {
    return 'opam';
  }

  if (process.platform !== 'win32') {
    return null;
  }

  const fromPath = findExecutableInPath('opam.exe');
  if (fromPath) return fromPath;

  const candidates = [
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'opam', 'bin', 'opam.exe') : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'opam', 'opam.exe') : null,
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'opam', 'bin', 'opam.exe') : null,
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'opam', 'opam.exe') : null,
    process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)'], 'opam', 'bin', 'opam.exe') : null,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, '.local', 'bin', 'opam.exe') : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function hasLocalToolchain(opamCmd) {
  if (!existsSync(localSwitchDir)) return false;
  if (!opamCmd) return false;

  const ocaml = runQuiet(opamCmd, ['exec', '--switch=.', '--', 'ocaml', '-version']);
  const merlin = runQuiet(opamCmd, ['exec', '--switch=.', '--', 'ocamlmerlin', '-version']);

  return ocaml.status === 0 && merlin.status === 0;
}

function tryInstallViaWinget() {
  if (!commandAvailable('winget')) {
    return null;
  }

  const installArgs = [
    'install',
    '--silent',
    '--accept-package-agreements',
    '--accept-source-agreements',
  ];

  // Best-effort: may already be installed.
  runInherit('winget', [...installArgs, '--id', 'Git.Git', '-e']);

  const result = runInherit('winget', [...installArgs, '--id', 'OCaml.opam', '-e']);
  return !result.error && result.status === 0;
}

function tryInstallViaOfficialScript() {
  const powershellCmd = commandAvailable('powershell.exe')
    ? 'powershell.exe'
    : 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

  if (!existsSync(powershellCmd) && powershellCmd !== 'powershell.exe') {
    console.warn('[auto-ocaml] PowerShell not found for official installer.');
    return false;
  }

  const command = "$ErrorActionPreference = 'Stop'; Invoke-Expression \"& { $(Invoke-RestMethod https://opam.ocaml.org/install.ps1) }\"";
  const result = spawnSync(powershellCmd, [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    command,
  ], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    input: '\n',
  });

  const ok = !result.error && result.status === 0;
  if (!ok) {
    const stderr = (result.stderr || '').toString().trim();
    if (stderr) {
      const firstLine = stderr.split(/\r?\n/)[0];
      console.warn(`[auto-ocaml] official installer failed: ${firstLine}`);
    }
  }
  return ok;
}

function tryInstallOpamWindows() {
  console.log('[auto-ocaml] opam not found. Trying winget...');
  const wingetResult = tryInstallViaWinget();
  if (wingetResult === true) {
    return true;
  }
  if (wingetResult === null) {
    console.log('[auto-ocaml] winget not available. Trying official opam installer...');
  } else {
    console.log('[auto-ocaml] winget install failed. Trying official opam installer...');
  }

  return tryInstallViaOfficialScript();
}

function runSetupScript(opamCmd) {
  const setupPath = join(rootDir, 'scripts', 'setup-ocaml.mjs');
  const result = spawnSync(process.execPath, [setupPath], {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, ...(opamCmd ? { CARAML_OPAM_BIN: opamCmd } : {}) },
  });
  return !result.error && result.status === 0;
}

if (process.env.CARAML_SKIP_OCAML_AUTO_SETUP === '1') {
  process.exit(0);
}

let opamCmd = resolveOpamCommand();
if (hasLocalToolchain(opamCmd)) {
  process.exit(0);
}

console.log('\n[auto-ocaml] Toolchain missing. Auto-setup starting...');

if (!opamCmd) {
  if (process.platform === 'win32') {
    const installed = tryInstallOpamWindows();
    if (!installed) {
      console.warn('[auto-ocaml] Could not auto-install opam. Starting in fallback mode.');
      process.exit(0);
    }

    opamCmd = resolveOpamCommand();
    if (!opamCmd) {
      console.warn('[auto-ocaml] opam installation did not become available in this shell.');
      console.warn('[auto-ocaml] Restart terminal and run npm run dev again. If needed: https://opam.ocaml.org/doc/Install.html');
      process.exit(0);
    }
  } else {
    console.warn('[auto-ocaml] opam not found. Starting in fallback mode.');
    process.exit(0);
  }
}

const setupOk = runSetupScript(opamCmd);
if (!setupOk) {
  console.warn('[auto-ocaml] setup:ocaml failed. Starting in fallback mode.');
}

process.exit(0);
