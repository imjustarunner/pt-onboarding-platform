<template>
  <div class="payroll-breakdown">
    <h2 v-if="showTitle" class="card-title">Breakdown</h2>
    <div v-if="period">
      <div
        class="warn-box prior-notes-included"
        v-if="period.breakdown && period.breakdown.__carryover && ((period.breakdown.__carryover.carryoverNotesTotal || period.breakdown.__carryover.oldDoneNotesNotesTotal || 0) > 0)"
        style="margin-bottom: 10px;"
      >
        <div>
          <strong>Prior notes included in this payroll:</strong>
          {{ fmtNum(period.breakdown.__carryover.carryoverNotesTotal ?? period.breakdown.__carryover.oldDoneNotesNotesTotal ?? 0) }}
          notes
        </div>
        <div class="muted">Reminder: complete prior-period notes by Sunday 11:59pm after the pay period ends to avoid compensation delays.</div>
      </div>
      <div
        class="warn-box current-unpaid-notes"
        v-if="period.breakdown && period.breakdown.__priorStillUnpaid && (period.breakdown.__priorStillUnpaid.totalUnits || 0) > 0"
        style="margin-bottom: 10px; border: 1px solid #ffb5b5; background: #ffecec;"
      >
        <div>
          <strong>Still unpaid from the prior pay period (not paid this period):</strong>
          {{ fmtNum(period.breakdown.__priorStillUnpaid.totalUnits) }} units
        </div>
        <div class="muted" style="margin-top: 4px;" v-if="period.breakdown.__priorStillUnpaid.periodStart">
          {{ period.breakdown.__priorStillUnpaid.periodStart }} → {{ period.breakdown.__priorStillUnpaid.periodEnd }}
        </div>
        <div class="muted" style="margin-top: 6px;" v-if="(period.breakdown.__priorStillUnpaid.lines || []).length">
          <div><strong>Details:</strong></div>
          <div v-for="(l, i) in (period.breakdown.__priorStillUnpaid.lines || [])" :key="`prior-unpaid:${l.serviceCode}:${i}`">
            - {{ l.serviceCode }}: {{ fmtNum(l.unpaidUnits) }} units
          </div>
        </div>
      </div>
      <div
        class="warn-box old-notes-alert"
        v-if="twoPeriodsAgoUnpaid.total > 0"
        style="margin-bottom: 10px;"
      >
        <div>
          <strong>Reminder: unpaid notes from 2 pay periods ago</strong>
        </div>
        <div style="margin-top: 4px;">
          <strong>{{ fmtDateRange(twoPeriodsAgo?.period_start, twoPeriodsAgo?.period_end) }}</strong>
        </div>
        <div style="margin-top: 6px;">
          <strong>No Note:</strong> {{ fmtNum(twoPeriodsAgoUnpaid.noNote) }} notes
          <span class="muted">•</span>
          <strong>Draft:</strong> {{ fmtNum(twoPeriodsAgoUnpaid.draft) }} notes
        </div>
        <div class="muted" style="margin-top: 6px;">
          Complete outstanding notes to be included in a future payroll.
        </div>
      </div>

      <div class="warn-box current-unpaid-notes" v-if="unpaid.total > 0" style="margin-bottom: 10px;">
        <div>
          <strong>Unpaid notes in this pay period</strong>
        </div>
        <div style="margin-top: 6px;">
          <strong>No Note:</strong> {{ fmtNum(unpaid.noNote) }} notes
          <span class="muted">•</span>
          <strong>Draft:</strong> {{ fmtNum(unpaid.draft) }} notes
        </div>
        <div class="muted" style="margin-top: 6px;">
          These notes were not paid this period. Complete outstanding notes to be included in a future payroll.
        </div>
        <div class="muted" style="margin-top: 6px;">
          Due to Therapy Notes, we are unable to differentiate a note that is incomplete for a session that did occur from a note that is incomplete for a session that did not occur.
        </div>
      </div>

      <div class="card" style="margin-top: 10px;">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Pay Summary (Posted Payroll)</h3>
        <div class="muted" v-if="!payTypeSummary.rows.length">No pay-type summary available.</div>
        <div v-else class="paytype">
          <div class="paytype-head">
            <div>Pay Type</div>
            <div class="right">Hours</div>
            <div class="right">Rate</div>
            <div class="right">Pay</div>
          </div>
          <div v-for="r in payTypeSummary.rows" :key="r.key" class="paytype-row">
            <div class="code">{{ r.label }}</div>
            <div class="right">{{ fmtNum(r.hours) }}</div>
            <div class="right muted">{{ r.rateLabel }}</div>
            <div class="right">{{ fmtMoney(r.amount) }}</div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top: 10px;" v-if="hourlyRateSummary.effectiveRate !== null">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Hourly Rate</h3>
        <div class="row"><strong>Effective hourly rate:</strong> {{ fmtMoney(hourlyRateSummary.effectiveRate) }}</div>
        <div class="muted" style="margin-top: 6px;">
          Effective hourly rate represents the total pay divided by earned credits/hours (which can vary by service mix, add-ons, and overrides).
        </div>
      </div>

      <div class="warn-box" v-else-if="hourlyRateSummary.variableRatesNote" style="margin-top: 10px;">
        <div><strong>Note about varying service rates</strong></div>
        <div class="muted" style="margin-top: 6px;">
          {{ hourlyRateSummary.variableRatesNote }}
        </div>
      </div>

      <div class="card" style="margin-top: 10px;" v-if="period.breakdown && period.breakdown.__tier">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Benefit Tier</h3>
        <div class="row"><strong>{{ period.breakdown.__tier.label }}</strong></div>
        <div class="row"><strong>Status:</strong> {{ period.breakdown.__tier.status }}</div>
      </div>

      <h3 class="card-title" style="margin-top: 12px;">Totals</h3>
      <div class="row"><strong>Total Pay:</strong> {{ fmtMoney(period.total_amount ?? 0) }}</div>
      <div class="row"><strong>Total Credits/Hours:</strong> {{ fmtNum(period.total_hours ?? 0) }}</div>
      <div class="row"><strong>Tier Credits (Final):</strong> {{ fmtNum(period.tier_credits_final ?? period.tier_credits_current ?? 0) }}</div>
      <div class="row" v-if="ytdTotals">
        <strong>Year to date ({{ ytdTotals.year }}):</strong>
        {{ fmtMoney(ytdTotals.totalPay) }} • {{ fmtNum(ytdTotals.totalHours) }} credits/hours
      </div>

      <div class="card" style="margin-top: 10px;">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Direct / Indirect Totals</h3>
        <div class="di-grid">
          <div class="di-head">Type</div>
          <div class="di-head right">Hours</div>
          <div class="di-head right">Pay</div>
          <div class="di-head right">Rate</div>

          <div><strong>Direct</strong></div>
          <div class="right">{{ fmtNum(period.direct_hours ?? 0) }}</div>
          <div class="right">{{ fmtMoney(payTotalsFromBreakdown(breakdown).directAmount ?? 0) }}</div>
          <div class="right muted">
            {{
              (() => {
                const h = Number(period.direct_hours || 0);
                const amt = Number(payTotalsFromBreakdown(breakdown).directAmount || 0);
                return h > 0 ? fmtMoney(amt / h) : '—';
              })()
            }}
          </div>

          <div><strong>Indirect</strong></div>
          <div class="right">{{ fmtNum(period.indirect_hours ?? 0) }}</div>
          <div class="right">{{ fmtMoney(payTotalsFromBreakdown(breakdown).indirectAmount ?? 0) }}</div>
          <div class="right muted">
            {{
              (() => {
                const h = Number(period.indirect_hours || 0);
                const amt = Number(payTotalsFromBreakdown(breakdown).indirectAmount || 0);
                return h > 0 ? fmtMoney(amt / h) : '—';
              })()
            }}
          </div>
        </div>
        <div v-if="indirectBreakdown.length" class="muted" style="margin-top: 10px; padding: 8px 0 0 12px; border-top: 1px solid var(--border);">
          <div style="margin-bottom: 4px;"><strong>Indirect breakdown:</strong></div>
          <div v-for="l in indirectBreakdown" :key="`indirect:${l.code}`" class="row" style="margin: 4px 0;">
            {{ l.code }}: {{ fmtNum(l.hours ?? 0) }} hrs • {{ fmtMoney(l.amount ?? 0) }}{{ isSupervisionCode(l.code) && (l.amount ?? 0) < 0.01 ? ' (benefit, no pay)' : '' }}
          </div>
        </div>
      </div>

      <h3 class="card-title" style="margin-top: 12px;">Service Codes</h3>
      <div class="muted" v-if="!breakdown || !Object.keys(breakdown).length">No breakdown available.</div>
      <div v-else class="codes">
        <div class="codes-head">
          <div>Code</div>
          <div class="right">No Note</div>
          <div class="right">Draft</div>
          <div class="right">Finalized</div>
          <div class="right">Credits/Hours</div>
          <div class="right">Rate</div>
          <div class="right">Amount</div>
        </div>
        <div v-for="l in serviceLines" :key="l.code" class="code-row">
          <div class="code">{{ l.code }}</div>
          <div class="right muted">{{ fmtNum(l.noNoteUnits ?? 0) }}</div>
          <div class="right muted">{{ fmtNum(l.draftUnits ?? 0) }}</div>
          <div class="right">{{ fmtNum(l.finalizedUnits ?? l.units ?? 0) }}</div>
          <div class="right muted">{{ fmtNum(l.hours ?? 0) }}</div>
          <div class="right muted">{{ fmtMoney(l.rateAmount ?? 0) }}</div>
          <div class="right">{{ fmtMoney(l.amount ?? 0) }}</div>
        </div>
        <div v-if="hasOverrides" class="adjustments">
          <h3 class="card-title" style="margin-top: 10px;">Additional Pay / Overrides</h3>

          <div v-if="visibleAdjustmentLines.length">
            <div v-for="(l, i) in visibleAdjustmentLines" :key="`adj:${l.type}:${i}`" class="row">
              <strong>{{ l.label }}:</strong>
              {{ fmtMoney(l.amount ?? 0) }}
              <span class="muted" v-if="l.meta && (l.meta.hours || l.meta.rate)">
                • {{ fmtNum(l.meta.hours ?? 0) }} hrs @ {{ fmtMoney(l.meta.rate ?? 0) }}
              </span>
              <span class="muted" v-if="l.taxable === false"> • non-taxable</span>
              <span class="muted" v-else> • taxable</span>
            </div>
          </div>
          <div v-else>
            <div class="row" v-if="showOverrideRow('mileageAmount')">
              <strong>Mileage:</strong> {{ fmtMoney(adjustments.mileageAmount ?? 0) }}
            </div>
            <div class="row" v-if="showOverrideRow('medcancelAmount')">
              <strong>Med Cancel:</strong> {{ fmtMoney(adjustments.medcancelAmount ?? 0) }}
            </div>
            <div class="row" v-if="showOverrideRow('otherTaxableAmount')">
              <strong>Other taxable:</strong> {{ fmtMoney(adjustments.otherTaxableAmount ?? 0) }}
            </div>
            <div class="row" v-if="showOverrideRow('imatterAmount')">
              <strong>IMatter:</strong> {{ fmtMoney(adjustments.imatterAmount ?? 0) }}
            </div>
            <div class="row" v-if="showOverrideRow('missedAppointmentsAmount')">
              <strong>Missed appointments:</strong> {{ fmtMoney(adjustments.missedAppointmentsAmount ?? 0) }}
            </div>
            <div class="row" v-if="showOverrideRow('bonusAmount')">
              <strong>Bonus:</strong> {{ fmtMoney(adjustments.bonusAmount ?? 0) }}
            </div>
            <div class="row" v-if="showOverrideRow('reimbursementAmount')">
              <strong>Reimbursement:</strong> {{ fmtMoney(adjustments.reimbursementAmount ?? 0) }}
            </div>
            <div class="row" v-if="showOverrideRow('tuitionReimbursementAmount')">
              <strong>Tuition reimbursement (tax-exempt):</strong> {{ fmtMoney(adjustments.tuitionReimbursementAmount ?? 0) }}
            </div>
            <div class="row" v-if="showOverrideRow('timeClaimsAmount')">
              <strong>Time claims:</strong> {{ fmtMoney(adjustments.timeClaimsAmount ?? 0) }}
            </div>
            <div class="row" v-if="showManualPayLinesRow">
              <strong>Manual pay lines:</strong> {{ fmtMoney(adjustments.manualPayLinesAmount ?? 0) }}
            </div>
            <div
              v-if="manualPayLines.length"
              class="muted"
              style="margin-top: 6px;"
            >
              <div v-for="(ml, j) in manualPayLines" :key="`${ml.id || j}`">
                - {{ ml.label }}: {{ fmtMoney(ml.amount ?? 0) }}
              </div>
            </div>
            <div class="row" v-if="showPtoRow">
              <strong>PTO:</strong>
              {{ fmtNum(adjustments.ptoHours ?? 0) }} hrs @ {{ fmtMoney(adjustments.ptoRate ?? 0) }} =
              {{ fmtMoney(adjustments.ptoPay ?? 0) }}
            </div>
            <div class="row" v-if="showOverrideRow('salaryAmount')">
              <strong>Salary override:</strong> {{ fmtMoney(adjustments.salaryAmount ?? 0) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  period: { type: Object, required: true },
  allPeriods: { type: Array, default: () => [] },
  showTitle: { type: Boolean, default: true }
});

const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const fmtMoney = (v) => Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const fmtDateRange = (start, end) => {
  const s = String(start || '').slice(0, 10);
  const e = String(end || '').slice(0, 10);
  if (s && e) return `${s} → ${e}`;
  return s || e || '';
};

const breakdown = computed(() => (props.period?.breakdown && typeof props.period.breakdown === 'object' ? props.period.breakdown : null));

const unpaid = computed(() => {
  const p = props.period;
  const c = p?.unpaidNotesCounts || null;
  if (c && typeof c === 'object') {
    const noNote = Number(c.noNote || 0);
    const draft = Number(c.draft || 0);
    return { noNote, draft, total: noNote + draft };
  }
  return { noNote: 0, draft: 0, total: 0 };
});

const chronologicalPeriods = computed(() => {
  const copy = [...(props.allPeriods || [])];
  copy.sort((a, b) => {
    const da = new Date(a?.period_start || a?.period_end || 0).getTime();
    const db = new Date(b?.period_start || b?.period_end || 0).getTime();
    return da - db;
  });
  return copy;
});

const twoPeriodsAgo = computed(() => {
  const pid = Number(props.period?.payroll_period_id || 0);
  if (!pid) return null;
  const list = chronologicalPeriods.value || [];
  const idx = list.findIndex((p) => Number(p?.payroll_period_id || 0) === pid);
  if (idx < 0) return null;
  return list[idx - 2] || null;
});

const twoPeriodsAgoUnpaid = computed(() => {
  const p = twoPeriodsAgo.value;
  const c = p?.unpaidNotesCounts || null;
  if (c && typeof c === 'object') {
    const noNote = Number(c.noNote || 0);
    const draft = Number(c.draft || 0);
    return { noNote, draft, total: noNote + draft };
  }
  return { noNote: 0, draft: 0, total: 0 };
});

const payBucketForCategory = (category) => {
  const c = String(category || '').trim().toLowerCase();
  if (c === 'indirect' || c === 'admin' || c === 'meeting') return 'indirect';
  if (c === 'other' || c === 'tutoring') return 'other';
  if (c === 'mileage' || c === 'bonus' || c === 'reimbursement' || c === 'other_pay') return 'flat';
  return 'direct';
};

const splitBreakdownForDisplay = (b) => {
  const out = [];
  if (!b || typeof b !== 'object') return out;
  for (const [code, vRaw] of Object.entries(b)) {
    if (String(code).startsWith('_')) continue;
    const v = vRaw || {};
    const finalizedUnits = Number(v.finalizedUnits ?? v.units ?? 0);
    const rateAmount = Number(v.rateAmount || 0);
    const payDivisor = Number(v.payDivisor || 1);
    const safeDiv = Number.isFinite(payDivisor) && payDivisor > 0 ? payDivisor : 1;
    const creditValue = Number(v.creditValue || 0);
    const safeCv = Number.isFinite(creditValue) ? creditValue : 0;
    const bucket = payBucketForCategory(v.category);
    const rateUnit = String(v.rateUnit || '');

    const oldNoteUnits = Number(v.oldNoteUnits ?? v.oldDoneNotesUnits ?? 0);
    const codeChangedUnits = Number(v.codeChangedUnits || 0);
    const lateAdditionUnits = Number(v.lateAdditionUnits || 0);
    const carryUnits = Math.max(0, oldNoteUnits) + Math.max(0, codeChangedUnits) + Math.max(0, lateAdditionUnits);

    if (!(carryUnits > 1e-9) || rateUnit === 'flat') {
      out.push({ code, ...v });
      continue;
    }

    const totalUnits = Math.max(0, finalizedUnits);
    const baseUnits = Math.max(0, totalUnits - carryUnits);
    const totalAmount = Number(v.amount || 0);
    const allocAmount = (u) => (totalUnits > 1e-9 ? Number((totalAmount * (u / totalUnits)).toFixed(2)) : 0);
    const oldNoteAmount = allocAmount(Math.max(0, oldNoteUnits));
    const codeChangedAmount = allocAmount(Math.max(0, codeChangedUnits));
    const lateAdditionAmount = allocAmount(Math.max(0, lateAdditionUnits));
    const carryAmountSum = Number((oldNoteAmount + codeChangedAmount + lateAdditionAmount).toFixed(2));
    const baseAmount = Math.max(0, Number((totalAmount - carryAmountSum).toFixed(2)));

    if (baseUnits > 1e-9 && baseAmount > 1e-9) {
      out.push({
        code,
        ...v,
        finalizedUnits: baseUnits,
        units: baseUnits,
        hours: baseUnits * safeCv,
        creditsHours: baseUnits * safeCv,
        amount: baseAmount
      });
    }

    if (oldNoteUnits > 1e-9 && oldNoteAmount > 1e-9) {
      out.push({
        code: `${code} (Old Note)`,
        ...v,
        noNoteUnits: 0,
        draftUnits: 0,
        finalizedUnits: oldNoteUnits,
        units: oldNoteUnits,
        hours: oldNoteUnits * safeCv,
        creditsHours: oldNoteUnits * safeCv,
        amount: oldNoteAmount
      });
    }

    if (codeChangedUnits > 1e-9 && codeChangedAmount > 1e-9) {
      const fromCodes = Array.isArray(v.codeChangedFromCodes) ? v.codeChangedFromCodes.filter(Boolean) : [];
      const label = (fromCodes.length === 1)
        ? `${code} (Code Changed: ${fromCodes[0]}→${code})`
        : `${code} (Code Changed)`;
      out.push({
        code: label,
        ...v,
        noNoteUnits: 0,
        draftUnits: 0,
        finalizedUnits: codeChangedUnits,
        units: codeChangedUnits,
        hours: codeChangedUnits * safeCv,
        creditsHours: codeChangedUnits * safeCv,
        amount: codeChangedAmount
      });
    }

    if (lateAdditionUnits > 1e-9 && lateAdditionAmount > 1e-9) {
      out.push({
        code: `${code} (Late Addition)`,
        ...v,
        noNoteUnits: 0,
        draftUnits: 0,
        finalizedUnits: lateAdditionUnits,
        units: lateAdditionUnits,
        hours: lateAdditionUnits * safeCv,
        creditsHours: lateAdditionUnits * safeCv,
        amount: lateAdditionAmount
      });
    }
  }
  return out;
};

const serviceLines = computed(() => splitBreakdownForDisplay(breakdown.value || null));

const isSupervisionCode = (code) => ['99414', '99415', '99416'].includes(String(code || '').trim());

const indirectBreakdown = computed(() => {
  const b = breakdown.value || null;
  if (!b || typeof b !== 'object') return [];
  const out = [];
  for (const [code, v] of Object.entries(b)) {
    if (String(code).startsWith('_')) continue;
    const bucket = v?.bucket ? String(v.bucket).trim().toLowerCase() : payBucketForCategory(v?.category);
    if (bucket !== 'indirect') continue;
    const hours = Number(v?.hours ?? v?.creditsHours ?? 0);
    const amount = Number(v?.amount ?? 0);
    if (hours > 1e-9 || amount > 1e-9) {
      out.push({ code, hours, amount });
    }
  }
  return out.sort((a, b) => String(a.code).localeCompare(String(b.code)));
});

const adjustments = computed(() => (breakdown.value && breakdown.value.__adjustments && typeof breakdown.value.__adjustments === 'object' ? breakdown.value.__adjustments : null));

const manualPayLines = computed(() => {
  const b = breakdown.value || null;
  const adj = adjustments.value || null;
  const list = (adj?.manualPayLines || b?.__manualPayLines || []);
  return Array.isArray(list) ? list : [];
});

const absGtZero = (n) => Math.abs(Number(n || 0)) > 1e-9;

const visibleAdjustmentLines = computed(() => {
  const lines = adjustments.value?.lines;
  const arr = Array.isArray(lines) ? lines : [];
  return arr.filter((l) => {
    const amount = Number(l?.amount || 0);
    const hours = Number(l?.meta?.hours || 0);
    const rate = Number(l?.meta?.rate || 0);
    return absGtZero(amount) || absGtZero(hours) || absGtZero(rate);
  });
});

const showOverrideRow = (field) => {
  const adj = adjustments.value || {};
  return absGtZero(adj?.[field]);
};

const showManualPayLinesRow = computed(() => {
  if (manualPayLines.value.length) return true;
  return absGtZero(adjustments.value?.manualPayLinesAmount);
});

const showPtoRow = computed(() => absGtZero(adjustments.value?.ptoHours) || absGtZero(adjustments.value?.ptoPay));

const hasOverrides = computed(() => {
  if (!adjustments.value) return false;
  if (visibleAdjustmentLines.value.length) return true;
  if (manualPayLines.value.length) return true;
  return (
    showOverrideRow('mileageAmount') ||
    showOverrideRow('medcancelAmount') ||
    showOverrideRow('otherTaxableAmount') ||
    showOverrideRow('imatterAmount') ||
    showOverrideRow('missedAppointmentsAmount') ||
    showOverrideRow('bonusAmount') ||
    showOverrideRow('reimbursementAmount') ||
    showOverrideRow('tuitionReimbursementAmount') ||
    showOverrideRow('timeClaimsAmount') ||
    showManualPayLinesRow.value ||
    showPtoRow.value ||
    showOverrideRow('salaryAmount')
  );
});

const payTotalsFromBreakdown = (b) => {
  const out = { directAmount: 0, indirectAmount: 0, otherAmount: 0, flatAmount: 0 };
  if (!b || typeof b !== 'object') return out;
  for (const [code, v] of Object.entries(b)) {
    if (String(code).startsWith('_')) continue;
    const amt = Number(v?.amount || 0);
    const bucket = v?.bucket ? String(v.bucket).trim().toLowerCase() : payBucketForCategory(v?.category);
    if (bucket === 'indirect') out.indirectAmount += amt;
    else if (bucket === 'other') out.otherAmount += amt;
    else if (bucket === 'flat') out.flatAmount += amt;
    else out.directAmount += amt;
  }
  return out;
};

const payTypeSummary = computed(() => {
  const b = breakdown.value;
  const out = { rows: [] };
  if (!b || typeof b !== 'object') return out;

  const lines = Object.entries(b)
    .filter(([code]) => !String(code).startsWith('__'))
    .map(([code, v]) => ({ code, ...(v || {}) }));

  const byKey = new Map();
  for (const l of lines) {
    const category = String(l.category || 'direct');
    const slot = category === 'other' ? Number(l.otherSlot || 1) : null;
    const key = category === 'other' ? `other_${slot || 1}` : category;
    if (!byKey.has(key)) byKey.set(key, { key, category, slot, hours: 0, amount: 0, rateAmounts: [] });
    const agg = byKey.get(key);
    agg.hours += Number(l.hours || 0);
    agg.amount += Number(l.amount || 0);
    if (Number.isFinite(Number(l.rateAmount))) agg.rateAmounts.push(Number(l.rateAmount));
  }

  const labelFor = (key) => {
    if (key === 'direct') return 'Direct';
    if (key === 'indirect') return 'Indirect';
    if (key.startsWith('other_')) return `Other ${key.split('_')[1]}`;
    return key;
  };

  out.rows = Array.from(byKey.values())
    .filter((x) => x.hours > 0 || x.amount > 0)
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .map((x) => {
      const distinctRates = Array.from(new Set((x.rateAmounts || []).map((n) => Number(n.toFixed(4)))));
      let rateLabel = '—';
      if (distinctRates.length === 1) {
        rateLabel = fmtMoney(distinctRates[0]);
      } else if (distinctRates.length > 1) {
        rateLabel = 'Mixed';
      }
      return {
        key: x.key,
        label: labelFor(x.key),
        hours: x.hours,
        amount: x.amount,
        rateLabel
      };
    });

  return out;
});

const hourlyRateSummary = computed(() => {
  const b = breakdown.value;
  if (!b || typeof b !== 'object') return { directRate: null, indirectRate: null, effectiveRate: null, variableRatesNote: '' };

  const sums = { directHours: 0, directAmount: 0, indirectHours: 0, indirectAmount: 0, otherHours: 0 };
  const rateSets = { direct: new Set(), indirect: new Set() };
  for (const [code, v] of Object.entries(b)) {
    if (String(code).startsWith('_')) continue;
    const category = String(v?.category || 'direct').trim().toLowerCase();
    const bucket = v?.bucket
      ? String(v.bucket).trim().toLowerCase()
      : ((category === 'indirect' || category === 'admin' || category === 'meeting') ? 'indirect'
        : (category === 'other' || category === 'tutoring') ? 'other'
          : (category === 'mileage' || category === 'bonus' || category === 'reimbursement' || category === 'other_pay') ? 'flat'
            : 'direct');
    const hours = Number(v?.hours || 0);
    const amount = Number(v?.amount || 0);
    const rateAmount = Number(v?.rateAmount || 0);
    if (bucket === 'indirect') { sums.indirectHours += hours; sums.indirectAmount += amount; }
    else if (bucket === 'other') { sums.otherHours += hours; }
    else if (bucket === 'direct') { sums.directHours += hours; sums.directAmount += amount; }

    if (hours > 1e-9 && rateAmount > 1e-9 && (bucket === 'direct' || bucket === 'indirect')) {
      rateSets[bucket].add(Math.round(rateAmount * 10000) / 10000);
    }
  }

  const directRate = sums.directHours > 1e-9 ? (sums.directAmount / sums.directHours) : null;
  const indirectRate = sums.indirectHours > 1e-9 ? (sums.indirectAmount / sums.indirectHours) : null;

  const totalHours = Number(props.period?.total_hours || 0);
  const effectiveRate =
    (sums.directHours > 1e-9 && sums.indirectHours <= 1e-9 && sums.otherHours <= 1e-9 && totalHours > 1e-9)
      ? (sums.directAmount / totalHours)
      : null;

  const hasDirectAndIndirect = sums.directHours > 1e-9 && sums.indirectHours > 1e-9;
  const hasVaryingRates = (rateSets.direct.size > 1) || (rateSets.indirect.size > 1);
  const variableRatesNote =
    hasDirectAndIndirect && hasVaryingRates
      ? 'Your default direct and indirect hourly rates are used for most services. Some service codes may have specific contracted rates (often higher than the defaults) and those rates take precedence; services without a specific rate use the defaults. When services are paid at varying rates, your average hourly pay for the period can change—this is due to a limitation of our payroll system.'
      : '';

  return { directRate, indirectRate, effectiveRate, variableRatesNote };
});

const ytdTotals = computed(() => {
  const exp = props.period;
  if (!exp) return null;
  const end = String(exp.period_end || '').slice(0, 10);
  const year = String(end || exp.period_start || '').slice(0, 4);
  if (!year || year.length !== 4) return null;

  const rows = (props.allPeriods || []).filter((p) => {
    const pe = String(p?.period_end || '').slice(0, 10);
    return pe && pe.slice(0, 4) === year && (!end || pe <= end);
  });
  const totalPay = rows.reduce((a, p) => a + Number(p?.total_amount || 0), 0);
  const totalHours = rows.reduce((a, p) => a + Number(p?.total_hours || 0), 0);
  return { year, totalPay, totalHours };
});
</script>

<style scoped>
.payroll-breakdown .muted { color: var(--text-secondary); }
.payroll-breakdown .right { text-align: right; }
.payroll-breakdown .row { margin-top: 4px; }
.payroll-breakdown .di-grid {
  display: grid;
  grid-template-columns: 1fr 110px 140px 140px;
  gap: 6px 10px;
  align-items: baseline;
}
.payroll-breakdown .di-head {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
}
.payroll-breakdown .codes-head,
.payroll-breakdown .paytype-head {
  display: grid;
  gap: 6px 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 700;
}
.payroll-breakdown .paytype-head {
  grid-template-columns: 1fr 110px 110px 140px;
}
.payroll-breakdown .paytype-row {
  display: grid;
  grid-template-columns: 1fr 110px 110px 140px;
  gap: 6px 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.payroll-breakdown .codes-head {
  grid-template-columns: 1fr 90px 90px 110px 120px 110px 140px;
}
.payroll-breakdown .code-row {
  display: grid;
  grid-template-columns: 1fr 90px 90px 110px 120px 110px 140px;
  gap: 6px 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.payroll-breakdown .code { font-weight: 700; }
</style>

