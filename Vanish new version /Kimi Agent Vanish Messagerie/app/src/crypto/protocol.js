// src/crypto/protocol.js
// Signal Protocol Orchestration Layer

import { 
  generateIdentityKeyPair, 
  generateX3DHBundle, 
  x3dhInitiate, 
  x3dhRespond 
} from './x3dh';
import { SessionManager } from './doubleRatchet';
import { saveIdentityKey, loadIdentityKey } from './keyStorage';
import { supabase } from '@/lib/supabase';
import { Preferences } from '@capacitor/preferences';

export const sessionManager = new SessionManager();

/**
 * Initialize user keys and publish bundle to Supabase
 */
export async function initializeUserKeys(uid) {
  // 1. Generate identity
  const identity = await generateIdentityKeyPair();
  await saveIdentityKey({
    privateJwk: identity.privateJwk,
    publicB64: identity.publicB64
  });

  // 2. Generate X3DH bundle
  const bundle = await generateX3DHBundle(identity, Date.now(), 50);

  // 3. Store private pre-keys locally
  await Preferences.set({
    key: `vanish_spk_${uid}`,
    value: JSON.stringify({
      privateJwk: bundle._privateSignedPreKey.privateJwk,
      keyId: bundle._privateSignedPreKey.keyId,
    })
  });

  // 4. Publish public bundle
  await supabase.from('key_bundles').upsert({
    user_id: uid,
    identity_key: bundle.identityKey.publicB64,
    signed_pre_key: bundle.signedPreKey,
    one_time_pre_keys: bundle.oneTimePreKeys,
    updated_at: new Date().toISOString(),
  });

  return bundle;
}

/**
 * Initiate a session with a peer
 */
export async function initiateSession(ourIdentityB64, theirId, theirBundle, sessionId) {
  const ourIdentity = await loadIdentityKey();
  const otpk = theirBundle.one_time_pre_keys?.[0];

  const x3dhResult = await x3dhInitiate(
    ourIdentity,
    theirBundle.identity_key,
    theirBundle.signed_pre_key.publicB64,
    theirBundle.signed_pre_key.signature,
    otpk?.publicB64
  );

  return await sessionManager.initializeSession(
    sessionId,
    x3dhResult,
    null,
    theirBundle.signed_pre_key.publicB64
  );
}

/**
 * Respond to an incoming session
 */
export async function respondToSession(ourId, theirIdentityB64, theirEphemeralB64, sessionId) {
  const ourIdentity = await loadIdentityKey();
  const { value: spkRaw } = await Preferences.get({ key: `vanish_spk_${ourId}` });
  const spk = JSON.parse(spkRaw);
  
  const spkPriv = await crypto.subtle.importKey(
    'jwk', spk.privateJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, ['deriveBits']
  );

  const x3dhResult = await x3dhRespond(
    ourIdentity,
    { privateKey: spkPriv },
    null,
    theirIdentityB64,
    theirEphemeralB64
  );

  return await sessionManager.initializeSession(
    sessionId,
    x3dhResult,
    null,
    theirEphemeralB64
  );
}

export async function encryptMessage(sessionId, plainText) {
  return await sessionManager.encryptMessage(sessionId, plainText);
}

export async function decryptMessage(sessionId, payload) {
  return await sessionManager.decryptMessage(sessionId, payload);
}
