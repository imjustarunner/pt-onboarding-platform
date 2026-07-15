<template>
  <div
    class="dwg"
    :class="{
      'dwg--compact': compact,
      'dwg--interactive': interactive,
      'dwg--list': displayMode === 'list'
    }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="dwg__head">
      <div>
        <p class="dwg__eyebrow">Digital Wellness Grid</p>
        <h3 class="dwg__title">{{ title }}</h3>
      </div>
      <div v-if="digitalWellnessIndex != null" class="dwg__score">
        <span class="dwg__score-n">{{ digitalWellnessIndex }}</span>
        <span class="dwg__score-l">/ 100</span>
      </div>
    </header>

    <div class="dwg__modes" role="toolbar" aria-label="Grid display mode">
      <button
        v-for="m in modeButtons"
        :key="m.id"
        type="button"
        class="dwg__mode"
        :class="{ on: displayMode === m.id }"
        @click="emit('update:displayMode', m.id)"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="dwg__legend">
      <span>Modules illuminate as you reflect</span>
      <span v-if="showControl">Control shown when enabled</span>
      <span>Connections are conceptual only</span>
    </div>

    <div class="dwg__canvas" aria-hidden="true">
      <section class="dwg__group">
        <p class="dwg__group-label">Digital Activity</p>
        <div class="dwg__row">
          <button
            v-for="m in activityModules"
            :key="m.key"
            type="button"
            class="dwg__module"
            :class="moduleClass(m)"
            :style="moduleStyle(m)"
            :disabled="!interactive"
            @click="interactive && emit('domain-select', m.key)"
          >
            <span class="dwg__module-name">{{ m.shortLabel }}</span>
            <span class="dwg__module-score">{{ displayScore(m) }}</span>
            <span v-if="m.priority" class="dwg__badge" title="Selected priority">★</span>
            <span v-if="m.hasPlan" class="dwg__badge plan" title="Active plan">◆</span>
            <span v-if="m.hasSupport" class="dwg__badge support" title="Support requested">+</span>
          </button>
        </div>
      </section>

      <div class="dwg__impact" aria-hidden="true">
        <span class="dwg__impact-line" />
        <span class="dwg__impact-label">Impact</span>
        <span class="dwg__impact-line" />
      </div>

      <section class="dwg__group">
        <p class="dwg__group-label">Daily Life</p>
        <div class="dwg__row dwg__row--life">
          <button
            v-for="m in lifeModules"
            :key="m.key"
            type="button"
            class="dwg__module"
            :class="moduleClass(m)"
            :style="moduleStyle(m)"
            :disabled="!interactive"
            @click="interactive && emit('domain-select', m.key)"
          >
            <span class="dwg__module-name">{{ m.shortLabel }}</span>
            <span class="dwg__module-score">{{ displayScore(m) }}</span>
            <span v-if="m.priority" class="dwg__badge" title="Selected priority">★</span>
            <span v-if="m.hasPlan" class="dwg__badge plan" title="Active plan">◆</span>
            <span v-if="m.hasSupport" class="dwg__badge support" title="Support requested">+</span>
          </button>
        </div>
      </section>

      <div class="dwg__summary">
        <div>
          <span>Digital Wellness Index</span>
          <strong>{{ digitalWellnessIndex ?? '—' }}</strong>
        </div>
        <div>
          <span>Balanced</span>
          <strong>{{ balancedDomainCount ?? '—' }}</strong>
        </div>
        <div>
          <span>Friction areas</span>
          <strong>{{ frictionDomainCount ?? '—' }}</strong>
        </div>
        <div>
          <span>Priorities</span>
          <strong>{{ (selectedPriorityDomainIds || []).length }}</strong>
        </div>
      </div>
    </div>

    <ul class="dwg__list">
      <li v-for="m in modules" :key="`li-${m.key}`">
        <strong>{{ m.label }}</strong>
        <span v-if="m.notRelevant">Not relevant in this season</span>
        <span v-else-if="m.preferNot">Prefer not to answer</span>
        <span v-else-if="!m.complete">Not Reflected On</span>
        <span v-else>
          Wellness {{ m.wellness }}
          <template v-if="m.control != null"> · Control {{ m.control }}</template>
          <template v-if="m.importance != null"> · Importance {{ m.importance }}</template>
          <template v-if="m.friction != null"> · Friction {{ m.friction }}</template>
          · {{ m.status }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import {
  domainStatusLabel,
  calculateDigitalFrictionScore
} from '../../utils/digitalWellness.js';

const ACTIVITY_KEYS = ['screen_time', 'gaming', 'social_media'];
const LIFE_KEYS = [
  'sleep',
  'productivity',
  'relationships',
  'exercise',
  'mindfulness',
  'focus',
  'balance'
];

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  digitalWellnessIndex: { type: [Number, null], default: null },
  systemScores: { type: Object, default: () => ({}) },
  activeDomainId: { type: String, default: null },
  previousAssessment: { type: Object, default: null },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  planDomainIds: { type: Array, default: () => [] },
  supportDomainIds: { type: Array, default: () => [] },
  displayMode: { type: String, default: 'wellness-and-control' },
  interactive: { type: Boolean, default: false },
  animated: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  title: { type: String, default: 'How technology fits your life' },
  balancedDomainCount: { type: Number, default: null },
  frictionDomainCount: { type: Number, default: null }
});

const emit = defineEmits(['domain-select', 'update:displayMode']);

const modeButtons = [
  { id: 'current-wellness', label: 'Wellness' },
  { id: 'intentional-control', label: 'Control' },
  { id: 'wellness-and-control', label: 'Both' },
  { id: 'digital-friction', label: 'Friction' },
  { id: 'priorities', label: 'Priorities' },
  { id: 'list', label: 'List' }
];

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const showControl = computed(() =>
  ['intentional-control', 'wellness-and-control', 'digital-friction'].includes(props.displayMode)
);

const modules = computed(() =>
  (props.domains || []).map((d) => {
    const r = responseMap.value[d.key];
    const wellness =
      r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant'
        ? null
        : r?.currentWellnessScore ?? null;
    const control = r?.intentionalControlScore ?? null;
    const importance = r?.personalImportanceScore ?? null;
    const friction =
      wellness != null && control != null
        ? calculateDigitalFrictionScore(wellness, control)
        : null;
    const complete =
      wellness != null || !!r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant';
    return {
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel || d.label,
      color: d.color || '#0EA5E9',
      wellness,
      control,
      importance,
      friction,
      status: domainStatusLabel(wellness),
      complete,
      notRelevant: r?.seasonStatus === 'not-relevant',
      preferNot: !!r?.preferNotToAnswer,
      priority: (props.selectedPriorityDomainIds || []).includes(d.key),
      hasPlan: (props.planDomainIds || []).includes(d.key),
      hasSupport:
        (props.supportDomainIds || []).includes(d.key) ||
        (!!r?.supportPreference && r.supportPreference !== 'none'),
      isActivity: ACTIVITY_KEYS.includes(d.key),
      isLife: LIFE_KEYS.includes(d.key)
    };
  })
);

const activityModules = computed(() =>
  modules.value.filter((m) => ACTIVITY_KEYS.includes(m.key))
);
const lifeModules = computed(() => modules.value.filter((m) => LIFE_KEYS.includes(m.key)));

function displayScore(m) {
  if (!m.complete || m.wellness == null) return '○';
  if (props.displayMode === 'intentional-control') return m.control ?? '—';
  if (props.displayMode === 'digital-friction') return m.friction ?? m.wellness;
  if (props.displayMode === 'wellness-and-control' && m.control != null) {
    return `${m.wellness}/${m.control}`;
  }
  return String(m.wellness);
}

function moduleClass(m) {
  return {
    active: m.key === props.activeDomainId,
    complete: m.complete && m.wellness != null,
    neutral: !m.complete,
    priority: m.priority || props.displayMode === 'priorities',
    friction:
      props.displayMode === 'digital-friction' &&
      m.friction != null &&
      m.friction >= 5.1,
    dim:
      props.displayMode === 'priorities' &&
      !m.priority &&
      (props.selectedPriorityDomainIds || []).length > 0
  };
}

function moduleStyle(m) {
  const opacity =
    m.complete && m.wellness != null ? 0.35 + (m.wellness / 10) * 0.55 : 0.12;
  return {
    '--module-color': m.color,
    '--module-glow': m.complete ? opacity : 0.08
  };
}

const ariaLabel = computed(() => {
  const parts = modules.value.map((m) => {
    if (!m.complete) return `${m.label}: not reflected on`;
    if (m.notRelevant) return `${m.label}: not relevant`;
    return `${m.label}: wellness ${m.wellness}${m.control != null ? `, control ${m.control}` : ''}`;
  });
  return `Digital Wellness Grid. Index ${props.digitalWellnessIndex ?? 'not yet available'}. ${parts.join('. ')}`;
});
</script>

<style scoped>
.dwg {
  --dw-ink: #0f172a;
  --dw-muted: #64748b;
  --dw-panel: #f8fafc;
  --dw-line: #e2e8f0;
  background: linear-gradient(165deg, #f0f9ff 0%, #f8fafc 45%, #eef2ff 100%);
  border: 1px solid var(--dw-line);
  border-radius: 20px;
  padding: 1.1rem 1.15rem 1.25rem;
  color: var(--dw-ink);
}
.dwg__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}
.dwg__eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0284c7;
  font-weight: 600;
}
.dwg__title {
  margin: 0.15rem 0 0;
  font-size: 1.05rem;
  font-weight: 650;
}
.dwg__score {
  display: flex;
  align-items: baseline;
  gap: 0.2rem;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid var(--dw-line);
  border-radius: 14px;
  padding: 0.35rem 0.65rem;
}
.dwg__score-n {
  font-size: 1.55rem;
  font-weight: 700;
  color: #0369a1;
}
.dwg__score-l {
  color: var(--dw-muted);
  font-size: 0.85rem;
}
.dwg__modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.65rem;
}
.dwg__mode {
  border: 1px solid var(--dw-line);
  background: rgba(255, 255, 255, 0.7);
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  font-size: 0.72rem;
  color: var(--dw-muted);
  cursor: pointer;
}
.dwg__mode.on {
  background: #0ea5e9;
  border-color: #0284c7;
  color: #fff;
}
.dwg__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.72rem;
  color: var(--dw-muted);
  margin-bottom: 0.85rem;
}
.dwg__group-label {
  margin: 0 0 0.45rem;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dw-muted);
  font-weight: 600;
}
.dwg__row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
}
.dwg__row--life {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.dwg__impact {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0.85rem 0;
}
.dwg__impact-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, #94a3b8, transparent);
}
.dwg__impact-label {
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}
.dwg__module {
  position: relative;
  appearance: none;
  border: 1.5px solid color-mix(in srgb, var(--module-color) 35%, #cbd5e1);
  background: color-mix(in srgb, var(--module-color) calc(var(--module-glow) * 100%), #ffffff);
  border-radius: 14px;
  padding: 0.7rem 0.55rem;
  text-align: left;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  min-height: 4.2rem;
}
.dwg--interactive .dwg__module:hover:not(:disabled),
.dwg__module.active {
  transform: scale(1.04);
  border-color: var(--module-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--module-color) 28%, transparent);
  z-index: 1;
}
.dwg__module.complete {
  box-shadow: 0 1px 0 color-mix(in srgb, var(--module-color) 20%, transparent);
}
.dwg__module.neutral {
  opacity: 0.78;
}
.dwg__module.dim {
  opacity: 0.4;
}
.dwg__module.friction {
  outline: 2px dashed color-mix(in srgb, var(--module-color) 55%, #64748b);
}
.dwg__module:disabled {
  cursor: default;
}
.dwg__module-name {
  display: block;
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--dw-ink);
}
.dwg__module-score {
  display: block;
  margin-top: 0.25rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: color-mix(in srgb, var(--module-color) 70%, #0f172a);
}
.dwg__badge {
  position: absolute;
  top: 0.3rem;
  right: 0.35rem;
  font-size: 0.7rem;
  color: #0369a1;
}
.dwg__badge.plan {
  right: 1.1rem;
  color: #7c3aed;
}
.dwg__badge.support {
  top: auto;
  bottom: 0.3rem;
  color: #059669;
}
.dwg__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.45rem;
  margin-top: 0.95rem;
}
.dwg__summary > div {
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid var(--dw-line);
  border-radius: 12px;
  padding: 0.45rem 0.55rem;
}
.dwg__summary span {
  display: block;
  font-size: 0.65rem;
  color: var(--dw-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.dwg__summary strong {
  font-size: 1rem;
  color: #0f172a;
}
.dwg__list {
  margin: 0.9rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.35rem;
}
.dwg__list li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  font-size: 0.82rem;
  color: var(--dw-muted);
  border-top: 1px solid var(--dw-line);
  padding-top: 0.35rem;
}
.dwg__list strong {
  color: var(--dw-ink);
  min-width: 7rem;
}
.dwg--list .dwg__canvas {
  display: none;
}
.dwg:not(.dwg--list) .dwg__list {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.dwg {
  position: relative;
}
@media (max-width: 720px) {
  .dwg__row,
  .dwg__row--life {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .dwg__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (prefers-reduced-motion: reduce) {
  .dwg__module {
    transition: none;
  }
}
</style>
