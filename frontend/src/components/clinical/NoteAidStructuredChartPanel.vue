<template>
  <section class="na-chart" aria-label="Mental status and risk assessment">
    <header class="na-chart__head">
      <div>
        <strong>Mental Status &amp; Risk Assessment</strong>
        <p class="na-chart__sub">
          Click a domain (or hover) to open options, then hover an option for its description.
        </p>
      </div>
    </header>

    <div v-if="diagnosisMode !== 'none'" class="na-chart__block">
      <h3>{{ diagnosisMode === 'zr_only' ? 'Z / R codes (social determinants)' : 'Diagnoses &amp; justification' }}</h3>
      <p v-if="diagnosisMode === 'zr_only'" class="muted tiny">
        H0031 supports Z and R codes only — DSM mental-health diagnoses belong on 90791 / licensed documentation.
      </p>
      <ul v-if="diagnoses.length" class="na-chart__dx">
        <li v-for="d in diagnoses" :key="d.id || d.code || d.icd10_code">
          <strong>{{ d.code || d.icd10_code || 'Dx' }}</strong>
          {{ d.description || d.label || '' }}
          <span v-if="d.is_primary || d.primary" class="pill">Primary</span>
        </li>
      </ul>
      <p v-else class="muted">
        {{ diagnosisMode === 'zr_only' ? 'No Z/R codes on file.' : 'No chart diagnoses loaded.' }}
      </p>
      <div v-if="diagnosticJustification && diagnosisMode !== 'zr_only'" class="na-chart__justification">
        <span class="na-chart__justification-label">Diagnostic justification</span>
        <p class="na-chart__justification-body">{{ diagnosticJustification }}</p>
      </div>
      <p v-else-if="diagnosisMode !== 'zr_only'" class="muted tiny">No diagnostic justification on file.</p>
    </div>

    <div v-if="!skipMse" class="na-chart__block na-chart__block--mse">
      <div class="na-chart__row">
        <div class="na-chart__title-row">
          <h3>Current Mental Status</h3>
          <span class="badge">{{ mseDomainDefs.length }} fields</span>
          <span class="badge" :class="mseSummaryComplete ? 'badge--ok' : 'badge--warn'">{{ mseSummaryBadge }}</span>
        </div>
        <div class="na-chart__toggles">
          <button type="button" class="na-chart__btn" @click="$emit('mse-all-normal')">All Normal</button>
          <button type="button" class="na-chart__btn" @click="$emit('mse-all-not-assessed')">All Not Assessed</button>
        </div>
      </div>
      <div class="na-mse-grid">
        <div
          v-for="def in mseDomainDefs"
          :key="def.key"
          class="na-mse-domain"
          :class="{
            'na-mse-domain--open': openMseKey === def.key,
            'na-mse-domain--set': !!domainLabel(mse.domains?.[def.key])
          }"
          @mouseenter="openMse(def.key)"
          @mouseleave="scheduleCloseMse(def.key)"
          @focusin="openMse(def.key)"
        >
          <button
            type="button"
            class="na-mse-domain__trigger"
            :aria-expanded="openMseKey === def.key"
            @click="toggleMse(def.key)"
          >
            <span class="na-mse-name">{{ def.label }}</span>
            <span class="na-mse-value">{{ domainLabel(mse.domains?.[def.key]) || 'Select…' }}</span>
          </button>
          <div
            v-if="openMseKey === def.key"
            class="na-mse-flyout"
            role="listbox"
            :aria-label="def.label"
            @mouseenter="cancelCloseMse"
            @mouseleave="scheduleCloseMse(def.key)"
          >
            <div class="na-mse-flyout-inner">
              <div class="na-mse-options">
                <button
                  v-for="opt in def.options"
                  :key="opt.label"
                  type="button"
                  class="na-mse-opt"
                  :class="{ on: domainLabel(mse.domains?.[def.key]) === opt.label }"
                  role="option"
                  @mouseenter="hoverMseOpt = opt"
                  @focus="hoverMseOpt = opt"
                  @click="selectMseOption(def, opt)"
                >
                  {{ opt.label }}
                </button>
              </div>
              <p class="na-mse-desc">
                {{ (hoverMseOpt && hoverMseOpt.description) || 'Hover an option to see its clinical description.' }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="na-chart__skip muted">{{ mseSkipLabel }}</p>

    <div class="na-chart__block na-chart__block--risk">
      <h3>Risk Assessment</h3>

      <div class="na-risk-deny" :class="{ on: !!risk.patientDeniesAll }">
        <div>
          <strong>Patient denies all areas of risk and no contraindications</strong>
          <p>Check this when the client denies SI, HI, self-harm, and related safety concerns for this session.</p>
        </div>
        <label class="na-risk-deny-toggle">
          <input
            type="checkbox"
            :checked="!!risk.patientDeniesAll"
            @change="onDenyAll($event.target.checked)"
          />
          <span>Patient denies all and no contraindications</span>
        </label>
      </div>

      <div class="na-risk-body" :class="{ muted: !!risk.patientDeniesAll }">
        <p class="na-risk-areas-label">Safety domains</p>
        <div class="na-mse-grid na-mse-grid--risk">
          <div
            v-for="def in riskDomainDefs"
            :key="def.key"
            class="na-mse-domain"
            :class="{
              'na-mse-domain--open': openRiskKey === def.key,
              'na-mse-domain--set': !!domainLabel(risk.items?.[def.key])
            }"
            @mouseenter="!risk.patientDeniesAll && openRisk(def.key)"
            @mouseleave="scheduleCloseRisk(def.key)"
            @focusin="!risk.patientDeniesAll && openRisk(def.key)"
          >
            <button
              type="button"
              class="na-mse-domain__trigger"
              :disabled="!!risk.patientDeniesAll"
              :aria-expanded="openRiskKey === def.key"
              @click="!risk.patientDeniesAll && toggleRisk(def.key)"
            >
              <span class="na-mse-name">{{ def.label }}</span>
              <span class="na-mse-value">{{ domainLabel(risk.items?.[def.key]) || 'Select…' }}</span>
            </button>
            <div
              v-if="openRiskKey === def.key && !risk.patientDeniesAll"
              class="na-mse-flyout"
              role="listbox"
              @mouseenter="cancelCloseRisk"
              @mouseleave="scheduleCloseRisk(def.key)"
            >
              <div class="na-mse-flyout-inner">
                <div class="na-mse-options">
                  <button
                    v-for="opt in def.options"
                    :key="opt.label"
                    type="button"
                    class="na-mse-opt"
                    :class="{ on: domainLabel(risk.items?.[def.key]) === opt.label }"
                    @mouseenter="hoverRiskOpt = opt"
                    @focus="hoverRiskOpt = opt"
                    @click="selectRiskOption(def, opt)"
                  >
                    {{ opt.label }}
                  </button>
                </div>
                <p class="na-mse-desc">
                  {{ (hoverRiskOpt && hoverRiskOpt.description) || 'Hover an option to see its clinical description.' }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <label class="na-chart__label">
          Protective factors
          <select
            class="na-risk-protect-select"
            :value="''"
            @change="addProtectiveFactor($event.target.value); $event.target.value = ''"
          >
            <option value="" disabled>Add a protective factor…</option>
            <option
              v-for="opt in protectiveFactorChoices"
              :key="opt"
              :value="opt"
              :disabled="hasProtectiveFactor(opt)"
            >
              {{ opt }}
            </option>
          </select>
        </label>
        <div v-if="(risk.protectiveFactors || []).length" class="na-risk-protect-chips">
          <button
            v-for="factor in risk.protectiveFactors"
            :key="factor"
            type="button"
            class="na-risk-protect-chip"
            :title="`Remove ${factor}`"
            @click="removeProtectiveFactor(factor)"
          >
            {{ factor }} ×
          </button>
        </div>

        <label class="na-chart__label na-risk-notes">
          Risk notes (optional)
          <textarea
            :value="risk.notes || ''"
            rows="3"
            maxlength="1000"
            placeholder="Document any relevant risk details, safety planning, or clinical observations…"
            :disabled="!!risk.patientDeniesAll"
            @input="emit('update:risk', { ...risk, notes: $event.target.value })"
          />
          <span class="na-risk-count">{{ String(risk.notes || '').length }} / 1000</span>
        </label>

        <p class="na-risk-reminder">
          Complete a comprehensive risk assessment and document safety planning as indicated by patient risk level and presentation.
        </p>
      </div>
    </div>

    <div class="na-chart__block">
      <div class="na-chart__row">
        <h3>Medications</h3>
        <label class="chk">
          <input
            type="checkbox"
            :checked="!!medications.noneCurrently"
            @change="onNoneMeds($event.target.checked)"
          />
          None currently
        </label>
      </div>
      <p v-if="medicationsSourceHint" class="muted tiny">{{ medicationsSourceHint }}</p>
      <div v-for="(med, idx) in (medications.items || [])" :key="idx" class="na-med-row">
        <input
          type="text"
          placeholder="Medication"
          :value="med.name"
          :disabled="!!medications.noneCurrently"
          @input="patchMed(idx, { name: $event.target.value })"
        />
        <input
          type="text"
          placeholder="Dose / frequency"
          :value="med.dose"
          :disabled="!!medications.noneCurrently"
          @input="patchMed(idx, { dose: $event.target.value })"
        />
        <button type="button" class="linkish danger" :disabled="!!medications.noneCurrently" @click="removeMed(idx)">
          Remove
        </button>
      </div>
      <button type="button" class="linkish" :disabled="!!medications.noneCurrently" @click="addMed">
        + Add medication
      </button>
      <label class="na-chart__label">
        Comments
        <textarea
          :value="medications.commentsHtml || ''"
          rows="2"
          @input="emitMeds({ ...medications, commentsHtml: $event.target.value })"
        />
      </label>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  MSE_DOMAIN_DEFS,
  RISK_DOMAIN_DEFS,
  PROTECTIVE_FACTOR_OPTIONS,
  domainSelectionLabel,
  isMentalStatusExamComplete,
  buildDeniedRiskAssessment,
  emptyRiskAssessment
} from '../../utils/noteAidMseCatalog.js';

const props = defineProps({
  diagnoses: { type: Array, default: () => [] },
  diagnosticJustification: { type: String, default: '' },
  mse: { type: Object, default: () => ({ domains: {} }) },
  risk: {
    type: Object,
    default: () => ({ patientDeniesAll: false, items: {}, areas: [], protectiveFactors: [], notes: '' })
  },
  medications: { type: Object, default: () => ({ noneCurrently: true, items: [], commentsHtml: '' }) },
  medicationsSourceHint: { type: String, default: '' },
  skipMse: { type: Boolean, default: false },
  diagnosisMode: { type: String, default: 'full' },
  mseSkipLabel: { type: String, default: 'Mental status exam skipped for this service.' }
});

const emit = defineEmits([
  'update:diagnosticJustification',
  'update:mse',
  'update:risk',
  'update:medications',
  'mse-all-normal',
  'mse-all-not-assessed'
]);

const mseDomainDefs = MSE_DOMAIN_DEFS;
const riskDomainDefs = RISK_DOMAIN_DEFS;
const protectiveFactorChoices = PROTECTIVE_FACTOR_OPTIONS;

const openMseKey = ref(null);
const openRiskKey = ref(null);
const hoverMseOpt = ref(null);
const hoverRiskOpt = ref(null);
let mseCloseTimer = null;
let riskCloseTimer = null;

const mseSummaryComplete = computed(() => isMentalStatusExamComplete(props.mse));

const mseSummaryBadge = computed(() => {
  if (props.mse?.allNormal) return 'All normal';
  if (props.mse?.allNotAssessed) return 'All not assessed';
  const map = props.mse?.domains || {};
  let set = 0;
  for (const def of mseDomainDefs) {
    if (domainSelectionLabel(map[def.key])) set += 1;
  }
  if (!set) return 'Not started';
  if (set === mseDomainDefs.length) return 'Complete';
  return `${set}/${mseDomainDefs.length} selected`;
});

function domainLabel(cell) {
  return domainSelectionLabel(cell);
}

function cancelCloseMse() {
  if (mseCloseTimer) {
    clearTimeout(mseCloseTimer);
    mseCloseTimer = null;
  }
}

function openMse(key) {
  cancelCloseMse();
  openMseKey.value = key;
  const cur = domainLabel(props.mse?.domains?.[key]);
  const def = mseDomainDefs.find((d) => d.key === key);
  hoverMseOpt.value = def?.options?.find((o) => o.label === cur) || def?.options?.[0] || null;
}

function closeMse(key) {
  if (openMseKey.value === key) {
    openMseKey.value = null;
    hoverMseOpt.value = null;
  }
}

function scheduleCloseMse(key) {
  cancelCloseMse();
  mseCloseTimer = setTimeout(() => closeMse(key), 180);
}

function toggleMse(key) {
  cancelCloseMse();
  if (openMseKey.value === key) closeMse(key);
  else openMse(key);
}

function selectMseOption(def, opt) {
  const domainsMap = { ...(props.mse?.domains || {}) };
  domainsMap[def.key] = {
    status: 'selected',
    option: opt.label,
    detail: opt.description || ''
  };
  emit('update:mse', {
    ...props.mse,
    domains: domainsMap,
    allNormal: false,
    allNotAssessed: false
  });
  cancelCloseMse();
  openMseKey.value = null;
  hoverMseOpt.value = null;
}

function cancelCloseRisk() {
  if (riskCloseTimer) {
    clearTimeout(riskCloseTimer);
    riskCloseTimer = null;
  }
}

function openRisk(key) {
  cancelCloseRisk();
  openRiskKey.value = key;
  const cur = domainLabel(props.risk?.items?.[key]);
  const def = riskDomainDefs.find((d) => d.key === key);
  hoverRiskOpt.value = def?.options?.find((o) => o.label === cur) || def?.options?.[0] || null;
}

function closeRisk(key) {
  if (openRiskKey.value === key) {
    openRiskKey.value = null;
    hoverRiskOpt.value = null;
  }
}

function scheduleCloseRisk(key) {
  cancelCloseRisk();
  riskCloseTimer = setTimeout(() => closeRisk(key), 180);
}

function toggleRisk(key) {
  cancelCloseRisk();
  if (openRiskKey.value === key) closeRisk(key);
  else openRisk(key);
}

function selectRiskOption(def, opt) {
  const items = { ...(props.risk?.items || {}) };
  items[def.key] = {
    status: 'selected',
    option: opt.label,
    detail: opt.description || ''
  };
  emit('update:risk', {
    ...props.risk,
    patientDeniesAll: false,
    items,
    areas: syncLegacyAreasFromItems(items)
  });
  cancelCloseRisk();
  openRiskKey.value = null;
  hoverRiskOpt.value = null;
}

function syncLegacyAreasFromItems(items) {
  return Object.entries(items || {})
    .filter(([, cell]) => domainSelectionLabel(cell))
    .map(([name, cell]) => ({
      name,
      level: domainSelectionLabel(cell),
      details: String(cell?.detail || '').trim()
    }));
}

function hasProtectiveFactor(factor) {
  return (props.risk?.protectiveFactors || []).some(
    (f) => String(f).toLowerCase() === String(factor).toLowerCase()
  );
}

function addProtectiveFactor(factor) {
  const label = String(factor || '').trim();
  if (!label || hasProtectiveFactor(label)) return;
  emit('update:risk', {
    ...props.risk,
    protectiveFactors: [...(props.risk?.protectiveFactors || []), label]
  });
}

function removeProtectiveFactor(factor) {
  emit('update:risk', {
    ...props.risk,
    protectiveFactors: (props.risk?.protectiveFactors || []).filter((f) => f !== factor)
  });
}

function onDenyAll(checked) {
  if (checked) {
    emit(
      'update:risk',
      buildDeniedRiskAssessment(props.risk?.notes || '', props.risk?.protectiveFactors || [])
    );
    return;
  }
  emit('update:risk', {
    ...emptyRiskAssessment(),
    protectiveFactors: props.risk?.protectiveFactors || [],
    notes: props.risk?.notes || ''
  });
}

function onNoneMeds(checked) {
  emit('update:medications', {
    ...props.medications,
    noneCurrently: !!checked,
    items: checked ? [] : (props.medications?.items || [])
  });
}

function emitMeds(next) {
  emit('update:medications', next);
}

function addMed() {
  const items = [...(props.medications?.items || []), { name: '', dose: '' }];
  emit('update:medications', { ...props.medications, noneCurrently: false, items });
}

function removeMed(idx) {
  const items = (props.medications?.items || []).filter((_, i) => i !== idx);
  emit('update:medications', { ...props.medications, items });
}

function patchMed(idx, patch) {
  const items = (props.medications?.items || []).map((m, i) => (i === idx ? { ...m, ...patch } : m));
  emit('update:medications', { ...props.medications, items });
}

onBeforeUnmount(() => {
  cancelCloseMse();
  cancelCloseRisk();
});
</script>

<style scoped>
.na-chart {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  padding: 16px;
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.na-chart__head strong {
  display: block;
  font-size: 1.05rem;
  color: #0f172a;
}
.na-chart__sub {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.86rem;
}
.na-chart__toggles {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.na-chart__btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
  border-radius: 8px;
  padding: 7px 12px;
  font-weight: 650;
  font-size: 0.8rem;
  cursor: pointer;
}
.na-chart__btn:hover {
  border-color: #14b8a6;
  color: #0f766e;
  background: #f0fdfa;
}
.na-chart__block {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  background: #fafafa;
}
.na-chart__block h3 {
  margin: 0 0 10px;
  font-size: 0.92rem;
  color: #0f172a;
}
.na-chart__row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.na-chart__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.na-chart__title-row h3 { margin: 0; }
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.7rem;
  font-weight: 700;
  background: #e2e8f0;
  color: #334155;
}
.badge--ok {
  background: #dcfce7;
  color: #166534;
}
.badge--warn {
  background: #fef3c7;
  color: #92400e;
}
.muted { color: #64748b; font-size: 0.8rem; }
.tiny { font-size: 0.75rem; }
.na-chart__dx {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.na-chart__dx li { font-size: 0.88rem; color: #334155; }
.pill {
  display: inline-block;
  margin-left: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  color: #1d4ed8;
  background: #dbeafe;
  border-radius: 999px;
  padding: 1px 8px;
}
.na-chart__justification-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 4px;
}
.na-chart__justification-body {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #0f172a;
  white-space: pre-wrap;
}

.na-mse-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.na-mse-grid--risk {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 10px;
}
.na-mse-domain {
  position: relative;
  z-index: 1;
}
.na-mse-domain--open {
  z-index: 40;
}
.na-mse-domain__trigger {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  min-height: 58px;
}
.na-mse-domain--set .na-mse-domain__trigger {
  border-color: #5eead4;
  background: #f0fdfa;
}
.na-mse-domain--open .na-mse-domain__trigger {
  border-color: #14b8a6;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  box-shadow: none;
}
.na-mse-domain__trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.na-mse-name {
  font-size: 0.7rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.na-mse-value {
  font-size: 0.86rem;
  font-weight: 650;
  color: #0f172a;
  line-height: 1.25;
}
.na-mse-domain:not(.na-mse-domain--set) .na-mse-value {
  color: #94a3b8;
  font-weight: 500;
}
/* Continuous hover bridge: no gap between trigger and panel */
.na-mse-flyout {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% - 1px);
  min-width: min(420px, 80vw);
  width: max(100%, 320px);
  z-index: 50;
  padding: 0;
}
.na-mse-flyout-inner {
  background: #fff;
  border: 1px solid #14b8a6;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.14);
  padding: 10px;
}
.na-mse-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.na-mse-opt {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.na-mse-opt:hover,
.na-mse-opt:focus {
  border-color: #14b8a6;
  background: #ccfbf1;
  color: #115e59;
  outline: none;
}
.na-mse-opt.on {
  border-color: #0d9488;
  background: #99f6e4;
  color: #115e59;
}
.na-mse-desc {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f1f5f9;
  color: #334155;
  font-size: 0.8rem;
  line-height: 1.45;
  min-height: 3.2em;
}

.na-risk-deny {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #cbd5e1;
  background: #fff;
  margin-bottom: 12px;
}
.na-risk-deny.on {
  border-color: #86efac;
  background: #f0fdf4;
}
.na-risk-deny strong {
  display: block;
  font-size: 0.92rem;
  color: #0f172a;
}
.na-risk-deny p {
  margin: 4px 0 0;
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.35;
  max-width: 48ch;
}
.na-risk-deny-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #94a3b8;
  background: #fff;
  border-radius: 12px;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 0.78rem;
  color: #0f172a;
  cursor: pointer;
  max-width: 16rem;
  line-height: 1.25;
}
.na-risk-deny.on .na-risk-deny-toggle {
  border-color: #16a34a;
  background: #dcfce7;
  color: #166534;
}
.na-risk-areas-label {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.na-risk-protect-select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
}
.na-risk-protect-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.na-risk-protect-chip {
  border: 1px solid #99f6e4;
  background: #f0fdfa;
  color: #115e59;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
}
.na-risk-protect-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.na-med-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr auto;
  gap: 6px;
  margin-bottom: 6px;
  align-items: center;
}
.na-med-row input,
.na-chart__label textarea,
.na-risk-protect-select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  font: inherit;
  background: #fff;
}
.na-chart__label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
  margin-top: 10px;
}
.na-risk-notes { position: relative; }
.na-risk-count {
  align-self: flex-end;
  font-size: 0.72rem;
  color: #94a3b8;
  font-weight: 500;
}
.na-risk-reminder {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #eff6ff;
  color: #1e3a8a;
  font-size: 0.8rem;
  line-height: 1.4;
}
.linkish {
  border: none;
  background: transparent;
  color: #0f766e;
  font-weight: 700;
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
}
.linkish.danger { color: #b91c1c; }
.chk {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 0.8rem;
  color: #334155;
}
.na-chart__skip { margin: 0; }
.na-risk-body.muted { opacity: 0.72; }

@media (max-width: 1100px) {
  .na-mse-grid,
  .na-mse-grid--risk { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 800px) {
  .na-mse-grid,
  .na-mse-grid--risk { grid-template-columns: 1fr; }
  .na-med-row { grid-template-columns: 1fr; }
  .na-risk-deny {
    flex-direction: column;
    align-items: stretch;
  }
  .na-mse-flyout {
    min-width: 0;
    width: 100%;
  }
}
</style>
