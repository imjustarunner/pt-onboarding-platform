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

          <!-- Gender -->
          <div v-if="profile.member?.gender" class="mpm-section">
            <h3 class="mpm-h">Gender</h3>
            <p class="mpm-p">{{ profile.member.gender }}</p>
          </div>

          <!-- Stats -->
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

          <!-- Bio fields -->
          <div v-if="hasBio(profile.member)" class="mpm-section mpm-section--compact">
            <template v-if="profile.member?.heardAboutClub">
              <h3 class="mpm-h">How they heard about the club</h3>
              <p class="mpm-p">{{ profile.member.heardAboutClub }}</p>
            </template>
            <template v-if="profile.member?.runningFitnessBackground">
              <h3 class="mpm-h">Background</h3>
              <p class="mpm-p">{{ profile.member.runningFitnessBackground }}</p>
            </template>
            <template v-if="profile.member?.currentFitnessActivities">
              <h3 class="mpm-h">Activities</h3>
              <p class="mpm-p">{{ profile.member.currentFitnessActivities }}</p>
            </template>
          </div>

          <!-- Trophy Case -->
          <div v-if="hasTrophies" class="mpm-section mpm-trophy-section">
            <h3 class="mpm-h">🏆 Trophy Case</h3>

            <!-- Season Recognition Awards (weekly award badges) -->
            <div v-if="trophy.seasonAwards?.length" class="mpm-awards-section">
              <div class="mpm-records-label">Recognition Awards</div>
              <div class="mpm-awards-grid">
                <div
                  v-for="a in trophy.seasonAwards"
                  :key="a.categoryId"
                  class="mpm-award-badge"
                  :title="awardTooltip(a)"
                >
                  <div class="mpm-award-icon-wrap">
                    <img v-if="a.iconUrl" :src="a.iconUrl" class="mpm-award-icon" alt="" />
                    <span v-else class="mpm-award-emoji">{{ emojiFor(a.icon) }}</span>
                    <span v-if="a.count > 1" class="mpm-award-count">{{ a.count }}</span>
                  </div>
                  <div class="mpm-award-label">{{ a.label }}</div>
                </div>
              </div>
            </div>

            <!-- Race Club Badges -->
            <div v-if="trophy.raceClubs?.length" class="mpm-badges">
              <div
                v-for="rc in trophy.raceClubs"
                :key="rc.id"
                class="mpm-badge"
                :title="`${rc.label}: ${rc.count}× completed`"
              >
                <img v-if="rc.earnedTier?.iconUrl" :src="rc.earnedTier.iconUrl" class="mpm-badge-icon" alt="" />
                <span v-else class="mpm-badge-emoji">🏅</span>
                <div class="mpm-badge-info">
                  <span class="mpm-badge-name">{{ rc.label }}</span>
                  <span class="mpm-badge-count">{{ rc.count }}×</span>
                </div>
              </div>
            </div>

            <!-- Personal Records -->
            <div v-if="trophy.personalRecords?.length" class="mpm-records">
              <div class="mpm-records-label">Personal Records</div>
              <div
                v-for="r in trophy.personalRecords"
                :key="r.id"
                class="mpm-record-row"
                :class="{ 'mpm-record-row--cr': r.isClubRecord }"
              >
                <img v-if="r.iconUrl" :src="r.iconUrl" class="mpm-record-icon" alt="" />
                <span v-else class="mpm-record-icon-ph">⭐</span>
                <span class="mpm-record-label">
                  {{ r.label }}
                  <span v-if="r.isClubRecord" class="mpm-cr-badge">CR</span>
                </span>
                <span class="mpm-record-value">
                  {{ fmtPr(r) }}
                  <span v-if="r.unit && r.metricKey !== 'race_chip_time_seconds'" class="mpm-record-unit">{{ r.unit }}</span>
                </span>
                <span v-if="r.context" class="mpm-record-year">{{ r.context }}</span>
              </div>
            </div>

            <!-- Club Records Held (icon badge grid with hover tooltip) -->
            <div v-if="extraRecordsHeld.length" class="mpm-cr-section">
              <div class="mpm-records-label">Club Records Held</div>
              <div class="mpm-cr-grid">
                <div
                  v-for="r in extraRecordsHeld"
                  :key="r.id"
                  class="mpm-cr-badge-wrap"
                  :title="`${r.label}${r.value != null ? ': ' + fmtPr(r) + (r.unit && r.metricKey !== 'race_chip_time_seconds' ? ' ' + r.unit : '') : ''}${r.holderYear ? ' · ' + r.holderYear : ''}`"
                >
                  <img v-if="r.iconUrl" :src="r.iconUrl" class="mpm-cr-badge-icon" alt="" />
                  <span v-else class="mpm-cr-badge-trophy">🏆</span>
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

const close = () => emit('close');

const photoUrl = (pathOrUrl) => toUploadsUrl(pathOrUrl);

const initials = (m) => {
  const a = String(m?.firstName || '').trim()[0] || '';
  const b = String(m?.lastName || '').trim()[0] || '';
  return `${a}${b}`.toUpperCase() || String(m?.displayName || 'M').slice(0, 2).toUpperCase();
};

const subline = (m) => {
  const age = m?.age != null ? `${m.age} yrs` : '';
  const city = String(m?.homeCity || '').trim();
  const st = String(m?.homeState || '').trim();
  const loc = [city, st].filter(Boolean).join(', ');
  return [age, loc].filter(Boolean).join(' · ');
};

const hasBio = (m) => !!(m?.heardAboutClub || m?.runningFitnessBackground || m?.currentFitnessActivities);

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
     trophy.value?.personalRecords?.length || trophy.value?.seasonAwards?.length)
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

const extraRecordsHeld = computed(() => {
  if (!trophy.value?.recordsHeld?.length) return [];
  const prIds = new Set((trophy.value.personalRecords || []).map((r) => r.id));
  return trophy.value.recordsHeld.filter((r) => !prIds.has(r.id));
});

const load = async () => {
  if (!props.clubId || !props.userId) return;
  loading.value = true;
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
    if (trophyRes.status === 'fulfilled') trophy.value = trophyRes.value.data;
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not load profile.';
  } finally {
    loading.value = false;
  }
};

watch(() => props.userId, (uid) => { if (uid) load(); else { profile.value = null; trophy.value = null; } }, { immediate: true });
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
.mpm-trophy-section { background: #fafafa; border-radius: 12px; padding: 14px 12px; border-top: none; margin-top: 12px; }
.mpm-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}
.mpm-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border-radius: 10px;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 4px rgba(0,0,0,.05);
}
.mpm-badge-icon { width: 32px; height: 32px; object-fit: contain; border-radius: 6px; }
.mpm-badge-emoji { font-size: 28px; }
.mpm-badge-info { display: flex; flex-direction: column; }
.mpm-badge-name { font-size: 0.82rem; font-weight: 700; color: #1e293b; }
.mpm-badge-count { font-size: 0.75rem; color: #64748b; }
.mpm-records { margin-top: 6px; }
.mpm-records-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px; }
.mpm-record-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid #f1f5f9;
  font-size: 0.88rem;
}
.mpm-record-row--cr { background: #fffbeb; border-radius: 6px; padding: 6px 6px; }
.mpm-record-icon { width: 22px; height: 22px; object-fit: contain; border-radius: 4px; flex-shrink: 0; }
.mpm-record-icon-ph { font-size: 16px; flex-shrink: 0; }
.mpm-record-label { flex: 1; color: #334155; font-weight: 500; }
.mpm-cr-badge { display: inline-block; font-size: 9px; font-weight: 800; background: #fbbf24; color: #92400e; border-radius: 4px; padding: 1px 4px; margin-left: 4px; vertical-align: middle; }
.mpm-record-value { font-weight: 700; color: #0f172a; white-space: nowrap; }
.mpm-record-unit { font-weight: 400; color: #64748b; font-size: 0.8em; margin-left: 2px; }
.mpm-record-year { font-size: 0.78rem; color: #94a3b8; }

/* Club Records icon grid */
.mpm-cr-section { margin-top: 10px; }
.mpm-cr-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}
.mpm-cr-badge-wrap {
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
  position: relative;
}
.mpm-cr-badge-wrap:hover {
  border-color: #a5b4fc;
  box-shadow: 0 2px 8px rgba(99,102,241,0.2);
}
.mpm-cr-badge-icon { width: 38px; height: 38px; object-fit: contain; border-radius: 6px; }
.mpm-cr-badge-trophy { font-size: 28px; line-height: 1; }

/* Season Recognition Award badges */
.mpm-awards-section { margin-bottom: 10px; }
.mpm-awards-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}
.mpm-award-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 64px;
  cursor: default;
}
.mpm-award-icon-wrap {
  position: relative;
  width: 50px;
  height: 50px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.mpm-award-badge:hover .mpm-award-icon-wrap {
  border-color: #a5b4fc;
  box-shadow: 0 2px 8px rgba(99,102,241,0.2);
}
.mpm-award-icon { width: 36px; height: 36px; object-fit: contain; border-radius: 6px; }
.mpm-award-emoji { font-size: 26px; line-height: 1; }
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
