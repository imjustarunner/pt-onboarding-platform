<template>
  <div class="pub-page">
    <!-- Loading -->
    <div v-if="loading" class="pub-loading">
      <div class="spinner"></div>
      <p>Loading club…</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="pub-error">
      <div class="error-icon">⚠️</div>
      <h2>{{ error }}</h2>
      <router-link :to="`/${orgSlug}/clubs`" class="btn btn-ghost">Browse Clubs</router-link>
    </div>

    <template v-else-if="clubData">

      <!-- ── Hero ─────────────────────────────────────────────── -->
      <div class="pub-hero" :style="heroStyle">
        <div class="pub-hero-inner">
          <div class="pub-hero-brand">
            <img v-if="clubData.club.logoUrl" :src="clubData.club.logoUrl" class="pub-logo" alt="Club logo" />
            <div class="pub-hero-text">
              <h1 class="pub-club-name">{{ publicBannerTitle }}</h1>
              <p v-if="publicBannerSubtitle" class="pub-hero-subtitle">{{ publicBannerSubtitle }}</p>
              <p class="pub-member-count">
                <span class="member-dot"></span>
                {{
                  (configuredStats.find(s => s.key === 'member_count')?.value ?? clubData.stats.memberCount)
                  .toLocaleString()
                }} member{{
                  (configuredStats.find(s => s.key === 'member_count')?.value ?? clubData.stats.memberCount) !== 1 ? 's' : ''
                }} strong
              </p>
            </div>
          </div>
          <div class="hero-actions">
            <button class="btn-hero-join" @click="goJoin">Join Our Club</button>
            <a
              v-if="clubData.publicStore?.enabled && clubData.publicStore?.url"
              class="btn-hero-shop"
              :href="clubData.publicStore.url"
              target="_blank"
              rel="noopener"
            >{{ clubData.publicStore.buttonText || 'Shop' }}</a>
          </div>
        </div>
      </div>

      <!-- ── Stats strip ─────────────────────────────────────── -->
      <div class="pub-stats-wrap">
        <div class="pub-stats-bar">
          <template v-if="configuredStats.length">
            <div
              v-for="stat in configuredStats"
              :key="stat.key"
              class="stat-pill"
              :class="{ 'stat-pill--race': stat.key === 'half_marathon_count' || stat.key === 'marathon_count' }"
            >
              <span class="stat-icon" v-if="stat.icon">{{ stat.icon }}</span>
              <span class="stat-value">{{ fmtPubStat(stat) }}</span>
              <span class="stat-label">{{ stat.label }}</span>
            </div>
          </template>
          <template v-else>
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

      <!-- ── Main content ────────────────────────────────────── -->
      <div class="pub-content">

        <!-- Current season + active participants -->
        <div class="pub-row" v-if="(showCurrentSeasonBlock && clubData.currentSeason) || (showActiveParticipantsBlock && clubData.activeParticipants?.length)">
          <div v-if="showCurrentSeasonBlock && clubData.currentSeason" class="pub-card pub-season-card">
            <div class="card-label">Current Season</div>
            <div class="season-name">{{ clubData.currentSeason.name }}</div>
            <div class="season-meta">
              <span class="season-status-pill" :class="`status-${clubData.currentSeason.status || 'active'}`">
                {{ clubData.currentSeason.status || 'active' }}
              </span>
              <span v-if="clubData.currentSeason.startsAt" class="season-date">
                {{ formatDate(clubData.currentSeason.startsAt) }}
              </span>
              <span v-if="clubData.currentSeason.startsAt && clubData.currentSeason.endsAt" class="season-sep">→</span>
              <span v-if="clubData.currentSeason.endsAt" class="season-date">
                {{ formatDate(clubData.currentSeason.endsAt) }}
              </span>
            </div>
          </div>

          <div v-if="showActiveParticipantsBlock && clubData.activeParticipants?.length" class="pub-card pub-participants-card">
            <div class="card-label">Active Participants</div>
            <div class="participant-chips">
              <span
                v-for="p in clubData.activeParticipants.slice(0, 36)"
                :key="`p-${p.userId}`"
                class="participant-chip"
                :title="p.teamName || ''"
              >
                {{ p.displayName }}
              </span>
              <span v-if="clubData.activeParticipants.length > 36" class="participant-chip participant-chip--more">
                +{{ clubData.activeParticipants.length - 36 }} more
              </span>
            </div>
          </div>
        </div>

        <!-- Featured workout -->
        <div v-if="showFeaturedWorkoutBlock && clubData.featuredWorkout" class="pub-card pub-featured-card">
          <div class="card-label">🔥 Top Workout This Week</div>
          <div class="featured-grid">
            <img
              v-if="clubData.featuredWorkout.imageUrl"
              :src="clubData.featuredWorkout.imageUrl"
              class="featured-image"
              alt="Featured workout"
            />
            <div class="featured-body">
              <div class="featured-type">{{ clubData.featuredWorkout.activityType }}</div>
              <div class="featured-distance">{{ Number(clubData.featuredWorkout.distanceMiles || 0).toFixed(1) }} <span class="featured-unit">mi</span></div>
              <div class="featured-tags">
                <span class="ftag ftag--kudos">👏 {{ clubData.featuredWorkout.kudosCount }} kudos</span>
                <span v-if="clubData.featuredWorkout.terrain" class="ftag">{{ clubData.featuredWorkout.terrain }}</span>
                <span v-if="clubData.featuredWorkout.teamName" class="ftag">{{ clubData.featuredWorkout.teamName }}</span>
              </div>
              <div class="featured-byline">
                By {{ clubData.featuredWorkout.byline || 'Member' }}
                <span v-if="clubData.featuredWorkout.completedAt"> · {{ formatDate(clubData.featuredWorkout.completedAt) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Photo album -->
        <div v-if="showPhotoAlbumBlock && clubData.albumSlides?.length" class="pub-card pub-album-card">
          <div class="card-label">📸 Club Album</div>
          <div class="album-shell">
            <button class="album-nav" @click="prevSlide" aria-label="Previous">‹</button>
            <div class="album-frame">
              <img :src="currentAlbumSlide.imageUrl" class="album-image" alt="Club photo" />
              <div v-if="currentAlbumSlide.caption" class="album-caption">{{ currentAlbumSlide.caption }}</div>
            </div>
            <button class="album-nav" @click="nextSlide" aria-label="Next">›</button>
          </div>
          <div class="album-dots">
            <button
              v-for="(_, idx) in clubData.albumSlides"
              :key="`dot-${idx}`"
              class="album-dot"
              :class="{ active: idx === albumSlideIndex }"
              @click="albumSlideIndex = idx"
            />
          </div>
        </div>

        <!-- Club Records + Race Divisions side by side -->
        <div class="pub-row" v-if="clubData.clubRecords?.length || clubData.raceDivisions?.halfMarathon?.length || clubData.raceDivisions?.marathon?.length">
          <div v-if="clubData.clubRecords?.length" class="pub-card pub-records-card">
            <div class="card-label">🏅 Club Records</div>
            <div class="records-list">
              <div
                v-for="record in clubData.clubRecords"
                :key="record.id || record.label"
                class="record-row"
              >
                <span class="record-label">{{ record.label }}</span>
                <span class="record-value">
                  {{ record.value != null ? record.value : '—' }}
                  <span v-if="record.unit" class="record-unit">{{ record.unit }}</span>
                </span>
              </div>
            </div>
          </div>

          <div
            v-if="clubData.raceDivisions?.halfMarathon?.length || clubData.raceDivisions?.marathon?.length"
            class="pub-card pub-race-card"
          >
            <div class="card-label">🏃 Race Divisions</div>
            <p class="race-intro">Members who've completed race-distance efforts.</p>
            <div class="race-blocks">
              <div v-if="clubData.raceDivisions?.halfMarathon?.length" class="race-block race-block--hm">
                <div class="race-block-head">🏅 Half Marathon <small>13.1+ mi</small></div>
                <ul class="race-list">
                  <li v-for="m in clubData.raceDivisions.halfMarathon" :key="`hm-${m.userId}`">
                    <span class="race-name">{{ m.name }}</span>
                    <span class="race-time">{{ m.bestTimeText }}</span>
                  </li>
                </ul>
              </div>
              <div v-if="clubData.raceDivisions?.marathon?.length" class="race-block race-block--marathon">
                <div class="race-block-head">🥇 Marathon <small>26.2+ mi</small></div>
                <ul class="race-list">
                  <li v-for="m in clubData.raceDivisions.marathon" :key="`m-${m.userId}`">
                    <span class="race-name">{{ m.name }}</span>
                    <span class="race-time">{{ m.bestTimeText }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- CTA -->
        <div class="pub-cta-card">
          <div class="cta-inner">
            <div class="cta-text">
              <div class="cta-eyebrow">Ready to compete?</div>
              <h2 class="cta-headline">Join {{ clubData.club.name }}</h2>
              <p class="cta-body">
                Compete in weekly fitness challenges, track your miles, earn points,
                and climb the leaderboard alongside your teammates.
              </p>
              <ul class="cta-perks">
                <li><span class="perk-icon">📍</span> Weekly goal tracking with per-person &amp; team totals</li>
                <li><span class="perk-icon">🏆</span> Season recognition awards &amp; division categories</li>
                <li><span class="perk-icon">📊</span> Live leaderboards and scorecards</li>
                <li><span class="perk-icon">🔗</span> Invite friends &amp; earn referral credit</li>
              </ul>
            </div>
            <div class="cta-actions">
              <button class="btn-cta" @click="goJoin">Join {{ clubData.club.name }}</button>
              <p class="cta-note">Already a member? <a :href="`/${orgSlug}`">Sign in</a></p>
            </div>
          </div>
        </div>

      </div><!-- /pub-content -->
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';

const route  = useRoute();
const router = useRouter();

const loading  = ref(true);
const error    = ref('');
const clubData = ref(null);
const configuredStats = ref([]);
const albumSlideIndex = ref(0);
let albumAutoplayTimer = null;

const orgSlug = computed(() => route.params.organizationSlug || 'ssc');
const clubId  = computed(() => route.params.clubId);

const goJoin = () => {
  router.push({ path: `/${orgSlug.value}/join`, query: { club: clubId.value } });
};

const publicPageConfig = computed(() => clubData.value?.club?.publicPageConfig || {});
const publicBannerTitle = computed(() => {
  const custom = String(publicPageConfig.value?.bannerTitle || '').trim();
  if (custom) return custom;
  return clubData.value?.club?.name || 'Club';
});
const publicBannerSubtitle = computed(() => String(publicPageConfig.value?.bannerSubtitle || '').trim());
const heroStyle = computed(() => {
  const banner = String(publicPageConfig.value?.bannerImageUrl || '').trim();
  if (!banner) return {};
  return {
    backgroundImage: `linear-gradient(rgba(15,23,42,.65), rgba(15,23,42,.65)), url(${banner})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  };
});
const showCurrentSeasonBlock = computed(() => publicPageConfig.value?.showCurrentSeason !== false);
const showActiveParticipantsBlock = computed(() => publicPageConfig.value?.showActiveParticipants !== false);
const showFeaturedWorkoutBlock = computed(() => publicPageConfig.value?.showFeaturedWorkout !== false);
const showPhotoAlbumBlock = computed(() => publicPageConfig.value?.showPhotoAlbum !== false);
const currentAlbumSlide = computed(() => {
  const slides = Array.isArray(clubData.value?.albumSlides) ? clubData.value.albumSlides : [];
  if (!slides.length) return { imageUrl: '', caption: '' };
  const idx = Math.max(0, Math.min(albumSlideIndex.value, slides.length - 1));
  return slides[idx] || { imageUrl: '', caption: '' };
});

const formatMiles = (n) => {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const decimalStatKeys = new Set(['total_miles', 'run_miles', 'ruck_miles']);
const fmtPubStat = (stat) => {
  const n = Number(stat.value ?? 0);
  if (decimalStatKeys.has(stat.key)) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return n.toLocaleString();
};

const formatDate = (raw) => {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return String(raw);
  }
};

const nextSlide = () => {
  const slides = Array.isArray(clubData.value?.albumSlides) ? clubData.value.albumSlides : [];
  if (!slides.length) return;
  albumSlideIndex.value = (albumSlideIndex.value + 1) % slides.length;
};
const prevSlide = () => {
  const slides = Array.isArray(clubData.value?.albumSlides) ? clubData.value.albumSlides : [];
  if (!slides.length) return;
  albumSlideIndex.value = (albumSlideIndex.value - 1 + slides.length) % slides.length;
};
const startAlbumAutoplay = () => {
  if (albumAutoplayTimer) clearInterval(albumAutoplayTimer);
  const slides = Array.isArray(clubData.value?.albumSlides) ? clubData.value.albumSlides : [];
  if (slides.length < 2) return;
  albumAutoplayTimer = setInterval(() => nextSlide(), 4500);
};

onMounted(async () => {
  if (!clubId.value) { error.value = 'Club not found.'; loading.value = false; return; }
  try {
    const [pubRes, statsRes] = await Promise.allSettled([
      api.get(`/summit-stats/clubs/${clubId.value}/public`, { skipAuthRedirect: true }),
      api.get(`/summit-stats/clubs/${clubId.value}/stats`, { skipAuthRedirect: true })
    ]);
    if (pubRes.status === 'fulfilled') clubData.value = pubRes.value.data;
    else throw new Error(pubRes.reason?.response?.data?.error?.message || 'Could not load this club page.');
    if (statsRes.status === 'fulfilled' && Array.isArray(statsRes.value?.data?.stats)) {
      configuredStats.value = statsRes.value.data.stats;
    }
    albumSlideIndex.value = 0;
    startAlbumAutoplay();
  } catch (e) {
    error.value = e?.message || 'Could not load this club page.';
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  if (albumAutoplayTimer) clearInterval(albumAutoplayTimer);
});
</script>

<style scoped>
/* ─── Base ────────────────────────────────────────────────────── */
.pub-page {
  min-height: 100vh;
  background: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

/* ─── Loading / Error ─────────────────────────────────────────── */
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
.error-icon { font-size: 2.5rem; }
.pub-error h2 { margin: 0; font-size: 1.25rem; color: #0f172a; }
.spinner {
  width: 40px; height: 40px;
  border: 3px solid #e2e8f0;
  border-top-color: #1d4ed8;
  border-radius: 50%;
  animation: spin .75s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Hero ────────────────────────────────────────────────────── */
.pub-hero {
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #1d4ed8 100%);
  color: #fff;
  padding: 64px 24px 88px;
  position: relative;
  overflow: hidden;
}
.pub-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 60% at 70% 50%, rgba(99,102,241,.28) 0%, transparent 70%);
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
  width: 80px; height: 80px;
  border-radius: 16px;
  object-fit: contain;
  background: rgba(255,255,255,.15);
  backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255,255,255,.25);
  padding: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,.25);
}
.pub-hero-text {}
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
  color: rgba(255,255,255,.75);
  font-weight: 400;
}
.pub-member-count {
  margin: 10px 0 0;
  font-size: 13px;
  color: rgba(255,255,255,.6);
  display: flex;
  align-items: center;
  gap: 6px;
}
.member-dot {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 6px #4ade80;
}
.hero-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}
.btn-hero-join {
  padding: 14px 32px;
  background: #fff;
  color: #1d4ed8;
  font-size: 15px;
  font-weight: 800;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0,0,0,.22);
  transition: transform .15s, box-shadow .15s;
  white-space: nowrap;
}
.btn-hero-join:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,.28); }
.btn-hero-shop {
  padding: 10px 22px;
  background: rgba(255,255,255,.12);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  border-radius: 10px;
  border: 1.5px solid rgba(255,255,255,.3);
  text-decoration: none;
  transition: background .15s;
  white-space: nowrap;
  cursor: pointer;
  backdrop-filter: blur(6px);
}
.btn-hero-shop:hover { background: rgba(255,255,255,.22); }

/* ─── Stats strip ─────────────────────────────────────────────── */
.pub-stats-wrap {
  max-width: 1040px;
  margin: -36px auto 0;
  padding: 0 24px;
  position: relative;
  z-index: 10;
}
.pub-stats-bar {
  display: flex;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(15,23,42,.12);
  overflow: hidden;
  border: 1px solid rgba(226,232,240,.8);
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
.stat-pill:last-child { border-right: none; }
.stat-pill--race { background: linear-gradient(135deg, #fffbeb, #fef3c7); }
.stat-icon { font-size: 1.25rem; margin-bottom: 2px; line-height: 1; }
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
  letter-spacing: .07em;
  color: #94a3b8;
}
@media (max-width: 600px) {
  .pub-stats-bar { flex-wrap: wrap; }
  .stat-pill { min-width: 50%; border-right: none; border-bottom: 1px solid #f1f5f9; }
  .stat-pill:last-child { border-bottom: none; }
}

/* ─── Content layout ──────────────────────────────────────────── */
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
@media (max-width: 680px) { .pub-row { grid-template-columns: 1fr; } }

/* ─── Base card ───────────────────────────────────────────────── */
.pub-card {
  background: #fff;
  border-radius: 16px;
  padding: 28px 28px 24px;
  box-shadow: 0 2px 12px rgba(15,23,42,.06);
  border: 1px solid rgba(226,232,240,.7);
}
.card-label {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: #94a3b8;
  margin-bottom: 14px;
}

/* ─── Season card ─────────────────────────────────────────────── */
.pub-season-card {}
.season-name {
  font-size: 1.35rem;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: -0.02em;
  margin-bottom: 12px;
}
.season-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #64748b;
}
.season-status-pill {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  background: #dbeafe;
  color: #1d4ed8;
}
.season-status-pill.status-closed { background: #fee2e2; color: #b91c1c; }
.season-status-pill.status-archived { background: #f1f5f9; color: #64748b; }
.season-sep { color: #cbd5e1; font-weight: 300; }
.season-date { font-size: 13px; }

/* ─── Participants card ───────────────────────────────────────── */
.pub-participants-card {}
.participant-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.participant-chip {
  padding: 5px 11px;
  border-radius: 999px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  transition: background .12s;
}
.participant-chip:hover { background: #f0f9ff; border-color: #bae6fd; }
.participant-chip--more {
  background: #f0f9ff;
  border-color: #bae6fd;
  color: #0369a1;
}

/* ─── Featured workout card ───────────────────────────────────── */
.pub-featured-card { border-left: 4px solid #f59e0b; }
.featured-grid {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 20px;
  align-items: start;
}
@media (max-width: 600px) { .featured-grid { grid-template-columns: 1fr; } }
.featured-image {
  width: 100%;
  height: 148px;
  object-fit: cover;
  border-radius: 10px;
  background: #f8fafc;
}
.featured-body { display: flex; flex-direction: column; gap: 8px; }
.featured-type {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #f59e0b;
}
.featured-distance {
  font-size: 2.2rem;
  font-weight: 900;
  color: #0f172a;
  letter-spacing: -0.04em;
  line-height: 1;
}
.featured-unit { font-size: 1rem; font-weight: 600; color: #64748b; }
.featured-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.ftag {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
}
.ftag--kudos { background: #fdf4ff; color: #9333ea; border-color: #e9d5ff; }
.featured-byline { font-size: 12px; color: #94a3b8; }

/* ─── Album card ──────────────────────────────────────────────── */
.pub-album-card {}
.album-shell {
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  align-items: center;
  gap: 12px;
}
.album-frame {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: #0f172a;
}
.album-image {
  width: 100%;
  height: 340px;
  object-fit: cover;
  display: block;
  transition: opacity .3s;
}
.album-caption {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 14px 16px 12px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: linear-gradient(transparent, rgba(2,6,23,.8));
}
.album-nav {
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
  font-size: 24px;
  color: #374151;
  box-shadow: 0 2px 8px rgba(0,0,0,.08);
  transition: background .12s, box-shadow .12s;
}
.album-nav:hover { background: #f8fafc; box-shadow: 0 4px 12px rgba(0,0,0,.12); }
.album-dots {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  gap: 6px;
}
.album-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #cbd5e1;
  border: none;
  cursor: pointer;
  transition: background .15s, transform .15s;
}
.album-dot.active { background: #1d4ed8; transform: scale(1.35); }

/* ─── Records card ────────────────────────────────────────────── */
.pub-records-card {}
.records-list { display: flex; flex-direction: column; }
.record-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
}
.record-row:last-child { border-bottom: none; }
.record-label { color: #374151; font-weight: 500; }
.record-value { font-weight: 800; color: #1d4ed8; font-variant-numeric: tabular-nums; }
.record-unit { font-weight: 500; font-size: 11px; color: #94a3b8; margin-left: 3px; }

/* ─── Race divisions card ─────────────────────────────────────── */
.pub-race-card {}
.race-intro { margin: -6px 0 14px; font-size: 12.5px; color: #94a3b8; }
.race-blocks { display: flex; flex-direction: column; gap: 14px; }
.race-block { border-radius: 10px; overflow: hidden; border: 1px solid #e5e7eb; }
.race-block--hm { background: #f0fdf4; border-color: #bbf7d0; }
.race-block--marathon { background: #fffbeb; border-color: #fde68a; }
.race-block-head {
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 700;
  color: #1f2937;
  border-bottom: 1px solid rgba(0,0,0,.06);
  display: flex;
  align-items: center;
  gap: 6px;
}
.race-block-head small { font-weight: 500; font-size: 11px; color: #6b7280; margin-left: 2px; }
.race-list {
  list-style: none;
  margin: 0; padding: 4px 0;
  max-height: 180px;
  overflow-y: auto;
}
.race-list li {
  display: flex;
  align-items: center;
  padding: 6px 14px;
  font-size: 13px;
  border-bottom: 1px solid rgba(0,0,0,.04);
}
.race-list li:last-child { border-bottom: none; }
.race-name { flex: 1; font-weight: 600; color: #1f2937; }
.race-time { font-variant-numeric: tabular-nums; color: #6b7280; font-size: 12px; }

/* ─── CTA card ────────────────────────────────────────────────── */
.pub-cta-card {
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%);
  border-radius: 20px;
  padding: 0;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(29,78,216,.25);
  position: relative;
}
.pub-cta-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 70% 60% at 80% 50%, rgba(99,102,241,.35) 0%, transparent 65%);
  pointer-events: none;
}
.cta-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  flex-wrap: wrap;
  padding: 48px 44px;
  position: relative;
  z-index: 1;
}
.cta-text { flex: 1; min-width: 260px; }
.cta-eyebrow {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .12em;
  color: #93c5fd;
  margin-bottom: 10px;
}
.cta-headline {
  font-size: clamp(1.5rem, 3vw, 2.25rem);
  font-weight: 900;
  color: #fff;
  letter-spacing: -0.03em;
  line-height: 1.1;
  margin: 0 0 14px;
}
.cta-body {
  font-size: 14.5px;
  color: rgba(255,255,255,.7);
  line-height: 1.65;
  margin: 0 0 20px;
  max-width: 420px;
}
.cta-perks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.cta-perks li {
  font-size: 13.5px;
  color: rgba(255,255,255,.8);
  display: flex;
  align-items: center;
  gap: 8px;
}
.perk-icon { font-size: 15px; flex-shrink: 0; }
.cta-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}
.btn-cta {
  padding: 15px 36px;
  background: #fff;
  color: #1d4ed8;
  font-size: 15px;
  font-weight: 800;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 6px 24px rgba(0,0,0,.2);
  transition: transform .15s, box-shadow .15s;
}
.btn-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(0,0,0,.28); }
.cta-note { font-size: 12px; color: rgba(255,255,255,.5); margin: 0; }
.cta-note a { color: rgba(255,255,255,.8); text-underline-offset: 3px; }

/* ─── Ghost button ────────────────────────────────────────────── */
.btn-ghost {
  display: inline-flex;
  align-items: center;
  padding: 9px 20px;
  border-radius: 8px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  color: #374151;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: background .12s;
}
.btn-ghost:hover { background: #f8fafc; }
</style>
