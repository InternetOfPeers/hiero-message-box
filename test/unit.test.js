/**
 * Unit tests for formatMessage()
 *
 * These tests are fully offline: no Hedera connection is required.
 * They exercise all four exit paths of the formatMessage() function:
 *
 *   1. HIP-1334_ENCRYPTED_MESSAGE  → decryption succeeds
 *   2. HIP-1334_ENCRYPTED_MESSAGE  → decryption fails  (cannot decrypt)
 *   3. payload.type = HIP-1334_PUBLIC_KEY
 *   4. Fallback plain-text
 *
 * Run with: node test/unit.test.js
 */

const nodeCrypto = require('crypto');
const { encryptMessage } = require('../src/lib/crypto');
const { formatMessage } = require('../src/lib/message-box');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const assert = (condition, message) => {
  if (!condition) throw new Error(`❌ Assertion failed: ${message}`);
};

const testPassed = name => console.log(`✅ ${name}`);

/** Build a mock HCS message object whose .message field is base64(JSON.stringify(content)) */
function makeMsg(content, seqNum = 1) {
  return {
    message: Buffer.from(JSON.stringify(content)).toString('base64'),
    consensus_timestamp: '1741219200.000000000',
    payer_account_id: '0.0.12345',
    sequence_number: seqNum,
  };
}

/** Build a mock HCS message object whose .message field is base64(rawString) (non-JSON) */
function makeMsgRaw(raw, seqNum = 1) {
  return {
    message: Buffer.from(raw, 'utf8').toString('base64'),
    consensus_timestamp: '1741219200.000000000',
    payer_account_id: '0.0.12345',
    sequence_number: seqNum,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/** Exit 1: encrypted message that can be successfully decrypted */
function testEncryptedMessageSuccess() {
  const name = 'formatMessage – encrypted message (decryption succeeds)';

  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const plaintext = 'Hello unit test!';
  const encryptedData = encryptMessage(plaintext, publicKey);

  const msg = makeMsg(
    { type: 'HIP-1334_ENCRYPTED_MESSAGE', format: 'json', data: encryptedData },
    2
  );

  const result = formatMessage(msg, privateKey, 'RSA');

  assert(result.includes('Encrypted message from'), 'Should say "Encrypted message from"');
  assert(!result.includes('(cannot decrypt)'), 'Should NOT contain "(cannot decrypt)"');
  assert(result.includes(plaintext), 'Should contain the decrypted plaintext');
  assert(result.includes('[Seq: 2]'), 'Should include sequence number');

  testPassed(name);
}

/** Exit 2: encrypted message structure but decryption fails */
function testEncryptedMessageCannotDecrypt() {
  const name = 'formatMessage – encrypted message (cannot decrypt)';

  // Encrypt with one key but try to decrypt with a completely different key
  const { publicKey: pubKey1 } = nodeCrypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const { privateKey: privKey2 } = nodeCrypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const encryptedData = encryptMessage('secret', pubKey1);

  const msg = makeMsg(
    { type: 'HIP-1334_ENCRYPTED_MESSAGE', format: 'json', data: encryptedData },
    3
  );

  const result = formatMessage(msg, privKey2, 'RSA');

  assert(result.includes('Encrypted message from'), 'Should say "Encrypted message from"');
  assert(result.includes('(cannot decrypt)'), 'Should contain "(cannot decrypt)"');
  assert(result.includes('[Seq: 3]'), 'Should include sequence number');

  testPassed(name);
}

/** Exit 3: public key announcement message */
function testPublicKeyMessage() {
  const name = 'formatMessage – public key message';

  const { publicKey: rsaPublicKey } = nodeCrypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const content = {
    payload: {
      type: 'HIP-1334_PUBLIC_KEY',
      publicKey: rsaPublicKey,
      encryptionType: 'RSA',
    },
    proof: {
      accountId: '0.0.99999',
      signerPublicKey: 'deadbeef',
      signerKeyType: 'ED25519',
      signature: 'fakesig',
    },
  };

  const msg = makeMsg(content, 1);

  // privateKey is irrelevant for this path; pass null to verify it isn't used
  const result = formatMessage(msg, null, 'RSA');

  assert(result.includes('Public key'), 'Should say "Public key"');
  assert(result.includes('(RSA)'), 'Should include encryptionType');
  assert(result.includes('published by'), 'Should say "published by"');
  assert(!result.includes('Encrypted message'), 'Should NOT say "Encrypted message"');
  assert(!result.includes('Plain text message'), 'Should NOT say "Plain text message"');
  assert(result.includes('[Seq: 1]'), 'Should include sequence number');

  testPassed(name);
}

/** Exit 4: plain-text / unrecognised content */
function testPlainTextMessage() {
  const name = 'formatMessage – plain text message';

  const raw = 'Just a plain string, not JSON at all!';
  const msg = makeMsgRaw(raw, 5);

  const result = formatMessage(msg, null, 'RSA');

  assert(result.includes('Plain text message from'), 'Should say "Plain text message from"');
  assert(result.includes(raw), 'Should contain the raw content');
  assert(!result.includes('Encrypted message'), 'Should NOT say "Encrypted message"');
  assert(!result.includes('Public key'), 'Should NOT say "Public key"');
  assert(result.includes('[Seq: 5]'), 'Should include sequence number');

  testPassed(name);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

(function run() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  HIERO MESSAGE BOX - UNIT TESTS');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    testEncryptedMessageSuccess();
    testEncryptedMessageCannotDecrypt();
    testPublicKeyMessage();
    testPlainTextMessage();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ✅ ALL UNIT TESTS PASSED');
    console.log('═══════════════════════════════════════════════════════\n');
    process.exit(0);
  } catch (err) {
    console.error(`\n${err.message}`);
    process.exit(1);
  }
})();
