<template>
  <section class="panel">
    <h2>Send Message</h2>
    <label>
      Recipient account ID
      <input v-model="recipient" placeholder="0.0.12345" :disabled="busy" />
    </label>
    <label>
      Message
      <textarea
        v-model="message"
        rows="3"
        placeholder="Hello!"
        :disabled="busy"
      />
    </label>
    <button @click="send" :disabled="busy || !ready || !recipient || !message">
      {{ busy ? 'Sending…' : 'Send' }}
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

const recipient = ref('');
const message = ref('');
const busy = ref(false);
const result = ref('');
const error = ref('');

const ready = computed(() => session.signer && session.password);

async function send() {
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
    });

    await messageBox.sendMessage(recipient.value, message.value);
    result.value = `✓ Message sent to ${recipient.value}.`;
    message.value = '';
  } catch (e) {
    error.value = `✗ ${e.message ?? String(e)}`;
  } finally {
    busy.value = false;
  }
}
</script>
