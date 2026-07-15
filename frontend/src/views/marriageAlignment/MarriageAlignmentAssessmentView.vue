<template>
  <div class="ma-page">
    <div v-if="loading" class="ma-state">Loading Marriage Alignment Assessment…</div>
    <div v-else-if="error" class="ma-state error">{{ error }}</div>
    <template v-else-if="template">
      <!-- Welcome -->
      <section v-if="step === 'welcome'" class="ma-shell ma-shell--narrow">
        <p class="ma-eyebrow">Marriage Alignment · Couples · Shared Course Map</p>
        <h1 class="ma-title">Are You Building the Same Kind of Life Together?</h1>
        <p class="ma-lead">
          Compare how each partner sees the marriage today, clarify what each partner wants for the
          future, and choose what to build together — separately first, then side by side.
        </p>
        <p class="ma-note">
          Each partner completes independently. Answers stay private until both submit. This is not a
          compatibility test, divorce prediction, or proof of fault — and it is not a substitute for
          qualified couples counseling.
        </p>
        <p class="ma-meta">About 15–25 minutes per partner</p>
        <div class="ma-actions">
          <button type="button" class="ma-btn primary" @click="step = 'privacy'">
            Begin My Alignment Reflection
          </button>
          <button type="button" class="ma-btn ghost" @click="step = 'privacy'">How Privacy Works</button>
        </div>
      </section>

      <!-- Privacy -->
      <section v-else-if="step === 'privacy'" class="ma-shell ma-shell--narrow">
        <h1 class="ma-title">Privacy &amp; Consent</h1>
        <ul class="ma-list">
          <li>Each partner completes separately with a unique link.</li>
          <li>Partners cannot see each other’s answers before both submit.</li>
          <li>Shared results compare domain ratings after both partners submit — private notes stay private.</li>
          <li>Scores do not prove fault, predict separation, or identify which partner is correct.</li>
          <li>Alignment does not require identical preferences.</li>
        </ul>
        <label class="ma-consent">
          <input v-model="consentAck" type="checkbox" />
          I understand that my domain ratings will be compared with my partner’s after both of us submit.
          Notes marked Private will not be shared.
        </label>
        <div class="ma-actions">
          <button type="button" class="ma-btn primary" :disabled="!consentAck" @click="step = 'setup'">
            Continue
          </button>
          <button type="button" class="ma-btn ghost" @click="step = 'welcome'">Back</button>
        </div>
      </section>

      <!-- Setup -->
      <section v-else-if="step === 'setup'" class="ma-shell ma-shell--narrow">
        <p class="ma-eyebrow">Create assessment cycle</p>
        <h1 class="ma-title">Invite both partners</h1>
        <label class="ma-field">
          Mode
          <select v-model="mode">
            <option v-for="m in MODE_OPTIONS" :key="m.id" :value="m.id">
              {{ m.label }} · {{ m.time }}
            </option>
          </select>
        </label>
        <label class="ma-field">
          Marriage season / version
          <select v-model="participantVersion">
            <option v-for="v in VERSION_OPTIONS" :key="v.id" :value="v.id">{{ v.label }}</option>
          </select>
        </label>
        <label class="ma-field">
          Partner A label
          <input v-model="partnerALabel" type="text" />
        </label>
        <label class="ma-field">
          Partner B label
          <input v-model="partnerBLabel" type="text" />
        </label>
        <div class="ma-actions">
          <button type="button" class="ma-btn ghost" @click="step = 'privacy'">Back</button>
          <button type="button" class="ma-btn primary" :disabled="creating" @click="createCycle">
            {{ creating ? 'Creating…' : 'Create & choose role →' }}
          </button>
        </div>
        <p v-if="existingTokens" class="ma-note" style="margin-top: 1rem">
          Or resume an existing cycle from this device.
          <button type="button" class="ma-link" @click="resumeExisting">Resume</button>
        </p>
      </section>

      <!-- Role -->
      <section v-else-if="step === 'role'" class="ma-shell ma-shell--narrow">
        <h1 class="ma-title">Whose responses are you entering?</h1>
        <p class="ma-lead">
          Complete one partner at a time. Share the other link with your partner, or switch later on
          this device.
        </p>
        <div class="ma-mode-grid">
          <button type="button" class="ma-mode" @click="enterAs('partner-a')">
            <strong>{{ partnerALabel }}</strong>
            <span>Open Partner A assessment</span>
          </button>
          <button type="button" class="ma-mode" @click="enterAs('partner-b')">
            <strong>{{ partnerBLabel }}</strong>
            <span>Open Partner B assessment</span>
          </button>
        </div>
        <div v-if="inviteTokens" class="ma-tokens">
          <p><strong>Partner A link token:</strong> <code>{{ inviteTokens.partnerA.slice(0, 10) }}…</code></p>
          <p><strong>Partner B link token:</strong> <code>{{ inviteTokens.partnerB.slice(0, 10) }}…</code></p>
        </div>
      </section>

      <!-- Check-in -->
      <section v-else-if="step === 'checkin' && activeDomain" class="ma-shell ma-shell--wide">
        <header class="ma-header">
          <div>
            <p class="ma-eyebrow">
              {{ viewerLabel }} · Your responses are separate
              <span class="ma-save">{{ saveStatus }}</span>
            </p>
            <h1 class="ma-title">{{ activeDomain.label }}</h1>
            <p class="ma-lead">{{ activeDomain.definition }}</p>
          </div>
          <div class="ma-count">{{ scoredCount }} of {{ activeDomains.length }} completed</div>
        </header>
        <div class="ma-progress"><div :style="{ width: progressPct + '%' }" /></div>

        <div class="ma-layout">
          <div class="ma-main">
            <div class="ma-privacy" role="status">Your partner’s responses are not currently visible.</div>

            <div v-if="activeDomain.allowsNotRelevant" class="ma-na">
              <label>
                <input type="checkbox" :checked="currentNR" @change="setNotRelevant($event.target.checked)" />
                Not relevant for our marriage
              </label>
            </div>

            <template v-if="!currentNR">
              <h2 class="ma-q">{{ activeDomain.primaryQuestion }}</h2>
              <div class="ma-scale-ends">
                <span>{{ activeDomain.scoreLabels?.low || 'Very different expectations' }}</span>
                <span>{{ activeDomain.scoreLabels?.high || 'Strongly aligned and clear' }}</span>
              </div>
              <div class="ma-score-row" role="radiogroup" aria-label="Current alignment">
                <button
                  v-for="n in 10"
                  :key="`c-${n}`"
                  type="button"
                  class="ma-score-btn"
                  :class="{ active: currentAlignment === n }"
                  :style="
                    currentAlignment === n
                      ? { background: activeDomain.color, borderColor: activeDomain.color }
                      : null
                  "
                  role="radio"
                  :aria-checked="currentAlignment === n"
                  @click="setCurrentAlignment(n)"
                >
                  {{ n }}
                </button>
              </div>

              <p v-if="liveAnnouncement" class="ma-interp" role="status" aria-live="polite">
                {{ liveAnnouncement }}
              </p>

              <div v-if="currentAlignment != null" class="ma-reflect">
                <h3>{{ activeDomain.desiredEmphasisQuestion || 'How much attention should this area receive during your next season?' }}</h3>
                <div class="ma-scale-ends">
                  <span>Low emphasis</span>
                  <span>High emphasis</span>
                </div>
                <div class="ma-score-row ma-score-row--sm" role="radiogroup" aria-label="Desired emphasis">
                  <button
                    v-for="n in 10"
                    :key="`d-${n}`"
                    type="button"
                    class="ma-score-btn"
                    :class="{ active: currentDesired === n }"
                    role="radio"
                    :aria-checked="currentDesired === n"
                    @click="setDesiredEmphasis(n)"
                  >
                    {{ n }}
                  </button>
                </div>

                <template v-if="enableCollaborationConfidence">
                  <h3>How confident are you that you and your partner can work on this area together?</h3>
                  <p class="ma-note">Optional — skip if unsure.</p>
                  <div class="ma-score-row ma-score-row--sm" role="radiogroup" aria-label="Collaboration confidence">
                    <button
                      v-for="n in 10"
                      :key="`x-${n}`"
                      type="button"
                      class="ma-score-btn"
                      :class="{ active: currentConfidence === n }"
                      role="radio"
                      :aria-checked="currentConfidence === n"
                      @click="setCollaborationConfidence(n)"
                    >
                      {{ n }}
                    </button>
                  </div>
                </template>

                <h3>{{ activeDomain.reflectionPrompt }}</h3>
                <div class="ma-chips">
                  <button
                    v-for="chip in reflectionOptions"
                    :key="chip"
                    type="button"
                    class="ma-chip"
                    :class="{ on: currentChips.includes(chip) }"
                    @click="toggleChip(chip)"
                  >
                    {{ chip }}
                  </button>
                </div>

                <label class="ma-note-field">
                  What does this area mean to you personally?
                  <textarea
                    :value="currentMeaning"
                    rows="2"
                    placeholder="Optional personal meaning"
                    @input="setPersonalMeaning($event.target.value)"
                  />
                </label>

                <label class="ma-note-field">
                  Private note (never shared)
                  <textarea :value="currentPrivateNote" rows="2" @input="setPrivateNote($event.target.value)" />
                </label>
                <label class="ma-note-field">
                  Shared note (visible after both submit, if enabled)
                  <textarea :value="currentSharedNote" rows="2" @input="setSharedNote($event.target.value)" />
                </label>
                <label class="ma-field">
                  Shared note visibility
                  <select :value="currentNoteVis" @change="setNoteVis($event.target.value)">
                    <option v-for="opt in NOTE_VISIBILITY_OPTIONS" :key="opt.id" :value="opt.id">
                      {{ opt.label }}
                    </option>
                  </select>
                </label>
                <label class="ma-field">
                  Support preference for this area
                  <select :value="currentSupport" @change="setSupportPreference($event.target.value)">
                    <option v-for="opt in SUPPORT_PREFERENCE_OPTIONS" :key="opt.id" :value="opt.id">
                      {{ opt.label }}
                    </option>
                  </select>
                </label>
              </div>
            </template>
          </div>

          <aside class="ma-side">
            <MarriageSharedCourseMap
              :domains="activeDomains"
              individual-only
              :individual-responses="viewerResponses"
              :active-domain-id="activeDomain.key"
              :marriage-alignment-index="individualSummary.individualMarriageAlignmentIndex"
              :partner-a-label="viewerLabel"
              :title="`${viewerLabel}'s course map`"
              interactive
              @domain-select="jumpToDomain"
            />
          </aside>
        </div>

        <footer class="ma-footer">
          <button type="button" class="ma-btn ghost ma-exit" @click="quickExit">Quick Exit</button>
          <button type="button" class="ma-btn ghost" :disabled="domainIndex === 0" @click="prevDomain">
            Back
          </button>
          <button type="button" class="ma-btn primary" :disabled="!canContinueDomain" @click="nextDomain">
            {{ domainIndex >= activeDomains.length - 1 ? 'Submit my reflection →' : 'Continue →' }}
          </button>
        </footer>
      </section>

      <!-- Waiting -->
      <section v-else-if="step === 'waiting'" class="ma-shell ma-shell--narrow ma-complete">
        <h1 class="ma-title">Your Reflection Is Complete</h1>
        <p class="ma-lead">
          Your Shared Marriage Course will become available after both partners finish their separate
          reflections.
        </p>
        <div class="ma-complete-score">
          <span>{{ individualSummary.individualMarriageAlignmentIndex ?? '—' }}</span>
          <small>/ 100</small>
        </div>
        <p class="ma-status-pill">{{ individualSummary.individualStatus }}</p>
        <MarriageSharedCourseMap
          class="ma-complete-map"
          :domains="activeDomains"
          individual-only
          :individual-responses="viewerResponses"
          :marriage-alignment-index="individualSummary.individualMarriageAlignmentIndex"
          :partner-a-label="viewerLabel"
          :title="settings.individualResultsTitle || 'Your Marriage Alignment Reflection'"
        />
        <p class="ma-note">Your partner’s responses are not currently visible.</p>
        <div class="ma-actions">
          <button type="button" class="ma-btn primary" @click="refreshCycle">Check if partner finished</button>
          <button type="button" class="ma-btn ghost" @click="switchPartner">Switch to other partner</button>
        </div>
      </section>

      <!-- Shared results -->
      <section v-else-if="step === 'shared'" class="ma-shell ma-shell--wide">
        <header class="ma-header">
          <div>
            <p class="ma-eyebrow">Both partners completed</p>
            <h1 class="ma-title">{{ settings.sharedResultsTitle || 'Your Shared Marriage Course' }}</h1>
            <p class="ma-lead">
              This profile compares how each partner currently experiences alignment across key areas of
              the marriage — and where each partner wants greater emphasis next. Different scores do not
              identify which partner is correct.
            </p>
          </div>
          <div class="ma-count ma-count--score">
            <strong>{{ comparison?.marriageAlignmentIndex ?? '—' }}</strong>
            <span>{{ comparison?.marriageAlignmentStatus }}</span>
            <small v-if="comparison?.sharedDirectionIndex != null">
              Direction {{ comparison.sharedDirectionIndex }} · {{ comparison.sharedDirectionStatus }}
            </small>
          </div>
        </header>

        <p class="ma-clarify">{{ comparison?.indexClarification }}</p>

        <div class="ma-summary-pills">
          <span>Shared strengths: {{ comparison?.sharedStrengths?.length || 0 }}</span>
          <span>Growth priorities: {{ comparison?.sharedGrowthPriorities?.length || 0 }}</span>
          <span>Perception gaps: {{ comparison?.differentCurrentExperiences?.length || 0 }}</span>
        </div>

        <div class="ma-results-grid">
          <MarriageSharedCourseMap
            v-model:display-mode="courseMapDisplayMode"
            :domains="activeDomains"
            :comparisons="comparison?.comparisons || []"
            :marriage-alignment-index="comparison?.marriageAlignmentIndex"
            :shared-direction-index="comparison?.sharedDirectionIndex"
            :active-domain-id="activeCompareKey"
            :selected-priority-domain-ids="sharedPriorities"
            :partner-a-label="partnerALabel"
            :partner-b-label="partnerBLabel"
            title="Shared Course Map"
            interactive
            @domain-select="activeCompareKey = $event"
          />
          <MarriageAlignmentMatrix
            :comparisons="comparison?.comparisons || []"
            :active-domain-id="activeCompareKey"
            :selected-priority-domain-ids="sharedPriorities"
            :clarification="comparison?.matrixClarification"
            interactive
            @domain-select="activeCompareKey = $event"
          />
        </div>

        <div class="ma-two">
          <div class="ma-panel">
            <h2>Shared strengths</h2>
            <ul>
              <li v-for="s in comparison?.sharedStrengths || []" :key="s.domainKey">
                {{ s.label }} — {{ partnerALabel }} {{ s.partnerACurrent }}, {{ partnerBLabel }}
                {{ s.partnerBCurrent }}
              </li>
              <li v-if="!(comparison?.sharedStrengths || []).length">None identified in this cycle.</li>
            </ul>
          </div>
          <div class="ma-panel">
            <h2>Growth priorities</h2>
            <ul>
              <li v-for="s in comparison?.sharedGrowthPriorities || []" :key="s.domainKey">
                {{ s.label }} — both partners want greater emphasis here.
              </li>
              <li v-if="!(comparison?.sharedGrowthPriorities || []).length">
                None identified in this cycle.
              </li>
            </ul>
          </div>
        </div>

        <div class="ma-two">
          <div class="ma-panel">
            <h2>Perception gaps (current alignment)</h2>
            <ul>
              <li v-for="s in comparison?.differentCurrentExperiences || []" :key="`pc-${s.domainKey}`">
                {{ s.label }} — gap {{ s.currentPerceptionGap }} · {{ s.currentGapStatusLabel }}
              </li>
              <li v-if="!(comparison?.differentCurrentExperiences || []).length">
                No major perception gaps identified.
              </li>
            </ul>
          </div>
          <div class="ma-panel">
            <h2>Priority gaps (desired emphasis)</h2>
            <ul>
              <li v-for="s in comparison?.differentFuturePriorities || []" :key="`pf-${s.domainKey}`">
                {{ s.label }} — gap {{ s.desiredEmphasisGap }} · {{ s.desiredGapStatusLabel }}
              </li>
              <li v-if="!(comparison?.differentFuturePriorities || []).length">
                No major priority gaps identified.
              </li>
            </ul>
          </div>
        </div>

        <div v-if="comparison?.insights?.length" class="ma-panel">
          <h2>Insights</h2>
          <ul>
            <li v-for="(ins, idx) in comparison.insights" :key="idx">{{ ins }}</li>
          </ul>
        </div>

        <div class="ma-panel">
          <h2>Your private priorities (up to {{ maxPriorities }})</h2>
          <p class="ma-note">
            Select areas you personally want to focus on. These stay with your individual reflection.
          </p>
          <div class="ma-chips">
            <button
              v-for="p in priorityCandidates"
              :key="`priv-${p.domainKey}`"
              type="button"
              class="ma-chip"
              :class="{ on: privatePriorities.includes(p.domainKey) }"
              :disabled="
                !privatePriorities.includes(p.domainKey) && privatePriorities.length >= maxPriorities
              "
              @click="togglePrivatePriority(p.domainKey)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>

        <div class="ma-panel">
          <h2>Choose shared priorities (up to {{ maxPriorities }})</h2>
          <p class="ma-note">
            A shared priority does not require identical scores — only agreement that the area deserves
            attention together.
          </p>
          <div class="ma-chips">
            <button
              v-for="p in priorityCandidates"
              :key="`shared-${p.domainKey}`"
              type="button"
              class="ma-chip"
              :class="{ on: sharedPriorities.includes(p.domainKey) }"
              :disabled="
                !sharedPriorities.includes(p.domainKey) && sharedPriorities.length >= maxPriorities
              "
              @click="toggleSharedPriority(p.domainKey)"
            >
              {{ p.label }}
            </button>
          </div>

          <div v-for="key in sharedPriorities" :key="key" class="ma-plan-card">
            <h3>{{ domainLabel(key) }}</h3>
            <label class="ma-field">
              {{ partnerALabel }} commitment
              <input
                v-model="planDrafts[key].partnerACommitment"
                type="text"
                placeholder="What Partner A will do"
                @blur="savePlans"
              />
            </label>
            <label class="ma-field">
              {{ partnerBLabel }} commitment
              <input
                v-model="planDrafts[key].partnerBCommitment"
                type="text"
                placeholder="What Partner B will do"
                @blur="savePlans"
              />
            </label>
            <label class="ma-field">
              Shared agreement
              <input
                v-model="planDrafts[key].sharedAgreement"
                type="text"
                placeholder="e.g. Weekly 20-minute alignment check-in"
                @blur="savePlans"
              />
            </label>
            <label class="ma-field">
              Review date
              <input v-model="planDrafts[key].reviewDate" type="date" @change="savePlans" />
            </label>
          </div>
        </div>

        <p class="ma-note">{{ settings.disclaimer }}</p>
        <div class="ma-actions">
          <button type="button" class="ma-btn primary" @click="downloadPdf">Download / print PDF</button>
          <button type="button" class="ma-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="ma-btn ghost" @click="resetAll">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import MarriageSharedCourseMap from '../../components/marriageAlignment/MarriageSharedCourseMap.vue';
import MarriageAlignmentMatrix from '../../components/marriageAlignment/MarriageAlignmentMatrix.vue';
import {
  MODE_OPTIONS,
  VERSION_OPTIONS,
  SUPPORT_PREFERENCE_OPTIONS,
  NOTE_VISIBILITY_OPTIONS,
  domainsForMode,
  interpretIndividualAlignment,
  buildIndividualSummary
} from '../../utils/marriageAlignment.js';

const route = useRoute();
const GUEST_KEY = 'ma-guest-cycle-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const consentAck = ref(false);
const creating = ref(false);
const mode = ref('full');
const participantVersion = ref('general');
const partnerALabel = ref('Partner A');
const partnerBLabel = ref('Partner B');
const inviteTokens = ref(null);
const existingTokens = ref(null);
const token = ref('');
const cycle = ref(null);
const domainIndex = ref(0);
const saveStatus = ref('');
const liveAnnouncement = ref('');
const privatePriorities = ref([]);
const sharedPriorities = ref([]);
const activeCompareKey = ref('');
const courseMapDisplayMode = ref('both');
const planDrafts = reactive({});

const settings = computed(() => template.value?.settings || {});
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 3));
const enableCollaborationConfidence = computed(
  () => settings.value.enableCollaborationConfidence !== false
);

const activeDomains = computed(() =>
  domainsForMode(template.value, mode.value, participantVersion.value)
);
const activeDomain = computed(() => activeDomains.value[domainIndex.value] || null);
const viewer = computed(() => cycle.value?.viewer || null);
const viewerLabel = computed(() => viewer.value?.displayLabel || 'You');
const viewerRole = computed(() => cycle.value?.viewerRole || viewer.value?.partnerRole || null);
const viewerResponses = computed(() => viewer.value?.responses || []);
const responseMap = computed(() => {
  const m = {};
  for (const r of viewerResponses.value) m[r.domainKey] = r;
  return m;
});

const currentAlignment = computed(
  () => responseMap.value[activeDomain.value?.key]?.currentAlignmentScore ?? null
);
const currentDesired = computed(
  () => responseMap.value[activeDomain.value?.key]?.desiredEmphasisScore ?? null
);
const currentConfidence = computed(
  () => responseMap.value[activeDomain.value?.key]?.collaborationConfidenceScore ?? null
);
const currentChips = computed(
  () => responseMap.value[activeDomain.value?.key]?.reflectionChips || []
);
const currentMeaning = computed(() => responseMap.value[activeDomain.value?.key]?.personalMeaning || '');
const currentPrivateNote = computed(() => responseMap.value[activeDomain.value?.key]?.privateNote || '');
const currentSharedNote = computed(() => responseMap.value[activeDomain.value?.key]?.sharedNote || '');
const currentNoteVis = computed(
  () => responseMap.value[activeDomain.value?.key]?.noteVisibility || 'private'
);
const currentSupport = computed(
  () => responseMap.value[activeDomain.value?.key]?.supportPreference || 'none'
);
const currentNR = computed(() => !!responseMap.value[activeDomain.value?.key]?.isNotRelevant);
const reflectionOptions = computed(() => activeDomain.value?.reflectionOptions || []);

const individualSummary = computed(() =>
  buildIndividualSummary(template.value, viewerResponses.value, mode.value, participantVersion.value)
);
const comparison = computed(() => cycle.value?.comparison || null);

const priorityCandidates = computed(() =>
  [...(comparison.value?.comparisons || [])].sort(
    (a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)
  )
);

const scoredCount = computed(
  () =>
    activeDomains.value.filter((d) => {
      const r = responseMap.value[d.key];
      if (r?.isNotRelevant) return true;
      return r?.currentAlignmentScore != null && r?.desiredEmphasisScore != null;
    }).length
);
const progressPct = computed(() => {
  if (!activeDomains.value.length) return 0;
  return Math.round((scoredCount.value / activeDomains.value.length) * 100);
});
const canContinueDomain = computed(
  () =>
    currentNR.value ||
    (currentAlignment.value != null && currentDesired.value != null)
);

function domainLabel(key) {
  return (
    activeDomains.value.find((d) => d.key === key)?.label ||
    comparison.value?.comparisons?.find((c) => c.domainKey === key)?.label ||
    key
  );
}

function ensurePlan(key) {
  if (!planDrafts[key]) {
    planDrafts[key] = {
      domainKey: key,
      partnerACommitment: '',
      partnerBCommitment: '',
      sharedAgreement: '',
      reviewDate: ''
    };
  }
}

function hydratePlansFromCycle() {
  const plans = cycle.value?.alignmentPlans || [];
  for (const p of plans) {
    if (!p?.domainKey) continue;
    ensurePlan(p.domainKey);
    planDrafts[p.domainKey] = {
      domainKey: p.domainKey,
      partnerACommitment: p.partnerACommitment || '',
      partnerBCommitment: p.partnerBCommitment || '',
      sharedAgreement: p.sharedAgreement || '',
      reviewDate: p.reviewDate || ''
    };
  }
  if (cycle.value?.selectedPriorities?.length) {
    sharedPriorities.value = [...cycle.value.selectedPriorities];
    for (const k of sharedPriorities.value) ensurePlan(k);
  }
  if (viewer.value?.selectedPriorities?.length) {
    privatePriorities.value = [...viewer.value.selectedPriorities];
  }
}

function persistLocal() {
  try {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({
        tokens: inviteTokens.value,
        token: token.value,
        partnerALabel: partnerALabel.value,
        partnerBLabel: partnerBLabel.value,
        mode: mode.value,
        participantVersion: participantVersion.value,
        step: step.value,
        domainIndex: domainIndex.value,
        privatePriorities: privatePriorities.value,
        sharedPriorities: sharedPriorities.value,
        planDrafts: { ...planDrafts },
        consentAck: consentAck.value,
        courseMapDisplayMode: courseMapDisplayMode.value
      })
    );
  } catch {
    // ignore
  }
}

watch(
  [step, token, inviteTokens, domainIndex, privatePriorities, sharedPriorities, courseMapDisplayMode],
  () => persistLocal(),
  { deep: true }
);

async function createCycle() {
  creating.value = true;
  error.value = '';
  try {
    const res = await api.post(
      '/marriage-alignment/guest/cycles',
      {
        mode: mode.value,
        participantVersion: participantVersion.value,
        partnerALabel: partnerALabel.value,
        partnerBLabel: partnerBLabel.value
      },
      quiet
    );
    inviteTokens.value = res.data?.cycle?.inviteTokens || null;
    existingTokens.value = inviteTokens.value;
    step.value = 'role';
  } catch (e) {
    error.value =
      e?.response?.data?.error ||
      e?.message ||
      'Could not create cycle. Run migration 928 if the template is missing.';
  } finally {
    creating.value = false;
  }
}

function resumeExisting() {
  if (!existingTokens.value) return;
  inviteTokens.value = existingTokens.value;
  step.value = 'role';
}

async function enterAs(role) {
  const t = role === 'partner-a' ? inviteTokens.value?.partnerA : inviteTokens.value?.partnerB;
  if (!t) return;
  token.value = t;
  await loadPartner(t);
}

async function loadPartner(t) {
  try {
    const res = await api.get(`/marriage-alignment/guest/partners/${t}`, quiet);
    cycle.value = res.data?.cycle || null;
    mode.value = cycle.value?.mode || mode.value;
    participantVersion.value = cycle.value?.participantVersion || participantVersion.value;
    if (cycle.value?.partnerA?.displayLabel) partnerALabel.value = cycle.value.partnerA.displayLabel;
    if (cycle.value?.partnerB?.displayLabel) partnerBLabel.value = cycle.value.partnerB.displayLabel;

    if (cycle.value?.sharedReleased) {
      hydratePlansFromCycle();
      step.value = 'shared';
    } else if (cycle.value?.viewer?.status === 'submitted') {
      step.value = 'waiting';
    } else {
      step.value = 'checkin';
      if (domainIndex.value >= activeDomains.value.length) domainIndex.value = 0;
    }
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || 'Could not load partner assessment';
  }
}

async function patchResponse(patch) {
  const key = activeDomain.value?.key;
  if (!key || !token.value) return;
  try {
    const res = await api.patch(
      `/marriage-alignment/guest/partners/${token.value}/responses`,
      { domainKey: key, ...patch },
      quiet
    );
    cycle.value = res.data?.cycle || cycle.value;
    saveStatus.value = 'Saved';
  } catch {
    saveStatus.value = 'Unable to sync';
  }
}

async function setCurrentAlignment(n) {
  await patchResponse({ currentAlignmentScore: n, isNotRelevant: false });
  const interp = interpretIndividualAlignment(n, activeDomain.value?.label || 'This area');
  const summary = buildIndividualSummary(
    template.value,
    (cycle.value?.viewer?.responses || []).map((r) =>
      r.domainKey === activeDomain.value.key ? { ...r, currentAlignmentScore: n } : r
    ),
    mode.value,
    participantVersion.value
  );
  liveAnnouncement.value = `${activeDomain.value.label} current alignment updated to ${n} out of 10. ${interp} Your Marriage Alignment Index is now ${summary.individualMarriageAlignmentIndex ?? '—'} out of 100. Your partner’s responses are not currently visible.`;
}

async function setDesiredEmphasis(n) {
  await patchResponse({ desiredEmphasisScore: n });
}

async function setCollaborationConfidence(n) {
  await patchResponse({ collaborationConfidenceScore: n });
}

async function setNotRelevant(v) {
  await patchResponse({
    isNotRelevant: v,
    currentAlignmentScore: null,
    desiredEmphasisScore: null,
    collaborationConfidenceScore: null
  });
}

async function toggleChip(chip) {
  const set = new Set(currentChips.value);
  if (set.has(chip)) set.delete(chip);
  else set.add(chip);
  await patchResponse({ reflectionChips: [...set] });
}

async function setPersonalMeaning(v) {
  await patchResponse({ personalMeaning: v });
}

async function setPrivateNote(v) {
  await patchResponse({ privateNote: v });
}

async function setSharedNote(v) {
  await patchResponse({
    sharedNote: v,
    noteVisibility:
      currentNoteVis.value === 'private' ? 'share-after-both-submit' : currentNoteVis.value
  });
}

async function setNoteVis(v) {
  await patchResponse({ noteVisibility: v });
}

async function setSupportPreference(v) {
  await patchResponse({ supportPreference: v });
}

function prevDomain() {
  if (domainIndex.value > 0) domainIndex.value -= 1;
}

async function nextDomain() {
  if (domainIndex.value >= activeDomains.value.length - 1) {
    await submit();
  } else {
    domainIndex.value += 1;
  }
}

function jumpToDomain(key) {
  const idx = activeDomains.value.findIndex((d) => d.key === key);
  if (idx >= 0) domainIndex.value = idx;
}

async function submit() {
  try {
    const res = await api.post(`/marriage-alignment/guest/partners/${token.value}/submit`, {}, quiet);
    cycle.value = res.data?.cycle || null;
    if (cycle.value?.sharedReleased) {
      hydratePlansFromCycle();
      step.value = 'shared';
    } else {
      step.value = 'waiting';
    }
  } catch (e) {
    error.value = e?.response?.data?.error || e?.message || 'Could not submit';
  }
}

async function refreshCycle() {
  await loadPartner(token.value);
}

function switchPartner() {
  if (!inviteTokens.value) return;
  const other =
    token.value === inviteTokens.value.partnerA
      ? inviteTokens.value.partnerB
      : inviteTokens.value.partnerA;
  token.value = other;
  loadPartner(other);
}

async function togglePrivatePriority(key) {
  if (privatePriorities.value.includes(key)) {
    privatePriorities.value = privatePriorities.value.filter((k) => k !== key);
  } else if (privatePriorities.value.length < maxPriorities.value) {
    privatePriorities.value = [...privatePriorities.value, key];
  }
  if (!token.value) return;
  try {
    const res = await api.patch(
      `/marriage-alignment/guest/partners/${token.value}/priorities`,
      { selectedPriorities: privatePriorities.value },
      quiet
    );
    cycle.value = res.data?.cycle || cycle.value;
  } catch {
    // local selection retained
  }
}

function toggleSharedPriority(key) {
  if (sharedPriorities.value.includes(key)) {
    sharedPriorities.value = sharedPriorities.value.filter((k) => k !== key);
  } else if (sharedPriorities.value.length < maxPriorities.value) {
    sharedPriorities.value = [...sharedPriorities.value, key];
    ensurePlan(key);
  }
  savePlans();
}

async function savePlans() {
  if (!token.value || !cycle.value?.sharedReleased) return;
  const alignmentPlans = sharedPriorities.value.map((key) => ({
    domainKey: key,
    label: domainLabel(key),
    ...(planDrafts[key] || {})
  }));
  try {
    const res = await api.patch(
      `/marriage-alignment/guest/partners/${token.value}/plans`,
      {
        selectedPriorities: sharedPriorities.value,
        alignmentPlans
      },
      quiet
    );
    cycle.value = res.data?.cycle || cycle.value;
  } catch {
    // drafts retained locally
  }
}

function quickExit() {
  window.location.href = 'https://www.google.com';
}

function buildExport() {
  return {
    type: 'marriage_alignment_guest',
    title: 'Marriage Alignment Assessment',
    exportedAt: new Date().toISOString(),
    mode: mode.value,
    participantVersion: participantVersion.value,
    viewer: viewerLabel.value,
    viewerRole: viewerRole.value,
    individualSummary: individualSummary.value,
    comparison: comparison.value,
    privatePriorities: privatePriorities.value,
    sharedPriorities: sharedPriorities.value,
    alignmentPlans: sharedPriorities.value.map((key) => ({
      domainKey: key,
      label: domainLabel(key),
      ...(planDrafts[key] || {})
    })),
    disclaimer: settings.value.disclaimer
  };
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `marriage-alignment-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf() {
  window.print();
}

function resetAll() {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    // ignore
  }
  token.value = '';
  inviteTokens.value = null;
  cycle.value = null;
  privatePriorities.value = [];
  sharedPriorities.value = [];
  domainIndex.value = 0;
  Object.keys(planDrafts).forEach((k) => delete planDrafts[k]);
  step.value = 'welcome';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/marriage-alignment/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value = 'Marriage Alignment template is not available yet. Run migration 928.';
      return;
    }

    const routeToken = route.query?.token;
    if (routeToken) {
      token.value = String(routeToken);
      await loadPartner(token.value);
      return;
    }

    try {
      const raw = localStorage.getItem(GUEST_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.tokens) {
          existingTokens.value = cached.tokens;
          inviteTokens.value = cached.tokens;
        }
        if (cached?.partnerALabel) partnerALabel.value = cached.partnerALabel;
        if (cached?.partnerBLabel) partnerBLabel.value = cached.partnerBLabel;
        if (cached?.mode) mode.value = cached.mode;
        if (cached?.participantVersion) participantVersion.value = cached.participantVersion;
        if (cached?.consentAck) consentAck.value = cached.consentAck;
        if (cached?.domainIndex != null) domainIndex.value = cached.domainIndex;
        if (cached?.courseMapDisplayMode) courseMapDisplayMode.value = cached.courseMapDisplayMode;
        if (cached?.privatePriorities) privatePriorities.value = cached.privatePriorities;
        if (cached?.sharedPriorities) {
          sharedPriorities.value = cached.sharedPriorities;
          for (const k of cached.sharedPriorities) ensurePlan(k);
        }
        if (cached?.planDrafts) {
          for (const [k, v] of Object.entries(cached.planDrafts)) planDrafts[k] = { ...v };
        }
        if (cached?.token) {
          token.value = cached.token;
          await loadPartner(cached.token);
        }
      }
    } catch {
      // ignore
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
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&display=swap');

.ma-page {
  --ma-ink: #1c1917;
  --ma-muted: #78716c;
  --ma-line: #e7e5e4;
  --ma-accent: #9a3412;
  --ma-accent-soft: #f0ebe6;
  --ma-slate: #1e3a5f;
  min-height: 100vh;
  background:
    radial-gradient(900px 360px at 8% -4%, rgba(154, 52, 18, 0.12), transparent 55%),
    radial-gradient(800px 320px at 92% 2%, rgba(30, 58, 95, 0.08), transparent 50%),
    linear-gradient(180deg, #fafaf9, #fff 42%, #f5f5f4);
  color: var(--ma-ink);
  font-family: 'Manrope', 'DM Sans', system-ui, sans-serif;
  padding: 1.25rem 1rem 3rem;
}

.ma-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--ma-muted);
}
.ma-state.error {
  color: #b91c1c;
}

.ma-shell {
  max-width: 1100px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid var(--ma-line);
  border-radius: 20px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 50px rgba(28, 25, 23, 0.06);
}
.ma-shell--narrow {
  max-width: 640px;
}
.ma-shell--wide {
  max-width: 1180px;
}

.ma-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ma-accent);
  font-weight: 700;
}
.ma-save {
  margin-left: 0.75rem;
  letter-spacing: 0;
  text-transform: none;
  color: #0f766e;
  font-weight: 600;
}
.ma-title {
  margin: 0.35rem 0 0.5rem;
  font-family: 'Fraunces', 'Libre Baskerville', Georgia, serif;
  font-size: clamp(1.5rem, 3vw, 2.15rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.ma-lead {
  margin: 0;
  color: #44403c;
  line-height: 1.55;
}
.ma-note,
.ma-meta,
.ma-clarify {
  color: var(--ma-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}
.ma-meta {
  margin-top: 1rem;
  font-weight: 600;
}
.ma-clarify {
  margin: 0.75rem 0 0;
  font-style: italic;
}
.ma-list {
  padding-left: 1.2rem;
  line-height: 1.55;
  color: #44403c;
}

.ma-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.5rem;
}
.ma-btn {
  appearance: none;
  border-radius: 999px;
  border: 1px solid #d6d3d1;
  background: #fff;
  color: var(--ma-ink);
  font-weight: 700;
  padding: 0.7rem 1.15rem;
  cursor: pointer;
  font-size: 0.95rem;
  font-family: inherit;
}
.ma-btn.primary {
  background: linear-gradient(135deg, var(--ma-accent), var(--ma-slate));
  border-color: transparent;
  color: #fff;
}
.ma-btn.ghost {
  background: transparent;
}
.ma-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ma-btn:focus-visible {
  outline: 2px solid var(--ma-accent);
  outline-offset: 2px;
}
.ma-link {
  appearance: none;
  border: none;
  background: none;
  color: var(--ma-accent);
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}
.ma-exit {
  margin-right: auto;
  font-size: 0.85rem;
}

.ma-consent {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  margin-top: 1rem;
  font-size: 0.92rem;
  line-height: 1.45;
}

.ma-field,
.ma-note-field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ma-muted);
  margin-top: 1rem;
}
.ma-field select,
.ma-field input,
.ma-note-field textarea {
  border: 1px solid #d6d3d1;
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  font: inherit;
  color: var(--ma-ink);
  background: #fff;
}

.ma-mode-grid {
  display: grid;
  gap: 0.65rem;
  margin-top: 1rem;
}
.ma-mode {
  text-align: left;
  border: 1px solid var(--ma-line);
  border-radius: 14px;
  background: #fff;
  padding: 0.9rem 1rem;
  cursor: pointer;
  display: grid;
  gap: 0.25rem;
  font-family: inherit;
}
.ma-mode span {
  color: var(--ma-muted);
  font-size: 0.88rem;
}
.ma-tokens {
  margin-top: 1rem;
  font-size: 0.82rem;
  color: var(--ma-muted);
}

.ma-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
.ma-count {
  flex-shrink: 0;
  background: var(--ma-slate);
  color: #f5f5f4;
  border-radius: 12px;
  padding: 0.65rem 0.85rem;
  font-size: 0.82rem;
  font-weight: 700;
}
.ma-count--score {
  text-align: center;
  min-width: 7.5rem;
}
.ma-count--score strong {
  display: block;
  font-size: 1.6rem;
  line-height: 1;
}
.ma-count--score small {
  display: block;
  margin-top: 0.35rem;
  font-size: 0.68rem;
  font-weight: 600;
  opacity: 0.85;
}
.ma-progress {
  height: 6px;
  background: #e7e5e4;
  border-radius: 999px;
  margin: 1rem 0 1.25rem;
  overflow: hidden;
}
.ma-progress > div {
  height: 100%;
  background: linear-gradient(90deg, var(--ma-accent), var(--ma-slate));
}

.ma-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 1.25rem;
  align-items: start;
}
.ma-side {
  position: sticky;
  top: 1rem;
}
.ma-privacy {
  background: var(--ma-accent-soft);
  border: 1px solid #d6d3d1;
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ma-accent);
  margin-bottom: 0.85rem;
}
.ma-na {
  margin-bottom: 0.85rem;
  font-size: 0.9rem;
}

.ma-q {
  margin: 0 0 0.65rem;
  font-size: 1.15rem;
  font-family: 'Fraunces', Georgia, serif;
}
.ma-scale-ends {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--ma-muted);
  margin-bottom: 0.45rem;
}
.ma-score-row {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.35rem;
}
.ma-score-row--sm .ma-score-btn {
  min-height: 38px;
}
.ma-score-btn {
  appearance: none;
  border: 1px solid #d6d3d1;
  background: #fff;
  border-radius: 10px;
  min-height: 44px;
  font-weight: 800;
  cursor: pointer;
  font-family: inherit;
}
.ma-score-btn.active {
  color: #fff;
}
.ma-score-btn:focus-visible {
  outline: 2px solid var(--ma-accent);
  outline-offset: 2px;
}

.ma-interp {
  margin: 0.85rem 0 0;
  font-weight: 600;
  color: #44403c;
}
.ma-reflect {
  margin-top: 1.15rem;
  display: grid;
  gap: 0.65rem;
}
.ma-reflect h3 {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
}
.ma-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.ma-chip {
  appearance: none;
  border: 1px solid #d6d3d1;
  background: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
.ma-chip.on {
  background: var(--ma-ink);
  border-color: var(--ma-ink);
  color: #fff;
}
.ma-chip:disabled {
  opacity: 0.4;
}

.ma-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.35rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ma-line);
  position: sticky;
  bottom: 0;
  background: linear-gradient(180deg, transparent, #fff 30%);
}

.ma-complete {
  text-align: center;
}
.ma-complete-score {
  margin: 1rem 0 0.5rem;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 3.2rem;
  font-weight: 700;
  line-height: 1;
}
.ma-complete-score small {
  font-size: 1.1rem;
  color: var(--ma-muted);
}
.ma-status-pill {
  display: inline-block;
  background: var(--ma-ink);
  color: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-weight: 700;
}
.ma-complete-map {
  text-align: left;
  margin: 1rem auto;
  max-width: 480px;
}

.ma-summary-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1rem 0;
}
.ma-summary-pills span {
  background: var(--ma-ink);
  color: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
}

.ma-results-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 1rem 0;
}
.ma-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.ma-panel,
.ma-plan-card {
  background: #fff;
  border: 1px solid var(--ma-line);
  border-radius: 14px;
  padding: 0.95rem 1rem;
  margin-top: 1rem;
}
.ma-panel h2 {
  margin: 0 0 0.55rem;
  font-size: 1rem;
  font-family: 'Fraunces', Georgia, serif;
}
.ma-panel ul {
  margin: 0;
  padding-left: 1.1rem;
  line-height: 1.55;
}
.ma-plan-card h3 {
  margin: 0 0 0.5rem;
  font-family: 'Fraunces', Georgia, serif;
}

@media (max-width: 900px) {
  .ma-layout,
  .ma-results-grid,
  .ma-two {
    grid-template-columns: 1fr;
  }
  .ma-side {
    position: static;
    order: -1;
  }
}

@media print {
  .ma-actions,
  .ma-footer,
  .ma-save {
    display: none !important;
  }
}
</style>
