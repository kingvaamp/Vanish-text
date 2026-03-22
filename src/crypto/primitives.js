// src/crypto/primitives.js
const subtle = crypto.subtle;
const ENC = new TextEncoder();
const DEC = new TextDecoder();

// ── Helpers ───────────────────────────────────────
export const toB64 = buf =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

export const fromB64 = str =>
  Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;

export function concat(...buffers) {
  const out = new Uint8Array(
    buffers.reduce((s, b) => s + b.byteLength, 0)
  );
  let offset = 0;
  for (const b of buffers) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out.buffer;
}

// ── Génération de paire de clés ECDH ──────────────
export async function generateKeyPair() {
  const kp = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const publicRaw = await subtle.exportKey('raw', kp.publicKey);
  const privateJwk = await subtle.exportKey('jwk', kp.privateKey);
  return {
    publicKey:  kp.publicKey,
    privateKey: kp.privateKey,
    publicB64:  toB64(publicRaw),
    privateJwk,
  };
}

export async function importPublicKey(b64) {
  return subtle.importKey(
    'raw', fromB64(b64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true, []
  );
}

export async function importPrivateKey(jwk) {
  return subtle.importKey(
    'jwk', jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, ['deriveKey', 'deriveBits']
  );
}

// ── ECDH → secret partagé ─────────────────────────
export async function ecdh(privateKey, publicKey) {
  return subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey, 256
  );
}

// ── HKDF ─────────────────────────────────────────
export async function hkdf(ikm, salt, info, bytes = 32) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256',
      salt: salt || new Uint8Array(32),
      info: ENC.encode(info) },
    key, bytes * 8
  );
}

// ── HMAC ─────────────────────────────────────────
export async function hmac(keyBuf, data) {
  const k = await subtle.importKey(
    'raw', keyBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  return subtle.sign('HMAC', k, data);
}

// ── AES-256-GCM chiffrement ───────────────────────
export async function encrypt(keyBuf, plaintext) {
  const key = await subtle.importKey(
    'raw', keyBuf, 'AES-GCM', false, ['encrypt']
  );
  // IV aléatoire 96 bits — JAMAIS réutilisé
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    ENC.encode(plaintext)
  );
  return {
    iv:         toB64(iv),
    ciphertext: toB64(ct),
  };
}

// ── AES-256-GCM déchiffrement ─────────────────────
export async function decrypt(keyBuf, ivB64, ctB64) {
  const key = await subtle.importKey(
    'raw', keyBuf, 'AES-GCM', false, ['decrypt']
  );
  const pt = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64), tagLength: 128 },
    key,
    fromB64(ctB64)
  );
  return DEC.decode(pt);
}
