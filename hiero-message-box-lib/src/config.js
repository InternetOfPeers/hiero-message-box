'use strict';

/**
 * Pure config factory — no fs, no process.env, no side effects.
 * Callers (CLI, tests) are responsible for loading env vars and passing them in.
 *
 * @param {Record<string, string|undefined>} input - Environment variable map (e.g. process.env)
 * @returns {Readonly<Object>} Frozen config object
 */
function createConfig(input = {}) {
  const payerAccountId = input.PAYER_ACCOUNT_ID || null;
  const payerPrivateKey = input.PAYER_PRIVATE_KEY || null;
  const messageBoxOwnerAccountId = input.MESSAGE_BOX_OWNER_ACCOUNT_ID || null;
  const messageBoxOwnerPrivateKey = input.MESSAGE_BOX_OWNER_PRIVATE_KEY || null;

  if (!payerAccountId) throw new Error('PAYER_ACCOUNT_ID is required.');
  if (!messageBoxOwnerAccountId)
    throw new Error('MESSAGE_BOX_OWNER_ACCOUNT_ID is required.');
  // Private keys are optional here — required only when no wallet signer is
  // provided, which is validated at createMessageBox() time.

  const hederaNetwork = (input.HEDERA_NETWORK || 'testnet').toLowerCase();
  const defaultMirrorNodeUrl =
    hederaNetwork === 'mainnet'
      ? 'https://mainnet.mirrornode.hedera.com/api/v1'
      : 'https://testnet.mirrornode.hedera.com/api/v1';

  return Object.freeze({
    payerAccountId,
    payerPrivateKey,
    hederaNetwork,
    messageBoxOwnerAccountId,
    messageBoxOwnerPrivateKey,
    encryptionType: (input.ENCRYPTION_TYPE || 'RSA').toUpperCase(),
    rsaDataDir: input.RSA_DATA_DIR || './data',
    mirrorNodeUrl: input.MIRROR_NODE_URL || defaultMirrorNodeUrl,
  });
}

module.exports = { createConfig };
