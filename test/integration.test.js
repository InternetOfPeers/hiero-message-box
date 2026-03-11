/**
 * Integration tests for hiero-message-box
 * Tests the main flows: setup, send, check, and remove message boxes
 *
 * Prerequisites:
 * - Set up .env file with test account credentials
 * - Ensure sufficient HBAR balance for transactions
 *
 * Run with: node test/integration.test.js
 */

const { initializeClient } = require('../src/lib/hedera');
const { config } = require('../src/lib/config');
const {
  setupMessageBox,
  linkMessageBox,
  sendMessage,
  checkMessages,
  removeMessageBox,
} = require('../src/lib/message-box');

// Test utilities
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`);
  }
};

const testPassed = testName => {
  console.log(`✅ ${testName}`);
};

const testFailed = (testName, error) => {
  console.error(`❌ ${testName}: ${error.message}`);
  process.exit(1);
};

let client = null;
let testAccountId = null;
let messageBoxId = null;

// == Test Suite ==============================================================

async function testSetupMessageBox() {
  const testName = 'Setup Message Box';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    const result = await setupMessageBox(
      client,
      testAccountId,
      { skipPrompts: true }
    );

    assert(result.success, 'Setup should succeed');
    assert(result.messageBoxId, 'Should return message box ID');

    messageBoxId = result.messageBoxId;

    // Wait for account memo to propagate to Mirror Node
    await new Promise(resolve => setTimeout(resolve, 4000));

    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}

async function testSendMessage() {
  const testName = 'Send Message';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    const testMessage = `Test message at ${Date.now()}`;

    await sendMessage(client, testAccountId, testMessage, { useCBOR: false });

    // Wait for message to propagate to Mirror Node
    await new Promise(resolve => setTimeout(resolve, 4000));

    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}

async function testSendMessageCBOR() {
  const testName = 'Send Message (CBOR)';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    const testMessage = `CBOR test message at ${Date.now()}`;

    await sendMessage(client, testAccountId, testMessage, { useCBOR: true });

    // Wait for message to propagate to Mirror Node
    await new Promise(resolve => setTimeout(resolve, 4000));

    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}

async function testCheckMessages() {
  const testName = 'Check Messages';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    const messages = await checkMessages(
      testAccountId,
      2, // Start from sequence 2 (skip public key message)
      undefined // Get all messages
    );

    assert(Array.isArray(messages), 'Should return array of messages');
    assert(messages.length >= 2, 'Should have at least 2 test messages');

    // Verify messages contain expected content
    const hasTestMessage = messages.some(msg =>
      msg.includes('Test message at')
    );
    const hasCBORMessage = messages.some(msg =>
      msg.includes('CBOR test message at')
    );

    assert(hasTestMessage, 'Should find JSON test message');
    assert(hasCBORMessage, 'Should find CBOR test message');

    console.log(`   Found ${messages.length} message(s)`);
    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}

async function testMessageBoxReuse() {
  const testName = 'Message Box Reuse (Idempotency)';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    // Setup again should recognize existing message box
    const result = await setupMessageBox(
      client,
      testAccountId,
      { skipPrompts: true }
    );

    assert(result.success, 'Second setup should succeed');
    assert(
      result.messageBoxId === messageBoxId,
      'Should return same message box ID'
    );

    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}

async function testSignatureVerification() {
  const testName = 'Signature Verification';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    // Sending a message implicitly tests signature verification
    // If verification fails, sendMessage will throw
    const testMessage = 'Signature verification test';

    await sendMessage(client, testAccountId, testMessage);

    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}

async function testRemoveMessageBox() {
  const testName = 'Remove Message Box';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    const result = await removeMessageBox(client, testAccountId);

    assert(result.success, 'Remove should succeed');

    // Wait for account memo to propagate to Mirror Node
    await new Promise(resolve => setTimeout(resolve, 4000));

    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}

async function testLinkMessageBox() {
  const testName = 'Link Message Box (re-attach existing topic)';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    assert(messageBoxId, 'messageBoxId must be set from a previous setup test');

    // The account memo was cleared by testRemoveMessageBox; link the existing topic back
    const result = await linkMessageBox(client, testAccountId, messageBoxId);

    assert(result.success, 'Link should succeed');
    assert(
      result.messageBoxId === messageBoxId,
      'Should link to the provided topic ID'
    );

    // Wait for account memo to propagate to Mirror Node
    await new Promise(resolve => setTimeout(resolve, 4000));

    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}

async function testLinkMessageBoxIdempotent() {
  const testName = 'Link Message Box (idempotent – already linked)';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    // Calling link again with the same topic ID should be a no-op (no new transaction)
    const result = await linkMessageBox(client, testAccountId, messageBoxId);
    assert(
      result.messageBoxId === messageBoxId,
      'Should return the same message box ID'
    );
    assert(
      result.alreadyLinked === true,
      'Should report alreadyLinked=true (no new transaction issued)'
    );

    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}

async function testLinkMessageBoxWrongAccount() {
  const testName = 'Link Message Box (rejects wrong account)';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    // Attempt to link the topic to a different (non-existent) account ID
    // The proof inside the topic references testAccountId, so linking to a
    // different account should throw an error.
    const fakeAccountId = '0.0.99999999';
    let threw = false;
    try {
      await linkMessageBox(client, fakeAccountId, messageBoxId);
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('configured for account') ||
          err.message.includes('does not exist') ||
          err.message.includes('inaccessible'),
        `Expected account mismatch error, got: ${err.message}`
      );
    }
    assert(threw, 'Should throw when linking to wrong account');

    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}

async function testSendMessageAfterRelink() {
  const testName = 'Send Message After Re-link';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    // Verify that the re-linked message box can still receive messages
    const testMessage = `Re-link test message at ${Date.now()}`;
    await sendMessage(client, testAccountId, testMessage);

    await new Promise(resolve => setTimeout(resolve, 3000));

    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}

// == Main Test Runner ========================================================

async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  HIERO MESSAGE BOX - INTEGRATION TESTS');
  console.log('═══════════════════════════════════════════════════════');

  try {
    // Initialize
    client = initializeClient();

    console.log(`\n📋 Test Account: ${config.messageBoxOwnerAccountId}`);
    console.log(`📋 Network: ${config.hederaNetwork}`);

    // Run tests in sequence
    await testSetupMessageBox();
    await testSendMessage();
    await testSendMessageCBOR();
    await testCheckMessages();
    await testMessageBoxReuse();
    await testSignatureVerification();
    await testRemoveMessageBox();
    await testLinkMessageBox();
    await testLinkMessageBoxIdempotent();
    await testLinkMessageBoxWrongAccount();
    await testSendMessageAfterRelink();
    await testRemoveMessageBox();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ✅ ALL TESTS PASSED');
    console.log('═══════════════════════════════════════════════════════\n');

    client.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    if (client) client.close();
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚙ Test interrupted...');
  if (client) client.close();
  process.exit(1);
});

// Run tests
runTests();
