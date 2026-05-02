import { DAppConnector } from '@hashgraph/hedera-wallet-connect';
import { LedgerId, AccountId } from '@hiero-ledger/sdk';

// Set VITE_WC_PROJECT_ID in hiero-message-box-web/.env.local
// Get a free project ID at https://cloud.reown.com
const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID ?? '';

/**
 * Create and initialize a DAppConnector for the given network.
 * @param {'testnet'|'mainnet'} network
 * @returns {Promise<DAppConnector>}
 */
export async function initDAppConnector(network = 'testnet') {
  if (!WC_PROJECT_ID) {
    throw new Error(
      'WalletConnect project ID is missing. Create hiero-message-box-web/.env.local with VITE_WC_PROJECT_ID=<your_id>. Get a free ID at https://cloud.reown.com'
    );
  }
  const ledgerId = network === 'mainnet' ? LedgerId.MAINNET : LedgerId.TESTNET;

  const connector = new DAppConnector(
    {
      name: 'Hiero Message Box',
      description: 'Encrypted messaging demo for Hedera accounts',
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.ico`],
    },
    ledgerId,
    WC_PROJECT_ID
  );

  await connector.init({ logger: 'error' });
  return connector;
}

/**
 * If the connector already has a live session (restored from localStorage),
 * return the first signer without opening the QR modal.
 * @param {DAppConnector} connector
 * @returns {{signer: DAppSigner, accountId: string} | null}
 */
export function tryRestoreSession(connector) {
  if (connector.signers && connector.signers.length > 0) {
    const signer = connector.signers[0];
    return { signer, accountId: signer.getAccountId().toString() };
  }
  return null;
}

/**
 * Open the WalletConnect QR modal and wait for connection.
 * Returns the DAppSigner for the first connected account.
 * @param {DAppConnector} connector
 * @returns {Promise<{signer: DAppSigner, accountId: string}>}
 */
export async function connectWallet(connector) {
  const session = await connector.openModal();
  const signer = connector.signers[0];
  const accountId = signer.getAccountId().toString();
  return { signer, accountId, session };
}

/**
 * Disconnect all sessions and clear signers.
 * @param {DAppConnector} connector
 */
export async function disconnectWallet(connector) {
  try {
    await connector.disconnectAll();
  } catch {
    // ignore — already disconnected
  }
}
