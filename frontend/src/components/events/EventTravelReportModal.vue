<template>
  <Teleport to="body">
    <div class="etr-overlay" @keydown.esc="!busy && emit('close')">
      <section ref="dialog" class="etr-modal" role="dialog" aria-modal="true" aria-labelledby="etr-title" tabindex="-1" @keydown.tab="trapFocus">
        <header><div><h2 id="etr-title">Event travel reimbursement</h2><p>Report your trips and materials handling in one place.</p></div><button type="button" class="btn btn-secondary" aria-label="Close event travel form" :disabled="busy" @click="emit('close')">Close</button></header>
        <div v-if="loading" role="status">Loading your assigned events…</div>
        <div v-else-if="saved" role="status" class="etr-saved"><h3>Report submitted</h3><p>Your event travel report #{{ saved.id }} is ready for payroll review. {{ form.existingMileageClaimId ? 'Your existing mileage reimbursement is preserved; this report requests travel time only.' : 'Time and mileage are included together.' }}</p><button class="btn btn-primary" type="button" @click="emit('close')">Done</button></div>
        <template v-else>
          <ol class="etr-steps" aria-label="Progress"><li v-for="(label, index) in EVENT_TRAVEL_STEPS" :key="label" :aria-current="step === index ? 'step' : undefined" :class="{ active: step === index }">{{ index + 1 }}. {{ label }}</li></ol>
          <p v-if="error" class="etr-error" role="alert">{{ error }}</p>
          <form ref="formElement" @submit.prevent="next">
            <fieldset v-if="step === 0" :disabled="busy">
              <legend>Which event did you work?</legend>
              <p v-if="!options.events.length">No assigned events are available. Your coordinator must assign you to an event before you can submit travel.</p>
              <label>Assigned event<select aria-label="Assigned event" v-model="eventId" required><option value="" disabled>Choose an event</option><option v-for="event in options.events" :key="event.id" :value="event.id">{{ event.title }} · {{ event.dates.at(-1) }}</option></select></label>
              <label v-if="selectedEvent">Event date<select aria-label="Event date" v-model="form.eventDate" required><option value="" disabled>Choose the date you worked</option><option v-for="day in selectedEvent.dates" :key="day" :value="day">{{ day }}</option></select></label>
              <p v-if="selectedEvent?.address" class="etr-address">{{ selectedEvent.address }}</p>
              <p v-else-if="selectedEvent" class="etr-error" role="alert">Your coordinator needs to save the venue address on this event before you can submit travel.</p>
              <label v-if="approvedMileageForDate.length">Mileage already reimbursed for this event?<select aria-label="Existing mileage reimbursement" v-model="form.existingMileageClaimId"><option :value="null">No — request eligible time and mileage</option><option v-for="claim in approvedMileageForDate" :key="claim.id" :value="claim.id">Claim #{{ claim.id }} — {{ claim.end_location || claim.trip_purpose || 'Event mileage' }} — ${{ Number(claim.applied_amount).toFixed(2) }}</option></select></label>
              <p v-if="form.existingMileageClaimId" class="etr-notice">Travel time only. Select this only if the approved claim covers this event’s mileage. You will still describe your actual trips, but no additional mileage claim will be created.</p>
              <div v-if="existing" class="etr-notice"><p>A report already exists for this event date{{ existing.reviewed ? ' and has been reviewed' : '' }}.</p><p v-for="note in existing.notes || []" :key="note">Payroll: {{ note }}</p><button type="button" class="btn btn-secondary" @click="openExisting">{{ existing.locked ? 'View report' : 'Open to review or correct' }}</button></div>
            </fieldset>
            <fieldset v-else-if="step === 1" :disabled="busy || locked">
              <legend>What happened with the materials?</legend>
              <label>Before the event<select aria-label="Before the event" v-model="form.materialsPickup" required><option value="" disabled>Choose what happened</option><option value="already_had">I already had the materials at home or in my car</option><option value="before_event">I picked up materials before the event</option><option value="none">I did not need to pick up materials</option></select></label>
              <template v-if="form.materialsPickup === 'before_event'">
                <label>When did you pick them up?<select aria-label="When did you pick them up?" v-model="form.pickupTiming"><option value="on_way">On my way to the event</option><option value="separate">On a separate trip / another day</option></select></label>
                <label>Pickup arrangement<select aria-label="Pickup arrangement" v-model="form.pickupRequirement"><option value="convenient">I chose when to pick them up, at my convenience</option><option value="required">I was asked to make a specific trip or pick them up at a required time</option></select></label>
              </template>
              <label>After the event<select aria-label="After the event" v-model="form.materialsReturn" required><option value="" disabled>Choose what happened</option><option value="after_event">I dropped materials at the office on my way back</option><option value="separate">I dropped them off on a separate trip / another day</option><option value="kept">I kept them / still have them</option><option value="none">I did not have materials to return</option></select></label>
              <label v-if="['after_event', 'separate'].includes(form.materialsReturn)">Return arrangement<select aria-label="Return arrangement" v-model="form.returnRequirement"><option value="convenient">I chose when to drop them off, at my convenience</option><option value="required">I was asked to make a specific trip or return them at a required time</option></select></label>
            </fieldset>
            <fieldset v-else-if="step === 2" :disabled="busy || locked">
              <legend>Your actual trips</legend>
              <p class="hint">Saved home, office, and event addresses are filled in for you. Google calculates driving distances. Use actual travel times, excluding personal stops and time already clocked at the event. Check the date and AM/PM for each departure and arrival. Each part of the trip must end after it starts and last no more than 24 hours. Times below use your device timezone ({{ deviceTimezone }}).</p>
              <label>How did you travel?<select aria-label="How did you travel?" v-model="form.vehicle"><option value="personal">I drove my own vehicle</option><option value="company">I drove a company vehicle</option><option value="passenger">I was a passenger / carpooled</option><option value="other">Other transportation</option></select></label>
              <div class="etr-grid"><EventTravelLocation v-model="form.departure" label="Where did you leave from?" :schools="options.schools" :home-address="options.homeAddress" :office-address="selectedOffice?.address" /><EventTravelLocation v-model="form.returnTo" label="Where did you go after the event / materials dropoff?" :schools="options.schools" :home-address="options.homeAddress" :office-address="selectedOffice?.address" /></div>
              <label v-if="usesOffice">Assigned office for pickup / return<select aria-label="Assigned office for pickup / return" v-model="form.officeLocationId" required><option :value="null" disabled>Choose your assigned office</option><option v-for="office in options.offices" :key="office.id" :value="office.id">{{ office.name }}</option></select><span class="hint">{{ selectedOffice?.address || 'Ask your coordinator to update your office assignment if it is missing.' }}</span></label>
              <div v-if="separatePickup" class="etr-route"><h3>Separate materials pickup</h3><div class="etr-grid"><EventTravelLocation v-model="form.pickupFrom" label="Started at" :schools="options.schools" :home-address="options.homeAddress" :office-address="selectedOffice?.address" /><EventTravelLocation v-model="form.pickupTo" label="Went next to" :schools="options.schools" :home-address="options.homeAddress" :office-address="selectedOffice?.address" /></div></div>
              <div v-if="form.materialsReturn === 'separate'" class="etr-route"><h3>Separate materials return</h3><div class="etr-grid"><EventTravelLocation v-model="form.dropoffFrom" label="Started at" :schools="options.schools" :home-address="options.homeAddress" :office-address="selectedOffice?.address" /><EventTravelLocation v-model="form.dropoffTo" label="Went next to" :schools="options.schools" :home-address="options.homeAddress" :office-address="selectedOffice?.address" /></div></div>
              <section v-for="journey in journeys" :key="journey.key" class="etr-route">
                <h3>{{ journey.label }}</h3>
                <div v-for="leg in journey.legs" :key="leg.key" class="etr-leg">
                  <strong>{{ placeLabel(leg.from) }} → {{ placeLabel(leg.to) }}</strong>
                  <p class="etr-route-address">{{ placeAddress(leg.from) }} → {{ placeAddress(leg.to) }}</p>
                  <div class="etr-grid"><label>Left at<input v-model="form.intervals[leg.key].startedAt" type="datetime-local" required :max="localNow" /></label><label>Arrived at<input v-model="form.intervals[leg.key].endedAt" type="datetime-local" required :max="localNow" /></label></div>
                  <details v-if="form.vehicle === 'personal'"><summary>Enter actual miles if the usual route was different</summary><div class="etr-grid"><label>Actual miles<input v-model="form.intervals[leg.key].reportedMiles" type="number" min="0" max="2000" step="0.01" /></label><label>Reason<input v-model="form.intervals[leg.key].mileageNote" :required="form.intervals[leg.key].reportedMiles !== '' && form.intervals[leg.key].reportedMiles != null" maxlength="1000" placeholder="For example, a road closure" /></label></div></details>
                </div>
              </section>
              <details v-if="handlingKeys.length" class="etr-route"><summary>Time spent collecting, loading, or returning materials</summary><p class="hint">Enter any handling time that is not already in your event clock-in/out or another time claim. Leave blank if there was none.</p><div v-for="key in handlingKeys" :key="key"><strong>{{ key === 'pickup' ? 'Pickup / loading' : 'Return / unloading' }}</strong><div class="etr-grid"><label>Started<input v-model="form.handling[key].startedAt" type="datetime-local" :max="localNow" /></label><label>Finished<input v-model="form.handling[key].endedAt" type="datetime-local" :max="localNow" /></label></div></div></details>
              <label>Anything else payroll should know? (optional)<textarea v-model.trim="form.notes" maxlength="2000" rows="2" /></label>
            </fieldset>
            <fieldset v-else-if="preview" :disabled="busy">
              <legend>{{ locked ? 'Submitted report' : 'Review your report' }}</legend>
              <EventTravelReportSummary :report="preview" />
              <p class="hint">Payroll reviews the route, applicable policy, and any exceptions before approving time and mileage.</p>
              <label v-if="!locked" class="etr-check"><input v-model="form.attestation" type="checkbox" required />These are my actual trips and times. I have excluded personal stops and have not claimed this time or mileage elsewhere.</label>
            </fieldset>
            <footer><button v-if="step > 0 && !locked" type="button" class="btn btn-secondary" :disabled="busy" @click="step--; error = ''">Back</button><span>Step {{ step + 1 }} of 4</span><button v-if="!locked" type="submit" class="btn btn-primary" :disabled="busy || !options.events.length || (step === 0 && (!!existing || !selectedEvent?.address))">{{ busy ? 'Saving…' : step === 3 ? 'Submit report' : step === 2 ? 'Review report' : 'Continue' }}</button><button v-else type="button" class="btn btn-primary" @click="emit('close')">Done</button></footer>
          </form>
        </template>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import EventTravelLocation from './EventTravelLocation.vue';
import EventTravelReportSummary from './EventTravelReportSummary.vue';
import { EVENT_TRAVEL_STEPS, eventTravelDefaultForm, eventTravelJourneys, eventTravelInputError } from '../../navigation/eventTravel.js';
const props = defineProps({ agencyId: { type: Number, required: true }, initialEventId: { type: Number, default: null }, initialEventDate: { type: String, default: '' }, initialMileageClaimId: { type: Number, default: null } });
const emit = defineEmits(['close', 'submitted']);
const dialog = ref(null), formElement = ref(null), loading = ref(true), busy = ref(false), error = ref(''), saved = ref(null);
const options = ref({ events: [], offices: [], schools: [], reports: [], homeAddress: '' }), eventId = ref(''), form = ref(eventTravelDefaultForm()), step = ref(0), preview = ref(null), expectedRevision = ref(null), locked = ref(false);
const previousFocus = typeof document !== 'undefined' ? document.activeElement : null;
const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const toLocal = iso => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const localNow = toLocal(new Date().toISOString());
const selectedEvent = computed(() => options.value.events.find(e => e.id === Number(eventId.value)));
const approvedMileageForDate = computed(() => (options.value.approvedMileageClaims || []).filter(c => c.drive_date === form.value.eventDate));
watch(() => form.value.eventDate, () => { if (!approvedMileageForDate.value.some(c => Number(c.id) === Number(form.value.existingMileageClaimId))) form.value.existingMileageClaimId = null; });
const selectedOffice = computed(() => options.value.offices.find(o => o.id === Number(form.value.officeLocationId)));
const existing = computed(() => options.value.reports.find(r => r.eventId === Number(eventId.value) && r.eventDate === form.value.eventDate));
const separatePickup = computed(() => form.value.materialsPickup === 'before_event' && form.value.pickupTiming === 'separate');
const journeys = computed(() => eventTravelJourneys(form.value));
const usesOffice = computed(() => journeys.value.some(j => j.legs.some(l => l.from.kind === 'office' || l.to.kind === 'office')));
const handlingKeys = computed(() => [...(['before_event', 'already_had'].includes(form.value.materialsPickup) ? ['pickup'] : []), ...(['after_event', 'separate', 'kept'].includes(form.value.materialsReturn) ? ['return'] : [])]);
watch(journeys, rows => { for (const j of rows) for (const leg of j.legs) form.value.intervals[leg.key] ||= { startedAt: '', endedAt: '', reportedMiles: '', mileageNote: '' }; }, { immediate: true });
watch(handlingKeys, keys => { for (const key of keys) form.value.handling[key] ||= { startedAt: '', endedAt: '' }; }, { immediate: true });
watch(eventId, () => { form.value = { ...eventTravelDefaultForm(), officeLocationId: options.value.offices[0]?.id || null, eventDate: selectedEvent.value?.dates.length === 1 ? selectedEvent.value.dates[0] : '' }; expectedRevision.value = null; locked.value = false; preview.value = null; });
watch(step, async () => { await nextTick(); if (dialog.value) { dialog.value.scrollTop = 0; dialog.value.focus({ preventScroll: true }); } });
const placeLabel = p => p.kind === 'event' ? selectedEvent.value?.title : p.kind === 'office' ? selectedOffice.value?.name || 'Assigned office' : p.kind === 'home' ? 'Home' : p.kind === 'school' ? options.value.schools.find(s => s.id === p.id)?.name || 'School / client worksite' : p.address || 'Other location';
const placeAddress = p => p.kind === 'event' ? selectedEvent.value?.address : p.kind === 'home' ? options.value.homeAddress : p.kind === 'office' ? selectedOffice.value?.address : p.kind === 'school' ? options.value.schools.find(s => s.id === p.id)?.address : p.address;
function payload() {
  const result = JSON.parse(JSON.stringify(form.value));
  for (const collection of ['intervals', 'handling']) for (const row of Object.values(result[collection])) for (const key of ['startedAt', 'endedAt']) if (row[key]) row[key] = new Date(row[key]).toISOString();
  return { ...result, expectedRevision: expectedRevision.value };
}
async function next() {
  error.value = '';
  if (step.value === 2) { error.value = eventTravelInputError(form.value); if (error.value) { dialog.value.scrollTop = 0; return; } }
  if (!formElement.value.reportValidity()) return;
  if (step.value === 0 && !selectedEvent.value?.address) { error.value = 'Your coordinator needs to save the venue address first.'; return; }
  if (step.value < 2) { step.value++; return; }
  busy.value = true;
  try {
    if (step.value === 2) { preview.value = (await api.post(`/me/company-events/${eventId.value}/travel-report/preview`, payload())).data; step.value = 3; }
    else { saved.value = (await api.post(`/me/company-events/${eventId.value}/travel-report`, payload())).data; emit('submitted', saved.value); }
  } catch (e) { error.value = e.response?.data?.error?.message || e.message || 'Unable to submit this report'; }
  finally { busy.value = false; await nextTick(); if (error.value && dialog.value) dialog.value.scrollTop = 0; dialog.value?.focus({ preventScroll: true }); }
}
function openExisting() {
  const row = existing.value;
  if (!row) return;
  form.value = { ...eventTravelDefaultForm(), ...JSON.parse(JSON.stringify(row.report.form)), attestation: false };
  form.value.notes = [form.value.exceptionNote, form.value.notes].filter(Boolean).join('\n');
  delete form.value.exceptionNote; delete form.value.transportDuties; delete form.value.specialTrip; delete form.value.eventAddressFallback;
  for (const collection of ['intervals', 'handling']) for (const interval of Object.values(form.value[collection])) for (const key of ['startedAt', 'endedAt']) interval[key] = toLocal(interval[key]);
  expectedRevision.value = row.revision; locked.value = row.locked; preview.value = row.report; step.value = row.locked ? 3 : 1;
}
function trapFocus(event) {
  const elements = [...dialog.value.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary')].filter(e => e.getClientRects().length);
  const first = elements[0], last = elements.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
onMounted(async () => {
  dialog.value?.focus();
  try {
    options.value = (await api.get('/me/company-events/travel-options', { params: { agencyId: props.agencyId } })).data;
    if (props.initialEventId) {
      const requested = options.value.events.find(e => e.id === props.initialEventId);
      if (!requested) error.value = 'This event is not available for your account. Please contact Payroll.';
      else {
        eventId.value = requested.id;
        await nextTick();
        if (requested.dates.includes(props.initialEventDate)) form.value.eventDate = props.initialEventDate;
        await nextTick();
        if (approvedMileageForDate.value.some(c => Number(c.id) === props.initialMileageClaimId)) form.value.existingMileageClaimId = props.initialMileageClaimId;
      }
    }
  }
  catch (e) { error.value = e.response?.data?.error?.message || 'Unable to load your assigned events'; }
  finally { loading.value = false; }
});
onBeforeUnmount(() => previousFocus?.focus?.());
</script>
<style scoped>
.etr-overlay { position: fixed; inset: 0; z-index: 12000; background: #0f172a80; display: flex; justify-content: center; align-items: center; padding: 16px; }
.etr-modal { box-sizing: border-box; width: min(760px, 100%); max-height: 94dvh; overflow-y: auto; background: var(--bg-primary, #fff); color: var(--text-primary, #172033); padding: 24px; border-radius: 16px; box-shadow: 0 20px 70px #0003; }
header { display: flex; justify-content: space-between; gap: 16px; align-items: start; }h2 { font-size: 23px; margin: 0; }header p, .hint { color: var(--text-secondary, #475569); font-size: 14px; line-height: 1.5; }h3 { font-size: 17px; margin: 0 0 12px; }
.etr-steps { display: flex; gap: 8px; list-style: none; padding: 0; margin: 20px 0; }.etr-steps li { flex: 1; padding: 10px 6px; border-bottom: 3px solid #e2e8f0; font-size: 13px; }.etr-steps .active { border-color: #0f766e; color: #0f766e; font-weight: 700; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }legend { font-size: 19px; font-weight: 700; margin-bottom: 16px; }label { display: grid; gap: 8px; font-weight: 600; margin-bottom: 18px; }
input, select, textarea { box-sizing: border-box; width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 7px; font: inherit; font-weight: 400; color: inherit; background: var(--bg-primary, white); }input[type=checkbox] { width: 18px; height: 18px; flex-shrink: 0; }.etr-check { display: flex; align-items: flex-start; gap: 10px; font-weight: 400; line-height: 1.5; }.etr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 10px; }.etr-route { padding: 16px; margin: 18px 0; border: 1px solid var(--border-color, #e2e8f0); border-radius: 10px; }.etr-route-address { color: var(--text-secondary, #475569); font-size: 14px; line-height: 1.5; margin: 8px 0; overflow-wrap: anywhere; }.etr-leg + .etr-leg { margin-top: 18px; padding-top: 16px; border-top: 1px solid #e2e8f0; }summary { cursor: pointer; font-size: 14px; }footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; }footer span { font-size: 13px; color: #64748b; }.etr-error { color: #991b1b; background: #fef2f2; padding: 12px; border-radius: 8px; }.etr-notice, .etr-address { padding: 12px; background: var(--bg-secondary, #f1f5f9); border-radius: 8px; }.etr-saved { padding: 28px 0; }@media(max-width: 560px) { .etr-overlay { padding: 0; }.etr-modal { border-radius: 0; max-height: 100dvh; height: 100dvh; padding: 18px; box-sizing: border-box; }.etr-grid { grid-template-columns: 1fr; gap: 0; }.etr-steps li { font-size: 12px; } }
</style>
