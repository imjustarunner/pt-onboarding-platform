<template>
  <div class="sb-page">
    <button type="button" class="sb-exit" title="Quick Exit" @click="quickExit">Quick Exit</button>

    <div v-if="loading" class="sb-state">Loading The Savage Blueprint…</div>
    <div v-else-if="error" class="sb-state error">{{ error }}</div>

    <template v-else-if="template">
      <section v-if="step === 'welcome'" class="sb-shell sb-shell--narrow">
        <p class="sb-eyebrow">The Savage Blueprint</p>
        <h1 class="sb-title">What Are You Building?</h1>
        <p class="sb-lead">
          Map intentional performance across twelve domains — body, mission, connection, challenge, and
          legacy — then build a sustainable 90-day operating plan. Savage means integrated execution, not
          aggression, dominance, or emotional numbness.
        </p>
        <p class="sb-note">
          Twelve domains. Four systems. Blueprint Wheel + Command Center. Tiers are operating labels, not
          ranks of masculinity or worth.
        </p>
        <p class="sb-meta">18 to 25 minutes · Blueprint Command Center</p>
        <div class="sb-actions">
          <button type="button" class="sb-btn primary" @click="step = 'context'">
            Build My Blueprint
          </button>
          <button type="button" class="sb-btn ghost" @click="step = 'how'">How this works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="sb-shell sb-shell--narrow">
        <h1 class="sb-title">How This Assessment Works</h1>
        <ol class="sb-bullets">
          <li>Share optional context — including whether fatherhood applies in this season.</li>
          <li>Rate Current Performance for each domain — plus Priority, Momentum, and Effort Cost when helpful.</li>
          <li>Watch the Blueprint Wheel take shape across four systems.</li>
          <li>Review the Command Center: strengths, opportunities, costly strengths, and 90-day focus.</li>
          <li>Choose priorities and build a clear plan you can actually sustain.</li>
        </ol>
        <p class="sb-clarify">{{ template.settings?.disclaimer }}</p>
        <div class="sb-actions">
          <button type="button" class="sb-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="sb-btn primary" @click="step = 'context'">Continue</button>
        </div>
      </section>

      <section v-else-if="step === 'context'" class="sb-shell sb-shell--narrow">
        <p class="sb-eyebrow">Before you begin</p>
        <h1 class="sb-title">Your current season</h1>

        <p class="sb-field-label">Does fatherhood apply in this season?</p>
        <div class="sb-mode-grid">
          <button
            type="button"
            class="sb-mode"
            :class="{ on: fatherhoodApplicable === true }"
            @click="fatherhoodApplicable = true"
          >
            <strong>Yes — include Fatherhood</strong>
            <span>You are a father or father-figure now</span>
          </button>
          <button
            type="button"
            class="sb-mode"
            :class="{ on: fatherhoodApplicable === false }"
            @click="fatherhoodApplicable = false"
          >
            <strong>No — not applicable</strong>
            <span>Excluded from scores and the wheel — fully valid</span>
          </button>
        </div>

        <p class="sb-field-label">Participant version</p>
        <div class="sb-mode-grid">
          <button
            v-for="v in PARTICIPANT_VERSION_OPTIONS"
            :key="v.id"
            type="button"
            class="sb-mode"
            :class="{ on: participantVersion === v.id }"
            @click="participantVersion = v.id"
          >
            <strong>{{ v.label }}</strong>
            <span>{{ v.description }}</span>
          </button>
        </div>

        <p class="sb-field-label">Assessment mode</p>
        <div class="sb-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="sb-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>

        <label class="sb-field">
          Assessment timeframe
          <select v-model="timeframe">
            <option v-for="o in TIMEFRAME_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>

        <div class="sb-score-block">
          <h2>Optional context — total load &amp; recovery (separate from Savage Score)</h2>
          <p class="sb-hint">These do not change your Savage Score.</p>
          <p class="sb-field-label">Current total load (1–10)</p>
          <div class="sb-scores">
            <button
              v-for="n in 10"
              :key="`load-${n}`"
              type="button"
              class="sb-score soft"
              :class="{ on: totalLoad === n }"
              @click="totalLoad = n"
            >
              {{ n }}
            </button>
          </div>
          <p class="sb-field-label">Current recovery (1–10)</p>
          <div class="sb-scores">
            <button
              v-for="n in 10"
              :key="`rec-${n}`"
              type="button"
              class="sb-score soft"
              :class="{ on: recovery === n }"
              @click="recovery = n"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <p class="sb-field-label">Current life stage (optional)</p>
        <div class="sb-chips">
          <button
            v-for="s in LIFE_STAGE_OPTIONS"
            :key="s"
            type="button"
            class="sb-chip"
            :class="{ on: lifeStages.includes(s) }"
            @click="toggleList(lifeStages, s)"
          >
            {{ s }}
          </button>
        </div>

        <p class="sb-field-label">Current goal (optional)</p>
        <div class="sb-chips">
          <button
            v-for="g in CURRENT_GOAL_OPTIONS"
            :key="g"
            type="button"
            class="sb-chip"
            :class="{ on: goals.includes(g) }"
            @click="toggleList(goals, g)"
          >
            {{ g }}
          </button>
        </div>

        <div class="sb-actions">
          <button type="button" class="sb-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="sb-btn primary" @click="startScoring">Begin →</button>
        </div>
      </section>

      <section v-else-if="step === 'score'" class="sb-shell sb-shell--split">
        <header class="sb-header">
          <div>
            <p class="sb-eyebrow">
              {{ scoredCount }} of {{ activeDomains.length }} completed ·
              {{ timeframeLabel }} · {{ saveStatus || 'Ready' }}
            </p>
            <h1 class="sb-title">{{ activeDomain?.label }}</h1>
            <p class="sb-lead">{{ activeDomain?.definition }}</p>
          </div>
        </header>

        <div class="sb-split">
          <div class="sb-panel">
            <div class="sb-score-block">
              <h2>{{ activeDomain?.primaryQuestion || 'How strong is your current performance here?' }}</h2>
              <div class="sb-scale-labels">
                <span>Foundation</span>
                <span>Savage</span>
              </div>
              <div class="sb-scores" role="group" :aria-label="`${activeDomain?.label} current performance`">
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="sb-score"
                  :class="{ on: performance === n }"
                  @click="setPerformance(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="performance != null" class="sb-gap-card" role="status" aria-live="polite">
              <p>{{ interpretation }}</p>
              <p class="sb-status-pill">{{ statusLabel }}</p>
              <p class="sb-live">
                {{ activeDomain?.label }} Current Performance updated to {{ performance }} out of 10.
                Savage Score is now {{ summary.savageScore ?? '—' }} out of 100.
              </p>
            </div>

            <div v-if="performance != null && enablePriority" class="sb-score-block">
              <h2>How high a personal priority is this domain right now?</h2>
              <div class="sb-scale-labels">
                <span>Low Priority</span>
                <span>Essential</span>
              </div>
              <div class="sb-scores">
                <button
                  v-for="n in 10"
                  :key="`p-${n}`"
                  type="button"
                  class="sb-score soft"
                  :class="{ on: priority === n }"
                  @click="patchResponse(activeKey, { personalPriorityScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="performance != null && enableMomentum && canShowMomentum" class="sb-score-block">
              <h2>Optional — what is your momentum here?</h2>
              <div class="sb-scale-labels">
                <span>Stalled</span>
                <span>Accelerating</span>
              </div>
              <div class="sb-scores">
                <button
                  v-for="n in 10"
                  :key="`m-${n}`"
                  type="button"
                  class="sb-score soft"
                  :class="{ on: momentum === n }"
                  @click="patchResponse(activeKey, { momentumScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="performance != null && enableEffort && canShowEffort" class="sb-score-block">
              <h2>Optional — how costly is the effort to hold this?</h2>
              <div class="sb-scale-labels">
                <span>Low Cost</span>
                <span>Very Costly</span>
              </div>
              <div class="sb-scores">
                <button
                  v-for="n in 10"
                  :key="`e-${n}`"
                  type="button"
                  class="sb-score soft"
                  :class="{ on: effortCost === n }"
                  @click="patchResponse(activeKey, { effortCostScore: n })"
                >
                  {{ n }}
                </button>
              </div>
              <p class="sb-hint">
                High performance with high effort cost can be a costly strength — sustainability matters.
              </p>
            </div>

            <div v-if="canShowReflections" class="sb-score-block">
              <h2>{{ activeDomain?.reflectionPrompt || 'What most affects this domain?' }}</h2>
              <div class="sb-chips">
                <button
                  v-for="chip in activeDomain?.reflectionOptions || []"
                  :key="chip"
                  type="button"
                  class="sb-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>
            </div>

            <footer class="sb-footer sticky">
              <button
                type="button"
                class="sb-btn ghost small"
                :disabled="scoreIndex === 0"
                @click="scoreIndex -= 1"
              >
                Back
              </button>
              <button
                v-if="activeDomain?.allowsNotApplicable"
                type="button"
                class="sb-btn ghost small"
                @click="markNotApplicable"
              >
                Not applicable
              </button>
              <button type="button" class="sb-btn ghost small" @click="markNotRelevant">
                Not relevant
              </button>
              <button type="button" class="sb-btn primary" :disabled="!canAdvance" @click="nextScore">
                {{ scoreIndex >= activeDomains.length - 1 ? 'Show Command Center →' : `Next: ${nextLabel}` }}
              </button>
            </footer>
          </div>

          <aside class="sb-aside">
            <SavageBlueprintWheel
              compact
              interactive
              :domains="activeDomains"
              :responses="responses"
              :savage-score="summary.savageScore"
              :system-scores="summary.systemScores"
              :selected-priority-domain-ids="priorityKeys"
              :active-domain-id="activeKey"
              @domain-select="jumpToDomain"
            />
          </aside>
        </div>
      </section>

      <section v-else-if="step === 'results'" class="sb-shell">
        <p class="sb-eyebrow">Blueprint Command Center</p>
        <h1 class="sb-title">{{ template.settings?.resultsTitle || 'Your Blueprint' }}</h1>
        <div class="sb-stats">
          <div class="sb-stat highlight">
            <span>Savage Score</span>
            <strong>{{ summary.savageScore ?? '—' }}</strong>
          </div>
          <div class="sb-stat">
            <span>Tier</span>
            <strong>{{ summary.overallTierLabel || summary.statusLabel }}</strong>
          </div>
          <div class="sb-stat">
            <span>Domains</span>
            <strong>{{ summary.domainCount }}</strong>
          </div>
        </div>
        <p class="sb-clarify">{{ summary.tierClarification }}</p>
        <p v-if="summary.fatherhoodExcluded" class="sb-clarify">
          Fatherhood was marked not applicable and excluded from your score and wheel — that does not
          reduce your Savage Score.
        </p>

        <div class="sb-split">
          <div class="sb-panel">
            <div class="sb-dash-grid">
              <article class="sb-dash-card">
                <h2>Greatest Strengths</h2>
                <ul v-if="summary.greatestStrengths?.length">
                  <li v-for="p in summary.greatestStrengths.slice(0, 4)" :key="p.domainKey">
                    <strong>{{ p.label }}</strong>
                    — {{ p.currentPerformanceScore }}/10 · {{ p.tierLabel }}
                  </li>
                </ul>
                <p v-else>Strengths will appear as you rate higher-performing domains.</p>
              </article>
              <article class="sb-dash-card">
                <h2>Biggest Opportunities</h2>
                <ul v-if="summary.biggestOpportunities?.length">
                  <li v-for="p in summary.biggestOpportunities.slice(0, 4)" :key="p.domainKey">
                    <strong>{{ p.label }}</strong>
                    — Opportunity {{ p.opportunityScore }}
                    <template v-if="p.personalPriorityScore != null">
                      · Priority {{ p.personalPriorityScore }}
                    </template>
                  </li>
                </ul>
                <p v-else>Add priority ratings to surface opportunity suggestions.</p>
              </article>
              <article class="sb-dash-card">
                <h2>Costly Strengths</h2>
                <ul v-if="summary.costlyStrengths?.length">
                  <li v-for="p in summary.costlyStrengths" :key="p.domainKey">
                    <strong>{{ p.label }}</strong>
                    — Performance {{ p.currentPerformanceScore }} · Effort {{ p.effortCostScore }}
                  </li>
                </ul>
                <p v-else>No costly strengths marked (performance ≥ 7 with effort cost ≥ 8).</p>
              </article>
              <article class="sb-dash-card">
                <h2>90-Day Focus Suggestions</h2>
                <ul>
                  <li v-if="summary.focusSuggestions?.primaryGrowth">
                    <strong>Primary:</strong> {{ summary.focusSuggestions.primaryGrowth.label }}
                  </li>
                  <li v-if="summary.focusSuggestions?.secondaryGrowth">
                    <strong>Secondary:</strong> {{ summary.focusSuggestions.secondaryGrowth.label }}
                  </li>
                  <li v-if="summary.focusSuggestions?.maintain?.length">
                    <strong>Maintain:</strong>
                    {{ summary.focusSuggestions.maintain.map((x) => x.label).join(', ') }}
                  </li>
                  <li v-if="summary.focusSuggestions?.recover?.length">
                    <strong>Recover:</strong>
                    {{ summary.focusSuggestions.recover.map((x) => x.label).join(', ') }}
                  </li>
                </ul>
              </article>
            </div>

            <SavageDomainGauge
              title="Domain Performance Gauges"
              :domains="activeDomains"
              :responses="responses"
              :scored-domains="summary.domains"
              :selected-priority-domain-ids="priorityKeys"
            />

            <div v-if="summary.insights?.length" class="sb-insights">
              <h2>Insights</h2>
              <ul>
                <li v-for="(t, i) in summary.insights" :key="i">{{ t }}</li>
              </ul>
            </div>
            <p class="sb-clarify">{{ summary.safetyNote }}</p>
          </div>

          <aside class="sb-aside">
            <SavageBlueprintWheel
              :domains="activeDomains"
              :responses="responses"
              :savage-score="summary.savageScore"
              :system-scores="summary.systemScores"
              :selected-priority-domain-ids="priorityKeys"
            />
          </aside>
        </div>

        <footer class="sb-footer">
          <button type="button" class="sb-btn ghost" @click="step = 'score'; scoreIndex = 0">
            Edit scores
          </button>
          <button type="button" class="sb-btn primary" @click="step = 'focus'">
            90-Day Focus Board →
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'focus'" class="sb-shell">
        <h1 class="sb-title">90-Day Focus Board</h1>
        <p class="sb-note">{{ summary.focusClarification }}</p>

        <div class="sb-focus-grid">
          <label class="sb-field">
            Primary growth domain
            <select v-model="focusBoard.primary">
              <option value="">Select…</option>
              <option v-for="d in activeDomains" :key="`pri-${d.key}`" :value="d.key">
                {{ d.label }}
              </option>
            </select>
          </label>
          <label class="sb-field">
            Secondary growth domain
            <select v-model="focusBoard.secondary">
              <option value="">Select…</option>
              <option v-for="d in activeDomains" :key="`sec-${d.key}`" :value="d.key">
                {{ d.label }}
              </option>
            </select>
          </label>
        </div>

        <p class="sb-field-label">Maintain (protect what works)</p>
        <div class="sb-chips">
          <button
            v-for="d in activeDomains"
            :key="`mnt-${d.key}`"
            type="button"
            class="sb-chip"
            :class="{ on: focusBoard.maintain.includes(d.key) }"
            @click="toggleFocusList('maintain', d.key)"
          >
            {{ d.shortLabel || d.label }}
          </button>
        </div>

        <p class="sb-field-label">Recover (reduce costly effort)</p>
        <div class="sb-chips">
          <button
            v-for="d in activeDomains"
            :key="`rec-${d.key}`"
            type="button"
            class="sb-chip"
            :class="{ on: focusBoard.recover.includes(d.key) }"
            @click="toggleFocusList('recover', d.key)"
          >
            {{ d.shortLabel || d.label }}
          </button>
        </div>

        <footer class="sb-footer">
          <button type="button" class="sb-btn ghost" @click="step = 'results'">Back</button>
          <button type="button" class="sb-btn primary" @click="goPriorities">Choose plan priorities →</button>
        </footer>
      </section>

      <section v-else-if="step === 'priorities'" class="sb-shell sb-shell--narrow">
        <h1 class="sb-title">Where should focused attention go?</h1>
        <p class="sb-note">
          Choose one or two domains for your 90-day plan. You do not have to pick the lowest score. Max
          {{ maxPriorities }}.
        </p>
        <div class="sb-priority-list">
          <label v-for="d in activeDomains" :key="d.key" class="sb-priority">
            <input
              type="checkbox"
              :checked="priorityKeys.includes(d.key)"
              :disabled="!priorityKeys.includes(d.key) && priorityKeys.length >= maxPriorities"
              @change="togglePriority(d.key, $event.target.checked)"
            />
            <span>
              <strong>{{ d.label }}</strong>
              <em>
                Performance {{ responseMap[d.key]?.currentPerformanceScore ?? '—' }}
                <template v-if="responseMap[d.key]?.personalPriorityScore != null">
                  · Priority {{ responseMap[d.key].personalPriorityScore }}
                </template>
              </em>
            </span>
          </label>
        </div>
        <footer class="sb-footer">
          <button type="button" class="sb-btn ghost" @click="step = 'focus'">Back</button>
          <button
            type="button"
            class="sb-btn primary"
            :disabled="!priorityKeys.length"
            @click="goPlans"
          >
            Build Plan →
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'plans'" class="sb-shell">
        <h1 class="sb-title">90-Day Operating Plan</h1>
        <p class="sb-note">
          Keep commitments recoverable. Never treat sleep deprivation, injury, or emotional suppression as
          progress.
        </p>
        <div v-for="key in priorityKeys" :key="key" class="sb-plan-card">
          <h2>{{ domainMap[key]?.label }}</h2>
          <label class="sb-field">
            What I will build
            <input v-model="planDrafts[key].build" type="text" placeholder="One clear practice" />
          </label>
          <label class="sb-field">
            What I will protect / maintain
            <input v-model="planDrafts[key].maintain" type="text" placeholder="What already works" />
          </label>
          <label class="sb-field">
            What I will recover
            <input v-model="planDrafts[key].recover" type="text" placeholder="Rest or reduced cost" />
          </label>
          <label class="sb-field">
            Smallest first action
            <input v-model="planDrafts[key].smallestFirstAction" type="text" />
          </label>
          <label class="sb-field">
            Success indicator
            <input v-model="planDrafts[key].successIndicator" type="text" />
          </label>
          <label class="sb-field">
            Confidence (1–10)
            <input v-model.number="planDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="(planDrafts[key].confidenceScore || 10) < 7" class="sb-clarify">
            How could this commitment become smaller, clearer, or more recoverable?
          </p>
        </div>

        <div v-if="enableWeekly" class="sb-score-block">
          <h2>Optional — The Savage Week (light check-in stub)</h2>
          <p class="sb-hint">Seven quick ratings. Stored locally for this guest session.</p>
          <div v-for="w in WEEKLY_CHECKIN_KEYS" :key="w.id" class="sb-week-row">
            <span>{{ w.label }}</span>
            <div class="sb-scores compact">
              <button
                v-for="n in 10"
                :key="`${w.id}-${n}`"
                type="button"
                class="sb-score soft tiny"
                :class="{ on: weeklyDraft[w.id] === n }"
                @click="weeklyDraft[w.id] = n"
              >
                {{ n }}
              </button>
            </div>
          </div>
        </div>

        <footer class="sb-footer">
          <button type="button" class="sb-btn ghost" @click="step = 'priorities'">Back</button>
          <button type="button" class="sb-btn primary" @click="finish">Finish →</button>
        </footer>
      </section>

      <section v-else-if="step === 'done'" class="sb-shell sb-shell--narrow">
        <p class="sb-eyebrow">Complete</p>
        <h1 class="sb-title">Your Savage Blueprint</h1>
        <div class="sb-stats">
          <div class="sb-stat highlight">
            <span>Savage Score</span>
            <strong>{{ summary.savageScore ?? '—' }}</strong>
          </div>
          <div class="sb-stat">
            <span>Tier</span>
            <strong>{{ summary.overallTierLabel }}</strong>
          </div>
        </div>
        <SavageBlueprintWheel
          :domains="activeDomains"
          :responses="responses"
          :savage-score="summary.savageScore"
          :system-scores="summary.systemScores"
          :selected-priority-domain-ids="priorityKeys"
        />
        <p class="sb-clarify">{{ summary.indexClarification }}</p>
        <div class="sb-actions">
          <button type="button" class="sb-btn primary" @click="downloadPdf">Print / Save PDF</button>
          <button type="button" class="sb-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="sb-btn ghost" @click="resetGuest">Start over</button>
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
import SavageBlueprintWheel from '../../components/savageBlueprint/SavageBlueprintWheel.vue';
import SavageDomainGauge from '../../components/savageBlueprint/SavageDomainGauge.vue';
import {
  PARTICIPANT_VERSION_OPTIONS,
  MODE_OPTIONS,
  LIFE_STAGE_OPTIONS,
  CURRENT_GOAL_OPTIONS,
  TIMEFRAME_OPTIONS,
  WEEKLY_CHECKIN_KEYS,
  buildSavageBlueprintSummary,
  domainsForContext,
  domainStatusLabel,
  interpretPerformanceScore
} from '../../utils/savageBlueprint.js';

const route = useRoute();
const assignedToken = computed(() => readAccessTokenFromRoute(route));
const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const isGuest = computed(() => !!route.meta?.guestSavageBlueprint);
const GUEST_KEY = 'sb-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const participantVersion = ref('general-adult');
const mode = ref('full');
const timeframe = ref('current-season');
const fatherhoodApplicable = ref(true);
const totalLoad = ref(null);
const recovery = ref(null);
const lifeStages = ref([]);
const goals = ref([]);
const responses = ref([]);
const priorityKeys = ref([]);
const scoreIndex = ref(0);
const saveStatus = ref('');
const planDrafts = reactive({});
const focusBoard = reactive({
  primary: '',
  secondary: '',
  maintain: [],
  recover: []
});
const weeklyDraft = reactive({});

const settings = computed(() => template.value?.settings || {});
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 2));
const enablePriority = computed(() => settings.value.enablePriority !== false);
const enableMomentum = computed(() => settings.value.enableMomentum !== false);
const enableEffort = computed(() => settings.value.enableEffortCost !== false);
const enableWeekly = computed(() => settings.value.enableWeeklyCheckin !== false);

const activeDomains = computed(() =>
  domainsForContext(template.value, {
    mode: mode.value,
    participantVersion: participantVersion.value,
    fatherhoodApplicable: fatherhoodApplicable.value
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
const performance = computed(
  () => responseMap.value[activeKey.value]?.currentPerformanceScore ?? null
);
const priority = computed(
  () => responseMap.value[activeKey.value]?.personalPriorityScore ?? null
);
const momentum = computed(() => responseMap.value[activeKey.value]?.momentumScore ?? null);
const effortCost = computed(() => responseMap.value[activeKey.value]?.effortCostScore ?? null);
const currentChips = computed(() => responseMap.value[activeKey.value]?.reflectionChips || []);
const statusLabel = computed(() => domainStatusLabel(performance.value));
const interpretation = computed(() =>
  interpretPerformanceScore(performance.value, activeDomain.value?.label || 'This domain')
);

const canShowMomentum = computed(() => {
  if (!enableMomentum.value || performance.value == null) return false;
  if (enablePriority.value && priority.value == null) return false;
  return true;
});

const canShowEffort = computed(() => {
  if (!enableEffort.value || performance.value == null) return false;
  if (enablePriority.value && priority.value == null) return false;
  return true;
});

const canShowReflections = computed(() => {
  if (performance.value == null) return false;
  if (enablePriority.value && priority.value == null) return false;
  return true;
});

const scoredCount = computed(
  () =>
    activeDomains.value.filter((d) => {
      const r = responseMap.value[d.key];
      return (
        r?.preferNotToAnswer ||
        r?.seasonStatus === 'not-relevant' ||
        r?.isNotApplicable ||
        r?.currentPerformanceScore != null
      );
    }).length
);

const canAdvance = computed(() => {
  const r = responseMap.value[activeKey.value];
  return (
    r?.preferNotToAnswer ||
    r?.seasonStatus === 'not-relevant' ||
    r?.isNotApplicable ||
    r?.currentPerformanceScore != null
  );
});

const nextLabel = computed(() => activeDomains.value[scoreIndex.value + 1]?.label || 'next');
const timeframeLabel = computed(
  () => TIMEFRAME_OPTIONS.find((o) => o.id === timeframe.value)?.label || 'Current life season'
);

const contextPayload = computed(() => ({
  fatherhoodApplicable: fatherhoodApplicable.value,
  currentTotalLoadScore: totalLoad.value,
  currentRecoveryScore: recovery.value,
  lifeStages: lifeStages.value,
  goals: goals.value
}));

const summary = computed(() =>
  buildSavageBlueprintSummary(template.value, responses.value, {
    mode: mode.value,
    participantVersion: participantVersion.value,
    fatherhoodApplicable: fatherhoodApplicable.value,
    priorityKeys: priorityKeys.value,
    context: contextPayload.value
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
        fatherhoodApplicable: fatherhoodApplicable.value,
        totalLoad: totalLoad.value,
        recovery: recovery.value,
        lifeStages: lifeStages.value,
        goals: goals.value,
        responses: responses.value,
        priorityKeys: priorityKeys.value,
        scoreIndex: scoreIndex.value,
        planDrafts: { ...planDrafts },
        focusBoard: {
          primary: focusBoard.primary,
          secondary: focusBoard.secondary,
          maintain: [...focusBoard.maintain],
          recover: [...focusBoard.recover]
        },
        weeklyDraft: { ...weeklyDraft },
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
    fatherhoodApplicable,
    totalLoad,
    recovery
  ],
  () => persistGuest(),
  { deep: true }
);

function toggleList(arr, item) {
  const i = arr.indexOf(item);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(item);
}

function toggleFocusList(slot, key) {
  const arr = focusBoard[slot];
  const i = arr.indexOf(key);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(key);
}

function ensureResponse(key) {
  if (!responseMap.value[key]) {
    responses.value = [
      ...responses.value,
      {
        domainKey: key,
        currentPerformanceScore: null,
        personalPriorityScore: null,
        momentumScore: null,
        effortCostScore: null,
        reflectionChips: [],
        barriers: [],
        personalStrengths: [],
        personalDefinition: '',
        supportPreference: 'none',
        privateReflection: '',
        seasonStatus: 'active',
        preferNotToAnswer: false,
        isNotApplicable: false
      }
    ];
  }
}

function patchResponse(key, patch) {
  ensureResponse(key);
  responses.value = responses.value.map((r) => (r.domainKey === key ? { ...r, ...patch } : r));
}

function setPerformance(n) {
  patchResponse(activeKey.value, {
    currentPerformanceScore: n,
    preferNotToAnswer: false,
    seasonStatus: 'active',
    isNotApplicable: false
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
    currentPerformanceScore: null,
    isNotApplicable: false
  });
  nextScore();
}

function markNotApplicable() {
  patchResponse(activeKey.value, {
    isNotApplicable: true,
    currentPerformanceScore: null,
    seasonStatus: 'active'
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
    step.value = 'results';
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
  } else {
    priorityKeys.value = priorityKeys.value.filter((k) => k !== key);
  }
}

function goPriorities() {
  const suggested = [focusBoard.primary, focusBoard.secondary].filter(Boolean);
  if (suggested.length && !priorityKeys.value.length) {
    priorityKeys.value = [...new Set(suggested)].slice(0, maxPriorities.value);
  }
  step.value = 'priorities';
}

function goPlans() {
  for (const key of priorityKeys.value) {
    if (!planDrafts[key]) {
      planDrafts[key] = {
        build: '',
        maintain: '',
        recover: '',
        smallestFirstAction: '',
        successIndicator: '',
        confidenceScore: null
      };
    }
  }
  step.value = 'plans';
}

async function finish() {
  if (assignedToken.value) {
    try {
      await flushStandardGuestAssessment({
        apiPrefix: '/savage-blueprint',
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
  window.location.href = url;
}

function buildExport() {
  return {
    type: 'savage_blueprint_guest',
    title: 'The Savage Blueprint',
    visualExperience: 'Blueprint Wheel',
    exportedAt: new Date().toISOString(),
    participantVersion: participantVersion.value,
    mode: mode.value,
    timeframe: timeframe.value,
    context: contextPayload.value,
    summary: summary.value,
    focusBoard: { ...focusBoard },
    weeklyDraft: { ...weeklyDraft },
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
  a.download = `savage-blueprint-${new Date().toISOString().slice(0, 10)}.json`;
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
  Object.keys(weeklyDraft).forEach((k) => delete weeklyDraft[k]);
  focusBoard.primary = '';
  focusBoard.secondary = '';
  focusBoard.maintain = [];
  focusBoard.recover = [];
  fatherhoodApplicable.value = true;
  totalLoad.value = null;
  recovery.value = null;
  step.value = 'welcome';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/savage-blueprint/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value = 'Savage Blueprint template is not available yet. Run migration 932.';
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
          if (typeof cached?.fatherhoodApplicable === 'boolean') {
            fatherhoodApplicable.value = cached.fatherhoodApplicable;
          }
          if (cached?.totalLoad != null) totalLoad.value = cached.totalLoad;
          if (cached?.recovery != null) recovery.value = cached.recovery;
          if (cached?.lifeStages) lifeStages.value = cached.lifeStages;
          if (cached?.goals) goals.value = cached.goals;
          if (typeof cached?.scoreIndex === 'number') scoreIndex.value = cached.scoreIndex;
          for (const [k, v] of Object.entries(cached.planDrafts || {})) {
            planDrafts[k] = { ...v };
          }
          if (cached?.focusBoard) {
            focusBoard.primary = cached.focusBoard.primary || '';
            focusBoard.secondary = cached.focusBoard.secondary || '';
            focusBoard.maintain = cached.focusBoard.maintain || [];
            focusBoard.recover = cached.focusBoard.recover || [];
          }
          for (const [k, v] of Object.entries(cached.weeklyDraft || {})) {
            weeklyDraft[k] = v;
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
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');

.sb-page {
  --ink: #e8eef6;
  --muted: #9aa8ba;
  --line: rgba(196, 165, 116, 0.22);
  --bg: #0b1220;
  --panel: #121c2c;
  --forest: #1b4332;
  --forest-2: #3d7a5a;
  --navy: #1e3a5f;
  --bronze: #c4a574;
  --charcoal: #0a1018;
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 8% -10%, rgba(30, 58, 95, 0.45), transparent 55%),
    radial-gradient(700px 360px at 100% 0%, rgba(27, 67, 50, 0.35), transparent 50%),
    linear-gradient(180deg, #0f1a2a 0%, var(--bg) 42%);
  color: var(--ink);
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  padding: 1.5rem 1rem 4rem;
  position: relative;
}

.sb-exit {
  position: fixed;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 40;
  appearance: none;
  border: 1px solid var(--line);
  background: rgba(18, 28, 44, 0.92);
  color: var(--ink);
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.sb-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--muted);
}
.sb-state.error {
  color: #fca5a5;
}

.sb-shell {
  max-width: 1140px;
  margin: 0 auto;
  background: rgba(18, 28, 44, 0.92);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
}
.sb-shell--narrow {
  max-width: 660px;
}

.sb-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--bronze);
  font-weight: 700;
}
.sb-title {
  margin: 0.35rem 0 0.65rem;
  font-family: Sora, system-ui, sans-serif;
  font-size: clamp(1.5rem, 3vw, 2.15rem);
  font-weight: 700;
  line-height: 1.25;
  color: var(--ink);
}
.sb-lead,
.sb-note,
.sb-meta,
.sb-clarify,
.sb-hint {
  color: var(--muted);
  line-height: 1.6;
}
.sb-clarify {
  font-size: 0.9rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
}
.sb-bullets {
  padding-left: 1.2rem;
  color: var(--muted);
  line-height: 1.7;
}
.sb-actions,
.sb-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.25rem;
}
.sb-footer.sticky {
  position: sticky;
  bottom: 0.5rem;
  background: rgba(18, 28, 44, 0.95);
  padding: 0.75rem 0 0.25rem;
}
.sb-btn {
  appearance: none;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  border-radius: 12px;
  padding: 0.7rem 1.1rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.sb-btn.primary {
  background: linear-gradient(135deg, #1b4332, #2d6a4f);
  border-color: transparent;
  color: #f0fdf4;
}
.sb-btn.ghost {
  background: rgba(255, 255, 255, 0.04);
}
.sb-btn.small {
  padding: 0.5rem 0.85rem;
  font-size: 0.85rem;
}
.sb-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.sb-field-label {
  margin: 1rem 0 0.45rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--bronze);
}
.sb-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0.85rem 0;
  font-size: 0.9rem;
  font-weight: 600;
}
.sb-field input,
.sb-field select {
  appearance: none;
  border: 1px solid var(--line);
  background: rgba(11, 18, 32, 0.85);
  color: var(--ink);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  font: inherit;
  font-weight: 400;
}

.sb-mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.55rem;
}
.sb-mode {
  text-align: left;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.03);
  color: var(--ink);
  border-radius: 12px;
  padding: 0.7rem 0.75rem;
  cursor: pointer;
  font: inherit;
}
.sb-mode.on {
  border-color: var(--bronze);
  background: rgba(196, 165, 116, 0.12);
}
.sb-mode strong {
  display: block;
  font-family: Sora, system-ui, sans-serif;
  font-size: 0.88rem;
}
.sb-mode span,
.sb-mode em {
  display: block;
  color: var(--muted);
  font-size: 0.75rem;
  font-style: normal;
  margin-top: 0.2rem;
}

.sb-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.sb-chip {
  appearance: none;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.03);
  color: var(--muted);
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}
.sb-chip.on {
  background: rgba(61, 122, 90, 0.25);
  color: var(--ink);
  border-color: rgba(61, 122, 90, 0.55);
}

.sb-scores {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.sb-scores.compact {
  gap: 0.2rem;
}
.sb-score {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.04);
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.sb-score.soft {
  opacity: 0.9;
}
.sb-score.tiny {
  width: 1.7rem;
  height: 1.7rem;
  font-size: 0.72rem;
  border-radius: 8px;
}
.sb-score.on {
  background: linear-gradient(135deg, #1b4332, #3d7a5a);
  border-color: transparent;
}
.sb-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 0.35rem;
}

.sb-score-block {
  margin: 1rem 0 1.25rem;
}
.sb-score-block h2 {
  margin: 0 0 0.55rem;
  font-family: Sora, system-ui, sans-serif;
  font-size: 1rem;
}
.sb-gap-card {
  padding: 0.85rem 1rem;
  background: rgba(30, 58, 95, 0.35);
  border-radius: 12px;
  margin-bottom: 1rem;
}
.sb-status-pill {
  display: inline-block;
  margin-top: 0.35rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(196, 165, 116, 0.18);
  color: var(--bronze);
  font-size: 0.75rem;
  font-weight: 700;
}
.sb-live {
  font-size: 0.82rem;
  color: var(--muted);
  margin: 0.45rem 0 0;
}

.sb-split {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
  gap: 1.15rem;
  align-items: start;
}
@media (max-width: 900px) {
  .sb-split {
    grid-template-columns: 1fr;
  }
}
.sb-aside {
  position: sticky;
  top: 1rem;
}

.sb-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.65rem;
  margin: 1rem 0;
}
.sb-stat {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.85rem 1rem;
}
.sb-stat.highlight {
  background: linear-gradient(145deg, rgba(27, 67, 50, 0.55), rgba(30, 58, 95, 0.45));
}
.sb-stat span {
  display: block;
  font-size: 0.72rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.sb-stat strong {
  display: block;
  margin-top: 0.25rem;
  font-family: Sora, system-ui, sans-serif;
  font-size: 1.35rem;
}

.sb-dash-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.sb-dash-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.9rem 1rem;
}
.sb-dash-card h2 {
  margin: 0 0 0.5rem;
  font-family: Sora, system-ui, sans-serif;
  font-size: 0.95rem;
}
.sb-dash-card ul {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.55;
}
.sb-insights {
  margin-top: 1.25rem;
}
.sb-insights h2 {
  font-family: Sora, system-ui, sans-serif;
  font-size: 1.05rem;
}
.sb-insights ul {
  color: var(--muted);
  line-height: 1.6;
}

.sb-priority-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.sb-priority {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}
.sb-priority em {
  display: block;
  color: var(--muted);
  font-style: normal;
  font-size: 0.8rem;
}

.sb-plan-card {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1rem;
  margin-bottom: 1rem;
  background: rgba(255, 255, 255, 0.03);
}
.sb-plan-card h2 {
  margin: 0 0 0.5rem;
  font-family: Sora, system-ui, sans-serif;
  font-size: 1.05rem;
}

.sb-focus-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.sb-week-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.45rem;
  font-size: 0.85rem;
}

@media print {
  .sb-exit,
  .sb-footer,
  .sb-actions {
    display: none !important;
  }
  .sb-page {
    background: #fff;
    color: #111;
  }
}
</style>
