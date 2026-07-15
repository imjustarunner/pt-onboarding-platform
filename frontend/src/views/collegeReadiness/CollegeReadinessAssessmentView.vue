<template>
  <div class="cr-page">
    <div v-if="loading" class="cr-state">Loading College Readiness Assessment…</div>
    <div v-else-if="error" class="cr-state error">{{ error }}</div>
    <template v-else-if="template">
      <section v-if="step === 'welcome'" class="cr-shell cr-shell--narrow">
        <p class="cr-eyebrow">College Readiness Assessment</p>
        <h1 class="cr-title">How Ready Are You for College?</h1>
        <p class="cr-lead">
          College readiness includes more than grades. It also involves managing time, asking for help,
          understanding finances, navigating new systems, caring for yourself, and building support.
        </p>
        <p class="cr-note">
          You do not need to have everything figured out. This assessment will help you identify what is
          already in place and what you can prepare next. It is not an admissions test.
        </p>
        <p class="cr-meta">About 12–18 minutes</p>
        <div class="cr-actions">
          <button type="button" class="cr-btn primary" @click="step = 'context'">
            Build My College Launch Plan
          </button>
          <button type="button" class="cr-btn ghost" @click="step = 'how'">How This Assessment Works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="cr-shell cr-shell--narrow">
        <h1 class="cr-title">How This Assessment Works</h1>
        <ol class="cr-list">
          <li>Choose your student version and assessment mode.</li>
          <li>Rate readiness, confidence, and support availability for each domain.</li>
          <li>Watch your College Launchpad illuminate as you progress.</li>
          <li>Build a checklist, pick priorities, and create a launch plan.</li>
          <li>Download or share your College Readiness Plan.</li>
        </ol>
        <p class="cr-note">
          On this public guest check-in, responses stay on this device unless you download them. Inside a
          program, authorized adults may view responses based on permissions.
        </p>
        <div class="cr-actions">
          <button type="button" class="cr-btn primary" @click="step = 'context'">Continue</button>
          <button type="button" class="cr-btn ghost" @click="step = 'welcome'">Back</button>
        </div>
      </section>

      <section v-else-if="step === 'context'" class="cr-shell cr-shell--narrow">
        <p class="cr-eyebrow">Before you begin</p>
        <h1 class="cr-title">Tell us about your college path</h1>

        <label class="cr-field">
          Student version
          <select v-model="studentVersion">
            <option v-for="v in STUDENT_VERSIONS" :key="v.id" :value="v.id">{{ v.label }}</option>
          </select>
        </label>

        <p class="cr-field-label">Assessment mode</p>
        <div class="cr-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="cr-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>

        <p class="cr-field-label">Primary concerns (optional)</p>
        <div class="cr-chips">
          <button
            v-for="c in CONCERN_OPTIONS"
            :key="c"
            type="button"
            class="cr-chip"
            :class="{ on: concerns.includes(c) }"
            @click="toggleConcern(c)"
          >
            {{ c }}
          </button>
        </div>

        <div class="cr-actions">
          <button type="button" class="cr-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="cr-btn primary" @click="startCheckIn">Begin launchpad →</button>
        </div>
      </section>

      <section v-else-if="step === 'checkin' && activeDomain" class="cr-shell cr-shell--wide">
        <header class="cr-header">
          <div>
            <p class="cr-eyebrow">
              College Readiness · {{ versionLabel }} · {{ modeLabel }}
              <span class="cr-save">{{ saveStatus }}</span>
            </p>
            <h1 class="cr-title">{{ activeDomain.label }}</h1>
            <p class="cr-lead">{{ activeDomain.definition }}</p>
          </div>
          <div class="cr-count">{{ scoredCount }} of {{ activeDomains.length }} completed</div>
        </header>
        <div class="cr-progress"><div :style="{ width: progressPct + '%' }" /></div>

        <div class="cr-layout">
          <div class="cr-main">
            <div class="cr-mobile-score" aria-live="polite">
              Readiness
              <strong>{{ summary.collegeReadinessScore ?? '—' }}</strong>
              <span v-if="summary.collegeReadinessStatus">· {{ summary.collegeReadinessStatus }}</span>
            </div>

            <h2 class="cr-q">{{ activeDomain.primaryQuestion }}</h2>
            <div class="cr-scale-ends">
              <span>{{ activeDomain.scoreLabels?.low || 'Not prepared yet' }}</span>
              <span>{{ activeDomain.scoreLabels?.high || 'Highly prepared' }}</span>
            </div>
            <div class="cr-score-row" role="radiogroup" :aria-label="`${activeDomain.label} readiness`">
              <button
                v-for="n in 10"
                :key="n"
                type="button"
                class="cr-score-btn"
                :class="{ active: currentReadiness === n }"
                :style="
                  currentReadiness === n
                    ? { background: activeDomain.color, borderColor: activeDomain.color }
                    : null
                "
                role="radio"
                :aria-checked="currentReadiness === n"
                @click="setReadiness(n)"
              >
                {{ n }}
              </button>
            </div>

            <p v-if="liveAnnouncement" class="cr-interp" role="status" aria-live="polite">
              {{ liveAnnouncement }}
            </p>

            <div v-if="currentReadiness != null" class="cr-reflect">
              <template v-if="enableConfidence">
                <h3>How confident are you that you can manage this area?</h3>
                <div class="cr-scale-ends">
                  <span>Not confident yet</span>
                  <span>Highly confident</span>
                </div>
                <div class="cr-score-row cr-score-row--sm" role="radiogroup" aria-label="Confidence">
                  <button
                    v-for="n in 10"
                    :key="`c-${n}`"
                    type="button"
                    class="cr-score-btn"
                    :class="{ active: currentConfidence === n }"
                    role="radio"
                    :aria-checked="currentConfidence === n"
                    @click="setConfidence(n)"
                  >
                    {{ n }}
                  </button>
                </div>
              </template>

              <template v-if="enableSupport">
                <h3>How confident are you that you know where to get help?</h3>
                <div class="cr-scale-ends">
                  <span>Unsure where to get help</span>
                  <span>Clear and accessible support</span>
                </div>
                <div class="cr-score-row cr-score-row--sm" role="radiogroup" aria-label="Support availability">
                  <button
                    v-for="n in 10"
                    :key="`s-${n}`"
                    type="button"
                    class="cr-score-btn"
                    :class="{ active: currentSupportAvail === n }"
                    role="radio"
                    :aria-checked="currentSupportAvail === n"
                    @click="setSupportAvail(n)"
                  >
                    {{ n }}
                  </button>
                </div>
              </template>

              <p v-if="gapInsight" class="cr-gap">{{ gapInsight }}</p>

              <h3>{{ activeDomain.reflectionPrompt || 'What stands out?' }}</h3>
              <div class="cr-chips">
                <button
                  v-for="chip in reflectionOptions"
                  :key="chip"
                  type="button"
                  class="cr-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>

              <p
                v-if="activeDomain.key === 'financial_readiness'"
                class="cr-note"
              >
                {{ settings.financialDisclaimer }}
              </p>

              <h3>Would support in this area be useful?</h3>
              <div class="cr-support" role="radiogroup" aria-label="Support preference">
                <label v-for="opt in SUPPORT_OPTIONS" :key="opt.id" class="cr-support__opt">
                  <input
                    type="radio"
                    :name="`support-${activeDomain.key}`"
                    :value="opt.id"
                    :checked="currentSupportPref === opt.id"
                    @change="setSupportPref(opt.id)"
                  />
                  {{ opt.label }}
                </label>
              </div>

              <label class="cr-note-field">
                Optional note
                <textarea
                  :value="currentNote"
                  rows="2"
                  placeholder="Anything a counselor or advisor should know…"
                  @input="setNote($event.target.value)"
                />
              </label>
            </div>
          </div>

          <aside class="cr-side">
            <CollegeLaunchpad
              :domains="activeDomains"
              :responses="responses"
              :college-readiness-score="summary.collegeReadinessScore"
              :system-scores="summary.systemScores"
              :stage-progress="summary.stageProgress"
              :active-domain-id="activeDomain.key"
              :priority-keys="selectedPriorities"
              :upcoming-deadline="upcomingDeadlineLabel"
              interactive
              @domain-select="jumpToDomain"
            />
          </aside>
        </div>

        <footer class="cr-footer">
          <button type="button" class="cr-btn ghost" :disabled="domainIndex === 0" @click="prevDomain">
            Back
          </button>
          <button
            type="button"
            class="cr-btn primary cr-btn--sticky"
            :disabled="currentReadiness == null"
            @click="nextDomain"
          >
            {{
              domainIndex >= activeDomains.length - 1
                ? 'Finish launchpad →'
                : `Continue to ${nextDomainLabel} →`
            }}
          </button>
        </footer>
      </section>

      <section v-else-if="step === 'complete'" class="cr-shell cr-shell--narrow cr-complete">
        <p class="cr-eyebrow">Launchpad complete</p>
        <h1 class="cr-title">Your College Readiness Plan Is Ready</h1>
        <div class="cr-complete-score">
          <span>{{ summary.collegeReadinessScore ?? '—' }}</span>
          <small>/ 100</small>
        </div>
        <p class="cr-status-pill">{{ summary.collegeReadinessStatus }}</p>
        <dl class="cr-complete-meta">
          <div>
            <dt>Strongest area</dt>
            <dd>{{ summary.strongest?.[0]?.label || '—' }}</dd>
          </div>
          <div>
            <dt>Priority preparation</dt>
            <dd>{{ summary.needingSupport?.[0]?.label || '—' }}</dd>
          </div>
          <div>
            <dt>Current launch stage</dt>
            <dd>{{ stageName(summary.currentLaunchStage) }}</dd>
          </div>
          <div>
            <dt>Checklist progress</dt>
            <dd>{{ checklistCompleted }} of {{ checklistItems.length }}</dd>
          </div>
        </dl>
        <p class="cr-note">
          College readiness grows through preparation, practice, and knowing how to use support. Your plan
          shows what is already in place and what to complete next.
        </p>
        <div class="cr-actions">
          <button type="button" class="cr-btn primary" @click="goPriorities">
            Explore My College Readiness Plan
          </button>
          <button type="button" class="cr-btn ghost" @click="reviewResponses">Review My Responses</button>
        </div>
      </section>

      <section v-else-if="step === 'priorities'" class="cr-shell cr-shell--narrow">
        <p class="cr-eyebrow">College Launch Plan</p>
        <h1 class="cr-title">Choose what to prepare next</h1>
        <p class="cr-lead">
          Which areas would most improve your college readiness? Pick up to {{ maxPriorities }}.
        </p>
        <div class="cr-chips">
          <button
            v-for="p in PRIORITY_OPTIONS"
            :key="p.id"
            type="button"
            class="cr-chip"
            :class="{ on: selectedPriorities.includes(p.id) }"
            :disabled="!selectedPriorities.includes(p.id) && selectedPriorities.length >= maxPriorities"
            @click="togglePriority(p.id)"
          >
            {{ p.label }}
          </button>
        </div>

        <div v-for="key in selectedPriorities" :key="key" class="cr-plan-card">
          <h3>{{ priorityLabel(key) }}</h3>
          <label class="cr-field">
            Desired outcome
            <input v-model="planDrafts[key].desiredOutcome" type="text" placeholder="What will be true when this is ready?" />
          </label>
          <label class="cr-field">
            Next action
            <input v-model="planDrafts[key].nextAction" type="text" placeholder="One clear next step" />
          </label>
          <label class="cr-field">
            Support person
            <input v-model="planDrafts[key].supportPerson" type="text" placeholder="Counselor, advisor, mentor, family…" />
          </label>
          <label class="cr-field">
            Due date
            <input v-model="planDrafts[key].dueDate" type="date" />
          </label>
          <label class="cr-field">
            Confidence (1–10)
            <input v-model.number="planDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="planDrafts[key].confidenceScore && planDrafts[key].confidenceScore < 7" class="cr-note">
            What would make this first step smaller, clearer, or easier to begin?
          </p>
        </div>

        <label class="cr-field">
          Upcoming deadline to track
          <input v-model="deadlineDraft" type="text" placeholder="e.g. FAFSA / financial-aid application" />
        </label>

        <div class="cr-actions">
          <button type="button" class="cr-btn ghost" @click="step = 'complete'">Back</button>
          <button type="button" class="cr-btn primary" @click="goResults">View my plan →</button>
        </div>
      </section>

      <section v-else-if="step === 'results'" class="cr-shell cr-shell--wide cr-results">
        <header class="cr-header">
          <div>
            <p class="cr-eyebrow">College Readiness Assessment</p>
            <h1 class="cr-title">Your College Readiness Plan</h1>
            <p class="cr-lead">
              This plan shows the strengths, preparation needs, support resources, and next steps that can
              help you move toward college with greater confidence.
            </p>
          </div>
          <div class="cr-count cr-count--score">
            <strong>{{ summary.collegeReadinessScore ?? '—' }}</strong>
            <span>{{ summary.collegeReadinessStatus }}</span>
          </div>
        </header>

        <div class="cr-results-grid">
          <CollegeLaunchpad
            :domains="activeDomains"
            :responses="responses"
            :college-readiness-score="summary.collegeReadinessScore"
            :system-scores="summary.systemScores"
            :stage-progress="summary.stageProgress"
            :priority-keys="selectedPriorities"
            :upcoming-deadline="upcomingDeadlineLabel"
            title="Completed launch sequence"
          />
          <div class="cr-results-side">
            <CollegeIndependenceMeter :domains="activeDomains" :responses="responses" />
            <CollegeReadinessChecklistBoard
              :items="checklistItems"
              interactive
              @update-item="updateChecklistItem"
            />
          </div>
        </div>

        <div class="cr-two">
          <div class="cr-panel">
            <h2>Current strengths</h2>
            <ul>
              <li v-for="s in summary.strongest" :key="s.domainKey">
                <span :style="{ color: s.color }">{{ s.label }}</span> — {{ s.readinessScore }}/10
              </li>
            </ul>
          </div>
          <div class="cr-panel">
            <h2>Priority preparation areas</h2>
            <ul>
              <li v-for="s in summary.needingSupport" :key="s.domainKey">
                <span :style="{ color: s.color }">{{ s.label }}</span> — {{ s.readinessScore }}/10
              </li>
            </ul>
          </div>
        </div>

        <div v-if="summary.insights?.length" class="cr-panel">
          <h2>Insights</h2>
          <ul>
            <li v-for="(ins, i) in summary.insights" :key="i">{{ ins }}</li>
          </ul>
        </div>

        <div v-if="summary.indicators?.length" class="cr-panel">
          <h2>Patterns worth reviewing</h2>
          <ul>
            <li v-for="ind in summary.indicators" :key="ind.key">{{ ind.message }}</li>
          </ul>
        </div>

        <div v-if="selectedPriorities.length" class="cr-panel">
          <h2>Your College Launch Plan</h2>
          <div v-for="key in selectedPriorities" :key="`plan-${key}`" class="cr-plan-summary">
            <h3>{{ priorityLabel(key) }}</h3>
            <p><strong>Outcome:</strong> {{ planDrafts[key]?.desiredOutcome || '—' }}</p>
            <p><strong>Next action:</strong> {{ planDrafts[key]?.nextAction || '—' }}</p>
            <p><strong>Support:</strong> {{ planDrafts[key]?.supportPerson || '—' }}</p>
            <p><strong>Due:</strong> {{ planDrafts[key]?.dueDate || '—' }}</p>
          </div>
        </div>

        <p class="cr-note">{{ settings.disclaimer }}</p>

        <div class="cr-actions">
          <button type="button" class="cr-btn primary" @click="downloadPdf">Download / print PDF</button>
          <button type="button" class="cr-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="cr-btn ghost" @click="resetGuest">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import CollegeLaunchpad from '../../components/collegeReadiness/CollegeLaunchpad.vue';
import CollegeReadinessChecklistBoard from '../../components/collegeReadiness/CollegeReadinessChecklistBoard.vue';
import CollegeIndependenceMeter from '../../components/collegeReadiness/CollegeIndependenceMeter.vue';
import {
  STUDENT_VERSIONS,
  MODE_OPTIONS,
  SUPPORT_OPTIONS,
  PRIORITY_OPTIONS,
  CONCERN_OPTIONS,
  LAUNCH_STAGES,
  domainsForContext,
  interpretScore,
  buildCollegeReadinessSummary,
  buildSuggestedChecklist,
  calculateCollegeConfidenceGap,
  calculateCollegeSupportGap
} from '../../utils/collegeReadiness.js';

const route = useRoute();
const isGuest = computed(() => !!route.meta?.guestCollegeReadiness);
const GUEST_KEY = 'cr-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const mode = ref('full');
const studentVersion = ref('senior');
const concerns = ref([]);
const domainIndex = ref(0);
const responses = ref([]);
const saveStatus = ref('');
const selectedPriorities = ref([]);
const checklistItems = ref([]);
const deadlineDraft = ref('Financial-aid application');
const liveAnnouncement = ref('');
const planDrafts = reactive({});

const settings = computed(() => template.value?.settings || {});
const enableConfidence = computed(() => settings.value.enableConfidence !== false);
const enableSupport = computed(() => settings.value.enableSupportAvailability !== false);
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 3));

const activeDomains = computed(() =>
  domainsForContext(template.value, { mode: mode.value, studentVersion: studentVersion.value })
);
const activeDomain = computed(() => activeDomains.value[domainIndex.value] || null);
const responseMap = computed(() => {
  const m = {};
  for (const r of responses.value) m[r.domainKey] = r;
  return m;
});

const currentReadiness = computed(
  () => responseMap.value[activeDomain.value?.key]?.readinessScore ?? null
);
const currentConfidence = computed(
  () => responseMap.value[activeDomain.value?.key]?.confidenceScore ?? null
);
const currentSupportAvail = computed(
  () => responseMap.value[activeDomain.value?.key]?.supportAvailabilityScore ?? null
);
const currentChips = computed(
  () => responseMap.value[activeDomain.value?.key]?.reflectionChips || []
);
const currentSupportPref = computed(
  () => responseMap.value[activeDomain.value?.key]?.supportPreference || 'none'
);
const currentNote = computed(() => responseMap.value[activeDomain.value?.key]?.note || '');
const reflectionOptions = computed(() => activeDomain.value?.reflectionOptions || []);

const summary = computed(() =>
  buildCollegeReadinessSummary(template.value, responses.value, {
    mode: mode.value,
    studentVersion: studentVersion.value
  })
);

const scoredCount = computed(
  () => activeDomains.value.filter((d) => responseMap.value[d.key]?.readinessScore != null).length
);
const progressPct = computed(() => {
  if (!activeDomains.value.length) return 0;
  return Math.round((scoredCount.value / activeDomains.value.length) * 100);
});
const modeLabel = computed(() => MODE_OPTIONS.find((m) => m.id === mode.value)?.label || mode.value);
const versionLabel = computed(
  () => STUDENT_VERSIONS.find((v) => v.id === studentVersion.value)?.label || studentVersion.value
);
const nextDomainLabel = computed(() => {
  const next = activeDomains.value[domainIndex.value + 1];
  return next?.shortLabel || next?.label || 'next';
});
const checklistCompleted = computed(
  () => checklistItems.value.filter((i) => i.status === 'completed').length
);
const upcomingDeadlineLabel = computed(() => deadlineDraft.value || '');

const gapInsight = computed(() => {
  const r = currentReadiness.value;
  const c = currentConfidence.value;
  const s = currentSupportAvail.value;
  if (r == null) return '';
  const cg = calculateCollegeConfidenceGap(r, c);
  if (cg != null && cg >= 2) {
    return 'Your responses suggest you may be more prepared than you currently feel.';
  }
  if (cg != null && cg <= -2) {
    return 'Confidence appears stronger than current preparation — a small practice step may help.';
  }
  const sg = calculateCollegeSupportGap(r, s);
  if (sg != null && sg >= 2) {
    return 'You may have skills in place but still be unsure where to seek help.';
  }
  return '';
});

function stageName(key) {
  return LAUNCH_STAGES.find((s) => s.key === key)?.label || key;
}
function priorityLabel(id) {
  return PRIORITY_OPTIONS.find((p) => p.id === id)?.label || id;
}
function ensurePlan(key) {
  if (!planDrafts[key]) {
    planDrafts[key] = {
      desiredOutcome: '',
      nextAction: '',
      supportPerson: '',
      dueDate: '',
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
        studentVersion: studentVersion.value,
        concerns: concerns.value,
        domainIndex: domainIndex.value,
        responses: responses.value,
        selectedPriorities: selectedPriorities.value,
        checklistItems: checklistItems.value,
        deadlineDraft: deadlineDraft.value,
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
  [
    step,
    mode,
    studentVersion,
    concerns,
    domainIndex,
    responses,
    selectedPriorities,
    checklistItems,
    deadlineDraft
  ],
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
        readinessScore: null,
        confidenceScore: null,
        supportAvailabilityScore: null,
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

function setReadiness(n) {
  const key = activeDomain.value?.key;
  if (!key) return;
  patchResponse(key, { readinessScore: n });
  const next = responses.value.map((r) => (r.domainKey === key ? { ...r, readinessScore: n } : r));
  const overall = buildCollegeReadinessSummary(template.value, next, {
    mode: mode.value,
    studentVersion: studentVersion.value
  });
  const interp = interpretScore(n, activeDomain.value?.scoreLabels || {});
  liveAnnouncement.value = `${activeDomain.value.label} updated to ${n} out of 10. ${interp}. College Readiness Score is now ${overall.collegeReadinessScore ?? '—'} out of 100.`;
  refreshChecklist(next);
}

function setConfidence(n) {
  patchResponse(activeDomain.value?.key, { confidenceScore: n });
}
function setSupportAvail(n) {
  patchResponse(activeDomain.value?.key, { supportAvailabilityScore: n });
}
function toggleChip(chip) {
  const key = activeDomain.value?.key;
  const set = new Set(currentChips.value);
  if (set.has(chip)) set.delete(chip);
  else set.add(chip);
  patchResponse(key, { reflectionChips: [...set] });
}
function setSupportPref(id) {
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

function refreshChecklist(resp = responses.value) {
  const suggested = buildSuggestedChecklist(activeDomains.value, resp);
  const existing = Object.fromEntries(checklistItems.value.map((i) => [i.id, i]));
  checklistItems.value = suggested.map((item) => existing[item.id] || item);
}

function updateChecklistItem(item) {
  checklistItems.value = checklistItems.value.map((i) => (i.id === item.id ? item : i));
}

function startCheckIn() {
  domainIndex.value = 0;
  if (!activeDomains.value.length) {
    error.value = 'No domains available for this version and mode.';
    return;
  }
  step.value = 'checkin';
}
function prevDomain() {
  if (domainIndex.value > 0) domainIndex.value -= 1;
}
function nextDomain() {
  if (domainIndex.value >= activeDomains.value.length - 1) {
    refreshChecklist();
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
function goPriorities() {
  if (summary.value.needingSupport?.[0] && !selectedPriorities.value.length) {
    const key = summary.value.needingSupport[0].domainKey;
    if (PRIORITY_OPTIONS.some((p) => p.id === key)) {
      selectedPriorities.value = [key];
      ensurePlan(key);
    }
  }
  step.value = 'priorities';
}
function goResults() {
  for (const key of selectedPriorities.value) ensurePlan(key);
  step.value = 'results';
  persistGuest();
}

function buildExport() {
  return {
    type: 'college_readiness_guest',
    title: 'College Readiness Assessment',
    launchpadName: 'College Launchpad',
    resultTitle: 'Your College Readiness Plan',
    mode: mode.value,
    studentVersion: studentVersion.value,
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
    checklist: checklistItems.value,
    deadline: deadlineDraft.value,
    disclaimer: settings.value.disclaimer
  };
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `college-readiness-${new Date().toISOString().slice(0, 10)}.json`;
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
  checklistItems.value = [];
  concerns.value = [];
  domainIndex.value = 0;
  mode.value = 'full';
  studentVersion.value = 'senior';
  deadlineDraft.value = 'Financial-aid application';
  Object.keys(planDrafts).forEach((k) => delete planDrafts[k]);
  step.value = 'welcome';
  liveAnnouncement.value = '';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/college-readiness/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value =
        'College Readiness template is not available yet. Run migration 921 on the database.';
      return;
    }
    if (isGuest.value) {
      try {
        const raw = localStorage.getItem(GUEST_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.mode) mode.value = cached.mode;
          if (cached?.studentVersion) studentVersion.value = cached.studentVersion;
          if (cached?.concerns) concerns.value = cached.concerns;
          if (cached?.responses) responses.value = cached.responses;
          if (cached?.checklistItems) checklistItems.value = cached.checklistItems;
          if (cached?.deadlineDraft) deadlineDraft.value = cached.deadlineDraft;
          if (cached?.selectedPriorities) {
            selectedPriorities.value = cached.selectedPriorities;
            for (const k of cached.selectedPriorities) ensurePlan(k);
          }
          if (cached?.planDrafts) {
            for (const [k, v] of Object.entries(cached.planDrafts)) {
              planDrafts[k] = { ...v };
            }
          }
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
.cr-page {
  --cr-ink: #0f172a;
  --cr-muted: #64748b;
  --cr-line: #dbe3f0;
  --cr-accent: #0ea5e9;
  min-height: 100vh;
  background:
    radial-gradient(1100px 420px at 8% -8%, #67e8f988, transparent 55%),
    radial-gradient(900px 380px at 92% 0%, #c4b5fd66, transparent 50%),
    linear-gradient(180deg, #f1f5f9, #fff 42%, #eef2ff);
  color: var(--cr-ink);
  font-family: 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif;
  padding: 1.25rem 1rem 3rem;
}

.cr-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--cr-muted);
}
.cr-state.error {
  color: #b91c1c;
}

.cr-shell {
  max-width: 1100px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--cr-line);
  border-radius: 20px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
}
.cr-shell--narrow {
  max-width: 640px;
}
.cr-shell--wide {
  max-width: 1180px;
}

.cr-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--cr-muted);
  font-weight: 700;
}
.cr-save {
  margin-left: 0.75rem;
  letter-spacing: 0;
  text-transform: none;
  font-weight: 600;
  color: #059669;
}
.cr-title {
  margin: 0.35rem 0 0.5rem;
  font-size: clamp(1.55rem, 3vw, 2.15rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.cr-lead {
  margin: 0;
  color: #334155;
  line-height: 1.55;
  font-size: 1.02rem;
}
.cr-note,
.cr-meta {
  color: var(--cr-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}
.cr-meta {
  margin-top: 1rem;
  font-weight: 600;
}
.cr-list {
  padding-left: 1.2rem;
  color: #334155;
  line-height: 1.55;
}

.cr-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.5rem;
}
.cr-btn {
  appearance: none;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: var(--cr-ink);
  font-weight: 700;
  font-size: 0.95rem;
  padding: 0.7rem 1.15rem;
  cursor: pointer;
}
.cr-btn.primary {
  background: linear-gradient(135deg, #0f766e, #0ea5e9);
  border-color: transparent;
  color: #fff;
}
.cr-btn.ghost {
  background: transparent;
}
.cr-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.cr-btn:focus-visible {
  outline: 2px solid var(--cr-accent);
  outline-offset: 2px;
}

.cr-field,
.cr-note-field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--cr-muted);
  margin-top: 1rem;
}
.cr-field select,
.cr-field input,
.cr-note-field textarea {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  font: inherit;
  color: var(--cr-ink);
}
.cr-field-label {
  margin: 1.15rem 0 0.5rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--cr-muted);
}

.cr-mode-grid {
  display: grid;
  gap: 0.65rem;
}
.cr-mode {
  text-align: left;
  border: 1px solid var(--cr-line);
  border-radius: 14px;
  background: #fff;
  padding: 0.9rem 1rem;
  cursor: pointer;
  display: grid;
  gap: 0.25rem;
}
.cr-mode span {
  color: var(--cr-muted);
  font-size: 0.88rem;
}
.cr-mode em {
  font-style: normal;
  font-size: 0.75rem;
  font-weight: 700;
  color: #0f766e;
}
.cr-mode.on {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 2px #bae6fd;
}

.cr-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.cr-chip {
  appearance: none;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.cr-chip.on {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}
.cr-chip:disabled {
  opacity: 0.4;
}

.cr-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}
.cr-count {
  flex-shrink: 0;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  padding: 0.65rem 0.85rem;
  font-size: 0.82rem;
  font-weight: 700;
}
.cr-count--score {
  text-align: center;
  min-width: 5.5rem;
}
.cr-count--score strong {
  display: block;
  font-size: 1.6rem;
  line-height: 1;
}
.cr-progress {
  height: 6px;
  background: #e2e8f0;
  border-radius: 999px;
  margin: 1rem 0 1.25rem;
  overflow: hidden;
}
.cr-progress > div {
  height: 100%;
  background: linear-gradient(90deg, #0f766e, #38bdf8);
  transition: width 0.3s ease;
}

.cr-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 1.25rem;
  align-items: start;
}
.cr-side {
  position: sticky;
  top: 1rem;
}
.cr-mobile-score {
  display: none;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  color: var(--cr-muted);
}
.cr-mobile-score strong {
  color: var(--cr-ink);
  font-size: 1.2rem;
}

.cr-q {
  margin: 0 0 0.65rem;
  font-size: 1.15rem;
}
.cr-scale-ends {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--cr-muted);
  margin-bottom: 0.45rem;
}
.cr-score-row {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.35rem;
}
.cr-score-row--sm .cr-score-btn {
  min-height: 38px;
  font-size: 0.85rem;
}
.cr-score-btn {
  appearance: none;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 10px;
  min-height: 44px;
  font-weight: 800;
  cursor: pointer;
  color: #0f172a;
}
.cr-score-btn.active {
  color: #fff;
  background: #0f172a;
  border-color: #0f172a;
}
.cr-score-btn:focus-visible {
  outline: 2px solid var(--cr-accent);
  outline-offset: 2px;
}

.cr-interp,
.cr-gap {
  margin: 0.85rem 0 0;
  font-weight: 600;
}
.cr-gap {
  color: #0f766e;
  background: #ecfeff;
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  font-size: 0.9rem;
}
.cr-reflect {
  margin-top: 1.15rem;
  display: grid;
  gap: 0.65rem;
}
.cr-reflect h3 {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
}
.cr-support {
  display: grid;
  gap: 0.35rem;
}
.cr-support__opt {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  font-size: 0.9rem;
  cursor: pointer;
}

.cr-footer {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1.35rem;
  padding-top: 1rem;
  border-top: 1px solid var(--cr-line);
  position: sticky;
  bottom: 0;
  background: linear-gradient(180deg, transparent, #fff 30%);
  padding-bottom: 0.25rem;
}

.cr-complete {
  text-align: center;
}
.cr-complete-score {
  margin: 1rem 0 0.5rem;
  font-size: 3.4rem;
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1;
}
.cr-complete-score small {
  font-size: 1.1rem;
  color: var(--cr-muted);
  font-weight: 700;
}
.cr-status-pill {
  display: inline-block;
  background: #0f172a;
  color: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-weight: 700;
  font-size: 0.9rem;
}
.cr-complete-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin: 1.25rem 0;
  text-align: left;
}
.cr-complete-meta dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--cr-muted);
}
.cr-complete-meta dd {
  margin: 0.2rem 0 0;
  font-weight: 700;
}

.cr-plan-card,
.cr-panel {
  background: #fff;
  border: 1px solid var(--cr-line);
  border-radius: 14px;
  padding: 0.95rem 1rem;
  margin-top: 1rem;
}
.cr-plan-card h3,
.cr-plan-summary h3 {
  margin: 0 0 0.5rem;
}
.cr-plan-summary p {
  margin: 0.2rem 0;
  font-size: 0.92rem;
}

.cr-results-grid {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 1rem;
  margin: 1rem 0;
}
.cr-results-side {
  display: grid;
  gap: 1rem;
  align-content: start;
}
.cr-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 1rem 0;
}
.cr-panel h2 {
  margin: 0 0 0.55rem;
  font-size: 1rem;
}
.cr-panel ul {
  margin: 0;
  padding-left: 1.1rem;
  line-height: 1.55;
}

@media (max-width: 900px) {
  .cr-layout,
  .cr-results-grid,
  .cr-two {
    grid-template-columns: 1fr;
  }
  .cr-side {
    position: static;
    order: -1;
  }
  .cr-side :deep(.clp) {
    display: none;
  }
  .cr-mobile-score {
    display: block;
  }
  .cr-btn--sticky {
    flex: 1;
  }
}

@media print {
  .cr-page {
    background: #fff;
    padding: 0;
  }
  .cr-actions,
  .cr-footer,
  .cr-save {
    display: none !important;
  }
  .cr-shell {
    box-shadow: none;
    border: none;
  }
}
</style>
