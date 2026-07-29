<template>
  <div v-if="type === 'info'" class="df-notice" style="margin-bottom: 1rem;">
    <div class="df-notice-body" v-html="safeInfoHtml" />
  </div>
  <div v-else class="df-field" :class="{ 'df-field--error': error }">
    <label v-if="label && type !== 'checkbox'" class="df-field-label" :for="inputId">
      {{ label }}
      <span v-if="required" class="df-field-required">*</span>
    </label>
    <p v-if="help && type !== 'checkbox'" class="df-field-help">{{ help }}</p>

    <input
      v-if="type === 'text' || type === 'email' || type === 'tel' || type === 'date' || type === 'number'"
      :id="inputId"
      class="df-input"
      :type="type === 'text' ? 'text' : type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      @input="$emit('update:modelValue', $event.target.value)"
    />

    <textarea
      v-else-if="type === 'textarea'"
      :id="inputId"
      class="df-textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :rows="rows"
      @input="$emit('update:modelValue', $event.target.value)"
    />

    <select
      v-else-if="type === 'select'"
      :id="inputId"
      class="df-select"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option value="" disabled>{{ placeholder || 'Select…' }}</option>
      <option v-for="opt in normalizedOptions" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>

    <div v-else-if="type === 'radio'" class="df-likert-options" role="radiogroup">
      <label v-for="opt in normalizedOptions" :key="opt.value">
        <input
          type="radio"
          :name="inputId"
          :value="opt.value"
          :checked="modelValue === opt.value"
          :disabled="disabled"
          @change="$emit('update:modelValue', opt.value)"
        />
        {{ opt.label }}
      </label>
    </div>

    <label v-else-if="type === 'checkbox'" class="df-checkbox-row">
      <input
        type="checkbox"
        :checked="!!modelValue"
        :disabled="disabled"
        @change="$emit('update:modelValue', $event.target.checked)"
      />
      <span>
        {{ label }}
        <span v-if="required" class="df-field-required">*</span>
        <span v-if="help" class="df-field-help" style="display:block;">{{ help }}</span>
      </span>
    </label>

    <p v-if="error" class="df-field-error">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number, Boolean, Array], default: '' },
  type: { type: String, default: 'text' },
  label: { type: String, default: '' },
  help: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  options: { type: Array, default: () => [] },
  error: { type: String, default: '' },
  rows: { type: Number, default: 4 },
  id: { type: String, default: '' }
});
defineEmits(['update:modelValue']);

const inputId = computed(() => props.id || `df-field-${Math.random().toString(36).slice(2, 9)}`);

const normalizedOptions = computed(() =>
  (props.options || []).map((o) =>
    typeof o === 'string' || typeof o === 'number'
      ? { value: String(o), label: String(o) }
      : { value: String(o.value ?? o.id ?? ''), label: String(o.label || o.name || o.value || '') }
  )
);

const safeInfoHtml = computed(() => {
  const raw = String(props.help || props.label || props.modelValue || '');
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
});
</script>

<style scoped>
.df-checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  font-size: 0.9rem;
  cursor: pointer;
}
.df-field-error {
  color: var(--df-danger);
  font-size: 0.8rem;
  margin: 0;
}
</style>
