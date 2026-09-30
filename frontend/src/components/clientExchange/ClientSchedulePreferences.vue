<template>
  <fieldset class="client-schedule">
    <legend>When does the client need a provider?</legend>
    <p class="muted">Optional. Select days, general times, or specific day/time options. These details are shared in the exchange and matching emails.</p>
    <div class="choices" role="group" aria-label="Days that work">
      <label v-for="day in scheduleDays" :key="day"><input type="checkbox" :checked="value.days.includes(day)" @change="toggle('days', day)" />{{ day }}</label>
    </div>
    <div class="choices" role="group" aria-label="Times that work">
      <label v-for="(label, key) in schedulePeriods" :key="key"><input type="checkbox" :checked="value.periods.includes(key)" @change="toggle('periods', key)" />{{ label }}</label>
    </div>
    <div v-for="(window, index) in value.windows" :key="index" class="time-row">
      <label>Day<select :value="window.day" @change="changeWindow(index, 'day', $event.target.value)"><option value="">{{ value.days.length ? 'Selected days' : 'Any day' }}</option><option v-for="day in scheduleDays" :key="day">{{ day }}</option></select></label>
      <label>Start time<input type="time" :value="window.start" @input="changeWindow(index, 'start', $event.target.value)" /></label>
      <label>End time (optional)<input type="time" :value="window.end" @input="changeWindow(index, 'end', $event.target.value)" /></label>
      <button type="button" class="btn btn-secondary btn-sm" :aria-label="`Remove time option ${index + 1}`" @click="set('windows', value.windows.filter((_, i) => i !== index))">Remove</button>
    </div>
    <button type="button" class="btn btn-secondary btn-sm" :disabled="value.windows.length >= 14" @click="addWindow">Add specific time or range</button>
    <small>Leave the end time blank for a specific start time. Add another option for different days or times.</small>
    <label>Time zone<input :value="value.timezone" placeholder="America/Denver" @input="set('timezone', $event.target.value)" /></label>
    <label>Scheduling notes<textarea :value="value.notes" rows="2" maxlength="1000" placeholder="For example: after dismissal at 3:30 PM; alternate Fridays only" @input="set('notes', $event.target.value)"></textarea></label>
  </fieldset>
</template>
<script setup>
import { computed } from 'vue';
import { scheduleDays, schedulePeriods } from '../../utils/clientExchangeSchedule.js';
const props = defineProps({ modelValue: { type: Object, default: () => ({}) } });
const emit = defineEmits(['update:modelValue']);
const value = computed(() => ({ days: [], periods: [], windows: [], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '', notes: '', ...props.modelValue, timezone: props.modelValue?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '' }));
function set(key, item) { emit('update:modelValue', { ...value.value, [key]: item }); }
function toggle(key, item) { set(key, value.value[key].includes(item) ? value.value[key].filter(v => v !== item) : [...value.value[key], item]); }
function changeWindow(index, key, item) { set('windows', value.value.windows.map((window, i) => i === index ? { ...window, [key]: item } : window)); }
function addWindow() { set('windows', [...value.value.windows, { day: '', start: '', end: '' }]); }
</script>
<style scoped>
.client-schedule { border: 1px solid var(--border, #dbe2e8); border-radius: 10px; padding: 12px; display: grid; gap: 12px; min-width: 0; }
legend { font-weight: 700; }
.choices { display: flex; flex-wrap: wrap; gap: 8px 14px; }
.choices label { display: flex; gap: 5px; align-items: center; }
.choices input { width: auto; }
.time-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
label { display: grid; gap: 4px; font-size: 13px; }
input, select, textarea { padding: 7px; border: 1px solid var(--border, #dbe2e8); border-radius: 6px; font: inherit; min-width: 0; }
.muted, small { color: var(--text-secondary, #64748b); font-size: 12px; margin: 0; }
</style>
