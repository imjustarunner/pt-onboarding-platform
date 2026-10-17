<template>
  <section class="supervision-record" data-testid="supervision-record">
    <p v-if="loading" role="status">Loading session record…</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="record">
      <div class="record-heading">
        <div><strong>{{ statusLabel }}</strong><span v-if="record.session.finalizedAt"> · Recorded {{ when(record.session.finalizedAt) }}</span></div>
        <div class="record-actions">
          <button v-if="compact" type="button" class="btn btn-secondary btn-sm" @click="emit('open-attendance')">Attendance &amp; time</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="emit('open-notes')">Notes &amp; summary</button>
        </div>
      </div>
      <p v-if="compact" class="record-overview">{{ attendanceOverview }}</p>
      <template v-else>
        <p>Scheduled: {{ when(record.session.startAt) }} – {{ when(record.session.endAt) }} · {{ timezone }}</p>
        <div class="record-table-wrap">
          <table><thead><tr><th>Participant</th><th>Recorded attendance</th><th>Requirement credit</th><th>First joined / last left</th></tr></thead>
            <tbody><tr v-for="person in record.participants" :key="person.userId">
              <td>{{ person.name }} <small>{{ person.role }}</small></td>
              <td>{{ minutesLabel(person.totalSeconds) }}<small v-if="person.correctionId">Corrected actual time</small><small v-else>Platform record</small></td>
              <td>{{ creditLabel(person) }}</td>
              <td>{{ when(person.firstJoinedAt) }} / {{ when(person.lastLeftAt) }}</td>
            </tr></tbody>
          </table>
        </div>
        <p class="muted">Platform attendance covers time captured in the meeting. Time continued by phone or elsewhere can be recorded with a reason below.</p>
        <details v-if="record.events.length"><summary>Original attendance log ({{ record.events.length }})</summary>
          <ul><li v-for="(event,index) in record.events" :key="index">{{ participantName(event.userId) }} · {{ event.eventType }} · {{ when(event.at) }}</li></ul>
        </details>

        <div v-if="record.canCorrect" class="correction">
          <h4>Correct actual attendance</h4>
          <p>{{ record.canManage ? 'Save corrected time for the selected participants.' : 'Submit your time correction for supervisor review.' }} The original attendance log and scheduled appointment are retained.</p>
          <fieldset><legend>Whose time needs correcting?</legend>
            <label v-for="person in editableParticipants" :key="person.userId" class="check"><input v-model="form.userIds" type="checkbox" :value="Number(person.userId)">{{ person.name }} · {{ person.role }}</label>
          </fieldset>
          <div class="time-fields">
            <label>Actual start<input v-model="form.startAt" type="datetime-local" data-testid="correction-start"></label>
            <label>Actual end<input v-model="form.endAt" type="datetime-local" data-testid="correction-end"></label>
            <label>Minutes attended<input v-model.number="form.minutes" type="number" min="1" max="480" data-testid="correction-minutes"></label>
            <label>How it took place<select v-model="form.modality"><option value="PLATFORM_VIDEO">Platform video</option><option value="PHONE">Phone</option><option value="IN_PERSON">In person</option><option value="EXTERNAL_VIDEO">Other video</option><option value="MIXED">Video and phone / mixed</option></select></label>
          </div>
          <p class="muted">Times are in {{ timezone }}. Exclude breaks from minutes attended; enter the complete total, not additional minutes.</p>
          <label>Reason for correction<textarea v-model="form.reason" rows="2" minlength="10" maxlength="2000" placeholder="For example: continued by phone after the video connection dropped." data-testid="correction-reason" /></label>
          <label class="check"><input v-model="form.attested" type="checkbox" data-testid="correction-attestation">I confirm these are actual attendance times for the selected people.</label>
          <button class="btn btn-primary" type="button" :disabled="busy || !canSubmit" @click="submit">{{ busy ? 'Saving…' : record.canManage ? 'Save time correction' : 'Submit time correction' }}</button>
        </div>
        <div v-if="record.corrections.length" class="correction-history">
          <h4>Time correction history</h4>
          <article v-for="correction in record.corrections" :key="correction.id">
            <strong>{{ participantName(correction.user_id) }} · {{ minutesLabel(correction.total_seconds) }} · {{ correction.status }}</strong>
            <p>{{ when(correction.start_at) }} – {{ when(correction.end_at) }} · {{ correction.modality.replaceAll('_',' ').toLowerCase() }}</p>
            <p>{{ correction.reason }}</p>
            <small>Submitted by {{ correction.requestedByName }} · {{ when(correction.created_at) }}</small>
            <div v-if="record.canManage && correction.status === 'pending'" class="record-actions">
              <button type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="review(correction.id,'approve')">Approve correction</button>
              <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="review(correction.id,'reject')">Reject correction</button>
            </div>
            <p v-if="correction.status === 'approved' && correction.sync_status !== 'complete'">Attendance saved; hours/payroll reconciliation is pending.</p>
          </article>
          <button v-if="canRetry" type="button" class="btn btn-secondary" :disabled="busy" @click="sync">Retry hours/payroll reconciliation</button>
        </div>
      </template>
    </template>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { toZonedDatetimeLocalValue, parseScheduleUtcInstant } from '../../utils/scheduleEventInstants.js';
import { zonedDatetimeLocalToIso } from '../../utils/timezones.js';
import { notifySupervisionHoursChanged } from '../../utils/supervisionHoursRefresh.js';
const props = defineProps({ sessionId: { type: Number, required: true }, timezone: { type: String, default: 'America/Denver' }, compact: Boolean });
const emit = defineEmits(['record','open-attendance','open-notes','changed']);
const record = ref(null), loading = ref(false), busy = ref(false), error = ref(''), notice = ref('');
const newKey = () => globalThis.crypto.randomUUID();
const form = reactive({ userIds: [], startAt:'', endAt:'', minutes:'', modality:'MIXED', reason:'', attested:false, requestKey:newKey() });
const statusLabel = computed(() => ({ FINALIZED:'Completed', MISSED:'No attendance recorded', CANCELLED:'Cancelled', SCHEDULED:'Scheduled', MANUAL_PENDING:'Awaiting approval' })[String(record.value?.session.status).toUpperCase()] || record.value?.session.status);
const editableParticipants = computed(() => (record.value?.participants || []).filter(p => record.value.canManage || Number(p.userId) === record.value.actorUserId));
const attendanceOverview = computed(() => (record.value?.participants || []).map(p => `${p.name}: ${minutesLabel(p.totalSeconds)}`).join(' · '));
const canSubmit = computed(() => form.userIds.length && form.startAt && form.endAt && Number(form.minutes) > 0 && form.reason.trim().length >= 10 && form.attested);
const canRetry = computed(() => record.value?.canManage && record.value.corrections.some(c => c.status === 'approved' && c.sync_status !== 'complete'));
function minutesLabel(seconds) { return seconds == null ? 'No attendance recorded' : `${Math.round(Number(seconds) / 6) / 10} min`; }
function when(value) { const date = parseScheduleUtcInstant(value); return date ? new Intl.DateTimeFormat(undefined,{ timeZone:props.timezone,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit' }).format(date) : '—'; }
function participantName(id) { return record.value?.participants.find(p => Number(p.userId) === Number(id))?.name || 'Participant'; }
function creditLabel(person) {
  if (person.role === 'Supervisor' || (!record.value?.canManage && Number(person.userId) !== Number(record.value?.actorUserId))) return '—';
  const credit = record.value?.hourCredits?.find(c => Number(c.userId) === Number(person.userId));
  if (credit?.countable === false) return credit.effectiveStartDate
    ? `Attendance logged; before the supervision start date (${credit.effectiveStartDate}).`
    : 'Attendance logged; requirement tracking needs a supervision start date.';
  if (credit) return `${credit.individualHours.toFixed(2)} individual · ${credit.groupHours.toFixed(2)} group hrs`;
  if (!(Number(person.totalSeconds) > 0)) return 'No attendance recorded';
  return record.value?.session.status === 'FINALIZED' ? 'Hours reconciliation pending' : 'Calculated when the session is finalized';
}
let loadVersion = 0;
async function load(reset = false) {
  const version = ++loadVersion;
  if (!props.sessionId) return;
  loading.value = true; error.value = '';
  if (reset) { record.value = null; notice.value = ''; }
  try {
    const { data } = await api.get(`/supervision/sessions/${props.sessionId}/record`,{skipGlobalLoading:true});
    if (version !== loadVersion) return;
    record.value = data; emit('record',data);
    if (reset) Object.assign(form,{userIds:[Number(data.actorUserId)].filter(id => data.participants.some(p => Number(p.userId) === id)),startAt:toZonedDatetimeLocalValue(data.session.startAt,props.timezone),endAt:toZonedDatetimeLocalValue(data.session.endAt,props.timezone),minutes:'',reason:'',attested:false,modality:'MIXED',requestKey:newKey()});
  } catch(e) { if (version === loadVersion) error.value = e?.response?.data?.error?.message || 'Unable to load the session record.'; }
  finally { if (version === loadVersion) loading.value = false; }
}
async function save(action, success) {
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const {data} = await action(); await load(); notice.value = data?.message || success;
    notifySupervisionHoursChanged({sessionId:props.sessionId,agencyId:record.value?.session.agencyId});
    emit('changed'); return true;
  }
  catch(e) { error.value = e?.response?.data?.error?.message || e.message || 'Unable to save the correction.'; return false; }
  finally { busy.value = false; }
}
async function submit() {
  if (!canSubmit.value) return;
  const saved = await save(() => api.post(`/supervision/sessions/${props.sessionId}/time-corrections`,{...form,startAt:zonedDatetimeLocalToIso(form.startAt,props.timezone),endAt:zonedDatetimeLocalToIso(form.endAt,props.timezone)}),'Actual attendance updated.');
  if (saved) Object.assign(form,{reason:'',attested:false,requestKey:newKey()});
}
function review(id,decision) { return save(() => api.post(`/supervision/sessions/${props.sessionId}/time-corrections/${id}/review`,{decision}),'Correction reviewed.'); }
function sync() { return save(() => api.post(`/supervision/sessions/${props.sessionId}/time-corrections/sync`),'Hours and payroll reconciliation completed.'); }
watch(() => props.sessionId,() => load(true),{immediate:true});
</script>

<style scoped>
.supervision-record { border:1px solid var(--border-color,#dde5ec);border-radius:14px;padding:16px;margin:12px 0;background:var(--bg-primary,#fff); }
.record-heading,.record-actions { display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap; }
.record-heading span,small,.muted { color:var(--text-secondary,#64748b); }
.record-overview { margin-bottom:0; }
.record-table-wrap { overflow-x:auto; } table { width:100%;border-collapse:collapse;text-align:left; } th,td { padding:10px;border-bottom:1px solid #e2e8f0; } small { display:block;margin-top:4px; }
.correction { margin-top:18px;padding-top:12px;border-top:1px solid #e2e8f0; }
.time-fields { display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:12px; }
label { display:flex;flex-direction:column;gap:6px; } label.check { flex-direction:row;align-items:center;margin:10px 0; }
input:not([type=checkbox]),select,textarea { padding:8px;border:1px solid #cbd5e1;border-radius:6px;width:100%;box-sizing:border-box; }
fieldset { border:1px solid #e2e8f0;border-radius:8px; } article { padding:12px 0;border-bottom:1px solid #e2e8f0; } article p { margin:6px 0; }
.error { color:#b91c1c; } summary { cursor:pointer;margin:10px 0; }
</style>
