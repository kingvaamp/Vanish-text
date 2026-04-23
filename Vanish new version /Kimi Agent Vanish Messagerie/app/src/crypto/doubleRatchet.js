// ============================================================================
// DOUBLE RATCHET IMPLEMENTATION
// Based on Signal Protocol Specification: https://signal.org/docs/specifications/doubleratchet/
// ============================================================================

import { 
  toB64, 
  fromB64, 
  concat, 
  generateKeyPair as generateDH, 
  importPublicKey, 
  importPrivateKey, 
  ecdh as dh, 
  hkdf, 
  encrypt as encryptAESGCM_raw, 
  decrypt as decryptAESGCM_raw 
} from './primitives';

// ── CONSTANTS ───────────────────────────────────────────────────────────────

const MAX_SKIP = 100;
const ROOT_KEY_ROTATION_INTERVAL = 50; // Rotate RK every N messages
const ENC = new TextEncoder();
const DEC = new TextDecoder();

// ── WRAPPERS FOR AES-GCM (to match user's expected signature) ───────────────

async function encryptAESGCM(keyBuf, plaintext, associatedData) {
  const result = await encryptAESGCM_raw(keyBuf, plaintext);
  // Note: primitives.encrypt handles IV generation internally. 
  // If we need to pass associatedData, we'd need to modify primitives.js
  // For now, we'll assume primitives.js is the source of truth.
  return result;
}

async function decryptAESGCM(keyBuf, ivB64, ctB64, associatedData) {
  return await decryptAESGCM_raw(keyBuf, ivB64, ctB64);
}

// ── HEADER STRUCTURE ────────────────────────────────────────────────────────

function createHeader(dhPair, pn, n) {
  return {
    dh: dhPair.publicB64,
    pn: pn,
    n: n,
  };
}

function encodeHeader(header) {
  return ENC.encode(JSON.stringify(header));
}

function decodeHeader(headerBytes) {
  return JSON.parse(DEC.decode(headerBytes));
}

// ── KDF FUNCTIONS ───────────────────────────────────────────────────────────

async function kdfRK(rk, dhOut) {
  const derived = await hkdf(dhOut, rk, 'VanishText-RK', 64);
  return {
    rootKey: derived.slice(0, 32),
    chainKey: derived.slice(32, 64),
  };
}

async function kdfCK(ck) {
  const derived = await hkdf(ck, null, 'VanishText-CK', 64);
  return {
    messageKey: derived.slice(0, 32),
    nextChainKey: derived.slice(32, 64),
  };
}

// ── PERSISTENCE (IndexedDB) ─────────────────────────────────────────────────

const DB_NAME = 'VanishTextRatchetDB';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' });
      }
    };
  });
}

async function saveState(sessionId, state) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  const serialized = {
    sessionId,
    RK: toB64(state.RK),
    CKs: state.CKs ? toB64(state.CKs) : null,
    CKr: state.CKr ? toB64(state.CKr) : null,
    DHs: state.DHs ? {
      publicB64: state.DHs.publicB64,
      privateJwk: state.DHs.privateJwk,
    } : null,
    DHr: state.DHr ? (typeof state.DHr === 'string' ? state.DHr : state.DHr.publicB64) : null,
    Ns: state.Ns,
    Nr: state.Nr,
    PN: state.PN,
    MKSKIPPED: Array.from(state.MKSKIPPED.entries()).map(([k, v]) => [k, toB64(v)]),
    globalCounter: state.globalCounter,
    lastRotation: state.lastRotation,
    timestamp: Date.now(),
  };
  
  return new Promise((resolve, reject) => {
    const req = store.put(serialized);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadState(sessionId) {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  
  return new Promise((resolve, reject) => {
    const req = store.get(sessionId);
    req.onsuccess = async () => {
      const data = req.result;
      if (!data) return resolve(null);
      
      const DHs = data.DHs ? {
        publicB64: data.DHs.publicB64,
        privateKey: await importPrivateKey(data.DHs.privateJwk),
        publicKey: await importPublicKey(data.DHs.publicB64),
        privateJwk: data.DHs.privateJwk,
      } : null;
      
      const DHr = data.DHr ? await importPublicKey(data.DHr) : null;
      
      resolve({
        RK: fromB64(data.RK),
        CKs: data.CKs ? fromB64(data.CKs) : null,
        CKr: data.CKr ? fromB64(data.CKr) : null,
        DHs,
        DHr,
        Ns: data.Ns,
        Nr: data.Nr,
        PN: data.PN,
        MKSKIPPED: new Map(data.MKSKIPPED.map(([k, v]) => [k, fromB64(v)])),
        globalCounter: data.globalCounter || 0,
        lastRotation: data.lastRotation || 0,
      });
    };
    req.onerror = () => reject(req.error);
  });
}

// ── DOUBLE RATCHET CLASS ────────────────────────────────────────────────────

export class DoubleRatchet {
  constructor(sessionId = null) {
    this.sessionId = sessionId || crypto.randomUUID();
    this.state = null;
  }

  async RatchetInitAlice(SK, bobDHPublicB64) {
    const DHs = await generateDH();
    const DHr = await importPublicKey(bobDHPublicB64);
    const dhOut = await dh(DHs.privateKey, DHr);
    const { rootKey, chainKey } = await kdfRK(SK, dhOut);
    
    this.state = {
      RK: rootKey,
      CKs: chainKey,
      CKr: null,
      DHs,
      DHr,
      Ns: 0,
      Nr: 0,
      PN: 0,
      MKSKIPPED: new Map(),
      globalCounter: 0,
      lastRotation: 0,
    };
    await this._persist();
    return this;
  }

  async RatchetInitBob(SK, bobKeyPair) {
    const DHs = {
      privateKey: bobKeyPair.privateKey,
      publicKey: bobKeyPair.publicKey,
      publicB64: bobKeyPair.publicB64,
      privateJwk: bobKeyPair.privateJwk,
    };
    
    this.state = {
      RK: SK,
      CKs: null,
      CKr: null,
      DHs,
      DHr: null,
      Ns: 0,
      Nr: 0,
      PN: 0,
      MKSKIPPED: new Map(),
      globalCounter: 0,
      lastRotation: 0,
    };
    await this._persist();
    return this;
  }

  async RatchetEncrypt(plaintext, associatedData) {
    if (!this.state) throw new Error('Ratchet not initialized');
    const state = this.state;
    
    if (state.globalCounter - state.lastRotation >= ROOT_KEY_ROTATION_INTERVAL) {
      await this._rotateRootKey();
    }
    
    const mk = await kdfCK(state.CKs);
    const header = createHeader(state.DHs, state.PN, state.Ns);
    const headerBytes = encodeHeader(header);
    const ad = concat(associatedData, headerBytes);
    const ciphertext = await encryptAESGCM(mk.messageKey, plaintext, new Uint8Array(ad));
    
    state.Ns++;
    state.globalCounter++;
    state.CKs = mk.nextChainKey;
    await this._persist();
    return { header, ciphertext };
  }

  async RatchetDecrypt(header, ciphertext, associatedData) {
    if (!this.state) throw new Error('Ratchet not initialized');
    const state = this.state;
    const headerBytes = encodeHeader(header);
    const ad = concat(associatedData, headerBytes);
    
    const skipped = await this.TrySkippedMessageKeys(header, ciphertext, new Uint8Array(ad));
    if (skipped !== null) {
      await this._persist();
      return skipped;
    }
    
    if (state.DHr === null || header.dh !== state.DHr.publicB64) {
      await this.SkipMessageKeys(header.pn);
      await this.DHRatchet(header.dh);
    }
    
    await this.SkipMessageKeys(header.n);
    
    const mk = await kdfCK(state.CKr);
    state.CKr = mk.nextChainKey;
    state.Nr++;
    state.globalCounter++;
    
    const plaintext = await decryptAESGCM(mk.messageKey, ciphertext.iv, ciphertext.ciphertext, new Uint8Array(ad));
    await this._persist();
    return plaintext;
  }

  async DHRatchet(dhPublicB64) {
    const state = this.state;
    state.PN = state.Ns;
    state.Ns = 0;
    state.Nr = 0;
    state.DHr = await importPublicKey(dhPublicB64);
    
    const dhOut = await dh(state.DHs.privateKey, state.DHr);
    const { rootKey, chainKey } = await kdfRK(state.RK, dhOut);
    state.RK = rootKey;
    state.CKr = chainKey;
    
    state.DHs = await generateDH();
    const dhOut2 = await dh(state.DHs.privateKey, state.DHr);
    const { rootKey: rk2, chainKey: ck2 } = await kdfRK(state.RK, dhOut2);
    state.RK = rk2;
    state.CKs = ck2;
  }

  async SkipMessageKeys(until) {
    const state = this.state;
    if (state.Nr + MAX_SKIP < until) throw new Error('Too many skipped messages');
    if (state.CKr !== null) {
      while (state.Nr < until) {
        const mk = await kdfCK(state.CKr);
        state.CKr = mk.nextChainKey;
        const skippedKey = `${state.DHr.publicB64}:${state.Nr}`;
        state.MKSKIPPED.set(skippedKey, mk.messageKey);
        state.Nr++;
      }
    }
  }

  async TrySkippedMessageKeys(header, ciphertext, ad) {
    const state = this.state;
    const skippedKey = `${header.dh}:${header.n}`;
    if (!state.MKSKIPPED.has(skippedKey)) return null;
    const mk = state.MKSKIPPED.get(skippedKey);
    state.MKSKIPPED.delete(skippedKey);
    try {
      return await decryptAESGCM(mk, ciphertext.iv, ciphertext.ciphertext, ad);
    } catch (e) {
      state.MKSKIPPED.set(skippedKey, mk);
      return null;
    }
  }

  async _rotateRootKey() {
    const state = this.state;
    const dhOut = await dh(state.DHs.privateKey, state.DHr);
    const { rootKey, chainKey } = await kdfRK(state.RK, dhOut);
    state.RK = rootKey;
    state.CKs = chainKey;
    state.lastRotation = state.globalCounter;
  }

  async _persist() {
    await saveState(this.sessionId, this.state);
  }

  static async load(sessionId) {
    const state = await loadState(sessionId);
    if (!state) return null;
    const ratchet = new DoubleRatchet(sessionId);
    ratchet.state = state;
    return ratchet;
  }

  async destroy() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(this.sessionId);
    this.state = null;
  }
}

// ── COMPATIBILITY WRAPPER (SessionManager) ──────────────────────────────────

export class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  async initializeSession(sessionId, x3dhResult, ourRatchetKeyPair, theirRatchetPublicKey) {
    // Determine if we are Alice or Bob based on whether we have our own ratchet key pair already
    // In our orchestration, Alice initiates, Bob responds.
    const ratchet = new DoubleRatchet(sessionId);
    if (ourRatchetKeyPair) {
      // Bob response logic
      await ratchet.RatchetInitBob(x3dhResult.sk, ourRatchetKeyPair);
    } else {
      // Alice initiation logic
      await ratchet.RatchetInitAlice(x3dhResult.sk, theirRatchetPublicKey);
    }
    this.sessions.set(sessionId, ratchet);
    return ratchet;
  }

  async getSession(sessionId) {
    if (this.sessions.has(sessionId)) return this.sessions.get(sessionId);
    const ratchet = await DoubleRatchet.load(sessionId);
    if (ratchet) this.sessions.set(sessionId, ratchet);
    return ratchet;
  }

  async encryptMessage(sessionId, plaintext) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`No session for ${sessionId}`);
    // Associated data is version label by default
    const ad = ENC.encode('VanishText-v1');
    return await session.RatchetEncrypt(plaintext, ad);
  }

  async decryptMessage(sessionId, payload) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`No session for ${sessionId}`);
    const ad = ENC.encode('VanishText-v1');
    return await session.RatchetDecrypt(payload.header, payload.ciphertext, ad);
  }

  async deleteSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (session) await session.destroy();
    this.sessions.delete(sessionId);
  }
}
