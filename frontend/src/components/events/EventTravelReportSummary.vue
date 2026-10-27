<template>
  <section class="travel-report">
    <h3>{{ report.eventTitle }}</h3>
    <p>{{ report.eventDate }} · {{ report.eventAddress }}</p>
    <p><strong>{{ report.totalMinutes }} minutes</strong> at Support Activity rate · <strong>{{ Number(report.totalMiles || 0).toFixed(2) }} miles</strong> for reimbursement{{ report.reviewed ? '' : ' proposed' }}</p>
    <dl>
      <dt>Materials before the event</dt><dd>{{ pickupLabel }}</dd>
      <dt>Materials after the event</dt><dd>{{ returnLabel }}</dd>
      <dt>Vehicle</dt><dd>{{ vehicleLabel }}</dd>
      <template v-if="report.office"><dt>Assigned office</dt><dd>{{ report.office.name }} · {{ report.office.address }}</dd></template>
    </dl>
    <div v-for="segment in report.segments" :key="segment.key" class="travel-report-leg">
      <strong>{{ segment.kind === 'travel' ? `${segment.from.label} → ${segment.to.label}` : segment.label }}</strong>
      <div>{{ segment.label }} · {{ when(segment.startedAt) }} – {{ when(segment.endedAt) }}</div>
      <div>{{ segment.minutes }} minutes<span v-if="segment.kind === 'travel' && report.form.vehicle === 'personal'"> · {{ segment.miles == null ? 'Mileage needs verification' : `${segment.miles} miles` }}</span></div>
      <div class="muted">{{ segment.timeEligible ? 'Support Activity time' : 'No travel time proposed' }}<span v-if="segment.mileageEligible"> · mileage reimbursement</span></div>
      <slot name="segment" :segment="segment" />
    </div>
    <p v-if="report.form.exceptionNote">Additional details: {{ report.form.exceptionNote }}</p>
    <p v-if="report.form.notes">{{ report.form.notes }}</p>
    <details v-if="report.flags?.length"><summary>Items for payroll to review ({{ report.flags.length }})</summary><ul><li v-for="flag in report.flags" :key="flag">{{ flag }}</li></ul></details>
    <p v-if="report.reviewed">Reviewed: {{ report.reviewNote }}</p>
  </section>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({ report: { type: Object, required: true } });
const pickupLabel = computed(() => ({ already_had: 'Already had the materials at home or in the car', none: 'No materials pickup', before_event: `${props.report.form.pickupTiming === 'separate' ? 'Picked up on a separate trip' : 'Picked up on the way'} · ${props.report.form.pickupRequirement === 'required' ? 'required timing / trip' : 'at my convenience'}` })[props.report.form.materialsPickup]);
const returnLabel = computed(() => ({ kept: 'Kept the materials', none: 'No materials to return', after_event: 'Returned on the way back', separate: 'Returned on a separate trip' })[props.report.form.materialsReturn] + (['after_event', 'separate'].includes(props.report.form.materialsReturn) ? ` · ${props.report.form.returnRequirement === 'required' ? 'required timing / trip' : 'at my convenience'}` : ''));
const vehicleLabel = computed(() => ({ personal: 'My own vehicle', company: 'Company vehicle', passenger: 'Passenger / carpool', other: 'Other transportation' })[props.report.form.vehicle]);
const when = value => new Intl.DateTimeFormat(undefined, { timeZone: props.report.timezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
</script>
<style scoped>
.travel-report h3 { margin: 0 0 8px; }.travel-report p { line-height: 1.5; }dl { display: grid; grid-template-columns: minmax(110px, 1fr) 2fr; gap: 8px; }dt { font-weight: 600; }dd { margin: 0; }.travel-report-leg { border-top: 1px solid var(--border-color, #e2e8f0); padding: 12px 0; display: grid; gap: 5px; }.muted { color: var(--text-secondary, #475569); font-size: 13px; }summary { cursor: pointer; }@media(max-width: 480px) { dl { grid-template-columns: 1fr; }dd { margin-bottom: 6px; } }
</style>
