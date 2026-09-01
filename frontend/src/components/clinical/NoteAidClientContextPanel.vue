<template>
  <aside class="na-client-ctx" aria-label="Client clinical context">
    <div v-if="!clientId" class="na-client-ctx-empty">
      Select an active client under Client Initials to load intake, demographics, and treatment goals.
    </div>

    <template v-else>
      <!-- Always-visible compact chart strip (diagnoses expandable) -->
      <div class="na-chart-strip">
        <div class="na-chart-strip-head">
          <div>
            <span class="na-chart-kicker">Chart client</span>
            <a
              v-if="clientProfileHref && clientName"
              class="na-client-profile-link"
              :href="clientProfileHref"
              target="_blank"
              rel="noopener noreferrer"
            >{{ clientName }}</a>
            <strong v-else-if="clientName">{{ clientName }}</strong>
            <span v-else class="muted">Linked client</span>
          </div>
          <span class="na-chart-status" :class="setupComplete ? 'ok' : 'pending'">
            {{ setupComplete ? 'Setup complete' : setupStatusLabel }}
          </span>
        </div>

        <details class="na-dx-details" :open="diagnosesOpenDefault">
          <summary>
            <span v-if="activeDiagnoses.length">
              Diagnoses ({{ activeDiagnoses.length }})
              <template v-if="primaryDiagnosis">
                · primary <code>{{ primaryDiagnosis.icd10_code }}</code>
              </template>
            </span>
            <span v-else>No diagnoses on chart yet</span>
          </summary>
          <ul v-if="activeDiagnoses.length" class="na-dx-list">
            <li v-for="dx in activeDiagnoses" :key="dx.id || dx.icd10_code">
              <code>{{ dx.icd10_code }}</code>
              <span>{{ dx.description || '' }}</span>
              <em v-if="Number(dx.is_primary) === 1">Primary</em>
            </li>
          </ul>
          <p v-else class="na-client-ctx-hint">
            Finalize an intake or add diagnoses on the chart so session notes can attach them.
          </p>
          <p
            v-if="primaryDiagnosis?.justification"
            class="na-dx-just"
          >{{ primaryDiagnosis.justification }}</p>
        </details>

        <details class="na-chart-details" :open="!setupComplete">
          <summary>
            {{ setupComplete ? 'Initial chart info (expand if needed)' : 'Finish initial chart setup' }}
          </summary>

          <template v-if="setupComplete">
            <div class="na-locked-banner" role="status">
              <strong>Chart setup complete</strong>
              <p>
                Intake, demographics, and treatment plan are on file.
                Paste import stays hidden — updates go through the chart, sessions, and treatment plan updater.
              </p>
            </div>
            <details v-if="clinicalIntakePreview" class="na-locked-preview">
              <summary>Preview intake on file</summary>
              <p class="na-client-ctx-intake">{{ clinicalIntakePreview }}</p>
            </details>
            <div class="na-client-ctx-actions">
              <button type="button" class="na-btn-outline" @click="$emit('use-intake')">
                Use intake to inform plan
              </button>
              <button type="button" class="na-btn-outline" @click="$emit('open-updater')">
                Open treatment plan updater
              </button>
              <button type="button" class="na-link-btn" @click="$emit('open-chart-intake')">
                Open chart intake
              </button>
            </div>
          </template>

          <template v-else>
            <p class="na-client-ctx-hint">
              Recommended order: Demographics → Intake → Treatment Goals. You can complete them in any order — each step stays independent. When both intake and a treatment plan exist, the treatment plan’s diagnosis, presenting problem, and diagnostic justification take precedence.
            </p>
            <div class="na-client-ctx-tabs">
              <button
                type="button"
                :class="{ active: tab === 'demographics' }"
                @click="tab = 'demographics'"
              >
                Demographics{{ demographicsLocked ? ' ✓' : '' }}
              </button>
              <button
                type="button"
                :class="{ active: tab === 'intake' }"
                @click="tab = 'intake'"
              >
                Intake{{ intakeLocked ? ' ✓' : '' }}
              </button>
              <button
                type="button"
                :class="{ active: tab === 'goals' }"
                @click="tab = 'goals'"
              >
                Treatment Goals{{ planLocked ? ' ✓' : '' }}
              </button>
            </div>

            <template v-if="tab === 'intake'">
              <div v-if="loadingIntake" class="na-client-ctx-empty">Loading intake…</div>
              <div v-else-if="intakeError" class="na-client-ctx-empty error">{{ intakeError }}</div>
              <template v-else-if="intakeLocked">
                <div class="na-locked-banner" role="status">
                  <strong>Intake on file</strong>
                  <p>One-time chart import is complete. Future intake updates happen through sessions and chart notes.</p>
                </div>
                <details v-if="clinicalIntakePreview" class="na-locked-preview">
                  <summary>Preview intake on file</summary>
                  <p class="na-client-ctx-intake">{{ clinicalIntakePreview }}</p>
                </details>
                <div class="na-client-ctx-actions">
                  <button type="button" class="na-btn-outline" @click="$emit('use-intake')">
                    Use intake to inform plan
                  </button>
                  <button type="button" class="na-btn-outline" @click="$emit('import-intake')">
                    Replace intake import
                  </button>
                  <button type="button" class="na-link-btn" @click="$emit('open-chart-intake')">
                    Open chart intake
                  </button>
                </div>
                <p class="na-client-ctx-hint">
                  Use Replace only while finishing initial chart setup — it overwrites the imported intake on file.
                </p>
              </template>
              <template v-else>
                <p v-if="clinicalIntakePreview" class="na-client-ctx-intake">{{ clinicalIntakePreview }}</p>
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
                    :disabled="!clinicalIntakePreview"
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
          </template>
        </details>
      </div>
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
  diagnoses: { type: Array, default: () => [] },
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
const setupComplete = computed(
  () => demographicsLocked.value && intakeLocked.value && planLocked.value
);

const setupStatusLabel = computed(() => {
  const missing = [];
  // Recommended order for the status chip (steps remain independently completable).
  if (!demographicsLocked.value) missing.push('demographics');
  if (!intakeLocked.value) missing.push('intake');
  if (!planLocked.value) missing.push('plan');
  return missing.length ? `Need: ${missing.join(', ')}` : 'In progress';
});

const activeDiagnoses = computed(() => {
  const list = Array.isArray(props.diagnoses) ? props.diagnoses : [];
  const active = list.filter((d) => d && (d.is_active == null || Number(d.is_active) === 1));
  if (active.length) {
    return [...active].sort((a, b) => Number(b.is_primary || 0) - Number(a.is_primary || 0));
  }
  if (props.primaryDiagnosis) return [props.primaryDiagnosis];
  return [];
});

const diagnosesOpenDefault = computed(() => !activeDiagnoses.value.length);

/** Clinical / narrative only — never demographics PHI in this preview. */
const clinicalIntakePreview = computed(() => {
  const raw = String(props.intakeSummary || '').trim();
  if (!raw) return '';
  // Strip a leading Demographics block if an older payload still includes it.
  const withoutDemo = raw
    .replace(/^Demographics\n[\s\S]*?(?=\n\n(?:Clinical \(de-identified\)|Intake narrative)|$)/i, '')
    .replace(/\n\nDemographics\n[\s\S]*?(?=\n\n(?:Clinical \(de-identified\)|Intake narrative)|$)/i, '')
    .trim();
  return withoutDemo || raw;
});

defineExpose({
  switchTab(next) {
    if (['intake', 'demographics', 'goals'].includes(next)) tab.value = next;
  }
});

function focusFirstIncompleteSetupTab() {
  if (setupComplete.value) return;
  if (!props.demographicsOnFile) tab.value = 'demographics';
  else if (!props.intakeOnFile) tab.value = 'intake';
  else if (!props.planOnFile) tab.value = 'goals';
}

watch(
  () => props.clientId,
  () => {
    focusFirstIncompleteSetupTab();
  }
);

watch(
  () => [props.demographicsOnFile, props.intakeOnFile, props.planOnFile],
  () => {
    // When a step completes, advance to the next missing one (don't yank away if already there).
    if (setupComplete.value) return;
    if (tab.value === 'demographics' && props.demographicsOnFile && !props.intakeOnFile) {
      tab.value = 'intake';
      return;
    }
    if (tab.value === 'intake' && props.intakeOnFile && !props.planOnFile) {
      tab.value = 'goals';
      return;
    }
    if (tab.value === 'goals' && props.planOnFile && !props.intakeOnFile) {
      tab.value = 'intake';
    }
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
.na-chart-strip-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.na-chart-kicker {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  margin-bottom: 2px;
}
.na-chart-status {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.na-chart-status.ok { background: #dcfce7; color: #166534; }
.na-chart-status.pending { background: #fef3c7; color: #92400e; }
.na-dx-details,
.na-chart-details,
.na-locked-preview {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  margin-top: 8px;
  background: #f8fafc;
}
.na-dx-details summary,
.na-chart-details summary,
.na-locked-preview summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 0.86rem;
  color: #0f766e;
  list-style: none;
}
.na-dx-details summary::-webkit-details-marker,
.na-chart-details summary::-webkit-details-marker,
.na-locked-preview summary::-webkit-details-marker {
  display: none;
}
.na-dx-details summary::before,
.na-chart-details summary::before,
.na-locked-preview summary::before {
  content: '▸ ';
  color: #64748b;
}
.na-dx-details[open] summary::before,
.na-chart-details[open] summary::before,
.na-locked-preview[open] summary::before {
  content: '▾ ';
}
.na-dx-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.na-dx-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: baseline;
  font-size: 0.86rem;
}
.na-dx-list code {
  background: #ecfdf5;
  color: #0f766e;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 700;
}
.na-dx-list em {
  font-style: normal;
  font-size: 0.72rem;
  font-weight: 700;
  color: #166534;
  background: #dcfce7;
  padding: 1px 6px;
  border-radius: 999px;
}
.na-dx-just {
  margin: 8px 0 0;
  font-size: 0.82rem;
  color: #475569;
  white-space: pre-wrap;
}
.na-client-ctx-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0;
}
.na-client-ctx-tabs button {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  color: #334155;
}
.na-client-ctx-tabs button.active {
  background: #ccfbf1;
  border-color: #5eead4;
  color: #0f766e;
}
.na-client-ctx-empty { color: #64748b; font-size: 0.88rem; margin: 0; }
.na-client-ctx-empty.error { color: #b91c1c; }
.na-client-ctx-hint { font-size: 0.84rem; color: #475569; margin: 8px 0; }
.na-client-profile-link { color: #0f766e; font-weight: 700; }
.na-client-ctx-intake {
  white-space: pre-wrap;
  font-size: 0.84rem;
  color: #334155;
  margin: 8px 0 0;
  max-height: 220px;
  overflow: auto;
}
.na-locked-banner {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  padding: 10px 12px;
  margin: 8px 0;
}
.na-locked-banner strong { display: block; color: #065f46; }
.na-locked-banner p { margin: 4px 0 0; font-size: 0.84rem; color: #047857; }
.na-client-ctx-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.na-btn-primary,
.na-btn-outline,
.na-link-btn {
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  padding: 7px 12px;
}
.na-btn-primary {
  background: #0f766e;
  color: #fff;
  border: 1px solid #0f766e;
}
.na-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.na-btn-outline {
  background: #fff;
  color: #0f766e;
  border: 1px solid #99f6e4;
}
.na-btn-as-link {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}
.na-link-btn {
  background: transparent;
  border: none;
  color: #0f766e;
  padding: 7px 4px;
}
.na-paste-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
  font-weight: 600;
  margin: 8px 0;
}
.na-textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  resize: vertical;
}
.na-demo-preview {
  list-style: none;
  margin: 8px 0;
  padding: 0;
}
.na-demo-preview li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.84rem;
  padding: 4px 0;
  border-bottom: 1px solid #f1f5f9;
}
.na-client-ctx-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.na-client-ctx-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  background: #fff;
  font-size: 0.84rem;
}
.na-client-ctx-card ul { margin: 6px 0 0; padding-left: 18px; }
.muted { color: #64748b; }
</style>
