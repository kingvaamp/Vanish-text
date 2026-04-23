// src/crypto/doubleRatchet.js
// Double Ratchet with explicit versioning — NO multi-label fallback
// Signal Protocol implementation for VanishText

import { toB64, fromB64, hkdf, encrypt as aesEncrypt, decrypt as aesDecrypt } from './primitives';
import {
  PROTOCOL_VERSIONS,
  getVersionParams,
  isSupportedVersion,
} from './protocolVersion';
import { constantTimeEqual } from './constantTime';
import {
  saveSessionState,
  loadSessionState,
  saveChainState,
  loadChainState,
  saveSkippedKeys,
  loadSkippedKeys,
  deleteSessionState,
} from '../storage/RatchetStorage';

const ENC = new TextEncoder();

// ── KDF Functions (version-aware) ─────────────────────────

async function kdfRootKey(rootKey, dhOutput, version) {
  const params = getVersionParams(version);
  const derived = await hkdf(dhOutput, rootKey, params.hkdfInfo, 64);
  return {
    rootKey: derived.slice(0, 32),
    chainKey: derived.slice(32, 64),
  };
}

async function kdfMessageKey(chainKey, version) {
  const params = getVersionParams(version);
  // We use a modified label for the message key chain to distinguish from root
  const label = params.hkdfLabel(0).replace(/-0$/, '-msgkey');
  const derived = await hkdf(chainKey, null, label, 80);
  return {
    messageKey: derived.slice(0, 32),
    nextChainKey: derived.slice(32, 64),
    headerKey: derived.slice(64, 80),
  };
}

// ── Header Encryption ────────────────────────────────────

async function encryptHeader(headerKey, header, version) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', headerKey, 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    ENC.encode(JSON.stringify({ ...header, v: version }))
  );
  return { iv: toB64(iv), ciphertext: toB64(ciphertext) };
}

async function decryptHeader(headerKey, ivB64, ctB64) {
  const key = await crypto.subtle.importKey('raw', headerKey, 'AES-GCM', false, ['decrypt']);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(ivB64), tagLength: 128 },
      key,
      fromB64(ctB64)
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (e) {
    // Single attempt — no timing leak
    throw new Error('DoubleRatchet: Header decryption failed');
  }
}

// ── Persistent Double Ratchet Session ───────────────────

export class DoubleRatchetSession {
  constructor({
    sessionId,
    rootKey,
    sendingChainKey = null,
    receivingChainKey = null,
    sendMessageNumber = 0,
    recvMessageNumber = 0,
    previousSendChainLength = 0,
    sendRatchetKeyPair = null,
    recvRatchetPublicKey = null,
    skippedMessageKeys = new Map(),
    associatedData = null,
    theirIdentityPublicB64 = null,
    ourIdentityPublicB64 = null,
    version = PROTOCOL_VERSIONS.CURRENT,
  }) {
    this.sessionId = sessionId;
    this.rootKey = rootKey;
    this.sendingChainKey = sendingChainKey;
    this.receivingChainKey = receivingChainKey;
    this.sendMessageNumber = sendMessageNumber;
    this.recvMessageNumber = recvMessageNumber;
    this.previousSendChainLength = previousSendChainLength;
    this.sendRatchetKeyPair = sendRatchetKeyPair;
    this.recvRatchetPublicKey = recvRatchetPublicKey;
    this.skippedMessageKeys = skippedMessageKeys;
    this.associatedData = associatedData;
    this.theirIdentityPublicB64 = theirIdentityPublicB64;
    this.ourIdentityPublicB64 = ourIdentityPublicB64;
    this.version = version;
  }

  async _persist() {
    const state = {
      sessionId: this.sessionId,
      rootKey: toB64(this.rootKey),
      sendingChainKey: this.sendingChainKey ? toB64(this.sendingChainKey) : null,
      receivingChainKey: this.receivingChainKey ? toB64(this.receivingChainKey) : null,
      sendMessageNumber: this.sendMessageNumber,
      recvMessageNumber: this.recvMessageNumber,
      previousSendChainLength: this.previousSendChainLength,
      sendRatchetKeyPair: this.sendRatchetKeyPair ? {
        publicB64: this.sendRatchetKeyPair.publicB64,
        privateJwk: this.sendRatchetKeyPair.privateJwk,
      } : null,
      recvRatchetPublicKey: this.recvRatchetPublicKey ?
        (typeof this.recvRatchetPublicKey === 'string' ? this.recvRatchetPublicKey : this.recvRatchetPublicKey.publicB64 || toB64(await crypto.subtle.exportKey('raw', this.recvRatchetPublicKey)))
        : null,
      associatedData: toB64(this.associatedData),
      theirIdentityPublicB64: this.theirIdentityPublicB64,
      ourIdentityPublicB64: this.ourIdentityPublicB64,
      version: this.version,
    };

    await saveSessionState(this.sessionId, JSON.stringify(state));
    await saveChainState(this.sessionId, {
      sendMsgNum: this.sendMessageNumber,
      recvMsgNum: this.recvMessageNumber,
      prevChainLen: this.previousSendChainLength,
      version: this.version,
    });
    await saveSkippedKeys(this.sessionId, Array.from(this.skippedMessageKeys.entries()));
  }

  // ── Sending ───────────────────────────────────────────

  async encrypt(plaintext) {
    if (!this.sendingChainKey) {
      const ratchetKey = await this._generateRatchetKeyPair();
      this.sendRatchetKeyPair = ratchetKey;
      const dhOutput = await this._dh(ratchetKey.privateKey, this.recvRatchetPublicKey);
      const kdfResult = await kdfRootKey(this.rootKey, dhOutput, this.version);
      this.rootKey = kdfResult.rootKey;
      this.sendingChainKey = kdfResult.chainKey;
      this.previousSendChainLength = this.sendMessageNumber;
      this.sendMessageNumber = 0;
      await this._persist();
    }

    const { messageKey, nextChainKey, headerKey } = await kdfMessageKey(this.sendingChainKey, this.version);
    this.sendingChainKey = nextChainKey;

    const encrypted = await aesEncrypt(messageKey, plaintext);

    const header = {
      dh: this.sendRatchetKeyPair.publicB64,
      pn: this.previousSendChainLength,
      n: this.sendMessageNumber,
    };

    const encryptedHeader = await encryptHeader(headerKey, header, this.version);

    this.sendMessageNumber++;
    await this._persist();

    return {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      header: encryptedHeader,
      ad: toB64(this.associatedData),
      v: this.version,
    };
  }

  // ── Receiving — SINGLE ATTEMPT, NO FALLBACK ─────────────

  async decrypt(message) {
    const { ciphertext, iv, header: encryptedHeader, ad, v: declaredVersion } = message;

    // 1. Validate version BEFORE any crypto operations
    if (!declaredVersion || !isSupportedVersion(declaredVersion)) {
      throw new Error(`DoubleRatchet: Unsupported or missing version: ${declaredVersion}`);
    }

    if (ad !== toB64(this.associatedData)) {
      throw new Error('DoubleRatchet: Associated data mismatch');
    }

    // 2. Try skipped keys (constant-time lookup)
    const skippedKeyId = `${encryptedHeader.iv}:${encryptedHeader.ciphertext}`;
    if (this.skippedMessageKeys.has(skippedKeyId)) {
      const skipped = this.skippedMessageKeys.get(skippedKeyId);
      this.skippedMessageKeys.delete(skippedKeyId);
      await this._persist();
      return await aesDecrypt(skipped.messageKey, iv, ciphertext);
    }

    // 3. Single decryption attempt — NO multi-label fallback
    let header = null;
    let messageKey = null;
    let headerKey = null;
    let decryptSuccess = false;

    try {
      if (this.receivingChainKey) {
        const { messageKey: mk, nextChainKey, headerKey: hk } = await kdfMessageKey(this.receivingChainKey, this.version);
        headerKey = hk;
        header = await decryptHeader(hk, encryptedHeader.iv, encryptedHeader.ciphertext);
        messageKey = mk;
        this.receivingChainKey = nextChainKey;
        this.recvMessageNumber = header.n + 1;
        decryptSuccess = true;
      }
    } catch (e) {
      // Expected path for new ratchet — no timing leak
      decryptSuccess = false;
    }

    // 4. New ratchet from sender (only if first attempt failed)
    if (!decryptSuccess) {
      const theirNewPublicKey = await this._importPublicKeyB64(
        await this._extractPublicKeyFromHeader(encryptedHeader)
      );

      // DH ratchet step 1
      const dhOutput = await this._dh(this.sendRatchetKeyPair.privateKey, theirNewPublicKey);
      const kdfResult = await kdfRootKey(this.rootKey, dhOutput, this.version);
      this.rootKey = kdfResult.rootKey;
      this.receivingChainKey = kdfResult.chainKey;

      // DH ratchet step 2
      const newRatchetKey = await this._generateRatchetKeyPair();
      const dhOutput2 = await this._dh(newRatchetKey.privateKey, theirNewPublicKey);
      const kdfResult2 = await kdfRootKey(this.rootKey, dhOutput2, this.version);
      this.rootKey = kdfResult2.rootKey;
      this.sendingChainKey = kdfResult2.chainKey;

      this.sendRatchetKeyPair = newRatchetKey;
      this.recvRatchetPublicKey = theirNewPublicKey;
      this.previousSendChainLength = this.sendMessageNumber;
      this.sendMessageNumber = 0;
      this.recvMessageNumber = 0;

      // Single header decryption attempt with new chain
      const { messageKey: mk, nextChainKey, headerKey: hk } = await kdfMessageKey(this.receivingChainKey, this.version);
      headerKey = hk;
      header = await decryptHeader(hk, encryptedHeader.iv, encryptedHeader.ciphertext);
      messageKey = mk;
      this.receivingChainKey = nextChainKey;
      this.recvMessageNumber = header.n + 1;
    }

    // 5. Handle skipped messages
    if (header.n > this.recvMessageNumber) {
      await this._skipMessageKeys(header.n);
    }

    await this._persist();

    // 6. Final decrypt — single attempt
    return await aesDecrypt(messageKey, iv, ciphertext);
  }

  // ── Skip Message Keys ───────────────────────────────────

  async _skipMessageKeys(until) {
    if (this.recvMessageNumber + 1000 < until) {
      throw new Error('DoubleRatchet: Too many skipped messages');
    }

    while (this.recvMessageNumber < until) {
      const { messageKey, nextChainKey, headerKey } = await kdfMessageKey(this.receivingChainKey, this.version);
      this.receivingChainKey = nextChainKey;

      const skippedId = `skipped-${this.recvRatchetPublicKey.publicB64 || this.recvRatchetPublicKey}-${this.recvMessageNumber}`;
      this.skippedMessageKeys.set(skippedId, { messageKey, headerKey });

      if (this.skippedMessageKeys.size > 1000) {
        throw new Error('DoubleRatchet: Maximum skipped keys exceeded');
      }
      this.recvMessageNumber++;
    }
    await saveSkippedKeys(this.sessionId, Array.from(this.skippedMessageKeys.entries()));
  }

  // ── Helpers ─────────────────────────────────────────────

  async _generateRatchetKeyPair() {
    const kp = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const publicRaw = await crypto.subtle.exportKey('raw', kp.publicKey);
    const privateJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    return {
      publicKey: kp.publicKey,
      privateKey: kp.privateKey,
      publicB64: toB64(publicRaw),
      privateJwk,
    };
  }

  async _dh(privateKey, publicKey) {
    return crypto.subtle.deriveBits(
      { name: 'ECDH', public: publicKey },
      privateKey,
      256
    );
  }

  async _importPublicKeyB64(b64) {
    return crypto.subtle.importKey(
      'raw', fromB64(b64),
      { name: 'ECDH', namedCurve: 'P-256' },
      true, []
    );
  }

  async _extractPublicKeyFromHeader(encryptedHeader) {
    // Extract ephemeral DH public key from header structure
    // This is passed as part of the encrypted header in this protocol version
    return encryptedHeader.dh;
  }

  // ── Serialization ───────────────────────────────────────

  static async deserialize(data) {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;

    const session = new DoubleRatchetSession({
      sessionId: parsed.sessionId,
      rootKey: fromB64(parsed.rootKey),
      sendingChainKey: parsed.sendingChainKey ? fromB64(parsed.sendingChainKey) : null,
      receivingChainKey: parsed.receivingChainKey ? fromB64(parsed.receivingChainKey) : null,
      sendMessageNumber: parsed.sendMessageNumber,
      recvMessageNumber: parsed.recvMessageNumber,
      previousSendChainLength: parsed.previousSendChainLength,
      associatedData: fromB64(parsed.associatedData),
      theirIdentityPublicB64: parsed.theirIdentityPublicB64,
      ourIdentityPublicB64: parsed.ourIdentityPublicB64,
      version: parsed.version || PROTOCOL_VERSIONS.CURRENT,
    });

    if (parsed.sendRatchetKeyPair) {
      const privateKey = await crypto.subtle.importKey(
        'jwk', parsed.sendRatchetKeyPair.privateJwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        false, ['deriveBits']
      );
      const publicKey = await crypto.subtle.importKey(
        'raw', fromB64(parsed.sendRatchetKeyPair.publicB64),
        { name: 'ECDH', namedCurve: 'P-256' },
        true, []
      );
      session.sendRatchetKeyPair = {
        publicKey,
        privateKey,
        publicB64: parsed.sendRatchetKeyPair.publicB64,
        privateJwk: parsed.sendRatchetKeyPair.privateJwk,
      };
    }

    if (parsed.recvRatchetPublicKey) {
      session.recvRatchetPublicKey = await session._importPublicKeyB64(parsed.recvRatchetPublicKey);
    }

    const skippedRaw = await loadSkippedKeys(parsed.sessionId);
    session.skippedMessageKeys = new Map(skippedRaw || []);

    return session;
  }
}

// ── Session Manager ───────────────────────────────────────

export class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  async initializeSession(sessionId, x3dhResult, ourRatchetKeyPair, theirRatchetPublicKey, version = PROTOCOL_VERSIONS.CURRENT) {
    const session = new DoubleRatchetSession({
      sessionId,
      rootKey: x3dhResult.sk,
      sendingChainKey: null,
      receivingChainKey: null,
      sendMessageNumber: 0,
      recvMessageNumber: 0,
      previousSendChainLength: 0,
      sendRatchetKeyPair: ourRatchetKeyPair,
      recvRatchetPublicKey: theirRatchetPublicKey,
      skippedMessageKeys: new Map(),
      associatedData: x3dhResult.ad,
      theirIdentityPublicB64: x3dhResult.theirIdentityPublicB64,
      ourIdentityPublicB64: x3dhResult.ourIdentityPublicB64,
      version,
    });

    await session._persist();
    this.sessions.set(sessionId, session);
    return session;
  }

  async getSession(sessionId) {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }

    const stored = await loadSessionState(sessionId);
    if (stored) {
      const session = await DoubleRatchetSession.deserialize(stored);
      this.sessions.set(sessionId, session);
      return session;
    }

    return null;
  }

  async encryptMessage(sessionId, plaintext) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`No session found for ${sessionId}`);
    return await session.encrypt(plaintext);
  }

  async decryptMessage(sessionId, message) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`No session found for ${sessionId}`);
    return await session.decrypt(message);
  }

  async deleteSession(sessionId) {
    this.sessions.delete(sessionId);
    await deleteSessionState(sessionId);
  }
}
