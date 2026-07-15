<template>
  <div
    class="scm"
    :class="{ 'scm--list': displayMode === 'list', 'scm--interactive': interactive }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="scm__head">
      <div>
        <p class="scm__eyebrow">Shared Course Map</p>
        <h3 class="scm__title">{{ title }}</h3>
      </div>
      <div v-if="marriageAlignmentIndex != null" class="scm__indexes">
        <div>
          <span>Alignment</span>
          <strong>{{ marriageAlignmentIndex }}</strong>
        </div>
        <div v-if="sharedDirectionIndex != null">
          <span>Direction</span>
          <strong>{{ sharedDirectionIndex }}</strong>
        </div>
      </div>
    </header>

    <div class="scm__modes" role="toolbar" aria-label="Course map display mode">
      <button
        v-for="m in modeButtons"
        :key="m.id"
        type="button"
        class="scm__mode"
        :class="{ on: displayMode === m.id }"
        @click="emit('update:displayMode', m.id)"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="scm__legend" aria-hidden="true">
      <span><i class="dot a" /> {{ partnerALabel }} · solid</span>
      <span><i class="dot b" /> {{ partnerBLabel }} · dashed</span>
    </div>

    <div class="scm__table" aria-hidden="true">
      <div class="scm__row scm__row--head">
        <span>Domain</span>
        <span v-if="showCurrent">Current Course</span>
        <span v-if="showDesired">Desired Direction</span>
      </div>
      <button
        v-for="row in rows"
        :key="row.key"
        type="button"
        class="scm__row"
        :class="{ active: row.key === activeDomainId, priority: selectedPriorityDomainIds.includes(row.key) }"
        :disabled="!interactive"
        @click="interactive && emit('domain-select', row.key)"
      >
        <span class="scm__domain">
          <strong>{{ row.shortLabel }}</strong>
          <em v-if="row.statusLabel">{{ row.statusLabel }}</em>
        </span>
        <span v-if="showCurrent" class="scm__track">
          <span class="scm__bar">
            <span class="scm__marker a" :style="{ left: pct(row.aCurrent) }">●</span>
            <span class="scm__marker b" :style="{ left: pct(row.bCurrent) }"
              >■</span
            >
          </span>
          <span class="scm__nums">{{ row.aCurrent ?? '—' }} / {{ row.bCurrent ?? '—' }}</span>
        </span>
        <span v-if="showDesired" class="scm__track">
          <span class="scm__bar desired">
            <span class="scm__marker a" :style="{ left: pct(row.aDesired) }">◇</span>
            <span class="scm__marker b" :style="{ left: pct(row.bDesired) }"
              >◆</span
            >
          </span>
          <span class="scm__nums">{{ row.aDesired ?? '—' }} / {{ row.bDesired ?? '—' }}</span>
        </span>
      </button>
    </div>

    <ul class="scm__list">
      <li v-for="row in rows" :key="`li-${row.key}`">
        <strong>{{ row.label }}</strong>
        Current: {{ partnerALabel }} {{ row.aCurrent ?? 'waiting' }},
        {{ partnerBLabel }} {{ row.bCurrent ?? 'waiting' }}. Desired:
        {{ partnerALabel }} {{ row.aDesired ?? 'waiting' }},
        {{ partnerBLabel }} {{ row.bDesired ?? 'waiting' }}.
        <template v-if="row.statusLabel"> Status: {{ row.statusLabel }}.</template>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  comparisons: { type: Array, default: () => [] },
  individualResponses: { type: Array, default: () => [] },
  individualOnly: { type: Boolean, default: false },
  marriageAlignmentIndex: { type: [Number, null], default: null },
  sharedDirectionIndex: { type: [Number, null], default: null },
  activeDomainId: { type: String, default: null },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  displayMode: { type: String, default: 'both' },
  interactive: { type: Boolean, default: false },
  partnerALabel: { type: String, default: 'Partner A' },
  partnerBLabel: { type: String, default: 'Partner B' },
  title: { type: String, default: 'Current course and desired direction' }
});

const emit = defineEmits(['domain-select', 'update:displayMode']);

const modeButtons = [
  { id: 'current-course', label: 'Current' },
  { id: 'desired-direction', label: 'Desired' },
  { id: 'both', label: 'Both' },
  { id: 'current-perception-gaps', label: 'Perception gaps' },
  { id: 'desired-priority-gaps', label: 'Priority gaps' },
  { id: 'shared-priorities', label: 'Priorities' },
  { id: 'list', label: 'List' }
];

const showCurrent = computed(() =>
  ['current-course', 'both', 'current-perception-gaps', 'shared-priorities'].includes(
    props.displayMode
  )
);
const showDesired = computed(() =>
  ['desired-direction', 'both', 'desired-priority-gaps', 'shared-priorities'].includes(
    props.displayMode
  )
);

const comparisonMap = computed(() => {
  const m = {};
  for (const c of props.comparisons || []) m[c.domainKey] = c;
  return m;
});

const individualMap = computed(() => {
  const m = {};
  for (const r of props.individualResponses || []) m[r.domainKey] = r;
  return m;
});

const rows = computed(() =>
  (props.domains || []).map((d) => {
    if (props.individualOnly) {
      const r = individualMap.value[d.key];
      return {
        key: d.key,
        label: d.label,
        shortLabel: d.shortLabel || d.label,
        aCurrent: r?.currentAlignmentScore ?? null,
        bCurrent: null,
        aDesired: r?.desiredEmphasisScore ?? null,
        bDesired: null,
        statusLabel: r?.currentAlignmentScore != null ? 'Your reflection' : 'Waiting for Response'
      };
    }
    const c = comparisonMap.value[d.key];
    let statusLabel = c?.sharedStatus?.replace(/-/g, ' ') || null;
    if (props.displayMode === 'current-perception-gaps') {
      statusLabel = c?.currentGapStatusLabel || statusLabel;
    }
    if (props.displayMode === 'desired-priority-gaps') {
      statusLabel = c?.desiredGapStatusLabel || statusLabel;
    }
    return {
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel || d.label,
      aCurrent: c?.partnerACurrent ?? null,
      bCurrent: c?.partnerBCurrent ?? null,
      aDesired: c?.partnerADesired ?? null,
      bDesired: c?.partnerBDesired ?? null,
      statusLabel: c ? statusLabel : 'Waiting for Response'
    };
  })
);

function pct(n) {
  if (n == null) return '0%';
  return `${((Number(n) - 1) / 9) * 100}%`;
}

const ariaLabel = computed(() => {
  return `Shared Course Map. ${rows.value
    .map(
      (r) =>
        `${r.label}: current ${r.aCurrent ?? 'n/a'} and ${r.bCurrent ?? 'n/a'}, desired ${r.aDesired ?? 'n/a'} and ${r.bDesired ?? 'n/a'}`
    )
    .join('. ')}`;
});
</script>

<style scoped>
.scm {
  --ink: #1c1917;
  --muted: #78716c;
  --line: #e7e5e4;
  background: linear-gradient(165deg, #faf8f5 0%, #f5f5f4 50%, #f0ebe6 100%);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 1.1rem 1.15rem 1.2rem;
  position: relative;
}
.scm__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.65rem;
}
.scm__eyebrow {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #9a3412;
  font-weight: 700;
}
.scm__title {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
}
.scm__indexes {
  display: flex;
  gap: 0.45rem;
}
.scm__indexes > div {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.35rem 0.55rem;
  text-align: center;
}
.scm__indexes span {
  display: block;
  font-size: 0.58rem;
  color: var(--muted);
  text-transform: uppercase;
}
.scm__indexes strong {
  font-size: 1.05rem;
}
.scm__modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.55rem;
}
.scm__mode {
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.7rem;
  color: var(--muted);
  cursor: pointer;
}
.scm__mode.on {
  background: #1c1917;
  border-color: #1c1917;
  color: #fff;
}
.scm__legend {
  display: flex;
  gap: 1rem;
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 0.65rem;
}
.scm__legend .dot {
  display: inline-block;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  margin-right: 0.25rem;
}
.scm__legend .dot.a {
  background: #1e3a5f;
}
.scm__legend .dot.b {
  background: #9a3412;
  border-radius: 2px;
}
.scm__table {
  display: grid;
  gap: 0.35rem;
}
.scm__row {
  display: grid;
  grid-template-columns: 7.5rem 1fr 1fr;
  gap: 0.55rem;
  align-items: center;
  appearance: none;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.65);
  border-radius: 12px;
  padding: 0.45rem 0.55rem;
  text-align: left;
  cursor: pointer;
  width: 100%;
  font: inherit;
  color: inherit;
}
.scm__row--head {
  background: transparent;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  font-weight: 650;
  cursor: default;
}
.scm__row.active,
.scm__row.priority {
  border-color: #d6d3d1;
  box-shadow: 0 0 0 2px rgba(28, 25, 23, 0.06);
}
.scm__domain strong {
  display: block;
  font-size: 0.82rem;
}
.scm__domain em {
  font-style: normal;
  font-size: 0.65rem;
  color: var(--muted);
  text-transform: capitalize;
}
.scm__track {
  display: grid;
  gap: 0.2rem;
}
.scm__bar {
  position: relative;
  height: 1.35rem;
  background: linear-gradient(90deg, #f5f5f4, #e7e5e4);
  border-radius: 999px;
  border: 1px solid var(--line);
}
.scm__bar.desired {
  background: linear-gradient(90deg, #faf8f5, #f0ebe6);
}
.scm__marker {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.75rem;
  line-height: 1;
}
.scm__marker.a {
  color: #1e3a5f;
}
.scm__marker.b {
  color: #9a3412;
}
.scm__nums {
  font-size: 0.68rem;
  color: var(--muted);
}
.scm__list {
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
  color: var(--muted);
  display: grid;
  gap: 0.3rem;
}
.scm__list strong {
  color: var(--ink);
  margin-right: 0.35rem;
}
.scm:not(.scm--list) .scm__list {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.scm--list .scm__table,
.scm--list .scm__legend {
  display: none;
}
@media (max-width: 720px) {
  .scm__row,
  .scm__row--head {
    grid-template-columns: 1fr;
  }
}
</style>
