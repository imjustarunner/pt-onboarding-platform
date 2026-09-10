<template>
  <article class="pop-card" :style="orderStyle">
    <div class="pop-head">
      <div>
        <h2>Onboarding &amp; Hiring Pipeline</h2>
        <p class="pop-sub">Applicants across every agency you belong to — no org switch required.</p>
      </div>
      <button type="button" class="pop-link" @click="$emit('navigate', hiringPath)">Open hiring</button>
    </div>

    <div v-if="agencies.length > 1" class="pop-toggles" role="group" aria-label="Filter by agency">
      <button
        type="button"
        class="pop-chip"
        :class="{ 'pop-chip--on': selectedAgencyIds.length === agencies.length }"
        @click="selectAllAgencies"
      >
        All agencies
      </button>
      <button
        v-for="a in agencies"
        :key="a.id"
        type="button"
        class="pop-chip"
        :class="{ 'pop-chip--on': selectedAgencyIds.includes(a.id) }"
        @click="toggleAgency(a.id)"
      >
        {{ a.name }}
      </button>
    </div>

    <div v-if="loading" class="pop-muted">Loading pipeline…</div>
    <div v-else-if="error" class="pop-error">{{ error }}</div>
    <template v-else>
      <div class="pop-kpis">
        <button
          v-for="k in kpiCards"
          :key="k.key"
          type="button"
          class="pop-kpi"
          :class="{ 'pop-kpi--on': bucketFilter === k.key }"
          @click="setBucket(k.key)"
        >
          <span class="pop-kpi-label">{{ k.label }}</span>
          <strong class="pop-kpi-value">{{ k.count }}</strong>
        </button>
      </div>

      <div class="pop-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          class="pop-tab"
          :class="{ 'pop-tab--on': tab === t.key }"
          @click="tab = t.key"
        >
          {{ t.label }}
          <span class="pop-tab-count">{{ t.count }}</span>
        </button>
      </div>

      <div v-if="!visibleRows.length" class="pop-muted">No applicants in this view.</div>
      <div v-else class="pop-table-wrap">
        <table class="pop-table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Agency</th>
              <th>Role</th>
              <th>Next step</th>
              <th>Days</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visibleRows"
              :key="`${row.userId}-${row.agencyId}`"
              @click="openCandidate(row)"
            >
              <td>
                <strong>{{ row.firstName }} {{ row.lastName }}</strong>
                <div class="pop-email">{{ row.email }}</div>
              </td>
              <td>{{ row.agencyName }}</td>
              <td>{{ row.jobTitle || '—' }}</td>
              <td>{{ row.nextStep }}</td>
              <td>{{ row.daysSince }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </article>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../../../services/api';

const props = defineProps({
  orderStyle: { type: Object, default: null },
  hiringPath: { type: String, default: '/admin/hiring' }
});

const emit = defineEmits(['navigate']);
const router = useRouter();
const route = useRoute();

const loading = ref(true);
const error = ref('');
const agencies = ref([]);
const counts = ref({});
const candidates = ref([]);
const selectedAgencyIds = ref([]);
const tab = ref('needs');
const bucketFilter = ref(null);

const kpiCards = computed(() => [
  { key: 'newApplicants', label: 'New Applicants', count: filteredCounts.value.newApplicants || 0 },
  { key: 'inPrehire', label: 'In Prehire', count: filteredCounts.value.inPrehire || 0 },
  { key: 'awaitingDocuments', label: 'Awaiting Documents', count: filteredCounts.value.awaitingDocuments || 0 },
  { key: 'readyForOnboarding', label: 'Ready for Onboarding', count: filteredCounts.value.readyForOnboarding || 0 },
  { key: 'pendingSignature', label: 'Pending Signature', count: filteredCounts.value.pendingSignature || 0 }
]);

const agencyFiltered = computed(() => {
  const ids = new Set(selectedAgencyIds.value);
  if (!ids.size || ids.size === agencies.value.length) return candidates.value;
  return candidates.value.filter((c) => ids.has(c.agencyId));
});

const filteredCounts = computed(() => {
  const next = {
    newApplicants: 0,
    inPrehire: 0,
    awaitingDocuments: 0,
    readyForOnboarding: 0,
    pendingSignature: 0
  };
  for (const c of agencyFiltered.value) {
    if (next[c.bucket] != null) next[c.bucket] += 1;
  }
  return next;
});

const tabFiltered = computed(() => {
  let rows = agencyFiltered.value;
  if (bucketFilter.value) rows = rows.filter((c) => c.bucket === bucketFilter.value);
  return rows;
});

const tabs = computed(() => {
  const rows = tabFiltered.value;
  return [
    { key: 'needs', label: 'Needs Attention', count: rows.filter((c) => c.tab === 'needs').length },
    { key: 'progress', label: 'In Progress', count: rows.filter((c) => c.tab === 'progress').length },
    { key: 'completed', label: 'Completed', count: rows.filter((c) => c.tab === 'completed').length }
  ];
});

const visibleRows = computed(() => tabFiltered.value.filter((c) => c.tab === tab.value).slice(0, 40));

function selectAllAgencies() {
  selectedAgencyIds.value = agencies.value.map((a) => a.id);
}

function toggleAgency(id) {
  const next = new Set(selectedAgencyIds.value);
  if (next.has(id)) {
    if (next.size === 1) return;
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedAgencyIds.value = [...next];
}

function setBucket(key) {
  bucketFilter.value = bucketFilter.value === key ? null : key;
}

function orgPath(path) {
  const slug = String(route.params?.organizationSlug || '').trim();
  return slug ? `/${slug}${path}` : path;
}

function openCandidate(row) {
  router.push({
    path: orgPath('/admin/hiring/applicants'),
    query: {
      candidateId: String(row.userId),
      agencyId: String(row.agencyId)
    }
  });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/hiring/pipeline-board');
    agencies.value = data?.agencies || [];
    counts.value = data?.counts || {};
    candidates.value = data?.candidates || [];
    if (!selectedAgencyIds.value.length) {
      selectedAgencyIds.value = agencies.value.map((a) => a.id);
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not load hiring pipeline.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.hiringPath, () => {});

onMounted(load);
</script>

<style scoped>
.pop-card {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 16%, #e2e8f0);
  border-radius: 18px;
  padding: 18px 20px 16px;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--ops-primary, #1f6b4a) 6%, transparent);
  grid-column: 1 / -1;
}
.pop-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.pop-head h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--ops-primary, #0f172a);
}
.pop-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: #64748b;
}
.pop-link, .pop-chip, .pop-tab, .pop-kpi {
  cursor: pointer;
  font-family: inherit;
}
.pop-link {
  border: 0;
  background: transparent;
  color: var(--ops-primary, #1f6b4a);
  font-weight: 700;
  font-size: 13px;
}
.pop-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.pop-chip {
  border: 1px solid #dbe4dc;
  background: #f8faf8;
  color: #334155;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
}
.pop-chip--on {
  background: var(--ops-primary, #1f6b4a);
  border-color: var(--ops-primary, #1f6b4a);
  color: #fff;
}
.pop-kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.pop-kpi {
  text-align: left;
  border: 1px solid #e5e7eb;
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 6%, #fff);
  border-radius: 14px;
  padding: 12px 14px;
}
.pop-kpi--on {
  outline: 2px solid var(--ops-primary, #1f6b4a);
}
.pop-kpi-label {
  display: block;
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}
.pop-kpi-value {
  display: block;
  margin-top: 6px;
  font-size: 1.55rem;
  color: var(--ops-primary, #0f172a);
}
.pop-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
}
.pop-tab {
  border: 0;
  background: transparent;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
}
.pop-tab--on {
  color: var(--ops-primary, #1f6b4a);
  box-shadow: inset 0 -2px 0 var(--ops-primary, #1f6b4a);
}
.pop-tab-count {
  margin-left: 6px;
  font-weight: 600;
  color: #94a3b8;
}
.pop-table-wrap {
  overflow-x: auto;
}
.pop-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.pop-table th {
  text-align: left;
  color: #64748b;
  font-weight: 700;
  padding: 8px 10px;
  border-bottom: 1px solid #e5e7eb;
}
.pop-table td {
  padding: 10px;
  border-bottom: 1px solid #f1f5f9;
  color: #0f172a;
  vertical-align: top;
}
.pop-table tbody tr {
  cursor: pointer;
}
.pop-table tbody tr:hover {
  background: color-mix(in srgb, var(--ops-primary, #1f6b4a) 6%, #fff);
}
.pop-email {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}
.pop-muted, .pop-error {
  padding: 16px 4px;
  font-size: 13px;
}
.pop-error { color: #b91c1c; }
@media (max-width: 900px) {
  .pop-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
