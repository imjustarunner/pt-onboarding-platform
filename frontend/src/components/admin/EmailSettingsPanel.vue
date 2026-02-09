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
        <h3 class="settings-title">Sender Identities</h3>
        <p class="hint">
          Configure per-agency “From” addresses (aliases) for system/AI emails. Use identity keys like
          <strong>login_recovery</strong> or <strong>system</strong> for automated messages.
        </p>

        <div class="settings-row">
          <div class="settings-label">Agency</div>
          <div class="settings-value">
            <select v-model="senderAgencyId" class="form-select" :disabled="senderLoading">
              <option v-if="canEditPlatform" value="">Platform (default)</option>
              <option v-for="agency in agencyRows" :key="agency.agencyId" :value="String(agency.agencyId)">
                {{ agency.name }}
              </option>
            </select>
            <small v-if="!canEditPlatform" class="hint">Sender identities are scoped to your agency.</small>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-label">Include Platform Defaults</div>
          <div class="settings-value">
            <label class="toggle">
              <input type="checkbox" v-model="includePlatformDefaults" :disabled="senderLoading" />
              <span>Show platform identities</span>
            </label>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-label">Test Recipient</div>
          <div class="settings-value">
            <input v-model="testRecipient" type="email" placeholder="test@yourdomain.com" />
            <small class="hint">Used for the “Send Test” button. Defaults to your login email.</small>
          </div>
        </div>

        <div v-if="senderError" class="error">{{ senderError }}</div>
        <div v-if="senderLoading" class="loading">Loading sender identities…</div>

        <div v-else>
          <div v-if="!senderIdentities.length" class="empty-state">No sender identities yet.</div>
          <div v-else class="identity-list">
            <div v-for="identity in senderIdentities" :key="identity.id" class="identity-row">
              <div class="identity-grid">
                <div class="form-group">
                  <label>Identity Key</label>
                  <input v-model="identity.identity_key" type="text" />
                </div>
                <div class="form-group">
                  <label>From Email</label>
                  <input v-model="identity.from_email" type="email" />
                </div>
                <div class="form-group">
                  <label>Display Name</label>
                  <input v-model="identity.display_name" type="text" />
                </div>
                <div class="form-group">
                  <label>Reply-To</label>
                  <input v-model="identity.reply_to" type="email" />
                </div>
                <div class="form-group">
                  <label>Inbound Addresses (comma or new line)</label>
                  <textarea v-model="identity.inboundAddressesText" rows="2" />
                </div>
                <div class="form-group">
                  <label>Active</label>
                  <label class="toggle">
                    <input type="checkbox" v-model="identity.is_active" />
                    <span>Enabled</span>
                  </label>
                </div>
              </div>
              <div class="identity-actions">
                <button class="btn btn-secondary" :disabled="senderSavingId === identity.id" @click="saveIdentity(identity)">
                  {{ senderSavingId === identity.id ? 'Saving…' : 'Save' }}
                </button>
                <button class="btn btn-secondary" :disabled="senderSavingId === identity.id" @click="sendTest(identity)">
                  Send Test
                </button>
              </div>
            </div>
          </div>

          <div class="identity-add">
            <h4>Add Sender Identity</h4>
            <div class="identity-grid">
              <div class="form-group">
                <label>Identity Key</label>
                <input v-model="newIdentity.identityKey" type="text" placeholder="system or login_recovery" />
              </div>
              <div class="form-group">
                <label>From Email</label>
                <input v-model="newIdentity.fromEmail" type="email" placeholder="alias@yourdomain.com" />
              </div>
              <div class="form-group">
                <label>Display Name</label>
                <input v-model="newIdentity.displayName" type="text" placeholder="People Ops" />
              </div>
              <div class="form-group">
                <label>Reply-To</label>
                <input v-model="newIdentity.replyTo" type="email" placeholder="support@yourdomain.com" />
              </div>
              <div class="form-group">
                <label>Inbound Addresses</label>
                <textarea v-model="newIdentity.inboundAddressesText" rows="2" placeholder="support@… , hr@…" />
              </div>
            </div>
            <button class="btn btn-primary" :disabled="senderSavingId === 'new'" @click="createIdentity">
              {{ senderSavingId === 'new' ? 'Creating…' : 'Create' }}
            </button>
          </div>
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
import { ref, onMounted, computed, watch } from 'vue';
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
const senderAgencyId = ref('');
const senderIdentities = ref([]);
const senderLoading = ref(false);
const senderError = ref('');
const senderSavingId = ref(null);
const includePlatformDefaults = ref(false);
const testRecipient = ref('');
const newIdentity = ref({
  identityKey: '',
  fromEmail: '',
  displayName: '',
  replyTo: '',
  inboundAddressesText: ''
});

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
    if (!senderAgencyId.value) {
      if (canEditPlatform.value) {
        senderAgencyId.value = '';
      } else if (agencyRows.value.length === 1) {
        senderAgencyId.value = String(agencyRows.value[0].agencyId);
      }
    }
    await loadSenderIdentities();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Failed to load email settings.';
  } finally {
    loading.value = false;
  }
};

const parseInboundAddresses = (raw) => {
  if (!raw) return [];
  return String(raw)
    .split(/[\n,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
};

const loadSenderIdentities = async () => {
  senderLoading.value = true;
  senderError.value = '';
  try {
    const params = {
      agencyId: senderAgencyId.value !== '' ? senderAgencyId.value : null,
      includePlatformDefaults: includePlatformDefaults.value
    };
    const resp = await api.get('/email-senders', { params });
    senderIdentities.value = (resp.data || []).map((i) => ({
      ...i,
      inboundAddressesText: (i.inbound_addresses || []).join(', ')
    }));
  } catch (err) {
    senderError.value = err?.response?.data?.error?.message || 'Failed to load sender identities.';
  } finally {
    senderLoading.value = false;
  }
};

const createIdentity = async () => {
  senderSavingId.value = 'new';
  senderError.value = '';
  try {
    const payload = {
      agencyId: senderAgencyId.value !== '' ? Number(senderAgencyId.value) : null,
      identityKey: newIdentity.value.identityKey,
      fromEmail: newIdentity.value.fromEmail,
      displayName: newIdentity.value.displayName || null,
      replyTo: newIdentity.value.replyTo || null,
      inboundAddresses: parseInboundAddresses(newIdentity.value.inboundAddressesText),
      isActive: true
    };
    await api.post('/email-senders', payload);
    newIdentity.value = { identityKey: '', fromEmail: '', displayName: '', replyTo: '', inboundAddressesText: '' };
    await loadSenderIdentities();
  } catch (err) {
    senderError.value = err?.response?.data?.error?.message || 'Failed to create sender identity.';
  } finally {
    senderSavingId.value = null;
  }
};

const saveIdentity = async (identity) => {
  senderSavingId.value = identity.id;
  senderError.value = '';
  try {
    const payload = {
      identityKey: identity.identity_key,
      fromEmail: identity.from_email,
      displayName: identity.display_name || null,
      replyTo: identity.reply_to || null,
      inboundAddresses: parseInboundAddresses(identity.inboundAddressesText),
      isActive: identity.is_active === true || identity.is_active === 1
    };
    await api.put(`/email-senders/${identity.id}`, payload);
    await loadSenderIdentities();
  } catch (err) {
    senderError.value = err?.response?.data?.error?.message || 'Failed to save sender identity.';
  } finally {
    senderSavingId.value = null;
  }
};

const sendTest = async (identity) => {
  senderSavingId.value = identity.id;
  senderError.value = '';
  try {
    const payload = {
      toEmail: testRecipient.value || authStore.user?.email || null,
      subject: 'Sender identity test',
      text: 'This is a test email to validate your sender identity configuration.'
    };
    await api.post(`/email-senders/${identity.id}/test`, payload);
  } catch (err) {
    senderError.value = err?.response?.data?.error?.message || 'Failed to send test email.';
  } finally {
    senderSavingId.value = null;
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

watch([senderAgencyId, includePlatformDefaults], () => {
  loadSenderIdentities();
});
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

.identity-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.identity-row {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  background: #fafafa;
}

.identity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.identity-grid .form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.identity-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 10px;
}

.identity-add {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}

@media (max-width: 900px) {
  .identity-grid {
    grid-template-columns: 1fr;
  }
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
