<template>
  <section class="challenge-rules">
    <h2>Season Rules & Details</h2>
    <div class="rules-content">
      <div v-if="challenge?.description" class="rules-description">
        {{ challenge.description }}
      </div>
      <div v-if="activityTypes?.length" class="rules-section">
        <strong>Activity types</strong>
        <p>{{ activityTypes.join(', ') }}</p>
      </div>
      <div v-if="scoringRules" class="rules-section">
        <strong>Scoring</strong>
        <p>{{ scoringSummary }}</p>
      </div>
      <div v-if="challenge?.weekly_goal_minimum" class="rules-section">
        <strong>Weekly goal</strong>
        <p>Minimum {{ challenge.weekly_goal_minimum }} {{ challenge.weekly_goal_minimum === 1 ? 'activity' : 'activities' }} per week</p>
      </div>
      <div v-if="challenge?.team_min_points_per_week != null" class="rules-section">
        <strong>Team minimum</strong>
        <p>{{ challenge.team_min_points_per_week }} points per week (team total)</p>
      </div>
      <div v-if="challenge?.individual_min_points_per_week != null" class="rules-section">
        <strong>Individual minimum</strong>
        <p>{{ challenge.individual_min_points_per_week }} points per week (each person)</p>
      </div>
      <div v-if="challenge?.starts_at || challenge?.ends_at" class="rules-section">
        <strong>Season period</strong>
        <p>{{ formatDates(challenge) }}</p>
      </div>
      <div v-if="!hasAnyRules" class="empty-hint">
        No rules configured yet. Contact your Program Manager for details.
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  challenge: { type: Object, default: null }
});

const activityTypes = computed(() => {
  const raw = props.challenge?.activity_types_json;
  if (Array.isArray(raw)) return raw.map((t) => String(t).replace(/_/g, ' '));
  if (typeof raw === 'object' && raw) return Object.keys(raw);
  return [];
});

const scoringRules = computed(() => {
  const raw = props.challenge?.scoring_rules_json;
  return raw && typeof raw === 'object' ? raw : null;
});

const scoringSummary = computed(() => {
  const r = scoringRules.value;
  if (!r) return null;
  if (typeof r === 'string') return r;
  const parts = [];
  if (Array.isArray(r)) {
    return r.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join('; ');
  }
  for (const [k, v] of Object.entries(r)) {
    parts.push(`${String(k).replace(/_/g, ' ')}: ${v}`);
  }
  return parts.length ? parts.join(' · ') : null;
});

const hasAnyRules = computed(() => {
  return (
    props.challenge?.description ||
    activityTypes.value?.length ||
    scoringSummary.value ||
    props.challenge?.weekly_goal_minimum ||
    props.challenge?.team_min_points_per_week != null ||
    props.challenge?.individual_min_points_per_week != null ||
    (props.challenge?.starts_at && props.challenge?.ends_at)
  );
});

const formatDates = (c) => {
  const start = c?.starts_at || c?.startsAt;
  const end = c?.ends_at || c?.endsAt;
  if (!start && !end) return '';
  const fmt = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `Starts ${fmt(start)}`;
  return `Ends ${fmt(end)}`;
};
</script>

<style scoped>
.challenge-rules h2 {
  margin: 0 0 12px 0;
  font-size: 1.1em;
}
.rules-content {
  padding: 12px 0;
}
.rules-description {
  margin-bottom: 12px;
  line-height: 1.5;
}
.rules-section {
  margin-bottom: 12px;
}
.rules-section strong {
  display: block;
  margin-bottom: 4px;
  font-size: 0.9em;
}
.rules-section p {
  margin: 0;
  font-size: 0.95em;
  color: var(--text-muted, #666);
}
.empty-hint {
  padding: 12px;
  color: var(--text-muted, #666);
}
</style>
