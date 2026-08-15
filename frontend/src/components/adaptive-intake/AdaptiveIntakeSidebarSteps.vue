<template>
  <nav class="ai-sidebar-steps" :class="{ 'ai-sidebar-steps--dark': variant === 'dark' }" :aria-label="ariaLabel">
    <ol class="ai-sidebar-steps-list">
      <li
        v-for="(step, i) in steps"
        :key="step.id || i"
        class="ai-sidebar-step"
        :class="{
          'ai-sidebar-step--done': i < activeIndex,
          'ai-sidebar-step--active': i === activeIndex,
          'ai-sidebar-step--upcoming': i > activeIndex,
          'ai-sidebar-step--clickable': interactive && isReachable(i)
        }"
      >
        <button
          v-if="interactive"
          type="button"
          class="ai-sidebar-step-btn"
          :disabled="!isReachable(i)"
          @click="selectStep(i)"
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
        </button>
        <template v-else>
          <span class="ai-sidebar-step-marker" aria-hidden="true">
            <span v-if="i < activeIndex" class="ai-sidebar-step-check">✓</span>
            <span v-else>{{ i + 1 }}</span>
          </span>
          <span class="ai-sidebar-step-text">
            <input
              v-if="editing"
              class="ai-sidebar-step-input"
              :value="step.label"
              @mousedown.stop
              @click.stop
              @input="onLabelInput(i, $event)"
            />
            <span v-else class="ai-sidebar-step-label">{{ step.label }}</span>
            <span v-if="i === activeIndex && (step.hint || youAreHere)" class="ai-sidebar-step-hint">
              {{ step.hint || youAreHere }}
            </span>
            <span v-else-if="i < activeIndex" class="ai-sidebar-step-hint">{{ completedLabel }}</span>
          </span>
        </template>
      </li>
    </ol>
  </nav>
</template>

<script setup>
const props = defineProps({
  steps: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
  maxReachableIndex: { type: Number, default: 0 },
  variant: { type: String, default: 'light' },
  ariaLabel: { type: String, default: 'Intake progress' },
  youAreHere: { type: String, default: 'You are here' },
  completedLabel: { type: String, default: 'Completed' },
  interactive: { type: Boolean, default: false },
  editing: { type: Boolean, default: false }
});

const emit = defineEmits(['select', 'update-label']);

function isReachable(index) {
  const last = props.steps.length ? props.steps.length - 1 : 0;
  if (index >= last && String(props.steps[index]?.id || '') === 'complete') return false;
  return index <= Math.max(Number(props.activeIndex || 0), Number(props.maxReachableIndex || 0));
}

function selectStep(index) {
  if (props.editing) return;
  if (!isReachable(index)) return;
  emit('select', index);
}

function onLabelInput(index, event) {
  emit('update-label', { index, label: event.target.value });
}
</script>
