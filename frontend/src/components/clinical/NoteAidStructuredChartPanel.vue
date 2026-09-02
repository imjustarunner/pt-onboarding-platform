<template>
  <section class="na-chart" aria-label="Mental status and risk assessment">
    <header class="na-chart__head">
      <div>
        <strong>Mental Status &amp; Risk Assessment</strong>
        <p class="na-chart__sub">Complete the current presentation and document any safety concerns.</p>
      </div>
      <div v-if="!skipMse" class="na-chart__toggles">
        <button type="button" class="na-chart__btn" @click="$emit('mse-all-normal')">All Normal</button>
        <button type="button" class="na-chart__btn" @click="$emit('mse-all-not-assessed')">All Not Assessed</button>
      </div>
    </header>

    <div class="na-chart__block">
      <h3>Diagnoses &amp; justification</h3>
      <ul v-if="diagnoses.length" class="na-chart__dx">
        <li v-for="d in diagnoses" :key="d.id || d.code || d.icd10_code">
          <strong>{{ d.code || d.icd10_code || 'Dx' }}</strong>
          {{ d.description || d.label || '' }}
          <span v-if="d.is_primary || d.primary" class="pill">Primary</span>
        </li>
      </ul>
      <p v-else class="muted">No chart diagnoses loaded.</p>
      <div v-if="diagnosticJustification" class="na-chart__justification">
        <span class="na-chart__justification-label">Diagnostic justification</span>
        <p class="na-chart__justification-body">{{ diagnosticJustification }}</p>
      </div>
      <p v-else class="muted tiny">No diagnostic justification on file.</p>
    </div>

    <div v-if="!skipMse" class="na-chart__block na-chart__block--mse">
      <div class="na-chart__row">
        <div class="na-chart__title-row">
          <h3>Current Mental Status</h3>
          <span class="badge">{{ domains.length }} fields</span>
          <span class="badge badge--ok">{{ mseSummaryBadge }}</span>
        </div>
      </div>
      <div class="na-mse-grid">
        <label v-for="domain in domains" :key="domain" class="na-mse-field">
          <span class="na-mse-name">{{ domain }}</span>
          <select
            :value="mse.domains?.[domain]?.status || 'normal'"
            @change="onDomainStatus(domain, $event.target.value)"
          >
            <option value="normal">Normal</option>
            <option value="not_assessed">Not Assessed</option>
            <option value="abnormal">Abnormal</option>
          </select>
          <input
            v-if="(mse.domains?.[domain]?.status || '') === 'abnormal'"
            type="text"
            class="na-mse-detail"
            placeholder="Detail"
            :value="mse.domains?.[domain]?.detail || ''"
            @input="onDomainDetail(domain, $event.target.value)"
          />
        </label>
      </div>
    </div>
    <p v-else class="na-chart__skip muted">Mental status exam skipped for H0004.</p>

    <div class="na-chart__block na-chart__block--risk">
      <h3>Risk Assessment</h3>

      <div class="na-risk-deny" :class="{ on: !!risk.patientDeniesAll }">
        <div>
          <strong>Patient denies all areas of risk</strong>
          <p>Use this when the client denies SI, HI, self-harm, and related safety concerns for this session.</p>
        </div>
        <label class="na-risk-deny-toggle">
          <input
            type="checkbox"
            :checked="!!risk.patientDeniesAll"
            @change="onDenyAll($event.target.checked)"
          />
          <span>{{ risk.patientDeniesAll ? 'Denied' : 'Not denied' }}</span>
        </label>
      </div>

      <div class="na-risk-body" :class="{ muted: !!risk.patientDeniesAll }">
        <p class="na-risk-areas-label">Areas of risk</p>
        <div class="na-risk-tiles" role="group" aria-label="Areas of risk">
          <button
            v-for="preset in RISK_PRESETS"
            :key="preset"
            type="button"
            class="na-risk-tile"
            :class="{ on: hasArea(preset) }"
            :disabled="!!risk.patientDeniesAll"
            @click="togglePreset(preset)"
          >
            {{ preset }}
          </button>
        </div>

        <div v-for="(area, idx) in (risk.areas || [])" :key="idx" class="na-risk-card">
          <input
            type="text"
            placeholder="Area of risk"
            :value="area.name"
            :disabled="!!risk.patientDeniesAll"
            @input="patchArea(idx, { name: $event.target.value })"
          />
          <select
            :value="area.level || ''"
            :disabled="!!risk.patientDeniesAll"
            @change="patchArea(idx, { level: $event.target.value })"
          >
            <option value="">Severity…</option>
            <option value="not_assessed">Not Assessed</option>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </select>
          <input
            type="text"
            placeholder="Follow-up / action / protective factors"
            :value="area.details || ''"
            :disabled="!!risk.patientDeniesAll"
            @input="patchArea(idx, { details: $event.target.value })"
          />
          <button type="button" class="linkish danger" :disabled="!!risk.patientDeniesAll" @click="removeArea(idx)">
            Remove
          </button>
        </div>

        <button type="button" class="linkish" :disabled="!!risk.patientDeniesAll" @click="addArea">
          + Add area of risk
        </button>

        <label class="na-chart__label na-risk-notes">
          Risk notes (optional)
          <textarea
            :value="risk.notes || ''"
            rows="3"
            maxlength="1000"
            placeholder="Document any relevant risk details, protective factors, or clinical observations…"
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
import { computed } from 'vue';
import { MSE_DOMAINS } from '../../utils/noteAidSessionQueue.js';

const RISK_PRESETS = ['SI', 'HI', 'Self-Harm', 'Gravely Disabled', 'Substance Risk', 'Other'];

const props = defineProps({
  diagnoses: { type: Array, default: () => [] },
  diagnosticJustification: { type: String, default: '' },
  mse: { type: Object, default: () => ({ domains: {} }) },
  risk: { type: Object, default: () => ({ patientDeniesAll: true, areas: [], notes: '' }) },
  medications: { type: Object, default: () => ({ noneCurrently: true, items: [], commentsHtml: '' }) },
  skipMse: { type: Boolean, default: false }
});

const emit = defineEmits([
  'update:diagnosticJustification',
  'update:mse',
  'update:risk',
  'update:medications',
  'mse-all-normal',
  'mse-all-not-assessed'
]);

const domains = MSE_DOMAINS;

const mseSummaryBadge = computed(() => {
  const map = props.mse?.domains || {};
  let abnormal = 0;
  let notAssessed = 0;
  for (const d of domains) {
    const st = map[d]?.status || 'normal';
    if (st === 'abnormal') abnormal += 1;
    else if (st === 'not_assessed') notAssessed += 1;
  }
  if (abnormal) return `${abnormal} abnormal`;
  if (notAssessed === domains.length) return 'All not assessed';
  if (notAssessed) return 'Mostly normal';
  return 'All normal';
});

function onDomainStatus(domain, status) {
  const domainsMap = { ...(props.mse?.domains || {}) };
  domainsMap[domain] = { ...(domainsMap[domain] || {}), status, detail: domainsMap[domain]?.detail || '' };
  emit('update:mse', { ...props.mse, domains: domainsMap, allNormal: false, allNotAssessed: false });
}

function onDomainDetail(domain, detail) {
  const domainsMap = { ...(props.mse?.domains || {}) };
  domainsMap[domain] = { ...(domainsMap[domain] || { status: 'abnormal' }), detail };
  emit('update:mse', { ...props.mse, domains: domainsMap });
}

function onDenyAll(checked) {
  emit('update:risk', {
    patientDeniesAll: !!checked,
    areas: checked ? [] : (props.risk?.areas || []),
    notes: checked ? '' : (props.risk?.notes || '')
  });
}

function hasArea(name) {
  return (props.risk?.areas || []).some(
    (a) => String(a?.name || '').toLowerCase() === String(name).toLowerCase()
  );
}

function togglePreset(name) {
  if (props.risk?.patientDeniesAll) return;
  if (hasArea(name)) {
    const areas = (props.risk?.areas || []).filter(
      (a) => String(a?.name || '').toLowerCase() !== String(name).toLowerCase()
    );
    emit('update:risk', { ...props.risk, patientDeniesAll: false, areas });
    return;
  }
  const areas = [...(props.risk?.areas || []), { name, level: '', details: '' }];
  emit('update:risk', { ...props.risk, patientDeniesAll: false, areas });
}

function addArea() {
  const areas = [...(props.risk?.areas || []), { name: '', level: '', details: '' }];
  emit('update:risk', { ...props.risk, patientDeniesAll: false, areas });
}

function removeArea(idx) {
  const areas = (props.risk?.areas || []).filter((_, i) => i !== idx);
  emit('update:risk', { ...props.risk, areas });
}

function patchArea(idx, patch) {
  const areas = (props.risk?.areas || []).map((a, i) => (i === idx ? { ...a, ...patch } : a));
  emit('update:risk', { ...props.risk, areas });
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
.na-chart__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.na-mse-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px;
}
.na-mse-name {
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.na-mse-field select,
.na-mse-detail,
.na-risk-card input,
.na-risk-card select,
.na-med-row input,
.na-chart__label textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 6px 8px;
  font: inherit;
  background: #fff;
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
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 700;
  font-size: 0.82rem;
  color: #0f172a;
  cursor: pointer;
  white-space: nowrap;
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
.na-risk-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.na-risk-tile {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 10px;
  padding: 8px 12px;
  font-weight: 650;
  font-size: 0.8rem;
  cursor: pointer;
}
.na-risk-tile.on {
  border-color: #0d9488;
  background: #ccfbf1;
  color: #115e59;
}
.na-risk-tile:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.na-med-row,
.na-risk-card {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1.4fr auto;
  gap: 6px;
  margin-bottom: 6px;
  align-items: center;
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
  .na-mse-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 800px) {
  .na-mse-grid { grid-template-columns: 1fr; }
  .na-med-row,
  .na-risk-card {
    grid-template-columns: 1fr;
  }
  .na-risk-deny {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
