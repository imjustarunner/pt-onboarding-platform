<template>
  <div class="alib">
    <header class="alib__header">
      <h3>Activities</h3>
      <p class="alib__sub">Tools you can use during this session</p>
    </header>
    <div v-if="loading" class="alib__empty">Loading activities…</div>
    <div v-else-if="!embeddedActivities.length && !standaloneActivities.length" class="alib__empty">
      No activities are available right now.
    </div>
    <ul v-else class="alib__list">
      <li v-for="a in embeddedActivities" :key="a.id" class="alib__card">
        <div class="alib__card-body">
          <div class="alib__name">
            {{ a.displayName }}
            <span class="alib__badge" :class="badgeClass(a.status)">{{ statusLabel(a.status) }}</span>
          </div>
          <p class="alib__desc">{{ a.oneLineDescription }}</p>
          <div class="alib__meta">
            <span>{{ durationLabel(a) }}</span>
            <span>{{ platformLabel(a) }}</span>
          </div>
        </div>
        <button
          v-if="canLaunchEmbedded"
          type="button"
          class="alib__launch"
          @click="$emit('launch-embedded', a)"
        >
          Start
        </button>
      </li>
      <li v-for="a in standaloneActivities" :key="`s-${a.id}`" class="alib__card alib__card--standalone">
        <div class="alib__card-body">
          <div class="alib__name">
            {{ a.displayName }}
            <span class="alib__badge alib__badge--soft">Standalone</span>
          </div>
          <p class="alib__desc">{{ a.oneLineDescription }}</p>
        </div>
        <button type="button" class="alib__launch alib__launch--secondary" @click="$emit('launch-standalone', a)">
          Open
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { isEmbeddedLaunchable, isStandaloneLaunchable } from '../../services/launchActivity.js';

const props = defineProps({
  activities: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  canLaunchEmbedded: { type: Boolean, default: false }
});

defineEmits(['launch-embedded', 'launch-standalone']);

const embeddedActivities = computed(() =>
  props.activities.filter((a) => isEmbeddedLaunchable(a))
);
const standaloneActivities = computed(() =>
  props.activities.filter((a) => isStandaloneLaunchable(a) && !isEmbeddedLaunchable(a))
);

function statusLabel(status) {
  if (status === 'live_current') return 'Current';
  if (status === 'current_pilot') return 'Pilot';
  return status;
}

function badgeClass(status) {
  if (status === 'live_current') return 'alib__badge--current';
  if (status === 'current_pilot') return 'alib__badge--pilot';
  return '';
}

function durationLabel(a) {
  const min = a.estimatedDurationMinutes?.minimum;
  const max = a.estimatedDurationMinutes?.maximum;
  if (min && max) return `${min}–${max} min`;
  if (min) return `${min}+ min`;
  return '';
}

function platformLabel(a) {
  const p = a.platforms || [];
  if (p.includes('mobile') && p.includes('web')) return 'Mobile + Web';
  if (p.includes('mobile')) return 'Mobile';
  if (p.includes('web')) return 'Web';
  return '';
}
</script>

<style scoped>
.alib {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.alib__header h3 {
  margin: 0;
  font-size: 1rem;
}
.alib__sub {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: #64748b;
}
.alib__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.alib__card {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.75rem;
  background: #fff;
}
.alib__name {
  font-weight: 700;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}
.alib__badge {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  font-weight: 700;
}
.alib__badge--current {
  background: #dbeafe;
  color: #1d4ed8;
}
.alib__badge--pilot {
  background: #fef3c7;
  color: #b45309;
}
.alib__badge--soft {
  background: #f1f5f9;
  color: #475569;
}
.alib__desc {
  margin: 0.25rem 0;
  font-size: 0.85rem;
  color: #475569;
}
.alib__meta {
  display: flex;
  gap: 0.6rem;
  font-size: 0.75rem;
  color: #94a3b8;
}
.alib__launch {
  min-height: 44px;
  min-width: 72px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
.alib__launch--secondary {
  background: #334155;
}
.alib__empty {
  color: #64748b;
  font-size: 0.9rem;
  padding: 0.5rem 0;
}
</style>
