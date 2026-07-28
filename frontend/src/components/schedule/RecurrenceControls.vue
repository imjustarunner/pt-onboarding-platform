<template>
  <div class="rec-controls" data-testid="recurrence-controls">
    <div class="rec-row">
      <label class="rec-label">Repeats</label>
      <select
        class="rec-select"
        :value="frequency"
        :disabled="disabled"
        @change="emit('update:frequency', String($event.target.value || 'ONCE'))"
      >
        <option v-for="opt in recurrenceOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <div v-if="isWeekBased" class="rec-row rec-weekdays">
      <label class="rec-label">Days</label>
      <div class="rec-day-chips">
        <button
          v-for="d in weekdayOptions"
          :key="d.value"
          type="button"
          class="rec-day"
          :class="{ on: selectedDays.includes(d.value) }"
          :disabled="disabled"
          :aria-pressed="selectedDays.includes(d.value)"
          @click="toggleDay(d.value)"
        >
          {{ d.short }}
        </button>
      </div>
    </div>

    <p v-if="isMonthly" class="rec-meta muted">
      Repeats on the same day of each month (e.g. the 15th). Shorter months clamp to the last day.
    </p>

    <div v-if="isRecurring" class="rec-row">
      <label class="rec-label">Ends</label>
      <select
        class="rec-select"
        :value="endMode"
        :disabled="disabled"
        @change="emit('update:endMode', String($event.target.value || 'count'))"
      >
        <option value="count">After N occurrences</option>
        <option value="until">On end date</option>
        <option value="indefinite">No end date</option>
      </select>
    </div>

    <div v-if="isRecurring && endMode === 'count'" class="rec-row">
      <label class="rec-label">Occurrences</label>
      <input
        class="rec-select"
        type="number"
        min="1"
        max="52"
        :value="occurrenceCount"
        :disabled="disabled"
        @change="emit('update:occurrenceCount', Math.max(1, Number($event.target.value || 1)))"
      />
    </div>

    <div v-if="isRecurring && endMode === 'until'" class="rec-row">
      <label class="rec-label">Until</label>
      <input
        class="rec-select"
        type="date"
        :value="untilDate"
        :disabled="disabled"
        @change="emit('update:untilDate', String($event.target.value || ''))"
      />
    </div>

    <div v-if="isRecurring && occurrenceLabel" class="rec-meta muted">
      {{ occurrenceLabel }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import {
  RECURRENCE_OPTIONS,
  isRecurringFrequency,
  isWeekBasedFrequency,
  normalizeRecurrenceFrequency,
  RECURRENCE_MONTHLY
} from '../../utils/scheduleRecurrence.js';

const props = defineProps({
  frequency: { type: String, default: 'ONCE' },
  endMode: { type: String, default: 'count' },
  occurrenceCount: { type: Number, default: 4 },
  untilDate: { type: String, default: '' },
  weekdays: { type: Array, default: () => [] },
  occurrenceLabel: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits([
  'update:frequency',
  'update:endMode',
  'update:occurrenceCount',
  'update:untilDate',
  'update:weekdays'
]);

const recurrenceOptions = RECURRENCE_OPTIONS;

const weekdayOptions = [
  { value: 'Mon', short: 'Mon' },
  { value: 'Tue', short: 'Tue' },
  { value: 'Wed', short: 'Wed' },
  { value: 'Thu', short: 'Thu' },
  { value: 'Fri', short: 'Fri' },
  { value: 'Sat', short: 'Sat' },
  { value: 'Sun', short: 'Sun' }
];

const isRecurring = computed(() => isRecurringFrequency(props.frequency));
const isWeekBased = computed(() => isWeekBasedFrequency(props.frequency));
const isMonthly = computed(
  () => normalizeRecurrenceFrequency(props.frequency) === RECURRENCE_MONTHLY
);
const selectedDays = computed(() => (Array.isArray(props.weekdays) ? props.weekdays.map(String) : []));

function toggleDay(day) {
  if (props.disabled) return;
  const set = new Set(selectedDays.value);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  const order = weekdayOptions.map((d) => d.value);
  emit('update:weekdays', order.filter((d) => set.has(d)));
}
</script>

<style scoped>
.rec-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #f8fafc;
}
.rec-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.rec-label {
  min-width: 88px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.rec-select {
  flex: 1;
  min-width: 140px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 7px 10px;
  font: inherit;
  background: #fff;
  color: #0f172a;
  -webkit-text-fill-color: #0f172a;
}
.rec-day-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rec-day {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  color: #334155;
}
.rec-day.on {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}
.rec-meta {
  font-size: 0.8rem;
  margin: 0;
}
.muted { color: #64748b; }
</style>
