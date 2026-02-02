<template>
  <div class="container approvals-view">
    <div class="header">
      <div>
        <h2>Office booking approvals</h2>
        <p class="subtitle">Approve or deny pending office booking requests (including recurrence).</p>
      </div>
      <button class="btn btn-secondary" @click="load" :disabled="loading">Refresh</button>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-else-if="loading" class="loading">Loading…</div>

    <div v-else class="card">
      <div v-if="requests.length === 0" class="empty">No pending requests.</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>Location</th>
            <th>Room</th>
            <th>Provider</th>
            <th>Window</th>
            <th>Frequency</th>
            <th>Notes</th>
            <th class="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in requests" :key="r.id">
            <td>{{ r.office_location_name }}</td>
            <td>{{ r.room_name || 'Any open room' }}</td>
            <td>
              <div class="user">
                <div class="name">{{ r.requester_first_name }} {{ r.requester_last_name }}</div>
                <div class="email">{{ r.requester_email }}</div>
              </div>
            </td>
            <td class="mono">
              {{ formatDateTime(r.start_at) }} → {{ formatDateTime(r.end_at) }}
            </td>
            <td class="mono">{{ String(r.recurrence || 'ONCE') }}</td>
            <td class="notes">{{ r.requester_notes || '—' }}</td>
            <td class="actions-col">
              <button class="btn btn-primary btn-sm" @click="approve(r)" :disabled="actingId === r.id">Approve</button>
              <button class="btn btn-danger btn-sm" @click="deny(r)" :disabled="actingId === r.id">Deny</button>
            </td>
          </tr>
        </tbody>
      </table>
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
const requests = ref([]);
const actingId = ref(null);

const formatDateTime = (d) => {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/office-schedule/booking-requests/pending');
    requests.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load requests';
  } finally {
    loading.value = false;
  }
};

const approve = async (r) => {
  try {
    actingId.value = r.id;
    await api.post(`/office-schedule/booking-requests/${r.id}/approve`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to approve request';
  } finally {
    actingId.value = null;
  }
};

const deny = async (r) => {
  try {
    actingId.value = r.id;
    await api.post(`/office-schedule/booking-requests/${r.id}/deny`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to deny request';
  } finally {
    actingId.value = null;
  }
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
.table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  padding: 10px 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
  text-align: left;
}
th { color: var(--text-secondary); font-size: 13px; }
.actions-col { width: 190px; }
.btn-sm { padding: 8px 10px; font-size: 13px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
.notes { max-width: 320px; }
.user .name { font-weight: 600; }
.user .email { color: var(--text-secondary); font-size: 12px; }
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

