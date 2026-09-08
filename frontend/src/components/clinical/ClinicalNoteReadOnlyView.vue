<template>
  <div class="ccn-view" :class="{ 'ccn-view--compact': compact }">
    <header v-if="!compact" class="ccn-head">
      <div class="ccn-head-main">
        <h3>{{ note.title || 'Clinical note' }}</h3>
        <p class="ccn-meta-line">
          <span v-if="note.dateOfService">DOS {{ formatDos(note.dateOfService) }}</span>
          <span v-if="serviceCodeDisplay"> · {{ serviceCodeDisplay }}</span>
          <span v-if="note.noteType"> · {{ formatNoteType(note.noteType) }}</span>
        </p>
      </div>
      <div class="ccn-head-actions">
        <span class="ccn-sign">{{ signStatusLabel }}</span>
        <button
          type="button"
          class="ccn-claim-link"
          :class="{ 'is-disabled': !claimLinkActive }"
          :disabled="!claimLinkActive"
          :title="claimLinkTitle"
          @click="onClaimClick"
        >
          Billing claim
          <span class="ccn-claim-status">{{ claimStatusLabel }}</span>
        </button>
        <button type="button" class="ccn-copy-btn ccn-copy-btn--primary" @click="copyFullNote">
          {{ copiedFull ? 'Copied' : 'Copy full note' }}
        </button>
      </div>
    </header>
    <div v-else class="ccn-compact-actions">
      <button type="button" class="ccn-copy-btn ccn-copy-btn--primary ccn-copy-btn--block" @click="copyFullNote">
        {{ copiedFull ? 'Copied full note' : 'Copy full note' }}
      </button>
    </div>

    <section v-if="hasSessionFacts" class="ccn-block ccn-facts" aria-label="Session details">
      <h4 class="ccn-block-title">Session details</h4>
      <dl class="ccn-facts-grid">
        <div v-if="note.clientPayer?.name">
          <dt>Payer</dt>
          <dd>{{ note.clientPayer.name }}</dd>
        </div>
        <div v-if="clinicianDisplay">
          <dt>Provider</dt>
          <dd>{{ clinicianDisplay }}</dd>
        </div>
        <div v-if="structuredChart.participants">
          <dt>Participants</dt>
          <dd>{{ structuredChart.participants }}</dd>
        </div>
        <div v-if="durationDisplay">
          <dt>Duration</dt>
          <dd>{{ durationDisplay }}</dd>
        </div>
        <div v-if="startEndDisplay">
          <dt>Start – End</dt>
          <dd>{{ startEndDisplay }}</dd>
        </div>
        <div v-if="locationDisplay">
          <dt>Location</dt>
          <dd>{{ locationDisplay }}</dd>
        </div>
        <div v-if="note.dateOfService">
          <dt>Date of service</dt>
          <dd>{{ formatDos(note.dateOfService) }}</dd>
        </div>
        <div v-if="serviceCodeDisplay">
          <dt>Service code</dt>
          <dd><code>{{ serviceCodeDisplay }}</code></dd>
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
      </p>
      <div v-if="diagnosticJustification" class="ccn-subblock">
        <span class="ccn-sublabel">Justification</span>
        <p class="ccn-prose">{{ diagnosticJustification }}</p>
      </div>
    </section>

    <section v-if="objectiveRatings.length" class="ccn-block" aria-label="Treatment objective ratings">
      <div class="ccn-block-head">
        <h4 class="ccn-block-title">Objective ratings</h4>
        <button type="button" class="ccn-copy-btn" @click="copyText(ratingsCopyText, 'ratings')">
          {{ copiedKey === 'ratings' ? 'Copied' : 'Copy' }}
        </button>
      </div>
      <ul v-if="compact" class="ccn-ratings-compact">
        <li v-for="row in objectiveRatings" :key="row.id">{{ formatObjectiveRatingLine(row) }}</li>
      </ul>
      <div v-else class="ccn-ratings-table-wrap">
        <table class="ccn-ratings-table">
          <thead>
            <tr>
              <th>Goal / objective</th>
              <th>Rating</th>
              <th>Goal</th>
              <th>Progress</th>
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
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="showMse" class="ccn-block" aria-label="Mental status exam">
      <div class="ccn-block-head">
        <h4 class="ccn-block-title">Mental status</h4>
        <button v-if="mseCopyText" type="button" class="ccn-copy-btn" @click="copyText(mseCopyText, 'mse')">
          {{ copiedKey === 'mse' ? 'Copied' : 'Copy' }}
        </button>
      </div>
      <p v-if="structuredChart.skippedMseReason" class="ccn-muted ccn-prose">
        Skipped ({{ structuredChart.skippedMseReason }}).
      </p>
      <ul v-else class="ccn-mse-list" :class="{ 'ccn-mse-list--compact': compact }">
        <li v-for="line in mseLines" :key="line.domain">
          <span class="ccn-mse-domain">{{ line.domain }}</span>
          <span class="ccn-mse-status" :class="`ccn-mse-status--${line.statusKey}`">{{ line.status }}</span>
          <span v-if="line.detail" class="ccn-mse-detail">{{ line.detail }}</span>
        </li>
      </ul>
    </section>

    <section v-if="riskCopyText" class="ccn-block" aria-label="Risk assessment">
      <div class="ccn-block-head">
        <h4 class="ccn-block-title">Risk</h4>
        <button type="button" class="ccn-copy-btn" @click="copyText(riskCopyText, 'risk')">
          {{ copiedKey === 'risk' ? 'Copied' : 'Copy' }}
        </button>
      </div>
      <p v-if="structuredChart.riskAssessment?.patientDeniesAll" class="ccn-prose">Patient denies all areas of risk.</p>
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
    </section>

    <section class="ccn-block ccn-soap-block" aria-label="Progress note narrative">
      <div class="ccn-block-head">
        <h4 class="ccn-block-title">SOAP</h4>
      </div>
      <div v-if="compact" class="ccn-soap-grid">
        <button
          v-for="panel in panels"
          :key="panel.id"
          type="button"
          class="ccn-soap-grid-btn"
          :disabled="!panel.text"
          @click="copyText(panel.text, panel.id)"
        >
          {{ copiedKey === panel.id ? 'Copied' : `Copy ${panel.label || panel.title}` }}
        </button>
      </div>
      <template v-else>
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
      </template>
      <p v-if="!panels.length" class="ccn-muted">No SOAP sections on file.</p>
      <template v-if="compact && panels.length">
        <article v-for="panel in panels" :key="`body-${panel.id}`" class="ccn-section ccn-section--compact">
          <h5>
            <span v-if="panel.letter" class="ccn-letter">{{ panel.letter }}</span>
            {{ panel.title.replace(/^[SOIP]\s*-\s*/i, '') }}
          </h5>
          <pre>{{ panel.text }}</pre>
        </article>
      </template>
    </section>

    <section v-if="!compact && (providerAttestationStatement || supervisorCosignStatement)" class="ccn-block ccn-esign" aria-label="Electronic signatures">
      <h4 class="ccn-block-title">Electronic signature</h4>
      <button
        v-if="providerAttestationStatement"
        type="button"
        class="ccn-esign-line"
        @click="showProviderSigMeta = !showProviderSigMeta"
      >
        {{ providerAttestationStatement }}
        <span class="ccn-esign-hint">{{ showProviderSigMeta ? 'Hide details' : 'Show e-signature details' }}</span>
      </button>
      <dl v-if="showProviderSigMeta && note.attestation" class="ccn-esign-meta">
        <div><dt>Signed at</dt><dd>{{ formatTimestamp(note.attestation.attestedAt || note.providerSignedAt) }}</dd></div>
        <div v-if="note.attestation.ipAddress"><dt>IP address</dt><dd>{{ note.attestation.ipAddress }}</dd></div>
        <div v-if="note.attestation.userAgent"><dt>Device</dt><dd class="ccn-esign-ua">{{ note.attestation.userAgent }}</dd></div>
      </dl>
      <button
        v-if="supervisorCosignStatement"
        type="button"
        class="ccn-esign-line ccn-esign-line--sup"
        @click="showSupervisorSigMeta = !showSupervisorSigMeta"
      >
        {{ supervisorCosignStatement }}
        <span class="ccn-esign-hint">{{ showSupervisorSigMeta ? 'Hide details' : 'Show e-signature details' }}</span>
      </button>
      <dl v-if="showSupervisorSigMeta && note.supervisorCosign" class="ccn-esign-meta">
        <div><dt>Reviewed at</dt><dd>{{ formatTimestamp(note.supervisorCosign.cosignedAt || note.supervisorCosignedAt) }}</dd></div>
        <div v-if="note.supervisorCosign.ipAddress"><dt>IP address</dt><dd>{{ note.supervisorCosign.ipAddress }}</dd></div>
        <div v-if="note.supervisorCosign.userAgent"><dt>Device</dt><dd class="ccn-esign-ua">{{ note.supervisorCosign.userAgent }}</dd></div>
      </dl>
    </section>

    <section v-if="!compact" class="ccn-block ccn-audit" aria-label="Signature and claim audit">
      <h4 class="ccn-block-title">Signature & claim data</h4>
      <dl class="ccn-facts-grid">
        <div>
          <dt>Provider</dt>
          <dd>{{ clinicianDisplay || '—' }}</dd>
        </div>
        <div>
          <dt>Provider NPI</dt>
          <dd>{{ providerNpi || '—' }}</dd>
        </div>
        <div>
          <dt>Provider signed</dt>
          <dd>{{ note.providerSignedAt ? formatTimestamp(note.providerSignedAt) : 'Not signed' }}</dd>
        </div>
        <div>
          <dt>Supervisor cosign</dt>
          <dd>{{ note.supervisorCosignedAt ? formatTimestamp(note.supervisorCosignedAt) : (note.needsSupervisorCosign ? 'Awaiting' : '—') }}</dd>
        </div>
        <div>
          <dt>Billing NPI</dt>
          <dd>{{ note.linkedClaim?.billingNpi || providerNpi || '—' }}</dd>
        </div>
        <div>
          <dt>Rendering NPI</dt>
          <dd>{{ note.linkedClaim?.renderingNpi || providerNpi || '—' }}</dd>
        </div>
        <div>
          <dt>Claim status</dt>
          <dd>{{ claimStatusLabel }}</dd>
        </div>
        <div v-if="note.clientPayer?.memberId">
          <dt>Member ID</dt>
          <dd>{{ note.clientPayer.memberId }}</dd>
        </div>
        <div v-if="unitsDisplay">
          <dt>Billed units</dt>
          <dd>{{ unitsDisplay }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { MSE_DOMAINS } from '../../utils/noteAidSessionQueue.js';
import {
  buildDisplaySections,
  extractSections,
  formatChartClinicalNoteCopy,
  formatMedicationsText,
  formatMentalStatusExamLines,
  formatRiskAssessmentText,
  formatObjectiveRatingLine,
  SOAP_SECTION_DEFS
} from '../../utils/noteAidUiHelpers.js';
import { useAuthStore } from '../../store/auth.js';

const props = defineProps({
  note: { type: Object, required: true },
  compact: { type: Boolean, default: false }
});

const emit = defineEmits(['open-claim']);

const authStore = useAuthStore();
const copiedKey = ref('');
const copiedFull = ref(false);
const showProviderSigMeta = ref(false);
const showSupervisorSigMeta = ref(false);
let copiedTimer = null;

const structuredChart = computed(() =>
  props.note?.structuredChart || props.note?.metadata?.structuredChart || {}
);

const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const canOpenClaim = computed(() =>
  ['super_admin', 'admin', 'support', 'billing'].includes(roleNorm.value)
);

const claimStatusLabel = computed(() => {
  if (props.note?.linkedClaim?.statusLabel) return props.note.linkedClaim.statusLabel;
  return props.note?.linkedClaim ? 'Waiting' : 'No claim yet';
});

const claimLinkActive = computed(() => canOpenClaim.value && !!props.note?.linkedClaim?.id);
const claimLinkTitle = computed(() => {
  if (!canOpenClaim.value) return 'Claim details are available to admin, support, billing, and super admin';
  if (!props.note?.linkedClaim?.id) return 'No billing claim linked yet';
  return 'Open billing claim';
});

function onClaimClick() {
  if (!claimLinkActive.value) return;
  emit('open-claim', props.note.linkedClaim);
}

const units = computed(() => Number(props.note?.billingPrimaryUnits || props.note?.metadata?.billingPrimaryUnits || 1));
const serviceCodeDisplay = computed(() => {
  const code = String(props.note?.serviceCode || '').toUpperCase();
  if (!code) return '';
  if (code === '90834' && units.value >= 2) return '90834 × 2 (EXTENDED ENCOUNTER)';
  return code;
});

const unitsDisplay = computed(() => {
  const code = String(props.note?.serviceCode || '').toUpperCase();
  if (!code) return '';
  return `${code} × ${units.value}`;
});

const clinicianDisplay = computed(() => {
  const s = props.note?.providerSigner;
  if (s?.name && s?.credentials) return `${s.name}, ${s.credentials}`;
  if (s?.name) return s.name;
  return '';
});

const providerAttestationStatement = computed(() => {
  const stmt = String(props.note?.attestation?.statement || '').trim();
  if (stmt) return stmt;
  if (!props.note?.providerSignedAt) return '';
  const who = clinicianDisplay.value || 'Provider';
  return `${who}, signed this note and declared this information to be accurate and complete and marked the note as medically necessary on ${formatTimestamp(props.note.providerSignedAt)}.`;
});

const supervisorCosignStatement = computed(() => {
  const stmt = String(props.note?.supervisorCosign?.statement || '').trim();
  if (stmt) return stmt;
  if (!props.note?.supervisorCosignedAt) return '';
  const who = props.note?.supervisorCosign?.signerLabel || 'Supervisor';
  return `${who}, reviewed and signed this note and approved it for clinical documentation under their license on ${formatTimestamp(props.note.supervisorCosignedAt)}.`;
});

const providerNpi = computed(() => props.note?.providerSigner?.npi || null);

const durationDisplay = computed(() => {
  const d = props.note?.durationMinutes ?? structuredChart.value?.durationMinutes;
  if (d == null || d === '') return '';
  return `${d} min`;
});

const startEndDisplay = computed(() => {
  const start = props.note?.startTime || structuredChart.value?.startTime;
  const end = props.note?.endTime || structuredChart.value?.endTime;
  if (start && end) return `${start} – ${end}`;
  if (props.note?.sessionTiming?.startAt) {
    try {
      const s = new Date(props.note.sessionTiming.startAt);
      const e = props.note.sessionTiming.endAt ? new Date(props.note.sessionTiming.endAt) : null;
      const opts = { hour: 'numeric', minute: '2-digit' };
      return e
        ? `${s.toLocaleTimeString([], opts)} – ${e.toLocaleTimeString([], opts)}`
        : s.toLocaleTimeString([], opts);
    } catch {
      return '';
    }
  }
  return start || end || '';
});

const locationDisplay = computed(
  () => props.note?.locationLabel || structuredChart.value?.locationLabel || ''
);

const panels = computed(() => {
  const sections = extractSections(props.note?.outputJson || {});
  const built = buildDisplaySections(sections);
  return built.map((p) => {
    const def = SOAP_SECTION_DEFS.find((d) => d.key === p.id || d.key === p.title);
    return { ...p, label: def?.label || p.title };
  });
});

const objectiveRatings = computed(() => props.note?.objectiveRatings || []);

const diagnosticJustification = computed(() =>
  String(props.note?.diagnosticJustification || structuredChart.value?.diagnosticJustification || '').trim()
);

const primaryDxLabel = computed(() => {
  const dx = props.note?.primaryDiagnosis;
  if (!dx) return '';
  return [dx.icd10Code, dx.description].filter(Boolean).join(' — ');
});

const hasSessionFacts = computed(() =>
  !!(structuredChart.value?.participants
    || durationDisplay.value
    || startEndDisplay.value
    || locationDisplay.value
    || props.note?.dateOfService
    || props.note?.serviceCode
    || clinicianDisplay.value
    || props.note?.clientPayer?.name)
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
    return [{ domain: 'All domains', status: 'Normal', statusKey: 'normal', detail: '' }];
  }
  const domainKeys = Object.keys(mse.domains || {}).length
    ? [...new Set([...MSE_DOMAINS, ...Object.keys(mse.domains || {})])]
    : MSE_DOMAINS;
  const lines = domainKeys.map((domain) => {
    const val = mse.domains?.[domain] || { status: '', option: '', detail: '' };
    const option = String(val.option || '').trim();
    const statusRaw = String(val.status || '').toLowerCase();
    let status = option;
    let statusKey = 'selected';
    if (!status) {
      if (statusRaw === 'not_assessed') {
        status = 'Not assessed';
        statusKey = 'not_assessed';
      } else if (statusRaw === 'abnormal') {
        status = 'Abnormal';
        statusKey = 'abnormal';
      } else if (statusRaw === 'normal') {
        status = 'Normal';
        statusKey = 'normal';
      } else if (statusRaw && statusRaw !== 'selected') {
        status = String(val.status);
        statusKey = 'selected';
      } else {
        status = '—';
        statusKey = 'empty';
      }
    }
    return {
      domain,
      status,
      statusKey,
      detail: String(val.detail || '').trim()
    };
  }).filter((l) => l.statusKey !== 'empty');
  if (props.compact) {
    const notable = lines.filter((l) => l.statusKey === 'abnormal' || l.detail);
    return notable.length ? notable : lines.slice(0, 6);
  }
  return lines;
});

const riskAreas = computed(() => {
  const risk = structuredChart.value?.riskAssessment;
  if (!risk) return [];
  if (risk.patientDeniesAll) return [];
  const items = risk.items && typeof risk.items === 'object' ? risk.items : null;
  if (items && Object.keys(items).length) {
    return Object.entries(items)
      .map(([name, cell]) => ({
        name,
        level: String(cell?.option || cell?.status || '').trim(),
        details: String(cell?.detail || '').trim()
      }))
      .filter((a) => a.level);
  }
  return (risk.areas || []).filter((a) => String(a?.name || '').trim());
});

const medItems = computed(() =>
  (structuredChart.value?.medications?.items || []).filter((m) => String(m?.name || '').trim())
);

const mseCopyText = computed(() => {
  if (structuredChart.value?.skippedMseReason) {
    return `Mental status exam skipped (${structuredChart.value.skippedMseReason}).`;
  }
  return formatMentalStatusExamLines(structuredChart.value?.mentalStatusExam, { domains: MSE_DOMAINS }).join('\n');
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
  if (props.note?.supervisorCosignedAt) return 'Supervisor signed';
  if (props.note?.providerSignedAt && props.note?.needsSupervisorCosign) return 'Awaiting supervisor';
  if (props.note?.providerSignedAt) return 'Provider signed';
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
    // ignore
  }
}

async function copyFullNote() {
  const text = formatChartClinicalNoteCopy({
    note: props.note,
    panels: panels.value,
    mseDomains: MSE_DOMAINS
  });
  await copyText(text, 'full');
  copiedFull.value = copiedKey.value === 'full';
  if (copiedFull.value) {
    window.setTimeout(() => { copiedFull.value = false; }, 1500);
  }
}
</script>

<style scoped>
.ccn-view { padding: 4px 2px 20px; color: #0f172a; }
.ccn-view--compact {
  padding: 0;
  max-height: min(70vh, 520px);
  overflow: auto;
}
.ccn-muted { color: #64748b; font-size: 0.82rem; }
.ccn-head {
  display: flex; justify-content: space-between; gap: 16px; align-items: flex-start;
  margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;
}
.ccn-head h3 { margin: 0; font-size: 1.05rem; font-weight: 750; }
.ccn-meta-line { margin: 4px 0 0; color: #64748b; font-size: 0.82rem; }
.ccn-head-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.ccn-sign { font-size: 0.75rem; color: #0f766e; font-weight: 700; }
.ccn-claim-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  border-radius: 10px;
  padding: 6px 10px;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.ccn-claim-link.is-disabled,
.ccn-claim-link:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  color: #94a3b8;
}
.ccn-claim-status {
  font-weight: 600;
  color: #0f766e;
  background: #ccfbf1;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 0.72rem;
}
.ccn-audit {
  margin-top: 8px;
  border: 1px dashed #94a3b8;
  background: #f8fafc;
}
.ccn-esign {
  border-color: #bfdbfe;
  background: #eff6ff;
}
.ccn-esign-line {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 6px 0;
  font: inherit;
  font-size: 0.86rem;
  line-height: 1.45;
  color: #1e3a8a;
  font-weight: 600;
  cursor: pointer;
}
.ccn-esign-line--sup { color: #334155; }
.ccn-esign-hint {
  display: block;
  margin-top: 4px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #2563eb;
  text-decoration: underline;
}
.ccn-esign-meta {
  margin: 0 0 8px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 6px 12px;
  font-size: 0.78rem;
}
.ccn-esign-meta dt { color: #64748b; font-weight: 700; }
.ccn-esign-meta dd { margin: 0; color: #0f172a; word-break: break-word; }
.ccn-esign-ua { font-size: 0.7rem; color: #475569; }
.ccn-compact-actions { margin-bottom: 8px; }
.ccn-block {
  border: 1px solid #dbeafe; border-radius: 8px; background: #f8fafc;
  padding: 10px 12px; margin-bottom: 8px;
}
.ccn-view--compact .ccn-block { padding: 8px 10px; margin-bottom: 6px; }
.ccn-block-title {
  margin: 0; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em;
  text-transform: uppercase; color: #334155;
}
.ccn-block-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.ccn-facts { background: #fff; border-color: #e2e8f0; }
.ccn-facts-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px 12px; margin: 8px 0 0;
}
.ccn-facts-grid dt {
  margin: 0; font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.03em; color: #64748b;
}
.ccn-facts-grid dd { margin: 2px 0 0; font-size: 0.84rem; }
.ccn-facts-grid code { font-size: 0.78rem; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; }
.ccn-dx-line { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.88rem; }
.ccn-dx-line code { font-size: 0.78rem; background: #ecfdf5; color: #065f46; padding: 2px 6px; border-radius: 4px; }
.ccn-pill {
  font-size: 0.65rem; font-weight: 700; text-transform: uppercase; padding: 2px 6px;
  border-radius: 999px; background: #fef3c7; color: #92400e;
}
.ccn-subblock { margin-top: 8px; }
.ccn-sublabel {
  display: block; font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
  color: #64748b; margin-bottom: 4px;
}
.ccn-prose { margin: 0; white-space: pre-wrap; line-height: 1.4; font-size: 0.84rem; }
.ccn-ratings-compact { margin: 0; padding-left: 1.1rem; font-size: 0.82rem; line-height: 1.4; }
.ccn-ratings-table-wrap { overflow-x: auto; }
.ccn-ratings-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.ccn-ratings-table th, .ccn-ratings-table td {
  text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top;
}
.ccn-ratings-table th {
  font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; background: #fff;
}
.ccn-badge {
  display: inline-flex; align-items: center; justify-content: center; min-width: 1.5rem;
  padding: 0 4px; margin-right: 4px; border-radius: 4px; font-size: 0.65rem; font-weight: 800;
  background: #e0e7ff; color: #3730a3;
}
.ccn-badge--obj { background: #ccfbf1; color: #0f766e; }
.ccn-scale-val { font-size: 1rem; color: #0f766e; }
.ccn-scale-denom { color: #64748b; font-size: 0.78rem; }
.ccn-mse-list, .ccn-risk-list, .ccn-med-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ccn-mse-list li {
  display: grid; grid-template-columns: minmax(100px, 1fr) auto 1fr; gap: 6px; align-items: baseline;
  font-size: 0.82rem; padding: 5px 6px; background: #fff; border-radius: 6px; border: 1px solid #e2e8f0;
}
.ccn-mse-list--compact li { grid-template-columns: 1fr; gap: 2px; }
.ccn-mse-domain { font-weight: 650; color: #334155; }
.ccn-mse-status { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; }
.ccn-mse-status--normal { color: #0f766e; }
.ccn-mse-status--not_assessed { color: #64748b; }
.ccn-mse-status--abnormal { color: #b45309; }
.ccn-mse-detail { color: #475569; font-size: 0.8rem; }
.ccn-risk-list li, .ccn-med-list li { font-size: 0.84rem; padding: 4px 0; border-bottom: 1px solid #e2e8f0; }
.ccn-risk-detail { display: block; margin-top: 2px; color: #475569; font-size: 0.8rem; }
.ccn-soap-block { background: #fff; border-color: #e2e8f0; }
.ccn-soap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
.ccn-soap-grid-btn {
  border: 1px solid #99f6e4; background: #f0fdfa; color: #0f766e; font-size: 0.72rem; font-weight: 700;
  padding: 6px 8px; border-radius: 6px; cursor: pointer;
}
.ccn-soap-grid-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.ccn-section {
  border: 1px solid #e2e8f0; border-radius: 8px; background: #fafafa;
  padding: 8px 10px; margin-top: 6px;
}
.ccn-section--compact h5 {
  margin: 0 0 6px; font-size: 0.78rem; display: flex; align-items: center; gap: 6px; font-weight: 750;
}
.ccn-section-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.ccn-section h5 { margin: 0; font-size: 0.8rem; display: flex; align-items: center; gap: 6px; font-weight: 750; }
.ccn-letter {
  width: 20px; height: 20px; border-radius: 5px; background: #ccfbf1; color: #0f766e;
  display: inline-flex; align-items: center; justify-content: center; font-size: 0.68rem; flex-shrink: 0;
}
.ccn-section pre {
  margin: 0; white-space: pre-wrap; font: inherit; color: #0f172a; line-height: 1.4; font-size: 0.84rem;
}
.ccn-view--compact .ccn-section pre { font-size: 0.8rem; max-height: 120px; overflow: auto; }
.ccn-copy-btn {
  border: 1px solid #cbd5e1; background: #fff; color: #334155; font-size: 0.7rem; font-weight: 700;
  padding: 3px 8px; border-radius: 6px; cursor: pointer; white-space: nowrap;
}
.ccn-copy-btn--block { width: 100%; padding: 7px 10px; font-size: 0.76rem; }
.ccn-copy-btn:hover { border-color: #0f766e; color: #0f766e; }
.ccn-copy-btn--primary { background: #0f766e; border-color: #0f766e; color: #fff; }
.ccn-copy-btn--primary:hover { background: #0d9488; border-color: #0d9488; color: #fff; }
</style>
