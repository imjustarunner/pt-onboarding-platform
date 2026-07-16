<template>
  <div class="rr-page">
    <button type="button" class="rr-exit" title="Quick Exit" @click="quickExit">Quick Exit</button>

    <div v-if="loading" class="rr-state">Loading The Reward Regulation Assessment…</div>
    <div v-else-if="error" class="rr-state error">{{ error }}</div>

    <template v-else-if="template">
      <section v-if="step === 'welcome'" class="rr-shell rr-shell--narrow">
        <p class="rr-eyebrow">The Reward Regulation Assessment</p>
        <h1 class="rr-title">What Is Controlling Your Attention?</h1>
        <p class="rr-lead">
          Map how attention, impulse, recovery, and environment shape reward-seeking patterns — then build a
          friction and replacement plan you can actually sustain.
        </p>
        <p class="rr-note">
          This measures self-reported behavior patterns. It does <strong>not</strong> measure dopamine levels,
          diagnose addiction, or assess “brain damage.” Brand language about dopamine-driven habits describes
          common motivational patterns — not a lab result.
        </p>
        <p class="rr-meta">18 to 25 minutes · Reward Command Center</p>
        <div class="rr-actions">
          <button type="button" class="rr-btn primary" @click="step = 'context'">
            Map My Reward Patterns
          </button>
          <button type="button" class="rr-btn ghost" @click="step = 'how'">How this works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="rr-shell rr-shell--narrow">
        <h1 class="rr-title">How This Assessment Works</h1>
        <ol class="rr-bullets">
          <li>Share optional context — stimulation load and readiness stay separate from your score.</li>
          <li>Rate Current Regulation across twelve domains (importance and momentum optional).</li>
          <li>Select relevant reward channels and rate pull, cost, and value where useful.</li>
          <li>Review the Reward Command Center: what captures, provides, costs, and what to do next.</li>
          <li>Choose priorities and build a cue / friction / replace / protect / lapse plan.</li>
        </ol>
        <p class="rr-clarify">{{ template.settings?.disclaimer }}</p>
        <div class="rr-actions">
          <button type="button" class="rr-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="rr-btn primary" @click="step = 'context'">Continue</button>
        </div>
      </section>

      <section v-else-if="step === 'context'" class="rr-shell rr-shell--narrow">
        <p class="rr-eyebrow">Before you begin</p>
        <h1 class="rr-title">Your current season</h1>

        <p class="rr-field-label">Participant version</p>
        <div class="rr-mode-grid">
          <button
            v-for="v in PARTICIPANT_VERSION_OPTIONS"
            :key="v.id"
            type="button"
            class="rr-mode"
            :class="{ on: participantVersion === v.id }"
            @click="participantVersion = v.id"
          >
            <strong>{{ v.label }}</strong>
            <span>{{ v.description }}</span>
          </button>
        </div>

        <p class="rr-field-label">Assessment mode</p>
        <div class="rr-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="rr-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>

        <label class="rr-field">
          Assessment timeframe
          <select v-model="timeframe">
            <option v-for="o in TIMEFRAME_OPTIONS" :key="o.id" :value="o.id">{{ o.label }}</option>
          </select>
        </label>

        <div class="rr-score-block">
          <h2>Optional context — separate from Reward Regulation Score</h2>
          <p class="rr-hint">Stimulation load and readiness do not change your standard score.</p>
          <p class="rr-field-label">Total stimulation load (1–10)</p>
          <div class="rr-scores">
            <button
              v-for="n in 10"
              :key="`stim-${n}`"
              type="button"
              class="rr-score soft"
              :class="{ on: stimulationLoad === n }"
              @click="stimulationLoad = n"
            >
              {{ n }}
            </button>
          </div>
          <p class="rr-field-label">Readiness to change (1–10)</p>
          <div class="rr-scores">
            <button
              v-for="n in 10"
              :key="`ready-${n}`"
              type="button"
              class="rr-score soft"
              :class="{ on: readiness === n }"
              @click="readiness = n"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <p class="rr-field-label">Current life stage (optional)</p>
        <div class="rr-chips">
          <button
            v-for="s in LIFE_STAGE_OPTIONS"
            :key="s"
            type="button"
            class="rr-chip"
            :class="{ on: lifeStages.includes(s) }"
            @click="toggleList(lifeStages, s)"
          >
            {{ s }}
          </button>
        </div>

        <p class="rr-field-label">Current goal (optional)</p>
        <div class="rr-chips">
          <button
            v-for="g in CURRENT_GOAL_OPTIONS"
            :key="g"
            type="button"
            class="rr-chip"
            :class="{ on: goals.includes(g) }"
            @click="toggleList(goals, g)"
          >
            {{ g }}
          </button>
        </div>

        <div class="rr-actions">
          <button type="button" class="rr-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="rr-btn primary" @click="startScoring">Begin →</button>
        </div>
      </section>

      <section v-else-if="step === 'score'" class="rr-shell rr-shell--split">
        <header class="rr-header">
          <div>
            <p class="rr-eyebrow">
              {{ scoredCount }} of {{ activeDomains.length }} completed ·
              {{ timeframeLabel }} · {{ saveStatus || 'Ready' }}
            </p>
            <h1 class="rr-title">{{ activeDomain?.label }}</h1>
            <p class="rr-lead">{{ activeDomain?.definition }}</p>
          </div>
        </header>

        <div class="rr-split">
          <div class="rr-panel">
            <div class="rr-score-block">
              <h2>{{ activeDomain?.primaryQuestion || 'How strong is your current regulation here?' }}</h2>
              <div class="rr-scale-labels">
                <span>Reactive</span>
                <span>Self-governed</span>
              </div>
              <div class="rr-scores" role="group" :aria-label="`${activeDomain?.label} current regulation`">
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="rr-score"
                  :class="{ on: regulation === n }"
                  @click="setRegulation(n)"
                >
                  {{ n }}
                </button>
              </div>
              <p v-if="statusLabel" class="rr-status">{{ statusLabel }} · {{ interpretation }}</p>
            </div>

            <div v-if="enableImportance && regulation != null" class="rr-score-block">
              <h2>Personal importance (optional)</h2>
              <p class="rr-hint">Does not change Reward Regulation Score.</p>
              <div class="rr-scores">
                <button
                  v-for="n in 10"
                  :key="`imp-${n}`"
                  type="button"
                  class="rr-score soft"
                  :class="{ on: importance === n }"
                  @click="patchResponse(activeKey, { personalImportanceScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="canShowMomentum" class="rr-score-block">
              <h2>Momentum (optional)</h2>
              <div class="rr-scores">
                <button
                  v-for="n in 10"
                  :key="`mom-${n}`"
                  type="button"
                  class="rr-score soft"
                  :class="{ on: momentum === n }"
                  @click="patchResponse(activeKey, { momentumScore: n })"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="canShowReflections" class="rr-score-block">
              <h2>{{ activeDomain?.reflectionPrompt || 'What shapes this domain?' }}</h2>
              <div class="rr-chips">
                <button
                  v-for="chip in activeDomain?.reflectionOptions || []"
                  :key="chip"
                  type="button"
                  class="rr-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>
            </div>

            <div class="rr-footer sticky">
              <button type="button" class="rr-btn ghost" @click="markNotRelevant">Not relevant</button>
              <button
                type="button"
                class="rr-btn primary"
                :disabled="!canAdvance"
                @click="nextScore"
              >
                {{ scoreIndex >= activeDomains.length - 1 ? 'Continue to channels' : `Next: ${nextLabel}` }}
              </button>
            </div>
          </div>

          <aside class="rr-aside">
            <RewardRegulationSystem
              compact
              interactive
              title="Building your map"
              :domains="activeDomains"
              :responses="responses"
              :reward-regulation-score="summary.rewardRegulationScore"
              :system-scores="summary.systemScores"
              :active-domain-id="activeKey"
              @domain-select="jumpToDomain"
            />
          </aside>
        </div>
      </section>

      <section v-else-if="step === 'channels'" class="rr-shell">
        <p class="rr-eyebrow">Reward Channel Inventory</p>
        <h1 class="rr-title">What captures your attention?</h1>
        <p class="rr-lead">
          Select only channels that feel relevant. Sensitive channels stay private by default. Skipping channels
          never zeroes your Reward Regulation Score.
        </p>

        <div class="rr-channel-pick">
          <button
            v-for="ch in templateChannels"
            :key="ch.key"
            type="button"
            class="rr-channel-card"
            :class="{ on: isChannelSelected(ch.key), sensitive: ch.isSensitive }"
            @click="toggleChannelSelect(ch)"
          >
            <strong>{{ ch.label }}</strong>
            <span>{{ ch.description }}</span>
            <em v-if="ch.isSensitive">Optional · private by default</em>
          </button>
        </div>

        <div v-for="ch in selectedChannelDefs" :key="`rate-${ch.key}`" class="rr-score-block rr-channel-rate">
          <h2>{{ ch.label }}</h2>
          <p class="rr-hint">Pull strength (required if selected) · Cost / value / control optional</p>
          <p class="rr-field-label">Pull strength</p>
          <div class="rr-scores">
            <button
              v-for="n in 10"
              :key="`${ch.key}-pull-${n}`"
              type="button"
              class="rr-score"
              :class="{ on: channelMap[ch.key]?.pullStrengthScore === n }"
              @click="patchChannel(ch.key, { pullStrengthScore: n, isRelevant: true })"
            >
              {{ n }}
            </button>
          </div>
          <p class="rr-field-label">Cost to goals / energy</p>
          <div class="rr-scores">
            <button
              v-for="n in 10"
              :key="`${ch.key}-cost-${n}`"
              type="button"
              class="rr-score soft"
              :class="{ on: channelMap[ch.key]?.costScore === n }"
              @click="patchChannel(ch.key, { costScore: n })"
            >
              {{ n }}
            </button>
          </div>
          <p class="rr-field-label">Value still provided</p>
          <div class="rr-scores">
            <button
              v-for="n in 10"
              :key="`${ch.key}-val-${n}`"
              type="button"
              class="rr-score soft"
              :class="{ on: channelMap[ch.key]?.valueScore === n }"
              @click="patchChannel(ch.key, { valueScore: n })"
            >
              {{ n }}
            </button>
          </div>
        </div>

        <div class="rr-actions">
          <button type="button" class="rr-btn ghost" @click="step = 'score'">Back</button>
          <button type="button" class="rr-btn ghost" @click="step = 'results'">Skip channels</button>
          <button type="button" class="rr-btn primary" @click="step = 'results'">See Command Center →</button>
        </div>
      </section>

      <AssessmentBrandedShell
        v-else-if="step === 'results'"
        title="Reward Regulation Results"
        eyebrow="Reward Command Center"
        :organization-slug="organizationSlug"
        footer="Self-reported patterns · Not a clinical diagnosis"
      >
        <template #actions>
          <button type="button" class="rr-btn ghost" @click="printResults">Print / PDF</button>
          <button type="button" class="rr-btn ghost" @click="downloadJson">Download JSON</button>
        </template>
        <section class="rr-shell">
        <p class="rr-eyebrow">Reward Command Center</p>
        <h1 class="rr-title">{{ summary.statusLabel || 'Your regulation profile' }}</h1>
        <p class="rr-lead">
          Reward Regulation Score
          <strong>{{ summary.rewardRegulationScore ?? '—' }}</strong> / 100
          <span v-if="summary.overallLevelLabel"> · {{ summary.overallLevelLabel }}</span>
        </p>
        <p class="rr-clarify">{{ summary.indexClarification }}</p>

        <div class="rr-results-grid">
          <RewardRegulationSystem
            title="Regulation System"
            :domains="activeDomains"
            :responses="responses"
            :reward-regulation-score="summary.rewardRegulationScore"
            :system-scores="summary.systemScores"
            :level-label="summary.statusLabel"
            :selected-priority-domain-ids="priorityKeys"
          />
          <RewardChannelHeatmap
            title="Channel capture"
            :channels="summary.channels"
            :channel-impact-index="summary.channelImpactIndex"
          />
        </div>

        <div class="rr-dashboard">
          <article v-for="block in dashboardBlocks" :key="block.question" class="rr-dash-card">
            <h3>{{ block.question }}</h3>
            <p>{{ block.summary }}</p>
          </article>
        </div>

        <div v-if="summary.insights?.length" class="rr-insights">
          <h2>Insights</h2>
          <ul>
            <li v-for="(insight, i) in summary.insights" :key="i">{{ insight }}</li>
          </ul>
        </div>

        <p class="rr-clarify">{{ summary.safetyNote }}</p>

        <div class="rr-actions">
          <button type="button" class="rr-btn ghost" @click="step = 'channels'">Back</button>
          <button type="button" class="rr-btn primary" @click="goPriorities">Choose priorities →</button>
        </div>
      </section>
      </AssessmentBrandedShell>

      <section v-else-if="step === 'priorities'" class="rr-shell rr-shell--narrow">
        <p class="rr-eyebrow">Focus</p>
        <h1 class="rr-title">Choose up to {{ maxPriorities }} priorities</h1>
        <p class="rr-lead">Pick domains where friction and replacement will matter most this season.</p>
        <div class="rr-priority-list">
          <label v-for="d in opportunityDomains" :key="d.domainKey" class="rr-priority-row">
            <input
              type="checkbox"
              :checked="priorityKeys.includes(d.domainKey)"
              :disabled="!priorityKeys.includes(d.domainKey) && priorityKeys.length >= maxPriorities"
              @change="togglePriority(d.domainKey, $event.target.checked)"
            />
            <span>
              <strong>{{ d.label }}</strong>
              <em>{{ d.status }} · score {{ d.currentRegulationScore }}</em>
            </span>
          </label>
        </div>
        <div class="rr-actions">
          <button type="button" class="rr-btn ghost" @click="step = 'results'">Back</button>
          <button
            type="button"
            class="rr-btn primary"
            :disabled="!priorityKeys.length"
            @click="goPlans"
          >
            Build plan →
          </button>
        </div>
      </section>

      <AssessmentBrandedShell
        v-else-if="step === 'plans'"
        title="Regulation Action Plan"
        eyebrow="Friction · Replace · Protect"
        :organization-slug="organizationSlug"
        footer="Bring this plan to your next coaching session"
      >
        <template #actions>
          <button type="button" class="rr-btn ghost" @click="printResults">Print / PDF</button>
        </template>
        <section class="rr-shell">
        <p class="rr-eyebrow">Friction &amp; Replacement Board</p>
        <h1 class="rr-title">Your regulation plan</h1>
        <p class="rr-lead">
          Cue remove · Friction · Replace · Protect · Lapse response — no detox dogma, no shame spiral.
        </p>

        <div v-for="key in priorityKeys" :key="key" class="rr-plan-block">
          <h2>{{ domainMap[key]?.label || key }}</h2>
          <label
            v-for="slot in PLAN_SLOTS"
            :key="`${key}-${slot.id}`"
            class="rr-field"
          >
            {{ slot.label }}
            <span class="rr-hint">{{ slot.description }}</span>
            <textarea
              v-model="planDrafts[key][slot.id]"
              rows="2"
              :placeholder="slot.description"
            />
          </label>
        </div>

        <div v-if="enableWeekly" class="rr-score-block">
          <h2>Regulation Week (optional stub)</h2>
          <p class="rr-hint">Light weekly check-in ratings — not a clinical monitor.</p>
          <div v-for="w in WEEKLY_CHECKIN_KEYS" :key="w.id" class="rr-weekly-row">
            <span>{{ w.label }}</span>
            <div class="rr-scores compact">
              <button
                v-for="n in 10"
                :key="`${w.id}-${n}`"
                type="button"
                class="rr-score soft"
                :class="{ on: weeklyDraft[w.id] === n }"
                @click="weeklyDraft[w.id] = n"
              >
                {{ n }}
              </button>
            </div>
          </div>
        </div>

        <div class="rr-actions">
          <button type="button" class="rr-btn ghost" @click="step = 'priorities'">Back</button>
          <button type="button" class="rr-btn primary" @click="finish">Finish</button>
        </div>
      </section>
      </AssessmentBrandedShell>

      <AssessmentBrandedShell
        v-else-if="step === 'done'"
        title="Assessment complete"
        eyebrow="Reward Regulation"
        :organization-slug="organizationSlug"
      >
        <template #actions>
          <button type="button" class="rr-btn ghost" @click="printResults">Print / PDF</button>
          <button type="button" class="rr-btn ghost" @click="downloadJson">Download JSON</button>
        </template>
        <section class="rr-shell rr-shell--narrow">
        <p class="rr-eyebrow">Complete</p>
        <h1 class="rr-title">Your Reward Command Center is ready</h1>
        <p class="rr-lead">
          Score {{ summary.rewardRegulationScore ?? '—' }} / 100
          <span v-if="summary.channelImpactIndex != null">
            · Channel Impact {{ summary.channelImpactIndex }}
          </span>
        </p>
        <p class="rr-note">
          Progress is saved in this browser. Download a copy if you want a portable record.
        </p>
        <div class="rr-actions">
          <button type="button" class="rr-btn primary" @click="step = 'results'">Review results</button>
          <button type="button" class="rr-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="rr-btn ghost" @click="resetGuest">Start over</button>
        </div>
      </section>
      </AssessmentBrandedShell>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import AssessmentBrandedShell from '../../components/assessments/AssessmentBrandedShell.vue';
import {
  flushRewardRegulation,
  loadAssignedAssessment,
  readAccessTokenFromRoute
} from '../../utils/assessmentAssignedSession.js';
import api from '../../services/api';
import RewardRegulationSystem from '../../components/rewardRegulation/RewardRegulationSystem.vue';
import RewardChannelHeatmap from '../../components/rewardRegulation/RewardChannelHeatmap.vue';
import {
  PARTICIPANT_VERSION_OPTIONS,
  MODE_OPTIONS,
  LIFE_STAGE_OPTIONS,
  CURRENT_GOAL_OPTIONS,
  TIMEFRAME_OPTIONS,
  WEEKLY_CHECKIN_KEYS,
  PLAN_SLOTS,
  buildRewardRegulationSummary,
  domainsForContext,
  domainStatusLabel,
  interpretRegulationScore
} from '../../utils/rewardRegulation.js';

const route = useRoute();
const assignedToken = computed(() => readAccessTokenFromRoute(route));
const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const isGuest = computed(() => !!route.meta?.guestRewardRegulation || !assignedToken.value);
const GUEST_KEY = 'rr-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const participantVersion = ref('general-adult');
const mode = ref('full');
const timeframe = ref('current-season');
const stimulationLoad = ref(null);
const readiness = ref(null);
const lifeStages = ref([]);
const goals = ref([]);
const responses = ref([]);
const channelResponses = ref([]);
const selectedChannelKeys = ref([]);
const priorityKeys = ref([]);
const scoreIndex = ref(0);
const saveStatus = ref('');
const planDrafts = reactive({});
const weeklyDraft = reactive({});

const settings = computed(() => template.value?.settings || {});
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 3));
const enableImportance = computed(() => settings.value.enableImportance !== false);
const enableMomentum = computed(() => settings.value.enableMomentum !== false);
const enableWeekly = computed(() => settings.value.enableWeeklyCheckin !== false);

const activeDomains = computed(() =>
  domainsForContext(template.value, {
    mode: mode.value,
    participantVersion: participantVersion.value
  })
);

const templateChannels = computed(() => template.value?.channels || []);

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

const channelMap = computed(() => {
  const m = {};
  for (const r of channelResponses.value) m[r.channelKey] = r;
  return m;
});

const selectedChannelDefs = computed(() =>
  templateChannels.value.filter((c) => selectedChannelKeys.value.includes(c.key))
);

const activeKey = computed(() => activeDomains.value[scoreIndex.value]?.key || '');
const activeDomain = computed(() => domainMap.value[activeKey.value] || null);
const regulation = computed(
  () => responseMap.value[activeKey.value]?.currentRegulationScore ?? null
);
const importance = computed(
  () => responseMap.value[activeKey.value]?.personalImportanceScore ?? null
);
const momentum = computed(() => responseMap.value[activeKey.value]?.momentumScore ?? null);
const currentChips = computed(() => responseMap.value[activeKey.value]?.reflectionChips || []);
const statusLabel = computed(() => domainStatusLabel(regulation.value));
const interpretation = computed(() =>
  interpretRegulationScore(regulation.value, activeDomain.value?.label || 'This domain')
);

const canShowMomentum = computed(() => {
  if (!enableMomentum.value || regulation.value == null) return false;
  if (enableImportance.value && importance.value == null) return true;
  return true;
});

const canShowReflections = computed(() => regulation.value != null);

const scoredCount = computed(
  () =>
    activeDomains.value.filter((d) => {
      const r = responseMap.value[d.key];
      return r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant' || r?.currentRegulationScore != null;
    }).length
);

const canAdvance = computed(() => {
  const r = responseMap.value[activeKey.value];
  return (
    r?.preferNotToAnswer ||
    r?.seasonStatus === 'not-relevant' ||
    r?.currentRegulationScore != null
  );
});

const nextLabel = computed(() => activeDomains.value[scoreIndex.value + 1]?.label || 'next');
const timeframeLabel = computed(
  () => TIMEFRAME_OPTIONS.find((o) => o.id === timeframe.value)?.label || 'Current life season'
);

const channelsForSummary = computed(() =>
  channelResponses.value
    .filter((c) => selectedChannelKeys.value.includes(c.channelKey) || c.isRelevant)
    .map((c) => {
      const def = templateChannels.value.find((t) => t.key === c.channelKey);
      return {
        ...c,
        label: def?.label || c.channelKey,
        shortLabel: def?.shortLabel,
        color: def?.color,
        isSensitive: !!def?.isSensitive,
        category: def?.category
      };
    })
);

const contextPayload = computed(() => ({
  totalStimulationLoadScore: stimulationLoad.value,
  readinessToChangeScore: readiness.value,
  lifeStages: lifeStages.value,
  goals: goals.value
}));

const summary = computed(() =>
  buildRewardRegulationSummary(template.value, responses.value, {
    mode: mode.value,
    participantVersion: participantVersion.value,
    priorityKeys: priorityKeys.value,
    context: contextPayload.value,
    channels: channelsForSummary.value
  })
);

const dashboardBlocks = computed(() => {
  const cc = summary.value.commandCenter || {};
  return [
    cc.whatCapturesMe,
    cc.whatIsProviding,
    cc.whatIsCosting,
    cc.whatAmIRegaining,
    cc.whatNext
  ].filter(Boolean);
});

const opportunityDomains = computed(() => {
  const scored = summary.value.domains || [];
  if (!scored.length) {
    return activeDomains.value.map((d) => ({
      domainKey: d.key,
      label: d.label,
      status: '',
      currentRegulationScore: responseMap.value[d.key]?.currentRegulationScore
    }));
  }
  return [...scored].sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));
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
        stimulationLoad: stimulationLoad.value,
        readiness: readiness.value,
        lifeStages: lifeStages.value,
        goals: goals.value,
        responses: responses.value,
        channelResponses: channelResponses.value,
        selectedChannelKeys: selectedChannelKeys.value,
        priorityKeys: priorityKeys.value,
        scoreIndex: scoreIndex.value,
        planDrafts: { ...planDrafts },
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
    channelResponses,
    selectedChannelKeys,
    priorityKeys,
    scoreIndex,
    participantVersion,
    mode,
    timeframe,
    stimulationLoad,
    readiness
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
        currentRegulationScore: null,
        personalImportanceScore: null,
        momentumScore: null,
        reflectionChips: [],
        barriers: [],
        strengths: [],
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

function setRegulation(n) {
  patchResponse(activeKey.value, {
    currentRegulationScore: n,
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
    currentRegulationScore: null
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
    step.value = 'channels';
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

function isChannelSelected(key) {
  return selectedChannelKeys.value.includes(key);
}

function ensureChannel(key, sensitive = false) {
  if (!channelMap.value[key]) {
    channelResponses.value = [
      ...channelResponses.value,
      {
        channelKey: key,
        isRelevant: true,
        pullStrengthScore: null,
        frequencyScore: null,
        costScore: null,
        valueScore: null,
        controlScore: null,
        isPrivate: !!sensitive,
        notes: '',
        supportPreference: 'none',
        preferNotToAnswer: false
      }
    ];
  }
}

function patchChannel(key, patch) {
  const def = templateChannels.value.find((c) => c.key === key);
  ensureChannel(key, def?.isSensitive);
  channelResponses.value = channelResponses.value.map((r) =>
    r.channelKey === key ? { ...r, ...patch } : r
  );
}

function toggleChannelSelect(ch) {
  const key = ch.key;
  if (isChannelSelected(key)) {
    selectedChannelKeys.value = selectedChannelKeys.value.filter((k) => k !== key);
    patchChannel(key, { isRelevant: false });
  } else {
    selectedChannelKeys.value = [...selectedChannelKeys.value, key];
    ensureChannel(key, ch.isSensitive);
    patchChannel(key, { isRelevant: true, isPrivate: ch.isSensitive ? true : undefined });
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
  if (!priorityKeys.value.length && summary.value.biggestOpportunities?.[0]) {
    priorityKeys.value = summary.value.biggestOpportunities
      .slice(0, maxPriorities.value)
      .map((x) => x.domainKey);
  }
  step.value = 'priorities';
}

function goPlans() {
  for (const key of priorityKeys.value) {
    if (!planDrafts[key]) {
      planDrafts[key] = {
        cueRemove: '',
        friction: '',
        replace: '',
        protect: '',
        lapseResponse: ''
      };
    }
  }
  step.value = 'plans';
}

async function finish() {
  if (assignedToken.value) {
    try {
      saveStatus.value = 'Saving…';
      const plans = priorityKeys.value.map((key) => ({
        domainKey: key,
        ...(planDrafts[key] || {})
      }));
      await flushRewardRegulation({
        token: assignedToken.value,
        responses: responses.value,
        channelResponses: channelResponses.value,
        selectedPriorities: priorityKeys.value,
        regulationPlans: plans,
        frictionBoard: {}
      });
      saveStatus.value = 'Saved to profile';
    } catch (e) {
      error.value = e?.response?.data?.error || e.message || 'Could not save assessment';
      saveStatus.value = 'Save failed';
      return;
    }
  } else {
    persistGuest();
  }
  step.value = 'done';
}

function printResults() {
  window.print();
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
    type: 'reward_regulation_guest',
    title: 'The Reward Regulation Assessment',
    visualExperience: 'Reward Regulation System',
    exportedAt: new Date().toISOString(),
    participantVersion: participantVersion.value,
    mode: mode.value,
    timeframe: timeframe.value,
    context: contextPayload.value,
    summary: summary.value,
    weeklyDraft: { ...weeklyDraft },
    domains: activeDomains.value.map((d) => ({
      key: d.key,
      label: d.label,
      ...(responseMap.value[d.key] || {})
    })),
    channels: channelsForSummary.value,
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
  a.download = `reward-regulation-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function resetGuest() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    // ignore
  }
  responses.value = [];
  channelResponses.value = [];
  selectedChannelKeys.value = [];
  priorityKeys.value = [];
  scoreIndex.value = 0;
  Object.keys(planDrafts).forEach((k) => delete planDrafts[k]);
  Object.keys(weeklyDraft).forEach((k) => delete weeklyDraft[k]);
  stimulationLoad.value = null;
  readiness.value = null;
  step.value = 'welcome';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/reward-regulation/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value = 'Reward Regulation template is not available yet. Run migration 933.';
      return;
    }
    if (assignedToken.value) {
      try {
        const assessment = await loadAssignedAssessment('/reward-regulation', assignedToken.value);
        if (assessment) {
          if (assessment.responses?.length) responses.value = assessment.responses;
          if (assessment.channelResponses?.length) channelResponses.value = assessment.channelResponses;
          if (assessment.selectedPriorities?.length) priorityKeys.value = assessment.selectedPriorities;
          if (assessment.mode) mode.value = assessment.mode;
          if (assessment.participantVersion) participantVersion.value = assessment.participantVersion;
          if (assessment.status === 'completed') step.value = 'results';
          else if (assessment.responses?.length) step.value = 'score';
        }
      } catch (e) {
        error.value = e?.response?.data?.error || e.message || 'Could not load assigned assessment';
      }
    } else if (isGuest.value) {
      try {
        const raw = localStorage.getItem(GUEST_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.responses) responses.value = cached.responses;
          if (cached?.channelResponses) channelResponses.value = cached.channelResponses;
          if (cached?.selectedChannelKeys) selectedChannelKeys.value = cached.selectedChannelKeys;
          if (cached?.priorityKeys) priorityKeys.value = cached.priorityKeys;
          if (cached?.step) step.value = cached.step;
          if (cached?.participantVersion) participantVersion.value = cached.participantVersion;
          if (cached?.mode) mode.value = cached.mode;
          if (cached?.timeframe) timeframe.value = cached.timeframe;
          if (cached?.stimulationLoad != null) stimulationLoad.value = cached.stimulationLoad;
          if (cached?.readiness != null) readiness.value = cached.readiness;
          if (cached?.lifeStages) lifeStages.value = cached.lifeStages;
          if (cached?.goals) goals.value = cached.goals;
          if (typeof cached?.scoreIndex === 'number') scoreIndex.value = cached.scoreIndex;
          for (const [k, v] of Object.entries(cached.planDrafts || {})) {
            planDrafts[k] = { ...v };
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
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap');

.rr-page {
  --ink: #e8eef6;
  --muted: #9aa8ba;
  --line: rgba(212, 165, 116, 0.22);
  --bg: #0c1219;
  --panel: #141c28;
  --forest: #1b4332;
  --forest-2: #2d6a4f;
  --navy: #1e3a5f;
  --amber: #d4a574;
  --violet: #a78bfa;
  --charcoal: #0a1018;
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 8% -10%, rgba(30, 58, 95, 0.5), transparent 55%),
    radial-gradient(700px 360px at 100% 0%, rgba(45, 106, 79, 0.32), transparent 50%),
    radial-gradient(500px 280px at 70% 100%, rgba(109, 89, 122, 0.22), transparent 55%),
    linear-gradient(180deg, #101820 0%, var(--bg) 42%);
  color: var(--ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  padding: 1.5rem 1rem 4rem;
  position: relative;
}

.rr-exit {
  position: fixed;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 40;
  appearance: none;
  border: 1px solid var(--line);
  background: rgba(20, 28, 40, 0.92);
  color: var(--ink);
  border-radius: 999px;
  padding: 0.4rem 0.85rem;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.rr-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--muted);
}
.rr-state.error {
  color: #fca5a5;
}

.rr-shell {
  max-width: 1140px;
  margin: 0 auto;
  background: rgba(20, 28, 40, 0.92);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
}
.rr-shell--narrow {
  max-width: 660px;
}

.rr-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--amber);
  font-weight: 700;
}
.rr-title {
  margin: 0.35rem 0 0.65rem;
  font-family: Syne, system-ui, sans-serif;
  font-size: clamp(1.5rem, 3vw, 2.15rem);
  font-weight: 800;
  line-height: 1.25;
  color: var(--ink);
}
.rr-lead,
.rr-note,
.rr-meta,
.rr-clarify,
.rr-hint {
  color: var(--muted);
  line-height: 1.6;
}
.rr-clarify {
  font-size: 0.9rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
}
.rr-bullets {
  padding-left: 1.2rem;
  color: var(--muted);
  line-height: 1.7;
}
.rr-actions,
.rr-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.25rem;
}
.rr-footer.sticky {
  position: sticky;
  bottom: 0.5rem;
  background: rgba(20, 28, 40, 0.95);
  padding: 0.75rem 0 0.25rem;
}
.rr-btn {
  appearance: none;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  border-radius: 12px;
  padding: 0.7rem 1.1rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.rr-btn.primary {
  background: linear-gradient(135deg, var(--forest-2), var(--navy));
  border-color: transparent;
}
.rr-btn.ghost:hover {
  border-color: var(--amber);
}
.rr-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.rr-field-label {
  margin: 1rem 0 0.45rem;
  font-size: 0.85rem;
  font-weight: 700;
}
.rr-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.85rem;
  font-size: 0.88rem;
  font-weight: 600;
}
.rr-field select,
.rr-field textarea {
  appearance: none;
  border: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.25);
  color: var(--ink);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  font: inherit;
  font-weight: 400;
}
.rr-mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.55rem;
}
.rr-mode {
  appearance: none;
  text-align: left;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.03);
  color: var(--ink);
  border-radius: 12px;
  padding: 0.7rem 0.8rem;
  font: inherit;
  cursor: pointer;
}
.rr-mode.on {
  border-color: var(--amber);
  background: rgba(212, 165, 116, 0.1);
}
.rr-mode strong {
  display: block;
  font-size: 0.88rem;
}
.rr-mode span,
.rr-mode em {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.75rem;
  color: var(--muted);
  font-style: normal;
}
.rr-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.rr-chip {
  appearance: none;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}
.rr-chip.on {
  color: var(--ink);
  border-color: var(--violet);
  background: rgba(167, 139, 250, 0.12);
}
.rr-scores {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.rr-scores.compact .rr-score {
  width: 1.7rem;
  height: 1.7rem;
  font-size: 0.75rem;
}
.rr-score {
  appearance: none;
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
.rr-score.on {
  background: var(--forest-2);
  border-color: transparent;
}
.rr-score.soft.on {
  background: var(--navy);
}
.rr-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 0.35rem;
}
.rr-score-block {
  margin-top: 1.1rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.rr-score-block h2 {
  margin: 0 0 0.45rem;
  font-family: Syne, system-ui, sans-serif;
  font-size: 1rem;
}
.rr-status {
  margin-top: 0.65rem;
  font-size: 0.88rem;
  color: var(--muted);
}
.rr-split {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(260px, 0.85fr);
  gap: 1rem;
  margin-top: 1rem;
}
.rr-aside {
  position: sticky;
  top: 1rem;
  align-self: start;
}
@media (max-width: 900px) {
  .rr-split {
    grid-template-columns: 1fr;
  }
  .rr-aside {
    position: static;
  }
}
.rr-channel-pick {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.55rem;
  margin: 1rem 0;
}
.rr-channel-card {
  appearance: none;
  text-align: left;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.03);
  color: var(--ink);
  border-radius: 12px;
  padding: 0.75rem;
  font: inherit;
  cursor: pointer;
}
.rr-channel-card.on {
  border-color: var(--violet);
  background: rgba(167, 139, 250, 0.12);
}
.rr-channel-card.sensitive {
  border-style: dashed;
}
.rr-channel-card strong {
  display: block;
  font-size: 0.9rem;
}
.rr-channel-card span,
.rr-channel-card em {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--muted);
  font-style: normal;
}
.rr-channel-rate {
  border: 1px solid rgba(167, 139, 250, 0.18);
  border-radius: 14px;
  padding: 0.85rem 1rem 1rem;
}
.rr-results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin: 1.25rem 0;
}
.rr-dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}
.rr-dash-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(212, 165, 116, 0.15);
  border-radius: 14px;
  padding: 0.9rem 1rem;
}
.rr-dash-card h3 {
  margin: 0 0 0.4rem;
  font-family: Syne, system-ui, sans-serif;
  font-size: 0.95rem;
  color: var(--amber);
}
.rr-dash-card p {
  margin: 0;
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.5;
}
.rr-insights h2 {
  font-family: Syne, system-ui, sans-serif;
  font-size: 1.1rem;
}
.rr-insights ul {
  color: var(--muted);
  line-height: 1.6;
}
.rr-priority-list {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-top: 1rem;
}
.rr-priority-row {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
}
.rr-priority-row strong {
  display: block;
}
.rr-priority-row em {
  font-style: normal;
  font-size: 0.78rem;
  color: var(--muted);
}
.rr-plan-block {
  margin: 1.25rem 0;
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
}
.rr-plan-block h2 {
  margin: 0 0 0.5rem;
  font-family: Syne, system-ui, sans-serif;
  font-size: 1.05rem;
}
.rr-weekly-row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.55rem;
  font-size: 0.85rem;
}
@media (max-width: 600px) {
  .rr-weekly-row {
    grid-template-columns: 1fr;
  }
}
</style>
