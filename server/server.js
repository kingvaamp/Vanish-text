// server/server.js — Production server for VanishText
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express   = require('express');
const http      = require('http');
const path      = require('path');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const helmet    = require('helmet');
const fs        = require('fs');

// ── Environment validation ────────────────────────────────────────
// Support both standard and Expo-prefixed keys for local convenience
process.env.SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.warn(`⚠️  Missing env vars (degraded mode): ${missing.join(', ')}`);
}

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

// ── DIST validation ───────────────────────────────────────────────
const distPath = path.join(__dirname, '../dist');
const distIndexPath = path.join(distPath, 'index.html');
const distExpoPath = path.join(distPath, '_expo');

if (!fs.existsSync(distIndexPath)) {
  console.error('❌ CRITICAL: dist/index.html not found. Build may have failed.');
} else {
  console.log('✅ dist/index.html found.');
}

if (!fs.existsSync(distExpoPath)) {
  console.error('❌ CRITICAL: dist/_expo not found. JS bundles are missing!');
} else {
  const jsBundles = fs.existsSync(path.join(distExpoPath, 'static/js/web'))
    ? fs.readdirSync(path.join(distExpoPath, 'static/js/web'))
    : [];
  console.log(`✅ dist/_expo found. JS bundles: ${jsBundles.join(', ')}`);
}

// ── CORS ──────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://vanish-venx.onrender.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8081',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV === 'production') return callback(null, false);
    return callback(null, true);
  },
  credentials:    true,
  methods:        ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Security headers ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      connectSrc:  ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
      scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      fontSrc:     ["'self'", 'data:'],
    },
  },
  hsts:                      { maxAge: 31536000, includeSubDomains: true, preload: true },
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '50kb' }));

// ── Rate limiting ─────────────────────────────────────────────────
app.use(rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Try again in 15 minutes.' },
}));

// ── API routes (BEFORE static/SPA fallback) ───────────────────────

// ── Prekey Bundle API (in-memory store for now) ──────────────
const prekeyBundles = new Map(); // userId -> { identityPubB64, signedPrekey, oneTimePrekeys }

// Upload prekey bundle
app.put('/api/prekey-bundle', (req, res) => {
  try {
    const { identityPubB64, signedPrekey, oneTimePrekeys } = req.body;
    if (!identityPubB64 || !signedPrekey?.publicB64) {
      return res.status(400).json({ error: 'Missing identityPubB64 or signedPrekey' });
    }
    const userId = req.headers['x-user-id'] || 'anonymous';
    prekeyBundles.set(userId, {
      identityPubB64,
      signedPrekey,
      oneTimePrekeys: oneTimePrekeys || [],
    });
    console.log('[PrekeyBundle] Uploaded for ' + userId + ' (' + (oneTimePrekeys?.length || 0) + ' OPKs)');
    res.json({ status: 'ok', userId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fetch someone's prekey bundle (removes one OPK)
app.get('/api/prekey-bundle/:userId', (req, res) => {
  const bundle = prekeyBundles.get(req.params.userId);
  if (!bundle) {
    return res.status(404).json({ error: 'Prekey bundle not found for user: ' + req.params.userId });
  }
  const result = {
    identityPubB64: bundle.identityPubB64,
    signedPrekey:   bundle.signedPrekey,
    oneTimePrekeys: bundle.oneTimePrekeys.slice(0, 1),
  };
  // Consume one OPK
  if (bundle.oneTimePrekeys.length > 0) {
    bundle.oneTimePrekeys.shift();
  }
  res.json(result);
});

app.get('/api/health', (_, res) => res.json({
  status: 'ok',
  ts:     new Date().toISOString(),
  dist_expo_exists: fs.existsSync(distExpoPath),
}));

// ── Static files (explicit _expo first, then root dist) ───────────
// Serve _expo explicitly to guarantee correct MIME types
app.use('/_expo', express.static(path.join(distPath, '_expo'), {
  maxAge: '1y',
  immutable: true,
}));
app.use(express.static(distPath));

// ── SPA fallback (LAST) ───────────────────────────────────────────
app.get('*', (_, res) => {
  if (!fs.existsSync(distIndexPath)) {
    return res.status(503).send('App not built yet. Please wait for deployment to complete.');
  }
  res.sendFile(distIndexPath);
});

// ── Socket.io (only if Supabase credentials are set) ─────────────
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { Server }       = require('socket.io');
  const { createClient } = require('@supabase/supabase-js');

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const io = new Server(server, {
    cors:         { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
    transports:   ['websocket', 'polling'],
    pingTimeout:  20000,
    pingInterval: 10000,
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) return next(new Error('AUTH_INVALID'));
      socket.userId = user.id;
      next();
    } catch {
      next(new Error('AUTH_ERROR'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.userId}`);
    socket.join(`user:${socket.userId}`);
    socket.on('disconnect', () => console.log(`[Socket] Disconnected: ${socket.userId}`));
  });

  console.log('✓ Socket.io with JWT validation enabled');
}

// ── Start ─────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 VanishText — Port ${PORT} | Env: ${process.env.NODE_ENV} | CORS: ${ALLOWED_ORIGINS.length} origins`);
});
