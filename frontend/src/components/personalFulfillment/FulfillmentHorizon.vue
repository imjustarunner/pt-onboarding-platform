<template>
  <div
    class="pfh"
    :class="{ 'pfh--compact': compact, 'pfh--interactive': interactive }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="pfh__head">
      <div>
        <p class="pfh__eyebrow">Fulfillment Horizon</p>
        <h3 class="pfh__title">{{ title }}</h3>
      </div>
      <div v-if="personalFulfillmentIndex != null" class="pfh__score">
        <span class="pfh__score-n">{{ personalFulfillmentIndex }}</span>
        <span class="pfh__score-l">/ 100</span>
      </div>
    </header>

    <div class="pfh__legend">
      <span>Height = Current Fulfillment</span>
      <span v-if="showImportance">Outline = Personal Importance</span>
      <span v-if="showMomentum">Marker = Momentum</span>
    </div>

    <div class="pfh__viz">
      <div class="pfh__sky" aria-hidden="true" />
      <div class="pfh__ground" aria-hidden="true" />
      <div class="pfh__beacons">
        <button
          v-for="b in beacons"
          :key="b.key"
          type="button"
          class="pfh__beacon"
          :class="{
            active: b.key === activeDomainId,
            complete: b.complete,
            priority: selectedPriorityDomainIds.includes(b.key),
            opportunity: b.isOpportunity
          }"
          :disabled="!interactive"
          :style="{ '--beacon-color': b.color }"
          @click="interactive && emit('domain-select', b.key)"
        >
          <span
            class="pfh__column"
            :style="{
              height: `${b.heightPct}%`,
              boxShadow: showImportance ? `0 0 0 ${b.importanceWidth}px rgba(15,23,42,0.18)` : undefined
            }"
          >
            <span v-if="b.fulfillment != null" class="pfh__fill-label">{{ b.fulfillment }}</span>
          </span>
          <span v-if="showMomentum && b.momentumLabel" class="pfh__momentum" :title="b.momentumLabel">
            {{ momentumGlyph(b.momentumLabel) }}
          </span>
          <span class="pfh__name">{{ b.shortLabel }}</span>
          <span v-if="b.key === activeDomainId && b.fulfillment != null" class="pfh__active-detail">
            {{ b.fulfillment }}{{ b.importance != null ? ` · Imp ${b.importance}` : '' }}
          </span>
        </button>
      </div>
      <div class="pfh__center-card">
        <span>Personal Fulfillment Index</span>
        <strong>{{ personalFulfillmentIndex ?? '—' }}</strong>
      </div>
    </div>

    <p v-if="metaLine" class="pfh__meta">{{ metaLine }}</p>

    <ul class="pfh__list">
      <li v-for="b in beacons" :key="`li-${b.key}`">
        <strong>{{ b.label }}</strong>
        <span v-if="b.notRelevant">Not relevant in this season</span>
        <span v-else-if="b.preferNot">Prefer not to answer</span>
        <span v-else-if="!b.complete">Not Reflected On</span>
        <span v-else>
          Fulfillment {{ b.fulfillment }}
          <template v-if="b.importance != null"> · Importance {{ b.importance }}</template>
          <template v-if="b.momentumLabel"> · {{ b.momentumLabel }}</template>
          · {{ b.status }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { domainStatusLabel, momentumLabel } from '../../utils/personalFulfillment.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  personalFulfillmentIndex: { type: [Number, null], default: null },
  weightedFulfillmentIndex: { type: [Number, null], default: null },
  systemScores: { type: Object, default: () => ({}) },
  activeDomainId: { type: String, default: null },
  previousAssessment: { type: Object, default: null },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  displayMode: { type: String, default: 'fulfillment-and-importance' },
  interactive: { type: Boolean, default: false },
  animated: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  title: { type: String, default: 'What feels meaningful right now' },
  strengthDomainCount: { type: Number, default: null },
  highImportanceOpportunityCount: { type: Number, default: null },
  assessmentPeriod: { type: String, default: null }
});

const emit = defineEmits(['domain-select']);

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const showImportance = computed(() =>
  ['importance', 'fulfillment-and-importance', 'opportunities', 'priorities'].includes(
    props.displayMode
  )
);
const showMomentum = computed(() =>
  ['fulfillment-and-importance', 'opportunities', 'historical'].includes(props.displayMode)
);

const beacons = computed(() =>
  (props.domains || []).map((d) => {
    const r = responseMap.value[d.key];
    const fulfillment = r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant'
      ? null
      : r?.currentFulfillmentScore ?? null;
    const importance = r?.personalImportanceScore ?? null;
    const momentum = r?.growthMomentumScore ?? null;
    const complete =
      fulfillment != null || !!r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant';
    const heightPct =
      props.displayMode === 'importance'
        ? ((importance || 0) / 10) * 100
        : ((fulfillment || 0) / 10) * 100;
    return {
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel || d.label,
      color: d.color || '#0f766e',
      fulfillment,
      importance,
      momentum,
      momentumLabel: momentumLabel(momentum),
      status: domainStatusLabel(fulfillment),
      complete,
      preferNot: !!r?.preferNotToAnswer,
      notRelevant: r?.seasonStatus === 'not-relevant',
      heightPct: Math.max(complete && fulfillment == null ? 8 : heightPct, fulfillment == null ? 6 : 12),
      importanceWidth: importance != null ? 1 + importance * 0.35 : 1,
      isOpportunity: (importance ?? 0) >= 8 && (fulfillment ?? 99) <= 5
    };
  })
);

const metaLine = computed(() => {
  const parts = [];
  if (props.assessmentPeriod) parts.push(props.assessmentPeriod);
  if (props.strengthDomainCount != null) parts.push(`${props.strengthDomainCount} strengths`);
  if (props.highImportanceOpportunityCount != null) {
    parts.push(`${props.highImportanceOpportunityCount} high-importance opportunities`);
  }
  if (props.selectedPriorityDomainIds?.length) {
    parts.push(`${props.selectedPriorityDomainIds.length} priorities`);
  }
  if (props.weightedFulfillmentIndex != null) {
    parts.push(`Weighted ${props.weightedFulfillmentIndex}`);
  }
  return parts.join(' · ');
});

const ariaLabel = computed(() => {
  const parts = beacons.value.map((b) => {
    if (b.notRelevant) return `${b.label}: not relevant`;
    if (b.preferNot) return `${b.label}: prefer not to answer`;
    if (!b.complete) return `${b.label}: not reflected on`;
    return `${b.label}: fulfillment ${b.fulfillment}${
      b.importance != null ? `, importance ${b.importance}` : ''
    }, ${b.status}`;
  });
  return `Fulfillment Horizon. Index ${props.personalFulfillmentIndex ?? 'not yet calculated'}. ${parts.join('. ')}.`;
});

function momentumGlyph(label) {
  if (label === 'Improving') return '↑';
  if (label === 'Declining') return '↓';
  if (label === 'Variable') return '↕';
  if (label === 'Stable') return '→';
  return '·';
}
</script>

<style scoped>
.pfh {
  --pfh-ink: #1c1917;
  --pfh-muted: #78716c;
  --pfh-line: #e7e5e4;
  background: linear-gradient(180deg, #fff7ed 0%, #fafaf9 42%, #f5f5f4 100%);
  border: 1px solid var(--pfh-line);
  border-radius: 18px;
  padding: 1.1rem 1.15rem 1.2rem;
  color: var(--pfh-ink);
  font-family: 'Segoe UI', 'Trebuchet MS', system-ui, sans-serif;
}

.pfh__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.45rem;
}

.pfh__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #a16207;
  font-weight: 700;
}

.pfh__title {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
  font-weight: 800;
}

.pfh__score-n {
  font-size: 1.85rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

.pfh__score-l {
  font-size: 0.8rem;
  color: var(--pfh-muted);
}

.pfh__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.72rem;
  color: var(--pfh-muted);
  font-weight: 600;
  margin-bottom: 0.65rem;
}

.pfh__viz {
  position: relative;
  min-height: 220px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #f5e6d3;
  background: linear-gradient(180deg, #fffbeb 0%, #ffedd5 55%, #d6d3d1 100%);
  padding: 1rem 0.65rem 2.75rem;
}

.pfh__sky {
  position: absolute;
  inset: 0 0 35% 0;
  background: radial-gradient(ellipse at 70% 20%, rgba(251, 191, 36, 0.35), transparent 55%);
  pointer-events: none;
}

.pfh__ground {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 28%;
  background: linear-gradient(180deg, transparent, rgba(120, 113, 108, 0.18));
  pointer-events: none;
}

.pfh__beacons {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 0.25rem;
  align-items: end;
  height: 170px;
}

.pfh__beacon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.2rem;
  border: none;
  background: transparent;
  padding: 0;
  cursor: default;
  min-width: 0;
  height: 100%;
}

.pfh--interactive .pfh__beacon {
  cursor: pointer;
}

.pfh__column {
  width: 56%;
  min-width: 10px;
  max-width: 28px;
  border-radius: 8px 8px 3px 3px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--beacon-color) 85%, white),
    var(--beacon-color)
  );
  border: 1px solid color-mix(in srgb, var(--beacon-color) 70%, #1c1917);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 0.2rem;
  transition: height 0.25s ease;
  opacity: 0.55;
}

.pfh__beacon.complete .pfh__column {
  opacity: 1;
}

.pfh__beacon.active .pfh__column {
  opacity: 1;
  outline: 2px solid rgba(15, 23, 42, 0.25);
  outline-offset: 2px;
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--beacon-color) 45%, transparent));
}

.pfh__beacon.priority .pfh__name {
  color: #1d4ed8;
  font-weight: 800;
}

.pfh__fill-label {
  font-size: 0.62rem;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
}

.pfh__momentum {
  font-size: 0.7rem;
  color: #57534e;
  font-weight: 700;
  line-height: 1;
}

.pfh__name {
  font-size: 0.58rem;
  font-weight: 700;
  color: #57534e;
  text-align: center;
  line-height: 1.15;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pfh__active-detail {
  font-size: 0.58rem;
  font-weight: 800;
  color: #0f766e;
  font-variant-numeric: tabular-nums;
}

.pfh__center-card {
  position: absolute;
  left: 50%;
  bottom: 0.55rem;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e7e5e4;
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.7rem;
  font-weight: 700;
  color: #78716c;
  z-index: 2;
}

.pfh__center-card strong {
  color: #1c1917;
  font-size: 0.95rem;
}

.pfh__meta {
  margin: 0.65rem 0 0;
  text-align: center;
  font-size: 0.75rem;
  color: var(--pfh-muted);
}

.pfh__list {
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.78rem;
  color: #57534e;
  display: grid;
  gap: 0.25rem;
}

.pfh__list strong {
  color: #1c1917;
  margin-right: 0.35rem;
}

@media (max-width: 700px) {
  .pfh__beacons {
    height: 140px;
  }
  .pfh__name {
    font-size: 0.52rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pfh__column {
    transition: none;
  }
}
</style>
