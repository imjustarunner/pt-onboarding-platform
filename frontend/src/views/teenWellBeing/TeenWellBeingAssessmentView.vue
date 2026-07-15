<template>
  <div class="twb-page">
    <button
      v-if="enableQuickExit && step !== 'welcome' && step !== 'privacy'"
      type="button"
      class="twb-exit"
      title="Quick Exit"
      @click="quickExit"
    >
      Quick Exit
    </button>

    <div v-if="loading" class="twb-state">Loading Teen Well-Being Assessment…</div>
    <div v-else-if="error" class="twb-state error">{{ error }}</div>

    <template v-else-if="template">
      <section v-if="step === 'welcome'" class="twb-shell twb-shell--narrow">
        <p class="twb-eyebrow">Teen Well-Being Assessment</p>
        <h1 class="twb-title">How Is Life Feeling Right Now?</h1>
        <p class="twb-lead">
          Different parts of life can feel very different at the same time. You might feel confident in one
          area and stressed in another.
        </p>
        <p class="twb-note">
          This assessment helps you notice what is going well, what feels difficult, and what kind of support
          could actually help.
        </p>
        <p class="twb-privacy">
          Some responses may be private, while others may be shared with selected support people. You will be
          shown who can see each part before you begin.
        </p>
        <p class="twb-meta">10 to 15 minutes · Well-Being Constellation</p>
        <div class="twb-actions">
          <button type="button" class="twb-btn primary" @click="step = 'privacy'">
            Check In With My Well-Being
          </button>
          <button type="button" class="twb-btn ghost" @click="step = 'how'">How My Responses Are Used</button>
        </div>
      </section>

      <section v-else-if="step === 'how' || step === 'privacy'" class="twb-shell twb-shell--narrow">
        <h1 class="twb-title">{{ step === 'privacy' ? 'Privacy & safety' : 'How responses are used' }}</h1>
        <p class="twb-note">{{ template.settings?.privacyNotice }}</p>
        <ul class="twb-bullets">
          <li>Domain scores are for you first.</li>
          <li>Written reflections stay private unless you choose to share them.</li>
          <li>Identity and Family reflections are private by default.</li>
          <li>This is not a diagnosis or mental-health evaluation.</li>
          <li>
            If responses suggest immediate danger, a qualified adult may need to follow up according to program
            policy.
          </li>
        </ul>
        <p class="twb-clarify">{{ template.settings?.disclaimer }}</p>
        <div class="twb-actions">
          <button type="button" class="twb-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="twb-btn primary" @click="step = 'context'">I understand →</button>
        </div>
      </section>

      <section v-else-if="step === 'context'" class="twb-shell twb-shell--narrow">
        <p class="twb-eyebrow">Before you begin</p>
        <h1 class="twb-title">A few optional details</h1>

        <p class="twb-field-label">Age version</p>
        <div class="twb-mode-grid">
          <button
            v-for="v in AGE_VERSION_OPTIONS"
            :key="v.id"
            type="button"
            class="twb-mode"
            :class="{ on: ageVersion === v.id }"
            @click="ageVersion = v.id"
          >
            <strong>{{ v.label }}</strong>
            <span>{{ v.description }}</span>
          </button>
        </div>

        <p class="twb-field-label">Assessment mode</p>
        <div class="twb-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="twb-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>

        <div class="twb-actions">
          <button type="button" class="twb-btn ghost" @click="step = 'privacy'">Back</button>
          <button type="button" class="twb-btn primary" @click="startScoring">Begin →</button>
        </div>
      </section>

      <section v-else-if="step === 'score'" class="twb-shell twb-shell--split">
        <header class="twb-header">
          <div>
            <p class="twb-eyebrow">
              {{ scoredCount }} of {{ activeDomains.length }} completed · Reflections private by default
            </p>
            <h1 class="twb-title">{{ activeDomain?.label }}</h1>
            <p class="twb-lead">{{ activeDomain?.definition }}</p>
          </div>
          <div class="twb-save">{{ saveStatus || 'Ready' }}</div>
        </header>

        <div class="twb-split">
          <div class="twb-panel">
            <div class="twb-score-block">
              <h2>{{ activeDomain?.primaryQuestion || 'How is this part of life going right now?' }}</h2>
              <div class="twb-scale-labels">
                <span>{{ scaleLow }}</span>
                <span>{{ scaleHigh }}</span>
              </div>
              <div class="twb-scores" role="group" :aria-label="`${activeDomain?.label} score`">
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="twb-score"
                  :class="{ on: currentScore === n }"
                  @click="setScore(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="currentScore != null" class="twb-gap-card" role="status" aria-live="polite">
              <p>{{ interpretation }}</p>
              <p class="twb-status-pill">{{ statusLabel }}</p>
              <p class="twb-live">
                {{ activeDomain?.label }} updated to {{ currentScore }} out of 10. Teen Well-Being Index is now
                {{ summary.teenWellBeingIndex ?? '—' }} out of 100. Your written reflection remains private unless
                you change visibility.
              </p>
            </div>

            <div v-if="currentScore != null" class="twb-reflect">
              <h2>{{ activeDomain?.reflectionPrompt || 'What most affects this area?' }}</h2>
              <div class="twb-chips">
                <button
                  v-for="chip in activeDomain?.reflectionOptions || []"
                  :key="chip"
                  type="button"
                  class="twb-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>

              <div v-if="enableImportance" class="twb-score-block">
                <h2>How important is it for this area to improve right now?</h2>
                <div class="twb-scores">
                  <button
                    v-for="n in 10"
                    :key="`imp-${n}`"
                    type="button"
                    class="twb-score soft"
                    :class="{ on: importance === n }"
                    @click="patchResponse(activeKey, { importanceScore: n })"
                  >
                    {{ n }}
                  </button>
                </div>
              </div>

              <div v-if="enableSupportNeed" class="twb-score-block">
                <h2>How much support would feel useful in this area?</h2>
                <div class="twb-scores">
                  <button
                    v-for="n in 10"
                    :key="`sup-${n}`"
                    type="button"
                    class="twb-score soft"
                    :class="{ on: supportNeed === n }"
                    @click="patchResponse(activeKey, { supportNeedScore: n })"
                  >
                    {{ n }}
                  </button>
                </div>
              </div>

              <label class="twb-field">
                Would you like support with this?
                <select
                  :value="supportPreference"
                  @change="patchResponse(activeKey, { supportPreference: $event.target.value })"
                >
                  <option v-for="o in SUPPORT_PREFERENCE_OPTIONS" :key="o.id" :value="o.id">
                    {{ o.label }}
                  </option>
                </select>
              </label>

              <details class="twb-details">
                <summary>Optional written reflection</summary>
                <textarea
                  :value="writtenReflection"
                  rows="3"
                  placeholder="Private unless you choose otherwise"
                  @input="patchResponse(activeKey, { writtenReflection: $event.target.value })"
                />
                <label class="twb-field">
                  Visibility for this reflection
                  <select
                    :value="reflectionVisibility"
                    @change="patchResponse(activeKey, { reflectionVisibility: $event.target.value })"
                  >
                    <option v-for="o in REFLECTION_VISIBILITY_OPTIONS" :key="o.id" :value="o.id">
                      {{ o.label }}
                    </option>
                  </select>
                </label>
              </details>

              <button type="button" class="twb-btn ghost small" @click="preferNotToAnswer">
                Prefer not to answer
              </button>
            </div>
          </div>

          <aside class="twb-aside">
            <TeenWellBeingConstellation
              :domains="activeDomains"
              :responses="responses"
              :teen-well-being-index="summary.teenWellBeingIndex"
              :system-scores="summary.systemScores"
              :active-domain-id="activeKey"
              :selected-priority-domain-ids="priorityKeys"
              :strength-count="summary.strengthCount"
              :support-opportunity-count="summary.supportOpportunityCount"
              interactive
              animated
              @domain-select="jumpToDomain"
            />
            <div class="twb-systems">
              <div>
                <span>Inner</span>
                <strong>{{ summary.systemScores?.innerWellBeing ?? '—' }}</strong>
              </div>
              <div>
                <span>Relationships</span>
                <strong>{{ summary.systemScores?.relationshipsAndSupport ?? '—' }}</strong>
              </div>
              <div>
                <span>Daily</span>
                <strong>{{ summary.systemScores?.dailyFunctioning ?? '—' }}</strong>
              </div>
              <div>
                <span>Recovery</span>
                <strong>{{ summary.systemScores?.regulationAndRecovery ?? '—' }}</strong>
              </div>
            </div>
          </aside>
        </div>

        <footer class="twb-footer sticky">
          <button type="button" class="twb-btn ghost" :disabled="scoreIndex === 0" @click="scoreIndex -= 1">
            Back
          </button>
          <button type="button" class="twb-btn primary" :disabled="!canAdvance" @click="nextScore">
            {{
              scoreIndex >= activeDomains.length - 1
                ? 'See my profile →'
                : `Continue to ${nextLabel} →`
            }}
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'complete-preview'" class="twb-shell twb-shell--narrow">
        <h1 class="twb-title">Your Well-Being Profile Is Ready</h1>
        <div class="twb-stats">
          <div class="twb-stat highlight">
            <span>Teen Well-Being Index</span>
            <strong>{{ summary.teenWellBeingIndex ?? '—' }} / 100</strong>
          </div>
          <div class="twb-stat">
            <span>Description</span>
            <strong>{{ summary.statusLabel || '—' }}</strong>
          </div>
          <div class="twb-stat">
            <span>Current strength</span>
            <strong>{{ summary.strengths?.[0]?.label || '—' }}</strong>
          </div>
          <div class="twb-stat">
            <span>Area needing support</span>
            <strong>{{ summary.challenges?.[0]?.label || '—' }}</strong>
          </div>
        </div>
        <p class="twb-note">
          This profile shows how life feels right now. It is not a diagnosis, and it does not define who you are.
        </p>
        <div class="twb-actions">
          <button type="button" class="twb-btn primary" @click="step = 'review'">
            Explore My Well-Being Profile
          </button>
          <button type="button" class="twb-btn ghost" @click="step = 'score'; scoreIndex = 0">
            Review My Responses
          </button>
        </div>
      </section>

      <section v-else-if="step === 'review'" class="twb-shell">
        <header class="twb-header">
          <div>
            <p class="twb-eyebrow">Your Well-Being Profile</p>
            <h1 class="twb-title">How different parts of life feel right now</h1>
          </div>
        </header>
        <p class="twb-clarify">{{ summary.indexClarification }}</p>

        <div class="twb-stats">
          <div class="twb-stat highlight">
            <span>Index</span>
            <strong>{{ summary.teenWellBeingIndex ?? '—' }}</strong>
          </div>
          <div class="twb-stat">
            <span>Level</span>
            <strong>{{ summary.statusLabel || '—' }}</strong>
          </div>
          <div class="twb-stat">
            <span>Strengths</span>
            <strong>{{ summary.strengthCount || 0 }}</strong>
          </div>
          <div class="twb-stat">
            <span>Support opportunities</span>
            <strong>{{ summary.supportOpportunityCount || 0 }}</strong>
          </div>
        </div>

        <div class="twb-viz-row">
          <TeenWellBeingConstellation
            :domains="activeDomains"
            :responses="responses"
            :teen-well-being-index="summary.teenWellBeingIndex"
            :selected-priority-domain-ids="priorityKeys"
            :strength-count="summary.strengthCount"
            :support-opportunity-count="summary.supportOpportunityCount"
          />
        </div>

        <div class="twb-insight-grid">
          <article>
            <h2>Current strengths</h2>
            <ul>
              <li v-for="x in summary.strengths?.slice(0, 4) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — {{ x.score }}/10
              </li>
              <li v-if="!(summary.strengths || []).length">No high scores yet — that is okay.</li>
            </ul>
          </article>
          <article>
            <h2>Current challenges</h2>
            <ul>
              <li v-for="x in summary.challenges?.slice(0, 4) || []" :key="x.domainKey">
                <strong>{{ x.label }}</strong> — {{ x.score }}/10
              </li>
              <li v-if="!(summary.challenges || []).length">No major challenges flagged.</li>
            </ul>
          </article>
        </div>

        <div v-if="summary.insights?.length" class="twb-insights">
          <h2>Insights</h2>
          <ul>
            <li v-for="(t, i) in summary.insights" :key="i">{{ t }}</li>
          </ul>
        </div>

        <TeenWeekInView :check-ins="weeklyCheckIns" />

        <footer class="twb-footer">
          <button type="button" class="twb-btn ghost" @click="step = 'score'; scoreIndex = 0">Edit scores</button>
          <button type="button" class="twb-btn primary" @click="step = 'priorities'">Choose priorities →</button>
        </footer>
      </section>

      <section v-else-if="step === 'priorities'" class="twb-shell twb-shell--narrow">
        <p class="twb-eyebrow">Priority selection</p>
        <h1 class="twb-title">Which areas would make the biggest positive difference?</h1>
        <p class="twb-lead">
          Choose what feels most important to you. You do not have to select the lowest score.
        </p>
        <div class="twb-priority-list">
          <label v-for="d in activeDomains" :key="d.key" class="twb-priority-card">
            <input
              type="checkbox"
              :checked="priorityKeys.includes(d.key)"
              :disabled="!priorityKeys.includes(d.key) && priorityKeys.length >= maxPriorities"
              @change="togglePriority(d.key, $event.target.checked)"
            />
            <div>
              <strong>{{ d.label }}</strong>
              <p>
                Score {{ responseMap[d.key]?.currentExperienceScore ?? '—' }} · Importance
                {{ responseMap[d.key]?.importanceScore ?? '—' }} · Support need
                {{ responseMap[d.key]?.supportNeedScore ?? '—' }}
              </p>
            </div>
          </label>
        </div>
        <footer class="twb-footer">
          <button type="button" class="twb-btn ghost" @click="step = 'review'">Back</button>
          <button
            type="button"
            class="twb-btn primary"
            :disabled="!priorityKeys.length"
            @click="goPlans"
          >
            Build my Well-Being Plan →
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'plans'" class="twb-shell twb-shell--narrow">
        <p class="twb-eyebrow">Teen Well-Being Plan</p>
        <h1 class="twb-title">One small step at a time</h1>
        <article v-for="key in priorityKeys" :key="key" class="twb-bridge">
          <h2>{{ domainMap[key]?.label }}</h2>
          <label class="twb-field">
            What I want to feel or experience
            <textarea v-model="planDrafts[key].desiredExperience" rows="2" />
          </label>
          <label class="twb-field">
            What is already helping in this area?
            <input v-model="planDrafts[key].existingStrength" type="text" />
          </label>
          <label class="twb-field">
            One small action
            <input v-model="planDrafts[key].smallAction" type="text" />
          </label>
          <label class="twb-field">
            Support person
            <input v-model="planDrafts[key].supportPerson" type="text" />
          </label>
          <label class="twb-field">
            Possible obstacle
            <input v-model="planDrafts[key].possibleObstacle" type="text" />
          </label>
          <label class="twb-field">
            Flexible alternative
            <input v-model="planDrafts[key].flexibleAlternative" type="text" />
          </label>
          <label class="twb-field">
            Success indicator
            <input v-model="planDrafts[key].successIndicator" type="text" />
          </label>
          <label class="twb-field">
            Confidence (1–10)
            <input v-model.number="planDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="(planDrafts[key].confidenceScore || 10) < 7" class="twb-note">
            How could this step become smaller, easier, or more realistic?
          </p>
        </article>

        <h2 class="twb-subtitle">Support Network Map (optional)</h2>
        <p class="twb-note">You do not have to identify anyone as safe. This stays private unless you share it.</p>
        <div class="twb-chips">
          <button
            v-for="p in SUPPORT_NETWORK_OPTIONS"
            :key="p"
            type="button"
            class="twb-chip"
            :class="{ on: supportNetwork.includes(p) }"
            @click="toggleNetwork(p)"
          >
            {{ p }}
          </button>
        </div>

        <footer class="twb-footer">
          <button type="button" class="twb-btn ghost" @click="step = 'priorities'">Back</button>
          <button type="button" class="twb-btn primary" @click="finish">Finish profile →</button>
        </footer>
      </section>

      <section v-else-if="step === 'done'" class="twb-shell twb-shell--narrow twb-print">
        <p class="twb-eyebrow">Complete</p>
        <h1 class="twb-title">Your Well-Being Profile</h1>
        <div class="twb-stats">
          <div class="twb-stat highlight">
            <span>Index</span>
            <strong>{{ summary.teenWellBeingIndex }} / 100</strong>
          </div>
          <div class="twb-stat">
            <span>Level</span>
            <strong>{{ summary.statusLabel }}</strong>
          </div>
        </div>
        <TeenWellBeingConstellation
          :domains="activeDomains"
          :responses="responses"
          :teen-well-being-index="summary.teenWellBeingIndex"
          :selected-priority-domain-ids="priorityKeys"
        />
        <p class="twb-clarify">{{ summary.indexClarification }}</p>
        <div class="twb-actions">
          <button type="button" class="twb-btn primary" @click="downloadPdf">Print / Save PDF</button>
          <button type="button" class="twb-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="twb-btn ghost" @click="resetGuest">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import TeenWellBeingConstellation from '../../components/teenWellBeing/TeenWellBeingConstellation.vue';
import TeenWeekInView from '../../components/teenWellBeing/TeenWeekInView.vue';
import {
  AGE_VERSION_OPTIONS,
  MODE_OPTIONS,
  SUPPORT_PREFERENCE_OPTIONS,
  REFLECTION_VISIBILITY_OPTIONS,
  buildTeenWellBeingSummary,
  domainsForContext,
  domainStatusLabel,
  interpretDomainScore
} from '../../utils/teenWellBeing.js';

const SUPPORT_NETWORK_OPTIONS = [
  'Parent or guardian',
  'Sibling',
  'Teacher',
  'School counselor',
  'Coach',
  'Mentor',
  'Close friend',
  'Therapist',
  'Program staff',
  'I am unsure whether I can ask',
  'I do not currently have support in this area'
];

const route = useRoute();
const isGuest = computed(() => !!route.meta?.guestTeenWellBeing);
const GUEST_KEY = 'twb-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const ageVersion = ref('ages-15-to-18');
const mode = ref('full');
const responses = ref([]);
const priorityKeys = ref([]);
const scoreIndex = ref(0);
const saveStatus = ref('');
const planDrafts = reactive({});
const supportNetwork = ref([]);
const weeklyCheckIns = ref([]);

const settings = computed(() => template.value?.settings || {});
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 3));
const enableImportance = computed(() => settings.value.enableImportance !== false);
const enableSupportNeed = computed(() => settings.value.enableSupportNeed !== false);
const enableQuickExit = computed(() => settings.value.enableQuickExit !== false);
const quickExitUrl = computed(() => settings.value.quickExitUrl || 'https://www.google.com');

const activeDomains = computed(() =>
  domainsForContext(template.value, { mode: mode.value, ageVersion: ageVersion.value })
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
const currentScore = computed(
  () => responseMap.value[activeKey.value]?.currentExperienceScore ?? null
);
const importance = computed(() => responseMap.value[activeKey.value]?.importanceScore ?? null);
const supportNeed = computed(() => responseMap.value[activeKey.value]?.supportNeedScore ?? null);
const currentChips = computed(() => responseMap.value[activeKey.value]?.reflectionChips || []);
const supportPreference = computed(
  () => responseMap.value[activeKey.value]?.supportPreference || 'none'
);
const writtenReflection = computed(
  () => responseMap.value[activeKey.value]?.writtenReflection || ''
);
const reflectionVisibility = computed(
  () => responseMap.value[activeKey.value]?.reflectionVisibility || 'private'
);
const statusLabel = computed(() => domainStatusLabel(currentScore.value));
const interpretation = computed(() =>
  interpretDomainScore(currentScore.value, activeDomain.value?.label || 'This area')
);

const scaleLow = computed(() => {
  if (activeKey.value === 'stress') return 'Overwhelming';
  if (activeKey.value === 'sleep') return 'Rarely rested';
  if (activeKey.value === 'happiness') return 'Almost no enjoyment';
  return 'Very difficult';
});
const scaleHigh = computed(() => {
  if (activeKey.value === 'stress') return 'Manageable';
  if (activeKey.value === 'sleep') return 'Usually rested';
  if (activeKey.value === 'happiness') return 'Frequent enjoyment';
  return 'Going very well';
});

const scoredCount = computed(
  () =>
    activeDomains.value.filter((d) => {
      const r = responseMap.value[d.key];
      return r?.preferNotToAnswer || r?.currentExperienceScore != null;
    }).length
);

const canAdvance = computed(() => {
  const r = responseMap.value[activeKey.value];
  return r?.preferNotToAnswer || r?.currentExperienceScore != null;
});

const nextLabel = computed(() => activeDomains.value[scoreIndex.value + 1]?.label || 'next');

const summary = computed(() =>
  buildTeenWellBeingSummary(template.value, responses.value, {
    mode: mode.value,
    ageVersion: ageVersion.value,
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
        ageVersion: ageVersion.value,
        mode: mode.value,
        responses: responses.value,
        priorityKeys: priorityKeys.value,
        scoreIndex: scoreIndex.value,
        planDrafts: { ...planDrafts },
        supportNetwork: supportNetwork.value,
        weeklyCheckIns: weeklyCheckIns.value,
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
  [step, responses, priorityKeys, scoreIndex, ageVersion, mode, supportNetwork],
  () => persistGuest(),
  { deep: true }
);

function ensureResponse(key) {
  if (!responseMap.value[key]) {
    responses.value = [
      ...responses.value,
      {
        domainKey: key,
        currentExperienceScore: null,
        importanceScore: null,
        supportNeedScore: null,
        reflectionChips: [],
        supportPreference: 'none',
        writtenReflection: '',
        reflectionVisibility: 'private',
        preferNotToAnswer: false
      }
    ];
  }
}

function patchResponse(key, patch) {
  ensureResponse(key);
  responses.value = responses.value.map((r) => (r.domainKey === key ? { ...r, ...patch } : r));
}

function setScore(n) {
  patchResponse(activeKey.value, {
    currentExperienceScore: n,
    preferNotToAnswer: false
  });
}

function toggleChip(chip) {
  const set = new Set(currentChips.value);
  if (set.has(chip)) set.delete(chip);
  else set.add(chip);
  patchResponse(activeKey.value, { reflectionChips: [...set] });
}

function preferNotToAnswer() {
  patchResponse(activeKey.value, {
    preferNotToAnswer: true,
    currentExperienceScore: null
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
  } else {
    priorityKeys.value = priorityKeys.value.filter((k) => k !== key);
  }
}

function goPlans() {
  for (const key of priorityKeys.value) {
    if (!planDrafts[key]) {
      planDrafts[key] = {
        desiredExperience: '',
        existingStrength: '',
        smallAction: '',
        supportPerson: '',
        possibleObstacle: '',
        flexibleAlternative: '',
        successIndicator: '',
        confidenceScore: null
      };
    }
  }
  step.value = 'plans';
}

function toggleNetwork(p) {
  if (supportNetwork.value.includes(p)) {
    supportNetwork.value = supportNetwork.value.filter((x) => x !== p);
  } else {
    supportNetwork.value = [...supportNetwork.value, p];
  }
}

function finish() {
  step.value = 'done';
  persistGuest();
}

function quickExit() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    // ignore
  }
  window.location.href = quickExitUrl.value;
}

function buildExport() {
  return {
    type: 'teen_wellbeing_guest',
    title: 'Teen Well-Being Assessment',
    visualExperience: 'Well-Being Constellation',
    exportedAt: new Date().toISOString(),
    ageVersion: ageVersion.value,
    mode: mode.value,
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
    })),
    supportNetwork: supportNetwork.value
  };
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `teen-wellbeing-${new Date().toISOString().slice(0, 10)}.json`;
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
  supportNetwork.value = [];
  Object.keys(planDrafts).forEach((k) => delete planDrafts[k]);
  step.value = 'welcome';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/teen-wellbeing/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value = 'Teen Well-Being template is not available yet. Run migration 924.';
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
          if (cached?.ageVersion) ageVersion.value = cached.ageVersion;
          if (cached?.mode) mode.value = cached.mode;
          if (typeof cached?.scoreIndex === 'number') scoreIndex.value = cached.scoreIndex;
          if (cached?.supportNetwork) supportNetwork.value = cached.supportNetwork;
          if (cached?.weeklyCheckIns) weeklyCheckIns.value = cached.weeklyCheckIns;
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

onMounted(load);
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Source+Sans+3:wght@400;500;600;700&display=swap');

.twb-page {
  --ink: #0f172a;
  --muted: #64748b;
  --line: #e2e8f0;
  --bg: #f8fafc;
  min-height: 100vh;
  background:
    radial-gradient(900px 420px at 8% -8%, rgba(14, 165, 233, 0.1), transparent 55%),
    radial-gradient(700px 360px at 100% 0%, rgba(99, 102, 241, 0.08), transparent 50%),
    var(--bg);
  color: var(--ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  padding: 1.5rem 1rem 4rem;
  position: relative;
}

.twb-exit {
  position: fixed;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 40;
  border: 1px solid #cbd5e1;
  background: rgba(255, 255, 255, 0.92);
  color: #475569;
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}

.twb-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--muted);
}
.twb-state.error {
  color: #be123c;
}

.twb-shell {
  max-width: 1100px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.05);
}

.twb-shell--narrow {
  max-width: 640px;
}

.twb-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #0284c7;
  font-weight: 700;
}

.twb-title {
  margin: 0.35rem 0 0.65rem;
  font-family: Fraunces, Georgia, serif;
  font-size: clamp(1.55rem, 3vw, 2.15rem);
  font-weight: 650;
  line-height: 1.2;
}

.twb-subtitle {
  margin: 1.5rem 0 0.5rem;
  font-size: 1.1rem;
}

.twb-lead,
.twb-note,
.twb-meta,
.twb-privacy,
.twb-clarify {
  color: #475569;
  line-height: 1.6;
}

.twb-privacy {
  background: #eff6ff;
  border-radius: 12px;
  padding: 0.75rem 1rem;
  font-size: 0.92rem;
}

.twb-clarify {
  font-size: 0.9rem;
  padding: 0.75rem 1rem;
  background: #f1f5f9;
  border-radius: 12px;
}

.twb-actions,
.twb-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.35rem;
}

.twb-footer.sticky {
  position: sticky;
  bottom: 0.5rem;
  background: rgba(255, 255, 255, 0.95);
  padding-top: 0.75rem;
  z-index: 5;
}

.twb-btn {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  border-radius: 999px;
  padding: 0.7rem 1.15rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

.twb-btn.primary {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}

.twb-btn.ghost {
  background: transparent;
}

.twb-btn.small {
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
}

.twb-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.twb-bullets {
  line-height: 1.7;
  color: #334155;
}

.twb-field,
.twb-field-label {
  display: grid;
  gap: 0.35rem;
  margin: 1rem 0 0.5rem;
  font-weight: 600;
  font-size: 0.92rem;
}

.twb-field select,
.twb-field input,
.twb-field textarea {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  background: #fff;
}

.twb-mode-grid {
  display: grid;
  gap: 0.5rem;
}

.twb-mode {
  text-align: left;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  cursor: pointer;
}

.twb-mode.on {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.15);
}

.twb-mode strong {
  display: block;
}

.twb-mode span,
.twb-mode em {
  display: block;
  color: #64748b;
  font-size: 0.85rem;
  font-style: normal;
  margin-top: 0.2rem;
}

.twb-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.twb-save {
  font-size: 0.78rem;
  font-weight: 700;
  color: #64748b;
}

.twb-split {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
  gap: 1.25rem;
  align-items: start;
}

.twb-aside {
  position: sticky;
  top: 1rem;
}

.twb-systems {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.twb-systems div {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.55rem;
  text-align: center;
}

.twb-systems span {
  display: block;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
  font-weight: 700;
}

.twb-score-block {
  margin-bottom: 1.15rem;
}

.twb-score-block h2 {
  margin: 0 0 0.45rem;
  font-size: 1.05rem;
}

.twb-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #94a3b8;
  margin-bottom: 0.35rem;
}

.twb-scores {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.3rem;
}

.twb-score {
  aspect-ratio: 1;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
  font-weight: 700;
  cursor: pointer;
  min-height: 2.4rem;
}

.twb-score.on {
  background: #0ea5e9;
  color: #fff;
  border-color: #0ea5e9;
}

.twb-score.soft.on {
  background: #6366f1;
  border-color: #6366f1;
}

.twb-gap-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin-bottom: 1rem;
}

.twb-gap-card p {
  margin: 0 0 0.4rem;
  color: #475569;
  font-size: 0.92rem;
}

.twb-status-pill {
  font-weight: 700 !important;
  color: #0f172a !important;
}

.twb-live {
  font-size: 0.8rem !important;
  color: #64748b !important;
}

.twb-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.twb-chip {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.75rem;
  font-size: 0.82rem;
  cursor: pointer;
}

.twb-chip.on {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}

.twb-details {
  margin: 0.75rem 0;
}

.twb-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.65rem;
  margin: 1rem 0;
}

.twb-stat {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.75rem;
}

.twb-stat.highlight {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}

.twb-stat span {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.75;
  font-weight: 700;
}

.twb-viz-row {
  margin: 1rem 0 1.5rem;
  max-width: 420px;
}

.twb-insight-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.85rem;
  margin: 1.25rem 0;
}

.twb-insight-grid article,
.twb-insights,
.twb-bridge {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.9rem 1rem;
}

.twb-bridge {
  margin-bottom: 1rem;
}

.twb-priority-list {
  display: grid;
  gap: 0.65rem;
}

.twb-priority-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.85rem 1rem;
  cursor: pointer;
}

.twb-priority-card p {
  margin: 0.2rem 0 0;
  color: #64748b;
  font-size: 0.85rem;
}

@media (max-width: 900px) {
  .twb-split {
    grid-template-columns: 1fr;
  }
  .twb-aside {
    position: static;
    order: -1;
  }
  .twb-score {
    min-height: 2.75rem;
  }
}

@media print {
  .twb-btn,
  .twb-footer,
  .twb-actions,
  .twb-exit {
    display: none !important;
  }
}
</style>
