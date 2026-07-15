<template>
  <div
    class="clp"
    :class="{ 'clp--compact': compact, 'clp--interactive': interactive }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="clp__head">
      <div>
        <p class="clp__eyebrow">College Launchpad</p>
        <h3 class="clp__title">{{ title }}</h3>
      </div>
      <div v-if="collegeReadinessScore != null" class="clp__score">
        <span class="clp__score-n">{{ collegeReadinessScore }}</span>
        <span class="clp__score-l">/ 100</span>
      </div>
    </header>

    <div class="clp__runway" aria-hidden="true">
      <div
        v-for="(stage, idx) in stages"
        :key="stage.key"
        class="clp__stage"
        :class="{
          'clp__stage--done': stage.illuminated,
          'clp__stage--active': stage.key === activeStage || stage.hasActiveDomain
        }"
      >
        <span class="clp__stage-n">{{ idx + 1 }}</span>
        <span class="clp__stage-label">{{ stage.label }}</span>
        <span class="clp__stage-prog">{{ stage.completed }}/{{ stage.total || 0 }}</span>
      </div>
    </div>

    <ul class="clp__indicators">
      <li
        v-for="ind in indicators"
        :key="ind.key"
        class="clp__ind"
        :class="{
          'clp__ind--active': ind.key === activeDomainId,
          'clp__ind--done': ind.readinessScore != null,
          'clp__ind--empty': ind.readinessScore == null
        }"
        :style="{ '--clp-color': ind.color }"
        :tabindex="interactive ? 0 : -1"
        :aria-current="ind.key === activeDomainId ? 'true' : undefined"
        @click="interactive && emit('domain-select', ind.key)"
        @keydown.enter="interactive && emit('domain-select', ind.key)"
      >
        <div class="clp__ind-top">
          <span class="clp__ind-name">
            {{ ind.key === activeDomainId ? ind.label : ind.shortLabel }}
          </span>
          <span class="clp__ind-score">
            {{ ind.readinessScore == null ? 'Not Rated' : `${ind.readinessScore}/10` }}
          </span>
        </div>
        <div class="clp__bar"><div class="clp__fill" :style="{ width: fillPct(ind.readinessScore) }" /></div>
        <div class="clp__ind-meta">
          <span class="clp__stage-tag">{{ stageLabel(ind.stage) }}</span>
          <span v-if="ind.support" class="clp__badge">Support</span>
          <span v-if="ind.goal" class="clp__badge clp__badge--goal">Plan</span>
        </div>
      </li>
    </ul>

    <div v-if="systemScores && !compact" class="clp__systems">
      <div v-for="sys in systemRows" :key="sys.key" class="clp__sys">
        <span>{{ sys.label }}</span>
        <strong>{{ sys.score == null ? '—' : sys.score }}</strong>
      </div>
    </div>

    <p v-if="upcomingDeadline" class="clp__deadline">
      Next deadline: <strong>{{ upcomingDeadline }}</strong>
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { LAUNCH_STAGES, SYSTEM_META } from '../../utils/collegeReadiness.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  collegeReadinessScore: { type: [Number, null], default: null },
  systemScores: { type: Object, default: () => ({}) },
  stageProgress: { type: Object, default: () => ({}) },
  activeDomainId: { type: String, default: null },
  interactive: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  priorityKeys: { type: Array, default: () => [] },
  upcomingDeadline: { type: String, default: '' },
  title: { type: String, default: 'Your launch sequence' }
});

const emit = defineEmits(['domain-select']);

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const indicators = computed(() =>
  (props.domains || []).map((d) => {
    const r = responseMap.value[d.key];
    return {
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel || d.label,
      color: d.color || '#64748b',
      stage: d.launchStage,
      readinessScore: r?.readinessScore ?? null,
      support: r?.supportPreference && r.supportPreference !== 'none',
      goal: (props.priorityKeys || []).includes(d.key)
    };
  })
);

const activeStage = computed(() => {
  const d = (props.domains || []).find((x) => x.key === props.activeDomainId);
  return d?.launchStage || null;
});

const stages = computed(() =>
  LAUNCH_STAGES.map((s) => {
    const prog = props.stageProgress?.[s.key] || { completed: 0, total: 0, illuminated: false };
    return {
      ...s,
      ...prog,
      hasActiveDomain: indicators.value.some(
        (i) => i.stage === s.key && i.key === props.activeDomainId
      )
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
  const parts = indicators.value.map((i) =>
    i.readinessScore == null
      ? `${i.shortLabel}: not rated`
      : `${i.shortLabel}: ${i.readinessScore} out of 10`
  );
  const overall =
    props.collegeReadinessScore == null
      ? 'College Readiness Score not yet calculated'
      : `College Readiness Score ${props.collegeReadinessScore} out of 100`;
  return `College Launchpad. ${overall}. ${parts.join('. ')}.`;
});

function fillPct(score) {
  if (score == null) return '0%';
  return `${Math.max(6, Math.min(100, (Number(score) / 10) * 100))}%`;
}

function stageLabel(key) {
  return LAUNCH_STAGES.find((s) => s.key === key)?.label || key;
}
</script>

<style scoped>
.clp {
  background: linear-gradient(165deg, #0b1220 0%, #111827 50%, #0f172a 100%);
  border: 1px solid #1e293b;
  border-radius: 18px;
  padding: 1.1rem 1.15rem 1.2rem;
  color: #e2e8f0;
  font-family: 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif;
}

.clp__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.clp__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #94a3b8;
  font-weight: 700;
}

.clp__title {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.clp__score-n {
  font-size: 1.85rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.clp__score-l {
  font-size: 0.8rem;
  color: #94a3b8;
}

.clp__runway {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.3rem;
  margin-bottom: 0.9rem;
}

.clp__stage {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 0.4rem 0.35rem;
  text-align: center;
  display: grid;
  gap: 0.1rem;
}

.clp__stage--done {
  border-color: #14b8a6;
  background: color-mix(in srgb, #14b8a6 18%, #0f172a);
}

.clp__stage--active {
  border-color: #38bdf8;
  box-shadow: 0 0 0 1px #38bdf8, 0 0 18px #0ea5e955;
}

.clp__stage-n {
  font-size: 0.65rem;
  color: #64748b;
  font-weight: 700;
}

.clp__stage-label {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.clp__stage-prog {
  font-size: 0.6rem;
  color: #94a3b8;
}

.clp__indicators {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
  max-height: 360px;
  overflow: auto;
}

.clp__ind {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 0.55rem 0.65rem;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.clp--interactive .clp__ind {
  cursor: pointer;
}

.clp__ind:focus-visible {
  outline: 2px solid #38bdf8;
  outline-offset: 2px;
}

.clp__ind--active {
  transform: scale(1.02);
  border-color: var(--clp-color);
  box-shadow: 0 0 0 1px var(--clp-color), 0 8px 24px color-mix(in srgb, var(--clp-color) 35%, transparent);
}

.clp__ind--empty {
  opacity: 0.72;
}

.clp__ind-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.82rem;
  margin-bottom: 0.3rem;
}

.clp__ind-name {
  font-weight: 700;
}

.clp__ind-score {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--clp-color);
}

.clp__bar {
  height: 7px;
  border-radius: 999px;
  background: #1e293b;
  overflow: hidden;
}

.clp__fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, color-mix(in srgb, var(--clp-color) 60%, #0f172a), var(--clp-color));
  transition: width 0.35s ease;
}

.clp__ind-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.35rem;
}

.clp__stage-tag {
  font-size: 0.62rem;
  color: #94a3b8;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.clp__badge {
  font-size: 0.6rem;
  font-weight: 700;
  background: #422006;
  color: #fbbf24;
  border-radius: 999px;
  padding: 0.1rem 0.4rem;
}

.clp__badge--goal {
  background: #064e3b;
  color: #6ee7b7;
}

.clp__systems {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
  margin-top: 0.85rem;
}

.clp__sys {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 0.4rem 0.5rem;
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #94a3b8;
}

.clp__sys strong {
  color: #e2e8f0;
  font-variant-numeric: tabular-nums;
}

.clp__deadline {
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  color: #94a3b8;
}

@media (max-width: 700px) {
  .clp__runway {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .clp__ind,
  .clp__fill {
    transition: none;
  }
  .clp__ind--active {
    transform: none;
  }
}
</style>
