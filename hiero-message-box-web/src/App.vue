<template>
  <div id="app-root">
    <header>
      <h1>Hiero Message Box</h1>
      <p class="subtitle">Encrypted messaging demo — HIP-1334</p>
    </header>

    <main>
      <ConnectPanel />

      <template v-if="session.signer">
        <RemovePanel />
        <UnlockPanel />

        <template v-if="session.password">
          <SetupPanel />
          <SendPanel />
          <InboxPanel />
        </template>
      </template>

      <LogStream />
    </main>
  </div>
</template>

<script setup>
import { session } from './session.js';
import ConnectPanel from './components/ConnectPanel.vue';
import UnlockPanel from './components/UnlockPanel.vue';
import SetupPanel from './components/SetupPanel.vue';
import RemovePanel from './components/RemovePanel.vue';
import SendPanel from './components/SendPanel.vue';
import InboxPanel from './components/InboxPanel.vue';
import LogStream from './components/LogStream.vue';
</script>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  font-family: system-ui, sans-serif;
  margin: 0;
  background: #f5f5f5;
  color: #222;
}

#app-root {
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem;
}

header {
  border-bottom: 2px solid #0d6f8b;
  margin-bottom: 1.5rem;
  padding-bottom: 0.5rem;
}

h1 {
  margin: 0;
  color: #0d6f8b;
}
.subtitle {
  margin: 0.25rem 0 0;
  color: #666;
  font-size: 0.9rem;
}

.panel {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
}

.panel h2 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}

label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}
label.checkbox {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

input,
textarea,
select {
  display: block;
  width: 100%;
  margin-top: 3px;
  padding: 0.35rem 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.95rem;
}

button {
  margin-top: 0.5rem;
  margin-right: 0.5rem;
  padding: 0.4rem 1rem;
  border: none;
  border-radius: 4px;
  background: #0d6f8b;
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}
button:not(:disabled):hover {
  background: #0a5a72;
}

.hint {
  font-size: 0.8rem;
  color: #777;
  margin-top: 0.5rem;
}
.error {
  color: #c00;
  margin-top: 0.5rem;
  font-size: 0.9rem;
}
.success {
  color: #1a7a1a;
  margin-top: 0.5rem;
  font-size: 0.9rem;
}
.empty {
  color: #999;
  font-style: italic;
}

.message-list ul {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
}
.message-item {
  padding: 0.3rem 0;
  border-bottom: 1px solid #eee;
  font-size: 0.9rem;
  word-break: break-word;
}
</style>
