<template>
  <div class="summit-stats-dashboard">
    <div class="dashboard-header">
      <h1>Challenges</h1>
      <p class="subtitle">Your fitness challenges, teams, and progress.</p>
    </div>

    <!-- Create Club (scoped admin with no clubs) -->
    <div v-if="clubContextLoading" class="create-club-section loading">Loading…</div>
    <div v-else-if="clubContext?.summitStatsScopedAdmin" class="create-club-section">
      <div v-if="!clubContext?.emailVerified" class="create-club-card create-club-verify">
        <h3>Verify your email</h3>
        <p>Please verify your email before creating your club. Check your inbox for the verification link.</p>
        <p class="hint">Didn't receive the email? Go to <router-link :to="organizationSlug ? `/${organizationSlug}/admin` : '/admin'">Admin</router-link> and click "Resend."</p>
      </div>
      <div v-else class="create-club-card">
        <h3>Create your club</h3>
        <p>You're all set. Create your first club to get started.</p>
        <form v-if="!createClubSuccess" @submit.prevent="submitCreateClub" class="create-club-form">
          <input v-model="createClubName" type="text" placeholder="Club name" required class="create-club-input" />
          <button type="submit" :disabled="createClubSubmitting" class="create-club-btn">
            {{ createClubSubmitting ? 'Creating…' : 'Create Club' }}
          </button>
        </form>
        <p v-else class="create-club-success">Club created. Refreshing…</p>
      </div>
    </div>

    <!-- Personal stats -->
    <div v-if="summary" class="stats-strip">
      <div class="stat-card">
        <span class="stat-value">{{ summary.totalPoints }}</span>
        <span class="stat-label">Total Points</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ summary.workoutCount }}</span>
        <span class="stat-label">Workouts</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ summary.teams?.length || 0 }}</span>
        <span class="stat-label">Teams</span>
      </div>
    </div>

    <!-- Club Store link (when we have an org) -->
    <div v-if="organizationId" class="club-store-section">
      <router-link :to="`/club-store/${organizationId}`" class="club-store-link">View Club Store</router-link>
    </div>

    <!-- Challenges by affiliation/org -->
    <div class="challenges-section">
      <h2>My Challenges</h2>
      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="!challenges.length" class="empty-state">
        <p>You have no assigned challenges. Contact your Program Manager to join.</p>
      </div>
      <div v-else class="challenges-grid">
        <div v-for="c in challenges" :key="c.id" class="challenge-card-wrapper">
          <router-link :to="challengeRoute(c)" class="challenge-card">
            <div class="challenge-card-header">
              <span class="challenge-name">{{ c.class_name || c.className }}</span>
              <span class="challenge-status" :class="statusClass(c)">{{ formatStatus(c) }}</span>
            </div>
            <div v-if="c.organization_name" class="challenge-org hint">{{ c.organization_name }}</div>
            <div v-if="c.starts_at || c.ends_at" class="challenge-dates hint">{{ formatDates(c) }}</div>
            <div v-if="getTeamForChallenge(c.id)" class="challenge-team">Team: {{ getTeamForChallenge(c.id) }}</div>
          </router-link>
          <router-link :to="challengeRoute(c) + '?strava=import'" class="strava-import-link" title="Import workouts from Strava">
            Import from Strava
          </router-link>
        </div>
      </div>
    </div>

    <!-- Recent activity -->
    <div v-if="summary?.recentWorkouts?.length" class="recent-section">
      <h2>Recent Activity</h2>
      <ul class="recent-list">
        <li v-for="w in summary.recentWorkouts" :key="w.id" class="recent-item">
          <span class="recent-activity">{{ formatActivityType(w.activityType) }}</span>
          <span class="recent-points">{{ w.points }} pts</span>
          <span class="recent-challenge">{{ w.challengeName }}</span>
          <span class="recent-date">{{ formatDate(w.completedAt) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import { useAgencyStore } from '../store/agency';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const organizationId = computed(() => agencyStore.currentAgency?.id || null);
// Use agency slug when available; fall back to route slug (e.g. ssc) for club managers pre-club
const organizationSlug = computed(() =>
  agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || route.params?.organizationSlug || null
);

const loading = ref(true);
const error = ref(null);
const challenges = ref([]);
const summary = ref(null);

const clubContext = ref(null);
const clubContextLoading = ref(true);
const createClubName = ref('');
const createClubSubmitting = ref(false);
const createClubSuccess = ref(false);

const loadClubManagerContext = async () => {
  clubContextLoading.value = true;
  try {
    const r = await api.get('/summit-stats/club-manager-context', { skipGlobalLoading: true });
    clubContext.value = r.data || null;
  } catch {
    clubContext.value = null;
  } finally {
    clubContextLoading.value = false;
  }
};

const submitCreateClub = async () => {
  const name = String(createClubName.value || '').trim();
  if (!name) return;
  createClubSubmitting.value = true;
  try {
    const r = await api.post('/summit-stats/clubs', { name });
    createClubSuccess.value = true;
    const club = r.data;
    if (club) agencyStore.setCurrentAgency(club);
    await loadClubManagerContext();
    await agencyStore.fetchUserAgencies();
    const clubSlug = club?.slug || club?.portal_url || null;
    if (clubSlug) {
      // Redirect to club admin - main interface for managing their club
      await router.replace(`/${clubSlug}/admin`);
    }
    setTimeout(() => {
      createClubSuccess.value = false;
      createClubName.value = '';
    }, 1500);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to create club';
  } finally {
    createClubSubmitting.value = false;
  }
};

const loadChallenges = async () => {
  loading.value = true;
  error.value = null;
  try {
    const params = organizationId.value ? { organizationId: organizationId.value } : {};
    const r = await api.get('/learning-program-classes/my', { params, skipGlobalLoading: true });
    challenges.value = Array.isArray(r.data?.classes) ? r.data.classes : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load challenges';
    challenges.value = [];
  } finally {
    loading.value = false;
  }
};

const loadSummary = async () => {
  try {
    const params = organizationId.value ? { organizationId: organizationId.value } : {};
    const r = await api.get('/learning-program-classes/my/summary', { params, skipGlobalLoading: true });
    summary.value = r.data || null;
  } catch {
    summary.value = null;
  }
};

const getTeamForChallenge = (challengeId) => {
  const t = (summary.value?.teams || []).find((x) => Number(x.challengeId) === Number(challengeId));
  return t?.teamName || null;
};

const challengeRoute = (c) => {
  const id = c.id;
  if (organizationSlug.value) return `/${organizationSlug.value}/challenges/${id}`;
  return `/challenges/${id}`;
};

const formatStatus = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'draft') return 'Draft';
  if (s === 'closed') return 'Closed';
  return s || '—';
};

const statusClass = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'active') return 'status-active';
  if (s === 'closed') return 'status-closed';
  return '';
};

const formatDates = (c) => {
  const start = c?.starts_at || c?.startsAt;
  const end = c?.ends_at || c?.endsAt;
  if (!start && !end) return '';
  const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `Starts ${fmt(start)}`;
  return `Ends ${fmt(end)}`;
};

const formatActivityType = (t) => (t ? String(t).replace(/_/g, ' ') : '');
const formatDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

onMounted(async () => {
  await loadClubManagerContext();
  await Promise.all([loadChallenges(), loadSummary()]);
});

watch(organizationId, () => {
  loadChallenges();
  loadSummary();
});
</script>

<style scoped>
.summit-stats-dashboard {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}
.dashboard-header {
  margin-bottom: 24px;
}
.dashboard-header h1 {
  margin: 0 0 4px 0;
  font-size: 1.5em;
}
.subtitle {
  margin: 0;
  color: var(--text-muted, #666);
  font-size: 0.95em;
}
.stats-strip {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.stat-card {
  flex: 1;
  min-width: 100px;
  padding: 16px;
  background: var(--bg, #fff);
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  text-align: center;
}
.stat-value {
  display: block;
  font-size: 1.5em;
  font-weight: 700;
  color: var(--primary, #0066cc);
}
.stat-label {
  font-size: 0.85em;
  color: var(--text-muted, #666);
}
.club-store-section {
  margin-bottom: 20px;
}
.club-store-link {
  display: inline-block;
  padding: 10px 16px;
  background: var(--primary, #0066cc);
  color: #fff;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 500;
}
.club-store-link:hover {
  opacity: 0.9;
}
.challenges-section h2,
.recent-section h2 {
  margin: 0 0 12px 0;
  font-size: 1.1em;
}
.challenges-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.challenge-card-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  font-size: 0.8em;
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
.strava-import-link {
  font-size: 0.9em;
  color: var(--primary, #0066cc);
  text-decoration: none;
  padding-left: 16px;
}
.strava-import-link:hover {
  text-decoration: underline;
}
.challenge-org,
.challenge-dates,
.challenge-team {
  margin-top: 6px;
  font-size: 0.9em;
  color: var(--text-muted, #666);
}
.recent-section {
  margin-top: 32px;
}
.recent-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.recent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color, #eee);
  font-size: 0.95em;
}
.recent-activity {
  font-weight: 500;
  min-width: 120px;
}
.recent-points {
  color: var(--primary, #0066cc);
  font-weight: 600;
  min-width: 50px;
}
.recent-challenge {
  flex: 1;
  color: var(--text-muted, #666);
}
.recent-date {
  font-size: 0.9em;
  color: var(--text-muted, #666);
}
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-muted, #666);
}
.create-club-section {
  margin-bottom: 24px;
}
.create-club-card {
  padding: 24px;
  background: var(--bg, #fff);
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
}
.create-club-card h3 {
  margin: 0 0 8px 0;
  font-size: 1.2em;
}
.create-club-card p {
  margin: 0 0 16px 0;
  color: var(--text-muted, #666);
}
.create-club-form {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.create-club-input {
  flex: 1;
  min-width: 180px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 6px;
  font-size: 1em;
}
.create-club-btn {
  padding: 10px 20px;
  background: var(--primary, #0066cc);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
}
.create-club-btn:hover:not(:disabled) {
  opacity: 0.9;
}
.create-club-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.create-club-success {
  color: #2e7d32 !important;
  font-weight: 500;
}
.create-club-verify .hint {
  margin: 0 0 12px 0;
  font-size: 0.9em;
  color: #795548;
}
.create-club-verify .hint a {
  color: var(--primary, #0066cc);
}
.create-club-verify {
  border-color: #ffc107;
  background: #fffde7;
}
</style>
