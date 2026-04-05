<template>
  <div class="ssc-dashboard">
    <section class="dashboard-hero card">
      <div>
        <p class="eyebrow">Summit Stats Team Challenge</p>
        <h1>My Dashboard</h1>
        <p class="hero-copy">
          Your personal competition home for clubs, seasons, records, and account details.
        </p>
      </div>
      <div class="hero-actions">
        <router-link :to="`/${orgSlug}/clubs`" class="btn btn-primary">Browse Clubs</router-link>
      </div>
    </section>

    <section class="stats-grid">
      <article class="stat-card">
        <span class="stat-label">Total points</span>
        <strong>{{ formatWhole(summary?.stats?.totalPoints) }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">Workouts logged</span>
        <strong>{{ formatWhole(summary?.stats?.totalWorkouts) }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">All-time miles</span>
        <strong>{{ formatDecimal(summary?.stats?.totalMiles) }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">Longest run</span>
        <strong>{{ formatDecimal(summary?.stats?.longestRunMiles) }} mi</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">Best workout</span>
        <strong>{{ formatWhole(summary?.stats?.bestWorkoutPoints) }} pts</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">Longest workout</span>
        <strong>{{ formatWhole(summary?.stats?.longestWorkoutMinutes) }} min</strong>
      </article>
    </section>

    <section v-if="loading" class="card">
      Loading your dashboard…
    </section>

    <section v-if="dashboardError" class="card card-error">
      {{ dashboardError }}
    </section>

    <section
      v-if="showStartClub"
      class="card founder-card"
      :class="{ 'founder-card--disabled': !clubContext?.emailVerified }"
    >
      <div class="section-header">
        <div>
          <h2>Start Your Club</h2>
          <p>Founders are promoted only inside the club they create. This does not grant broad admin access.</p>
        </div>
      </div>

      <div v-if="!clubContext?.emailVerified" class="founder-notice">
        Verify your email before starting your club. After that, you can create your club and move into season setup.
      </div>

      <form v-else class="founder-form" @submit.prevent="submitCreateClub">
        <div class="form-row">
          <label>
            Club name
            <input v-model="createClubForm.name" type="text" required placeholder="Peak City Run Club" />
          </label>
          <label>
            URL slug
            <input v-model="createClubForm.slug" type="text" placeholder="Optional short slug" />
          </label>
        </div>
        <div class="form-row">
          <label>
            City
            <input v-model="createClubForm.city" type="text" placeholder="Denver" />
          </label>
          <label>
            State
            <input v-model="createClubForm.state" type="text" maxlength="2" placeholder="CO" />
          </label>
        </div>
        <label>
          Who is this club for?
          <textarea
            v-model="createClubForm.summary"
            rows="3"
            placeholder="Tell us about the type of athletes, community, and competition culture you want to build."
          />
        </label>
        <label class="checkbox-row">
          <input v-model="createClubForm.timelineAcknowledged" type="checkbox" />
          <span>I understand club setup is a serious process and may include review, configuration, and launch steps.</span>
        </label>
        <div v-if="createClubError" class="inline-error">{{ createClubError }}</div>
        <div class="founder-actions">
          <button type="submit" class="btn btn-primary" :disabled="createClubSubmitting">
            {{ createClubSubmitting ? 'Creating…' : 'Create Club' }}
          </button>
        </div>
      </form>
    </section>

    <section class="grid-two">
      <article class="card">
        <div class="section-header">
          <div>
            <h2>Club Access</h2>
            <p v-if="summary?.pendingClubAccess?.hasClub">Your active clubs and competition roles.</p>
            <p v-else>You're in SSC, but you still need a club to unlock the full competition experience.</p>
          </div>
        </div>

        <div v-if="memberships.length" class="stack-list">
          <div v-for="membership in memberships" :key="`${membership.clubId}-${membership.classId || 'club'}`" class="membership-card">
            <div class="membership-top">
              <div>
                <strong>{{ membership.clubName }}</strong>
                <div class="muted">{{ membershipLocation(membership) }}</div>
              </div>
              <span class="pill" :class="pillClass(membership.membershipStatus || membership.clubRole)">
                {{ membershipBadgeText(membership) }}
              </span>
            </div>
            <div class="membership-body">
              <div v-if="membership.teamName" class="meta-line">Team: {{ membership.teamName }}</div>
              <div v-if="membership.className" class="meta-line">Season: {{ membership.className }}</div>
              <div class="meta-line">
                {{ formatWhole(membership.totalPoints) }} pts • {{ formatDecimal(membership.totalMiles) }} mi • {{ formatWhole(membership.workoutCount) }} workouts
              </div>
            </div>
            <div class="membership-actions">
              <button type="button" class="btn btn-secondary btn-sm" @click="openClub(membership.clubId)">
                Open Club
              </button>
              <button
                v-if="isManagedClub(membership.clubId)"
                type="button"
                class="btn btn-secondary btn-sm"
                @click="switchToClubContext(membership.clubId, 'settings')"
              >
                Club Settings
              </button>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <p>No active club memberships yet.</p>
          <router-link :to="`/${orgSlug}/clubs`" class="btn btn-primary btn-sm">Browse Clubs</router-link>
        </div>
      </article>

      <article class="card">
        <div class="section-header">
          <div>
            <h2>Account Snapshot</h2>
            <p>Your profile, preferences, and billing status.</p>
          </div>
        </div>

        <dl class="profile-grid">
          <div>
            <dt>Name</dt>
            <dd>{{ fullName }}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{{ summary?.member?.email || '—' }}</dd>
          </div>
          <div>
            <dt>Timezone</dt>
            <dd>{{ summary?.member?.timezone || 'Not set' }}</dd>
          </div>
          <div>
            <dt>Billing</dt>
            <dd>{{ summary?.account?.billingPlan || 'Free account' }}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{{ summary?.account?.phone || 'Not set' }}</dd>
          </div>
          <div>
            <dt>Gender</dt>
            <dd>{{ formatText(summary?.account?.gender) }}</dd>
          </div>
          <div>
            <dt>Average miles / week</dt>
            <dd>{{ summary?.account?.averageMilesPerWeek == null ? 'Not set' : `${formatDecimal(summary.account.averageMilesPerWeek)} mi` }}</dd>
          </div>
          <div>
            <dt>Physical activity / week</dt>
            <dd>{{ summary?.account?.averageHoursPerWeek == null ? 'Not set' : `${formatDecimal(summary.account.averageHoursPerWeek)} hrs` }}</dd>
          </div>
        </dl>

        <div class="long-answer-list">
          <div>
            <h3>How you heard about the club</h3>
            <p>{{ formatParagraph(summary?.account?.heardAboutClub) }}</p>
          </div>
          <div>
            <h3>Running and fitness background</h3>
            <p>{{ formatParagraph(summary?.account?.runningFitnessBackground) }}</p>
          </div>
          <div>
            <h3>Current activities</h3>
            <p>{{ formatParagraph(summary?.account?.currentFitnessActivities) }}</p>
          </div>
        </div>

        <div class="membership-actions">
          <button type="button" class="btn btn-secondary btn-sm" @click="showStartClub = !showStartClub">
            {{ showStartClub ? 'Close Founder Setup' : 'Start Your Club' }}
          </button>
        </div>
      </article>
    </section>

    <section class="grid-two">
      <article class="card">
        <div class="section-header">
          <div>
            <h2>Current and Upcoming Seasons</h2>
            <p>Jump back into what’s live now or coming up next.</p>
          </div>
        </div>
        <div v-if="currentSeasons.length" class="season-list">
          <div v-for="season in currentSeasons" :key="season.classId" class="season-card">
            <div class="season-card-top">
              <div>
                <strong>{{ season.className }}</strong>
                <div class="muted">{{ season.clubName }}</div>
              </div>
              <span class="pill" :class="pillClass(season.bucket)">{{ season.bucket === 'upcoming' ? 'Upcoming' : 'Current' }}</span>
            </div>
            <div class="season-meta">
              <span v-if="season.teamName">Team: {{ season.teamName }}</span>
              <span>{{ formatSeasonDates(season) }}</span>
            </div>
            <div class="season-totals">
              {{ formatWhole(season.totalPoints) }} pts • {{ formatDecimal(season.totalMiles) }} mi • {{ formatWhole(season.workoutCount) }} workouts
            </div>
            <button type="button" class="btn btn-primary btn-sm" @click="openSeason(season)">
              Open Season
            </button>
          </div>
        </div>
        <div v-else class="empty-state">
          <p>No current seasons yet. Browse clubs or wait for the next season launch.</p>
        </div>
      </article>

      <article class="card">
        <div class="section-header">
          <div>
            <h2>Past Seasons</h2>
            <p>Your completed season history and archived results.</p>
          </div>
        </div>
        <div v-if="pastSeasons.length" class="season-history">
          <button
            v-for="season in pastSeasons"
            :key="season.classId"
            type="button"
            class="season-history-row"
            @click="openSeason(season)"
          >
            <span>
              <strong>{{ season.className }}</strong>
              <span class="muted"> · {{ season.clubName }}</span>
            </span>
            <span>{{ formatWhole(season.totalPoints) }} pts</span>
          </button>
        </div>
        <div v-else class="empty-state">
          <p>No archived seasons yet.</p>
        </div>
      </article>
    </section>

    <section class="grid-two">
      <article class="card">
        <div class="section-header">
          <div>
            <h2>Applications</h2>
            <p>See where your club requests stand.</p>
          </div>
        </div>
        <div v-if="pendingApplications.length" class="stack-list">
          <div v-for="application in pendingApplications" :key="application.id" class="application-card">
            <div class="membership-top">
              <strong>{{ application.clubName }}</strong>
              <span class="pill" :class="pillClass(application.status)">{{ application.status }}</span>
            </div>
            <div class="muted">Applied {{ formatDate(application.appliedAt) }}</div>
          </div>
        </div>
        <div v-else class="empty-state">
          <p>No open applications right now.</p>
        </div>
      </article>

      <article v-if="managedClubs.length" class="card">
        <div class="section-header">
          <div>
            <h2>Manager Tools</h2>
            <p>Your club-scoped management access lives here, not in the personal dashboard header.</p>
          </div>
        </div>
        <div class="stack-list">
          <div v-for="club in managedClubs" :key="club.id" class="membership-card">
            <div class="membership-top">
              <div>
                <strong>{{ club.name }}</strong>
                <div class="muted">{{ membershipLocation(club) }}</div>
              </div>
              <span class="pill" :class="pillClass(club.club_role)">{{ clubRoleLabel(club.club_role) }}</span>
            </div>
            <div class="membership-actions">
              <button type="button" class="btn btn-secondary btn-sm" @click="switchToClubContext(club.id, 'dashboard')">
                Open Club
              </button>
              <button type="button" class="btn btn-secondary btn-sm" @click="switchToClubContext(club.id, 'seasons')">
                Season Management
              </button>
              <button type="button" class="btn btn-secondary btn-sm" @click="switchToClubContext(club.id, 'settings')">
                Club Settings
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../store/agency';
import api from '../services/api';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const orgSlug = computed(() => String(route.params?.organizationSlug || 'ssc').toLowerCase());

const loading = ref(false);
const dashboardError = ref('');
const summary = ref(null);
const applications = ref([]);
const clubContext = ref(null);
const showStartClub = ref(false);
const createClubSubmitting = ref(false);
const createClubError = ref('');
const createClubForm = reactive({
  name: '',
  slug: '',
  city: '',
  state: '',
  summary: '',
  timelineAcknowledged: false
});

const memberships = computed(() => Array.isArray(summary.value?.memberships) ? summary.value.memberships : []);
const currentSeasons = computed(() => Array.isArray(summary.value?.seasons?.current) ? summary.value.seasons.current : []);
const pastSeasons = computed(() => Array.isArray(summary.value?.seasons?.past) ? summary.value.seasons.past : []);
const pendingApplications = computed(() => (applications.value || []).filter((app) => String(app.status || '').toLowerCase() !== 'approved'));
const managedClubs = computed(() => Array.isArray(clubContext.value?.managedClubs) ? clubContext.value.managedClubs : []);
const fullName = computed(() => {
  const first = String(summary.value?.member?.firstName || '').trim();
  const last = String(summary.value?.member?.lastName || '').trim();
  return `${first} ${last}`.trim() || 'Your account';
});

const loadDashboard = async () => {
  loading.value = true;
  dashboardError.value = '';
  try {
    const [dashboardRes, applicationsRes, contextRes] = await Promise.all([
      api.get('/summit-stats/me/dashboard', { skipGlobalLoading: true }),
      api.get('/summit-stats/my-applications', { skipGlobalLoading: true }),
      api.get('/summit-stats/club-manager-context', { skipGlobalLoading: true })
    ]);
    summary.value = dashboardRes.data || null;
    applications.value = applicationsRes.data?.applications || [];
    clubContext.value = contextRes.data || null;
  } catch (error) {
    dashboardError.value = error?.response?.data?.error?.message || 'Failed to load your SSC dashboard.';
  } finally {
    loading.value = false;
  }
};

const formatWhole = (value) => Number(value || 0).toLocaleString();
const formatDecimal = (value) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
const formatText = (value) => String(value || '').trim() || 'Not set';
const formatParagraph = (value) => String(value || '').trim() || 'Nothing added yet.';
const formatDate = (value) => {
  if (!value) return 'recently';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const formatSeasonDates = (season) => {
  if (!season?.startsAt && !season?.endsAt) return 'Dates not set';
  const fmt = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (season.startsAt && season.endsAt) return `${fmt(season.startsAt)} - ${fmt(season.endsAt)}`;
  if (season.startsAt) return `Starts ${fmt(season.startsAt)}`;
  return `Ends ${fmt(season.endsAt)}`;
};
const membershipLocation = (entry) => [entry?.city, entry?.state].filter(Boolean).join(', ') || 'Location not set';
const clubRoleLabel = (role) => {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'manager') return 'Manager';
  if (normalized === 'assistant_manager') return 'Assistant manager';
  return 'Member';
};
const membershipBadgeText = (membership) => {
  if (membership?.clubRole) return clubRoleLabel(membership.clubRole);
  const status = String(membership?.membershipStatus || '').toLowerCase();
  if (status === 'active') return 'Active member';
  if (status === 'completed') return 'Past member';
  return 'Member';
};
const pillClass = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (['active', 'current', 'manager'].includes(normalized)) return 'pill--green';
  if (['upcoming', 'pending', 'assistant_manager'].includes(normalized)) return 'pill--blue';
  if (['denied', 'closed', 'archived'].includes(normalized)) return 'pill--red';
  return 'pill--neutral';
};

const currentUserAgencies = computed(() => {
  const list = agencyStore.userAgencies?.value ?? agencyStore.userAgencies ?? [];
  return Array.isArray(list) ? list : [];
});

const switchToClubContext = async (clubId, target = 'dashboard') => {
  const match = currentUserAgencies.value.find((agency) => Number(agency?.id) === Number(clubId));
  if (match) {
    agencyStore.setCurrentAgency(match);
  }
  if (target === 'settings') {
    await router.push(`/${orgSlug.value}/club/settings`);
    return;
  }
  if (target === 'seasons') {
    await router.push(`/${orgSlug.value}/club/seasons`);
    return;
  }
  await router.push(`/${orgSlug.value}/challenges`);
};

const openSeason = async (season) => {
  if (!season?.classId) return;
  await router.push(`/${orgSlug.value}/challenges/${season.classId}`);
};

const openClub = async (clubId) => {
  const clubSeason = currentSeasons.value.find((season) => Number(season.clubId) === Number(clubId));
  if (clubSeason) {
    await openSeason(clubSeason);
    return;
  }
  await switchToClubContext(clubId, 'dashboard');
};

const isManagedClub = (clubId) => managedClubs.value.some((club) => Number(club.id) === Number(clubId));

const submitCreateClub = async () => {
  createClubError.value = '';
  if (!createClubForm.timelineAcknowledged) {
    createClubError.value = 'Please confirm that you understand club setup includes review and launch steps.';
    return;
  }
  if (!String(createClubForm.name || '').trim()) {
    createClubError.value = 'Club name is required.';
    return;
  }
  createClubSubmitting.value = true;
  try {
    const payload = {
      name: String(createClubForm.name || '').trim(),
      slug: String(createClubForm.slug || '').trim() || undefined,
      city: String(createClubForm.city || '').trim() || undefined,
      state: String(createClubForm.state || '').trim().toUpperCase() || undefined
    };
    const { data } = await api.post('/summit-stats/clubs', payload);
    await agencyStore.fetchUserAgencies();
    const match = currentUserAgencies.value.find((agency) => Number(agency?.id) === Number(data?.id));
    if (match) {
      agencyStore.setCurrentAgency(match);
    } else if (data?.id) {
      agencyStore.setCurrentAgency(data);
    }
    createClubForm.name = '';
    createClubForm.slug = '';
    createClubForm.city = '';
    createClubForm.state = '';
    createClubForm.summary = '';
    createClubForm.timelineAcknowledged = false;
    showStartClub.value = false;
    await loadDashboard();
    await router.push(`/${orgSlug.value}/club/seasons`);
  } catch (error) {
    createClubError.value = error?.response?.data?.error?.message || 'Failed to create your club.';
  } finally {
    createClubSubmitting.value = false;
  }
};

onMounted(async () => {
  if (!currentUserAgencies.value.length) {
    await agencyStore.fetchUserAgencies();
  }
  await loadDashboard();
});

watch(() => route.params.organizationSlug, () => {
  loadDashboard();
});
</script>

<style scoped>
.ssc-dashboard {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px;
}

.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 24px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
  padding: 24px;
}

.dashboard-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  margin-bottom: 20px;
  background: linear-gradient(135deg, #fff8ef 0%, #f8fbff 100%);
}

.eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
  color: #d97706;
  font-weight: 700;
}

.dashboard-hero h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1;
}

.hero-copy {
  margin: 12px 0 0;
  max-width: 640px;
  color: #556274;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.stats-grid,
.grid-two {
  display: grid;
  gap: 18px;
  margin-bottom: 20px;
}

.stats-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.grid-two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.stat-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label {
  color: #64748b;
  font-size: 0.88rem;
}

.stat-card strong {
  font-size: 1.55rem;
  color: #0f172a;
}

.section-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.section-header h2 {
  margin: 0 0 6px;
  font-size: 1.2rem;
}

.section-header p {
  margin: 0;
  color: #64748b;
}

.stack-list {
  display: grid;
  gap: 14px;
}

.membership-card,
.application-card,
.season-card {
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  padding: 16px;
  background: #fbfdff;
}

.membership-top,
.season-card-top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.membership-body,
.season-meta,
.season-totals {
  margin-top: 10px;
  color: #526071;
}

.meta-line + .meta-line,
.season-meta span + span {
  display: inline-block;
  margin-left: 10px;
}

.membership-actions,
.founder-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}

.pill--green {
  background: #dcfce7;
  color: #166534;
}

.pill--blue {
  background: #dbeafe;
  color: #1d4ed8;
}

.pill--red {
  background: #fee2e2;
  color: #b91c1c;
}

.pill--neutral {
  background: #e2e8f0;
  color: #334155;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin: 0 0 18px;
}

.profile-grid dt {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
  margin-bottom: 4px;
}

.profile-grid dd {
  margin: 0;
  color: #0f172a;
}

.long-answer-list {
  display: grid;
  gap: 14px;
}

.long-answer-list h3 {
  margin: 0 0 4px;
  font-size: 0.95rem;
}

.long-answer-list p,
.muted {
  margin: 0;
  color: #64748b;
}

.season-list,
.season-history {
  display: grid;
  gap: 14px;
}

.season-history-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}

.empty-state {
  border: 1px dashed #cbd5e1;
  border-radius: 16px;
  padding: 18px;
  color: #64748b;
}

.empty-state p {
  margin: 0 0 12px;
}

.founder-card {
  margin-bottom: 20px;
}

.founder-card--disabled {
  opacity: 0.9;
}

.founder-form {
  display: grid;
  gap: 14px;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.founder-form label {
  display: grid;
  gap: 6px;
  color: #0f172a;
  font-weight: 600;
}

.founder-form input,
.founder-form textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 14px;
  padding: 12px 14px;
  font: inherit;
  font-weight: 400;
}

.checkbox-row {
  grid-template-columns: auto 1fr;
  align-items: flex-start;
}

.checkbox-row input {
  width: auto;
  margin-top: 3px;
}

.founder-notice,
.inline-error,
.card-error {
  border-radius: 14px;
  padding: 14px 16px;
}

.founder-notice {
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fed7aa;
}

.inline-error,
.card-error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

@media (max-width: 1080px) {
  .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .ssc-dashboard {
    padding: 16px;
  }

  .dashboard-hero,
  .grid-two,
  .stats-grid,
  .form-row,
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-hero {
    display: grid;
  }

  .membership-top,
  .season-card-top,
  .season-history-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
