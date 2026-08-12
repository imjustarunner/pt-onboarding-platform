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
        <button class="btn btn-secondary btn-sm" type="button" @click="clearSelection">Clear selection</button>
      </div>

      <p class="ssa-note muted">
        Only staff without a permanent password can be selected (🔒 = already logged in and set their own). Setting a temporary password replaces their current one immediately — share it privately so they can sign in and set their own.
      </p>

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
                  v-if="!staff.has_permanent_password"
                  type="checkbox"
                  :checked="selectedIds.has(staff.id)"
                  @change="toggleSelect(staff.id)"
                />
                <span v-else class="ssa-pw-lock" title="Has permanent password — cannot receive a temporary password">🔒</span>
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
              <td>
                <span v-if="staff.temporary_password_status === 'active'" class="ssa-temp-active">
                  Active until {{ formatDateTime(staff.temporary_password_expires_at) }}
                </span>
                <span v-else-if="staff.temporary_password_status === 'expired'" class="ssa-temp-expired">
                  Expired {{ formatDateTime(staff.temporary_password_expires_at) }}
                </span>
                <span v-else class="muted">None</span>
              </td>
              <td>
                <template v-if="staff.temporary_password_set_by_label || staff.temporary_password_set_at">
                  <div>{{ staff.temporary_password_set_by_label || 'Unknown' }}</div>
                  <div v-if="staff.temporary_password_set_at" class="muted ssa-set-meta">
                    {{ formatDateTime(staff.temporary_password_set_at) }}
                  </div>
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
import { computed, onMounted, ref, watch } from 'vue';
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

const selectableStaff = computed(() => filteredStaff.value.filter((row) => !row.has_permanent_password));

const allVisibleSelected = computed(() =>
  selectableStaff.value.length > 0 && selectableStaff.value.every((row) => selectedIds.value.has(row.id))
);

const someVisibleSelected = computed(() => {
  const count = selectableStaff.value.filter((row) => selectedIds.value.has(row.id)).length;
  return count > 0 && count < selectableStaff.value.length;
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

const staffById = computed(() => {
  const map = {};
  for (const s of staffList.value) map[s.id] = s;
  return map;
});

const toggleSelect = (userId) => {
  if (staffById.value[userId]?.has_permanent_password) return;
  const next = new Set(selectedIds.value);
  if (next.has(userId)) next.delete(userId);
  else next.add(userId);
  selectedIds.value = next;
};

const toggleSelectAllVisible = () => {
  if (allVisibleSelected.value) {
    const next = new Set(selectedIds.value);
    for (const row of selectableStaff.value) next.delete(row.id);
    selectedIds.value = next;
    return;
  }
  const next = new Set(selectedIds.value);
  for (const row of selectableStaff.value) next.add(row.id);
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

watch(agencyId, (id) => {
  if (id) void loadStaff();
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
    await loadStaff();
  }
});
</script>

<style scoped>
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
.ssa-pw-lock {
  font-size: 1rem;
  cursor: default;
  opacity: 0.65;
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
