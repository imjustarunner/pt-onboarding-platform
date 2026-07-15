<template>
  <div class="bp-page">
    <button type="button" class="bp-exit" title="Quick Exit" @click="quickExit">Quick Exit</button>

    <div v-if="loading" class="bp-state">Loading The Burden &amp; Purpose Assessment…</div>
    <div v-else-if="error" class="bp-state error">{{ error }}</div>

    <template v-else-if="template">
      <section v-if="step === 'welcome'" class="bp-shell bp-shell--narrow">
        <p class="bp-eyebrow">The Burden &amp; Purpose Assessment</p>
        <h1 class="bp-title">What Are You Willing to Carry?</h1>
        <p class="bp-lead">
          Meaningful responsibility is not the same as suffering. This path helps you see what is driving
          you, what you are carrying well, where growth is avoided, and what to do next — without glorifying
          overwork, self-erasure, or emotional suppression.
        </p>
        <p class="bp-note">
          Twelve pillars. Four regions. The Builder’s Path. Orientations are self-reported patterns, not
          ranks of worth.
        </p>
        <p class="bp-meta">18 to 25 minutes · The Builder’s Path</p>
        <div class="bp-actions">
          <button type="button" class="bp-btn primary" @click="step = 'context'">
            Begin the Builder’s Path
          </button>
          <button type="button" class="bp-btn ghost" @click="step = 'how'">How this works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="bp-shell bp-shell--narrow">
        <h1 class="bp-title">How This Assessment Works</h1>
        <ol class="bp-bullets">
          <li>Share optional context about your season and goals.</li>
          <li>Rate Current Practice for each pillar — and Meaning and Sustainable Capacity when helpful.</li>
          <li>Watch The Builder’s Path take shape across four regions.</li>
          <li>Review the four-question dashboard and Meaningful Burden Matrix.</li>
          <li>Choose one or two priorities and build a Carry / Release / Serve / Recover plan.</li>
        </ol>
        <p class="bp-clarify">{{ template.settings?.disclaimer }}</p>
        <div class="bp-actions">
          <button type="button" class="bp-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="bp-btn primary" @click="step = 'context'">Continue</button>
        </div>
      </section>

      <section v-else-if="step === 'context'" class="bp-shell bp-shell--narrow">
        <p class="bp-eyebrow">Before you begin</p>
        <h1 class="bp-title">Your current season</h1>

        <p class="bp-field-label">Participant version</p>
        <div class="bp-mode-grid">
          <button
            v-for="v in PARTICIPANT_VERSION_OPTIONS"
            :key="v.id"
            type="button"
            class="bp-mode"
            :class="{ on: participantVersion === v.id }"
            @click="participantVersion = v.id"
          >
            <strong>{{ v.label }}</strong>
            <span>{{ v.description }}</span>
          </button>
        </div>

        <p class="bp-field-label">Assessment mode</p>
        <div class="bp-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="bp-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>

        <label class="bp-field">
          Assessment timeframe
          <select v-model="timeframe">
            <option v-for="o in TIMEFRAME_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>

        <p class="bp-field-label">Current life stage (optional)</p>
        <div class="bp-chips">
          <button
            v-for="s in LIFE_STAGE_OPTIONS"
            :key="s"
            type="button"
            class="bp-chip"
            :class="{ on: lifeStages.includes(s) }"
            @click="toggleList(lifeStages, s)"
          >
            {{ s }}
          </button>
        </div>

        <p class="bp-field-label">Current goal (optional)</p>
        <div class="bp-chips">
          <button
            v-for="g in CURRENT_GOAL_OPTIONS"
            :key="g"
            type="button"
            class="bp-chip"
            :class="{ on: goals.includes(g) }"
            @click="toggleList(goals, g)"
          >
            {{ g }}
          </button>
        </div>

        <div class="bp-actions">
          <button type="button" class="bp-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="bp-btn primary" @click="startScoring">Begin →</button>
        </div>
      </section>

      <section v-else-if="step === 'score'" class="bp-shell bp-shell--split">
        <header class="bp-header">
          <div>
            <p class="bp-eyebrow">
              {{ scoredCount }} of {{ activeDomains.length }} completed ·
              {{ timeframeLabel }} · {{ saveStatus || 'Ready' }}
            </p>
            <h1 class="bp-title">{{ activeDomain?.label }}</h1>
            <p class="bp-lead">{{ activeDomain?.definition }}</p>
          </div>
        </header>

        <div class="bp-split">
          <div class="bp-panel">
            <div class="bp-score-block">
              <h2>{{ activeDomain?.primaryQuestion || 'How strong is your current practice here?' }}</h2>
              <div class="bp-scale-labels">
                <span>Largely Unpracticed</span>
                <span>Well Integrated</span>
              </div>
              <div class="bp-scores" role="group" :aria-label="`${activeDomain?.label} current practice`">
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="bp-score"
                  :class="{ on: practice === n }"
                  @click="setPractice(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="practice != null" class="bp-gap-card" role="status" aria-live="polite">
              <p>{{ interpretation }}</p>
              <p class="bp-status-pill">{{ statusLabel }}</p>
              <p class="bp-live">
                {{ activeDomain?.label }} Current Practice updated to {{ practice }} out of 10.
                Burden Readiness is now {{ summary.burdenReadinessIndex ?? '—' }} out of 100.
              </p>
            </div>

            <div v-if="practice != null && enableImportance" class="bp-score-block">
              <h2>How meaningful is this pillar in your current season?</h2>
              <div class="bp-scale-labels">
                <span>Low Meaning</span>
                <span>Essential</span>
              </div>
              <div class="bp-scores">
                <button
                  v-for="n in 10"
                  :key="`i-${n}`"
                  type="button"
                  class="bp-score soft"
                  :class="{ on: importance === n }"
                  @click="patchResponse(activeKey, { personalImportanceScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="practice != null && enableCapacity && canShowCapacity" class="bp-score-block">
              <h2>How sustainable is your capacity to carry this?</h2>
              <div class="bp-scale-labels">
                <span>Not Sustainable</span>
                <span>Highly Sustainable</span>
              </div>
              <div class="bp-scores">
                <button
                  v-for="n in 10"
                  :key="`c-${n}`"
                  type="button"
                  class="bp-score soft"
                  :class="{ on: capacity === n }"
                  @click="patchResponse(activeKey, { sustainableCapacityScore: n })"
                >
                  {{ n }}
                </button>
              </div>
              <p class="bp-hint">
                Sustainable capacity is not toughness. Sleep, recovery, and asking for help count.
              </p>
            </div>

            <div v-if="practice != null && enableLoad && canShowLoad" class="bp-score-block">
              <h2>Optional — how heavy does the current load feel? (separate from readiness)</h2>
              <div class="bp-scores">
                <button
                  v-for="n in 10"
                  :key="`l-${n}`"
                  type="button"
                  class="bp-score soft"
                  :class="{ on: currentLoad === n }"
                  @click="patchResponse(activeKey, { currentLoadScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="canShowReflections" class="bp-score-block">
              <h2>{{ activeDomain?.reflectionPrompt || 'What most affects this pillar?' }}</h2>
              <div class="bp-chips">
                <button
                  v-for="chip in activeDomain?.reflectionOptions || []"
                  :key="chip"
                  type="button"
                  class="bp-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>
            </div>

            <footer class="bp-footer sticky">
              <button
                type="button"
                class="bp-btn ghost small"
                :disabled="scoreIndex === 0"
                @click="scoreIndex -= 1"
              >
                Back
              </button>
              <button type="button" class="bp-btn ghost small" @click="markNotRelevant">
                Not relevant
              </button>
              <button type="button" class="bp-btn primary" :disabled="!canAdvance" @click="nextScore">
                {{ scoreIndex >= activeDomains.length - 1 ? 'Show results →' : `Next: ${nextLabel}` }}
              </button>
            </footer>
          </div>

          <aside class="bp-aside">
            <BuildersPath
              compact
              interactive
              :domains="activeDomains"
              :responses="responses"
              :burden-readiness-index="summary.burdenReadinessIndex"
              :system-scores="summary.systemScores"
              :selected-priority-domain-ids="priorityKeys"
              :active-domain-id="activeKey"
              :orientation-label="summary.orientation?.label"
              :carrying-well-count="summary.carryingWellCount"
              :growth-opportunity-count="summary.growthOpportunityCount"
              :overextended-keys="overextendedKeys"
              :avoidance-keys="avoidanceKeys"
              @domain-select="jumpToDomain"
            />
          </aside>
        </div>
      </section>

      <section v-else-if="step === 'results'" class="bp-shell">
        <p class="bp-eyebrow">Results dashboard</p>
        <h1 class="bp-title">Your Builder’s Path Profile</h1>
        <div class="bp-stats">
          <div class="bp-stat highlight">
            <span>Burden Readiness</span>
            <strong>{{ summary.burdenReadinessIndex ?? '—' }}</strong>
          </div>
          <div class="bp-stat">
            <span>Level</span>
            <strong>{{ summary.statusLabel }}</strong>
          </div>
          <div class="bp-stat">
            <span>Orientation</span>
            <strong>{{ summary.orientation?.label || '—' }}</strong>
          </div>
        </div>
        <p class="bp-clarify">{{ summary.orientationClarification }}</p>

        <div class="bp-split">
          <div class="bp-panel">
            <div class="bp-dash-grid">
              <article v-for="block in dashboardBlocks" :key="block.key" class="bp-dash-card">
                <h2>{{ block.question }}</h2>
                <p>{{ block.summary }}</p>
                <ul v-if="block.pillars?.length">
                  <li v-for="p in block.pillars.slice(0, 4)" :key="p.domainKey">
                    <strong>{{ p.label }}</strong>
                    — Practice {{ p.currentPracticeScore }}
                    <template v-if="p.personalImportanceScore != null">
                      · Meaning {{ p.personalImportanceScore }}
                    </template>
                  </li>
                </ul>
                <ul v-if="block.steps?.length">
                  <li v-for="(s, i) in block.steps" :key="i">{{ s }}</li>
                </ul>
              </article>
            </div>

            <MeaningfulBurdenMatrix
              :domains="activeDomains"
              :responses="responses"
              :burden-entries="burdenEntries"
              :selected-priority-domain-ids="priorityKeys"
              :clarification="summary.matrixClarification"
            />

            <div v-if="summary.insights?.length" class="bp-insights">
              <h2>Insights</h2>
              <ul>
                <li v-for="(t, i) in summary.insights" :key="i">{{ t }}</li>
              </ul>
            </div>
            <p class="bp-clarify">{{ summary.safetyNote }}</p>
          </div>

          <aside class="bp-aside">
            <BuildersPath
              :domains="activeDomains"
              :responses="responses"
              :burden-readiness-index="summary.burdenReadinessIndex"
              :system-scores="summary.systemScores"
              :selected-priority-domain-ids="priorityKeys"
              :orientation-label="summary.orientation?.label"
              :carrying-well-count="summary.carryingWellCount"
              :growth-opportunity-count="summary.growthOpportunityCount"
              :overextended-keys="overextendedKeys"
              :avoidance-keys="avoidanceKeys"
            />
          </aside>
        </div>

        <footer class="bp-footer">
          <button type="button" class="bp-btn ghost" @click="step = 'score'; scoreIndex = 0">
            Edit scores
          </button>
          <button type="button" class="bp-btn primary" @click="step = 'priorities'">
            Choose priorities →
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'priorities'" class="bp-shell bp-shell--narrow">
        <h1 class="bp-title">Where should focused attention go?</h1>
        <p class="bp-note">
          You do not have to select the lowest score. Choose one or two pillars where intentional practice —
          or wiser release — would matter most. Max {{ maxPriorities }}.
        </p>
        <div class="bp-priority-list">
          <label v-for="d in activeDomains" :key="d.key" class="bp-priority">
            <input
              type="checkbox"
              :checked="priorityKeys.includes(d.key)"
              :disabled="!priorityKeys.includes(d.key) && priorityKeys.length >= maxPriorities"
              @change="togglePriority(d.key, $event.target.checked)"
            />
            <span>
              <strong>{{ d.label }}</strong>
              <em>
                Practice {{ responseMap[d.key]?.currentPracticeScore ?? '—' }}
                <template v-if="responseMap[d.key]?.personalImportanceScore != null">
                  · Meaning {{ responseMap[d.key].personalImportanceScore }}
                </template>
                <template v-if="responseMap[d.key]?.sustainableCapacityScore != null">
                  · Capacity {{ responseMap[d.key].sustainableCapacityScore }}
                </template>
              </em>
            </span>
          </label>
        </div>
        <footer class="bp-footer">
          <button type="button" class="bp-btn ghost" @click="step = 'results'">Back</button>
          <button
            type="button"
            class="bp-btn primary"
            :disabled="!priorityKeys.length"
            @click="goPlans"
          >
            Build Commitment Plan →
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'plans'" class="bp-shell">
        <h1 class="bp-title">Meaningful Commitment Plan</h1>
        <p class="bp-note">
          Use Carry, Release, Serve, and Recover. Never treat sleep deprivation, abuse-as-loyalty, or
          self-erasure as growth.
        </p>
        <div v-for="key in priorityKeys" :key="key" class="bp-plan-card">
          <h2>{{ domainMap[key]?.label }}</h2>
          <div class="bp-move-grid">
            <button
              v-for="m in COMMITMENT_MOVES"
              :key="m.id"
              type="button"
              class="bp-mode"
              :class="{ on: planDrafts[key]?.primaryMove === m.id }"
              @click="planDrafts[key].primaryMove = m.id"
            >
              <strong>{{ m.label }}</strong>
              <span>{{ m.description }}</span>
            </button>
          </div>
          <label class="bp-field">
            What I will Carry
            <input v-model="planDrafts[key].carry" type="text" placeholder="One practiced burden" />
          </label>
          <label class="bp-field">
            What I will Release
            <input v-model="planDrafts[key].release" type="text" placeholder="One load or pattern to put down" />
          </label>
          <label class="bp-field">
            How I will Serve (bounded)
            <input v-model="planDrafts[key].serve" type="text" placeholder="Contribution without self-erasure" />
          </label>
          <label class="bp-field">
            How I will Recover
            <input v-model="planDrafts[key].recover" type="text" placeholder="Rest that protects capacity" />
          </label>
          <label class="bp-field">
            Smallest first action
            <input v-model="planDrafts[key].smallestFirstAction" type="text" />
          </label>
          <label class="bp-field">
            Success indicator
            <input v-model="planDrafts[key].successIndicator" type="text" />
          </label>
          <label class="bp-field">
            Confidence (1–10)
            <input v-model.number="planDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="(planDrafts[key].confidenceScore || 10) < 7" class="bp-clarify">
            How could this commitment become smaller, clearer, or more recoverable?
          </p>
        </div>
        <footer class="bp-footer">
          <button type="button" class="bp-btn ghost" @click="step = 'priorities'">Back</button>
          <button type="button" class="bp-btn primary" @click="finish">Finish →</button>
        </footer>
      </section>

      <section v-else-if="step === 'done'" class="bp-shell bp-shell--narrow">
        <p class="bp-eyebrow">Complete</p>
        <h1 class="bp-title">Your Builder’s Path</h1>
        <div class="bp-stats">
          <div class="bp-stat highlight">
            <span>Readiness</span>
            <strong>{{ summary.burdenReadinessIndex ?? '—' }}</strong>
          </div>
          <div class="bp-stat">
            <span>Orientation</span>
            <strong>{{ summary.orientation?.label }}</strong>
          </div>
        </div>
        <BuildersPath
          :domains="activeDomains"
          :responses="responses"
          :burden-readiness-index="summary.burdenReadinessIndex"
          :system-scores="summary.systemScores"
          :selected-priority-domain-ids="priorityKeys"
          :orientation-label="summary.orientation?.label"
          :carrying-well-count="summary.carryingWellCount"
          :growth-opportunity-count="summary.growthOpportunityCount"
        />
        <p class="bp-clarify">{{ summary.indexClarification }}</p>
        <div class="bp-actions">
          <button type="button" class="bp-btn primary" @click="downloadPdf">Print / Save PDF</button>
          <button type="button" class="bp-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="bp-btn ghost" @click="resetGuest">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import BuildersPath from '../../components/burdenPurpose/BuildersPath.vue';
import MeaningfulBurdenMatrix from '../../components/burdenPurpose/MeaningfulBurdenMatrix.vue';
import {
  PARTICIPANT_VERSION_OPTIONS,
  MODE_OPTIONS,
  COMMITMENT_MOVES,
  LIFE_STAGE_OPTIONS,
  CURRENT_GOAL_OPTIONS,
  TIMEFRAME_OPTIONS,
  buildBurdenPurposeSummary,
  domainsForContext,
  pillarStatusLabel,
  interpretPracticeScore
} from '../../utils/burdenPurpose.js';

const route = useRoute();
const isGuest = computed(() => !!route.meta?.guestBurdenPurpose);
const GUEST_KEY = 'bp-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const participantVersion = ref('general-adult');
const mode = ref('full');
const timeframe = ref('current-season');
const lifeStages = ref([]);
const goals = ref([]);
const responses = ref([]);
const burdenEntries = ref([]);
const priorityKeys = ref([]);
const scoreIndex = ref(0);
const saveStatus = ref('');
const planDrafts = reactive({});

const settings = computed(() => template.value?.settings || {});
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 2));
const enableImportance = computed(() => settings.value.enableImportance !== false);
const enableCapacity = computed(() => settings.value.enableSustainableCapacity !== false);
const enableLoad = computed(() => settings.value.enableCurrentLoad !== false);

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
const practice = computed(() => responseMap.value[activeKey.value]?.currentPracticeScore ?? null);
const importance = computed(
  () => responseMap.value[activeKey.value]?.personalImportanceScore ?? null
);
const capacity = computed(
  () => responseMap.value[activeKey.value]?.sustainableCapacityScore ?? null
);
const currentLoad = computed(() => responseMap.value[activeKey.value]?.currentLoadScore ?? null);
const currentChips = computed(() => responseMap.value[activeKey.value]?.reflectionChips || []);
const statusLabel = computed(() => pillarStatusLabel(practice.value));
const interpretation = computed(() =>
  interpretPracticeScore(practice.value, activeDomain.value?.label || 'This pillar')
);

const canShowCapacity = computed(() => {
  if (!enableCapacity.value || practice.value == null) return false;
  if (enableImportance.value && importance.value == null) return false;
  return true;
});

const canShowLoad = computed(() => {
  if (!enableLoad.value || practice.value == null) return false;
  if (enableImportance.value && importance.value == null) return false;
  if (enableCapacity.value && capacity.value == null) return false;
  return true;
});

const canShowReflections = computed(() => {
  if (practice.value == null) return false;
  if (enableImportance.value && importance.value == null) return false;
  if (enableCapacity.value && capacity.value == null) return false;
  return true;
});

const scoredCount = computed(
  () =>
    activeDomains.value.filter((d) => {
      const r = responseMap.value[d.key];
      return (
        r?.preferNotToAnswer ||
        r?.seasonStatus === 'not-relevant' ||
        r?.currentPracticeScore != null
      );
    }).length
);

const canAdvance = computed(() => {
  const r = responseMap.value[activeKey.value];
  return (
    r?.preferNotToAnswer ||
    r?.seasonStatus === 'not-relevant' ||
    r?.currentPracticeScore != null
  );
});

const nextLabel = computed(() => activeDomains.value[scoreIndex.value + 1]?.label || 'next');
const timeframeLabel = computed(
  () => TIMEFRAME_OPTIONS.find((o) => o.id === timeframe.value)?.label || 'Current life season'
);

const summary = computed(() =>
  buildBurdenPurposeSummary(template.value, responses.value, {
    mode: mode.value,
    participantVersion: participantVersion.value,
    priorityKeys: priorityKeys.value
  })
);

const overextendedKeys = computed(() =>
  (summary.value.overextendedPillars || []).map((x) => x.domainKey)
);
const avoidanceKeys = computed(() =>
  (summary.value.avoidancePillars || []).map((x) => x.domainKey)
);

const dashboardBlocks = computed(() => {
  const d = summary.value.dashboard || {};
  return [
    { key: 'drive', ...d.whatIsDrivingMe },
    { key: 'carry', ...d.whatAmICarryingWell },
    { key: 'avoid', ...d.whereAmIAvoidingGrowth },
    { key: 'next', ...d.whatShouldIDoNext }
  ].filter((b) => b?.question);
});

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
        goals: goals.value,
        responses: responses.value,
        burdenEntries: burdenEntries.value,
        priorityKeys: priorityKeys.value,
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
  [step, responses, priorityKeys, scoreIndex, participantVersion, mode, timeframe, burdenEntries],
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
        currentPracticeScore: null,
        personalImportanceScore: null,
        sustainableCapacityScore: null,
        currentLoadScore: null,
        reflectionChips: [],
        barriers: [],
        personalStrengths: [],
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

function setPractice(n) {
  patchResponse(activeKey.value, {
    currentPracticeScore: n,
    preferNotToAnswer: false,
    seasonStatus: 'active'
  });
}

function toggleChip(chip) {
  const set = new Set(currentChips.value);
  if (set.has(chip)) set.delete(chip);
  else set.add(chip);
  const chips = [...set];
  const barriers = chips.filter(
    (c) => String(c).toLowerCase().includes('avoid') && String(c).toLowerCase().includes('matters')
  );
  patchResponse(activeKey.value, { reflectionChips: chips, barriers });
}

function markNotRelevant() {
  patchResponse(activeKey.value, {
    seasonStatus: 'not-relevant',
    currentPracticeScore: null
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

function goPlans() {
  for (const key of priorityKeys.value) {
    if (!planDrafts[key]) {
      planDrafts[key] = {
        primaryMove: 'carry',
        carry: '',
        release: '',
        serve: '',
        recover: '',
        smallestFirstAction: '',
        successIndicator: '',
        confidenceScore: null
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
  window.location.href = url;
}

function buildExport() {
  return {
    type: 'burden_purpose_guest',
    title: 'The Burden & Purpose Assessment',
    visualExperience: "The Builder's Path",
    exportedAt: new Date().toISOString(),
    participantVersion: participantVersion.value,
    mode: mode.value,
    timeframe: timeframe.value,
    context: { lifeStages: lifeStages.value, goals: goals.value },
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
  a.download = `burden-purpose-${new Date().toISOString().slice(0, 10)}.json`;
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
  burdenEntries.value = [];
  priorityKeys.value = [];
  scoreIndex.value = 0;
  Object.keys(planDrafts).forEach((k) => delete planDrafts[k]);
  step.value = 'welcome';
}

async function loadAssessmentTemplate() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/burden-purpose/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value = 'Burden & Purpose template is not available yet. Run migration 930.';
      return;
    }
    if (isGuest.value) {
      try {
        const raw = localStorage.getItem(GUEST_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.responses) responses.value = cached.responses;
          if (cached?.burdenEntries) burdenEntries.value = cached.burdenEntries;
          if (cached?.priorityKeys) priorityKeys.value = cached.priorityKeys;
          if (cached?.step) step.value = cached.step;
          if (cached?.participantVersion) participantVersion.value = cached.participantVersion;
          if (cached?.mode) mode.value = cached.mode;
          if (cached?.timeframe) timeframe.value = cached.timeframe;
          if (cached?.lifeStages) lifeStages.value = cached.lifeStages;
          if (cached?.goals) goals.value = cached.goals;
          if (typeof cached?.scoreIndex === 'number') scoreIndex.value = cached.scoreIndex;
          for (const [k, v] of Object.entries(cached.planDrafts || {})) {
            planDrafts[k] = { ...v };
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

onMounted(loadAssessmentTemplate);
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Manrope:wght@400;500;600;700&display=swap');

.bp-page {
  --ink: #1c1917;
  --muted: #6b7280;
  --line: #d6d3d1;
  --bg: #f4f7f5;
  --forest: #1b4332;
  --forest-2: #2d6a4f;
  --slate: #457b9d;
  --bronze: #a16207;
  --charcoal: #292524;
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 8% -10%, rgba(27, 67, 50, 0.14), transparent 55%),
    radial-gradient(700px 360px at 100% 0%, rgba(69, 123, 157, 0.12), transparent 50%),
    linear-gradient(180deg, #e8efea 0%, var(--bg) 42%);
  color: var(--ink);
  font-family: Manrope, system-ui, sans-serif;
  padding: 1.5rem 1rem 4rem;
  position: relative;
}

.bp-exit {
  position: fixed;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 40;
  appearance: none;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.92);
  color: var(--charcoal);
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.bp-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--muted);
}
.bp-state.error {
  color: #9f1239;
}

.bp-shell {
  max-width: 1140px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 40px rgba(28, 25, 23, 0.06);
}
.bp-shell--narrow {
  max-width: 660px;
}

.bp-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--bronze);
  font-weight: 700;
}
.bp-title {
  margin: 0.35rem 0 0.65rem;
  font-family: Fraunces, Georgia, serif;
  font-size: clamp(1.5rem, 3vw, 2.15rem);
  font-weight: 700;
  line-height: 1.25;
  color: var(--charcoal);
}
.bp-lead,
.bp-note,
.bp-meta,
.bp-clarify,
.bp-hint {
  color: #57534e;
  line-height: 1.6;
}
.bp-clarify {
  font-size: 0.9rem;
  padding: 0.75rem 1rem;
  background: #f1f5f4;
  border-radius: 12px;
}
.bp-hint {
  font-size: 0.82rem;
  margin: 0.45rem 0 0;
}

.bp-actions,
.bp-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.25rem;
}
.bp-footer.sticky {
  position: sticky;
  bottom: 0.5rem;
  background: rgba(255, 255, 255, 0.95);
  border-top: 1px solid var(--line);
  padding: 0.85rem 0 0.25rem;
  z-index: 5;
}

.bp-btn {
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
.bp-btn.primary {
  background: var(--forest);
  border-color: #142f24;
  color: #fff;
}
.bp-btn.ghost {
  background: transparent;
}
.bp-btn.small {
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
}
.bp-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.bp-bullets {
  padding-left: 1.2rem;
  color: #57534e;
  line-height: 1.7;
}
.bp-field-label {
  margin: 1rem 0 0.45rem;
  font-size: 0.85rem;
  font-weight: 650;
}
.bp-field {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.85rem;
  font-size: 0.9rem;
  color: #44403c;
}
.bp-field input,
.bp-field select,
.bp-field textarea {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  background: #fff;
}

.bp-mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.5rem;
}
.bp-mode {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 14px;
  padding: 0.7rem 0.75rem;
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 0.2rem;
}
.bp-mode.on {
  border-color: var(--forest);
  background: rgba(27, 67, 50, 0.06);
  box-shadow: inset 0 0 0 1px var(--forest);
}
.bp-mode strong {
  font-size: 0.9rem;
}
.bp-mode span,
.bp-mode em {
  font-size: 0.78rem;
  color: var(--muted);
  font-style: normal;
}

.bp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.bp-chip {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.bp-chip.on {
  background: var(--forest);
  border-color: var(--forest);
  color: #fff;
}

.bp-split {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 1rem;
  margin-top: 0.75rem;
  align-items: start;
}
.bp-aside {
  position: sticky;
  top: 0.75rem;
}
.bp-panel {
  min-width: 0;
}

.bp-score-block {
  margin-top: 1rem;
}
.bp-score-block h2 {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  font-family: Fraunces, Georgia, serif;
}
.bp-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--muted);
  margin-bottom: 0.35rem;
}
.bp-scores {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 0.3rem;
}
.bp-score {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 10px;
  padding: 0.55rem 0;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.bp-score.on {
  background: var(--forest);
  border-color: var(--forest);
  color: #fff;
}
.bp-score.soft.on {
  background: var(--slate);
  border-color: var(--slate);
}

.bp-gap-card {
  margin-top: 0.85rem;
  padding: 0.85rem 1rem;
  border-radius: 14px;
  background: rgba(27, 67, 50, 0.06);
  border: 1px solid rgba(27, 67, 50, 0.12);
}
.bp-status-pill {
  display: inline-block;
  margin: 0.35rem 0;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(69, 123, 157, 0.12);
  color: #1d3557;
  font-size: 0.78rem;
  font-weight: 700;
}
.bp-live {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: #44403c;
}

.bp-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.6rem;
  margin: 0.75rem 0 1rem;
}
.bp-stat {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.75rem;
  background: #fff;
}
.bp-stat.highlight {
  background: rgba(27, 67, 50, 0.08);
  border-color: rgba(27, 67, 50, 0.2);
}
.bp-stat span {
  display: block;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.bp-stat strong {
  display: block;
  margin-top: 0.25rem;
  font-size: 1.25rem;
  font-family: Fraunces, Georgia, serif;
  color: var(--forest);
}

.bp-dash-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.bp-dash-card {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.85rem 0.95rem;
  background: #fff;
}
.bp-dash-card h2 {
  margin: 0 0 0.4rem;
  font-size: 1rem;
  font-family: Fraunces, Georgia, serif;
  color: var(--forest);
}
.bp-dash-card p {
  margin: 0;
  font-size: 0.9rem;
  color: #44403c;
  line-height: 1.5;
}
.bp-dash-card ul {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.85rem;
  color: #57534e;
}

.bp-insights {
  margin: 1rem 0;
}
.bp-insights h2 {
  font-family: Fraunces, Georgia, serif;
  font-size: 1.1rem;
}
.bp-insights ul {
  margin: 0.4rem 0 0;
  padding-left: 1.1rem;
  line-height: 1.55;
  color: #44403c;
}

.bp-priority-list {
  display: grid;
  gap: 0.5rem;
  margin-top: 1rem;
}
.bp-priority {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.7rem 0.8rem;
  background: #fff;
}
.bp-priority strong {
  display: block;
}
.bp-priority em {
  font-style: normal;
  font-size: 0.8rem;
  color: var(--muted);
}

.bp-plan-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 1rem;
  margin-top: 1rem;
  background: #fff;
}
.bp-plan-card h2 {
  margin: 0 0 0.75rem;
  font-family: Fraunces, Georgia, serif;
  color: var(--forest);
}
.bp-move-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.45rem;
  margin-bottom: 0.5rem;
}

@media (max-width: 900px) {
  .bp-split {
    grid-template-columns: 1fr;
  }
  .bp-aside {
    position: static;
    order: -1;
  }
  .bp-dash-grid {
    grid-template-columns: 1fr;
  }
  .bp-scores {
    grid-template-columns: repeat(5, 1fr);
  }
}

@media print {
  .bp-exit,
  .bp-footer,
  .bp-actions {
    display: none !important;
  }
  .bp-page {
    background: #fff;
    padding: 0;
  }
  .bp-shell {
    box-shadow: none;
    border: none;
  }
}
</style>
