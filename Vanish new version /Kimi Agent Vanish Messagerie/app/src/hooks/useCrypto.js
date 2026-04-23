// src/hooks/useCrypto.js
// Signal Protocol X3DH + Persistent Double Ratchet
// Hardened with Explicit Versioning — No multi-label fallback

import { useState, useCallback } from 'react';
import {
  generateKeyPair,
  importPublicKey,
  importPrivateKey,
  ecdh,
  hkdf,
  encrypt,
  decrypt,
} from '@/crypto/primitives';
import {
  saveIdentityKey,
  loadIdentityKey,
  wipeAllKeys,
} from '@/crypto/keyStorage';
import {
  saveChainState,
  loadChainState,
  saveSessionState,
  registerSessionId,
} from '@/storage/RatchetStorage';
import {
  PROTOCOL_VERSIONS,
  getVersionParams,
  isSupportedVersion,
  isDeprecatedVersion,
} from '@/crypto/protocolVersion';

// ── Safety Number (Signal-style, 60 digits) ───────────────

export async function computeSafetyNumber(myPublicB64, theirPublicB64) {
  if (!myPublicB64 || !theirPublicB64) return null;
  const sorted = [myPublicB64, theirPublicB64].sort();
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(sorted.join('||VanishText||'))
  );
  const bytes = new Uint8Array(hash).slice(0, 20);
  let decimal = '';
  for (const byte of bytes) decimal += byte.toString().padStart(3, '0');
  return decimal.slice(0, 60).match(/.{1,5}/g).join(' ');
}

// ── Persistent Counter with Version ─────────────────────

async function getPersistentCounter(userId, version) {
  const chainState = await loadChainState(`${userId}:${version}`);
  return chainState?.sendMsgNum || 0;
}

async function incrementPersistentCounter(userId, version) {
  const key = `${userId}:${version}`;
  const chainState = await loadChainState(key) || {
    sendMsgNum: 0,
    recvMsgNum: 0,
    prevChainLen: 0,
    version,
  };
  chainState.sendMsgNum = (chainState.sendMsgNum || 0) + 1;
  await saveChainState(key, chainState);
  return chainState.sendMsgNum - 1;
}

async function resetPersistentCounter(userId, version) {
  await saveChainState(`${userId}:${version}`, {
    sendMsgNum: 0,
    recvMsgNum: 0,
    prevChainLen: 0,
    version,
  });
}

export function useCrypto() {
  const [keys, setKeys] = useState(null);

  // ── Identity Keys ───────────────────────────────────────

  const generateKeys = useCallback(async (uid) => {
    try {
      const saved = await loadIdentityKey(uid);
      if (saved) {
        const privateKey = await importPrivateKey(saved.privateJwk);
        const kp = {
          privateKey,
          publicKey: null,
          publicB64: saved.publicB64,
          privateJwk: saved.privateJwk,
        };
        const k = { type: 'identity', kp };
        setKeys(k);
        return k;
      }
      const myKeys = await generateKeyPair();
      await saveIdentityKey(uid, { privateJwk: myKeys.privateJwk, publicB64: myKeys.publicB64 });
      const k = { type: 'identity', kp: myKeys };
      setKeys(k);
      return k;
    } catch (e) {
      console.error('[Crypto] Error generateKeys:', e);
      return null;
    }
  }, []);

  const wipeKeys = useCallback(async (uid) => {
    await wipeAllKeys(uid);
    setKeys(null);
  }, []);

  // ── Encrypt — SINGLE VERSION, NO FALLBACK ───────────────

  const encryptMessageForDirectory = useCallback(
    async (plainText, directory) => {
      if (!plainText || keys?.type !== 'identity') {
        console.warn('[Crypto] encryptMessageForDirectory: invalid state');
        return null;
      }

      const version = PROTOCOL_VERSIONS.CURRENT;
      const params = getVersionParams(version);

      const ciphertexts = {};
      for (const [userId, peerData] of Object.entries(directory)) {
        if (!peerData?.publicKey) continue;

        try {
          // Check peer version compatibility
          const peerVersion = peerData.protocolVersion || version;
          if (!isSupportedVersion(peerVersion)) {
            console.warn(`[Crypto] Peer ${userId} uses unsupported version ${peerVersion}`);
            continue;
          }

          const peerKeyObj = await importPublicKey(peerData.publicKey);
          const sharedSecret = await ecdh(keys.kp.privateKey, peerKeyObj);

          // SINGLE label generation — no fallback
          const msgIndex = await incrementPersistentCounter(userId, version);
          const label = params.hkdfLabel(msgIndex);

          const aesKeyBuf = await hkdf(sharedSecret, params.hkdfSalt, label, params.aesKeyLength);
          const { iv, ciphertext } = await encrypt(aesKeyBuf, plainText);

          ciphertexts[userId] = {
            algo: 'ecdh-aes-gcm-ratchet',
            v: version,           // ← Explicit version
            iv,
            ciphertext,
            senderPublicKey: keys.kp.publicB64,
            msgIndex,
          };

          // Persist session metadata
          const sessionId = `${keys.kp.publicB64}:${peerData.publicKey}`;
          await saveSessionState(sessionId, JSON.stringify({
            peerUserId: userId,
            lastMsgIndex: msgIndex,
            lastSentAt: Date.now(),
            version,
          }));
          await registerSessionId(sessionId);

        } catch (e) {
          console.error(`[Crypto] Encryption error for ${userId}:`, e);
        }
      }
      return ciphertexts;
    },
    [keys]
  );

  // ── Decrypt — STRICT VERSION CHECK, NO FALLBACK ─────────

  const decryptMessageWithSenderKey = useCallback(
    async (payload, _fallback) => {
      if (!keys?.kp?.privateKey) {
        return { t: '[Error: keys not initialized]', s: null };
      }

      try {
        // Parse payload
        let data;
        if (typeof payload === 'string') {
          if (payload.startsWith('enc:')) {
            // LEGACY: Reject old format entirely — no parsing, no fallback
            console.error('[Crypto] Rejected legacy format message');
            return { t: '[Error: Legacy message format rejected — ratchet reset required]', s: null };
          }
          try {
            data = JSON.parse(payload);
          } catch (e) {
            return { t: '[Error: Invalid message format]', s: null };
          }
        } else {
          data = payload;
        }

        const {
          iv,
          ciphertext,
          senderPublicKey,
          msgIndex,
          v: declaredVersion,
        } = data;

        // 1. MANDATORY version check BEFORE any crypto
        if (!declaredVersion) {
          return { t: '[Error: Missing protocol version]', s: null };
        }

        if (isDeprecatedVersion(declaredVersion)) {
          return { t: `[Error: Deprecated version ${declaredVersion} — update required]`, s: null };
        }

        if (!isSupportedVersion(declaredVersion)) {
          return { t: `[Error: Unknown version ${declaredVersion}]`, s: null };
        }

        if (!senderPublicKey) {
          return { t: '[Error: Sender key missing]', s: null };
        }

        // 2. SINGLE label generation based on declared version
        const params = getVersionParams(declaredVersion);
        const resolvedIndex = Number(msgIndex || 0);
        const label = params.hkdfLabel(resolvedIndex);

        // 3. SINGLE decryption attempt — NO multi-label loop
        const senderKeyObj = await importPublicKey(senderPublicKey);
        const sharedSecret = await ecdh(keys.kp.privateKey, senderKeyObj);
        const aesKeyBuf = await hkdf(sharedSecret, params.hkdfSalt, label, params.aesKeyLength);

        let plainText;
        try {
          plainText = await decrypt(aesKeyBuf, iv, ciphertext);
        } catch (decryptError) {
          // Single failure — no alternative labels to try
          console.error('[Crypto] Decrypt failed (single attempt):', decryptError.message);
          return { t: '[Decryption failed: Key or message corrupted]', s: null };
        }

        // 4. Update receive counter
        const sessionId = `${senderPublicKey}:${keys.kp.publicB64}`;
        const chainState = await loadChainState(sessionId) || {
          sendMsgNum: 0,
          recvMsgNum: 0,
          version: declaredVersion,
        };
        chainState.recvMsgNum = Math.max(chainState.recvMsgNum || 0, resolvedIndex + 1);
        await saveChainState(sessionId, chainState);

        // 5. Parse result
        try {
          const parsed = JSON.parse(plainText);
          return { t: parsed.t || plainText, s: parsed.s || senderPublicKey };
        } catch (_) {
          return { t: plainText, s: senderPublicKey };
        }

      } catch (e) {
        console.error('[Crypto] Critical decryption error:', e.message);
        return { t: '[Decryption failed: Protocol error]', s: null };
      }
    },
    [keys]
  );

  // ── Utility: Reset ratchet for specific peer ──────────────

  const resetRatchetForPeer = useCallback(async (peerUserId) => {
    for (const v of PROTOCOL_VERSIONS.SUPPORTED) {
      await resetPersistentCounter(peerUserId, v);
    }
    console.log(`[Crypto] Ratchet reset for peer ${peerUserId}`);
  }, []);

  return {
    generateKeys,
    wipeKeys,
    encryptMessageForDirectory,
    decryptMessageWithSenderKey,
    resetRatchetForPeer,
    computeSafetyNumber,
  };
}
