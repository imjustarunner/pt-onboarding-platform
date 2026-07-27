<template>
  <div class="meeting-agenda-panel" :class="{ 'meeting-agenda-panel--embedded': embedded }">
    <div v-if="!embedded" class="agenda-header">
      <h3 class="agenda-title">Agenda for {{ meeting?.title || 'Meeting' }}</h3>
      <span v-if="meeting?.start_at" class="agenda-date">{{ formatMeetingDate(meeting.start_at) }}</span>
      <span v-if="live" class="agenda-live">Live — updates for everyone</span>
      <button type="button" class="btn-close" aria-label="Close" @click="$emit('close')">×</button>
    </div>

    <div v-if="loading && !hasLoaded" class="agenda-loading">Loading agenda…</div>
    <div v-else-if="error && !hasLoaded" class="agenda-error">{{ error }}</div>
    <template v-else-if="hasLoaded || !loading">
      <section class="agenda-section">
        <div class="agenda-section-head">
          <h3>{{ embedded ? 'Agenda' : 'Agenda items' }}</h3>
          <button
            v-if="canAddItem"
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="adding"
            @click="startAdd"
          >
            + Add agenda item
          </button>
        </div>

        <div v-if="canAddItem && showAddRow" class="agenda-add-row">
          <input
            ref="addInputRef"
            v-model="newItemTitle"
            type="text"
            class="input agenda-add-input"
            placeholder="Agenda item"
            :disabled="adding"
            @keydown.enter.prevent="addFreeformItem"
            @keydown.escape.prevent="cancelAdd"
          />
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="!newItemTitle.trim() || adding"
            @click="addFreeformItem"
          >
            {{ adding ? '…' : 'Add' }}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" :disabled="adding" @click="cancelAdd">
            Cancel
          </button>
        </div>

        <ol class="agenda-items">
          <li
            v-for="(item, idx) in items"
            :key="item.id"
            class="agenda-item"
            :class="{ 'agenda-item-done': item.status === 'completed', 'agenda-item-discussed': item.status === 'discussed' }"
          >
            <span class="agenda-item-num" aria-hidden="true">{{ idx + 1 }}</span>
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
            <div class="agenda-item-content">
              <input
                v-if="canAddItem"
                class="input agenda-item-title-input"
                type="text"
                :value="item.title"
                :disabled="togglingId === item.id"
                @change="updateItemTitle(item, $event.target.value)"
              />
              <span v-else class="agenda-item-title">{{ item.title }}</span>
              <a
                v-if="item.task_id"
                href="/tasks"
                class="agenda-item-task-link"
                target="_blank"
                rel="noopener"
              >
                Open task
              </a>
            </div>
            <div v-if="canAddItem" class="agenda-item-move">
              <button
                type="button"
                class="agenda-icon"
                title="Move up"
                :disabled="idx === 0 || togglingId === item.id"
                @click="moveItem(idx, -1)"
              >↑</button>
              <button
                type="button"
                class="agenda-icon"
                title="Move down"
                :disabled="idx >= items.length - 1 || togglingId === item.id"
                @click="moveItem(idx, 1)"
              >↓</button>
              <button
                type="button"
                class="agenda-icon"
                aria-label="Remove"
                :disabled="deletingId === item.id"
                @click="removeItem(item)"
              >
                {{ deletingId === item.id ? '…' : '🗑' }}
              </button>
            </div>
          </li>
          <li v-if="!items.length" class="agenda-empty muted">No agenda items yet.</li>
        </ol>
        <p v-if="live" class="agenda-live-hint muted">Live — updates for everyone</p>
      </section>
    </template>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  meetingType: { type: String, required: true },
  meetingId: { type: [Number, String], required: true },
  canAddItem: { type: Boolean, default: true },
  /** Hide chrome close button; for embedding beside video / info rail */
  embedded: { type: Boolean, default: false },
  /** Poll for shared updates during a live session */
  live: { type: Boolean, default: false },
  pollMs: { type: Number, default: 8000 }
});

const emit = defineEmits(['close', 'updated']);

const loading = ref(true);
const hasLoaded = ref(false);
const error = ref('');
const agenda = ref(null);
const meeting = ref(null);
const items = ref([]);
const newItemTitle = ref('');
const showAddRow = ref(false);
const adding = ref(false);
const togglingId = ref(null);
const deletingId = ref(null);
const addInputRef = ref(null);
let pollTimer = null;
let loadedKey = '';
let fetchGeneration = 0;

const meetingKey = () => `${String(props.meetingType || '')}:${String(props.meetingId || '')}`;

const fetchAgenda = async ({ silent = false } = {}) => {
  if (!props.meetingType || !props.meetingId) return;
  const key = meetingKey();
  const generation = ++fetchGeneration;
  // Already have data for this meeting — refresh quietly (no full-panel loading state).
  const quiet = silent || (hasLoaded.value && loadedKey === key);
  if (!quiet) {
    loading.value = true;
    error.value = '';
  }
  try {
    const res = await api.get('/meeting-agendas', {
      params: { meetingType: props.meetingType, meetingId: props.meetingId },
      skipGlobalLoading: true
    });
    if (generation !== fetchGeneration) return;
    agenda.value = res.data?.agenda || null;
    meeting.value = res.data?.meeting || null;
    items.value = Array.isArray(res.data?.items) ? res.data.items : [];
    loadedKey = key;
    hasLoaded.value = true;
  } catch (e) {
    if (generation !== fetchGeneration) return;
    if (!quiet) error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load agenda';
  } finally {
    if (generation === fetchGeneration && !quiet) loading.value = false;
  }
};

async function startAdd() {
  showAddRow.value = true;
  await nextTick();
  addInputRef.value?.focus?.();
}

function cancelAdd() {
  showAddRow.value = false;
  newItemTitle.value = '';
}

const addFreeformItem = async () => {
  const title = String(newItemTitle.value || '').trim();
  if (!title || adding.value) return;
  adding.value = true;
  try {
    if (!agenda.value) await fetchAgenda({ silent: true });
    if (!agenda.value?.id) {
      error.value = 'Agenda is not ready yet';
      return;
    }
    const res = await api.post(`/meeting-agendas/${agenda.value.id}/items`, { title });
    if (res?.data) items.value.push(res.data);
    else await fetchAgenda({ silent: true });
    newItemTitle.value = '';
    showAddRow.value = false;
    emit('updated');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to add item';
  } finally {
    adding.value = false;
  }
};

const updateItemStatus = async (item, status) => {
  if (!item?.id || !agenda.value?.id || togglingId.value) return;
  togglingId.value = item.id;
  try {
    await api.patch(`/meeting-agendas/${agenda.value.id}/items/${item.id}`, { status });
    const idx = items.value.findIndex((i) => i.id === item.id);
    if (idx >= 0) items.value[idx] = { ...items.value[idx], status };
    emit('updated');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update item';
  } finally {
    togglingId.value = null;
  }
};

const updateItemTitle = async (item, title) => {
  const next = String(title || '').trim();
  if (!item?.id || !agenda.value?.id || !next || next === String(item.title || '').trim()) return;
  togglingId.value = item.id;
  try {
    await api.patch(`/meeting-agendas/${agenda.value.id}/items/${item.id}`, { title: next });
    const idx = items.value.findIndex((i) => i.id === item.id);
    if (idx >= 0) items.value[idx] = { ...items.value[idx], title: next };
    emit('updated');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to update item';
  } finally {
    togglingId.value = null;
  }
};

const moveItem = async (idx, delta) => {
  const j = idx + delta;
  if (!agenda.value?.id || j < 0 || j >= items.value.length) return;
  const a = items.value[idx];
  const b = items.value[j];
  if (!a?.id || !b?.id) return;
  const orderA = Number(a.sort_order ?? idx);
  const orderB = Number(b.sort_order ?? j);
  togglingId.value = a.id;
  try {
    await Promise.all([
      api.patch(`/meeting-agendas/${agenda.value.id}/items/${a.id}`, { sort_order: orderB }),
      api.patch(`/meeting-agendas/${agenda.value.id}/items/${b.id}`, { sort_order: orderA })
    ]);
    const next = [...items.value];
    next[idx] = { ...b, sort_order: orderA };
    next[j] = { ...a, sort_order: orderB };
    items.value = next;
    emit('updated');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to reorder item';
    await fetchAgenda({ silent: true });
  } finally {
    togglingId.value = null;
  }
};

const removeItem = async (item) => {
  if (!item?.id || !agenda.value?.id || deletingId.value) return;
  deletingId.value = item.id;
  try {
    await api.delete(`/meeting-agendas/${agenda.value.id}/items/${item.id}`);
    items.value = items.value.filter((i) => i.id !== item.id);
    emit('updated');
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to remove item';
  } finally {
    deletingId.value = null;
  }
};

function formatMeetingDate(raw) {
  try {
    return new Date(raw).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return String(raw || '');
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPoll() {
  stopPoll();
  if (!props.live) return;
  pollTimer = setInterval(() => { void fetchAgenda({ silent: true }); }, Math.max(3000, Number(props.pollMs || 8000)));
}

watch(
  () => [props.meetingType, props.meetingId],
  (curr, prev) => {
    const nextKey = `${String(curr?.[0] || '')}:${String(curr?.[1] || '')}`;
    const prevKey = `${String(prev?.[0] || '')}:${String(prev?.[1] || '')}`;
    if (nextKey !== prevKey) {
      hasLoaded.value = false;
      loadedKey = '';
      items.value = [];
      agenda.value = null;
    }
    void fetchAgenda();
    startPoll();
  },
  { immediate: true }
);

watch(() => props.live, () => { startPoll(); });

onMounted(() => { startPoll(); });
onUnmounted(() => { stopPoll(); });
</script>

<style scoped>
.meeting-agenda-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.meeting-agenda-panel--embedded {
  padding: 4px 2px 0;
}
.agenda-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.agenda-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
}
.agenda-date,
.agenda-live {
  font-size: 0.78rem;
  color: #64748b;
}
.agenda-live {
  color: #15803d;
  font-weight: 700;
}
.agenda-section {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.65);
}
.agenda-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.agenda-section-head h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}
.agenda-add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
}
.agenda-add-input {
  flex: 1;
  min-width: 160px;
}
.agenda-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.agenda-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.agenda-item-num {
  flex: 0 0 auto;
  width: 24px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #e2e8f0;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 700;
  margin-top: 2px;
}
.agenda-status-select {
  flex: 0 0 auto;
  margin-top: 2px;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
  background: #fff;
}
.agenda-item-content {
  flex: 1;
  min-width: 0;
  padding-top: 0;
}
.agenda-item-title-input {
  width: 100%;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 4px 8px;
}
.agenda-item-move {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.agenda-item-title {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
}
.agenda-item-discussed .agenda-item-title { opacity: 0.8; }
.agenda-item-done .agenda-item-title {
  text-decoration: line-through;
  color: #64748b;
}
.agenda-item-task-link {
  font-size: 12px;
  color: var(--primary, #3b82f6);
  margin-top: 4px;
  display: inline-block;
}
.agenda-icon {
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}
.agenda-empty {
  padding: 4px 0;
  font-size: 0.88rem;
}
.agenda-live-hint {
  margin: 8px 0 0;
  font-size: 0.78rem;
}
.agenda-loading,
.agenda-error {
  padding: 8px 0;
  color: #64748b;
  font-size: 0.88rem;
}
.agenda-error { color: #dc2626; }
.muted { color: #64748b; }
.btn-ghost {
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}
</style>
