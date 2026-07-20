<template>
  <aside class="po-panel" aria-label="Planned outs">
    <div class="po-head">
      <div>
        <strong>Planned Outs</strong>
        <span class="muted">{{ items.length }} upcoming</span>
      </div>
      <div class="po-actions">
        <button type="button" class="link-btn" @click="showModal = true">+ Add</button>
        <button type="button" class="link-btn" @click="$emit('open-full')">Open</button>
      </div>
    </div>

    <div class="col-order" title="Drag to reorder columns">
      <span class="col-label">Columns</span>
      <button
        v-for="(colId, idx) in columnOrder"
        :key="colId"
        type="button"
        class="col-chip"
        @click="moveColumn(idx)"
        :title="`Move ${colLabel(colId)}`"
      >
        {{ colLabel(colId) }}
      </button>
    </div>

    <div v-if="loading" class="empty">Loading…</div>
    <div v-else-if="error" class="empty err">{{ error }}</div>
    <ul v-else-if="items.length" class="po-list">
      <li v-for="row in items" :key="row.id" class="po-row">
        <div class="po-line">
          <template v-for="(colId, i) in columnOrder" :key="`${row.id}-${colId}`">
            <span :class="colId === 'person' ? 'name' : 'cell'">{{ cellValue(row, colId) }}</span>
            <span v-if="i < columnOrder.length - 1" class="sep">|</span>
          </template>
        </div>
        <div class="po-meta">
          <i class="status" :class="row.status">{{ statusLabel(row.status) }}</i>
          <button
            v-if="canDelete(row)"
            type="button"
            class="tiny"
            @click="remove(row)"
          >Delete</button>
          <template v-if="canReview">
            <button type="button" class="tiny" @click="review(row, 'approve')">Approve</button>
            <button type="button" class="tiny danger" @click="review(row, 'reject')">Reject</button>
            <button type="button" class="tiny warn" @click="review(row, 'revision')">Revise</button>
          </template>
        </div>
        <p v-if="row.admin_comment" class="admin-note">Admin: {{ row.admin_comment }}</p>
      </li>
    </ul>
    <p v-else class="empty">No upcoming planned outs. Add one to block the schedule.</p>

    <PlannedOutModal
      v-if="showModal && agencyNum"
      :agency-id="agencyNum"
      @close="showModal = false"
      @created="onCreated"
    />
  </aside>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import { useAuthStore } from '../../../store/auth';
import PlannedOutModal from './PlannedOutModal.vue';
import {
  PLANNED_OUT_COLUMNS,
  cellValue,
  loadColumnOrder,
  saveColumnOrder,
  statusLabel
} from '../../../utils/plannedOuts';

const props = defineProps({
  agencyId: { type: [Number, String], default: null }
});

defineEmits(['open-full']);

const authStore = useAuthStore();
const loading = ref(true);
const error = ref('');
const items = ref([]);
const showModal = ref(false);
const columnOrder = ref(loadColumnOrder());

const agencyNum = computed(() => {
  const n = Number(props.agencyId);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const canReview = computed(() => ['super_admin', 'admin', 'support'].includes(role.value));

function colLabel(id) {
  return PLANNED_OUT_COLUMNS.find((c) => c.id === id)?.label || id;
}

function moveColumn(idx) {
  if (idx <= 0) return;
  const next = [...columnOrder.value];
  const [item] = next.splice(idx, 1);
  next.splice(idx - 1, 0, item);
  columnOrder.value = next;
  saveColumnOrder(next);
}

function canDelete(row) {
  return Number(row.user_id) === Number(authStore.user?.id) || canReview.value;
}

async function load() {
  if (!agencyNum.value) {
    items.value = [];
    loading.value = false;
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/planned-outs', {
      params: { agencyId: agencyNum.value, upcomingOnly: 1, limit: 40 },
      skipGlobalLoading: true
    });
    items.value = Array.isArray(res.data?.plannedOuts) ? res.data.plannedOuts : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load planned outs';
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function onCreated() {
  load();
}

async function remove(row) {
  if (!window.confirm('Delete this planned out and its schedule block?')) return;
  try {
    await api.delete(`/planned-outs/${row.id}`, { skipGlobalLoading: true });
    await load();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || 'Delete failed');
  }
}

async function review(row, action) {
  let comment = '';
  if (action === 'reject' || action === 'revision') {
    comment = window.prompt(action === 'reject' ? 'Reject comment (required):' : 'Revision comment (required):') || '';
    if (!comment.trim()) return;
  }
  try {
    await api.post(
      `/planned-outs/${row.id}/review`,
      { action, comment: comment.trim() || undefined },
      { skipGlobalLoading: true }
    );
    await load();
  } catch (e) {
    window.alert(e.response?.data?.error?.message || 'Review failed');
  }
}

watch(agencyNum, () => load());
onMounted(load);

defineExpose({ reload: load });
</script>

<style scoped>
.po-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  border-left: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
  padding-left: 14px;
}
.po-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.po-head strong {
  display: block;
  font-size: 0.95rem;
  color: var(--ops-primary, #1f6b4a);
}
.muted {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
  margin-left: 6px;
}
.po-actions { display: flex; gap: 10px; }
.link-btn {
  border: none;
  background: none;
  color: var(--ops-primary, #1f6b4a);
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.link-btn:hover { text-decoration: underline; }
.col-order {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.col-label {
  font-size: 10px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  margin-right: 2px;
}
.col-chip {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
}
.po-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
}
.po-row {
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
}
.po-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: baseline;
  font-size: 12px;
  color: #334155;
  line-height: 1.35;
}
.po-line .name { font-weight: 800; color: #0f172a; }
.sep { color: #cbd5e1; font-weight: 600; }
.po-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  align-items: center;
}
.status {
  font-style: normal;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
}
.status.approved { background: #dcfce7; color: #166534; }
.status.rejected { background: #fee2e2; color: #b91c1c; }
.status.revision { background: #ffedd5; color: #c2410c; }
.tiny {
  border: none;
  background: transparent;
  color: var(--ops-primary, #1f6b4a);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.tiny.danger { color: #b91c1c; }
.tiny.warn { color: #c2410c; }
.admin-note {
  margin: 4px 0 0;
  font-size: 11px;
  color: #b45309;
}
.empty {
  font-size: 13px;
  color: #94a3b8;
  padding: 8px 0;
}
.empty.err { color: #b91c1c; }
@media (max-width: 900px) {
  .po-panel {
    border-left: none;
    border-top: 1px solid color-mix(in srgb, var(--ops-primary, #1f6b4a) 14%, #e2e8f0);
    padding-left: 0;
    padding-top: 12px;
  }
}
</style>
