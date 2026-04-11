<template>
  <div class="sms-numbers">
    <div class="section-header">
      <h2>Texting Numbers</h2>
      <p class="muted">Manage phone numbers, assignments, and SMS compliance rules.</p>
    </div>

    <div v-if="!agencyStore.currentAgency" class="empty-state">
      Select an agency to manage texting numbers.
    </div>

    <div v-else class="content">
      <div v-if="numbers.length === 0" class="card get-started-card">
        <h3>Get started with Vonage</h3>
        <p class="muted">You need Vonage numbers to use SMS. Here's how to set up:</p>
        <ol class="setup-steps">
          <li><strong>Create a Vonage account</strong> at <a href="https://www.vonage.com/communications-apis/" target="_blank" rel="noopener">vonage.com/communications-apis</a></li>
          <li><strong>Get credentials</strong> from the Vonage Dashboard (API Key, API Secret)</li>
          <li><strong>Set backend env vars</strong>: <code>VONAGE_API_KEY</code>, <code>VONAGE_API_SECRET</code>, <code>VONAGE_SMS_WEBHOOK_URL</code></li>
          <li><strong>Add a number</strong> below: search &amp; buy via Vonage, or add a number you already own</li>
        </ol>
      </div>

      <div class="card">
        <h3>Agency SMS Settings</h3>
        <div v-if="settingsError" class="error">{{ settingsError }}</div>
        <div class="grid">
          <div class="form-group">
            <label>Enable SMS numbers</label>
            <select v-model="settings.smsNumbersEnabled" class="select">
              <option :value="true">Enabled</option>
              <option :value="false">Disabled</option>
            </select>
          </div>
          <div class="form-group">
            <label>Compliance mode</label>
            <select v-model="settings.smsComplianceMode" class="select">
              <option value="opt_in_required">Opt-in required</option>
              <option value="outreach_allowed">Outreach allowed</option>
            </select>
          </div>
          <div class="form-group">
            <label>Reminder sender mode</label>
            <select v-model="settings.smsReminderSenderMode" class="select">
              <option value="agency_default">Agency number by default</option>
              <option value="provider_optional">Provider number when provider preference is enabled</option>
            </select>
          </div>
          <div class="form-group">
            <label>Default inbound user</label>
            <select v-model="settings.smsDefaultUserId" class="select">
              <option :value="null">None</option>
              <option v-for="u in agencyUsers" :key="u.id" :value="u.id">
                {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Company Events SMS</label>
            <select v-model="settings.companyEventsEnabled" class="select">
              <option :value="false">Disabled</option>
              <option :value="true">Enabled</option>
            </select>
          </div>
          <div class="form-group">
            <label>Company Events sender number</label>
            <select v-model="settings.companyEventsSenderNumberId" class="select">
              <option :value="null">Select number…</option>
              <option v-for="n in activeAgencyNumbers" :key="n.id" :value="n.id">
                {{ n.phone_number }}{{ n.friendly_name ? ` (${n.friendly_name})` : '' }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>SMS support fallback phone</label>
            <input v-model="settings.smsSupportFallbackPhone" class="input" placeholder="+15551234567" />
          </div>
          <div class="form-group">
            <label>SMS support escalation timeout (hours)</label>
            <input v-model.number="settings.smsSupportEscalationHours" class="input" type="number" min="1" max="168" />
          </div>
          <div class="form-group">
            <label>Voice support fallback phone</label>
            <input v-model="settings.voiceSupportFallbackPhone" class="input" placeholder="+15551234567" />
          </div>
          <div class="form-group">
            <label>Voice support fallback message</label>
            <input v-model="settings.voiceSupportFallbackMessage" class="input" placeholder="Please hold while we connect you to support." />
          </div>
          <div class="form-group">
            <label>Voice provider pre-connect message</label>
            <input v-model="settings.voiceProviderPreConnectMessage" class="input" placeholder="Please hold while we connect your call." />
          </div>
          <div class="form-group">
            <label>Voice support pre-connect message</label>
            <input v-model="settings.voiceSupportPreConnectMessage" class="input" placeholder="Please hold while we connect you to support." />
          </div>
          <div class="form-group">
            <label>Provider ring timeout (seconds)</label>
            <input v-model.number="settings.voiceProviderRingTimeoutSeconds" class="input" type="number" min="10" max="60" />
          </div>
        </div>
        <p v-if="settings.companyEventsEnabled && !settings.companyEventsSenderNumberId" class="muted" style="margin-top:8px;">
          Set a sender number before using Company Events SMS.
        </p>
        <div class="webhook-status-card">
          <div class="webhook-status-header">
            <strong>Webhook readiness</strong>
            <div class="inline">
              <button class="btn btn-secondary" :disabled="loadingWebhookStatus" @click="loadWebhookStatus">
                {{ loadingWebhookStatus ? 'Checking…' : 'Check status' }}
              </button>
              <button class="btn btn-secondary" :disabled="syncingWebhooks" @click="syncWebhooks">
                {{ syncingWebhooks ? 'Syncing…' : 'Sync Vonage webhooks' }}
              </button>
            </div>
          </div>
          <div v-if="webhookError" class="error">{{ webhookError }}</div>
          <div class="muted">
            Expected SMS URL: {{ webhookExpected.smsUrl || 'Not configured' }}
          </div>
          <div class="muted">
            Expected Voice URL: {{ webhookExpected.voiceUrl || 'Not configured' }}
          </div>
        </div>
        <div class="actions">
          <button class="btn" :disabled="savingSettings" @click="saveSettings">
            {{ savingSettings ? 'Saving…' : 'Save settings' }}
          </button>
        </div>

        <div class="usage-card">
          <div class="usage-header">
            <strong>Usage (last 30 days)</strong>
            <button class="btn btn-secondary btn-sm" :disabled="loadingUsage" @click="loadUsage">
              {{ loadingUsage ? 'Loading…' : 'Refresh' }}
            </button>
          </div>
          <div v-if="usageError" class="error">{{ usageError }}</div>
          <div v-else-if="usage" class="usage-grid">
            <div class="usage-item">
              <span class="usage-value">{{ usage.outboundSms }}</span>
              <span class="usage-label">Outbound SMS</span>
            </div>
            <div class="usage-item">
              <span class="usage-value">{{ usage.inboundSms }}</span>
              <span class="usage-label">Inbound SMS</span>
            </div>
            <div class="usage-item">
              <span class="usage-value">{{ usage.notificationSms }}</span>
              <span class="usage-label">Notification SMS</span>
            </div>
            <div class="usage-item">
              <span class="usage-value">{{ usage.callMinutes }}</span>
              <span class="usage-label">Call minutes</span>
            </div>
            <div class="usage-item" v-if="usage.phoneNumbers !== null">
              <span class="usage-value">{{ usage.phoneNumbers }}</span>
              <span class="usage-label">Phone numbers</span>
            </div>
          </div>
          <div v-if="usage && thresholds?.overThreshold" class="usage-alerts">
            <span class="alert-badge">Alerts:</span>
            <span v-for="a in thresholds.alerts" :key="a" class="alert-item">{{ a }}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Numbers</h3>
        <p class="provider-number-guidance muted">
          <strong>Provider-only model:</strong> Each provider must have their own number assigned for texting and calling clients.
          Agency numbers are for company events, after-hours, and support fallback—not for 1:1 client communication.
          Assign one number per provider. <strong>Non-providers</strong> (admin, support) can have a number and be added to additional numbers via &quot;Add to pool&quot; to receive and respond to messages.
        </p>
        <div class="toolbar">
          <div class="inline">
            <input v-model="newNumber" class="input" placeholder="+15551234567" />
            <input v-model="newFriendlyName" class="input" placeholder="Friendly name (optional)" />
            <button class="btn" :disabled="addingNumber || !newNumber" @click="addNumber">
              {{ addingNumber ? 'Adding…' : 'Add number' }}
            </button>
          </div>
        </div>

        <div class="toolbar">
          <div class="inline">
            <input v-model="searchAreaCode" class="input" placeholder="Area code" />
            <button class="btn btn-secondary" :disabled="searchingNumbers" @click="searchNumbers">
              {{ searchingNumbers ? 'Searching…' : 'Search Vonage' }}
            </button>
          </div>
        </div>

        <div v-if="searchResults.length" class="search-results">
          <div class="muted">Available numbers</div>
          <div class="list">
            <div v-for="n in searchResults" :key="n.phoneNumber" class="row">
              <div class="left">{{ n.phoneNumber }}</div>
              <button class="btn btn-secondary" @click="buyNumber(n.phoneNumber)">
                Buy
              </button>
            </div>
          </div>
        </div>

        <div v-if="numbers.length === 0" class="empty-state">No numbers yet.</div>
        <div v-else class="list">
          <div v-for="n in numbers" :key="n.id" class="row">
            <div class="left">
              <div class="title">{{ n.phone_number }}</div>
              <div class="muted">
                Status: {{ n.status }} · {{ n.is_active ? 'Active' : 'Inactive' }}
              </div>
              <div class="muted">
                SMS webhook:
                <span :class="statusClass(numberWebhookStatus(n.id)?.smsMatches)">
                  {{ webhookLabel(numberWebhookStatus(n.id)?.smsMatches, numberWebhookStatus(n.id)) }}
                </span>
                · Voice webhook:
                <span :class="statusClass(numberWebhookStatus(n.id)?.voiceMatches)">
                  {{ webhookLabel(numberWebhookStatus(n.id)?.voiceMatches, numberWebhookStatus(n.id)) }}
                </span>
              </div>
              <div class="muted" v-if="n.assignments?.length">
                <span v-if="n.assignments.length === 1">Assigned to: {{ assignmentLabel(n.assignments[0]) }}</span>
                <span v-else>Pool: {{ n.assignments.length }} users ({{ smsAccessCount(n) }} with SMS access)</span>
              </div>
              <div v-if="n.assignments?.length" class="sms-access-list">
                <div v-for="a in n.assignments" :key="a.user_id" class="sms-access-row">
                  <span>{{ assignmentLabel(a) }}</span>
                  <label class="toggle-label">
                    <span class="toggle-text">SMS</span>
                    <input type="checkbox" :checked="a.sms_access_enabled !== 0 && a.sms_access_enabled !== false" @change="toggleSmsAccess(n, a)" />
                  </label>
                  <button v-if="n.assignments.length > 1" class="btn btn-small" @click="unassignUser(n, a)">Remove</button>
                </div>
              </div>
              <div class="muted" v-else-if="!n.assignments?.length">Assigned to: Agency pool</div>
            </div>
            <div class="right">
              <select v-model="assignmentDraft[n.id]" class="select">
                <option :value="''">Assign to…</option>
                <option v-for="u in agencyUsers" :key="u.id" :value="String(u.id)">
                  {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
                </option>
              </select>
              <label v-if="n.assignments?.length" class="checkbox-inline">
                <input type="checkbox" v-model="addToPoolDraft[n.id]" />
                Add to pool
              </label>
              <button class="btn btn-secondary" @click="assignNumber(n)">
                {{ addToPoolDraft[n.id] ? 'Add' : 'Assign' }}
              </button>
              <button v-if="n.assignments?.length === 1" class="btn btn-secondary" @click="unassignNumber(n)">
                Unassign
              </button>
              <button class="btn btn-secondary" @click="selectRules(n)">
                Rules
              </button>
              <button class="btn btn-danger" @click="releaseNumber(n)">Release</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="selectedNumber" class="card">
        <h3>Rules: {{ selectedNumber.phone_number }}</h3>
        <div class="grid">
          <div class="form-group">
            <label>After-hours auto-reply</label>
            <textarea v-model="ruleDraft.after_hours.auto_reply_text" class="textarea" rows="3" />
            <div class="checkbox">
              <input type="checkbox" v-model="ruleDraft.after_hours.enabled" />
              <span>Enabled</span>
            </div>
          </div>
          <div class="form-group">
            <label>Opt-in confirmation</label>
            <textarea v-model="ruleDraft.opt_in.auto_reply_text" class="textarea" rows="2" />
            <div class="checkbox">
              <input type="checkbox" v-model="ruleDraft.opt_in.enabled" />
              <span>Enabled</span>
            </div>
          </div>
          <div class="form-group">
            <label>Opt-out confirmation</label>
            <textarea v-model="ruleDraft.opt_out.auto_reply_text" class="textarea" rows="2" />
            <div class="checkbox">
              <input type="checkbox" v-model="ruleDraft.opt_out.enabled" />
              <span>Enabled</span>
            </div>
          </div>
          <div class="form-group">
            <label>Help message</label>
            <textarea v-model="ruleDraft.help.auto_reply_text" class="textarea" rows="2" />
            <div class="checkbox">
              <input type="checkbox" v-model="ruleDraft.help.enabled" />
              <span>Enabled</span>
            </div>
          </div>
          <div class="form-group">
            <label>Emergency forward user</label>
            <select v-model="ruleDraft.emergency_forward.forward_to_user_id" class="select">
              <option :value="null">None</option>
              <option v-for="u in agencyUsers" :key="u.id" :value="u.id">
                {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Emergency forward phone</label>
            <input v-model="ruleDraft.emergency_forward.forward_to_phone" class="input" placeholder="+15551234567" />
          </div>
          <div class="form-group">
            <label>Enable emergency forward</label>
            <select v-model="ruleDraft.emergency_forward.enabled" class="select">
              <option :value="true">Enabled</option>
              <option :value="false">Disabled</option>
            </select>
          </div>
          <div class="form-group">
            <label>Forward inbound to user</label>
            <select v-model="ruleDraft.forward_inbound.forward_to_user_id" class="select">
              <option :value="null">None</option>
              <option v-for="u in agencyUsers" :key="u.id" :value="u.id">
                {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Forward inbound to phone</label>
            <input v-model="ruleDraft.forward_inbound.forward_to_phone" class="input" placeholder="+15551234567" />
          </div>
          <div class="form-group">
            <label>Forward message template</label>
            <textarea v-model="ruleDraft.forward_inbound.auto_reply_text" class="textarea" rows="3" placeholder="Inbound text from {{from}}: {{body}}" />
          </div>
          <div class="form-group">
            <label>Enable inbound forwarding</label>
            <select v-model="ruleDraft.forward_inbound.enabled" class="select">
              <option :value="true">Enabled</option>
              <option :value="false">Disabled</option>
            </select>
          </div>
          <div class="form-group form-group-full">
            <div class="section-divider"><h4>Voice IVR Menu</h4></div>
            <p class="muted">When callers dial this number, play a menu before connecting. Requires Voice support fallback phone in settings.</p>
            <div class="checkbox">
              <input type="checkbox" v-model="ruleDraft.ivr_menu.enabled" />
              <span>Enable IVR menu</span>
            </div>
            <label>Menu prompt</label>
            <input v-model="ruleDraft.ivr_menu.prompt" class="input" placeholder="Press 1 for scheduling, 2 for support, 3 for your provider." />
            <div class="ivr-options">
              <div v-for="(opt, i) in ruleDraft.ivr_menu.options" :key="i" class="ivr-option-row">
                <input v-model="opt.digit" class="input input-sm" placeholder="1" maxlength="1" style="width: 40px;" />
                <select v-model="opt.action" class="select">
                  <option value="main_line">Main line (provider)</option>
                  <option value="extension_menu">Extension directory</option>
                  <option value="dial_support">Support phone</option>
                  <option value="dial_phone">Specific phone</option>
                </select>
                <input v-if="opt.action === 'dial_phone'" v-model="opt.phone" class="input" placeholder="+15551234567" />
                <button type="button" class="btn btn-secondary btn-sm" @click="removeIvrOption(i)">Remove</button>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" @click="addIvrOption">Add option</button>
            </div>
          </div>
        </div>
        <div class="actions">
          <button class="btn" :disabled="savingRules" @click="saveRules">
            {{ savingRules ? 'Saving…' : 'Save rules' }}
          </button>
          <button class="btn btn-secondary" @click="clearSelectedRules">Close</button>
        </div>
      </div>

      <div class="card">
        <h3>Voice Extensions</h3>
        <p class="muted">Assign extensions (e.g., 101, 102) so callers can reach staff directly. Callers hear "Press the extension you wish to reach" when calling your numbers.</p>
        <div class="toolbar">
          <div class="inline">
            <select v-model="newExtUser" class="select">
              <option :value="null">Select user…</option>
              <option v-for="u in agencyUsers" :key="u.id" :value="u.id">
                {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
              </option>
            </select>
            <input v-model="newExtNumber" class="input" placeholder="Extension (e.g. 101)" />
            <select v-model="newExtNumberId" class="select">
              <option :value="null">Any agency number</option>
              <option v-for="n in activeAgencyNumbers" :key="n.id" :value="n.id">
                {{ n.phone_number }}{{ n.friendly_name ? ` (${n.friendly_name})` : '' }}
              </option>
            </select>
            <button class="btn" :disabled="addingExt || !newExtUser || !newExtNumber" @click="addExtension">
              {{ addingExt ? 'Adding…' : 'Add extension' }}
            </button>
          </div>
        </div>
        <div v-if="extensions.length === 0" class="empty-state">No extensions yet.</div>
        <div v-else class="list">
          <div v-for="e in extensions" :key="e.id" class="row">
            <div class="left">
              <span class="ext-badge">{{ e.extension }}</span>
              {{ e.first_name }} {{ e.last_name }}
              <span class="muted">→ {{ e.phone_number || 'Any number' }}</span>
            </div>
            <button class="btn btn-secondary" @click="removeExtension(e)">Remove</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();

const settings = ref({
  smsNumbersEnabled: false,
  smsComplianceMode: 'opt_in_required',
  smsReminderSenderMode: 'agency_default',
  smsDefaultUserId: null,
  companyEventsEnabled: false,
  companyEventsSenderNumberId: null,
  smsSupportFallbackPhone: '',
  smsSupportEscalationHours: 12,
  voiceSupportFallbackPhone: '',
  voiceSupportFallbackMessage: '',
  voiceProviderRingTimeoutSeconds: 20,
  voiceProviderPreConnectMessage: '',
  voiceSupportPreConnectMessage: ''
});
const settingsError = ref('');
const savingSettings = ref(false);
const webhookExpected = ref({ smsUrl: null, voiceUrl: null });
const webhookStatuses = ref([]);
const webhookError = ref('');
const loadingWebhookStatus = ref(false);
const usage = ref(null);
const usageError = ref('');
const loadingUsage = ref(false);
const thresholds = ref(null);
const syncingWebhooks = ref(false);

const numbers = ref([]);
const agencyUsers = ref([]);
const newNumber = ref('');
const newFriendlyName = ref('');
const addingNumber = ref(false);

const searchAreaCode = ref('');
const searchResults = ref([]);
const searchingNumbers = ref(false);

const assignmentDraft = ref({});
const addToPoolDraft = ref({});

const extensions = ref([]);
const newExtUser = ref(null);
const newExtNumber = ref('');
const newExtNumberId = ref(null);
const addingExt = ref(false);

const selectedNumber = ref(null);
const ruleDraft = ref({
  after_hours: { rule_type: 'after_hours', auto_reply_text: '', enabled: true },
  opt_in: { rule_type: 'opt_in', auto_reply_text: '', enabled: true },
  opt_out: { rule_type: 'opt_out', auto_reply_text: '', enabled: true },
  help: { rule_type: 'help', auto_reply_text: '', enabled: true },
  emergency_forward: { rule_type: 'emergency_forward', forward_to_user_id: null, forward_to_phone: '', enabled: false },
  forward_inbound: { rule_type: 'forward_inbound', auto_reply_text: '', forward_to_user_id: null, forward_to_phone: '', enabled: false },
  ivr_menu: {
    rule_type: 'ivr_menu',
    enabled: false,
    prompt: '',
    options: []
  }
});
const savingRules = ref(false);

const agencyId = computed(() => agencyStore.currentAgency?.id || null);
const activeAgencyNumbers = computed(() => (numbers.value || []).filter((n) => n?.is_active && n?.status === 'active'));

const loadSettings = async () => {
  if (!agencyId.value) return;
  settingsError.value = '';
  try {
    const res = await api.get(`/sms-numbers/agency/${agencyId.value}/settings`);
    settings.value = {
      smsNumbersEnabled: res.data?.smsNumbersEnabled === true,
      smsComplianceMode: res.data?.smsComplianceMode || 'opt_in_required',
      smsReminderSenderMode: res.data?.smsReminderSenderMode || 'agency_default',
      smsDefaultUserId: res.data?.smsDefaultUserId || null,
      companyEventsEnabled: res.data?.companyEventsEnabled === true,
      companyEventsSenderNumberId: res.data?.companyEventsSenderNumberId || null,
      smsSupportFallbackPhone: res.data?.smsSupportFallbackPhone || '',
      smsSupportEscalationHours: Number(res.data?.smsSupportEscalationHours || 12) || 12,
      voiceSupportFallbackPhone: res.data?.voiceSupportFallbackPhone || '',
      voiceSupportFallbackMessage: res.data?.voiceSupportFallbackMessage || '',
      voiceProviderRingTimeoutSeconds: Number(res.data?.voiceProviderRingTimeoutSeconds || 20) || 20,
      voiceProviderPreConnectMessage: res.data?.voiceProviderPreConnectMessage || '',
      voiceSupportPreConnectMessage: res.data?.voiceSupportPreConnectMessage || ''
    };
  } catch (e) {
    settingsError.value = e?.response?.data?.error?.message || 'Failed to load SMS settings';
  }
};

const saveSettings = async () => {
  if (!agencyId.value) return;
  savingSettings.value = true;
  settingsError.value = '';
  try {
    await api.put(`/sms-numbers/agency/${agencyId.value}/settings`, settings.value);
  } catch (e) {
    settingsError.value = e?.response?.data?.error?.message || 'Failed to save SMS settings';
  } finally {
    savingSettings.value = false;
  }
};

const loadWebhookStatus = async () => {
  if (!agencyId.value) return;
  loadingWebhookStatus.value = true;
  webhookError.value = '';
  try {
    const res = await api.get(`/sms-numbers/agency/${agencyId.value}/webhooks/status`);
    webhookExpected.value = res.data?.expected || { smsUrl: null, voiceUrl: null };
    webhookStatuses.value = Array.isArray(res.data?.statuses) ? res.data.statuses : [];
  } catch (e) {
    webhookError.value = e?.response?.data?.error?.message || 'Failed to load webhook status';
    webhookStatuses.value = [];
  } finally {
    loadingWebhookStatus.value = false;
  }
};

const loadUsage = async () => {
  if (!agencyId.value) return;
  loadingUsage.value = true;
  usageError.value = '';
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const res = await api.get(`/sms-numbers/agency/${agencyId.value}/usage`, {
      params: {
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10)
      }
    });
    usage.value = res.data?.usage || null;
    thresholds.value = res.data?.thresholds || null;
  } catch (e) {
    usageError.value = e?.response?.data?.error?.message || 'Failed to load usage';
    usage.value = null;
    thresholds.value = null;
  } finally {
    loadingUsage.value = false;
  }
};

const syncWebhooks = async () => {
  if (!agencyId.value) return;
  syncingWebhooks.value = true;
  webhookError.value = '';
  try {
    await api.post(`/sms-numbers/agency/${agencyId.value}/webhooks/sync`);
    await loadWebhookStatus();
  } catch (e) {
    webhookError.value = e?.response?.data?.error?.message || 'Failed to sync webhooks';
  } finally {
    syncingWebhooks.value = false;
  }
};

const loadNumbers = async () => {
  if (!agencyId.value) return;
  try {
    const res = await api.get(`/sms-numbers/agency/${agencyId.value}`);
    numbers.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    numbers.value = [];
  }
};

const loadUsers = async () => {
  try {
    const res = await api.get('/users', { params: { includeArchived: false } });
    const rows = Array.isArray(res.data) ? res.data : [];
    const aId = Number(agencyId.value);
    agencyUsers.value = rows.filter((u) => {
      const ids = String(u.agency_ids || '').split(',').map((v) => parseInt(v, 10));
      return ids.includes(aId);
    });
  } catch {
    agencyUsers.value = [];
  }
};

const addNumber = async () => {
  if (!agencyId.value || !newNumber.value) return;
  addingNumber.value = true;
  try {
    await api.post(`/sms-numbers/agency/${agencyId.value}/add`, {
      phoneNumber: newNumber.value,
      friendlyName: newFriendlyName.value
    });
    newNumber.value = '';
    newFriendlyName.value = '';
    await loadNumbers();
  } finally {
    addingNumber.value = false;
  }
};

const searchNumbers = async () => {
  if (!agencyId.value) return;
  searchingNumbers.value = true;
  try {
    const res = await api.post(`/sms-numbers/agency/${agencyId.value}/search`, {
      areaCode: searchAreaCode.value || null
    });
    searchResults.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    searchResults.value = [];
  } finally {
    searchingNumbers.value = false;
  }
};

const buyNumber = async (phoneNumber) => {
  if (!agencyId.value || !phoneNumber) return;
  try {
    await api.post(`/sms-numbers/agency/${agencyId.value}/buy`, { phoneNumber });
    await loadNumbers();
  } catch {
    // ignore
  }
};

const assignNumber = async (number) => {
  const userId = assignmentDraft.value[number.id];
  if (!userId) return;
  const addToPool = addToPoolDraft.value[number.id] === true;
  await api.post('/sms-numbers/assign', {
    numberId: number.id,
    userId: parseInt(userId, 10),
    isPrimary: !addToPool,
    addToPool
  });
  assignmentDraft.value[number.id] = '';
  addToPoolDraft.value[number.id] = false;
  await loadNumbers();
};

const smsAccessCount = (number) => {
  const assignments = number.assignments || [];
  return assignments.filter((a) => a.sms_access_enabled !== 0 && a.sms_access_enabled !== false).length;
};

const toggleSmsAccess = async (number, assignment) => {
  const enabled = !(assignment.sms_access_enabled !== 0 && assignment.sms_access_enabled !== false);
  await api.post('/sms-numbers/set-sms-access', {
    numberId: number.id,
    userId: assignment.user_id,
    enabled
  });
  await loadNumbers();
};

const unassignUser = async (number, assignment) => {
  await api.post('/sms-numbers/unassign', {
    numberId: number.id,
    userId: assignment.user_id
  });
  await loadNumbers();
};

const unassignNumber = async (number) => {
  const assigned = number.assignments?.[0];
  if (!assigned?.user_id) return;
  await api.post('/sms-numbers/unassign', {
    numberId: number.id,
    userId: assigned.user_id
  });
  await loadNumbers();
};

const releaseNumber = async (number) => {
  if (!number?.id) return;
  await api.delete(`/sms-numbers/${number.id}`);
  await loadNumbers();
};

const selectRules = async (number) => {
  selectedNumber.value = number;
  await loadRules(number.id);
};

const clearSelectedRules = () => {
  selectedNumber.value = null;
};

const loadRules = async (numberId) => {
  if (!numberId) return;
  const res = await api.get(`/sms-numbers/${numberId}/rules`);
  const rules = Array.isArray(res.data) ? res.data : [];
  const pick = (type) => rules.find((r) => r.rule_type === type) || null;
  const setRule = (key, base) => {
    const found = pick(key);
    ruleDraft.value[key] = {
      ...base,
      ...found,
      enabled: found ? found.enabled !== 0 : base.enabled
    };
  };
  setRule('after_hours', ruleDraft.value.after_hours);
  setRule('opt_in', ruleDraft.value.opt_in);
  setRule('opt_out', ruleDraft.value.opt_out);
  setRule('help', ruleDraft.value.help);
  setRule('emergency_forward', ruleDraft.value.emergency_forward);
  setRule('forward_inbound', ruleDraft.value.forward_inbound);
  const ivrFound = pick('ivr_menu');
  if (ivrFound?.schedule_json) {
    try {
      const cfg = typeof ivrFound.schedule_json === 'string' ? JSON.parse(ivrFound.schedule_json) : ivrFound.schedule_json;
      ruleDraft.value.ivr_menu = {
        ...ruleDraft.value.ivr_menu,
        ...ivrFound,
        enabled: ivrFound.enabled !== 0,
        prompt: cfg?.prompt || '',
        options: Object.entries(cfg?.options || {}).map(([digit, opt]) => ({
          digit,
          action: opt?.action || 'main_line',
          phone: opt?.phone || ''
        }))
      };
    } catch {
      ruleDraft.value.ivr_menu = { ...ruleDraft.value.ivr_menu, ...ivrFound, enabled: ivrFound.enabled !== 0 };
    }
  } else if (ivrFound) {
    ruleDraft.value.ivr_menu = { ...ruleDraft.value.ivr_menu, ...ivrFound, enabled: ivrFound.enabled !== 0 };
  }
};

const addIvrOption = () => {
  ruleDraft.value.ivr_menu.options = [...(ruleDraft.value.ivr_menu.options || []), { digit: '', action: 'main_line', phone: '' }];
};
const removeIvrOption = (i) => {
  ruleDraft.value.ivr_menu.options = ruleDraft.value.ivr_menu.options.filter((_, j) => j !== i);
};

const saveRules = async () => {
  if (!selectedNumber.value?.id) return;
  savingRules.value = true;
  try {
    const rules = Object.values(ruleDraft.value).map((r) => {
        const base = {
          rule_type: r.rule_type,
          auto_reply_text: r.auto_reply_text || null,
          forward_to_user_id: r.forward_to_user_id || null,
          forward_to_phone: r.forward_to_phone || null,
          enabled: r.enabled !== false
        };
        if (r.rule_type === 'ivr_menu') {
          const opts = (r.options || []).filter((o) => o.digit);
          const options = {};
          for (const o of opts) {
            const opt = { action: o.action || 'main_line' };
            if (o.action === 'dial_phone' && o.phone) opt.phone = o.phone;
            options[String(o.digit)] = opt;
          }
          base.schedule_json = r.enabled && (r.prompt || opts.length) ? { prompt: r.prompt || 'Please choose an option.', options } : null;
        }
        return base;
      });
    await api.put(`/sms-numbers/${selectedNumber.value.id}/rules`, { rules });
  } finally {
    savingRules.value = false;
  }
};

const assignmentLabel = (assignment) => {
  const user = agencyUsers.value.find((u) => Number(u.id) === Number(assignment.user_id));
  if (!user) return `User #${assignment.user_id}`;
  return `${user.first_name || ''} ${user.last_name || ''}`.trim();
};

const numberWebhookStatus = (numberId) => webhookStatuses.value.find((s) => Number(s.numberId) === Number(numberId)) || null;
const webhookLabel = (matches, status) => {
  if (!status) return 'Unknown';
  if (status.provider === 'manual') return 'Manual';
  if (status.error) return 'Error';
  if (matches === true) return 'OK';
  if (matches === false) return 'Mismatch';
  return 'Unknown';
};
const statusClass = (matches) => {
  if (matches === true) return 'status-ok';
  if (matches === false) return 'status-bad';
  return '';
};

const loadExtensions = async () => {
  if (!agencyId.value) return;
  try {
    const res = await api.get(`/extensions/agency/${agencyId.value}`);
    extensions.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    extensions.value = [];
  }
};

const addExtension = async () => {
  if (!agencyId.value || !newExtUser.value || !newExtNumber.value) return;
  addingExt.value = true;
  try {
    await api.post('/extensions', {
      agencyId: agencyId.value,
      userId: newExtUser.value,
      extension: newExtNumber.value.trim(),
      numberId: newExtNumberId.value
    });
    newExtUser.value = null;
    newExtNumber.value = '';
    newExtNumberId.value = null;
    await loadExtensions();
  } finally {
    addingExt.value = false;
  }
};

const removeExtension = async (ext) => {
  if (!ext?.id) return;
  try {
    await api.delete(`/extensions/${ext.id}`);
    await loadExtensions();
  } catch {
    // ignore
  }
};

const init = async () => {
  await Promise.all([loadSettings(), loadNumbers(), loadUsers(), loadWebhookStatus(), loadExtensions(), loadUsage()]);
};

watch(agencyId, async (val) => {
  if (val) await init();
});

onMounted(async () => {
  if (agencyId.value) await init();
});
</script>

<style scoped>
.sms-numbers {
  padding: 12px;
}
.section-header {
  margin-bottom: 12px;
}
.muted {
  color: var(--text-secondary);
}
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 14px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-group-full { grid-column: 1 / -1; }
.section-divider { margin: 16px 0 10px; padding-top: 12px; border-top: 1px solid var(--border); }
.section-divider h4 { margin: 0 0 8px 0; font-size: 15px; }
.ivr-options { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.ivr-option-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.input-sm { font-size: 14px; padding: 6px 8px; }
.toolbar {
  margin-bottom: 10px;
}
.inline {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
}
.title {
  font-weight: 600;
}
.right {
  display: flex;
  gap: 8px;
  align-items: center;
}
.actions {
  margin-top: 12px;
}
.error {
  color: #b91c1c;
  margin-bottom: 8px;
}
.webhook-status-card {
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 10px;
  margin-top: 10px;
}
.webhook-status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.status-ok {
  color: #166534;
  font-weight: 600;
}
.status-bad {
  color: #b91c1c;
  font-weight: 600;
}
.empty-state {
  color: var(--text-secondary);
  padding: 12px;
}
.checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
}
.checkbox-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9em;
}
.get-started-card {
  border-color: var(--primary, #2563eb);
  background: linear-gradient(to bottom, rgba(37, 99, 235, 0.04), transparent);
}
.setup-steps {
  margin: 12px 0;
  padding-left: 20px;
}
.setup-steps li {
  margin-bottom: 8px;
}
.setup-steps code {
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}
.sms-access-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sms-access-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9em;
}
.toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.toggle-text {
  font-size: 0.85em;
  color: var(--text-secondary);
}
.btn-small {
  padding: 4px 8px;
  font-size: 0.85em;
}
.ext-badge {
  display: inline-block;
  background: var(--primary, #2563eb);
  color: white;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
  margin-right: 8px;
}
.textarea {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
}
.usage-card {
  margin-top: 16px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary, #f8fafc);
}
.usage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.usage-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.usage-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.usage-value {
  font-weight: 600;
  font-size: 1.1em;
}
.usage-label {
  font-size: 0.85em;
  color: var(--text-secondary);
}
.usage-alerts {
  margin-top: 12px;
  padding: 8px;
  background: #fef3c7;
  border-radius: 6px;
  font-size: 0.9em;
}
.alert-badge {
  font-weight: 600;
  margin-right: 8px;
}
.alert-item {
  display: block;
  margin-top: 4px;
}
</style>
