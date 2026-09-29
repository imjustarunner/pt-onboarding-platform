<template>
  <section class="supervision-history" aria-labelledby="supervision-history-title">
    <h4 id="supervision-history-title">Past supervisors</h4>
    <p class="muted">Previous assignments are retained for reference and do not grant current supervisor access.</p>
    <p v-if="loading" role="status">Loading supervision history…</p>
    <div v-else-if="error" role="alert">
      {{ error }} <button type="button" class="btn btn-secondary btn-sm" @click="fetchHistory">Retry</button>
    </div>
    <p v-else-if="!history.length" class="muted">No past supervisor assignments recorded.</p>
    <ul v-else class="history-list">
      <li v-for="assignment in history" :key="assignment.id">
        <strong>{{ assignment.supervisor_name || `User #${assignment.supervisor_id}` }}</strong>
        <span>{{ supervisorTypeLabel(assignment.supervisor_type) }} · {{ assignment.agency_name }}</span>
        <span v-if="Number(assignment.is_primary) === 1">Primary supervisor</span>
        <small>Assigned {{ formatDate(assignment.assigned_at) }} · Ended {{ formatDate(assignment.ended_at) }}</small>
        <small>{{ reasonLabel(assignment.end_reason) }}</small>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import api from '../../services/api';
import { supervisorTypeLabel } from '../../constants/supervisorTypes.js';

const props = defineProps({ userId: { type: Number, required: true }, agencyId: { type: [Number, String], default: null }, refreshKey: { type: Number, default: 0 } });
const history = ref([]);
const loading = ref(false);
const error = ref('');
let requestId = 0;
const formatDate = (value) => value ? new Date(value).toLocaleDateString() : 'Unknown';
const reasonLabel = (reason) => ({ account_inactive: 'Account marked inactive or archived', reassigned: 'Supervisor reassigned', unassigned: 'Assignment removed' })[reason] || 'Assignment ended';
const fetchHistory = async () => {
  const current = ++requestId;
  history.value = [];
  error.value = '';
  loading.value = true;
  try {
    const { data } = await api.get(`/supervisor-assignments/supervisee/${props.userId}/history`, { params: { agencyId: props.agencyId || undefined } });
    if (current === requestId) history.value = data || [];
  } catch (err) {
    if (current === requestId) error.value = err.response?.data?.error?.message || 'Unable to load supervision history.';
  } finally {
    if (current === requestId) loading.value = false;
  }
};
watch(() => [props.userId, props.agencyId, props.refreshKey], fetchHistory, { immediate: true });
onBeforeUnmount(() => { requestId += 1; });
</script>

<style scoped>
.supervision-history { margin: 24px 0; padding-top: 16px; border-top: 1px solid var(--border); }
h4 { margin: 0 0 8px; }
.muted, small { color: var(--text-secondary); font-size: 13px; }
.history-list { display: grid; gap: 10px; list-style: none; padding: 0; }
.history-list li { display: flex; flex-direction: column; gap: 5px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-secondary); overflow-wrap: anywhere; }
</style>
