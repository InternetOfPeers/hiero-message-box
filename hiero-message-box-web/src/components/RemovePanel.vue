<template>
  <section class="panel">
    <h2>Message Box Status</h2>

    <p v-if="checking" class="hint">Checking account memo…</p>
    <template v-else>
      <p v-if="messageBoxId">
        Message box <strong>{{ messageBoxId }}</strong> is configured for this account.
      </p>
      <p v-else class="hint">No message box configured for this account.</p>
    </template>

    <template v-if="messageBoxId && !confirming">
      <button @click="confirming = true" :disabled="busy">Remove Message Box</button>
    </template>

    <template v-if="confirming">
      <p class="error">
        This will clear your account memo. The HCS topic
        <strong>{{ messageBoxId }}</strong> will still exist on the ledger but
        will no longer be linked to your account.
      </p>
      <p>HashPack will show <strong>1 signing request</strong>: update account memo.</p>
      <button @click="doRemove" :disabled="busy">
        {{ busy ? 'Removing…' : 'Confirm Remove' }}
      </button>
      <button @click="confirming = false" :disabled="busy">Cancel</button>
    </template>

    <p v-if="removeResult" class="success">{{ removeResult }}</p>
    <p v-if="error" class="error">{{ error }}</p>

    <button
      @click="checkStatus"
      :disabled="busy || checking"
      style="background: #666"
    >
      Re-check
    </button>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import {
  createConfig,
  createMessageBox,
} from '@internetofpeers/hiero-message-box';
import { session } from '../session.js';
import { BrowserLogger } from '../lib-adapters/browser-logger.js';

const checking = ref(false);
const busy = ref(false);
const confirming = ref(false);
const messageBoxId = ref(null);
const removeResult = ref('');
const error = ref('');

const HIP1334_RE = /\[HIP-1334:(0\.0\.\d+)\]/;

const mirrorNodeUrl =
  session.network === 'mainnet'
    ? 'https://mainnet.mirrornode.hedera.com/api/v1'
    : 'https://testnet.mirrornode.hedera.com/api/v1';

async function checkStatus() {
  checking.value = true;
  messageBoxId.value = null;
  confirming.value = false;
  removeResult.value = '';
  error.value = '';
  try {
    const res = await fetch(`${mirrorNodeUrl}/accounts/${session.accountId}`);
    const data = await res.json();
    const memo = data.memo || '';
    const match = HIP1334_RE.exec(memo);
    messageBoxId.value = match ? match[1] : null;
  } catch (e) {
    error.value = `✗ Could not fetch account info: ${e.message}`;
  } finally {
    checking.value = false;
  }
}

async function doRemove() {
  busy.value = true;
  removeResult.value = '';
  error.value = '';
  try {
    const config = createConfig({
      PAYER_ACCOUNT_ID: session.accountId,
      MESSAGE_BOX_OWNER_ACCOUNT_ID: session.accountId,
      HEDERA_NETWORK: session.network,
    });
    const messageBox = createMessageBox({
      config,
      logger: BrowserLogger,
      signer: session.signer,
    });

    const result = await messageBox.removeMessageBox(session.accountId);
    if (result.success) {
      removeResult.value = '✓ Message box removed successfully.';
      messageBoxId.value = null;
      confirming.value = false;
    } else {
      error.value = `✗ ${result.error ?? 'Removal failed.'}`;
    }
  } catch (e) {
    error.value = `✗ ${e.message ?? String(e)}`;
  } finally {
    busy.value = false;
  }
}

watch(
  () => session.signer,
  (signer, prevSigner) => {
    if (signer && !prevSigner) checkStatus();
  },
  { immediate: true }
);
</script>
