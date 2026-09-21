<template>
  <div class="jpde">
    <div class="jpde-head">
      <div>
        <h4>{{ heading }}</h4>
        <p class="muted">
          These items appear on the candidate’s pre-hire portal. Write a branded acknowledgement, attach a document to fill and sign, or request an upload. Included items are listed below.
        </p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" @click="addDoc('write')">Write / paste document</button>
      <button type="button" class="btn btn-secondary btn-sm" @click="addDoc('upload')">Upload document</button>
    </div>

    <div class="jpde-kind-guide" role="note">
      <div class="jpde-kind-guide-item">
        <strong>Sign job description</strong>
        <span>Copies this posting’s details into the portal for the candidate to read and sign.</span>
      </div>
      <div class="jpde-kind-guide-item">
        <strong>Company document to sign</strong>
        <span>Paste formatted text on your letterhead, or attach a PDF candidates can fill and sign.</span>
      </div>
      <div class="jpde-kind-guide-item">
        <strong>Candidate upload</strong>
        <span>Candidate uploads their completed form or receipt (optionally download your blank first).</span>
      </div>
      <div class="jpde-kind-guide-item">
        <strong>Printable / external</strong>
        <span>Printable instructions page, or open an outside vendor site (IdentoGO, etc.).</span>
      </div>
    </div>

    <section v-if="allowAgencyDefault" class="jpde-card">
      <h4>Agency defaults included with this job</h4>
      <p v-if="catalogError" role="alert">{{ catalogError }} <button type="button" @click="loadCatalog">Retry</button></p>
      <p v-else-if="catalogLoading">Loading available documents…</p>
      <p v-else-if="!inheritedDocuments.length">No additional agency default documents.</p>
      <div v-for="doc in inheritedDocuments" :key="doc.id" class="jpde-card-head">
        <label><input type="checkbox" :checked="!(model.excludedDocumentIds || []).includes(doc.id)" @change="toggleDefault(doc.id, $event.target.checked)" /> {{ doc.title }} · {{ doc.kind === 'company_document' ? 'Review and sign' : doc.kind.replaceAll('_', ' ') }}</label>
        <button type="button" class="btn btn-secondary btn-sm" @click="customizeDefault(doc)">View / customize for this job</button>
      </div>
    </section>
    <h4>{{ allowAgencyDefault ? 'Job-specific documents' : 'Included documents' }} · {{ model.documents.length }}</h4>
    <p v-if="!model.documents.length" class="jpde-empty muted">Use the buttons above to add a document.</p>
    <div v-for="(doc, idx) in model.documents" :key="doc.id || idx" class="jpde-card">
      <div class="jpde-card-head">
        <strong>{{ doc.title || `Document ${idx + 1}` }} <small v-if="doc.templateId">· Library template</small></strong>
        <button type="button" class="jpde-remove" @click="removeDoc(idx)">Remove</button>
      </div>
      <div class="jpde-grid">
        <label>Title
          <input v-model="doc.title" class="input" type="text" placeholder="e.g. Handbook acknowledgement" />
        </label>
        <label>What should the candidate do?
          <select v-model="doc.kind" class="input">
            <option value="acknowledgement">Sign job description</option>
            <option value="company_document">Company document to review &amp; sign</option>
            <option value="upload">Candidate file upload</option>
            <option value="print_only">Printable instructions</option>
            <option value="reference">External website link</option>
          </select>
        </label>
        <label v-if="doc.kind === 'reference'">Website URL
          <input v-model="doc.url" class="input" type="url" placeholder="https://uenroll.identogo.com/…" />
          <span class="jpde-field-hint">Candidate taps “Open link” and leaves your portal for this site.</span>
        </label>
        <label v-if="doc.kind === 'company_document' && !doc.templateId">Document source
          <select :value="doc.bodyHtml || doc.sourceMode === 'write' ? 'write' : 'upload'" class="input" @change="setSource(doc, $event.target.value)"><option value="write">Write / paste branded document</option><option value="upload">Upload PDF or image</option></select>
        </label>
        <div v-if="!doc.templateId && ((doc.kind === 'company_document' && !doc.bodyHtml && doc.sourceMode !== 'write') || doc.kind === 'upload')" class="jpde-file-block">
          <label>{{ doc.kind === 'company_document' ? 'Upload company document' : 'Upload blank form (optional)' }}
            <input
              class="input"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
              :disabled="!!uploadBusy[doc.id]"
              @change="onFilePicked(doc, $event)"
            />
          </label>
          <p v-if="doc.fileName || doc.filePath" class="jpde-file-current">
            Attached: <strong>{{ doc.fileName || 'Uploaded file' }}</strong>
            <button type="button" class="jpde-clear-file" @click="clearFile(doc)">Remove file</button>
          </p>
          <p v-if="uploadError[doc.id]" class="jpde-upload-err">{{ uploadError[doc.id] }}</p>
          <p v-if="uploadBusy[doc.id]" class="jpde-field-hint">Uploading…</p>
          <span class="jpde-field-hint">
            {{
              doc.kind === 'company_document'
                ? 'Candidate sees this file in their portal and signs to acknowledge it. No external link needed.'
                : 'Optional: give candidates your blank form to download before they upload their completed copy.'
            }}
          </span>
        </div>
        <label>Scheduled on (optional)
          <input v-model="doc.scheduledOn" class="input" type="date" />
        </label>
      </div>
      <LibraryDocumentEditor v-if="doc.kind === 'company_document' && !doc.templateId && (doc.bodyHtml || doc.sourceMode === 'write')" v-model="doc.bodyHtml" v-model:branding-mode="doc.brandingMode" v-model:letterhead-template-id="doc.letterheadTemplateId" :agency-id="agencyId" :name="doc.title || 'Acknowledgement'" />
      <p v-if="doc.templateId" class="muted">This template will be assigned as a document step. <a :href="templateEditUrl(doc.templateId)" target="_blank" rel="noopener">View / edit template ↗</a></p>
      <label class="jpde-full">Portal instructions
        <textarea
          v-model="doc.instructions"
          class="textarea"
          rows="2"
          :placeholder="instructionsPlaceholder(doc.kind)"
        />
      </label>
      <label v-if="doc.kind === 'print_only'" class="jpde-full">Print-page instructions
        <textarea
          v-model="doc.printInstructions"
          class="textarea"
          rows="4"
          placeholder="Shown only on the print page — step-by-step what to print or bring."
        />
      </label>
      <div class="jpde-actions-row">
        <p class="jpde-kind-callout">{{ kindCallout(doc.kind) }}</p>
        <button
          v-if="allowAgencyDefault"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="!!defaultBusy[doc.id] || !String(doc.title || '').trim()"
          @click="saveAsAgencyDefault(doc)"
        >
          {{ defaultBusy[doc.id] ? 'Saving…' : (defaultDone[doc.id] ? 'Saved as agency default' : 'Also set as agency default') }}
        </button>
      </div>
      <p v-if="defaultError[doc.id]" class="jpde-upload-err">{{ defaultError[doc.id] }}</p>
    </div>
    <section class="jpde-card">
      <h4>Available document templates</h4>
      <p class="muted">Attach an existing template here. Included templates are marked.</p>
      <p v-if="!allowAgencyDefault && catalogError" role="alert">{{ catalogError }} <button type="button" @click="loadCatalog">Retry</button></p>
      <p v-if="!availableTemplates.length && !catalogLoading">No active document templates in this agency.</p>
      <label class="jpde-full">Find a document<input v-model="templateSearch" type="search" class="input" placeholder="Search available documents" /></label><div class="jpde-template-list">
      <div v-for="template in filteredTemplates" :key="template.id" class="jpde-card-head">
        <span><a :href="templateEditUrl(template.id)" target="_blank" rel="noopener">{{ template.name }} · View / edit ↗</a></span><button type="button" class="btn btn-secondary btn-sm" :disabled="templateIncluded(template.id)" @click="attachTemplate(template)">{{ templateIncluded(template.id) ? 'Included' : 'Include document' }}</button>
      </div></div>
    </section>
    <HireWorkflowEditor v-if="allowAgencyDefault" :model-value="model.workflow || {}" @update:model-value="model = { ...model, workflow: $event }" :templates="availableTemplates" phase="pre_hire" heading="Job-specific videos, links and meetings" />
  </div>
</template>

<script setup>
import HireWorkflowEditor from '../admin/HireWorkflowEditor.vue';
import LibraryDocumentEditor from '../library/LibraryDocumentEditor.vue';
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useRoute } from 'vue-router';

const props = defineProps({
  modelValue: { type: Object, default: () => ({ documents: [] }) },
  heading: { type: String, default: 'Pre-hire documents for this job' },
  agencyId: { type: [Number, String], default: null },
  allowAgencyDefault: { type: Boolean, default: true }
});
const emit = defineEmits(['update:modelValue']);
const route = useRoute();
function templateEditUrl(id) { return `${route.params.organizationSlug ? '/' + encodeURIComponent(route.params.organizationSlug) : ''}/admin/documents/${id}/edit?agencyId=${encodeURIComponent(props.agencyId)}`; }

const availableTemplates = ref([]), agencyDocuments = ref([]), catalogError = ref(''), catalogLoading = ref(false);
const templateSearch = ref('');
const filteredTemplates = computed(() => availableTemplates.value.filter(t => t.name?.toLowerCase().includes(templateSearch.value.toLowerCase())));
const inheritedDocuments = computed(() => agencyDocuments.value.filter(d => !model.value.documents.some(local => local.id === d.id)));
let catalogRequest = 0;
async function loadCatalog() {
  const request = ++catalogRequest;
  availableTemplates.value = []; agencyDocuments.value = []; catalogError.value = '';
  if (!Number(props.agencyId)) return;
  catalogLoading.value = true;
  try {
    const [templates, defaults] = await Promise.all([
      api.get('/document-templates', { params: { agencyId: props.agencyId, limit: 1000 } }),
      props.allowAgencyDefault ? api.get('/hiring/settings', { params: { agencyId: props.agencyId } }) : Promise.resolve({ data: {} })
    ]);
    if (request !== catalogRequest) return;
    const list = Array.isArray(templates.data) ? templates.data : templates.data?.templates || templates.data?.data || [];
    availableTemplates.value = list.filter(t => (t.agency_id == null || Number(t.agency_id) === Number(props.agencyId)) && t.is_active !== false && t.is_active !== 0);
    agencyDocuments.value = defaults.data?.settings?.default_prehire_docs || [];
  } catch { if (request === catalogRequest) catalogError.value = 'Could not load available documents.'; }
  finally { if (request === catalogRequest) catalogLoading.value = false; }
}
function toggleDefault(id, include) {
  model.value = { ...model.value, excludedDocumentIds: include ? (model.value.excludedDocumentIds || []).filter(x => x !== id) : [...new Set([...(model.value.excludedDocumentIds || []), id])] };
}
function customizeDefault(doc) { model.value = { ...model.value, documents: [...model.value.documents, JSON.parse(JSON.stringify(doc))], excludedDocumentIds: (model.value.excludedDocumentIds || []).filter(id => id !== doc.id) }; }
function templateIncluded(id) { return [...model.value.documents, ...inheritedDocuments.value.filter(d => !(model.value.excludedDocumentIds || []).includes(d.id))].some(d => Number(d.templateId) === Number(id)); }
function attachTemplate(template) { if (!templateIncluded(template.id)) model.value = { ...model.value, documents: [...model.value.documents, { ...blankDoc(), title: template.name, templateId: template.id }] }; }
function setSource(doc, source) { doc.sourceMode = source; if (source === 'write') clearFile(doc); else doc.bodyHtml = ''; }
watch(() => props.agencyId, loadCatalog, { immediate: true });
const uploadBusy = reactive({});
const uploadError = reactive({});
const defaultBusy = reactive({});
const defaultDone = reactive({});
const defaultError = reactive({});

const model = computed({
  get: () => {
    const v = props.modelValue && typeof props.modelValue === 'object' ? props.modelValue : {};
    if (!Array.isArray(v.documents)) v.documents = [];
    return v;
  },
  set: (val) => emit('update:modelValue', val)
});

const agencyParams = () => {
  const id = Number(props.agencyId || 0);
  return id > 0 ? { agencyId: id } : {};
};

const blankDoc = () => ({
  id: `doc-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
  kind: 'company_document',
  title: '',
  instructions: '',
  printInstructions: '',
  url: '',
  filePath: '',
  fileName: '',
  mimeType: '',
  templateId: '',
  scheduledOn: ''
});

const addDoc = (sourceMode = 'write') => {
  model.value = { ...model.value, documents: [...model.value.documents, { ...blankDoc(), sourceMode, bodyHtml: '', brandingMode: 'organization' }] };
};
const removeDoc = (idx) => {
  model.value.documents.splice(idx, 1);
};

const clearFile = (doc) => {
  doc.filePath = '';
  doc.fileName = '';
  doc.mimeType = '';
  doc.url = '';
};

const onFilePicked = async (doc, event) => {
  const file = event?.target?.files?.[0];
  if (!file) return;
  uploadError[doc.id] = '';
  uploadBusy[doc.id] = true;
  try {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.post('/hiring/prehire-doc-files', fd, {
      params: agencyParams(),
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    doc.filePath = data.filePath || '';
    doc.fileName = data.fileName || file.name;
    doc.mimeType = data.mimeType || file.type || '';
    // Keep signed view URL out of persisted config — portal resolves via filePath.
    if (doc.kind === 'upload' && data.viewUrl) {
      // Optional convenience for candidate blank-form download while admin is editing;
      // portal prefers filePath when present.
      doc.url = '';
    }
  } catch (e) {
    uploadError[doc.id] = e?.response?.data?.error?.message || 'Upload failed.';
  } finally {
    uploadBusy[doc.id] = false;
    if (event?.target) event.target.value = '';
  }
};

const saveAsAgencyDefault = async (doc) => {
  defaultError[doc.id] = '';
  defaultDone[doc.id] = false;
  if (!String(doc.title || '').trim()) {
    defaultError[doc.id] = 'Add a title before saving as an agency default.';
    return;
  }
  defaultBusy[doc.id] = true;
  try {
    await api.post(
      '/hiring/prehire-docs/agency-default',
      { document: { ...doc } },
      { params: agencyParams() }
    );
    defaultDone[doc.id] = true;
  } catch (e) {
    defaultError[doc.id] = e?.response?.data?.error?.message || 'Could not save agency default.';
  } finally {
    defaultBusy[doc.id] = false;
  }
};

const instructionsPlaceholder = (kind) => {
  switch (String(kind || '')) {
    case 'print_only':
      return 'e.g. Print these instructions and bring them to your IdentoGO appointment.';
    case 'reference':
      return 'e.g. Complete fingerprint enrollment on the IdentoGO site, then return here.';
    case 'upload':
      return 'e.g. Upload a photo or PDF of your completed fingerprint receipt.';
    case 'company_document':
      return 'e.g. Read this document carefully, then sign to acknowledge you received and understand it.';
    default:
      return 'e.g. Read the job description carefully, then sign to acknowledge the role expectations.';
  }
};

const kindCallout = (kind) => {
  switch (String(kind || '')) {
    case 'print_only':
      return 'Candidate sees an “Open print page” button. Put the long checklist in Print-page instructions.';
    case 'reference':
      return 'Candidate sees an “Open link” button. Use this only for vendor sites you do not host.';
    case 'upload':
      return 'Candidate uploads a file to their hire record. Optionally attach your blank form above.';
    case 'company_document':
      return 'Candidate fills and signs this document in the portal. The completed PDF and visible signature stay on their hire record.';
    default:
      return 'Candidate reviews this job’s description in the portal and signs. That signed copy is kept on their hire record.';
  }
};
</script>

<style scoped>
.jpde { margin-top: 14px; }
.jpde-template-list { max-height: 300px; overflow: auto; margin-top: 12px; }
.jpde-card-head { gap: 12px; flex-wrap: wrap; }
.jpde-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: flex-start; }
.jpde-head h4 { margin: 0 0 4px; }
.jpde-empty { padding: 10px 0; }
.jpde-kind-guide {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0 4px;
}
.jpde-kind-guide-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 0.8rem;
  color: #475569;
  line-height: 1.4;
}
.jpde-kind-guide-item strong {
  color: #0f172a;
  font-size: 0.82rem;
}
.jpde-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 14px;
  margin-top: 10px;
  background: #fff;
}
.jpde-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.jpde-remove { border: 0; background: none; color: #b91c1c; font-weight: 650; cursor: pointer; }
.jpde-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.jpde-grid label, .jpde-full, .jpde-file-block { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; font-weight: 650; }
.jpde-file-block { grid-column: 1 / -1; }
.jpde-full { margin-top: 8px; }
.jpde-field-hint {
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
  line-height: 1.35;
}
.jpde-file-current {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 500;
  color: #065f46;
}
.jpde-clear-file {
  margin-left: 8px;
  border: 0;
  background: none;
  color: #b91c1c;
  font-weight: 650;
  cursor: pointer;
  font-size: 0.75rem;
}
.jpde-upload-err {
  margin: 4px 0 0;
  color: #b91c1c;
  font-size: 0.78rem;
  font-weight: 600;
}
.jpde-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
  margin-top: 10px;
}
.jpde-kind-callout {
  margin: 0;
  flex: 1;
  min-width: 200px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  font-size: 0.78rem;
  font-weight: 550;
  line-height: 1.4;
}
.muted { color: #6b7280; font-size: 0.85rem; font-weight: 400; }
@media (max-width: 720px) {
  .jpde-grid,
  .jpde-kind-guide { grid-template-columns: 1fr; }
}
</style>
