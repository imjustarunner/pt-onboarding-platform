<template>
  <section class="csnb" aria-label="CSNoteBuild Colorado step-by-step note builder">
    <header class="csnb-head">
      <div>
        <span class="csnb-kicker">CSNoteBuild</span>
        <h2>Colorado progress note pathway</h2>
        <p>
          Step-by-step documentation aligned to Colorado Service Documentation Standards.
          Answers drive the AI narrative (not freeform SOAP).
        </p>
      </div>
      <div class="csnb-progress" aria-live="polite">
        <span>{{ completion.done }} of {{ completion.total }} completed</span>
        <div class="csnb-progress-bar">
          <span :style="{ width: `${(completion.done / Math.max(completion.total, 1)) * 100}%` }" />
        </div>
      </div>
    </header>

    <!-- 1 Start -->
    <article class="csnb-step" :class="{ done: model.startConfirmed && model.startTime }">
      <h3><span>1</span> Confirm Start Time</h3>
      <div class="csnb-row">
        <label>
          Scheduled / recorded start
          <input v-model="model.startTime" type="time" class="csnb-input" />
        </label>
        <div class="csnb-actions">
          <button type="button" class="csnb-btn" :class="{ primary: model.startConfirmed }" @click="model.startConfirmed = true">Confirm</button>
          <button type="button" class="csnb-btn" @click="model.startConfirmed = false">Change</button>
        </div>
      </div>
    </article>

    <!-- 2 End -->
    <article class="csnb-step" :class="{ done: model.endConfirmed && model.endTime }">
      <h3><span>2</span> Confirm End Time</h3>
      <div class="csnb-row">
        <label>
          Actual end
          <input v-model="model.endTime" type="time" class="csnb-input" />
        </label>
        <div class="csnb-stat">
          Total contact time
          <strong>{{ contactMinutes != null ? `${contactMinutes} min` : '—' }}</strong>
        </div>
        <div class="csnb-actions">
          <button type="button" class="csnb-btn" :class="{ primary: model.endConfirmed }" @click="model.endConfirmed = true">Confirm</button>
          <button type="button" class="csnb-btn" @click="model.endConfirmed = false">Change</button>
        </div>
      </div>
    </article>

    <!-- 3 Participants -->
    <article class="csnb-step" :class="{ done: model.participantsConfirmed }">
      <h3><span>3</span> Confirm Participants</h3>
      <div class="csnb-chips">
        <button
          v-for="opt in participantOptions"
          :key="opt"
          type="button"
          class="csnb-chip"
          :class="{ on: model.participantsMode === opt }"
          @click="model.participantsMode = opt"
        >
          {{ opt }}
        </button>
      </div>
      <label v-if="model.participantsMode !== 'Client Only'" class="csnb-block">
        Who participated?
        <input v-model="model.participantsDetail" class="csnb-input" placeholder="e.g., MOC, FOC, school staff…" />
      </label>
      <div class="csnb-actions">
        <button type="button" class="csnb-btn primary" @click="model.participantsConfirmed = true">Confirm</button>
        <button type="button" class="csnb-btn" @click="model.participantsConfirmed = false">Change</button>
      </div>
    </article>

    <!-- 4 Focus -->
    <article class="csnb-step" :class="{ done: !!String(model.sessionFocus || '').trim() }">
      <h3><span>4</span> What did you focus on today?</h3>
      <textarea
        v-model="model.sessionFocus"
        class="csnb-textarea"
        rows="4"
        maxlength="2000"
        placeholder="Brief description of session focus (type or paste dictation)…"
      />
      <span class="csnb-count">{{ String(model.sessionFocus || '').length }} / 2000</span>
    </article>

    <!-- 5 Interventions -->
    <article class="csnb-step" :class="{ done: (model.interventionsSelected || []).length > 0 || !!model.interventionsCustom }">
      <h3><span>5</span> What did you do today? (Select interventions used)</h3>
      <p class="csnb-hint">Proposed from treatment plan / common modalities</p>
      <div class="csnb-checks">
        <label v-for="item in interventionChoices" :key="item" class="csnb-check">
          <input type="checkbox" :value="item" v-model="model.interventionsSelected" />
          <span>{{ item }}</span>
        </label>
      </div>
      <label class="csnb-block">
        Additional / custom interventions
        <input v-model="model.interventionsCustom" class="csnb-input" placeholder="+ Add custom (comma separated)" />
      </label>
    </article>

    <!-- 6 How used -->
    <article class="csnb-step" :class="{ done: (model.interventionUse || []).length > 0 || !!model.interventionUseMore }">
      <h3><span>6</span> How did you use the interventions?</h3>
      <div class="csnb-checks">
        <label v-for="opt in useOptions" :key="opt" class="csnb-check">
          <input type="checkbox" :value="opt" v-model="model.interventionUse" />
          <span>{{ opt }}</span>
        </label>
      </div>
      <label class="csnb-block">
        Say more…
        <textarea v-model="model.interventionUseMore" class="csnb-textarea" rows="3" placeholder="How interventions were applied today…" />
      </label>
    </article>

    <!-- 7 Response -->
    <article class="csnb-step" :class="{ done: !!model.clientResponse }">
      <h3><span>7</span> How did the client respond to the interventions?</h3>
      <div class="csnb-chips">
        <button
          v-for="opt in responseOptions"
          :key="opt"
          type="button"
          class="csnb-chip"
          :class="{ on: model.clientResponse === opt, good: opt === 'Actively Engaged' }"
          @click="model.clientResponse = opt"
        >
          {{ opt }}
        </button>
      </div>
      <label class="csnb-block">
        Say more…
        <textarea v-model="model.clientResponseMore" class="csnb-textarea" rows="3" placeholder="Progress, difficulty, benefit, participation…" />
      </label>
    </article>

    <!-- 8 Medical necessity -->
    <article class="csnb-step" :class="{ done: (model.symptomsSelected || []).length && !!String(model.medicalNecessityNarrative || '').trim() }">
      <h3><span>8</span> Medical Necessity</h3>
      <div class="csnb-grid3">
        <div>
          <h4>Symptoms / clinical needs</h4>
          <div class="csnb-checks">
            <label v-for="sym in symptomChoices" :key="sym" class="csnb-check">
              <input type="checkbox" :value="sym" v-model="model.symptomsSelected" />
              <span>{{ sym }}</span>
            </label>
          </div>
        </div>
        <div>
          <h4>Currently affecting</h4>
          <div class="csnb-checks">
            <label v-for="area in affectAreas" :key="area" class="csnb-check">
              <input type="checkbox" :value="area" v-model="model.affectAreas" />
              <span>{{ area }}</span>
            </label>
          </div>
        </div>
        <div>
          <h4>Why was today’s service medically necessary?</h4>
          <textarea
            v-model="model.medicalNecessityNarrative"
            class="csnb-textarea"
            rows="8"
            placeholder="Explain clinical rationale and medical necessity…"
          />
        </div>
      </div>
    </article>

    <!-- 9 MSE + Risk -->
    <article class="csnb-step" :class="{ done: !!model.mse?.mood && !!model.riskLevel }">
      <h3><span>9</span> MSE + Risk / Safety</h3>
      <div class="csnb-mse-grid">
        <label v-for="field in mseFields" :key="field.key">
          {{ field.label }}
          <input v-model="model.mse[field.key]" class="csnb-input" />
        </label>
      </div>
      <div class="csnb-row" style="margin-top: 12px;">
        <label>
          Risk / Safety Assessment
          <select v-model="model.riskLevel" class="csnb-input">
            <option>Low Risk</option>
            <option>Moderate Risk</option>
            <option>High Risk</option>
            <option>Unable to Assess</option>
          </select>
        </label>
      </div>
      <label v-if="model.riskLevel !== 'Low Risk'" class="csnb-block">
        Risk details (expand when indicated)
        <textarea v-model="model.riskDetails" class="csnb-textarea" rows="3" />
      </label>
    </article>

    <!-- 10 Treatment plan progress -->
    <article class="csnb-step" :class="{ done: goalsProgressDone }">
      <h3><span>10</span> Treatment Plan Progress</h3>
      <p v-if="!goals.length" class="csnb-hint">No active treatment-plan goals on file — progress ratings skipped.</p>
      <div v-for="g in goals" :key="g.id" class="csnb-goal">
        <strong>G{{ g.goal_index }} · {{ g.goal_text }}</strong>
        <div class="csnb-row">
          <label>
            Progress rating
            <select
              class="csnb-input"
              :value="model.goalProgress[g.id]?.rating || ''"
              @change="setGoalRating(g, $event.target.value)"
            >
              <option value="">Select…</option>
              <option v-for="r in progressRatings" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>
          <label class="csnb-grow">
            Say more (optional)
            <input
              class="csnb-input"
              :value="model.goalProgress[g.id]?.note || ''"
              placeholder="Brief explanation…"
              @input="setGoalNote(g, $event.target.value)"
            />
          </label>
        </div>
        <div v-for="o in g.objectives || []" :key="o.id" class="csnb-obj">
          <span>O{{ o.objective_index }}: {{ o.objective_text }}</span>
          <select
            class="csnb-input csnb-input--sm"
            :value="objectiveRating(g.id, o.id)"
            @change="setObjectiveRating(g, o, $event.target.value)"
          >
            <option value="">Select…</option>
            <option v-for="r in progressRatings" :key="r" :value="r">{{ r }}</option>
          </select>
        </div>
      </div>
    </article>

    <!-- 11 Telehealth -->
    <article v-if="isTelehealth" class="csnb-step" :class="{ done: !!String(model.telehealthVerification || '').trim() }">
      <h3><span>11</span> Telehealth Verification</h3>
      <textarea
        v-model="model.telehealthVerification"
        class="csnb-textarea"
        rows="3"
        placeholder="Confirm consent to participate via telehealth, client identity, and private location…"
      />
    </article>
    <article v-else class="csnb-step done">
      <h3><span>11</span> Telehealth Verification</h3>
      <p class="csnb-hint">(Not required) — not a telehealth session.</p>
    </article>

    <!-- 12 Plan -->
    <article class="csnb-step" :class="{ done: model.planAccepted || !!String(model.planEdited || model.planProposed || '').trim() }">
      <h3><span>12</span> Plan for Next Service</h3>
      <div class="csnb-plan-grid">
        <div>
          <h4>Proposed plan (from today’s answers)</h4>
          <p class="csnb-proposed">{{ model.planProposed || 'Click “Propose plan” to draft from today’s answers, then edit and accept.' }}</p>
          <button type="button" class="csnb-btn" :disabled="proposingPlan" @click="proposePlan">
            {{ proposingPlan ? 'Proposing…' : (model.planProposed ? 'Regenerate plan' : 'Propose plan') }}
          </button>
        </div>
        <div>
          <h4>Your plan</h4>
          <textarea v-model="model.planEdited" class="csnb-textarea" rows="6" placeholder="Edit or accept the proposed plan…" />
          <div class="csnb-actions">
            <button type="button" class="csnb-btn" @click="model.planEdited = model.planProposed">Use proposed</button>
            <button type="button" class="csnb-btn primary" @click="acceptPlan">Accept plan</button>
          </div>
        </div>
      </div>
    </article>

    <footer class="csnb-foot">
      <p v-if="!completion.complete" class="csnb-hint">
        Complete remaining steps, then generate the Colorado-aligned narrative.
      </p>
      <p v-else class="csnb-hint ok">Ready to generate narrative from your answers.</p>
    </footer>
  </section>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';
import {
  CS_AFFECT_AREAS,
  CS_CLIENT_RESPONSE_OPTIONS,
  CS_DEFAULT_INTERVENTIONS,
  CS_DEFAULT_SYMPTOMS,
  CS_INTERVENTION_USE_OPTIONS,
  CS_MSE_FIELDS,
  CS_PROGRESS_RATINGS,
  createEmptyCsNoteBuildState,
  csContactMinutes,
  csNoteBuildCompletionCount
} from '../../utils/csNoteBuild.js';

const props = defineProps({
  modelValue: { type: Object, default: null },
  goals: { type: Array, default: () => [] },
  proposedInterventions: { type: Array, default: () => [] },
  symptomSuggestions: { type: Array, default: () => [] },
  isTelehealth: { type: Boolean, default: false },
  proposingPlan: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'propose-plan']);

const model = reactive(props.modelValue ? { ...createEmptyCsNoteBuildState(), ...props.modelValue, mse: { ...createEmptyCsNoteBuildState().mse, ...(props.modelValue.mse || {}) } } : createEmptyCsNoteBuildState());

watch(
  model,
  () => {
    emit('update:modelValue', JSON.parse(JSON.stringify(model)));
  },
  { deep: true }
);

watch(
  () => props.isTelehealth,
  (v) => {
    model.telehealthRequired = !!v;
  },
  { immediate: true }
);

watch(
  () => props.proposedInterventions,
  (list) => {
    if (Array.isArray(list) && list.length && !(model.interventionsProposed || []).length) {
      model.interventionsProposed = [...list];
      if (!(model.interventionsSelected || []).length) {
        model.interventionsSelected = [...list];
      }
    }
  },
  { immediate: true }
);

const participantOptions = ['Client Only', 'Client + Family', 'Client + Other', 'Collateral'];
const useOptions = CS_INTERVENTION_USE_OPTIONS;
const responseOptions = CS_CLIENT_RESPONSE_OPTIONS;
const affectAreas = CS_AFFECT_AREAS;
const progressRatings = CS_PROGRESS_RATINGS;
const mseFields = CS_MSE_FIELDS;

const interventionChoices = computed(() => {
  const fromPlan = [...(props.proposedInterventions || []), ...(model.interventionsProposed || [])];
  return [...new Set([...fromPlan, ...CS_DEFAULT_INTERVENTIONS].filter(Boolean))];
});

const symptomChoices = computed(() =>
  [...new Set([...(props.symptomSuggestions || []), ...CS_DEFAULT_SYMPTOMS].filter(Boolean))]
);

const contactMinutes = computed(() => csContactMinutes(model.startTime, model.endTime));

const goalIds = computed(() => (props.goals || []).map((g) => g.id).filter(Boolean));

const completion = computed(() =>
  csNoteBuildCompletionCount(model, {
    isTelehealth: props.isTelehealth,
    goalIds: goalIds.value
  })
);

const goalsProgressDone = computed(() => {
  if (!goalIds.value.length) return true;
  return goalIds.value.every((id) => !!model.goalProgress?.[id]?.rating);
});

function ensureGoal(g) {
  if (!model.goalProgress[g.id]) {
    model.goalProgress[g.id] = {
      goalText: g.goal_text || '',
      rating: '',
      note: '',
      objectives: []
    };
  }
  return model.goalProgress[g.id];
}

function setGoalRating(g, rating) {
  const row = ensureGoal(g);
  row.rating = rating;
  row.goalText = g.goal_text || row.goalText;
}

function setGoalNote(g, note) {
  const row = ensureGoal(g);
  row.note = note;
  row.goalText = g.goal_text || row.goalText;
}

function objectiveRating(goalId, objectiveId) {
  const row = model.goalProgress[goalId];
  const hit = (row?.objectives || []).find((o) => String(o.objectiveId) === String(objectiveId));
  return hit?.rating || '';
}

function setObjectiveRating(g, o, rating) {
  const row = ensureGoal(g);
  if (!Array.isArray(row.objectives)) row.objectives = [];
  const idx = row.objectives.findIndex((x) => String(x.objectiveId) === String(o.id));
  const payload = {
    objectiveId: o.id,
    objectiveIndex: o.objective_index,
    objectiveText: o.objective_text,
    rating,
    note: ''
  };
  if (idx >= 0) row.objectives[idx] = { ...row.objectives[idx], ...payload };
  else row.objectives.push(payload);
}

function proposePlan() {
  emit('propose-plan', JSON.parse(JSON.stringify(model)));
}

function acceptPlan() {
  if (!model.planEdited && model.planProposed) model.planEdited = model.planProposed;
  model.planAccepted = true;
}

defineExpose({
  getState: () => JSON.parse(JSON.stringify(model)),
  setProposedPlan(text) {
    model.planProposed = String(text || '');
    if (!model.planEdited) model.planEdited = model.planProposed;
  },
  completion
});
</script>

<style scoped>
.csnb {
  border: 1px solid #dbeafe;
  border-radius: 16px;
  background: #fff;
  padding: 16px;
  margin-bottom: 14px;
}
.csnb-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.csnb-kicker {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #1d4ed8;
}
.csnb-head h2 {
  margin: 4px 0;
  font-size: 1.15rem;
  color: #0f172a;
}
.csnb-head p {
  margin: 0;
  color: #64748b;
  font-size: 0.86rem;
  max-width: 52ch;
}
.csnb-progress {
  min-width: 160px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #334155;
}
.csnb-progress-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
  margin-top: 6px;
}
.csnb-progress-bar span {
  display: block;
  height: 100%;
  background: #2563eb;
}
.csnb-step {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 10px;
  background: #f8fafc;
}
.csnb-step.done {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.csnb-step h3 {
  margin: 0 0 10px;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 8px;
}
.csnb-step h3 span {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #1d4ed8;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
}
.csnb-step h4 {
  margin: 0 0 8px;
  font-size: 0.82rem;
  color: #334155;
}
.csnb-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
}
.csnb-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  margin-top: 10px;
}
.csnb-grow { flex: 1; min-width: 180px; }
.csnb-input,
.csnb-textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
  width: 100%;
}
.csnb-input--sm { max-width: 200px; }
.csnb-textarea { resize: vertical; }
.csnb-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.csnb-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 7px 12px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
}
.csnb-btn.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.csnb-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.csnb-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.csnb-chip {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.csnb-chip.on { background: #dbeafe; border-color: #93c5fd; color: #1e40af; }
.csnb-chip.good.on { background: #dcfce7; border-color: #86efac; color: #166534; }
.csnb-checks { display: flex; flex-direction: column; gap: 6px; }
.csnb-check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.84rem;
  font-weight: 500;
}
.csnb-grid3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.csnb-mse-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}
.csnb-mse-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}
.csnb-goal {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
  margin-bottom: 8px;
}
.csnb-obj {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
  font-size: 0.82rem;
  color: #475569;
}
.csnb-plan-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.csnb-proposed {
  white-space: pre-wrap;
  font-size: 0.84rem;
  color: #334155;
  background: #fff;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  padding: 10px;
  min-height: 100px;
}
.csnb-hint { font-size: 0.82rem; color: #64748b; margin: 0 0 8px; }
.csnb-hint.ok { color: #166534; font-weight: 700; }
.csnb-count { font-size: 0.75rem; color: #94a3b8; }
.csnb-stat {
  display: flex;
  flex-direction: column;
  font-size: 0.78rem;
  color: #64748b;
}
.csnb-foot { margin-top: 8px; }
@media (max-width: 900px) {
  .csnb-grid3,
  .csnb-plan-grid { grid-template-columns: 1fr; }
}
</style>
