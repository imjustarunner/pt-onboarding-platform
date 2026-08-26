<template>
  <aside class="na-client-ctx" aria-label="Client clinical context">
    <div class="na-client-ctx-tabs">
      <button
        type="button"
        :class="{ active: tab === 'goals' }"
        @click="tab = 'goals'"
      >
        Treatment Goals
      </button>
      <button
        type="button"
        :class="{ active: tab === 'intake' }"
        @click="tab = 'intake'"
      >
        Intake
      </button>
    </div>

    <div v-if="!clientId" class="na-client-ctx-empty">
      Select an active client under Client Initials to load treatment goals and intake.
    </div>

    <template v-else-if="tab === 'goals'">
      <div v-if="loadingPlan" class="na-client-ctx-empty">Loading treatment plan…</div>
      <div v-else-if="planError" class="na-client-ctx-empty error">{{ planError }}</div>
      <template v-else>
        <div v-if="goals.length" class="na-client-ctx-list">
          <article v-for="g in goals" :key="g.id" class="na-client-ctx-card">
            <strong>G{{ g.goal_index }} · {{ g.goal_text }}</strong>
            <ul>
              <li v-for="o in g.objectives || []" :key="o.id">
                O{{ o.objective_index }}: {{ o.objective_text }}
                <em v-if="o.scale_current != null || o.scale_target != null">
                  ({{ o.scale_current ?? '—' }} → {{ o.scale_target ?? '—' }})
                </em>
              </li>
            </ul>
          </article>
        </div>
        <p v-else class="na-client-ctx-empty">No structured treatment plan on file.</p>

        <label class="na-paste-label">
          Paste running treatment plan text (optional)
          <textarea
            :value="pastedPlanText"
            rows="4"
            class="na-textarea"
            placeholder="Paste an existing treatment plan if none is on file, or to override for this session…"
            @input="$emit('update:pastedPlanText', $event.target.value)"
          />
        </label>

        <div class="na-client-ctx-actions">
          <button
            type="button"
            class="na-btn-primary"
            :disabled="!String(pastedPlanText || '').trim()"
            @click="$emit('import-plan')"
          >
            Review &amp; save to chart
          </button>
          <button type="button" class="na-btn-outline" @click="$emit('open-updater')">
            Open treatment plan updater
          </button>
          <button type="button" class="na-btn-outline" @click="$emit('import-plan')">
            Import treatment plan
          </button>
          <button type="button" class="na-btn-outline" @click="$emit('import-demographics')">
            Import demographics
          </button>
        </div>
      </template>
    </template>

    <template v-else>
      <div v-if="loadingIntake" class="na-client-ctx-empty">Loading intake…</div>
      <div v-else-if="intakeError" class="na-client-ctx-empty error">{{ intakeError }}</div>
      <template v-else>
        <div v-if="primaryDiagnosis" class="na-client-ctx-dx">
          <strong>Primary dx</strong>
          <code>{{ primaryDiagnosis.icd10_code }}</code>
          <span>{{ primaryDiagnosis.description || '' }}</span>
          <p v-if="primaryDiagnosis.justification">{{ primaryDiagnosis.justification }}</p>
        </div>
        <p v-if="intakeSummary" class="na-client-ctx-intake">{{ intakeSummary }}</p>
        <p v-else class="na-client-ctx-empty">No intake copy blocks available for this client.</p>
        <div class="na-client-ctx-actions">
          <button
            type="button"
            class="na-btn-outline"
            :disabled="!intakeSummary"
            @click="$emit('use-intake')"
          >
            Use intake to inform plan
          </button>
          <button type="button" class="na-btn-outline" @click="$emit('import-intake')">
            Import intake
          </button>
          <button type="button" class="na-link-btn" @click="$emit('open-chart-intake')">
            Open chart intake
          </button>
        </div>
      </template>
    </template>
  </aside>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  clientId: { type: [Number, String, null], default: null },
  goals: { type: Array, default: () => [] },
  loadingPlan: { type: Boolean, default: false },
  planError: { type: String, default: '' },
  pastedPlanText: { type: String, default: '' },
  loadingIntake: { type: Boolean, default: false },
  intakeError: { type: String, default: '' },
  intakeSummary: { type: String, default: '' },
  primaryDiagnosis: { type: Object, default: null }
});

defineEmits(['update:pastedPlanText', 'open-updater', 'use-intake', 'open-chart-intake', 'import-plan', 'import-intake', 'import-demographics']);

const tab = ref('goals');

watch(
  () => props.clientId,
  () => {
    tab.value = 'goals';
  }
);
</script>

<style scoped>
.na-client-ctx {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  padding: 12px;
  margin-bottom: 14px;
}
.na-client-ctx-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.na-client-ctx-tabs button {
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  color: #334155;
}
.na-client-ctx-tabs button.active {
  background: #ccfbf1;
  border-color: #0f766e;
  color: #0d5f59;
}
.na-client-ctx-empty {
  color: #64748b;
  font-size: 0.88rem;
  margin: 0;
}
.na-client-ctx-empty.error {
  color: #b91c1c;
}
.na-client-ctx-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow: auto;
  margin-bottom: 10px;
}
.na-client-ctx-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  font-size: 0.85rem;
}
.na-client-ctx-card ul {
  margin: 6px 0 0;
  padding-left: 18px;
  color: #475569;
}
.na-client-ctx-card em {
  color: #0f766e;
  font-style: normal;
  font-weight: 600;
}
.na-paste-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: #334155;
  margin-top: 8px;
}
.na-textarea {
  width: 100%;
  margin-top: 4px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  min-height: 80px;
  resize: vertical;
}
.na-client-ctx-actions {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.na-btn-primary {
  border: none;
  background: #0f766e;
  color: #fff;
  border-radius: 10px;
  font-weight: 700;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.82rem;
}
.na-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.na-btn-outline {
  border: 1px solid #0f766e;
  background: #fff;
  color: #0d5f59;
  border-radius: 10px;
  font-weight: 700;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.82rem;
}
.na-btn-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.na-client-ctx-intake {
  white-space: pre-wrap;
  font-size: 0.85rem;
  line-height: 1.45;
  max-height: 280px;
  overflow: auto;
  margin: 0;
  color: #0f172a;
}
.na-client-ctx-dx {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  font-size: 0.82rem;
  color: #065f46;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: baseline;
}
.na-client-ctx-dx code {
  font-weight: 700;
}
.na-client-ctx-dx p {
  flex-basis: 100%;
  margin: 4px 0 0;
  white-space: pre-wrap;
  color: #047857;
}
</style>
