<template>
  <div class="hub-page" data-tour="caseload-hub-events">
    <header class="hub-header">
      <div>
        <h1>School Events</h1>
        <p class="subtitle">View and manage school events and provider staffing. Canonical records are company events.</p>
      </div>
      <div class="header-actions">
        <select v-if="agencies.length > 1" v-model="agencyId" class="agency-select" @change="reload">
          <option v-for="a in agencies" :key="a.id" :value="Number(a.id)">{{ a.name }}</option>
        </select>
        <router-link class="btn btn-secondary" :to="orgTo('/admin/company-events')">Event manager</router-link>
        <router-link class="btn btn-primary" :to="orgTo('/admin/caseload-hub/calendar')">Calendar</router-link>
      </div>
    </header>

    <nav class="hub-tabs">
      <button type="button" class="hub-tab" :class="{ active: tab === 'list' }" @click="tab = 'list'">Event List</button>
      <button type="button" class="hub-tab" :class="{ active: tab === 'provider-requests' }" @click="tab = 'provider-requests'">Provider Requests</button>
      <button type="button" class="hub-tab" :class="{ active: tab === 'archived' }" @click="tab = 'archived'; reload()">Archived</button>
    </nav>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="loading" class="loading">Loading events…</div>

    <div v-else-if="tab === 'provider-requests'" class="panel">
      <p class="muted">
        Review and approve provider session requests in the staffing workspace.
        Providers cannot assign themselves.
      </p>
      <router-link class="btn btn-primary" :to="orgTo('/schedule/event-staffing')">Open provider request review</router-link>
      <table v-if="eventsNeedingReview.length" class="data-table" style="margin-top: 1rem;">
        <thead>
          <tr>
            <th>Event</th>
            <th>School</th>
            <th>Pending</th>
            <th>Assigned</th>
            <th>Need</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in eventsNeedingReview" :key="e.id">
            <td>{{ e.title }}</td>
            <td>{{ e.schoolName || '—' }}</td>
            <td>{{ e.pendingRequests }}</td>
            <td>{{ e.providersAssigned }}</td>
            <td>{{ e.remainingNeed }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="panel">
      <div class="list-toolbar">
        <input v-model="search" type="search" class="search" placeholder="Search events…" />
        <select v-model="statusFilter">
          <option value="">All staffing statuses</option>
          <option value="needs_providers">Needs providers</option>
          <option value="requests_pending">Requests pending</option>
          <option value="partially_staffed">Partially staffed</option>
          <option value="fully_staffed">Fully staffed</option>
        </select>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Date &amp; time</th>
            <th>Event</th>
            <th>School</th>
            <th>Type</th>
            <th>Providers</th>
            <th>Status</th>
            <th>Portal</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in filtered" :key="e.id">
            <td>
              <div class="primary">{{ formatDate(e.startsAt) }}</div>
              <div class="muted">{{ formatTimeRange(e.startsAt, e.endsAt) }}</div>
            </td>
            <td>
              <div class="primary">{{ e.title }}</div>
              <div class="muted clamp">{{ e.description || '—' }}</div>
            </td>
            <td>{{ e.schoolName || '—' }}</td>
            <td><span class="pill">{{ labelType(e.eventType) }}</span></td>
            <td>
              {{ e.providersAssigned }}/{{ e.providersRequested }}
              <span v-if="e.pendingRequests" class="muted"> · {{ e.pendingRequests }} pending</span>
            </td>
            <td><span class="sev" :class="sevClass(e.staffingStatus)">{{ labelStatus(e.staffingStatus) }}</span></td>
            <td>{{ e.portalVisible ? 'Visible' : 'Hidden' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!filtered.length" class="empty">No events found.</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../../store/auth';
import { useAgencyStore } from '../../../store/agency';
import { fetchHubEvents } from '../../../services/schoolCoverageApi';

const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const tab = ref(String(route.query.tab || 'list'));
const agencyId = ref(null);
const agencies = computed(() => agencyStore.agencies || []);
const events = ref([]);
const loading = ref(false);
const error = ref('');
const search = ref('');
const statusFilter = ref('');

function orgTo(path) {
  const slug = route.params.organizationSlug;
  if (slug) return `/${slug}${path}`;
  return path;
}

function labelType(t) {
  const map = {
    school_back_to_school: 'Back to School',
    school_spring_event: 'Spring Event',
    school_open_house: 'Open House',
    school_resource_fair: 'Resource Fair',
    school_family_night: 'Family Night',
    school_orientation: 'Orientation',
    school_other: 'Other'
  };
  return map[t] || t || 'Event';
}

function labelStatus(s) {
  return String(s || '').replace(/_/g, ' ');
}

function sevClass(s) {
  if (s === 'needs_providers' || s === 'partially_staffed') return 'critical';
  if (s === 'requests_pending') return 'moderate';
  if (s === 'fully_staffed') return 'informational';
  return 'informational';
}

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(v);
  }
}

function formatTimeRange(a, b) {
  try {
    const s = new Date(a).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const e = b ? new Date(b).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    return e ? `${s} – ${e}` : s;
  } catch {
    return '';
  }
}

const filtered = computed(() => {
  let list = events.value;
  const q = search.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (e) =>
        String(e.title || '').toLowerCase().includes(q) ||
        String(e.schoolName || '').toLowerCase().includes(q)
    );
  }
  if (statusFilter.value) list = list.filter((e) => e.staffingStatus === statusFilter.value);
  return list;
});

const eventsNeedingReview = computed(() =>
  events.value.filter((e) => e.pendingRequests > 0 || e.remainingNeed > 0)
);

async function reload() {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const data = await fetchHubEvents(agencyId.value, { archived: tab.value === 'archived' });
    events.value = data.events || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load events';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    if (!agencyStore.agencies?.length && agencyStore.fetchAgencies) await agencyStore.fetchAgencies();
  } catch {
    /* ignore */
  }
  agencyId.value =
    Number(route.query.agencyId) ||
    Number(agencyStore.currentAgency?.id) ||
    Number(authStore.user?.agencyId) ||
    Number(agencies.value[0]?.id) ||
    null;
  if (route.query.tab) tab.value = String(route.query.tab);
  await reload();
});
</script>

<style scoped>
.hub-page { padding: 1rem 1.25rem 2rem; width: 100%; max-width: none; margin: 0; box-sizing: border-box; min-height: calc(100vh - 80px); }
.hub-header { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.hub-header h1 { margin: 0 0 0.25rem; }
.subtitle { margin: 0; color: #64748b; }
.header-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
.agency-select, .search, .list-toolbar select { padding: 0.4rem 0.6rem; border: 1px solid #cbd5e1; border-radius: 6px; }
.btn { display: inline-flex; padding: 0.45rem 0.85rem; border-radius: 6px; text-decoration: none; border: 1px solid transparent; font-size: 0.875rem; }
.btn-primary { background: #5b21b6; color: #fff; }
.btn-secondary { background: #fff; border-color: #cbd5e1; color: #334155; }
.hub-tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid #e2e8f0; margin-bottom: 1rem; }
.hub-tab { border: 0; background: transparent; padding: 0.65rem 0.9rem; cursor: pointer; color: #64748b; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.hub-tab.active { color: #5b21b6; border-bottom-color: #5b21b6; font-weight: 600; }
.panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0.85rem; }
.list-toolbar { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; }
.search { flex: 1; min-width: 160px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.data-table th, .data-table td { text-align: left; padding: 0.55rem 0.4rem; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.primary { font-weight: 600; }
.muted { color: #64748b; font-size: 0.8rem; }
.clamp { max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pill { background: #ede9fe; color: #5b21b6; padding: 0.15rem 0.45rem; border-radius: 999px; font-size: 0.75rem; }
.sev { text-transform: capitalize; font-size: 0.75rem; font-weight: 600; padding: 0.15rem 0.4rem; border-radius: 999px; }
.sev.critical { background: #fee2e2; color: #991b1b; }
.sev.moderate { background: #fef3c7; color: #92400e; }
.sev.informational { background: #e0e7ff; color: #3730a3; }
.error-banner { background: #fef2f2; color: #991b1b; padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; }
.empty, .loading { padding: 1.5rem; color: #64748b; text-align: center; }
</style>
