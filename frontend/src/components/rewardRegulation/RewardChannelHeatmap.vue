<template>
  <div class="rr-heat" role="img" :aria-label="ariaLabel">
    <header class="rr-heat__head">
      <div>
        <p class="rr-heat__eyebrow">Reward Channel Heatmap</p>
        <h3 class="rr-heat__title">{{ title }}</h3>
      </div>
      <div v-if="channelImpactIndex != null" class="rr-heat__score">
        <span class="rr-heat__score-n">{{ channelImpactIndex }}</span>
        <span class="rr-heat__score-l">Impact</span>
      </div>
    </header>

    <p class="rr-heat__note">
      Impact Index is separate from Reward Regulation Score. Unselected channels never zero your core score.
    </p>

    <div v-if="!rows.length" class="rr-heat__empty">
      Select relevant channels in the inventory to populate this heatmap.
    </div>

    <div v-else class="rr-heat__grid">
      <button
        v-for="row in rows"
        :key="row.channelKey"
        type="button"
        class="rr-heat__cell"
        :class="{ sensitive: row.isSensitive, active: row.channelKey === activeChannelKey }"
        :style="cellStyle(row)"
        @click="emit('channel-select', row.channelKey)"
      >
        <span class="rr-heat__label">{{ row.shortLabel || row.label }}</span>
        <strong class="rr-heat__pull">{{ row.pullStrengthScore ?? '—' }}</strong>
        <span class="rr-heat__meta">
          <em v-if="row.costScore != null">cost {{ row.costScore }}</em>
          <em v-if="row.classification">{{ classificationLabel(row.classification) }}</em>
        </span>
        <span v-if="row.isSensitive && row.isPrivate !== false" class="rr-heat__private">Private</span>
      </button>
    </div>

    <p v-if="impactLabel" class="rr-heat__impact">{{ impactLabel }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { channelImpactLabel, classifyChannel } from '../../utils/rewardRegulation.js';

const props = defineProps({
  title: { type: String, default: 'What captures attention' },
  channels: { type: Array, default: () => [] },
  channelImpactIndex: { type: Number, default: null },
  activeChannelKey: { type: String, default: '' }
});

const emit = defineEmits(['channel-select']);

const rows = computed(() =>
  (props.channels || [])
    .filter((c) => c && c.isRelevant !== false && !c.preferNotToAnswer)
    .map((c) => ({
      ...c,
      classification: c.classification || classifyChannel(c)
    }))
    .sort((a, b) => (b.pullStrengthScore || 0) - (a.pullStrengthScore || 0))
);

const impactLabel = computed(
  () => channelImpactLabel(props.channelImpactIndex) || props.channels?.[0]?.impactLabel || ''
);

function heatColor(pull, cost) {
  const p = Math.max(0, Math.min(10, Number(pull) || 0));
  const c = Math.max(0, Math.min(10, Number(cost) || p));
  const t = (p * 0.65 + c * 0.35) / 10;
  // charcoal → muted amber → violet for high capture
  const r = Math.round(30 + t * 140);
  const g = Math.round(40 + t * 40);
  const b = Math.round(55 + t * 120);
  return `rgba(${r}, ${g}, ${b}, ${0.35 + t * 0.45})`;
}

function cellStyle(row) {
  return {
    background: heatColor(row.pullStrengthScore, row.costScore),
    borderColor: row.color || 'rgba(212, 165, 116, 0.25)'
  };
}

function classificationLabel(id) {
  const map = {
    'high-cost-capture': 'High cost',
    'valuable-and-managed': 'Managed value',
    'low-choice-pull': 'Low choice',
    'low-value-pull': 'Low value',
    'strong-pull': 'Strong pull',
    moderate: 'Moderate'
  };
  return map[id] || id;
}

const ariaLabel = computed(
  () =>
    `Reward Channel Heatmap. Impact index ${props.channelImpactIndex ?? 'unavailable'}. ${rows.value.length} channels.`
);
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Source+Sans+3:wght@400;500;600;700&display=swap');

.rr-heat {
  --ink: #e8eef6;
  --muted: #9aa8ba;
  --amber: #d4a574;
  --violet: #a78bfa;
  background: linear-gradient(165deg, #141c28 0%, #0c1219 100%);
  border: 1px solid rgba(167, 139, 250, 0.22);
  border-radius: 18px;
  padding: 1rem;
  color: var(--ink);
  font-family: 'Source Sans 3', system-ui, sans-serif;
}
.rr-heat__head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}
.rr-heat__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--violet);
  font-weight: 700;
}
.rr-heat__title {
  margin: 0.2rem 0 0;
  font-family: Syne, system-ui, sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
}
.rr-heat__score-n {
  font-family: Syne, system-ui, sans-serif;
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--violet);
}
.rr-heat__score-l {
  display: block;
  font-size: 0.72rem;
  color: var(--muted);
  text-align: right;
}
.rr-heat__note {
  margin: 0.65rem 0 0.85rem;
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.45;
}
.rr-heat__empty {
  padding: 1.25rem;
  text-align: center;
  color: var(--muted);
  font-size: 0.9rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
}
.rr-heat__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.55rem;
}
.rr-heat__cell {
  appearance: none;
  text-align: left;
  border: 1px solid rgba(212, 165, 116, 0.25);
  border-radius: 12px;
  padding: 0.7rem 0.75rem;
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  position: relative;
  min-height: 88px;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.rr-heat__cell:hover,
.rr-heat__cell.active {
  transform: translateY(-1px);
  border-color: var(--amber);
}
.rr-heat__cell.sensitive {
  border-style: dashed;
}
.rr-heat__label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.rr-heat__pull {
  font-family: Syne, system-ui, sans-serif;
  font-size: 1.35rem;
  font-weight: 800;
}
.rr-heat__meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin-top: 0.2rem;
  font-size: 0.7rem;
  color: var(--muted);
  font-style: normal;
}
.rr-heat__meta em {
  font-style: normal;
}
.rr-heat__private {
  position: absolute;
  top: 0.4rem;
  right: 0.45rem;
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--violet);
  font-weight: 700;
}
.rr-heat__impact {
  margin: 0.85rem 0 0;
  text-align: center;
  font-size: 0.82rem;
  color: var(--violet);
  font-weight: 600;
}
</style>
