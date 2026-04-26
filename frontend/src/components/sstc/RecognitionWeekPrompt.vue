<template>
  <div v-if="pendingWeeks.length && hasConfig" class="rwp-wrap">
    <div v-for="week in pendingWeeks" :key="week.weekNumber" class="rwp-card">
      <div class="rwp-icon">🏅</div>
      <div class="rwp-body">
        <div class="rwp-title">Week {{ week.weekNumber }} trophies are ready to post</div>
        <div class="rwp-sub">
          All submitted workouts for
          <strong>{{ formatWeekDate(week.weekStartDate) }}</strong> will be counted.
          Post when you're satisfied all workouts are in.
        </div>
      </div>
      <div class="rwp-actions">
        <button
          class="rwp-btn rwp-btn--primary"
          :disabled="posting === week.weekNumber"
          @click="postTrophies(week)"
        >
          <span v-if="posting === week.weekNumber">Posting…</span>
          <span v-else>Post Trophies</span>
        </button>
        <button
          class="rwp-btn rwp-btn--ghost"
          :disabled="posting === week.weekNumber"
          @click="snooze(week)"
        >
          Dismiss for now
        </button>
      </div>
    </div>
    <div v-if="successMessage" class="rwp-success">{{ successMessage }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  seasonId: { type: [Number, String], required: true }
});

const emit = defineEmits(['posted']);

const pendingWeeks = ref([]);
const hasConfig = ref(false);
const posting = ref(null);
const successMessage = ref('');

const formatWeekDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const load = async () => {
  try {
    const { data } = await api.get(`/summit-stats/seasons/${props.seasonId}/recognition/manager-pending`);
    pendingWeeks.value = data.pendingWeeks || [];
    hasConfig.value = data.hasRecognitionConfig || false;
  } catch { /* manager may not have perms — silently ignore */ }
};

const snooze = async (week) => {
  try {
    await api.post(`/summit-stats/seasons/${props.seasonId}/recognition/snooze-week`, { weekNumber: week.weekNumber });
    pendingWeeks.value = pendingWeeks.value.filter(w => w.weekNumber !== week.weekNumber);
  } catch (e) {
    console.warn('snooze failed', e);
  }
};

const postTrophies = async (week) => {
  posting.value = week.weekNumber;
  try {
    const { data } = await api.post(`/summit-stats/seasons/${props.seasonId}/recognition/post-week`, {
      weekNumber: week.weekNumber
    });
    pendingWeeks.value = pendingWeeks.value.filter(w => w.weekNumber !== week.weekNumber);
    successMessage.value = `Week ${week.weekNumber} trophies posted! ${data.grantCount} award${data.grantCount !== 1 ? 's' : ''} granted.`;
    setTimeout(() => { successMessage.value = ''; }, 5000);
    emit('posted', { weekNumber: week.weekNumber });
  } catch (e) {
    console.warn('post trophies failed', e);
  } finally {
    posting.value = null;
  }
};

onMounted(load);
</script>

<style scoped>
.rwp-wrap { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }

.rwp-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border: 1.5px solid #fbbf24;
  border-radius: 14px;
  padding: 14px 16px;
}

.rwp-icon { font-size: 26px; flex-shrink: 0; margin-top: 2px; }

.rwp-body { flex: 1; min-width: 0; }
.rwp-title { font-weight: 700; font-size: 0.95rem; color: #92400e; margin-bottom: 3px; }
.rwp-sub { font-size: 0.83rem; color: #78350f; line-height: 1.4; }

.rwp-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }

.rwp-btn {
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  border: none;
  white-space: nowrap;
  transition: opacity 0.15s;
}
.rwp-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.rwp-btn--primary {
  background: #d97706;
  color: #fff;
}
.rwp-btn--primary:hover:not(:disabled) { background: #b45309; }

.rwp-btn--ghost {
  background: transparent;
  border: 1px solid #d97706;
  color: #92400e;
}
.rwp-btn--ghost:hover:not(:disabled) { background: #fde68a; }

.rwp-success {
  padding: 10px 14px;
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  border-radius: 10px;
  font-size: 0.87rem;
  font-weight: 600;
  color: #065f46;
}

@media (max-width: 540px) {
  .rwp-card { flex-direction: column; }
  .rwp-actions { flex-direction: row; }
}
</style>
