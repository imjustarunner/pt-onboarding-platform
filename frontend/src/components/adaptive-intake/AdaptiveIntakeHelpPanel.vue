<template>
  <aside class="ai-help-panel" :aria-label="ariaLabel">
    <div v-for="(block, i) in blocks" :key="block.id || i" class="ai-help-card">
      <div class="ai-help-card-head">
        <span v-if="block.icon" class="ai-help-card-icon" aria-hidden="true">{{ block.icon }}</span>
        <h3 class="ai-help-card-title">{{ block.title }}</h3>
      </div>
      <p v-if="block.body" class="ai-help-card-body">{{ block.body }}</p>
      <ul v-if="block.bullets?.length" class="ai-help-card-list">
        <li v-for="(b, j) in block.bullets" :key="j">{{ b }}</li>
      </ul>
    </div>
    <slot />
  </aside>
</template>

<script setup>
defineProps({
  blocks: { type: Array, default: () => [] },
  ariaLabel: { type: String, default: 'Helpful information' }
});
</script>
