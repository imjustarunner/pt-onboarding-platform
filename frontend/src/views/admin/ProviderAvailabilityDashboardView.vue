<template>
  <div class="page">
    <div class="page-header" data-tour="avail-header">
      <div>
        <h1 data-tour="avail-title">Provider Availability</h1>
        <p class="page-description" data-tour="avail-subtitle">View organization slots, office availability, and virtual availability templates.</p>
      </div>
      <div class="header-actions" data-tour="avail-actions">
        <button class="btn btn-secondary" type="button" @click="tab = 'kudos'">Kudos</button>
        <button class="btn btn-secondary" type="button" @click="tab = 'tracker'">Provider App Tracker</button>
        <button class="btn btn-secondary" type="button" @click="reload" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div v-if="agencies.length > 1" class="agency-selector">
      <label>Agency</label>
      <select v-model="selectedAgencyId" @change="onAgencyChange">
        <option :value="null">Select an agency…</option>
        <option v-for="a in agencies" :key="a.id" :value="a.id">{{ a.name }}</option>
      </select>
    </div>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency first.</p>
    </div>

    <div v-else class="panel" data-tour="avail-panel">
      <div class="tabs" data-tour="avail-tabs">
        <button class="tab" :class="{ active: tab === 'school' }" @click="tab = 'school'" data-tour="avail-tab-school">Organization slots</button>
        <button class="tab" :class="{ active: tab === 'office' }" @click="tab = 'office'" data-tour="avail-tab-office">Office availability</button>
        <button class="tab" :class="{ active: tab === 'virtual' }" @click="tab = 'virtual'" data-tour="avail-tab-virtual">Virtual availability</button>
        <button class="tab" :class="{ active: tab === 'school_requests' }" @click="tab = 'school_requests'">School availability</button>
        <button class="tab" :class="{ active: tab === 'tracker' }" @click="tab = 'tracker'">Provider app tracker</button>
        <button class="tab" :class="{ active: tab === 'kudos' }" @click="tab = 'kudos'">Kudos</button>
      </div>

      <div v-if="error" class="error">{{ error }}</div>
      <div v-else-if="loading" class="loading">Loading…</div>

      <div v-else>
        <div v-if="tab === 'school_requests'" class="school-requests-wrap">
          <AvailabilityIntakeManagement :show-header="false" initial-tab="school" />
        </div>

        <div v-else-if="tab === 'kudos'" class="kudos-wrap">
          <div class="kudos-issue-card">
            <h3>Issue Kudos</h3>
            <p class="muted">
              Issue kudos from this admin page. Include a clear reason so teams can see why recognition was given.
            </p>
            <div class="kudos-issue-form">
              <div class="field">
                <label>Recipient (provider)</label>
                <select v-model="kudosIssueToUserId" class="select">
                  <option value="">Select provider…</option>
                  <option v-for="p in kudosProviders" :key="`kudos-recipient-${p.providerId}`" :value="String(p.providerId)">
                    {{ p.providerName }} ({{ p.points }} pts)
                  </option>
                </select>
              </div>
              <div class="field">
                <label>Reason</label>
                <textarea
                  v-model="kudosIssueReason"
                  class="input"
                  rows="3"
                  placeholder="Why did they earn this kudos?"
                />
              </div>
              <div class="kudos-issue-actions">
                <button
                  class="btn btn-primary"
                  type="button"
                  :disabled="kudosIssuing || !kudosIssueToUserId || kudosIssueReason.trim().length < 10"
                  @click="issueKudosFromDashboard"
                >
                  {{ kudosIssuing ? 'Sending…' : 'Issue kudos' }}
                </button>
                <span v-if="kudosIssueSuccess" class="kudos-success">{{ kudosIssueSuccess }}</span>
                <span v-else-if="kudosIssueError" class="error-inline">{{ kudosIssueError }}</span>
              </div>
            </div>
          </div>

          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Kudos earned</th>
                  <th>Kudos received (who + why)</th>
                  <th>Kudos given (who + why)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in kudosProviders" :key="`kudos-${p.providerId}`">
                  <td>
                    <div><strong>{{ p.providerName }}</strong></div>
                    <div class="muted">{{ p.email || '—' }}</div>
                  </td>
                  <td>
                    <div class="kudos-points">{{ p.points }}</div>
                    <div class="muted">Given: {{ p.givenCount }}</div>
                  </td>
                  <td>
                    <div v-if="p.received.length === 0" class="muted">No kudos received yet.</div>
                    <details v-else class="kudos-details">
                      <summary>View {{ p.received.length }} received</summary>
                      <div class="kudos-history-list">
                        <div
                          v-for="item in p.received"
                          :key="`kudos-received-${p.providerId}-${item.id}`"
                          class="kudos-history-item"
                        >
                          <div><strong>{{ item.fromName }}</strong> · {{ formatDateTime(item.createdAt) }}</div>
                          <div>{{ item.reason || 'No reason provided.' }}</div>
                          <div class="muted">{{ formatKudosStatus(item.approvalStatus, item.source) }}</div>
                        </div>
                      </div>
                    </details>
                  </td>
                  <td>
                    <div v-if="p.given.length === 0" class="muted">No kudos given yet.</div>
                    <details v-else class="kudos-details">
                      <summary>View {{ p.given.length }} given</summary>
                      <div class="kudos-history-list">
                        <div
                          v-for="item in p.given"
                          :key="`kudos-given-${p.providerId}-${item.id}`"
                          class="kudos-history-item"
                        >
                          <div><strong>{{ item.toName }}</strong> · {{ formatDateTime(item.createdAt) }}</div>
                          <div>{{ item.reason || 'No reason provided.' }}</div>
                          <div class="muted">{{ formatKudosStatus(item.approvalStatus, item.source) }}</div>
                        </div>
                      </div>
                    </details>
                  </td>
                </tr>
                <tr v-if="kudosProviders.length === 0">
                  <td colspan="4" class="muted">No provider kudos rows found.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else-if="tab === 'tracker'" class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Email</th>
                <th>First login</th>
                <th>Last login</th>
                <th>Assigned school</th>
                <th>Last school portal access</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in trackerProviders" :key="`tracker-${p.providerId}`">
                <td>{{ p.providerName }}</td>
                <td>{{ p.email || '—' }}</td>
                <td>{{ formatDateTime(p.firstLoginAt) }}</td>
                <td>{{ formatDateTime(p.lastLoginAt) }}</td>
                <td>
                  <div v-if="p.primarySchool">
                    <div>{{ p.primarySchool.schoolName || `School #${p.primarySchool.schoolOrganizationId || ''}` }}</div>
                    <details v-if="p.otherSchools.length" class="tracker-school-details">
                      <summary>Show other schools ({{ p.otherSchools.length }})</summary>
                      <div class="tracker-school-list">
                        <div v-for="(s, idx) in p.otherSchools" :key="`tracker-other-${p.providerId}-${s.schoolOrganizationId || idx}`" class="tracker-school-item">
                          <strong>{{ s.schoolName || `School #${s.schoolOrganizationId || ''}` }}</strong>
                          <span class="muted">Last portal access: {{ formatDateTime(s.lastPortalAccessAt) }}</span>
                        </div>
                      </div>
                    </details>
                  </div>
                  <span v-else>—</span>
                </td>
                <td>{{ formatDateTime(p.primarySchool?.lastPortalAccessAt) }}</td>
              </tr>
              <tr v-if="trackerProviders.length === 0">
                <td colspan="6" class="muted">No provider tracker rows found.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="filters" data-tour="avail-filters">
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
            <label>Organization</label>
            <select v-model="filters.schoolOrganizationId" class="select">
              <option value="">All</option>
              <option v-for="o in orgOptions" :key="`o-${o.id}`" :value="String(o.id)">
                {{ o.name }} ({{ String(o.organization_type || 'org').toLowerCase() }})
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
            <input v-model="filters.search" class="input" placeholder="Organization/office/provider…" />
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
          <div class="muted" style="font-size: 12px;">Organizations: {{ schoolGroups.length }} · Rows: {{ schoolRows.length }}</div>
        </div>

        <div v-if="tab === 'school'" class="table-wrap" data-tour="avail-school-table">
          <table class="table">
            <thead>
              <tr>
                <th @click="setSort('schoolName')">Organization</th>
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
                        <div class="group-title">{{ g.schoolLabel }}</div>
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
                <td colspan="7" class="muted">No matching organization slot rows.</td>
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

        <div v-else-if="tab === 'virtual'" class="table-wrap" data-tour="avail-virtual-table">
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
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import AvailabilityIntakeManagement from '../../components/admin/AvailabilityIntakeManagement.vue';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();
const agencyId = computed(() => agencyStore.currentAgency?.id || null);
const selectedAgencyId = ref(null);
const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');
const agencies = computed(() => {
  const list = isSuperAdmin.value ? (agencyStore.agencies || []) : (agencyStore.userAgencies || []);
  return (list || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
});

const loading = ref(false);
const error = ref('');
const tab = ref('school'); // school | office | virtual | school_requests | tracker | kudos

const data = ref({
  providers: [],
  organizations: [],
  offices: [],
  schoolSlots: [],
  officeAvailability: [],
  virtualWorkingHours: []
});
const trackerProviders = ref([]);
const kudosProviders = ref([]);
const kudosIssueToUserId = ref('');
const kudosIssueReason = ref('');
const kudosIssuing = ref(false);
const kudosIssueError = ref('');
const kudosIssueSuccess = ref('');

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

const formatDateTime = (value) => {
  if (!value) return '—';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString();
};

const formatKudosStatus = (approvalStatus, source) => {
  const st = String(approvalStatus || '').toLowerCase();
  if (st === 'approved') return source === 'notes_complete' ? 'Approved (notes completion)' : 'Approved';
  if (st === 'pending') return 'Pending admin approval';
  if (st === 'rejected') return 'Rejected';
  return 'Status unknown';
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
      const orgType = String(r?.schoolOrganizationType || 'school').toLowerCase();
      bySchool.set(sid, {
        schoolOrganizationId: sid,
        schoolName: r.schoolName || `Organization ${sid}`,
        schoolOrganizationType: orgType,
        rows: []
      });
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
      schoolLabel: `${g.schoolName} (${g.schoolOrganizationType || 'org'})`,
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
  if (tab.value === 'tracker') {
    await loadProviderTracker();
    return;
  }
  if (tab.value === 'kudos') {
    await loadKudosTracker();
    return;
  }
  if (tab.value === 'school_requests') return;
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

const loadKudosTracker = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    kudosIssueError.value = '';
    const resp = await api.get('/kudos/admin/tracker', {
      params: { agencyId: agencyId.value }
    });
    const rows = Array.isArray(resp?.data?.providers) ? resp.data.providers : [];
    kudosProviders.value = rows
      .map((row) => ({
        providerId: Number(row?.providerId || 0) || null,
        providerName: String(row?.providerName || '').trim() || row?.email || 'Provider',
        email: row?.email || '',
        points: Number(row?.points || 0),
        givenCount: Number(row?.givenCount || 0),
        received: Array.isArray(row?.received) ? row.received : [],
        given: Array.isArray(row?.given) ? row.given : []
      }))
      .sort((a, b) => (Number(b.points || 0) - Number(a.points || 0)) || String(a.providerName).localeCompare(String(b.providerName)));
  } catch (e) {
    kudosProviders.value = [];
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load kudos tracker';
  } finally {
    loading.value = false;
  }
};

const issueKudosFromDashboard = async () => {
  if (!agencyId.value) return;
  const toUserId = Number(kudosIssueToUserId.value || 0);
  const reason = String(kudosIssueReason.value || '').trim();
  kudosIssueError.value = '';
  kudosIssueSuccess.value = '';
  if (!toUserId) {
    kudosIssueError.value = 'Please choose a provider.';
    return;
  }
  if (reason.length < 10) {
    kudosIssueError.value = 'Please include at least 10 characters for the reason.';
    return;
  }
  if (!window.confirm('Issue kudos now? This creates a kudos entry for this provider with the reason entered.')) return;
  try {
    kudosIssuing.value = true;
    await api.post('/kudos', {
      toUserId,
      agencyId: Number(agencyId.value),
      reason
    });
    kudosIssueSuccess.value = 'Kudos submitted successfully.';
    kudosIssueReason.value = '';
    await loadKudosTracker();
  } catch (e) {
    kudosIssueError.value = e.response?.data?.error?.message || e.message || 'Failed to issue kudos';
  } finally {
    kudosIssuing.value = false;
  }
};

const loadProviderTracker = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/availability/admin/provider-app-tracker', {
      params: { agencyId: agencyId.value }
    });
    const rows = Array.isArray(resp?.data?.providers) ? resp.data.providers : [];
    trackerProviders.value = rows.map((row) => ({
      providerId: Number(row?.providerId || 0) || null,
      providerName: `${row?.firstName || ''} ${row?.lastName || ''}`.trim() || row?.email || 'Provider',
      email: row?.email || '',
      firstLoginAt: row?.firstLoginAt || null,
      lastLoginAt: row?.lastLoginAt || null,
      schools: sortSchoolsMostRecent(Array.isArray(row?.schools) ? row.schools : []),
      primarySchool: null,
      otherSchools: []
    }));
    trackerProviders.value.forEach((p) => {
      p.primarySchool = p.schools[0] || null;
      p.otherSchools = p.schools.slice(1);
    });
  } catch (e) {
    trackerProviders.value = [];
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load provider app tracker';
  } finally {
    loading.value = false;
  }
};

const sortSchoolsMostRecent = (schools) => {
  const rows = (schools || []).slice();
  rows.sort((a, b) => {
    const al = a?.lastPortalAccessAt ? new Date(a.lastPortalAccessAt).getTime() : 0;
    const bl = b?.lastPortalAccessAt ? new Date(b.lastPortalAccessAt).getTime() : 0;
    if (al !== bl) return bl - al;
    const aa = a?.assignedAt ? new Date(a.assignedAt).getTime() : 0;
    const ba = b?.assignedAt ? new Date(b.assignedAt).getTime() : 0;
    return ba - aa;
  });
  return rows;
};

const onAgencyChange = () => {
  const id = selectedAgencyId.value ? Number(selectedAgencyId.value) : null;
  const agency = agencies.value.find((a) => Number(a.id) === Number(id));
  agencyStore.setCurrentAgency(agency || null);
};

const ensureAgencyContextFromQuery = async () => {
  if (!agencies.value.length) {
    if (isSuperAdmin.value) await agencyStore.fetchAgencies();
    else await agencyStore.fetchUserAgencies();
  }
  const qAgencyId = route.query.agencyId ? Number(route.query.agencyId) : null;
  if (qAgencyId && agencies.value.some((a) => Number(a.id) === qAgencyId)) {
    selectedAgencyId.value = qAgencyId;
    const agency = agencies.value.find((a) => Number(a.id) === qAgencyId);
    agencyStore.setCurrentAgency(agency || null);
    return;
  }
  if (agencyStore.currentAgency?.id) {
    selectedAgencyId.value = Number(agencyStore.currentAgency.id);
    return;
  }
  if (agencies.value.length === 1) {
    selectedAgencyId.value = Number(agencies.value[0].id);
    agencyStore.setCurrentAgency(agencies.value[0]);
  }
};

watch(tab, (t) => {
  if (t === 'tracker') {
    loadProviderTracker();
    return;
  }
  if (t === 'kudos') {
    loadKudosTracker();
    return;
  }
  if (t === 'school_requests') return;
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
  await ensureAgencyContextFromQuery();
  await reload();
});

watch(() => agencyStore.currentAgency?.id, (id) => {
  if (!id) return;
  if (Number(selectedAgencyId.value || 0) !== Number(id)) {
    selectedAgencyId.value = Number(id);
  }
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
.agency-selector {
  margin-top: 12px;
}
.agency-selector label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.agency-selector select {
  min-width: 260px;
  max-width: 420px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  row-gap: 10px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;
  margin-bottom: 14px;
}
.tracker-school-details {
  margin-top: 4px;
}
.tracker-school-details summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--primary);
}
.tracker-school-list {
  margin-top: 6px;
  display: grid;
  gap: 6px;
}
.tracker-school-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.kudos-wrap {
  display: grid;
  gap: 12px;
}
.kudos-wrap .table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.kudos-wrap .table {
  min-width: 720px;
}
.kudos-wrap .table th,
.kudos-wrap .table td {
  vertical-align: top;
}
.kudos-wrap .table th {
  white-space: normal;
  line-height: 1.25;
}
.kudos-wrap .kudos-details summary {
  overflow-wrap: anywhere;
  word-break: break-word;
}
.kudos-wrap .kudos-history-item {
  overflow-wrap: anywhere;
  word-break: break-word;
}
.kudos-issue-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-alt);
}
.kudos-issue-card h3 {
  margin: 0 0 6px;
}
.kudos-issue-form {
  display: grid;
  gap: 10px;
}
.kudos-issue-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.kudos-points {
  font-size: 20px;
  font-weight: 900;
}
.kudos-details summary {
  cursor: pointer;
  color: var(--primary);
}
.kudos-history-list {
  margin-top: 6px;
  display: grid;
  gap: 8px;
}
.kudos-history-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  background: var(--bg);
}
.kudos-success {
  color: var(--success, #067647);
  font-weight: 700;
}
.error-inline {
  color: var(--danger, #d92d20);
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
@media (max-width: 900px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
  .header-actions {
    flex-wrap: wrap;
  }
  .tab {
    font-size: 13px;
    padding: 7px 10px;
  }
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

