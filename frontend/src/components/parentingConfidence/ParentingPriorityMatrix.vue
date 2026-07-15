<template>
  <div class="ppm" role="img" :aria-label="ariaLabel">
    <header class="ppm__head">
      <div>
        <p class="ppm__eyebrow">Parenting Priority Matrix</p>
        <h3 class="ppm__title">Capacity × Importance</h3>
      </div>
      <p class="ppm__clarify">{{ clarification }}</p>
    </header>

    <div class="ppm__chart" aria-hidden="true">
      <div class="ppm__y-label">Personal Importance →</div>
      <div class="ppm__plot">
        <div class="ppm__quad q1"><span>High-Value Support</span></div>
        <div class="ppm__quad q2"><span>Core Strengths</span></div>
        <div class="ppm__quad q3"><span>Lower Current Priority</span></div>
        <div class="ppm__quad q4"><span>Steady, Lower Priority</span></div>
        <button
          v-for="p in points"
          :key="p.key"
          type="button"
          class="ppm__point"
          :class="{ active: p.key === activeDomainId, priority: selectedPriorityDomainIds.includes(p.key) }"
          :style="{ left: `${p.x}%`, bottom: `${p.y}%`, '--point-color': p.color }"
          :disabled="!interactive"
          :title="`${p.label}: Capacity ${p.capacity}, Importance ${p.importance}`"
          @click="interactive && emit('domain-select', p.key)"
        >
          {{ p.shortLabel.slice(0, 3) }}
        </button>
      </div>
      <div class="ppm__x-label">Current Capacity →</div>
    </div>

    <ul class="ppm__list">
      <li v-for="p in points" :key="`li-${p.key}`">
        <strong>{{ p.label }}</strong>
        Capacity {{ p.capacity }} · Importance {{ p.importance }} · {{ p.quadrantLabel }}
      </li>
      <li v-if="!points.length">Complete Capacity and Importance scores to populate the matrix.</li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { matrixQuadrant, MATRIX_QUADRANT_LABELS } from '../../utils/parentingConfidence.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: null },
  interactive: { type: Boolean, default: false },
  clarification: {
    type: String,
    default:
      'A lower-priority domain does not automatically require improvement. Low scores are not conclusions about fitness to parent.'
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
      const capacity = r.currentCapacityScore;
      const importance = r.personalImportanceScore;
      if (capacity == null || importance == null) return null;
      const quadrant = matrixQuadrant(capacity, importance);
      return {
        key: d.key,
        label: d.label,
        shortLabel: d.shortLabel || d.label,
        color: d.color || '#B45309',
        capacity,
        importance,
        x: ((capacity - 1) / 9) * 100,
        y: ((importance - 1) / 9) * 100,
        quadrant,
        quadrantLabel: MATRIX_QUADRANT_LABELS[quadrant]
      };
    })
    .filter(Boolean)
);

const ariaLabel = computed(() => {
  if (!points.value.length) return 'Parenting Priority Matrix with no plotted domains yet.';
  return `Parenting Priority Matrix. ${points.value
    .map(
      (p) =>
        `${p.label}: capacity ${p.capacity}, importance ${p.importance}, ${p.quadrantLabel}`
    )
    .join('. ')}`;
});
</script>

<style scoped>
.ppm {
  background: linear-gradient(180deg, #fffbeb, #fafaf9);
  border: 1px solid #e7e5e4;
  border-radius: 18px;
  padding: 1rem 1.1rem 1.15rem;
  font-family: Manrope, system-ui, sans-serif;
}
.ppm__eyebrow {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #b45309;
  font-weight: 700;
}
.ppm__title {
  margin: 0.15rem 0 0.35rem;
  font-family: Fraunces, Georgia, serif;
  font-size: 1.05rem;
}
.ppm__clarify {
  margin: 0;
  font-size: 0.82rem;
  color: #78716c;
}
.ppm__chart {
  margin-top: 0.85rem;
}
.ppm__y-label,
.ppm__x-label {
  font-size: 0.7rem;
  color: #78716c;
  margin: 0.25rem 0;
}
.ppm__plot {
  position: relative;
  height: 260px;
  border: 1px solid #d6d3d1;
  border-radius: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  overflow: hidden;
  background: #fff;
}
.ppm__quad {
  padding: 0.45rem;
  font-size: 0.65rem;
  color: #a8a29e;
  font-weight: 600;
}
.ppm__quad.q1 {
  background: rgba(180, 83, 9, 0.07);
  border-right: 1px dashed #e7e5e4;
  border-bottom: 1px dashed #e7e5e4;
}
.ppm__quad.q2 {
  background: rgba(15, 118, 110, 0.07);
  border-bottom: 1px dashed #e7e5e4;
}
.ppm__quad.q3 {
  background: rgba(120, 113, 108, 0.05);
  border-right: 1px dashed #e7e5e4;
}
.ppm__quad.q4 {
  background: rgba(101, 163, 13, 0.06);
}
.ppm__point {
  position: absolute;
  transform: translate(-50%, 50%);
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 2px solid var(--point-color);
  background: color-mix(in srgb, var(--point-color) 18%, #fff);
  color: #292524;
  font-size: 0.58rem;
  font-weight: 700;
  cursor: pointer;
  z-index: 2;
}
.ppm__point.active,
.ppm__point.priority {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--point-color) 30%, transparent);
  z-index: 3;
}
.ppm__point:disabled {
  cursor: default;
}
.ppm__list {
  margin: 0.85rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: #57534e;
}
.ppm__list strong {
  color: #292524;
  margin-right: 0.35rem;
}
@media (max-width: 560px) {
  .ppm__plot {
    height: 200px;
  }
}
</style>
