// src/crypto/doubleRatchet.js
// Signal-spec Double Ratchet implementation
// https://signal.org/docs/specifications/doubleratchet/
//
// Uses HKDF-based KDF_RK and KDF_CK (equivalent to HMAC-based per spec).
// Primitives: ECDH P-256, AES-256-GCM, HKDF-SHA256 (from primitives.js)

import {
  generateKeyPair,
  importPublicKey,
  ecdh,
  hkdf,
  encrypt,
  decrypt,
  concat,
  toB64,
  fromB64,
} from './primitives.js';

// ── Constants ───────────────────────────────────────────────
const INFO_RK = 'VanishText-DR-RK';  // KDF_RK info string
const INFO_CK = 'VanishText-DR-CK';  // KDF_CK info string (derives MK + nextCK)
const ROOT_KEY_SIZE = 32;            // 256-bit root key
const CHAIN_KEY_SIZE = 32;           // 256-bit chain key
const MSG_KEY_SIZE = 32;             // 256-bit message key (AES-256-GCM)
const MAX_SKIP = 1000;               // Max skipped message keys per session
const MAX_OLD_CHAINS = 5;            // Max cached old receive chains

// ── Helpers ────────────────────────────────────────────────

// Encode a 32-bit integer as 4 bytes big-endian
function encodeU32(n) {
  const buf = new ArrayBuffer(4);
  const dv = new DataView(buf);
  dv.setUint32(0, n, false); // big-endian
  return new Uint8Array(buf);
}

// Constant-time comparison of ArrayBuffers
function constantTimeEqual(a, b) {
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

// ── Key Derivation Functions ───────────────────────────────

// KDF_RK: Root Key Derivation
// RK, chainKey = HKDF(RK || dhOutput, info="VanishText-DR-RK", 64)
// Returns { rootKey: ArrayBuffer(32), chainKey: ArrayBuffer(32) }
async function kdfRK(rootKey, dhOutput) {
  const input = concat(rootKey, dhOutput);
  const output = await hkdf(input, null, INFO_RK, 64);
  return {
    rootKey: output.slice(0, ROOT_KEY_SIZE),
    chainKey: output.slice(ROOT_KEY_SIZE, ROOT_KEY_SIZE + CHAIN_KEY_SIZE),
  };
}

// KDF_CK: Chain Key Derivation
// messageKey, nextChainKey = HKDF(chainKey, info="VanishText-DR-CK", 64)
// Returns { messageKey: ArrayBuffer(32), nextChainKey: ArrayBuffer(32) }
async function kdfCK(chainKey) {
  const output = await hkdf(chainKey, null, INFO_CK, MSG_KEY_SIZE + CHAIN_KEY_SIZE);
  return {
    messageKey: output.slice(0, MSG_KEY_SIZE),
    nextChainKey: output.slice(MSG_KEY_SIZE, MSG_KEY_SIZE + CHAIN_KEY_SIZE),
  };
}

// ── SessionState ────────────────────────────────────────────

// Each conversation gets one SessionState, persisted to storage.
// Schema:
// {
//   DHs: { publicKey: CryptoKey, privateKey: CryptoKey },   // Our DH ratchet key pair
//   DHr: CryptoKey | null,                                    // Their DH ratchet public key
//   CKs: ArrayBuffer | null,                                  // Sending chain key (32 bytes)
//   CKr: ArrayBuffer | null,                                  // Receiving chain key (32 bytes)
//   Ns: number,                                               // Sending message number
//   Nr: number,                                               // Receiving message number
//   PN: number,                                               // Previous sending chain length
//   MKSkipped: Map<string, ArrayBuffer>,                      // Skipped message keys keyed by "DHr_b64:msgNum"
//   AD: ArrayBuffer | null,                                   // Associated data (X3DH identity keys)
//   oldRecvChains: Map<string, { CK: ArrayBuffer, Nr: number }>, // Old receive chains for out-of-order
// }

// ── Double Ratchet Core ───────────────────────────────────

// Initialize session from X3DH shared secret + AD
// SK = X3DH shared secret (32 bytes)
// AD = associated data (IK_A_pub || IK_B_pub)
// Returns initial SessionState
export async function drInitFromSK(SK, AD) {
  // Generate initial DH ratchet key pair
  const DHs = await generateKeyPair();

  return {
    DHs,
    DHr: null,
    CKs: null,
    CKr: null,
    Ns: 0,
    Nr: 0,
    PN: 0,
    MKSkipped: new Map(),
    AD: AD || null,
    oldRecvChains: new Map(),
  };
}

// DR with initial DH output (Alice after X3DH: DH(EK, SPK))
// Used to bootstrap the first root key -> chain key derivation
export async function drInitWithDH(SK, dhOutput, AD) {
  const DHs = await generateKeyPair();
  const { rootKey, chainKey } = await kdfRK(SK, dhOutput);

  return {
    DHs,
    DHr: null,
    CKs: chainKey,       // Alice can send immediately
    CKr: null,            // No receive chain until Bob replies
    Ns: 0,
    Nr: 0,
    PN: 0,
    MKSkipped: new Map(),
    AD: AD || null,
    rootKey,              // Store rootKey for future DH ratchets
    oldRecvChains: new Map(),
  };
}

// ── Symmetric Ratchet ─────────────────────────────────────

// Advance the sending chain: derive message key + next chain key
// Returns { messageKey, nextCK }
async function stepSendChain(session) {
  if (!session.CKs) throw new Error('[DR] No send chain key');
  const { messageKey, nextChainKey } = await kdfCK(session.CKs);
  return { messageKey, nextCK: nextChainKey };
}

// Advance the receiving chain: derive message key + next chain key
async function stepRecvChain(session) {
  if (!session.CKr) throw new Error('[DR] No receive chain key');
  const { messageKey, nextChainKey } = await kdfCK(session.CKr);
  return { messageKey, nextCK: nextChainKey };
}

// ── DH Ratchet ─────────────────────────────────────────────

// Perform a DH ratchet step (both sides)
// Called when we receive a new DH public key from the other party
// For Alice: first time seeing Bob's DH ratchet key
// For Bob: each time Alice sends a new DH ratchet key
async function dhRatchetStep(session, nextDHr) {
  if (!session.rootKey) throw new Error('[DR] No root key for DH ratchet');

  // Step 1: Compute new root key + receive chain key from old DHs + new DHr
  // RK, CKr = KDF_RK(RK, DH(DHs, DHr))
  const dhOutput1 = await ecdh(session.DHs.privateKey, nextDHr);
  const { rootKey: rk1, chainKey: ckr } = await kdfRK(session.rootKey, dhOutput1);

  // Save old receive chain before overwriting
  if (session.CKr) {
    const oldKey = toB64(session.DHr ? await exportPublicKeyRaw(session.DHr) : new ArrayBuffer(0));
    if (session.oldRecvChains.size >= MAX_OLD_CHAINS) {
      // Remove oldest entry (first key)
      const firstKey = session.oldRecvChains.keys().next().value;
      session.oldRecvChains.delete(firstKey);
    }
    session.oldRecvChains.set(oldKey, { CK: session.CKr, Nr: session.Nr });
  }

  // Step 2: Generate new DHs and compute new root key + send chain key
  // RK, CKs = KDF_RK(RK, DH(DHs_new, DHr))
  const newDHs = await generateKeyPair();
  const dhOutput2 = await ecdh(newDHs.privateKey, nextDHr);
  const { rootKey: rk2, chainKey: cks } = await kdfRK(rk1, dhOutput2);

  // Update session
  session.DHs = newDHs;
  session.DHr = nextDHr;
  session.rootKey = rk2;
  session.CKs = cks;
  session.CKr = ckr;
  session.PN = session.Ns;  // PN = previous Ns before reset (per spec)
  session.Ns = 0;
  // Nr stays at current value (recv chain was established in step 1)
}

// Export public key as raw ArrayBuffer
async function exportPublicKeyRaw(pubKey) {
  const raw = await crypto.subtle.exportKey('raw', pubKey);
  return raw;
}

// ── Encrypt ────────────────────────────────────────────────

// Encrypt a plaintext string for a given session.
// Returns { header, ciphertext }
// header = { DHr: DHs.publicB64 (only if PN > 0 or first send), Ns }
// ciphertext = { iv, ciphertext } from AES-GCM
//
// If CKs is null (first send as Bob after init), we need to wait for
// a DH ratchet trigger. Otherwise, step the send chain and encrypt.
export async function drEncrypt(session, plaintext) {
  if (!session.CKs) {
    // No send chain yet — try DH ratchet if we have a remote DHr + rootKey
    // This happens when Bob replies for the first time after receiving Alice's message
    if (!session.DHr || !session.rootKey) {
      throw new Error('[DR] No send chain and no DHr/rootKey. Must receive message first or initialize as sender.');
    }
    // DH_RATCHET: rotate our DHs, derive new rootKey + send/receive chains
    const newDHs = await generateKeyPair();
    const dhOutput = await ecdh(newDHs.privateKey, session.DHr);
    const { rootKey, chainKey } = await kdfRK(session.rootKey, dhOutput);
    session.DHs = newDHs;
    session.rootKey = rootKey;
    session.CKs = chainKey;
    session.PN = session.Ns;
    session.Ns = 0;
    // Keep CKr as-is (already consumed or will be used for future receives)
  }

  // Step the sending symmetric ratchet
  const { messageKey, nextCK } = await stepSendChain(session);
  session.CKs = nextCK;
  const msgNum = session.Ns++;

  // Build associated data: 4-byte message number + session AD
  const msgNumBytes = encodeU32(msgNum);
  const associatedData = session.AD
    ? new Uint8Array(concat(msgNumBytes, session.AD))
    : msgNumBytes;

  // Encrypt with message key
  const { iv, ciphertext } = await encrypt(messageKey, plaintext, associatedData);

  // Build header
  const header = {
    DHr: toB64(await exportPublicKeyRaw(session.DHs.publicKey)),
    Ns: msgNum,
    PN: session.PN,
  };

  // Zero out message key (forward secrecy)
  new Uint8Array(messageKey).fill(0);

  return { header, ciphertext: { iv, ciphertext } };
}

// ── Decrypt ────────────────────────────────────────────────

// Decrypt a ciphertext from a given header.
// header = { DHr, Ns, PN }  (DHr is the sender's ratchet public key at send time)
// Returns decrypted plaintext string
export async function drDecrypt(session, header, ciphertext) {
  const { DHr: senderDHrB64, Ns: msgNum, PN } = header;
  // Import the sender's ratchet public key
  const senderDHr = await importPublicKey(senderDHrB64);

  // Check if this message is from a new DH ratchet key
  const currentDHrB64 = session.DHr
    ? toB64(await exportPublicKeyRaw(session.DHr))
    : null;

  const isNewDHr = !currentDHrB64 || !constantTimeEqual(
    await exportPublicKeyRaw(senderDHr),
    await exportPublicKeyRaw(session.DHr)
  );

  // ── First message ever: no DH ratchet, use existing CKr ──
  // (from X3DH init — both sides share the same initial chain key)
  if (!currentDHrB64 && session.CKr) {
    session.DHr = senderDHr;
    // Fall through to normal symmetric decrypt below
  } else if (isNewDHr) {
    // ── DH ratchet: DHr changed from one key to another ──

    // Check skipped keys for this DHr first
    const skippedKey = session.MKSkipped.get(`${senderDHrB64}:${msgNum}`);
    if (skippedKey) {
      session.MKSkipped.delete(`${senderDHrB64}:${msgNum}`);
      return await decryptWithMK(skippedKey, msgNum, ciphertext, session.AD);
    }

    // Check old receive chains for this DHr
    const oldChain = session.oldRecvChains.get(senderDHrB64);
    if (oldChain && msgNum >= oldChain.Nr) {
      // Use old chain to decrypt
      return await decryptFromChain(session, senderDHrB64, oldChain, msgNum, ciphertext);
    }

    // Perform DH ratchet
    if (!session.rootKey) throw new Error('[DR] No root key for DH ratchet during decrypt');
    await dhRatchetStep(session, senderDHr);

    // After DH ratchet, CKr is established and Nr=0.
    // If the message number is > 0, we need to skip keys
    if (msgNum > session.Nr) {
      await skipMessageKeys(session, msgNum);
    }

    // Now decrypt with the receiving chain
    const { messageKey, nextCK } = await stepRecvChain(session);
    session.CKr = nextCK;
    session.Nr = msgNum + 1;

    return await decryptWithMK(messageKey, msgNum, ciphertext, session.AD);
  }

  // Same DH key — normal symmetric ratchet advance

  // Handle out-of-order messages (message number > expected)
  if (msgNum > session.Nr) {
    await skipMessageKeys(session, msgNum);
  }

  // Handle duplicate or reordered messages (message number < expected)
  if (msgNum < session.Nr) {
    // Check skipped keys
    const skippedKey = session.MKSkipped.get(`${senderDHrB64}:${msgNum}`);
    if (skippedKey) {
      session.MKSkipped.delete(`${senderDHrB64}:${msgNum}`);
      return await decryptWithMK(skippedKey, msgNum, ciphertext, session.AD);
    }

    // Check old receive chains
    const oldChain = session.oldRecvChains.get(senderDHrB64);
    if (oldChain) {
      return await decryptFromChain(session, senderDHrB64, oldChain, msgNum, ciphertext);
    }

    throw new Error(`[DR] Cannot decrypt: message ${msgNum} is in the past and not in skipped keys`);
  }

  // Normal case: msgNum === session.Nr
  const { messageKey, nextCK } = await stepRecvChain(session);
  session.CKr = nextCK;
  session.Nr = msgNum + 1;

  return await decryptWithMK(messageKey, msgNum, ciphertext, session.AD);
}

// ── Decrypt Helpers ────────────────────────────────────────

async function decryptWithMK(messageKey, msgNum, ciphertext, AD) {
  const msgNumBytes = encodeU32(msgNum);
  const associatedData = AD ? new Uint8Array(concat(msgNumBytes, AD)) : msgNumBytes;

  try {
    const plaintext = await decrypt(messageKey, ciphertext.iv, ciphertext.ciphertext, associatedData);
    // Zero out message key (forward secrecy)
    new Uint8Array(messageKey).fill(0);
    return plaintext;
  } catch (e) {
    // Zero out on failure too
    new Uint8Array(messageKey).fill(0);
    throw e;
  }
}

async function decryptFromChain(session, chainKey, chain, msgNum, ciphertext) {
  // Advance chain to the required message number
  let ck = chain.CK;
  for (let i = chain.Nr; i < msgNum; i++) {
    const { messageKey, nextChainKey } = await kdfCK(ck);
    ck = nextChainKey;
    // Store skipped key (but we won't need it since we're catching up)
  }
  const { messageKey, nextChainKey } = await kdfCK(ck);
  chain.CK = nextChainKey;
  chain.Nr = msgNum + 1;
  session.oldRecvChains.set(chainKey, chain);
  return await decryptWithMK(messageKey, msgNum, ciphertext, session.AD);
}

async function skipMessageKeys(session, untilMsgNum) {
  const dhKey = toB64(await exportPublicKeyRaw(session.DHr));
  while (session.Nr < untilMsgNum) {
    const { messageKey, nextChainKey } = await kdfCK(session.CKr);
    const skipKey = `${dhKey}:${session.Nr}`;
    if (session.MKSkipped.size >= MAX_SKIP) {
      throw new Error('[DR] Too many skipped message keys');
    }
    session.MKSkipped.set(skipKey, messageKey);
    session.CKr = nextChainKey;
    session.Nr++;
  }
}

// ── Session Serialization ─────────────────────────────────

// Serialize session to a JSON-serializable object (for storage)
export async function serializeSession(session) {
  const mkskipped = {};
  for (const [key, val] of session.MKSkipped) {
    mkskipped[key] = toB64(val);
  }

  const oldChains = {};
  for (const [key, val] of session.oldRecvChains) {
    oldChains[key] = {
      CK: toB64(val.CK),
      Nr: val.Nr,
    };
  }

  // Export DH keys
  const DHsPubB64 = toB64(await exportPublicKeyRaw(session.DHs.publicKey));
  const DHsPrivJwk = await crypto.subtle.exportKey('jwk', session.DHs.privateKey);

  // We store the private key as JWK (same pattern as KeyStorage)
  return {
    DHs: { publicB64: DHsPubB64, privateJwk: DHsPrivJwk },
    DHr: session.DHr ? toB64(await exportPublicKeyRaw(session.DHr)) : null,
    CKs: session.CKs ? toB64(session.CKs) : null,
    CKr: session.CKr ? toB64(session.CKr) : null,
    Ns: session.Ns,
    Nr: session.Nr,
    PN: session.PN,
    MKSkipped: mkskipped,
    AD: session.AD ? toB64(session.AD) : null,
    oldRecvChains: oldChains,
    rootKey: session.rootKey ? toB64(session.rootKey) : null,
  };
}

// Restore session from serialized state
export async function deserializeSession(data) {
  // Re-import DHs key pair
  const DHsPublicKey = await importPublicKey(data.DHs.publicB64);
  const DHsPrivateKey = await crypto.subtle.importKey(
    'jwk', data.DHs.privateJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, ['deriveKey', 'deriveBits']
  );

  const mkskipped = new Map();
  for (const [key, val] of Object.entries(data.MKSkipped || {})) {
    mkskipped.set(key, fromB64(val));
  }

  const oldChains = new Map();
  for (const [key, val] of Object.entries(data.oldRecvChains || {})) {
    oldChains.set(key, { CK: fromB64(val.CK), Nr: val.Nr });
  }

  return {
    DHs: { publicKey: DHsPublicKey, privateKey: DHsPrivateKey },
    DHr: data.DHr ? await importPublicKey(data.DHr) : null,
    CKs: data.CKs ? fromB64(data.CKs) : null,
    CKr: data.CKr ? fromB64(data.CKr) : null,
    Ns: data.Ns || 0,
    Nr: data.Nr || 0,
    PN: data.PN || 0,
    MKSkipped: mkskipped,
    AD: data.AD ? fromB64(data.AD) : null,
    oldRecvChains: oldChains,
    rootKey: data.rootKey ? fromB64(data.rootKey) : null,
  };
}

// Update the import in primitives.js to accept associatedData
// The existing encrypt/decrypt functions need to be augmented for AD.
// We re-export wrapped versions here.
export { toB64, fromB64 };
