<template>
  <div v-if="visible" class="pay-calc">
    <button v-if="collapsible" type="button" class="pay-calc__header" @click="expanded = !expanded">
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
        <span class="pay-calc__title">{{ heading }}</span>
        <span class="pay-calc__sub">{{ subheading }}</span>
      </span>
      <span class="pay-calc__chevron">{{ expanded ? '▾' : '▸' }}</span>
    </button>
    <div v-else class="pay-calc__header pay-calc__header--static">
      <span class="pay-calc__icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
        </svg>
      </span>
      <span class="pay-calc__header-text">
        <span class="pay-calc__title">{{ heading }}</span>
        <span class="pay-calc__sub">{{ subheading }}</span>
      </span>
    </div>

    <div v-if="expanded || !collapsible" class="pay-calc__body">
      <div v-if="loading" class="pay-calc__muted">Loading rates…</div>
      <div v-else-if="error" class="pay-calc__error">{{ error }}</div>
      <div v-else>
        <div class="pay-calc__toolbar">
          <div class="pay-calc__chips">
            <span v-if="usingScenario" class="pay-calc__chip pay-calc__chip--blue">What-if / full calculator</span>
            <span v-else class="pay-calc__chip">Current pay</span>
            <span v-if="activeProfile" class="pay-calc__chip">
              {{ categoryLabel }} L{{ activeProfile.level }}
              · FFS ${{ fmt(activeCreditRate) }}
              · H ${{ fmt(activeHcodeRate) || '—' }}
              · Indirect ${{ fmt(activeProfile.indirectRate) }}
            </span>
          </div>
          <button
            v-if="allowWhatIf"
            type="button"
            class="pay-calc__swap"
            @click="toggleMode"
          >
            {{ usingScenario ? 'Use my current pay' : 'Swap to full calculator' }}
          </button>
        </div>

        <div v-if="usingScenario" class="pay-calc__scenario">
          <label>
            <span>Category</span>
            <select v-model.number="scenarioCategory" @change="onScenarioChange">
              <option :value="1">1 Unlicensed</option>
              <option :value="2">2 Pre-licensed</option>
              <option :value="3">3 Licensed</option>
            </select>
          </label>
          <label>
            <span>Level</span>
            <select v-model.number="scenarioLevel" @change="onScenarioChange">
              <option v-for="n in 5" :key="n" :value="n">Level {{ n }}</option>
            </select>
          </label>
          <label class="pay-calc__check">
            <input v-model="scenarioSpanish" type="checkbox" @change="scheduleEstimate" />
            Speaks Spanish
          </label>
          <label class="pay-calc__check">
            <input v-model="scenarioDenver" type="checkbox" @change="scheduleEstimate" />
            Denver / location bonus
          </label>
        </div>

        <div class="pay-calc__tier-row">
          <span class="pay-calc__label">Tier (biweekly)</span>
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
        </div>

        <div class="pay-calc__lines">
          <div class="pay-calc__lines-head">
            <span class="pay-calc__label">Line items</span>
            <div>
              <button type="button" class="pay-calc__link" @click="addServiceLine">+ Add service code</button>
              <button type="button" class="pay-calc__link" @click="addEventLine">+ Add event</button>
            </div>
          </div>

          <div v-for="(line, idx) in lines" :key="line._key" class="pay-calc__line pay-calc__line--wide">
            <select v-model="line.kind" class="pay-calc__select pay-calc__kind" @change="onKindChange(line); scheduleEstimate()">
              <option value="service">Service</option>
              <option value="event">Event</option>
            </select>
            <select
              v-if="line.kind === 'service'"
              v-model="line.code"
              class="pay-calc__select"
              @change="onCodeChange(line); scheduleEstimate()"
            >
              <option value="">Select code…</option>
              <option
                v-for="sc in serviceCodes"
                :key="sc.serviceCode"
                :value="sc.serviceCode"
                :disabled="isServiceTaken(sc.serviceCode, line)"
              >
                {{ sc.serviceCode }} ({{ payTypeLabel(sc.payType) }})
              </option>
            </select>
            <select
              v-else
              v-model.number="line.eventTypeId"
              class="pay-calc__select"
              @change="scheduleEstimate()"
            >
              <option :value="0">Select event…</option>
              <option v-for="ev in eventTypes" :key="ev.id" :value="ev.id">
                {{ ev.displayCode ? `${ev.displayCode} ` : '' }}{{ ev.label }}
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
            <button type="button" class="pay-calc__remove" title="Remove" @click="removeLine(idx)">✕</button>
          </div>
        </div>

        <div v-if="estimating" class="pay-calc__muted">Calculating…</div>
        <div v-else-if="estimate" class="pay-calc__result">
          <div class="pay-calc__table-wrap">
            <table class="pay-calc__table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Time</th>
                  <th>Bucket</th>
                  <th class="right">Direct</th>
                  <th class="right">Indirect</th>
                  <th class="right">Line total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in estimate.lines" :key="i">
                  <td>
                    <strong>{{ rowLabel(row) }}</strong>
                    <div v-if="row.quantityLabel" class="pay-calc__hint">{{ row.quantityLabel }}</div>
                  </td>
                  <td>{{ fmtHrs(row.timeHours) }} hr</td>
                  <td>{{ row.bucketLabel || '—' }}</td>
                  <td class="right">
                    <template v-if="Number(row.directHours || 0) > 0">
                      {{ fmtHrs(row.directHours) }} hr @ ${{ fmt(row.directRate) }}
                      <div>${{ fmt(row.directAmount) }}</div>
                    </template>
                    <span v-else class="muted">—</span>
                  </td>
                  <td class="right">
                    <template v-if="Number(row.indirectHours || 0) > 0">
                      {{ fmtHrs(row.indirectHours) }} hr @ ${{ fmt(row.indirectRate) }}
                      <div>${{ fmt(row.indirectAmount) }}</div>
                    </template>
                    <span v-else class="muted">—</span>
                  </td>
                  <td class="right"><strong>${{ fmt(row.lineTotal) }}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="pay-calc__summary">
            <div v-if="Number(estimate.summary.directHours || 0) > 0" class="pay-calc__sum-row">
              <span>Direct ({{ fmtHrs(estimate.summary.directHours) }} hr)</span>
              <strong>${{ fmt(estimate.summary.directPay) }}</strong>
            </div>
            <div v-if="Number(estimate.summary.indirectHours || 0) > 0" class="pay-calc__sum-row">
              <span>Indirect ({{ fmtHrs(estimate.summary.indirectHours) }} hr)</span>
              <strong>${{ fmt(estimate.summary.indirectPay) }}</strong>
            </div>
            <div v-if="Number(estimate.summary.credits || 0) > 0" class="pay-calc__sum-row">
              <span>Credits / productive hours</span>
              <strong>{{ fmtHrs(estimate.summary.credits) }}</strong>
            </div>
            <div v-if="estimate.summary.tierBonusAmount > 0" class="pay-calc__sum-row">
              <span>Tier {{ proposedTier }} bonus</span>
              <strong>${{ fmt(estimate.summary.tierBonusAmount) }}</strong>
            </div>
            <div v-if="estimate.summary.spanishBonusAmount > 0" class="pay-calc__sum-row">
              <span>Spanish bonus</span>
              <strong>${{ fmt(estimate.summary.spanishBonusAmount) }}</strong>
            </div>
            <div v-if="estimate.summary.locationBonusAmount > 0" class="pay-calc__sum-row">
              <span>Location / Denver bonus</span>
              <strong>${{ fmt(estimate.summary.locationBonusAmount) }}</strong>
            </div>
            <div class="pay-calc__sum-row pay-calc__sum-row--total">
              <span>Estimated total</span>
              <strong>${{ fmt(estimate.summary.grandTotal) }}</strong>
            </div>
            <p class="pay-calc__hint">
              H-codes with an H rate include embedded auto-indirect in the package (e.g. 4 units of H0004 = 1 hr @ $32 → $28 direct + $4 indirect). Levels without an H-code rate pay direct for that time; staff enter indirect separately.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  startExpanded: { type: Boolean, default: false },
  collapsible: { type: Boolean, default: true },
  /** personal = current assignment; scenario = pick category/level */
  mode: { type: String, default: 'personal' },
  allowWhatIf: { type: Boolean, default: true },
  heading: { type: String, default: 'Pay Calculator' },
  /** Admin unsaved rate matrix: { [category]: { [level]: profile } } */
  draftRates: { type: Object, default: null }
});

const loading = ref(false);
const estimating = ref(false);
const error = ref('');
const expanded = ref(!!props.startExpanded || !props.collapsible);
const visible = ref(true);
const usingScenario = ref(props.mode === 'scenario');

const rateProfile = ref(null);
const status = ref(null);
const serviceCodes = ref([]);
const eventTypes = ref([]);
const allRates = ref([]);
const thresholds = ref({ tier1MinWeekly: 6, tier2MinWeekly: 13, tier3MinWeekly: 25 });
const biweeklyThresholds = ref({ tier1Min: 12, tier2Min: 26, tier3Min: 50 });
const assignment = ref(null);
const categories = ref({});

const proposedTier = ref(1);
const scenarioCategory = ref(3);
const scenarioLevel = ref(1);
const scenarioSpanish = ref(false);
const scenarioDenver = ref(false);
let lineSeq = 1;
const lines = ref([{ _key: lineSeq++, kind: 'service', code: '', eventTypeId: 0, quantity: null }]);
const estimate = ref(null);

let estimateTimer = null;

const subheading = computed(() => {
  if (usingScenario.value) return 'Pick a category, level, tier, and codes to estimate pay';
  return 'Estimate pay from your current rates — swap to the full calculator to model a raise';
});

const activeProfile = computed(() => {
  if (usingScenario.value) {
    const overlay = props.draftRates?.[scenarioCategory.value]?.[scenarioLevel.value];
    if (overlay && (overlay.creditRate != null || overlay.hcodeRate != null)) return overlay;
    return (allRates.value || []).find((r) =>
      Number(r.category) === Number(scenarioCategory.value) && Number(r.level) === Number(scenarioLevel.value)
    ) || null;
  }
  return rateProfile.value;
});

const categoryLabel = computed(() => {
  const cat = Number(activeProfile.value?.category || scenarioCategory.value || assignment.value?.category || 0);
  return categories.value?.[cat]?.label || (cat ? `Category ${cat}` : '');
});

const activeCreditRate = computed(() => {
  const p = activeProfile.value;
  if (!p) return null;
  if (status.value?.useReducedRates && !usingScenario.value) return p.creditRateProbation ?? p.creditRate;
  return p.creditRate;
});

const activeHcodeRate = computed(() => {
  const p = activeProfile.value;
  if (!p) return null;
  if (status.value?.useReducedRates && !usingScenario.value) return p.hcodeRateProbation ?? p.hcodeRate;
  return p.hcodeRate;
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
  if (t === 'credit') return 'FFS';
  if (t === 'hcode') return 'H-code';
  if (t === 'indirect') return 'indirect';
  if (t === 'support_activity') return 'support';
  return t || '';
};

const findCode = (code) => serviceCodes.value.find((s) => s.serviceCode === code);

const isServiceTaken = (code, currentLine) =>
  lines.value.some((l) => l !== currentLine && l.kind === 'service' && l.code === code);

const qtyPlaceholder = (line) => {
  if (line.kind === 'event') return 'hours';
  const sc = findCode(line.code);
  if (!sc) return 'qty';
  if (sc.payType === 'hcode' && Number(sc.payDivisor) === 60) return 'minutes';
  if (Number(sc.creditValue) === 0.25 || Number(sc.payDivisor) === 4) return 'units';
  if (sc.payType === 'credit') return 'credits / units';
  return 'hours / units';
};

const onKindChange = (line) => {
  line.code = '';
  line.eventTypeId = 0;
  line.quantity = null;
};

const onCodeChange = (line) => {
  if (line.quantity == null) line.quantity = 1;
};

const addServiceLine = () => {
  lines.value.push({ _key: lineSeq++, kind: 'service', code: '', eventTypeId: 0, quantity: null });
};

const addEventLine = () => {
  lines.value.push({ _key: lineSeq++, kind: 'event', code: '', eventTypeId: 0, quantity: 1 });
};

const removeLine = (idx) => {
  lines.value.splice(idx, 1);
  if (!lines.value.length) addServiceLine();
  scheduleEstimate();
};

const toggleMode = () => {
  usingScenario.value = !usingScenario.value;
  if (usingScenario.value) {
    scenarioCategory.value = Number(assignment.value?.category || rateProfile.value?.category || 3);
    scenarioLevel.value = Number(assignment.value?.level || rateProfile.value?.level || 1);
    scenarioSpanish.value = !!status.value?.spanishBonusEligible;
    scenarioDenver.value = !!status.value?.locationBonusEligible;
  }
  scheduleEstimate();
};

const onScenarioChange = () => scheduleEstimate();

const payloadLines = () => lines.value
  .filter((l) => Number(l.quantity) > 0)
  .map((l) => {
    if (l.kind === 'event') {
      const ev = eventTypes.value.find((e) => Number(e.id) === Number(l.eventTypeId));
      return {
        kind: 'event',
        eventTypeId: Number(l.eventTypeId) || 0,
        hours: Number(l.quantity),
        quantity: Number(l.quantity),
        label: ev?.label,
        displayCode: ev?.displayCode,
        payBucket: ev?.payBucket
      };
    }
    return { kind: 'service', code: l.code, serviceCode: l.code, quantity: Number(l.quantity) };
  })
  .filter((l) => (l.kind === 'event' ? l.eventTypeId : l.code));

const rowLabel = (row) => {
  if (row.kind === 'event') {
    const code = String(row.displayCode || '').trim();
    const label = String(row.label || '').trim();
    return [code, label].filter(Boolean).join(' ') || 'Event';
  }
  return row.serviceCode || 'Service';
};

const scheduleEstimate = () => {
  if (estimateTimer) clearTimeout(estimateTimer);
  estimateTimer = setTimeout(runEstimate, 280);
};

const overlayProfile = () => {
  if (!props.draftRates) return undefined;
  const row = props.draftRates?.[scenarioCategory.value]?.[scenarioLevel.value];
  if (!row) return undefined;
  return {
    creditRate: row.creditRate,
    creditRateProbation: row.creditRateProbation,
    hcodeRate: row.hcodeRate,
    hcodeRateProbation: row.hcodeRateProbation,
    indirectRate: row.indirectRate,
    supportActivityRate: row.supportActivityRate,
    autoIndirectMinutesPerHour: row.autoIndirectMinutesPerHour,
    tierBonus: row.tierBonus,
    spanishBonus: row.spanishBonus,
    locationBonus: row.locationBonus
  };
};

const runEstimate = async () => {
  const payload = payloadLines();
  if (!payload.length) {
    estimate.value = null;
    return;
  }
  estimating.value = true;
  error.value = '';
  try {
    const params = {};
    if (props.agencyId) params.agencyId = props.agencyId;
    if (usingScenario.value || !rateProfile.value) {
      const res = await api.post('/payroll/pay-system/estimate-scenario', {
        agencyId: props.agencyId || undefined,
        category: scenarioCategory.value,
        level: scenarioLevel.value,
        tier: proposedTier.value,
        spanishBonusEligible: scenarioSpanish.value,
        locationBonusEligible: scenarioDenver.value,
        rateProfile: overlayProfile(),
        lines: payload
      }, { params, skipGlobalLoading: true });
      estimate.value = res?.data || null;
    } else {
      const res = await api.post('/payroll/pay-system/estimate', {
        agencyId: props.agencyId || undefined,
        tier: proposedTier.value,
        lines: payload,
        assumeSpanish: scenarioSpanish.value || undefined,
        assumeDenver: scenarioDenver.value || undefined
      }, { params, skipGlobalLoading: true });
      estimate.value = res?.data || null;
      if (res?.data?.status) status.value = res.data.status;
    }
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
    eventTypes.value = Array.isArray(d.eventTypes) ? d.eventTypes : [];
    allRates.value = Array.isArray(d.rates) ? d.rates : [];
    thresholds.value = d.thresholds || thresholds.value;
    biweeklyThresholds.value = d.biweeklyThresholds || biweeklyThresholds.value;
    assignment.value = d.assignment || null;
    categories.value = d.categories || {};
    visible.value = true;
    if (d.reason === 'no_agency') visible.value = props.mode === 'scenario';
    if (!rateProfile.value || props.mode === 'scenario') {
      usingScenario.value = true;
      scenarioCategory.value = Number(d.assignment?.category || 3);
      scenarioLevel.value = Number(d.assignment?.level || 1);
    }
    if (d.status?.spanishBonusEligible) scenarioSpanish.value = true;
    if (d.status?.locationBonusEligible) scenarioDenver.value = true;
  } catch (e) {
    if (e?.response?.status === 404 || e?.response?.status === 401) {
      visible.value = props.mode === 'scenario';
    } else {
      error.value = e?.response?.data?.error?.message || e.message || 'Failed to load calculator';
    }
  } finally {
    loading.value = false;
  }
};

onMounted(load);
watch(() => props.agencyId, () => load());
watch(() => props.draftRates, () => {
  if (usingScenario.value) scheduleEstimate();
}, { deep: true });
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
.pay-calc__header--static { cursor: default; }
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
.pay-calc__chevron { color: #64748b; font-size: 14px; }
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
.pay-calc__toolbar {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.pay-calc__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pay-calc__chip {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #334155;
  font-size: 11px;
  font-weight: 600;
}
.pay-calc__chip--blue { background: #dbeafe; color: #1e40af; }
.pay-calc__swap {
  border: 1px solid #166534;
  background: #fff;
  color: #166534;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.pay-calc__scenario {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  margin-bottom: 12px;
}
.pay-calc__scenario label span {
  display: block;
  font-size: 11px;
  font-weight: 700;
  color: #374151;
  margin-bottom: 4px;
}
.pay-calc__scenario select {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}
.pay-calc__check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #374151;
  padding-bottom: 4px;
}
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
.pay-calc__hint { margin: 8px 0 0; font-size: 12px; color: #64748b; }
.pay-calc__lines { margin-top: 14px; }
.pay-calc__lines-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  gap: 8px;
}
.pay-calc__link {
  background: none;
  border: none;
  color: #166534;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  margin-left: 8px;
}
.pay-calc__line--wide {
  display: grid;
  grid-template-columns: 110px minmax(0, 1.6fr) 100px 28px;
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
.pay-calc__remove {
  border: none;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  cursor: pointer;
}
.pay-calc__table-wrap { overflow-x: auto; margin-top: 12px; }
.pay-calc__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.pay-calc__table th,
.pay-calc__table td {
  border-bottom: 1px solid #e5e7eb;
  padding: 8px 6px;
  text-align: left;
  vertical-align: top;
}
.pay-calc__table .right { text-align: right; }
.muted { color: #9ca3af; }
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
@media (max-width: 720px) {
  .pay-calc__tiers { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pay-calc__line--wide { grid-template-columns: 1fr 1fr; }
}
</style>
