<template>
  <div class="ob-workspace" :class="{ 'is-detail': !!selectedId }">
    <header class="ob-header">
      <div>
        <h1>Client Readiness</h1>
        <p class="muted">
          View staff setup progress, then complete your contact, intake, and first-service steps.
        </p>
      </div>
      <div class="ob-header-actions">
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

    <div v-if="!agencyId" class="error">Select an agency context to load your readiness queue.</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else-if="!selectedId" class="ob-list-wrap">
      <div class="ob-list-toolbar">
        <input
          v-model="globalSearch"
          type="search"
          class="ob-search"
          placeholder="Search clients…"
          aria-label="Search clients"
        />
        <span class="ob-list-count muted">{{ filteredRows.length }} of {{ rows.length }} clients</span>
      </div>

      <div v-if="loading" class="ob-list-loading muted">Loading your clients…</div>
      <div v-else-if="!rows.length" class="ob-list-empty muted">
        No assigned clients need readiness steps right now.
      </div>
      <div v-else class="ob-table-wrap">
        <table class="ob-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>School</th>
              <th>Day</th>
              <th>Phase</th>
              <th>My steps</th>
              <th>Open items</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!filteredRows.length">
              <td colspan="7" class="ob-empty-row muted">No clients match your search.</td>
            </tr>
            <tr v-for="row in filteredRows" :key="row.id" class="ob-tr-static">
              <td class="ob-td-client">
                <span class="ob-client-name">{{ rowLabel(row) }}</span>
                <span v-if="row.is_paper_packet" class="ob-pill packet">Paper packet</span>
              </td>
              <td>{{ row.organization_name || '—' }}</td>
              <td :class="{ warn: !row.service_day }">{{ row.service_day || '—' }}</td>
              <td>
                <span class="ob-pill phase" :class="`phase-${row.onboarding?.phase || 'staff'}`">
                  {{ phaseLabel(row) }}
                </span>
              </td>
              <td>
                <div class="ob-progress-cell">
                  <span class="ob-progress-pct">{{ providerProgressPct(row) }}%</span>
                  <span class="ob-progress-mini"><i :style="{ width: `${providerProgressPct(row)}%` }" /></span>
                </div>
              </td>
              <td class="ob-td-summary">{{ row.onboarding?.summary_label || '—' }}</td>
              <td class="ob-actions-cell">
                <button type="button" class="btn btn-secondary btn-xs" @click="openClient(row, 'status')">
                  Status
                </button>
                <button type="button" class="btn btn-primary btn-xs" @click="openClient(row, 'steps')">
                  My steps
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="ob-detail-layout">
      <aside class="ob-quicklist" aria-label="Client quick list">
        <div class="ob-quicklist-head">
          <strong>{{ filteredRows.length }} clients</strong>
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
            {{ row.organization_name || 'Office' }}
            · {{ providerProgressPct(row) }}% my steps
          </span>
        </button>
        <p v-if="!quicklistRows.length" class="muted ob-quicklist-empty">No matches.</p>
      </aside>

      <main class="ob-detail-main">
        <div class="ob-detail-toolbar">
          <div class="ob-detail-toolbar-left">
            <button type="button" class="ob-close-btn" aria-label="Close" @click="clearSelection">×</button>
            <div>
              <h2 class="ob-detail-title">{{ selectedLabel }}</h2>
              <p v-if="selectedRow" class="ob-detail-sub muted">
                <span v-if="isSchoolRow(selectedRow)">School client</span>
                <span v-else>Office client</span>
                <template v-if="selectedRow.organization_name"> · {{ selectedRow.organization_name }}</template>
              </p>
            </div>
          </div>
          <router-link v-if="clientDetailTo" class="btn btn-secondary btn-sm" :to="clientDetailTo">
            Open client record
          </router-link>
        </div>

        <div class="ob-detail-tabs">
          <button
            type="button"
            class="ob-tab"
            :class="{ active: detailTab === 'status' }"
            @click="setDetailTab('status')"
          >
            Readiness status
          </button>
          <button
            type="button"
            class="ob-tab"
            :class="{ active: detailTab === 'steps' }"
            @click="setDetailTab('steps')"
          >
            My steps
          </button>
        </div>

        <div v-show="detailTab === 'status'" class="ob-detail-panel">
          <ClientOnboardingChecklistPanel
            :client-id="selectedId"
            :client-label="selectedLabel"
            :client-meta="selectedRow"
            variant="workspace"
            :can-edit-docs="false"
            readonly
            hide-provider-section
            hide-staff-complete-action
            @updated="onChecklistUpdated"
          />
        </div>

        <div v-show="detailTab === 'steps'" class="ob-detail-panel ob-detail-panel-card">
          <h3 class="ob-panel-title">Provider final steps</h3>
          <ClientProviderOnboardingPanel
            :client-id="selectedId"
            :client-type="selectedRow?.client_type || 'school'"
            :client-record-to="clientDetailTo"
            :provider-items="providerItems"
            @saved="onProviderStepsSaved"
          />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import ClientOnboardingChecklistPanel from '../../components/clients/ClientOnboardingChecklistPanel.vue';
import ClientProviderOnboardingPanel from '../../components/clients/ClientProviderOnboardingPanel.vue';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const loading = ref(false);
const error = ref('');
const rows = ref([]);
const selectedId = ref(Number(route.query.clientId || 0) || null);
const detailTab = ref(String(route.query.tab || 'steps').toLowerCase() === 'status' ? 'status' : 'steps');
const globalSearch = ref('');
const quicklistSearch = ref('');
const providerItems = ref([]);

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return Number(a?.id || authStore.user?.agency_id || 0) || null;
});

const providerUserId = computed(() => Number(authStore.user?.id || 0) || null);

const selectedRow = computed(() => rows.value.find((r) => Number(r.id) === Number(selectedId.value)) || null);
const selectedLabel = computed(() => {
  const r = selectedRow.value;
  if (!r) return selectedId.value ? `Client ${selectedId.value}` : '';
  return rowLabel(r);
});

const clientDetailTo = computed(() => {
  if (!selectedId.value) return null;
  const slug = route.params.organizationSlug;
  const q = { clientId: String(selectedId.value) };
  if (slug) return { path: `/${slug}/admin/clients`, query: q };
  return { path: '/admin/clients', query: q };
});

function isSchoolRow(row) {
  return String(row?.client_type || '').toLowerCase() === 'school';
}

function rowLabel(row) {
  return row?.full_name || row?.initials || row?.identifier_code || `Client ${row?.id}`;
}

function phaseLabel(row) {
  const p = row?.onboarding?.phase;
  if (p === 'done') return 'Complete';
  if (p === 'provider') return 'Provider';
  return 'Staff';
}

function providerProgressPct(row) {
  const o = row?.onboarding;
  const total = Number(o?.provider_total_count || 0);
  if (!total) return 0;
  const open = Number(o?.provider_open_count || 0);
  return Math.round(((total - open) / total) * 100);
}

const filteredRows = computed(() => {
  const q = globalSearch.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter((row) => {
    const hay = [
      rowLabel(row),
      row.organization_name,
      row.service_day,
      phaseLabel(row),
      row.onboarding?.summary_label
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
});

const quicklistRows = computed(() => {
  const q = quicklistSearch.value.trim().toLowerCase();
  if (!q) return filteredRows.value;
  return filteredRows.value.filter((row) => rowLabel(row).toLowerCase().includes(q));
});

async function loadQueue() {
  if (!agencyId.value || !providerUserId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/clients/provider-onboarding-queue', {
      params: { agencyId: agencyId.value, providerUserId: providerUserId.value }
    });
    rows.value = Array.isArray(data?.clients) ? data.clients : [];
    if (selectedId.value && !rows.value.some((r) => Number(r.id) === Number(selectedId.value))) {
      await loadProviderItems(selectedId.value);
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load queue';
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadProviderItems(clientId) {
  try {
    const { data } = await api.get(`/clients/${clientId}/onboarding-checklist`);
    providerItems.value = data?.provider_items || [];
  } catch {
    providerItems.value = [];
  }
}

function openClient(row, tab) {
  selectedId.value = Number(row.id);
  detailTab.value = tab === 'status' ? 'status' : 'steps';
  providerItems.value = [];
  router.replace({
    query: { ...route.query, clientId: String(row.id), tab: detailTab.value }
  });
  loadProviderItems(row.id);
}

function selectClient(row) {
  openClient(row, detailTab.value);
}

function setDetailTab(tab) {
  detailTab.value = tab;
  router.replace({ query: { ...route.query, clientId: String(selectedId.value), tab } });
}

function clearSelection() {
  selectedId.value = null;
  providerItems.value = [];
  const q = { ...route.query };
  delete q.clientId;
  delete q.tab;
  router.replace({ query: q });
}

function onChecklistUpdated() {
  loadQueue();
}

function onProviderStepsSaved(checklist) {
  if (checklist?.provider_items) providerItems.value = checklist.provider_items;
  loadQueue();
}

function onKeydown(e) {
  if (e.key === 'Escape' && selectedId.value) clearSelection();
}

watch(selectedId, (id) => {
  if (id) loadProviderItems(id);
});

watch(agencyId, () => loadQueue());
watch(
  () => route.query.clientId,
  (id) => {
    selectedId.value = Number(id || 0) || null;
  }
);
watch(
  () => route.query.tab,
  (tab) => {
    detailTab.value = String(tab || 'steps').toLowerCase() === 'status' ? 'status' : 'steps';
  }
);

onMounted(() => {
  loadQueue();
  if (selectedId.value) loadProviderItems(selectedId.value);
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
.ob-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
  margin-bottom: 16px;
}
.ob-header h1 { margin: 0 0 4px; font-size: 1.45rem; }
.ob-header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
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
.ob-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.ob-table th {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  padding: 10px 12px;
  text-align: left;
  white-space: nowrap;
}
.ob-tr-static td {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}
.ob-td-client { font-weight: 700; color: #0f172a; }
.ob-client-name { white-space: nowrap; margin-right: 6px; }
.ob-td-summary { color: #64748b; font-size: 0.82rem; max-width: 200px; }
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
.ob-pill.packet { background: #fef3c7; color: #92400e; }
.ob-pill.phase { text-transform: none; font-size: 0.75rem; }
.ob-pill.phase.phase-staff { background: #e0f2fe; color: #0369a1; }
.ob-pill.phase.phase-provider { background: #fef3c7; color: #92400e; }
.ob-pill.phase.phase-done { background: #dcfce7; color: #166534; }
.ob-progress-cell { min-width: 72px; }
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
.ob-actions-cell { white-space: nowrap; }
.btn-xs { padding: 4px 10px; font-size: 0.78rem; margin-right: 4px; }
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
  background: #fff;
  padding: 12px;
  overflow: auto;
  max-height: calc(100vh - 140px);
}
.ob-quicklist-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.ob-quicklist-close {
  border: none;
  background: none;
  color: #0891b2;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.8rem;
}
.ob-quicklist-search {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 10px;
  margin-bottom: 8px;
  font-size: 0.85rem;
}
.ob-quicklist-row {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
}
.ob-quicklist-row:hover, .ob-quicklist-row.active { background: #f0fdfa; }
.ob-quicklist-name { display: block; font-weight: 700; font-size: 0.88rem; }
.ob-quicklist-meta { display: block; font-size: 0.75rem; color: #64748b; margin-top: 2px; }
.ob-quicklist-empty { padding: 12px 8px; font-size: 0.82rem; }
.ob-detail-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ob-detail-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.ob-detail-toolbar-left { display: flex; gap: 10px; align-items: flex-start; }
.ob-close-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
}
.ob-detail-title { margin: 0; font-size: 1.2rem; }
.ob-detail-sub { margin: 4px 0 0; font-size: 0.85rem; }
.ob-detail-tabs { display: flex; gap: 8px; }
.ob-tab {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 6px 14px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}
.ob-tab.active { background: #0891b2; border-color: #0891b2; color: #fff; }
.ob-detail-panel { min-width: 0; }
.ob-detail-panel-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  padding: 16px 18px;
}
.ob-panel-title { margin: 0 0 12px; font-size: 1rem; }
</style>
