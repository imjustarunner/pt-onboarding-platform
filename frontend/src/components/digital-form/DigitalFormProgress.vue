<template>
  <div v-if="steps.length" class="df-progress-wrap">
    <div class="df-progress-compact df-progress-compact--mobile" aria-live="polite">
      Step <strong>{{ activeDisplay }}</strong> of {{ steps.length }}
      <span v-if="activeLabel"> — {{ activeLabel }}</span>
    </div>
    <nav class="df-progress df-progress--desktop" :aria-label="ariaLabel">
      <div
        v-for="(s, i) in steps"
        :key="s.id || i"
        class="df-progress-step"
        :class="{
          'df-progress-step--active': i === activeIndex,
          'df-progress-step--done': i < activeIndex
        }"
      >
        <span class="df-progress-num">{{ i < activeIndex ? '✓' : i + 1 }}</span>
        <span class="df-progress-label">{{ s.label }}</span>
      </div>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  steps: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
  ariaLabel: { type: String, default: 'Form progress' }
});

const activeDisplay = computed(() => Math.min(props.activeIndex + 1, props.steps.length || 1));
const activeLabel = computed(() => props.steps[props.activeIndex]?.label || '');
</script>

<style scoped>
.df-progress-compact--mobile {
  display: none;
}
@media (max-width: 860px) {
  .df-progress--desktop {
    display: none;
  }
  .df-progress-compact--mobile {
    display: block;
  }
}
</style>
