<template>
  <div
    class="rr-system"
    :class="{ 'rr-system--compact': compact, 'rr-system--interactive': interactive }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="rr-system__head">
      <div>
        <p class="rr-system__eyebrow">Reward Regulation System</p>
        <h3 class="rr-system__title">{{ title }}</h3>
      </div>
      <div v-if="rewardRegulationScore != null" class="rr-system__score">
        <span class="rr-system__score-n">{{ rewardRegulationScore }}</span>
        <span class="rr-system__score-l">/ 100</span>
      </div>
    </header>

    <div class="rr-system__viz">
      <svg viewBox="0 0 400 400" class="rr-system__svg" aria-hidden="true">
        <defs>
          <radialGradient id="rrSysGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#1e3a5f" stop-opacity="0.4" />
            <stop offset="100%" stop-color="#0c1219" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="168" fill="url(#rrSysGlow)" />

        <!-- Four zone arcs -->
        <g transform="translate(200,200)">
          <path
            v-for="z in zones"
            :key="z.id"
            :d="zoneArc(z.start, z.end, 128)"
            fill="none"
            :stroke="z.color"
            stroke-width="18"
            stroke-opacity="0.28"
            stroke-linecap="butt"
          />
          <circle
            v-for="ring in [2, 4, 6, 8, 10]"
            :key="ring"
            :r="(ring / 10) * 110"
            fill="none"
            stroke="rgba(180, 160, 120, 0.14)"
            stroke-width="1"
          />
          <line
            v-for="(d, i) in plotDomains"
            :key="`axis-${d.key}`"
            :x1="0"
            :y1="0"
            :x2="point(i, 10).x"
            :y2="point(i, 10).y"
            stroke="rgba(180, 160, 120, 0.18)"
            stroke-width="1"
          />
          <polygon
            v-if="regulationPoints"
            :points="regulationPoints"
            fill="rgba(45, 106, 79, 0.22)"
            stroke="#3d7a5a"
            stroke-width="2.5"
            stroke-linejoin="round"
            class="rr-system__poly"
          />
          <circle
            v-for="(p, i) in regulationMarkers"
            :key="`m-${i}`"
            :cx="p.x"
            :cy="p.y"
            r="5"
            :fill="p.active ? '#d4a574' : p.color"
            stroke="#0c1219"
            stroke-width="1.5"
            :class="{ 'rr-system__dot--click': interactive }"
            @click="interactive && emit('domain-select', plotDomains[i].key)"
          />
        </g>

        <circle cx="200" cy="200" r="42" fill="#121a24" stroke="rgba(212, 165, 116, 0.45)" />
        <text x="200" y="192" text-anchor="middle" class="rr-system__center-label" fill="#9aa8ba">
          Regulation
        </text>
        <text x="200" y="214" text-anchor="middle" class="rr-system__center-value" fill="#e8eef6">
          {{ rewardRegulationScore ?? '—' }}
        </text>

        <g v-for="(d, i) in plotDomains" :key="`lbl-${d.key}`">
          <text
            :x="labelPoint(i).x"
            :y="labelPoint(i).y"
            text-anchor="middle"
            class="rr-system__label"
            :fill="d.key === activeDomainId ? '#d4a574' : '#9aa8ba'"
            :class="{ 'rr-system__label--click': interactive }"
            @click="interactive && emit('domain-select', d.key)"
          >
            {{ d.shortLabel || d.label }}
          </text>
        </g>
      </svg>
    </div>

    <div v-if="systemScores" class="rr-system__systems">
      <div v-for="s in systemRows" :key="s.key" class="rr-system__sys">
        <span :style="{ borderColor: s.color }">{{ s.label }}</span>
        <strong>{{ s.avg ?? '—' }}</strong>
      </div>
    </div>

    <p v-if="levelLabel" class="rr-system__level">{{ levelLabel }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  title: { type: String, default: 'Your regulation map' },
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  rewardRegulationScore: { type: Number, default: null },
  systemScores: { type: Object, default: null },
  levelLabel: { type: String, default: '' },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false }
});

const emit = defineEmits(['domain-select']);

const zones = [
  { id: 'command', label: 'Command', color: '#4A6FA5', start: -90, end: 0 },
  { id: 'regulation', label: 'Regulation', color: '#6D597A', start: 0, end: 90 },
  { id: 'environment', label: 'Environment', color: '#2D6A4F', start: 90, end: 180 },
  { id: 'direction', label: 'Direction', color: '#BC6C25', start: 180, end: 270 }
];

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const plotDomains = computed(() =>
  (props.domains || []).filter((d) => {
    const r = responseMap.value[d.key];
    return r?.seasonStatus !== 'not-relevant';
  })
);

function scoreOf(key) {
  const r = responseMap.value[key];
  if (!r || r.preferNotToAnswer || r.seasonStatus === 'not-relevant') return 0;
  return Number(r.currentRegulationScore) || 0;
}

function point(index, score) {
  const n = plotDomains.value.length || 1;
  const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
  const r = (Math.max(0, Math.min(10, score)) / 10) * 110;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

function labelPoint(index) {
  const n = plotDomains.value.length || 1;
  const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
  const r = 158;
  return { x: 200 + Math.cos(angle) * r, y: 200 + Math.sin(angle) * r };
}

function zoneArc(startDeg, endDeg, radius) {
  const toRad = (d) => (d * Math.PI) / 180;
  const s = toRad(startDeg);
  const e = toRad(endDeg);
  const x1 = Math.cos(s) * radius;
  const y1 = Math.sin(s) * radius;
  const x2 = Math.cos(e) * radius;
  const y2 = Math.sin(e) * radius;
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
}

const regulationPoints = computed(() => {
  if (!plotDomains.value.length) return '';
  return plotDomains.value
    .map((d, i) => {
      const p = point(i, scoreOf(d.key));
      return `${p.x},${p.y}`;
    })
    .join(' ');
});

const regulationMarkers = computed(() =>
  plotDomains.value.map((d, i) => ({
    ...point(i, scoreOf(d.key)),
    color: d.color || '#3d7a5a',
    active: d.key === props.activeDomainId || (props.selectedPriorityDomainIds || []).includes(d.key)
  }))
);

const systemRows = computed(() => [
  { key: 'command', label: 'Command', avg: props.systemScores?.command, color: '#4A6FA5' },
  { key: 'regulation', label: 'Regulation', avg: props.systemScores?.regulation, color: '#6D597A' },
  { key: 'environment', label: 'Environment', avg: props.systemScores?.environment, color: '#2D6A4F' },
  { key: 'direction', label: 'Direction', avg: props.systemScores?.direction, color: '#BC6C25' }
]);

const ariaLabel = computed(
  () =>
    `Reward Regulation System with score ${props.rewardRegulationScore ?? 'unavailable'} across ${plotDomains.value.length} domains`
);
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap');

.rr-system {
  --ink: #e8eef6;
  --muted: #9aa8ba;
  --amber: #d4a574;
  background: linear-gradient(165deg, #141c28 0%, #0c1219 100%);
  border: 1px solid rgba(212, 165, 116, 0.22);
  border-radius: 18px;
  padding: 1rem 1rem 1.15rem;
  color: var(--ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
}
.rr-system--compact {
  padding: 0.75rem;
}
.rr-system__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}
.rr-system__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--amber);
  font-weight: 700;
}
.rr-system__title {
  margin: 0.2rem 0 0;
  font-family: Syne, system-ui, sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
}
.rr-system__score-n {
  font-family: Syne, system-ui, sans-serif;
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--amber);
}
.rr-system__score-l {
  color: var(--muted);
  font-size: 0.8rem;
}
.rr-system__viz {
  display: flex;
  justify-content: center;
}
.rr-system__svg {
  width: 100%;
  max-width: 360px;
  height: auto;
}
.rr-system--compact .rr-system__svg {
  max-width: 300px;
}
.rr-system__poly {
  transition: points 0.35s ease;
}
.rr-system__center-label {
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rr-system__center-value {
  font-family: Syne, system-ui, sans-serif;
  font-size: 16px;
  font-weight: 800;
}
.rr-system__label {
  font-size: 9px;
  font-weight: 600;
}
.rr-system__label--click,
.rr-system__dot--click {
  cursor: pointer;
}
.rr-system__systems {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem;
  margin-top: 0.75rem;
}
.rr-system__sys {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  font-size: 0.78rem;
  color: var(--muted);
}
.rr-system__sys span {
  border-left: 3px solid;
  padding-left: 0.4rem;
}
.rr-system__sys strong {
  color: var(--ink);
  font-family: Syne, system-ui, sans-serif;
}
.rr-system__level {
  margin: 0.75rem 0 0;
  text-align: center;
  font-size: 0.82rem;
  color: var(--amber);
  font-weight: 600;
}
</style>
