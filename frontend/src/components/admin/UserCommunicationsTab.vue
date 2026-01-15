<template>
  <div class="user-communications-tab">
    <div class="tab-header">
      <h3>Generated Communications</h3>
      <div class="filter-controls">
        <select v-model="selectedAgency" @change="loadCommunications" class="form-select">
          <option value="">All Agencies</option>
          <option v-for="agency in userAgencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
        <select v-model="selectedType" @change="loadCommunications" class="form-select">
          <option value="">All Types</option>
          <option value="user_welcome">User Welcome</option>
          <option value="password_reset">Password Reset</option>
          <option value="invitation">Invitation</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading communications...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="communications.length === 0" class="empty-state">
      <p>No communications found for this user.</p>
    </div>
    <div v-else class="communications-list">
      <div v-for="comm in communications" :key="comm.id" class="communication-card">
        <div class="communication-header">
          <div class="communication-info">
            <h4>{{ comm.subject }}</h4>
            <div class="communication-meta">
              <span class="meta-item">
                <strong>Agency:</strong> {{ comm.agency_name }}
              </span>
              <span class="meta-item">
                <strong>Type:</strong> {{ formatType(comm.template_type) }}
              </span>
              <span class="meta-item">
                <strong>Generated:</strong> {{ formatDate(comm.generated_at) }}
              </span>
              <span v-if="comm.generated_by_first_name" class="meta-item">
                <strong>By:</strong> {{ comm.generated_by_first_name }} {{ comm.generated_by_last_name }}
              </span>
            </div>
          </div>
          <div class="communication-actions">
            <button @click="viewCommunication(comm)" class="btn btn-sm btn-primary">View</button>
            <button @click="copyCommunication(comm)" class="btn btn-sm btn-secondary">Copy</button>
            <button 
              v-if="comm.template_id && !viewOnly" 
              @click="regenerateCommunication(comm)" 
              class="btn btn-sm btn-info"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="section-divider"></div>

    <div class="tab-header">
      <h3>System Texts (Notifications)</h3>
      <div class="filter-controls">
        <select v-model="smsAgency" @change="loadSmsLogs" class="form-select">
          <option value="">All Agencies</option>
          <option v-for="agency in userAgencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
      </div>
    </div>

    <div v-if="smsLoading" class="loading">Loading system texts...</div>
    <div v-else-if="smsError" class="error">{{ smsError }}</div>
    <div v-else-if="smsLogs.length === 0" class="empty-state">
      <p>No system texts found for this user.</p>
    </div>
    <div v-else class="communications-list">
      <div v-for="log in smsLogs" :key="log.id" class="communication-card">
        <div class="communication-header">
          <div class="communication-info">
            <h4>{{ log.notification_title || 'Notification SMS' }}</h4>
            <div class="communication-meta">
              <span class="meta-item">
                <strong>Status:</strong> {{ log.status }}
              </span>
              <span class="meta-item">
                <strong>To:</strong> {{ log.to_number }}
              </span>
              <span class="meta-item">
                <strong>Sent:</strong> {{ formatDate(log.created_at) }}
              </span>
              <span v-if="log.twilio_sid" class="meta-item">
                <strong>SID:</strong> {{ log.twilio_sid }}
              </span>
            </div>
          </div>
          <div class="communication-actions">
            <button @click="viewSms(log)" class="btn btn-sm btn-primary">View</button>
            <button @click="copySms(log)" class="btn btn-sm btn-secondary">Copy</button>
          </div>
        </div>
      </div>
    </div>

    <!-- View SMS Modal -->
    <div v-if="viewingSms" class="modal-overlay" @click="closeSmsModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ viewingSms.notification_title || 'Notification SMS' }}</h3>
          <button @click="closeSmsModal" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="view-communication-meta">
            <p><strong>Status:</strong> {{ viewingSms.status }}</p>
            <p><strong>To:</strong> {{ viewingSms.to_number }}</p>
            <p><strong>From:</strong> {{ viewingSms.from_number }}</p>
            <p><strong>Sent:</strong> {{ formatDate(viewingSms.created_at) }}</p>
            <p v-if="viewingSms.twilio_sid"><strong>SID:</strong> {{ viewingSms.twilio_sid }}</p>
            <p v-if="viewingSms.error_message"><strong>Error:</strong> {{ viewingSms.error_message }}</p>
          </div>
          <div class="view-communication-content">
            <h4>Body:</h4>
            <pre class="email-body">{{ viewingSms.body }}</pre>
          </div>
          <div class="modal-actions">
            <button @click="copySms(viewingSms)" class="btn btn-primary">Copy Text</button>
            <button @click="closeSmsModal" class="btn btn-secondary">Close</button>
          </div>
        </div>
      </div>
    </div>

    <!-- View Communication Modal -->
    <div v-if="viewingCommunication" class="modal-overlay" @click="closeViewModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ viewingCommunication.subject }}</h3>
          <button @click="closeViewModal" class="btn-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="view-communication-meta">
            <p><strong>Agency:</strong> {{ viewingCommunication.agency_name }}</p>
            <p><strong>Type:</strong> {{ formatType(viewingCommunication.template_type) }}</p>
            <p><strong>Generated:</strong> {{ formatDate(viewingCommunication.generated_at) }}</p>
            <p v-if="viewingCommunication.generated_by_first_name">
              <strong>By:</strong> {{ viewingCommunication.generated_by_first_name }} {{ viewingCommunication.generated_by_last_name }}
            </p>
          </div>
          <div class="view-communication-content">
            <h4>Subject:</h4>
            <p class="email-subject">{{ viewingCommunication.subject }}</p>
            <h4>Body:</h4>
            <pre class="email-body">{{ viewingCommunication.body }}</pre>
          </div>
          <div class="modal-actions">
            <button @click="copyCommunication(viewingCommunication)" class="btn btn-primary">Copy Email</button>
            <button @click="closeViewModal" class="btn btn-secondary">Close</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  userId: {
    type: Number,
    required: true
  },
  userAgencies: {
    type: Array,
    default: () => []
  },
  viewOnly: {
    type: Boolean,
    default: false
  }
});

const communications = ref([]);
const loading = ref(false);
const error = ref('');
const selectedAgency = ref('');
const selectedType = ref('');
const viewingCommunication = ref(null);

const loadCommunications = async () => {
  loading.value = true;
  error.value = '';
  try {
    const params = {};
    if (selectedAgency.value) {
      params.agencyId = selectedAgency.value;
    }
    if (selectedType.value) {
      params.templateType = selectedType.value;
    }
    
    const response = await api.get(`/users/${props.userId}/communications`, { params });
    communications.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load communications';
  } finally {
    loading.value = false;
  }
};

const smsLogs = ref([]);
const smsLoading = ref(false);
const smsError = ref('');
const smsAgency = ref('');
const viewingSms = ref(null);

const loadSmsLogs = async () => {
  smsLoading.value = true;
  smsError.value = '';
  try {
    const params = { userId: props.userId };
    if (smsAgency.value) params.agencyId = smsAgency.value;
    const response = await api.get('/notifications/sms-logs', { params });
    smsLogs.value = response.data || [];
  } catch (err) {
    smsError.value = err.response?.data?.error?.message || 'Failed to load system texts';
  } finally {
    smsLoading.value = false;
  }
};

const viewSms = (log) => {
  viewingSms.value = log;
};

const closeSmsModal = () => {
  viewingSms.value = null;
};

const copySms = async (log) => {
  try {
    await navigator.clipboard.writeText(log.body || '');
    alert('Text copied to clipboard');
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy text');
  }
};

const viewCommunication = (comm) => {
  viewingCommunication.value = comm;
};

const closeViewModal = () => {
  viewingCommunication.value = null;
};

const copyCommunication = async (comm) => {
  const emailText = `Subject: ${comm.subject}\n\n${comm.body}`;
  try {
    await navigator.clipboard.writeText(emailText);
    alert('Email copied to clipboard');
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy email');
  }
};

const regenerateCommunication = async (comm) => {
  if (!confirm('Regenerate this email? Note: Some parameters (like temporary password) may be missing as they are not stored for security reasons.')) {
    return;
  }
  
  try {
    const response = await api.post(`/users/${props.userId}/communications/${comm.id}/regenerate`);
    alert('Email regenerated. Note: Some parameters may be missing.');
    // Could show the regenerated email in a modal
  } catch (err) {
    alert('Failed to regenerate email: ' + (err.response?.data?.error?.message || err.message));
  }
};

const formatType = (type) => {
  const types = {
    user_welcome: 'User Welcome',
    password_reset: 'Password Reset',
    invitation: 'Invitation'
  };
  return types[type] || type;
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

onMounted(() => {
  loadCommunications();
  loadSmsLogs();
});
</script>

<style scoped>
.user-communications-tab {
  padding: 24px;
}

.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.tab-header h3 {
  margin: 0;
}

.filter-controls {
  display: flex;
  gap: 12px;
}

.filter-controls .form-select {
  min-width: 200px;
}

.communications-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.communication-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  background: white;
}

.communication-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
}

.communication-info h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.communication-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--text-secondary);
}

.meta-item {
  display: flex;
  gap: 4px;
}

.communication-actions {
  display: flex;
  gap: 8px;
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

.view-communication-meta {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border);
}

.view-communication-meta p {
  margin: 8px 0;
  font-size: 14px;
}

.view-communication-content {
  margin-bottom: 20px;
}

.view-communication-content h4 {
  margin: 16px 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.email-subject {
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 16px;
}

.email-body {
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 13px;
  white-space: pre-wrap;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  max-height: 400px;
  overflow-y: auto;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.loading {
  text-align: center;
  padding: 40px;
}

.error {
  color: var(--error);
  padding: 20px;
  background: #fee2e2;
  border-radius: 6px;
  margin-bottom: 20px;
}
</style>
