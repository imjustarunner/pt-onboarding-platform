<template>
  <div class="msm">
    <header class="msm__head">
      <div>
        <p class="msm__eyebrow">Meaning-Satisfaction Matrix</p>
        <h3 class="msm__title">Fulfillment × Importance</h3>
        <p class="msm__note">{{ clarification }}</p>
      </div>
    </header>

    <div class="msm__plot" role="img" :aria-label="ariaLabel">
      <div class="msm__grid">
        <span class="msm__zone tl">High-Value Growth</span>
        <span class="msm__zone tr">Nourishing Anchors</span>
        <span class="msm__zone bl">Lower-Priority</span>
        <span class="msm__zone br">Pleasant Extras</span>
      </div>
      <div class="msm__axis-x">Current Fulfillment →</div>
      <div class="msm__axis-y">Personal Importance →</div>
      <button
        v-for="p in points"
        :key="p.key"
        type="button"
        class="msm__point"
        :class="{ active: p.key === activeDomainId, priority: selectedPriorityDomainIds.includes(p.key) }"
        :style="{ left: p.left, bottom: p.bottom, background: p.color }"
        :disabled="!interactive"
        :title="`${p.label}: Fulfillment ${p.fulfillment}, Importance ${p.importance}`"
        @click="interactive && emit('domain-select', p.key)"
      >
        {{ p.shortLabel }}
      </button>
    </div>

    <ul class="msm__list">
      <li v-for="p in points" :key="`li-${p.key}`">
        <strong>{{ p.label }}</strong>
        — Fulfillment {{ p.fulfillment }}, Importance {{ p.importance }} · {{ p.quadrantLabel }}
      </li>
      <li v-if="!points.length">Complete Current Fulfillment and Personal Importance to plot domains.</li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { matrixQuadrant, MATRIX_QUADRANT_LABELS } from '../../utils/personalFulfillment.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: null },
  previousResponses: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: true },
  clarification: {
    type: String,
    default: 'A lower-priority domain does not need improvement unless it matters to you.'
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
      const fulfillment = r?.currentFulfillmentScore;
      const importance = r?.personalImportanceScore;
      if (fulfillment == null || importance == null) return null;
      if (r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant') return null;
      const quadrant = matrixQuadrant(fulfillment, importance);
      return {
        key: d.key,
        label: d.label,
        shortLabel: (d.shortLabel || d.label).slice(0, 8),
        color: d.color || '#0f766e',
        fulfillment,
        importance,
        quadrant,
        quadrantLabel: MATRIX_QUADRANT_LABELS[quadrant],
        left: `${((fulfillment - 1) / 9) * 86 + 7}%`,
        bottom: `${((importance - 1) / 9) * 78 + 10}%`
      };
    })
    .filter(Boolean)
);

const ariaLabel = computed(() => {
  if (!points.value.length) {
    return 'Meaning-Satisfaction Matrix. No completed fulfillment and importance pairs yet.';
  }
  return `Meaning-Satisfaction Matrix. ${points.value
    .map(
      (p) =>
        `${p.label}: fulfillment ${p.fulfillment}, importance ${p.importance}, ${p.quadrantLabel}`
    )
    .join('. ')}.`;
});
</script>

<style scoped>
.msm {
  background: #fff;
  border: 1px solid #e7e5e4;
  border-radius: 16px;
  padding: 1rem;
}

.msm__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #a16207;
  font-weight: 700;
}

.msm__title {
  margin: 0.2rem 0;
  font-size: 1.1rem;
}

.msm__note {
  margin: 0;
  font-size: 0.85rem;
  color: #78716c;
}

.msm__plot {
  position: relative;
  height: 280px;
  margin: 1rem 0 0.5rem;
  border: 1px solid #e7e5e4;
  border-radius: 12px;
  background: #fafaf9;
  overflow: hidden;
}

.msm__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  height: 100%;
}

.msm__zone {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 0.55rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #a8a29e;
}

.msm__zone.tl {
  background: rgba(234, 88, 12, 0.06);
  border-right: 1px dashed #e7e5e4;
  border-bottom: 1px dashed #e7e5e4;
}
.msm__zone.tr {
  background: rgba(15, 118, 110, 0.07);
  border-bottom: 1px dashed #e7e5e4;
}
.msm__zone.bl {
  background: rgba(168, 162, 158, 0.08);
  border-right: 1px dashed #e7e5e4;
}
.msm__zone.br {
  background: rgba(202, 138, 4, 0.07);
}

.msm__axis-x,
.msm__axis-y {
  position: absolute;
  font-size: 0.65rem;
  font-weight: 700;
  color: #a8a29e;
}

.msm__axis-x {
  left: 50%;
  bottom: 0.35rem;
  transform: translateX(-50%);
}

.msm__axis-y {
  left: 0.4rem;
  top: 50%;
  writing-mode: vertical-rl;
  transform: translateY(-50%) rotate(180deg);
}

.msm__point {
  position: absolute;
  transform: translate(-50%, 50%);
  border: 2px solid #fff;
  border-radius: 999px;
  color: #fff;
  font-size: 0.58rem;
  font-weight: 800;
  padding: 0.28rem 0.4rem;
  box-shadow: 0 2px 8px rgba(28, 25, 23, 0.18);
  cursor: default;
  z-index: 2;
  max-width: 4.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msm__point:not(:disabled) {
  cursor: pointer;
}

.msm__point.active {
  outline: 2px solid #1c1917;
  outline-offset: 2px;
  z-index: 3;
}

.msm__point.priority {
  box-shadow: 0 0 0 2px #1d4ed8;
}

.msm__list {
  margin: 0.75rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.82rem;
  color: #57534e;
  line-height: 1.5;
}
</style>
