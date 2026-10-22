<template>
  <p v-if="count !== null && count !== undefined" class="parent-contact-attempts" title="Recorded email threads, new text conversations, and secure-message topics. Replies do not add attempts.">
    Contact attempts: <strong>{{ count }}</strong>
  </p>
</template>
<script setup>
defineProps({ count: { type: Number, default: null } });
</script>
<style scoped>
.parent-contact-attempts { margin: 6px 0; font-size: 13px; line-height: 1.5; color: inherit; }
</style>
