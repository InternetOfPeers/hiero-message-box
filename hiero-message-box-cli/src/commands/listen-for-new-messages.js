'use strict';

const {
  createConfig,
  createMessageBox,
} = require('@internetofpeers/hiero-message-box');
const { NodeKeyStore } = require('../node-key-store');
const { ConsoleLogger } = require('../console-logger');

async function main() {
  try {
    const config = createConfig(process.env);
    const keyStore = new NodeKeyStore(config.rsaDataDir, config.messageBoxOwnerAccountId);
    const messageBox = createMessageBox({
      config,
      keyStore,
      logger: ConsoleLogger,
    });

    const accountId = config.messageBoxOwnerAccountId;
    console.log(`⚙ Listening for messages for account ${accountId}`);
    console.log('✓ Polling every 3 seconds. Press Ctrl+C to exit\n');

    while (true) {
      const messages = await messageBox.pollMessages(accountId);
      if (messages.length > 0) {
        console.log(`${messages.length} new message(s) received`);
        messages.forEach(message => console.log(`📥 ${message}`));
      }
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n\n⚙ Shutting down...');
  process.exit(0);
});

main();
