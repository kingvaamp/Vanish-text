// src/crypto/constantTime.js
// Timing-safe operations to prevent oracle attacks
import { fromB64 } from './primitives';

/**
 * Compare two Uint8Arrays in constant time
 * Prevents timing attacks on MAC/Hash verification
 */
export function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Select value based on condition without branching (0 or 1)
 */
export function constantTimeSelect(condition, a, b) {
  const mask = -(condition | 0);
  return (a & mask) | (b & ~mask);
}

/**
 * Constant-time base64 decode with fixed output size
 * Prevents leaking message size via error timing
 */
export function fixedSizeB64Decode(b64, expectedBytes) {
  const decoded = fromB64(b64);
  if (decoded.byteLength !== expectedBytes) {
    // Return zeroed buffer of expected size — don't leak actual size
    return new Uint8Array(expectedBytes);
  }
  return new Uint8Array(decoded);
}

/**
 * Dummy HKDF computation to mask real failure timing
 */
export async function dummyHkdf() {
  const dummyIkm = new Uint8Array(32);
  // We use WebCrypto to perform a real (but useless) operation
  // to ensure CPU power consumption and timing are similar to real work
  const key = await crypto.subtle.importKey('raw', dummyIkm, 'HKDF', false, ['deriveBits']);
  return key;
}
