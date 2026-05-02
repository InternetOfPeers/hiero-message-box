import { reactive } from 'vue';

/**
 * Global reactive session state.
 * - dappConnector: DAppConnector instance (set after init)
 * - accountId: connected Hedera account ID string (e.g. "0.0.12345")
 * - network: 'testnet' | 'mainnet'
 * - signer: DAppSigner from WalletConnect (set after wallet connects)
 * - password: in-memory unlock password for BrowserKeyStore (never persisted)
 * - logs: reactive array of { level, msg, ts } for LogStream component
 */
export const session = reactive({
  dappConnector: null,
  accountId: null,
  network: 'testnet',
  signer: null,
  password: null,
  logs: [],
});

export function addLog(level, msg) {
  session.logs.push({ level, msg, ts: new Date().toISOString() });
  if (session.logs.length > 500) session.logs.shift();
}

export function clearLogs() {
  session.logs.splice(0);
}
