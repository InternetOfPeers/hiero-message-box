'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Filesystem-backed KeyStore implementation.
 * Stores RSA key pairs as PEM files in a configured directory,
 * scoped per account: rsa_private_<accountId>.pem / rsa_public_<accountId>.pem
 */
class NodeKeyStore {
  /**
   * @param {string} dataDir   - Directory to store key files
   * @param {string} accountId - Hiero account ID (e.g. "0.0.1441"); used as filename prefix
   */
  constructor(dataDir, accountId) {
    this._dataDir = dataDir;
    this._accountId = accountId;
  }

  get _privateKeyPath() {
    return path.join(this._dataDir, `rsa_private_${this._accountId}.pem`);
  }

  get _publicKeyPath() {
    return path.join(this._dataDir, `rsa_public_${this._accountId}.pem`);
  }

  async loadRSAKeyPair() {
    const privPath = this._privateKeyPath;
    const pubPath = this._publicKeyPath;
    if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
      return {
        privateKey: fs.readFileSync(privPath, 'utf8'),
        publicKey: fs.readFileSync(pubPath, 'utf8'),
      };
    }
    return null;
  }

  async saveRSAKeyPair({ publicKey, privateKey }) {
    if (!fs.existsSync(this._dataDir)) {
      fs.mkdirSync(this._dataDir, { recursive: true });
    }
    fs.writeFileSync(this._privateKeyPath, privateKey, 'utf8');
    fs.writeFileSync(this._publicKeyPath, publicKey, 'utf8');
  }
}

module.exports = { NodeKeyStore };
