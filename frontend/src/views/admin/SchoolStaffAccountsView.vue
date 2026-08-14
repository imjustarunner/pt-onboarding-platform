<template>
  <div class="container ssa-page">
    <header class="page-header">
      <div>
        <h1>School Staff Accounts</h1>
        <p class="muted ssa-sub">
          Manage school staff login access across affiliated schools. Filter never-logged-in users and set the same temporary password in bulk.
        </p>
      </div>
      <div class="header-actions">
        <router-link class="btn btn-secondary btn-sm" :to="backTo">Back to School Operations</router-link>
      </div>
    </header>

    <div v-if="!agencyId" class="error">No agency context. Open this page from School Operations.</div>

    <template v-else>
      <div class="filters-row">
        <div class="filter-group">
          <label>Search</label>
          <input v-model.trim="search" type="text" placeholder="Name or email" />
        </div>
        <div class="filter-group">
          <label>School</label>
          <select v-model="schoolFilter">
            <option value="">All schools</option>
            <option v-for="school in schoolOptions" :key="school.id" :value="String(school.id)">
              {{ school.name }}
            </option>
          </select>
        </div>
        <div class="filter-group filter-group-check">
          <label class="checkbox-label">
            <input v-model="neverLoggedInOnly" type="checkbox" @change="loadStaff" />
            Never logged in only
          </label>
          <span class="muted ssa-filter-hint">No permanent password set — still on a temp password or none at all.</span>
        </div>
        <div class="filter-group filter-group-actions">
          <button class="btn btn-secondary btn-sm" type="button" @click="resetFilters">Reset filters</button>
        </div>
      </div>

      <div v-if="selectedIds.size > 0" class="ssa-bulk-bar">
        <div class="ssa-bulk-copy">
          <strong>{{ selectedIds.size }}</strong> selected
        </div>
        <label class="ssa-bulk-field">
          <span>Temporary password</span>
          <input
            v-model="bulkPassword"
            type="text"
            autocomplete="off"
            placeholder="Same password for all selected"
          />
        </label>
        <label class="ssa-bulk-field ssa-bulk-field--sm">
          <span>Expires in</span>
          <select v-model="bulkExpiresInHours">
            <option value="48">48 hours</option>
            <option value="72">72 hours</option>
            <option value="168">7 days</option>
            <option value="336">14 days</option>
          </select>
        </label>
        <button
          class="btn btn-primary btn-sm"
          type="button"
          :disabled="bulkSubmitting || !canSubmitBulkPassword"
          @click="openBulkConfirm"
        >
          {{ bulkSubmitting ? 'Setting…' : 'Set temporary password' }}
        </button>
        <button
          class="btn btn-secondary btn-sm"
          type="button"
          :disabled="accessSubmitting || selectedIds.size === 0"
          @click="openAccessEmail"
        >
          Send Account Access Email
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="clearSelection">Clear selection</button>
      </div>

      <p class="ssa-note muted">
        Use <strong>Never logged in only</strong> to see staff who still need a password. You can set a temporary password yourself, or send a staggered Account Access email (recovery link or portal access) so you do not have to BCC them separately.
        Portal access emails that include a line like <strong>Temp password: …</strong> must be synced to accounts — sending the email alone does not save the password on this page until you sync.
      </p>

      <div v-if="pendingPasswordSync?.pending" class="ssa-sync-banner">
        <div>
          <strong>Portal access emails were sent with a temp password.</strong>
          Staff may not be able to log in until the password is synced to their accounts (no new email is sent).
          <span v-if="pendingPasswordSync.sentCount" class="muted ssa-set-meta">
            {{ pendingPasswordSync.sentCount }} recipient{{ pendingPasswordSync.sentCount === 1 ? '' : 's' }} from the latest batch.
          </span>
        </div>
        <div class="ssa-sync-banner__actions">
          <input
            v-model="pendingSyncPassword"
            type="text"
            class="ssa-sync-password-input"
            placeholder="Temp password from email (optional if already in email body)"
          />
          <button
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="passwordSyncSubmitting"
            @click="syncPendingPortalPassword"
          >
            {{ passwordSyncSubmitting ? 'Syncing…' : 'Sync password to accounts' }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="loading">Loading school staff accounts…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th class="col-check">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  :indeterminate="someVisibleSelected"
                  title="Select all visible"
                  @change="toggleSelectAllVisible"
                />
              </th>
              <th>Name</th>
              <th>Email</th>
              <th>Schools</th>
              <th>Status</th>
              <th>Last login</th>
              <th>Temp password</th>
              <th>Set by</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="staff in filteredStaff"
              :key="staff.id"
              :class="{ 'row-selected': selectedIds.has(staff.id) }"
            >
              <td class="col-check">
                <input
                  type="checkbox"
                  :checked="selectedIds.has(staff.id)"
                  @change="toggleSelect(staff.id)"
                />
              </td>
              <td>{{ staffName(staff) }}</td>
              <td>{{ staff.email || '—' }}</td>
              <td>{{ staff.school_names || '—' }}</td>
              <td>
                <span :class="['badge', statusBadgeClass(staff.status)]">{{ statusLabel(staff.status) }}</span>
              </td>
              <td>
                <span v-if="staff.has_permanent_password" class="ssa-has-pw">Has password</span>
                <span v-else-if="staff.has_never_logged_in" class="ssa-never-login">Never logged in</span>
                <span v-else class="muted">—</span>
              </td>
              <td class="ssa-temp-cell">
                <template v-if="staff.temporary_password_status === 'active' || staff.temporary_password_status === 'expired'">
                  <div class="ssa-temp-line">
                    <span class="ssa-temp-label">Sent</span>
                    <span>{{ formatDateTime(staff.temporary_password_set_at) || 'Unknown' }}</span>
                  </div>
                  <div
                    class="ssa-temp-line"
                    :class="staff.temporary_password_status === 'active' ? 'ssa-temp-active' : 'ssa-temp-expired'"
                  >
                    <span class="ssa-temp-label">Expires</span>
                    <span>{{ formatDateTime(staff.temporary_password_expires_at) }}</span>
                  </div>
                </template>
                <span v-else class="muted">None</span>
              </td>
              <td>
                <template v-if="staff.temporary_password_set_by_label">
                  <div>{{ staff.temporary_password_set_by_label }}</div>
                </template>
                <span v-else class="muted">—</span>
              </td>
            </tr>
            <tr v-if="filteredStaff.length === 0">
              <td colspan="8" class="empty-row">No school staff accounts found.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-if="showAccessEmail" class="modal-overlay" @click.self="closeAccessEmail">
      <div class="modal ssa-access-modal">
        <h2>Send Account Access Email</h2>
        <p class="muted">
          {{ selectedIds.size }} selected.
          Confirm the From address and copy, send a test (no token), then queue staggered delivery so district filters do not treat this as a blast.
        </p>

        <div v-if="accessLoading && !accessPreview" class="loading">Loading email preview…</div>
        <div v-if="accessError" class="error">{{ accessError }}</div>
        <template v-if="accessPreview">
          <div class="ssa-access-type">
            <label class="ssa-radio">
              <input v-model="accessEmailType" type="radio" value="recovery" @change="onAccessTypeChange" />
              Recovery email (set-password link)
            </label>
            <label class="ssa-radio">
              <input v-model="accessEmailType" type="radio" value="portal_access" @change="onAccessTypeChange" />
              Access your {{ agencyName }} portal
            </label>
          </div>

          <p class="ssa-confirm-copy">
            Do these settings look correct? Edit the copy or From address here before sending — you do not need to leave this page.
          </p>

          <dl class="ssa-access-meta">
            <dt>Sent by</dt>
            <dd>{{ accessSentBy }}</dd>
            <dt>Sent from</dt>
            <dd>
              <select v-model="accessSenderIdentityId" class="ssa-access-select">
                <option value="">Select a From identity…</option>
                <option
                  v-for="s in accessSenders"
                  :key="s.id"
                  :value="String(s.id)"
                >
                  {{ s.display_name || s.identity_key }} — {{ s.from_email }}
                </option>
              </select>
              <div class="muted ssa-set-meta">
                {{ selectedAccessSender?.from_email || 'Pick a tenant identity (notifications@) before sending.' }}
              </div>
            </dd>
            <dt>Recipients</dt>
            <dd>{{ selectedIds.size }} school staff · first send now, then one every {{ accessStaggerLabel }}</dd>
            <dt>Est. duration</dt>
            <dd>{{ accessEstimatedDuration }}</dd>
          </dl>

          <div v-if="!accessEditing" class="ssa-access-preview">
            <div class="ssa-access-preview-head">
              <strong>{{ accessSubject }}</strong>
              <button class="btn btn-secondary btn-sm" type="button" @click="accessEditing = true">Edit</button>
            </div>
            <pre class="ssa-access-body">{{ accessSampleBody }}</pre>
            <p class="muted ssa-set-meta">
              Reset links are generated when each email actually goes out. This preview (and test emails) use a placeholder with no token.
            </p>
          </div>
          <div v-else class="ssa-access-edit">
            <label class="ssa-bulk-field">
              <span>Subject</span>
              <input v-model="accessSubject" type="text" />
            </label>
            <label class="ssa-bulk-field">
              <span>Body</span>
              <textarea v-model="accessBody" rows="12" />
            </label>
            <p class="muted ssa-set-meta">
              Variables:
              <button
                v-for="token in ACCESS_TEMPLATE_VARS"
                :key="token"
                type="button"
                class="ssa-var"
                @click="insertAccessVariable(token)"
              >{{ token }}</button>
            </p>
            <div class="ssa-access-save-row">
              <label class="ssa-radio">
                <input v-model="accessSaveMode" type="radio" value="update" />
                Update this template
              </label>
              <label class="ssa-radio">
                <input v-model="accessSaveMode" type="radio" value="new" />
                Save as new template
              </label>
              <input
                v-if="accessSaveMode === 'new'"
                v-model.trim="accessTemplateName"
                type="text"
                placeholder="New template name"
              />
              <button class="btn btn-secondary btn-sm" type="button" :disabled="accessSavingTemplate" @click="saveAccessTemplate">
                {{ accessSavingTemplate ? 'Saving…' : 'Save template' }}
              </button>
              <button class="btn btn-secondary btn-sm" type="button" @click="doneAccessEditing">Done editing</button>
            </div>
          </div>

          <label class="ssa-bulk-field ssa-bulk-field--sm">
            <span>Stagger between emails</span>
            <select v-model="accessStaggerSeconds">
              <option value="10">10 seconds</option>
              <option value="15">15 seconds</option>
              <option value="30">30 seconds (recommended)</option>
              <option value="60">1 minute</option>
              <option value="120">2 minutes</option>
            </select>
          </label>
          <template v-if="accessEmailType === 'portal_access'">
            <label class="ssa-bulk-field">
              <span>Shared temp password (included in email)</span>
              <input
                v-model="accessTempPassword"
                type="text"
                autocomplete="off"
                placeholder="e.g. InTheSchools26"
              />
            </label>
            <label class="ssa-bulk-field ssa-bulk-field--sm">
              <span>Password expires in</span>
              <select v-model="accessTempPasswordExpiresHours">
                <option value="168">7 days</option>
                <option value="336">14 days</option>
                <option value="720">30 days</option>
              </select>
            </label>
            <p class="muted ssa-set-meta">
              Include
              <button type="button" class="ssa-var" @click="insertAccessVariable(TEMP_PASSWORD_TOKEN)">
                {{ TEMP_PASSWORD_TOKEN }}
              </button>
              in the email body, or add a line like <strong>Temp password: your-password</strong>. The password is saved to each account when their email sends.
            </p>
          </template>
          <p class="muted ssa-set-meta">
            30 seconds is the default so school district firewalls are less likely to flag a burst. Use 1 minute if you are sending a large list.
          </p>

          <div class="ssa-test-row">
            <label class="ssa-bulk-field">
              <span>Test email (no token attached)</span>
              <input v-model.trim="accessTestTo" type="email" placeholder="you@itsco.health" />
            </label>
            <button class="btn btn-secondary btn-sm" type="button" :disabled="accessTesting || !accessTestTo" @click="sendAccessTest">
              {{ accessTesting ? 'Sending test…' : 'Send test email' }}
            </button>
          </div>
          <p v-if="accessTestMsg" class="success">{{ accessTestMsg }}</p>
        </template>

        <div v-if="accessJob" class="ssa-access-progress">
          <strong>{{ accessJob.status === 'completed' ? 'Finished' : 'Sending…' }}</strong>
          {{ accessJob.sent_count || 0 }} sent · {{ accessJob.failed_count || 0 }} failed ·
          {{ accessJobRemaining }} remaining
          <span v-if="accessJob.status === 'completed'"> — done</span>
          <div v-if="accessSkippedCount" class="muted ssa-set-meta">
            {{ accessSkippedCount }} skipped (no email on file)
          </div>
          <div
            v-if="accessJob.status === 'completed' && accessEmailType === 'portal_access' && accessJob.sharedTemporaryPasswordConfigured && !accessJob.tempPasswordSynced"
            class="ssa-access-sync"
          >
            <p class="muted ssa-set-meta">
              This portal access email included a temp password. Sync it to staff accounts so they can log in and this page shows Sent / Expires (no new email).
            </p>
            <div class="ssa-sync-banner__actions">
              <input
                v-model="accessTempPassword"
                type="text"
                class="ssa-sync-password-input"
                placeholder="Temp password from email"
              />
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="passwordSyncSubmitting"
                @click="syncAccessJobPassword"
              >
                {{ passwordSyncSubmitting ? 'Syncing…' : 'Sync password to accounts' }}
              </button>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" type="button" :disabled="accessSubmitting" @click="closeAccessEmail">
            {{ accessJob ? 'Close' : 'Cancel' }}
          </button>
          <button
            v-if="!accessJob"
            class="btn btn-primary"
            type="button"
            :disabled="accessSubmitting || accessLoading || !accessSenderIdentityId"
            @click="confirmAccessSend"
          >
            {{ accessSubmitting ? 'Queuing…' : `Send to ${selectedIds.size}` }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showBulkConfirm" class="modal-overlay" @click.self="closeBulkConfirm">
      <div class="modal">
        <h2>Set temporary password</h2>
        <p>
          This will replace the current password for <strong>{{ selectedIds.size }}</strong> school staff member{{ selectedIds.size === 1 ? '' : 's' }}.
          The temporary password expires in <strong>{{ bulkExpiresLabel }}</strong>.
        </p>
        <p class="muted">You will share the password yourself (for example via BCC email).</p>
        <div v-if="bulkError" class="error">{{ bulkError }}</div>
        <div class="modal-actions">
          <button class="btn btn-secondary" type="button" :disabled="bulkSubmitting" @click="closeBulkConfirm">Cancel</button>
          <button class="btn btn-primary" type="button" :disabled="bulkSubmitting" @click="confirmBulkPassword">
            {{ bulkSubmitting ? 'Setting…' : 'Confirm and set password' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { getStatusBadgeClass, getStatusLabel } from '../../utils/statusUtils.js';

const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref('');
const staffRows = ref([]);
const search = ref('');
const schoolFilter = ref('');
const neverLoggedInOnly = ref(false);
const selectedIds = ref(new Set());
const bulkPassword = ref('');
const bulkExpiresInHours = ref('168');
const bulkSubmitting = ref(false);
const bulkError = ref('');
const showBulkConfirm = ref(false);
const showAccessEmail = ref(false);
const accessLoading = ref(false);
const accessSubmitting = ref(false);
const accessSavingTemplate = ref(false);
const accessTesting = ref(false);
const accessError = ref('');
const accessTestMsg = ref('');
const accessEmailType = ref('recovery');
const accessPreview = ref(null);
const accessSubject = ref('');
const accessBody = ref('');
const accessSenderIdentityId = ref('');
const accessEditing = ref(false);
const accessSaveMode = ref('update');
const accessTemplateName = ref('');
const accessStaggerSeconds = ref('30');
const accessTempPassword = ref('');
const accessTempPasswordExpiresHours = ref('168');
const accessTestTo = ref('');
const accessJob = ref(null);
const pendingPasswordSync = ref(null);
const pendingSyncPassword = ref('');
const passwordSyncSubmitting = ref(false);
const TEMP_PASSWORD_TOKEN = '{{TEMP_PASSWORD}}';
const ACCESS_TEMPLATE_VARS = [
  '{{FIRST_NAME}}',
  '{{USERNAME}}',
  '{{AGENCY_NAME}}',
  '{{PORTAL_LOGIN_LINK}}',
  '{{RESET_TOKEN_LINK}}',
  TEMP_PASSWORD_TOKEN,
  '{{SENDER_NAME}}'
];
let accessPollTimer = null;

const agencyName = computed(() => agencyStore.currentAgency?.name || agencyStore.currentAgency?.short_name || 'tenant');

const accessSenders = computed(() => accessPreview.value?.recommendedSenders || []);

const selectedAccessSender = computed(() => {
  const id = String(accessSenderIdentityId.value || '');
  return accessSenders.value.find((s) => String(s.id) === id) || accessPreview.value?.sender || null;
});

const accessSentBy = computed(() => {
  const u = authStore.user;
  const name = `${u?.first_name || ''} ${u?.last_name || ''}`.trim();
  return name || u?.email || 'You';
});

const accessStaggerLabel = computed(() => {
  const n = Number(accessStaggerSeconds.value || 30);
  if (n === 10) return '10 seconds';
  if (n === 15) return '15 seconds';
  if (n === 60) return '1 minute';
  if (n === 120) return '2 minutes';
  return '30 seconds';
});

const accessEstimatedDuration = computed(() => {
  const n = Math.max(0, selectedIds.value.size - 1);
  const seconds = n * Number(accessStaggerSeconds.value || 30);
  if (seconds < 60) return `${seconds || 0} seconds`;
  const mins = Math.ceil(seconds / 60);
  return `about ${mins} minute${mins === 1 ? '' : 's'}`;
});

const accessSampleBody = computed(() => accessPreview.value?.samplePreview?.body || accessBody.value);

const accessJobRemaining = computed(() => {
  const job = accessJob.value;
  if (!job) return 0;
  const total = Number(job.total_count || 0);
  const sent = Number(job.sent_count || 0);
  const failed = Number(job.failed_count || 0);
  return Math.max(0, total - sent - failed);
});

const accessSkippedCount = computed(() => {
  const skipped = accessJob.value?.skipped;
  return Array.isArray(skipped) ? skipped.length : Number(accessJob.value?.skipped_count || 0);
});
const orgSlug = computed(() => String(route.params.organizationSlug || '').trim());
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0));
const backTo = computed(() => (orgSlug.value ? `/${orgSlug.value}/school-operations` : '/school-operations'));

const schoolOptions = computed(() => {
  const map = new Map();
  for (const row of staffRows.value) {
    for (const school of row.schools || []) {
      if (school?.id && !map.has(school.id)) {
        map.set(school.id, { id: school.id, name: school.name || `School #${school.id}` });
      }
    }
  }
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
});

const filteredStaff = computed(() => {
  const q = search.value.toLowerCase();
  const schoolId = Number(schoolFilter.value || 0);
  return staffRows.value.filter((row) => {
    if (schoolId > 0 && !(row.schools || []).some((s) => Number(s.id) === schoolId)) return false;
    if (!q) return true;
    const name = staffName(row).toLowerCase();
    const email = String(row.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });
});

const allVisibleSelected = computed(() =>
  filteredStaff.value.length > 0 && filteredStaff.value.every((row) => selectedIds.value.has(row.id))
);

const someVisibleSelected = computed(() => {
  const count = filteredStaff.value.filter((row) => selectedIds.value.has(row.id)).length;
  return count > 0 && count < filteredStaff.value.length;
});

const canSubmitBulkPassword = computed(() =>
  selectedIds.value.size > 0 && String(bulkPassword.value || '').trim().length >= 6
);

const bulkExpiresLabel = computed(() => {
  const hours = Number(bulkExpiresInHours.value || 168);
  if (hours === 48) return '48 hours';
  if (hours === 72) return '72 hours';
  if (hours === 336) return '14 days';
  return '7 days';
});

const staffName = (row) => {
  const first = String(row?.first_name || '').trim();
  const last = String(row?.last_name || '').trim();
  const full = `${first} ${last}`.trim();
  return full || row?.email || 'Unnamed staff';
};

const statusLabel = (status) => getStatusLabel(status);
const statusBadgeClass = (status) => getStatusBadgeClass(status, true);

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString();
};

const toggleSelect = (userId) => {
  const next = new Set(selectedIds.value);
  if (next.has(userId)) next.delete(userId);
  else next.add(userId);
  selectedIds.value = next;
};

const toggleSelectAllVisible = () => {
  if (allVisibleSelected.value) {
    const next = new Set(selectedIds.value);
    for (const row of filteredStaff.value) next.delete(row.id);
    selectedIds.value = next;
    return;
  }
  const next = new Set(selectedIds.value);
  for (const row of filteredStaff.value) next.add(row.id);
  selectedIds.value = next;
};

const clearSelection = () => {
  selectedIds.value = new Set();
};

const resetFilters = () => {
  search.value = '';
  schoolFilter.value = '';
  neverLoggedInOnly.value = false;
  void loadStaff();
};

const loadStaff = async () => {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const params = {};
    if (neverLoggedInOnly.value) params.neverLoggedIn = '1';
    const response = await api.get(`/agencies/${agencyId.value}/school-staff/accounts`, { params });
    staffRows.value = Array.isArray(response?.data) ? response.data : [];
    const validIds = new Set(staffRows.value.map((row) => row.id));
    selectedIds.value = new Set([...selectedIds.value].filter((id) => validIds.has(id)));
  } catch (err) {
    error.value = err?.response?.data?.error?.message || 'Failed to load school staff accounts';
  } finally {
    loading.value = false;
  }
};

const openBulkConfirm = () => {
  bulkError.value = '';
  showBulkConfirm.value = true;
};

const closeBulkConfirm = () => {
  if (bulkSubmitting.value) return;
  showBulkConfirm.value = false;
  bulkError.value = '';
};

const confirmBulkPassword = async () => {
  if (!agencyId.value || !canSubmitBulkPassword.value) return;
  bulkSubmitting.value = true;
  bulkError.value = '';
  try {
    const response = await api.post(`/agencies/${agencyId.value}/school-staff/accounts/bulk-temporary-password`, {
      userIds: [...selectedIds.value],
      temporaryPassword: String(bulkPassword.value || '').trim(),
      expiresInHours: Number(bulkExpiresInHours.value || 168)
    });
    const results = Array.isArray(response?.data?.results) ? response.data.results : [];
    const failed = results.filter((row) => !row.ok);
    if (failed.length) {
      bulkError.value = `${failed.length} account${failed.length === 1 ? '' : 's'} could not be updated.`;
      await loadStaff();
      return;
    }
    selectedIds.value = new Set();
    bulkPassword.value = '';
    showBulkConfirm.value = false;
    await loadStaff();
  } catch (err) {
    bulkError.value = err?.response?.data?.error?.message || 'Failed to set temporary passwords';
  } finally {
    bulkSubmitting.value = false;
  }
};

const stopAccessPoll = () => {
  if (accessPollTimer) {
    clearInterval(accessPollTimer);
    accessPollTimer = null;
  }
};

const applyAccessPreview = (preview) => {
  accessPreview.value = preview;
  if (!accessEditing.value) {
    accessSubject.value = preview?.template?.subject || '';
    accessBody.value = preview?.template?.body || '';
    accessTemplateName.value = preview?.template?.name || '';
  }
  if (preview?.detectedTemporaryPassword && !accessTempPassword.value) {
    accessTempPassword.value = preview.detectedTemporaryPassword;
  }
  if (preview?.sender?.id && !accessSenderIdentityId.value) {
    accessSenderIdentityId.value = String(preview.sender.id);
  }
};

const onAccessTypeChange = () => {
  accessEditing.value = false;
  accessTestMsg.value = '';
  void loadAccessPreview();
};

const doneAccessEditing = () => {
  accessEditing.value = false;
  void loadAccessPreview(true);
};

const loadAccessPreview = async (includeEdits = false) => {
  if (!agencyId.value) return;
  accessLoading.value = true;
  accessError.value = '';
  try {
    const response = await api.post(`/agencies/${agencyId.value}/school-staff/accounts/access-email/preview`, {
      emailType: accessEmailType.value,
      userIds: [...selectedIds.value],
      subject: (includeEdits || accessEditing.value) ? accessSubject.value : undefined,
      body: (includeEdits || accessEditing.value) ? accessBody.value : undefined,
      senderIdentityId: accessSenderIdentityId.value || undefined,
      temporaryPassword: accessEmailType.value === 'portal_access' ? accessTempPassword.value : undefined
    });
    applyAccessPreview(response.data);
  } catch (err) {
    accessError.value = err?.response?.data?.error?.message || 'Failed to load email preview';
  } finally {
    accessLoading.value = false;
  }
};

const openAccessEmail = async () => {
  accessJob.value = null;
  accessEditing.value = false;
  accessError.value = '';
  accessTestMsg.value = '';
  accessSaveMode.value = 'update';
  showAccessEmail.value = true;
  await loadAccessPreview();
};

const closeAccessEmail = () => {
  showAccessEmail.value = false;
  stopAccessPoll();
};

const insertAccessVariable = (token) => {
  accessBody.value = `${accessBody.value || ''}${accessBody.value ? ' ' : ''}${token}`;
};

const saveAccessTemplate = async () => {
  if (!agencyId.value) return;
  accessSavingTemplate.value = true;
  accessError.value = '';
  try {
    await api.post(`/agencies/${agencyId.value}/school-staff/accounts/access-email/template`, {
      emailType: accessEmailType.value,
      name: accessTemplateName.value,
      subject: accessSubject.value,
      body: accessBody.value,
      saveMode: accessSaveMode.value
    });
    await loadAccessPreview(true);
    accessTestMsg.value = accessSaveMode.value === 'new' ? 'Saved as a new template.' : 'Template updated.';
  } catch (err) {
    accessError.value = err?.response?.data?.error?.message || 'Failed to save template';
  } finally {
    accessSavingTemplate.value = false;
  }
};

const sendAccessTest = async () => {
  if (!agencyId.value || !accessTestTo.value) return;
  accessTesting.value = true;
  accessError.value = '';
  accessTestMsg.value = '';
  try {
    const result = await api.post(`/agencies/${agencyId.value}/school-staff/accounts/access-email/test`, {
      emailType: accessEmailType.value,
      to: accessTestTo.value,
      subject: accessSubject.value,
      body: accessBody.value,
      senderIdentityId: accessSenderIdentityId.value || undefined,
      sampleUserId: [...selectedIds.value][0] || undefined
    });
    if (result?.data?.queued) {
      accessTestMsg.value = `Test was queued for Communications approval instead of sending. Check the From identity.`;
    } else {
      accessTestMsg.value = `Test sent to ${accessTestTo.value} with no reset token.`;
    }
  } catch (err) {
    accessError.value = err?.response?.data?.error?.message || 'Failed to send test email';
  } finally {
    accessTesting.value = false;
  }
};

const loadPendingPasswordSync = async () => {
  if (!agencyId.value) return;
  try {
    const response = await api.get(`/agencies/${agencyId.value}/school-staff/accounts/access-email/pending-password-sync`);
    pendingPasswordSync.value = response?.data || { pending: false };
    if (pendingPasswordSync.value?.pending && !pendingSyncPassword.value) {
      pendingSyncPassword.value = accessTempPassword.value || '';
    }
  } catch {
    pendingPasswordSync.value = { pending: false };
  }
};

const syncPortalPasswordSend = async (sendId, password) => {
  if (!agencyId.value || !sendId) return;
  passwordSyncSubmitting.value = true;
  accessError.value = '';
  try {
    const response = await api.post(
      `/agencies/${agencyId.value}/school-staff/accounts/access-email/sends/${sendId}/sync-temporary-password`,
      {
        temporaryPassword: String(password || '').trim() || undefined,
        expiresInHours: Number(accessTempPasswordExpiresHours.value || pendingPasswordSync.value?.expiresInHours || 168)
      }
    );
    const failed = Array.isArray(response?.data?.results)
      ? response.data.results.filter((row) => !row.ok)
      : [];
    if (failed.length) {
      accessError.value = `${failed.length} account${failed.length === 1 ? '' : 's'} could not be synced.`;
    } else {
      accessTestMsg.value = 'Temp password synced to staff accounts. No new emails were sent.';
    }
    await Promise.all([loadStaff(), loadPendingPasswordSync()]);
    if (accessJob.value?.id === sendId) {
      accessJob.value = { ...accessJob.value, tempPasswordSynced: true };
    }
  } catch (err) {
    accessError.value = err?.response?.data?.error?.message || 'Failed to sync temporary password';
  } finally {
    passwordSyncSubmitting.value = false;
  }
};

const syncPendingPortalPassword = async () => {
  if (!pendingPasswordSync.value?.sendId) return;
  await syncPortalPasswordSend(pendingPasswordSync.value.sendId, pendingSyncPassword.value);
};

const syncAccessJobPassword = async () => {
  if (!accessJob.value?.id) return;
  await syncPortalPasswordSend(accessJob.value.id, accessTempPassword.value);
};

const pollAccessJob = async (sendId) => {
  if (!agencyId.value || !sendId) return;
  try {
    const response = await api.get(`/agencies/${agencyId.value}/school-staff/accounts/access-email/sends/${sendId}`);
    accessJob.value = {
      ...response.data,
      skipped: accessJob.value?.skipped || response.data.skipped || []
    };
    if (String(response.data?.status || '') === 'completed') {
      stopAccessPoll();
      await loadPendingPasswordSync();
    }
  } catch {
    // keep last snapshot
  }
};

const confirmAccessSend = async () => {
  if (!agencyId.value) return;
  accessSubmitting.value = true;
  accessError.value = '';
  try {
    const response = await api.post(`/agencies/${agencyId.value}/school-staff/accounts/access-email/send`, {
      emailType: accessEmailType.value,
      userIds: [...selectedIds.value],
      subject: accessSubject.value,
      body: accessBody.value,
      senderIdentityId: accessSenderIdentityId.value || undefined,
      staggerSeconds: Number(accessStaggerSeconds.value || 30),
      temporaryPassword: accessEmailType.value === 'portal_access' ? accessTempPassword.value : undefined,
      expiresInHours: accessEmailType.value === 'portal_access'
        ? Number(accessTempPasswordExpiresHours.value || 168)
        : undefined,
      saveTemplate: accessEditing.value
        ? { mode: accessSaveMode.value, name: accessTemplateName.value }
        : null
    });
    accessJob.value = {
      id: response.data.sendId,
      status: 'queued',
      total_count: response.data.totalCount,
      sent_count: 0,
      failed_count: 0,
      skipped: response.data.skipped || []
    };
    const skippedN = Array.isArray(response.data.skipped) ? response.data.skipped.length : 0;
    accessTestMsg.value = `Queued ${response.data.totalCount} emails from ${response.data.fromEmail}, one every ${accessStaggerLabel.value}.${skippedN ? ` ${skippedN} skipped.` : ''}`;
    stopAccessPoll();
    accessPollTimer = setInterval(() => pollAccessJob(response.data.sendId), 4000);
    await pollAccessJob(response.data.sendId);
  } catch (err) {
    accessError.value = err?.response?.data?.error?.message || 'Failed to queue account access emails';
  } finally {
    accessSubmitting.value = false;
  }
};

watch(agencyId, (id) => {
  if (id) {
    void loadStaff();
    void loadPendingPasswordSync();
  }
});

onMounted(async () => {
  try {
    if (String(authStore.user?.role || '').toLowerCase() !== 'super_admin') {
      await agencyStore.fetchUserAgencies();
    }
  } catch {
    // ignore
  }
  if (agencyId.value) {
    await Promise.all([loadStaff(), loadPendingPasswordSync()]);
  }
});

onUnmounted(() => {
  stopAccessPoll();
});
</script>

<style scoped>
.ssa-sync-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  justify-content: space-between;
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  border-radius: 10px;
}

.ssa-sync-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.ssa-sync-password-input {
  min-width: 220px;
  padding: 6px 8px;
}

.ssa-access-sync {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #6ee7b7;
}

.ssa-access-modal {
  max-width: 720px;
  width: min(720px, 94vw);
  max-height: 90vh;
  overflow: auto;
}
.ssa-access-type,
.ssa-access-save-row,
.ssa-test-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin: 12px 0;
}
.ssa-radio {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.ssa-access-meta {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 8px 12px;
}
.ssa-access-meta dt { color: #6b7280; }
.ssa-access-meta dd { margin: 0; }
.ssa-access-select { width: 100%; max-width: 420px; padding: 6px 8px; }
.ssa-access-preview,
.ssa-access-edit {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  margin: 12px 0;
  background: #f8fafc;
}
.ssa-access-preview-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: start;
  margin-bottom: 8px;
}
.ssa-access-body {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 0.92rem;
  margin: 0;
}
.ssa-access-edit textarea {
  width: 100%;
  font-family: inherit;
  padding: 8px;
}
.ssa-access-progress {
  margin-top: 12px;
  padding: 10px 12px;
  background: #ecfdf5;
  border: 1px solid #6ee7b7;
  border-radius: 8px;
}

.ssa-confirm-copy {
  margin: 8px 0 12px;
  font-size: 0.92rem;
}

.success {
  color: #047857;
  margin: 8px 0;
  font-size: 0.875rem;
}

.ssa-page .page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.ssa-sub {
  margin: 6px 0 0;
  max-width: 720px;
}

.filters-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 180px;
}

.filter-group-check {
  justify-content: flex-end;
}

.filter-group-actions {
  justify-content: flex-end;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.92rem;
}

.ssa-filter-hint {
  font-size: 0.82rem;
  margin-top: 4px;
}

.ssa-bulk-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
  border: 1px solid #dbeafe;
  background: #eff6ff;
  border-radius: 10px;
}

.ssa-bulk-copy {
  align-self: center;
  min-width: 90px;
}

.ssa-bulk-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
}

.ssa-bulk-field--sm {
  min-width: 140px;
}

.ssa-note {
  margin: 0 0 14px;
  font-size: 0.92rem;
}

.ssa-never-login {
  color: #b45309;
  font-weight: 600;
}
.ssa-has-pw {
  color: #047857;
  font-size: 0.82rem;
  font-weight: 500;
}

.ssa-temp-cell {
  min-width: 190px;
}

.ssa-temp-line {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 0.88rem;
  line-height: 1.35;
}

.ssa-temp-line + .ssa-temp-line {
  margin-top: 4px;
}

.ssa-temp-label {
  min-width: 52px;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.ssa-temp-active {
  color: #047857;
  font-weight: 600;
}

.ssa-temp-expired {
  color: #b91c1c;
  font-weight: 600;
}

.ssa-set-meta {
  font-size: 0.82rem;
  margin-top: 2px;
}
.ssa-var {
  border: 1px solid #dbeafe;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  margin-right: 4px;
  margin-top: 4px;
}

.col-check {
  width: 42px;
}

.row-selected {
  background: #f8fafc;
}

.empty-row {
  text-align: center;
  color: #64748b;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.18);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
