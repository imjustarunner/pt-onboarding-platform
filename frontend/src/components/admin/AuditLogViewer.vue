<template>
  <div class="audit-log-viewer">
    <div class="viewer-header">
      <h3>Audit Log</h3>
      <div class="filters">
        <select v-model="filterActionType" @change="loadAuditLog" class="filter-select">
          <option value="">All Actions</option>
          <optgroup label="Admin Actions">
            <option value="reset_module">Reset Module</option>
            <option value="reset_track">Reset Track</option>
            <option value="mark_module_complete">Mark Module Complete</option>
            <option value="mark_track_complete">Mark Track Complete</option>
          </optgroup>
          <optgroup label="User Activities">
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="timeout">Timeout</option>
            <option value="page_view">Page View</option>
            <option value="api_call">API Call</option>
          </optgroup>
        </select>
        <input 
          v-model="filterStartDate" 
          type="date" 
          @change="loadAuditLog"
          class="filter-date"
          placeholder="Start Date"
        />
        <input 
          v-model="filterEndDate" 
          type="date" 
          @change="loadAuditLog"
          class="filter-date"
          placeholder="End Date"
        />
      </div>
    </div>

    <div v-if="loading" class="loading">Loading audit log...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="auditLog.length === 0" class="empty-state">No audit log entries found</div>

    <div v-else class="audit-log-list">
      <div
        v-for="entry in auditLog"
        :key="entry.id"
        class="audit-entry"
      >
        <div class="entry-header">
          <div class="entry-badges">
            <span class="log-type-badge" :class="entry.logType === 'user_activity' ? 'type-activity' : 'type-admin'">
              {{ entry.logType === 'user_activity' ? 'Activity' : 'Admin Action' }}
            </span>
            <span class="action-badge" :class="getActionClass(entry.action_type)">
              {{ formatActionType(entry.action_type) }}
            </span>
          </div>
          <span class="entry-date">{{ formatDate(entry.created_at) }}</span>
        </div>
        <div class="entry-details">
          <p v-if="entry.logType === 'admin_action'">
            <strong>Actor:</strong> {{ entry.actor_first_name }} {{ entry.actor_last_name }} ({{ entry.actor_email }})
          </p>
          <p v-if="entry.logType === 'admin_action' && entry.actor_email !== entry.target_email">
            <strong>Target User:</strong> {{ entry.target_first_name }} {{ entry.target_last_name }} ({{ entry.target_email }})
          </p>
          <p v-if="entry.logType === 'user_activity'">
            <strong>User:</strong> {{ entry.user_first_name || entry.actor_first_name }} {{ entry.user_last_name || entry.actor_last_name }} ({{ entry.user_email || entry.actor_email }})
          </p>
          <p v-if="entry.ip_address">
            <strong>IP Address:</strong> {{ entry.ip_address }}
          </p>
          <p v-if="entry.user_agent">
            <strong>User Agent:</strong> <span class="user-agent">{{ truncateUserAgent(entry.user_agent) }}</span>
          </p>
          <p v-if="entry.session_id">
            <strong>Session ID:</strong> <span class="session-id">{{ entry.session_id.substring(0, 8) }}...</span>
          </p>
          <p v-if="entry.module_title">
            <strong>Module:</strong> {{ entry.module_title }}
          </p>
          <p v-if="entry.track_name">
            <strong>Track:</strong> {{ entry.track_name }}
          </p>
          <div v-if="entry.metadata" class="metadata">
            <strong>Details:</strong> {{ formatMetadata(entry.metadata) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: {
    type: Number,
    required: true
  },
  userId: {
    type: Number,
    default: null
  }
});

const auditLog = ref([]);
const loading = ref(false);
const error = ref('');
const filterActionType = ref('');
const filterStartDate = ref('');
const filterEndDate = ref('');

const loadAuditLog = async () => {
  if (!props.agencyId) return;
  
  try {
    loading.value = true;
    error.value = '';
    
    const params = {};
    if (filterActionType.value) {
      params.actionType = filterActionType.value;
    }
    if (filterStartDate.value) {
      params.startDate = filterStartDate.value;
    }
    if (filterEndDate.value) {
      params.endDate = filterEndDate.value;
    }
    if (props.userId) {
      params.userId = props.userId;
    }

    const response = await api.get(`/admin-actions/audit-log/${props.agencyId}`, { params });
    auditLog.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load audit log';
  } finally {
    loading.value = false;
  }
};

const formatActionType = (actionType) => {
  const types = {
    'reset_module': 'Reset Module',
    'reset_track': 'Reset Track',
    'mark_module_complete': 'Mark Module Complete',
    'mark_track_complete': 'Mark Track Complete',
    'login': 'Login',
    'logout': 'Logout',
    'timeout': 'Timeout',
    'page_view': 'Page View',
    'api_call': 'API Call'
  };
  return types[actionType] || actionType;
};

const getActionClass = (actionType) => {
  if (actionType.startsWith('reset')) {
    return 'action-reset';
  }
  if (actionType === 'login') {
    return 'action-login';
  }
  if (actionType === 'logout' || actionType === 'timeout') {
    return 'action-logout';
  }
  if (actionType === 'page_view' || actionType === 'api_call') {
    return 'action-info';
  }
  return 'action-complete';
};

const truncateUserAgent = (userAgent) => {
  if (!userAgent) return '';
  if (userAgent.length > 80) {
    return userAgent.substring(0, 80) + '...';
  }
  return userAgent;
};

const formatMetadata = (metadata) => {
  if (!metadata) return '';
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch (e) {
      return metadata;
    }
  }
  if (typeof metadata === 'object') {
    return JSON.stringify(metadata, null, 2);
  }
  return String(metadata);
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString();
};

watch(() => props.agencyId, () => {
  if (props.agencyId) {
    loadAuditLog();
  }
});

onMounted(() => {
  if (props.agencyId) {
    loadAuditLog();
  }
});
</script>

<style scoped>
.audit-log-viewer {
  margin-top: 20px;
  padding: 20px;
  background: white;
  border-radius: 12px;
  border: 2px solid var(--border);
}

.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid var(--border);
}

.viewer-header h3 {
  margin: 0;
  color: var(--text-primary);
}

.filters {
  display: flex;
  gap: 10px;
  align-items: center;
}

.filter-select,
.filter-date {
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.audit-log-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  max-height: 500px;
  overflow-y: auto;
}

.audit-entry {
  padding: 15px;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.action-badge {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.log-type-badge {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  margin-right: 8px;
}

.type-admin {
  background: #dbeafe;
  color: #1e40af;
}

.type-activity {
  background: #fef3c7;
  color: #92400e;
}

.entry-badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-reset {
  background: #fee2e2;
  color: #991b1b;
}

.action-complete {
  background: #d1fae5;
  color: #065f46;
}

.action-login {
  background: #d1fae5;
  color: #065f46;
}

.action-logout {
  background: #fef3c7;
  color: #92400e;
}

.action-info {
  background: #e0e7ff;
  color: #3730a3;
}

.user-agent {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
}

.session-id {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
}

.entry-date {
  font-size: 12px;
  color: var(--text-secondary);
}

.entry-details p {
  margin: 5px 0;
  font-size: 14px;
  color: var(--text-primary);
}

.metadata {
  margin-top: 10px;
  padding: 10px;
  background: white;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}
</style>

