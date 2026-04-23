// ============================================
// Encrypted Key Storage — localStorage with AES-256-GCM
// Private keys are NEVER stored in plaintext
// ============================================

import { hkdf, encrypt, decrypt, toB64, fromB64 } from './primitives';

const STORAGE_PREFIX = 'vanish_';
const IDENTITY_KEY = 'identity_key';
const RATCHET_PREFIX = 'ratchet_';
const SALT_KEY = 'storage_salt';

/**
 * Derive the wrapping key from origin + stable salt
 * Same origin + same salt = same key (deterministic for the device)
 */
async function getWrappingKey() {
  let salt = localStorage.getItem(STORAGE_PREFIX + SALT_KEY);
  
  if (!salt) {
    // Generate a stable salt on first use
    const newSalt = crypto.getRandomValues(new Uint8Array(32));
    salt = toB64(newSalt);
    localStorage.setItem(STORAGE_PREFIX + SALT_KEY, salt);
  }
  
  const saltBuf = fromB64(salt);
  const originData = new TextEncoder().encode(window.location.origin);
  
  // Combine origin with salt
  const combined = new Uint8Array(originData.length + saltBuf.byteLength);
  combined.set(new Uint8Array(originData), 0);
  combined.set(new Uint8Array(saltBuf), originData.length);
  
  // Derive wrapping key via HKDF
  return hkdf(combined.buffer, null, 'VanishText-KeyStorage-Wrap-v1', 32);
}

/**
 * Encrypt data before storing
 */
async function secureStore(key, data) {
  const wrapKey = await getWrappingKey();
  const json = JSON.stringify(data);
  const encrypted = await encrypt(wrapKey, json);
  
  const payload = {
    iv: encrypted.iv,
    ct: encrypted.ciphertext,
    t: Date.now(), // timestamp for potential key rotation
  };
  
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(payload));
}

/**
 * Decrypt data from storage
 */
async function secureLoad(key) {
  const stored = localStorage.getItem(STORAGE_PREFIX + key);
  if (!stored) return null;
  
  try {
    const payload = JSON.parse(stored);
    const wrapKey = await getWrappingKey();
    const json = await decrypt(wrapKey, payload.iv, payload.ct);
    return JSON.parse(json);
  } catch (e) {
    console.error('Failed to decrypt stored key:', e);
    return null;
  }
}

// ============================================
// Public API
// ============================================

/**
 * Save identity key pair (encrypted)
 * @param {Object} keyPair — { publicB64, privateJwk }
 */
export async function saveIdentityKey(keyPair) {
  await secureStore(IDENTITY_KEY, {
    publicB64: keyPair.publicB64,
    privateJwk: keyPair.privateJwk,
  });
}

/**
 * Load identity key pair (decrypted)
 * Returns: { publicB64, privateJwk } or null
 */
export async function loadIdentityKey() {
  return secureLoad(IDENTITY_KEY);
}

/**
 * Save a ratchet session for a conversation
 * @param {string} conversationId
 * @param {Object} ratchetState — serialized ratchet state
 */
export async function saveRatchetSession(conversationId, ratchetState) {
  await secureStore(RATCHET_PREFIX + conversationId, ratchetState);
}

/**
 * Load a ratchet session for a conversation
 * @param {string} conversationId
 */
export async function loadRatchetSession(conversationId) {
  return secureLoad(RATCHET_PREFIX + conversationId);
}

/**
 * Check if a ratchet session exists
 */
export async function hasRatchetSession(conversationId) {
  const stored = localStorage.getItem(STORAGE_PREFIX + RATCHET_PREFIX + conversationId);
  return stored !== null;
}

/**
 * Delete a ratchet session
 */
export async function deleteRatchetSession(conversationId) {
  localStorage.removeItem(STORAGE_PREFIX + RATCHET_PREFIX + conversationId);
}

/**
 * Wipe ALL keys — called on logout
 * Removes all Vanish-related localStorage entries
 */
export async function wipeAllKeys() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/**
 * Check if identity key exists
 */
export async function hasIdentityKey() {
  return localStorage.getItem(STORAGE_PREFIX + IDENTITY_KEY) !== null;
}
