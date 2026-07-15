<template>
  <div class="vgm" role="list">
    <header class="vgm__head">
      <div>
        <p class="vgm__eyebrow">Values Gap Map</p>
        <h3 class="vgm__title">Current Life ↔ Ideal Life</h3>
      </div>
      <label class="vgm__sort">
        Sort
        <select :value="sortMode" @change="emit('update:sortMode', $event.target.value)">
          <option value="default">Default order</option>
          <option value="largest-positive">Largest positive gap</option>
          <option value="largest-absolute">Largest absolute gap</option>
          <option value="closest">Closest alignment</option>
          <option value="priorities">Selected priorities</option>
          <option value="highest-ideal">Highest Ideal Life</option>
          <option value="lowest-current">Lowest Current Life</option>
        </select>
      </label>
    </header>

    <article
      v-for="row in sortedRows"
      :key="row.valueKey"
      class="vgm__row"
      :class="{
        active: row.valueKey === activeCategoryId,
        priority: selectedPriorityCategoryIds.includes(row.valueKey)
      }"
      role="listitem"
      :tabindex="interactive ? 0 : -1"
      @click="interactive && emit('category-select', row.valueKey)"
      @keydown.enter.prevent="interactive && emit('category-select', row.valueKey)"
    >
      <header class="vgm__row-head">
        <span class="vgm__dot" :style="{ background: row.color }" aria-hidden="true" />
        <h4>{{ row.label }}</h4>
        <span v-if="selectedPriorityCategoryIds.includes(row.valueKey)" class="vgm__pill">Priority</span>
        <span v-if="row.status" class="vgm__status">{{ row.status }}</span>
      </header>

      <div class="vgm__nums">
        <span>Current Life: <strong>{{ row.currentLifeScore ?? '—' }}</strong></span>
        <span>Ideal Life: <strong>{{ row.idealLifeScore ?? '—' }}</strong></span>
        <span>
          Gap:
          <strong>{{ formatGap(row.signedGap) }}</strong>
          <em v-if="row.absoluteGap != null">(abs {{ row.absoluteGap }})</em>
        </span>
        <span v-if="row.alignmentScore != null">
          Alignment: <strong>{{ row.alignmentScore }}</strong>
        </span>
      </div>

      <div
        class="vgm__track"
        aria-hidden="true"
        v-if="row.currentLifeScore != null && row.idealLifeScore != null"
      >
        <span class="vgm__track-label left">Current</span>
        <div class="vgm__rail">
          <span
            class="vgm__marker vgm__marker--current"
            :style="{ left: pct(row.currentLifeScore) }"
          />
          <span
            class="vgm__span"
            :style="spanStyle(row.currentLifeScore, row.idealLifeScore)"
          />
          <span
            class="vgm__marker vgm__marker--ideal"
            :style="{ left: pct(row.idealLifeScore) }"
          />
        </div>
        <span class="vgm__track-label right">Ideal</span>
      </div>

      <p v-if="row.trend" class="vgm__trend">{{ row.trend }}</p>
      <p v-if="row.planTitle" class="vgm__plan">Active commitment: {{ row.planTitle }}</p>

      <div class="sr-only">
        {{ row.label }}. Current Life {{ row.currentLifeScore ?? 'not rated' }}. Ideal Life
        {{ row.idealLifeScore ?? 'not rated' }}.
        <template v-if="row.signedGap != null">
          Signed gap {{ formatGap(row.signedGap) }}. Status {{ row.status }}.
        </template>
      </div>
    </article>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { enrichResponseMeta } from '../../utils/valuesAlignment.js';

const props = defineProps({
  categories: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  selectedPriorityCategoryIds: { type: Array, default: () => [] },
  previousResponses: { type: Array, default: () => [] },
  activeCategoryId: { type: String, default: null },
  sortMode: { type: String, default: 'default' },
  interactive: { type: Boolean, default: false },
  plansByKey: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['category-select', 'update:sortMode']);

const previousMap = computed(() => {
  const m = {};
  for (const r of props.previousResponses || []) m[r.valueKey] = r;
  return m;
});

const rows = computed(() => {
  const responseMap = {};
  for (const r of props.responses || []) responseMap[r.valueKey] = r;

  return (props.categories || []).map((cat) => {
    const r = responseMap[cat.key] || { valueKey: cat.key };
    const meta = enrichResponseMeta(r, cat);
    const prev = previousMap.value[cat.key];
    let trend = null;
    if (prev && meta.currentLifeScore != null && prev.currentLifeScore != null) {
      const prevGap = (prev.idealLifeScore ?? prev.importanceScore) - prev.currentLifeScore;
      const nowGap = meta.signedGap;
      if (nowGap != null && Math.abs(nowGap) < Math.abs(prevGap)) trend = 'Becoming More Aligned';
      else if (nowGap != null && Math.abs(nowGap) > Math.abs(prevGap)) trend = 'Becoming Less Aligned';
      else trend = 'Stable';
    }
    return {
      ...meta,
      trend,
      planTitle: props.plansByKey?.[cat.key]?.title || null
    };
  });
});

const sortedRows = computed(() => {
  const list = [...rows.value];
  const mode = props.sortMode;
  if (mode === 'largest-positive') {
    return list.sort((a, b) => (b.signedGap || -999) - (a.signedGap || -999));
  }
  if (mode === 'largest-absolute') {
    return list.sort((a, b) => (b.absoluteGap || 0) - (a.absoluteGap || 0));
  }
  if (mode === 'closest') {
    return list.sort((a, b) => (a.absoluteGap ?? 99) - (b.absoluteGap ?? 99));
  }
  if (mode === 'priorities') {
    return list.sort((a, b) => {
      const ap = props.selectedPriorityCategoryIds.includes(a.valueKey) ? 0 : 1;
      const bp = props.selectedPriorityCategoryIds.includes(b.valueKey) ? 0 : 1;
      return ap - bp;
    });
  }
  if (mode === 'highest-ideal') {
    return list.sort((a, b) => (b.idealLifeScore || 0) - (a.idealLifeScore || 0));
  }
  if (mode === 'lowest-current') {
    return list.sort((a, b) => (a.currentLifeScore ?? 99) - (b.currentLifeScore ?? 99));
  }
  return list;
});

function pct(n) {
  return `${(Number(n) / 10) * 100}%`;
}

function spanStyle(a, b) {
  const lo = Math.min(Number(a), Number(b));
  const hi = Math.max(Number(a), Number(b));
  return {
    left: pct(lo),
    width: `${((hi - lo) / 10) * 100}%`
  };
}

function formatGap(g) {
  if (g == null) return '—';
  return g > 0 ? `+${g}` : String(g);
}
</script>

<style scoped>
.vgm {
  display: grid;
  gap: 0.75rem;
}

.vgm__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: end;
}

.vgm__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #78716c;
  font-weight: 700;
}

.vgm__title {
  margin: 0.15rem 0 0;
  font-family: Fraunces, Georgia, serif;
  font-size: 1.15rem;
}

.vgm__sort {
  display: grid;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #57534e;
}

.vgm__sort select {
  border: 1px solid #e7e0d6;
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  background: #fff;
}

.vgm__row {
  background: #fffaf5;
  border: 1px solid #e7e0d6;
  border-radius: 14px;
  padding: 0.85rem 1rem;
}

.vgm__row.active {
  border-color: #b45309;
  box-shadow: 0 0 0 2px rgba(180, 83, 9, 0.12);
}

.vgm__row.priority {
  border-left: 3px solid #1d4ed8;
}

.vgm__row-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.45rem;
}

.vgm__row-head h4 {
  margin: 0;
  font-size: 1rem;
}

.vgm__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.vgm__pill {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 999px;
  padding: 0.15rem 0.45rem;
}

.vgm__status {
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 600;
  color: #57534e;
}

.vgm__nums {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.1rem;
  font-size: 0.82rem;
  color: #57534e;
  margin-bottom: 0.55rem;
}

.vgm__nums strong {
  color: #1c1917;
}

.vgm__nums em {
  font-style: normal;
  color: #a8a29e;
  margin-left: 0.25rem;
}

.vgm__track {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.45rem;
  align-items: center;
}

.vgm__track-label {
  font-size: 0.65rem;
  font-weight: 700;
  color: #a8a29e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.vgm__rail {
  position: relative;
  height: 10px;
  background: #f5f5f4;
  border-radius: 999px;
  border: 1px solid #e7e0d6;
}

.vgm__span {
  position: absolute;
  top: 2px;
  bottom: 2px;
  background: rgba(120, 113, 108, 0.22);
  border-radius: 999px;
}

.vgm__marker {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  transform: translate(-50%, -50%);
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #d6d3d1;
}

.vgm__marker--current {
  border-radius: 50%;
  background: #b45309;
}

.vgm__marker--ideal {
  background: #1d4ed8;
  border-radius: 2px;
}

.vgm__trend,
.vgm__plan {
  margin: 0.45rem 0 0;
  font-size: 0.78rem;
  color: #78716c;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
