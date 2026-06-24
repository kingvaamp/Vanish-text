// src/crypto/primitives.js
// Cryptographic primitives for VanishText
// AES-256-GCM, ECDH P-256, HKDF-SHA256, HMAC-SHA256

const subtle = crypto.subtle;
const ENC = new TextEncoder();
const DEC = new TextDecoder();

// ── Helpers ───────────────────────────────────────
export const toB64 = buf => {
  let bin = '';
  new Uint8Array(buf).forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
};

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

// ── Constant-time comparison ───────────────────────
export function constantTimeEqual(a, b) {
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
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

// ── SHA-256 / SHA-512 ────────────────────────────
export async function sha256(data) {
  const buf = typeof data === 'string' ? ENC.encode(data) : data;
  return await subtle.digest('SHA-256', buf);
}

export async function sha512(data) {
  const buf = typeof data === 'string' ? ENC.encode(data) : data;
  return await subtle.digest('SHA-512', buf);
}

// ── AES-256-GCM ───────────────────────────────────
// Encrypt plaintext with optional additionalData (AAD)
// additionalData must be an ArrayBuffer or null
export async function encrypt(keyBuf, plaintext, additionalData = null) {
  const key = await subtle.importKey(
    'raw', keyBuf, 'AES-GCM', false, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const algo = { name: 'AES-GCM', iv, tagLength: 128 };
  if (additionalData) algo.additionalData = new Uint8Array(additionalData);
  const ct = await subtle.encrypt(
    algo,
    key,
    ENC.encode(plaintext)
  );
  return {
    iv:         toB64(iv),
    ciphertext: toB64(ct),
  };
}

// Decrypt ciphertext with optional additionalData (AAD)
export async function decrypt(keyBuf, ivB64, ctB64, additionalData = null) {
  const key = await subtle.importKey(
    'raw', keyBuf, 'AES-GCM', false, ['decrypt']
  );
  const algo = { name: 'AES-GCM', iv: fromB64(ivB64), tagLength: 128 };
  if (additionalData) algo.additionalData = new Uint8Array(additionalData);
  const pt = await subtle.decrypt(
    algo,
    key,
    fromB64(ctB64)
  );
  return DEC.decode(pt);
}

// ── Safety Numbers ────────────────────────────────
export async function generateSafetyNumber(keyA, keyB) {
  const fpA = new Uint8Array(await sha512(keyA)).slice(0, 30);
  const fpB = new Uint8Array(await sha512(keyB)).slice(0, 30);
  const sorted = [fpA, fpB].sort((a, b) => {
    for (let i = 0; i < 30; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  });
  const combined = new Uint8Array(60);
  combined.set(sorted[0]);
  combined.set(sorted[1], 30);
  let finalStr = "";
  for (let i = 0; i < 60; i += 5) {
    const chunk = combined.slice(i, i + 5);
    let val = 0n;
    for (let j = 0; j < 5; j++) val = (val << 8n) + BigInt(chunk[j]);
    finalStr += val.toString().padStart(12, '0').substring(0, 5); 
  }
  return finalStr.replace(/(\d{5})/g, '$1 ').trim();
}
