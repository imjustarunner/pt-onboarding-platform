<template>
  <span class="rail-move-buttons" :aria-label="`Reorder ${label}`">
    <button type="button" :disabled="disabled || first" :aria-label="`Move ${label} up`" @click="$emit('move', -1)">↑</button>
    <button type="button" :disabled="disabled || last" :aria-label="`Move ${label} down`" @click="$emit('move', 1)">↓</button>
  </span>
</template>
<script setup>
defineProps({ label: String, first: Boolean, last: Boolean, disabled: Boolean });
defineEmits(['move']);
</script>
<style scoped>
.rail-move-buttons { display: flex; align-self: center; gap: 3px; }
button { width: 26px; height: 30px; padding: 0; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card, #fff); color: var(--text-primary); cursor: pointer; font-size: 18px; }
button:disabled { opacity: .3; cursor: default; }
</style>
