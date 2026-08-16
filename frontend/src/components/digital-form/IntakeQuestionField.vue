<template>
  <div
    v-if="type === 'info'"
    class="df-notice"
    style="margin-bottom: 1rem;"
  >
    <div class="df-notice-body">{{ label || help }}</div>
  </div>
  <div
    v-else-if="type === 'deny_all'"
    class="df-field intake-q-field intake-q-field--wide"
  >
    <button type="button" class="intake-deny-all" @click="$emit('deny-all', field)">
      {{ label || 'Deny all' }}
    </button>
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
      :help="displayHelp"
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
        :help="displayHelp"
        :placeholder="placeholder"
        :required="required"
        :options="normalizedOptions"
        :error="error ? 'Required' : ''"
        :rows="textareaRows"
        :email-domain-hints="type === 'email'"
        @update:model-value="onScalarUpdate"
        @blur="$emit('blur')"
      />
      <ul v-if="isSchool && schoolHits.length" class="intake-school-hits">
        <li v-for="hit in schoolHits" :key="hit.id || hit.slug || hit.name">
          <button type="button" @click="pickSchool(hit)">
            <strong>{{ hit.name }}</strong>
            <span v-if="hit.address || hit.city || hit.district">{{ schoolSub(hit) }}</span>
          </button>
        </li>
      </ul>
      <div v-if="showCounter" class="intake-q-counter">{{ charCount }} / {{ maxLength }}</div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import DigitalFormField from './DigitalFormField.vue';
import DigitalFormChoiceGroup from './DigitalFormChoiceGroup.vue';
import { isCheckboxGroupField } from '../../utils/intakeShowIf.js';
import api from '../../services/api.js';

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
const emit = defineEmits(['update:modelValue', 'blur', 'deny-all']);

const type = computed(() => String(props.field?.type || 'text').toLowerCase());
const isMulti = computed(() => isCheckboxGroupField(props.field));
const exclusiveValue = computed(() => String(props.field?.exclusiveValue || '').trim());
const inputId = computed(() => `${props.namePrefix}${props.field?.key || props.field?.id || 'field'}`);
const isSchool = computed(() => type.value === 'school' || String(props.field?.inputKind || '').toLowerCase() === 'school');
const displayHelp = computed(() => {
  const raw = String(props.help || '').trim();
  if (!raw || raw.toLowerCase() === 'optional') return '';
  return raw;
});
const schoolHits = ref([]);
let schoolTimer = null;

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
  if (type.value === 'textarea' || type.value === 'info' || isMulti.value || isSchool.value) return true;
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
const charCount = computed(() => String(props.modelValue ?? '').length);
const showCounter = computed(() => type.value === 'textarea' && maxLength.value > 0 && charCount.value > 80);
const textareaRows = computed(() => 2);

const choiceValue = computed(() => {
  if (isMulti.value) return Array.isArray(props.modelValue) ? props.modelValue : [];
  return props.modelValue ?? '';
});
const scalarValue = computed(() => (Array.isArray(props.modelValue) ? '' : (props.modelValue ?? '')));

function onScalarUpdate(v) {
  emit('update:modelValue', v);
}

function schoolSub(hit) {
  return [hit.district, hit.address || hit.city].filter(Boolean).join(' · ');
}

function pickSchool(hit) {
  emit('update:modelValue', hit.name);
  schoolHits.value = [];
}

watch(
  () => [isSchool.value, String(props.modelValue || '')],
  ([school, q]) => {
    if (!school) return;
    const v = String(q || '').trim();
    if (schoolTimer) clearTimeout(schoolTimer);
    if (v.length < 2) {
      schoolHits.value = [];
      return;
    }
    schoolTimer = setTimeout(async () => {
      try {
        const r = await api.get('/public/schools/search', {
          params: { q: v },
          skipGlobalLoading: true,
          skipAuthRedirect: true
        });
        schoolHits.value = Array.isArray(r.data) ? r.data.slice(0, 8) : [];
      } catch {
        schoolHits.value = [];
      }
    }, 220);
  }
);
</script>

<style scoped>
.intake-q-counter {
  text-align: right;
  font-size: 0.72rem;
  color: var(--df-muted, #6b7c74);
  margin-top: -0.35rem;
  margin-bottom: 0.65rem;
}
.intake-deny-all {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.6rem;
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
  border: 1.5px solid var(--df-primary, #1e4d3b);
  background: color-mix(in srgb, var(--df-primary, #1e4d3b) 8%, #fff);
  color: var(--df-primary, #1e4d3b);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.intake-school-hits {
  list-style: none;
  margin: 0.2rem 0 0.6rem;
  padding: 0;
  border: 1px solid var(--df-border, #d7e3dc);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.intake-school-hits button {
  width: 100%;
  text-align: left;
  border: 0;
  background: #fff;
  padding: 0.55rem 0.75rem;
  font: inherit;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.intake-school-hits button:hover {
  background: #f4f8f6;
}
.intake-school-hits span {
  font-size: 0.78rem;
  color: var(--df-muted, #5b6b63);
}
</style>
