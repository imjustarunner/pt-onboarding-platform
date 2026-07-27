<template>
  <div class="provider-clients-tab">
    <div class="pct-section-switcher" role="tablist" aria-label="Clients sections">
      <button
        type="button"
        role="tab"
        :aria-selected="activeSection === 'caseload'"
        :class="['pct-switch-btn', { 'is-active': activeSection === 'caseload' }]"
        @click="activeSection = 'caseload'"
      >
        My caseload
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeSection === 'referrals'"
        :class="['pct-switch-btn', { 'is-active': activeSection === 'referrals' }]"
        @click="activeSection = 'referrals'"
      >
        Referral directory
      </button>
    </div>

    <ReferralDirectoryPanel v-if="activeSection === 'referrals'" embedded />

    <template v-else>
    <div class="section-header">
      <h2 style="margin: 0;">Clients</h2>
      <div class="filters">
        <template v-if="caseloadScope === 'school'">
          <label>
            <span class="label">School</span>
            <select class="select" v-model="selectedSchoolOrgId">
              <option value="all">All schools</option>
              <option v-for="s in schools" :key="s.schoolOrganizationId" :value="Number(s.schoolOrganizationId)">
                {{ s.name }}
              </option>
            </select>
          </label>
          <label>
            <span class="label">Fiscal year</span>
            <select class="select" v-model="selectedFiscalYearStart">
              <option v-for="fy in fiscalYearOptions" :key="fy.startYmd" :value="fy.startYmd">
                {{ fy.label }}
              </option>
            </select>
          </label>
        </template>
        <button class="btn btn-secondary btn-sm" type="button" @click="toggleFullNames" :disabled="loading">
          {{ clientLabelMode === 'full_name' ? 'Show initials' : 'Show full names' }}
        </button>
        <button class="btn-link label-mode-secondary" type="button" @click="toggleCodesMode" :disabled="loading">
          {{ clientLabelMode === 'codes' ? 'Show initials' : 'Show codes' }}
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="refreshCurrentScope" :disabled="loading || officeLoading">
          {{ (loading || officeLoading) ? 'Loading…' : 'Refresh' }}
        </button>
        <label v-if="caseloadScope === 'school' && showSkillBuildersRosterToggle" class="sb-roster-toggle">
          <input v-model="skillBuildersOnlyFilter" type="checkbox" />
          <span>Skill Builders clients only</span>
        </label>
      </div>
    </div>

    <div class="pct-scope-switcher" role="tablist" aria-label="Caseload scope">
      <button
        type="button"
        role="tab"
        :aria-selected="caseloadScope === 'school'"
        :class="['pct-scope-btn', { 'is-active': caseloadScope === 'school' }]"
        @click="caseloadScope = 'school'"
      >
        In-school
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="caseloadScope === 'office'"
        :class="['pct-scope-btn', { 'is-active': caseloadScope === 'office' }]"
        @click="caseloadScope = 'office'"
      >
        In-office
      </button>
      <router-link :to="clientExchangeRoute" class="pct-exchange-link">Client Exchange →</router-link>
    </div>

    <template v-if="caseloadScope === 'school'">
      <div v-if="error" class="error">{{ error }}</div>
      <div v-else-if="schools.length === 0 && !loading" class="muted">
        No assigned schools found for this agency.
      </div>

      <div v-if="pendingError" class="error">{{ pendingError }}</div>
      <div v-else-if="pendingClientsFiltered.length > 0" class="pending-strip">
        <div class="pending-strip-head">
          <strong>Pending school clients</strong>
          <span class="pending-count-badge pulse">{{ pendingClientsFiltered.length }}</span>
        </div>
        <div class="pending-strip-table-wrap">
          <table class="pending-strip-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>School</th>
                <th>Stage</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in pendingClientsFiltered" :key="`${row.client_id}-${row.organization_id}`">
                <td>{{ formatPendingClientLabel(row) }}</td>
                <td>{{ row.organization_name || '—' }}</td>
                <td>{{ row.pending_stage === 'no_parent_contact' ? 'No parent contact date' : 'No first session date' }}</td>
                <td class="mono">{{ Number(row.tracking_days || 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <ClientListGrid
        v-if="selectedSchoolOrgId"
        :organization-slug="organizationSlug"
        :organization-id="Number(selectedSchoolOrgId) || null"
        :organization-name="selectedSchoolName"
        :clients-override="isAllSchools ? allClients : null"
        roster-scope="provider"
        :skill-builders-only="skillBuildersOnlyFilter"
        :client-label-mode="clientLabelMode"
        :psychotherapy-totals-by-client-id="psychotherapyTotalsByClientId"
        :show-search="true"
        search-placeholder="Search clients…"
        @update:needsAttentionCount="(count) => emit('update:needsAttentionCount', count)"
      />
    </template>

    <template v-else>
      <div v-if="officeError" class="error">{{ officeError }}</div>
      <div v-else-if="!officeLoading && officeClients.length === 0" class="muted empty-state">
        No in-office clients assigned to you yet.
      </div>
      <div v-else class="office-clients-table-wrap">
        <table class="office-clients-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Type</th>
              <th>Status</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in officeClients" :key="c.id">
              <td>{{ formatOfficeClientLabel(c) }}</td>
              <td>{{ c.client_type === 'clinical' ? 'Office / Clinical' : 'Learning' }}</td>
              <td>{{ c.status }}</td>
              <td>{{ c.submission_date || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';

const emit = defineEmits(['update:needsAttentionCount', 'update:pendingClientsCount']);
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import ClientListGrid from '../school/ClientListGrid.vue';
import ReferralDirectoryPanel from '../referralDirectory/ReferralDirectoryPanel.vue';

const activeSection = ref('caseload');

const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const schools = ref([]);
const selectedSchoolOrgId = ref(null);
const selectedFiscalYearStart = ref('');
const clientLabelMode = ref('initials'); // 'initials' (default) | 'full_name' | 'codes' (secondary)
const caseloadScope = ref('school'); // 'school' | 'office'
const officeClients = ref([]);
const officeLoading = ref(false);
const officeError = ref('');

const isAllSchools = computed(() => selectedSchoolOrgId.value === 'all');

const clientExchangeRoute = computed(() =>
  organizationSlug.value
    ? { name: 'OrganizationClientExchange', params: { organizationSlug: organizationSlug.value } }
    : { name: 'ClientExchange' }
);

const selectedSchoolName = computed(() => {
  const id = selectedSchoolOrgId.value;
  if (!id || id === 'all') return '';
  const s = (schools.value || []).find((x) => Number(x.schoolOrganizationId) === Number(id));
  return s?.name || '';
});
const loading = ref(false);
const allClients = ref([]);
const skillBuildersOnlyFilter = ref(false);
const error = ref('');
const psychotherapyTotalsByClientId = ref(null);
const pendingClients = ref([]);
const pendingError = ref('');
const MIN_PENDING_DATE = '2026-02-01';

const computeFiscalYearStartYmd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const startYear = m >= 7 ? y : (y - 1);
  return `${startYear}-07-01`;
};

const fiscalYearOptions = computed(() => {
  const now = new Date();
  const currentStart = computeFiscalYearStartYmd(now);
  const startYear = Number(currentStart.slice(0, 4));
  const years = [startYear, startYear - 1, startYear - 2];
  return years.map((y) => ({
    startYmd: `${y}-07-01`,
    label: `${y}-${y + 1}`
  }));
});

const buildTotalsByClientId = (resp) => {
  const m = {};
  const matched = Array.isArray(resp?.matched) ? resp.matched : [];
  for (const r of matched) {
    const cid = r?.client_id;
    if (!cid) continue;
    m[String(cid)] = {
      total: Number(r?.total || 0),
      per_code: r?.per_code || {},
      client_abbrev: r?.client_abbrev || null,
      surpassed_24: !!r?.surpassed_24
    };
  }
  return m;
};

const persistClientLabelMode = () => {
  try {
    window.localStorage.setItem('dashboardClientLabelMode', clientLabelMode.value);
  } catch {
    // ignore
  }
};

const toggleFullNames = () => {
  clientLabelMode.value = clientLabelMode.value === 'full_name' ? 'initials' : 'full_name';
  persistClientLabelMode();
};

const toggleCodesMode = () => {
  clientLabelMode.value = clientLabelMode.value === 'codes' ? 'initials' : 'codes';
  persistClientLabelMode();
};

const currentUserId = computed(() => Number(authStore.user?.id || 0) || null);

const showSkillBuildersRosterToggle = computed(() => {
  const u = authStore.user;
  return u?.skill_builder_eligible === true || u?.skill_builder_eligible === 1 || u?.skill_builder_eligible === '1';
});

const pendingClientsFiltered = computed(() => {
  const selected = selectedSchoolOrgId.value;
  const base = Array.isArray(pendingClients.value) ? pendingClients.value : [];
  const rows = selected === 'all'
    ? base
    : base.filter((r) => Number(r?.organization_id || 0) === Number(selected || 0));
  return rows.slice().sort((a, b) => Number(b?.tracking_days || 0) - Number(a?.tracking_days || 0));
});

const emitPendingCount = () => {
  const count = Number((pendingClientsFiltered.value || []).length || 0);
  emit('update:pendingClientsCount', count);
};

const formatPendingClientLabel = (row) => {
  const code = String(row?.client_identifier_code || '').trim();
  const initials = String(row?.client_initials || '').trim();
  const fullName = String(row?.client_full_name || '').trim();
  if (clientLabelMode.value === 'full_name') return fullName || initials || code || `Client #${row?.client_id || '?'}`;
  if (clientLabelMode.value === 'initials') return initials || code || `Client #${row?.client_id || '?'}`;
  return code || initials || `Client #${row?.client_id || '?'}`;
};

const formatOfficeClientLabel = (c) => {
  if (clientLabelMode.value === 'full_name') return c?.full_name || c?.initials || `Client #${c?.id}`;
  if (clientLabelMode.value === 'codes') return c?.identifier_code || c?.initials || `Client #${c?.id}`;
  return c?.initials || c?.identifier_code || `Client #${c?.id}`;
};

const loadOfficeClients = async () => {
  if (!agencyId.value || !currentUserId.value) {
    officeClients.value = [];
    return;
  }
  officeLoading.value = true;
  officeError.value = '';
  try {
    const r = await api.get('/clients', {
      params: {
        agency_id: agencyId.value,
        provider_id: currentUserId.value,
        client_type: 'clinical,learning'
      },
      skipGlobalLoading: true
    });
    const rows = Array.isArray(r.data) ? r.data : (r.data?.items || []);
    officeClients.value = rows.filter((c) => String(c?.status || '').toUpperCase() !== 'ARCHIVED');
  } catch (e) {
    officeClients.value = [];
    officeError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load in-office clients';
  } finally {
    officeLoading.value = false;
  }
};

const loadSchools = async () => {
  if (!agencyId.value) return;
  const r = await api.get('/payroll/me/assigned-schools', { params: { agencyId: agencyId.value } });
  schools.value = Array.isArray(r.data) ? r.data : [];
  // Default to "All schools" (not the first school) so providers see their whole caseload at a glance.
  if (!selectedSchoolOrgId.value) {
    selectedSchoolOrgId.value = 'all';
  }
};

const loadAllRosters = async () => {
  const list = schools.value || [];
  if (list.length === 0) {
    allClients.value = [];
    return;
  }
  try {
    const sbParams = skillBuildersOnlyFilter.value ? { skillBuildersOnly: true } : {};
    const results = await Promise.all(
      list.map((s) =>
        api
          .get(`/school-portal/${encodeURIComponent(s.schoolOrganizationId)}/my-roster`, {
            params: sbParams,
            skipGlobalLoading: true
          })
          .then((r) => ({ school: s, rows: Array.isArray(r?.data) ? r.data : [] }))
          .catch(() => ({ school: s, rows: [] }))
      )
    );
    const byId = new Map();
    for (const { school, rows } of results) {
      for (const c of rows) {
        const id = c?.id;
        if (!id || byId.has(id)) continue;
        // my-roster doesn't include organization identity (it's fetched per-school) — attach it
        // here so the merged "All schools" grid can show/sort by school and still open the client.
        byId.set(id, {
          ...c,
          organization_id: c.organization_id ?? Number(school.schoolOrganizationId),
          organization_name: c.organization_name ?? school.name
        });
      }
    }
    allClients.value = Array.from(byId.values());
  } catch {
    allClients.value = [];
  }
};

const loadCompliance = async () => {
  if (!agencyId.value) return;
  const r = await api.get('/psychotherapy-compliance/summary', {
    params: { agencyId: agencyId.value, fiscalYearStart: selectedFiscalYearStart.value }
  });
  psychotherapyTotalsByClientId.value = buildTotalsByClientId(r.data || {});
};

const loadPendingClients = async () => {
  if (!agencyId.value || !currentUserId.value) {
    pendingClients.value = [];
    pendingError.value = '';
    emit('update:pendingClientsCount', 0);
    return;
  }
  try {
    pendingError.value = '';
    const r = await api.get('/compliance-corner/pending-clients', {
      params: {
        agencyId: Number(agencyId.value),
        providerUserId: Number(currentUserId.value),
        minPendingEnteredAt: MIN_PENDING_DATE
      },
      skipGlobalLoading: true
    });
    pendingClients.value = Array.isArray(r.data?.results) ? r.data.results : [];
  } catch (e) {
    pendingClients.value = [];
    pendingError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load pending school clients';
  } finally {
    emitPendingCount();
  }
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    psychotherapyTotalsByClientId.value = null;

    if (!selectedFiscalYearStart.value) {
      selectedFiscalYearStart.value = fiscalYearOptions.value[0]?.startYmd || '';
    }

    await loadSchools();
    await loadCompliance();
    await loadPendingClients();
    if (isAllSchools.value) await loadAllRosters();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load clients';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  try {
    const saved = window.localStorage.getItem('dashboardClientLabelMode');
    if (saved === 'codes' || saved === 'initials' || saved === 'full_name') clientLabelMode.value = saved;
  } catch {
    // ignore
  }
  load();
});
watch(() => agencyId.value, load);
watch(() => selectedFiscalYearStart.value, () => loadCompliance().catch(() => {}));
watch(() => currentUserId.value, () => loadPendingClients().catch(() => {}));
watch(() => pendingClientsFiltered.value.length, () => emitPendingCount());

watch(
  () => selectedSchoolOrgId.value,
  async (id) => {
    if (!id) emit('update:needsAttentionCount', 0);
    if (id === 'all') await loadAllRosters();
    emitPendingCount();
  },
  { immediate: true }
);

watch(skillBuildersOnlyFilter, async () => {
  if (isAllSchools.value) await loadAllRosters();
});

const refreshCurrentScope = () => {
  if (caseloadScope.value === 'office') return loadOfficeClients();
  return load();
};

watch(caseloadScope, (scope) => {
  if (scope === 'office') loadOfficeClients();
});
watch(currentUserId, () => {
  if (caseloadScope.value === 'office') loadOfficeClients();
});
</script>

<style scoped>
.provider-clients-tab {
  display: grid;
  gap: 14px;
  min-width: 0;
  max-width: 100%;
}
.sb-roster-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  user-select: none;
}
.sb-roster-toggle input {
  margin: 0;
}
.label-mode-secondary {
  align-self: center;
  border: none;
  background: transparent;
  padding: 0 4px;
  color: var(--text-secondary, #64748b);
  text-decoration: underline;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.label-mode-secondary:hover {
  color: var(--primary, #4f46e5);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.filters {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.select {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  padding: 10px 12px;
  min-width: 180px;
  min-height: 44px;
}
.pending-strip {
  border: 1px solid rgba(245, 158, 11, 0.45);
  background: rgba(245, 158, 11, 0.08);
  border-radius: 12px;
  padding: 10px 12px;
}
.pending-strip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.pending-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(217, 45, 32, 0.4);
  background: rgba(217, 45, 32, 0.16);
  color: #9a1f14;
  font-weight: 900;
}
.pending-count-badge.pulse {
  animation: pendingPulse 1.1s ease-in-out infinite;
}
.pending-strip-table-wrap {
  overflow-x: auto;
}
.pending-strip-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.pending-strip-table th,
.pending-strip-table td {
  border-bottom: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  font-size: 12px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 800;
}
@keyframes pendingPulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.06); opacity: 0.72; }
  100% { transform: scale(1); opacity: 1; }
}

@media (max-width: 640px) {
  .section-header {
    flex-direction: column;
    align-items: stretch;
  }
  .filters {
    flex-direction: column;
    align-items: stretch;
  }
  .filters .select {
    min-width: 0;
    width: 100%;
  }
  .filters .btn {
    min-height: 44px;
  }
}
.error {
  color: #c33;
}
.muted {
  color: var(--text-secondary);
}
.pct-section-switcher {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--surface-muted, #f3f4f6);
  border-radius: 8px;
  margin-bottom: 12px;
}
.pct-switch-btn {
  background: transparent;
  border: none;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
}
.pct-switch-btn.is-active {
  background: var(--card-bg, #fff);
  color: var(--text, #111);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.pct-scope-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.pct-scope-btn {
  border: 1px solid var(--border, #e5e7eb);
  background: #fff;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
}
.pct-scope-btn.is-active {
  background: var(--primary, #4f46e5);
  border-color: var(--primary, #4f46e5);
  color: #fff;
}
.pct-exchange-link {
  font-size: 13px;
  font-weight: 700;
  color: #1d4ed8;
  text-decoration: none;
  margin-left: auto;
}
.pct-exchange-link:hover {
  text-decoration: underline;
}
.office-clients-table-wrap {
  overflow-x: auto;
}
.office-clients-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
}
.office-clients-table th,
.office-clients-table td {
  border-bottom: 1px solid var(--border, #e5e7eb);
  padding: 8px 10px;
  text-align: left;
  font-size: 13px;
}
.empty-state {
  border: 1px dashed var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 20px;
  text-align: center;
}
</style>

