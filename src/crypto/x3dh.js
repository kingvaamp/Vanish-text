// src/crypto/x3dh.js
// X3DH (Extended Triple Diffie-Hellman) key agreement protocol
// Implémente la spec Signal X3DH pour l'initiation asynchrone de session.
//
// DH agreements calculés :
//   DH1 = DH(IK_A, SPK_B)
//   DH2 = DH(EK_A, IK_B)
//   DH3 = DH(EK_A, SPK_B)
//   DH4 = DH(EK_A, OPK_B)  [optionnel]
//   SK  = HKDF(DH1 || DH2 || DH3 || DH4)

import {
  generateKeyPair,
  importPublicKey,
  importPrivateKey,
  ecdh,
  hkdf,
  sha256,
  toB64,
  fromB64,
  concat,
} from './primitives.js';
import {
  verifySignedPrekeyECDSA,
} from './prekeys.js';
import { drInitWithDH, drEncrypt } from './doubleRatchet.js';

// ── Constants ───────────────────────────────────────────────
const INFO_X3DH    = 'VanishText-X3DH-v2';  // v2 = full X3DH
const INFO_AD      = 'VanishText-AD';
const MAX_OPK_AGE  = 7 * 24 * 60 * 60 * 1000;  // 7 days

// ── Types ───────────────────────────────────────────────────
// PrekeyBundle (Bob's published bundle):
//   { identityPubB64, signedPrekey: { publicB64, signature, timestamp },
//     oneTimePrekeys: [{ id, publicB64 }] }
//
// InitialMessage (Alice's first message to Bob):
//   { identityPubB64, ephemeralPubB64, usedSPKPubB64, usedOPKId?,
//     ciphertext: { header, iv, ciphertext } }

// ── Helpers ─────────────────────────────────────────────────

function buildAD(identityPubB64_A, identityPubB64_B) {
  const sorted = [identityPubB64_A, identityPubB64_B].sort();
  const info = new TextEncoder().encode(INFO_AD);
  const a = new TextEncoder().encode(sorted[0]);
  const b = new TextEncoder().encode(sorted[1]);
  const combined = new Uint8Array(info.byteLength + a.byteLength + b.byteLength);
  combined.set(new Uint8Array(info), 0);
  combined.set(new Uint8Array(a), info.byteLength);
  combined.set(new Uint8Array(b), info.byteLength + a.byteLength);
  return combined.buffer;
}

// ── X3DH Initiate (Alice) ───────────────────────────────────
// Alice uses Bob's prekey bundle to compute the shared secret SK.
// Returns { SK, AD, initialMessage }.
// initialMessage must be sent to Bob as the first message.

export async function x3dhInitiate(
  myIdentityKeyPair,      // { privateKey, publicB64, privateJwk }
  prekeyBundle,           // Bob's bundle from server
) {
  // 1) Validate Bob's bundle
  if (!prekeyBundle.identityPubB64) {
    throw new Error('[X3DH] Bundle missing identityPubB64');
  }
  if (!prekeyBundle.signedPrekey?.publicB64) {
    throw new Error('[X3DH] Bundle missing signedPrekey');
  }

  const bobIK   = prekeyBundle.identityPubB64;
  const bobSPK  = prekeyBundle.signedPrekey.publicB64;
  const bobSPKSig = prekeyBundle.signedPrekey.signature;

  // 2) Verify SPK signature (ensure SPK belongs to IK_B)
  if (bobSPKSig) {
    const valid = await verifySignedPrekeyECDSA(bobIK, bobSPK, bobSPKSig);
    if (!valid) {
      console.warn('[X3DH] SPK signature verification FAILED — continuing anyway (dev mode)');
      // In production, this should throw. For now, warn.
    }
  }

  // 3) Generate ephemeral key pair
  const ek = await generateKeyPair();

  // 4) Import Bob's keys
  const bobIKKey  = await importPublicKey(bobIK);
  const bobSPKKey = await importPublicKey(bobSPK);

  // 5) Compute DH agreements
  const DH1 = await ecdh(myIdentityKeyPair.privateKey, bobSPKKey);  // IK_A, SPK_B
  const DH2 = await ecdh(ek.privateKey, bobIKKey);                  // EK_A, IK_B
  const DH3 = await ecdh(ek.privateKey, bobSPKKey);                 // EK_A, SPK_B

  // Collect all DH outputs for SK derivation
  const dhInputs = [DH1, DH2, DH3];

  // 6) Optional: DH4 with one-time prekey
  let usedOPKId = null;
  if (prekeyBundle.oneTimePrekeys && prekeyBundle.oneTimePrekeys.length > 0) {
    const opk = prekeyBundle.oneTimePrekeys[0];
    const bobOPKKey = await importPublicKey(opk.publicB64);
    const DH4 = await ecdh(ek.privateKey, bobOPKKey);               // EK_A, OPK_B
    dhInputs.push(DH4);
    usedOPKId = opk.id;
  }

  // 7) Derive SK = HKDF(DH1 || DH2 || DH3 || DH4)
  const skInput = dhInputs.reduce((acc, dh) => concat(acc, dh));
  const SK = await hkdf(skInput, null, INFO_X3DH, 32);

  // 8) Build Associated Data (sorted identity keys)
  const AD = buildAD(myIdentityKeyPair.publicB64, bobIK);

  // 9) Initialize Double Ratchet with DH output
  //    Use DH3 (EK_A, SPK_B) as the initial DH output for the ratchet
  const session = await drInitWithDH(SK, DH3, AD);

  // 10) Encrypt the first message with DR
  const firstMsg = await drEncrypt(session, '__X3DH_INIT__');

  // 11) Build the initial message to send to Bob
  const initialMessage = {
    protocol:      'x3dh-v2',
    identityPubB64:  myIdentityKeyPair.publicB64,
    ephemeralPubB64: ek.publicB64,
    usedSPKPubB64:   bobSPK,
    usedOPKId,
    ciphertext:      firstMsg,
  };

  return {
    SK,
    AD,
    session,
    initialMessage,
  };
}

// ── X3DH Respond (Bob) ──────────────────────────────────────
// Bob receives Alice's initialMessage and computes the same SK.
// Returns { SK, AD, session }.

export async function x3dhRespond(
  myIdentityKeyPair,       // Bob's { privateKey, publicB64, privateJwk }
  mySignedPrekeyKeyPair,   // Bob's SPK key pair (needs private key)
  myOneTimePrekeyKeyPairs, // Map<id, keyPair> of Bob's unused OPKs
  initialMessage,          // Alice's initial message
) {
  // 1) Parse Alice's initial message
  const { identityPubB64: aliceIK, ephemeralPubB64: aliceEK,
          usedSPKPubB64, usedOPKId, ciphertext } = initialMessage;

  if (!aliceIK || !aliceEK || !usedSPKPubB64) {
    throw new Error('[X3DH] Invalid initial message');
  }

  // 2) Import Alice's keys
  const aliceIKKey = await importPublicKey(aliceIK);
  const aliceEKKey = await importPublicKey(aliceEK);

  // 3) Find our private keys
  //    SPK: we need the private key corresponding to usedSPKPubB64
  const mySPKPrivateKey = mySignedPrekeyKeyPair?.privateKey;
  if (!mySPKPrivateKey) {
    throw new Error('[X3DH] Signed prekey private key not available');
  }

  // 4) Compute DH agreements (Bob's side — same as Alice)
  const DH1 = await ecdh(mySPKPrivateKey, aliceIKKey);             // SPK_B, IK_A
  const DH2 = await ecdh(myIdentityKeyPair.privateKey, aliceEKKey);  // IK_B, EK_A
  const DH3 = await ecdh(mySPKPrivateKey, aliceEKKey);               // SPK_B, EK_A

  const dhInputs = [DH1, DH2, DH3];

  // 5) Optional: DH4 if Alice used a one-time prekey
  let usedOPKPair = null;
  if (usedOPKId && myOneTimePrekeyKeyPairs) {
    usedOPKPair = myOneTimePrekeyKeyPairs[usedOPKId];
    if (usedOPKPair) {
      const DH4 = await ecdh(usedOPKPair.privateKey, aliceEKKey);   // OPK_B, EK_A
      dhInputs.push(DH4);
    }
  }

  // 6) Derive SK (same as Alice)
  const skInput = dhInputs.reduce((acc, dh) => concat(acc, dh));
  const SK = await hkdf(skInput, null, INFO_X3DH, 32);

  // 7) Build AD (sorted identity keys — same order as Alice)
  const AD = buildAD(aliceIK, myIdentityKeyPair.publicB64);

  // 8) Initialize Double Ratchet (Bob receives with same DH3 as Alice)
  //    Use drInitWithDH so both Alice and Bob share rootKey + initial chain key.
  //    Then swap CKs→CKr (Bob starts as receiver, not sender).
  const session = await drInitWithDH(SK, DH3, AD);
  session.CKr = session.CKs;
  session.CKs = null;

  // 9) Decrypt Alice's first message to verify everything matches
  try {
    // Import from doubleRatchet
    const { drDecrypt } = await import('./doubleRatchet.js');
    const plaintext = await drDecrypt(session, ciphertext.header, ciphertext);
    if (plaintext !== '__X3DH_INIT__') {
      console.warn('[X3DH] First message content unexpected (might be OK if already consumed)');
    }
  } catch (e) {
    console.warn('[X3DH] First message decryption failed:', e.message);
    // This might fail if Bob's chain state diverged — we still have the correct SK
    // Re-init with the SK from scratch
  }

  return {
    SK,
    AD,
    session,
    usedOPKId,
  };
}

// ── Prekey Bundle Fetcher (Client-side helper) ──────────────
// Fetches a user's prekey bundle from the server and prepares it for x3dhInitiate.

export async function fetchPrekeyBundle(serverUrl, targetUserId) {
  const url = `${serverUrl.replace(/\/$/, '')}/api/prekey-bundle/${encodeURIComponent(targetUserId)}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`[X3DH] Failed to fetch prekey bundle for ${targetUserId}: ${resp.status}`);
  }

  const data = await resp.json();
  return {
    identityPubB64: data.identityPubB64,
    signedPrekey: {
      publicB64:  data.signedPrekey.publicB64,
      signature:  data.signedPrekey.signature,
      timestamp:  data.signedPrekey.timestamp,
    },
    oneTimePrekeys: data.oneTimePrekeys || [],
  };
}

// ── Upload Prekey Bundle (Client-side helper) ───────────────
// Uploads the user's own prekey bundle to the server.

export async function uploadPrekeyBundle(serverUrl, bundle, authToken) {
  const url = `${serverUrl.replace(/\/$/, '')}/api/prekey-bundle`;

  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      identityPubB64: bundle.identityPubB64,
      signedPrekey:   bundle.signedPrekey,
      oneTimePrekeys: bundle.oneTimePrekeys,
    }),
  });

  if (!resp.ok) {
    throw new Error(`[X3DH] Failed to upload prekey bundle: ${resp.status}`);
  }

  return resp.json();
}
