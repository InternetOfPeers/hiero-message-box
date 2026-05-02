'use strict';

const {
  createConfig,
  createMessageBox,
} = require('@internetofpeers/hiero-message-box');
const { NodeKeyStore } = require('../node-key-store');
const { ConsoleLogger } = require('../console-logger');

async function main() {
  try {
    const args = process.argv.slice(2);
    const startSequence = args[0] ? parseInt(args[0]) : 2;
    const endSequence = args[1] ? parseInt(args[1]) : undefined;

    if (isNaN(startSequence) || startSequence < 1) {
      console.error('\n✗ Error: Start sequence must be a positive number');
      console.error(
        '✓ Usage: hmb check-messages [start-sequence] [end-sequence]'
      );
      console.error('✓ Examples:');
      console.error(
        '  hmb check-messages              # from sequence 2 onwards'
      );
      console.error('  hmb check-messages 5            # from sequence 5');
      console.error('  hmb check-messages 5 10         # from 5 to 10\n');
      process.exit(1);
    }

    if (
      endSequence !== undefined &&
      (isNaN(endSequence) || endSequence < startSequence)
    ) {
      console.error(
        '\n✗ Error: End sequence must be a number >= start sequence'
      );
      process.exit(1);
    }

    const config = createConfig(process.env);
    const keyStore = new NodeKeyStore(config.rsaDataDir, config.messageBoxOwnerAccountId);
    const messageBox = createMessageBox({
      config,
      keyStore,
      logger: ConsoleLogger,
    });

    const accountId = config.messageBoxOwnerAccountId;
    console.log(`⚙ Checking messages for account ${accountId}`);

    const messages = await messageBox.checkMessages(
      accountId,
      startSequence,
      endSequence
    );

    if (messages.length === 0) {
      console.log('✓ No messages found in the specified range\n');
    } else {
      console.log(`✓ Found ${messages.length} message(s):\n`);
      messages.forEach(message => console.log(`📥 ${message}`));
      console.log();
    }

    process.exit(0);
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
