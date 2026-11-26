<template>
  <div class="workflow-editor">
    <div class="intro"><h3>{{ heading }}</h3><p>{{ description }}</p></div>
    <div v-if="branding" class="editor-grid"><label>Portal banner image URL<input :value="modelValue.bannerUrl" type="url" placeholder="https://…" @input="patch({ bannerUrl: $event.target.value })" /></label><label>Tenant welcome tagline<input :value="modelValue.tagline" maxlength="160" @input="patch({ tagline: $event.target.value })" /></label></div>
    <div v-if="supervisorSettings" class="supervisor-config"><h4>Supervisory role option</h4><p>These approved materials are included when the new hire will perform supervisory duties. Assigning their own supervisor is a separate choice.</p><label>Supervisor acknowledgement to sign<select :value="modelValue.supervisorTemplateId" @change="patch({ supervisorTemplateId: Number($event.target.value) || null })"><option value="">Select a signature template</option><option v-for="t in signatureTemplates" :key="t.id" :value="t.id">{{ t.name }}</option></select></label><label>Approved contract clause for supervisory duties<textarea :value="modelValue.supervisorClause" rows="4" placeholder="Enter your organization’s approved supervisory responsibilities clause." @input="patch({ supervisorClause: $event.target.value })" /></label></div>
    <div class="step-type-choices">
      <button v-if="phase === 'pre_hire' && fingerprintingAvailable && !resources.some(item => item.id === denverFingerprintingStep.id)" type="button" @click="addFingerprinting">
        <strong>Add Denver fingerprinting</strong><span>{{ hireResourceHelp.fingerprinting }}</span>
      </button>
      <button v-for="choice in stepChoices" :key="choice.kind" type="button" @click="addCustom(choice.kind)"><strong>Add {{ choice.label }}</strong><span>{{ choice.description }}</span></button></div>
    <div v-if="phase === 'pre_hire' && fingerprintingAvailable && agencyId" class="fingerprinting-defaults">
      <button v-if="!editingFingerprinting" type="button" class="btn btn-secondary" @click="editFingerprinting">Edit default fingerprinting instructions</button>
      <template v-else>
        <label>Fingerprinting instructions for future hires
          <textarea v-model="fingerprintingDraft" :maxlength="denverFingerprintingInstructionsLimit" rows="4" :disabled="savingFingerprinting" />
        </label>
        <div class="fingerprinting-actions">
          <button type="button" class="btn btn-primary" :disabled="savingFingerprinting" @click="saveFingerprinting">{{ savingFingerprinting ? 'Saving…' : 'Save default instructions' }}</button>
          <button type="button" class="btn btn-secondary" :disabled="savingFingerprinting" @click="editingFingerprinting = false">Cancel</button>
        </div>
      </template>
      <p v-if="fingerprintingError" class="missing" role="alert">{{ fingerprintingError }}</p>
      <p v-else-if="fingerprintingSaved" role="status">Default instructions saved for future hires.</p>
    </div>
    <details><summary>Choose a suggested step</summary><div class="add-row"><select v-model="catalogKey" aria-label="Add a portal step"><option value="">Choose an item to add…</option><option v-for="item in availableCatalog" :key="item.id" :value="item.id">{{ item.title }}</option></select><button type="button" @click="addCatalog" :disabled="!catalogKey">Add suggested step</button></div></details>
    <div v-if="!resources.length" class="empty">{{ phase === 'onboarding' ? 'No additional steps. The selected onboarding collection and built-in onboarding steps will be included.' : 'No additional steps selected. The secure authorization, job description, agreement, username, information form and headshot are already provided. The internal handbook is a pre-hire reference; its signed review is part of onboarding.' }}</div>
    <fieldset v-for="(item, index) in resources" :key="item.id" class="resource-editor" :disabled="lockedResourceIds.includes(item.id)"><p v-if="lockedResourceIds.includes(item.id)" class="completed-note">Completed step · preserved with their submission</p>
      <div class="resource-heading"><slot name="resource-actions" :item="item" /><strong>{{ index + 1 }}. {{ item.title || 'New step' }}</strong><button type="button" @click="remove(item.id)">Remove</button></div>
      <div class="editor-grid"><label>Title<input :readonly="item.kind === 'fingerprinting'" :value="item.title" @input="change(item.id, { title: $event.target.value })" /></label><label v-if="!phase">Process<select :value="item.phase" @change="change(item.id, { phase: $event.target.value })"><option value="pre_hire">Pre-hire</option><option value="onboarding">Onboarding</option></select></label><label v-if="item.kind !== 'fingerprinting'">Step type<select :value="item.kind" @change="change(item.id, { kind: $event.target.value })"><option value="document">In-app document · fill/sign or read, as configured</option><option value="acknowledgement">Linked document · signed acknowledgement</option><option value="upload">Download blank form · upload completed copy</option><option value="video">Embedded video</option><option value="link">Training / resource link</option><option value="meeting">Meeting scheduler</option></select></label><label v-if="item.kind === 'document'">Document template<select :value="item.templateId" @change="change(item.id, { templateId: Number($event.target.value) || null })"><option value="">Choose a template</option><option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }} · {{ t.document_action_type === 'review' ? 'Read and acknowledge' : 'Fill and sign' }}</option></select><small>Signature documents support existing PDF fields and free placement of text and signatures on flat PDFs. Review-only templates ask for confirmation without a signature.</small><a v-if="editorUrl" :href="templateEditorUrl(item.templateId)" target="_blank" rel="noopener">View or edit document template ↗</a></label><label v-else-if="item.kind !== 'fingerprinting'">{{ item.kind === 'meeting' ? 'Scheduling link' : 'Viewer, video or blank form link' }}<input :value="item.url" type="url" placeholder="https://…" @input="change(item.id, { url: $event.target.value })" /></label></div>
      <p class="completion-help"><strong>How this step is completed</strong>{{ hireResourceHelp[item.kind] }}</p>
      <HireSetupDocumentPreview v-if="item.kind === 'document' && item.templateId && agencyId" :agency-id="agencyId" :template-id="item.templateId" :title="item.title" />
      <a v-else-if="safeResourceUrl(item.url)" :href="safeResourceUrl(item.url)" target="_blank" rel="noopener">Preview linked resource ↗</a>
      <label>Instructions for the candidate<textarea :value="item.instructions" rows="2" @input="change(item.id, { instructions: $event.target.value })" /></label><label class="check"><input type="checkbox" :checked="item.required !== false" @change="change(item.id, { required: $event.target.checked })" />Required to complete this process</label><p v-if="!lockedResourceIds.includes(item.id) && item.required !== false && !(item.kind === 'fingerprinting' ? fingerprintingAvailable : item.kind === 'document' ? item.templateId : item.url)" class="missing">Attach this item before sending the packet.</p>
    </fieldset>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
import api from '../../services/api';
import { denverFingerprintingDefaultInstructions, denverFingerprintingInstructionsLimit, denverFingerprintingStep, hireResourceHelp } from '../../navigation/hireDocuments.js';
import HireSetupDocumentPreview from '../hiring/HireSetupDocumentPreview.vue';
const props = defineProps({ modelValue: { type: Object, default: () => ({}) }, templates: { type: Array, default: () => [] }, heading: { type: String, default: 'Portal steps' }, description: { type: String, default: 'Organization defaults are inherited by the job posting, then customized for the person before sending. Each item becomes a step in its own process.' }, branding: Boolean, supervisorSettings: Boolean, fingerprintingAvailable: Boolean, fingerprintingInstructions: String, phase: String, editorUrl: String, agencyId: [Number, String], lockedResourceIds: { type: Array, default: () => [] } });
const emit = defineEmits(['update:modelValue']);
const resources = computed(() => (props.modelValue.resources || []).filter(r => !props.phase || r.phase === props.phase));
const signatureTemplates = computed(() => props.templates.filter(t => (t.document_action_type || 'signature') === 'signature'));
const stepChoices = [
  { kind: 'document', label: 'document', description: 'Fill and sign a PDF in the app, or read a review-only template.' },
  { kind: 'video', label: 'video', description: 'Watch a welcome or training video, then confirm completion.' },
  { kind: 'link', label: 'resource', description: 'Open a website or training link, then confirm completion.' },
  { kind: 'meeting', label: 'meeting', description: 'Book using your scheduler and enter the confirmed time.' },
  { kind: 'upload', label: 'form upload', description: 'Download a form and upload the completed copy.' },
  { kind: 'acknowledgement', label: 'signed acknowledgment', description: 'Read linked material and sign a receipt in the app.' }
];
const safeResourceUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
const catalogKey = ref('');
const catalog = [
  { id: 'd11', title: 'D11 Pre-Hire document', phase: 'pre_hire', kind: 'upload' },
  { id: 'welcome-video', title: 'Welcome video', phase: 'pre_hire', kind: 'video' },
  { id: 'i9', title: 'Form I-9 · employee information', kind: 'document' },
  { id: 'w4', title: 'Form W-4 · federal withholding', kind: 'document' },
  { id: 'direct-deposit', title: 'Direct deposit setup', kind: 'document' },
  { id: 'co-withholding', title: 'Colorado withholding certificate (DR 0004)', kind: 'document' },
  { id: 'health-election', title: 'Health insurance opt-in / waiver', kind: 'document' },
  { id: 'co-pregnancy', title: 'Colorado pregnancy accommodation notice', kind: 'acknowledgement' },
  { id: 'co-famli', title: 'Colorado FAMLI contributions acknowledgement', kind: 'acknowledgement' },
  { id: 'marketplace', title: 'Health insurance marketplace coverage notice', kind: 'acknowledgement' },
  { id: 'health-plan', title: 'Health insurance plan breakdown', kind: 'acknowledgement' },
  { id: 'family-practice', title: 'Family practice information sheet', kind: 'acknowledgement' },
  { id: 'supervisor-meeting', title: 'Meet with your supervisor', kind: 'meeting' },
  { id: 'people-ops-meeting', title: 'Meet with People Operations', kind: 'meeting' },
  { id: 'training-link', title: 'Training resources', kind: 'link' },
  { id: 'employee-folder', title: 'All Employee folder', kind: 'link', required: false },
  { id: 'provider-guide', title: 'Provider’s Guide', kind: 'link', required: false }
].map(r => ({ phase: 'onboarding', required: true, url: '', ...r }));
const availableCatalog = computed(() => catalog.filter(r => !props.phase || r.phase === props.phase));
function templateEditorUrl(id) {
  const [path, query] = (props.editorUrl || '').split('?');
  return `${path}${id ? '/' + id + '/edit' : ''}${query ? '?' + query : ''}`;
}
function patch(values) { emit('update:modelValue', { ...props.modelValue, ...values }); }
function change(id, values) { patch({ resources: (props.modelValue.resources || []).map(r => r.id === id ? { ...r, ...values } : r) }); }
function remove(id) { patch({ resources: (props.modelValue.resources || []).filter(r => r.id !== id), excludedResourceIds: [...new Set([...(props.modelValue.excludedResourceIds || []), id])] }); }
const savedFingerprinting = ref(null);
const editingFingerprinting = ref(false);
const savingFingerprinting = ref(false);
const fingerprintingSaved = ref(false);
const fingerprintingError = ref('');
const fingerprintingDraft = ref('');
const previousFingerprinting = ref('');
const fingerprintingDefault = computed(() =>
  savedFingerprinting.value?.agencyId === props.agencyId
    ? savedFingerprinting.value.instructions
    : props.fingerprintingInstructions ?? denverFingerprintingDefaultInstructions
);
function addFingerprinting() {
  addStep({ ...denverFingerprintingStep, instructions: fingerprintingDefault.value });
}
function editFingerprinting() {
  previousFingerprinting.value = fingerprintingDefault.value;
  fingerprintingDraft.value = previousFingerprinting.value;
  fingerprintingError.value = '';
  fingerprintingSaved.value = false;
  editingFingerprinting.value = true;
}
async function saveFingerprinting() {
  const agencyId = props.agencyId;
  savingFingerprinting.value = true;
  fingerprintingError.value = '';
  try {
    const { data } = await api.put('/hiring/settings/fingerprinting-instructions', {
      instructions: fingerprintingDraft.value, previousInstructions: previousFingerprinting.value
    }, { params: { agencyId } });
    if (props.agencyId !== agencyId) return;
    savedFingerprinting.value = { agencyId, instructions: data.instructions };
    editingFingerprinting.value = false;
    fingerprintingSaved.value = true;
  } catch (error) {
    fingerprintingError.value = error.response?.data?.error?.message || 'The instructions could not be saved. Try again.';
  } finally {
    savingFingerprinting.value = false;
  }
}
function addStep(item) {
  if (item && !resources.value.some(r => r.id === item.id)) patch({
    resources: [...(props.modelValue.resources || []), { ...item }],
    excludedResourceIds: (props.modelValue.excludedResourceIds || []).filter(id => id !== item.id)
  });
}
function addCatalog() {
  addStep(catalog.find(r => r.id === catalogKey.value));
  catalogKey.value = '';
}
function addCustom(kind = 'link') { patch({ resources: [...(props.modelValue.resources || []), { id: crypto.randomUUID(), title: '', phase: props.phase || 'onboarding', kind, required: true, url: '' }] }); }
</script>
<style scoped>
.fingerprinting-defaults { display: grid; justify-items: start; gap: 8px; }
.fingerprinting-defaults label { width: 100%; }
.fingerprinting-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.fingerprinting-defaults p { margin: 0; }
.workflow-editor{display:grid;gap:18px}.intro h3{margin:0}.intro p,.supervisor-config p{color:#56657a;font-size:13px;line-height:1.6}.editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}label{display:block;font-size:12px;font-weight:600}input:not([type=checkbox]),select,textarea{display:block;width:100%;margin-top:6px;border:1px solid #ced8e0;border-radius:5px;background:#fff;color:#192f42;font:inherit;padding:9px}small{display:block;color:#52657c;font-weight:400;margin-top:6px}.resource-editor,.supervisor-config{padding:18px;border:1px solid #dde5e9;border-radius:7px;display:grid;gap:15px}.resource-heading{flex-wrap:wrap}.resource-heading,.add-row{display:flex;gap:12px;align-items:center;justify-content:space-between}.add-row select{margin:0;flex:1}.resource-heading button{background:none;border:0;color:#a52c28;font-size:12px;cursor:pointer}.add-row button{padding:9px 12px;border:1px solid #b6cec6;border-radius:5px;background:white;color:#155845;cursor:pointer;font-size:12px;white-space:nowrap}.check{display:flex;align-items:center;gap:9px}.missing{color:#99651f;background:#fff6e5;padding:10px;border-radius:5px;font-size:12px;margin:0}.empty{font-size:13px;padding:20px;background:#f4f8f7;color:#4b655d;border-radius:7px}@media(max-width:700px){.editor-grid{grid-template-columns:1fr}.add-row{flex-wrap:wrap}}

.step-type-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.step-type-choices button{display:grid;gap:8px;text-align:left;border:1px solid #d5dfe8;border-radius:8px;background:#fff;padding:16px;color:#243b53;cursor:pointer;font:inherit}.step-type-choices span{font-size:12px;color:#62748a;line-height:1.7}.completion-help{display:grid;gap:6px;background:#f1f5f9;padding:14px 18px;font-size:13px;color:#52657b;line-height:1.7;border-radius:7px}.completion-help strong{color:#243b53}summary{cursor:pointer;font-size:13px;color:#52657b}.resource-editor{min-width:0}@media(max-width:850px){.step-type-choices{grid-template-columns:1fr 1fr}}@media(max-width:550px){.step-type-choices{grid-template-columns:1fr}}
</style>
