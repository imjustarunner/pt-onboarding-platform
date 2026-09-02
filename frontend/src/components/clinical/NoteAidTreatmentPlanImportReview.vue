<template>
  <div v-if="open" class="na-modal-backdrop">
    <div class="na-modal na-modal--wide" role="dialog" aria-labelledby="na-plan-import-title">
      <header class="na-modal-head">
        <h3 id="na-plan-import-title">
          {{ isDraftEditor ? 'Edit treatment plan draft' : 'Review imported treatment plan' }}
        </h3>
        <button type="button" class="na-link-btn" @click="emit('close')">Close</button>
      </header>

      <p v-if="isDraftEditor" class="hint hint-block">
        Edit goals, objectives, and 1–10 scales. Add information below to regenerate, then finalize once intake is final.
      </p>

      <template v-if="!isDraftEditor">
        <label class="na-label">
          Paste plan text
          <textarea v-model="pasteText" class="na-textarea" rows="5" placeholder="Paste treatment plan…" />
        </label>
        <div class="na-modal-actions na-modal-actions--start">
          <button type="button" class="na-btn-outline" :disabled="parsing || !pasteText.trim()" @click="parse">
            {{ parsing ? 'Parsing…' : 'Parse into review' }}
          </button>
        </div>
      </template>

      <p v-if="loadingPlan" class="muted">Loading plan…</p>

      <template v-if="model">
        <label class="na-label">
          Effective date
          <input v-model="model.effectiveDate" type="date" class="na-input" />
        </label>

        <div class="na-import-block">
          <div class="na-import-block-head">
            <strong>Diagnoses (ordered)</strong>
            <button type="button" class="na-link-btn" @click="addDiagnosis">Add</button>
          </div>
          <div v-for="(d, di) in model.diagnoses" :key="`dx-${di}`" class="na-import-card">
            <div class="na-import-row">
              <input v-model="d.icd10Code" class="na-input" placeholder="ICD-10" />
              <input v-model="d.description" class="na-input na-input--grow" placeholder="Description" />
              <label class="na-check">
                <input v-model="d.isPrimary" type="checkbox" @change="setPrimary(di)" />
                Primary
              </label>
              <button type="button" class="na-link-btn" :disabled="di === 0" @click="moveDx(di, -1)">↑</button>
              <button type="button" class="na-link-btn" :disabled="di >= model.diagnoses.length - 1" @click="moveDx(di, 1)">↓</button>
              <button type="button" class="na-link-btn" @click="model.diagnoses.splice(di, 1)">Remove</button>
            </div>
          </div>
          <label class="na-label" style="margin-top: 8px;">
            Diagnostic justification
            <span class="hint hint-inline">One narrative covering all diagnoses above</span>
            <textarea
              v-model="model.diagnosticJustification"
              class="na-textarea"
              rows="5"
              placeholder="Describe how the presentation supports the diagnosis list…"
            />
          </label>
        </div>

        <label class="na-label">
          Presenting problem
          <textarea v-model="model.presentingProblem" class="na-textarea" rows="4" />
        </label>

        <label class="na-label">
          Prescribed frequency
          <input v-model="model.prescribedFrequency" class="na-input" placeholder="e.g. Twice a Week" />
        </label>

        <label class="na-label">
          Discharge criteria / planning
          <textarea v-model="model.dischargePlan" class="na-textarea" rows="4" />
        </label>

        <div class="na-import-block">
          <div class="na-import-block-head">
            <div>
              <strong>Goals &amp; objectives</strong>
              <p class="hint hint-block">Objectives use a 1–10 scale only (current → target). Duration is set in months; target dates are calculated from today.</p>
            </div>
            <div class="na-import-block-actions">
              <label class="na-label na-label--inline">
                Apply duration to all
                <select v-model.number="bulkDurationMonths" class="na-input na-input--duration">
                  <option :value="0">Choose…</option>
                  <option v-for="m in durationPresets" :key="`bulk-${m}`" :value="m">{{ durationLabel(m) }}</option>
                </select>
              </label>
              <button type="button" class="na-btn-outline na-btn-outline--sm" :disabled="!bulkDurationMonths" @click="applyDurationToAll">
                Push to all goals
              </button>
              <button type="button" class="na-link-btn" @click="addGoal">Add goal</button>
            </div>
          </div>

          <div v-for="(g, gi) in model.goals" :key="`g-${gi}`" class="na-import-card na-import-card--goal">
            <label class="na-label">
              Goal {{ gi + 1 }}
              <textarea v-model="g.goalText" class="na-textarea na-textarea--goal" rows="3" placeholder="Goal text" />
            </label>

            <div class="na-import-row na-import-row--goal-meta">
              <label class="na-label na-label--inline">
                Duration
                <select v-model.number="g.durationMonths" class="na-input na-input--duration" @change="syncGoalCompletion(g)">
                  <option :value="null">Select…</option>
                  <option v-for="m in durationPresets" :key="`g-${gi}-d-${m}`" :value="m">{{ durationLabel(m) }}</option>
                </select>
              </label>
              <span v-if="g.durationMonths" class="na-duration-preview">
                Target date: {{ formatDurationPreview(g.durationMonths) }}
              </span>
              <span v-else-if="g.parsedDateHint" class="na-duration-hint muted tiny">
                Paste had date {{ g.parsedDateHint }} — pick a duration instead
              </span>
              <button type="button" class="na-link-btn" @click="model.goals.splice(gi, 1)">Remove goal</button>
            </div>

            <div v-for="(o, oi) in g.objectives" :key="`o-${gi}-${oi}`" class="na-import-obj">
              <label class="na-label">
                Objective {{ gi + 1 }}.{{ oi + 1 }}
                <textarea v-model="o.objectiveText" class="na-textarea na-textarea--objective" rows="4" placeholder="Objective" />
              </label>

              <div class="na-import-scale">
                <label class="na-label na-label--scale">
                  Current (1–10)
                  <input v-model.number="o.scaleCurrent" class="na-input na-input--scale" type="number" min="1" max="10" @input="onScaleEdit(o)" />
                </label>
                <span class="na-scale-arrow" aria-hidden="true">→</span>
                <label class="na-label na-label--scale">
                  Target (1–10)
                  <input v-model.number="o.scaleTarget" class="na-input na-input--scale" type="number" min="1" max="10" @input="onScaleEdit(o)" />
                </label>
                <select v-model="o.scaleDirection" class="na-input na-input--direction" @change="onScaleEdit(o)">
                  <option :value="null">Direction</option>
                  <option value="increase">Increase</option>
                  <option value="decrease">Decrease</option>
                </select>
                <span class="muted tiny na-scale-hint">{{ directionHint(o) }}</span>
                <button type="button" class="na-link-btn" @click="g.objectives.splice(oi, 1)">Remove</button>
              </div>

              <p class="na-scale-standard muted tiny">Measurement: 1–10 scale (client self-report)</p>

              <div v-if="objectiveNeedsRewrite(o)" class="na-rewrite-banner">
                <span>This objective is not on a clear 1–10 scale yet.</span>
                <button
                  type="button"
                  class="na-btn-outline na-btn-outline--sm"
                  :disabled="rewriteKey === `${gi}-${oi}`"
                  @click="suggestRewrite(gi, oi)"
                >
                  {{ rewriteKey === `${gi}-${oi}` ? 'Suggesting…' : 'Suggest 1–10 rewrite (AI)' }}
                </button>
              </div>

              <div v-if="o.pendingSuggestion" class="na-suggestion-card">
                <p class="na-suggestion-label">Suggested rewrite — approve to apply</p>
                <p class="na-suggestion-text">{{ o.pendingSuggestion.objectiveText }}</p>
                <p class="muted tiny">
                  {{ o.pendingSuggestion.scaleCurrent }} → {{ o.pendingSuggestion.scaleTarget }}
                  ({{ o.pendingSuggestion.scaleDirection }})
                  — {{ o.pendingSuggestion.explanation }}
                </p>
                <div class="na-suggestion-actions">
                  <button type="button" class="na-btn-primary na-btn-outline--sm" @click="approveSuggestion(gi, oi)">Approve</button>
                  <button type="button" class="na-link-btn" @click="discardSuggestion(gi, oi)">Dismiss</button>
                </div>
              </div>
            </div>
            <button type="button" class="na-link-btn" @click="addObjective(gi)">Add objective</button>
          </div>
        </div>

        <div v-if="isDraftEditor" class="na-revision-block">
          <label class="na-label" for="na-plan-addendum">
            Additional information / revision instructions
          </label>
          <textarea
            id="na-plan-addendum"
            v-model="addendum"
            class="na-textarea"
            rows="3"
            placeholder="Tell Note Aid what to add or revise on this treatment plan…"
          />
          <button
            type="button"
            class="na-btn-outline"
            :disabled="regenerating || !addendum.trim()"
            @click="regenerateFromAddendum"
          >
            {{ regenerating ? 'Regenerating…' : 'Regenerate with addendum' }}
          </button>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
        <div class="na-modal-actions">
          <button type="button" class="na-btn-outline" @click="emit('close')">Cancel</button>
          <template v-if="isDraftEditor">
            <button type="button" class="na-btn-outline" :disabled="saving" @click="save({ finalize: false })">
              {{ saving && !finalizing ? 'Saving…' : 'Save draft' }}
            </button>
            <button type="button" class="na-btn-primary" :disabled="saving" @click="save({ finalize: true })">
              {{ finalizing ? 'Finalizing…' : 'Finalize treatment plan' }}
            </button>
          </template>
          <button v-else type="button" class="na-btn-primary" :disabled="saving" @click="save({ finalize: true })">
            {{ saving ? 'Saving…' : 'Confirm &amp; save to chart' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import {
  DURATION_PRESETS,
  DEFAULT_MEASUREMENT_METHOD,
  completionDateFromDurationMonths,
  durationLabel,
  formatDurationPreview,
  isObjectiveScaleValid
} from '../../utils/treatmentPlanDuration.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  agencyId: { type: [Number, String], required: true },
  clientId: { type: [Number, String], required: true },
  initialText: { type: String, default: '' },
  planId: { type: [Number, String], default: null },
  mode: { type: String, default: 'import' },
  initialPlan: { type: Object, default: null }
});

const emit = defineEmits(['close', 'saved']);

const pasteText = ref('');
const model = ref(null);
const parsing = ref(false);
const saving = ref(false);
const finalizing = ref(false);
const regenerating = ref(false);
const loadingPlan = ref(false);
const error = ref('');
const addendum = ref('');
const bulkDurationMonths = ref(0);
const rewriteKey = ref('');
const durationPresets = DURATION_PRESETS;
const loadedPlanId = ref(null);

const isDraftEditor = computed(
  () => props.mode === 'draft' || !!Number(props.planId || 0) || !!props.initialPlan
);

function directionHint(o) {
  const cur = Number(o.scaleCurrent);
  const tgt = Number(o.scaleTarget);
  if (!Number.isFinite(cur) || !Number.isFinite(tgt)) return '';
  const dir = o.scaleDirection || (tgt > cur ? 'increase' : tgt < cur ? 'decrease' : '');
  if (!dir) return `${cur} → ${tgt}`;
  return `${cur} → ${tgt} ${dir}`;
}

function objectiveNeedsRewrite(o) {
  return !isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget);
}

function onScaleEdit(o) {
  o.scaleNeedsRewrite = !isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget);
  if (isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget)) {
    const cur = Number(o.scaleCurrent);
    const tgt = Number(o.scaleTarget);
    o.scaleDirection = tgt > cur ? 'increase' : 'decrease';
    o.measurementMethod = DEFAULT_MEASUREMENT_METHOD;
  }
}

function syncGoalCompletion(goal) {
  const months = Number(goal.durationMonths);
  goal.projectedCompletion = completionDateFromDurationMonths(months) || null;
  goal.durationLabel = months >= 1 ? durationLabel(months) : null;
}

function applyDurationToAll() {
  const months = Number(bulkDurationMonths.value);
  if (!months || !model.value?.goals?.length) return;
  for (const g of model.value.goals) {
    g.durationMonths = months;
    syncGoalCompletion(g);
  }
}

function mapGoal(g) {
  const months = g.durationMonths != null ? Number(g.durationMonths) : null;
  return {
    goalText: g.goalText || g.goal_text || '',
    durationMonths: Number.isFinite(months) && months > 0 ? months : null,
    durationLabel: g.durationLabel || (months ? durationLabel(months) : null),
    parsedDateHint: g.parsedDateHint || null,
    projectedCompletion:
      g.projectedCompletion || g.projected_completion || completionDateFromDurationMonths(months) || null,
    objectives: (g.objectives || []).map((o) => ({
      objectiveText: o.objectiveText || o.objective_text || '',
      scaleCurrent: o.scaleCurrent ?? o.scale_current ?? null,
      scaleTarget: o.scaleTarget ?? o.scale_target ?? null,
      scaleDirection: o.scaleDirection || o.scale_direction || null,
      measurementMethod: o.measurementMethod || o.measurement_method || DEFAULT_MEASUREMENT_METHOD,
      scaleNeedsRewrite: o.scaleNeedsRewrite ?? !isObjectiveScaleValid(
        o.scaleCurrent ?? o.scale_current,
        o.scaleTarget ?? o.scale_target
      ),
      pendingSuggestion: null
    }))
  };
}

function applyPlanRecord(plan) {
  if (!plan) return;
  loadedPlanId.value = plan.id || null;
  const dxFromLinks = (plan.planDiagnoses || plan.plan_diagnoses || []).map((d, i) => ({
    icd10Code: d.icd10_code || d.icd10Code || '',
    description: d.description || '',
    isPrimary: Number(d.is_primary) === 1 || i === 0
  }));
  const discharge = String(plan.discharge_plan || plan.dischargePlan || '');
  const presentMatch = discharge.match(/Presenting Problem\n([\s\S]*?)(?=\n\n(?:Prescribed Frequency|Discharge Criteria)|$)/i);
  const freqMatch = discharge.match(/Prescribed Frequency of Treatment\n([\s\S]*?)(?=\n\nDischarge Criteria|$)/i);
  const discMatch = discharge.match(/Discharge Criteria\/Planning\n([\s\S]*)$/i);
  model.value = reactive({
    effectiveDate: (plan.effective_date || plan.effectiveDate || '').toString().slice(0, 10),
    presentingProblem: presentMatch?.[1]?.trim() || plan.presentingProblem || '',
    prescribedFrequency: freqMatch?.[1]?.trim() || '',
    dischargePlan: discMatch?.[1]?.trim() || (!presentMatch && !freqMatch ? discharge : ''),
    diagnosticJustification: String(plan.diagnostic_justification || plan.diagnosticJustification || '').trim(),
    diagnoses: dxFromLinks.length
      ? dxFromLinks
      : [{ icd10Code: '', description: '', isPrimary: true }],
    goals: (plan.goals || []).map((g) => mapGoal(g))
  });
  if (!model.value.goals.length) addGoal();
}

function setPrimary(index) {
  (model.value?.diagnoses || []).forEach((d, i) => {
    d.isPrimary = i === index;
  });
}

function moveDx(index, delta) {
  const arr = model.value.diagnoses;
  const next = index + delta;
  if (next < 0 || next >= arr.length) return;
  const [item] = arr.splice(index, 1);
  arr.splice(next, 0, item);
}

function addDiagnosis() {
  if (!model.value) return;
  model.value.diagnoses.push({
    icd10Code: '',
    description: '',
    isPrimary: model.value.diagnoses.length === 0
  });
}

function addGoal() {
  if (!model.value) return;
  model.value.goals.push({
    goalText: '',
    durationMonths: null,
    durationLabel: null,
    parsedDateHint: null,
    projectedCompletion: null,
    objectives: []
  });
}

function addObjective(gi) {
  model.value.goals[gi].objectives.push({
    objectiveText: '',
    scaleCurrent: null,
    scaleTarget: null,
    scaleDirection: null,
    measurementMethod: DEFAULT_MEASUREMENT_METHOD,
    scaleNeedsRewrite: true,
    pendingSuggestion: null
  });
}

async function suggestRewrite(gi, oi) {
  const o = model.value?.goals?.[gi]?.objectives?.[oi];
  if (!o || !String(o.objectiveText || '').trim()) return;
  rewriteKey.value = `${gi}-${oi}`;
  error.value = '';
  try {
    const res = await api.post(
      '/medical-billing/treatment-plans/normalize-objective',
      {
        agencyId: Number(props.agencyId),
        clientId: Number(props.clientId),
        objectiveText: o.objectiveText
      },
      { skipGlobalLoading: true }
    );
    o.pendingSuggestion = res?.data?.suggestion || null;
    if (!o.pendingSuggestion) {
      error.value = 'Could not generate a suggestion for this objective.';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'AI suggestion failed';
  } finally {
    rewriteKey.value = '';
  }
}

function approveSuggestion(gi, oi) {
  const o = model.value?.goals?.[gi]?.objectives?.[oi];
  const s = o?.pendingSuggestion;
  if (!o || !s) return;
  o.objectiveText = s.objectiveText;
  o.scaleCurrent = s.scaleCurrent;
  o.scaleTarget = s.scaleTarget;
  o.scaleDirection = s.scaleDirection;
  o.measurementMethod = DEFAULT_MEASUREMENT_METHOD;
  o.scaleNeedsRewrite = false;
  o.pendingSuggestion = null;
}

function discardSuggestion(gi, oi) {
  const o = model.value?.goals?.[gi]?.objectives?.[oi];
  if (o) o.pendingSuggestion = null;
}

function buildPlanTextFromModel() {
  if (!model.value) return '';
  const parts = [];
  if (model.value.diagnosticJustification) {
    parts.push(`Diagnostic Justification\n${model.value.diagnosticJustification}`);
  }
  for (const [i, g] of (model.value.goals || []).entries()) {
    parts.push(`Goal ${i + 1}: ${g.goalText || ''}`);
    for (const [j, o] of (g.objectives || []).entries()) {
      const scale =
        o.scaleCurrent != null && o.scaleTarget != null
          ? ` (${o.scaleCurrent} → ${o.scaleTarget})`
          : '';
      parts.push(`Objective ${i + 1}.${j + 1}: ${o.objectiveText || ''}${scale}`);
    }
  }
  return parts.join('\n');
}

async function parseText(text) {
  parsing.value = true;
  error.value = '';
  try {
    const res = await api.post(
      '/medical-billing/treatment-plans/parse',
      {
        agencyId: Number(props.agencyId),
        clientId: Number(props.clientId),
        text
      },
      { skipGlobalLoading: true }
    );
    const parsed = res?.data?.parsed || {};
    const dxList = parsed.diagnoses || [];
    const sharedJust = String(parsed.diagnosticJustification || '').trim()
      || dxList.map((d) => String(d.justification || '').trim()).find(Boolean)
      || '';
    model.value = reactive({
      effectiveDate: parsed.effectiveDate || model.value?.effectiveDate || '',
      presentingProblem: parsed.presentingProblem || model.value?.presentingProblem || '',
      prescribedFrequency: parsed.prescribedFrequency || model.value?.prescribedFrequency || '',
      dischargePlan: parsed.dischargePlan || model.value?.dischargePlan || '',
      diagnosticJustification: sharedJust || model.value?.diagnosticJustification || '',
      diagnoses: dxList.length
        ? dxList.map((d, i) => ({
          icd10Code: d.icd10Code || '',
          description: d.description || '',
          isPrimary: i === (parsed.primaryDiagnosisIndex || 0)
        }))
        : (model.value?.diagnoses || [{ icd10Code: '', description: '', isPrimary: true }]),
      goals: (parsed.goals || []).map((g) => mapGoal(g))
    });
    if (!model.value.diagnoses.length) addDiagnosis();
    if (!model.value.goals.length) addGoal();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Parse failed';
  } finally {
    parsing.value = false;
  }
}

async function parse() {
  await parseText(pasteText.value);
}

async function regenerateFromAddendum() {
  const extra = String(addendum.value || '').trim();
  if (!extra) return;
  regenerating.value = true;
  error.value = '';
  try {
    const base = buildPlanTextFromModel();
    await parseText(
      `${base}\n\nAdditional clinician information / revision instructions:\n${extra}`
    );
    addendum.value = '';
  } finally {
    regenerating.value = false;
  }
}

async function loadPlan() {
  if (props.initialPlan?.goals) {
    applyPlanRecord(props.initialPlan);
    return;
  }
  const pid = Number(props.planId || props.initialPlan?.id || 0);
  if (!pid) return;
  loadingPlan.value = true;
  error.value = '';
  try {
    const res = await api.get(`/medical-billing/treatment-plans/${pid}`, {
      params: {
        agencyId: Number(props.agencyId),
        clientId: Number(props.clientId)
      },
      skipGlobalLoading: true
    });
    applyPlanRecord(res?.data?.plan);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not load treatment plan';
  } finally {
    loadingPlan.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    pasteText.value = props.initialText || '';
    model.value = null;
    error.value = '';
    addendum.value = '';
    bulkDurationMonths.value = 0;
    rewriteKey.value = '';
    loadedPlanId.value = null;
    if (isDraftEditor.value) {
      void loadPlan();
    } else if (pasteText.value.trim()) {
      parse();
    }
  }
);

async function save({ finalize = true } = {}) {
  if (!model.value) return;
  saving.value = true;
  finalizing.value = !!finalize;
  error.value = '';
  try {
    for (const g of model.value.goals || []) {
      syncGoalCompletion(g);
      for (const o of g.objectives || []) {
        if (!isObjectiveScaleValid(o.scaleCurrent, o.scaleTarget)) {
          throw new Error('Each objective needs a valid 1–10 current and target before saving.');
        }
      }
    }

    const primary = (model.value.diagnoses || []).find((d) => d.isPrimary) || model.value.diagnoses?.[0];
    const dischargeParts = [];
    if (String(model.value.presentingProblem || '').trim()) {
      dischargeParts.push(`Presenting Problem\n${String(model.value.presentingProblem).trim()}`);
    }
    if (String(model.value.prescribedFrequency || '').trim()) {
      dischargeParts.push(
        `Prescribed Frequency of Treatment\n${String(model.value.prescribedFrequency).trim()}`
      );
    }
    if (String(model.value.dischargePlan || '').trim()) {
      dischargeParts.push(`Discharge Criteria/Planning\n${String(model.value.dischargePlan).trim()}`);
    }
    const asDraft = !finalize;
    const res = await api.post('/medical-billing/treatment-plans', {
      agencyId: Number(props.agencyId),
      clientId: Number(props.clientId),
      title: asDraft ? 'Treatment Plan Draft' : (isDraftEditor.value ? 'Treatment Plan' : 'Imported Treatment Plan'),
      status: asDraft ? 'draft' : 'active',
      finalize: !asDraft,
      effectiveDate: model.value.effectiveDate || null,
      dischargePlan: dischargeParts.length ? dischargeParts.join('\n\n') : null,
      presentingProblem: model.value.presentingProblem || null,
      prescribedFrequency: model.value.prescribedFrequency || null,
      sourceToolId: asDraft ? 'intake_packet_bootstrap' : 'note_aid_plan_import',
      icd10Code: primary?.icd10Code || null,
      diagnosisDescription: primary?.description || null,
      diagnosticJustification: String(model.value.diagnosticJustification || '').trim() || null,
      diagnoses: (model.value.diagnoses || []).map((d, i) => ({
        ...d,
        justification: i === 0 || d.isPrimary
          ? String(model.value.diagnosticJustification || '').trim()
          : ''
      })),
      goals: model.value.goals.map((g, i) => ({
        goalIndex: i + 1,
        goalText: g.goalText,
        projectedCompletion: g.projectedCompletion || completionDateFromDurationMonths(g.durationMonths) || null,
        objectives: (g.objectives || []).map((o, j) => ({
          objectiveIndex: j + 1,
          objectiveText: o.objectiveText,
          scaleCurrent: o.scaleCurrent,
          scaleTarget: o.scaleTarget,
          scaleDirection: o.scaleDirection,
          measurementMethod: DEFAULT_MEASUREMENT_METHOD
        }))
      }))
    });
    emit('saved', res?.data?.plan || null);
  } catch (e) {
    const code = e.response?.data?.error?.code;
    if (code === 'intake_not_finalized') {
      error.value = 'Finalize the intake note before finalizing the treatment plan.';
    } else {
      error.value = e.response?.data?.error?.message || e.message || 'Save failed';
    }
  } finally {
    saving.value = false;
    finalizing.value = false;
  }
}
</script>

<style scoped>
.na-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 90;
  padding: 24px 16px;
  overflow: auto;
}
.na-modal {
  background: #fff;
  border-radius: 14px;
  width: min(720px, 100%);
  padding: 18px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}
.na-modal--wide { width: min(960px, 100%); }
.na-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.na-modal-head h3 { margin: 0; }
.na-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 10px;
}
.na-label--inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  margin-bottom: 0;
  flex-wrap: wrap;
}
.na-label--scale {
  min-width: 88px;
  margin-bottom: 0;
}
.hint-inline {
  font-weight: 500;
  color: #64748b;
}
.hint-block {
  margin: 4px 0 12px;
  font-weight: 500;
  color: #64748b;
  font-size: 0.78rem;
  max-width: 720px;
}
.na-input, .na-textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.na-input--grow { flex: 1; min-width: 140px; }
.na-input--duration { width: auto; min-width: 110px; }
.na-input--scale { width: 64px; }
.na-input--direction { width: auto; min-width: 110px; }
.na-textarea--goal, .na-textarea--objective { width: 100%; box-sizing: border-box; }
.na-import-block { margin: 12px 0; }
.na-import-block-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.na-import-block-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.na-import-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
  background: #f8fafc;
}
.na-import-card--goal { background: #fff; }
.na-import-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
}
.na-import-row--goal-meta { margin: 8px 0; }
.na-import-obj {
  border-top: 1px dashed #e2e8f0;
  padding-top: 8px;
  margin-top: 8px;
}
.na-import-scale {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 6px 0;
}
.na-scale-arrow { color: #64748b; font-weight: 700; }
.na-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
}
.na-rewrite-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  padding: 8px;
  margin: 6px 0;
  font-size: 0.82rem;
}
.na-suggestion-card {
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  border-radius: 8px;
  padding: 8px;
  margin: 6px 0;
}
.na-suggestion-label { margin: 0 0 4px; font-weight: 700; font-size: 0.8rem; }
.na-suggestion-text { margin: 0 0 6px; white-space: pre-wrap; }
.na-suggestion-actions { display: flex; gap: 8px; }
.na-revision-block {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.na-modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 14px;
}
.na-modal-actions--start { justify-content: flex-start; }
.na-btn-primary, .na-btn-outline, .na-link-btn, .na-btn-outline--sm {
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 650;
  cursor: pointer;
  font: inherit;
}
.na-btn-outline--sm { padding: 6px 10px; font-size: 0.8rem; }
.na-btn-primary {
  background: #166534;
  color: #fff;
  border: 0;
}
.na-btn-outline {
  background: #fff;
  border: 1px solid #cbd5e1;
  color: #0f172a;
}
.na-link-btn {
  border: 0;
  background: transparent;
  color: #166534;
}
.muted, .hint { color: #64748b; }
.tiny { font-size: 0.75rem; }
.error { color: #b91c1c; }
.na-duration-preview { font-size: 0.8rem; color: #334155; }
</style>
