const crypto = require('crypto');

// == Public functions ========================================================

/**
 * Encrypt message using ECIES (Elliptic Curve Integrated Encryption Scheme)
 * Uses ECDH for key exchange, AES-256-GCM for encryption
 * NOTE: Only secp256k1 is supported. ED25519 cannot be used for ECDH.
 * @param {string} message - Message to encrypt
 * @param {string} publicKeyHex - Recipient's public key in hex format
 * @param {string} curve - Elliptic curve to use (only 'secp256k1' supported)
 * @returns {Object} Encrypted data with ephemeral public key, encrypted message, IV, and auth tag
 */
function encryptMessageECIES(message, publicKeyHex, curve = 'secp256k1') {
  try {
    if (curve !== 'secp256k1') {
      throw new Error(
        `Only secp256k1 is supported for ECIES. Received: ${curve}. ` +
          `ED25519 cannot be used for ECDH key exchange.`
      );
    }

    // Generate ephemeral key pair for ECDH
    const ephemeralKeyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'secp256k1',
    });

    // Create ECDH from ephemeral private key
    const ecdh = crypto.createECDH('secp256k1');
    const ephemeralPrivateKeyDer = ephemeralKeyPair.privateKey.export({
      type: 'sec1',
      format: 'der',
    });

    // Extract raw private key (32 bytes) from SEC1 DER format
    const privKeyOffset =
      ephemeralPrivateKeyDer.indexOf(Buffer.from([0x04, 0x20])) + 2;
    const ephemeralPrivKeyRaw = ephemeralPrivateKeyDer.slice(
      privKeyOffset,
      privKeyOffset + 32
    );
    ecdh.setPrivateKey(ephemeralPrivKeyRaw);

    // Compute shared secret with recipient's public key
    // Public key should be 33 bytes (compressed) or 65 bytes (uncompressed)
    const recipientPubKeyBuffer = Buffer.from(publicKeyHex, 'hex');
    const sharedSecret = ecdh.computeSecret(recipientPubKeyBuffer);

    // Derive encryption key from shared secret using SHA-256
    const encryptionKey = crypto
      .createHash('sha256')
      .update(sharedSecret)
      .digest();

    // Encrypt the message with AES-256-GCM
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    let encryptedMessage = cipher.update(message, 'utf8', 'base64');
    encryptedMessage += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    // Get ephemeral public key (compressed format)
    const ephemeralPublicKey = ecdh.getPublicKey('hex', 'compressed');

    return {
      ephemeralPublicKey,
      iv: iv.toString('base64'),
      encryptedData: encryptedMessage,
      authTag: authTag.toString('base64'),
      curve: curve,
    };
  } catch (error) {
    throw new Error(`ECIES encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt message using ECIES
 * NOTE: Only secp256k1 is supported. ED25519 cannot be used for ECDH.
 * @param {Object} encryptedData - Encrypted data object
 * @param {string} privateKeyHex - Recipient's private key in hex format
 * @param {string} curve - Elliptic curve to use (only 'secp256k1' supported)
 * @returns {string} Decrypted message
 */
function decryptMessageECIES(
  encryptedData,
  privateKeyHex,
  curve = 'secp256k1'
) {
  try {
    const {
      ephemeralPublicKey,
      iv,
      encryptedData: ciphertext,
      authTag,
    } = encryptedData;

    if (curve !== 'secp256k1') {
      throw new Error(
        `Only secp256k1 is supported for ECIES. Received: ${curve}. ` +
          `ED25519 cannot be used for ECDH key exchange.`
      );
    }

    // Create ECDH with our private key
    const ecdh = crypto.createECDH('secp256k1');
    const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');
    ecdh.setPrivateKey(privateKeyBuffer);

    // Compute shared secret with ephemeral public key
    const ephemeralPubKeyBuffer = Buffer.from(ephemeralPublicKey, 'hex');
    const sharedSecret = ecdh.computeSecret(ephemeralPubKeyBuffer);

    // Derive encryption key
    const encryptionKey = crypto
      .createHash('sha256')
      .update(sharedSecret)
      .digest();

    // Decrypt with AES-256-GCM
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey,
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`ECIES decryption failed: ${error.message}`);
  }
}

/**
 * Encrypt message using hybrid encryption (AES + RSA) or ECIES
 * Automatically detects encryption type from publicKey format or environment
 * @param {string} message - Message to encrypt
 * @param {string|Object} publicKey - Public key (PEM for RSA, hex/object for ECIES)
 * @returns {Object} Encrypted data
 */
function encryptMessage(message, publicKey) {
  // Detect encryption type based on publicKey format
  if (typeof publicKey === 'object' && publicKey.type === 'ECIES') {
    // ECIES encryption
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
    // RSA encryption (existing implementation)
    return encryptMessageRSA(message, publicKey);
  } else {
    throw new Error('Unsupported public key format for encryption');
  }
}

/**
 * Encrypt message using hybrid encryption (AES + RSA) - original implementation
 * 1. Generate AES key
 * 2. Encrypt message with AES
 * 3. Encrypt AES key with RSA
 */
function encryptMessageRSA(message, publicKeyPem) {
  try {
    // Generate random AES-256 key
    const aesKey = crypto.randomBytes(32); // 256 bits
    const iv = crypto.randomBytes(16); // 128 bits IV for AES

    // Encrypt the message with AES
    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
    let encryptedMessage = cipher.update(message, 'utf8', 'base64');
    encryptedMessage += cipher.final('base64');

    // Encrypt the AES key with RSA public key
    const encryptedAesKey = crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      aesKey
    );

    // Return encrypted data as JSON
    return {
      type: 'RSA',
      encryptedKey: encryptedAesKey.toString('base64'),
      iv: iv.toString('base64'),
      encryptedData: encryptedMessage,
    };
  } catch (error) {
    throw new Error(`RSA encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt message using hybrid encryption (RSA + AES) or ECIES
 * Automatically detects encryption type from encryptedData
 * @param {Object} encryptedData - Encrypted data object
 * @param {string|Object} privateKey - Private key (PEM for RSA, hex/object for ECIES)
 * @returns {string} Decrypted message
 */
function decryptMessage(encryptedData, privateKey) {
  // Detect encryption type from encryptedData
  if (encryptedData.type === 'ECIES') {
    // ECIES decryption
    if (typeof privateKey === 'object') {
      return decryptMessageECIES(
        encryptedData,
        privateKey.key,
        privateKey.curve || 'secp256k1'
      );
    } else {
      throw new Error(
        'ECIES decryption requires private key object with key and curve'
      );
    }
  } else if (encryptedData.type === 'RSA' || encryptedData.encryptedKey) {
    // RSA decryption (existing implementation)
    const keyStr = typeof privateKey === 'string' ? privateKey : privateKey.key;
    return decryptMessageRSA(encryptedData, keyStr);
  } else {
    throw new Error('Unsupported encryption format');
  }
}

/**
 * Decrypt message using hybrid encryption (RSA + AES) - original implementation
 */
function decryptMessageRSA(encryptedData, privateKey) {
  // Check if it's hybrid encryption (AES + RSA)
  if (
    typeof encryptedData === 'object' &&
    encryptedData.encryptedKey &&
    encryptedData.encryptedData
  ) {
    try {
      // Decrypt the AES key with RSA
      const encryptedAesKey = Buffer.from(encryptedData.encryptedKey, 'base64');
      const aesKey = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        encryptedAesKey
      );

      // Decrypt the message with AES
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
      return (
        decipher.update(encryptedData.encryptedData, 'base64', 'utf8') +
        decipher.final('utf8')
      );
    } catch (error) {
      throw new Error(`RSA decryption failed: ${error.message}`);
    }
  } else {
    // Error: Unsupported encryption format
    throw new Error('Unsupported encryption format');
  }
}

// == Private functions =======================================================

/**
 * Create DER-encoded PKCS#8 private key for ED25519
 * @param {Buffer} privateKeyBuffer - 32-byte private key
 * @returns {Buffer} DER-encoded private key
 */
function createED25519PrivateKeyDER(privateKeyBuffer) {
  const derPrefix = Buffer.from([
    0x30,
    0x2e, // SEQUENCE, length 46
    0x02,
    0x01,
    0x00, // INTEGER version 0
    0x30,
    0x05, // SEQUENCE, length 5
    0x06,
    0x03,
    0x2b,
    0x65,
    0x70, // OID 1.3.101.112 (Ed25519)
    0x04,
    0x22, // OCTET STRING, length 34
    0x04,
    0x20, // OCTET STRING, length 32 (the actual key)
  ]);
  return Buffer.concat([derPrefix, privateKeyBuffer]);
}

/**
 * Create DER-encoded SEC1 private key for ECDSA secp256k1
 * @param {Buffer} privateKeyBuffer - 32-byte private key
 * @param {Buffer} publicKeyBuffer - 65-byte uncompressed public key
 * @returns {Buffer} DER-encoded private key
 */
function createECDSAPrivateKeyDER(privateKeyBuffer, publicKeyBuffer) {
  const derPrefix = Buffer.from([
    0x30,
    0x74, // SEQUENCE, length 116
    0x02,
    0x01,
    0x01, // INTEGER version 1
    0x04,
    0x20, // OCTET STRING, length 32 (the private key)
  ]);

  const curveOid = Buffer.from([
    0xa0,
    0x07, // Context-specific [0], length 7
    0x06,
    0x05,
    0x2b,
    0x81,
    0x04,
    0x00,
    0x0a, // OID 1.3.132.0.10 (secp256k1)
  ]);

  const publicKeyPart = Buffer.concat([
    Buffer.from([0xa1, 0x44, 0x03, 0x42, 0x00]), // Context-specific [1], BIT STRING
    publicKeyBuffer,
  ]);

  return Buffer.concat([derPrefix, privateKeyBuffer, curveOid, publicKeyPart]);
}

/**
 * Create DER-encoded SPKI public key for ED25519
 * @param {Buffer} publicKeyBuffer - 32-byte public key
 * @returns {Buffer} DER-encoded public key
 */
function createED25519PublicKeyDER(publicKeyBuffer) {
  const derPrefix = Buffer.from([
    0x30,
    0x2a, // SEQUENCE, length 42
    0x30,
    0x05, // SEQUENCE, length 5
    0x06,
    0x03,
    0x2b,
    0x65,
    0x70, // OID 1.3.101.112 (Ed25519)
    0x03,
    0x21,
    0x00, // BIT STRING, length 33, no unused bits
  ]);
  return Buffer.concat([derPrefix, publicKeyBuffer]);
}

/**
 * Create DER-encoded SPKI public key for ECDSA secp256k1
 * @param {Buffer} publicKeyBuffer - 33 or 65 byte public key
 * @returns {Buffer} DER-encoded public key
 */
function createECDSAPublicKeyDER(publicKeyBuffer) {
  const keyLength = publicKeyBuffer.length;
  const algorithmIdLength = 18;
  const bitStringHeaderLength = 3;
  const sequenceContentLength =
    algorithmIdLength + bitStringHeaderLength + keyLength;

  return Buffer.concat([
    Buffer.from([0x30, sequenceContentLength]), // SEQUENCE with total length
    Buffer.from([
      0x30,
      0x10, // SEQUENCE, length 16 (algorithm identifier)
      0x06,
      0x07,
      0x2a,
      0x86,
      0x48,
      0xce,
      0x3d,
      0x02,
      0x01, // OID for EC public key
      0x06,
      0x05,
      0x2b,
      0x81,
      0x04,
      0x00,
      0x0a, // OID for secp256k1 curve
    ]),
    Buffer.from([0x03, keyLength + 1, 0x00]), // BIT STRING tag, length, no unused bits
    publicKeyBuffer,
  ]);
}

/**
 * Sign a message using ED25519 or ECDSA (secp256k1)
 * @param {string} message - Message to sign (will be hashed with SHA-256 for ECDSA)
 * @param {string} privateKeyHex - Private key in hex format (32 bytes)
 * @param {string} keyType - 'ED25519' or 'ECDSA_SECP256K1'
 * @returns {string} Signature in hex format
 */
function signMessage(message, privateKeyHex, keyType) {
  try {
    const messageBuffer = Buffer.from(message, 'utf8');
    const privateKeyBuffer = Buffer.from(privateKeyHex, 'hex');

    if (keyType === 'ED25519') {
      const derKey = createED25519PrivateKeyDER(privateKeyBuffer);
      const privateKeyObj = crypto.createPrivateKey({
        key: derKey,
        format: 'der',
        type: 'pkcs8',
      });
      const signature = crypto.sign(null, messageBuffer, privateKeyObj);
      return signature.toString('hex');
    } else if (keyType === 'ECDSA_SECP256K1') {
      // Derive public key from private key for the DER structure
      const ecdh = crypto.createECDH('secp256k1');
      ecdh.setPrivateKey(privateKeyBuffer);
      const publicKeyBuffer = ecdh.getPublicKey();

      const derKey = createECDSAPrivateKeyDER(
        privateKeyBuffer,
        publicKeyBuffer
      );
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
  } catch (error) {
    throw new Error(`Failed to sign message: ${error.message}`);
  }
}

/**
 * Verify a message signature using ED25519 or ECDSA (secp256k1)
 * @param {string} message - Original message that was signed
 * @param {string} signatureHex - Signature in hex format
 * @param {string} publicKeyHex - Public key in hex format
 * @param {string} keyType - 'ED25519' or 'ECDSA_SECP256K1'
 * @returns {boolean} True if signature is valid
 */
function verifySignature(message, signatureHex, publicKeyHex, keyType) {
  try {
    const messageBuffer = Buffer.from(message, 'utf8');
    const signatureBuffer = Buffer.from(signatureHex, 'hex');
    const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');
    if (keyType === 'ED25519') {
      const derKey = createED25519PublicKeyDER(publicKeyBuffer);

      const publicKeyObj = crypto.createPublicKey({
        key: derKey,
        format: 'der',
        type: 'spki',
      });

      // Verify the signature (ED25519 doesn't pre-hash)
      return crypto.verify(null, messageBuffer, publicKeyObj, signatureBuffer);
    } else if (keyType === 'ECDSA_SECP256K1') {
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
  } catch (error) {
    throw new Error(`Failed to verify signature: ${error.message}`);
  }
}

// == Exports =================================================================

module.exports = {
  encryptMessage,
  decryptMessage,
  signMessage,
  verifySignature,
};
