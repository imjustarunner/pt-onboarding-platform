<template>
  <div class="day-bar" role="tablist" aria-label="Weekdays">
    <button
      v-for="d in days"
      :key="d.weekday"
      class="day"
      :class="{
        selected: d.weekday === modelValue,
        lit: !!d.has_providers,
        disabled: !d.has_providers,
        green: !!d.has_providers && String(d.availability_status || '') === 'green',
        yellow: !!d.has_providers && String(d.availability_status || '') === 'yellow',
        red: !!d.has_providers && String(d.availability_status || '') === 'red'
      }"
      type="button"
      role="tab"
      :aria-selected="d.weekday === modelValue"
      :aria-disabled="!d.has_providers"
      :disabled="!d.has_providers"
      @click="d.has_providers && $emit('update:modelValue', d.weekday)"
    >
      <span class="label">{{ shortLabel(d.weekday) }}</span>
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  days: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' }
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
  padding: 14px 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-primary);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.day.lit {
  border-color: rgba(16, 185, 129, 0.5);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.12);
}
.day.green {
  border-color: rgba(16, 185, 129, 0.55);
  background: rgba(16, 185, 129, 0.06);
}
.day.yellow {
  border-color: rgba(245, 158, 11, 0.65);
  background: rgba(245, 158, 11, 0.10);
}
.day.red {
  border-color: rgba(239, 68, 68, 0.65);
  background: rgba(239, 68, 68, 0.10);
}
.day.selected {
  border-color: rgba(79, 70, 229, 0.75);
  background: rgba(79, 70, 229, 0.12);
  box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.16);
  transform: translateY(-1px) scale(1.03);
}
.day.disabled,
.day:disabled {
  background: var(--bg, #f7f7fb);
  color: var(--text-secondary);
  border-color: var(--border);
  box-shadow: none;
  opacity: 0.8;
  cursor: not-allowed;
}
.label {
  display: inline-block;
  width: 100%;
  text-align: center;
}
</style>

