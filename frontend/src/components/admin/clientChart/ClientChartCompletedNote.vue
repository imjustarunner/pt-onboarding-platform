<template>
  <div class="ccn-view">
    <div v-if="loading" class="ccn-muted">Loading note…</div>
    <div v-else-if="error" class="ccn-error">{{ error }}</div>
    <template v-else-if="note">
      <header class="ccn-head">
        <div class="ccn-head-main">
          <h3>{{ note.title || 'Clinical note' }}</h3>
          <p class="ccn-meta-line">
            <span v-if="note.dateOfService">DOS {{ formatDos(note.dateOfService) }}</span>
            <span v-if="note.serviceCode"> · {{ note.serviceCode }}</span>
            <span v-if="note.noteType"> · {{ formatNoteType(note.noteType) }}</span>
          </p>
        </div>
        <div class="ccn-head-actions">
          <span class="ccn-sign">{{ signStatusLabel }}</span>
          <button type="button" class="ccn-copy-btn ccn-copy-btn--primary" @click="copyFullNote">
            {{ copiedFull ? 'Copied' : 'Copy full note' }}
          </button>
        </div>
      </header>

      <section v-if="hasSessionFacts" class="ccn-block ccn-facts" aria-label="Session details">
        <h4 class="ccn-block-title">Session details</h4>
        <dl class="ccn-facts-grid">
          <div v-if="structuredChart.participants">
            <dt>Participants</dt>
            <dd>{{ structuredChart.participants }}</dd>
          </div>
          <div v-if="structuredChart.durationMinutes != null && structuredChart.durationMinutes !== ''">
            <dt>Duration</dt>
            <dd>{{ structuredChart.durationMinutes }} min</dd>
          </div>
          <div v-if="note.dateOfService">
            <dt>Date of service</dt>
            <dd>{{ formatDos(note.dateOfService) }}</dd>
          </div>
          <div v-if="note.serviceCode">
            <dt>Service code</dt>
            <dd><code>{{ note.serviceCode }}</code></dd>
          </div>
          <div v-if="note.providerSignedAt">
            <dt>Provider signed</dt>
            <dd>{{ formatTimestamp(note.providerSignedAt) }}</dd>
          </div>
          <div v-if="note.supervisorCosignedAt">
            <dt>Supervisor signed</dt>
            <dd>{{ formatTimestamp(note.supervisorCosignedAt) }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="primaryDxLabel || diagnosticJustification" class="ccn-block" aria-label="Diagnosis">
        <div class="ccn-block-head">
          <h4 class="ccn-block-title">Diagnosis</h4>
          <button
            v-if="diagnosisCopyText"
            type="button"
            class="ccn-copy-btn"
            @click="copyText(diagnosisCopyText, 'dx')"
          >
            {{ copiedKey === 'dx' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <p v-if="primaryDxLabel" class="ccn-dx-line">
          <code v-if="note.primaryDiagnosis?.icd10Code">{{ note.primaryDiagnosis.icd10Code }}</code>
          <strong>{{ note.primaryDiagnosis?.description || primaryDxLabel }}</strong>
          <span v-if="note.primaryDiagnosis?.isPrimary" class="ccn-pill">Primary</span>
        </p>
        <div v-if="diagnosticJustification" class="ccn-subblock">
          <span class="ccn-sublabel">Diagnostic justification</span>
          <p class="ccn-prose">{{ diagnosticJustification }}</p>
        </div>
      </section>

      <section v-if="objectiveRatings.length" class="ccn-block" aria-label="Treatment objective ratings">
        <div class="ccn-block-head">
          <h4 class="ccn-block-title">Treatment objective ratings</h4>
          <button type="button" class="ccn-copy-btn" @click="copyText(ratingsCopyText, 'ratings')">
            {{ copiedKey === 'ratings' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <div class="ccn-ratings-table-wrap">
          <table class="ccn-ratings-table">
            <thead>
              <tr>
                <th>Goal / objective</th>
                <th>Rating</th>
                <th>Goal scale</th>
                <th>Progress</th>
                <th>Rater</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in objectiveRatings" :key="row.id">
                <td>
                  <span v-if="row.goalIndex != null" class="ccn-badge">G{{ row.goalIndex }}</span>
                  <span v-if="row.objectiveIndex != null" class="ccn-badge ccn-badge--obj">O{{ row.objectiveIndex }}</span>
                  {{ row.objectiveText || row.goalText || 'Objective' }}
                </td>
                <td>
                  <template v-if="row.disposition === 'rated' && row.scaleValue != null">
                    <strong class="ccn-scale-val">{{ row.scaleValue }}</strong><span class="ccn-scale-denom">/10</span>
                  </template>
                  <span v-else class="ccn-muted">{{ dispositionLabel(row.disposition) }}</span>
                </td>
                <td>{{ row.scaleTarget != null ? row.scaleTarget : '—' }}</td>
                <td>{{ row.progressLabel ? dispositionLabel(row.progressLabel) : '—' }}</td>
                <td>{{ raterLabel(row) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="showMse" class="ccn-block" aria-label="Mental status exam">
        <div class="ccn-block-head">
          <h4 class="ccn-block-title">Mental status exam</h4>
          <button v-if="mseCopyText" type="button" class="ccn-copy-btn" @click="copyText(mseCopyText, 'mse')">
            {{ copiedKey === 'mse' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <p v-if="structuredChart.skippedMseReason" class="ccn-muted">
          Skipped for {{ structuredChart.skippedMseReason }} documentation.
        </p>
        <ul v-else class="ccn-mse-list">
          <li v-for="line in mseLines" :key="line.domain">
            <span class="ccn-mse-domain">{{ line.domain }}</span>
            <span class="ccn-mse-status" :class="`ccn-mse-status--${line.statusKey}`">{{ line.status }}</span>
            <span v-if="line.detail" class="ccn-mse-detail">{{ line.detail }}</span>
          </li>
        </ul>
      </section>

      <section v-if="riskCopyText" class="ccn-block" aria-label="Risk assessment">
        <div class="ccn-block-head">
          <h4 class="ccn-block-title">Risk assessment</h4>
          <button type="button" class="ccn-copy-btn" @click="copyText(riskCopyText, 'risk')">
            {{ copiedKey === 'risk' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <p v-if="structuredChart.riskAssessment?.patientDeniesAll" class="ccn-prose">
          Patient denies all areas of risk.
        </p>
        <ul v-else-if="riskAreas.length" class="ccn-risk-list">
          <li v-for="(area, idx) in riskAreas" :key="idx">
            <strong>{{ area.name }}</strong>
            <span v-if="area.level" class="ccn-pill ccn-pill--risk">{{ dispositionLabel(area.level) }}</span>
            <span v-if="area.details" class="ccn-risk-detail">{{ area.details }}</span>
          </li>
        </ul>
      </section>

      <section v-if="medCopyText" class="ccn-block" aria-label="Medications">
        <div class="ccn-block-head">
          <h4 class="ccn-block-title">Medications</h4>
          <button type="button" class="ccn-copy-btn" @click="copyText(medCopyText, 'meds')">
            {{ copiedKey === 'meds' ? 'Copied' : 'Copy' }}
          </button>
        </div>
        <p v-if="structuredChart.medications?.noneCurrently" class="ccn-prose">None currently.</p>
        <ul v-else-if="medItems.length" class="ccn-med-list">
          <li v-for="(med, idx) in medItems" :key="idx">
            <strong>{{ med.name }}</strong>
            <span v-if="med.dose" class="ccn-muted"> — {{ med.dose }}</span>
          </li>
        </ul>
        <p v-if="medComments" class="ccn-prose ccn-med-comments">{{ medComments }}</p>
      </section>

      <section class="ccn-block ccn-soap-block" aria-label="Progress note narrative">
        <div class="ccn-block-head">
          <h4 class="ccn-block-title">Progress note (SOAP)</h4>
        </div>
        <article v-for="panel in panels" :key="panel.id" class="ccn-section">
          <div class="ccn-section-head">
            <h5>
              <span v-if="panel.letter" class="ccn-letter">{{ panel.letter }}</span>
              {{ panel.title.replace(/^[SOIP]\s*-\s*/i, '') }}
            </h5>
            <button type="button" class="ccn-copy-btn" @click="copyText(panel.text, panel.id)">
              {{ copiedKey === panel.id ? 'Copied' : 'Copy' }}
            </button>
          </div>
          <pre>{{ panel.text }}</pre>
        </article>
        <p v-if="!panels.length" class="ccn-muted">This note has no displayable SOAP sections.</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api.js';
import { MSE_DOMAINS } from '../../../utils/noteAidSessionQueue.js';
import {
  buildDisplaySections,
  extractSections,
  formatChartClinicalNoteCopy,
  formatMedicationsText,
  formatMentalStatusExamLines,
  formatRiskAssessmentText,
  formatObjectiveRatingLine
} from '../../../utils/noteAidUiHelpers.js';

const props = defineProps({
  noteId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], default: null }
});

const loading = ref(false);
const error = ref('');
const note = ref(null);
const copiedKey = ref('');
const copiedFull = ref(false);
let copiedTimer = null;

const structuredChart = computed(() =>
  note.value?.structuredChart || note.value?.metadata?.structuredChart || {}
);

const panels = computed(() => {
  const sections = extractSections(note.value?.outputJson || {});
  return buildDisplaySections(sections);
});

const objectiveRatings = computed(() => note.value?.objectiveRatings || []);

const diagnosticJustification = computed(() =>
  String(note.value?.diagnosticJustification || structuredChart.value?.diagnosticJustification || '').trim()
);

const primaryDxLabel = computed(() => {
  const dx = note.value?.primaryDiagnosis;
  if (!dx) return '';
  return [dx.icd10Code, dx.description].filter(Boolean).join(' — ');
});

const hasSessionFacts = computed(() =>
  !!(structuredChart.value?.participants
    || (structuredChart.value?.durationMinutes != null && structuredChart.value?.durationMinutes !== '')
    || note.value?.dateOfService
    || note.value?.serviceCode
    || note.value?.providerSignedAt)
);

const showMse = computed(() =>
  !!(structuredChart.value?.skippedMseReason || structuredChart.value?.mentalStatusExam)
);

const mseLines = computed(() => {
  const mse = structuredChart.value?.mentalStatusExam;
  if (!mse) return [];
  if (mse.allNotAssessed) {
    return [{ domain: 'All domains', status: 'Not assessed', statusKey: 'not_assessed', detail: '' }];
  }
  if (mse.allNormal) {
    return [{ domain: 'All domains', status: 'Within normal limits', statusKey: 'normal', detail: '' }];
  }
  return MSE_DOMAINS.map((domain) => {
    const val = mse.domains?.[domain] || { status: 'normal', detail: '' };
    const statusKey = String(val.status || 'normal').toLowerCase();
    let status = 'Normal';
    if (statusKey === 'not_assessed') status = 'Not assessed';
    else if (statusKey === 'abnormal') status = 'Abnormal';
    return {
      domain,
      status,
      statusKey,
      detail: String(val.detail || '').trim()
    };
  });
});

const riskAreas = computed(() =>
  (structuredChart.value?.riskAssessment?.areas || []).filter((a) => String(a?.name || '').trim())
);

const medItems = computed(() =>
  (structuredChart.value?.medications?.items || []).filter((m) => String(m?.name || '').trim())
);

const medComments = computed(() =>
  String(structuredChart.value?.medications?.commentsHtml || structuredChart.value?.medications?.comments || '').trim()
);

const mseCopyText = computed(() => {
  if (structuredChart.value?.skippedMseReason) {
    return `Mental status exam skipped (${structuredChart.value.skippedMseReason}).`;
  }
  const lines = formatMentalStatusExamLines(structuredChart.value?.mentalStatusExam, { domains: MSE_DOMAINS });
  return lines.join('\n');
});

const riskCopyText = computed(() => formatRiskAssessmentText(structuredChart.value?.riskAssessment));

const medCopyText = computed(() => formatMedicationsText(structuredChart.value?.medications));

const diagnosisCopyText = computed(() => {
  const bits = [];
  if (primaryDxLabel.value) bits.push(primaryDxLabel.value);
  if (diagnosticJustification.value) bits.push(`Justification: ${diagnosticJustification.value}`);
  return bits.join('\n\n');
});

const ratingsCopyText = computed(() =>
  objectiveRatings.value.map((r) => formatObjectiveRatingLine(r)).join('\n')
);

const signStatusLabel = computed(() => {
  if (note.value?.supervisorCosignedAt) return 'Supervisor signed';
  if (note.value?.providerSignedAt && note.value?.needsSupervisorCosign) return 'Provider signed · Awaiting supervisor';
  if (note.value?.providerSignedAt) return 'Provider signed';
  return 'Unsigned';
});

function formatDos(raw) {
  return String(raw || '').slice(0, 10);
}

function formatNoteType(raw) {
  return String(raw || '').replace(/_/g, ' ');
}

function formatTimestamp(raw) {
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(raw || '');
  }
}

function dispositionLabel(raw) {
  return String(raw || '').replace(/_/g, ' ');
}

function raterLabel(row) {
  const kind = String(row.raterKind || 'clinician').toLowerCase();
  if (kind === 'clinician') return 'Clinician';
  if (row.raterLabel) return row.raterLabel;
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

async function copyText(text, key) {
  const t = String(text || '').trim();
  if (!t) return;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
    } else {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copiedKey.value = key;
    if (copiedTimer) window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copiedKey.value = '';
      copiedTimer = null;
    }, 1500);
  } catch {
    // ignore clipboard failures
  }
}

async function copyFullNote() {
  const text = formatChartClinicalNoteCopy({
    note: note.value,
    panels: panels.value,
    mseDomains: MSE_DOMAINS
  });
  await copyText(text, 'full');
  copiedFull.value = copiedKey.value === 'full';
  if (copiedFull.value) {
    window.setTimeout(() => {
      copiedFull.value = false;
    }, 1500);
  }
}

async function load() {
  const nid = Number(props.noteId || 0);
  if (!nid) {
    error.value = 'Missing note id.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const params = {};
    const aid = Number(props.agencyId || 0);
    if (aid) params.agencyId = aid;
    const res = await api.get(`/medical-billing/notes/${nid}`, {
      params,
      skipGlobalLoading: true
    });
    note.value = res?.data?.note || null;
    if (!note.value) error.value = 'Note not found.';
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not load note.';
    note.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => [props.noteId, props.agencyId], load);
</script>

<style scoped>
.ccn-view {
  padding: 4px 2px 20px;
  color: #0f172a;
}
.ccn-muted { color: #64748b; font-size: 0.88rem; }
.ccn-error { color: #b91c1c; }
.ccn-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e2e8f0;
}
.ccn-head h3 { margin: 0; font-size: 1.08rem; font-weight: 750; }
.ccn-meta-line { margin: 4px 0 0; color: #64748b; font-size: 0.85rem; }
.ccn-head-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.ccn-sign { font-size: 0.78rem; color: #0f766e; font-weight: 700; }
.ccn-block {
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #f8fafc;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.ccn-block-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #334155;
}
.ccn-block-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.ccn-facts { background: #fff; border-color: #e2e8f0; }
.ccn-facts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px 16px;
  margin: 10px 0 0;
}
.ccn-facts-grid dt {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}
.ccn-facts-grid dd { margin: 2px 0 0; font-size: 0.9rem; }
.ccn-facts-grid code {
  font-size: 0.82rem;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
}
.ccn-dx-line {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
}
.ccn-dx-line code {
  font-size: 0.82rem;
  background: #ecfdf5;
  color: #065f46;
  padding: 2px 7px;
  border-radius: 4px;
}
.ccn-pill {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1e40af;
}
.ccn-pill--risk { background: #fef3c7; color: #92400e; }
.ccn-subblock { margin-top: 10px; }
.ccn-sublabel {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 4px;
}
.ccn-prose {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.45;
  font-size: 0.9rem;
}
.ccn-ratings-table-wrap { overflow-x: auto; }
.ccn-ratings-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.ccn-ratings-table th,
.ccn-ratings-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: top;
}
.ccn-ratings-table th {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
  background: #fff;
}
.ccn-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  padding: 0 5px;
  margin-right: 4px;
  border-radius: 4px;
  font-size: 0.68rem;
  font-weight: 800;
  background: #e0e7ff;
  color: #3730a3;
}
.ccn-badge--obj { background: #ccfbf1; color: #0f766e; }
.ccn-scale-val { font-size: 1.05rem; color: #0f766e; }
.ccn-scale-denom { color: #64748b; font-size: 0.82rem; }
.ccn-mse-list,
.ccn-risk-list,
.ccn-med-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.ccn-mse-list li {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) auto 1fr;
  gap: 8px;
  align-items: baseline;
  font-size: 0.88rem;
  padding: 6px 8px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}
.ccn-mse-domain { font-weight: 650; color: #334155; }
.ccn-mse-status { font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
.ccn-mse-status--normal { color: #0f766e; }
.ccn-mse-status--not_assessed { color: #64748b; }
.ccn-mse-status--abnormal { color: #b45309; }
.ccn-mse-detail { color: #475569; }
.ccn-risk-list li,
.ccn-med-list li {
  font-size: 0.9rem;
  padding: 6px 0;
  border-bottom: 1px solid #e2e8f0;
}
.ccn-risk-detail,
.ccn-med-comments { display: block; margin-top: 4px; color: #475569; }
.ccn-soap-block { background: #fff; border-color: #e2e8f0; }
.ccn-section {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fafafa;
  padding: 10px 12px;
  margin-top: 8px;
}
.ccn-section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.ccn-section h5 {
  margin: 0;
  font-size: 0.82rem;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 750;
}
.ccn-letter {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: #ccfbf1;
  color: #0f766e;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  flex-shrink: 0;
}
.ccn-section pre {
  margin: 0;
  white-space: pre-wrap;
  font: inherit;
  color: #0f172a;
  line-height: 1.45;
  font-size: 0.9rem;
}
.ccn-copy-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.ccn-copy-btn:hover { border-color: #0f766e; color: #0f766e; }
.ccn-copy-btn--primary {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
  font-size: 0.78rem;
  padding: 6px 12px;
}
.ccn-copy-btn--primary:hover {
  background: #0d9488;
  border-color: #0d9488;
  color: #fff;
}
@media (max-width: 640px) {
  .ccn-head { flex-direction: column; }
  .ccn-head-actions { align-items: flex-start; }
  .ccn-mse-list li { grid-template-columns: 1fr; }
}
</style>
