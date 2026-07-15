<template>
  <div class="va-page">
    <div v-if="loading" class="va-state">Loading Values Alignment Assessment…</div>
    <div v-else-if="error" class="va-state error">{{ error }}</div>
    <template v-else-if="template">
      <!-- Welcome -->
      <section v-if="step === 'welcome'" class="va-shell va-shell--narrow">
        <p class="va-eyebrow">Values Alignment Assessment</p>
        <h1 class="va-title">Does Your Daily Life Reflect What Matters Most?</h1>
        <p class="va-lead">
          Values are not only ideas. They become visible through how time, attention, energy, money, and
          decisions are used.
        </p>
        <p class="va-note">
          This assessment compares your current life with the life you would ideally like to build. The goal
          is not perfection. It is greater awareness and intentional choice.
        </p>
        <p class="va-meta">12 to 18 minutes · Life Alignment Wheel</p>
        <div class="va-actions">
          <button type="button" class="va-btn primary" @click="step = 'context'">
            Build My Life Alignment Wheel
          </button>
          <button type="button" class="va-btn ghost" @click="step = 'how'">How This Assessment Works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="va-shell va-shell--narrow">
        <h1 class="va-title">How This Assessment Works</h1>
        <ol class="va-steps">
          <li>Share optional context about your current season.</li>
          <li>Rate Current Life and Ideal Life for each value.</li>
          <li>Watch your dual Life Alignment Wheel take shape.</li>
          <li>Review gaps, alignment, and possible tradeoffs.</li>
          <li>Choose one to three priorities and turn them into behaviors.</li>
        </ol>
        <p class="va-note">
          Ideal Life scores do not all need to be 10. Rate the emphasis you want in your current season—not
          a perfect life without limits. This is not a personality diagnosis or a moral evaluation.
        </p>
        <div class="va-actions">
          <button type="button" class="va-btn primary" @click="step = 'context'">Continue</button>
          <button type="button" class="va-btn ghost" @click="step = 'welcome'">Back</button>
        </div>
      </section>

      <!-- Context -->
      <section v-else-if="step === 'context'" class="va-shell va-shell--narrow">
        <p class="va-eyebrow">Before you begin</p>
        <h1 class="va-title">Your current season</h1>

        <label class="va-field">
          Current life season
          <select v-model="context.lifeSeason">
            <option value="">Select (optional)</option>
            <option v-for="o in LIFE_SEASON_OPTIONS" :key="o" :value="o">{{ o }}</option>
          </select>
        </label>

        <p class="va-field-label">Primary concerns (optional)</p>
        <div class="va-chips">
          <button
            v-for="c in PRIMARY_CONCERN_OPTIONS"
            :key="c"
            type="button"
            class="va-chip"
            :class="{ on: context.concerns.includes(c) }"
            @click="toggleList(context.concerns, c)"
          >
            {{ c }}
          </button>
        </div>

        <p class="va-field-label">Current goal (optional)</p>
        <div class="va-chips">
          <button
            v-for="c in CURRENT_GOAL_OPTIONS"
            :key="c"
            type="button"
            class="va-chip"
            :class="{ on: context.goals.includes(c) }"
            @click="toggleList(context.goals, c)"
          >
            {{ c }}
          </button>
        </div>

        <label class="va-field">
          Assessment timeframe
          <select v-model="context.timeframe">
            <option value="current-season">Current season (default)</option>
            <option value="thirty-days">Past 30 days</option>
            <option value="ninety-days">Past 90 days</option>
            <option value="past-year">Past year</option>
          </select>
        </label>

        <div class="va-actions">
          <button type="button" class="va-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="va-btn primary" @click="startScoring">
            Continue to Ideal Life guidance →
          </button>
        </div>
      </section>

      <!-- Ideal guidance -->
      <section v-else-if="step === 'ideal-guide'" class="va-shell va-shell--narrow">
        <p class="va-eyebrow">Before Ideal Life scores</p>
        <h1 class="va-title">Your Ideal Life scores do not all need to be 10</h1>
        <ul class="va-bullets">
          <li>your current season</li>
          <li>limited time and energy</li>
          <li>responsibilities you cannot ignore</li>
          <li>natural tradeoffs between values</li>
          <li>what deserves emphasis now</li>
          <li>what is realistic during the next three to six months</li>
        </ul>
        <p class="va-note">
          Rate the level of emphasis you would ideally want in your current season, not in a perfect life
          without limits.
        </p>
        <div class="va-actions">
          <button type="button" class="va-btn ghost" @click="step = 'context'">Back</button>
          <button type="button" class="va-btn primary" @click="step = 'score'">Begin scoring →</button>
        </div>
      </section>

      <!-- Progressive scoring -->
      <section v-else-if="step === 'score'" class="va-shell va-shell--split">
        <header class="va-header">
          <div>
            <p class="va-eyebrow">Values Alignment Assessment · {{ scoredCount }} of {{ coreValues.length }} completed</p>
            <h1 class="va-title">{{ activeValue?.label }}</h1>
            <p class="va-lead">{{ activeValue?.definition }}</p>
          </div>
          <div class="va-save" :data-status="saveStatus">{{ saveStatus || 'Ready' }}</div>
        </header>

        <div class="va-split">
          <div class="va-panel">
            <div class="va-score-block">
              <h2>Current Life</h2>
              <p>How strongly is this value reflected in the way you currently use your time, attention, and energy?</p>
              <div class="va-scale-labels">
                <span>Rarely reflected</span>
                <span>Strongly &amp; consistently reflected</span>
              </div>
              <div class="va-scores" role="group" aria-label="Current Life score">
                <button
                  v-for="n in 10"
                  :key="`c-${n}`"
                  type="button"
                  class="va-score"
                  :class="{ on: currentLife === n }"
                  @click="setCurrent(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="currentLife != null" class="va-score-block">
              <h2>Ideal Life</h2>
              <p>How strongly would you ideally like this value to be reflected in your current season?</p>
              <div class="va-scale-labels">
                <span>Little emphasis</span>
                <span>Central priority</span>
              </div>
              <div class="va-scores" role="group" aria-label="Ideal Life score">
                <button
                  v-for="n in 10"
                  :key="`i-${n}`"
                  type="button"
                  class="va-score ideal"
                  :class="{ on: idealLife === n }"
                  @click="setIdeal(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="signedGap != null" class="va-gap-card" role="status" aria-live="polite">
              <div>
                <span>Alignment Gap</span>
                <strong>{{ formatGap(signedGap) }}</strong>
              </div>
              <div>
                <span>Alignment Score</span>
                <strong>{{ valueAlignmentScore }} / 100</strong>
              </div>
              <p>{{ interpretation }}</p>
              <p class="va-status-pill">{{ gapStatus }}</p>
            </div>

            <div v-if="idealLife != null && enableConfidence" class="va-score-block">
              <h2>Confidence to Change</h2>
              <p>How confident are you that you can make a meaningful change in this area?</p>
              <div class="va-scale-labels">
                <span>Not confident yet</span>
                <span>Highly confident</span>
              </div>
              <div class="va-scores" role="group" aria-label="Confidence to Change">
                <button
                  v-for="n in 10"
                  :key="`f-${n}`"
                  type="button"
                  class="va-score conf"
                  :class="{ on: confidence === n }"
                  @click="setConfidence(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="idealLife != null" class="va-reflect">
              <h2>What most affects alignment with this value?</h2>
              <div class="va-chips">
                <button
                  v-for="chip in activeReflectionOptions"
                  :key="chip"
                  type="button"
                  class="va-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>

              <label class="va-field">
                What does this value mean to you? (optional)
                <textarea
                  :value="personalDefinition"
                  rows="2"
                  placeholder="Rewrite the definition in your own words"
                  @input="patchResponse(activeKey, { personalDefinition: $event.target.value })"
                />
              </label>

              <details class="va-details">
                <summary>Optional private note</summary>
                <textarea
                  :value="currentNote"
                  rows="3"
                  placeholder="Private to you"
                  @input="patchResponse(activeKey, { note: $event.target.value })"
                />
              </details>

              <button
                v-if="enableNotRelevant"
                type="button"
                class="va-btn ghost small"
                @click="markNotRelevant"
              >
                Not relevant in this season
              </button>
            </div>
          </div>

          <aside class="va-aside">
            <LifeAlignmentWheel
              :categories="coreValues"
              :responses="responses"
              :values-alignment-index="summary.valuesAlignmentIndex"
              :active-category-id="activeKey"
              :selected-priority-category-ids="priorityKeys"
              :aligned-value-count="summary.alignedValueCount"
              :positive-gap-count="summary.positiveGapCount"
              display-mode="current-and-ideal"
              interactive
              animated
              @category-select="jumpToValue"
            />
            <div class="va-aside-stats">
              <div><span>Aligned</span><strong>{{ summary.alignedValueCount || 0 }}</strong></div>
              <div><span>Growth gaps</span><strong>{{ summary.positiveGapCount || 0 }}</strong></div>
              <div><span>Rebalance</span><strong>{{ summary.rebalancingOpportunityCount || 0 }}</strong></div>
            </div>
            <button type="button" class="va-btn ghost small mobile-only" @click="showMobileWheel = !showMobileWheel">
              {{ showMobileWheel ? 'Hide' : 'View' }} My Alignment Wheel
            </button>
          </aside>
        </div>

        <footer class="va-footer sticky">
          <button type="button" class="va-btn ghost" :disabled="scoreIndex === 0" @click="scoreIndex -= 1">
            Back
          </button>
          <button
            type="button"
            class="va-btn primary"
            :disabled="!canAdvanceValue"
            @click="nextScore"
          >
            {{ scoreIndex >= coreValues.length - 1 ? 'Review profile →' : `Continue to ${nextLabel} →` }}
          </button>
        </footer>
      </section>

      <!-- Completion preview -->
      <section v-else-if="step === 'complete-preview'" class="va-shell va-shell--narrow">
        <h1 class="va-title">Your Values Alignment Profile Is Ready</h1>
        <div class="va-stats">
          <div class="va-stat highlight">
            <span>Values Alignment Index</span>
            <strong>{{ summary.valuesAlignmentIndex ?? '—' }} / 100</strong>
          </div>
          <div class="va-stat">
            <span>Description</span>
            <strong>{{ summary.alignmentLevel || '—' }}</strong>
          </div>
          <div class="va-stat">
            <span>Closest alignment</span>
            <strong>{{ summary.closelyAligned?.[0]?.label || '—' }}</strong>
          </div>
          <div class="va-stat">
            <span>Largest positive gap</span>
            <strong>{{ summary.needingMoreAttention?.[0]?.label || '—' }}</strong>
          </div>
          <div class="va-stat">
            <span>Rebalancing opportunity</span>
            <strong>{{ summary.rebalancingOpportunities?.[0]?.label || '—' }}</strong>
          </div>
          <div class="va-stat">
            <span>Highest ideal priority</span>
            <strong>{{ summary.highestIdealPriorities?.[0]?.label || '—' }}</strong>
          </div>
        </div>
        <p class="va-note">
          Alignment does not require every value to receive equal attention. Your profile is a starting point
          for choosing what deserves emphasis in your current season.
        </p>
        <div class="va-actions">
          <button type="button" class="va-btn primary" @click="step = 'review'">
            Explore My Values Alignment Profile
          </button>
          <button type="button" class="va-btn ghost" @click="step = 'score'; scoreIndex = 0">
            Review My Responses
          </button>
        </div>
      </section>

      <!-- Results -->
      <section v-else-if="step === 'review'" class="va-shell">
        <header class="va-header">
          <div>
            <p class="va-eyebrow">Your Values Alignment Profile</p>
            <h1 class="va-title">Current Life compared with Ideal Life</h1>
            <p class="va-lead">
              This profile compares how your values currently appear in daily life with the level of emphasis
              you would ideally prefer in your present season.
            </p>
          </div>
        </header>

        <p class="va-clarify">{{ summary.indexClarification }}</p>

        <div class="va-stats">
          <div class="va-stat highlight">
            <span>Alignment Index</span>
            <strong>{{ summary.valuesAlignmentIndex ?? '—' }}</strong>
          </div>
          <div class="va-stat">
            <span>Level</span>
            <strong>{{ summary.alignmentLevel || '—' }}</strong>
          </div>
          <div class="va-stat">
            <span>Aligned values</span>
            <strong>{{ summary.alignedValueCount || 0 }}</strong>
          </div>
          <div class="va-stat">
            <span>Growth opportunities</span>
            <strong>{{ summary.positiveGapCount || 0 }}</strong>
          </div>
        </div>

        <div class="va-viz-row">
          <LifeAlignmentWheel
            :categories="coreValues"
            :responses="responses"
            :values-alignment-index="summary.valuesAlignmentIndex"
            :aligned-value-count="summary.alignedValueCount"
            :positive-gap-count="summary.positiveGapCount"
            :selected-priority-category-ids="priorityKeys"
            display-mode="current-and-ideal"
          />
        </div>

        <ValuesGapMap
          v-model:sort-mode="gapSortMode"
          :categories="coreValues"
          :responses="responses"
          :selected-priority-category-ids="priorityKeys"
        />

        <div class="va-insight-grid">
          <article>
            <h2>Closely Aligned</h2>
            <ul>
              <li v-for="x in summary.closelyAligned?.slice(0, 4) || []" :key="x.valueKey">
                <strong>{{ x.label }}</strong>
                — Current {{ x.currentLifeScore }} / Ideal {{ x.idealLifeScore }}
              </li>
              <li v-if="!(summary.closelyAligned || []).length">None yet identified.</li>
            </ul>
          </article>
          <article>
            <h2>Needing More Attention</h2>
            <ul>
              <li v-for="x in summary.needingMoreAttention?.slice(0, 4) || []" :key="x.valueKey">
                <strong>{{ x.label }}</strong>
                — Gap {{ formatGap(x.signedGap) }}
              </li>
              <li v-if="!(summary.needingMoreAttention || []).length">No major positive gaps.</li>
            </ul>
          </article>
          <article>
            <h2>Rebalancing Opportunities</h2>
            <ul>
              <li v-for="x in summary.rebalancingOpportunities?.slice(0, 4) || []" :key="x.valueKey">
                <strong>{{ x.label }}</strong>
                — Gap {{ formatGap(x.signedGap) }}
              </li>
              <li v-if="!(summary.rebalancingOpportunities || []).length">No major rebalancing signals.</li>
            </ul>
          </article>
        </div>

        <div v-if="summary.insights?.length" class="va-insights">
          <h2>Insights</h2>
          <ul>
            <li v-for="(t, i) in summary.insights" :key="i">{{ t }}</li>
          </ul>
        </div>

        <footer class="va-footer">
          <button type="button" class="va-btn ghost" @click="step = 'score'; scoreIndex = 0">Edit scores</button>
          <button type="button" class="va-btn primary" @click="step = 'priorities'">Choose priorities →</button>
        </footer>
      </section>

      <!-- Priorities -->
      <section v-else-if="step === 'priorities'" class="va-shell va-shell--narrow">
        <p class="va-eyebrow">Priority selection</p>
        <h1 class="va-title">Which values deserve intentional attention?</h1>
        <p class="va-lead">
          Which values would most improve your sense of alignment if addressed during the next season? Choose
          one to three. You do not have to select the largest gaps.
        </p>
        <div class="va-priority-list">
          <label v-for="v in coreValues" :key="v.key" class="va-priority-card">
            <input
              type="checkbox"
              :checked="priorityKeys.includes(v.key)"
              :disabled="!priorityKeys.includes(v.key) && priorityKeys.length >= maxPriorities"
              @change="togglePriority(v.key, $event.target.checked)"
            />
            <div>
              <strong>{{ v.label }}</strong>
              <p>
                Current {{ responseMap[v.key]?.currentLifeScore ?? '—' }} · Ideal
                {{ responseMap[v.key]?.idealLifeScore ?? '—' }} · Gap
                {{ formatGap(signedGapFor(v.key)) }}
              </p>
              <select
                v-if="priorityKeys.includes(v.key)"
                :value="priorityTypes[v.key] || 'increase'"
                @change="priorityTypes[v.key] = $event.target.value"
              >
                <option v-for="t in PRIORITY_TYPES" :key="t.id" :value="t.id">{{ t.label }}</option>
              </select>
            </div>
          </label>
        </div>
        <footer class="va-footer">
          <button type="button" class="va-btn ghost" @click="step = 'review'">Back</button>
          <button
            type="button"
            class="va-btn primary"
            :disabled="!priorityKeys.length"
            @click="goCommitments"
          >
            Build Values Alignment Plan →
          </button>
        </footer>
      </section>

      <!-- Plans / Values-to-Action Bridge -->
      <section v-else-if="step === 'commitments'" class="va-shell va-shell--narrow">
        <p class="va-eyebrow">Values-to-Action Bridge</p>
        <h1 class="va-title">Translate values into observable behavior</h1>
        <p class="va-lead">What would another person notice if this value were more visible in your life?</p>

        <article v-for="key in priorityKeys" :key="key" class="va-bridge">
          <h2>{{ valueMap[key]?.label }}</h2>
          <div class="va-bridge-flow">
            <span>Value</span>
            <span>Meaning</span>
            <span>Current</span>
            <span>Desired</span>
            <span>Commitment</span>
            <span>Boundary</span>
            <span>Review</span>
          </div>
          <label class="va-field">
            What this value means to me
            <textarea v-model="commitmentDrafts[key].personalDefinition" rows="2" />
          </label>
          <label class="va-field">
            Current pattern
            <textarea v-model="commitmentDrafts[key].currentBehavior" rows="2" />
          </label>
          <label class="va-field">
            Desired behavior
            <textarea v-model="commitmentDrafts[key].desiredBehavior" rows="2" />
          </label>
          <label class="va-field">
            Smallest first action
            <input v-model="commitmentDrafts[key].firstStep" type="text" />
          </label>
          <label class="va-field">
            Recurring action
            <input v-model="commitmentDrafts[key].recurringAction" type="text" />
          </label>
          <label class="va-field">
            Boundary or tradeoff
            <input v-model="commitmentDrafts[key].boundaryOrTradeoff" type="text" />
          </label>
          <label class="va-field">
            Success indicator
            <input v-model="commitmentDrafts[key].successIndicator" type="text" />
          </label>
          <label class="va-field">
            Review date
            <input v-model="commitmentDrafts[key].targetDate" type="date" />
          </label>
          <label class="va-field">
            Confidence (1–10)
            <input v-model.number="commitmentDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="(commitmentDrafts[key].confidenceScore || 10) < 7" class="va-note">
            How could this plan become smaller, simpler, or more realistic?
          </p>
        </article>

        <footer class="va-footer">
          <button type="button" class="va-btn ghost" @click="step = 'priorities'">Back</button>
          <button type="button" class="va-btn primary" @click="finishAssessment">Finish profile →</button>
        </footer>
      </section>

      <!-- Done -->
      <section v-else-if="step === 'done'" class="va-shell va-shell--narrow va-print">
        <p class="va-eyebrow">Complete</p>
        <h1 class="va-title">Your Values Alignment Profile</h1>
        <div class="va-stats">
          <div class="va-stat highlight">
            <span>Index</span>
            <strong>{{ summary.valuesAlignmentIndex }} / 100</strong>
          </div>
          <div class="va-stat">
            <span>Level</span>
            <strong>{{ summary.alignmentLevel }}</strong>
          </div>
        </div>
        <LifeAlignmentWheel
          :categories="coreValues"
          :responses="responses"
          :values-alignment-index="summary.valuesAlignmentIndex"
          :selected-priority-category-ids="priorityKeys"
          display-mode="current-and-ideal"
        />
        <p class="va-clarify">{{ summary.indexClarification }}</p>
        <div class="va-actions">
          <button type="button" class="va-btn primary" @click="downloadPdf">Print / Save PDF</button>
          <button type="button" class="va-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="va-btn ghost" @click="resetGuest">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import LifeAlignmentWheel from '../../components/valuesAlignment/LifeAlignmentWheel.vue';
import ValuesGapMap from '../../components/valuesAlignment/ValuesGapMap.vue';
import {
  CORE_VALUE_KEYS,
  REFLECTION_OPTIONS_BY_VALUE,
  LIFE_SEASON_OPTIONS,
  PRIMARY_CONCERN_OPTIONS,
  CURRENT_GOAL_OPTIONS,
  PRIORITY_TYPES,
  buildLifeAlignmentSummary,
  calculateSignedAlignmentGap,
  calculateValueAlignmentScore,
  signedGapStatusLabel,
  interpretCurrentIdealPair
} from '../../utils/valuesAlignment.js';

const route = useRoute();
const isGuest = computed(() => !!route.meta?.guestValuesAlignment);
const GUEST_KEY = 'va-guest-assessment-v2-life-wheel';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const responses = ref([]);
const priorityKeys = ref([]);
const priorityTypes = reactive({});
const scoreIndex = ref(0);
const saveStatus = ref('');
const commitmentDrafts = reactive({});
const gapSortMode = ref('default');
const showMobileWheel = ref(false);
const context = reactive({
  lifeSeason: '',
  concerns: [],
  goals: [],
  timeframe: 'current-season',
  mode: 'full'
});

const settings = computed(() => template.value?.settings || {});
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 3));
const enableConfidence = computed(() => settings.value.enableConfidenceToChange !== false);
const enableNotRelevant = computed(() => settings.value.enableNotRelevant !== false);

const coreKeys = computed(() => {
  const keys = settings.value.coreValueKeys || CORE_VALUE_KEYS;
  return keys.map(String);
});

const coreValues = computed(() => {
  const all = template.value?.values || [];
  const byKey = Object.fromEntries(all.map((v) => [v.key, v]));
  return coreKeys.value
    .map((k) => byKey[k])
    .filter(Boolean)
    .map((v) => ({
      ...v,
      shortLabel: v.label?.split(' ')[0] || v.label
    }));
});

const valueMap = computed(() => {
  const m = {};
  for (const v of coreValues.value) m[v.key] = v;
  return m;
});

const responseMap = computed(() => {
  const m = {};
  for (const r of responses.value) m[r.valueKey] = r;
  return m;
});

const activeKey = computed(() => coreValues.value[scoreIndex.value]?.key || '');
const activeValue = computed(() => valueMap.value[activeKey.value] || null);
const currentLife = computed(() => responseMap.value[activeKey.value]?.currentLifeScore ?? null);
const idealLife = computed(() => responseMap.value[activeKey.value]?.idealLifeScore ?? null);
const confidence = computed(
  () => responseMap.value[activeKey.value]?.confidenceToChangeScore ?? null
);
const personalDefinition = computed(
  () => responseMap.value[activeKey.value]?.personalDefinition || ''
);
const currentChips = computed(() => responseMap.value[activeKey.value]?.reflectionChips || []);
const currentNote = computed(() => responseMap.value[activeKey.value]?.note || '');
const signedGap = computed(() => calculateSignedAlignmentGap(currentLife.value, idealLife.value));
const valueAlignmentScore = computed(() =>
  calculateValueAlignmentScore(currentLife.value, idealLife.value)
);
const gapStatus = computed(() => signedGapStatusLabel(signedGap.value));
const interpretation = computed(() =>
  interpretCurrentIdealPair(currentLife.value, idealLife.value)
);
const activeReflectionOptions = computed(
  () => REFLECTION_OPTIONS_BY_VALUE[activeKey.value] || REFLECTION_OPTIONS_BY_VALUE.integrity
);

const scoredCount = computed(
  () =>
    coreValues.value.filter((v) => {
      const r = responseMap.value[v.key];
      return (
        r?.seasonStatus === 'not_relevant' ||
        (r?.currentLifeScore != null && r?.idealLifeScore != null)
      );
    }).length
);

const canAdvanceValue = computed(() => {
  const r = responseMap.value[activeKey.value];
  return (
    r?.seasonStatus === 'not_relevant' ||
    (r?.currentLifeScore != null && r?.idealLifeScore != null)
  );
});

const nextLabel = computed(
  () => coreValues.value[scoreIndex.value + 1]?.label || 'next'
);

const summary = computed(() =>
  buildLifeAlignmentSummary(template.value, responses.value, priorityKeys.value)
);

function toggleList(arr, item) {
  const i = arr.indexOf(item);
  if (i >= 0) arr.splice(i, 1);
  else arr.push(item);
}

function formatGap(g) {
  if (g == null) return '—';
  return g > 0 ? `+${g}` : String(g);
}

function signedGapFor(key) {
  const r = responseMap.value[key];
  return calculateSignedAlignmentGap(r?.currentLifeScore, r?.idealLifeScore);
}

function persistGuest() {
  if (!isGuest.value) return;
  try {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({
        step: step.value,
        responses: responses.value,
        priorityKeys: priorityKeys.value,
        priorityTypes: { ...priorityTypes },
        scoreIndex: scoreIndex.value,
        commitmentDrafts: { ...commitmentDrafts },
        context: { ...context, concerns: [...context.concerns], goals: [...context.goals] },
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
  [step, responses, priorityKeys, scoreIndex, context],
  () => persistGuest(),
  { deep: true }
);

function ensureResponse(key) {
  if (!responseMap.value[key]) {
    responses.value = [
      ...responses.value,
      {
        valueKey: key,
        currentLifeScore: null,
        idealLifeScore: null,
        confidenceToChangeScore: null,
        personalDefinition: '',
        seasonStatus: 'active',
        reflectionChips: [],
        note: ''
      }
    ];
  }
}

function patchResponse(key, patch) {
  ensureResponse(key);
  responses.value = responses.value.map((r) => (r.valueKey === key ? { ...r, ...patch } : r));
}

function setCurrent(n) {
  patchResponse(activeKey.value, { currentLifeScore: n, seasonStatus: 'active' });
}

function setIdeal(n) {
  patchResponse(activeKey.value, { idealLifeScore: n });
}

function setConfidence(n) {
  patchResponse(activeKey.value, { confidenceToChangeScore: n });
}

function toggleChip(chip) {
  const set = new Set(currentChips.value);
  if (set.has(chip)) set.delete(chip);
  else set.add(chip);
  patchResponse(activeKey.value, { reflectionChips: [...set] });
}

function markNotRelevant() {
  patchResponse(activeKey.value, {
    seasonStatus: 'not_relevant',
    currentLifeScore: null,
    idealLifeScore: null
  });
  nextScore();
}

function startScoring() {
  scoreIndex.value = 0;
  for (const v of coreValues.value) ensureResponse(v.key);
  step.value = 'ideal-guide';
}

function nextScore() {
  if (scoreIndex.value >= coreValues.value.length - 1) {
    step.value = 'complete-preview';
  } else {
    scoreIndex.value += 1;
  }
}

function jumpToValue(key) {
  const idx = coreValues.value.findIndex((v) => v.key === key);
  if (idx >= 0) {
    scoreIndex.value = idx;
    step.value = 'score';
  }
}

function togglePriority(key, checked) {
  if (checked) {
    if (priorityKeys.value.length >= maxPriorities.value) return;
    priorityKeys.value = [...priorityKeys.value, key];
    if (!priorityTypes[key]) priorityTypes[key] = 'increase';
  } else {
    priorityKeys.value = priorityKeys.value.filter((k) => k !== key);
  }
}

function goCommitments() {
  for (const key of priorityKeys.value) {
    if (!commitmentDrafts[key]) {
      commitmentDrafts[key] = {
        personalDefinition:
          responseMap.value[key]?.personalDefinition || valueMap.value[key]?.definition || '',
        currentBehavior: '',
        desiredBehavior: '',
        firstStep: '',
        recurringAction: '',
        boundaryOrTradeoff: '',
        successIndicator: '',
        targetDate: '',
        confidenceScore: responseMap.value[key]?.confidenceToChangeScore ?? null,
        priorityType: priorityTypes[key] || 'increase'
      };
    }
  }
  step.value = 'commitments';
}

function finishAssessment() {
  step.value = 'done';
  persistGuest();
}

function buildExport() {
  return {
    type: 'values_alignment_life_wheel_guest',
    title: 'Values Alignment Assessment',
    visualExperience: 'Life Alignment Wheel',
    exportedAt: new Date().toISOString(),
    context: { ...context },
    summary: summary.value,
    values: coreValues.value.map((v) => ({
      key: v.key,
      label: v.label,
      ...(responseMap.value[v.key] || {})
    })),
    priorityKeys: priorityKeys.value,
    plans: priorityKeys.value.map((key) => ({
      valueKey: key,
      label: valueMap.value[key]?.label,
      ...(commitmentDrafts[key] || {})
    }))
  };
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `values-alignment-${new Date().toISOString().slice(0, 10)}.json`;
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
  Object.keys(commitmentDrafts).forEach((k) => delete commitmentDrafts[k]);
  context.lifeSeason = '';
  context.concerns = [];
  context.goals = [];
  context.timeframe = 'current-season';
  step.value = 'welcome';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/values-alignment/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.values?.length) {
      error.value =
        'Values Alignment template is not available yet. Run migrations 918 and 923.';
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
          if (typeof cached?.scoreIndex === 'number') scoreIndex.value = cached.scoreIndex;
          if (cached?.context) {
            context.lifeSeason = cached.context.lifeSeason || '';
            context.concerns = cached.context.concerns || [];
            context.goals = cached.context.goals || [];
            context.timeframe = cached.context.timeframe || 'current-season';
          }
          for (const [k, v] of Object.entries(cached.commitmentDrafts || {})) {
            commitmentDrafts[k] = { ...v };
          }
          for (const [k, v] of Object.entries(cached.priorityTypes || {})) {
            priorityTypes[k] = v;
          }
        }
      } catch {
        // ignore corrupt cache
      }
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not load assessment';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Source+Sans+3:wght@400;500;600;700&display=swap');

.va-page {
  --va-ink: #1c1917;
  --va-muted: #78716c;
  --va-line: #e7e0d6;
  --va-bg: #f7f3ee;
  --va-card: #fffaf5;
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 10% -10%, rgba(180, 83, 9, 0.08), transparent 55%),
    radial-gradient(700px 360px at 100% 0%, rgba(29, 78, 216, 0.06), transparent 50%),
    var(--va-bg);
  color: var(--va-ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  padding: 1.5rem 1rem 4rem;
}

.va-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--va-muted);
}
.va-state.error {
  color: #9f1239;
}

.va-shell {
  max-width: 1100px;
  margin: 0 auto;
  background: rgba(255, 250, 245, 0.88);
  border: 1px solid var(--va-line);
  border-radius: 22px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 40px rgba(28, 25, 23, 0.05);
}

.va-shell--narrow {
  max-width: 640px;
}

.va-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #a16207;
  font-weight: 700;
}

.va-title {
  margin: 0.35rem 0 0.65rem;
  font-family: Fraunces, Georgia, serif;
  font-size: clamp(1.55rem, 3vw, 2.15rem);
  font-weight: 650;
  line-height: 1.2;
}

.va-lead,
.va-note,
.va-meta,
.va-clarify {
  color: #57534e;
  line-height: 1.6;
}

.va-clarify {
  font-size: 0.9rem;
  padding: 0.75rem 1rem;
  background: #f5f5f4;
  border-radius: 12px;
}

.va-actions,
.va-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.35rem;
}

.va-footer.sticky {
  position: sticky;
  bottom: 0.5rem;
  background: rgba(255, 250, 245, 0.95);
  padding: 0.75rem 0 0;
  z-index: 5;
}

.va-btn {
  border: 1px solid var(--va-line);
  background: #fff;
  color: var(--va-ink);
  border-radius: 999px;
  padding: 0.7rem 1.15rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

.va-btn.primary {
  background: #1c1917;
  color: #fffaf5;
  border-color: #1c1917;
}

.va-btn.ghost {
  background: transparent;
}

.va-btn.small {
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
}

.va-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.va-steps,
.va-bullets {
  line-height: 1.7;
  color: #44403c;
}

.va-field,
.va-field-label {
  display: grid;
  gap: 0.35rem;
  margin: 1rem 0 0.5rem;
  font-weight: 600;
  font-size: 0.92rem;
}

.va-field select,
.va-field input,
.va-field textarea {
  border: 1px solid var(--va-line);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  background: #fff;
}

.va-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.va-chip {
  border: 1px solid var(--va-line);
  background: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.75rem;
  font-size: 0.82rem;
  cursor: pointer;
}

.va-chip.on {
  background: #1c1917;
  color: #fff;
  border-color: #1c1917;
}

.va-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.va-save {
  font-size: 0.78rem;
  font-weight: 700;
  color: #78716c;
  white-space: nowrap;
}

.va-split {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
  gap: 1.25rem;
  align-items: start;
}

.va-aside {
  position: sticky;
  top: 1rem;
}

.va-aside-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.va-aside-stats div {
  background: #fff;
  border: 1px solid var(--va-line);
  border-radius: 12px;
  padding: 0.55rem;
  text-align: center;
}

.va-aside-stats span {
  display: block;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #a8a29e;
  font-weight: 700;
}

.va-aside-stats strong {
  font-size: 1.1rem;
}

.va-score-block {
  margin-bottom: 1.25rem;
}

.va-score-block h2 {
  margin: 0 0 0.25rem;
  font-size: 1.05rem;
}

.va-score-block p {
  margin: 0 0 0.55rem;
  color: #57534e;
  font-size: 0.92rem;
}

.va-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #a8a29e;
  margin-bottom: 0.35rem;
}

.va-scores {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.3rem;
}

.va-score {
  aspect-ratio: 1;
  border: 1px solid var(--va-line);
  border-radius: 10px;
  background: #fff;
  font-weight: 700;
  cursor: pointer;
  min-height: 2.4rem;
}

.va-score.on {
  background: #b45309;
  color: #fff;
  border-color: #b45309;
}

.va-score.ideal.on {
  background: #1d4ed8;
  border-color: #1d4ed8;
}

.va-score.conf.on {
  background: #0f766e;
  border-color: #0f766e;
}

.va-gap-card {
  background: #fff;
  border: 1px solid var(--va-line);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin-bottom: 1rem;
  display: grid;
  gap: 0.5rem;
}

.va-gap-card > div {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.va-gap-card p {
  margin: 0;
  color: #57534e;
  font-size: 0.9rem;
}

.va-status-pill {
  font-weight: 700 !important;
  color: #1c1917 !important;
}

.va-reflect h2 {
  font-size: 1rem;
}

.va-details {
  margin-top: 0.75rem;
}

.va-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.65rem;
  margin: 1rem 0;
}

.va-stat {
  background: #fff;
  border: 1px solid var(--va-line);
  border-radius: 14px;
  padding: 0.75rem;
}

.va-stat.highlight {
  background: #1c1917;
  color: #fffaf5;
  border-color: #1c1917;
}

.va-stat span {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.75;
  font-weight: 700;
}

.va-stat strong {
  font-size: 1.05rem;
}

.va-viz-row {
  margin: 1rem 0 1.5rem;
  max-width: 420px;
}

.va-insight-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.85rem;
  margin: 1.25rem 0;
}

.va-insight-grid article,
.va-insights,
.va-bridge {
  background: #fff;
  border: 1px solid var(--va-line);
  border-radius: 14px;
  padding: 0.9rem 1rem;
}

.va-insight-grid h2,
.va-insights h2,
.va-bridge h2 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.va-insight-grid ul,
.va-insights ul {
  margin: 0;
  padding-left: 1.1rem;
  color: #44403c;
  line-height: 1.55;
  font-size: 0.9rem;
}

.va-priority-list {
  display: grid;
  gap: 0.65rem;
}

.va-priority-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  align-items: start;
  background: #fff;
  border: 1px solid var(--va-line);
  border-radius: 14px;
  padding: 0.85rem 1rem;
  cursor: pointer;
}

.va-priority-card p {
  margin: 0.2rem 0 0.45rem;
  color: #78716c;
  font-size: 0.85rem;
}

.va-priority-card select {
  width: 100%;
  border: 1px solid var(--va-line);
  border-radius: 8px;
  padding: 0.35rem;
}

.va-bridge {
  margin-bottom: 1rem;
}

.va-bridge-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #a8a29e;
}

.va-bridge-flow span::after {
  content: ' →';
  color: #d6d3d1;
}

.va-bridge-flow span:last-child::after {
  content: '';
}

.mobile-only {
  display: none;
}

@media (max-width: 900px) {
  .va-split {
    grid-template-columns: 1fr;
  }
  .va-aside {
    position: static;
    order: -1;
  }
  .va-scores {
    gap: 0.35rem;
  }
  .va-score {
    min-height: 2.75rem;
  }
}

@media print {
  .va-page {
    background: #fff;
    padding: 0;
  }
  .va-btn,
  .va-footer,
  .va-actions {
    display: none !important;
  }
}
</style>
