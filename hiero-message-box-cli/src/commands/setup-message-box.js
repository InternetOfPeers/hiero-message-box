'use strict';

const {
  createConfig,
  createMessageBox,
} = require('@internetofpeers/hiero-message-box');
const { NodeKeyStore } = require('../node-key-store');
const { ConsoleLogger } = require('../console-logger');
const { promptYesNo } = require('../prompts');

let messageBox = null;

async function main() {
  try {
    const config = createConfig(process.env);
    const keyStore = new NodeKeyStore(config.rsaDataDir, config.messageBoxOwnerAccountId);
    messageBox = createMessageBox({
      config,
      keyStore,
      logger: ConsoleLogger,
      prompt: promptYesNo,
    });

    console.log(
      `⚙ Setup message box for account ${config.messageBoxOwnerAccountId}`
    );
    await messageBox.setupMessageBox();
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
