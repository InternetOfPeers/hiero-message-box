import { session } from '../session.js';

const subtle = globalThis.crypto.subtle;

const toB64url = buf =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

const fromB64url = s =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c =>
    c.charCodeAt(0)
  );

async function encryptWithPassword(plainBytes, password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plainBytes
  );
  return `v1.${toB64url(salt)}.${toB64url(iv)}.${toB64url(ciphertext)}`;
}

async function decryptWithPassword(envelope, password) {
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1')
    throw new Error('Invalid encrypted envelope format');
  const [, s, i, c] = parts;
  const [salt, iv, ciphertext] = [fromB64url(s), fromB64url(i), fromB64url(c)];
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  return new Uint8Array(
    await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  );
}

/**
 * KeyStore implementation that persists RSA keys in localStorage,
 * encrypted with a user-supplied password via PBKDF2+AES-GCM.
 *
 * Storage key per account: "hmb:rsa:<accountId>"
 * Envelope format: "v1.<salt>.<iv>.<ciphertext>" (base64url parts)
 */
export class BrowserKeyStore {
  constructor(accountId) {
    this._accountId = accountId;
  }

  get _storageKey() {
    return `hmb:rsa:${this._accountId}`;
  }

  async loadRSAKeyPair() {
    const envelope = localStorage.getItem(this._storageKey);
    if (!envelope) return null;

    if (!session.password)
      throw new Error('Keys are locked — enter your password first.');

    const plainBytes = await decryptWithPassword(envelope, session.password);
    return JSON.parse(new TextDecoder().decode(plainBytes));
  }

  async saveRSAKeyPair(pair) {
    if (!session.password)
      throw new Error('Password is required to save keys.');

    const bytes = new TextEncoder().encode(JSON.stringify(pair));
    const envelope = await encryptWithPassword(bytes, session.password);
    localStorage.setItem(this._storageKey, envelope);
  }

  hasStoredKey() {
    return localStorage.getItem(this._storageKey) !== null;
  }

  clearKey() {
    localStorage.removeItem(this._storageKey);
  }

  exportEnvelope() {
    return localStorage.getItem(this._storageKey);
  }

  importEnvelope(envelope) {
    localStorage.setItem(this._storageKey, envelope);
  }
}
