<template>
  <div class="calendar-time-zone">
    <label>Calendar time zone
      <select :value="modelValue" :disabled="disabled" aria-label="Calendar time zone" @change="$emit('update:modelValue', $event.target.value)">
        <option value="">Office / organization time · {{ officeTimeZone }}</option>
        <optgroup v-for="group in TIMEZONE_GROUPS" :key="group.label" :label="group.label"><option v-for="zone in group.zones" :key="zone.value" :value="zone.value">{{ zone.label }}</option></optgroup>
        <option v-if="modelValue && !ALL_TIMEZONES.some(zone => zone.value === modelValue)" :value="modelValue">{{ modelValue }}</option>
      </select>
    </label>
    <span>Showing {{ effectiveTimeZone }}.</span>
    <small v-if="officeLayout">Office room bookings are shown in the office’s time zone. Your calendar choice is retained.</small>
    <small v-else>Existing appointments keep their scheduled time. New time fields show their time zone; Google Calendar keeps its own display setting.</small>
  </div>
</template>
<script setup>
import { TIMEZONE_GROUPS, ALL_TIMEZONES } from '../../utils/timezones.js';
defineProps({ modelValue: { type: String, default: '' }, officeTimeZone: String, effectiveTimeZone: String, disabled: Boolean, officeLayout: Boolean });
defineEmits(['update:modelValue']);
</script>
<style scoped>
.calendar-time-zone{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;margin:10px 0;padding:10px 14px;border:1px solid var(--border,#dce4e0);border-radius:10px;font-size:12px;background:var(--bg-card,#fff)}label{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-weight:600}select{max-width:100%;padding:7px;border:1px solid var(--border,#bbc9c2);border-radius:6px;background:var(--bg-card,#fff);color:inherit;font:inherit}small{width:100%;line-height:1.5;color:var(--text-secondary,#52645c)}
</style>
