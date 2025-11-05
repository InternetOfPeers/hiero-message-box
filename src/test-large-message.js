const { initializeClient } = require('./lib/hedera');
const { loadEnvFile } = require('./lib/common');
const { sendMessage } = require('./lib/message-box');

let client = null;

async function main() {
  try {
    loadEnvFile();
    client = initializeClient();

    const recipientAccountId = process.argv[2];
    const useCBOR = process.argv.includes('--cbor');

    if (!recipientAccountId) {
      console.error(
        '\n✗ Usage: node test-large-message.js <account-id> [--cbor]'
      );
      console.error('✓ Example:');
      console.error('  node test-large-message.js 0.0.1234');
      console.error('  node test-large-message.js 0.0.1234 --cbor\n');
      process.exit(1);
    }

    // Generate a large message (> 1KB to test chunking)
    const baseMessage = 'This is a test message for HCS chunking. ';
    const largeMessage = baseMessage.repeat(50); // ~2KB message
    const sizeKB = (Buffer.byteLength(largeMessage, 'utf8') / 1024).toFixed(2);

    console.log(
      `⚙ Sending large message to test chunking:\n  - Recipient: ${recipientAccountId}\n  - Message size: ${sizeKB} KB (${largeMessage.length} characters)\n  - Format: ${useCBOR ? 'CBOR' : 'JSON'}\n  - Expected: Message will be split into chunks by HCS`
    );

    await sendMessage(client, recipientAccountId, largeMessage, { useCBOR });

    console.log('\n✓ Large message sent successfully!');
    console.log(
      '⚙ Use check-messages to verify the message was reassembled correctly.'
    );

    client.close();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (client) client.close();
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n\n⚙ Shutting down...');
  if (client) client.close();
  process.exit(0);
});

main();
