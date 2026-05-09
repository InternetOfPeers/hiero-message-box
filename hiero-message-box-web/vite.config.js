import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    vue(),
    // @hiero-ledger/sdk/lib/browser.cjs bundles protobuf code that references
    // Buffer as a global, which doesn't exist in browsers. This plugin injects
    // the buffer polyfill wherever Buffer is used as an identifier in the bundle.
    nodePolyfills({ include: ['buffer'], globals: { Buffer: true } }),
  ],
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
