<template>
  <fieldset class="contract-focus">
    <legend>Service focus</legend>
    <div v-for="(value, index) in rows" :key="index" class="focus-row">
      <select :value="value" :aria-label="`Service focus ${index + 1}`" @change="choose(index, $event.target.value)">
        <option value="">Choose a service focus</option>
        <option v-if="value && !options.includes(value)" :value="value" disabled>{{ value }} (current value)</option>
        <option v-for="option in options" :key="option" :value="option" :disabled="rows.includes(option) && option !== value">{{ option }}</option>
      </select>
      <button v-if="rows.length > 1" type="button" :aria-label="`Remove service focus ${index + 1}`" @click="remove(index)">Remove</button>
    </div>
    <button v-if="options.length > rows.length" type="button" :disabled="rows.some(value => !value)" @click="rows.push('')">Add another service focus</button>
    <small>Choose each applicable service focus. You can select more than one category.</small>
  </fieldset>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { SERVICE_FOCUS_CATEGORIES } from '../../constants/serviceFocusCategories.js';
const props = defineProps({ modelValue: { type: String, default: '' }, options: { type: Array, default: () => [] } });
const emit = defineEmits(['update:modelValue']);
const rows = ref(['']);
const key = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const options = computed(() => {
  const seen = new Set();
  return [...SERVICE_FOCUS_CATEGORIES, ...props.options].filter(option => {
    if (!option || seen.has(key(option))) return false;
    seen.add(key(option));
    return true;
  });
});
watch(() => [props.modelValue, props.options], () => {
  const values = props.modelValue.split(/\s*[;,]\s*/).filter(Boolean);
  rows.value = values.length ? [...new Set(values.map(value => options.value.find(option => key(option) === key(value)
    || (['schoolbased', 'officebased'].includes(key(value)) && key(option) === `${key(value)}counseling`)) || value))] : [''];
}, { immediate: true });
function save() { emit('update:modelValue', [...new Set(rows.value.filter(Boolean))].join('; ')); }
function choose(index, value) { rows.value[index] = value; save(); }
function remove(index) { rows.value.splice(index, 1); save(); }
</script>

<style scoped>
.contract-focus { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 8px; }
.contract-focus legend { font-weight: 600; margin-bottom: 6px; }
.focus-row { display: flex; gap: 8px; }
.focus-row select { flex: 1; min-width: 0; padding: 10px; border: 1px solid var(--border-color, #ddd); border-radius: 8px; background: var(--bg-primary, white); color: inherit; }
.contract-focus small { font-weight: normal; }
.contract-focus > button { justify-self: start; }
</style>
