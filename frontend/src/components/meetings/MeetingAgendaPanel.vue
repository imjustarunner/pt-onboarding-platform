<template>
  <div
    class="meeting-agenda-panel"
    :class="{
      'meeting-agenda-panel--embedded': embedded,
      'meeting-agenda-panel--compact': compact,
      'meeting-agenda-panel--dark': theme === 'dark',
      'meeting-agenda-panel--live-sidebar': liveSidebar
    }"
  >
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
          <div class="agenda-section-actions">
            <button
              v-if="compact && canAddItem"
              type="button"
              class="mw-pill-btn"
              :class="{ 'mw-pill-btn--on': statusMode }"
              @click="statusMode = !statusMode"
            >
              Status
            </button>
            <button
              v-if="canAddItem"
              type="button"
              class="mw-link-btn"
              :disabled="adding"
              @click="startAdd"
            >
              + Add item
            </button>
          </div>
        </div>

        <div v-if="canAddItem && showAddRow" class="agenda-add-row">
          <input
            ref="addInputRef"
            v-model="newItemTitle"
            type="text"
            class="mw-field agenda-add-input"
            placeholder="Agenda item"
            :disabled="adding"
            @keydown.enter.prevent="addFreeformItem"
            @keydown.escape.prevent="cancelAdd"
          />
          <button
            type="button"
            class="mw-link-btn mw-link-btn--strong"
            :disabled="!newItemTitle.trim() || adding"
            @click="addFreeformItem"
          >
            {{ adding ? '…' : 'Add' }}
          </button>
          <button type="button" class="mw-link-btn mw-link-btn--muted" :disabled="adding" @click="cancelAdd">
            Cancel
          </button>
        </div>
        <p v-if="error && hasLoaded" class="agenda-error">{{ error }}</p>

        <ol class="agenda-items">
          <li
            v-for="(item, idx) in items"
            :key="item.id"
            class="agenda-item"
            :class="{
              'agenda-item--editing': editingId === item.id,
              'agenda-item--live-sidebar': liveSidebar,
              'agenda-item-done': item.status === 'completed',
              'agenda-item-discussed': item.status === 'discussed'
            }"
          >
            <div class="agenda-item-row">
              <span class="agenda-item-num" aria-hidden="true">{{ idx + 1 }}</span>

              <div class="agenda-item-content">
                <template v-if="canAddItem && editingId === item.id">
                  <input
                    ref="editInputRef"
                    v-model="editDraft"
                    class="mw-field agenda-item-title-input"
                    type="text"
                    :disabled="togglingId === item.id"
                    @keydown.enter.prevent="saveEdit(item)"
                    @keydown.escape.prevent="cancelEdit"
                  />
                </template>
                <template v-else>
                  <div class="mw-hover-wrap">
                    <span class="agenda-item-title" :title="item.title">{{ item.title }}</span>
                  </div>
                  <a
                    v-if="item.task_id"
                    href="/tasks"
                    class="agenda-item-task-link"
                    target="_blank"
                    rel="noopener"
                  >
                    Open task
                  </a>
                </template>
              </div>

              <select
                v-if="showStatusSelect"
                :value="item.status"
                :disabled="togglingId === item.id"
                class="agenda-status-select"
                :class="{ 'agenda-status-select--sidebar': liveSidebar }"
                :aria-label="`Status for ${item.title}`"
                @change="updateItemStatus(item, $event.target.value)"
              >
                <option value="pending">Pending</option>
                <option value="discussed">Discussed</option>
                <option value="completed">Completed</option>
              </select>
              <span
                v-else-if="compact && statusBadge(item.status)"
                class="agenda-status-badge"
                :class="`agenda-status-badge--${item.status}`"
              >
                {{ statusBadge(item.status) }}
              </span>
            </div>

            <div v-if="canAddItem" class="agenda-item-actions">
              <template v-if="editingId === item.id">
                <button
                  type="button"
                  class="agenda-action-btn agenda-action-btn--primary"
                  :disabled="!editDraft.trim() || togglingId === item.id"
                  @click="saveEdit(item)"
                >
                  Save
                </button>
                <button
                  type="button"
                  class="agenda-action-btn"
                  :disabled="togglingId === item.id"
                  @click="cancelEdit"
                >
                  Cancel
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="agenda-action-btn"
                  title="Edit"
                  :disabled="togglingId === item.id"
                  @click="startEdit(item)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="mw-icon-btn"
                  title="Move up"
                  aria-label="Move up"
                  :disabled="idx === 0 || togglingId === item.id"
                  @click="moveItem(idx, -1)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>
                </button>
                <button
                  type="button"
                  class="mw-icon-btn"
                  title="Move down"
                  aria-label="Move down"
                  :disabled="idx >= items.length - 1 || togglingId === item.id"
                  @click="moveItem(idx, 1)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                </button>
                <button
                  type="button"
                  class="mw-icon-btn mw-icon-btn--danger"
                  aria-label="Remove"
                  :disabled="deletingId === item.id"
                  @click="removeItem(item)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </template>
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  meetingType: { type: String, required: true },
  meetingId: { type: [Number, String], required: true },
  canAddItem: { type: Boolean, default: true },
  /** Hide chrome close button; for embedding beside video / info rail */
  embedded: { type: Boolean, default: false },
  /** Condensed rows with edit button; status hidden unless toggled (unless live). */
  compact: { type: Boolean, default: null },
  /** Poll for shared updates during a live session */
  live: { type: Boolean, default: false },
  /** Narrow live sidebar layout: title wraps, compact status control */
  liveSidebar: { type: Boolean, default: false },
  pollMs: { type: Number, default: 8000 },
  /** light (default) | dark — for live supervision workspace */
  theme: { type: String, default: 'light' }
});

const emit = defineEmits(['close', 'updated']);

const compact = computed(() => (
  props.compact != null ? !!props.compact : !!props.embedded
));
const showStatusSelect = computed(() => (
  !compact.value || props.live || statusMode.value
));

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
const editInputRef = ref(null);
const editingId = ref(null);
const editDraft = ref('');
const statusMode = ref(false);
let pollTimer = null;
let loadedKey = '';
let fetchGeneration = 0;

const meetingKey = () => `${String(props.meetingType || '')}:${String(props.meetingId || '')}`;

function statusBadge(status) {
  const s = String(status || 'pending').toLowerCase();
  if (s === 'completed') return 'Done';
  if (s === 'discussed') return 'Discussed';
  return '';
}

const fetchAgenda = async ({ silent = false } = {}) => {
  if (!props.meetingType || !props.meetingId) return;
  const key = meetingKey();
  const generation = ++fetchGeneration;
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

function startEdit(item) {
  editingId.value = item?.id || null;
  editDraft.value = String(item?.title || '');
  void nextTick(() => {
    const el = Array.isArray(editInputRef.value) ? editInputRef.value[0] : editInputRef.value;
    el?.focus?.();
    el?.select?.();
  });
}

function cancelEdit() {
  editingId.value = null;
  editDraft.value = '';
}

async function saveEdit(item) {
  const next = String(editDraft.value || '').trim();
  if (!next || next === String(item?.title || '').trim()) {
    cancelEdit();
    return;
  }
  await updateItemTitle(item, next);
  cancelEdit();
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
    if (editingId.value === item.id) cancelEdit();
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
      cancelEdit();
      statusMode.value = false;
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
  gap: 0;
}
.meeting-agenda-panel--embedded {
  padding: 0;
}
.agenda-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
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
  padding: 0;
  background: transparent;
}
.meeting-agenda-panel:not(.meeting-agenda-panel--embedded) .agenda-section {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 14px;
  padding: 14px;
  background: #fff;
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
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.agenda-section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mw-link-btn {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #7c3aed;
  cursor: pointer;
}
.mw-link-btn:hover:not(:disabled) { color: #6d28d9; }
.mw-link-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.mw-link-btn--strong { font-weight: 700; }
.mw-link-btn--muted { color: #94a3b8; font-weight: 500; }
.mw-link-btn--muted:hover:not(:disabled) { color: #64748b; }
.mw-pill-btn {
  appearance: none;
  border: none;
  background: transparent;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #94a3b8;
  cursor: pointer;
}
.mw-pill-btn--on {
  color: #6d28d9;
  background: rgba(124, 58, 237, 0.1);
}
.mw-field {
  width: 100%;
  border: none;
  border-radius: 8px;
  background: #f1f5f9;
  padding: 7px 10px;
  font: inherit;
  font-size: 0.84rem;
  color: #0f172a;
  outline: none;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.mw-field:focus {
  background: #fff;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.22);
}
.agenda-add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}
.agenda-add-input {
  flex: 1;
  min-width: 120px;
}
.agenda-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.agenda-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 8px;
  min-height: 34px;
  position: relative;
  transition: background 0.12s ease;
}
.agenda-item-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}
.agenda-item--live-sidebar {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}
.agenda-item--live-sidebar .agenda-item-row {
  width: 100%;
}
.agenda-item--live-sidebar .agenda-item-content {
  flex: 1 1 auto;
}
.agenda-item--live-sidebar .agenda-item-title {
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
  line-height: 1.35;
}
.agenda-item--live-sidebar .agenda-status-select--sidebar {
  max-width: 78px;
  padding: 2px 4px;
  font-size: 0.66rem;
  margin-top: 1px;
}
.agenda-item--live-sidebar .agenda-item-actions {
  opacity: 1;
  align-self: flex-end;
}
.agenda-item:hover {
  background: rgba(148, 163, 184, 0.1);
}
.agenda-item--editing {
  background: rgba(124, 58, 237, 0.06);
}
.agenda-item-num {
  flex: 0 0 auto;
  width: 1.1rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #94a3b8;
  text-align: right;
  padding-top: 2px;
}
.agenda-status-select {
  flex: 0 0 auto;
  padding: 4px 8px;
  border: none;
  border-radius: 8px;
  font-size: 0.72rem;
  background: #f1f5f9;
  color: #475569;
  max-width: 104px;
}
.agenda-status-badge {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.agenda-status-badge--discussed {
  color: #1d4ed8;
  background: rgba(59, 130, 246, 0.12);
}
.agenda-status-badge--completed {
  color: #047857;
  background: rgba(16, 185, 129, 0.12);
}
.agenda-item-content {
  flex: 1;
  min-width: 0;
}
.agenda-item-title-input {
  width: 100%;
}
.agenda-item-title {
  display: block;
  font-size: 0.86rem;
  font-weight: 500;
  color: #1e293b;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meeting-agenda-panel--dark .agenda-title,
.meeting-agenda-panel--dark .agenda-item-title,
.meeting-agenda-panel--dark .agenda-section-head h3,
.meeting-agenda-panel--dark .agenda-empty,
.meeting-agenda-panel--dark .muted,
.meeting-agenda-panel--dark .agenda-live-hint {
  color: #e2e8f0 !important;
}
.meeting-agenda-panel--dark .agenda-item-discussed .agenda-item-title {
  color: #cbd5e1 !important;
}
.meeting-agenda-panel--dark .agenda-item-done .agenda-item-title {
  color: #94a3b8 !important;
}
.meeting-agenda-panel--dark .mw-field,
.meeting-agenda-panel--dark .agenda-status-select {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}
.meeting-agenda-panel--dark .mw-field:focus {
  background: rgba(255, 255, 255, 0.12);
}
.meeting-agenda-panel--dark .mw-link-btn {
  color: #c4b5fd;
}
.meeting-agenda-panel--dark .agenda-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.meeting-agenda-panel--dark .agenda-item-num {
  color: #94a3b8;
}
.agenda-item-discussed .agenda-item-title { color: #475569; }
.agenda-item-done .agenda-item-title {
  text-decoration: line-through;
  color: #94a3b8;
}
.agenda-item-task-link {
  font-size: 11px;
  color: #7c3aed;
  margin-top: 2px;
  display: inline-block;
}
.agenda-item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
  position: static;
  padding-left: 4px;
  background: transparent;
  border-radius: 0;
}
.agenda-item:hover .agenda-item-actions,
.agenda-item--editing .agenda-item-actions {
  opacity: 1;
}
.agenda-item:hover .agenda-item-title,
.agenda-item--editing .agenda-item-title {
  /* Keep a single line so actions never cover wrapped title text */
  white-space: nowrap;
}
.mw-hover-wrap {
  position: relative;
  min-width: 0;
  flex: 1;
}
.mw-hover-wrap:hover .agenda-item-title,
.mw-hover-wrap:hover .mgap__text {
  /* Title stays truncated; full text remains available via title attribute / edit */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mgap__hover-meta {
  display: none;
  margin-top: 2px;
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
}
.mw-hover-wrap:hover .mgap__hover-meta {
  display: block;
}
.agenda-action-btn {
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 2px 8px;
  font-size: 0.76rem;
  font-weight: 600;
  color: #64748b;
  border-radius: 6px;
}
.agenda-action-btn:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.16);
  color: #0f172a;
}
.agenda-action-btn--primary { color: #7c3aed; }
.agenda-action-btn--primary:hover:not(:disabled) {
  background: rgba(124, 58, 237, 0.1);
}
.mw-icon-btn {
  appearance: none;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 4px;
  line-height: 0;
  color: #94a3b8;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mw-icon-btn:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.16);
  color: #475569;
}
.mw-icon-btn--danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}
.mw-icon-btn:disabled,
.agenda-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.agenda-empty {
  padding: 6px 4px;
  font-size: 0.82rem;
}
.meeting-agenda-panel--live-sidebar .agenda-section-head h3 {
  font-size: 0.92rem;
}
.meeting-agenda-panel--live-sidebar .agenda-live-hint {
  display: none;
}
.agenda-live-hint {
  margin: 8px 0 0;
  font-size: 0.75rem;
}
.agenda-loading,
.agenda-error {
  padding: 8px 0;
  color: #64748b;
  font-size: 0.84rem;
}
.agenda-error { color: #dc2626; }
.muted { color: #64748b; }
</style>
