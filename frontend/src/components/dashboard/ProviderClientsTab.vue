<template>
  <div class="provider-clients-tab">
    <div class="section-header">
      <h2 style="margin: 0;">Clients</h2>
      <div class="filters">
        <label>
          <span class="label">School</span>
          <select class="select" v-model="selectedSchoolOrgId">
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
        <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-else-if="schools.length === 0 && !loading" class="muted">
      No assigned schools found for this agency.
    </div>

    <ClientListGrid
      v-if="selectedSchoolOrgId"
      :organization-slug="organizationSlug"
      :organization-id="Number(selectedSchoolOrgId)"
      :organization-name="selectedSchoolName"
      roster-scope="provider"
      client-label-mode="codes"
      :psychotherapy-totals-by-client-id="psychotherapyTotalsByClientId"
      :show-search="true"
      search-placeholder="Search clients…"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import ClientListGrid from '../school/ClientListGrid.vue';

const route = useRoute();
const agencyStore = useAgencyStore();

const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const schools = ref([]);
const selectedSchoolOrgId = ref(null);
const selectedFiscalYearStart = ref('');

const selectedSchoolName = computed(() => {
  const id = selectedSchoolOrgId.value;
  if (!id) return '';
  const s = (schools.value || []).find((x) => Number(x.schoolOrganizationId) === Number(id));
  return s?.name || '';
});
const loading = ref(false);
const error = ref('');
const psychotherapyTotalsByClientId = ref(null);

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

const loadSchools = async () => {
  if (!agencyId.value) return;
  const r = await api.get('/payroll/me/assigned-schools', { params: { agencyId: agencyId.value } });
  schools.value = Array.isArray(r.data) ? r.data : [];
  if (!selectedSchoolOrgId.value && schools.value.length > 0) {
    selectedSchoolOrgId.value = Number(schools.value[0].schoolOrganizationId);
  }
};

const loadCompliance = async () => {
  if (!agencyId.value) return;
  const r = await api.get('/psychotherapy-compliance/summary', {
    params: { agencyId: agencyId.value, fiscalYearStart: selectedFiscalYearStart.value }
  });
  psychotherapyTotalsByClientId.value = buildTotalsByClientId(r.data || {});
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
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load clients';
  } finally {
    loading.value = false;
  }
};

onMounted(load);
watch(() => agencyId.value, load);
watch(() => selectedFiscalYearStart.value, () => loadCompliance().catch(() => {}));
</script>

<style scoped>
.provider-clients-tab {
  display: grid;
  gap: 14px;
  min-width: 0;
  max-width: 100%;
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
  min-width: 220px;
}
.error {
  color: #c33;
}
.muted {
  color: var(--text-secondary);
}
</style>

