<template>
  <div class="rh-page">
    <div v-if="loading" class="rh-state">Loading Relationship Health Assessment…</div>
    <div v-else-if="error" class="rh-state error">{{ error }}</div>
    <template v-else-if="template">
      <!-- Welcome -->
      <section v-if="step === 'welcome'" class="rh-shell rh-shell--narrow">
        <p class="rh-eyebrow">Assessment 21 · Couples · Relationship Health Assessment</p>
        <h1 class="rh-title">Explore Your Relationship — Separately, Then Together</h1>
        <p class="rh-lead">
          Explore how each partner currently experiences the relationship, identify shared strengths, and
          choose areas to strengthen together.
        </p>
        <p class="rh-note">
          Each partner completes independently. Answers stay private until both submit. This is not a
          diagnosis, compatibility test, or proof of fault — and it is not a substitute for qualified
          couples therapy.
        </p>
        <p class="rh-meta">About 15–25 minutes per partner</p>
        <div class="rh-actions">
          <button type="button" class="rh-btn primary" @click="step = 'setup'">
            Begin Relationship Assessment
          </button>
          <button type="button" class="rh-btn ghost" @click="step = 'privacy'">How Privacy Works</button>
        </div>
      </section>

      <section v-else-if="step === 'privacy'" class="rh-shell rh-shell--narrow">
        <h1 class="rh-title">Privacy &amp; Consent</h1>
        <ul class="rh-list">
          <li>Each partner completes separately with a unique link.</li>
          <li>Partners cannot see each other’s answers before both submit.</li>
          <li>Shared results show domain scores — private notes stay private.</li>
          <li>Safety responses are never shared with the other partner.</li>
          <li>Scores do not prove fault or predict separation.</li>
        </ul>
        <label class="rh-consent">
          <input v-model="consentAck" type="checkbox" />
          I understand that my domain scores will be compared with my partner’s after both of us submit.
          Notes marked Private will not be shared.
        </label>
        <div class="rh-actions">
          <button type="button" class="rh-btn primary" :disabled="!consentAck" @click="step = 'setup'">
            Continue
          </button>
          <button type="button" class="rh-btn ghost" @click="step = 'welcome'">Back</button>
        </div>
      </section>

      <section v-else-if="step === 'setup'" class="rh-shell rh-shell--narrow">
        <p class="rh-eyebrow">Create assessment cycle</p>
        <h1 class="rh-title">Invite both partners</h1>
        <label class="rh-field">
          Mode
          <select v-model="mode">
            <option v-for="m in MODE_OPTIONS" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
        </label>
        <label class="rh-field">
          Partner A label
          <input v-model="partnerALabel" type="text" />
        </label>
        <label class="rh-field">
          Partner B label
          <input v-model="partnerBLabel" type="text" />
        </label>
        <div class="rh-actions">
          <button type="button" class="rh-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="rh-btn primary" :disabled="creating" @click="createCycle">
            {{ creating ? 'Creating…' : 'Create & choose role →' }}
          </button>
        </div>
        <p v-if="existingTokens" class="rh-note" style="margin-top: 1rem">
          Or resume an existing cycle from this device.
          <button type="button" class="rh-link" @click="resumeExisting">Resume</button>
        </p>
      </section>

      <section v-else-if="step === 'role'" class="rh-shell rh-shell--narrow">
        <h1 class="rh-title">Whose responses are you entering?</h1>
        <p class="rh-lead">Complete one partner at a time. Share the other link with your partner, or switch later on this device.</p>
        <div class="rh-mode-grid">
          <button type="button" class="rh-mode" @click="enterAs('partner-a')">
            <strong>{{ partnerALabel }}</strong>
            <span>Open Partner A assessment</span>
          </button>
          <button type="button" class="rh-mode" @click="enterAs('partner-b')">
            <strong>{{ partnerBLabel }}</strong>
            <span>Open Partner B assessment</span>
          </button>
        </div>
        <div v-if="inviteTokens" class="rh-tokens">
          <p><strong>Partner A link token:</strong> <code>{{ inviteTokens.partnerA.slice(0, 10) }}…</code></p>
          <p><strong>Partner B link token:</strong> <code>{{ inviteTokens.partnerB.slice(0, 10) }}…</code></p>
        </div>
      </section>

      <!-- Check-in -->
      <section v-else-if="step === 'checkin' && activeDomain" class="rh-shell rh-shell--wide">
        <header class="rh-header">
          <div>
            <p class="rh-eyebrow">
              {{ viewerLabel }} · Your responses are separate
              <span class="rh-save">{{ saveStatus }}</span>
            </p>
            <h1 class="rh-title">{{ activeDomain.label }}</h1>
            <p class="rh-lead">{{ activeDomain.definition }}</p>
          </div>
          <div class="rh-count">{{ scoredCount }} of {{ activeDomains.length }} completed</div>
        </header>
        <div class="rh-progress"><div :style="{ width: progressPct + '%' }" /></div>

        <div class="rh-layout">
          <div class="rh-main">
            <div class="rh-privacy" role="status">Your partner’s responses are not currently visible.</div>

            <div v-if="activeDomain.allowsNotApplicable" class="rh-na">
              <label>
                <input type="checkbox" :checked="currentNA" @change="setNA($event.target.checked)" />
                Not applicable for our relationship
              </label>
            </div>

            <template v-if="!currentNA">
              <h2 class="rh-q">{{ activeDomain.primaryQuestion }}</h2>
              <div class="rh-scale-ends">
                <span>{{ activeDomain.scoreLabels?.low || 'Significant concern' }}</span>
                <span>{{ activeDomain.scoreLabels?.high || 'Strong and consistently positive' }}</span>
              </div>
              <div class="rh-score-row" role="radiogroup" aria-label="Current experience">
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="rh-score-btn"
                  :class="{ active: currentScore === n }"
                  :style="currentScore === n ? { background: activeDomain.color, borderColor: activeDomain.color } : null"
                  role="radio"
                  :aria-checked="currentScore === n"
                  @click="setScore(n)"
                >
                  {{ n }}
                </button>
              </div>

              <p v-if="liveAnnouncement" class="rh-interp" role="status" aria-live="polite">
                {{ liveAnnouncement }}
              </p>

              <div v-if="currentScore != null" class="rh-reflect">
                <template v-if="enableImportance">
                  <h3>How important is this area to your relationship satisfaction?</h3>
                  <div class="rh-score-row rh-score-row--sm" role="radiogroup" aria-label="Importance">
                    <button
                      v-for="n in 10"
                      :key="`i-${n}`"
                      type="button"
                      class="rh-score-btn"
                      :class="{ active: currentImportance === n }"
                      role="radio"
                      :aria-checked="currentImportance === n"
                      @click="setImportance(n)"
                    >
                      {{ n }}
                    </button>
                  </div>
                </template>

                <template v-if="enableDesired">
                  <h3>Where would you realistically like this area to be next?</h3>
                  <p class="rh-note">A realistic improvement may be more useful than choosing a perfect score.</p>
                  <div class="rh-score-row rh-score-row--sm" role="radiogroup" aria-label="Desired experience">
                    <button
                      v-for="n in 10"
                      :key="`d-${n}`"
                      type="button"
                      class="rh-score-btn"
                      :class="{ active: currentDesired === n }"
                      role="radio"
                      :aria-checked="currentDesired === n"
                      @click="setDesired(n)"
                    >
                      {{ n }}
                    </button>
                  </div>
                </template>

                <h3>{{ activeDomain.reflectionPrompt }}</h3>
                <div class="rh-chips">
                  <button
                    v-for="chip in reflectionOptions"
                    :key="chip"
                    type="button"
                    class="rh-chip"
                    :class="{ on: currentChips.includes(chip) }"
                    @click="toggleChip(chip)"
                  >
                    {{ chip }}
                  </button>
                </div>

                <p v-if="activeDomain.key === 'finances'" class="rh-note">
                  {{ settings.financialDisclaimer }}
                </p>

                <label class="rh-note-field">
                  Private note (never shared)
                  <textarea :value="currentPrivateNote" rows="2" @input="setPrivateNote($event.target.value)" />
                </label>
                <label class="rh-note-field">
                  Shared note (visible after both submit, if enabled)
                  <textarea :value="currentSharedNote" rows="2" @input="setSharedNote($event.target.value)" />
                </label>
                <label class="rh-field">
                  Shared note visibility
                  <select :value="currentNoteVis" @change="setNoteVis($event.target.value)">
                    <option value="private">Private to me</option>
                    <option value="share-after-both-submit">Share after both submit</option>
                    <option value="professional-only">Share with professional only</option>
                    <option value="partner-and-professional">Share with partner and professional</option>
                  </select>
                </label>
              </div>
            </template>
          </div>

          <aside class="rh-side">
            <RelationshipHealthWheel
              :domains="activeDomains"
              :partner-a-responses="viewerResponses"
              :active-domain-id="activeDomain.key"
              :index-score="individualSummary.individualRelationshipIndex"
              display-mode="individual"
              :partner-a-label="viewerLabel"
              :title="`${viewerLabel}'s wheel`"
              interactive
              @domain-select="jumpToDomain"
            />
          </aside>
        </div>

        <footer class="rh-footer">
          <button type="button" class="rh-btn ghost rh-exit" @click="quickExit">Quick Exit</button>
          <button type="button" class="rh-btn ghost" :disabled="domainIndex === 0" @click="prevDomain">Back</button>
          <button
            type="button"
            class="rh-btn primary"
            :disabled="!canContinueDomain"
            @click="nextDomain"
          >
            {{ domainIndex >= activeDomains.length - 1 ? 'Submit my reflection →' : `Continue →` }}
          </button>
        </footer>
      </section>

      <!-- Waiting -->
      <section v-else-if="step === 'waiting'" class="rh-shell rh-shell--narrow rh-complete">
        <h1 class="rh-title">Your Reflection Is Complete</h1>
        <p class="rh-lead">
          Your shared relationship comparison will become available after both partners finish their separate
          assessments.
        </p>
        <div class="rh-complete-score">
          <span>{{ individualSummary.individualRelationshipIndex ?? '—' }}</span>
          <small>/ 100</small>
        </div>
        <p class="rh-status-pill">{{ individualSummary.individualStatus }}</p>
        <RelationshipHealthWheel
          class="rh-complete-wheel"
          :domains="activeDomains"
          :partner-a-responses="viewerResponses"
          :index-score="individualSummary.individualRelationshipIndex"
          display-mode="individual"
          :partner-a-label="viewerLabel"
          title="Your Relationship Reflection"
        />
        <p class="rh-note">Your partner’s responses are not currently visible.</p>
        <div class="rh-actions">
          <button type="button" class="rh-btn primary" @click="refreshCycle">Check if partner finished</button>
          <button type="button" class="rh-btn ghost" @click="switchPartner">Switch to other partner</button>
        </div>
      </section>

      <!-- Shared results -->
      <section v-else-if="step === 'shared'" class="rh-shell rh-shell--wide">
        <header class="rh-header">
          <div>
            <p class="rh-eyebrow">Both partners completed</p>
            <h1 class="rh-title">Your Relationship Health Profile</h1>
            <p class="rh-lead">
              This profile compares how each partner currently experiences ten areas of the relationship.
              Differences may reflect expectations, experiences, communication, or current circumstances —
              not who is right.
            </p>
          </div>
          <div class="rh-count rh-count--score">
            <strong>{{ comparison?.coupleRelationshipIndex ?? '—' }}</strong>
            <span>{{ comparison?.coupleStatus }}</span>
          </div>
        </header>

        <div class="rh-summary-pills">
          <span>Shared strengths: {{ comparison?.sharedStrengths?.length || 0 }}</span>
          <span>Shared concerns: {{ comparison?.sharedConcerns?.length || 0 }}</span>
          <span>Perception gaps: {{ comparison?.perceptionGaps?.length || 0 }}</span>
        </div>

        <div class="rh-results-grid">
          <RelationshipHealthWheel
            :domains="activeDomains"
            :partner-a-responses="cycle?.partnerA?.responses || []"
            :partner-b-responses="cycle?.partnerB?.responses || []"
            display-mode="overlay"
            :index-score="comparison?.coupleRelationshipIndex"
            :partner-a-label="partnerALabel"
            :partner-b-label="partnerBLabel"
            title="Dual Relationship Health Wheel"
          />
          <RelationshipDifferenceMap
            :comparisons="comparison?.comparisons || []"
            :priority-keys="sharedPriorities"
            :partner-a-label="partnerALabel"
            :partner-b-label="partnerBLabel"
            interactive
            @domain-select="activeCompareKey = $event"
          />
        </div>

        <div class="rh-two">
          <div class="rh-panel">
            <h2>Shared strengths</h2>
            <ul>
              <li v-for="s in comparison?.sharedStrengths || []" :key="s.domainKey">
                {{ s.label }} — {{ partnerALabel }} {{ s.partnerAScore }}, {{ partnerBLabel }} {{ s.partnerBScore }}
              </li>
              <li v-if="!(comparison?.sharedStrengths || []).length">None identified in this cycle.</li>
            </ul>
          </div>
          <div class="rh-panel">
            <h2>Shared concerns</h2>
            <ul>
              <li v-for="s in comparison?.sharedConcerns || []" :key="s.domainKey">
                {{ s.label }} — both partners reported difficulty here.
              </li>
              <li v-if="!(comparison?.sharedConcerns || []).length">None identified in this cycle.</li>
            </ul>
          </div>
        </div>

        <div v-if="comparison?.insights?.length" class="rh-panel">
          <h2>Insights</h2>
          <ul>
            <li v-for="ins in comparison.insights" :key="ins.key">{{ ins.message }}</li>
          </ul>
        </div>

        <div class="rh-panel">
          <h2>Choose shared priorities (up to 3)</h2>
          <p class="rh-note">A shared priority does not require identical scores — only agreement that the area deserves attention.</p>
          <div class="rh-chips">
            <button
              v-for="p in PRIORITY_OPTIONS"
              :key="p.id"
              type="button"
              class="rh-chip"
              :class="{ on: sharedPriorities.includes(p.id) }"
              :disabled="!sharedPriorities.includes(p.id) && sharedPriorities.length >= 3"
              @click="toggleSharedPriority(p.id)"
            >
              {{ p.label }}
            </button>
          </div>

          <div v-for="key in sharedPriorities" :key="key" class="rh-plan-card">
            <h3>{{ priorityLabel(key) }}</h3>
            <label class="rh-field">
              Shared desired outcome
              <input v-model="planDrafts[key].sharedDesiredOutcome" type="text" />
            </label>
            <label class="rh-field">
              What I will do ({{ viewerLabel }})
              <input v-model="planDrafts[key].myCommitment" type="text" placeholder="Your personal commitment" />
            </label>
            <label class="rh-field">
              Shared relationship action
              <input v-model="planDrafts[key].sharedAction" type="text" placeholder="e.g. Sunday 20-minute check-in" />
            </label>
            <label class="rh-field">
              Review date
              <input v-model="planDrafts[key].reviewDate" type="date" />
            </label>
          </div>
        </div>

        <p class="rh-note">{{ settings.disclaimer }}</p>
        <div class="rh-actions">
          <button type="button" class="rh-btn primary" @click="downloadPdf">Download / print PDF</button>
          <button type="button" class="rh-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="rh-btn ghost" @click="resetAll">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import RelationshipHealthWheel from '../../components/relationshipHealth/RelationshipHealthWheel.vue';
import RelationshipDifferenceMap from '../../components/relationshipHealth/RelationshipDifferenceMap.vue';
import {
  MODE_OPTIONS,
  PRIORITY_OPTIONS,
  domainsForMode,
  interpretScore,
  buildIndividualSummary
} from '../../utils/relationshipHealth.js';

const route = useRoute();
const GUEST_KEY = 'rh-guest-cycle-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const consentAck = ref(false);
const creating = ref(false);
const mode = ref('full');
const partnerALabel = ref('Partner A');
const partnerBLabel = ref('Partner B');
const inviteTokens = ref(null);
const existingTokens = ref(null);
const token = ref('');
const cycle = ref(null);
const domainIndex = ref(0);
const saveStatus = ref('');
const liveAnnouncement = ref('');
const sharedPriorities = ref([]);
const activeCompareKey = ref('');
const planDrafts = reactive({});

const settings = computed(() => template.value?.settings || {});
const enableImportance = computed(() => settings.value.enableImportance !== false);
const enableDesired = computed(() => settings.value.enableDesiredExperience !== false);

const activeDomains = computed(() => domainsForMode(template.value, mode.value));
const activeDomain = computed(() => activeDomains.value[domainIndex.value] || null);
const viewer = computed(() => cycle.value?.viewer || null);
const viewerLabel = computed(() => viewer.value?.displayLabel || 'You');
const viewerResponses = computed(() => viewer.value?.responses || []);
const responseMap = computed(() => {
  const m = {};
  for (const r of viewerResponses.value) m[r.domainKey] = r;
  return m;
});

const currentScore = computed(
  () => responseMap.value[activeDomain.value?.key]?.currentExperienceScore ?? null
);
const currentImportance = computed(
  () => responseMap.value[activeDomain.value?.key]?.importanceScore ?? null
);
const currentDesired = computed(
  () => responseMap.value[activeDomain.value?.key]?.desiredExperienceScore ?? null
);
const currentChips = computed(
  () => responseMap.value[activeDomain.value?.key]?.reflectionChips || []
);
const currentPrivateNote = computed(() => responseMap.value[activeDomain.value?.key]?.privateNote || '');
const currentSharedNote = computed(() => responseMap.value[activeDomain.value?.key]?.sharedNote || '');
const currentNoteVis = computed(
  () => responseMap.value[activeDomain.value?.key]?.noteVisibility || 'private'
);
const currentNA = computed(() => !!responseMap.value[activeDomain.value?.key]?.isNotApplicable);
const reflectionOptions = computed(() => activeDomain.value?.reflectionOptions || []);

const individualSummary = computed(() =>
  buildIndividualSummary(template.value, viewerResponses.value, mode.value)
);
const comparison = computed(() => cycle.value?.comparison || null);

const scoredCount = computed(
  () =>
    activeDomains.value.filter((d) => {
      const r = responseMap.value[d.key];
      return r?.isNotApplicable || r?.currentExperienceScore != null;
    }).length
);
const progressPct = computed(() => {
  if (!activeDomains.value.length) return 0;
  return Math.round((scoredCount.value / activeDomains.value.length) * 100);
});
const canContinueDomain = computed(() => currentNA.value || currentScore.value != null);

function priorityLabel(id) {
  return PRIORITY_OPTIONS.find((p) => p.id === id)?.label || id;
}
function ensurePlan(key) {
  if (!planDrafts[key]) {
    planDrafts[key] = {
      sharedDesiredOutcome: '',
      myCommitment: '',
      sharedAction: '',
      reviewDate: ''
    };
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
        step: step.value,
        domainIndex: domainIndex.value,
        sharedPriorities: sharedPriorities.value,
        planDrafts: { ...planDrafts },
        consentAck: consentAck.value
      })
    );
  } catch {
    // ignore
  }
}

watch([step, token, inviteTokens, domainIndex, sharedPriorities], () => persistLocal(), { deep: true });

async function createCycle() {
  creating.value = true;
  error.value = '';
  try {
    const res = await api.post(
      '/relationship-health/guest/cycles',
      {
        mode: mode.value,
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
      'Could not create cycle. Run migration 922 if the template is missing.';
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
  const t =
    role === 'partner-a' ? inviteTokens.value?.partnerA : inviteTokens.value?.partnerB;
  if (!t) return;
  token.value = t;
  await loadPartner(t);
}

async function loadPartner(t) {
  try {
    const res = await api.get(`/relationship-health/guest/partners/${t}`, quiet);
    cycle.value = res.data?.cycle || null;
    mode.value = cycle.value?.mode || mode.value;
    if (cycle.value?.partnerA?.displayLabel) partnerALabel.value = cycle.value.partnerA.displayLabel;
    if (cycle.value?.partnerB?.displayLabel) partnerBLabel.value = cycle.value.partnerB.displayLabel;

    if (cycle.value?.sharedReleased) {
      step.value = 'shared';
    } else if (cycle.value?.viewer?.status === 'submitted') {
      step.value = 'waiting';
    } else {
      step.value = 'checkin';
      domainIndex.value = 0;
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
      `/relationship-health/guest/partners/${token.value}/responses`,
      { domainKey: key, ...patch },
      quiet
    );
    cycle.value = res.data?.cycle || cycle.value;
    saveStatus.value = 'Saved';
  } catch {
    saveStatus.value = 'Unable to sync';
  }
}

async function setScore(n) {
  await patchResponse({ currentExperienceScore: n, isNotApplicable: false });
  const interp = interpretScore(n, activeDomain.value?.scoreLabels || {});
  const summary = buildIndividualSummary(
    template.value,
    (cycle.value?.viewer?.responses || []).map((r) =>
      r.domainKey === activeDomain.value.key ? { ...r, currentExperienceScore: n } : r
    ),
    mode.value
  );
  liveAnnouncement.value = `${activeDomain.value.label} updated to ${n} out of 10. ${interp}. Your individual Relationship Health Index is now ${summary.individualRelationshipIndex ?? '—'} out of 100. Your partner’s responses are not currently visible.`;
}
async function setImportance(n) {
  await patchResponse({ importanceScore: n });
}
async function setDesired(n) {
  await patchResponse({ desiredExperienceScore: n });
}
async function setNA(v) {
  await patchResponse({ isNotApplicable: v, currentExperienceScore: null });
}
async function toggleChip(chip) {
  const set = new Set(currentChips.value);
  if (set.has(chip)) set.delete(chip);
  else set.add(chip);
  await patchResponse({ reflectionChips: [...set] });
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
    const res = await api.post(`/relationship-health/guest/partners/${token.value}/submit`, {}, quiet);
    cycle.value = res.data?.cycle || null;
    step.value = cycle.value?.sharedReleased ? 'shared' : 'waiting';
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

function toggleSharedPriority(id) {
  if (sharedPriorities.value.includes(id)) {
    sharedPriorities.value = sharedPriorities.value.filter((k) => k !== id);
  } else if (sharedPriorities.value.length < 3) {
    sharedPriorities.value = [...sharedPriorities.value, id];
    ensurePlan(id);
  }
}

function quickExit() {
  window.location.href = 'https://www.google.com';
}

function buildExport() {
  return {
    type: 'relationship_health_guest',
    title: 'Relationship Health Assessment',
    exportedAt: new Date().toISOString(),
    mode: mode.value,
    viewer: viewerLabel.value,
    individualSummary: individualSummary.value,
    comparison: comparison.value,
    sharedPriorities: sharedPriorities.value,
    plans: sharedPriorities.value.map((key) => ({
      domainKey: key,
      label: priorityLabel(key),
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
  a.download = `relationship-health-${new Date().toISOString().slice(0, 10)}.json`;
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
  sharedPriorities.value = [];
  domainIndex.value = 0;
  Object.keys(planDrafts).forEach((k) => delete planDrafts[k]);
  step.value = 'welcome';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/relationship-health/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value =
        'Relationship Health template is not available yet. Run migration 922 on the database.';
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
        if (cached?.consentAck) consentAck.value = cached.consentAck;
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
.rh-page {
  --rh-ink: #0f172a;
  --rh-muted: #64748b;
  --rh-line: #dbe3f0;
  min-height: 100vh;
  background:
    radial-gradient(1000px 400px at 10% -5%, #fda4af55, transparent 55%),
    radial-gradient(900px 380px at 90% 0%, #7dd3fc55, transparent 50%),
    linear-gradient(180deg, #f8fafc, #fff 45%, #f1f5f9);
  color: var(--rh-ink);
  font-family: 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif;
  padding: 1.25rem 1rem 3rem;
}

.rh-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--rh-muted);
}
.rh-state.error {
  color: #b91c1c;
}

.rh-shell {
  max-width: 1100px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--rh-line);
  border-radius: 20px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
}
.rh-shell--narrow {
  max-width: 640px;
}
.rh-shell--wide {
  max-width: 1180px;
}

.rh-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--rh-muted);
  font-weight: 700;
}
.rh-save {
  margin-left: 0.75rem;
  letter-spacing: 0;
  text-transform: none;
  color: #059669;
  font-weight: 600;
}
.rh-title {
  margin: 0.35rem 0 0.5rem;
  font-size: clamp(1.5rem, 3vw, 2.1rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.rh-lead {
  margin: 0;
  color: #334155;
  line-height: 1.55;
}
.rh-note,
.rh-meta {
  color: var(--rh-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}
.rh-meta {
  margin-top: 1rem;
  font-weight: 600;
}
.rh-list {
  padding-left: 1.2rem;
  line-height: 1.55;
  color: #334155;
}

.rh-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.5rem;
}
.rh-btn {
  appearance: none;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: var(--rh-ink);
  font-weight: 700;
  padding: 0.7rem 1.15rem;
  cursor: pointer;
  font-size: 0.95rem;
}
.rh-btn.primary {
  background: linear-gradient(135deg, #be185d, #0ea5e9);
  border-color: transparent;
  color: #fff;
}
.rh-btn.ghost {
  background: transparent;
}
.rh-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.rh-btn:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}
.rh-link {
  appearance: none;
  border: none;
  background: none;
  color: #0284c7;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}
.rh-exit {
  margin-right: auto;
  font-size: 0.85rem;
}

.rh-consent {
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  margin-top: 1rem;
  font-size: 0.92rem;
  line-height: 1.45;
}

.rh-field,
.rh-note-field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--rh-muted);
  margin-top: 1rem;
}
.rh-field select,
.rh-field input,
.rh-note-field textarea {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  font: inherit;
  color: var(--rh-ink);
}

.rh-mode-grid {
  display: grid;
  gap: 0.65rem;
  margin-top: 1rem;
}
.rh-mode {
  text-align: left;
  border: 1px solid var(--rh-line);
  border-radius: 14px;
  background: #fff;
  padding: 0.9rem 1rem;
  cursor: pointer;
  display: grid;
  gap: 0.25rem;
}
.rh-mode span {
  color: var(--rh-muted);
  font-size: 0.88rem;
}
.rh-tokens {
  margin-top: 1rem;
  font-size: 0.82rem;
  color: var(--rh-muted);
}

.rh-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
.rh-count {
  flex-shrink: 0;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  padding: 0.65rem 0.85rem;
  font-size: 0.82rem;
  font-weight: 700;
}
.rh-count--score {
  text-align: center;
}
.rh-count--score strong {
  display: block;
  font-size: 1.6rem;
  line-height: 1;
}
.rh-progress {
  height: 6px;
  background: #e2e8f0;
  border-radius: 999px;
  margin: 1rem 0 1.25rem;
  overflow: hidden;
}
.rh-progress > div {
  height: 100%;
  background: linear-gradient(90deg, #be185d, #0ea5e9);
}

.rh-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 1.25rem;
  align-items: start;
}
.rh-side {
  position: sticky;
  top: 1rem;
}
.rh-privacy {
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #0e7490;
  margin-bottom: 0.85rem;
}
.rh-na {
  margin-bottom: 0.85rem;
  font-size: 0.9rem;
}

.rh-q {
  margin: 0 0 0.65rem;
  font-size: 1.15rem;
}
.rh-scale-ends {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--rh-muted);
  margin-bottom: 0.45rem;
}
.rh-score-row {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.35rem;
}
.rh-score-row--sm .rh-score-btn {
  min-height: 38px;
}
.rh-score-btn {
  appearance: none;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 10px;
  min-height: 44px;
  font-weight: 800;
  cursor: pointer;
}
.rh-score-btn.active {
  color: #fff;
}
.rh-score-btn:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}

.rh-interp {
  margin: 0.85rem 0 0;
  font-weight: 600;
}
.rh-reflect {
  margin-top: 1.15rem;
  display: grid;
  gap: 0.65rem;
}
.rh-reflect h3 {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
}
.rh-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.rh-chip {
  appearance: none;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.rh-chip.on {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}
.rh-chip:disabled {
  opacity: 0.4;
}

.rh-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.35rem;
  padding-top: 1rem;
  border-top: 1px solid var(--rh-line);
  position: sticky;
  bottom: 0;
  background: linear-gradient(180deg, transparent, #fff 30%);
}

.rh-complete {
  text-align: center;
}
.rh-complete-score {
  margin: 1rem 0 0.5rem;
  font-size: 3.2rem;
  font-weight: 900;
  line-height: 1;
}
.rh-complete-score small {
  font-size: 1.1rem;
  color: var(--rh-muted);
}
.rh-status-pill {
  display: inline-block;
  background: #0f172a;
  color: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-weight: 700;
}
.rh-complete-wheel {
  text-align: left;
  margin: 1rem auto;
  max-width: 420px;
}

.rh-summary-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1rem 0;
}
.rh-summary-pills span {
  background: #0f172a;
  color: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
}

.rh-results-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 1rem 0;
}
.rh-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.rh-panel,
.rh-plan-card {
  background: #fff;
  border: 1px solid var(--rh-line);
  border-radius: 14px;
  padding: 0.95rem 1rem;
  margin-top: 1rem;
}
.rh-panel h2 {
  margin: 0 0 0.55rem;
  font-size: 1rem;
}
.rh-panel ul {
  margin: 0;
  padding-left: 1.1rem;
  line-height: 1.55;
}
.rh-plan-card h3 {
  margin: 0 0 0.5rem;
}

@media (max-width: 900px) {
  .rh-layout,
  .rh-results-grid,
  .rh-two {
    grid-template-columns: 1fr;
  }
  .rh-side {
    position: static;
    order: -1;
  }
  .rh-side :deep(.rhw) {
    max-width: 280px;
    margin: 0 auto;
  }
}

@media print {
  .rh-actions,
  .rh-footer,
  .rh-save {
    display: none !important;
  }
}
</style>
