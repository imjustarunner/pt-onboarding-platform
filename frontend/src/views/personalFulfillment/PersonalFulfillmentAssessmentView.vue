<template>
  <div class="pf-page">
    <div v-if="loading" class="pf-state">Loading Personal Fulfillment Assessment…</div>
    <div v-else-if="error" class="pf-state error">{{ error }}</div>

    <template v-else-if="template">
      <section v-if="step === 'welcome'" class="pf-shell pf-shell--narrow">
        <p class="pf-eyebrow">Personal Fulfillment Assessment</p>
        <h1 class="pf-title">What Is Making Life Feel Meaningful Right Now?</h1>
        <p class="pf-lead">
          Fulfillment can come from purpose, joy, relationships, progress, freedom, energy, hope, confidence,
          gratitude, and curiosity.
        </p>
        <p class="pf-note">
          Not every area needs to feel strong at the same time. This assessment will help you notice what is
          currently supporting you and what may deserve more intentional attention.
        </p>
        <p class="pf-meta">12 to 18 minutes · Fulfillment Horizon</p>
        <div class="pf-actions">
          <button type="button" class="pf-btn primary" @click="step = 'context'">
            Explore My Fulfillment Horizon
          </button>
          <button type="button" class="pf-btn ghost" @click="step = 'how'">How This Assessment Works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="pf-shell pf-shell--narrow">
        <h1 class="pf-title">How This Assessment Works</h1>
        <ol class="pf-bullets">
          <li>Share optional context about your current season.</li>
          <li>Rate Current Fulfillment—and Importance when helpful—for each domain.</li>
          <li>Watch your Fulfillment Horizon take shape.</li>
          <li>Review the Meaning-Satisfaction Matrix and choose priorities.</li>
          <li>Translate one to three areas into small, realistic actions.</li>
        </ol>
        <p class="pf-clarify">{{ template.settings?.disclaimer }}</p>
        <div class="pf-actions">
          <button type="button" class="pf-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="pf-btn primary" @click="step = 'context'">Continue</button>
        </div>
      </section>

      <section v-else-if="step === 'context'" class="pf-shell pf-shell--narrow">
        <p class="pf-eyebrow">Before you begin</p>
        <h1 class="pf-title">Your current season</h1>

        <p class="pf-field-label">Participant version</p>
        <div class="pf-mode-grid">
          <button
            v-for="v in PARTICIPANT_VERSION_OPTIONS"
            :key="v.id"
            type="button"
            class="pf-mode"
            :class="{ on: participantVersion === v.id }"
            @click="participantVersion = v.id"
          >
            <strong>{{ v.label }}</strong>
            <span>{{ v.description }}</span>
          </button>
        </div>

        <p class="pf-field-label">Assessment mode</p>
        <div class="pf-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="pf-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>

        <label class="pf-field">
          Current life season (optional)
          <select v-model="lifeSeason">
            <option value="">Select</option>
            <option v-for="o in LIFE_SEASON_OPTIONS" :key="o" :value="o">{{ o }}</option>
          </select>
        </label>

        <div class="pf-actions">
          <button type="button" class="pf-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="pf-btn primary" @click="startScoring">Begin →</button>
        </div>
      </section>

      <section v-else-if="step === 'score'" class="pf-shell pf-shell--split">
        <header class="pf-header">
          <div>
            <p class="pf-eyebrow">
              {{ scoredCount }} of {{ activeDomains.length }} completed · {{ saveStatus || 'Ready' }}
            </p>
            <h1 class="pf-title">{{ activeDomain?.label }}</h1>
            <p class="pf-lead">{{ activeDomain?.definition }}</p>
          </div>
        </header>

        <div class="pf-split">
          <div class="pf-panel">
            <div class="pf-score-block">
              <h2>{{ activeDomain?.primaryQuestion || 'How fulfilling does this feel right now?' }}</h2>
              <div class="pf-scale-labels">
                <span>Very unfulfilling</span>
                <span>Deeply fulfilling</span>
              </div>
              <div class="pf-scores" role="group" :aria-label="`${activeDomain?.label} fulfillment`">
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="pf-score"
                  :class="{ on: fulfillment === n }"
                  @click="setFulfillment(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="fulfillment != null" class="pf-gap-card" role="status" aria-live="polite">
              <p>{{ interpretation }}</p>
              <p class="pf-status-pill">{{ statusLabel }}</p>
              <p class="pf-live">
                {{ activeDomain?.label }} Current Fulfillment updated to {{ fulfillment }} out of 10.
                Personal Fulfillment Index is now {{ summary.personalFulfillmentIndex ?? '—' }} out of 100.
              </p>
            </div>

            <div v-if="fulfillment != null && enableImportance" class="pf-score-block">
              <h2>How important is this domain to your overall sense of fulfillment right now?</h2>
              <div class="pf-scale-labels">
                <span>Low importance</span>
                <span>Essential</span>
              </div>
              <div class="pf-scores">
                <button
                  v-for="n in 10"
                  :key="`i-${n}`"
                  type="button"
                  class="pf-score soft"
                  :class="{ on: importance === n }"
                  @click="patchResponse(activeKey, { personalImportanceScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="importance != null && enableMomentum" class="pf-score-block">
              <h2>How much positive movement do you currently feel in this area?</h2>
              <div class="pf-scale-labels">
                <span>Unwanted direction</span>
                <span>Strong positive momentum</span>
              </div>
              <div class="pf-scores">
                <button
                  v-for="n in 10"
                  :key="`m-${n}`"
                  type="button"
                  class="pf-score soft"
                  :class="{ on: momentum === n }"
                  @click="patchResponse(activeKey, { growthMomentumScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="canShowReflections" class="pf-reflect">
              <h2>{{ activeDomain?.reflectionPrompt || 'What most affects this area?' }}</h2>
              <div class="pf-chips">
                <button
                  v-for="chip in activeDomain?.reflectionOptions || []"
                  :key="chip"
                  type="button"
                  class="pf-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>

              <label class="pf-field">
                What does this domain mean to you? (optional)
                <textarea
                  :value="personalDefinition"
                  rows="2"
                  @input="patchResponse(activeKey, { personalDefinition: $event.target.value })"
                />
              </label>

              <label class="pf-field">
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

              <details class="pf-details">
                <summary>Optional private note</summary>
                <textarea
                  :value="privateNote"
                  rows="3"
                  @input="patchResponse(activeKey, { privateNote: $event.target.value })"
                />
              </details>

              <button type="button" class="pf-btn ghost small" @click="markNotRelevant">
                Not relevant in this season
              </button>
            </div>
          </div>

          <aside class="pf-aside">
            <FulfillmentHorizon
              :domains="activeDomains"
              :responses="responses"
              :personal-fulfillment-index="summary.personalFulfillmentIndex"
              :weighted-fulfillment-index="summary.weightedFulfillmentIndex"
              :active-domain-id="activeKey"
              :selected-priority-domain-ids="priorityKeys"
              :strength-domain-count="summary.strengthDomainCount"
              :high-importance-opportunity-count="summary.highImportanceOpportunityCount"
              display-mode="fulfillment-and-importance"
              interactive
              animated
              @domain-select="jumpToDomain"
            />
            <div class="pf-systems">
              <div>
                <span>Meaning</span>
                <strong>{{ summary.systemScores?.meaningAndDirection ?? '—' }}</strong>
              </div>
              <div>
                <span>Positive</span>
                <strong>{{ summary.systemScores?.positiveExperience ?? '—' }}</strong>
              </div>
              <div>
                <span>Capability</span>
                <strong>{{ summary.systemScores?.capabilityAndProgress ?? '—' }}</strong>
              </div>
              <div>
                <span>Connection</span>
                <strong>{{ summary.systemScores?.connectionAndAutonomy ?? '—' }}</strong>
              </div>
            </div>
          </aside>
        </div>

        <footer class="pf-footer sticky">
          <button type="button" class="pf-btn ghost" :disabled="scoreIndex === 0" @click="scoreIndex -= 1">
            Back
          </button>
          <button type="button" class="pf-btn primary" :disabled="!canAdvance" @click="nextScore">
            {{
              scoreIndex >= activeDomains.length - 1
                ? 'See my profile →'
                : `Continue to ${nextLabel} →`
            }}
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'complete-preview'" class="pf-shell pf-shell--narrow">
        <h1 class="pf-title">Your Personal Fulfillment Profile Is Ready</h1>
        <div class="pf-stats">
          <div class="pf-stat highlight">
            <span>Personal Fulfillment Index</span>
            <strong>{{ summary.personalFulfillmentIndex ?? '—' }} / 100</strong>
          </div>
          <div class="pf-stat">
            <span>Description</span>
            <strong>{{ summary.statusLabel || '—' }}</strong>
          </div>
          <div class="pf-stat">
            <span>Strongest source</span>
            <strong>{{ summary.strengths?.[0]?.label || '—' }}</strong>
          </div>
          <div class="pf-stat">
            <span>High-importance growth</span>
            <strong>{{ summary.highImportanceOpportunities?.[0]?.label || '—' }}</strong>
          </div>
        </div>
        <p class="pf-note">
          Fulfillment does not require every part of life to feel equally satisfying. Your profile is a starting
          point for deciding what deserves attention in your current season.
        </p>
        <div class="pf-actions">
          <button type="button" class="pf-btn primary" @click="step = 'review'">
            Explore My Fulfillment Profile
          </button>
          <button type="button" class="pf-btn ghost" @click="step = 'score'; scoreIndex = 0">
            Review My Responses
          </button>
        </div>
      </section>

      <section v-else-if="step === 'review'" class="pf-shell">
        <header class="pf-header">
          <div>
            <p class="pf-eyebrow">Your Personal Fulfillment Profile</p>
            <h1 class="pf-title">Sources of meaning and areas that may deserve attention</h1>
          </div>
        </header>
        <p class="pf-clarify">{{ summary.indexClarification }}</p>

        <div class="pf-stats">
          <div class="pf-stat highlight">
            <span>Index</span>
            <strong>{{ summary.personalFulfillmentIndex ?? '—' }}</strong>
          </div>
          <div class="pf-stat">
            <span>Weighted</span>
            <strong>{{ summary.weightedFulfillmentIndex ?? '—' }}</strong>
          </div>
          <div class="pf-stat">
            <span>Strengths</span>
            <strong>{{ summary.strengthDomainCount || 0 }}</strong>
          </div>
          <div class="pf-stat">
            <span>Growth areas</span>
            <strong>{{ summary.highImportanceOpportunityCount || 0 }}</strong>
          </div>
        </div>

        <div class="pf-viz-row">
          <FulfillmentHorizon
            :domains="activeDomains"
            :responses="responses"
            :personal-fulfillment-index="summary.personalFulfillmentIndex"
            :weighted-fulfillment-index="summary.weightedFulfillmentIndex"
            :selected-priority-domain-ids="priorityKeys"
            :strength-domain-count="summary.strengthDomainCount"
            :high-importance-opportunity-count="summary.highImportanceOpportunityCount"
            display-mode="fulfillment-and-importance"
          />
        </div>

        <MeaningSatisfactionMatrix
          :domains="activeDomains"
          :responses="responses"
          :selected-priority-domain-ids="priorityKeys"
          :clarification="summary.matrixClarification"
        />

        <div class="pf-insight-grid">
          <article>
            <h2>Strongest fulfillment sources</h2>
            <ul>
              <li v-for="x in summary.strengths?.slice(0, 4) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — {{ x.fulfillmentScore }}/10
              </li>
              <li v-if="!(summary.strengths || []).length">No high scores yet — that is okay.</li>
            </ul>
          </article>
          <article>
            <h2>High-importance growth areas</h2>
            <ul>
              <li v-for="x in summary.highImportanceOpportunities?.slice(0, 4) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — Fulfillment {{ x.fulfillmentScore }}, Importance
                {{ x.importanceScore }}
              </li>
              <li v-if="!(summary.highImportanceOpportunities || []).length">
                No high-importance gaps flagged.
              </li>
            </ul>
          </article>
          <article>
            <h2>Lower-priority areas</h2>
            <ul>
              <li v-for="x in summary.lowerPriority?.slice(0, 3) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — may not need attention unless you choose it
              </li>
              <li v-if="!(summary.lowerPriority || []).length">None identified.</li>
            </ul>
          </article>
        </div>

        <div v-if="summary.insights?.length" class="pf-insights">
          <h2>Insights</h2>
          <ul>
            <li v-for="(t, i) in summary.insights" :key="i">{{ t }}</li>
          </ul>
        </div>

        <footer class="pf-footer">
          <button type="button" class="pf-btn ghost" @click="step = 'score'; scoreIndex = 0">Edit scores</button>
          <button type="button" class="pf-btn primary" @click="step = 'priorities'">Choose priorities →</button>
        </footer>
      </section>

      <section v-else-if="step === 'priorities'" class="pf-shell pf-shell--narrow">
        <p class="pf-eyebrow">Priority selection</p>
        <h1 class="pf-title">Which areas would make the greatest positive difference?</h1>
        <p class="pf-lead">
          You do not have to select the lowest score. Choose where a realistic change would feel most meaningful.
        </p>
        <div class="pf-priority-list">
          <label v-for="d in activeDomains" :key="d.key" class="pf-priority-card">
            <input
              type="checkbox"
              :checked="priorityKeys.includes(d.key)"
              :disabled="!priorityKeys.includes(d.key) && priorityKeys.length >= maxPriorities"
              @change="togglePriority(d.key, $event.target.checked)"
            />
            <div>
              <strong>{{ d.label }}</strong>
              <p>
                Fulfillment {{ responseMap[d.key]?.currentFulfillmentScore ?? '—' }} · Importance
                {{ responseMap[d.key]?.personalImportanceScore ?? '—' }}
              </p>
              <select
                v-if="priorityKeys.includes(d.key)"
                :value="priorityTypes[d.key] || 'increase'"
                @change="priorityTypes[d.key] = $event.target.value"
              >
                <option v-for="t in PRIORITY_TYPES" :key="t.id" :value="t.id">{{ t.label }}</option>
              </select>
            </div>
          </label>
        </div>
        <footer class="pf-footer">
          <button type="button" class="pf-btn ghost" @click="step = 'review'">Back</button>
          <button
            type="button"
            class="pf-btn primary"
            :disabled="!priorityKeys.length"
            @click="goPlans"
          >
            Build Personal Fulfillment Plan →
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'plans'" class="pf-shell pf-shell--narrow">
        <p class="pf-eyebrow">Personal Fulfillment Plan</p>
        <h1 class="pf-title">Translate meaning into observable behavior</h1>
        <article v-for="key in priorityKeys" :key="key" class="pf-bridge">
          <h2>{{ domainMap[key]?.label }}</h2>
          <label class="pf-field">
            What this domain means to me
            <textarea v-model="planDrafts[key].personalDefinition" rows="2" />
          </label>
          <label class="pf-field">
            Desired experience
            <textarea v-model="planDrafts[key].desiredExperience" rows="2" />
          </label>
          <label class="pf-field">
            Current pattern
            <textarea v-model="planDrafts[key].currentPattern" rows="2" />
          </label>
          <label class="pf-field">
            One small action
            <input v-model="planDrafts[key].smallAction" type="text" />
          </label>
          <label class="pf-field">
            Recurring practice
            <input v-model="planDrafts[key].recurringPractice" type="text" />
          </label>
          <label class="pf-field">
            Boundary or tradeoff
            <input v-model="planDrafts[key].boundaryOrTradeoff" type="text" />
          </label>
          <label class="pf-field">
            Success indicator
            <input v-model="planDrafts[key].successIndicator" type="text" />
          </label>
          <label class="pf-field">
            Confidence (1–10)
            <input v-model.number="planDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="(planDrafts[key].confidenceScore || 10) < 7" class="pf-note">
            How could this action become smaller, simpler, or easier to repeat?
          </p>
        </article>
        <footer class="pf-footer">
          <button type="button" class="pf-btn ghost" @click="step = 'priorities'">Back</button>
          <button type="button" class="pf-btn primary" @click="finish">Finish profile →</button>
        </footer>
      </section>

      <section v-else-if="step === 'done'" class="pf-shell pf-shell--narrow pf-print">
        <p class="pf-eyebrow">Complete</p>
        <h1 class="pf-title">Your Personal Fulfillment Profile</h1>
        <div class="pf-stats">
          <div class="pf-stat highlight">
            <span>Index</span>
            <strong>{{ summary.personalFulfillmentIndex }} / 100</strong>
          </div>
          <div class="pf-stat">
            <span>Level</span>
            <strong>{{ summary.statusLabel }}</strong>
          </div>
        </div>
        <FulfillmentHorizon
          :domains="activeDomains"
          :responses="responses"
          :personal-fulfillment-index="summary.personalFulfillmentIndex"
          :selected-priority-domain-ids="priorityKeys"
          display-mode="fulfillment-and-importance"
        />
        <p class="pf-clarify">{{ summary.indexClarification }}</p>
        <div class="pf-actions">
          <button type="button" class="pf-btn primary" @click="downloadPdf">Print / Save PDF</button>
          <button type="button" class="pf-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="pf-btn ghost" @click="resetGuest">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import FulfillmentHorizon from '../../components/personalFulfillment/FulfillmentHorizon.vue';
import MeaningSatisfactionMatrix from '../../components/personalFulfillment/MeaningSatisfactionMatrix.vue';
import {
  PARTICIPANT_VERSION_OPTIONS,
  MODE_OPTIONS,
  SUPPORT_PREFERENCE_OPTIONS,
  PRIORITY_TYPES,
  LIFE_SEASON_OPTIONS,
  buildPersonalFulfillmentSummary,
  domainsForContext,
  domainStatusLabel,
  interpretFulfillmentScore
} from '../../utils/personalFulfillment.js';

const route = useRoute();
const isGuest = computed(() => !!route.meta?.guestPersonalFulfillment);
const GUEST_KEY = 'pf-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const participantVersion = ref('general-adult');
const mode = ref('full');
const lifeSeason = ref('');
const responses = ref([]);
const priorityKeys = ref([]);
const priorityTypes = reactive({});
const scoreIndex = ref(0);
const saveStatus = ref('');
const planDrafts = reactive({});

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
const fulfillment = computed(
  () => responseMap.value[activeKey.value]?.currentFulfillmentScore ?? null
);
const importance = computed(
  () => responseMap.value[activeKey.value]?.personalImportanceScore ?? null
);
const momentum = computed(() => responseMap.value[activeKey.value]?.growthMomentumScore ?? null);
const personalDefinition = computed(
  () => responseMap.value[activeKey.value]?.personalDefinition || ''
);
const currentChips = computed(() => responseMap.value[activeKey.value]?.reflectionChips || []);
const supportPreference = computed(
  () => responseMap.value[activeKey.value]?.supportPreference || 'none'
);
const privateNote = computed(() => responseMap.value[activeKey.value]?.privateNote || '');
const statusLabel = computed(() => domainStatusLabel(fulfillment.value));
const interpretation = computed(() =>
  interpretFulfillmentScore(fulfillment.value, activeDomain.value?.label || 'This area')
);

const canShowReflections = computed(() => {
  if (fulfillment.value == null) return false;
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
        r?.currentFulfillmentScore != null
      );
    }).length
);

const canAdvance = computed(() => {
  const r = responseMap.value[activeKey.value];
  return (
    r?.preferNotToAnswer ||
    r?.seasonStatus === 'not-relevant' ||
    r?.currentFulfillmentScore != null
  );
});

const nextLabel = computed(() => activeDomains.value[scoreIndex.value + 1]?.label || 'next');

const summary = computed(() =>
  buildPersonalFulfillmentSummary(template.value, responses.value, {
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
        lifeSeason: lifeSeason.value,
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
  [step, responses, priorityKeys, scoreIndex, participantVersion, mode, lifeSeason],
  () => persistGuest(),
  { deep: true }
);

function ensureResponse(key) {
  if (!responseMap.value[key]) {
    responses.value = [
      ...responses.value,
      {
        domainKey: key,
        currentFulfillmentScore: null,
        personalImportanceScore: null,
        growthMomentumScore: null,
        reflectionChips: [],
        personalDefinition: '',
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

function setFulfillment(n) {
  patchResponse(activeKey.value, {
    currentFulfillmentScore: n,
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
    currentFulfillmentScore: null
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
    if (!priorityTypes[key]) priorityTypes[key] = 'increase';
  } else {
    priorityKeys.value = priorityKeys.value.filter((k) => k !== key);
  }
}

function goPlans() {
  for (const key of priorityKeys.value) {
    if (!planDrafts[key]) {
      planDrafts[key] = {
        personalDefinition:
          responseMap.value[key]?.personalDefinition || domainMap.value[key]?.definition || '',
        desiredExperience: '',
        currentPattern: '',
        smallAction: '',
        recurringPractice: '',
        boundaryOrTradeoff: '',
        successIndicator: '',
        confidenceScore: null,
        priorityType: priorityTypes[key] || 'increase'
      };
    }
  }
  step.value = 'plans';
}

function finish() {
  step.value = 'done';
  persistGuest();
}

function buildExport() {
  return {
    type: 'personal_fulfillment_guest',
    title: 'Personal Fulfillment Assessment',
    visualExperience: 'Fulfillment Horizon',
    exportedAt: new Date().toISOString(),
    participantVersion: participantVersion.value,
    mode: mode.value,
    lifeSeason: lifeSeason.value,
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
  a.download = `personal-fulfillment-${new Date().toISOString().slice(0, 10)}.json`;
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
    const res = await api.get('/personal-fulfillment/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value = 'Personal Fulfillment template is not available yet. Run migration 925.';
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
          if (cached?.lifeSeason) lifeSeason.value = cached.lifeSeason;
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
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Source+Sans+3:wght@400;500;600;700&display=swap');

.pf-page {
  --ink: #1c1917;
  --muted: #78716c;
  --line: #e7e5e4;
  --bg: #fafaf9;
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 12% -10%, rgba(234, 88, 12, 0.1), transparent 55%),
    radial-gradient(700px 360px at 100% 0%, rgba(15, 118, 110, 0.08), transparent 50%),
    var(--bg);
  color: var(--ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  padding: 1.5rem 1rem 4rem;
}

.pf-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--muted);
}
.pf-state.error {
  color: #9f1239;
}

.pf-shell {
  max-width: 1100px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 40px rgba(28, 25, 23, 0.05);
}

.pf-shell--narrow {
  max-width: 640px;
}

.pf-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #c2410c;
  font-weight: 700;
}

.pf-title {
  margin: 0.35rem 0 0.65rem;
  font-family: Fraunces, Georgia, serif;
  font-size: clamp(1.55rem, 3vw, 2.15rem);
  font-weight: 650;
  line-height: 1.2;
}

.pf-lead,
.pf-note,
.pf-meta,
.pf-clarify {
  color: #57534e;
  line-height: 1.6;
}

.pf-clarify {
  font-size: 0.9rem;
  padding: 0.75rem 1rem;
  background: #f5f5f4;
  border-radius: 12px;
}

.pf-actions,
.pf-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.35rem;
}

.pf-footer.sticky {
  position: sticky;
  bottom: 0.5rem;
  background: rgba(255, 255, 255, 0.95);
  padding-top: 0.75rem;
  z-index: 5;
}

.pf-btn {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  border-radius: 999px;
  padding: 0.7rem 1.15rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

.pf-btn.primary {
  background: #1c1917;
  color: #fffaf5;
  border-color: #1c1917;
}

.pf-btn.ghost {
  background: transparent;
}

.pf-btn.small {
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
}

.pf-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pf-bullets {
  line-height: 1.7;
  color: #44403c;
}

.pf-field,
.pf-field-label {
  display: grid;
  gap: 0.35rem;
  margin: 1rem 0 0.5rem;
  font-weight: 600;
  font-size: 0.92rem;
}

.pf-field select,
.pf-field input,
.pf-field textarea {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  background: #fff;
}

.pf-mode-grid {
  display: grid;
  gap: 0.5rem;
}

.pf-mode {
  text-align: left;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  cursor: pointer;
}

.pf-mode.on {
  border-color: #0f766e;
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.15);
}

.pf-mode strong {
  display: block;
}

.pf-mode span,
.pf-mode em {
  display: block;
  color: #78716c;
  font-size: 0.85rem;
  font-style: normal;
  margin-top: 0.2rem;
}

.pf-header {
  margin-bottom: 1rem;
}

.pf-split {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
  gap: 1.25rem;
  align-items: start;
}

.pf-aside {
  position: sticky;
  top: 1rem;
}

.pf-systems {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.pf-systems div {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.55rem;
  text-align: center;
}

.pf-systems span {
  display: block;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #a8a29e;
  font-weight: 700;
}

.pf-score-block {
  margin-bottom: 1.15rem;
}

.pf-score-block h2 {
  margin: 0 0 0.45rem;
  font-size: 1.05rem;
}

.pf-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #a8a29e;
  margin-bottom: 0.35rem;
}

.pf-scores {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.3rem;
}

.pf-score {
  aspect-ratio: 1;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
  font-weight: 700;
  cursor: pointer;
  min-height: 2.4rem;
}

.pf-score.on {
  background: #0f766e;
  color: #fff;
  border-color: #0f766e;
}

.pf-score.soft.on {
  background: #ea580c;
  border-color: #ea580c;
}

.pf-gap-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin-bottom: 1rem;
}

.pf-gap-card p {
  margin: 0 0 0.4rem;
  color: #57534e;
  font-size: 0.92rem;
}

.pf-status-pill {
  font-weight: 700 !important;
  color: #1c1917 !important;
}

.pf-live {
  font-size: 0.8rem !important;
  color: #78716c !important;
}

.pf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.pf-chip {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.75rem;
  font-size: 0.82rem;
  cursor: pointer;
}

.pf-chip.on {
  background: #1c1917;
  color: #fff;
  border-color: #1c1917;
}

.pf-details {
  margin: 0.75rem 0;
}

.pf-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.65rem;
  margin: 1rem 0;
}

.pf-stat {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.75rem;
}

.pf-stat.highlight {
  background: #1c1917;
  color: #fffaf5;
  border-color: #1c1917;
}

.pf-stat span {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.75;
  font-weight: 700;
}

.pf-viz-row {
  margin: 1rem 0 1.5rem;
}

.pf-insight-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.85rem;
  margin: 1.25rem 0;
}

.pf-insight-grid article,
.pf-insights,
.pf-bridge {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.9rem 1rem;
}

.pf-bridge {
  margin-bottom: 1rem;
}

.pf-priority-list {
  display: grid;
  gap: 0.65rem;
}

.pf-priority-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.85rem 1rem;
  cursor: pointer;
}

.pf-priority-card p {
  margin: 0.2rem 0 0.45rem;
  color: #78716c;
  font-size: 0.85rem;
}

.pf-priority-card select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.35rem;
}

@media (max-width: 900px) {
  .pf-split {
    grid-template-columns: 1fr;
  }
  .pf-aside {
    position: static;
    order: -1;
  }
  .pf-score {
    min-height: 2.75rem;
  }
}

@media print {
  .pf-btn,
  .pf-footer,
  .pf-actions {
    display: none !important;
  }
}
</style>
