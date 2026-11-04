<template>
  <div class="card-status" :aria-busy="loading" role="status">
    <template v-if="loading">
      <span class="card-status-line" aria-hidden="true"></span>
      <span class="card-status-line card-status-line--short" aria-hidden="true"></span>
      <span>{{ label }}</span>
    </template>
    <template v-else>
      <span>{{ error }}</span>
      <button type="button" @click="$emit('retry')">Try again</button>
    </template>
  </div>
</template>

<script setup>
defineProps({ loading: Boolean, error: { type: String, default: '' }, label: { type: String, default: 'Loading…' } });
defineEmits(['retry']);
</script>

<style scoped>
.card-status { min-height: 130px; padding: 20px 8px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 12px; color: var(--text-secondary, #64748b); font-size: 13px; }
.card-status-line { display: block; width: 85%; height: 12px; border-radius: 6px; background: var(--border-color, #e5e7eb); }
.card-status-line--short { width: 60%; }
button { padding: 7px 12px; border: 1px solid currentColor; border-radius: 6px; background: transparent; color: var(--agency-primary-color, #334155); cursor: pointer; font: inherit; }
button:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
</style>
