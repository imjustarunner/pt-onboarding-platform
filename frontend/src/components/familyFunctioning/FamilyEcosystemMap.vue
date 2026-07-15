<template>
  <div
    class="fem"
    :class="{
      'fem--compact': compact,
      'fem--interactive': interactive,
      'fem--list': displayMode === 'list'
    }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="fem__head">
      <div>
        <p class="fem__eyebrow">Family Ecosystem Map</p>
        <h3 class="fem__title">{{ title }}</h3>
      </div>
      <div v-if="familyFunctioningIndex != null" class="fem__score">
        <span class="fem__score-n">{{ familyFunctioningIndex }}</span>
        <span class="fem__score-l">/ 100</span>
      </div>
    </header>

    <div class="fem__modes" role="toolbar" aria-label="Map display mode">
      <button
        v-for="m in modeButtons"
        :key="m.id"
        type="button"
        class="fem__mode"
        :class="{ on: displayMode === m.id }"
        @click="emit('update:displayMode', m.id)"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="fem__canvas" aria-hidden="true">
      <section
        v-for="zone in zones"
        :key="zone.id"
        class="fem__zone"
        :style="{ '--zone-accent': zone.accent }"
      >
        <div class="fem__zone-head">
          <p class="fem__zone-label">{{ zone.label }}</p>
          <strong v-if="zone.avg != null" class="fem__zone-avg">{{ zone.avg }}</strong>
        </div>
        <div class="fem__modules">
          <button
            v-for="mod in zone.modules"
            :key="mod.key"
            type="button"
            class="fem__module"
            :class="moduleClass(mod)"
            :style="moduleStyle(mod)"
            :disabled="!interactive"
            @click="interactive && emit('domain-select', mod.key)"
          >
            <span class="fem__module-name">{{ mod.shortLabel }}</span>
            <span class="fem__module-score">{{ displayScore(mod) }}</span>
            <span v-if="mod.priority" class="fem__badge" title="Selected priority">★</span>
            <span v-if="mod.hasPlan" class="fem__badge plan" title="Active plan">◆</span>
          </button>
        </div>
      </section>
    </div>

    <div class="fem__foundation">
      <div>
        <span>Index</span>
        <strong>{{ familyFunctioningIndex ?? '—' }}</strong>
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

    <ul class="fem__list">
      <li v-for="mod in modules" :key="`li-${mod.key}`">
        <strong>{{ mod.label }}</strong>
        <span v-if="mod.notRelevant">Not relevant in this season</span>
        <span v-else-if="mod.preferNot">Prefer not to answer</span>
        <span v-else-if="!mod.complete">Not reflected on</span>
        <span v-else>
          Functioning {{ mod.functioning }}
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
import { domainStatusLabel, FAMILY_SYSTEMS } from '../../utils/familyFunctioning.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  familyFunctioningIndex: { type: [Number, null], default: null },
  systemScores: { type: Object, default: () => ({}) },
  activeDomainId: { type: String, default: null },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  planDomainIds: { type: Array, default: () => [] },
  displayMode: { type: String, default: 'functioning-and-importance' },
  interactive: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  title: { type: String, default: 'How family life is working' },
  strengthCount: { type: Number, default: null },
  highValueSupportCount: { type: Number, default: null }
});

const emit = defineEmits(['domain-select', 'update:displayMode']);

const modeButtons = [
  { id: 'current-functioning', label: 'Functioning' },
  { id: 'importance', label: 'Importance' },
  { id: 'functioning-and-importance', label: 'Both' },
  { id: 'support-need', label: 'Support need' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'priorities', label: 'Priorities' },
  { id: 'list', label: 'List' }
];

const ZONE_META = {
  'communication-and-safety': { accent: '#475569', scoreKey: 'communicationAndSafety' },
  'structure-and-cooperation': { accent: '#3F6212', scoreKey: 'structureAndCooperation' },
  'connection-and-enjoyment': { accent: '#0F766E', scoreKey: 'connectionAndEnjoyment' },
  adaptability: { accent: '#7C3AED', scoreKey: 'adaptability' }
};

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const modules = computed(() =>
  (props.domains || []).map((d) => {
    const r = responseMap.value[d.key];
    const functioning =
      r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant'
        ? null
        : r?.currentFunctioningScore ?? null;
    return {
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel || d.label,
      color: d.color || '#475569',
      system: d.familySystem,
      functioning,
      importance: r?.personalImportanceScore ?? null,
      supportNeed: r?.supportNeedScore ?? null,
      complete: functioning != null,
      preferNot: !!r?.preferNotToAnswer,
      notRelevant: r?.seasonStatus === 'not-relevant',
      status: functioning != null ? domainStatusLabel(functioning) : '',
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
  Object.values(FAMILY_SYSTEMS).map((sys) => {
    const meta = ZONE_META[sys.id] || { accent: '#64748B', scoreKey: null };
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
    if (mod.functioning == null) return '·';
    return Math.round(11 - mod.functioning);
  }
  if (props.displayMode === 'functioning-and-importance') {
    if (mod.importance == null) return String(mod.functioning);
    return `${mod.functioning}/${mod.importance}`;
  }
  return String(mod.functioning);
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
    mod.complete && mod.functioning != null
      ? Math.max(0.18, Math.min(1, mod.functioning / 10))
      : 0.08;
  return {
    '--mod-color': mod.color,
    '--mod-fill': fill
  };
}

const ariaLabel = computed(() => {
  const bits = modules.value
    .filter((m) => m.complete)
    .map((m) => `${m.label} functioning ${m.functioning}`);
  const index =
    props.familyFunctioningIndex != null
      ? ` Family Functioning Index ${props.familyFunctioningIndex} out of 100.`
      : '';
  if (!bits.length) return `Family Ecosystem Map with no completed domains yet.${index}`;
  return `Family Ecosystem Map. ${bits.join('. ')}.${index}`;
});
</script>

<style scoped>
.fem {
  --ink: #1e293b;
  --muted: #64748b;
  --line: #e2e8f0;
  background: linear-gradient(165deg, rgba(248, 250, 252, 0.98), rgba(241, 245, 249, 0.96));
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 1rem 1.05rem 1.1rem;
  color: var(--ink);
  font-family: Figtree, system-ui, sans-serif;
}

.fem__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}
.fem__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #475569;
  font-weight: 700;
}
.fem__title {
  margin: 0.2rem 0 0;
  font-family: Newsreader, Georgia, serif;
  font-size: 1.1rem;
  font-weight: 600;
}
.fem__score {
  text-align: right;
  line-height: 1;
}
.fem__score-n {
  font-family: Newsreader, Georgia, serif;
  font-size: 1.75rem;
  font-weight: 700;
  color: #334155;
}
.fem__score-l {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.72rem;
  color: var(--muted);
}

.fem__modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.75rem 0 0.85rem;
}
.fem__mode {
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
.fem__mode.on {
  background: #f1f5f9;
  border-color: #94a3b8;
  color: #334155;
}

.fem__canvas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}
.fem__zone {
  background: #fff;
  border: 1px solid color-mix(in srgb, var(--zone-accent) 22%, var(--line));
  border-radius: 14px;
  padding: 0.65rem;
  min-height: 7.5rem;
}
.fem__zone-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}
.fem__zone-label {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--zone-accent);
}
.fem__zone-avg {
  font-size: 0.85rem;
  color: var(--ink);
}

.fem__modules {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.fem__module {
  appearance: none;
  flex: 1 1 4.5rem;
  min-width: 4.2rem;
  border: 1px solid color-mix(in srgb, var(--mod-color) 35%, #e2e8f0);
  border-radius: 12px;
  background: color-mix(in srgb, var(--mod-color) calc(var(--mod-fill) * 55%), #fff);
  color: var(--ink);
  padding: 0.45rem 0.4rem;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  position: relative;
}
.fem--interactive .fem__module:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(30, 41, 59, 0.08);
}
.fem__module.active,
.fem__module.priority {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--mod-color) 45%, transparent);
}
.fem__module.empty {
  opacity: 0.55;
  border-style: dashed;
}
.fem__module.muted {
  opacity: 0.45;
}
.fem__module:disabled {
  cursor: default;
}
.fem__module-name {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
}
.fem__module-score {
  display: block;
  margin-top: 0.15rem;
  font-family: Newsreader, Georgia, serif;
  font-size: 0.95rem;
}
.fem__badge {
  position: absolute;
  top: 0.2rem;
  right: 0.3rem;
  font-size: 0.65rem;
  color: #9a3412;
}
.fem__badge.plan {
  right: 1rem;
  color: #3f6212;
}

.fem__foundation {
  margin-top: 0.75rem;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
  padding: 0.65rem 0.5rem;
  border-radius: 12px;
  background: rgba(241, 245, 249, 0.85);
  border: 1px solid #e2e8f0;
}
.fem__foundation span {
  display: block;
  font-size: 0.65rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.fem__foundation strong {
  font-family: Newsreader, Georgia, serif;
  font-size: 1.05rem;
}

.fem__list {
  display: none;
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: #475569;
}
.fem--list .fem__canvas,
.fem--list .fem__foundation {
  display: none;
}
.fem--list .fem__list {
  display: grid;
}
.fem__list strong {
  color: var(--ink);
  margin-right: 0.35rem;
}

.fem--compact .fem__zone {
  min-height: 0;
  padding: 0.5rem;
}
.fem--compact .fem__foundation {
  grid-template-columns: repeat(2, 1fr);
}

@media (max-width: 720px) {
  .fem__canvas {
    grid-template-columns: 1fr;
  }
  .fem__foundation {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
