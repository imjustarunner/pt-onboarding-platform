<template>
  <div class="schedule">
    <div class="controls">
      <div class="field">
        <label>Provider</label>
        <select v-model="selectedProviderId" class="select">
          <option value="">Select…</option>
          <option v-for="p in providers" :key="p.provider_user_id" :value="String(p.provider_user_id)">
            {{ p.last_name }}, {{ p.first_name }}<span v-if="p.accepting_new_clients === false"> (Closed)</span>
          </option>
        </select>
      </div>

      <div class="field">
        <label>Day</label>
        <select v-model="selectedDay" class="select">
          <option v-for="d in days" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>

      <div class="meta">
        <div
          class="chip"
          v-if="selectedAssignment"
          :class="{ overbooked: Number(selectedAssignment.slots_available) < 0 }"
        >
          <strong>Slots:</strong> {{ selectedAssignment.slots_available }} / {{ selectedAssignment.slots_total }}
        </div>
        <div class="chip" v-if="selectedAssignment && (selectedAssignment.start_time || selectedAssignment.end_time)">
          <strong>Hours:</strong> {{ selectedAssignment.start_time || '—' }}–{{ selectedAssignment.end_time || '—' }}
        </div>
        <div class="chip" v-if="selectedProvider">
          <strong>Accepting:</strong> {{ selectedProvider.accepting_new_clients === false ? 'Closed' : 'Open' }}
        </div>
        <button class="btn btn-secondary btn-sm" @click="reloadAll" :disabled="loading">
          Refresh
        </button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="selectedAssignment && Number(selectedAssignment.slots_available) < 0" class="warn" style="margin-top: 10px;">
      <div class="warn-item">
        <strong>Over capacity</strong>: this provider is scheduled for more “current” clients than available slots. Add slots in Provider Scheduling.
      </div>
    </div>

    <div v-if="warnings.length" class="warn">
      <div v-for="(w, idx) in warnings" :key="idx" class="warn-item">
        <strong>{{ w.code }}</strong>: {{ w.message }}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>New schedule entry</h3>
      </div>
      <div class="row">
        <div class="field">
          <label>Client</label>
          <select v-model="newEntry.clientId" class="select">
            <option value="">Select…</option>
            <option v-for="c in assignedClients" :key="c.id" :value="String(c.id)">
              {{ c.initials }}
            </option>
          </select>
        </div>
        <div class="field">
          <label>Start</label>
          <input v-model="newEntry.startTime" type="time" class="input" />
        </div>
        <div class="field">
          <label>End</label>
          <input v-model="newEntry.endTime" type="time" class="input" />
        </div>
        <div class="field">
          <label>Room (optional)</label>
          <input v-model="newEntry.room" type="text" class="input" placeholder="Room Z" />
        </div>
        <div class="field">
          <label>Teacher (optional)</label>
          <input v-model="newEntry.teacher" type="text" class="input" placeholder="Ms. L" />
        </div>
        <div class="actions">
          <button class="btn btn-primary" @click="createEntry" :disabled="saving">
            {{ saving ? 'Saving…' : 'Add' }}
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Schedule entries</h3>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="entries.length === 0" class="empty">No entries yet.</div>
      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Start</th>
              <th>End</th>
              <th>Room</th>
              <th>Teacher</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in entries" :key="e.id">
              <td>{{ e.client_initials || clientInitialsFallback(e.client_id) }}</td>
              <td>{{ formatTime(e.start_time) }}</td>
              <td>{{ formatTime(e.end_time) }}</td>
              <td>{{ e.room || '—' }}</td>
              <td>{{ e.teacher || '—' }}</td>
              <td class="actions-cell">
                <button class="btn btn-secondary btn-sm" @click="openCommentForEntry(e)">
                  <span v-if="unreadForClientId(e.client_id) > 0" class="unread-dot" aria-hidden="true" />
                  Comment
                </button>
                <button class="btn btn-secondary btn-sm" @click="moveEntry(e, 'up')" :disabled="movingId === e.id || deletingId === e.id">
                  ↑
                </button>
                <button class="btn btn-secondary btn-sm" style="margin-left:6px;" @click="moveEntry(e, 'down')" :disabled="movingId === e.id || deletingId === e.id">
                  ↓
                </button>
                <button class="btn btn-danger btn-sm" @click="removeEntry(e)" :disabled="deletingId === e.id">
                  {{ deletingId === e.id ? 'Deleting…' : 'Delete' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <SchoolClientChatModal
      v-if="commentClient"
      :client="commentClient"
      :schoolOrganizationId="props.organizationId"
      @close="commentClient = null"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import SchoolClientChatModal from './SchoolClientChatModal.vue';

const props = defineProps({
  organizationId: { type: Number, required: true }
});

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const providers = ref([]);
const clients = ref([]); // All school clients (for admin/support/provider assignment UI)
const assignedClients = ref([]); // Assigned to selected provider/day (for schedule entry creation)
const entries = ref([]);

const selectedProviderId = ref('');
const selectedDay = ref('Monday');

const loading = ref(false);
const saving = ref(false);
const deletingId = ref(null);
const movingId = ref(null);
const error = ref('');
const warnings = ref([]);

const newEntry = ref({
  clientId: '',
  startTime: '',
  endTime: '',
  room: '',
  teacher: ''
});

const commentClient = ref(null);

const unreadForClientId = (clientId) => {
  const c = assignedClients.value.find((x) => parseInt(x.id, 10) === parseInt(clientId, 10));
  return Number(c?.unread_notes_count || 0);
};

const openCommentForEntry = (entry) => {
  const cid = parseInt(entry.client_id, 10);
  if (!cid) return;
  const c = assignedClients.value.find((x) => parseInt(x.id, 10) === cid) || clients.value.find((x) => parseInt(x.id, 10) === cid) || null;
  commentClient.value = c ? { id: cid, initials: c.initials } : { id: cid, initials: entry.client_initials || `Client ${cid}` };
};

const selectedProvider = computed(() => {
  const pid = parseInt(selectedProviderId.value, 10);
  return providers.value.find((p) => parseInt(p.provider_user_id, 10) === pid) || null;
});

const selectedAssignment = computed(() => {
  if (!selectedProvider.value) return null;
  return (selectedProvider.value.assignments || []).find((a) => a.day_of_week === selectedDay.value) || null;
});

const formatTime = (t) => {
  if (!t) return '—';
  // backend may return "HH:MM:SS"
  return String(t).slice(0, 5);
};

const clientInitialsFallback = (clientId) => {
  const c = clients.value.find((x) => x.id === clientId);
  return c?.initials || `Client ${clientId}`;
};

const reloadProviders = async () => {
  const resp = await api.get(`/school-portal/${props.organizationId}/providers/scheduling`);
  providers.value = resp.data || [];
};

const reloadClients = async () => {
  const resp = await api.get(`/school-portal/${props.organizationId}/clients`);
  clients.value = resp.data || [];
};

const reloadAssignedClients = async () => {
  if (!selectedProviderId.value) {
    assignedClients.value = [];
    return;
  }
  const resp = await api.get(
    `/school-portal/${props.organizationId}/providers/${selectedProviderId.value}/assigned-clients`,
    { params: { dayOfWeek: selectedDay.value } }
  );
  assignedClients.value = resp.data || [];
};

const reloadEntries = async () => {
  if (!selectedProviderId.value) {
    entries.value = [];
    return;
  }
  const resp = await api.get(
    `/school-portal/${props.organizationId}/providers/${selectedProviderId.value}/schedule-entries`,
    { params: { dayOfWeek: selectedDay.value } }
  );
  entries.value = resp.data || [];
};

const reloadAll = async () => {
  try {
    loading.value = true;
    error.value = '';
    warnings.value = [];
    await Promise.all([reloadProviders(), reloadClients()]);
    await reloadAssignedClients();
    await reloadEntries();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load provider schedule';
  } finally {
    loading.value = false;
  }
};

const createEntry = async () => {
  if (!selectedProviderId.value) {
    error.value = 'Select a provider first.';
    return;
  }
  if (!newEntry.value.clientId || !newEntry.value.startTime || !newEntry.value.endTime) {
    error.value = 'Client, start time, and end time are required.';
    return;
  }

  try {
    saving.value = true;
    error.value = '';
    warnings.value = [];

    const resp = await api.post(`/school-portal/${props.organizationId}/providers/${selectedProviderId.value}/schedule-entries`, {
      dayOfWeek: selectedDay.value,
      clientId: Number(newEntry.value.clientId),
      startTime: newEntry.value.startTime,
      endTime: newEntry.value.endTime,
      room: newEntry.value.room,
      teacher: newEntry.value.teacher
    });

    warnings.value = resp.data?.warnings || [];
    newEntry.value = { clientId: '', startTime: '', endTime: '', room: '', teacher: '' };

    await reloadProviders();
    await reloadAssignedClients();
    await reloadEntries();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create schedule entry';
  } finally {
    saving.value = false;
  }
};

const removeEntry = async (entry) => {
  if (!confirm('Delete this schedule entry?')) return;
  try {
    deletingId.value = entry.id;
    error.value = '';
    warnings.value = [];
    await api.delete(`/school-portal/${props.organizationId}/providers/${selectedProviderId.value}/schedule-entries/${entry.id}`);
    await reloadEntries();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to delete entry';
  } finally {
    deletingId.value = null;
  }
};

const moveEntry = async (entry, direction) => {
  try {
    movingId.value = entry.id;
    error.value = '';
    warnings.value = [];
    const resp = await api.post(
      `/school-portal/${props.organizationId}/providers/${selectedProviderId.value}/schedule-entries/${entry.id}/move`,
      { direction }
    );
    entries.value = resp.data?.entries || entries.value;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to reorder entry';
  } finally {
    movingId.value = null;
  }
};

watch([selectedProviderId, selectedDay], async () => {
  warnings.value = [];
  error.value = '';
  await reloadAssignedClients();
  await reloadEntries();
});

onMounted(async () => {
  await reloadAll();
});
</script>

<style scoped>
.controls {
  display: grid;
  grid-template-columns: 1fr 220px auto;
  gap: 12px;
  align-items: end;
  margin-bottom: 16px;
}
.field label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.select,
.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
}
.meta {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
}
.chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--bg);
  font-size: 12px;
}

.chip.overbooked {
  background: rgba(217, 45, 32, 0.12);
  border-color: rgba(217, 45, 32, 0.28);
  color: var(--danger, #d92d20);
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 14px;
  margin-bottom: 16px;
}
.card-header h3 {
  margin: 0 0 10px;
  font-size: 16px;
}
.row {
  display: grid;
  grid-template-columns: 1.2fr 150px 150px 1fr 1fr auto;
  gap: 10px;
  align-items: end;
}
.actions {
  display: flex;
  justify-content: flex-end;
}
.table-wrap {
  overflow-x: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.actions-cell {
  text-align: right;
}
.unread-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  margin-right: 6px;
  vertical-align: middle;
}
.loading,
.empty {
  padding: 12px;
  color: var(--text-secondary);
}
.error {
  color: #c33;
  margin-bottom: 10px;
}
.warn {
  border: 1px solid rgba(255, 170, 0, 0.4);
  background: rgba(255, 170, 0, 0.08);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.warn-item {
  font-size: 13px;
  color: var(--text-primary);
}
@media (max-width: 1100px) {
  .controls {
    grid-template-columns: 1fr;
  }
  .row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>

