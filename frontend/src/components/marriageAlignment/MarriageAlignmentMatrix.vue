<template>
  <div class="mam" role="img" :aria-label="ariaLabel">
    <header class="mam__head">
      <div>
        <p class="mam__eyebrow">Marriage Alignment Matrix</p>
        <h3 class="mam__title">Current Alignment × Shared Desired Emphasis</h3>
      </div>
      <p class="mam__clarify">{{ clarification }}</p>
    </header>

    <div class="mam__chart" aria-hidden="true">
      <div class="mam__y">Shared Desired Emphasis →</div>
      <div class="mam__plot">
        <div class="mam__quad q1"><span>Shared Growth Priorities</span></div>
        <div class="mam__quad q2"><span>Protect and Celebrate</span></div>
        <div class="mam__quad q3"><span>Seasonal or Optional</span></div>
        <div class="mam__quad q4"><span>Stable, Lower Priority</span></div>
        <button
          v-for="p in points"
          :key="p.key"
          type="button"
          class="mam__point"
          :class="{ active: p.key === activeDomainId, gap: p.perceptionGap >= 3 }"
          :style="{
            left: `${p.x}%`,
            bottom: `${p.y}%`,
            '--c': p.color,
            borderStyle: p.perceptionGap >= 3 ? 'dashed' : 'solid'
          }"
          :disabled="!interactive"
          :title="`${p.label}: Alignment ${p.coupleAvg}, Emphasis ${p.sharedDesired}`"
          @click="interactive && emit('domain-select', p.key)"
        >
          {{ p.shortLabel.slice(0, 3) }}
        </button>
      </div>
      <div class="mam__x">Couple Current Alignment →</div>
    </div>

    <ul class="mam__list">
      <li v-for="p in points" :key="`li-${p.key}`">
        <strong>{{ p.label }}</strong>
        Alignment avg {{ p.coupleAvg }} · Desired avg {{ p.sharedDesired }} ·
        {{ p.quadrantLabel }}
        <template v-if="p.perceptionGap != null">
          · Perception gap {{ p.perceptionGap }}
        </template>
      </li>
      <li v-if="!points.length">Shared results will populate this matrix after both partners submit.</li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { MATRIX_QUADRANT_LABELS } from '../../utils/marriageAlignment.js';

const props = defineProps({
  comparisons: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: null },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: false },
  clarification: {
    type: String,
    default: 'A lower-priority domain does not automatically need improvement.'
  }
});

const emit = defineEmits(['domain-select']);

const points = computed(() =>
  (props.comparisons || []).map((c) => ({
    key: c.domainKey,
    label: c.label,
    shortLabel: c.shortLabel || c.label,
    color: c.color || '#1E3A5F',
    coupleAvg: c.coupleCurrentAlignmentAverage,
    sharedDesired: c.sharedDesiredEmphasis,
    perceptionGap: c.currentPerceptionGap,
    desiredGap: c.desiredEmphasisGap,
    quadrant: c.quadrant,
    quadrantLabel: c.quadrantLabel || MATRIX_QUADRANT_LABELS[c.quadrant],
    x: ((Number(c.coupleCurrentAlignmentAverage) - 1) / 9) * 100,
    y: ((Number(c.sharedDesiredEmphasis) - 1) / 9) * 100
  }))
);

const ariaLabel = computed(() => {
  if (!points.value.length) return 'Marriage Alignment Matrix with no plotted domains yet.';
  return `Marriage Alignment Matrix. ${points.value
    .map(
      (p) =>
        `${p.label}: couple alignment ${p.coupleAvg}, shared desired emphasis ${p.sharedDesired}, ${p.quadrantLabel}`
    )
    .join('. ')}`;
});
</script>

<style scoped>
.mam {
  background: linear-gradient(180deg, #fafaf9, #f5f5f4);
  border: 1px solid #e7e5e4;
  border-radius: 18px;
  padding: 1rem 1.1rem;
}
.mam__eyebrow {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9a3412;
  font-weight: 700;
}
.mam__title {
  margin: 0.15rem 0 0.35rem;
  font-size: 1.05rem;
}
.mam__clarify {
  margin: 0;
  font-size: 0.82rem;
  color: #78716c;
}
.mam__y,
.mam__x {
  font-size: 0.7rem;
  color: #78716c;
  margin: 0.25rem 0;
}
.mam__plot {
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
.mam__quad {
  padding: 0.45rem;
  font-size: 0.65rem;
  color: #a8a29e;
  font-weight: 600;
}
.mam__quad.q1 {
  background: rgba(154, 52, 18, 0.05);
  border-right: 1px dashed #e7e5e4;
  border-bottom: 1px dashed #e7e5e4;
}
.mam__quad.q2 {
  background: rgba(30, 58, 95, 0.06);
  border-bottom: 1px dashed #e7e5e4;
}
.mam__quad.q3 {
  background: rgba(120, 113, 108, 0.04);
  border-right: 1px dashed #e7e5e4;
}
.mam__quad.q4 {
  background: rgba(15, 118, 110, 0.05);
}
.mam__point {
  position: absolute;
  transform: translate(-50%, 50%);
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 2px solid var(--c);
  background: color-mix(in srgb, var(--c) 16%, #fff);
  font-size: 0.58rem;
  font-weight: 700;
  cursor: pointer;
  z-index: 2;
  color: #1c1917;
}
.mam__point.active,
.mam__point.gap {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 25%, transparent);
}
.mam__point:disabled {
  cursor: default;
}
.mam__list {
  margin: 0.85rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: #57534e;
}
.mam__list strong {
  color: #1c1917;
  margin-right: 0.35rem;
}
</style>
