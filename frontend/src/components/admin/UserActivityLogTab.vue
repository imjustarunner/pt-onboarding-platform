<template>
  <div class="user-activity-log-tab">
    <h2 style="margin-bottom: 20px;">Activity Log</h2>

    <div v-if="loading" class="loading">Loading activity data...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <!-- Summary Cards -->
      <div class="summary-cards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;">
        <div class="summary-card" style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 20px;">
          <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Total Logins</div>
          <div style="font-size: 32px; font-weight: 600; color: var(--primary);">{{ summary.totalLogins || 0 }}</div>
        </div>
        <div class="summary-card" style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 20px;">
          <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Total Time in Modules</div>
          <div style="font-size: 32px; font-weight: 600; color: var(--primary);">{{ formatTime(summary.totalModuleTimeSeconds || 0) }}</div>
        </div>
        <div class="summary-card" style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 20px;">
          <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Last Login</div>
          <div style="font-size: 18px; font-weight: 600; color: var(--text-primary);">
            {{ summary.lastLogin ? formatDate(summary.lastLogin) : 'Never' }}
          </div>
          <div v-if="summary.lastLogin" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
            ({{ new Date(summary.lastLogin).toISOString() }})
          </div>
        </div>
        <div class="summary-card" style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 20px;">
          <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">First Login</div>
          <div style="font-size: 18px; font-weight: 600; color: var(--text-primary);">
            {{ summary.firstLogin ? formatDate(summary.firstLogin) : 'Never' }}
          </div>
          <div v-if="summary.firstLogin" style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
            ({{ new Date(summary.firstLogin).toISOString() }})
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters" style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div>
            <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500;">Action Type</label>
            <select v-model="filters.actionType" @change="fetchActivityLog" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
              <option value="">All Actions</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="password_change">Password Change</option>
              <option value="module_start">Module Start</option>
              <option value="module_end">Module End</option>
              <option value="module_complete">Module Complete</option>
              <option value="page_navigation">Page Navigation</option>
            </select>
          </div>
          <div>
            <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500;">Start Date</label>
            <input v-model="filters.startDate" @change="fetchActivityLog" type="date" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
          </div>
          <div>
            <label style="display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500;">End Date</label>
            <input v-model="filters.endDate" @change="fetchActivityLog" type="date" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 6px;">
          </div>
        </div>
      </div>

      <!-- Activity Log Table -->
      <div class="activity-log-table" style="background: white; border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead style="background: #f8f9fa;">
            <tr>
              <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border);">Date/Time</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border);">Action Type</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border);">Details</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border);">Duration</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border);">IP Address</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="activityLog.length === 0 && !loading">
              <td colspan="5" style="padding: 40px; text-align: center; color: var(--text-secondary);">
                <div v-if="error" style="color: var(--error);">
                  {{ error }}
                </div>
                <div v-else>
                  No activity found
                </div>
              </td>
            </tr>
            <tr v-for="activity in activityLog" :key="activity.id" style="border-bottom: 1px solid var(--border);">
              <td style="padding: 12px;">{{ formatDate(activity.created_at) }}</td>
              <td style="padding: 12px;">
                <span :class="['badge', getActionBadgeClass(activity.action_type)]">
                  {{ formatActionType(activity.action_type) }}
                </span>
              </td>
              <td style="padding: 12px;">
                <div v-if="activity.module_id && activity.module_title" style="font-weight: 500;">
                  Module: {{ activity.module_title }}
                </div>
                <div v-if="activity.metadata" style="font-size: 12px; color: var(--text-secondary);">
                  {{ formatMetadata(activity.metadata) }}
                </div>
              </td>
              <td style="padding: 12px;">
                <span v-if="activity.duration_seconds">{{ formatTime(activity.duration_seconds) }}</span>
                <span v-else style="color: var(--text-secondary);">-</span>
              </td>
              <td style="padding: 12px; font-size: 12px; color: var(--text-secondary);">
                {{ activity.ip_address || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Module Time Breakdown -->
      <div v-if="moduleBreakdown.length > 0" class="module-breakdown" style="margin-top: 32px;">
        <h3 style="margin-bottom: 16px; font-size: 18px; font-weight: 600;">Module Time Breakdown</h3>
        <div class="module-breakdown-table" style="background: white; border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead style="background: #f8f9fa;">
              <tr>
                <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border);">Module</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border);">Total Time</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border);">Activities</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border);">First Access</th>
                <th style="padding: 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border);">Last Access</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="module in moduleBreakdown" :key="module.moduleId" style="border-bottom: 1px solid var(--border);">
                <td style="padding: 12px; font-weight: 500;">{{ module.moduleTitle || 'Unknown Module' }}</td>
                <td style="padding: 12px;">{{ formatTime(module.totalSeconds) }}</td>
                <td style="padding: 12px;">{{ module.activityCount }}</td>
                <td style="padding: 12px;">{{ formatDate(module.firstAccess) }}</td>
                <td style="padding: 12px;">{{ formatDate(module.lastAccess) }}</td>
              </tr>
            </tbody>
          </table>
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
  }
});

const loading = ref(true);
const error = ref('');
const summary = ref({
  totalLogins: 0,
  totalModuleTimeSeconds: 0,
  firstLogin: null,
  lastLogin: null
});
const activityLog = ref([]);
const moduleBreakdown = ref([]);

// Helper function to format date as YYYY-MM-DD
const formatDateForInput = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Set default date range to last 7 days
const getDefaultDateRange = () => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  return {
    startDate: formatDateForInput(startDate),
    endDate: formatDateForInput(endDate)
  };
};

const defaultDates = getDefaultDateRange();
const filters = ref({
  actionType: '',
  startDate: defaultDates.startDate,
  endDate: defaultDates.endDate
});

const fetchSummary = async () => {
  try {
    const response = await api.get(`/activity-log/user/${props.userId}/summary`);
    console.log('Activity summary response:', response.data);
    summary.value = response.data || {
      totalLogins: 0,
      totalModuleTimeSeconds: 0,
      firstLogin: null,
      lastLogin: null
    };
  } catch (err) {
    console.error('Failed to fetch activity summary:', err);
    console.error('Error response:', err.response);
    error.value = err.response?.data?.error?.message || 'Failed to load activity summary';
    summary.value = {
      totalLogins: 0,
      totalModuleTimeSeconds: 0,
      firstLogin: null,
      lastLogin: null
    };
  }
};

const fetchActivityLog = async () => {
  try {
    loading.value = true;
    error.value = '';
    const params = {
      limit: 100
    };
    if (filters.value.actionType) {
      params.actionType = filters.value.actionType;
    }
    if (filters.value.startDate) {
      params.startDate = filters.value.startDate;
    }
    if (filters.value.endDate) {
      params.endDate = filters.value.endDate;
    }
    
    console.log('Fetching activity log for user:', props.userId, 'with params:', params);
    const response = await api.get(`/activity-log/user/${props.userId}`, { params });
    console.log('Activity log response:', response.data);
    console.log('Activity log entries count:', response.data?.length || 0);
    activityLog.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch activity log:', err);
    console.error('Error response:', err.response);
    console.error('Error response data:', err.response?.data);
    error.value = err.response?.data?.error?.message || 'Failed to load activity log';
    activityLog.value = [];
  } finally {
    loading.value = false;
  }
};

const fetchModuleBreakdown = async () => {
  try {
    const response = await api.get(`/activity-log/user/${props.userId}/modules`);
    moduleBreakdown.value = response.data;
  } catch (err) {
    console.error('Failed to fetch module breakdown:', err);
  }
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  // Format date in MST (Mountain Standard Time, UTC-7)
  // Always use America/Denver timezone regardless of user's browser timezone
  const date = new Date(dateString);
  
  // Use Intl.DateTimeFormat to ensure timezone is forced to MST/MDT
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver', // Force MST/MDT timezone - this overrides browser timezone
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  
  const formatted = formatter.format(date);
  
  // Determine timezone abbreviation (MST or MDT)
  // America/Denver uses MDT (UTC-6) from second Sunday in March to first Sunday in November
  // For simplicity, check the month: March (2) through October (9) is typically MDT
  const month = date.getUTCMonth(); // 0-11 (0=Jan, 1=Feb, etc.)
  // January (0), February (1), November (10), December (11) = MST
  // March (2) through October (9) = MDT (with some edge cases around DST transitions)
  const isDST = month >= 2 && month <= 9;
  const tzAbbr = isDST ? 'MDT' : 'MST';
  
  return `${formatted} ${tzAbbr}`;
};

const formatTime = (seconds) => {
  if (!seconds || seconds === 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
};

const formatActionType = (actionType) => {
  const types = {
    'login': 'Login',
    'logout': 'Logout',
    'timeout': 'Timeout',
    'password_change': 'Password Change',
    'module_start': 'Module Start',
    'module_end': 'Module End',
    'module_complete': 'Module Complete',
    'page_navigation': 'Page Navigation',
    'page_view': 'Page View',
    'api_call': 'API Call'
  };
  return types[actionType] || actionType;
};

const getActionBadgeClass = (actionType) => {
  const classes = {
    'login': 'badge-success',
    'logout': 'badge-secondary',
    'timeout': 'badge-warning',
    'password_change': 'badge-info',
    'module_start': 'badge-primary',
    'module_end': 'badge-primary',
    'module_complete': 'badge-success',
    'page_navigation': 'badge-secondary',
    'page_view': 'badge-secondary',
    'api_call': 'badge-secondary'
  };
  return classes[actionType] || 'badge-secondary';
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
  const parts = [];
  if (metadata.email) parts.push(`Email: ${metadata.email}`);
  if (metadata.role) parts.push(`Role: ${metadata.role}`);
  if (metadata.moduleId) parts.push(`Module ID: ${metadata.moduleId}`);
  if (metadata.isFirstLogin) parts.push('First Login');
  if (metadata.isFirstPasswordChange) parts.push('First Password Change');
  return parts.join(', ') || JSON.stringify(metadata);
};

onMounted(async () => {
  await Promise.all([
    fetchSummary(),
    fetchActivityLog(),
    fetchModuleBreakdown()
  ]);
});
</script>

<style scoped>
.badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-success {
  background: #d1fae5;
  color: #065f46;
}

.badge-info {
  background: #dbeafe;
  color: #1e40af;
}

.badge-warning {
  background: #fef3c7;
  color: #92400e;
}

.badge-primary {
  background: #e0e7ff;
  color: #3730a3;
}

.badge-secondary {
  background: #e5e7eb;
  color: #374151;
}

.loading, .error {
  padding: 40px;
  text-align: center;
}

.error {
  color: #dc3545;
}
</style>
