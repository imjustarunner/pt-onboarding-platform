<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Intake Links</h1>
        <p class="subtitle">Configure digital intake links, documents, and custom fields.</p>
      </div>
      <button class="btn btn-primary" type="button" @click="openCreate">New Intake Link</button>
    </div>

    <div class="quick-create">
      <h3>Quick Create</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Scope</label>
          <select v-model="quickScope">
            <option value="school">School</option>
            <option value="program">Program</option>
            <option value="agency">Agency</option>
          </select>
        </div>
        <div class="form-group" v-if="quickScope !== 'agency'">
          <label>Organization</label>
          <select v-model.number="quickOrganizationId">
            <option :value="null">Select</option>
            <option v-for="org in organizationsForQuickScope" :key="org.id" :value="org.id">
              {{ org.name }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>Title</label>
          <input v-model="quickTitle" type="text" placeholder="e.g., School Intake Link" />
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="createQuickLink">Create Link</button>
      <div v-if="quickError" class="error">{{ quickError }}</div>
    </div>

    <div class="filters">
      <select v-model="filterScope">
        <option value="all">All Scopes</option>
        <option value="agency">Agency</option>
        <option value="school">School</option>
        <option value="program">Program</option>
      </select>
      <select v-model="filterOrgId">
        <option value="all">All Orgs</option>
        <option v-for="org in organizations" :key="org.id" :value="org.id">
          {{ org.name }} ({{ org.organization_type || 'agency' }})
        </option>
      </select>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Scope</th>
            <th>Active</th>
            <th>Guardian</th>
            <th>Documents</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="link in filteredLinks" :key="link.id">
            <td>{{ link.title || `Link ${link.id}` }}</td>
            <td>
              {{ link.scope_type }}
              <span v-if="link.organization_id">
                {{
                  organizationLookup.get(Number(link.organization_id))?.name
                    || `#${link.organization_id}`
                }}
              </span>
            </td>
            <td>{{ link.is_active ? 'Yes' : 'No' }}</td>
            <td>{{ link.create_guardian ? 'Yes' : 'No' }}</td>
            <td>{{ (link.allowed_document_template_ids || []).length }}</td>
            <td class="actions">
              <button class="btn btn-secondary btn-sm" type="button" @click="editLink(link)">Edit</button>
              <button class="btn btn-secondary btn-sm" type="button" @click="duplicateLink(link)">Duplicate</button>
              <button class="btn btn-secondary btn-sm" type="button" @click="copyLink(link)">Copy URL</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="template-panel">
      <h3>Intake Field Templates</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Agency</label>
          <select v-model.number="selectedAgencyId">
            <option v-for="agency in agencyList" :key="agency.id" :value="agency.id">
              {{ agency.name }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>Template name</label>
          <input v-model="fieldTemplateName" type="text" />
        </div>
      </div>
      <div class="form-group">
        <label>Fields JSON</label>
        <textarea v-model="fieldTemplateJson" rows="5"></textarea>
      </div>
      <div class="actions">
        <button class="btn btn-primary" type="button" @click="saveFieldTemplate">Save Template</button>
      </div>
      <div class="template-list">
        <div v-for="t in fieldTemplates" :key="t.id" class="template-row">
          <div>
            <strong>{{ t.name }}</strong>
            <div class="muted">Agency {{ t.agency_id }}</div>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" @click="applyFieldTemplate(t)">Apply to Form</button>
        </div>
      </div>
    </div>

    <div v-if="showForm" class="modal-overlay" @click.self="closeForm">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <strong>{{ editingId ? 'Edit Intake Link' : 'Create Intake Link' }}</strong>
          <button class="btn btn-secondary btn-sm" type="button" @click="closeForm">Close</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Title</label>
              <input v-model="form.title" type="text" />
            </div>
            <div class="form-group">
              <label>Description</label>
              <input v-model="form.description" type="text" />
            </div>
            <div class="form-group">
              <label>Scope</label>
              <select v-model="form.scopeType">
                <option value="agency">Agency</option>
                <option value="school">School</option>
                <option value="program">Program</option>
              </select>
            </div>
            <div v-if="form.scopeType !== 'agency'" class="form-group">
              <label>Organization</label>
              <select v-model.number="form.organizationId">
                <option :value="null">Select</option>
                <option v-for="org in organizationsForScope" :key="org.id" :value="org.id">
                  {{ org.name }} ({{ org.organization_type }})
                </option>
              </select>
            </div>
            <div v-if="form.scopeType === 'program'" class="form-group">
              <label>Program ID (optional)</label>
              <input v-model.number="form.programId" type="number" />
            </div>
            <div class="form-group">
              <label>Active</label>
              <select v-model="form.isActive">
                <option :value="true">Yes</option>
                <option :value="false">No</option>
              </select>
            </div>
            <div class="form-group">
              <label>Create Client</label>
              <select v-model="form.createClient">
                <option :value="true">Yes</option>
                <option :value="false">No</option>
              </select>
            </div>
            <div class="form-group">
              <label>Create Guardian (default)</label>
              <select v-model="form.createGuardian">
                <option :value="true">Yes</option>
                <option :value="false">No</option>
              </select>
            </div>
            <div class="form-group">
              <label>Intake retention</label>
              <select v-model="form.retentionPolicy.mode">
                <option value="inherit">Use agency default</option>
                <option value="days">Delete after N days</option>
                <option value="never">Never delete automatically</option>
              </select>
            </div>
            <div class="form-group" v-if="form.retentionPolicy.mode === 'days'">
              <label>Days to retain</label>
              <input v-model.number="form.retentionPolicy.days" type="number" min="1" max="3650" />
            </div>
          </div>

          <div class="form-group">
            <label>Allowed Document Templates</label>
            <label class="checkbox">
              <input v-model="form.allowAllDocuments" type="checkbox" />
              Allow all document templates
            </label>
            <div v-if="hasDocumentSteps && !showTemplateChecklist" class="muted" style="margin-top: 6px;">
              Templates are ordered via your Document steps.
              <button class="btn btn-secondary btn-xs" type="button" @click="showTemplateChecklist = true">
                Show checklist
              </button>
            </div>
            <div class="template-list" v-else-if="selectableTemplates.length">
              <div v-if="templateGroups.organizationTemplates.length" class="template-group-title">
                Organization templates
              </div>
              <label v-for="t in templateGroups.organizationTemplates" :key="`org_${t.id}`" class="template-item">
                <input
                  type="checkbox"
                  :value="t.id"
                  v-model="form.allowedDocumentTemplateIds"
                  :disabled="form.allowAllDocuments"
                />
                {{ t.name || `Template ${t.id}` }}
              </label>
              <div class="template-group-title">Agency templates</div>
              <label v-for="t in templateGroups.agencyTemplates" :key="`agency_${t.id}`" class="template-item">
                <input
                  type="checkbox"
                  :value="t.id"
                  v-model="form.allowedDocumentTemplateIds"
                  :disabled="form.allowAllDocuments"
                />
                {{ t.name || `Template ${t.id}` }}
              </label>
              <div v-if="hasDocumentSteps" class="template-group-title">
                <button class="btn btn-secondary btn-xs" type="button" @click="showTemplateChecklist = false">
                  Hide checklist
                </button>
              </div>
            </div>
            <div v-else class="muted">No document templates found yet.</div>
          </div>

          <div class="form-group">
            <label>Intake Flow Builder</label>
            <div class="step-builder">
              <div class="step-actions">
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('questions')">+ Add Questions</button>
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('document')">+ Add Document</button>
              </div>

              <div v-if="form.intakeSteps.length === 0" class="muted">No steps yet.</div>

              <div v-for="(step, idx) in safeSteps" :key="step.id" class="step-card">
                <div class="step-header">
                  <strong>{{ step.type === 'document' ? 'Document' : 'Questions' }}</strong>
                  <div class="step-controls">
                    <button class="btn btn-xs btn-secondary" type="button" @click="moveStep(idx, -1)" :disabled="idx === 0">↑</button>
                    <button class="btn btn-xs btn-secondary" type="button" @click="moveStep(idx, 1)" :disabled="idx === form.intakeSteps.length - 1">↓</button>
                    <button class="btn btn-xs btn-danger" type="button" @click="removeStep(idx)">Remove</button>
                  </div>
                </div>

                <div v-if="step.type === 'document'" class="form-grid">
                  <div class="form-group">
                    <label>Document Template</label>
                    <select v-model.number="step.templateId">
                      <option :value="null">Select document</option>
                      <option
                        v-for="t in documentStepTemplates"
                        :key="t.id"
                        :value="t.id"
                      >
                        {{ t.name }} ({{ t.document_action_type }})
                      </option>
                    </select>
                    <div v-if="!templates.length" class="muted">
                      No document templates available. Create one in Documents Library.
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Checkbox instructions (optional)</label>
                    <textarea
                      v-model="step.checkboxDisclaimer"
                      rows="2"
                      placeholder="e.g., Check each box if you agree with the statement on that line. You may uncheck any you do not agree with."
                    ></textarea>
                  </div>
                </div>

                <div v-else class="question-builder">
                  <div class="question-list">
                    <div v-for="(field, fIdx) in getStepFields(step)" :key="field.id || fIdx" class="question-block">
                      <div class="question-row">
                        <div class="question-index">#{{ fIdx + 1 }}</div>
                        <input v-model="field.label" placeholder="Question label" />
                        <input v-model="field.key" placeholder="Key (e.g., grade)" />
                        <select v-model="field.type">
                          <option value="text">Short answer</option>
                          <option value="textarea">Long answer</option>
                          <option value="checkbox">Checkbox</option>
                          <option value="select">Select</option>
                          <option value="radio">Radio</option>
                          <option value="date">Date</option>
                          <option value="info">Info / Disclaimer</option>
                        </select>
                        <select v-model="field.scope">
                          <option value="client">Client (repeats per child)</option>
                          <option value="guardian">Guardian (one-time)</option>
                          <option value="submission">One-time (global)</option>
                        </select>
                        <label class="checkbox">
                          <input v-model="field.required" type="checkbox" :disabled="field.type === 'info'" />
                          Required
                        </label>
                        <div class="question-controls">
                          <button class="btn btn-xs btn-secondary" type="button" @click="moveField(step, fIdx, -1)" :disabled="fIdx === 0">↑</button>
                          <button class="btn btn-xs btn-secondary" type="button" @click="moveField(step, fIdx, 1)" :disabled="fIdx === getStepFields(step).length - 1">↓</button>
                          <button class="btn btn-xs btn-secondary" type="button" @click="addFieldAfter(step, fIdx)">＋</button>
                          <button class="btn btn-xs btn-danger" type="button" @click="removeField(step, fIdx)">×</button>
                        </div>
                      </div>
                      <div class="question-meta">
                        <input v-model="field.helperText" placeholder="Helper text / disclaimer (optional)" />
                    <input
                      v-model="field.documentKey"
                      placeholder="Document field key for autofill (optional)"
                    />
                        <div class="condition-row">
                          <select v-model="field.showIf.fieldKey">
                            <option value="">Show if (optional)</option>
                            <option
                              v-for="target in getConditionalTargets(step, fIdx)"
                              :key="target.key"
                              :value="target.key"
                            >
                              {{ target.label || target.key }}
                            </option>
                          </select>
                          <input
                            v-model="field.showIf.equals"
                            :disabled="!field.showIf.fieldKey"
                            placeholder="Equals value (e.g., yes)"
                          />
                        </div>
                      </div>
                      <div v-if="field?.type === 'select' || field?.type === 'radio'" class="option-list">
                        <div v-for="(opt, oIdx) in field.options" :key="opt.id" class="option-row">
                          <input v-model="opt.label" placeholder="Option label" />
                          <input v-model="opt.value" placeholder="Value" />
                          <button class="btn btn-xs btn-secondary" type="button" @click="removeOption(field, oIdx)">×</button>
                        </div>
                        <button class="btn btn-xs btn-secondary" type="button" @click="addOption(field)">+ Option</button>
                      </div>
                    </div>
                  </div>
                  <button class="btn btn-xs btn-secondary" type="button" @click="addField(step)">+ Add Question</button>
                </div>
              </div>

              <div v-if="safeSteps.length" class="step-actions step-actions-bottom">
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('questions')">+ Add Questions</button>
                <button class="btn btn-secondary btn-sm" type="button" @click="addStep('document')">+ Add Document</button>
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-primary" type="button" :disabled="saving" @click="save">
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
            <div v-if="formError" class="error">{{ formError }}</div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';

const loading = ref(false);
const error = ref('');
const links = ref([]);
const templates = ref([]);
const organizations = ref([]);
const fieldTemplates = ref([]);
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const editingId = ref(null);
const autosaveTimer = ref(null);
const lastAutosaveAt = ref(null);
const showTemplateChecklist = ref(false);

const form = reactive({
  title: '',
  description: '',
  scopeType: 'school',
  organizationId: null,
  programId: null,
  isActive: true,
  createClient: true,
  createGuardian: true,
  retentionPolicy: {
    mode: 'inherit',
    days: 14
  },
  allowAllDocuments: false,
  allowedDocumentTemplateIds: [],
  intakeFieldsText: '',
  intakeSteps: []
});

const quickScope = ref('school');
const quickOrganizationId = ref(null);
const quickTitle = ref('');
const quickError = ref('');

const selectedAgencyId = ref(null);
const fieldTemplateName = ref('');
const fieldTemplateJson = ref('');

const organizationsForScope = computed(() => {
  const type = form.scopeType;
  if (type === 'school') return organizations.value.filter((o) => o.organization_type === 'school');
  if (type === 'program') return organizations.value.filter((o) => o.organization_type === 'program');
  return organizations.value;
});

const organizationsForQuickScope = computed(() => {
  if (quickScope.value === 'school') return organizations.value.filter((o) => o.organization_type === 'school');
  if (quickScope.value === 'program') return organizations.value.filter((o) => o.organization_type === 'program');
  return agencyList.value;
});

const agencyList = computed(() => organizations.value.filter((o) => String(o.organization_type || 'agency') === 'agency'));
const organizationLookup = computed(() => {
  const map = new Map();
  for (const org of organizations.value) {
    map.set(Number(org.id), org);
  }
  return map;
});

const resetForm = () => {
  form.title = '';
  form.description = '';
  form.scopeType = 'school';
  form.organizationId = null;
  form.programId = null;
  form.isActive = true;
  form.createClient = true;
  form.createGuardian = true;
  form.retentionPolicy = { mode: 'inherit', days: 14 };
  form.allowAllDocuments = false;
  form.allowedDocumentTemplateIds = [];
  form.intakeFieldsText = '';
  form.intakeSteps = [];
  formError.value = '';
  editingId.value = null;
};

const draftStorageKey = computed(() =>
  editingId.value ? `intake-link-draft:${editingId.value}` : 'intake-link-draft:new'
);

const serializeDraft = () => ({
  savedAt: Date.now(),
  form: {
    title: form.title,
    description: form.description,
    scopeType: form.scopeType,
    organizationId: form.organizationId,
    programId: form.programId,
    isActive: form.isActive,
    createClient: form.createClient,
    createGuardian: form.createGuardian,
    retentionPolicy: form.retentionPolicy ? { ...form.retentionPolicy } : null,
    allowAllDocuments: form.allowAllDocuments,
    allowedDocumentTemplateIds: Array.isArray(form.allowedDocumentTemplateIds)
      ? [...form.allowedDocumentTemplateIds]
      : [],
    intakeFieldsText: form.intakeFieldsText,
    intakeSteps: Array.isArray(form.intakeSteps) ? JSON.parse(JSON.stringify(form.intakeSteps)) : []
  }
});

const saveDraft = () => {
  if (!showForm.value) return;
  try {
    const payload = serializeDraft();
    localStorage.setItem(draftStorageKey.value, JSON.stringify(payload));
    lastAutosaveAt.value = payload.savedAt;
  } catch {
    // ignore storage errors
  }
};

const applyDraft = (draft) => {
  const data = draft?.form;
  if (!data) return;
  form.title = data.title ?? '';
  form.description = data.description ?? '';
  form.scopeType = data.scopeType || 'school';
  form.organizationId = data.organizationId ?? null;
  form.programId = data.programId ?? null;
  form.isActive = data.isActive ?? true;
  form.createClient = data.createClient ?? true;
  form.createGuardian = data.createGuardian ?? true;
  form.retentionPolicy = data.retentionPolicy
    ? { mode: data.retentionPolicy.mode || 'inherit', days: data.retentionPolicy.days ?? 14 }
    : { mode: 'inherit', days: 14 };
  form.allowAllDocuments = data.allowAllDocuments ?? false;
  form.allowedDocumentTemplateIds = Array.isArray(data.allowedDocumentTemplateIds)
    ? data.allowedDocumentTemplateIds
    : [];
  form.intakeFieldsText = data.intakeFieldsText || '';
  form.intakeSteps = sanitizeSteps(Array.isArray(data.intakeSteps) ? data.intakeSteps : []);
};

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(draftStorageKey.value);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed?.form) return;
    applyDraft(parsed);
  } catch {
    // ignore bad drafts
  }
};

const clearDraft = () => {
  try {
    localStorage.removeItem(draftStorageKey.value);
  } catch {
    // ignore
  }
};

const fetchData = async () => {
  try {
    loading.value = true;
    const [linksResp, templatesResp, orgsResp] = await Promise.all([
      api.get('/intake-links'),
      api.get('/document-templates'),
      api.get('/agencies')
    ]);
    links.value = linksResp.data || [];
    const rawTemplates =
      templatesResp.data?.data
      || templatesResp.data?.templates
      || templatesResp.data
      || [];
    templates.value = Array.isArray(rawTemplates) ? rawTemplates : [];
    organizations.value = Array.isArray(orgsResp.data) ? orgsResp.data : [];
    const primaryAgency = agencyList.value[0]?.id || null;
    selectedAgencyId.value = selectedAgencyId.value || primaryAgency;
    if (selectedAgencyId.value) {
      const r = await api.get('/intake-field-templates', { params: { agencyId: selectedAgencyId.value } });
      fieldTemplates.value = r.data || [];
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load intake links';
  } finally {
    loading.value = false;
  }
};

watch(selectedAgencyId, async (next) => {
  if (!next) return;
  const r = await api.get('/intake-field-templates', { params: { agencyId: next } });
  fieldTemplates.value = r.data || [];
});

watch(showForm, (open) => {
  if (open) {
    loadDraft();
    if (autosaveTimer.value) clearInterval(autosaveTimer.value);
    autosaveTimer.value = setInterval(saveDraft, 20000);
  } else if (autosaveTimer.value) {
    clearInterval(autosaveTimer.value);
    autosaveTimer.value = null;
  }
});

const handleBeforeUnload = () => {
  if (showForm.value) saveDraft();
};

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  if (autosaveTimer.value) {
    clearInterval(autosaveTimer.value);
    autosaveTimer.value = null;
  }
});

const openCreate = () => {
  resetForm();
  showForm.value = true;
};

const duplicateLink = async (link) => {
  try {
    const resp = await api.post(`/intake-links/${link.id}/duplicate`);
    const newLink = resp.data?.link;
    if (newLink) {
      links.value = [newLink, ...links.value];
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to duplicate intake link';
  }
};

const editLink = (link) => {
  resetForm();
  editingId.value = link.id;
  form.title = link.title || '';
  form.description = link.description || '';
  form.scopeType = link.scope_type || 'school';
  form.organizationId = link.organization_id || null;
  form.programId = link.program_id || null;
  form.isActive = !!link.is_active;
  form.createClient = !!link.create_client;
  form.createGuardian = !!link.create_guardian;
  form.retentionPolicy = (() => {
    const raw = link.retention_policy_json || null;
    if (!raw || typeof raw !== 'object') return { mode: 'inherit', days: 14 };
    const mode = ['inherit', 'days', 'never'].includes(String(raw.mode || '').toLowerCase())
      ? String(raw.mode || 'inherit').toLowerCase()
      : 'inherit';
    const days = Number.isFinite(Number(raw.days)) ? Number(raw.days) : 14;
    return { mode, days };
  })();
  form.allowAllDocuments = false;
  form.allowedDocumentTemplateIds = link.allowed_document_template_ids || [];
  form.intakeFieldsText = link.intake_fields ? JSON.stringify(link.intake_fields, null, 2) : '';
  form.intakeSteps = normalizeIntakeSteps(link);
  showForm.value = true;
};

const applyFieldTemplate = (template) => {
  if (!template?.fields_json) return;
  form.intakeFieldsText = JSON.stringify(template.fields_json, null, 2);
  if (!form.intakeSteps.length) {
    form.intakeSteps = [
      {
        id: createId('step'),
        type: 'questions',
        fields: template.fields_json || []
      }
    ];
  }
};

const saveFieldTemplate = async () => {
  try {
    formError.value = '';
    if (!selectedAgencyId.value || !fieldTemplateName.value.trim()) {
      formError.value = 'Agency and template name are required.';
      return;
    }
    const parsed = fieldTemplateJson.value.trim() ? JSON.parse(fieldTemplateJson.value) : [];
    await api.post('/intake-field-templates', {
      agencyId: selectedAgencyId.value,
      name: fieldTemplateName.value.trim(),
      fieldsJson: parsed
    });
    const r = await api.get('/intake-field-templates', { params: { agencyId: selectedAgencyId.value } });
    fieldTemplates.value = r.data || [];
    fieldTemplateName.value = '';
    fieldTemplateJson.value = '';
  } catch (e) {
    formError.value = e.response?.data?.error?.message || 'Failed to save field template';
  }
};

const closeForm = () => {
  showForm.value = false;
};

const formatApiError = (e, fallback) => {
  const message = e?.response?.data?.error?.message;
  const errors = e?.response?.data?.error?.errors;
  if (Array.isArray(errors) && errors.length) {
    const details = errors
      .map((err) => err?.msg || (err?.path ? `${err.path}: invalid` : null))
      .filter(Boolean)
      .join(', ');
    if (message && details) return `${message}: ${details}`;
    if (message) return message;
    if (details) return details;
  }
  if (message) return message;
  if (e?.message) return e.message;
  return fallback;
};

const save = async () => {
  try {
    saving.value = true;
    formError.value = '';
    const selectedTemplateIds = form.allowAllDocuments
      ? selectableTemplates.value.map((t) => t.id)
      : form.allowedDocumentTemplateIds;
    const { intakeSteps, intakeFields, allowedDocumentTemplateIds } = buildPayloadFromSteps(selectedTemplateIds);
    const payload = {
      title: form.title,
      description: form.description,
      scopeType: form.scopeType,
      isActive: form.isActive,
      createClient: form.createClient,
      createGuardian: form.createGuardian,
      retentionPolicy: form.retentionPolicy ? { ...form.retentionPolicy } : null,
      allowedDocumentTemplateIds,
      intakeFields,
      intakeSteps
    };
    if (form.scopeType !== 'agency' && form.organizationId) {
      payload.organizationId = form.organizationId;
    }
    if (form.scopeType === 'program' && form.programId) {
      payload.programId = form.programId;
    }
    if (editingId.value) {
      await api.put(`/intake-links/${editingId.value}`, payload);
    } else {
      await api.post('/intake-links', payload);
    }
    await fetchData();
    clearDraft();
    showForm.value = false;
  } catch (e) {
    formError.value = formatApiError(e, 'Failed to save intake link');
  } finally {
    saving.value = false;
  }
};

const copyLink = async (link) => {
  const key = link.public_key || '';
  if (!key) return;
  const url = buildPublicIntakeUrl(key);
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // ignore
  }
};

const createQuickLink = async () => {
  try {
    quickError.value = '';
    if (quickScope.value !== 'agency' && !quickOrganizationId.value) {
      quickError.value = 'Organization is required.';
      return;
    }
    const payload = {
      title: quickTitle.value || null,
      scopeType: quickScope.value,
      createClient: true,
      createGuardian: true,
      isActive: true
    };
    if (quickScope.value !== 'agency' && quickOrganizationId.value) {
      payload.organizationId = quickOrganizationId.value;
    }
    await api.post('/intake-links', payload);
    await fetchData();
    quickTitle.value = '';
  } catch (e) {
    quickError.value = formatApiError(e, 'Failed to create link');
  }
};

const createId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const agencyOnlyTemplates = computed(() => {
  const list = Array.isArray(templates.value) ? templates.value : [];
  return list.filter((t) => t && t.agency_id !== null && t.agency_id !== undefined);
});

const templateGroups = computed(() => {
  const list = agencyOnlyTemplates.value;
  const scope = form.scopeType || 'school';
  const orgId = scope === 'agency' ? null : form.organizationId;
  const agencyTemplates = [];
  const organizationTemplates = [];
  list
    .filter((t) => t && t.id)
    .forEach((t) => {
      const tOrgId = t.organization_id ?? null;
      if (scope === 'agency') {
        if (!tOrgId) agencyTemplates.push(t);
      } else if (!tOrgId) {
        agencyTemplates.push(t);
      } else if (orgId && Number(tOrgId) === Number(orgId)) {
        organizationTemplates.push(t);
      }
    });
  const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
  agencyTemplates.sort(byName);
  organizationTemplates.sort(byName);
  return { agencyTemplates, organizationTemplates };
});

const selectableTemplates = computed(() => [
  ...templateGroups.value.organizationTemplates,
  ...templateGroups.value.agencyTemplates
]);

const documentStepTemplates = computed(() => {
  const list = agencyOnlyTemplates.value;
  const sorted = list.filter((t) => t && t.id);
  sorted.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
  return sorted;
});

const orderedAllowedTemplates = computed(() => {
  const ids = Array.isArray(form.allowedDocumentTemplateIds) ? form.allowedDocumentTemplateIds : [];
  if (!ids.length) return [];
  const list = Array.isArray(templates.value) ? templates.value : [];
  const byId = new Map(list.filter((t) => t && t.id).map((t) => [Number(t.id), t]));
  return ids
    .map((id) => byId.get(Number(id)))
    .filter(Boolean);
});

const sanitizeSteps = (steps) => {
  const raw = Array.isArray(steps) ? steps : [];
  return raw
    .filter((s) => s && typeof s === 'object')
    .map((s) => {
      const next = { ...s };
      if (!next.id) next.id = createId('step');
      if (!next.type) next.type = next.templateId ? 'document' : 'questions';
      if (next.type === 'questions') {
        const fields = Array.isArray(next.fields) ? next.fields : [];
        next.fields = fields
          .filter((f) => f && typeof f === 'object')
          .map((f) => ({
            id: f.id || createId('field'),
            key: f.key || '',
            label: f.label || '',
            type: f.type || 'text',
            required: !!f.required,
            helperText: f.helperText || '',
            scope: f.scope || 'submission',
            documentKey: f.documentKey || '',
            showIf: {
              fieldKey: f.showIf?.fieldKey || '',
              equals: f.showIf?.equals || ''
            },
            options: Array.isArray(f.options) ? f.options.filter((o) => o && typeof o === 'object') : []
          }));
      } else if (next.type === 'document') {
        if (next.templateId === undefined) next.templateId = null;
        if (next.checkboxDisclaimer === undefined) next.checkboxDisclaimer = '';
      }
      return next;
    });
};

const safeSteps = computed(() => (Array.isArray(form.intakeSteps) ? form.intakeSteps : []));
const hasDocumentSteps = computed(() => safeSteps.value.some((s) => s?.type === 'document'));

const getStepFields = (step) => {
  if (!step || !Array.isArray(step.fields)) return [];
  return step.fields.filter((f) => f && typeof f === 'object');
};

const normalizeIntakeSteps = (link) => {
  if (Array.isArray(link?.intake_steps) && link.intake_steps.length) {
    return sanitizeSteps(link.intake_steps);
  }
  const steps = [];
  if (Array.isArray(link?.intake_fields) && link.intake_fields.length) {
    steps.push({ id: createId('step'), type: 'questions', fields: link.intake_fields });
  }
  const docIds = Array.isArray(link?.allowed_document_template_ids) ? link.allowed_document_template_ids : [];
  docIds.forEach((id) =>
    steps.push({ id: createId('step'), type: 'document', templateId: id, checkboxDisclaimer: '' })
  );
  return steps;
};

const addStep = (type) => {
  const step = { id: createId('step'), type };
  if (type === 'questions') {
    step.fields = [];
  } else {
    step.templateId = null;
    step.checkboxDisclaimer = '';
  }
  form.intakeSteps.push(step);
};

const removeStep = (idx) => {
  form.intakeSteps.splice(idx, 1);
};

const moveStep = (idx, dir) => {
  form.intakeSteps = sanitizeSteps(form.intakeSteps);
  const next = idx + dir;
  if (next < 0 || next >= form.intakeSteps.length) return;
  const copy = [...form.intakeSteps];
  const [moved] = copy.splice(idx, 1);
  copy.splice(next, 0, moved);
  form.intakeSteps = copy;
};

const addField = (step) => {
  step.fields.push({
    id: createId('field'),
    key: '',
    label: '',
    type: 'text',
    required: false,
    helperText: '',
    scope: 'submission',
    showIf: { fieldKey: '', equals: '' },
    options: []
  });
};

const addFieldAfter = (step, idx) => {
  if (!step || !Array.isArray(step.fields)) return;
  const next = idx + 1;
  const field = {
    id: createId('field'),
    key: '',
    label: '',
    type: 'text',
    required: false,
    helperText: '',
    scope: 'submission',
    showIf: { fieldKey: '', equals: '' },
    options: []
  };
  step.fields.splice(next, 0, field);
};

const removeField = (step, idx) => {
  step.fields.splice(idx, 1);
};

const getConditionalTargets = (step, idx) => {
  if (!step || !Array.isArray(step.fields)) return [];
  return step.fields
    .filter((f, fIdx) => f && typeof f === 'object' && fIdx !== idx && f.key)
    .map((f) => ({ key: f.key, label: f.label }));
};

const moveField = (step, idx, dir) => {
  if (!step || !Array.isArray(step.fields)) return;
  const next = idx + dir;
  if (next < 0 || next >= step.fields.length) return;
  const copy = [...step.fields];
  const [moved] = copy.splice(idx, 1);
  copy.splice(next, 0, moved);
  step.fields = copy;
};

const addOption = (field) => {
  if (!Array.isArray(field.options)) field.options = [];
  field.options.push({ id: createId('opt'), label: '', value: '' });
};

const removeOption = (field, idx) => {
  field.options.splice(idx, 1);
};

const buildPayloadFromSteps = (selectedTemplateIds = []) => {
  const intakeSteps = sanitizeSteps(form.intakeSteps).map((step) => ({ ...step }));
  const intakeFields = [];
  const allowedDocumentTemplateIds = [];
  intakeSteps.forEach((step) => {
    if (step.type === 'questions') {
      (step.fields || []).forEach((f) => {
        if (f.type === 'info') return;
        intakeFields.push({
          key: f.key || f.id,
          label: f.label || f.key,
          type: f.type,
          required: !!f.required,
          options: f.options || [],
          helperText: f.helperText || '',
          showIf: f.showIf || null,
          scope: f.scope || 'submission'
        });
      });
    } else if (step.type === 'document' && step.templateId) {
      allowedDocumentTemplateIds.push(step.templateId);
    }
  });
  if (allowedDocumentTemplateIds.length === 0 && Array.isArray(selectedTemplateIds) && selectedTemplateIds.length) {
    selectedTemplateIds.forEach((id) => allowedDocumentTemplateIds.push(id));
  }
  return { intakeSteps, intakeFields, allowedDocumentTemplateIds };
};

const filterScope = ref('all');
const filterOrgId = ref('all');
const filteredLinks = computed(() => {
  let list = links.value;
  if (filterScope.value !== 'all') {
    list = list.filter((l) => l.scope_type === filterScope.value);
  }
  if (filterOrgId.value !== 'all') {
    const target = Number(filterOrgId.value);
    list = list.filter((l) => Number(l.organization_id) === target);
  }
  return list;
});

onMounted(fetchData);
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.filters {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.quick-create {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt);
  margin-bottom: 16px;
}
.table-wrap {
  overflow: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  border-bottom: 1px solid var(--border);
  padding: 10px;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.modal {
  width: 860px;
  max-width: 95vw;
  max-height: 92vh;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
}
.modal-body {
  padding: 14px;
  overflow: auto;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
}

.step-builder {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  background: #f9fafb;
}

.step-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.step-actions-bottom {
  margin-top: 12px;
  margin-bottom: 0;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.step-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  background: #fff;
  margin-bottom: 12px;
}

.step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.step-controls {
  display: flex;
  gap: 6px;
}

.question-row,
.option-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.question-block {
  margin-bottom: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: #fff;
}

.question-controls {
  display: flex;
  gap: 6px;
  align-items: center;
}

.question-index {
  flex: 0 0 32px;
  text-align: center;
  font-weight: 600;
  color: var(--text-secondary);
}

.question-row input,
.option-row input,
.question-row select {
  flex: 1;
}

.option-list {
  margin: 8px 0 12px 0;
}
.template-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 6px;
}
.template-group-title {
  grid-column: 1 / -1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 6px;
}
.template-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.subtitle {
  color: var(--text-secondary);
}
.template-panel {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.template-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.template-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
}
.muted {
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
