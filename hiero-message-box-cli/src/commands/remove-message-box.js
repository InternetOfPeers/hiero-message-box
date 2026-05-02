'use strict';

const {
  createConfig,
  createMessageBox,
} = require('@internetofpeers/hiero-message-box');
const { NodeKeyStore } = require('../node-key-store');
const { ConsoleLogger } = require('../console-logger');

let messageBox = null;

async function main() {
  try {
    const config = createConfig(process.env);
    const keyStore = new NodeKeyStore(config.rsaDataDir, config.messageBoxOwnerAccountId);
    messageBox = createMessageBox({
      config,
      keyStore,
      logger: ConsoleLogger,
    });

    const accountId = config.messageBoxOwnerAccountId;
    console.log(`⚙ Removing message box for account ${accountId}`);
    await messageBox.removeMessageBox(accountId);
    messageBox.close();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (messageBox) messageBox.close();
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n\n⚙ Shutting down...');
  if (messageBox) messageBox.close();
  process.exit(0);
});

main();
