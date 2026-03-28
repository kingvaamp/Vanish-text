// server/server.js — Version sécurisée complète
'use strict';

const express    = require('express');
const http       = require('http');
const path       = require('path');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const helmet     = require('helmet');

// ── Validation des variables d'environnement ─────────────────────
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.warn(`⚠️  Variables manquantes (fonctionnement dégradé) : ${missing.join(', ')}`);
  // Ne pas quitter — le serveur peut encore servir le frontend sans Socket.io auth
}

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

// ── DIST Check ────────────────────────────────────────────────────
const fs = require('fs');
const distPath = path.join(__dirname, '../dist');
if (!fs.existsSync(distPath) || !fs.existsSync(path.join(distPath, 'index.html'))) {
  console.error('❌ ERREUR CRITIQUE : Le dossier "dist/" ou "index.html" est introuvable.');
  console.error('Vérifie que "npm run build" (expo export -p web) a été exécuté avec succès.');
} else {
  console.log('✅ Dossier "dist/" détecté.');
  try {
    const files = fs.readdirSync(distPath);
    console.log('📂 Contenu de dist/ :', files.join(', '));
    if (fs.existsSync(path.join(distPath, '_expo/static/js/web'))) {
       const jsFiles = fs.readdirSync(path.join(distPath, '_expo/static/js/web'));
       console.log('📦 JS Files :', jsFiles.join(', '));
    }
  } catch (err) {
    console.error('⚠️ Erreur lors du scan de dist/ :', err);
  }
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
    // Allow null/missing origin (mobile apps, Expo Go, curl)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    // In production block unknown origins silently (no error message leakage)
    if (process.env.NODE_ENV === 'production') {
      return callback(null, false);
    }
    return callback(null, true); // Dev: permissive
  },
  credentials:    true,
  methods:        ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Helmet (security headers) ────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      connectSrc:  ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
      scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required by Expo web
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      fontSrc:     ["'self'", 'data:'],
    },
  },
  hsts:                        { maxAge: 31536000, includeSubDomains: true, preload: true },
  crossOriginEmbedderPolicy:   false, // Required for Expo web workers
}));

app.use(express.json({ limit: '50kb' }));

// ── Rate Limiting ─────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Trop de requêtes. Réessaie dans 15 minutes.' },
});
app.use(generalLimiter);

// ── Static files ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../dist')));

app.get('/api/debug', (_, res) => {
  try {
    const distPath = path.join(__dirname, '../dist');
    const folderExists = fs.existsSync(distPath);
    let files = [];
    let jsFiles = [];
    
    if (folderExists) {
      files = fs.readdirSync(distPath);
      const jsPath = path.join(distPath, '_expo/static/js/web');
      if (fs.existsSync(jsPath)) {
        jsFiles = fs.readdirSync(jsPath);
      }
    }
    
    res.json({
      folderExists,
      distPath,
      cwd: process.cwd(),
      dirname: __dirname,
      files,
      jsFiles,
      dist_expo_exists: fs.existsSync(path.join(distPath, '_expo/static')),
      root_files: fs.readdirSync(process.cwd()),
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        SUPABASE_URL_SET: !!process.env.SUPABASE_URL,
        EXPO_URL_SET: !!process.env.EXPO_PUBLIC_SUPABASE_URL
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

// ── Socket.io with JWT validation (optional — only if env vars are set) ──
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { Server }       = require('socket.io');
  const { createClient } = require('@supabase/supabase-js');

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const io = new Server(server, {
    cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
    transports:   ['websocket', 'polling'],
    pingTimeout:  20000,
    pingInterval: 10000,
  });

  // JWT validation middleware
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
    console.log(`[Socket] Connecté : ${socket.userId}`);
    socket.join(`user:${socket.userId}`);
    socket.on('disconnect', () => {
      console.log(`[Socket] Déconnecté : ${socket.userId}`);
    });
  });

  console.log('✓ Socket.io avec validation JWT activé');
}

// ── Start ─────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 VanishText Backend — Port ${PORT} | CORS: ${ALLOWED_ORIGINS.length} origines | Helmet: actif`);
});
