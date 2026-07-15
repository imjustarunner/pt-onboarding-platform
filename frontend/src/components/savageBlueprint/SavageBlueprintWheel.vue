<template>
  <div
    class="sb-wheel"
    :class="{ 'sb-wheel--compact': compact, 'sb-wheel--interactive': interactive }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="sb-wheel__head">
      <div>
        <p class="sb-wheel__eyebrow">Blueprint Wheel</p>
        <h3 class="sb-wheel__title">{{ title }}</h3>
      </div>
      <div v-if="savageScore != null" class="sb-wheel__score">
        <span class="sb-wheel__score-n">{{ savageScore }}</span>
        <span class="sb-wheel__score-l">/ 100</span>
      </div>
    </header>

    <div class="sb-wheel__viz">
      <svg viewBox="0 0 360 360" class="sb-wheel__svg" aria-hidden="true">
        <defs>
          <radialGradient id="sbWheelGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#1e3a5f" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#0b1220" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="180" cy="180" r="150" fill="url(#sbWheelGlow)" />
        <g transform="translate(180,180)">
          <circle
            v-for="ring in [2, 4, 6, 8, 10]"
            :key="ring"
            :r="(ring / 10) * 120"
            fill="none"
            stroke="rgba(180, 150, 100, 0.18)"
            stroke-width="1"
          />
          <line
            v-for="(d, i) in plotDomains"
            :key="`axis-${d.key}`"
            :x1="0"
            :y1="0"
            :x2="point(i, 10).x"
            :y2="point(i, 10).y"
            stroke="rgba(180, 150, 100, 0.2)"
            stroke-width="1"
          />

          <polygon
            v-if="performancePoints"
            :points="performancePoints"
            fill="rgba(61, 122, 90, 0.22)"
            stroke="#3d7a5a"
            stroke-width="2.5"
            stroke-linejoin="round"
            class="sb-wheel__poly"
          />
          <circle
            v-for="(p, i) in performanceMarkers"
            :key="`m-${i}`"
            :cx="p.x"
            :cy="p.y"
            r="4.5"
            :fill="p.active ? '#c4a574' : '#3d7a5a'"
            stroke="#0b1220"
            stroke-width="1.5"
            :class="{ 'sb-wheel__dot--click': interactive }"
            @click="interactive && emit('domain-select', plotDomains[i].key)"
          />
        </g>

        <circle cx="180" cy="180" r="38" fill="#0f1a2a" stroke="rgba(196, 165, 116, 0.45)" />
        <text x="180" y="174" text-anchor="middle" class="sb-wheel__center-label" fill="#a8b4c4">
          Savage
        </text>
        <text x="180" y="194" text-anchor="middle" class="sb-wheel__center-value" fill="#e8eef6">
          {{ savageScore ?? '—' }}
        </text>

        <g v-for="(d, i) in plotDomains" :key="`lbl-${d.key}`">
          <text
            :x="labelPoint(i).x"
            :y="labelPoint(i).y"
            text-anchor="middle"
            class="sb-wheel__label"
            :fill="d.key === activeDomainId ? '#c4a574' : '#9aa8ba'"
            :class="{ 'sb-wheel__label--click': interactive }"
            @click="interactive && emit('domain-select', d.key)"
          >
            {{ d.shortLabel || d.label }}
          </text>
        </g>
      </svg>
    </div>

    <div v-if="systemScores" class="sb-wheel__systems">
      <div v-for="s in systemRows" :key="s.key" class="sb-wheel__sys">
        <span>{{ s.label }}</span>
        <strong>{{ s.avg ?? '—' }}</strong>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  title: { type: String, default: 'Your operating map' },
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  savageScore: { type: Number, default: null },
  systemScores: { type: Object, default: null },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false }
});

const emit = defineEmits(['domain-select']);

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const plotDomains = computed(() =>
  (props.domains || []).filter((d) => {
    const r = responseMap.value[d.key];
    return !(r?.isNotApplicable || r?.seasonStatus === 'not-relevant');
  })
);

function scoreOf(key) {
  const r = responseMap.value[key];
  if (!r || r.isNotApplicable || r.preferNotToAnswer || r.seasonStatus === 'not-relevant') return 0;
  return Number(r.currentPerformanceScore) || 0;
}

function point(index, score) {
  const n = plotDomains.value.length || 1;
  const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
  const r = (Math.max(0, Math.min(10, score)) / 10) * 120;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

function labelPoint(index) {
  const n = plotDomains.value.length || 1;
  const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
  const r = 148;
  return { x: 180 + Math.cos(angle) * r, y: 180 + Math.sin(angle) * r };
}

const performancePoints = computed(() => {
  if (!plotDomains.value.length) return '';
  return plotDomains.value
    .map((d, i) => {
      const p = point(i, scoreOf(d.key));
      return `${p.x},${p.y}`;
    })
    .join(' ');
});

const performanceMarkers = computed(() =>
  plotDomains.value.map((d, i) => ({
    ...point(i, scoreOf(d.key)),
    active: d.key === props.activeDomainId || (props.selectedPriorityDomainIds || []).includes(d.key)
  }))
);

const systemRows = computed(() => [
  {
    key: 'body',
    label: 'Body',
    avg: props.systemScores?.bodyAndPerformance
  },
  {
    key: 'mission',
    label: 'Mission',
    avg: props.systemScores?.missionAndLeadership
  },
  {
    key: 'connection',
    label: 'Connection',
    avg: props.systemScores?.connectionAndEmotionalMastery
  },
  {
    key: 'challenge',
    label: 'Challenge',
    avg: props.systemScores?.challengeAndLegacy
  }
]);

const ariaLabel = computed(
  () =>
    `Blueprint Wheel with Savage Score ${props.savageScore ?? 'unavailable'} across ${plotDomains.value.length} domains`
);
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

.sb-wheel {
  --ink: #e8eef6;
  --muted: #9aa8ba;
  --bronze: #c4a574;
  --panel: #121c2c;
  background: linear-gradient(165deg, #121c2c 0%, #0b1220 100%);
  border: 1px solid rgba(196, 165, 116, 0.22);
  border-radius: 18px;
  padding: 1rem 1rem 1.15rem;
  color: var(--ink);
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
}
.sb-wheel--compact {
  padding: 0.75rem;
}
.sb-wheel__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}
.sb-wheel__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--bronze);
  font-weight: 600;
}
.sb-wheel__title {
  margin: 0.2rem 0 0;
  font-family: Sora, system-ui, sans-serif;
  font-size: 1.05rem;
  font-weight: 600;
}
.sb-wheel__score {
  text-align: right;
}
.sb-wheel__score-n {
  font-family: Sora, system-ui, sans-serif;
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--bronze);
}
.sb-wheel__score-l {
  color: var(--muted);
  font-size: 0.8rem;
}
.sb-wheel__viz {
  display: flex;
  justify-content: center;
}
.sb-wheel__svg {
  width: 100%;
  max-width: 340px;
  height: auto;
}
.sb-wheel--compact .sb-wheel__svg {
  max-width: 280px;
}
.sb-wheel__poly {
  transition: points 0.35s ease;
}
.sb-wheel__center-label {
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.sb-wheel__center-value {
  font-family: Sora, system-ui, sans-serif;
  font-size: 16px;
  font-weight: 700;
}
.sb-wheel__label {
  font-size: 9px;
  font-weight: 600;
}
.sb-wheel__label--click,
.sb-wheel__dot--click {
  cursor: pointer;
}
.sb-wheel__systems {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
  margin-top: 0.75rem;
}
.sb-wheel__sys {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  font-size: 0.78rem;
  color: var(--muted);
}
.sb-wheel__sys strong {
  color: var(--ink);
  font-family: Sora, system-ui, sans-serif;
}
</style>
