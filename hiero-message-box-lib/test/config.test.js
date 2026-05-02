'use strict';

const { createConfig } = require('../src/config');

const VALID_INPUT = {
  PAYER_ACCOUNT_ID: '0.0.100',
  PAYER_PRIVATE_KEY: 'test-payer-key',
  MESSAGE_BOX_OWNER_ACCOUNT_ID: '0.0.200',
  MESSAGE_BOX_OWNER_PRIVATE_KEY: 'test-owner-key',
};

describe('createConfig', () => {
  describe('defaults', () => {
    test('"testnet" is the default network', () => {
      const config = createConfig(VALID_INPUT);
      expect(config.hederaNetwork).toBe('testnet');
    });

    test('network name is normalised to lowercase', () => {
      const config = createConfig({
        ...VALID_INPUT,
        HEDERA_NETWORK: 'MAINNET',
      });
      expect(config.hederaNetwork).toBe('mainnet');
    });

    test('testnet mirror node URL is derived by default', () => {
      const config = createConfig(VALID_INPUT);
      expect(config.mirrorNodeUrl).toBe(
        'https://testnet.mirrornode.hedera.com/api/v1'
      );
    });

    test('mainnet mirror node URL is derived when network is mainnet', () => {
      const config = createConfig({
        ...VALID_INPUT,
        HEDERA_NETWORK: 'mainnet',
      });
      expect(config.mirrorNodeUrl).toBe(
        'https://mainnet.mirrornode.hedera.com/api/v1'
      );
    });

    test('custom MIRROR_NODE_URL overrides the derived default', () => {
      const config = createConfig({
        ...VALID_INPUT,
        MIRROR_NODE_URL: 'https://custom.example.com/api/v1',
      });
      expect(config.mirrorNodeUrl).toBe('https://custom.example.com/api/v1');
    });

    test('"RSA" is the default encryption type', () => {
      const config = createConfig(VALID_INPUT);
      expect(config.encryptionType).toBe('RSA');
    });

    test('encryption type is normalised to uppercase', () => {
      const config = createConfig({ ...VALID_INPUT, ENCRYPTION_TYPE: 'ecies' });
      expect(config.encryptionType).toBe('ECIES');
    });

    test('"./data" is the default RSA data directory', () => {
      const config = createConfig(VALID_INPUT);
      expect(config.rsaDataDir).toBe('./data');
    });

    test('custom RSA_DATA_DIR is used when set', () => {
      const config = createConfig({
        ...VALID_INPUT,
        RSA_DATA_DIR: '/custom/keys',
      });
      expect(config.rsaDataDir).toBe('/custom/keys');
    });

    test('config object is frozen', () => {
      const config = createConfig(VALID_INPUT);
      expect(Object.isFrozen(config)).toBe(true);
    });
  });

  describe('validation', () => {
    test('throws when PAYER_ACCOUNT_ID is missing', () => {
      const input = { ...VALID_INPUT };
      delete input.PAYER_ACCOUNT_ID;
      expect(() => createConfig(input)).toThrow(
        'PAYER_ACCOUNT_ID is required.'
      );
    });

    test('succeeds without PAYER_PRIVATE_KEY (wallet-signer case)', () => {
      const input = { ...VALID_INPUT };
      delete input.PAYER_PRIVATE_KEY;
      const config = createConfig(input);
      expect(config.payerPrivateKey).toBeNull();
    });

    test('throws when MESSAGE_BOX_OWNER_ACCOUNT_ID is missing', () => {
      const input = { ...VALID_INPUT };
      delete input.MESSAGE_BOX_OWNER_ACCOUNT_ID;
      expect(() => createConfig(input)).toThrow(
        'MESSAGE_BOX_OWNER_ACCOUNT_ID is required.'
      );
    });

    test('succeeds without MESSAGE_BOX_OWNER_PRIVATE_KEY (wallet-signer case)', () => {
      const input = { ...VALID_INPUT };
      delete input.MESSAGE_BOX_OWNER_PRIVATE_KEY;
      const config = createConfig(input);
      expect(config.messageBoxOwnerPrivateKey).toBeNull();
    });

    test('throws on empty input', () => {
      expect(() => createConfig({})).toThrow('PAYER_ACCOUNT_ID is required.');
    });
  });

  describe('field mapping', () => {
    test('maps all required env var names to config properties', () => {
      const config = createConfig(VALID_INPUT);
      expect(config.payerAccountId).toBe('0.0.100');
      expect(config.payerPrivateKey).toBe('test-payer-key');
      expect(config.messageBoxOwnerAccountId).toBe('0.0.200');
      expect(config.messageBoxOwnerPrivateKey).toBe('test-owner-key');
    });
  });
});
