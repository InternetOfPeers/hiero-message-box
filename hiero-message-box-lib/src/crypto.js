'use strict';

// WebCrypto is available as globalThis.crypto.subtle in Node 18+ and browsers.
const subtle = globalThis.crypto.subtle;

const IS_NODE =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

// == PEM helpers (~25 LOC, no external deps) =================================

function pemToDer(pem) {
  const b64 = pem
    .split('\n')
    .filter(l => !l.startsWith('-----') && l.trim().length > 0)
    .join('');
  return Buffer.from(b64, 'base64');
}

function derToPem(derBuffer, label) {
  const b64 = Buffer.from(derBuffer).toString('base64');
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
}

// == Node-only lazy loader ====================================================

function requireNodeCrypto(featureName) {
  if (!IS_NODE) {
    throw new Error(
      `${featureName} is not supported in the browser (Node.js only).`
    );
  }
  return require('crypto');
}

// == RSA key generation =======================================================

/**
 * Generate a new RSA-2048 key pair. Returns PEM strings (SPKI public, PKCS#8 private).
 * Wire-format compatible with the previous Node crypto.generateKeyPairSync output.
 * @returns {Promise<{publicKey: string, privateKey: string}>}
 */
async function generateRSAKeyPair() {
  const keyPair = await subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const [publicKeyDer, privateKeyDer] = await Promise.all([
    subtle.exportKey('spki', keyPair.publicKey),
    subtle.exportKey('pkcs8', keyPair.privateKey),
  ]);

  return {
    publicKey: derToPem(publicKeyDer, 'PUBLIC KEY'),
    privateKey: derToPem(privateKeyDer, 'PRIVATE KEY'),
  };
}

// == RSA encrypt / decrypt ====================================================

/**
 * Encrypt message using hybrid RSA-OAEP + AES-256-CBC.
 * Wire format: { type:'RSA', encryptedKey, iv, encryptedData } (base64 fields).
 * @param {string} message
 * @param {string} publicKeyPem - SPKI PEM
 * @returns {Promise<Object>}
 */
async function encryptMessageRSA(message, publicKeyPem) {
  const publicKeyDer = pemToDer(publicKeyPem);
  const publicCryptoKey = await subtle.importKey(
    'spki',
    publicKeyDer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );

  const aesKeyBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(16));

  const aesKey = await subtle.importKey(
    'raw',
    aesKeyBytes,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  );

  const msgBytes = new TextEncoder().encode(message);
  const [encryptedDataBuf, encryptedKeyBuf] = await Promise.all([
    subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, msgBytes),
    subtle.encrypt({ name: 'RSA-OAEP' }, publicCryptoKey, aesKeyBytes),
  ]);

  return {
    type: 'RSA',
    encryptedKey: Buffer.from(encryptedKeyBuf).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    encryptedData: Buffer.from(encryptedDataBuf).toString('base64'),
  };
}

/**
 * Decrypt message using hybrid RSA-OAEP + AES-256-CBC.
 * @param {Object} encryptedData - { encryptedKey, iv, encryptedData }
 * @param {string} privateKeyPem - PKCS#8 PEM
 * @returns {Promise<string>}
 */
async function decryptMessageRSA(encryptedData, privateKeyPem) {
  if (
    !encryptedData ||
    !encryptedData.encryptedKey ||
    !encryptedData.encryptedData
  ) {
    throw new Error('Unsupported encryption format');
  }

  const keyStr =
    typeof privateKeyPem === 'string' ? privateKeyPem : privateKeyPem.key;
  const privateKeyDer = pemToDer(keyStr);
  const privateCryptoKey = await subtle.importKey(
    'pkcs8',
    privateKeyDer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );

  const encryptedKeyBytes = Buffer.from(encryptedData.encryptedKey, 'base64');
  const aesKeyBytes = await subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateCryptoKey,
    encryptedKeyBytes
  );

  const aesKey = await subtle.importKey(
    'raw',
    aesKeyBytes,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const ciphertext = Buffer.from(encryptedData.encryptedData, 'base64');

  const plainBuf = await subtle.decrypt(
    { name: 'AES-CBC', iv },
    aesKey,
    ciphertext
  );
  return new TextDecoder().decode(plainBuf);
}

// == ECIES encrypt / decrypt (Node-only) =====================================

/**
 * Encrypt using ECIES (secp256k1 only). Node.js only — throws in browser.
 * @param {string} message
 * @param {string} publicKeyHex
 * @param {string} curve - only 'secp256k1' supported
 * @returns {Object}
 */
function encryptMessageECIES(message, publicKeyHex, curve = 'secp256k1') {
  const crypto = requireNodeCrypto('ECIES encryption');
  try {
    if (curve !== 'secp256k1') {
      throw new Error(
        `Only secp256k1 is supported for ECIES. Received: ${curve}. ` +
          `ED25519 cannot be used for ECDH key exchange.`
      );
    }

    const ephemeralKeyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'secp256k1',
    });

    const ecdh = crypto.createECDH('secp256k1');
    const ephemeralPrivateKeyDer = ephemeralKeyPair.privateKey.export({
      type: 'sec1',
      format: 'der',
    });

    const privKeyOffset =
      ephemeralPrivateKeyDer.indexOf(Buffer.from([0x04, 0x20])) + 2;
    const ephemeralPrivKeyRaw = ephemeralPrivateKeyDer.slice(
      privKeyOffset,
      privKeyOffset + 32
    );
    ecdh.setPrivateKey(ephemeralPrivKeyRaw);

    const recipientPubKeyBuffer = Buffer.from(publicKeyHex, 'hex');
    const sharedSecret = ecdh.computeSecret(recipientPubKeyBuffer);

    const encryptionKey = crypto
      .createHash('sha256')
      .update(sharedSecret)
      .digest();

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    let encryptedMessage = cipher.update(message, 'utf8', 'base64');
    encryptedMessage += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    const ephemeralPublicKey = ecdh.getPublicKey('hex', 'compressed');

    return {
      ephemeralPublicKey,
      iv: iv.toString('base64'),
      encryptedData: encryptedMessage,
      authTag: authTag.toString('base64'),
      curve,
    };
  } catch (error) {
    throw new Error(`ECIES encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt using ECIES. Node.js only — throws in browser.
 * @param {Object} encryptedData
 * @param {string} privateKeyHex
 * @param {string} curve
 * @returns {string}
 */
function decryptMessageECIES(
  encryptedData,
  privateKeyHex,
  curve = 'secp256k1'
) {
  const crypto = requireNodeCrypto('ECIES decryption');
  try {
    const {
      ephemeralPublicKey,
      iv,
      encryptedData: ciphertext,
      authTag,
    } = encryptedData;

    if (curve !== 'secp256k1') {
      throw new Error(
        `Only secp256k1 is supported for ECIES. Received: ${curve}.`
      );
    }

    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(Buffer.from(privateKeyHex, 'hex'));

    const sharedSecret = ecdh.computeSecret(
      Buffer.from(ephemeralPublicKey, 'hex')
    );
    const encryptionKey = crypto
      .createHash('sha256')
      .update(sharedSecret)
      .digest();

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey,
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    return (
      decipher.update(ciphertext, 'base64', 'utf8') + decipher.final('utf8')
    );
  } catch (error) {
    throw new Error(`ECIES decryption failed: ${error.message}`);
  }
}

// == Unified encrypt / decrypt ================================================

/**
 * Encrypt a message. Detects RSA or ECIES from publicKey type.
 * @param {string} message
 * @param {string|Object} publicKey - PEM string for RSA, {type:'ECIES',key,curve} for ECIES
 * @returns {Promise<Object>}
 */
async function encryptMessage(message, publicKey) {
  if (typeof publicKey === 'object' && publicKey.type === 'ECIES') {
    return {
      type: 'ECIES',
      ...encryptMessageECIES(
        message,
        publicKey.key,
        publicKey.curve || 'secp256k1'
      ),
    };
  } else if (
    typeof publicKey === 'string' &&
    publicKey.startsWith('-----BEGIN')
  ) {
    return encryptMessageRSA(message, publicKey);
  } else {
    throw new Error('Unsupported public key format for encryption');
  }
}

/**
 * Decrypt a message. Detects RSA or ECIES from encryptedData.type.
 * @param {Object} encryptedData
 * @param {string|Object} privateKey
 * @returns {Promise<string>}
 */
async function decryptMessage(encryptedData, privateKey) {
  if (encryptedData.type === 'ECIES') {
    const keyStr = typeof privateKey === 'object' ? privateKey.key : privateKey;
    const curve =
      (typeof privateKey === 'object' && privateKey.curve) || 'secp256k1';
    return decryptMessageECIES(encryptedData, keyStr, curve);
  } else if (encryptedData.type === 'RSA' || encryptedData.encryptedKey) {
    return decryptMessageRSA(
      encryptedData,
      typeof privateKey === 'string' ? privateKey : privateKey.key
    );
  } else {
    throw new Error('Unsupported encryption format');
  }
}

// == DER helpers for signing/verification =====================================

function createED25519PrivateKeyDER(privateKeyBuffer) {
  const derPrefix = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
  ]);
  return Buffer.concat([derPrefix, privateKeyBuffer]);
}

function createECDSAPrivateKeyDER(privateKeyBuffer, publicKeyBuffer) {
  const derPrefix = Buffer.from([0x30, 0x74, 0x02, 0x01, 0x01, 0x04, 0x20]);
  const curveOid = Buffer.from([
    0xa0, 0x07, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a,
  ]);
  const publicKeyPart = Buffer.concat([
    Buffer.from([0xa1, 0x44, 0x03, 0x42, 0x00]),
    publicKeyBuffer,
  ]);
  return Buffer.concat([derPrefix, privateKeyBuffer, curveOid, publicKeyPart]);
}

function createED25519PublicKeyDER(publicKeyBuffer) {
  const derPrefix = Buffer.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);
  return Buffer.concat([derPrefix, publicKeyBuffer]);
}

function createECDSAPublicKeyDER(publicKeyBuffer) {
  const keyLength = publicKeyBuffer.length;
  const algorithmIdLength = 18;
  const bitStringHeaderLength = 3;
  const sequenceContentLength =
    algorithmIdLength + bitStringHeaderLength + keyLength;
  return Buffer.concat([
    Buffer.from([0x30, sequenceContentLength]),
    Buffer.from([
      0x30, 0x10, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06,
      0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a,
    ]),
    Buffer.from([0x03, keyLength + 1, 0x00]),
    publicKeyBuffer,
  ]);
}

// == Sign / verify ============================================================

/**
 * Sign a message. ED25519 uses WebCrypto (isomorphic). ECDSA uses Node crypto (Node-only).
 * @param {string} message
 * @param {string} privateKeyHex - 32-byte raw key in hex
 * @param {string} keyType - 'ED25519' or 'ECDSA_SECP256K1'
 * @returns {Promise<string>} Signature in hex
 */
async function signMessage(message, privateKeyHex, keyType) {
  const messageBuffer = Buffer.from(message, 'utf8');
  const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');

  if (keyType === 'ED25519') {
    const derKey = createED25519PrivateKeyDER(privateKeyBuffer);
    const key = await subtle.importKey(
      'pkcs8',
      derKey,
      { name: 'Ed25519' },
      false,
      ['sign']
    );
    const sig = await subtle.sign({ name: 'Ed25519' }, key, messageBuffer);
    return Buffer.from(sig).toString('hex');
  } else if (keyType === 'ECDSA_SECP256K1') {
    const crypto = requireNodeCrypto('ECDSA secp256k1 signing');
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(privateKeyBuffer);
    const publicKeyBuffer = ecdh.getPublicKey();
    const derKey = createECDSAPrivateKeyDER(privateKeyBuffer, publicKeyBuffer);
    const privateKeyObj = crypto.createPrivateKey({
      key: derKey,
      format: 'der',
      type: 'sec1',
    });
    const signature = crypto.sign('SHA256', messageBuffer, privateKeyObj);
    return signature.toString('hex');
  } else {
    throw new Error(`Unsupported key type for signing: ${keyType}`);
  }
}

/**
 * Verify a message signature. ED25519 uses WebCrypto. ECDSA uses Node crypto (Node-only).
 * @param {string} message
 * @param {string} signatureHex
 * @param {string} publicKeyHex
 * @param {string} keyType - 'ED25519' or 'ECDSA_SECP256K1'
 * @returns {Promise<boolean>}
 */
async function verifySignature(message, signatureHex, publicKeyHex, keyType) {
  const messageBuffer = Buffer.from(message, 'utf8');
  const signatureBuffer = Buffer.from(signatureHex, 'hex');
  const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');

  if (keyType === 'ED25519') {
    const key = await subtle.importKey(
      'raw',
      publicKeyBuffer,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    return subtle.verify(
      { name: 'Ed25519' },
      key,
      signatureBuffer,
      messageBuffer
    );
  } else if (keyType === 'ECDSA_SECP256K1') {
    const crypto = requireNodeCrypto('ECDSA secp256k1 verification');
    const derKey = createECDSAPublicKeyDER(publicKeyBuffer);
    const publicKeyObj = crypto.createPublicKey({
      key: derKey,
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(
      'SHA256',
      messageBuffer,
      publicKeyObj,
      signatureBuffer
    );
  } else {
    throw new Error(`Unsupported key type for verification: ${keyType}`);
  }
}

// == Password-based encryption (for BrowserKeyStore) ==========================

/**
 * Encrypt plaintext with a password using PBKDF2 + AES-256-GCM.
 * Returns a self-contained string: "v1.{salt_b64url}.{iv_b64url}.{ciphertext_b64url}"
 * @param {Uint8Array} plaintext
 * @param {string} password
 * @returns {Promise<string>}
 */
async function encryptWithPassword(plaintext, password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  const toB64url = buf =>
    Buffer.from(buf)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

  return `v1.${toB64url(salt)}.${toB64url(iv)}.${toB64url(ciphertext)}`;
}

/**
 * Decrypt an envelope produced by encryptWithPassword.
 * @param {string} envelope - "v1.{salt_b64url}.{iv_b64url}.{ciphertext_b64url}"
 * @param {string} password
 * @returns {Promise<Uint8Array>}
 */
async function decryptWithPassword(envelope, password) {
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted envelope format');
  }

  const fromB64url = s =>
    Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

  const salt = fromB64url(parts[1]);
  const iv = fromB64url(parts[2]);
  const ciphertext = fromB64url(parts[3]);

  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new Uint8Array(plaintext);
}

// == Exports ==================================================================

module.exports = {
  generateRSAKeyPair,
  encryptMessage,
  decryptMessage,
  encryptMessageRSA,
  decryptMessageRSA,
  encryptMessageECIES,
  decryptMessageECIES,
  signMessage,
  verifySignature,
  encryptWithPassword,
  decryptWithPassword,
};
