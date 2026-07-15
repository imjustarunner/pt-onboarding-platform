<template>
  <div
    class="twc"
    :class="{ 'twc--compact': compact, 'twc--interactive': interactive }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="twc__head">
      <div>
        <p class="twc__eyebrow">Well-Being Constellation</p>
        <h3 class="twc__title">{{ title }}</h3>
      </div>
      <div v-if="teenWellBeingIndex != null" class="twc__score">
        <span class="twc__score-n">{{ teenWellBeingIndex }}</span>
        <span class="twc__score-l">/ 100</span>
      </div>
    </header>

    <div class="twc__viz">
      <svg viewBox="0 0 360 360" class="twc__svg" aria-hidden="true">
        <defs>
          <radialGradient id="twc-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(14,165,233,0.25)" />
            <stop offset="100%" stop-color="rgba(14,165,233,0)" />
          </radialGradient>
        </defs>

        <g transform="translate(180,180)">
          <circle r="118" fill="none" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3 6" />
          <line
            v-for="(link, i) in connectionLines"
            :key="`link-${i}`"
            :x1="link.x1"
            :y1="link.y1"
            :x2="link.x2"
            :y2="link.y2"
            stroke="#cbd5e1"
            stroke-width="1"
            opacity="0.55"
          />

          <circle
            v-if="activeDomainId"
            :cx="activePoint.x"
            :cy="activePoint.y"
            r="28"
            fill="url(#twc-glow)"
          />

          <g
            v-for="(p, i) in points"
            :key="p.key"
            :class="{ 'twc-node--active': p.key === activeDomainId }"
          >
            <circle
              :cx="p.x"
              :cy="p.y"
              :r="p.key === activeDomainId ? 16 : p.complete ? 12 : 10"
              :fill="p.complete ? p.color : '#f1f5f9'"
              :stroke="p.key === activeDomainId ? p.color : p.complete ? '#fff' : '#cbd5e1'"
              :stroke-width="p.key === activeDomainId ? 3 : 2"
              :opacity="p.complete || p.key === activeDomainId ? 1 : 0.85"
            />
            <text
              v-if="p.score != null"
              :x="p.x"
              :y="p.y + 4"
              text-anchor="middle"
              class="twc__node-score"
              fill="#0f172a"
            >
              {{ p.score }}
            </text>
          </g>
        </g>

        <circle cx="180" cy="180" r="42" fill="#ffffff" stroke="#e2e8f0" />
        <text x="180" y="172" text-anchor="middle" class="twc__center-label" fill="#64748b">
          How life feels
        </text>
        <text x="180" y="192" text-anchor="middle" class="twc__center-value" fill="#0f172a">
          {{ teenWellBeingIndex ?? '—' }}
        </text>
      </svg>

      <button
        v-for="p in points"
        :key="`lbl-${p.key}`"
        type="button"
        class="twc__label"
        :class="{
          active: p.key === activeDomainId,
          complete: p.complete,
          priority: selectedPriorityDomainIds.includes(p.key)
        }"
        :style="labelStyle(p)"
        :disabled="!interactive"
        @click="interactive && emit('domain-select', p.key)"
      >
        {{ p.shortLabel }}
        <span v-if="p.key === activeDomainId && p.score != null">{{ p.score }}</span>
      </button>
    </div>

    <div v-if="metaLine" class="twc__meta">{{ metaLine }}</div>

    <ul class="twc__list">
      <li v-for="p in points" :key="`li-${p.key}`">
        <strong>{{ p.label }}</strong>
        <span v-if="p.preferNot">Prefer not to answer</span>
        <span v-else-if="p.score == null">Not Answered</span>
        <span v-else>{{ p.score }} out of 10 · {{ p.status }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { domainStatusLabel } from '../../utils/teenWellBeing.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  teenWellBeingIndex: { type: [Number, null], default: null },
  systemScores: { type: Object, default: () => ({}) },
  activeDomainId: { type: String, default: null },
  previousAssessment: { type: Object, default: null },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: false },
  animated: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  title: { type: String, default: 'How life feels right now' },
  strengthCount: { type: Number, default: null },
  supportOpportunityCount: { type: Number, default: null },
  assessmentPeriod: { type: String, default: null }
});

const emit = defineEmits(['domain-select']);

/** Conceptual layout positions (not causal). */
const LAYOUT = {
  confidence: { angle: -90, r: 108 },
  friendships: { angle: -145, r: 108 },
  identity: { angle: -35, r: 108 },
  family: { angle: -180, r: 100 },
  purpose: { angle: 0, r: 100 },
  school: { angle: 180, r: 108 },
  happiness: { angle: 35, r: 108 },
  stress: { angle: 145, r: 108 },
  activities: { angle: 55, r: 108 },
  sleep: { angle: 90, r: 108 }
};

const CONNECTIONS = [
  ['sleep', 'stress'],
  ['sleep', 'school'],
  ['sleep', 'happiness'],
  ['confidence', 'identity'],
  ['confidence', 'school'],
  ['confidence', 'friendships'],
  ['family', 'stress'],
  ['family', 'identity'],
  ['family', 'happiness'],
  ['activities', 'friendships'],
  ['activities', 'purpose'],
  ['activities', 'stress'],
  ['purpose', 'identity'],
  ['purpose', 'school'],
  ['purpose', 'happiness']
];

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

function polar(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

const points = computed(() =>
  (props.domains || []).map((d) => {
    const layout = LAYOUT[d.key] || { angle: 0, r: 100 };
    const pos = polar(layout.angle, layout.r);
    const r = responseMap.value[d.key];
    const score = r?.preferNotToAnswer
      ? null
      : r?.currentExperienceScore ?? r?.score ?? null;
    return {
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel || d.label,
      color: d.color || '#64748b',
      x: pos.x,
      y: pos.y,
      score,
      preferNot: !!r?.preferNotToAnswer,
      complete: score != null || !!r?.preferNotToAnswer,
      status: domainStatusLabel(score)
    };
  })
);

const pointByKey = computed(() => Object.fromEntries(points.value.map((p) => [p.key, p])));

const connectionLines = computed(() => {
  const lines = [];
  for (const [a, b] of CONNECTIONS) {
    const pa = pointByKey.value[a];
    const pb = pointByKey.value[b];
    if (!pa || !pb) continue;
    lines.push({ x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
  }
  return lines;
});

const activePoint = computed(() => {
  const p = pointByKey.value[props.activeDomainId];
  return p || { x: 0, y: 0 };
});

const metaLine = computed(() => {
  const parts = [];
  if (props.assessmentPeriod) parts.push(props.assessmentPeriod);
  if (props.strengthCount != null) parts.push(`${props.strengthCount} strengths`);
  if (props.supportOpportunityCount != null) {
    parts.push(`${props.supportOpportunityCount} support opportunities`);
  }
  if (props.selectedPriorityDomainIds?.length) {
    parts.push(`${props.selectedPriorityDomainIds.length} priorities`);
  }
  return parts.join(' · ');
});

const ariaLabel = computed(() => {
  const parts = points.value.map((p) => {
    if (p.preferNot) return `${p.label}: prefer not to answer`;
    if (p.score == null) return `${p.label}: not answered`;
    return `${p.label}: ${p.score} out of 10, ${p.status}`;
  });
  return `Well-Being Constellation. Index ${props.teenWellBeingIndex ?? 'not yet calculated'}. ${parts.join('. ')}. Connections are conceptual only and do not imply causation.`;
});

function labelStyle(p) {
  const x = 50 + (p.x / 180) * 42;
  const y = 50 + (p.y / 180) * 42;
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: 'translate(-50%, -50%)'
  };
}
</script>

<style scoped>
.twc {
  background: linear-gradient(165deg, #ffffff 0%, #f8fafc 50%, #eff6ff 100%);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 1.1rem 1.15rem 1.2rem;
  color: #0f172a;
  font-family: 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif;
}

.twc--compact {
  padding: 0.75rem;
}

.twc__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.twc__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 700;
}

.twc__title {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
  font-weight: 800;
}

.twc__score-n {
  font-size: 1.85rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.twc__score-l {
  font-size: 0.8rem;
  color: #64748b;
}

.twc__viz {
  position: relative;
  width: min(100%, 380px);
  margin: 0 auto;
  aspect-ratio: 1;
}

.twc__svg {
  width: 100%;
  height: 100%;
}

.twc__center-label {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.twc__center-value {
  font-size: 18px;
  font-weight: 900;
}

.twc__node-score {
  font-size: 9px;
  font-weight: 800;
}

.twc__label {
  position: absolute;
  border: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 999px;
  padding: 0.2rem 0.45rem;
  font-size: 0.68rem;
  font-weight: 700;
  color: #334155;
  cursor: default;
  max-width: 5.2rem;
  line-height: 1.2;
  text-align: center;
}

.twc--interactive .twc__label {
  cursor: pointer;
}

.twc__label.active {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2);
  z-index: 2;
}

.twc__label.priority {
  border-color: #6366f1;
}

.twc__label span {
  display: block;
  font-variant-numeric: tabular-nums;
  color: #0284c7;
}

.twc__meta {
  margin-top: 0.55rem;
  text-align: center;
  font-size: 0.75rem;
  color: #64748b;
}

.twc__list {
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.78rem;
  color: #475569;
  display: grid;
  gap: 0.25rem;
}

.twc__list strong {
  color: #0f172a;
  margin-right: 0.35rem;
}

@media (prefers-reduced-motion: reduce) {
  .twc * {
    transition: none !important;
  }
}
</style>
