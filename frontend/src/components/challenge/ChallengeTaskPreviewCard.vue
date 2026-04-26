<template>
  <div class="task-preview-card" :style="accentStyle">
    <div class="tpc-header">
      <div class="tpc-icon-wrap">
        <img v-if="iconUrl" :src="iconUrl" class="tpc-icon-img" alt="" />
        <span v-else class="tpc-icon-emoji">{{ displayIcon }}</span>
      </div>
      <div class="tpc-header-copy">
        <p class="tpc-eyebrow">{{ eyebrow }}</p>
        <h3 class="tpc-title">{{ task.name || 'Untitled Task' }}</h3>
      </div>
      <div v-if="task.isSeasonLong" class="tpc-badge tpc-badge--season">Season-long</div>
    </div>

    <p v-if="task.description" class="tpc-description">{{ task.description }}</p>

    <div v-if="chips.length" class="tpc-chips">
      <span v-for="chip in chips" :key="chip.label" class="tpc-chip" :class="`tpc-chip--${chip.type}`">
        <span v-if="chip.icon" class="tpc-chip-icon">{{ chip.icon }}</span>
        {{ chip.label }}
      </span>
    </div>

    <div class="tpc-footer">
      <span class="tpc-mode-pill">{{ modeLabel }}</span>
      <span v-if="proofLabel" class="tpc-proof-pill">{{ proofLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  task: { type: Object, required: true },
  iconUrl: { type: String, default: null },
});

const ACTIVITY_ACCENT = {
  Run: '#2563eb', 'Trail Run': '#16a34a', Ruck: '#7c3aed', Walk: '#0891b2',
  Bike: '#d97706', Swim: '#0ea5e9', Fitness: '#dc2626', Other: '#64748b',
};

const displayIcon = computed(() => {
  if (props.task.icon && !String(props.task.icon).startsWith('icon:')) return props.task.icon;
  const actMap = { Run: '🏃', 'Trail Run': '🌲', Ruck: '🥾', Walk: '👟', Bike: '🚴', Swim: '🌊', Fitness: '💪' };
  return actMap[props.task.activityType] || '🏃';
});

const accentColor = computed(() => {
  const a = props.task.activityType || (props.task.criteriaJson?.activityTypes?.[0]) || '';
  return ACTIVITY_ACCENT[a] || '#2563eb';
});

const accentStyle = computed(() => ({
  '--tpc-accent': accentColor.value,
}));

const eyebrow = computed(() => {
  const parts = [];
  if (props.task.activityType) parts.push(props.task.activityType);
  const ct = props.task.criteriaJson?.challengeType;
  if (ct === 'race') parts.push('Race');
  else if (ct === 'once_per_season') parts.push('Once / Season');
  return parts.join(' · ') || 'Challenge';
});

const modeLabel = computed(() => {
  const map = { volunteer_or_elect: 'Volunteer / Elect', captain_assigns: 'Captain Assigns', full_team: 'Full Team' };
  return map[props.task.mode] || props.task.mode || '—';
});

const proofLabel = computed(() => {
  const map = {
    none: null, optional: 'Proof optional', required: 'Proof required',
    auto_approved: 'Auto-approved', manager_review: 'Manager review',
  };
  return map[props.task.proofPolicy] ?? null;
});

const chips = computed(() => {
  const c = props.task.criteriaJson || {};
  const result = [];

  const dist = c.distance?.minMiles;
  if (dist) result.push({ icon: '📏', label: `≥ ${dist} mi`, type: 'metric' });

  const dur = c.duration?.minMinutes;
  if (dur) result.push({ icon: '⏱', label: `≥ ${dur} min`, type: 'metric' });

  const pace = c.pace?.maxSecondsPerMile;
  if (pace) {
    const m = Math.floor(pace / 60);
    const s = String(Math.round(pace) % 60).padStart(2, '0');
    result.push({ icon: '⚡', label: `≤ ${m}:${s}/mi`, type: 'metric' });
  }

  const terrains = Array.isArray(c.terrain) ? c.terrain : [];
  if (terrains.length) result.push({ icon: '🗺', label: terrains.join(', '), type: 'terrain' });

  const acts = Array.isArray(c.activityTypes) ? c.activityTypes : [];
  if (acts.length && acts.length < 5) result.push({ icon: '🏷', label: acts.join(', '), type: 'activity' });

  if (c._splitRunEnabled) {
    const cnt = c.splitRuns?.count || 2;
    const mpr = c.splitRuns?.minMilesPerRun;
    const label = mpr ? `Split-run: ${cnt}× ≥ ${mpr} mi each` : `Split-run (${cnt}×)`;
    result.push({ icon: '✂️', label, type: 'info' });
  }

  const tod = c.timeOfDay;
  if (tod?.start && tod?.end) result.push({ icon: '🕐', label: `${tod.start}–${tod.end}`, type: 'info' });

  return result;
});
</script>

<style scoped>
.task-preview-card {
  --tpc-accent: #2563eb;
  width: 360px;
  max-width: 100%;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(15,23,42,.12), 0 1px 4px rgba(15,23,42,.06);
  overflow: hidden;
  font-family: inherit;
}

.tpc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 12px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--tpc-accent) 10%, #fff) 0%, #fff 100%);
  border-bottom: 2px solid var(--tpc-accent);
  position: relative;
}

.tpc-icon-wrap {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--tpc-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--tpc-accent) 40%, transparent);
}

.tpc-icon-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.tpc-icon-emoji {
  font-size: 1.6rem;
  line-height: 1;
}

.tpc-header-copy {
  flex: 1;
  min-width: 0;
}

.tpc-eyebrow {
  margin: 0 0 2px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--tpc-accent);
}

.tpc-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tpc-badge {
  position: absolute;
  top: 10px;
  right: 12px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .05em;
  padding: 2px 7px;
  border-radius: 999px;
  white-space: nowrap;
}

.tpc-badge--season {
  background: #fef9c3;
  color: #854d0e;
  border: 1px solid #fde68a;
}

.tpc-description {
  margin: 0;
  padding: 10px 16px;
  font-size: 0.82rem;
  color: #475569;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tpc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 16px 10px;
}

.tpc-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
}

.tpc-chip-icon {
  font-size: 0.7rem;
}

.tpc-chip--metric {
  background: color-mix(in srgb, var(--tpc-accent) 12%, #fff);
  color: var(--tpc-accent);
  border: 1px solid color-mix(in srgb, var(--tpc-accent) 25%, transparent);
}

.tpc-chip--terrain {
  background: #f0fdf4;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

.tpc-chip--activity {
  background: #faf5ff;
  color: #7e22ce;
  border: 1px solid #e9d5ff;
}

.tpc-chip--info {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.tpc-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 14px;
  border-top: 1px solid #f1f5f9;
}

.tpc-mode-pill,
.tpc-proof-pill {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}

.tpc-mode-pill {
  background: #f1f5f9;
  color: #334155;
}

.tpc-proof-pill {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}
</style>
