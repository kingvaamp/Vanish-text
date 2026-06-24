// src/storage/KeyStorage.js
// Secure key storage with graceful fallback for web (no expo-secure-store needed)
// On native: uses expo-secure-store (iOS Keychain / Android Keystore)
// On web: uses localStorage for persistence
//
// Stocke : Identity Keys (IK), Signed Prekey (SPK), One-Time Prekeys (OPK),
//          sessions Double Ratchet.

import { Platform } from 'react-native';

const P = 'vt:';  // namespace prefix

// ── Web path ──────────────────────────────────────────────────────
function webSet(key, value) {
  try { localStorage.setItem(P + key, value); } catch (_) {}
}
function webGet(key) {
  try { return localStorage.getItem(P + key); } catch (_) { return null; }
}
function webDel(key) {
  try { localStorage.removeItem(P + key); } catch (_) {}
}
function webListKeys(prefix) {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(P + prefix)) keys.push(k.replace(P, ''));
    }
    return keys;
  } catch (_) { return []; }
}

function getPrefixedKey(uid, key) {
  return uid ? `${uid}:${key}` : key;
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

// ── Identity Keys (IK) ───────────────────────────────────────────

export async function saveIdentityKey(uid, kp) {
  const prefix = getPrefixedKey(uid, '');
  await secureSet(prefix + 'ik_priv', JSON.stringify(kp.privateJwk));
  await secureSet(prefix + 'ik_pub',  kp.publicB64);
}

export async function loadIdentityKey(uid) {
  const prefix = getPrefixedKey(uid, '');
  const priv = await secureGet(prefix + 'ik_priv');
  const pub  = await secureGet(prefix + 'ik_pub');
  if (!priv || !pub) return null;
  try { return { privateJwk: JSON.parse(priv), publicB64: pub }; }
  catch (_) { return null; }
}

// ── Signed Prekey (SPK) ──────────────────────────────────────────

export async function saveSPK(uid, spk) {
  const prefix = getPrefixedKey(uid, '');
  // spk = { keyPair: { publicB64, privateJwk }, publicB64, signature, timestamp }
  await secureSet(prefix + 'spk_priv', JSON.stringify(spk.keyPair.privateJwk));
  await secureSet(prefix + 'spk_pub',  spk.publicB64);
  await secureSet(prefix + 'spk_sig',  spk.signature);
  await secureSet(prefix + 'spk_ts',   String(spk.timestamp));
}

export async function loadSPK(uid) {
  const prefix = getPrefixedKey(uid, '');
  const priv = await secureGet(prefix + 'spk_priv');
  const pub  = await secureGet(prefix + 'spk_pub');
  const sig  = await secureGet(prefix + 'spk_sig');
  const ts   = await secureGet(prefix + 'spk_ts');
  if (!priv || !pub || !sig) return null;
  return {
    keyPair: { publicB64: pub, privateJwk: JSON.parse(priv) },
    publicB64: pub,
    signature: sig,
    timestamp: ts ? parseInt(ts, 10) : 0,
  };
}

// ── One-Time Prekeys (OPK) ──────────────────────────────────────
// Stored as a JSON array. Each OPK: { id, keyPair: { publicB64, privateJwk }, used }

export async function saveOPKs(uid, opks) {
  const prefix = getPrefixedKey(uid, '');
  const serialized = opks.map(opk => ({
    id:        opk.id,
    publicB64: opk.publicB64,
    privateJwk: opk.keyPair?.privateJwk || opk.privateJwk,
    used:      opk.used || false,
  }));
  await secureSet(prefix + 'opks', JSON.stringify(serialized));
}

export async function loadOPKs(uid) {
  const prefix = getPrefixedKey(uid, '');
  const raw = await secureGet(prefix + 'opks');
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return data.map(opk => ({
      id:        opk.id,
      publicB64: opk.publicB64,
      keyPair:   { publicB64: opk.publicB64, privateJwk: opk.privateJwk },
      privateJwk: opk.privateJwk,
      used:      opk.used || false,
    }));
  } catch (_) { return []; }
}

export async function markOPKUsed(uid, opkId) {
  const opks = await loadOPKs(uid);
  const idx = opks.findIndex(o => o.id === opkId);
  if (idx !== -1) {
    opks[idx].used = true;
    await saveOPKs(uid, opks);
  }
}

export async function getUnusedOPKs(uid) {
  const opks = await loadOPKs(uid);
  return opks.filter(o => !o.used);
}

// ── Wipe ────────────────────────────────────────────────────────

export async function wipeAllKeys(uid) {
  const prefix = getPrefixedKey(uid, '');
  await secureDel(prefix + 'ik_priv');
  await secureDel(prefix + 'ik_pub');
  await secureDel(prefix + 'spk_priv');
  await secureDel(prefix + 'spk_pub');
  await secureDel(prefix + 'spk_sig');
  await secureDel(prefix + 'spk_ts');
  await secureDel(prefix + 'opks');
  // Also clear any DR sessions for this uid
  if (typeof localStorage !== 'undefined') {
    const sessionKeys = webListKeys('dr:session:');
    sessionKeys.forEach(k => webDel(k));
  }
  console.log(`[KeyStorage] ✓ Toutes les clés effacées pour ${uid || 'global'}`);
}
