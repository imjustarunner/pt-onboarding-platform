<template>
  <div
    v-if="type === 'info'"
    class="df-notice"
    style="margin-bottom: 1rem;"
  >
    <div class="df-notice-body">{{ label || help }}</div>
  </div>
  <div
    v-else
    class="df-field intake-q-field"
    :class="{ 'df-field--error': error, 'intake-q-field--wide': isWide }"
  >
    <DigitalFormChoiceGroup
      v-if="isChoiceGroup"
      :model-value="choiceValue"
      :options="normalizedOptions"
      :label="label"
      :help="help"
      :required="required"
      :multiple="isMulti"
      :exclusive-value="exclusiveValue"
      :layout="choiceLayout"
      @update:model-value="$emit('update:modelValue', $event)"
    />

    <template v-else>
      <DigitalFormField
        :id="inputId"
        :model-value="scalarValue"
        :type="resolvedInputType"
        :label="label"
        :help="help"
        :placeholder="placeholder"
        :required="required"
        :options="normalizedOptions"
        :error="error ? 'Required' : ''"
        :rows="textareaRows"
        :email-domain-hints="type === 'email'"
        @update:model-value="$emit('update:modelValue', $event)"
      />
      <div v-if="showCounter" class="intake-q-counter">{{ charCount }} / {{ maxLength }}</div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import DigitalFormField from './DigitalFormField.vue';
import DigitalFormChoiceGroup from './DigitalFormChoiceGroup.vue';
import { isCheckboxGroupField } from '../../utils/intakeShowIf.js';

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { type: [String, Number, Boolean, Array], default: '' },
  label: { type: String, default: '' },
  help: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  options: { type: Array, default: null },
  required: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
  namePrefix: { type: String, default: 'q_' }
});
defineEmits(['update:modelValue']);

const type = computed(() => String(props.field?.type || 'text').toLowerCase());
const isMulti = computed(() => isCheckboxGroupField(props.field));
const exclusiveValue = computed(() => String(props.field?.exclusiveValue || '').trim());
const inputId = computed(() => `${props.namePrefix}${props.field?.key || props.field?.id || 'field'}`);

const normalizedOptions = computed(() => {
  const raw = Array.isArray(props.options) && props.options.length
    ? props.options
    : (props.field?.options || []);
  return raw.map((o) =>
    typeof o === 'string' || typeof o === 'number'
      ? { value: String(o), label: String(o) }
      : { value: String(o.value ?? o.label ?? ''), label: String(o.label || o.value || '') }
  );
});

const isChoiceGroup = computed(() => {
  if (isMulti.value) return true;
  return type.value === 'radio' && normalizedOptions.value.length > 0;
});

const choiceLayout = computed(() => {
  if (props.field?.layout) return props.field.layout;
  const opts = normalizedOptions.value;
  if (isMulti.value) return opts.length > 6 ? 'cards' : 'pills';
  const long = opts.some((o) => String(o.label || '').length > 28);
  return long || opts.length > 6 ? 'cards' : 'pills';
});

const isWide = computed(() => {
  if (type.value === 'textarea' || type.value === 'info' || isMulti.value) return true;
  if (type.value === 'radio' && normalizedOptions.value.length > 3) return true;
  return false;
});

const resolvedInputType = computed(() => {
  if (type.value === 'email' || type.value === 'tel' || type.value === 'date' || type.value === 'textarea' || type.value === 'select') {
    return type.value;
  }
  const key = String(props.field?.key || '').toLowerCase();
  if (key.includes('email')) return 'email';
  if (key.includes('phone')) return 'tel';
  if (key.includes('dob') || key.includes('birth')) return 'date';
  return type.value === 'checkbox' ? 'checkbox' : 'text';
});

const maxLength = computed(() => {
  const n = Number(props.field?.maxLength || 0);
  if (Number.isFinite(n) && n > 0) return n;
  return type.value === 'textarea' ? 2000 : 0;
});
const showCounter = computed(() => type.value === 'textarea' && maxLength.value > 0);
const charCount = computed(() => String(props.modelValue ?? '').length);
const textareaRows = computed(() => (String(props.label || '').length > 80 ? 5 : 4));

const choiceValue = computed(() => {
  if (isMulti.value) return Array.isArray(props.modelValue) ? props.modelValue : [];
  return props.modelValue ?? '';
});
const scalarValue = computed(() => (Array.isArray(props.modelValue) ? '' : (props.modelValue ?? '')));
</script>

<style scoped>
.intake-q-counter {
  text-align: right;
  font-size: 0.72rem;
  color: var(--df-muted, #6b7c74);
  margin-top: -0.35rem;
  margin-bottom: 0.65rem;
}
</style>
