<template>
  <div class="udf-page">
    <header class="page-header">
      <div>
        <router-link class="back-link" :to="backTo">{{ backLabel }}</router-link>
        <h1>Unfinished Digital Forms</h1>
        <p class="subtitle">
          Active school and office enrollment packets that have not been submitted.
          Completed or deleted drafts leave this list automatically.
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
        <select
          v-if="scope === 'school'"
          v-model="schoolOrganizationId"
          class="toolbar-select"
          @change="reload"
        >
          <option value="">All schools</option>
          <option v-for="s in schools" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
        </select>
        <button type="button" class="btn btn-secondary" :disabled="loading" @click="reload">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
        <button type="button" class="btn btn-secondary" :disabled="!rows.length" @click="exportCsv">
          Export CSV
        </button>
      </div>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <p v-if="snapshot?.refreshedAt" class="meta">
      Scope: {{ scopeLabel }}
      · Updated {{ formatWhen(snapshot.refreshedAt) }}
    </p>

    <section class="metrics" aria-label="Unfinished forms snapshot">
      <article class="metric">
        <div class="label">Unfinished</div>
        <div class="value">{{ fmt(totals.unfinished) }}</div>
      </article>
      <article class="metric">
        <div class="label">In reminder sequence</div>
        <div class="value">{{ fmt(totals.inReminderSequence) }}</div>
      </article>
      <article class="metric">
        <div class="label">Completed (30d)</div>
        <div class="value">{{ fmt(totals.completedLast30Days) }}</div>
      </article>
      <article class="metric warn">
        <div class="label">Deleted / expired (30d)</div>
        <div class="value">{{ fmt(totals.deletedExpiredLast30Days) }}</div>
      </article>
    </section>

    <nav class="tabs" role="tablist">
      <button
        v-for="t in scopeTabs"
        :key="t.id"
        type="button"
        role="tab"
        class="tab"
        :class="{ active: scope === t.id }"
        :aria-selected="scope === t.id"
        @click="setScope(t.id)"
      >
        {{ t.label }}
      </button>
    </nav>

    <div class="table-wrap">
      <input v-model="search" class="search" type="search" placeholder="Search name, email, or school…" />

      <table>
        <thead>
          <tr>
            <th @click="sortBy('displayName')">Person</th>
            <th @click="sortBy('email')">Email</th>
            <th @click="sortBy('schoolName')">School</th>
            <th @click="sortBy('scope')">Scope</th>
            <th @click="sortBy('startedAt')">Started</th>
            <th @click="sortBy('draftExpiresAt')">Expires</th>
            <th @click="sortBy('reminderConsentStatus')">Consent</th>
            <th @click="sortBy('reminder1SentAt')">R1 (24h)</th>
            <th @click="sortBy('reminder2SentAt')">R2 (72h)</th>
            <th @click="sortBy('reminder3SentAt')">R3 (7d)</th>
            <th @click="sortBy('currentStage')">Stage</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in visibleRows"
            :key="row.id"
            class="row-click"
            @click="openDetails(row)"
          >
            <td>{{ row.displayName || '—' }}</td>
            <td>{{ row.email || '—' }}</td>
            <td>{{ row.schoolName || (row.scope === 'office' ? 'Office' : '—') }}</td>
            <td>
              <span class="pill" :class="row.scope === 'school' ? 'pill-school' : 'pill-office'">
                {{ row.scope === 'school' ? 'School' : 'Office' }}
              </span>
            </td>
            <td>{{ formatWhen(row.startedAt) }}</td>
            <td>{{ formatWhen(row.draftExpiresAt) }}</td>
            <td>
              <span class="pill" :class="consentPillClass(row.reminderConsentStatus)">
                {{ consentLabel(row.reminderConsentStatus) }}
              </span>
            </td>
            <td>
              <span class="pill" :class="reminderPillClass(row.reminder1Status, row.reminder1SentAt)">
                {{ reminderCell(row.reminder1Status, row.reminder1SentAt) }}
              </span>
            </td>
            <td>
              <span class="pill" :class="reminderPillClass(row.reminder2Status, row.reminder2SentAt)">
                {{ reminderCell(row.reminder2Status, row.reminder2SentAt) }}
              </span>
            </td>
            <td>
              <span class="pill" :class="reminderPillClass(row.reminder3Status, row.reminder3SentAt)">
                {{ reminderCell(row.reminder3Status, row.reminder3SentAt) }}
              </span>
            </td>
            <td>
              <span class="pill pill-stage">{{ stageLabel(row.currentStage) }}</span>
            </td>
          </tr>
          <tr v-if="!visibleRows.length">
            <td colspan="11" class="empty">
              {{ loading ? 'Loading…' : 'No unfinished enrollment forms match this filter.' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="selected"
      class="drawer-overlay"
      @click.self="selected = null"
    >
      <aside class="drawer" role="dialog" aria-label="Form details">
        <div class="drawer-header">
          <div>
            <h2>{{ selected.displayName || 'Unfinished form' }}</h2>
            <p class="drawer-sub">{{ selected.email || 'No email on file' }}</p>
          </div>
          <button type="button" class="btn btn-secondary" @click="selected = null">Close</button>
        </div>
        <dl class="drawer-meta">
          <div>
            <dt>School</dt>
            <dd>{{ selected.schoolName || (selected.scope === 'office' ? 'Office packet' : '—') }}</dd>
          </div>
          <div>
            <dt>Scope</dt>
            <dd>{{ selected.scope === 'school' ? 'School' : 'Office' }}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{{ formatWhen(selected.startedAt) }}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{{ formatWhen(selected.draftExpiresAt) }}</dd>
          </div>
          <div>
            <dt>Stage</dt>
            <dd>{{ stageLabel(selected.currentStage) }}</dd>
          </div>
          <div>
            <dt>Packet</dt>
            <dd>{{ selected.linkTitle || selected.formType || 'Enrollment packet' }}</dd>
          </div>
        </dl>
        <h3 class="timeline-title">Reminder timeline</h3>
        <ol class="timeline">
          <li v-for="ev in selected.timeline || []" :key="ev.id" class="timeline-item">
            <span class="timeline-dot" :class="`dot-${ev.status || 'info'}`" />
            <div>
              <div class="timeline-label">{{ ev.label }}</div>
              <div class="timeline-at">{{ formatWhen(ev.at) || 'Pending' }}</div>
              <div v-if="ev.status && ev.status !== 'info'" class="timeline-status">
                {{ String(ev.status) }}
              </div>
            </div>
          </li>
          <li v-if="!(selected.timeline || []).length" class="timeline-empty">
            No timeline events yet.
          </li>
        </ol>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { fetchUnfinishedDigitalFormsSnapshot } from '../../services/unfinishedDigitalFormsApi.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');
const agencies = computed(() =>
  isSuperAdmin.value ? agencyStore.agencies || [] : agencyStore.userAgencies || agencyStore.agencies || []
);

const agencyId = ref(Number(agencyStore.currentAgency?.id || 0));
const scope = ref(normalizeScope(route.query.scope));
const schoolOrganizationId = ref(
  route.query.schoolOrganizationId || route.query.schoolId
    ? String(route.query.schoolOrganizationId || route.query.schoolId)
    : ''
);
const loading = ref(false);
const error = ref('');
const snapshot = ref(null);
const search = ref('');
const sortKey = ref('startedAt');
const sortDir = ref('desc');
const selected = ref(null);

const scopeTabs = [
  { id: 'all', label: 'All' },
  { id: 'school', label: 'School' },
  { id: 'office', label: 'Office' }
];

const schools = computed(() => snapshot.value?.schools || []);
const rows = computed(() => snapshot.value?.rows || []);
const totals = computed(() => snapshot.value?.totals || {
  unfinished: 0,
  inReminderSequence: 0,
  completedLast30Days: 0,
  deletedExpiredLast30Days: 0
});

const scopeLabel = computed(() => {
  if (scope.value === 'school') return 'School';
  if (scope.value === 'office') return 'Office';
  return 'All';
});

const backTo = computed(() => {
  const slug = route.params.organizationSlug;
  if (scope.value === 'office') {
    return slug ? `/${slug}/schedule` : '/schedule';
  }
  return slug ? `/${slug}/admin/school-reports` : '/admin/school-reports';
});

const backLabel = computed(() => (
  scope.value === 'office' ? '← Schedule Hub' : '← School Reports'
));

const visibleRows = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  let list = rows.value;
  if (q) {
    list = list.filter((row) => {
      const hay = [row.displayName, row.email, row.schoolName, row.scope, row.linkTitle]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }
  const key = sortKey.value;
  if (!key) return list;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a?.[key];
    const bv = b?.[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' || typeof bv === 'number') {
      return (Number(av) - Number(bv)) * dir;
    }
    const aTime = Date.parse(av);
    const bTime = Date.parse(bv);
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) {
      return (aTime - bTime) * dir;
    }
    return String(av || '').localeCompare(String(bv || '')) * dir;
  });
});

function normalizeScope(v) {
  const s = String(v || 'all').toLowerCase();
  return s === 'school' || s === 'office' ? s : 'all';
}

function setScope(next) {
  scope.value = normalizeScope(next);
  if (scope.value !== 'school') schoolOrganizationId.value = '';
  syncQuery();
  reload();
}

function syncQuery() {
  const query = { ...route.query, scope: scope.value };
  if (scope.value === 'school' && schoolOrganizationId.value) {
    query.schoolOrganizationId = schoolOrganizationId.value;
  } else {
    delete query.schoolOrganizationId;
    delete query.schoolId;
  }
  router.replace({ query }).catch(() => {});
}

function fmt(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString() : '0';
}

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || '—';
  }
}

function sortBy(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortKey.value = key;
  sortDir.value = 'desc';
}

function consentLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'agreed') return 'Agreed';
  if (s === 'declined') return 'Declined';
  return 'Not asked';
}

function consentPillClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'agreed') return 'pill-ok';
  if (s === 'declined') return 'pill-warn';
  return 'pill-muted';
}

function reminderCell(status, at) {
  if (at) return formatShort(at);
  const s = String(status || '').toLowerCase();
  if (s === 'failed') return 'Failed';
  if (s === 'skipped') return 'Skipped';
  return '—';
}

function reminderPillClass(status, at) {
  const s = String(status || '').toLowerCase();
  if (s === 'failed') return 'pill-bad';
  if (s === 'skipped') return 'pill-warn';
  if (at || s === 'sent') return 'pill-ok';
  return 'pill-muted';
}

function formatShort(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return 'Sent';
  }
}

function stageLabel(stage) {
  const map = {
    awaiting_consent: 'Awaiting consent',
    declined_no_reminders: 'Declined',
    in_reminder_sequence: 'Reminders pending',
    reminder_1_sent: 'After reminder 1',
    reminder_2_sent: 'After reminder 2',
    reminder_3_sent: 'Final reminder sent'
  };
  return map[stage] || stage || '—';
}

function openDetails(row) {
  selected.value = row;
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv() {
  const list = visibleRows.value;
  if (!list.length) return;
  const columns = [
    'id',
    'displayName',
    'email',
    'schoolName',
    'scope',
    'startedAt',
    'draftExpiresAt',
    'reminderConsentStatus',
    'reminder1SentAt',
    'reminder1Status',
    'reminder2SentAt',
    'reminder2Status',
    'reminder3SentAt',
    'reminder3Status',
    'currentStage',
    'linkTitle',
    'formType'
  ];
  const lines = [
    columns.join(','),
    ...list.map((row) => columns.map((c) => csvEscape(row[c])).join(','))
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `unfinished-digital-forms-${scope.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function reload() {
  if (!agencyId.value) {
    error.value = 'Select an agency to load unfinished forms.';
    snapshot.value = null;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    snapshot.value = await fetchUnfinishedDigitalFormsSnapshot(agencyId.value, {
      scope: scope.value,
      schoolOrganizationId: scope.value === 'school' && schoolOrganizationId.value
        ? Number(schoolOrganizationId.value)
        : null
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load unfinished forms';
    snapshot.value = null;
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.query.scope,
  (v) => {
    const next = normalizeScope(v);
    if (next !== scope.value) {
      scope.value = next;
      reload();
    }
  }
);

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
.udf-page {
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
.table-wrap {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  overflow-x: auto;
}
.search { width: min(360px, 100%); margin-bottom: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
th { cursor: pointer; color: #475569; font-weight: 600; white-space: nowrap; }
.row-click { cursor: pointer; }
.row-click:hover { background: #f8fafc; }
.empty { text-align: center; color: #64748b; }
.pill {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
  border: 1px solid transparent;
}
.pill-school { background: #ecfeff; color: #0e7490; border-color: #a5f3fc; }
.pill-office { background: #f5f3ff; color: #6d28d9; border-color: #ddd6fe; }
.pill-ok { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
.pill-warn { background: #fff7ed; color: #c2410c; border-color: #fed7aa; }
.pill-bad { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
.pill-muted { background: #f8fafc; color: #64748b; border-color: #e2e8f0; }
.pill-stage { background: #f0fdfa; color: #0f766e; border-color: #99f6e4; }

.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  z-index: 80;
  display: flex;
  justify-content: flex-end;
}
.drawer {
  width: min(420px, 100%);
  height: 100%;
  background: #fff;
  box-shadow: -8px 0 24px rgba(15, 23, 42, 0.12);
  padding: 20px;
  overflow-y: auto;
}
.drawer-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.drawer-header h2 {
  margin: 0 0 4px;
  font-size: 1.2rem;
}
.drawer-sub { margin: 0; color: #64748b; font-size: 0.9rem; }
.drawer-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 0 0 20px;
}
.drawer-meta dt {
  font-size: 0.75rem;
  color: #64748b;
  margin-bottom: 2px;
}
.drawer-meta dd { margin: 0; font-weight: 600; }
.timeline-title {
  margin: 0 0 10px;
  font-size: 0.95rem;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  border-left: 2px solid #e2e8f0;
}
.timeline-item {
  position: relative;
  padding: 0 0 16px 16px;
}
.timeline-dot {
  position: absolute;
  left: -6px;
  top: 4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #94a3b8;
}
.dot-ok, .dot-sent { background: #10b981; }
.dot-warn, .dot-skipped { background: #f59e0b; }
.dot-failed, .dot-bad { background: #ef4444; }
.dot-info { background: #0f766e; }
.timeline-label { font-weight: 600; }
.timeline-at, .timeline-status { color: #64748b; font-size: 0.85rem; }
.timeline-empty { color: #64748b; padding-left: 16px; }
</style>
