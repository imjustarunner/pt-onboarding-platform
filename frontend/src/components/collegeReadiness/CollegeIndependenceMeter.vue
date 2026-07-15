<template>
  <div class="cim" v-if="rows.length">
    <h3 class="cim__title">Independence Meter</h3>
    <p class="cim__sub">
      College readiness includes knowing when and how to use available support.
    </p>
    <div v-for="row in rows" :key="row.key" class="cim__row">
      <div class="cim__name">{{ row.label }}</div>
      <div class="cim__meters">
        <div class="cim__m">
          <span>Confidence</span>
          <strong>{{ row.confidence ?? '—' }}</strong>
          <div class="cim__bar"><div :style="{ width: pct(row.confidence) }" /></div>
        </div>
        <div class="cim__m">
          <span>Current Skill</span>
          <strong>{{ row.readiness ?? '—' }}</strong>
          <div class="cim__bar"><div :style="{ width: pct(row.readiness) }" /></div>
        </div>
        <div class="cim__m">
          <span>Support</span>
          <strong>{{ row.support ?? '—' }}</strong>
          <div class="cim__bar"><div :style="{ width: pct(row.support) }" /></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  limit: { type: Number, default: 4 }
});

const rows = computed(() => {
  const byKey = Object.fromEntries((props.responses || []).map((r) => [r.domainKey, r]));
  return (props.domains || [])
    .map((d) => {
      const r = byKey[d.key];
      if (!r || r.readinessScore == null) return null;
      if (r.confidenceScore == null && r.supportAvailabilityScore == null) return null;
      return {
        key: d.key,
        label: d.shortLabel || d.label,
        readiness: r.readinessScore,
        confidence: r.confidenceScore,
        support: r.supportAvailabilityScore
      };
    })
    .filter(Boolean)
    .slice(0, props.limit);
});

function pct(n) {
  if (n == null) return '0%';
  return `${Math.max(4, Math.min(100, (Number(n) / 10) * 100))}%`;
}
</script>

<style scoped>
.cim {
  background: #fff;
  border: 1px solid #dbe3f0;
  border-radius: 14px;
  padding: 0.95rem 1rem;
}

.cim__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}

.cim__sub {
  margin: 0.25rem 0 0.75rem;
  font-size: 0.82rem;
  color: #64748b;
}

.cim__row {
  margin-bottom: 0.75rem;
}

.cim__name {
  font-weight: 700;
  font-size: 0.88rem;
  margin-bottom: 0.35rem;
}

.cim__meters {
  display: grid;
  gap: 0.35rem;
}

.cim__m {
  display: grid;
  grid-template-columns: 7.5rem auto 1fr;
  gap: 0.45rem;
  align-items: center;
  font-size: 0.75rem;
  color: #64748b;
}

.cim__m strong {
  color: #0f172a;
  font-variant-numeric: tabular-nums;
  min-width: 1.2rem;
}

.cim__bar {
  height: 6px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.cim__bar > div {
  height: 100%;
  background: linear-gradient(90deg, #0369a1, #14b8a6);
}
</style>
