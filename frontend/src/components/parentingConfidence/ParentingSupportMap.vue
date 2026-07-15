<template>
  <div
    class="psm"
    :class="{
      'psm--compact': compact,
      'psm--interactive': interactive,
      'psm--list': displayMode === 'list'
    }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="psm__head">
      <div>
        <p class="psm__eyebrow">Parenting Support Map</p>
        <h3 class="psm__title">{{ title }}</h3>
      </div>
      <div v-if="parentingConfidenceIndex != null" class="psm__score">
        <span class="psm__score-n">{{ parentingConfidenceIndex }}</span>
        <span class="psm__score-l">/ 100</span>
      </div>
    </header>

    <div class="psm__modes" role="toolbar" aria-label="Map display mode">
      <button
        v-for="m in modeButtons"
        :key="m.id"
        type="button"
        class="psm__mode"
        :class="{ on: displayMode === m.id }"
        @click="emit('update:displayMode', m.id)"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="psm__canvas" aria-hidden="true">
      <section
        v-for="zone in zones"
        :key="zone.id"
        class="psm__zone"
        :style="{ '--zone-accent': zone.accent }"
      >
        <div class="psm__zone-head">
          <p class="psm__zone-label">{{ zone.label }}</p>
          <strong v-if="zone.avg != null" class="psm__zone-avg">{{ zone.avg }}</strong>
        </div>
        <div class="psm__modules">
          <button
            v-for="mod in zone.modules"
            :key="mod.key"
            type="button"
            class="psm__module"
            :class="moduleClass(mod)"
            :style="moduleStyle(mod)"
            :disabled="!interactive"
            @click="interactive && emit('domain-select', mod.key)"
          >
            <span class="psm__module-name">{{ mod.shortLabel }}</span>
            <span class="psm__module-score">{{ displayScore(mod) }}</span>
            <span v-if="mod.priority" class="psm__badge" title="Selected priority">★</span>
            <span v-if="mod.hasPlan" class="psm__badge plan" title="Active plan">◆</span>
          </button>
        </div>
      </section>
    </div>

    <div class="psm__foundation">
      <div>
        <span>Index</span>
        <strong>{{ parentingConfidenceIndex ?? '—' }}</strong>
      </div>
      <div>
        <span>Strengths</span>
        <strong>{{ strengthCount ?? '—' }}</strong>
      </div>
      <div>
        <span>Support areas</span>
        <strong>{{ highValueSupportCount ?? '—' }}</strong>
      </div>
      <div>
        <span>Priorities</span>
        <strong>{{ (selectedPriorityDomainIds || []).length }}</strong>
      </div>
    </div>

    <ul class="psm__list">
      <li v-for="mod in modules" :key="`li-${mod.key}`">
        <strong>{{ mod.label }}</strong>
        <span v-if="mod.notRelevant">Not relevant in this season</span>
        <span v-else-if="mod.preferNot">Prefer not to answer</span>
        <span v-else-if="!mod.complete">Not reflected on</span>
        <span v-else>
          Capacity {{ mod.capacity }}
          <template v-if="mod.importance != null"> · Importance {{ mod.importance }}</template>
          <template v-if="mod.supportNeed != null"> · Support need {{ mod.supportNeed }}</template>
          · {{ mod.status }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { domainStatusLabel, PARENTING_SYSTEMS } from '../../utils/parentingConfidence.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  parentingConfidenceIndex: { type: [Number, null], default: null },
  systemScores: { type: Object, default: () => ({}) },
  activeDomainId: { type: String, default: null },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  planDomainIds: { type: Array, default: () => [] },
  displayMode: { type: String, default: 'capacity-and-importance' },
  interactive: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  title: { type: String, default: 'Where support meets capacity' },
  strengthCount: { type: Number, default: null },
  highValueSupportCount: { type: Number, default: null }
});

const emit = defineEmits(['domain-select', 'update:displayMode']);

const modeButtons = [
  { id: 'current-capacity', label: 'Capacity' },
  { id: 'importance', label: 'Importance' },
  { id: 'capacity-and-importance', label: 'Both' },
  { id: 'support-need', label: 'Support need' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'priorities', label: 'Priorities' },
  { id: 'list', label: 'List' }
];

const ZONE_META = {
  'guidance-and-structure': { accent: '#B45309', scoreKey: 'guidanceAndStructure' },
  'connection-and-emotional-support': {
    accent: '#0F766E',
    scoreKey: 'connectionAndEmotionalSupport'
  },
  'caregiver-capacity': { accent: '#65A30D', scoreKey: 'caregiverCapacity' },
  'family-integration': { accent: '#78716C', scoreKey: 'familyIntegration' }
};

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const modules = computed(() =>
  (props.domains || []).map((d) => {
    const r = responseMap.value[d.key];
    const capacity =
      r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant'
        ? null
        : r?.currentCapacityScore ?? null;
    return {
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel || d.label,
      color: d.color || '#B45309',
      system: d.parentingSystem,
      capacity,
      importance: r?.personalImportanceScore ?? null,
      supportNeed: r?.supportNeedScore ?? null,
      complete: capacity != null,
      preferNot: !!r?.preferNotToAnswer,
      notRelevant: r?.seasonStatus === 'not-relevant',
      status: capacity != null ? domainStatusLabel(capacity) : '',
      priority: (props.selectedPriorityDomainIds || []).includes(d.key),
      hasPlan: (props.planDomainIds || []).includes(d.key),
      active: props.activeDomainId === d.key
    };
  })
);

const moduleByKey = computed(() => {
  const m = {};
  for (const mod of modules.value) m[mod.key] = mod;
  return m;
});

const zones = computed(() =>
  Object.values(PARENTING_SYSTEMS).map((sys) => {
    const meta = ZONE_META[sys.id] || { accent: '#78716C', scoreKey: null };
    return {
      id: sys.id,
      label: sys.label,
      accent: meta.accent,
      avg: meta.scoreKey ? props.systemScores?.[meta.scoreKey] ?? null : null,
      modules: sys.keys.map((k) => moduleByKey.value[k]).filter(Boolean)
    };
  })
);

function displayScore(mod) {
  if (mod.preferNot) return '—';
  if (mod.notRelevant) return 'N/A';
  if (!mod.complete) return '·';
  if (props.displayMode === 'importance') return mod.importance ?? '·';
  if (props.displayMode === 'support-need') return mod.supportNeed ?? '·';
  if (props.displayMode === 'opportunities') {
    if (mod.capacity == null) return '·';
    const gap = 11 - mod.capacity;
    return Math.round(gap);
  }
  if (props.displayMode === 'capacity-and-importance') {
    if (mod.importance == null) return String(mod.capacity);
    return `${mod.capacity}/${mod.importance}`;
  }
  return String(mod.capacity);
}

function moduleClass(mod) {
  return {
    complete: mod.complete,
    active: mod.active,
    priority: mod.priority,
    empty: !mod.complete && !mod.preferNot && !mod.notRelevant,
    muted: mod.preferNot || mod.notRelevant
  };
}

function moduleStyle(mod) {
  const fill =
    mod.complete && mod.capacity != null
      ? Math.max(0.18, Math.min(1, mod.capacity / 10))
      : 0.08;
  return {
    '--mod-color': mod.color,
    '--mod-fill': fill
  };
}

const ariaLabel = computed(() => {
  const bits = modules.value
    .filter((m) => m.complete)
    .map((m) => `${m.label} capacity ${m.capacity}`);
  const index =
    props.parentingConfidenceIndex != null
      ? ` Parenting Confidence Index ${props.parentingConfidenceIndex} out of 100.`
      : '';
  if (!bits.length) return `Parenting Support Map with no completed domains yet.${index}`;
  return `Parenting Support Map. ${bits.join('. ')}.${index}`;
});
</script>

<style scoped>
.psm {
  --ink: #292524;
  --muted: #78716c;
  --line: #e7e5e4;
  background:
    linear-gradient(165deg, rgba(255, 251, 245, 0.95), rgba(245, 245, 244, 0.98));
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 1rem 1.05rem 1.1rem;
  color: var(--ink);
  font-family: Manrope, system-ui, sans-serif;
}

.psm__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}
.psm__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #b45309;
  font-weight: 700;
}
.psm__title {
  margin: 0.2rem 0 0;
  font-family: Fraunces, Georgia, serif;
  font-size: 1.1rem;
  font-weight: 600;
}
.psm__score {
  text-align: right;
  line-height: 1;
}
.psm__score-n {
  font-family: Fraunces, Georgia, serif;
  font-size: 1.75rem;
  font-weight: 700;
  color: #92400e;
}
.psm__score-l {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.72rem;
  color: var(--muted);
}

.psm__modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.75rem 0 0.85rem;
}
.psm__mode {
  appearance: none;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--muted);
  border-radius: 999px;
  padding: 0.28rem 0.65rem;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
}
.psm__mode.on {
  background: #fff7ed;
  border-color: #fdba74;
  color: #9a3412;
}

.psm__canvas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}
.psm__zone {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--zone-accent) 22%, var(--line));
  border-radius: 14px;
  padding: 0.65rem;
  min-height: 7.5rem;
}
.psm__zone-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}
.psm__zone-label {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--zone-accent);
}
.psm__zone-avg {
  font-size: 0.85rem;
  color: var(--ink);
}

.psm__modules {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.psm__module {
  appearance: none;
  flex: 1 1 4.5rem;
  min-width: 4.2rem;
  border: 1px solid color-mix(in srgb, var(--mod-color) 35%, #e7e5e4);
  border-radius: 12px;
  background: color-mix(in srgb, var(--mod-color) calc(var(--mod-fill) * 55%), #fff);
  color: var(--ink);
  padding: 0.45rem 0.4rem;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  position: relative;
}
.psm--interactive .psm__module:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(41, 37, 36, 0.08);
}
.psm__module.active,
.psm__module.priority {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--mod-color) 45%, transparent);
}
.psm__module.empty {
  opacity: 0.55;
  border-style: dashed;
}
.psm__module.muted {
  opacity: 0.45;
}
.psm__module:disabled {
  cursor: default;
}
.psm__module-name {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
}
.psm__module-score {
  display: block;
  margin-top: 0.15rem;
  font-family: Fraunces, Georgia, serif;
  font-size: 0.95rem;
}
.psm__badge {
  position: absolute;
  top: 0.2rem;
  right: 0.3rem;
  font-size: 0.65rem;
  color: #b45309;
}
.psm__badge.plan {
  right: 1rem;
  color: #0f766e;
}

.psm__foundation {
  margin-top: 0.75rem;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
  padding: 0.65rem 0.5rem;
  border-radius: 12px;
  background: rgba(255, 247, 237, 0.7);
  border: 1px solid #ffedd5;
}
.psm__foundation span {
  display: block;
  font-size: 0.65rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.psm__foundation strong {
  font-family: Fraunces, Georgia, serif;
  font-size: 1.05rem;
}

.psm__list {
  display: none;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: #57534e;
}
.psm--list .psm__canvas,
.psm--list .psm__foundation {
  display: none;
}
.psm--list .psm__list {
  display: grid;
}
.psm__list strong {
  color: var(--ink);
  margin-right: 0.35rem;
}

.psm--compact .psm__zone {
  min-height: 0;
  padding: 0.5rem;
}
.psm--compact .psm__foundation {
  grid-template-columns: repeat(2, 1fr);
}

@media (max-width: 720px) {
  .psm__canvas {
    grid-template-columns: 1fr;
  }
  .psm__foundation {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
