// src/storage/RatchetStorage.js
// Persistent storage for Double Ratchet chain keys, message counters, and skipped keys
// Adapted for Capacitor Preferences (Native UserDefaults/SharedPreferences)

import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const P = 'vt:ratchet:';
const isWeb = Capacitor.getPlatform() === 'web';

// ── Generic Storage Wrappers ──────────────────────────────

async function secureSet(key, value) {
  await Preferences.set({
    key: P + key,
    value: value
  });
}

async function secureGet(key) {
  const { value } = await Preferences.get({ key: P + key });
  return value;
}

async function secureDel(key) {
  await Preferences.remove({ key: P + key });
}

// ── Session State (full snapshot) ─────────────────────────

export async function saveSessionState(sessionId, stateJson) {
  await secureSet(`session:${sessionId}`, stateJson);
  await registerSessionId(sessionId);
}

export async function loadSessionState(sessionId) {
  const data = await secureGet(`session:${sessionId}`);
  return data ? JSON.parse(data) : null;
}

export async function deleteSessionState(sessionId) {
  await secureDel(`session:${sessionId}`);
  await secureDel(`chain:${sessionId}`);
  await secureDel(`skipped:${sessionId}`);
  await unregisterSessionId(sessionId);
}

// ── Chain State (counters only — lightweight) ─────────────

export async function saveChainState(sessionId, chainState) {
  await secureSet(`chain:${sessionId}`, JSON.stringify(chainState));
}

export async function loadChainState(sessionId) {
  const data = await secureGet(`chain:${sessionId}`);
  return data ? JSON.parse(data) : null;
}

// ── Skipped Message Keys ──────────────────────────────────

export async function saveSkippedKeys(sessionId, skippedEntries) {
  // Limit storage — old sessions get purged
  let entries = skippedEntries;
  if (entries.length > 1000) {
    entries = entries.slice(-500);
  }
  await secureSet(`skipped:${sessionId}`, JSON.stringify(entries));
}

export async function loadSkippedKeys(sessionId) {
  const data = await secureGet(`skipped:${sessionId}`);
  return data ? JSON.parse(data) : [];
}

// ── Bulk Operations ───────────────────────────────────────

export async function listAllSessionIds() {
  // Capacitor Preferences doesn't support easy enumeration on all platforms
  // So we maintain a separate list as the user suggested
  const list = await secureGet('session_list');
  return list ? JSON.parse(list) : [];
}

export async function registerSessionId(sessionId) {
  const existing = await listAllSessionIds();
  if (!existing.includes(sessionId)) {
    existing.push(sessionId);
    await secureSet('session_list', JSON.stringify(existing));
  }
}

export async function unregisterSessionId(sessionId) {
  const existing = await listAllSessionIds();
  const filtered = existing.filter(id => id !== sessionId);
  await secureSet('session_list', JSON.stringify(filtered));
}

export async function wipeAllRatchetData() {
  const sessionIds = await listAllSessionIds();
  for (const id of sessionIds) {
    await secureDel(`session:${id}`);
    await secureDel(`chain:${id}`);
    await secureDel(`skipped:${id}`);
  }
  await secureDel('session_list');
}
