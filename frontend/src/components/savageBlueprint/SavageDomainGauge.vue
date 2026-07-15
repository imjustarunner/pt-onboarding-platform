<template>
  <div class="sb-gauges" :class="{ 'sb-gauges--compact': compact }">
    <header v-if="showHeader" class="sb-gauges__head">
      <p class="sb-gauges__eyebrow">Domain Performance</p>
      <h3 class="sb-gauges__title">{{ title }}</h3>
    </header>
    <div class="sb-gauges__grid">
      <article
        v-for="row in rows"
        :key="row.key"
        class="sb-gauge"
        :class="{ on: row.key === activeDomainId, priority: row.priority }"
        :style="{ '--g-color': row.color }"
      >
        <div class="sb-gauge__top">
          <strong>{{ row.shortLabel || row.label }}</strong>
          <span class="sb-gauge__tier">{{ row.tierLabel || '—' }}</span>
        </div>
        <div class="sb-gauge__track" aria-hidden="true">
          <div class="sb-gauge__fill" :style="{ width: `${row.pct}%` }" />
        </div>
        <div class="sb-gauge__meta">
          <span>{{ row.score != null ? `${row.score}/10` : '—' }}</span>
          <span v-if="row.costly" class="sb-gauge__warn" title="Costly strength">Costly</span>
          <span v-else-if="row.priority" class="sb-gauge__star">Focus</span>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { domainTierFromPerformance } from '../../utils/savageBlueprint.js';

const props = defineProps({
  title: { type: String, default: 'Gauges' },
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  scoredDomains: { type: Array, default: () => [] },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: '' },
  showHeader: { type: Boolean, default: true },
  compact: { type: Boolean, default: false }
});

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const scoredMap = computed(() => {
  const m = {};
  for (const d of props.scoredDomains || []) m[d.domainKey] = d;
  return m;
});

const rows = computed(() =>
  (props.domains || [])
    .filter((d) => {
      const r = responseMap.value[d.key];
      return !(r?.isNotApplicable || r?.seasonStatus === 'not-relevant');
    })
    .map((d) => {
      const r = responseMap.value[d.key];
      const scored = scoredMap.value[d.key];
      const score = scored?.currentPerformanceScore ?? r?.currentPerformanceScore ?? null;
      const tier = scored?.tierLabel || domainTierFromPerformance(score)?.label || null;
      return {
        key: d.key,
        label: d.label,
        shortLabel: d.shortLabel,
        color: d.color || '#3d7a5a',
        score,
        pct: score != null ? Math.max(4, Math.min(100, Number(score) * 10)) : 0,
        tierLabel: tier,
        costly: !!scored?.costlyStrength,
        priority: (props.selectedPriorityDomainIds || []).includes(d.key)
      };
    })
);
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

.sb-gauges {
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  color: #e8eef6;
}
.sb-gauges__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #c4a574;
  font-weight: 600;
}
.sb-gauges__title {
  margin: 0.25rem 0 0.75rem;
  font-family: Sora, system-ui, sans-serif;
  font-size: 1.05rem;
}
.sb-gauges__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.65rem;
}
.sb-gauge {
  background: rgba(15, 26, 42, 0.85);
  border: 1px solid rgba(196, 165, 116, 0.18);
  border-radius: 12px;
  padding: 0.7rem 0.75rem;
}
.sb-gauge.on {
  border-color: rgba(196, 165, 116, 0.55);
}
.sb-gauge.priority {
  box-shadow: inset 0 0 0 1px rgba(61, 122, 90, 0.45);
}
.sb-gauge__top {
  display: flex;
  justify-content: space-between;
  gap: 0.4rem;
  align-items: baseline;
  margin-bottom: 0.45rem;
}
.sb-gauge__top strong {
  font-size: 0.82rem;
  font-family: Sora, system-ui, sans-serif;
}
.sb-gauge__tier {
  font-size: 0.68rem;
  color: #9aa8ba;
}
.sb-gauge__track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}
.sb-gauge__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #1b4332, var(--g-color, #3d7a5a));
  transition: width 0.35s ease;
}
.sb-gauge__meta {
  display: flex;
  justify-content: space-between;
  margin-top: 0.4rem;
  font-size: 0.72rem;
  color: #9aa8ba;
}
.sb-gauge__warn {
  color: #d4a017;
  font-weight: 600;
}
.sb-gauge__star {
  color: #3d7a5a;
  font-weight: 600;
}
</style>
