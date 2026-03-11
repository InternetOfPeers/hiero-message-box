const { initializeClient } = require('./lib/hedera');
const { config } = require('./lib/config');
const { linkMessageBox } = require('./lib/message-box');

let client = null;

async function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length < 1) {
      console.error('\n✗ Usage: node link-message-box.js <topic-id>');
      console.error('✓ Example:');
      console.error('  node link-message-box.js 0.0.1234\n');
      process.exit(1);
    }

    const topicId = args[0];
    client = initializeClient();
    const accountId = config.messageBoxOwnerAccountId;
    console.log(`⚙ Linking message box ${topicId} to account ${accountId}`);
    await linkMessageBox(client, accountId, topicId);
    client.close();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (client) client.close();
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚙ Shutting down...');
  if (client) client.close();
  process.exit(0);
});

main();
