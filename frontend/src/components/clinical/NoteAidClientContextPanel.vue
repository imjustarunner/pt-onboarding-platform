<template>
  <aside class="na-client-ctx" aria-label="Client clinical context">
    <div class="na-client-ctx-tabs">
      <button
        type="button"
        :class="{ active: tab === 'intake' }"
        @click="tab = 'intake'"
      >
        Intake
      </button>
      <button
        type="button"
        :class="{ active: tab === 'demographics' }"
        @click="tab = 'demographics'"
      >
        Demographics
      </button>
      <button
        type="button"
        :class="{ active: tab === 'goals' }"
        @click="tab = 'goals'"
      >
        Treatment Goals
      </button>
    </div>

    <div v-if="!clientId" class="na-client-ctx-empty">
      Select an active client under Client Initials to load intake, demographics, and treatment goals.
    </div>

    <template v-else-if="tab === 'intake'">
      <div v-if="loadingIntake" class="na-client-ctx-empty">Loading intake…</div>
      <div v-else-if="intakeError" class="na-client-ctx-empty error">{{ intakeError }}</div>
      <template v-else-if="intakeLocked">
        <div class="na-locked-banner" role="status">
          <strong>Intake on file</strong>
          <p>One-time chart import is complete. Future intake updates happen through sessions and chart notes.</p>
        </div>
        <div v-if="primaryDiagnosis" class="na-client-ctx-dx">
          <strong>Primary dx</strong>
          <code>{{ primaryDiagnosis.icd10_code }}</code>
          <span>{{ primaryDiagnosis.description || '' }}</span>
        </div>
        <details v-if="intakeSummary" class="na-locked-preview">
          <summary>Preview intake on file</summary>
          <p class="na-client-ctx-intake">{{ intakeSummary }}</p>
        </details>
        <div class="na-client-ctx-actions">
          <button type="button" class="na-btn-outline" @click="$emit('use-intake')">
            Use intake to inform plan
          </button>
          <button type="button" class="na-link-btn" @click="$emit('open-chart-intake')">
            Open chart intake
          </button>
        </div>
      </template>
      <template v-else>
        <div v-if="primaryDiagnosis" class="na-client-ctx-dx">
          <strong>Primary dx</strong>
          <code>{{ primaryDiagnosis.icd10_code }}</code>
          <span>{{ primaryDiagnosis.description || '' }}</span>
          <p v-if="primaryDiagnosis.justification">{{ primaryDiagnosis.justification }}</p>
        </div>
        <p v-if="intakeSummary" class="na-client-ctx-intake">{{ intakeSummary }}</p>
        <p v-else class="na-client-ctx-empty">No intake on file yet — paste below to import (one-time).</p>

        <label class="na-paste-label">
          Paste intake note (optional)
          <textarea
            :value="pastedIntakeText"
            rows="4"
            class="na-textarea"
            placeholder="Paste intake / assessment text to review and save to the chart…"
            @input="$emit('update:pastedIntakeText', $event.target.value)"
          />
        </label>

        <div class="na-client-ctx-actions">
          <button
            type="button"
            class="na-btn-primary"
            :disabled="!String(pastedIntakeText || '').trim()"
            @click="$emit('import-intake')"
          >
            Review &amp; import intake
          </button>
          <button
            type="button"
            class="na-btn-outline"
            :disabled="!intakeSummary"
            @click="$emit('use-intake')"
          >
            Use intake to inform plan
          </button>
          <button type="button" class="na-link-btn" @click="$emit('open-chart-intake')">
            Open chart intake
          </button>
        </div>
      </template>
    </template>

    <template v-else-if="tab === 'demographics'">
      <p v-if="clientName" class="na-client-ctx-hint">
        Chart client:
        <a
          v-if="clientProfileHref"
          class="na-client-profile-link"
          :href="clientProfileHref"
          target="_blank"
          rel="noopener noreferrer"
        >{{ clientName }}</a>
        <strong v-else>{{ clientName }}</strong>
      </p>

      <template v-if="demographicsLocked">
        <div class="na-locked-banner" role="status">
          <strong>Demographics saved to chart</strong>
          <p>
            Encrypted demographics are on file. This one-time paste import is locked —
            update demographics from the client chart when needed.
          </p>
        </div>
        <ul v-if="demographicsPreview.length" class="na-demo-preview">
          <li v-for="row in demographicsPreview" :key="row.label">
            <span>{{ row.label }}</span>
            <strong>{{ row.value }}</strong>
          </li>
        </ul>
        <div class="na-client-ctx-actions">
          <a
            v-if="clientProfileHref"
            class="na-btn-outline na-btn-as-link"
            :href="clientProfileHref + (clientProfileHref.includes('?') ? '&' : '?') + 'tab=demographics'"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open chart demographics
          </a>
        </div>
      </template>
      <template v-else>
        <p class="na-client-ctx-hint">
          Paste chart demographics here (one-time). Values are encrypted at rest and are not sent to AI note generation.
        </p>
        <label class="na-paste-label">
          Paste demographics text
          <textarea
            :value="pastedDemographicsText"
            rows="5"
            class="na-textarea"
            placeholder="Legal Name&#10;Date of Birth&#10;Address&#10;Phone&#10;Email…"
            @input="$emit('update:pastedDemographicsText', $event.target.value)"
          />
        </label>
        <div class="na-client-ctx-actions">
          <button
            type="button"
            class="na-btn-primary"
            :disabled="!String(pastedDemographicsText || '').trim()"
            @click="$emit('import-demographics')"
          >
            Review &amp; encrypt to chart
          </button>
        </div>
      </template>
    </template>

    <template v-else>
      <div v-if="loadingPlan" class="na-client-ctx-empty">Loading treatment plan…</div>
      <div v-else-if="planError" class="na-client-ctx-empty error">{{ planError }}</div>
      <template v-else-if="planLocked">
        <div class="na-locked-banner" role="status">
          <strong>Treatment plan on file</strong>
          <p>
            One-time import is complete. Updates go through the treatment plan updater and session progress ratings.
          </p>
        </div>
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
        <div class="na-client-ctx-actions">
          <button type="button" class="na-btn-outline" @click="$emit('open-updater')">
            Open treatment plan updater
          </button>
        </div>
      </template>
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
        <p v-else class="na-client-ctx-empty">No structured treatment plan on file — paste below to import (one-time).</p>

        <label class="na-paste-label">
          Paste running treatment plan text (optional)
          <textarea
            :value="pastedPlanText"
            rows="4"
            class="na-textarea"
            placeholder="Paste an existing treatment plan if none is on file…"
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
        </div>
      </template>
    </template>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  clientId: { type: [Number, String, null], default: null },
  goals: { type: Array, default: () => [] },
  loadingPlan: { type: Boolean, default: false },
  planError: { type: String, default: '' },
  pastedPlanText: { type: String, default: '' },
  pastedIntakeText: { type: String, default: '' },
  pastedDemographicsText: { type: String, default: '' },
  loadingIntake: { type: Boolean, default: false },
  intakeError: { type: String, default: '' },
  intakeSummary: { type: String, default: '' },
  primaryDiagnosis: { type: Object, default: null },
  clientName: { type: String, default: '' },
  clientProfileHref: { type: String, default: '' },
  demographicsOnFile: { type: Boolean, default: false },
  demographicsPreview: { type: Array, default: () => [] },
  intakeOnFile: { type: Boolean, default: false },
  planOnFile: { type: Boolean, default: false }
});

defineEmits([
  'update:pastedPlanText',
  'update:pastedIntakeText',
  'update:pastedDemographicsText',
  'open-updater',
  'use-intake',
  'open-chart-intake',
  'import-plan',
  'import-intake',
  'import-demographics'
]);

const tab = ref('intake');

const demographicsLocked = computed(() => !!props.demographicsOnFile);
const intakeLocked = computed(() => !!props.intakeOnFile);
const planLocked = computed(() => !!props.planOnFile);

defineExpose({
  switchTab(next) {
    if (['intake', 'demographics', 'goals'].includes(next)) tab.value = next;
  }
});

watch(
  () => props.clientId,
  () => {
    tab.value = 'intake';
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
  flex-wrap: wrap;
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
.na-client-ctx-empty,
.na-client-ctx-hint {
  color: #64748b;
  font-size: 0.88rem;
  margin: 0 0 8px;
  line-height: 1.4;
}
.na-client-ctx-empty.error { color: #b91c1c; }
.na-client-profile-link {
  color: #0f766e;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.na-locked-banner {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
  color: #065f46;
}
.na-locked-banner strong { display: block; margin-bottom: 4px; }
.na-locked-banner p { margin: 0; font-size: 0.82rem; line-height: 1.4; }
.na-locked-preview { margin: 8px 0; font-size: 0.85rem; }
.na-locked-preview summary { cursor: pointer; font-weight: 600; color: #0f766e; }
.na-demo-preview {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.na-demo-preview li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.82rem;
  padding: 6px 8px;
  background: #f8fafc;
  border-radius: 8px;
}
.na-demo-preview span { color: #64748b; }
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
  box-sizing: border-box;
}
.na-client-ctx-actions {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.na-btn-primary,
.na-btn-outline,
.na-link-btn,
.na-btn-as-link {
  border-radius: 10px;
  font-weight: 700;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.82rem;
  width: auto;
  flex: 0 1 auto;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.na-btn-primary {
  border: none;
  background: #0f766e;
  color: #fff;
}
.na-btn-primary:disabled,
.na-btn-outline:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.na-btn-outline,
.na-btn-as-link {
  border: 1px solid #0f766e;
  background: #fff;
  color: #0d5f59;
}
.na-link-btn {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #334155;
}
.na-client-ctx-intake {
  white-space: pre-wrap;
  font-size: 0.85rem;
  line-height: 1.45;
  max-height: 200px;
  overflow: auto;
  margin: 0 0 8px;
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
.na-client-ctx-dx code { font-weight: 700; }
.na-client-ctx-dx p {
  flex-basis: 100%;
  margin: 4px 0 0;
  white-space: pre-wrap;
  color: #047857;
}
</style>
