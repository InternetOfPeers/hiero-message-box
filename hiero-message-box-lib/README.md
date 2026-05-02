# @internetofpeers/hiero-message-box

Isomorphic (Node.js + browser) library implementing [HIP-1334](https://hips.hedera.com/#hip-1334) private encrypted messaging on Hedera.

## Installation

```bash
npm install @internetofpeers/hiero-message-box
```

Runtime dependency: `@hiero-ledger/sdk` only. No polyfills required in the browser.

## Quick start

```js
const {
  createConfig,
  createMessageBox,
} = require('@internetofpeers/hiero-message-box');

const config = createConfig({
  PAYER_ACCOUNT_ID: '0.0.12345',
  PAYER_PRIVATE_KEY: '302e...',
  MESSAGE_BOX_OWNER_ACCOUNT_ID: '0.0.12345',
  MESSAGE_BOX_OWNER_PRIVATE_KEY: '302e...',
});

const messageBox = createMessageBox({ config });

await messageBox.setupMessageBox();
await messageBox.sendMessage('0.0.99999', 'Hello!');
const messages = await messageBox.checkMessages('0.0.12345', 2);
messageBox.close();
```

## API

### `createConfig(input)`

Validates required fields, fills in defaults, and returns a frozen config object. Throws with a clear message if any required field is missing.

```js
const config = createConfig({
  // Required
  PAYER_ACCOUNT_ID: '0.0.12345',
  PAYER_PRIVATE_KEY: '302e...',
  MESSAGE_BOX_OWNER_ACCOUNT_ID: '0.0.12345',
  MESSAGE_BOX_OWNER_PRIVATE_KEY: '302e...',

  // Optional
  ENCRYPTION_TYPE: 'RSA',         // 'RSA' (default) or 'ECIES'
  HEDERA_NETWORK: 'testnet',      // 'testnet' (default) or 'mainnet'
  MIRROR_NODE_URL: 'https://...',  // derived from network by default
  RSA_DATA_DIR: './data',         // directory for RSA PEM files (default: './data')
});
```

**Two-key system:** `payerAccountId`/`payerPrivateKey` pay for all Hedera transactions; `messageBoxOwnerAccountId`/`messageBoxOwnerPrivateKey` prove ownership via cryptographic signatures. These can be the same account or different accounts (e.g. a third-party service paying on behalf of the owner).

### `createMessageBox({ config, keyStore?, logger?, prompt?, signer? })`

The main factory. Returns seven methods implementing the HIP-1334 message box operations:

| Method | Description |
| ------ | ----------- |
| `setupMessageBox()` | Generate/load keys, create topic, publish public key, update account memo for `config.messageBoxOwnerAccountId` |
| `linkMessageBox(accountId, topicId)` | Re-attach an existing topic to the account memo |
| `removeMessageBox(accountId)` | Clear the account memo |
| `sendMessage(accountId, text, opts?)` | Encrypt and submit a message to a recipient's message box |
| `checkMessages(accountId, start?, end?)` | Fetch and decrypt messages in a sequence-number range |
| `pollMessages(accountId)` | Return new messages since the last call (call on each poll interval) |
| `close()` | Close the Hedera SDK client if one was created |

`sendMessage` accepts `{ useCBOR: true }` in `opts` to use CBOR encoding instead of JSON.

The factory internally creates a Hedera context from `config` and lazily initializes a Hedera SDK client on the first transactional call — read-only operations (`checkMessages`, `pollMessages`) never open a gRPC connection.

Pass `signer` (a WalletConnect `DAppSigner`) to delegate transaction signing to a browser wallet instead of using `payerPrivateKey`.

### Adapters

Consumers provide two adapter objects that the library calls out to for I/O it cannot do itself.

**`KeyStore`** — storage for RSA keypairs. Implement this interface to control where keys are persisted:

```js
interface KeyStore {
  loadRSAKeyPair(): Promise<{ publicKey, privateKey } | null>
  saveRSAKeyPair(pair: { publicKey, privateKey }): Promise<void>
}
```

| Implementation | Package | Use case |
| -------------- | ------- | -------- |
| `InMemoryKeyStore` | this package | Tests, ephemeral use |
| `NodeKeyStore` | `@internetofpeers/hiero-message-box-cli` | Filesystem-backed `.pem` files |
| `BrowserKeyStore` | `@internetofpeers/hiero-message-box-web` | Password-encrypted `localStorage` |

**`Logger`** — receives all diagnostic output. Implement this interface to route logs wherever you need:

```js
interface Logger {
  debug(...args): void
  log(...args): void
  info(...args): void
  warn(...args): void
  error(...args): void
}
```

| Implementation | Package | Use case |
| -------------- | ------- | -------- |
| `NoopLogger` | this package | Silent (default) |
| `ConsoleLogger` | `@internetofpeers/hiero-message-box-cli` | Prints to stdout |
| `BrowserLogger` | `@internetofpeers/hiero-message-box-web` | Feeds a reactive log buffer |

**`prompt`** (optional) — `(question: string) => Promise<boolean>`. Called when user confirmation is needed (e.g. overwriting an existing message box). Omit to auto-proceed.

## Encryption modes

### RSA (default)

Hybrid encryption: AES-256-CBC for message content + RSA-2048-OAEP for key exchange. Works with any Hedera key type (ED25519 or SECP256K1). RSA keypairs are generated automatically and persisted via the `KeyStore` adapter.

### ECIES

ECDH (secp256k1) + AES-256-GCM. Keys are derived from `messageBoxOwnerPrivateKey` — no separate key files. **Requires SECP256K1** (ED25519 is not supported). **Node only** — the browser build throws a clear error if ECIES is requested, since wallets do not expose the raw private key and WebCrypto omits secp256k1.

## Environment variables (via CLI)

The library never reads `process.env` or `.env` files. The CLI's `env-loader.js` reads the environment and passes values to `createConfig()`. When using the library directly, pass all values programmatically.

## Testing

```bash
npm run test:unit        # Offline unit tests (no credentials required)
npm run test:integration # End-to-end tests against Hedera testnet (requires .env)
npm test                 # Both
```

Create a `.env` file at the repo root for integration tests (see `.env.example` for the required variables).

### Test files

| File | Scope |
| ---- | ----- |
| `test/config.test.js` | `createConfig` validation and defaults |
| `test/format-message.test.js` | CBOR codec and message parsing |
| `test/format-message-with-crypto.test.js` | `formatMessage` with real crypto |
| `test/integration.test.js` | Full end-to-end flows against testnet |

## License

MIT
