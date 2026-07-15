<template>
  <div class="arr" role="img" :aria-label="ariaLabel">
    <header class="arr__head">
      <h3 class="arr__title">{{ title }}</h3>
      <p v-if="subtitle" class="arr__sub">{{ subtitle }}</p>
    </header>
    <div class="arr__strip">
      <button
        v-for="col in columns"
        :key="col.key"
        type="button"
        class="arr__col"
        :class="{ 'arr__col--empty': col.score == null, 'arr__col--active': col.key === activeKey }"
        :style="{ '--arr-color': col.color }"
        :disabled="!interactive"
        @click="interactive && emit('select', col.key)"
      >
        <div class="arr__bars" aria-hidden="true">
          <span
            v-for="n in 10"
            :key="n"
            class="arr__seg"
            :class="{ on: col.score != null && n <= Math.round(col.score) }"
          />
        </div>
        <span class="arr__score">{{ col.score == null ? '—' : col.score }}</span>
        <span class="arr__label">{{ col.shortLabel || col.label }}</span>
      </button>
    </div>
    <ul class="arr__text">
      <li v-for="col in columns" :key="`t-${col.key}`">
        {{ col.shortLabel || col.label }}:
        {{ col.score == null ? 'Not rated' : `${col.score} out of 10` }}
        <span aria-hidden="true"> {{ scoreBar(col.score) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { scoreBar } from '../../utils/athleteReadiness.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  title: { type: String, default: 'Readiness Radar Strip' },
  subtitle: { type: String, default: 'Quick comparison across readiness domains' },
  interactive: { type: Boolean, default: false },
  activeKey: { type: String, default: null }
});

const emit = defineEmits(['select']);

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const columns = computed(() =>
  (props.domains || []).map((d) => ({
    key: d.key,
    label: d.label,
    shortLabel: d.shortLabel,
    color: d.color || '#64748b',
    score: responseMap.value[d.key]?.score ?? null
  }))
);

const ariaLabel = computed(() => {
  const parts = columns.value.map((c) =>
    c.score == null
      ? `${c.shortLabel || c.label}: not rated`
      : `${c.shortLabel || c.label}: ${c.score} out of 10`
  );
  return `Readiness radar strip. ${parts.join('. ')}.`;
});
</script>

<style scoped>
.arr {
  background: linear-gradient(180deg, #f8fafc, #eef2ff);
  border: 1px solid #dbe3f0;
  border-radius: 16px;
  padding: 1rem 1.1rem 1.15rem;
  color: #0f172a;
}

.arr__head {
  margin-bottom: 0.85rem;
}

.arr__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.arr__sub {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  color: #64748b;
}

.arr__strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
  gap: 0.45rem;
  align-items: end;
}

.arr__col {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 10px;
  padding: 0.35rem 0.15rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  cursor: default;
  color: inherit;
}

.arr__col:not(:disabled) {
  cursor: pointer;
}

.arr__col:not(:disabled):hover,
.arr__col--active {
  background: #fff;
  border-color: color-mix(in srgb, var(--arr-color) 45%, #cbd5e1);
}

.arr__col:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}

.arr__bars {
  display: flex;
  flex-direction: column-reverse;
  gap: 2px;
  height: 88px;
  width: 18px;
}

.arr__seg {
  flex: 1;
  border-radius: 2px;
  background: #e2e8f0;
}

.arr__seg.on {
  background: var(--arr-color);
}

.arr__col--empty .arr__seg {
  background: #e2e8f0;
}

.arr__score {
  font-size: 0.78rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--arr-color);
}

.arr__label {
  font-size: 0.62rem;
  font-weight: 600;
  text-align: center;
  line-height: 1.15;
  color: #475569;
  max-width: 4.5rem;
}

.arr__text {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

@media (prefers-reduced-motion: reduce) {
  .arr__seg {
    transition: none;
  }
}
</style>
