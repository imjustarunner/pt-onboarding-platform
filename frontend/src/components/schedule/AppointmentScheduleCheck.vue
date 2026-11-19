<template>
  <details v-if="mismatch && usesSavedWindow" class="schedule-check schedule-check--info">
    <summary>Calendar shows the saved appointment time</summary>
    <p>Saved appointment: {{ savedRange }}</p>
    <p>Older calendar copy: {{ calendarRange }}</p>
    <p>Both times use {{ timeZone }}. The older copy still needs reconciliation.</p>
  </details>
  <aside v-else-if="mismatch" class="schedule-check" role="alert">
    <strong>The saved appointment and calendar entry have different times.</strong>
    <p>Saved appointment: {{ savedRange }}</p>
    <p>Calendar entry: {{ calendarRange }}</p>
    <p>Both times use {{ timeZone }}. Confirm the intended time before rescheduling.</p>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { parseScheduleUtcInstant } from '../../utils/scheduleEventInstants.js';

const props = defineProps({ appointment: Object, calendarEvent: Object, timeZone: { type: String, default: 'America/Denver' } });
const times = row => [parseScheduleUtcInstant(row?.startAt), parseScheduleUtcInstant(row?.endAt)];
const calendarCopy = computed(()=>({...props.calendarEvent,startAt:props.calendarEvent?.calendarStartAt||props.calendarEvent?.startAt,endAt:props.calendarEvent?.calendarEndAt||props.calendarEvent?.endAt}));
const mismatch = computed(() => {
  const [start, end] = times(props.appointment), [calendarStart, calendarEnd] = times(calendarCopy.value);
  return !!(start && end && calendarStart && calendarEnd && (+start !== +calendarStart || +end !== +calendarEnd));
});
const usesSavedWindow = computed(() => {
  if (!props.calendarEvent?.calendarTimingMismatch) return false;
  const [start, end] = times(props.appointment);
  const [displayStart, displayEnd] = times(props.calendarEvent);
  return !!(start && end && displayStart && displayEnd && +start === +displayStart && +end === +displayEnd);
});
const range = row => {
  const [start, end] = times(row);
  try {
    const format = new Intl.DateTimeFormat('en-US', { timeZone: props.timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    return `${format.format(start)} – ${format.format(end)}`;
  } catch { return 'Time or timezone needs review'; }
};
const savedRange = computed(() => range(props.appointment));
const calendarRange = computed(() => range(calendarCopy.value));
</script>

<style scoped>
.schedule-check{border:1px solid #d97706;border-radius:12px;padding:14px;background:var(--bg-card,#fff);color:var(--text-primary,#172033);grid-column:1/-1}
.schedule-check--info{border-color:var(--border,#cbd5e1);padding:9px 14px}
.schedule-check summary{cursor:pointer}
.schedule-check p{margin:8px 0 0}
</style>
