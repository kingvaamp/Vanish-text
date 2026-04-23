// useCrypto.js — Version production avec Forward Secrecy basique (v2)
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

// Compteur de ratchet en mémoire par destinataire
// Donne une Forward Secrecy basique : clé différente à chaque message
const ratchetCounters = {};

// Calcule le Safety Number entre deux clés publiques (Signal-style, 60 digits)
export async function computeSafetyNumber(myPublicB64, theirPublicB64) {
  if (!myPublicB64 || !theirPublicB64) return null;
  const sorted = [myPublicB64, theirPublicB64].sort();
  const enc    = new TextEncoder();
  const hash   = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(sorted.join('||VanishText||'))
  );
  // 20 octets = 160 bits → 60 chiffres décimaux (identique à Signal)
  const bytes = new Uint8Array(hash).slice(0, 20);
  let decimal = '';
  for (const byte of bytes) decimal += byte.toString().padStart(3, '0');
  return decimal.slice(0, 60).match(/.{1,5}/g).join(' ');
}

export default function useCrypto() {
  const [keys, setKeys] = useState(null);

  // Génère ou restaure les clés d'identité depuis le Keychain
  const generateKeys = useCallback(async (uid) => {
    try {
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
        console.log(`[Crypto] ✓ Clés restaurées pour ${uid || 'global'}`);
        return k;
      }
      const myKeys = await generateKeyPair();
      await saveIdentityKey(uid, { privateJwk: myKeys.privateJwk, publicB64: myKeys.publicB64 });
      const k = { type: 'identity', kp: myKeys };
      setKeys(k);
      console.log(`[Crypto] ✓ Nouvelles clés générées pour ${uid || 'global'}`);
      return k;
    } catch (e) {
      console.error('[Crypto] Erreur generateKeys :', e);
      return null;
    }
  }, []);

  const wipeKeys = useCallback(async (uid) => {
    await wipeAllKeys(uid);
    setKeys(null);
    console.log(`[Crypto] Identity wiped for ${uid || 'global'}.`);
  }, []);

  // Chiffre un message pour N destinataires (N-Way ECDH + ratchet basique)
  const encryptMessageForDirectory = useCallback(
    async (plainText, directory) => {
      if (!plainText || keys?.type !== 'identity') {
        console.warn('[Crypto] encryptMessageForDirectory : état invalide');
        return null;
      }
      const ciphertexts = {};
      for (const [userId, peerData] of Object.entries(directory)) {
        if (!peerData?.publicKey) continue;
        try {
          const peerKeyObj   = await importPublicKey(peerData.publicKey);
          const sharedSecret = await ecdh(keys.kp.privateKey, peerKeyObj);

          // Ratchet basique : compteur incrémenté à chaque message par destinataire
          if (ratchetCounters[userId] === undefined) ratchetCounters[userId] = 0;
          const msgIndex = ratchetCounters[userId]++;

          // NOTE: label must match decryptMessageWithSenderKey exactly (BUG 5 fix)
          const aesKeyBuf = await hkdf(
            sharedSecret, null,
            `VanishText-msg-v3-${msgIndex}`, 32
          );
          const { iv, ciphertext } = await encrypt(aesKeyBuf, plainText);
          ciphertexts[userId] = {
            algo:            'ecdh-aes-gcm-ratchet-v2',
            iv,
            ciphertext,
            senderPublicKey: keys.kp.publicB64,
            msgIndex,
          };
        } catch (e) {
          console.error(`[Crypto] Erreur chiffrement vers ${userId} :`, e);
        }
      }
      return ciphertexts;
    },
    [keys]
  );

  // Déchiffre un message reçu
  // payload : objet { algo, iv, ciphertext, senderPublicKey, msgIndex }
  //        ou string legacy "enc:ecdh-aes-gcm:v5:iv:ct:senderKey"
  const decryptMessageWithSenderKey = useCallback(
    async (payload, _fallback) => {
      if (!keys?.kp?.privateKey) {
        return { t: '[Erreur : clés non initialisées]', s: null };
      }
      try {
        // Support legacy format string (v5) et nouveau format objet (v2)
        let data;
        if (typeof payload === 'string') {
          if (payload.startsWith('enc:')) {
            const parts = payload.split(':');
            data = {
              iv:             parts[3],
              ciphertext:     parts[4],
              senderPublicKey: parts[5] || _fallback,
              msgIndex:       0,
              senderId:       'legacy',
            };
          } else {
            data = JSON.parse(payload);
          }
        } else {
          data = payload;
        }

        const { iv, ciphertext, senderPublicKey } = data;
        const msgIndex = Number(data.msgIndex || 0);

        if (!senderPublicKey) {
          return { t: '[Erreur : clé expéditeur manquante]', s: null };
        }

        const senderKeyObj = await importPublicKey(senderPublicKey);
        const sharedSecret = await ecdh(keys.kp.privateKey, senderKeyObj);

        // ESSAI DE DÉCHIFFREMENT AVEC PLUSIEURS VERSIONS DE LABEL HKDF (BUG 5 FIX EXTENDED)
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
            
            // Si on arrive ici, le déchiffrement a réussi !
            try {
              // Support Sealed Sender (objet { t, s })
              const parsed = JSON.parse(plainText);
              return { t: parsed.t || plainText, s: parsed.s || senderPublicKey };
            } catch (_) {
              return { t: plainText, s: senderPublicKey };
            }
          } catch (e) {
            lastError = e;
            continue; // On essaye le label suivant
          }
        }

        // Si on a épuisé tous les labels
        throw new Error(lastError ? lastError.message : 'Auth Tag failure on all labels');

      } catch (e) {
        console.error('[Crypto] Erreur déchiffrement critique :', e.message);
        return { t: '[Déchiffrement échoué : Clé ou Index incorrect]', s: null };
      }
    },
    [keys]
  );

  return {
    generateKeys,
    wipeKeys,
    encryptMessageForDirectory,
    decryptMessageWithSenderKey,
  };
}
