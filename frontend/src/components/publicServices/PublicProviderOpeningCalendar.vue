<template>
  <div class="opening-calendar">
    <div class="opening-controls">
      <label v-if="!fixedFormat">Session format<select :value="format" @change="$emit('update:format', $event.target.value)"><option value="IN_PERSON">In person</option><option value="VIRTUAL">Telehealth</option></select></label>
      <label>Week of<input :value="week" type="date" :min="minDate" @change="$emit('update:week', $event.target.value)" /></label>
    </div>
    <PublicOfficeLocations v-if="format === 'IN_PERSON' && officeLocations.length" :model-value="officeId" :offices="officeLocations" title="Appointment location" @update:model-value="$emit('update:officeId', $event)" />
    <p class="opening-timezone">Times shown in {{ timeZone }}.</p>
    <slot />
    <div v-if="!loading" class="opening-days">
      <div v-for="[day, times] in days" :key="day" class="opening-day"><h3>{{ day }}</h3>
        <button v-for="slot in times" :key="`${slot.startAt}-${slot.endAt}`" type="button" :disabled="disabled" @click="$emit('select', slot)">{{ time(slot.startAt) }} · {{ availabilityLabel(slot) }}<small v-if="slot.buildingName"> · {{ slot.buildingName }}</small></button>
      </div>
    </div>
  </div>
</template>
<script setup>
import PublicOfficeLocations from './PublicOfficeLocations.vue';
import { availabilityLabel } from '../../utils/availabilityLabel.js';
const props = defineProps({
  days: { type: Array, default: () => [] }, week: String, minDate: String,
  format: String, fixedFormat: Boolean, timeZone: String,
  officeId: { type: [String, Number], default: '' },
  officeLocations: { type: Array, default: () => [] }, loading: Boolean, disabled: Boolean
});
defineEmits(['update:week', 'update:format', 'update:officeId', 'select']);
const time = value => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: props.timeZone });
</script>
<style scoped>
.opening-calendar{color:#193d42;min-width:0}.opening-controls{display:grid;grid-template-columns:1fr 1fr;gap:12px}.opening-controls label{display:grid;gap:8px;font-weight:600;font-size:.85rem}.opening-controls input,.opening-controls select{min-width:0;width:100%;box-sizing:border-box;padding:12px;border:1px solid #d6e2de;border-radius:8px;background:#fff;color:inherit}.opening-timezone{font-size:.8rem;line-height:1.6;color:#506570;margin:12px 0}.opening-days{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}.opening-day{border:1px solid #dbe5e0;padding:10px;border-radius:10px}.opening-day h3{font-size:.8rem;text-align:center;margin:12px 0}.opening-day button{display:block;width:100%;margin-top:8px;min-height:42px;border:1px solid #b9d5cb;border-radius:7px;color:var(--agency-primary-color,#125c49);background:#eff7f2;padding:8px 12px;cursor:pointer}.opening-day button:disabled{opacity:.5;cursor:default}.opening-calendar :focus-visible{outline:3px solid #247969;outline-offset:3px}@media(max-width:420px){.opening-controls{grid-template-columns:1fr}}
</style>
