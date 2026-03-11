# Test Suite

This directory contains integration tests for the Hiero Message Box system.

## Overview

The test suite validates all main flows of the message box system:

1. **Setup Message Box** - Creating and validating message boxes
2. **Send Message** - Sending encrypted messages (JSON format)
3. **Send Message (CBOR)** - Sending encrypted messages (CBOR format)
4. **Check Messages** - Retrieving and decrypting messages
5. **Message Box Reuse** - Idempotency of setup operations
6. **Signature Verification** - Ownership proof validation
7. **Remove Message Box** - Cleaning up message box references
8. **Link Message Box** - Re-attaching an existing topic to an account memo
9. **Link Message Box (Idempotent)** - Re-linking an already-linked topic is a no-op
10. **Link Message Box (Wrong Account)** - Rejects linking a topic to the wrong account
11. **Send Message After Re-link** - Verifying the re-linked box can receive messages
12. **Remove Message Box** (final cleanup)

## Prerequisites

Before running tests, ensure:

- `.env` file is properly configured with test account credentials:
  - `PAYER_ACCOUNT_ID` - Account that pays transaction fees
  - `PAYER_PRIVATE_KEY` - Private key for the payer account
  - `MESSAGE_BOX_OWNER_ACCOUNT_ID` - Account ID for the message box owner
  - `MESSAGE_BOX_OWNER_PRIVATE_KEY` - Private key for the message box owner

  All four credentials are **required**. The config module validates them at startup
  and fails immediately with a clear error if any are missing.

- Test account has sufficient HBAR balance for:
  - Topic creation (~$1 USD)
  - Account updates
  - Message submissions
  - Transaction fees

## Running Tests

```bash
# Run full integration test suite
npm test

# Or run directly
node test/integration.test.js
```

## Test Details

### Setup Message Box

Tests the creation and validation of message boxes, including:

- ECIES key pair derivation
- Topic creation
- Account memo updates
- Public key storage
- Existing message box detection

### Send Message

Tests message encryption and sending:

- Signature verification
- RSA encryption
- JSON/CBOR encoding
- Topic message submission

### Check Messages

Tests message retrieval and decryption:

- Message fetching from topics
- RSA decryption
- Format parsing (CBOR/JSON/PLAIN)
- Sequence range queries

### Message Box Reuse

Tests idempotency:

- Detecting existing message boxes
- Key validation
- Preventing duplicate creation

### Signature Verification

Tests ownership proof:

- ED25519 signatures
- ECDSA_SECP256K1 signatures
- DER encoding correctness
- Public key retrieval from Mirror Node

### Remove Message Box

Tests cleanup operations:

- Account memo clearing
- Transaction signing

### Link Message Box

Tests re-attaching an existing topic:

- Topic existence and public key validation
- Account ownership verification (rejects wrong account)
- Account memo update
- Idempotency (`alreadyLinked: true` when memo already matches, no new transaction)
- Receiving messages on a re-linked box

## Test Output

Successful test run output:

```text
═══════════════════════════════════════════════════════
  HIERO MESSAGE BOX - INTEGRATION TESTS
═══════════════════════════════════════════════════════
✓ Environment variables loaded from .env file
✓ Hedera client initialized (testnet)

📋 Test Account: 0.0.XXXXX
📋 Network: testnet

🧪 Testing: Setup Message Box
✅ Setup Message Box

🧪 Testing: Send Message
✅ Send Message

[... additional tests ...]

═══════════════════════════════════════════════════════
  ✅ ALL TESTS PASSED
═══════════════════════════════════════════════════════
```

## Adding New Tests

To add new test cases:

1. Create a new test function in `integration.test.js`:

```javascript
async function testNewFeature() {
  const testName = 'New Feature';
  try {
    console.log(`\n🧪 Testing: ${testName}`);

    // Test implementation

    testPassed(testName);
  } catch (error) {
    testFailed(testName, error);
  }
}
```

2. Add the test to the run sequence in `runTests()`:

```javascript
await testNewFeature();
```

3. Run the test suite to validate

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

4. **Existing State**
   - If setup fails, manually check account memo
   - Verify topic ID from previous runs
   - Clean up orphaned resources if needed

### Common Issues

#### "Missing credentials"

- Add the missing variable(s) to your `.env` file. The config module reports exactly which variable is absent.

#### "Insufficient balance"

- Top up the test account with HBAR

#### "Signature verification failed"

- Verify MESSAGE_BOX_OWNER_PRIVATE_KEY matches the account
- Check key type (ED25519 vs ECDSA_SECP256K1)

#### "Topic not found"

- Message box may not be set up yet
- Run setup-message-box script first

## Future Enhancements

Potential additions to the test suite:

- [ ] Unit tests for individual functions
- [ ] Mock Hedera client for faster tests
- [ ] Performance benchmarks
- [ ] Error handling edge cases
- [ ] Multi-account scenarios
- [ ] Concurrent message sending
- [ ] Large message handling
- [ ] Key rotation tests
