<template>
  <Teleport to="body">
    <div v-if="open" class="mpm-backdrop" @click.self="close">
      <div class="mpm-modal" role="dialog" aria-modal="true">
        <button type="button" class="mpm-close" aria-label="Close" @click="close">×</button>

        <div v-if="loading" class="mpm-loading">Loading…</div>
        <div v-else-if="error" class="mpm-error">{{ error }}</div>

        <template v-else-if="profile">
          <!-- Header -->
          <div class="mpm-top">
            <div class="mpm-avatar" aria-hidden="true">
              <img
                v-if="photoUrl(profile.member?.profilePhotoUrl)"
                :src="photoUrl(profile.member?.profilePhotoUrl)"
                alt=""
                class="mpm-avatar-img"
              />
              <div v-else class="mpm-avatar-fallback">{{ initials(profile.member) }}</div>
            </div>
            <div>
              <h2 class="mpm-title">{{ profile.member?.displayName || memberName }}</h2>
              <p v-if="subline(profile.member)" class="mpm-sub">{{ subline(profile.member) }}</p>
            </div>
          </div>

          <!-- Current Season Stats -->
          <div v-if="profile.currentSeasonStats" class="mpm-section">
            <h3 class="mpm-h">📅 {{ profile.currentSeasonStats.seasonName || 'Current Season' }}</h3>
            <div class="mpm-stats">
              <span class="mpm-stat"><strong>{{ fmtWhole(profile.currentSeasonStats.totalPoints) }}</strong> pts</span>
              <span class="mpm-stat"><strong>{{ fmtDec(profile.currentSeasonStats.totalMiles) }}</strong> mi</span>
              <span class="mpm-stat"><strong>{{ fmtWhole(profile.currentSeasonStats.totalWorkouts) }}</strong> workouts</span>
              <span v-if="profile.currentSeasonStats.totalMinutes" class="mpm-stat">
                <strong>{{ fmtWhole(profile.currentSeasonStats.totalMinutes) }}</strong> min moving
              </span>
            </div>
          </div>

          <!-- All-Time Stats -->
          <div class="mpm-section">
            <h3 class="mpm-h">All-time in this club</h3>
            <div class="mpm-stats">
              <span class="mpm-stat"><strong>{{ fmtWhole(profile.allTimeStats?.totalPoints) }}</strong> pts</span>
              <span class="mpm-stat"><strong>{{ fmtDec(profile.allTimeStats?.totalMiles) }}</strong> mi</span>
              <span class="mpm-stat"><strong>{{ fmtWhole(profile.allTimeStats?.totalWorkouts) }}</strong> workouts</span>
              <span v-if="profile.allTimeStats?.longestRunMiles != null" class="mpm-stat">
                Longest run <strong>{{ fmtDec(profile.allTimeStats.longestRunMiles) }}</strong> mi
              </span>
              <span v-if="profile.allTimeStats?.totalMinutes != null" class="mpm-stat">
                <strong>{{ fmtWhole(profile.allTimeStats.totalMinutes) }}</strong> min moving
              </span>
            </div>
          </div>

          <!-- Trophy Case -->
          <div class="mpm-trophy-case">
            <div class="mpm-tc-header">
              <span class="mpm-tc-title">🏆 Trophy Case</span>
            </div>

            <div v-if="trophyLoading" class="mpm-trophy-empty">Loading trophies…</div>
            <div v-else-if="trophyFailed" class="mpm-trophy-empty mpm-trophy-retry" @click="load">
              Could not load trophies — tap to retry
            </div>
            <div v-else-if="!hasTrophies" class="mpm-trophy-empty">No trophies yet — keep training!</div>

            <!-- Recognition Awards shelf -->
            <div v-if="trophy?.seasonAwards?.length" class="mpm-tc-shelf">
              <div class="mpm-tc-shelf-label">🎖 Recognition Awards</div>
              <div class="mpm-tc-shelf-row">
                <div
                  v-for="a in trophy.seasonAwards"
                  :key="a.categoryId"
                  class="mpm-tc-trophy"
                  :title="awardTooltip(a)"
                >
                  <div class="mpm-tc-trophy-icon-wrap">
                    <img v-if="a.iconUrl" :src="a.iconUrl" class="mpm-tc-trophy-img" alt="" />
                    <span v-else class="mpm-tc-trophy-emoji">{{ emojiFor(a.icon) }}</span>
                    <span v-if="a.count > 1" class="mpm-tc-count">×{{ a.count }}</span>
                  </div>
                  <div class="mpm-tc-nameplate">{{ a.label }}</div>
                </div>
              </div>
            </div>

            <!-- Race Clubs shelf -->
            <div v-if="trophy?.raceClubs?.length" class="mpm-tc-shelf">
              <div class="mpm-tc-shelf-label">🏅 Race Clubs</div>
              <div class="mpm-tc-shelf-row">
                <div
                  v-for="rc in trophy.raceClubs"
                  :key="rc.id"
                  class="mpm-tc-trophy"
                  :title="`${rc.label}: ${rc.count}× completed`"
                >
                  <div class="mpm-tc-trophy-icon-wrap mpm-tc-trophy-icon-wrap--race">
                    <img v-if="rc.earnedTier?.iconUrl" :src="rc.earnedTier.iconUrl" class="mpm-tc-trophy-img" alt="" />
                    <span v-else class="mpm-tc-trophy-emoji">🏅</span>
                    <span class="mpm-tc-count">×{{ rc.count }}</span>
                  </div>
                  <div class="mpm-tc-nameplate">{{ rc.label }}</div>
                </div>
              </div>
            </div>

            <!-- Completed Challenges shelf -->
            <div v-if="trophy?.completedChallenges?.length" class="mpm-tc-shelf">
              <div class="mpm-tc-shelf-label">⚡ Challenges</div>
              <div class="mpm-tc-shelf-row">
                <div
                  v-for="ch in trophy.completedChallenges"
                  :key="ch.taskId || ch.label"
                  class="mpm-tc-trophy"
                  :title="`${ch.label} · Completed ${ch.count}×`"
                >
                  <div class="mpm-tc-trophy-icon-wrap mpm-tc-trophy-icon-wrap--challenge">
                    <img v-if="ch.iconUrl" :src="ch.iconUrl" class="mpm-tc-trophy-img" alt="" />
                    <span v-else-if="ch.icon && !String(ch.icon).startsWith('icon:')" class="mpm-tc-trophy-emoji">{{ ch.icon }}</span>
                    <span v-else class="mpm-tc-trophy-emoji">⚡</span>
                    <span v-if="ch.count > 1" class="mpm-tc-count">×{{ ch.count }}</span>
                  </div>
                  <div class="mpm-tc-nameplate">{{ ch.label }}</div>
                </div>
              </div>
            </div>

            <!-- Club Records Held — single unified list using stored values -->
            <div v-if="trophy?.recordsHeld?.length" class="mpm-tc-shelf mpm-tc-shelf--pr">
              <div class="mpm-tc-shelf-label">📋 Club Records Held</div>
              <div class="mpm-pr-list">
                <div
                  v-for="r in trophy.recordsHeld"
                  :key="r.id"
                  class="mpm-pr-row"
                >
                  <img v-if="r.iconUrl" :src="r.iconUrl" class="mpm-pr-icon" alt="" />
                  <span v-else class="mpm-pr-icon-ph">🏆</span>
                  <span class="mpm-pr-label">{{ r.label }}</span>
                  <span v-if="r.value != null" class="mpm-pr-value">
                    {{ fmtPr(r) }}
                    <span v-if="r.unit && r.metricKey !== 'race_chip_time_seconds'" class="mpm-pr-unit">{{ r.unit }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';

const props = defineProps({
  clubId: { type: [Number, String], required: true },
  userId: { type: [Number, String], default: null },
  memberName: { type: String, default: '' }
});

const emit = defineEmits(['close']);

const open = computed(() => !!props.userId);
const loading = ref(false);
const error = ref('');
const profile = ref(null);
const trophy = ref(null);
const trophyLoading = ref(false);
const trophyFailed = ref(false);

const close = () => emit('close');

const photoUrl = (pathOrUrl) => toUploadsUrl(pathOrUrl);

const initials = (m) => {
  const a = String(m?.firstName || '').trim()[0] || '';
  const b = String(m?.lastName || '').trim()[0] || '';
  return `${a}${b}`.toUpperCase() || String(m?.displayName || 'M').slice(0, 2).toUpperCase();
};

const subline = (m) => {
  const age = m?.age != null ? `${m.age} yrs` : '';
  const gender = String(m?.gender || '').trim();
  const city = String(m?.homeCity || '').trim();
  const st = String(m?.homeState || '').trim();
  const loc = [city, st].filter(Boolean).join(', ');
  return [age, gender, loc].filter(Boolean).join(' · ');
};

const fmtWhole = (v) => Number(v || 0).toLocaleString();
const fmtDec = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });

const fmtPr = (r) => {
  if (r.metricKey === 'race_chip_time_seconds' && r.value != null) {
    const s = Math.round(Number(r.value));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  return r.value != null ? r.value : '—';
};

const hasTrophies = computed(() =>
  !!(trophy.value?.raceClubs?.length || trophy.value?.recordsHeld?.length ||
     trophy.value?.seasonAwards?.length || trophy.value?.completedChallenges?.length)
);

const emojiFor = (icon) => {
  if (!icon || String(icon).startsWith('icon:')) return '🏅';
  return icon;
};

const awardTooltip = (a) => {
  const weeks = (a.weekNumbers || []).filter(Boolean);
  const weekStr = weeks.length ? `Won: Week ${weeks.join(', Week ')}` : '';
  return [a.label, weekStr].filter(Boolean).join('\n');
};


const load = async () => {
  if (!props.clubId || !props.userId) return;
  loading.value = true;
  trophyLoading.value = true;
  trophyFailed.value = false;
  error.value = '';
  profile.value = null;
  trophy.value = null;
  try {
    const [profileRes, trophyRes] = await Promise.allSettled([
      api.get(`/summit-stats/clubs/${props.clubId}/members/${props.userId}/profile`),
      api.get(`/summit-stats/clubs/${props.clubId}/members/${props.userId}/trophy-case`)
    ]);
    if (profileRes.status === 'fulfilled') profile.value = profileRes.value.data;
    else error.value = profileRes.reason?.response?.data?.error?.message || 'Could not load profile.';
    if (trophyRes.status === 'fulfilled') {
      trophy.value = trophyRes.value.data;
    } else {
      trophyFailed.value = true;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not load profile.';
  } finally {
    loading.value = false;
    trophyLoading.value = false;
  }
};

watch(() => props.userId, (uid) => {
  if (uid) load();
  else { profile.value = null; trophy.value = null; trophyFailed.value = false; }
}, { immediate: true });
</script>

<style scoped>
.mpm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 16px;
}
.mpm-modal {
  background: #fff;
  border-radius: 20px;
  padding: 28px 24px 24px;
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
}
.mpm-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #f1f5f9;
  border: none;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mpm-close:hover { background: #e2e8f0; }
.mpm-loading, .mpm-error {
  text-align: center;
  color: #64748b;
  padding: 24px 0;
}
.mpm-error { color: #b91c1c; }
.mpm-top {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}
.mpm-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #e2e8f0;
  flex-shrink: 0;
  overflow: hidden;
}
.mpm-avatar-img { width: 100%; height: 100%; object-fit: cover; }
.mpm-avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  color: #64748b;
}
.mpm-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
}
.mpm-sub {
  margin: 3px 0 0;
  font-size: 0.85rem;
  color: #64748b;
}
.mpm-section {
  padding: 14px 0;
  border-top: 1px solid #f1f5f9;
}
.mpm-section--compact { padding-top: 10px; }
.mpm-h {
  margin: 0 0 6px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}
.mpm-p { margin: 0; font-size: 0.92rem; color: #334155; }
.mpm-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.mpm-stat { font-size: 0.9rem; color: #334155; }
.mpm-stat strong { color: #1d4ed8; }
/* ── Trophy Case ──────────────────────────────────────── */
.mpm-trophy-case {
  margin-top: 16px;
  background: linear-gradient(160deg, #1e1a14 0%, #2d2518 60%, #1e1a14 100%);
  border-radius: 16px;
  padding: 16px 14px 18px;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.2);
}
.mpm-tc-header {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
}
.mpm-tc-title {
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #d4a843;
}
.mpm-trophy-empty {
  font-size: 0.85rem;
  color: rgba(255,255,255,0.4);
  padding: 8px 0;
}
.mpm-trophy-retry { cursor: pointer; color: #a5b4fc; text-decoration: underline; text-underline-offset: 2px; }

/* Shelf */
.mpm-tc-shelf {
  margin-bottom: 14px;
}
.mpm-tc-shelf:last-child { margin-bottom: 0; }
.mpm-tc-shelf-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(212,168,67,0.7);
  margin-bottom: 8px;
}
.mpm-tc-shelf-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 2px solid rgba(255,255,255,0.07);
  box-shadow: 0 3px 0 rgba(0,0,0,0.3);
}
.mpm-tc-shelf:last-child .mpm-tc-shelf-row { border-bottom: none; box-shadow: none; padding-bottom: 0; }

/* Individual trophy */
.mpm-tc-trophy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 80px;
  cursor: default;
}
.mpm-tc-trophy-icon-wrap {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 14px;
  background: linear-gradient(145deg, #3d3420 0%, #2a2212 100%);
  border: 1px solid rgba(212,168,67,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08);
  transition: transform 0.15s, box-shadow 0.15s;
}
.mpm-tc-trophy:hover .mpm-tc-trophy-icon-wrap {
  transform: translateY(-3px);
  box-shadow: 0 8px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
}
.mpm-tc-trophy-icon-wrap--race  { background: linear-gradient(145deg, #1e3340 0%, #12232d 100%); border-color: rgba(56,189,248,0.3); }
.mpm-tc-trophy-icon-wrap--challenge { background: linear-gradient(145deg, #2d1e40 0%, #1e1228 100%); border-color: rgba(167,139,250,0.3); }
.mpm-tc-trophy-icon-wrap--cr    { background: linear-gradient(145deg, #3d1e1e 0%, #2a1212 100%); border-color: rgba(248,113,113,0.3); }
.mpm-tc-trophy-img  { width: 52px; height: 52px; object-fit: contain; border-radius: 8px; }
.mpm-tc-trophy-emoji { font-size: 44px; line-height: 1; }
.mpm-tc-count {
  position: absolute;
  bottom: -6px;
  right: -6px;
  background: #d4a843;
  color: #1e1a14;
  font-size: 11px;
  font-weight: 900;
  border-radius: 999px;
  padding: 2px 6px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.4);
  line-height: 1.2;
}
.mpm-tc-nameplate {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,0.6);
  text-align: center;
  line-height: 1.3;
  max-width: 80px;
  word-break: break-word;
}

/* Personal Records list inside trophy case */
.mpm-tc-shelf--pr .mpm-tc-shelf-row { display: block; }
.mpm-pr-list { display: flex; flex-direction: column; gap: 4px; }
.mpm-pr-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 8px;
  background: rgba(255,255,255,0.05);
  font-size: 0.83rem;
}
.mpm-pr-row--cr { background: rgba(212,168,67,0.12); }
.mpm-pr-icon { width: 20px; height: 20px; object-fit: contain; border-radius: 4px; flex-shrink: 0; }
.mpm-pr-icon-ph { font-size: 14px; flex-shrink: 0; }
.mpm-pr-label { flex: 1; color: rgba(255,255,255,0.8); font-weight: 500; }
.mpm-cr-tag { display: inline-block; font-size: 9px; font-weight: 800; background: #d4a843; color: #1e1a14; border-radius: 4px; padding: 1px 4px; margin-left: 4px; vertical-align: middle; }
.mpm-pr-value { font-weight: 700; color: #fff; white-space: nowrap; }
.mpm-pr-unit { font-weight: 400; color: rgba(255,255,255,0.5); font-size: 0.8em; margin-left: 2px; }

/* keep old names referenced elsewhere as aliases */
.mpm-award-count {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: #4338ca;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
}
.mpm-award-label {
  font-size: 10px;
  font-weight: 600;
  color: #475569;
  text-align: center;
  line-height: 1.2;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
