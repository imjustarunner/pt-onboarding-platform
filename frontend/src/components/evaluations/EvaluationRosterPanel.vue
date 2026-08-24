<template>
  <div class="eval-roster">
    <div class="er-header">
      <div>
        <h2 class="er-title">Employee Evaluations</h2>
        <p class="er-subtitle">
          Semiannual self-assessments — track scheduling, submissions, and reviews for the selected period.
        </p>
      </div>
      <div class="er-controls">
        <label class="er-label">
          Half
          <select v-model="periodHalf" class="er-select">
            <option value="H1">H1</option>
            <option value="H2">H2</option>
          </select>
        </label>
        <label class="er-label">
          Year
          <input v-model.number="periodYear" class="er-input" type="number" min="2020" max="2100" />
        </label>
        <button type="button" class="er-btn er-btn--secondary" :disabled="loading" @click="load">
          Refresh
        </button>
      </div>
    </div>

    <div v-if="error" class="er-error">{{ error }}</div>

    <div class="er-stats">
      <div class="er-stat"><strong>{{ counts.not_scheduled }}</strong><span>Not scheduled</span></div>
      <div class="er-stat"><strong>{{ counts.open }}</strong><span>Open</span></div>
      <div class="er-stat"><strong>{{ counts.submitted }}</strong><span>Submitted</span></div>
      <div class="er-stat"><strong>{{ counts.reviewed }}</strong><span>Reviewed</span></div>
      <div class="er-stat"><strong>{{ counts.overdue }}</strong><span>Overdue</span></div>
    </div>

    <div class="er-table-wrap">
      <table class="er-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Job</th>
            <th>Status</th>
            <th>Due</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="er-empty">Loading…</td>
          </tr>
          <tr v-else-if="!employees.length">
            <td colspan="5" class="er-empty">No employees found for this agency.</td>
          </tr>
          <tr
            v-for="row in employees"
            :key="row.userId"
            :class="{ 'er-row--overdue': isOverdue(row) }"
          >
            <td>
              <div class="er-name">{{ fullName(row) }}</div>
              <div class="er-muted">{{ row.email || '—' }}</div>
            </td>
            <td>{{ row.jobTitle || row.title || '—' }}</td>
            <td>
              <span class="er-badge" :data-status="row.rosterStatus">
                {{ statusLabel(row.rosterStatus) }}
              </span>
              <span v-if="isOverdue(row)" class="er-overdue">Overdue</span>
            </td>
            <td>{{ fmtDate(row.cycle?.dueAt || row.cycle?.due_at) }}</td>
            <td class="er-actions">
              <router-link
                class="er-link"
                :to="profileTo(row.userId)"
              >
                Open profile
              </router-link>
              <button type="button" class="er-link er-link--btn" @click="copyHint(row)">
                Copy schedule hint
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

const route = useRoute();
const loading = ref(false);
const error = ref('');
const employees = ref([]);
const periodYear = ref(new Date().getFullYear());
const periodHalf = ref(new Date().getMonth() + 1 <= 6 ? 'H1' : 'H2');

const orgSlug = computed(() =>
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null
);

const counts = computed(() => {
  const c = {
    not_scheduled: 0,
    open: 0,
    submitted: 0,
    reviewed: 0,
    overdue: 0
  };
  for (const row of employees.value) {
    const s = String(row.rosterStatus || 'not_scheduled').toLowerCase();
    if (s === 'not_scheduled') c.not_scheduled += 1;
    else if (s === 'scheduled' || s === 'in_progress') c.open += 1;
    else if (s === 'submitted') c.submitted += 1;
    else if (s === 'reviewed' || s === 'closed') c.reviewed += 1;
    if (isOverdue(row)) c.overdue += 1;
  }
  return c;
});

function fullName(row) {
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || row.email || `User #${row.userId}`;
}

function statusLabel(status) {
  const s = String(status || 'not_scheduled').toLowerCase();
  const map = {
    not_scheduled: 'Not scheduled',
    scheduled: 'Scheduled',
    in_progress: 'In progress',
    submitted: 'Submitted',
    reviewed: 'Reviewed',
    closed: 'Closed',
    cancelled: 'Cancelled'
  };
  return map[s] || status;
}

function isOverdue(row) {
  const due = row?.cycle?.dueAt || row?.cycle?.due_at;
  if (!due) return false;
  const s = String(row.rosterStatus || '').toLowerCase();
  if (['submitted', 'reviewed', 'closed', 'cancelled'].includes(s)) return false;
  const t = new Date(due).getTime();
  return Number.isFinite(t) && t < Date.now();
}

function fmtDate(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.toLocaleDateString();
}

function profileTo(userId) {
  const id = Number(userId);
  const base = orgSlug.value
    ? `/${orgSlug.value}/admin/users/${id}`
    : `/admin/users/${id}`;
  return { path: base, query: { tab: 'evaluations' } };
}

function scheduleHintFor(row) {
  return `Schedule a Team Meeting with subtype “Employee Evaluation”, one attendee (${fullName(row)}), period ${periodHalf.value} ${periodYear.value}.`;
}

async function copyHint(row) {
  try {
    await navigator.clipboard.writeText(scheduleHintFor(row));
  } catch {
    /* ignore */
  }
}

async function loadPeriodDefaults() {
  try {
    const { data } = await api.get('/evaluations/period');
    if (data?.periodYear) periodYear.value = Number(data.periodYear);
    if (data?.periodHalf) periodHalf.value = String(data.periodHalf).toUpperCase();
  } catch {
    /* keep local defaults */
  }
}

async function load() {
  const agencyId = Number(props.agencyId || 0);
  if (!agencyId) {
    error.value = 'Agency is required.';
    employees.value = [];
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/evaluations/roster', {
      params: {
        agencyId,
        periodYear: Number(periodYear.value),
        periodHalf: String(periodHalf.value).toUpperCase()
      }
    });
    employees.value = Array.isArray(data?.employees) ? data.employees : [];
    if (data?.period?.periodYear) periodYear.value = Number(data.period.periodYear);
    if (data?.period?.periodHalf) periodHalf.value = String(data.period.periodHalf).toUpperCase();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load roster';
    employees.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.agencyId,
  async () => {
    await loadPeriodDefaults();
    await load();
  },
  { immediate: true }
);

watch([periodYear, periodHalf], () => {
  if (Number(props.agencyId || 0)) void load();
});
</script>

<style scoped>
.eval-roster {
  --ee-green: #166534;
}

.er-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.er-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: #14532d;
}

.er-subtitle {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 14px;
  max-width: 520px;
}

.er-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
}

.er-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
}

.er-select,
.er-input {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  min-width: 88px;
}

.er-btn {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  background: #f9fafb;
}

.er-btn:disabled {
  opacity: 0.55;
}

.er-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.er-stat {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 14px;
  min-width: 110px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.er-stat strong {
  font-size: 1.25rem;
  color: var(--ee-green);
}

.er-stat span {
  font-size: 12px;
  color: #6b7280;
}

.er-table-wrap {
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}

.er-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.er-table th,
.er-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: top;
}

.er-table th {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
  background: #f9fafb;
}

.er-row--overdue {
  background: #fff7ed;
}

.er-name {
  font-weight: 600;
}

.er-muted {
  font-size: 12px;
  color: #6b7280;
}

.er-badge {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: #f3f4f6;
  color: #374151;
}

.er-badge[data-status='submitted'],
.er-badge[data-status='reviewed'] {
  background: #dcfce7;
  color: #166534;
}

.er-badge[data-status='scheduled'],
.er-badge[data-status='in_progress'] {
  background: #ecfdf5;
  color: #047857;
}

.er-overdue {
  margin-left: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #c2410c;
}

.er-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.er-link {
  color: var(--ee-green);
  font-weight: 600;
  font-size: 13px;
  text-decoration: none;
}

.er-link--btn {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
}

.er-empty {
  text-align: center;
  color: #6b7280;
  padding: 24px !important;
}

.er-error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
</style>
