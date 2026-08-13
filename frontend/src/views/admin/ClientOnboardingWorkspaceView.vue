<template>
  <div class="ob-workspace" :class="{ 'is-detail': !!selectedId }">
    <header class="ob-header">
      <div>
        <h1>Client Action Needed</h1>
        <p class="muted">
          Clients who still need a next step — fall confirmation, new-client intake, agency clearance, or insurance check.
          Expand <strong>Provider outreach</strong> above to download PDFs or copy 24-hour links.
        </p>
      </div>
      <div class="ob-header-actions">
        <div class="ob-tabs" role="tablist" aria-label="Action owner">
          <button
            type="button"
            class="ob-tab"
            :class="{ active: actionOwnerFilter === 'agency' }"
            @click="actionOwnerFilter = 'agency'"
          >
            Waiting on agency
          </button>
          <button
            type="button"
            class="ob-tab"
            :class="{ active: actionOwnerFilter === 'provider' }"
            @click="actionOwnerFilter = 'provider'"
          >
            Waiting on provider
          </button>
          <button
            type="button"
            class="ob-tab"
            :class="{ active: actionOwnerFilter === 'all' }"
            @click="actionOwnerFilter = 'all'"
          >
            All actions
          </button>
        </div>
        <div class="ob-tabs">
          <button type="button" class="ob-tab" :class="{ active: scope === 'school' }" @click="setScope('school')">
            School
          </button>
          <button type="button" class="ob-tab" :class="{ active: scope === 'office' }" @click="setScope('office')">
            Office
          </button>
          <button type="button" class="ob-tab" :class="{ active: scope === 'all' }" @click="setScope('all')">
            All
          </button>
        </div>
        <button
          v-if="selectedId"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="clearSelection"
        >
          Close · View all
        </button>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="loadQueue">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div v-if="!agencyId" class="error">Select an agency context to load the readiness queue.</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else-if="!selectedId">
    <ProviderActionOutreachPanel
      v-if="agencyId"
      :agency-id="agencyId"
      :scope="scope"
    />

    <!-- Table list: all clients -->
    <div class="ob-list-wrap">
      <div class="ob-list-toolbar">
        <input
          v-model="globalSearch"
          type="search"
          class="ob-search"
          placeholder="Search all columns…"
          aria-label="Search all columns"
        />
        <button
          v-if="hasActiveFilters"
          type="button"
          class="btn btn-secondary btn-sm"
          @click="clearFilters"
        >
          Clear filters
        </button>
        <span class="ob-list-count muted">{{ filteredRows.length }} of {{ rows.length }} clients</span>
      </div>

      <div v-if="loading" class="ob-list-loading muted">Loading intakes…</div>
      <div v-else-if="!rows.length" class="ob-list-empty muted">No clients currently need a next-step action in this scope.</div>
      <div v-else class="ob-table-wrap">
        <table class="ob-table">
          <thead>
            <tr class="ob-th-row">
              <th
                v-for="col in columns"
                :key="col.key"
                class="ob-th-sort"
                :class="{ active: sortKey === col.key }"
                @click="toggleSort(col.key)"
              >
                {{ col.label }}
                <span class="ob-sort-arrow">{{ sortIndicator(col.key) }}</span>
              </th>
            </tr>
            <tr class="ob-filter-row">
              <th v-for="col in columns" :key="`f-${col.key}`">
                <input
                  v-if="col.filterable !== false"
                  v-model="columnFilters[col.key]"
                  type="search"
                  class="ob-col-filter"
                  :placeholder="`Filter ${col.label.toLowerCase()}`"
                  :aria-label="`Filter ${col.label}`"
                  @click.stop
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!filteredRows.length">
              <td :colspan="columns.length" class="ob-empty-row muted">No clients match your filters.</td>
            </tr>
            <tr
              v-for="row in filteredRows"
              :key="row.id"
              class="ob-tr"
              tabindex="0"
              @click="selectClient(row)"
              @keydown.enter="selectClient(row)"
            >
              <td class="ob-td-client">
                <span class="ob-client-name">{{ rowLabel(row) }}</span>
              </td>
              <td>
                <span class="ob-pill" :class="isSchoolRow(row) ? 'school' : 'office'">
                  {{ isSchoolRow(row) ? 'School' : 'Office' }}
                </span>
                <span v-if="isPaperPacketRow(row)" class="ob-pill packet">Paper packet</span>
              </td>
              <td>{{ row.organization_name || '—' }}</td>
              <td :class="{ warn: !row.provider_name }">{{ row.provider_name || 'Unassigned' }}</td>
              <td :class="{ warn: isSchoolRow(row) && !row.service_day }">
                {{ isSchoolRow(row) ? (row.service_day || '—') : '—' }}
              </td>
              <td>{{ row.client_status_label || '—' }}</td>
              <td>
                <span v-if="row.action_stage" class="ob-pill phase" :class="row.action_owner === 'provider' ? 'phase-provider' : 'phase-staff'">
                  {{ row.action_stage }}
                </span>
                <span v-else class="ob-pill phase" :class="`phase-${row.onboarding?.phase || 'staff'}`">
                  {{ phaseLabel(row) }}
                </span>
              </td>
              <td class="ob-action-cell">
                <button
                  v-if="row.agency_lifecycle_action"
                  type="button"
                  class="btn btn-primary btn-sm"
                  @click.stop="openAgencyAction(row)"
                >
                  {{ row.agency_lifecycle_action.label }}
                </button>
                <span
                  v-if="row.provider_lifecycle_action"
                  class="ob-action-provider"
                  :class="{ muted: actionOwnerFilter === 'agency' }"
                >
                  <template v-if="actionOwnerFilter !== 'agency'">
                    {{ row.provider_lifecycle_action.label }}
                  </template>
                  <template v-else>
                    Provider: {{ row.provider_lifecycle_action.label }}
                  </template>
                </span>
                <span
                  v-if="!row.agency_lifecycle_action && row.provider_lifecycle_action"
                  class="muted"
                >Waiting on provider</span>
                <span
                  v-else-if="!row.agency_lifecycle_action && !row.provider_lifecycle_action"
                  class="muted"
                >{{ row.onboarding?.summary_label || '—' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    </template>

    <!-- Detail: onboarding quickview -->
    <div v-else class="ob-detail-layout">
      <aside class="ob-quicklist" aria-label="Client quick list">
        <div class="ob-quicklist-head">
          <strong>{{ filteredRows.length }} intakes</strong>
          <button type="button" class="ob-quicklist-close" @click="clearSelection">View all</button>
        </div>
        <input
          v-model="quicklistSearch"
          type="search"
          class="ob-quicklist-search"
          placeholder="Filter list…"
        />
        <button
          v-for="row in quicklistRows"
          :key="row.id"
          type="button"
          class="ob-quicklist-row"
          :class="{ active: Number(row.id) === Number(selectedId) }"
          @click="selectClient(row)"
        >
          <span class="ob-quicklist-name">{{ rowLabel(row) }}</span>
          <span class="ob-quicklist-meta">
            {{ isSchoolRow(row) ? (row.organization_name || 'School') : 'Office' }}
            · {{ progressPct(row) }}%
          </span>
        </button>
        <p v-if="!quicklistRows.length" class="muted ob-quicklist-empty">No matches.</p>
      </aside>

      <main class="ob-detail-main">
        <div class="ob-detail-toolbar">
          <div class="ob-detail-toolbar-left">
            <button type="button" class="ob-close-btn" aria-label="Close and view all clients" @click="clearSelection">
              ×
            </button>
            <div>
              <h2 class="ob-detail-title">{{ selectedLabel }}</h2>
              <p v-if="selectedRow" class="ob-detail-sub muted">
                <span v-if="isSchoolRow(selectedRow)">School client</span>
                <span v-else>Office client</span>
                <template v-if="selectedRow.organization_name"> · {{ selectedRow.organization_name }}</template>
              </p>
            </div>
          </div>
          <div class="ob-detail-toolbar-right">
            <button
              v-if="selectedId && isSchoolRow(selectedRow)"
              type="button"
              class="btn btn-primary btn-sm"
              @click="openAgencyIntake"
            >
              Agency intake Action
            </button>
            <button
              v-if="selectedId && isSchoolRow(selectedRow)"
              type="button"
              class="btn btn-secondary btn-sm"
              @click="openAgencyClearance"
            >
              Agency clearance
            </button>
            <router-link class="btn btn-secondary btn-sm" :to="clientDetailTo">
              Open client record
            </router-link>
          </div>
        </div>
        <ClientOnboardingChecklistPanel
          :client-id="selectedId"
          :client-label="selectedLabel"
          :client-meta="selectedRow"
          variant="workspace"
          :can-edit-docs="true"
          @updated="onChecklistUpdated"
        />
      </main>
    </div>

    <LifecycleActionModal
      v-if="lifecycleClient && lifecycleActionKey"
      :client="lifecycleClient"
      :action-key="lifecycleActionKey"
      :action-label="lifecycleActionLabel"
      @close="closeLifecycleModal"
      @saved="onLifecycleSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import ClientOnboardingChecklistPanel from '../../components/clients/ClientOnboardingChecklistPanel.vue';
import LifecycleActionModal from '../../components/school/LifecycleActionModal.vue';
import ProviderActionOutreachPanel from '../../components/admin/ProviderActionOutreachPanel.vue';
import { isPaperPacketClient } from '../../utils/paperPacketClient.js';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const columns = [
  { key: 'client', label: 'Client' },
  { key: 'type', label: 'Type' },
  { key: 'school', label: 'School' },
  { key: 'provider', label: 'Provider' },
  { key: 'day', label: 'Day' },
  { key: 'status', label: 'Status' },
  { key: 'phase', label: 'Stage' },
  { key: 'action', label: 'Action needed' }
];

const scope = ref(String(route.query.scope || 'school').toLowerCase());
const actionOwnerFilter = ref(String(route.query.owner || 'agency').toLowerCase());
const loading = ref(false);
const error = ref('');
const rows = ref([]);
const selectedId = ref(Number(route.query.clientId || 0) || null);
const globalSearch = ref('');
const quicklistSearch = ref('');
const sortKey = ref('school');
const sortDir = ref('asc');
const columnFilters = ref({
  client: '',
  type: '',
  school: '',
  provider: '',
  day: '',
  status: '',
  phase: '',
  action: ''
});
const lifecycleClient = ref(null);
const lifecycleActionKey = ref('');
const lifecycleActionLabel = ref('');

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);

const selectedRow = computed(() => rows.value.find((r) => Number(r.id) === Number(selectedId.value)) || null);
const selectedLabel = computed(() => {
  const r = selectedRow.value;
  if (!r) return selectedId.value ? `Client ${selectedId.value}` : '';
  return rowLabel(r);
});

const clientDetailTo = computed(() => {
  const slug = route.params.organizationSlug;
  const q = { clientId: String(selectedId.value) };
  if (slug) return { path: `/${slug}/admin/clients`, query: q };
  return { path: '/admin/clients', query: q };
});

const hasActiveFilters = computed(() =>
  !!globalSearch.value.trim()
  || Object.values(columnFilters.value).some((v) => String(v || '').trim())
);

function isSchoolRow(row) {
  return String(row?.client_type || '').toLowerCase() === 'school';
}

function openAgencyAction(row) {
  const act = row?.agency_lifecycle_action || row?.lifecycle_action;
  if (!act?.actionKey) return;
  lifecycleClient.value = row;
  lifecycleActionKey.value = act.actionKey;
  lifecycleActionLabel.value = act.label || 'Next Step';
}

function openRowAction(row) {
  openAgencyAction(row);
}

function openAgencyIntake() {
  if (selectedRow.value?.lifecycle_action) {
    openRowAction(selectedRow.value);
    return;
  }
  if (!selectedRow.value) return;
  lifecycleClient.value = selectedRow.value;
  lifecycleActionKey.value = 'agency_intake';
  lifecycleActionLabel.value = 'Complete agency intake';
}

function openAgencyClearance() {
  if (!selectedRow.value) return;
  lifecycleClient.value = selectedRow.value;
  lifecycleActionKey.value = 'agency_clearance';
  lifecycleActionLabel.value = 'Complete agency clearance';
}

function closeLifecycleModal() {
  lifecycleClient.value = null;
  lifecycleActionKey.value = '';
  lifecycleActionLabel.value = '';
}

async function onLifecycleSaved() {
  closeLifecycleModal();
  // Refresh onboarding queue so Status reflects agency intake / clearance.
  try {
    await loadQueue();
  } catch {
    // best-effort
  }
}

function isPaperPacketRow(row) {
  return isPaperPacketClient(row);
}

function rowLabel(row) {
  return row?.full_name || row?.initials || row?.identifier_code || `Client ${row?.id}`;
}

function progressPct(row) {
  const o = row?.onboarding;
  if (!o?.total_count) return 0;
  return Math.round((Number(o.complete_count || 0) / Number(o.total_count)) * 100);
}

function phaseLabel(row) {
  if (row?.action_stage) return row.action_stage;
  const p = row?.onboarding?.phase;
  if (p === 'done') return 'Complete';
  if (p === 'provider') return 'Provider';
  return 'Staff';
}

function cellText(row, key) {
  switch (key) {
    case 'client': return rowLabel(row);
    case 'type': {
      const base = isSchoolRow(row) ? 'school' : 'office';
      return isPaperPacketRow(row) ? `${base} paper packet` : base;
    }
    case 'school': return row.organization_name || '';
    case 'provider': return row.provider_name || 'unassigned';
    case 'day': return isSchoolRow(row) ? (row.service_day || '') : '';
    case 'status': return row.client_status_label || '';
    case 'phase': return phaseLabel(row);
    case 'action': {
      const parts = [];
      if (row.agency_lifecycle_action?.label) parts.push(row.agency_lifecycle_action.label);
      if (row.provider_lifecycle_action?.label) parts.push(row.provider_lifecycle_action.label);
      if (parts.length) return parts.join(' ');
      return row.action_stage || row.lifecycle_action?.label || row.onboarding?.summary_label || '';
    }
    default: return '';
  }
}

function rowMatchesOwnerFilter(row) {
  const f = actionOwnerFilter.value;
  if (f === 'agency') return !!row.waiting_on_agency;
  if (f === 'provider') return !!row.waiting_on_provider;
  return !!(row.waiting_on_agency || row.waiting_on_provider || row.onboarding?.phase !== 'done');
}

function rowMatchesFilters(row) {
  if (!rowMatchesOwnerFilter(row)) return false;
  const global = globalSearch.value.trim().toLowerCase();
  if (global) {
    const hay = columns.map((c) => cellText(row, c.key)).join(' ').toLowerCase();
    if (!hay.includes(global)) return false;
  }
  for (const col of columns) {
    const filter = String(columnFilters.value[col.key] || '').trim().toLowerCase();
    if (!filter) continue;
    if (!cellText(row, col.key).toLowerCase().includes(filter)) return false;
  }
  return true;
}

const filteredRows = computed(() => {
  const list = rows.value.filter(rowMatchesFilters);
  const key = sortKey.value;
  const dir = sortDir.value === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    if (key === 'progress') {
      return (progressPct(a) - progressPct(b)) * dir;
    }
    const av = cellText(a, key);
    const bv = cellText(b, key);
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
  });
});

const quicklistRows = computed(() => {
  const q = quicklistSearch.value.trim().toLowerCase();
  if (!q) return filteredRows.value;
  return filteredRows.value.filter((row) => cellText(row, 'client').toLowerCase().includes(q)
    || cellText(row, 'school').toLowerCase().includes(q));
});

function toggleSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = key === 'progress' ? 'desc' : 'asc';
  }
}

function sortIndicator(key) {
  if (sortKey.value !== key) return '↕';
  return sortDir.value === 'asc' ? '↑' : '↓';
}

function clearFilters() {
  globalSearch.value = '';
  columnFilters.value = {
    client: '',
    type: '',
    school: '',
    provider: '',
    day: '',
    status: '',
    phase: '',
    action: ''
  };
}

const setScope = (next) => {
  scope.value = next;
  selectedId.value = null;
  clearFilters();
  router.replace({ query: { scope: next, owner: actionOwnerFilter.value } });
};

watch(actionOwnerFilter, (owner) => {
  const q = { ...route.query, scope: scope.value, owner };
  router.replace({ query: q });
});

const clearSelection = () => {
  selectedId.value = null;
  quicklistSearch.value = '';
  const q = { ...route.query };
  delete q.clientId;
  router.replace({ query: q });
};

const loadQueue = async () => {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get('/clients/onboarding-queue', {
      params: { agencyId: agencyId.value, scope: scope.value, limit: 5000 },
      skipGlobalLoading: true
    });
    rows.value = Array.isArray(r.data?.clients) ? r.data.clients : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load onboarding queue';
    rows.value = [];
  } finally {
    loading.value = false;
  }
};

const selectClient = (row) => {
  selectedId.value = Number(row.id);
  router.replace({ query: { ...route.query, scope: scope.value, clientId: String(row.id) } });
};

const onChecklistUpdated = () => {
  loadQueue();
};

function onKeydown(e) {
  if (e.key === 'Escape' && selectedId.value) clearSelection();
}

watch(agencyId, () => loadQueue());
watch(scope, () => loadQueue());
onMounted(() => {
  loadQueue();
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.ob-workspace {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 20px 24px 40px;
  box-sizing: border-box;
  min-height: calc(100vh - 72px);
  min-height: calc(100dvh - 72px);
  display: flex;
  flex-direction: column;
}
.ob-action-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.ob-action-provider {
  font-size: 12px;
  line-height: 1.3;
}
.ob-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.ob-header h1 { margin: 0 0 4px; font-size: 1.45rem; }
.ob-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.ob-tabs { display: flex; gap: 6px; }
.ob-tab {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}
.ob-tab.active { background: #0891b2; border-color: #0891b2; color: #fff; }

.ob-list-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.ob-list-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.ob-search {
  flex: 1;
  min-width: 220px;
  max-width: 420px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 0.9rem;
}
.ob-list-count { font-size: 0.82rem; margin-left: auto; }
.ob-list-loading, .ob-list-empty { padding: 40px 12px; text-align: center; }

.ob-table-wrap {
  flex: 1;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.ob-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.ob-th-row th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 12px;
  text-align: left;
  white-space: nowrap;
}
.ob-th-sort {
  cursor: pointer;
  user-select: none;
  font-weight: 700;
  color: #475569;
}
.ob-th-sort:hover, .ob-th-sort.active { color: #0f172a; }
.ob-sort-arrow {
  margin-left: 4px;
  font-size: 0.75rem;
  opacity: 0.55;
}
.ob-th-sort.active .ob-sort-arrow { opacity: 1; }
.ob-filter-row th {
  position: sticky;
  top: 41px;
  z-index: 2;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  padding: 6px 8px;
}
.ob-col-filter {
  width: 100%;
  min-width: 72px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 0.78rem;
  box-sizing: border-box;
}
.ob-tr {
  cursor: pointer;
  transition: background 0.12s;
}
.ob-tr:hover { background: #f0fdfa; }
.ob-tr:focus-visible { outline: 2px solid #0891b2; outline-offset: -2px; }
.ob-tr td {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}
.ob-td-client { font-weight: 700; color: #0f172a; }
.ob-client-name { white-space: nowrap; }
.ob-td-summary { color: #64748b; font-size: 0.82rem; max-width: 220px; }
.ob-empty-row { text-align: center; padding: 24px !important; }
.warn { color: #c2410c; font-weight: 600; }

.ob-pill {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 3px 7px;
  border-radius: 999px;
}
.ob-pill.school { background: #cffafe; color: #0e7490; }
.ob-pill.office { background: #e2e8f0; color: #475569; }
.ob-pill.packet { background: #fef3c7; color: #92400e; margin-left: 4px; }
.ob-pill.phase { text-transform: none; font-size: 0.75rem; }
.ob-pill.phase.phase-staff { background: #e0f2fe; color: #0369a1; }
.ob-pill.phase.phase-provider { background: #fef3c7; color: #92400e; }
.ob-pill.phase.phase-done { background: #dcfce7; color: #166534; }

.ob-progress-cell { min-width: 88px; }
.ob-progress-pct { font-weight: 700; font-size: 0.8rem; color: #0e7490; }
.ob-progress-mini {
  display: block;
  height: 4px;
  background: #e2e8f0;
  border-radius: 999px;
  margin-top: 4px;
  overflow: hidden;
}
.ob-progress-mini i {
  display: block;
  height: 100%;
  background: #0891b2;
  border-radius: 999px;
}

.ob-detail-layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(200px, 260px) 1fr;
  gap: 16px;
  min-height: 0;
}
@media (max-width: 900px) {
  .ob-detail-layout { grid-template-columns: 1fr; }
}
.ob-quicklist {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 10px;
  overflow: auto;
  max-height: calc(100vh - 200px);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ob-quicklist-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
  padding: 4px 4px 6px;
}
.ob-quicklist-close {
  border: none;
  background: none;
  color: #0891b2;
  font-weight: 700;
  font-size: 0.72rem;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}
.ob-quicklist-search {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 0.8rem;
  margin-bottom: 4px;
}
.ob-quicklist-row {
  display: block;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 10px;
  background: transparent;
  cursor: pointer;
}
.ob-quicklist-row:hover { background: #fff; }
.ob-quicklist-row.active {
  background: #fff;
  border-color: #67e8f9;
  box-shadow: 0 2px 8px rgba(8, 145, 178, 0.1);
}
.ob-quicklist-name {
  display: block;
  font-weight: 700;
  font-size: 0.88rem;
  color: #0f172a;
}
.ob-quicklist-meta {
  display: block;
  font-size: 0.72rem;
  color: #64748b;
  margin-top: 2px;
}
.ob-quicklist-empty { font-size: 0.8rem; padding: 8px; margin: 0; }

.ob-detail-main { min-width: 0; overflow: auto; }
.ob-detail-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.ob-detail-toolbar-left {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.ob-detail-toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.ob-close-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: #64748b;
  flex-shrink: 0;
}
.ob-close-btn:hover {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}
.ob-detail-title { margin: 0; font-size: 1.2rem; }
.ob-detail-sub { margin: 4px 0 0; font-size: 0.85rem; }

.muted { color: #64748b; }
.error { color: #b91c1c; margin-bottom: 8px; }
</style>
