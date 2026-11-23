<template>
  <Teleport to="body">
    <div class="termination-overlay" @keydown="handleKeydown">
      <form ref="dialog" class="termination-dialog" role="dialog" aria-modal="true" aria-labelledby="termination-title" aria-describedby="termination-help" @submit.prevent="save">
        <h2 id="termination-title">{{ mode === 'terminate' ? 'Terminate services for' : 'Make inactive:' }} {{ clientName }}</h2>
        <p id="termination-help">Their record and history stay available, and enrollment can be reopened later. Future sessions will be canceled and active assignments ended. Their history stays available.</p>
        <p v-if="reviewLoading" role="status">Checking termination documentation…</p>
        <fieldset v-show="!confirming" :disabled="saving || emailSent || reviewLoading">
          <label for="termination-reason">Reason for ending active services (required)</label>
          <select id="termination-reason" ref="firstInput" v-model="reason">
            <option value="">Choose a reason</option>
            <option v-for="option in reasons" :key="option" :value="option">{{ option }}</option>
          </select>

          <label for="termination-details">Reason details</label>
          <textarea id="termination-details" v-model="details" rows="3" maxlength="1800" placeholder="Add a different reason or any details you know." />

          <label for="termination-provider">Last provider assigned (optional)</label>
          <select id="termination-provider" v-model="providerId">
            <option value="">No provider / unknown</option>
            <option v-for="provider in providers" :key="provider.id" :value="String(provider.id)">
              {{ provider.first_name }} {{ provider.last_name }}{{ Number(provider.is_archived) === 1 || Number(provider.is_active) === 0 ? ' (inactive)' : '' }}
            </option>
          </select>
          <p v-if="providersLoading" class="termination-hint" role="status">Loading providers…</p>
          <p v-else-if="providersError" class="termination-hint" role="status">
            Providers could not be loaded. You can leave this blank or <button type="button" class="termination-retry" @click="loadProviders">try again</button>.
          </p>

          <label for="termination-date">Termination date (optional)</label>
          <input id="termination-date" v-model="date" type="date" />
          <p class="termination-hint">Leave blank if the date is unknown.</p>
          <section class="termination-note-review">
            <template v-if="!closureReview?.terminationNote && noteRequired === 'yes'">
              <label for="termination-note-provider">Provider responsible for the termination note</label>
              <select id="termination-note-provider" v-model="noteProviderId"><option value="">Choose a provider…</option><option v-for="provider in providers.filter(p => ![false,0,'0'].includes(p.is_active) && !Number(p.is_archived))" :key="provider.id" :value="String(provider.id)">{{ provider.first_name }} {{ provider.last_name }}</option></select>
            </template>
            <p v-if="closureReview?.terminationNote">A completed termination note is already on file for this episode of care.</p>
            <template v-else-if="!reviewLoading">
              <label for="termination-note-required">Does this client require a termination note?</label>
              <select id="termination-note-required" v-model="noteRequired"><option value="">Choose…</option><option value="yes">Yes — add a termination note to-do for the provider</option><option value="no">No — a termination note is not required</option></select>
              <label v-if="noteRequired === 'no'" for="termination-note-exemption">Why is a termination note not required?</label>
              <textarea v-if="noteRequired === 'no'" id="termination-note-exemption" v-model="noteExemption" maxlength="2000" rows="2" />
            </template>
          </section>
        </fieldset>
        <label v-if="mode === 'inactive' && !confirming" class="termination-email-toggle"><input v-model="emailEnabled" type="checkbox" :disabled="saving || emailSent || deliveryReview" /> Send one final follow-up email from schools@</label>
        <EnrollmentFollowupComposer v-if="emailEnabled" v-show="!confirming" v-model="followup" :client-id="clientId" :agency-id="agencyId" :locked="saving || emailSent || deliveryReview" @ready="followupReady = $event" @resume="resumeFollowup" />
        <p v-if="error" class="termination-error" role="alert">{{ error }}</p>
        <section v-if="confirming" class="termination-confirmation" role="alert">
          <h3 v-if="emailEnabled && followup.disposition === 'waitlist'">Send this follow-up and keep {{ clientName }} on the school waitlist?</h3>
          <h3 v-else>Are you sure you want to {{ mode === 'terminate' ? 'terminate services and make' : 'mark' }} {{ clientName }} inactive?</h3>
          <p v-if="!emailEnabled || followup.disposition !== 'waitlist'">Future appointments will be canceled without a cancellation fee. Active provider assignments will end. The client’s record and care history remain available.</p>
          <p v-if="!emailEnabled || followup.disposition !== 'waitlist'">{{ closureReview?.terminationNote ? 'Termination note: already completed.' : noteRequired === 'yes' ? 'A termination note to-do will be added for the selected provider.' : 'Termination note not required: ' + noteExemption }}</p>
          <p v-if="emailEnabled">{{ followup.disposition === 'waitlist' ? 'This follow-up will keep the client on the school waitlist.' : 'The final follow-up email will also be sent.' }}</p>
        </section>
        <div class="termination-actions">
          <button type="button" :disabled="saving" @click="confirming ? confirming = false : $emit('close')">{{ confirming ? 'Go back' : 'Cancel' }}</button>
          <button type="submit" class="termination-submit" :disabled="!canProceed">{{ saving ? 'Saving…' : !confirming ? 'Review this change' : emailEnabled ? emailSent ? 'Finish status change' : followup.disposition === 'waitlist' ? 'Send email + keep on waitlist' : 'Confirm inactive + send email' : mode === 'terminate' ? 'Confirm termination and make inactive' : 'Yes, mark inactive' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import EnrollmentFollowupComposer from './EnrollmentFollowupComposer.vue';

const props = defineProps({ clientId: { type: Number, required: true }, clientName: { type: String, required: true }, agencyId: Number, mode: {type:String,default:'inactive'} });
const emit = defineEmits(['close', 'saved']);
const reasons = ['Services completed', 'Client / family request', 'Unable to contact', 'Did not start services', 'Moved / transferred care', 'Provider no longer available', 'Other'];
const reason = ref('');
const details = ref('');
const providerId = ref('');
const date = ref('');
const saving = ref(false);
const error = ref('');
const closureReview=ref(null),reviewLoading=ref(true),noteProviderId=ref(''),noteRequired=ref(''),noteExemption=ref(''),confirming=ref(false);
const canProceed=computed(()=>!saving.value && !reviewLoading.value && !!closureReview.value && (props.mode!=='inactive' || closureReview.value.canMarkInactive) && !deliveryReview.value
  && ((emailEnabled.value && followup.value.disposition==='waitlist') || !![reason.value,details.value.trim()].filter(Boolean).join(''))
  && ((emailEnabled.value && followup.value.disposition==='waitlist') || closureReview.value.terminationNote || (noteRequired.value==='yes' ? !!noteProviderId.value : noteRequired.value==='no' && !!noteExemption.value.trim()))
  && (!emailEnabled.value || followupReady.value || confirming.value));
async function loadReview(){
 reviewLoading.value=true;error.value='';
 try { const {data}=await api.get(`/clients/${props.clientId}/closure-review`,...config());closureReview.value=data;
  if(data.providerId && !providerId.value)providerId.value=String(data.providerId);
  if(data.providerId && !noteProviderId.value)noteProviderId.value=String(data.providerId);
  if(props.mode==='inactive' && !data.canMarkInactive)error.value='Only administrators and support can mark clients inactive. Providers must use Terminate client.';
 } catch {error.value='Could not check termination documentation. Close and reopen this action to try again.';} finally {reviewLoading.value=false;}
}

const emailEnabled = ref(false), followupReady = ref(false), emailSent = ref(false), deliveryReview = ref(false);
const followup = ref({ to: '', subject: '', text: '', reasons: [], disposition: 'inactive' });
watch(emailEnabled, () => { followupReady.value = false; }, { flush: 'sync' });
const requestKey = ref(globalThis.crypto?.randomUUID?.() || `enrollment_${Date.now()}_${Math.random().toString(36).slice(2)}`);
const config = () => props.agencyId ? [{ headers: { 'X-Agency-Id': String(props.agencyId) } }] : [];
const providers = ref([]);
const providersLoading = ref(false);
const providersError = ref(false);
const dialog = ref(null);
const firstInput = ref(null);
const previousFocus = typeof document === 'undefined' ? null : document.activeElement;

async function loadProviders() {
  providersLoading.value = true;
  providersError.value = false;
  try {
    const { data } = await api.get(`/clients/${props.clientId}/termination-providers`, ...config());
    providers.value = data?.providers || [];
  } catch {
    providersError.value = true;
  } finally {
    providersLoading.value = false;
  }
}

async function save() {
  if (!canProceed.value) return;
  if(!confirming.value){confirming.value=true;return;}
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      termination_reason: [reason.value, details.value.trim()].filter(Boolean).join(': ') || null,
      termination_last_provider_id: providerId.value ? Number(providerId.value) : null,
      termination_date: date.value || null,
      termination_note_provider_id:noteProviderId.value ? Number(noteProviderId.value) : null,
      confirmClientClosure:true,closureReviewToken:closureReview.value.reviewToken,
      termination_note_required:!!closureReview.value.terminationNote || noteRequired.value==='yes',
      termination_note_not_required_reason:noteRequired.value==='no' ? noteExemption.value.trim() : null
    };
    if (emailEnabled.value) Object.assign(payload, { request_key: requestKey.value, reasons: followup.value.reasons, disposition: followup.value.disposition, email: { to: followup.value.to, subject: followup.value.subject, text: followup.value.text } });
    const { data } = await api.post(`/clients/${props.clientId}/${emailEnabled.value ? 'enrollment-followup' : props.mode === 'terminate' ? 'terminate' : 'inactive'}`, payload, ...config());
    emit('saved', { clientId: props.clientId, client: data, disposition: emailEnabled.value ? followup.value.disposition : 'inactive', emailed: emailEnabled.value });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not mark this client as terminated. Please try again.';
    if (e?.response?.data?.error?.followupSent) emailSent.value = true;
    if (e?.response?.data?.error?.deliveryReview) deliveryReview.value = true;
  } finally {
    saving.value = false;
  }
}

function resumeFollowup(pending) {
  requestKey.value = pending.requestKey;
  reason.value = '';
  details.value = pending.reviewed.details?.termination_reason || '';
  providerId.value = pending.reviewed.details?.termination_last_provider_id ? String(pending.reviewed.details.termination_last_provider_id) : '';
  date.value = pending.reviewed.details?.termination_effective_date || '';
  noteProviderId.value=String(pending.reviewed.details?.termination_note_provider_id || '');
  noteRequired.value=pending.reviewed.details?.termination_note_required===true ? 'yes' : pending.reviewed.details?.termination_note_required===false ? 'no' : '';
  noteExemption.value=pending.reviewed.details?.termination_note_not_required_reason || '';
  if (pending.state === 'sent') {
    emailSent.value = true;
    error.value = 'An earlier email was sent. Finish the status change below; the email will not be sent again.';
  } else {
    deliveryReview.value = true;
    error.value = 'An earlier email needs a delivery review in Communications before another send.';
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (!saving.value) emit('close');
  }
  if (event.key !== 'Tab') return;
  const inputs = [...dialog.value.querySelectorAll('button, select, textarea, input')].filter(el => !el.matches(':disabled'));
  const first = inputs[0];
  const last = inputs.at(-1);
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

onMounted(async () => {
  loadProviders();
  loadReview();
  await nextTick();
  firstInput.value?.focus();
});
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus(); });
</script>

<style scoped>
.termination-overlay { position: fixed; inset: 0; z-index: 14000; display: flex; align-items: center; justify-content: center; padding: 1rem; background: rgb(15 23 42 / 50%); }
.termination-dialog { width: 100%; box-sizing: border-box; max-width: 540px; max-height: calc(100dvh - 2rem); overflow-y: auto; padding: 1.5rem; border: 1px solid var(--border, #dbe3ee); border-radius: 14px; background: var(--card-bg, #fff); color: var(--text-primary, #172b4d); box-shadow: 0 20px 60px rgb(15 23 42 / 20%); }
h2 { margin: 0 0 .6rem; font-size: 1.2rem; }
p { line-height: 1.5; }
fieldset { display: flex; flex-direction: column; gap: .45rem; margin: 0; padding: 0; border: 0; min-width: 0; }
label { margin-top: .65rem; font-weight: 600; font-size: .9rem; }
input, select, textarea { width: 100%; box-sizing: border-box; padding: .65rem; border: 1px solid var(--border, #cbd5e1); border-radius: 7px; background: var(--card-bg, #fff); color: inherit; font: inherit; }
textarea { resize: vertical; }
.termination-hint { margin: 0; color: var(--text-secondary, #64748b); font-size: .85rem; }
.termination-error { color: #b91c1c; }
.termination-actions { display: flex; justify-content: flex-end; gap: .75rem; margin-top: 1.25rem; flex-wrap: wrap; }
button { padding: .65rem .85rem; border: 1px solid var(--border, #cbd5e1); border-radius: 7px; background: var(--card-bg, #fff); color: inherit; font: inherit; cursor: pointer; }
button:disabled { opacity: .6; cursor: wait; }
.termination-confirmation { border:1px solid #efc6b5;background:#fff6ef;padding:12px;border-radius:9px; }
.termination-note-review { margin:12px 0; }
.termination-submit { background: #9f2424; border-color: #9f2424; color: white; }
.termination-retry { padding: 0; border: 0; color: inherit; text-decoration: underline; }
.termination-email-toggle { display: flex; gap: .6rem; align-items: flex-start; margin-top: 1.2rem; line-height: 1.5; }
.termination-email-toggle input { width: auto; margin-top: .2rem; }
</style>
