<template>
  <div class="ff-page">
    <button
      v-if="enableQuickExit && step !== 'welcome' && step !== 'how'"
      type="button"
      class="ff-exit"
      title="Quick Exit"
      @click="quickExit"
    >
      Quick Exit
    </button>

    <div v-if="loading" class="ff-state">Loading Family Functioning Assessment…</div>
    <div v-else-if="error" class="ff-state error">{{ error }}</div>

    <template v-else-if="template">
      <section v-if="step === 'welcome'" class="ff-shell ff-shell--narrow">
        <p class="ff-eyebrow">Family Functioning Assessment</p>
        <h1 class="ff-title">How Is Family Life Working Right Now?</h1>
        <p class="ff-lead">
          Family life asks a lot — communication, respect, routines, teamwork, conflict repair, emotional
          safety, connection, flexibility, responsibilities, and fun. Different areas can feel strong and
          stretched at the same time.
        </p>
        <p class="ff-note">
          This assessment helps you notice where family life already works, where support would help most, and
          what deserves intention in this season. It is one person’s reflection — not a judgment of your family.
        </p>
        <p class="ff-meta">12 to 18 minutes · Family Ecosystem Map</p>
        <div class="ff-actions">
          <button type="button" class="ff-btn primary" @click="step = 'context'">
            Build My Family Ecosystem Map
          </button>
          <button type="button" class="ff-btn ghost" @click="step = 'how'">How This Assessment Works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="ff-shell ff-shell--narrow">
        <h1 class="ff-title">How This Assessment Works</h1>
        <ol class="ff-bullets">
          <li>Share optional context about your household season.</li>
          <li>Rate Current Functioning—and Importance and Support Need when helpful—for each domain.</li>
          <li>Watch your Family Ecosystem Map take shape across four zones.</li>
          <li>Review the Functioning × Importance matrix and choose one to three priorities.</li>
          <li>Build a Family Functioning Plan with actions you can influence.</li>
        </ol>
        <p class="ff-clarify">{{ template.settings?.disclaimer }}</p>
        <p class="ff-clarify">{{ template.settings?.safetyNote }}</p>
        <div class="ff-actions">
          <button type="button" class="ff-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="ff-btn primary" @click="step = 'context'">Continue</button>
        </div>
      </section>

      <section v-else-if="step === 'context'" class="ff-shell ff-shell--narrow">
        <p class="ff-eyebrow">Before you begin</p>
        <h1 class="ff-title">Your current family season</h1>

        <p class="ff-field-label">Participant version</p>
        <div class="ff-mode-grid">
          <button
            v-for="v in PARTICIPANT_VERSION_OPTIONS"
            :key="v.id"
            type="button"
            class="ff-mode"
            :class="{ on: participantVersion === v.id }"
            @click="participantVersion = v.id"
          >
            <strong>{{ v.label }}</strong>
            <span>{{ v.description }}</span>
          </button>
        </div>

        <p class="ff-field-label">Assessment mode</p>
        <div class="ff-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="ff-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>

        <label class="ff-field">
          Assessment timeframe
          <select v-model="timeframe">
            <option v-for="o in TIMEFRAME_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>

        <p class="ff-field-label">Household stage (optional)</p>
        <div class="ff-chips">
          <button
            v-for="s in HOUSEHOLD_STAGE_OPTIONS"
            :key="s"
            type="button"
            class="ff-chip"
            :class="{ on: householdStages.includes(s) }"
            @click="toggleList(householdStages, s)"
          >
            {{ s }}
          </button>
        </div>

        <p class="ff-field-label">Household (optional)</p>
        <div class="ff-chips">
          <button
            v-for="h in HOUSEHOLD_OPTIONS"
            :key="h"
            type="button"
            class="ff-chip"
            :class="{ on: households.includes(h) }"
            @click="toggleList(households, h)"
          >
            {{ h }}
          </button>
        </div>

        <p class="ff-field-label">Current goal (optional)</p>
        <div class="ff-chips">
          <button
            v-for="g in CURRENT_GOAL_OPTIONS"
            :key="g"
            type="button"
            class="ff-chip"
            :class="{ on: goals.includes(g) }"
            @click="toggleList(goals, g)"
          >
            {{ g }}
          </button>
        </div>

        <div class="ff-actions">
          <button type="button" class="ff-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="ff-btn primary" @click="startScoring">Begin →</button>
        </div>
      </section>

      <section v-else-if="step === 'score'" class="ff-shell ff-shell--split">
        <header class="ff-header">
          <div>
            <p class="ff-eyebrow">
              {{ scoredCount }} of {{ activeDomains.length }} completed ·
              {{ timeframeLabel }} · {{ saveStatus || 'Ready' }}
            </p>
            <h1 class="ff-title">{{ activeDomain?.label }}</h1>
            <p class="ff-lead">{{ activeDomain?.definition }}</p>
          </div>
        </header>

        <div class="ff-split">
          <div class="ff-panel">
            <div class="ff-score-block">
              <h2>{{ activeDomain?.primaryQuestion || 'How workable does this area feel right now?' }}</h2>
              <div class="ff-scale-labels">
                <span>Needs meaningful attention</span>
                <span>Strong and workable</span>
              </div>
              <div class="ff-scores" role="group" :aria-label="`${activeDomain?.label} current functioning`">
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="ff-score"
                  :class="{ on: functioning === n }"
                  @click="setFunctioning(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="functioning != null" class="ff-gap-card" role="status" aria-live="polite">
              <p>{{ interpretation }}</p>
              <p class="ff-status-pill">{{ statusLabel }}</p>
              <p class="ff-live">
                {{ activeDomain?.label }} Current Functioning updated to {{ functioning }} out of 10.
                <template v-if="importance != null">
                  Personal Importance is {{ importance }} out of 10.
                  {{ activeDomain?.label }} is categorized as {{ quadrantLabel || '—' }}.
                </template>
                Family Functioning Index is now {{ summary.familyFunctioningIndex ?? '—' }} out of 100.
              </p>
            </div>

            <div v-if="functioning != null && enableImportance" class="ff-score-block">
              <h2>How important is this area in your current family season?</h2>
              <div class="ff-scale-labels">
                <span>Low importance</span>
                <span>Essential</span>
              </div>
              <div class="ff-scores">
                <button
                  v-for="n in 10"
                  :key="`i-${n}`"
                  type="button"
                  class="ff-score soft"
                  :class="{ on: importance === n }"
                  @click="patchResponse(activeKey, { personalImportanceScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="canShowSupportNeed" class="ff-score-block">
              <h2>How much additional support would help in this area?</h2>
              <div class="ff-scale-labels">
                <span>Little support needed</span>
                <span>Significant support needed</span>
              </div>
              <div class="ff-scores">
                <button
                  v-for="n in 10"
                  :key="`s-${n}`"
                  type="button"
                  class="ff-score soft"
                  :class="{ on: supportNeed === n }"
                  @click="patchResponse(activeKey, { supportNeedScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="canShowReflections" class="ff-score-block">
              <h2>{{ activeDomain?.reflectionPrompt || 'What most affects this area?' }}</h2>
              <div class="ff-chips">
                <button
                  v-for="chip in activeDomain?.reflectionOptions || []"
                  :key="chip"
                  type="button"
                  class="ff-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>

              <label class="ff-field">
                Optional note
                <textarea
                  :value="privateReflection"
                  rows="2"
                  placeholder="Anything you want to remember for yourself…"
                  @input="patchResponse(activeKey, { privateReflection: $event.target.value })"
                />
              </label>

              <label class="ff-field">
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

              <div v-if="(activeDomain?.actionSuggestions || []).length" class="ff-suggestions">
                <p class="ff-field-label">Ideas you might try</p>
                <ul>
                  <li v-for="(s, i) in activeDomain.actionSuggestions.slice(0, 4)" :key="i">{{ s }}</li>
                </ul>
              </div>
            </div>

            <div class="ff-inline-actions">
              <button type="button" class="ff-btn ghost" @click="markNotRelevant">
                Not relevant in this season
              </button>
              <button
                type="button"
                class="ff-btn ghost"
                @click="
                  patchResponse(activeKey, {
                    preferNotToAnswer: true,
                    currentFunctioningScore: null
                  });
                  nextScore();
                "
              >
                Prefer not to answer
              </button>
            </div>
          </div>

          <aside class="ff-aside">
            <FamilyEcosystemMap
              :domains="activeDomains"
              :responses="responses"
              :family-functioning-index="summary.familyFunctioningIndex"
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
            <div class="ff-systems">
              <div>
                <span>Comm &amp; Safety</span>
                <strong>{{ summary.systemScores?.communicationAndSafety ?? '—' }}</strong>
              </div>
              <div>
                <span>Structure</span>
                <strong>{{ summary.systemScores?.structureAndCooperation ?? '—' }}</strong>
              </div>
              <div>
                <span>Connection</span>
                <strong>{{ summary.systemScores?.connectionAndEnjoyment ?? '—' }}</strong>
              </div>
              <div>
                <span>Adaptability</span>
                <strong>{{ summary.systemScores?.adaptability ?? '—' }}</strong>
              </div>
            </div>
          </aside>
        </div>

        <footer class="ff-footer sticky">
          <button type="button" class="ff-btn ghost" :disabled="scoreIndex === 0" @click="scoreIndex -= 1">
            Back
          </button>
          <button type="button" class="ff-btn primary" :disabled="!canAdvance" @click="nextScore">
            {{
              scoreIndex >= activeDomains.length - 1
                ? 'See my map →'
                : `Continue to ${nextLabel} →`
            }}
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'complete-preview'" class="ff-shell ff-shell--narrow">
        <h1 class="ff-title">Your Family Ecosystem Map Is Ready</h1>
        <p class="ff-solo">{{ summary.soloResultsLabel }}</p>
        <div class="ff-stats">
          <div class="ff-stat highlight">
            <span>Family Functioning Index</span>
            <strong>{{ summary.familyFunctioningIndex ?? '—' }} / 100</strong>
          </div>
          <div class="ff-stat">
            <span>Description</span>
            <strong>{{ summary.statusLabel || '—' }}</strong>
          </div>
          <div class="ff-stat">
            <span>Current strength</span>
            <strong>{{ summary.strengths?.[0]?.label || '—' }}</strong>
          </div>
          <div class="ff-stat">
            <span>High-value support area</span>
            <strong>{{ summary.highValueSupportAreas?.[0]?.label || '—' }}</strong>
          </div>
        </div>
        <p class="ff-note">
          Strong family life does not require every area to feel easy. Your map is a starting point for deciding
          where attention would make the greatest difference.
        </p>
        <div class="ff-actions">
          <button type="button" class="ff-btn primary" @click="step = 'review'">
            Explore My Family Ecosystem Map
          </button>
          <button type="button" class="ff-btn ghost" @click="step = 'score'; scoreIndex = 0">
            Review My Responses
          </button>
        </div>
      </section>

      <section v-else-if="step === 'review'" class="ff-shell">
        <header class="ff-header">
          <div>
            <p class="ff-eyebrow">Your Family Ecosystem Map</p>
            <h1 class="ff-title">Strengths, support opportunities, and functioning across family life</h1>
          </div>
        </header>
        <p class="ff-solo">{{ summary.soloResultsLabel }}</p>
        <p class="ff-clarify">{{ summary.indexClarification }}</p>
        <p class="ff-clarify">{{ summary.safetyNote }}</p>

        <div class="ff-stats">
          <div class="ff-stat highlight">
            <span>Index</span>
            <strong>{{ summary.familyFunctioningIndex ?? '—' }}</strong>
          </div>
          <div class="ff-stat">
            <span>Weighted</span>
            <strong>{{ summary.importanceWeightedIndex ?? '—' }}</strong>
          </div>
          <div class="ff-stat">
            <span>Strengths</span>
            <strong>{{ summary.strengthCount || 0 }}</strong>
          </div>
          <div class="ff-stat">
            <span>Support areas</span>
            <strong>{{ summary.highValueSupportCount || 0 }}</strong>
          </div>
        </div>

        <div class="ff-viz-row">
          <FamilyEcosystemMap
            :domains="activeDomains"
            :responses="responses"
            :family-functioning-index="summary.familyFunctioningIndex"
            :system-scores="summary.systemScores"
            :selected-priority-domain-ids="priorityKeys"
            :strength-count="summary.strengthCount"
            :high-value-support-count="summary.highValueSupportCount"
            v-model:display-mode="mapDisplayMode"
          />
        </div>

        <FamilyFunctioningMatrix
          :domains="activeDomains"
          :responses="responses"
          :selected-priority-domain-ids="priorityKeys"
          :clarification="summary.matrixClarification"
        />

        <div class="ff-insight-grid">
          <article>
            <h2>Current strengths</h2>
            <ul>
              <li v-for="x in summary.strengths?.slice(0, 4) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — Functioning {{ x.currentFunctioningScore }}
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
                <strong>{{ x.label }}</strong> — Functioning {{ x.currentFunctioningScore }}, Importance
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

        <div v-if="summary.insights?.length" class="ff-insights">
          <h2>Insights</h2>
          <ul>
            <li v-for="(t, i) in summary.insights" :key="i">{{ t }}</li>
          </ul>
        </div>

        <p class="ff-clarify muted">{{ summary.violenceDisclosureNote }}</p>

        <footer class="ff-footer">
          <button type="button" class="ff-btn ghost" @click="step = 'score'; scoreIndex = 0">Edit scores</button>
          <button type="button" class="ff-btn primary" @click="step = 'priorities'">Choose priorities →</button>
        </footer>
      </section>

      <section v-else-if="step === 'priorities'" class="ff-shell ff-shell--narrow">
        <h1 class="ff-title">Which areas would make the greatest difference?</h1>
        <p class="ff-note">
          You do not have to select the lowest score. Choose where focused attention would matter most.
          Select up to {{ maxPriorities }}.
        </p>
        <div class="ff-priority-list">
          <label v-for="d in activeDomains" :key="d.key" class="ff-priority">
            <input
              type="checkbox"
              :checked="priorityKeys.includes(d.key)"
              :disabled="!priorityKeys.includes(d.key) && priorityKeys.length >= maxPriorities"
              @change="togglePriority(d.key, $event.target.checked)"
            />
            <span>
              <strong>{{ d.label }}</strong>
              <em>
                Functioning {{ responseMap[d.key]?.currentFunctioningScore ?? '—' }}
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
        <footer class="ff-footer">
          <button type="button" class="ff-btn ghost" @click="step = 'review'">Back</button>
          <button
            type="button"
            class="ff-btn primary"
            :disabled="!priorityKeys.length"
            @click="goPlans"
          >
            Build Family Functioning Plan →
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'plans'" class="ff-shell">
        <h1 class="ff-title">Family Functioning Plan</h1>
        <p class="ff-note">
          Focus on behaviors and supports you can influence. Asking for help can be a responsible family action.
          If violence or fear for safety is present, prioritize qualified confidential support — not family meetings.
        </p>
        <div v-for="key in priorityKeys" :key="key" class="ff-plan-card">
          <h2>{{ domainMap[key]?.label }} · {{ priorityTypeLabel(key) }}</h2>
          <p v-if="(domainMap[key]?.actionSuggestions || []).length" class="ff-suggestions-inline">
            Suggestion:
            {{ domainMap[key].actionSuggestions[0] }}
          </p>
          <label class="ff-field">
            What workable looks like to me
            <textarea v-model="planDrafts[key].personalDefinition" rows="2" />
          </label>
          <label class="ff-field">
            Desired experience
            <textarea v-model="planDrafts[key].desiredExperience" rows="2" />
          </label>
          <label class="ff-field">
            Current pattern
            <textarea v-model="planDrafts[key].currentPattern" rows="2" />
          </label>
          <label class="ff-field">
            Existing strength I can use
            <input v-model="planDrafts[key].existingStrength" type="text" />
          </label>
          <label class="ff-field">
            Smallest first action
            <input v-model="planDrafts[key].smallestFirstAction" type="text" />
          </label>
          <label class="ff-field">
            Recurring commitment
            <input v-model="planDrafts[key].recurringCommitment" type="text" />
          </label>
          <label class="ff-field">
            Support I will ask for
            <input v-model="planDrafts[key].supportAsk" type="text" />
          </label>
          <label class="ff-field">
            Boundary or tradeoff
            <input v-model="planDrafts[key].boundaryOrTradeoff" type="text" />
          </label>
          <label class="ff-field">
            Restart plan
            <input v-model="planDrafts[key].restartPlan" type="text" />
          </label>
          <label class="ff-field">
            Success indicator
            <input v-model="planDrafts[key].successIndicator" type="text" />
          </label>
          <label class="ff-field">
            Confidence (1–10)
            <input v-model.number="planDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="(planDrafts[key].confidenceScore || 10) < 7" class="ff-clarify">
            How could this commitment become smaller, clearer, or more supported?
          </p>
        </div>
        <footer class="ff-footer">
          <button type="button" class="ff-btn ghost" @click="step = 'priorities'">Back</button>
          <button type="button" class="ff-btn primary" @click="finish">Finish →</button>
        </footer>
      </section>

      <section v-else-if="step === 'done'" class="ff-shell ff-shell--narrow">
        <p class="ff-eyebrow">Complete</p>
        <h1 class="ff-title">Your Family Ecosystem Map</h1>
        <p class="ff-solo">{{ summary.soloResultsLabel }}</p>
        <div class="ff-stats">
          <div class="ff-stat highlight">
            <span>Index</span>
            <strong>{{ summary.familyFunctioningIndex ?? '—' }}</strong>
          </div>
          <div class="ff-stat">
            <span>Level</span>
            <strong>{{ summary.statusLabel }}</strong>
          </div>
        </div>
        <FamilyEcosystemMap
          :domains="activeDomains"
          :responses="responses"
          :family-functioning-index="summary.familyFunctioningIndex"
          :selected-priority-domain-ids="priorityKeys"
          display-mode="functioning-and-importance"
        />
        <p class="ff-clarify">{{ summary.indexClarification }}</p>
        <div class="ff-actions">
          <button type="button" class="ff-btn primary" @click="downloadPdf">Print / Save PDF</button>
          <button type="button" class="ff-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="ff-btn ghost" @click="resetGuest">Start over</button>
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
import FamilyEcosystemMap from '../../components/familyFunctioning/FamilyEcosystemMap.vue';
import FamilyFunctioningMatrix from '../../components/familyFunctioning/FamilyFunctioningMatrix.vue';
import {
  PARTICIPANT_VERSION_OPTIONS,
  MODE_OPTIONS,
  SUPPORT_PREFERENCE_OPTIONS,
  PRIORITY_TYPES,
  HOUSEHOLD_STAGE_OPTIONS,
  HOUSEHOLD_OPTIONS,
  CURRENT_GOAL_OPTIONS,
  TIMEFRAME_OPTIONS,
  buildFamilyFunctioningSummary,
  domainsForContext,
  domainStatusLabel,
  interpretFunctioningScore,
  matrixQuadrant,
  MATRIX_QUADRANT_LABELS
} from '../../utils/familyFunctioning.js';

const route = useRoute();
const assignedToken = computed(() => readAccessTokenFromRoute(route));
const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const isGuest = computed(() => !!route.meta?.guestFamilyFunctioning);
const GUEST_KEY = 'ff-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const participantVersion = ref('general-household');
const mode = ref('full');
const timeframe = ref('current-season');
const householdStages = ref([]);
const households = ref([]);
const goals = ref([]);
const responses = ref([]);
const priorityKeys = ref([]);
const priorityTypes = reactive({});
const scoreIndex = ref(0);
const saveStatus = ref('');
const planDrafts = reactive({});
const mapDisplayMode = ref('functioning-and-importance');

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
const functioning = computed(
  () => responseMap.value[activeKey.value]?.currentFunctioningScore ?? null
);
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
const statusLabel = computed(() => domainStatusLabel(functioning.value));
const interpretation = computed(() =>
  interpretFunctioningScore(functioning.value, activeDomain.value?.label || 'This area')
);
const quadrantLabel = computed(() => {
  const q = matrixQuadrant(functioning.value, importance.value);
  return q ? MATRIX_QUADRANT_LABELS[q] : null;
});

const canShowSupportNeed = computed(() => {
  if (!enableSupportNeed.value || functioning.value == null) return false;
  if (enableImportance.value && importance.value == null) return false;
  return true;
});

const canShowReflections = computed(() => {
  if (functioning.value == null) return false;
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
        r?.currentFunctioningScore != null
      );
    }).length
);

const canAdvance = computed(() => {
  const r = responseMap.value[activeKey.value];
  return (
    r?.preferNotToAnswer ||
    r?.seasonStatus === 'not-relevant' ||
    r?.currentFunctioningScore != null
  );
});

const nextLabel = computed(() => activeDomains.value[scoreIndex.value + 1]?.label || 'next');
const timeframeLabel = computed(
  () => TIMEFRAME_OPTIONS.find((o) => o.id === timeframe.value)?.label || 'Current family season'
);

const summary = computed(() =>
  buildFamilyFunctioningSummary(template.value, responses.value, {
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
        householdStages: householdStages.value,
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
        currentFunctioningScore: null,
        personalImportanceScore: null,
        supportNeedScore: null,
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

function setFunctioning(n) {
  patchResponse(activeKey.value, {
    currentFunctioningScore: n,
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
    currentFunctioningScore: null
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

async function finish() {
  if (assignedToken.value) {
    try {
      await flushStandardGuestAssessment({
        apiPrefix: '/family-functioning',
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
    type: 'family_functioning_guest',
    title: 'Family Functioning Assessment',
    visualExperience: 'Family Ecosystem Map',
    exportedAt: new Date().toISOString(),
    participantVersion: participantVersion.value,
    mode: mode.value,
    timeframe: timeframe.value,
    context: {
      householdStages: householdStages.value,
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
  a.download = `family-functioning-${new Date().toISOString().slice(0, 10)}.json`;
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
    const res = await api.get('/family-functioning/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value = 'Family Functioning template is not available yet. Run migration 931.';
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
          if (cached?.householdStages) householdStages.value = cached.householdStages;
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
@import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500;6..72,700&family=Figtree:wght@400;500;600;700&display=swap');

.ff-page {
  --ink: #1e293b;
  --muted: #64748b;
  --line: #e2e8f0;
  --bg: #f8fafc;
  --slate: #475569;
  --green: #3f6212;
  --blue: #1d4ed8;
  --terracotta: #9a3412;
  --ochre: #a16207;
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 8% -10%, rgba(71, 85, 105, 0.12), transparent 55%),
    radial-gradient(720px 360px at 100% 0%, rgba(63, 98, 18, 0.08), transparent 50%),
    radial-gradient(640px 320px at 50% 100%, rgba(154, 52, 18, 0.06), transparent 55%),
    linear-gradient(180deg, #f1f5f9 0%, var(--bg) 42%);
  color: var(--ink);
  font-family: Figtree, system-ui, sans-serif;
  padding: 1.5rem 1rem 4rem;
}

.ff-exit {
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
  box-shadow: 0 8px 20px rgba(30, 41, 59, 0.08);
}

.ff-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--muted);
}
.ff-state.error {
  color: #9f1239;
}

.ff-shell {
  max-width: 1140px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 40px rgba(30, 41, 59, 0.06);
}
.ff-shell--narrow {
  max-width: 660px;
}

.ff-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--slate);
  font-weight: 700;
}
.ff-title {
  margin: 0.35rem 0 0.65rem;
  font-family: Newsreader, Georgia, serif;
  font-size: clamp(1.5rem, 3vw, 2.1rem);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
.ff-lead,
.ff-note,
.ff-meta,
.ff-clarify,
.ff-solo {
  color: #475569;
  line-height: 1.6;
}
.ff-solo {
  font-style: italic;
  font-size: 0.95rem;
}
.ff-clarify {
  font-size: 0.9rem;
  padding: 0.75rem 1rem;
  background: #f1f5f9;
  border-radius: 12px;
}
.ff-clarify.muted {
  background: #fff7ed;
  border: 1px solid #ffedd5;
  color: #9a3412;
}

.ff-actions,
.ff-footer,
.ff-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.25rem;
}
.ff-footer.sticky {
  position: sticky;
  bottom: 0.5rem;
  background: rgba(255, 255, 255, 0.95);
  border-top: 1px solid var(--line);
  padding: 0.85rem 0 0.25rem;
  z-index: 5;
}

.ff-btn {
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
.ff-btn.primary {
  background: linear-gradient(135deg, #475569, #334155);
  border-color: transparent;
  color: #fff;
}
.ff-btn.ghost {
  background: #fff;
}
.ff-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ff-field-label {
  margin: 1rem 0 0.45rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.ff-mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.55rem;
}
.ff-mode {
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
.ff-mode.on {
  border-color: #94a3b8;
  background: #f1f5f9;
}
.ff-mode strong {
  font-size: 0.9rem;
}
.ff-mode span,
.ff-mode em {
  font-size: 0.78rem;
  color: var(--muted);
  font-style: normal;
}

.ff-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.ff-chip {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.75rem;
  font-size: 0.82rem;
  cursor: pointer;
}
.ff-chip.on {
  background: #ecfccb;
  border-color: #bef264;
  color: #3f6212;
}

.ff-field {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.85rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: #334155;
}
.ff-field input,
.ff-field select,
.ff-field textarea {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  font: inherit;
  font-weight: 500;
  color: var(--ink);
  background: #fff;
}

.ff-header {
  margin-bottom: 0.75rem;
}
.ff-split {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 1.1rem;
  align-items: start;
}
.ff-aside {
  position: sticky;
  top: 1rem;
  display: grid;
  gap: 0.75rem;
}
.ff-systems {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
}
.ff-systems > div {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.55rem 0.65rem;
}
.ff-systems span {
  display: block;
  font-size: 0.68rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ff-systems strong {
  font-family: Newsreader, Georgia, serif;
  font-size: 1.1rem;
}

.ff-score-block {
  margin-top: 1rem;
}
.ff-score-block h2 {
  margin: 0 0 0.55rem;
  font-size: 1.05rem;
  font-family: Newsreader, Georgia, serif;
}
.ff-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 0.4rem;
}
.ff-scores {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.3rem;
}
.ff-score {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 10px;
  padding: 0.55rem 0;
  font-weight: 700;
  cursor: pointer;
}
.ff-score.on {
  background: linear-gradient(135deg, #475569, #334155);
  border-color: transparent;
  color: #fff;
}
.ff-score.soft.on {
  background: #3f6212;
}

.ff-gap-card {
  margin-top: 0.85rem;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(241, 245, 249, 0.95), rgba(236, 253, 245, 0.55));
  border: 1px solid #e2e8f0;
}
.ff-status-pill {
  display: inline-block;
  margin: 0.35rem 0;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #94a3b8;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--slate);
}
.ff-live {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #475569;
}

.ff-suggestions,
.ff-suggestions-inline {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #475569;
}
.ff-suggestions ul {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
}

.ff-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.55rem;
  margin: 1rem 0;
}
.ff-stat {
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.75rem;
}
.ff-stat.highlight {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.ff-stat span {
  display: block;
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ff-stat strong {
  display: block;
  margin-top: 0.25rem;
  font-family: Newsreader, Georgia, serif;
  font-size: 1.15rem;
}

.ff-viz-row {
  margin: 1rem 0;
}
.ff-insight-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}
.ff-insight-grid article,
.ff-insights,
.ff-plan-card {
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.9rem 1rem;
}
.ff-insight-grid h2,
.ff-insights h2,
.ff-plan-card h2 {
  margin: 0 0 0.55rem;
  font-size: 1rem;
  font-family: Newsreader, Georgia, serif;
}
.ff-insight-grid ul,
.ff-insights ul,
.ff-bullets {
  margin: 0;
  padding-left: 1.1rem;
  color: #475569;
  line-height: 1.55;
}
.ff-priority-list {
  display: grid;
  gap: 0.55rem;
  margin-top: 1rem;
}
.ff-priority {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.65rem;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
}
.ff-priority em {
  display: block;
  font-style: normal;
  font-size: 0.8rem;
  color: var(--muted);
}
.ff-plan-card {
  margin-top: 0.85rem;
}

@media (max-width: 900px) {
  .ff-split {
    grid-template-columns: 1fr;
  }
  .ff-aside {
    position: static;
  }
}

@media print {
  .ff-exit,
  .ff-footer,
  .ff-actions {
    display: none !important;
  }
  .ff-page {
    background: #fff;
    padding: 0;
  }
  .ff-shell {
    box-shadow: none;
    border: none;
  }
}
</style>
