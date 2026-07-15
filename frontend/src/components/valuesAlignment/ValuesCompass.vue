<template>
  <div class="vc" :data-mode="mode" :class="{ interactive }">
    <div v-if="mode === 'bars'" class="vc-bars" role="list">
      <article
        v-for="row in barRows"
        :key="row.key"
        class="vc-bar-card"
        :class="{ active: row.key === activeValueId, completed: row.complete }"
        role="listitem"
        :tabindex="interactive ? 0 : -1"
        @click="interactive && $emit('value-select', row.key)"
        @keydown.enter.prevent="interactive && $emit('value-select', row.key)"
      >
        <header class="vc-bar-card__head">
          <span class="vc-dot" :style="{ background: row.color }" aria-hidden="true" />
          <h3>{{ row.label }}</h3>
          <span v-if="row.gap != null" class="vc-gap-pill">Gap: {{ row.gap }}</span>
          <span v-if="row.complete" class="vc-check" aria-hidden="true">✓</span>
        </header>
        <div class="vc-track-block">
          <div class="vc-track-label">
            <span>Importance</span>
            <strong>{{ row.importanceScore ?? '—' }}</strong>
          </div>
          <div class="vc-track" aria-hidden="true">
            <div
              class="vc-track__importance"
              :style="{
                width: pct(row.importanceScore),
                background: soften(row.color),
                borderColor: row.color
              }"
            />
            <span
              v-if="row.importanceScore != null"
              class="vc-marker"
              :style="{ left: pct(row.importanceScore), background: row.color }"
            />
          </div>
        </div>
        <div class="vc-track-block">
          <div class="vc-track-label">
            <span>Current Alignment</span>
            <strong>{{ row.alignmentScore ?? '—' }}</strong>
          </div>
          <div class="vc-track" aria-hidden="true">
            <div
              class="vc-track__alignment"
              :class="{ animated }"
              :style="{ width: pct(row.alignmentScore), background: row.color }"
            />
            <span
              v-if="row.importanceScore != null"
              class="vc-marker"
              :style="{ left: pct(row.importanceScore), background: row.color }"
              title="Importance target"
            />
          </div>
        </div>
        <p v-if="row.status" class="vc-status">{{ row.status }}</p>
        <p v-if="row.morePresentThanPrioritized" class="vc-status muted">
          More present than currently prioritized.
        </p>
        <div class="sr-only" role="status" aria-live="polite">
          {{ row.label }} importance {{ row.importanceScore ?? 'not set' }},
          alignment {{ row.alignmentScore ?? 'not set' }}
          <template v-if="row.gap != null">, alignment gap {{ row.gap }} — {{ row.status }}</template>
        </div>
      </article>
    </div>

    <div v-else-if="mode === 'quadrant'" class="vc-quad">
      <div class="vc-quad__plot" role="img" :aria-label="quadrantAria">
        <div class="vc-quad__grid">
          <span class="vc-quad__zone tl">Priority Opportunities</span>
          <span class="vc-quad__zone tr">Core Strengths</span>
          <span class="vc-quad__zone bl">Lower Priority</span>
          <span class="vc-quad__zone br">Stable Supports</span>
        </div>
        <button
          v-for="row in barRows.filter((r) => r.complete)"
          :key="row.key"
          type="button"
          class="vc-quad__dot"
          :class="{ active: row.key === activeValueId }"
          :style="quadStyle(row)"
          :title="`${row.label}: importance ${row.importanceScore}, alignment ${row.alignmentScore}`"
          @click="$emit('value-select', row.key)"
        >
          <span class="vc-quad__dot-core" :style="{ background: row.color }" />
          <span class="vc-quad__dot-label">{{ row.label }}</span>
        </button>
        <span class="vc-quad__axis-x">Current Alignment →</span>
        <span class="vc-quad__axis-y">↑ Importance</span>
      </div>
      <ul class="vc-quad__legend">
        <li v-for="row in barRows.filter((r) => r.complete)" :key="`leg-${row.key}`">
          <span class="vc-dot" :style="{ background: row.color }" />
          <strong>{{ row.label }}</strong>
          <span>Imp {{ row.importanceScore }} · Align {{ row.alignmentScore }} · Gap {{ row.gap }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { softenColor } from '../../utils/lifeBalanceColors.js';
import {
  calculateAlignmentGap,
  gapStatusLabel
} from '../../utils/valuesAlignment.js';

const props = defineProps({
  responses: { type: Array, default: () => [] },
  values: { type: Array, default: () => [] },
  activeValueId: { type: String, default: '' },
  mode: { type: String, default: 'bars' }, // bars | quadrant | comparison
  interactive: { type: Boolean, default: true },
  animated: { type: Boolean, default: true },
  orderedKeys: { type: Array, default: () => [] }
});

defineEmits(['value-select']);

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.valueKey] = r;
  return m;
});

const barRows = computed(() => {
  const keys =
    props.orderedKeys?.length > 0
      ? props.orderedKeys
      : (props.values || []).map((v) => v.key);
  return keys
    .map((key) => {
      const val = (props.values || []).find((v) => v.key === key);
      const resp = responseMap.value[key] || {};
      const gap = calculateAlignmentGap(resp.importanceScore, resp.alignmentScore);
      return {
        key,
        label: val?.label || key,
        color: val?.color || '#64748b',
        importanceScore: resp.importanceScore ?? null,
        alignmentScore: resp.alignmentScore ?? null,
        gap,
        status: gapStatusLabel(gap),
        complete: resp.importanceScore != null && resp.alignmentScore != null,
        morePresentThanPrioritized:
          resp.importanceScore != null &&
          resp.alignmentScore != null &&
          Number(resp.alignmentScore) > Number(resp.importanceScore)
      };
    })
    .filter(Boolean);
});

const quadrantAria = computed(() => {
  const parts = barRows.value
    .filter((r) => r.complete)
    .map((r) => `${r.label}: importance ${r.importanceScore}, alignment ${r.alignmentScore}`);
  return `Values compass quadrant. ${parts.join('. ')}`;
});

function pct(score) {
  if (score == null) return '0%';
  return `${(Number(score) / 10) * 100}%`;
}

function soften(color) {
  return softenColor(color, 0.55);
}

function quadStyle(row) {
  // X = alignment 1–10 → 8%–92%; Y = importance 1–10 → 92%–8% (top = high)
  const x = 8 + ((Number(row.alignmentScore) - 1) / 9) * 84;
  const y = 92 - ((Number(row.importanceScore) - 1) / 9) * 84;
  return { left: `${x}%`, top: `${y}%` };
}
</script>

<style scoped>
.vc { width: 100%; }
.vc-bars {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.vc-bar-card {
  background: #fff;
  border: 1px solid #e7e0d6;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  text-align: left;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.vc.interactive .vc-bar-card { cursor: pointer; }
.vc-bar-card:hover,
.vc-bar-card.active {
  border-color: #c4b5a0;
  box-shadow: 0 8px 24px rgba(28, 25, 23, 0.06);
}
.vc-bar-card.completed { border-color: #d6d3d1; }
.vc-bar-card__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}
.vc-bar-card__head h3 {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 700;
  color: #1c1917;
  flex: 1;
}
.vc-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.vc-gap-pill {
  font-size: 0.72rem;
  font-weight: 700;
  color: #57534e;
  background: #f5f0e8;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
}
.vc-check {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: #166534;
  color: #fff;
  font-size: 0.7rem;
  display: grid;
  place-items: center;
}
.vc-track-block { margin-bottom: 0.45rem; }
.vc-track-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  font-weight: 650;
  color: #78716c;
  margin-bottom: 0.2rem;
}
.vc-track {
  position: relative;
  height: 12px;
  background: #f5f5f4;
  border-radius: 999px;
  overflow: visible;
}
.vc-track__importance {
  height: 100%;
  border-radius: 999px;
  border: 1.5px solid;
  box-sizing: border-box;
  min-width: 0;
  transition: width 0.45s ease;
}
.vc-track__alignment {
  height: 100%;
  border-radius: 999px;
  min-width: 0;
}
.vc-track__alignment.animated {
  transition: width 0.55s cubic-bezier(0.22, 1, 0.36, 1);
}
.vc-marker {
  position: absolute;
  top: -3px;
  width: 2px;
  height: 18px;
  transform: translateX(-50%);
  border-radius: 1px;
  z-index: 2;
}
.vc-status {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
  font-weight: 650;
  color: #44403c;
}
.vc-status.muted { color: #78716c; font-weight: 500; }

.vc-quad__plot {
  position: relative;
  height: 320px;
  border: 1px solid #e7e0d6;
  border-radius: 16px;
  background:
    linear-gradient(to right, rgba(180, 83, 9, 0.06) 0%, transparent 50%),
    linear-gradient(to top, transparent 50%, rgba(29, 78, 216, 0.05) 100%),
    #fffaf5;
  overflow: hidden;
  margin-bottom: 1rem;
}
.vc-quad__grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}
.vc-quad__zone {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(68, 64, 60, 0.45);
  padding: 0.65rem;
}
.vc-quad__zone.tl { background: rgba(180, 83, 9, 0.07); }
.vc-quad__dot {
  position: absolute;
  transform: translate(-50%, -50%);
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  z-index: 3;
}
.vc-quad__dot-core {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}
.vc-quad__dot.active .vc-quad__dot-core {
  width: 18px;
  height: 18px;
}
.vc-quad__dot-label {
  font-size: 0.62rem;
  font-weight: 700;
  color: #44403c;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.85);
  padding: 0 0.25rem;
  border-radius: 4px;
}
.vc-quad__axis-x,
.vc-quad__axis-y {
  position: absolute;
  font-size: 0.68rem;
  color: #78716c;
  font-weight: 600;
}
.vc-quad__axis-x { bottom: 0.35rem; right: 0.75rem; }
.vc-quad__axis-y {
  top: 0.85rem;
  left: 0.35rem;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}
.vc-quad__legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.vc-quad__legend li {
  display: grid;
  grid-template-columns: 10px auto 1fr;
  gap: 0.45rem;
  align-items: center;
  font-size: 0.8rem;
  color: #57534e;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .vc-track__importance,
  .vc-track__alignment.animated {
    transition: none;
  }
}
</style>
