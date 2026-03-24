// src/storage/KeyStorage.js
// iOS Keychain / Android Keystore via expo-secure-store
// Les clés privées ne transitent JAMAIS en clair hors du Keychain

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const P    = 'vt:';  // Préfixe pour éviter les collisions
const OPTS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const isWeb = Platform.OS === 'web';

async function secureSet(key, value) {
  if (isWeb) {
    try { sessionStorage.setItem(P + key, value); } catch (_) {}
    return;
  }
  await SecureStore.setItemAsync(P + key, value, OPTS);
}

async function secureGet(key) {
  if (isWeb) {
    try { return sessionStorage.getItem(P + key); } catch (_) { return null; }
  }
  return SecureStore.getItemAsync(P + key);
}

async function secureDel(key) {
  if (isWeb) {
    try { sessionStorage.removeItem(P + key); } catch (_) {}
    return;
  }
  return SecureStore.deleteItemAsync(P + key);
}

// ── Identity Key ────────────────────────────────────────────────

export async function saveIdentityKey(kp) {
  await secureSet('ik_priv', JSON.stringify(kp.privateJwk));
  await secureSet('ik_pub',  kp.publicB64);
  console.log('[KeyStorage] ✓ Identity Key sauvegardée dans le Keychain');
}

export async function loadIdentityKey() {
  const priv = await secureGet('ik_priv');
  const pub  = await secureGet('ik_pub');
  if (!priv || !pub) return null;
  try {
    return { privateJwk: JSON.parse(priv), publicB64: pub };
  } catch (e) {
    console.warn('[KeyStorage] Clé corrompue, régénération nécessaire');
    return null;
  }
}

// ── Wipe complet (logout / suppression compte) ──────────────────

export async function wipeAllKeys() {
  await secureDel('ik_priv');
  await secureDel('ik_pub');
  console.log('[KeyStorage] ✓ Toutes les clés effacées du Keychain');
}
