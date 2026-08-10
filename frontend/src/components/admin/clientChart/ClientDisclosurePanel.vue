<template>
  <section class="cc-docs-panel client-disclosure-panel">
    <div class="cdp-header">
      <div>
        <h4 class="cc-docs-panel__title">Disclosure</h4>
        <p class="cc-docs-panel__hint">
          Signed provider disclosure status, parties on the last acknowledgment, and tenant terminology.
        </p>
      </div>
      <div class="cdp-actions">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="refresh">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
        <button
          v-if="canManage"
          type="button"
          class="btn btn-outline btn-sm"
          :disabled="requiring || loading"
          @click="markRequired"
        >
          {{ requiring ? 'Updating…' : 'Mark disclosure required' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="success" class="success">{{ success }}</div>
    <div v-if="loading && !disclosure" class="muted">Loading disclosure…</div>

    <template v-else>
      <div class="cdp-status-row">
        <div class="cdp-status-card">
          <div class="cdp-k">Status</div>
          <div class="cdp-v">
            <span class="badge" :class="statusBadgeClass">{{ statusLabel }}</span>
          </div>
        </div>
        <div class="cdp-status-card">
          <div class="cdp-k">Last signed</div>
          <div class="cdp-v">{{ lastSignedLabel }}</div>
        </div>
        <div class="cdp-status-card">
          <div class="cdp-k">Language</div>
          <div class="cdp-v">{{ lastLanguageLabel }}</div>
        </div>
      </div>

      <div v-if="previewNote" class="cdp-preview-note">
        <strong>Preview note</strong>
        <p>{{ previewNote }}</p>
      </div>

      <div class="cdp-parties">
        <h5>Parties on last signed acknowledgment</h5>
        <div v-if="!parties.length" class="cc-docs-empty">
          No signed disclosure on file yet.
        </div>
        <ul v-else class="cdp-party-list">
          <li v-for="party in parties" :key="partyKey(party)">
            <div class="cdp-party-name">{{ partyName(party) }}</div>
            <div class="cdp-party-meta">
              <span v-if="party.category || party.licenseCategory">{{ formatCategory(party.category || party.licenseCategory) }}</span>
              <span v-if="party.licenseNumber || party.license_number">
                · License {{ party.licenseNumber || party.license_number }}
              </span>
              <span v-if="party.credential"> · {{ party.credential }}</span>
            </div>
          </li>
        </ul>
        <a
          v-if="downloadUrl"
          class="btn btn-secondary btn-sm"
          :href="downloadUrl"
          target="_blank"
          rel="noopener"
          style="margin-top: 10px;"
        >
          Open signed disclosure
        </a>
      </div>

      <div v-if="canEditRegulatoryBoards" class="cdp-terminology">
        <button type="button" class="cdp-terminology-toggle" @click="toggleRegulatoryBoards">
          <span>{{ regulatoryBoardsOpen ? '▾' : '▸' }}</span>
          Regulatory boards by license type (tenant)
        </button>
        <div v-if="regulatoryBoardsOpen" class="cdp-terminology-body">
          <p class="muted tiny">
            Colorado defaults are pre-filled from each provider’s license type. Overrides apply agency-wide.
          </p>
          <div v-if="settingsLoading" class="muted">Loading settings…</div>
          <template v-else>
            <div class="cdp-board-table" role="table" aria-label="Regulatory boards by license type">
              <div class="cdp-board-head" role="row">
                <div role="columnheader">License type</div>
                <div role="columnheader">Regulatory board</div>
              </div>
              <div
                v-for="row in regulatoryBoardDraft"
                :key="row.key"
                class="cdp-board-row"
                role="row"
              >
                <div class="cdp-board-type" role="cell">
                  <strong>{{ row.key }}</strong>
                  <span class="muted tiny">{{ row.label }}</span>
                </div>
                <div role="cell">
                  <input
                    v-model="row.board"
                    type="text"
                    class="cdp-board-input"
                    :placeholder="row.defaultBoard"
                  />
                </div>
              </div>
            </div>
            <div class="cdp-actions" style="margin-top: 10px;">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="settingsSaving"
                @click="resetRegulatoryBoards"
              >
                Reset to Colorado defaults
              </button>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="settingsSaving"
                @click="saveRegulatoryBoards"
              >
                {{ settingsSaving ? 'Saving…' : 'Save boards' }}
              </button>
            </div>
          </template>
        </div>
      </div>

      <div v-if="canEditTerminology" class="cdp-terminology">
        <button type="button" class="cdp-terminology-toggle" @click="terminologyOpen = !terminologyOpen">
          <span>{{ terminologyOpen ? '▾' : '▸' }}</span>
          Edit terminology (tenant)
        </button>
        <div v-if="terminologyOpen" class="cdp-terminology-body">
          <p class="muted tiny">
            Edits apply agency-wide for this tenant’s disclosure copy (locale: {{ settingsLocale }}).
          </p>
          <div v-if="settingsLoading" class="muted">Loading settings…</div>
          <template v-else>
            <label v-for="field in terminologyFields" :key="field.key" class="cdp-field">
              <span>{{ field.label }}</span>
              <textarea
                v-model="terminologyDraft[field.key]"
                rows="3"
                :placeholder="field.placeholder"
              />
            </label>
            <div class="cdp-actions" style="margin-top: 10px;">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="settingsSaving"
                @click="saveTerminology"
              >
                {{ settingsSaving ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';
import {
  buildRegulatoryBoardDraft,
  regulatoryBoardsFromDraft
} from '../../../utils/disclosureRegulatoryBoards.js';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  client: { type: Object, default: null }
});

const authStore = useAuthStore();

const loading = ref(false);
const requiring = ref(false);
const settingsLoading = ref(false);
const settingsSaving = ref(false);
const error = ref('');
const success = ref('');
const disclosure = ref(null);
const terminologyOpen = ref(false);
const regulatoryBoardsOpen = ref(false);
const settingsLocale = ref('en');
const regulatoryBoardDraft = ref([]);
const terminologyDraft = reactive({
  introHtml: '',
  doraHtml: '',
  businessEntityHtml: '',
  rightsHtml: '',
  levelsOfRegulationHtml: '',
  acknowledgmentText: '',
  fullyLicensedHeading: '',
  preLicensedHeading: '',
  unlicensedHeading: ''
});

const terminologyFields = [
  { key: 'introHtml', label: 'Introduction HTML', placeholder: 'Intro / purpose block' },
  { key: 'doraHtml', label: 'DORA HTML', placeholder: 'DORA / regulatory intro' },
  { key: 'businessEntityHtml', label: 'Business entity HTML', placeholder: 'Legal entity block' },
  { key: 'rightsHtml', label: 'Client rights HTML', placeholder: 'Client Rights I–V' },
  { key: 'levelsOfRegulationHtml', label: 'Levels of regulation HTML', placeholder: 'Levels of regulation' },
  { key: 'acknowledgmentText', label: 'Acknowledgment text', placeholder: 'Signer acknowledgment language' },
  { key: 'fullyLicensedHeading', label: 'Fully licensed heading', placeholder: 'FULLY LICENSED' },
  { key: 'preLicensedHeading', label: 'Pre-licensed heading', placeholder: 'PRE-LICENSED' },
  { key: 'unlicensedHeading', label: 'Unlicensed heading', placeholder: 'UNLICENSED' }
];

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const canManage = computed(() => ['super_admin', 'admin', 'support'].includes(roleNorm.value));
const canEditTerminology = computed(() => canManage.value);
const canEditRegulatoryBoards = computed(() => ['super_admin', 'admin'].includes(roleNorm.value));

const agencyId = computed(() => {
  const fromClient = Number(props.client?.agency_id || props.client?.agencyId || 0);
  if (fromClient) return fromClient;
  return Number(disclosure.value?.agencyId || disclosure.value?.agency_id || 0) || null;
});

const statusKey = computed(() => {
  const raw = disclosure.value || {};
  if (raw.disclosureRequired === true || raw.disclosure_required === true || raw.status === 're_sign_needed') {
    return 're_sign_needed';
  }
  if (raw.status === 'current' || raw.isCurrent === true || raw.current === true) return 'current';
  if (raw.lastAcknowledgement || raw.last_acknowledgement) return 'current';
  return 'missing';
});

const statusLabel = computed(() => {
  if (statusKey.value === 're_sign_needed') return 'Re-sign needed';
  if (statusKey.value === 'current') return 'Current';
  return 'Not signed';
});

const statusBadgeClass = computed(() => {
  if (statusKey.value === 're_sign_needed') return 'badge-warning';
  if (statusKey.value === 'current') return 'badge-success';
  return 'badge-secondary';
});

const lastAck = computed(() =>
  disclosure.value?.lastAcknowledgement
  || disclosure.value?.last_acknowledgement
  || disclosure.value?.acknowledgement
  || null
);

const lastSignedLabel = computed(() => {
  const at = lastAck.value?.signedAt || lastAck.value?.signed_at || null;
  if (!at) return '—';
  try {
    return new Date(at).toLocaleString();
  } catch {
    return String(at);
  }
});

const lastLanguageLabel = computed(() => {
  const code = String(lastAck.value?.languageCode || lastAck.value?.language_code || lastAck.value?.locale || '').trim();
  if (!code) return '—';
  return code.toLowerCase().startsWith('es') ? 'Spanish' : 'English';
});

const previewNote = computed(() =>
  String(
    disclosure.value?.previewNote
    || disclosure.value?.preview_note
    || disclosure.value?.note
    || ''
  ).trim()
);

const parties = computed(() => {
  const ack = lastAck.value || {};
  const list = ack.parties || ack.providers || ack.providers_json || disclosure.value?.parties || [];
  return Array.isArray(list) ? list : [];
});

const downloadUrl = computed(() =>
  disclosure.value?.downloadUrl
  || disclosure.value?.download_url
  || lastAck.value?.downloadUrl
  || lastAck.value?.download_url
  || null
);

function partyKey(party) {
  return String(party.id || party.userId || party.user_id || party.fullName || party.full_name || Math.random());
}

function partyName(party) {
  return String(party.fullName || party.full_name || [party.firstName, party.lastName].filter(Boolean).join(' ') || '—');
}

function formatCategory(raw) {
  const value = String(raw || '').trim().toUpperCase().replace(/_/g, ' ');
  return value || '—';
}

function applyTerminology(source) {
  const terminology = source?.terminology || source?.terminology_json || source?.copy || source || {};
  for (const field of terminologyFields) {
    terminologyDraft[field.key] = String(terminology[field.key] ?? terminologyDraft[field.key] ?? '');
  }
  if (source?.locale) settingsLocale.value = String(source.locale);
  regulatoryBoardDraft.value = buildRegulatoryBoardDraft(source?.regulatoryBoards || {});
}

function toggleRegulatoryBoards() {
  regulatoryBoardsOpen.value = !regulatoryBoardsOpen.value;
  if (regulatoryBoardsOpen.value) void loadSettings();
}

async function resetRegulatoryBoards() {
  regulatoryBoardDraft.value = buildRegulatoryBoardDraft({});
  if (!agencyId.value || !canEditRegulatoryBoards.value) return;
  settingsSaving.value = true;
  error.value = '';
  success.value = '';
  try {
    await api.put(`/agencies/${agencyId.value}/disclosure-settings`, {
      locale: 'en',
      regulatoryBoards: {}
    }, { skipGlobalLoading: true });
    success.value = 'Regulatory boards reset to Colorado defaults.';
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to reset regulatory board settings.';
  } finally {
    settingsSaving.value = false;
  }
}

async function loadDisclosure() {
  if (!props.clientId) return;
  loading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/clients/${props.clientId}/disclosure`, { skipGlobalLoading: true });
    disclosure.value = resp.data?.disclosure || resp.data || null;
  } catch (err) {
    disclosure.value = null;
    error.value = err.response?.data?.error?.message || 'Failed to load disclosure status.';
  } finally {
    loading.value = false;
  }
}

async function loadSettings() {
  if (!agencyId.value || !canEditTerminology.value) return;
  settingsLoading.value = true;
  try {
    const resp = await api.get(`/agencies/${agencyId.value}/disclosure-settings`, {
      params: { locale: settingsLocale.value },
      skipGlobalLoading: true
    });
    applyTerminology(resp.data?.settings || resp.data || {});
  } catch (err) {
    // Settings may not exist yet; keep draft empty and surface softly.
    if (err.response?.status !== 404) {
      error.value = err.response?.data?.error?.message || 'Failed to load disclosure settings.';
    }
  } finally {
    settingsLoading.value = false;
  }
}

async function refresh() {
  success.value = '';
  await loadDisclosure();
  if (terminologyOpen.value || regulatoryBoardsOpen.value) await loadSettings();
}

async function markRequired() {
  if (!props.clientId || !canManage.value) return;
  requiring.value = true;
  error.value = '';
  success.value = '';
  try {
    await api.post(`/clients/${props.clientId}/disclosure/require`, {}, { skipGlobalLoading: true });
    success.value = 'Disclosure marked as required.';
    await loadDisclosure();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to mark disclosure required.';
  } finally {
    requiring.value = false;
  }
}

async function saveRegulatoryBoards() {
  if (!agencyId.value || !canEditRegulatoryBoards.value) return;
  settingsSaving.value = true;
  error.value = '';
  success.value = '';
  try {
    const boards = regulatoryBoardsFromDraft(regulatoryBoardDraft.value);
    await api.put(`/agencies/${agencyId.value}/disclosure-settings`, {
      locale: 'en',
      regulatoryBoards: boards
    }, { skipGlobalLoading: true });
    success.value = 'Regulatory board settings saved.';
    await loadSettings();
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save regulatory board settings.';
  } finally {
    settingsSaving.value = false;
  }
}

async function saveTerminology() {
  if (!agencyId.value || !canEditTerminology.value) return;
  settingsSaving.value = true;
  error.value = '';
  success.value = '';
  try {
    const terminology = {};
    for (const field of terminologyFields) {
      terminology[field.key] = String(terminologyDraft[field.key] || '');
    }
    await api.put(`/agencies/${agencyId.value}/disclosure-settings`, {
      locale: settingsLocale.value,
      terminology
    }, { skipGlobalLoading: true });
    success.value = 'Disclosure terminology saved.';
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save disclosure settings.';
  } finally {
    settingsSaving.value = false;
  }
}

watch(terminologyOpen, async (open) => {
  if (open) await loadSettings();
});

watch(regulatoryBoardsOpen, async (open) => {
  if (open) await loadSettings();
});

watch(
  () => props.clientId,
  () => {
    void refresh();
  }
);

onMounted(() => {
  void refresh();
});
</script>

<style scoped>
.client-disclosure-panel {
  margin-bottom: 16px;
}

.cdp-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.cdp-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.cdp-status-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.cdp-status-card {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-secondary, #f8fafc);
}

.cdp-k {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
  margin-bottom: 4px;
}

.cdp-v {
  font-size: 14px;
  font-weight: 650;
}

.cdp-preview-note {
  border-left: 3px solid var(--df-primary, #1e4d3b);
  padding: 8px 12px;
  margin-bottom: 14px;
  background: var(--bg-secondary, #f8fafc);
  border-radius: 0 8px 8px 0;
}

.cdp-preview-note p {
  margin: 4px 0 0;
  color: var(--text-secondary, #64748b);
  font-size: 13px;
}

.cdp-parties h5 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
}

.cdp-party-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.cdp-party-list li {
  padding: 8px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
}

.cdp-party-name {
  font-weight: 650;
}

.cdp-party-meta {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  margin-top: 2px;
}

.cdp-terminology {
  margin-top: 16px;
  border-top: 1px solid var(--border, #e2e8f0);
  padding-top: 12px;
}

.cdp-terminology-toggle {
  border: none;
  background: transparent;
  padding: 0;
  font-weight: 700;
  color: var(--df-primary, #1e4d3b);
  cursor: pointer;
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.cdp-terminology-body {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}

.cdp-field {
  display: grid;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
}

.cdp-field textarea {
  width: 100%;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  font-weight: 400;
  color: var(--text-primary, #0f172a);
  resize: vertical;
}

.cdp-board-table {
  display: grid;
  gap: 8px;
}

.cdp-board-head,
.cdp-board-row {
  display: grid;
  grid-template-columns: minmax(180px, 0.9fr) minmax(220px, 1.4fr);
  gap: 10px;
  align-items: start;
}

.cdp-board-head {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary, #64748b);
}

.cdp-board-type {
  display: grid;
  gap: 2px;
  font-size: 13px;
}

.cdp-board-input {
  width: 100%;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  color: var(--text-primary, #0f172a);
}

.muted { color: var(--text-secondary, #64748b); }
.tiny { font-size: 12px; }
.error { color: #b91c1c; margin-bottom: 8px; }
.success { color: #166534; margin-bottom: 8px; }
</style>
