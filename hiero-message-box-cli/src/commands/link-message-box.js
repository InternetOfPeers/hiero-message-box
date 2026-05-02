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
    const args = process.argv.slice(2);
    if (args.length < 1) {
      console.error('\n✗ Usage: hmb link-message-box <topic-id>');
      console.error('✓ Example:');
      console.error('  hmb link-message-box 0.0.1234\n');
      process.exit(1);
    }

    const topicId = args[0];
    const config = createConfig(process.env);
    const keyStore = new NodeKeyStore(config.rsaDataDir, config.messageBoxOwnerAccountId);
    messageBox = createMessageBox({
      config,
      keyStore,
      logger: ConsoleLogger,
    });

    const accountId = config.messageBoxOwnerAccountId;
    console.log(`⚙ Linking message box ${topicId} to account ${accountId}`);
    await messageBox.linkMessageBox(accountId, topicId);
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
