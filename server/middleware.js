import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    // Never run production with a guessable secret: generate an ephemeral one
    // (sessions won't survive a restart) and warn loudly.
    JWT_SECRET = randomBytes(32).toString('hex');
    console.warn('  [security] JWT_SECRET is not set. Using an ephemeral secret — all sessions will be invalidated on restart. Set JWT_SECRET in the environment.');
  } else {
    JWT_SECRET = 'caraml-dev-secret-not-for-production';
  }
}

// ── Simple in-memory rate limiter (per IP + route) ──────────────────────────
const rateBuckets = new Map();

function rateLimit({ windowMs = 60_000, max = 10 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    }
    next();
  };
}

// Periodically drop stale buckets so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.start > 10 * 60_000) rateBuckets.delete(key);
  }
}, 10 * 60_000).unref();

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

export { JWT_SECRET, authenticate, optionalAuth, rateLimit };
