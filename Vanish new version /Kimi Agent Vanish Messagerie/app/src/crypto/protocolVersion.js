// src/crypto/protocolVersion.js
// Central version control for all cryptographic operations
// NEVER change existing versions — add new ones for protocol upgrades

export const PROTOCOL_VERSIONS = {
  // Current active version
  CURRENT: 'vt2024v3',

  // Supported versions for decryption (newest first)
  SUPPORTED: ['vt2024v3', 'vt2024v2'],

  // Deprecated — never decrypt these
  DEPRECATED: ['vt2024v1', 'v5', 'v2', 'v1'],
};

// Version-specific parameters
export const VERSION_PARAMS = {
  vt2024v3: {
    hkdfLabel: (msgIndex) => `VanishText-vt2024v3-${msgIndex}`,
    aesKeyLength: 32,
    ivLength: 12,
    tagLength: 128,
    curve: 'P-256',
    hkdfSalt: null,
    hkdfInfo: 'VanishText-X3DH-v3',
  },
  vt2024v2: {
    hkdfLabel: (msgIndex) => `VanishText-msg-v2-${msgIndex}`,
    aesKeyLength: 32,
    ivLength: 12,
    tagLength: 128,
    curve: 'P-256',
    hkdfSalt: null,
    hkdfInfo: 'VanishText-X3DH-v2',
  },
};

export function getVersionParams(version) {
  return VERSION_PARAMS[version] || null;
}

export function isSupportedVersion(version) {
  return PROTOCOL_VERSIONS.SUPPORTED.includes(version);
}

export function isDeprecatedVersion(version) {
  return PROTOCOL_VERSIONS.DEPRECATED.includes(version);
}
