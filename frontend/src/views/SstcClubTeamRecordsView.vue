<template>
  <div class="pub-page">
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
      <div class="pub-hero" :style="heroStyle">
        <div class="pub-hero-inner">
          <div class="pub-hero-brand">
            <img v-if="clubLogoUrl" :src="clubLogoUrl" class="pub-logo" alt="" />
            <div class="pub-hero-text">
              <h1 class="pub-club-name">{{ clubTitle }}</h1>
              <p v-if="bannerTitleLine" class="pub-hero-subtitle pub-hero-tagline">{{ bannerTitleLine }}</p>
              <p v-if="bannerSubtitleLine" class="pub-hero-subtitle">{{ bannerSubtitleLine }}</p>
              <p class="pub-page-kicker">
                <span class="page-kicker-dot"></span>
                Team records
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="pub-action-bar-wrap">
        <div class="pub-action-bar">
          <router-link :to="clubBackTo" class="pub-act pub-act--dashboard">← Club page</router-link>
          <router-link
            v-if="viewer.isMember"
            :to="`/${orgSlug}/dashboard`"
            class="pub-act pub-act--dashboard-alt"
          >
            My Dashboard
          </router-link>
          <router-link
            v-if="viewer.isMember && numericClubId"
            :to="`/${orgSlug}/clubs/${numericClubId}/members`"
            class="pub-act pub-act--members"
          >
            Members
          </router-link>
        </div>
      </div>

      <div class="pub-stats-wrap" :class="{ 'pub-stats-wrap--compact': viewer.isMember }">
        <div class="pub-stats-bar" :class="{ 'pub-stats-bar--compact': viewer.isMember }">
          <template v-if="configuredStats.length">
            <div
              v-for="stat in configuredStats"
              :key="stat.key"
              class="stat-pill"
              :class="{ 'stat-pill--race': stat.key === 'half_marathon_count' || stat.key === 'marathon_count' }"
            >
              <img v-if="stat.iconUrl" :src="stat.iconUrl" alt="" class="stat-icon stat-icon-img" />
              <span v-else-if="stat.icon" class="stat-icon">{{ stat.icon }}</span>
              <span class="stat-value">{{ fmtPubStat(stat) }}</span>
              <span class="stat-label">{{ stat.label }}</span>
            </div>
          </template>
          <template v-else-if="clubData?.stats">
            <div class="stat-pill">
              <span class="stat-icon">👥</span>
              <span class="stat-value">{{ clubData.stats.memberCount.toLocaleString() }}</span>
              <span class="stat-label">Active Members</span>
            </div>
            <div class="stat-pill">
              <span class="stat-icon">🏃</span>
              <span class="stat-value">{{ formatMiles(clubData.stats.totalMiles) }}</span>
              <span class="stat-label">Total Miles</span>
            </div>
            <div class="stat-pill">
              <span class="stat-icon">💪</span>
              <span class="stat-value">{{ clubData.stats.totalWorkouts.toLocaleString() }}</span>
              <span class="stat-label">Total Workouts</span>
            </div>
            <div class="stat-pill">
              <span class="stat-icon">⭐</span>
              <span class="stat-value">{{ clubData.stats.totalPoints.toLocaleString() }}</span>
              <span class="stat-label">Total Points</span>
            </div>
            <div class="stat-pill">
              <span class="stat-icon">🏆</span>
              <span class="stat-value">{{ clubData.stats.seasonCount }}</span>
              <span class="stat-label">Seasons Completed</span>
            </div>
          </template>
        </div>
      </div>

      <div class="pub-content">
        <div
          v-if="hasRecordsContent"
          id="club-records"
          class="pub-row records-pub-row"
        >
          <div v-if="(clubData.clubRecords || []).length" class="pub-card pub-records-card">
            <div class="card-label">🏅 Club Records</div>
            <div class="records-list">
              <div
                v-for="record in clubData.clubRecords"
                :key="record.id || record.label"
                class="record-row"
              >
                <div class="record-main">
                  <img v-if="record.iconUrl" :src="record.iconUrl" alt="" class="record-icon" />
                  <span class="record-label">{{ record.label }}</span>
                </div>
                <div class="record-right">
                  <span class="record-value">
                    {{ record.value != null ? record.value : '—' }}
                    <span v-if="record.unit" class="record-unit">{{ record.unit }}</span>
                  </span>
                  <span v-if="record.holderName || record.holderYear || record.holderTeam" class="record-meta">
                    {{ record.holderName || '—' }}
                    <span v-if="record.holderYear">• {{ record.holderYear }}</span>
                    <span v-if="record.holderTeam">• {{ record.holderTeam }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="raceHalf.length || raceFull.length"
            class="pub-card pub-race-card"
          >
            <div class="card-label">🏃 Race Divisions</div>
            <p class="race-intro">Members who've completed race-distance efforts.</p>
            <div class="race-blocks">
              <div v-if="raceHalf.length" class="race-block race-block--hm">
                <div class="race-block-head">🏅 Half Marathon <small>13.1+ mi</small></div>
                <ul class="race-list">
                  <li v-for="m in raceHalf" :key="`hm-${m.userId}`">
                    <span class="race-name">{{ m.name }}</span>
                    <span class="race-time">{{ m.bestTimeText }}</span>
                  </li>
                </ul>
              </div>
              <div v-if="raceFull.length" class="race-block race-block--marathon">
                <div class="race-block-head">🥇 Marathon <small>26.2+ mi</small></div>
                <ul class="race-list">
                  <li v-for="m in raceFull" :key="`m-${m.userId}`">
                    <span class="race-name">{{ m.name }}</span>
                    <span class="race-time">{{ m.bestTimeText }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="pub-card pub-empty-records">
          <div class="card-label">Team records</div>
          <p class="empty-hint">No club records or race divisions yet.</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const orgSlug = computed(() => route.params.organizationSlug || 'ssc');
const clubId = computed(() => route.params.clubId);

const brandingLoading = ref(true);
const brandingError = ref('');
const clubData = ref(null);
const configuredStats = ref([]);

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

const numericClubId = computed(() => Number(clubData.value?.club?.id || 0));

const clubBackTo = computed(() => `/${orgSlug.value}/clubs/${clubId.value}`);

const viewer = computed(() => {
  const v = clubData.value?.viewer;
  if (v) return v;
  return { isAuthenticated: false, isMember: false, clubRole: null, isManager: false };
});

const raceHalf = computed(() => clubData.value?.raceDivisions?.halfMarathon || []);
const raceFull = computed(() => clubData.value?.raceDivisions?.marathon || []);

const hasRecordsContent = computed(() => {
  const cr = clubData.value?.clubRecords || [];
  return (
    cr.length > 0 ||
    raceHalf.value.length > 0 ||
    raceFull.value.length > 0
  );
});

const decimalStatKeys = new Set(['total_miles', 'run_miles', 'ruck_miles']);
const fmtPubStat = (stat) => {
  const n = Number(stat.value ?? 0);
  if (decimalStatKeys.has(stat.key)) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return n.toLocaleString();
};

const formatMiles = (n) => {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const loadPage = async () => {
  brandingLoading.value = true;
  brandingError.value = '';
  configuredStats.value = [];
  try {
    const { data } = await api.get(`/summit-stats/clubs/${clubId.value}/public`, { skipAuthRedirect: true });
    clubData.value = data || null;
    if (!clubData.value?.club) {
      brandingError.value = 'Club not found.';
      clubData.value = null;
      return;
    }
    const nid = Number(clubData.value.club.id || 0);
    if (nid) {
      try {
        const statsRes = await api.get(`/summit-stats/clubs/${nid}/stats`, { skipAuthRedirect: true });
        if (Array.isArray(statsRes?.data?.stats)) configuredStats.value = statsRes.data.stats;
      } catch {
        configuredStats.value = [];
      }
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

onMounted(loadPage);
</script>

<style scoped>
/* Base — SscPublicClubView */
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
.pub-page-kicker {
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
.page-kicker-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a78bfa;
  box-shadow: 0 0 8px rgba(167, 139, 250, 0.9);
}

/* Action bar — same spacing fix as SscPublicClubView */
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
.pub-act--dashboard-alt {
  background: linear-gradient(135deg, #334155, #64748b);
  text-decoration: none;
}
.pub-act--members {
  background: linear-gradient(135deg, #0369a1, #0ea5e9);
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

.pub-stats-wrap {
  max-width: 1040px;
  margin: -18px auto 0;
  padding: 0 24px;
  position: relative;
  z-index: 10;
}
.pub-stats-wrap--compact {
  max-width: 640px;
  margin-top: -14px;
}
.pub-stats-bar {
  display: flex;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.12);
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.8);
}
.pub-stats-bar--compact {
  flex-wrap: wrap;
  border-radius: 14px;
}
.pub-stats-bar--compact .stat-pill {
  flex: 1 1 33%;
  min-width: 30%;
  padding: 12px 10px 10px;
}
.pub-stats-bar--compact .stat-value {
  font-size: 1.25rem;
}
.pub-stats-bar--compact .stat-label {
  font-size: 9px;
}
.stat-pill {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 12px 18px;
  border-right: 1px solid #f1f5f9;
  gap: 3px;
}
.stat-pill:last-child {
  border-right: none;
}
.stat-pill--race {
  background: linear-gradient(135deg, #fffbeb, #fef3c7);
}
.stat-icon {
  font-size: 1.25rem;
  margin-bottom: 2px;
  line-height: 1;
}
.stat-icon-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.stat-value {
  font-size: 1.6rem;
  font-weight: 900;
  color: #1d4ed8;
  letter-spacing: -0.03em;
  line-height: 1;
}
.stat-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #94a3b8;
}
@media (max-width: 600px) {
  .pub-stats-bar {
    flex-wrap: wrap;
  }
  .stat-pill {
    min-width: 50%;
    border-right: none;
    border-bottom: 1px solid #f1f5f9;
  }
  .stat-pill:last-child {
    border-bottom: none;
  }
}

.pub-content {
  max-width: 1040px;
  margin: 36px auto 64px;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.pub-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
@media (max-width: 680px) {
  .pub-row {
    grid-template-columns: 1fr;
  }
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

.records-list {
  display: flex;
  flex-direction: column;
}
.record-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
}
.record-row:last-child {
  border-bottom: none;
}
.record-main { display: flex; align-items: center; gap: 8px; min-width: 0; }
.record-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right; }
.record-icon { width: 20px; height: 20px; object-fit: contain; flex-shrink: 0; }
.record-label { color: #374151; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.record-value {
  font-weight: 800;
  color: #1d4ed8;
  font-variant-numeric: tabular-nums;
}
.record-unit {
  font-weight: 500;
  font-size: 11px;
  color: #94a3b8;
  margin-left: 3px;
}
.record-meta { font-size: 11px; color: #64748b; }

.race-intro {
  margin: -6px 0 14px;
  font-size: 12.5px;
  color: #94a3b8;
}
.race-blocks {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.race-block {
  border-radius: 12px;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
}
.race-block--hm {
  background: #f0fdf4;
  border-color: #bbf7d0;
}
.race-block--marathon {
  background: #fffbeb;
  border-color: #fde68a;
}
.race-block-head {
  font-weight: 800;
  color: #1f2937;
  margin-bottom: 10px;
  font-size: 14px;
}
.race-block-head small {
  font-weight: 500;
  font-size: 11px;
  color: #6b7280;
  margin-left: 2px;
}
.race-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.race-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
  border-top: 1px solid rgba(226, 232, 240, 0.8);
}
.race-list li:first-child {
  border-top: none;
  padding-top: 0;
}
.race-name {
  flex: 1;
  font-weight: 600;
  color: #1f2937;
}
.race-time {
  font-variant-numeric: tabular-nums;
  color: #6b7280;
  font-size: 12px;
}

.pub-empty-records .empty-hint {
  margin: 0;
  color: #64748b;
  font-size: 15px;
}
</style>
