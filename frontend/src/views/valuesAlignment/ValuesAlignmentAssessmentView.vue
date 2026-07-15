<template>
  <div class="va-page">
    <div v-if="loading" class="va-state">Loading Values Alignment Assessment…</div>
    <div v-else-if="error" class="va-state error">{{ error }}</div>
    <template v-else-if="template">
      <!-- Welcome -->
      <section v-if="step === 'welcome'" class="va-shell va-shell--narrow">
        <p class="va-eyebrow">Values Alignment Assessment</p>
        <h1 class="va-title">Are You Living What Matters Most?</h1>
        <p class="va-lead">
          Your values influence the choices you make, the relationships you build, and the life you create.
          This assessment will help you identify what matters most and explore how closely your current life
          reflects those priorities.
        </p>
        <p class="va-note">
          There are no correct values and no ideal score. The goal is not perfection—it is greater awareness
          and intentional alignment.
        </p>
        <p class="va-meta">About 10–15 minutes</p>
        <div class="va-actions">
          <button type="button" class="va-btn primary" @click="step = 'explore'">Explore My Values</button>
          <button type="button" class="va-btn ghost" @click="step = 'how'">How This Works</button>
        </div>
      </section>

      <section v-else-if="step === 'how'" class="va-shell va-shell--narrow">
        <h1 class="va-title">How This Works</h1>
        <ol class="va-steps">
          <li>Explore and select the values that feel most meaningful.</li>
          <li>Narrow and rank the ones you would protect first.</li>
          <li>Rate how important each value is—and how consistently you live it.</li>
          <li>Review your Values Compass and choose where to act.</li>
          <li>Create a small alignment commitment you can keep.</li>
        </ol>
        <div class="va-actions">
          <button type="button" class="va-btn primary" @click="step = 'explore'">Begin</button>
        </div>
      </section>

      <!-- Explore / select -->
      <section v-else-if="step === 'explore'" class="va-shell">
        <header class="va-header">
          <div>
            <p class="va-eyebrow">Step 1 · Values exploration</p>
            <h1 class="va-title">Choose what matters most</h1>
            <p class="va-lead">Choose the values that feel most important to the life you want to build.</p>
          </div>
          <div class="va-count" :data-ready="selectedKeys.length >= minSelect">
            {{ selectedKeys.length }} of {{ maxSelect }} selected
            <span v-if="selectedKeys.length < minSelect">(min {{ minSelect }})</span>
          </div>
        </header>
        <div v-for="cat in categoryOrder" :key="cat" class="va-group">
          <h2>{{ categoryLabels[cat] }}</h2>
          <div class="va-cards">
            <button
              v-for="v in valuesByCategory(cat)"
              :key="v.key"
              type="button"
              class="va-card"
              :class="{ selected: selectedKeys.includes(v.key) }"
              :disabled="!selectedKeys.includes(v.key) && selectedKeys.length >= maxSelect"
              @click="toggleSelect(v.key)"
            >
              <span class="va-card__swatch" :style="{ background: v.color }" />
              <strong>{{ v.label }}</strong>
              <span>{{ v.definition }}</span>
            </button>
          </div>
        </div>
        <footer class="va-footer">
          <button type="button" class="va-btn ghost" @click="step = 'welcome'">Back</button>
          <button
            type="button"
            class="va-btn primary"
            :disabled="selectedKeys.length < minSelect"
            @click="goRank"
          >
            Continue to prioritize →
          </button>
        </footer>
      </section>

      <!-- Rank -->
      <section v-else-if="step === 'rank'" class="va-shell va-shell--narrow">
        <p class="va-eyebrow">Step 2 · Values ladder</p>
        <h1 class="va-title">Protect what matters most</h1>
        <p class="va-lead">
          If you could protect only a few values during a difficult season, which ones would matter most?
          Narrow to {{ minRank }}–{{ maxRank }} and arrange your ladder.
        </p>
        <ol class="va-ladder">
          <li v-for="(key, idx) in rankedKeys" :key="key" class="va-ladder__row">
            <span class="va-ladder__n">{{ idx + 1 }}</span>
            <span class="va-ladder__label" :style="{ borderColor: valueMap[key]?.color }">
              {{ valueMap[key]?.label || key }}
            </span>
            <div class="va-ladder__moves">
              <button type="button" :disabled="idx === 0" @click="moveRank(idx, -1)">Up</button>
              <button type="button" :disabled="idx === rankedKeys.length - 1" @click="moveRank(idx, 1)">Down</button>
              <button type="button" :disabled="idx === 0" @click="moveRankTo(idx, 0)">Top</button>
              <button type="button" :disabled="idx === rankedKeys.length - 1" @click="moveRankTo(idx, rankedKeys.length - 1)">Bottom</button>
              <button type="button" class="danger" @click="removeFromRank(key)">Remove</button>
            </div>
          </li>
        </ol>
        <div v-if="availableForRank.length" class="va-pool">
          <p>Add from your selection:</p>
          <button
            v-for="key in availableForRank"
            :key="key"
            type="button"
            class="va-chip"
            :disabled="rankedKeys.length >= maxRank"
            @click="addToRank(key)"
          >
            + {{ valueMap[key]?.label }}
          </button>
        </div>
        <footer class="va-footer">
          <button type="button" class="va-btn ghost" @click="step = 'explore'">Back</button>
          <button
            type="button"
            class="va-btn primary"
            :disabled="rankedKeys.length < minRank"
            @click="startScoring"
          >
            Rate importance &amp; alignment →
          </button>
        </footer>
      </section>

      <!-- Score -->
      <section v-else-if="step === 'score'" class="va-shell">
        <header class="va-header">
          <div>
            <p class="va-eyebrow">Values Alignment Assessment</p>
            <h1 class="va-title">{{ activeValue?.label }}</h1>
            <p class="va-lead">{{ activeValue?.definition }}</p>
          </div>
          <div class="va-count">{{ scoredCount }} of {{ rankedKeys.length }} values completed</div>
        </header>
        <div class="va-progress"><div :style="{ width: scoreProgress + '%' }" /></div>

        <div class="va-columns">
          <div class="va-main">
            <div class="va-score-block">
              <h2>How important is this value in the life you want to build?</h2>
              <p class="va-scale-hint">1 — Not central right now · 5 — Meaningful · 10 — Essential</p>
              <div class="va-score-row" role="radiogroup" aria-label="Importance score">
                <button
                  v-for="n in 10"
                  :key="`imp-${n}`"
                  type="button"
                  class="va-score-btn"
                  :class="{ active: currentImportance === n }"
                  :style="currentImportance === n ? { background: activeValue?.color, borderColor: activeValue?.color } : null"
                  @click="setImportance(n)"
                >
                  {{ n }}
                </button>
              </div>
            </div>

            <div v-if="currentImportance != null" class="va-score-block">
              <h2>How consistently does your current life reflect this value?</h2>
              <p class="va-scale-hint">
                Consider your choices, routines, relationships, and use of time during the past four weeks.
                1 — Rarely reflected · 5 — Sometimes · 10 — Consistently reflected
              </p>
              <div class="va-score-row" role="radiogroup" aria-label="Alignment score">
                <button
                  v-for="n in 10"
                  :key="`al-${n}`"
                  type="button"
                  class="va-score-btn"
                  :class="{ active: currentAlignment === n }"
                  :style="currentAlignment === n ? { background: activeValue?.color, borderColor: activeValue?.color } : null"
                  @click="setAlignment(n)"
                >
                  {{ n }}
                </button>
              </div>
              <p v-if="currentGap != null" class="va-gap-live" role="status" aria-live="polite">
                Gap: {{ currentGap }} — {{ currentStatus }}
                <span v-if="currentAlignment > currentImportance"> · More present than currently prioritized.</span>
              </p>
            </div>

            <div v-if="currentImportance != null && currentAlignment != null" class="va-reflect">
              <h2>What is helping or preventing you from living this value more consistently?</h2>
              <div class="va-chips">
                <button
                  v-for="chip in reflectionChips"
                  :key="chip"
                  type="button"
                  class="va-chip"
                  :class="{ on: currentChips.includes(chip) }"
                  @click="toggleChip(chip)"
                >
                  {{ chip }}
                </button>
              </div>
              <details class="va-note-box">
                <summary>What would living this value one point more consistently look like?</summary>
                <textarea v-model="currentNote" rows="3" @change="persistActive" />
              </details>
            </div>

            <footer class="va-footer sticky">
              <button type="button" class="va-btn ghost" :disabled="scoreIndex === 0" @click="scoreIndex -= 1">Back</button>
              <button
                type="button"
                class="va-btn primary"
                :disabled="currentImportance == null || currentAlignment == null"
                @click="nextScore"
              >
                {{ scoreIndex >= rankedKeys.length - 1 ? 'Review Values Compass →' : 'Continue to next value →' }}
              </button>
            </footer>
          </div>

          <aside class="va-aside">
            <h2 class="va-aside-title">Your Values Compass</h2>
            <ValuesCompass
              mode="bars"
              :values="template.values"
              :responses="responses"
              :ordered-keys="rankedKeys"
              :active-value-id="activeKey"
              :interactive="true"
              :animated="true"
              @value-select="jumpToValue"
            />
          </aside>
        </div>
      </section>

      <!-- Review -->
      <section v-else-if="step === 'review'" class="va-shell">
        <p class="va-eyebrow">Your Values Compass</p>
        <h1 class="va-title">Your Values Compass</h1>
        <p class="va-lead">
          This snapshot shows which values matter most to you and how closely your current life reflects them.
        </p>

        <div class="va-summary-grid">
          <div class="va-stat"><span>Average Importance</span><strong>{{ summary.averageImportance ?? '—' }}</strong></div>
          <div class="va-stat"><span>Average Alignment</span><strong>{{ summary.averageAlignment ?? '—' }}</strong></div>
          <div class="va-stat"><span>Average Gap</span><strong>{{ summary.averageGap ?? '—' }}</strong></div>
          <div class="va-stat highlight"><span>Overall</span><strong>{{ summary.alignmentLevel || '—' }}</strong></div>
          <div class="va-stat"><span>Strongly Aligned</span><strong>{{ summary.stronglyAlignedCount }}</strong></div>
          <div class="va-stat"><span>Priority Opportunities</span><strong>{{ summary.priorityOpportunityCount }}</strong></div>
        </div>

        <div class="va-columns">
          <div class="va-main">
            <ValuesCompass
              mode="bars"
              :values="template.values"
              :responses="responses"
              :ordered-keys="rankedKeys"
              :interactive="false"
            />
            <h2 class="va-section">Quadrant map</h2>
            <ValuesCompass
              mode="quadrant"
              :values="template.values"
              :responses="responses"
              :ordered-keys="rankedKeys"
              :interactive="false"
            />
          </div>
          <aside class="va-aside">
            <div v-if="summary.coreStrengths?.length" class="va-insight-block">
              <h3>Core Strengths</h3>
              <article v-for="x in summary.coreStrengths" :key="x.valueKey">
                <strong>{{ x.label }}</strong>
                <p>Importance {{ x.importanceScore }} · Alignment {{ x.alignmentScore }}</p>
                <p class="muted">Your actions appear to consistently reflect this value.</p>
              </article>
            </div>
            <div v-if="summary.priorityOpportunities?.length" class="va-insight-block">
              <h3>Priority Opportunities</h3>
              <article v-for="x in summary.priorityOpportunities" :key="x.valueKey">
                <strong>{{ x.label }}</strong>
                <p>Importance {{ x.importanceScore }} · Alignment {{ x.alignmentScore }} · Gap {{ x.gap }}</p>
                <p class="muted">This value matters deeply to you but may not currently have enough space in your life.</p>
              </article>
            </div>
            <div v-if="summary.insights?.length" class="va-insight-block">
              <h3>Insights</h3>
              <p v-for="(line, i) in summary.insights" :key="i" class="muted">{{ line }}</p>
            </div>
          </aside>
        </div>

        <footer class="va-footer">
          <button type="button" class="va-btn ghost" @click="step = 'score'; scoreIndex = 0">Edit scores</button>
          <button type="button" class="va-btn primary" @click="step = 'priorities'">Choose focus values →</button>
        </footer>
      </section>

      <!-- Priorities -->
      <section v-else-if="step === 'priorities'" class="va-shell va-shell--narrow">
        <h1 class="va-title">Which values would you most like to express more intentionally?</h1>
        <p class="va-lead">Select one to three. You do not have to choose the largest gaps.</p>
        <div class="va-focus-tray" v-if="priorityKeys.length">
          <span>My Focus Values:</span>
          <em v-for="k in priorityKeys" :key="k">{{ valueMap[k]?.label }}</em>
        </div>
        <div class="va-prio-list">
          <label v-for="key in rankedKeys" :key="key" class="va-prio">
            <input
              type="checkbox"
              :checked="priorityKeys.includes(key)"
              :disabled="!priorityKeys.includes(key) && priorityKeys.length >= maxPriorities"
              @change="togglePriority(key, $event.target.checked)"
            />
            <span class="va-dot" :style="{ background: valueMap[key]?.color }" />
            <span class="grow">
              <strong>{{ valueMap[key]?.label }}</strong>
              <small>
                Imp {{ responseMap[key]?.importanceScore }} · Align {{ responseMap[key]?.alignmentScore }} ·
                Gap {{ gapFor(key) }}
              </small>
            </span>
          </label>
        </div>
        <footer class="va-footer">
          <button type="button" class="va-btn ghost" @click="step = 'review'">Back</button>
          <button type="button" class="va-btn primary" :disabled="!priorityKeys.length" @click="goCommitments">
            Create alignment commitments →
          </button>
        </footer>
      </section>

      <!-- Commitments -->
      <section v-else-if="step === 'commitments'" class="va-shell va-shell--narrow">
        <h1 class="va-title">Alignment commitments</h1>
        <p class="va-lead">Turn awareness into one meaningful next step for each focus value.</p>
        <div v-for="key in priorityKeys" :key="key" class="va-commit">
          <h2>{{ valueMap[key]?.label }}</h2>
          <label>
            What would living this value one point more fully look like?
            <textarea v-model="commitmentDrafts[key].title" rows="2" />
          </label>
          <label>
            What is one behavior that would demonstrate this value?
            <input v-model="commitmentDrafts[key].behavior" type="text" />
          </label>
          <label>
            What could interfere with that behavior?
            <input v-model="commitmentDrafts[key].obstacles" type="text" />
          </label>
          <label>
            What boundary or support would make it easier?
            <input v-model="commitmentDrafts[key].supportNeeded" type="text" />
          </label>
          <label>
            When will you take the first step?
            <input v-model="commitmentDrafts[key].targetDate" type="date" />
          </label>
          <label>
            First step
            <input v-model="commitmentDrafts[key].firstStep" type="text" />
          </label>
          <label>
            Confidence (1–10)
            <input v-model.number="commitmentDrafts[key].confidenceScore" type="number" min="1" max="10" />
          </label>
          <p v-if="commitmentDrafts[key].confidenceScore && commitmentDrafts[key].confidenceScore < 7" class="va-hint">
            How could this commitment become smaller or more realistic?
          </p>
        </div>
        <footer class="va-footer">
          <button type="button" class="va-btn ghost" @click="finishAssessment">Skip for now</button>
          <button type="button" class="va-btn primary" @click="finishAssessment">Save &amp; view results</button>
        </footer>
      </section>

      <!-- Done -->
      <section v-else-if="step === 'done'" class="va-shell va-shell--narrow va-print">
        <p class="va-eyebrow">Values Compass</p>
        <h1 class="va-title">Your results</h1>
        <p class="va-lead">
          {{ isGuest
            ? 'Download or print your Values Compass. Nothing was linked to an account.'
            : 'Your Values Alignment Assessment is saved.' }}
        </p>
        <div class="va-summary-grid compact">
          <div class="va-stat"><span>Importance</span><strong>{{ summary.averageImportance }}</strong></div>
          <div class="va-stat"><span>Alignment</span><strong>{{ summary.averageAlignment }}</strong></div>
          <div class="va-stat"><span>Gap</span><strong>{{ summary.averageGap }}</strong></div>
          <div class="va-stat highlight"><span>Level</span><strong>{{ summary.alignmentLevel }}</strong></div>
        </div>
        <ValuesCompass
          mode="bars"
          :values="template.values"
          :responses="responses"
          :ordered-keys="rankedKeys"
          :interactive="false"
        />
        <p v-if="priorityKeys.length" class="va-focus-done">
          Focus values: <strong>{{ priorityKeys.map((k) => valueMap[k]?.label).join(', ') }}</strong>
        </p>
        <div class="va-actions" style="justify-content: center;">
          <button type="button" class="va-btn primary" @click="downloadPdf">Download / print PDF</button>
          <button type="button" class="va-btn ghost" @click="downloadJson">Download JSON</button>
          <button v-if="isGuest" type="button" class="va-btn ghost" @click="resetGuest">Start over</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import ValuesCompass from '../../components/valuesAlignment/ValuesCompass.vue';
import {
  REFLECTION_CHIPS,
  CATEGORY_LABELS,
  calculateAlignmentGap,
  gapStatusLabel,
  buildValuesSummary
} from '../../utils/valuesAlignment.js';

const route = useRoute();
const isGuest = computed(() => !!route.meta?.guestValuesAlignment);
const GUEST_KEY = 'va-guest-assessment-v1';
const quiet = { skipGlobalLoading: true };

const loading = ref(true);
const error = ref('');
const template = ref(null);
const step = ref('welcome');
const selectedKeys = ref([]);
const rankedKeys = ref([]);
const responses = ref([]);
const priorityKeys = ref([]);
const scoreIndex = ref(0);
const saveStatus = ref('');
const commitmentDrafts = reactive({});
const reflectionChips = REFLECTION_CHIPS;
const categoryLabels = CATEGORY_LABELS;
const categoryOrder = ['connection', 'character', 'growth', 'purpose', 'lifestyle'];

const settings = computed(() => template.value?.settings || {});
const minSelect = computed(() => Number(settings.value.minSelect || 5));
const maxSelect = computed(() => Number(settings.value.maxSelect || 12));
const minRank = computed(() => Number(settings.value.minRank || 6));
const maxRank = computed(() => Number(settings.value.maxRank || 8));
const maxPriorities = computed(() => Number(settings.value.maxPriorities || 3));

const valueMap = computed(() => {
  const m = {};
  for (const v of template.value?.values || []) m[v.key] = v;
  return m;
});
const responseMap = computed(() => {
  const m = {};
  for (const r of responses.value) m[r.valueKey] = r;
  return m;
});

const activeKey = computed(() => rankedKeys.value[scoreIndex.value] || '');
const activeValue = computed(() => valueMap.value[activeKey.value] || null);
const currentImportance = computed(() => responseMap.value[activeKey.value]?.importanceScore ?? null);
const currentAlignment = computed(() => responseMap.value[activeKey.value]?.alignmentScore ?? null);
const currentChips = computed(() => responseMap.value[activeKey.value]?.reflectionChips || []);
const currentNote = computed({
  get: () => responseMap.value[activeKey.value]?.note || '',
  set: (v) => patchResponse(activeKey.value, { note: v })
});
const currentGap = computed(() => calculateAlignmentGap(currentImportance.value, currentAlignment.value));
const currentStatus = computed(() => gapStatusLabel(currentGap.value));
const scoredCount = computed(
  () =>
    rankedKeys.value.filter((k) => {
      const r = responseMap.value[k];
      return r?.importanceScore != null && r?.alignmentScore != null;
    }).length
);
const scoreProgress = computed(() => {
  if (!rankedKeys.value.length) return 0;
  return Math.round((scoredCount.value / rankedKeys.value.length) * 100);
});
const availableForRank = computed(() =>
  selectedKeys.value.filter((k) => !rankedKeys.value.includes(k))
);
const summary = computed(() =>
  buildValuesSummary(template.value, responses.value, priorityKeys.value)
);

function valuesByCategory(cat) {
  return (template.value?.values || []).filter((v) => v.category === cat);
}

function gapFor(key) {
  const r = responseMap.value[key];
  return calculateAlignmentGap(r?.importanceScore, r?.alignmentScore);
}

function persistGuest() {
  if (!isGuest.value) return;
  try {
    localStorage.setItem(
      GUEST_KEY,
      JSON.stringify({
        step: step.value,
        selectedKeys: selectedKeys.value,
        rankedKeys: rankedKeys.value,
        responses: responses.value,
        priorityKeys: priorityKeys.value,
        scoreIndex: scoreIndex.value,
        commitmentDrafts: { ...commitmentDrafts },
        templateId: template.value?.id,
        savedAt: new Date().toISOString()
      })
    );
    saveStatus.value = 'Saved';
  } catch {
    saveStatus.value = 'Stored offline';
  }
}

watch([step, selectedKeys, rankedKeys, responses, priorityKeys, scoreIndex], () => persistGuest(), {
  deep: true
});

function toggleSelect(key) {
  if (selectedKeys.value.includes(key)) {
    selectedKeys.value = selectedKeys.value.filter((k) => k !== key);
    rankedKeys.value = rankedKeys.value.filter((k) => k !== key);
  } else if (selectedKeys.value.length < maxSelect.value) {
    selectedKeys.value = [...selectedKeys.value, key];
  }
}

function goRank() {
  rankedKeys.value = [...selectedKeys.value].slice(0, maxRank.value);
  step.value = 'rank';
}

function moveRank(idx, dir) {
  const next = [...rankedKeys.value];
  const j = idx + dir;
  if (j < 0 || j >= next.length) return;
  [next[idx], next[j]] = [next[j], next[idx]];
  rankedKeys.value = next;
}

function moveRankTo(idx, target) {
  const next = [...rankedKeys.value];
  const [item] = next.splice(idx, 1);
  next.splice(target, 0, item);
  rankedKeys.value = next;
}

function removeFromRank(key) {
  rankedKeys.value = rankedKeys.value.filter((k) => k !== key);
}

function addToRank(key) {
  if (rankedKeys.value.length >= maxRank.value) return;
  rankedKeys.value = [...rankedKeys.value, key];
}

function startScoring() {
  scoreIndex.value = 0;
  step.value = 'score';
}

function ensureResponse(key) {
  if (!responseMap.value[key]) {
    responses.value = [
      ...responses.value,
      { valueKey: key, importanceScore: null, alignmentScore: null, reflectionChips: [], note: '' }
    ];
  }
}

function patchResponse(key, patch) {
  ensureResponse(key);
  responses.value = responses.value.map((r) =>
    r.valueKey === key ? { ...r, ...patch } : r
  );
}

function setImportance(n) {
  patchResponse(activeKey.value, { importanceScore: n });
}

function setAlignment(n) {
  patchResponse(activeKey.value, { alignmentScore: n });
}

function toggleChip(chip) {
  const set = new Set(currentChips.value);
  if (set.has(chip)) set.delete(chip);
  else set.add(chip);
  patchResponse(activeKey.value, { reflectionChips: [...set] });
}

function persistActive() {
  persistGuest();
}

function nextScore() {
  if (scoreIndex.value >= rankedKeys.value.length - 1) {
    step.value = 'review';
  } else {
    scoreIndex.value += 1;
  }
}

function jumpToValue(key) {
  const idx = rankedKeys.value.indexOf(key);
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

function goCommitments() {
  for (const key of priorityKeys.value) {
    if (!commitmentDrafts[key]) {
      commitmentDrafts[key] = {
        title: '',
        behavior: '',
        obstacles: '',
        supportNeeded: '',
        firstStep: '',
        targetDate: '',
        confidenceScore: null,
        startingAlignmentScore: responseMap.value[key]?.alignmentScore ?? null,
        desiredAlignmentScore: Math.min(
          10,
          (responseMap.value[key]?.alignmentScore || 5) + 1
        )
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
    type: 'values_alignment_guest',
    title: 'Values Alignment Assessment',
    compassName: 'Values Compass',
    exportedAt: new Date().toISOString(),
    summary: summary.value,
    rankedValues: rankedKeys.value.map((key) => ({
      key,
      label: valueMap.value[key]?.label,
      category: valueMap.value[key]?.category,
      ...(responseMap.value[key] || {})
    })),
    priorityKeys: priorityKeys.value,
    commitments: priorityKeys.value.map((key) => ({
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
  selectedKeys.value = [];
  rankedKeys.value = [];
  responses.value = [];
  priorityKeys.value = [];
  scoreIndex.value = 0;
  Object.keys(commitmentDrafts).forEach((k) => delete commitmentDrafts[k]);
  step.value = 'welcome';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/values-alignment/guest/template', quiet);
    template.value = res.data?.template || null;
    if (!template.value?.values?.length) {
      error.value = 'Values Alignment template is not available yet. Run migration 918.';
      return;
    }
    if (isGuest.value) {
      try {
        const raw = localStorage.getItem(GUEST_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached?.selectedKeys) selectedKeys.value = cached.selectedKeys;
          if (cached?.rankedKeys) rankedKeys.value = cached.rankedKeys;
          if (cached?.responses) responses.value = cached.responses;
          if (cached?.priorityKeys) priorityKeys.value = cached.priorityKeys;
          if (cached?.step) step.value = cached.step;
          if (typeof cached?.scoreIndex === 'number') scoreIndex.value = cached.scoreIndex;
          for (const [k, v] of Object.entries(cached.commitmentDrafts || {})) {
            commitmentDrafts[k] = { ...v };
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
    radial-gradient(700px 360px at 100% 0%, rgba(29, 78, 216, 0.05), transparent 50%),
    var(--va-bg);
  color: var(--va-ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
  padding: 1.5rem 1rem 4rem;
}
.va-title,
.va-aside-title,
.va-section,
.va-commit h2,
.va-group h2 {
  font-family: Fraunces, Georgia, serif;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.va-state {
  max-width: 480px;
  margin: 4rem auto;
  text-align: center;
  color: var(--va-muted);
}
.va-state.error { color: #b91c1c; }
.va-shell {
  max-width: 1100px;
  margin: 0 auto;
}
.va-shell--narrow { max-width: 720px; }
.va-eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #a16207;
}
.va-title {
  margin: 0 0 0.65rem;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  color: var(--va-ink);
}
.va-lead {
  margin: 0 0 1rem;
  color: #44403c;
  line-height: 1.55;
  font-size: 1.05rem;
}
.va-note, .va-meta, .va-scale-hint, .va-hint, .muted {
  color: var(--va-muted);
  line-height: 1.45;
}
.va-actions, .va-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.5rem;
}
.va-footer {
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid var(--va-line);
}
.va-footer.sticky {
  position: sticky;
  bottom: 0;
  background: linear-gradient(transparent, var(--va-bg) 30%);
  padding-bottom: 0.5rem;
  z-index: 5;
}
.va-btn {
  border-radius: 999px;
  border: 1px solid var(--va-line);
  background: #fff;
  color: var(--va-ink);
  font-weight: 700;
  padding: 0.7rem 1.15rem;
  cursor: pointer;
  font-size: 0.95rem;
}
.va-btn.primary {
  background: #1c1917;
  color: #fffaf5;
  border-color: #1c1917;
}
.va-btn.ghost { background: transparent; }
.va-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.va-steps { line-height: 1.7; color: #44403c; }
.va-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.va-count {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--va-muted);
  background: #fff;
  border: 1px solid var(--va-line);
  border-radius: 999px;
  padding: 0.45rem 0.85rem;
}
.va-count[data-ready='true'] { color: #166534; border-color: #bbf7d0; background: #f0fdf4; }
.va-group { margin-bottom: 1.5rem; }
.va-group h2 { font-size: 1.1rem; margin: 0 0 0.75rem; }
.va-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.75rem;
}
.va-card {
  text-align: left;
  border: 1px solid var(--va-line);
  background: var(--va-card);
  border-radius: 14px;
  padding: 0.9rem;
  display: grid;
  gap: 0.35rem;
  cursor: pointer;
  color: inherit;
}
.va-card.selected {
  border-color: #1c1917;
  box-shadow: 0 0 0 1px #1c1917;
}
.va-card strong { font-size: 0.98rem; }
.va-card span:last-child { font-size: 0.82rem; color: var(--va-muted); line-height: 1.4; }
.va-card__swatch { width: 12px; height: 12px; border-radius: 50%; }
.va-ladder { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.55rem; }
.va-ladder__row {
  display: grid;
  grid-template-columns: 2rem 1fr;
  gap: 0.55rem;
  align-items: center;
  background: #fff;
  border: 1px solid var(--va-line);
  border-radius: 12px;
  padding: 0.55rem 0.75rem;
}
.va-ladder__n { font-weight: 800; color: var(--va-muted); }
.va-ladder__label {
  font-weight: 700;
  border-left: 3px solid;
  padding-left: 0.55rem;
}
.va-ladder__moves {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.va-ladder__moves button {
  font-size: 0.72rem;
  border: 1px solid var(--va-line);
  background: #fafaf9;
  border-radius: 8px;
  padding: 0.25rem 0.45rem;
  cursor: pointer;
}
.va-ladder__moves button.danger { color: #9f1239; }
.va-pool { margin-top: 1rem; }
.va-chips, .va-pool {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.va-chip {
  border: 1px solid var(--va-line);
  background: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font-size: 0.82rem;
  cursor: pointer;
}
.va-chip.on { background: #1c1917; color: #fff; border-color: #1c1917; }
.va-progress {
  height: 6px;
  background: #e7e5e4;
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 1.25rem;
}
.va-progress > div {
  height: 100%;
  background: #a16207;
  transition: width 0.35s ease;
}
.va-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
  gap: 1.25rem;
  align-items: start;
}
.va-aside {
  position: sticky;
  top: 1rem;
  background: #fff;
  border: 1px solid var(--va-line);
  border-radius: 16px;
  padding: 1rem;
}
.va-aside-title { margin: 0 0 0.85rem; font-size: 1.15rem; }
.va-score-block { margin-bottom: 1.35rem; }
.va-score-block h2 { font-size: 1.05rem; margin: 0 0 0.45rem; }
.va-score-row { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.va-score-btn {
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 10px;
  border: 1.5px solid var(--va-line);
  background: #fff;
  font-weight: 700;
  cursor: pointer;
}
.va-score-btn.active { color: #fff; }
.va-gap-live {
  margin: 0.75rem 0 0;
  font-weight: 700;
  color: #44403c;
}
.va-note-box { margin-top: 0.85rem; }
.va-note-box textarea,
.va-commit input,
.va-commit textarea {
  width: 100%;
  margin-top: 0.35rem;
  border: 1px solid var(--va-line);
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  background: #fff;
}
.va-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.65rem;
  margin: 1rem 0 1.5rem;
}
.va-summary-grid.compact { margin-bottom: 1rem; }
.va-stat {
  background: #fff;
  border: 1px solid var(--va-line);
  border-radius: 12px;
  padding: 0.75rem;
  display: grid;
  gap: 0.2rem;
}
.va-stat span { font-size: 0.72rem; color: var(--va-muted); font-weight: 650; }
.va-stat strong { font-size: 1.25rem; font-family: Fraunces, Georgia, serif; }
.va-stat.highlight { background: #1c1917; color: #fffaf5; border-color: #1c1917; }
.va-stat.highlight span { color: #a8a29e; }
.va-section { margin: 1.5rem 0 0.75rem; font-size: 1.2rem; }
.va-insight-block {
  margin-bottom: 1.15rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--va-line);
}
.va-insight-block h3 { margin: 0 0 0.55rem; font-size: 0.95rem; }
.va-insight-block article { margin-bottom: 0.75rem; }
.va-insight-block p { margin: 0.15rem 0; font-size: 0.88rem; }
.va-prio-list { display: grid; gap: 0.5rem; }
.va-prio {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  background: #fff;
  border: 1px solid var(--va-line);
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
}
.va-prio .grow { display: grid; gap: 0.1rem; flex: 1; }
.va-prio small { color: var(--va-muted); }
.va-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.va-focus-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
.va-focus-tray em {
  font-style: normal;
  background: #1c1917;
  color: #fff;
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 650;
}
.va-commit {
  background: #fff;
  border: 1px solid var(--va-line);
  border-radius: 14px;
  padding: 1rem;
  margin-bottom: 1rem;
  display: grid;
  gap: 0.65rem;
}
.va-commit h2 { margin: 0; font-size: 1.15rem; }
.va-commit label { display: grid; gap: 0.25rem; font-size: 0.85rem; font-weight: 650; }
.va-focus-done { text-align: center; color: var(--va-muted); }

@media (max-width: 900px) {
  .va-columns { grid-template-columns: 1fr; }
  .va-aside { position: static; order: -1; }
}
@media (prefers-reduced-motion: reduce) {
  .va-progress > div { transition: none; }
}
@media print {
  .va-btn, .va-footer { display: none !important; }
  .va-page { background: #fff; }
}
</style>
