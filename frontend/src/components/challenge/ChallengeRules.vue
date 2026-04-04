<template>
  <section class="challenge-rules">
    <h2>Season Rules & Details</h2>
    <div class="rules-content">
      <div v-if="challenge?.description" class="rules-description">
        {{ challenge.description }}
      </div>
      <div v-if="selectedAgreement" class="rules-section agreement-section">
        <div class="agreement-header">
          <div>
            <strong>{{ selectedAgreement.label || 'Season Guidelines' }}</strong>
            <p v-if="selectedAgreementMeta" class="agreement-meta">{{ selectedAgreementMeta }}</p>
          </div>
          <div v-if="agreementOptions.length > 1" class="agreement-picker">
            <label for="season-guideline-picker">Season set</label>
            <select id="season-guideline-picker" v-model="selectedAgreementKey">
              <option v-for="option in agreementOptions" :key="option.key" :value="option.key">
                {{ formatAgreementOption(option) }}
              </option>
            </select>
          </div>
        </div>
        <p v-if="selectedAgreement.introText" class="agreement-intro">{{ selectedAgreement.introText }}</p>
        <ul v-if="selectedAgreement.items.length" class="agreement-list">
          <li v-for="item in selectedAgreement.items" :key="item">{{ item }}</li>
        </ul>
        <p class="agreement-note">
          Joining this season and submitting workouts, posts, photos, reactions, or comments means members agree to follow
          these expectations. Managers may reject uploads or limit participation when they are ignored.
        </p>
        <p v-if="agreementOptions.length > 1" class="agreement-archive-note">
          Reused rule sets appear once under the most recent season that used them.
        </p>
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
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import {
  collectUniqueParticipationAgreementSnapshots,
  formatParticipationAgreementSeasonLabel,
  getSeasonParticipationAgreementSnapshot
} from '../../utils/seasonParticipationAgreement.js';

const props = defineProps({
  challenge: { type: Object, default: null }
});

const agreementOptions = ref([]);
const selectedAgreementKey = ref('');

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

const currentAgreementSnapshot = computed(() => getSeasonParticipationAgreementSnapshot(props.challenge));

const selectedAgreementSnapshot = computed(() => {
  const match = agreementOptions.value.find((option) => option.key === selectedAgreementKey.value);
  if (match) return match;
  return currentAgreementSnapshot.value;
});

const selectedAgreement = computed(() => selectedAgreementSnapshot.value?.agreement || null);

const selectedAgreementMeta = computed(() => {
  const snapshot = selectedAgreementSnapshot.value;
  if (!snapshot) return '';
  const seasonTitle = snapshot.seasonTitle || 'Untitled season';
  const start = snapshot.startsAt
    ? new Date(snapshot.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  return start ? `${seasonTitle} • Starts ${start}` : seasonTitle;
});

const hasAnyRules = computed(() => {
  return (
    props.challenge?.description ||
    selectedAgreement.value ||
    activityTypes.value?.length ||
    scoringSummary.value ||
    props.challenge?.weekly_goal_minimum ||
    props.challenge?.team_min_points_per_week != null ||
    props.challenge?.individual_min_points_per_week != null ||
    (props.challenge?.starts_at && props.challenge?.ends_at)
  );
});

const loadAgreementHistory = async () => {
  const organizationId = Number(props.challenge?.organization_id || 0);
  if (!organizationId) {
    agreementOptions.value = currentAgreementSnapshot.value ? [currentAgreementSnapshot.value] : [];
    selectedAgreementKey.value = currentAgreementSnapshot.value?.key || '';
    return;
  }
  try {
    const response = await api.get('/learning-program-classes', {
      params: { organizationId, includeArchived: true },
      skipGlobalLoading: true
    });
    const seasons = Array.isArray(response.data?.classes) ? response.data.classes : [];
    agreementOptions.value = collectUniqueParticipationAgreementSnapshots(seasons);
  } catch {
    agreementOptions.value = currentAgreementSnapshot.value ? [currentAgreementSnapshot.value] : [];
  }

  if (currentAgreementSnapshot.value?.key) {
    const hasCurrent = agreementOptions.value.some((option) => option.key === currentAgreementSnapshot.value.key);
    if (!hasCurrent) agreementOptions.value = [currentAgreementSnapshot.value, ...agreementOptions.value];
    selectedAgreementKey.value = currentAgreementSnapshot.value.key;
    return;
  }
  selectedAgreementKey.value = agreementOptions.value[0]?.key || '';
};

watch(
  () => [props.challenge?.id, props.challenge?.organization_id, props.challenge?.season_settings_json],
  () => {
    loadAgreementHistory();
  },
  { immediate: true }
);

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

const formatAgreementOption = (option) => formatParticipationAgreementSeasonLabel(option);
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

.agreement-section {
  padding: 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: #f8fafc;
}

.agreement-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 10px;
}

.agreement-picker {
  min-width: 220px;
}

.agreement-picker label {
  display: block;
  margin-bottom: 4px;
  font-size: 0.78em;
  font-weight: 600;
  color: var(--text-muted, #666);
}

.agreement-picker select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border, #cbd5e1);
  border-radius: 8px;
  background: white;
  font-size: 0.9em;
}

.agreement-meta {
  margin-top: 2px;
  font-size: 0.82em;
  color: var(--text-muted, #666);
}

.agreement-intro {
  margin-bottom: 10px !important;
  line-height: 1.5;
}

.agreement-list {
  margin: 0 0 10px 18px;
  padding: 0;
  color: var(--text-primary, #111827);
}

.agreement-list li {
  margin-bottom: 6px;
  line-height: 1.45;
}

.agreement-note,
.agreement-archive-note {
  font-size: 0.85em !important;
  color: var(--text-muted, #64748b) !important;
}

.agreement-archive-note {
  margin-top: 8px !important;
}

.empty-hint {
  padding: 12px;
  color: var(--text-muted, #666);
}

@media (max-width: 720px) {
  .agreement-header {
    flex-direction: column;
  }

  .agreement-picker {
    width: 100%;
    min-width: 0;
  }
}
</style>
