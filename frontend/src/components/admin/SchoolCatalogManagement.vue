<template>
  <div class="catalog-page">
    <div class="page-header">
      <h1>School Settings</h1>
      <p class="page-description">Manage school-specific dropdown values (e.g., document delivery methods).</p>
    </div>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency first.</p>
    </div>

    <div v-else class="panel">
      <div class="controls">
        <div class="control">
          <label>School</label>
          <select v-model="selectedSchoolId" class="select">
            <option value="">Select…</option>
            <option v-for="s in schools" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
          </select>
        </div>
        <div class="actions">
          <button class="btn btn-primary" @click="addRow" :disabled="!selectedSchoolId">Add</button>
          <button class="btn btn-secondary" @click="reload" :disabled="!selectedSchoolId || loading">Refresh</button>
        </div>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <div v-else-if="!selectedSchoolId" class="empty-state">
        <p>Select a school to manage its document delivery methods.</p>
      </div>

      <div v-else class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 220px;">Key</th>
              <th>Label</th>
              <th style="width: 110px;">Active</th>
              <th style="width: 160px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.__key">
              <td><input v-model="row.key" class="input" /></td>
              <td><input v-model="row.label" class="input" /></td>
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

const loading = ref(false);
const error = ref('');
const schools = ref([]);
const selectedSchoolId = ref('');
const rows = ref([]);
const savingIds = ref(new Set());

const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const loadSchools = async () => {
  if (!agencyId.value) return;
  try {
    const resp = await api.get(`/agencies/${agencyId.value}/schools`);
    schools.value = resp.data || [];
  } catch (e) {
    // Don't block the whole view; show a friendly message in the main error area.
    error.value = e.response?.data?.error?.message || 'Failed to load schools';
  }
};

const hydrate = (data) => {
  rows.value = (data || []).map(r => ({
    __key: String(r.id),
    id: r.id,
    key: r.method_key || '',
    label: r.label || '',
    is_active: !!r.is_active
  }));
};

const reload = async () => {
  if (!agencyId.value || !selectedSchoolId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/school-settings/${selectedSchoolId.value}/paperwork-delivery-methods`, {
      params: { agencyId: agencyId.value }
    });
    hydrate(resp.data);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load delivery methods';
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
    is_active: true
  });
};

const saveRow = async (row) => {
  if (!agencyId.value || !selectedSchoolId.value) return;
  const key = String(row.key || '').trim();
  const label = String(row.label || '').trim();
  if (!key || !label) {
    error.value = 'Key and label are required.';
    return;
  }
  try {
    error.value = '';
    savingIds.value.add(row.__key);
    const payload = { agencyId: agencyId.value, id: row.id, methodKey: key, label, isActive: row.is_active };
    const base = `/school-settings/${selectedSchoolId.value}/paperwork-delivery-methods`;
    const resp = row.id ? await api.put(`${base}/${row.id}`, payload) : await api.post(base, payload);
    const saved = resp.data;
    row.id = saved?.id || row.id;
    row.__key = String(row.id || row.__key);
    row.key = saved?.method_key || row.key;
    row.label = saved?.label || row.label;
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
  await loadSchools();
});

watch([agencyId], async () => {
  selectedSchoolId.value = '';
  rows.value = [];
  await loadSchools();
});

watch(selectedSchoolId, async () => {
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
.panel {
  margin-top: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.controls {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-end;
  margin-bottom: 12px;
}
.control label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.select {
  min-width: 280px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text-primary);
}
.actions {
  display: flex;
  gap: 8px;
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

