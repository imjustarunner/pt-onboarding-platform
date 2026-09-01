<template>
  <section v-if="goals.length" class="na-obj-ratings">
    <header class="na-obj-ratings-head">
      <div>
        <h3>Treatment objectives</h3>
        <p>
          <span class="na-swatch na-swatch--now" /> Current (this session)
          <span class="na-swatch na-swatch--prev" /> Previous session
          <span class="na-swatch na-swatch--goal" /> Goal
        </p>
        <p class="na-obj-rater-note">
          The main rating is <strong>clinical observation</strong> and is written that way in the note.
          Client and other ratings are optional and graph separately.
        </p>
      </div>
      <span v-if="suggestUpdatePlan" class="na-obj-suggest">Update treatment plan suggested</span>
    </header>

    <div class="na-obj-raters" role="tablist">
      <button type="button" class="na-obj-rater" :class="{ on: raterKind === 'clinician' }" @click="raterKind = 'clinician'">
        Clinician
      </button>
      <button type="button" class="na-obj-rater" :class="{ on: raterKind === 'client' }" @click="raterKind = 'client'">
        Client
      </button>
      <button type="button" class="na-obj-rater" :class="{ on: raterKind === 'other' }" @click="raterKind = 'other'">
        Other
      </button>
    </div>
    <label v-if="raterKind === 'other'" class="na-obj-other">
      Who is rating?
      <input v-model="otherLabel" class="na-obj-other-input" placeholder="Guardian, teacher, …" />
    </label>

    <div v-for="goal in goals" :key="goal.id" class="na-obj-goal">
      <div class="na-obj-goal-title">
        <span class="na-obj-badge">G{{ goal.goal_index || '' }}</span>
        <strong>{{ goal.goal_text || 'Goal' }}</strong>
      </div>

      <div
        v-for="obj in goal.objectives || []"
        :key="obj.id"
        class="na-obj-card"
      >
        <div class="na-obj-text">
          <span class="na-obj-badge na-obj-badge--obj">O{{ obj.objective_index || '' }}</span>
          <span>{{ obj.objective_text || 'Objective' }}</span>
        </div>

        <p v-if="kioskQuestion(obj)" class="na-obj-kiosk-q">{{ kioskQuestion(obj) }}</p>

        <div class="na-scale-row" role="group" :aria-label="`Scale for objective ${obj.id}`">
          <button
            v-for="n in 10"
            :key="n"
            type="button"
            class="na-scale-btn"
            :class="{
              goal: Number(obj.scale_target) === n,
              prev: previousRated(obj) === n,
              selected: entry(obj.id)?.disposition === 'rated' && Number(entry(obj.id)?.scaleValue) === n
            }"
            :disabled="disabled || isNonNumeric(obj.id)"
            :title="scaleTitle(obj, n)"
            @click="rate(obj, goal, n)"
          >
            {{ n }}
          </button>
        </div>

        <div class="na-obj-dispositions">
          <button type="button" class="na-disp-btn" :class="{ on: entry(obj.id)?.disposition === 'deferred' }" :disabled="disabled" @click="setDisposition(obj, goal, 'deferred')">Deferred</button>
          <button type="button" class="na-disp-btn" :class="{ on: entry(obj.id)?.disposition === 'on_hold' }" :disabled="disabled" @click="setDisposition(obj, goal, 'on_hold')">On hold</button>
          <button type="button" class="na-disp-btn" :class="{ on: entry(obj.id)?.disposition === 'not_addressed' }" :disabled="disabled" @click="setDisposition(obj, goal, 'not_addressed')">Not addressed</button>
        </div>

        <p v-if="entry(obj.id)?.progressLabel" class="na-obj-progress" :class="entry(obj.id).progressLabel">
          {{ progressCopy(entry(obj.id).progressLabel) }}
        </p>
        <p v-else-if="isNonNumeric(obj.id)" class="na-obj-progress muted">
          {{ dispositionCopy(entry(obj.id)?.disposition) }}
        </p>
        <p v-else-if="Number(obj.scale_target)" class="na-field-hint">
          Goal {{ obj.scale_target }} (green ring). Previous session in amber when on file.
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import {
  computeProgressLabel,
  kioskPromptForObjective,
  progressLabelCopy
} from '../../utils/noteAidTreatmentHelpers.js';

const props = defineProps({
  goals: { type: Array, default: () => [] },
  previousRatings: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:ratings', 'improved']);

const raterKind = ref('clinician');
const otherLabel = ref('');

/** @type {Record<string, object>} keyed objectiveId:raterKind */
const byObjective = reactive({});

const suggestUpdatePlan = computed(() =>
  Object.values(byObjective).some((e) => e?.progressLabel === 'improved')
);

function entryKey(objectiveId, kind = raterKind.value) {
  return `${objectiveId}:${kind}`;
}

function entry(objectiveId) {
  return byObjective[entryKey(objectiveId)] || null;
}

function previousRated(obj) {
  const kind = raterKind.value;
  const hist = (props.previousRatings || [])
    .filter((r) => Number(r.objective_id || r.objectiveId) === Number(obj.id)
      && String(r.rater_kind || r.raterKind || 'clinician') === kind
      && r.scale_value != null && r.scale_value !== '')
    .sort((a, b) => String(b.rated_at || b.date_of_service || '').localeCompare(String(a.rated_at || a.date_of_service || '')));
  if (hist[0]?.scale_value != null) return Number(hist[0].scale_value);
  if (kind === 'clinician' && obj.scale_current != null) return Number(obj.scale_current);
  return null;
}

function kioskQuestion(obj) {
  return kioskPromptForObjective(obj);
}

function scaleTitle(obj, n) {
  const bits = [String(n)];
  if (Number(obj.scale_target) === n) bits.push('goal');
  if (previousRated(obj) === n) bits.push('previous session');
  if (entry(obj.id)?.disposition === 'rated' && Number(entry(obj.id)?.scaleValue) === n) {
    bits.push('current');
  }
  return bits.join(' · ');
}

function isNonNumeric(objectiveId) {
  const d = entry(objectiveId)?.disposition;
  return d && d !== 'rated';
}

function progressCopy(label) {
  return progressLabelCopy(label);
}

function dispositionCopy(d) {
  if (d === 'deferred') return 'Deferred — scale not used this session.';
  if (d === 'on_hold') return 'On hold — scale not used this session.';
  if (d === 'not_addressed') return 'Not addressed — logged without a scale.';
  return '';
}

function emitAll() {
  const list = Object.values(byObjective).filter(Boolean);
  emit('update:ratings', list);
  if (list.some((e) => e.progressLabel === 'improved')) {
    emit('improved', true);
  }
}

function rate(obj, goal, n) {
  const previous = previousRated(obj);
  const target = obj.scale_target != null ? Number(obj.scale_target) : null;
  const progressLabel = computeProgressLabel({
    previousValue: previous,
    newValue: n,
    target
  });
  byObjective[entryKey(obj.id)] = {
    objectiveId: Number(obj.id),
    goalId: Number(goal.id),
    goalText: goal.goal_text || '',
    objectiveText: obj.objective_text || '',
    scaleValue: n,
    scaleTarget: target,
    previousScaleValue: previous,
    disposition: 'rated',
    progressLabel,
    raterKind: raterKind.value,
    raterLabel: raterKind.value === 'clinician'
      ? 'clinical observation'
      : raterKind.value === 'client'
        ? 'client'
        : (otherLabel.value || 'other')
  };
  emitAll();
}

function setDisposition(obj, goal, disposition) {
  const previous = previousRated(obj);
  byObjective[entryKey(obj.id)] = {
    objectiveId: Number(obj.id),
    goalId: Number(goal.id),
    goalText: goal.goal_text || '',
    objectiveText: obj.objective_text || '',
    scaleValue: null,
    scaleTarget: obj.scale_target != null ? Number(obj.scale_target) : null,
    previousScaleValue: previous,
    disposition,
    progressLabel: null,
    raterKind: raterKind.value,
    raterLabel: raterKind.value === 'clinician' ? 'clinical observation' : raterKind.value
  };
  emitAll();
}

watch(
  () => props.goals,
  () => {
    // Keep ratings that still match objective ids; drop stale.
    const ids = new Set();
    for (const g of props.goals || []) {
      for (const o of g.objectives || []) ids.add(String(o.id));
    }
    for (const key of Object.keys(byObjective)) {
      const oid = String(key).split(':')[0];
      if (!ids.has(oid)) delete byObjective[key];
    }
  },
  { deep: true }
);

defineExpose({
  getRatings: () => Object.values(byObjective).filter(Boolean),
  reset: () => {
    for (const key of Object.keys(byObjective)) delete byObjective[key];
    emitAll();
  }
});
</script>

<style scoped>
.na-obj-ratings {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  margin: 12px 0 16px;
}
.na-obj-ratings-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.na-obj-ratings-head h3 {
  margin: 0 0 4px;
  font-size: 1rem;
}
.na-obj-ratings-head p {
  margin: 0;
  color: #64748b;
  font-size: 0.82rem;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
}
.na-obj-rater-note {
  display: block !important;
  margin-top: 6px !important;
  font-size: 0.75rem !important;
}
.na-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  margin-right: 4px;
  vertical-align: middle;
}
.na-swatch--now { background: #0f766e; }
.na-swatch--prev { background: #f59e0b; }
.na-swatch--goal { background: transparent; box-shadow: inset 0 0 0 2px #16a34a; }
.na-obj-raters { display: flex; gap: 6px; margin-bottom: 10px; }
.na-obj-rater {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.na-obj-rater.on { background: #0f766e; border-color: #0f766e; color: #fff; }
.na-obj-other { display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 10px; }
.na-obj-other-input {
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 8px; font-size: 0.85rem;
}
.na-obj-kiosk-q {
  margin: 0 0 8px;
  font-size: 0.78rem;
  color: #334155;
  font-style: italic;
}
.na-obj-suggest {
  background: #fef3c7;
  color: #92400e;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}
.na-obj-goal {
  margin-bottom: 14px;
}
.na-obj-goal-title {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.na-obj-badge {
  display: inline-grid;
  place-items: center;
  min-width: 28px;
  height: 22px;
  padding: 0 6px;
  border-radius: 6px;
  background: #0f766e;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 800;
  flex-shrink: 0;
}
.na-obj-badge--obj {
  background: #0d9488;
}
.na-obj-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #f8fafc;
}
.na-obj-text {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 8px;
  font-size: 0.9rem;
}
.na-scale-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.na-scale-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1.5px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
  font-weight: 700;
  cursor: pointer;
}
.na-scale-btn.goal:not(.selected):not(.prev) {
  box-shadow: inset 0 0 0 2px #16a34a;
  background: #fff;
  border-color: #86efac;
  color: #166534;
}
.na-scale-btn.prev:not(.selected) {
  background: #f59e0b;
  border-color: #d97706;
  color: #fff;
}
.na-scale-btn.selected {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
  outline: none;
}
.na-scale-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.na-obj-dispositions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.na-disp-btn {
  border: 1px solid #94a3b8;
  background: #fff;
  color: #334155;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
.na-disp-btn.on {
  background: #e2e8f0;
  border-color: #475569;
  color: #0f172a;
}
.na-obj-progress {
  margin: 8px 0 0;
  font-size: 0.82rem;
  font-weight: 600;
}
.na-obj-progress.improved { color: #15803d; }
.na-obj-progress.progressing { color: #0f766e; }
.na-obj-progress.regressed { color: #b91c1c; }
.na-obj-progress.unchanged { color: #64748b; }
.na-obj-progress.muted { color: #64748b; font-weight: 500; }
.na-field-hint {
  margin: 6px 0 0;
  font-size: 0.75rem;
  color: #64748b;
}
</style>
