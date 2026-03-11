const fs = require('fs');
const path = require('path');

/**
 * Find the project root directory by looking for package.json
 * @param {string} startDir - The directory to start searching from
 * @returns {string} The project root directory
 */
function findProjectRoot(startDir = __dirname) {
  let currentDir = startDir;
  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) return currentDir;
    currentDir = path.dirname(currentDir);
  }
  return startDir;
}

/**
 * Load environment variables from .env file (native implementation)
 */
function loadEnvFile() {
  const PROJECT_ROOT = findProjectRoot();
  const ENV_FILE = path.join(PROJECT_ROOT, '.env');

  if (!fs.existsSync(ENV_FILE)) {
    console.debug('.env file not found.');
    return;
  }

  try {
    const envContent = fs.readFileSync(ENV_FILE, 'utf8');
    const lines = envContent.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) continue;

      const separatorIndex = trimmedLine.indexOf('=');
      if (separatorIndex !== -1) {
        const key = trimmedLine.substring(0, separatorIndex).trim();
        let value = trimmedLine.substring(separatorIndex + 1).trim();

        // Remove quotes if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.substring(1, value.length - 1);
        }

        if (!process.env[key]) process.env[key] = value;
      }
    }

    console.debug('✓ Environment variables loaded from .env file');
  } catch (error) {
    console.error('✗ Error loading .env file:', error.message);
  }
}

// == Config singleton =========================================================

// Self-initialize: load .env overrides first, then build the config object
// once at module load time. All other modules import `config` directly.
loadEnvFile();

/**
 * Application config singleton. Populated from environment variables (and any
 * .env overrides) when this module is first required. This is the single place
 * where all defaults are defined – no other module should read process.env.
 */
const config = {
  // Hedera network
  payerAccountId: process.env.PAYER_ACCOUNT_ID || null,
  payerPrivateKey: process.env.PAYER_PRIVATE_KEY || null,
  hederaNetwork: (process.env.HEDERA_NETWORK || 'testnet').toLowerCase(),
  // Message box owner credentials
  messageBoxOwnerAccountId: process.env.MESSAGE_BOX_OWNER_ACCOUNT_ID || null,
  messageBoxOwnerPrivateKey: process.env.MESSAGE_BOX_OWNER_PRIVATE_KEY || null,

  // Encryption settings (default: RSA)
  encryptionType: (process.env.ENCRYPTION_TYPE || 'RSA').toUpperCase(),

  // Local storage for RSA key files (default: current working directory)
  rsaDataDir: process.env.RSA_DATA_DIR || '.',
};

// Derive mirror node URL default from network if not explicitly set
const _defaultMirrorNodeUrl =
  config.hederaNetwork === 'mainnet'
    ? 'https://mainnet.mirrornode.hedera.com/api/v1'
    : 'https://testnet.mirrornode.hedera.com/api/v1';
config.mirrorNodeUrl = process.env.MIRROR_NODE_URL || _defaultMirrorNodeUrl;

// Validate required fields immediately so every script fails fast with a clear
// message instead of a cryptic error deep inside a library call.
if (!config.payerAccountId) throw new Error('PAYER_ACCOUNT_ID is required.');
if (!config.payerPrivateKey) throw new Error('PAYER_PRIVATE_KEY is required.');
if (!config.messageBoxOwnerAccountId) throw new Error('MESSAGE_BOX_OWNER_ACCOUNT_ID is required.');
if (!config.messageBoxOwnerPrivateKey) throw new Error('MESSAGE_BOX_OWNER_PRIVATE_KEY is required.');

// == Exports =================================================================

module.exports = { config };
