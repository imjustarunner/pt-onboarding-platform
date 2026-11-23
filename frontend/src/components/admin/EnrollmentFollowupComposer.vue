<template>
  <section class="followup-composer" aria-label="Final enrollment follow-up email">
    <p v-if="loading" role="status">Preparing email…</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="loadContext">Try again</button></p>
    <template v-if="context">
      <p class="followup-envelope"><strong>From:</strong> {{ context.from }}<br><strong>Replies go to:</strong> {{ context.replyTo }}</p>
      <fieldset :disabled="locked">
        <legend>Include in the email</legend>
        <label v-for="reason in reasons" :key="reason.key" class="followup-choice">
          <input v-model="draft.reasons" type="checkbox" :value="reason.key" @change="reasonsChanged" /> {{ reason.label }}
        </label>
        <label for="followup-disposition">After sending</label>
        <select id="followup-disposition" v-model="draft.disposition" @change="draftChanged">
          <option value="inactive" :disabled="draft.reasons.includes('school_waitlist')">Make inactive; a reply reopens this enrollment</option>
          <option value="waitlist">Keep on the school waitlist</option>
        </select>
        <button v-if="customized" type="button" @click="generate">Update draft from checked items</button>
        <p v-if="customized" class="followup-hint">Your edits are kept until you choose to update the draft.</p>
        <label for="followup-recipient">To</label>
        <input id="followup-recipient" v-model="draft.to" type="email" required list="followup-recipients" autocomplete="off" />
        <datalist id="followup-recipients"><option v-for="email in context.recipients" :key="email" :value="email" /></datalist>
        <label for="followup-subject">Subject</label>
        <input id="followup-subject" v-model="draft.subject" required maxlength="200" @input="edited" />
        <label for="followup-message">Message</label>
        <textarea id="followup-message" v-model="draft.text" required rows="14" maxlength="20000" @input="edited" />
      </fieldset>
      <button type="button" :disabled="previewLoading || !draft.text" @click="preview">{{ previewLoading ? 'Preparing preview…' : 'Preview branded email' }}</button>
      <iframe v-if="previewHtml" title="Final follow-up email preview" sandbox="" :srcdoc="previewHtml" class="followup-preview" />
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { ENROLLMENT_FOLLOWUP_REASONS as reasons, enrollmentFollowupDraft } from '../../constants/enrollmentFollowup.js';
const props = defineProps({ clientId: { type: Number, required: true }, agencyId: Number, locked: Boolean, modelValue: { type: Object, required: true } });
const draft = computed(() => props.modelValue);
const emit = defineEmits(['ready', 'resume']);
const context = ref(null), loading = ref(false), error = ref(''), customized = ref(false), previewHtml = ref(''), previewLoading = ref(false);
const config = () => props.agencyId ? [{ headers: { 'X-Agency-Id': String(props.agencyId) } }] : [];
async function loadContext() {
  
  loading.value = true; error.value = '';
  try {
    const { data } = await api.get(`/clients/${props.clientId}/enrollment-followup`, ...config());
    context.value = data;
    if (data.pendingFollowup) {
      const pending = data.pendingFollowup;
      Object.assign(draft.value, pending.reviewed, { reasons: pending.reviewed.reasons || [] });
      emit('resume', pending);
    }
    if (!draft.value.text) { draft.value.to = data.recipients?.[0] || ''; generate(); }
    emit('ready', true);
  } catch (e) { error.value = e?.response?.data?.error?.message || 'The schools@ email sender could not be prepared.'; }
  finally { loading.value = false; }
}
function generate() {
  
  const generated = enrollmentFollowupDraft({ ...context.value, reasons: draft.value.reasons, disposition: draft.value.disposition });
  draft.value.subject = generated.subject; draft.value.text = generated.text;
  customized.value = false; previewHtml.value = '';
}
function reasonsChanged() {
  if (draft.value.reasons.includes('school_waitlist')) draft.value.disposition = 'waitlist';
  draftChanged();
}
function draftChanged() { previewHtml.value = ''; if (!customized.value) generate(); }
function edited() { customized.value = true; previewHtml.value = ''; }
async function preview() {
  previewLoading.value = true; error.value = '';
  try {
    const { data } = await api.post(`/clients/${props.clientId}/enrollment-followup/preview`, { text: draft.value.text }, ...config());
    previewHtml.value = data.html;
  } catch (e) { error.value = e?.response?.data?.error?.message || 'The email preview could not be prepared.'; }
  finally { previewLoading.value = false; }
}
onMounted(loadContext);
</script>

<style scoped>
.followup-composer { margin-top: 1rem; padding-top: .75rem; border-top: 1px solid var(--border, #cbd5e1); }
.followup-envelope { font-size: .9rem; line-height: 1.6; overflow-wrap: anywhere; }
fieldset { min-width: 0; margin: 0 0 1rem; padding: 0; border: 0; display: flex; flex-direction: column; gap: .5rem; }
legend { font-weight: 700; margin-bottom: .6rem; }
label { font-weight: 600; font-size: .9rem; }
.followup-choice { display: flex; align-items: flex-start; gap: .5rem; font-weight: 400; line-height: 1.4; }
.followup-choice input { width: auto; margin-top: .15rem; }
input, select, textarea { width: 100%; box-sizing: border-box; padding: .65rem; border: 1px solid var(--border, #cbd5e1); border-radius: 7px; background: var(--card-bg, white); color: inherit; font: inherit; }
textarea { resize: vertical; line-height: 1.5; }
button { padding: .6rem .8rem; border: 1px solid var(--border, #cbd5e1); border-radius: 7px; background: var(--card-bg, white); color: inherit; font: inherit; cursor: pointer; align-self: flex-start; }
.followup-hint { margin: 0; font-size: .85rem; color: var(--text-secondary, #64748b); }
.followup-preview { display: block; width: 100%; height: 540px; margin-top: 1rem; border: 1px solid var(--border, #cbd5e1); border-radius: 8px; }
</style>
