<template>
  <section class="challenge-elimination-board">
    <h2>Elimination Board</h2>
    <div class="elimination-week-selector">
      <label>Week</label>
      <input v-model="weekStart" type="date" @change="load" />
      <button type="button" class="btn btn-secondary btn-sm" @click="weekStart = null">All</button>
    </div>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="elimination-list">
      <div v-for="e in eliminations" :key="e.id" class="elimination-row">
        <span class="name">{{ e.first_name }} {{ e.last_name }}</span>
        <span class="week">{{ formatWeek(e.week_start_date) }}</span>
        <span class="reason">{{ formatReason(e.reason) }}</span>
        <p v-if="e.admin_comment" class="admin-comment">{{ e.admin_comment }}</p>
      </div>
      <div v-if="!eliminations.length" class="empty-hint">No eliminations yet.</div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  challengeId: { type: [String, Number], required: true }
});

const weekStart = ref(null);
const loading = ref(false);
const eliminations = ref([]);

const formatWeek = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const formatReason = (r) => {
  const s = String(r || '').toLowerCase();
  if (s === 'points_failed') return 'Did not meet points';
  if (s === 'challenge_not_completed') return 'Challenge not completed';
  if (s === 'both') return 'Points + challenge';
  return r || '—';
};

const load = async () => {
  if (!props.challengeId) return;
  loading.value = true;
  try {
    const params = weekStart.value ? { week: weekStart.value } : {};
    const r = await api.get(`/learning-program-classes/${props.challengeId}/elimination-board`, {
      params,
      skipGlobalLoading: true
    });
    eliminations.value = Array.isArray(r.data?.eliminations) ? r.data.eliminations : [];
  } catch {
    eliminations.value = [];
  } finally {
    loading.value = false;
  }
};

watch(() => props.challengeId, load, { immediate: true });
watch(weekStart, load);

defineExpose({ load });
</script>

<style scoped>
.challenge-elimination-board h2 { margin: 0 0 12px 0; font-size: 1.1em; }
.elimination-week-selector { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.elimination-week-selector input { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; }
.elimination-list { display: flex; flex-direction: column; gap: 8px; }
.elimination-row { padding: 12px; border: 1px solid #eee; border-radius: 6px; }
.elimination-row .name { font-weight: 600; }
.elimination-row .week, .elimination-row .reason { font-size: 0.9em; color: var(--text-muted, #666); margin-left: 8px; }
.admin-comment { margin: 8px 0 0 0; font-size: 0.9em; font-style: italic; color: #555; }
.empty-hint, .loading-inline { padding: 12px; color: var(--text-muted, #666); }
</style>
