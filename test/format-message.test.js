'use strict';

const {
  encodeCBOR,
  decodeCBOR,
  parseMessageContent,
  formatMessage,
} = require('../src/lib/format-message');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock HCS message whose .message is base64(encodeCBOR(obj)) */
function makeCborMsg(obj, seqNum = 1) {
  return {
    message: encodeCBOR(obj).toString('base64'),
    consensus_timestamp: '1741219200.000000000',
    payer_account_id: '0.0.12345',
    sequence_number: seqNum,
  };
}

/** Build a mock HCS message whose .message is base64(JSON.stringify(obj)) */
function makeJsonMsg(obj, seqNum = 1) {
  return {
    message: Buffer.from(JSON.stringify(obj)).toString('base64'),
    consensus_timestamp: '1741219200.000000000',
    payer_account_id: '0.0.12345',
    sequence_number: seqNum,
  };
}

// ---------------------------------------------------------------------------
// encodeCBOR / decodeCBOR – roundtrip tests covering all internal branches
// ---------------------------------------------------------------------------

describe('encodeCBOR / decodeCBOR roundtrip', () => {
  describe('primitives', () => {
    test('null roundtrips', () => {
      expect(decodeCBOR(encodeCBOR(null))).toBeNull();
    });

    test('undefined roundtrips', () => {
      expect(decodeCBOR(encodeCBOR(undefined))).toBeUndefined();
    });

    test('true roundtrips', () => {
      expect(decodeCBOR(encodeCBOR(true))).toBe(true);
    });

    test('false roundtrips', () => {
      expect(decodeCBOR(encodeCBOR(false))).toBe(false);
    });
  });

  describe('unsigned integers', () => {
    test('0 (tiny uint, < 24)', () => expect(decodeCBOR(encodeCBOR(0))).toBe(0));
    test('1', () => expect(decodeCBOR(encodeCBOR(1))).toBe(1));
    test('23 (max tiny uint)', () => expect(decodeCBOR(encodeCBOR(23))).toBe(23));
    test('24 (1-byte uint)', () => expect(decodeCBOR(encodeCBOR(24))).toBe(24));
    test('255 (max 1-byte uint)', () => expect(decodeCBOR(encodeCBOR(255))).toBe(255));
    test('256 (2-byte uint)', () => expect(decodeCBOR(encodeCBOR(256))).toBe(256));
    test('65535 (max 2-byte uint)', () => expect(decodeCBOR(encodeCBOR(65535))).toBe(65535));
    test('65536 (4-byte uint)', () => expect(decodeCBOR(encodeCBOR(65536))).toBe(65536));
    test('1000000 (large 4-byte uint)', () => expect(decodeCBOR(encodeCBOR(1000000))).toBe(1000000));
  });

  describe('negative integers', () => {
    test('-1 (tiny negative)', () => expect(decodeCBOR(encodeCBOR(-1))).toBe(-1));
    test('-24 (most negative tiny)', () => expect(decodeCBOR(encodeCBOR(-24))).toBe(-24));
  });

  describe('floats / doubles', () => {
    // Values that are not integers or are negative beyond -24 fall to the double path
    test('1.5', () => expect(decodeCBOR(encodeCBOR(1.5))).toBe(1.5));
    test('-1.5', () => expect(decodeCBOR(encodeCBOR(-1.5))).toBe(-1.5));
    test('-25 (negative beyond tiny → double fallback)', () => {
      expect(decodeCBOR(encodeCBOR(-25))).toBe(-25);
    });
    test('Math.PI', () => expect(decodeCBOR(encodeCBOR(Math.PI))).toBeCloseTo(Math.PI));
  });

  describe('strings', () => {
    test('empty string', () => expect(decodeCBOR(encodeCBOR(''))).toBe(''));
    test('short string (< 24 bytes)', () => {
      expect(decodeCBOR(encodeCBOR('hello'))).toBe('hello');
    });
    test('medium string (24–255 bytes)', () => {
      const s = 'x'.repeat(100);
      expect(decodeCBOR(encodeCBOR(s))).toBe(s);
    });
    test('long string (256–65535 bytes)', () => {
      const s = 'y'.repeat(1000);
      expect(decodeCBOR(encodeCBOR(s))).toBe(s);
    });
    test('very long string (≥ 65536 bytes)', () => {
      const s = 'z'.repeat(65536);
      expect(decodeCBOR(encodeCBOR(s))).toBe(s);
    });
  });

  describe('buffers', () => {
    test('empty buffer', () => {
      expect(decodeCBOR(encodeCBOR(Buffer.alloc(0)))).toEqual(Buffer.alloc(0));
    });
    test('short buffer (< 24 bytes)', () => {
      const b = Buffer.from([0x01, 0x02, 0x03]);
      expect(decodeCBOR(encodeCBOR(b))).toEqual(b);
    });
    test('medium buffer (24–255 bytes)', () => {
      const b = Buffer.alloc(50, 0xab);
      expect(decodeCBOR(encodeCBOR(b))).toEqual(b);
    });
    test('large buffer (≥ 256 bytes)', () => {
      const b = Buffer.alloc(300, 0xcd);
      expect(decodeCBOR(encodeCBOR(b))).toEqual(b);
    });
  });

  describe('arrays', () => {
    test('empty array', () => {
      expect(decodeCBOR(encodeCBOR([]))).toEqual([]);
    });
    test('short array (< 24 items)', () => {
      expect(decodeCBOR(encodeCBOR([1, 'two', true, null]))).toEqual([1, 'two', true, null]);
    });
    test('medium array (24–255 items)', () => {
      const a = Array.from({ length: 50 }, (_, i) => i);
      expect(decodeCBOR(encodeCBOR(a))).toEqual(a);
    });
    test('large array (≥ 256 items)', () => {
      const a = Array.from({ length: 300 }, (_, i) => i % 256);
      expect(decodeCBOR(encodeCBOR(a))).toEqual(a);
    });
  });

  describe('objects', () => {
    test('empty object', () => {
      expect(decodeCBOR(encodeCBOR({}))).toEqual({});
    });
    test('simple object', () => {
      const obj = { type: 'TEST', value: 42 };
      expect(decodeCBOR(encodeCBOR(obj))).toEqual(obj);
    });
    test('medium object (24–255 keys)', () => {
      const obj = Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`k${i}`, i])
      );
      expect(decodeCBOR(encodeCBOR(obj))).toEqual(obj);
    });
    test('large object (≥ 256 keys)', () => {
      const obj = Object.fromEntries(
        Array.from({ length: 300 }, (_, i) => [`k${i}`, i])
      );
      expect(decodeCBOR(encodeCBOR(obj))).toEqual(obj);
    });
    test('nested object with mixed types', () => {
      const obj = { a: { b: { c: 'deep' } }, nums: [1, 2.5, -1], flag: false };
      expect(decodeCBOR(encodeCBOR(obj))).toEqual(obj);
    });
  });
});

// ---------------------------------------------------------------------------
// encodeCBOR – error cases
// ---------------------------------------------------------------------------

describe('encodeCBOR errors', () => {
  test('throws for Symbol', () => {
    expect(() => encodeCBOR(Symbol('x'))).toThrow('Unsupported CBOR type: symbol');
  });

  test('throws for Function', () => {
    expect(() => encodeCBOR(() => {})).toThrow('Unsupported CBOR type: function');
  });
});

// ---------------------------------------------------------------------------
// decodeCBOR – error cases (crafted malformed buffers)
// ---------------------------------------------------------------------------

describe('decodeCBOR errors', () => {
  test('throws on empty buffer', () => {
    expect(() => decodeCBOR(Buffer.alloc(0))).toThrow('Unexpected end of CBOR data');
  });

  test('throws on unsupported additional info in readLength (additionalInfo=28)', () => {
    // majorType 0, additionalInfo 28 → byte = (0 << 5) | 28 = 0x1c
    expect(() => decodeCBOR(Buffer.from([0x1c]))).toThrow('Unsupported additional info: 28');
  });

  test('throws on unsupported major type 6 (tagged item)', () => {
    // majorType 6 → byte = (6 << 5) | 0 = 0xc0
    expect(() => decodeCBOR(Buffer.from([0xc0]))).toThrow('Unsupported major type: 6');
  });

  test('throws on unsupported special value in major type 7 (additionalInfo=24)', () => {
    // majorType 7, additionalInfo 24 → byte = (7 << 5) | 24 = 0xf8
    expect(() => decodeCBOR(Buffer.from([0xf8]))).toThrow('Unsupported special value: 24');
  });
});

// ---------------------------------------------------------------------------
// parseMessageContent – all format paths
// ---------------------------------------------------------------------------

describe('parseMessageContent', () => {
  test('returns cbor format when decoded object has a top-level type field', () => {
    const obj = { type: 'SOME_TYPE', data: 'payload' };
    const result = parseMessageContent(encodeCBOR(obj));

    expect(result.format).toBe('cbor');
    expect(result.parsed).toEqual(obj);
    expect(Buffer.isBuffer(result.raw)).toBe(true);
  });

  test('falls through to plain when CBOR decodes but has no type field (array)', () => {
    // CBOR-encoded array has no .type → skip CBOR path → JSON parse fails → plain
    const result = parseMessageContent(encodeCBOR([1, 2, 3]));

    expect(result.format).toBe('plain');
    expect(result.parsed).toBeNull();
  });

  test('parses JSON when first byte is { (0x7b)', () => {
    const json = JSON.stringify({ type: 'TEST', value: 99 });
    const result = parseMessageContent(Buffer.from(json));

    expect(result.format).toBe('json');
    expect(result.parsed.type).toBe('TEST');
  });

  test('parses JSON when first byte is [ (0x5b)', () => {
    const json = JSON.stringify([1, 2, 3]);
    const result = parseMessageContent(Buffer.from(json));

    expect(result.format).toBe('json');
    expect(result.parsed).toEqual([1, 2, 3]);
  });

  test('returns plain text when both CBOR and JSON fail', () => {
    // Buffer starting with 0xc0 (unsupported major type 6) → CBOR throws → JSON fails → plain
    const buf = Buffer.concat([Buffer.from([0xc0]), Buffer.from(' invalid')]);
    const result = parseMessageContent(buf);

    expect(result.format).toBe('plain');
    expect(result.parsed).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatMessage – CBOR format path
// ---------------------------------------------------------------------------

describe('formatMessage with CBOR-encoded messages', () => {
  test('formats a CBOR-encoded encrypted message (cannot decrypt)', () => {
    // The data field is not real ciphertext, so decryptMessage will throw
    const msg = makeCborMsg(
      { type: 'HIP-1334_ENCRYPTED_MESSAGE', data: 'not-real-ciphertext' },
      7
    );

    const result = formatMessage(msg, null, 'RSA');

    expect(result).toContain('[CBOR]');
    expect(result).toContain('[Seq: 7]');
    expect(result).toContain('Encrypted message from 0.0.12345');
    expect(result).toContain('(cannot decrypt)');
  });

  test('formats a CBOR-encoded public key announcement', () => {
    // Top-level `type` field satisfies parseMessageContent's CBOR check;
    // payload.type drives the public-key branch in formatMessage
    const msg = makeCborMsg(
      {
        type: 'HIP-1334_PUBLIC_KEY_ANNOUNCEMENT',
        payload: {
          type: 'HIP-1334_PUBLIC_KEY',
          publicKey: 'cbor-public-key-pem-string',
          encryptionType: 'RSA',
        },
      },
      8
    );

    const result = formatMessage(msg, null, 'RSA');

    expect(result).toContain('[CBOR]');
    expect(result).toContain('Public key (RSA) published by');
    expect(result).toContain('[Seq: 8]');
  });
});

// ---------------------------------------------------------------------------
// formatMessage – uncovered branches in the public-key output block
// ---------------------------------------------------------------------------

describe('formatMessage public-key output branches', () => {
  test('omits encryptionType annotation when not provided', () => {
    const msg = makeJsonMsg(
      {
        payload: {
          type: 'HIP-1334_PUBLIC_KEY',
          publicKey: 'a-public-key-string-long-enough-for-preview-truncation',
          // no encryptionType field
        },
      },
      9
    );

    const result = formatMessage(msg, null, null);

    expect(result).toContain('Public key published by');
    // No parenthesised type annotation
    expect(result).not.toMatch(/Public key \(\w+\)/);
    expect(result).toContain('[Seq: 9]');
  });

  test('uses JSON.stringify preview when publicKey is a non-string object', () => {
    const msg = makeJsonMsg(
      {
        payload: {
          type: 'HIP-1334_PUBLIC_KEY',
          publicKey: { x: 'curve-point-x', y: 'curve-point-y' },
          encryptionType: 'ECIES',
        },
      },
      10
    );

    const result = formatMessage(msg, null, 'ECIES');

    expect(result).toContain('Public key (ECIES) published by');
    // Preview comes from JSON.stringify, should contain the JSON snippet + ellipsis
    expect(result).toContain('...');
    expect(result).toContain('[Seq: 10]');
  });

  test('shows N/A when publicKey is null', () => {
    const msg = makeJsonMsg(
      {
        payload: {
          type: 'HIP-1334_PUBLIC_KEY',
          publicKey: null,
          encryptionType: 'RSA',
        },
      },
      11
    );

    const result = formatMessage(msg, null, 'RSA');

    expect(result).toContain('N/A');
    expect(result).toContain('Public key (RSA) published by');
    expect(result).toContain('[Seq: 11]');
  });
});
