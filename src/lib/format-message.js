const { decryptMessage } = require('./crypto');
const { decodeCBOR } = require('./utils');

/**
 * Parse message content supporting both JSON and CBOR formats
 * @param {Buffer} messageBuffer - Base64 decoded message buffer
 * @returns {Object} Parsed result with parsed, format, and raw fields
 */
function parseMessageContent(messageBuffer) {
  // Check first byte for CBOR major type (0-7)
  // CBOR major types are encoded in the top 3 bits
  const firstByte = messageBuffer[0];
  const majorType = firstByte >> 5;

  // If the first byte indicates a valid CBOR major type (0-7) and is not '{' or '[' (JSON starters)
  // try CBOR first
  if (
    majorType >= 0 &&
    majorType <= 7 &&
    firstByte !== 0x7b &&
    firstByte !== 0x5b
  ) {
    try {
      const parsed = decodeCBOR(messageBuffer);
      // Verify it's a valid message object with expected structure
      if (parsed && typeof parsed === 'object' && parsed.type) {
        return { parsed, format: 'cbor', raw: messageBuffer };
      }
    } catch {
      // Fall through to try JSON
    }
  }

  try {
    // Try to parse as JSON
    const content = messageBuffer.toString('utf8');
    return { parsed: JSON.parse(content), format: 'json', raw: content };
  } catch {
    // If both fail, return as plain text
    return {
      parsed: null,
      format: 'plain',
      raw: messageBuffer.toString('utf8'),
    };
  }
}

/**
 * Parse and format a raw message into a human-readable string
 * @param {Object} msg - Raw message object from Hedera
 * @param {string|Object} privateKey - RSA private key (PEM string) or ECIES key object
 * @param {string} encryptionType - 'RSA' or 'ECIES'
 * @returns {string} Formatted message string
 */
function formatMessage(msg, privateKey, encryptionType) {
  const messageBuffer = Buffer.from(msg.message, 'base64');
  const timestamp = new Date(
    parseFloat(msg.consensus_timestamp) * 1000
  ).toISOString();
  const sender = msg.payer_account_id;

  const { parsed, format, raw } = parseMessageContent(messageBuffer);

  if (parsed && parsed.type === 'HIP-1334_ENCRYPTED_MESSAGE') {
    try {
      const decrypted = decryptMessage(parsed.data, privateKey);
      return `[Seq: ${msg.sequence_number}] [${timestamp}] [${format.toUpperCase()}] Encrypted message from ${sender}:\n${decrypted}`;
    } catch (error) {
      return `[Seq: ${msg.sequence_number}] [${timestamp}] [${format.toUpperCase()}] Encrypted message from ${sender} (cannot decrypt):\n${error.message}`;
    }
  }

  const publicKeyPayload =
    parsed && parsed.payload && parsed.payload.type === 'HIP-1334_PUBLIC_KEY'
      ? parsed.payload
      : null;

  if (publicKeyPayload) {
    const keyInfo = publicKeyPayload.encryptionType
      ? ` (${publicKeyPayload.encryptionType})`
      : '';
    const keyPreview = publicKeyPayload.publicKey
      ? typeof publicKeyPayload.publicKey === 'string'
        ? publicKeyPayload.publicKey.substring(0, 50) + '...'
        : JSON.stringify(publicKeyPayload.publicKey).substring(0, 50) + '...'
      : 'N/A';
    return `[Seq: ${msg.sequence_number}] [${timestamp}] [${format.toUpperCase()}] Public key${keyInfo} published by ${sender}:\n${keyPreview}`;
  } else {
    return `[Seq: ${msg.sequence_number}] [${timestamp}] [${format.toUpperCase()}] Plain text message from ${sender}:\n${raw}`;
  }
}

module.exports = { formatMessage, parseMessageContent };
