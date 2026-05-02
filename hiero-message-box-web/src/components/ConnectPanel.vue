<template>
  <section class="panel">
    <h2>Wallet</h2>

    <div v-if="session.signer">
      <p>
        Connected: <strong>{{ session.accountId }}</strong> ({{
          session.network
        }})
      </p>
      <button @click="disconnect" :disabled="busy">Disconnect</button>
    </div>

    <div v-else>
      <label>
        Network:
        <select v-model="network">
          <option value="testnet">Testnet</option>
          <option value="mainnet">Mainnet</option>
        </select>
      </label>
      <button @click="connect" :disabled="busy">
        {{ busy ? 'Connecting…' : 'Connect Wallet' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
      <p class="hint">
        Requires a Hedera wallet that supports WalletConnect (HashPack, Kabila,
        Blade…).<br />
        Set <code>VITE_WC_PROJECT_ID</code> in <code>.env.local</code> before
        connecting.
      </p>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { session } from '../session.js';
import {
  initDAppConnector,
  connectWallet,
  disconnectWallet,
  tryRestoreSession,
} from '../lib-adapters/walletconnect-signer.js';

const network = ref(session.network);
const busy = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    session.dappConnector = await initDAppConnector(session.network);
    const restored = tryRestoreSession(session.dappConnector);
    if (restored) {
      session.signer = restored.signer;
      session.accountId = restored.accountId;
    }
  } catch {
    // ignore — user can connect manually
  }
});

async function connect() {
  busy.value = true;
  error.value = '';
  try {
    if (!session.dappConnector) {
      session.dappConnector = await initDAppConnector(network.value);
    }
    const result = await connectWallet(session.dappConnector);
    session.signer = result.signer;
    session.accountId = result.accountId;
    session.network = network.value;
  } catch (e) {
    error.value = e.message ?? String(e);
  } finally {
    busy.value = false;
  }
}

async function disconnect() {
  busy.value = true;
  try {
    await disconnectWallet(session.dappConnector);
  } finally {
    session.signer = null;
    session.accountId = null;
    session.dappConnector = null;
    busy.value = false;
  }
}
</script>
