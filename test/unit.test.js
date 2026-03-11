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
 */

const nodeCrypto = require('crypto');
const { encryptMessage } = require('../src/lib/crypto');
const { formatMessage } = require('../src/lib/format-message');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

describe('formatMessage', () => {
  let publicKey, privateKey;

  beforeAll(() => {
    ({ publicKey, privateKey } = nodeCrypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    }));
  });

  test('Encrypted message decrypted successfully', () => {
    const plaintext = 'Hello unit test!';
    const encryptedData = encryptMessage(plaintext, publicKey);
    const msg = makeMsg(
      { type: 'HIP-1334_ENCRYPTED_MESSAGE', format: 'json', data: encryptedData },
      2
    );

    const result = formatMessage(msg, privateKey, 'RSA');

    expect(result).toContain('Encrypted message from');
    expect(result).not.toContain('(cannot decrypt)');
    expect(result).toContain(plaintext);
    expect(result).toContain('[Seq: 2]');
  });

  test('Encrypted message cannot be decrypted', () => {
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

    expect(result).toContain('Encrypted message from');
    expect(result).toContain('(cannot decrypt)');
    expect(result).toContain('[Seq: 3]');
  });

  test('Public key announcement message correctly decoded', () => {
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
    const result = formatMessage(msg, null, 'RSA');

    expect(result).toContain('Public key');
    expect(result).toContain('(RSA)');
    expect(result).toContain('published by');
    expect(result).not.toContain('Encrypted message');
    expect(result).not.toContain('Plain text message');
    expect(result).toContain('[Seq: 1]');
  });

  test('Plain text / unrecognised message correctly handled', () => {
    const raw = 'Just a plain string, not JSON at all!';
    const msg = makeMsgRaw(raw, 5);

    const result = formatMessage(msg, null, 'RSA');

    expect(result).toContain('Plain text message from');
    expect(result).toContain(raw);
    expect(result).not.toContain('Encrypted message');
    expect(result).not.toContain('Public key');
    expect(result).toContain('[Seq: 5]');
  });
});
