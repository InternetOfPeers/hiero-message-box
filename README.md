# Hiero Message Box

Private, asynchronous, encrypted messaging for Hedera accounts, implementing [HIP-1334](https://hips.hedera.com/#hip-1334).

[View the interactive presentation](https://internetofpeers.org/hiero-message-box/presentation.html) to visualize the message box flow.

## Overview

Any Hedera account can create a **message box** — a Hedera Consensus Service topic — and publish their encryption public key to it. Anyone who knows the account ID can then send end-to-end encrypted messages to that topic. The owner reads and decrypts messages using their private key. Ownership of the message box is proved with a cryptographic signature embedded in the first topic message, verified by senders via the Mirror Node before sending.

Supported encryption modes:

| Mode                       | Key source             | Key type required        |
| -------------------------- | ---------------------- | ------------------------ |
| RSA-2048 + AES-256-CBC     | Generated PEM files    | Any (ED25519, SECP256K1) |
| ECIES (ECDH + AES-256-GCM) | Derived from owner key | SECP256K1 only           |

## Packages

This is an **npm workspaces monorepo** with three packages:

| Package  | Directory                                        | npm name                                 | Description                                                   |
| -------- | ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------- |
| Library  | [hiero-message-box-lib/](hiero-message-box-lib/) | `@internetofpeers/hiero-message-box`     | Isomorphic (Node + browser), dependency-injected core library |
| CLI      | [hiero-message-box-cli/](hiero-message-box-cli/) | `@internetofpeers/hiero-message-box-cli` | `hmb` command-line tool                                       |
| Web demo | [hiero-message-box-web/](hiero-message-box-web/) | `@internetofpeers/hiero-message-box-web` | Vue 3 + Vite browser demo with WalletConnect                  |

See each package's README for installation, configuration, and usage details.

## Repository structure

```text
hiero-message-box/
├── hiero-message-box-lib/      # Isomorphic library (@internetofpeers/hiero-message-box)
├── hiero-message-box-cli/      # CLI tool (@internetofpeers/hiero-message-box-cli)
├── hiero-message-box-web/      # Vue 3 web demo (@internetofpeers/hiero-message-box-web)
├── specs/
│   └── hip-1334.md             # HIP-1334 specification
├── docs/
│   └── presentation.html       # Interactive flow presentation
├── package.json                # Workspaces root
├── .prettierrc.json
└── LICENSE
```

## Quick start

**Use the CLI:**

```bash
npm install -g @internetofpeers/hiero-message-box-cli
hmb setup-message-box
hmb send-message 0.0.1441 "Hello!"
hmb check-messages
```

**Use the library programmatically:**

```bash
npm install @internetofpeers/hiero-message-box
```

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
await messageBox.sendMessage('0.0.1441', 'Hello!'); // 0.0.1441 is the recipient's account ID
```

**Run the web demo locally:**

```bash
cd hiero-message-box-web
npm run dev
```

## Root scripts

```bash
npm test                  # Run tests across all workspaces
npm run test:lib          # Library tests (unit + integration)
npm run test:lib:unit     # Library unit tests only (no credentials needed)
npm run test:cli          # CLI tests
npm run test:integration  # Library integration tests (requires .env at repo root)
npm run test:coverage     # Coverage for all workspaces
npm run test:coverage:lib # Coverage for the library
npm run test:coverage:cli # Coverage for the CLI
npm run format            # Format all code with Prettier
```

## License

MIT
