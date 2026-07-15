<template>
  <div
    class="ars"
    :class="{ 'ars--compact': compact, 'ars--interactive': interactive }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="ars__head">
      <div>
        <p class="ars__eyebrow">Performance Readiness Board</p>
        <h3 class="ars__title">Readiness Stack</h3>
      </div>
      <div v-if="readinessScore != null" class="ars__score">
        <span class="ars__score-n">{{ readinessScore }}</span>
        <span class="ars__score-l">/ 100</span>
      </div>
    </header>

    <ul class="ars__layers">
      <li
        v-for="layer in layers"
        :key="layer.key"
        class="ars__layer"
        :class="{
          'ars__layer--active': layer.key === activeLayerKey,
          'ars__layer--empty': layer.score == null
        }"
        :style="layerStyle(layer)"
        @click="interactive && emit('layer-select', layer.key)"
        @keydown.enter="interactive && emit('layer-select', layer.key)"
        :tabindex="interactive ? 0 : -1"
        :aria-current="layer.key === activeLayerKey ? 'true' : undefined"
      >
        <div class="ars__layer-meta">
          <span class="ars__layer-icon" aria-hidden="true">{{ layerIcon(layer.key) }}</span>
          <span class="ars__layer-label">{{ layer.label }}</span>
          <span class="ars__layer-score">
            {{ layer.score == null ? 'Not Rated' : layer.score.toFixed(layer.score % 1 ? 1 : 0) }}
          </span>
        </div>
        <div class="ars__track" aria-hidden="true">
          <div class="ars__fill" :style="{ width: fillPct(layer.score) }" />
        </div>
        <div v-if="showTrends && layer.trend" class="ars__trend">{{ layer.trend }}</div>
        <div
          v-if="showReviewIndicators && layer.hasReview"
          class="ars__review"
          title="Coach review recommended"
        >
          Review
        </div>
        <div v-if="layer.key === activeLayerKey && breakdown.length" class="ars__breakdown">
          <span v-for="d in breakdown" :key="d.key" class="ars__bd">
            {{ d.shortLabel }}
            <strong>{{ d.score == null ? '—' : d.score }}</strong>
          </span>
        </div>
      </li>
    </ul>

    <p class="ars__sr-only">{{ ariaLabel }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { LAYER_META } from '../../utils/athleteReadiness.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  readinessScore: { type: [Number, null], default: null },
  layerScores: { type: Object, default: () => ({}) },
  activeDomainId: { type: [String, Number], default: null },
  previousAssessment: { type: Object, default: null },
  animated: { type: Boolean, default: true },
  interactive: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  showTrends: { type: Boolean, default: false },
  showReviewIndicators: { type: Boolean, default: false },
  reviewLayerKeys: { type: Array, default: () => [] }
});

const emit = defineEmits(['domain-select', 'layer-select']);

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const activeDomain = computed(() =>
  (props.domains || []).find(
    (d) => d.key === props.activeDomainId || String(d.id) === String(props.activeDomainId)
  )
);

const activeLayerKey = computed(() => activeDomain.value?.readinessLayer || null);

const layers = computed(() =>
  LAYER_META.map((meta) => {
    const score = props.layerScores?.[meta.key] ?? null;
    const prev = props.previousAssessment?.summary?.layerScores?.[meta.key];
    let trend = null;
    if (score != null && prev != null) {
      if (score > prev + 0.4) trend = 'Improving';
      else if (score < prev - 0.4) trend = 'Declining';
      else trend = 'Stable';
    }
    return {
      ...meta,
      score,
      trend,
      hasReview: (props.reviewLayerKeys || []).includes(meta.key)
    };
  })
);

const breakdown = computed(() => {
  if (!activeLayerKey.value) return [];
  return (props.domains || [])
    .filter((d) => d.readinessLayer === activeLayerKey.value)
    .map((d) => ({
      key: d.key,
      shortLabel: d.shortLabel || d.label,
      score: responseMap.value[d.key]?.score ?? null,
      color: d.color
    }));
});

const ariaLabel = computed(() => {
  const parts = layers.value.map((l) =>
    l.score == null ? `${l.label}: not rated` : `${l.label}: ${l.score} out of 10`
  );
  const overall =
    props.readinessScore == null
      ? 'Overall readiness not yet calculated'
      : `Overall readiness ${props.readinessScore} out of 100`;
  return `Readiness Stack. ${overall}. ${parts.join('. ')}.`;
});

function fillPct(score) {
  if (score == null) return '0%';
  return `${Math.max(4, Math.min(100, (Number(score) / 10) * 100))}%`;
}

function layerStyle(layer) {
  const color = colorForLayer(layer.key);
  return {
    '--ars-color': color,
    '--ars-glow': layer.key === activeLayerKey.value ? `0 0 0 1px ${color}, 0 0 24px ${color}55` : 'none'
  };
}

function colorForLayer(key) {
  const map = {
    recovery: '#0EA5E9',
    physical: '#22C55E',
    mental: '#8B5CF6',
    emotional: '#A855F7',
    competitive: '#EF4444'
  };
  return map[key] || '#64748b';
}

function layerIcon(key) {
  const map = {
    recovery: '↺',
    physical: '⚡',
    mental: '◎',
    emotional: '◇',
    competitive: '▲'
  };
  return map[key] || '•';
}
</script>

<style scoped>
.ars {
  --ars-bg: #0b1220;
  --ars-panel: #111827;
  --ars-text: #e2e8f0;
  --ars-muted: #94a3b8;
  background: linear-gradient(165deg, #0b1220 0%, #111827 55%, #0f172a 100%);
  border: 1px solid #1e293b;
  border-radius: 16px;
  padding: 1.1rem 1.15rem 1.25rem;
  color: var(--ars-text);
  font-family: 'Segoe UI', system-ui, sans-serif;
}

.ars__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.ars__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ars-muted);
}

.ars__title {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.ars__score {
  text-align: right;
  line-height: 1;
}

.ars__score-n {
  font-size: 1.85rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.ars__score-l {
  font-size: 0.8rem;
  color: var(--ars-muted);
}

.ars__layers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.ars__layer {
  position: relative;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 0.65rem 0.75rem 0.7rem;
  transition:
    transform 0.22s ease,
    box-shadow 0.22s ease,
    border-color 0.22s ease;
}

.ars--interactive .ars__layer {
  cursor: pointer;
}

.ars__layer:focus-visible {
  outline: 2px solid #38bdf8;
  outline-offset: 2px;
}

.ars__layer--active {
  transform: scale(1.02);
  border-color: var(--ars-color);
  box-shadow: var(--ars-glow);
  z-index: 1;
}

.ars__layer--empty {
  opacity: 0.72;
}

.ars__layer-meta {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.45rem;
  align-items: center;
  margin-bottom: 0.4rem;
  font-size: 0.82rem;
}

.ars__layer-icon {
  width: 1.35rem;
  height: 1.35rem;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ars-color) 22%, transparent);
  color: var(--ars-color);
  font-size: 0.75rem;
}

.ars__layer-label {
  font-weight: 600;
}

.ars__layer-score {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--ars-color);
}

.ars__track {
  height: 10px;
  border-radius: 999px;
  background: #1e293b;
  overflow: hidden;
}

.ars__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--ars-color) 70%, #0f172a), var(--ars-color));
  transition: width 0.35s ease;
}

@media (prefers-reduced-motion: reduce) {
  .ars__layer,
  .ars__fill {
    transition: none;
  }
  .ars__layer--active {
    transform: none;
  }
}

.ars__trend,
.ars__review {
  margin-top: 0.35rem;
  font-size: 0.68rem;
  color: var(--ars-muted);
}

.ars__review {
  color: #fbbf24;
  font-weight: 600;
}

.ars__breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.55rem;
}

.ars__bd {
  font-size: 0.68rem;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 999px;
  padding: 0.2rem 0.5rem;
  color: var(--ars-muted);
}

.ars__bd strong {
  color: var(--ars-text);
  margin-left: 0.25rem;
}

.ars--compact {
  padding: 0.75rem;
}

.ars--compact .ars__title {
  font-size: 0.95rem;
}

.ars--compact .ars__score-n {
  font-size: 1.4rem;
}

.ars__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
