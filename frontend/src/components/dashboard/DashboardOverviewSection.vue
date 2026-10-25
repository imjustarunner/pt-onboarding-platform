<template>
  <section class="overview-section" :data-tour="`dash-section-${sectionId}`" :aria-label="label">
    <button type="button" class="section-collapse" :aria-label="`Collapse ${label} to a summary card`" @click="$emit('collapse')">Collapse ↑</button>
    <slot />
  </section>
</template>
<script setup>
defineProps({ label: String, sectionId: String });
defineEmits(['collapse']);
</script>
<style scoped>
.overview-section { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.section-collapse { align-self: flex-end; border: 1px solid var(--border, #e2e8f0); border-radius: 7px; background: var(--bg-card, #fff); color: var(--text-secondary, #475569); padding: 5px 9px; font: inherit; font-size: 12px; cursor: pointer; }
.overview-section > :deep(*) { max-width: 100%; min-width: 0; box-sizing: border-box; }
</style>
