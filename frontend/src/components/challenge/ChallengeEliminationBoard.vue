<template>
  <section class="challenge-elimination-board">
    <h2>Season Casualties</h2>
    <div v-if="isManager" class="manual-elimination-card">
      <h3>Manual Elimination</h3>
      <div class="manual-row">
        <select v-model="manual.providerUserId">
          <option :value="null">Select participant…</option>
          <option v-for="p in participants" :key="p.provider_user_id" :value="p.provider_user_id">
            {{ participantName(p) }}
          </option>
        </select>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="manualSubmitting || !manual.providerUserId" @click="submitManualElimination">
          {{ manualSubmitting ? 'Eliminating…' : 'Eliminate Participant' }}
        </button>
      </div>
      <textarea
        v-model="manual.publicMessage"
        rows="2"
        placeholder="Public message (shown in Season Casualties) e.g., Alex was eliminated for not completing the assignment this week."
      />
      <input
        v-model="manual.adminComment"
        type="text"
        placeholder="Internal manager note (optional)"
      />
    </div>
    <div class="elimination-week-selector">
      <label>Week</label>
      <select v-model="selectedWeekIdx" class="week-select">
        <option :value="-1">All weeks</option>
        <option v-for="(w, i) in seasonWeeks" :key="w.date" :value="i">{{ w.label }}</option>
      </select>
    </div>
    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="elimination-list">
      <div v-for="e in eliminations" :key="e.id" class="elimination-row">
        <span class="name">{{ e.first_name }} {{ e.last_name }}</span>
        <span class="week">{{ formatWeek(e.week_start_date) }}</span>
        <span class="reason">{{ formatReason(e.reason) }}</span>
        <span v-if="e.team_name" class="reason">Booted from {{ e.team_name }}</span>
        <span v-if="String(e.elimination_mode || '').toLowerCase() === 'manual'" class="reason">Manual</span>
        <p v-if="e.public_message" class="public-message">{{ e.public_message }}</p>
        <p v-if="e.admin_comment" class="admin-comment">{{ e.admin_comment }}</p>
      </div>
      <div v-if="!eliminations.length" class="empty-hint">No eliminations yet.</div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch, computed, onMounted } from 'vue';
import api from '../../services/api';
import { useSeasonWeeks } from '../../composables/useSeasonWeeks.js';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  isManager: { type: Boolean, default: false },
  seasonStartsAt: { type: [String, Date], default: null }
});

const { seasonWeeks, selectedWeekIdx, weekStartDate } = useSeasonWeeks(
  computed(() => props.seasonStartsAt),
  { defaultToLatest: false }
);
// -1 means "All weeks"
const weekStart = computed(() => selectedWeekIdx.value === -1 ? null : weekStartDate.value);
const loading = ref(false);
const eliminations = ref([]);
const participants = ref([]);
const manualSubmitting = ref(false);
const manual = ref({
  providerUserId: null,
  publicMessage: '',
  adminComment: ''
});

const formatWeek = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const formatReason = (r) => {
  const s = String(r || '').toLowerCase();
  if (s === 'points_failed') return 'Did not meet points';
  if (s === 'challenge_not_completed') return 'Challenge not completed';
  if (s === 'both') return 'Points + challenge';
  if (s === 'manual_boot') return 'Manager boot';
  return r || '—';
};
const participantName = (p) => `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || `User ${p.provider_user_id}`;

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

const loadParticipants = async () => {
  if (!props.challengeId || !props.isManager) return;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}`, { skipGlobalLoading: true });
    const raw = Array.isArray(r.data?.providerMembers) ? r.data.providerMembers : [];
    participants.value = raw.filter((p) => ['active', 'completed'].includes(String(p.membership_status || '').toLowerCase()));
  } catch {
    participants.value = [];
  }
};

const submitManualElimination = async () => {
  if (!props.challengeId || !manual.value.providerUserId) return;
  manualSubmitting.value = true;
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/eliminations/manual`, {
      providerUserId: manual.value.providerUserId,
      publicMessage: manual.value.publicMessage || null,
      adminComment: manual.value.adminComment || null,
      weekStart: weekStart.value || null
    });
    manual.value = { providerUserId: null, publicMessage: '', adminComment: '' };
    await Promise.all([load(), loadParticipants()]);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to eliminate participant');
  } finally {
    manualSubmitting.value = false;
  }
};

watch(() => props.challengeId, load, { immediate: true });
watch(weekStart, load);
watch(selectedWeekIdx, load);
watch(() => props.challengeId, loadParticipants, { immediate: true });
onMounted(loadParticipants);

defineExpose({ load });
</script>

<style scoped>
.challenge-elimination-board h2 { margin: 0 0 12px 0; font-size: 1.1em; }
.manual-elimination-card {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 12px;
  background: #fff8f8;
}
.manual-elimination-card h3 {
  margin: 0 0 8px 0;
  font-size: 0.95rem;
}
.manual-row { display: flex; gap: 8px; margin-bottom: 8px; }
.manual-row select { flex: 1; min-width: 0; }
.manual-elimination-card textarea,
.manual-elimination-card input,
.manual-row select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 6px;
}
.elimination-week-selector { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.week-select { border: 1px solid #e2e8f0; border-radius: 8px; padding: 5px 10px; font-size: 0.88em; background: #fff; cursor: pointer; }
.elimination-list { display: flex; flex-direction: column; gap: 8px; }
.elimination-row { padding: 12px; border: 1px solid #eee; border-radius: 6px; }
.elimination-row .name { font-weight: 600; }
.elimination-row .week, .elimination-row .reason { font-size: 0.9em; color: var(--text-muted, #666); margin-left: 8px; }
.public-message { margin: 8px 0 0 0; font-size: 0.95em; color: #7f1d1d; font-weight: 600; }
.admin-comment { margin: 8px 0 0 0; font-size: 0.9em; font-style: italic; color: #555; }
.empty-hint, .loading-inline { padding: 12px; color: var(--text-muted, #666); }
</style>
