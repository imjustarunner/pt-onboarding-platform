<template>
  <Teleport to="body">
    <div class="termination-overlay" @keydown="handleKeydown">
      <form ref="dialog" class="termination-dialog" role="dialog" aria-modal="true" aria-labelledby="termination-title" aria-describedby="termination-help" @submit.prevent="save">
        <h2 id="termination-title">Make {{ clientName }} inactive</h2>
        <p id="termination-help">Their record and history stay available, and enrollment can be reopened later. Termination reason, last provider, and date are optional.</p>
        <fieldset :disabled="saving || emailSent">
          <label for="termination-reason">Termination reason (optional)</label>
          <select id="termination-reason" ref="firstInput" v-model="reason">
            <option value="">Not recorded</option>
            <option v-for="option in reasons" :key="option" :value="option">{{ option }}</option>
          </select>

          <label for="termination-details">Reason details (optional)</label>
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
        </fieldset>
        <label class="termination-email-toggle"><input v-model="emailEnabled" type="checkbox" :disabled="saving || emailSent || deliveryReview" /> Send one final follow-up email from schools@</label>
        <EnrollmentFollowupComposer v-if="emailEnabled" v-model="followup" :client-id="clientId" :agency-id="agencyId" :locked="saving || emailSent || deliveryReview" @ready="followupReady = $event" @resume="resumeFollowup" />
        <p v-if="error" class="termination-error" role="alert">{{ error }}</p>
        <div class="termination-actions">
          <button type="button" :disabled="saving" @click="$emit('close')">Cancel</button>
          <button type="submit" class="termination-submit" :disabled="saving || deliveryReview || (emailEnabled && !followupReady)">{{ saving ? 'Saving…' : emailEnabled ? emailSent ? 'Finish status change' : followup.disposition === 'waitlist' ? 'Send email + keep on waitlist' : 'Send email + make inactive' : 'Mark as terminated' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import EnrollmentFollowupComposer from './EnrollmentFollowupComposer.vue';

const props = defineProps({ clientId: { type: Number, required: true }, clientName: { type: String, required: true }, agencyId: Number });
const emit = defineEmits(['close', 'saved']);
const reasons = ['Services completed', 'Client / family request', 'Unable to contact', 'Did not start services', 'Moved / transferred care', 'Provider no longer available', 'Other'];
const reason = ref('');
const details = ref('');
const providerId = ref('');
const date = ref('');
const saving = ref(false);
const error = ref('');
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
  if (saving.value || deliveryReview.value || (emailEnabled.value && !followupReady.value)) return;
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      termination_reason: [reason.value, details.value.trim()].filter(Boolean).join(': ') || null,
      termination_last_provider_id: providerId.value ? Number(providerId.value) : null,
      termination_date: date.value || null
    };
    if (emailEnabled.value) Object.assign(payload, { request_key: requestKey.value, reasons: followup.value.reasons, disposition: followup.value.disposition, email: { to: followup.value.to, subject: followup.value.subject, text: followup.value.text } });
    const { data } = await api.post(`/clients/${props.clientId}/${emailEnabled.value ? 'enrollment-followup' : 'terminate'}`, payload, ...config());
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
  await nextTick();
  firstInput.value?.focus();
});
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus(); });
</script>

<style scoped>
.termination-overlay { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 1rem; background: rgb(15 23 42 / 50%); }
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
.termination-submit { background: #9f2424; border-color: #9f2424; color: white; }
.termination-retry { padding: 0; border: 0; color: inherit; text-decoration: underline; }
.termination-email-toggle { display: flex; gap: .6rem; align-items: flex-start; margin-top: 1.2rem; line-height: 1.5; }
.termination-email-toggle input { width: auto; margin-top: .2rem; }
</style>
