<template>
  <section class="challenge-draft-report">
    <h2>Captain Draft Report</h2>
    <p class="hint" v-if="previousSeason">
      Includes brief previous season attributes from: <strong>{{ previousSeason.className }}</strong>
    </p>
    <div v-if="loading" class="loading-inline">Loading draft report…</div>
    <div v-else class="report-list">
      <article v-for="p in participants" :key="`draft-participant-${p.providerUserId}`" class="report-card">
        <header>
          <strong>{{ p.firstName }} {{ p.lastName }}</strong>
          <span class="hint">{{ p.email }}</span>
        </header>
        <div class="previous-attrs">
          <template v-if="p.previousSeason">
            <span>{{ p.previousSeason.totalPoints }} pts</span>
            <span>{{ Number(p.previousSeason.totalMiles || 0).toFixed(1) }} mi</span>
            <span>{{ p.previousSeason.workoutCount }} workouts</span>
            <span v-if="p.previousSeason.teamName">Team: {{ p.previousSeason.teamName }}</span>
            <span v-if="p.previousSeason.wasEliminated" class="warn-pill">Previously eliminated</span>
          </template>
          <span v-else class="hint">No previous season stats</span>
        </div>
        <div class="note-row">
          <textarea
            v-model="drafts[p.providerUserId]"
            :readonly="!canEdit"
            rows="2"
            placeholder="Manager draft note (captains can view)"
          />
          <button
            v-if="canEdit"
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="savingByUser[p.providerUserId]"
            @click="saveNote(p.providerUserId)"
          >
            {{ savingByUser[p.providerUserId] ? 'Saving…' : 'Save Note' }}
          </button>
        </div>
      </article>
      <div v-if="!participants.length" class="empty-hint">No participating members found.</div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  challengeId: { type: [String, Number], required: true },
  canEdit: { type: Boolean, default: false }
});

const loading = ref(false);
const participants = ref([]);
const previousSeason = ref(null);
const drafts = ref({});
const savingByUser = ref({});

const load = async () => {
  if (!props.challengeId) return;
  loading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/draft-report`, { skipGlobalLoading: true });
    participants.value = Array.isArray(r.data?.participants) ? r.data.participants : [];
    previousSeason.value = r.data?.previousSeason || null;
    const map = {};
    for (const p of participants.value) {
      map[p.providerUserId] = p.draftNote || '';
    }
    drafts.value = map;
  } catch {
    participants.value = [];
    previousSeason.value = null;
    drafts.value = {};
  } finally {
    loading.value = false;
  }
};

const saveNote = async (providerUserId) => {
  if (!props.challengeId || !providerUserId || !props.canEdit) return;
  savingByUser.value = { ...savingByUser.value, [providerUserId]: true };
  try {
    await api.put(`/learning-program-classes/${props.challengeId}/draft-report/${providerUserId}/note`, {
      noteText: drafts.value[providerUserId] || ''
    });
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save draft note');
  } finally {
    savingByUser.value = { ...savingByUser.value, [providerUserId]: false };
  }
};

watch(() => props.challengeId, load, { immediate: true });
</script>

<style scoped>
.challenge-draft-report h2 { margin: 0 0 10px 0; font-size: 1.08rem; }
.report-list { display: flex; flex-direction: column; gap: 10px; }
.report-card { border: 1px solid #eee; border-radius: 8px; padding: 10px; background: #fafafa; }
.report-card header { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.previous-attrs { display: flex; gap: 8px; flex-wrap: wrap; font-size: 0.86rem; color: var(--text-muted, #666); margin-bottom: 8px; }
.previous-attrs span + span::before { content: '· '; margin-right: 6px; }
.note-row { display: grid; gap: 6px; }
.note-row textarea { width: 100%; min-height: 64px; border: 1px solid #ccc; border-radius: 6px; padding: 6px 8px; }
.warn-pill { border: 1px solid #ffcdd2; background: #ffebee; color: #b71c1c; border-radius: 999px; padding: 1px 8px; }
.empty-hint, .loading-inline { color: var(--text-muted, #666); padding: 10px 0; }
</style>
