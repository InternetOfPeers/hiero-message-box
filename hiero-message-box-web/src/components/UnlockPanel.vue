<template>
  <section class="panel">
    <h2>Encryption Keys</h2>

    <div v-if="session.password">
      <p>✓ Keys unlocked for this session.</p>
      <button @click="lock">Lock</button>
      <button @click="confirming = true" class="btn-danger">Recreate Keys…</button>
      <div v-if="confirming" class="confirm-box">
        <p class="error">
          ⚠ This permanently deletes your stored keys. Messages encrypted with
          the current public key can no longer be decrypted. You will need to
          run Setup Message Box again to publish a new public key.
        </p>
        <button @click="recreate" class="btn-danger">Delete and recreate</button>
        <button @click="confirming = false">Cancel</button>
      </div>
    </div>

    <div v-else>
      <template v-if="hasKeys">
        <p>
          Encrypted RSA keys found for <strong>{{ session.accountId }}</strong
          >. Enter your password to unlock them.
        </p>
      </template>
      <template v-else>
        <p>
          No encryption keys found for
          <strong>{{ session.accountId }}</strong
          >. Choose a password to generate and store new RSA keys.
        </p>
      </template>

      <input
        type="password"
        v-model="password"
        :placeholder="hasKeys ? 'Password' : 'Choose a password'"
        @keyup.enter="unlock"
      />
      <button @click="unlock" :disabled="busy || !password">
        {{ busy ? 'Unlocking…' : hasKeys ? 'Unlock' : 'Create Keys' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>

      <p v-if="hasKeys" class="hint">
        Forgot your password?
        <a href="#" @click.prevent="confirming = true">Recreate keys</a>
        (you will lose access to existing encrypted messages).
      </p>

      <div v-if="confirming" class="confirm-box">
        <p class="error">
          ⚠ This permanently deletes your stored keys. Messages encrypted with
          the current public key can no longer be decrypted. You will need to
          run Setup Message Box again to publish a new public key.
        </p>
        <button @click="recreate" class="btn-danger">Delete and recreate</button>
        <button @click="confirming = false">Cancel</button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue';
import { session } from '../session.js';
import { BrowserKeyStore } from '../lib-adapters/browser-key-store.js';

const password = ref('');
const busy = ref(false);
const error = ref('');
const confirming = ref(false);

const hasKeys = computed(
  () => session.accountId && new BrowserKeyStore(session.accountId).hasStoredKey()
);

async function unlock() {
  if (!password.value) return;
  busy.value = true;
  error.value = '';
  try {
    if (hasKeys.value) {
      // Validate immediately so a wrong password is caught here, not later.
      session.password = password.value;
      await new BrowserKeyStore(session.accountId).loadRSAKeyPair();
    } else {
      session.password = password.value;
    }
    password.value = '';
  } catch {
    session.password = null;
    error.value = 'Wrong password — could not decrypt the stored keys.';
  } finally {
    busy.value = false;
  }
}

function lock() {
  session.password = null;
  error.value = '';
  confirming.value = false;
}

function recreate() {
  new BrowserKeyStore(session.accountId).clearKey();
  session.password = null;
  confirming.value = false;
  error.value = '';
}
</script>

<style scoped>
.confirm-box {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #c00;
  border-radius: 4px;
  background: #fff5f5;
}
.btn-danger {
  background: #c00;
}
.btn-danger:not(:disabled):hover {
  background: #a00;
}
</style>
