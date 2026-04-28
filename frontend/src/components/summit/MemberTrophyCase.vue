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

    <div v-if="errorMessage" class="trophy-empty trophy-empty--error">{{ errorMessage }}</div>

    <TrophyCaseShelf
      :trophies="shelfSlots"
      :loading="loading"
      empty-text="No awards yet. Keep training — recognition winners are posted when each week closes."
    />
  </section>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';
import TrophyCaseShelf from './TrophyCaseShelf.vue';

const props = defineProps({
  clubId: { type: [Number, String], default: null },
  autoLoad: { type: Boolean, default: true }
});

const loading = ref(false);
const errorMessage = ref('');
const awards = ref([]);
const rawCompletedChallenges = ref([]);
const totals = ref({ lifetimeCount: 0, distinctLabels: 0, challengeCount: 0 });

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
  if (!icon) return null;
  const str = String(icon).trim();
  if (!str) return null;
  if (isLikelyUrl(str)) return toUploadsUrl(str) || str;
  if (str.startsWith('icon:')) {
    const id = parseInt(str.replace('icon:', ''), 10);
    if (!id) return null;
    if (iconCache.value[id]) return iconCache.value[id];
    api.get(`/icons/${id}`).then(({ data }) => {
      if (data?.url) iconCache.value[id] = toUploadsUrl(data.url) || data.url;
    }).catch(() => {});
    return iconCache.value[id] || null;
  }
  return null;
};

const resolveIconText = (icon) => {
  if (!icon) return null;
  const str = String(icon).trim();
  if (!str || isLikelyUrl(str) || /^\d+$/.test(str) || str.startsWith('icon:')) return null;
  return str;
};

const fmtDate = (d) => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return String(d).slice(0, 10); }
};

const fmtVal = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const shelfSlots = computed(() => {
  const slots = [];
  for (const a of (awards.value || [])) {
    const grants = Array.isArray(a.grants) ? a.grants : [];
    slots.push({
      key: `award-${a.label}__${a.icon || ''}`,
      type: 'award',
      label: a.label,
      count: a.count || grants.length,
      iconUrl: resolveIconUrl(a.icon),
      iconText: resolveIconText(a.icon),
      details: grants.map(g => ({
        title: g.seasonName || 'Season',
        subtitle: g.clubName || '',
        value: g.metricValue != null ? fmtVal(g.metricValue) : null,
        date: fmtDate(g.grantedAt)
      }))
    });
  }
  for (const ch of (rawCompletedChallenges.value || [])) {
    slots.push({
      key: `ch-${ch.label}`,
      type: 'challenge',
      label: ch.label,
      count: ch.count || 1,
      iconUrl: resolveIconUrl(ch.icon),
      iconText: resolveIconText(ch.icon),
      details: (ch.completions || []).map(c => ({
        title: c.seasonName || 'Season',
        subtitle: c.clubName || '',
        value: c.distanceMiles != null ? `${Number(c.distanceMiles).toFixed(2)} mi` : null,
        date: fmtDate(c.completedAt)
      }))
    });
  }
  return slots;
});

defineExpose({ reload: load });
</script>

<style scoped>
.dash-section--trophy-case {
  background: linear-gradient(180deg, #1a1510 0%, #0f0c07 100%);
  border: 1px solid rgba(212,168,67,0.2);
}

.trophy-head {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.trophy-head h2 { margin: 0 0 4px 0; font-size: 1.1rem; color: #f5e7b0; }
.trophy-head p.muted { margin: 0; font-size: 0.85rem; color: rgba(255,255,255,0.45); }
.trophy-head-totals { display: flex; gap: 6px; align-items: center; font-size: 0.9rem; color: rgba(255,255,255,0.6); }
.trophy-total strong { color: #d4a843; }
.trophy-dot { color: rgba(255,255,255,0.2); }
.trophy-empty { text-align: center; color: rgba(255,255,255,0.35); padding: 24px 0; font-size: 0.9rem; }
.trophy-empty--error { color: #f87171; }
</style>
