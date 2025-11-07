# ECIES Encryption Support

## Overview

The Hiero Message Box now supports **ECIES (Elliptic Curve Integrated Encryption Scheme)** in addition to RSA encryption. ECIES leverages your Hedera operator's SECP256K1 private key for encryption/decryption, eliminating the need to generate and manage separate RSA key pairs.

**Important**: ECIES requires a SECP256K1 key. ED25519 keys cannot be used for ECIES encryption as they don't support ECDH key exchange.

## Features

- **Native Node.js Implementation**: Uses only built-in `crypto` module, no external dependencies
- **SECP256K1 Support**: Works with SECP256K1 Hedera keys (ED25519 not supported for ECIES)
- **Backward Compatible**: Existing RSA implementation remains unchanged
- **Automatic Key Derivation**: Public keys are derived from your operator's private key
- **Secure**: Uses AES-256-GCM for message encryption with ECDH key exchange

## Configuration

### Enable ECIES

Add or update the `ENCRYPTION_TYPE` variable in your `.env` file:

```bash
# Encryption Configuration
# Options: RSA, ECIES
ENCRYPTION_TYPE=ECIES
```

### Available Options

- **`RSA`** (default): Uses RSA-2048 keys stored in `data/` folder (supports all key types)
- **`ECIES`**: Uses operator's SECP256K1 key from `HEDERA_PRIVATE_KEY` (SECP256K1 only)

## How It Works

### RSA Mode (Traditional)

1. Generate RSA-2048 key pair (stored in `data/rsa_*.pem`)
2. Publish RSA public key to message box topic
3. Senders encrypt messages using recipient's RSA public key
4. Recipients decrypt using their RSA private key

### ECIES Mode (New)

1. Derive public key from `HEDERA_PRIVATE_KEY` in `.env`
2. Publish ECIES public key to message box topic
3. Senders encrypt messages using ECDH with ephemeral keys
4. Recipients decrypt using their operator's private key

## Technical Details

### Encryption Algorithm

ECIES implementation uses:

- **Key Exchange**: ECDH (Elliptic Curve Diffie-Hellman)
- **Symmetric Encryption**: AES-256-GCM
- **Key Derivation**: SHA-256 hash of shared secret
- **Supported Curve**: secp256k1 only

### Encryption Process

1. Generate ephemeral key pair
2. Perform ECDH with recipient's public key → shared secret
3. Derive AES key from shared secret (SHA-256)
4. Encrypt message with AES-256-GCM
5. Include ephemeral public key, IV, ciphertext, and auth tag

### Decryption Process

1. Extract ephemeral public key from encrypted message
2. Perform ECDH with recipient's private key → shared secret
3. Derive AES key from shared secret (SHA-256)
4. Decrypt message with AES-256-GCM

## Usage Examples

### Setup Message Box with ECIES

```bash
# 1. Update .env file
echo "ENCRYPTION_TYPE=ECIES" >> .env

# 2. Setup message box
npm run setup-message-box
```

**Output:**

```text
⚙ Deriving ECIES key pair from operator credentials
✓ ECIES key pair derived (ECDSA_SECP256K1)
✓ Public key published (ECIES)
✓ Message box 0.0.xxxxx set up correctly for account 0.0.1441 (encryption: ECIES)
```

### Send Message to ECIES-Enabled Account

No changes needed! The sender automatically detects the encryption type:

```bash
npm run send-message -- 0.0.1441 "Hello with ECIES!"
```

The system will:

1. Fetch recipient's public key from topic
2. Detect encryption type (ECIES)
3. Encrypt using ECIES
4. Send encrypted message

### Listen for Messages

```bash
npm run listen-for-new-messages
```

Messages are automatically decrypted using the appropriate method based on their encryption type.

## Key Advantages of ECIES

### Over RSA

1. **No Key Files**: No need to manage `rsa_*.pem` files
2. **Smaller Keys**: ECIES public keys are 33-65 bytes vs 2048 bits for RSA
3. **Faster Operations**: ECC operations are generally faster
4. **Native Integration**: Uses your existing Hedera operator key

### Security Considerations

- **Forward Secrecy**: Each message uses a unique ephemeral key
- **Authenticated Encryption**: AES-GCM provides authentication
- **Key Reuse**: Safe to reuse the same key pair for multiple messages

## Migration Guide

### From RSA to ECIES

1. **Update Configuration**:

   ```bash
   # In .env
   ENCRYPTION_TYPE=ECIES
   ```

2. **Create New Message Box**:

   ```bash
   npm run setup-message-box
   ```

   This creates a new topic with ECIES public key.

3. **Update Account Memo**:
   Your account memo will be updated with the new topic ID.

### Backward Compatibility

- Old RSA message boxes continue to work
- RSA-encrypted messages can still be read (keep `data/rsa_*.pem` files)
- Encryption type is stored with each message box
- Automatic detection prevents encryption type mismatches

## Troubleshooting

### "HEDERA_PRIVATE_KEY not found"

**Issue**: ECIES requires the operator's private key.

**Solution**: Ensure `HEDERA_PRIVATE_KEY` is set in `.env`:

```bash
HEDERA_PRIVATE_KEY=302e020100300506032b657004220420...
```

### "Encryption type mismatch"

**Issue**: Trying to decrypt ECIES messages with RSA keys (or vice versa).

**Solution**:

1. Check `ENCRYPTION_TYPE` in `.env` matches your message box
2. Run `npm run setup-message-box` to verify configuration
3. Create a new message box if keys don't match

### Key Type Detection

To verify your key type:

```bash
# Check if you're using ED25519 or SECP256K1
npm run setup-message-box
```

Output will show:

- `ECDSA_SECP256K1`: Your key uses secp256k1 curve
- `ED25519`: Your key uses ed25519 curve

## API Reference

### Environment Variables

```bash
# Encryption type selector
ENCRYPTION_TYPE=RSA|ECIES  # Default: RSA

# Required for ECIES mode
HEDERA_PRIVATE_KEY=<DER-encoded-private-key>
```

### Public Key Format

#### RSA Mode

```json
{
  "type": "PUBLIC_KEY",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...",
  "encryptionType": "RSA"
}
```

#### ECIES Mode

```json
{
  "type": "PUBLIC_KEY",
  "publicKey": {
    "type": "ECIES",
    "key": "03a1b2c3...",
    "curve": "secp256k1"
  },
  "encryptionType": "ECIES"
}
```

### Encrypted Message Format

#### RSA

```json
{
  "type": "RSA",
  "encryptedKey": "...",
  "iv": "...",
  "encryptedData": "..."
}
```

#### ECIES

```json
{
  "type": "ECIES",
  "ephemeralPublicKey": "...",
  "iv": "...",
  "encryptedData": "...",
  "authTag": "...",
  "curve": "secp256k1"
}
```

## Performance Comparison

| Operation       | RSA-2048  | ECIES (secp256k1) |
| --------------- | --------- | ----------------- |
| Key Generation  | ~50ms     | <1ms (derived)    |
| Encryption      | ~2ms      | ~1ms              |
| Decryption      | ~3ms      | ~1ms              |
| Public Key Size | 294 bytes | 33 bytes          |

_Note: Times are approximate and vary by system_

## Limitations

### Key Type Requirements

**ECIES requires SECP256K1 keys only.** ED25519 keys are not supported because:

1. ED25519 is a signature algorithm, not a key exchange algorithm
2. ECIES requires ECDH (Elliptic Curve Diffie-Hellman) for key exchange
3. ED25519 cannot perform ECDH operations

**Solutions if you have an ED25519 key:**

- Use RSA encryption instead (set `ENCRYPTION_TYPE=RSA`)
- Create a new Hedera account with a SECP256K1 key

### Curve Support

Currently supported curve:

- ✅ `secp256k1` (fully supported, required for ECIES)

## References

- [ECIES Specification](https://en.wikipedia.org/wiki/Integrated_Encryption_Scheme)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)
- [Hedera Key Types](https://docs.hedera.com/hedera/sdks-and-apis/sdks/keys)
- [NIST Curves](https://csrc.nist.gov/projects/elliptic-curve-cryptography)

## Support

For issues or questions:

1. Check that `ENCRYPTION_TYPE` is set correctly
2. Verify `HEDERA_PRIVATE_KEY` is in DER format
3. Ensure message box was created with matching encryption type
4. Review error messages for specific guidance
