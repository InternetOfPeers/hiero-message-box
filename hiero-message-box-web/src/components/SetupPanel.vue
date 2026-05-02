<template>
  <section class="panel">
    <h2>Setup Message Box</h2>
    <p>
      Creates a new HCS topic and links it to your account memo.<br />
      HashPack will show <strong>4 signing requests</strong>:
    </p>
    <ol>
      <li>Create the HCS topic</li>
      <li>Sign the public key announcement (ownership proof)</li>
      <li>Submit the public key announcement to the topic</li>
      <li>Update your account memo with the topic ID</li>
    </ol>
    <button @click="setup" :disabled="busy || !ready">
      {{ busy ? 'Setting up…' : 'Setup Message Box' }}
    </button>
    <p v-if="!ready" class="hint">Connect wallet and unlock keys first.</p>
    <p v-if="result" class="success">{{ result }}</p>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue';
import {
  createConfig,
  createMessageBox,
} from '@internetofpeers/hiero-message-box';
import { session } from '../session.js';
import { BrowserKeyStore } from '../lib-adapters/browser-key-store.js';
import { BrowserLogger } from '../lib-adapters/browser-logger.js';

const busy = ref(false);
const result = ref('');
const error = ref('');

const ready = computed(() => session.signer && session.password);

async function setup() {
  busy.value = true;
  result.value = '';
  error.value = '';
  try {
    const config = createConfig({
      PAYER_ACCOUNT_ID: session.accountId,
      MESSAGE_BOX_OWNER_ACCOUNT_ID: session.accountId,
      HEDERA_NETWORK: session.network,
    });
    const keyStore = new BrowserKeyStore(session.accountId);
    const messageBox = createMessageBox({
      config,
      keyStore,
      logger: BrowserLogger,
      signer: session.signer,
      prompt: () => Promise.resolve(true),
    });

    await messageBox.setupMessageBox();
    result.value = '✓ Message box set up successfully.';
  } catch (e) {
    error.value = `✗ ${e.message ?? String(e)}`;
  } finally {
    busy.value = false;
  }
}
</script>
