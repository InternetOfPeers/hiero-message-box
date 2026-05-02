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
    const cborIndex = args.indexOf('--cbor');
    const useCBOR = cborIndex !== -1;
    if (useCBOR) args.splice(cborIndex, 1);

    if (args.length < 2) {
      console.error(
        '\n✗ Usage: hmb send-message <account-id> <message> [--cbor]'
      );
      console.error('✓ Examples:');
      console.error('  hmb send-message 0.0.1234 "Hello!"');
      console.error('  hmb send-message 0.0.1234 "Hello!" --cbor\n');
      process.exit(1);
    }

    const config = createConfig(process.env);
    const keyStore = new NodeKeyStore(config.rsaDataDir, config.messageBoxOwnerAccountId);
    messageBox = createMessageBox({
      config,
      keyStore,
      logger: ConsoleLogger,
    });

    const recipientAccountId = args[0];
    const message = args.slice(1).join(' ');
    const format = useCBOR ? 'CBOR' : 'JSON';
    console.log(
      `⚙ Sending message:\n  - Recipient: ${recipientAccountId}\n  - Message before encryption: "${message}"\n  - Format: ${format}`
    );
    await messageBox.sendMessage(recipientAccountId, message, { useCBOR });
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
