<template>
  <fieldset class="location-picker" :disabled="disabled || loading">
    <legend class="sr-only">Service location</legend>
    <p v-if="loading">Loading locations…</p>
    <p v-else-if="!locations.length">No locations available</p>
    <template v-else>
      <div class="location-picker__choices">
        <label v-for="location in primary" :key="location.id">
          <input type="radio" :name="groupName" :value="location.id" :checked="modelValue === location.id"
            @change="$emit('update:modelValue', location.id)" />
          {{ location.label }}
        </label>
      </div>
      <details v-if="additional.length" :open="additional.some(location => location.id === modelValue) || undefined">
        <summary>More locations</summary>
        <div class="location-picker__choices">
          <label v-for="location in additional" :key="location.id">
            <input type="radio" :name="groupName" :value="location.id" :checked="modelValue === location.id"
              @change="$emit('update:modelValue', location.id)" />
            {{ location.label }}
          </label>
        </div>
      </details>
    </template>
  </fieldset>
</template>

<script setup>
import { computed, useId } from 'vue';

const props = defineProps({
  locations: { type: Array, default: () => [] },
  modelValue: { type: Number, default: 0 },
  remote: Boolean,
  loading: Boolean,
  disabled: Boolean
});
defineEmits(['update:modelValue']);
const groupName = useId();
const isPrimary = location => props.remote || ['11', '12'].includes(String(location.placeOfService));
const primary = computed(() => props.locations.filter(isPrimary));
const additional = computed(() => props.locations.filter(location => !isPrimary(location)));
</script>

<style scoped>
.location-picker { border: 0; margin: 0; min-width: 0; padding: 0; }
.location-picker__choices { display: flex; flex-wrap: wrap; gap: .5rem; }
.location-picker__choices label { align-items: center; border: 1px solid #c8d4e1; border-radius: .55rem; cursor: pointer; display: flex; gap: .45rem; padding: .55rem .75rem; }
.location-picker__choices label:has(:checked) { background: #edf4ff; border-color: #3566ad; }
.location-picker details { margin-top: .5rem; }
.location-picker summary { cursor: pointer; padding: .35rem 0; }
</style>
