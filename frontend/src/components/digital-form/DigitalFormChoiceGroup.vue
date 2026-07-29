<template>
  <div class="df-field">
    <div v-if="label" class="df-field-label">
      {{ label }}
      <span v-if="required" class="df-field-required">*</span>
    </div>
    <p v-if="help" class="df-field-help">{{ help }}</p>
    <div class="df-choice-group" role="radiogroup" :aria-label="label || 'Options'">
      <button
        v-for="opt in normalized"
        :key="opt.value"
        type="button"
        class="df-choice-btn"
        :class="{ 'df-choice-btn--selected': modelValue === opt.value }"
        :aria-pressed="modelValue === opt.value"
        @click="$emit('update:modelValue', opt.value)"
      >
        <span v-if="opt.icon" class="df-choice-icon" aria-hidden="true">{{ opt.icon }}</span>
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: '' },
  options: { type: Array, default: () => [] },
  label: { type: String, default: '' },
  help: { type: String, default: '' },
  required: { type: Boolean, default: false }
});
defineEmits(['update:modelValue']);

const normalized = computed(() =>
  (props.options || []).map((o) =>
    typeof o === 'string' || typeof o === 'number'
      ? { value: o, label: String(o) }
      : { value: o.value, label: o.label || String(o.value), icon: o.icon || '' }
  )
);
</script>
