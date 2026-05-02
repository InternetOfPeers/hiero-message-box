# @internetofpeers/hiero-message-box-web

Vue 3 + Vite browser demo for [HIP-1334](https://hips.hedera.com/#hip-1334) private encrypted messaging on Hedera. Connects to a Hedera wallet via WalletConnect and uses the [`@internetofpeers/hiero-message-box`](../hiero-message-box-lib/) library for all message box operations.

## Running locally

```bash
npm install   # from repo root (workspaces install)
cd hiero-message-box-web
cp .env.local.example .env.local   # then fill in VITE_WC_PROJECT_ID
npm run dev   # http://localhost:5173
```

`VITE_WC_PROJECT_ID` is required for wallet connection. Get a free project ID at <https://cloud.reown.com> (formerly WalletConnect Cloud).

Production build:

```bash
npm run build    # output in dist/
npm run preview  # serve the production build locally
```

## Prerequisites

- A Hedera testnet or mainnet account with a **SECP256K1 key** (RSA mode works with any key type, but wallet signing via WalletConnect requires SECP256K1)
- A WalletConnect-compatible Hedera wallet (e.g. [HashPack](https://www.hashpack.app/), Kabila, Blade) with your account loaded

## Architecture

The demo imports the library directly and wires it up through browser-specific adapters:

| Adapter | File | Role |
| ------- | ---- | ---- |
| `BrowserKeyStore` | `src/lib-adapters/browser-key-store.js` | Stores RSA keypairs in password-encrypted `localStorage` |
| `BrowserLogger` | `src/lib-adapters/browser-logger.js` | Routes log output to a reactive buffer rendered in `LogStream.vue` |
| `WalletConnectSigner` | `src/lib-adapters/walletconnect-signer.js` | Wraps `DAppSigner` from `@hashgraph/hedera-wallet-connect` |

The app itself adds **zero crypto code** — all encryption, decryption, signing, and verification runs through the library.

## Demo flow

1. **Connect** — click "Connect Wallet" and approve the WalletConnect session in your wallet. The app displays your account ID, network, and key type.
2. **Unlock keys** — enter your encryption password (or set one on first run). The password unlocks your RSA keypair from `localStorage` and stays in memory for the session only.
3. **Setup** — click "Setup Message Box". The library generates an RSA keypair in-browser (WebCrypto), saves it encrypted to `localStorage`, creates a Hedera topic via your wallet, and updates your account memo.
4. **Send** — enter a recipient account ID and message text, then click "Send". Your wallet signs the topic submission transaction.
5. **Inbox** — click "Check Messages" to fetch and decrypt stored messages, or "Start Listening" to poll every 3 seconds.

All Hedera transactions (topic creation, message submission, account memo update) are signed by the wallet — the app never sees your Hedera private key.

## Encryption

Only **RSA mode** is supported in the browser. ECIES requires raw access to the SECP256K1 private key, which wallets do not expose. The setup panel does not offer an encryption-type toggle; RSA is always used.

RSA keypairs are generated in-browser via WebCrypto and stored as a single AES-GCM encrypted blob in `localStorage` under the key `hmb:rsa:<accountId>`. The encryption key is derived from your password via PBKDF2 (200 000 iterations, AES-256-GCM). Losing the password means losing the ability to decrypt incoming messages — export a backup using the "Export" button in the UI.

## Manual smoke test checklist

No automated test runner is configured for the web package. Use this checklist against testnet after any significant change:

- [ ] Wallet connects and account ID / network display correctly
- [ ] Password prompt appears on first unlock; subsequent unlocks reuse in-memory password
- [ ] Setup creates a new topic and updates the account memo (visible on Mirror Node)
- [ ] Re-running Setup with the same keypair is a no-op (idempotent)
- [ ] Send encrypts and submits a message; recipient sees it in Check Messages
- [ ] Check Messages decrypts and displays all messages with timestamps
- [ ] Start Listening picks up a new message sent during the polling window
- [ ] Export copies the encrypted key blob; Import restores it on a fresh session
- [ ] "Reset keys" removes the localStorage entry and triggers re-generation on next Setup
- [ ] Production build (`npm run build`) completes with no errors; only a handful of `crypto`/`util` externalization warnings from `@hiero-ledger/cryptography` are expected (the SDK uses WebCrypto in browsers)

## License

MIT
