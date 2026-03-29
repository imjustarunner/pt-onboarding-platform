<template>
  <div class="challenge-dashboard">
    <div v-if="loading" class="loading">Loading season…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="!challenge" class="empty-state">Season not found.</div>
    <div v-else class="challenge-detail">
      <!-- Challenge Overview -->
      <div class="challenge-overview">
        <router-link :to="backRoute" class="back-link">← Back to My Dashboard</router-link>
        <div class="challenge-title-row">
          <h1>{{ challenge.class_name || challenge.className }}</h1>
          <span class="challenge-status-badge" :class="statusClass(challenge)">{{ formatStatus(challenge) }}</span>
        </div>
        <p v-if="challenge.description" class="challenge-description">{{ challenge.description }}</p>
        <div v-if="challenge.starts_at || challenge.ends_at" class="challenge-dates hint">
          {{ formatDates(challenge) }}
        </div>
        <router-link
          v-if="challenge.organization_id"
          :to="`/club-store/${challenge.organization_id}`"
          class="club-store-link"
        >
          View Club Store
        </router-link>
      </div>

      <div class="challenge-sections">
        <div class="challenge-two-col">
          <div class="challenge-col-left">
            <div class="challenge-section">
              <h2>Season Stats</h2>
              <ChallengeLeaderboard :leaderboard="leaderboard" :loading="leaderboardLoading" />
            </div>
            <div class="challenge-section">
              <ChallengeScoreboard :challenge-id="challengeId" />
            </div>
            <div class="challenge-section">
              <ChallengeTeamWeeklyProgress :challenge-id="challengeId" />
            </div>
            <div class="challenge-section">
              <h2>Weekly + Season Summary</h2>
              <div v-if="seasonSummaryLoading" class="loading-inline">Loading summary…</div>
              <div v-else-if="!seasonSummary" class="hint">Summary data will appear after workouts are logged.</div>
              <div v-else class="summary-grid">
                <div class="summary-card">
                  <h4>Top Athletes (Week)</h4>
                  <ol>
                    <li v-for="r in seasonSummary.weeklySummary?.topAthletes || []" :key="`wa-${r.user_id}`">
                      {{ r.first_name }} {{ r.last_name }} — {{ r.total_points }} pts
                    </li>
                  </ol>
                </div>
                <div class="summary-card">
                  <h4>Top Teams (Week)</h4>
                  <ol>
                    <li v-for="r in seasonSummary.weeklySummary?.topTeams || []" :key="`wt-${r.team_id}`">
                      {{ r.team_name }} — {{ r.total_points }} pts
                    </li>
                  </ol>
                </div>
                <div class="summary-card">
                  <h4>Season Standings</h4>
                  <div class="hint" style="margin-bottom: 6px;">
                    Club totals: {{ seasonSummary.weeklySummary?.seasonPointsTotal || 0 }} pts ·
                    {{ Number(seasonSummary.weeklySummary?.seasonMilesTotal || 0).toFixed(1) }} miles
                  </div>
                  <div><strong>Top Individuals</strong></div>
                  <ol>
                    <li v-for="r in seasonSummary.seasonStandings?.topIndividuals || []" :key="`si-${r.user_id}`">
                      {{ r.first_name }} {{ r.last_name }} — {{ r.total_points }} pts
                    </li>
                  </ol>
                  <div><strong>Top Masters</strong></div>
                  <ol>
                    <li v-for="r in seasonSummary.seasonStandings?.topMasters || []" :key="`sm-${r.user_id}`">
                      {{ r.first_name }} {{ r.last_name }} — {{ r.total_points }} pts
                    </li>
                  </ol>
                  <div><strong>Top Ladies</strong></div>
                  <ol>
                    <li v-for="r in seasonSummary.seasonStandings?.topLadies || []" :key="`sl-${r.user_id}`">
                      {{ r.first_name }} {{ r.last_name }} — {{ r.total_points }} pts
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
          <div class="challenge-col-right">
            <div class="challenge-section">
              <ChallengeActivityFeed
                :workouts="activity"
                :loading="activityLoading"
                :challenge-id="challengeId"
                :my-user-id="authStore.user?.id"
                @media-uploaded="loadActivity"
              />
            </div>
            <div class="challenge-section">
              <ChallengeMessageFeed :challenge-id="challengeId" />
            </div>
          </div>
        </div>

        <div class="challenge-section">
          <ChallengeRules :challenge="challenge" />
        </div>
        <div class="challenge-section">
          <ChallengeTeamList :teams="teams" :loading="teamsLoading" />
        </div>
        <div class="challenge-section">
          <ChallengeEliminationBoard :challenge-id="challengeId" />
        </div>
        <div class="challenge-section">
          <ChallengeWeeklyTasks :challenge-id="challengeId" :my-user-id="authStore.user?.id" />
        </div>

        <section class="challenge-section">
          <h2>Captain Applications</h2>
          <div v-if="captainAppsLoading" class="loading-inline">Loading applications…</div>
          <div v-else-if="captainAppsError" class="error-inline">{{ captainAppsError }}</div>
          <div v-else class="captain-apps-list">
            <div v-if="!captainApplications.length" class="empty-hint">No captain applications yet.</div>
            <article
              v-for="app in captainApplications"
              :key="`captain-app-${app.id}`"
              class="captain-app-card"
            >
              <div class="captain-app-header">
                <strong>{{ app.first_name }} {{ app.last_name }}</strong>
                <span class="captain-app-status" :class="`status-${String(app.status || '').toLowerCase()}`">{{ app.status }}</span>
              </div>
              <p v-if="app.application_text" class="hint">{{ app.application_text }}</p>
              <p v-if="app.manager_notes" class="hint">Manager note: {{ app.manager_notes }}</p>
              <div v-if="isChallengeManager && String(app.status || '').toLowerCase() === 'pending'" class="captain-app-actions">
                <button class="btn btn-primary btn-small" @click="reviewCaptain(app.id, 'approved')">Approve</button>
                <button class="btn btn-secondary btn-small" @click="reviewCaptain(app.id, 'rejected')">Reject</button>
              </div>
            </article>
          </div>
          <div v-if="isChallengeManager" class="captain-finalize">
            <button class="btn btn-secondary" :disabled="captainsFinalizeSubmitting" @click="finalizeCaptainsForSeason">
              {{ captainsFinalizeSubmitting ? 'Finalizing…' : 'Finalize Captains' }}
            </button>
            <span class="hint">This closes captain applications for the season.</span>
          </div>
        </section>

        <section class="challenge-section">
          <h2>Log Workout</h2>
          <div v-if="canSubmitWorkout" class="workout-actions">
            <form class="workout-form" @submit.prevent="submitWorkout">
              <div class="form-row">
                <label>Activity type</label>
                <select v-model="workoutForm.activityType" required>
                  <option value="">Select…</option>
                  <option v-for="opt in activityTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <div class="form-row">
                <label>Distance (miles)</label>
                <input v-model.number="workoutForm.distanceValue" type="number" step="0.01" min="0" placeholder="Optional" />
              </div>
              <div class="form-row">
                <label>Duration (minutes)</label>
                <input v-model.number="workoutForm.durationMinutes" type="number" min="0" placeholder="Optional" />
              </div>
              <div class="form-row" v-if="eventCategory === 'fitness'">
                <label>Calories burned</label>
                <input v-model.number="workoutForm.caloriesBurned" type="number" min="0" placeholder="Optional" />
              </div>
              <div class="form-row">
                <label>Points</label>
                <input v-model.number="workoutForm.points" type="number" min="0" required />
                <small class="hint">
                  {{ eventCategory === 'fitness'
                    ? 'Points can be auto-derived from calories based on season settings.'
                    : 'For run/ruck entries, points can be auto-derived from mileage settings.' }}
                </small>
              </div>
              <div class="form-row">
                <label>Weekly challenge tag</label>
                <select v-model="workoutForm.weeklyTaskId">
                  <option :value="null">None</option>
                  <option v-for="t in weeklyTaskOptions" :key="`weekly-task-option-${t.id}`" :value="t.id">
                    {{ t.name }}
                  </option>
                </select>
              </div>
              <div class="form-row">
                <label>Notes</label>
                <textarea v-model="workoutForm.workoutNotes" rows="2" placeholder="Optional" />
              </div>
              <div class="form-buttons">
                <button type="submit" class="btn btn-primary" :disabled="workoutSubmitting">
                  {{ workoutSubmitting ? 'Submitting…' : 'Log Workout' }}
                </button>
                <button
                  v-if="stravaStatus?.connected"
                  type="button"
                  class="btn btn-secondary"
                  @click="openStravaImportModal"
                >
                  Import from Strava
                </button>
              </div>
            </form>
          </div>
          <p v-else class="hint">You must be a season participant to log workouts. Contact your Program Manager to join.</p>
        </section>

        <!-- Strava Import Modal -->
        <div v-if="showStravaImportModal" class="modal-overlay" @click.self="closeStravaImportModal">
          <div class="modal-content modal-wide">
            <h2>Import from Strava</h2>
            <p class="hint">Select which activities to import into this season. Points are calculated from distance or duration.</p>
            <div v-if="stravaActivitiesLoading" class="loading-inline">Loading your Strava activities…</div>
            <div v-else-if="stravaActivitiesError" class="error-inline">{{ stravaActivitiesError }}</div>
            <div v-else class="strava-activity-list">
              <label v-for="a in stravaActivities" :key="a.id" class="strava-activity-item">
                <input type="checkbox" :value="a.id" v-model="selectedStravaIds" />
                <span class="activity-name">{{ a.name || 'Untitled' }}</span>
                <span class="activity-meta">
                  {{ a.type || a.sport_type }} · {{ formatStravaDistance(a.distance) }} · {{ formatStravaDuration(a.moving_time || a.elapsed_time) }} · {{ formatStravaDate(a.start_date) }}
                </span>
              </label>
              <div v-if="!stravaActivities.length" class="empty-hint">No activities in the last 30 days. Try a different date range.</div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" @click="closeStravaImportModal">Cancel</button>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="!selectedStravaIds.length || stravaImporting"
                @click="importSelectedStrava"
              >
                {{ stravaImporting ? 'Importing…' : `Import ${selectedStravaIds.length} selected` }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useAuthStore } from '../store/auth';
import ChallengeRules from '../components/challenge/ChallengeRules.vue';
import ChallengeTeamList from '../components/challenge/ChallengeTeamList.vue';
import ChallengeLeaderboard from '../components/challenge/ChallengeLeaderboard.vue';
import ChallengeScoreboard from '../components/challenge/ChallengeScoreboard.vue';
import ChallengeEliminationBoard from '../components/challenge/ChallengeEliminationBoard.vue';
import ChallengeWeeklyTasks from '../components/challenge/ChallengeWeeklyTasks.vue';
import ChallengeActivityFeed from '../components/challenge/ChallengeActivityFeed.vue';
import ChallengeTeamWeeklyProgress from '../components/challenge/ChallengeTeamWeeklyProgress.vue';
import ChallengeMessageFeed from '../components/challenge/ChallengeMessageFeed.vue';

const route = useRoute();
const authStore = useAuthStore();
const challenge = ref(null);
const providerMembers = ref([]);
const loading = ref(true);
const error = ref(null);
const leaderboard = ref(null);
const leaderboardLoading = ref(false);
const teams = ref([]);
const teamsLoading = ref(false);
const activity = ref([]);
const activityLoading = ref(false);
const workoutForm = ref({
  activityType: '',
  distanceValue: null,
  durationMinutes: null,
  caloriesBurned: null,
  points: 0,
  workoutNotes: '',
  weeklyTaskId: null
});
const workoutSubmitting = ref(false);
const stravaStatus = ref(null);
const showStravaImportModal = ref(false);
const stravaActivities = ref([]);
const stravaActivitiesLoading = ref(false);
const stravaActivitiesError = ref(null);
const selectedStravaIds = ref([]);
const stravaImporting = ref(false);
const captainApplications = ref([]);
const captainAppsLoading = ref(false);
const captainAppsError = ref('');
const captainsFinalizeSubmitting = ref(false);
const weeklyTaskOptions = ref([]);
const seasonSummary = ref(null);
const seasonSummaryLoading = ref(false);

const challengeId = computed(() => route.params.id || route.params.challengeId);
const organizationSlug = computed(() => route.params.organizationSlug || null);

const backRoute = computed(() => {
  if (organizationSlug.value) return `/${organizationSlug.value}/dashboard`;
  return '/dashboard';
});

const canSubmitWorkout = computed(() => {
  const members = providerMembers.value || [];
  const myId = authStore.user?.id;
  return members.some((m) => Number(m.provider_user_id) === Number(myId) && ['active', 'completed'].includes(String(m.membership_status || '').toLowerCase()));
});

const activityTypeOptions = computed(() => {
  const raw = challenge.value?.activity_types_json;
  if (Array.isArray(raw) && raw.length) return raw.map((t) => ({ value: t, label: String(t).replace(/_/g, ' ') }));
  if (typeof raw === 'object' && raw && Object.keys(raw).length) return Object.keys(raw).map((k) => ({ value: k, label: String(k).replace(/_/g, ' ') }));
  return [
    { value: 'running', label: 'Running' },
    { value: 'cycling', label: 'Cycling' },
    { value: 'workout_session', label: 'Workout Session' },
    { value: 'steps', label: 'Steps' }
  ];
});

const eventCategory = computed(() => {
  const settings = challenge.value?.season_settings_json;
  const category = settings && typeof settings === 'object' ? settings?.event?.category : null;
  return String(category || 'run_ruck').toLowerCase() === 'fitness' ? 'fitness' : 'run_ruck';
});

const isChallengeManager = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role);
});

const formatStatus = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'draft') return 'Draft';
  if (s === 'closed') return 'Closed';
  if (s === 'archived') return 'Archived';
  return s || '—';
};

const statusClass = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'active') return 'status-active';
  if (s === 'closed') return 'status-closed';
  return '';
};

const loadChallenge = async () => {
  const id = challengeId.value;
  if (!id) {
    error.value = 'Invalid challenge';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const r = await api.get(`/learning-program-classes/${id}`, { skipGlobalLoading: true });
    challenge.value = r.data?.class || null;
    providerMembers.value = Array.isArray(r.data?.providerMembers) ? r.data.providerMembers : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load challenge';
    challenge.value = null;
  } finally {
    loading.value = false;
  }
};

const loadLeaderboard = async () => {
  const id = challengeId.value;
  if (!id) return;
  leaderboardLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/leaderboard`, { skipGlobalLoading: true });
    leaderboard.value = r.data || null;
  } catch {
    leaderboard.value = null;
  } finally {
    leaderboardLoading.value = false;
  }
};

const loadTeams = async () => {
  const id = challengeId.value;
  if (!id) return;
  teamsLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/teams`, { skipGlobalLoading: true });
    teams.value = Array.isArray(r.data?.teams) ? r.data.teams : [];
  } catch {
    teams.value = [];
  } finally {
    teamsLoading.value = false;
  }
};

const loadActivity = async () => {
  const id = challengeId.value;
  if (!id) return;
  activityLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/activity`, { skipGlobalLoading: true });
    activity.value = Array.isArray(r.data?.workouts) ? r.data.workouts : [];
  } catch {
    activity.value = [];
  } finally {
    activityLoading.value = false;
  }
};

const loadWeeklyTaskOptions = async () => {
  const id = challengeId.value;
  if (!id) return;
  try {
    const r = await api.get(`/learning-program-classes/${id}/weekly-tasks`, { skipGlobalLoading: true });
    weeklyTaskOptions.value = Array.isArray(r.data?.tasks) ? r.data.tasks : [];
  } catch {
    weeklyTaskOptions.value = [];
  }
};

const loadSeasonSummary = async () => {
  const id = challengeId.value;
  if (!id) return;
  seasonSummaryLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/season-summary`, { skipGlobalLoading: true });
    seasonSummary.value = r.data || null;
  } catch {
    seasonSummary.value = null;
  } finally {
    seasonSummaryLoading.value = false;
  }
};

const loadCaptainApplications = async () => {
  const id = challengeId.value;
  if (!id) return;
  captainAppsLoading.value = true;
  captainAppsError.value = '';
  try {
    const r = await api.get(`/learning-program-classes/${id}/captain-applications`, { skipGlobalLoading: true });
    captainApplications.value = Array.isArray(r.data?.applications) ? r.data.applications : [];
  } catch (e) {
    captainApplications.value = [];
    captainAppsError.value = e?.response?.data?.error?.message || 'Failed to load captain applications';
  } finally {
    captainAppsLoading.value = false;
  }
};

const reviewCaptain = async (applicationId, status) => {
  const id = challengeId.value;
  if (!id || !applicationId) return;
  try {
    await api.put(`/learning-program-classes/${id}/captain-applications/${applicationId}`, { status });
    await Promise.all([loadCaptainApplications(), loadChallenge()]);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update captain application');
  }
};

const finalizeCaptainsForSeason = async () => {
  const id = challengeId.value;
  if (!id) return;
  captainsFinalizeSubmitting.value = true;
  try {
    await api.post(`/learning-program-classes/${id}/captains/finalize`);
    await Promise.all([loadChallenge(), loadCaptainApplications()]);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to finalize captains');
  } finally {
    captainsFinalizeSubmitting.value = false;
  }
};

const submitWorkout = async () => {
  const id = challengeId.value;
  if (!id || !workoutForm.value.activityType) return;
  workoutSubmitting.value = true;
  try {
    await api.post(`/learning-program-classes/${id}/workouts`, {
      activityType: workoutForm.value.activityType,
      distanceValue: workoutForm.value.distanceValue || null,
      durationMinutes: workoutForm.value.durationMinutes || null,
      caloriesBurned: workoutForm.value.caloriesBurned || null,
      points: workoutForm.value.points || 0,
      workoutNotes: workoutForm.value.workoutNotes || null,
      weeklyTaskId: workoutForm.value.weeklyTaskId || null
    });
    workoutForm.value = { activityType: '', distanceValue: null, durationMinutes: null, caloriesBurned: null, points: 0, workoutNotes: '', weeklyTaskId: null };
    await Promise.all([loadLeaderboard(), loadActivity(), loadSeasonSummary()]);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to submit workout');
  } finally {
    workoutSubmitting.value = false;
  }
};

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

const formatStravaDistance = (meters) => {
  if (!meters) return '—';
  const miles = Number(meters) / 1609.34;
  return `${miles.toFixed(1)} mi`;
};
const formatStravaDuration = (sec) => {
  if (!sec) return '—';
  const m = Math.floor(Number(sec) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
const formatStravaDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');

const loadStravaStatus = async () => {
  try {
    const r = await api.get('/strava/status', { skipGlobalLoading: true });
    stravaStatus.value = r.data || null;
  } catch {
    stravaStatus.value = null;
  }
};

const openStravaImportModal = async () => {
  showStravaImportModal.value = true;
  selectedStravaIds.value = [];
  stravaActivities.value = [];
  stravaActivitiesError.value = null;
  stravaActivitiesLoading.value = true;
  try {
    const after = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const r = await api.get('/strava/activities', { params: { after, per_page: 50 }, skipGlobalLoading: true });
    stravaActivities.value = Array.isArray(r.data?.activities) ? r.data.activities : [];
  } catch (e) {
    stravaActivitiesError.value = e?.response?.data?.error?.message || 'Failed to load Strava activities';
  } finally {
    stravaActivitiesLoading.value = false;
  }
};

const closeStravaImportModal = () => {
  showStravaImportModal.value = false;
};

const importSelectedStrava = async () => {
  const id = challengeId.value;
  if (!id || !selectedStravaIds.value.length) return;
  stravaImporting.value = true;
  try {
    await api.post('/strava/import', {
      learningClassId: id,
      activityIds: selectedStravaIds.value
    });
    closeStravaImportModal();
    await Promise.all([loadLeaderboard(), loadActivity(), loadSeasonSummary()]);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to import activities');
  } finally {
    stravaImporting.value = false;
  }
};

onMounted(async () => {
  await loadChallenge();
  if (challenge.value) {
    await Promise.all([loadLeaderboard(), loadTeams(), loadActivity(), loadCaptainApplications(), loadWeeklyTaskOptions(), loadSeasonSummary()]);
    loadStravaStatus();
  }
  if (route.query?.strava === 'import') {
    openStravaImportModal();
  }
});

watch(challengeId, () => {
  loadChallenge().then(() => {
    if (challenge.value) {
      Promise.all([loadLeaderboard(), loadTeams(), loadActivity(), loadCaptainApplications(), loadWeeklyTaskOptions(), loadSeasonSummary()]);
    }
  });
});
</script>

<style scoped>
.challenge-dashboard {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}
.challenge-overview {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-color, #ddd);
}
.back-link {
  display: inline-block;
  margin-bottom: 12px;
  color: var(--link-color, #0066cc);
  text-decoration: none;
}
.back-link:hover {
  text-decoration: underline;
}
.challenge-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.challenge-title-row h1 {
  margin: 0;
}
.challenge-status-badge {
  font-size: 0.85em;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
}
.challenge-status-badge.status-active {
  background: #e8f5e9;
  color: #2e7d32;
}
.challenge-status-badge.status-closed {
  background: #f5f5f5;
  color: #666;
}
.challenge-description {
  margin: 8px 0;
  color: var(--text-muted, #666);
  line-height: 1.5;
}
.challenge-dates {
  margin-top: 4px;
}
.club-store-link {
  display: inline-block;
  margin-top: 12px;
  color: var(--link-color, #0066cc);
  text-decoration: none;
  font-weight: 500;
}
.club-store-link:hover {
  text-decoration: underline;
}
.challenge-sections {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.challenge-two-col {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr);
  gap: 16px;
}
.challenge-col-left,
.challenge-col-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.challenge-section {
  padding: 16px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
}
.challenge-section h2 {
  margin: 0 0 12px 0;
  font-size: 1.1em;
}
.summary-grid {
  display: grid;
  gap: 10px;
}
.summary-card {
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 10px;
  background: #fafafa;
}
.summary-card h4 {
  margin: 0 0 8px;
}
.summary-card ol {
  margin: 0;
  padding-left: 18px;
}
.workout-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;
}
.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-row label {
  font-size: 0.9em;
}
.form-row input,
.form-row select,
.form-row textarea {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.form-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-content.modal-wide {
  min-width: 480px;
}
.strava-activity-list {
  max-height: 320px;
  overflow-y: auto;
  margin: 16px 0;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 6px;
  padding: 8px;
}
.strava-activity-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 8px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
}
.strava-activity-item:last-child {
  border-bottom: none;
}
.strava-activity-item input {
  flex-shrink: 0;
}
.activity-name {
  font-weight: 500;
  min-width: 120px;
}
.activity-meta {
  font-size: 0.9em;
  color: var(--text-muted, #666);
}
.loading-inline,
.error-inline {
  padding: 16px;
  color: var(--text-muted, #666);
}
.error-inline {
  color: #c62828;
}
.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
.captain-apps-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.captain-app-card {
  border: 1px solid var(--border-color, #ddd);
  border-radius: 6px;
  padding: 10px 12px;
  background: #fafafa;
}
.captain-app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.captain-app-status {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: 999px;
  padding: 2px 8px;
  border: 1px solid #ddd;
}
.captain-app-status.status-pending {
  background: #fff8e1;
}
.captain-app-status.status-approved {
  background: #e8f5e9;
}
.captain-app-status.status-rejected {
  background: #ffebee;
}
.captain-app-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
.captain-finalize {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
@media (max-width: 980px) {
  .challenge-two-col {
    grid-template-columns: 1fr;
  }
}
</style>
