import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(scriptsDir);

const processes = [
  {
    name: 'server',
    command: process.execPath,
    args: ['server.js'],
  },
  {
    name: 'client',
    command: process.execPath,
    args: [join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '5173'],
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
    env: process.env,
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
