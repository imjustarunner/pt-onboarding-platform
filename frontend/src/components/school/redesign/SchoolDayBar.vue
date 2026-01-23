<template>
  <div class="day-bar" role="tablist" aria-label="Weekdays">
    <button
      v-for="d in days"
      :key="d.weekday"
      class="day"
      :class="{ selected: d.weekday === modelValue, lit: !!d.has_providers }"
      type="button"
      role="tab"
      :aria-selected="d.weekday === modelValue"
      @click="$emit('update:modelValue', d.weekday)"
    >
      <span class="label">{{ shortLabel(d.weekday) }}</span>
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  days: { type: Array, default: () => [] },
  modelValue: { type: String, default: 'Monday' }
});
defineEmits(['update:modelValue']);

const shortLabel = (weekday) => {
  const w = String(weekday || '');
  return w === 'Thursday' ? 'Thu' : w.slice(0, 3);
};
</script>

<style scoped>
.day-bar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}
.day {
  border: 1px solid var(--border);
  background: white;
  border-radius: 12px;
  padding: 12px 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-primary);
}
.day.lit {
  border-color: rgba(16, 185, 129, 0.5);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
}
.day.selected {
  border-color: rgba(79, 70, 229, 0.55);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
}
.label {
  display: inline-block;
  width: 100%;
  text-align: center;
}
</style>

