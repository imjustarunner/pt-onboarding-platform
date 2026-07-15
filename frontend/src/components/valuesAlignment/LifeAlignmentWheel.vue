<template>
  <div
    class="law"
    :class="{ 'law--compact': compact, 'law--interactive': interactive }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="law__head">
      <div>
        <p class="law__eyebrow">Life Alignment Wheel</p>
        <h3 class="law__title">{{ title }}</h3>
      </div>
      <div v-if="valuesAlignmentIndex != null" class="law__score">
        <span class="law__score-n">{{ valuesAlignmentIndex }}</span>
        <span class="law__score-l">/ 100</span>
      </div>
    </header>

    <div v-if="showLegend" class="law__legend">
      <span v-if="showCurrent" class="law__leg law__leg--current">
        <i aria-hidden="true" /> Current Life
      </span>
      <span v-if="showIdeal" class="law__leg law__leg--ideal">
        <i aria-hidden="true" /> Ideal Life
      </span>
      <span v-if="displayMode === 'gaps'" class="law__leg law__leg--gap">Gap emphasis</span>
    </div>

    <div class="law__viz">
      <svg viewBox="0 0 320 320" class="law__svg" aria-hidden="true">
        <g transform="translate(160,160)">
          <circle
            v-for="ring in [2, 4, 6, 8, 10]"
            :key="ring"
            :r="(ring / 10) * 120"
            fill="none"
            stroke="#e7e0d6"
            stroke-width="1"
          />
          <line
            v-for="(d, i) in plotCategories"
            :key="`axis-${d.key}`"
            :x1="0"
            :y1="0"
            :x2="point(i, 10).x"
            :y2="point(i, 10).y"
            stroke="#e7e0d6"
            stroke-width="1"
          />

          <polygon
            v-if="showCurrent && currentPoints"
            :points="currentPoints"
            fill="rgba(180, 83, 9, 0.14)"
            stroke="#b45309"
            stroke-width="2.5"
            stroke-linejoin="round"
            :class="{ 'law-anim': animated }"
          />
          <circle
            v-for="(p, i) in currentMarkers"
            :key="`c-${i}`"
            v-show="showCurrent"
            :cx="p.x"
            :cy="p.y"
            r="4.5"
            fill="#b45309"
            stroke="#fff"
            stroke-width="1.5"
          />

          <polygon
            v-if="showIdeal && idealPoints"
            :points="idealPoints"
            :fill="displayMode === 'ideal-only' ? 'rgba(29, 78, 216, 0.12)' : 'none'"
            stroke="#1d4ed8"
            stroke-width="2.5"
            stroke-dasharray="7 5"
            stroke-linejoin="round"
            :class="{ 'law-anim': animated }"
          />
          <rect
            v-for="(p, i) in idealMarkers"
            :key="`i-${i}`"
            v-show="showIdeal"
            :x="p.x - 4"
            :y="p.y - 4"
            width="8"
            height="8"
            fill="#1d4ed8"
            stroke="#fff"
            stroke-width="1.5"
          />

          <polygon
            v-if="showPrevious && previousPoints"
            :points="previousPoints"
            fill="none"
            stroke="#a8a29e"
            stroke-width="1.5"
            stroke-dasharray="2 4"
            opacity="0.7"
          />
        </g>

        <circle cx="160" cy="160" r="36" fill="#fffaf5" stroke="#e7e0d6" />
        <text
          x="160"
          y="154"
          text-anchor="middle"
          class="law__center-label"
          fill="#78716c"
        >
          Index
        </text>
        <text
          x="160"
          y="174"
          text-anchor="middle"
          class="law__center-value"
          fill="#1c1917"
        >
          {{ valuesAlignmentIndex ?? '—' }}
        </text>
      </svg>

      <button
        v-for="(d, i) in plotCategories"
        :key="d.key"
        type="button"
        class="law__label"
        :class="{
          active: d.key === activeCategoryId,
          priority: selectedPriorityCategoryIds.includes(d.key),
          completed: isComplete(d.key)
        }"
        :style="labelStyle(i)"
        :disabled="!interactive"
        @click="interactive && emit('category-select', d.key)"
      >
        {{ d.shortLabel || d.label }}
        <span v-if="d.key === activeCategoryId && activePair">
          {{ activePair }}
        </span>
      </button>
    </div>

    <ul class="law__list">
      <li v-for="row in listRows" :key="row.key">
        <strong>{{ row.label }}</strong>
        <span v-if="row.notRelevant">Not relevant in this season</span>
        <span v-else-if="row.current == null && row.ideal == null">Not Rated</span>
        <span v-else>
          Current {{ row.current ?? '—' }} · Ideal {{ row.ideal ?? '—' }}
          <template v-if="row.signedGap != null">
            · Gap {{ formatGap(row.signedGap) }}
          </template>
        </span>
      </li>
    </ul>

    <p v-if="metaLine" class="law__meta">{{ metaLine }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import {
  calculateSignedAlignmentGap,
  calculateValuesAlignmentIndex,
  calculateValueAlignmentScore
} from '../../utils/valuesAlignment.js';

const props = defineProps({
  categories: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  valuesAlignmentIndex: { type: [Number, null], default: null },
  activeCategoryId: { type: String, default: null },
  displayMode: {
    type: String,
    default: 'current-and-ideal'
  },
  previousAssessment: { type: Object, default: null },
  selectedPriorityCategoryIds: { type: Array, default: () => [] },
  showGaps: { type: Boolean, default: false },
  showLabels: { type: Boolean, default: true },
  showLegend: { type: Boolean, default: true },
  interactive: { type: Boolean, default: false },
  animated: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  title: { type: String, default: 'Life Alignment Wheel' },
  alignedValueCount: { type: Number, default: null },
  positiveGapCount: { type: Number, default: null },
  assessmentDate: { type: String, default: null }
});

const emit = defineEmits(['category-select']);

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.valueKey] = r;
  return m;
});

const plotCategories = computed(() =>
  (props.categories || []).map((c) => ({
    ...c,
    shortLabel: c.shortLabel || (c.label || '').split(' ')[0]
  }))
);

const showCurrent = computed(() =>
  ['current-and-ideal', 'current-only', 'gaps', 'priorities', 'historical'].includes(
    props.displayMode
  )
);
const showIdeal = computed(() =>
  ['current-and-ideal', 'ideal-only', 'gaps', 'priorities', 'historical'].includes(
    props.displayMode
  )
);
const showPrevious = computed(
  () => props.displayMode === 'historical' && props.previousAssessment
);

function scoresFor(key) {
  const r = responseMap.value[key];
  if (!r || r.seasonStatus === 'not_relevant') {
    return { current: null, ideal: null, notRelevant: r?.seasonStatus === 'not_relevant' };
  }
  return {
    current: r.currentLifeScore ?? r.alignmentScore ?? null,
    ideal: r.idealLifeScore ?? r.importanceScore ?? null,
    notRelevant: false
  };
}

function isComplete(key) {
  const s = scoresFor(key);
  return s.notRelevant || (s.current != null && s.ideal != null);
}

function point(i, score) {
  const n = plotCategories.value.length || 1;
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const r = ((Number(score) || 0) / 10) * 120;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

function polygonPoints(getter) {
  if (!plotCategories.value.length) return '';
  return plotCategories.value
    .map((d, i) => {
      const s = getter(d.key);
      const p = point(i, s == null ? 0 : s);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

const currentPoints = computed(() => polygonPoints((k) => scoresFor(k).current));
const idealPoints = computed(() => polygonPoints((k) => scoresFor(k).ideal));

const previousPoints = computed(() => {
  if (!props.previousAssessment?.responses) return '';
  const prev = {};
  for (const r of props.previousAssessment.responses) {
    prev[r.valueKey] = r.currentLifeScore ?? r.alignmentScore ?? null;
  }
  return polygonPoints((k) => prev[k] ?? null);
});

const currentMarkers = computed(() =>
  plotCategories.value
    .map((d, i) => {
      const s = scoresFor(d.key).current;
      if (s == null) return null;
      return point(i, s);
    })
    .filter(Boolean)
);

const idealMarkers = computed(() =>
  plotCategories.value
    .map((d, i) => {
      const s = scoresFor(d.key).ideal;
      if (s == null) return null;
      return point(i, s);
    })
    .filter(Boolean)
);

const activePair = computed(() => {
  if (!props.activeCategoryId) return null;
  const s = scoresFor(props.activeCategoryId);
  if (s.current == null && s.ideal == null) return null;
  return `${s.current ?? '—'} / ${s.ideal ?? '—'}`;
});

const computedIndex = computed(() => {
  if (props.valuesAlignmentIndex != null) return props.valuesAlignmentIndex;
  const scores = plotCategories.value.map((d) => {
    const s = scoresFor(d.key);
    if (s.notRelevant || s.current == null || s.ideal == null) return null;
    return calculateValueAlignmentScore(s.current, s.ideal);
  });
  return calculateValuesAlignmentIndex(scores);
});

const listRows = computed(() =>
  plotCategories.value.map((d) => {
    const s = scoresFor(d.key);
    return {
      key: d.key,
      label: d.label,
      ...s,
      signedGap: calculateSignedAlignmentGap(s.current, s.ideal)
    };
  })
);

function formatGap(g) {
  if (g == null) return '—';
  return g > 0 ? `+${g}` : String(g);
}

const metaLine = computed(() => {
  const parts = [];
  if (props.assessmentDate) parts.push(props.assessmentDate);
  if (props.alignedValueCount != null) parts.push(`${props.alignedValueCount} aligned`);
  if (props.positiveGapCount != null) parts.push(`${props.positiveGapCount} growth opportunities`);
  if (props.selectedPriorityCategoryIds?.length) {
    parts.push(`${props.selectedPriorityCategoryIds.length} priorities`);
  }
  return parts.join(' · ');
});

const ariaLabel = computed(() => {
  const parts = listRows.value.map((r) => {
    if (r.notRelevant) return `${r.label}: not relevant in this season`;
    if (r.current == null && r.ideal == null) return `${r.label}: not rated`;
    return `${r.label}: Current Life ${r.current ?? 'not rated'}, Ideal Life ${r.ideal ?? 'not rated'}${
      r.signedGap != null ? `, gap ${formatGap(r.signedGap)}` : ''
    }`;
  });
  const idx = computedIndex.value;
  return `Life Alignment Wheel. Values Alignment Index ${idx ?? 'not yet calculated'}. ${parts.join('. ')}.`;
});

function labelStyle(i) {
  const n = plotCategories.value.length || 1;
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const r = 46;
  const x = 50 + Math.cos(angle) * r;
  const y = 50 + Math.sin(angle) * r;
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: 'translate(-50%, -50%)'
  };
}
</script>

<style scoped>
.law {
  background: linear-gradient(165deg, #fffaf5 0%, #f7f3ee 55%, #eef2ff 100%);
  border: 1px solid #e7e0d6;
  border-radius: 18px;
  padding: 1.1rem 1.15rem 1.2rem;
  color: #1c1917;
  font-family: 'Source Sans 3', 'Segoe UI', system-ui, sans-serif;
}

.law--compact {
  padding: 0.75rem;
}

.law__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.65rem;
}

.law__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #78716c;
  font-weight: 700;
}

.law__title {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
  font-weight: 800;
  font-family: Fraunces, Georgia, serif;
}

.law__score-n {
  font-size: 1.85rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.law__score-l {
  font-size: 0.8rem;
  color: #78716c;
}

.law__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 0.5rem;
  font-size: 0.78rem;
  font-weight: 700;
}

.law__leg {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.law__leg i {
  width: 18px;
  height: 3px;
  display: inline-block;
  border-radius: 2px;
}

.law__leg--current i {
  background: #b45309;
}

.law__leg--ideal i {
  background: transparent;
  border-top: 2px dashed #1d4ed8;
  height: 0;
}

.law__leg--gap {
  color: #78716c;
}

.law__viz {
  position: relative;
  width: min(100%, 360px);
  margin: 0 auto;
  aspect-ratio: 1;
}

.law__svg {
  width: 100%;
  height: 100%;
}

.law__center-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.law__center-value {
  font-size: 16px;
  font-weight: 900;
}

.law__label {
  position: absolute;
  border: 1px solid #e7e0d6;
  background: rgba(255, 250, 245, 0.92);
  border-radius: 999px;
  padding: 0.2rem 0.45rem;
  font-size: 0.68rem;
  font-weight: 700;
  color: #44403c;
  cursor: default;
  max-width: 5.5rem;
  line-height: 1.2;
  text-align: center;
}

.law--interactive .law__label {
  cursor: pointer;
}

.law__label.active {
  border-color: #b45309;
  box-shadow: 0 0 0 2px rgba(180, 83, 9, 0.2);
  transform: translate(-50%, -50%) scale(1.08);
  z-index: 2;
}

.law__label.priority {
  border-color: #1d4ed8;
}

.law__label.completed:not(.active) {
  border-color: #d6d3d1;
}

.law__label span {
  display: block;
  font-variant-numeric: tabular-nums;
  color: #b45309;
}

.law__list {
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.78rem;
  color: #57534e;
  display: grid;
  gap: 0.25rem;
}

.law__list strong {
  color: #1c1917;
  margin-right: 0.35rem;
}

.law__meta {
  margin: 0.65rem 0 0;
  font-size: 0.75rem;
  color: #78716c;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .law-anim {
    transition: none !important;
  }
}

@media print {
  .law {
    break-inside: avoid;
    background: #fff;
  }
}
</style>
