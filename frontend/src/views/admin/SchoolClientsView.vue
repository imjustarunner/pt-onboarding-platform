<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>School Clients</h1>
        <p class="page-description">
          Track pending client onboarding and expiring school ROI access in one place.
        </p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" type="button" @click="toggleGroupBySchool">
          {{ groupBySchool ? 'Show all rows' : 'Group by school' }}
        </button>
        <button class="btn btn-secondary" type="button" @click="reload" :disabled="loading || !activeAgencyId">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="!activeAgencyId" class="empty-state">
      <p>Select an agency first.</p>
    </div>

    <div v-else class="panel">
      <div class="mode-switch">
        <button
          class="mode-btn"
          :class="{ active: viewMode === 'pending' }"
          type="button"
          @click="setViewMode('pending')"
        >
          Pending
        </button>
        <button
          class="mode-btn"
          :class="{ active: viewMode === 'roi' }"
          type="button"
          @click="setViewMode('roi')"
        >
          ROI Expiring/Expired
        </button>
      </div>

      <div class="filters">
        <div class="field">
          <label>Search</label>
          <input v-model="filters.search" class="input" placeholder="Client initials, school, provider…" />
        </div>
        <div v-if="viewMode === 'pending'" class="field">
          <label>Stage</label>
          <select v-model="filters.stage" class="select">
            <option value="">All</option>
            <option value="no_parent_contact">No parent contact date</option>
            <option value="no_first_session">No first session date</option>
          </select>
        </div>
        <div v-if="viewMode === 'pending'" class="field">
          <label>Sort days</label>
          <select v-model="sortDir" class="select">
            <option value="desc">Most days first</option>
            <option value="asc">Least days first</option>
          </select>
        </div>
        <div v-if="viewMode === 'roi'" class="field">
          <label>Window</label>
          <select v-model.number="roiDaysWindow" class="select" @change="reloadRoi">
            <option :value="14">14 days</option>
            <option :value="30">30 days</option>
            <option :value="45">45 days</option>
            <option :value="60">60 days</option>
            <option :value="90">90 days</option>
          </select>
        </div>
        <div v-if="viewMode === 'roi'" class="field">
          <label>ROI status</label>
          <select v-model="filters.roiStatus" class="select">
            <option value="needs_attention">Expired + expiring soon</option>
            <option value="expired">Expired only</option>
            <option value="expiring_soon">Expiring soon only</option>
            <option value="all">All</option>
          </select>
        </div>
        <div v-if="viewMode === 'roi'" class="field">
          <label>Sort</label>
          <select v-model="roiSort" class="select">
            <option value="soonest">Soonest first</option>
            <option value="latest">Latest first</option>
          </select>
        </div>
        <div class="field">
          <label>Client label</label>
          <button class="btn btn-secondary" type="button" @click="toggleClientLabelMode">
            {{ clientLabelMode === 'codes' ? 'Show initials' : 'Show codes' }}
          </button>
        </div>
      </div>

      <div class="school-actions">
        <button class="btn btn-secondary btn-sm" type="button" @click="expandAllSchools" :disabled="schoolGroups.length === 0">
          Expand all
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="collapseAllSchools" :disabled="schoolGroups.length === 0">
          Collapse all
        </button>
        <button
          v-if="viewMode === 'roi'"
          class="btn btn-primary btn-sm"
          type="button"
          :disabled="roiBulkBusy || filteredRows.length === 0"
          @click="sendBulkRoiRenewals"
        >
          {{ roiBulkBusy ? 'Queueing emails…' : `Renew ROI Email (${filteredRows.length})` }}
        </button>
        <button
          v-if="viewMode === 'roi'"
          class="btn btn-secondary btn-sm"
          type="button"
          :disabled="providerNotifyBusy || filteredRows.length === 0"
          @click="sendProviderRoiReminder"
        >
          {{ providerNotifyBusy ? 'Sending reminders…' : `Notify providers (${filteredRows.length})` }}
        </button>
        <div class="muted" style="font-size: 12px;">Schools: {{ schoolGroups.length }} · Clients: {{ filteredRows.length }}</div>
      </div>

      <div v-if="error" class="error">{{ error }}</div>
      <div v-else-if="loading" class="loading">Loading…</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>School</th>
              <th>Client</th>
              <th>Provider</th>
              <th v-if="viewMode === 'pending'">Date Added Pending</th>
              <th v-if="viewMode === 'pending'">Date Assigned</th>
              <th v-if="viewMode === 'pending'">Tracking</th>
              <th v-if="viewMode === 'pending'">Days Open</th>
              <th v-if="viewMode === 'roi'">ROI Expiration</th>
              <th v-if="viewMode === 'roi'">Days Left</th>
              <th v-if="viewMode === 'roi'">Guardian Email</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="g in schoolGroups" :key="`g-${g.organizationId}`">
              <tr v-if="groupBySchool" class="group-row" @click="toggleSchool(g.organizationId)">
                <td colspan="7">
                  <div class="group-row-inner">
                    <button class="group-toggle" type="button" @click.stop="toggleSchool(g.organizationId)">
                      <span class="caret" :class="{ open: isSchoolExpanded(g.organizationId) }">▸</span>
                    </button>
                    <div class="group-main">
                      <div class="group-title">{{ g.organizationName }}</div>
                      <div class="group-sub muted">
                        Clients: {{ g.rows.length }} · Avg days: {{ g.avgDays }}
                      </div>
                    </div>
                  </div>
                </td>
              </tr>

              <tr
                v-for="r in g.rows"
                v-show="groupBySchool ? isSchoolExpanded(g.organizationId) : true"
                :key="`${r.client_id}-${r.provider_user_id}-${r.organization_id}`"
              >
                <td>{{ r.organization_name || '—' }}</td>
                <td>{{ formatClient(r) }}</td>
                <td>{{ formatProvider(r) }}</td>
                <td v-if="viewMode === 'pending'">{{ formatDate(r.pending_added_at) }}</td>
                <td v-if="viewMode === 'pending'">{{ formatDate(r.assigned_at) }}</td>
                <td v-if="viewMode === 'pending'">{{ formatStage(r.pending_stage) }}</td>
                <td v-if="viewMode === 'pending'" class="mono">{{ Number(r.tracking_days || 0) }}</td>
                <td v-if="viewMode === 'roi'">{{ formatDate(r.roi_expires_at_ymd || r.roi_expires_at) }}</td>
                <td v-if="viewMode === 'roi'" class="mono" :class="roiDaysClass(r.days_until_expiration)">
                  {{ formatRoiDays(r.days_until_expiration, r.roi_state) }}
                </td>
                <td v-if="viewMode === 'roi'">{{ r.guardian_email || '—' }}</td>
              </tr>
            </template>

            <tr v-if="schoolGroups.length === 0">
              <td colspan="7" class="muted">
                {{ viewMode === 'pending' ? 'No pending school clients match your filters.' : 'No ROI renewals match your filters.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref('');
const pendingRows = ref([]);
const roiRows = ref([]);
const sortDir = ref('desc');
const roiSort = ref('soonest');
const viewMode = ref('pending'); // pending | roi
const groupBySchool = ref(true);
const roiDaysWindow = ref(30);
const roiBulkBusy = ref(false);
const providerNotifyBusy = ref(false);
const clientLabelMode = ref('codes'); // 'codes' | 'initials'
const MIN_PENDING_DATE = '2026-02-01';

const filters = ref({
  search: '',
  stage: '',
  roiStatus: 'needs_attention'
});

const normalize = (v) => String(v || '').toLowerCase();

const activeAgencyId = computed(() => {
  const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
  const currentType = String(current?.organization_type || current?.organizationType || 'agency').toLowerCase();
  if (current?.id && currentType === 'agency') return Number(current.id);

  if (['school', 'program', 'learning', 'clinical'].includes(currentType)) {
    const parentFromCurrent = Number(current?.affiliated_agency_id || current?.affiliatedAgencyId || 0);
    if (parentFromCurrent > 0) return parentFromCurrent;
    const orgId = Number(current?.id || 0);
    if (orgId > 0) {
      const source = authStore.user?.role === 'super_admin' ? agencyStore.agencies : agencyStore.userAgencies;
      const match = (source || []).find((a) => Number(a?.id || 0) === orgId);
      const parentFromList = Number(match?.affiliated_agency_id || match?.affiliatedAgencyId || 0);
      if (parentFromList > 0) return parentFromList;
    }
  }

  const source = authStore.user?.role === 'super_admin' ? agencyStore.agencies : agencyStore.userAgencies;
  const firstAgency = (source || []).find((a) => String(a?.organization_type || a?.organizationType || 'agency').toLowerCase() === 'agency');
  return firstAgency?.id ? Number(firstAgency.id) : null;
});

const filteredRows = computed(() => {
  const q = normalize(filters.value.search);
  const source = viewMode.value === 'pending' ? pendingRows.value : roiRows.value;
  return (source || []).filter((r) => {
    if (viewMode.value === 'pending' && filters.value.stage && String(r?.pending_stage || '') !== String(filters.value.stage)) return false;
    if (viewMode.value === 'roi') {
      const roiState = String(r?.roi_state || '');
      if (filters.value.roiStatus === 'expired' && roiState !== 'expired') return false;
      if (filters.value.roiStatus === 'expiring_soon' && roiState !== 'expiring_soon') return false;
      if (filters.value.roiStatus === 'needs_attention' && !['expired', 'expiring_soon'].includes(roiState)) return false;
    }
    if (!q) return true;
    const hay = normalize(
      `${r?.client_initials || ''} ${r?.client_identifier_code || ''} ${r?.organization_name || ''} ${r?.provider_first_name || ''} ${r?.provider_last_name || ''} ${r?.provider_email || ''} ${r?.guardian_email || ''}`
    );
    return hay.includes(q);
  });
});

const sortedRows = computed(() => {
  const out = (filteredRows.value || []).slice();
  out.sort((a, b) => {
    if (viewMode.value === 'pending') {
      const da = Number(a?.tracking_days || 0);
      const db = Number(b?.tracking_days || 0);
      if (da !== db) return sortDir.value === 'asc' ? da - db : db - da;
    } else {
      const da = a?.days_until_expiration === null ? -99999 : Number(a?.days_until_expiration || 0);
      const db = b?.days_until_expiration === null ? -99999 : Number(b?.days_until_expiration || 0);
      if (da !== db) return roiSort.value === 'latest' ? db - da : da - db;
    }
    return String(a?.client_initials || '').localeCompare(String(b?.client_initials || ''));
  });
  return out;
});

const schoolGroups = computed(() => {
  if (!groupBySchool.value) {
    const flatRows = sortedRows.value || [];
    return [{
      organizationId: 0,
      organizationName: 'All schools',
      rows: flatRows,
      avgDays: flatRows.length
        ? Math.round((flatRows.reduce((sum, r) => sum + Number(r?.tracking_days || 0), 0) / flatRows.length) * 10) / 10
        : 0
    }];
  }
  const bySchool = new Map();
  for (const r of sortedRows.value || []) {
    const schoolId = Number(r?.organization_id || 0);
    if (!schoolId) continue;
    if (!bySchool.has(schoolId)) {
      bySchool.set(schoolId, {
        organizationId: schoolId,
        organizationName: r.organization_name || `School ${schoolId}`,
        rows: []
      });
    }
    bySchool.get(schoolId).rows.push(r);
  }
  return Array.from(bySchool.values()).map((g) => {
    const totalDays = (g.rows || []).reduce((sum, r) => sum + Number(r?.tracking_days || 0), 0);
    const avgDays = g.rows.length ? Math.round((totalDays / g.rows.length) * 10) / 10 : 0;
    return { ...g, avgDays };
  });
});

const expandedSchools = ref({});
const isSchoolExpanded = (schoolId) => !!expandedSchools.value?.[String(schoolId)];
const toggleSchool = (schoolId) => {
  const key = String(schoolId || '');
  if (!key) return;
  expandedSchools.value = { ...(expandedSchools.value || {}), [key]: !expandedSchools.value?.[key] };
};
const expandAllSchools = () => {
  const next = {};
  for (const g of schoolGroups.value || []) next[String(g.organizationId)] = true;
  expandedSchools.value = next;
};
const collapseAllSchools = () => {
  const next = {};
  for (const g of schoolGroups.value || []) next[String(g.organizationId)] = false;
  expandedSchools.value = next;
};

watch(schoolGroups, (next) => {
  const out = { ...(expandedSchools.value || {}) };
  for (const g of next || []) {
    const key = String(g.organizationId);
    if (!(key in out)) out[key] = true;
  }
  expandedSchools.value = out;
});

const formatClient = (row) => {
  const code = String(row?.client_identifier_code || '').trim();
  const initials = String(row?.client_initials || '').trim();
  if (clientLabelMode.value === 'initials') return initials || code || `Client #${row?.client_id || '?'}`;
  return code || initials || `Client #${row?.client_id || '?'}`;
};

const toggleClientLabelMode = () => {
  clientLabelMode.value = clientLabelMode.value === 'initials' ? 'codes' : 'initials';
  try {
    window.localStorage.setItem('schoolClientsLabelMode', clientLabelMode.value);
  } catch {
    // ignore
  }
};

const toggleGroupBySchool = () => {
  groupBySchool.value = !groupBySchool.value;
};

const formatProvider = (row) => {
  const first = String(row?.provider_first_name || '').trim();
  const last = String(row?.provider_last_name || '').trim();
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || row?.provider_email || `User #${row?.provider_user_id || '?'}`;
};

const formatStage = (stage) => {
  if (String(stage || '') === 'no_parent_contact') return 'No parent contact date';
  return 'No first session date';
};

const formatDate = (v) => {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString();
  } catch {
    return String(v);
  }
};

const formatRoiDays = (days, state) => {
  if (days === null || days === undefined) return state === 'expired' ? 'Expired' : 'No ROI';
  const n = Number(days || 0);
  if (n < 0) return `Expired ${Math.abs(n)}d`;
  return `${n}d`;
};

const roiDaysClass = (days) => {
  if (days === null || days === undefined) return 'roi-expired';
  const n = Number(days || 0);
  if (n < 0) return 'roi-expired';
  if (n <= 30) return 'roi-soon';
  return '';
};

const reloadPending = async () => {
  if (!activeAgencyId.value) return;
  const resp = await api.get('/compliance-corner/pending-clients', {
    params: { agencyId: activeAgencyId.value, minPendingEnteredAt: MIN_PENDING_DATE }
  });
  pendingRows.value = Array.isArray(resp.data?.results) ? resp.data.results : [];
};

const reloadRoi = async () => {
  if (!activeAgencyId.value) return;
  const resp = await api.get('/compliance-corner/roi-renewals', {
    params: {
      agencyId: activeAgencyId.value,
      daysSoon: roiDaysWindow.value,
      includeActive: filters.value.roiStatus === 'all'
    }
  });
  roiRows.value = Array.isArray(resp.data?.results) ? resp.data.results : [];
};

const reload = async () => {
  if (!activeAgencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    if (viewMode.value === 'pending') {
      await reloadPending();
    } else {
      await reloadRoi();
    }
  } catch (e) {
    if (viewMode.value === 'pending') pendingRows.value = [];
    if (viewMode.value === 'roi') roiRows.value = [];
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load school client data';
  } finally {
    loading.value = false;
  }
};

const setViewMode = (nextMode) => {
  viewMode.value = nextMode === 'roi' ? 'roi' : 'pending';
  reload();
};

const sendBulkRoiRenewals = async () => {
  if (!activeAgencyId.value || filteredRows.value.length === 0) return;
  const proceed = window.confirm(`Queue ROI renewal emails for ${filteredRows.value.length} clients?`);
  if (!proceed) return;
  try {
    roiBulkBusy.value = true;
    error.value = '';
    await api.post('/compliance-corner/roi-renewals/bulk-email', {
      agencyId: activeAgencyId.value,
      clientIds: filteredRows.value.map((r) => Number(r.client_id)).filter((id) => id > 0)
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to queue ROI renewal emails';
  } finally {
    roiBulkBusy.value = false;
  }
};

const sendProviderRoiReminder = async () => {
  if (!activeAgencyId.value || filteredRows.value.length === 0) return;
  const proceed = window.confirm(`Notify providers for ${filteredRows.value.length} clients?`);
  if (!proceed) return;
  try {
    providerNotifyBusy.value = true;
    error.value = '';
    await api.post('/compliance-corner/roi-provider-reminders', {
      agencyId: activeAgencyId.value,
      clientIds: filteredRows.value.map((r) => Number(r.client_id)).filter((id) => id > 0)
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to notify providers';
  } finally {
    providerNotifyBusy.value = false;
  }
};

watch(() => activeAgencyId.value, () => {
  reload();
});

onMounted(async () => {
  try {
    const saved = window.localStorage.getItem('schoolClientsLabelMode');
    if (saved === 'codes' || saved === 'initials') clientLabelMode.value = saved;
  } catch {
    // ignore
  }
  if (authStore.user?.role === 'super_admin') {
    await agencyStore.fetchAgencies();
  }
  await agencyStore.fetchUserAgencies();
  await reload();
});
</script>

<style scoped>
.page {
  width: 100%;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
}
.page-header h1 {
  margin: 0;
}
.page-description {
  margin: 8px 0 0;
  color: var(--text-secondary);
}
.header-actions {
  display: flex;
  gap: 10px;
}
.panel {
  margin-top: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.mode-switch {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 12px;
}
.mode-btn {
  border: 0;
  background: var(--bg);
  padding: 8px 14px;
  cursor: pointer;
  font-weight: 700;
}
.mode-btn.active {
  background: var(--primary-light, #eef4ff);
  color: var(--primary, #1d4ed8);
}
.filters {
  display: grid;
  grid-template-columns: repeat(5, minmax(160px, 1fr));
  gap: 12px;
  align-items: end;
  margin-bottom: 14px;
}
.field label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.input,
.select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
}
.school-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
}
.btn-sm {
  padding: 6px 10px;
  font-size: 13px;
}
.table-wrap {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  border-bottom: 1px solid var(--border);
  padding: 10px;
  vertical-align: middle;
}
.table th {
  position: sticky;
  top: 0;
  background: white;
  white-space: nowrap;
}
.group-row {
  background: var(--bg-alt);
}
.group-row td {
  border-bottom: 1px solid var(--border);
  padding: 10px;
}
.group-row-inner {
  display: grid;
  grid-template-columns: 30px minmax(220px, 1fr);
  gap: 10px;
  align-items: center;
}
.group-toggle {
  border: 1px solid var(--border);
  background: white;
  border-radius: 10px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.caret {
  display: inline-block;
  transform: rotate(0deg);
  transition: transform 0.12s ease;
  font-weight: 900;
  color: var(--text-secondary);
}
.caret.open {
  transform: rotate(90deg);
}
.group-title {
  font-weight: 900;
  color: var(--text-primary);
}
.group-sub {
  margin-top: 2px;
  font-size: 12px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 800;
}
.roi-expired {
  color: #991b1b;
}
.roi-soon {
  color: #92400e;
}
.muted {
  color: var(--text-secondary);
}
.loading {
  padding: 12px 0;
  color: var(--text-secondary);
}
.error {
  color: var(--danger);
  padding: 10px 0;
}
.empty-state {
  padding: 16px;
  color: var(--text-secondary);
}
@media (max-width: 1100px) {
  .filters {
    grid-template-columns: 1fr;
  }
}
</style>
