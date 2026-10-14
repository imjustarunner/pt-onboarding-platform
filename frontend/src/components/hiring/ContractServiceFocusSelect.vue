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
    <small>Choose the applicable service focuses from the workplace handbook.</small>
    <small v-if="!options.length">No service-focus examples are available in this agency’s handbook.</small>
  </fieldset>
</template>

<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ modelValue: { type: String, default: '' }, options: { type: Array, default: () => [] } });
const emit = defineEmits(['update:modelValue']);
const rows = ref(['']);
const key = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
watch(() => [props.modelValue, props.options], () => {
  const values = props.modelValue.split(/\s*[;,]\s*/).filter(Boolean);
  rows.value = values.length ? values.map(value => props.options.find(option => key(option) === key(value)
    || (['schoolbased', 'officebased'].includes(key(value)) && key(option) === `${key(value)}counseling`)) || value) : [''];
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
