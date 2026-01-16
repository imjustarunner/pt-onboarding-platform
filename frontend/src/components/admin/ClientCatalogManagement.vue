<template>
  <div class="catalog-page">
    <div class="page-header">
      <h1>Client Settings</h1>
      <p class="page-description">Manage client-facing dropdown values used for bulk upload and client records.</p>
    </div>

    <div class="tabs">
      <button :class="['tab', { active: activeTab === 'client-statuses' }]" @click="activeTab = 'client-statuses'">Client Status</button>
      <button :class="['tab', { active: activeTab === 'paperwork-statuses' }]" @click="activeTab = 'paperwork-statuses'">Paperwork Status</button>
      <button :class="['tab', { active: activeTab === 'insurance-types' }]" @click="activeTab = 'insurance-types'">Insurance Types</button>
    </div>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency first.</p>
    </div>

    <div v-else class="panel">
      <div class="panel-actions">
        <button class="btn btn-primary" @click="addRow">Add</button>
        <button class="btn btn-secondary" @click="reload" :disabled="loading">Refresh</button>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 200px;">Key</th>
              <th style="width: 260px;">Label</th>
              <th v-if="showsDescription">Description</th>
              <th style="width: 110px;">Active</th>
              <th style="width: 160px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.__key">
              <td><input v-model="row.key" class="input" /></td>
              <td><input v-model="row.label" class="input" /></td>
              <td v-if="showsDescription"><input v-model="row.description" class="input" /></td>
              <td>
                <label class="toggle">
                  <input type="checkbox" v-model="row.is_active" />
                  <span> </span>
                </label>
              </td>
              <td class="actions">
                <button class="btn btn-primary btn-sm" @click="saveRow(row)" :disabled="savingIds.has(row.__key)">
                  {{ savingIds.has(row.__key) ? 'Saving…' : 'Save' }}
                </button>
              </td>
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
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();

const activeTab = ref('client-statuses');
const loading = ref(false);
const error = ref('');
const rows = ref([]);
const savingIds = ref(new Set());

const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const showsDescription = computed(() => activeTab.value === 'client-statuses' || activeTab.value === 'paperwork-statuses');

const endpoint = computed(() => {
  if (activeTab.value === 'client-statuses') return '/client-settings/client-statuses';
  if (activeTab.value === 'paperwork-statuses') return '/client-settings/paperwork-statuses';
  return '/client-settings/insurance-types';
});

const hydrate = (data) => {
  rows.value = (data || []).map(r => ({
    __key: String(r.id),
    id: r.id,
    key: r.status_key || r.insurance_key || '',
    label: r.label || '',
    description: r.description || '',
    is_active: !!r.is_active
  }));
};

const reload = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(endpoint.value, { params: { agencyId: agencyId.value } });
    hydrate(resp.data);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load settings';
  } finally {
    loading.value = false;
  }
};

const addRow = () => {
  rows.value.unshift({
    __key: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    id: null,
    key: '',
    label: '',
    description: '',
    is_active: true
  });
};

const saveRow = async (row) => {
  if (!agencyId.value) return;
  const key = String(row.key || '').trim();
  const label = String(row.label || '').trim();
  if (!key || !label) {
    error.value = 'Key and label are required.';
    return;
  }
  try {
    error.value = '';
    savingIds.value.add(row.__key);

    const payload =
      activeTab.value === 'insurance-types'
        ? { agencyId: agencyId.value, id: row.id, insuranceKey: key, label, isActive: row.is_active }
        : { agencyId: agencyId.value, id: row.id, statusKey: key, label, description: row.description, isActive: row.is_active };

    const resp = row.id
      ? await api.put(`${endpoint.value}/${row.id}`, payload)
      : await api.post(endpoint.value, payload);

    // Normalize server response back into our row shape
    const saved = resp.data;
    row.id = saved?.id || row.id;
    row.__key = String(row.id || row.__key);
    row.key = saved?.status_key || saved?.insurance_key || row.key;
    row.label = saved?.label || row.label;
    row.description = saved?.description || row.description;
    row.is_active = saved?.is_active !== undefined ? !!saved.is_active : row.is_active;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save';
  } finally {
    savingIds.value.delete(row.__key);
  }
};

onMounted(async () => {
  if (!agencyStore.currentAgency) {
    await agencyStore.fetchUserAgencies();
  }
  await reload();
});

watch([agencyId, activeTab], async () => {
  await reload();
});
</script>

<style scoped>
.catalog-page {
  width: 100%;
}
.page-header h1 {
  margin: 0;
}
.page-description {
  margin: 8px 0 0;
  color: var(--text-secondary);
}
.tabs {
  display: flex;
  gap: 8px;
  margin: 24px 0 16px;
  border-bottom: 2px solid var(--border);
}
.tab {
  padding: 10px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
}
.tab.active {
  color: var(--primary);
  border-bottom-color: var(--accent);
}
.panel {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.panel-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.table-wrap {
  overflow: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  border-bottom: 1px solid var(--border);
  padding: 10px;
  vertical-align: middle;
}
.input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text-primary);
}
.actions {
  text-align: right;
}
.loading {
  padding: 12px;
}
.error {
  color: var(--danger);
  padding: 12px 0;
}
.empty-state {
  padding: 16px;
  color: var(--text-secondary);
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>

