<template>
  <div class="container compliance-corner-view">
    <div class="header-row">
      <div>
        <h1>Compliance Corner</h1>
        <p class="muted">Admin inquiry for school access logs and pending client compliance.</p>
      </div>
      <div class="counter-card">
        <div class="counter-label">Pending compliance</div>
        <div class="counter-value">{{ pendingCount }}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">School selection</div>
      <div class="panel-row">
        <label class="field">
          <span class="label">School</span>
          <select v-model="selectedOrgId" class="select">
            <option :value="null">Select a school…</option>
            <option v-for="s in schools" :key="s.id" :value="Number(s.id)">
              {{ s.name }}
            </option>
          </select>
        </label>
        <div v-if="loadingSchools" class="muted">Loading schools…</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Gemini inquiry</div>
      <div class="panel-row panel-row-wrap">
        <input
          v-model="geminiQuery"
          class="input"
          type="text"
          placeholder="e.g., Last 10 access log entries for provider Taylor at this school"
          @keydown.enter.prevent="runGeminiQuery"
        />
        <button class="btn btn-primary" type="button" @click="runGeminiQuery" :disabled="geminiLoading || !canQuery">
          {{ geminiLoading ? 'Searching…' : 'Search' }}
        </button>
        <div class="muted-small" v-if="geminiResults.length">Results: {{ geminiResults.length }}</div>
      </div>
      <div v-if="geminiError" class="error">{{ geminiError }}</div>
      <div v-if="geminiResults.length" class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Role</th>
              <th>Client</th>
              <th>Action</th>
              <th>Route</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in geminiResults" :key="row.id">
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

    <div class="panel">
      <div class="panel-title">Pending compliance list</div>
      <div class="panel-row panel-row-wrap">
        <button class="btn btn-secondary" type="button" @click="loadPendingList" :disabled="pendingLoading || !canQuery">
          {{ pendingLoading ? 'Loading…' : 'Load pending list' }}
        </button>
        <div class="muted-small" v-if="pendingResults.length">Clients: {{ pendingResults.length }}</div>
      </div>
      <div v-if="pendingError" class="error">{{ pendingError }}</div>
      <div v-if="pendingResults.length" class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>School</th>
              <th>Provider</th>
              <th>Days since assigned</th>
              <th>Checklist missing</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pendingResults" :key="`${row.client_id}-${row.provider_user_id}-${row.organization_id}`">
              <td>{{ formatClientLabel(row) }}</td>
              <td>{{ row.organization_name || '—' }}</td>
              <td>{{ formatProvider(row) }}</td>
              <td class="mono">{{ Number(row.days_since_assigned || 0) }}</td>
              <td>{{ (row.missing_checklist || []).join(', ') || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const schools = ref([]);
const loadingSchools = ref(false);
const selectedOrgId = ref(null);

const geminiQuery = ref('Last 10 access logs for this school');
const geminiResults = ref([]);
const geminiLoading = ref(false);
const geminiError = ref('');

const pendingResults = ref([]);
const pendingLoading = ref(false);
const pendingError = ref('');
const pendingCount = computed(() => Number(pendingResults.value?.length || 0));

const canQuery = computed(() => Number(selectedOrgId.value || 0) > 0);

const loadSchools = async () => {
  try {
    loadingSchools.value = true;
    const r = await api.get('/agencies');
    const list = Array.isArray(r.data) ? r.data : [];
    schools.value = list.filter((o) => String(o?.organization_type || '').toLowerCase() === 'school');
    if (!selectedOrgId.value && schools.value.length > 0) {
      selectedOrgId.value = Number(schools.value[0].id);
    }
  } catch {
    schools.value = [];
  } finally {
    loadingSchools.value = false;
  }
};

const runGeminiQuery = async () => {
  if (!canQuery.value) return;
  geminiLoading.value = true;
  geminiError.value = '';
  geminiResults.value = [];
  try {
    const r = await api.post(`/school-portal/${selectedOrgId.value}/compliance-corner/query`, {
      query: geminiQuery.value.trim()
    });
    geminiResults.value = Array.isArray(r.data?.results) ? r.data.results : [];
  } catch (e) {
    geminiError.value = e.response?.data?.error?.message || 'Failed to run compliance query';
  } finally {
    geminiLoading.value = false;
  }
};

const loadPendingList = async () => {
  if (!canQuery.value) return;
  pendingLoading.value = true;
  pendingError.value = '';
  pendingResults.value = [];
  try {
    const r = await api.get('/compliance-corner/pending-clients', {
      params: { organizationId: Number(selectedOrgId.value) }
    });
    pendingResults.value = Array.isArray(r.data?.results) ? r.data.results : [];
  } catch (e) {
    pendingError.value = e.response?.data?.error?.message || 'Failed to load pending list';
  } finally {
    pendingLoading.value = false;
  }
};

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

const formatClientLabel = (row) => {
  const code = String(row.client_identifier_code || '').trim();
  const initials = String(row.client_initials || '').trim();
  return code || initials || `Client #${row.client_id}`;
};

const formatProvider = (row) => {
  const fn = String(row.provider_first_name || '').trim();
  const ln = String(row.provider_last_name || '').trim();
  const name = [fn, ln].filter(Boolean).join(' ').trim();
  return name || row.provider_email || `User #${row.provider_user_id}`;
};

onMounted(loadSchools);
watch(selectedOrgId, (next) => {
  if (next) loadPendingList();
});
</script>

<style scoped>
.compliance-corner-view {
  display: grid;
  gap: 16px;
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
}
.counter-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 10px 14px;
  min-width: 160px;
}
.counter-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.counter-value {
  font-size: 24px;
  font-weight: 900;
  color: var(--text-primary);
}
.panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: #fff;
  padding: 14px 16px;
  display: grid;
  gap: 10px;
}
.panel-title {
  font-weight: 900;
}
.panel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.panel-row-wrap {
  align-items: flex-end;
}
.field {
  display: grid;
  gap: 6px;
}
.label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.select,
.input {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg);
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
</style>
