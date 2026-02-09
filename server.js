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
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
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

// ── Start Server ────────────────────────────────────────────────────────────
logToolchain();
app.listen(PORT, () => {
  console.log(`\n  🐫 Caraml server running at http://localhost:${PORT}`);
  console.log(`  📁 Database: ${DB_PATH}\n`);
});
