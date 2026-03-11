/**
 * Integration tests for hiero-message-box
 * Tests the main flows: setup, send, check, and remove message boxes
 *
 * Prerequisites:
 * - Set up .env file with test account credentials
 * - Ensure sufficient HBAR balance for transactions
 *
 * Run with: npm run test:integration
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

describe('Message Box Integration', () => {
  let client;
  let testAccountId;
  let messageBoxId;

  beforeAll(() => {
    client = initializeClient();
    testAccountId = config.messageBoxOwnerAccountId;
  });

  afterAll(() => {
    if (client) client.close();
  });

  test('Setup Message Box', async () => {
    const result = await setupMessageBox(client, testAccountId, { skipPrompts: true });

    expect(result.success).toBe(true);
    expect(result.messageBoxId).toBeTruthy();

    messageBoxId = result.messageBoxId;

    await new Promise(resolve => setTimeout(resolve, 4000));
  });

  test('Send Message', async () => {
    const testMessage = `Test message at ${Date.now()}`;
    await sendMessage(client, testAccountId, testMessage, { useCBOR: false });

    await new Promise(resolve => setTimeout(resolve, 4000));
  });

  test('Send Message (CBOR)', async () => {
    const testMessage = `CBOR test message at ${Date.now()}`;
    await sendMessage(client, testAccountId, testMessage, { useCBOR: true });

    await new Promise(resolve => setTimeout(resolve, 4000));
  });

  test('Check Messages', async () => {
    const messages = await checkMessages(
      testAccountId,
      2, // Start from sequence 2 (skip public key message)
      undefined // Get all messages
    );

    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(2);

    const hasTestMessage = messages.some(msg => msg.includes('Test message at'));
    const hasCBORMessage = messages.some(msg => msg.includes('CBOR test message at'));

    expect(hasTestMessage).toBe(true);
    expect(hasCBORMessage).toBe(true);
  });

  test('Message Box Reuse (Idempotency)', async () => {
    const result = await setupMessageBox(client, testAccountId, { skipPrompts: true });

    expect(result.success).toBe(true);
    expect(result.messageBoxId).toBe(messageBoxId);
  });

  test('Signature Verification', async () => {
    // Sending a message implicitly tests signature verification
    // If verification fails, sendMessage will throw
    const testMessage = 'Signature verification test';
    await sendMessage(client, testAccountId, testMessage);
  });

  test('Remove Message Box', async () => {
    const result = await removeMessageBox(client, testAccountId);

    expect(result.success).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 4000));
  });

  test('Link Message Box (re-attach existing topic)', async () => {
    expect(messageBoxId).toBeTruthy();

    const result = await linkMessageBox(client, testAccountId, messageBoxId);

    expect(result.success).toBe(true);
    expect(result.messageBoxId).toBe(messageBoxId);

    await new Promise(resolve => setTimeout(resolve, 4000));
  });

  test('Link Message Box (idempotent – already linked)', async () => {
    const result = await linkMessageBox(client, testAccountId, messageBoxId);

    expect(result.messageBoxId).toBe(messageBoxId);
    expect(result.alreadyLinked).toBe(true);
  });

  test('Link Message Box (rejects wrong account)', async () => {
    const fakeAccountId = '0.0.99999999';
    await expect(
      linkMessageBox(client, fakeAccountId, messageBoxId)
    ).rejects.toMatchObject({
      message: expect.stringMatching(/configured for account|does not exist|inaccessible/),
    });
  });

  test('Send Message After Re-link', async () => {
    const testMessage = `Re-link test message at ${Date.now()}`;
    await sendMessage(client, testAccountId, testMessage);

    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  test('Remove Message Box (final cleanup)', async () => {
    const result = await removeMessageBox(client, testAccountId);

    expect(result.success).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 4000));
  });
});


