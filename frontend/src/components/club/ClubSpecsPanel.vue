<template>
  <div class="club-specs" :class="{ 'club-specs--compact': props.compact }">
    <div class="panel-header">
      <div class="title">
        <h2>{{ title }}</h2>
        <p class="sub">Fitness totals and current season at a glance.</p>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="grid">

      <!-- ── Summary row ──────────────────────────────────────────── -->
      <div class="metric">
        <div class="k">Total Miles</div>
        <div class="v">{{ formatNum(stats?.totalMiles) }}</div>
        <div class="hint">All activity types combined</div>
      </div>

      <div class="metric">
        <div class="k">Calories Burned</div>
        <div class="v">{{ formatNum(stats?.estimatedCalories) }}</div>
        <div class="hint">Actual from Strava · Standardised est. for manual workouts</div>
      </div>

      <div class="metric">
        <div class="k">Total Points</div>
        <div class="v">{{ formatNum(stats?.totalPoints) }}</div>
        <div class="hint">All-time challenge points</div>
      </div>

      <div class="metric">
        <div class="k">Total Workouts</div>
        <div class="v">{{ formatNum(stats?.totalWorkouts) }}</div>
        <div class="hint">Workouts logged</div>
      </div>

      <!-- ── Per-activity mile breakdown (only shows non-zero buckets) ── -->
      <template v-if="hasActivityBreakdown">
        <div class="metric metric-wide metric-section-label">
          <div class="k">Miles by Activity</div>
        </div>

        <div v-if="stats.activityMiles.run > 0" class="metric metric-activity">
          <div class="activity-icon">🏃</div>
          <div class="activity-body">
            <div class="k">Run Miles</div>
            <div class="v">{{ formatNum(stats.activityMiles.run) }}</div>
          </div>
        </div>

        <div v-if="stats.activityMiles.ruck > 0" class="metric metric-activity">
          <div class="activity-icon">🎒</div>
          <div class="activity-body">
            <div class="k">Ruck Miles</div>
            <div class="v">{{ formatNum(stats.activityMiles.ruck) }}</div>
          </div>
        </div>

        <div v-if="stats.activityMiles.walk > 0" class="metric metric-activity">
          <div class="activity-icon">🚶</div>
          <div class="activity-body">
            <div class="k">Walk / Hike Miles</div>
            <div class="v">{{ formatNum(stats.activityMiles.walk) }}</div>
          </div>
        </div>

        <div v-if="stats.activityMiles.cycling > 0" class="metric metric-activity">
          <div class="activity-icon">🚴</div>
          <div class="activity-body">
            <div class="k">Cycling Miles</div>
            <div class="v">{{ formatNum(stats.activityMiles.cycling) }}</div>
          </div>
        </div>

        <div v-if="stats.activityMiles.steps > 0" class="metric metric-activity">
          <div class="activity-icon">👟</div>
          <div class="activity-body">
            <div class="k">Steps Miles</div>
            <div class="v">{{ formatNum(stats.activityMiles.steps) }}</div>
          </div>
        </div>

        <div v-if="stats.activityMiles.other > 0" class="metric metric-activity">
          <div class="activity-icon">💪</div>
          <div class="activity-body">
            <div class="k">Other Miles</div>
            <div class="v">{{ formatNum(stats.activityMiles.other) }}</div>
          </div>
        </div>
      </template>

      <!-- ── Current season strip ─────────────────────────────────── -->
      <template v-if="stats?.currentSeason">
        <div class="metric metric-wide">
          <div class="k">Current Season</div>
          <div class="v season-name">{{ stats.currentSeason.name }}</div>
          <div class="hint season-details">
            {{ stats.currentSeason.participants }} participants ·
            {{ stats.currentSeason.teams }} teams ·
            {{ stats.currentSeason.workouts }} workouts
          </div>
        </div>
      </template>
    </div>

    <div class="footer">
      <div class="meta">
        <span v-if="stats?.refreshedAt">Updated {{ formatDateTime(stats.refreshedAt) }}</span>
      </div>
      <div class="links">
        <router-link class="link" :to="orgTo('/admin/settings?category=workflow&item=challenge-management')">Seasons & weekly challenges</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { getCached, setCached } from '../../utils/adminApiCache';

const props = defineProps({
  title: { type: String, default: 'Club Specs' },
  organizationId: { type: Number, default: null },
  compact: { type: Boolean, default: false }
});

const route = useRoute();

const loading = ref(false);
const error = ref('');
const stats = ref(null);

const hasActivityBreakdown = computed(() => {
  const am = stats.value?.activityMiles;
  if (!am) return false;
  return Object.values(am).some((v) => Number(v) > 0);
});

const formatNum = (v) => {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toLocaleString() : '0';
};

const formatDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '';
  }
};

const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

const fetchSpecs = async () => {
  const id = props.organizationId;
  if (!id) {
    stats.value = null;
    return;
  }
  const url = '/summit-stats/club-specs';
  const params = { agencyId: id };
  const cached = getCached(url, params);
  if (cached) {
    stats.value = cached;
    loading.value = false;
    error.value = '';
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(url, { params });
    const data = resp.data || null;
    stats.value = data;
    setCached(url, params, data);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load club specs';
    stats.value = null;
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.organizationId,
  () => {
    fetchSpecs();
  },
  { immediate: true }
);
</script>

<style scoped>
.club-specs {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

.club-specs--compact {
  padding: 14px;
  border-radius: 10px;
}

.panel-header {
  margin-bottom: 18px;
}

.club-specs--compact .panel-header {
  margin-bottom: 10px;
}

.title h2 {
  margin: 0;
  color: var(--text-primary);
}

.club-specs--compact .title h2 {
  font-size: 1rem;
}

.sub {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.club-specs--compact .sub {
  margin-top: 3px;
  font-size: 12px;
}

.loading {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary);
}

.error {
  text-align: center;
  padding: 14px;
  color: #dc3545;
  background: #f8d7da;
  border-radius: 10px;
  border: 1px solid #f5c6cb;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
}

.club-specs--compact .grid {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}

.metric {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  background: var(--bg-alt);
}

.club-specs--compact .metric {
  border-radius: 10px;
  padding: 10px;
}

.metric-wide {
  grid-column: 1 / -1;
}

/* ── Activity breakdown section label ──────────────────────── */
.metric-section-label {
  background: transparent;
  border-color: transparent;
  padding: 4px 0 0;
}
.metric-section-label .k {
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--text-primary);
  font-weight: 800;
  border-bottom: 2px solid var(--border);
  padding-bottom: 6px;
  margin-bottom: 0;
}

/* ── Per-activity metric card ──────────────────────────────── */
.metric-activity {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}
.club-specs--compact .metric-activity {
  padding: 8px 10px;
  gap: 8px;
}
.activity-icon {
  font-size: 26px;
  line-height: 1;
  flex-shrink: 0;
}
.club-specs--compact .activity-icon {
  font-size: 20px;
}
.activity-body {
  flex: 1;
  min-width: 0;
}
.activity-body .k {
  margin-bottom: 2px;
}
.activity-body .v {
  font-size: 22px;
}
.club-specs--compact .activity-body .v {
  font-size: 18px;
}

.k {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  font-weight: 800;
  margin-bottom: 8px;
}

.club-specs--compact .k {
  margin-bottom: 4px;
  font-size: 10px;
}

.v {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
}

.club-specs--compact .v {
  font-size: 22px;
}

.v.season-name {
  font-size: 20px;
}

.club-specs--compact .v.season-name {
  font-size: 16px;
}

.hint {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}

.club-specs--compact .hint {
  margin-top: 4px;
  font-size: 11px;
}

.season-details {
  margin-top: 4px;
}

.footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

.club-specs--compact .footer {
  margin-top: 10px;
  padding-top: 8px;
}

.meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.links {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.link {
  text-decoration: none;
  color: var(--primary);
  font-weight: 700;
  font-size: 13px;
}

.link:hover {
  text-decoration: underline;
}

@media (max-width: 768px) {
  .club-specs {
    padding: 14px;
    border-radius: 10px;
  }

  .panel-header {
    margin-bottom: 12px;
  }

  .title h2 {
    font-size: 1.6rem;
    line-height: 1.1;
  }

  .sub {
    font-size: 12px;
    margin-top: 4px;
  }

  .grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .metric {
    padding: 12px;
    border-radius: 10px;
  }

  .k {
    font-size: 11px;
    margin-bottom: 6px;
  }

  .v {
    font-size: 24px;
    line-height: 1.1;
  }

  .v.season-name {
    font-size: 18px;
  }

  .hint {
    margin-top: 6px;
    font-size: 11px;
    line-height: 1.25;
  }

  .footer {
    margin-top: 12px;
    padding-top: 10px;
    gap: 8px;
  }

  .link {
    font-size: 12px;
  }
}
</style>
