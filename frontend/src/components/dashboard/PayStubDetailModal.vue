<template>
  <Teleport to="body">
    <div
      v-if="show && period"
      class="psd-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="`Pay stub: ${fmtDateRange(period.period_start, period.period_end)}`"
      @click.self="$emit('close')"
    >
      <div class="psd-modal">
        <!-- Header -->
        <div class="psd-header">
          <div class="psd-header-left">
            <div class="psd-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div>
              <h2 class="psd-title">Pay Stub</h2>
              <p class="psd-subtitle">{{ fmtDateRange(period.period_start, period.period_end) }}</p>
            </div>
          </div>
          <div class="psd-header-right">
            <div v-if="allPeriods && allPeriods.length > 1" class="psd-nav">
              <button
                type="button"
                class="psd-nav-btn"
                :disabled="prevPeriod === null"
                aria-label="Previous pay period"
                @click="prevPeriod && $emit('navigate', prevPeriod.payroll_period_id)"
              >‹</button>
              <span class="psd-nav-label">{{ periodIndex + 1 }} / {{ allPeriods.length }}</span>
              <button
                type="button"
                class="psd-nav-btn"
                :disabled="nextPeriod === null"
                aria-label="Next pay period"
                @click="nextPeriod && $emit('navigate', nextPeriod.payroll_period_id)"
              >›</button>
            </div>
            <button type="button" class="psd-close" aria-label="Close" @click="$emit('close')">×</button>
          </div>
        </div>

        <!-- Summary bar -->
        <div class="psd-summary">
          <div class="psd-summary-item">
            <span class="psd-summary-label">Total Pay</span>
            <span class="psd-summary-value psd-summary-value--green">{{ fmtMoney(period.total_amount ?? 0) }}</span>
          </div>
          <div class="psd-summary-item">
            <span class="psd-summary-label">Credits / Hours</span>
            <span class="psd-summary-value">{{ fmtNum(period.total_hours ?? 0) }}</span>
          </div>
          <div class="psd-summary-item">
            <span class="psd-summary-label">Tier Credits</span>
            <span class="psd-summary-value">{{ fmtNum(period.tier_credits_final ?? period.tier_credits_current ?? 0) }}</span>
          </div>
          <div v-if="period.breakdown?.__tier" class="psd-summary-item">
            <span class="psd-summary-label">Benefit Tier</span>
            <span class="psd-summary-value">{{ period.breakdown.__tier.label }}</span>
          </div>
          <div v-if="period.grace_active" class="psd-summary-item">
            <span class="psd-badge psd-badge--amber">Grace period active</span>
          </div>
        </div>

        <!-- Body -->
        <div class="psd-body">
          <!-- Warnings -->
          <div
            v-if="period.breakdown?.__carryover && ((period.breakdown.__carryover.carryoverNotesTotal || 0) > 0)"
            class="psd-warn"
          >
            <strong>Prior notes included:</strong>
            {{ fmtNum(period.breakdown.__carryover.carryoverNotesTotal ?? 0) }} notes.
            Complete prior-period notes by Sunday 11:59 pm after the pay period ends.
          </div>

          <div
            v-if="period.breakdown?.__priorStillUnpaid && (period.breakdown.__priorStillUnpaid.totalUnits || 0) > 0"
            class="psd-warn psd-warn--red"
          >
            <strong>Still unpaid from prior pay period:</strong>
            {{ fmtNum(period.breakdown.__priorStillUnpaid.totalUnits) }} units
            <span v-if="period.breakdown.__priorStillUnpaid.periodStart">
              ({{ period.breakdown.__priorStillUnpaid.periodStart }} → {{ period.breakdown.__priorStillUnpaid.periodEnd }})
            </span>
          </div>

          <!-- Pay Summary -->
          <section class="psd-section">
            <h3 class="psd-section-title">Pay Summary</h3>
            <div v-if="!payTypeSummaryRows.length" class="psd-muted">No pay-type summary available.</div>
            <table v-else class="psd-table">
              <thead>
                <tr>
                  <th>Pay Type</th>
                  <th class="right">Hours</th>
                  <th class="right">Rate</th>
                  <th class="right">Pay</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in payTypeSummaryRows" :key="r.key">
                  <td>{{ r.label }}</td>
                  <td class="right">{{ fmtNum(r.hours) }}</td>
                  <td class="right psd-muted">{{ r.rateLabel }}</td>
                  <td class="right">{{ fmtMoney(r.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- Direct / Indirect -->
          <section class="psd-section">
            <h3 class="psd-section-title">Direct / Indirect</h3>
            <table class="psd-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th class="right">Hours</th>
                  <th class="right">Pay</th>
                  <th class="right">Effective rate</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Direct</strong></td>
                  <td class="right">{{ fmtNum(period.direct_hours ?? 0) }}</td>
                  <td class="right">{{ fmtMoney(diTotals.directAmount) }}</td>
                  <td class="right psd-muted">{{ diTotals.directRate }}</td>
                </tr>
                <tr>
                  <td><strong>Indirect</strong></td>
                  <td class="right">{{ fmtNum(period.indirect_hours ?? 0) }}</td>
                  <td class="right">{{ fmtMoney(diTotals.indirectAmount) }}</td>
                  <td class="right psd-muted">{{ diTotals.indirectRate }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- Service Codes -->
          <section v-if="lines.length" class="psd-section">
            <h3 class="psd-section-title">Service Codes</h3>
            <div class="psd-table-wrap">
              <table class="psd-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th class="right">No Note</th>
                    <th class="right">Draft</th>
                    <th class="right">Finalized</th>
                    <th class="right">Credits/Hrs</th>
                    <th class="right">Rate</th>
                    <th class="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="l in lines" :key="l.code">
                    <td class="code">{{ l.code }}</td>
                    <td class="right psd-muted">{{ fmtNum(l.noNoteUnits) }}</td>
                    <td class="right psd-muted">{{ fmtNum(l.draftUnits) }}</td>
                    <td class="right">{{ fmtNum(l.finalizedUnits) }}</td>
                    <td class="right psd-muted">{{ fmtNum(l.hours) }}</td>
                    <td class="right psd-muted">{{ fmtMoney(l.rateAmount) }}</td>
                    <td class="right">{{ fmtMoney(l.amount) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Additional Pay / Overrides -->
          <section
            v-if="period.breakdown?.__adjustments && hasAdjustments"
            class="psd-section"
          >
            <h3 class="psd-section-title">Additional Pay / Overrides</h3>
            <div v-if="(period.breakdown.__adjustments.lines || []).length">
              <div
                v-for="(l, i) in period.breakdown.__adjustments.lines"
                :key="`adj-${i}`"
                class="psd-adj-row"
              >
                <span><strong>{{ l.label }}:</strong> {{ fmtMoney(l.amount ?? 0) }}</span>
                <span class="psd-muted" v-if="l.meta?.hours || l.meta?.rate">
                  — {{ fmtNum(l.meta.hours ?? 0) }} hrs @ {{ fmtMoney(l.meta.rate ?? 0) }}
                </span>
                <span class="psd-badge" :class="l.taxable === false ? 'psd-badge--gray' : 'psd-badge--blue'">
                  {{ l.taxable === false ? 'non-taxable' : 'taxable' }}
                </span>
              </div>
            </div>
            <div v-else>
              <div v-if="period.breakdown.__adjustments.mileageAmount" class="psd-adj-row">
                <strong>Mileage:</strong> {{ fmtMoney(period.breakdown.__adjustments.mileageAmount) }}
              </div>
              <div v-if="period.breakdown.__adjustments.ptoHours" class="psd-adj-row">
                <strong>PTO:</strong>
                {{ fmtNum(period.breakdown.__adjustments.ptoHours) }} hrs
                @ {{ fmtMoney(period.breakdown.__adjustments.ptoRate ?? 0) }}
                = {{ fmtMoney(period.breakdown.__adjustments.ptoPay ?? 0) }}
              </div>
            </div>
          </section>

          <!-- Totals -->
          <section class="psd-section psd-section--totals">
            <div class="psd-totals-row">
              <span>Total Pay</span>
              <strong>{{ fmtMoney(period.total_amount ?? 0) }}</strong>
            </div>
            <div class="psd-totals-row">
              <span>Total Credits / Hours</span>
              <strong>{{ fmtNum(period.total_hours ?? 0) }}</strong>
            </div>
            <div v-if="ytdTotals" class="psd-totals-row psd-totals-row--ytd">
              <span>Year to date ({{ ytdTotals.year }})</span>
              <strong>{{ fmtMoney(ytdTotals.totalPay) }} · {{ fmtNum(ytdTotals.totalHours) }} credits/hrs</strong>
            </div>
          </section>
        </div>

        <!-- Footer -->
        <div class="psd-footer">
          <button type="button" class="psd-btn psd-btn--ghost" @click="$emit('close')">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';
import {
  formatMoney,
  formatNum,
  formatDateRange,
  payTotalsFromBreakdown,
  serviceLines,
} from '../../utils/payStubBreakdown';

const props = defineProps({
  show: { type: Boolean, default: false },
  period: { type: Object, default: null },
  allPeriods: { type: Array, default: () => [] },
});

defineEmits(['close', 'navigate']);

const fmtMoney = (v) => formatMoney(v);
const fmtNum = (v) => formatNum(v);
const fmtDateRange = (s, e) => formatDateRange(s, e);

const periodIndex = computed(() => {
  if (!props.allPeriods?.length || !props.period) return 0;
  return props.allPeriods.findIndex(
    (p) => p.payroll_period_id === props.period.payroll_period_id
  );
});

const prevPeriod = computed(() => {
  const idx = periodIndex.value;
  return idx > 0 ? props.allPeriods[idx - 1] : null;
});

const nextPeriod = computed(() => {
  const idx = periodIndex.value;
  return idx >= 0 && idx < (props.allPeriods?.length ?? 0) - 1
    ? props.allPeriods[idx + 1]
    : null;
});

const lines = computed(() => serviceLines(props.period?.breakdown));

const diTotals = computed(() => {
  const totals = payTotalsFromBreakdown(props.period?.breakdown);
  const dh = Number(props.period?.direct_hours || 0);
  const ih = Number(props.period?.indirect_hours || 0);
  return {
    directAmount: totals.directAmount,
    indirectAmount: totals.indirectAmount,
    directRate: dh > 0 ? fmtMoney(totals.directAmount / dh) : '—',
    indirectRate: ih > 0 ? fmtMoney(totals.indirectAmount / ih) : '—',
  };
});

const payTypeSummaryRows = computed(() => {
  const bd = props.period?.breakdown;
  if (!bd) return [];
  const rows = [];
  for (const [key, val] of Object.entries(bd)) {
    if (key.startsWith('__') || !val || typeof val !== 'object') continue;
    if (!Number(val.amount)) continue;
    rows.push({
      key,
      label: val.label || key,
      hours: val.hours ?? 0,
      rateLabel: val.rateAmount ? fmtMoney(val.rateAmount) : '—',
      amount: val.amount ?? 0,
    });
  }
  return rows;
});

const hasAdjustments = computed(() => {
  const adj = props.period?.breakdown?.__adjustments;
  if (!adj) return false;
  const lines = adj.lines || [];
  if (lines.length) return true;
  return Object.values(adj).some((v) => typeof v === 'number' && v !== 0);
});

const ytdTotals = computed(() => {
  if (!props.allPeriods?.length || !props.period) return null;
  const year = new Date((props.period.period_end || '') + 'T12:00:00').getFullYear();
  let totalPay = 0;
  let totalHours = 0;
  for (const p of props.allPeriods) {
    const py = new Date((p.period_end || '') + 'T12:00:00').getFullYear();
    if (py === year) {
      totalPay += Number(p.total_amount ?? 0);
      totalHours += Number(p.total_hours ?? 0);
    }
  }
  return { year, totalPay, totalHours };
});
</script>

<style scoped>
.psd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.5);
}

.psd-modal {
  background: #fff;
  border-radius: 14px;
  width: min(720px, 100%);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

/* Header */
.psd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
  flex-shrink: 0;
}

.psd-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.psd-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #dcfce7;
  color: #166534;
  flex-shrink: 0;
}

.psd-title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
  margin: 0;
}

.psd-subtitle {
  font-size: 13px;
  color: #6b7280;
  margin: 2px 0 0;
}

.psd-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.psd-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.psd-nav-btn {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  font-size: 16px;
  cursor: pointer;
  color: #374151;
  display: flex;
  align-items: center;
  justify-content: center;
}
.psd-nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.psd-nav-label {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}

.psd-close {
  background: none;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
}
.psd-close:hover {
  background: #f3f4f6;
  color: #111827;
}

/* Summary bar */
.psd-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.psd-summary-item {
  flex: 1 1 120px;
  padding: 12px 18px;
  border-right: 1px solid #f3f4f6;
}
.psd-summary-item:last-child {
  border-right: none;
}

.psd-summary-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  margin-bottom: 4px;
}

.psd-summary-value {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.psd-summary-value--green {
  color: #166534;
}

/* Body */
.psd-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px;
}

/* Warnings */
.psd-warn {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  color: #92400e;
  margin-bottom: 12px;
}
.psd-warn--red {
  background: #fef2f2;
  border-color: #fecaca;
  color: #7f1d1d;
}

/* Sections */
.psd-section {
  margin-bottom: 20px;
}

.psd-section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  margin: 0 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #f3f4f6;
}

/* Tables */
.psd-table-wrap {
  overflow-x: auto;
}

.psd-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.psd-table th {
  padding: 8px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
}

.psd-table td {
  padding: 10px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}

.psd-table .right,
.psd-table th.right {
  text-align: right;
}

.psd-table .code {
  font-weight: 600;
  font-size: 12px;
}

/* Adjustments */
.psd-adj-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 13px;
}
.psd-adj-row:last-child {
  border-bottom: none;
}

/* Totals */
.psd-section--totals {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 16px;
}

.psd-totals-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
  font-size: 14px;
  color: #374151;
}

.psd-totals-row strong {
  font-size: 15px;
  color: #111827;
}

.psd-totals-row--ytd {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e5e7eb;
  font-size: 13px;
  color: #6b7280;
}
.psd-totals-row--ytd strong {
  font-size: 13px;
  color: #6b7280;
}

/* Badges */
.psd-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}
.psd-badge--amber {
  background: #fef3c7;
  color: #92400e;
}
.psd-badge--gray {
  background: #f3f4f6;
  color: #374151;
}
.psd-badge--blue {
  background: #eff6ff;
  color: #1d4ed8;
}

/* Misc */
.psd-muted {
  color: #6b7280;
}

/* Footer */
.psd-footer {
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.psd-btn {
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.psd-btn--ghost {
  background: #fff;
  border: 1px solid #e5e7eb;
  color: #374151;
}
.psd-btn--ghost:hover {
  background: #f9fafb;
}
</style>
