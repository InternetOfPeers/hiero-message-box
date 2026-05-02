'use strict';

const { createConfig } = require('./config');
const { createMessageBox } = require('./message-box');
const { InMemoryKeyStore } = require('./adapters/key-store');
const { NoopLogger } = require('./adapters/logger');

module.exports = {
  createConfig,
  createMessageBox,
  InMemoryKeyStore,
  NoopLogger,
};
