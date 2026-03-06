<template>
  <div class="roi-tab">
    <div class="form-section-divider" style="margin-top: 0; margin-bottom: 10px;">
      <h3 style="margin:0;">School ROI Access</h3>
      <div class="hint">
        Active school staff for this client's school are listed below. Only staff with active ROI access can open the client in the school portal.
      </div>
    </div>

    <div class="summary-row">
      <div class="summary-card">
        <div class="summary-k">School</div>
        <div class="summary-v">{{ schoolName }}</div>
      </div>
      <div class="summary-card">
        <div class="summary-k">ROI expires</div>
        <div class="summary-v">{{ roiExpiryLabel }}</div>
      </div>
      <div class="summary-card" :class="{ 'summary-card-alert': roiExpired }">
        <div class="summary-k">Portal status</div>
        <div class="summary-v">{{ roiExpired ? 'Expired / blocked' : 'Date active' }}</div>
      </div>
    </div>

    <div v-if="roiExpired" class="warning-card">
      ROI is expired or missing. School staff remain code-only and blocked until a new packet is uploaded and ROI access is reapproved.
    </div>

    <div v-if="error" class="error" style="margin-bottom: 12px;">{{ error }}</div>
    <div v-if="loading" class="loading">Loading school ROI access…</div>
    <div v-else-if="rows.length === 0" class="empty-state">
      <p>No active school staff found for this school.</p>
    </div>
    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Current state</th>
            <th>Set state</th>
            <th>Last packet upload</th>
            <th>Last ROI grant</th>
            <th class="right"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.school_staff_user_id">
            <td>
              <div>{{ displayName(row) }}</div>
              <div v-if="row.effective_access_state === 'expired'" class="hint">ROI expired</div>
            </td>
            <td>{{ row.email || '—' }}</td>
            <td>
              <span class="state-pill" :class="stateClass(row.effective_access_state)">
                {{ stateLabel(row.effective_access_state, row.access_level) }}
              </span>
            </td>
            <td style="min-width: 180px;">
              <select v-model="draftStates[row.school_staff_user_id]" class="inline-select">
                <option value="none">No access</option>
                <option value="packet">Packet</option>
                <option value="roi">ROI access</option>
              </select>
            </td>
            <td>
              <div>{{ formatDateTime(row.last_packet_uploaded_at) }}</div>
              <div v-if="row.last_packet_uploaded_by_name" class="hint">by {{ row.last_packet_uploaded_by_name }}</div>
            </td>
            <td>
              <div>{{ formatDateTime(row.granted_at) }}</div>
              <div v-if="row.granted_by_name" class="hint">by {{ row.granted_by_name }}</div>
            </td>
            <td class="right" style="white-space: nowrap;">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="savingUserId === row.school_staff_user_id || !isDirty(row)"
                @click="saveRow(row)"
              >
                {{ savingUserId === row.school_staff_user_id ? 'Saving…' : 'Save' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  client: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['updated']);

const loading = ref(false);
const error = ref('');
const rows = ref([]);
const draftStates = ref({});
const savingUserId = ref(null);
const roiExpiresAt = ref(null);
const roiExpired = ref(true);
const schoolName = ref('');

const roiExpiryLabel = computed(() => {
  if (!roiExpiresAt.value) return 'Missing';
  return formatDate(roiExpiresAt.value);
});

const normalizeState = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['none', 'packet', 'roi'].includes(normalized) ? normalized : 'none';
};

const displayName = (row) => {
  const first = String(row?.first_name || '').trim();
  const last = String(row?.last_name || '').trim();
  return [first, last].filter(Boolean).join(' ').trim() || row?.email || `User ${row?.school_staff_user_id || ''}`;
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

const stateLabel = (effectiveState, accessLevel) => {
  const effective = normalizeState(effectiveState === 'expired' ? 'expired' : effectiveState);
  if (effectiveState === 'expired') return 'ROI expired';
  if (effective === 'roi') return 'ROI access';
  if (effective === 'packet' || accessLevel === 'packet') return 'Packet';
  return 'No access';
};

const stateClass = (effectiveState) => {
  const state = String(effectiveState || '').trim().toLowerCase();
  return {
    'state-none': !state || state === 'none',
    'state-packet': state === 'packet',
    'state-roi': state === 'roi',
    'state-expired': state === 'expired'
  };
};

const load = async () => {
  const clientId = Number(props.client?.id || 0);
  if (!clientId) {
    rows.value = [];
    draftStates.value = {};
    return;
  }

  try {
    loading.value = true;
    error.value = '';
    const response = await api.get(`/clients/${clientId}/school-roi-access`);
    const payload = response.data || {};
    rows.value = Array.isArray(payload.staff) ? payload.staff : [];
    roiExpiresAt.value = payload.roi_expires_at || null;
    roiExpired.value = payload.roi_expired !== false;
    schoolName.value = payload.school_name || props.client?.organization_name || '—';
    draftStates.value = rows.value.reduce((acc, row) => {
      acc[row.school_staff_user_id] = normalizeState(row.access_level);
      return acc;
    }, {});
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load school ROI access';
    rows.value = [];
    draftStates.value = {};
  } finally {
    loading.value = false;
  }
};

const isDirty = (row) => normalizeState(draftStates.value[row.school_staff_user_id]) !== normalizeState(row.access_level);

const saveRow = async (row) => {
  const clientId = Number(props.client?.id || 0);
  const schoolStaffUserId = Number(row?.school_staff_user_id || 0);
  if (!clientId || !schoolStaffUserId) return;

  try {
    savingUserId.value = schoolStaffUserId;
    error.value = '';
    const nextState = normalizeState(draftStates.value[schoolStaffUserId]);
    await api.put(`/clients/${clientId}/school-roi-access/${schoolStaffUserId}`, { nextState });
    await load();
    emit('updated', { keepOpen: true });
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to update school ROI access';
  } finally {
    savingUserId.value = null;
  }
};

watch(
  () => props.client?.id,
  () => {
    load();
  },
  { immediate: true }
);
</script>

<style scoped>
.summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.summary-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-alt);
}

.summary-card-alert {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.06);
}

.summary-k {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.summary-v {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.warning-card {
  border: 1px solid rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.08);
  color: #92400e;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 700;
}

.state-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 96px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  border: 1px solid var(--border);
}

.state-none {
  background: rgba(107, 114, 128, 0.08);
  color: #4b5563;
}

.state-packet {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.25);
  color: #1d4ed8;
}

.state-roi {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #047857;
}

.state-expired {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.28);
  color: #b91c1c;
}
</style>
