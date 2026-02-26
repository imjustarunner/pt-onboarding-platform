<template>
  <div class="page">
    <div class="header">
      <div>
        <h2 style="margin: 0;">Ticketing</h2>
        <div class="muted">Safe mode queue</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary" type="button" @click="load" :disabled="loading">
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading" class="muted">Loading tickets...</div>
    <div v-else-if="tickets.length === 0" class="muted">No tickets found.</div>

    <div v-else class="list">
      <div v-for="t in tickets" :key="t.id" class="ticket">
        <div class="line">
          <strong>{{ t.subject || 'Support ticket' }}</strong>
          <span class="muted">#{{ t.id }}</span>
          <span class="pill">{{ formatStatus(t.status) }}</span>
        </div>
        <div class="muted small">
          {{ t.agency_name || '-' }} / {{ t.school_name || t.school_organization_id || '-' }}
          • {{ formatDateTime(t.created_at) }}
        </div>
        <div class="small" style="margin-top:6px;">Q: {{ t.question || '-' }}</div>
        <div v-if="t.answer" class="small muted" style="margin-top:4px;">A: {{ t.answer }}</div>

        <div class="actions">
          <button
            v-if="!t.claimed_by_user_id"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="claim(t)"
            :disabled="busyId === t.id"
          >
            {{ busyId === t.id ? 'Claiming...' : 'Claim' }}
          </button>
          <button
            v-else-if="Number(t.claimed_by_user_id) === Number(myUserId)"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="unclaim(t)"
            :disabled="busyId === t.id"
          >
            {{ busyId === t.id ? 'Unclaiming...' : 'Unclaim' }}
          </button>
          <button
            class="btn btn-secondary btn-sm"
            type="button"
            @click="closeTicket(t)"
            :disabled="busyId === t.id"
          >
            {{ busyId === t.id ? 'Closing...' : 'Close' }}
          </button>
        </div>

        <div v-if="canAnswer" style="margin-top:10px;">
          <textarea
            v-model="answerById[t.id]"
            class="input"
            rows="2"
            placeholder="Type answer..."
          />
          <div style="margin-top:8px; display:flex; gap:8px;">
            <button
              class="btn btn-primary btn-sm"
              type="button"
              @click="answer(t)"
              :disabled="busyId === t.id || !String(answerById[t.id] || '').trim()"
            >
              {{ busyId === t.id ? 'Sending...' : 'Submit Answer' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const authStore = useAuthStore();
const myUserId = authStore.user?.id || null;
const roleNorm = computed(() => String(authStore.user?.role || '').toLowerCase());
const canAnswer = computed(() =>
  ['admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant', 'provider_plus'].includes(roleNorm.value)
);

const tickets = ref([]);
const answerById = ref({});
const loading = ref(false);
const error = ref('');
const busyId = ref(null);

const formatDateTime = (d) => (d ? new Date(d).toLocaleString() : '');
const formatStatus = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'answered') return 'Answered';
  if (v === 'closed') return 'Closed';
  return 'Open';
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const r = await api.get('/support-tickets', { params: { limit: 200 } });
    tickets.value = Array.isArray(r.data) ? r.data : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load support tickets';
    tickets.value = [];
  } finally {
    loading.value = false;
  }
};

const claim = async (t) => {
  try {
    busyId.value = t.id;
    await api.post(`/support-tickets/${t.id}/claim`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to claim';
  } finally {
    busyId.value = null;
  }
};

const unclaim = async (t) => {
  try {
    busyId.value = t.id;
    await api.post(`/support-tickets/${t.id}/unclaim`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to unclaim';
  } finally {
    busyId.value = null;
  }
};

const closeTicket = async (t) => {
  try {
    busyId.value = t.id;
    await api.post(`/support-tickets/${t.id}/close`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to close';
  } finally {
    busyId.value = null;
  }
};

const answer = async (t) => {
  const text = String(answerById.value[t.id] || '').trim();
  if (!text) return;
  try {
    busyId.value = t.id;
    await api.post(`/support-tickets/${t.id}/answer`, { answer: text, status: 'answered' });
    answerById.value = { ...answerById.value, [t.id]: '' };
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to answer';
  } finally {
    busyId.value = null;
  }
};

onMounted(() => {
  setTimeout(() => {
    void load();
  }, 0);
});
</script>

<style scoped>
.page { padding: 22px; }
.header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.muted { color: var(--text-secondary); }
.error { color: #b32727; margin: 10px 0; }
.list { display: grid; gap: 10px; }
.ticket { border: 1px solid var(--border); border-radius: 12px; padding: 12px; background: #fff; }
.line { display: flex; gap: 8px; align-items: center; }
.small { font-size: 12px; }
.pill { border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 11px; }
.actions { margin-top: 8px; display: flex; gap: 8px; }
.input { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; }
</style>
