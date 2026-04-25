<template>
  <div class="team-dashboard">
    <div v-if="loading" class="td-loading">Loading team…</div>
    <div v-else-if="error" class="td-error">{{ error }}</div>
    <div v-else-if="!team" class="td-error">Team not found.</div>
    <template v-else>
      <!-- Team Banner -->
      <div
        class="td-banner"
        :style="teamBannerStyle"
      >
        <div class="td-banner-overlay">
          <button class="td-back-btn" type="button" @click="goToSeason">
            ← {{ challenge?.class_name || 'Season' }}
          </button>
          <div class="td-banner-content">
            <img v-if="teamLogoUrl" :src="teamLogoUrl" class="td-logo" alt="Team logo" />
            <div class="td-header-text">
              <h1 class="td-team-name">{{ team.team_name }}</h1>
              <p class="td-captain-name" v-if="team.manager_first_name">
                Captain: {{ team.manager_first_name }} {{ team.manager_last_name }}
              </p>
            </div>
          </div>
          <div v-if="isCaptainOrManager" class="td-banner-actions">
            <button class="td-manage-btn" type="button" @click="teamManagementOpen = !teamManagementOpen">
              {{ teamManagementOpen ? 'Close Team Management' : 'Manage Team' }}
            </button>
          </div>
          <!-- Captain branding controls -->
          <div v-if="isCaptainOrManager" class="td-branding-bar">
            <label class="td-brand-btn" title="Upload team logo">
              🖼 Logo
              <input type="file" accept="image/*" class="td-file-input" @change="onLogoUpload" />
            </label>
            <label class="td-brand-btn" title="Upload team banner">
              🎨 Banner
              <input type="file" accept="image/*" class="td-file-input" @change="onBannerUpload" />
            </label>
            <button v-if="team.logo_path" class="td-brand-btn td-brand-btn--danger" @click="removeLogo">✕ Logo</button>
            <button v-if="team.banner_path" class="td-brand-btn td-brand-btn--danger" @click="removeBanner">✕ Banner</button>
            <span v-if="brandingStatus" class="td-brand-status">{{ brandingStatus }}</span>
          </div>
        </div>
      </div>

      <div v-if="teamManagementOpen" class="td-manage-panel">
        <div class="td-manage-panel__head">
          <div>
            <h2>Team Management</h2>
            <p class="td-manage-panel__hint">Manage branding, rename the team when allowed, and send password resets.</p>
          </div>
          <button class="td-manage-link-btn" type="button" @click="goToDraftReport">Open Draft Report</button>
        </div>

        <div class="td-manage-grid">
          <section class="td-manage-card">
            <h3>Team Name</h3>
            <form class="td-manage-form" @submit.prevent="saveTeamName">
              <input
                v-model.trim="teamNameDraft"
                class="td-manage-input"
                type="text"
                placeholder="Team name"
                maxlength="120"
                :disabled="!canEditTeamName"
              />
              <button class="td-manage-save" type="submit" :disabled="savingTeamName || !canEditTeamName || !teamNameDraft.trim()">
                {{ savingTeamName ? 'Saving…' : 'Save Name' }}
              </button>
            </form>
            <p class="td-manage-panel__hint">
              If renaming is locked for the season, the backend will only allow the nickname suffix mode that is configured for captains.
            </p>
            <p v-if="teamManagementStatus" class="td-manage-status">{{ teamManagementStatus }}</p>
          </section>

          <section class="td-manage-card">
            <h3>Members</h3>
            <ul class="td-manage-members">
              <li v-for="m in members" :key="m.provider_user_id" class="td-manage-member">
                <div class="td-manage-member__info">
                  <strong>{{ m.first_name }} {{ m.last_name }}</strong>
                  <span v-if="m.is_team_captain" class="td-manage-pill">Captain</span>
                </div>
                <button
                  class="td-manage-reset-btn"
                  type="button"
                  :disabled="sendingResetFor === m.provider_user_id"
                  @click="sendPasswordReset(m)"
                >
                  {{ sendingResetFor === m.provider_user_id ? 'Sending…' : 'Send Reset Link' }}
                </button>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <!-- Team Stats Row -->
      <div class="td-stats-row">
        <div class="td-stat-card">
          <div class="td-stat-val">{{ members.length }}</div>
          <div class="td-stat-label">Members</div>
        </div>
        <div class="td-stat-card">
          <div class="td-stat-val">{{ teamTotalPoints }}</div>
          <div class="td-stat-label">Points</div>
        </div>
        <div class="td-stat-card">
          <div class="td-stat-val">{{ teamTotalMiles }}</div>
          <div class="td-stat-label">Miles</div>
        </div>
        <div class="td-stat-card">
          <div class="td-stat-val">{{ teamWorkoutCount }}</div>
          <div class="td-stat-label">Workouts</div>
        </div>
      </div>

      <!-- Tab Nav -->
      <div class="td-tabs">
        <button
          class="td-tab"
          :class="{ active: activeTab === 'feed' }"
          @click="activeTab = 'feed'"
        >Activity</button>
        <button
          class="td-tab"
          :class="{ active: activeTab === 'chat' }"
          @click="activeTab = 'chat'"
        >Team Chat</button>
        <button
          class="td-tab"
          :class="{ active: activeTab === 'roster' }"
          @click="activeTab = 'roster'"
        >Roster</button>
      </div>

      <!-- Activity Feed Tab -->
      <div v-if="activeTab === 'feed'" class="td-tab-content">
        <ChallengeActivityFeed
          v-if="challengeId"
          :workouts="activity"
          :challenge-id="challengeId"
          :my-team-id="teamIdNum"
          :teams="[team]"
          :show-all-teams-toggle="false"
          :locked-to-team="true"
          :date-nav="true"
          class="td-feed"
        />
        <div v-if="activityLoading" class="td-loading">Loading activity…</div>
        <div v-if="!activityLoading && activity.length === 0" class="td-empty">No workouts logged yet.</div>
      </div>

      <!-- Team Chat Tab -->
      <div v-if="activeTab === 'chat'" class="td-tab-content td-chat-wrap">
        <ChallengeMessageFeed
          v-if="challengeId"
          :challenge-id="challengeId"
          :team-id="teamIdNum"
          :default-scope="'team'"
          :show-scope-toggle="false"
          class="td-chat"
        />
      </div>

      <!-- Roster Tab -->
      <div v-if="activeTab === 'roster'" class="td-tab-content">
        <div v-if="membersLoading" class="td-loading">Loading roster…</div>
        <ul v-else class="td-roster">
          <li v-for="m in members" :key="m.provider_user_id" class="td-roster-item">
            <span class="td-roster-captain" v-if="m.is_team_captain" title="Captain">★</span>
            <span class="td-roster-name">{{ m.first_name }} {{ m.last_name }}</span>
            <span class="td-roster-role" v-if="m.is_team_captain">Captain</span>
          </li>
          <li v-if="members.length === 0" class="td-empty">No roster members yet.</li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../store/auth.js';
import api from '../services/api.js';
import { toUploadsUrl } from '../utils/uploadsUrl.js';
import ChallengeActivityFeed from '../components/challenge/ChallengeActivityFeed.vue';
import ChallengeMessageFeed from '../components/challenge/ChallengeMessageFeed.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const challengeId = computed(() => Number(route.params.id || 0));
const teamIdNum = computed(() => Number(route.params.teamId || 0));
const orgSlug = computed(() => route.params.organizationSlug || '');

const challenge = ref(null);
const team = ref(null);
const members = ref([]);
const activity = ref([]);

const loading = ref(true);
const activityLoading = ref(false);
const membersLoading = ref(false);
const error = ref('');
const activeTab = ref('feed');
const brandingStatus = ref('');
const teamManagementOpen = ref(false);
const teamManagementStatus = ref('');
const savingTeamName = ref(false);
const sendingResetFor = ref(null);
const teamNameDraft = ref('');

const isCaptainOrManager = computed(() => {
  const myId = Number(authStore.user?.id || 0);
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'club_manager' || role === 'assistant_manager' || role === 'super_admin') return true;
  return Number(team.value?.team_manager_user_id || 0) === myId;
});

const resolveAssetUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const base = toUploadsUrl(path) || '';
  const v = encodeURIComponent(String(path || Date.now()));
  return `${base}${base.includes('?') ? '&' : '?'}v=${v}`;
};

const teamLogoUrl = computed(() => resolveAssetUrl(team.value?.logo_path));
const teamBannerUrl = computed(() => resolveAssetUrl(team.value?.banner_path || challenge.value?.banner_image_path));

const teamBannerStyle = computed(() => {
  if (teamBannerUrl.value) {
    return { backgroundImage: `url(${teamBannerUrl.value})` };
  }
  return {};
});

const canEditTeamName = computed(() => isCaptainOrManager.value);

const teamTotalPoints = computed(() => {
  return activity.value
    .filter((w) => String(w.proof_status || '') !== 'rejected' && String(w.proof_status || '') !== 'pending')
    .reduce((sum, w) => sum + Number(w.points_awarded || 0), 0);
});

const teamTotalMiles = computed(() => {
  const miles = activity.value
    .filter((w) => String(w.proof_status || '') !== 'rejected' && String(w.proof_status || '') !== 'pending')
    .reduce((sum, w) => sum + Number(w.distance_miles || 0), 0);
  return miles.toFixed(1);
});

const teamWorkoutCount = computed(() => {
  return activity.value.filter(
    (w) => String(w.proof_status || '') !== 'rejected'
  ).length;
});

const goToSeason = () => {
  router.push(`/${orgSlug.value}/season/${challengeId.value}`);
};

const goToDraftReport = () => {
  router.push(`/${orgSlug.value}/season/${challengeId.value}#draft-report`);
};

const loadChallenge = async () => {
  if (!challengeId.value) return;
  try {
    const r = await api.get(`/learning-program-classes/${challengeId.value}`, { skipGlobalLoading: true });
    challenge.value = r.data?.class || null;
  } catch {
    challenge.value = null;
  }
};

const loadTeam = async () => {
  if (!challengeId.value || !teamIdNum.value) return;
  try {
    const r = await api.get(`/learning-program-classes/${challengeId.value}/teams`, { skipGlobalLoading: true });
    const teams = Array.isArray(r.data?.teams) ? r.data.teams : [];
    team.value = teams.find((t) => Number(t.id) === teamIdNum.value) || null;
    if (!team.value) error.value = 'Team not found.';
    teamNameDraft.value = team.value?.team_name || '';
  } catch {
    error.value = 'Failed to load team.';
  }
};

const loadMembers = async () => {
  if (!challengeId.value || !teamIdNum.value) return;
  membersLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${challengeId.value}/teams/${teamIdNum.value}/members`, { skipGlobalLoading: true });
    members.value = Array.isArray(r.data?.members) ? r.data.members : [];
  } catch {
    members.value = [];
  } finally {
    membersLoading.value = false;
  }
};

const loadActivity = async () => {
  if (!challengeId.value || !teamIdNum.value) return;
  activityLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${challengeId.value}/activity`, {
      params: { teamId: teamIdNum.value, limit: 100 },
      skipGlobalLoading: true
    });
    activity.value = Array.isArray(r.data?.workouts) ? r.data.workouts : [];
  } catch {
    activity.value = [];
  } finally {
    activityLoading.value = false;
  }
};

const onLogoUpload = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  brandingStatus.value = 'Uploading logo…';
  try {
    const fd = new FormData();
    fd.append('logo', file);
    const r = await api.post(`/learning-program-classes/${challengeId.value}/teams/${teamIdNum.value}/logo`, fd);
    if (team.value) team.value.logo_path = r.data.logoPath;
    brandingStatus.value = 'Logo updated!';
  } catch {
    brandingStatus.value = 'Upload failed.';
  } finally {
    setTimeout(() => { brandingStatus.value = ''; }, 3000);
  }
  e.target.value = '';
};

const onBannerUpload = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  brandingStatus.value = 'Uploading banner…';
  try {
    const fd = new FormData();
    fd.append('banner', file);
    const r = await api.post(`/learning-program-classes/${challengeId.value}/teams/${teamIdNum.value}/banner`, fd);
    if (team.value) team.value.banner_path = r.data.bannerPath;
    brandingStatus.value = 'Banner updated!';
  } catch {
    brandingStatus.value = 'Upload failed.';
  } finally {
    setTimeout(() => { brandingStatus.value = ''; }, 3000);
  }
  e.target.value = '';
};

const removeLogo = async () => {
  try {
    await api.delete(`/learning-program-classes/${challengeId.value}/teams/${teamIdNum.value}/logo`);
    if (team.value) team.value.logo_path = null;
  } catch {
    brandingStatus.value = 'Failed to remove logo.';
    setTimeout(() => { brandingStatus.value = ''; }, 3000);
  }
};

const removeBanner = async () => {
  try {
    await api.delete(`/learning-program-classes/${challengeId.value}/teams/${teamIdNum.value}/banner`);
    if (team.value) team.value.banner_path = null;
  } catch {
    brandingStatus.value = 'Failed to remove banner.';
    setTimeout(() => { brandingStatus.value = ''; }, 3000);
  }
};

const saveTeamName = async () => {
  if (!challengeId.value || !teamIdNum.value || !canEditTeamName.value) return;
  const nextName = String(teamNameDraft.value || '').trim();
  if (!nextName) {
    teamManagementStatus.value = 'Team name cannot be empty.';
    return;
  }
  savingTeamName.value = true;
  teamManagementStatus.value = '';
  try {
    const { data } = await api.put(`/learning-program-classes/${challengeId.value}/teams/${teamIdNum.value}`, {
      teamName: nextName
    }, { skipGlobalLoading: true });
    if (data?.team) {
      team.value = { ...(team.value || {}), ...data.team };
      teamNameDraft.value = data.team.team_name || nextName;
    }
    teamManagementStatus.value = 'Team saved.';
  } catch (e) {
    teamManagementStatus.value = e?.response?.data?.error?.message || 'Failed to save team.';
  } finally {
    savingTeamName.value = false;
  }
};

const sendPasswordReset = async (member) => {
  if (!challengeId.value || !teamIdNum.value || !member?.provider_user_id || sendingResetFor.value) return;
  sendingResetFor.value = member.provider_user_id;
  try {
    await api.post(
      `/learning-program-classes/${challengeId.value}/teams/${teamIdNum.value}/members/${member.provider_user_id}/send-password-reset`,
      {},
      { skipGlobalLoading: true }
    );
    teamManagementStatus.value = `Reset link sent to ${member.first_name || member.last_name || 'member'}.`;
  } catch (e) {
    teamManagementStatus.value = e?.response?.data?.error?.message || 'Failed to send reset link.';
  } finally {
    sendingResetFor.value = null;
  }
};

onMounted(async () => {
  loading.value = true;
  await Promise.all([loadChallenge(), loadTeam()]);
  loading.value = false;
  if (team.value) {
    loadMembers();
    loadActivity();
  }
});
</script>

<style scoped>
.team-dashboard {
  min-height: 100vh;
  background: var(--bg-primary, #f5f5f5);
  font-family: var(--font-family, inherit);
}

/* Banner */
.td-banner {
  position: relative;
  min-height: 220px;
  /* Fallback gradient — inline :style will override background-image when a banner is uploaded */
  background-color: #1a1a2e;
  background-image: linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: stretch;
}
.td-banner-overlay {
  width: 100%;
  padding: 20px 24px 16px;
  background: linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.td-back-btn {
  align-self: flex-start;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.35);
  color: #fff;
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s;
}
.td-back-btn:hover { background: rgba(255,255,255,0.28); }
.td-banner-content {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 1;
}
.td-logo {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 3px solid rgba(255,255,255,0.7);
  object-fit: cover;
  background: rgba(255,255,255,0.12);
  flex-shrink: 0;
}
.td-header-text { flex: 1; }
.td-team-name {
  color: #fff;
  font-size: 1.7rem;
  font-weight: 700;
  margin: 0 0 4px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.5);
}
.td-captain-name {
  color: rgba(255,255,255,0.75);
  font-size: 0.9rem;
  margin: 0;
}

/* Captain branding bar */
.td-branding-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.td-brand-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.4);
  color: #fff;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s;
}
.td-brand-btn:hover { background: rgba(255,255,255,0.32); }
.td-brand-btn--danger {
  background: rgba(220,53,69,0.3);
  border-color: rgba(220,53,69,0.5);
}
.td-brand-btn--danger:hover { background: rgba(220,53,69,0.5); }
.td-file-input { display: none; }
.td-brand-status {
  color: rgba(255,255,255,0.85);
  font-size: 0.78rem;
  font-style: italic;
}

.td-banner-actions {
  display: flex;
  justify-content: flex-end;
}

.td-manage-btn,
.td-manage-link-btn,
.td-manage-save,
.td-manage-reset-btn {
  border: none;
  border-radius: 999px;
  font-weight: 700;
  cursor: pointer;
}

.td-manage-btn {
  background: rgba(255,255,255,0.92);
  color: #16213e;
  padding: 8px 14px;
}

.td-manage-panel {
  margin: 16px 20px 0;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.td-manage-panel__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.td-manage-panel__head h2,
.td-manage-card h3 {
  margin: 0 0 6px;
  color: #0f172a;
}

.td-manage-panel__hint {
  margin: 0;
  color: #64748b;
  font-size: 0.92rem;
}

.td-manage-link-btn {
  background: #2563eb;
  color: #fff;
  padding: 9px 14px;
}

.td-manage-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.td-manage-card {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  background: #f8fafc;
}

.td-manage-form {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.td-manage-input {
  flex: 1;
  min-width: 220px;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 0.95rem;
  background: #fff;
}

.td-manage-save {
  background: #0f172a;
  color: #fff;
  padding: 10px 14px;
}

.td-manage-status {
  margin: 10px 0 0;
  color: #0f172a;
  font-size: 0.92rem;
}

.td-manage-members {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.td-manage-member {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
}

.td-manage-member__info {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.td-manage-pill {
  padding: 3px 8px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 0.76rem;
  font-weight: 700;
}

.td-manage-reset-btn {
  background: #e2e8f0;
  color: #0f172a;
  padding: 8px 12px;
}

/* Stats Row */
.td-stats-row {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  overflow-x: auto;
}
.td-stat-card {
  flex: 1;
  min-width: 70px;
  text-align: center;
  padding: 10px 8px;
  border-radius: 10px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
}
.td-stat-val {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--primary-color, #2563eb);
  line-height: 1.1;
}
.td-stat-label {
  font-size: 0.72rem;
  color: #6c757d;
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* Tabs */
.td-tabs {
  display: flex;
  background: #fff;
  border-bottom: 2px solid #e9ecef;
  padding: 0 20px;
  gap: 0;
}
.td-tab {
  flex: 1;
  padding: 12px 8px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 0.9rem;
  font-weight: 600;
  color: #6c757d;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -2px;
}
.td-tab.active {
  color: var(--primary-color, #2563eb);
  border-bottom-color: var(--primary-color, #2563eb);
}
.td-tab:hover:not(.active) { color: #495057; }

/* Tab Content */
.td-tab-content {
  padding: 16px 0;
}
.td-chat-wrap {
  min-height: 400px;
  display: flex;
  flex-direction: column;
}
.td-chat {
  flex: 1;
}

/* Roster */
.td-roster {
  list-style: none;
  margin: 0;
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.td-roster-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 10px;
  padding: 10px 14px;
}
.td-roster-captain { color: #f59e0b; font-size: 1rem; }
.td-roster-name { flex: 1; font-weight: 500; color: #212529; }
.td-roster-role {
  font-size: 0.72rem;
  background: rgba(245,158,11,0.15);
  color: #b45309;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

/* State */
.td-loading {
  text-align: center;
  padding: 40px 20px;
  color: #6c757d;
}
.td-error {
  text-align: center;
  padding: 40px 20px;
  color: #dc3545;
}
.td-empty {
  text-align: center;
  padding: 32px 20px;
  color: #adb5bd;
  font-size: 0.9rem;
}

/* Mobile */
@media (max-width: 600px) {
  .td-team-name { font-size: 1.35rem; }
  .td-stats-row { padding: 12px 14px; gap: 8px; }
  .td-stat-val { font-size: 1.2rem; }
  .td-tabs { padding: 0 8px; }
  .td-tab { font-size: 0.82rem; padding: 10px 4px; }
  .td-banner { min-height: 180px; }
  .td-banner-overlay { padding: 14px 16px 12px; }
  .td-manage-grid {
    grid-template-columns: 1fr;
  }
  .td-manage-panel {
    margin: 12px 12px 0;
  }
  .td-manage-panel__head {
    flex-direction: column;
  }
}
</style>
