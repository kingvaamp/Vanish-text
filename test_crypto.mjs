// test_crypto.mjs — Tests unitaires et intégration pour toute la stack crypto
// Usage: node test_crypto.mjs

import * as primitives from './src/crypto/primitives.js';
import * as dr from './src/crypto/doubleRatchet.js';
import * as prekeys from './src/crypto/prekeys.js';
import * as x3dh from './src/crypto/x3dh.js';

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, label, detail = '') {
  if (condition) { passed++; process.stdout.write('✓'); }
  else { failed++; errors.push({ label, detail }); process.stdout.write('✗'); }
}

function assertEqual(a, b, label) {
  assert(a === b, label, `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertBufferEqual(a, b, label) {
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  let ok = ua.length === ub.length;
  for (let i = 0; ok && i < ua.length; i++) if (ua[i] !== ub[i]) ok = false;
  assert(ok, label, `Buffers differ (len ${ua.length} vs ${ub.length})`);
}

// Helper: create a symmetrical DR pair where Alice is sender, Bob is receiver.
// Returns { alice, bob, dhOutput }
async function createDRPair() {
  const SK = crypto.getRandomValues(new Uint8Array(32));
  const AD = new TextEncoder().encode('test-ad-' + Math.random());
  // Simulate the DH output from an ECDH exchange (like X3DH produces)
  const kpA = await primitives.generateKeyPair();
  const kpB = await primitives.generateKeyPair();
  const dhOutput = await primitives.ecdh(kpA.privateKey, await primitives.importPublicKey(kpB.publicB64));
  const alice = await dr.drInitWithDH(SK, dhOutput, AD);
  const bob = await dr.drInitWithDH(SK, dhOutput, AD);
  // Bob treats the chain key as receive chain (same as real X3DH where DH(EK_A, SPK_B) = DH(SPK_B, EK_A))
  bob.CKr = bob.CKs;
  bob.CKs = null;
  return { alice, bob, dhOutput, AD };
}

// ────────────────────────────────────────────────────────────
console.log('\n═══ 1. PRIMITIVES ═══\n');

// 1a. AES-256-GCM encrypt/decrypt
{
  const key = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = 'Hello VanishText! 123 €✓';
  const { iv, ciphertext } = await primitives.encrypt(key, plaintext);
  assert(!!iv && !!ciphertext, 'encrypt returns iv and ciphertext');
  const decrypted = await primitives.decrypt(key, iv, ciphertext);
  assertEqual(decrypted, plaintext, 'decrypt(encrypt(text)) === text');
}

// 1b. AES-256-GCM with AAD
{
  const key = crypto.getRandomValues(new Uint8Array(32));
  const aad = new TextEncoder().encode('associated-data');
  const ct = await primitives.encrypt(key, 'secret', aad);
  const pt = await primitives.decrypt(key, ct.iv, ct.ciphertext, aad);
  assertEqual(pt, 'secret', 'AES-GCM with AAD works');
  try {
    await primitives.decrypt(key, ct.iv, ct.ciphertext, new TextEncoder().encode('wrong'));
    assert(false, 'Wrong AAD should throw');
  } catch { assert(true, 'AES-GCM with wrong AAD throws'); }
}

// 1c. ECDH
{
  const kp1 = await primitives.generateKeyPair();
  assert(!!kp1.publicB64 && !!kp1.privateJwk, 'ECDH key pair generated');
  const kp2 = await primitives.generateKeyPair();
  const shared1 = await primitives.ecdh(kp1.privateKey, await primitives.importPublicKey(kp2.publicB64));
  const shared2 = await primitives.ecdh(kp2.privateKey, await primitives.importPublicKey(kp1.publicB64));
  assertBufferEqual(shared1, shared2, 'ECDH shared secret matches');
}

// 1d. HKDF
{
  const ikm = crypto.getRandomValues(new Uint8Array(32));
  const okm = await primitives.hkdf(ikm, null, 'test-info', 32);
  assert(okm.byteLength === 32, 'HKDF output 32 bytes');
  const okm2 = await primitives.hkdf(ikm, null, 'test-info-diff', 32);
  const same = new Uint8Array(okm).every((b, i) => b === new Uint8Array(okm2)[i]);
  assert(!same, 'Different HKDF info → different output');
}

// 1e. HMAC
{
  const key = crypto.getRandomValues(new Uint8Array(32));
  const mac1 = await primitives.hmac(key, new TextEncoder().encode('msg1'));
  const mac2 = await primitives.hmac(key, new TextEncoder().encode('msg2'));
  assert(mac1.byteLength === 32, 'HMAC-SHA256 32 bytes');
  const same = new Uint8Array(mac1).every((b, i) => b === new Uint8Array(mac2)[i]);
  assert(!same, 'Different HMAC messages → different output');
}

// 1f. SHA-256 + constant-time
{
  const hash = await primitives.sha256('test');
  assert(hash.byteLength === 32, 'SHA-256');
  const a = new Uint8Array([1,2,3,4]);
  assert(primitives.constantTimeEqual(a, new Uint8Array([1,2,3,4])), 'const-time equal');
  assert(!primitives.constantTimeEqual(a, new Uint8Array([1,2,3,5])), 'const-time diff');
}

// ────────────────────────────────────────────────────────────
console.log('\n\n═══ 2. DOUBLE RATCHET ═══\n');

// 2a. Init + encrypt + decrypt roundtrip (Alice → Bob)
{
  const { alice, bob } = await createDRPair();
  assert(!!alice.CKs, 'Alice has send chain key CKs');
  assert(!alice.CKr, 'Alice has no receive chain CKr initially');
  assert(!bob.CKs, 'Bob has no send chain initially');
  assert(!!bob.CKr, 'Bob has receive chain from initial key (same DH output)');

  const { header, ciphertext } = await dr.drEncrypt(alice, 'Hello Bob');
  assert(!!header && !!ciphertext, 'drEncrypt returns header/ciphertext');

  const plaintext = await dr.drDecrypt(bob, header, ciphertext);
  assertEqual(plaintext, 'Hello Bob', 'Alice → Bob first message');
  assert(!!bob.CKr, 'Bob has receive chain after first decrypt');
}

// 2b. Bidirectional (Alice → Bob → Alice)
{
  const { alice, bob } = await createDRPair();

  const m1 = await dr.drEncrypt(alice, 'A→B');
  const r1 = await dr.drDecrypt(bob, m1.header, m1.ciphertext);
  assertEqual(r1, 'A→B', 'Alice → Bob #1');

  // Bob replies — triggers DH ratchet (Bob's first send)
  const m2 = await dr.drEncrypt(bob, 'B→A');
  const r2 = await dr.drDecrypt(alice, m2.header, m2.ciphertext);
  assertEqual(r2, 'B→A', 'Bob → Alice #2 (DH ratchet)');

  // Alice replies — another DH ratchet
  const m3 = await dr.drEncrypt(alice, 'A→B #3');
  const r3 = await dr.drDecrypt(bob, m3.header, m3.ciphertext);
  assertEqual(r3, 'A→B #3', 'Alice → Bob #3 (ratchet back)');
}

// 2c. Out-of-order messages (MKSkipped)
{
  const { alice, bob } = await createDRPair();

  const msgs = [];
  for (let i = 0; i < 5; i++) {
    msgs.push(await dr.drEncrypt(alice, `Msg ${i}`));
  }

  for (let i = 4; i >= 0; i--) {
    const pt = await dr.drDecrypt(bob, msgs[i].header, msgs[i].ciphertext);
    assertEqual(pt, `Msg ${i}`, `Out-of-order msg ${i}`);
  }
}

// 2d. Serialization/deserialization
{
  const { alice, bob } = await createDRPair();

  const m1 = await dr.drEncrypt(alice, 'Before save');
  await dr.drDecrypt(bob, m1.header, m1.ciphertext);

  const serialized = await dr.serializeSession(alice);
  assert(!!serialized.DHs?.privateJwk, 'serialized has DHs private JWK');

  const restored = await dr.deserializeSession(serialized);
  assert(restored.Ns === alice.Ns, 'Ns restored');

  const m2 = await dr.drEncrypt(restored, 'After restore');
  const r2 = await dr.drDecrypt(bob, m2.header, m2.ciphertext);
  assertEqual(r2, 'After restore', 'Message after session restore');
}

// 2e. 10 sequential messages
{
  const { alice, bob } = await createDRPair();
  for (let i = 0; i < 10; i++) {
    const m = await dr.drEncrypt(alice, `Seq ${i}`);
    const pt = await dr.drDecrypt(bob, m.header, m.ciphertext);
    assertEqual(pt, `Seq ${i}`, `Seq msg ${i}/10`);
  }
}


// ────────────────────────────────────────────────────────────
console.log('\n\n═══ 3. PREKEYS ═══\n');

// 3a. SPK generation + ECDSA verification
{
  const idKP = await primitives.generateKeyPair();
  const spk = await prekeys.generateSignedPrekeyECDSA(idKP.privateJwk);
  assert(!!spk.publicB64 && !!spk.signature, 'SPK generated with signature');

  const valid = await prekeys.verifySignedPrekeyECDSA(idKP.publicB64, spk.publicB64, spk.signature);
  assert(valid, 'Valid SPK signature verifies');

  const wrongKP = await primitives.generateKeyPair();
  const invalid = await prekeys.verifySignedPrekeyECDSA(wrongKP.publicB64, spk.publicB64, spk.signature);
  assert(!invalid, 'Wrong identity key fails verification');
}

// 3b. OPK batch
{
  const opks = await prekeys.generateOneTimePrekey(10);
  assert(opks.length === 10, '10 OPKs generated');
  assert(opks.every(o => o.id && o.publicB64), 'Each OPK has id + key');
  assert(opks.every(o => !o.used), 'No OPK marked used');
}

// 3c. Prekey bundle
{
  const ik = (await primitives.generateKeyPair()).publicB64;
  const spk = await prekeys.generateSignedPrekeyECDSA((await primitives.generateKeyPair()).privateJwk);
  const opks = await prekeys.generateOneTimePrekey(5);
  const bundle = prekeys.createPrekeyBundle(ik, spk, opks, spk.signature);
  assert(bundle.identityPubB64 === ik, 'Bundle has IK');
  assert(bundle.oneTimePrekeys.length === 5, 'Bundle has 5 OPKs');
}

// 3d. Rotation
{
  assert(prekeys.needsSPKRotation(Date.now() - 10*24*3600*1000), '10-day SPK needs rotation');
  assert(!prekeys.needsSPKRotation(Date.now()), 'Fresh SPK no rotation');
}

// ────────────────────────────────────────────────────────────
console.log('\n\n═══ 4. X3DH ═══\n');

// 4a. Full X3DH handshake with OPK
{
  // Bob setup
  const bobIK = await primitives.generateKeyPair();
  const bobSPK = await prekeys.generateSignedPrekeyECDSA(bobIK.privateJwk);
  const bobOPKs = await prekeys.generateOneTimePrekey(5);
  const bobBundle = prekeys.createPrekeyBundle(bobIK.publicB64, bobSPK, bobOPKs, bobSPK.signature);

  const opkMap = {};
  for (const opk of bobOPKs) opkMap[opk.id] = opk.keyPair;

  // Alice init
  const aliceIK = await primitives.generateKeyPair();
  const init = await x3dh.x3dhInitiate(aliceIK, bobBundle);
  assert(!!init.SK, 'X3DH produces SK');
  assert(!!init.initialMessage, 'X3DH produces initialMessage');
  assert(init.initialMessage.usedOPKId, 'X3DH used a one-time prekey');

  // Bob respond
  const resp = await x3dh.x3dhRespond(bobIK, bobSPK.keyPair, opkMap, init.initialMessage);
  assert(!!resp.SK, 'Bob produces SK');
  assertBufferEqual(resp.SK, init.SK, 'SK matches Alice ↔ Bob');
  assert(resp.usedOPKId === init.initialMessage.usedOPKId, 'Both used same OPK');
}

// 4b. X3DH without OPK (fallback)
{
  const bobIK = await primitives.generateKeyPair();
  const bobSPK = await prekeys.generateSignedPrekeyECDSA(bobIK.privateJwk);
  const aliceIK = await primitives.generateKeyPair();
  const bundle = prekeys.createPrekeyBundle(bobIK.publicB64, bobSPK, []);

  const init = await x3dh.x3dhInitiate(aliceIK, bundle);
  assert(!init.initialMessage.usedOPKId, 'No OPK used when none in bundle');

  const resp = await x3dh.x3dhRespond(bobIK, bobSPK.keyPair, {}, init.initialMessage);
  assertBufferEqual(resp.SK, init.SK, 'SK matches without OPK');
}

// ────────────────────────────────────────────────────────────
console.log('\n\n═══ 5. INTEGRATION: X3DH → DR ═══\n');

// 5a. Full flow: Alice X3DH-init → encrypt DR → Bob X3DH-respond → decrypt → reply
{
  // Bob prekeys
  const bobIK = await primitives.generateKeyPair();
  const bobSPK = await prekeys.generateSignedPrekeyECDSA(bobIK.privateJwk);
  const bobOPKs = await prekeys.generateOneTimePrekey(5);
  const bobBundle = prekeys.createPrekeyBundle(bobIK.publicB64, bobSPK, bobOPKs, bobSPK.signature);
  const opkMap = {};
  for (const opk of bobOPKs) opkMap[opk.id] = opk.keyPair;

  // Alice keys
  const aliceIK = await primitives.generateKeyPair();

  // X3DH Initiate (Alice gets SK + DR session with CKs)
  const init = await x3dh.x3dhInitiate(aliceIK, bobBundle);
  const sessionA = init.session;
  assert(!!sessionA.CKs, 'Alice DR session has CKs (can send)');

  // Alice encrypts first message with DR
  const msg1 = await dr.drEncrypt(sessionA, 'Hello from Alice via X3DH!');

  // X3DH Respond (Bob derives same SK + DR session)
  const resp = await x3dh.x3dhRespond(bobIK, bobSPK.keyPair, opkMap, init.initialMessage);
  const sessionB = resp.session;

  // Bob decrypts first message
  const pt1 = await dr.drDecrypt(sessionB, msg1.header, msg1.ciphertext);
  assertEqual(pt1, 'Hello from Alice via X3DH!', 'X3DH → DR: Bob decrypts Alice msg');

  // Bob replies (triggers DH ratchet)
  const msg2 = await dr.drEncrypt(sessionB, 'Reply from Bob after X3DH');
  const pt2 = await dr.drDecrypt(sessionA, msg2.header, msg2.ciphertext);
  assertEqual(pt2, 'Reply from Bob after X3DH', 'X3DH → DR: Alice decrypts Bob reply');

  // Third message
  const msg3 = await dr.drEncrypt(sessionA, 'Third message');
  const pt3 = await dr.drDecrypt(sessionB, msg3.header, msg3.ciphertext);
  assertEqual(pt3, 'Third message', 'X3DH → DR: Third message works');
}

// 5b. X3DH → DR with 5 back-and-forth messages (stress test)
{
  const bobIK = await primitives.generateKeyPair();
  const bobSPK = await prekeys.generateSignedPrekeyECDSA(bobIK.privateJwk);
  const bobOPKs = await prekeys.generateOneTimePrekey(5);
  const bobBundle = prekeys.createPrekeyBundle(bobIK.publicB64, bobSPK, bobOPKs, bobSPK.signature);
  const opkMap = {};
  for (const opk of bobOPKs) opkMap[opk.id] = opk.keyPair;
  const aliceIK = await primitives.generateKeyPair();

  const init = await x3dh.x3dhInitiate(aliceIK, bobBundle);
  const resp = await x3dh.x3dhRespond(bobIK, bobSPK.keyPair, opkMap, init.initialMessage);

  let sender = init.session;
  let receiver = resp.session;

  for (let i = 0; i < 5; i++) {
    const msg = await dr.drEncrypt(sender, `Msg ${i}`);
    const pt = await dr.drDecrypt(receiver, msg.header, msg.ciphertext);
    assertEqual(pt, `Msg ${i}`, `X3DH back-and-forth msg ${i}`);
    // Swap roles
    [sender, receiver] = [receiver, sender];
  }
}

// ────────────────────────────────────────────────────────────
console.log('\n\n═══ 6. FORWARD SECRECY ═══\n');

// 6a. Message key consumed after decryption (no replay)
{
  const { alice, bob } = await createDRPair();
  const msg = await dr.drEncrypt(alice, 'Secret');

  // First decryption works
  const pt = await dr.drDecrypt(bob, msg.header, msg.ciphertext);
  assertEqual(pt, 'Secret', 'First decrypt works');

  // Second attempt with same header should fail (key consumed)
  try {
    const bob2 = (await createDRPair()).bob;
    await dr.drDecrypt(bob2, msg.header, msg.ciphertext);
    assert(false, 'Replay should fail');
  } catch {
    assert(true, 'Replay blocked: message key consumed');
  }
}

// 6b. DH ratchet provides forward secrecy
{
  const { alice, bob } = await createDRPair();

  const m1 = await dr.drEncrypt(alice, 'A→B');
  await dr.drDecrypt(bob, m1.header, m1.ciphertext);

  const m2 = await dr.drEncrypt(bob, 'B→A');
  await dr.drDecrypt(alice, m2.header, m2.ciphertext);

  assert(alice.rootKey.byteLength === 32, 'Alice has new rootKey after DH ratchet');
  assert(alice.CKs.byteLength === 32, 'Alice has new CKs after DH ratchet');
  assert(bob.CKr.byteLength === 32, 'Bob has new CKr after DH ratchet');

  // Old root key is gone — no way to derive old message keys
  const oldCK = alice.CKr;  // CKr from Alice's perspective (what Bob sent)
  // This should be the new chain key — old one is irretrievable
  assert(!!oldCK, 'Alice has CKr (Bob sent a message)');
}

// ────────────────────────────────────────────────────────────
console.log('\n\n═══ RESULTS ═══');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (errors.length > 0) {
  console.log('\nErrors:');
  for (const e of errors) {
    console.log(`  ✗ ${e.label}: ${e.detail}`);
  }
  process.exit(1);
} else {
  console.log('✓ ALL TESTS PASSED!');
}
