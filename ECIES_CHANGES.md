# ECIES Implementation - Summary of Changes

## Overview

Added native ECIES (Elliptic Curve Integrated Encryption Scheme) support to the Hiero Message Box, allowing users to leverage their Hedera operator credentials (SECP256K1 only) for encryption instead of managing separate RSA key pairs.

## Implementation Highlights

✅ **100% Native Node.js** - Uses only built-in `crypto` module, no external dependencies
✅ **Backward Compatible** - Existing RSA implementation unchanged
✅ **Automatic Key Derivation** - Derives public key from `HEDERA_PRIVATE_KEY`
✅ **SECP256K1 Support** - Works with secp256k1 keys (ED25519 not supported for ECIES)
✅ **Format Detection** - Automatically detects and handles both encryption types

## Files Modified

### 1. `.env` and `.env.example`

- Added `ENCRYPTION_TYPE` configuration variable
- Options: `RSA` (default) or `ECIES`
- Maintains backward compatibility by defaulting to RSA

### 2. `src/lib/common.js`

**New Functions:**

- `getEncryptionType()` - Returns configured encryption type
- `encryptMessageECIES()` - ECIES encryption using ECDH + AES-256-GCM
- `decryptMessageECIES()` - ECIES decryption
- `encryptMessageRSA()` - Renamed from `encryptMessage` for clarity

**Modified Functions:**

- `encryptMessage()` - Now router function, detects encryption type
- `decryptMessage()` - Now router function, detects encryption type

**Technical Details:**

- ECIES uses ECDH for key exchange
- AES-256-GCM for symmetric encryption
- SHA-256 for key derivation from shared secret
- Ephemeral key generation for each message (forward secrecy)

### 3. `src/lib/hedera.js`

**New Functions:**

- `parseHederaPrivateKey()` - Extracts key type and raw bytes from DER format
- `derivePublicKeyFromHederaKey()` - Derives public key from private key

**Added Support:**

- SECP256K1 key parsing and derivation
- Key type detection (returns 'ED25519' or 'ECDSA_SECP256K1')
- Note: Only SECP256K1 is usable for ECIES encryption

### 4. `src/lib/message-box.js`

**New Functions:**

- `loadOrGenerateKeyPair()` - Routes to RSA or ECIES based on config
- `loadOrGenerateECIESKeyPair()` - Derives ECIES keys from operator key

**Modified Functions:**

- `setupMessageBox()` - Now supports both encryption types
- `pollMessages()` - Handles both RSA and ECIES decryption
- `checkMessages()` - Handles both RSA and ECIES decryption
- `publishPublicKey()` - Includes encryption type in metadata
- `getPublicKeyFromTopic()` - Returns object with encryption type
- `verifyKeyPairMatchesTopic()` - Verifies encryption type match
- `formatMessage()` - Enhanced to show encryption type
- `listenForMessages()` - Passes encryption type through

**Key Changes:**

- Public keys now include encryption type metadata
- Private keys are objects for ECIES: `{ type, key, curve }`
- Automatic encryption type validation during setup

### 5. `docs/ECIES_SUPPORT.md` (New)

Comprehensive documentation covering:

- Configuration and setup
- Technical details of implementation
- Usage examples
- Migration guide
- Troubleshooting
- API reference
- Performance comparison

## Key Features

### Security

- **Forward Secrecy**: Each message uses unique ephemeral key
- **Authenticated Encryption**: AES-GCM provides authentication
- **Key Derivation**: SHA-256 hashing of ECDH shared secret

### Compatibility

- Mixed environments: RSA and ECIES users can coexist
- Automatic detection: Messages include encryption type metadata
- Validation: Prevents encryption type mismatches

### Performance

- Faster than RSA (ECC operations are more efficient)
- Smaller public keys (33-65 bytes vs 294 bytes for RSA)
- No key file management needed

## Usage

### Switch to ECIES

```bash
# 1. Update .env
echo "ENCRYPTION_TYPE=ECIES" >> .env

# 2. Setup message box
npm run setup-message-box

# 3. Use normally
npm run listen-for-new-messages
npm run send-message -- 0.0.1441 "Hello with ECIES!"
```

### Stay with RSA

No changes needed! Default behavior unchanged:

```bash
# .env
ENCRYPTION_TYPE=RSA  # or omit this line entirely
```

## Message Format Changes

### Public Key Messages

**Before (RSA only):**

```json
{
  "type": "PUBLIC_KEY",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n..."
}
```

**After (includes encryption type):**

```json
{
  "type": "PUBLIC_KEY",
  "publicKey": { "type": "ECIES", "key": "03a1...", "curve": "secp256k1" },
  "encryptionType": "ECIES"
}
```

### Encrypted Messages

**RSA Format:**

```json
{
  "type": "RSA",
  "encryptedKey": "...",
  "iv": "...",
  "encryptedData": "..."
}
```

**ECIES Format:**

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

## Testing Recommendations

1. **Test RSA Mode** (default):

   ```bash
   ENCRYPTION_TYPE=RSA npm run setup-message-box
   ```

2. **Test ECIES Mode**:

   ```bash
   ENCRYPTION_TYPE=ECIES npm run setup-message-box
   ```

3. **Test Cross-Compatibility**:
   - Send RSA-encrypted message to ECIES recipient (should fail gracefully)
   - Verify error messages are clear

4. **Test Key Types**:
   - Test with RSA-generate keys
   - Test with SECP256K1 operator key

## Migration Path

### For Existing Users

- No action required
- RSA continues to work as before
- Can opt-in to ECIES at any time

### To Adopt ECIES

1. Set `ENCRYPTION_TYPE=ECIES` in `.env`
2. Run `npm run setup-message-box` to create new message box
3. Old RSA message box remains accessible (keep `data/rsa_*.pem` files)

## Known Limitations

1. **No Key Migration**: Must create new message box to switch encryption types
2. **Curve Restrictions**: Only secp256k1 is supported

## Future Enhancements

- [ ] Support additional curves (P-256, P-384)
- [ ] Add key migration utility
- [ ] Performance benchmarks
- [ ] Integration tests for both encryption types

## References

- Native Node.js crypto module documentation
- ECIES specification
- Hedera key format documentation
- NIST elliptic curve standards

---

**Implementation Date**: November 7, 2025
**Version**: 1.1.0 (proposed)
**Status**: ✅ Complete and Ready for Testing
