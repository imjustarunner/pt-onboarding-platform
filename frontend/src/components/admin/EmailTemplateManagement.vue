<template>
  <div class="email-template-management">
    <div class="section-header">
      <h2>Email Templates</h2>
      <p class="section-description">
        <span v-pre>Manage email templates for user communications. Templates support variables like {{FIRST_NAME}}, {{TEMP_PASSWORD}}, etc. Use double curly braces to insert parameters.</span>
      </p>
    </div>

    <div class="template-scope-selector" v-if="authStore.user?.role === 'super_admin'">
      <label>Manage Templates For:</label>
      <select v-model="selectedScope" @change="loadTemplates" class="form-select">
        <option value="platform">Platform (Default)</option>
        <option v-for="agency in (agencyStore.agencies || [])" :key="agency.id" :value="`agency-${agency.id}`">
          {{ agency.name }}
        </option>
      </select>
    </div>

    <div class="templates-list">
      <div class="list-header">
        <h3>Templates</h3>
        <button v-if="!readOnly" @click="openCreateModal" class="btn btn-primary">Create Template</button>
      </div>

      <div v-if="loading" class="loading">Loading templates...</div>
      <div v-else-if="templates.length === 0" class="empty-state">
        <p>No templates found. Create your first template to get started.</p>
      </div>
      <div v-else class="templates-grid">
        <div v-for="template in templates" :key="template.id" class="template-card">
          <div class="template-header">
            <h4>{{ template.name }}</h4>
            <div class="template-actions">
              <button v-if="!readOnly" @click="editTemplate(template)" class="btn btn-sm btn-secondary">Edit</button>
              <button v-if="canSendEmails" @click="openSendModal(template)" class="btn btn-sm btn-success">Send</button>
              <button @click="previewTemplate(template)" class="btn btn-sm btn-info">Preview</button>
              <button 
                v-if="!readOnly && canDelete(template)" 
                @click="deleteTemplate(template)" 
                class="btn btn-sm btn-danger"
              >
                Delete
              </button>
            </div>
          </div>
          <div class="template-info">
            <p><strong>Type:</strong> {{ template.type }}</p>
            <p><strong>Subject:</strong> {{ template.subject }}</p>
            <p class="template-body-preview">{{ truncate(template.body, 100) }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ editingTemplate ? 'Edit Template' : 'Create Template' }}</h3>
          <button @click="closeModal" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="saveTemplate">
            <div class="form-group">
              <label>Template Name</label>
              <input v-model="templateForm.name" type="text" required placeholder="e.g., Welcome Email" />
            </div>
            <div class="form-group">
              <label>Template Type</label>
              <select v-model="templateForm.type" required class="form-select">
                <option value="user_welcome">User Welcome</option>
                <option value="password_reset">Password Reset</option>
                <option value="invitation">Invitation</option>
              </select>
            </div>
            <div class="form-group">
              <label>Subject</label>
              <input v-model="templateForm.subject" type="text" required placeholder="Email subject line" />
            </div>
            <div class="form-group">
              <label>Body (Plain Text)</label>
              <textarea 
                v-model="templateForm.body" 
                rows="10" 
                required 
                placeholder="Email body text. Use {{PARAMETER_NAME}} for variables."
                @input="updateUsedParameters"
              ></textarea>
            </div>
            <div class="form-group">
              <TemplateParameterHelper 
                :used-parameters="[templateForm.subject, templateForm.body]"
                @insert="insertParameter"
              />
            </div>
            <div class="form-actions">
              <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="saving">
                {{ saving ? 'Saving...' : 'Save Template' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Preview Modal -->
    <div v-if="showPreviewModal" class="modal-overlay" @click.self="closePreviewModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Template Preview</h3>
          <button @click="closePreviewModal" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="preview-section">
            <h4>Subject:</h4>
            <p class="preview-text">{{ previewData.subject }}</p>
          </div>
          <div class="preview-section">
            <h4>Body:</h4>
            <pre class="preview-text">{{ previewData.body }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Send Modal -->
    <div v-if="showSendModal" class="modal-overlay" @click.self="closeSendModal">
      <div class="modal-content modal-content-wide">
        <div class="modal-header">
          <h3>Send Email</h3>
          <button @click="closeSendModal" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="sendError" class="error">{{ sendError }}</div>
          <form @submit.prevent="sendTemplateEmail">
            <div class="form-group">
              <label>Recipients (comma or newline separated)</label>
              <textarea v-model="sendForm.recipients" rows="3" required placeholder="email1@example.com, email2@example.com"></textarea>
            </div>

            <div class="form-group" v-if="showAgencySelector">
              <label>Agency</label>
              <select v-model="sendForm.agencyId" class="form-select" required>
                <option value="">Select an agency…</option>
                <option v-for="agency in (agencyStore.agencies || [])" :key="agency.id" :value="String(agency.id)">
                  {{ agency.name }}
                </option>
              </select>
            </div>

            <div class="form-group" v-if="canPickSenderIdentity">
              <label>Sender Identity (optional)</label>
              <select v-model="sendForm.senderIdentityId" class="form-select">
                <option value="">Default</option>
                <option v-for="s in senderIdentities" :key="s.id" :value="String(s.id)">
                  {{ s.display_name || s.from_email }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label>Subject</label>
              <input v-model="sendForm.subject" type="text" required placeholder="Email subject line" />
            </div>
            <div class="form-group">
              <label>Body (Plain Text)</label>
              <textarea v-model="sendForm.body" rows="10" required placeholder="Email body text."></textarea>
            </div>

            <div class="form-group">
              <label>AI Draft Prompt</label>
              <textarea v-model="sendForm.prompt" rows="3" placeholder="Describe the tone, audience, and key points for the draft."></textarea>
              <button type="button" class="btn btn-secondary btn-sm" @click="generateAiDraft" :disabled="aiDrafting || !sendForm.prompt">
                {{ aiDrafting ? 'Drafting...' : 'Generate AI Draft' }}
              </button>
              <small class="form-hint">AI drafts are suggestions only. Review and click Send to deliver.</small>
            </div>

            <div class="form-actions">
              <button type="button" @click="closeSendModal" class="btn btn-secondary">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="sending">
                {{ sending ? 'Sending...' : 'Send Email' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import TemplateParameterHelper from './TemplateParameterHelper.vue';

const props = defineProps({
  readOnly: {
    type: Boolean,
    default: false
  }
});

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const templates = ref([]);
const loading = ref(false);
const showModal = ref(false);
const showPreviewModal = ref(false);
const editingTemplate = ref(null);
const saving = ref(false);
const selectedScope = ref('platform');
const previewData = ref({ subject: '', body: '' });
const showSendModal = ref(false);
const sending = ref(false);
const aiDrafting = ref(false);
const sendError = ref('');
const sendTemplate = ref(null);
const senderIdentities = ref([]);

const sendForm = ref({
  recipients: '',
  subject: '',
  body: '',
  prompt: '',
  agencyId: '',
  senderIdentityId: ''
});

const templateForm = ref({
  name: '',
  type: 'user_welcome',
  subject: '',
  body: ''
});

const canDelete = (template) => {
  // Only allow deleting agency-specific templates, not platform defaults
  if (authStore.user?.role !== 'super_admin') {
    return template.agency_id !== null;
  }
  return true;
};

const canSendEmails = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['admin', 'super_admin', 'support', 'staff'].includes(role);
});

const showAgencySelector = computed(() => {
  return authStore.user?.role === 'super_admin';
});

const canPickSenderIdentity = computed(() => {
  return authStore.user?.role === 'super_admin';
});

const loadTemplates = async () => {
  loading.value = true;
  try {
    const params = {};
    if (selectedScope.value === 'platform') {
      params.platformOnly = 'true';
    } else if (selectedScope.value.startsWith('agency-')) {
      params.agencyId = selectedScope.value.replace('agency-', '');
    }
    
    const response = await api.get('/email-templates', { params });
    templates.value = response.data;
  } catch (error) {
    console.error('Failed to load templates:', error);
  } finally {
    loading.value = false;
  }
};

const openCreateModal = () => {
  editingTemplate.value = null;
  templateForm.value = {
    name: '',
    type: 'user_welcome',
    subject: '',
    body: ''
  };
  showModal.value = true;
};

const editTemplate = (template) => {
  editingTemplate.value = template;
  templateForm.value = {
    name: template.name,
    type: template.type,
    subject: template.subject,
    body: template.body
  };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  editingTemplate.value = null;
};

const saveTemplate = async () => {
  saving.value = true;
  try {
    const payload = {
      name: templateForm.value.name,
      type: templateForm.value.type,
      subject: templateForm.value.subject,
      body: templateForm.value.body
    };

    let requestConfig = {};
    if (selectedScope.value === 'platform') {
      // Send platform flag as query parameter (backend checks req.query.platform)
      requestConfig.params = { platform: 'true' };
    } else if (selectedScope.value.startsWith('agency-')) {
      payload.agencyId = selectedScope.value.replace('agency-', '');
    }

    if (editingTemplate.value) {
      await api.put(`/email-templates/${editingTemplate.value.id}`, payload, requestConfig);
    } else {
      await api.post('/email-templates', payload, requestConfig);
    }

    await loadTemplates();
    closeModal();
  } catch (error) {
    console.error('Failed to save template:', error);
    alert('Failed to save template: ' + (error.response?.data?.error?.message || error.message));
  } finally {
    saving.value = false;
  }
};

const deleteTemplate = async (template) => {
  if (!confirm(`Are you sure you want to delete "${template.name}"?`)) {
    return;
  }

  try {
    await api.delete(`/email-templates/${template.id}`);
    await loadTemplates();
  } catch (error) {
    console.error('Failed to delete template:', error);
    alert('Failed to delete template: ' + (error.response?.data?.error?.message || error.message));
  }
};

const previewTemplate = async (template) => {
  try {
    const response = await api.post(`/email-templates/${template.id}/preview`, {
      sampleData: null // Use default sample data
    });
    previewData.value = response.data.rendered;
    showPreviewModal.value = true;
  } catch (error) {
    console.error('Failed to preview template:', error);
    alert('Failed to preview template: ' + (error.response?.data?.error?.message || error.message));
  }
};

const closePreviewModal = () => {
  showPreviewModal.value = false;
};

const openSendModal = (template) => {
  sendTemplate.value = template;
  sendError.value = '';
  sendForm.value = {
    recipients: '',
    subject: template?.subject || '',
    body: template?.body || '',
    prompt: '',
    agencyId: '',
    senderIdentityId: ''
  };

  if (authStore.user?.role !== 'super_admin') {
    const defaultAgencyId = agencyStore.currentAgency?.id || (agencyStore.agencies?.[0]?.id || '');
    sendForm.value.agencyId = defaultAgencyId ? String(defaultAgencyId) : '';
  } else if (selectedScope.value.startsWith('agency-')) {
    sendForm.value.agencyId = selectedScope.value.replace('agency-', '');
  }

  showSendModal.value = true;
  if (canPickSenderIdentity.value) {
    loadSenderIdentities();
  }
};

const closeSendModal = () => {
  showSendModal.value = false;
  sending.value = false;
  aiDrafting.value = false;
  sendError.value = '';
  sendTemplate.value = null;
};

const loadSenderIdentities = async () => {
  if (!canPickSenderIdentity.value) return;
  try {
    const params = {
      includePlatformDefaults: true
    };
    if (sendForm.value.agencyId) {
      params.agencyId = sendForm.value.agencyId;
    }
    const response = await api.get('/email-senders', { params });
    senderIdentities.value = response.data || [];
  } catch {
    senderIdentities.value = [];
  }
};

const parseRecipients = (raw) => {
  return String(raw || '')
    .split(/[\n,;]+/)
    .map((r) => r.trim())
    .filter(Boolean);
};

const sendTemplateEmail = async () => {
  if (!sendTemplate.value) return;
  sendError.value = '';
  sending.value = true;
  try {
    const recipients = parseRecipients(sendForm.value.recipients);
    if (!recipients.length) {
      sendError.value = 'Please add at least one recipient.';
      return;
    }

    const payload = {
      recipients,
      subject: sendForm.value.subject,
      body: sendForm.value.body,
      agencyId: sendForm.value.agencyId || null,
      senderIdentityId: sendForm.value.senderIdentityId || null
    };

    await api.post(`/email-templates/${sendTemplate.value.id}/send`, payload);
    closeSendModal();
  } catch (error) {
    sendError.value = error?.response?.data?.error?.message || 'Failed to send email.';
  } finally {
    sending.value = false;
  }
};

const generateAiDraft = async () => {
  if (!sendTemplate.value || !sendForm.value.prompt) return;
  aiDrafting.value = true;
  sendError.value = '';
  try {
    const payload = {
      prompt: sendForm.value.prompt,
      agencyId: sendForm.value.agencyId || null
    };
    const response = await api.post(`/email-templates/${sendTemplate.value.id}/ai-draft`, payload);
    sendForm.value.subject = response.data?.subject || sendForm.value.subject;
    sendForm.value.body = response.data?.body || sendForm.value.body;
  } catch (error) {
    sendError.value = error?.response?.data?.error?.message || 'Failed to generate AI draft.';
  } finally {
    aiDrafting.value = false;
  }
};

const insertParameter = (param) => {
  // Insert parameter at cursor position in body textarea
  const textarea = document.querySelector('textarea');
  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = templateForm.value.body;
    templateForm.value.body = text.substring(0, start) + param + text.substring(end);
    // Set cursor position after inserted parameter
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + param.length, start + param.length);
    }, 0);
  }
};

const updateUsedParameters = () => {
  // This is handled by the TemplateParameterHelper component
};

const truncate = (text, length) => {
  if (!text) return '';
  return text.length > length ? text.substring(0, length) + '...' : text;
};

onMounted(async () => {
  // Ensure agency store is initialized
  if (authStore.user?.role === 'super_admin' && (!agencyStore.agencies || agencyStore.agencies.length === 0)) {
    await agencyStore.fetchAgencies();
  }
  loadTemplates();
});

watch(
  () => sendForm.value.agencyId,
  () => {
    if (showSendModal.value && canPickSenderIdentity.value) {
      loadSenderIdentities();
    }
  }
);
</script>

<style scoped>
.email-template-management {
  padding: 24px;
}

.section-header {
  margin-bottom: 24px;
}

.section-header h2 {
  margin: 0 0 8px 0;
}

.section-description {
  color: var(--text-secondary);
  margin: 0;
}

.template-scope-selector {
  margin-bottom: 24px;
}

.template-scope-selector label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}

.templates-list {
  background: white;
  border-radius: 8px;
  padding: 24px;
  border: 1px solid var(--border);
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.list-header h3 {
  margin: 0;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.template-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  background: var(--bg-secondary);
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 12px;
}

.template-header h4 {
  margin: 0;
  flex: 1;
}

.template-actions {
  display: flex;
  gap: 8px;
}

.template-info {
  font-size: 14px;
}

.template-info p {
  margin: 8px 0;
}

.template-body-preview {
  color: var(--text-secondary);
  font-style: italic;
  white-space: pre-wrap;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content-wide {
  max-width: 980px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.form-group textarea {
  font-family: monospace;
  resize: vertical;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.form-hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.error {
  background: #ffe9e9;
  border: 1px solid #f3bcbc;
  color: #7f1d1d;
  padding: 10px 12px;
  border-radius: 6px;
  margin-bottom: 12px;
}

.preview-section {
  margin-bottom: 20px;
}

.preview-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.preview-text {
  background: var(--bg-secondary);
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 13px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}
</style>
