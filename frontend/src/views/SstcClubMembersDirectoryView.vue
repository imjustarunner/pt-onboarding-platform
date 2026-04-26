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
          <p v-if="isPublicRoster && !membersLoading" class="public-roster-hint">
            Public view — tap any member to see their basic stats &amp; trophies.
            <router-link class="public-roster-signin" :to="loginWithRedirect">Sign in</router-link>
            as a member for full profiles.
          </p>

          <div v-if="membersLoading" class="roster-loading">Loading members…</div>
          <div
            v-else-if="membersError"
            class="roster-error"
            :class="{ 'roster-error--muted': membersErrorStatus === 401 || membersErrorStatus === 403 }"
          >
            <template v-if="membersErrorStatus === 401">
              <p class="roster-error-lead">The full member directory requires sign-in.</p>
              <p class="roster-error-hint">
                <a class="roster-error-link" :href="`/${orgSlug}`">Sign in</a>
                to open profiles and see full details. If this message persists, try refreshing the page.
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
            <li v-for="(m, idx) in members" :key="memberRowKey(m, idx)">
              <div v-if="publicSectionHeading(m, idx)" class="roster-section-heading">{{ publicSectionHeading(m, idx) }}</div>
              <button
                v-if="!isPublicRoster"
                type="button"
                class="member-card"
                @click="openMember(m)"
              >
                <div class="member-avatar" aria-hidden="true">
                  <img v-if="photoUrl(m.profilePhotoUrl)" :src="photoUrl(m.profilePhotoUrl)" alt="" class="member-avatar-img" />
                  <div v-else class="member-avatar-fallback">{{ initials(m) }}</div>
                </div>
                <div class="member-card-body">
                  <div class="member-name">{{ formatMemberName(m) }}</div>
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
              <button
                v-else
                type="button"
                class="member-card member-card--public"
                @click="openPublicMember(m)"
              >
                <div class="member-avatar" aria-hidden="true">
                  <img
                    v-if="photoUrl(m.profilePhotoUrl)"
                    :src="photoUrl(m.profilePhotoUrl)"
                    alt=""
                    class="member-avatar-img"
                  />
                  <div v-else class="member-avatar-fallback">{{ publicInitials(m) }}</div>
                </div>
                <div class="member-card-body">
                  <div class="member-name">{{ publicDisplayName(m) }}</div>
                  <div class="member-stats">
                    {{ formatDecimal(m.stats?.totalMiles) }} mi · {{ formatDurationMinutes(m.stats?.totalMinutes) }} moving
                  </div>
                  <div v-if="locationLine(m)" class="member-meta">
                    <span class="member-loc">{{ locationLine(m) }}</span>
                  </div>
                </div>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="modalOpen && !isPublicRoster" class="member-modal-backdrop" @click.self="closeModal">
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

            <!-- Trophy Case -->
            <div v-if="hasTrophies" class="member-modal-section member-trophy-section">
              <h3 class="member-modal-h">🏆 Trophy Case</h3>

              <!-- Season Recognition Awards -->
              <div v-if="trophyCase.seasonAwards?.length" class="dir-awards-section">
                <div class="trophy-records-label">Recognition Awards</div>
                <div class="dir-awards-grid">
                  <div
                    v-for="a in trophyCase.seasonAwards"
                    :key="a.categoryId"
                    class="dir-award-badge"
                    :title="dirAwardTooltip(a)"
                  >
                    <div class="dir-award-icon-wrap">
                      <img v-if="a.iconUrl" :src="a.iconUrl" class="dir-award-icon" alt="" />
                      <span v-else class="dir-award-emoji">{{ dirEmojiFor(a.icon) }}</span>
                      <span v-if="a.count > 1" class="dir-award-count">{{ a.count }}</span>
                    </div>
                    <div class="dir-award-label">{{ a.label }}</div>
                  </div>
                </div>
              </div>

              <!-- Race Club Badges -->
              <div v-if="trophyCase.raceClubs?.length" class="trophy-badges">
                <div
                  v-for="rc in trophyCase.raceClubs"
                  :key="rc.id"
                  class="trophy-badge"
                  :title="`${rc.label}: ${rc.count}× completed`"
                >
                  <img
                    v-if="rc.earnedTier?.iconUrl"
                    :src="rc.earnedTier.iconUrl"
                    class="trophy-badge-icon"
                    alt=""
                  />
                  <span v-else class="trophy-badge-emoji">🏅</span>
                  <div class="trophy-badge-info">
                    <span class="trophy-badge-name">{{ rc.label }}</span>
                    <span class="trophy-badge-count">{{ rc.count }}×</span>
                  </div>
                </div>
              </div>

              <!-- Personal Records -->
              <div v-if="trophyCase.personalRecords?.length" class="trophy-records">
                <div class="trophy-records-label">Personal Records</div>
                <div
                  v-for="r in trophyCase.personalRecords"
                  :key="r.id"
                  class="trophy-record-row"
                  :class="{ 'trophy-record-row--cr': r.isClubRecord }"
                >
                  <img v-if="r.iconUrl" :src="r.iconUrl" class="trophy-record-icon" alt="" />
                  <span v-else class="trophy-record-icon-ph">⭐</span>
                  <span class="trophy-record-label">
                    {{ r.label }}
                    <span v-if="r.isClubRecord" class="trophy-cr-badge">CR</span>
                  </span>
                  <span class="trophy-record-value">
                    {{ formatPrValue(r) }}
                    <span v-if="r.unit && r.metricKey !== 'race_chip_time_seconds'" class="trophy-record-unit">{{ r.unit }}</span>
                  </span>
                  <span v-if="r.context" class="trophy-record-year">{{ r.context }}</span>
                </div>
              </div>

              <!-- Club Records Held (icon badge grid with hover tooltip) -->
              <div v-if="trophyCase.recordsHeld?.filter(r => !trophyCase.personalRecords?.some(pr => pr.id === r.id)).length" class="trophy-cr-section">
                <div class="trophy-records-label">Club Records Held</div>
                <div class="trophy-cr-grid">
                  <div
                    v-for="r in trophyCase.recordsHeld.filter(r => !trophyCase.personalRecords?.some(pr => pr.id === r.id))"
                    :key="r.id"
                    class="trophy-cr-badge-wrap"
                    :title="`${r.label}${r.value != null ? ': ' + formatPrValue(r) + (r.unit && r.metricKey !== 'race_chip_time_seconds' ? ' ' + r.unit : '') : ''}${r.holderYear ? ' · ' + r.holderYear : ''}`"
                  >
                    <img v-if="r.iconUrl" :src="r.iconUrl" class="trophy-cr-badge-icon" alt="" />
                    <span v-else class="trophy-cr-badge-trophy">🏆</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Public (no-auth) profile modal -->
    <Teleport to="body">
      <div v-if="publicModalOpen" class="member-modal-backdrop" @click.self="closePublicModal">
        <div class="member-modal pub-modal pub-modal--public" role="dialog" aria-modal="true" aria-labelledby="pub-profile-title">
          <button type="button" class="member-modal-close" aria-label="Close" @click="closePublicModal">×</button>
          <div v-if="publicProfileLoading" class="member-modal-loading">Loading…</div>
          <div v-else-if="publicProfileError" class="member-modal-error">{{ publicProfileError }}</div>
          <template v-else-if="publicProfileData">
            <div class="member-modal-top">
              <div class="member-modal-avatar" aria-hidden="true">
                <img
                  v-if="photoUrl(publicProfileData.profilePhotoUrl)"
                  :src="photoUrl(publicProfileData.profilePhotoUrl)"
                  alt=""
                  class="member-modal-avatar-img"
                />
                <div v-else class="member-modal-avatar-fallback">{{ publicProfileData.initials || '?' }}</div>
              </div>
              <div>
                <h2 id="pub-profile-title" class="member-modal-title">{{ publicProfileData.displayName }}</h2>
                <p v-if="publicProfileData.homeCity || publicProfileData.homeState" class="member-modal-sub muted">
                  {{ [publicProfileData.homeCity, publicProfileData.homeState].filter(Boolean).join(', ') }}
                </p>
              </div>
            </div>

            <div class="member-modal-section">
              <h3 class="member-modal-h">All-time in this club</h3>
              <div class="member-modal-stats">
                <span class="member-modal-stat">
                  <strong>{{ publicProfileData.stats?.totalMiles ?? 0 }}</strong> mi
                </span>
                <span class="member-modal-stat">
                  <strong>{{ publicProfileData.stats?.workoutCount ?? 0 }}</strong> workouts
                </span>
                <span v-if="publicProfileData.stats?.longestRunMiles" class="member-modal-stat">
                  Longest run <strong>{{ publicProfileData.stats.longestRunMiles }}</strong> mi
                </span>
                <span v-if="publicProfileData.stats?.totalMinutes" class="member-modal-stat">
                  <strong>{{ publicProfileData.stats.totalMinutes }}</strong> min moving
                </span>
              </div>
            </div>

            <!-- Trophy Case (public) -->
            <div v-if="publicHasTrophies" class="member-modal-section member-trophy-section">
              <h3 class="member-modal-h">🏆 Trophy Case</h3>

              <!-- Race Club Badges -->
              <div v-if="publicProfileData.raceClubBadges?.length" class="trophy-badges">
                <div
                  v-for="rc in publicProfileData.raceClubBadges"
                  :key="rc.id"
                  class="trophy-badge"
                  :title="`${rc.label}: ${rc.count}× completed`"
                >
                  <img
                    v-if="rc.earnedTier?.iconUrl"
                    :src="rc.earnedTier.iconUrl"
                    class="trophy-badge-icon"
                    alt=""
                  />
                  <span v-else class="trophy-badge-emoji">🏅</span>
                  <div class="trophy-badge-info">
                    <span class="trophy-badge-name">{{ rc.label }}</span>
                    <span class="trophy-badge-count">{{ rc.count }}×</span>
                  </div>
                </div>
              </div>

              <!-- Club Records Held -->
              <div v-if="publicProfileData.recordsHeld?.length" class="trophy-cr-section">
                <div class="trophy-records-label">Club Records Held</div>
                <div class="trophy-cr-grid">
                  <div
                    v-for="r in publicProfileData.recordsHeld"
                    :key="r.id"
                    class="trophy-cr-badge-wrap"
                    :title="`${r.label}${r.value != null ? ': ' + formatPublicRecordValue(r) + (r.unit ? ' ' + r.unit : '') : ''}${r.holderYear ? ' · ' + r.holderYear : ''}`"
                  >
                    <span class="trophy-cr-badge-trophy">🏆</span>
                    <span class="trophy-cr-badge-label">{{ r.label }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="!publicHasTrophies" class="member-modal-section muted" style="font-size:.85rem;">
              No trophies yet — check back later!
            </div>

            <p class="pub-profile-signin-hint">
              <router-link :to="loginWithRedirect">Sign in</router-link> to view full stats &amp; profile.
            </p>
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
import { useAuthStore } from '../store/auth';

const route = useRoute();
const authStore = useAuthStore();
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
/** True when showing the no-auth public roster (read-only cards). */
const isPublicRoster = ref(false);

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
  const fx = Number(publicPageConfig.value?.bannerFocalX ?? 50);
  const fy = Number(publicPageConfig.value?.bannerFocalY ?? 50);
  return {
    backgroundImage: `linear-gradient(rgba(15,23,42,.65), rgba(15,23,42,.65)), url(${banner})`,
    backgroundSize: 'cover',
    backgroundPosition: `${fx}% ${fy}%`
  };
});

const clubLogoUrl = computed(() => clubData.value?.club?.logoUrl || null);
const clubTitle = computed(() => String(clubData.value?.club?.name || 'Club').trim() || 'Club');

const clubBackTo = computed(() => `/${orgSlug.value}/clubs/${clubId.value}`);

const loginWithRedirect = computed(() => ({
  path: `/${orgSlug.value}/login`,
  query: { redirect: route.fullPath }
}));

const photoUrl = (pathOrUrl) => toUploadsUrl(pathOrUrl);

const initials = (entry) => {
  const first = String(entry?.firstName || '').trim();
  const last = String(entry?.lastName || '').trim();
  if (first && isPublicRoster.value) {
    return first.slice(0, 1).toUpperCase();
  }
  const a = first ? first[0] : '';
  const b = last ? last[0] : '';
  const fromName = `${a}${b}`.toUpperCase();
  if (fromName) return fromName;
  const dn = String(entry?.displayName || '').trim();
  if (dn.length >= 2) return dn.slice(0, 2).toUpperCase();
  if (dn.length === 1) return dn.toUpperCase();
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

const formatDurationMinutes = (raw) => {
  const n = Math.round(Number(raw || 0));
  if (!n) return '—';
  const h = Math.floor(n / 60);
  const min = n % 60;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
};

const memberRowKey = (m, idx) => {
  if (m?.id != null) return `m-${m.id}`;
  return `pub-${idx}-${String(m?.firstName || m?.displayName || '').slice(0, 24)}`;
};

const rosterNameFormat = computed(() => publicPageConfig.value?.rosterNameFormat || 'full');

const formatMemberName = (m) => {
  const fn = String(m?.firstName || '').trim();
  const ln = String(m?.lastName || '').trim();
  if (rosterNameFormat.value === 'initial_last') {
    if (fn && ln) return `${fn.charAt(0).toUpperCase()}. ${ln}`;
    if (fn) return `${fn.charAt(0).toUpperCase()}.`;
    return String(m?.displayName || '').trim() || 'Member';
  }
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ');
  return String(m?.displayName || '').trim() || 'Member';
};

const publicDisplayName = (m) => {
  if (isPublicRoster.value) {
    // Backend already formats per rosterNameFormat; just use it
    return String(m?.displayName || '').trim() || 'Member';
  }
  return formatMemberName(m);
};

const publicInitials = (m) => {
  const dn = String(m?.displayName || '').trim();
  const parts = dn.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return 'M';
};

/** Section headings when roster is grouped by publicRole (manager → assistants → members). */
const publicSectionHeading = (m, idx) => {
  if (!isPublicRoster.value) return null;
  const list = members.value;
  const prev = idx > 0 ? list[idx - 1] : null;
  const r = m?.publicRole || 'member';
  const pr = prev?.publicRole || null;
  if (idx === 0 || r !== pr) {
    if (r === 'manager') return 'Club manager';
    if (r === 'assistant_manager') return 'Assistant managers';
    return 'Members';
  }
  return null;
};

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
  isPublicRoster.value = false;
  const publicUrl = `/summit-stats/clubs/${clubId.value}/members/directory/public`;
  const memberUrl = `/summit-stats/clubs/${clubId.value}/members/directory`;

  let publicRows = [];
  try {
    const { data } = await api.get(publicUrl, { skipAuthRedirect: true });
    publicRows = Array.isArray(data?.members) ? data.members : [];
  } catch (e) {
    membersErrorStatus.value = e?.response?.status ?? null;
    membersError.value = e?.response?.data?.error?.message || 'Could not load the public roster.';
    members.value = [];
    membersLoading.value = false;
    return;
  }

  if (!authStore.isAuthenticated) {
    members.value = publicRows;
    isPublicRoster.value = true;
    membersLoading.value = false;
    return;
  }

  try {
    const { data } = await api.get(memberUrl, { skipAuthRedirect: true });
    members.value = Array.isArray(data?.members) ? data.members : [];
    isPublicRoster.value = false;
  } catch (e) {
    const st = e?.response?.status;
    if (st === 401 || st === 403) {
      members.value = publicRows;
      isPublicRoster.value = true;
    } else {
      membersErrorStatus.value = st ?? null;
      membersError.value = e?.response?.data?.error?.message || 'Could not load the full directory.';
      members.value = publicRows;
      isPublicRoster.value = true;
    }
  } finally {
    membersLoading.value = false;
  }
};

const trophyCase = ref(null);

// ─── Public (no-auth) profile modal ──────────────────────────────────────────
const publicModalOpen = ref(false);
const publicProfileLoading = ref(false);
const publicProfileError = ref('');
const publicProfileData = ref(null);

const openPublicMember = async (m) => {
  if (!m?.id) return;
  publicProfileData.value = null;
  publicProfileError.value = '';
  publicModalOpen.value = true;
  publicProfileLoading.value = true;
  try {
    const { data } = await api.get(
      `/summit-stats/clubs/${clubId.value}/members/${m.id}/public-profile`,
      { skipAuthRedirect: true }
    );
    publicProfileData.value = data;
  } catch (e) {
    publicProfileError.value = e?.response?.data?.error?.message || 'Could not load profile.';
  } finally {
    publicProfileLoading.value = false;
  }
};

const closePublicModal = () => {
  publicModalOpen.value = false;
  publicProfileData.value = null;
  publicProfileError.value = '';
};

const publicHasTrophies = computed(() => {
  if (!publicProfileData.value) return false;
  return (publicProfileData.value.raceClubBadges?.length > 0) ||
         (publicProfileData.value.recordsHeld?.length > 0);
});

const formatPublicRecordValue = (r) => {
  if (!r || r.value == null) return '—';
  return r.value;
};
// ─────────────────────────────────────────────────────────────────────────────

const openMember = async (m) => {
  if (isPublicRoster.value) return;
  profileDetail.value = null;
  profileError.value = '';
  trophyCase.value = null;
  modalOpen.value = true;
  profileLoading.value = true;
  try {
    const [profileRes, trophyRes] = await Promise.allSettled([
      api.get(`/summit-stats/clubs/${clubId.value}/members/${m.id}/profile`),
      api.get(`/summit-stats/clubs/${clubId.value}/members/${m.id}/trophy-case`)
    ]);
    if (profileRes.status === 'fulfilled') profileDetail.value = profileRes.value.data;
    else profileError.value = profileRes.reason?.response?.data?.error?.message || 'Could not load profile.';
    if (trophyRes.status === 'fulfilled') trophyCase.value = trophyRes.value.data;
  } catch (e) {
    profileError.value = e?.response?.data?.error?.message || 'Could not load profile.';
  } finally {
    profileLoading.value = false;
  }
};

const hasTrophies = computed(() => {
  if (!trophyCase.value) return false;
  return (trophyCase.value.raceClubs?.length > 0)
    || (trophyCase.value.recordsHeld?.length > 0)
    || (trophyCase.value.personalRecords?.length > 0)
    || (trophyCase.value.seasonAwards?.length > 0);
});

const dirEmojiFor = (icon) => {
  if (!icon || String(icon).startsWith('icon:')) return '🏅';
  return icon;
};

const dirAwardTooltip = (a) => {
  const weeks = (a.weekNumbers || []).filter(Boolean);
  const weekStr = weeks.length ? `Won: Week ${weeks.join(', Week ')}` : '';
  return [a.label, weekStr].filter(Boolean).join('\n');
};

const formatPrValue = (r) => {
  if (r.metricKey === 'race_chip_time_seconds' && r.value != null) {
    const s = Math.round(Number(r.value));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
  }
  return r.value != null ? r.value : '—';
};

const closeModal = () => {
  modalOpen.value = false;
  profileDetail.value = null;
  profileError.value = '';
  trophyCase.value = null;
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
.public-roster-hint {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e3a8a;
  font-size: 0.9rem;
  line-height: 1.45;
}
.public-roster-signin {
  color: #1d4ed8;
  font-weight: 700;
  text-decoration: none;
}
.public-roster-signin:hover {
  text-decoration: underline;
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
.member-grid > li {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.roster-section-heading {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin: 4px 2px 0;
}
.member-grid > li:first-child .roster-section-heading {
  margin-top: 0;
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
.member-card--readonly {
  cursor: default;
}
.member-card--readonly:hover {
  border-color: rgba(226, 232, 240, 0.9);
  box-shadow: none;
}
.member-card--public {
  cursor: pointer;
}
.member-avatar-img--static {
  pointer-events: none;
  user-select: none;
}
.pub-profile-signin-hint {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
  font-size: 0.82rem;
  color: #64748b;
  text-align: center;
}
.pub-profile-signin-hint a {
  color: #2563eb;
  text-decoration: none;
  font-weight: 600;
}
.pub-modal--public .trophy-cr-badge-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: help;
}
.pub-modal--public .trophy-cr-badge-label {
  font-size: 0.7rem;
  color: #64748b;
  text-align: center;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* ── Trophy Case in member modal ─────────────── */
.member-trophy-section { border-top: 1px solid #f1f5f9; padding-top: 12px; }

.trophy-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.trophy-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 12px;
  cursor: default;
}

.trophy-badge-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 6px;
}

.trophy-badge-emoji { font-size: 28px; line-height: 1; }

.trophy-badge-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.trophy-badge-name {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
  white-space: nowrap;
}

.trophy-badge-count {
  font-size: 13px;
  font-weight: 800;
  color: #1d4ed8;
  font-variant-numeric: tabular-nums;
}

.trophy-records-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94a3b8;
  margin-bottom: 8px;
}

.trophy-record-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}
.trophy-record-row:last-child { border-bottom: none; }

.trophy-record-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 4px;
  flex-shrink: 0;
  transition: transform 0.15s ease;
  cursor: zoom-in;
  position: relative;
  z-index: 0;
}
.trophy-record-icon:hover { transform: scale(2.5); z-index: 10; box-shadow: 0 3px 12px rgba(0,0,0,0.2); }
.trophy-record-icon-ph { font-size: 18px; flex-shrink: 0; width: 28px; text-align: center; }

.trophy-record-row--cr { background: #eff6ff; border-radius: 5px; padding: 5px 6px; }

.trophy-cr-badge {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: #dbeafe;
  color: #1e40af;
  border-radius: 999px;
  padding: 1px 5px;
  margin-left: 4px;
  vertical-align: middle;
}

.trophy-record-label {
  flex: 1;
  font-weight: 500;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.trophy-record-value {
  font-weight: 800;
  color: #1d4ed8;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
}

.trophy-record-unit {
  font-size: 10px;
  font-weight: 500;
  color: #94a3b8;
  margin-left: 2px;
}

.trophy-record-year {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
}

/* Season Recognition Award badges */
.dir-awards-section { margin-bottom: 10px; }
.dir-awards-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
.dir-award-badge { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 64px; cursor: default; }
.dir-award-icon-wrap {
  position: relative;
  width: 50px; height: 50px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex; align-items: center; justify-content: center;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.dir-award-badge:hover .dir-award-icon-wrap { border-color: #a5b4fc; box-shadow: 0 2px 8px rgba(99,102,241,0.2); }
.dir-award-icon { width: 36px; height: 36px; object-fit: contain; border-radius: 6px; }
.dir-award-emoji { font-size: 26px; line-height: 1; }
.dir-award-count {
  position: absolute; bottom: -4px; right: -4px;
  background: #4338ca; color: #fff;
  font-size: 10px; font-weight: 800;
  width: 18px; height: 18px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid #fff;
}
.dir-award-label { font-size: 10px; font-weight: 600; color: #475569; text-align: center; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* Club Records icon badge grid */
.trophy-cr-section { margin-top: 10px; }
.trophy-cr-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}
.trophy-cr-badge-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  cursor: default;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.trophy-cr-badge-wrap:hover {
  border-color: #a5b4fc;
  box-shadow: 0 2px 8px rgba(99,102,241,0.2);
}
.trophy-cr-badge-icon { width: 38px; height: 38px; object-fit: contain; border-radius: 6px; }
.trophy-cr-badge-trophy { font-size: 28px; line-height: 1; }
</style>
