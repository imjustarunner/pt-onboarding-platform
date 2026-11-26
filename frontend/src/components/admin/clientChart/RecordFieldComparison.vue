<template>
  <div class="record-comparison">
    <table>
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th v-for="source in sources" :key="source.id" scope="col">
            <strong>{{ source.label }}</strong>
            <small v-if="source.detail">{{ source.detail }}</small>
            <slot name="source" :source="source" />
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key">
          <th scope="row">{{ row.label }}</th>
          <td v-for="source in sources" :key="source.id">
            <label :class="{ chosen: String(row.selected) === String(source.id) }">
              <input type="radio" :name="`${comparisonId}-${row.key}`" :checked="String(row.selected) === String(source.id)"
                :disabled="disabled || row.unavailable?.includes(source.id)"
                :aria-label="`${row.label}, ${source.label}`" @change="$emit('choose', row.key, source.id)" />
              <span>{{ format(row.values[source.id]) }}</span>
            </label>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { useId } from 'vue';

defineProps({ sources: { type: Array, required: true }, rows: { type: Array, required: true }, disabled: Boolean });
defineEmits(['choose']);
const comparisonId = useId();
const format = value => value === null || value === undefined || value === '' ? 'Not recorded' : String(value);
</script>

<style scoped>
.record-comparison { overflow-x: auto; }
table { width: 100%; border-collapse: separate; border-spacing: 0 5px; text-align: left; }
th, td { padding: 4px 6px; vertical-align: top; }
thead th { color: #173b56; }
thead th:not(:first-child) { min-width: 130px; width: 43%; }
thead small { display: block; font-weight: 400; margin: 4px 0; color: #526679; }
tbody th { font-weight: 600; padding-top: 13px; }
label { display: flex; gap: 8px; align-items: start; padding: 8px; min-height: 42px; cursor: pointer; overflow-wrap: anywhere; border: 1px solid #cad7e1; border-radius: 6px; background: #fff; color: #19364f; }
label.chosen { border-color: #24766b; background: #e9f6f1; }
label:has(input:disabled) { cursor: default; }
input { flex-shrink: 0; margin: 3px 0 0; accent-color: #176b60; }
</style>
