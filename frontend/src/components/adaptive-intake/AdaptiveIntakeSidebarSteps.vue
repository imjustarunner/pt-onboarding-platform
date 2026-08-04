<template>
  <nav class="ai-sidebar-steps" :aria-label="ariaLabel">
    <ol class="ai-sidebar-steps-list">
      <li
        v-for="(step, i) in steps"
        :key="step.id || i"
        class="ai-sidebar-step"
        :class="{
          'ai-sidebar-step--done': i < activeIndex,
          'ai-sidebar-step--active': i === activeIndex,
          'ai-sidebar-step--upcoming': i > activeIndex
        }"
      >
        <span class="ai-sidebar-step-marker" aria-hidden="true">
          <span v-if="i < activeIndex" class="ai-sidebar-step-check">✓</span>
          <span v-else>{{ i + 1 }}</span>
        </span>
        <span class="ai-sidebar-step-text">
          <span class="ai-sidebar-step-label">{{ step.label }}</span>
          <span v-if="i === activeIndex && (step.hint || youAreHere)" class="ai-sidebar-step-hint">
            {{ step.hint || youAreHere }}
          </span>
          <span v-else-if="i < activeIndex" class="ai-sidebar-step-hint">{{ completedLabel }}</span>
        </span>
      </li>
    </ol>
  </nav>
</template>

<script setup>
defineProps({
  steps: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
  ariaLabel: { type: String, default: 'Intake progress' },
  youAreHere: { type: String, default: 'You are here' },
  completedLabel: { type: String, default: 'Completed' }
});
</script>
