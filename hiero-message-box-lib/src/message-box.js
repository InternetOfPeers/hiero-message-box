'use strict';

const {
  encryptMessage,
  decryptMessage,
  signMessage,
  verifySignature,
  generateRSAKeyPair,
} = require('./crypto');
const { encodeCBOR, formatMessage } = require('./format-message');
const { NoopLogger } = require('./adapters/logger');
const { InMemoryKeyStore } = require('./adapters/key-store');
const { createHederaContext } = require('./hedera');

// == Factory ==================================================================

// IMPORTANT: Two-Key System
// -------------------------
// 1. PAYER_PRIVATE_KEY (Operator/Payer): Pays for all Hedera transactions (third-party services to pay for transactions on behalf of users)
// 2. MESSAGE_BOX_OWNER_PRIVATE_KEY (Owner): Signs the first message to prove message box ownership
//
// Verification flow:
// - Owner signs the public key message with MESSAGE_BOX_OWNER_PRIVATE_KEY
// - Signature includes accountId and signer's public key
// - Senders verify signature against account's public key from Mirror Node
// - This proves the account owner authorized the message box, regardless of who paid

/**
 * Create a message box instance bound to the given context.
 *
 * @param {Object} ctx
 * @param {Object} ctx.config - createConfig() result
 * @param {Object} [ctx.keyStore] - KeyStore implementation (default: InMemoryKeyStore)
 * @param {Object} [ctx.logger] - Logger interface (default: NoopLogger)
 * @param {Function|null} [ctx.prompt] - (question:string)=>Promise<boolean>; null = auto-proceed
 * @param {Object|null} [ctx.signer] - WalletConnect signer (optional; when provided no Hedera client is created)
 * @returns {Object} { setupMessageBox, linkMessageBox, removeMessageBox, sendMessage, pollMessages, checkMessages, close }
 */
function createMessageBox(ctx) {
  const {
    config,
    keyStore = new InMemoryKeyStore(),
    logger = NoopLogger,
    prompt: askUser = null,
    signer = null,
  } = ctx;

  if (!signer) {
    if (!config.payerPrivateKey)
      throw new Error(
        'PAYER_PRIVATE_KEY is required when no signer is provided.'
      );
    if (!config.messageBoxOwnerPrivateKey)
      throw new Error(
        'MESSAGE_BOX_OWNER_PRIVATE_KEY is required when no signer is provided.'
      );
  }

  const hedera = createHederaContext(config, logger);
  let _client = null;
  function getClient() {
    if (signer) return null;
    if (!_client) _client = hedera.initializeClient();
    return _client;
  }

  // Per-instance polling state (not module-level)
  let pollingCache = { firstCall: true, lastSequenceNumber: 0 };

  // Current encryption type (may be overridden for ED25519→RSA fallback)
  let effectiveEncryptionType = config.encryptionType;

  // -- Internal helpers -------------------------------------------------------

  async function confirm(question) {
    if (!askUser) return true; // no prompt → auto-proceed
    return askUser(question);
  }

  function canonicalJSON(obj) {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj))
      return '[' + obj.map(item => canonicalJSON(item)).join(',') + ']';
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map(
      key => JSON.stringify(key) + ':' + canonicalJSON(obj[key])
    );
    return '{' + pairs.join(',') + '}';
  }

  // Applies the same message prefix used by hedera_signMessage, so CLI and
  // wallet-connect signatures share a single verifiable convention.
  function hederaSignedPayload(message) {
    return '\x19Hedera Signed Message:\n' + message.length + message;
  }

  function extractMessageBoxIdFromMemo(memo) {
    const match = memo.match(/\[HIP-1334:(0\.0\.\d+)\]/);
    return match ? match[1] : null;
  }

  async function loadOrGenerateKeyPair(encryptionType) {
    if (encryptionType === 'ECIES') {
      return loadECIESKeyPair();
    }
    return loadOrGenerateRSAKeyPair();
  }

  async function loadOrGenerateRSAKeyPair() {
    const existing = await keyStore.loadRSAKeyPair();
    if (existing) {
      logger.debug('⚙ Loading existing RSA key pair');
      logger.log('✓ RSA key pair loaded');
      return existing;
    }
    logger.log('⚙ Generating new RSA key pair...');
    const pair = await generateRSAKeyPair();
    await keyStore.saveRSAKeyPair(pair);
    logger.log('✓ RSA key pair generated');
    return pair;
  }

  async function loadECIESKeyPair() {
    logger.debug(
      '⚙ Deriving ECIES key pair from message box owner credentials'
    );
    const { keyHex, keyType } = hedera.parseHederaPrivateKey(
      config.messageBoxOwnerPrivateKey
    );

    if (keyType !== 'ECDSA_SECP256K1') {
      logger.warn(
        `\n⚠ WARNING: ECIES requires SECP256K1, but your account uses ${keyType}.`
      );
      const answer = await confirm(
        '? Would you like to use RSA encryption instead? (yes/no): '
      );
      if (answer) {
        logger.log('\n⚙ Switching to RSA encryption...');
        effectiveEncryptionType = 'RSA';
        return loadOrGenerateRSAKeyPair();
      }
      throw new Error(
        'ECIES encryption requires a SECP256K1 key. Setup cancelled.'
      );
    }

    const { publicKeyHex } = hedera.derivePublicKeyFromHederaKey(
      config.messageBoxOwnerPrivateKey
    );
    logger.log(`✓ ECIES key pair derived (${keyType})`);
    return {
      publicKey: { type: 'ECIES', key: publicKeyHex, curve: 'secp256k1' },
      privateKey: { type: 'ECIES', key: keyHex, curve: 'secp256k1' },
    };
  }

  async function publishPublicKey(
    messageBoxId,
    publicKey,
    encryptionType,
    accountId
  ) {
    const payload = { type: 'HIP-1334_PUBLIC_KEY', publicKey, encryptionType };
    let publicKeyHex, keyType, signature;

    const canonicalPayload = canonicalJSON(payload);
    if (signer) {
      ({ publicKey: publicKeyHex, keyType } =
        await hedera.getAccountPublicKey(accountId));
      const msgBytes = Buffer.from(canonicalPayload, 'utf8');
      const signerSigs = await signer.sign([msgBytes]);
      signature = Buffer.from(signerSigs[0].signature).toString('hex');
    } else {
      const parsed = hedera.parseHederaPrivateKey(
        config.messageBoxOwnerPrivateKey
      );
      keyType = parsed.keyType;
      ({ publicKeyHex } = hedera.derivePublicKeyFromHederaKey(
        config.messageBoxOwnerPrivateKey
      ));
      signature = await signMessage(
        hederaSignedPayload(canonicalPayload),
        parsed.keyHex,
        keyType
      );
    }

    const firstMessage = JSON.stringify({
      payload,
      proof: {
        accountId,
        signerPublicKey: publicKeyHex,
        signerKeyType: keyType,
        signature,
      },
    });

    await hedera.submitMessageToHCS(
      getClient(),
      messageBoxId,
      firstMessage,
      signer
    );
    logger.log(
      `✓ Public key published with signature (${encryptionType}, ${keyType})`
    );
    logger.log(`  Account: ${accountId}`);
    logger.log(`  Signer public key: ${publicKeyHex.substring(0, 16)}...`);
  }

  async function checkMessageBoxStatus(messageBoxId) {
    try {
      const firstMessage = await hedera.getFirstTopicMessage(messageBoxId);
      if (!firstMessage) return { exists: true, hasPublicKey: false };

      const content = Buffer.from(firstMessage.message, 'base64').toString(
        'utf8'
      );
      try {
        const parsed = JSON.parse(content);
        if (!parsed.payload) return { exists: true, hasPublicKey: false };
        const { payload, proof } = parsed;
        return {
          exists: true,
          hasPublicKey: Boolean(
            payload.type === 'HIP-1334_PUBLIC_KEY' &&
            payload.publicKey &&
            proof &&
            proof.accountId &&
            proof.signerPublicKey &&
            proof.signerKeyType &&
            proof.signature
          ),
        };
      } catch {
        return { exists: true, hasPublicKey: false };
      }
    } catch {
      return { exists: false, hasPublicKey: false };
    }
  }

  async function getPublicKeyFromFirstMessage(message) {
    try {
      const firstMessage = JSON.parse(
        Buffer.from(message, 'base64').toString('utf8')
      );
      if (!firstMessage.payload || !firstMessage.proof) {
        throw new Error('First message does not have the required structure');
      }
      const { payload } = firstMessage;
      if (
        payload.type !== 'HIP-1334_PUBLIC_KEY' ||
        !payload.publicKey ||
        !payload.encryptionType
      ) {
        throw new Error('First message does not contain a valid public key');
      }
      logger.log(
        `✓ Public key retrieved from topic (${payload.encryptionType})`
      );
      if (payload.encryptionType === 'ECIES') {
        if (
          typeof payload.publicKey !== 'object' ||
          payload.publicKey.type !== 'ECIES'
        ) {
          throw new Error('Invalid ECIES public key format');
        }
        const curve = payload.publicKey.curve || 'secp256k1';
        const rawKey = extractRawPublicKey(payload.publicKey.key, curve);
        return { type: 'ECIES', key: rawKey, curve };
      }
      if (payload.encryptionType === 'RSA') {
        if (typeof payload.publicKey !== 'string') {
          throw new Error('Invalid RSA public key format: expected PEM string');
        }
        return payload.publicKey;
      }
      throw new Error(`Unsupported encryption type: ${payload.encryptionType}`);
    } catch (error) {
      throw new Error(`Failed to get public key from topic: ${error.message}`);
    }
  }

  function extractRawPublicKey(keyHex, keyType = 'secp256k1') {
    const keyBuffer = Buffer.from(keyHex, 'hex');
    if (keyBuffer[0] === 0x30) {
      const bitStringIndex = keyBuffer.indexOf(0x03);
      if (bitStringIndex >= 0 && keyBuffer[bitStringIndex + 2] === 0x00) {
        return keyBuffer.subarray(bitStringIndex + 3).toString('hex');
      }
      if (keyType === 'secp256k1' && keyBuffer.length === 45) {
        return keyBuffer.subarray(-33).toString('hex');
      } else if (keyType === 'ed25519' && keyBuffer.length === 44) {
        return keyBuffer.subarray(-32).toString('hex');
      }
      throw new Error('Unable to extract raw key from DER format');
    }
    return keyHex;
  }

  async function verifyKeyPairMatchesTopic(
    messageBoxId,
    privateKey,
    encryptionType
  ) {
    try {
      logger.log('⚙ Getting first message from message box...');
      const response = await hedera.getFirstTopicMessage(messageBoxId);
      if (!response || !response.message)
        throw new Error('No messages found in topic');
      logger.log('✓ First message retrieved');

      const publicKey = await getPublicKeyFromFirstMessage(response.message);
      const topicEncryptionType =
        typeof publicKey === 'object' && publicKey.type === 'ECIES'
          ? 'ECIES'
          : 'RSA';

      if (topicEncryptionType !== encryptionType) {
        logger.log(
          `✗ Encryption type mismatch: topic uses ${topicEncryptionType}, configured for ${encryptionType}`
        );
        return false;
      }

      const testMessage = 'key_verification_test';
      const encrypted = await encryptMessage(testMessage, publicKey);
      const decrypted = await decryptMessage(encrypted, privateKey);
      return decrypted === testMessage;
    } catch (error) {
      logger.log('✗ Key verification failed:', error.message);
      return false;
    }
  }

  async function listenForMessages(
    isFirstPoll,
    topicId,
    privateKey,
    encryptionType,
    cache
  ) {
    try {
      if (isFirstPoll) {
        const latestSeq = await hedera.getLatestSequenceNumber(topicId);
        if (latestSeq) {
          cache.lastSequenceNumber = latestSeq;
          logger.log(`✓ Starting from sequence: ${cache.lastSequenceNumber}\n`);
        }
        return [];
      }

      const newMessages = await hedera.getNewMessages(
        topicId,
        cache.lastSequenceNumber
      );
      const messages = await Promise.all(
        newMessages.map(msg => formatMessage(msg, privateKey, encryptionType))
      );

      newMessages.forEach(msg => {
        const lastSeq = msg._maxSequence || msg.sequence_number;
        if (lastSeq > cache.lastSequenceNumber)
          cache.lastSequenceNumber = lastSeq;
      });

      return messages;
    } catch (error) {
      logger.error('Error polling:', error.message);
      return [];
    }
  }

  // -- Public methods ---------------------------------------------------------

  /**
   * Set up the message box for the owner account defined in config.
   * @returns {Promise<{success:boolean, messageBoxId:string}>}
   */
  async function setupMessageBox() {
    const accountId = config.messageBoxOwnerAccountId;
    let enc = effectiveEncryptionType;
    const { publicKey, privateKey } = await loadOrGenerateKeyPair(enc);
    enc = effectiveEncryptionType; // may have been updated (ECIES→RSA fallback)

    const ownerPrivateKey = config.messageBoxOwnerPrivateKey;
    const accountMemo = await hedera.getAccountMemo(accountId);
    logger.debug(`✓ Current account memo: "${accountMemo}"`);

    let needsNewMessageBox = true;
    const messageBoxId = extractMessageBoxIdFromMemo(accountMemo);

    if (messageBoxId) {
      logger.log(
        `✓ Found existing message box ${messageBoxId} for account ${accountId}`
      );
      const status = await checkMessageBoxStatus(messageBoxId);

      if (status.exists && !status.hasPublicKey) {
        logger.warn(
          `\n⚠ WARNING: Message box ${messageBoxId} exists but has invalid format!`
        );
        const confirmed = await confirm('? Create new message box? (yes/no): ');
        if (!confirmed) {
          throw new Error('Setup cancelled by user.');
        }
      } else if (status.exists && status.hasPublicKey) {
        const keysMatch = await verifyKeyPairMatchesTopic(
          messageBoxId,
          privateKey,
          enc
        );
        if (!keysMatch) {
          logger.warn(
            `\n⚠ WARNING: Your keys cannot decrypt messages for message box ${messageBoxId}!`
          );
          const confirmed = await confirm(
            '? Create new message box? (yes/no): '
          );
          if (!confirmed) {
            throw new Error(
              'Messages in the message box cannot be decrypted. Setup cancelled.'
            );
          }
        } else {
          logger.log(
            `✓ Existing message box ${messageBoxId} is valid and keys match.`
          );
          needsNewMessageBox = false;
        }
      }
    }

    if (needsNewMessageBox) {
      const result = await hedera.createTopic(
        getClient(),
        `[HIP-1334:${accountId}] ${accountId} listens here for HIP-1334 encrypted messages.`,
        ownerPrivateKey,
        signer
      );
      if (!result.success)
        throw new Error(`Failed to create new message box: ${result.error}`);

      const newMessageBoxId = result.topicId;
      await publishPublicKey(newMessageBoxId, publicKey, enc, accountId);
      await hedera.updateAccountMemo(
        getClient(),
        accountId,
        `[HIP-1334:${newMessageBoxId}] If you want to contact me, send HIP-1334 encrypted messages to ${newMessageBoxId}.`,
        ownerPrivateKey,
        signer
      );
      logger.log(
        `✓ Message box ${newMessageBoxId} set up correctly for account ${accountId} (encryption: ${enc})`
      );
      return { success: true, messageBoxId: newMessageBoxId };
    }

    logger.log(
      `✓ Message box ${messageBoxId} already set up correctly for account ${accountId}`
    );
    return { success: true, messageBoxId };
  }

  /**
   * Link an existing topic as message box for the given account.
   * @param {string} accountId
   * @param {string} topicId
   * @returns {Promise<{success:boolean, messageBoxId:string, alreadyLinked:boolean}>}
   */
  async function linkMessageBox(accountId, topicId) {
    const currentMemo = await hedera.getAccountMemo(accountId);
    logger.debug(`✓ Current account memo: "${currentMemo}"`);
    const currentBoxId = extractMessageBoxIdFromMemo(currentMemo);
    if (currentBoxId === topicId) {
      logger.log(
        `✓ Account ${accountId} is already linked to message box ${topicId}`
      );
      return { success: true, messageBoxId: topicId, alreadyLinked: true };
    }

    const status = await checkMessageBoxStatus(topicId);
    if (!status.exists)
      throw new Error(`Topic ${topicId} does not exist or is inaccessible`);
    if (!status.hasPublicKey)
      throw new Error(
        `Topic ${topicId} exists but does not have a valid public key message`
      );

    const firstMessage = await hedera.getFirstTopicMessage(topicId);
    const content = Buffer.from(firstMessage.message, 'base64').toString(
      'utf8'
    );
    const parsed = JSON.parse(content);
    if (!parsed.proof || !parsed.proof.accountId) {
      throw new Error(
        `Topic ${topicId} does not contain a valid ownership proof`
      );
    }
    if (parsed.proof.accountId !== accountId) {
      throw new Error(
        `Topic ${topicId} is configured for account ${parsed.proof.accountId}, not ${accountId}`
      );
    }

    const ownerPrivateKey = config.messageBoxOwnerPrivateKey;
    const result = await hedera.updateAccountMemo(
      getClient(),
      accountId,
      `[HIP-1334:${topicId}] If you want to contact me, send HIP-1334 encrypted messages to ${topicId}.`,
      ownerPrivateKey,
      signer
    );
    if (!result.success)
      throw new Error(`Failed to link message box: ${result.error}`);

    logger.log(
      `✓ Account ${accountId} linked to existing message box ${topicId}`
    );
    return { success: true, messageBoxId: topicId, alreadyLinked: false };
  }

  /**
   * Remove the message box by clearing the account memo.
   * @param {string} accountId
   * @returns {Promise<{success:boolean}>}
   */
  async function removeMessageBox(accountId) {
    const accountMemo = await hedera.getAccountMemo(accountId);
    if (accountMemo === '') {
      logger.log(`✓ No message box configured for account ${accountId}`);
      return { success: true };
    }
    const ownerPrivateKey = config.messageBoxOwnerPrivateKey;
    const result = await hedera.updateAccountMemo(
      getClient(),
      accountId,
      '',
      ownerPrivateKey,
      signer
    );
    logger.log(
      result.success
        ? `✓ Message box removed for account ${accountId}`
        : `✗ Failed to remove message box for account ${accountId}`
    );
    return result.success
      ? { success: true }
      : { success: false, error: result.error };
  }

  /**
   * Send an encrypted message to the recipient's message box.
   * @param {string} recipientAccountId
   * @param {string} message
   * @param {Object} [options]
   * @param {boolean} [options.useCBOR=false]
   * @returns {Promise<void>}
   */
  async function sendMessage(recipientAccountId, message, options = {}) {
    if (!(await hedera.isValidAccount(recipientAccountId))) {
      throw new Error(
        `${recipientAccountId} is not a valid Hedera account. Please note you need to specify an account with a message box configured.`
      );
    }

    logger.log(`⚙ Sending message to account ${recipientAccountId}...`);
    const { useCBOR = false } = options;

    const accountMemo = await hedera.getAccountMemo(recipientAccountId);
    logger.debug(`✓ Account memo: "${accountMemo}"`);

    const messageBoxId = extractMessageBoxIdFromMemo(accountMemo);
    if (!messageBoxId)
      throw new Error(
        `Message box ID not found for account ${recipientAccountId}`
      );
    logger.log(`✓ Message box ID: ${messageBoxId}`);

    logger.log('⚙ Getting first message from message box...');
    const response = await hedera.getFirstTopicMessage(messageBoxId);
    if (!response || !response.message)
      throw new Error('No messages found in topic');
    logger.log('✓ First message retrieved');

    const firstMessage = JSON.parse(
      Buffer.from(response.message, 'base64').toString('utf8')
    );

    logger.log('⚙ Verifying message box ownership via signature...');

    if (!firstMessage.payload || !firstMessage.proof) {
      throw new Error(
        '⚠ SECURITY WARNING: First message does not have the required structure!\n' +
          '  Expected: { payload: {...}, proof: {...} }\n' +
          '  This message box may be using an old format or could be fraudulent.\n' +
          '  Refusing to send message for security reasons.'
      );
    }

    const { payload, proof } = firstMessage;

    if (
      !proof.signature ||
      !proof.signerPublicKey ||
      !proof.signerKeyType ||
      !proof.accountId
    ) {
      throw new Error(
        '⚠ SECURITY WARNING: First message proof does not contain required fields!\n' +
          '  Refusing to send message for security reasons.'
      );
    }

    if (proof.accountId !== recipientAccountId) {
      throw new Error(
        `⚠ SECURITY WARNING: Message box ${messageBoxId} is for account ${proof.accountId}, not ${recipientAccountId}!\n` +
          `  Refusing to send message for security reasons.`
      );
    }

    const { publicKey: recipientPublicKey } =
      await hedera.getAccountPublicKey(recipientAccountId);

    if (proof.signerPublicKey !== recipientPublicKey) {
      throw new Error(
        `⚠ SECURITY WARNING: Message box ${messageBoxId} was NOT signed by account ${recipientAccountId}!\n` +
          `  Expected public key: ${recipientPublicKey}\n` +
          `  Signer public key: ${proof.signerPublicKey}\n` +
          `  Refusing to send message for security reasons.`
      );
    }

    const isValid = await verifySignature(
      hederaSignedPayload(canonicalJSON(payload)),
      proof.signature,
      proof.signerPublicKey,
      proof.signerKeyType
    );

    if (!isValid) {
      throw new Error(
        '⚠ SECURITY WARNING: Signature verification failed!\n' +
          '  The first message signature is invalid.\n' +
          '  Refusing to send message for security reasons.'
      );
    }

    logger.log('✓ Message box ownership verified via signature');
    logger.log(`  Account: ${proof.accountId}`);
    logger.log(`  Verified with public key from Mirror Node`);

    const publicKey = payload.publicKey;
    logger.log('⚙ Encrypting message...');
    const encryptedPayload = await encryptMessage(message, publicKey);
    logger.log('✓ Encrypted');
    logger.log(`⚙ Sending to message box ${messageBoxId}...`);

    const messageData = useCBOR
      ? encodeCBOR({
          type: 'HIP-1334_ENCRYPTED_MESSAGE',
          format: 'cbor',
          data: encryptedPayload,
        })
      : JSON.stringify({
          type: 'HIP-1334_ENCRYPTED_MESSAGE',
          format: 'json',
          data: encryptedPayload,
        });

    if (useCBOR) logger.debug('✓ Message encoded with CBOR');

    const result = await hedera.submitMessageToHCS(
      getClient(),
      messageBoxId,
      messageData,
      signer
    );
    if (!result.success)
      throw new Error(`Failed to send message: ${result.error}`);

    logger.log(
      `✓ Encrypted message sent correctly (format: ${useCBOR ? 'CBOR' : 'JSON'}).`
    );
  }

  /**
   * Poll for new messages (call on each interval tick).
   * @param {string} accountId
   * @returns {Promise<string[]>}
   */
  async function pollMessages(accountId) {
    if (pollingCache.firstCall) {
      const { privateKey } = await loadOrGenerateKeyPair(
        effectiveEncryptionType
      );
      pollingCache.privateKey = privateKey;
      pollingCache.encryptionType = effectiveEncryptionType;

      const accountMemo = await hedera.getAccountMemo(accountId);
      logger.debug(`✓ Current account memo: "${accountMemo}"`);

      const messageBoxId = extractMessageBoxIdFromMemo(accountMemo);
      if (!messageBoxId)
        throw new Error(`Message box ID not found for account ${accountId}`);

      pollingCache.messageBoxId = messageBoxId;
      logger.log(
        `✓ Found message box ${messageBoxId} for account ${accountId}`
      );
      pollingCache.firstCall = false;

      return listenForMessages(
        true,
        pollingCache.messageBoxId,
        pollingCache.privateKey,
        pollingCache.encryptionType,
        pollingCache
      );
    }

    return listenForMessages(
      false,
      pollingCache.messageBoxId,
      pollingCache.privateKey,
      pollingCache.encryptionType,
      pollingCache
    );
  }

  /**
   * Check messages in a sequence range.
   * @param {string} accountId
   * @param {number} startSequence
   * @param {number} [endSequence]
   * @returns {Promise<string[]>}
   */
  async function checkMessages(accountId, startSequence, endSequence) {
    const { privateKey } = await loadOrGenerateKeyPair(effectiveEncryptionType);

    const accountMemo = await hedera.getAccountMemo(accountId);
    logger.debug(`✓ Current account memo: "${accountMemo}"`);

    const messageBoxId = extractMessageBoxIdFromMemo(accountMemo);
    if (!messageBoxId)
      throw new Error(`Message box ID not found for account ${accountId}`);

    logger.log(`✓ Found message box ${messageBoxId} for account ${accountId}`);

    const endMsg = endSequence ? ` to ${endSequence}` : ' onwards';
    logger.log(
      `⚙ Fetching messages from sequence ${startSequence}${endMsg}...\n`
    );

    const rawMessages = await hedera.getMessagesInRange(
      messageBoxId,
      startSequence,
      endSequence
    );

    return Promise.all(
      rawMessages.map(msg =>
        formatMessage(msg, privateKey, effectiveEncryptionType)
      )
    );
  }

  return {
    setupMessageBox,
    linkMessageBox,
    removeMessageBox,
    sendMessage,
    pollMessages,
    checkMessages,
    close() {
      if (_client) _client.close();
    },
  };
}

module.exports = { createMessageBox };
