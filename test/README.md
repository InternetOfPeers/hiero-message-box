# Test Suite

This directory contains the test suites for the Hiero Message Box system. Tests are run with [Jest](https://jestjs.io/).

## Test Files

| File                  | Type             | Credentials needed |
| --------------------- | ---------------- | ------------------ |
| `unit.test.js`        | Unit tests       | No                 |
| `integration.test.js` | End-to-end tests | Yes (`.env`)       |

---

## Unit Tests (`unit.test.js`)

Fully offline tests for `formatMessage` in `src/lib/format-message.js`. No Hedera connection or credentials required.

### Covered exit paths

1. **Exit 1** – `HIP-1334_ENCRYPTED_MESSAGE` with correct private key → decrypts and returns plaintext
2. **Exit 2** – `HIP-1334_ENCRYPTED_MESSAGE` with wrong private key → returns `(cannot decrypt)` notice
3. **Exit 3** – `payload.type === 'HIP-1334_PUBLIC_KEY'` → returns public key summary
4. **Exit 4** – Unrecognised / plain-text content → returns raw content

### Running

```bash
npm run test:unit
```

---

## Integration Tests (`integration.test.js`)

End-to-end tests that exercise the full Hedera flow. Run sequentially (`--runInBand`) to preserve shared state across tests.

### Tests

1. **Setup Message Box** – Creating and validating message boxes
2. **Send Message** – Sending encrypted messages (JSON format)
3. **Send Message (CBOR)** – Sending encrypted messages (CBOR format)
4. **Check Messages** – Retrieving and decrypting messages
5. **Message Box Reuse** – Idempotency of setup operations
6. **Signature Verification** – Ownership proof validation
7. **Remove Message Box** – Cleaning up message box references
8. **Link Message Box** – Re-attaching an existing topic to an account memo
9. **Link Message Box (Idempotent)** – Re-linking an already-linked topic is a no-op
10. **Link Message Box (Wrong Account)** – Rejects linking a topic to the wrong account
11. **Send Message After Re-link** – Verifying the re-linked box can receive messages
12. **Remove Message Box** (final cleanup)

### Prerequisites

Before running, ensure:

- `.env` file is properly configured with test account credentials:
  - `PAYER_ACCOUNT_ID` – Account that pays transaction fees
  - `PAYER_PRIVATE_KEY` – Private key for the payer account
  - `MESSAGE_BOX_OWNER_ACCOUNT_ID` – Account ID for the message box owner
  - `MESSAGE_BOX_OWNER_PRIVATE_KEY` – Private key for the message box owner

  All four credentials are **required**. The config module validates them at startup
  and fails immediately with a clear error if any are missing.

- Test account has sufficient HBAR balance for:
  - Topic creation (~$1 USD)
  - Account updates
  - Message submissions
  - Transaction fees

### Running

```bash
# Integration tests only
npm run test:integration

# All tests (unit + integration)
npm test
```

---

## Running All Tests

```bash
npm test
```

Runs unit tests first (offline), then integration tests sequentially.

---

## Adding New Tests

### Unit test

Add a `test()` block inside the existing `describe` in `unit.test.js`:

```javascript
test('my new case', () => {
  const msg = makeMsg({ /* ... */ }, 6);
  const result = formatMessage(msg, null, 'RSA');
  expect(result).toContain('expected string');
});
```

### Integration test

Add a `test()` block inside the `describe` in `integration.test.js`:

```javascript
test('New Feature', async () => {
  console.log('\n🧪 Testing: New Feature');

  // Test implementation using the shared `client` and `testAccountId`
  const result = await someOperation(client, testAccountId);

  expect(result.success).toBe(true);
});
```

Insert it in the `describe` block at the appropriate position in the sequence (shared state like `messageBoxId` flows from top to bottom).

---

## Troubleshooting

### Test Failures

If tests fail, check:

1. **Environment Variables**
   - Verify `.env` file exists and is properly formatted
   - Ensure all required variables are set
   - Check that private keys are valid hex strings

2. **Account Balance**
   - Verify sufficient HBAR balance
   - Check recent transactions on HashScan

3. **Network Issues**
   - Ensure network connectivity
   - Verify Mirror Node API access
   - Check for Hedera network status
