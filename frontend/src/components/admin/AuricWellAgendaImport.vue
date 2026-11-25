<template>
  <section class="aw-agenda-import" aria-labelledby="aw-agenda-title">
    <h3 id="aw-agenda-title">Import {{ providerLabel || 'the provider' }}’s weekly agenda</h3>
    <p>Paste the week, review each client and appointment, then create the sessions in the shared schedule. Existing matching appointments are reused.</p>
    <p v-if="loading" role="status">Loading this provider’s caseload and booking options…</p>
    <p v-if="error" class="aw-error" role="alert">{{ error }}</p>
    <template v-if="options">
      <div class="aw-agenda-context">
        <label>Week starts Monday<input v-model="weekStart" type="date" :disabled="busy" @input="invalidate" /></label>
        <label>Agenda time zone<input v-model="timeZone" type="text" placeholder="America/Denver" :disabled="busy" @input="invalidate" /></label>
        <label>Duration when no end time is pasted (minutes)<input v-model="defaults.durationMinutes" type="number" min="5" max="240" placeholder="Choose a duration" :disabled="busy" @input="invalidate" /></label>
        <label>Service for pasted rows<select v-model="defaults.tenantServiceId" :disabled="busy" @change="invalidate"><option value="">Choose a service</option><option v-for="service in options.services" :key="service.id" :value="service.id">{{ service.name }} · {{ service.serviceCode }}</option></select></label>
        <label>Location for pasted rows<select v-model="defaults.serviceLocationId" :disabled="busy" @change="invalidate"><option value="">Choose a location</option><option v-for="location in options.locations" :key="location.id" :value="location.id">{{ serviceLocationDisplay(location) }}</option></select></label>
        <label>Care setting<select v-model="defaults.modality" :disabled="busy" @change="invalidate"><option value="">Choose a setting</option><option value="IN_PERSON">In person</option><option value="TELEHEALTH">Telehealth</option></select></label>
        <label>Repeat pasted appointments<select v-model="defaults.recurrence" :disabled="busy" @change="invalidate"><option value="ONCE">Only this week</option><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every two weeks</option></select></label>
        <label v-if="defaults.recurrence !== 'ONCE'">Total appointments per row<input v-model="defaults.occurrenceCount" type="number" min="1" max="52" placeholder="Choose a count" :disabled="busy" @input="invalidate" /></label>
      </div>
      <div v-if="Number(agencyId) === 2" class="aw-school-pilot">
        <h4>School appointments from saved slots</h4>
        <p v-if="!options.schoolPilotRows?.length">No saved school slots with a client, time and matching school location are ready to load for this provider.</p>
        <template v-else>
          <p>Load this provider’s school slots for next week. Review the service and number of weeks for each client. School closures and recorded cancellations are skipped.</p>
          <label>Weeks to review<input v-model.number="schoolWeeks" type="number" min="1" max="52" :disabled="busy" /></label>
          <button type="button" :disabled="busy || !Number.isInteger(schoolWeeks) || schoolWeeks < 1 || schoolWeeks > 52" @click="loadSchoolPilot">Load school slots for next week</button>
        </template>
        <p v-if="schoolPilot">Pilot appointments are saved with family notices and reminders off while you confirm the schedule. Review and enable communications in the app when families are ready. Insurance claims follow the normal signed-note and billing review.</p>
      </div>
      <label class="aw-paste-label">Weekly agenda paste
        <textarea v-model="text" rows="7" :disabled="busy" placeholder="Monday | 09:00 | 09:50 | Client name&#10;Tuesday | 1:00 PM | 1:50 PM | Another client" @input="onPasteChange" />
      </label>
      <p class="aw-agenda-hint">Use a weekday or full date, a start time, an end time, and the client name. Separate columns with tabs or |. Use explicit AM/PM on each time or 24-hour time. School appointments require an activated school transition and a matching saved school slot. Office room reservations remain in Office Scheduling.</p>
      <button type="button" :disabled="busy || !text.trim() || !weekStart" @click="previewPaste">{{ previewing ? 'Reading agenda…' : 'Read pasted agenda' }}</button>
      <button type="button" :disabled="busy" @click="loadOptions(true)">Refresh provider options</button>

      <template v-if="rows.length">
        <h4>Review appointments</h4>
        <p>Choose the existing client for any unmatched name. Review dates, times, services, locations, and recurrence before checking the final preview.</p>
        <div class="aw-agenda-table-wrap">
          <table>
            <thead><tr><th>Include</th><th>Client</th><th>Date</th><th>Start / end</th><th>Service / location</th><th>Setting</th><th>Repeat</th><th>Review</th></tr></thead>
            <tbody>
              <tr v-for="(row, index) in rows" :key="row.rowId" :class="{ 'aw-row-excluded': row.include === false }">
                <td><input v-model="row.include" type="checkbox" :aria-label="`Include row ${index + 1}`" :disabled="busy" @change="invalidate" /></td>
                <td><span class="aw-source">{{ row.clientInput || row.sourceLine || `Row ${index + 1}` }}</span><select v-model="row.clientId" :aria-label="`Client for row ${index + 1}`" :disabled="busy" @change="invalidate"><option :value="null">Choose existing client</option><option v-for="client in options.clients" :key="client.id" :value="client.id">{{ client.label }} · #{{ client.id }}</option></select></td>
                <td><input v-model="row.date" type="date" :aria-label="`Date for row ${index + 1}`" :disabled="busy" @input="invalidate" /></td>
                <td><input v-model="row.startTime" type="time" :aria-label="`Start for row ${index + 1}`" :disabled="busy" @input="invalidate" /><input v-model="row.endTime" type="time" :aria-label="`End for row ${index + 1}`" :disabled="busy" @input="invalidate" /><small v-if="row.durationMinutes">{{ row.durationMinutes }} minutes in last preview</small></td>
                <td><select v-model="row.tenantServiceId" :aria-label="`Service for row ${index + 1}`" :disabled="busy" @change="invalidate"><option :value="null">Choose service</option><option v-for="service in options.services" :key="service.id" :value="service.id">{{ service.name }} · {{ service.serviceCode }}</option></select><select v-model="row.serviceLocationId" :aria-label="`Location for row ${index + 1}`" :disabled="busy" @change="invalidate"><option :value="null">Choose location</option><option v-for="location in options.locations" :key="location.id" :value="location.id">{{ location.name }}</option></select><select v-if="schoolFor(row)" v-model="row.schoolSlotId" :aria-label="`School slot for row ${index + 1}`" :disabled="busy" @change="invalidate"><option :value="null">Match a single saved school slot</option><option v-for="slot in availableSlots(row)" :key="slot.id" :value="slot.id">{{ slot.label }}</option></select></td>
                <td><select v-model="row.modality" :aria-label="`Setting for row ${index + 1}`" :disabled="busy" @change="invalidate"><option value="">Choose</option><option value="IN_PERSON">In person</option><option value="TELEHEALTH">Telehealth</option></select></td>
                <td><select v-model="row.recurrence" :aria-label="`Repeat for row ${index + 1}`" :disabled="busy" @change="invalidate"><option value="ONCE">Once</option><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every two weeks</option></select><input v-if="row.recurrence !== 'ONCE'" v-model="row.occurrenceCount" type="number" min="1" max="52" :aria-label="`Appointment count for row ${index + 1}`" :disabled="busy" @input="invalidate" /></td>
                <td><span>{{ row.status === 'blocked' ? 'Needs review' : row.status === 'existing' ? 'Already scheduled' : row.status === 'skipped' ? 'No appointments on these dates' : row.status === 'ready' && previewToken ? 'Ready' : 'Review required' }}</span><p v-for="message in row.errors || []" :key="message" class="aw-error">{{ message }}</p><p v-for="message in row.warnings || []" :key="message" class="aw-warning">{{ message }}</p><p v-for="skip in row.skippedDates || []" :key="skip.date">{{ skip.date }} · {{ skip.reason }}</p><small v-if="row.existingCount">{{ row.existingCount }} existing appointment(s) kept</small>
                  <div v-if="schoolPilot && moveDetails(row)" class="aw-school-move">
                    <p>Move this client from {{ moveDetails(row).fromDay }} to {{ moveDetails(row).toDay }} at {{ moveDetails(row).schoolName }}? This frees the original day’s slot and uses one on the new day.</p>
                    <button v-if="capacityReview?.rowId !== row.rowId" type="button" :disabled="busy" @click="moveSavedSlot(row, false)">Move saved school slot</button>
                    <template v-else>
                      <p>{{ capacityReview.message }}</p>
                      <button type="button" :disabled="busy" @click="moveSavedSlot(row, true)">Add one slot and move</button>
                      <button type="button" :disabled="busy" @click="capacityReview = null">Cancel</button>
                    </template>
                  </div></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button type="button" :disabled="busy || !rows.some(row => row.include !== false)" @click="previewReviewed">{{ previewing ? 'Checking appointments…' : 'Check reviewed appointments' }}</button>
        <div v-if="summary" class="aw-agenda-summary" role="status">{{ summary.newAppointments }} new appointments · {{ summary.existingAppointments }} already scheduled · {{ summary.blockedRows }} rows need review.</div>
        <p v-if="rows.length && !previewToken" class="aw-agenda-hint">Check the reviewed appointments again after making changes. The final preview expires after 15 minutes.</p>
        <label v-if="summary?.sameDayWarning" class="aw-agenda-check"><input v-model="acknowledgeSameDay" type="checkbox" :disabled="busy" />I reviewed the same-day services. No billing modifier will be applied automatically.</label>
        <label class="aw-agenda-check"><input v-model="confirmed" type="checkbox" :disabled="busy || !previewToken" />I reviewed the client identities, time zone, times, locations, and recurrence. Create these appointments. {{ schoolPilot ? 'Family notices and reminders will be off.' : 'Normal appointment notifications apply.' }}</label>
        <button type="button" class="aw-create" :disabled="busy || !previewToken || !confirmed || (summary?.sameDayWarning && !acknowledgeSameDay)" @click="commit">{{ saving ? 'Scheduling appointments…' : `Create reviewed appointments${summary ? ` (${summary.newAppointments} new)` : ''}` }}</button>
      </template>
      <div v-if="result" class="aw-agenda-result" :class="{ 'aw-warning': !result.complete }" role="status">
        <p v-if="result.complete">Scheduled {{ result.createdCount }} new appointments; kept {{ result.existingCount }} existing appointments.</p>
        <template v-else><p>{{ result.error }}</p><p>{{ result.message }}</p><p v-if="result.savedAppointmentIds?.length">Saved appointment IDs: {{ result.savedAppointmentIds.join(', ') }}</p></template>
      </div>
    </template>
  </section>
</template>

<script setup>
import {serviceLocationDisplay} from '../../utils/serviceLocationDisplay.js';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: [Number, String], required: true }, providerId: { type: [Number, String], required: true }, providerLabel: { type: String, default: '' } });
const emit = defineEmits(['saved', 'busy']);
const options = ref(null), loading = ref(false), previewing = ref(false), saving = ref(false), error = ref('');
const weekStart = ref(''), timeZone = ref(''), text = ref(''), rows = ref([]), summary = ref(null), previewToken = ref(null), confirmed = ref(false), acknowledgeSameDay = ref(false), result = ref(null);
const schoolPilot = ref(false), schoolWeeks = ref(8), capacityReview = ref(null);
const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const defaults = ref({ durationMinutes: '', tenantServiceId: '', serviceLocationId: '', modality: '', recurrence: 'ONCE', occurrenceCount: '' });
const busy = computed(() => loading.value || previewing.value || saving.value);
watch(busy, value => emit('busy', value), { flush: 'sync' });
let requestId = 0;
const contextKey = () => `${Number(props.agencyId)}:${Number(props.providerId)}`;
const schoolFor = row => options.value?.locations.find(location => Number(location.id) === Number(row.serviceLocationId))?.schoolId || null;
const availableSlots = row => (options.value?.schoolSlots || []).filter(slot => Number(slot.schoolId) === Number(schoolFor(row)) && Number(slot.clientId) === Number(row.clientId));
function invalidate() { capacityReview.value = null; previewToken.value = null; confirmed.value = false; acknowledgeSameDay.value = false; }
function onPasteChange() { schoolPilot.value = false; invalidate(); rows.value = []; summary.value = null; result.value = null; }
function loadSchoolPilot() {
  const zone = options.value.timeZone;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() + 8 - (monday.getUTCDay() || 7));
  weekStart.value = monday.toISOString().slice(0, 10);
  timeZone.value = zone;
  schoolPilot.value = true;
  text.value = '';
  rows.value = options.value.schoolPilotRows.map(slot => {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + weekdays.indexOf(slot.weekday));
    return { ...slot, include: true, rowId: `school-slot-${slot.schoolSlotId}`, date: date.toISOString().slice(0, 10),
      tenantServiceId: null, modality: 'IN_PERSON', recurrence: 'WEEKLY', occurrenceCount: schoolWeeks.value };
  });
  summary.value = null;
  result.value = null;
  error.value = '';
  invalidate();
}
function moveDetails(row) {
  const source = options.value?.schoolPilotRows?.find(slot => slot.schoolSlotId === Number(row.schoolSlotId));
  const location = options.value?.locations.find(item => Number(item.id) === Number(row.serviceLocationId));
  const toDay = weekdays[new Date(`${row.date}T12:00:00Z`).getUTCDay() - 1];
  if (!source || !location?.schoolId || source.serviceLocationId !== Number(location.id)
      || source.clientId !== Number(row.clientId) || row.modality !== 'IN_PERSON' || !toDay || toDay === source.weekday) return null;
  return { schoolId: location.schoolId, schoolName: location.name, fromDay: source.weekday, toDay };
}
async function moveSavedSlot(row, addCapacity) {
  const details = moveDetails(row);
  if (!details || busy.value) return;
  const key = contextKey();
  invalidate();
  error.value = '';
  saving.value = true;
  try {
    const { data } = await api.post(`/school-appointment-transition/${details.schoolId}/providers/${props.providerId}/move-slot`, {
      slotId: row.schoolSlotId, clientId: row.clientId, fromDay: details.fromDay, toDay: details.toDay,
      startTime: row.startTime, endTime: row.endTime, reviewed: true, addCapacity
    });
    if (key !== contextKey()) return;
    row.schoolSlotId = data.slotId;
    row.errors = [];
    row.status = 'review';
    summary.value = null;
    await loadOptions(true);
  } catch (exception) {
    if (key !== contextKey()) return;
    const response = exception?.response?.data?.error;
    if (response?.code === 'SCHOOL_SLOT_CAPACITY_CONFIRMATION') capacityReview.value = { rowId: row.rowId, message: response.message };
    else showError(exception);
  } finally { saving.value = false; }
}
function payload(reviewed) {
  return { agencyId: Number(props.agencyId), providerId: Number(props.providerId), weekStart: weekStart.value, timeZone: timeZone.value.trim(), defaults: { ...defaults.value },
    ...(reviewed && schoolPilot.value ? { schoolPilot: true } : {}),
    ...(reviewed ? { rows: rows.value.filter(row => row.include !== false).map(row => ({ ...row })) } : { text: text.value }) };
}
function showError(exception) { error.value = exception?.response?.data?.error?.message || exception?.message || 'The agenda could not be checked.'; }
async function loadOptions(preserveInput = false) {
  const preserve = preserveInput === true;
  const id = ++requestId, key = contextKey();
  error.value = ''; invalidate();
  if (!preserve) {
    options.value = null; text.value = ''; schoolPilot.value = false; rows.value = []; summary.value = null; result.value = null;
    defaults.value = { durationMinutes: '', tenantServiceId: '', serviceLocationId: '', modality: '', recurrence: 'ONCE', occurrenceCount: '' };
  }
  loading.value = false;
  if (!Number(props.agencyId) || !Number(props.providerId)) return;
  loading.value = true;
  try {
    const { data } = await api.get('/auricwell-agenda-import/options', { params: { agencyId: Number(props.agencyId), providerId: Number(props.providerId) } });
    if (id !== requestId || key !== contextKey()) return;
    options.value = data; if (!preserve || !timeZone.value) timeZone.value = data.timeZone || '';
  } catch (exception) { if (id === requestId) showError(exception); }
  finally { if (id === requestId) loading.value = false; }
}
async function preview(reviewed) {
  if (busy.value) return;
  const key = contextKey(), input = payload(reviewed);
  error.value = ''; result.value = null; invalidate(); previewing.value = true;
  try {
    const { data } = await api.post('/auricwell-agenda-import/preview', input);
    if (key !== contextKey()) return;
    rows.value = data.rows.map(row => ({ ...row, include: true })); summary.value = data.summary; previewToken.value = data.previewToken;
  } catch (exception) { if (key === contextKey()) showError(exception); }
  finally { previewing.value = false; }
}
const previewPaste = () => { schoolPilot.value = false; return preview(false); }, previewReviewed = () => preview(true);
async function commit() {
  if (busy.value || !confirmed.value || !previewToken.value) return;
  const key = contextKey(), input = { ...payload(true), previewToken: previewToken.value, confirm: true, acknowledgeSameDayServices: acknowledgeSameDay.value };
  error.value = ''; result.value = null; saving.value = true;
  try {
    const { data } = await api.post('/auricwell-agenda-import/commit', input);
    emit('saved', { ...data, agencyId: input.agencyId, providerId: input.providerId });
    if (key !== contextKey()) return;
    result.value = data; invalidate();
  } catch (exception) { if (key === contextKey()) { showError(exception); invalidate(); } }
  finally { saving.value = false; }
}
watch(() => [props.agencyId, props.providerId], loadOptions, { immediate: true });
onBeforeUnmount(() => { requestId += 1; emit('busy', false); });
</script>

<style scoped>
.aw-agenda-import{margin-top:20px;padding:20px;border:1px solid var(--border-color,#d2dfd7);border-radius:12px}.aw-agenda-import p{line-height:1.55}.aw-agenda-context{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:18px 0}.aw-agenda-import label{display:grid;gap:6px;font-weight:600;font-size:.9rem}.aw-agenda-import input,.aw-agenda-import select,.aw-agenda-import textarea{font:inherit;padding:9px;border:1px solid var(--border-color,#b8c8bf);border-radius:6px;background:var(--bg-primary,#fff);color:inherit;min-width:0}.aw-paste-label textarea{width:100%;box-sizing:border-box}.aw-agenda-hint{font-size:.85rem;color:var(--text-secondary,#52665e)}button{padding:10px 16px;border:1px solid #698b76;border-radius:7px;background:var(--bg-primary,#fff);color:inherit;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}.aw-create{background:#245441;color:white;margin-top:10px}.aw-agenda-table-wrap{overflow:auto;margin:16px 0}table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--border-color,#d2dfd7);padding:10px;min-width:100px}th:first-child,td:first-child{min-width:40px}td input,td select{display:block;width:100%;box-sizing:border-box;margin-bottom:7px}td select{min-width:160px}td input[type=checkbox]{width:auto}.aw-source{display:block;max-width:220px;overflow-wrap:anywhere;margin-bottom:7px}.aw-error{color:var(--danger,#a32626);font-size:.85rem}.aw-warning{color:var(--warning-text,#8b5516);font-size:.85rem}.aw-agenda-summary,.aw-agenda-result{margin:14px 0;padding:12px;border-radius:8px;background:var(--bg-secondary,#f0f5f2)}.aw-agenda-check{display:flex!important;align-items:flex-start;gap:9px!important;margin:14px 0;line-height:1.5}.aw-agenda-check input{margin-top:4px}.aw-row-excluded{opacity:.5}small{display:block;line-height:1.4}
.aw-school-pilot{background:var(--bg-secondary,#f0f5f2);border-radius:8px;padding:14px;margin-bottom:16px}.aw-school-pilot label{display:inline-grid;margin:0 10px 8px 0}.aw-school-pilot input{width:8rem}.aw-school-move{margin-top:10px;padding:10px;background:var(--bg-secondary,#f0f5f2);border-radius:6px}.aw-school-move button{margin-bottom:6px}
</style>
