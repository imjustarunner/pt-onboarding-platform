<template>
  <div class="email-settings">
    <div class="section-header">
      <h2>Email Settings</h2>
      <p class="section-description">
        Control delivery mode and verify Gmail API configuration.
      </p>
    </div>

    <div v-if="loading" class="loading">Loading email settings...</div>
    <div v-else>
      <div v-if="error" class="error">{{ error }}</div>

      <div class="settings-card">
        <h3 class="settings-title">Platform Controls</h3>
        <div class="settings-row">
          <div class="settings-label">Delivery Mode</div>
          <div class="settings-value">
            <select v-model="form.platform.sendingMode" class="form-select" :disabled="!canEditPlatform">
              <option value="manual_only">Manual only (admin click required)</option>
              <option value="all">Allow auto + manual</option>
            </select>
            <small class="hint">
              Manual-only blocks all automatic emails and inbound AI replies. Manual sends still work.
            </small>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-label">Platform Notifications</div>
          <div class="settings-value">
            <label class="toggle">
              <input type="checkbox" v-model="form.platform.notificationsEnabled" :disabled="!canEditPlatform" />
              <span>Enable email notifications platform-wide</span>
            </label>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-label">Gmail API</div>
          <div class="settings-value">
            <span :class="['status-pill', settings.configured ? 'ok' : 'warn']">
              {{ settings.configured ? 'Configured' : 'Not configured' }}
            </span>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-label">From Name</div>
          <div class="settings-value">{{ settings.fromName || '—' }}</div>
        </div>

        <div class="settings-row">
          <div class="settings-label">From Address</div>
          <div class="settings-value">{{ settings.fromAddress || '—' }}</div>
        </div>

        <div class="settings-row">
          <div class="settings-label">Impersonate User</div>
          <div class="settings-value">{{ settings.impersonateUser || '—' }}</div>
        </div>
      </div>

      <div class="settings-card">
        <h3 class="settings-title">Agency Notification Toggles</h3>
        <div v-if="!agencyRows.length" class="empty-state">No agencies available.</div>
        <div v-else class="agency-list">
          <div v-for="agency in agencyRows" :key="agency.agencyId" class="agency-row">
            <div class="agency-name">{{ agency.name }}</div>
            <div class="agency-toggle">
              <label class="toggle">
                <input
                  type="checkbox"
                  v-model="agency.notificationsEnabled"
                  :disabled="!canEditAgencies"
                />
                <span>Enabled</span>
              </label>
              <small v-if="!settings.platform.notificationsEnabled" class="hint">
                Disabled by platform toggle.
              </small>
            </div>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button v-if="canEditAny" class="btn btn-primary" :disabled="saving" @click="save">
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';

const authStore = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const error = ref('');

const settings = ref({
  platform: {
    sendingMode: 'all',
    notificationsEnabled: true
  },
  configured: false,
  fromAddress: null,
  fromName: null,
  impersonateUser: null,
  agencies: []
});

const form = ref({
  platform: {
    sendingMode: 'all',
    notificationsEnabled: true
  }
});

const agencyRows = ref([]);

const canEditPlatform = computed(() => authStore.user?.role === 'super_admin');
const canEditAgencies = computed(() => ['super_admin', 'admin'].includes(authStore.user?.role));
const canEditAny = computed(() => canEditPlatform.value || canEditAgencies.value);

const loadSettings = async () => {
  loading.value = true;
  error.value = '';
  try {
    const response = await api.get('/email-settings');
    settings.value = response.data || settings.value;
    form.value.platform.sendingMode = settings.value.platform?.sendingMode || 'all';
    form.value.platform.notificationsEnabled = settings.value.platform?.notificationsEnabled !== false;
    agencyRows.value = (settings.value.agencies || []).map((a) => ({
      agencyId: a.agencyId,
      name: a.name,
      notificationsEnabled: a.notificationsEnabled !== false
    }));
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Failed to load email settings.';
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      platform: {
        sendingMode: form.value.platform.sendingMode,
        notificationsEnabled: form.value.platform.notificationsEnabled
      },
      agencies: agencyRows.value.map((a) => ({
        agencyId: a.agencyId,
        notificationsEnabled: a.notificationsEnabled
      }))
    };
    const response = await api.put('/email-settings', payload);
    if (response.data?.platform) {
      settings.value.platform = response.data.platform;
    }
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Failed to save email settings.';
  } finally {
    saving.value = false;
  }
};

onMounted(loadSettings);
</script>

<style scoped>
.email-settings {
  padding: 24px;
}

.section-header {
  margin-bottom: 20px;
}

.section-header h2 {
  margin: 0 0 8px 0;
}

.section-description {
  color: var(--text-secondary);
  margin: 0;
}

.settings-card {
  background: white;
  border-radius: 10px;
  padding: 20px;
  border: 1px solid var(--border);
  margin-bottom: 16px;
}

.settings-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}

.settings-row:last-child {
  border-bottom: none;
}

.settings-label {
  font-weight: 600;
  color: var(--text-secondary);
}

.settings-value {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  width: fit-content;
}

.status-pill.ok {
  background: #ecfdf3;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.status-pill.warn {
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fed7aa;
}

.form-select {
  max-width: 360px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.settings-title {
  margin: 0 0 12px 0;
}

.agency-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agency-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px dashed var(--border);
}

.agency-row:last-child {
  border-bottom: none;
}

.agency-name {
  font-weight: 600;
}

.agency-toggle {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.error {
  background: #ffe9e9;
  border: 1px solid #f3bcbc;
  color: #7f1d1d;
  padding: 10px 12px;
  border-radius: 6px;
  margin-bottom: 12px;
}
</style>
