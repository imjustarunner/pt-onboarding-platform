<template>
  <div class="top-card" :class="ratioCardClass">
    <div class="top-card-head">
      <div>
        <div class="title">My Snapshot</div>
        <div class="sub" v-if="summary?.lastPaycheck">
          Last paycheck: <strong>{{ summary.lastPaycheck.periodStart }} → {{ summary.lastPaycheck.periodEnd }}</strong>
        </div>
        <div class="sub muted" v-else>No posted payroll yet for this organization.</div>
      </div>

      <div class="actions">
        <button
          class="btn btn-primary btn-sm"
          type="button"
          :disabled="!summary?.lastPaycheck"
          @click="openLastPaycheck"
        >
          View last paycheck
        </button>
        <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="load">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error-box" style="margin-top: 10px;">{{ error }}</div>
    <div v-else-if="loading" class="muted" style="margin-top: 10px;">Loading dashboard summary…</div>

    <div v-else class="grid">
      <div class="cell">
        <div class="label">Last paycheck amount</div>
        <div class="value">{{ summary?.lastPaycheck ? fmtMoney(summary.lastPaycheck.totalPay) : '—' }}</div>
      </div>

      <div class="cell" v-if="isProvider">
        <div class="label">Incomplete notes (last pay period)</div>
        <div class="value">
          {{ fmtNum(summary?.unpaidNotes?.lastPayPeriod?.totalUnits || 0) }}
          <span class="muted">units</span>
        </div>
        <div class="muted small">
          No Note {{ fmtNum(summary?.unpaidNotes?.lastPayPeriod?.noNoteUnits || 0) }} · Draft {{ fmtNum(summary?.unpaidNotes?.lastPayPeriod?.draftUnits || 0) }}
        </div>
      </div>

      <div class="cell" v-if="isProvider && (summary?.unpaidNotes?.priorStillUnpaid?.totalUnits || 0) > 0">
        <div class="label">Still unpaid from prior pay period</div>
        <div class="value danger">{{ fmtNum(summary.unpaidNotes.priorStillUnpaid.totalUnits) }} <span class="muted">units</span></div>
        <div class="muted small">
          {{ summary.unpaidNotes.priorStillUnpaid.periodStart }} → {{ summary.unpaidNotes.priorStillUnpaid.periodEnd }}
        </div>
      </div>

      <div class="cell" v-if="isProvider && (summary?.unpaidNotes?.twoPeriodsOld?.totalUnits || 0) > 0">
        <div class="label">Aging unpaid notes (2 pay periods old)</div>
        <div class="value danger">{{ fmtNum(summary.unpaidNotes.twoPeriodsOld.totalUnits) }} <span class="muted">units</span></div>
        <div class="muted small">
          {{ summary.unpaidNotes.twoPeriodsOld.periodStart }} → {{ summary.unpaidNotes.twoPeriodsOld.periodEnd }}
        </div>
      </div>

      <div class="cell" v-if="showRatio">
        <div class="label">Direct/Indirect ratio</div>
        <div class="ratio-row">
          <div class="pill" :class="`pill-${summary.directIndirect.last.kind}`">
            Last: {{ fmtPct(summary.directIndirect.last.ratio) }}
          </div>
          <div class="pill" :class="`pill-${summary.directIndirect.avg90.kind}`">
            90-day: {{ fmtPct(summary.directIndirect.avg90.ratio) }}
          </div>
        </div>
        <div class="muted small">
          Goal: green ≤ 15% · yellow 15–25% · red &gt; 25%
        </div>
      </div>

      <div class="cell" v-if="summary?.supervision?.enabled && summary?.supervision?.isPrelicensed">
        <div class="label">Supervision hours (prelicensed)</div>
        <div class="value">
          {{ fmtNum(summary.supervision.totalHours) }}
          <span class="muted">total</span>
        </div>
        <div class="muted small">
          Individual {{ fmtNum(summary.supervision.individualHours) }} / {{ fmtNum(summary.supervision.requiredIndividualHours) }} ·
          Group {{ fmtNum(summary.supervision.groupHours) }} / {{ fmtNum(summary.supervision.requiredGroupHours) }}
        </div>
      </div>

      <div class="cell">
        <div class="label">PTO balances</div>
        <div class="muted small">
          Sick: <strong>{{ fmtNum(summary?.pto?.balances?.sickHours || 0) }}</strong> hrs
          <span class="muted">·</span>
          Training: <strong>{{ fmtNum(summary?.pto?.balances?.trainingHours || 0) }}</strong> hrs
        </div>
      </div>

      <div class="cell" v-if="summary?.supervisor?.name">
        <div class="label">Supervisor</div>
        <div class="value">{{ summary.supervisor.name }}</div>
      </div>

      <div class="cell">
        <div class="label">Primary office</div>
        <div class="value">{{ officeLine1 }}</div>
        <div class="muted small">{{ officeLine2 }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const isProvider = computed(() => {
  const u = authStore.user;
  if (!u) return false;
  const role = String(u.role || '').toLowerCase();
  if (role === 'provider') return true;
  if (u.has_provider_access === true || u.has_provider_access === 1 || u.has_provider_access === '1') return true;
  return false;
});

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const loading = ref(false);
const error = ref('');
const summary = ref(null);

const showRatio = computed(() => {
  const di = summary.value?.directIndirect || null;
  return !!(di && !di.disabled && di.last && di.avg90);
});

// Card-level color: green if both last and 90-day are green; red if either is red; else yellow.
const ratioCardClass = computed(() => {
  const di = summary.value?.directIndirect || null;
  if (!di || di.disabled || !di.last || !di.avg90) return '';
  const lastKind = di.last?.kind || '';
  const avgKind = di.avg90?.kind || '';
  if (lastKind === 'red' || avgKind === 'red') return 'top-card-ratio-red';
  if (lastKind === 'green' && avgKind === 'green') return 'top-card-ratio-green';
  return 'top-card-ratio-yellow';
});

const officeLine1 = computed(() => {
  const o = summary.value?.office || null;
  if (!o) return '—';
  const name = String(o.name || '').trim();
  return name || '—';
});
const officeLine2 = computed(() => {
  const o = summary.value?.office || null;
  if (!o) return '';
  const parts = [o.streetAddress, [o.city, o.state].filter(Boolean).join(', '), o.postalCode].filter(Boolean);
  return parts.join(' ') || '—';
});

const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtMoney = (v) => Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const fmtPct = (r) => {
  if (r === null || r === undefined) return '—';
  if (!Number.isFinite(Number(r))) return '>100%';
  return `${Math.round(Number(r) * 1000) / 10}%`;
};

const load = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/payroll/me/dashboard-summary', { params: { agencyId: agencyId.value } });
    summary.value = resp.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load dashboard summary';
    summary.value = null;
  } finally {
    loading.value = false;
  }
};

const openLastPaycheck = () => {
  const pid = summary.value?.lastPaycheck?.payrollPeriodId || null;
  if (!pid) return;
  router.replace({
    query: {
      ...route.query,
      tab: 'payroll',
      expandPayrollPeriodId: String(pid)
    }
  });
};

onMounted(load);
</script>

<style scoped>
.top-card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 14px;
  box-shadow: var(--shadow);
}
.top-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.title {
  font-weight: 800;
  color: var(--text-primary);
}
.sub {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
  justify-content: flex-end;
}
@media (max-width: 520px) {
  .actions { flex-wrap: wrap; }
}
.grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 980px) {
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .grid { grid-template-columns: 1fr; }
}
.cell {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  background: var(--bg-alt);
}
.label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.value {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}
.small { font-size: 12px; }
.muted { color: var(--text-secondary); }
.danger { color: #991b1b; }
.ratio-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.pill {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: white;
  font-weight: 800;
  font-size: 12px;
}
.pill-green { border-color: rgba(34,197,94,0.35); background: rgba(34,197,94,0.12); color: #166534; }
.pill-yellow { border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.12); color: #92400e; }
.pill-red { border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.10); color: #991b1b; }

/* Card-level ratio color (for hourly workers) */
.top-card-ratio-green { border-left: 4px solid #22c55e; background: linear-gradient(to right, rgba(34,197,94,0.06), transparent); }
.top-card-ratio-yellow { border-left: 4px solid #eab308; background: linear-gradient(to right, rgba(234,179,8,0.06), transparent); }
.top-card-ratio-red { border-left: 4px solid #ef4444; background: linear-gradient(to right, rgba(239,68,68,0.06), transparent); }
</style>

