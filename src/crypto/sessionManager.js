// src/crypto/sessionManager.js
// High-level session management for VanishText Double Ratchet.
// Chaque conversation a une session persistante.
// L'initiation utilise le protocole X3DH complet.
// Les sessions sont stockées dans KeyStorage (expo-secure-store / localStorage).

import {
  generateKeyPair,
  importPublicKey,
  ecdh,
  hkdf,
  toB64,
  fromB64,
  concat,
} from './primitives.js';
import {
  drEncrypt,
  drDecrypt,
  drInitFromSK,
  serializeSession,
  deserializeSession,
} from './doubleRatchet.js';
import { x3dhInitiate, x3dhRespond, fetchPrekeyBundle, uploadPrekeyBundle } from './x3dh.js';
import { generateSignedPrekeyECDSA, generateOneTimePrekey, createPrekeyBundle } from './prekeys.js';
import { saveSPK, loadSPK, saveOPKs, loadOPKs, getUnusedOPKs, markOPKUsed } from '../storage/KeyStorage.js';

// ── Constants ───────────────────────────────────────────────
const SESSION_PREFIX = 'vt:dr:session:';  // KeyStorage prefix per conversation

// ── In-memory session cache ────────────────────────────────
const sessions = new Map();           // convId -> session object
const creationLocks = new Map();      // convId -> Promise (mutex)
const pendingInitMessages = new Map(); // convId -> X3DH initialMessage (to send first)
const serverUrlCache = new Map();     // uid -> server URL

// ── Helpers ────────────────────────────────────────────────

// Canonical conversation ID: deterministic, same for both participants
export function canonicalConvId(userId1, userId2) {
  return 'conv-' + [String(userId1), String(userId2)].sort().join('-');
}

// ── Session Persistence ─────────────────────────────────────

function getSessionKey(convId) {
  return SESSION_PREFIX + convId;
}

async function saveSession(convId, session) {
  try {
    const serialized = await serializeSession(session);
    const raw = JSON.stringify(serialized);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(getSessionKey(convId), raw);
    }
  } catch (e) {
    console.warn('[SessionManager] Failed to save session:', e);
  }
}

async function loadSession(convId) {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(getSessionKey(convId));
      if (raw) {
        const data = JSON.parse(raw);
        return await deserializeSession(data);
      }
    }
  } catch (e) {
    console.warn('[SessionManager] Failed to load session:', e);
  }
  return null;
}

export async function clearSession(convId) {
  sessions.delete(convId);
  pendingInitMessages.delete(convId);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(getSessionKey(convId));
    }
  } catch (_) {}
}

export async function clearAllSessions() {
  sessions.clear();
  creationLocks.clear();
  pendingInitMessages.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(SESSION_PREFIX));
      keys.forEach(k => localStorage.removeItem(k));
    }
  } catch (_) {}
}

// ── Prekey Management ───────────────────────────────────────

// Generate and store a fresh prekey bundle for a user
export async function generatePrekeyBundle(uid, identityKeyPair) {
  // 1) Generate SPK signed by IK
  const spk = await generateSignedPrekeyECDSA(identityKeyPair.privateJwk);
  await saveSPK(uid, spk);

  // 2) Generate 20 one-time prekeys
  const opks = await generateOneTimePrekey(20);
  await saveOPKs(uid, opks);

  // 3) Create the bundle for upload
  const bundle = createPrekeyBundle(
    identityKeyPair.publicB64,
    spk,
    opks,
    spk.signature,
  );

  return bundle;
}

// Get the current prekey bundle (for upload to server)
export async function getCurrentPrekeyBundle(uid, identityPubB64) {
  const spk = await loadSPK(uid);
  if (!spk) return null;

  const unusedOPKs = await getUnusedOPKs(uid);

  return createPrekeyBundle(
    identityPubB64,
    spk,
    unusedOPKs,
    spk.signature,
  );
}

// ── Session Initiation (X3DH) ────────────────────────────────

// Initiate a session as Alice (with Bob's prekey bundle)
// Si prekeyBundle n'est pas fourni, on le télécharge depuis le serveur
export async function initiateSession(
  convId,
  myIdentityKeyPair,
  theirUserId,
  prekeyBundle,     // Optionnel : si déjà récupéré du serveur
) {
  if (sessions.has(convId)) return sessions.get(convId);
  if (creationLocks.has(convId)) return creationLocks.get(convId);

  const promise = (async () => {
    try {
      // Vérifier le cache mémoire puis stockage
      const stored = await loadSession(convId);
      if (stored) {
        sessions.set(convId, stored);
        return stored;
      }

      // Lancer X3DH
      const result = await x3dhInitiate(myIdentityKeyPair, prekeyBundle);

      // Stocker la session
      sessions.set(convId, result.session);
      await saveSession(convId, result.session);

      // Stocker le message initial à envoyer au destinataire
      pendingInitMessages.set(convId, result.initialMessage);

      console.log(`[SessionManager] ✓ X3DH session initiated for ${convId}`);
      return result.session;
    } finally {
      creationLocks.delete(convId);
    }
  })();

  creationLocks.set(convId, promise);
  return promise;
}

// Récupère le message X3DH initial (à envoyer dans le premier message)
export function getPendingInitMessage(convId) {
  return pendingInitMessages.get(convId) || null;
}

// Respond as Bob (receives Alice's initial X3DH message)
export async function respondSession(
  convId,
  myIdentityKeyPair,
  initialMessage,
) {
  if (sessions.has(convId)) return sessions.get(convId);
  if (creationLocks.has(convId)) return creationLocks.get(convId);

  const promise = (async () => {
    try {
      const stored = await loadSession(convId);
      if (stored) {
        sessions.set(convId, stored);
        return stored;
      }

      // Charger nos prekeys
      const mySPK = await loadSPK(/* uid from context */);
      const myOPKs = await loadOPKs(/* uid from context */);
      const opkMap = {};
      for (const opk of myOPKs) {
        if (!opk.used) opkMap[opk.id] = opk.keyPair;
      }

      // Répondre au X3DH
      const result = await x3dhRespond(
        myIdentityKeyPair,
        mySPK?.keyPair,
        opkMap,
        initialMessage,
      );

      // Marquer l'OPK comme utilisée si applicable
      if (result.usedOPKId) {
        await markOPKUsed(/* uid */, result.usedOPKId);
      }

      sessions.set(convId, result.session);
      await saveSession(convId, result.session);

      console.log(`[SessionManager] ✓ X3DH session responded for ${convId}`);
      return result.session;
    } finally {
      creationLocks.delete(convId);
    }
  })();

  creationLocks.set(convId, promise);
  return promise;
}

// ── Encrypt / Decrypt API ──────────────────────────────────

export async function encryptMessage(convId, plaintext) {
  const session = sessions.get(convId);
  if (!session) throw new Error(`[SessionManager] No session for ${convId}. Call initiateSession first.`);

  const result = await drEncrypt(session, plaintext);
  await saveSession(convId, session);
  return result;
}

export async function decryptMessage(convId, header, ciphertext) {
  let session = sessions.get(convId);
  if (!session) {
    session = await loadSession(convId);
    if (!session) throw new Error(`[SessionManager] No session for ${convId}`);
    sessions.set(convId, session);
  }

  const plaintext = await drDecrypt(session, header, ciphertext);
  await saveSession(convId, session);
  return plaintext;
}

// ── Session management ──────────────────────────────────────

export async function restoreSession(convId) {
  const session = await loadSession(convId);
  if (session) sessions.set(convId, session);
  return session;
}

export function hasSession(convId) {
  return sessions.has(convId);
}

export function getSession(convId) {
  return sessions.get(convId);
}
