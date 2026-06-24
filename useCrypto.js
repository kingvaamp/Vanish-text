// useCrypto.js — Version production avec Double Ratchet + X3DH (v4)
// Garde la compatibilité ascendante avec les messages legacy (v1, v2, v5).
// Nouvelles conversations utilisent X3DH + Double Ratchet (dr-aes-gcm-v1).

import { useState, useCallback } from 'react';
import {
  generateKeyPair,
  importPublicKey,
  importPrivateKey,
  ecdh,
  hkdf,
  encrypt,
  decrypt,
} from './src/crypto/primitives';
import * as KeyStorage from './src/storage/KeyStorage';
import {
  initiateSession,
  respondSession,
  encryptMessage as drEncryptMessage,
  decryptMessage as drDecryptMessage,
  restoreSession,
  hasSession,
  getSession,
  clearSession,
  clearAllSessions,
  canonicalConvId,
  generatePrekeyBundle,
  getCurrentPrekeyBundle,
  getPendingInitMessage,
} from './src/crypto/sessionManager';
import { fetchPrekeyBundle, uploadPrekeyBundle } from './src/crypto/x3dh';

// ── Compteur de ratchet legacy (v2) ─────────────────────────
const ratchetCounters = {};

// ── Cache des clés publiques des contacts ───────────────────
const contactKeys = {};

// ── Safety Number (60 chiffres, Signal-style) ───────────────
export async function computeSafetyNumber(myPublicB64, theirPublicB64) {
  if (!myPublicB64 || !theirPublicB64) return null;
  const sorted = [myPublicB64, theirPublicB64].sort();
  const enc    = new TextEncoder();
  const hash   = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(sorted.join('||VanishText||'))
  );
  const bytes = new Uint8Array(hash).slice(0, 20);
  let decimal = '';
  for (const byte of bytes) decimal += byte.toString().padStart(3, '0');
  return decimal.slice(0, 60).match(/.{1,5}/g).join(' ');
}

export default function useCrypto() {
  const [keys, setKeys] = useState(null);
  const [currentUid, setCurrentUid] = useState(null);
  const [drReady, setDrReady] = useState(false);

  // ── Génère ou restaure les clés d'identité ────────────────
  const generateKeys = useCallback(async (uid) => {
    try {
      setCurrentUid(uid);
      const saved = await KeyStorage.loadIdentityKey(uid);
      if (saved) {
        const privateKey = await importPrivateKey(saved.privateJwk);
        const kp = {
          privateKey,
          publicKey:  null,
          publicB64:  saved.publicB64,
          privateJwk: saved.privateJwk,
        };
        const k = { type: 'identity', kp };
        setKeys(k);
        await restoreSession(uid);
        setDrReady(true);
        return k;
      }
      const myKeys = await generateKeyPair();
      await KeyStorage.saveIdentityKey(uid, { privateJwk: myKeys.privateJwk, publicB64: myKeys.publicB64 });
      // Générer le prekey bundle
      await generatePrekeyBundle(uid, myKeys);
      const k = { type: 'identity', kp: myKeys };
      setKeys(k);
      setDrReady(true);
      console.log(`[Crypto] ✓ Nouvelles clés + prekey bundle pour ${uid}`);
      return k;
    } catch (e) {
      console.error('[Crypto] Erreur generateKeys :', e);
      return null;
    }
  }, []);

  const wipeKeys = useCallback(async (uid) => {
    await clearAllSessions();
    await KeyStorage.wipeAllKeys(uid);
    setKeys(null);
    setCurrentUid(null);
    setDrReady(false);
  }, []);

  const registerContactKey = useCallback((userId, publicKeyB64) => {
    contactKeys[userId] = publicKeyB64;
  }, []);

  // ── Chiffrement Double Ratchet (v3) ──────────────────────
  const encryptWithDR = useCallback(async (plainText, recipientUserId) => {
    if (!plainText || keys?.type !== 'identity' || !currentUid) return null;
    const convId = canonicalConvId(currentUid, recipientUserId);
    try {
      if (!hasSession(convId)) {
        const theirPub = contactKeys[recipientUserId];
        if (!theirPub) return null;
        // Récupérer le bundle prekey du destinataire
        const bundle = { identityPubB64: theirPub, signedPrekey: { publicB64: theirPub } };
        await initiateSession(convId, keys.kp, recipientUserId, bundle);
      }
      const result = await drEncryptMessage(convId, plainText);
      const initMsg = getPendingInitMessage(convId);
      return {
        algo:            'dr-aes-gcm-v1',
        header:          result.header,
        ciphertext:      result.ciphertext,
        senderPublicKey: keys.kp.publicB64,
        convId,
        x3dhInit:        initMsg || undefined,
      };
    } catch (e) {
      console.error(`[Crypto] DR encrypt error:`, e);
      return null;
    }
  }, [keys, currentUid]);

  // ── Chiffrement legacy ──────────────────────────────────
  const encryptLegacy = useCallback(async (plainText, peerUserId, peerPublicKeyB64) => {
    try {
      const peerKeyObj   = await importPublicKey(peerPublicKeyB64);
      const sharedSecret = await ecdh(keys.kp.privateKey, peerKeyObj);
      if (ratchetCounters[peerUserId] === undefined) ratchetCounters[peerUserId] = 0;
      const msgIndex = ratchetCounters[peerUserId]++;
      const aesKeyBuf = await hkdf(sharedSecret, null, `VanishText-msg-v3-${msgIndex}`, 32);
      const { iv, ciphertext } = await encrypt(aesKeyBuf, plainText);
      return {
        algo: 'ecdh-aes-gcm-ratchet-v2', iv, ciphertext,
        senderPublicKey: keys.kp.publicB64, msgIndex,
      };
    } catch (e) {
      console.error(`[Crypto] Legacy encrypt error:`, e);
      return null;
    }
  }, [keys]);

  // ── Chiffrement N destinataires ──────────────────────────
  const encryptMessageForDirectory = useCallback(
    async (plainText, directory) => {
      if (!plainText || keys?.type !== 'identity') return null;
      const ciphertexts = {};
      for (const [userId, peerData] of Object.entries(directory)) {
        if (!peerData?.publicKey) continue;
        contactKeys[userId] = peerData.publicKey;
        if (peerData.doubleRatchet !== false) {
          const drResult = await encryptWithDR(plainText, userId);
          if (drResult) { ciphertexts[userId] = drResult; continue; }
        }
        const legacyResult = await encryptLegacy(plainText, userId, peerData.publicKey);
        if (legacyResult) ciphertexts[userId] = legacyResult;
      }
      return ciphertexts;
    },
    [keys, encryptWithDR, encryptLegacy]
  );

  // ── Déchiffrement DR ────────────────────────────────────
  const decryptWithDR = useCallback(async (payload) => {
    if (!keys?.kp?.privateKey) return null;
    const { convId, header, ciphertext } = payload;
    if (!convId || !header) return null;
    try {
      const plaintext = await drDecryptMessage(convId, header, ciphertext);
      return { t: plaintext, s: payload.senderPublicKey || null };
    } catch (e) {
      console.warn('[Crypto] DR decrypt failed:', e.message);
      return null;
    }
  }, [keys]);

  // ── Déchiffrement (DR puis legacy) ──────────────────────
  const decryptMessageWithSenderKey = useCallback(
    async (payload, _fallback) => {
      if (!keys?.kp?.privateKey) {
        return { t: '[Erreur : clés non initialisées]', s: null };
      }
      try {
        let data;
        if (typeof payload === 'string') {
          if (payload.startsWith('enc:')) {
            const parts = payload.split(':');
            data = { algo: 'ecdh-aes-gcm-v5', iv: parts[3], ciphertext: parts[4],
              senderPublicKey: parts[5] || _fallback, msgIndex: 0 };
          } else {
            data = JSON.parse(payload);
          }
        } else {
          data = payload;
        }

        if (data.algo === 'dr-aes-gcm-v1') {
          const result = await decryptWithDR(data);
          if (result) return result;
        }

        const { iv, ciphertext, senderPublicKey } = data;
        const msgIndex = Number(data.msgIndex || 0);
        if (!senderPublicKey) return { t: '[Erreur : clé manquante]', s: null };

        const senderKeyObj = await importPublicKey(senderPublicKey);
        const sharedSecret = await ecdh(keys.kp.privateKey, senderKeyObj);

        const LABELS = [`VanishText-msg-v3-${msgIndex}`, `VanishText-msg-v2-${msgIndex}`,
          `VanishText-msg-v1-${msgIndex}`, `VanishText-msg-v5-${msgIndex}`];

        for (const label of LABELS) {
          try {
            const aesKeyBuf = await hkdf(sharedSecret, null, label, 32);
            const plainText = await decrypt(aesKeyBuf, iv, ciphertext);
            try { const p = JSON.parse(plainText); return { t: p.t || plainText, s: p.s || senderPublicKey }; }
            catch (_) { return { t: plainText, s: senderPublicKey }; }
          } catch (_) { continue; }
        }
        return { t: '[Déchiffrement échoué]', s: null };
      } catch (e) {
        console.error('[Crypto] Erreur déchiffrement :', e.message);
        return { t: '[Déchiffrement échoué]', s: null };
      }
    },
    [keys, decryptWithDR]
  );

  // ── X3DH / Prekey management ────────────────────────────
  const publishPrekeyBundle = useCallback(async (serverUrl) => {
    if (!currentUid || !keys) throw new Error('[Crypto] Not initialized');
    const bundle = await getCurrentPrekeyBundle(currentUid, keys.kp.publicB64);
    if (!bundle) throw new Error('[Crypto] No prekey bundle to publish');
    await uploadPrekeyBundle(serverUrl, bundle, '');
  }, [keys, currentUid]);

  const fetchRemoteBundle = useCallback(async (serverUrl, remoteUserId) => {
    return fetchPrekeyBundle(serverUrl, remoteUserId);
  }, []);

  const initSessionWithX3DH = useCallback(async (remoteUserId, theirBundle) => {
    if (!currentUid || !keys) throw new Error('[Crypto] Not initialized');
    const convId = canonicalConvId(currentUid, remoteUserId);
    await initiateSession(convId, keys.kp, remoteUserId, theirBundle);
    const initMsg = getPendingInitMessage(convId);
    return { convId, initialMessage: initMsg };
  }, [keys, currentUid]);

  const receiveX3DHSession = useCallback(async (convId, initialMessage) => {
    if (!keys) throw new Error('[Crypto] Not initialized');
    await respondSession(convId, keys.kp, initialMessage);
  }, [keys]);

  const ensureSession = useCallback(async (contactId, contactPublicKeyB64) => {
    if (!currentUid) throw new Error('[Crypto] No current UID');
    const convId = canonicalConvId(currentUid, contactId);
    if (!hasSession(convId)) {
      contactKeys[contactId] = contactPublicKeyB64;
      const bundle = { identityPubB64: contactPublicKeyB64, signedPrekey: { publicB64: contactPublicKeyB64 } };
      await initiateSession(convId, keys.kp, contactId, bundle);
    }
    return getSession(convId);
  }, [keys, currentUid]);

  const destroySession = useCallback(async (convId) => {
    await clearSession(convId);
  }, []);

  return {
    generateKeys,
    wipeKeys,
    encryptMessageForDirectory,
    decryptMessageWithSenderKey,
    drReady,
    registerContactKey,
    ensureSession,
    destroySession,
    // X3DH / Prekey
    publishPrekeyBundle,
    fetchRemoteBundle,
    initSessionWithX3DH,
    receiveX3DHSession,
  };
}
