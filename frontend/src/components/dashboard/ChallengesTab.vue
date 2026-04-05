<template>
  <div class="challenges-tab">
    <div class="challenges-header">
      <div>
        <h2>Learning Progress</h2>
        <p class="hint">Open your learning classes to run group sessions, present slides/documents, and track standards-linked evidence.</p>
      </div>
      <router-link v-if="challenges.length" :to="challengesOverviewRoute" class="btn btn-secondary btn-sm">
        View class dashboard
      </router-link>
    </div>
    <div class="learning-progress-card">
      <div class="learning-progress-kpis">
        <div class="kpi"><strong>{{ challenges.length }}</strong><span>Classes</span></div>
        <div class="kpi"><strong>{{ activeCount }}</strong><span>Active</span></div>
        <div class="kpi"><strong>{{ groupCount }}</strong><span>Group mode</span></div>
      </div>
      <router-link v-if="firstWorkspaceRoute" :to="firstWorkspaceRoute" class="btn btn-primary btn-sm">
        Open class workspace
      </router-link>
    </div>
    <div v-if="loading" class="loading">Loading seasons…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!challenges.length" class="empty-state">
      <p>You have no assigned seasons yet. Contact your Program Manager to join a season.</p>
    </div>
    <div v-else class="challenges-list">
      <router-link
        v-for="c in challenges"
        :key="c.id"
        :to="challengeRoute(c)"
        class="challenge-card"
      >
        <div class="challenge-card-header">
          <span class="challenge-name">{{ c.class_name || c.className }}</span>
          <span class="challenge-status" :class="statusClass(c)">{{ formatStatus(c) }}</span>
        </div>
        <div v-if="c.organization_name" class="challenge-org hint">{{ c.organization_name }}</div>
        <div v-if="c.starts_at || c.ends_at" class="challenge-dates hint">
          {{ formatDates(c) }}
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';

const router = useRouter();
const challenges = ref([]);
const challengesOverviewRoute = computed(() => {
  const c = challenges.value?.[0];
  const slug = c?.organization_slug || c?.organizationSlug || null;
  return slug ? `/${slug}/home` : `/${String(import.meta.env.VITE_NATIVE_APP_ORG_SLUG || 'ssc').trim().toLowerCase()}/home`;
});
const loading = ref(true);
const error = ref(null);
const activeCount = computed(() => challenges.value.filter((c) => String(c.status || '').toLowerCase() === 'active').length);
const groupCount = computed(() =>
  challenges.value.filter((c) => String(c.delivery_mode || c.deliveryMode || 'group').toLowerCase() === 'group').length
);
const firstWorkspaceRoute = computed(() => {
  const row = challenges.value.find((c) => String(c.delivery_mode || c.deliveryMode || 'group').toLowerCase() === 'group');
  if (!row?.id) return null;
  const slug = row.organization_slug || row.organizationSlug;
  return slug ? `/${slug}/learning/classes/${row.id}` : `/learning/classes/${row.id}`;
});

const loadChallenges = async () => {
  loading.value = true;
  error.value = null;
  try {
    const r = await api.get('/learning-program-classes/my', { skipGlobalLoading: true });
    challenges.value = Array.isArray(r.data?.classes) ? r.data.classes : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load seasons';
    challenges.value = [];
  } finally {
    loading.value = false;
  }
};

const formatStatus = (c) => {
  const s = String(c.status || '').toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'draft') return 'Draft';
  if (s === 'closed') return 'Closed';
  if (s === 'archived') return 'Archived';
  return s || '—';
};

const statusClass = (c) => {
  const s = String(c.status || '').toLowerCase();
  if (s === 'active') return 'status-active';
  if (s === 'closed') return 'status-closed';
  return '';
};

const formatDates = (c) => {
  const start = c.starts_at || c.startsAt;
  const end = c.ends_at || c.endsAt;
  if (!start && !end) return '';
  const fmt = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `Starts ${fmt(start)}`;
  return `Ends ${fmt(end)}`;
};

const challengeRoute = (c) => {
  const id = c.id;
  const slug = c.organization_slug || c.organizationSlug;
  const mode = String(c.delivery_mode || c.deliveryMode || 'group').toLowerCase();
  if (mode === 'group') return slug ? `/${slug}/learning/classes/${id}` : `/learning/classes/${id}`;
  if (slug) return `/${slug}/season/${id}`;
  return `/${String(import.meta.env.VITE_NATIVE_APP_ORG_SLUG || 'ssc').trim().toLowerCase()}/season/${id}`;
};

onMounted(loadChallenges);
</script>

<style scoped>
.challenges-tab {
  padding: 0;
}
.challenges-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.challenges-tab h2 {
  margin: 0 0 8px 0;
}
.challenges-tab .hint {
  margin: 0 0 16px 0;
  color: var(--text-muted, #666);
}
.challenges-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.learning-progress-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.learning-progress-kpis {
  display: flex;
  gap: 16px;
}
.kpi {
  display: grid;
  gap: 2px;
}
.kpi span {
  color: var(--text-muted, #666);
  font-size: 0.82em;
}
.challenge-card {
  display: block;
  padding: 16px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: background 0.15s, border-color 0.15s;
}
.challenge-card:hover {
  background: var(--hover-bg, #f8f9fa);
  border-color: var(--border-hover, #bbb);
}
.challenge-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.challenge-name {
  font-weight: 600;
  font-size: 1.05em;
}
.challenge-status {
  font-size: 0.85em;
  padding: 2px 8px;
  border-radius: 4px;
}
.challenge-status.status-active {
  background: #e8f5e9;
  color: #2e7d32;
}
.challenge-status.status-closed {
  background: #f5f5f5;
  color: #666;
}
.challenge-org,
.challenge-dates {
  margin-top: 6px;
  font-size: 0.9em;
}
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-muted, #666);
}
</style>
