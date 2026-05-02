<template>
  <div class="message-list">
    <p v-if="messages.length === 0" class="empty">No messages.</p>
    <ul v-else>
      <li v-for="(msg, i) in messages" :key="i" class="message-item">
        📥 {{ msg }}
      </li>
    </ul>
  </div>
</template>

<script setup>
defineProps({
  messages: {
    type: Array,
    default: () => [],
  },
});
</script>
