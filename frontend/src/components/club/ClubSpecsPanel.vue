<template>
  <div class="club-specs">
    <div class="panel-header">
      <div class="title">
        <h2>{{ title }}</h2>
        <p class="sub">Fitness totals and current season at a glance.</p>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <div v-else class="grid">
      <div class="metric">
        <div class="k">Total Miles</div>
        <div class="v">{{ formatNum(stats?.totalMiles) }}</div>
        <div class="hint">All activities (running, cycling, etc.)</div>
      </div>

      <div class="metric">
        <div class="k">Est. Calories Burned</div>
        <div class="v">{{ formatNum(stats?.estimatedCalories) }}</div>
        <div class="hint">Approximate from distance & duration</div>
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
        <router-link class="link" :to="orgTo('/admin/settings?category=workflow&item=challenge-management')">Challenge Management</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { getCached, setCached } from '../../utils/adminApiCache';

const props = defineProps({
  title: { type: String, default: 'Club Specs' },
  organizationId: { type: Number, default: null }
});

const route = useRoute();

const loading = ref(false);
const error = ref('');
const stats = ref(null);

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

.panel-header {
  margin-bottom: 18px;
}

.title h2 {
  margin: 0;
  color: var(--text-primary);
}

.sub {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
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

.metric {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  background: var(--bg-alt);
}

.metric-wide {
  grid-column: 1 / -1;
}

.k {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
  font-weight: 800;
  margin-bottom: 8px;
}

.v {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-primary);
}

.v.season-name {
  font-size: 20px;
}

.hint {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
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
</style>
