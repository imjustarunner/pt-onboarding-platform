<template>
  <div class="dw-page">
    <div v-if="loading" class="dw-state">Loading Digital Wellness Assessment…</div>
    <div v-else-if="error" class="dw-state error">{{ error }}</div>

    <template v-else-if="template">
      <section v-if="step === 'welcome'" class="dw-shell dw-shell--narrow">
        <p class="dw-eyebrow">Digital Wellness Assessment</p>
        <h1 class="dw-title">Is Technology Working for You?</h1>
        <p class="dw-lead">
          Digital tools can help you connect, learn, create, work, play, and relax. They can also interrupt sleep,
          focus, movement, relationships, and recovery.
        </p>
        <p class="dw-note">
          This assessment is not about eliminating technology. It is about understanding whether your digital habits
          support the life you want.
        </p>
        <p class="dw-meta">12 to 18 minutes · Digital Wellness Grid</p>
        <div class="dw-actions">
          <button type="button" class="dw-btn primary" @click="step = 'context'">
            Explore My Digital Wellness
          </button>
          <button type="button" class="dw-btn ghost" @click="step = 'how'">How This Assessment Works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="dw-shell dw-shell--narrow">
        <h1 class="dw-title">How This Assessment Works</h1>
        <ol class="dw-bullets">
          <li>Share optional context about devices, concerns, and goals.</li>
          <li>Rate Current Wellness—and Intentional Control when helpful—for each domain.</li>
          <li>Watch your Digital Wellness Grid take shape.</li>
          <li>Review friction areas, balanced habits, and choose priorities.</li>
          <li>Translate one to three areas into environmental changes and small experiments.</li>
        </ol>
        <p class="dw-clarify">{{ template.settings?.disclaimer }}</p>
        <div class="dw-actions">
          <button type="button" class="dw-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="dw-btn primary" @click="step = 'context'">Continue</button>
        </div>
      </section>

      <section v-else-if="step === 'context'" class="dw-shell dw-shell--narrow">
        <p class="dw-eyebrow">Before you begin</p>
        <h1 class="dw-title">Your digital context</h1>

        <p class="dw-field-label">Participant version</p>
        <div class="dw-mode-grid">
          <button
            v-for="v in PARTICIPANT_VERSION_OPTIONS"
            :key="v.id"
            type="button"
            class="dw-mode"
            :class="{ on: participantVersion === v.id }"
            @click="participantVersion = v.id"
          >
            <strong>{{ v.label }}</strong>
            <span>{{ v.description }}</span>
          </button>
        </div>

        <p class="dw-field-label">Assessment mode</p>
        <div class="dw-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="dw-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>

        <label class="dw-field">
          Assessment timeframe
          <select v-model="timeframe">
            <option v-for="o in TIMEFRAME_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>

        <p class="dw-field-label">Primary digital environment (optional)</p>
        <div class="dw-chips">
          <button
            v-for="d in PRIMARY_DEVICE_OPTIONS"
            :key="d"
            type="button"
            class="dw-chip"
            :class="{ on: primaryDevices.includes(d) }"
            @click="toggleList(primaryDevices, d)"
          >
            {{ d }}
          </button>
        </div>

        <p class="dw-field-label">Current concern (optional)</p>
        <div class="dw-chips">
          <button
            v-for="c in CURRENT_CONCERN_OPTIONS"
            :key="c"
            type="button"
            class="dw-chip"
            :class="{ on: concerns.includes(c) }"
            @click="toggleList(concerns, c)"
          >
            {{ c }}
          </button>
        </div>

        <p class="dw-field-label">Current goal (optional)</p>
        <div class="dw-chips">
          <button
            v-for="g in CURRENT_GOAL_OPTIONS"
            :key="g"
            type="button"
            class="dw-chip"
            :class="{ on: goals.includes(g) }"
            @click="toggleList(goals, g)"
          >
            {{ g }}
          </button>
        </div>

        <label class="dw-field">
          Optional recreational screen time (hours / day) — does not determine your wellness score
          <input v-model.number="recreationalHours" type="number" min="0" max="24" step="0.5" />
        </label>

        <div class="dw-actions">
          <button type="button" class="dw-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="dw-btn primary" @click="startScoring">Begin →</button>
        </div>
      </section>

      <section v-else-if="step === 'score'" class="dw-shell dw-shell--split">
        <header class="dw-header">
          <div>
            <p class="dw-eyebrow">
              {{ scoredCount }} of {{ activeDomains.length }} completed ·
              {{ timeframeLabel }} · {{ saveStatus || 'Ready' }}
            </p>
            <h1 class="dw-title">{{ activeDomain?.label }}</h1>
            <p class="dw-lead">{{ activeDomain?.definition }}</p>
          </div>
          <button
            v-if="settings.enableQuickExit"
            type="button"
            class="dw-btn ghost small"
            @click="quickExit"
          >
            Quick Exit
          </button>
        </header>

        <div class="dw-split">
          <div class="dw-panel">
            <div class="dw-score-block">
              <h2>{{ activeDomain?.primaryQuestion || 'How healthy and intentional does this feel?' }}</h2>
              <div class="dw-scale-labels">
                <span>Frequently Disruptive</span>
                <span>Intentional and Supportive</span>
              </div>
              <div class="dw-scores" role="group" :aria-label="`${activeDomain?.label} current wellness`">
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="dw-score"
                  :class="{ on: wellness === n }"
                  @click="setWellness(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="wellness != null" class="dw-gap-card" role="status" aria-live="polite">
              <p>{{ interpretation }}</p>
              <p class="dw-status-pill">{{ statusLabel }}</p>
              <p class="dw-live">
                {{ activeDomain?.label }} Current Wellness updated to {{ wellness }} out of 10.
                <template v-if="control != null">
                  Intentional Control is {{ control }} out of 10.
                  Digital Friction is categorized as {{ frictionLabel || '—' }}.
                </template>
                Digital Wellness Index is now {{ summary.digitalWellnessIndex ?? '—' }} out of 100.
              </p>
            </div>

            <div v-if="wellness != null && enableControl" class="dw-score-block">
              <h2>How able do you feel to choose, pause, stop, or adjust this behavior when needed?</h2>
              <div class="dw-scale-labels">
                <span>Very Little Control</span>
                <span>Strong, Reliable Control</span>
              </div>
              <div class="dw-scores">
                <button
                  v-for="n in 10"
                  :key="`c-${n}`"
                  type="button"
                  class="dw-score soft"
                  :class="{ on: control === n }"
                  @click="patchResponse(activeKey, { intentionalControlScore: n })"
                >
                  {{ n }}
                </button>
              </div>
              <p v-if="frictionLabel" class="dw-friction">{{ frictionLabel }}</p>
            </div>

            <div v-if="canShowImportance" class="dw-score-block">
              <h2>How important is improving or protecting this area right now?</h2>
              <div class="dw-scale-labels">
                <span>Not a Current Priority</span>
                <span>Very Important</span>
              </div>
              <div class="dw-scores">
                <button
                  v-for="n in 10"
                  :key="`i-${n}`"
                  type="button"
                  class="dw-score soft"
                  :class="{ on: importance === n }"
                  @click="patchResponse(activeKey, { personalImportanceScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="canShowReflections" class="dw-reflect">
              <h2>{{ activeDomain?.reflectionPrompt || 'What most affects this area?' }}</h2>
              <div class="dw-chips">
                <button
                  v-for="chip in activeDomain?.reflectionOptions || []"
                  :key="chip"
                  type="button"
                  class="dw-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>

              <p class="dw-field-label">What value does this activity currently provide? (optional)</p>
              <div class="dw-chips">
                <button
                  v-for="v in VALUE_CATEGORIES"
                  :key="v"
                  type="button"
                  class="dw-chip"
                  :class="{ on: valueProvided.includes(v) }"
                  @click="toggleValue(v)"
                >
                  {{ v }}
                </button>
              </div>

              <label class="dw-field">
                Would support in this area be useful?
                <select
                  :value="supportPreference"
                  @change="patchResponse(activeKey, { supportPreference: $event.target.value })"
                >
                  <option v-for="o in SUPPORT_PREFERENCE_OPTIONS" :key="o.id" :value="o.id">
                    {{ o.label }}
                  </option>
                </select>
              </label>

              <p
                v-if="supportPreference === 'online-safety'"
                class="dw-safety"
              >
                Your response suggests that a private conversation with a qualified support person may be important.
                Online-safety concerns stay separate from ordinary wellness scoring.
              </p>

              <details class="dw-details">
                <summary>Optional private note</summary>
                <textarea
                  :value="privateNote"
                  rows="3"
                  @input="patchResponse(activeKey, { privateNote: $event.target.value })"
                />
              </details>

              <button type="button" class="dw-btn ghost small" @click="markNotRelevant">
                Not relevant in this season
              </button>
            </div>
          </div>

          <aside class="dw-aside">
            <DigitalWellnessGrid
              :domains="activeDomains"
              :responses="responses"
              :digital-wellness-index="summary.digitalWellnessIndex"
              :system-scores="summary.systemScores"
              :active-domain-id="activeKey"
              :selected-priority-domain-ids="priorityKeys"
              :balanced-domain-count="summary.balancedDomainCount"
              :friction-domain-count="summary.frictionDomainCount"
              v-model:display-mode="gridDisplayMode"
              interactive
              animated
              @domain-select="jumpToDomain"
            />
            <div class="dw-systems">
              <div>
                <span>Consumption</span>
                <strong>{{ summary.systemScores?.digitalConsumption ?? '—' }}</strong>
              </div>
              <div>
                <span>Recovery</span>
                <strong>{{ summary.systemScores?.recoveryAndBody ?? '—' }}</strong>
              </div>
              <div>
                <span>Attention</span>
                <strong>{{ summary.systemScores?.performanceAndAttention ?? '—' }}</strong>
              </div>
              <div>
                <span>Presence</span>
                <strong>{{ summary.systemScores?.connectionAndPresence ?? '—' }}</strong>
              </div>
              <div>
                <span>Integration</span>
                <strong>{{ summary.systemScores?.integration ?? '—' }}</strong>
              </div>
            </div>
          </aside>
        </div>

        <footer class="dw-footer sticky">
          <button type="button" class="dw-btn ghost" :disabled="scoreIndex === 0" @click="scoreIndex -= 1">
            Back
          </button>
          <button type="button" class="dw-btn primary" :disabled="!canAdvance" @click="nextScore">
            {{
              scoreIndex >= activeDomains.length - 1
                ? 'See my profile →'
                : `Continue to ${nextLabel} →`
            }}
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'complete-preview'" class="dw-shell dw-shell--narrow">
        <h1 class="dw-title">Your Digital Wellness Profile Is Ready</h1>
        <div class="dw-stats">
          <div class="dw-stat highlight">
            <span>Digital Wellness Index</span>
            <strong>{{ summary.digitalWellnessIndex ?? '—' }} / 100</strong>
          </div>
          <div class="dw-stat">
            <span>Description</span>
            <strong>{{ summary.statusLabel || '—' }}</strong>
          </div>
          <div class="dw-stat">
            <span>Strongest digital habit</span>
            <strong>{{ summary.balancedHabits?.[0]?.label || '—' }}</strong>
          </div>
          <div class="dw-stat">
            <span>Highest digital friction</span>
            <strong>{{ summary.frictionAreas?.[0]?.label || '—' }}</strong>
          </div>
        </div>
        <p class="dw-note">
          Digital wellness is not about using technology as little as possible. It is about using it in ways that
          support your priorities, relationships, attention, and recovery.
        </p>
        <div class="dw-actions">
          <button type="button" class="dw-btn primary" @click="step = 'review'">
            Explore My Digital Wellness Profile
          </button>
          <button type="button" class="dw-btn ghost" @click="step = 'score'; scoreIndex = 0">
            Review My Responses
          </button>
        </div>
      </section>

      <section v-else-if="step === 'review'" class="dw-shell">
        <header class="dw-header">
          <div>
            <p class="dw-eyebrow">Your Digital Wellness Profile</p>
            <h1 class="dw-title">How technology currently supports or interferes with daily life</h1>
          </div>
        </header>
        <p class="dw-clarify">{{ summary.indexClarification }}</p>

        <div class="dw-stats">
          <div class="dw-stat highlight">
            <span>Index</span>
            <strong>{{ summary.digitalWellnessIndex ?? '—' }}</strong>
          </div>
          <div class="dw-stat">
            <span>Balanced</span>
            <strong>{{ summary.balancedDomainCount || 0 }}</strong>
          </div>
          <div class="dw-stat">
            <span>Friction</span>
            <strong>{{ summary.frictionDomainCount || 0 }}</strong>
          </div>
          <div class="dw-stat">
            <span>Level</span>
            <strong>{{ summary.statusLabel || '—' }}</strong>
          </div>
        </div>

        <div class="dw-viz-row">
          <DigitalWellnessGrid
            :domains="activeDomains"
            :responses="responses"
            :digital-wellness-index="summary.digitalWellnessIndex"
            :selected-priority-domain-ids="priorityKeys"
            :balanced-domain-count="summary.balancedDomainCount"
            :friction-domain-count="summary.frictionDomainCount"
            v-model:display-mode="gridDisplayMode"
          />
        </div>

        <DigitalDayflow v-model:dayflow-entries="dayflowEntries" allow-editing />

        <div class="dw-insight-grid">
          <article>
            <h2>Balanced digital habits</h2>
            <ul>
              <li v-for="x in summary.balancedHabits?.slice(0, 4) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — Wellness {{ x.currentWellnessScore }}
                <template v-if="x.intentionalControlScore != null">
                  · Control {{ x.intentionalControlScore }}
                </template>
              </li>
              <li v-if="!(summary.balancedHabits || []).length">No high-balance areas yet — that is okay.</li>
            </ul>
          </article>
          <article>
            <h2>Current digital friction</h2>
            <ul>
              <li v-for="x in summary.frictionAreas?.slice(0, 4) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — Wellness {{ x.currentWellnessScore }}
                <template v-if="x.digitalFrictionScore != null">
                  · Friction {{ x.digitalFrictionScore }}
                </template>
              </li>
              <li v-if="!(summary.frictionAreas || []).length">No friction areas flagged.</li>
            </ul>
          </article>
          <article>
            <h2>High-importance opportunities</h2>
            <ul>
              <li v-for="x in summary.highImportanceOpportunities?.slice(0, 4) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — Importance {{ x.personalImportanceScore }}
              </li>
              <li v-if="!(summary.highImportanceOpportunities || []).length">
                No high-importance friction flagged.
              </li>
            </ul>
          </article>
        </div>

        <div v-if="summary.insights?.length" class="dw-insights">
          <h2>Insights</h2>
          <ul>
            <li v-for="(t, i) in summary.insights" :key="i">{{ t }}</li>
          </ul>
        </div>

        <footer class="dw-footer">
          <button type="button" class="dw-btn ghost" @click="step = 'score'; scoreIndex = 0">Edit scores</button>
          <button type="button" class="dw-btn primary" @click="step = 'priorities'">Choose priorities →</button>
        </footer>
      </section>

      <section v-else-if="step === 'priorities'" class="dw-shell dw-shell--narrow">
        <h1 class="dw-title">Which areas would make the greatest positive difference?</h1>
        <p class="dw-note">
          You do not have to select the area with the most time. Choose where a realistic change would matter most.
          Select up to {{ maxPriorities }}.
        </p>
        <div class="dw-priority-list">
          <label v-for="d in activeDomains" :key="d.key" class="dw-priority">
            <input
              type="checkbox"
              :checked="priorityKeys.includes(d.key)"
              :disabled="!priorityKeys.includes(d.key) && priorityKeys.length >= maxPriorities"
              @change="togglePriority(d.key, $event.target.checked)"
            />
            <span>
              <strong>{{ d.label }}</strong>
              <em>
                Wellness {{ responseMap[d.key]?.currentWellnessScore ?? '—' }}
                <template v-if="responseMap[d.key]?.intentionalControlScore != null">
                  · Control {{ responseMap[d.key].intentionalControlScore }}
                </template>
              </em>
            </span>
            <select
              v-if="priorityKeys.includes(d.key)"
              v-model="priorityTypes[d.key]"
              @click.stop
            >
              <option v-for="t in PRIORITY_TYPES" :key="t.id" :value="t.id">{{ t.label }}</option>
            </select>
          </label>
        </div>
        <footer class="dw-footer">
          <button type="button" class="dw-btn ghost" @click="step = 'review'">Back</button>
          <button
            type="button"
            class="dw-btn primary"
            :disabled="!priorityKeys.length"
            @click="goPlans"
          >
            Build Digital Wellness Plan →
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'plans'" class="dw-shell">
        <h1 class="dw-title">Digital Wellness Plan</h1>
        <p class="dw-note">
          Prefer environmental changes over willpower alone. Treat each change as an experiment.
        </p>
        <div v-for="key in priorityKeys" :key="key" class="dw-plan-card">
          <h2>{{ domainMap[key]?.label }} · {{ priorityTypeLabel(key) }}</h2>
          <label class="dw-field">
            Desired experience
            <textarea v-model="planDrafts[key].desiredExperience" rows="2" />
          </label>
          <label class="dw-field">
            Current pattern
            <textarea v-model="planDrafts[key].currentPattern" rows="2" />
          </label>
          <label class="dw-field">
            Primary trigger
            <input v-model="planDrafts[key].primaryTrigger" type="text" />
          </label>
          <label class="dw-field">
            Environmental change
            <input v-model="planDrafts[key].environmentalChange" type="text" />
          </label>
          <label class="dw-field">
            Smallest first action
            <input v-model="planDrafts[key].smallestFirstAction" type="text" />
          </label>
          <label class="dw-field">
            Device or app setting
            <input v-model="planDrafts[key].deviceSetting" type="text" />
          </label>
          <label class="dw-field">
            Flexible alternative
            <input v-model="planDrafts[key].flexibleAlternative" type="text" />
          </label>
          <label class="dw-field">
            Restart plan
            <input v-model="planDrafts[key].restartPlan" type="text" />
          </label>
          <label class="dw-field">
            Success indicator
            <input v-model="planDrafts[key].successIndicator" type="text" />
          </label>
          <label class="dw-field">
            Confidence (1–10)
            <input v-model.number="planDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="(planDrafts[key].confidenceScore || 10) < 7" class="dw-clarify">
            How could this plan become smaller, easier, or more dependent on the environment rather than willpower?
          </p>
        </div>
        <footer class="dw-footer">
          <button type="button" class="dw-btn ghost" @click="step = 'priorities'">Back</button>
          <button type="button" class="dw-btn primary" @click="finish">Finish →</button>
        </footer>
      </section>

      <section v-else-if="step === 'done'" class="dw-shell dw-shell--narrow">
        <p class="dw-eyebrow">Complete</p>
        <h1 class="dw-title">Your Digital Wellness Profile</h1>
        <div class="dw-stats">
          <div class="dw-stat highlight">
            <span>Index</span>
            <strong>{{ summary.digitalWellnessIndex ?? '—' }}</strong>
          </div>
          <div class="dw-stat">
            <span>Level</span>
            <strong>{{ summary.statusLabel }}</strong>
          </div>
        </div>
        <DigitalWellnessGrid
          :domains="activeDomains"
          :responses="responses"
          :digital-wellness-index="summary.digitalWellnessIndex"
          :selected-priority-domain-ids="priorityKeys"
          display-mode="wellness-and-control"
        />
        <p class="dw-clarify">{{ summary.indexClarification }}</p>
        <div class="dw-actions">
          <button type="button" class="dw-btn primary" @click="downloadPdf">Print / Save PDF</button>
          <button type="button" class="dw-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="dw-btn ghost" @click="resetGuest">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  flushStandardGuestAssessment,
  loadAssignedAssessment,
  readAccessTokenFromRoute
} from '../../utils/assessmentAssignedSession.js';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import DigitalWellnessGrid from '../../components/digitalWellness/DigitalWellnessGrid.vue';
import DigitalDayflow from '../../components/digitalWellness/DigitalDayflow.vue';
import {
  PARTICIPANT_VERSION_OPTIONS,
  MODE_OPTIONS,
  SUPPORT_PREFERENCE_OPTIONS,
  PRIORITY_TYPES,
  PRIMARY_DEVICE_OPTIONS,
  CURRENT_CONCERN_OPTIONS,
  CURRENT_GOAL_OPTIONS,
  TIMEFRAME_OPTIONS,
  VALUE_CATEGORIES,
  buildDigitalWellnessSummary,
  domainsForContext,
  domainStatusLabel,
  digitalFrictionLabel,
  interpretWellnessScore,
  calculateDigitalFrictionScore
} from '../../utils/digitalWellness.js';

const route = useRoute();
const assignedToken = computed(() => readAccessTokenFromRoute(route));
const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const isGuest = computed(() => !!route.meta?.guestDigitalWellness);
const GUEST_KEY = 'dw-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const participantVersion = ref('general-adult');
const mode = ref('full');
const timeframe = ref('past-fourteen-days');
const primaryDevices = ref([]);
const concerns = ref([]);
const goals = ref([]);
const recreationalHours = ref(null);
const responses = ref([]);
const priorityKeys = ref([]);
const priorityTypes = reactive({});
const dayflowEntries = ref([]);
const scoreIndex = ref(0);
const saveStatus = ref('');
const planDrafts = reactive({});
const gridDisplayMode = ref('wellness-and-control');

const settings = computed(() => template.value?.settings || {});
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 3));
const enableControl = computed(() => settings.value.enableIntentionalControl !== false);
const enableImportance = computed(() => settings.value.enableImportance !== false);

const activeDomains = computed(() =>
  domainsForContext(template.value, {
    mode: mode.value,
    participantVersion: participantVersion.value
  })
);

const domainMap = computed(() => {
  const m = {};
  for (const d of activeDomains.value) m[d.key] = d;
  return m;
});

const responseMap = computed(() => {
  const m = {};
  for (const r of responses.value) m[r.domainKey] = r;
  return m;
});

const activeKey = computed(() => activeDomains.value[scoreIndex.value]?.key || '');
const activeDomain = computed(() => domainMap.value[activeKey.value] || null);
const wellness = computed(() => responseMap.value[activeKey.value]?.currentWellnessScore ?? null);
const control = computed(() => responseMap.value[activeKey.value]?.intentionalControlScore ?? null);
const importance = computed(
  () => responseMap.value[activeKey.value]?.personalImportanceScore ?? null
);
const currentChips = computed(() => responseMap.value[activeKey.value]?.reflectionChips || []);
const valueProvided = computed(() => responseMap.value[activeKey.value]?.valueProvided || []);
const supportPreference = computed(
  () => responseMap.value[activeKey.value]?.supportPreference || 'none'
);
const privateNote = computed(() => responseMap.value[activeKey.value]?.privateNote || '');
const statusLabel = computed(() => domainStatusLabel(wellness.value));
const frictionScore = computed(() =>
  wellness.value != null && control.value != null
    ? calculateDigitalFrictionScore(wellness.value, control.value)
    : null
);
const frictionLabel = computed(() => digitalFrictionLabel(frictionScore.value));
const interpretation = computed(() =>
  interpretWellnessScore(wellness.value, activeDomain.value?.label || 'This area')
);

const canShowImportance = computed(() => {
  if (!enableImportance.value || wellness.value == null) return false;
  if (enableControl.value && control.value == null) return false;
  return true;
});

const canShowReflections = computed(() => {
  if (wellness.value == null) return false;
  if (enableControl.value && control.value == null) return false;
  if (enableImportance.value && importance.value == null) return false;
  return true;
});

const scoredCount = computed(
  () =>
    activeDomains.value.filter((d) => {
      const r = responseMap.value[d.key];
      return (
        r?.preferNotToAnswer ||
        r?.seasonStatus === 'not-relevant' ||
        r?.currentWellnessScore != null
      );
    }).length
);

const canAdvance = computed(() => {
  const r = responseMap.value[activeKey.value];
  return (
    r?.preferNotToAnswer ||
    r?.seasonStatus === 'not-relevant' ||
    r?.currentWellnessScore != null
  );
});

const nextLabel = computed(() => activeDomains.value[scoreIndex.value + 1]?.label || 'next');
const timeframeLabel = computed(
  () => TIMEFRAME_OPTIONS.find((o) => o.id === timeframe.value)?.label || 'Past 14 days'
);

const usageSummary = computed(() =>
  recreationalHours.value != null && Number.isFinite(Number(recreationalHours.value))
    ? { recreationalScreenHours: Number(recreationalHours.value) }
    : null
);

const summary = computed(() =>
  buildDigitalWellnessSummary(template.value, responses.value, {
    mode: mode.value,
    participantVersion: participantVersion.value,
    priorityKeys: priorityKeys.value,
    usageSummary: usageSummary.value
  })
);

function persistGuest() {
  if (!isGuest.value) return;
  try {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({
        step: step.value,
        participantVersion: participantVersion.value,
        mode: mode.value,
        timeframe: timeframe.value,
        primaryDevices: primaryDevices.value,
        concerns: concerns.value,
        goals: goals.value,
        recreationalHours: recreationalHours.value,
        responses: responses.value,
        priorityKeys: priorityKeys.value,
        priorityTypes: { ...priorityTypes },
        dayflowEntries: dayflowEntries.value,
        scoreIndex: scoreIndex.value,
        planDrafts: { ...planDrafts },
        templateId: template.value?.id,
        savedAt: new Date().toISOString()
      })
    );
    saveStatus.value = 'Saved';
  } catch {
    saveStatus.value = 'Stored offline';
  }
}

watch(
  [
    step,
    responses,
    priorityKeys,
    scoreIndex,
    participantVersion,
    mode,
    timeframe,
    dayflowEntries,
    recreationalHours
  ],
  () => persistGuest(),
  { deep: true }
);

function toggleList(arr, item) {
  const i = arr.indexOf(item);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(item);
}

function ensureResponse(key) {
  if (!responseMap.value[key]) {
    responses.value = [
      ...responses.value,
      {
        domainKey: key,
        currentWellnessScore: null,
        intentionalControlScore: null,
        personalImportanceScore: null,
        reflectionChips: [],
        valueProvided: [],
        barriers: [],
        supportPreference: 'none',
        privateNote: '',
        seasonStatus: 'active',
        preferNotToAnswer: false
      }
    ];
  }
}

function patchResponse(key, patch) {
  ensureResponse(key);
  responses.value = responses.value.map((r) => (r.domainKey === key ? { ...r, ...patch } : r));
}

function setWellness(n) {
  patchResponse(activeKey.value, {
    currentWellnessScore: n,
    preferNotToAnswer: false,
    seasonStatus: 'active'
  });
}

function toggleChip(chip) {
  const set = new Set(currentChips.value);
  if (set.has(chip)) set.delete(chip);
  else set.add(chip);
  patchResponse(activeKey.value, { reflectionChips: [...set] });
}

function toggleValue(v) {
  const set = new Set(valueProvided.value);
  if (set.has(v)) set.delete(v);
  else set.add(v);
  patchResponse(activeKey.value, { valueProvided: [...set] });
}

function markNotRelevant() {
  patchResponse(activeKey.value, {
    seasonStatus: 'not-relevant',
    currentWellnessScore: null
  });
  nextScore();
}

function startScoring() {
  scoreIndex.value = 0;
  for (const d of activeDomains.value) ensureResponse(d.key);
  step.value = 'score';
}

function nextScore() {
  if (scoreIndex.value >= activeDomains.value.length - 1) {
    step.value = 'complete-preview';
  } else {
    scoreIndex.value += 1;
  }
}

function jumpToDomain(key) {
  const idx = activeDomains.value.findIndex((d) => d.key === key);
  if (idx >= 0) {
    scoreIndex.value = idx;
    step.value = 'score';
  }
}

function togglePriority(key, checked) {
  if (checked) {
    if (priorityKeys.value.length >= maxPriorities.value) return;
    priorityKeys.value = [...priorityKeys.value, key];
    if (!priorityTypes[key]) priorityTypes[key] = 'improve-boundaries';
  } else {
    priorityKeys.value = priorityKeys.value.filter((k) => k !== key);
  }
}

function priorityTypeLabel(key) {
  const id = priorityTypes[key] || 'improve-boundaries';
  return PRIORITY_TYPES.find((t) => t.id === id)?.label || id;
}

function goPlans() {
  for (const key of priorityKeys.value) {
    if (!planDrafts[key]) {
      planDrafts[key] = {
        desiredExperience: '',
        currentPattern: '',
        primaryTrigger: '',
        environmentalChange: '',
        smallestFirstAction: '',
        deviceSetting: '',
        flexibleAlternative: '',
        restartPlan: '',
        successIndicator: '',
        confidenceScore: null,
        priorityType: priorityTypes[key] || 'improve-boundaries'
      };
    }
  }
  step.value = 'plans';
}

async function finish() {
  if (assignedToken.value) {
    try {
      await flushStandardGuestAssessment({
        apiPrefix: '/digital-wellness',
        token: assignedToken.value,
        responses: responses.value || [],
        mapResponse: (r) => ({
          domainKey: r.domainKey || r.key,
          ...r
        }),
        plansPayload: {
          selectedPriorities: (typeof priorityKeys !== 'undefined' && priorityKeys?.value) ? priorityKeys.value : [],
        },
        completePayload: {
          selectedPriorities: (typeof priorityKeys !== 'undefined' && priorityKeys?.value) ? priorityKeys.value : []
        }
      });
    } catch (e) {
      error.value = e?.response?.data?.error || e.message || 'Could not save assessment';
      return;
    }
  } else if (typeof persistGuest === 'function') {
    persistGuest();
  }
  step.value = 'done';
}

function quickExit() {
  const url = settings.value.quickExitUrl || 'https://www.google.com';
  window.location.replace(url);
}

function buildExport() {
  return {
    type: 'digital_wellness_guest',
    title: 'Digital Wellness Assessment',
    visualExperience: 'Digital Wellness Grid',
    exportedAt: new Date().toISOString(),
    participantVersion: participantVersion.value,
    mode: mode.value,
    timeframe: timeframe.value,
    context: {
      primaryDevices: primaryDevices.value,
      concerns: concerns.value,
      goals: goals.value,
      recreationalHours: recreationalHours.value
    },
    summary: summary.value,
    domains: activeDomains.value.map((d) => ({
      key: d.key,
      label: d.label,
      ...(responseMap.value[d.key] || {})
    })),
    dayflow: dayflowEntries.value,
    priorityKeys: priorityKeys.value,
    plans: priorityKeys.value.map((key) => ({
      domainKey: key,
      label: domainMap.value[key]?.label,
      ...(planDrafts[key] || {})
    }))
  };
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `digital-wellness-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf() {
  window.print();
}

async function resetGuest() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    // ignore
  }
  responses.value = [];
  priorityKeys.value = [];
  dayflowEntries.value = [];
  scoreIndex.value = 0;
  Object.keys(planDrafts).forEach((k) => delete planDrafts[k]);
  step.value = 'welcome';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/digital-wellness/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value = 'Digital Wellness template is not available yet. Run migration 926.';
      return;
    }
    if (isGuest.value) {
      try {
        const raw = localStorage.getItem(GUEST_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.responses) responses.value = cached.responses;
          if (cached?.priorityKeys) priorityKeys.value = cached.priorityKeys;
          if (cached?.step) step.value = cached.step;
          if (cached?.participantVersion) participantVersion.value = cached.participantVersion;
          if (cached?.mode) mode.value = cached.mode;
          if (cached?.timeframe) timeframe.value = cached.timeframe;
          if (cached?.primaryDevices) primaryDevices.value = cached.primaryDevices;
          if (cached?.concerns) concerns.value = cached.concerns;
          if (cached?.goals) goals.value = cached.goals;
          if (cached?.recreationalHours != null) recreationalHours.value = cached.recreationalHours;
          if (cached?.dayflowEntries) dayflowEntries.value = cached.dayflowEntries;
          if (typeof cached?.scoreIndex === 'number') scoreIndex.value = cached.scoreIndex;
          for (const [k, v] of Object.entries(cached.planDrafts || {})) {
            planDrafts[k] = { ...v };
          }
          for (const [k, v] of Object.entries(cached.priorityTypes || {})) {
            priorityTypes[k] = v;
          }
        }
      } catch {
        // ignore
      }
    }
  } catch (e) {
    error.value = e?.response?.data?.error || e.message || 'Could not load assessment';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Space+Grotesk:wght@500;600;700&display=swap');

.dw-page {
  --ink: #0f172a;
  --muted: #64748b;
  --line: #e2e8f0;
  --bg: #f8fafc;
  --accent: #0284c7;
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 8% -8%, rgba(14, 165, 233, 0.14), transparent 55%),
    radial-gradient(700px 360px at 100% 0%, rgba(99, 102, 241, 0.1), transparent 50%),
    linear-gradient(180deg, #f0f9ff 0%, var(--bg) 40%);
  color: var(--ink);
  font-family: 'DM Sans', system-ui, sans-serif;
  padding: 1.5rem 1rem 4rem;
}

.dw-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--muted);
}
.dw-state.error {
  color: #9f1239;
}

.dw-shell {
  max-width: 1120px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.dw-shell--narrow {
  max-width: 660px;
}

.dw-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 700;
}

.dw-title {
  margin: 0.35rem 0 0.65rem;
  font-family: 'Space Grotesk', system-ui, sans-serif;
  font-size: clamp(1.55rem, 3vw, 2.15rem);
  font-weight: 650;
  line-height: 1.2;
}

.dw-lead,
.dw-note,
.dw-meta,
.dw-clarify {
  color: #475569;
  line-height: 1.6;
}

.dw-clarify {
  font-size: 0.9rem;
  padding: 0.75rem 1rem;
  background: #f1f5f9;
  border-radius: 12px;
}

.dw-actions,
.dw-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.25rem;
}

.dw-footer.sticky {
  position: sticky;
  bottom: 0.5rem;
  background: rgba(255, 255, 255, 0.95);
  border-top: 1px solid var(--line);
  padding: 0.85rem 0 0.25rem;
  z-index: 5;
}

.dw-btn {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  border-radius: 999px;
  padding: 0.65rem 1.15rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.dw-btn.primary {
  background: #0284c7;
  border-color: #0369a1;
  color: #fff;
}
.dw-btn.ghost {
  background: transparent;
}
.dw-btn.small {
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
}
.dw-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dw-bullets {
  padding-left: 1.2rem;
  color: #475569;
  line-height: 1.7;
}

.dw-field-label {
  margin: 1rem 0 0.45rem;
  font-size: 0.85rem;
  font-weight: 650;
}

.dw-field {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.85rem;
  font-size: 0.9rem;
  color: #334155;
}
.dw-field input,
.dw-field select,
.dw-field textarea {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  background: #fff;
}

.dw-mode-grid {
  display: grid;
  gap: 0.5rem;
}
.dw-mode {
  text-align: left;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 14px;
  padding: 0.75rem 0.85rem;
  cursor: pointer;
  display: grid;
  gap: 0.15rem;
}
.dw-mode strong {
  font-size: 0.95rem;
}
.dw-mode span,
.dw-mode em {
  font-size: 0.8rem;
  color: var(--muted);
  font-style: normal;
}
.dw-mode.on {
  border-color: #7dd3fc;
  background: #e0f2fe;
}

.dw-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.dw-chip {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  cursor: pointer;
  color: #475569;
}
.dw-chip.on {
  background: #e0f2fe;
  border-color: #38bdf8;
  color: #0c4a6e;
}

.dw-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.dw-split {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.95fr);
  gap: 1.15rem;
  align-items: start;
}

.dw-aside {
  position: sticky;
  top: 1rem;
  display: grid;
  gap: 0.75rem;
}

.dw-systems {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.35rem;
}
.dw-systems > div {
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.4rem;
  text-align: center;
}
.dw-systems span {
  display: block;
  font-size: 0.62rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dw-systems strong {
  font-size: 0.95rem;
}

.dw-score-block {
  margin-bottom: 1.1rem;
}
.dw-score-block h2 {
  margin: 0 0 0.55rem;
  font-size: 1.05rem;
  font-family: 'Space Grotesk', system-ui, sans-serif;
}
.dw-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 0.4rem;
}
.dw-scores {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.3rem;
}
.dw-score {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 10px;
  min-height: 2.6rem;
  font-weight: 700;
  cursor: pointer;
}
.dw-score.on {
  background: #0284c7;
  border-color: #0369a1;
  color: #fff;
}
.dw-score.soft.on {
  background: #6366f1;
  border-color: #4f46e5;
}

.dw-gap-card {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  margin-bottom: 1rem;
}
.dw-status-pill {
  display: inline-block;
  margin: 0.35rem 0 0;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: #e0f2fe;
  color: #075985;
  font-size: 0.78rem;
  font-weight: 650;
}
.dw-live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.dw-friction {
  margin: 0.45rem 0 0;
  font-size: 0.85rem;
  color: #475569;
}
.dw-safety {
  margin-top: 0.75rem;
  padding: 0.75rem 0.9rem;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 12px;
  color: #9a3412;
  font-size: 0.88rem;
}
.dw-details {
  margin-top: 0.75rem;
}
.dw-details textarea {
  width: 100%;
  margin-top: 0.4rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.55rem 0.7rem;
  font: inherit;
}

.dw-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
  margin: 1rem 0;
}
.dw-stat {
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.7rem 0.8rem;
}
.dw-stat.highlight {
  background: #e0f2fe;
  border-color: #7dd3fc;
}
.dw-stat span {
  display: block;
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dw-stat strong {
  font-size: 1.05rem;
}

.dw-viz-row {
  margin: 1rem 0;
}

.dw-insight-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}
.dw-insight-grid article {
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.85rem 1rem;
}
.dw-insight-grid h2 {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  font-family: 'Space Grotesk', system-ui, sans-serif;
}
.dw-insight-grid ul,
.dw-insights ul {
  margin: 0;
  padding-left: 1.1rem;
  color: #475569;
  font-size: 0.88rem;
  line-height: 1.55;
}

.dw-insights {
  margin: 1rem 0;
  padding: 0.9rem 1rem;
  background: #f8fafc;
  border-radius: 14px;
  border: 1px solid var(--line);
}
.dw-insights h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-family: 'Space Grotesk', system-ui, sans-serif;
}

.dw-priority-list {
  display: grid;
  gap: 0.5rem;
}
.dw-priority {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.65rem;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.7rem 0.85rem;
  background: #fff;
}
.dw-priority em {
  display: block;
  font-style: normal;
  font-size: 0.8rem;
  color: var(--muted);
}
.dw-priority select {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.35rem 0.45rem;
  font: inherit;
}

.dw-plan-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 1rem;
  margin-bottom: 0.85rem;
  background: #f8fafc;
}
.dw-plan-card h2 {
  margin: 0 0 0.65rem;
  font-size: 1.05rem;
  font-family: 'Space Grotesk', system-ui, sans-serif;
}

@media (max-width: 900px) {
  .dw-split {
    grid-template-columns: 1fr;
  }
  .dw-aside {
    position: static;
  }
  .dw-systems {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .dw-stats,
  .dw-insight-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 560px) {
  .dw-scores {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .dw-stats,
  .dw-insight-grid,
  .dw-systems {
    grid-template-columns: 1fr;
  }
  .dw-priority {
    grid-template-columns: auto 1fr;
  }
  .dw-priority select {
    grid-column: 1 / -1;
  }
}

@media print {
  .dw-page {
    background: #fff;
    padding: 0;
  }
  .dw-footer,
  .dw-actions .dw-btn.ghost {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto !important;
  }
}
</style>
