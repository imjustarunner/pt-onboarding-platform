<template>
  <div class="ssc-hub" :class="{ 'ssc-hub--season-open': !!expandedSeasonId }">

    <!-- ── MAIN PANEL ───────────────────────────────────────── -->
    <div class="ssc-hub-main">

      <!-- ── HUB VIEW (default) ─────────────────────────────── -->
      <template v-if="!expandedSeasonId">

        <!-- Header -->
        <div class="hub-header">
          <div class="hub-header-left">
            <h1 class="hub-club-name">{{ clubName }}</h1>
            <p class="hub-tagline">Your club dashboard</p>
          </div>
          <div class="hub-header-right">
            <!-- Create Club for scoped admins -->
            <div v-if="isSscRoute && clubContext?.summitStatsScopedAdmin && !clubContext?.emailVerified" class="hub-verify-notice">
              Verify your email to create a club.
            </div>
          </div>
        </div>

        <!-- Create Club form (scoped admin, no club yet) -->
        <div v-if="isSscRoute && clubContext?.summitStatsScopedAdmin" class="hub-card hub-create-club">
          <div v-if="!clubContext.emailVerified" class="create-club-verify">
            <h3>Verify your email</h3>
            <p>Please verify your email before creating your club. Check your inbox.</p>
          </div>
          <div v-else>
            <h3>Create your club</h3>
            <form v-if="!createClubSuccess" @submit.prevent="submitCreateClub" class="create-club-form">
              <input v-model="createClubName" type="text" placeholder="Club name" required />
              <input v-model="createClubSlug" type="text" placeholder="URL slug (optional)" />
              <button type="submit" :disabled="createClubSubmitting" class="btn btn-primary">
                {{ createClubSubmitting ? 'Creating…' : 'Create Club' }}
              </button>
            </form>
            <p v-else class="success-msg">Club created! Refreshing…</p>
          </div>
        </div>

        <!-- Pending application notice (member applied but not yet approved) -->
        <div v-if="!organizationId && !clubContext?.summitStatsScopedAdmin && pendingApplications.length" class="hub-pending-banner">
          <div v-for="app in pendingApplications" :key="app.id" class="hub-pending-item">
            <div class="hub-pending-icon">⏳</div>
            <div class="hub-pending-body">
              <strong>Application pending — {{ app.clubName }}</strong>
              <p>Your application to join <em>{{ app.clubName }}</em> is awaiting manager approval. You'll be added to the club once approved.</p>
            </div>
            <div v-if="app.status === 'denied'" class="hub-pending-tag hub-pending-tag--denied">Denied</div>
            <div v-else class="hub-pending-tag hub-pending-tag--pending">Pending</div>
          </div>
          <p class="hub-pending-more">
            Want to join another club? <router-link :to="`/${orgSlug}/clubs`">Browse clubs</router-link>
          </p>
        </div>

        <!-- No club and no pending — prompt to browse -->
        <div v-else-if="!organizationId && !clubContext?.summitStatsScopedAdmin && !pendingApplicationsLoading" class="hub-pending-banner hub-pending-banner--empty">
          <div class="hub-pending-icon">🏃</div>
          <div class="hub-pending-body">
            <strong>You're not a member of any club yet</strong>
            <p>Browse available clubs and submit an application to get started.</p>
            <router-link :to="`/${orgSlug}/clubs`" class="btn btn-primary btn-sm">Browse Clubs</router-link>
          </div>
        </div>

        <!-- Club Stats Bar -->
        <div v-if="organizationId" class="hub-stats-bar">
          <div v-if="clubStatsLoading" class="hub-stats-bar--loading">Loading club stats…</div>
          <template v-else-if="clubStatsList.length">
            <div
              v-for="stat in clubStatsList"
              :key="stat.key"
              class="hub-stat-chip"
              :class="{ 'hub-stat-chip--race': stat.key === 'half_marathon_count' || stat.key === 'marathon_count' }"
            >
              <span class="hub-stat-icon" v-if="stat.icon">{{ stat.icon }}</span>
              <span class="hub-stat-value">{{ fmtStatVal(stat) }}</span>
              <span class="hub-stat-label">{{ stat.label }}</span>
            </div>
          </template>
        </div>

        <!-- Record Board -->
        <div v-if="organizationId" class="hub-card hub-record-board">
          <div class="hub-card-header">
            <h2>Club Records <span class="hub-card-sub">All-Time</span></h2>
          </div>
          <div v-if="recordBoardLoading" class="hub-loading-row">Loading records…</div>
          <div v-else-if="!recordBoard.length" class="hub-empty-hint">
            No records yet — start logging workouts!
          </div>
          <div v-else class="record-board-grid">
            <div
              v-for="rec in recordBoard"
              :key="rec.metricKey"
              class="record-tile"
            >
              <div class="record-tile-label">{{ rec.label }}</div>
              <div class="record-tile-value">{{ rec.valueText }}</div>
              <div class="record-tile-holder">{{ rec.holderName }}</div>
            </div>
          </div>
        </div>

        <!-- Upload Workout Railcard -->
        <div v-if="currentSeason" class="hub-card hub-upload-rail">
          <div class="hub-upload-inner">
            <div class="hub-upload-text">
              <div class="hub-upload-title">Log a Workout</div>
              <div class="hub-upload-hint">{{ currentSeason.class_name || currentSeason.className }}</div>
            </div>
            <button class="btn btn-primary btn-upload-big" @click="openUpload">
              + Upload Workout
            </button>
          </div>
          <!-- Inline quick-log form -->
          <div v-if="showUploadForm" class="quick-upload-form">
            <div class="quick-form-row">
              <label>Activity</label>
              <select v-model="uploadForm.activityType">
                <option value="Run">Run</option>
                <option value="Ruck">Ruck</option>
                <option value="Walk">Walk</option>
                <option value="Trail Run">Trail Run</option>
                <option value="Bike">Bike</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="quick-form-row">
              <label>Distance (miles)</label>
              <input v-model.number="uploadForm.distanceMiles" type="number" min="0" step="0.01" placeholder="0.00" />
            </div>
            <div class="quick-form-row">
              <label>Duration (minutes)</label>
              <input v-model.number="uploadForm.durationMinutes" type="number" min="0" placeholder="e.g. 45" />
            </div>
            <div class="quick-form-row">
              <label>Notes (optional)</label>
              <input v-model="uploadForm.notes" type="text" placeholder="How'd it go?" />
            </div>
            <div class="quick-form-actions">
              <button class="btn btn-primary" :disabled="uploadSubmitting" @click="submitQuickUpload">
                {{ uploadSubmitting ? 'Logging…' : 'Log Workout' }}
              </button>
              <button class="btn btn-secondary" @click="showUploadForm = false">Cancel</button>
            </div>
            <p v-if="uploadError" class="quick-error">{{ uploadError }}</p>
            <p v-if="uploadSuccess" class="quick-success">Workout logged! ✓</p>
          </div>
        </div>

        <!-- Season Announcements / Splash -->
        <div v-if="seasonSplashes.length" class="hub-splashes">
          <article v-for="season in seasonSplashes" :key="`splash-${season.id}`" class="season-splash-card">
            <div class="splash-header">
              <h3>{{ season.class_name || season.className }}</h3>
              <span class="splash-badge">Open</span>
            </div>
            <p v-if="season.season_announcement_text" class="splash-copy">{{ season.season_announcement_text }}</p>
            <div class="splash-actions">
              <button
                v-if="!season.captains_finalized && season.captain_application_open"
                class="btn btn-secondary btn-sm"
                :disabled="captainApplyingClassId === season.id"
                @click="applyForCaptain(season.id)"
              >Apply for Captain</button>
              <button
                v-if="!season.joined"
                class="btn btn-primary btn-sm"
                :disabled="joiningClassId === season.id"
                @click="joinSeason(season.id)"
              >{{ joiningClassId === season.id ? 'Joining…' : 'Join Season' }}</button>
            </div>
          </article>
        </div>

        <!-- Active Season Railcards -->
        <div v-if="activeSeasons.length" class="hub-section">
          <h2 class="hub-section-title">Active Season{{ activeSeasons.length > 1 ? 's' : '' }}</h2>
          <div class="season-rails">
            <div
              v-for="season in activeSeasons"
              :key="`rail-${season.id}`"
              class="season-rail-card"
              @click="expandSeason(season)"
            >
              <div class="rail-top">
                <span class="rail-season-name">{{ season.class_name || season.className }}</span>
                <span class="rail-badge rail-badge--active">Active</span>
              </div>
              <div v-if="getTeamForChallenge(season.id)" class="rail-team">
                Team: <strong>{{ getTeamForChallenge(season.id) }}</strong>
              </div>
              <div v-if="season.starts_at || season.ends_at" class="rail-dates">{{ formatDates(season) }}</div>
              <div class="rail-cta">
                <span class="rail-cta-text">View Season Dashboard →</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Past / Other Seasons -->
        <div v-if="pastSeasons.length" class="hub-section">
          <button class="hub-section-toggle" @click="showPast = !showPast">
            Past Seasons ({{ pastSeasons.length }}) {{ showPast ? '▲' : '▼' }}
          </button>
          <div v-if="showPast" class="past-seasons-list">
            <router-link
              v-for="season in pastSeasons"
              :key="`past-${season.id}`"
              :to="challengeRoute(season)"
              class="past-season-link"
            >
              <span>{{ season.class_name || season.className }}</span>
              <span class="past-season-status">{{ formatStatus(season) }}</span>
            </router-link>
          </div>
        </div>

        <!-- My Personal Stats -->
        <div v-if="summary" class="hub-card hub-personal-stats">
          <div class="hub-card-header"><h2>My Stats</h2></div>
          <div class="personal-stats-row">
            <div class="personal-stat">
              <span class="ps-value">{{ summary.totalPoints ?? 0 }}</span>
              <span class="ps-label">Total Points</span>
            </div>
            <div class="personal-stat">
              <span class="ps-value">{{ summary.workoutCount ?? 0 }}</span>
              <span class="ps-label">Workouts</span>
            </div>
            <div class="personal-stat">
              <span class="ps-value">{{ summary.teams?.length ?? 0 }}</span>
              <span class="ps-label">Teams</span>
            </div>
          </div>
        </div>

      </template>

      <!-- ── EXPANDED SEASON VIEW (3-column) ─────────────────── -->
      <template v-else>
        <div class="season-view-header">
          <button class="btn-back" @click="collapseSeason">← Back to Dashboard</button>
          <div class="season-view-title">
            <h2>{{ expandedSeason?.class_name || expandedSeason?.className }}</h2>
            <span class="season-view-badge">Active</span>
          </div>
          <router-link :to="challengeRoute(expandedSeason)" class="btn btn-secondary btn-sm">
            Full Dashboard
          </router-link>
        </div>

        <div class="season-three-col">

          <!-- LEFT: My Team -->
          <div class="season-col season-col--team">
            <div class="col-head">My Team</div>
            <div v-if="teamLoading" class="col-loading">Loading…</div>
            <template v-else>
              <div v-if="myTeam" class="team-name-bar">
                <strong>{{ myTeam.team_name }}</strong>
              </div>
              <div class="team-stat-chips">
                <div class="t-chip">
                  <span>{{ teamStats.totalPoints }}</span>
                  <small>Team Points</small>
                </div>
                <div class="t-chip">
                  <span>{{ teamStats.totalWorkouts }}</span>
                  <small>Workouts</small>
                </div>
                <div v-if="teamStats.totalMiles" class="t-chip">
                  <span>{{ teamStats.totalMiles.toFixed(1) }}</span>
                  <small>Miles</small>
                </div>
              </div>
              <div class="team-members-label">Members</div>
              <ul class="team-members-list">
                <li
                  v-for="member in teamMembers"
                  :key="`member-${member.userId}`"
                  class="team-member-row"
                >
                  <div class="tm-avatar">{{ initials(member.name) }}</div>
                  <div class="tm-info">
                    <span class="tm-name">{{ member.name }}</span>
                    <span class="tm-stats">{{ member.points }} pts · {{ member.workoutCount }} workouts</span>
                  </div>
                  <div class="tm-rank">#{{ member.rank }}</div>
                </li>
              </ul>
              <div v-if="!teamMembers.length && !teamLoading" class="col-empty">No team assigned.</div>
            </template>
          </div>

          <!-- MIDDLE: Season Feed -->
          <div class="season-col season-col--feed">
            <div class="col-head">
              <span>Season Feed</span>
              <div class="feed-filter-btns">
                <button
                  class="feed-filter-btn"
                  :class="{ active: feedFilter === 'all' }"
                  @click="feedFilter = 'all'"
                >All</button>
                <button
                  class="feed-filter-btn"
                  :class="{ active: feedFilter === 'team' }"
                  @click="feedFilter = 'team'"
                >My Team</button>
              </div>
            </div>
            <div v-if="seasonFeedLoading" class="col-loading">Loading…</div>
            <ul v-else class="season-feed-list">
              <li
                v-for="w in filteredSeasonFeed"
                :key="`sw-${w.id}`"
                class="season-feed-item"
              >
                <div class="sf-top">
                  <div class="sf-avatar">{{ initials(w.first_name + ' ' + w.last_name) }}</div>
                  <div class="sf-who">
                    <strong>{{ w.first_name }} {{ w.last_name }}</strong>
                    <span class="sf-activity">{{ formatActivity(w.activity_type) }}</span>
                  </div>
                  <span v-if="w.points" class="sf-pts">+{{ w.points }}</span>
                </div>
                <div class="sf-stats">
                  <span v-if="w.distance_value">{{ Number(w.distance_value).toFixed(2) }} mi</span>
                  <span v-if="w.duration_minutes">{{ w.duration_minutes }} min</span>
                </div>
                <div class="sf-when">{{ timeAgo(w.completed_at) }}</div>
              </li>
              <li v-if="!filteredSeasonFeed.length" class="col-empty">No workouts yet.</li>
            </ul>
          </div>

          <!-- RIGHT: Rankings -->
          <div class="season-col season-col--rankings">
            <div class="col-head">Rankings</div>
            <div v-if="leaderboardLoading" class="col-loading">Loading…</div>
            <template v-else>
              <!-- Team standings -->
              <div v-if="teamLeaderboard.length" class="rankings-section">
                <div class="rankings-label">Team Standings</div>
                <ol class="rankings-list">
                  <li
                    v-for="(t, i) in teamLeaderboard"
                    :key="`tl-${t.teamId}`"
                    class="rankings-item"
                    :class="{ 'rankings-item--mine': t.teamId === myTeamId }"
                  >
                    <span class="rank-pos">{{ i + 1 }}</span>
                    <span class="rank-name">{{ t.teamName }}</span>
                    <span class="rank-value">{{ t.totalPoints }} pts</span>
                  </li>
                </ol>
              </div>
              <!-- Individual top 10 -->
              <div class="rankings-section">
                <div class="rankings-label">Individual Top 10</div>
                <ol class="rankings-list">
                  <li
                    v-for="(ind, i) in individualLeaderboard.slice(0, 10)"
                    :key="`il-${ind.userId}`"
                    class="rankings-item"
                    :class="{ 'rankings-item--me': ind.userId === myUserId }"
                  >
                    <span class="rank-pos">{{ i + 1 }}</span>
                    <span class="rank-name">{{ ind.name }}</span>
                    <span class="rank-value">{{ ind.totalPoints }} pts</span>
                  </li>
                </ol>
              </div>
            </template>
          </div>

        </div>
      </template>

    </div>

    <!-- ── RIGHT RAIL ────────────────────────────────────────── -->
    <div class="ssc-hub-feed" v-if="organizationId">
      <!-- Team Store Rail -->
      <a
        v-if="storeConfig?.enabled && storeConfig?.url"
        :href="storeConfig.url"
        target="_blank"
        rel="noopener"
        class="store-rail-widget"
      >
        <span class="store-rail-widget__icon">🛒</span>
        <span class="store-rail-widget__body">
          <span class="store-rail-widget__title">{{ storeConfig.title || 'Team Store' }}</span>
          <span v-if="storeConfig.description" class="store-rail-widget__desc">{{ storeConfig.description }}</span>
        </span>
        <span class="store-rail-widget__btn">{{ storeConfig.buttonText || 'Shop Now' }} →</span>
      </a>

      <ClubFeedPanel :club-id="organizationId" ref="feedPanelRef" />
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import { useAuthStore } from '../store/auth';
import ClubFeedPanel from '../components/ssc/ClubFeedPanel.vue';
import api from '../services/api';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const organizationId = computed(() => agencyStore.currentAgency?.id || null);
const organizationSlug = computed(() =>
  agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || route.params?.organizationSlug || null
);
const orgSlug = computed(() => String(route.params?.organizationSlug || '').toLowerCase() || 'ssc');
const isSscRoute = computed(() => orgSlug.value === 'ssc');
const myUserId = computed(() => authStore.user?.id || null);

// ── DATA REFS ──────────────────────────────────────────────
const challenges = ref([]);
const summary = ref(null);
const seasonSplashes = ref([]);
const clubStats = ref({});
const clubStatsList = ref([]);
const clubStatsLoading = ref(false);
const storeConfig = ref(null);
const recordBoard = ref([]);
const recordBoardLoading = ref(false);

const clubContext = ref(null);
const createClubName = ref('');
const createClubSlug = ref('');
const createClubSubmitting = ref(false);
const createClubSuccess = ref(false);

// Pending applications (shown when member has no club yet)
const pendingApplications = ref([]);
const pendingApplicationsLoading = ref(false);
const joiningClassId = ref(null);
const captainApplyingClassId = ref(null);
const showPast = ref(false);

// Upload workout
const showUploadForm = ref(false);
const uploadSubmitting = ref(false);
const uploadError = ref('');
const uploadSuccess = ref(false);
const uploadForm = ref({ activityType: 'Run', distanceMiles: null, durationMinutes: null, notes: '' });

// Expanded season (3-col view)
const expandedSeasonId = ref(null);
const expandedSeason = ref(null);

// Team data (for 3-col view)
const teamLoading = ref(false);
const myTeam = ref(null);
const myTeamId = ref(null);
const teamMembers = ref([]);
const teamStats = computed(() => {
  const pts = teamMembers.value.reduce((s, m) => s + (m.points || 0), 0);
  const wk = teamMembers.value.reduce((s, m) => s + (m.workoutCount || 0), 0);
  const mi = teamMembers.value.reduce((s, m) => s + (m.totalMiles || 0), 0);
  return { totalPoints: pts, totalWorkouts: wk, totalMiles: mi };
});

// Season feed (middle col)
const seasonFeedLoading = ref(false);
const seasonFeed = ref([]);
const feedFilter = ref('all');
const filteredSeasonFeed = computed(() => {
  if (feedFilter.value === 'team' && myTeamId.value) {
    return seasonFeed.value.filter((w) => Number(w.team_id) === Number(myTeamId.value));
  }
  return seasonFeed.value;
});

// Leaderboard (right col)
const leaderboardLoading = ref(false);
const teamLeaderboard = ref([]);
const individualLeaderboard = ref([]);

// ── COMPUTED ───────────────────────────────────────────────
const clubName = computed(() => agencyStore.currentAgency?.name || 'My Club');

const activeSeasons = computed(() =>
  challenges.value.filter((c) => String(c?.status || '').toLowerCase() === 'active')
);

const pastSeasons = computed(() =>
  challenges.value.filter((c) => String(c?.status || '').toLowerCase() !== 'active')
);

const currentSeason = computed(() =>
  activeSeasons.value[0] || null
);

// ── LOADERS ────────────────────────────────────────────────
const loadChallenges = async () => {
  try {
    const params = organizationId.value ? { organizationId: organizationId.value } : {};
    const r = await api.get('/learning-program-classes/my', { params, skipGlobalLoading: true });
    challenges.value = Array.isArray(r.data?.classes) ? r.data.classes : [];
  } catch {
    challenges.value = [];
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

const loadSeasonSplashes = async () => {
  seasonSplashes.value = [];
  if (!organizationId.value) return;
  try {
    const r = await api.get('/learning-program-classes/discover', {
      params: { organizationId: organizationId.value },
      skipGlobalLoading: true
    });
    const seasons = Array.isArray(r.data?.seasons) ? r.data.seasons : [];
    seasonSplashes.value = seasons.filter((s) => {
      const status = String(s?.status || '').toLowerCase();
      return status === 'active' && (s?.season_splash_enabled === 1 || s?.season_splash_enabled === true);
    });
  } catch {
    seasonSplashes.value = [];
  }
};

const loadStoreConfig = async () => {
  if (!organizationId.value) return;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${organizationId.value}/store-config`, { skipGlobalLoading: true });
    storeConfig.value = data?.store || null;
  } catch { storeConfig.value = null; }
};

const decimalStatKeys = new Set(['total_miles', 'run_miles', 'ruck_miles']);
const fmtStatVal = (stat) => {
  const n = Number(stat.value ?? 0);
  if (decimalStatKeys.has(stat.key)) return n.toFixed(1);
  return n.toLocaleString();
};

const loadClubStats = async () => {
  if (!organizationId.value) return;
  clubStatsLoading.value = true;
  try {
    // Prefer the configured stats list; fall back to public endpoint for legacy fields
    const [statsRes, publicRes] = await Promise.allSettled([
      api.get(`/summit-stats/clubs/${organizationId.value}/stats`, { skipGlobalLoading: true }),
      api.get(`/summit-stats/clubs/${organizationId.value}/public`, { skipGlobalLoading: true, skipAuthRedirect: true })
    ]);
    if (statsRes.status === 'fulfilled' && Array.isArray(statsRes.value?.data?.stats)) {
      clubStatsList.value = statsRes.value.data.stats;
    }
    // Keep the legacy flat object for any other parts of the template that still reference it
    if (publicRes.status === 'fulfilled') {
      clubStats.value = publicRes.value.data?.stats || {};
    }
  } catch {
    clubStats.value = {};
  } finally {
    clubStatsLoading.value = false;
  }
};

const loadRecordBoard = async () => {
  if (!organizationId.value) return;
  recordBoardLoading.value = true;
  try {
    const r = await api.get(`/summit-stats/clubs/${organizationId.value}/record-board`, { skipGlobalLoading: true });
    recordBoard.value = Array.isArray(r.data?.records) ? r.data.records : [];
  } catch {
    recordBoard.value = [];
  } finally {
    recordBoardLoading.value = false;
  }
};

const loadClubManagerContext = async () => {
  if (!isSscRoute.value) return;
  try {
    const r = await api.get('/summit-stats/club-manager-context', { skipGlobalLoading: true });
    clubContext.value = r.data || null;
  } catch {
    clubContext.value = null;
  }
};

// ── SEASON EXPANSION ───────────────────────────────────────
const expandSeason = async (season) => {
  expandedSeasonId.value = season.id;
  expandedSeason.value = season;
  feedFilter.value = 'all';
  await Promise.all([loadTeamData(season.id), loadSeasonFeed(season.id), loadLeaderboard(season.id)]);
};

const collapseSeason = () => {
  expandedSeasonId.value = null;
  expandedSeason.value = null;
};

const loadTeamData = async (classId) => {
  teamLoading.value = true;
  try {
    const uid = myUserId.value;
    const summaryRes = await api.get('/learning-program-classes/my/summary', {
      params: { organizationId: organizationId.value },
      skipGlobalLoading: true
    });
    const teams = summaryRes.data?.teams || [];
    const myTeamEntry = teams.find((t) => Number(t.challengeId) === Number(classId));
    myTeamId.value = myTeamEntry?.teamId ? Number(myTeamEntry.teamId) : null;
    myTeam.value = myTeamEntry ? { team_name: myTeamEntry.teamName } : null;

    if (myTeamId.value) {
      const membersRes = await api.get(
        `/learning-program-classes/${classId}/teams/${myTeamId.value}/members`,
        { skipGlobalLoading: true }
      );
      const raw = Array.isArray(membersRes.data?.members) ? membersRes.data.members : [];
      // Get leaderboard to merge points/stats
      const lbRes = await api.get(`/learning-program-classes/${classId}/leaderboard`, { skipGlobalLoading: true });
      const indivMap = new Map((lbRes.data?.individual || []).map((x, i) => [Number(x.userId || x.user_id), { ...x, rank: i + 1 }]));
      teamMembers.value = raw.map((m) => {
        const lb = indivMap.get(Number(m.user_id || m.userId)) || {};
        return {
          userId: Number(m.user_id || m.userId),
          name: `${m.first_name || ''} ${m.last_name || ''}`.trim(),
          points: Number(lb.totalPoints || lb.total_points || 0),
          workoutCount: Number(lb.workoutCount || lb.workout_count || 0),
          totalMiles: Number(lb.totalMiles || lb.total_miles || 0),
          rank: lb.rank || '—'
        };
      });
    } else {
      teamMembers.value = [];
    }
  } catch {
    teamMembers.value = [];
  } finally {
    teamLoading.value = false;
  }
};

const loadSeasonFeed = async (classId) => {
  seasonFeedLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${classId}/activity`, {
      params: { limit: 50 },
      skipGlobalLoading: true
    });
    seasonFeed.value = Array.isArray(r.data?.workouts) ? r.data.workouts : [];
  } catch {
    seasonFeed.value = [];
  } finally {
    seasonFeedLoading.value = false;
  }
};

const loadLeaderboard = async (classId) => {
  leaderboardLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${classId}/leaderboard`, { skipGlobalLoading: true });
    teamLeaderboard.value = (r.data?.team || []).map((t) => ({
      teamId: Number(t.teamId || t.team_id),
      teamName: t.teamName || t.team_name,
      totalPoints: Number(t.totalPoints || t.total_points || 0)
    }));
    individualLeaderboard.value = (r.data?.individual || []).map((u) => ({
      userId: Number(u.userId || u.user_id),
      name: `${u.firstName || u.first_name || ''} ${u.lastName || u.last_name || ''}`.trim(),
      totalPoints: Number(u.totalPoints || u.total_points || 0)
    }));
  } catch {
    teamLeaderboard.value = [];
    individualLeaderboard.value = [];
  } finally {
    leaderboardLoading.value = false;
  }
};

// ── UPLOAD WORKOUT ─────────────────────────────────────────
const openUpload = () => {
  uploadError.value = '';
  uploadSuccess.value = false;
  uploadForm.value = { activityType: 'Run', distanceMiles: null, durationMinutes: null, notes: '' };
  showUploadForm.value = true;
};

const submitQuickUpload = async () => {
  const season = currentSeason.value;
  if (!season) return;
  uploadError.value = '';
  uploadSuccess.value = false;
  uploadSubmitting.value = true;
  try {
    await api.post(`/learning-program-classes/${season.id}/workouts`, {
      activityType: uploadForm.value.activityType,
      distanceValue: uploadForm.value.distanceMiles || null,
      durationMinutes: uploadForm.value.durationMinutes || null,
      workoutNotes: uploadForm.value.notes || null,
      completedAt: new Date().toISOString()
    });
    uploadSuccess.value = true;
    showUploadForm.value = false;
    // Refresh stats + feed
    await Promise.all([loadClubStats(), loadSummary()]);
  } catch (e) {
    uploadError.value = e?.response?.data?.error?.message || 'Failed to log workout';
  } finally {
    uploadSubmitting.value = false;
  }
};

// ── SEASON ACTIONS ─────────────────────────────────────────
const joinSeason = async (classId) => {
  joiningClassId.value = classId;
  try {
    await api.post(`/learning-program-classes/${classId}/join`);
    await Promise.all([loadChallenges(), loadSummary(), loadSeasonSplashes()]);
  } catch (e) {
    console.error(e);
  } finally {
    joiningClassId.value = null;
  }
};

const applyForCaptain = async (classId) => {
  captainApplyingClassId.value = classId;
  try {
    await api.post(`/learning-program-classes/${classId}/captain-applications`, {});
    await loadSeasonSplashes();
  } catch {} finally {
    captainApplyingClassId.value = null;
  }
};

const submitCreateClub = async () => {
  const name = String(createClubName.value || '').trim();
  if (!name) return;
  createClubSubmitting.value = true;
  try {
    const payload = { name };
    const slug = String(createClubSlug.value || '').trim();
    if (slug) payload.slug = slug;
    const r = await api.post('/summit-stats/clubs', payload);
    createClubSuccess.value = true;
    const club = r.data;
    if (club) agencyStore.setCurrentAgency(club);
    await loadClubManagerContext();
    await agencyStore.fetchUserAgencies();
    const adminSlug = club?.parent_slug || 'ssc';
    await router.replace(`/${adminSlug}/admin`);
  } catch (e) {
    console.error(e);
  } finally {
    createClubSubmitting.value = false;
  }
};

// ── HELPERS ────────────────────────────────────────────────
const getTeamForChallenge = (challengeId) => {
  const t = (summary.value?.teams || []).find((x) => Number(x.challengeId) === Number(challengeId));
  return t?.teamName || null;
};

const challengeRoute = (c) => {
  const id = c?.id;
  if (organizationSlug.value) return `/${organizationSlug.value}/challenges/${id}`;
  return `/challenges/${id}`;
};

const formatStatus = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'closed') return 'Closed';
  return s || '—';
};

const formatDates = (c) => {
  const start = c?.starts_at || c?.startsAt;
  const end = c?.ends_at || c?.endsAt;
  if (!start && !end) return '';
  const fmt = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `Starts ${fmt(start)}`;
  return `Ends ${fmt(end)}`;
};

const fmt = (n) => {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const initials = (name) => {
  if (!name) return '?';
  const parts = String(name).trim().split(' ');
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : String(name).slice(0, 2).toUpperCase();
};

const formatActivity = (t) => {
  if (!t) return 'Workout';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const timeAgo = (ts) => {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

// ── LIFECYCLE ──────────────────────────────────────────────
const loadPendingApplications = async () => {
  if (organizationId.value) return; // skip if already in a club
  pendingApplicationsLoading.value = true;
  try {
    const { data } = await api.get('/summit-stats/my-applications');
    pendingApplications.value = (data?.applications || []).filter((a) => a.status !== 'approved');
  } catch { /* non-fatal */ } finally {
    pendingApplicationsLoading.value = false;
  }
};

onMounted(async () => {
  await loadClubManagerContext();
  await Promise.all([
    loadChallenges(),
    loadSummary(),
    loadSeasonSplashes(),
    loadClubStats(),
    loadRecordBoard(),
    loadStoreConfig(),
    loadPendingApplications()
  ]);
});

watch(organizationId, () => {
  loadChallenges();
  loadSummary();
  loadClubStats();
  loadRecordBoard();
  loadSeasonSplashes();
  loadStoreConfig();
});
</script>

<style scoped>
/* ── ROOT LAYOUT ─────────────────────────────────────────── */
.ssc-hub {
  display: flex;
  min-height: 100vh;
  background: var(--surface-bg, #f8fafc);
}

.ssc-hub-main {
  flex: 1;
  min-width: 0;
  padding: 24px;
  max-width: calc(100% - 300px);
}

/* ── STORE RAIL WIDGET ───────────────────────────────────── */
.store-rail-widget {
  display: flex;
  align-items: center;
  gap: 10px;
  background: linear-gradient(135deg, #eff6ff, #f0fdf4);
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  padding: 12px 14px;
  margin: 12px 12px 0;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s, border-color 0.15s;
  cursor: pointer;
}
.store-rail-widget:hover {
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.14);
  border-color: #93c5fd;
}
.store-rail-widget__icon {
  font-size: 22px;
  flex-shrink: 0;
}
.store-rail-widget__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.store-rail-widget__title {
  font-weight: 700;
  font-size: 13px;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.store-rail-widget__desc {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.store-rail-widget__btn {
  font-size: 12px;
  font-weight: 700;
  color: var(--primary, #2563eb);
  white-space: nowrap;
  flex-shrink: 0;
}

.ssc-hub-feed {
  width: 300px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

@media (max-width: 900px) {
  .ssc-hub { flex-direction: column; }
  .ssc-hub-main { max-width: 100%; }
  .ssc-hub-feed { width: 100%; height: 400px; position: relative; }
}

/* ── HEADER ─────────────────────────────────────────────── */
.hub-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.hub-club-name {
  margin: 0 0 2px;
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text, #0f172a);
}

.hub-tagline {
  margin: 0;
  font-size: 0.88rem;
  color: #64748b;
}

.hub-verify-notice {
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.85rem;
  color: #92400e;
}

/* ── STATS BAR ───────────────────────────────────────────── */
.hub-stats-bar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.hub-stat-icon {
  font-size: 1rem;
  line-height: 1;
}
.hub-stats-bar--loading {
  color: #94a3b8;
  font-size: 0.85rem;
  padding: 8px 0;
}

.hub-stat-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 10px 18px;
  min-width: 80px;
}

.hub-stat-chip--race {
  border-color: #f59e0b;
  background: #fffbeb;
}

.hub-stat-value {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--primary, #1d4ed8);
  line-height: 1;
}

.hub-stat-label {
  font-size: 0.72rem;
  color: #64748b;
  margin-top: 3px;
  text-align: center;
}

/* ── CARDS ───────────────────────────────────────────────── */
/* ── Pending application banner ───────────────────────────────── */
.hub-pending-banner {
  background: #fff;
  border: 1.5px solid #e0e7ff;
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hub-pending-banner--empty {
  border-color: #e2e8f0;
  flex-direction: row;
  align-items: flex-start;
  gap: 14px;
}
.hub-pending-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.hub-pending-icon {
  font-size: 22px;
  flex-shrink: 0;
  line-height: 1;
  margin-top: 2px;
}
.hub-pending-body {
  flex: 1;
}
.hub-pending-body strong { display: block; font-size: 14px; font-weight: 700; color: #1e1b4b; margin-bottom: 3px; }
.hub-pending-body p { margin: 0; font-size: 13px; color: #475569; line-height: 1.5; }
.hub-pending-tag {
  flex-shrink: 0;
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .04em;
  white-space: nowrap;
  align-self: center;
}
.hub-pending-tag--pending { background: #fef9c3; color: #854d0e; border: 1px solid #fde68a; }
.hub-pending-tag--denied  { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
.hub-pending-more {
  font-size: 12px;
  color: #64748b;
  margin: 0;
  padding-top: 4px;
  border-top: 1px solid #f1f5f9;
}
.hub-pending-more a { color: #4f46e5; font-weight: 600; }

/* ── Card ────────────────────────────────────────────────────── */
.hub-card {
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 18px;
}

.hub-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.hub-card-header h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.hub-card-sub {
  font-size: 0.78rem;
  font-weight: 400;
  color: #94a3b8;
  margin-left: 4px;
}

.hub-loading-row {
  color: #94a3b8;
  font-size: 0.85rem;
}

.hub-empty-hint {
  color: #94a3b8;
  font-size: 0.85rem;
  text-align: center;
  padding: 12px 0;
}

/* ── RECORD BOARD ────────────────────────────────────────── */
.record-board-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.record-tile {
  background: var(--surface-bg, #f8fafc);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: default;
  transition: box-shadow 0.15s;
}

.record-tile:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.record-tile-label {
  font-size: 0.72rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}

.record-tile-value {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--primary, #1d4ed8);
  line-height: 1.1;
}

.record-tile-holder {
  font-size: 0.78rem;
  color: #475569;
  margin-top: 3px;
}

/* ── UPLOAD RAILCARD ─────────────────────────────────────── */
.hub-upload-rail {
  background: linear-gradient(135deg, #eff6ff, #f0f9ff);
  border-color: #bfdbfe;
}

.hub-upload-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.hub-upload-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #1e40af;
}

.hub-upload-hint {
  font-size: 0.82rem;
  color: #3b82f6;
  margin-top: 2px;
}

.btn-upload-big {
  white-space: nowrap;
  padding: 11px 22px;
  font-size: 0.95rem;
  font-weight: 700;
}

.quick-upload-form {
  margin-top: 16px;
  border-top: 1px solid #bfdbfe;
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quick-form-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.quick-form-row label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #374151;
}

.quick-form-row input,
.quick-form-row select {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 0.9rem;
}

.quick-form-actions {
  display: flex;
  gap: 10px;
}

.quick-error { color: #dc2626; font-size: 0.85rem; margin: 0; }
.quick-success { color: #16a34a; font-size: 0.85rem; margin: 0; }

/* ── SECTION HEADERS ─────────────────────────────────────── */
.hub-section {
  margin-bottom: 20px;
}

.hub-section-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #475569;
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.hub-section-toggle {
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #64748b;
  width: 100%;
  text-align: left;
  margin-bottom: 8px;
}

.hub-section-toggle:hover { background: #f8fafc; }

/* ── SEASON RAILCARDS ────────────────────────────────────── */
.season-rails {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.season-rail-card {
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  padding: 16px 18px;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.season-rail-card:hover {
  border-color: var(--primary, #1d4ed8);
  box-shadow: 0 2px 12px rgba(29, 78, 216, 0.1);
}

.rail-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.rail-season-name {
  font-weight: 700;
  font-size: 1rem;
  color: #0f172a;
}

.rail-badge {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.rail-badge--active {
  background: #dcfce7;
  color: #15803d;
}

.rail-team, .rail-dates {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 3px;
}

.rail-cta {
  margin-top: 10px;
  text-align: right;
}

.rail-cta-text {
  font-size: 0.82rem;
  color: var(--primary, #1d4ed8);
  font-weight: 600;
}

/* ── PAST SEASONS ────────────────────────────────────────── */
.past-seasons-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.past-season-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  text-decoration: none;
  color: #374151;
  font-size: 0.9rem;
  transition: background 0.1s;
}

.past-season-link:hover { background: #f8fafc; }

.past-season-status {
  font-size: 0.78rem;
  color: #94a3b8;
}

/* ── PERSONAL STATS ──────────────────────────────────────── */
.personal-stats-row {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.personal-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.ps-value {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--primary, #1d4ed8);
}

.ps-label {
  font-size: 0.78rem;
  color: #64748b;
}

/* ── SEASON SPLASH ───────────────────────────────────────── */
.hub-splashes {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
}

.season-splash-card {
  border: 1px solid rgba(16, 146, 169, 0.28);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(16, 146, 169, 0.08), rgba(245, 141, 24, 0.08));
  padding: 14px 16px;
}

.splash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.splash-header h3 { margin: 0; font-size: 1rem; }

.splash-badge {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #ddd;
}

.splash-copy {
  margin: 0 0 10px;
  font-size: 0.88rem;
  color: #64748b;
}

.splash-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* ── CREATE CLUB ─────────────────────────────────────────── */
.hub-create-club h3 { margin: 0 0 8px; }

.create-club-form {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.create-club-form input {
  flex: 1;
  min-width: 150px;
  padding: 9px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.92rem;
}

.create-club-verify h3 { color: #92400e; }

.success-msg { color: #16a34a; font-weight: 500; }

/* ── 3-COLUMN SEASON VIEW ────────────────────────────────── */
.season-view-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.btn-back {
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 7px 14px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #475569;
  transition: background 0.1s;
}
.btn-back:hover { background: #f1f5f9; }

.season-view-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.season-view-title h2 { margin: 0; font-size: 1.1rem; }

.season-view-badge {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: #dcfce7;
  color: #15803d;
  font-weight: 600;
}

.season-three-col {
  display: grid;
  grid-template-columns: 240px 1fr 240px;
  gap: 14px;
  min-height: calc(100vh - 180px);
}

@media (max-width: 900px) {
  .season-three-col { grid-template-columns: 1fr; }
}

.season-col {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.col-head {
  padding: 12px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.88rem;
  font-weight: 700;
  color: #374151;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.col-loading {
  padding: 16px;
  color: #94a3b8;
  font-size: 0.85rem;
}

.col-empty {
  padding: 20px;
  color: #94a3b8;
  font-size: 0.85rem;
  text-align: center;
  list-style: none;
}

/* Left: Team */
.team-name-bar {
  padding: 10px 14px 0;
  font-size: 0.9rem;
}

.team-stat-chips {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  flex-wrap: wrap;
}

.t-chip {
  background: #eff6ff;
  border-radius: 8px;
  padding: 6px 10px;
  text-align: center;
  font-size: 0.78rem;
}

.t-chip span {
  display: block;
  font-weight: 700;
  font-size: 1rem;
  color: var(--primary, #1d4ed8);
}

.t-chip small {
  color: #64748b;
}

.team-members-label {
  padding: 6px 14px 4px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.team-members-list {
  list-style: none;
  margin: 0;
  padding: 0 0 8px;
  flex: 1;
  overflow-y: auto;
}

.team-member-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid #f1f5f9;
}

.tm-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary, #1d4ed8);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tm-info {
  flex: 1;
  min-width: 0;
}

.tm-name {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tm-stats {
  font-size: 0.75rem;
  color: #64748b;
}

.tm-rank {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 600;
}

/* Middle: Season Feed */
.feed-filter-btns {
  display: flex;
  gap: 4px;
}

.feed-filter-btn {
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 0.75rem;
  cursor: pointer;
  color: #64748b;
  transition: all 0.15s;
}

.feed-filter-btn.active {
  background: var(--primary, #1d4ed8);
  border-color: var(--primary, #1d4ed8);
  color: #fff;
}

.season-feed-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
}

.season-feed-item {
  padding: 10px 14px;
  border-bottom: 1px solid #f1f5f9;
}

.sf-top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 4px;
}

.sf-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #475569;
  font-size: 0.65rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sf-who {
  flex: 1;
}

.sf-who strong {
  display: block;
  font-size: 0.83rem;
  color: #0f172a;
}

.sf-activity {
  font-size: 0.75rem;
  color: #64748b;
}

.sf-pts {
  font-size: 0.8rem;
  font-weight: 700;
  color: #16a34a;
}

.sf-stats {
  display: flex;
  gap: 8px;
  padding-left: 36px;
  font-size: 0.78rem;
  color: #475569;
  margin-bottom: 2px;
}

.sf-when {
  padding-left: 36px;
  font-size: 0.73rem;
  color: #94a3b8;
}

/* Right: Rankings */
.rankings-section {
  padding: 10px 14px;
  border-bottom: 1px solid #f1f5f9;
}

.rankings-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin-bottom: 8px;
}

.rankings-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.rankings-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 0.85rem;
  border-bottom: 1px solid #f8fafc;
}

.rankings-item:last-child { border-bottom: none; }

.rankings-item--mine,
.rankings-item--me {
  background: #eff6ff;
  border-radius: 6px;
  padding-left: 6px;
  padding-right: 6px;
}

.rank-pos {
  width: 18px;
  font-weight: 700;
  color: #94a3b8;
  font-size: 0.75rem;
  text-align: right;
  flex-shrink: 0;
}

.rank-name {
  flex: 1;
  color: #0f172a;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rank-value {
  font-weight: 700;
  color: var(--primary, #1d4ed8);
  font-size: 0.82rem;
}

/* ── SHARED BUTTONS ──────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 18px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  text-decoration: none;
  transition: opacity 0.15s, background 0.15s;
}

.btn-primary {
  background: var(--primary, #1d4ed8);
  color: #fff;
}

.btn-primary:hover { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-secondary {
  background: #f1f5f9;
  color: #374151;
  border-color: #e2e8f0;
}

.btn-secondary:hover { background: #e2e8f0; }

.btn-sm {
  padding: 6px 12px;
  font-size: 0.82rem;
}
</style>
