<template>
  <div class="page">
    <div class="header">
      <div>
        <h2 style="margin: 0;">Support tickets</h2>
        <div class="muted">Queue (school staff requests)</div>
      </div>
      <div class="actions">
        <label class="field">
          Search (optional)
          <input v-model="searchInput" class="input" type="text" placeholder="Subject, question, or school…" />
        </label>
        <label class="field">
          School ID (optional)
          <input v-model="schoolIdInput" class="input" type="number" placeholder="e.g., 123" />
        </label>
        <label class="field">
          Status
          <select v-model="status" class="input">
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="answered">Answered</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label class="field">
          View
          <select v-model="viewMode" class="input">
            <option value="all">All tickets</option>
            <option value="mine">My claimed tickets</option>
          </select>
        </label>
        <button class="btn btn-primary" type="button" @click="load" :disabled="loading">
          {{ loading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="tickets.length === 0" class="muted">No tickets found.</div>

    <div v-else class="list">
      <div v-for="t in tickets" :key="t.id" class="ticket">
        <div class="ticket-top">
          <div class="left">
            <div class="subject">
              <strong>{{ t.subject || 'Support ticket' }}</strong>
              <span class="pill">{{ formatStatus(t.status) }}</span>
              <span v-if="t.claimed_by_user_id" class="pill claimed">
                Claimed: {{ formatClaimedBy(t) }}
              </span>
            </div>
            <div class="meta">
              <span v-if="t.school_name">{{ t.school_name }}</span>
              <span v-else>School ID {{ t.school_organization_id }}</span>
              <span>•</span>
              <span>{{ formatDateTime(t.created_at) }}</span>
            </div>
          </div>
          <div class="right">
            <button
              v-if="!t.claimed_by_user_id"
              class="btn btn-secondary btn-sm"
              type="button"
              @click="claimTicket(t)"
              :disabled="claimingId === t.id"
              title="Claim this ticket so it’s assigned to you"
            >
              {{ claimingId === t.id ? 'Claiming…' : 'Claim' }}
            </button>
            <button
              v-else-if="Number(t.claimed_by_user_id) === Number(myUserId)"
              class="btn btn-secondary btn-sm"
              type="button"
              @click="unclaimTicket(t)"
              :disabled="unclaimingId === t.id"
              title="Return this ticket to the unclaimed queue"
            >
              {{ unclaimingId === t.id ? 'Unclaiming…' : 'Unclaim' }}
            </button>
            <button
              v-else-if="Number(t.claimed_by_user_id) !== Number(myUserId)"
              class="btn btn-secondary btn-sm"
              type="button"
              disabled
              title="This ticket is already claimed"
            >
              Claimed
            </button>
            <button class="btn btn-secondary btn-sm" type="button" @click="toggleAnswer(t.id)">
              {{ openAnswerId === t.id ? 'Close' : 'Answer' }}
            </button>
          </div>
        </div>

        <div class="qa">
          <div class="q">
            <div class="label">Question</div>
            <div class="text">{{ t.question }}</div>
          </div>
          <div v-if="t.answer" class="a">
            <div class="label">Answer</div>
            <div class="text">{{ t.answer }}</div>
          </div>
        </div>

        <div v-if="openAnswerId === t.id" class="answer-box">
          <div v-if="t.claimed_by_user_id && Number(t.claimed_by_user_id) !== Number(myUserId)" class="error">
            This ticket is claimed by {{ formatClaimedBy(t) }}. You can still view it, but you can’t answer unless you are the claimant.
          </div>
          <label class="field" style="width: 100%;">
            Answer
            <textarea v-model="answerText" class="textarea" rows="4" placeholder="Type your response…" />
          </label>
          <div class="answer-actions">
            <label class="field">
              Set status
              <select v-model="answerStatus" class="input">
                <option value="answered">Answered</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <button class="btn btn-primary" type="button" @click="submitAnswer(t)" :disabled="submitting || !answerText.trim()">
              {{ submitting ? 'Sending…' : 'Submit' }}
            </button>
          </div>
          <div v-if="answerError" class="error">{{ answerError }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const myUserId = authStore.user?.id || null;

const tickets = ref([]);
const loading = ref(false);
const error = ref('');

const schoolIdInput = ref('');
const status = ref('');
const viewMode = ref('all');
const searchInput = ref('');

const openAnswerId = ref(null);
const answerText = ref('');
const answerStatus = ref('answered');
const submitting = ref(false);
const answerError = ref('');
const claimingId = ref(null);
const unclaimingId = ref(null);

const syncFromQuery = () => {
  const qSchool = route.query?.schoolOrganizationId;
  if (qSchool !== undefined && qSchool !== null && String(qSchool).trim() !== '') {
    const n = Number(qSchool);
    if (Number.isFinite(n) && n > 0) schoolIdInput.value = String(n);
  }
  const qStatus = String(route.query?.status || '').trim().toLowerCase();
  if (qStatus === 'open' || qStatus === 'answered' || qStatus === 'closed') status.value = qStatus;
  const qMine = String(route.query?.mine || '').trim().toLowerCase();
  viewMode.value = qMine === 'true' || qMine === '1' ? 'mine' : 'all';
  const qSearch = route.query?.q;
  if (qSearch !== undefined && qSearch !== null && String(qSearch).trim() !== '') {
    searchInput.value = String(qSearch).slice(0, 120);
  }

  const qTicketId = route.query?.ticketId;
  if (qTicketId !== undefined && qTicketId !== null && String(qTicketId).trim() !== '') {
    const n = Number(qTicketId);
    if (Number.isFinite(n) && n > 0) openAnswerId.value = n;
  }
};

const pushQuery = () => {
  const q = { ...route.query };
  const sid = Number(schoolIdInput.value);
  if (Number.isFinite(sid) && sid > 0) q.schoolOrganizationId = String(sid);
  else delete q.schoolOrganizationId;
  if (status.value) q.status = status.value;
  else delete q.status;
  if (viewMode.value === 'mine') q.mine = 'true';
  else delete q.mine;
  if (searchInput.value && searchInput.value.trim()) q.q = searchInput.value.trim().slice(0, 120);
  else delete q.q;
  // Keep ticketId only when we have an open answer box (so deep links are stable).
  if (openAnswerId.value) q.ticketId = String(openAnswerId.value);
  else delete q.ticketId;
  router.replace({ query: q });
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    pushQuery();

    const params = {};
    const sid = Number(schoolIdInput.value);
    if (Number.isFinite(sid) && sid > 0) params.schoolOrganizationId = sid;
    if (status.value) params.status = status.value;
    if (viewMode.value === 'mine') params.mine = true;
    if (searchInput.value && searchInput.value.trim()) params.q = searchInput.value.trim().slice(0, 120);

    const r = await api.get('/support-tickets', { params });
    tickets.value = Array.isArray(r.data) ? r.data : [];

    // If a ticketId was supplied in the URL but isn't in the current list, clear it.
    if (openAnswerId.value && !(tickets.value || []).some((t) => Number(t?.id) === Number(openAnswerId.value))) {
      openAnswerId.value = null;
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load support tickets';
    tickets.value = [];
  } finally {
    loading.value = false;
  }
};

const toggleAnswer = (ticketId) => {
  if (openAnswerId.value === ticketId) {
    openAnswerId.value = null;
    answerText.value = '';
    answerStatus.value = 'answered';
    answerError.value = '';
    return;
  }
  openAnswerId.value = ticketId;
  answerText.value = '';
  answerStatus.value = 'answered';
  answerError.value = '';
};

const formatClaimedBy = (t) => {
  const fn = String(t?.claimed_by_first_name || '').trim();
  const ln = String(t?.claimed_by_last_name || '').trim();
  const name = [fn, ln].filter(Boolean).join(' ').trim();
  if (name) return name;
  return `User #${t.claimed_by_user_id}`;
};

const claimTicket = async (t) => {
  try {
    if (!t?.id) return;
    claimingId.value = t.id;
    await api.post(`/support-tickets/${t.id}/claim`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to claim ticket';
  } finally {
    claimingId.value = null;
  }
};

const unclaimTicket = async (t) => {
  try {
    if (!t?.id) return;
    unclaimingId.value = t.id;
    await api.post(`/support-tickets/${t.id}/unclaim`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to unclaim ticket';
  } finally {
    unclaimingId.value = null;
  }
};

const submitAnswer = async (t) => {
  try {
    submitting.value = true;
    answerError.value = '';
    // Prevent answering if someone else owns it
    if (t?.claimed_by_user_id && Number(t.claimed_by_user_id) !== Number(myUserId)) {
      answerError.value = `Ticket is claimed by ${formatClaimedBy(t)}.`;
      return;
    }
    await api.post(`/support-tickets/${t.id}/answer`, {
      answer: answerText.value.trim(),
      status: answerStatus.value
    });
    openAnswerId.value = null;
    answerText.value = '';
    await load();
  } catch (e) {
    answerError.value = e.response?.data?.error?.message || 'Failed to submit answer';
  } finally {
    submitting.value = false;
  }
};

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '');
const formatStatus = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'answered') return 'Answered';
  if (v === 'closed') return 'Closed';
  return 'Open';
};

onMounted(async () => {
  syncFromQuery();
  await load();
});
</script>

<style scoped>
.page {
  padding: 22px;
}
.header {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.muted {
  color: var(--text-secondary);
}
.actions {
  display: flex;
  gap: 10px;
  align-items: end;
  flex-wrap: wrap;
}
.field {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  display: block;
}
.input, .textarea {
  width: 100%;
  min-width: 180px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
  margin-top: 6px;
}
.textarea {
  min-width: 0;
}
.error {
  color: #b32727;
  margin: 10px 0;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ticket {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 12px;
}
.ticket-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: start;
}
.subject {
  display: flex;
  gap: 8px;
  align-items: center;
}
.pill {
  font-size: 12px;
  color: var(--text-secondary);
}
.pill.claimed {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  background: var(--bg-alt);
}
.meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.qa {
  margin-top: 10px;
}
.label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.text {
  white-space: pre-wrap;
}
.answer-box {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.answer-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: end;
  flex-wrap: wrap;
  margin-top: 10px;
}
</style>

