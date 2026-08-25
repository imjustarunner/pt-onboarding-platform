<template>
  <section v-if="goals.length" class="na-obj-ratings">
    <header class="na-obj-ratings-head">
      <div>
        <h3>Treatment objectives</h3>
        <p>Rate each measurable objective (1–10). Green = goal. Outline = last rating.</p>
      </div>
      <span v-if="suggestUpdatePlan" class="na-obj-suggest">Update treatment plan suggested</span>
    </header>

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

        <div class="na-scale-row" role="group" :aria-label="`Scale for objective ${obj.id}`">
          <button
            v-for="n in 10"
            :key="n"
            type="button"
            class="na-scale-btn"
            :class="{
              goal: Number(obj.scale_target) === n,
              last: lastRated(obj) === n && entry(obj.id)?.disposition === 'rated',
              selected: entry(obj.id)?.disposition === 'rated' && Number(entry(obj.id)?.scaleValue) === n
            }"
            :disabled="disabled || isNonNumeric(obj.id)"
            :title="Number(obj.scale_target) === n ? 'Goal' : lastRated(obj) === n ? 'Last rating' : String(n)"
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
          Goal highlighted in green ({{ obj.scale_target }}). Last rating outlined when available.
        </p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';
import {
  computeProgressLabel,
  progressLabelCopy
} from '../../utils/noteAidTreatmentHelpers.js';

const props = defineProps({
  goals: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['update:ratings', 'improved']);

/** @type {Record<string, { objectiveId, goalId, goalText, objectiveText, scaleValue, scaleTarget, previousScaleValue, disposition, progressLabel }>} */
const byObjective = reactive({});

const suggestUpdatePlan = computed(() =>
  Object.values(byObjective).some((e) => e?.progressLabel === 'improved')
);

function entry(objectiveId) {
  return byObjective[String(objectiveId)] || null;
}

function lastRated(obj) {
  const e = entry(obj.id);
  if (e?.previousScaleValue != null) return Number(e.previousScaleValue);
  if (obj.scale_current != null) return Number(obj.scale_current);
  return null;
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
  const previous =
    byObjective[String(obj.id)]?.previousScaleValue != null
      ? byObjective[String(obj.id)].previousScaleValue
      : obj.scale_current != null
        ? Number(obj.scale_current)
        : null;
  const target = obj.scale_target != null ? Number(obj.scale_target) : null;
  const progressLabel = computeProgressLabel({
    previousValue: previous,
    newValue: n,
    target
  });
  byObjective[String(obj.id)] = {
    objectiveId: Number(obj.id),
    goalId: Number(goal.id),
    goalText: goal.goal_text || '',
    objectiveText: obj.objective_text || '',
    scaleValue: n,
    scaleTarget: target,
    previousScaleValue: previous,
    disposition: 'rated',
    progressLabel
  };
  emitAll();
}

function setDisposition(obj, goal, disposition) {
  const previous =
    obj.scale_current != null ? Number(obj.scale_current) : null;
  byObjective[String(obj.id)] = {
    objectiveId: Number(obj.id),
    goalId: Number(goal.id),
    goalText: goal.goal_text || '',
    objectiveText: obj.objective_text || '',
    scaleValue: null,
    scaleTarget: obj.scale_target != null ? Number(obj.scale_target) : null,
    previousScaleValue: previous,
    disposition,
    progressLabel: null
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
      if (!ids.has(key)) delete byObjective[key];
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
.na-scale-btn.goal {
  background: #16a34a;
  border-color: #15803d;
  color: #fff;
}
.na-scale-btn.last:not(.selected) {
  box-shadow: inset 0 0 0 2px #0f766e;
}
.na-scale-btn.selected {
  outline: 2px solid #0f766e;
  outline-offset: 1px;
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
