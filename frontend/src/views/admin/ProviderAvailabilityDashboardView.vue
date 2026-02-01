<template>
  <div class="page">
    <div class="page-header" data-tour="avail-header">
      <div>
        <h1 data-tour="avail-title">Provider Availability</h1>
        <p class="page-description" data-tour="avail-subtitle">View school slots, office availability, and virtual availability templates.</p>
      </div>
      <div class="header-actions" data-tour="avail-actions">
        <button class="btn btn-secondary" type="button" @click="reload" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency first.</p>
    </div>

    <div v-else class="panel" data-tour="avail-panel">
      <div class="tabs" data-tour="avail-tabs">
        <button class="tab" :class="{ active: tab === 'school' }" @click="tab = 'school'" data-tour="avail-tab-school">School slots</button>
        <button class="tab" :class="{ active: tab === 'office' }" @click="tab = 'office'" data-tour="avail-tab-office">Office availability</button>
        <button class="tab" :class="{ active: tab === 'virtual' }" @click="tab = 'virtual'" data-tour="avail-tab-virtual">Virtual availability</button>
      </div>

      <div v-if="error" class="error">{{ error }}</div>
      <div v-else-if="loading" class="loading">Loading…</div>

      <div v-else>
        <div class="filters" data-tour="avail-filters">
          <div class="field">
            <label>Provider</label>
            <select v-model="filters.providerId" class="select">
              <option value="">All</option>
              <option v-for="p in providerOptions" :key="`p-${p.id}`" :value="String(p.id)">
                {{ p.last_name }}, {{ p.first_name }}
              </option>
            </select>
          </div>

          <div v-if="tab === 'school'" class="field">
            <label>School / Organization</label>
            <select v-model="filters.schoolOrganizationId" class="select">
              <option value="">All</option>
              <option v-for="o in orgOptions" :key="`o-${o.id}`" :value="String(o.id)">
                {{ o.name }}
              </option>
            </select>
          </div>

          <div v-if="tab === 'office'" class="field">
            <label>Office</label>
            <select v-model="filters.officeLocationId" class="select">
              <option value="">All</option>
              <option v-for="o in officeOptions" :key="`off-${o.id}`" :value="String(o.id)">
                {{ o.name }}
              </option>
            </select>
          </div>

          <div class="field">
            <label>Day of week</label>
            <select v-model="filters.dayOfWeek" class="select">
              <option value="">All</option>
              <option v-for="d in days" :key="d" :value="d">{{ d }}</option>
            </select>
          </div>

          <div class="field">
            <label>Search</label>
            <input v-model="filters.search" class="input" placeholder="School/office/provider…" />
          </div>

          <div class="field">
            <label>Include inactive</label>
            <label class="toggle">
              <input type="checkbox" v-model="filters.includeInactive" />
              <span />
            </label>
          </div>
        </div>

        <div v-if="tab === 'school'" class="school-actions" data-tour="avail-school-actions">
          <button class="btn btn-secondary btn-sm" type="button" @click="expandAllSchools" :disabled="schoolGroups.length === 0">
            Expand all
          </button>
          <button class="btn btn-secondary btn-sm" type="button" @click="collapseAllSchools" :disabled="schoolGroups.length === 0">
            Collapse all
          </button>
          <div class="muted" style="font-size: 12px;">Schools: {{ schoolGroups.length }} · Rows: {{ schoolRows.length }}</div>
        </div>

        <div v-if="tab === 'school'" class="table-wrap" data-tour="avail-school-table">
          <table class="table">
            <thead>
              <tr>
                <th @click="setSort('schoolName')">School</th>
                <th @click="setSort('providerName')">Provider</th>
                <th @click="setSort('dayOfWeek')">Day</th>
                <th @click="setSort('startTime')">Time</th>
                <th @click="setSort('slotsTotal')">Slots total</th>
                <th @click="setSort('slotsAvailable')">Slots available</th>
                <th @click="setSort('isActive')">Active</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="g in schoolGroups" :key="`sg-${g.schoolOrganizationId}`">
                <tr class="group-row" @click="toggleSchool(g.schoolOrganizationId)">
                  <td colspan="7">
                    <div class="group-row-inner">
                      <button class="group-toggle" type="button" @click.stop="toggleSchool(g.schoolOrganizationId)">
                        <span class="caret" :class="{ open: isSchoolExpanded(g.schoolOrganizationId) }">▸</span>
                      </button>
                      <div class="group-main">
                        <div class="group-title">{{ g.schoolName }}</div>
                        <div class="group-sub muted">
                          Rows: {{ g.rows.length }} · Total: {{ g.totals.slotsAvailable }}/{{ g.totals.slotsTotal }}
                        </div>
                      </div>
                      <div class="group-days">
                        <span v-for="d in days" :key="`sg-${g.schoolOrganizationId}-${d}`" class="day-chip">
                          <span class="day">{{ d.slice(0, 3) }}</span>
                          <span class="vals">{{ g.byDay[d]?.slotsAvailable ?? 0 }}/{{ g.byDay[d]?.slotsTotal ?? 0 }}</span>
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>

                <tr
                  v-for="r in g.sortedRows"
                  v-show="isSchoolExpanded(g.schoolOrganizationId)"
                  :key="`s-${g.schoolOrganizationId}-${r.id}`"
                >
                  <td>{{ r.schoolName }}</td>
                  <td>{{ r.providerName }}</td>
                  <td>{{ r.dayOfWeek }}</td>
                  <td>{{ formatRange(r.startTime, r.endTime) }}</td>
                  <td>{{ r.slotsTotal }}</td>
                  <td :style="Number(r.slotsAvailable) < 0 ? 'color: var(--danger, #d92d20); font-weight: 800;' : ''">
                    {{ r.slotsAvailable }}
                  </td>
                  <td>{{ r.isActive ? 'Yes' : 'No' }}</td>
                </tr>
              </template>

              <tr v-if="schoolGroups.length === 0">
                <td colspan="7" class="muted">No matching school slot rows.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="tab === 'office'" class="table-wrap" data-tour="avail-office-table">
          <table class="table">
            <thead>
              <tr>
                <th @click="setSort('officeName')">Office</th>
                <th @click="setSort('roomLabel')">Room</th>
                <th @click="setSort('providerName')">Provider</th>
                <th @click="setSort('dayOfWeek')">Day</th>
                <th @click="setSort('startTime')">Time</th>
                <th @click="setSort('assignedFrequency')">Frequency</th>
                <th @click="setSort('availabilityMode')">Mode</th>
                <th @click="setSort('temporaryUntilDate')">Temporary until</th>
                <th @click="setSort('isActive')">Active</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in sortedOfficeRows" :key="`o-${r.id}`">
                <td>{{ r.officeName }}</td>
                <td>{{ r.roomLabel }}</td>
                <td>{{ r.providerName }}</td>
                <td>{{ r.dayOfWeek }}</td>
                <td>{{ formatRange(r.startTime, r.endTime) }}</td>
                <td>{{ r.assignedFrequency }}</td>
                <td>{{ r.availabilityMode }}</td>
                <td>{{ r.temporaryUntilDate || '—' }}</td>
                <td>{{ r.isActive ? 'Yes' : 'No' }}</td>
              </tr>
              <tr v-if="sortedOfficeRows.length === 0">
                <td colspan="9" class="muted">No matching office availability rows.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="table-wrap" data-tour="avail-virtual-table">
          <table class="table">
            <thead>
              <tr>
                <th @click="setSort('providerName')">Provider</th>
                <th @click="setSort('dayOfWeek')">Day</th>
                <th @click="setSort('startTime')">Start</th>
                <th @click="setSort('endTime')">End</th>
                <th @click="setSort('sessionType')">Session type</th>
                <th @click="setSort('frequency')">Frequency</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, idx) in sortedVirtualRows" :key="`v-${r.providerId}-${r.dayOfWeek}-${r.startTime}-${idx}`">
                <td>{{ r.providerName }}</td>
                <td>{{ r.dayOfWeek }}</td>
                <td>{{ r.startTime }}</td>
                <td>{{ r.endTime }}</td>
                <td>{{ r.sessionType }}</td>
                <td>{{ r.frequency }}</td>
              </tr>
              <tr v-if="sortedVirtualRows.length === 0">
                <td colspan="6" class="muted">No matching virtual working-hour rows.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const loading = ref(false);
const error = ref('');
const tab = ref('school'); // school | office | virtual

const data = ref({
  providers: [],
  organizations: [],
  offices: [],
  schoolSlots: [],
  officeAvailability: [],
  virtualWorkingHours: []
});

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const filters = ref({
  providerId: '',
  schoolOrganizationId: '',
  officeLocationId: '',
  dayOfWeek: '',
  search: '',
  includeInactive: false
});

const sortKey = ref('schoolName');
const sortDir = ref('asc'); // asc | desc

const normalize = (v) => String(v || '').toLowerCase();

const providerOptions = computed(() => data.value.providers || []);
const orgOptions = computed(() => (data.value.organizations || []).filter((o) => String(o?.organization_type || '').toLowerCase() !== 'agency'));
const officeOptions = computed(() => data.value.offices || []);

const formatRange = (start, end) => {
  const s = String(start || '').trim();
  const e = String(end || '').trim();
  if (!s && !e) return '—';
  if (s && !e) return s;
  if (!s && e) return e;
  return `${s}–${e}`;
};

const matchesCommonFilters = (row) => {
  const q = normalize(filters.value.search);
  if (q) {
    const hay = normalize(
      `${row.providerName || ''} ${row.schoolName || ''} ${row.officeName || ''} ${row.roomLabel || ''}`
    );
    if (!hay.includes(q)) return false;
  }
  if (filters.value.providerId && String(row.providerId) !== String(filters.value.providerId)) return false;
  if (filters.value.dayOfWeek && String(row.dayOfWeek) !== String(filters.value.dayOfWeek)) return false;
  return true;
};

const schoolRows = computed(() => {
  const rows = data.value.schoolSlots || [];
  return rows.filter((r) => {
    if (!filters.value.includeInactive && !r.isActive) return false;
    if (filters.value.schoolOrganizationId && String(r.schoolOrganizationId) !== String(filters.value.schoolOrganizationId)) return false;
    return matchesCommonFilters(r);
  });
});

const officeRows = computed(() => {
  const rows = data.value.officeAvailability || [];
  return rows.filter((r) => {
    if (!filters.value.includeInactive && !r.isActive) return false;
    if (filters.value.officeLocationId && String(r.officeLocationId) !== String(filters.value.officeLocationId)) return false;
    return matchesCommonFilters(r);
  });
});

const virtualRows = computed(() => {
  const rows = data.value.virtualWorkingHours || [];
  return rows.filter((r) => matchesCommonFilters(r));
});

const cmp = (a, b) => {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
};

const sortRows = (rows) => {
  const key = sortKey.value;
  const dir = sortDir.value;
  const out = (rows || []).slice();
  out.sort((ra, rb) => {
    const v = cmp(ra?.[key], rb?.[key]);
    return dir === 'asc' ? v : -v;
  });
  return out;
};

const sortedSchoolRows = computed(() => sortRows(schoolRows.value));
const sortedOfficeRows = computed(() => sortRows(officeRows.value));
const sortedVirtualRows = computed(() => sortRows(virtualRows.value));

const expandedSchools = ref({});
const isSchoolExpanded = (schoolOrganizationId) => !!expandedSchools.value?.[String(schoolOrganizationId)];
const toggleSchool = (schoolOrganizationId) => {
  const id = String(schoolOrganizationId || '');
  if (!id) return;
  expandedSchools.value = { ...(expandedSchools.value || {}), [id]: !expandedSchools.value?.[id] };
};
const expandAllSchools = () => {
  const next = {};
  for (const g of schoolGroups.value || []) next[String(g.schoolOrganizationId)] = true;
  expandedSchools.value = next;
};
const collapseAllSchools = () => {
  const next = {};
  for (const g of schoolGroups.value || []) next[String(g.schoolOrganizationId)] = false;
  expandedSchools.value = next;
};

const sumSchoolRows = (rows) => {
  let slotsTotal = 0;
  let slotsAvailable = 0;
  for (const r of rows || []) {
    slotsTotal += Number(r?.slotsTotal || 0);
    slotsAvailable += Number(r?.slotsAvailable || 0);
  }
  return { slotsTotal, slotsAvailable };
};

const schoolGroups = computed(() => {
  const rows = schoolRows.value || [];
  const bySchool = new Map();
  for (const r of rows) {
    const sid = Number(r?.schoolOrganizationId || 0);
    if (!sid) continue;
    if (!bySchool.has(sid)) {
      bySchool.set(sid, { schoolOrganizationId: sid, schoolName: r.schoolName || `School ${sid}`, rows: [] });
    }
    bySchool.get(sid).rows.push(r);
  }

  const groups = Array.from(bySchool.values());
  // Group ordering: only allow sort by schoolName; otherwise keep stable alphabetical.
  groups.sort((a, b) => {
    const base = String(a.schoolName || '').localeCompare(String(b.schoolName || ''));
    if (sortKey.value === 'schoolName') return sortDir.value === 'asc' ? base : -base;
    return base;
  });

  const rowSortKey = sortKey.value === 'schoolName' ? 'providerName' : sortKey.value;
  const rowSortDir = sortKey.value === 'schoolName' ? 'asc' : sortDir.value;

  return groups.map((g) => {
    const byDay = {};
    for (const d of days) byDay[d] = { slotsTotal: 0, slotsAvailable: 0 };
    for (const r of g.rows) {
      const d = String(r?.dayOfWeek || '');
      if (!byDay[d]) continue;
      byDay[d].slotsTotal += Number(r?.slotsTotal || 0);
      byDay[d].slotsAvailable += Number(r?.slotsAvailable || 0);
    }

    const sortedRows = (g.rows || []).slice().sort((ra, rb) => {
      const v = cmp(ra?.[rowSortKey], rb?.[rowSortKey]);
      return rowSortDir === 'asc' ? v : -v;
    });

    return {
      ...g,
      totals: sumSchoolRows(g.rows),
      byDay,
      sortedRows
    };
  });
});

const setSort = (key) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortKey.value = key;
  sortDir.value = 'asc';
};

const reload = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/availability/admin/provider-availability-dashboard', {
      params: {
        agencyId: agencyId.value,
        includeInactive: filters.value.includeInactive ? 'true' : 'false'
      }
    });
    data.value = resp.data || data.value;
  } catch (e) {
    data.value = { providers: [], organizations: [], offices: [], schoolSlots: [], officeAvailability: [], virtualWorkingHours: [] };
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load availability dashboard';
  } finally {
    loading.value = false;
  }
};

watch(tab, (t) => {
  // Set a reasonable default sort per tab
  if (t === 'school') {
    sortKey.value = 'schoolName';
    sortDir.value = 'asc';
  } else if (t === 'office') {
    sortKey.value = 'officeName';
    sortDir.value = 'asc';
  } else {
    sortKey.value = 'providerName';
    sortDir.value = 'asc';
  }
});

watch(agencyId, async () => {
  await reload();
});

watch(schoolGroups, (next) => {
  // Default to expanded for newly visible schools, without clobbering existing toggles.
  const cur = expandedSchools.value || {};
  const out = { ...cur };
  for (const g of next || []) {
    const k = String(g.schoolOrganizationId);
    if (!(k in out)) out[k] = true;
  }
  expandedSchools.value = out;
});

onMounted(async () => {
  if (!agencyStore.currentAgency) {
    await agencyStore.fetchUserAgencies();
  }
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
.tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
  margin-bottom: 14px;
}
.tab {
  border: 1px solid var(--border);
  background: white;
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 800;
  cursor: pointer;
}
.tab.active {
  border-color: var(--accent);
  color: var(--primary);
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
.filters {
  display: grid;
  grid-template-columns: repeat(6, minmax(160px, 1fr));
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
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
  cursor: pointer;
  user-select: none;
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
  grid-template-columns: 30px minmax(220px, 1fr) minmax(260px, 2fr);
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
.group-days {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.day-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: white;
  font-size: 12px;
  white-space: nowrap;
}
.day-chip .day {
  font-weight: 900;
  color: var(--text-secondary);
}
.day-chip .vals {
  font-weight: 800;
  color: var(--text-primary);
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
  .group-row-inner {
    grid-template-columns: 30px 1fr;
  }
  .group-days {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}
</style>

