'use strict';

/**
 * Integration tests — hit live Hedera testnet.
 * Prerequisites: .env file at the git repo root with valid credentials and HBAR balance.
 * Run with: npm run test:integration
 */

const {
  createConfig,
  createMessageBox,
  InMemoryKeyStore,
  NoopLogger,
} = require('../src/index');

describe('Message Box Integration', () => {
  let messageBox, config;
  let testAccountId;
  let messageBoxId;

  beforeAll(() => {
    config = createConfig(process.env);
    testAccountId = config.messageBoxOwnerAccountId;

    const keyStore = new InMemoryKeyStore();
    messageBox = createMessageBox({
      config,
      keyStore,
      logger: NoopLogger,
      prompt: null, // auto-proceed on conflicts
    });
  });

  afterAll(() => {
    if (messageBox) messageBox.close();
  });

  test('Setup Message Box', async () => {
    const result = await messageBox.setupMessageBox();

    expect(result.success).toBe(true);
    expect(result.messageBoxId).toBeTruthy();

    messageBoxId = result.messageBoxId;

    await new Promise(resolve => setTimeout(resolve, 4000));
  });

  test('Send Message', async () => {
    const testMessage = `Test message at ${Date.now()}`;
    await messageBox.sendMessage(testAccountId, testMessage, {
      useCBOR: false,
    });

    await new Promise(resolve => setTimeout(resolve, 4000));
  });

  test('Send Message (CBOR)', async () => {
    const testMessage = `CBOR test message at ${Date.now()}`;
    await messageBox.sendMessage(testAccountId, testMessage, { useCBOR: true });

    await new Promise(resolve => setTimeout(resolve, 4000));
  });

  test('Check Messages', async () => {
    const messages = await messageBox.checkMessages(
      testAccountId,
      2,
      undefined
    );

    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThanOrEqual(2);

    const hasTestMessage = messages.some(msg =>
      msg.includes('Test message at')
    );
    const hasCBORMessage = messages.some(msg =>
      msg.includes('CBOR test message at')
    );

    expect(hasTestMessage).toBe(true);
    expect(hasCBORMessage).toBe(true);
  });

  test('Message Box Reuse (Idempotency)', async () => {
    const result = await messageBox.setupMessageBox();

    expect(result.success).toBe(true);
    expect(result.messageBoxId).toBe(messageBoxId);
  });

  test('Signature Verification', async () => {
    const testMessage = 'Signature verification test';
    await messageBox.sendMessage(testAccountId, testMessage);
  });

  test('Remove Message Box', async () => {
    const result = await messageBox.removeMessageBox(testAccountId);

    expect(result.success).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 4000));
  });

  test('Link Message Box (re-attach existing topic)', async () => {
    expect(messageBoxId).toBeTruthy();

    const result = await messageBox.linkMessageBox(testAccountId, messageBoxId);

    expect(result.success).toBe(true);
    expect(result.messageBoxId).toBe(messageBoxId);

    await new Promise(resolve => setTimeout(resolve, 4000));
  });

  test('Link Message Box (idempotent – already linked)', async () => {
    const result = await messageBox.linkMessageBox(testAccountId, messageBoxId);

    expect(result.messageBoxId).toBe(messageBoxId);
    expect(result.alreadyLinked).toBe(true);
  });

  test('Link Message Box (rejects wrong account)', async () => {
    const fakeAccountId = '0.0.99999999';
    await expect(
      messageBox.linkMessageBox(fakeAccountId, messageBoxId)
    ).rejects.toMatchObject({
      message: expect.stringMatching(
        /configured for account|does not exist|inaccessible/
      ),
    });
  });

  test('Send Message After Re-link', async () => {
    const testMessage = `Re-link test message at ${Date.now()}`;
    await messageBox.sendMessage(testAccountId, testMessage);

    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  test('Remove Message Box (final cleanup)', async () => {
    const result = await messageBox.removeMessageBox(testAccountId);

    expect(result.success).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 4000));
  });
});
