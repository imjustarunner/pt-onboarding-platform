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
              <label>Client Status</label>
              <div class="info-value">{{ client.client_status_label || '-' }}</div>
            </div>
            <div class="info-item">
              <label>Workflow</label>
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
              <label>Paperwork Status</label>
              <div class="info-value">{{ client.paperwork_status_label || '-' }}</div>
            </div>
            <div class="info-item">
              <label>Insurance</label>
              <div class="info-value">{{ client.insurance_type_label || '-' }}</div>
            </div>
            <div class="info-item">
              <label>Doc Date</label>
              <div class="info-value">{{ formatDate(client.doc_date) }}</div>
            </div>
            <div class="info-item">
              <label>Referral Date</label>
              <div class="info-value">{{ formatDate(client.referral_date) }}</div>
            </div>
            <div class="info-item">
              <label>Document Status (legacy)</label>
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

        <!-- Compliance Checklist Tab -->
        <div v-if="activeTab === 'checklist'" class="detail-section">
          <h3 style="margin-top: 0;">Compliance Checklist</h3>
          <p class="hint" style="margin-top:-6px;">
            Operational tracking (non-clinical). Providers + admin/staff can update.
          </p>

          <div class="info-grid">
            <div class="info-item">
              <label>Parents Contacted</label>
              <div class="info-value">
                <input type="date" v-model="checklist.parentsContactedAt" class="inline-input" />
              </div>
            </div>
            <div class="info-item">
              <label>Contact Successful?</label>
              <div class="info-value">
                <select v-model="checklist.parentsContactedSuccessful" class="inline-select">
                  <option :value="''">—</option>
                  <option :value="'true'">Successful</option>
                  <option :value="'false'">Unsuccessful</option>
                </select>
              </div>
            </div>
            <div class="info-item">
              <label>Intake Date</label>
              <div class="info-value">
                <input type="date" v-model="checklist.intakeAt" class="inline-input" />
              </div>
            </div>
            <div class="info-item">
              <label>First Date of Service</label>
              <div class="info-value">
                <input type="date" v-model="checklist.firstServiceAt" class="inline-input" />
              </div>
            </div>
          </div>

          <div class="form-actions" style="margin-top: 12px;">
            <button class="btn btn-primary" @click="saveChecklist" :disabled="savingChecklist">
              {{ savingChecklist ? 'Saving…' : 'Save Checklist' }}
            </button>
            <span v-if="checklistAuditText" class="hint" style="margin-left: 10px;">
              {{ checklistAuditText }}
            </span>
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

        <!-- Access Log Tab -->
        <div v-if="activeTab === 'access'" class="detail-section">
          <div v-if="!canViewAccessLog" class="empty-state">
            <p>You don’t have permission to view access logs.</p>
          </div>
          <div v-else>
            <div v-if="accessLoading" class="loading">Loading access log…</div>
            <div v-else-if="accessError" class="error">{{ accessError }}</div>
            <div v-else-if="accessLog.length === 0" class="empty-state">
              <p>No access events recorded yet.</p>
            </div>
            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in accessLog" :key="e.id">
                    <td>{{ formatDateTime(e.created_at) }}</td>
                    <td>{{ formatAccessUser(e) }}</td>
                    <td>{{ e.user_role || '—' }}</td>
                    <td>{{ e.action }}</td>
                    <td>{{ e.ip_address || '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="hint" style="margin-top: 8px;">
                Tracks access to client profile + notes (best-effort).
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

        <!-- Guardians Tab -->
        <div v-if="activeTab === 'guardians'" class="detail-section">
          <div class="phi-warning" style="margin-bottom: 12px;">
            <strong>Non-clinical portal access:</strong> Guardians can be given access to docs, links, and program materials.
          </div>

          <div v-if="!canManageGuardians" class="empty-state">
            <p>You don’t have permission to manage guardians for this client.</p>
          </div>

          <div v-else>
            <div v-if="guardiansError" class="error" style="margin-bottom: 10px;">{{ guardiansError }}</div>
            <div style="display:flex; justify-content: space-between; align-items:center; gap: 12px; margin-bottom: 12px;">
              <div class="hint">Add one or more guardian accounts (e.g., divorced guardians) with their own logins.</div>
              <button type="button" class="btn btn-primary" @click="openAddGuardian">Add Guardian</button>
            </div>

            <div v-if="guardiansLoading" class="loading">Loading guardians…</div>
            <div v-else-if="(guardians || []).length === 0" class="empty-state">
              <p>No guardians yet.</p>
            </div>
            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Relationship title</th>
                    <th>Enabled</th>
                    <th class="right"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="g in guardians" :key="g.guardian_user_id">
                    <td>{{ g.first_name }} {{ g.last_name }}</td>
                    <td>{{ g.email }}</td>
                    <td style="min-width: 220px;">
                      <input v-model="g.relationship_title" type="text" />
                    </td>
                    <td>
                      <input v-model="g.access_enabled" type="checkbox" :true-value="1" :false-value="0" />
                    </td>
                    <td class="right" style="white-space: nowrap;">
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="updatingGuardianId === g.guardian_user_id"
                        @click="updateGuardian(g)"
                      >
                        {{ updatingGuardianId === g.guardian_user_id ? 'Saving…' : 'Save' }}
                      </button>
                      <button
                        type="button"
                        class="btn btn-danger btn-sm"
                        :disabled="updatingGuardianId === g.guardian_user_id"
                        @click="removeGuardian(g)"
                        style="margin-left: 8px;"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="lastInviteLink" class="phi-warning" style="margin-top: 12px;">
              <div style="display:flex; justify-content: space-between; align-items:center; gap: 10px;">
                <div>
                  <strong>Invite link generated</strong>
                  <div class="hint">Send this to the guardian to set access (expires in 48 hours).</div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" @click="copyText(lastInviteLink)">Copy link</button>
              </div>
              <div style="margin-top: 8px;">
                <input :value="lastInviteLink" readonly style="width:100%; font-family: monospace; font-size: 12px;" @click="$event.target.select()" />
              </div>
            </div>
          </div>

          <!-- Add Guardian Modal -->
          <div v-if="showAddGuardianModal" class="modal-overlay" @click.self="closeAddGuardian">
            <div class="modal-content" @click.stop style="max-width: 720px;">
              <div class="modal-header" style="padding: 16px 18px;">
                <h3 style="margin:0;">Add guardian access</h3>
                <button class="btn-close" @click="closeAddGuardian">×</button>
              </div>
              <div style="padding: 18px;">
                <div class="form-group">
                  <label>Email *</label>
                  <input v-model="addGuardianForm.email" type="email" placeholder="guardian@email.com" />
                </div>
                <div class="filters-row">
                  <div class="filters-group" style="flex:1;">
                    <label class="filters-label">First name *</label>
                    <input v-model="addGuardianForm.firstName" class="filters-input" type="text" />
                  </div>
                  <div class="filters-group" style="flex:1;">
                    <label class="filters-label">Last name *</label>
                    <input v-model="addGuardianForm.lastName" class="filters-input" type="text" />
                  </div>
                </div>
                <div class="form-group">
                  <label>Relationship title</label>
                  <input v-model="addGuardianForm.relationshipTitle" type="text" placeholder="e.g., Mom, Dad, Guardian" />
                </div>
                <div class="form-group">
                  <label class="checkbox-label">
                    <input v-model="addGuardianForm.accessEnabled" type="checkbox" />
                    Enabled
                  </label>
                </div>
                <div class="form-section-divider" style="margin-top: 14px; margin-bottom: 10px;">
                  <h4 style="margin:0;">Permissions</h4>
                </div>
                <div class="filters-row" style="flex-wrap: wrap;">
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewDocs" type="checkbox" />
                    Can view docs
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canSignDocs" type="checkbox" />
                    Can sign docs
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewLinks" type="checkbox" />
                    Can view links
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewProgramMaterials" type="checkbox" />
                    Can view program materials
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canViewProgress" type="checkbox" />
                    Can view progress
                  </label>
                  <label class="checkbox-label" style="min-width: 240px;">
                    <input v-model="addGuardianForm.permissions.canMessage" type="checkbox" />
                    Can message (rare)
                  </label>
                </div>

                <div style="display:flex; justify-content:flex-end; gap: 10px; margin-top: 18px;">
                  <button type="button" class="btn btn-secondary" @click="closeAddGuardian" :disabled="addingGuardian">Cancel</button>
                  <button type="button" class="btn btn-primary" @click="addGuardian" :disabled="addingGuardian">
                    {{ addingGuardian ? 'Creating…' : 'Create + Generate invite link' }}
                  </button>
                </div>
              </div>
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
  { id: 'checklist', label: 'Checklist' },
  { id: 'history', label: 'Status History' },
  { id: 'access', label: 'Access Log' },
  { id: 'messages', label: 'Messages' },
  { id: 'guardians', label: 'Guardians' },
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

// Access log tab state
const accessLog = ref([]);
const accessLoading = ref(false);
const accessError = ref('');

// Messages tab state
const notes = ref([]);
const notesLoading = ref(false);
const notesError = ref('');
const newNoteMessage = ref('');
const newNoteIsInternal = ref(false);
const newNoteCategory = ref('general');
const creatingNote = ref(false);

const hasAgencyAccess = ref(false);

// Compliance checklist
const savingChecklist = ref(false);
const checklistAuditText = ref('');
const checklist = ref({
  parentsContactedAt: '',
  parentsContactedSuccessful: '',
  intakeAt: '',
  firstServiceAt: ''
});

// Guardians tab state (non-clinical portal access)
const guardiansLoading = ref(false);
const guardiansError = ref('');
const guardians = ref([]);
const showAddGuardianModal = ref(false);
const addingGuardian = ref(false);
const addGuardianForm = ref({
  email: '',
  firstName: '',
  lastName: '',
  relationshipTitle: 'Guardian',
  accessEnabled: true,
  permissions: {
    canViewDocs: true,
    canSignDocs: true,
    canViewLinks: true,
    canViewProgramMaterials: true,
    canViewProgress: true,
    canMessage: false
  }
});
const lastInviteLink = ref('');
const updatingGuardianId = ref(null);

const canManageGuardians = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support'].includes(r) && hasAgencyAccess.value;
});

const canCreateInternalNotes = computed(() => {
  return hasAgencyAccess.value;
});

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = parseDateForDisplay(dateString);
  return date.toLocaleDateString();
};

const parseDateForDisplay = (dateValue) => {
  if (!dateValue) return new Date(0);
  const s = String(dateValue);
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    return new Date(y, m, d);
  }
  return new Date(s);
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

const fetchGuardians = async () => {
  if (!canManageGuardians.value) return;
  try {
    guardiansLoading.value = true;
    guardiansError.value = '';
    const resp = await api.get(`/clients/${props.client.id}/guardians`);
    guardians.value = resp.data || [];
  } catch (err) {
    guardiansError.value = err.response?.data?.error?.message || 'Failed to load guardians';
    guardians.value = [];
  } finally {
    guardiansLoading.value = false;
  }
};

const openAddGuardian = () => {
  lastInviteLink.value = '';
  addGuardianForm.value = {
    email: '',
    firstName: '',
    lastName: '',
    relationshipTitle: 'Guardian',
    accessEnabled: true,
    permissions: {
      canViewDocs: true,
      canSignDocs: true,
      canViewLinks: true,
      canViewProgramMaterials: true,
      canViewProgress: true,
      canMessage: false
    }
  };
  showAddGuardianModal.value = true;
};

const closeAddGuardian = () => {
  showAddGuardianModal.value = false;
};

const copyText = async (text) => {
  const t = String(text || '').trim();
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
};

const addGuardian = async () => {
  if (!canManageGuardians.value) return;
  const email = String(addGuardianForm.value.email || '').trim();
  const firstName = String(addGuardianForm.value.firstName || '').trim();
  const lastName = String(addGuardianForm.value.lastName || '').trim();
  if (!email || !firstName || !lastName) return;
  try {
    addingGuardian.value = true;
    guardiansError.value = '';
    const resp = await api.post(`/clients/${props.client.id}/guardians`, {
      email,
      firstName,
      lastName,
      relationshipTitle: String(addGuardianForm.value.relationshipTitle || 'Guardian').trim() || 'Guardian',
      accessEnabled: addGuardianForm.value.accessEnabled !== false,
      permissionsJson: addGuardianForm.value.permissions
    });
    lastInviteLink.value = resp.data?.passwordlessTokenLink || '';
    await fetchGuardians();
  } catch (err) {
    guardiansError.value = err.response?.data?.error?.message || 'Failed to add guardian';
  } finally {
    addingGuardian.value = false;
  }
};

const updateGuardian = async (g) => {
  if (!canManageGuardians.value) return;
  const id = Number(g?.guardian_user_id);
  if (!id) return;
  try {
    updatingGuardianId.value = id;
    await api.patch(`/clients/${props.client.id}/guardians/${id}`, {
      relationshipTitle: String(g.relationship_title || 'Guardian').trim() || 'Guardian',
      accessEnabled: g.access_enabled === 1 || g.access_enabled === true
    });
    await fetchGuardians();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update guardian');
  } finally {
    updatingGuardianId.value = null;
  }
};

const removeGuardian = async (g) => {
  if (!canManageGuardians.value) return;
  const id = Number(g?.guardian_user_id);
  if (!id) return;
  if (!window.confirm('Remove this guardian’s access to this client?')) return;
  try {
    updatingGuardianId.value = id;
    await api.delete(`/clients/${props.client.id}/guardians/${id}`);
    await fetchGuardians();
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to remove guardian');
  } finally {
    updatingGuardianId.value = null;
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
      ['provider', 'supervisor', 'admin'].includes(u.role?.toLowerCase())
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
  } else if (newTab === 'access' && accessLog.value.length === 0) {
    fetchAccessLog();
  } else if (newTab === 'checklist') {
    hydrateChecklist();
  } else if (newTab === 'messages' && notes.value.length === 0) {
    fetchNotes();
  } else if (newTab === 'guardians' && guardians.value.length === 0) {
    fetchGuardians();
  }
});

watch(() => props.client, () => {
  // Reset editing states when client changes
  editingStatus.value = false;
  editingProvider.value = false;
}, { deep: true });

const hydrateChecklist = async () => {
  try {
    const r = await api.get(`/clients/${props.client.id}`);
    const c = r.data || {};
    checklist.value.parentsContactedAt = c.parents_contacted_at ? String(c.parents_contacted_at).slice(0, 10) : '';
    checklist.value.parentsContactedSuccessful =
      c.parents_contacted_successful === null || c.parents_contacted_successful === undefined
        ? ''
        : (c.parents_contacted_successful ? 'true' : 'false');
    checklist.value.intakeAt = c.intake_at ? String(c.intake_at).slice(0, 10) : '';
    checklist.value.firstServiceAt = c.first_service_at ? String(c.first_service_at).slice(0, 10) : '';
    const who = c.checklist_updated_by_name || null;
    const when = c.checklist_updated_at ? new Date(c.checklist_updated_at).toLocaleString() : null;
    checklistAuditText.value = who && when ? `Last updated by ${who} on ${when}` : (when ? `Last updated on ${when}` : '');
  } catch {
    // ignore
  }
};

const saveChecklist = async () => {
  try {
    savingChecklist.value = true;
    const payload = {
      parentsContactedAt: checklist.value.parentsContactedAt || null,
      parentsContactedSuccessful: checklist.value.parentsContactedSuccessful === '' ? null : (checklist.value.parentsContactedSuccessful === 'true'),
      intakeAt: checklist.value.intakeAt || null,
      firstServiceAt: checklist.value.firstServiceAt || null
    };
    const r = await api.put(`/clients/${props.client.id}/compliance-checklist`, payload);
    const c = r.data || {};
    const who = c.checklist_updated_by_name || null;
    const when = c.checklist_updated_at ? new Date(c.checklist_updated_at).toLocaleString() : null;
    checklistAuditText.value = who && when ? `Last updated by ${who} on ${when}` : (when ? `Last updated on ${when}` : '');
    emit('updated');
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to save checklist');
  } finally {
    savingChecklist.value = false;
  }
};

const canViewAccessLog = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'admin' || role === 'support' || role === 'staff';
});

const formatAccessUser = (e) => {
  const name = `${e.user_first_name || ''} ${e.user_last_name || ''}`.trim();
  return name || e.user_email || `User ${e.user_id}`;
};

const fetchAccessLog = async () => {
  if (!canViewAccessLog.value) return;
  try {
    accessLoading.value = true;
    accessError.value = '';
    const r = await api.get(`/clients/${props.client.id}/access-log`);
    accessLog.value = r.data || [];
  } catch (e) {
    accessError.value = e.response?.data?.error?.message || 'Failed to load access log';
  } finally {
    accessLoading.value = false;
  }
};

onMounted(async () => {
  await fetchProviders();
  await fetchAccess();
  if (activeTab.value === 'history') {
    await fetchHistory();
  } else if (activeTab.value === 'access') {
    await fetchAccessLog();
  } else if (activeTab.value === 'checklist') {
    await hydrateChecklist();
  } else if (activeTab.value === 'messages') {
    await fetchNotes();
  } else if (activeTab.value === 'guardians') {
    await fetchGuardians();
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

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-size: 14px;
}

.table th {
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  background: var(--bg-alt);
}

.table td.right,
.table th.right {
  text-align: right;
}

.table input[type="text"],
.table input[type="email"],
.table input[type="url"],
.table input[type="password"],
.table input[type="number"],
.table input[type="date"],
.table input[type="time"],
.table input[type="tel"],
.table input[type="search"],
.table input,
.form-group input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.form-group > label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.hint {
  font-size: 13px;
  color: var(--text-secondary);
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
