<template>
  <div class="container comms-feed">
    <div class="header">
      <div>
        <h2>All Recent Texts</h2>
        <p class="subtitle">Safety Net feed. Inbound and outbound messages across your agencies.</p>
      </div>
      <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else class="card">
      <div v-if="rows.length === 0" class="empty">No messages yet.</div>
      <div v-else class="list">
        <button v-for="m in rows" :key="m.id" class="row" @click="openThread(m)" :title="m.body">
          <div class="left">
            <div class="top">
              <span class="badge" :class="m.direction === 'INBOUND' ? 'in' : 'out'">{{ m.direction }}</span>
              <span class="client">
                Client: {{ m.client_initials || '—' }}
              </span>
              <span class="owner">
                Owner: {{ formatOwner(m) }}
              </span>
            </div>
            <div class="body">{{ m.body }}</div>
          </div>
          <div class="right">
            <div class="time">{{ formatTime(m.created_at) }}</div>
            <div class="numbers">{{ m.from_number }} → {{ m.to_number }}</div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useRouter } from 'vue-router';

const authStore = useAuthStore();
const router = useRouter();

const loading = ref(true);
const error = ref('');
const rows = ref([]);

const formatTime = (d) => {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
};

const formatOwner = (m) => {
  const li = (m.user_last_name || '').slice(0, 1);
  return `${m.user_first_name || ''} ${li ? li + '.' : ''}`.trim() || '—';
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/messages/recent', { params: { limit: 75 } });
    rows.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load messages';
  } finally {
    loading.value = false;
  }
};

const openThread = (m) => {
  if (!m.user_id || !m.client_id) return;
  router.push(`/admin/communications/thread/${m.user_id}/${m.client_id}`);
};

onMounted(async () => {
  if (!authStore.isAuthenticated) {
    router.push('/login');
    return;
  }
  await load();
});
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 14px;
}
.subtitle { color: var(--text-secondary); margin: 6px 0 0 0; }
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  border: 1px solid var(--border);
  background: white;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
}
.top {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: var(--text-secondary);
  font-size: 12px;
}
.badge {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 600;
}
.badge.in { background: rgba(253,176,34,0.15); }
.badge.out { background: rgba(23,178,106,0.15); }
.body {
  margin-top: 6px;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.right {
  min-width: 220px;
  text-align: right;
  color: var(--text-secondary);
  font-size: 12px;
}
.time { font-weight: 600; color: var(--text-primary); }
.numbers { margin-top: 6px; }
.empty { color: var(--text-secondary); padding: 18px 6px; }
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.loading { color: var(--text-secondary); }
</style>

