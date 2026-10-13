<template>
  <section class="mtcp" data-testid="meeting-time-claims-panel">
    <header class="mtcp__head">
      <div><p class="mtcp__brand">FundThred</p><h4>{{ canManageCompensation ? 'Time & compensation' : 'Time claims' }}</h4></div>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="loading || saving" @click="load">Refresh</button>
    </header>
    <p v-if="error" class="mtcp__error" role="alert">{{ error }}</p>
    <p v-if="success" class="mtcp__success" role="status">{{ success }}</p>
    <p v-if="loading" class="muted" role="status">Loading time claims…</p>
    <p v-else-if="!eligible" class="muted">Compensation is not enabled for this meeting.</p>
    <template v-else>
      <p class="muted">Claims use recorded attendance. Non-salaried attendees of admin meetings default to their Support Activity rate.</p>
      <p v-if="canManageCompensation" class="mtcp__private">Compensation amounts and rate controls in this meeting are visible only to admins and superadmins. Changes apply to this meeting claim only; payroll approval is still required.</p>
      <div v-if="rows.length" class="mtcp__list">
        <article v-for="r in rows" :key="r.userId" class="mtcp__person">
          <header class="mtcp__person-head"><div><h5>{{ r.name }} <span v-if="r.isHost" class="mtcp__host">Host</span></h5><p class="muted">{{ r.compensation?.rateLabel || categoryLabel(r.serviceCode) }}</p></div><span class="mtcp__status">{{ statusLabel(r) }}</span></header>
          <dl class="mtcp__facts">
            <div><dt>Time submitted</dt><dd>{{ formatMins(r.totalMinutes) }} min</dd><small v-if="r.attendanceMinutes != null && r.attendanceMinutes !== r.totalMinutes">Attended {{ formatMins(r.attendanceMinutes) }} min</small></div>
            <template v-if="canManageCompensation && r.compensation">
              <div><dt>Hourly rate</dt><dd>{{ r.compensation.hourlyRate == null ? 'Rate needed' : money(r.compensation.hourlyRate) }}</dd></div>
              <div><dt>{{ r.compensation.appliedAmount != null ? 'Approved amount' : 'Estimated pay' }}</dt><dd>{{ money(r.compensation.appliedAmount ?? r.compensation.estimatedAmount) }}</dd></div>
            </template>
          </dl>
          <p v-if="r.manualPolicy && r.manualPolicy!=='submit'" class="mtcp__note">{{ {existing:'An existing time claim covers this meeting.',covered:'Time was marked already covered; attendance only.',review:'A same-day time claim may already cover this meeting. Payroll review is needed.'}[r.manualPolicy] }}</p>
          <form v-if="canManageCompensation && r.manualPolicy==='review'" class="mtcp__form" @submit.prevent="resolveOverlap(r)"><label>Review outcome<select v-model="overlapReviews[r.userId].action"><option value="covered">Existing pay covers this time</option><option value="submit">This is separate, unpaid time — request missing claim</option></select></label><label>Review note<textarea v-model="overlapReviews[r.userId].note" required minlength="5" maxlength="500" /></label><button class="btn btn-primary" :disabled="saving">Save review</button></form>
          <p v-else-if="r.unpaidIndirect" class="muted">Recorded as unpaid indirect internship hours. No payroll claim is needed.</p>
          <p v-else-if="!r.claimId && (!r.manualPolicy || r.manualPolicy==='submit')" class="muted">{{ r.attendanceMinutes >= 0.5 ? 'No claim yet. Salary status and compensation eligibility may apply.' : 'Awaiting recorded attendance.' }}</p>
          <p v-if="r.compensation?.reason" class="mtcp__note"><strong>Adjustment:</strong> {{ r.compensation.reason }}</p>
          <div v-if="canEdit && !r.unpaidIndirect && r.claimId && canEditClaim(r)" class="mtcp__actions">
            <button type="button" class="btn btn-secondary btn-sm" :disabled="saving" @click="startEdit(r)">Edit time</button>
            <button v-if="canManageCompensation" type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="startRateEdit(r)">Change compensation</button>
          </div>
          <p v-else-if="canManageCompensation && r.claimId" class="muted">Approved or paid claims are locked. Use a payroll correction for changes.</p>
          <form v-if="canEdit && editingId === r.claimId && r.claimId" class="mtcp__form" @submit.prevent="save(r)">
            <label>Minutes to submit<input v-model.number="editMinutes" type="number" min="0.5" step="0.01" required /></label>
            <div class="mtcp__actions"><button type="submit" class="btn btn-primary btn-sm" :disabled="saving">Save time</button><button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="cancelEdit">Cancel</button></div>
          </form>
          <form v-if="canManageCompensation && rateEditingId === r.claimId && r.claimId" class="mtcp__form" @submit.prevent="saveRate(r)">
            <label>Pay category<select v-model="rateType"><option value="default">Meeting default</option><option value="support_activity">Support Activity</option><option value="admin_time">Administrative time</option><option value="indirect">Indirect time</option><option value="custom">Custom hourly rate</option></select></label>
            <label v-if="rateType === 'custom'">Hourly rate ($)<input v-model.number="customRate" type="number" min="0.01" max="10000" step="0.01" required /></label>
            <label class="mtcp__wide">Reason for this adjustment<textarea v-model="rateReason" maxlength="500" rows="2" required placeholder="Explain the agreed duties or rate for this meeting" /></label>
            <p class="muted mtcp__wide">Assigned categories use the employee’s rate effective on the meeting date. A custom rate changes only this claim.</p>
            <div class="mtcp__actions mtcp__wide"><button type="submit" class="btn btn-primary btn-sm" :disabled="saving">{{ saving ? 'Saving…' : 'Save compensation' }}</button><button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="cancelEdit">Cancel</button></div>
          </form>
        </article>
      </div>
      <p v-else class="muted">No attendees yet.</p>
    </template>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ eventId: { type: [Number, String], required: true } });
const loading = ref(false), saving = ref(false), error = ref(''), success = ref('');
const rows = ref([]), canEdit = ref(false), canManageCompensation = ref(false), eligible = ref(true);
const editingId = ref(0), editMinutes = ref(0), rateEditingId = ref(0), rateType = ref('default'), customRate = ref(null), rateReason = ref('');
const overlapReviews=ref({});
async function resolveOverlap(row){saving.value=true;error.value='';try{await api.post(`/team-meetings/${props.eventId}/manual-log/${row.userId}/resolve`,overlapReviews.value[row.userId]);overlapReviews.value[row.userId]={action:'covered',note:''};success.value='Review saved. Missing time, if requested, still requires payroll approval.';await load();}catch(e){error.value=e?.response?.data?.error?.message || 'Could not save review.';}finally{saving.value=false;}}
let requestId = 0;
const money = value => value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));
const formatMins = value => Number.isFinite(Number(value)) ? String(Math.round(Number(value) * 100) / 100) : '0';
const humanize = value => String(value || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const categoryLabel = code => ({ MEETING: 'Support Activity', 'Admin Time': 'Administrative time', INDIRECT: 'Indirect time' })[code] || humanize(code) || 'Support Activity';
const statusLabel = row => row.unpaidIndirect ? 'Unpaid indirect hours' : row.status ? humanize(row.status) : row.attendanceMinutes >= 0.5 ? 'No claim' : 'No time recorded';
const canEditClaim = row => ['submitted', 'deferred', 'rejected', 'withdrawn', 'needs_changes'].includes(String(row.status || '').toLowerCase());
async function load() {
  const eid = Number(props.eventId), id = ++requestId;
  if (!eid) return;
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get(`/team-meetings/${eid}/time-claims`, { skipGlobalLoading: true });
    if (id !== requestId) return;
    eligible.value = data?.eligible !== false;
    canEdit.value = !!data?.canEdit;
    canManageCompensation.value = !!data?.canManageCompensation;
    rows.value = Array.isArray(data?.rows) ? data.rows : [];
    for(const row of rows.value) if(row.manualPolicy==='review' && !overlapReviews.value[row.userId]) overlapReviews.value[row.userId]={action:'covered',note:''};
  } catch (e) {
    if (id === requestId) error.value = e?.response?.data?.error?.message || 'Could not load time claims. Try Refresh.';
  } finally { if (id === requestId) loading.value = false; }
}
function cancelEdit() { editingId.value = 0; rateEditingId.value = 0; }
function startEdit(row) { cancelEdit(); success.value = ''; editingId.value = row.claimId; editMinutes.value = Number(row.totalMinutes ?? row.attendanceMinutes ?? 0); }
function startRateEdit(row) { cancelEdit(); success.value = ''; rateEditingId.value = row.claimId; rateType.value = row.compensation?.rateType || 'default'; customRate.value = row.compensation?.hourlyRate ?? null; rateReason.value = ''; }
async function save(row) {
  saving.value = true; error.value = ''; success.value = '';
  try {
    await api.patch(`/team-meetings/${props.eventId}/time-claims/${row.claimId}`, { totalMinutes: Number(editMinutes.value) }, { skipGlobalLoading: true });
    cancelEdit(); await load(); success.value = 'Time saved and submitted for payroll review.';
  } catch (e) { error.value = e?.response?.data?.error?.message || 'Could not save time.'; }
  finally { saving.value = false; }
}
async function saveRate(row) {
  saving.value = true; error.value = ''; success.value = '';
  try {
    await api.patch(`/team-meetings/${props.eventId}/time-claims/${row.claimId}/rate`, { rateType: rateType.value, hourlyRate: customRate.value, reason: rateReason.value.trim() }, { skipGlobalLoading: true });
    cancelEdit(); await load(); success.value = 'Compensation saved and submitted for payroll review.';
  } catch (e) { error.value = e?.response?.data?.error?.message || 'Could not save compensation.'; }
  finally { saving.value = false; }
}
watch(() => props.eventId, () => { cancelEdit(); success.value = ''; rows.value = []; canManageCompensation.value = false; load(); }, { immediate: true });
defineExpose({ load });
</script>

<style scoped>
.mtcp{display:flex;flex-direction:column;gap:12px;color:#173747;min-width:0}.mtcp__head,.mtcp__person-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.mtcp__brand{margin:0;font-size:11px;color:#087b78;font-weight:800;letter-spacing:.06em}.mtcp h4{margin:4px 0;font-size:18px}.mtcp__private{margin:0;padding:12px;border-radius:10px;background:#edf6f7;color:#35546a;font-size:12px;line-height:1.5}.mtcp__list{display:grid;gap:12px}.mtcp__person{border:1px solid #dce6eb;border-radius:14px;padding:16px;background:#fff;min-width:0}.mtcp h5{font-size:15px;margin:0 0 4px}.mtcp__host{font-size:10px;color:#157769;margin-left:6px}.mtcp__status{font-size:11px;background:#edf4f6;border-radius:20px;padding:5px 9px;white-space:nowrap}.mtcp__facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}.mtcp dt,.mtcp small{font-size:11px;color:#657887}.mtcp dd{font-size:19px;font-weight:700;margin:4px 0;color:#163e4d}.mtcp__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.mtcp__form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;background:#f5f9fa;border-radius:12px;padding:14px;margin-top:14px}.mtcp label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:650}.mtcp input,.mtcp select,.mtcp textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid #b8ccd7;border-radius:8px;padding:10px;background:#fff;color:#173747;font:inherit}.mtcp__wide{grid-column:1/-1}.mtcp__note{font-size:12px;color:#496474;overflow-wrap:anywhere}.mtcp__error{background:#fef2f2;color:#b91c1c;padding:10px;border-radius:8px;margin:0}.mtcp__success{background:#e8f7ee;color:#176b47;padding:10px;border-radius:8px;margin:0}.muted{color:#64748b;margin:0;font-size:12px;line-height:1.5}.mtcp button{white-space:normal}.mtcp :is(input,select,textarea,button):focus-visible{outline:2px solid #16877f;outline-offset:2px}@media(max-width:520px){.mtcp__person{padding:12px}.mtcp__person-head{align-items:flex-start;flex-wrap:wrap}.mtcp__facts{grid-template-columns:repeat(2,minmax(0,1fr))}.mtcp__form{grid-template-columns:1fr}.mtcp__actions button{flex:1}.mtcp dd{font-size:17px}}
</style>
