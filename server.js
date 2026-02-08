import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join, delimiter } from 'path';
import { spawn, execFileSync } from 'child_process';
import { writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const DEFAULT_PORT = 3001;
const portFromEnv = Number.parseInt(process.env.CARAML_API_PORT || process.env.PORT || '', 10);
const PORT = Number.isFinite(portFromEnv) && portFromEnv > 0 ? portFromEnv : DEFAULT_PORT;
const JWT_SECRET = process.env.JWT_SECRET || 'caraml-secret-key-change-in-production-2024';

// ── Database Setup ──────────────────────────────────────────────────────────
const db = new Database(join(__dirname, 'caraml.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#06b6d4',
    ui_prefs TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    files TEXT NOT NULL DEFAULT '{}',
    share_id TEXT UNIQUE,
    is_public INTEGER DEFAULT 0,
    last_opened_file TEXT DEFAULT 'main.ml',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
  CREATE INDEX IF NOT EXISTS idx_projects_share_id ON projects(share_id);
`);

// Backward-compatible migration for existing databases.
const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (!userColumns.some((column) => column.name === 'ui_prefs')) {
  db.exec(`ALTER TABLE users ADD COLUMN ui_prefs TEXT NOT NULL DEFAULT '{}'`);
}

const PANEL_WIDTH_LIMITS = {
  fileTree: { min: 180, max: 420 },
  memory: { min: 300, max: 760 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseUiPrefs(rawPrefs) {
  if (!rawPrefs) return {};
  try {
    const parsed = JSON.parse(rawPrefs);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizePanelWidths(panelWidths) {
  const next = {};
  if (!panelWidths || typeof panelWidths !== 'object') return next;

  if (Number.isFinite(panelWidths.fileTree)) {
    next.fileTree = Math.round(
      clamp(panelWidths.fileTree, PANEL_WIDTH_LIMITS.fileTree.min, PANEL_WIDTH_LIMITS.fileTree.max)
    );
  }
  if (Number.isFinite(panelWidths.memory)) {
    next.memory = Math.round(
      clamp(panelWidths.memory, PANEL_WIDTH_LIMITS.memory.min, PANEL_WIDTH_LIMITS.memory.max)
    );
  }

  return next;
}

function mergeUiPrefs(existingPrefs, incomingPrefs) {
  const current = existingPrefs && typeof existingPrefs === 'object' ? existingPrefs : {};
  const incoming = incomingPrefs && typeof incomingPrefs === 'object' ? incomingPrefs : {};
  const merged = { ...current };

  if (incoming.panelWidths !== undefined) {
    merged.panelWidths = {
      ...(current.panelWidths && typeof current.panelWidths === 'object' ? current.panelWidths : {}),
      ...sanitizePanelWidths(incoming.panelWidths),
    };
  }

  return merged;
}

function serializeUser(userRow) {
  return {
    id: userRow.id,
    username: userRow.username,
    email: userRow.email,
    avatar_color: userRow.avatar_color,
    created_at: userRow.created_at,
    ui_prefs: parseUiPrefs(userRow.ui_prefs),
  };
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Serve static files in production
app.use(express.static(join(__dirname, 'dist')));

// Auth middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional auth (doesn't fail if no token)
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // ignore
    }
  }
  next();
}

// ── Auth Routes ─────────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const id = randomUUID();
    const password_hash = bcrypt.hashSync(password, 10);
    const colors = ['#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#3b82f6'];
    const avatar_color = colors[Math.floor(Math.random() * colors.length)];

    db.prepare('INSERT INTO users (id, username, email, password_hash, avatar_color) VALUES (?, ?, ?, ?, ?)')
      .run(id, username, email, password_hash, avatar_color);

    // Create a default project
    const projectId = randomUUID();
    const defaultFiles = JSON.stringify({
      'main.ml': {
        content: '(* Welcome to Caraml! *)\n(* Your professional OCaml IDE *)\n\nlet () =\n    print_endline "Hello, OCaml!"\n\nlet square x = x * x\n\nlet rec factorial n =\n    if n <= 1 then 1\n    else n * factorial (n - 1)\n\nlet () =\n    Printf.printf "square 5 = %d\\n" (square 5);\n    Printf.printf "factorial 10 = %d\\n" (factorial 10)\n',
        language: 'ocaml'
      }
    });

    db.prepare('INSERT INTO projects (id, user_id, name, description, files) VALUES (?, ?, ?, ?, ?)')
      .run(projectId, id, 'My First Project', 'Getting started with OCaml', defaultFiles);

    const createdUser = db.prepare(
      'SELECT id, username, email, avatar_color, created_at, ui_prefs FROM users WHERE id = ?'
    ).get(id);
    const token = jwt.sign({ id, username, email, avatar_color }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: serializeUser(createdUser) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Login and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email, avatar_color: user.avatar_color },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: serializeUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, username, email, avatar_color, created_at, ui_prefs FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: serializeUser(user) });
});

app.put('/api/auth/preferences', authenticate, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, username, email, avatar_color, created_at, ui_prefs FROM users WHERE id = ?'
    ).get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const currentPrefs = parseUiPrefs(user.ui_prefs);
    const mergedPrefs = mergeUiPrefs(currentPrefs, req.body);

    db.prepare('UPDATE users SET ui_prefs = ? WHERE id = ?')
      .run(JSON.stringify(mergedPrefs), req.user.id);

    const updatedUser = db.prepare(
      'SELECT id, username, email, avatar_color, created_at, ui_prefs FROM users WHERE id = ?'
    ).get(req.user.id);

    res.json({ user: serializeUser(updatedUser) });
  } catch (err) {
    console.error('Update preferences error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Project Routes ──────────────────────────────────────────────────────────
app.get('/api/projects', authenticate, (req, res) => {
  try {
    const projects = db.prepare(
      'SELECT id, name, description, is_public, share_id, last_opened_file, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC'
    ).all(req.user.id);
    res.json({ projects });
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/projects', authenticate, (req, res) => {
  try {
    const { name, description, template } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });

    const id = randomUUID();
    let defaultContent = '(* New OCaml Project *)\n\nlet () =\n    print_endline "Hello, World!"\n';

    if (template === 'algorithms') {
      defaultContent = `(* Algorithms & Data Structures *)

(* Binary search *)
let binary_search arr target =
    let rec aux lo hi =
        if lo > hi then -1
        else
            let mid = (lo + hi) / 2 in
            if arr.(mid) = target then mid
            else if arr.(mid) < target then aux (mid + 1) hi
            else aux lo (mid - 1)
    in
    aux 0 (Array.length arr - 1)

(* Quick sort *)
let rec quicksort = function
    | [] -> []
    | pivot :: rest ->
        let left = List.filter (fun x -> x < pivot) rest in
        let right = List.filter (fun x -> x >= pivot) rest in
        quicksort left @ [pivot] @ quicksort right

let () =
    let sorted = quicksort [3; 6; 8; 10; 1; 2; 1] in
    List.iter (fun x -> Printf.printf "%d " x) sorted;
    print_newline ()
`;
    } else if (template === 'functional') {
      defaultContent = `(* Functional Programming Patterns *)

(* Option monad *)
let ( >>= ) opt f = match opt with
    | None -> None
    | Some x -> f x

let ( >>| ) opt f = match opt with
    | None -> None
    | Some x -> Some (f x)

(* Pipe operator *)
let ( |> ) x f = f x

(* Function composition *)
let compose f g x = f (g x)

(* Currying examples *)
let add x y = x + y
let add5 = add 5

let () =
    let result = Some 42 >>| (fun x -> x * 2) >>= (fun x ->
        if x > 50 then Some x else None
    ) in
    match result with
    | Some v -> Printf.printf "Result: %d\\n" v
    | None -> print_endline "No result"
`;
    }

    const files = JSON.stringify({
      'main.ml': { content: defaultContent, language: 'ocaml' }
    });

    db.prepare('INSERT INTO projects (id, user_id, name, description, files) VALUES (?, ?, ?, ?, ?)')
      .run(id, req.user.id, name, description || '', files);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.json({ project: { ...project, files: JSON.parse(project.files) } });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:id', authenticate, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project: { ...project, files: JSON.parse(project.files) } });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/projects/:id', authenticate, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { name, description, files, last_opened_file } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (files !== undefined) { updates.push('files = ?'); params.push(JSON.stringify(files)); }
    if (last_opened_file !== undefined) { updates.push('last_opened_file = ?'); params.push(last_opened_file); }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    res.json({ project: { ...updated, files: JSON.parse(updated.files) } });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/projects/:id', authenticate, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Sharing Routes ──────────────────────────────────────────────────────────
app.post('/api/projects/:id/share', authenticate, (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    let shareId = project.share_id;
    if (!shareId) {
      shareId = randomUUID().slice(0, 8);
      db.prepare('UPDATE projects SET share_id = ?, is_public = 1 WHERE id = ?').run(shareId, req.params.id);
    } else {
      db.prepare('UPDATE projects SET is_public = 1 WHERE id = ?').run(req.params.id);
    }

    res.json({ share_id: shareId, url: `/shared/${shareId}` });
  } catch (err) {
    console.error('Share project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/projects/:id/unshare', authenticate, (req, res) => {
  try {
    db.prepare('UPDATE projects SET is_public = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Unshare project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/shared/:shareId', optionalAuth, (req, res) => {
  try {
    const project = db.prepare(
      `SELECT p.*, u.username as author_name FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.share_id = ? AND p.is_public = 1`
    ).get(req.params.shareId);

    if (!project) return res.status(404).json({ error: 'Shared project not found' });

    res.json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        files: JSON.parse(project.files),
        author_name: project.author_name,
        is_owner: req.user ? req.user.id === project.user_id : false,
        created_at: project.created_at,
        updated_at: project.updated_at,
      }
    });
  } catch (err) {
    console.error('Get shared project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fork a shared project
app.post('/api/shared/:shareId/fork', authenticate, (req, res) => {
  try {
    const project = db.prepare(
      `SELECT p.*, u.username as author_name FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.share_id = ? AND p.is_public = 1`
    ).get(req.params.shareId);

    if (!project) return res.status(404).json({ error: 'Shared project not found' });

    const newId = randomUUID();
    db.prepare('INSERT INTO projects (id, user_id, name, description, files) VALUES (?, ?, ?, ?, ?)')
      .run(newId, req.user.id, `${project.name} (fork)`, project.description, project.files);

    const forked = db.prepare('SELECT * FROM projects WHERE id = ?').get(newId);
    res.json({ project: { ...forked, files: JSON.parse(forked.files) } });
  } catch (err) {
    console.error('Fork project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// OCaml Tooling Integration (real compiler, merlin, ocamlformat)
// ══════════════════════════════════════════════════════════════════════════════

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

console.log('  OCaml toolchain:');
console.log(`    ocaml:       ${OCAML_PATH || '(not found — fallback to browser interpreter)'}`);
console.log(`    ocamlmerlin: ${OCAMLMERLIN_PATH || '(not found — basic completions only)'}`);
console.log(`    ocamlformat: ${OCAMLFORMAT_PATH || '(not found — formatting disabled)'}`);
console.log('');

// ── /api/capabilities — report what tools are available ─────────────────────
app.get('/api/capabilities', (req, res) => {
  res.json({
    ocaml: !!OCAML_PATH,
    ocamlVersion: OCAML_VERSION,
    merlin: !!OCAMLMERLIN_PATH,
    ocamlformat: !!OCAMLFORMAT_PATH,
  });
});

// ── /api/execute — run OCaml code via the real toplevel ─────────────────────
app.post('/api/execute', (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required' });
  }

  if (!OCAML_PATH) {
    return res.json({ backend: false, message: 'OCaml not available on server, using browser interpreter' });
  }

  const timeout = 10000; // 10 seconds max
  const startTime = Date.now();

  // Create a temp file for the code
  const tmpDir = join(tmpdir(), `caraml-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = join(tmpDir, 'code.ml');

  // We wrap the code to capture both the toplevel output and stdout
  // Using the OCaml toplevel in script mode
  writeFileSync(tmpFile, code);

  // Run via ocaml toplevel
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

  const killTimer = setTimeout(() => {
    child.kill('SIGKILL');
  }, timeout);

  child.on('close', (exitCode) => {
    clearTimeout(killTimer);
    const executionTimeMs = Date.now() - startTime;

    // Clean up temp files
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}

    // Parse errors from stderr
    const errors = [];
    if (stderr) {
      // OCaml error format: File "code.ml", line X, characters Y-Z:
      const errorRegex = /File ".*?", line (\d+), characters? (\d+)[-–](\d+):\s*\n((?:Error|Warning).*?)(?=\nFile "|$)/gs;
      let match;
      while ((match = errorRegex.exec(stderr)) !== null) {
        errors.push({
          line: parseInt(match[1]),
          column: parseInt(match[2]),
          message: match[4].trim(),
        });
      }
      // If no structured errors found, add the raw stderr
      if (errors.length === 0 && stderr.trim()) {
        // Try simpler error pattern
        const simpleError = stderr.match(/Error: (.*)/);
        if (simpleError) {
          errors.push({ line: 0, column: 0, message: simpleError[1].trim() });
        } else {
          errors.push({ line: 0, column: 0, message: stderr.trim() });
        }
      }
    }

    res.json({
      backend: true,
      stdout: stdout,
      stderr: stderr,
      exitCode: exitCode,
      errors,
      executionTimeMs,
    });
  });

  child.on('error', (err) => {
    clearTimeout(killTimer);
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    res.json({
      backend: true,
      stdout: '',
      stderr: err.message,
      exitCode: 1,
      errors: [{ line: 0, column: 0, message: err.message }],
      executionTimeMs: Date.now() - startTime,
    });
  });
});

// ── /api/toplevel — interactive OCaml toplevel (phrases) ────────────────────
app.post('/api/toplevel', (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required' });
  }

  if (!OCAML_PATH) {
    return res.json({ backend: false });
  }

  const timeout = 10000;
  const startTime = Date.now();

  // Run code through ocaml toplevel interactively
  // We pipe code to stdin and read the toplevel's output
  const child = spawn(OCAML_PATH, ['-noprompt', '-color', 'never'], {
    env: TOOL_ENV,
    timeout: timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => { stdout += data.toString(); });
  child.stderr.on('data', (data) => { stderr += data.toString(); });

  // Add ;; at the end if not present
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

    // Clean stdout: remove version header
    let fullOutput = stdout
      .replace(/^OCaml version.*\n/m, '')
      .replace(/^Enter #help;;.*\n?/m, '');

    // Parse toplevel output to extract val declarations
    const values = [];
    const valRegex = /val\s+(\w+)\s*:\s*([^=]+)=\s*(.*)/g;
    let match;
    while ((match = valRegex.exec(fullOutput)) !== null) {
      values.push({
        name: match[1].trim(),
        type: match[2].trim(),
        value: match[3].trim(),
      });
    }

    // Parse type declarations
    const typeRegex = /type\s+(.*)/g;
    while ((match = typeRegex.exec(fullOutput)) !== null) {
      values.push({ name: '_type', type: 'type', value: 'type ' + match[1].trim() });
    }

    // Parse exception declarations
    const excRegex = /exception\s+(.*)/g;
    while ((match = excRegex.exec(fullOutput)) !== null) {
      values.push({ name: '_exc', type: 'exception', value: 'exception ' + match[1].trim() });
    }

    // Parse "- : type = value" (anonymous expressions)
    const anonRegex = /- : ([^=]+)=\s*(.*)/g;
    while ((match = anonRegex.exec(fullOutput)) !== null) {
      values.push({ name: '-', type: match[1].trim(), value: match[2].trim() });
    }

    // Parse errors
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

    // Clean stdout: remove version header, prompts, and val declarations to get program output
    let cleanedOutput = stdout
      .replace(/^OCaml version.*\n/m, '')
      .replace(/^Enter #help;;.*\n?/m, '')
      .replace(/\n+$/g, '\n');

    // Extract stdout output (text printed by the program, not val declarations)
    const programOutput = cleanedOutput
      .replace(/val\s+\w+\s*:.*\n?/g, '')
      .replace(/type\s+.*\n?/g, '')
      .replace(/exception\s+.*\n?/g, '')
      .replace(/- : [^=]+=.*\n?/g, '')
      .replace(/^#\s*/gm, '')
      .trim();

    res.json({
      backend: true,
      output: programOutput,
      rawOutput: stdout,
      values,
      errors,
      exitCode,
      executionTimeMs,
    });
  });

  child.on('error', (err) => {
    clearTimeout(killTimer);
    res.json({ backend: true, output: '', values: [], errors: [{ line: 0, column: 0, message: err.message }], exitCode: 1, executionTimeMs: Date.now() - startTime });
  });
});

// ── /api/format — format OCaml code with ocamlformat ────────────────────────
app.post('/api/format', (req, res) => {
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

    // Create a minimal .ocamlformat config
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

// ── Merlin helper: run a merlin command ─────────────────────────────────────
function runMerlin(command, code) {
  const tmpDir = join(tmpdir(), `caraml-merlin-${randomUUID()}`);
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = join(tmpDir, 'code.ml');
  writeFileSync(tmpFile, code);

  try {
    // Merlin protocol: ocamlmerlin single <command> [args] -filename <file> < <file>
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

// ── /api/merlin/complete — get completions via merlin ───────────────────────
app.post('/api/merlin/complete', (req, res) => {
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
        label: e.name,
        kind: e.kind,
        detail: e.desc,
        documentation: e.info,
      }));
      res.json({ backend: true, completions });
    } else {
      res.json({ backend: true, completions: [] });
    }
  } catch (err) {
    res.json({ backend: true, completions: [], error: err.message });
  }
});

// ── /api/merlin/type — get type of expression at position ───────────────────
app.post('/api/merlin/type', (req, res) => {
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

// ── /api/merlin/errors — get type errors via merlin ─────────────────────────
app.post('/api/merlin/errors', (req, res) => {
  const { code } = req.body;
  if (!OCAMLMERLIN_PATH) {
    return res.json({ backend: false, errors: [] });
  }

  try {
    const parsed = runMerlin(['errors'], code);

    if (parsed.class === 'return' && Array.isArray(parsed.value)) {
      const errors = parsed.value.map(e => ({
        line: e.start?.line || 0,
        column: e.start?.col || 0,
        endLine: e.end?.line || 0,
        endColumn: e.end?.col || 0,
        message: e.message,
        severity: e.type,
      }));
      res.json({ backend: true, errors });
    } else {
      res.json({ backend: true, errors: [] });
    }
  } catch (err) {
    res.json({ backend: true, errors: [], error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// Learn OCaml Integration (proxy to avoid CORS + grading)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Helper: fetch from a Learn OCaml server endpoint.
 * The token is passed as ?token=TOKEN query parameter.
 * Handles both JSON and text responses. Returns null on 404.
 */
async function learnOcamlFetch(serverUrl, path, token, options = {}) {
  const baseUrl = serverUrl.replace(/\/+$/, '');
  const separator = path.includes('?') ? '&' : '?';
  const tokenParam = token ? `${separator}token=${encodeURIComponent(token)}` : '';
  const url = `${baseUrl}/${path}${tokenParam}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {}),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 404) return null;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const ct = response.headers.get('content-type') || '';
    if (ct.includes('json')) return response.json();
    return response.text();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  }
}

/**
 * Parse the Learn OCaml report format into a flat readable list.
 * Real format: [{section: [{text, display?}], contents: [{message: [{text}], result}]}]
 */
function parseLearnOcamlReport(report) {
  if (!Array.isArray(report)) return [];
  const parsed = [];
  for (const section of report) {
    // Section title: array of text objects
    const sectionTitle = (section.section || [])
      .map(t => t.text || '').join(' ').trim();
    // Contents: array of test items
    const contents = section.contents || [];
    for (const item of contents) {
      const msg = (item.message || []).map(t => t.text || '').join(' ').trim();
      let status = 'info';
      let points;
      if (item.result === 'failure') {
        status = 'failure';
      } else if (item.result === 'informative') {
        status = 'info';
      } else if (typeof item.result === 'number') {
        status = item.result > 0 ? 'success' : 'failure';
        points = item.result;
      }
      parsed.push({ section: sectionTitle, status, message: msg, points });
    }
  }
  return parsed;
}

/**
 * Parse exercise-index.json response.
 *
 * Real format from server:
 * [{learnocaml_version, groups: {KEY: {title, exercises: [[id, meta], ...]}}}, gradesObj]
 *
 * We transform it into a flat tree our frontend understands.
 */
function parseExerciseIndex(data) {
  let rawIndex = {};
  let grades = {};

  if (Array.isArray(data) && data.length >= 1) {
    const indexObj = data[0] || {};
    rawIndex = indexObj.groups || {};
    // data[1] is grades — could be {} or {id: grade}
    if (data[1] && typeof data[1] === 'object' && !Array.isArray(data[1])) {
      grades = data[1];
    }
  }

  // Also try to get grades from save.json (merged later)

  // Convert groups into our tree format
  const tree = [];
  for (const [groupKey, group] of Object.entries(rawIndex)) {
    const children = [];
    const exercises = group.exercises || [];
    for (const exEntry of exercises) {
      // Each entry is [exerciseId, metaObject]
      if (Array.isArray(exEntry) && exEntry.length >= 2) {
        const [exId, meta] = exEntry;
        children.push({
          id: exId,
          title: meta.title || exId,
          short_description: meta.short_description || '',
          stars: meta.stars || 0,
          kind: meta.kind || 'exercise',
        });
      }
    }
    tree.push({
      title: group.title || groupKey,
      children,
    });
  }
  return { tree, grades };
}

/**
 * Parse exercise descr field.
 * Real format: [["title", "html content"], ...] — we concatenate all HTML parts.
 */
function parseExerciseDescription(descr) {
  if (!descr) return '';
  if (typeof descr === 'string') return descr;
  if (Array.isArray(descr)) {
    return descr.map(part => {
      if (Array.isArray(part) && part.length >= 2) return part[1];
      if (typeof part === 'string') return part;
      return '';
    }).join('\n');
  }
  return '';
}

// ── POST /api/learn-ocaml/connect — Test connection, verify token ───────────
app.post('/api/learn-ocaml/connect', async (req, res) => {
  try {
    const { serverUrl, token } = req.body;
    if (!serverUrl || !token) {
      return res.status(400).json({ error: 'Server URL and token are required' });
    }

    // Step 1: Check server is reachable by fetching version (no token needed)
    let version = 'unknown';
    try {
      const vData = await learnOcamlFetch(serverUrl, 'version', null);
      if (vData && vData.version) version = vData.version;
    } catch (err) {
      return res.status(502).json({ error: `Cannot reach Learn OCaml server: ${err.message}` });
    }

    // Step 2: Validate token by fetching save.json — this is user-specific
    let nickname = null;
    let save = null;
    try {
      save = await learnOcamlFetch(serverUrl, 'save.json', token);
      if (save && save.nickname) nickname = save.nickname;
    } catch (err) {
      // If save.json fails with an HTTP error, the token is invalid
      return res.status(401).json({ error: 'Invalid token — authentication failed. Please check your token.' });
    }

    // Step 2b: If save.json returned 404 (null), the token could be a new valid
    // token with no save data yet, or a completely non-existent token.
    // The Learn OCaml server returns 404 for both cases, so we distinguish by
    // attempting a sync round-trip: only registered tokens can persist data.
    if (!save) {
      try {
        const minimalSave = { nickname: '', exercises: {} };
        await learnOcamlFetch(serverUrl, 'sync', token, {
          method: 'POST',
          body: JSON.stringify(minimalSave),
        });
        // Re-fetch to confirm the data was actually persisted
        const verifiedSave = await learnOcamlFetch(serverUrl, 'save.json', token);
        if (!verifiedSave) {
          return res.status(401).json({ error: 'Invalid token — this token is not registered on the server.' });
        }
        if (verifiedSave.nickname) nickname = verifiedSave.nickname;
      } catch (err) {
        return res.status(401).json({ error: 'Invalid token — authentication failed. Please check your token.' });
      }
    }

    res.json({ version, nickname });
  } catch (err) {
    console.error('Learn OCaml connect error:', err);
    res.status(500).json({ error: 'Failed to connect to Learn OCaml server' });
  }
});

// ── POST /api/learn-ocaml/exercises — Get exercise index with grades ────────
app.post('/api/learn-ocaml/exercises', async (req, res) => {
  try {
    const { serverUrl, token } = req.body;
    if (!serverUrl || !token) {
      return res.status(400).json({ error: 'Server URL and token are required' });
    }

    const data = await learnOcamlFetch(serverUrl, 'exercise-index.json', token);
    if (!data) {
      return res.status(404).json({ error: 'Could not fetch exercise index' });
    }

    const { tree, grades: indexGrades } = parseExerciseIndex(data);

    // Also get grades from save.json (more reliable for user-specific grades)
    let saveGrades = {};
    try {
      const save = await learnOcamlFetch(serverUrl, 'save.json', token);
      if (save && save.exercises) {
        for (const [exId, exState] of Object.entries(save.exercises)) {
          if (exState && typeof exState.grade === 'number') {
            saveGrades[exId] = exState.grade;
          }
        }
      }
    } catch {
      // No save data yet — that's fine
    }

    // Merge grades (save.json grades take priority)
    const grades = { ...indexGrades, ...saveGrades };

    res.json({ index: tree, grades });
  } catch (err) {
    console.error('Learn OCaml exercises error:', err);
    res.status(500).json({ error: `Failed to fetch exercises: ${err.message}` });
  }
});

// ── POST /api/learn-ocaml/exercise/:id — Get specific exercise ──────────────
// Note: exercise ID can contain slashes (e.g. tp1/lists), so we use wildcard
app.post('/api/learn-ocaml/exercise/*', async (req, res) => {
  try {
    const { serverUrl, token } = req.body;
    // Extract exercise ID from the URL path after /exercise/
    const exerciseId = req.params[0];
    if (!serverUrl || !token || !exerciseId) {
      return res.status(400).json({ error: 'Server URL, token, and exercise ID are required' });
    }

    // Fetch exercise: GET /exercises/{id}.json?token=...
    // The ID may contain slashes (tp1/lists), so we don't encode them
    const data = await learnOcamlFetch(
      serverUrl,
      `exercises/${exerciseId}.json`,
      token
    );

    if (!data) {
      return res.status(404).json({ error: `Exercise "${exerciseId}" not found` });
    }

    // Parse response: [meta, exerciseData, gradeOrNull]
    let meta = {}, exercise = {}, grade = null;
    if (Array.isArray(data) && data.length >= 2) {
      meta = data[0] || {};
      exercise = data[1] || {};
      grade = data.length > 2 ? data[2] : null;
    }

    // Get user's saved answer from save.json
    let userAnswer = null;
    try {
      const save = await learnOcamlFetch(serverUrl, 'save.json', token);
      if (save && save.exercises && save.exercises[exerciseId]) {
        userAnswer = save.exercises[exerciseId].solution || null;
      }
    } catch {
      // No save data — proceed without
    }

    res.json({
      id: exercise.id || exerciseId,
      title: meta.title || exerciseId,
      description: parseExerciseDescription(exercise.descr),
      prelude: exercise.prelude || '',
      template: exercise.template || '',
      max_score: exercise['max-score'] || meta['max-score'] || 100,
      grade,
      userAnswer,
    });
  } catch (err) {
    console.error('Learn OCaml exercise error:', err);
    res.status(500).json({ error: `Failed to fetch exercise: ${err.message}` });
  }
});

// ── POST /api/learn-ocaml/save — Get full save state ────────────────────────
app.post('/api/learn-ocaml/save', async (req, res) => {
  try {
    const { serverUrl, token } = req.body;
    if (!serverUrl || !token) {
      return res.status(400).json({ error: 'Server URL and token are required' });
    }

    const save = await learnOcamlFetch(serverUrl, 'save.json', token);
    // save.json may return null (404) for new tokens
    res.json(save || { nickname: '', exercises: {} });
  } catch (err) {
    console.error('Learn OCaml save error:', err);
    res.status(500).json({ error: `Failed to fetch save: ${err.message}` });
  }
});

// ── POST /api/learn-ocaml/sync-answer — Update answer for a single exercise ─
app.post('/api/learn-ocaml/sync-answer', async (req, res) => {
  try {
    const { serverUrl, token, exerciseId, code } = req.body;
    if (!serverUrl || !token || !exerciseId) {
      return res.status(400).json({ error: 'Server URL, token, and exerciseId are required' });
    }

    // 1. Fetch current save state (may be null for new tokens)
    let save = await learnOcamlFetch(serverUrl, 'save.json', token);
    if (!save || typeof save !== 'object') {
      save = { nickname: '', exercises: {} };
    }
    if (!save.exercises) save.exercises = {};

    // 2. Update the exercise answer
    if (!save.exercises[exerciseId]) {
      save.exercises[exerciseId] = {};
    }
    save.exercises[exerciseId].solution = code;
    save.exercises[exerciseId].mtime = Date.now() / 1000;

    // 3. Sync back to server via POST /sync
    await learnOcamlFetch(serverUrl, 'sync', token, {
      method: 'POST',
      body: JSON.stringify(save),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Learn OCaml sync error:', err);
    res.status(500).json({ error: `Failed to sync answer: ${err.message}` });
  }
});

// ── POST /api/learn-ocaml/grade — Grade an exercise ─────────────────────────
app.post('/api/learn-ocaml/grade', async (req, res) => {
  try {
    const { serverUrl, token, exerciseId, code } = req.body;
    if (!serverUrl || !token || !exerciseId) {
      return res.status(400).json({ error: 'Server URL, token, exerciseId, and code are required' });
    }

    // 1. Sync the code to Learn OCaml first
    let save = await learnOcamlFetch(serverUrl, 'save.json', token);
    if (!save || typeof save !== 'object') {
      save = { nickname: '', exercises: {} };
    }
    if (!save.exercises) save.exercises = {};
    if (!save.exercises[exerciseId]) save.exercises[exerciseId] = {};
    save.exercises[exerciseId].solution = code;
    save.exercises[exerciseId].mtime = Date.now() / 1000;

    await learnOcamlFetch(serverUrl, 'sync', token, {
      method: 'POST',
      body: JSON.stringify(save),
    });

    // 2. Re-fetch save to get any existing grade/report
    //    Note: Learn OCaml grading happens client-side in the browser.
    //    The server doesn't grade — the JS grader runs in the browser.
    //    When we sync, we save the code. The grade/report in save.json
    //    are from previous grading sessions done on the Learn OCaml site.
    const updatedSave = await learnOcamlFetch(serverUrl, 'save.json', token);
    const exState = updatedSave?.exercises?.[exerciseId] || {};

    res.json({
      grade: typeof exState.grade === 'number' ? exState.grade : null,
      max_grade: 100,
      report: parseLearnOcamlReport(exState.report || []),
      synced: true,
    });
  } catch (err) {
    console.error('Learn OCaml grade error:', err);
    res.status(500).json({ error: `Failed to grade exercise: ${err.message}` });
  }
});

// ── SPA Fallback ────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// ── Start Server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  🐫 Caraml server running at http://localhost:${PORT}`);
  console.log(`  📁 Database: ${join(__dirname, 'caraml.db')}\n`);
});
