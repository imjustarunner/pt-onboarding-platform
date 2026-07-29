<template>
  <div class="df-actions" :class="{ 'df-actions--end': !secondaryLabel && !showBack }">
    <div class="df-actions-left">
      <button
        v-if="showBack"
        type="button"
        class="df-btn df-btn-secondary"
        :disabled="disabled"
        @click="$emit('back')"
      >
        ← {{ backLabel }}
      </button>
      <button
        v-else-if="secondaryLabel"
        type="button"
        class="df-btn df-btn-secondary"
        :disabled="disabled || secondaryDisabled"
        @click="$emit('secondary')"
      >
        {{ secondaryLabel }}
      </button>
    </div>
    <div class="df-actions-right">
      <button
        type="button"
        class="df-btn df-btn-primary"
        :disabled="disabled || primaryDisabled"
        @click="$emit('primary')"
      >
        {{ primaryLabel }}
        <span v-if="showArrow" aria-hidden="true">→</span>
      </button>
      <p v-if="hint" class="df-enter-hint">{{ hint }}</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  primaryLabel: { type: String, default: 'Save & Continue' },
  secondaryLabel: { type: String, default: '' },
  backLabel: { type: String, default: 'Back' },
  showBack: { type: Boolean, default: false },
  showArrow: { type: Boolean, default: true },
  hint: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  primaryDisabled: { type: Boolean, default: false },
  secondaryDisabled: { type: Boolean, default: false }
});
defineEmits(['primary', 'secondary', 'back']);
</script>

<style scoped>
.df-actions-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
</style>
