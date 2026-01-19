<template>
  <label class="toggle" :class="{ disabled }">
    <input
      class="toggle-input"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="onChange"
    />
    <span class="toggle-track" :class="{ compact }" aria-hidden="true">
      <span class="toggle-thumb" />
    </span>
    <span v-if="label" class="toggle-text">{{ label }}</span>
  </label>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  compact: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue']);

const onChange = (e) => {
  emit('update:modelValue', !!e.target.checked);
};
</script>

<style scoped>
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.toggle.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  overflow: hidden;
  pointer-events: none;
}

.toggle-track {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.18);
  border: 1px solid rgba(15, 23, 42, 0.16);
  display: inline-flex;
  align-items: center;
  padding: 2px;
  transition: background 0.15s ease, border-color 0.15s ease;
  flex-shrink: 0;
}

.toggle-track.compact {
  width: 38px;
  height: 20px;
}

.toggle-thumb {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: white;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transform: translateX(0);
  transition: transform 0.15s ease;
}

.toggle-track.compact .toggle-thumb {
  width: 16px;
  height: 16px;
}

/* Checked */
.toggle-input:checked + .toggle-track {
  background: var(--primary);
  border-color: var(--primary);
}
.toggle-input:checked + .toggle-track .toggle-thumb {
  transform: translateX(20px);
}
.toggle-input:checked + .toggle-track.compact .toggle-thumb {
  transform: translateX(18px);
}

/* Focus */
.toggle-input:focus-visible + .toggle-track {
  outline: 3px solid rgba(var(--primary-rgb, 0, 0, 0), 0.25);
  outline-offset: 2px;
}

.toggle-text {
  font-size: 14px;
  color: var(--text-primary);
}
</style>

