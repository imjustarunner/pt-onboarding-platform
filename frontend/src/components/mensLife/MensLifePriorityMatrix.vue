<template>
  <div class="mlp" role="img" :aria-label="ariaLabel">
    <header class="mlp__head">
      <div>
        <p class="mlp__eyebrow">Life Priority Matrix</p>
        <h3 class="mlp__title">Strength × Importance</h3>
      </div>
      <p class="mlp__clarify">{{ clarification }}</p>
    </header>

    <div class="mlp__chart" aria-hidden="true">
      <div class="mlp__y-label">Personal Importance →</div>
      <div class="mlp__plot">
        <div class="mlp__quad q1"><span>Priority Development</span></div>
        <div class="mlp__quad q2"><span>Core Strengths</span></div>
        <div class="mlp__quad q3"><span>Lower Current Priority</span></div>
        <div class="mlp__quad q4"><span>Positive, Lower Priority</span></div>
        <button
          v-for="p in points"
          :key="p.key"
          type="button"
          class="mlp__point"
          :class="{ active: p.key === activeDomainId, priority: selectedPriorityDomainIds.includes(p.key) }"
          :style="{ left: `${p.x}%`, bottom: `${p.y}%`, '--point-color': p.color }"
          :disabled="!interactive"
          :title="`${p.label}: Strength ${p.strength}, Importance ${p.importance}`"
          @click="interactive && emit('domain-select', p.key)"
        >
          {{ p.shortLabel.slice(0, 3) }}
        </button>
      </div>
      <div class="mlp__x-label">Current Strength →</div>
    </div>

    <ul class="mlp__list">
      <li v-for="p in points" :key="`li-${p.key}`">
        <strong>{{ p.label }}</strong>
        Strength {{ p.strength }} · Importance {{ p.importance }} · {{ p.quadrantLabel }}
      </li>
      <li v-if="!points.length">Complete Strength and Importance scores to populate the matrix.</li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { matrixQuadrant, MATRIX_QUADRANT_LABELS } from '../../utils/mensLife.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: null },
  interactive: { type: Boolean, default: false },
  clarification: {
    type: String,
    default: 'A lower-priority domain does not automatically require improvement.'
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
      const strength = r.currentStrengthScore;
      const importance = r.personalImportanceScore;
      if (strength == null || importance == null) return null;
      const quadrant = matrixQuadrant(strength, importance);
      return {
        key: d.key,
        label: d.label,
        shortLabel: d.shortLabel || d.label,
        color: d.color || '#1E3A5F',
        strength,
        importance,
        x: ((strength - 1) / 9) * 100,
        y: ((importance - 1) / 9) * 100,
        quadrant,
        quadrantLabel: MATRIX_QUADRANT_LABELS[quadrant]
      };
    })
    .filter(Boolean)
);

const ariaLabel = computed(() => {
  if (!points.value.length) return 'Life Priority Matrix with no plotted domains yet.';
  return `Life Priority Matrix. ${points.value
    .map((p) => `${p.label}: strength ${p.strength}, importance ${p.importance}, ${p.quadrantLabel}`)
    .join('. ')}`;
});
</script>

<style scoped>
.mlp {
  background: linear-gradient(180deg, #fafaf9, #f5f5f4);
  border: 1px solid #e7e5e4;
  border-radius: 18px;
  padding: 1rem 1.1rem 1.15rem;
}
.mlp__eyebrow {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #92400e;
  font-weight: 700;
}
.mlp__title {
  margin: 0.15rem 0 0.35rem;
  font-size: 1.05rem;
}
.mlp__clarify {
  margin: 0;
  font-size: 0.82rem;
  color: #78716c;
}
.mlp__chart {
  margin-top: 0.85rem;
}
.mlp__y-label,
.mlp__x-label {
  font-size: 0.7rem;
  color: #78716c;
  margin: 0.25rem 0;
}
.mlp__plot {
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
.mlp__quad {
  padding: 0.45rem;
  font-size: 0.65rem;
  color: #a8a29e;
  font-weight: 600;
}
.mlp__quad.q1 {
  background: rgba(180, 83, 9, 0.06);
  border-right: 1px dashed #e7e5e4;
  border-bottom: 1px dashed #e7e5e4;
}
.mlp__quad.q2 {
  background: rgba(30, 58, 95, 0.06);
  border-bottom: 1px dashed #e7e5e4;
}
.mlp__quad.q3 {
  background: rgba(120, 113, 108, 0.05);
  border-right: 1px dashed #e7e5e4;
}
.mlp__quad.q4 {
  background: rgba(15, 118, 110, 0.05);
}
.mlp__point {
  position: absolute;
  transform: translate(-50%, 50%);
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 2px solid var(--point-color);
  background: color-mix(in srgb, var(--point-color) 18%, #fff);
  color: #1c1917;
  font-size: 0.58rem;
  font-weight: 700;
  cursor: pointer;
  z-index: 2;
}
.mlp__point.active,
.mlp__point.priority {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--point-color) 30%, transparent);
  z-index: 3;
}
.mlp__point:disabled {
  cursor: default;
}
.mlp__list {
  margin: 0.85rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: #57534e;
}
.mlp__list strong {
  color: #1c1917;
  margin-right: 0.35rem;
}
@media (max-width: 560px) {
  .mlp__plot {
    height: 200px;
  }
}
</style>
