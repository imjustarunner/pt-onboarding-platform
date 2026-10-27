<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import ReplacementOpeningBuilder from './ReplacementOpeningBuilder.vue';
const props = defineProps({ deferredToken: String, providerId: { type: Number, required: true }, agencyId: Number, agencyOptions: { type: Array, default: () => [] }, date: { type: String, required: true } });
const emit = defineEmits(['close', 'saved']);
const dialog = ref(null), busy = ref(false), error = ref(''), plan = ref(null), signed = ref(false), reviewed = ref(false);
const resumeChecked = ref(false), applyAttempted = ref(false);
const reasonCategory = ref('provider_unavailable'), followupOwner = ref('provider'), internalReason = ref(''), followUpAction = ref('client_contact_support'), followUpMessage = ref('');
const notificationMode = ref('send'), suppressionReason = ref('');
const dates = ref([props.date]), addDate = ref(''), scopeMode = ref('days'), selectedSessions = ref([]);
const draftPlan = ref(null);
const contactChoices = reactive({}), messages = reactive({}), schoolChoices = reactive({});
const offerDays = ref(2), offeredSlots = ref([]), slotOptions = ref([]), slotBusy = ref(false);
const pendingOfficeRequests = ref([]);
const agencies = computed(() => {
  const rows = props.agencyOptions.map(a => ({ id: Number(a.id ?? a.value), label: a.label || a.name || `Agency ${a.id}` })).filter(a => a.id > 0);
  return rows.length ? rows : [{ id: props.agencyId, label: 'Current agency' }];
});
const selected = ref(agencies.value.map(a => a.id));
const changed = computed(() => plan.value && plan.value.status !== 'preview');
const finished = computed(() => ['completed', 'partial'].includes(plan.value?.status));
const appointmentItems = computed(() => (plan.value?.items || []).filter(i => i.kind === 'appointment'));
const anchor = computed(() => appointmentItems.value.find(i => scopeMode.value === 'days' || selectedSessions.value.includes(i.id)));
const clients = computed(() => [...new Map(appointmentItems.value.filter(i => scopeMode.value === 'days' || selectedSessions.value.includes(i.id)).flatMap(i => i.clients || []).map(c => [c.clientId, c])).values()]);
const queuedNotices = computed(() => Object.values(plan.value?.results || {}).reduce((sum, r) => sum + Number(r.notificationDelivery?.pending || 0), 0));
const deliveryWarnings = computed(() => Object.values(plan.value?.results || {}).reduce((sum, r) => sum + Number(r.notificationDelivery?.failed || 0) + Number(r.notificationDelivery?.held || 0) + Number(r.notificationDelivery?.skipped || 0), 0));
const base = computed(() => `/availability/providers/${props.providerId}/day-cancellation`);
onMounted(async () => {
  dialog.value?.showModal(); busy.value = true;
  try {
    if (props.deferredToken) { resumeChecked.value = true; notificationMode.value = 'send'; await review(false); return; }
    const previous = (await api.get(base.value, { params: { date: props.date }, skipGlobalLoading: true })).data?.review;
    if (previous) { plan.value = previous; signed.value = true; reviewed.value = true; followUpAction.value = previous.followUpAction; followUpMessage.value = previous.followUpMessage; notificationMode.value = previous.notificationMode || 'send'; scopeMode.value = previous.scopeMode || 'days'; }
    resumeChecked.value = true;
  } catch { error.value = 'Could not check for an interrupted cancellation. Close and reopen this review before proceeding.'; }
  finally { busy.value = false; }
});
function close() { if (busy.value) return; if (changed.value || applyAttempted.value) emit('saved'); emit('close'); }
function when(item) { return item.startAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: item.timeZone }).format(new Date(item.startAt)) : ''; }
watch(scopeMode, mode => { for (const item of Object.values(schoolChoices)) item.message.text = mode === 'sessions' ? item.message.text.replace('has canceled their sessions', 'has canceled selected sessions') : item.message.text.replace('has canceled selected sessions', 'has canceled their sessions'); });
function addDay() { if (addDate.value && !dates.value.includes(addDate.value) && dates.value.length < 14) dates.value = [...dates.value, addDate.value].sort(); addDate.value = ''; }
function initializeEditors() {
  selectedSessions.value = appointmentItems.value.map(i => i.id);
  for (const item of plan.value.items) {
    if (item.kind === 'school') schoolChoices[item.key] = { recipients: [...item.recipients], message: { ...item.message } };
    else if (item.message) messages[item.key] = { ...item.message };
    for (const c of item.clients || []) contactChoices[c.clientId] = { mode: c.mode, channels: [...c.channels], recipients: c.contacts.map(r => ({ ...r, enabled: true })) };
  }
}
async function review(finalReview = false) {
  busy.value = true; error.value = '';
  try {
    const body = { agencyIds: selected.value, date: props.date, dates: dates.value, scopeMode: finalReview ? scopeMode.value : 'days', appointmentIds: selectedSessions.value,
      deferredToken: props.deferredToken, reasonCategory: reasonCategory.value, followupOwner: followupOwner.value, internalReason: internalReason.value, notificationMode: notificationMode.value, suppressionReason: suppressionReason.value,
      followUpAction: followUpAction.value, followUpMessage: followUpMessage.value, offerDays: offerDays.value, offeredSlots: offeredSlots.value,
      messagesReviewed: finalReview, ...(finalReview ? { contactChoices, messages, schoolChoices } : {}) };
    plan.value = (await api.post(`${base.value}/preview`, body, { skipGlobalLoading: true })).data;
    if (props.deferredToken) { dates.value = plan.value.dates || [props.date]; scopeMode.value = plan.value.scopeMode || 'days'; }
    reviewed.value = finalReview; signed.value = false;
    if (!finalReview) { initializeEditors(); draftPlan.value = plan.value; }
  } catch (e) { error.value = e.response?.data?.error?.message || 'Could not review these cancellations. Please try again.'; }
  finally { busy.value = false; }
}
function toggleSlot(slot) {
  const found = offeredSlots.value.some(s => s.key === slot.key);
  if (found) offeredSlots.value = offeredSlots.value.filter(s => s.key !== slot.key);
  else if (offeredSlots.value.length < 24) offeredSlots.value.push(slot);
}
async function loadSlots() {
  if (!anchor.value) return;
  slotBusy.value = true; error.value = '';
  try { const { data } = await api.get(`/appointments/${anchor.value.id}/change/replacement-options`, { params: { slots: true }, skipGlobalLoading: true }); slotOptions.value = [...new Map([...(data.alreadyOffered || []), ...(data.slots || [])].map(s => [s.key, s])).values()]; }
  catch (e) { error.value = e.response?.data?.error?.message || 'Could not load replacement times.'; } finally { slotBusy.value = false; }
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
    <header><div><h2 id="cancel-day-title">{{ deferredToken ? 'Review deferred cancellation emails' : 'Cancel and offer replacement times' }}</h2><p>{{ dates.join(', ') }}</p></div><button type="button" :disabled="busy" aria-label="Close" @click="close">×</button></header>
    <div class="cancel-day-body">
      <p v-if="deferredToken">These sessions are already canceled. Review the recipients and email messages, then approve sending them.</p><p v-else>Choose dates or individual sessions, then review recipients, messages, replacement times, and session notes before confirming.</p>
      <p v-if="!deferredToken" class="day-scope-note">Canceling whole days marks those days unavailable across the provider’s calendars. Canceling selected sessions leaves the rest of the day available. Other recurring dates remain scheduled. School assignments remain in place; assigned schools receive a separate reviewed email.</p>
      <p v-if="error" role="alert" class="day-error">{{ error }}</p>
      <template v-if="!plan">
        <fieldset><legend>Agencies to review</legend><label v-for="a in agencies" :key="a.id"><input v-model="selected" type="checkbox" :value="a.id"> {{ a.label }}</label></fieldset>
        <label class="day-field">Add another date <input v-model="addDate" type="date"></label><button type="button" :disabled="!addDate || dates.length >= 14" @click="addDay">Add date</button>
        <p v-for="date in dates" :key="date">{{ date }} <button v-if="dates.length > 1" type="button" @click="dates = dates.filter(d => d !== date)">Remove date</button></p>
        <label class="day-field">Notifications <select v-model="notificationMode"><option value="send">Review and send cancellation notifications</option><option value="none">Do not send now — create a to-do</option></select></label>
        <label v-if="notificationMode === 'none'" class="day-field">Follow-up note (internal record) <textarea v-model="suppressionReason" maxlength="500" rows="2" /></label>
        <label v-if="notificationMode === 'none'" class="day-field">Assign email review to <select v-model="followupOwner"><option value="provider">The provider</option><option value="support">Support</option></select></label>
        <label class="day-field">Cancellation category shared with recipients <select v-model="reasonCategory"><option value="provider_unavailable">Provider availability</option><option value="illness">Health-related absence</option><option value="personal">Personal circumstances</option><option value="weather">Weather conditions</option><option value="emergency">Emergency</option><option value="facility">Facility closure</option><option value="scheduling">Scheduling change</option></select></label>
        <label class="day-field">Internal note (not included in email or text) <textarea v-model="internalReason" maxlength="2000" rows="2" /></label>
        <label class="day-field">Follow-up <select v-model="followUpAction"><option value="keep_next_or_support">Keep the next appointment; contact support if none is scheduled</option><option value="client_contact_support">Ask the client to contact support to reschedule</option><option value="none">No rescheduling instruction</option></select></label>
        <label class="day-field">Additional message (optional) <textarea v-model="followUpMessage" maxlength="1000" rows="2" /></label>
      </template>
      <template v-else>
        <div class="day-review"><strong>Shared cancellation category</strong><p>{{ plan.clientFacingReason }}</p><p v-if="plan.followUpMessage">{{ plan.followUpMessage }}</p><p v-if="plan.notificationMode === 'none'">No email or text will be sent now. A to-do will be created to review and approve the deferred emails.</p></div>
        <template v-if="!reviewed && !changed">
          <label v-if="!deferredToken" class="day-field">Cancel <select v-model="scopeMode"><option value="days">All impacted sessions and hosted meetings on these days</option><option value="sessions">Only the sessions I select</option></select></label>
          <fieldset v-if="!deferredToken && scopeMode === 'sessions'"><legend>Sessions to cancel</legend><label v-for="item in appointmentItems" :key="item.key"><input v-model="selectedSessions" type="checkbox" :value="item.id">{{ when(item) }} · {{ item.recipients.join(', ') }}</label></fieldset>
          <template v-if="notificationMode === 'send'">
            <h3>Family recipients</h3>
            <fieldset v-for="client in clients" :key="client.clientId" class="day-contact"><legend>{{ client.clientName }}</legend>
              <label>Contact <select v-model="contactChoices[client.clientId].mode"><option value="client">Client</option><option value="guardian">Guardian</option><option value="both">Both</option><option value="none">No contact</option></select></label>
              <label><input v-model="contactChoices[client.clientId].channels" type="checkbox" value="email"> Email</label><label><input v-model="contactChoices[client.clientId].channels" type="checkbox" value="sms"> Text</label>
              <div v-for="recipient in contactChoices[client.clientId].recipients.filter(r => contactChoices[client.clientId].mode === 'both' || r.role === contactChoices[client.clientId].mode)" :key="recipient.key" class="day-recipient">
                <label><input v-model="recipient.enabled" type="checkbox"> {{ recipient.name }} · {{ recipient.role }}</label>
                <label v-if="contactChoices[client.clientId].channels.includes('email')">Email <input v-model="recipient.email" type="email" :aria-label="`${recipient.name} email`"></label>
                <label v-if="contactChoices[client.clientId].channels.includes('sms')">Phone <input v-model="recipient.phone" type="tel" :aria-label="`${recipient.name} phone`"></label>
              </div>
            </fieldset>
            <p>Contact edits apply to this cancellation. Texts require recorded consent; recipient preferences are checked again before delivery.</p>
            <label v-if="!deferredToken" class="day-field">Rescheduling <select v-model="followUpAction"><option value="private_slots">Offer shared private replacement times</option><option value="keep_next_or_support">Keep the next appointment; contact support if none is scheduled</option><option value="client_contact_support">Ask clients to contact support</option><option value="none">No rescheduling instruction</option></select></label>
            <section v-if="followUpAction === 'private_slots'">
              <p class="day-review"><strong>Offer only times you can commit to.</strong> When a client or guardian reserves a time, it becomes a scheduled appointment automatically. If you later need to adjust your schedule or close gaps, change the booked appointment and notify the family through My Schedule.</p><h3>Private replacement times</h3><p>Only the clients selected above can use these times. The first completed reservation schedules the appointment immediately; no additional approval is required. Lengths must be compatible with each selected session’s service or package. Times use {{ anchor?.timeZone }}.</p>
              <label class="day-field">Offer expires after <select v-model.number="offerDays"><option v-for="days in [1,2,3,7,14]" :key="days" :value="days">{{ days }} day(s)</option></select></label>
              <ReplacementOpeningBuilder v-model="offeredSlots" v-model:pending-requests="pendingOfficeRequests" :appointment-id="anchor?.id" :time-zone="anchor?.timeZone" @busy="slotBusy = $event" />
              <button type="button" :disabled="slotBusy || !anchor" @click="loadSlots">Find existing openings</button>
              <label v-for="slot in slotOptions" :key="slot.key" class="day-field"><span><input type="checkbox" :checked="offeredSlots.some(s => s.key === slot.key)" :disabled="slot.requested || (offeredSlots.length >= 24 && !offeredSlots.some(s => s.key === slot.key))" @change="toggleSlot(slot)"> {{ slot.label }}</span></label>
              <p v-for="slot in offeredSlots" :key="slot.key">{{ slot.label }} <button type="button" @click="toggleSlot(slot)">Remove time</button></p>
            </section>
            <h3>Review and edit emails</h3><p>Emails use your organization’s branding and notifications@ address. Replies go to support@. Only the cancellation category is included; internal notes stay private.</p><p>Each message is sent separately. Current reschedule options, the response deadline, the next scheduled session, and a secure portal link are added to family emails. Text: “Your appointment schedule has been updated. Please review the latest details in your secure portal,” followed by the secure link.</p>
            <template v-for="item in plan.items" :key="item.key">
              <fieldset v-if="item.kind === 'school'" class="day-contact"><legend>{{ item.title }}</legend>
                <div v-for="(_, i) in schoolChoices[item.key].recipients" :key="i" class="day-recipient"><label>School email <input v-model="schoolChoices[item.key].recipients[i]" type="email"></label><button type="button" @click="schoolChoices[item.key].recipients.splice(i, 1)">Remove recipient</button></div>
                <button type="button" @click="schoolChoices[item.key].recipients.push('')">Add school recipient</button>
                <label class="day-field">Subject <input v-model="schoolChoices[item.key].message.subject" maxlength="200"></label><label class="day-field">Message <textarea v-model="schoolChoices[item.key].message.text" rows="5" maxlength="6000" /></label>
              </fieldset>
              <fieldset v-else-if="item.message && (scopeMode === 'days' || selectedSessions.includes(item.id))" class="day-contact"><legend>{{ item.recipients.join(', ') }} · {{ when(item) }}</legend><label class="day-field">Subject <input v-model="messages[item.key].subject" maxlength="200"></label><label class="day-field">Message <textarea v-model="messages[item.key].text" rows="5" maxlength="6000" /></label></fieldset>
            </template>
          </template>
        </template>
        <template v-else>
          <p v-for="scope in plan.scopes" :key="`${scope.agencyId}:${scope.date}`" class="day-zone">{{ agencies.find(a => a.id === scope.agencyId)?.label }} · {{ scope.date }} · {{ scope.timeZone }}</p>
          <p v-if="plan.followUpAction === 'private_slots'" class="day-review"><strong>These times are a commitment.</strong> A client’s reservation schedules the appointment immediately. Offer only times you can honor; make any later changes through My Schedule and notify the family.</p>
          <h3>{{ plan.items.length }} {{ deferredToken ? 'email notices to review' : 'items to update' }}</h3>
          <p v-if="!plan.items.length && deferredToken">No family or school notices remain for this review.</p>
          <p v-else-if="!plan.items.length">No cancelable appointments, hosted meetings, or published openings were found. Confirming will still mark these days unavailable.</p>
          <ul class="day-items"><li v-for="item in plan.items" :key="item.key"><div><strong>{{ when(item) }} · {{ item.title }}</strong><span v-if="item.recipients?.length">{{ item.recipients.join(', ') }}</span>
            <p v-for="client in item.clients || []" :key="client.clientId">{{ client.clientName }}: {{ client.mode }} · {{ client.channels.join(' + ') }}<span v-for="r in client.recipients" :key="r.key"> · {{ r.name }} {{ client.channels.includes('email') ? r.email : '' }} {{ client.channels.includes('sms') ? r.phone : '' }}</span></p>
            <span>{{ deferredToken ? 'Cancellation email notice' : item.kind === 'appointment' ? 'Client cancellation + signed nonbillable note' : item.kind === 'school' ? 'School email' : ['meeting','supervision'].includes(item.kind) ? plan.notificationMode === 'none' ? 'Cancel without a notice' : 'Cancel + notify participants' : 'Remove this opening only' }}</span></div>
            <span v-if="plan.results[item.key]" :class="{ 'day-error': plan.results[item.key].status === 'failed' }">{{ plan.results[item.key].status === 'completed' ? 'Updated' : plan.results[item.key].message }}</span>
            <details v-if="item.message"><summary>Reviewed email</summary><strong>{{ item.message.subject }}</strong><p class="day-message">{{ item.message.text }}</p><p v-if="item.followUpPreview">{{ item.followUpPreview }}</p><p v-if="item.kind === 'appointment'">A secure link to the latest appointment options will be included. Replies go to support.</p></details>
            <details v-if="item.note"><summary>Review session note</summary><p>{{ item.note }}</p></details></li></ul>
          <p v-for="slot in plan.offeredSlots || []" :key="slot.key">Offered: {{ slot.label }}</p><p v-if="plan.followUpAction === 'private_slots'">Offers expire after {{ plan.offerDays }} day(s), or when their last offered time begins. Clients may decline; other scheduled sessions remain in place.</p>
          <template v-if="plan.unchanged.length"><h3>Not changed</h3><ul><li v-for="item in plan.unchanged" :key="item.key">{{ when(item) }} · {{ item.title }} — {{ item.detail }}</li></ul></template>
          <p>Provider-initiated cancellations do not add a client late-cancellation fee or attendance strike. Existing sessions and records remain in the history.</p>
          <label v-if="!changed" class="day-signature"><input v-model="signed" type="checkbox"> {{ deferredToken ? 'I reviewed the recipients and messages and approve sending these cancellation emails.' : 'I reviewed the recipients, emails, category, session notes, and replacement times and authorize these cancellations and notifications.' }}</label>
        </template>
        <p v-if="busy" role="status">{{ applyAttempted ? `Updating ${Object.keys(plan.results || {}).length} of ${plan.items.length} items. Please keep this window open.` : 'Preparing review…' }}</p>
        <p v-if="finished" role="status">{{ plan.status === 'completed' ? (deferredToken ? 'The approved emails have been queued for delivery.' : 'The reviewed cancellations are complete.') : 'Some items still need attention below.' }}</p>
        <p v-if="plan.notificationTaskId" role="status">To-do #{{ plan.notificationTaskId }} created. Open it to review and approve the emails later.</p>
        <p v-if="queuedNotices" role="status">{{ queuedNotices }} schedule updates are queued. Check each session’s Communications tab for delivery status.</p>
        <p v-if="deliveryWarnings" class="day-error" role="alert">{{ deliveryWarnings }} notifications need attention. Review delivery status before contacting recipients again.</p>
      </template>
    </div>
    <footer>
      <button type="button" :disabled="busy" @click="close">{{ changed ? 'Done' : 'Close' }}</button>
      <button v-if="!plan" type="button" class="day-primary" :disabled="busy || !resumeChecked || !selected.length || !reasonCategory || (notificationMode === 'none' && !suppressionReason.trim())" @click="review(false)">Review day</button>
      <template v-else-if="!finished">
        <button v-if="!changed" type="button" :disabled="busy" @click="reviewed ? (reviewed = false, signed = false, plan = draftPlan) : deferredToken ? close() : (plan = null, followUpAction = 'client_contact_support')">Back</button>
        <button v-if="!reviewed && !changed" type="button" class="day-primary" :disabled="busy || slotBusy || (scopeMode === 'sessions' && !selectedSessions.length) || (followUpAction === 'private_slots' && !offeredSlots.length)" @click="review(true)">Review final cancellation</button>
        <button v-else type="button" class="day-danger" :disabled="busy || !signed" @click="apply()">{{ changed || error ? 'Continue' : deferredToken ? 'Approve and send emails' : 'Confirm cancellation' }}</button>
      </template>
      <button v-else-if="plan.status === 'partial'" type="button" class="day-primary" :disabled="busy" @click="apply(true)">Retry failed items</button>
    </footer>
  </dialog>
</template>
<style scoped>
.cancel-day-dialog{width:min(860px,calc(100vw - 24px));max-height:90dvh;border:1px solid #dce2eb;border-radius:16px;padding:0;color:#182438;background:#fff;box-shadow:0 20px 80px #17243c40}.cancel-day-dialog::backdrop{background:#18243880}.cancel-day-dialog header,.cancel-day-dialog footer{display:flex;align-items:center;gap:12px;padding:16px 20px;background:#f8fafc}.cancel-day-dialog header{justify-content:space-between;border-bottom:1px solid #dce2eb}.cancel-day-dialog h2,.cancel-day-dialog header p{margin:0}.cancel-day-dialog footer{justify-content:flex-end;border-top:1px solid #dce2eb;flex-wrap:wrap}.cancel-day-body{padding:0 20px 20px;max-height:calc(90dvh - 160px);overflow:auto}.cancel-day-dialog button{padding:9px 14px;border:1px solid #cbd5e1;border-radius:8px;background:white;color:inherit;cursor:pointer}.cancel-day-dialog button:disabled{opacity:.55;cursor:default}.day-field{display:grid;gap:6px;margin:16px 0;width:100%}.day-field textarea,.day-field select,.day-field input,.day-recipient input{font:inherit;box-sizing:border-box;border:1px solid #b6c2d2;border-radius:8px;padding:9px;max-width:100%}.cancel-day-dialog fieldset{border:1px solid #dce2eb;border-radius:8px;display:flex;flex-wrap:wrap;gap:14px;margin-top:16px;min-width:0}.day-recipient{display:flex;gap:8px;flex-wrap:wrap;align-items:center;width:100%}.day-recipient label{display:grid;gap:4px}.day-recipient input[type=checkbox]{width:auto}.day-scope-note,.day-zone{font-size:13px;color:#526075}.day-review{padding:12px;background:#f0f7ff;border-radius:8px}.day-items{padding:0;list-style:none}.day-items li{padding:12px 0;border-bottom:1px solid #e2e8f0}.day-items li div{display:grid;gap:4px}.day-items li span{font-size:13px}.day-error{color:#a12828}.day-signature{display:flex;gap:8px;align-items:flex-start}.day-message{white-space:pre-wrap}.cancel-day-dialog .day-danger{background:#a12828;color:white;border-color:#a12828}.cancel-day-dialog .day-primary{background:#185c3b;color:white;border-color:#185c3b}
</style>
