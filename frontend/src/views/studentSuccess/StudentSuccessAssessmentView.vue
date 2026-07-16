<template>
  <div class="ss-page" :class="{ 'ss-page--young': educationLevel === 'upper-elementary' }">
    <div v-if="loading" class="ss-state">Loading Student Success Assessment…</div>
    <div v-else-if="error" class="ss-state error">{{ error }}</div>
    <template v-else-if="template">
      <!-- Welcome -->
      <section v-if="step === 'welcome'" class="ss-shell ss-shell--narrow">
        <p class="ss-eyebrow">Student Success Assessment</p>
        <h1 class="ss-title">What Is Helping You Succeed in School?</h1>
        <p class="ss-lead">
          Success is not only about grades. Your habits, confidence, organization, support, stress, and
          ability to keep going all affect how school feels and how well you can learn.
        </p>
        <p class="ss-note">
          This assessment will help you identify what is already working and what support or strategy
          could help next. It is not a test for learning disabilities or mental-health conditions.
        </p>
        <p class="ss-meta">About 10–15 minutes</p>
        <div class="ss-actions">
          <button type="button" class="ss-btn primary" @click="step = 'context'">
            Build My Student Success Pathway
          </button>
          <button type="button" class="ss-btn ghost" @click="step = 'how'">How This Assessment Works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="ss-shell ss-shell--narrow">
        <h1 class="ss-title">How This Assessment Works</h1>
        <ol class="ss-list">
          <li>Choose your education level and assessment mode.</li>
          <li>Rate each success domain from 1 to 10.</li>
          <li>Watch your Student Success Pathway light up as you go.</li>
          <li>Pick one to three priorities and build a small action plan.</li>
          <li>Download or share your Student Success Profile.</li>
        </ol>
        <p class="ss-note">
          On this public guest check-in, responses stay on this device unless you download them. Inside a
          program, authorized adults may view responses based on permissions — we do not promise
          confidentiality when support staff can see individual answers.
        </p>
        <div class="ss-actions">
          <button type="button" class="ss-btn primary" @click="step = 'context'">Continue</button>
          <button type="button" class="ss-btn ghost" @click="step = 'welcome'">Back</button>
        </div>
      </section>

      <section v-else-if="step === 'context'" class="ss-shell ss-shell--narrow">
        <p class="ss-eyebrow">Before you begin</p>
        <h1 class="ss-title">Tell us about your learning context</h1>

        <label class="ss-field">
          Education level
          <select v-model="educationLevel">
            <option v-for="lvl in EDUCATION_LEVELS" :key="lvl.id" :value="lvl.id">{{ lvl.label }}</option>
          </select>
        </label>

        <p class="ss-field-label">Assessment mode</p>
        <div class="ss-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="ss-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>

        <p class="ss-field-label">Current academic concerns (optional)</p>
        <div class="ss-chips">
          <button
            v-for="c in CONCERN_OPTIONS"
            :key="c"
            type="button"
            class="ss-chip"
            :class="{ on: concerns.includes(c) }"
            @click="toggleConcern(c)"
          >
            {{ c }}
          </button>
        </div>

        <div class="ss-actions">
          <button type="button" class="ss-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="ss-btn primary" @click="startCheckIn">Begin pathway →</button>
        </div>
      </section>

      <!-- Progressive domains -->
      <section v-else-if="step === 'checkin' && activeDomain" class="ss-shell ss-shell--wide">
        <header class="ss-header">
          <div>
            <p class="ss-eyebrow">
              Student Success Assessment · {{ levelLabel }} · {{ modeLabel }}
              <span class="ss-save">{{ saveStatus }}</span>
            </p>
            <h1 class="ss-title">{{ activeDomain.label }}</h1>
            <p class="ss-lead">{{ activeDomain.definition }}</p>
          </div>
          <div class="ss-count">{{ scoredCount }} of {{ activeDomains.length }} completed</div>
        </header>
        <div class="ss-progress"><div :style="{ width: progressPct + '%' }" /></div>

        <div class="ss-layout">
          <div class="ss-main">
            <div class="ss-mobile-score" aria-live="polite">
              Success Score
              <strong>{{ summary.studentSuccessScore ?? '—' }}</strong>
              <span v-if="summary.studentSuccessStatus">· {{ summary.studentSuccessStatus }}</span>
            </div>

            <h2 class="ss-q">{{ activeDomain.primaryQuestion || domainFallbackQuestion }}</h2>
            <div class="ss-scale-ends">
              <span>{{ scaleLow }}</span>
              <span>{{ scaleHigh }}</span>
            </div>
            <div class="ss-score-row" role="radiogroup" :aria-label="`${activeDomain.label} score`">
              <button
                v-for="n in 10"
                :key="n"
                type="button"
                class="ss-score-btn"
                :class="{ active: currentScore === n }"
                :style="
                  currentScore === n
                    ? { background: activeDomain.color, borderColor: activeDomain.color }
                    : null
                "
                role="radio"
                :aria-checked="currentScore === n"
                @click="setScore(n)"
              >
                {{ n }}
              </button>
            </div>

            <p v-if="liveAnnouncement" class="ss-interp" role="status" aria-live="polite">
              {{ liveAnnouncement }}
            </p>

            <div v-if="currentScore != null" class="ss-reflect">
              <h3>{{ activeDomain.reflectionPrompt || 'What stands out about this area?' }}</h3>
              <div class="ss-chips">
                <button
                  v-for="chip in reflectionOptions"
                  :key="chip"
                  type="button"
                  class="ss-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>

              <template v-if="enableImportance">
                <h3>How important is it to improve this area right now?</h3>
                <div class="ss-score-row ss-score-row--sm" role="radiogroup" aria-label="Importance">
                  <button
                    v-for="n in 10"
                    :key="`imp-${n}`"
                    type="button"
                    class="ss-score-btn"
                    :class="{ active: currentImportance === n }"
                    role="radio"
                    :aria-checked="currentImportance === n"
                    @click="setImportance(n)"
                  >
                    {{ n }}
                  </button>
                </div>
              </template>

              <template v-if="enableConfidence">
                <h3>How confident are you that you can improve this area?</h3>
                <div class="ss-score-row ss-score-row--sm" role="radiogroup" aria-label="Confidence to improve">
                  <button
                    v-for="n in 10"
                    :key="`conf-${n}`"
                    type="button"
                    class="ss-score-btn"
                    :class="{ active: currentConfidence === n }"
                    role="radio"
                    :aria-checked="currentConfidence === n"
                    @click="setConfidence(n)"
                  >
                    {{ n }}
                  </button>
                </div>
              </template>

              <h3>Would support in this area be helpful?</h3>
              <div class="ss-support" role="radiogroup" aria-label="Support preference">
                <label v-for="opt in SUPPORT_OPTIONS" :key="opt.id" class="ss-support__opt">
                  <input
                    type="radio"
                    :name="`support-${activeDomain.key}`"
                    :value="opt.id"
                    :checked="currentSupport === opt.id"
                    @change="setSupport(opt.id)"
                  />
                  {{ opt.label }}
                </label>
              </div>

              <label class="ss-note-field">
                Optional note
                <textarea
                  :value="currentNote"
                  rows="2"
                  placeholder="Anything you want a trusted adult to know…"
                  @input="setNote($event.target.value)"
                />
              </label>
            </div>
          </div>

          <aside class="ss-side">
            <StudentSuccessPathway
              :domains="activeDomains"
              :responses="responses"
              :student-success-score="summary.studentSuccessScore"
              :system-scores="summary.systemScores"
              :active-domain-id="activeDomain.key"
              :age-group="educationLevel"
              :priority-keys="selectedPriorities"
              interactive
              @domain-select="jumpToDomain"
            />
            <div class="ss-side-card">
              <h3>Status</h3>
              <p>{{ summary.studentSuccessStatus || 'Building…' }}</p>
              <StudentSuccessBackpack
                class="ss-backpack-mini"
                :packed="backpack.packed.slice(0, 4)"
                :could-add="backpack.couldAdd.slice(0, 3)"
                :age-group="educationLevel"
                title="Backpack preview"
              />
            </div>
          </aside>
        </div>

        <footer class="ss-footer">
          <button type="button" class="ss-btn ghost" :disabled="domainIndex === 0" @click="prevDomain">
            Back
          </button>
          <button
            type="button"
            class="ss-btn primary ss-btn--sticky"
            :disabled="currentScore == null"
            @click="nextDomain"
          >
            {{
              domainIndex >= activeDomains.length - 1
                ? 'Finish pathway →'
                : `Continue to ${nextDomainLabel} →`
            }}
          </button>
        </footer>
      </section>

      <!-- Completion -->
      <section v-else-if="step === 'complete'" class="ss-shell ss-shell--narrow ss-complete">
        <p class="ss-eyebrow">Pathway complete</p>
        <h1 class="ss-title">Your Student Success Profile Is Ready</h1>
        <div class="ss-complete-score">
          <span>{{ summary.studentSuccessScore ?? '—' }}</span>
          <small>/ 100</small>
        </div>
        <p class="ss-status-pill">{{ summary.studentSuccessStatus }}</p>
        <dl class="ss-complete-meta">
          <div>
            <dt>Current strength</dt>
            <dd>{{ summary.strongest?.[0]?.label || '—' }}</dd>
          </div>
          <div>
            <dt>Priority opportunity</dt>
            <dd>{{ summary.needingSupport?.[0]?.label || '—' }}</dd>
          </div>
          <div>
            <dt>Support requests</dt>
            <dd>{{ summary.supportRequestCount || 0 }}</dd>
          </div>
        </dl>
        <p class="ss-note">
          Success grows through small habits, useful strategies, and the right support. Your profile is a
          starting point for choosing what to work on next.
        </p>
        <div class="ss-actions">
          <button type="button" class="ss-btn primary" @click="step = 'priorities'">
            Explore My Student Success Profile
          </button>
          <button type="button" class="ss-btn ghost" @click="reviewResponses">Review My Responses</button>
        </div>
      </section>

      <!-- Priorities + plan -->
      <section v-else-if="step === 'priorities'" class="ss-shell ss-shell--narrow">
        <p class="ss-eyebrow">Student Success Plan</p>
        <h1 class="ss-title">Choose what to focus on</h1>
        <p class="ss-lead">
          Which areas would help school feel more manageable or successful? Pick up to
          {{ maxPriorities }}.
        </p>
        <div class="ss-chips">
          <button
            v-for="p in PRIORITY_OPTIONS"
            :key="p.id"
            type="button"
            class="ss-chip"
            :class="{ on: selectedPriorities.includes(p.id) }"
            :disabled="!selectedPriorities.includes(p.id) && selectedPriorities.length >= maxPriorities"
            @click="togglePriority(p.id)"
          >
            {{ p.label }}
          </button>
        </div>

        <div v-for="key in selectedPriorities" :key="key" class="ss-plan-card">
          <h3>{{ priorityLabel(key) }}</h3>
          <label class="ss-field">
            One small goal
            <input v-model="planDrafts[key].goal" type="text" placeholder="e.g. Turn in every math assignment this week" />
          </label>
          <label class="ss-field">
            First action
            <input v-model="planDrafts[key].firstAction" type="text" placeholder="e.g. Write assignments in my planner before leaving class" />
          </label>
          <label class="ss-field">
            Strategy to try
            <select v-model="planDrafts[key].strategy">
              <option value="">Choose a strategy…</option>
              <option v-for="s in strategiesFor(key)" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <label class="ss-field">
            Who can help
            <input v-model="planDrafts[key].supportPerson" type="text" placeholder="Teacher, tutor, family, coach…" />
          </label>
          <label class="ss-field">
            Confidence (1–10)
            <input v-model.number="planDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="planDrafts[key].confidenceScore && planDrafts[key].confidenceScore < 7" class="ss-note">
            How could this goal become smaller or easier to start?
          </p>
        </div>

        <div class="ss-actions">
          <button type="button" class="ss-btn ghost" @click="step = 'complete'">Back</button>
          <button type="button" class="ss-btn primary" @click="goResults">View my profile →</button>
        </div>
      </section>

      <!-- Results -->
      <section v-else-if="step === 'results'" class="ss-shell ss-shell--wide ss-results">
        <header class="ss-header">
          <div>
            <p class="ss-eyebrow">Student Success Assessment</p>
            <h1 class="ss-title">Your Student Success Profile</h1>
            <p class="ss-lead">
              This profile shows the skills, habits, supports, and challenges that currently affect your
              learning experience.
            </p>
          </div>
          <div class="ss-count ss-count--score">
            <strong>{{ summary.studentSuccessScore ?? '—' }}</strong>
            <span>{{ summary.studentSuccessStatus }}</span>
          </div>
        </header>

        <div class="ss-results-grid">
          <StudentSuccessPathway
            :domains="activeDomains"
            :responses="responses"
            :student-success-score="summary.studentSuccessScore"
            :system-scores="summary.systemScores"
            :age-group="educationLevel"
            :priority-keys="selectedPriorities"
            title="Completed pathway"
          />
          <StudentSuccessBackpack
            :packed="backpack.packed"
            :could-add="backpack.couldAdd"
            :current-strategies="selectedStrategies"
            :age-group="educationLevel"
            interactive
            @add-tool="addTool"
          />
        </div>

        <div class="ss-two">
          <div class="ss-panel">
            <h2>Current strengths</h2>
            <ul>
              <li v-for="s in summary.strongest" :key="s.domainKey">
                <span :style="{ color: s.color }">{{ s.label }}</span> — {{ s.score }}/10
              </li>
            </ul>
          </div>
          <div class="ss-panel">
            <h2>Areas needing support</h2>
            <ul>
              <li v-for="s in summary.needingSupport" :key="s.domainKey">
                <span :style="{ color: s.color }">{{ s.label }}</span> — {{ s.score }}/10
                <span v-if="s.importanceScore != null"> · Importance {{ s.importanceScore }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div v-if="summary.insights?.length" class="ss-panel">
          <h2>Insights</h2>
          <ul>
            <li v-for="(ins, i) in summary.insights" :key="i">{{ ins }}</li>
          </ul>
        </div>

        <div v-if="summary.indicators?.length" class="ss-panel">
          <h2>Patterns worth discussing</h2>
          <ul>
            <li v-for="ind in summary.indicators" :key="ind.key">{{ ind.message }}</li>
          </ul>
        </div>

        <div v-if="selectedPriorities.length" class="ss-panel">
          <h2>Your Student Success Plan</h2>
          <div v-for="key in selectedPriorities" :key="`plan-${key}`" class="ss-plan-summary">
            <h3>{{ priorityLabel(key) }}</h3>
            <p><strong>Goal:</strong> {{ planDrafts[key]?.goal || '—' }}</p>
            <p><strong>First action:</strong> {{ planDrafts[key]?.firstAction || '—' }}</p>
            <p><strong>Strategy:</strong> {{ planDrafts[key]?.strategy || '—' }}</p>
            <p><strong>Support:</strong> {{ planDrafts[key]?.supportPerson || '—' }}</p>
          </div>
        </div>

        <p class="ss-note">
          {{ template.settings?.disclaimer ||
            'This assessment is not a diagnostic test and should not be the sole basis for discipline, placement, or special-education decisions.' }}
        </p>

        <div class="ss-actions">
          <button type="button" class="ss-btn primary" @click="downloadPdf">Download / print PDF</button>
          <button type="button" class="ss-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="ss-btn ghost" @click="resetGuest">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  flushStandardGuestAssessment,
  readAccessTokenFromRoute
} from '../../utils/assessmentAssignedSession.js';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import StudentSuccessPathway from '../../components/studentSuccess/StudentSuccessPathway.vue';
import StudentSuccessBackpack from '../../components/studentSuccess/StudentSuccessBackpack.vue';
import {
  EDUCATION_LEVELS,
  MODE_OPTIONS,
  SUPPORT_OPTIONS,
  PRIORITY_OPTIONS,
  CONCERN_OPTIONS,
  domainsForContext,
  interpretScore,
  buildStudentSuccessSummary,
  buildBackpackItems
} from '../../utils/studentSuccess.js';

const route = useRoute();
const assignedToken = computed(() => readAccessTokenFromRoute(route));
const isGuest = computed(() => !!route.meta?.guestStudentSuccess);
const GUEST_KEY = 'ss-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const mode = ref('full');
const educationLevel = ref('high-school');
const concerns = ref([]);
const domainIndex = ref(0);
const responses = ref([]);
const saveStatus = ref('');
const selectedPriorities = ref([]);
const backpackExtras = ref([]);
const liveAnnouncement = ref('');
const planDrafts = reactive({});

const settings = computed(() => template.value?.settings || {});
const enableImportance = computed(() => settings.value.enableImportance !== false);
const enableConfidence = computed(() => settings.value.enableConfidence !== false);
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 3));

const activeDomains = computed(() =>
  domainsForContext(template.value, { mode: mode.value, educationLevel: educationLevel.value })
);
const activeDomain = computed(() => activeDomains.value[domainIndex.value] || null);
const responseMap = computed(() => {
  const m = {};
  for (const r of responses.value) m[r.domainKey] = r;
  return m;
});

const currentScore = computed(() => responseMap.value[activeDomain.value?.key]?.score ?? null);
const currentImportance = computed(
  () => responseMap.value[activeDomain.value?.key]?.importanceScore ?? null
);
const currentConfidence = computed(
  () => responseMap.value[activeDomain.value?.key]?.confidenceScore ?? null
);
const currentChips = computed(() => responseMap.value[activeDomain.value?.key]?.reflectionChips || []);
const currentSupport = computed(
  () => responseMap.value[activeDomain.value?.key]?.supportPreference || 'none'
);
const currentNote = computed(() => responseMap.value[activeDomain.value?.key]?.note || '');
const reflectionOptions = computed(() => activeDomain.value?.reflectionOptions || []);

const summary = computed(() =>
  buildStudentSuccessSummary(template.value, responses.value, {
    mode: mode.value,
    educationLevel: educationLevel.value
  })
);
const backpack = computed(() => {
  const base = buildBackpackItems(summary.value, responses.value);
  return {
    packed: [...new Set([...base.packed, ...backpackExtras.value])],
    couldAdd: base.couldAdd.filter((t) => !backpackExtras.value.includes(t))
  };
});

const scoredCount = computed(
  () => activeDomains.value.filter((d) => responseMap.value[d.key]?.score != null).length
);
const progressPct = computed(() => {
  if (!activeDomains.value.length) return 0;
  return Math.round((scoredCount.value / activeDomains.value.length) * 100);
});

const modeLabel = computed(() => MODE_OPTIONS.find((m) => m.id === mode.value)?.label || mode.value);
const levelLabel = computed(
  () => EDUCATION_LEVELS.find((l) => l.id === educationLevel.value)?.label || educationLevel.value
);
const nextDomainLabel = computed(() => {
  const next = activeDomains.value[domainIndex.value + 1];
  return next?.shortLabel || next?.label || 'next';
});

const scaleLow = computed(() => {
  if (educationLevel.value === 'upper-elementary') return 'This is very hard for me';
  return activeDomain.value?.scoreLabels?.low || 'Major challenge';
});
const scaleHigh = computed(() => {
  if (educationLevel.value === 'upper-elementary') return 'This is going very well';
  return activeDomain.value?.scoreLabels?.high || 'Strong and consistent';
});
const domainFallbackQuestion = 'How is this area going for you right now?';

const selectedStrategies = computed(() =>
  selectedPriorities.value.map((k) => planDrafts[k]?.strategy).filter(Boolean)
);

const strategyLibrary = computed(() => settings.value.strategyLibrary || {});

function strategiesFor(key) {
  const map = {
    organization: strategyLibrary.value.organization,
    time_management: strategyLibrary.value.timeManagement,
    assignment_completion: strategyLibrary.value.taskCompletion,
    study_skills: strategyLibrary.value.study,
    academic_confidence: strategyLibrary.value.confidence,
    persistence: strategyLibrary.value.confidence,
    stress: strategyLibrary.value.stress,
    teacher_support: strategyLibrary.value.confidence,
    attendance: strategyLibrary.value.timeManagement,
    goals_motivation: strategyLibrary.value.confidence,
    other: strategyLibrary.value.organization
  };
  return map[key] || strategyLibrary.value.organization || [];
}

function priorityLabel(id) {
  return PRIORITY_OPTIONS.find((p) => p.id === id)?.label || id;
}

function ensurePlan(key) {
  if (!planDrafts[key]) {
    planDrafts[key] = {
      goal: '',
      firstAction: '',
      strategy: '',
      supportPerson: '',
      confidenceScore: null
    };
  }
}

function persistGuest() {
  if (!isGuest.value) return;
  try {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({
        step: step.value,
        mode: mode.value,
        educationLevel: educationLevel.value,
        concerns: concerns.value,
        domainIndex: domainIndex.value,
        responses: responses.value,
        selectedPriorities: selectedPriorities.value,
        planDrafts: { ...planDrafts },
        backpackExtras: backpackExtras.value,
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
  [step, mode, educationLevel, concerns, domainIndex, responses, selectedPriorities, backpackExtras],
  () => persistGuest(),
  { deep: true }
);
watch(planDrafts, () => persistGuest(), { deep: true });

function ensureResponse(key) {
  if (!responseMap.value[key]) {
    responses.value = [
      ...responses.value,
      {
        domainKey: key,
        score: null,
        importanceScore: null,
        confidenceScore: null,
        reflectionChips: [],
        supportPreference: 'none',
        note: ''
      }
    ];
  }
}

function patchResponse(key, patch) {
  ensureResponse(key);
  responses.value = responses.value.map((r) => (r.domainKey === key ? { ...r, ...patch } : r));
}

function setScore(n) {
  const key = activeDomain.value?.key;
  if (!key) return;
  patchResponse(key, { score: n });
  const nextResponses = responses.value.map((r) => (r.domainKey === key ? { ...r, score: n } : r));
  const overall = buildStudentSuccessSummary(template.value, nextResponses, {
    mode: mode.value,
    educationLevel: educationLevel.value
  });
  const interp = interpretScore(n, activeDomain.value?.scoreLabels || {});
  liveAnnouncement.value = `${activeDomain.value.label} updated to ${n} out of 10. ${interp}. Student Success Score is now ${overall.studentSuccessScore ?? '—'} out of 100.`;
}

function setImportance(n) {
  patchResponse(activeDomain.value?.key, { importanceScore: n });
}
function setConfidence(n) {
  patchResponse(activeDomain.value?.key, { confidenceScore: n });
}
function toggleChip(chip) {
  const key = activeDomain.value?.key;
  const set = new Set(currentChips.value);
  if (set.has(chip)) set.delete(chip);
  else set.add(chip);
  patchResponse(key, { reflectionChips: [...set] });
}
function setSupport(id) {
  patchResponse(activeDomain.value?.key, { supportPreference: id });
}
function setNote(v) {
  patchResponse(activeDomain.value?.key, { note: v });
}
function toggleConcern(c) {
  const set = new Set(concerns.value);
  if (set.has(c)) set.delete(c);
  else set.add(c);
  concerns.value = [...set];
}
function togglePriority(id) {
  if (selectedPriorities.value.includes(id)) {
    selectedPriorities.value = selectedPriorities.value.filter((k) => k !== id);
  } else if (selectedPriorities.value.length < maxPriorities.value) {
    selectedPriorities.value = [...selectedPriorities.value, id];
    ensurePlan(id);
  }
}
function addTool(item) {
  if (!backpackExtras.value.includes(item)) {
    backpackExtras.value = [...backpackExtras.value, item];
  }
}

function startCheckIn() {
  domainIndex.value = 0;
  if (!activeDomains.value.length) {
    error.value = 'No domains available for this age group and mode.';
    return;
  }
  step.value = 'checkin';
}
function prevDomain() {
  if (domainIndex.value > 0) domainIndex.value -= 1;
}
async function nextDomain() {
  if (domainIndex.value >= activeDomains.value.length - 1) {
    if (assignedToken.value) {
      try {
        await flushStandardGuestAssessment({
          apiPrefix: '/student-success',
          token: assignedToken.value,
          responses: responses.value || [],
          mapResponse: (r) => ({
            domainKey: r.domainKey || r.key,
            ...r
          }),
          completePayload: {}
        });
      } catch (e) {
        error.value = e?.response?.data?.error || e.message || 'Could not save assessment';
        return;
      }
    } else if (typeof persistGuest === 'function') {
      persistGuest();
    }
    step.value = 'complete';
  } else {
    domainIndex.value += 1;
  }
}
function reviewResponses() {
  domainIndex.value = 0;
  step.value = 'checkin';
}
function jumpToDomain(key) {
  const idx = activeDomains.value.findIndex((d) => d.key === key);
  if (idx >= 0) domainIndex.value = idx;
}
function goResults() {
  for (const key of selectedPriorities.value) ensurePlan(key);
  step.value = 'results';
  persistGuest();
}

function buildExport() {
  return {
    type: 'student_success_guest',
    title: 'Student Success Assessment',
    pathwayName: 'Student Success Pathway',
    resultTitle: 'Your Student Success Profile',
    mode: mode.value,
    educationLevel: educationLevel.value,
    concerns: concerns.value,
    exportedAt: new Date().toISOString(),
    summary: summary.value,
    responses: responses.value,
    selectedPriorities: selectedPriorities.value,
    plans: selectedPriorities.value.map((key) => ({
      domainKey: key,
      label: priorityLabel(key),
      ...(planDrafts[key] || {})
    })),
    backpack: backpack.value,
    disclaimer: settings.value.disclaimer
  };
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `student-success-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function downloadPdf() {
  window.print();
}

function resetGuest() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    // ignore
  }
  responses.value = [];
  selectedPriorities.value = [];
  backpackExtras.value = [];
  concerns.value = [];
  domainIndex.value = 0;
  mode.value = 'full';
  educationLevel.value = 'high-school';
  Object.keys(planDrafts).forEach((k) => delete planDrafts[k]);
  step.value = 'welcome';
  liveAnnouncement.value = '';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/student-success/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value =
        'Student Success template is not available yet. Run migration 920 on the database.';
      return;
    }
    if (isGuest.value) {
      try {
        const raw = localStorage.getItem(GUEST_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.mode) mode.value = cached.mode;
          if (cached?.educationLevel) educationLevel.value = cached.educationLevel;
          if (cached?.concerns) concerns.value = cached.concerns;
          if (cached?.responses) responses.value = cached.responses;
          if (cached?.selectedPriorities) {
            selectedPriorities.value = cached.selectedPriorities;
            for (const k of cached.selectedPriorities) ensurePlan(k);
          }
          if (cached?.planDrafts) {
            for (const [k, v] of Object.entries(cached.planDrafts)) {
              planDrafts[k] = { ...v };
            }
          }
          if (cached?.backpackExtras) backpackExtras.value = cached.backpackExtras;
          if (cached?.step) step.value = cached.step;
          if (typeof cached?.domainIndex === 'number') domainIndex.value = cached.domainIndex;
        }
      } catch {
        // ignore
      }
    }
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || 'Could not load assessment';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.ss-page {
  --ss-ink: #0f172a;
  --ss-muted: #64748b;
  --ss-line: #dbe3f0;
  --ss-accent: #0ea5e9;
  min-height: 100vh;
  background:
    radial-gradient(1000px 420px at 8% -8%, #fde68a88, transparent 55%),
    radial-gradient(900px 380px at 92% 0%, #a5f3fc66, transparent 50%),
    linear-gradient(180deg, #f8fafc, #fff 42%, #eef2ff);
  color: var(--ss-ink);
  font-family: 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif;
  padding: 1.25rem 1rem 3rem;
}
.ss-page--young {
  background:
    radial-gradient(900px 380px at 10% -5%, #bbf7d088, transparent 55%),
    radial-gradient(800px 360px at 90% 0%, #fde68a77, transparent 50%),
    linear-gradient(180deg, #ecfeff, #fff 45%, #f0fdf4);
}

.ss-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--ss-muted);
}
.ss-state.error {
  color: #b91c1c;
}

.ss-shell {
  max-width: 1100px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--ss-line);
  border-radius: 20px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
}
.ss-shell--narrow {
  max-width: 640px;
}
.ss-shell--wide {
  max-width: 1180px;
}

.ss-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ss-muted);
  font-weight: 700;
}
.ss-save {
  margin-left: 0.75rem;
  letter-spacing: 0;
  text-transform: none;
  font-weight: 600;
  color: #059669;
}
.ss-title {
  margin: 0.35rem 0 0.5rem;
  font-size: clamp(1.55rem, 3vw, 2.15rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.ss-lead {
  margin: 0;
  color: #334155;
  line-height: 1.55;
  font-size: 1.02rem;
}
.ss-note,
.ss-meta {
  color: var(--ss-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}
.ss-meta {
  margin-top: 1rem;
  font-weight: 600;
}

.ss-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.5rem;
}
.ss-btn {
  appearance: none;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: var(--ss-ink);
  font-weight: 700;
  font-size: 0.95rem;
  padding: 0.7rem 1.15rem;
  cursor: pointer;
}
.ss-btn.primary {
  background: linear-gradient(135deg, #0369a1, #14b8a6);
  border-color: transparent;
  color: #fff;
}
.ss-btn.ghost {
  background: transparent;
}
.ss-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ss-btn:focus-visible {
  outline: 2px solid var(--ss-accent);
  outline-offset: 2px;
}

.ss-list {
  padding-left: 1.2rem;
  color: #334155;
  line-height: 1.55;
}

.ss-field,
.ss-note-field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ss-muted);
  margin-top: 1rem;
}
.ss-field select,
.ss-field input,
.ss-note-field textarea {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  font: inherit;
  color: var(--ss-ink);
}
.ss-field-label {
  margin: 1.15rem 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ss-muted);
}

.ss-mode-grid {
  display: grid;
  gap: 0.65rem;
}
.ss-mode {
  text-align: left;
  border: 1px solid var(--ss-line);
  border-radius: 14px;
  background: #fff;
  padding: 0.9rem 1rem;
  cursor: pointer;
  display: grid;
  gap: 0.25rem;
}
.ss-mode strong {
  font-size: 1rem;
}
.ss-mode span {
  color: var(--ss-muted);
  font-size: 0.88rem;
}
.ss-mode em {
  font-style: normal;
  font-size: 0.75rem;
  font-weight: 700;
  color: #0f766e;
}
.ss-mode.on {
  border-color: #14b8a6;
  box-shadow: 0 0 0 2px #99f6e4;
}

.ss-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.ss-chip {
  appearance: none;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.ss-chip.on {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}
.ss-chip:disabled {
  opacity: 0.4;
}

.ss-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}
.ss-count {
  flex-shrink: 0;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  padding: 0.65rem 0.85rem;
  font-size: 0.82rem;
  font-weight: 700;
}
.ss-count--score {
  text-align: center;
  min-width: 5.5rem;
}
.ss-count--score strong {
  display: block;
  font-size: 1.6rem;
  line-height: 1;
}
.ss-progress {
  height: 6px;
  background: #e2e8f0;
  border-radius: 999px;
  margin: 1rem 0 1.25rem;
  overflow: hidden;
}
.ss-progress > div {
  height: 100%;
  background: linear-gradient(90deg, #0369a1, #14b8a6);
  transition: width 0.3s ease;
}

.ss-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 1.25rem;
  align-items: start;
}
.ss-side {
  position: sticky;
  top: 1rem;
  display: grid;
  gap: 0.85rem;
}
.ss-mobile-score {
  display: none;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  color: var(--ss-muted);
}
.ss-mobile-score strong {
  color: var(--ss-ink);
  font-size: 1.2rem;
}

.ss-q {
  margin: 0 0 0.65rem;
  font-size: 1.2rem;
}
.ss-scale-ends {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--ss-muted);
  margin-bottom: 0.45rem;
}
.ss-score-row {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.35rem;
}
.ss-score-row--sm .ss-score-btn {
  min-height: 38px;
  font-size: 0.85rem;
}
.ss-score-btn {
  appearance: none;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 10px;
  min-height: 44px;
  font-weight: 800;
  cursor: pointer;
  color: #0f172a;
}
.ss-score-btn.active {
  color: #fff;
  background: #0f172a;
  border-color: #0f172a;
}
.ss-score-btn:focus-visible {
  outline: 2px solid var(--ss-accent);
  outline-offset: 2px;
}

.ss-interp {
  margin: 0.85rem 0 0;
  font-weight: 600;
}
.ss-reflect {
  margin-top: 1.15rem;
  display: grid;
  gap: 0.65rem;
}
.ss-reflect h3 {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
}
.ss-support {
  display: grid;
  gap: 0.35rem;
}
.ss-support__opt {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  font-size: 0.9rem;
  cursor: pointer;
}

.ss-side-card,
.ss-panel,
.ss-plan-card {
  background: #fff;
  border: 1px solid var(--ss-line);
  border-radius: 14px;
  padding: 0.95rem 1rem;
}
.ss-side-card h3 {
  margin: 0 0 0.25rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ss-muted);
}
.ss-side-card > p {
  margin: 0 0 0.75rem;
  font-weight: 700;
}
.ss-backpack-mini {
  margin-top: 0.35rem;
}

.ss-footer {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1.35rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ss-line);
  position: sticky;
  bottom: 0;
  background: linear-gradient(180deg, transparent, #fff 30%);
  padding-bottom: 0.25rem;
}

.ss-complete {
  text-align: center;
}
.ss-complete-score {
  margin: 1rem 0 0.5rem;
  font-size: 3.4rem;
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1;
}
.ss-complete-score small {
  font-size: 1.1rem;
  color: var(--ss-muted);
  font-weight: 700;
}
.ss-status-pill {
  display: inline-block;
  background: #0f172a;
  color: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-weight: 700;
  font-size: 0.9rem;
}
.ss-complete-meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin: 1.25rem 0;
  text-align: left;
}
.ss-complete-meta dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ss-muted);
}
.ss-complete-meta dd {
  margin: 0.2rem 0 0;
  font-weight: 700;
}

.ss-plan-card {
  margin-top: 1rem;
}
.ss-plan-card h3 {
  margin: 0 0 0.5rem;
}
.ss-plan-summary {
  margin-bottom: 1rem;
}
.ss-plan-summary h3 {
  margin: 0 0 0.35rem;
}
.ss-plan-summary p {
  margin: 0.2rem 0;
  font-size: 0.92rem;
}

.ss-results-grid {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 1rem;
  margin: 1rem 0;
}
.ss-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 1rem 0;
}
.ss-panel h2 {
  margin: 0 0 0.55rem;
  font-size: 1rem;
}
.ss-panel ul {
  margin: 0;
  padding-left: 1.1rem;
  line-height: 1.55;
}

@media (max-width: 900px) {
  .ss-layout,
  .ss-results-grid,
  .ss-two {
    grid-template-columns: 1fr;
  }
  .ss-side {
    position: static;
    order: -1;
  }
  .ss-side :deep(.ssp) {
    display: none;
  }
  .ss-mobile-score {
    display: block;
  }
  .ss-complete-meta {
    grid-template-columns: 1fr;
  }
  .ss-btn--sticky {
    flex: 1;
  }
}

@media print {
  .ss-page {
    background: #fff;
    padding: 0;
  }
  .ss-actions,
  .ss-footer,
  .ss-save {
    display: none !important;
  }
  .ss-shell {
    box-shadow: none;
    border: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ss-progress > div {
    transition: none;
  }
}
</style>
