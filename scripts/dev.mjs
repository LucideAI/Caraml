import { spawn, spawnSync } from 'child_process';
import { createServer } from 'net';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(scriptsDir);
const ensureOcamlPath = join(rootDir, 'scripts', 'ensure-ocaml.mjs');
const skipOcamlAutoSetup =
  process.env.CARAML_SKIP_OCAML_AUTO_SETUP === '1' ||
  process.argv.includes('--skip-ocaml') ||
  process.argv.includes('--no-ocaml');

if (!skipOcamlAutoSetup) {
  const ensureResult = spawnSync(process.execPath, [ensureOcamlPath], {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  });

  if (ensureResult.error || ensureResult.status !== 0) {
    console.warn('[dev] OCaml auto-setup step failed. Continuing in fallback mode.');
  }
} else {
  console.log('[dev] Skipping OCaml auto-setup (requested).');
}

function parsePort(value) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return null;
  return parsed;
}

function canListenOnPort(port) {
  return new Promise((resolve) => {
    const tester = createServer();

    const onError = () => {
      tester.removeAllListeners();
      resolve(false);
    };

    tester.once('error', onError);
    tester.listen({ port, host: '127.0.0.1' }, () => {
      tester.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort, maxAttempts = 25) {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = startPort + offset;
    // eslint-disable-next-line no-await-in-loop
    const available = await canListenOnPort(candidate);
    if (available) return candidate;
  }
  return null;
}

const requestedApiPort = parsePort(process.env.CARAML_API_PORT) ?? 3001;
const apiPort = await findAvailablePort(requestedApiPort);

if (!apiPort) {
  console.error(`[dev] Could not find a free API port starting from ${requestedApiPort}.`);
  process.exit(1);
}
if (apiPort !== requestedApiPort) {
  console.warn(`[dev] API port ${requestedApiPort} is in use, using ${apiPort} instead.`);
}

const sharedEnv = {
  ...process.env,
  CARAML_API_PORT: String(apiPort),
};

const processes = [
  {
    name: 'server',
    command: process.execPath,
    args: ['server.js'],
    env: { ...sharedEnv, PORT: String(apiPort) },
  },
  {
    name: 'client',
    command: process.execPath,
    args: [join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '5173'],
    env: sharedEnv,
  },
];

const children = [];
let shuttingDown = false;
let exitCode = 0;
let remaining = processes.length;

function stopChildren(signal = 'SIGTERM') {
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        // Best effort shutdown
      }
    }
  }
}

function triggerShutdown(reason, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = code;
  if (reason) {
    console.error(`[dev] ${reason}`);
  }
  stopChildren('SIGTERM');
  setTimeout(() => stopChildren('SIGKILL'), 3000).unref();
}

for (const proc of processes) {
  const child = spawn(proc.command, proc.args, {
    cwd: rootDir,
    env: proc.env || process.env,
    stdio: 'inherit',
    windowsHide: false,
    shell: false,
  });

  children.push(child);

  child.on('error', (err) => {
    triggerShutdown(`${proc.name} failed to start: ${err.message}`, 1);
  });

  child.on('close', (code, signal) => {
    remaining -= 1;

    if (!shuttingDown) {
      if (signal) {
        triggerShutdown(`${proc.name} exited with signal ${signal}`, 1);
      } else if (code !== 0) {
        triggerShutdown(`${proc.name} exited with code ${code}`, code || 1);
      } else {
        triggerShutdown(`${proc.name} exited`, 0);
      }
    }

    if (remaining === 0) {
      process.exit(exitCode);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    triggerShutdown(`received ${signal}`, 0);
  });
}
