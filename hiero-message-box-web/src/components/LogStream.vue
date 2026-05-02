<template>
  <section class="panel log-stream">
    <div class="log-header">
      <h2>Log</h2>
      <button @click="clearLogs" class="clear-btn">Clear</button>
    </div>
    <div class="log-body" ref="logBody">
      <p v-if="session.logs.length === 0" class="empty">No log entries.</p>
      <div
        v-for="(entry, i) in session.logs"
        :key="i"
        :class="['log-line', `log-${entry.level}`]"
      >
        <span class="log-ts">{{ entry.ts.slice(11, 19) }}</span>
        <span class="log-msg">{{ entry.msg }}</span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import { session, clearLogs } from '../session.js';

const logBody = ref(null);

watch(
  () => session.logs.length,
  () => {
    if (logBody.value) {
      logBody.value.scrollTop = logBody.value.scrollHeight;
    }
  }
);
</script>

<style scoped>
.log-stream {
  padding: 0.5rem;
}
.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.clear-btn {
  font-size: 0.75rem;
  padding: 2px 8px;
}
.log-body {
  max-height: 200px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 0.8rem;
}
.log-line {
  display: flex;
  gap: 0.5rem;
  padding: 1px 0;
}
.log-ts {
  color: #888;
  white-space: nowrap;
}
.log-debug {
  color: #aaa;
}
.log-info {
  color: #333;
}
.log-warn {
  color: #b8860b;
}
.log-error {
  color: #c00;
}
</style>
