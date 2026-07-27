<template>
  <div class="provider-clients-tab">
    <div class="pct-section-switcher" role="tablist" aria-label="Clients sections">
      <button
        v-for="sec in primarySections"
        :key="sec.id"
        type="button"
        role="tab"
        :aria-selected="activeSection === sec.id"
        :class="['pct-switch-btn', { 'is-active': activeSection === sec.id }]"
        @click="setSection(sec.id)"
      >
        {{ sec.label }}
        <span v-if="sec.badge" class="pct-tab-badge">{{ sec.badge }}</span>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeSection === 'referrals'"
        :class="['pct-switch-btn', { 'is-active': activeSection === 'referrals' }]"
        @click="setSection('referrals')"
      >
        Referral directory
      </button>
    </div>

    <ReferralDirectoryPanel v-if="activeSection === 'referrals'" embedded />

    <ClientExchangePanel v-else-if="activeSection === 'exchange'" />

    <template v-else>
      <div class="section-header">
        <div>
          <h2 style="margin: 0;">{{ sectionTitle }}</h2>
          <p v-if="sectionHint" class="section-hint muted">{{ sectionHint }}</p>
        </div>
        <div class="filters">
          <template v-if="activeSection === 'school'">
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
          <label v-if="activeSection === 'school' && showSkillBuildersRosterToggle" class="sb-roster-toggle">
            <input v-model="skillBuildersOnlyFilter" type="checkbox" />
            <span>Skill Builders clients only</span>
          </label>
        </div>
      </div>

      <!-- School Clients -->
      <template v-if="activeSection === 'school'">
        <div v-if="error" class="error">{{ error }}</div>
        <div v-else-if="schools.length === 0 && !loading" class="muted empty-state">
          No assigned schools found for this agency. School Clients appears when you have school assignments.
        </div>

        <ClientListGrid
          v-if="selectedSchoolOrgId && schools.length"
          :organization-slug="organizationSlug"
          :organization-id="Number(selectedSchoolOrgId) || null"
          :organization-name="selectedSchoolName"
          :clients-override="isAllSchools ? allClients : null"
          roster-scope="provider"
          :skill-builders-only="skillBuildersOnlyFilter"
          :client-label-mode="clientLabelMode"
          :psychotherapy-totals-by-client-id="psychotherapyTotalsByClientId"
          :show-search="true"
          search-placeholder="Search school clients…"
          @update:needsAttentionCount="(count) => emit('update:needsAttentionCount', count)"
        />
      </template>

      <!-- Office Clients -->
      <template v-else-if="activeSection === 'office'">
        <div v-if="officeError" class="error">{{ officeError }}</div>
        <div v-else-if="!officeLoading && currentOfficeClients.length === 0" class="muted empty-state">
          No office clients assigned to you yet (clinical, virtual, tutoring, and other non-school clients).
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
              <tr v-for="c in currentOfficeClients" :key="c.id">
                <td :title="officeHoverTitle(c)">{{ formatOfficeClientLabel(c) }}</td>
                <td>{{ c.client_type === 'clinical' ? 'Office / Clinical' : 'Learning' }}</td>
                <td>{{ c.status }}</td>
                <td>{{ c.submission_date || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- New Clients (pending school + pending office) -->
      <template v-else-if="activeSection === 'new'">
        <div v-if="pendingError" class="error">{{ pendingError }}</div>
        <div v-if="officeError" class="error">{{ officeError }}</div>

        <section class="new-block">
          <div class="new-block-head">
            <strong>Pending school clients</strong>
            <span class="pending-count-badge" :class="{ pulse: pendingClientsFiltered.length }">
              {{ pendingClientsFiltered.length }}
            </span>
          </div>
          <p class="muted tiny">
            School-assigned clients still needing attention (no day, missing first session, etc.). Assign a day on School Clients when ready.
          </p>
          <div v-if="!pendingClientsFiltered.length" class="muted empty-state compact">No pending school clients.</div>
          <div v-else class="pending-strip-table-wrap">
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
                  <td>{{ pendingStageLabel(row) }}</td>
                  <td class="mono">{{ Number(row.tracking_days || 0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="new-block">
          <div class="new-block-head">
            <strong>Pending office clients</strong>
            <span class="pending-count-badge" :class="{ pulse: pendingOfficeClients.length }">
              {{ pendingOfficeClients.length }}
            </span>
          </div>
          <p class="muted tiny">
            New clinical / office intakes assigned to you that are still pending. Mark current after you accept them in your workflow.
          </p>
          <div v-if="officeLoading" class="muted">Loading…</div>
          <div v-else-if="!pendingOfficeClients.length" class="muted empty-state compact">No pending office clients.</div>
          <div v-else class="office-clients-table-wrap">
            <table class="office-clients-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Preferred</th>
                  <th>Since</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in pendingOfficeClients" :key="c.id">
                  <td :title="officeHoverTitle(c)">{{ formatOfficeClientLabel(c) }}</td>
                  <td>{{ c.client_type === 'clinical' ? 'Office / Clinical' : 'Learning' }}</td>
                  <td>{{ formatPreferred(c) }}</td>
                  <td>{{ c.submission_date || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import ClientListGrid from '../school/ClientListGrid.vue';
import ReferralDirectoryPanel from '../referralDirectory/ReferralDirectoryPanel.vue';
import ClientExchangePanel from '../clientExchange/ClientExchangePanel.vue';

const props = defineProps({
  /** school | office | new | exchange | referrals */
  initialSection: { type: String, default: '' },
});

const emit = defineEmits(['update:needsAttentionCount', 'update:pendingClientsCount']);

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const VALID_SECTIONS = new Set(['school', 'office', 'new', 'exchange', 'referrals']);

function normalizeSection(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'caseload' || s === 'in-school' || s === 'school-clients') return 'school';
  if (s === 'in-office' || s === 'office-clients') return 'office';
  if (s === 'new-clients' || s === 'pending') return 'new';
  if (s === 'client-exchange') return 'exchange';
  if (VALID_SECTIONS.has(s)) return s;
  return 'school';
}

const activeSection = ref(
  normalizeSection(props.initialSection || route.query.clients || route.query.clientsSection || 'school')
);

const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const schools = ref([]);
const selectedSchoolOrgId = ref(null);
const selectedFiscalYearStart = ref('');
const clientLabelMode = ref('initials');
const officeClients = ref([]);
const officeLoading = ref(false);
const officeError = ref('');

const isAllSchools = computed(() => selectedSchoolOrgId.value === 'all');

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

const currentUserId = computed(() => Number(authStore.user?.id || 0) || null);

const showSkillBuildersRosterToggle = computed(() => {
  const u = authStore.user;
  return u?.skill_builder_eligible === true || u?.skill_builder_eligible === 1 || u?.skill_builder_eligible === '1';
});

const pendingClientsFiltered = computed(() => {
  const selected = selectedSchoolOrgId.value;
  const base = Array.isArray(pendingClients.value) ? pendingClients.value : [];
  const rows =
    !selected || selected === 'all'
      ? base
      : base.filter((r) => Number(r?.organization_id || 0) === Number(selected || 0));
  return rows.slice().sort((a, b) => Number(b?.tracking_days || 0) - Number(a?.tracking_days || 0));
});

const isPendingStatus = (status) => {
  const s = String(status || '').toLowerCase();
  return s === 'pending' || s === 'packet' || s === 'prospective' || s === 'waitlist' || s === 'screener';
};

const currentOfficeClients = computed(() =>
  (officeClients.value || []).filter((c) => !isPendingStatus(c.status))
);

const pendingOfficeClients = computed(() =>
  (officeClients.value || []).filter((c) => isPendingStatus(c.status))
);

const newClientsCount = computed(
  () => pendingClientsFiltered.value.length + pendingOfficeClients.value.length
);

const primarySections = computed(() => {
  const list = [];
  if (schools.value.length > 0) {
    list.push({ id: 'school', label: 'School Clients', badge: 0 });
  }
  list.push({ id: 'office', label: 'Office Clients', badge: 0 });
  list.push({ id: 'new', label: 'New Clients', badge: newClientsCount.value || 0 });
  list.push({ id: 'exchange', label: 'Client Exchange', badge: 0 });
  return list;
});

const sectionTitle = computed(() => {
  if (activeSection.value === 'school') return 'School Clients';
  if (activeSection.value === 'office') return 'Office Clients';
  if (activeSection.value === 'new') return 'New Clients';
  return 'Clients';
});

const sectionHint = computed(() => {
  if (activeSection.value === 'school') {
    return 'Clients assigned to you at your schools. Sorted by school when viewing All schools.';
  }
  if (activeSection.value === 'office') {
    return 'In-office, virtual, tutoring, and other non-school clinical clients.';
  }
  if (activeSection.value === 'new') {
    return 'Pending school and office clients that still need a day, acceptance, or paperwork progress.';
  }
  return '';
});

function setSection(id) {
  const next = normalizeSection(id);
  activeSection.value = next;
  // Keep school tab selectable only when schools exist; otherwise fall back.
  if (next === 'school' && !(schools.value || []).length) {
    activeSection.value = 'office';
  }
  const q = { ...route.query, tab: 'clients', clients: activeSection.value };
  router.replace({ query: q }).catch(() => {});
  if (activeSection.value === 'office' || activeSection.value === 'new') {
    loadOfficeClients();
  }
}

const computeFiscalYearStartYmd = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = dt.getMonth() + 1;
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}-07-01`;
};

const fiscalYearOptions = computed(() => {
  const now = new Date();
  const currentStart = computeFiscalYearStartYmd(now);
  const startYear = Number(currentStart.slice(0, 4));
  const years = [startYear, startYear - 1, startYear - 2];
  return years.map((y) => ({
    startYmd: `${y}-07-01`,
    label: `${y}-${y + 1}`,
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
      surpassed_24: !!r?.surpassed_24,
    };
  }
  return m;
};

const persistClientLabelMode = () => {
  try {
    window.localStorage.setItem('dashboardClientLabelMode', clientLabelMode.value);
  } catch {
    /* ignore */
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

const emitPendingCount = () => {
  emit('update:pendingClientsCount', Number(newClientsCount.value || 0));
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

const officeHoverTitle = (c) => {
  const full = String(c?.full_name || '').trim();
  const initials = String(c?.initials || '').trim();
  return full || initials || '';
};

const pendingStageLabel = (row) => {
  if (row.pending_stage === 'no_parent_contact') return 'No parent contact date';
  if (row.pending_stage === 'no_first_session') return 'No first session date';
  if (!row.service_day && row.no_service_day) return 'No assigned day';
  return row.pending_stage || 'Pending';
};

const formatPreferred = (c) => {
  const prefs = c?.intake_preferences || c?.intake_preferences_json || null;
  let p = prefs;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      p = null;
    }
  }
  if (!p || typeof p !== 'object') return '—';
  const parts = [p.preferredDay || p.day, p.preferredTime || p.time, p.modality || p.place].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
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
        client_type: 'clinical,learning',
      },
      skipGlobalLoading: true,
    });
    const rows = Array.isArray(r.data) ? r.data : r.data?.items || [];
    officeClients.value = rows.filter((c) => String(c?.status || '').toUpperCase() !== 'ARCHIVED');
  } catch (e) {
    officeClients.value = [];
    officeError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load office clients';
  } finally {
    officeLoading.value = false;
    emitPendingCount();
  }
};

const loadSchools = async () => {
  if (!agencyId.value) return;
  const r = await api.get('/payroll/me/assigned-schools', { params: { agencyId: agencyId.value } });
  schools.value = Array.isArray(r.data) ? r.data : [];
  if (!selectedSchoolOrgId.value) {
    selectedSchoolOrgId.value = 'all';
  }
  if (activeSection.value === 'school' && !schools.value.length) {
    activeSection.value = 'office';
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
            skipGlobalLoading: true,
          })
          .then((res) => ({ school: s, rows: Array.isArray(res?.data) ? res.data : [] }))
          .catch(() => ({ school: s, rows: [] }))
      )
    );
    const byId = new Map();
    for (const { school, rows } of results) {
      for (const c of rows) {
        const id = c?.id;
        if (!id || byId.has(id)) continue;
        byId.set(id, {
          ...c,
          organization_id: c.organization_id ?? Number(school.schoolOrganizationId),
          organization_name: c.organization_name ?? school.name,
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
    params: { agencyId: agencyId.value, fiscalYearStart: selectedFiscalYearStart.value },
  });
  psychotherapyTotalsByClientId.value = buildTotalsByClientId(r.data || {});
};

const loadPendingClients = async () => {
  if (!agencyId.value || !currentUserId.value) {
    pendingClients.value = [];
    pendingError.value = '';
    emitPendingCount();
    return;
  }
  try {
    pendingError.value = '';
    const r = await api.get('/compliance-corner/pending-clients', {
      params: {
        agencyId: Number(agencyId.value),
        providerUserId: Number(currentUserId.value),
        minPendingEnteredAt: MIN_PENDING_DATE,
      },
      skipGlobalLoading: true,
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
    await Promise.all([loadCompliance(), loadPendingClients(), loadOfficeClients()]);
    if (isAllSchools.value) await loadAllRosters();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load clients';
  } finally {
    loading.value = false;
  }
};

const refreshCurrentScope = () => {
  if (activeSection.value === 'office' || activeSection.value === 'new') {
    return Promise.all([loadOfficeClients(), loadPendingClients()]);
  }
  if (activeSection.value === 'exchange') return Promise.resolve();
  return load();
};

onMounted(() => {
  try {
    const saved = window.localStorage.getItem('dashboardClientLabelMode');
    if (saved === 'codes' || saved === 'initials' || saved === 'full_name') clientLabelMode.value = saved;
  } catch {
    /* ignore */
  }
  const fromQuery = normalizeSection(route.query.clients || props.initialSection || 'school');
  activeSection.value = fromQuery;
  load();
});

watch(() => agencyId.value, load);
watch(
  () => route.query.clients,
  (v) => {
    if (v) activeSection.value = normalizeSection(v);
  }
);
watch(
  () => props.initialSection,
  (v) => {
    if (v) activeSection.value = normalizeSection(v);
  }
);
watch(() => selectedFiscalYearStart.value, () => loadCompliance().catch(() => {}));
watch(() => currentUserId.value, () => {
  loadPendingClients().catch(() => {});
  loadOfficeClients().catch(() => {});
});
watch(() => newClientsCount.value, () => emitPendingCount());

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
</script>

<style scoped>
.provider-clients-tab {
  display: grid;
  gap: 14px;
  min-width: 0;
  max-width: 100%;
}
.section-hint {
  margin: 4px 0 0;
  font-size: 0.88rem;
  max-width: 40rem;
}
.tiny { font-size: 0.8rem; }
.sb-roster-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  user-select: none;
}
.sb-roster-toggle input { margin: 0; }
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
.label-mode-secondary:hover { color: var(--primary, #0c4a6e); }

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
.new-block {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  background: #fff;
}
.new-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
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
  font-size: 12px;
}
.pending-count-badge.pulse {
  animation: pendingPulse 1.1s ease-in-out infinite;
}
.pending-strip-table-wrap { overflow-x: auto; }
.pending-strip-table,
.office-clients-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.pending-strip-table th,
.pending-strip-table td,
.office-clients-table th,
.office-clients-table td {
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
.error { color: #c33; }
.muted { color: var(--text-secondary); }
.pct-section-switcher {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  background: var(--surface-muted, #f3f4f6);
  border-radius: 10px;
}
.pct-switch-btn {
  background: transparent;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pct-switch-btn.is-active {
  background: var(--card-bg, #fff);
  color: var(--text, #111);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.pct-tab-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #c2410c;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.office-clients-table-wrap { overflow-x: auto; }
.empty-state {
  border: 1px dashed var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 20px;
  text-align: center;
}
.empty-state.compact { padding: 12px; }
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
}
</style>
