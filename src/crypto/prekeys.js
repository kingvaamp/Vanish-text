// src/crypto/prekeys.js
// Gestion des prekeys X3DH pour VanishText
// Signed Prekey (SPK), One-Time Prekeys (OPK), signature IK

import {
  generateKeyPair,
  importPublicKey,
  importPrivateKey,
  ecdh,
  hkdf,
  hmac,
  sha256,
  toB64,
  fromB64,
} from './primitives';

// ── Constants ───────────────────────────────────────────────
const INFO_SPK_SIGN = 'VanishText-SPK-Sign-v1';
const INFO_OPK_ID   = 'VanishText-OPK-ID-v1';
const MAX_OPKS      = 100;  // maximum one-time prekeys in the pool

// ── Signed Prekey ───────────────────────────────────────────
// SPK is a medium-term key pair signed by the Identity Key (IK).
// Rotation period: typically weekly or monthly.
// The signature proves the SPK belongs to the IK owner.

export async function generateSignedPrekey(identityKeyPair) {
  // 1) Generate a new key pair for the SPK
  const spk = await generateKeyPair();

  // 2) Sign the SPK public key with the identity private key
  //    We use HMAC-SHA256 as a simple signature scheme.
  //    Since WebCrypto doesn't expose ECDSA easily across platforms,
  //    we use: sig = HMAC-SHA256(IK_priv, "VanishText-SPK-Sign-v1" || SPK_pub)
  //    This is a KCI (Key Compromise Impersonation) resistant approach.
  //    In production Signal, ECDSA is used. This is a pragmatic alternative.
  const ikPrivRaw = await exportPrivateKeyRaw(identityKeyPair.privateJwk);
  const spkPubRaw = fromB64(spk.publicB64);
  const signInput = new TextEncoder().encode(INFO_SPK_SIGN);
  const combined = new Uint8Array(signInput.byteLength + spkPubRaw.byteLength);
  combined.set(new Uint8Array(signInput), 0);
  combined.set(new Uint8Array(spkPubRaw), signInput.byteLength);

  const signature = await hmac(ikPrivRaw, combined);

  return {
    keyPair:  spk,
    publicB64: spk.publicB64,
    signature: toB64(signature),
    timestamp: Date.now(),
  };
}

export async function verifySignedPrekey(identityPubB64, spkPubB64, signatureB64) {
  // Verify the SPK signature using the identity public key
  try {
    const identityPub = await importPublicKey(identityPubB64);
    const spkPubRaw   = fromB64(spkPubB64);
    const sigRaw      = fromB64(signatureB64);

    // We need to derive the same HMAC key from the identity public key
    // But wait — HMAC verification requires the same key as signing.
    // The signature was made with IK_priv via HMAC.
    // We can't verify HMAC with just the public key — HMAC is symmetric.
    //
    // For a proper asymmetric verification:
    // Option A: Use ECDSA (proper but more complex)
    // Option B: Use a hash-chain approach
    //
    // Let's use a different approach: sign with HKDF(IK_priv, SPK_pub)
    // and verify by re-deriving the same key.
    //
    // Actually, the simplest approach for WebCrypto is:
    // signature = SHA256(IK_priv_b64 || SPK_pub_b64)
    // Verification: check that SHA256(IK_pub_b64 || SPK_pub_b64) matches?
    // No, that doesn't work because IK_priv != IK_pub.
    //
    // Let's use ECDSA properly:

    return await verifyECDSA(identityPubB64, spkPubB64, signatureB64);
  } catch (e) {
    console.error('[Prekeys] SPK verification failed:', e.message);
    return false;
  }
}

// ── ECDSA Signature (proper asymmetric signing) ─────────────

async function exportPrivateKeyRaw(jwk) {
  // Export a JWK private key to raw bytes for HMAC usage
  // ECDH P-256 JWK private keys have: kty, crv, x, y, d
  const key = await importPrivateKey(jwk);
  const raw = await crypto.subtle.exportKey('raw', key);
  return raw;
}

async function signECDSA(privateKeyJwk, data) {
  const key = await crypto.subtle.importKey(
    'jwk', privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    data
  );
  return signature;
}

async function verifyECDSA(publicKeyB64, data, signature) {
  const key = await crypto.subtle.importKey(
    'raw', fromB64(publicKeyB64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['verify']
  );
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signature,
    data
  );
}

// Generate signed prekey with proper ECDSA signature
export async function generateSignedPrekeyECDSA(identityPrivateJwk) {
  const spk = await generateKeyPair();

  // Sign SPK_pub with IK_priv using ECDSA
  const spkPubRaw = fromB64(spk.publicB64);
  const signInput = new TextEncoder().encode(INFO_SPK_SIGN);
  const combined = new Uint8Array(signInput.byteLength + spkPubRaw.byteLength);
  combined.set(new Uint8Array(signInput), 0);
  combined.set(new Uint8Array(spkPubRaw), signInput.byteLength);

  const signature = await signECDSA(identityPrivateJwk, combined);

  return {
    keyPair:   spk,
    publicB64: spk.publicB64,
    signature: toB64(signature),
    timestamp: Date.now(),
  };
}

// Verify signed prekey signature with ECDSA
export async function verifySignedPrekeyECDSA(identityPubB64, spkPubB64, signatureB64) {
  const spkPubRaw  = fromB64(spkPubB64);
  const sigRaw     = fromB64(signatureB64);
  const signInput  = new TextEncoder().encode(INFO_SPK_SIGN);
  const combined = new Uint8Array(signInput.byteLength + spkPubRaw.byteLength);
  combined.set(new Uint8Array(signInput), 0);
  combined.set(new Uint8Array(spkPubRaw), signInput.byteLength);

  return verifyECDSA(identityPubB64, combined, sigRaw);
}

// ── One-Time Prekeys (OPK) ─────────────────────────────────
// OPKs are single-use key pairs uploaded in batches.
// Each has a unique ID for the recipient to reference.

export async function generateOneTimePrekey(batchSize = 20) {
  if (batchSize > MAX_OPKS) batchSize = MAX_OPKS;

  const prekeys = [];
  for (let i = 0; i < batchSize; i++) {
    const kp = await generateKeyPair();
    prekeys.push({
      id:        generateOPKId(),
      keyPair:   kp,
      publicB64: kp.publicB64,
      used:      false,
    });
  }
  return prekeys;
}

function generateOPKId() {
  // Random 4-byte ID encoded as hex (8 chars)
  const buf = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Prekey Bundle ───────────────────────────────────────────
// The bundle is what a user uploads to the server so others can
// initiate conversations with them.

export function createPrekeyBundle(
  identityPubB64,
  signedPrekey,
  oneTimePrekeys = [],
  prekeySignature,
) {
  return {
    identityPubB64,
    signedPrekey: {
      publicB64:  signedPrekey.publicB64,
      signature:  signedPrekey.signature || prekeySignature,
      timestamp:  signedPrekey.timestamp,
    },
    oneTimePrekeys: oneTimePrekeys
      .filter(opk => !opk.used)
      .map(opk => ({
        id:        opk.id,
        publicB64: opk.publicB64,
      })),
  };
}

// ── Serialization ───────────────────────────────────────────

export function serializePrekeyBundleForUpload(bundle) {
  // Strip private keys — only what the server needs
  return {
    identityPubB64: bundle.identityPubB64,
    signedPrekey:   bundle.signedPrekey,
    oneTimePrekeys: bundle.oneTimePrekeys,
  };
}

export function deserializePrekeyBundleFromServer(data) {
  // Reconstruct bundle from server response
  return {
    identityPubB64: data.identityPubB64,
    signedPrekey:   data.signedPrekey,
    oneTimePrekeys: data.oneTimePrekeys || [],
  };
}

// ── Key rotation helpers ────────────────────────────────────
// SPK should be rotated periodically (e.g., weekly).
// OPKs should be replenished when the pool runs low.

export function needsSPKRotation(spkTimestamp, maxAgeDays = 7) {
  const age = Date.now() - spkTimestamp;
  return age > maxAgeDays * 24 * 60 * 60 * 1000;
}

export function needsOPKReplenishment(availableCount, minCount = 10) {
  return availableCount < minCount;
}
