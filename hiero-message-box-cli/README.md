# @internetofpeers/hiero-message-box-cli

Command-line tool (`hmb`) for [HIP-1334](https://hips.hedera.com/#hip-1334) private encrypted messaging on Hedera. Wraps the [`@internetofpeers/hiero-message-box`](../hiero-message-box-lib/) library.

## Installation

```bash
npm install -g @internetofpeers/hiero-message-box-cli
```

Or run from source (inside this monorepo):

```bash
node bin/hmb.js <command>
```

## Prerequisites

- Node.js v18+
- A Hedera testnet or mainnet account — get a free testnet account at <https://portal.hedera.com/register>

## Configuration

Copy `.env.example` from the repo root and fill in your credentials:

```bash
cp .env.example .env
```

The CLI auto-discovers the `.env` file by walking up from the current directory to the project root.

### Required variables

```text
PAYER_ACCOUNT_ID=0.0.xxxxx
PAYER_PRIVATE_KEY=302e020100300506032b657004220420...

MESSAGE_BOX_OWNER_ACCOUNT_ID=0.0.xxxxx
MESSAGE_BOX_OWNER_PRIVATE_KEY=302e020100300506032b657004220420...
```

**Two-key system:** `PAYER_*` pays for all Hedera transactions; `MESSAGE_BOX_OWNER_*` proves ownership. These can be the same account or different accounts (e.g. a third-party service paying for transactions on behalf of the owner).

### Optional variables

```text
ENCRYPTION_TYPE=RSA          # RSA (default) or ECIES (SECP256K1 only)
HEDERA_NETWORK=testnet       # testnet (default) or mainnet
MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com/api/v1
RSA_DATA_DIR=./data          # Directory for RSA PEM key files
```

For **mainnet**, change to:

```text
HEDERA_NETWORK=mainnet
MIRROR_NODE_URL=https://mainnet.mirrornode.hedera.com/api/v1
```

## Commands

### `hmb setup-message-box`

Initialize your message box: generates/loads encryption keys, creates a Hedera topic, publishes your public key to it, and updates your account memo with the topic ID in `[HIP-1334:0.0.xxxxx]` format.

```bash
hmb setup-message-box
```

Idempotent — re-running with the same keys and an existing topic is a no-op.

### `hmb send-message <account-id> <message> [--cbor]`

Send an end-to-end encrypted message to another account's message box.

```bash
hmb send-message 0.0.1441 "Hello, secret message!"
hmb send-message 0.0.1441 "Hello, secret message!" --cbor
```

The CLI fetches the recipient's topic ID from their account memo, verifies the topic's ownership signature, and encrypts the message with the recipient's published public key. The `--cbor` flag encodes the payload as CBOR instead of JSON (~3–5% smaller).

### `hmb check-messages [start] [end]`

Retrieve and decrypt messages from your message box by sequence number range.

```bash
hmb check-messages           # All messages from sequence number 2 onwards
hmb check-messages 5         # From sequence number 5 onwards
hmb check-messages 5 10      # Sequence numbers 5 through 10 (inclusive)
```

Sequence number 1 is always the public key announcement message.

### `hmb listen-for-new-messages`

Poll your message box every 3 seconds and print new messages as they arrive.

```bash
hmb listen-for-new-messages
```

Press `Ctrl+C` to stop.

### `hmb link-message-box <topic-id>`

Re-attach an existing topic to your account without recreating it (e.g. after `remove-message-box` cleared the account memo).

```bash
hmb link-message-box 0.0.1234
```

Verifies the topic exists and was originally set up for your account (ownership check), then updates the account memo. Idempotent.

### `hmb remove-message-box`

Clear your account memo (removes the `[HIP-1334:...]` reference). Does not delete the topic or keys.

```bash
hmb remove-message-box
```

### `hmb help`

```bash
hmb help
hmb --help
hmb -h
```

### `hmb --version`

```bash
hmb --version
hmb -v
```

## Encryption modes

### RSA (default)

Hybrid encryption: AES-256-CBC + RSA-2048-OAEP. Works with any Hedera key type. RSA keypair is auto-generated and saved to `RSA_DATA_DIR` (default: `./data`).

```text
data/
├── rsa_private.pem   # Keep secure — used to decrypt incoming messages
└── rsa_public.pem    # Published to the topic
```

### ECIES

ECDH (secp256k1) + AES-256-GCM. Keys are derived from `MESSAGE_BOX_OWNER_PRIVATE_KEY` — no PEM files needed. **Requires a SECP256K1 key** (ED25519 is not supported).

To enable:

```text
ENCRYPTION_TYPE=ECIES
```

## Start script

```bash
hmb setup-message-box && sleep 5 && hmb listen-for-new-messages
```

Or via npm (from inside the CLI package directory):

```bash
npm start
```

## Testing

```bash
npm test                # env-loader + CLI dispatch unit tests (no credentials needed)
npm run test:coverage   # With coverage report
```

### Test files

| File | Scope |
| ---- | ----- |
| `test/env-loader.test.js` | `.env` discovery, parsing, quote stripping, defaults |
| `test/cli-dispatch.test.js` | argv routing, unknown-command exit codes, `--version`, `help` |

## Security notes

- Never commit `.env` or private key files
- `PAYER_PRIVATE_KEY` pays for transactions; `MESSAGE_BOX_OWNER_PRIVATE_KEY` proves ownership — keeping them separate lets a third party pay without controlling your message box
- RSA: `data/rsa_private.pem` is used only for local decryption; keep it backed up
- ECIES: the owner key in `.env` is used for both signing and encryption/decryption

## License

MIT
