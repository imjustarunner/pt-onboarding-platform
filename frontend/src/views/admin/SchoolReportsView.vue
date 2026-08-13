<template>
  <div class="school-reports-page">
    <header class="page-header">
      <div>
        <router-link class="back-link" :to="hubTo">← School Operations</router-link>
        <h1>School Reports</h1>
        <p class="subtitle">
          Year-scoped caseload, coverage, and session counts across affiliated schools.
          Assignment buckets use provider + a real weekday (Unknown does not count).
          The current year includes assigned Confirmation Pending clients still stamped last year.
        </p>
      </div>
      <div class="header-actions">
        <select
          v-if="agencies.length > 1"
          v-model.number="agencyId"
          class="toolbar-select"
          @change="reload"
        >
          <option v-for="a in agencies" :key="a.id" :value="Number(a.id)">{{ a.name }}</option>
        </select>
        <select v-model="schoolYear" class="toolbar-select" @change="reload">
          <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
        </select>
        <button type="button" class="btn btn-secondary" :disabled="loading" @click="reload">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
        <button type="button" class="btn btn-secondary" :disabled="!snapshot" @click="exportCsv">
          Export CSV
        </button>
      </div>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <p v-if="snapshot?.refreshedAt" class="meta">
      {{ snapshot.schoolYear }}
      <template v-if="snapshot.dateRange?.startYmd">
        · {{ snapshot.dateRange.startYmd }} – {{ snapshot.dateRange.endYmdExclusive }}
      </template>
      · Updated {{ formatWhen(snapshot.refreshedAt) }}
    </p>

    <section class="metrics" aria-label="Assignment snapshot">
      <article class="metric">
        <div class="label">Clients this year</div>
        <div class="value">{{ fmt(totals.clients) }}</div>
      </article>
      <article class="metric">
        <div class="label">Provider and a day</div>
        <div class="value">{{ fmt(totals.providerAndDay) }}</div>
      </article>
      <article class="metric warn">
        <div class="label">Provider, no day</div>
        <div class="value">{{ fmt(totals.providerNoDay) }}</div>
      </article>
      <article class="metric warn">
        <div class="label">No provider</div>
        <div class="value">{{ fmt(totals.noProvider) }}</div>
      </article>
      <article class="metric">
        <div class="label">Students being seen</div>
        <div class="value">{{ fmt(totals.studentsSeen) }}</div>
      </article>
      <article class="metric">
        <div class="label">Sessions this year</div>
        <div class="value">{{ fmt(totals.sessions) }}</div>
      </article>
      <article class="metric">
        <div class="label">Seen {{ snapshot?.priorSchoolYear || 'last year' }}</div>
        <div class="value">{{ fmt(snapshot?.priorYear?.studentsSeen) }}</div>
      </article>
      <article class="metric">
        <div class="label">Sessions {{ snapshot?.priorSchoolYear || 'last year' }}</div>
        <div class="value">{{ fmt(snapshot?.priorYear?.sessions) }}</div>
      </article>
    </section>

    <nav class="tabs" role="tablist">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        role="tab"
        class="tab"
        :class="{ active: tab === t.id }"
        :aria-selected="tab === t.id"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </nav>

    <div class="table-wrap">
      <input v-model="search" class="search" type="search" :placeholder="searchPlaceholder" />

      <table v-if="tab === 'schools'">
        <thead>
          <tr>
            <th @click="sortBy('schoolName')">School</th>
            <th @click="sortBy('districtName')">District</th>
            <th class="num" @click="sortBy('clients')">Clients</th>
            <th class="num" @click="sortBy('providerAndDay')">Provider + day</th>
            <th class="num" @click="sortBy('providerNoDay')">Provider, no day</th>
            <th class="num" @click="sortBy('noProvider')">No provider</th>
            <th class="num" @click="sortBy('studentsSeen')">Seen</th>
            <th class="num" @click="sortBy('studentsSeenPriorYear')">Seen last year</th>
            <th class="num" @click="sortBy('sessions')">Sessions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.schoolId">
            <td>{{ row.schoolName }}</td>
            <td>{{ row.districtName }}</td>
            <td class="num">{{ fmt(row.clients) }}</td>
            <td class="num">{{ fmt(row.providerAndDay) }}</td>
            <td class="num" :class="{ warn: row.providerNoDay }">{{ fmt(row.providerNoDay) }}</td>
            <td class="num" :class="{ warn: row.noProvider }">{{ fmt(row.noProvider) }}</td>
            <td class="num">{{ fmt(row.studentsSeen) }}</td>
            <td class="num">{{ fmt(row.studentsSeenPriorYear) }}</td>
            <td class="num">{{ fmt(row.sessions) }}</td>
          </tr>
          <tr v-if="!visibleRows.length">
            <td colspan="9" class="empty">{{ loading ? 'Loading…' : 'No schools match this filter.' }}</td>
          </tr>
        </tbody>
      </table>

      <table v-else-if="tab === 'districts'">
        <thead>
          <tr>
            <th @click="sortBy('districtName')">District</th>
            <th class="num" @click="sortBy('schools')">Schools</th>
            <th class="num" @click="sortBy('clients')">Clients</th>
            <th class="num" @click="sortBy('providerAndDay')">Provider + day</th>
            <th class="num" @click="sortBy('providerNoDay')">Provider, no day</th>
            <th class="num" @click="sortBy('noProvider')">No provider</th>
            <th class="num" @click="sortBy('studentsSeen')">Seen</th>
            <th class="num" @click="sortBy('studentsSeenPriorYear')">Seen last year</th>
            <th class="num" @click="sortBy('sessions')">Sessions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.districtName">
            <td>{{ row.districtName }}</td>
            <td class="num">{{ fmt(row.schools) }}</td>
            <td class="num">{{ fmt(row.clients) }}</td>
            <td class="num">{{ fmt(row.providerAndDay) }}</td>
            <td class="num" :class="{ warn: row.providerNoDay }">{{ fmt(row.providerNoDay) }}</td>
            <td class="num" :class="{ warn: row.noProvider }">{{ fmt(row.noProvider) }}</td>
            <td class="num">{{ fmt(row.studentsSeen) }}</td>
            <td class="num">{{ fmt(row.studentsSeenPriorYear) }}</td>
            <td class="num">{{ fmt(row.sessions) }}</td>
          </tr>
          <tr v-if="!visibleRows.length">
            <td colspan="9" class="empty">{{ loading ? 'Loading…' : 'No districts match this filter.' }}</td>
          </tr>
        </tbody>
      </table>

      <table v-else>
        <thead>
          <tr>
            <th @click="sortBy('name')">Provider</th>
            <th class="num" @click="sortBy('clients')">Clients</th>
            <th class="num" @click="sortBy('providerAndDay')">With a day</th>
            <th class="num" @click="sortBy('providerNoDay')">No day</th>
            <th class="num" @click="sortBy('daysScheduled')">Days scheduled</th>
            <th class="num" @click="sortBy('schoolsScheduled')">Schools</th>
            <th class="num" @click="sortBy('slotsTotal')">Slots total</th>
            <th class="num" @click="sortBy('slotsUsed')">Slots used</th>
            <th class="num" @click="sortBy('slotsAvailable')">Slots open</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.providerId">
            <td>{{ row.name }}</td>
            <td class="num">{{ fmt(row.clients) }}</td>
            <td class="num">{{ fmt(row.providerAndDay) }}</td>
            <td class="num" :class="{ warn: row.providerNoDay }">{{ fmt(row.providerNoDay) }}</td>
            <td class="num">{{ fmt(row.daysScheduled) }}</td>
            <td class="num">{{ fmt(row.schoolsScheduled) }}</td>
            <td class="num">{{ fmt(row.slotsTotal) }}</td>
            <td class="num">{{ fmt(row.slotsUsed) }}</td>
            <td class="num">{{ fmt(row.slotsAvailable) }}</td>
          </tr>
          <tr v-if="!visibleRows.length">
            <td colspan="9" class="empty">{{ loading ? 'Loading…' : 'No providers match this filter.' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { fetchSchoolReportsSnapshot } from '../../services/schoolReportsApi.js';
import { buildSchoolYearPickerOptions, computeCurrentSchoolYearLabel } from '../../utils/schoolYear.js';

const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');
const agencies = computed(() =>
  isSuperAdmin.value ? agencyStore.agencies || [] : agencyStore.userAgencies || agencyStore.agencies || []
);

const agencyId = ref(Number(agencyStore.currentAgency?.id || 0));
const schoolYear = ref(computeCurrentSchoolYearLabel());
const loading = ref(false);
const error = ref('');
const snapshot = ref(null);
const tab = ref('schools');
const search = ref('');
const sortKey = ref('');
const sortDir = ref('desc');

const tabs = [
  { id: 'schools', label: 'By school' },
  { id: 'districts', label: 'By district' },
  { id: 'providers', label: 'By provider' }
];

const hubTo = computed(() => {
  const slug = route.params.organizationSlug;
  return slug ? `/${slug}/school-operations` : '/school-operations';
});

const yearOptions = computed(() => {
  const fromApi = snapshot.value?.availableYears || [];
  const fallback = buildSchoolYearPickerOptions(new Date(), 3);
  const merged = [...new Set([...fromApi, ...fallback, schoolYear.value].filter(Boolean))];
  return merged.sort((a, b) => String(b).localeCompare(String(a)));
});

const totals = computed(() => snapshot.value?.totals || {
  clients: 0,
  providerAndDay: 0,
  providerNoDay: 0,
  noProvider: 0,
  studentsSeen: 0,
  sessions: 0
});

const searchPlaceholder = computed(() => {
  if (tab.value === 'districts') return 'Search districts…';
  if (tab.value === 'providers') return 'Search providers…';
  return 'Search schools or districts…';
});

const sourceRows = computed(() => {
  if (tab.value === 'districts') return snapshot.value?.districts || [];
  if (tab.value === 'providers') return snapshot.value?.providers || [];
  return snapshot.value?.schools || [];
});

const visibleRows = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  let rows = sourceRows.value;
  if (q) {
    rows = rows.filter((row) => {
      const hay = [
        row.schoolName,
        row.districtName,
        row.name
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  const key = sortKey.value;
  if (!key) return rows;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a?.[key];
    const bv = b?.[key];
    if (typeof av === 'number' || typeof bv === 'number') {
      return (Number(av) - Number(bv)) * dir;
    }
    return String(av || '').localeCompare(String(bv || '')) * dir;
  });
});

function fmt(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString() : '0';
}

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || '';
  }
}

function sortBy(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortKey.value = key;
  sortDir.value = typeof sourceRows.value?.[0]?.[key] === 'number' ? 'desc' : 'asc';
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv() {
  const rows = visibleRows.value;
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((c) => csvEscape(row[c])).join(','))
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `school-reports-${tab.value}-${schoolYear.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function reload() {
  if (!agencyId.value) {
    error.value = 'Select an agency to load school reports.';
    snapshot.value = null;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    snapshot.value = await fetchSchoolReportsSnapshot(agencyId.value, { schoolYear: schoolYear.value });
    if (snapshot.value?.schoolYear) schoolYear.value = snapshot.value.schoolYear;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load school reports';
    snapshot.value = null;
  } finally {
    loading.value = false;
  }
}

watch(tab, () => {
  search.value = '';
  sortKey.value = '';
});

onMounted(async () => {
  if (!agencyId.value && agencyStore.currentAgency?.id) {
    agencyId.value = Number(agencyStore.currentAgency.id);
  }
  if (!agencyStore.agencies?.length && agencyStore.fetchAgencies) {
    try { await agencyStore.fetchAgencies(); } catch { /* ignore */ }
  }
  if (!agencyStore.userAgencies?.length && agencyStore.fetchUserAgencies) {
    try { await agencyStore.fetchUserAgencies(); } catch { /* ignore */ }
  }
  if (!agencyId.value && agencies.value.length) {
    agencyId.value = Number(agencies.value[0].id);
  }
  await reload();
});
</script>

<style scoped>
.school-reports-page {
  padding: 24px 24px 48px;
  max-width: 1400px;
  margin: 0 auto;
  color: #0f172a;
}
.page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
h1 {
  margin: 4px 0 6px;
  font-size: 1.6rem;
}
.subtitle, .meta {
  color: #64748b;
  margin: 0;
  max-width: 720px;
  line-height: 1.45;
}
.meta { margin: 8px 0 16px; font-size: 0.9rem; }
.back-link {
  color: #0f766e;
  text-decoration: none;
  font-size: 0.9rem;
}
.header-actions {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.toolbar-select, .search, .btn {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  background: #fff;
  font: inherit;
}
.btn { cursor: pointer; }
.btn:disabled { opacity: 0.6; cursor: default; }
.error-banner {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 18px;
}
.metric {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
}
.metric.warn { border-color: #fdba74; background: #fff7ed; }
.label { color: #64748b; font-size: 0.8rem; }
.value { font-size: 1.45rem; font-weight: 700; margin-top: 4px; }
.tabs { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.tab {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
  font: inherit;
}
.tab.active {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
}
.table-wrap { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
.search { width: min(360px, 100%); margin-bottom: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
th { cursor: pointer; color: #475569; font-weight: 600; white-space: nowrap; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
td.warn { color: #c2410c; font-weight: 600; }
.empty { text-align: center; color: #64748b; }
</style>
