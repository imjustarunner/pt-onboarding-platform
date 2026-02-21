<template>
  <div class="meeting-agenda-panel">
    <div class="agenda-header">
      <h3 class="agenda-title">Agenda for {{ meeting?.title || 'Meeting' }}</h3>
      <span v-if="meeting?.start_at" class="agenda-date">{{ formatMeetingDate(meeting.start_at) }}</span>
      <button type="button" class="btn-close" aria-label="Close" @click="$emit('close')">×</button>
    </div>

    <div v-if="loading" class="agenda-loading">Loading agenda…</div>
    <div v-else-if="error" class="agenda-error">{{ error }}</div>
    <template v-else>
      <div v-if="canAddItem" class="agenda-add-form">
        <input
          v-model="newItemTitle"
          type="text"
          class="form-control"
          placeholder="Add agenda item…"
          @keydown.enter="addFreeformItem"
        />
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="!newItemTitle.trim() || adding"
          @click="addFreeformItem"
        >
          {{ adding ? '…' : 'Add' }}
        </button>
      </div>

      <ul class="agenda-items">
        <li
          v-for="item in items"
          :key="item.id"
          class="agenda-item"
          :class="{ 'agenda-item-done': item.status === 'completed', 'agenda-item-discussed': item.status === 'discussed' }"
        >
          <label class="agenda-item-check">
            <select
              :value="item.status"
              :disabled="togglingId === item.id"
              class="agenda-status-select"
              @change="updateItemStatus(item, $event.target.value)"
            >
              <option value="pending">Pending</option>
              <option value="discussed">Discussed</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <div class="agenda-item-content">
            <span class="agenda-item-title">{{ item.title }}</span>
            <a
              v-if="item.task_id"
              :href="`/tasks`"
              class="agenda-item-task-link"
              target="_blank"
              rel="noopener"
            >
              Open task
            </a>
          </div>
          <button
            v-if="canAddItem"
            type="button"
            class="btn btn-ghost btn-xs"
            aria-label="Remove"
            :disabled="deletingId === item.id"
            @click="removeItem(item)"
          >
            {{ deletingId === item.id ? '…' : '×' }}
          </button>
        </li>
      </ul>
      <div v-if="items.length === 0 && !loading" class="agenda-empty">No agenda items yet. Add items above or from a task list.</div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  meetingType: { type: String, required: true },
  meetingId: { type: [Number, String], required: true },
  canAddItem: { type: Boolean, default: true }
});

const emit = defineEmits(['close', 'updated']);

const loading = ref(true);
const error = ref('');
const agenda = ref(null);
const meeting = ref(null);
const items = ref([]);
const newItemTitle = ref('');
const adding = ref(false);
const togglingId = ref(null);
const deletingId = ref(null);

const fetchAgenda = async () => {
  if (!props.meetingType || !props.meetingId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/meeting-agendas', {
      params: { meetingType: props.meetingType, meetingId: props.meetingId }
    });
    agenda.value = res.data?.agenda || null;
    meeting.value = res.data?.meeting || null;
    items.value = Array.isArray(res.data?.items) ? res.data.items : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load agenda';
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const formatMeetingDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const updateItemStatus = async (item, status) => {
  if (!agenda.value || togglingId.value) return;
  togglingId.value = item.id;
  try {
    await api.patch(`/meeting-agendas/${agenda.value.id}/items/${item.id}`, { status });
    const idx = items.value.findIndex((i) => i.id === item.id);
    if (idx >= 0) items.value[idx] = { ...items.value[idx], status };
    emit('updated');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to update';
  } finally {
    togglingId.value = null;
  }
};

const addFreeformItem = async () => {
  const title = newItemTitle.value?.trim();
  if (!title || !agenda.value || adding.value) return;
  adding.value = true;
  try {
    const res = await api.post(`/meeting-agendas/${agenda.value.id}/items`, { title });
    items.value.push(res.data);
    newItemTitle.value = '';
    emit('updated');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to add item';
  } finally {
    adding.value = false;
  }
};

const removeItem = async (item) => {
  if (!agenda.value || deletingId.value) return;
  deletingId.value = item.id;
  try {
    await api.delete(`/meeting-agendas/${agenda.value.id}/items/${item.id}`);
    items.value = items.value.filter((i) => i.id !== item.id);
    emit('updated');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to remove';
  } finally {
    deletingId.value = null;
  }
};

onMounted(() => fetchAgenda());
watch(
  () => [props.meetingType, props.meetingId],
  () => fetchAgenda()
);
</script>

<style scoped>
.meeting-agenda-panel {
  background: white;
  border-radius: 12px;
  padding: 20px;
  max-width: 480px;
  width: 100%;
  max-height: 80vh;
  overflow: auto;
}

.agenda-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.agenda-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
}

.agenda-date {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  white-space: nowrap;
}

.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
  line-height: 1;
}

.btn-close:hover {
  color: #1f2937;
}

.agenda-loading,
.agenda-error {
  padding: 16px 0;
  color: var(--text-secondary, #6b7280);
}

.agenda-error {
  color: #dc2626;
}

.agenda-add-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.agenda-add-form .form-control {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.agenda-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.agenda-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 8px;
}

.agenda-item-discussed .agenda-item-title {
  opacity: 0.8;
}

.agenda-item-done .agenda-item-title {
  text-decoration: line-through;
  color: var(--text-secondary, #6b7280);
}

.agenda-item-check {
  flex-shrink: 0;
}

.agenda-status-select {
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
  background: white;
}

.agenda-item-content {
  flex: 1;
  min-width: 0;
}

.agenda-item-title {
  display: block;
  font-size: 14px;
}

.agenda-item-task-link {
  font-size: 12px;
  color: var(--primary, #3b82f6);
  margin-top: 4px;
  display: inline-block;
}

.agenda-item-task-link:hover {
  text-decoration: underline;
}

.btn-ghost {
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
}

.btn-ghost:hover {
  color: #1f2937;
}

.agenda-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
}
</style>
