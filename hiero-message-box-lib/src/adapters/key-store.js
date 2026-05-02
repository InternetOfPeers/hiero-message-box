'use strict';

/**
 * KeyStore interface (duck-typed):
 *   loadRSAKeyPair(): Promise<{publicKey:string, privateKey:string}|null>
 *   saveRSAKeyPair(pair: {publicKey:string, privateKey:string}): Promise<void>
 */

class InMemoryKeyStore {
  constructor() {
    this._pair = null;
  }

  async loadRSAKeyPair() {
    return this._pair;
  }

  async saveRSAKeyPair(pair) {
    this._pair = pair;
  }
}

module.exports = { InMemoryKeyStore };
