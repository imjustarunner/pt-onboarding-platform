<template>
  <details class="termination-outcomes" @toggle="onToggle">
    <summary>Termination outcomes</summary>
    <p v-if="loading">Loading outcomes…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <template v-else>
      <p>{{ scope === 'practice' ? 'Practice' : 'Your' }} signed termination notes: {{ total }} · Treatment goals achieved: {{ achieved }}</p>
      <table v-if="rows.length">
        <thead><tr><th>Provider</th><th>Reason</th><th>Completed</th></tr></thead>
        <tbody><tr v-for="row in rows" :key="`${row.provider_user_id}-${row.reason}`">
          <td>{{ row.provider_name || 'Provider' }}</td><td>{{ reasonLabels[row.reason] || row.reason }}</td><td>{{ row.count }}</td>
        </tr></tbody>
      </table>
      <p v-else>No signed termination outcomes recorded yet.</p>
    </template>
  </details>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: Number, default: null } });
const rows = ref([]);
const scope = ref('provider');
const loading = ref(false);
const error = ref('');
const open = ref(false);
const reasonLabels = { goals_achieved: 'Treatment goals achieved', client_choice: 'Client choice', lost_contact: 'Lost contact', transfer: 'Transfer', lack_of_progress: 'Lack of progress', other: 'Other' };
const total = computed(() => rows.value.reduce((sum, row) => sum + Number(row.count), 0));
const achieved = computed(() => rows.value.filter((row) => row.reason === 'goals_achieved').reduce((sum, row) => sum + Number(row.count), 0));
let request = 0;
async function load() {
  const current = ++request;
  rows.value = [];
  error.value = '';
  if (!props.agencyId) return;
  loading.value = true;
  try {
    const { data } = await api.get('/clinical-notes/termination-outcomes', { params: { agencyId: props.agencyId }, skipGlobalLoading: true });
    if (current !== request) return;
    rows.value = data.outcomes || [];
    scope.value = data.scope;
  } catch (e) {
    if (current === request) error.value = e.response?.data?.error?.message || 'Could not load termination outcomes.';
  } finally { if (current === request) loading.value = false; }
}
function onToggle(event) { open.value = event.target.open; if (open.value) load(); }
watch(() => props.agencyId, () => { rows.value = []; if (open.value) load(); });
</script>

<style scoped>
.termination-outcomes { margin: 8px 24px; padding: 12px; border: 1px solid var(--border, #ddd); border-radius: 8px; }
summary { cursor: pointer; font-weight: 600; }
table { width: 100%; text-align: left; border-collapse: collapse; }
th, td { padding: 8px; border-bottom: 1px solid var(--border, #ddd); }
</style>
