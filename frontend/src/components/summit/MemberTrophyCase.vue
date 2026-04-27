<template>
  <section class="card dash-section dash-section--trophy-case">
    <div class="trophy-head">
      <div>
        <h2>My Awards &amp; Records</h2>
        <p class="muted">
          Recognition earned across all your seasons. Awards are tracked going forward —
          past weeks closed before this ledger was added won't appear.
        </p>
      </div>
      <div v-if="totals.lifetimeCount" class="trophy-head-totals">
        <span class="trophy-total"><strong>{{ totals.lifetimeCount }}</strong> earned</span>
        <span class="trophy-dot" aria-hidden="true">·</span>
        <span class="trophy-total"><strong>{{ totals.distinctLabels }}</strong> unique</span>
      </div>
    </div>

    <div v-if="loading" class="trophy-empty">Loading your trophy case…</div>
    <div v-else-if="errorMessage" class="trophy-empty trophy-empty--error">{{ errorMessage }}</div>
    <div v-else-if="!groupedAwards.length && !completedChallenges.length" class="trophy-empty">
      No awards yet. Keep training — recognition winners are posted when each week closes.
    </div>

    <template v-else>
      <!-- ── Recognition awards ──────────────────────────────────────── -->
      <div v-if="groupedAwards.length">
        <p class="trophy-section-label">Recognition Awards</p>
        <div class="trophy-grid">
          <button
            v-for="award in groupedAwards"
            :key="award.key"
            type="button"
            class="trophy-card"
            @click="openAward(award)"
          >
            <div class="trophy-card-icon">
              <img v-if="award.iconUrl" :src="award.iconUrl" :alt="award.label" />
              <span v-else-if="award.iconText" class="trophy-emoji">{{ award.iconText }}</span>
              <span v-else class="trophy-emoji" aria-hidden="true">🏆</span>
            </div>
            <div class="trophy-card-body">
              <div class="trophy-card-label">{{ award.label }}</div>
              <div class="trophy-card-meta">
                <span class="trophy-card-count">Earned {{ award.count }}×</span>
                <span v-if="award.latestGrantedAt" class="trophy-card-date">
                  · latest {{ formatShortDate(award.latestGrantedAt) }}
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- ── Completed challenges ────────────────────────────────────── -->
      <div v-if="completedChallenges.length" :class="groupedAwards.length ? 'trophy-challenges-section' : ''">
        <p class="trophy-section-label">Completed Challenges</p>
        <div class="trophy-grid">
          <button
            v-for="ch in completedChallenges"
            :key="ch.label"
            type="button"
            class="trophy-card trophy-card--challenge"
            @click="openChallenge(ch)"
          >
            <div class="trophy-card-icon">
              <img v-if="ch.iconUrl" :src="ch.iconUrl" :alt="ch.label" />
              <span v-else-if="ch.iconText" class="trophy-emoji">{{ ch.iconText }}</span>
              <span v-else class="trophy-emoji" aria-hidden="true">⚡</span>
            </div>
            <div class="trophy-card-body">
              <div class="trophy-card-label">{{ ch.label }}</div>
              <div class="trophy-card-meta">
                <span class="trophy-card-count">Completed {{ ch.count }}×</span>
                <span v-if="ch.latestCompletedAt" class="trophy-card-date">
                  · latest {{ formatShortDate(ch.latestCompletedAt) }}
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </template>

    <!-- Recognition award detail modal -->
    <transition name="trophy-modal">
      <div v-if="activeAward" class="trophy-modal-backdrop" @click.self="activeAward = null">
        <div class="trophy-modal">
          <button type="button" class="trophy-modal-close" @click="activeAward = null">×</button>
          <div class="trophy-modal-head">
            <div class="trophy-modal-icon">
              <img v-if="activeAward.iconUrl" :src="activeAward.iconUrl" :alt="activeAward.label" />
              <span v-else-if="activeAward.iconText" class="trophy-emoji">{{ activeAward.iconText }}</span>
              <span v-else class="trophy-emoji" aria-hidden="true">🏆</span>
            </div>
            <div>
              <h3>{{ activeAward.label }}</h3>
              <p class="muted">Earned {{ activeAward.count }}× across {{ activeAward.distinctSeasons }} season{{ activeAward.distinctSeasons === 1 ? '' : 's' }}.</p>
            </div>
          </div>
          <ul class="trophy-grant-list">
            <li v-for="grant in activeAward.grants" :key="grant.id" class="trophy-grant">
              <div class="trophy-grant-main">
                <div class="trophy-grant-season">{{ grant.seasonName || 'Season' }}</div>
                <div class="trophy-grant-club muted">{{ grant.clubName || '' }}</div>
              </div>
              <div class="trophy-grant-right">
                <span v-if="grant.metricValue != null" class="trophy-grant-value">
                  {{ formatValue(grant.metricValue) }}
                </span>
                <span class="trophy-grant-date muted">
                  {{ formatShortDate(grant.grantedAt) }}
                </span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </transition>

    <!-- Challenge completion detail modal -->
    <transition name="trophy-modal">
      <div v-if="activeChallenge" class="trophy-modal-backdrop" @click.self="activeChallenge = null">
        <div class="trophy-modal">
          <button type="button" class="trophy-modal-close" @click="activeChallenge = null">×</button>
          <div class="trophy-modal-head">
            <div class="trophy-modal-icon trophy-modal-icon--challenge">
              <img v-if="activeChallenge.iconUrl" :src="activeChallenge.iconUrl" :alt="activeChallenge.label" />
              <span v-else-if="activeChallenge.iconText" class="trophy-emoji">{{ activeChallenge.iconText }}</span>
              <span v-else class="trophy-emoji" aria-hidden="true">⚡</span>
            </div>
            <div>
              <h3>{{ activeChallenge.label }}</h3>
              <p class="muted">Completed {{ activeChallenge.count }}× across all seasons.</p>
            </div>
          </div>
          <ul class="trophy-grant-list">
            <li v-for="(c, i) in activeChallenge.completions" :key="`cc-${i}`" class="trophy-grant">
              <div class="trophy-grant-main">
                <div class="trophy-grant-season">{{ c.seasonName || 'Season' }}</div>
                <div class="trophy-grant-club muted">{{ c.clubName || '' }}</div>
              </div>
              <div class="trophy-grant-right">
                <span v-if="c.distanceMiles != null" class="trophy-grant-value">
                  {{ Number(c.distanceMiles).toFixed(2) }} mi
                </span>
                <span class="trophy-grant-date muted">
                  {{ formatShortDate(c.completedAt) }}
                </span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </transition>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';

const props = defineProps({
  clubId: { type: [Number, String], default: null },
  autoLoad: { type: Boolean, default: true }
});

const loading = ref(false);
const errorMessage = ref('');
const awards = ref([]);
const rawCompletedChallenges = ref([]);
const totals = ref({ lifetimeCount: 0, distinctLabels: 0, challengeCount: 0 });
const activeAward = ref(null);
const activeChallenge = ref(null);

const load = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    const params = {};
    const clubId = Number(props.clubId);
    if (Number.isFinite(clubId) && clubId > 0) params.clubId = clubId;
    const { data } = await api.get('/summit-stats/me/awards', { params, skipGlobalLoading: true });
    awards.value = Array.isArray(data?.awards) ? data.awards : [];
    rawCompletedChallenges.value = Array.isArray(data?.completedChallenges) ? data.completedChallenges : [];
    totals.value = data?.totals || { lifetimeCount: 0, distinctLabels: 0, challengeCount: 0 };
  } catch (err) {
    errorMessage.value = err?.response?.data?.error?.message || 'Failed to load your trophy case.';
    awards.value = [];
    rawCompletedChallenges.value = [];
    totals.value = { lifetimeCount: 0, distinctLabels: 0, challengeCount: 0 };
  } finally {
    loading.value = false;
  }
};

onMounted(() => { if (props.autoLoad) load(); });
watch(() => props.clubId, () => { if (props.autoLoad) load(); });

const isLikelyUrl = (s) => typeof s === 'string' && /^(https?:|\/)/.test(s);
const iconCache = ref({});

const resolveIconUrl = (icon) => {
  if (!icon) return '';
  const str = String(icon).trim();
  if (!str) return '';
  if (isLikelyUrl(str)) return str;
  if (str.startsWith('icon:')) {
    const id = parseInt(str.replace('icon:', ''), 10);
    if (!id) return '';
    if (iconCache.value[id]) return iconCache.value[id];
    api.get(`/icons/${id}`).then(({ data }) => {
      if (data?.url) iconCache.value[id] = toUploadsUrl(data.url) || data.url;
    }).catch(() => {});
    return iconCache.value[id] || '';
  }
  return '';
};

const resolveIconText = (icon) => {
  if (!icon) return '';
  const str = String(icon).trim();
  if (!str) return '';
  if (isLikelyUrl(str)) return '';
  if (/^\d+$/.test(str)) return '';
  if (str.startsWith('icon:')) return '';
  return str; // emoji or short text
};

const groupedAwards = computed(() => {
  return (awards.value || []).map((bucket) => {
    const grants = Array.isArray(bucket.grants) ? bucket.grants.slice() : [];
    grants.sort((a, b) => (new Date(b.grantedAt || 0)) - (new Date(a.grantedAt || 0)));
    const seasonIds = new Set(grants.map((g) => Number(g.classId)).filter((n) => Number.isFinite(n)));
    return {
      key: `${bucket.label}__${bucket.icon || ''}`,
      label: bucket.label,
      iconUrl: resolveIconUrl(bucket.icon),
      iconText: resolveIconText(bucket.icon),
      count: bucket.count || grants.length,
      latestGrantedAt: bucket.latestGrantedAt,
      distinctSeasons: seasonIds.size,
      grants
    };
  });
});

const openAward = (award) => { activeAward.value = award; };

const completedChallenges = computed(() =>
  (rawCompletedChallenges.value || []).map((ch) => ({
    label: ch.label,
    iconUrl: resolveIconUrl(ch.icon),
    iconText: resolveIconText(ch.icon),
    count: ch.count,
    latestCompletedAt: ch.latestCompletedAt,
    completions: ch.completions || []
  }))
);

const openChallenge = (ch) => { activeChallenge.value = ch; };

const formatShortDate = (raw) => {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
};

const formatValue = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

defineExpose({ reload: load });
</script>

<style scoped>
.dash-section--trophy-case {
  background: linear-gradient(180deg, #fff 0%, #fdfaf3 100%);
}

.trophy-head {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.trophy-head h2 { margin: 0 0 4px 0; font-size: 1.1rem; }
.trophy-head p.muted { margin: 0; font-size: 0.85rem; }
.trophy-head-totals { display: flex; gap: 6px; align-items: center; font-size: 0.9rem; color: #4b5563; }
.trophy-total strong { color: #111827; }
.trophy-dot { color: #9ca3af; }

.trophy-section-label {
  font-size: 0.73rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #9ca3af;
  margin: 0 0 10px;
}
.trophy-challenges-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #f3f4f6;
}
.trophy-card--challenge {
  border-color: #e0e7ff;
}
.trophy-card--challenge:hover {
  border-color: #6366f1;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.18);
}
.trophy-modal-icon--challenge {
  background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
}
.trophy-empty {
  padding: 24px;
  text-align: center;
  color: #6b7280;
  border: 1px dashed #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.trophy-empty--error { color: #b91c1c; border-color: #fecaca; background: #fef2f2; }

.trophy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
}
.trophy-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  cursor: pointer;
  text-align: center;
  transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
}
.trophy-card:hover {
  transform: translateY(-2px);
  border-color: #f59e0b;
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.18);
}
.trophy-card-icon {
  width: 72px; height: 72px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: linear-gradient(135deg, #fde68a 0%, #f59e0b 100%);
  box-shadow: inset 0 0 0 4px #fff, 0 2px 6px rgba(245, 158, 11, 0.35);
  overflow: hidden;
}
.trophy-card-icon img { width: 48px; height: 48px; object-fit: contain; }
.trophy-emoji { font-size: 34px; line-height: 1; }
.trophy-card-label {
  font-weight: 600; color: #111827;
  font-size: 0.95rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.trophy-card-meta { font-size: 0.78rem; color: #6b7280; margin-top: 4px; }
.trophy-card-count { font-weight: 600; color: #374151; }

.trophy-modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.52);
  display: flex; align-items: center; justify-content: center;
  z-index: 950;
  padding: 20px;
}
.trophy-modal {
  background: #fff;
  border-radius: 14px;
  max-width: 480px; width: 100%;
  max-height: 80vh; overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  position: relative;
  padding: 20px 24px 24px;
}
.trophy-modal-close {
  position: absolute; top: 10px; right: 14px;
  background: transparent; border: none; font-size: 26px; cursor: pointer; color: #6b7280;
}
.trophy-modal-head {
  display: flex; gap: 14px; align-items: center; margin-bottom: 16px;
}
.trophy-modal-icon {
  width: 72px; height: 72px; flex-shrink: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #fde68a 0%, #f59e0b 100%);
  display: flex; align-items: center; justify-content: center;
  box-shadow: inset 0 0 0 4px #fff, 0 2px 6px rgba(245, 158, 11, 0.35);
}
.trophy-modal-icon img { width: 48px; height: 48px; object-fit: contain; }
.trophy-modal-head h3 { margin: 0 0 4px 0; font-size: 1.15rem; }
.trophy-modal-head p { margin: 0; font-size: 0.85rem; }

.trophy-grant-list {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 8px;
}
.trophy-grant {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #f3f4f6;
}
.trophy-grant-main { min-width: 0; }
.trophy-grant-season { font-weight: 600; color: #111827; font-size: 0.92rem; }
.trophy-grant-club { font-size: 0.78rem; }
.trophy-grant-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.trophy-grant-value { font-weight: 600; color: #b45309; font-size: 0.92rem; }
.trophy-grant-date { font-size: 0.75rem; }

.trophy-modal-enter-active, .trophy-modal-leave-active {
  transition: opacity 0.16s ease;
}
.trophy-modal-enter-from, .trophy-modal-leave-to { opacity: 0; }
</style>
