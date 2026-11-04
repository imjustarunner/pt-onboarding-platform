<template>
  <input
    :id="id"
    :name="name"
    class="birth-date-input"
    type="text"
    inputmode="numeric"
    autocomplete="bday"
    placeholder="MM/DD/YYYY"
    :value="text"
    :readonly="readonly"
    :aria-invalid="invalid ? 'true' : undefined"
    @input="onInput"
    @blur="commit"
  />
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  id: { type: String, default: '' },
  name: { type: String, default: '' },
  invalid: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue', 'blur']);

const text = ref('');

function toDisplay(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : String(value || '');
}

function toIso(value) {
  const raw = String(value || '').trim();
  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (us) {
    const month = us[1].padStart(2, '0');
    const day = us[2].padStart(2, '0');
    const iso = `${us[3]}-${month}-${day}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return '';
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : '';
}

watch(() => props.modelValue, (value) => {
  const shown = toDisplay(value);
  if (shown !== text.value && toIso(text.value) !== String(value || '')) text.value = shown;
}, { immediate: true });

function onInput(event) {
  text.value = event.target.value;
  const iso = toIso(text.value);
  if (iso) emit('update:modelValue', iso);
  else if (!String(text.value || '').trim()) emit('update:modelValue', '');
}

function commit() {
  const iso = toIso(text.value);
  emit('update:modelValue', iso);
  text.value = iso ? toDisplay(iso) : text.value;
  emit('blur');
}
</script>

<style scoped>
.birth-date-input {
  width: 100%;
  min-height: 44px;
  box-sizing: border-box;
  font: inherit;
}
</style>
