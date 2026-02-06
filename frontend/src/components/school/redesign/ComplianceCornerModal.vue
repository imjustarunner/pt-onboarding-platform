<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <div>
          <h2>Compliance Corner</h2>
          <div class="muted">Audit inquiry for this school’s access logs.</div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('close')">Close</button>
      </div>

      <div class="modal-body">
        <div class="query-row">
          <input
            v-model="query"
            class="input"
            type="text"
            placeholder="e.g., Last 10 access log entries for provider Taylor in this school"
            @keydown.enter.prevent="runQuery"
          />
          <button class="btn btn-primary" type="button" @click="runQuery" :disabled="loading || !query.trim()">
            {{ loading ? 'Searching…' : 'Search' }}
          </button>
        </div>
        <div v-if="error" class="error">{{ error }}</div>

        <div v-if="results.length > 0" class="filters-row">
          <input
            v-model="quickFilter"
            class="input"
            type="text"
            placeholder="Quick filter results (client, provider, action)"
          />
          <div class="muted-small">Showing {{ filteredResults.length }} of {{ results.length }}</div>
        </div>

        <div v-if="loading" class="muted">Loading…</div>
        <div v-else-if="results.length === 0" class="empty">No results yet.</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Provider/User</th>
                <th>Role</th>
                <th>Client</th>
                <th>Action</th>
                <th>Route</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredResults" :key="row.id">
                <td class="mono">{{ formatWhen(row.created_at) }}</td>
                <td>{{ formatUser(row) }}</td>
                <td>{{ formatRole(row.user_role) }}</td>
                <td>{{ formatClient(row) }}</td>
                <td>{{ row.action || '—' }}</td>
                <td class="mono">{{ row.route || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import api from '../../../services/api';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true }
});
defineEmits(['close']);

const query = ref('Last 10 access logs for this school');
const quickFilter = ref('');
const loading = ref(false);
const error = ref('');
const results = ref([]);

const runQuery = async () => {
  if (!props.schoolOrganizationId || !query.value.trim()) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.post(`/school-portal/${props.schoolOrganizationId}/compliance-corner/query`, {
      query: query.value.trim()
    });
    results.value = Array.isArray(r.data?.results) ? r.data.results : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to run compliance query';
    results.value = [];
  } finally {
    loading.value = false;
  }
};

const filteredResults = computed(() => {
  const list = results.value || [];
  const q = String(quickFilter.value || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((row) => {
    const bits = [
      row.user_first_name,
      row.user_last_name,
      row.user_email,
      row.user_role,
      row.client_initials,
      row.client_identifier_code,
      row.action,
      row.route
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return bits.includes(q);
  });
});

const formatWhen = (ts) => {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || '');
  }
};

const formatUser = (row) => {
  const fn = String(row.user_first_name || '').trim();
  const ln = String(row.user_last_name || '').trim();
  const name = [fn, ln].filter(Boolean).join(' ').trim();
  return name || row.user_email || `User #${row.user_id}`;
};

const formatRole = (role) => String(role || '—').replace(/_/g, ' ');

const formatClient = (row) => {
  const code = String(row.client_identifier_code || '').trim();
  const initials = String(row.client_initials || '').trim();
  return code || initials || `Client #${row.client_id}`;
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.modal {
  width: min(980px, 94vw);
  max-height: 88vh;
  background: #fff;
  border-radius: 14px;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-header {
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.modal-header h2 {
  margin: 0;
}
.modal-body {
  padding: 16px 18px 18px;
  overflow: auto;
  display: grid;
  gap: 12px;
}
.query-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}
.filters-row {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}
.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
}
.muted {
  color: var(--text-secondary);
}
.muted-small {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}
.error {
  color: #c33;
  font-weight: 700;
}
.empty {
  color: var(--text-secondary);
  padding: 8px 2px;
}
.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
}
.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-size: 13px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-weight: 700;
  font-size: 12px;
}
@media (max-width: 720px) {
  .query-row {
    grid-template-columns: 1fr;
  }
  .filters-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
