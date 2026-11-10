<template>
  <section :id="FAMILY_WELCOME_SECTION_ID" class="info-section fw-settings" aria-labelledby="fw-settings-title">
    <div class="section-header fw-head">
      <div>
        <p class="fw-brand">SchoolCareBridge</p>
        <h2 id="fw-settings-title">{{ FAMILY_WELCOME_NAME }}</h2>
        <p class="fw-tagline">{{ FAMILY_WELCOME_TAGLINE }}</p>
      </div>
      <button v-if="plan?.eligible" type="button" class="fw-link" @click="openTour">View the tour</button>
    </div>

    <p v-if="loading" class="hint">Loading your Family Welcome settings…</p>
    <p v-else-if="loadError" class="fw-error" role="alert">{{ loadError }}</p>
    <p v-else-if="!plan?.eligible" class="hint">
      {{ FAMILY_WELCOME_NAME }} is available to providers assigned to a SchoolCareBridge school in the pilot.
      Support introduces you to each new family, and you are copied on that email.
    </p>

    <template v-else>
      <p v-if="plan.rolloutPhase === 'phase_1'" class="hint">ITSCO first phase: review your wording, choose On or Off, and Save Family Welcome to record your choice. Automatic outreach begins only for new school assignments after you turn it on. Return here anytime to edit it.</p>
      <fieldset class="fw-choice">
        <legend>Send my welcome and follow-ups</legend>
        <label><input v-model="status" type="radio" value="enabled" :disabled="busy" /> <span><strong>On.</strong> When a new school client is assigned to me, send my welcome email, then follow up until we connect.</span></label>
        <label><input v-model="status" type="radio" value="declined" :disabled="busy || plan.mandatory" /> <span><strong>Off.</strong> Support sends an introduction email when I am assigned, and I am copied.</span></label>
        <p v-if="plan.mandatory" class="hint">Your organization requires this to stay on.</p>
      </fieldset>

      <div class="fw-messages">
        <h3>Your messages</h3>
        <p class="hint">Each message uses the family’s name, your name, the school, and the school day. The text goes out only with the family’s permission to text; otherwise the 48-hour email goes instead. A family reply stops the follow-ups.</p>
        <article v-for="message in FAMILY_WELCOME_MESSAGES" :key="message.field" class="fw-message">
          <button type="button" class="fw-message-toggle" :aria-expanded="openField === message.field" @click="openField = openField === message.field ? '' : message.field">
            <span><strong>{{ message.label }}</strong><small>{{ message.when }}</small></span>
            <span aria-hidden="true">{{ openField === message.field ? '−' : '+' }}</span>
          </button>
          <div v-if="openField === message.field" class="fw-message-body">
            <label :for="`fw-${message.field}`">{{ message.sms ? 'Text wording' : 'Email wording' }}</label>
            <FamilyWelcomeFields :sms="message.sms" @insert="insertField(message.field, $event)" />
            <textarea :id="`fw-${message.field}`" :ref="el => { if (el) editors[message.field] = el; }" v-model="draft[message.field]" rows="10" :maxlength="message.sms ? 1000 : 6000" spellcheck="true"></textarea>

            <p v-if="validateFamilyWelcomeTemplate(draft[message.field], message.sms)" class="fw-error">{{ validateFamilyWelcomeTemplate(draft[message.field], message.sms) }}</p>
            <div class="fw-preview" :aria-label="`${message.label} preview`">
              <label v-if="plan.schools?.length > 1">Preview school <select v-model="previewSchoolId"><option v-for="school in plan.schools" :key="school.id" :value="school.id">{{ school.name }}</option></select></label>
              <p class="fw-preview-subject">{{ message.subject }}</p>
              <p class="fw-preview-body">{{ render(draft[message.field]) }}</p>
            </div>
            <div class="fw-row">
              <button type="button" class="fw-link" @click="draft[message.field] = plan.recommendedTemplates?.[message.field] || draft[message.field]">Use recommended wording</button>
              <button v-if="!message.sms" type="button" class="fw-secondary" :disabled="busy || !!validateFamilyWelcomeTemplate(draft[message.field])" @click="sendExample(message)">{{ exampleField === message.field ? 'Sending…' : 'Send me an example' }}</button>
            </div>
          </div>
        </article>
      </div>

      <div class="fw-options">
        <h3>Welcome email extras</h3>
        <label class="fw-check"><input v-model="includePdf" type="checkbox" :disabled="busy" /> Attach my introduction PDF to the welcome email</label>
        <FamilyWelcomePdfButton :agency-id="plan.agencyId" />
        <label class="fw-check fw-soon"><input type="checkbox" disabled /> Add my available hours for booking <span class="fw-pill">Coming soon</span></label>
      </div>

      <p v-if="notice" class="fw-notice" role="status">{{ notice }}</p>
      <p v-if="error" class="fw-error" role="alert">{{ error }}</p>
      <div class="fw-row fw-save">
        <button type="button" class="btn btn-primary" :disabled="busy" @click="save()">{{ busy ? 'Saving…' : 'Save Family Welcome' }}</button>
      </div>

      <div v-if="profilePrompt" class="fw-prompt" role="alertdialog" aria-labelledby="fw-prompt-text">
        <p id="fw-prompt-text">{{ FAMILY_WELCOME_PROFILE_PROMPT }}</p>
        <div class="fw-row">
          <button type="button" class="fw-secondary" @click="addLinkFromPrompt">Add profile link</button>
          <button type="button" class="fw-link" @click="save({ skipProfileCheck: true })">No thanks, save anyway</button>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import FamilyWelcomeFields from './FamilyWelcomeFields.vue';
import FamilyWelcomePdfButton from './FamilyWelcomePdfButton.vue';
import {
  FAMILY_WELCOME_MESSAGES, FAMILY_WELCOME_NAME, FAMILY_WELCOME_PROFILE_PROMPT, FAMILY_WELCOME_SECTION_ID, FAMILY_WELCOME_TAGLINE,
  PROFILE_LINK_TOKEN, insertAtCursor, renderFamilyWelcome, validateFamilyWelcomeTemplate, welcomeMissingProfileLink
} from '../../utils/familyWelcome.js';

const props = defineProps({ agencyId: [Number, String], userId: [Number, String], providerName: { type: String, default: '' } });
const plan = ref(null), loading = ref(false), loadError = ref(''), busy = ref(false), error = ref(''), notice = ref('');
const status = ref('declined'), includePdf = ref(true), openField = ref('template'), profilePrompt = ref(false), exampleField = ref('');
const draft = reactive({ template: '', secondTemplate: '', finalTemplate: '', smsTemplate: '' });
const editors = {};
const previewSchoolId = ref(null);
let version = 0;
onBeforeUnmount(() => { version++; });

function apply(data) {
  plan.value = data;
  if (!data?.eligible) return;
  if (!data.schools?.some(s => Number(s.id) === Number(previewSchoolId.value))) previewSchoolId.value = data.schools?.[0]?.id ?? null;
  status.value = data.rolloutPhase === 'phase_1' && data.status === 'unconfigured' ? '' : data.status === 'enabled' ? 'enabled' : 'declined';
  includePdf.value = data.includePdf !== false;
  for (const key of Object.keys(draft)) draft[key] = data[key] || data.recommendedTemplates?.[key] || '';
}
async function load() {
  const request = ++version;
  plan.value = null; notice.value = ''; error.value = ''; loadError.value = ''; loading.value = false; busy.value = false; profilePrompt.value = false;
  for (const key of Object.keys(draft)) draft[key] = '';
  if (!props.agencyId || !props.userId) return;
  loading.value = true; loadError.value = '';
  try {
    const { data } = await api.get('/school-contact-plan', { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    if (request !== version) return;
    apply(data);
  } catch {
    if (request !== version) return;
    loadError.value = 'Family Welcome settings could not be loaded.';
  } finally {
    if (request === version) loading.value = false;
  }
}
function render(text) {
  return renderFamilyWelcome(text, {
    parent_name: 'Parent name', provider_name: plan.value?.providerName || props.providerName || 'Provider name',
    school_name: plan.value?.schools?.find(s => Number(s.id) === Number(previewSchoolId.value))?.name || 'Example school', service_day: 'Example day', ...plan.value?.previewValues
  });
}
async function insertField(field, token) {
  openField.value = field;
  await nextTick();
  const el = editors[field];
  const position = (el?.selectionStart ?? draft[field].length) + token.length;
  draft[field] = insertAtCursor(el, draft[field], token);
  await nextTick(); el?.focus?.(); el?.setSelectionRange?.(position, position);
}
async function addLinkFromPrompt() {
  profilePrompt.value = false;
  await insertField('template', PROFILE_LINK_TOKEN);
}
function messageFrom(e, fallback) { return e?.response?.data?.error?.message || e?.response?.data?.message || fallback; }
async function sendExample(message) {
  if (busy.value) return;
  const request = version;
  busy.value = true; exampleField.value = message.field; error.value = ''; notice.value = '';
  try {
    const { data } = await api.post('/school-contact-plan/example', { template: draft[message.field], stepKey: message.step, schoolId: previewSchoolId.value, includePdf: includePdf.value }, { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    if (request !== version) return;
    notice.value = `Example sent to ${data.deliveredTo || 'your inbox'}.`;
  } catch (e) {
    if (request !== version) return;
    error.value = messageFrom(e, 'The example could not be sent. Please try again.');
  } finally {
    if (request === version) { busy.value = false; exampleField.value = ''; }
  }
}
async function save({ skipProfileCheck = false } = {}) {
  if (busy.value) return;
  error.value = ''; notice.value = '';
  if (!['enabled', 'declined'].includes(status.value)) { error.value = 'Choose On or Off before saving your Family Welcome preferences.'; return; }
  const invalid = FAMILY_WELCOME_MESSAGES.find(m => validateFamilyWelcomeTemplate(draft[m.field], m.sms));
  if (invalid) { openField.value = invalid.field; error.value = `${invalid.label}: ${validateFamilyWelcomeTemplate(draft[invalid.field], invalid.sms)}`; return; }
  if (!skipProfileCheck && welcomeMissingProfileLink(draft)) { profilePrompt.value = true; return; }
  profilePrompt.value = false;
  const request = version;
  busy.value = true;
  try {
    const { data } = await api.put('/school-contact-plan', { status: status.value, ...draft, includePdf: includePdf.value }, { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    if (request !== version) return;
    apply(data);
    notice.value = status.value === 'enabled' ? 'Family Welcome & Follow-Up is on.' : 'Family Welcome & Follow-Up is off. Support will introduce you, and you will be copied.';
  } catch (e) {
    if (request !== version) return;
    error.value = messageFrom(e, 'Your settings could not be saved. Please try again.');
  } finally {
    if (request === version) busy.value = false;
  }
}
function openTour() { window.dispatchEvent(new CustomEvent('family-welcome:open')); }
watch(() => [props.agencyId, props.userId], load, { immediate: true });
defineExpose({ save, draft, status, includePdf, profilePrompt });
</script>

<style scoped>
.fw-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.fw-brand{margin:0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#007cbd;font-weight:700}
.fw-head h2{margin:4px 0}
.fw-tagline{margin:0;color:#4b6470}
.fw-choice{border:1px solid #dfe8e7;border-radius:12px;padding:12px 16px;margin:16px 0}
.fw-choice legend{font-weight:600;padding:0 6px}
.fw-choice label{display:flex;gap:10px;align-items:flex-start;margin:8px 0;line-height:1.5}
.fw-messages h3,.fw-options h3{font-size:15px;margin:18px 0 6px}
.fw-message{border:1px solid #dfe8e7;border-radius:12px;margin:8px 0;overflow:hidden}
.fw-message-toggle{display:flex;justify-content:space-between;align-items:center;width:100%;padding:12px 14px;background:#f7faf9;border:0;cursor:pointer;font:inherit;text-align:left}
.fw-message-toggle small{display:block;color:#6d7f86;font-size:12px;margin-top:2px}
.fw-message-body{padding:12px 14px}
.fw-message-body label{font-weight:600;font-size:13px}
.fw-message-body textarea{box-sizing:border-box;width:100%;margin-top:6px;border:1px solid #bacdca;border-radius:10px;padding:10px;font:inherit;font-size:13px;line-height:1.6}
.fw-message-body code{margin:0 3px;font-size:11px;background:#edf4ef;padding:2px 5px;border-radius:4px}
.fw-toolbar{display:flex;gap:8px;margin-top:6px}
.fw-add-link{border:1px solid #9cc9e4;background:#eaf6fd;color:#075c91;border-radius:8px;padding:6px 10px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}
.fw-preview{border:1px solid #e5edeb;border-radius:10px;background:#fcfdfc;padding:10px 12px;margin-top:10px}
.fw-preview-subject{margin:0 0 6px;font-weight:600;font-size:12px}
.fw-preview-body{margin:0;white-space:pre-wrap;font-size:12px;line-height:1.7;color:#425c60}
.fw-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:10px}
.fw-save{justify-content:flex-end}
.fw-options{display:grid;gap:10px;justify-items:start}
.fw-check{display:flex;gap:8px;align-items:center}
.fw-soon{color:#7e8b90}
.fw-pill{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:20px;background:#fff4dc;color:#8a5a00;font-size:11px;font-weight:600}
.fw-link{background:none;border:0;color:#075c91;font:inherit;font-size:13px;cursor:pointer;padding:6px 0}
.fw-secondary{border:1px solid #c8d9d1;border-radius:9px;background:#eff8fd;color:#075c91;font:inherit;font-size:12px;font-weight:600;padding:8px 12px;cursor:pointer}
.fw-error{color:#9c3a37;background:#fff0ed;border-radius:8px;padding:8px 10px;font-size:13px}
.fw-notice{color:#2e7256;background:#eef7ef;border-radius:8px;padding:8px 10px;font-size:13px}
.fw-prompt{margin-top:12px;border:1px solid #f0c98b;background:#fff8ea;border-radius:12px;padding:12px 14px}
.fw-prompt p{margin:0;font-weight:600;color:#6b4300}
</style>
