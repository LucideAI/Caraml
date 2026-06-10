import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { db } from '../db.js';
import { JWT_SECRET, authenticate, rateLimit } from '../middleware.js';
import { serializeUser, parseUiPrefs, mergeUiPrefs } from '../helpers.js';

const router = Router();

const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,32}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const authRateLimit = rateLimit({ windowMs: 60_000, max: 10 });

router.post('/auth/register', authRateLimit, (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string'
        || !username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }
    if (!USERNAME_REGEX.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-32 characters (letters, digits, ".", "-", "_")' });
    }
    if (!EMAIL_REGEX.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 6 and 128 characters' });
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

router.post('/auth/login', authRateLimit, (req, res) => {
  try {
    const { login, password } = req.body;

    if (typeof login !== 'string' || typeof password !== 'string' || !login || !password) {
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

router.get('/auth/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, username, email, avatar_color, created_at, ui_prefs FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: serializeUser(user) });
});

router.put('/auth/preferences', authenticate, (req, res) => {
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

export default router;
