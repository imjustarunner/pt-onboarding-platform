<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Intake Links</h1>
        <p class="subtitle">Configure digital intake links, documents, and custom fields.</p>
      </div>
      <button class="btn btn-primary" type="button" @click="openCreate">New Intake Link</button>
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
          <tr v-for="link in links" :key="link.id">
            <td>{{ link.title || `Link ${link.id}` }}</td>
            <td>{{ link.scope_type }} {{ link.organization_id ? `#${link.organization_id}` : '' }}</td>
            <td>{{ link.is_active ? 'Yes' : 'No' }}</td>
            <td>{{ link.create_guardian ? 'Yes' : 'No' }}</td>
            <td>{{ (link.allowed_document_template_ids || []).length }}</td>
            <td class="actions">
              <button class="btn btn-secondary btn-sm" type="button" @click="editLink(link)">Edit</button>
              <button class="btn btn-secondary btn-sm" type="button" @click="copyLink(link)">Copy URL</button>
            </td>
          </tr>
        </tbody>
      </table>
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
          </div>

          <div class="form-group">
            <label>Allowed Document Templates</label>
            <div class="template-list">
              <label v-for="t in templates" :key="t.id" class="template-item">
                <input type="checkbox" :value="t.id" v-model="form.allowedDocumentTemplateIds" />
                {{ t.name }}
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>Custom Intake Fields (JSON)</label>
            <textarea v-model="form.intakeFieldsText" rows="6"></textarea>
            <div class="muted">Example: [{"key":"grade","label":"Grade","type":"text","required":false}]</div>
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
import { computed, onMounted, reactive, ref } from 'vue';
import api from '../../services/api';

const loading = ref(false);
const error = ref('');
const links = ref([]);
const templates = ref([]);
const organizations = ref([]);
const showForm = ref(false);
const saving = ref(false);
const formError = ref('');
const editingId = ref(null);

const form = reactive({
  title: '',
  description: '',
  scopeType: 'school',
  organizationId: null,
  programId: null,
  isActive: true,
  createClient: true,
  createGuardian: true,
  allowedDocumentTemplateIds: [],
  intakeFieldsText: ''
});

const organizationsForScope = computed(() => {
  const type = form.scopeType;
  if (type === 'school') return organizations.value.filter((o) => o.organization_type === 'school');
  if (type === 'program') return organizations.value.filter((o) => o.organization_type === 'program');
  return organizations.value;
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
  form.allowedDocumentTemplateIds = [];
  form.intakeFieldsText = '';
  formError.value = '';
  editingId.value = null;
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
    templates.value = templatesResp.data?.templates || templatesResp.data || [];
    organizations.value = Array.isArray(orgsResp.data) ? orgsResp.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load intake links';
  } finally {
    loading.value = false;
  }
};

const openCreate = () => {
  resetForm();
  showForm.value = true;
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
  form.createGuardian = link.scope_type === 'school' ? false : !!link.create_guardian;
  form.allowedDocumentTemplateIds = link.allowed_document_template_ids || [];
  form.intakeFieldsText = link.intake_fields ? JSON.stringify(link.intake_fields, null, 2) : '';
  showForm.value = true;
};

const closeForm = () => {
  showForm.value = false;
};

const save = async () => {
  try {
    saving.value = true;
    formError.value = '';
    let intakeFields = null;
    if (form.intakeFieldsText.trim()) {
      intakeFields = JSON.parse(form.intakeFieldsText);
    }
    const payload = {
      title: form.title,
      description: form.description,
      scopeType: form.scopeType,
      organizationId: form.scopeType === 'agency' ? null : form.organizationId,
      programId: form.scopeType === 'program' ? form.programId : null,
      isActive: form.isActive,
      createClient: form.createClient,
      createGuardian: form.scopeType === 'school' ? false : form.createGuardian,
      allowedDocumentTemplateIds: form.allowedDocumentTemplateIds,
      intakeFields
    };
    if (editingId.value) {
      await api.put(`/intake-links/${editingId.value}`, payload);
    } else {
      await api.post('/intake-links', payload);
    }
    await fetchData();
    showForm.value = false;
  } catch (e) {
    formError.value = e.response?.data?.error?.message || 'Failed to save intake link';
  } finally {
    saving.value = false;
  }
};

const copyLink = async (link) => {
  const key = link.public_key || '';
  if (!key) return;
  const url = `${window.location.origin}/intake/${key}`;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // ignore
  }
};

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
  width: 720px;
  max-width: 95vw;
  background: white;
  border-radius: 12px;
  border: 1px solid var(--border);
  overflow: hidden;
}
.modal-header {
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
}
.modal-body {
  padding: 14px;
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
.template-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 6px;
}
.template-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.subtitle {
  color: var(--text-secondary);
}
.muted {
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
