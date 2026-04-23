// src/crypto/x3dh.js
// Real Signal Protocol X3DH (Extended Triple Diffie-Hellman)
// Fixed for Web Crypto API strict ECDH/ECDSA separation

import { toB64, fromB64, hkdf } from './primitives';

const subtle = crypto.subtle;

// Helper to concatenate Uint8Arrays
function concat(...arrays) {
  const totalLength = arrays.reduce((acc, val) => acc + val.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result.buffer;
}

// ── Key Types ─────────────────────────────────────────────

export async function generateIdentityKeyPair() {
  // Generate as ECDSA for signing
  const kpSigning = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  
  const pubJwk = await subtle.exportKey('jwk', kpSigning.publicKey);
  const privJwk = await subtle.exportKey('jwk', kpSigning.privateKey);
  
  // Clone to ECDH for key agreement (Web Crypto API requires strict separation)
  const pubJwkEcdh = { ...pubJwk, key_ops: [] };
  const privJwkEcdh = { ...privJwk, key_ops: ['deriveBits'] };
  
  const pubECDH = await subtle.importKey('jwk', pubJwkEcdh, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  const privECDH = await subtle.importKey('jwk', privJwkEcdh, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  
  const publicRaw = await subtle.exportKey('raw', pubECDH);

  return {
    publicKeyECDH: pubECDH,
    privateKeyECDH: privECDH,
    publicKeyECDSA: kpSigning.publicKey,
    privateKeyECDSA: kpSigning.privateKey,
    publicB64: toB64(publicRaw),
    privateJwk: privJwk, // Keep original ECDSA JWK for storage
  };
}

export async function generateSignedPreKey(identityPrivateKeyECDSA, signedPreKeyId) {
  const kp = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const publicRaw = await subtle.exportKey('raw', kp.publicKey);
  const privateJwk = await subtle.exportKey('jwk', kp.privateKey);
  
  // Sign the prekey public key with identity key (ECDSA)
  const signature = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identityPrivateKeyECDSA,
    publicRaw
  );
  
  return {
    keyId: signedPreKeyId,
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    publicB64: toB64(publicRaw),
    privateJwk,
    signature: toB64(signature),
  };
}

export async function generateOneTimePreKey(keyId) {
  const kp = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const publicRaw = await subtle.exportKey('raw', kp.publicKey);
  const privateJwk = await subtle.exportKey('jwk', kp.privateKey);
  return {
    keyId,
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    publicB64: toB64(publicRaw),
    privateJwk,
  };
}

// ── Helpers ───────────────────────────────────────────────

async function importPublicKeyAsECDH(b64) {
  return subtle.importKey(
    'raw', fromB64(b64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true, []
  );
}

async function importPublicKeyAsECDSA(b64) {
  return subtle.importKey(
    'raw', fromB64(b64),
    { name: 'ECDSA', namedCurve: 'P-256' },
    true, ['verify']
  );
}

// ── X3DH Key Agreement ────────────────────────────────────

export async function x3dhInitiate(
  ourIdentityKey,             // our full identity keypair object
  theirIdentityPublicB64,     // recipient's identity public key (base64)
  theirSignedPreKeyPublic,    // recipient's signed prekey public key (CryptoKey or b64)
  theirSignedPreKeySignature, // signature of signed prekey (base64)
  theirOneTimePreKeyPublic    // optional: recipient's one-time prekey public key
) {
  // 1. Verify signed prekey signature using their ECDSA Identity Key
  const theirIdentityPublicECDSA = await importPublicKeyAsECDSA(theirIdentityPublicB64);
  const theirSignedPreKeyPub = typeof theirSignedPreKeyPublic === 'string' 
    ? await importPublicKeyAsECDH(theirSignedPreKeyPublic) 
    : theirSignedPreKeyPublic;
  
  const signatureValid = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    theirIdentityPublicECDSA,
    fromB64(theirSignedPreKeySignature),
    await subtle.exportKey('raw', theirSignedPreKeyPub)
  );
  
  if (!signatureValid) {
    throw new Error('X3DH: Invalid signed prekey signature');
  }

  // 2. Generate ephemeral key (ECDH)
  const kpEphemeral = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const ephemeralPublicRaw = await subtle.exportKey('raw', kpEphemeral.publicKey);
  const ephemeralPublicB64 = toB64(ephemeralPublicRaw);
  
  // 3. Perform DH computations
  const theirIdentityPublicECDH = await importPublicKeyAsECDH(theirIdentityPublicB64);

  const dh1 = await subtle.deriveBits(
    { name: 'ECDH', public: theirSignedPreKeyPub },
    ourIdentityKey.privateKeyECDH,
    256
  );
  
  const dh2 = await subtle.deriveBits(
    { name: 'ECDH', public: theirIdentityPublicECDH },
    kpEphemeral.privateKey,
    256
  );
  
  const dh3 = await subtle.deriveBits(
    { name: 'ECDH', public: theirSignedPreKeyPub },
    kpEphemeral.privateKey,
    256
  );
  
  let dh4 = null;
  if (theirOneTimePreKeyPublic) {
    const theirOneTimePub = typeof theirOneTimePreKeyPublic === 'string'
      ? await importPublicKeyAsECDH(theirOneTimePreKeyPublic)
      : theirOneTimePreKeyPublic;
    dh4 = await subtle.deriveBits(
      { name: 'ECDH', public: theirOneTimePub },
      kpEphemeral.privateKey,
      256
    );
  }

  // 4. KDF
  const sharedSecret = dh4 
    ? concat(new Uint8Array(dh1), new Uint8Array(dh2), new Uint8Array(dh3), new Uint8Array(dh4))
    : concat(new Uint8Array(dh1), new Uint8Array(dh2), new Uint8Array(dh3));
  
  const sk = await hkdf(sharedSecret, null, 'VanishText-X3DH', 32);
  
  // Associated data for authentication
  const ad = concat(
    new Uint8Array(fromB64(ourIdentityKey.publicB64)),
    new Uint8Array(fromB64(theirIdentityPublicB64))
  );

  return {
    sk,
    ad,
    ephemeralPublicB64,
  };
}

export async function x3dhRespond(
  ourIdentityKey,          // our full identity keypair object
  ourSignedPreKey,         // our signed prekey
  ourOneTimePreKey,        // optional, our one time prekey
  theirIdentityPublicB64,  // initiator's identity public key
  theirEphemeralPublicB64  // initiator's ephemeral public key
) {
  const theirIdentityPublicECDH = await importPublicKeyAsECDH(theirIdentityPublicB64);
  const theirEphemeralPublic = await importPublicKeyAsECDH(theirEphemeralPublicB64);
  
  // DH computations (Responder perspective: swap the DH pairs)
  // DH1 = SPK_B(priv) * IK_A(pub)
  const dh1 = await subtle.deriveBits(
    { name: 'ECDH', public: theirIdentityPublicECDH },
    ourSignedPreKey.privateKey,
    256
  );
  
  // DH2 = IK_B(priv) * EK_A(pub)
  const dh2 = await subtle.deriveBits(
    { name: 'ECDH', public: theirEphemeralPublic },
    ourIdentityKey.privateKeyECDH,
    256
  );
  
  // DH3 = SPK_B(priv) * EK_A(pub)
  const dh3 = await subtle.deriveBits(
    { name: 'ECDH', public: theirEphemeralPublic },
    ourSignedPreKey.privateKey,
    256
  );
  
  // DH4 = OPK_B(priv) * EK_A(pub)
  let dh4 = null;
  if (ourOneTimePreKey) {
    dh4 = await subtle.deriveBits(
      { name: 'ECDH', public: theirEphemeralPublic },
      ourOneTimePreKey.privateKey,
      256
    );
  }

  const sharedSecret = dh4
    ? concat(new Uint8Array(dh1), new Uint8Array(dh2), new Uint8Array(dh3), new Uint8Array(dh4))
    : concat(new Uint8Array(dh1), new Uint8Array(dh2), new Uint8Array(dh3));
  
  const sk = await hkdf(sharedSecret, null, 'VanishText-X3DH', 32);
  
  const ad = concat(
    new Uint8Array(fromB64(theirIdentityPublicB64)),
    new Uint8Array(fromB64(ourIdentityKey.publicB64))
  );

  return { sk, ad };
}

export async function generateX3DHBundle(identityKeyPair, signedPreKeyId, oneTimePreKeyCount = 20) {
  const signedPreKey = await generateSignedPreKey(identityKeyPair.privateKeyECDSA, signedPreKeyId);
  const oneTimePreKeys = [];
  for (let i = 0; i < oneTimePreKeyCount; i++) {
    oneTimePreKeys.push(await generateOneTimePreKey(i));
  }
  
  return {
    identityKey: {
      publicB64: identityKeyPair.publicB64,
    },
    signedPreKey: {
      keyId: signedPreKey.keyId,
      publicB64: signedPreKey.publicB64,
      signature: signedPreKey.signature,
    },
    oneTimePreKeys: oneTimePreKeys.map(k => ({
      keyId: k.keyId,
      publicB64: k.publicB64,
    })),
    // Private keys stored separately
    _privateSignedPreKey: signedPreKey,
    _privateOneTimePreKeys: oneTimePreKeys,
  };
}

/**
 * Compute a Safety Number (Signal fingerprint)
 * Concatenates and hashes sorted identity keys
 */
export async function computeSafetyNumber(ourPubKeyB64, theirPubKeyB64) {
  const keys = [ourPubKeyB64, theirPubKeyB64].sort();
  const data = new TextEncoder().encode(keys.join(''));
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hash));
  
  // Format as blocks of 5 digits (Signal style)
  let safetyNumber = "";
  for (let i = 0; i < 12; i += 2) {
    const val = (hashArray[i] << 8) | hashArray[i+1];
    safetyNumber += (val % 100000).toString().padStart(5, '0') + " ";
  }
  return safetyNumber.trim();
}
