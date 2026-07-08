import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DB_PATH } from './server/db.js';
import { logToolchain } from './server/routes/ocaml.js';
import authRoutes from './server/routes/auth.js';
import projectRoutes from './server/routes/projects.js';
import ocamlRoutes from './server/routes/ocaml.js';
import learnOcamlRoutes from './server/routes/learnOcaml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const DEFAULT_PORT = 3001;
const portFromEnv = Number.parseInt(process.env.CARAML_API_PORT || process.env.PORT || '', 10);
const PORT = Number.isFinite(portFromEnv) && portFromEnv > 0 ? portFromEnv : DEFAULT_PORT;

// ── Middleware ───────────────────────────────────────────────────────────────
// The SPA is served from this same origin (or proxied through Vite in dev),
// so cross-origin access is only needed for explicitly whitelisted origins.
const extraOrigins = (process.env.CARAML_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  ...extraOrigins,
]);
app.use(cors({
  origin: (origin, callback) => {
    // Same-origin requests (no Origin header) and whitelisted origins only.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(express.static(join(__dirname, 'dist')));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api', projectRoutes);
app.use('/api', ocamlRoutes);
app.use('/api', learnOcamlRoutes);

// ── SPA Fallback ────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// ── Error Handler (always answer JSON, never an HTML error page) ────────────
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start Server ────────────────────────────────────────────────────────────
logToolchain();
app.listen(PORT, () => {
  console.log(`\n  🐫 Caraml server running at http://localhost:${PORT}`);
  console.log(`  📁 Database: ${DB_PATH}\n`);
});
