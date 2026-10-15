<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
const props = defineProps({ providerId: { type: Number, required: true }, agencyId: Number, agencyOptions: { type: Array, default: () => [] }, date: { type: String, required: true } });
const emit = defineEmits(['close', 'saved']);
const dialog = ref(null), busy = ref(false), error = ref(''), plan = ref(null), signed = ref(false);
const resumeChecked = ref(false), applyAttempted = ref(false);
const clientFacingReason = ref(''), internalReason = ref(''), followUpAction = ref('client_contact_support'), followUpMessage = ref('');
const notificationMode = ref('send'), suppressionReason = ref('');
const agencies = computed(() => {
  const rows = props.agencyOptions.map(a => ({ id: Number(a.id ?? a.value), label: a.label || a.name || `Agency ${a.id}` })).filter(a => a.id > 0);
  return rows.length ? rows : [{ id: props.agencyId, label: 'Current agency' }];
});
const selected = ref(agencies.value.map(a => a.id));
const changed = computed(() => plan.value && plan.value.status !== 'preview');
const finished = computed(() => ['completed', 'partial'].includes(plan.value?.status));
const queuedNotices = computed(() => Object.values(plan.value?.results || {}).reduce((sum, r) => sum + Number(r.notificationDelivery?.pending || 0), 0));
const deliveryWarnings = computed(() => Object.values(plan.value?.results || {}).reduce((sum, r) => sum + Number(r.notificationDelivery?.failed || 0) + Number(r.notificationDelivery?.held || 0) + Number(r.notificationDelivery?.skipped || 0), 0));
const base = computed(() => `/availability/providers/${props.providerId}/day-cancellation`);
onMounted(async () => {
  dialog.value?.showModal(); busy.value = true;
  try {
    const previous = (await api.get(base.value, { params: { date: props.date }, skipGlobalLoading: true })).data?.review;
    if (previous) { plan.value = previous; signed.value = true; followUpAction.value = previous.followUpAction; followUpMessage.value = previous.followUpMessage; notificationMode.value = previous.notificationMode || 'send'; }
    resumeChecked.value = true;
  } catch { error.value = 'Could not check for an interrupted cancellation. Close and reopen this review before proceeding.'; }
  finally { busy.value = false; }
});
function close() { if (busy.value) return; if (changed.value || applyAttempted.value) emit('saved'); emit('close'); }
function when(item) { return item.startAt ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: item.timeZone }).format(new Date(item.startAt)) : ''; }
async function review() {
  busy.value = true; error.value = '';
  try { plan.value = (await api.post(`${base.value}/preview`, { agencyIds: selected.value, date: props.date, clientFacingReason: clientFacingReason.value, internalReason: internalReason.value, notificationMode: notificationMode.value, suppressionReason: suppressionReason.value, followUpAction: followUpAction.value, followUpMessage: followUpMessage.value }, { skipGlobalLoading: true })).data; signed.value = false; }
  catch (e) { error.value = e.response?.data?.error?.message || 'Could not review this day. Please try again.'; }
  finally { busy.value = false; }
}
async function apply(retryFailed = false) {
  busy.value = true; error.value = ''; applyAttempted.value = true;
  try {
    do {
      plan.value = (await api.post(`${base.value}/${plan.value.token}/apply`, { signatureConfirmed: signed.value, retryFailed }, { skipGlobalLoading: true })).data;
      retryFailed = false;
    } while (plan.value.status === 'processing');
  } catch (e) { error.value = e.response?.data?.error?.message || 'Processing was interrupted. Use Continue to resume this reviewed cancellation safely.'; }
  finally { busy.value = false; }
}
</script>

<template>
  <dialog ref="dialog" class="cancel-day-dialog" aria-labelledby="cancel-day-title" @cancel.prevent="close" @click="($event.target === dialog) && close()">
    <header><div><h2 id="cancel-day-title">Cancel provider’s day</h2><p>{{ date }}</p></div><button type="button" :disabled="busy" aria-label="Close" @click="close">×</button></header>
    <div class="cancel-day-body">
      <p>Review the day before notifying clients and meeting participants. Only this date is affected; recurring appointments on other dates stay scheduled.</p>
      <p class="day-scope-note">This adds an all-day unavailable block across the provider’s calendars. Appointments and hosted meetings are canceled only in the agencies selected below. Standalone room reservations stay booked; rooms linked to canceled client appointments follow the session cancellation flow. School assignments, external events, and meetings hosted by someone else need a separate review or RSVP.</p>
      <p v-if="error" role="alert" class="day-error">{{ error }}</p>
      <template v-if="!plan">
        <fieldset><legend>Agencies to review</legend><label v-for="a in agencies" :key="a.id"><input v-model="selected" type="checkbox" :value="a.id"> {{ a.label }}</label></fieldset>
        <label class="day-field">Notifications <select v-model="notificationMode"><option value="send">Send cancellation notifications</option><option value="none">Do not send email or text to clients or meeting participants</option></select></label>
        <label v-if="notificationMode === 'none'" class="day-field">Why no notifications? (internal record) <textarea v-model="suppressionReason" maxlength="500" rows="2" /></label>
        <p v-if="notificationMode === 'none'">Cancellations still appear in schedules and portal history. The choice not to notify is recorded with your signature.</p>
        <label class="day-field">Reason saved with the cancellation and shared with clients <textarea v-model="clientFacingReason" maxlength="500" rows="3" placeholder="For example: Your provider is unavailable due to an unexpected schedule change." /></label>
        <label class="day-field">Internal note (not included in the cancellation message) <textarea v-model="internalReason" maxlength="2000" rows="2" /></label>
        <label class="day-field">Follow-up <select v-model="followUpAction"><option value="keep_next_or_support">Keep each client’s next appointment; contact support only if none is scheduled</option><option value="client_contact_support">Ask the client to contact support to reschedule</option><option value="none">No rescheduling instruction</option></select></label>
        <label class="day-field">Additional message to clients (optional) <textarea v-model="followUpMessage" maxlength="1000" rows="2" /></label>
      </template>
      <template v-else>
        <div class="day-review"><strong>{{ plan.notificationMode === 'none' ? 'Cancellation recorded without email or text' : 'Cancellation reason sent to recipients' }}</strong><p>{{ plan.clientFacingReason }}</p><p v-if="followUpAction === 'client_contact_support'">Clients will be asked to contact support to arrange another appointment.</p><p v-if="followUpAction === 'keep_next_or_support'">Each client will be told their next appointment after this day. If none is scheduled, they will be asked to contact support.</p><p v-if="followUpMessage">{{ followUpMessage }}</p></div>
        <p v-for="scope in plan.scopes" :key="scope.agencyId" class="day-zone">{{ agencies.find(a => a.id === scope.agencyId)?.label }} · {{ scope.timeZone }}</p>
        <h3>{{ plan.items.length }} items to update</h3>
        <p v-if="!plan.items.length">No cancelable appointments, hosted meetings, or published openings were found. Confirming will still mark this day unavailable.</p>
        <ul class="day-items"><li v-for="item in plan.items" :key="item.key"><div><strong>{{ when(item) }} · {{ item.title }}</strong><span v-if="item.recipients?.length">{{ item.recipients.join(', ') }}</span><span>{{ item.kind === 'appointment' ? 'Client cancellation + signed nonbillable note' : ['meeting','supervision'].includes(item.kind) ? plan.notificationMode === 'none' ? 'Cancel this occurrence without sending a notice' : 'Cancel this occurrence + notify participants' : 'Remove this opening only' }}</span></div><span v-if="plan.results[item.key]" :class="{ 'day-error': plan.results[item.key].status === 'failed' }">{{ plan.results[item.key].status === 'completed' ? 'Updated' : plan.results[item.key].message }}</span><details v-if="item.note"><summary>Review session note</summary><p>{{ item.note }}</p></details></li></ul>
        <template v-if="plan.unchanged.length"><h3>Not changed</h3><ul><li v-for="item in plan.unchanged" :key="item.key">{{ when(item) }} · {{ item.title }} — {{ item.detail }}</li></ul></template>
        <p>Provider-initiated cancellations do not add a client late-cancellation fee or attendance strike. Existing sessions and records remain in the history.</p>
        <label v-if="!changed" class="day-signature"><input v-model="signed" type="checkbox"> I reviewed the reason, session notes, and notification choice and authorize these cancellations.</label>
        <p v-if="busy" role="status">Updating {{ Object.keys(plan.results || {}).length }} of {{ plan.items.length }} items. Please keep this window open.</p>
        <p v-if="finished" role="status">{{ plan.status === 'completed' ? 'The day is marked unavailable and the listed items were updated.' : 'The day is marked unavailable. Some items still need attention below.' }}</p>
        <p v-if="queuedNotices" role="status">{{ queuedNotices }} schedule updates are queued to combine any corrections before sending. Check each session’s Communications tab for timing and delivery status.</p>
        <p v-if="deliveryWarnings" class="day-error" role="alert">{{ deliveryWarnings }} notifications need attention. Review delivery status in each session’s Communications tab; some contacts may require manual follow-up.</p>
      </template>
    </div>
    <footer>
      <button type="button" :disabled="busy" @click="close">{{ changed ? 'Done' : 'Close' }}</button>
      <button v-if="!plan" type="button" class="day-primary" :disabled="busy || !resumeChecked || !selected.length || !clientFacingReason.trim() || (notificationMode === 'none' && !suppressionReason.trim())" @click="review">Review day</button>
      <template v-else-if="!finished"><button v-if="!changed" type="button" :disabled="busy" @click="plan = null">Back</button><button type="button" class="day-danger" :disabled="busy || !signed" @click="apply()">{{ changed || error ? 'Continue' : 'Confirm cancellation' }}</button></template>
      <button v-else-if="plan.status === 'partial'" type="button" class="day-primary" :disabled="busy" @click="apply(true)">Retry failed items</button>
    </footer>
  </dialog>
</template>

<style scoped>
.cancel-day-dialog{width:min(740px,calc(100vw - 24px));max-height:90dvh;border:1px solid #dce2eb;border-radius:16px;padding:0;color:#182438;background:#fff;box-shadow:0 20px 80px #17243c40}.cancel-day-dialog::backdrop{background:#18243880}.cancel-day-dialog header,.cancel-day-dialog footer{display:flex;align-items:center;gap:12px;padding:16px 20px;background:#f8fafc}.cancel-day-dialog header{justify-content:space-between;border-bottom:1px solid #dce2eb}.cancel-day-dialog h2,.cancel-day-dialog header p{margin:0}.cancel-day-dialog footer{justify-content:flex-end;border-top:1px solid #dce2eb}.cancel-day-body{padding:0 20px 20px;max-height:calc(90dvh - 160px);overflow:auto}.cancel-day-dialog button{padding:9px 14px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:inherit;cursor:pointer}.cancel-day-dialog button:disabled{opacity:.55;cursor:wait}.day-field{display:grid;gap:6px;margin:16px 0}.day-field textarea,.day-field select{font:inherit;width:100%;box-sizing:border-box;border:1px solid #b6c2d2;border-radius:8px;padding:9px}.cancel-day-dialog fieldset{border:1px solid #dce2eb;border-radius:8px;display:flex;flex-wrap:wrap;gap:14px}.day-scope-note,.day-zone{font-size:13px;color:#526075}.day-review{padding:12px;background:#f0f7ff;border-radius:8px}.day-items{padding:0;list-style:none}.day-items li{padding:12px 0;border-bottom:1px solid #e2e8f0}.day-items li div{display:grid;gap:4px}.day-items li span{font-size:13px}.day-error{color:#a12828}.day-signature{display:flex;gap:8px;align-items:flex-start}.cancel-day-dialog .day-danger{background:#a12828;color:white;border-color:#a12828}.cancel-day-dialog .day-primary{background:#185c3b;color:white;border-color:#185c3b}
</style>
