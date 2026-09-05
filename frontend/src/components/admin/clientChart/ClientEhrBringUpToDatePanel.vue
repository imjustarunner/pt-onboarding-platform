<template>
  <div v-if="open" class="ehr-bring-backdrop" @click.self="emit('close')">
    <div class="ehr-bring" role="dialog" aria-labelledby="ehr-bring-title">
      <header class="ehr-bring-head">
        <div>
          <h3 id="ehr-bring-title">Bring up to date</h3>
          <p class="ehr-bring-sub">
            {{ clientLabel || 'Client' }}
            <span v-if="clientId"> · #{{ clientId }}</span>
          </p>
        </div>
        <button type="button" class="ehr-link" @click="emit('close')">Close</button>
      </header>

      <div class="ehr-status-row" aria-label="Setup status">
        <span class="ehr-chip" :class="statusClass(status.demographics)">Demographics · {{ status.demographics }}</span>
        <span class="ehr-chip" :class="statusClass(status.intake)">Intake · {{ status.intake }}</span>
        <span class="ehr-chip" :class="statusClass(status.plan)">Treatment plan · {{ status.plan }}</span>
      </div>

      <label class="ehr-label">
        1. Demographics paste
        <textarea v-model="demographicsText" class="ehr-textarea" rows="6" placeholder="Legal Name&#10;Date of Birth&#10;…" />
      </label>
      <label class="ehr-label">
        2. Intake paste
        <textarea v-model="intakeText" class="ehr-textarea" rows="8" placeholder="Paste intake note text…" />
      </label>
      <label class="ehr-label">
        3. Treatment plan paste
        <textarea v-model="planText" class="ehr-textarea" rows="8" placeholder="Paste treatment plan text…" />
      </label>

      <p class="ehr-muted">
        Import runs only the boxes you fill, in order. Treatment plan effective date:
        <strong>{{ todayIso }}</strong>.
        If 1–10 scales (or discharge) can’t be read cleanly, the same treatment-plan review opens so you can fix flags before saving.
      </p>

      <ul v-if="stepLog.length" class="ehr-log">
        <li v-for="(entry, i) in stepLog" :key="i" :class="entry.ok ? 'ok' : 'bad'">{{ entry.message }}</li>
      </ul>
      <p v-if="error" class="ehr-error">{{ error }}</p>
      <p v-if="successMessage" class="ehr-ok">{{ successMessage }}</p>

      <div class="ehr-actions">
        <button type="button" class="ehr-btn-ghost" :disabled="busy" @click="markDoneOnly">
          {{ markingDone ? 'Marking…' : 'Mark done' }}
        </button>
        <button
          type="button"
          class="ehr-btn-primary"
          :disabled="busy || !hasAnyPaste"
          @click="importAll"
        >
          {{ importing ? 'Importing…' : 'Import pasted chart content' }}
        </button>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showPlanReview" class="ehr-plan-review-lift">
      <NoteAidTreatmentPlanImportReview
        :open="showPlanReview"
        :agency-id="agencyId"
        :client-id="clientId"
        :initial-text="planReviewText"
        mode="import"
        @close="onPlanReviewClose"
        @saved="onPlanReviewSaved"
      />
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../../services/api';
import NoteAidTreatmentPlanImportReview from '../../clinical/NoteAidTreatmentPlanImportReview.vue';
import {
  DEFAULT_MEASUREMENT_METHOD,
  inferScaleDirection,
  isObjectiveScaleValid,
  parseScalePair
} from '../../../utils/treatmentPlanDuration.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], required: true },
  clientLabel: { type: String, default: '' }
});

const emit = defineEmits(['close', 'done', 'imported']);

const demographicsText = ref('');
const intakeText = ref('');
const planText = ref('');
const importing = ref(false);
const markingDone = ref(false);
const error = ref('');
const successMessage = ref('');
const stepLog = ref([]);
const showPlanReview = ref(false);
const planReviewText = ref('');
const status = reactive({
  demographics: 'missing',
  intake: 'missing',
  plan: 'missing'
});

const todayIso = computed(() => new Date().toISOString().slice(0, 10));
const hasAnyPaste = computed(
  () => !!(demographicsText.value.trim() || intakeText.value.trim() || planText.value.trim())
);
const busy = computed(() => importing.value || markingDone.value || showPlanReview.value);

function statusClass(s) {
  if (s === 'imported' || s === 'done') return 'is-ok';
  if (s === 'failed') return 'is-bad';
  if (s === 'needs review') return 'is-warn';
  return 'is-miss';
}

function agencyHeaders() {
  const aid = Number(props.agencyId || 0);
  return aid > 0 ? { 'X-Agency-Id': String(aid) } : undefined;
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    demographicsText.value = '';
    intakeText.value = '';
    planText.value = '';
    error.value = '';
    successMessage.value = '';
    stepLog.value = [];
    showPlanReview.value = false;
    planReviewText.value = '';
    status.demographics = 'missing';
    status.intake = 'missing';
    status.plan = 'missing';
  }
);

function log(ok, message) {
  stepLog.value = [...stepLog.value, { ok, message }];
}

function mapObjective(o = {}) {
  const objectiveText = o.objectiveText || o.text || '';
  let scaleCurrent = o.scaleCurrent ?? o.current ?? null;
  let scaleTarget = o.scaleTarget ?? o.target ?? null;
  if (!isObjectiveScaleValid(scaleCurrent, scaleTarget)) {
    const parsed = parseScalePair(objectiveText);
    if (isObjectiveScaleValid(parsed.scaleCurrent, parsed.scaleTarget)) {
      scaleCurrent = parsed.scaleCurrent;
      scaleTarget = parsed.scaleTarget;
    }
  }
  return {
    objectiveText,
    scaleCurrent,
    scaleTarget,
    scaleDirection: o.scaleDirection || inferScaleDirection(scaleCurrent, scaleTarget),
    measurementMethod: isObjectiveScaleValid(scaleCurrent, scaleTarget)
      ? (o.measurementMethod || DEFAULT_MEASUREMENT_METHOD)
      : null
  };
}

function mapGoal(g = {}) {
  return {
    goalText: g.goalText || g.text || '',
    durationMonths: g.durationMonths || null,
    projectedCompletion: g.projectedCompletion || null,
    objectives: (g.objectives || []).map((o) => mapObjective(o))
  };
}

function planNeedsReview(parsed, goals) {
  const dischargeBlank = !String(parsed?.dischargePlan || '').trim();
  const objectives = (goals || []).flatMap((g) => g.objectives || []);
  if (!objectives.length) return true;
  const badScale = objectives.some((o) => !isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget));
  return dischargeBlank || badScale;
}

function openPlanReview(text) {
  planReviewText.value = text;
  showPlanReview.value = true;
  status.plan = 'needs review';
  log(true, 'Treatment plan needs review (missing/unclear 1–10 scales or discharge). Confirm in the review dialog.');
}

function onPlanReviewClose() {
  showPlanReview.value = false;
  if (status.plan === 'needs review') {
    log(false, 'Treatment plan review closed without saving');
  }
}

async function onPlanReviewSaved() {
  showPlanReview.value = false;
  status.plan = 'imported';
  log(true, `Treatment plan saved from review (effective ${todayIso.value})`);
  await finishImportPipeline();
}

async function importDemographics() {
  const text = demographicsText.value.trim();
  if (!text) return false;
  const parseRes = await api.post(
    `/clients/${props.clientId}/demographics/parse`,
    { text },
    { skipGlobalLoading: true, headers: agencyHeaders() }
  );
  const p = parseRes?.data?.parsed || {};
  await api.post(
    `/clients/${props.clientId}/demographics/import`,
    {
      demographics: {
        fullName: p.fullName || '',
        dateOfBirth: p.dateOfBirth || '',
        addressStreet: p.addressStreet || '',
        addressCity: p.addressCity || '',
        addressState: p.addressState || '',
        addressZip: p.addressZip || '',
        timezone: p.timezone || '',
        contactPhone: p.contactPhone || '',
        textMessagesOk: p.textMessagesOk === true,
        email: p.email || '',
        appointmentReminderType: p.appointmentReminderType || '',
        administrativeSex: p.administrativeSex || ''
      }
    },
    { skipGlobalLoading: true, headers: agencyHeaders() }
  );
  status.demographics = 'imported';
  log(true, 'Demographics imported');
  return true;
}

async function importIntake() {
  const text = intakeText.value.trim();
  if (!text) return false;
  const res = await api.post(
    `/clients/${props.clientId}/intake-note/import`,
    { text },
    { skipGlobalLoading: true, headers: agencyHeaders() }
  );
  const draft = res?.data?.draft;
  const draftId = draft?.id;
  if (!draftId) throw new Error('Intake import did not return a draft');

  const sections = (draft?.sections || res?.data?.parsed?.sections || []).map((s, i) => ({
    key: s.key || `section_${i + 1}`,
    label: s.label || s.title || s.key,
    body: s.body || s.content || '',
    order: i + 1
  }));
  const parsedDx = res?.data?.parsed?.diagnoses;
  const singleDx = draft?.confirmedDiagnosis || draft?.suggestedDiagnosis || res?.data?.parsed?.diagnosis;
  let diagnoses = [];
  if (Array.isArray(parsedDx) && parsedDx.length) {
    diagnoses = parsedDx.map((d) => ({
      code: d.code || d.icd10Code || '',
      description: d.description || ''
    }));
  } else if (singleDx?.code || singleDx?.icd10Code) {
    diagnoses = [{
      code: singleDx.code || singleDx.icd10Code || '',
      description: singleDx.description || ''
    }];
  }

  try {
    await api.patch(
      `/clients/${props.clientId}/intake-note/${draftId}/sections`,
      { sections, diagnoses, replace: false },
      { skipGlobalLoading: true, headers: agencyHeaders() }
    );
  } catch (e) {
    const code = e.response?.data?.error?.code;
    const msg = e.response?.data?.error?.message || '';
    if (e.response?.status === 409 && (code === 'intake_already_finalized' || /already finalized/i.test(msg))) {
      await api.patch(
        `/clients/${props.clientId}/intake-note/${draftId}/sections`,
        { sections, diagnoses, replace: true },
        { skipGlobalLoading: true, headers: agencyHeaders() }
      );
    } else {
      throw e;
    }
  }

  try {
    await api.post(
      `/clients/${props.clientId}/intake-note/${draftId}/finalize`,
      { goals: [], replace: false },
      { skipGlobalLoading: true, headers: agencyHeaders() }
    );
  } catch (e) {
    const code = e.response?.data?.error?.code;
    const msg = e.response?.data?.error?.message || '';
    if (e.response?.status === 409 && (code === 'intake_already_finalized' || /already finalized/i.test(msg))) {
      await api.post(
        `/clients/${props.clientId}/intake-note/${draftId}/finalize`,
        { goals: [], replace: true },
        { skipGlobalLoading: true, headers: agencyHeaders() }
      );
    } else {
      throw e;
    }
  }

  status.intake = 'imported';
  log(true, 'Intake imported and finalized');
  return true;
}

async function importPlan() {
  const text = planText.value.trim();
  if (!text) return false;
  const parseRes = await api.post(
    '/medical-billing/treatment-plans/parse',
    {
      agencyId: Number(props.agencyId),
      clientId: Number(props.clientId),
      text
    },
    { skipGlobalLoading: true }
  );
  const parsed = parseRes?.data?.parsed || {};
  const dxList = parsed.diagnoses || [];
  const sharedJust = String(parsed.diagnosticJustification || '').trim()
    || dxList.map((d) => String(d.justification || '').trim()).find(Boolean)
    || '';
  const diagnoses = dxList.length
    ? dxList.map((d, i) => ({
      icd10Code: d.icd10Code || '',
      description: d.description || '',
      isPrimary: i === (parsed.primaryDiagnosisIndex || 0),
      justification: i === 0 ? sharedJust : ''
    }))
    : [];
  const goals = (parsed.goals || []).map((g) => mapGoal(g));

  if (planNeedsReview(parsed, goals)) {
    openPlanReview(text);
    return 'needs_review';
  }

  const primary = diagnoses.find((d) => d.isPrimary) || diagnoses[0];
  const effectiveDate = todayIso.value;
  const dischargeParts = [];
  if (String(parsed.presentingProblem || '').trim()) {
    dischargeParts.push(`Presenting Problem\n${String(parsed.presentingProblem).trim()}`);
  }
  if (String(parsed.prescribedFrequency || '').trim()) {
    dischargeParts.push(`Prescribed Frequency of Treatment\n${String(parsed.prescribedFrequency).trim()}`);
  }
  if (String(parsed.dischargePlan || '').trim()) {
    dischargeParts.push(`Discharge Criteria/Planning\n${String(parsed.dischargePlan).trim()}`);
  }

  await api.post(
    '/medical-billing/treatment-plans',
    {
      agencyId: Number(props.agencyId),
      clientId: Number(props.clientId),
      title: 'Imported Treatment Plan',
      status: 'active',
      finalize: true,
      effectiveDate,
      dischargePlan: dischargeParts.length ? dischargeParts.join('\n\n') : (parsed.dischargePlan || null),
      presentingProblem: parsed.presentingProblem || null,
      prescribedFrequency: parsed.prescribedFrequency || null,
      sourceToolId: 'ehr_bring_up_to_date',
      icd10Code: primary?.icd10Code || null,
      diagnosisDescription: primary?.description || null,
      diagnosticJustification: sharedJust || null,
      diagnoses,
      goals: goals.map((g, i) => ({
        goalIndex: i + 1,
        goalText: g.goalText,
        projectedCompletion: g.projectedCompletion || null,
        objectives: (g.objectives || []).map((o, j) => ({
          objectiveIndex: j + 1,
          objectiveText: o.objectiveText,
          scaleCurrent: o.scaleCurrent,
          scaleTarget: o.scaleTarget,
          scaleDirection: o.scaleDirection,
          measurementMethod: o.measurementMethod || DEFAULT_MEASUREMENT_METHOD
        }))
      }))
    },
    { skipGlobalLoading: true }
  );
  status.plan = 'imported';
  log(true, `Treatment plan saved (effective ${effectiveDate})`);
  return true;
}

async function promoteSetupComplete() {
  await api.post(
    `/clients/${props.clientId}/note-aid-setup-complete`,
    {},
    { skipGlobalLoading: true, headers: agencyHeaders() }
  );
  log(true, 'Marked client setup complete');
}

async function finishImportPipeline() {
  const anyOk = [status.demographics, status.intake, status.plan].some((s) => s === 'imported');
  if (!anyOk) {
    error.value = 'Nothing imported successfully. Check the paste text and try again.';
    return;
  }
  try {
    await promoteSetupComplete();
  } catch (e) {
    log(false, `Setup complete skipped: ${e.response?.data?.error?.message || e.message}`);
  }
  successMessage.value = 'Import finished. Review step log, then Mark done if the chart looks complete.';
  emit('imported', { ...status });
}

async function importAll() {
  if (!hasAnyPaste.value) return;
  importing.value = true;
  error.value = '';
  successMessage.value = '';
  stepLog.value = [];
  try {
    if (demographicsText.value.trim()) {
      try {
        await importDemographics();
      } catch (e) {
        status.demographics = 'failed';
        log(false, `Demographics failed: ${e.response?.data?.error?.message || e.message}`);
      }
    }
    if (intakeText.value.trim()) {
      try {
        await importIntake();
      } catch (e) {
        status.intake = 'failed';
        log(false, `Intake failed: ${e.response?.data?.error?.message || e.message}`);
      }
    }
    if (planText.value.trim()) {
      try {
        const planResult = await importPlan();
        if (planResult === 'needs_review') {
          // Demog/intake already applied; wait for Note Aid review Confirm & save.
          return;
        }
      } catch (e) {
        status.plan = 'failed';
        log(false, `Treatment plan failed: ${e.response?.data?.error?.message || e.message}`);
      }
    }

    await finishImportPipeline();
  } finally {
    importing.value = false;
  }
}

async function markDoneOnly() {
  markingDone.value = true;
  error.value = '';
  try {
    await promoteSetupComplete();
    successMessage.value = 'Marked done.';
    emit('done', { marked: true });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not mark done';
  } finally {
    markingDone.value = false;
  }
}
</script>

<style scoped>
.ehr-bring-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 5000;
  padding: 48px 16px 24px;
  overflow: auto;
}
.ehr-bring {
  width: min(820px, 100%);
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 18px 20px 20px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
}
.ehr-bring-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.ehr-bring-head h3 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
}
.ehr-bring-sub {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.85rem;
}
.ehr-link {
  border: none;
  background: none;
  color: #0f766e;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.ehr-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.ehr-chip {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
}
.ehr-chip.is-ok {
  background: #f0fdf4;
  border-color: #86efac;
  color: #166534;
}
.ehr-chip.is-warn {
  background: #fff7ed;
  border-color: #fdba74;
  color: #c2410c;
}
.ehr-chip.is-miss {
  background: #fffbeb;
  border-color: #fcd34d;
  color: #92400e;
}
.ehr-chip.is-bad {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}
.ehr-plan-review-lift :deep(.na-modal-backdrop) {
  z-index: 5100;
}
.ehr-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
}
.ehr-textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  font-size: 0.85rem;
  resize: vertical;
  box-sizing: border-box;
}
.ehr-muted {
  margin: 0 0 10px;
  color: #64748b;
  font-size: 0.82rem;
}
.ehr-log {
  margin: 0 0 10px;
  padding-left: 18px;
  font-size: 0.84rem;
}
.ehr-log .ok { color: #166534; }
.ehr-log .bad { color: #b91c1c; }
.ehr-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.ehr-btn-ghost, .ehr-btn-primary {
  border-radius: 8px;
  padding: 8px 14px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.ehr-btn-ghost {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
}
.ehr-btn-primary {
  border: none;
  background: #0f766e;
  color: #fff;
}
.ehr-btn-primary:disabled, .ehr-btn-ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ehr-error { color: #b91c1c; font-size: 0.85rem; }
.ehr-ok { color: #0f766e; font-size: 0.85rem; font-weight: 600; }
</style>
