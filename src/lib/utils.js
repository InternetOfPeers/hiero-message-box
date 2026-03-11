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
      // null -> major type 7, value 22
      buffers.push(Buffer.from([0xf6]));
    } else if (value === undefined) {
      // undefined -> major type 7, value 23
      buffers.push(Buffer.from([0xf7]));
    } else if (typeof value === 'boolean') {
      // false -> 0xf4, true -> 0xf5
      buffers.push(Buffer.from([value ? 0xf5 : 0xf4]));
    } else if (typeof value === 'number') {
      if (Number.isInteger(value) && value >= 0 && value < 24) {
        // Small positive integer (0-23)
        buffers.push(Buffer.from([value]));
      } else if (Number.isInteger(value) && value >= 0 && value < 256) {
        // Unsigned int (1 byte)
        buffers.push(Buffer.from([0x18, value]));
      } else if (Number.isInteger(value) && value >= 0 && value < 65536) {
        // Unsigned int (2 bytes)
        const buf = Buffer.allocUnsafe(3);
        buf[0] = 0x19;
        buf.writeUInt16BE(value, 1);
        buffers.push(buf);
      } else if (Number.isInteger(value) && value >= 0) {
        // Unsigned int (4 bytes)
        const buf = Buffer.allocUnsafe(5);
        buf[0] = 0x1a;
        buf.writeUInt32BE(value, 1);
        buffers.push(buf);
      } else if (Number.isInteger(value) && value < 0 && value >= -24) {
        // Negative int (-1 to -24)
        buffers.push(Buffer.from([0x20 + (-1 - value)]));
      } else {
        // Float64
        const buf = Buffer.allocUnsafe(9);
        buf[0] = 0xfb;
        buf.writeDoubleBE(value, 1);
        buffers.push(buf);
      }
    } else if (typeof value === 'string') {
      // Text string
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
      // Byte string
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
      // Array
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
      // Map/Object
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
      case 0: // Unsigned integer
        return readLength();

      case 1: // Negative integer
        return -1 - readLength();

      case 2: {
        // Byte string
        const len = readLength();
        const data = buffer.slice(offset, offset + len);
        offset += len;
        return data;
      }

      case 3: {
        // Text string
        const len = readLength();
        const data = buffer.toString('utf8', offset, offset + len);
        offset += len;
        return data;
      }

      case 4: {
        // Array
        const len = readLength();
        const arr = [];
        for (let i = 0; i < len; i++) {
          arr.push(decode());
        }
        return arr;
      }

      case 5: {
        // Map
        const len = readLength();
        const obj = {};
        for (let i = 0; i < len; i++) {
          const key = decode();
          const value = decode();
          obj[key] = value;
        }
        return obj;
      }

      case 7: // Special values
        if (additionalInfo === 20) {
          return false;
        } else if (additionalInfo === 21) {
          return true;
        } else if (additionalInfo === 22) {
          return null;
        } else if (additionalInfo === 23) {
          return undefined;
        } else if (additionalInfo === 27) {
          // Float64
          const val = buffer.readDoubleBE(offset);
          offset += 8;
          return val;
        } else {
          throw new Error(`Unsupported special value: ${additionalInfo}`);
        }

      default:
        throw new Error(`Unsupported major type: ${majorType}`);
    }
  }

  return decode();
}

module.exports = { encodeCBOR, decodeCBOR };
