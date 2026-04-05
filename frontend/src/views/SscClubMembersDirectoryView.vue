<template>
  <div class="pub-page">
    <!-- Club branding (same data as public club page) -->
    <div v-if="brandingLoading && !clubData" class="pub-loading">
      <div class="spinner"></div>
      <p>Loading club…</p>
    </div>

    <div v-else-if="brandingError && !clubData" class="pub-error">
      <div class="error-icon">⚠️</div>
      <h2>{{ brandingError }}</h2>
      <p class="pub-error-hint">This club may not exist, or the link may be wrong.</p>
      <router-link :to="`/${orgSlug}/clubs`" class="btn-browse">Browse clubs</router-link>
    </div>

    <template v-else>
      <!-- Hero — matches SscPublicClubView -->
      <div class="pub-hero" :style="heroStyle">
        <div class="pub-hero-inner">
          <div class="pub-hero-brand">
            <img v-if="clubLogoUrl" :src="clubLogoUrl" class="pub-logo" alt="" />
            <div class="pub-hero-text">
              <h1 class="pub-club-name">{{ clubTitle }}</h1>
              <p v-if="bannerTitleLine" class="pub-hero-subtitle pub-hero-tagline">{{ bannerTitleLine }}</p>
              <p v-if="bannerSubtitleLine" class="pub-hero-subtitle">{{ bannerSubtitleLine }}</p>
              <p class="pub-members-kicker">
                <span class="members-kicker-dot"></span>
                Member directory
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="pub-action-bar-wrap">
        <div class="pub-action-bar">
          <router-link :to="clubBackTo" class="pub-act pub-act--dashboard">← Club page</router-link>
        </div>
      </div>

      <div class="pub-content">
        <div class="pub-card members-roster-card">
          <div class="card-label">Roster</div>

          <div v-if="membersLoading" class="roster-loading">Loading members…</div>
          <div
            v-else-if="membersError"
            class="roster-error"
            :class="{ 'roster-error--muted': membersErrorStatus === 401 || membersErrorStatus === 403 }"
          >
            <template v-if="membersErrorStatus === 401">
              <p class="roster-error-lead">The full roster is for signed-in club members.</p>
              <p class="roster-error-hint">
                <a class="roster-error-link" :href="`/${orgSlug}`">Sign in</a>
                to see photos, stats, and profiles. The public club page shows a name preview only.
              </p>
            </template>
            <template v-else-if="membersErrorStatus === 403">
              <p class="roster-error-lead">Club membership is required to view the full roster.</p>
              <p class="roster-error-hint">
                <router-link class="roster-error-link" :to="clubBackTo">Return to club page</router-link>
              </p>
            </template>
            <template v-else>{{ membersError }}</template>
          </div>
          <ul v-else class="member-grid">
            <li v-for="m in members" :key="m.id">
              <button type="button" class="member-card" @click="openMember(m)">
                <div class="member-avatar" aria-hidden="true">
                  <img v-if="photoUrl(m.profilePhotoUrl)" :src="photoUrl(m.profilePhotoUrl)" alt="" class="member-avatar-img" />
                  <div v-else class="member-avatar-fallback">{{ initials(m) }}</div>
                </div>
                <div class="member-card-body">
                  <div class="member-name">{{ m.displayName }}</div>
                  <div class="member-stats">
                    {{ formatWhole(m.stats?.totalPoints) }} pts · {{ formatDecimal(m.stats?.totalMiles) }} mi ·
                    {{ formatWhole(m.stats?.workoutCount) }} workouts
                  </div>
                  <div class="member-meta">
                    <span v-if="m.age != null" class="member-pill">{{ m.age }} yrs</span>
                    <span v-if="locationLine(m)" class="member-loc">{{ locationLine(m) }}</span>
                  </div>
                  <div v-if="m.genderListLabel" class="member-gender">{{ m.genderListLabel }}</div>
                </div>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="modalOpen" class="member-modal-backdrop" @click.self="closeModal">
        <div class="member-modal pub-modal" role="dialog" aria-modal="true" aria-labelledby="member-modal-title">
          <button type="button" class="member-modal-close" aria-label="Close" @click="closeModal">×</button>
          <div v-if="profileLoading" class="member-modal-loading">Loading…</div>
          <div v-else-if="profileError" class="member-modal-error">{{ profileError }}</div>
          <template v-else-if="profileDetail">
            <div class="member-modal-top">
              <div class="member-modal-avatar" aria-hidden="true">
                <img
                  v-if="photoUrl(profileDetail.member?.profilePhotoUrl)"
                  :src="photoUrl(profileDetail.member?.profilePhotoUrl)"
                  alt=""
                  class="member-modal-avatar-img"
                />
                <div v-else class="member-modal-avatar-fallback">{{ initials(profileDetail.member) }}</div>
              </div>
              <div>
                <h2 id="member-modal-title" class="member-modal-title">
                  {{ profileDetail.member?.displayName }}
                </h2>
                <p v-if="modalSubline(profileDetail.member)" class="member-modal-sub muted">
                  {{ modalSubline(profileDetail.member) }}
                </p>
              </div>
            </div>

            <div v-if="profileDetail.member?.gender" class="member-modal-section">
              <h3 class="member-modal-h">Gender</h3>
              <p class="member-modal-p">{{ profileDetail.member.gender }}</p>
            </div>

            <div class="member-modal-section">
              <h3 class="member-modal-h">All-time in this club</h3>
              <div class="member-modal-stats">
                <span class="member-modal-stat"
                  ><strong>{{ formatWhole(profileDetail.allTimeStats?.totalPoints) }}</strong> pts</span
                >
                <span class="member-modal-stat"
                  ><strong>{{ formatDecimal(profileDetail.allTimeStats?.totalMiles) }}</strong> mi</span
                >
                <span class="member-modal-stat"
                  ><strong>{{ formatWhole(profileDetail.allTimeStats?.totalWorkouts) }}</strong> workouts</span
                >
                <span v-if="profileDetail.allTimeStats?.longestRunMiles != null" class="member-modal-stat">
                  Longest run <strong>{{ formatDecimal(profileDetail.allTimeStats?.longestRunMiles) }}</strong> mi
                </span>
                <span v-if="profileDetail.allTimeStats?.totalMinutes != null" class="member-modal-stat">
                  <strong>{{ formatWhole(profileDetail.allTimeStats?.totalMinutes) }}</strong> min moving
                </span>
              </div>
            </div>

            <div
              v-if="hasBio(profileDetail.member)"
              class="member-modal-section member-modal-section--compact"
            >
              <template v-if="profileDetail.member?.heardAboutClub">
                <h3 class="member-modal-h">How they heard about the club</h3>
                <p class="member-modal-p">{{ profileDetail.member.heardAboutClub }}</p>
              </template>
              <template v-if="profileDetail.member?.runningFitnessBackground">
                <h3 class="member-modal-h">Background</h3>
                <p class="member-modal-p">{{ profileDetail.member.runningFitnessBackground }}</p>
              </template>
              <template v-if="profileDetail.member?.currentFitnessActivities">
                <h3 class="member-modal-h">Activities</h3>
                <p class="member-modal-p">{{ profileDetail.member.currentFitnessActivities }}</p>
              </template>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { toUploadsUrl } from '../utils/uploadsUrl';
import api from '../services/api';

const route = useRoute();
const orgSlug = computed(() => route.params.organizationSlug || 'ssc');
const clubId = computed(() => route.params.clubId);

const brandingLoading = ref(true);
const brandingError = ref('');
const clubData = ref(null);

const members = ref([]);
const membersLoading = ref(true);
const membersError = ref('');
/** Set when roster request fails (e.g. 401 guest, 403 non-member). */
const membersErrorStatus = ref(null);

const modalOpen = ref(false);
const profileLoading = ref(false);
const profileError = ref('');
const profileDetail = ref(null);

const publicPageConfig = computed(() => clubData.value?.club?.publicPageConfig || {});

const bannerTitleLine = computed(() => String(publicPageConfig.value?.bannerTitle || '').trim());
const bannerSubtitleLine = computed(() => String(publicPageConfig.value?.bannerSubtitle || '').trim());

const heroStyle = computed(() => {
  const banner = String(publicPageConfig.value?.bannerImageUrl || '').trim();
  if (!banner) return {};
  return {
    backgroundImage: `linear-gradient(rgba(15,23,42,.65), rgba(15,23,42,.65)), url(${banner})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  };
});

const clubLogoUrl = computed(() => clubData.value?.club?.logoUrl || null);
const clubTitle = computed(() => String(clubData.value?.club?.name || 'Club').trim() || 'Club');

const clubBackTo = computed(() => `/${orgSlug.value}/clubs/${clubId.value}`);

const photoUrl = (pathOrUrl) => toUploadsUrl(pathOrUrl);

const initials = (entry) => {
  const first = String(entry?.firstName || '').trim();
  const last = String(entry?.lastName || '').trim();
  const a = first ? first[0] : '';
  const b = last ? last[0] : '';
  const fromName = `${a}${b}`.toUpperCase();
  if (fromName) return fromName;
  const dn = String(entry?.displayName || '').trim();
  if (dn.length >= 2) return dn.slice(0, 2).toUpperCase();
  return 'M';
};

const locationLine = (m) => {
  const city = String(m?.homeCity || '').trim();
  const st = String(m?.homeState || '').trim();
  const parts = [city, st].filter(Boolean);
  return parts.length ? parts.join(', ') : '';
};

const modalSubline = (m) => {
  const loc = locationLine(m);
  const age = m?.age != null ? `${m.age} yrs` : '';
  return [age, loc].filter(Boolean).join(' · ') || '';
};

const formatWhole = (value) => Number(value || 0).toLocaleString();
const formatDecimal = (value) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });

const hasBio = (m) =>
  !!(m?.heardAboutClub || m?.runningFitnessBackground || m?.currentFitnessActivities);

const loadClubBranding = async () => {
  brandingLoading.value = true;
  brandingError.value = '';
  try {
    const { data } = await api.get(`/summit-stats/clubs/${clubId.value}/public`, { skipAuthRedirect: true });
    clubData.value = data || null;
    if (!clubData.value?.club) {
      brandingError.value = 'Club not found.';
      clubData.value = null;
    }
  } catch (e) {
    const status = e?.response?.status;
    const msg = e?.response?.data?.error?.message;
    if (status === 404 || (msg && /not found/i.test(msg))) {
      brandingError.value = 'This club could not be found.';
    } else {
      brandingError.value = msg || 'Could not load this club.';
    }
    clubData.value = null;
  } finally {
    brandingLoading.value = false;
  }
};

const loadMembers = async () => {
  membersLoading.value = true;
  membersError.value = '';
  membersErrorStatus.value = null;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${clubId.value}/members/directory`);
    members.value = Array.isArray(data?.members) ? data.members : [];
  } catch (e) {
    membersErrorStatus.value = e?.response?.status ?? null;
    membersError.value = e?.response?.data?.error?.message || 'Could not load members.';
  } finally {
    membersLoading.value = false;
  }
};

const openMember = async (m) => {
  profileDetail.value = null;
  profileError.value = '';
  modalOpen.value = true;
  profileLoading.value = true;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${clubId.value}/members/${m.id}/profile`);
    profileDetail.value = data;
  } catch (e) {
    profileError.value = e?.response?.data?.error?.message || 'Could not load profile.';
  } finally {
    profileLoading.value = false;
  }
};

const closeModal = () => {
  modalOpen.value = false;
  profileDetail.value = null;
  profileError.value = '';
};

onMounted(async () => {
  await Promise.all([loadClubBranding(), loadMembers()]);
});
</script>

<style scoped>
/* ─── Align with SscPublicClubView ───────────────────────────── */
.pub-page {
  min-height: 100vh;
  background: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

.pub-loading,
.pub-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 16px;
  text-align: center;
  color: #64748b;
}
.error-icon {
  font-size: 2.5rem;
}
.pub-error h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #0f172a;
}
.pub-error-hint {
  margin: 0;
  font-size: 0.9rem;
  color: #64748b;
  max-width: 320px;
}
.btn-browse {
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  border-radius: 10px;
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  text-decoration: none;
  margin-top: 8px;
}
.btn-browse:hover {
  filter: brightness(1.05);
}
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: #1d4ed8;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.pub-hero {
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #1d4ed8 100%);
  color: #fff;
  padding: 48px 24px 72px;
  position: relative;
  overflow: hidden;
}
.pub-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 60% at 70% 50%, rgba(99, 102, 241, 0.28) 0%, transparent 70%);
  pointer-events: none;
}
.pub-hero-inner {
  max-width: 1040px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 28px;
  position: relative;
  z-index: 1;
}
.pub-hero-brand {
  display: flex;
  align-items: center;
  gap: 20px;
}
.pub-logo {
  width: 96px;
  height: 96px;
  aspect-ratio: 1;
  border-radius: 16px;
  object-fit: contain;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  padding: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}
.pub-club-name {
  margin: 0;
  font-size: clamp(1.75rem, 4vw, 2.75rem);
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: #fff;
}
.pub-hero-subtitle {
  margin: 8px 0 0;
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.75);
  font-weight: 400;
}
.pub-hero-tagline {
  font-size: 1.05rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}
.pub-members-kicker {
  margin: 12px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.members-kicker-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.9);
}

.pub-action-bar-wrap {
  max-width: 1040px;
  margin: -24px auto 0;
  padding: 0 24px 12px;
  position: relative;
  z-index: 12;
  width: 100%;
  box-sizing: border-box;
}
.pub-action-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  row-gap: 12px;
  justify-content: center;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
}
.pub-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  border: none;
  cursor: pointer;
  text-decoration: none;
  color: #fff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12);
  transition: transform 0.12s, box-shadow 0.12s;
  flex: 0 0 auto;
  flex-shrink: 0;
  max-width: 100%;
  box-sizing: border-box;
  white-space: nowrap;
}
.pub-act:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.16);
}
.pub-act--dashboard {
  background: linear-gradient(135deg, #334155, #64748b);
}
@media (max-width: 520px) {
  .pub-action-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .pub-act {
    width: 100%;
    justify-content: center;
    white-space: normal;
  }
}

.pub-content {
  max-width: 1040px;
  margin: 36px auto 64px;
  padding: 0 24px;
}

.pub-card {
  background: #fff;
  border-radius: 16px;
  padding: 28px 28px 24px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
  border: 1px solid rgba(226, 232, 240, 0.7);
}
.card-label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #94a3b8;
  margin-bottom: 14px;
}

.roster-loading,
.roster-error {
  color: #64748b;
  padding: 8px 0 4px;
}
.roster-error {
  color: #b91c1c;
}
.roster-error--muted {
  color: #475569;
}
.roster-error-lead {
  margin: 0 0 10px;
  font-weight: 600;
  line-height: 1.45;
}
.roster-error-hint {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 400;
}
.roster-error-link {
  color: #2563eb;
  font-weight: 700;
  text-decoration: none;
}
.roster-error-link:hover {
  text-decoration: underline;
}

.member-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  width: 100%;
  text-align: left;
  padding: 14px 16px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 14px;
  background: #fbfdff;
  cursor: pointer;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
  font: inherit;
}
.member-card:hover {
  border-color: #bae6fd;
  box-shadow: 0 4px 16px rgba(29, 78, 216, 0.08);
}

.member-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.member-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.member-avatar-fallback {
  font-size: 1rem;
  font-weight: 800;
  color: #64748b;
}

.member-card-body {
  min-width: 0;
  flex: 1;
}
.member-name {
  font-weight: 800;
  color: #0f172a;
  font-size: 1rem;
  letter-spacing: -0.02em;
}
.member-stats {
  margin-top: 4px;
  font-size: 0.88rem;
  color: #475569;
  font-variant-numeric: tabular-nums;
}
.member-meta {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  font-size: 0.85rem;
  color: #64748b;
}
.member-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eff6ff;
  font-weight: 700;
  color: #1d4ed8;
  font-size: 0.78rem;
}
.member-loc {
  color: #64748b;
}
.member-gender {
  margin-top: 6px;
  font-size: 0.82rem;
  color: #64748b;
}

/* Modal — same accent as public stat pills */
.member-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
}
@media (min-width: 560px) {
  .member-modal-backdrop {
    align-items: center;
  }
}

.pub-modal {
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
}

.member-modal {
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: min(88vh, 640px);
  overflow-y: auto;
  background: #fff;
  border-radius: 20px;
  padding: 20px 20px 22px;
}

.member-modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: #f1f5f9;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: #475569;
}
.member-modal-close:hover {
  background: #e2e8f0;
}

.member-modal-loading,
.member-modal-error {
  padding: 24px 8px;
  text-align: center;
  color: #64748b;
}
.member-modal-error {
  color: #b91c1c;
}

.member-modal-top {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-bottom: 16px;
  padding-right: 28px;
}

.member-modal-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.member-modal-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.member-modal-avatar-fallback {
  font-size: 1.25rem;
  font-weight: 800;
  color: #64748b;
}

.member-modal-title {
  margin: 0;
  font-size: 1.2rem;
  line-height: 1.25;
  color: #0f172a;
  font-weight: 900;
  letter-spacing: -0.02em;
}
.member-modal-sub {
  margin: 6px 0 0;
  font-size: 0.9rem;
}
.muted {
  color: #64748b;
}

.member-modal-section {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #f1f5f9;
}
.member-modal-section--compact .member-modal-h {
  margin-top: 10px;
}
.member-modal-section--compact .member-modal-h:first-child {
  margin-top: 0;
}

.member-modal-h {
  margin: 0 0 6px;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
  font-weight: 700;
}

.member-modal-p {
  margin: 0;
  font-size: 0.9rem;
  color: #475569;
  line-height: 1.45;
  white-space: pre-wrap;
}

.member-modal-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  font-size: 0.9rem;
  color: #334155;
}
.member-modal-stat strong {
  font-weight: 900;
  color: #1d4ed8;
  font-variant-numeric: tabular-nums;
}
</style>
