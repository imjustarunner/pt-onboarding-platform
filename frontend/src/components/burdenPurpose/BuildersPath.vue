<template>
  <div
    class="bp-path"
    :class="{ 'bp-path--compact': compact, 'bp-path--interactive': interactive }"
    role="img"
    :aria-label="ariaLabel"
  >
    <header class="bp-path__head">
      <div>
        <p class="bp-path__eyebrow">The Builder’s Path</p>
        <h3 class="bp-path__title">{{ title }}</h3>
      </div>
      <div v-if="burdenReadinessIndex != null" class="bp-path__score">
        <span class="bp-path__score-n">{{ burdenReadinessIndex }}</span>
        <span class="bp-path__score-l">/ 100</span>
      </div>
    </header>

    <p v-if="orientationLabel" class="bp-path__orientation">
      Self-reported orientation: <strong>{{ orientationLabel }}</strong>
      <span> — pattern label, not a rank of worth</span>
    </p>

    <div class="bp-path__regions">
      <section v-for="region in regions" :key="region.id" class="bp-path__region">
        <div class="bp-path__region-head">
          <p class="bp-path__region-label">{{ region.label }}</p>
          <span v-if="region.avg != null" class="bp-path__region-avg">{{ region.avg }}</span>
        </div>
        <div class="bp-path__checkpoints">
          <button
            v-for="cp in region.checkpoints"
            :key="cp.key"
            type="button"
            class="bp-path__checkpoint"
            :class="checkpointClass(cp)"
            :style="{ '--cp-color': cp.color }"
            :disabled="!interactive"
            @click="interactive && emit('domain-select', cp.key)"
          >
            <span class="bp-path__cp-order">{{ cp.order }}</span>
            <span class="bp-path__cp-name">{{ cp.shortLabel }}</span>
            <span class="bp-path__cp-score">{{ displayScore(cp) }}</span>
            <span v-if="cp.priority" class="bp-path__badge" title="Selected priority">★</span>
            <span v-if="cp.overextension" class="bp-path__badge warn" title="Overextension signal">!</span>
            <span v-if="cp.avoidance" class="bp-path__badge avoid" title="Avoidance marked">↗</span>
          </button>
        </div>
      </section>
    </div>

    <div class="bp-path__foundation">
      <div>
        <span>Readiness</span>
        <strong>{{ burdenReadinessIndex ?? '—' }}</strong>
      </div>
      <div>
        <span>Carrying well</span>
        <strong>{{ carryingWellCount ?? '—' }}</strong>
      </div>
      <div>
        <span>Growth ops</span>
        <strong>{{ growthOpportunityCount ?? '—' }}</strong>
      </div>
      <div>
        <span>Priorities</span>
        <strong>{{ (selectedPriorityDomainIds || []).length }}</strong>
      </div>
    </div>

    <ul class="bp-path__list">
      <li v-for="cp in allCheckpoints" :key="`li-${cp.key}`">
        <strong>{{ cp.label }}</strong>
        <span v-if="cp.notRelevant">Not relevant in this season</span>
        <span v-else-if="cp.preferNot">Prefer not to answer</span>
        <span v-else-if="!cp.complete">Not reflected on</span>
        <span v-else>
          Practice {{ cp.practice }}
          <template v-if="cp.importance != null"> · Meaning {{ cp.importance }}</template>
          <template v-if="cp.capacity != null"> · Capacity {{ cp.capacity }}</template>
          · {{ cp.status }}
        </span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { BURDEN_SYSTEMS, pillarStatusLabel } from '../../utils/burdenPurpose.js';

const props = defineProps({
  domains: { type: Array, default: () => [] },
  responses: { type: Array, default: () => [] },
  burdenReadinessIndex: { type: [Number, null], default: null },
  systemScores: { type: Object, default: () => ({}) },
  selectedPriorityDomainIds: { type: Array, default: () => [] },
  activeDomainId: { type: String, default: null },
  orientationLabel: { type: String, default: '' },
  carryingWellCount: { type: [Number, null], default: null },
  growthOpportunityCount: { type: [Number, null], default: null },
  overextendedKeys: { type: Array, default: () => [] },
  avoidanceKeys: { type: Array, default: () => [] },
  interactive: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  title: { type: String, default: 'Twelve checkpoints across four regions' }
});

const emit = defineEmits(['domain-select']);

const responseMap = computed(() => {
  const m = {};
  for (const r of props.responses || []) m[r.domainKey] = r;
  return m;
});

const domainMap = computed(() => {
  const m = {};
  for (const d of props.domains || []) m[d.key] = d;
  return m;
});

function buildCheckpoint(key, order) {
  const d = domainMap.value[key];
  const r = responseMap.value[key];
  if (!d) return null;
  const practice = r?.currentPracticeScore;
  const complete =
    practice != null || r?.preferNotToAnswer || r?.seasonStatus === 'not-relevant';
  return {
    key,
    order,
    label: d.label,
    shortLabel: d.shortLabel || d.label,
    color: d.color || '#1B4332',
    practice: practice ?? null,
    importance: r?.personalImportanceScore ?? null,
    capacity: r?.sustainableCapacityScore ?? null,
    status: practice != null ? pillarStatusLabel(practice) : '',
    complete: !!complete,
    preferNot: !!r?.preferNotToAnswer,
    notRelevant: r?.seasonStatus === 'not-relevant',
    priority: (props.selectedPriorityDomainIds || []).includes(key),
    active: props.activeDomainId === key,
    overextension: (props.overextendedKeys || []).includes(key),
    avoidance: (props.avoidanceKeys || []).includes(key)
  };
}

const regions = computed(() => {
  const systems = Object.values(BURDEN_SYSTEMS).sort(
    (a, b) => (a.regionOrder || 0) - (b.regionOrder || 0)
  );
  let order = 1;
  const avgMap = {
    'direction-and-identity': props.systemScores?.directionAndIdentity,
    'capacity-and-readiness': props.systemScores?.capacityAndReadiness,
    'responsibility-and-contribution': props.systemScores?.responsibilityAndContribution,
    'growth-and-exploration': props.systemScores?.growthAndExploration
  };
  return systems.map((sys) => {
    const checkpoints = (sys.keys || [])
      .map((k) => {
        const cp = buildCheckpoint(k, order);
        if (cp) order += 1;
        return cp;
      })
      .filter(Boolean);
    return {
      id: sys.id,
      label: sys.label,
      avg: avgMap[sys.id] ?? null,
      checkpoints
    };
  });
});

const allCheckpoints = computed(() => regions.value.flatMap((r) => r.checkpoints));

function displayScore(cp) {
  if (cp.notRelevant) return '—';
  if (cp.preferNot) return '·';
  if (cp.practice == null) return '·';
  return String(cp.practice);
}

function checkpointClass(cp) {
  return {
    active: cp.active,
    priority: cp.priority,
    complete: cp.complete && !cp.notRelevant && !cp.preferNot,
    muted: cp.notRelevant || cp.preferNot,
    empty: !cp.complete,
    over: cp.overextension,
    avoid: cp.avoidance
  };
}

const ariaLabel = computed(() => {
  const parts = allCheckpoints.value
    .filter((c) => c.practice != null)
    .map((c) => `${c.label} practice ${c.practice}`);
  const base = `Builder's Path. Readiness ${props.burdenReadinessIndex ?? 'not yet scored'}.`;
  return parts.length ? `${base} ${parts.join('. ')}.` : base;
});
</script>

<style scoped>
.bp-path {
  --ink: #1c1917;
  --muted: #6b7280;
  --line: #d6d3d1;
  --forest: #1b4332;
  --slate: #457b9d;
  --bronze: #a16207;
  background:
    linear-gradient(165deg, rgba(27, 67, 50, 0.06), transparent 40%),
    linear-gradient(180deg, #f8faf9 0%, #f1f5f4 100%);
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 1rem 1rem 1.15rem;
  color: var(--ink);
}

.bp-path__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}

.bp-path__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--forest);
  font-weight: 700;
}

.bp-path__title {
  margin: 0.2rem 0 0;
  font-size: 1.05rem;
  font-family: Fraunces, Georgia, serif;
}

.bp-path__score {
  text-align: right;
  line-height: 1;
}
.bp-path__score-n {
  font-size: 1.7rem;
  font-weight: 700;
  color: var(--forest);
  font-family: Fraunces, Georgia, serif;
}
.bp-path__score-l {
  font-size: 0.8rem;
  color: var(--muted);
}

.bp-path__orientation {
  margin: 0.65rem 0 0;
  font-size: 0.82rem;
  color: #44403c;
}
.bp-path__orientation span {
  color: var(--muted);
}

.bp-path__regions {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.9rem;
}

.bp-path__region {
  border: 1px solid rgba(27, 67, 50, 0.12);
  border-radius: 14px;
  padding: 0.65rem 0.7rem 0.75rem;
  background: rgba(255, 255, 255, 0.72);
}

.bp-path__region-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.45rem;
}

.bp-path__region-label {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--slate);
}

.bp-path__region-avg {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--forest);
}

.bp-path__checkpoints {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  gap: 0.4rem;
}

.bp-path__checkpoint {
  appearance: none;
  border: 1px solid rgba(28, 25, 23, 0.1);
  background: #fff;
  border-radius: 12px;
  padding: 0.45rem 0.4rem 0.5rem;
  text-align: left;
  cursor: default;
  position: relative;
  min-height: 72px;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.bp-path--interactive .bp-path__checkpoint {
  cursor: pointer;
}
.bp-path--interactive .bp-path__checkpoint:hover {
  transform: translateY(-1px);
  border-color: var(--cp-color, var(--forest));
  box-shadow: 0 8px 18px rgba(27, 67, 50, 0.08);
}
.bp-path__checkpoint.complete {
  border-left: 3px solid var(--cp-color, var(--forest));
}
.bp-path__checkpoint.active {
  outline: 2px solid var(--slate);
  outline-offset: 1px;
}
.bp-path__checkpoint.priority {
  background: rgba(161, 98, 7, 0.08);
}
.bp-path__checkpoint.empty {
  opacity: 0.72;
}
.bp-path__checkpoint.muted {
  opacity: 0.55;
}
.bp-path__checkpoint.over {
  background: rgba(185, 28, 28, 0.06);
}
.bp-path__checkpoint.avoid {
  background: rgba(69, 123, 157, 0.08);
}

.bp-path__cp-order {
  display: inline-flex;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 999px;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 700;
  background: rgba(27, 67, 50, 0.1);
  color: var(--forest);
}
.bp-path__cp-name {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.2;
}
.bp-path__cp-score {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--forest);
  font-family: Fraunces, Georgia, serif;
}

.bp-path__badge {
  position: absolute;
  top: 0.3rem;
  right: 0.35rem;
  font-size: 0.7rem;
  color: var(--bronze);
}
.bp-path__badge.warn {
  color: #b91c1c;
}
.bp-path__badge.avoid {
  color: var(--slate);
}

.bp-path__foundation {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.4rem;
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(27, 67, 50, 0.12);
}
.bp-path__foundation div {
  display: grid;
  gap: 0.15rem;
}
.bp-path__foundation span {
  font-size: 0.68rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.bp-path__foundation strong {
  font-size: 1rem;
  color: var(--forest);
}

.bp-path__list {
  margin: 0.75rem 0 0;
  padding: 0;
  list-style: none;
  display: none;
}
.bp-path--compact .bp-path__list {
  display: grid;
  gap: 0.35rem;
}
.bp-path__list li {
  font-size: 0.82rem;
  color: #44403c;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

@media (max-width: 720px) {
  .bp-path__foundation {
    grid-template-columns: repeat(2, 1fr);
  }
  .bp-path__checkpoints {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
