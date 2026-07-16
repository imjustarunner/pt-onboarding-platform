<template>
  <div class="ml-page">
    <div v-if="loading" class="ml-state">Loading Men's Life Assessment…</div>
    <div v-else-if="error" class="ml-state error">{{ error }}</div>

    <template v-else-if="template">
      <section v-if="step === 'welcome'" class="ml-shell ml-shell--narrow">
        <p class="ml-eyebrow">Men's Life Assessment</p>
        <h1 class="ml-title">What Kind of Life Are You Building?</h1>
        <p class="ml-lead">
          A meaningful life includes more than career success or productivity. It may include purpose,
          relationships, fatherhood, friendship, leadership, physical capacity, financial stewardship,
          spiritual life, emotional health, and legacy.
        </p>
        <p class="ml-note">
          This assessment is an honest review of your current life. It is not a test of masculinity, worth,
          toughness, or success.
        </p>
        <p class="ml-meta">15 to 22 minutes · The Life Framework</p>
        <div class="ml-actions">
          <button type="button" class="ml-btn primary" @click="step = 'context'">
            Build My Life Framework
          </button>
          <button type="button" class="ml-btn ghost" @click="step = 'how'">How This Assessment Works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="ml-shell ml-shell--narrow">
        <h1 class="ml-title">How This Assessment Works</h1>
        <ol class="ml-bullets">
          <li>Share optional context about your life stage and roles.</li>
          <li>Rate Current Strength—and Importance and Momentum when helpful—for each domain.</li>
          <li>Watch The Life Framework take shape.</li>
          <li>Review the Life Priority Matrix and choose one to three priorities.</li>
          <li>Translate priorities into personal commitments you control.</li>
        </ol>
        <p class="ml-clarify">{{ template.settings?.disclaimer }}</p>
        <div class="ml-actions">
          <button type="button" class="ml-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="ml-btn primary" @click="step = 'context'">Continue</button>
        </div>
      </section>

      <section v-else-if="step === 'context'" class="ml-shell ml-shell--narrow">
        <p class="ml-eyebrow">Before you begin</p>
        <h1 class="ml-title">Your current season</h1>

        <p class="ml-field-label">Participant version</p>
        <div class="ml-mode-grid">
          <button
            v-for="v in PARTICIPANT_VERSION_OPTIONS"
            :key="v.id"
            type="button"
            class="ml-mode"
            :class="{ on: participantVersion === v.id }"
            @click="participantVersion = v.id"
          >
            <strong>{{ v.label }}</strong>
            <span>{{ v.description }}</span>
          </button>
        </div>

        <p class="ml-field-label">Assessment mode</p>
        <div class="ml-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="ml-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>

        <label class="ml-field">
          Assessment timeframe
          <select v-model="timeframe">
            <option v-for="o in TIMEFRAME_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>

        <p class="ml-field-label">Current life stage (optional)</p>
        <div class="ml-chips">
          <button
            v-for="s in LIFE_STAGE_OPTIONS"
            :key="s"
            type="button"
            class="ml-chip"
            :class="{ on: lifeStages.includes(s) }"
            @click="toggleList(lifeStages, s)"
          >
            {{ s }}
          </button>
        </div>

        <p class="ml-field-label">Current roles (optional)</p>
        <div class="ml-chips">
          <button
            v-for="r in ROLE_OPTIONS"
            :key="r"
            type="button"
            class="ml-chip"
            :class="{ on: roles.includes(r) }"
            @click="toggleList(roles, r)"
          >
            {{ r }}
          </button>
        </div>

        <p class="ml-field-label">Current goal (optional)</p>
        <div class="ml-chips">
          <button
            v-for="g in CURRENT_GOAL_OPTIONS"
            :key="g"
            type="button"
            class="ml-chip"
            :class="{ on: goals.includes(g) }"
            @click="toggleList(goals, g)"
          >
            {{ g }}
          </button>
        </div>

        <div class="ml-actions">
          <button type="button" class="ml-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="ml-btn primary" @click="startScoring">Begin →</button>
        </div>
      </section>

      <section v-else-if="step === 'score'" class="ml-shell ml-shell--split">
        <header class="ml-header">
          <div>
            <p class="ml-eyebrow">
              {{ scoredCount }} of {{ activeDomains.length }} completed ·
              {{ timeframeLabel }} · {{ saveStatus || 'Ready' }}
            </p>
            <h1 class="ml-title">{{ activeDomain?.label }}</h1>
            <p class="ml-lead">{{ activeDomain?.definition }}</p>
          </div>
        </header>

        <div class="ml-split">
          <div class="ml-panel">
            <div class="ml-score-block">
              <h2>{{ activeDomain?.primaryQuestion || 'How strong does this area currently feel?' }}</h2>
              <div class="ml-scale-labels">
                <span>Significant Concern</span>
                <span>Strong and Integrated</span>
              </div>
              <div class="ml-scores" role="group" :aria-label="`${activeDomain?.label} current strength`">
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="ml-score"
                  :class="{ on: strength === n }"
                  @click="setStrength(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="strength != null" class="ml-gap-card" role="status" aria-live="polite">
              <p>{{ interpretation }}</p>
              <p class="ml-status-pill">{{ statusLabel }}</p>
              <p class="ml-live">
                {{ activeDomain?.label }} Current Strength updated to {{ strength }} out of 10.
                <template v-if="importance != null">
                  Personal Importance is {{ importance }} out of 10.
                  {{ activeDomain?.label }} is categorized as {{ quadrantLabel || '—' }}.
                </template>
                Men's Life Index is now {{ summary.mensLifeIndex ?? '—' }} out of 100.
              </p>
            </div>

            <div v-if="strength != null && enableImportance" class="ml-score-block">
              <h2>How important is this area in your current life season?</h2>
              <div class="ml-scale-labels">
                <span>Low Importance</span>
                <span>Essential</span>
              </div>
              <div class="ml-scores">
                <button
                  v-for="n in 10"
                  :key="`i-${n}`"
                  type="button"
                  class="ml-score soft"
                  :class="{ on: importance === n }"
                  @click="patchResponse(activeKey, { personalImportanceScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="canShowMomentum" class="ml-score-block">
              <h2>How much positive movement do you currently feel in this area?</h2>
              <div class="ml-scale-labels">
                <span>Unwanted Direction</span>
                <span>Strong Positive Momentum</span>
              </div>
              <div class="ml-scores">
                <button
                  v-for="n in 10"
                  :key="`m-${n}`"
                  type="button"
                  class="ml-score soft"
                  :class="{ on: momentum === n }"
                  @click="patchResponse(activeKey, { currentMomentumScore: n })"
                >
                  {{ n }}
                </button>
              </div>
              <p v-if="momentumLabelText" class="ml-momentum">{{ momentumLabelText }}</p>
            </div>

            <div v-if="canShowReflections" class="ml-reflect">
              <h2>{{ activeDomain?.reflectionPrompt || 'What most affects this area?' }}</h2>
              <div class="ml-chips">
                <button
                  v-for="chip in activeDomain?.reflectionOptions || []"
                  :key="chip"
                  type="button"
                  class="ml-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>

              <label class="ml-field">
                What does this domain mean to you? (optional)
                <textarea
                  :value="personalDefinition"
                  rows="2"
                  @input="patchResponse(activeKey, { personalDefinition: $event.target.value })"
                />
              </label>

              <label class="ml-field">
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

              <p v-if="supportPreference === 'support-today'" class="ml-safety">
                Your response suggests that a private conversation with a qualified support person may be
                important.
              </p>

              <p
                v-if="(activeDomain?.relatedAssessmentIds || []).length"
                class="ml-clarify"
              >
                A deeper assessment is available if you want to explore this area further:
                {{ relatedLabels(activeDomain.relatedAssessmentIds) }}.
              </p>

              <details class="ml-details">
                <summary>Optional private reflection</summary>
                <textarea
                  :value="privateReflection"
                  rows="3"
                  @input="patchResponse(activeKey, { privateReflection: $event.target.value })"
                />
              </details>

              <button type="button" class="ml-btn ghost small" @click="markNotRelevant">
                Not relevant in this season
              </button>
            </div>
          </div>

          <aside class="ml-aside">
            <MensLifeFramework
              :domains="activeDomains"
              :responses="responses"
              :mens-life-index="summary.mensLifeIndex"
              :system-scores="summary.systemScores"
              :active-domain-id="activeKey"
              :selected-priority-domain-ids="priorityKeys"
              :core-strength-count="summary.coreStrengthCount"
              :high-importance-development-count="summary.highImportanceDevelopmentCount"
              v-model:display-mode="frameworkDisplayMode"
              interactive
              animated
              @domain-select="jumpToDomain"
            />
            <div class="ml-systems">
              <div>
                <span>Meaning</span>
                <strong>{{ summary.systemScores?.meaningAndDirection ?? '—' }}</strong>
              </div>
              <div>
                <span>Relationships</span>
                <strong>{{ summary.systemScores?.relationshipsAndResponsibility ?? '—' }}</strong>
              </div>
              <div>
                <span>Stewardship</span>
                <strong>{{ summary.systemScores?.strengthAndStewardship ?? '—' }}</strong>
              </div>
              <div>
                <span>Inner Life</span>
                <strong>{{ summary.systemScores?.innerStability ?? '—' }}</strong>
              </div>
            </div>
          </aside>
        </div>

        <footer class="ml-footer sticky">
          <button type="button" class="ml-btn ghost" :disabled="scoreIndex === 0" @click="scoreIndex -= 1">
            Back
          </button>
          <button type="button" class="ml-btn primary" :disabled="!canAdvance" @click="nextScore">
            {{
              scoreIndex >= activeDomains.length - 1
                ? 'See my profile →'
                : `Continue to ${nextLabel} →`
            }}
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'complete-preview'" class="ml-shell ml-shell--narrow">
        <h1 class="ml-title">Your Men's Life Profile Is Ready</h1>
        <div class="ml-stats">
          <div class="ml-stat highlight">
            <span>Men's Life Index</span>
            <strong>{{ summary.mensLifeIndex ?? '—' }} / 100</strong>
          </div>
          <div class="ml-stat">
            <span>Description</span>
            <strong>{{ summary.statusLabel || '—' }}</strong>
          </div>
          <div class="ml-stat">
            <span>Strongest domain</span>
            <strong>{{ summary.coreStrengths?.[0]?.label || '—' }}</strong>
          </div>
          <div class="ml-stat">
            <span>Highest-importance development</span>
            <strong>{{ summary.highImportanceDevelopment?.[0]?.label || '—' }}</strong>
          </div>
        </div>
        <p class="ml-note">
          A strong life does not require every role to receive equal attention. Your profile is a starting
          point for deciding what deserves intention in your current season.
        </p>
        <div class="ml-actions">
          <button type="button" class="ml-btn primary" @click="step = 'review'">
            Explore My Life Framework
          </button>
          <button type="button" class="ml-btn ghost" @click="step = 'score'; scoreIndex = 0">
            Review My Responses
          </button>
        </div>
      </section>

      <section v-else-if="step === 'review'" class="ml-shell">
        <header class="ml-header">
          <div>
            <p class="ml-eyebrow">Your Men's Life Profile</p>
            <h1 class="ml-title">Strengths, pressures, and opportunities across the life you are building</h1>
          </div>
        </header>
        <p class="ml-clarify">{{ summary.indexClarification }}</p>

        <div class="ml-stats">
          <div class="ml-stat highlight">
            <span>Index</span>
            <strong>{{ summary.mensLifeIndex ?? '—' }}</strong>
          </div>
          <div class="ml-stat">
            <span>Weighted</span>
            <strong>{{ summary.importanceWeightedLifeIndex ?? '—' }}</strong>
          </div>
          <div class="ml-stat">
            <span>Strengths</span>
            <strong>{{ summary.coreStrengthCount || 0 }}</strong>
          </div>
          <div class="ml-stat">
            <span>Development</span>
            <strong>{{ summary.highImportanceDevelopmentCount || 0 }}</strong>
          </div>
        </div>

        <div class="ml-viz-row">
          <MensLifeFramework
            :domains="activeDomains"
            :responses="responses"
            :mens-life-index="summary.mensLifeIndex"
            :selected-priority-domain-ids="priorityKeys"
            :core-strength-count="summary.coreStrengthCount"
            :high-importance-development-count="summary.highImportanceDevelopmentCount"
            v-model:display-mode="frameworkDisplayMode"
          />
        </div>

        <MensLifePriorityMatrix
          :domains="activeDomains"
          :responses="responses"
          :selected-priority-domain-ids="priorityKeys"
          :clarification="summary.matrixClarification"
        />

        <div class="ml-insight-grid">
          <article>
            <h2>Current core strengths</h2>
            <ul>
              <li v-for="x in summary.coreStrengths?.slice(0, 4) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — Strength {{ x.currentStrengthScore }}
              </li>
              <li v-if="!(summary.coreStrengths || []).length">No high strengths yet — that is okay.</li>
            </ul>
          </article>
          <article>
            <h2>High-importance development</h2>
            <ul>
              <li
                v-for="x in summary.highImportanceDevelopment?.slice(0, 4) || []"
                :key="x.domainKey"
              >
                <strong>{{ x.label }}</strong> — Strength {{ x.currentStrengthScore }}, Importance
                {{ x.personalImportanceScore }}
              </li>
              <li v-if="!(summary.highImportanceDevelopment || []).length">
                No high-importance gaps flagged.
              </li>
            </ul>
          </article>
          <article>
            <h2>Strong areas losing momentum</h2>
            <ul>
              <li v-for="x in summary.losingMomentum?.slice(0, 3) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — {{ x.momentumLabel }}
              </li>
              <li v-if="!(summary.losingMomentum || []).length">None identified.</li>
            </ul>
          </article>
        </div>

        <div v-if="summary.insights?.length" class="ml-insights">
          <h2>Insights</h2>
          <ul>
            <li v-for="(t, i) in summary.insights" :key="i">{{ t }}</li>
          </ul>
        </div>

        <footer class="ml-footer">
          <button type="button" class="ml-btn ghost" @click="step = 'score'; scoreIndex = 0">Edit scores</button>
          <button type="button" class="ml-btn primary" @click="step = 'priorities'">Choose priorities →</button>
        </footer>
      </section>

      <section v-else-if="step === 'priorities'" class="ml-shell ml-shell--narrow">
        <h1 class="ml-title">Which areas would make the greatest difference?</h1>
        <p class="ml-note">
          You do not have to select the lowest score. Choose where focused attention would matter most.
          Select up to {{ maxPriorities }}.
        </p>
        <div class="ml-priority-list">
          <label v-for="d in activeDomains" :key="d.key" class="ml-priority">
            <input
              type="checkbox"
              :checked="priorityKeys.includes(d.key)"
              :disabled="!priorityKeys.includes(d.key) && priorityKeys.length >= maxPriorities"
              @change="togglePriority(d.key, $event.target.checked)"
            />
            <span>
              <strong>{{ d.label }}</strong>
              <em>
                Strength {{ responseMap[d.key]?.currentStrengthScore ?? '—' }}
                <template v-if="responseMap[d.key]?.personalImportanceScore != null">
                  · Importance {{ responseMap[d.key].personalImportanceScore }}
                </template>
              </em>
            </span>
            <select v-if="priorityKeys.includes(d.key)" v-model="priorityTypes[d.key]" @click.stop>
              <option v-for="t in PRIORITY_TYPES" :key="t.id" :value="t.id">{{ t.label }}</option>
            </select>
          </label>
        </div>
        <footer class="ml-footer">
          <button type="button" class="ml-btn ghost" @click="step = 'review'">Back</button>
          <button
            type="button"
            class="ml-btn primary"
            :disabled="!priorityKeys.length"
            @click="goPlans"
          >
            Build Development Plan →
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'plans'" class="ml-shell">
        <h1 class="ml-title">Men's Life Development Plan</h1>
        <p class="ml-note">
          Focus on behavior you control. Asking for support can be a responsible action.
        </p>
        <div v-for="key in priorityKeys" :key="key" class="ml-plan-card">
          <h2>{{ domainMap[key]?.label }} · {{ priorityTypeLabel(key) }}</h2>
          <label class="ml-field">
            What strong looks like to me
            <textarea v-model="planDrafts[key].personalDefinition" rows="2" />
          </label>
          <label class="ml-field">
            Desired experience
            <textarea v-model="planDrafts[key].desiredExperience" rows="2" />
          </label>
          <label class="ml-field">
            Current pattern
            <textarea v-model="planDrafts[key].currentPattern" rows="2" />
          </label>
          <label class="ml-field">
            Existing strength I can use
            <input v-model="planDrafts[key].existingStrength" type="text" />
          </label>
          <label class="ml-field">
            What I will do (smallest first action)
            <input v-model="planDrafts[key].smallestFirstAction" type="text" />
          </label>
          <label class="ml-field">
            Recurring commitment
            <input v-model="planDrafts[key].recurringCommitment" type="text" />
          </label>
          <label class="ml-field">
            Boundary or tradeoff
            <input v-model="planDrafts[key].boundaryOrTradeoff" type="text" />
          </label>
          <label class="ml-field">
            Flexible alternative
            <input v-model="planDrafts[key].flexibleAlternative" type="text" />
          </label>
          <label class="ml-field">
            Restart plan
            <input v-model="planDrafts[key].restartPlan" type="text" />
          </label>
          <label class="ml-field">
            Success indicator
            <input v-model="planDrafts[key].successIndicator" type="text" />
          </label>
          <label class="ml-field">
            Confidence (1–10)
            <input v-model.number="planDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="(planDrafts[key].confidenceScore || 10) < 7" class="ml-clarify">
            How could this commitment become smaller, clearer, or more realistic?
          </p>
        </div>
        <footer class="ml-footer">
          <button type="button" class="ml-btn ghost" @click="step = 'priorities'">Back</button>
          <button type="button" class="ml-btn primary" @click="finish">Finish →</button>
        </footer>
      </section>

      <section v-else-if="step === 'done'" class="ml-shell ml-shell--narrow">
        <p class="ml-eyebrow">Complete</p>
        <h1 class="ml-title">Your Men's Life Profile</h1>
        <div class="ml-stats">
          <div class="ml-stat highlight">
            <span>Index</span>
            <strong>{{ summary.mensLifeIndex ?? '—' }}</strong>
          </div>
          <div class="ml-stat">
            <span>Level</span>
            <strong>{{ summary.statusLabel }}</strong>
          </div>
        </div>
        <MensLifeFramework
          :domains="activeDomains"
          :responses="responses"
          :mens-life-index="summary.mensLifeIndex"
          :selected-priority-domain-ids="priorityKeys"
          display-mode="strength-and-importance"
        />
        <p class="ml-clarify">{{ summary.indexClarification }}</p>
        <div class="ml-actions">
          <button type="button" class="ml-btn primary" @click="downloadPdf">Print / Save PDF</button>
          <button type="button" class="ml-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="ml-btn ghost" @click="resetGuest">Start over</button>
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
import MensLifeFramework from '../../components/mensLife/MensLifeFramework.vue';
import MensLifePriorityMatrix from '../../components/mensLife/MensLifePriorityMatrix.vue';
import {
  PARTICIPANT_VERSION_OPTIONS,
  MODE_OPTIONS,
  SUPPORT_PREFERENCE_OPTIONS,
  PRIORITY_TYPES,
  LIFE_STAGE_OPTIONS,
  ROLE_OPTIONS,
  CURRENT_GOAL_OPTIONS,
  TIMEFRAME_OPTIONS,
  RELATED_ASSESSMENT_LABELS,
  buildMensLifeSummary,
  domainsForContext,
  domainStatusLabel,
  momentumLabel,
  interpretStrengthScore,
  matrixQuadrant,
  MATRIX_QUADRANT_LABELS
} from '../../utils/mensLife.js';

const route = useRoute();
const assignedToken = computed(() => readAccessTokenFromRoute(route));
const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const isGuest = computed(() => !!route.meta?.guestMensLife);
const GUEST_KEY = 'ml-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const participantVersion = ref('married-men');
const mode = ref('full');
const timeframe = ref('current-season');
const lifeStages = ref([]);
const roles = ref([]);
const goals = ref([]);
const responses = ref([]);
const priorityKeys = ref([]);
const priorityTypes = reactive({});
const scoreIndex = ref(0);
const saveStatus = ref('');
const planDrafts = reactive({});
const frameworkDisplayMode = ref('strength-and-importance');

const settings = computed(() => template.value?.settings || {});
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 3));
const enableImportance = computed(() => settings.value.enableImportance !== false);
const enableMomentum = computed(() => settings.value.enableMomentum !== false);

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
const strength = computed(() => responseMap.value[activeKey.value]?.currentStrengthScore ?? null);
const importance = computed(
  () => responseMap.value[activeKey.value]?.personalImportanceScore ?? null
);
const momentum = computed(() => responseMap.value[activeKey.value]?.currentMomentumScore ?? null);
const currentChips = computed(() => responseMap.value[activeKey.value]?.reflectionChips || []);
const personalDefinition = computed(
  () => responseMap.value[activeKey.value]?.personalDefinition || ''
);
const supportPreference = computed(
  () => responseMap.value[activeKey.value]?.supportPreference || 'none'
);
const privateReflection = computed(
  () => responseMap.value[activeKey.value]?.privateReflection || ''
);
const statusLabel = computed(() => domainStatusLabel(strength.value));
const momentumLabelText = computed(() =>
  momentum.value != null ? momentumLabel(momentum.value) : ''
);
const interpretation = computed(() =>
  interpretStrengthScore(strength.value, activeDomain.value?.label || 'This area')
);
const quadrantLabel = computed(() => {
  const q = matrixQuadrant(strength.value, importance.value);
  return q ? MATRIX_QUADRANT_LABELS[q] : null;
});

const canShowMomentum = computed(() => {
  if (!enableMomentum.value || strength.value == null) return false;
  if (enableImportance.value && importance.value == null) return false;
  return true;
});

const canShowReflections = computed(() => {
  if (strength.value == null) return false;
  if (enableImportance.value && importance.value == null) return false;
  if (enableMomentum.value && momentum.value == null) return false;
  return true;
});

const scoredCount = computed(
  () =>
    activeDomains.value.filter((d) => {
      const r = responseMap.value[d.key];
      return (
        r?.preferNotToAnswer ||
        r?.seasonStatus === 'not-relevant' ||
        r?.currentStrengthScore != null
      );
    }).length
);

const canAdvance = computed(() => {
  const r = responseMap.value[activeKey.value];
  return (
    r?.preferNotToAnswer ||
    r?.seasonStatus === 'not-relevant' ||
    r?.currentStrengthScore != null
  );
});

const nextLabel = computed(() => activeDomains.value[scoreIndex.value + 1]?.label || 'next');
const timeframeLabel = computed(
  () => TIMEFRAME_OPTIONS.find((o) => o.id === timeframe.value)?.label || 'Current life season'
);

const summary = computed(() =>
  buildMensLifeSummary(template.value, responses.value, {
    mode: mode.value,
    participantVersion: participantVersion.value,
    priorityKeys: priorityKeys.value
  })
);

function relatedLabels(ids) {
  return (ids || []).map((id) => RELATED_ASSESSMENT_LABELS[id] || id).join(', ');
}

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
        lifeStages: lifeStages.value,
        roles: roles.value,
        goals: goals.value,
        responses: responses.value,
        priorityKeys: priorityKeys.value,
        priorityTypes: { ...priorityTypes },
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
  [step, responses, priorityKeys, scoreIndex, participantVersion, mode, timeframe],
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
        currentStrengthScore: null,
        personalImportanceScore: null,
        currentMomentumScore: null,
        reflectionChips: [],
        personalDefinition: '',
        supportPreference: 'none',
        privateReflection: '',
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

function setStrength(n) {
  patchResponse(activeKey.value, {
    currentStrengthScore: n,
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

function markNotRelevant() {
  patchResponse(activeKey.value, {
    seasonStatus: 'not-relevant',
    currentStrengthScore: null
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
    if (!priorityTypes[key]) priorityTypes[key] = 'strengthen';
  } else {
    priorityKeys.value = priorityKeys.value.filter((k) => k !== key);
  }
}

function priorityTypeLabel(key) {
  const id = priorityTypes[key] || 'strengthen';
  return PRIORITY_TYPES.find((t) => t.id === id)?.label || id;
}

function goPlans() {
  for (const key of priorityKeys.value) {
    if (!planDrafts[key]) {
      planDrafts[key] = {
        personalDefinition:
          responseMap.value[key]?.personalDefinition || domainMap.value[key]?.definition || '',
        desiredExperience: '',
        currentPattern: '',
        existingStrength: '',
        smallestFirstAction: '',
        recurringCommitment: '',
        boundaryOrTradeoff: '',
        flexibleAlternative: '',
        restartPlan: '',
        successIndicator: '',
        confidenceScore: null,
        priorityType: priorityTypes[key] || 'strengthen'
      };
    }
  }
  step.value = 'plans';
}

async function finish() {
  if (assignedToken.value) {
    try {
      await flushStandardGuestAssessment({
        apiPrefix: '/mens-life',
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

function buildExport() {
  return {
    type: 'mens_life_guest',
    title: "Men's Life Assessment",
    visualExperience: 'The Life Framework',
    exportedAt: new Date().toISOString(),
    participantVersion: participantVersion.value,
    mode: mode.value,
    timeframe: timeframe.value,
    context: {
      lifeStages: lifeStages.value,
      roles: roles.value,
      goals: goals.value
    },
    summary: summary.value,
    domains: activeDomains.value.map((d) => ({
      key: d.key,
      label: d.label,
      ...(responseMap.value[d.key] || {})
    })),
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
  a.download = `mens-life-${new Date().toISOString().slice(0, 10)}.json`;
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
  scoreIndex.value = 0;
  Object.keys(planDrafts).forEach((k) => delete planDrafts[k]);
  step.value = 'welcome';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/mens-life/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value = "Men's Life template is not available yet. Run migration 927.";
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
          if (cached?.lifeStages) lifeStages.value = cached.lifeStages;
          if (cached?.roles) roles.value = cached.roles;
          if (cached?.goals) goals.value = cached.goals;
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
@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Manrope:wght@400;500;600;700&display=swap');

.ml-page {
  --ink: #1c1917;
  --muted: #78716c;
  --line: #e7e5e4;
  --bg: #fafaf9;
  --accent: #1e3a5f;
  --bronze: #92400e;
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 10% -8%, rgba(146, 64, 14, 0.08), transparent 55%),
    radial-gradient(700px 360px at 100% 0%, rgba(30, 58, 95, 0.08), transparent 50%),
    linear-gradient(180deg, #f5f5f4 0%, var(--bg) 40%);
  color: var(--ink);
  font-family: Manrope, system-ui, sans-serif;
  padding: 1.5rem 1rem 4rem;
}

.ml-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--muted);
}
.ml-state.error {
  color: #9f1239;
}

.ml-shell {
  max-width: 1140px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 40px rgba(28, 25, 23, 0.06);
}
.ml-shell--narrow {
  max-width: 660px;
}

.ml-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--bronze);
  font-weight: 700;
}
.ml-title {
  margin: 0.35rem 0 0.65rem;
  font-family: 'Libre Baskerville', Georgia, serif;
  font-size: clamp(1.5rem, 3vw, 2.1rem);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.ml-lead,
.ml-note,
.ml-meta,
.ml-clarify {
  color: #57534e;
  line-height: 1.6;
}
.ml-clarify {
  font-size: 0.9rem;
  padding: 0.75rem 1rem;
  background: #f5f5f4;
  border-radius: 12px;
}

.ml-actions,
.ml-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.25rem;
}
.ml-footer.sticky {
  position: sticky;
  bottom: 0.5rem;
  background: rgba(255, 255, 255, 0.95);
  border-top: 1px solid var(--line);
  padding: 0.85rem 0 0.25rem;
  z-index: 5;
}

.ml-btn {
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
.ml-btn.primary {
  background: var(--accent);
  border-color: #152a45;
  color: #fff;
}
.ml-btn.ghost {
  background: transparent;
}
.ml-btn.small {
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
}
.ml-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ml-bullets {
  padding-left: 1.2rem;
  color: #57534e;
  line-height: 1.7;
}
.ml-field-label {
  margin: 1rem 0 0.45rem;
  font-size: 0.85rem;
  font-weight: 650;
}
.ml-field {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.85rem;
  font-size: 0.9rem;
  color: #44403c;
}
.ml-field input,
.ml-field select,
.ml-field textarea {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  background: #fff;
}

.ml-mode-grid {
  display: grid;
  gap: 0.5rem;
}
.ml-mode {
  text-align: left;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 14px;
  padding: 0.75rem 0.85rem;
  cursor: pointer;
  display: grid;
  gap: 0.15rem;
}
.ml-mode span,
.ml-mode em {
  font-size: 0.8rem;
  color: var(--muted);
  font-style: normal;
}
.ml-mode.on {
  border-color: #a8a29e;
  background: #f5f5f4;
}

.ml-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.ml-chip {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
  cursor: pointer;
  color: #57534e;
}
.ml-chip.on {
  background: #1e3a5f;
  border-color: #1e3a5f;
  color: #fff;
}

.ml-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.ml-split {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.95fr);
  gap: 1.15rem;
  align-items: start;
}
.ml-aside {
  position: sticky;
  top: 1rem;
  display: grid;
  gap: 0.75rem;
}
.ml-systems {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.35rem;
}
.ml-systems > div {
  background: #fafaf9;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.4rem;
  text-align: center;
}
.ml-systems span {
  display: block;
  font-size: 0.58rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ml-systems strong {
  font-size: 0.95rem;
}

.ml-score-block {
  margin-bottom: 1.1rem;
}
.ml-score-block h2 {
  margin: 0 0 0.55rem;
  font-size: 1.05rem;
  font-family: 'Libre Baskerville', Georgia, serif;
}
.ml-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 0.4rem;
}
.ml-scores {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.3rem;
}
.ml-score {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 10px;
  min-height: 2.6rem;
  font-weight: 700;
  cursor: pointer;
}
.ml-score.on {
  background: var(--accent);
  border-color: #152a45;
  color: #fff;
}
.ml-score.soft.on {
  background: var(--bronze);
  border-color: #78350f;
}

.ml-gap-card {
  background: #f5f5f4;
  border: 1px solid #e7e5e4;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  margin-bottom: 1rem;
}
.ml-status-pill {
  display: inline-block;
  margin: 0.35rem 0 0;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: #e7e5e4;
  color: #44403c;
  font-size: 0.78rem;
  font-weight: 650;
}
.ml-live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.ml-momentum {
  margin: 0.45rem 0 0;
  font-size: 0.85rem;
  color: #57534e;
}
.ml-safety {
  margin-top: 0.75rem;
  padding: 0.75rem 0.9rem;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 12px;
  color: #9a3412;
  font-size: 0.88rem;
}
.ml-details {
  margin-top: 0.75rem;
}
.ml-details textarea {
  width: 100%;
  margin-top: 0.4rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.55rem 0.7rem;
  font: inherit;
}

.ml-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
  margin: 1rem 0;
}
.ml-stat {
  background: #fafaf9;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.7rem 0.8rem;
}
.ml-stat.highlight {
  background: #f0ebe3;
  border-color: #d6d3d1;
}
.ml-stat span {
  display: block;
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ml-stat strong {
  font-size: 1.05rem;
}

.ml-viz-row {
  margin: 1rem 0;
}
.ml-insight-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}
.ml-insight-grid article {
  background: #fafaf9;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.85rem 1rem;
}
.ml-insight-grid h2,
.ml-insights h2 {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  font-family: 'Libre Baskerville', Georgia, serif;
}
.ml-insight-grid ul,
.ml-insights ul {
  margin: 0;
  padding-left: 1.1rem;
  color: #57534e;
  font-size: 0.88rem;
  line-height: 1.55;
}
.ml-insights {
  margin: 1rem 0;
  padding: 0.9rem 1rem;
  background: #fafaf9;
  border-radius: 14px;
  border: 1px solid var(--line);
}

.ml-priority-list {
  display: grid;
  gap: 0.5rem;
}
.ml-priority {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.65rem;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.7rem 0.85rem;
  background: #fff;
}
.ml-priority em {
  display: block;
  font-style: normal;
  font-size: 0.8rem;
  color: var(--muted);
}
.ml-priority select {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.35rem 0.45rem;
  font: inherit;
}

.ml-plan-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 1rem;
  margin-bottom: 0.85rem;
  background: #fafaf9;
}
.ml-plan-card h2 {
  margin: 0 0 0.65rem;
  font-size: 1.05rem;
  font-family: 'Libre Baskerville', Georgia, serif;
}

@media (max-width: 900px) {
  .ml-split {
    grid-template-columns: 1fr;
  }
  .ml-aside {
    position: static;
  }
  .ml-systems,
  .ml-stats,
  .ml-insight-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 560px) {
  .ml-scores {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .ml-stats,
  .ml-insight-grid,
  .ml-systems {
    grid-template-columns: 1fr;
  }
  .ml-priority {
    grid-template-columns: auto 1fr;
  }
  .ml-priority select {
    grid-column: 1 / -1;
  }
}
@media print {
  .ml-page {
    background: #fff;
    padding: 0;
  }
  .ml-footer,
  .ml-actions .ml-btn.ghost {
    display: none;
  }
}
</style>
