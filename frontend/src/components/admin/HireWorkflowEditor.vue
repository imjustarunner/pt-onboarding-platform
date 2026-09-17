<template>
  <div class="workflow-editor">
    <div class="intro"><h3>{{ heading }}</h3><p>Agency defaults are inherited by the job posting, then customized for the person before sending. Each resource becomes a step in its own process.</p></div>
    <div v-if="branding" class="editor-grid"><label>Portal banner image URL<input :value="modelValue.bannerUrl" type="url" placeholder="https://…" @input="patch({ bannerUrl: $event.target.value })" /></label><label>Tenant welcome tagline<input :value="modelValue.tagline" maxlength="160" @input="patch({ tagline: $event.target.value })" /></label></div>
    <div v-if="supervisorSettings" class="supervisor-config"><h4>Supervisory role option</h4><p>These approved materials are included when the new hire will perform supervisory duties. Assigning their own supervisor is a separate choice.</p><label>Supervisor acknowledgement to sign<select :value="modelValue.supervisorTemplateId" @change="patch({ supervisorTemplateId: Number($event.target.value) || null })"><option value="">Select a signature template</option><option v-for="t in signatureTemplates" :key="t.id" :value="t.id">{{ t.name }}</option></select></label><label>Approved contract clause for supervisory duties<textarea :value="modelValue.supervisorClause" rows="4" placeholder="Enter your organization’s approved supervisory responsibilities clause." @input="patch({ supervisorClause: $event.target.value })" /></label></div>
    <div class="add-row"><select v-model="catalogKey" aria-label="Add a standard onboarding item"><option value="">Choose an item to add…</option><option v-for="item in catalog" :key="item.id" :value="item.id">{{ item.title }}</option></select><button type="button" @click="addCatalog" :disabled="!catalogKey">Add item</button><button type="button" @click="addCustom">Add custom step</button></div>
    <div v-if="!resources.length" class="empty">No extra steps configured. Background authorization, job description, employment agreement, work email, pre-employment information, headshot and handbook are built in.</div>
    <article v-for="(item, index) in resources" :key="item.id" class="resource-editor">
      <div class="resource-heading"><strong>{{ index + 1 }}. {{ item.title || 'New step' }}</strong><button type="button" @click="remove(item.id)">Remove</button></div>
      <div class="editor-grid"><label>Title<input :value="item.title" @input="change(item.id, { title: $event.target.value })" /></label><label>Process<select :value="item.phase" @change="change(item.id, { phase: $event.target.value })"><option value="pre_hire">Pre-hire</option><option value="onboarding">Onboarding</option></select></label><label>Step type<select :value="item.kind" @change="change(item.id, { kind: $event.target.value })"><option value="document">Document template · fill, review and sign</option><option value="acknowledgement">Linked document · signed acknowledgement</option><option value="upload">Download blank form · upload completed copy</option><option value="video">Embedded video</option><option value="link">Training / resource link</option><option value="meeting">Meeting scheduler</option></select></label><label v-if="item.kind === 'document'">Document template<select :value="item.templateId" @change="change(item.id, { templateId: Number($event.target.value) || null })"><option value="">Choose a template</option><option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option></select><small>Configure fillable fields and the correct form edition in Documents Library.</small></label><label v-else>{{ item.kind === 'meeting' ? 'Scheduling link' : 'Viewer, video or blank form link' }}<input :value="item.url" type="url" placeholder="https://…" @input="change(item.id, { url: $event.target.value })" /></label></div>
      <label>Instructions<textarea :value="item.instructions" rows="2" @input="change(item.id, { instructions: $event.target.value })" /></label><label class="check"><input type="checkbox" :checked="item.required !== false" @change="change(item.id, { required: $event.target.checked })" />Required to complete this process</label><p v-if="item.required !== false && !(item.kind === 'document' ? item.templateId : item.url)" class="missing">Attach this item before sending the packet.</p>
    </article>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue';
const props = defineProps({ modelValue: { type: Object, default: () => ({}) }, templates: { type: Array, default: () => [] }, heading: { type: String, default: 'Portal steps' }, branding: Boolean, supervisorSettings: Boolean });
const emit = defineEmits(['update:modelValue']);
const resources = computed(() => props.modelValue.resources || []);
const signatureTemplates = computed(() => props.templates.filter(t => (t.document_action_type || 'signature') === 'signature'));
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
  { id: 'training-link', title: 'Training resources', kind: 'link' }
].map(r => ({ phase: 'onboarding', required: true, url: '', ...r }));
function patch(values) { emit('update:modelValue', { ...props.modelValue, ...values }); }
function change(id, values) { patch({ resources: resources.value.map(r => r.id === id ? { ...r, ...values } : r) }); }
function remove(id) { patch({ resources: resources.value.filter(r => r.id !== id), excludedResourceIds: [...new Set([...(props.modelValue.excludedResourceIds || []), id])] }); }
function addCatalog() { const item = catalog.find(r => r.id === catalogKey.value); if (item && !resources.value.some(r => r.id === item.id)) patch({ resources: [...resources.value, { ...item }], excludedResourceIds: (props.modelValue.excludedResourceIds || []).filter(id => id !== item.id) }); catalogKey.value = ''; }
function addCustom() { patch({ resources: [...resources.value, { id: crypto.randomUUID(), title: '', phase: 'onboarding', kind: 'link', required: true, url: '' }] }); }
</script>
<style scoped>
.workflow-editor{display:grid;gap:18px}.intro h3{margin:0}.intro p,.supervisor-config p{color:#56657a;font-size:13px;line-height:1.6}.editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}label{display:block;font-size:12px;font-weight:600}input:not([type=checkbox]),select,textarea{display:block;width:100%;margin-top:6px;border:1px solid #ced8e0;border-radius:5px;background:#fff;color:#192f42;font:inherit;padding:9px}small{display:block;color:#52657c;font-weight:400;margin-top:6px}.resource-editor,.supervisor-config{padding:18px;border:1px solid #dde5e9;border-radius:7px;display:grid;gap:15px}.resource-heading,.add-row{display:flex;gap:12px;align-items:center;justify-content:space-between}.add-row select{margin:0;flex:1}.resource-heading button{background:none;border:0;color:#a52c28;font-size:12px;cursor:pointer}.add-row button{padding:9px 12px;border:1px solid #b6cec6;border-radius:5px;background:white;color:#155845;cursor:pointer;font-size:12px;white-space:nowrap}.check{display:flex;align-items:center;gap:9px}.missing{color:#99651f;background:#fff6e5;padding:10px;border-radius:5px;font-size:12px;margin:0}.empty{font-size:13px;padding:20px;background:#f4f8f7;color:#4b655d;border-radius:7px}@media(max-width:700px){.editor-grid{grid-template-columns:1fr}.add-row{flex-wrap:wrap}}
</style>
