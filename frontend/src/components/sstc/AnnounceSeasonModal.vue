<template>
  <div class="announce-overlay" role="dialog" aria-modal="true" @click.self="$emit('close')">
    <div class="announce-card">
      <header class="announce-head">
        <div class="announce-eyebrow">Announce season · {{ clubName }}</div>
        <h2>{{ seasonName || 'New season' }}</h2>
        <p class="announce-sub">
          Send an in-app splash to all club members. They'll get options to join, sit out, or be reminded when it starts.
        </p>
      </header>

      <div v-if="error" class="announce-error">{{ error }}</div>

      <div v-if="participation" class="announce-summary">
        <div class="announce-summary-pills">
          <span class="announce-pill pill-joined">{{ participation.counts.joined }} joined</span>
          <span class="announce-pill pill-sitting_out">{{ participation.counts.sitting_out }} sitting out</span>
          <span class="announce-pill pill-remind_me">{{ participation.counts.remind_me }} remind</span>
          <span class="announce-pill pill-none">{{ participation.counts.no_response }} not responded</span>
        </div>
        <div class="announce-summary-meta">{{ participation.totalMembers }} club members</div>
      </div>

      <label class="announce-field">
        <span>Headline</span>
        <input
          v-model.trim="form.headline"
          type="text"
          maxlength="180"
          placeholder="e.g. Spring Distance Challenge starts April 28!"
        />
      </label>

      <label class="announce-field">
        <span>Message (optional)</span>
        <textarea
          v-model="form.body"
          rows="5"
          placeholder="Add details — kickoff date, prizes, anything that helps members decide."
        ></textarea>
      </label>

      <label class="announce-field announce-field-row">
        <span>Audience</span>
        <select v-model="form.audience">
          <option value="all_members">All club members</option>
          <option value="team_captains_only">Team captains only</option>
        </select>
      </label>

      <label class="announce-field announce-field-row">
        <span>Auto-expire (optional)</span>
        <input v-model="form.expiresAt" type="date" />
      </label>

      <footer class="announce-foot">
        <button type="button" class="btn btn-secondary" :disabled="busy" @click="$emit('close')">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="busy || !canSubmit" @click="submit">
          {{ busy ? 'Broadcasting…' : 'Send announcement' }}
        </button>
      </footer>

      <details v-if="prior.length" class="announce-history">
        <summary>Past announcements ({{ prior.length }})</summary>
        <ul>
          <li v-for="a in prior" :key="a.id">
            <strong>{{ a.headline }}</strong>
            <small>· {{ formatDate(a.deliveredAt) }} · {{ a.acks.total }} responses
              ({{ a.acks.joined }} joined, {{ a.acks.sitting_out }} sit out, {{ a.acks.remind_me }} remind)</small>
            <button
              v-if="a.isActive"
              type="button"
              class="announce-cancel-link"
              :disabled="cancellingId === a.id"
              @click="cancel(a)"
            >{{ cancellingId === a.id ? 'Cancelling…' : 'Cancel' }}</button>
            <span v-else class="announce-cancelled-tag">cancelled</span>
          </li>
        </ul>
      </details>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  clubId: { type: [Number, String], required: true },
  classId: { type: [Number, String], required: true },
  seasonName: { type: String, default: '' },
  clubName: { type: String, default: '' }
});
const emit = defineEmits(['close', 'sent']);

const form = reactive({
  headline: '',
  body: '',
  audience: 'all_members',
  expiresAt: ''
});
const busy = ref(false);
const cancellingId = ref(null);
const error = ref('');
const prior = ref([]);
const participation = ref(null);

const canSubmit = computed(() => form.headline.length > 0);

function formatDate(s) {
  try {
    return new Date(s).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  } catch { return s; }
}

async function loadHistory() {
  try {
    const res = await api.get(
      `/summit-stats/clubs/${props.clubId}/seasons/${props.classId}/announcements`
    );
    prior.value = Array.isArray(res.data?.announcements) ? res.data.announcements : [];
  } catch (_) { prior.value = []; }
}

async function loadParticipation() {
  try {
    const res = await api.get(
      `/summit-stats/clubs/${props.clubId}/seasons/${props.classId}/participation-summary`
    );
    participation.value = res.data;
  } catch (_) { participation.value = null; }
}

async function submit() {
  if (!canSubmit.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.post(
      `/summit-stats/clubs/${props.clubId}/seasons/${props.classId}/announcements`,
      {
        headline: form.headline,
        body: form.body || null,
        audience: form.audience,
        expiresAt: form.expiresAt || null
      }
    );
    emit('sent');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to send announcement';
  } finally {
    busy.value = false;
  }
}

async function cancel(a) {
  cancellingId.value = a.id;
  try {
    await api.delete(
      `/summit-stats/clubs/${props.clubId}/seasons/${props.classId}/announcements/${a.id}`
    );
    a.isActive = false;
  } catch (_) { /* swallow */ }
  finally { cancellingId.value = null; }
}

onMounted(() => {
  loadHistory();
  loadParticipation();
});
</script>

<style scoped>
.announce-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 12px;
  overflow-y: auto;
}
.announce-card {
  background: white;
  width: 100%;
  max-width: 560px;
  border-radius: 16px;
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.35);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.announce-head h2 { margin: 0; font-size: 22px; color: #0f172a; }
.announce-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent-color, #4f46e5);
}
.announce-sub { color: #64748b; font-size: 13px; margin: 4px 0 0; }
.announce-error {
  background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;
  border-radius: 8px; padding: 8px 10px; font-size: 13px;
}
.announce-summary {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.announce-summary-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.announce-summary-meta { font-size: 12px; color: #64748b; }
.announce-pill {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.pill-joined { background: #ecfdf5; color: #065f46; }
.pill-sitting_out { background: #f1f5f9; color: #475569; }
.pill-remind_me { background: #fef3c7; color: #92400e; }
.pill-none { background: white; border: 1px solid #e2e8f0; color: #64748b; }

.announce-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.announce-field > span { color: #475569; font-weight: 600; }
.announce-field input,
.announce-field textarea,
.announce-field select {
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
}
.announce-field-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.announce-field-row > span { white-space: nowrap; }
.announce-field-row input,
.announce-field-row select { flex: 1; }

.announce-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.announce-history {
  border-top: 1px solid #f1f5f9;
  padding-top: 8px;
  font-size: 12px;
  color: #475569;
}
.announce-history summary { cursor: pointer; font-weight: 600; }
.announce-history ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.announce-history li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
  border-bottom: 1px dashed #e2e8f0;
}
.announce-history li small { color: #64748b; }
.announce-cancel-link {
  align-self: flex-start;
  background: none;
  border: 0;
  padding: 0;
  font-size: 11px;
  color: #b91c1c;
  cursor: pointer;
  text-decoration: underline;
}
.announce-cancelled-tag {
  align-self: flex-start;
  font-size: 10px;
  color: #94a3b8;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
