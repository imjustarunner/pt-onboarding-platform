<template>
  <div class="catalog-page">
    <div class="page-header">
      <h1>Provider Settings</h1>
      <p class="page-description">Manage provider credentials and credential → insurance eligibility.</p>
    </div>

    <div v-if="!agencyId" class="empty-state">
      <p>Select an agency first.</p>
    </div>

    <div v-else class="panel">
      <div class="panel-actions">
        <button class="btn btn-primary" @click="addCredential">Add Credential</button>
        <button class="btn btn-secondary" @click="reload" :disabled="loading">Refresh</button>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error">{{ error }}</div>

      <div v-else class="grid">
        <div class="card">
          <h2>Credentials</h2>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th style="width: 200px;">Key</th>
                  <th>Label</th>
                  <th style="width: 110px;">Active</th>
                  <th style="width: 160px;"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in credentials" :key="c.__key">
                  <td><input v-model="c.key" class="input" /></td>
                  <td><input v-model="c.label" class="input" /></td>
                  <td>
                    <label class="toggle">
                      <input type="checkbox" v-model="c.is_active" />
                      <span> </span>
                    </label>
                  </td>
                  <td class="actions">
                    <button class="btn btn-primary btn-sm" @click="saveCredential(c)" :disabled="savingCredentialIds.has(c.__key)">
                      {{ savingCredentialIds.has(c.__key) ? 'Saving…' : 'Save' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <h2>Eligibility Matrix</h2>
          <p class="hint">Toggle which insurances each credential can accept.</p>
          <div v-if="matrix.credentials.length === 0 || matrix.insurances.length === 0" class="empty-state">
            <p>Add at least one active credential and one active insurance type.</p>
          </div>
          <div v-else class="table-wrap">
            <table class="matrix">
              <thead>
                <tr>
                  <th>Credential</th>
                  <th v-for="ins in matrix.insurances" :key="ins.id">{{ ins.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="cred in matrix.credentials" :key="cred.id">
                  <td class="matrix-row-label">{{ cred.label }}</td>
                  <td v-for="ins in matrix.insurances" :key="ins.id" class="matrix-cell">
                    <input
                      type="checkbox"
                      :checked="isEligible(cred.id, ins.id)"
                      @change="toggleEligibility(cred.id, ins.id, $event.target.checked)"
                      :disabled="eligibilitySavingKey === `${cred.id}-${ins.id}`"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();

const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const loading = ref(false);
const error = ref('');

const credentials = ref([]);
const savingCredentialIds = ref(new Set());

const matrix = ref({ credentials: [], insurances: [], eligibility: {} });
const eligibilitySavingKey = ref('');

const reload = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';

    const [credResp, matrixResp] = await Promise.all([
      api.get('/provider-settings/credentials', { params: { agencyId: agencyId.value } }),
      api.get('/provider-settings/credential-insurance', { params: { agencyId: agencyId.value } })
    ]);

    credentials.value = (credResp.data || []).map(c => ({
      __key: String(c.id),
      id: c.id,
      key: c.credential_key || '',
      label: c.label || '',
      is_active: !!c.is_active
    }));

    matrix.value = matrixResp.data || { credentials: [], insurances: [], eligibility: {} };
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load provider settings';
  } finally {
    loading.value = false;
  }
};

const addCredential = () => {
  credentials.value.unshift({
    __key: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    id: null,
    key: '',
    label: '',
    is_active: true
  });
};

const saveCredential = async (cred) => {
  if (!agencyId.value) return;
  const key = String(cred.key || '').trim();
  const label = String(cred.label || '').trim();
  if (!key || !label) {
    error.value = 'Key and label are required.';
    return;
  }
  try {
    error.value = '';
    savingCredentialIds.value.add(cred.__key);
    const payload = { agencyId: agencyId.value, id: cred.id, credentialKey: key, label, isActive: cred.is_active };
    const resp = cred.id
      ? await api.put(`/provider-settings/credentials/${cred.id}`, payload)
      : await api.post('/provider-settings/credentials', payload);
    const saved = resp.data;
    cred.id = saved?.id || cred.id;
    cred.__key = String(cred.id || cred.__key);
    cred.key = saved?.credential_key || cred.key;
    cred.label = saved?.label || cred.label;
    cred.is_active = saved?.is_active !== undefined ? !!saved.is_active : cred.is_active;
    await reload();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save';
  } finally {
    savingCredentialIds.value.delete(cred.__key);
  }
};

const isEligible = (credentialId, insuranceId) => {
  return !!(matrix.value.eligibility?.[credentialId]?.[insuranceId]);
};

const toggleEligibility = async (credentialId, insuranceId, checked) => {
  if (!agencyId.value) return;
  const key = `${credentialId}-${insuranceId}`;
  try {
    eligibilitySavingKey.value = key;
    await api.post('/provider-settings/credential-insurance', {
      agencyId: agencyId.value,
      credentialId,
      insuranceTypeId: insuranceId,
      isAllowed: checked
    });
    if (!matrix.value.eligibility[credentialId]) matrix.value.eligibility[credentialId] = {};
    matrix.value.eligibility[credentialId][insuranceId] = checked;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update eligibility';
  } finally {
    eligibilitySavingKey.value = '';
  }
};

onMounted(async () => {
  if (!agencyStore.currentAgency) {
    await agencyStore.fetchUserAgencies();
  }
  await reload();
});

watch(agencyId, async () => {
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
.panel-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 1100px) {
  .grid {
    grid-template-columns: 1fr 1.2fr;
  }
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg);
}
.card h2 {
  margin: 0 0 10px;
  font-size: 16px;
}
.hint {
  margin: -6px 0 10px;
  color: var(--text-secondary);
  font-size: 13px;
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
  background: var(--card-bg);
  color: var(--text-primary);
}
.actions {
  text-align: right;
}
.matrix {
  width: 100%;
  border-collapse: collapse;
}
.matrix th,
.matrix td {
  border-bottom: 1px solid var(--border);
  padding: 8px;
  text-align: center;
}
.matrix th:first-child,
.matrix td:first-child {
  text-align: left;
}
.matrix-row-label {
  font-weight: 600;
}
.matrix-cell {
  min-width: 90px;
}
.loading {
  padding: 12px;
}
.error {
  color: var(--danger);
  padding: 12px 0;
}
.empty-state {
  padding: 12px;
  color: var(--text-secondary);
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>

