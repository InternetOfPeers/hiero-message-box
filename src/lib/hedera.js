const {
  AccountInfoQuery,
  TopicCreateTransaction,
  Client,
  AccountId,
  PrivateKey,
  AccountUpdateTransaction,
  TopicMessageSubmitTransaction,
} = require("@hashgraph/sdk");
const https = require("https");

// Private functions

/**
 * Checks if a transaction was successful.
 * @param {import("@hashgraph/sdk").TransactionReceipt} receipt - The transaction receipt.
 * @returns {boolean} Whether the transaction was successful.
 */
function isTransactionSuccessful(receipt) {
  return receipt.status.toString() === "SUCCESS";
}

// Public functions

/**
 * Initializes and returns a Hedera client based on environment variables.
 * @returns {import("@hashgraph/sdk").Client} The initialized Hedera client.
 */
function initializeClient() {
  const operatorId = process.env.HEDERA_ACCOUNT_ID;
  const operatorKey = process.env.HEDERA_PRIVATE_KEY;
  const network = process.env.HEDERA_NETWORK || "testnet";

  if (!operatorId || !operatorKey) {
    throw new Error(
      "✗ Please set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY environment variables",
    );
  }

  // Initialize client based on network configuration
  const client =
    network.toLowerCase() === "mainnet"
      ? Client.forMainnet()
      : Client.forTestnet();
  client.setOperator(
    AccountId.fromString(operatorId),
    PrivateKey.fromStringDer(operatorKey),
  );

  console.debug(`✓ Hedera client initialized (${network})`);
  return client;
}

/**
 * Get Mirror Node URL based on the client's network
 * @param {import("@hashgraph/sdk").Client} client - The Hedera client.
 * @returns {string} The Mirror Node URL.
 */
function getMirrorNodeUrl(client) {
  if (process.env.MIRROR_NODE_URL) {
    return process.env.MIRROR_NODE_URL;
  }
  return client.getMirrorNodeUrl();
}

/**
 * Retrieves the account memo for the account.
 * @param {import("@hashgraph/sdk").Client} client - The Hedera client.
 * @returns {Promise<string>} The account memo.
 */
async function getAccountMemo(client, accountId) {
  const accountInfo = await new AccountInfoQuery()
    .setAccountId(accountId)
    .execute(client);
  return accountInfo.accountMemo;
}

/**
 * Updates the account memo.
 * @param {import("@hashgraph/sdk").Client} client - The Hedera client.
 * @param {string} memo - The memo text to set for the account.
 * @returns {Promise<{success: boolean, error?: string}>} The result of the update operation.
 */
async function updateAccountMemo(client, accountId, memo) {
  const receipt = await new AccountUpdateTransaction()
    .setAccountId(accountId)
    .setAccountMemo(memo)
    .execute(client)
    .then((tx) => tx.getReceipt(client));

  if (isTransactionSuccessful(receipt)) {
    console.debug(`✓ Account ${accountId} updated with memo "${memo}"`);
    return { success: true };
  }
  console.debug(`✗ Failed to set memo "${memo}" for account ${accountId}`);
  return { success: false, error: receipt.status.toString() };
}

/**
 * Creates a new topic with a memo indicating the operator listens for messages there.
 * @param {import("@hashgraph/sdk").Client} client - The Hedera client.
 * @returns {Promise<{success: boolean, topicId?: string, error?: string}>} The result of the topic creation.
 */
async function createTopic(client, memo) {
  const receipt = await new TopicCreateTransaction()
    .setTopicMemo(memo)
    .execute(client)
    .then((tx) => tx.getReceipt(client));

  if (isTransactionSuccessful(receipt)) {
    console.debug(`✓ Topic created: ${receipt.topicId}`);
    return { success: true, topicId: receipt.topicId.toString() };
  }
  console.debug(`✗ Failed to create topic`);
  return { success: false, error: receipt.status.toString() };
}

/**
 * Send a message to a topic.
 * @param {*} client
 * @param {*} topicId
 * @param {*} message
 * @returns
 */
async function submitMessageToHCS(client, topicId, message) {
  const receipt = await new TopicMessageSubmitTransaction({
    topicId,
    message: message,
  })
    .execute(client)
    .then((tx) => tx.getReceipt(client));

  if (isTransactionSuccessful(receipt)) {
    console.debug(`✓ Message submitted to ${topicId}`);
    return { success: true, topicId: topicId };
  }
  console.debug(`✗ Failed to submit message to ${topicId}`);
  return { success: false, error: receipt.status.toString() };
}

/**
 * Query Mirror Node for topic messages
 * @param {string} topicId - The topic ID to query
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Maximum number of messages to return
 * @param {string} [options.order] - Order of messages ('asc' or 'desc')
 * @param {number} [options.sequenceNumber] - Sequence number filter (use with operator)
 * @param {string} [options.operator] - Operator for sequence number ('gt', 'gte', 'lt', 'lte')
 * @returns {Promise<Object>} The Mirror Node response
 */
async function queryTopicMessages(topicId, options = {}) {
  const mirrorNodeUrl = getMirrorNodeUrl();
  const params = new URLSearchParams();

  if (options.limit) params.append("limit", options.limit);
  if (options.order) params.append("order", options.order);
  if (options.sequenceNumber && options.operator) {
    params.append(
      "sequencenumber",
      `${options.operator}:${options.sequenceNumber}`,
    );
  }

  const url = `${mirrorNodeUrl}/api/v1/topics/${topicId}/messages?${params.toString()}`;

  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            resolve(response);
          } catch (error) {
            reject(
              new Error(
                `Failed to parse Mirror Node response: ${error.message}`,
              ),
            );
          }
        });
      })
      .on("error", (error) => {
        reject(new Error(`Mirror Node request failed: ${error.message}`));
      });
  });
}

/**
 * Get the latest sequence number from a topic
 * @param {string} topicId - The topic ID
 * @returns {Promise<number|null>} The latest sequence number or null if no messages
 */
async function getLatestSequenceNumber(topicId) {
  try {
    const response = await queryTopicMessages(topicId, {
      order: "desc",
      limit: 1,
    });
    return response.messages?.[0]?.sequence_number || null;
  } catch (error) {
    throw new Error(`Failed to get latest sequence number: ${error.message}`);
  }
}

/**
 * Get new messages from a topic after a given sequence number
 * @param {string} topicId - The topic ID
 * @param {number} afterSequenceNumber - Get messages after this sequence number
 * @returns {Promise<Array>} Array of messages
 */
async function getNewMessages(topicId, afterSequenceNumber) {
  try {
    const response = await queryTopicMessages(topicId, {
      sequenceNumber: afterSequenceNumber,
      operator: "gt",
      order: "asc",
      limit: 100,
    });
    return response.messages || [];
  } catch (error) {
    throw new Error(`Failed to get new messages: ${error.message}`);
  }
}

/**
 * Get the first message from a topic (typically contains public key)
 * @param {string} topicId - The topic ID
 * @returns {Promise<Object|null>} The first message or null if no messages
 */
async function getFirstTopicMessage(topicId) {
  try {
    const response = await queryTopicMessages(topicId, {
      limit: 1,
      order: "asc",
    });
    return response.messages?.[0] || null;
  } catch (error) {
    throw new Error(`Failed to get first message: ${error.message}`);
  }
}

/**
 * Get messages in a range from a topic
 * @param {string} topicId - The topic ID
 * @param {number} startSequence - Starting sequence number (inclusive)
 * @param {number} [endSequence] - Ending sequence number (inclusive), if not provided gets all messages from start
 * @returns {Promise<Array>} Array of messages
 */
async function getMessagesInRange(topicId, startSequence, endSequence) {
  try {
    const allMessages = [];
    let hasMore = true;
    let lastSequence = startSequence - 1;

    while (hasMore) {
      const response = await queryTopicMessages(topicId, {
        sequenceNumber: lastSequence,
        operator: "gt",
        order: "asc",
        limit: 100,
      });

      if (!response.messages || response.messages.length === 0) {
        hasMore = false;
        break;
      }

      for (const msg of response.messages) {
        // If we have an end sequence and we've reached it, stop
        if (endSequence && msg.sequence_number > endSequence) {
          hasMore = false;
          break;
        }
        // Only include messages >= startSequence
        if (msg.sequence_number >= startSequence) {
          allMessages.push(msg);
        }
        lastSequence = msg.sequence_number;
      }

      // If we got fewer messages than the limit, we've reached the end
      if (response.messages.length < 100) {
        hasMore = false;
      }
    }

    return allMessages;
  } catch (error) {
    throw new Error(`Failed to get messages in range: ${error.message}`);
  }
}

// == Exports =================================================================

module.exports = {
  getAccountMemo,
  createTopic,
  initializeClient,
  updateAccountMemo,
  submitMessageToHCS,
  getLatestSequenceNumber,
  getNewMessages,
  getFirstTopicMessage,
  getMessagesInRange,
};
