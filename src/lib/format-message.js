const { decryptMessage } = require('./crypto');

/**
 * Encode data to CBOR format (simplified implementation)
 * Supports: strings, numbers, objects, arrays, booleans, null
 * @param {*} data - Data to encode
 * @returns {Buffer} CBOR encoded data
 */
function encodeCBOR(data) {
  const buffers = [];

  function encode(value) {
    if (value === null) {
      buffers.push(Buffer.from([0xf6]));
    } else if (value === undefined) {
      buffers.push(Buffer.from([0xf7]));
    } else if (typeof value === 'boolean') {
      buffers.push(Buffer.from([value ? 0xf5 : 0xf4]));
    } else if (typeof value === 'number') {
      if (Number.isInteger(value) && value >= 0 && value < 24) {
        buffers.push(Buffer.from([value]));
      } else if (Number.isInteger(value) && value >= 0 && value < 256) {
        buffers.push(Buffer.from([0x18, value]));
      } else if (Number.isInteger(value) && value >= 0 && value < 65536) {
        const buf = Buffer.allocUnsafe(3);
        buf[0] = 0x19;
        buf.writeUInt16BE(value, 1);
        buffers.push(buf);
      } else if (Number.isInteger(value) && value >= 0) {
        const buf = Buffer.allocUnsafe(5);
        buf[0] = 0x1a;
        buf.writeUInt32BE(value, 1);
        buffers.push(buf);
      } else if (Number.isInteger(value) && value < 0 && value >= -24) {
        buffers.push(Buffer.from([0x20 + (-1 - value)]));
      } else {
        const buf = Buffer.allocUnsafe(9);
        buf[0] = 0xfb;
        buf.writeDoubleBE(value, 1);
        buffers.push(buf);
      }
    } else if (typeof value === 'string') {
      const strBuf = Buffer.from(value, 'utf8');
      const len = strBuf.length;
      if (len < 24) {
        buffers.push(Buffer.from([0x60 + len]));
      } else if (len < 256) {
        buffers.push(Buffer.from([0x78, len]));
      } else if (len < 65536) {
        const buf = Buffer.allocUnsafe(3);
        buf[0] = 0x79;
        buf.writeUInt16BE(len, 1);
        buffers.push(buf);
      } else {
        const buf = Buffer.allocUnsafe(5);
        buf[0] = 0x7a;
        buf.writeUInt32BE(len, 1);
        buffers.push(buf);
      }
      buffers.push(strBuf);
    } else if (Buffer.isBuffer(value)) {
      const len = value.length;
      if (len < 24) {
        buffers.push(Buffer.from([0x40 + len]));
      } else if (len < 256) {
        buffers.push(Buffer.from([0x58, len]));
      } else {
        const buf = Buffer.allocUnsafe(5);
        buf[0] = 0x5a;
        buf.writeUInt32BE(len, 1);
        buffers.push(buf);
      }
      buffers.push(value);
    } else if (Array.isArray(value)) {
      const len = value.length;
      if (len < 24) {
        buffers.push(Buffer.from([0x80 + len]));
      } else if (len < 256) {
        buffers.push(Buffer.from([0x98, len]));
      } else {
        const buf = Buffer.allocUnsafe(5);
        buf[0] = 0x9a;
        buf.writeUInt32BE(len, 1);
        buffers.push(buf);
      }
      value.forEach(item => encode(item));
    } else if (typeof value === 'object') {
      const entries = Object.entries(value);
      const len = entries.length;
      if (len < 24) {
        buffers.push(Buffer.from([0xa0 + len]));
      } else if (len < 256) {
        buffers.push(Buffer.from([0xb8, len]));
      } else {
        const buf = Buffer.allocUnsafe(5);
        buf[0] = 0xba;
        buf.writeUInt32BE(len, 1);
        buffers.push(buf);
      }
      entries.forEach(([key, val]) => {
        encode(key);
        encode(val);
      });
    } else {
      throw new Error(`Unsupported CBOR type: ${typeof value}`);
    }
  }

  encode(data);
  return Buffer.concat(buffers);
}

/**
 * Decode CBOR format to JavaScript data
 * @param {Buffer} buffer - CBOR encoded buffer
 * @returns {*} Decoded data
 */
function decodeCBOR(buffer) {
  let offset = 0;

  function decode() {
    if (offset >= buffer.length) {
      throw new Error('Unexpected end of CBOR data');
    }

    const byte = buffer[offset++];
    const majorType = byte >> 5;
    const additionalInfo = byte & 0x1f;

    function readLength() {
      if (additionalInfo < 24) {
        return additionalInfo;
      } else if (additionalInfo === 24) {
        return buffer[offset++];
      } else if (additionalInfo === 25) {
        const val = buffer.readUInt16BE(offset);
        offset += 2;
        return val;
      } else if (additionalInfo === 26) {
        const val = buffer.readUInt32BE(offset);
        offset += 4;
        return val;
      } else {
        throw new Error(`Unsupported additional info: ${additionalInfo}`);
      }
    }

    switch (majorType) {
      case 0:
        return readLength();
      case 1:
        return -1 - readLength();
      case 2: {
        const len = readLength();
        const data = buffer.slice(offset, offset + len);
        offset += len;
        return data;
      }
      case 3: {
        const len = readLength();
        const data = buffer.toString('utf8', offset, offset + len);
        offset += len;
        return data;
      }
      case 4: {
        const len = readLength();
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(decode());
        return arr;
      }
      case 5: {
        const len = readLength();
        const obj = {};
        for (let i = 0; i < len; i++) {
          const key = decode();
          obj[key] = decode();
        }
        return obj;
      }
      case 7:
        if (additionalInfo === 20) return false;
        if (additionalInfo === 21) return true;
        if (additionalInfo === 22) return null;
        if (additionalInfo === 23) return undefined;
        if (additionalInfo === 27) {
          const val = buffer.readDoubleBE(offset);
          offset += 8;
          return val;
        }
        throw new Error(`Unsupported special value: ${additionalInfo}`);
      default:
        throw new Error(`Unsupported major type: ${majorType}`);
    }
  }

  return decode();
}

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

module.exports = { formatMessage, parseMessageContent, encodeCBOR, decodeCBOR };
