<template>
  <input :value="displayValue" type="text" inputmode="numeric" autocomplete="off"
    :placeholder="type === 'ssn' ? '123-45-6789' : '12-3456789'"
    :pattern="type === 'ssn' ? '[0-9]{3}-[0-9]{2}-[0-9]{4}' : '[0-9]{2}-[0-9]{7}'"
    title="Enter a nine-digit tax ID" @input="update" />
</template>
<script setup>
import { computed, nextTick } from 'vue';
import { formatTaxId, taxIdDigits } from '../../utils/taxId';
const props = defineProps({ modelValue: { type: String, default: '' }, type: { type: String, default: 'ein' } });
const emit = defineEmits(['update:modelValue']);
const displayValue = computed(() => formatTaxId(props.modelValue, props.type));
async function update(event) {
  const input = event.target;
  const position = taxIdDigits(input.value.slice(0, input.selectionStart ?? input.value.length)).length;
  const digits = taxIdDigits(input.value);
  emit('update:modelValue', digits);
  await nextTick();
  input.value = formatTaxId(digits, props.type);
  let cursor = 0, seen = 0;
  while (cursor < input.value.length && seen < position) { if (/\d/.test(input.value[cursor])) seen++; cursor++; }
  input.setSelectionRange(cursor, cursor);
}
</script>
