<template>
  <div
    class="rhw"
    :class="{ 'rhw--compact': compact, 'rhw--interactive': interactive }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="rhw__head">
      <div>
        <p class="rhw__eyebrow">Relationship Health Wheel</p>
        <h3 class="rhw__title">{{ title }}</h3>
      </div>
      <div v-if="indexScore != null" class="rhw__score">
        <span class="rhw__score-n">{{ indexScore }}</span>
        <span class="rhw__score-l">/ 100</span>
      </div>
    </header>

    <div v-if="showLegend && displayMode !== 'individual'" class="rhw__legend">
      <span class="rhw__leg rhw__leg--a">
        <i aria-hidden="true" /> {{ partnerALabel }}
      </span>
      <span class="rhw__leg rhw__leg--b">
        <i aria-hidden="true" /> {{ partnerBLabel }}
      </span>
    </div>

    <div class="rhw__viz">
      <svg viewBox="0 0 320 320" class="rhw__svg" aria-hidden="true">
        <g transform="translate(160,160)">
          <circle
            v-for="ring in [2, 4, 6, 8, 10]"
            :key="ring"
            :r="(ring / 10) * 120"
            fill="none"
            stroke="#e2e8f0"
            stroke-width="1"
          />
          <line
            v-for="(d, i) in plotDomains"
            :key="`axis-${d.key}`"
            :x1="0"
            :y1="0"
            :x2="point(i, 10).x"
            :y2="point(i, 10).y"
            stroke="#e2e8f0"
            stroke-width="1"
          />

          <polygon
            v-if="partnerAPoints"
            :points="partnerAPoints"
            fill="rgba(14,165,233,0.15)"
            stroke="#0ea5e9"
            stroke-width="2.5"
            stroke-linejoin="round"
          />
          <circle
            v-for="(p, i) in partnerAMarkers"
            :key="`a-${i}`"
            :cx="p.x"
            :cy="p.y"
            r="4.5"
            fill="#0ea5e9"
            stroke="#fff"
            stroke-width="1.5"
          />

          <polygon
            v-if="partnerBPoints && displayMode !== 'individual'"
            :points="partnerBPoints"
            fill="rgba(168,85,247,0.12)"
            stroke="#a855f7"
            stroke-width="2.5"
            stroke-dasharray="7 5"
            stroke-linejoin="round"
          />
          <rect
            v-for="(p, i) in partnerBMarkers"
            :key="`b-${i}`"
            v-show="displayMode !== 'individual'"
            :x="p.x - 4"
            :y="p.y - 4"
            width="8"
            height="8"
            fill="#a855f7"
            stroke="#fff"
            stroke-width="1.5"
          />
        </g>
      </svg>

      <button
        v-for="(d, i) in plotDomains"
        :key="d.key"
        type="button"
        class="rhw__label"
        :class="{ active: d.key === activeDomainId }"
        :style="labelStyle(i)"
        :disabled="!interactive"
        @click="interactive && emit('domain-select', d.key)"
      >
        {{ d.shortLabel }}
        <span v-if="d.key === activeDomainId && activeScore != null">{{ activeScore }}</span>
      </button>
    </div>

    <ul class="rhw__list">
      <li v-for="row in listRows" :key="row.key">
        <strong>{{ row.label }}</strong>
        <span v-if="displayMode === 'individual'">
          {{ row.a == null ? 'Not Rated' : `${row.a} out of 10` }}
        </span>
        <span v-else>
          {{ partnerALabel }} {{ row.a ?? '—' }} · {{ partnerBLabel }} {{ row.b ?? '—' }}
          <template v-if="row.a != null && row.b != null">
            · Difference {{ Math.abs(row.a - row.b) }}
          </template>
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  partnerAResponses: { type: Array, default: () => [] },
  partnerBResponses: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: null },
  displayMode: { type: String, default: 'individual' },
  indexScore: { type: [Number, null], default: null },
  interactive: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  showLegend: { type: Boolean, default: true },
  partnerALabel: { type: String, default: 'Partner A' },
  partnerBLabel: { type: String, default: 'Partner B' },
  title: { type: String, default: 'Relationship Health Wheel' }
});

const emit = defineEmits(['domain-select']);

const aMap = computed(() => {
  const m = {};
  for (const r of props.partnerAResponses || []) m[r.domainKey] = r;
  return m;
});
const bMap = computed(() => {
  const m = {};
  for (const r of props.partnerBResponses || []) m[r.domainKey] = r;
  return m;
});

const plotDomains = computed(() =>
  (props.domains || []).filter((d) => {
    const a = aMap.value[d.key];
    const b = bMap.value[d.key];
    if (a?.isNotApplicable || b?.isNotApplicable) return false;
    return true;
  })
);

function scoreA(key) {
  const r = aMap.value[key];
  if (r?.isNotApplicable) return null;
  return r?.currentExperienceScore ?? null;
}
function scoreB(key) {
  const r = bMap.value[key];
  if (r?.isNotApplicable) return null;
  return r?.currentExperienceScore ?? null;
}

function point(i, score) {
  const n = plotDomains.value.length || 1;
  const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
  const r = ((Number(score) || 0) / 10) * 120;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

function polygonPoints(getter) {
  if (!plotDomains.value.length) return '';
  return plotDomains.value
    .map((d, i) => {
      const s = getter(d.key);
      const p = point(i, s == null ? 0 : s);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

const partnerAPoints = computed(() => polygonPoints(scoreA));
const partnerBPoints = computed(() => polygonPoints(scoreB));

const partnerAMarkers = computed(() =>
  plotDomains.value
    .map((d, i) => {
      const s = scoreA(d.key);
      if (s == null) return null;
      return point(i, s);
    })
    .filter(Boolean)
);

const partnerBMarkers = computed(() =>
  plotDomains.value
    .map((d, i) => {
      const s = scoreB(d.key);
      if (s == null) return null;
      return point(i, s);
    })
    .filter(Boolean)
);

const activeScore = computed(() => {
  if (!props.activeDomainId) return null;
  if (props.displayMode === 'individual') return scoreA(props.activeDomainId);
  return null;
});

const listRows = computed(() =>
  plotDomains.value.map((d) => ({
    key: d.key,
    label: d.label,
    a: scoreA(d.key),
    b: scoreB(d.key)
  }))
);

const ariaLabel = computed(() => {
  const parts = listRows.value.map((r) => {
    if (props.displayMode === 'individual') {
      return r.a == null ? `${r.label}: not rated` : `${r.label}: ${r.a} out of 10`;
    }
    return `${r.label}: ${props.partnerALabel} ${r.a ?? 'not rated'}, ${props.partnerBLabel} ${r.b ?? 'not rated'}`;
  });
  return `Relationship Health Wheel. ${parts.join('. ')}.`;
});

function labelStyle(i) {
  const n = plotDomains.value.length || 1;
  const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / n;
  const r = 46;
  const x = 50 + Math.cos(angle) * r;
  const y = 50 + Math.sin(angle) * r;
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: 'translate(-50%, -50%)'
  };
}
</script>

<style scoped>
.rhw {
  background: linear-gradient(165deg, #fff 0%, #f8fafc 55%, #eef2ff 100%);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 1.1rem 1.15rem 1.2rem;
  color: #0f172a;
  font-family: 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif;
}

.rhw__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.65rem;
}

.rhw__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 700;
}

.rhw__title {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
  font-weight: 800;
}

.rhw__score-n {
  font-size: 1.85rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.rhw__score-l {
  font-size: 0.8rem;
  color: #64748b;
}

.rhw__legend {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.5rem;
  font-size: 0.78rem;
  font-weight: 700;
}

.rhw__leg {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.rhw__leg i {
  width: 18px;
  height: 3px;
  display: inline-block;
  border-radius: 2px;
}

.rhw__leg--a i {
  background: #0ea5e9;
}
.rhw__leg--b i {
  background: repeating-linear-gradient(90deg, #a855f7 0 6px, transparent 6px 10px);
  height: 3px;
}

.rhw__viz {
  position: relative;
  width: 100%;
  max-width: 360px;
  margin: 0 auto;
  aspect-ratio: 1;
}

.rhw__svg {
  width: 100%;
  height: 100%;
}

.rhw__label {
  position: absolute;
  appearance: none;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  padding: 0.2rem 0.45rem;
  font-size: 0.65rem;
  font-weight: 700;
  color: #334155;
  cursor: default;
  white-space: nowrap;
}

.rhw--interactive .rhw__label {
  cursor: pointer;
}

.rhw__label.active {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 2px #bae6fd;
  color: #0f172a;
}

.rhw__label:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}

.rhw__list {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

@media (prefers-reduced-motion: reduce) {
  .rhw__label {
    transition: none;
  }
}
</style>
