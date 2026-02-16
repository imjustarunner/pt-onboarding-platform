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
            <div class="agency-config">
              <div class="agency-name">{{ agency.name }}</div>
              <div class="agency-controls">
                <div class="settings-value">
                  <label class="toggle">
                    <input
                      type="checkbox"
                      v-model="agency.notificationsEnabled"
                      :disabled="!canEditAgencies"
                    />
                    <span>Email notifications enabled</span>
                  </label>
                  <small v-if="!settings.platform.notificationsEnabled" class="hint">
                    Disabled by platform toggle.
                  </small>
                </div>
                <div class="settings-value">
                  <label class="hint-label">Inbound AI policy</label>
                  <select v-model="agency.aiDraftPolicyMode" class="form-select" :disabled="!canEditAgencies">
                    <option value="human_only">Human only</option>
                    <option value="draft_known_contacts_or_accounts">Draft for known contacts OR known accounts</option>
                    <option value="draft_known_contacts_only">Draft for known contacts only</option>
                    <option value="draft_known_accounts_only">Draft for known accounts only</option>
                  </select>
                </div>
                <div class="settings-value">
                  <label class="toggle">
                    <input
                      type="checkbox"
                      v-model="agency.allowSchoolOverrides"
                      :disabled="!canEditAgencies"
                    />
                    <span>Allow school overrides</span>
                  </label>
                </div>
                <div class="settings-value">
                  <label class="hint-label">Allowed intent classes</label>
                  <label v-for="intent in KNOWN_INTENT_OPTIONS" :key="`${agency.agencyId}-intent-${intent}`" class="toggle">
                    <input
                      type="checkbox"
                      :value="intent"
                      v-model="agency.aiAllowedIntentClasses"
                      :disabled="!canEditAgencies"
                    />
                    <span>{{ intent }}</span>
                  </label>
                </div>
                <div class="settings-value">
                  <label class="hint-label">Client-match confidence threshold</label>
                  <input
                    v-model.number="agency.aiMatchConfidenceThreshold"
                    type="number"
                    min="0.5"
                    max="0.99"
                    step="0.01"
                    :disabled="!canEditAgencies"
                  />
                </div>
                <div class="settings-value">
                  <label class="hint-label">Approved sender identity keys</label>
                  <input
                    v-model="agency.aiAllowedSenderIdentityKeysCsv"
                    type="text"
                    placeholder="schoolreply, system"
                    :disabled="!canEditAgencies"
                  />
                  <small class="hint">Comma-separated keys. Leave blank to allow all active identity keys.</small>
                </div>
              </div>
              <div class="school-overrides">
                <div class="hint-label">School overrides</div>
                <div v-if="!(schoolOverridesByAgency[String(agency.agencyId)] || []).length" class="hint">
                  No school overrides for this agency.
                </div>
                <div
                  v-for="ov in (schoolOverridesByAgency[String(agency.agencyId)] || [])"
                  :key="`ov-${agency.agencyId}-${ov.schoolOrganizationId}`"
                  class="override-row"
                >
                  <div class="override-school">
                    {{ ov.schoolName || `School #${ov.schoolOrganizationId}` }}
                  </div>
                  <select v-model="ov.policyMode" class="form-select override-select" :disabled="!canEditAgencies">
                    <option value="human_only">Human only</option>
                    <option value="draft_known_contacts_or_accounts">Known contacts OR accounts</option>
                    <option value="draft_known_contacts_only">Known contacts only</option>
                    <option value="draft_known_accounts_only">Known accounts only</option>
                  </select>
                  <label class="toggle">
                    <input type="checkbox" v-model="ov.isActive" :disabled="!canEditAgencies" />
                    <span>Active</span>
                  </label>
                  <label class="toggle">
                    <input type="checkbox" v-model="ov.inheritAdvancedControls" :disabled="!canEditAgencies" />
                    <span>Inherit advanced controls</span>
                  </label>
                  <button
                    v-if="canEditAgencies"
                    class="btn btn-danger btn-sm"
                    type="button"
                    @click="removeSchoolOverride(agency.agencyId, ov.schoolOrganizationId)"
                  >
                    Delete
                  </button>
                  <div v-if="!ov.inheritAdvancedControls" class="override-advanced">
                    <div class="settings-value">
                      <label class="hint-label">Allowed intent classes</label>
                      <label v-for="intent in KNOWN_INTENT_OPTIONS" :key="`ov-${agency.agencyId}-${ov.schoolOrganizationId}-${intent}`" class="toggle">
                        <input type="checkbox" :value="intent" v-model="ov.allowedIntentClasses" :disabled="!canEditAgencies" />
                        <span>{{ intent }}</span>
                      </label>
                    </div>
                    <div class="settings-value">
                      <label class="hint-label">Confidence threshold</label>
                      <input
                        v-model.number="ov.matchConfidenceThreshold"
                        type="number"
                        min="0.5"
                        max="0.99"
                        step="0.01"
                        :disabled="!canEditAgencies"
                      />
                    </div>
                    <div class="settings-value">
                      <label class="hint-label">Approved sender identity keys</label>
                      <input
                        v-model="ov.allowedSenderIdentityKeysCsv"
                        type="text"
                        placeholder="schoolreply, system"
                        :disabled="!canEditAgencies"
                      />
                    </div>
                  </div>
                </div>
                <div v-if="canEditAgencies" class="override-add">
                  <input
                    v-model="overrideDraftForAgency(agency.agencyId).schoolOrganizationId"
                    class="input"
                    type="number"
                    placeholder="School org ID"
                  />
                  <select
                    v-model="overrideDraftForAgency(agency.agencyId).policyMode"
                    class="form-select override-select"
                  >
                    <option value="human_only">Human only</option>
                    <option value="draft_known_contacts_or_accounts">Known contacts OR accounts</option>
                    <option value="draft_known_contacts_only">Known contacts only</option>
                    <option value="draft_known_accounts_only">Known accounts only</option>
                  </select>
                  <button class="btn btn-secondary btn-sm" type="button" @click="addSchoolOverride(agency.agencyId)">
                    Add override
                  </button>
                </div>
                <div v-if="canEditAgencies" class="override-add override-add-advanced">
                  <label class="toggle">
                    <input type="checkbox" v-model="overrideDraftForAgency(agency.agencyId).inheritAdvancedControls" />
                    <span>Inherit advanced controls on create</span>
                  </label>
                  <template v-if="!overrideDraftForAgency(agency.agencyId).inheritAdvancedControls">
                    <label v-for="intent in KNOWN_INTENT_OPTIONS" :key="`draft-${agency.agencyId}-${intent}`" class="toggle">
                      <input type="checkbox" :value="intent" v-model="overrideDraftForAgency(agency.agencyId).allowedIntentClasses" />
                      <span>{{ intent }}</span>
                    </label>
                    <input
                      v-model.number="overrideDraftForAgency(agency.agencyId).matchConfidenceThreshold"
                      type="number"
                      min="0.5"
                      max="0.99"
                      step="0.01"
                      placeholder="Confidence threshold"
                    />
                    <input
                      v-model="overrideDraftForAgency(agency.agencyId).allowedSenderIdentityKeysCsv"
                      type="text"
                      placeholder="Approved sender keys"
                    />
                  </template>
                </div>
              </div>
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
  ,
  schoolOverridesByAgency: {}
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
const schoolOverridesByAgency = ref({});
const deletedSchoolOverrides = ref([]);
const newOverrideByAgency = ref({});
const KNOWN_INTENT_OPTIONS = ['school_status_request'];

const parseCsv = (raw) => String(raw || '')
  .split(',')
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);
const toCsv = (arr) => Array.isArray(arr) ? arr.join(', ') : '';

const canEditPlatform = computed(() => authStore.user?.role === 'super_admin');
const canEditAgencies = computed(() => ['super_admin', 'admin', 'staff', 'support'].includes(authStore.user?.role));
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
      notificationsEnabled: a.notificationsEnabled !== false,
      aiDraftPolicyMode: a.aiDraftPolicyMode || 'human_only',
      allowSchoolOverrides: a.allowSchoolOverrides !== false,
      aiAllowedIntentClasses: Array.isArray(a.aiAllowedIntentClasses) ? a.aiAllowedIntentClasses : ['school_status_request'],
      aiMatchConfidenceThreshold: Number(a.aiMatchConfidenceThreshold ?? 0.75),
      aiAllowedSenderIdentityKeysCsv: toCsv(a.aiAllowedSenderIdentityKeys || [])
    }));
    schoolOverridesByAgency.value = {};
    for (const agency of agencyRows.value) {
      const key = String(agency.agencyId);
      schoolOverridesByAgency.value[key] = Array.isArray(settings.value.schoolOverridesByAgency?.[key])
        ? settings.value.schoolOverridesByAgency[key].map((ov) => ({
          ...ov,
          agencyId: Number(ov.agencyId || agency.agencyId),
          schoolOrganizationId: Number(ov.schoolOrganizationId),
          policyMode: ov.policyMode || 'human_only',
          isActive: ov.isActive !== false,
          inheritAdvancedControls:
            !Array.isArray(ov.allowedIntentClasses) &&
            (ov.matchConfidenceThreshold === null || ov.matchConfidenceThreshold === undefined) &&
            !Array.isArray(ov.allowedSenderIdentityKeys),
          allowedIntentClasses: Array.isArray(ov.allowedIntentClasses)
            ? ov.allowedIntentClasses
            : ['school_status_request'],
          matchConfidenceThreshold: Number(ov.matchConfidenceThreshold ?? 0.75),
          allowedSenderIdentityKeysCsv: toCsv(ov.allowedSenderIdentityKeys || [])
        }))
        : [];
      newOverrideByAgency.value[key] = {
        schoolOrganizationId: '',
        policyMode: 'human_only',
        inheritAdvancedControls: true,
        allowedIntentClasses: ['school_status_request'],
        matchConfidenceThreshold: 0.75,
        allowedSenderIdentityKeysCsv: ''
      };
    }
    deletedSchoolOverrides.value = [];
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
        notificationsEnabled: a.notificationsEnabled,
        aiDraftPolicyMode: a.aiDraftPolicyMode || 'human_only',
        allowSchoolOverrides: a.allowSchoolOverrides !== false,
        aiAllowedIntentClasses: Array.isArray(a.aiAllowedIntentClasses) ? a.aiAllowedIntentClasses : ['school_status_request'],
        aiMatchConfidenceThreshold: Number(a.aiMatchConfidenceThreshold ?? 0.75),
        aiAllowedSenderIdentityKeys: parseCsv(a.aiAllowedSenderIdentityKeysCsv)
      })),
      schoolOverrides: [
        ...Object.values(schoolOverridesByAgency.value || {}).flatMap((list) => (
          (Array.isArray(list) ? list : []).map((ov) => ({
            agencyId: Number(ov.agencyId),
            schoolOrganizationId: Number(ov.schoolOrganizationId),
            policyMode: ov.policyMode || 'human_only',
            isActive: ov.isActive !== false,
            allowedIntentClasses: ov.inheritAdvancedControls ? null : (Array.isArray(ov.allowedIntentClasses) ? ov.allowedIntentClasses : ['school_status_request']),
            matchConfidenceThreshold: ov.inheritAdvancedControls ? null : Number(ov.matchConfidenceThreshold ?? 0.75),
            allowedSenderIdentityKeys: ov.inheritAdvancedControls ? null : parseCsv(ov.allowedSenderIdentityKeysCsv)
          }))
        )),
        ...deletedSchoolOverrides.value
      ]
    };
    const response = await api.put('/email-settings', payload);
    if (response.data?.platform) {
      settings.value.platform = response.data.platform;
    }
    await loadSettings();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Failed to save email settings.';
  } finally {
    saving.value = false;
  }
};

const addSchoolOverride = (agencyId) => {
  const key = String(agencyId);
  const draft = newOverrideByAgency.value[key] || {};
  const schoolOrganizationId = Number(draft.schoolOrganizationId || 0);
  if (!schoolOrganizationId) return;
  const list = Array.isArray(schoolOverridesByAgency.value[key]) ? schoolOverridesByAgency.value[key] : [];
  if (list.some((ov) => Number(ov.schoolOrganizationId) === schoolOrganizationId)) return;
  schoolOverridesByAgency.value[key] = [
    ...list,
    {
      agencyId: Number(agencyId),
      schoolOrganizationId,
      schoolName: null,
      policyMode: draft.policyMode || 'human_only',
      isActive: true,
      inheritAdvancedControls: draft.inheritAdvancedControls !== false,
      allowedIntentClasses: Array.isArray(draft.allowedIntentClasses) ? draft.allowedIntentClasses : ['school_status_request'],
      matchConfidenceThreshold: Number(draft.matchConfidenceThreshold ?? 0.75),
      allowedSenderIdentityKeysCsv: String(draft.allowedSenderIdentityKeysCsv || '')
    }
  ];
  newOverrideByAgency.value[key] = {
    schoolOrganizationId: '',
    policyMode: 'human_only',
    inheritAdvancedControls: true,
    allowedIntentClasses: ['school_status_request'],
    matchConfidenceThreshold: 0.75,
    allowedSenderIdentityKeysCsv: ''
  };
};

const removeSchoolOverride = (agencyId, schoolOrganizationId) => {
  const key = String(agencyId);
  const sid = Number(schoolOrganizationId || 0);
  if (!sid) return;
  schoolOverridesByAgency.value[key] = (schoolOverridesByAgency.value[key] || []).filter(
    (ov) => Number(ov.schoolOrganizationId) !== sid
  );
  deletedSchoolOverrides.value.push({
    agencyId: Number(agencyId),
    schoolOrganizationId: sid,
    remove: true
  });
};

const overrideDraftForAgency = (agencyId) => {
  const key = String(agencyId);
  if (!newOverrideByAgency.value[key]) {
    newOverrideByAgency.value[key] = {
      schoolOrganizationId: '',
      policyMode: 'human_only',
      inheritAdvancedControls: true,
      allowedIntentClasses: ['school_status_request'],
      matchConfidenceThreshold: 0.75,
      allowedSenderIdentityKeysCsv: ''
    };
  }
  return newOverrideByAgency.value[key];
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
  display: block;
  padding: 10px 0;
  border-bottom: 1px dashed var(--border);
}

.agency-row:last-child {
  border-bottom: none;
}

.agency-name {
  font-weight: 600;
}

.agency-config {
  display: grid;
  gap: 10px;
}

.agency-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.agency-toggle {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.hint-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.school-overrides {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  background: #fafafa;
  display: grid;
  gap: 8px;
}

.override-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr auto auto auto;
  gap: 8px;
  align-items: center;
}

.override-advanced {
  grid-column: 1 / -1;
  display: grid;
  gap: 8px;
  padding: 8px;
  border: 1px dashed var(--border);
  border-radius: 8px;
}

.override-school {
  color: var(--text-primary);
  font-size: 13px;
}

.override-select {
  max-width: none;
}

.override-add {
  display: grid;
  grid-template-columns: 180px 1fr auto;
  gap: 8px;
  align-items: center;
}

.override-add-advanced {
  grid-template-columns: 1fr;
  padding-top: 6px;
  border-top: 1px dashed var(--border);
}

.toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

@media (max-width: 980px) {
  .agency-controls {
    grid-template-columns: 1fr;
  }
  .override-row {
    grid-template-columns: 1fr;
  }
  .override-add {
    grid-template-columns: 1fr;
  }
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
