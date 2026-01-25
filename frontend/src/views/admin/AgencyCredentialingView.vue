<template>
  <div class="container">
    <div class="page-header">
      <div>
        <router-link :to="orgTo('/admin')" class="back-link">← Back to Admin Dashboard</router-link>
        <h1>Agency Credentialing</h1>
        <div class="muted" style="margin-top: 6px;">
          Edit credentialing fields for active providers and export to CSV.
        </div>
      </div>

      <div class="header-actions" style="display:flex; gap:10px; align-items:center; flex-wrap: wrap;">
        <button class="btn btn-secondary" type="button" @click="refresh" :disabled="loading || saving">
          Refresh
        </button>
        <button class="btn btn-secondary" type="button" @click="exportCsv" :disabled="loading || !selectedAgencyId">
          Export CSV
        </button>
        <button class="btn btn-primary" type="button" @click="saveChanges" :disabled="saving || dirtyCount === 0 || !selectedAgencyId">
          {{ saving ? 'Saving…' : `Save changes (${dirtyCount})` }}
        </button>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;">
      <div class="field-row" style="grid-template-columns: 1fr 1fr; gap: 12px;">
        <div class="field">
          <label>Agency</label>
          <select v-model.number="selectedAgencyId" :disabled="loading || agencies.length === 0">
            <option v-for="a in agencies" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>Search</label>
          <input v-model="search" type="text" placeholder="Search name/email…" />
        </div>
      </div>
    </div>

    <div v-if="error" class="error" style="margin-top: 12px;">{{ error }}</div>
    <div v-if="info" class="success" style="margin-top: 12px;">{{ info }}</div>

    <div class="card" style="margin-top: 14px;">
      <div class="muted" v-if="!loading">Providers: {{ filteredRows.length }}</div>
      <div v-if="loading" class="loading" style="margin-top: 10px;">Loading…</div>

      <div v-else class="table-wrap" style="overflow:auto; margin-top: 10px;">
        <table class="table" style="min-width: 1400px;">
          <thead>
            <tr>
              <th>First</th>
              <th>Last</th>
              <th>DOB</th>
              <th>First client date</th>
              <th>NPI number</th>
              <th>NPI id</th>
              <th>Taxonomy</th>
              <th>Zip</th>
              <th>License type/number</th>
              <th>Issued</th>
              <th>Expires</th>
              <th>Medicaid provider type</th>
              <th>Tax ID</th>
              <th>Medicaid location id</th>
              <th>Medicaid effective</th>
              <th>Medicaid revalidation</th>
              <th>Medicare #</th>
              <th>CAQH id</th>
              <th>Personal email</th>
              <th>Cell</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredRows" :key="r.userId">
              <td>{{ r.first_name }}</td>
              <td>{{ r.last_name }}</td>

              <td><input type="date" :value="getValue(r.userId, 'date_of_birth')" @input="setValue(r.userId, 'date_of_birth', $event.target.value)" /></td>
              <td><input type="date" :value="getValue(r.userId, 'first_client_date')" @input="setValue(r.userId, 'first_client_date', $event.target.value)" /></td>
              <td><input type="text" :value="getValue(r.userId, 'npi_number')" @input="setValue(r.userId, 'npi_number', $event.target.value)" /></td>
              <td><input type="text" :value="getValue(r.userId, 'npi_id')" @input="setValue(r.userId, 'npi_id', $event.target.value)" /></td>
              <td><input type="text" :value="getValue(r.userId, 'taxonomy_code')" @input="setValue(r.userId, 'taxonomy_code', $event.target.value)" /></td>
              <td><input type="text" :value="getValue(r.userId, 'zipcode')" @input="setValue(r.userId, 'zipcode', $event.target.value)" /></td>

              <td><input type="text" :value="getValue(r.userId, 'license_type_number')" @input="setValue(r.userId, 'license_type_number', $event.target.value)" /></td>
              <td><input type="date" :value="getValue(r.userId, 'license_issued')" @input="setValue(r.userId, 'license_issued', $event.target.value)" /></td>
              <td><input type="date" :value="getValue(r.userId, 'license_expires')" @input="setValue(r.userId, 'license_expires', $event.target.value)" /></td>

              <td><input type="text" :value="getValue(r.userId, 'medicaid_provider_type')" @input="setValue(r.userId, 'medicaid_provider_type', $event.target.value)" /></td>
              <td><input type="text" :value="getValue(r.userId, 'tax_id')" @input="setValue(r.userId, 'tax_id', $event.target.value)" /></td>
              <td><input type="text" :value="getValue(r.userId, 'medicaid_location_id')" @input="setValue(r.userId, 'medicaid_location_id', $event.target.value)" /></td>
              <td><input type="date" :value="getValue(r.userId, 'medicaid_effective_date')" @input="setValue(r.userId, 'medicaid_effective_date', $event.target.value)" /></td>
              <td><input type="date" :value="getValue(r.userId, 'medicaid_revalidation')" @input="setValue(r.userId, 'medicaid_revalidation', $event.target.value)" /></td>
              <td><input type="text" :value="getValue(r.userId, 'medicare_number')" @input="setValue(r.userId, 'medicare_number', $event.target.value)" /></td>
              <td><input type="text" :value="getValue(r.userId, 'caqh_provider_id')" @input="setValue(r.userId, 'caqh_provider_id', $event.target.value)" /></td>

              <td><input type="email" :value="getValue(r.userId, 'personal_email')" @input="setValue(r.userId, 'personal_email', $event.target.value)" /></td>
              <td><input type="tel" :value="getValue(r.userId, 'cell_number')" @input="setValue(r.userId, 'cell_number', $event.target.value)" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const route = useRoute();
const agencyStore = useAgencyStore();

const orgTo = (path) => `/${route.params.organizationSlug}${path}`;

const agencies = computed(() => (agencyStore.userAgencies || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'));
const selectedAgencyId = ref(null);

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const info = ref('');
const search = ref('');

const rows = ref([]);

// dirtyValues: key = `${userId}:${fieldKey}` -> value
const dirtyValues = ref(new Map());

const dirtyCount = computed(() => dirtyValues.value.size);

const filteredRows = computed(() => {
  const q = String(search.value || '').trim().toLowerCase();
  if (!q) return rows.value || [];
  return (rows.value || []).filter((r) => {
    return (
      String(r.first_name || '').toLowerCase().includes(q) ||
      String(r.last_name || '').toLowerCase().includes(q) ||
      String(r.personal_email || '').toLowerCase().includes(q)
    );
  });
});

const getValue = (userId, fieldKey) => {
  const k = `${userId}:${fieldKey}`;
  if (dirtyValues.value.has(k)) return dirtyValues.value.get(k) ?? '';
  const r = (rows.value || []).find((x) => Number(x.userId) === Number(userId));
  if (!r) return '';

  // users-backed columns
  if (fieldKey === 'personal_email') return r.personal_email || '';
  if (fieldKey === 'cell_number') return r.cell_number || '';

  // uiv-backed columns
  const colKey = mapUiFieldKeyToStorageKey(fieldKey);
  return (r.fields || {})[colKey] ?? '';
};

const setValue = (userId, fieldKey, value) => {
  info.value = '';
  error.value = '';
  dirtyValues.value.set(`${userId}:${fieldKey}`, value);
  // Replace map reference so Vue reacts
  dirtyValues.value = new Map(dirtyValues.value);
};

const mapUiFieldKeyToStorageKey = (uiKey) => {
  switch (uiKey) {
    case 'npi_number':
      return 'provider_identity_npi_number';
    case 'taxonomy_code':
      return 'provider_identity_taxonomy_code';
    case 'license_type_number':
      return 'provider_credential_license_type_number';
    case 'license_issued':
      return 'provider_credential_license_issued_date';
    case 'license_expires':
      return 'provider_credential_license_expiration_date';
    case 'medicaid_location_id':
      return 'provider_credential_medicaid_location_id';
    case 'medicaid_revalidation':
      return 'provider_credential_medicaid_revalidation_date';
    case 'caqh_provider_id':
      return 'provider_credential_caqh_provider_id';
    default:
      return uiKey;
  }
};

const refresh = async () => {
  try {
    if (!selectedAgencyId.value) return;
    loading.value = true;
    error.value = '';
    info.value = '';
    const res = await api.get(`/agencies/${selectedAgencyId.value}/credentialing/providers`);
    rows.value = res.data?.rows || [];
    dirtyValues.value = new Map();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load credentialing grid';
  } finally {
    loading.value = false;
  }
};

const saveChanges = async () => {
  try {
    if (!selectedAgencyId.value) return;
    if (dirtyValues.value.size === 0) return;
    saving.value = true;
    error.value = '';
    info.value = '';
    const updates = Array.from(dirtyValues.value.entries()).map(([k, v]) => {
      const [userIdStr, fieldKey] = k.split(':');
      return { userId: Number(userIdStr), fieldKey, value: String(v ?? '').trim() || null };
    });
    await api.patch(`/agencies/${selectedAgencyId.value}/credentialing/providers`, { updates });
    info.value = 'Saved.';
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save changes';
  } finally {
    saving.value = false;
  }
};

const exportCsv = async () => {
  try {
    if (!selectedAgencyId.value) return;
    error.value = '';
    const res = await api.get(`/agencies/${selectedAgencyId.value}/credentialing/providers.csv`, {
      responseType: 'blob'
    });
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agency-${selectedAgencyId.value}-credentialing-providers.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to export CSV';
  }
};

onMounted(async () => {
  await agencyStore.fetchAgencies();
  if (!selectedAgencyId.value && agencies.value.length) {
    selectedAgencyId.value = agencies.value[0].id;
  }
});

watch(
  () => selectedAgencyId.value,
  async (next, prev) => {
    if (!next || next === prev) return;
    await refresh();
  }
);
</script>

