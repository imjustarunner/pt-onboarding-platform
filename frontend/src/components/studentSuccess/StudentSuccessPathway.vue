<template>
  <div
    class="ssp"
    :class="{
      'ssp--compact': compact,
      'ssp--interactive': interactive,
      'ssp--young': ageGroup === 'upper-elementary'
    }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="ssp__head">
      <div>
        <p class="ssp__eyebrow">Student Success Pathway</p>
        <h3 class="ssp__title">{{ title }}</h3>
      </div>
      <div v-if="studentSuccessScore != null" class="ssp__score">
        <span class="ssp__score-n">{{ studentSuccessScore }}</span>
        <span class="ssp__score-l">/ 100</span>
      </div>
    </header>

    <ol class="ssp__path">
      <li class="ssp__start" aria-hidden="true">Start</li>
      <li
        v-for="station in stations"
        :key="station.key"
        class="ssp__station"
        :class="{
          'ssp__station--active': station.key === activeKey,
          'ssp__station--done': station.score != null,
          'ssp__station--empty': station.score == null
        }"
        :style="{ '--ssp-color': station.color }"
        :tabindex="interactive ? 0 : -1"
        :aria-current="station.key === activeKey ? 'true' : undefined"
        @click="interactive && emit('domain-select', station.key)"
        @keydown.enter="interactive && emit('domain-select', station.key)"
      >
        <span class="ssp__dot" aria-hidden="true">
          <span v-if="station.score != null" class="ssp__check">✓</span>
          <span v-else class="ssp__ring" />
        </span>
        <div class="ssp__meta">
          <span class="ssp__name">{{ station.key === activeKey ? station.label : station.shortLabel }}</span>
          <span class="ssp__val">
            {{ station.score == null ? 'Not Rated' : `${station.score}/10` }}
          </span>
          <span v-if="station.support" class="ssp__badge">Support</span>
          <span v-if="station.goal" class="ssp__badge ssp__badge--goal">Goal</span>
        </div>
        <div class="ssp__bar" aria-hidden="true">
          <div class="ssp__fill" :style="{ width: fillPct(station.score) }" />
        </div>
      </li>
      <li class="ssp__milestone" aria-hidden="true">Next Milestone</li>
    </ol>

    <div v-if="systemScores && !compact" class="ssp__systems">
      <div v-for="sys in systemRows" :key="sys.key" class="ssp__sys">
        <span>{{ sys.label }}</span>
        <strong>{{ sys.score == null ? '—' : sys.score }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { SYSTEM_META } from '../../utils/studentSuccess.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  studentSuccessScore: { type: [Number, null], default: null },
  systemScores: { type: Object, default: () => ({}) },
  activeDomainId: { type: String, default: null },
  interactive: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  ageGroup: { type: String, default: 'high-school' },
  showSupportIndicators: { type: Boolean, default: true },
  showGoalIndicators: { type: Boolean, default: true },
  priorityKeys: { type: Array, default: () => [] },
  title: { type: String, default: 'Your path' }
});

const emit = defineEmits(['domain-select']);

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const activeKey = computed(() => props.activeDomainId || null);

const stations = computed(() =>
  (props.domains || []).map((d) => {
    const r = responseMap.value[d.key];
    return {
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel || d.label,
      color: d.color || '#64748b',
      score: r?.score ?? null,
      support:
        props.showSupportIndicators && r?.supportPreference && r.supportPreference !== 'none',
      goal: props.showGoalIndicators && (props.priorityKeys || []).includes(d.key)
    };
  })
);

const systemRows = computed(() =>
  SYSTEM_META.map((s) => ({
    ...s,
    score: props.systemScores?.[s.key] ?? null
  }))
);

const ariaLabel = computed(() => {
  const parts = stations.value.map((s) =>
    s.score == null ? `${s.shortLabel}: not rated` : `${s.shortLabel}: ${s.score} out of 10`
  );
  const overall =
    props.studentSuccessScore == null
      ? 'Student Success Score not yet calculated'
      : `Student Success Score ${props.studentSuccessScore} out of 100`;
  return `Student Success Pathway. ${overall}. ${parts.join('. ')}.`;
});

function fillPct(score) {
  if (score == null) return '0%';
  return `${Math.max(6, Math.min(100, (Number(score) / 10) * 100))}%`;
}
</script>

<style scoped>
.ssp {
  --ssp-ink: #0f172a;
  --ssp-muted: #64748b;
  background: linear-gradient(165deg, #fffbeb 0%, #f8fafc 40%, #eef2ff 100%);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 1.1rem 1.15rem 1.2rem;
  color: var(--ssp-ink);
  font-family: 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif;
}

.ssp--young {
  background: linear-gradient(165deg, #ecfeff 0%, #f0fdf4 50%, #fefce8 100%);
  border-radius: 22px;
}

.ssp__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.ssp__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ssp-muted);
  font-weight: 700;
}

.ssp__title {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.ssp__score {
  text-align: right;
  line-height: 1;
}

.ssp__score-n {
  font-size: 1.85rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.ssp__score-l {
  font-size: 0.8rem;
  color: var(--ssp-muted);
}

.ssp__path {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ssp__start,
.ssp__milestone {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ssp-muted);
  padding-left: 1.75rem;
}

.ssp__station {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 0.65rem;
  row-gap: 0.3rem;
  align-items: center;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 0.55rem 0.7rem;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.ssp--interactive .ssp__station {
  cursor: pointer;
}

.ssp__station:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}

.ssp__station--active {
  transform: scale(1.02);
  border-color: var(--ssp-color);
  box-shadow: 0 0 0 1px var(--ssp-color), 0 8px 24px color-mix(in srgb, var(--ssp-color) 28%, transparent);
  z-index: 1;
}

.ssp__station--done {
  border-color: color-mix(in srgb, var(--ssp-color) 45%, #e2e8f0);
}

.ssp__station--empty {
  opacity: 0.78;
}

.ssp__dot {
  grid-row: 1 / span 2;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--ssp-color) 18%, #fff);
  color: var(--ssp-color);
  font-size: 0.75rem;
  font-weight: 800;
}

.ssp__ring {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  border: 2px solid #cbd5e1;
}

.ssp__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.55rem;
}

.ssp__name {
  font-weight: 700;
  font-size: 0.86rem;
}

.ssp__val {
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  font-size: 0.8rem;
  color: var(--ssp-color);
}

.ssp__badge {
  font-size: 0.62rem;
  font-weight: 700;
  background: #fff7ed;
  color: #c2410c;
  border-radius: 999px;
  padding: 0.1rem 0.4rem;
}

.ssp__badge--goal {
  background: #ecfdf5;
  color: #047857;
}

.ssp__bar {
  grid-column: 2;
  height: 7px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.ssp__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--ssp-color) 65%, #fff), var(--ssp-color));
  transition: width 0.35s ease;
}

.ssp__systems {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.45rem;
  margin-top: 0.85rem;
}

.ssp__sys {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.45rem 0.55rem;
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--ssp-muted);
}

.ssp__sys strong {
  color: var(--ssp-ink);
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .ssp__station,
  .ssp__fill {
    transition: none;
  }
  .ssp__station--active {
    transform: none;
  }
}
</style>
