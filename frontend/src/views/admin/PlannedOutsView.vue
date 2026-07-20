<template>
  <div class="po-page">
    <header class="po-page-head">
      <div>
        <h1>Planned Outs</h1>
        <p>Upcoming absences for this organization — hours, half days, and all-day blocks.</p>
      </div>
      <div class="po-page-actions">
        <button type="button" class="btn primary" @click="showModal = true">Submit planned out</button>
        <router-link class="btn ghost" :to="backTo">Back to dashboard</router-link>
      </div>
    </header>

    <div class="col-order">
      <span>Column order (click to move left):</span>
      <button
        v-for="(colId, idx) in columnOrder"
        :key="colId"
        type="button"
        class="col-chip"
        @click="moveColumn(idx)"
      >{{ colLabel(colId) }}</button>
    </div>

    <div v-if="loading" class="empty">Loading…</div>
    <div v-else-if="error" class="empty err">{{ error }}</div>
    <table v-else class="po-table">
      <thead>
        <tr>
          <th v-for="colId in columnOrder" :key="colId">{{ colLabel(colId) }}</th>
          <th>Status</th>
          <th>Details</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!items.length">
          <td :colspan="columnOrder.length + 3" class="empty">No upcoming planned outs.</td>
        </tr>
        <tr v-for="row in items" :key="row.id">
          <td v-for="colId in columnOrder" :key="`${row.id}-${colId}`">{{ cellValue(row, colId) }}</td>
          <td><span class="status" :class="row.status">{{ statusLabel(row.status) }}</span></td>
          <td class="details">{{ row.details || row.admin_comment || '—' }}</td>
          <td class="actions">
            <button v-if="canDelete(row)" type="button" class="link" @click="remove(row)">Delete</button>
            <template v-if="canReview">
              <button type="button" class="link" @click="review(row, 'approve')">Approve</button>
              <button type="button" class="link danger" @click="review(row, 'reject')">Reject</button>
              <button type="button" class="link warn" @click="review(row, 'revision')">Revise</button>
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <PlannedOutModal
      v-if="showModal && agencyId"
      :agency-id="agencyId"
      @close="showModal = false"
      @created="load"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import PlannedOutModal from '../../components/admin/opsDashboard/PlannedOutModal.vue';
import {
  PLANNED_OUT_COLUMNS,
  cellValue,
  loadColumnOrder,
  saveColumnOrder,
  statusLabel
} from '../../utils/plannedOuts';

const route = useRoute();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const loading = ref(true);
const error = ref('');
const items = ref([]);
const showModal = ref(false);
const columnOrder = ref(loadColumnOrder());

const agencyId = computed(() => {
  const n = Number(agencyStore.currentAgency?.id);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const slug = computed(() => (
  typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : ''
));
const backTo = computed(() => (slug.value ? `/${slug.value}/admin` : '/admin'));

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
  if (!agencyId.value) {
    items.value = [];
    loading.value = false;
    error.value = 'Select an organization first.';
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    const res = await api.get('/planned-outs', {
      params: { agencyId: agencyId.value, upcomingOnly: 1, limit: 200 },
      skipGlobalLoading: true
    });
    items.value = Array.isArray(res.data?.plannedOuts) ? res.data.plannedOuts : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load';
    items.value = [];
  } finally {
    loading.value = false;
  }
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

watch(agencyId, () => load());
onMounted(load);
</script>

<style scoped>
.po-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 16px 40px;
}
.po-page-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.po-page-head h1 {
  margin: 0;
  color: var(--ops-primary, #1f6b4a);
  font-size: 1.6rem;
}
.po-page-head p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.95rem;
}
.po-page-actions { display: flex; gap: 8px; align-items: flex-start; }
.btn {
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
  cursor: pointer;
}
.btn.primary {
  background: var(--ops-primary, #1f6b4a);
  color: #fff;
  border-color: transparent;
}
.col-order {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 12px;
  font-size: 12px;
  color: #64748b;
  font-weight: 600;
}
.col-chip {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.po-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}
.po-table th, .po-table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
  vertical-align: top;
}
.po-table th {
  background: #f8fafc;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}
.status {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 999px;
  background: #f1f5f9;
}
.status.approved { background: #dcfce7; color: #166534; }
.status.rejected { background: #fee2e2; color: #b91c1c; }
.status.revision { background: #ffedd5; color: #c2410c; }
.details { color: #64748b; max-width: 220px; }
.actions { white-space: nowrap; }
.link {
  border: none;
  background: none;
  color: var(--ops-primary, #1f6b4a);
  font-weight: 700;
  font-size: 12px;
  cursor: pointer;
  margin-right: 6px;
}
.link.danger { color: #b91c1c; }
.link.warn { color: #c2410c; }
.empty { color: #94a3b8; padding: 16px 0; }
.empty.err { color: #b91c1c; }
</style>
