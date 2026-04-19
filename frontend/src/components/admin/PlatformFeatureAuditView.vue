<template>
  <div class="audit-view">
    <header class="audit-header">
      <div>
        <h2>Feature audit log</h2>
        <p class="muted">
          Every tenant- and user-level enable/disable event with actor and timestamp. Use the filters below to narrow
          results when investigating a billing question or a privilege change.
        </p>
      </div>
    </header>

    <div class="filters">
      <label>
        <span>Scope</span>
        <select v-model="scope" @change="reload">
          <option value="tenant">Tenant events</option>
          <option value="user">User events</option>
        </select>
      </label>
      <label>
        <span>Tenant</span>
        <select v-model.number="agencyId" @change="reload">
          <option :value="0">All</option>
          <option v-for="a in agencies" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </label>
      <label>
        <span>Feature key</span>
        <input v-model="featureKey" placeholder="e.g. gamesPlatformEnabled" @keyup.enter="reload" />
      </label>
      <label v-if="scope === 'user'">
        <span>User ID</span>
        <input v-model.number="userId" type="number" min="0" @keyup.enter="reload" />
      </label>
      <button type="button" class="btn-primary" @click="reload" :disabled="loading">
        {{ loading ? 'Loading…' : 'Search' }}
      </button>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div class="table-wrap">
      <table class="audit-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Tenant</th>
            <th v-if="scope === 'user'">User</th>
            <th>Feature</th>
            <th>Event</th>
            <th>Actor</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ev in events" :key="ev.id">
            <td class="nowrap">{{ formatDate(ev.effective_at) }}</td>
            <td>{{ tenantNameFor(ev.agency_id) }}</td>
            <td v-if="scope === 'user'">
              <div>{{ formatTargetName(ev) }}</div>
              <div class="muted small">#{{ ev.user_id }}</div>
            </td>
            <td><code class="key">{{ ev.feature_key }}</code></td>
            <td>
              <span class="event-badge" :class="ev.event_type">{{ ev.event_type }}</span>
            </td>
            <td>
              <div>{{ formatActorName(ev) }}</div>
              <div v-if="ev.actor_role" class="muted small">{{ ev.actor_role }}</div>
            </td>
            <td class="notes">{{ ev.notes || '—' }}</td>
          </tr>
          <tr v-if="!events.length && !loading">
            <td :colspan="scope === 'user' ? 7 : 6" class="empty">No events match your filters.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const scope = ref('tenant');
const agencyId = ref(0);
const featureKey = ref('');
const userId = ref(null);
const events = ref([]);
const agencies = ref([]);
const loading = ref(false);
const error = ref('');

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString();
}

function tenantNameFor(id) {
  const found = agencies.value.find((a) => Number(a.id) === Number(id));
  return found ? found.name : `#${id}`;
}

function formatTargetName(ev) {
  const parts = [ev.target_first_name, ev.target_last_name].filter(Boolean).join(' ').trim();
  if (parts) return parts;
  return ev.target_email || `User ${ev.user_id}`;
}

function formatActorName(ev) {
  const parts = [ev.actor_first_name, ev.actor_last_name].filter(Boolean).join(' ').trim();
  if (parts) return parts;
  return ev.actor_email || (ev.actor_user_id ? `User ${ev.actor_user_id}` : 'system');
}

async function loadAgencies() {
  try {
    const res = await api.get('/agencies', { params: { all: true } });
    const list = Array.isArray(res.data) ? res.data : (res.data?.agencies || []);
    agencies.value = list.map((a) => ({ id: a.id, name: a.name || a.slug || `#${a.id}` }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } catch {
    agencies.value = [];
  }
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    const params = {};
    if (agencyId.value) params.agencyId = agencyId.value;
    if (featureKey.value) params.featureKey = featureKey.value;
    if (scope.value === 'user' && userId.value) params.userId = userId.value;
    const path = scope.value === 'tenant' ? '/billing/audit/tenant' : '/billing/audit/user';
    if (scope.value === 'tenant' && !params.agencyId) {
      events.value = [];
      error.value = 'Pick a tenant to view tenant events.';
      return;
    }
    const res = await api.get(path, { params });
    events.value = res.data?.events || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load audit events';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadAgencies();
});
</script>

<style scoped>
.audit-view { padding: 16px 4px 24px; max-width: 1200px; }
.audit-header h2 { margin: 0 0 6px 0; }
.muted { color: var(--text-secondary, #6b7280); font-size: 13px; }
.muted.small { font-size: 11px; }
.filters { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; margin: 14px 0; }
.filters label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #4b5563; }
.filters input, .filters select {
  padding: 6px 8px; border: 1px solid var(--border, #d1d5db); border-radius: 6px;
  font-size: 13px; min-width: 160px;
}
.btn-primary {
  background: var(--primary, #059669); color: white; border: none; padding: 8px 14px; border-radius: 8px;
  font-weight: 600; cursor: pointer;
}
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.error-banner {
  background: #fee2e2; color: #991b1b; padding: 10px 12px; border-radius: 8px;
  margin: 8px 0; font-size: 13px;
}
.table-wrap { overflow-x: auto; border: 1px solid var(--border, #e5e7eb); border-radius: 10px; }
.audit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.audit-table th, .audit-table td {
  padding: 8px 12px; border-bottom: 1px solid var(--border, #e5e7eb); text-align: left; vertical-align: top;
}
.audit-table th {
  background: #f9fafb; font-weight: 600; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.04em; color: #6b7280;
}
.audit-table tr:last-child td { border-bottom: none; }
.audit-table .nowrap { white-space: nowrap; }
.audit-table .notes { max-width: 300px; }
.audit-table .empty { text-align: center; color: #9ca3af; padding: 16px; }
.event-badge {
  display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px;
  font-weight: 600; text-transform: uppercase;
}
.event-badge.enabled { background: #dcfce7; color: #166534; }
.event-badge.disabled { background: #fee2e2; color: #991b1b; }
.key { background: #f3f4f6; padding: 1px 6px; border-radius: 4px; font-size: 11px; color: #4b5563; }
</style>
