'use strict';

const {
  TopicCreateTransaction,
  Client,
  AccountId,
  PrivateKey,
  PublicKey,
  AccountUpdateTransaction,
  TopicMessageSubmitTransaction,
  TransactionReceiptQuery,
} = require('@hiero-ledger/sdk');

const { NoopLogger } = require('./adapters/logger');

// == Private helpers ==========================================================

function isTransactionSuccessful(receipt) {
  return receipt.status.toString() === 'SUCCESS';
}

async function executeAndGetReceipt(transaction, client, signer) {
  if (signer) {
    // executeWithSigner / getReceiptWithSigner don't exist in the browser SDK.
    // Use DAppSigner.call() which sends hedera_signAndExecuteTransaction, then
    // fetch the receipt through a separate TransactionReceiptQuery (free query,
    // handled by DAppSigner with its own local Hedera client).
    const tx = await signer.call(transaction);
    return signer.call(
      new TransactionReceiptQuery().setTransactionId(tx.transactionId)
    );
  }
  return transaction.execute(client).then(tx => tx.getReceipt(client));
}

async function signWithOwnerKey(
  transaction,
  client,
  ownerPrivateKeyDer,
  signer
) {
  if (signer) {
    // Set a transaction ID so the wallet can sign; the wallet handles freezing.
    await signer.populateTransaction(transaction);
    return;
  }
  if (ownerPrivateKeyDer) {
    const ownerPrivateKey = PrivateKey.fromStringDer(ownerPrivateKeyDer);
    await transaction.freezeWith(client);
    transaction.sign(ownerPrivateKey);
  }
}

function getHederaKeyType(key) {
  return key.type === 'secp256k1' ? 'ECDSA_SECP256K1' : 'ED25519';
}

// == Key parsing ==============================================================

/**
 * Parse a DER private key and return keyType, raw bytes, and hex.
 * @param {string} derPrivateKey
 * @returns {{keyType:string, keyBytes:Buffer, keyHex:string, hederaPrivateKey:PrivateKey}}
 */
function parseHederaPrivateKey(derPrivateKey) {
  try {
    const privateKey = PrivateKey.fromStringDer(derPrivateKey);
    const keyType = getHederaKeyType(privateKey);
    const rawKeyBytes = Buffer.from(privateKey.toBytesRaw());
    return {
      keyType,
      keyBytes: rawKeyBytes,
      keyHex: rawKeyBytes.toString('hex'),
      hederaPrivateKey: privateKey,
    };
  } catch (error) {
    throw new Error(`Failed to parse Hedera private key: ${error.message}`);
  }
}

/**
 * Derive the public key (raw bytes + type) from a DER private key.
 * @param {string} derPrivateKey
 * @returns {{publicKeyHex:string, keyType:string, hederaPublicKey:any}}
 */
function derivePublicKeyFromHederaKey(derPrivateKey) {
  try {
    const privateKey = PrivateKey.fromStringDer(derPrivateKey);
    const publicKey = privateKey.publicKey;
    const keyType = getHederaKeyType(privateKey);
    const publicKeyBytes = Buffer.from(publicKey.toBytesRaw());
    return {
      publicKeyHex: publicKeyBytes.toString('hex'),
      keyType,
      hederaPublicKey: publicKey,
    };
  } catch (error) {
    throw new Error(`Failed to derive public key: ${error.message}`);
  }
}

// == Context factory ==========================================================

/**
 * Create a Hedera context bound to the given config.
 * All functions use globalThis.fetch for Mirror Node reads.
 *
 * @param {Object} config - createConfig() result
 * @param {Object} [logger] - Logger interface (default: NoopLogger)
 * @returns {Object} Hedera helper functions
 */
function createHederaContext(config, logger = NoopLogger) {
  // -- Mirror Node fetch -------------------------------------------------------

  async function mirrorNodeRequest(endpoint, options = {}) {
    const { resolveOnError = false } = options;
    const url = `${config.mirrorNodeUrl}${endpoint}`;

    try {
      const response = await globalThis.fetch(url);
      let data;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (resolveOnError) {
        return { statusCode: response.status, data };
      }
      return data;
    } catch (error) {
      if (resolveOnError) {
        return { statusCode: null, data: null, error };
      }
      throw new Error(`Mirror Node request failed: ${error.message}`);
    }
  }

  // -- Client init -------------------------------------------------------------

  function initializeClient() {
    const client =
      config.hederaNetwork === 'mainnet'
        ? Client.forMainnet()
        : Client.forTestnet();
    client.setOperator(
      AccountId.fromString(config.payerAccountId),
      PrivateKey.fromStringDer(config.payerPrivateKey)
    );
    logger.debug(`✓ Hedera client initialized (${config.hederaNetwork})`);
    return client;
  }

  // -- Account helpers ---------------------------------------------------------

  async function getAccountMemo(accountId) {
    const response = await mirrorNodeRequest(`/accounts/${accountId}`);
    return response.memo || '';
  }

  async function isValidAccount(accountId) {
    const result = await mirrorNodeRequest(`/accounts/${accountId}`, {
      resolveOnError: true,
    });
    if (result.statusCode === 200 && result.data) {
      return result.data.account && !result.data.deleted;
    }
    return false;
  }

  async function getAccountPublicKey(accountId) {
    try {
      const data = await mirrorNodeRequest(`/accounts/${accountId}`);
      if (!data.key) throw new Error(`No key found for account ${accountId}`);
      const publicKeyHex = data.key.key;
      let keyType;
      if (data.key._type === 'ED25519' || publicKeyHex.length === 64) {
        keyType = 'ED25519';
      } else if (
        data.key._type === 'ECDSA_SECP256K1' ||
        publicKeyHex.length === 66
      ) {
        keyType = 'ECDSA_SECP256K1';
      } else {
        keyType = publicKeyHex.length === 64 ? 'ED25519' : 'ECDSA_SECP256K1';
      }
      return { publicKey: publicKeyHex, keyType };
    } catch (error) {
      throw new Error(
        `Failed to get public key for account ${accountId}: ${error.message}`
      );
    }
  }

  // -- Transaction helpers -----------------------------------------------------

  async function updateAccountMemo(
    client,
    accountId,
    memo,
    ownerPrivateKeyDer = null,
    signer = null
  ) {
    const transaction = new AccountUpdateTransaction()
      .setAccountId(accountId)
      .setAccountMemo(memo);
    await signWithOwnerKey(transaction, client, ownerPrivateKeyDer, signer);
    const receipt = await executeAndGetReceipt(transaction, client, signer);
    const success = isTransactionSuccessful(receipt);
    logger.debug(
      success
        ? `✓ Account ${accountId} updated with memo "${memo}"`
        : `✗ Failed to set memo "${memo}" for account ${accountId}`
    );
    return success
      ? { success: true }
      : { success: false, error: receipt.status.toString() };
  }

  async function createTopic(
    client,
    memo,
    ownerPrivateKeyDer = null,
    signer = null
  ) {
    const adminKey = ownerPrivateKeyDer
      ? PrivateKey.fromStringDer(ownerPrivateKeyDer)
      : null;
    let adminPublicKey;
    if (adminKey) {
      adminPublicKey = adminKey.publicKey;
    } else if (signer) {
      // DAppSigner.getAccountKey() is not implemented; read from Mirror Node
      // (free HTTP call) and convert raw hex to a PublicKey.
      const accountId = signer.getAccountId().toString();
      const { publicKey: pkHex, keyType } =
        await getAccountPublicKey(accountId);
      adminPublicKey =
        keyType === 'ECDSA_SECP256K1'
          ? PublicKey.fromStringECDSA(pkHex)
          : PublicKey.fromStringED25519(pkHex);
    } else {
      adminPublicKey = client.operatorPublicKey;
    }

    const transaction = new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setAdminKey(adminPublicKey);
    await signWithOwnerKey(transaction, client, ownerPrivateKeyDer, signer);
    const receipt = await executeAndGetReceipt(transaction, client, signer);
    const success = isTransactionSuccessful(receipt);
    logger.debug(
      success
        ? `✓ Topic created: ${receipt.topicId}`
        : `✗ Failed to create topic`
    );
    return success
      ? { success: true, topicId: receipt.topicId.toString() }
      : { success: false, error: receipt.status.toString() };
  }

  async function submitMessageToHCS(client, topicId, message, signer = null) {
    const transaction = new TopicMessageSubmitTransaction({ topicId, message });
    const receipt = await executeAndGetReceipt(transaction, client, signer);
    const success = isTransactionSuccessful(receipt);
    logger.debug(
      success
        ? `✓ Message submitted to ${topicId}`
        : `✗ Failed to submit message to ${topicId}`
    );
    return success
      ? { success: true, topicId }
      : { success: false, error: receipt.status.toString() };
  }

  // -- Topic message queries ---------------------------------------------------

  async function queryTopicMessages(topicId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.order) params.append('order', options.order);
    if (options.sequenceNumber && options.operator) {
      params.append(
        'sequencenumber',
        `${options.operator}:${options.sequenceNumber}`
      );
    }
    const queryString = params.toString();
    const endpoint = `/topics/${topicId}/messages${queryString ? `?${queryString}` : ''}`;
    return mirrorNodeRequest(endpoint);
  }

  function reassembleChunkedMessages(messages) {
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    const chunkedGroups = new Map();
    const completeMessages = [];

    messages.forEach(msg => {
      if (!msg || !msg.message) {
        logger.warn('⚠ Skipping invalid message:', msg);
        return;
      }
      if (!msg.chunk_info) {
        completeMessages.push(msg);
        return;
      }
      const txId = msg.chunk_info.initial_transaction_id;
      if (!txId || !txId.account_id || !txId.transaction_valid_start) {
        logger.warn('⚠ Skipping chunk with invalid transaction ID:', msg);
        return;
      }
      const key = `${txId.account_id}-${txId.transaction_valid_start}-${txId.nonce || 0}`;
      const { number: chunkNum, total: chunkTotal } = msg.chunk_info;
      if (!chunkedGroups.has(key)) {
        chunkedGroups.set(key, {
          chunks: new Array(chunkTotal),
          metadata: { ...msg },
          total: chunkTotal,
          minSequence: msg.sequence_number,
          maxSequence: msg.sequence_number,
          hasFirstChunk: chunkNum === 1,
        });
      }
      const group = chunkedGroups.get(key);
      if (chunkNum === 1) group.hasFirstChunk = true;
      group.chunks[chunkNum - 1] = msg.message;
      if (msg.sequence_number < group.minSequence)
        group.minSequence = msg.sequence_number;
      if (msg.sequence_number > group.maxSequence)
        group.maxSequence = msg.sequence_number;
    });

    chunkedGroups.forEach((group, key) => {
      if (!group.hasFirstChunk) {
        logger.warn(
          `⚠ Skipping incomplete chunked message (transaction ${key}): missing first chunk`
        );
        return;
      }
      if (
        !group.chunks ||
        !Array.isArray(group.chunks) ||
        group.chunks.length !== group.total
      ) {
        logger.warn(
          `⚠ Invalid chunk array for transaction ${key}: expected ${group.total} chunks`
        );
        return;
      }
      const allChunksPresent = group.chunks.every(
        c =>
          c !== undefined && c !== null && typeof c === 'string' && c.length > 0
      );
      if (allChunksPresent) {
        try {
          const binaryChunks = group.chunks.map(chunk =>
            Buffer.from(chunk, 'base64')
          );
          const reassembledBase64 =
            Buffer.concat(binaryChunks).toString('base64');
          const reassembledMessage = {
            ...group.metadata,
            message: reassembledBase64,
            sequence_number: group.minSequence,
            _maxSequence: group.maxSequence,
          };
          delete reassembledMessage.chunk_info;
          completeMessages.push(reassembledMessage);
        } catch (error) {
          logger.warn(
            `⚠ Error reassembling chunked message (transaction ${key}):`,
            error.message
          );
        }
      } else {
        const received = group.chunks.filter(
          c =>
            c !== undefined &&
            c !== null &&
            typeof c === 'string' &&
            c.length > 0
        ).length;
        logger.warn(
          `⚠ Incomplete chunked message (transaction ${key}): ${received}/${group.total} chunks`
        );
      }
    });

    return completeMessages.sort(
      (a, b) => a.sequence_number - b.sequence_number
    );
  }

  async function getLatestSequenceNumber(topicId) {
    try {
      const response = await queryTopicMessages(topicId, {
        order: 'desc',
        limit: 1,
      });
      return response.messages?.[0]?.sequence_number || null;
    } catch (error) {
      throw new Error(`Failed to get latest sequence number: ${error.message}`);
    }
  }

  async function getNewMessages(topicId, afterSequenceNumber) {
    try {
      const response = await queryTopicMessages(topicId, {
        sequenceNumber: afterSequenceNumber,
        operator: 'gt',
        order: 'asc',
        limit: 100,
      });
      return reassembleChunkedMessages(response.messages || []);
    } catch (error) {
      throw new Error(`Failed to get new messages: ${error.message}`);
    }
  }

  async function getFirstTopicMessage(topicId) {
    try {
      const response = await queryTopicMessages(topicId, {
        limit: 1,
        order: 'asc',
      });
      return response.messages?.[0] || null;
    } catch (error) {
      throw new Error(`Failed to get first message: ${error.message}`);
    }
  }

  async function getMessagesInRange(topicId, startSequence, endSequence) {
    try {
      const allMessages = [];
      let hasMore = true;
      let lastSequence = startSequence - 1;

      while (hasMore) {
        const response = await queryTopicMessages(topicId, {
          sequenceNumber: lastSequence,
          operator: 'gt',
          order: 'asc',
          limit: 100,
        });

        if (!response.messages || response.messages.length === 0) {
          hasMore = false;
          break;
        }

        for (const msg of response.messages) {
          if (endSequence && msg.sequence_number > endSequence) {
            hasMore = false;
            break;
          }
          if (msg.sequence_number >= startSequence) {
            allMessages.push(msg);
          }
          lastSequence = msg.sequence_number;
        }

        if (response.messages.length < 100) hasMore = false;
      }

      return reassembleChunkedMessages(allMessages);
    } catch (error) {
      throw new Error(`Failed to get messages in range: ${error.message}`);
    }
  }

  return {
    initializeClient,
    getAccountMemo,
    isValidAccount,
    getAccountPublicKey,
    updateAccountMemo,
    createTopic,
    submitMessageToHCS,
    queryTopicMessages,
    reassembleChunkedMessages,
    getLatestSequenceNumber,
    getNewMessages,
    getFirstTopicMessage,
    getMessagesInRange,
    parseHederaPrivateKey,
    derivePublicKeyFromHederaKey,
  };
}

module.exports = {
  createHederaContext,
  parseHederaPrivateKey,
  derivePublicKeyFromHederaKey,
};
