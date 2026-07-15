<template>
  <div class="ffm" role="img" :aria-label="ariaLabel">
    <header class="ffm__head">
      <div>
        <p class="ffm__eyebrow">Family Functioning Matrix</p>
        <h3 class="ffm__title">Functioning × Importance</h3>
      </div>
      <p class="ffm__clarify">{{ clarification }}</p>
    </header>

    <div class="ffm__chart" aria-hidden="true">
      <div class="ffm__y-label">Personal Importance →</div>
      <div class="ffm__plot">
        <div class="ffm__quad q1"><span>High-Value Support</span></div>
        <div class="ffm__quad q2"><span>Core Strengths</span></div>
        <div class="ffm__quad q3"><span>Lower Current Priority</span></div>
        <div class="ffm__quad q4"><span>Steady, Lower Priority</span></div>
        <button
          v-for="p in points"
          :key="p.key"
          type="button"
          class="ffm__point"
          :class="{ active: p.key === activeDomainId, priority: selectedPriorityDomainIds.includes(p.key) }"
          :style="{ left: `${p.x}%`, bottom: `${p.y}%`, '--point-color': p.color }"
          :disabled="!interactive"
          :title="`${p.label}: Functioning ${p.functioning}, Importance ${p.importance}`"
          @click="interactive && emit('domain-select', p.key)"
        >
          {{ p.shortLabel.slice(0, 3) }}
        </button>
      </div>
      <div class="ffm__x-label">Current Functioning →</div>
    </div>

    <ul class="ffm__list">
      <li v-for="p in points" :key="`li-${p.key}`">
        <strong>{{ p.label }}</strong>
        Functioning {{ p.functioning }} · Importance {{ p.importance }} · {{ p.quadrantLabel }}
      </li>
      <li v-if="!points.length">
        Complete Functioning and Importance scores to populate the matrix.
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { matrixQuadrant, MATRIX_QUADRANT_LABELS } from '../../utils/familyFunctioning.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: null },
  interactive: { type: Boolean, default: false },
  clarification: {
    type: String,
    default:
      'A lower-priority domain does not automatically require improvement. Low scores are not conclusions about dysfunction or abuse.'
  }
});

const emit = defineEmits(['domain-select']);

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const points = computed(() =>
  (props.domains || [])
    .map((d) => {
      const r = responseMap.value[d.key];
      if (!r || r.preferNotToAnswer || r.seasonStatus === 'not-relevant') return null;
      const functioning = r.currentFunctioningScore;
      const importance = r.personalImportanceScore;
      if (functioning == null || importance == null) return null;
      const quadrant = matrixQuadrant(functioning, importance);
      return {
        key: d.key,
        label: d.label,
        shortLabel: d.shortLabel || d.label,
        color: d.color || '#475569',
        functioning,
        importance,
        x: ((functioning - 1) / 9) * 100,
        y: ((importance - 1) / 9) * 100,
        quadrant,
        quadrantLabel: MATRIX_QUADRANT_LABELS[quadrant]
      };
    })
    .filter(Boolean)
);

const ariaLabel = computed(() => {
  if (!points.value.length) return 'Family Functioning Matrix with no plotted domains yet.';
  return `Family Functioning Matrix. ${points.value
    .map(
      (p) =>
        `${p.label}: functioning ${p.functioning}, importance ${p.importance}, ${p.quadrantLabel}`
    )
    .join('. ')}`;
});
</script>

<style scoped>
.ffm {
  background: linear-gradient(180deg, #f8fafc, #f1f5f9);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 1rem 1.1rem 1.15rem;
  font-family: Figtree, system-ui, sans-serif;
}
.ffm__eyebrow {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #475569;
  font-weight: 700;
}
.ffm__title {
  margin: 0.15rem 0 0.35rem;
  font-family: Newsreader, Georgia, serif;
  font-size: 1.05rem;
}
.ffm__clarify {
  margin: 0;
  font-size: 0.82rem;
  color: #64748b;
}
.ffm__chart {
  margin-top: 0.85rem;
}
.ffm__y-label,
.ffm__x-label {
  font-size: 0.7rem;
  color: #64748b;
  margin: 0.25rem 0;
}
.ffm__plot {
  position: relative;
  height: 260px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  overflow: hidden;
  background: #fff;
}
.ffm__quad {
  padding: 0.45rem;
  font-size: 0.65rem;
  color: #94a3b8;
  font-weight: 600;
}
.ffm__quad.q1 {
  background: rgba(154, 52, 18, 0.07);
  border-right: 1px dashed #e2e8f0;
  border-bottom: 1px dashed #e2e8f0;
}
.ffm__quad.q2 {
  background: rgba(63, 98, 18, 0.07);
  border-bottom: 1px dashed #e2e8f0;
}
.ffm__quad.q3 {
  background: rgba(100, 116, 139, 0.06);
  border-right: 1px dashed #e2e8f0;
}
.ffm__quad.q4 {
  background: rgba(29, 78, 216, 0.05);
}
.ffm__point {
  position: absolute;
  transform: translate(-50%, 50%);
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 2px solid var(--point-color);
  background: color-mix(in srgb, var(--point-color) 18%, #fff);
  color: #1e293b;
  font-size: 0.58rem;
  font-weight: 700;
  cursor: pointer;
  z-index: 2;
}
.ffm__point.active,
.ffm__point.priority {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--point-color) 30%, transparent);
  z-index: 3;
}
.ffm__point:disabled {
  cursor: default;
}
.ffm__list {
  margin: 0.85rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: #475569;
}
.ffm__list strong {
  color: #1e293b;
  margin-right: 0.35rem;
}
@media (max-width: 560px) {
  .ffm__plot {
    height: 200px;
  }
}
</style>
