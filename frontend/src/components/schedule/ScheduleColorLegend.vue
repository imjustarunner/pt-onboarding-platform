<template>
  <section class="schedule-color-legend" aria-label="Schedule color key">
    <strong>Color key</strong>
    <div class="legend-items">
      <span v-for="option in primary" :key="option.key" class="legend-item">
        <span class="legend-swatch" :style="swatch(option)" aria-hidden="true"></span>{{ option.label }}
      </span>
    </div>
    <details>
      <summary>Other event colors</summary>
      <div class="legend-items">
        <span v-for="option in remaining" :key="option.key" class="legend-item">
          <span class="legend-swatch" :style="swatch(option)" aria-hidden="true"></span>{{ option.label }}
        </span>
      </div>
    </details>
    <span class="legend-hint">Change colors in Settings → Appointment colors.</span>
  </section>
</template>
<script setup>
import { SCHEDULE_COLOR_OPTIONS } from '../../utils/scheduleAppearance.js';
const props = defineProps({ colors: { type: Object, default: () => ({}) }, dark: Boolean });
const primaryKeys = ['client_session', 'supervision', 'supervision_group', 'interview', 'office_assigned', 'office_booked', 'schedule_hold', 'availability', 'intake_in_person', 'intake_virtual', 'supervision_open', 'training'];
const primary = SCHEDULE_COLOR_OPTIONS.filter(option => primaryKeys.includes(option.key));
const remaining = SCHEDULE_COLOR_OPTIONS.filter(option => !primaryKeys.includes(option.key));
const swatch = option => {
  const color = /^#[\da-f]{6}$/i.test(props.colors[option.key]) ? props.colors[option.key] : option.color;
  return { backgroundColor: `${color}${props.dark ? '52' : '38'}`, borderColor: `${color}a6` };
};
</script>
<style scoped>
.schedule-color-legend { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; font-size:12px; color:var(--text-primary,#334155); }
.legend-items { display:flex; flex-wrap:wrap; gap:6px 14px; }
.legend-item { display:inline-flex; align-items:center; gap:6px; }
.legend-swatch { width:14px; height:14px; flex:0 0 14px; border:1px solid; border-radius:4px; }
summary { cursor:pointer; }
details[open] { flex-basis:100%; }
details[open] summary { margin-bottom:8px; }
.legend-hint { color:var(--text-secondary,#64748b); }
</style>
