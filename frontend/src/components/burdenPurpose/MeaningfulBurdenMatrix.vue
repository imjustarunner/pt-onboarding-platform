<template>
  <div class="bp-matrix">
    <header class="bp-matrix__head">
      <div>
        <p class="bp-matrix__eyebrow">Meaningful Burden Matrix</p>
        <h3 class="bp-matrix__title">Meaning × Sustainable Capacity</h3>
        <p class="bp-matrix__note">{{ clarification }}</p>
      </div>
    </header>

    <div class="bp-matrix__plot" role="img" :aria-label="ariaLabel">
      <div class="bp-matrix__grid">
        <span class="bp-matrix__zone tl">Overextended Meaning</span>
        <span class="bp-matrix__zone tr">Meaningful &amp; Sustainable</span>
        <span class="bp-matrix__zone bl">Lower Current Priority</span>
        <span class="bp-matrix__zone br">Capacity Without Clear Meaning</span>
      </div>
      <div class="bp-matrix__axis-x">Sustainable Capacity →</div>
      <div class="bp-matrix__axis-y">Personal Meaning →</div>
      <button
        v-for="p in points"
        :key="p.key"
        type="button"
        class="bp-matrix__point"
        :class="{
          active: p.key === activeDomainId,
          priority: selectedPriorityDomainIds.includes(p.key),
          over: p.quadrant === 'overextended-meaning'
        }"
        :style="{ left: p.left, bottom: p.bottom, background: p.color }"
        :disabled="!interactive"
        :title="`${p.label}: Meaning ${p.importance}, Capacity ${p.capacity}`"
        @click="interactive && emit('domain-select', p.key)"
      >
        {{ p.shortLabel }}
      </button>
    </div>

    <ul class="bp-matrix__list">
      <li v-for="p in points" :key="`li-${p.key}`">
        <strong>{{ p.label }}</strong>
        — Meaning {{ p.importance }}, Capacity {{ p.capacity }} · {{ p.quadrantLabel }}
        <template v-if="p.practice != null"> · Practice {{ p.practice }}</template>
      </li>
      <li v-if="!points.length">
        Complete Personal Meaning and Sustainable Capacity to plot pillars. In-session burden entries
        can also appear here.
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { matrixQuadrant, MATRIX_QUADRANT_LABELS } from '../../utils/burdenPurpose.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  burdenEntries: { type: Array, default: () => [] },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: null },
  interactive: { type: Boolean, default: true },
  clarification: {
    type: String,
    default:
      'High meaning with low capacity may signal overextension — not a call for more strain. Meaningful burden is not suffering.'
  }
});

const emit = defineEmits(['domain-select']);

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const points = computed(() => {
  const fromDomains = (props.domains || [])
    .map((d) => {
      const r = responseMap.value[d.key];
      const importance = r?.personalImportanceScore;
      const capacity = r?.sustainableCapacityScore;
      if (importance == null || capacity == null) return null;
      if (r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant') return null;
      const quadrant = matrixQuadrant(importance, capacity);
      return {
        key: d.key,
        label: d.label,
        shortLabel: (d.shortLabel || d.label).slice(0, 8),
        color: d.color || '#1B4332',
        importance,
        capacity,
        practice: r?.currentPracticeScore ?? null,
        quadrant,
        quadrantLabel: MATRIX_QUADRANT_LABELS[quadrant],
        left: `${((capacity - 1) / 9) * 86 + 7}%`,
        bottom: `${((importance - 1) / 9) * 78 + 10}%`
      };
    })
    .filter(Boolean);

  const fromEntries = (props.burdenEntries || [])
    .map((e, idx) => {
      const importance = e?.personalImportanceScore ?? e?.meaningScore;
      const capacity = e?.sustainableCapacityScore ?? e?.capacityScore;
      if (importance == null || capacity == null) return null;
      const key = e.domainKey || e.id || `entry-${idx}`;
      const quadrant = matrixQuadrant(importance, capacity);
      return {
        key: String(key),
        label: e.label || e.name || 'Custom burden',
        shortLabel: String(e.shortLabel || e.label || 'Custom').slice(0, 8),
        color: e.color || '#8B5E34',
        importance: Number(importance),
        capacity: Number(capacity),
        practice: e.currentPracticeScore ?? null,
        quadrant,
        quadrantLabel: MATRIX_QUADRANT_LABELS[quadrant],
        left: `${((Number(capacity) - 1) / 9) * 86 + 7}%`,
        bottom: `${((Number(importance) - 1) / 9) * 78 + 10}%`
      };
    })
    .filter(Boolean);

  const seen = new Set(fromDomains.map((p) => p.key));
  return [...fromDomains, ...fromEntries.filter((p) => !seen.has(p.key))];
});

const ariaLabel = computed(() => {
  if (!points.value.length) {
    return 'Meaningful Burden Matrix. No completed meaning and capacity pairs yet.';
  }
  return `Meaningful Burden Matrix. ${points.value
    .map(
      (p) =>
        `${p.label}: meaning ${p.importance}, capacity ${p.capacity}, ${p.quadrantLabel}`
    )
    .join('. ')}.`;
});
</script>

<style scoped>
.bp-matrix {
  background:
    linear-gradient(180deg, rgba(69, 123, 157, 0.05), transparent 50%),
    #fff;
  border: 1px solid #d6d3d1;
  border-radius: 16px;
  padding: 1rem;
}

.bp-matrix__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #457b9d;
  font-weight: 700;
}

.bp-matrix__title {
  margin: 0.2rem 0;
  font-size: 1.1rem;
  font-family: Fraunces, Georgia, serif;
}

.bp-matrix__note {
  margin: 0;
  font-size: 0.85rem;
  color: #78716c;
  line-height: 1.45;
}

.bp-matrix__plot {
  position: relative;
  height: 280px;
  margin: 1rem 0 0.5rem;
  border: 1px solid #d6d3d1;
  border-radius: 12px;
  background:
    radial-gradient(circle at 80% 20%, rgba(27, 67, 50, 0.08), transparent 45%),
    #f8faf9;
  overflow: hidden;
}

.bp-matrix__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  height: 100%;
}

.bp-matrix__zone {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 0.55rem 0.65rem;
  font-size: 0.68rem;
  font-weight: 650;
  color: rgba(28, 25, 23, 0.45);
  border: 1px dashed rgba(28, 25, 23, 0.06);
}
.bp-matrix__zone.tl {
  background: rgba(185, 28, 28, 0.04);
}
.bp-matrix__zone.tr {
  background: rgba(27, 67, 50, 0.05);
}

.bp-matrix__axis-x,
.bp-matrix__axis-y {
  position: absolute;
  font-size: 0.68rem;
  color: #78716c;
  font-weight: 600;
}
.bp-matrix__axis-x {
  bottom: 0.35rem;
  right: 0.6rem;
}
.bp-matrix__axis-y {
  top: 42%;
  left: -2.6rem;
  transform: rotate(-90deg);
  transform-origin: center;
  white-space: nowrap;
}

.bp-matrix__point {
  position: absolute;
  transform: translate(-50%, 50%);
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  min-width: 2.1rem;
  height: 2.1rem;
  padding: 0 0.45rem;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 14px rgba(28, 25, 23, 0.18);
  z-index: 2;
}
.bp-matrix__point:disabled {
  cursor: default;
}
.bp-matrix__point.active {
  outline: 2px solid #1d3557;
  outline-offset: 2px;
}
.bp-matrix__point.priority {
  box-shadow: 0 0 0 3px rgba(161, 98, 7, 0.35);
}
.bp-matrix__point.over {
  box-shadow: 0 0 0 3px rgba(185, 28, 28, 0.35);
}

.bp-matrix__list {
  margin: 0.5rem 0 0;
  padding-left: 1.1rem;
  color: #44403c;
  font-size: 0.85rem;
  line-height: 1.5;
}
</style>
