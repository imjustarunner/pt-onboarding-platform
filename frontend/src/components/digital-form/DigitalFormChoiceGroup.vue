<template>
  <div class="df-field">
    <div v-if="label" class="df-field-label">
      {{ label }}
      <span v-if="required" class="df-field-required">*</span>
    </div>
    <p v-if="help" class="df-field-help">{{ help }}</p>
    <div
      class="df-choice-group"
      :class="{
        'df-choice-group--cards': layout === 'cards',
        'df-choice-group--multi': multiple
      }"
      :role="multiple ? 'group' : 'radiogroup'"
      :aria-label="label || 'Options'"
    >
      <button
        v-for="opt in normalized"
        :key="opt.value"
        type="button"
        class="df-choice-btn"
        :class="{
          'df-choice-btn--selected': isSelected(opt.value),
          'df-choice-btn--card': layout === 'cards'
        }"
        :aria-pressed="isSelected(opt.value)"
        @click="toggle(opt.value)"
      >
        <span class="df-choice-bubble" aria-hidden="true" />
        <span v-if="opt.icon" class="df-choice-icon" aria-hidden="true">{{ opt.icon }}</span>
        <span class="df-choice-btn-label">{{ opt.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number, Boolean, Array], default: '' },
  options: { type: Array, default: () => [] },
  label: { type: String, default: '' },
  help: { type: String, default: '' },
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  exclusiveValue: { type: String, default: '' },
  layout: { type: String, default: 'pills' }
});
const emit = defineEmits(['update:modelValue']);

const normalized = computed(() =>
  (props.options || []).map((o) =>
    typeof o === 'string' || typeof o === 'number'
      ? { value: String(o), label: String(o) }
      : {
          value: String(o.value ?? o.id ?? o.label ?? ''),
          label: String(o.label || o.name || o.value || ''),
          icon: o.icon || ''
        }
  )
);

function selectedList() {
  if (!props.multiple) return [];
  if (Array.isArray(props.modelValue)) return props.modelValue.map((v) => String(v));
  if (props.modelValue == null || props.modelValue === '') return [];
  return [String(props.modelValue)];
}

function isSelected(value) {
  const v = String(value);
  if (props.multiple) return selectedList().includes(v);
  return String(props.modelValue ?? '') === v;
}

function toggle(value) {
  const v = String(value);
  if (!props.multiple) {
    emit('update:modelValue', v);
    return;
  }
  const exclusive = String(props.exclusiveValue || '').trim();
  const current = selectedList();
  if (exclusive && v === exclusive) {
    emit('update:modelValue', current.includes(v) ? [] : [v]);
    return;
  }
  let next = exclusive ? current.filter((item) => item !== exclusive) : [...current];
  if (next.includes(v)) next = next.filter((item) => item !== v);
  else next.push(v);
  emit('update:modelValue', next);
}
</script>
