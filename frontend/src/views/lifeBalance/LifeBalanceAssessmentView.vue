<template>
  <div class="lbw-page">
    <div v-if="loading" class="lbw-state">Loading assessment…</div>
    <div v-else-if="error" class="lbw-state error">{{ error }}</div>
    <template v-else-if="assessment">
      <!-- Intro -->
      <section v-if="step === 'intro'" class="lbw-shell lbw-shell--narrow">
        <h1 class="lbw-page-title">Explore Your Life Balance</h1>
        <p class="lbw-lead">
          This assessment will help you reflect on ten important areas of your life.
          There are no right or wrong answers — a snapshot of how life feels right now.
        </p>
        <p class="lbw-helper">About 8–12 minutes</p>
        <div class="lbw-actions">
          <button type="button" class="lbw-btn primary" @click="step = 'instructions'">Begin Assessment</button>
          <button type="button" class="lbw-btn ghost" @click="step = 'instructions'">How it works</button>
        </div>
      </section>

      <!-- Instructions -->
      <section v-else-if="step === 'instructions'" class="lbw-shell lbw-shell--narrow">
        <h1 class="lbw-page-title">How it works</h1>
        <ol class="lbw-steps">
          <li>Read each life area definition.</li>
          <li>Choose a satisfaction score from 1 to 10 and watch the wheel update.</li>
          <li>Then reflect on what would improve that area.</li>
          <li>Click any wheel segment anytime to revisit it.</li>
        </ol>
        <p class="lbw-helper">
          Rate your current satisfaction over the past two to four weeks.
        </p>
        <div class="lbw-actions">
          <button type="button" class="lbw-btn primary" @click="startCategories">Continue</button>
        </div>
      </section>

      <!-- Category assessment -->
      <section v-else-if="step === 'category'" class="lbw-shell">
        <header class="lbw-header">
          <div class="lbw-header__copy">
            <h1 class="lbw-page-title">Life Balance Assessment</h1>
            <p class="lbw-lead">Take a moment to reflect on each area of your life.</p>
          </div>
          <div class="lbw-header__progress">
            <div class="lbw-progress-meta">
              <span>{{ completedCount }} of {{ categories.length }} areas completed</span>
              <span class="lbw-saved" :data-state="saveState">
                <span v-if="saveState === 'saved'" class="lbw-saved__check" aria-hidden="true">✓</span>
                {{ saveLabel }}
              </span>
            </div>
            <div class="lbw-progress-track" role="progressbar" :aria-valuenow="completedCount" :aria-valuemin="0" :aria-valuemax="categories.length">
              <div class="lbw-progress-fill" :style="{ width: progressPct + '%', background: accentColor }" />
            </div>
          </div>
        </header>

        <div class="lbw-columns">
          <div class="lbw-main">
            <div
              class="lbw-cat-banner"
              :style="{
                background: bannerBg,
                '--accent': accentColor
              }"
            >
              <div class="lbw-cat-banner__icon" :style="{ background: tintBackground(accentColor, 0.28) }">
                <LifeBalanceCategoryIcon :category="activeCategory" :alt="activeCategory.label" />
              </div>
              <div class="lbw-cat-banner__body">
                <div class="lbw-cat-banner__top">
                  <p class="lbw-cat-banner__meta">Category {{ categoryIndex + 1 }} of {{ categories.length }}</p>
                  <span class="lbw-rating-badge">
                    <span class="lbw-rating-badge__dot" :style="{ background: accentColor }" />
                    Currently rating
                  </span>
                </div>
                <h2 class="lbw-cat-title">{{ activeCategory.label }}</h2>
                <p class="lbw-cat-desc">{{ activeCategory.description }}</p>
              </div>
            </div>

            <div class="lbw-block">
              <p class="lbw-question">
                {{ activeCategory.questions?.scorePrompt || 'How satisfied are you in this area right now?' }}
              </p>
              <div class="lbw-scale-labels">
                <span>Struggling</span>
                <span>Thriving</span>
              </div>
              <div
                class="lbw-score-row"
                role="radiogroup"
                :aria-label="'Score for ' + activeCategory.label"
                @keydown="onScoreKeydown"
              >
                <button
                  v-for="n in 10"
                  :key="n"
                  type="button"
                  class="lbw-score-btn"
                  :class="{ active: currentScore === n, tinted: currentScore != null && n < currentScore }"
                  :style="scoreBtnStyle(n)"
                  role="radio"
                  :aria-checked="currentScore === n"
                  :tabindex="scoreTabIndex(n)"
                  @click="setScore(n)"
                >
                  {{ n }}
                </button>
              </div>
              <div v-if="currentScore != null" class="lbw-score-live" :style="{ color: accentColor }">
                <p class="lbw-score-live__main">
                  <strong>{{ currentScore }}</strong> — {{ scoreLabel(currentScore) }}
                  <span v-if="currentScore >= 7" aria-hidden="true"> ✨</span>
                </p>
                <p class="lbw-score-live__nudge">{{ scoreEncouragement(currentScore) }}</p>
              </div>
              <p v-else class="lbw-score-live muted">Select a score from 1 (struggling) to 10 (thriving)</p>
            </div>

            <Transition name="lbw-reveal">
              <div v-if="showFollowUp" class="lbw-followup">
                <div v-if="categoryOptions.length" class="lbw-block">
                  <p class="lbw-question">What changes would most improve this area?</p>
                  <p class="lbw-helper">Select all that apply.</p>
                  <div class="lbw-chips">
                    <button
                      v-for="opt in categoryOptions"
                      :key="opt"
                      type="button"
                      class="lbw-chip"
                      :class="{ on: selectedOptions.includes(opt) }"
                      :style="chipStyle(opt)"
                      @click="toggleOption(opt)"
                    >
                      <span v-if="selectedOptions.includes(opt)" class="lbw-chip__check" aria-hidden="true">✓</span>
                      {{ opt }}
                    </button>
                  </div>
                </div>

                <div class="lbw-block lbw-notes">
                  <button
                    v-if="!notesOpen"
                    type="button"
                    class="lbw-notes-toggle"
                    :style="{ color: accentColor }"
                    @click="notesOpen = true"
                  >
                    <span aria-hidden="true">+</span> Add a personal reflection
                  </button>
                  <div v-else class="lbw-notes-panel">
                    <div class="lbw-notes-panel__head">
                      <label for="lbw-note">Personal reflection</label>
                      <button type="button" class="lbw-linkish" @click="collapseNotes">Collapse</button>
                    </div>
                    <textarea
                      id="lbw-note"
                      v-model="currentNote"
                      rows="3"
                      placeholder="What would you like to remember or discuss with your coach?"
                      @blur="saveCurrent"
                    />
                  </div>
                </div>
              </div>
            </Transition>

            <footer class="lbw-footer">
              <button type="button" class="lbw-btn ghost" :disabled="categoryIndex === 0" @click="prevCategory">
                Back
              </button>
              <div class="lbw-footer__next">
                <p v-if="currentScore == null" class="lbw-footer__hint">Choose a score to continue.</p>
                <p v-else-if="nextCategoryMeta" class="lbw-footer__sub">Next: {{ nextCategoryMeta.label }}</p>
                <button
                  type="button"
                  class="lbw-btn primary"
                  :style="{ background: accentColor, borderColor: accentColor }"
                  :disabled="currentScore == null"
                  @click="nextCategory"
                >
                  {{ nextLabel }}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </footer>
          </div>

          <aside class="lbw-aside">
            <LifeBalanceWheel
              :categories="wheelCategories"
              :selected-category-id="focusCategory.key"
              :pulse="wheelPulse"
              :center-title="wheelCenter.title"
              :center-value="wheelCenter.value"
              :center-caption="wheelCenter.caption"
              :center-muted="wheelCenter.muted"
              @category-select="jumpToCategory"
              @category-hover="onWheelHover"
            />

            <div class="lbw-summary" :style="{ borderColor: tintBackground(focusAccent, 0.45) }">
              <div class="lbw-summary__head">
                <div class="lbw-summary__icon" :style="{ background: tintBackground(focusAccent, 0.22) }">
                  <LifeBalanceCategoryIcon :category="focusCategory" :alt="focusCategory.label" />
                </div>
                <div>
                  <h3>{{ focusCategory.label }}</h3>
                  <p class="lbw-helper">Category snapshot</p>
                </div>
              </div>
              <div class="lbw-summary__stats">
                <div>
                  <span class="lbw-summary__label">Current score</span>
                  <strong>{{ focusScore != null ? `${focusScore}/10` : 'Not rated' }}</strong>
                </div>
                <div>
                  <span class="lbw-summary__label">Previous score</span>
                  <strong>{{ focusPreviousDisplay }}</strong>
                </div>
                <div>
                  <span class="lbw-summary__label">Change</span>
                  <strong :class="focusChangeClass">{{ focusChangeDisplay }}</strong>
                </div>
              </div>
              <div class="lbw-insight-row">
                <div v-if="focusScore != null && focusScore >= 7" class="lbw-insight strength">
                  <strong>Your strength</strong>
                  <p>{{ scoreEncouragement(focusScore) }}</p>
                </div>
                <div v-else class="lbw-insight focus">
                  <strong>Potential focus</strong>
                  <p>{{ summaryMessageFor(focusCategory.key, focusScore) }}</p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <p class="lbw-privacy">
          <img src="/assets/life-balance/lock.png" alt="" class="lbw-privacy__icon" />
          Your answers are private and will only be seen by you and your coach.
        </p>
      </section>

      <!-- Review -->
      <section v-else-if="step === 'review'" class="lbw-shell">
        <header class="lbw-header">
          <div class="lbw-header__copy">
            <h1 class="lbw-page-title">Your Life Balance Snapshot</h1>
            <p class="lbw-lead">This wheel reflects how satisfied you feel across life areas right now. Click any area to edit.</p>
          </div>
          <div class="lbw-header__progress">
            <div class="lbw-progress-meta">
              <span>{{ completedCount }} of {{ categories.length }} areas completed</span>
              <span class="lbw-saved" data-state="saved">
                <span class="lbw-saved__check" aria-hidden="true">✓</span>
                Saved
              </span>
            </div>
            <div class="lbw-progress-track">
              <div class="lbw-progress-fill" :style="{ width: '100%', background: '#166534' }" />
            </div>
          </div>
        </header>
        <div class="lbw-columns">
          <div class="lbw-main">
            <ul class="lbw-score-list">
              <li v-for="c in wheelCategories" :key="c.key">
                <button type="button" class="lbw-score-row-btn" @click="jumpToCategory(c.key)">
                  <span class="lbw-score-row-btn__icon" :style="{ background: tintBackground(c.color, 0.2) }">
                    <LifeBalanceCategoryIcon :category="c" :alt="c.label" />
                  </span>
                  <span class="lbw-score-row-btn__label">{{ c.label }}</span>
                  <strong>{{ c.score ?? '—' }}</strong>
                </button>
              </li>
            </ul>
            <p v-if="assessment.summary?.average != null" class="lbw-avg">
              Average satisfaction: <strong>{{ assessment.summary.average }}</strong>
            </p>
            <footer class="lbw-footer">
              <button type="button" class="lbw-btn ghost" @click="step = 'category'; categoryIndex = 0">Edit scores</button>
              <button type="button" class="lbw-btn primary" @click="step = 'priorities'">
                Continue to complete →
              </button>
            </footer>
          </div>
          <aside class="lbw-aside">
            <LifeBalanceWheel
              :categories="wheelCategories"
              :interactive="true"
              center-title="Life Balance"
              :center-value="avgDisplay"
              center-caption="Average"
              @category-select="jumpToCategory"
            />
          </aside>
        </div>
      </section>

      <!-- Priorities -->
      <section v-else-if="step === 'priorities'" class="lbw-shell lbw-shell--narrow">
        <h1 class="lbw-page-title">Where do you want to focus?</h1>
        <p class="lbw-lead">
          Select up to {{ maxPriorities }} areas, then complete your assessment.
          You can add optional goals right after.
        </p>
        <div class="lbw-prio-list">
          <label v-for="c in wheelCategories" :key="c.key" class="lbw-prio">
            <input
              type="checkbox"
              :checked="priorities.includes(c.key)"
              :disabled="!priorities.includes(c.key) && priorities.length >= maxPriorities"
              @change="togglePriority(c.key, $event.target.checked)"
            />
            <span class="lbw-prio__swatch" :style="{ background: c.color }" />
            <span>{{ c.label }}</span>
            <em>{{ c.score }}</em>
          </label>
        </div>
        <p v-if="!priorities.length" class="lbw-footer__hint" style="margin-top: 0.75rem;">
          Select at least one focus area to complete.
        </p>
        <footer class="lbw-footer">
          <button type="button" class="lbw-btn ghost" @click="step = 'review'">Back</button>
          <button
            type="button"
            class="lbw-btn primary"
            :disabled="!priorities.length || completing"
            @click="completeAssessment({ goToGoals: true })"
          >
            {{ completing ? 'Completing…' : 'Complete assessment' }}
          </button>
        </footer>
      </section>

      <!-- Goals -->
      <section v-else-if="step === 'goals'" class="lbw-shell lbw-shell--narrow">
        <h1 class="lbw-page-title">Optional goals</h1>
        <p class="lbw-lead">
          Your assessment is complete. Add a goal for each priority, or submit when you are ready.
        </p>
        <div v-for="key in priorities" :key="key" class="lbw-goal-block">
          <h2>{{ labelFor(key) }}</h2>
          <label>
            Goal statement
            <textarea v-model="goalDrafts[key].statement" rows="2" />
          </label>
          <label>
            First action step
            <input v-model="goalDrafts[key].step" type="text" />
          </label>
          <button type="button" class="lbw-btn ghost" :disabled="savingGoal" @click="saveGoal(key)">Save goal</button>
        </div>
        <footer class="lbw-footer">
          <button type="button" class="lbw-btn ghost" :disabled="submitting" @click="finishAssessment">
            Skip goals
          </button>
          <button type="button" class="lbw-btn primary" :disabled="submitting" @click="submitAndFinish">
            {{ submitting ? 'Submitting…' : 'Submit & finish' }}
          </button>
        </footer>
      </section>

      <!-- Done -->
      <section v-else-if="step === 'done'" class="lbw-shell lbw-shell--narrow lbw-shell--center">
        <h1 class="lbw-page-title">Assessment complete</h1>
        <p class="lbw-lead">Thank you. Your Life Balance Wheel is saved and ready for review.</p>
        <LifeBalanceWheel
          :categories="wheelCategories"
          :interactive="false"
          compact
          center-title="Life Balance"
          :center-value="avgDisplay"
          center-caption="Average"
        />
        <div class="lbw-actions" style="justify-content: center;">
          <button v-if="returnTo" type="button" class="lbw-btn primary" @click="goReturn">Return</button>
          <button v-else type="button" class="lbw-btn ghost" @click="step = 'review'">View snapshot</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import LifeBalanceWheel from '../../components/lifeBalance/LifeBalanceWheel.vue';
import LifeBalanceCategoryIcon from '../../components/lifeBalance/LifeBalanceCategoryIcon.vue';
import { tintBackground, withAlpha } from '../../utils/lifeBalanceColors.js';
import { averageScore } from '../../utils/lifeBalanceWheelGeometry.js';
import { scoreEncouragement } from '../../utils/lifeBalanceIcons.js';

const props = defineProps({
  assessmentId: { type: [Number, String], default: null },
  accessToken: { type: String, default: '' }
});

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref('');
const assessment = ref(null);
const step = ref('intro');
const categoryIndex = ref(0);
const saveStatus = ref('');
const lastSavedAt = ref(null);
const savingGoal = ref(false);
const completing = ref(false);
const submitting = ref(false);
const priorities = ref([]);
const goalDrafts = reactive({});
const notesOpen = ref(false);
const previousByKey = ref({});
const showFollowUp = ref(false);
const wheelPulse = ref(false);
const hoveredCategoryKey = ref(null);
let revealTimer = null;
let pulseTimer = null;

const token = computed(() => props.accessToken || String(route.params.accessToken || ''));
const authId = computed(() => props.assessmentId || route.params.assessmentId || null);
const isPublic = computed(() => !!token.value && !authId.value);

const returnTo = computed(() => {
  const raw = String(route.query.returnTo || '').trim();
  return raw.startsWith('/') ? raw : '';
});

const categories = computed(() => assessment.value?.template?.categories || []);
const activeCategory = computed(() => categories.value[categoryIndex.value] || {});
const maxPriorities = computed(() => Number(assessment.value?.template?.settings?.maxPrioritySelections || 3));
const accentColor = computed(() => activeCategory.value?.color || '#166534');
const bannerBg = computed(() => tintBackground(accentColor.value, 0.2));

const responseMap = computed(() => {
  const map = {};
  for (const r of assessment.value?.responses || []) map[r.categoryKey] = r;
  return map;
});

const currentScore = computed(() => responseMap.value[activeCategory.value.key]?.score ?? null);

const currentNote = ref('');
const selectedOptions = ref([]);

const categoryOptions = computed(() => {
  const opts = activeCategory.value?.questions?.options;
  return Array.isArray(opts) ? opts : [];
});

const completedCount = computed(
  () => (assessment.value?.responses || []).filter((r) => r.score != null).length
);
const progressPct = computed(() => {
  const total = categories.value.length || 1;
  return Math.round((completedCount.value / total) * 100);
});

const saveState = computed(() => {
  if (saveStatus.value === 'Saving…') return 'saving';
  if (saveStatus.value === 'Unable to save') return 'error';
  if (lastSavedAt.value || saveStatus.value === 'Saved') return 'saved';
  return 'idle';
});

const saveLabel = computed(() => {
  if (saveState.value === 'saving') return 'Saving…';
  if (saveState.value === 'error') return 'Unable to save';
  if (saveState.value === 'saved') {
    if (!lastSavedAt.value) return 'Saved';
    const sec = Math.round((Date.now() - lastSavedAt.value) / 1000);
    if (sec < 8) return 'Saved just now';
    if (sec < 60) return `Saved ${sec}s ago`;
    return 'Saved';
  }
  return 'Autosave on';
});

watch(
  () => activeCategory.value?.key,
  (key) => {
    const r = responseMap.value[key] || {};
    currentNote.value = r.note || '';
    selectedOptions.value = [...(r.selectedOptionIds || [])];
    notesOpen.value = !!(r.note && String(r.note).trim());
    // Resume mid-category: show follow-ups immediately if already scored
    showFollowUp.value = r.score != null;
    hoveredCategoryKey.value = null;
    clearTimeout(revealTimer);
    clearTimeout(pulseTimer);
    wheelPulse.value = false;
  },
  { immediate: true }
);

const wheelCategories = computed(() =>
  categories.value.map((c) => ({
    key: c.key,
    label: c.label,
    shortLabel: c.shortLabel,
    color: c.color,
    icon: c.icon,
    score: responseMap.value[c.key]?.score ?? null
  }))
);

const avgDisplay = computed(() => {
  const a = averageScore(wheelCategories.value);
  return a == null ? '—' : String(a);
});

const focusCategory = computed(() => {
  const key = hoveredCategoryKey.value;
  if (key) {
    const found = categories.value.find((c) => c.key === key);
    if (found) return found;
  }
  return activeCategory.value || {};
});

const focusAccent = computed(() => focusCategory.value?.color || accentColor.value);

const focusScore = computed(() => {
  const key = focusCategory.value?.key;
  if (!key) return null;
  return responseMap.value[key]?.score ?? null;
});

const wheelCenter = computed(() => {
  const cat = focusCategory.value;
  const score = focusScore.value;
  const rated = completedCount.value;
  const total = categories.value.length || 10;
  if (rated >= total && !hoveredCategoryKey.value) {
    return {
      title: 'Life Balance',
      value: avgDisplay.value,
      caption: `${rated} of ${total} rated`,
      muted: false
    };
  }
  return {
    title: cat.shortLabel || cat.label || '',
    value: score != null ? `${score} / 10` : 'Not Rated',
    caption: score != null ? scoreLabel(score) : `${rated} of ${total} rated`,
    muted: score == null
  };
});

const focusPrevious = computed(() => {
  const key = focusCategory.value?.key;
  if (!key) return null;
  const prev = previousByKey.value[key];
  return prev == null ? null : Number(prev);
});

const focusPreviousDisplay = computed(() =>
  focusPrevious.value == null ? '—' : `${focusPrevious.value}/10`
);

const focusChangeDisplay = computed(() => {
  if (focusScore.value == null || focusPrevious.value == null) return '—';
  const d = focusScore.value - focusPrevious.value;
  if (d === 0) return '0';
  return d > 0 ? `↑ +${d}` : `↓ ${d}`;
});

const focusChangeClass = computed(() => {
  if (focusScore.value == null || focusPrevious.value == null) return '';
  const d = focusScore.value - focusPrevious.value;
  if (d > 0) return 'up';
  if (d < 0) return 'down';
  return '';
});

function summaryMessageFor(key, score) {
  const prev = key ? previousByKey.value[key] : null;
  if (prev == null) {
    return score == null
      ? 'This will become your baseline once you select a score.'
      : 'This assessment will become your baseline.';
  }
  if (score == null) return 'Select a score to compare with your previous assessment.';
  const d = Number(score) - Number(prev);
  if (d > 0) return 'This area has improved since your last assessment.';
  if (d < 0) return 'This area is lower than your last assessment — worth exploring with your coach.';
  return 'This area is steady compared with your last assessment.';
}

const nextCategoryMeta = computed(() => {
  if (categoryIndex.value >= categories.value.length - 1) return null;
  return categories.value[categoryIndex.value + 1] || null;
});

const nextLabel = computed(() => {
  if (categoryIndex.value >= categories.value.length - 1) return 'Review & complete';
  const next = nextCategoryMeta.value;
  return next ? `Continue to ${next.shortLabel || next.label}` : 'Continue';
});

function scoreLabel(n) {
  if (n == null) return '';
  const labels = {
    1: 'Extremely dissatisfied',
    2: 'Very dissatisfied',
    3: 'Dissatisfied',
    4: 'Below desired level',
    5: 'Mixed',
    6: 'Fairly stable',
    7: 'Generally satisfied',
    8: 'Strong',
    9: 'Highly satisfied',
    10: 'Thriving'
  };
  return labels[n] || '';
}

function scoreBtnStyle(n) {
  const accent = accentColor.value;
  if (currentScore.value === n) {
    return { background: accent, borderColor: accent, color: '#fff' };
  }
  if (currentScore.value != null && n < currentScore.value) {
    return {
      background: tintBackground(accent, 0.28),
      borderColor: withAlpha(accent, 0.35),
      color: '#14532d'
    };
  }
  return {};
}

function chipStyle(opt) {
  if (!selectedOptions.value.includes(opt)) return { '--chip-accent': accentColor.value };
  return {
    background: accentColor.value,
    borderColor: accentColor.value,
    color: '#fff',
    '--chip-accent': accentColor.value
  };
}

function scoreTabIndex(n) {
  if (currentScore.value == null) return n === 1 ? 0 : -1;
  return currentScore.value === n ? 0 : -1;
}

function onScoreKeydown(e) {
  const key = e.key;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
  e.preventDefault();
  let next = currentScore.value ?? 5;
  if (key === 'ArrowLeft' || key === 'ArrowDown') next = Math.max(1, next - 1);
  if (key === 'ArrowRight' || key === 'ArrowUp') next = Math.min(10, next + 1);
  if (key === 'Home') next = 1;
  if (key === 'End') next = 10;
  setScore(next);
}

function onWheelHover(key) {
  hoveredCategoryKey.value = key || null;
}

function collapseNotes() {
  notesOpen.value = false;
}

function scheduleFollowUpReveal({ alreadyOpen = false } = {}) {
  clearTimeout(revealTimer);
  clearTimeout(pulseTimer);
  if (alreadyOpen || showFollowUp.value) {
    showFollowUp.value = true;
    wheelPulse.value = true;
    pulseTimer = setTimeout(() => {
      wheelPulse.value = false;
    }, 420);
    return;
  }
  wheelPulse.value = true;
  pulseTimer = setTimeout(() => {
    wheelPulse.value = false;
  }, 420);
  revealTimer = setTimeout(() => {
    showFollowUp.value = true;
  }, 380);
}

function apiBase() {
  return isPublic.value
    ? `/life-balance/public/${encodeURIComponent(token.value)}`
    : `/life-balance/assessments/${authId.value}`;
}

const quiet = { skipGlobalLoading: true };

async function loadPreviousScores(a) {
  previousByKey.value = {};
  if (!a?.agencyId || isPublic.value) return;
  try {
    const params = { agencyId: a.agencyId };
    let url = null;
    if (a.clientId) url = `/life-balance/subjects/clients/${a.clientId}/assessments`;
    else if (a.subjectUserId) url = `/life-balance/subjects/users/${a.subjectUserId}/assessments`;
    if (!url) return;
    const listRes = await api.get(url, { params, ...quiet });
    const prior = (listRes.data?.assessments || []).find(
      (x) => x.status === 'completed' && Number(x.id) !== Number(a.id)
    );
    if (!prior?.id) return;
    const full = await api.get(`/life-balance/assessments/${prior.id}`, quiet);
    const map = {};
    for (const r of full.data?.assessment?.responses || []) {
      if (r.score != null) map[r.categoryKey] = r.score;
    }
    previousByKey.value = map;
  } catch {
    // optional context — ignore
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const intakeKey = String(route.params.publicKey || route.query.intakeKey || '').trim();
    if (intakeKey && !token.value && !authId.value) {
      const res = await api.post(
        `/life-balance/start/${encodeURIComponent(intakeKey)}`,
        {
          packetToken: route.query.packetToken || null,
          clientId: route.query.clientId || null
        },
        quiet
      );
      assessment.value = res.data?.assessment || null;
      if (assessment.value?.accessToken) {
        await router.replace({
          path: `/lbw/${encodeURIComponent(assessment.value.accessToken)}`,
          query: { returnTo: route.query.returnTo || undefined }
        });
        return;
      }
    } else if (isPublic.value) {
      const res = await api.get(`/life-balance/public/${encodeURIComponent(token.value)}`, quiet);
      assessment.value = res.data?.assessment || null;
    } else if (authId.value) {
      const res = await api.get(`/life-balance/assessments/${authId.value}`, quiet);
      assessment.value = res.data?.assessment || null;
    } else {
      error.value = 'Missing assessment reference';
    }

    const a = assessment.value;
    if (!a) return;

    await loadPreviousScores(a);

    if (a.status === 'completed') {
      step.value = 'done';
      priorities.value = (a.priorities || []).map((p) => p.categoryKey);
    } else {
      const scored = (a.responses || []).filter((r) => r.score != null);
      if (scored.length) {
        step.value = 'category';
        const firstOpen = categories.value.findIndex((c) => !responseMap.value[c.key]?.score);
        categoryIndex.value = firstOpen >= 0 ? firstOpen : 0;
      }
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not load assessment';
  } finally {
    loading.value = false;
  }
}

let saveTimer = null;
async function persistCategory(payload) {
  saveStatus.value = 'Saving…';
  try {
    const res = await api.put(
      `${apiBase()}/categories/${encodeURIComponent(activeCategory.value.key)}`,
      payload,
      quiet
    );
    assessment.value = res.data?.assessment || assessment.value;
    saveStatus.value = 'Saved';
    lastSavedAt.value = Date.now();
  } catch {
    saveStatus.value = 'Unable to save';
  }
}

function scheduleSave(payload) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistCategory(payload), 700);
}

async function setScore(n) {
  const wasOpen = showFollowUp.value;
  const key = activeCategory.value?.key;
  // Optimistic update so the wheel animates immediately
  if (key && assessment.value) {
    const responses = [...(assessment.value.responses || [])];
    const idx = responses.findIndex((r) => r.categoryKey === key);
    const patch = {
      categoryKey: key,
      score: n,
      note: currentNote.value,
      selectedOptionIds: [...selectedOptions.value]
    };
    if (idx >= 0) responses[idx] = { ...responses[idx], ...patch };
    else responses.push(patch);
    assessment.value = { ...assessment.value, responses };
  }
  scheduleFollowUpReveal({ alreadyOpen: wasOpen });
  await persistCategory({
    score: n,
    note: currentNote.value,
    selectedOptionIds: selectedOptions.value
  });
}

function toggleOption(opt) {
  const set = new Set(selectedOptions.value);
  if (set.has(opt)) set.delete(opt);
  else set.add(opt);
  selectedOptions.value = [...set];
  scheduleSave({
    score: currentScore.value,
    note: currentNote.value,
    selectedOptionIds: selectedOptions.value
  });
}

function saveCurrent() {
  scheduleSave({
    score: currentScore.value,
    note: currentNote.value,
    selectedOptionIds: selectedOptions.value
  });
}

function startCategories() {
  step.value = 'category';
  categoryIndex.value = 0;
}

async function nextCategory() {
  await persistCategory({
    score: currentScore.value,
    note: currentNote.value,
    selectedOptionIds: selectedOptions.value
  });
  if (categoryIndex.value >= categories.value.length - 1) {
    step.value = 'review';
  } else {
    categoryIndex.value += 1;
  }
}

function prevCategory() {
  if (categoryIndex.value > 0) categoryIndex.value -= 1;
}

function jumpToCategory(key) {
  const idx = categories.value.findIndex((c) => c.key === key);
  if (idx >= 0) {
    categoryIndex.value = idx;
    step.value = 'category';
  }
}

function togglePriority(key, checked) {
  if (checked) {
    if (priorities.value.length >= maxPriorities.value) return;
    priorities.value = [...priorities.value, key];
  } else {
    priorities.value = priorities.value.filter((k) => k !== key);
  }
}

function labelFor(key) {
  return categories.value.find((c) => c.key === key)?.label || key;
}

async function completeAssessment({ goToGoals = true } = {}) {
  if (!priorities.value.length || completing.value) return;
  completing.value = true;
  error.value = '';
  try {
    const res = await api.post(
      `${apiBase()}/complete`,
      { priorityCategoryKeys: priorities.value },
      quiet
    );
    assessment.value = res.data?.assessment || assessment.value;
    for (const key of priorities.value) {
      if (!goalDrafts[key]) goalDrafts[key] = { statement: '', step: '' };
    }
    step.value = goToGoals ? 'goals' : 'done';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not complete assessment';
  } finally {
    completing.value = false;
  }
}

async function saveGoal(key) {
  const draft = goalDrafts[key];
  if (!draft?.statement?.trim()) return;
  savingGoal.value = true;
  try {
    const res = await api.post(
      `${apiBase()}/goals`,
      {
        categoryKey: key,
        goalStatement: draft.statement,
        actionSteps: draft.step ? [{ stepText: draft.step }] : []
      },
      quiet
    );
    assessment.value = res.data?.assessment || assessment.value;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not save goal';
  } finally {
    savingGoal.value = false;
  }
}

async function submitAndFinish() {
  if (submitting.value) return;
  submitting.value = true;
  error.value = '';
  try {
    for (const key of priorities.value) {
      const draft = goalDrafts[key];
      if (draft?.statement?.trim()) {
        await api.post(
          `${apiBase()}/goals`,
          {
            categoryKey: key,
            goalStatement: draft.statement,
            actionSteps: draft.step ? [{ stepText: draft.step }] : []
          },
          quiet
        );
      }
    }
    step.value = 'done';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not submit goals';
  } finally {
    submitting.value = false;
  }
}

function finishAssessment() {
  step.value = 'done';
}

function goReturn() {
  if (returnTo.value) router.push(returnTo.value);
}

onMounted(load);
</script>

<style scoped>
.lbw-page {
  --lbw-ink: #0f172a;
  --lbw-muted: #64748b;
  --lbw-line: #e2e8f0;
  --lbw-soft: #f8fafc;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 1.25rem 1rem 1.75rem;
  font-family: "Avenir Next", "Segoe UI", ui-sans-serif, sans-serif;
  color: var(--lbw-ink);
  background:
    radial-gradient(1200px 500px at 10% -10%, rgba(191, 217, 155, 0.22), transparent 55%),
    radial-gradient(900px 420px at 90% 0%, rgba(159, 213, 212, 0.2), transparent 50%),
    linear-gradient(180deg, #f7f8f5 0%, #eef2f0 100%);
}

.lbw-state {
  max-width: 40rem;
  margin: 0 auto;
  padding: 2.5rem 1.5rem;
  text-align: center;
  background: #fff;
  border-radius: 20px;
  border: 1px solid var(--lbw-line);
}
.lbw-state.error { color: #991b1b; }

.lbw-shell {
  width: min(1240px, 100%);
  margin: 0 auto;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 20px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.07);
  padding: 1.5rem 1.6rem 1.25rem;
}
.lbw-shell--narrow {
  width: min(720px, 100%);
  padding: 2rem 1.75rem;
}
.lbw-shell--center { text-align: center; }

.lbw-page-title {
  margin: 0;
  font-size: clamp(1.65rem, 2.2vw, 2rem);
  font-weight: 750;
  letter-spacing: -0.02em;
  line-height: 1.15;
}
.lbw-cat-title {
  margin: 0.15rem 0 0.35rem;
  font-size: clamp(1.45rem, 2vw, 1.75rem);
  font-weight: 750;
  letter-spacing: -0.02em;
}
.lbw-lead {
  margin: 0.4rem 0 0;
  color: var(--lbw-muted);
  font-size: 1rem;
  line-height: 1.5;
  max-width: 38rem;
}
.lbw-helper {
  margin: 0.35rem 0 0;
  color: #94a3b8;
  font-size: 0.875rem;
}
.lbw-question {
  margin: 0 0 0.65rem;
  font-size: 1.125rem;
  font-weight: 650;
  line-height: 1.35;
}

.lbw-header {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 1.25rem;
  align-items: end;
  padding-bottom: 1.15rem;
  margin-bottom: 1.15rem;
  border-bottom: 1px solid var(--lbw-line);
}
.lbw-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.875rem;
  font-weight: 650;
  color: #475569;
  margin-bottom: 0.45rem;
}
.lbw-progress-track {
  height: 6px;
  border-radius: 999px;
  background: #eef2f7;
  overflow: hidden;
}
.lbw-progress-fill {
  height: 100%;
  border-radius: inherit;
  transition: width 350ms cubic-bezier(0.22, 1, 0.36, 1);
}
.lbw-saved {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: #94a3b8;
  font-weight: 600;
}
.lbw-saved[data-state='saved'] { color: #166534; }
.lbw-saved[data-state='error'] { color: #991b1b; }
.lbw-saved__check {
  display: inline-grid;
  place-items: center;
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  background: #dcfce7;
  font-size: 0.65rem;
}

.lbw-columns {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 1.5rem;
  align-items: start;
}
.lbw-main {
  display: grid;
  gap: 1.15rem;
  min-width: 0;
}
.lbw-aside {
  display: grid;
  gap: 1rem;
  position: sticky;
  top: 1rem;
}

.lbw-cat-banner {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  padding: 1.1rem 1.15rem;
  border-radius: 16px;
}
.lbw-cat-banner__icon {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 2.15rem;
  flex-shrink: 0;
  overflow: hidden;
}
.lbw-cat-banner__top {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  align-items: center;
  justify-content: space-between;
}
.lbw-cat-banner__meta {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lbw-cat-desc {
  margin: 0;
  color: #475569;
  font-size: 0.95rem;
  line-height: 1.45;
}
.lbw-rating-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: #334155;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
}
.lbw-rating-badge__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
}

.lbw-block { display: grid; gap: 0.35rem; }

.lbw-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  font-weight: 650;
  color: #94a3b8;
  margin-bottom: 0.35rem;
}
.lbw-score-row {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.35rem;
}
.lbw-score-btn {
  aspect-ratio: 1;
  border-radius: 999px;
  border: 1.5px solid #cbd5e1;
  background: #fff;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  color: #334155;
  transition: transform 160ms ease, box-shadow 160ms ease, background 200ms ease, border-color 200ms ease;
}
.lbw-score-btn:hover {
  transform: scale(1.08);
  border-color: #94a3b8;
}
.lbw-score-btn.active {
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
  transform: scale(1.06);
}
.lbw-score-live {
  margin: 0.55rem 0 0;
  font-size: 0.95rem;
  color: var(--lbw-muted);
}
.lbw-score-live.muted { color: var(--lbw-muted); }
.lbw-score-live__main {
  margin: 0;
  font-size: 1rem;
}
.lbw-score-live__main strong { font-size: 1.1rem; }
.lbw-score-live__nudge {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: #64748b;
  font-weight: 500;
}

.lbw-followup {
  display: grid;
  gap: 1.15rem;
}
.lbw-reveal-enter-active,
.lbw-reveal-leave-active {
  transition: opacity 320ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
.lbw-reveal-enter-from,
.lbw-reveal-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.lbw-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.35rem;
}
.lbw-chip {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 999px;
  padding: 0.42rem 0.8rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}
.lbw-chip:hover {
  background: color-mix(in srgb, var(--chip-accent, #166534) 14%, white);
  border-color: color-mix(in srgb, var(--chip-accent, #166534) 35%, #d1d5db);
}
.lbw-chip.on {
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.1);
  transform: translateY(-1px);
}
.lbw-chip__check {
  font-size: 0.75rem;
  font-weight: 800;
}

.lbw-notes-toggle {
  width: 100%;
  border: 1.5px dashed #cbd5e1;
  background: transparent;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  text-align: left;
  font-weight: 650;
  font-size: 0.95rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.lbw-notes-toggle:hover { background: var(--lbw-soft); }
.lbw-notes-panel {
  border: 1px solid var(--lbw-line);
  border-radius: 12px;
  padding: 0.85rem;
  display: grid;
  gap: 0.45rem;
  background: #fff;
}
.lbw-notes-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  font-weight: 650;
}
.lbw-notes-panel textarea,
.lbw-goal-block input,
.lbw-goal-block textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  font: inherit;
  resize: vertical;
}
.lbw-linkish {
  border: 0;
  background: none;
  color: var(--lbw-muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 650;
}

.lbw-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1rem;
  padding-top: 0.35rem;
  margin-top: 0.25rem;
  border-top: 1px solid transparent;
}
.lbw-footer__next {
  display: grid;
  justify-items: end;
  gap: 0.25rem;
}
.lbw-footer__hint {
  margin: 0;
  font-size: 0.8rem;
  color: #b45309;
  font-weight: 600;
}
.lbw-footer__sub {
  margin: 0;
  font-size: 0.78rem;
  color: #94a3b8;
  font-weight: 600;
}

.lbw-btn {
  border: 1.5px solid #cbd5e1;
  background: #fff;
  border-radius: 12px;
  padding: 0.7rem 1.1rem;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  transition: transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
}
.lbw-btn.primary {
  background: #166534;
  border-color: #166534;
  color: #fff;
}
.lbw-btn.primary:hover:not(:disabled) {
  box-shadow: 0 10px 22px rgba(22, 101, 52, 0.22);
  transform: translateY(-1px);
}
.lbw-btn.ghost { background: #fff; color: #334155; }
.lbw-btn:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; transform: none; }

.lbw-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1.25rem;
}

.lbw-summary {
  border: 1px solid var(--lbw-line);
  border-radius: 16px;
  padding: 1rem 1.05rem;
  background: #fff;
  display: grid;
  gap: 0.85rem;
}
.lbw-summary__head {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
.lbw-summary__head h3 {
  margin: 0;
  font-size: 1rem;
}
.lbw-summary__icon {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 1.55rem;
  overflow: hidden;
}
.lbw-insight-row {
  display: grid;
  gap: 0.5rem;
}
.lbw-insight {
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  background: #f8fafc;
  border: 1px solid #eef2f7;
}
.lbw-insight strong {
  display: block;
  font-size: 0.78rem;
  margin-bottom: 0.2rem;
}
.lbw-insight p {
  margin: 0;
  font-size: 0.85rem;
  color: #475569;
  line-height: 1.4;
}
.lbw-insight.strength {
  background: #f0fdf4;
  border-color: #bbf7d0;
}
.lbw-insight.focus {
  background: #fffbeb;
  border-color: #fde68a;
}
.lbw-summary__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
.lbw-summary__stats strong {
  display: block;
  font-size: 1.15rem;
  margin-top: 0.15rem;
}
.lbw-summary__stats strong.up { color: #166534; }
.lbw-summary__stats strong.down { color: #b45309; }
.lbw-summary__label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.lbw-summary__msg {
  margin: 0;
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  font-size: 0.875rem;
  color: #334155;
  line-height: 1.4;
}

.lbw-privacy {
  margin: 1.15rem 0 0;
  text-align: center;
  color: #94a3b8;
  font-size: 0.8rem;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.4rem;
}
.lbw-privacy__icon {
  width: 1.1rem;
  height: 1.1rem;
  object-fit: contain;
}

.lbw-score-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}
.lbw-score-row-btn {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.75rem;
  align-items: center;
  border: 1px solid var(--lbw-line);
  background: var(--lbw-soft);
  border-radius: 12px;
  padding: 0.65rem 0.8rem;
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.lbw-score-row-btn:hover { background: #fff; border-color: #cbd5e1; }
.lbw-score-row-btn__icon {
  width: 2.15rem;
  height: 2.15rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 1.25rem;
  overflow: hidden;
}
.lbw-avg { margin: 0.85rem 0 0; color: var(--lbw-muted); }

.lbw-steps {
  margin: 1rem 0;
  padding-left: 1.2rem;
  line-height: 1.6;
  color: #334155;
}

.lbw-prio-list { display: grid; gap: 0.45rem; margin-top: 1rem; }
.lbw-prio {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  gap: 0.65rem;
  align-items: center;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--lbw-line);
  border-radius: 12px;
}
.lbw-prio__swatch {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
}
.lbw-goal-block {
  border: 1px solid var(--lbw-line);
  border-radius: 14px;
  padding: 1rem;
  margin: 0.85rem 0;
  display: grid;
  gap: 0.55rem;
  text-align: left;
}
.lbw-goal-block h2 { margin: 0; font-size: 1.05rem; }
.lbw-goal-block label {
  display: grid;
  gap: 0.3rem;
  font-size: 0.85rem;
  font-weight: 650;
}

@media (max-width: 960px) {
  .lbw-header,
  .lbw-columns {
    grid-template-columns: 1fr;
  }
  .lbw-aside {
    order: -1;
    position: static;
  }
  .lbw-score-row {
    gap: 0.28rem;
  }
  .lbw-score-btn { font-size: 0.85rem; }
}

@media (prefers-reduced-motion: reduce) {
  .lbw-progress-fill,
  .lbw-score-btn,
  .lbw-chip,
  .lbw-btn {
    transition: none;
  }
}

@media print {
  .lbw-footer, .lbw-btn, .lbw-privacy { display: none !important; }
  .lbw-page { background: #fff; }
}
</style>
