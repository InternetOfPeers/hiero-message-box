# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo layout

npm workspaces with three packages, each independently runnable:

| Directory                | Package                                  | Module type                |
| ------------------------ | ---------------------------------------- | -------------------------- |
| `hiero-message-box-lib/` | `@internetofpeers/hiero-message-box`     | CJS (`"type": "commonjs"`) |
| `hiero-message-box-cli/` | `@internetofpeers/hiero-message-box-cli` | CJS                        |
| `hiero-message-box-web/` | `@internetofpeers/hiero-message-box-web` | ESM (`"type": "module"`)   |

All three packages are installed from the repo root with a single `npm install`.

## Commands

### From the repo root

```bash
npm test                   # All tests across workspaces
npm run test:lib           # Lib unit + integration
npm run test:lib:unit      # Lib unit only (no credentials needed)
npm run test:cli           # CLI unit tests
npm run test:integration   # Lib integration (requires .env at repo root)
npm run test:coverage      # Coverage for all workspaces
npm run test:coverage:lib  # Lib coverage
npm run test:coverage:cli  # CLI coverage
npm run format             # Prettier across all packages
```

### Run a single test file

```bash
npx jest hiero-message-box-lib/test/config.test.js
npx jest hiero-message-box-lib/test/format-message.test.js
npx jest hiero-message-box-cli/test/env-loader.test.js
```

### Run a single test by name

```bash
npx jest --testNamePattern="createConfig" hiero-message-box-lib/test/config.test.js
```

### Web dev server

```bash
cd hiero-message-box-web && npm run dev   # http://localhost:5173
```

## Integration test setup

Integration tests (`hiero-message-box-lib/test/integration.test.js`) hit live Hedera testnet. Copy `.env.example` to `.env` at the repo root and fill in real credentials before running them.

## Architecture

### Library (`hiero-message-box-lib/src/`)

Public surface (everything in `src/index.js`):

- `createConfig(input)` — validates and freezes config; reads UPPER_CASE env-var style keys (`PAYER_ACCOUNT_ID`, `PAYER_PRIVATE_KEY`, `MESSAGE_BOX_OWNER_ACCOUNT_ID`, `MESSAGE_BOX_OWNER_PRIVATE_KEY`, `HEDERA_NETWORK`, `ENCRYPTION_TYPE`, `RSA_DATA_DIR`, `MIRROR_NODE_URL`)
- `createMessageBox({ config, keyStore?, logger?, prompt?, signer? })` — main factory returning 7 methods
- `InMemoryKeyStore` — class (use `new`)
- `NoopLogger` — frozen plain object (do NOT use `new`)

Internal modules (not exported from `index.js`):

- `src/hedera.js` — `createHederaContext(config, logger)` wires all Hedera SDK and Mirror Node calls; Hedera SDK client is **lazily initialized** on the first transactional call (read-only operations never open a gRPC connection)
- `src/crypto.js` — all cryptography: RSA-2048-OAEP + AES-256-CBC, ECIES (secp256k1 ECDH + AES-256-GCM), ED25519/ECDSA sign+verify, PBKDF2+AES-256-GCM password encryption; uses `globalThis.crypto.subtle` (WebCrypto, isomorphic); ECIES and ECDSA-secp256k1 require Node (throw in browsers)
- `src/format-message.js` — CBOR codec + message display formatting
- `src/config.js` — `createConfig` implementation
- `src/adapters/` — `InMemoryKeyStore`, `NoopLogger`

`createMessageBox` creates the hedera context and lazy client internally — callers never touch the SDK directly.

### Two-key system

`payerAccountId`/`payerPrivateKey` pay for all Hedera transactions. `messageBoxOwnerAccountId`/`messageBoxOwnerPrivateKey` prove ownership by signing the public key announcement written to the topic. These can be the same account.

### HIP-1334 message format

Sequence number 1 of every topic is always the public key announcement:

```json
{
  "payload": {
    "type": "HIP-1334_PUBLIC_KEY",
    "publicKey": "...",
    "encryptionType": "RSA|ECIES"
  },
  "proof": {
    "accountId": "0.0.x",
    "signerPublicKey": "...",
    "signerKeyType": "ED25519|ECDSA_SECP256K1",
    "signature": "..."
  }
}
```

`proof.signature` is always an Ed25519/ECDSA signature over:

```text
'\x19Hedera Signed Message:\n' + canonicalJSON(payload).length + canonicalJSON(payload)
```

This matches the `hedera_signMessage` WalletConnect convention (see `prefixMessageToSign` in `@hashgraph/hedera-wallet-connect`). Both CLI (via `signMessage` in `crypto.js`) and web UI (via `DAppSigner.sign`) use this same format, so verification in `sendMessage` always applies the prefix unconditionally.

Encrypted messages start at sequence number 2.

### CLI (`hiero-message-box-cli/`)

- `bin/hmb.js` — dispatches to `src/commands/*.js` after loading `.env` via `src/env-loader.js`
- `src/env-loader.js` — walks up from CWD until it finds a `package.json`, then loads `.env` from that directory; does NOT overwrite already-set env vars
- `src/node-key-store.js` — `NodeKeyStore`: reads/writes `rsa_private.pem` / `rsa_public.pem` in `RSA_DATA_DIR`
- `src/console-logger.js` — `ConsoleLogger`: frozen object (not a class)
- Commands that submit transactions use `let messageBox = null` in outer scope so SIGINT handlers and catch blocks can call `messageBox.close()`; read-only commands (check-messages, listen-for-new-messages) never create a client and need no cleanup

### Web demo (`hiero-message-box-web/`)

- Vue 3 + Vite, ESM throughout; `vite.config.js` aliases `@hiero-ledger/sdk` to its `lib/browser.cjs` entry to prevent `@grpc/grpc-js` (Node-only) from being bundled
- `src/session.js` — global reactive state (`dappConnector`, `accountId`, `network`, `signer`, `password`, `logs`); password lives in memory only, never persisted
- `src/lib-adapters/browser-key-store.js` — `BrowserKeyStore`: stores RSA keypairs in `localStorage` under `hmb:rsa:<accountId>`, encrypted with PBKDF2+AES-256-GCM; envelope format `v1.<salt>.<iv>.<ciphertext>` (base64url); uses inline WebCrypto (`globalThis.crypto.subtle`) with `atob`/`btoa`
- `src/lib-adapters/browser-logger.js` — `BrowserLogger`: feeds `session.logs` reactive array + mirrors to `console.*`
- `src/lib-adapters/walletconnect-signer.js` — wraps `@hashgraph/hedera-wallet-connect` `DAppConnector`; when a signer is passed to `createMessageBox`, no Hedera SDK client is created
- ECIES is not available in the browser (wallets do not expose raw private keys)
- No automated tests; use the manual smoke-test checklist in `hiero-message-box-web/README.md`

## Key invariants

- `createConfig` reads `UPPER_CASE` keys, returns a frozen object with `camelCase` properties (`config.payerAccountId`, `config.hederaNetwork`, etc.)
- `NoopLogger` and `ConsoleLogger` are frozen plain objects — never instantiate with `new`
- The lib never reads `process.env` or the filesystem; the CLI's `env-loader.js` does that
- Integration tests run `--runInBand` (sequential) because they share testnet state
