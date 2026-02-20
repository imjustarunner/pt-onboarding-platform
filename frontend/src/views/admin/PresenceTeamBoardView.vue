<template>
  <div class="presence-page">
    <div class="page-header">
      <div>
        <h1>Presence / Team Board</h1>
        <p class="page-description">
          See who is in, out, or traveling.
        </p>
      </div>
      <div class="header-actions">
        <select
          v-if="isAdmin && adminAgencies.length > 1"
          v-model="adminSelectedAgencyId"
          class="filter-select"
          aria-label="Select agency"
          @change="fetchPresence"
        >
          <option value="">Select agency…</option>
          <option v-for="a in adminAgencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
        <input
          v-model="searchQuery"
          type="search"
          class="search-input"
          placeholder="Search by name..."
          aria-label="Search people"
        />
        <select v-if="isSuperAdmin" v-model="agencyFilter" class="filter-select" aria-label="Filter by agency">
          <option value="">All agencies</option>
          <option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
        <select v-model="statusFilter" class="filter-select" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="__none__">No status set</option>
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <select v-model="sortBy" class="filter-select" aria-label="Sort by">
          <option value="name">Sort: Name</option>
          <option value="status">Sort: Status</option>
          <option value="since">Sort: Since</option>
        </select>
        <select v-model="sortOrder" class="filter-select sort-order" aria-label="Sort order">
          <option value="asc">A–Z / Oldest</option>
          <option value="desc">Z–A / Newest</option>
        </select>
        <button class="btn btn-secondary" type="button" @click="refresh" :disabled="loading">
          Refresh
        </button>
      </div>
    </div>

    <!-- Bulk actions (SuperAdmin only) -->
    <div v-if="isSuperAdmin && selectedIds.size > 0" class="bulk-bar">
      <span class="bulk-count">{{ selectedIds.size }} selected</span>
      <select v-model="bulkStatus" class="filter-select">
        <option value="">Set status to…</option>
        <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <button class="btn btn-primary" type="button" :disabled="!bulkStatus || bulkSaving" @click="applyBulk">
        {{ bulkSaving ? 'Applying…' : 'Apply' }}
      </button>
      <button class="btn btn-secondary" type="button" @click="clearSelection">Clear selection</button>
    </div>

    <div v-if="!canAccess" class="access-denied">
      <p>Access denied. Enable Presence in your agency's Features to view the Team Board.</p>
    </div>

    <div v-else>
      <div v-if="error" class="error">{{ error }}</div>
      <div v-else-if="loading" class="loading">Loading...</div>

      <div v-else class="panel">
        <table class="team-board-table">
          <thead>
            <tr>
              <th v-if="isSuperAdmin" class="select-cell">
                <input
                  type="checkbox"
                  :checked="selectedIds.size > 0 && selectedIds.size === filteredPeople.length"
                  :indeterminate="selectedIds.size > 0 && selectedIds.size < filteredPeople.length"
                  @change="toggleSelectAll"
                  aria-label="Select all"
                />
              </th>
              <th>Photo</th>
              <th>Name</th>
              <th>Status</th>
              <th>Return / Note</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredPeople.length === 0" class="empty-row">
              <td :colspan="isSuperAdmin ? 6 : 5" class="empty-cell">
                {{ people.length === 0 ? 'No users found.' : 'No matches for the current filters.' }}
              </td>
            </tr>
            <tr v-for="person in sortedPeople" :key="person.id" class="person-row">
              <td class="select-cell">
                <input
                  v-if="isSuperAdmin"
                  type="checkbox"
                  :checked="selectedIds.has(person.id)"
                  @change="toggleSelect(person.id)"
                  :aria-label="`Select ${person.display_name}`"
                />
              </td>
              <td class="avatar-cell">
                <div class="avatar" :class="{ 'has-photo': person.profile_photo_url }">
                  <img
                    v-if="person.profile_photo_url"
                    :src="avatarUrl(person.profile_photo_url)"
                    :alt="person.display_name"
                    class="avatar-img"
                    loading="lazy"
                  />
                  <span v-else class="avatar-initial">{{ avatarInitial(person) }}</span>
                </div>
              </td>
              <td class="name-cell">
                <span class="display-name">{{ person.display_name }}</span>
                <span class="role-badge">{{ person.role }}</span>
              </td>
              <td class="status-cell">
                <span class="status-indicator" :class="statusIndicatorClass(person.presence_status)" :title="statusLabel(person.presence_status)" />
                <select
                  v-if="isSuperAdmin"
                  :value="person.presence_status || ''"
                  class="status-select"
                  @change="onStatusChange(person, $event)"
                  :disabled="savingId === person.id"
                >
                  <option value="">— No status —</option>
                  <option
                    v-for="opt in statusOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
                <span v-else class="status-readonly">{{ statusLabel(person.presence_status) || '—' }}</span>
              </td>
              <td class="note-cell">
                <template v-if="person.presence_status === 'out_quick'">
                  <span v-if="person.presence_note" class="note-text">{{ person.presence_note }}</span>
                  <span v-else-if="person.presence_expected_return_at" class="note-text" :class="{ overdue: isOverdue(person.presence_expected_return_at) }">
                    Back {{ formatReturnTime(person.presence_expected_return_at) }}
                    <span v-if="isOverdue(person.presence_expected_return_at)" class="overdue-badge">Overdue</span>
                    <button
                      v-if="isSuperAdmin && isOverdue(person.presence_expected_return_at)"
                      type="button"
                      class="btn-nudge"
                      :disabled="nudgingId === person.id"
                      @click="nudge(person)"
                    >
                      Nudge
                    </button>
                  </span>
                  <span v-else class="muted">—</span>
                </template>
                <template v-else>
                  <span v-if="person.presence_note" class="note-text">{{ person.presence_note }}</span>
                  <span v-else class="muted">—</span>
                </template>
              </td>
              <td class="since-cell">
                <template v-if="person.presence_started_at">
                  <span v-if="isFuture(person.presence_started_at)" class="upcoming-badge">Upcoming</span>
                  <span class="since-text">{{ formatSince(person.presence_started_at) }}</span>
                </template>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const user = computed(() => authStore.user);
const isSuperAdmin = computed(
  () => String(user.value?.role || '').toLowerCase() === 'super_admin'
);
const isAdmin = computed(
  () => String(user.value?.role || '').toLowerCase() === 'admin'
);
const canAccess = computed(() => isSuperAdmin.value || isAdmin.value);

const loading = ref(true);
const error = ref('');
const people = ref([]);
const savingId = ref(null);
const nudgingId = ref(null);
const searchQuery = ref('');
const statusFilter = ref('');
const agencyFilter = ref('');
const agencies = ref([]);
const adminAgencies = ref([]);
const adminSelectedAgencyId = ref('');
const sortBy = ref('name');
const sortOrder = ref('asc');
const selectedIds = ref(new Set());
const bulkStatus = ref('');
const bulkSaving = ref(false);

const filteredPeople = computed(() => {
  let list = people.value || [];
  const q = String(searchQuery.value || '').trim().toLowerCase();
  if (q) {
    list = list.filter((p) => {
      const name = String((p.display_name || '') + ' ' + (p.first_name || '') + ' ' + (p.last_name || '') + ' ' + (p.email || '')).toLowerCase();
      return name.includes(q);
    });
  }
  const f = statusFilter.value;
  if (f) {
    if (f === '__none__') {
      list = list.filter((p) => !p.presence_status);
    } else {
      list = list.filter((p) => (p.presence_status || '') === f);
    }
  }
  const aid = agencyFilter.value ? parseInt(agencyFilter.value, 10) : null;
  if (aid) {
    list = list.filter((p) => (p.agency_ids || []).includes(aid));
  }
  return list;
});

const sortedPeople = computed(() => {
  const list = [...(filteredPeople.value || [])];
  const by = sortBy.value || 'name';
  const order = sortOrder.value || 'asc';
  const mult = order === 'asc' ? 1 : -1;

  list.sort((a, b) => {
    if (by === 'name') {
      const na = String(a.display_name || '').toLowerCase();
      const nb = String(b.display_name || '').toLowerCase();
      return mult * na.localeCompare(nb);
    }
    if (by === 'status') {
      const sa = statusLabel(a.presence_status) || '~';
      const sb = statusLabel(b.presence_status) || '~';
      return mult * sa.localeCompare(sb);
    }
    if (by === 'since') {
      const ta = a.presence_started_at ? new Date(a.presence_started_at).getTime() : 0;
      const tb = b.presence_started_at ? new Date(b.presence_started_at).getTime() : 0;
      return mult * (ta - tb);
    }
    return 0;
  });
  return list;
});

const statusOptions = [
  { value: 'in_available', label: 'In – Available' },
  { value: 'in_heads_down', label: 'In – Heads Down' },
  { value: 'in_available_for_phone', label: 'In – Available for Phone' },
  { value: 'out_quick', label: 'Out – Quick (Under 90 min)' },
  { value: 'out_am', label: 'Out – AM' },
  { value: 'out_pm', label: 'Out – PM' },
  { value: 'out_full_day', label: 'Out – Full Day' },
  { value: 'traveling_offsite', label: 'Traveling / Offsite' }
];

const avatarUrl = (rel) => toUploadsUrl(rel);

const avatarInitial = (p) => {
  const f = String(p.first_name || '').trim();
  const l = String(p.last_name || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || '?';
};

const statusIndicatorClass = (status) => {
  if (!status) return 'indicator-none';
  if (['in_available', 'in_heads_down', 'in_available_for_phone'].includes(status)) return 'indicator-in';
  if (status === 'out_quick') return 'indicator-out-quick';
  if (status === 'traveling_offsite') return 'indicator-traveling';
  if (['out_am', 'out_pm', 'out_full_day'].includes(status)) return 'indicator-out';
  return 'indicator-none';
};

const statusLabel = (status) => {
  const opt = statusOptions.find((o) => o.value === status);
  return opt ? opt.label : '';
};

const formatReturnTime = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(iso);
  }
};

const isFuture = (iso) => {
  if (!iso) return false;
  try {
    return new Date(iso) > new Date();
  } catch {
    return false;
  }
};

const isOverdue = (expectedReturnAt) => {
  if (!expectedReturnAt) return false;
  try {
    return new Date(expectedReturnAt) < new Date();
  } catch {
    return false;
  }
};

const formatSince = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(iso);
  }
};

const fetchPresence = async (showLoading = true) => {
  try {
    if (showLoading) loading.value = true;
    error.value = '';
    let agencyId = agencyStore.currentAgency?.id || agencyStore.currentAgency?.value;
    if (isAdmin.value && adminSelectedAgencyId.value) {
      agencyId = parseInt(adminSelectedAgencyId.value, 10);
    } else if (isAdmin.value && adminAgencies.value.length === 1) {
      agencyId = adminAgencies.value[0]?.id;
    }
    const url = isSuperAdmin.value
      ? '/presence'
      : (agencyId ? `/presence/agency/${agencyId}/team` : '/presence');
    const res = await api.get(url);
    people.value = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load presence';
    people.value = [];
  } finally {
    loading.value = false;
  }
};

const parseReturnTime = (input) => {
  const s = String(input || '').trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const meridiem = (m[3] || '').toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};

const parseDateInput = (input) => {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (s === 'today') return today;
  if (s === 'tomorrow') {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const onStatusChange = async (person, event) => {
  const newStatus = event.target?.value || '';
  if (!newStatus) return;

  const payload = { status: newStatus };
  if (newStatus === 'out_quick') {
    const ret = prompt('Expected return time (e.g. 2:15 PM). Must be within 90 minutes:');
    if (!ret) {
      event.target.value = person.presence_status || '';
      return;
    }
    const parsed = parseReturnTime(ret);
    if (parsed) {
      const now = new Date();
      const mins = (new Date(parsed) - now) / (60 * 1000);
      if (mins > 90) {
        error.value = 'Out – Quick return time must be within 90 minutes of now';
        event.target.value = person.presence_status || '';
        return;
      }
      payload.expected_return_at = parsed;
    } else {
      payload.note = ret;
    }
    const note = prompt('Optional note (e.g. "Errand", "Appointment"):');
    if (note && note.trim()) payload.note = payload.note ? `${payload.note} – ${note.trim()}` : note.trim();
  } else if (['out_am', 'out_pm', 'out_full_day', 'traveling_offsite'].includes(newStatus)) {
    const dateInput = prompt('For which date? (today, tomorrow, or YYYY-MM-DD). Leave blank for today:');
    const d = dateInput ? parseDateInput(dateInput) : new Date();
    if (d) {
      const start = new Date(d);
      const end = new Date(d);
      if (newStatus === 'out_full_day') {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else if (newStatus === 'out_am') {
        start.setHours(8, 0, 0, 0);
        end.setHours(12, 0, 0, 0);
      } else if (newStatus === 'out_pm') {
        start.setHours(12, 0, 0, 0);
        end.setHours(17, 0, 0, 0);
      } else {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      }
      payload.started_at = start.toISOString();
      payload.ends_at = end.toISOString();
    }
    const note = prompt('Optional note (e.g. "Travel day", "Appointment"):');
    if (note && note.trim()) payload.note = note.trim();
  } else {
    const note = prompt('Optional note (e.g. "Travel day", "Appointment"):');
    if (note && note.trim()) payload.note = note.trim();
  }

  try {
    savingId.value = person.id;
    await api.put(`/presence/status/${person.id}`, payload);
    await fetchPresence();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update status';
  } finally {
    savingId.value = null;
  }
};

const refresh = () => fetchPresence();

const nudge = async (person) => {
  if (!person?.id || !isOverdue(person.presence_expected_return_at)) return;
  try {
    nudgingId.value = person.id;
    await api.post(`/presence/status/${person.id}/nudge`);
    error.value = '';
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to send nudge';
  } finally {
    nudgingId.value = null;
  }
};

const toggleSelect = (id) => {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
};

const toggleSelectAll = () => {
  if (selectedIds.value.size === filteredPeople.value.length) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(filteredPeople.value.map((p) => p.id));
  }
};

const clearSelection = () => {
  selectedIds.value = new Set();
};

const applyBulk = async () => {
  const status = bulkStatus.value;
  if (!status || selectedIds.value.size === 0) return;

  let payload = { userIds: Array.from(selectedIds.value), status };
  if (status === 'out_quick') {
    const ret = prompt('Expected return time for all (e.g. 2:15 PM):');
    if (!ret) return;
    const parsed = parseReturnTime(ret);
    if (parsed) {
      payload.expected_return_at = parsed;
    } else {
      payload.note = ret;
    }
    const now = new Date();
    const mins = parsed ? (new Date(parsed) - now) / (60 * 1000) : 0;
    if (parsed && mins > 90) {
      error.value = 'Out – Quick return time must be within 90 minutes of now';
      return;
    }
  } else if (['out_am', 'out_pm', 'out_full_day', 'traveling_offsite'].includes(status)) {
    const dateInput = prompt('For which date? (today, tomorrow, or YYYY-MM-DD). Leave blank for today:');
    const d = dateInput ? parseDateInput(dateInput) : new Date();
    if (d) {
      const start = new Date(d);
      const end = new Date(d);
      if (status === 'out_full_day' || status === 'traveling_offsite') {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
      } else if (status === 'out_am') {
        start.setHours(8, 0, 0, 0);
        end.setHours(12, 0, 0, 0);
      } else {
        start.setHours(12, 0, 0, 0);
        end.setHours(17, 0, 0, 0);
      }
      payload.started_at = start.toISOString();
      payload.ends_at = end.toISOString();
    }
  }

  try {
    bulkSaving.value = true;
    error.value = '';
    await api.post('/presence/bulk-update', payload);
    clearSelection();
    bulkStatus.value = '';
    await fetchPresence();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update';
  } finally {
    bulkSaving.value = false;
  }
};

const fetchAgencies = async () => {
  try {
    const res = await api.get('/agencies');
    agencies.value = Array.isArray(res.data) ? res.data.filter((a) => a.organization_type === 'agency') : [];
  } catch {
    agencies.value = [];
  }
};

const fetchAdminAgencies = async () => {
  try {
    const res = await api.get('/users/me/agencies');
    const list = Array.isArray(res.data) ? res.data : [];
    adminAgencies.value = list.filter((a) => a.organization_type === 'agency');
    if (adminAgencies.value.length === 1 && !adminSelectedAgencyId.value) {
      adminSelectedAgencyId.value = String(adminAgencies.value[0].id);
    }
  } catch {
    adminAgencies.value = [];
  }
};

const POLL_INTERVAL_MS = 15 * 1000; // 15 seconds for more real-time updates
let pollTimer = null;

const onVisibilityChange = () => {
  if (document.visibilityState === 'visible' && canAccess.value) {
    fetchPresence(false);
  }
};

onMounted(async () => {
  if (canAccess.value) {
    if (isSuperAdmin.value) {
      await fetchAgencies();
    } else if (isAdmin.value) {
      await fetchAdminAgencies();
    }
    fetchPresence(true);
    pollTimer = setInterval(() => fetchPresence(false), POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
});

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<style scoped>
.presence-page {
  padding: 24px;
  max-width: 900px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.page-description {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.header-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search-input {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  font-size: 0.9rem;
  min-width: 160px;
}

.filter-select {
  padding: 6px 28px 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  font-size: 0.9rem;
  min-width: 180px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.access-denied {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}

.bulk-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-alt);
  border-radius: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.bulk-count {
  font-weight: 600;
  color: var(--text-primary);
}

.select-cell {
  width: 40px;
  padding: 12px 8px !important;
}

.select-cell input[type="checkbox"] {
  cursor: pointer;
}

.sort-order {
  min-width: 140px;
}

.panel {
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.team-board-table {
  width: 100%;
  border-collapse: collapse;
}

.team-board-table th,
.team-board-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.team-board-table th {
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.team-board-table tbody tr:last-child td {
  border-bottom: none;
}

.avatar-cell {
  width: 56px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initial {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-secondary);
}

.name-cell {
  min-width: 160px;
}

.display-name {
  font-weight: 600;
  color: var(--text-primary);
}

.role-badge {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

.status-cell {
  min-width: 220px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-indicator.indicator-in {
  background: #22c55e;
}

.status-indicator.indicator-out-quick {
  background: #eab308;
}

.status-indicator.indicator-traveling {
  background: #3b82f6;
}

.status-indicator.indicator-out {
  background: #ef4444;
}

.status-indicator.indicator-none {
  background: var(--border);
}

.status-select {
  padding: 6px 28px 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: white;
  font-size: 0.9rem;
  min-width: 200px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.status-readonly {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.note-cell {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.note-text {
  color: var(--text-primary);
}

.since-cell {
  font-size: 0.85rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.since-text {
  color: var(--text-secondary);
}

.muted {
  color: var(--text-secondary);
  font-style: italic;
}

.overdue .overdue-badge {
  margin-left: 6px;
  font-size: 0.75rem;
  color: var(--danger);
  font-weight: 600;
}

.btn-nudge {
  margin-left: 8px;
  padding: 2px 8px;
  font-size: 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--primary);
  background: var(--primary);
  color: white;
  cursor: pointer;
}

.btn-nudge:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-nudge:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.empty-row .empty-cell {
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
}

.upcoming-badge {
  display: inline-block;
  margin-right: 6px;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-alt);
  color: var(--text-secondary);
  font-weight: 600;
}

.error {
  color: var(--danger);
  padding: 16px;
}

.loading {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary);
}
</style>
