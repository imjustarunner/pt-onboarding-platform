<template>
  <main class="childcare-page">
    <header><div><p class="eyebrow">My work</p><h1>Childcare</h1><p>Scheduled children, attendance, and your actual work time.</p></div><button type="button" :disabled="loading || busy" @click="load">Refresh</button></header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">Loading childcare shifts…</p>
    <p v-else-if="!context?.enabled || (!context.canWork && !context.canManage)" role="status">Childcare is not assigned to your account in this workspace. Ask your scheduler to review your service assignments.</p>
    <template v-else>
      <section v-if="ownRates" class="card"><h2>Your childcare rates</h2><p v-if="ownRates.reviewRequired" class="review">{{ (ownRates.reasons || []).join('; ') }}</p><p>Category {{ ownRates.category || 'not configured' }} · Childcare level {{ ownRates.childcareLevel || 'not configured' }}<span v-if="ownRates.effectiveOn"> · Effective {{ ownRates.effectiveOn }}</span></p><ul><li v-for="band in CHILDCARE_BANDS" :key="band">{{ band }} {{ band === 1 ? 'child' : 'children' }} per caregiver: {{ childcareMoney(ownRates.ratesByBand?.[band]) }}/hour</li></ul></section>
      <button v-if="context.canSchedule || context.canManage" type="button" :disabled="busy" @click="newShift">Schedule childcare</button>
      <form v-if="editing" class="card shift-form" @submit.prevent="saveShift">
        <h2>{{ editId ? 'Edit childcare shift' : 'Schedule childcare' }}</h2>
        <label>Title<input v-model="draft.title" maxlength="160" placeholder="Childcare shift" /></label>
        <label>Time zone<select v-model="draft.timezone" required><optgroup v-for="group in TIMEZONE_GROUPS" :key="group.label" :label="group.label"><option v-for="zone in group.zones" :key="zone.value" :value="zone.value">{{ zone.label }}</option></optgroup></select></label>
        <div class="columns"><label>Starts<input v-model="draft.startLocal" type="datetime-local" required /></label><label>Ends<input v-model="draft.endLocal" type="datetime-local" required /></label></div>
        <label>Planned number of children<input v-model="draft.plannedChildren" type="number" min="0" step="1" required /></label>
        <label>Location<input v-model="draft.locationName" maxlength="200" placeholder="Approved childcare location" /></label>
        <div v-if="context.canManagePay" class="columns"><label>Approved work-location minimum hourly rate<input v-model="draft.minimumHourlyRate" type="number" min="0.01" step="0.01" inputmode="decimal" /></label><label>Work-location jurisdiction<input v-model="draft.wageFloorJurisdiction" maxlength="200" placeholder="Approved jurisdiction for this location" /></label></div>
        <fieldset v-if="context.canManage"><legend>Caregivers and co-caregivers</legend><label v-for="person in eligibleStaff" :key="person.userId" class="check"><input v-model="draft.providerUserIds" type="checkbox" :value="person.userId" />{{ person.firstName }} {{ person.lastName }}</label><p v-if="!eligibleStaff.length">No active childcare assignments. Review the employee’s service permissions first.</p></fieldset>
        <p v-else>You are scheduling your own childcare shift.</p>
        <label>Private operational note (optional)<textarea v-model="draft.note" maxlength="4000" placeholder="Supplies, arrival instructions, or other operational details" /></label>
        <p>Child names are not needed. Planned children are kept separately from actual attendance.</p>
        <div class="actions"><button type="submit" :disabled="busy">{{ busy ? 'Saving…' : 'Save shift' }}</button><button type="button" :disabled="busy" @click="editing = false">Cancel</button></div>
      </form>
      <section class="shift-layout">
        <div><h2>Shifts</h2><p v-if="!shifts.length">No childcare shifts are scheduled.</p><button v-for="shift in shifts" :key="shift.id" type="button" class="card shift-choice" :aria-pressed="selected?.id === shift.id" @click="openShift(shift.id)"><strong>{{ shift.title || 'Childcare shift' }}</strong><span>{{ when(shift) }}</span><span>{{ shift.plannedChildren }} children planned · {{ shift.status }}</span></button></div>
        <article v-if="selected" class="card shift-detail">
          <h2>{{ selected.title || 'Childcare shift' }}</h2><p>{{ when(selected) }}</p><p v-if="selected.locationName">{{ selected.locationName }}</p>
          <p><strong>{{ selected.plannedChildren }} children planned</strong><span v-if="selected.actualChildren != null"> · Latest recorded count: {{ selected.actualChildren }}</span></p>
          <p v-if="selected.note" class="operational-note">{{ selected.note }}</p>
          <ul class="caregivers"><li v-for="person in selected.providers || []" :key="person.userId">{{ person.firstName }} {{ person.lastName }} · {{ person.clockedIn ? 'Clocked in' : 'Not clocked in' }}</li></ul>
          <template v-if="selected.status !== 'cancelled' && selected.status !== 'canceled'">
            <fieldset v-if="isAssigned"><legend>Were the scheduled {{ selected.plannedChildren }} children present?</legend><label class="check"><input v-model="countChoice" type="radio" value="planned" name="childcare-count" />Yes, {{ selected.plannedChildren }} children</label><label class="check"><input v-model="countChoice" type="radio" value="actual" name="childcare-count" />A different number</label><label v-if="countChoice === 'actual'">Actual children present<input v-model="actualCount" type="number" min="0" step="1" /></label><label class="check"><input v-model="countChoice" type="radio" value="later" name="childcare-count" />Attendance needs review; record my time now</label></fieldset>
            <div class="actions"><button v-if="isAssigned && !clockedIn" type="button" :disabled="busy" @click="punch('clock-in')">Clock in</button><button v-if="isAssigned && clockedIn" type="button" :disabled="busy" @click="punch('clock-out')">Clock out</button><button v-if="isAssigned || context.canManage" type="button" :disabled="busy || countChoice === 'later'" @click="saveAttendance">Record attendance change</button><button v-if="canEdit" type="button" :disabled="busy" @click="editShift">Edit schedule</button><button v-if="canEdit" type="button" :disabled="busy" @click="cancelShift">Cancel shift</button></div>
          </template>
          <p v-if="selected.myParticipation?.clockedInAt">Clocked in: {{ instant(selected.myParticipation.clockedInAt, selected.timezone) }}</p><p v-if="selected.myParticipation?.clockedOutAt">Clocked out: {{ instant(selected.myParticipation.clockedOutAt, selected.timezone) }}</p>
          <form v-if="context.canManage && selected.attendanceReviewRequired" class="review" @submit.prevent="resolveAttendance"><h3>Review attendance</h3><label>Reviewed actual child count<input v-model="reviewCount" type="number" min="0" step="1" required /></label><label>Count applied from ({{ selected.timezone }})<input v-model="reviewEffectiveLocal" type="datetime-local" required /></label><label>Review explanation<textarea v-model="reviewNote" required maxlength="2000" placeholder="Explain how the recorded attendance and work intervals were verified." /></label><p>The original observations and punches stay in history. This records a reviewed count for the stated work interval.</p><button type="submit" :disabled="busy">Record attendance review</button></form>
          <section v-if="pay"><h3>Your childcare pay</h3><p v-if="pay.reviewRequired" class="review" role="status">Review required: {{ (pay.reasons || []).join('; ') }}</p><p v-if="pay.correctionReviewRequired">Previously approved: {{ childcareMoney(pay.approvedAmount) }}. Revised estimate awaiting correction review: {{ childcareMoney(pay.estimatedUnapprovedAmount) }}.</p><p>{{ Number(pay.totalMinutes || 0).toFixed(1) }} actual minutes · {{ childcareMoney(pay.totalAmount) }}</p><div class="table-wrap"><table v-if="pay.segments?.length"><thead><tr><th>Work interval</th><th>Children / caregivers</th><th>Band</th><th>Rate / hour</th><th>Amount</th></tr></thead><tbody><tr v-for="(segment, i) in pay.segments" :key="i"><td>{{ instant(segment.startedAt, selected.timezone) }} – {{ instant(segment.endedAt, selected.timezone) }}</td><td>{{ segment.children }} / {{ segment.caregivers }}</td><td>{{ segment.band }}</td><td>{{ childcareMoney(segment.rate) }}</td><td>{{ childcareMoney(segment.amount) }}</td></tr></tbody></table></div><p>Calculated from recorded attendance, active caregivers, actual time, and your effective approved rates.</p></section>
        </article>
      </section>
    </template>
  </main>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import api from '../services/api';
import { TIMEZONE_GROUPS, zonedDatetimeLocalToIso, isoToZonedDatetimeLocal, formatViewerEventWhen, parseUtcInstant } from '../utils/timezones';
import { CHILDCARE_BANDS, childcareCountPayload, childcareMoney } from '../utils/childcarePresentation';

const props = defineProps({ agencyId: { type: Number, default: null }, http: { type: Object, default: null }, shiftId: { type: Number, default: null }, userId: { type: Number, default: null } });
const route = useRoute(), router = useRouter(), agencyStore = useAgencyStore(), auth = useAuthStore();
const http = computed(() => props.http || api);
const agencyId = computed(() => Number(props.agencyId || agencyStore.currentAgency?.id) || null);
const context = ref(null), shifts = ref([]), selected = ref(null), pay = ref(null), eligibleStaff = ref([]);
const ownRates = ref(null);
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref(''), editing = ref(false), editId = ref(null);
const countChoice = ref(''), actualCount = ref(''), draft = ref({});
const reviewCount = ref(''), reviewNote = ref(''), reviewEffectiveLocal = ref('');
let generation = 0, selectionGeneration = 0, actionKey = null, pendingPunch = null;
const myId = computed(() => Number(props.userId || auth.user?.id));
const isAssigned = computed(() => (selected.value?.providers || []).some(p => Number(p.userId) === myId.value));
const clockedIn = computed(() => !!((selected.value?.providers || []).find(p => Number(p.userId) === myId.value)?.clockedIn));
const canEdit = computed(() => context.value?.canManage || (context.value?.canSchedule && isAssigned.value));
const when = shift => formatViewerEventWhen(shift.startsAt, shift.endsAt, shift.timezone);
const instant = (value, timezone) => { const date = parseUtcInstant(value); return date ? date.toLocaleString('en-US', { timeZone: timezone || 'America/Denver', timeZoneName: 'short' }) : '—'; };
const message = e => e.response?.data?.error?.message || e.message || 'This action could not be completed. Try again.';
const unwrap = response => response.data?.data || response.data;

async function load() {
  const token = ++generation, aid = agencyId.value;
  selected.value = null; pay.value = null; context.value = null; shifts.value = []; ownRates.value = null; eligibleStaff.value = []; error.value = ''; editing.value = false;
  if (!aid) { error.value = 'Choose your organization to view childcare shifts.'; return; }
  loading.value = true;
  try {
    const data = unwrap(await http.value.get('/childcare/context', { params: { agencyId: aid } }));
    if (token !== generation) return;
    context.value = data;
    if (!data.enabled || (!data.canWork && !data.canManage)) return;
    if (data.canWork && myId.value) {
      const rates = unwrap(await http.value.get(`/childcare/staff/${myId.value}/rates`, { params: { agencyId: aid } }));
      if (token !== generation) return;
      ownRates.value = rates;
    }
    const listed = unwrap(await http.value.get('/childcare/shifts', { params: { agencyId: aid } }));
    if (token !== generation) return;
    shifts.value = listed.shifts || [];
    if (data.canManage) {
      const people = unwrap(await http.value.get('/childcare/staff', { params: { agencyId: aid } }));
      if (token !== generation) return;
      eligibleStaff.value = (people.staff || []).filter(p => p.grant?.enabled);
    }
    const id = Number(props.shiftId || route.query.shiftId);
    if (id) await openShift(id, token);
  } catch (e) { if (token === generation) error.value = message(e); }
  finally { if (token === generation) loading.value = false; }
}
async function openShift(id, expectedGeneration = generation) {
  const selectionToken = ++selectionGeneration;
  error.value = ''; pay.value = null;
  try {
    const data = unwrap(await http.value.get(`/childcare/shifts/${id}`, { params: { agencyId: agencyId.value } }));
    if (expectedGeneration !== generation || selectionToken !== selectionGeneration) return;
    selected.value = data.shift || data; countChoice.value = ''; actualCount.value = ''; reviewCount.value = selected.value.actualChildren ?? ''; reviewNote.value = ''; reviewEffectiveLocal.value = isoToZonedDatetimeLocal(selected.value.firstClockInAt || selected.value.startsAt, selected.value.timezone); actionKey = null; pendingPunch = null;
    if (!props.http && Number(route.query.shiftId) !== Number(id)) router.replace({ query: { ...route.query, shiftId: String(id) } });
    if (isAssigned.value) {
      const result = unwrap(await http.value.get(`/childcare/shifts/${id}/pay-preview`, { params: { agencyId: agencyId.value } }));
      if (expectedGeneration === generation && selectionToken === selectionGeneration && Number(selected.value?.id) === Number(id)) pay.value = result;
    }
  } catch (e) { if (expectedGeneration === generation && selectionToken === selectionGeneration) error.value = message(e); }
}
function newShift() {
  editId.value = null; draft.value = { title: 'Childcare shift', timezone: agencyStore.currentAgency?.timezone || 'America/Denver', startLocal: '', endLocal: '', plannedChildren: '', providerUserIds: context.value.canManage ? [] : [myId.value], note: '', locationName: '', minimumHourlyRate: '', wageFloorJurisdiction: '' }; editing.value = true;
}
function editShift() {
  const shift = selected.value; editId.value = shift.id;
  draft.value = { title: shift.title, timezone: shift.timezone, startLocal: isoToZonedDatetimeLocal(shift.startsAt, shift.timezone), endLocal: isoToZonedDatetimeLocal(shift.endsAt, shift.timezone), plannedChildren: shift.plannedChildren, providerUserIds: (shift.providers || []).map(p => p.userId), note: shift.note || '', locationName: shift.locationName || '', minimumHourlyRate: shift.minimumHourlyRate ?? '', wageFloorJurisdiction: shift.wageFloorJurisdiction || '' }; editing.value = true;
}
async function saveShift() {
  if (busy.value) return;
  const aid = agencyId.value;
  try {
    const startsAt = zonedDatetimeLocalToIso(draft.value.startLocal, draft.value.timezone), endsAt = zonedDatetimeLocalToIso(draft.value.endLocal, draft.value.timezone);
    if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) throw new Error('Choose a valid start and later end time in the shift time zone.');
    if (String(draft.value.plannedChildren).trim() === '' || !Number.isSafeInteger(Number(draft.value.plannedChildren)) || Number(draft.value.plannedChildren) < 0) throw new Error('Enter the planned number of children.');
    busy.value = true; error.value = '';
    const body = { agencyId: aid, title: draft.value.title, startsAt, endsAt, timezone: draft.value.timezone, plannedChildren: Number(draft.value.plannedChildren), providerUserIds: context.value.canManage ? draft.value.providerUserIds : [myId.value], note: draft.value.note, locationName: draft.value.locationName, ...(context.value.canManagePay ? { minimumHourlyRate: draft.value.minimumHourlyRate === '' ? null : Number(draft.value.minimumHourlyRate), wageFloorJurisdiction: draft.value.wageFloorJurisdiction } : {}) };
    const result = unwrap(await (editId.value ? http.value.patch(`/childcare/shifts/${editId.value}`, body) : http.value.post('/childcare/shifts', body)));
    if (aid !== agencyId.value) return;
    editing.value = false; notice.value = 'Childcare shift saved.';
    const id = result.shift?.id || result.id; await load(); if (id) await openShift(id);
  } catch (e) { if (aid === agencyId.value) error.value = message(e); }
  finally { busy.value = false; }
}
async function perform(action, body, success) {
  if (busy.value || !selected.value) return;
  const aid = agencyId.value, id = selected.value.id;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await http.value.post(`/childcare/shifts/${id}/${action}`, { agencyId: aid, ...body });
    actionKey = null; pendingPunch = null;
    if (aid !== agencyId.value) return;
    notice.value = success; await openShift(id);
  } catch (e) { if (aid === agencyId.value) error.value = message(e); }
  finally { busy.value = false; }
}
function punch(action) {
  try {
    const counts = childcareCountPayload(countChoice.value, actualCount.value, selected.value.plannedChildren);
    if (pendingPunch && (pendingPunch.action !== action || JSON.stringify(pendingPunch.counts) !== JSON.stringify(counts))) throw new Error('Retry the original clock request or refresh this shift to confirm its result before changing attendance.');
    actionKey ||= globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingPunch = { action, counts };
    return perform(action, { ...counts, idempotencyKey: actionKey }, action === 'clock-in' ? 'Clock-in recorded.' : 'Clock-out recorded.');
  } catch (e) { error.value = message(e); }
}
function saveAttendance() {
  try { if (pendingPunch) throw new Error('Refresh this shift to confirm the earlier clock request before recording an attendance change.'); return perform('attendance', { ...childcareCountPayload(countChoice.value, actualCount.value, selected.value.plannedChildren), expectedVersion: selected.value.attendanceVersion }, 'Attendance change recorded.'); }
  catch (e) { error.value = message(e); }
}
function resolveAttendance() {
  try {
    if (!reviewNote.value.trim()) throw new Error('Explain the attendance review before saving.');
    const effectiveAt = zonedDatetimeLocalToIso(reviewEffectiveLocal.value, selected.value.timezone);
    if (!effectiveAt) throw new Error('Choose the verified start of this attendance count.');
    return perform('attendance', { ...childcareCountPayload('actual', reviewCount.value, selected.value.plannedChildren), expectedVersion: selected.value.attendanceVersion, resolveReview: true, reviewNote: reviewNote.value.trim(), effectiveAt }, 'Attendance review recorded.');
  } catch (e) { error.value = message(e); }
}
async function cancelShift() {
  if (busy.value) return;
  busy.value = true; error.value = '';
  const aid = agencyId.value, id = selected.value.id;
  try { await http.value.patch(`/childcare/shifts/${id}`, { agencyId: aid, status: 'cancelled' }); if (aid === agencyId.value) { notice.value = 'Shift canceled.'; await load(); } }
  catch (e) { if (aid === agencyId.value) error.value = message(e); }
  finally { busy.value = false; }
}
watch(agencyId, load, { immediate: true });
watch(() => props.shiftId, id => { if (id && context.value) openShift(id); });
</script>

<style scoped>
.childcare-page{max-width:1120px;margin:auto;padding:24px;color:var(--text-primary,#203b32)}header,.actions{display:flex;gap:12px;align-items:center;justify-content:space-between}header p{margin:5px 0}.eyebrow{font-size:.8rem;text-transform:uppercase;letter-spacing:.1em}h1{margin:0}.card{border:1px solid #b7cfc3;border-radius:12px;background:var(--bg-card,#fff);padding:20px;margin:14px 0}.shift-layout{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,2fr);gap:24px}.shift-choice{display:flex;flex-direction:column;text-align:left;gap:8px;width:100%}.shift-choice[aria-pressed=true]{outline:2px solid #27654e}.shift-form{display:grid;gap:14px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}label{display:grid;gap:6px}.check{display:flex;align-items:center;gap:8px;margin:8px 0}.check input{width:auto}input,select,textarea,button{font:inherit}input,select,textarea{width:100%;box-sizing:border-box;border:1px solid #95b4a5;border-radius:7px;padding:10px;background:var(--bg-input,#fff);color:inherit}button{border:1px solid #739b87;border-radius:7px;padding:10px 14px;cursor:pointer;color:inherit;background:var(--bg-card,#fff)}button:disabled{opacity:.6;cursor:wait}.actions{justify-content:flex-start;flex-wrap:wrap}.error{background:#fff0ef;color:#8b2020;padding:14px;border-radius:8px}.notice{background:#e8f5ee;padding:12px;border-radius:8px}.review{color:#754800;background:#fff4d6;padding:12px}.operational-note{white-space:pre-wrap}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{text-align:left;padding:10px;border-bottom:1px solid #d4e1da}fieldset{border:1px solid #bbcec2;border-radius:8px;padding:14px;margin:14px 0}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #367bd4;outline-offset:2px}@media(max-width:700px){.childcare-page{padding:16px}.shift-layout,.columns{grid-template-columns:1fr}.card{padding:16px}header{align-items:flex-start;flex-wrap:wrap}}
.shift-layout>*{min-width:0}.card{min-width:0;box-sizing:border-box}.table-wrap{max-width:100%}fieldset{min-inline-size:0}.check{overflow-wrap:anywhere}@media(max-width:700px){.shift-layout,.columns{grid-template-columns:minmax(0,1fr)}}
</style>
