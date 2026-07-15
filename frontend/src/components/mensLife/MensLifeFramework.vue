<template>
  <div
    class="mlf"
    :class="{
      'mlf--compact': compact,
      'mlf--interactive': interactive,
      'mlf--list': displayMode === 'list'
    }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="mlf__head">
      <div>
        <p class="mlf__eyebrow">The Life Framework</p>
        <h3 class="mlf__title">{{ title }}</h3>
      </div>
      <div v-if="mensLifeIndex != null" class="mlf__score">
        <span class="mlf__score-n">{{ mensLifeIndex }}</span>
        <span class="mlf__score-l">/ 100</span>
      </div>
    </header>

    <div class="mlf__modes" role="toolbar" aria-label="Framework display mode">
      <button
        v-for="m in modeButtons"
        :key="m.id"
        type="button"
        class="mlf__mode"
        :class="{ on: displayMode === m.id }"
        @click="emit('update:displayMode', m.id)"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="mlf__legacy" aria-hidden="true">
      <span class="mlf__legacy-line" />
      <span class="mlf__legacy-label">Legacy Direction</span>
      <span class="mlf__legacy-line" />
    </div>

    <div class="mlf__canvas" aria-hidden="true">
      <section
        v-for="col in columns"
        :key="col.id"
        class="mlf__column"
      >
        <p class="mlf__column-label">{{ col.label }}</p>
        <button
          v-for="mod in col.modules"
          :key="mod.key"
          type="button"
          class="mlf__module"
          :class="moduleClass(mod)"
          :style="moduleStyle(mod)"
          :disabled="!interactive"
          @click="interactive && emit('domain-select', mod.key)"
        >
          <span class="mlf__module-name">{{ mod.shortLabel }}</span>
          <span class="mlf__module-score">{{ displayScore(mod) }}</span>
          <span v-if="mod.priority" class="mlf__badge" title="Selected priority">★</span>
          <span v-if="mod.hasPlan" class="mlf__badge plan" title="Active plan">◆</span>
          <span v-if="mod.hasDeepDive" class="mlf__badge dive" title="Deep dive available">↗</span>
        </button>
      </section>
    </div>

    <div class="mlf__foundation">
      <div>
        <span>Men's Life Index</span>
        <strong>{{ mensLifeIndex ?? '—' }}</strong>
      </div>
      <div>
        <span>Strengths</span>
        <strong>{{ coreStrengthCount ?? '—' }}</strong>
      </div>
      <div>
        <span>Development</span>
        <strong>{{ highImportanceDevelopmentCount ?? '—' }}</strong>
      </div>
      <div>
        <span>Priorities</span>
        <strong>{{ (selectedPriorityDomainIds || []).length }}</strong>
      </div>
    </div>
    <p class="mlf__foundation-label">Whole-Life Foundation</p>

    <ul class="mlf__list">
      <li v-for="mod in modules" :key="`li-${mod.key}`">
        <strong>{{ mod.label }}</strong>
        <span v-if="mod.notRelevant">Not relevant in this season</span>
        <span v-else-if="mod.preferNot">Prefer not to answer</span>
        <span v-else-if="!mod.complete">Not Reflected On</span>
        <span v-else>
          Strength {{ mod.strength }}
          <template v-if="mod.importance != null"> · Importance {{ mod.importance }}</template>
          <template v-if="mod.momentumLabel"> · {{ mod.momentumLabel }}</template>
          · {{ mod.status }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { domainStatusLabel, momentumLabel, LIFE_SYSTEMS } from '../../utils/mensLife.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  mensLifeIndex: { type: [Number, null], default: null },
  importanceWeightedLifeIndex: { type: [Number, null], default: null },
  systemScores: { type: Object, default: () => ({}) },
  activeDomainId: { type: String, default: null },
  previousAssessment: { type: Object, default: null },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  planDomainIds: { type: Array, default: () => [] },
  displayMode: { type: String, default: 'strength-and-importance' },
  interactive: { type: Boolean, default: false },
  animated: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  title: { type: String, default: 'The Life You Are Building' },
  coreStrengthCount: { type: Number, default: null },
  highImportanceDevelopmentCount: { type: Number, default: null }
});

const emit = defineEmits(['domain-select', 'update:displayMode']);

const modeButtons = [
  { id: 'current-strength', label: 'Strength' },
  { id: 'importance', label: 'Importance' },
  { id: 'strength-and-importance', label: 'Both' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'priorities', label: 'Priorities' },
  { id: 'list', label: 'List' }
];

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const modules = computed(() =>
  (props.domains || []).map((d) => {
    const r = responseMap.value[d.key];
    const strength =
      r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant'
        ? null
        : r?.currentStrengthScore ?? null;
    const importance = r?.personalImportanceScore ?? null;
    const momentum = r?.currentMomentumScore ?? null;
    const complete =
      strength != null || !!r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant';
    const isOpportunity =
      strength != null &&
      importance != null &&
      strength <= 5 &&
      importance >= 8;
    return {
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel || d.label,
      color: d.color || '#1E3A5F',
      system: d.lifeSystem,
      strength,
      importance,
      momentum,
      momentumLabel: momentumLabel(momentum),
      status: domainStatusLabel(strength),
      complete,
      notRelevant: r?.seasonStatus === 'not-relevant',
      preferNot: !!r?.preferNotToAnswer,
      priority: (props.selectedPriorityDomainIds || []).includes(d.key),
      hasPlan: (props.planDomainIds || []).includes(d.key),
      hasDeepDive: (d.relatedAssessmentIds || []).length > 0,
      isOpportunity
    };
  })
);

const columns = computed(() =>
  Object.values(LIFE_SYSTEMS).map((sys) => ({
    id: sys.id,
    label: sys.label,
    modules: modules.value.filter((m) => m.system === sys.id || sys.keys.includes(m.key))
  })).filter((c) => c.modules.length)
);

function displayScore(m) {
  if (!m.complete || m.strength == null) return '○';
  if (props.displayMode === 'importance') return m.importance ?? '—';
  if (props.displayMode === 'momentum') return m.momentum ?? '—';
  if (props.displayMode === 'strength-and-importance' && m.importance != null) {
    return `${m.strength}/${m.importance}`;
  }
  return String(m.strength);
}

function moduleClass(m) {
  return {
    active: m.key === props.activeDomainId,
    complete: m.complete && m.strength != null,
    neutral: !m.complete,
    priority: m.priority || props.displayMode === 'priorities',
    opportunity:
      props.displayMode === 'opportunities' && m.isOpportunity,
    dim:
      props.displayMode === 'priorities' &&
      !m.priority &&
      (props.selectedPriorityDomainIds || []).length > 0
  };
}

function moduleStyle(m) {
  const opacity =
    m.complete && m.strength != null ? 0.28 + (m.strength / 10) * 0.5 : 0.1;
  return {
    '--module-color': m.color,
    '--module-glow': opacity
  };
}

const ariaLabel = computed(() => {
  const parts = modules.value.map((m) => {
    if (!m.complete) return `${m.label}: not reflected on`;
    if (m.notRelevant) return `${m.label}: not relevant`;
    return `${m.label}: strength ${m.strength}${m.importance != null ? `, importance ${m.importance}` : ''}`;
  });
  return `The Life Framework. Men's Life Index ${props.mensLifeIndex ?? 'not yet available'}. ${parts.join('. ')}`;
});
</script>

<style scoped>
.mlf {
  --ink: #1c1917;
  --muted: #78716c;
  --line: #e7e5e4;
  background:
    linear-gradient(165deg, #fafaf9 0%, #f5f5f4 40%, #f0ebe3 100%);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 1.15rem 1.2rem 1.3rem;
  color: var(--ink);
  position: relative;
  box-shadow: 0 12px 32px rgba(28, 25, 23, 0.06);
}
.mlf__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 0.7rem;
}
.mlf__eyebrow {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #92400e;
  font-weight: 700;
}
.mlf__title {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.mlf__score {
  display: flex;
  align-items: baseline;
  gap: 0.2rem;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.35rem 0.65rem;
}
.mlf__score-n {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e3a5f;
}
.mlf__score-l {
  color: var(--muted);
  font-size: 0.85rem;
}
.mlf__modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.75rem;
}
.mlf__mode {
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  padding: 0.22rem 0.6rem;
  font-size: 0.7rem;
  color: var(--muted);
  cursor: pointer;
}
.mlf__mode.on {
  background: #1e3a5f;
  border-color: #1e3a5f;
  color: #fff;
}
.mlf__legacy {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.85rem;
}
.mlf__legacy-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, #a8a29e, transparent);
}
.mlf__legacy-label {
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #92400e;
  font-weight: 650;
}
.mlf__canvas {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
}
.mlf__column-label {
  margin: 0 0 0.4rem;
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 650;
  min-height: 2rem;
  line-height: 1.3;
}
.mlf__module {
  position: relative;
  display: block;
  width: 100%;
  appearance: none;
  border: 1.5px solid color-mix(in srgb, var(--module-color) 30%, #d6d3d1);
  background: color-mix(in srgb, var(--module-color) calc(var(--module-glow) * 100%), #ffffff);
  border-radius: 10px;
  padding: 0.65rem 0.5rem;
  text-align: left;
  cursor: pointer;
  margin-bottom: 0.4rem;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  min-height: 3.8rem;
}
.mlf--interactive .mlf__module:hover:not(:disabled),
.mlf__module.active {
  transform: scale(1.03);
  border-color: var(--module-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--module-color) 22%, transparent);
  z-index: 1;
}
.mlf__module.neutral {
  opacity: 0.72;
}
.mlf__module.dim {
  opacity: 0.38;
}
.mlf__module.opportunity {
  outline: 1.5px dashed color-mix(in srgb, var(--module-color) 50%, #78716c);
}
.mlf__module:disabled {
  cursor: default;
}
.mlf__module-name {
  display: block;
  font-size: 0.74rem;
  font-weight: 650;
}
.mlf__module-score {
  display: block;
  margin-top: 0.2rem;
  font-size: 1rem;
  font-weight: 700;
  color: color-mix(in srgb, var(--module-color) 65%, #1c1917);
}
.mlf__badge {
  position: absolute;
  top: 0.25rem;
  right: 0.3rem;
  font-size: 0.65rem;
  color: #92400e;
}
.mlf__badge.plan {
  right: 1rem;
  color: #1e3a5f;
}
.mlf__badge.dive {
  top: auto;
  bottom: 0.25rem;
  color: #0f766e;
}
.mlf__foundation {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
  margin-top: 0.95rem;
  padding-top: 0.85rem;
  border-top: 2px solid #d6d3d1;
}
.mlf__foundation > div {
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0.4rem 0.5rem;
}
.mlf__foundation span {
  display: block;
  font-size: 0.6rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mlf__foundation strong {
  font-size: 0.95rem;
}
.mlf__foundation-label {
  margin: 0.45rem 0 0;
  text-align: center;
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #78716c;
  font-weight: 650;
}
.mlf__list {
  margin: 0.85rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
}
.mlf__list li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.6rem;
  font-size: 0.8rem;
  color: var(--muted);
  border-top: 1px solid var(--line);
  padding-top: 0.3rem;
}
.mlf__list strong {
  color: var(--ink);
  min-width: 7rem;
}
.mlf--list .mlf__canvas,
.mlf--list .mlf__legacy,
.mlf--list .mlf__foundation,
.mlf--list .mlf__foundation-label {
  display: none;
}
.mlf:not(.mlf--list) .mlf__list {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
@media (max-width: 800px) {
  .mlf__canvas {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .mlf__foundation {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (prefers-reduced-motion: reduce) {
  .mlf__module {
    transition: none;
  }
}
</style>
