// useCrypto.js — Version production avec Double Ratchet (Signal-spec, v3)
// Garde la compatibilité ascendante avec les messages legacy (v1, v2, v5).
// Les nouvelles conversations utilisent le Double Ratchet (dr-aes-gcm-v1).

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
import {
  saveIdentityKey,
  loadIdentityKey,
  wipeAllKeys,
} from './src/storage/KeyStorage';
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
} from './src/crypto/sessionManager';

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
      const saved = await loadIdentityKey(uid);
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
        // Restaurer les sessions persistées (namespace = uid)
        await restoreSession(uid);
        setDrReady(true);
        console.log(`[Crypto] ✓ Clés restaurées pour ${uid} ; DR ready`);
        return k;
      }
      const myKeys = await generateKeyPair();
      await saveIdentityKey(uid, { privateJwk: myKeys.privateJwk, publicB64: myKeys.publicB64 });
      const k = { type: 'identity', kp: myKeys };
      setKeys(k);
      setDrReady(true);
      console.log(`[Crypto] ✓ Nouvelles clés générées pour ${uid} ; DR ready`);
      return k;
    } catch (e) {
      console.error('[Crypto] Erreur generateKeys :', e);
      return null;
    }
  }, []);

  const wipeKeys = useCallback(async (uid) => {
    await clearAllSessions();
    await wipeAllKeys(uid);
    setKeys(null);
    setCurrentUid(null);
    setDrReady(false);
    console.log(`[Crypto] Identity + sessions wiped for ${uid}.`);
  }, []);

  // ── Enregistrer la clé publique d'un contact ──────────────
  const registerContactKey = useCallback((userId, publicKeyB64) => {
    contactKeys[userId] = publicKeyB64;
  }, []);

  // ── Chiffrement avec Double Ratchet (nouveau) ────────────
  const encryptWithDR = useCallback(async (plainText, recipientUserId) => {
    if (!plainText || keys?.type !== 'identity' || !currentUid) return null;
    const convId = canonicalConvId(currentUid, recipientUserId);
    try {
      if (!hasSession(convId)) {
        const theirPub = contactKeys[recipientUserId];
        if (!theirPub) return null;
        await initiateSession(convId, keys.kp, theirPub);
      }
      const result = await drEncryptMessage(convId, plainText);
      return {
        algo:            'dr-aes-gcm-v1',
        header:          result.header,
        ciphertext:      result.ciphertext,
        senderPublicKey: keys.kp.publicB64,
        convId,
      };
    } catch (e) {
      console.error(`[Crypto] DR encrypt error for ${recipientUserId}:`, e);
      return null;
    }
  }, [keys, currentUid]);

  // ── Chiffrement legacy (v2) ──────────────────────────────
  const encryptLegacy = useCallback(async (plainText, peerUserId, peerPublicKeyB64) => {
    try {
      const peerKeyObj   = await importPublicKey(peerPublicKeyB64);
      const sharedSecret = await ecdh(keys.kp.privateKey, peerKeyObj);
      if (ratchetCounters[peerUserId] === undefined) ratchetCounters[peerUserId] = 0;
      const msgIndex = ratchetCounters[peerUserId]++;
      const aesKeyBuf = await hkdf(
        sharedSecret, null,
        `VanishText-msg-v3-${msgIndex}`, 32
      );
      const { iv, ciphertext } = await encrypt(aesKeyBuf, plainText);
      return {
        algo:            'ecdh-aes-gcm-ratchet-v2',
        iv,
        ciphertext,
        senderPublicKey: keys.kp.publicB64,
        msgIndex,
      };
    } catch (e) {
      console.error(`[Crypto] Legacy encrypt error for ${peerUserId}:`, e);
      return null;
    }
  }, [keys]);

  // ── Chiffre un message pour N destinataires ──────────────
  const encryptMessageForDirectory = useCallback(
    async (plainText, directory) => {
      if (!plainText || keys?.type !== 'identity') {
        console.warn('[Crypto] encryptMessageForDirectory : état invalide');
        return null;
      }
      const ciphertexts = {};
      for (const [userId, peerData] of Object.entries(directory)) {
        if (!peerData?.publicKey) continue;
        contactKeys[userId] = peerData.publicKey;

        // Essayer DR d'abord
        if (peerData.doubleRatchet !== false) {
          const drResult = await encryptWithDR(plainText, userId);
          if (drResult) {
            ciphertexts[userId] = drResult;
            continue;
          }
        }

        // Fallback legacy
        const legacyResult = await encryptLegacy(plainText, userId, peerData.publicKey);
        if (legacyResult) {
          ciphertexts[userId] = legacyResult;
        }
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
      const plaintext = await drDecryptMessage(convId, keys.kp, header, ciphertext);
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
            data = {
              algo: 'ecdh-aes-gcm-v5', iv: parts[3], ciphertext: parts[4],
              senderPublicKey: parts[5] || _fallback, msgIndex: 0,
            };
          } else {
            data = JSON.parse(payload);
          }
        } else {
          data = payload;
        }

        // Double Ratchet
        if (data.algo === 'dr-aes-gcm-v1') {
          const result = await decryptWithDR(data);
          if (result) return result;
        }

        // Legacy
        const { iv, ciphertext, senderPublicKey } = data;
        const msgIndex = Number(data.msgIndex || 0);
        if (!senderPublicKey) {
          return { t: '[Erreur : clé expéditeur manquante]', s: null };
        }

        const senderKeyObj = await importPublicKey(senderPublicKey);
        const sharedSecret = await ecdh(keys.kp.privateKey, senderKeyObj);

        const LABELS = [
          `VanishText-msg-v3-${msgIndex}`,
          `VanishText-msg-v2-${msgIndex}`,
          `VanishText-msg-v1-${msgIndex}`,
          `VanishText-msg-v5-${msgIndex}`
        ];

        let lastError = null;
        for (const label of LABELS) {
          try {
            const aesKeyBuf = await hkdf(sharedSecret, null, label, 32);
            const plainText = await decrypt(aesKeyBuf, iv, ciphertext);
            try {
              const parsed = JSON.parse(plainText);
              return { t: parsed.t || plainText, s: parsed.s || senderPublicKey };
            } catch (_) {
              return { t: plainText, s: senderPublicKey };
            }
          } catch (e) { lastError = e; continue; }
        }
        throw new Error(lastError ? lastError.message : 'Auth Tag failure on all labels');

      } catch (e) {
        console.error('[Crypto] Erreur déchiffrement :', e.message);
        return { t: '[Déchiffrement échoué]', s: null };
      }
    },
    [keys, decryptWithDR]
  );

  // ── Gestion de session DR ─────────────────────────────────
  const ensureSession = useCallback(async (contactId, contactPublicKeyB64) => {
    if (!currentUid) throw new Error('[Crypto] No current UID');
    const convId = canonicalConvId(currentUid, contactId);
    if (!hasSession(convId)) {
      contactKeys[contactId] = contactPublicKeyB64;
      await initiateSession(convId, keys.kp, contactPublicKeyB64);
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
  };
}
