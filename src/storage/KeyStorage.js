// src/storage/KeyStorage.js
// Secure key storage with graceful fallback for web (no expo-secure-store needed)
// On native: uses expo-secure-store (iOS Keychain / Android Keystore)
// On web: uses sessionStorage (keys cleared when tab closes — acceptable for web demo)

import { Platform } from 'react-native';

const P = 'vt:';  // namespace prefix

// ── Web path ──────────────────────────────────────────────────────
function webSet(key, value) {
  try { sessionStorage.setItem(P + key, value); } catch (_) {}
}
function webGet(key) {
  try { return sessionStorage.getItem(P + key); } catch (_) { return null; }
}
function webDel(key) {
  try { sessionStorage.removeItem(P + key); } catch (_) {}
}

// ── Native path (lazy import so web bundle never loads expo-secure-store) ──
let SecureStore = null;
async function getSecureStore() {
  if (SecureStore) return SecureStore;
  try {
    SecureStore = await import('expo-secure-store');
    return SecureStore;
  } catch (_) {
    console.warn('[KeyStorage] expo-secure-store non disponible, fallback sessionStorage');
    return null;
  }
}

const OPTS = { keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' };

async function secureSet(key, value) {
  if (Platform.OS === 'web') { webSet(key, value); return; }
  const ss = await getSecureStore();
  if (ss) await ss.setItemAsync(P + key, value, OPTS);
  else webSet(key, value);
}

async function secureGet(key) {
  if (Platform.OS === 'web') return webGet(key);
  const ss = await getSecureStore();
  return ss ? ss.getItemAsync(P + key) : webGet(key);
}

async function secureDel(key) {
  if (Platform.OS === 'web') { webDel(key); return; }
  const ss = await getSecureStore();
  if (ss) await ss.deleteItemAsync(P + key);
  else webDel(key);
}

// ── Public API ────────────────────────────────────────────────────

export async function saveIdentityKey(kp) {
  await secureSet('ik_priv', JSON.stringify(kp.privateJwk));
  await secureSet('ik_pub',  kp.publicB64);
}

export async function loadIdentityKey() {
  const priv = await secureGet('ik_priv');
  const pub  = await secureGet('ik_pub');
  if (!priv || !pub) return null;
  try { return { privateJwk: JSON.parse(priv), publicB64: pub }; }
  catch (_) { return null; }
}

export async function wipeAllKeys() {
  await secureDel('ik_priv');
  await secureDel('ik_pub');
  console.log('[KeyStorage] ✓ Clés effacées');
}
