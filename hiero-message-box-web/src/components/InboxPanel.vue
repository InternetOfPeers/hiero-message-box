<template>
  <section class="panel">
    <h2>Inbox</h2>

    <div class="controls">
      <label>
        From sequence #
        <input
          type="number"
          v-model.number="startSeq"
          min="1"
          :disabled="busy"
          style="width: 80px"
        />
      </label>
      <button @click="check" :disabled="busy || !ready">
        {{ busy ? 'Checking…' : 'Check Messages' }}
      </button>
      <button @click="togglePoll" :disabled="!ready">
        {{ polling ? 'Stop Listening' : 'Start Listening' }}
      </button>
    </div>

    <p v-if="!ready" class="hint">Connect wallet and unlock keys first.</p>
    <p v-if="error" class="error">{{ error }}</p>

    <MessageList :messages="messages" />
  </section>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue';
import {
  createConfig,
  createMessageBox,
} from '@internetofpeers/hiero-message-box';
import { session } from '../session.js';
import { BrowserKeyStore } from '../lib-adapters/browser-key-store.js';
import { BrowserLogger } from '../lib-adapters/browser-logger.js';
import MessageList from './MessageList.vue';

const startSeq = ref(2);
const busy = ref(false);
const polling = ref(false);
const messages = ref([]);
const error = ref('');
let pollTimer = null;

const ready = computed(() => session.signer && session.password);

function buildMessageBox() {
  const config = createConfig({
    PAYER_ACCOUNT_ID: session.accountId,
    MESSAGE_BOX_OWNER_ACCOUNT_ID: session.accountId,
    HEDERA_NETWORK: session.network,
  });
  const keyStore = new BrowserKeyStore(session.accountId);
  return createMessageBox({
    config,
    keyStore,
    logger: BrowserLogger,
    signer: session.signer,
  });
}

async function check() {
  busy.value = true;
  error.value = '';
  try {
    const box = buildMessageBox();
    const fetched = await box.checkMessages(session.accountId, startSeq.value);
    messages.value = fetched;
    if (fetched.length === 0) {
      BrowserLogger.info('No messages found in the specified range.');
    }
  } catch (e) {
    error.value = `✗ ${e.message ?? String(e)}`;
  } finally {
    busy.value = false;
  }
}

function togglePoll() {
  if (polling.value) {
    stopPoll();
  } else {
    startPoll();
  }
}

function startPoll() {
  polling.value = true;
  const box = buildMessageBox();
  const doPoll = async () => {
    try {
      const newMessages = await box.pollMessages(session.accountId);
      if (newMessages.length > 0) {
        messages.value = [...messages.value, ...newMessages];
      }
    } catch (e) {
      error.value = `✗ ${e.message ?? String(e)}`;
      stopPoll();
    }
    if (polling.value) pollTimer = setTimeout(doPoll, 3000);
  };
  doPoll();
}

function stopPoll() {
  polling.value = false;
  clearTimeout(pollTimer);
}

onUnmounted(stopPoll);
</script>
