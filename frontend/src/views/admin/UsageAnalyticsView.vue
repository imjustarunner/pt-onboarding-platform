<template>
  <div class="ua-container">
    <div class="ua-header">
      <div>
        <h1 class="ua-title">Usage Analytics</h1>
        <p class="ua-subtitle">Page visit heatmap — who's going where and how often.</p>
      </div>
      <div class="ua-controls">
        <label class="ua-control-label">
          Agency
          <select v-model="selectedAgencyId" class="ua-select">
            <option :value="null">All agencies</option>
            <option v-for="a in agencies" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <label class="ua-control-label">
          Period
          <select v-model="days" class="ua-select">
            <option :value="7">Last 7 days</option>
            <option :value="14">Last 14 days</option>
            <option :value="30">Last 30 days</option>
            <option :value="60">Last 60 days</option>
            <option :value="90">Last 90 days</option>
          </select>
        </label>
        <button class="ua-refresh-btn" type="button" :disabled="loading" @click="loadData">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="ua-error">{{ error }}</div>
    <div v-else-if="loading && !heatmapRows.length" class="ua-loading">Loading analytics…</div>

    <!-- ── PAGE VISITS HEATMAP ─────────────────────────────────── -->
    <template v-else-if="heatmapRows.length">
      <section class="ua-section">
        <h2 class="ua-section-title">Page Visits — last {{ days }} days</h2>
        <p class="ua-section-sub">Rows = users, columns = pages. Cell color = visit frequency. Click a column header to sort or navigate to that page.</p>
        <div class="ua-heatmap-scroll">
          <table class="ua-heatmap">
            <thead>
              <tr>
                <!-- User column — click to sort by total -->
                <th
                  class="ua-heatmap-user-th"
                  :class="{ 'ua-sorted': sortCol === '__total__' }"
                >
                  <div class="ua-col-head ua-col-head--left">
                    <span class="ua-col-title">User</span>
                    <button
                      type="button"
                      class="ua-sort-btn"
                      :class="{ active: sortCol === '__total__' }"
                      @click.stop="setSort('__total__')"
                    >
                      {{ sortCol === '__total__' ? (sortDir === 'desc' ? 'High ↓' : 'Low ↑') : 'Sort' }}
                    </button>
                  </div>
                </th>
                <th
                  class="ua-col-th ua-total-th"
                  :class="{ 'ua-sorted': sortCol === '__total__' }"
                >
                  <div class="ua-col-head">
                    <span class="ua-col-title">Total</span>
                    <button
                      type="button"
                      class="ua-sort-btn"
                      :class="{ active: sortCol === '__total__' }"
                      @click.stop="setSort('__total__')"
                    >
                      {{ sortCol === '__total__' ? (sortDir === 'desc' ? 'High ↓' : 'Low ↑') : 'Sort' }}
                    </button>
                  </div>
                </th>
                <!-- Per-page column headers -->
                <th
                  v-for="page in topPages"
                  :key="page"
                  class="ua-col-th"
                  :class="{ 'ua-sorted': sortCol === page }"
                >
                  <div class="ua-col-head">
                    <button
                      type="button"
                      class="ua-page-link"
                      :title="`Open ${pageLabel(page)}`"
                      @click.stop="navigateToPage(page)"
                    >
                      {{ pageLabel(page) }}
                    </button>
                    <button
                      type="button"
                      class="ua-sort-btn"
                      :class="{ active: sortCol === page }"
                      @click.stop="setSort(page)"
                    >
                      {{ sortCol === page ? (sortDir === 'desc' ? 'High ↓' : 'Low ↑') : 'Sort' }}
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in sortedHeatmapRows" :key="row.userId">
                <td class="ua-heatmap-user-td">
                  <div class="ua-user-name">{{ row.userName }}</div>
                  <div class="ua-user-role">{{ row.role }}</div>
                </td>
                <!-- Total cell -->
                <td
                  class="ua-heatmap-cell ua-total-cell"
                  :title="`${row.userName}: ${row.total} total visits`"
                >
                  <span class="ua-cell-count ua-total-count">{{ row.total }}</span>
                </td>
                <!-- Per-page cells -->
                <td
                  v-for="page in topPages"
                  :key="page"
                  class="ua-heatmap-cell"
                  :style="cellStyle(row.pageCounts[page] || 0)"
                  :title="`${row.userName} → ${page}: ${row.pageCounts[page] || 0} visits`"
                >
                  <span v-if="row.pageCounts[page]" class="ua-cell-count">{{ row.pageCounts[page] }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="ua-hint">Click a page name to open it · click Sort to rank users by that column</p>
      </section>

      <!-- ── TAB / ACTION DRILL-DOWN ─────────────────────────── -->
      <section v-if="tabHeatmapRows.length" class="ua-section">
        <h2 class="ua-section-title">Tab & Action Events — last {{ days }} days</h2>
        <p class="ua-section-sub">Within-page tab switches tracked via the new deeper tracking system.</p>
        <div class="ua-heatmap-scroll">
          <table class="ua-heatmap">
            <thead>
              <tr>
                <th
                  class="ua-heatmap-user-th"
                  :class="{ 'ua-sorted': tabSortCol === '__total__' }"
                >
                  <div class="ua-col-head ua-col-head--left">
                    <span class="ua-col-title">User</span>
                    <button
                      type="button"
                      class="ua-sort-btn"
                      :class="{ active: tabSortCol === '__total__' }"
                      @click.stop="setTabSort('__total__')"
                    >
                      {{ tabSortCol === '__total__' ? (tabSortDir === 'desc' ? 'High ↓' : 'Low ↑') : 'Sort' }}
                    </button>
                  </div>
                </th>
                <th
                  class="ua-col-th ua-total-th"
                  :class="{ 'ua-sorted': tabSortCol === '__total__' }"
                >
                  <div class="ua-col-head">
                    <span class="ua-col-title">Total</span>
                    <button
                      type="button"
                      class="ua-sort-btn"
                      :class="{ active: tabSortCol === '__total__' }"
                      @click.stop="setTabSort('__total__')"
                    >
                      {{ tabSortCol === '__total__' ? (tabSortDir === 'desc' ? 'High ↓' : 'Low ↑') : 'Sort' }}
                    </button>
                  </div>
                </th>
                <th
                  v-for="key in topTabKeys"
                  :key="key"
                  class="ua-col-th"
                  :class="{ 'ua-sorted': tabSortCol === key }"
                  :title="key"
                >
                  <div class="ua-col-head">
                    <span class="ua-col-title">{{ tabLabel(key) }}</span>
                    <button
                      type="button"
                      class="ua-sort-btn"
                      :class="{ active: tabSortCol === key }"
                      @click.stop="setTabSort(key)"
                    >
                      {{ tabSortCol === key ? (tabSortDir === 'desc' ? 'High ↓' : 'Low ↑') : 'Sort' }}
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in sortedTabHeatmapRows" :key="row.userId">
                <td class="ua-heatmap-user-td">
                  <div class="ua-user-name">{{ row.userName }}</div>
                </td>
                <td class="ua-heatmap-cell ua-total-cell" :title="`${row.userName}: ${row.total} total tab events`">
                  <span class="ua-cell-count ua-total-count">{{ row.total }}</span>
                </td>
                <td
                  v-for="key in topTabKeys"
                  :key="key"
                  class="ua-heatmap-cell"
                  :style="cellStyle(row.tabCounts[key] || 0, tabMaxCount)"
                  :title="`${row.userName} → ${key}: ${row.tabCounts[key] || 0} clicks`"
                >
                  <span v-if="row.tabCounts[key]" class="ua-cell-count">{{ row.tabCounts[key] }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <div v-else class="ua-empty-tabs">
        No tab events yet — deeper tracking just started.
        <br><small>Tabs clicked in School Management and other pages will appear here going forward.</small>
      </div>
    </template>
    <div v-else-if="!loading" class="ua-empty">No page visit data found for the selected period / agency.</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api.js';
import { useAgencyStore } from '../../store/agency.js';

const agencyStore = useAgencyStore();
const router = useRouter();
const days = ref(30);
const selectedAgencyId = ref(null);
const loading = ref(false);
const error = ref(null);

const rawPageVisits = ref([]);
const rawTabEvents = ref([]);

const agencies = computed(() => agencyStore.agencies || []);

// ─── Build heatmap data ───────────────────────────────────────────────

/** All unique pages, sorted by total visits desc. Capped at 20. */
const topPages = computed(() => {
  const totals = {};
  for (const row of rawPageVisits.value) {
    const p = row.page || 'unknown';
    totals[p] = (totals[p] || 0) + Number(row.visit_count || 0);
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([p]) => p);
});

/** Per-user rows with a pageCounts map. */
const heatmapRows = computed(() => {
  const users = {};
  for (const row of rawPageVisits.value) {
    const uid = row.user_id;
    if (!users[uid]) {
      users[uid] = {
        userId: uid,
        userName: row.user_name || `User #${uid}`,
        email: row.email || '',
        role: row.role || '',
        pageCounts: {},
        total: 0
      };
    }
    users[uid].pageCounts[row.page] = Number(row.visit_count || 0);
    users[uid].total += Number(row.visit_count || 0);
  }
  return Object.values(users).sort((a, b) => b.total - a.total);
});

const maxPageCount = computed(() => {
  let mx = 1;
  for (const row of heatmapRows.value) {
    for (const v of Object.values(row.pageCounts)) {
      if (v > mx) mx = v;
    }
  }
  return mx;
});

// ─── Tab events heatmap ───────────────────────────────────────────────

const topTabKeys = computed(() => {
  const totals = {};
  for (const row of rawTabEvents.value) {
    const key = `${row.page}/${row.tab}`;
    totals[key] = (totals[key] || 0) + Number(row.tab_count || 0);
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([k]) => k);
});

const tabHeatmapRows = computed(() => {
  const users = {};
  for (const row of rawTabEvents.value) {
    const uid = row.user_id;
    if (!users[uid]) {
      users[uid] = { userId: uid, userName: `User #${uid}`, tabCounts: {}, total: 0 };
    }
    const key = `${row.page}/${row.tab}`;
    users[uid].tabCounts[key] = Number(row.tab_count || 0);
    users[uid].total += Number(row.tab_count || 0);
  }
  // Merge user names from page visits
  for (const row of heatmapRows.value) {
    if (users[row.userId]) users[row.userId].userName = row.userName;
  }
  return Object.values(users).sort((a, b) => b.total - a.total);
});

const tabMaxCount = computed(() => {
  let mx = 1;
  for (const row of tabHeatmapRows.value) {
    for (const v of Object.values(row.tabCounts)) {
      if (v > mx) mx = v;
    }
  }
  return mx;
});

// ─── Sorting ──────────────────────────────────────────────────────────

const sortCol = ref('__total__');
const sortDir = ref('desc');

function setSort(col) {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc';
  } else {
    sortCol.value = col;
    sortDir.value = 'desc';
  }
}

const sortedHeatmapRows = computed(() => {
  const rows = [...heatmapRows.value];
  const col = sortCol.value;
  const dir = sortDir.value === 'desc' ? -1 : 1;
  return rows.sort((a, b) => {
    const va = col === '__total__' ? a.total : (a.pageCounts[col] || 0);
    const vb = col === '__total__' ? b.total : (b.pageCounts[col] || 0);
    return (vb - va) * dir;
  });
});

const tabSortCol = ref('__total__');
const tabSortDir = ref('desc');

function setTabSort(col) {
  if (tabSortCol.value === col) {
    tabSortDir.value = tabSortDir.value === 'desc' ? 'asc' : 'desc';
  } else {
    tabSortCol.value = col;
    tabSortDir.value = 'desc';
  }
}

const sortedTabHeatmapRows = computed(() => {
  const rows = [...tabHeatmapRows.value];
  const col = tabSortCol.value;
  const dir = tabSortDir.value === 'desc' ? -1 : 1;
  return rows.sort((a, b) => {
    const va = col === '__total__' ? a.total : (a.tabCounts[col] || 0);
    const vb = col === '__total__' ? b.total : (b.tabCounts[col] || 0);
    return (vb - va) * dir;
  });
});

// ─── Page navigation ──────────────────────────────────────────────────

function agencySlug(agency) {
  return String(agency?.slug || agency?.portal_url || agency?.portalUrl || '').trim().toLowerCase();
}

function resolveNavSlug() {
  if (selectedAgencyId.value) {
    const selected = agencies.value.find((a) => Number(a.id) === Number(selectedAgencyId.value));
    const selectedSlug = agencySlug(selected);
    if (selectedSlug) return selectedSlug;
  }
  const currentSlug = agencySlug(agencyStore.currentAgency);
  if (currentSlug) return currentSlug;
  const itsco = agencies.value.find((a) => agencySlug(a) === 'itsco');
  if (itsco) return 'itsco';
  return agencySlug(agencies.value[0]) || 'itsco';
}

function navigateToPage(page) {
  const slug = resolveNavSlug();
  const normalized = String(page || '').replace(/^\/+|\/+$/g, '');
  const path = !normalized || normalized === 'dashboard'
    ? `/${slug}/admin`
    : `/${slug}/admin/${normalized}`;
  router.push(path);
}

// ─── Cell styling ─────────────────────────────────────────────────────

function cellStyle(count, max) {
  const mx = max || maxPageCount.value;
  if (!count) return { background: '#f8fafc', color: '#cbd5e1' };
  const ratio = Math.min(count / mx, 1);
  // Gradient: faint green → strong green
  const lightness = Math.round(95 - ratio * 55);
  const saturation = Math.round(20 + ratio * 75);
  return {
    background: `hsl(145, ${saturation}%, ${lightness}%)`,
    color: lightness < 55 ? '#fff' : '#1e293b',
    fontWeight: '700'
  };
}

// ─── Label helpers ────────────────────────────────────────────────────

const PAGE_SHORT = {
  'clients': 'Clients',
  'school-clients': 'School Clients',
  'dashboard': 'Dashboard',
  'users': 'Users',
  'payroll': 'Payroll',
  'settings': 'Settings',
  'overview': 'Overview',
  'reports': 'Reports',
  'hiring': 'Hiring',
  'events': 'Events',
  'pending': 'Pending',
  'caseload-hub/schools-staff': 'School Management',
  'caseload-hub/calendar': 'School Calendar',
  'provider-availability': 'Provider Availability',
  'school-ops': 'School Operations',
  'schedule': 'Schedule',
  'user-manager': 'User Manager',
  'collaborative-year-update': 'Year Update',
  'portals': 'Portals',
  'school-portals': 'School Portals',
  'school-portals-hub': 'School Portals Hub',
  'communications': 'Communications',
  'provider-year-update': 'Provider Fall Update',
  'office-approvals': 'Office Approvals',
  'program-events': 'Program Events',
  'schools/overview': 'Schools Overview',
  'caseload-hub/events': 'Caseload Hub Events',
  'availability': 'Availability',
};

function humanizeSegment(seg) {
  return String(seg || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function pageLabel(page) {
  if (!page) return '';
  if (PAGE_SHORT[page]) return PAGE_SHORT[page];
  return page.split('/').map(humanizeSegment).join(' ');
}

function shortPageLabel(page) {
  if (PAGE_SHORT[page]) return PAGE_SHORT[page];
  const parts = (page || '').split('/');
  return parts[parts.length - 1].replace(/-/g, ' ').slice(0, 14) || page;
}

function tabLabel(key) {
  const [page, tab] = String(key || '').split('/');
  const pagePart = page ? pageLabel(page) : '';
  const tabPart = tab ? humanizeSegment(tab) : '';
  if (pagePart && tabPart) return `${pagePart} — ${tabPart}`;
  return tabPart || pagePart || key;
}

function shortTabLabel(key) {
  const [, tab] = key.split('/');
  return (tab || key).replace(/-/g, ' ').slice(0, 16);
}

// ─── Data fetching ────────────────────────────────────────────────────

async function loadData() {
  loading.value = true;
  error.value = null;
  try {
    const params = { days: days.value };
    if (selectedAgencyId.value) params.agencyId = selectedAgencyId.value;
    const res = await api.get('/user-nav/usage-analytics', { params, skipGlobalLoading: true });
    rawPageVisits.value = res.data?.pageVisits || [];
    rawTabEvents.value = res.data?.tabEvents || [];
  } catch (err) {
    error.value = err?.response?.data?.error || 'Failed to load analytics.';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  if (!agencyStore.agencies?.length && agencyStore.fetchAgencies) {
    await agencyStore.fetchAgencies().catch(() => {});
  }
  await loadData();
});

watch([days, selectedAgencyId], () => loadData());
</script>

<style scoped>
.ua-container {
  width: 100%;
  padding: 1.5rem 1.25rem 3rem;
}
.ua-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e5e7eb;
}
.ua-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 0.2rem;
}
.ua-subtitle {
  font-size: 0.85rem;
  color: #64748b;
  margin: 0;
}
.ua-controls {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.ua-control-label {
  display: flex;
  flex-direction: column;
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  gap: 0.2rem;
}
.ua-select {
  font-size: 0.83rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  background: #fff;
  color: #1e293b;
}
.ua-refresh-btn {
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #fff;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  color: #1e293b;
  align-self: flex-end;
}
.ua-refresh-btn:hover:not(:disabled) { background: #f1f5f9; }
.ua-refresh-btn:disabled { opacity: 0.5; cursor: default; }

.ua-error {
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 0.85rem 1rem;
  font-size: 0.88rem;
}
.ua-loading, .ua-empty, .ua-empty-tabs {
  text-align: center;
  color: #64748b;
  padding: 3rem 1rem;
  font-size: 0.9rem;
  line-height: 1.6;
}

.ua-section {
  margin-bottom: 2rem;
}
.ua-section-title {
  font-size: 1rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 0.2rem;
}
.ua-section-sub {
  font-size: 0.78rem;
  color: #64748b;
  margin: 0 0 0.75rem;
}

/* Heatmap table */
.ua-heatmap-scroll {
  overflow-x: auto;
  overflow-y: visible;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.ua-heatmap thead th {
  overflow: visible;
}
.ua-heatmap {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
  font-size: 0.78rem;
  table-layout: auto;
}

/* User column — shrink to longest name only */
.ua-heatmap-user-th {
  width: 1%;
  padding: 8px 10px;
  background: #f8fafc;
  text-align: left;
  font-weight: 700;
  color: #374151;
  border-right: 1px solid #e5e7eb;
  border-bottom: 2px solid #d1d5db;
  white-space: nowrap;
  position: sticky;
  left: 0;
  z-index: 2;
  vertical-align: bottom;
}

/* Column headers — horizontal, wrapped */
.ua-col-th {
  vertical-align: bottom;
  padding: 10px 8px;
  min-width: 90px;
  max-width: 120px;
  background: #f8fafc;
  border-bottom: 2px solid #d1d5db;
  border-left: 1px solid #e5e7eb;
}
.ua-total-th {
  min-width: 64px;
  max-width: 72px;
  background: #eef2ff;
  border-left: 2px solid #c7d2fe;
}
.ua-col-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}
.ua-col-head--left {
  align-items: flex-start;
  text-align: left;
}
.ua-col-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.25;
}
.ua-page-link {
  font-size: 0.76rem;
  font-weight: 700;
  color: #1e293b;
  background: none;
  border: none;
  cursor: pointer;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
  padding: 0;
  text-align: center;
  width: 100%;
}
.ua-page-link:hover {
  color: #15803d;
  text-decoration: underline;
}
.ua-sort-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #64748b;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 3px 8px;
  cursor: pointer;
  line-height: 1.2;
  white-space: nowrap;
}
.ua-sort-btn:hover {
  color: #1d4ed8;
  border-color: #93c5fd;
  background: #eff6ff;
}
.ua-sort-btn.active {
  background: #dbeafe;
  border-color: #60a5fa;
  color: #1d4ed8;
}

/* Sort states */
.ua-sorted { background: #eff6ff !important; }
.ua-sorted .ua-page-link,
.ua-sorted .ua-col-title { color: #1d4ed8; }

/* User data rows */
.ua-heatmap-user-td {
  width: 1%;
  padding: 0.3rem 0.5rem;
  border-right: 1px solid #e5e7eb;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
  position: sticky;
  left: 0;
  z-index: 1;
  white-space: nowrap;
}
.ua-user-name {
  font-weight: 600;
  color: #1e293b;
  font-size: 0.75rem;
}
.ua-user-role {
  font-size: 0.64rem;
  color: #94a3b8;
  text-transform: capitalize;
}

/* Data cells */
.ua-heatmap-cell {
  text-align: center;
  padding: 0.3rem 0.35rem;
  border-bottom: 1px solid #f1f5f9;
  border-left: 1px solid #f1f5f9;
  transition: filter 0.1s;
  cursor: default;
  min-width: 38px;
}
.ua-total-cell {
  background: #eef2ff !important;
  border-left: 2px solid #c7d2fe;
  font-weight: 700;
}
.ua-heatmap-cell:hover { filter: brightness(0.92); }
.ua-cell-count { font-size: 0.75rem; line-height: 1; }
.ua-total-count { color: #3730a3; font-weight: 800; font-size: 0.77rem; }

.ua-hint {
  margin-top: 0.5rem;
  font-size: 0.72rem;
  color: #94a3b8;
}
</style>
