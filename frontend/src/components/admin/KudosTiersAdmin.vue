<template>
  <div class="kudos-tiers-admin">
    <!-- Pending peer kudos (admin approval) -->
    <div v-if="pendingCount > 0" class="pending-section">
      <div class="section-header">
        <h4 style="margin: 0 0 8px 0;">Pending kudos ({{ pendingCount }})</h4>
        <p class="section-description">
          Peer kudos require admin approval before points are awarded.
        </p>
      </div>
      <div v-if="pendingLoading" class="muted">Loading…</div>
      <div v-else class="pending-list">
        <div
          v-for="k in pendingKudos"
          :key="k.id"
          class="pending-item"
        >
          <div class="pending-meta">
            <strong>{{ k.fromName }}</strong> → <strong>{{ k.toName }}</strong>
            <span class="pending-date">{{ formatDate(k.createdAt) }}</span>
          </div>
          <div class="pending-reason">{{ k.reason }}</div>
          <div class="pending-actions">
            <button type="button" class="btn btn-primary btn-sm" @click="approve(k.id)" :disabled="actionId === k.id">
              Approve
            </button>
            <button type="button" class="btn btn-danger btn-sm" @click="reject(k.id)" :disabled="actionId === k.id">
              Reject
            </button>
          </div>
        </div>
      </div>
      <div class="form-divider"></div>
    </div>

    <div class="section-header">
      <h4 style="margin: 0 0 8px 0;">Kudos reward tiers</h4>
      <p class="section-description">
        Configure reward tiers based on kudos points. When staff reach a threshold, they become eligible for the reward.
      </p>
    </div>
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <div class="tiers-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Tier name</th>
              <th>Points threshold</th>
              <th>Reward description</th>
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tiers" :key="t.id">
              <td>{{ t.tier_name }}</td>
              <td>{{ t.points_threshold }}</td>
              <td class="desc-cell">{{ t.reward_description || '—' }}</td>
              <td class="right">
                <button type="button" class="btn btn-secondary btn-sm" @click="startEdit(t)" :disabled="savingId === t.id">
                  Edit
                </button>
                <button type="button" class="btn btn-danger btn-sm" @click="confirmDelete(t)" :disabled="savingId === t.id">
                  Delete
                </button>
              </td>
            </tr>
            <tr v-if="!tiers.length">
              <td colspan="4" class="empty-state-inline">No tiers yet. Add one below.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="form-divider">
        <h5 style="margin: 0 0 12px 0;">{{ editingId ? 'Edit tier' : 'Add tier' }}</h5>
        <div class="form-row">
          <div class="form-group flex-grow">
            <label>Tier name</label>
            <input v-model="form.tierName" type="text" class="input" placeholder="e.g. Bronze, Silver, Gold" />
          </div>
          <div class="form-group" style="max-width: 140px;">
            <label>Points threshold</label>
            <input v-model.number="form.pointsThreshold" type="number" class="input" min="0" placeholder="0" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group flex-grow">
            <label>Reward description</label>
            <input v-model="form.rewardDescription" type="text" class="input" placeholder="e.g. $25 gift card, extra PTO day" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Sort order</label>
            <input v-model.number="form.sortOrder" type="number" class="input" min="0" />
          </div>
        </div>
        <div class="form-actions">
          <button v-if="editingId" type="button" class="btn btn-secondary" @click="cancelEdit">Cancel</button>
          <button type="button" class="btn btn-primary" @click="saveTier" :disabled="saving">
            {{ saving ? 'Saving…' : (editingId ? 'Update' : 'Add') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: {
    type: [Number, String],
    required: true
  }
});

const tiers = ref([]);
const loading = ref(false);
const error = ref('');
const saving = ref(false);
const savingId = ref(null);
const editingId = ref(null);
const pendingKudos = ref([]);
const pendingCount = ref(0);
const pendingLoading = ref(false);
const actionId = ref(null);

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const fetchPending = async () => {
  if (!props.agencyId) return;
  pendingLoading.value = true;
  try {
    const res = await api.get('/kudos/pending', { params: { agencyId: props.agencyId, limit: 50 } });
    pendingKudos.value = res.data?.kudos || [];
    pendingCount.value = res.data?.totalCount ?? 0;
  } catch {
    pendingKudos.value = [];
    pendingCount.value = 0;
  } finally {
    pendingLoading.value = false;
  }
};

const approve = async (id) => {
  actionId.value = id;
  try {
    await api.post(`/kudos/${id}/approve`);
    await fetchPending();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to approve';
  } finally {
    actionId.value = null;
  }
};

const reject = async (id) => {
  if (!window.confirm('Reject this kudos? The recipient will not receive points.')) return;
  actionId.value = id;
  try {
    await api.post(`/kudos/${id}/reject`);
    await fetchPending();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to reject';
  } finally {
    actionId.value = null;
  }
};
const form = ref({
  tierName: '',
  pointsThreshold: 0,
  rewardDescription: '',
  sortOrder: 0
});

const fetchTiers = async () => {
  if (!props.agencyId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/kudos/tiers', { params: { agencyId: props.agencyId } });
    tiers.value = res.data?.tiers || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load tiers';
    tiers.value = [];
  } finally {
    loading.value = false;
  }
};

const startEdit = (t) => {
  editingId.value = t.id;
  form.value = {
    tierName: t.tier_name || '',
    pointsThreshold: t.points_threshold ?? 0,
    rewardDescription: t.reward_description || '',
    sortOrder: t.sort_order ?? 0
  };
};

const cancelEdit = () => {
  editingId.value = null;
  form.value = { tierName: '', pointsThreshold: 0, rewardDescription: '', sortOrder: 0 };
};

const saveTier = async () => {
  const { tierName, pointsThreshold, rewardDescription, sortOrder } = form.value;
  if (!tierName || !Number.isFinite(pointsThreshold) || pointsThreshold < 0) {
    error.value = 'Tier name and points threshold (>= 0) are required';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    if (editingId.value) {
      await api.put(`/kudos/tiers/${editingId.value}`, {
        tierName,
        pointsThreshold,
        rewardDescription: rewardDescription || null,
        sortOrder
      });
    } else {
      await api.post('/kudos/tiers', {
        agencyId: props.agencyId,
        tierName,
        pointsThreshold,
        rewardDescription: rewardDescription || null,
        sortOrder
      });
    }
    await fetchTiers();
    cancelEdit();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
};

const confirmDelete = async (t) => {
  if (!window.confirm(`Delete tier "${t.tier_name}"?`)) return;
  savingId.value = t.id;
  try {
    await api.delete(`/kudos/tiers/${t.id}`);
    await fetchTiers();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to delete';
  } finally {
    savingId.value = null;
  }
};

watch(() => props.agencyId, (id) => {
  fetchTiers();
  fetchPending();
}, { immediate: true });
</script>

<style scoped>
.pending-section {
  margin-bottom: 24px;
}

.pending-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pending-item {
  padding: 12px 16px;
  border: 1px solid var(--gray-200, #e5e7eb);
  border-radius: 8px;
  background: #fff;
}

.pending-meta {
  margin-bottom: 6px;
}

.pending-date {
  margin-left: 8px;
  font-size: 0.85rem;
  color: var(--muted, #666);
}

.pending-reason {
  font-size: 0.95rem;
  color: var(--gray-700, #374151);
  margin-bottom: 10px;
}

.pending-actions {
  display: flex;
  gap: 8px;
}

.desc-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
