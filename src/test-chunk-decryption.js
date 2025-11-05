const { initializeClient } = require('./lib/hedera');
const { loadEnvFile } = require('./lib/common');
const { sendMessage } = require('./lib/message-box');

let client = null;

async function main() {
  try {
    loadEnvFile();
    client = initializeClient();

    const recipientAccountId = process.argv[2] || '0.0.1441';

    // Generate a message that will result in ~1.2KB encrypted payload (2 chunks)
    const testMessage = 'CHUNK_TEST: ' + 'X'.repeat(400);
    const sizeKB = (Buffer.byteLength(testMessage, 'utf8') / 1024).toFixed(2);

    console.log(
      `⚙ Sending medium message to test chunking:\n  - Recipient: ${recipientAccountId}\n  - Message size: ${sizeKB} KB\n  - Expected chunks: 2-3`
    );

    await sendMessage(client, recipientAccountId, testMessage);

    console.log('\n✓ Message sent successfully!');

    client.close();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (client) client.close();
    process.exit(1);
  }
}

main();
