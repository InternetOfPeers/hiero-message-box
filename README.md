# Hiero Message Box - Private Asynchronous Messaging

Hiero Message Box is a simple way for users to set up a message box and receive private messages, for example getting alerts about security communications about their assets or wallet, etc.

This implementation follows the specifications defined in the [HIP-1334](https://hips.hedera.com/#hip-1334).

[View the interactive presentation](https://internetofpeers.org/hiero-message-box/presentation.html) to visualize the message box flow.

## Quick start

The repo contains the code both for the sender and the receiver.

The goal is to enable users to send encrypted messages to an account's message box just like this:

```bash
npm run send-message -- 0.0.1441 "This is a secret message for you"
```

Users can create the message box with this command:

```bash
npm run setup-message-box
```

Users can link an existing message box to their account using its topic ID with this command:

```bash
npm run link-message-box -- <topic-id>
```

Users can listen for new messages in real-time using this command:

```bash
npm run listen-for-new-messages
```

Users can also check for historical messages using this command:

```bash
npm run check-messages -- [start-sequence-number] [end-sequence-number]
```

On first setup, the program generates/derives encryption keys, creates a Hedera topic as your message box, and updates your account memo with the topic ID in HIP-1334 format.

## Features

- **Two-Key System**: Separates transaction payer from message box owner
  - **PAYER_PRIVATE_KEY**: Pays for all Hedera transactions
  - **MESSAGE_BOX_OWNER_PRIVATE_KEY**: Signs messages to prove ownership
  - Enables third-party services to pay for users while maintaining user control
- **Ownership Verification**: Cryptographic signatures prove message box ownership
  - First message signed with owner's Hedera private key
  - Senders verify signature against Mirror Node before sending
  - Prevents sending to compromised or fraudulent message boxes
- **Dual Encryption Support**: Choose between RSA-2048 or ECIES (Elliptic Curve Integrated Encryption Scheme)
  - **RSA Mode**: Traditional RSA-2048 keys stored in `data/` folder (works with all key types)
  - **ECIES Mode**: Uses your message box owner's SECP256K1 key (no separate key files needed)
- **Automatic Key Management**: RSA keys are auto-generated, ECIES keys are derived from your owner credentials (`MESSAGE_BOX_OWNER_PRIVATE_KEY`)
- **Hedera Topics**: Creates and manages Hedera topics for message distribution
- **Key Verification**: Automatically verifies local keys match the topic's public key
- **Mirror Node API**: Uses Hedera Mirror Node for all read operations (account validation, memo retrieval, message polling, topic verification)
- **Real-time Listening**: Continuously polls for new encrypted messages every 3 seconds
- **Message Formats**: Supports both JSON and CBOR encoding formats for flexibility
- **Chunked Messages**: Automatically handles messages larger than 1KB split across multiple chunks by HCS
- **Modular Architecture**: Common functions extracted for reusability and maintainability
- **Minimal External Dependencies**: Uses only `@hiero-ledger/sdk` and native Node.js crypto module

## Prerequisites

- Node.js (v14 or higher recommended, v18+ for best compatibility)
- A Hedera testnet or mainnet account
  - Get a free testnet account at: <https://portal.hedera.com/register>

## Installation

1. Clone or download this repository

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with your Hedera credentials:

   ```bash
   cp .env.example .env
   ```

4. Edit `.env` and add your Hedera account details:

```text
# Two-Key System Configuration
# PAYER_PRIVATE_KEY: Account that pays for all Hedera transactions (third-party services can pay for transactions on behalf of users)
PAYER_ACCOUNT_ID=0.0.xxxxx
PAYER_PRIVATE_KEY=302e020100300506032b657004220420...

# MESSAGE_BOX_OWNER_PRIVATE_KEY: Account that owns and signs the message box
MESSAGE_BOX_OWNER_ACCOUNT_ID=0.0.xxxxx
MESSAGE_BOX_OWNER_PRIVATE_KEY=302e020100300506032b657004220420...

# Encryption Configuration (optional - defaults to RSA)
# Options: RSA, ECIES
# RSA: Uses RSA-2048 keys (generated and stored in data/ folder)
# ECIES: Uses owner's SECP256K1 key for encryption (derived from MESSAGE_BOX_OWNER_PRIVATE_KEY)
#        Note: ECIES requires SECP256K1 - ED25519 keys are not supported
ENCRYPTION_TYPE=RSA

# Data directory for RSA keys (optional - defaults to ./data)
RSA_DATA_DIR=./data

# Network Configuration (optional - defaults to testnet)
HEDERA_NETWORK=testnet
MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com/api/v1
```

For **mainnet**, change to:

```text
HEDERA_NETWORK=mainnet
MIRROR_NODE_URL=https://mainnet.mirrornode.hedera.com/api/v1
```

## Usage

### Choosing an Encryption Method

The Hiero Message Box supports two encryption methods:

| Feature          | RSA (Default)              | ECIES                 |
| ---------------- | -------------------------- | --------------------- |
| Key Management   | Generate & store PEM files | Uses owner's key      |
| Key Type Support | All (ED25519, SECP256K1)   | SECP256K1 only        |
| Public Key Size  | 294 bytes                  | 33-65 bytes           |
| Setup Time       | ~50ms (key generation)     | <1ms (key derivation) |
| Security         | RSA-2048 + AES-256-CBC     | ECDH + AES-256-GCM    |
| Files to Backup  | `data/rsa_*.pem`           | None (uses .env)      |

**Use RSA if:**

- You already have a message box and want to keep it
- Your Hedera account uses ED25519 keys
- You prefer separate encryption keys from your Hedera account signing keys

**Use ECIES if:**

- Your Hedera account uses SECP256K1 keys
- You want to use your Hedera key for everything
- You want faster setup with no key file management

**To enable ECIES**, add to your `.env`:

```bash
ENCRYPTION_TYPE=ECIES
```

**Note:** ED25519 keys cannot use ECIES (signature algorithm, no ECDH support). The system will prompt to switch to RSA if needed.

### Setup Message Box

```bash
npm run setup-message-box
```

The setup process:

1. Loads/generates encryption keys (RSA: `data/*.pem`, ECIES: derived from `MESSAGE_BOX_OWNER_PRIVATE_KEY`)
2. Checks existing message box in account memo
3. Verifies keys can decrypt messages
4. Creates new topic if needed, publishes public key
5. Updates account memo with topic ID: `[HIP-1334:0.0.xxxxx]`

### Link Message Box

Link an existing message box (Hedera topic) to your account without recreating it:

```bash
npm run link-message-box -- <topic-id>
```

**Example:**

```bash
npm run link-message-box -- 0.0.1234
```

Useful when your account memo was cleared (e.g. after `remove-message-box`) but the topic and its keys still exist. The command:

1. Verifies the topic exists and has a valid public key message
2. Confirms the topic was originally set up for your account (ownership check)
3. Updates the account memo to reference the topic ID in `[HIP-1334:0.0.xxxxx]` format
4. Is idempotent — re-running with the same topic ID is safe and does nothing if already linked

**Note:** Since the account memo update requires the owner's signature, you must configure `MESSAGE_BOX_OWNER_PRIVATE_KEY` with the same key that was used when the message box was created. In addition, to be able to read messages, in case you used RSA, the corresponding `rsa_private.pem` private key file should also be present in the `RSA_DATA_DIR` folder.

### Listen for New Messages

Start the listener to continuously poll for and receive encrypted messages:

```bash
npm run listen-for-new-messages
# or
npm start
```

**Note:** `npm start` runs setup then starts listening.

Polls Mirror Node every 3 seconds, automatically detects and decrypts messages. Press `Ctrl+C` to stop.

### Check Messages

Retrieve and read messages from your message box in a specific range:

```bash
npm run check-messages -- [start-sequence-number] [end-sequence-number]
```

**Examples:**

```bash
# Get all messages from sequence number 2 onwards (default, skip the public key message at sequence number 1)
npm run check-messages

# Get all messages from sequence number 5 onwards
npm run check-messages -- 5

# Get messages from sequence number 5 to 10 (inclusive)
npm run check-messages -- 5 10
```

Retrieves and decrypts messages in the specified range with timestamps and sequence numbers.

### Send Encrypted Messages

Send an encrypted message to another account:

```bash
npm run send-message -- <account-id> <message> [--cbor]
```

**Examples:**

```bash
npm run send-message -- 0.0.1441 "Hello, secret message!"
npm run send-message -- 0.0.1441 "Hello, secret message!" --cbor
```

**Note:** Use `--` to separate npm options from script arguments.

#### Message Formats

- **JSON (default)**: Human-readable, easy to debug (~510 bytes typical message)
- **CBOR (optional)**: Binary format, ~3-5% smaller (~491 bytes), best for high-volume scenarios

Both formats are auto-detected when reading messages.

#### How it works

1. Fetches recipient's account memo and public key from topic
2. Auto-detects encryption type (RSA or ECIES)
3. Encrypts message (RSA: AES-256+RSA-2048, ECIES: ECDH+AES-256-GCM)
4. Sends encrypted payload to topic (JSON or CBOR)

Recipients automatically detect and decrypt messages when polling.

#### Large Messages

HCS automatically splits messages >1KB into chunks. This application transparently reassembles them before decryption—no size limit.

### Remove Message Box

To remove your message box configuration (clears your account memo):

```bash
npm run remove-message-box
```

Clears account memo but doesn't delete the topic or keys.

## Encryption Methods

### RSA Mode

Hybrid encryption: AES-256-CBC for messages + RSA-2048-OAEP for key exchange. Supports all key types, works with any length messages.

### ECIES Mode

Uses ECDH (secp256k1) + AES-256-GCM. Provides smaller public keys (33 bytes vs 294), and derives keys from the owner credentials (`MESSAGE_BOX_OWNER_PRIVATE_KEY`). **Requires SECP256K1** (ED25519 not supported).

## Architecture

### Modular Design

The codebase is organized into five modules:

1. **`lib/config.js`**: Application configuration singleton
   - Loads `.env` file at module-load time (no explicit call needed)
   - Builds and exports the `config` object with all settings and defaults
   - Validates all required fields immediately, failing fast with clear error messages
   - The single place where `process.env` is read — no other module touches it

2. **`lib/crypto.js`**: Cryptographic operations
   - RSA hybrid encryption/decryption (AES-256-CBC + RSA-2048-OAEP)
   - ECIES encryption/decryption (ECDH + AES-256-GCM)
   - Encryption type detection and routing
   - Message signing and signature verification (ED25519, ECDSA_SECP256K1)
   - DER encoding helpers for public/private keys

3. **`lib/hedera.js`**: Hedera blockchain operations
   - Client initialization (testnet/mainnet)
   - Account memo read (via Mirror Node) and update (via Hedera SDK)
   - Account validation and public key retrieval using Mirror Node API
   - Topic creation and message submission
   - Topic message queries with pagination support
   - Hedera key parsing and public key derivation (SECP256K1, ED25519)
   - Transaction execution and signing helpers

4. **`lib/message-box.js`**: Core message box logic
   - Two-key system support (payer and owner separation)
   - Message box setup with ownership signature generation
   - Message box linking (re-attach existing topic to account memo)
   - RSA key pair generation and management
   - ECIES key derivation from the owner credentials (`MESSAGE_BOX_OWNER_PRIVATE_KEY`)
   - Public key publishing with cryptographic signature proof
   - Signature verification before sending messages
   - Message encryption and sending (JSON/CBOR formats, auto-detecting encryption type)
   - Real-time message polling with sequence number tracking
   - Canonical JSON serialization for deterministic signatures

5. **`lib/format-message.js`**: Message formatting, parsing, and CBOR
   - Decodes base64 HCS messages and detects encoding (JSON/CBOR/plain)
   - Formats encrypted messages with decryption (or a `(cannot decrypt)` notice)
   - Formats public key announcement messages
   - Formats plain-text messages
   - Custom CBOR encoder/decoder (RFC 8949 compliant) — supports strings, numbers, booleans, null, arrays, objects, and byte buffers
   - Pure utility module with no Hedera client dependency (fully unit-testable)

### Mirror Node API

Uses Hedera Mirror Node REST API for all read operations (cost-free):

- Account validation and memo retrieval
- Topic verification and public key retrieval
- Message polling with pagination
- Historical message queries

### Message Format

All messages submitted to the topic use either JSON or CBOR encoding with a `type` field:

**Public Key Message** (first message in topic, always JSON):

RSA format with ownership proof:

```json
{
  "payload": {
    "encryptionType": "RSA",
    "publicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhki...",
    "type": "HIP-1334_PUBLIC_KEY"
  },
  "proof": {
    "accountId": "0.0.12345",
    "signerPublicKey": "a1b2c3d4...",
    "signerKeyType": "ED25519",
    "signature": "d5e6f7g8..."
  }
}
```

ECIES format with ownership proof:

```json
{
  "payload": {
    "encryptionType": "ECIES",
    "publicKey": {
      "curve": "secp256k1",
      "key": "03a1b2c3d4e5f6...",
      "type": "ECIES"
    },
    "type": "HIP-1334_PUBLIC_KEY"
  },
  "proof": {
    "accountId": "0.0.12345",
    "signerPublicKey": "02a1b2c3d4...",
    "signerKeyType": "ECDSA_SECP256K1",
    "signature": "d5e6f7g8..."
  }
}
```

The `proof` section contains a cryptographic signature of the `payload` using the message box owner's Hedera private key. Senders verify this signature against the account's public key from Mirror Node before sending messages, preventing fraudulent message boxes.

**Encrypted Message (JSON format)**:

RSA:

```json
{
  "type": "HIP-1334_ENCRYPTED_MESSAGE",
  "format": "json",
  "data": {
    "type": "RSA",
    "encryptedKey": "base64...",
    "iv": "base64...",
    "encryptedData": "base64..."
  }
}
```

ECIES:

```json
{
  "type": "HIP-1334_ENCRYPTED_MESSAGE",
  "format": "json",
  "data": {
    "type": "ECIES",
    "ephemeralPublicKey": "hex...",
    "iv": "base64...",
    "encryptedData": "base64...",
    "authTag": "base64...",
    "curve": "secp256k1"
  }
}
```

**Encrypted Message (CBOR format)**: Same structure as JSON, more compact.

Messages are auto-detected (format: JSON/CBOR/plain, encryption: RSA/ECIES) and decrypted accordingly.

## File Structure

```text
./
├── data/
│   ├── rsa_private.pem             # RSA private key (auto-generated, RSA mode only)
│   └── rsa_public.pem              # RSA public key (auto-generated, RSA mode only)
├── docs/
│   └── presentation.html           # Interactive presentation of the message box flow
├── src/
│   ├── check-messages.js           # Check existing messages inside the message box
│   ├── link-message-box.js         # Link an existing topic to the account
│   ├── listen-for-new-messages.js  # Listener/Receiver application
│   ├── remove-message-box.js       # Remove message box configuration
│   ├── send-message.js             # Sender application
│   ├── setup-message-box.js        # Setup message box for account
│   └── lib/
│       ├── config.js               # Config singleton (env loading, defaults, validation)
│       ├── crypto.js               # Cryptographic operations (encryption, signing)
│       ├── format-message.js       # Message formatting, parsing, and CBOR codec (pure, no I/O)
│       ├── hedera.js               # Hedera SDK wrappers, client init, key parsing
│       └── message-box.js          # Core message box logic (setup, send, poll)
├── test/
│   ├── config.test.js              # Unit tests for config.js (env loading, defaults, validation)
│   ├── format-message.test.js      # Unit tests for format-message.js (CBOR codec, parsing)
│   ├── integration.test.js         # End-to-end integration test suite (requires .env)
│   ├── setup.js                    # Jest setup — silences app console output during tests
│   ├── streaming-reporter.js       # Custom Jest reporter with real-time per-test output
│   └── unit.test.js                # formatMessage unit tests (no credentials required)
├── .env                            # Hedera credentials and config (not committed)
├── .env.example                    # Example environment file
├── .gitignore                      # Git ignore rules
├── .prettierignore                 # Prettier ignore rules
├── .prettierrc.json                # Prettier configuration
├── LICENSE                         # MIT license
├── package-lock.json               # Locked dependency versions
└── package.json                    # Dependencies and scripts
```

## Available NPM Scripts

```bash
npm start                                           # Setup message box and start listening for new messages
npm run setup-message-box                           # Setup/verify message box configuration
npm run link-message-box -- <topic-id>              # Link an existing topic to the account's memo
npm run listen-for-new-messages                     # Start polling for new messages
npm run check-messages -- [start-sequence-number] [end-sequence-number] # Read message history (defaults to sequence number 2 onwards)
npm run send-message -- <account id> <msg> [--cbor] # Send encrypted message to account
npm run remove-message-box                          # Remove message box (clear account memo)
npm run format                                      # Format code with Prettier
npm test                                            # Run all tests (unit + integration)
npm run test:unit                                   # Run offline unit tests only (no credentials needed)
npm run test:integration                            # Run end-to-end integration tests only
npm run test:coverage                               # Run all tests and generate a coverage report
```

**Note:** Use `--` to separate npm options from script arguments when passing parameters.

## Testing

The project uses [Jest](https://jestjs.io/) as its test runner. Tests are split into offline unit tests and live integration tests:

### All Tests

Run with:

```bash
npm test
```

Each test name appears immediately when it starts running (with a `●` indicator), and updates in-place with the result and elapsed time once it finishes. This is handled by [test/streaming-reporter.js](test/streaming-reporter.js).

### Unit Tests (offline)

Test pure logic with no network connection or credentials required:

```bash
npm run test:unit
```

Spans three test files (`unit.test.js`, `config.test.js`, `format-message.test.js`) and covers:

**`unit.test.js`** — four exit paths of `formatMessage`:

- Encrypted message that decrypts successfully
- Encrypted message that cannot be decrypted (wrong key)
- Public key announcement message
- Plain-text / unrecognised content

**`config.test.js`** — config singleton (`src/lib/config.js`):

- `.env` file loading: absent file, read errors, env-var precedence, quote stripping, comment/blank-line handling
- `findProjectRoot()` fallback behaviour
- Default values and case normalisations (network, encryption type, RSA data dir, mirror node URL)
- Required-field validation (throws with a clear message for each missing field)

**`format-message.test.js`** — CBOR codec and message formatting (`src/lib/format-message.js`):

- `encodeCBOR`/`decodeCBOR` roundtrip for all supported types (primitives, integers, floats, strings, buffers, arrays, objects)
- `encodeCBOR` and `decodeCBOR` error cases (unsupported types, malformed input)
- `parseMessageContent` format detection (CBOR, JSON, plain)
- `formatMessage` with CBOR-encoded messages and public-key output branches

### Integration Tests (live Hedera)

End-to-end tests that require a configured `.env` file and HBAR balance:

```bash
npm run test:integration
```

Covers:

- Message box setup (new and existing)
- Sending messages (JSON and CBOR formats)
- Retrieving and decrypting messages
- Message box reuse (idempotency)
- Signature verification
- Message box removal
- Linking an existing topic back to an account after removal
- Link idempotency (re-linking an already-linked topic is a no-op)
- Link ownership validation (rejects attempts to link a topic to the wrong account)
- Sending messages to a re-linked message box

## Configuration Files

### Environment Variables (`.env`)

Required variables:

```text
# Transaction payer
PAYER_ACCOUNT_ID=0.0.xxxxx
PAYER_PRIVATE_KEY=302e020100300506032b657004220420...

# Message box owner
MESSAGE_BOX_OWNER_ACCOUNT_ID=0.0.xxxxx
MESSAGE_BOX_OWNER_PRIVATE_KEY=302e020100300506032b657004220420...
```

Optional variables:

```text
# Data directory for RSA keys
RSA_DATA_DIR=./data

# Encryption type, ECIES or RSA
ENCRYPTION_TYPE=RSA

# Network (defaults to testnet)
HEDERA_NETWORK=testnet
MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com/api/v1
```

### Encryption Keys

**RSA Mode:**

- `data/rsa_private.pem`: Your private key for decryption (keep secure!)
- `data/rsa_public.pem`: Your public key (published to the topic for others to use)

**ECIES Mode:**

- No separate key files needed
- Keys are derived from `MESSAGE_BOX_OWNER_PRIVATE_KEY` in `.env`
- Requires SECP256K1 key type

## Security Notes

- Never commit `.env` or private keys
- **Two-key system**: Separates payment from ownership
  - `PAYER_PRIVATE_KEY`: Pays for transactions
  - `MESSAGE_BOX_OWNER_PRIVATE_KEY`: Proves ownership via signatures
  - Enables third-party payment while maintaining user control
- RSA mode: private key in `data/rsa_private.pem` for local decryption only
- ECIES mode: owner key (`MESSAGE_BOX_OWNER_PRIVATE_KEY`) in `.env` used for encryption/decryption
- **Signature verification**: Message box ownership uses cryptographic signatures with canonical JSON serialization
  - First message signed with owner's Hedera private key
  - Senders verify signature against account's public key from Mirror Node
  - Ensures deterministic signature verification regardless of JSON property ordering
  - Keys are sorted alphabetically before signing to prevent signature mismatch
  - Prevents sending messages to compromised or fraudulent message boxes

## Troubleshooting

### Common Issues

- **Missing credentials**: Ensure `.env` exists with valid `PAYER_ACCOUNT_ID`, `PAYER_PRIVATE_KEY`, `MESSAGE_BOX_OWNER_ACCOUNT_ID`, and `MESSAGE_BOX_OWNER_PRIVATE_KEY`
- **Message box not found**: Recipient needs to run `npm run setup-message-box`
- **Cannot decrypt**: Keys don't match topic—restore original keys or create new message box
- **Signature verification failed**: Message box signature doesn't match recipient's public key—possible fraudulent message box
- **Encryption mismatch**: `ENCRYPTION_TYPE` in `.env` doesn't match message box
- **ECIES with ED25519**: ED25519 doesn't support ECIES—use RSA or SECP256K1 account
- **Mirror Node errors**: Check internet and verify `MIRROR_NODE_URL` matches network

## Migration Guide

### Switching Encryption Types

1. Update `ENCRYPTION_TYPE` in `.env` (RSA or ECIES)
2. Run `npm run setup-message-box` to create new message box
3. Old message box remains accessible with original keys

**Note:** ECIES requires SECP256K1 key (not ED25519).

## References

- [ECIES Specification](https://en.wikipedia.org/wiki/Integrated_Encryption_Scheme)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- [Hedera Documentation](https://docs.hedera.com/)
- [Hedera Key Types](https://docs.hedera.com/hedera/sdks-and-apis/sdks/keys)
- [NIST Elliptic Curve Standards](https://csrc.nist.gov/projects/elliptic-curve-cryptography)
- [RFC 8949 - CBOR Specification](https://datatracker.ietf.org/doc/html/rfc8949)

## License

MIT
