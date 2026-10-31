<template>
  <div class="acp" data-testid="appointment-clinical-panel">
    <div class="acp-main">
      <section class="acp-card acp-documentation">
        <header class="acp-card-head">
          <span class="acp-card-title">Clinical overview</span>
        </header>
        <p class="acp-hint muted">Review this client’s diagnoses and current treatment plan here. Write or dictate this appointment’s source text in Session note, then review and sign the linked draft in Note Workspace.</p>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="disabled" @click="emit('open-session-note')">Open Session note</button>
      </section>

      <section class="acp-card">
        <header class="acp-card-head">
          <span class="acp-card-title">Treatment plan — most recent</span>
          <button
            v-if="latestPlan"
            type="button"
            class="acp-text-btn"
            @click="emit('open-treatment-plan')"
          >
            Open treatment plan
          </button>
        </header>
        <div v-if="chartLoading" class="muted">Loading treatment plan…</div>
        <template v-else-if="primaryGoal">
          <div class="acp-goal">
            <strong>Goal {{ primaryGoal.goal_index || primaryGoal.goalIndex || 1 }}:</strong>
            {{ primaryGoal.goal_text || primaryGoal.goalText || '—' }}
          </div>
          <ul v-if="primaryObjectives.length" class="acp-objectives">
            <li v-for="(o, idx) in primaryObjectives" :key="o.id || idx">
              {{ o.objective_text || o.objectiveText || '—' }}
            </li>
          </ul>
          <div v-if="planMeta" class="acp-meta muted">{{ planMeta }}</div>
        </template>
        <p v-else class="muted">No treatment plan on file for this client yet.</p>
      </section>
    </div>

    <div class="acp-side">
      <section class="acp-card">
        <header class="acp-card-head">
          <span class="acp-card-title">Diagnoses</span>
        </header>
        <div v-if="chartLoading" class="muted">Loading…</div>
        <ul v-else-if="diagnoses.length" class="acp-dx-list">
          <li v-for="d in diagnoses" :key="d.id">
            <strong>{{ d.icd10_code || d.icd10Code }}</strong>
            <span>{{ d.description || '' }}</span>
          </li>
        </ul>
        <p v-else class="muted">No active diagnoses on the chart.</p>
      </section>

    </div>

    <div class="acp-note-bar">
      <div>
        <strong>View the full clinical note</strong>
        <span class="muted">Open the complete note with all details.</span>
      </div>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="!clinicalNoteId && !clinicalSessionId"
        @click="emit('open-note')"
      >
        Open clinical note
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  diagnoses: { type: Array, default: () => [] },
  latestPlan: { type: Object, default: null },
  chartLoading: { type: Boolean, default: false },
  clinicalSessionId: { type: [Number, String], default: 0 },
  clinicalNoteId: { type: [Number, String], default: 0 },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(['open-session-note', 'open-treatment-plan', 'open-note']);

const primaryGoal = computed(() => {
  const goals = props.latestPlan?.goals || [];
  return goals[0] || null;
});
const primaryObjectives = computed(() => {
  const objs = primaryGoal.value?.objectives || [];
  return Array.isArray(objs) ? objs.slice(0, 4) : [];
});
const planMeta = computed(() => {
  const p = props.latestPlan;
  if (!p) return '';
  const created = String(p.created_at || p.createdAt || '').slice(0, 10);
  const bits = [];
  if (created) bits.push(`Created: ${created}`);
  if (p.status) bits.push(`Status: ${p.status}`);
  return bits.join(' · ');
});

</script>

<style scoped>
.acp {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 12px;
}
.acp-main,
.acp-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.acp-card {
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #fff;
  padding: 12px 14px;
}
.acp-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.acp-card-title {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #475569;
}
.acp-pill {
  font-size: 0.68rem;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
}
.acp-pill.live {
  background: #fee2e2;
  color: #b91c1c;
}
.acp-dictate-box {
  display: flex;
  gap: 10px;
  align-items: stretch;
}
.acp-mic {
  flex: 0 0 auto;
  width: 42px;
  border: none;
  border-radius: 10px;
  background: #ede9fe;
  color: #6d28d9;
  font-size: 1.1rem;
  cursor: pointer;
}
.acp-mic.on {
  background: #fee2e2;
  color: #b91c1c;
}
.acp-mic:disabled { opacity: 0.45; cursor: not-allowed; }
.acp-textarea,
.acp-select {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  background: #fff;
  color: #0f172a;
}
.acp-textarea { resize: vertical; min-height: 96px; }
.acp-dictate-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  font-size: 0.78rem;
}
.acp-hint { margin: 6px 0 0; font-size: 0.78rem; }
.acp-text-btn {
  appearance: none;
  border: none;
  background: none;
  color: #6d28d9;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.acp-goal {
  font-size: 0.88rem;
  color: #0f172a;
  line-height: 1.4;
}
.acp-objectives {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 0.82rem;
  color: #334155;
}
.acp-meta { margin-top: 10px; font-size: 0.75rem; }
.acp-dx-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.acp-dx-list li {
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 0.82rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.acp-dx-list strong { color: #0f172a; }
.acp-trend-empty { margin: 0; font-size: 0.82rem; line-height: 1.4; }
.acp-note-bar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #e9e5ff;
  background: #faf5ff;
}
.acp-note-bar strong {
  display: block;
  font-size: 0.9rem;
  color: #0f172a;
}
.acp-note-bar .muted {
  display: block;
  margin-top: 2px;
  font-size: 0.78rem;
}
.muted { color: #64748b; }
.error { color: #b91c1c; }
@media (max-width: 720px) {
  .acp { grid-template-columns: 1fr; }
  .acp-note-bar { flex-direction: column; align-items: stretch; }
}
</style>
