import { Router } from 'express';
import { spawn, execFileSync } from 'child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join, delimiter } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const router = Router();

// ── Detect available OCaml tools ────────────────────────────────────────────
function getPathKey(env) {
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path') return key;
  }
  return 'PATH';
}

function normalizeMaybeQuotedPath(value) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^"(.*)"$/);
  return quoted ? quoted[1] : trimmed;
}

function pathsEqual(a, b) {
  if (process.platform === 'win32') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

function buildToolEnv() {
  const env = { ...process.env };
  const pathKey = getPathKey(env);
  const pathValue = env[pathKey] || '';
  const pathEntries = pathValue.split(delimiter).map((entry) => entry.trim()).filter(Boolean);

  try {
    const opamBin = execFileSync('opam', ['var', 'bin'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (opamBin) {
      const normalizedOpamBin = normalizeMaybeQuotedPath(opamBin);
      const alreadyInPath = pathEntries.some((entry) => pathsEqual(normalizeMaybeQuotedPath(entry), normalizedOpamBin));
      if (!alreadyInPath) {
        env[pathKey] = [normalizedOpamBin, ...pathEntries].join(delimiter);
      }
    }
  } catch {
    // opam is optional
  }

  return env;
}

function resolveOnPath(toolName, env) {
  const pathKey = getPathKey(env);
  const pathValue = env[pathKey];
  if (!pathValue) return null;

  const entries = pathValue.split(delimiter).map((entry) => normalizeMaybeQuotedPath(entry)).filter(Boolean);
  const isWindows = process.platform === 'win32';

  let candidateNames = [toolName];
  if (isWindows && !/\.[^\\/]+$/.test(toolName)) {
    const pathext = (env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
      .split(';')
      .map((ext) => ext.trim())
      .filter(Boolean);
    candidateNames = [toolName, ...pathext.map((ext) => `${toolName}${ext}`)];
  }

  for (const dir of entries) {
    for (const candidateName of candidateNames) {
      const candidatePath = join(dir, candidateName);
      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

function resolveTool(toolName, overrideEnvVar, env) {
  const rawOverride = process.env[overrideEnvVar];
  if (typeof rawOverride === 'string' && rawOverride.trim()) {
    const overrideValue = normalizeMaybeQuotedPath(rawOverride);
    if (existsSync(overrideValue)) {
      return overrideValue;
    }

    const resolvedOverride = resolveOnPath(overrideValue, env);
    if (resolvedOverride) {
      return resolvedOverride;
    }

    console.warn(`  [tooling] ${overrideEnvVar} points to an unavailable executable: ${overrideValue}`);
  }

  return resolveOnPath(toolName, env);
}

const TOOL_ENV = buildToolEnv();
const OCAML_PATH = resolveTool('ocaml', 'CARAML_OCAML_PATH', TOOL_ENV);
const OCAMLMERLIN_PATH = resolveTool('ocamlmerlin', 'CARAML_OCAMLMERLIN_PATH', TOOL_ENV);
const OCAMLFORMAT_PATH = resolveTool('ocamlformat', 'CARAML_OCAMLFORMAT_PATH', TOOL_ENV);
const OCAML_VERSION = OCAML_PATH ? (() => {
  try {
    return execFileSync(OCAML_PATH, ['-version'], {
      encoding: 'utf8',
      timeout: 3000,
      env: TOOL_ENV,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
})() : null;

export function logToolchain() {
  console.log('  OCaml toolchain:');
  console.log(`    ocaml:       ${OCAML_PATH || '(not found — fallback to browser interpreter)'}`);
  console.log(`    ocamlmerlin: ${OCAMLMERLIN_PATH || '(not found — basic completions only)'}`);
  console.log(`    ocamlformat: ${OCAMLFORMAT_PATH || '(not found — formatting disabled)'}`);
  console.log('');
}

// ── Merlin helper ───────────────────────────────────────────────────────────
function runMerlin(command, code) {
  const tmpDir = join(tmpdir(), `caraml-merlin-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = join(tmpDir, 'code.ml');
  writeFileSync(tmpFile, code);

  try {
    const result = execFileSync(OCAMLMERLIN_PATH, ['single', ...command, '-filename', 'code.ml'], {
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
      input: code,
      env: TOOL_ENV,
    });
    rmSync(tmpDir, { recursive: true, force: true });
    return JSON.parse(result);
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────
router.get('/capabilities', (req, res) => {
  res.json({
    ocaml: !!OCAML_PATH,
    ocamlVersion: OCAML_VERSION,
    merlin: !!OCAMLMERLIN_PATH,
    ocamlformat: !!OCAMLFORMAT_PATH,
  });
});

router.post('/execute', (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required' });
  }

  if (!OCAML_PATH) {
    return res.json({ backend: false, message: 'OCaml not available on server, using browser interpreter' });
  }

  const timeout = 10000;
  const startTime = Date.now();

  const tmpDir = join(tmpdir(), `caraml-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = join(tmpDir, 'code.ml');
  writeFileSync(tmpFile, code);

  const child = spawn(OCAML_PATH, [tmpFile], {
    cwd: tmpDir,
    env: TOOL_ENV,
    timeout: timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => { stdout += data.toString(); });
  child.stderr.on('data', (data) => { stderr += data.toString(); });

  const killTimer = setTimeout(() => { child.kill('SIGKILL'); }, timeout);

  child.on('close', (exitCode) => {
    clearTimeout(killTimer);
    const executionTimeMs = Date.now() - startTime;
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}

    const errors = [];
    if (stderr) {
      const errorRegex = /File ".*?", line (\d+), characters? (\d+)[-–](\d+):\s*\n((?:Error|Warning).*?)(?=\nFile "|$)/gs;
      let match;
      while ((match = errorRegex.exec(stderr)) !== null) {
        errors.push({ line: parseInt(match[1]), column: parseInt(match[2]), message: match[4].trim() });
      }
      if (errors.length === 0 && stderr.trim()) {
        const simpleError = stderr.match(/Error: (.*)/);
        if (simpleError) {
          errors.push({ line: 0, column: 0, message: simpleError[1].trim() });
        } else {
          errors.push({ line: 0, column: 0, message: stderr.trim() });
        }
      }
    }

    res.json({ backend: true, stdout, stderr, exitCode, errors, executionTimeMs });
  });

  child.on('error', (err) => {
    clearTimeout(killTimer);
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    res.json({ backend: true, stdout: '', stderr: err.message, exitCode: 1, errors: [{ line: 0, column: 0, message: err.message }], executionTimeMs: Date.now() - startTime });
  });
});

router.post('/toplevel', (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required' });
  }

  if (!OCAML_PATH) {
    return res.json({ backend: false });
  }

  const timeout = 10000;
  const startTime = Date.now();

  const child = spawn(OCAML_PATH, ['-noprompt', '-color', 'never'], {
    env: TOOL_ENV,
    timeout: timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => { stdout += data.toString(); });
  child.stderr.on('data', (data) => { stderr += data.toString(); });

  let codeToSend = code.trim();
  if (!codeToSend.endsWith(';;')) {
    codeToSend += ';;';
  }

  child.stdin.write(codeToSend + '\n');
  child.stdin.end();

  const killTimer = setTimeout(() => { child.kill('SIGKILL'); }, timeout);

  child.on('close', (exitCode) => {
    clearTimeout(killTimer);
    const executionTimeMs = Date.now() - startTime;

    let fullOutput = stdout
      .replace(/^OCaml version.*\n/m, '')
      .replace(/^Enter #help;;.*\n?/m, '');

    const values = [];
    const valRegex = /val\s+(\w+)\s*:\s*([^=]+)=\s*(.*)/g;
    let match;
    while ((match = valRegex.exec(fullOutput)) !== null) {
      values.push({ name: match[1].trim(), type: match[2].trim(), value: match[3].trim() });
    }

    const typeRegex = /type\s+(.*)/g;
    while ((match = typeRegex.exec(fullOutput)) !== null) {
      values.push({ name: '_type', type: 'type', value: 'type ' + match[1].trim() });
    }

    const excRegex = /exception\s+(.*)/g;
    while ((match = excRegex.exec(fullOutput)) !== null) {
      values.push({ name: '_exc', type: 'exception', value: 'exception ' + match[1].trim() });
    }

    const anonRegex = /- : ([^=]+)=\s*(.*)/g;
    while ((match = anonRegex.exec(fullOutput)) !== null) {
      values.push({ name: '-', type: match[1].trim(), value: match[2].trim() });
    }

    const errors = [];
    if (stderr) {
      const errorRegex = /File ".*?", line (\d+), characters? (\d+)[-–](\d+):\s*\n((?:Error|Warning)[^\n]*(?:\n(?!File )[^\n]*)*)/gs;
      let m;
      while ((m = errorRegex.exec(stderr)) !== null) {
        errors.push({ line: parseInt(m[1]), column: parseInt(m[2]), message: m[4].trim() });
      }
      if (errors.length === 0 && stderr.trim()) {
        const lines = stderr.trim().split('\n');
        const errMsg = lines.find(l => l.startsWith('Error:')) || lines.join(' ');
        errors.push({ line: 0, column: 0, message: errMsg });
      }
    }

    let cleanedOutput = stdout
      .replace(/^OCaml version.*\n/m, '')
      .replace(/^Enter #help;;.*\n?/m, '')
      .replace(/\n+$/g, '\n');

    const programOutput = cleanedOutput
      .replace(/val\s+\w+\s*:.*\n?/g, '')
      .replace(/type\s+.*\n?/g, '')
      .replace(/exception\s+.*\n?/g, '')
      .replace(/- : [^=]+=.*\n?/g, '')
      .replace(/^#\s*/gm, '')
      .trim();

    res.json({ backend: true, output: programOutput, rawOutput: stdout, values, errors, exitCode, executionTimeMs });
  });

  child.on('error', (err) => {
    clearTimeout(killTimer);
    res.json({ backend: true, output: '', values: [], errors: [{ line: 0, column: 0, message: err.message }], exitCode: 1, executionTimeMs: Date.now() - startTime });
  });
});

router.post('/format', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });

  if (!OCAMLFORMAT_PATH) {
    return res.status(501).json({ error: 'ocamlformat not available' });
  }

  try {
    const tmpDir = join(tmpdir(), `caraml-fmt-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
    const tmpFile = join(tmpDir, 'code.ml');
    const confFile = join(tmpDir, '.ocamlformat');

    writeFileSync(confFile, 'profile = default\nmargin = 80\n');
    writeFileSync(tmpFile, code);

    const formatted = execFileSync(OCAMLFORMAT_PATH, [tmpFile], {
      encoding: 'utf8',
      timeout: 5000,
      cwd: tmpDir,
      env: TOOL_ENV,
    });

    rmSync(tmpDir, { recursive: true, force: true });
    res.json({ formatted });
  } catch (err) {
    res.status(422).json({ error: err.stderr?.toString() || err.message || 'Format failed' });
  }
});

router.post('/merlin/complete', (req, res) => {
  const { code, position, prefix } = req.body;
  if (!OCAMLMERLIN_PATH) {
    return res.json({ backend: false, completions: [] });
  }

  try {
    const parsed = runMerlin([
      'complete-prefix',
      '-position', `${position.line}:${position.column}`,
      '-prefix', prefix || '',
      '-doc', 'true',
    ], code);

    if (parsed.class === 'return' && parsed.value?.entries) {
      const completions = parsed.value.entries.map(e => ({
        label: e.name, kind: e.kind, detail: e.desc, documentation: e.info,
      }));
      res.json({ backend: true, completions });
    } else {
      res.json({ backend: true, completions: [] });
    }
  } catch (err) {
    res.json({ backend: true, completions: [], error: err.message });
  }
});

router.post('/merlin/type', (req, res) => {
  const { code, position } = req.body;
  if (!OCAMLMERLIN_PATH) {
    return res.json({ backend: false });
  }

  try {
    const parsed = runMerlin([
      'type-enclosing',
      '-position', `${position.line}:${position.column}`,
    ], code);

    if (parsed.class === 'return' && parsed.value?.length > 0) {
      res.json({ backend: true, type: parsed.value[0].type, tail: parsed.value[0].tail });
    } else {
      res.json({ backend: true, type: null });
    }
  } catch (err) {
    res.json({ backend: true, type: null, error: err.message });
  }
});

router.post('/merlin/errors', (req, res) => {
  const { code } = req.body;
  if (!OCAMLMERLIN_PATH) {
    return res.json({ backend: false, errors: [] });
  }

  try {
    const parsed = runMerlin(['errors'], code);

    if (parsed.class === 'return' && Array.isArray(parsed.value)) {
      const errors = parsed.value.map(e => ({
        line: e.start?.line || 0, column: e.start?.col || 0,
        endLine: e.end?.line || 0, endColumn: e.end?.col || 0,
        message: e.message, severity: e.type,
      }));
      res.json({ backend: true, errors });
    } else {
      res.json({ backend: true, errors: [] });
    }
  } catch (err) {
    res.json({ backend: true, errors: [], error: err.message });
  }
});

// ── Exported helpers for other routes ────────────────────────────────────────
export { OCAML_PATH, TOOL_ENV };

/**
 * Run OCaml code through the toplevel and return parsed results.
 * Returns { output, values, errors, exitCode, executionTimeMs } or null if OCaml unavailable.
 */
export function runOcamlToplevel(code) {
  if (!OCAML_PATH) return Promise.resolve(null);

  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeout = 10000;

    const child = spawn(OCAML_PATH, ['-noprompt', '-color', 'never'], {
      env: TOOL_ENV,
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    let codeToSend = code.trim();
    if (!codeToSend.endsWith(';;')) codeToSend += ';;';
    child.stdin.write(codeToSend + '\n');
    child.stdin.end();

    const killTimer = setTimeout(() => { child.kill('SIGKILL'); }, timeout);

    child.on('close', (exitCode) => {
      clearTimeout(killTimer);
      const executionTimeMs = Date.now() - startTime;

      const errors = [];
      if (stderr) {
        const errorRegex = /File ".*?", line (\d+), characters? (\d+)[-–](\d+):\s*\n((?:Error|Warning)[^\n]*(?:\n(?!File )[^\n]*)*)/gs;
        let m;
        while ((m = errorRegex.exec(stderr)) !== null) {
          errors.push({ line: parseInt(m[1]), column: parseInt(m[2]), message: m[4].trim() });
        }
        if (errors.length === 0 && stderr.trim()) {
          const lines = stderr.trim().split('\n');
          const errMsg = lines.find(l => l.startsWith('Error:')) || lines.join(' ');
          errors.push({ line: 0, column: 0, message: errMsg });
        }
      }

      const values = [];
      const fullOutput = stdout.replace(/^OCaml version.*\n/m, '').replace(/^Enter #help;;.*\n?/m, '');
      const valRegex = /val\s+(\w+)\s*:\s*([^=]+)=\s*(.*)/g;
      let match;
      while ((match = valRegex.exec(fullOutput)) !== null) {
        values.push({ name: match[1].trim(), type: match[2].trim(), value: match[3].trim() });
      }

      resolve({ output: fullOutput.trim(), values, errors, exitCode, executionTimeMs });
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      resolve({ output: '', values: [], errors: [{ line: 0, column: 0, message: err.message }], exitCode: 1, executionTimeMs: Date.now() - startTime });
    });
  });
}

export default router;
