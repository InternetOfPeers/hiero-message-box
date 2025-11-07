# Quick Start - ECIES Encryption

## What's New?

The Hiero Message Box now supports **ECIES encryption** in addition to RSA! ECIES uses your existing Hedera SECP256K1 operator key for encryption, eliminating the need to manage separate RSA key files.

**Note**: ECIES requires a SECP256K1 key. If your Hedera account uses ED25519, you'll need to use RSA encryption or create a new account with a SECP256K1 key.

## Quick Comparison

| Feature         | RSA (Default)              | ECIES (New!)           |
| --------------- | -------------------------- | ---------------------- |
| Key Management  | Generate & store PEM files | Uses your operator key |
| Public Key Size | 294 bytes                  | 33-65 bytes            |
| Setup Time      | ~50ms (key generation)     | <1ms (key derivation)  |
| Security        | RSA-2048 + AES-256         | ECDH + AES-256-GCM     |
| Files to Backup | `data/rsa_*.pem`           | None (uses .env)       |

## Enable ECIES in 2 Steps

### 1. Update `.env`

```bash
# Add this line to your .env file
ENCRYPTION_TYPE=ECIES
```

### 2. Setup Message Box

```bash
npm run setup-message-box
```

That's it! The system will:

- ✅ Derive your public key from `HEDERA_PRIVATE_KEY`
- ✅ Create a new message box with ECIES encryption
- ✅ Update your account memo

## Use Cases

### Perfect for ECIES:

- 🔒 You want to use your Hedera key for everything
- 🚀 You want faster setup (no key generation)
- 📦 You want fewer files to manage
- 🔄 You frequently switch between accounts

### Stick with RSA if:

- 📁 You already have a message box and want to keep it
- 🔐 You prefer separate encryption keys
- ⚖️ You need maximum compatibility

## Examples

### Send Message to ECIES User

```bash
# Same command - auto-detects encryption type!
npm run send-message -- 0.0.1441 "Hello with ECIES!"
```

### Listen for Messages

```bash
# Works with both RSA and ECIES messages
npm run listen-for-new-messages
```

### Check Your Configuration

```bash
npm run setup-message-box
```

Output will show:

```
✓ ECIES key pair derived (ECDSA_SECP256K1)
✓ Public key published (ECIES)
✓ Message box 0.0.xxxxx set up correctly (encryption: ECIES)
```

## Need More Info?

- 📖 **Full Documentation**: See `docs/ECIES_SUPPORT.md`
- 📝 **Implementation Details**: See `ECIES_CHANGES.md`
- 🐛 **Issues?**: Check the Troubleshooting section in docs

## Backward Compatibility

✅ **Existing RSA message boxes continue to work**
✅ **No changes required for RSA users**
✅ **Can switch back to RSA anytime**

---

**Pro Tip**: To switch between encryption types, just change `ENCRYPTION_TYPE` in `.env` and run `npm run setup-message-box` to create a new message box!
