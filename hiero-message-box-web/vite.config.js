import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// No node-polyfills plugin needed — @internetofpeers/hiero-message-box is isomorphic.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Force the browser build of the Hiero SDK so that Node-only code
      // (@grpc/grpc-js, stream, tls, …) is never bundled for the browser.
      '@hiero-ledger/sdk': new URL(
        '../node_modules/@hiero-ledger/sdk/lib/browser.cjs',
        import.meta.url
      ).pathname,
    },
  },
  build: {
    // The workspace lib symlinks outside node_modules; include it in CJS→ESM transform.
    commonjsOptions: {
      include: [/node_modules/, /hiero-message-box-lib/],
    },
  },
  optimizeDeps: {
    // Pre-bundle the CJS workspace lib. force:true re-bundles on every dev
    // server start so local changes to the lib are always picked up.
    include: ['@internetofpeers/hiero-message-box'],
    force: true,
  },
});
