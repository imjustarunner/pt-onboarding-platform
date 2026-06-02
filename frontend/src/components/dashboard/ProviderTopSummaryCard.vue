<template>
  <div class="snap" :class="ratioCardClass">
    <!-- Header row -->
    <div class="snap-head">
      <div class="snap-head-left">
        <span class="snap-title">My Snapshot</span>
        <span v-if="summary?.lastPaycheck" class="snap-period">
          {{ summary.lastPaycheck.periodStart }} → {{ summary.lastPaycheck.periodEnd }}
        </span>
        <span v-else class="snap-period snap-period--muted">No posted payroll yet</span>
      </div>
      <div class="snap-head-right">
        <button
          class="snap-btn snap-btn--primary"
          type="button"
          :disabled="!summary?.lastPaycheck"
          @click="openLastPaycheck"
        >View paycheck</button>
        <button class="snap-btn snap-btn--ghost" type="button" :disabled="loading" @click="load">
          {{ loading ? '…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <!-- Stat strip -->
    <div v-if="error" class="snap-error">{{ error }}</div>
    <div v-else-if="loading" class="snap-loading">Loading…</div>
    <div v-else class="snap-stats">

      <div class="snap-stat">
        <span class="snap-stat-label">Last paycheck</span>
        <span class="snap-stat-value snap-stat-value--green">
          {{ summary?.lastPaycheck ? fmtMoney(summary.lastPaycheck.totalPay) : '—' }}
        </span>
      </div>

      <div class="snap-stat" v-if="isProvider">
        <span class="snap-stat-label">Incomplete notes</span>
        <span
          class="snap-stat-value"
          :class="(summary?.unpaidNotes?.lastPayPeriod?.totalNotes ?? summary?.unpaidNotes?.lastPayPeriod?.totalUnits ?? 0) > 0 ? 'snap-stat-value--warn' : ''"
        >
          {{ fmtNum((summary?.unpaidNotes?.lastPayPeriod?.totalNotes ?? summary?.unpaidNotes?.lastPayPeriod?.totalUnits) || 0) }}
        </span>
        <span class="snap-stat-hint">
          No Note {{ fmtNum((summary?.unpaidNotes?.lastPayPeriod?.noNoteNotes ?? summary?.unpaidNotes?.lastPayPeriod?.noNoteUnits) || 0) }}
          · Draft {{ fmtNum((summary?.unpaidNotes?.lastPayPeriod?.draftNotes ?? summary?.unpaidNotes?.lastPayPeriod?.draftUnits) || 0) }}
        </span>
      </div>

      <div
        class="snap-stat snap-stat--alert"
        v-if="isProvider && (summary?.unpaidNotes?.priorStillUnpaid?.totalNotes || summary?.unpaidNotes?.priorStillUnpaid?.totalUnits || 0) > 0"
      >
        <span class="snap-stat-label">Prior unpaid</span>
        <span class="snap-stat-value snap-stat-value--danger">
          {{ fmtNum(summary.unpaidNotes.priorStillUnpaid.totalNotes ?? summary.unpaidNotes.priorStillUnpaid.totalUnits) }}
        </span>
        <span class="snap-stat-hint">
          {{ summary.unpaidNotes.priorStillUnpaid.periodStart }} → {{ summary.unpaidNotes.priorStillUnpaid.periodEnd }}
        </span>
      </div>

      <div
        class="snap-stat snap-stat--alert"
        v-if="isProvider && (summary?.unpaidNotes?.twoPeriodsOld?.totalNotes || summary?.unpaidNotes?.twoPeriodsOld?.totalUnits || 0) > 0"
      >
        <span class="snap-stat-label">Aging (2 periods)</span>
        <span class="snap-stat-value snap-stat-value--danger">
          {{ fmtNum(summary.unpaidNotes.twoPeriodsOld.totalNotes ?? summary.unpaidNotes.twoPeriodsOld.totalUnits) }}
        </span>
        <span class="snap-stat-hint">
          {{ summary.unpaidNotes.twoPeriodsOld.periodStart }} → {{ summary.unpaidNotes.twoPeriodsOld.periodEnd }}
        </span>
      </div>

      <div class="snap-stat" v-if="showRatio">
        <span class="snap-stat-label">D/I ratio</span>
        <span class="snap-stat-value">
          <span class="pill" :class="`pill-${summary.directIndirect.last.kind}`">{{ fmtPct(summary.directIndirect.last.ratio) }}</span>
          <span class="pill" :class="`pill-${summary.directIndirect.avg90.kind}`">{{ fmtPct(summary.directIndirect.avg90.ratio) }}</span>
        </span>
        <span class="snap-stat-hint">Last · 90-day</span>
      </div>

      <div class="snap-stat" v-if="summary?.supervision?.enabled && summary?.supervision?.isPrelicensed">
        <span class="snap-stat-label">Supervision hrs</span>
        <span class="snap-stat-value">{{ fmtNum(summary.supervision.totalHours) }}</span>
        <span class="snap-stat-hint">
          Ind {{ fmtNum(summary.supervision.individualHours) }}/{{ fmtNum(summary.supervision.requiredIndividualHours) }}
          · Grp {{ fmtNum(summary.supervision.groupHours) }}/{{ fmtNum(summary.supervision.requiredGroupHours) }}
        </span>
      </div>

      <div class="snap-stat">
        <span class="snap-stat-label">PTO</span>
        <span class="snap-stat-value">{{ fmtNum(summary?.pto?.balances?.sickHours || 0) }}h</span>
        <span class="snap-stat-hint">Sick · Training {{ fmtNum(summary?.pto?.balances?.trainingHours || 0) }}h</span>
      </div>

      <div class="snap-stat" v-if="summary?.supervisor?.name">
        <span class="snap-stat-label">Supervisor</span>
        <span class="snap-stat-value snap-stat-value--sm">{{ summary.supervisor.name }}</span>
      </div>

      <div class="snap-stat">
        <span class="snap-stat-label">Office</span>
        <span class="snap-stat-value snap-stat-value--sm">{{ officeLine1 }}</span>
        <span class="snap-stat-hint">{{ officeLine2 }}</span>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const emit = defineEmits(['open-last-paycheck']);
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
    const resp = await api.get('/payroll/me/dashboard-summary', { params: { agencyId: agencyId.value }, skipGlobalLoading: true });
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
  emit('open-last-paycheck', { payrollPeriodId: Number(pid) });
};

onMounted(load);
watch(agencyId, (id) => { if (id) load(); }, { immediate: false });
</script>

<style scoped>
/* Outer card */
.snap {
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
  box-shadow: var(--shadow, 0 1px 3px rgba(0,0,0,.06));
}

/* Header */
.snap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.snap-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.snap-title {
  font-weight: 800;
  font-size: 13px;
  color: var(--text-primary, #111827);
  white-space: nowrap;
}
.snap-period {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
}
.snap-period--muted { font-style: italic; }

.snap-head-right {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.snap-btn {
  padding: 4px 11px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
}
.snap-btn--primary { background: #166534; color: #fff; border-color: #166534; }
.snap-btn--primary:hover { background: #14532d; }
.snap-btn--primary:disabled { opacity: .5; cursor: default; }
.snap-btn--ghost { background: #fff; color: #374151; border-color: #e5e7eb; }
.snap-btn--ghost:hover { background: #f9fafb; }
.snap-btn--ghost:disabled { opacity: .5; cursor: default; }

/* Loading / error */
.snap-loading, .snap-error {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  margin-top: 6px;
}
.snap-error { color: #b91c1c; }

/* Stat strip */
.snap-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-top: 8px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}

.snap-stat {
  flex: 1 1 120px;
  display: flex;
  flex-direction: column;
  padding: 7px 12px;
  border-right: 1px solid var(--border, #e5e7eb);
  min-width: 0;
}
.snap-stat:last-child { border-right: none; }

.snap-stat--alert {
  background: #fef2f2;
}

.snap-stat-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
  margin-bottom: 2px;
}

.snap-stat-value {
  font-size: 15px;
  font-weight: 800;
  color: var(--text-primary, #111827);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  line-height: 1.2;
}
.snap-stat-value--green { color: #166534; }
.snap-stat-value--warn  { color: #b45309; }
.snap-stat-value--danger { color: #991b1b; }
.snap-stat-value--sm { font-size: 13px; font-weight: 600; }

.snap-stat-hint {
  font-size: 10px;
  color: var(--text-secondary, #9ca3af);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Pills */
.pill {
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-weight: 700;
  font-size: 11px;
}
.pill-green { border-color: rgba(34,197,94,.35); background: rgba(34,197,94,.12); color: #166534; }
.pill-yellow { border-color: rgba(245,158,11,.35); background: rgba(245,158,11,.12); color: #92400e; }
.pill-red   { border-color: rgba(239,68,68,.35);  background: rgba(239,68,68,.10);  color: #991b1b; }

/* Card-level ratio tint */
.snap.top-card-ratio-green { border-left: 3px solid #22c55e; }
.snap.top-card-ratio-yellow { border-left: 3px solid #eab308; }
.snap.top-card-ratio-red    { border-left: 3px solid #ef4444; }

@media (max-width: 640px) {
  .snap-stats { flex-direction: column; }
  .snap-stat  { border-right: none; border-bottom: 1px solid var(--border, #e5e7eb); }
  .snap-stat:last-child { border-bottom: none; }
}
</style>

