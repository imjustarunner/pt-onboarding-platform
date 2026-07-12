<template>
  <section class="ov-card" data-tour="dash-overview-pay">
    <header class="ov-card-head">
      <h3 class="ov-card-title">Last Pay Period Overview</h3>
      <span v-if="periodLabel" class="ov-muted">{{ periodLabel }}</span>
    </header>

    <div v-if="loading" class="ov-empty">Loading…</div>
    <template v-else>
      <div class="ov-kpis">
        <div class="ov-kpi ov-kpi--pay">
          <OverviewPaycheckCompare
            :amount="totalPay"
            :ratio="paycheckCompare?.ratio"
            :average="paycheckCompare?.average"
            :sample-size="paycheckCompare?.sampleSize || 0"
          />
          <div class="ov-kpi-label">Last paycheck · hover for amount</div>
        </div>

        <div class="ov-kpi">
          <div class="ov-kpi-icon ov-kpi-icon--purple" aria-hidden="true">✓</div>
          <div class="ov-kpi-body">
            <div class="ov-kpi-value">{{ notesIncomplete }} incomplete notes</div>
            <div class="ov-kpi-label">
              No Note {{ notesNoNote }} · Draft {{ notesDraft }}
            </div>
          </div>
        </div>

        <div v-if="priorUnpaidCount > 0" class="ov-kpi ov-kpi--alert">
          <div class="ov-kpi-icon ov-kpi-icon--red" aria-hidden="true">!</div>
          <div class="ov-kpi-body">
            <div class="ov-kpi-value">{{ priorUnpaidCount }} prior unpaid</div>
            <div class="ov-kpi-label">{{ priorUnpaidPeriod || 'Earlier period' }}</div>
          </div>
        </div>

        <div v-if="agingCount > 0" class="ov-kpi ov-kpi--alert">
          <div class="ov-kpi-icon ov-kpi-icon--red" aria-hidden="true">!</div>
          <div class="ov-kpi-body">
            <div class="ov-kpi-value">{{ agingCount }} aging (2 periods)</div>
            <div class="ov-kpi-label">{{ agingPeriod || 'Two periods old' }}</div>
          </div>
        </div>

        <div v-if="showRatio" class="ov-kpi">
          <div class="ov-kpi-icon ov-kpi-icon--blue" aria-hidden="true">%</div>
          <div class="ov-kpi-body">
            <div class="ov-kpi-value">{{ ratioLabel }} D/I</div>
            <div class="ov-kpi-label">Indirect to direct (last)</div>
            <div class="ov-bar"><span class="ov-bar--blue" :style="{ width: ratioBarWidth }" /></div>
          </div>
        </div>

        <div v-if="showPto" class="ov-kpi">
          <div class="ov-kpi-icon ov-kpi-icon--green" aria-hidden="true">P</div>
          <div class="ov-kpi-body">
            <div class="ov-kpi-value">{{ fmtNum(ptoSick) }}h PTO</div>
            <div class="ov-kpi-label">Sick · Training {{ fmtNum(ptoTraining) }}h</div>
          </div>
        </div>
      </div>

      <div v-if="supervisorName || officeName" class="ov-meta-row">
        <div v-if="supervisorName" class="ov-meta">
          <span class="ov-meta-label">Supervisor</span>
          <span class="ov-meta-value">{{ supervisorName }}</span>
        </div>
        <div v-if="officeName" class="ov-meta">
          <span class="ov-meta-label">Office</span>
          <span class="ov-meta-value">{{ officeName }}</span>
          <span v-if="officeLine2" class="ov-meta-hint">{{ officeLine2 }}</span>
        </div>
      </div>

      <div v-if="tierLabel" class="ov-tier">
        <span class="ov-tier-badge" aria-hidden="true">★</span>
        <div class="ov-tier-body">
          <div class="ov-tier-title">{{ tierLabel }}</div>
          <div class="ov-tier-hint">{{ tierHint }}</div>
        </div>
        <button type="button" class="ov-link" @click="$emit('navigate', 'payroll')">View Tier Details</button>
      </div>
      <div v-else class="ov-tier ov-tier--muted">
        <button type="button" class="ov-btn" @click="$emit('open-paycheck')" :disabled="!canOpenPaycheck">
          View paycheck
        </button>
        <button type="button" class="ov-link" @click="$emit('navigate', 'payroll')">Open Payroll</button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import OverviewPaycheckCompare from './OverviewPaycheckCompare.vue';

const props = defineProps({
  loading: { type: Boolean, default: false },
  periodStart: { type: String, default: '' },
  periodEnd: { type: String, default: '' },
  totalPay: { type: [Number, String], default: null },
  paycheckCompare: { type: Object, default: null },
  notesIncomplete: { type: Number, default: 0 },
  notesNoNote: { type: Number, default: 0 },
  notesDraft: { type: Number, default: 0 },
  directIndirect: { type: Object, default: null },
  summary: { type: Object, default: null },
  tierLabel: { type: String, default: '' },
  tierStatus: { type: String, default: '' },
  payrollPeriodId: { type: [Number, String], default: null }
});

defineEmits(['navigate', 'open-paycheck']);

const periodLabel = computed(() => {
  if (props.periodStart && props.periodEnd) return `${props.periodStart} – ${props.periodEnd}`;
  return '';
});

const showRatio = computed(() => !!(props.directIndirect?.last && !props.directIndirect?.disabled));

const ratioLabel = computed(() => {
  const r = props.directIndirect?.last?.ratio;
  if (r == null || !Number.isFinite(Number(r))) return '—';
  return `${Math.round(Number(r) * 1000) / 10}%`;
});

const ratioBarWidth = computed(() => {
  const r = Number(props.directIndirect?.last?.ratio);
  if (!Number.isFinite(r)) return '0%';
  return `${Math.min(100, Math.round(r * 100))}%`;
});

const canOpenPaycheck = computed(() => !!props.payrollPeriodId);

const showPto = computed(() => props.summary?.pto?.balances != null);
const ptoSick = computed(() => Number(props.summary?.pto?.balances?.sickHours || 0));
const ptoTraining = computed(() => Number(props.summary?.pto?.balances?.trainingHours || 0));

const supervisorName = computed(() => String(props.summary?.supervisor?.name || '').trim());
const officeName = computed(() => String(props.summary?.office?.name || '').trim());
const officeLine2 = computed(() => {
  const o = props.summary?.office;
  if (!o) return '';
  return [o.streetAddress, [o.city, o.state].filter(Boolean).join(', '), o.postalCode].filter(Boolean).join(' ');
});

const priorUnpaid = computed(() => props.summary?.unpaidNotes?.priorStillUnpaid || null);
const priorUnpaidCount = computed(() =>
  Number(priorUnpaid.value?.totalNotes ?? priorUnpaid.value?.totalUnits ?? 0) || 0
);
const priorUnpaidPeriod = computed(() => {
  const p = priorUnpaid.value;
  if (!p?.periodStart || !p?.periodEnd) return '';
  return `${p.periodStart} → ${p.periodEnd}`;
});

const aging = computed(() => props.summary?.unpaidNotes?.twoPeriodsOld || null);
const agingCount = computed(() => Number(aging.value?.totalNotes ?? aging.value?.totalUnits ?? 0) || 0);
const agingPeriod = computed(() => {
  const p = aging.value;
  if (!p?.periodStart || !p?.periodEnd) return '';
  return `${p.periodStart} → ${p.periodEnd}`;
});

const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const tierHint = computed(() => {
  const s = String(props.tierStatus || '').toLowerCase();
  if (s === 'grace') return 'Grace period — keep going!';
  if (s === 'current') return 'On track this period';
  if (s === 'ooc' || s === 'out_of_compliance') return 'Out of compliance — review details';
  return 'View payroll for full breakdown';
});
</script>

<style scoped>
.ov-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.ov-card-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 14px;
}
.ov-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}
.ov-muted { font-size: 12px; color: #6b7280; }
.ov-empty { font-size: 13px; color: #6b7280; padding: 12px 0; }
.ov-kpis { display: flex; flex-direction: column; gap: 12px; }
.ov-kpi { display: flex; gap: 10px; align-items: flex-start; }
.ov-kpi--pay {
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: #f9fafb;
  border-radius: 10px;
}
.ov-kpi--alert {
  padding: 8px 10px;
  background: #fef2f2;
  border-radius: 10px;
}
.ov-kpi-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}
.ov-kpi-icon--purple { background: #f3e8ff; color: #7e22ce; }
.ov-kpi-icon--blue { background: #dbeafe; color: #1d4ed8; }
.ov-kpi-icon--green { background: #dcfce7; color: #166534; }
.ov-kpi-icon--red { background: #fee2e2; color: #b91c1c; }
.ov-kpi-value { font-size: 13px; font-weight: 700; color: #111827; }
.ov-kpi-label { font-size: 12px; color: #6b7280; margin-top: 1px; }
.ov-kpi-body { flex: 1; min-width: 0; }
.ov-bar {
  height: 5px;
  background: #e5e7eb;
  border-radius: 999px;
  margin-top: 6px;
  overflow: hidden;
}
.ov-bar > span { display: block; height: 100%; border-radius: 999px; }
.ov-bar--blue { background: #2563eb; }
.ov-meta-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
}
.ov-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ov-meta-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
}
.ov-meta-value {
  font-size: 13px;
  font-weight: 650;
  color: #111827;
}
.ov-meta-hint {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ov-tier {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ov-tier--muted { justify-content: space-between; }
.ov-tier-badge {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #fef3c7;
  color: #b45309;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.ov-tier-body { flex: 1; min-width: 0; }
.ov-tier-title { font-size: 13px; font-weight: 700; color: #111827; }
.ov-tier-hint { font-size: 12px; color: #6b7280; }
.ov-link {
  background: none;
  border: none;
  color: #7c3aed;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}
.ov-link:hover { text-decoration: underline; }
.ov-btn {
  background: #166534;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.ov-btn:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 560px) {
  .ov-meta-row { grid-template-columns: 1fr; }
}

[data-theme="dark"] .ov-card {
  background: #1e2126;
  border-color: #3a3f48;
}
[data-theme="dark"] .ov-card-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-muted { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-empty { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-kpi--pay { background: #252930; }
[data-theme="dark"] .ov-kpi--alert { background: #3b1c1c; }
[data-theme="dark"] .ov-kpi-icon--purple { background: #2e1a47; color: #c4b5fd; }
[data-theme="dark"] .ov-kpi-icon--blue { background: #172554; color: #93c5fd; }
[data-theme="dark"] .ov-kpi-icon--green { background: #14291e; color: #86efac; }
[data-theme="dark"] .ov-kpi-icon--red { background: #3b1c1c; color: #fca5a5; }
[data-theme="dark"] .ov-kpi-value { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-kpi-label { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-bar { background: #374151; }
[data-theme="dark"] .ov-meta-row { border-top-color: #3a3f48; }
[data-theme="dark"] .ov-meta-label { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-meta-value { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-meta-hint { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .ov-tier { border-top-color: #3a3f48; }
[data-theme="dark"] .ov-tier-badge { background: #2d2000; color: #fcd34d; }
[data-theme="dark"] .ov-tier-title { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .ov-tier-hint { color: var(--text-secondary, #94a3b8); }
</style>
