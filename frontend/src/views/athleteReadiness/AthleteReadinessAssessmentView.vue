<template>
  <div class="ar-page">
    <div v-if="loading" class="ar-state">Loading Athlete Performance Readiness Assessment…</div>
    <div v-else-if="error" class="ar-state error">{{ error }}</div>
    <template v-else-if="template">
      <!-- Welcome -->
      <section v-if="step === 'welcome'" class="ar-shell ar-shell--narrow">
        <p class="ar-eyebrow">Athlete Performance Readiness Assessment</p>
        <h1 class="ar-title">How Ready Are You to Perform Today?</h1>
        <p class="ar-lead">
          Performance depends on more than effort. Sleep, recovery, energy, focus, confidence, stress, and
          support all influence how prepared you feel to train or compete.
        </p>
        <p class="ar-note">
          Answer based on how you feel right now. Honest responses help you and your coach make better
          decisions. This is not a medical diagnosis or injury evaluation.
        </p>
        <p class="ar-meta">About 2–5 minutes</p>
        <div class="ar-actions">
          <button type="button" class="ar-btn primary" @click="step = 'mode'">Check My Readiness</button>
          <button type="button" class="ar-btn ghost" @click="step = 'privacy'">How My Responses Are Used</button>
        </div>
      </section>

      <section v-else-if="step === 'privacy'" class="ar-shell ar-shell--narrow">
        <h1 class="ar-title">How My Responses Are Used</h1>
        <p class="ar-lead">
          On this public guest check-in, responses stay on this device unless you download or share them.
          When used inside a team program, authorized staff may view individual readiness based on role
          permissions — coaches, athletic trainers, performance staff, or others your organization configures.
        </p>
        <ul class="ar-list">
          <li>We do not claim confidentiality if coaching staff can view individual responses.</li>
          <li>Written notes can be marked private to you, visible to coaching staff, or medical/support only.</li>
          <li>Teammates do not see your individual responses.</li>
          <li>This tool does not diagnose injury or determine eligibility to train or compete.</li>
        </ul>
        <div class="ar-actions">
          <button type="button" class="ar-btn primary" @click="step = 'mode'">Continue</button>
          <button type="button" class="ar-btn ghost" @click="step = 'welcome'">Back</button>
        </div>
      </section>

      <section v-else-if="step === 'mode'" class="ar-shell ar-shell--narrow">
        <p class="ar-eyebrow">Assessment mode</p>
        <h1 class="ar-title">Choose your check-in</h1>
        <div class="ar-mode-grid">
          <button
            v-for="m in MODE_OPTIONS"
            :key="m.id"
            type="button"
            class="ar-mode"
            :class="{ on: mode === m.id }"
            @click="mode = m.id"
          >
            <strong>{{ m.label }}</strong>
            <span>{{ m.description }}</span>
            <em>{{ m.time }}</em>
          </button>
        </div>
        <div class="ar-actions">
          <button type="button" class="ar-btn ghost" @click="step = 'welcome'">Back</button>
          <button type="button" class="ar-btn primary" @click="startCheckIn">Begin check-in →</button>
        </div>
      </section>

      <!-- Progressive domains -->
      <section v-else-if="step === 'checkin' && activeDomain" class="ar-shell ar-shell--wide">
        <header class="ar-header">
          <div>
            <p class="ar-eyebrow">
              Athlete Performance Readiness · {{ modeLabel }}
              <span class="ar-save">{{ saveStatus }}</span>
            </p>
            <h1 class="ar-title">{{ activeDomain.label }}</h1>
            <p class="ar-lead">{{ activeDomain.definition }}</p>
          </div>
          <div class="ar-count">{{ scoredCount }} of {{ activeDomains.length }} completed</div>
        </header>
        <div class="ar-progress"><div :style="{ width: progressPct + '%' }" /></div>

        <div class="ar-layout">
          <div class="ar-main">
            <div class="ar-mobile-score" aria-live="polite">
              Readiness
              <strong>{{ summary.readinessScore ?? '—' }}</strong>
              <span v-if="summary.readinessStatus">· {{ summary.readinessStatus }}</span>
            </div>

            <h2 class="ar-q">{{ domainQuestion(activeDomain.key) }}</h2>
            <div class="ar-scale-ends">
              <span>{{ activeDomain.scoreLabels?.low || 'Low' }}</span>
              <span>{{ activeDomain.scoreLabels?.high || 'High' }}</span>
            </div>
            <div class="ar-score-row" role="radiogroup" :aria-label="`${activeDomain.label} score`">
              <button
                v-for="n in 10"
                :key="n"
                type="button"
                class="ar-score-btn"
                :class="{ active: currentScore === n }"
                :style="
                  currentScore === n
                    ? { background: activeDomain.color, borderColor: activeDomain.color }
                    : null
                "
                :aria-checked="currentScore === n"
                role="radio"
                @click="setScore(n)"
              >
                {{ n }}
              </button>
            </div>

            <p v-if="currentScore != null" class="ar-interp" role="status" aria-live="polite">
              {{ liveAnnouncement }}
            </p>

            <div v-if="currentScore != null" class="ar-reflect">
              <h3>{{ domainReflectionPrompt(activeDomain.key) }}</h3>
              <div class="ar-chips">
                <button
                  v-for="chip in reflectionOptions"
                  :key="chip"
                  type="button"
                  class="ar-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>

              <div v-if="activeDomain.key === 'soreness' && bodyAreaOptions.length" class="ar-body">
                <h3>Body areas (optional)</h3>
                <div class="ar-chips">
                  <button
                    v-for="area in bodyAreaOptions"
                    :key="area"
                    type="button"
                    class="ar-chip"
                    :class="{ on: currentBodyAreas.includes(area) }"
                    @click="toggleBodyArea(area)"
                  >
                    {{ area }}
                  </button>
                </div>
              </div>

              <div
                v-if="showUrgentBanner"
                class="ar-urgent"
                role="alert"
              >
                {{ urgentMessage }}
              </div>

              <h3>Would you like support in this area?</h3>
              <div class="ar-support" role="radiogroup" aria-label="Support preference">
                <label v-for="opt in SUPPORT_OPTIONS" :key="opt.id" class="ar-support__opt">
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

              <label class="ar-note-field">
                Optional note
                <textarea
                  :value="currentNote"
                  rows="2"
                  placeholder="Anything you want your coach or staff to know…"
                  @input="setNote($event.target.value)"
                />
              </label>
            </div>
          </div>

          <aside class="ar-side">
            <AthleteReadinessStack
              :domains="activeDomains"
              :responses="responses"
              :readiness-score="summary.readinessScore"
              :layer-scores="summary.layerScores"
              :active-domain-id="activeDomain.key"
              :show-review-indicators="summary.indicators?.length > 0"
              :review-layer-keys="reviewLayerKeys"
              interactive
              @layer-select="jumpToLayer"
            />
            <div class="ar-side-card">
              <h3>Active layer</h3>
              <p>{{ layerLabel(activeDomain.readinessLayer) }}</p>
              <h3>Status</h3>
              <p>{{ summary.readinessStatus || 'Building…' }}</p>
              <ul v-if="summary.indicators?.length" class="ar-indicators">
                <li v-for="ind in summary.indicators" :key="ind.key">{{ ind.message }}</li>
              </ul>
            </div>
          </aside>
        </div>

        <footer class="ar-footer">
          <button type="button" class="ar-btn ghost" :disabled="domainIndex === 0" @click="prevDomain">
            Back
          </button>
          <button
            type="button"
            class="ar-btn primary ar-btn--sticky"
            :disabled="currentScore == null"
            @click="nextDomain"
          >
            {{ domainIndex >= activeDomains.length - 1 ? 'Finish check-in →' : `Continue to ${nextDomainLabel} →` }}
          </button>
        </footer>
      </section>

      <!-- Completion teaser -->
      <section v-else-if="step === 'complete'" class="ar-shell ar-shell--narrow ar-complete">
        <p class="ar-eyebrow">Check-in complete</p>
        <h1 class="ar-title">Your Readiness Report Is Ready</h1>
        <div class="ar-complete-score">
          <span>{{ summary.readinessScore ?? '—' }}</span>
          <small>/ 100</small>
        </div>
        <p class="ar-status-pill">{{ summary.readinessStatus }}</p>
        <dl class="ar-complete-meta">
          <div>
            <dt>Strongest area</dt>
            <dd>{{ summary.strongest?.[0]?.label || '—' }}</dd>
          </div>
          <div>
            <dt>Primary limiter</dt>
            <dd>{{ summary.limiters?.[0]?.label || '—' }}</dd>
          </div>
          <div>
            <dt>Support requests</dt>
            <dd>{{ summary.supportRequestCount || 0 }}</dd>
          </div>
        </dl>
        <AthleteReadinessStack
          class="ar-complete-stack"
          :domains="activeDomains"
          :responses="responses"
          :readiness-score="summary.readinessScore"
          :layer-scores="summary.layerScores"
          compact
        />
        <p class="ar-note">
          Your readiness score is one source of information. Final training and competition decisions should
          include coach and qualified medical judgment when appropriate.
        </p>
        <div class="ar-actions">
          <button type="button" class="ar-btn primary" @click="step = 'results'">View My Readiness Report</button>
          <button type="button" class="ar-btn ghost" @click="reviewResponses">Review My Responses</button>
        </div>
      </section>

      <!-- Results -->
      <section v-else-if="step === 'results'" class="ar-shell ar-shell--wide ar-results">
        <header class="ar-header">
          <div>
            <p class="ar-eyebrow">Athlete Performance Readiness</p>
            <h1 class="ar-title">Your Readiness Report</h1>
            <p class="ar-lead">
              This report reflects how prepared you currently feel across recovery, physical readiness,
              mental readiness, emotional readiness, and competition readiness.
            </p>
          </div>
          <div class="ar-count ar-count--score">
            <strong>{{ summary.readinessScore ?? '—' }}</strong>
            <span>{{ summary.readinessStatus }}</span>
          </div>
        </header>

        <div class="ar-results-grid">
          <AthleteReadinessStack
            :domains="activeDomains"
            :responses="responses"
            :readiness-score="summary.readinessScore"
            :layer-scores="summary.layerScores"
            :show-review-indicators="true"
            :review-layer-keys="reviewLayerKeys"
          />
          <div class="ar-side-card">
            <h3>Daily recommendation</h3>
            <p class="ar-rec-status">{{ summary.recommendation?.status }}</p>
            <p>{{ summary.recommendation?.message }}</p>
            <p class="ar-fine">
              Coaches should enter the final training decision. This tool does not automatically prescribe
              training changes or determine eligibility.
            </p>
          </div>
        </div>

        <AthleteReadinessRadarStrip
          class="ar-radar"
          :domains="activeDomains"
          :responses="responses"
        />

        <div class="ar-two">
          <div class="ar-panel">
            <h2>Strongest readiness areas</h2>
            <ul>
              <li v-for="s in summary.strongest" :key="s.domainKey">
                <span :style="{ color: s.color }">{{ s.label }}</span> — {{ s.score }}/10
              </li>
            </ul>
          </div>
          <div class="ar-panel">
            <h2>Current limiters</h2>
            <ul>
              <li v-for="s in summary.limiters" :key="s.domainKey">
                <span :style="{ color: s.color }">{{ s.label }}</span> — {{ s.score }}/10
              </li>
            </ul>
          </div>
        </div>

        <div v-if="summary.insights?.length" class="ar-panel">
          <h2>Insights</h2>
          <ul>
            <li v-for="(ins, i) in summary.insights" :key="i">{{ ins }}</li>
          </ul>
        </div>

        <div v-if="summary.indicators?.length" class="ar-panel">
          <h2>Coach-review indicators</h2>
          <ul>
            <li v-for="ind in summary.indicators" :key="ind.key">{{ ind.message }}</li>
          </ul>
        </div>

        <div v-if="supportList.length" class="ar-panel">
          <h2>Support requests</h2>
          <ul>
            <li v-for="s in supportList" :key="s.domainKey">
              {{ s.label }} — {{ supportLabel(s.supportPreference) }}
            </li>
          </ul>
        </div>

        <div class="ar-panel">
          <h2>Personal readiness actions</h2>
          <p class="ar-fine">General actions — not medical treatment instructions.</p>
          <div class="ar-chips">
            <button
              v-for="a in ACTION_OPTIONS"
              :key="a"
              type="button"
              class="ar-chip"
              :class="{ on: selectedActions.includes(a) }"
              @click="toggleAction(a)"
            >
              {{ a }}
            </button>
          </div>
        </div>

        <div class="ar-actions">
          <button type="button" class="ar-btn primary" @click="downloadPdf">Download / print PDF</button>
          <button type="button" class="ar-btn ghost" @click="downloadJson">Download JSON</button>
          <button type="button" class="ar-btn ghost" @click="resetGuest">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import AthleteReadinessStack from '../../components/athleteReadiness/AthleteReadinessStack.vue';
import AthleteReadinessRadarStrip from '../../components/athleteReadiness/AthleteReadinessRadarStrip.vue';
import {
  MODE_OPTIONS,
  SUPPORT_OPTIONS,
  ACTION_OPTIONS,
  DOMAIN_QUESTIONS,
  DOMAIN_REFLECTION_PROMPTS,
  LAYER_META,
  domainsForMode,
  interpretScore,
  buildAthleteReadinessSummary
} from '../../utils/athleteReadiness.js';

const route = useRoute();
const isGuest = computed(() => !!route.meta?.guestAthleteReadiness);
const GUEST_KEY = 'ar-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const mode = ref('daily');
const domainIndex = ref(0);
const responses = ref([]);
const saveStatus = ref('');
const selectedActions = ref([]);
const liveAnnouncement = ref('');

const activeDomains = computed(() => domainsForMode(template.value, mode.value));
const activeDomain = computed(() => activeDomains.value[domainIndex.value] || null);
const responseMap = computed(() => {
  const m = {};
  for (const r of responses.value) m[r.domainKey] = r;
  return m;
});
const currentScore = computed(() => responseMap.value[activeDomain.value?.key]?.score ?? null);
const currentChips = computed(() => responseMap.value[activeDomain.value?.key]?.reflectionChips || []);
const currentBodyAreas = computed(() => responseMap.value[activeDomain.value?.key]?.bodyAreas || []);
const currentSupport = computed(
  () => responseMap.value[activeDomain.value?.key]?.supportPreference || 'none'
);
const currentNote = computed(() => responseMap.value[activeDomain.value?.key]?.note || '');

const reflectionOptions = computed(() => {
  const d = activeDomain.value;
  if (!d) return [];
  return d.reflectionOptions || [];
});
const bodyAreaOptions = computed(() => activeDomain.value?.bodyAreas || []);

const summary = computed(() =>
  buildAthleteReadinessSummary(template.value, responses.value, mode.value)
);

const scoredCount = computed(
  () => activeDomains.value.filter((d) => responseMap.value[d.key]?.score != null).length
);
const progressPct = computed(() => {
  if (!activeDomains.value.length) return 0;
  return Math.round((scoredCount.value / activeDomains.value.length) * 100);
});

const modeLabel = computed(
  () => MODE_OPTIONS.find((m) => m.id === mode.value)?.label || mode.value
);

const nextDomainLabel = computed(() => {
  const next = activeDomains.value[domainIndex.value + 1];
  return next?.shortLabel || next?.label || 'next';
});

const reviewLayerKeys = computed(() => {
  const keys = new Set();
  for (const ind of summary.value.indicators || []) {
    if (ind.key.includes('recovery')) keys.add('recovery');
    if (ind.key.includes('physical') || ind.key.includes('comfort')) keys.add('physical');
    if (ind.key.includes('stress') || ind.key.includes('focus')) {
      keys.add('mental');
      keys.add('emotional');
    }
    if (ind.key.includes('confidence') || ind.key.includes('competition')) keys.add('competitive');
    if (ind.key.includes('motivation')) keys.add('mental');
  }
  return [...keys];
});

const supportList = computed(() =>
  activeDomains.value
    .map((d) => {
      const r = responseMap.value[d.key];
      if (!r?.supportPreference || r.supportPreference === 'none') return null;
      return { domainKey: d.key, label: d.label, supportPreference: r.supportPreference };
    })
    .filter(Boolean)
);

const urgentMessage = computed(
  () =>
    template.value?.settings?.urgentMessage ||
    'Your response may require prompt follow-up before training. Please contact the athletic trainer or designated medical professional. This assessment is not a medical diagnosis.'
);

const showUrgentBanner = computed(() => {
  if (activeDomain.value?.key !== 'soreness') return false;
  if (currentScore.value != null && currentScore.value <= 2) return true;
  return summary.value.showUrgentFollowUp;
});

function domainQuestion(key) {
  return DOMAIN_QUESTIONS[key] || `How would you rate ${key}?`;
}
function domainReflectionPrompt(key) {
  return DOMAIN_REFLECTION_PROMPTS[key] || 'What stands out about this area?';
}
function layerLabel(key) {
  return LAYER_META.find((l) => l.key === key)?.label || key;
}
function supportLabel(id) {
  return SUPPORT_OPTIONS.find((o) => o.id === id)?.label || id;
}

function persistGuest() {
  if (!isGuest.value) return;
  try {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({
        step: step.value,
        mode: mode.value,
        domainIndex: domainIndex.value,
        responses: responses.value,
        selectedActions: selectedActions.value,
        templateId: template.value?.id,
        savedAt: new Date().toISOString()
      })
    );
    saveStatus.value = 'Saved';
  } catch {
    saveStatus.value = 'Stored offline';
  }
}

watch([step, mode, domainIndex, responses, selectedActions], () => persistGuest(), { deep: true });

function ensureResponse(key) {
  if (!responseMap.value[key]) {
    responses.value = [
      ...responses.value,
      {
        domainKey: key,
        score: null,
        reflectionChips: [],
        bodyAreas: [],
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
  const interp = interpretScore(n, activeDomain.value?.scoreLabels || {});
  const overall = buildAthleteReadinessSummary(
    template.value,
    responses.value.map((r) => (r.domainKey === key ? { ...r, score: n } : r)),
    mode.value
  );
  liveAnnouncement.value = `${activeDomain.value.label} updated to ${n} out of 10. ${interp}. Overall Readiness is now ${overall.readinessScore ?? '—'} out of 100. Current status: ${overall.readinessStatus || 'building'}.`;
}

function toggleChip(chip) {
  const key = activeDomain.value?.key;
  const set = new Set(currentChips.value);
  if (set.has(chip)) set.delete(chip);
  else set.add(chip);
  patchResponse(key, { reflectionChips: [...set] });
}

function toggleBodyArea(area) {
  const key = activeDomain.value?.key;
  const set = new Set(currentBodyAreas.value);
  if (set.has(area)) set.delete(area);
  else set.add(area);
  patchResponse(key, { bodyAreas: [...set] });
}

function setSupport(id) {
  patchResponse(activeDomain.value?.key, { supportPreference: id });
}

function setNote(v) {
  patchResponse(activeDomain.value?.key, { note: v });
}

function toggleAction(a) {
  const set = new Set(selectedActions.value);
  if (set.has(a)) set.delete(a);
  else set.add(a);
  selectedActions.value = [...set];
}

function startCheckIn() {
  domainIndex.value = 0;
  step.value = 'checkin';
}

function prevDomain() {
  if (domainIndex.value > 0) domainIndex.value -= 1;
}

function nextDomain() {
  if (domainIndex.value >= activeDomains.value.length - 1) {
    step.value = 'complete';
  } else {
    domainIndex.value += 1;
  }
}

function reviewResponses() {
  domainIndex.value = 0;
  step.value = 'checkin';
}

function jumpToLayer(layerKey) {
  const idx = activeDomains.value.findIndex((d) => d.readinessLayer === layerKey);
  if (idx >= 0) domainIndex.value = idx;
}

function buildExport() {
  return {
    type: 'athlete_performance_readiness_guest',
    title: 'Athlete Performance Readiness Assessment',
    boardName: 'Performance Readiness Board',
    resultTitle: 'Your Readiness Report',
    mode: mode.value,
    exportedAt: new Date().toISOString(),
    summary: summary.value,
    responses: responses.value,
    selectedActions: selectedActions.value,
    disclaimer:
      'Not a medical diagnosis, injury evaluation, or replacement for qualified medical advice. Does not automatically determine eligibility to train or compete.'
  };
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(buildExport(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `athlete-readiness-${new Date().toISOString().slice(0, 10)}.json`;
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
  selectedActions.value = [];
  domainIndex.value = 0;
  mode.value = 'daily';
  step.value = 'welcome';
  liveAnnouncement.value = '';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/athlete-readiness/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.domains?.length) {
      error.value =
        'Athlete Readiness template is not available yet. Run migration 919 on the database.';
      return;
    }
    if (isGuest.value) {
      try {
        const raw = localStorage.getItem(GUEST_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.mode) mode.value = cached.mode;
          if (cached?.responses) responses.value = cached.responses;
          if (cached?.selectedActions) selectedActions.value = cached.selectedActions;
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
.ar-page {
  --ar-ink: #0b1220;
  --ar-muted: #64748b;
  --ar-line: #dbe3f0;
  --ar-accent: #0ea5e9;
  --ar-bg0: #f1f5f9;
  --ar-bg1: #e2e8f0;
  min-height: 100vh;
  background:
    radial-gradient(1200px 500px at 10% -10%, #bae6fd88, transparent 55%),
    radial-gradient(900px 400px at 90% 0%, #c4b5fd55, transparent 50%),
    linear-gradient(180deg, var(--ar-bg0), #fff 40%, var(--ar-bg1));
  color: var(--ar-ink);
  font-family: 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif;
  padding: 1.25rem 1rem 3rem;
}

.ar-state {
  max-width: 40rem;
  margin: 4rem auto;
  text-align: center;
  color: var(--ar-muted);
}
.ar-state.error {
  color: #b91c1c;
}

.ar-shell {
  max-width: 1100px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--ar-line);
  border-radius: 20px;
  padding: 1.5rem 1.35rem 1.75rem;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.06);
}
.ar-shell--narrow {
  max-width: 640px;
}
.ar-shell--wide {
  max-width: 1180px;
}

.ar-eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ar-muted);
  font-weight: 700;
}
.ar-save {
  margin-left: 0.75rem;
  letter-spacing: 0;
  text-transform: none;
  font-weight: 600;
  color: #059669;
}
.ar-title {
  margin: 0.35rem 0 0.5rem;
  font-size: clamp(1.55rem, 3vw, 2.15rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.ar-lead {
  margin: 0;
  color: #334155;
  line-height: 1.55;
  font-size: 1.02rem;
}
.ar-note,
.ar-fine,
.ar-meta {
  color: var(--ar-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}
.ar-meta {
  margin-top: 1rem;
  font-weight: 600;
}

.ar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.5rem;
}
.ar-btn {
  appearance: none;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: var(--ar-ink);
  font-weight: 700;
  font-size: 0.95rem;
  padding: 0.7rem 1.15rem;
  cursor: pointer;
}
.ar-btn.primary {
  background: linear-gradient(135deg, #0369a1, #0ea5e9);
  border-color: transparent;
  color: #fff;
}
.ar-btn.ghost {
  background: transparent;
}
.ar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ar-btn:focus-visible {
  outline: 2px solid var(--ar-accent);
  outline-offset: 2px;
}

.ar-list {
  padding-left: 1.2rem;
  color: #334155;
  line-height: 1.55;
}

.ar-mode-grid {
  display: grid;
  gap: 0.65rem;
  margin-top: 1rem;
}
.ar-mode {
  text-align: left;
  border: 1px solid var(--ar-line);
  border-radius: 14px;
  background: #fff;
  padding: 0.9rem 1rem;
  cursor: pointer;
  display: grid;
  gap: 0.25rem;
}
.ar-mode strong {
  font-size: 1rem;
}
.ar-mode span {
  color: var(--ar-muted);
  font-size: 0.88rem;
}
.ar-mode em {
  font-style: normal;
  font-size: 0.75rem;
  font-weight: 700;
  color: #0369a1;
}
.ar-mode.on {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 2px #bae6fd;
}

.ar-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}
.ar-count {
  flex-shrink: 0;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  padding: 0.65rem 0.85rem;
  font-size: 0.82rem;
  font-weight: 700;
}
.ar-count--score {
  text-align: center;
  min-width: 5.5rem;
}
.ar-count--score strong {
  display: block;
  font-size: 1.6rem;
  line-height: 1;
}
.ar-progress {
  height: 6px;
  background: #e2e8f0;
  border-radius: 999px;
  margin: 1rem 0 1.25rem;
  overflow: hidden;
}
.ar-progress > div {
  height: 100%;
  background: linear-gradient(90deg, #0369a1, #22d3ee);
  transition: width 0.3s ease;
}

.ar-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 1.25rem;
  align-items: start;
}
.ar-side {
  position: sticky;
  top: 1rem;
  display: grid;
  gap: 0.85rem;
}
.ar-mobile-score {
  display: none;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  color: var(--ar-muted);
}
.ar-mobile-score strong {
  color: var(--ar-ink);
  font-size: 1.2rem;
}

.ar-q {
  margin: 0 0 0.65rem;
  font-size: 1.2rem;
}
.ar-scale-ends {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--ar-muted);
  margin-bottom: 0.45rem;
}
.ar-score-row {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.35rem;
}
.ar-score-btn {
  appearance: none;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 10px;
  min-height: 44px;
  font-weight: 800;
  cursor: pointer;
  color: #0f172a;
}
.ar-score-btn.active {
  color: #fff;
}
.ar-score-btn:focus-visible {
  outline: 2px solid var(--ar-accent);
  outline-offset: 2px;
}

.ar-interp {
  margin: 0.85rem 0 0;
  font-weight: 600;
  color: #0f172a;
}
.ar-reflect {
  margin-top: 1.15rem;
  display: grid;
  gap: 0.65rem;
}
.ar-reflect h3 {
  margin: 0.35rem 0 0;
  font-size: 0.95rem;
}
.ar-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.ar-chip {
  appearance: none;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 0.4rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.ar-chip.on {
  background: #0f172a;
  border-color: #0f172a;
  color: #fff;
}

.ar-support {
  display: grid;
  gap: 0.35rem;
}
.ar-support__opt {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  font-size: 0.9rem;
  cursor: pointer;
}
.ar-note-field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ar-muted);
}
.ar-note-field textarea {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 0.65rem 0.75rem;
  font: inherit;
  color: var(--ar-ink);
  resize: vertical;
}

.ar-urgent {
  background: #fff7ed;
  border: 1px solid #fdba74;
  color: #9a3412;
  border-radius: 12px;
  padding: 0.75rem 0.9rem;
  font-size: 0.9rem;
  line-height: 1.45;
}

.ar-side-card,
.ar-panel {
  background: #fff;
  border: 1px solid var(--ar-line);
  border-radius: 14px;
  padding: 0.95rem 1rem;
}
.ar-side-card h3 {
  margin: 0.55rem 0 0.2rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ar-muted);
}
.ar-side-card h3:first-child {
  margin-top: 0;
}
.ar-side-card p {
  margin: 0;
  font-weight: 700;
}
.ar-indicators {
  margin: 0.65rem 0 0;
  padding-left: 1rem;
  font-size: 0.8rem;
  color: #92400e;
  font-weight: 500;
}

.ar-footer {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1.35rem;
  padding-top: 1rem;
  border-top: 1px solid var(--ar-line);
  position: sticky;
  bottom: 0;
  background: linear-gradient(180deg, transparent, #fff 30%);
  padding-bottom: 0.25rem;
}

.ar-complete {
  text-align: center;
}
.ar-complete-score {
  margin: 1rem 0 0.5rem;
  font-size: 3.4rem;
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1;
}
.ar-complete-score small {
  font-size: 1.1rem;
  color: var(--ar-muted);
  font-weight: 700;
}
.ar-status-pill {
  display: inline-block;
  background: #0f172a;
  color: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-weight: 700;
  font-size: 0.9rem;
}
.ar-complete-meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin: 1.25rem 0;
  text-align: left;
}
.ar-complete-meta dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ar-muted);
}
.ar-complete-meta dd {
  margin: 0.2rem 0 0;
  font-weight: 700;
}
.ar-complete-stack {
  text-align: left;
  margin: 1rem 0;
}

.ar-results-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 1rem;
  margin: 1rem 0;
}
.ar-radar {
  margin: 1rem 0;
}
.ar-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 1rem 0;
}
.ar-panel h2 {
  margin: 0 0 0.55rem;
  font-size: 1rem;
}
.ar-panel ul {
  margin: 0;
  padding-left: 1.1rem;
  line-height: 1.55;
}
.ar-rec-status {
  font-weight: 800;
  font-size: 1.1rem;
  margin: 0 0 0.35rem;
}

@media (max-width: 900px) {
  .ar-layout,
  .ar-results-grid,
  .ar-two {
    grid-template-columns: 1fr;
  }
  .ar-side {
    position: static;
    order: -1;
  }
  .ar-side :deep(.ars) {
    display: none;
  }
  .ar-mobile-score {
    display: block;
  }
  .ar-complete-meta {
    grid-template-columns: 1fr;
  }
  .ar-score-row {
    gap: 0.3rem;
  }
  .ar-btn--sticky {
    flex: 1;
  }
}

@media print {
  .ar-page {
    background: #fff;
    padding: 0;
  }
  .ar-actions,
  .ar-footer,
  .ar-save {
    display: none !important;
  }
  .ar-shell {
    box-shadow: none;
    border: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ar-progress > div {
    transition: none;
  }
}
</style>
