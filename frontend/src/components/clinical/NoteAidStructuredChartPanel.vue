<template>
  <section class="na-chart" aria-label="Structured clinical chart sections">
    <header class="na-chart__head">
      <strong>Chart sections</strong>
      <span class="muted">Confirm before signing</span>
    </header>

    <div class="na-chart__block">
      <h3>Diagnoses &amp; justification</h3>
      <ul v-if="diagnoses.length" class="na-chart__dx">
        <li v-for="d in diagnoses" :key="d.id || d.code">
          <strong>{{ d.code || d.icd10_code || 'Dx' }}</strong>
          {{ d.description || d.label || '' }}
          <span v-if="d.is_primary || d.primary" class="pill">Primary</span>
        </li>
      </ul>
      <p v-else class="muted">No chart diagnoses loaded.</p>
      <label class="na-chart__label">
        Diagnostic justification
        <textarea
          :value="diagnosticJustification"
          rows="3"
          @input="$emit('update:diagnosticJustification', $event.target.value)"
        />
      </label>
    </div>

    <div v-if="!skipMse" class="na-chart__block">
      <div class="na-chart__row">
        <h3>Current mental status</h3>
        <div class="na-chart__toggles">
          <button type="button" class="linkish" @click="$emit('mse-all-normal')">All normal</button>
          <button type="button" class="linkish" @click="$emit('mse-all-not-assessed')">All not assessed</button>
        </div>
      </div>
      <div v-for="domain in domains" :key="domain" class="na-mse-row">
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
          placeholder="Detail"
          :value="mse.domains?.[domain]?.detail || ''"
          @input="onDomainDetail(domain, $event.target.value)"
        />
      </div>
    </div>
    <p v-else class="na-chart__skip muted">Mental status exam skipped for H0004.</p>

    <div class="na-chart__block">
      <div class="na-chart__row">
        <h3>Risk assessment</h3>
        <label class="chk">
          <input
            type="checkbox"
            :checked="!!risk.patientDeniesAll"
            @change="onDenyAll($event.target.checked)"
          />
          Patient denies all areas of risk
        </label>
      </div>
      <div v-for="(area, idx) in (risk.areas || [])" :key="idx" class="na-risk-card">
        <input
          type="text"
          placeholder="Area of risk"
          :value="area.name"
          @input="patchArea(idx, { name: $event.target.value })"
        />
        <select :value="area.level || ''" @change="patchArea(idx, { level: $event.target.value })">
          <option value="">Level…</option>
          <option value="low">Low</option>
          <option value="moderate">Moderate</option>
          <option value="high">High</option>
        </select>
        <input
          type="text"
          placeholder="Intent / plan / means / factors"
          :value="area.details || ''"
          @input="patchArea(idx, { details: $event.target.value })"
        />
        <button type="button" class="linkish danger" @click="removeArea(idx)">Remove</button>
      </div>
      <button type="button" class="linkish" :disabled="!!risk.patientDeniesAll" @click="addArea">
        + Add area of risk
      </button>
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
import { MSE_DOMAINS } from '../../utils/noteAidSessionQueue.js';

const props = defineProps({
  diagnoses: { type: Array, default: () => [] },
  diagnosticJustification: { type: String, default: '' },
  mse: { type: Object, default: () => ({ domains: {} }) },
  risk: { type: Object, default: () => ({ patientDeniesAll: true, areas: [] }) },
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
    areas: checked ? [] : (props.risk?.areas || [])
  });
}

function addArea() {
  const areas = [...(props.risk?.areas || []), { name: '', level: '', details: '' }];
  emit('update:risk', { patientDeniesAll: false, areas });
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
  border-radius: 10px;
  background: #fff;
  padding: 14px;
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.na-chart__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.na-chart__head strong { font-size: 0.95rem; color: #0f172a; }
.muted { color: #64748b; font-size: 0.8rem; }
.na-chart__block h3 {
  margin: 0 0 8px;
  font-size: 0.88rem;
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
.na-chart__dx {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.na-chart__dx li { font-size: 0.84rem; color: #334155; }
.pill {
  display: inline-block;
  margin-left: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  color: #0f766e;
  background: #ccfbf1;
  border-radius: 999px;
  padding: 1px 8px;
}
.na-chart__label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
}
.na-chart__label textarea,
.na-mse-row input,
.na-risk-card input,
.na-med-row input,
.na-mse-row select,
.na-risk-card select {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 6px 8px;
  font: inherit;
}
.na-mse-row,
.na-med-row,
.na-risk-card {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1.4fr auto;
  gap: 6px;
  margin-bottom: 6px;
  align-items: center;
}
.na-mse-name { font-size: 0.8rem; color: #334155; font-weight: 600; }
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
.na-chart__toggles { display: flex; gap: 10px; }
@media (max-width: 800px) {
  .na-mse-row,
  .na-med-row,
  .na-risk-card {
    grid-template-columns: 1fr;
  }
}
</style>
