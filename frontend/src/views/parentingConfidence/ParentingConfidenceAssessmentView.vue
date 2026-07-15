<template>
  <div class="pc-page">
    <button
      v-if="enableQuickExit && step !== 'welcome' && step !== 'how'"
      type="button"
      class="pc-exit"
      title="Quick Exit"
      @click="quickExit"
    >
      Quick Exit
    </button>

    <div v-if="loading" class="pc-state">Loading Parenting Confidence Assessment…</div>
    <div v-else-if="error" class="pc-state error">{{ error }}</div>

    <template v-else-if="template">
      <section v-if="step === 'welcome'" class="pc-shell pc-shell--narrow">
        <p class="pc-eyebrow">Parenting Confidence Assessment</p>
        <h1 class="pc-title">How Supported and Confident Do You Feel as a Parent?</h1>
        <p class="pc-lead">
          Parenting asks a lot of you — consistency, patience, boundaries, emotional guidance, communication,
          rest, confidence, support, and family balance. Different areas can feel strong and stretched at the
          same time.
        </p>
        <p class="pc-note">
          This assessment helps you notice where you already have capacity, where support would help most, and
          what deserves intention in this season. It is not a test of fitness to parent.
        </p>
        <p class="pc-meta">12 to 18 minutes · Parenting Support Map</p>
        <div class="pc-actions">
          <button type="button" class="pc-btn primary" @click="step = 'context'">
            Build My Parenting Support Map
          </button>
          <button type="button" class="pc-btn ghost" @click="step = 'how'">How This Assessment Works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="pc-shell pc-shell--narrow">
        <h1 class="pc-title">How This Assessment Works</h1>
        <ol class="pc-bullets">
          <li>Share optional context about your caregiving season.</li>
          <li>Rate Current Capacity—and Importance and Support Need when helpful—for each domain.</li>
          <li>Watch your Parenting Support Map take shape across four zones.</li>
          <li>Review the Capacity × Importance matrix and choose one to three priorities.</li>
          <li>Build a parenting support plan with actions you control.</li>
        </ol>
        <p class="pc-clarify">{{ template.settings?.disclaimer }}</p>
        <p class="pc-clarify">{{ template.settings?.safetyNote }}</p>
        <div class="pc-actions">
          <button type="button" class="pc-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="pc-btn primary" @click="step = 'context'">Continue</button>
        </div>
      </section>

      <section v-else-if="step === 'context'" class="pc-shell pc-shell--narrow">
        <p class="pc-eyebrow">Before you begin</p>
        <h1 class="pc-title">Your current caregiving season</h1>

        <p class="pc-field-label">Participant version</p>
        <div class="pc-mode-grid">
          <button
            v-for="v in PARTICIPANT_VERSION_OPTIONS"
            :key="v.id"
            type="button"
            class="pc-mode"
            :class="{ on: participantVersion === v.id }"
            @click="participantVersion = v.id"
          >
            <strong>{{ v.label }}</strong>
            <span>{{ v.description }}</span>
          </button>
        </div>

        <p class="pc-field-label">Assessment mode</p>
        <div class="pc-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="pc-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>

        <label class="pc-field">
          Assessment timeframe
          <select v-model="timeframe">
            <option v-for="o in TIMEFRAME_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>

        <p class="pc-field-label">Caregiver stage (optional)</p>
        <div class="pc-chips">
          <button
            v-for="s in CAREGIVER_STAGE_OPTIONS"
            :key="s"
            type="button"
            class="pc-chip"
            :class="{ on: caregiverStages.includes(s) }"
            @click="toggleList(caregiverStages, s)"
          >
            {{ s }}
          </button>
        </div>

        <p class="pc-field-label">Household (optional)</p>
        <div class="pc-chips">
          <button
            v-for="h in HOUSEHOLD_OPTIONS"
            :key="h"
            type="button"
            class="pc-chip"
            :class="{ on: households.includes(h) }"
            @click="toggleList(households, h)"
          >
            {{ h }}
          </button>
        </div>

        <p class="pc-field-label">Current goal (optional)</p>
        <div class="pc-chips">
          <button
            v-for="g in CURRENT_GOAL_OPTIONS"
            :key="g"
            type="button"
            class="pc-chip"
            :class="{ on: goals.includes(g) }"
            @click="toggleList(goals, g)"
          >
            {{ g }}
          </button>
        </div>

        <div class="pc-actions">
          <button type="button" class="pc-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="pc-btn primary" @click="startScoring">Begin →</button>
        </div>
      </section>

      <section v-else-if="step === 'score'" class="pc-shell pc-shell--split">
        <header class="pc-header">
          <div>
            <p class="pc-eyebrow">
              {{ scoredCount }} of {{ activeDomains.length }} completed ·
              {{ timeframeLabel }} · {{ saveStatus || 'Ready' }}
            </p>
            <h1 class="pc-title">{{ activeDomain?.label }}</h1>
            <p class="pc-lead">{{ activeDomain?.definition }}</p>
          </div>
        </header>

        <div class="pc-split">
          <div class="pc-panel">
            <div class="pc-score-block">
              <h2>{{ activeDomain?.primaryQuestion || 'How supported does your capacity feel in this area?' }}</h2>
              <div class="pc-scale-labels">
                <span>Needs meaningful support</span>
                <span>Strong and well supported</span>
              </div>
              <div class="pc-scores" role="group" :aria-label="`${activeDomain?.label} current capacity`">
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="pc-score"
                  :class="{ on: capacity === n }"
                  @click="setCapacity(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="capacity != null" class="pc-gap-card" role="status" aria-live="polite">
              <p>{{ interpretation }}</p>
              <p class="pc-status-pill">{{ statusLabel }}</p>
              <p class="pc-live">
                {{ activeDomain?.label }} Current Capacity updated to {{ capacity }} out of 10.
                <template v-if="importance != null">
                  Personal Importance is {{ importance }} out of 10.
                  {{ activeDomain?.label }} is categorized as {{ quadrantLabel || '—' }}.
                </template>
                Parenting Confidence Index is now {{ summary.parentingConfidenceIndex ?? '—' }} out of 100.
              </p>
            </div>

            <div v-if="capacity != null && enableImportance" class="pc-score-block">
              <h2>How important is this area in your current parenting season?</h2>
              <div class="pc-scale-labels">
                <span>Low importance</span>
                <span>Essential</span>
              </div>
              <div class="pc-scores">
                <button
                  v-for="n in 10"
                  :key="`i-${n}`"
                  type="button"
                  class="pc-score soft"
                  :class="{ on: importance === n }"
                  @click="patchResponse(activeKey, { personalImportanceScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="canShowSupportNeed" class="pc-score-block">
              <h2>How much additional support would help in this area?</h2>
              <div class="pc-scale-labels">
                <span>Little support needed</span>
                <span>Significant support needed</span>
              </div>
              <div class="pc-scores">
                <button
                  v-for="n in 10"
                  :key="`s-${n}`"
                  type="button"
                  class="pc-score soft"
                  :class="{ on: supportNeed === n }"
                  @click="patchResponse(activeKey, { supportNeedScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="canShowReflections" class="pc-score-block">
              <h2>{{ activeDomain?.reflectionPrompt || 'What most affects this area?' }}</h2>
              <div class="pc-chips">
                <button
                  v-for="chip in activeDomain?.reflectionOptions || []"
                  :key="chip"
                  type="button"
                  class="pc-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>

              <label class="pc-field">
                Optional note
                <textarea
                  :value="privateReflection"
                  rows="2"
                  placeholder="Anything you want to remember for yourself…"
                  @input="patchResponse(activeKey, { privateReflection: $event.target.value })"
                />
              </label>

              <label class="pc-field">
                Support preference
                <select
                  :value="supportPreference"
                  @change="patchResponse(activeKey, { supportPreference: $event.target.value })"
                >
                  <option v-for="o in SUPPORT_PREFERENCE_OPTIONS" :key="o.id" :value="o.id">
                    {{ o.label }}
                  </option>
                </select>
              </label>

              <div v-if="(activeDomain?.actionSuggestions || []).length" class="pc-suggestions">
                <p class="pc-field-label">Ideas you might try</p>
                <ul>
                  <li v-for="(s, i) in activeDomain.actionSuggestions.slice(0, 4)" :key="i">{{ s }}</li>
                </ul>
              </div>
            </div>

            <div class="pc-inline-actions">
              <button type="button" class="pc-btn ghost" @click="markNotRelevant">
                Not relevant in this season
              </button>
              <button
                type="button"
                class="pc-btn ghost"
                @click="
                  patchResponse(activeKey, {
                    preferNotToAnswer: true,
                    currentCapacityScore: null
                  });
                  nextScore();
                "
              >
                Prefer not to answer
              </button>
            </div>
          </div>

          <aside class="pc-aside">
            <ParentingSupportMap
              :domains="activeDomains"
              :responses="responses"
              :parenting-confidence-index="summary.parentingConfidenceIndex"
              :system-scores="summary.systemScores"
              :active-domain-id="activeKey"
              :selected-priority-domain-ids="priorityKeys"
              :strength-count="summary.strengthCount"
              :high-value-support-count="summary.highValueSupportCount"
              :interactive="true"
              compact
              v-model:display-mode="mapDisplayMode"
              @domain-select="jumpToDomain"
            />
            <div class="pc-systems">
              <div>
                <span>Guidance</span>
                <strong>{{ summary.systemScores?.guidanceAndStructure ?? '—' }}</strong>
              </div>
              <div>
                <span>Connection</span>
                <strong>{{ summary.systemScores?.connectionAndEmotionalSupport ?? '—' }}</strong>
              </div>
              <div>
                <span>Capacity</span>
                <strong>{{ summary.systemScores?.caregiverCapacity ?? '—' }}</strong>
              </div>
              <div>
                <span>Balance</span>
                <strong>{{ summary.systemScores?.familyIntegration ?? '—' }}</strong>
              </div>
            </div>
          </aside>
        </div>

        <footer class="pc-footer sticky">
          <button type="button" class="pc-btn ghost" :disabled="scoreIndex === 0" @click="scoreIndex -= 1">
            Back
          </button>
          <button type="button" class="pc-btn primary" :disabled="!canAdvance" @click="nextScore">
            {{
              scoreIndex >= activeDomains.length - 1
                ? 'See my map →'
                : `Continue to ${nextLabel} →`
            }}
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'complete-preview'" class="pc-shell pc-shell--narrow">
        <h1 class="pc-title">Your Parenting Support Map Is Ready</h1>
        <div class="pc-stats">
          <div class="pc-stat highlight">
            <span>Parenting Confidence Index</span>
            <strong>{{ summary.parentingConfidenceIndex ?? '—' }} / 100</strong>
          </div>
          <div class="pc-stat">
            <span>Description</span>
            <strong>{{ summary.statusLabel || '—' }}</strong>
          </div>
          <div class="pc-stat">
            <span>Current strength</span>
            <strong>{{ summary.strengths?.[0]?.label || '—' }}</strong>
          </div>
          <div class="pc-stat">
            <span>High-value support area</span>
            <strong>{{ summary.highValueSupportAreas?.[0]?.label || '—' }}</strong>
          </div>
        </div>
        <p class="pc-note">
          Strong parenting does not require every area to feel easy. Your map is a starting point for deciding
          where support would make the greatest difference.
        </p>
        <div class="pc-actions">
          <button type="button" class="pc-btn primary" @click="step = 'review'">
            Explore My Parenting Support Map
          </button>
          <button type="button" class="pc-btn ghost" @click="step = 'score'; scoreIndex = 0">
            Review My Responses
          </button>
        </div>
      </section>

      <section v-else-if="step === 'review'" class="pc-shell">
        <header class="pc-header">
          <div>
            <p class="pc-eyebrow">Your Parenting Support Map</p>
            <h1 class="pc-title">Strengths, support opportunities, and capacity across caregiving</h1>
          </div>
        </header>
        <p class="pc-clarify">{{ summary.indexClarification }}</p>
        <p class="pc-clarify">{{ summary.safetyNote }}</p>

        <div class="pc-stats">
          <div class="pc-stat highlight">
            <span>Index</span>
            <strong>{{ summary.parentingConfidenceIndex ?? '—' }}</strong>
          </div>
          <div class="pc-stat">
            <span>Weighted</span>
            <strong>{{ summary.importanceWeightedIndex ?? '—' }}</strong>
          </div>
          <div class="pc-stat">
            <span>Strengths</span>
            <strong>{{ summary.strengthCount || 0 }}</strong>
          </div>
          <div class="pc-stat">
            <span>Support areas</span>
            <strong>{{ summary.highValueSupportCount || 0 }}</strong>
          </div>
        </div>

        <div class="pc-viz-row">
          <ParentingSupportMap
            :domains="activeDomains"
            :responses="responses"
            :parenting-confidence-index="summary.parentingConfidenceIndex"
            :system-scores="summary.systemScores"
            :selected-priority-domain-ids="priorityKeys"
            :strength-count="summary.strengthCount"
            :high-value-support-count="summary.highValueSupportCount"
            v-model:display-mode="mapDisplayMode"
          />
        </div>

        <ParentingPriorityMatrix
          :domains="activeDomains"
          :responses="responses"
          :selected-priority-domain-ids="priorityKeys"
          :clarification="summary.matrixClarification"
        />

        <div class="pc-insight-grid">
          <article>
            <h2>Current strengths</h2>
            <ul>
              <li v-for="x in summary.strengths?.slice(0, 4) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — Capacity {{ x.currentCapacityScore }}
              </li>
              <li v-if="!(summary.strengths || []).length">No high strengths yet — that is okay.</li>
            </ul>
          </article>
          <article>
            <h2>High-value support areas</h2>
            <ul>
              <li
                v-for="x in summary.highValueSupportAreas?.slice(0, 4) || []"
                :key="x.domainKey"
              >
                <strong>{{ x.label }}</strong> — Capacity {{ x.currentCapacityScore }}, Importance
                {{ x.personalImportanceScore }}
              </li>
              <li v-if="!(summary.highValueSupportAreas || []).length">
                No high-value support gaps flagged.
              </li>
            </ul>
          </article>
          <article>
            <h2>Lower current priority</h2>
            <ul>
              <li v-for="x in summary.lowerPriority?.slice(0, 3) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — may not need immediate action
              </li>
              <li v-if="!(summary.lowerPriority || []).length">None identified.</li>
            </ul>
          </article>
        </div>

        <div v-if="summary.insights?.length" class="pc-insights">
          <h2>Insights</h2>
          <ul>
            <li v-for="(t, i) in summary.insights" :key="i">{{ t }}</li>
          </ul>
        </div>

        <footer class="pc-footer">
          <button type="button" class="pc-btn ghost" @click="step = 'score'; scoreIndex = 0">Edit scores</button>
          <button type="button" class="pc-btn primary" @click="step = 'priorities'">Choose priorities →</button>
        </footer>
      </section>

      <section v-else-if="step === 'priorities'" class="pc-shell pc-shell--narrow">
        <h1 class="pc-title">Which areas would make the greatest difference?</h1>
        <p class="pc-note">
          You do not have to select the lowest score. Choose where focused support would matter most.
          Select up to {{ maxPriorities }}.
        </p>
        <div class="pc-priority-list">
          <label v-for="d in activeDomains" :key="d.key" class="pc-priority">
            <input
              type="checkbox"
              :checked="priorityKeys.includes(d.key)"
              :disabled="!priorityKeys.includes(d.key) && priorityKeys.length >= maxPriorities"
              @change="togglePriority(d.key, $event.target.checked)"
            />
            <span>
              <strong>{{ d.label }}</strong>
              <em>
                Capacity {{ responseMap[d.key]?.currentCapacityScore ?? '—' }}
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
        <footer class="pc-footer">
          <button type="button" class="pc-btn ghost" @click="step = 'review'">Back</button>
          <button
            type="button"
            class="pc-btn primary"
            :disabled="!priorityKeys.length"
            @click="goPlans"
          >
            Build Parenting Support Plan →
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'plans'" class="pc-shell">
        <h1 class="pc-title">Parenting Support Plan</h1>
        <p class="pc-note">
          Focus on behavior and support you can influence. Asking for help can be a responsible parenting
          action.
        </p>
        <div v-for="key in priorityKeys" :key="key" class="pc-plan-card">
          <h2>{{ domainMap[key]?.label }} · {{ priorityTypeLabel(key) }}</h2>
          <p v-if="(domainMap[key]?.actionSuggestions || []).length" class="pc-suggestions-inline">
            Suggestion:
            {{ domainMap[key].actionSuggestions[0] }}
          </p>
          <label class="pc-field">
            What supported looks like to me
            <textarea v-model="planDrafts[key].personalDefinition" rows="2" />
          </label>
          <label class="pc-field">
            Desired experience
            <textarea v-model="planDrafts[key].desiredExperience" rows="2" />
          </label>
          <label class="pc-field">
            Current pattern
            <textarea v-model="planDrafts[key].currentPattern" rows="2" />
          </label>
          <label class="pc-field">
            Existing strength I can use
            <input v-model="planDrafts[key].existingStrength" type="text" />
          </label>
          <label class="pc-field">
            Smallest first action
            <input v-model="planDrafts[key].smallestFirstAction" type="text" />
          </label>
          <label class="pc-field">
            Recurring commitment
            <input v-model="planDrafts[key].recurringCommitment" type="text" />
          </label>
          <label class="pc-field">
            Support I will ask for
            <input v-model="planDrafts[key].supportAsk" type="text" />
          </label>
          <label class="pc-field">
            Boundary or tradeoff
            <input v-model="planDrafts[key].boundaryOrTradeoff" type="text" />
          </label>
          <label class="pc-field">
            Restart plan
            <input v-model="planDrafts[key].restartPlan" type="text" />
          </label>
          <label class="pc-field">
            Success indicator
            <input v-model="planDrafts[key].successIndicator" type="text" />
          </label>
          <label class="pc-field">
            Confidence (1–10)
            <input v-model.number="planDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="(planDrafts[key].confidenceScore || 10) < 7" class="pc-clarify">
            How could this commitment become smaller, clearer, or more supported?
          </p>
        </div>
        <footer class="pc-footer">
          <button type="button" class="pc-btn ghost" @click="step = 'priorities'">Back</button>
          <button type="button" class="pc-btn primary" @click="finish">Finish →</button>
        </footer>
      </section>

      <section v-else-if="step === 'done'" class="pc-shell pc-shell--narrow">
        <p class="pc-eyebrow">Complete</p>
        <h1 class="pc-title">Your Parenting Support Map</h1>
        <div class="pc-stats">
          <div class="pc-stat highlight">
            <span>Index</span>
            <strong>{{ summary.parentingConfidenceIndex ?? '—' }}</strong>
          </div>
          <div class="pc-stat">
            <span>Level</span>
            <strong>{{ summary.statusLabel }}</strong>
          </div>
        </div>
        <ParentingSupportMap
          :domains="activeDomains"
          :responses="responses"
          :parenting-confidence-index="summary.parentingConfidenceIndex"
          :selected-priority-domain-ids="priorityKeys"
          display-mode="capacity-and-importance"
        />
        <p class="pc-clarify">{{ summary.indexClarification }}</p>
        <div class="pc-actions">
          <button type="button" class="pc-btn primary" @click="downloadPdf">Print / Save PDF</button>
          <button type="button" class="pc-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="pc-btn ghost" @click="resetGuest">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import ParentingSupportMap from '../../components/parentingConfidence/ParentingSupportMap.vue';
import ParentingPriorityMatrix from '../../components/parentingConfidence/ParentingPriorityMatrix.vue';
import {
  PARTICIPANT_VERSION_OPTIONS,
  MODE_OPTIONS,
  SUPPORT_PREFERENCE_OPTIONS,
  PRIORITY_TYPES,
  CAREGIVER_STAGE_OPTIONS,
  HOUSEHOLD_OPTIONS,
  CURRENT_GOAL_OPTIONS,
  TIMEFRAME_OPTIONS,
  buildParentingConfidenceSummary,
  domainsForContext,
  domainStatusLabel,
  interpretCapacityScore,
  matrixQuadrant,
  MATRIX_QUADRANT_LABELS
} from '../../utils/parentingConfidence.js';

const route = useRoute();
const isGuest = computed(() => !!route.meta?.guestParentingConfidence);
const GUEST_KEY = 'pc-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const participantVersion = ref('general-caregiver');
const mode = ref('full');
const timeframe = ref('current-season');
const caregiverStages = ref([]);
const households = ref([]);
const goals = ref([]);
const responses = ref([]);
const priorityKeys = ref([]);
const priorityTypes = reactive({});
const scoreIndex = ref(0);
const saveStatus = ref('');
const planDrafts = reactive({});
const mapDisplayMode = ref('capacity-and-importance');

const settings = computed(() => template.value?.settings || {});
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 3));
const enableImportance = computed(() => settings.value.enableImportance !== false);
const enableSupportNeed = computed(() => settings.value.enableSupportNeed !== false);
const enableQuickExit = computed(() => settings.value.enableQuickExit !== false);

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
const capacity = computed(() => responseMap.value[activeKey.value]?.currentCapacityScore ?? null);
const importance = computed(
  () => responseMap.value[activeKey.value]?.personalImportanceScore ?? null
);
const supportNeed = computed(() => responseMap.value[activeKey.value]?.supportNeedScore ?? null);
const currentChips = computed(() => responseMap.value[activeKey.value]?.reflectionChips || []);
const supportPreference = computed(
  () => responseMap.value[activeKey.value]?.supportPreference || 'none'
);
const privateReflection = computed(
  () => responseMap.value[activeKey.value]?.privateReflection || ''
);
const statusLabel = computed(() => domainStatusLabel(capacity.value));
const interpretation = computed(() =>
  interpretCapacityScore(capacity.value, activeDomain.value?.label || 'This area')
);
const quadrantLabel = computed(() => {
  const q = matrixQuadrant(capacity.value, importance.value);
  return q ? MATRIX_QUADRANT_LABELS[q] : null;
});

const canShowSupportNeed = computed(() => {
  if (!enableSupportNeed.value || capacity.value == null) return false;
  if (enableImportance.value && importance.value == null) return false;
  return true;
});

const canShowReflections = computed(() => {
  if (capacity.value == null) return false;
  if (enableImportance.value && importance.value == null) return false;
  if (enableSupportNeed.value && supportNeed.value == null) return false;
  return true;
});

const scoredCount = computed(
  () =>
    activeDomains.value.filter((d) => {
      const r = responseMap.value[d.key];
      return (
        r?.preferNotToAnswer ||
        r?.seasonStatus === 'not-relevant' ||
        r?.currentCapacityScore != null
      );
    }).length
);

const canAdvance = computed(() => {
  const r = responseMap.value[activeKey.value];
  return (
    r?.preferNotToAnswer ||
    r?.seasonStatus === 'not-relevant' ||
    r?.currentCapacityScore != null
  );
});

const nextLabel = computed(() => activeDomains.value[scoreIndex.value + 1]?.label || 'next');
const timeframeLabel = computed(
  () => TIMEFRAME_OPTIONS.find((o) => o.id === timeframe.value)?.label || 'Current parenting season'
);

const summary = computed(() =>
  buildParentingConfidenceSummary(template.value, responses.value, {
    mode: mode.value,
    participantVersion: participantVersion.value,
    priorityKeys: priorityKeys.value
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
        caregiverStages: caregiverStages.value,
        households: households.value,
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
        currentCapacityScore: null,
        personalImportanceScore: null,
        supportNeedScore: null,
        demandLevelScore: null,
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

function setCapacity(n) {
  patchResponse(activeKey.value, {
    currentCapacityScore: n,
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
    currentCapacityScore: null
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
        smallestFirstAction: domainMap.value[key]?.actionSuggestions?.[0] || '',
        recurringCommitment: '',
        supportAsk: '',
        boundaryOrTradeoff: '',
        restartPlan: '',
        successIndicator: '',
        confidenceScore: null,
        priorityType: priorityTypes[key] || 'strengthen'
      };
    }
  }
  step.value = 'plans';
}

function finish() {
  step.value = 'done';
  persistGuest();
}

function quickExit() {
  const url = settings.value.quickExitUrl || 'https://www.weather.com';
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    // ignore
  }
  window.location.replace(url);
}

function buildExport() {
  return {
    type: 'parenting_confidence_guest',
    title: 'Parenting Confidence Assessment',
    visualExperience: 'Parenting Support Map',
    exportedAt: new Date().toISOString(),
    participantVersion: participantVersion.value,
    mode: mode.value,
    timeframe: timeframe.value,
    context: {
      caregiverStages: caregiverStages.value,
      households: households.value,
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
  a.download = `parenting-confidence-${new Date().toISOString().slice(0, 10)}.json`;
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
    const res = await api.get('/parenting-confidence/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value = 'Parenting Confidence template is not available yet. Run migration 929.';
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
          if (cached?.caregiverStages) caregiverStages.value = cached.caregiverStages;
          if (cached?.households) households.value = cached.households;
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
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Manrope:wght@400;500;600;700&display=swap');

.pc-page {
  --ink: #292524;
  --muted: #78716c;
  --line: #e7e5e4;
  --bg: #fafaf9;
  --ochre: #b45309;
  --earth: #92400e;
  --sage: #4d7c0f;
  --teal: #0f766e;
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 8% -10%, rgba(180, 83, 9, 0.1), transparent 55%),
    radial-gradient(720px 360px at 100% 0%, rgba(15, 118, 110, 0.08), transparent 50%),
    linear-gradient(180deg, #fff7ed 0%, var(--bg) 42%);
  color: var(--ink);
  font-family: Manrope, system-ui, sans-serif;
  padding: 1.5rem 1rem 4rem;
}

.pc-exit {
  position: fixed;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 40;
  appearance: none;
  border: 1px solid #fecaca;
  background: #fff;
  color: #9f1239;
  border-radius: 999px;
  padding: 0.45rem 0.85rem;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(41, 37, 36, 0.08);
}

.pc-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--muted);
}
.pc-state.error {
  color: #9f1239;
}

.pc-shell {
  max-width: 1140px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 40px rgba(41, 37, 36, 0.06);
}
.pc-shell--narrow {
  max-width: 660px;
}

.pc-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ochre);
  font-weight: 700;
}
.pc-title {
  margin: 0.35rem 0 0.65rem;
  font-family: Fraunces, Georgia, serif;
  font-size: clamp(1.5rem, 3vw, 2.1rem);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.pc-lead,
.pc-note,
.pc-meta,
.pc-clarify {
  color: #57534e;
  line-height: 1.6;
}
.pc-clarify {
  font-size: 0.9rem;
  padding: 0.75rem 1rem;
  background: #fff7ed;
  border-radius: 12px;
}

.pc-actions,
.pc-footer,
.pc-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.25rem;
}
.pc-footer.sticky {
  position: sticky;
  bottom: 0.5rem;
  background: rgba(255, 255, 255, 0.95);
  border-top: 1px solid var(--line);
  padding: 0.85rem 0 0.25rem;
  z-index: 5;
}

.pc-btn {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  border-radius: 12px;
  padding: 0.7rem 1.05rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}
.pc-btn.primary {
  background: linear-gradient(135deg, #b45309, #92400e);
  border-color: transparent;
  color: #fff;
}
.pc-btn.ghost {
  background: #fff;
}
.pc-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pc-field-label {
  margin: 1rem 0 0.45rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.pc-mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.55rem;
}
.pc-mode {
  appearance: none;
  text-align: left;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 14px;
  padding: 0.75rem;
  cursor: pointer;
  display: grid;
  gap: 0.2rem;
}
.pc-mode.on {
  border-color: #fdba74;
  background: #fff7ed;
}
.pc-mode strong {
  font-size: 0.9rem;
}
.pc-mode span,
.pc-mode em {
  font-size: 0.78rem;
  color: var(--muted);
  font-style: normal;
}

.pc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.pc-chip {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.75rem;
  font-size: 0.82rem;
  cursor: pointer;
}
.pc-chip.on {
  background: #ecfccb;
  border-color: #bef264;
  color: #3f6212;
}

.pc-field {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.85rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: #44403c;
}
.pc-field input,
.pc-field select,
.pc-field textarea {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  font: inherit;
  font-weight: 500;
  color: var(--ink);
  background: #fff;
}

.pc-header {
  margin-bottom: 0.75rem;
}
.pc-split {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 1.1rem;
  align-items: start;
}
.pc-aside {
  position: sticky;
  top: 1rem;
  display: grid;
  gap: 0.75rem;
}
.pc-systems {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
}
.pc-systems > div {
  background: #fff7ed;
  border: 1px solid #ffedd5;
  border-radius: 12px;
  padding: 0.55rem 0.65rem;
}
.pc-systems span {
  display: block;
  font-size: 0.68rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pc-systems strong {
  font-family: Fraunces, Georgia, serif;
  font-size: 1.1rem;
}

.pc-score-block {
  margin-top: 1rem;
}
.pc-score-block h2 {
  margin: 0 0 0.55rem;
  font-size: 1.05rem;
  font-family: Fraunces, Georgia, serif;
}
.pc-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 0.4rem;
}
.pc-scores {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.3rem;
}
.pc-score {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 10px;
  padding: 0.55rem 0;
  font-weight: 700;
  cursor: pointer;
}
.pc-score.on {
  background: linear-gradient(135deg, #b45309, #92400e);
  border-color: transparent;
  color: #fff;
}
.pc-score.soft.on {
  background: #0f766e;
}

.pc-gap-card {
  margin-top: 0.85rem;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(255, 247, 237, 0.95), rgba(236, 253, 245, 0.7));
  border: 1px solid #ffedd5;
}
.pc-status-pill {
  display: inline-block;
  margin: 0.35rem 0;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #fdba74;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--earth);
}
.pc-live {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #57534e;
}

.pc-suggestions,
.pc-suggestions-inline {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #57534e;
}
.pc-suggestions ul {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
}

.pc-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.55rem;
  margin: 1rem 0;
}
.pc-stat {
  background: #fafaf9;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.75rem;
}
.pc-stat.highlight {
  background: #fff7ed;
  border-color: #fdba74;
}
.pc-stat span {
  display: block;
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pc-stat strong {
  display: block;
  margin-top: 0.25rem;
  font-family: Fraunces, Georgia, serif;
  font-size: 1.15rem;
}

.pc-viz-row {
  margin: 1rem 0;
}
.pc-insight-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}
.pc-insight-grid article,
.pc-insights,
.pc-plan-card {
  background: #fafaf9;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.9rem 1rem;
}
.pc-insight-grid h2,
.pc-insights h2,
.pc-plan-card h2 {
  margin: 0 0 0.55rem;
  font-size: 1rem;
  font-family: Fraunces, Georgia, serif;
}
.pc-insight-grid ul,
.pc-insights ul,
.pc-bullets {
  margin: 0;
  padding-left: 1.1rem;
  color: #57534e;
  line-height: 1.55;
}
.pc-priority-list {
  display: grid;
  gap: 0.55rem;
  margin-top: 1rem;
}
.pc-priority {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.65rem;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
}
.pc-priority em {
  display: block;
  font-style: normal;
  font-size: 0.8rem;
  color: var(--muted);
}
.pc-plan-card {
  margin-top: 0.85rem;
}

@media (max-width: 900px) {
  .pc-split {
    grid-template-columns: 1fr;
  }
  .pc-aside {
    position: static;
  }
}

@media print {
  .pc-exit,
  .pc-footer,
  .pc-actions {
    display: none !important;
  }
  .pc-page {
    background: #fff;
    padding: 0;
  }
  .pc-shell {
    box-shadow: none;
    border: none;
  }
}
</style>
