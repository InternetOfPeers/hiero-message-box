/**
 * Unit tests for src/lib/config.js
 *
 * Strategy: each test calls jest.resetModules() (via beforeEach) so that
 * config.js is evaluated fresh, and uses jest.spyOn on the real 'fs' object
 * to control .env discovery without touching the actual file system.
 *
 * Covers:
 *  1. loadEnvFile() — .env absent, read error, env-var precedence, quote
 *     stripping, comment/blank-line skipping
 *  2. findProjectRoot() — fallback when no package.json is found
 *  3. Config defaults and upper/lower-case normalisations
 *  4. Required-field validation (throws with a clear message)
 */

'use strict';

const fs = require('fs');

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

/** Minimal set of env vars that satisfies all required fields. */
const VALID_ENV = {
  PAYER_ACCOUNT_ID: '0.0.100',
  PAYER_PRIVATE_KEY: 'test-payer-key',
  MESSAGE_BOX_OWNER_ACCOUNT_ID: '0.0.200',
  MESSAGE_BOX_OWNER_PRIVATE_KEY: 'test-owner-key',
};

/** Require a fresh config module (module cache must have been reset first). */
const loadConfig = () => require('../src/lib/config');

/**
 * Spy on fs.existsSync so that any path ending in '.env' is treated as
 * "not found", while all other paths use the real implementation.
 */
function skipEnvFile() {
  const original = fs.existsSync; // captured before the spy replaces it
  jest.spyOn(fs, 'existsSync').mockImplementation(p =>
    typeof p === 'string' && p.endsWith('.env') ? false : original(p)
  );
}

/**
 * Spy on fs.readFileSync so that reading any path ending in '.env' returns
 * `content`, while all other reads use the real implementation.
 */
function mockDotEnv(content) {
  const original = fs.readFileSync; // captured before the spy replaces it
  jest.spyOn(fs, 'readFileSync').mockImplementation((p, enc) => {
    if (typeof p === 'string' && p.endsWith('.env')) return content;
    return original(p, enc);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('config', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    jest.resetModules();
  });

  afterEach(() => {
    // Remove keys added during the test (e.g. by loadEnvFile or the test body).
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    // Restore original values (and re-add any keys that were deleted).
    Object.assign(process.env, savedEnv);
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // loadEnvFile()
  // -------------------------------------------------------------------------
  describe('loadEnvFile()', () => {
    test('.env not found — config loads from process.env without error', () => {
      skipEnvFile();
      Object.assign(process.env, VALID_ENV);

      const { config } = loadConfig();

      expect(config.payerAccountId).toBe('0.0.100');
    });

    test('readFileSync throws — error is caught and config loads from process.env', () => {
      const original = fs.readFileSync;
      jest.spyOn(fs, 'readFileSync').mockImplementation((p, enc) => {
        if (typeof p === 'string' && p.endsWith('.env')) throw new Error('disk error');
        return original(p, enc);
      });
      Object.assign(process.env, VALID_ENV);

      const { config } = loadConfig();

      expect(config.payerAccountId).toBe('0.0.100');
    });

    test('.env value is used when the var is absent from process.env', () => {
      delete process.env.PAYER_ACCOUNT_ID;
      mockDotEnv(
        `PAYER_ACCOUNT_ID=from-file\n` +
        `PAYER_PRIVATE_KEY=${VALID_ENV.PAYER_PRIVATE_KEY}\n` +
        `MESSAGE_BOX_OWNER_ACCOUNT_ID=${VALID_ENV.MESSAGE_BOX_OWNER_ACCOUNT_ID}\n` +
        `MESSAGE_BOX_OWNER_PRIVATE_KEY=${VALID_ENV.MESSAGE_BOX_OWNER_PRIVATE_KEY}\n`
      );

      const { config } = loadConfig();

      expect(config.payerAccountId).toBe('from-file');
    });

    test('process.env value takes precedence over .env file', () => {
      process.env.PAYER_ACCOUNT_ID = 'already-set';
      Object.assign(process.env, {
        PAYER_PRIVATE_KEY: VALID_ENV.PAYER_PRIVATE_KEY,
        MESSAGE_BOX_OWNER_ACCOUNT_ID: VALID_ENV.MESSAGE_BOX_OWNER_ACCOUNT_ID,
        MESSAGE_BOX_OWNER_PRIVATE_KEY: VALID_ENV.MESSAGE_BOX_OWNER_PRIVATE_KEY,
      });
      mockDotEnv('PAYER_ACCOUNT_ID=from-file\n');

      const { config } = loadConfig();

      expect(config.payerAccountId).toBe('already-set');
    });

    test('.env double-quoted values are unquoted', () => {
      delete process.env.PAYER_ACCOUNT_ID;
      mockDotEnv(
        `PAYER_ACCOUNT_ID="double-quoted"\n` +
        `PAYER_PRIVATE_KEY=${VALID_ENV.PAYER_PRIVATE_KEY}\n` +
        `MESSAGE_BOX_OWNER_ACCOUNT_ID=${VALID_ENV.MESSAGE_BOX_OWNER_ACCOUNT_ID}\n` +
        `MESSAGE_BOX_OWNER_PRIVATE_KEY=${VALID_ENV.MESSAGE_BOX_OWNER_PRIVATE_KEY}\n`
      );

      const { config } = loadConfig();

      expect(config.payerAccountId).toBe('double-quoted');
    });

    test('.env single-quoted values are unquoted', () => {
      delete process.env.PAYER_ACCOUNT_ID;
      mockDotEnv(
        `PAYER_ACCOUNT_ID='single-quoted'\n` +
        `PAYER_PRIVATE_KEY=${VALID_ENV.PAYER_PRIVATE_KEY}\n` +
        `MESSAGE_BOX_OWNER_ACCOUNT_ID=${VALID_ENV.MESSAGE_BOX_OWNER_ACCOUNT_ID}\n` +
        `MESSAGE_BOX_OWNER_PRIVATE_KEY=${VALID_ENV.MESSAGE_BOX_OWNER_PRIVATE_KEY}\n`
      );

      const { config } = loadConfig();

      expect(config.payerAccountId).toBe('single-quoted');
    });

    test('.env comment and blank lines are ignored', () => {
      delete process.env.PAYER_ACCOUNT_ID;
      mockDotEnv(
        `# a comment\n` +
        `\n` +
        `PAYER_ACCOUNT_ID=from-file\n` +
        `PAYER_PRIVATE_KEY=${VALID_ENV.PAYER_PRIVATE_KEY}\n` +
        `MESSAGE_BOX_OWNER_ACCOUNT_ID=${VALID_ENV.MESSAGE_BOX_OWNER_ACCOUNT_ID}\n` +
        `MESSAGE_BOX_OWNER_PRIVATE_KEY=${VALID_ENV.MESSAGE_BOX_OWNER_PRIVATE_KEY}\n`
      );

      const { config } = loadConfig();

      expect(config.payerAccountId).toBe('from-file');
    });

    test('.env lines without "=" are silently skipped', () => {
      delete process.env.PAYER_ACCOUNT_ID;
      mockDotEnv(
        `INVALID_LINE_NO_EQUALS\n` +
        `PAYER_ACCOUNT_ID=from-file\n` +
        `PAYER_PRIVATE_KEY=${VALID_ENV.PAYER_PRIVATE_KEY}\n` +
        `MESSAGE_BOX_OWNER_ACCOUNT_ID=${VALID_ENV.MESSAGE_BOX_OWNER_ACCOUNT_ID}\n` +
        `MESSAGE_BOX_OWNER_PRIVATE_KEY=${VALID_ENV.MESSAGE_BOX_OWNER_PRIVATE_KEY}\n`
      );

      const { config } = loadConfig();

      // The malformed line should not cause an error and should be ignored
      expect(config.payerAccountId).toBe('from-file');
      expect(process.env.INVALID_LINE_NO_EQUALS).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // findProjectRoot()
  // -------------------------------------------------------------------------
  describe('findProjectRoot()', () => {
    test('returns startDir when no package.json is found anywhere', () => {
      // existsSync returns false for ALL paths → while loop traverses to root
      // and the function falls back to startDir (= __dirname inside config.js).
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      Object.assign(process.env, VALID_ENV);

      // Config should still load successfully from process.env.
      const { config } = loadConfig();

      expect(config.payerAccountId).toBe('0.0.100');
    });
  });

  // -------------------------------------------------------------------------
  // Defaults and normalisations
  // -------------------------------------------------------------------------
  describe('defaults', () => {
    beforeEach(() => {
      skipEnvFile();
      Object.assign(process.env, VALID_ENV);
    });

    test('"testnet" is the default network', () => {
      delete process.env.HEDERA_NETWORK;

      const { config } = loadConfig();

      expect(config.hederaNetwork).toBe('testnet');
    });

    test('network name is normalised to lowercase', () => {
      process.env.HEDERA_NETWORK = 'MAINNET';

      const { config } = loadConfig();

      expect(config.hederaNetwork).toBe('mainnet');
    });

    test('testnet mirror node URL is derived by default', () => {
      delete process.env.HEDERA_NETWORK;
      delete process.env.MIRROR_NODE_URL;

      const { config } = loadConfig();

      expect(config.mirrorNodeUrl).toBe('https://testnet.mirrornode.hedera.com/api/v1');
    });

    test('mainnet mirror node URL is derived when network is mainnet', () => {
      process.env.HEDERA_NETWORK = 'mainnet';
      delete process.env.MIRROR_NODE_URL;

      const { config } = loadConfig();

      expect(config.mirrorNodeUrl).toBe('https://mainnet.mirrornode.hedera.com/api/v1');
    });

    test('custom MIRROR_NODE_URL overrides the derived default', () => {
      process.env.MIRROR_NODE_URL = 'https://custom.example.com/api/v1';

      const { config } = loadConfig();

      expect(config.mirrorNodeUrl).toBe('https://custom.example.com/api/v1');
    });

    test('"RSA" is the default encryption type', () => {
      delete process.env.ENCRYPTION_TYPE;

      const { config } = loadConfig();

      expect(config.encryptionType).toBe('RSA');
    });

    test('encryption type is normalised to uppercase', () => {
      process.env.ENCRYPTION_TYPE = 'ecies';

      const { config } = loadConfig();

      expect(config.encryptionType).toBe('ECIES');
    });

    test('"./data" is the default RSA data directory', () => {
      delete process.env.RSA_DATA_DIR;

      const { config } = loadConfig();

      expect(config.rsaDataDir).toBe('./data');
    });

    test('custom RSA_DATA_DIR is used when set', () => {
      process.env.RSA_DATA_DIR = '/custom/keys';

      const { config } = loadConfig();

      expect(config.rsaDataDir).toBe('/custom/keys');
    });
  });

  // -------------------------------------------------------------------------
  // Validation — required fields
  // -------------------------------------------------------------------------
  describe('validation', () => {
    beforeEach(() => skipEnvFile());

    test('throws when PAYER_ACCOUNT_ID is missing', () => {
      Object.assign(process.env, VALID_ENV);
      delete process.env.PAYER_ACCOUNT_ID;

      expect(() => loadConfig()).toThrow('PAYER_ACCOUNT_ID is required.');
    });

    test('throws when PAYER_PRIVATE_KEY is missing', () => {
      Object.assign(process.env, VALID_ENV);
      delete process.env.PAYER_PRIVATE_KEY;

      expect(() => loadConfig()).toThrow('PAYER_PRIVATE_KEY is required.');
    });

    test('throws when MESSAGE_BOX_OWNER_ACCOUNT_ID is missing', () => {
      Object.assign(process.env, VALID_ENV);
      delete process.env.MESSAGE_BOX_OWNER_ACCOUNT_ID;

      expect(() => loadConfig()).toThrow('MESSAGE_BOX_OWNER_ACCOUNT_ID is required.');
    });

    test('throws when MESSAGE_BOX_OWNER_PRIVATE_KEY is missing', () => {
      Object.assign(process.env, VALID_ENV);
      delete process.env.MESSAGE_BOX_OWNER_PRIVATE_KEY;

      expect(() => loadConfig()).toThrow('MESSAGE_BOX_OWNER_PRIVATE_KEY is required.');
    });
  });
});
