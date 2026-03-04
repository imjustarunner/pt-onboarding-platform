<template>
  <div class="container credentialing-page">
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
        <button class="btn btn-secondary" type="button" @click="showCsvModal = true" :disabled="loading || !selectedAgencyId">
          Export CSV
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
      <div style="margin-top: 10px; display: flex; gap: 16px; flex-wrap: wrap; align-items: center;">
        <label style="display:flex; align-items:center; gap:8px; margin:0;">
          <input type="checkbox" v-model="showSources" :disabled="loading" />
          <span class="muted" style="font-size: 13px;">Show field keys / sources</span>
        </label>
        <div class="view-toggle">
          <label style="display:flex; align-items:center; gap:8px; margin:0;">
            <span class="muted" style="font-size: 13px;">View:</span>
            <select v-model="viewMode" :disabled="loading">
              <option value="by_provider">By Provider</option>
              <option value="by_insurance">By Insurance</option>
            </select>
          </label>
        </div>
      </div>
    </div>

    <div v-if="showCsvModal" class="modal-overlay" @click.self="showCsvModal = false">
      <div class="modal card">
        <h3>Export CSV</h3>
        <p class="hint">Select columns to include in the export.</p>
        <div class="csv-columns">
          <label v-for="col in csvColumnOptions" :key="col.key" class="checkbox-label">
            <input type="checkbox" v-model="csvSelectedColumns" :value="col.key" />
            {{ col.label }}
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showCsvModal = false">Cancel</button>
          <button class="btn btn-primary" @click="doExportCsv">Export</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="error" style="margin-top: 12px;">{{ error }}</div>
    <div v-if="info" class="success" style="margin-top: 12px;">{{ info }}</div>

    <details class="card timeline-card" style="margin-top: 14px;">
      <summary>Credentialing timeline</summary>
      <CredentialingTimeline :agency-id="selectedAgencyId" />
    </details>

    <div class="card" style="margin-top: 14px;">
      <div class="muted" v-if="!loading">
        {{ viewMode === 'by_provider' ? `Providers: ${filteredRows.length}` : `Insurances: ${byInsuranceData.length}` }}
      </div>
      <div v-if="loading" class="loading" style="margin-top: 10px;">Loading…</div>

      <!-- View 2: By Insurance -->
      <div v-else-if="viewMode === 'by_insurance'" class="by-insurance-view" style="margin-top: 12px;">
        <div v-if="byInsuranceLoading" class="loading">Loading by insurance…</div>
        <div v-else-if="byInsuranceData.length === 0" class="empty-state muted">No insurance credentialing data.</div>
        <div v-else class="insurance-sections">
          <details
            v-for="ins in byInsuranceData"
            :key="ins.insurance.id"
            class="insurance-section"
            :open="byInsuranceData.length <= 5"
          >
            <summary>
              <strong>{{ ins.insurance.name }}</strong>
              <span class="muted">({{ ins.providers.length }} provider{{ ins.providers.length !== 1 ? 's' : '' }})</span>
            </summary>
            <table class="table" style="margin-top: 8px;">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Effective</th>
                  <th>Submitted</th>
                  <th>Resubmitted</th>
                  <th>PIN/Ref</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in ins.providers" :key="p.user_id">
                  <td>
                    <router-link :to="orgTo(`/admin/users/${p.user_id}?tab=credentialing`)">
                      {{ p.first_name }} {{ p.last_name }}
                    </router-link>
                  </td>
                  <td>{{ p.effective_date || '—' }}</td>
                  <td>{{ p.submitted_date || '—' }}</td>
                  <td>{{ p.resubmitted_date || '—' }}</td>
                  <td>{{ p.pin_or_reference || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </details>
        </div>
      </div>

      <!-- View 1: By Provider -->
      <div v-else class="table-wrap" style="overflow:auto; margin-top: 10px;">
        <table class="table" style="min-width: 1400px;">
          <thead>
            <tr>
              <th>Name</th>
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
              <th class="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredRows" :key="r.userId">
              <td style="min-width: 220px;">
                <router-link :to="orgTo(`/admin/users/${r.userId}?tab=credentialing`)">
                  {{ r.first_name }} {{ r.last_name }}
                </router-link>
                <div v-if="(r.in_network || []).length" class="in-network-badges">
                  <span
                    v-for="name in (r.in_network || []).slice(0, 5)"
                    :key="name"
                    class="badge"
                  >{{ name }}</span>
                  <span v-if="(r.in_network || []).length > 5" class="muted">+{{ (r.in_network || []).length - 5 }}</span>
                </div>
              </td>

              <td>
                <input
                  type="date"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'date_of_birth')"
                  :value="getValue(r.userId, 'date_of_birth')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'date_of_birth', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'date_of_birth') }}</div>
              </td>
              <td>
                <input
                  type="date"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'first_client_date')"
                  :value="getValue(r.userId, 'first_client_date')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'first_client_date', $event.target.value)"
                />
              </td>
              <td>
                <input
                  type="text"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'npi_number')"
                  :value="getValue(r.userId, 'npi_number')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'npi_number', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'npi_number') }}</div>
              </td>
              <td>
                <input
                  type="text"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'npi_id')"
                  :value="getValue(r.userId, 'npi_id')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'npi_id', $event.target.value)"
                />
              </td>
              <td>
                <input
                  type="text"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'taxonomy_code')"
                  :value="getValue(r.userId, 'taxonomy_code')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'taxonomy_code', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'taxonomy_code') }}</div>
              </td>
              <td>
                <input
                  type="text"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'zipcode')"
                  :value="getValue(r.userId, 'zipcode')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'zipcode', $event.target.value)"
                />
              </td>

              <td>
                <input
                  type="text"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'license_type_number')"
                  :value="getValue(r.userId, 'license_type_number')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'license_type_number', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'license_type_number') }}</div>
              </td>
              <td>
                <input
                  type="date"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'license_issued')"
                  :value="getValue(r.userId, 'license_issued')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'license_issued', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'license_issued') }}</div>
              </td>
              <td>
                <input
                  type="date"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'license_expires')"
                  :value="getValue(r.userId, 'license_expires')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'license_expires', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'license_expires') }}</div>
              </td>

              <td>
                <input
                  type="text"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'medicaid_provider_type')"
                  :value="getValue(r.userId, 'medicaid_provider_type')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'medicaid_provider_type', $event.target.value)"
                />
              </td>
              <td>
                <input
                  type="text"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'tax_id')"
                  :value="getValue(r.userId, 'tax_id')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'tax_id', $event.target.value)"
                />
              </td>
              <td>
                <input
                  type="text"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'medicaid_location_id')"
                  :value="getValue(r.userId, 'medicaid_location_id')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'medicaid_location_id', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'medicaid_location_id') }}</div>
              </td>
              <td>
                <input
                  type="date"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'medicaid_effective_date')"
                  :value="getValue(r.userId, 'medicaid_effective_date')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'medicaid_effective_date', $event.target.value)"
                />
              </td>
              <td>
                <input
                  type="date"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'medicaid_revalidation')"
                  :value="getValue(r.userId, 'medicaid_revalidation')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'medicaid_revalidation', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'medicaid_revalidation') }}</div>
              </td>
              <td>
                <input
                  type="text"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'medicare_number')"
                  :value="getValue(r.userId, 'medicare_number')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'medicare_number', $event.target.value)"
                />
              </td>
              <td>
                <input
                  type="text"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'caqh_provider_id')"
                  :value="getValue(r.userId, 'caqh_provider_id')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'caqh_provider_id', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'caqh_provider_id') }}</div>
              </td>

              <td>
                <input
                  type="email"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'personal_email')"
                  :value="getValue(r.userId, 'personal_email')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'personal_email', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">src: users.personal_email</div>
              </td>
              <td>
                <input
                  type="tel"
                  :readonly="!isEditingRow(r.userId)"
                  :title="cellTitle(r,'cell_number')"
                  :value="getValue(r.userId, 'cell_number')"
                  @focus="beginEdit(r.userId)"
                  @input="setValue(r.userId, 'cell_number', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">src: users.personal_phone</div>
              </td>

              <td class="right" style="white-space: nowrap;">
                <button
                  v-if="!isEditingRow(r.userId)"
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="beginEdit(r.userId)"
                  :disabled="saving || loading"
                >
                  Edit
                </button>
                <template v-else>
                  <button class="btn btn-primary btn-sm" type="button" @click="saveRow(r.userId)" :disabled="saving || loading">
                    Save
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" @click="cancelEdit" :disabled="saving || loading" style="margin-left: 6px;">
                    Cancel
                  </button>
                </template>
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
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import CredentialingTimeline from '../../components/admin/CredentialingTimeline.vue';

const route = useRoute();
const agencyStore = useAgencyStore();

const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

const agencies = computed(() => (agencyStore.userAgencies || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency'));
const selectedAgencyId = ref(null);

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const info = ref('');
const search = ref('');

const rows = ref([]);
const showSources = ref(false);
const viewMode = ref('by_provider');

const byInsuranceData = ref([]);
const byInsuranceLoading = ref(false);

const showCsvModal = ref(false);
const csvColumnOptions = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'date_of_birth', label: 'DOB' },
  { key: 'first_client_date', label: 'First client date' },
  { key: 'npi_number', label: 'NPI number' },
  { key: 'npi_id', label: 'NPI id' },
  { key: 'taxonomy_code', label: 'Taxonomy' },
  { key: 'zipcode', label: 'Zip' },
  { key: 'license_type_number', label: 'License type/number' },
  { key: 'license_issued', label: 'Issued' },
  { key: 'license_expires', label: 'Expires' },
  { key: 'medicaid_provider_type', label: 'Medicaid provider type' },
  { key: 'tax_id', label: 'Tax ID' },
  { key: 'medicaid_location_id', label: 'Medicaid location id' },
  { key: 'medicaid_effective_date', label: 'Medicaid effective' },
  { key: 'medicaid_revalidation', label: 'Medicaid revalidation' },
  { key: 'medicare_number', label: 'Medicare #' },
  { key: 'caqh_provider_id', label: 'CAQH id' },
  { key: 'personal_email', label: 'Personal email' },
  { key: 'cell_number', label: 'Cell' }
];
const csvSelectedColumns = ref(csvColumnOptions.map((c) => c.key));

const editingUserId = ref(null);
// draftValues: Map<fieldKey, value> for the currently-edited user row.
const draftValues = ref(new Map());

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
  if (isEditingRow(userId) && draftValues.value.has(fieldKey)) return draftValues.value.get(fieldKey) ?? '';
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
  if (!isEditingRow(userId)) return;
  draftValues.value.set(fieldKey, value);
  // Replace map reference so Vue reacts
  draftValues.value = new Map(draftValues.value);
};

const isEditingRow = (userId) => Number(editingUserId.value || 0) === Number(userId);

const beginEdit = (userId) => {
  const uid = Number(userId);
  if (!uid) return;
  const r = (rows.value || []).find((x) => Number(x.userId) === uid);
  if (!r) return;
  editingUserId.value = uid;

  const initial = new Map();
  const keys = [
    'date_of_birth',
    'first_client_date',
    'npi_number',
    'npi_id',
    'taxonomy_code',
    'zipcode',
    'license_type_number',
    'license_issued',
    'license_expires',
    'medicaid_provider_type',
    'tax_id',
    'medicaid_location_id',
    'medicaid_effective_date',
    'medicaid_revalidation',
    'medicare_number',
    'caqh_provider_id',
    'personal_email',
    'cell_number'
  ];
  for (const k of keys) {
    initial.set(k, getValue(uid, k));
  }
  draftValues.value = initial;
};

const cancelEdit = () => {
  editingUserId.value = null;
  draftValues.value = new Map();
};

const baseValueForRow = (row, fieldKey) => {
  if (!row) return '';
  if (fieldKey === 'personal_email') return row.personal_email || '';
  if (fieldKey === 'cell_number') return row.cell_number || '';
  const colKey = mapUiFieldKeyToStorageKey(fieldKey);
  return (row.fields || {})[colKey] ?? '';
};

const saveRow = async (userId) => {
  try {
    const uid = Number(userId);
    if (!uid || !selectedAgencyId.value) return;
    const row = (rows.value || []).find((x) => Number(x.userId) === uid);
    if (!row) return;

    const updates = [];
    for (const [fieldKey, draft] of draftValues.value.entries()) {
      const before = baseValueForRow(row, fieldKey);
      const after = String(draft ?? '').trim();
      const beforeNorm = String(before ?? '').trim();
      if (after === beforeNorm) continue;
      updates.push({ userId: uid, fieldKey, value: after || null });
    }

    if (updates.length === 0) {
      info.value = 'No changes.';
      cancelEdit();
      return;
    }

    if (!confirm(`Save ${updates.length} change(s) for ${row.first_name || ''} ${row.last_name || ''}?`)) {
      return;
    }

    saving.value = true;
    error.value = '';
    info.value = '';
    await api.patch(`/agencies/${selectedAgencyId.value}/credentialing/providers`, { updates });
    info.value = 'Saved.';
    await refresh();
    cancelEdit();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save changes';
  } finally {
    saving.value = false;
  }
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

const cellTitle = (row, uiKey) => {
  if (!row) return '';
  // For uiv-backed cells, backend returns the source field_key used (if any).
  if (uiKey !== 'personal_email' && uiKey !== 'cell_number') {
    const src = String(row?.sources?.[uiKey] || '').trim();
    return src ? `Source field_key: ${src}` : 'No value found in any known field keys for this column.';
  }
  return '';
};

const refresh = async () => {
  try {
    if (!selectedAgencyId.value) return;
    loading.value = true;
    error.value = '';
    info.value = '';
    const res = await api.get(`/agencies/${selectedAgencyId.value}/credentialing/providers`, {
      params: { debug: showSources.value ? 'true' : 'false' }
    });
    rows.value = res.data?.rows || [];
    cancelEdit();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load credentialing grid';
  } finally {
    loading.value = false;
  }
};

const fetchByInsurance = async () => {
  if (!selectedAgencyId.value) return;
  byInsuranceLoading.value = true;
  try {
    const res = await api.get(`/agencies/${selectedAgencyId.value}/credentialing/by-insurance`);
    byInsuranceData.value = res.data?.byInsurance || [];
  } catch {
    byInsuranceData.value = [];
  } finally {
    byInsuranceLoading.value = false;
  }
};

watch(
  () => showSources.value,
  async () => {
    if (!selectedAgencyId.value) return;
    await refresh();
  }
);

const sourceLabel = (row, uiKey) => {
  const src = String(row?.sources?.[uiKey] || '').trim();
  if (!src) return 'src: (none found)';
  const list = Array.isArray(row?.debug?.[src]) ? row.debug[src] : [];
  const picked = list?.[0] || null;
  const defId = picked?.fieldDefinitionId ? String(picked.fieldDefinitionId) : '';
  const dup = list?.length > 1 ? ` (dups: ${list.length})` : '';
  return `src: ${src}${defId ? ` (#${defId})` : ''}${dup}`;
};

const doExportCsv = async () => {
  try {
    if (!selectedAgencyId.value) return;
    const cols = csvSelectedColumns.value?.length ? csvSelectedColumns.value.join(',') : null;
    error.value = '';
    const res = await api.get(`/agencies/${selectedAgencyId.value}/credentialing/providers.csv`, {
      responseType: 'blob',
      params: cols ? { columns: cols } : {}
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
    showCsvModal.value = false;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to export CSV';
  }
};

onMounted(async () => {
  // Use the agency list scoped to the current user (works for admin/support/staff).
  // `fetchAgencies()` hits /agencies which may be restricted for staff.
  await agencyStore.fetchUserAgencies();
  if (!selectedAgencyId.value && agencies.value.length) {
    selectedAgencyId.value = agencies.value[0].id;
  }
  if (viewMode.value === 'by_insurance' && selectedAgencyId.value) {
    await fetchByInsurance();
  }
});

watch(
  () => selectedAgencyId.value,
  async (next, prev) => {
    if (!next || next === prev) return;
    await refresh();
    await fetchByInsurance();
  },
  { immediate: false }
);

watch(viewMode, (mode) => {
  if (mode === 'by_insurance' && selectedAgencyId.value && byInsuranceData.value.length === 0) {
    fetchByInsurance();
  }
});
</script>

<style scoped>
.credentialing-page {
  font-family: var(--agency-font-family, var(--font-body));
  font-size: 1rem;
}
.credentialing-page .table,
.credentialing-page input,
.credentialing-page select,
.credentialing-page .card {
  font-family: var(--agency-font-family, var(--font-body));
}
.in-network-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.in-network-badges .badge {
  font-family: var(--agency-font-family, var(--font-body));
  font-size: 0.8125rem;
  padding: 2px 6px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
}
.insurance-section {
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  font-family: var(--agency-font-family, var(--font-body));
}
.insurance-section summary {
  cursor: pointer;
  font-family: var(--agency-font-family, var(--font-header));
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-overlay .modal {
  max-width: 480px;
  max-height: 80vh;
  overflow: auto;
  font-family: var(--agency-font-family, var(--font-body));
}
.csv-columns {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin: 12px 0;
  max-height: 240px;
  overflow-y: auto;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  cursor: pointer;
  font-family: var(--agency-font-family, var(--font-body));
}
.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
