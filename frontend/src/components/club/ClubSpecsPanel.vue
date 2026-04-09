<template>
  <div class="specs-dual-wrap" :class="{ 'specs-dual-wrap--compact': props.compact }">

    <!-- ── LEFT: All-time Club Stats ─────────────────────────────── -->
    <div class="specs-panel specs-panel--left">
      <div class="panel-header">
        <h2>{{ title }}</h2>
        <p class="sub">All-time fitness totals for the club.</p>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <div v-else class="grid">
        <div class="metric">
          <div class="k">Total Miles</div>
          <div class="v">{{ formatNum(stats?.totalMiles) }}</div>
          <div class="hint">All activity types combined</div>
        </div>
        <div class="metric">
          <div class="k">Calories Burned</div>
          <div class="v">{{ formatNum(stats?.estimatedCalories) }}</div>
          <div class="hint">Actual from Strava · Estimated for manual</div>
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

        <!-- Per-activity breakdown -->
        <template v-if="hasActivityBreakdown">
          <div class="metric metric-wide metric-section-label">
            <div class="k">Miles by Activity</div>
          </div>
          <div v-if="stats.activityMiles.run > 0" class="metric metric-activity">
            <div class="activity-icon">🏃</div>
            <div class="activity-body">
              <div class="k">Run</div>
              <div class="v">{{ formatNum(stats.activityMiles.run) }} mi</div>
            </div>
          </div>
          <div v-if="stats.activityMiles.ruck > 0" class="metric metric-activity">
            <div class="activity-icon">🎒</div>
            <div class="activity-body">
              <div class="k">Ruck</div>
              <div class="v">{{ formatNum(stats.activityMiles.ruck) }} mi</div>
            </div>
          </div>
          <div v-if="stats.activityMiles.walk > 0" class="metric metric-activity">
            <div class="activity-icon">🚶</div>
            <div class="activity-body">
              <div class="k">Walk / Hike</div>
              <div class="v">{{ formatNum(stats.activityMiles.walk) }} mi</div>
            </div>
          </div>
          <div v-if="stats.activityMiles.cycling > 0" class="metric metric-activity">
            <div class="activity-icon">🚴</div>
            <div class="activity-body">
              <div class="k">Cycling</div>
              <div class="v">{{ formatNum(stats.activityMiles.cycling) }} mi</div>
            </div>
          </div>
          <div v-if="stats.activityMiles.steps > 0" class="metric metric-activity">
            <div class="activity-icon">👟</div>
            <div class="activity-body">
              <div class="k">Steps</div>
              <div class="v">{{ formatNum(stats.activityMiles.steps) }} mi</div>
            </div>
          </div>
          <div v-if="stats.activityMiles.other > 0" class="metric metric-activity">
            <div class="activity-icon">💪</div>
            <div class="activity-body">
              <div class="k">Other</div>
              <div class="v">{{ formatNum(stats.activityMiles.other) }} mi</div>
            </div>
          </div>
        </template>
      </div>

      <div class="footer">
        <div class="meta">
          <span v-if="stats?.refreshedAt">Updated {{ formatDateTime(stats.refreshedAt) }}</span>
        </div>
        <div class="links">
          <router-link class="link" :to="orgTo('/admin/settings?category=workflow&item=challenge-management')">Seasons &amp; challenges</router-link>
        </div>
      </div>
    </div>

    <!-- ── RIGHT: Current Season Stats ───────────────────────────── -->
    <div class="specs-panel specs-panel--right">
      <div class="panel-header">
        <h2>Current Season</h2>
        <p class="sub">Live stats for the active season.</p>
      </div>

      <div v-if="loading" class="loading">Loading…</div>

      <div v-else-if="stats?.currentSeason" class="season-card">
        <div class="season-name">{{ stats.currentSeason.name }}</div>
        <div class="season-stats-grid">
          <div class="season-stat">
            <div class="season-stat-val">{{ stats.currentSeason.participants }}</div>
            <div class="season-stat-label">Participants</div>
          </div>
          <div class="season-stat">
            <div class="season-stat-val">{{ stats.currentSeason.teams }}</div>
            <div class="season-stat-label">Teams</div>
          </div>
          <div class="season-stat">
            <div class="season-stat-val">{{ stats.currentSeason.workouts }}</div>
            <div class="season-stat-label">Workouts</div>
          </div>
        </div>
        <router-link
          v-if="stats.currentSeason.id"
          :to="orgTo(`/season/${stats.currentSeason.id}`)"
          class="season-goto-btn"
        >Open Season Dashboard →</router-link>
      </div>

      <div v-else-if="!loading" class="season-empty">
        <span class="season-empty-icon">🏁</span>
        <p>No active season yet.</p>
        <router-link class="link" :to="orgTo('/admin/settings?category=workflow&item=challenge-management')">Create a season</router-link>
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
/* ── Two-column wrapper ─────────────────────────────────────── */
.specs-dual-wrap {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 20px;
  align-items: start;
}
.specs-dual-wrap--compact {
  gap: 12px;
}
@media (max-width: 900px) {
  .specs-dual-wrap { grid-template-columns: 1fr; }
}

/* ── Shared panel shell ─────────────────────────────────────── */
.specs-panel {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}
.specs-dual-wrap--compact .specs-panel {
  padding: 14px;
}

/* ── Panel header ──────────────────────────────────────────── */
.panel-header {
  margin-bottom: 16px;
}
.panel-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.15rem;
}
.specs-dual-wrap--compact .panel-header h2 { font-size: 1rem; }
.sub {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}

/* ── Metrics grid (left panel) ─────────────────────────────── */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
}
.metric {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  background: var(--bg-alt);
}
.metric-wide { grid-column: 1 / -1; }
.metric-section-label {
  background: transparent;
  border-color: transparent;
  padding: 4px 0 0;
}
.metric-section-label .k {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
  padding-bottom: 5px;
  margin-bottom: 0;
}
.metric-activity {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
}
.activity-icon { font-size: 22px; flex-shrink: 0; }
.activity-body { flex: 1; min-width: 0; }
.activity-body .k { margin-bottom: 1px; }
.activity-body .v { font-size: 18px; }

.k {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  font-weight: 800;
  margin-bottom: 6px;
}
.v {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
}
.hint {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 11px;
}

/* ── Footer ───────────────────────────────────────────────── */
.footer {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.meta { color: var(--text-secondary); font-size: 11px; }
.links { display: flex; gap: 10px; flex-wrap: wrap; }
.link { text-decoration: none; color: var(--primary); font-weight: 700; font-size: 12px; }
.link:hover { text-decoration: underline; }

/* ── Right panel – current season ─────────────────────────── */
.specs-panel--right {
  display: flex;
  flex-direction: column;
}
.season-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.season-name {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.2;
}
.season-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.season-stat {
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 8px;
  text-align: center;
}
.season-stat-val {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}
.season-stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  font-weight: 700;
  margin-top: 4px;
}
.season-goto-btn {
  display: block;
  background: var(--primary-color, #2563eb);
  color: white;
  text-decoration: none;
  text-align: center;
  font-weight: 700;
  font-size: 0.87rem;
  padding: 10px 16px;
  border-radius: 8px;
  transition: opacity 0.15s;
  margin-top: 4px;
}
.season-goto-btn:hover { opacity: 0.88; }
.season-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  padding: 24px 0;
  color: var(--text-secondary);
  text-align: center;
}
.season-empty-icon { font-size: 2rem; }
.season-empty p { margin: 0; font-size: 0.9rem; }

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
</style>
