<template>
  <details class="calendar-time-zone" @keydown.esc.stop.prevent="$event.currentTarget.removeAttribute('open'); $event.currentTarget.querySelector('summary').focus()">
    <summary :title="`Showing ${effectiveTimeZone}`">Time Zone</summary>
    <div class="calendar-time-zone__panel">
    <label>Calendar time zone
      <select :value="modelValue" :disabled="disabled" aria-label="Calendar time zone" @change="$emit('update:modelValue', $event.target.value)">
        <option value="">Office / organization time · {{ officeTimeZone }}</option>
        <optgroup v-for="group in TIMEZONE_GROUPS" :key="group.label" :label="group.label"><option v-for="zone in group.zones" :key="zone.value" :value="zone.value">{{ zone.label }}</option></optgroup>
        <option v-if="modelValue && !ALL_TIMEZONES.some(zone => zone.value === modelValue)" :value="modelValue">{{ modelValue }}</option>
      </select>
    </label>
    <span>Showing {{ effectiveTimeZone }}.</span>
    <small v-if="officeLayout">Office room bookings are shown in the office’s time zone. Your calendar choice is retained.</small>
    <small v-else>Existing appointments keep their scheduled time. Google Calendar uses its own display setting.</small>
    </div>
  </details>
</template>
<script setup>
import { TIMEZONE_GROUPS, ALL_TIMEZONES } from '../../utils/timezones.js';
defineProps({ modelValue: { type: String, default: '' }, officeTimeZone: String, effectiveTimeZone: String, disabled: Boolean, officeLayout: Boolean });
defineEmits(['update:modelValue']);
</script>
<style scoped>
.calendar-time-zone { position: relative; }
summary { list-style: none; white-space: nowrap; cursor: pointer; padding: 8px 10px; min-height: 36px; border: 1px solid var(--border, #cbd5e1); border-radius: 8px; box-sizing: border-box; background: var(--bg-card, #fff); }
summary::-webkit-details-marker { display: none; }
.calendar-time-zone__panel { position: absolute; z-index: 22; inset-inline-end: 0; top: calc(100% + 6px); display: grid; gap: 8px; width: min(280px, calc(100vw - 32px)); padding: 12px; border: 1px solid var(--border, #cbd5e1); border-radius: 10px; background: var(--bg-card, #fff); color: var(--text-primary, #17233a); box-shadow: 0 8px 28px #17233a25; font-size: .825rem; }
label { display: grid; gap: 6px; font-weight: 600; }
select { width: 100%; padding: 7px; border: 1px solid var(--border, #bbc9c2); border-radius: 6px; background: var(--bg-card, #fff); color: inherit; font: inherit; }
small { line-height: 1.5; color: var(--text-secondary, #52645c); }
</style>
