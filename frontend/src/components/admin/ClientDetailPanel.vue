<template>
  <div class="modal-overlay" @click.self="handleClose">
    <div class="modal-content large" @click.stop>
      <div class="modal-header">
        <h2>Client: {{ client.initials }}</h2>
        <button @click="handleClose" class="btn-close">×</button>
      </div>

      <!-- Tab Navigation -->
      <div class="modal-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="['tab-button', { active: activeTab === tab.id }]"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="tab-content">
        <!-- Overview Tab -->
        <div v-if="activeTab === 'overview'" class="detail-section">
          <div class="info-grid">
            <div class="info-item">
              <label>Initials</label>
              <div class="info-value">{{ client.initials }}</div>
            </div>
            <div class="info-item">
              <label>School</label>
              <div class="info-value">{{ client.organization_name || '-' }}</div>
            </div>
            <div class="info-item">
              <label>Status</label>
              <div class="info-value">
                <ClientStatusBadge :status="client.status" />
              </div>
            </div>
            <div class="info-item">
              <label>Provider</label>
              <div class="info-value">
                <select
                  v-if="editingProvider"
                  v-model="providerValue"
                  @change="saveProvider"
                  @blur="cancelEditProvider"
                  class="inline-select"
                >
                  <option :value="null">Not assigned</option>
                  <option v-for="p in availableProviders" :key="p.id" :value="p.id">
                    {{ p.first_name }} {{ p.last_name }}
                  </option>
                </select>
                <span v-else @click="startEditProvider" class="editable-field">
                  {{ client.provider_name || 'Not assigned' }}
                  <span class="edit-hint">(click to edit)</span>
                </span>
              </div>
            </div>
            <div class="info-item">
              <label>Submission Date</label>
              <div class="info-value">{{ formatDate(client.submission_date) }}</div>
            </div>
            <div class="info-item">
              <label>Document Status</label>
              <div class="info-value">
                <span :class="['doc-status-badge', `doc-${client.document_status?.toLowerCase()}`]">
                  {{ formatDocumentStatus(client.document_status) }}
                </span>
              </div>
            </div>
            <div class="info-item">
              <label>Source</label>
              <div class="info-value">{{ formatSource(client.source) }}</div>
            </div>
            <div class="info-item">
              <label>Last Activity</label>
              <div class="info-value">{{ formatDate(client.last_activity_at) || '-' }}</div>
            </div>
          </div>

          <div class="quick-actions">
            <h3>Quick Actions</h3>
            <div class="actions-grid">
              <select
                v-if="editingStatus"
                v-model="statusValue"
                @change="saveStatus"
                @blur="cancelEditStatus"
                class="inline-select status-select"
              >
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="DECLINED">Declined</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <button
                v-else
                @click="startEditStatus"
                class="btn btn-primary"
              >
                Change Status
              </button>
            </div>
          </div>
        </div>

        <!-- Status History Tab -->
        <div v-if="activeTab === 'history'" class="detail-section">
          <div v-if="historyLoading" class="loading">Loading history...</div>
          <div v-else-if="historyError" class="error">{{ historyError }}</div>
          <div v-else-if="history.length === 0" class="empty-state">
            <p>No history recorded yet.</p>
          </div>
          <div v-else class="history-timeline">
            <div
              v-for="entry in history"
              :key="entry.id"
              class="history-item"
            >
              <div class="history-time">{{ formatDateTime(entry.changed_at) }}</div>
              <div class="history-content">
                <div class="history-field">
                  <strong>{{ formatFieldName(entry.field_changed) }}</strong>
                </div>
                <div class="history-change">
                  <span v-if="entry.from_value" class="from-value">{{ entry.from_value }}</span>
                  <span class="arrow">→</span>
                  <span class="to-value">{{ entry.to_value }}</span>
                </div>
                <div v-if="entry.changed_by_name" class="history-author">
                  Changed by: {{ entry.changed_by_name }}
                </div>
                <div v-if="entry.note" class="history-note">
                  Note: {{ entry.note }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Messages Tab -->
        <div v-if="activeTab === 'messages'" class="detail-section">
          <div v-if="notesLoading" class="loading">Loading messages...</div>
          <div v-else-if="notesError" class="error">{{ notesError }}</div>
          <div v-else class="messages-container">
            <div class="phi-warning">
              <strong>Reminder:</strong> Use initials only. Do not include PHI. This is not an EHR.
            </div>
            <div class="messages-list">
              <div
                v-for="note in notes"
                :key="note.id"
                class="message-item"
                :class="{ 'internal-note': note.is_internal_only }"
              >
                <div class="message-header">
                  <span class="message-author">{{ note.author_name || 'Unknown' }}</span>
                  <span class="message-date">{{ formatDateTime(note.created_at) }}</span>
                  <span v-if="note.category" class="category-badge">{{ formatCategory(note.category) }}</span>
                  <span v-if="note.is_internal_only" class="internal-badge">Internal</span>
                </div>
                <div class="message-content">{{ note.message }}</div>
              </div>
            </div>

            <div class="add-message-form">
              <h3>Add Message</h3>
              <div class="message-options">
                <label class="category-label">
                  Category
                  <select v-model="newNoteCategory" class="inline-select">
                    <option value="general">General</option>
                    <option value="status">Status update</option>
                    <option value="administrative">Administrative</option>
                    <option value="billing">Billing</option>
                    <option value="clinical">Clinical question</option>
                  </select>
                </label>
              </div>
              <textarea
                v-model="newNoteMessage"
                placeholder="Enter your message (initials only)..."
                rows="4"
                class="message-input"
              ></textarea>
              <div class="message-options">
                <label v-if="canCreateInternalNotes" class="checkbox-label">
                  <input
                    v-model="newNoteIsInternal"
                    type="checkbox"
                  />
                  Internal only (not visible to school)
                </label>
              </div>
              <button
                @click="createNote"
                class="btn btn-primary"
                :disabled="!newNoteMessage.trim() || creatingNote"
              >
                {{ creatingNote ? 'Sending...' : 'Send Message' }}
              </button>
            </div>
          </div>
        </div>

        <!-- PHI Packets Tab -->
        <div v-if="activeTab === 'phi'" class="detail-section">
          <PhiDocumentsPanel :client-id="Number(client.id)" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import ClientStatusBadge from './ClientStatusBadge.vue';
import PhiDocumentsPanel from './PhiDocumentsPanel.vue';

const props = defineProps({
  client: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['close', 'updated']);

const authStore = useAuthStore();

const activeTab = ref('overview');
const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Status History' },
  { id: 'messages', label: 'Messages' },
  { id: 'phi', label: 'Referral Packets' }
];

// Overview tab state
const editingStatus = ref(false);
const statusValue = ref(null);
const editingProvider = ref(false);
const providerValue = ref(null);
const availableProviders = ref([]);

// History tab state
const history = ref([]);
const historyLoading = ref(false);
const historyError = ref('');

// Messages tab state
const notes = ref([]);
const notesLoading = ref(false);
const notesError = ref('');
const newNoteMessage = ref('');
const newNoteIsInternal = ref(false);
const newNoteCategory = ref('general');
const creatingNote = ref(false);

const hasAgencyAccess = ref(false);

const canCreateInternalNotes = computed(() => {
  return hasAgencyAccess.value;
});

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString();
};

const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString();
};

const formatDocumentStatus = (status) => {
  const statusMap = {
    'NONE': 'None',
    'UPLOADED': 'Uploaded',
    'APPROVED': 'Approved',
    'REJECTED': 'Rejected'
  };
  return statusMap[status] || status;
};

const formatSource = (source) => {
  const sourceMap = {
    'BULK_IMPORT': 'Bulk Import',
    'SCHOOL_UPLOAD': 'School Upload',
    'DIGITAL_FORM': 'Digital Form',
    'ADMIN_CREATED': 'Admin Created'
  };
  return sourceMap[source] || source;
};

const formatFieldName = (field) => {
  const fieldMap = {
    'status': 'Status',
    'provider_id': 'Provider',
    'created': 'Created',
    'bulk_import_update': 'Bulk Import Update'
  };
  return fieldMap[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

const startEditStatus = () => {
  editingStatus.value = true;
  statusValue.value = props.client.status;
};

const cancelEditStatus = () => {
  editingStatus.value = false;
  statusValue.value = null;
};

const saveStatus = async () => {
  try {
    await api.put(`/clients/${props.client.id}/status`, { status: statusValue.value });
    emit('updated');
    cancelEditStatus();
  } catch (err) {
    console.error('Failed to update status:', err);
    alert(err.response?.data?.error?.message || 'Failed to update status');
    cancelEditStatus();
  }
};

const startEditProvider = () => {
  editingProvider.value = true;
  providerValue.value = props.client.provider_id;
};

const cancelEditProvider = () => {
  editingProvider.value = false;
  providerValue.value = null;
};

const saveProvider = async () => {
  try {
    await api.put(`/clients/${props.client.id}/provider`, { provider_id: providerValue.value });
    emit('updated');
    cancelEditProvider();
  } catch (err) {
    console.error('Failed to assign provider:', err);
    alert(err.response?.data?.error?.message || 'Failed to assign provider');
    cancelEditProvider();
  }
};

const fetchHistory = async () => {
  try {
    historyLoading.value = true;
    historyError.value = '';
    const response = await api.get(`/clients/${props.client.id}/history`);
    history.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch history:', err);
    historyError.value = err.response?.data?.error?.message || 'Failed to load history';
  } finally {
    historyLoading.value = false;
  }
};

const fetchNotes = async () => {
  try {
    notesLoading.value = true;
    notesError.value = '';
    const response = await api.get(`/clients/${props.client.id}/notes`);
    notes.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch notes:', err);
    notesError.value = err.response?.data?.error?.message || 'Failed to load messages';
  } finally {
    notesLoading.value = false;
  }
};

const fetchAccess = async () => {
  try {
    const response = await api.get('/users/me/agencies');
    const agencies = response.data || [];
    hasAgencyAccess.value = agencies.some((a) => a.id === props.client.agency_id);
  } catch {
    hasAgencyAccess.value = false;
  }
};

const fetchProviders = async () => {
  try {
    const response = await api.get('/users');
    const allUsers = response.data || [];
    availableProviders.value = allUsers.filter(u => 
      ['provider', 'clinician', 'supervisor', 'admin'].includes(u.role?.toLowerCase())
    );
  } catch (err) {
    console.error('Failed to fetch providers:', err);
  }
};

const createNote = async () => {
  if (!newNoteMessage.value.trim()) return;

  try {
    creatingNote.value = true;
    await api.post(`/clients/${props.client.id}/notes`, {
      message: newNoteMessage.value.trim(),
      is_internal_only: newNoteIsInternal.value,
      category: newNoteCategory.value
    });
    newNoteMessage.value = '';
    newNoteIsInternal.value = false;
    newNoteCategory.value = 'general';
    await fetchNotes();
  } catch (err) {
    console.error('Failed to create note:', err);
    alert(err.response?.data?.error?.message || 'Failed to send message');
  } finally {
    creatingNote.value = false;
  }
};

const formatCategory = (c) => {
  const map = {
    general: 'General',
    status: 'Status',
    administrative: 'Admin',
    billing: 'Billing',
    clinical: 'Clinical'
  };
  return map[c] || c;
};

const handleClose = () => {
  emit('close');
};

watch(() => activeTab.value, (newTab) => {
  if (newTab === 'history' && history.value.length === 0) {
    fetchHistory();
  } else if (newTab === 'messages' && notes.value.length === 0) {
    fetchNotes();
  }
});

watch(() => props.client, () => {
  // Reset editing states when client changes
  editingStatus.value = false;
  editingProvider.value = false;
}, { deep: true });

onMounted(async () => {
  await fetchProviders();
  await fetchAccess();
  if (activeTab.value === 'history') {
    await fetchHistory();
  } else if (activeTab.value === 'messages') {
    await fetchNotes();
  }
});
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content.large {
  background: white;
  border-radius: 12px;
  max-width: 900px;
  width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 2px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 28px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.btn-close:hover {
  color: var(--text-primary);
}

.modal-tabs {
  display: flex;
  gap: 8px;
  padding: 0 24px;
  border-bottom: 2px solid var(--border);
}

.tab-button {
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--text-primary);
  background: var(--bg-alt);
}

.tab-button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 600;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.detail-section {
  min-height: 400px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-item label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-value {
  font-size: 15px;
  color: var(--text-primary);
}

.editable-field {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
  display: inline-block;
}

.editable-field:hover {
  background: var(--bg-alt);
}

.edit-hint {
  font-size: 11px;
  color: var(--text-secondary);
  font-style: italic;
  margin-left: 8px;
}

.inline-select {
  padding: 6px 10px;
  border: 2px solid var(--primary);
  border-radius: 4px;
  font-size: 14px;
  background: white;
  min-width: 200px;
}

.doc-status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.doc-none {
  background: #e2e3e5;
  color: #383d41;
}

.doc-uploaded {
  background: #fff3cd;
  color: #856404;
}

.doc-approved {
  background: #d4edda;
  color: #155724;
}

.doc-rejected {
  background: #f8d7da;
  color: #721c24;
}

.quick-actions {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.quick-actions h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.actions-grid {
  display: flex;
  gap: 12px;
}

.status-select {
  min-width: 180px;
}

.history-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.history-item {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
  border-left: 3px solid var(--primary);
}

.history-time {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 150px;
}

.history-content {
  flex: 1;
}

.history-field {
  margin-bottom: 8px;
  color: var(--text-primary);
}

.history-change {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.from-value {
  color: var(--text-secondary);
  text-decoration: line-through;
}

.arrow {
  color: var(--primary);
  font-weight: 600;
}

.to-value {
  color: var(--text-primary);
  font-weight: 500;
}

.history-author {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.history-note {
  font-size: 13px;
  color: var(--text-primary);
  margin-top: 8px;
  padding: 8px;
  background: white;
  border-radius: 4px;
  font-style: italic;
}

.messages-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.phi-warning {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #7c2d12;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.message-item {
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.message-item.internal-note {
  border-left: 3px solid var(--primary);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}

.message-author {
  font-weight: 600;
  color: var(--text-primary);
}

.message-date {
  color: var(--text-secondary);
  font-size: 12px;
}

.category-badge {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 12px;
}

.internal-badge {
  padding: 2px 8px;
  background: var(--primary);
  color: white;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.message-content {
  color: var(--text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
}

.add-message-form {
  padding: 20px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.add-message-form h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
}

.message-input {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 12px;
}

.message-options {
  margin-bottom: 12px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.error {
  text-align: center;
  padding: 20px;
  color: #c33;
  background: #fee;
  border-radius: 6px;
}
</style>
