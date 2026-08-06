<template>
  <div v-if="visible" class="pay-calc">
    <button type="button" class="pay-calc__header" @click="expanded = !expanded">
      <span class="pay-calc__icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <line x1="8" y1="10" x2="10" y2="10" />
          <line x1="14" y1="10" x2="16" y2="10" />
          <line x1="8" y1="14" x2="10" y2="14" />
          <line x1="14" y1="14" x2="16" y2="14" />
          <line x1="8" y1="18" x2="16" y2="18" />
        </svg>
      </span>
      <span class="pay-calc__header-text">
        <span class="pay-calc__title">Pay Calculator</span>
        <span class="pay-calc__sub">
          Estimate pay by tier and services
          <template v-if="categoryLabel"> · {{ categoryLabel }} L{{ rateProfile?.level }}</template>
        </span>
      </span>
      <span class="pay-calc__chevron">{{ expanded ? '▾' : '▸' }}</span>
    </button>

    <div v-if="expanded" class="pay-calc__body">
      <div v-if="loading" class="pay-calc__muted">Loading rates…</div>
      <div v-else-if="error" class="pay-calc__error">{{ error }}</div>
      <div v-else-if="!rateProfile" class="pay-calc__muted">
        No pay-system rates for your category/level yet. Ask an admin to configure Pay System Rates.
      </div>

      <template v-else>
        <!-- Status chips -->
        <div class="pay-calc__chips">
          <span v-if="status?.inProbation" class="pay-calc__chip pay-calc__chip--warn">90-day probation rates</span>
          <span v-if="status?.waiveProbation" class="pay-calc__chip">Probation waived</span>
          <span v-if="status?.spanishBonusEligible" class="pay-calc__chip pay-calc__chip--blue">Spanish bonus eligible</span>
          <span class="pay-calc__chip">
            Credit ${{ fmt(activeCreditRate) }} · H-code ${{ fmt(activeHcodeRate) }} · Indirect ${{ fmt(rateProfile.indirectRate) }}
          </span>
        </div>

        <!-- Tier picker -->
        <div class="pay-calc__tier-row">
          <span class="pay-calc__label">Proposed tier (biweekly)</span>
          <div class="pay-calc__tiers">
            <button
              v-for="t in tierOptions"
              :key="t.level"
              type="button"
              class="pay-calc__tier"
              :class="{ 'pay-calc__tier--active': proposedTier === t.level }"
              @click="proposedTier = t.level; scheduleEstimate()"
            >
              <strong>{{ t.label }}</strong>
              <span>{{ t.hint }}</span>
            </button>
          </div>
          <p v-if="tierThresholdHint" class="pay-calc__hint">{{ tierThresholdHint }}</p>
        </div>

        <!-- Line items -->
        <div class="pay-calc__lines">
          <div class="pay-calc__lines-head">
            <span class="pay-calc__label">Services</span>
            <button type="button" class="pay-calc__link" @click="addLine">+ Add code</button>
          </div>

          <div v-for="(line, idx) in lines" :key="idx" class="pay-calc__line">
            <select v-model="line.code" class="pay-calc__select" @change="onCodeChange(line); scheduleEstimate()">
              <option value="">Select code…</option>
              <option v-for="sc in serviceCodes" :key="sc.serviceCode" :value="sc.serviceCode">
                {{ sc.serviceCode }} ({{ payTypeLabel(sc.payType) }})
              </option>
            </select>
            <input
              v-model.number="line.quantity"
              type="number"
              min="0"
              step="0.25"
              class="pay-calc__qty"
              :placeholder="qtyPlaceholder(line)"
              @input="scheduleEstimate()"
            />
            <span class="pay-calc__equiv">{{ lineEquiv(line) }}</span>
            <button type="button" class="pay-calc__remove" title="Remove" @click="removeLine(idx)">✕</button>
          </div>
        </div>

        <!-- Progress toward tier -->
        <div v-if="estimate" class="pay-calc__progress">
          <div class="pay-calc__progress-label">
            <span>{{ fmtHrs(productiveHours) }} hour-eq toward Tier {{ proposedTier || '—' }}</span>
            <span v-if="proposedTier >= 1">need {{ fmtHrs(tierTargetHours) }} biweekly</span>
          </div>
          <div class="pay-calc__bar">
            <div class="pay-calc__bar-fill" :style="{ width: progressPct + '%' }" />
          </div>
        </div>

        <!-- Summary -->
        <div v-if="estimating" class="pay-calc__muted">Calculating…</div>
        <div v-else-if="estimate" class="pay-calc__summary">
          <div class="pay-calc__sum-row"><span>Base pay</span><strong>${{ fmt(estimate.summary.baseAmount) }}</strong></div>
          <div v-if="estimate.summary.autoIndirectAmount > 0" class="pay-calc__sum-row">
            <span>Auto-indirect (H-codes)</span><strong>${{ fmt(estimate.summary.autoIndirectAmount) }}</strong>
          </div>
          <div v-if="estimate.summary.tierBonusAmount > 0" class="pay-calc__sum-row">
            <span>Tier {{ proposedTier }} bonus</span><strong>${{ fmt(estimate.summary.tierBonusAmount) }}</strong>
          </div>
          <div v-if="estimate.summary.spanishBonusAmount > 0" class="pay-calc__sum-row">
            <span>Spanish bonus</span><strong>${{ fmt(estimate.summary.spanishBonusAmount) }}</strong>
          </div>
          <div class="pay-calc__sum-row pay-calc__sum-row--total">
            <span>Estimated total</span><strong>${{ fmt(estimate.summary.grandTotal) }}</strong>
          </div>
          <p v-if="status?.useReducedRates" class="pay-calc__hint pay-calc__hint--warn">
            Using Minimum Workload / probationary credit &amp; H-code rates.
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  /** Start expanded (e.g. on Submit page) */
  startExpanded: { type: Boolean, default: false }
});

const loading = ref(false);
const estimating = ref(false);
const error = ref('');
const expanded = ref(!!props.startExpanded);
const visible = ref(true);

const rateProfile = ref(null);
const status = ref(null);
const serviceCodes = ref([]);
const thresholds = ref({ tier1MinWeekly: 6, tier2MinWeekly: 13, tier3MinWeekly: 25 });
const biweeklyThresholds = ref({ tier1Min: 12, tier2Min: 26, tier3Min: 50 });
const assignment = ref(null);
const categories = ref({});

const proposedTier = ref(1);
const lines = ref([{ code: '', quantity: null }]);
const estimate = ref(null);

let estimateTimer = null;

const categoryLabel = computed(() => {
  const cat = Number(assignment.value?.category || rateProfile.value?.category || 0);
  return categories.value?.[cat]?.label || (cat ? `Category ${cat}` : '');
});

const activeCreditRate = computed(() => {
  if (status.value?.useReducedRates) {
    return rateProfile.value?.creditRateProbation ?? rateProfile.value?.creditRate;
  }
  return rateProfile.value?.creditRate;
});

const activeHcodeRate = computed(() => {
  if (status.value?.useReducedRates) {
    return rateProfile.value?.hcodeRateProbation ?? rateProfile.value?.hcodeRate;
  }
  return rateProfile.value?.hcodeRate;
});

const tierOptions = computed(() => {
  const b = biweeklyThresholds.value || {};
  return [
    { level: 0, label: 'Below T1', hint: `< ${fmtHrs(b.tier1Min)} (MWR)` },
    { level: 1, label: 'Tier 1', hint: `≥ ${fmtHrs(b.tier1Min)}` },
    { level: 2, label: 'Tier 2', hint: `≥ ${fmtHrs(b.tier2Min)}` },
    { level: 3, label: 'Tier 3', hint: `≥ ${fmtHrs(b.tier3Min)}` }
  ];
});

const tierTargetHours = computed(() => {
  const b = biweeklyThresholds.value || {};
  if (proposedTier.value >= 3) return Number(b.tier3Min || 50);
  if (proposedTier.value >= 2) return Number(b.tier2Min || 26);
  if (proposedTier.value >= 1) return Number(b.tier1Min || 12);
  return Number(b.tier1Min || 12);
});

const productiveHours = computed(() => Number(estimate.value?.summary?.productiveHourEquivalent || 0));

const progressPct = computed(() => {
  const target = tierTargetHours.value || 1;
  return Math.min(100, Math.round((productiveHours.value / target) * 100));
});

const tierThresholdHint = computed(() => {
  if (proposedTier.value <= 0) {
    return 'Below Tier 1 uses the Minimum Workload (probationary) credit & H-code rates, unless waived.';
  }
  const bonus = rateProfile.value?.tierBonus?.[proposedTier.value] || 0;
  const spanish = rateProfile.value?.spanishBonus?.[proposedTier.value] || 0;
  const parts = [];
  if (bonus > 0) parts.push(`Tier bonus $${fmt(bonus)}/credit`);
  if (spanish > 0 && status.value?.spanishBonusEligible) parts.push(`Spanish +$${fmt(spanish)}/credit`);
  return parts.length ? parts.join(' · ') : 'No tier bonus configured at this level.';
});

const fmt = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(2);
};

const fmtHrs = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

const payTypeLabel = (t) => {
  if (t === 'credit') return 'credit';
  if (t === 'hcode') return 'H-code';
  if (t === 'indirect') return 'indirect';
  if (t === 'support_activity') return 'support';
  return t || '';
};

const findCode = (code) => serviceCodes.value.find((s) => s.serviceCode === code);

const qtyPlaceholder = (line) => {
  const sc = findCode(line.code);
  if (!sc) return 'qty';
  if (sc.payType === 'hcode' && Number(sc.payDivisor) === 60) return 'minutes';
  if (Number(sc.creditValue) === 0.25 || Number(sc.payDivisor) === 4) return 'units';
  if (sc.payType === 'credit') return 'credits';
  return 'hours / units';
};

const lineEquiv = (line) => {
  const sc = findCode(line.code);
  const q = Number(line.quantity);
  if (!sc || !Number.isFinite(q) || q <= 0) return '';
  const creditValue = Number(sc.creditValue ?? 0);
  const payDivisor = Number(sc.payDivisor || 1) || 1;
  const hours = Math.abs(creditValue) > 1e-9 ? q * creditValue : q / payDivisor;
  return `= ${fmtHrs(hours)} hr`;
};

const onCodeChange = (line) => {
  if (line.quantity == null) line.quantity = 1;
};

const addLine = () => {
  lines.value.push({ code: '', quantity: null });
};

const removeLine = (idx) => {
  lines.value.splice(idx, 1);
  if (!lines.value.length) lines.value.push({ code: '', quantity: null });
  scheduleEstimate();
};

const scheduleEstimate = () => {
  if (estimateTimer) clearTimeout(estimateTimer);
  estimateTimer = setTimeout(runEstimate, 280);
};

const runEstimate = async () => {
  const payloadLines = lines.value
    .filter((l) => l.code && Number(l.quantity) > 0)
    .map((l) => ({ code: l.code, quantity: Number(l.quantity) }));

  if (!payloadLines.length) {
    estimate.value = null;
    return;
  }

  estimating.value = true;
  try {
    const params = {};
    if (props.agencyId) params.agencyId = props.agencyId;
    const res = await api.post('/payroll/pay-system/estimate', {
      agencyId: props.agencyId || undefined,
      tier: proposedTier.value,
      lines: payloadLines
    }, { params, skipGlobalLoading: true });
    estimate.value = res?.data || null;
    if (res?.data?.status) status.value = res.data.status;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Estimate failed';
  } finally {
    estimating.value = false;
  }
};

const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    const params = {};
    if (props.agencyId) params.agencyId = props.agencyId;
    const res = await api.get('/payroll/pay-system/my-rates', { params, skipGlobalLoading: true });
    const d = res?.data || {};
    rateProfile.value = d.rateProfile || null;
    status.value = d.status || null;
    serviceCodes.value = Array.isArray(d.serviceCodes) ? d.serviceCodes : [];
    thresholds.value = d.thresholds || thresholds.value;
    biweeklyThresholds.value = d.biweeklyThresholds || biweeklyThresholds.value;
    assignment.value = d.assignment || null;
    categories.value = d.categories || {};

    // Hide card entirely only when user has no assignment at all
    if (d.reason === 'no_assignment' || d.reason === 'no_agency') {
      visible.value = false;
    } else {
      visible.value = true;
    }
  } catch (e) {
    // Soft-fail: hide if endpoint missing / unauthorized
    if (e?.response?.status === 404 || e?.response?.status === 401) {
      visible.value = false;
    } else {
      error.value = e?.response?.data?.error?.message || e.message || 'Failed to load calculator';
    }
  } finally {
    loading.value = false;
  }
};

onMounted(load);
watch(() => props.agencyId, () => load());
</script>

<style scoped>
.pay-calc {
  background: #fff;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  margin-bottom: 14px;
  overflow: hidden;
}
.pay-calc__header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: linear-gradient(90deg, #eff6ff 0%, #f0fdf4 100%);
  border: none;
  cursor: pointer;
  text-align: left;
}
.pay-calc__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #166534;
  color: #fff;
  flex-shrink: 0;
}
.pay-calc__header-text { flex: 1; min-width: 0; }
.pay-calc__title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}
.pay-calc__sub {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}
.pay-calc__chevron {
  color: #64748b;
  font-size: 14px;
}
.pay-calc__body { padding: 14px; }
.pay-calc__muted { font-size: 13px; color: #64748b; }
.pay-calc__error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
}
.pay-calc__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.pay-calc__chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #334155;
  font-size: 11px;
  font-weight: 600;
}
.pay-calc__chip--warn { background: #fef3c7; color: #92400e; }
.pay-calc__chip--blue { background: #dbeafe; color: #1e40af; }
.pay-calc__label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  margin-bottom: 6px;
}
.pay-calc__tiers {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.pay-calc__tier {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}
.pay-calc__tier strong { font-size: 13px; color: #0f172a; }
.pay-calc__tier span { font-size: 11px; color: #64748b; }
.pay-calc__tier--active {
  border-color: #166534;
  background: #f0fdf4;
  box-shadow: 0 0 0 1px #166534 inset;
}
.pay-calc__hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #64748b;
}
.pay-calc__hint--warn { color: #92400e; }
.pay-calc__lines { margin-top: 14px; }
.pay-calc__lines-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.pay-calc__link {
  background: none;
  border: none;
  color: #166534;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.pay-calc__line {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 90px minmax(70px, 0.7fr) 28px;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}
.pay-calc__select,
.pay-calc__qty {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  width: 100%;
}
.pay-calc__equiv {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}
.pay-calc__remove {
  border: none;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  cursor: pointer;
}
.pay-calc__progress { margin-top: 12px; }
.pay-calc__progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #475569;
  margin-bottom: 4px;
}
.pay-calc__bar {
  height: 8px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}
.pay-calc__bar-fill {
  height: 100%;
  background: #166534;
  border-radius: 999px;
  transition: width 0.2s ease;
}
.pay-calc__summary {
  margin-top: 14px;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.pay-calc__sum-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #334155;
  padding: 3px 0;
}
.pay-calc__sum-row--total {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
  font-size: 15px;
  color: #0f172a;
}
@media (max-width: 640px) {
  .pay-calc__tiers { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pay-calc__line {
    grid-template-columns: 1fr 80px;
  }
  .pay-calc__equiv,
  .pay-calc__remove { grid-column: span 1; }
}
</style>
