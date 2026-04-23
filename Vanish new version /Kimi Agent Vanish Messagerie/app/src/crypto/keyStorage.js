// ============================================
// Encrypted Key Storage — Native Capacitor Preferences with AES-256-GCM
// Private keys are NEVER stored in plaintext
// ============================================

import { Preferences } from '@capacitor/preferences';
import { hkdf, encrypt, decrypt, toB64, fromB64 } from './primitives';

const STORAGE_PREFIX = 'vanish_';
const IDENTITY_KEY = 'identity_key';
const RATCHET_PREFIX = 'ratchet_';
const SALT_KEY = 'storage_salt';

/**
 * Derive the wrapping key from a stable salt
 * We use Capacitor Preferences to store the salt securely.
 */
async function getWrappingKey() {
  let { value: salt } = await Preferences.get({ key: STORAGE_PREFIX + SALT_KEY });
  
  if (!salt) {
    // Generate a stable salt on first use
    const newSalt = crypto.getRandomValues(new Uint8Array(32));
    salt = toB64(newSalt);
    await Preferences.set({ key: STORAGE_PREFIX + SALT_KEY, value: salt });
  }
  
  const saltBuf = fromB64(salt);
  // In native apps, origin is usually capacitor://localhost, but to be robust across platforms
  // we just use a static string combined with the random salt.
  const originData = new TextEncoder().encode("VanishText-Native-App");
  
  // Combine origin with salt
  const combined = new Uint8Array(originData.length + saltBuf.byteLength);
  combined.set(new Uint8Array(originData), 0);
  combined.set(new Uint8Array(saltBuf), originData.length);
  
  // Derive wrapping key via HKDF
  return hkdf(combined.buffer, null, 'VanishText-KeyStorage-Wrap-v1', 32);
}

/**
 * Encrypt data before storing in Preferences
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
  
  await Preferences.set({ key: STORAGE_PREFIX + key, value: JSON.stringify(payload) });
}

/**
 * Decrypt data from Preferences
 */
async function secureLoad(key) {
  const { value: stored } = await Preferences.get({ key: STORAGE_PREFIX + key });
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
  const { value } = await Preferences.get({ key: STORAGE_PREFIX + RATCHET_PREFIX + conversationId });
  return value !== null;
}

/**
 * Delete a ratchet session
 */
export async function deleteRatchetSession(conversationId) {
  await Preferences.remove({ key: STORAGE_PREFIX + RATCHET_PREFIX + conversationId });
}

/**
 * Wipe ALL keys — called on logout
 * Removes all Vanish-related Preferences entries
 */
export async function wipeAllKeys() {
  const { keys } = await Preferences.keys();
  for (const key of keys) {
    if (key.startsWith(STORAGE_PREFIX)) {
      await Preferences.remove({ key });
    }
  }
}

/**
 * Check if identity key exists
 */
export async function hasIdentityKey() {
  const { value } = await Preferences.get({ key: STORAGE_PREFIX + IDENTITY_KEY });
  return value !== null;
}

/**
 * Wipe ratchet keys for a specific user ID
 * @param {string} uid
 */
export async function wipeRatchetKeys(uid) {
  const prefix = STORAGE_PREFIX + (uid ? uid + '_' : '') + RATCHET_PREFIX;
  // Delete common ratchet-related keys
  const ratchetKeys = ['_rk', '_ck_send', '_ck_recv', '_sn', '_rn', '_skipped'];
  for (const key of ratchetKeys) {
    await Preferences.remove({ key: prefix + key });
  }
  console.log(`[KeyStorage] Ratchet keys wiped for ${uid || 'global'}`);
}

