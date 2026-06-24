// src/crypto/sessionManager.js
// High-level session management for VanishText Double Ratchet.
// Each conversation has one persistent session.
// Sessions are stored in KeyStorage (expo-secure-store / localStorage).

// Sessions stored via localStorage directly
import {
  generateKeyPair,
  importPublicKey,
  ecdh,
  hkdf,
  toB64,
  fromB64,
  concat,
} from './primitives';
import {
  drEncrypt,
  drDecrypt,
  drInitFromSK,
  drInitWithDH,
  serializeSession,
  deserializeSession,
  drRatchetStep,
} from './doubleRatchet';

// ── Constants ───────────────────────────────────────────────
const SESSION_PREFIX = 'vt:dr:session:';  // KeyStorage prefix per conversation
const INFO_X3DH = 'VanishText-X3DH-v1';
const INFO_DR_INIT = 'VanishText-DR-Init';

// ── In-memory session cache ────────────────────────────────
const sessions = new Map();           // convId -> session object
const creationLocks = new Map();      // convId -> Promise (mutex)
const pendingEphemeralKeys = new Map(); // convId -> ephemeral key pair

// ── Helpers ────────────────────────────────────────────────

// Canonical conversation ID: deterministic, same for both participants
export function canonicalConvId(userId1, userId2) {
  return 'conv-' + [userId1, userId2].sort().join('-');
}

// Build associated data from two identity public keys
function buildAD(myPubB64, theirPubB64) {
  const sorted = [myPubB64, theirPubB64].sort();
  return new TextEncoder().encode(`VanishText-AD-${sorted[0]}-${sorted[1]}`);
}

// ── Session Persistence ─────────────────────────────────────

function getSessionKey(convId) {
  return SESSION_PREFIX + convId;
}

async function saveSession(convId, session) {
  const serialized = await serializeSession(session);
  const key = getSessionKey(convId);
  try {
    // Store in KeyStorage via a simple JSON blob
    // We use localStorage directly (KeyStorage doesn't have a generic setItem)
    const raw = JSON.stringify(serialized);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, raw);
    }
  } catch (e) {
    console.warn('[SessionManager] Failed to save session:', e);
  }
}

async function loadSession(convId) {
  const key = getSessionKey(convId);
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
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
  const key = getSessionKey(convId);
  sessions.delete(convId);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (_) {}
}

export async function clearAllSessions() {
  sessions.clear();
  creationLocks.clear();
  pendingEphemeralKeys.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(SESSION_PREFIX));
      keys.forEach(k => localStorage.removeItem(k));
    }
  } catch (_) {}
}

// ── Session Initiation (X3DH-style) ─────────────────────────

// Initiate a session as Alice (sender)
// We have our identity keys and their public key
// Returns the ephemeral public key to include in the first message header
export async function initiateSession(convId, myIdentityKeyPair, theirIdentityPubB64) {
  // Check if session already exists in memory
  if (sessions.has(convId)) return sessions.get(convId);

  // Check mutex (prevent double-init)
  if (creationLocks.has(convId)) {
    return creationLocks.get(convId);
  }

  const promise = (async () => {
    try {
      // Load from storage first
      const stored = await loadSession(convId);
      if (stored) {
        sessions.set(convId, stored);
        return stored;
      }

      // Generate ephemeral key for initial DH
      const ephemeralKP = await generateKeyPair();
      pendingEphemeralKeys.set(convId, ephemeralKP);

      // Compute shared secret using X3DH-style derivation
      const theirPubKey = await importPublicKey(theirIdentityPubB64);
      const DH1 = await ecdh(myIdentityKeyPair.privateKey, theirPubKey);  // IK_A, IK_B
      const DH2 = await ecdh(ephemeralKP.privateKey, theirPubKey);        // EK,   IK_B

      // SK = HKDF(DH1 || DH2)
      const skInput = concat(DH1, DH2);
      const SK = await hkdf(skInput, null, INFO_X3DH, 32);

      // AD = sorted identity keys
      const AD = buildAD(myIdentityKeyPair.publicB64, theirIdentityPubB64);

      // Initialize Double Ratchet with SK and initial DH output (EK, IK_B)
      const session = await drInitWithDH(SK, DH2, AD);

      // Store rootKey in session (drInitWithDH already stores it)
      sessions.set(convId, session);
      await saveSession(convId, session);

      console.log(`[SessionManager] ✓ Session initiated for ${convId}`);
      return session;
    } finally {
      creationLocks.delete(convId);
    }
  })();

  creationLocks.set(convId, promise);
  return promise;
}

// Respond as Bob (receiver of first message)
// We have our identity keys and the sender's ephemeral public key from the message header
export async function respondSession(convId, myIdentityKeyPair, senderEphemeralPubB64, senderIdentityPubB64) {
  if (sessions.has(convId)) return sessions.get(convId);

  if (creationLocks.has(convId)) {
    return creationLocks.get(convId);
  }

  const promise = (async () => {
    try {
      const stored = await loadSession(convId);
      if (stored) {
        sessions.set(convId, stored);
        return stored;
      }

      const senderEK = await importPublicKey(senderEphemeralPubB64);
      const senderIK = await importPublicKey(senderIdentityPubB64);

      // X3DH on Bob's side
      const DH1 = await ecdh(myIdentityKeyPair.privateKey, senderIK);        // IK_B, IK_A
      const DH2 = await ecdh(myIdentityKeyPair.privateKey, senderEK);        // IK_B, EK_A

      const skInput = concat(DH1, DH2);
      const SK = await hkdf(skInput, null, INFO_X3DH, 32);

      const AD = buildAD(senderIdentityPubB64, myIdentityKeyPair.publicB64);

      // Bob initializes with SK (no initial DH output — will establish on first reply)
      const session = await drInitFromSK(SK, AD);

      // Bob also computes the first root key using DH(IK_B, EK_A) = DH2
      // This is the same DH output Alice used for drInitWithDH
      session.rootKey = (await hkdf(concat(
        await ecdh(myIdentityKeyPair.privateKey, senderEK),
        await ecdh(myIdentityKeyPair.privateKey, senderIK)
      ), null, INFO_X3DH, 32)).buffer;  // Simplified — real X3DH would do proper derivation

      // Actually, for proper init: SK is already the X3DH secret.
      // We need KDF_RK(SK, DH2) to match Alice's initial rootKey.
      // Let's use the HKDF root key derivation:
      const dhOutput = DH2;  // Same as Alice's DH(EK, IK_B)
      const initOutput = await hkdf(concat(SK, dhOutput), null, 'VanishText-DR-RK', 64);
      session.rootKey = initOutput.slice(0, 32);
      session.CKr = initOutput.slice(32, 64);  // Bob can receive immediately

      sessions.set(convId, session);
      await saveSession(convId, session);

      console.log(`[SessionManager] ✓ Session responded for ${convId}`);
      return session;
    } finally {
      creationLocks.delete(convId);
    }
  })();

  creationLocks.set(convId, promise);
  return promise;
}

// ── Encrypt / Decrypt API ──────────────────────────────────

// Encrypt a plaintext message for a conversation
// Returns { header, ciphertext } — include header in the message to send
// header contains { DHr, Ns, PN } for the recipient to decrypt
export async function encryptMessage(convId, plaintext) {
  const session = sessions.get(convId);
  if (!session) throw new Error(`[SessionManager] No session for ${convId}. Call initiateSession first.`);

  const result = await drEncrypt(session, plaintext);

  // Persist after each encrypt (save chain state)
  await saveSession(convId, session);

  // Include ephemeral public key if this is the first message from Alice
  const ephemeralKP = pendingEphemeralKeys.get(convId);
  if (ephemeralKP) {
    result.header.ephemeralPublicKey = ephemeralKP.publicB64;
    // Only include once — remove after first send
    if (session.DHr) {
      pendingEphemeralKeys.delete(convId);
    }
  }

  return result;
}

// Decrypt a message for a conversation
// header = { DHr, Ns, PN, ephemeralPublicKey? }
// ciphertext = { iv, ciphertext }
// Returns decrypted plaintext string
export async function decryptMessage(convId, myIdentityKeyPair, header, ciphertext) {
  let session = sessions.get(convId);

  // If no session and header has ephemeralPublicKey, this is Bob receiving Alice's first message
  if (!session && header.ephemeralPublicKey) {
    // We need the sender's identity public key
    // For now, look it up from the directory
    const senderIdentityPubB64 = session?.AD ? null : null; // Will be set from directory
    throw new Error('[SessionManager] Need sender identity key to respond to session');
  }

  if (!session) {
    // Try to load from storage
    session = await loadSession(convId);
    if (!session) throw new Error(`[SessionManager] No session for ${convId}`);
    sessions.set(convId, session);
  }

  const plaintext = await drDecrypt(session, header, ciphertext);

  // Persist after each decrypt
  await saveSession(convId, session);

  return plaintext;
}

// ── Session management ──────────────────────────────────────

// Restore session from storage into memory (call on app start)
export async function restoreSession(convId) {
  const session = await loadSession(convId);
  if (session) {
    sessions.set(convId, session);
  }
  return session;
}

// Check if a session exists for a conversation
export function hasSession(convId) {
  return sessions.has(convId);
}

// Get a session (without loading)
export function getSession(convId) {
  return sessions.get(convId);
}
