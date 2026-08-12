<template>
  <div v-if="open" class="cc-settings-overlay" @click="$emit('close')">
    <div class="cc-settings-modal" @click.stop>
      <header class="cc-settings-head">
        <div>
          <h3>Email &amp; delivery settings</h3>
          <p class="cc-panel-sub">{{ agencyName || 'This agency' }} — control what sends automatically vs. queues for approval.</p>
        </div>
        <button type="button" class="cc-detail-close" aria-label="Close" @click="$emit('close')">×</button>
      </header>

      <div class="cc-settings-body">
        <div v-if="loading" class="cc-empty pad">Loading email settings…</div>
        <div v-else-if="error" class="cc-banner-err">{{ error }}</div>
        <template v-else>
          <section class="cc-settings-block highlight">
            <h4>School ROI / release emails</h4>
            <p class="hint">
              When on, signing-link and release-of-information emails queue as <strong>pending approval</strong>
              in Automation instead of sending immediately.
            </p>
            <label class="cc-toggle-row">
              <input v-model="form.schoolRoiEmailsRequireApproval" type="checkbox" />
              <span>Require approval before ROI release emails send</span>
            </label>
            <p v-if="form.schoolRoiEmailsRequireApproval" class="cc-settings-status warn">
              ROI emails are paused — staff actions will create pending items for you to approve.
            </p>
            <p v-else class="cc-settings-status ok">ROI emails send immediately when triggered.</p>
          </section>

          <section class="cc-settings-block">
            <h4>Sent from — by email type</h4>
            <p class="hint">
              Choose which alias each category uses. This controls the visible <strong>From</strong> name and address
              (e.g. avoid notifications@ when guardians should see schools@).
            </p>
            <ul class="cc-email-type-list">
              <li v-for="row in emailTypeRows" :key="row.key" class="cc-email-type-row">
                <div class="meta">
                  <strong>{{ row.label }}</strong>
                  <small>{{ row.description }}</small>
                  <small class="sender-line" :class="{ hot: isAiSenderId(typeSenderValue(row.key)) }">
                    Current: {{ typeSenderSummary(row.key) }}
                  </small>
                </div>
                <select
                  :value="typeSenderValue(row.key)"
                  class="cc-select"
                  @change="setTypeSender(row.key, $event.target.value)"
                >
                  <option value="">{{ row.key === 'default' ? 'Auto (identity key fallback)' : 'Use default / auto' }}</option>
                  <option v-for="s in recommendedSenders" :key="`${row.key}-rec-${s.id}`" :value="String(s.id)">
                    {{ formatSenderLabel(s) }} — {{ s.from_email }}
                  </option>
                </select>
              </li>
            </ul>
          </section>

          <section class="cc-settings-block">
            <h4>Agency delivery</h4>
            <label class="cc-toggle-row">
              <input v-model="form.notificationsEnabled" type="checkbox" />
              <span>Agency email notifications enabled</span>
            </label>
            <p class="hint">When off, automated emails for this agency are blocked (logged as skipped).</p>
          </section>

          <section class="cc-settings-block">
            <h4>Platform delivery</h4>
            <div class="cc-settings-row">
              <span>Delivery mode</span>
              <select v-model="form.platformSendingMode" class="cc-select" :disabled="!canEditPlatform">
                <option value="manual_only">Manual only — nothing auto-sends</option>
                <option value="all">Auto + manual allowed</option>
              </select>
            </div>
            <label class="cc-toggle-row">
              <input v-model="form.platformNotificationsEnabled" type="checkbox" :disabled="!canEditPlatform" />
              <span>Platform email notifications enabled</span>
            </label>
            <p v-if="!canEditPlatform" class="hint">Platform controls are super-admin only. Agency ROI toggle above still applies.</p>
          </section>

          <section class="cc-settings-block">
            <h4>Gmail / From identities</h4>
            <dl class="cc-detail-meta compact">
              <dt>API status</dt>
              <dd><span :class="configured ? 'ok-text' : 'hot'">{{ configured ? 'Configured' : 'Not configured' }}</span></dd>
              <dt>Workspace account</dt>
              <dd>{{ impersonateUser || '—' }}</dd>
              <dt>Default From</dt>
              <dd>{{ fromAddress || '—' }}</dd>
            </dl>
            <p v-if="isAiMailbox(impersonateUser)" class="cc-settings-status warn">
              The Gmail API currently authenticates as {{ impersonateUser }}. That mailbox is for AI permissions / inbound routing —
              do <strong>not</strong> pick it as the visible From for client or staff emails (spam risk). Choose a real alias below per trigger.
            </p>
            <ul v-if="senderIdentities.length" class="cc-sender-list">
              <li v-for="s in senderIdentities" :key="s.id">
                <strong>{{ formatSenderLabel(s) }}</strong>
                <small>
                  {{ s.from_email || '—' }} · {{ s.is_active ? 'active' : 'inactive' }}
                  <span v-if="isAiSender(s)" class="hot"> · not for outbound client mail</span>
                </small>
              </li>
            </ul>
            <p v-else class="hint">No sender identities configured for this agency.</p>
          </section>

          <section class="cc-settings-block">
            <h4>Inbound school email AI</h4>
            <div class="cc-settings-row">
              <span>AI draft policy</span>
              <select v-model="form.aiDraftPolicyMode" class="cc-select">
                <option value="human_only">Human only (no AI drafts)</option>
                <option value="draft_known_contacts_only">Draft for known contacts</option>
                <option value="draft_known_accounts_only">Draft for known accounts</option>
                <option value="draft_known_contacts_or_accounts">Draft for contacts or accounts</option>
              </select>
            </div>
            <label class="cc-toggle-row">
              <input v-model="form.allowSchoolOverrides" type="checkbox" />
              <span>Allow per-school AI policy overrides</span>
            </label>
          </section>

          <section v-if="triggers.length" class="cc-settings-block">
            <h4>Notification triggers</h4>
            <p class="hint">
              Expand any trigger to set On/Off, who it emails, which From alias to use, and an optional subject override.
              Changes save per trigger.
            </p>
            <div class="cc-trigger-filter">
              <input
                v-model="triggerFilter"
                type="search"
                class="cc-input"
                placeholder="Filter triggers…"
              />
              <span class="hint tight">{{ filteredTriggers.length }} of {{ triggers.length }}</span>
            </div>
            <ul class="cc-trigger-list expanded">
              <li v-for="t in filteredTriggers" :key="t.triggerKey" class="cc-trigger-card">
                <button type="button" class="cc-trigger-summary" @click="toggleExpand(t.triggerKey)">
                  <div class="left">
                    <strong>{{ t.name }}</strong>
                    <small>{{ t.description }}</small>
                    <small class="sender-line" :class="{ hot: isAiSenderId(editFor(t).senderIdentityId || t.resolved?.senderIdentityId) }">
                      From: {{ senderSummary(t) }}
                    </small>
                  </div>
                  <div class="right">
                    <span v-if="editFor(t).requireApproval" class="pill approval">Approval</span>
                    <span class="pill" :class="editFor(t).enabled ? 'on' : 'off'">{{ editFor(t).enabled ? 'On' : 'Off' }}</span>
                    <span class="chev">{{ expandedKey === t.triggerKey ? '▾' : '▸' }}</span>
                  </div>
                </button>

                <div v-if="expandedKey === t.triggerKey" class="cc-trigger-detail">
                  <p class="hint channel-hint">
                    <strong>In-app alerts always stay on</strong> when automation is enabled.
                    Use the channel toggles below to control email and SMS only.
                  </p>
                  <label class="cc-toggle-row">
                    <input v-model="editFor(t).enabled" type="checkbox" />
                    <span>
                      Automation active
                      <small>When off, nothing fires — no in-app alert, email, or SMS for this trigger.</small>
                    </span>
                  </label>

                  <label class="cc-toggle-row approval-toggle">
                    <input v-model="editFor(t).requireApproval" type="checkbox" />
                    <span>
                      Require approval before send
                      <small>When on, emails queue in Automation as pending. When off, they send immediately.</small>
                    </span>
                  </label>

                  <div class="cc-field">
                    <label>Sent from (alias)</label>
                    <select v-model="editFor(t).senderIdentityId" class="cc-select full">
                      <option value="">Use email-type default above</option>
                      <optgroup v-if="recommendedSenders.length" label="Recommended">
                        <option v-for="s in recommendedSenders" :key="`rec-${s.id}`" :value="String(s.id)">
                          {{ formatSenderLabel(s) }} — {{ s.from_email }}
                        </option>
                      </optgroup>
                      <optgroup v-if="discouragedSenders.length" label="Avoid for outbound (AI / routing)">
                        <option v-for="s in discouragedSenders" :key="`bad-${s.id}`" :value="String(s.id)">
                          {{ formatSenderLabel(s) }} — {{ s.from_email }} (not recommended)
                        </option>
                      </optgroup>
                    </select>
                    <p v-if="isAiSenderId(editFor(t).senderIdentityId)" class="cc-settings-status warn">
                      ai@ / AI mailboxes land in spam and aren’t appropriate as a From for these emails. Pick a staff or school alias instead.
                    </p>
                  </div>

                  <div class="cc-field">
                    <label>Subject override <span class="optional">(optional)</span></label>
                    <input
                      v-model="editFor(t).subjectOverride"
                      type="text"
                      class="cc-input"
                      maxlength="255"
                      placeholder="Leave blank to keep the system-generated subject"
                    />
                    <p class="hint tight">When set, replaces the subject for emails sent through this trigger.</p>
                  </div>

                  <div class="cc-field-grid">
                    <div>
                      <label>Recipients</label>
                      <label class="cc-toggle-row compact"><input v-model="editFor(t).recipients.provider" type="checkbox" /><span>Provider</span></label>
                      <label class="cc-toggle-row compact"><input v-model="editFor(t).recipients.supervisor" type="checkbox" /><span>Supervisor</span></label>
                      <label class="cc-toggle-row compact"><input v-model="editFor(t).recipients.clinicalPracticeAssistant" type="checkbox" /><span>Clinical Practice Assistant</span></label>
                      <label class="cc-toggle-row compact"><input v-model="editFor(t).recipients.admin" type="checkbox" /><span>Admin</span></label>
                    </div>
                    <div>
                      <label>Delivery channels</label>
                      <label class="cc-toggle-row compact locked"><input type="checkbox" checked disabled /><span>In-app (always on when automation is active)</span></label>
                      <label class="cc-toggle-row compact"><input v-model="editFor(t).channels.sms" type="checkbox" /><span>Text (SMS)</span></label>
                      <label class="cc-toggle-row compact"><input v-model="editFor(t).channels.email" type="checkbox" /><span>Email</span></label>
                    </div>
                  </div>

                  <div class="cc-trigger-actions">
                    <button
                      type="button"
                      class="cc-btn solid sm"
                      :disabled="savingTriggerKey === t.triggerKey"
                      @click="saveTrigger(t)"
                    >
                      {{ savingTriggerKey === t.triggerKey ? 'Saving…' : 'Save trigger' }}
                    </button>
                    <span v-if="triggerSaveMsg[t.triggerKey]" class="ok-text">{{ triggerSaveMsg[t.triggerKey] }}</span>
                  </div>
                </div>
              </li>
            </ul>
          </section>

          <div v-if="saveError" class="cc-banner-err">{{ saveError }}</div>
          <div v-if="saveSuccess" class="cc-alert info">{{ saveSuccess }}</div>
        </template>
      </div>

      <footer class="cc-settings-foot">
        <button type="button" class="cc-btn outline" @click="$emit('close')">Close</button>
        <button type="button" class="cc-btn solid" :disabled="saving || loading" @click="save">
          {{ saving ? 'Saving…' : 'Save agency settings' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';

const props = defineProps({
  open: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'saved']);

const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const saveError = ref('');
const saveSuccess = ref('');

const configured = ref(false);
const fromName = ref('');
const fromAddress = ref('');
const impersonateUser = ref('');
const senderIdentities = ref([]);
const triggers = ref([]);
const triggerEdits = reactive({});
const expandedKey = ref('');
const triggerFilter = ref('');
const savingTriggerKey = ref('');
const triggerSaveMsg = reactive({});

const emailTypeRows = [
  {
    key: 'default',
    label: 'Default outbound',
    description: 'Fallback for automated emails when no more specific type is set.'
  },
  {
    key: 'password_reset',
    label: 'Forgot password',
    description: 'Reset-link emails when someone clicks Forgot Password on login.'
  },
  {
    key: 'school_roi_signing',
    label: 'School ROI signing link',
    description: 'Release-of-information signing link emails to guardians.'
  },
  {
    key: 'school_roi_signer_completion',
    label: 'School ROI completion',
    description: 'Download / confirmation email after ROI is signed.'
  },
  {
    key: 'intake',
    label: 'Intake & registration',
    description: 'Public intake confirmations and related school intake mail.'
  },
  {
    key: 'manual',
    label: 'Staff-composed / approvals',
    description: 'Manual sends and approved pending emails when no identity is stored on the row.'
  }
];

const form = ref({
  schoolRoiEmailsRequireApproval: true,
  notificationsEnabled: true,
  platformSendingMode: 'all',
  platformNotificationsEnabled: true,
  aiDraftPolicyMode: 'human_only',
  allowSchoolOverrides: true,
  defaultSenderIdentityId: '',
  templateSenderIdentityIds: {}
});

const agencyId = computed(() => agencyStore.currentAgency?.id);
const agencyName = computed(() => agencyStore.currentAgency?.name || agencyStore.currentAgency?.short_name || '');
const canEditPlatform = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

function isAiMailbox(email) {
  const e = String(email || '').trim().toLowerCase();
  return e === 'ai@plottwistco.com' || e.startsWith('ai@');
}

function isAiSender(identity) {
  if (!identity) return false;
  const key = String(identity.identity_key || '').trim().toLowerCase();
  const email = String(identity.from_email || '').trim().toLowerCase();
  return isAiMailbox(email) || key === 'ai' || key.startsWith('ai_') || key.includes('ai_agent');
}

function isAiSenderId(id) {
  if (!id) return false;
  const found = senderIdentities.value.find((s) => Number(s.id) === Number(id));
  return isAiSender(found);
}

function formatSenderLabel(s) {
  return s?.display_name || s?.identity_key || `Identity #${s?.id}`;
}

const recommendedSenders = computed(() =>
  (senderIdentities.value || []).filter((s) => s.is_active !== 0 && s.is_active !== false && !isAiSender(s))
);
const discouragedSenders = computed(() =>
  (senderIdentities.value || []).filter((s) => isAiSender(s))
);

const filteredTriggers = computed(() => {
  const q = String(triggerFilter.value || '').trim().toLowerCase();
  if (!q) return triggers.value;
  return triggers.value.filter((t) => {
    const hay = `${t.name || ''} ${t.description || ''} ${t.triggerKey || ''}`.toLowerCase();
    return hay.includes(q);
  });
});

function editFor(t) {
  const key = String(t?.triggerKey || '').trim();
  if (!key) {
    return {
      enabled: true,
      requireApproval: false,
      senderIdentityId: '',
      subjectOverride: '',
      recipients: { provider: true, supervisor: true, clinicalPracticeAssistant: true, admin: true },
      channels: { inApp: true, sms: false, email: true }
    };
  }
  if (!triggerEdits[key]) {
    triggerEdits[key] = {
      enabled: true,
      requireApproval: false,
      senderIdentityId: '',
      subjectOverride: '',
      recipients: { provider: true, supervisor: true, clinicalPracticeAssistant: true, admin: true },
      channels: { inApp: true, sms: false, email: true }
    };
  }
  return triggerEdits[key];
}

function hydrateEdits(rows) {
  for (const key of Object.keys(triggerEdits)) delete triggerEdits[key];
  for (const t of rows || []) {
    const k = String(t?.triggerKey || '').trim();
    if (!k) continue;
    const resolved = t.resolved || {};
    const overrideSender =
      t?.agencyOverride?.senderIdentityId !== null && t?.agencyOverride?.senderIdentityId !== undefined
        ? String(t.agencyOverride.senderIdentityId)
        : '';
    triggerEdits[k] = {
      enabled: !!resolved.enabled,
      requireApproval: !!(t?.agencyOverride?.requireApproval ?? resolved.requireApproval),
      senderIdentityId: overrideSender,
      subjectOverride: t?.agencyOverride?.subjectOverride || resolved.subjectOverride || '',
      recipients: {
        provider: !!resolved?.recipients?.provider,
        supervisor: !!resolved?.recipients?.supervisor,
        clinicalPracticeAssistant: !!resolved?.recipients?.clinicalPracticeAssistant,
        admin: !!resolved?.recipients?.admin
      },
      channels: {
        inApp: true,
        sms: !!resolved?.channels?.sms,
        email: !!resolved?.channels?.email
      }
    };
  }
}

function typeSenderValue(key) {
  if (key === 'default') return String(form.value.defaultSenderIdentityId || '');
  return String(form.value.templateSenderIdentityIds?.[key] || '');
}

function setTypeSender(key, value) {
  const id = String(value || '').trim();
  if (key === 'default') {
    form.value.defaultSenderIdentityId = id;
    return;
  }
  form.value.templateSenderIdentityIds = {
    ...form.value.templateSenderIdentityIds,
    [key]: id
  };
}

function typeSenderSummary(key) {
  const id = typeSenderValue(key);
  if (!id) {
    return key === 'default' ? 'Auto (may use notifications@)' : 'Uses default / auto';
  }
  const s = senderIdentities.value.find((x) => Number(x.id) === Number(id));
  if (!s) return `Identity #${id}`;
  return `${formatSenderLabel(s)} <${s.from_email}>`;
}

function senderSummary(t) {
  const edit = editFor(t);
  const id = edit.senderIdentityId || t?.resolved?.senderIdentityId;
  if (!id) return typeSenderSummary('default');
  const s = senderIdentities.value.find((x) => Number(x.id) === Number(id));
  if (!s) return `Identity #${id}`;
  const bad = isAiSender(s) ? ' ⚠ AI mailbox' : '';
  return `${formatSenderLabel(s)} <${s.from_email}>${bad}`;
}

function toggleExpand(key) {
  expandedKey.value = expandedKey.value === key ? '' : key;
}

async function load() {
  if (!agencyId.value) {
    error.value = 'Select an agency first.';
    return;
  }
  loading.value = true;
  error.value = '';
  saveError.value = '';
  saveSuccess.value = '';
  try {
    const [settingsRes, triggersRes, sendersRes] = await Promise.all([
      api.get('/email-settings', { skipGlobalLoading: true }),
      api.get(`/agencies/${agencyId.value}/notification-triggers`, { skipGlobalLoading: true }),
      api.get('/email-senders', { params: { agencyId: agencyId.value }, skipGlobalLoading: true })
    ]);

    const settings = settingsRes.data || {};
    configured.value = !!settings.configured;
    fromName.value = settings.fromName || '';
    fromAddress.value = settings.fromAddress || '';
    impersonateUser.value = settings.impersonateUser || '';

    const agencyRow = (settings.agencies || []).find((a) => Number(a.agencyId) === Number(agencyId.value)) || {};
    form.value = {
      schoolRoiEmailsRequireApproval: agencyRow.schoolRoiEmailsRequireApproval !== false,
      notificationsEnabled: agencyRow.notificationsEnabled !== false,
      platformSendingMode: settings.platform?.sendingMode || 'all',
      platformNotificationsEnabled: settings.platform?.notificationsEnabled !== false,
      aiDraftPolicyMode: agencyRow.aiDraftPolicyMode || 'human_only',
      allowSchoolOverrides: agencyRow.allowSchoolOverrides !== false,
      defaultSenderIdentityId: agencyRow.defaultSenderIdentityId ? String(agencyRow.defaultSenderIdentityId) : '',
      templateSenderIdentityIds: { ...(agencyRow.templateSenderIdentityIds || {}) }
    };
    for (const row of emailTypeRows) {
      if (row.key === 'default') continue;
      const val = form.value.templateSenderIdentityIds[row.key];
      if (val) form.value.templateSenderIdentityIds[row.key] = String(val);
    }

    triggers.value = Array.isArray(triggersRes.data) ? triggersRes.data : [];
    senderIdentities.value = Array.isArray(sendersRes.data) ? sendersRes.data : [];
    hydrateEdits(triggers.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load email settings';
  } finally {
    loading.value = false;
  }
}

async function saveTrigger(triggerRow) {
  if (!agencyId.value) return;
  const key = String(triggerRow?.triggerKey || '').trim();
  if (!key) return;
  savingTriggerKey.value = key;
  saveError.value = '';
  triggerSaveMsg[key] = '';
  try {
    const edit = editFor(triggerRow);
    const resp = await api.put(`/agencies/${agencyId.value}/notification-triggers/${key}`, {
      enabled: !!edit.enabled,
      recipients: {
        provider: !!edit.recipients?.provider,
        supervisor: !!edit.recipients?.supervisor,
        clinicalPracticeAssistant: !!edit.recipients?.clinicalPracticeAssistant,
        admin: !!edit.recipients?.admin
      },
      channels: {
        inApp: true,
        sms: !!edit.channels?.sms,
        email: !!edit.channels?.email
      },
      senderIdentityId: edit.senderIdentityId ? Number(edit.senderIdentityId) : null,
      subjectOverride: String(edit.subjectOverride || '').trim() || null,
      requireApproval: !!edit.requireApproval
    }, { skipGlobalLoading: true });

    triggers.value = triggers.value.map((t) => (
      t.triggerKey === key
        ? {
            ...t,
            agencyOverride: resp.data?.agencyOverride || t.agencyOverride,
            resolved: resp.data?.resolved || t.resolved
          }
        : t
    ));
    triggerSaveMsg[key] = 'Saved';
    setTimeout(() => { triggerSaveMsg[key] = ''; }, 2500);
  } catch (e) {
    saveError.value = e?.response?.data?.error?.message || 'Failed to save trigger';
  } finally {
    savingTriggerKey.value = '';
  }
}

async function save() {
  if (!agencyId.value) return;
  saving.value = true;
  saveError.value = '';
  saveSuccess.value = '';
  try {
    const templateSenderIdentityIds = {};
    for (const row of emailTypeRows) {
      if (row.key === 'default') continue;
      const raw = String(form.value.templateSenderIdentityIds?.[row.key] || '').trim();
      if (raw) templateSenderIdentityIds[row.key] = Number(raw);
    }
    const payload = {
      agencies: [{
        agencyId: agencyId.value,
        notificationsEnabled: form.value.notificationsEnabled,
        schoolRoiEmailsRequireApproval: form.value.schoolRoiEmailsRequireApproval,
        aiDraftPolicyMode: form.value.aiDraftPolicyMode,
        allowSchoolOverrides: form.value.allowSchoolOverrides,
        defaultSenderIdentityId: form.value.defaultSenderIdentityId ? Number(form.value.defaultSenderIdentityId) : null,
        templateSenderIdentityIds
      }]
    };
    if (canEditPlatform.value) {
      payload.platform = {
        sendingMode: form.value.platformSendingMode,
        notificationsEnabled: form.value.platformNotificationsEnabled
      };
    }
    await api.put('/email-settings', payload, { skipGlobalLoading: true });
    saveSuccess.value = form.value.schoolRoiEmailsRequireApproval
      ? 'Saved. ROI release emails will queue for approval.'
      : 'Saved. ROI release emails will send immediately again.';
    emit('saved');
  } catch (e) {
    saveError.value = e?.response?.data?.error?.message || 'Failed to save settings';
  } finally {
    saving.value = false;
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) load();
});
watch(() => agencyId.value, () => {
  if (props.open) load();
});
</script>

<style scoped>
.cc-settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.cc-settings-modal {
  width: min(820px, 100%);
  max-height: min(92vh, 960px);
  background: #fff;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
  overflow: hidden;
}
.cc-settings-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid #e2e8f0;
}
.cc-settings-head h3 { margin: 0; }
.cc-settings-body {
  flex: 1;
  overflow: auto;
  padding: 16px 22px 20px;
}
.cc-settings-block {
  margin-bottom: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f1f5f9;
}
.cc-settings-block.highlight {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 18px;
}
.cc-settings-block h4 {
  margin: 0 0 8px;
  font-size: 14px;
}
.hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}
.hint.tight { margin: 4px 0 0; }
.cc-toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  margin-bottom: 6px;
}
.cc-toggle-row.compact { font-weight: 600; }
.cc-toggle-row input { margin-top: 2px; }
.cc-settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
}
.cc-select {
  min-width: 220px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  font-size: 13px;
  background: #fff;
}
.cc-select.full { width: 100%; min-width: 0; }
.cc-input {
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  font-size: 13px;
  box-sizing: border-box;
}
.cc-settings-status {
  margin: 10px 0 0;
  font-size: 12px;
  font-weight: 700;
}
.cc-settings-status.warn { color: #92400e; }
.cc-settings-status.ok { color: #166534; }
.cc-sender-list, .cc-trigger-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.cc-sender-list li {
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}
.cc-sender-list small {
  display: block;
  color: #64748b;
  font-size: 11px;
  margin-top: 2px;
}
.cc-trigger-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.cc-trigger-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  margin-bottom: 8px;
  overflow: hidden;
  background: #fff;
}
.cc-trigger-summary {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 0;
  background: #f8fafc;
  cursor: pointer;
  text-align: left;
}
.cc-trigger-summary .left { min-width: 0; }
.cc-trigger-summary strong {
  display: block;
  font-size: 13px;
  color: #0f172a;
}
.cc-trigger-summary small {
  display: block;
  color: #64748b;
  font-size: 11px;
  margin-top: 3px;
  line-height: 1.35;
}
.cc-trigger-summary .sender-line {
  margin-top: 6px;
  font-weight: 700;
  color: #334155;
}
.cc-trigger-summary .sender-line.hot { color: #b91c1c; }
.cc-trigger-summary .right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.pill {
  font-size: 11px;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 999px;
}
.pill.on { background: #dcfce7; color: #166534; }
.pill.off { background: #e2e8f0; color: #475569; }
.pill.approval { background: #fef3c7; color: #92400e; }
.approval-toggle span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.approval-toggle small {
  font-weight: 500;
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
}
.channel-hint {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  padding: 10px 12px;
  margin: 0 0 10px;
}
.cc-toggle-row.locked { opacity: 0.85; cursor: default; }
.cc-toggle-row span small {
  display: block;
  font-weight: 500;
  color: #64748b;
  font-size: 11px;
  margin-top: 2px;
}
.chev { color: #64748b; font-size: 14px; }
.cc-trigger-detail {
  padding: 14px;
  border-top: 1px solid #e2e8f0;
  display: grid;
  gap: 12px;
}
.cc-field label, .cc-field-grid label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 6px;
}
.cc-field .optional { font-weight: 500; color: #94a3b8; }
.cc-field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.cc-trigger-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cc-btn.sm {
  padding: 8px 12px;
  font-size: 12px;
}
.cc-settings-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 22px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}
.ok-text { color: #166534; font-weight: 700; font-size: 12px; }
.hot { color: #dc2626; }
.cc-detail-meta.compact {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 4px 10px;
  font-size: 12px;
  margin-bottom: 10px;
}
.cc-detail-meta.compact dt { color: #64748b; }
.cc-detail-meta.compact dd { margin: 0; font-weight: 600; }
.cc-email-type-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.cc-email-type-row {
  display: grid;
  grid-template-columns: 1fr minmax(220px, 280px);
  gap: 12px;
  align-items: start;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.cc-email-type-row .meta strong {
  display: block;
  font-size: 13px;
}
.cc-email-type-row .meta small {
  display: block;
  color: #64748b;
  font-size: 11px;
  margin-top: 3px;
  line-height: 1.35;
}
@media (max-width: 640px) {
  .cc-email-type-row { grid-template-columns: 1fr; }
}
</style>
