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

    <details ref="insuranceDefinitionsDetails" class="card insurance-definitions-card" style="margin-top: 14px;" :open="insuranceDefinitionsOpen">
      <summary>Insurance definitions</summary>
      <InsuranceDefinitionsPanel :agency-id="selectedAgencyId" />
    </details>

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
              <th>NPI status</th>
              <th>DOB</th>
              <th>First client date</th>
              <th>NPI number</th>
              <th>NPI id</th>
              <th>Taxonomy</th>
              <th>Zip</th>
              <th>License type/number</th>
              <th>Issued</th>
              <th>Expires</th>
              <th>License copy</th>
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

              <!-- NPI status — read-only badge -->
              <td style="white-space: nowrap;">
                <span
                  :class="['npi-status-badge', npiStatusClass(getValue(r.userId, 'npi_status'))]"
                  :title="getValue(r.userId, 'npi_status') || ''"
                >{{ npiStatusLabel(getValue(r.userId, 'npi_status')) }}</span>
              </td>

              <!-- DOB -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text" :title="cellTitle(r,'date_of_birth')">
                  {{ displayDate(getValue(r.userId, 'date_of_birth')) || '—' }}
                </span>
                <input
                  v-else
                  type="date"
                  :value="toIsoDate(getValue(r.userId, 'date_of_birth'))"
                  @input="setValue(r.userId, 'date_of_birth', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'date_of_birth') }}</div>
              </td>
              <!-- First client date -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text" :title="cellTitle(r,'first_client_date')">
                  {{ displayDate(getValue(r.userId, 'first_client_date')) || '—' }}
                </span>
                <input
                  v-else
                  type="date"
                  :value="toIsoDate(getValue(r.userId, 'first_client_date'))"
                  @input="setValue(r.userId, 'first_client_date', $event.target.value)"
                />
              </td>
              <!-- NPI number -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text" :title="cellTitle(r,'npi_number')">
                  {{ getValue(r.userId, 'npi_number') || '—' }}
                </span>
                <input
                  v-else
                  type="text"
                  :value="getValue(r.userId, 'npi_number')"
                  @input="setValue(r.userId, 'npi_number', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'npi_number') }}</div>
              </td>
              <!-- NPI id -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text" :title="cellTitle(r,'npi_id')">
                  {{ getValue(r.userId, 'npi_id') || '—' }}
                </span>
                <input
                  v-else
                  type="text"
                  :value="getValue(r.userId, 'npi_id')"
                  @input="setValue(r.userId, 'npi_id', $event.target.value)"
                />
              </td>
              <!-- Taxonomy -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text" :title="cellTitle(r,'taxonomy_code')">
                  {{ getValue(r.userId, 'taxonomy_code') || '—' }}
                </span>
                <input
                  v-else
                  type="text"
                  :value="getValue(r.userId, 'taxonomy_code')"
                  @input="setValue(r.userId, 'taxonomy_code', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'taxonomy_code') }}</div>
              </td>
              <!-- Zip -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text">
                  {{ getValue(r.userId, 'zipcode') || '—' }}
                </span>
                <input
                  v-else
                  type="text"
                  :value="getValue(r.userId, 'zipcode')"
                  @input="setValue(r.userId, 'zipcode', $event.target.value)"
                />
              </td>
              <!-- License type/number -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text" :title="cellTitle(r,'license_type_number')">
                  {{ getValue(r.userId, 'license_type_number') || '—' }}
                </span>
                <input
                  v-else
                  type="text"
                  :value="getValue(r.userId, 'license_type_number')"
                  @input="setValue(r.userId, 'license_type_number', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'license_type_number') }}</div>
              </td>
              <!-- License issued — red if license exists but date is missing -->
              <td :class="licenseDateCellClass(r, 'issued')">
                <span v-if="!isEditingRow(r.userId)" class="cell-text" :title="cellTitle(r,'license_issued')">
                  <template v-if="displayDate(getValue(r.userId, 'license_issued'))">
                    {{ displayDate(getValue(r.userId, 'license_issued')) }}
                  </template>
                  <span v-else class="cell-missing">{{ getValue(r.userId, 'license_type_number') ? '⚠ Missing' : '—' }}</span>
                </span>
                <input
                  v-else
                  type="date"
                  :value="toIsoDate(getValue(r.userId, 'license_issued'))"
                  @input="setValue(r.userId, 'license_issued', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'license_issued') }}</div>
              </td>
              <!-- License expires — red if expired/missing, yellow if expiring soon -->
              <td :class="licenseDateCellClass(r, 'expires')">
                <span v-if="!isEditingRow(r.userId)" class="cell-text" :title="cellTitle(r,'license_expires')">
                  <template v-if="displayDate(getValue(r.userId, 'license_expires'))">
                    {{ displayDate(getValue(r.userId, 'license_expires')) }}
                    <span v-if="isExpired(getValue(r.userId, 'license_expires'))" class="cell-flag cell-flag--expired">Expired</span>
                    <span v-else-if="isExpiringSoon(getValue(r.userId, 'license_expires'))" class="cell-flag cell-flag--soon">Soon</span>
                  </template>
                  <span v-else class="cell-missing">{{ getValue(r.userId, 'license_type_number') ? '⚠ Missing' : '—' }}</span>
                </span>
                <input
                  v-else
                  type="date"
                  :value="toIsoDate(getValue(r.userId, 'license_expires'))"
                  @input="setValue(r.userId, 'license_expires', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'license_expires') }}</div>
              </td>
              <!-- License copy — view / upload -->
              <td :class="['license-copy-cell', !getValue(r.userId, 'license_upload') && getValue(r.userId, 'license_type_number') ? 'cell-alert' : '']">
                <div class="license-copy-wrap">
                  <a
                    v-if="getValue(r.userId, 'license_upload')"
                    :href="toUploadsUrl(getValue(r.userId, 'license_upload'))"
                    target="_blank"
                    rel="noopener"
                    class="license-copy-link"
                    title="View uploaded license"
                  >📄 View</a>
                  <span v-else-if="getValue(r.userId, 'license_type_number')" class="cell-missing" title="No license copy on file">⚠ No copy</span>
                  <span v-else class="cell-text muted">—</span>
                  <button
                    class="btn btn-secondary btn-xs license-upload-btn"
                    type="button"
                    :disabled="uploadingLicenseFor === r.userId"
                    @click="openLicenseUpload(r)"
                    title="Upload license copy"
                  >{{ uploadingLicenseFor === r.userId ? '…' : '↑ Upload' }}</button>
                </div>
              </td>
              <!-- Medicaid location id -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text" :title="cellTitle(r,'medicaid_location_id')">
                  {{ getValue(r.userId, 'medicaid_location_id') || '—' }}
                </span>
                <input
                  v-else
                  type="text"
                  :value="getValue(r.userId, 'medicaid_location_id')"
                  @input="setValue(r.userId, 'medicaid_location_id', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'medicaid_location_id') }}</div>
              </td>
              <!-- Medicaid effective date -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text">
                  {{ displayDate(getValue(r.userId, 'medicaid_effective_date')) || '—' }}
                </span>
                <input
                  v-else
                  type="date"
                  :value="toIsoDate(getValue(r.userId, 'medicaid_effective_date'))"
                  @input="setValue(r.userId, 'medicaid_effective_date', $event.target.value)"
                />
              </td>
              <!-- Medicaid revalidation -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text">
                  {{ displayDate(getValue(r.userId, 'medicaid_revalidation')) || '—' }}
                </span>
                <input
                  v-else
                  type="date"
                  :value="toIsoDate(getValue(r.userId, 'medicaid_revalidation'))"
                  @input="setValue(r.userId, 'medicaid_revalidation', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'medicaid_revalidation') }}</div>
              </td>
              <!-- Medicare # -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text">
                  {{ getValue(r.userId, 'medicare_number') || '—' }}
                </span>
                <input
                  v-else
                  type="text"
                  :value="getValue(r.userId, 'medicare_number')"
                  @input="setValue(r.userId, 'medicare_number', $event.target.value)"
                />
              </td>
              <!-- CAQH id -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text" :title="cellTitle(r,'caqh_provider_id')">
                  {{ getValue(r.userId, 'caqh_provider_id') || '—' }}
                </span>
                <input
                  v-else
                  type="text"
                  :value="getValue(r.userId, 'caqh_provider_id')"
                  @input="setValue(r.userId, 'caqh_provider_id', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">{{ sourceLabel(r,'caqh_provider_id') }}</div>
              </td>
              <!-- Personal email -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text">
                  {{ getValue(r.userId, 'personal_email') || '—' }}
                </span>
                <input
                  v-else
                  type="email"
                  :value="getValue(r.userId, 'personal_email')"
                  @input="setValue(r.userId, 'personal_email', $event.target.value)"
                />
                <div v-if="showSources" class="muted" style="font-size: 11px;">src: users.personal_email</div>
              </td>
              <!-- Cell -->
              <td>
                <span v-if="!isEditingRow(r.userId)" class="cell-text">
                  {{ getValue(r.userId, 'cell_number') || '—' }}
                </span>
                <input
                  v-else
                  type="tel"
                  :value="getValue(r.userId, 'cell_number')"
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

    <!-- Hidden file input for license uploads -->
    <input
      ref="licenseUploadInput"
      type="file"
      accept=".pdf,.jpg,.jpeg,.png,.webp"
      style="display:none"
      @change="onLicenseFileSelected"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';
import CredentialingTimeline from '../../components/admin/CredentialingTimeline.vue';
import InsuranceDefinitionsPanel from '../../components/admin/InsuranceDefinitionsPanel.vue';

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

const insuranceDefinitionsDetails = ref(null);
const insuranceDefinitionsOpen = ref(String(route.query?.panel || '') === 'insurance-definitions');

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
  { key: 'medicaid_location_id', label: 'Medicaid location id' },
  { key: 'medicaid_effective_date', label: 'Medicaid effective' },
  { key: 'medicaid_revalidation', label: 'Medicaid revalidation' },
  { key: 'medicare_number', label: 'Medicare #' },
  { key: 'caqh_provider_id', label: 'CAQH id' },
  { key: 'personal_email', label: 'Personal email' },
  { key: 'cell_number', label: 'Cell' },
  { key: 'npi_status', label: 'NPI status (from intake)' }
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

  // Build draft from the server data BEFORE changing editingUserId,
  // so getValue() doesn't accidentally read stale draftValues from a previous edit.
  const editableKeys = [
    'date_of_birth',
    'first_client_date',
    'npi_number',
    'npi_id',
    'taxonomy_code',
    'zipcode',
    'license_type_number',
    'license_issued',
    'license_expires',
    'medicaid_location_id',
    'medicaid_effective_date',
    'medicaid_revalidation',
    'medicare_number',
    'caqh_provider_id',
    'personal_email',
    'cell_number'
  ];
  const initial = new Map();
  for (const k of editableKeys) {
    initial.set(k, baseValueForRow(r, k));
  }
  draftValues.value = initial;
  editingUserId.value = uid;
};

const cancelEdit = () => {
  editingUserId.value = null;
  draftValues.value = new Map();
};

// ── License upload ────────────────────────────────────────────────────────────
const uploadingLicenseFor = ref(null);
const licenseUploadInput = ref(null);
const licenseUploadTargetRow = ref(null);
const licenseUploadError = ref('');

const openLicenseUpload = (row) => {
  licenseUploadTargetRow.value = row;
  licenseUploadError.value = '';
  nextTick(() => licenseUploadInput.value?.click());
};

const onLicenseFileSelected = async (event) => {
  const file = event.target.files?.[0];
  if (!file || !licenseUploadTargetRow.value || !selectedAgencyId.value) return;
  const row = licenseUploadTargetRow.value;
  uploadingLicenseFor.value = row.userId;
  licenseUploadError.value = '';
  try {
    const form = new FormData();
    form.append('file', file);
    await api.post(
      `/agencies/${selectedAgencyId.value}/credentialing/providers/${row.userId}/license-upload`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    info.value = `License uploaded for ${row.first_name} ${row.last_name}.`;
    await refresh();
  } catch (e) {
    licenseUploadError.value = e.response?.data?.error?.message || 'Upload failed';
    error.value = licenseUploadError.value;
  } finally {
    uploadingLicenseFor.value = null;
    licenseUploadTargetRow.value = null;
    if (licenseUploadInput.value) licenseUploadInput.value.value = '';
  }
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

/** Convert any stored date (YYYY-MM-DD, MM/DD/YYYY, etc.) to YYYY-MM-DD for <input type="date"> */
const toIsoDate = (val) => {
  const s = String(val || '').trim();
  if (!s) return '';
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // MM/DD/YYYY
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
};

/** Human-readable date string (M/D/YYYY) from any stored format */
const displayDate = (val) => {
  const iso = toIsoDate(val);
  if (!iso) {
    // Return raw value if we can't parse it (e.g. "12/21/2022" already looks fine)
    const s = String(val || '').trim();
    return s || '';
  }
  const [y, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
};

const EXPIRY_WARN_DAYS = 90;

const isExpired = (val) => {
  const iso = toIsoDate(val);
  if (!iso) return false;
  return new Date(iso) < new Date();
};

const isExpiringSoon = (val) => {
  const iso = toIsoDate(val);
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  if (d < now) return false;
  const diffDays = (d - now) / (1000 * 60 * 60 * 24);
  return diffDays <= EXPIRY_WARN_DAYS;
};

/** CSS class for the issued/expires date cells based on license validity */
const licenseDateCellClass = (row, which) => {
  const licNum = String(baseValueForRow(row, 'license_type_number') || getValue(row.userId, 'license_type_number') || '').trim();
  if (!licNum) return ''; // no license number — no highlighting

  if (which === 'issued') {
    const issued = getValue(row.userId, 'license_issued');
    return !toIsoDate(issued) ? 'cell-alert' : '';
  }
  if (which === 'expires') {
    const expires = getValue(row.userId, 'license_expires');
    const iso = toIsoDate(expires);
    if (!iso) return 'cell-alert';
    if (isExpired(expires)) return 'cell-alert';
    if (isExpiringSoon(expires)) return 'cell-warn';
    return '';
  }
  return '';
};

/** Label for the npi_status field value */
const npiStatusLabel = (val) => {
  const v = String(val || '').trim().toLowerCase();
  if (v === 'yes') return 'Has NPI';
  if (v === 'no_itsco_create' || v === 'no') return 'ITSCO to create';
  return '—';
};

const npiStatusClass = (val) => {
  const v = String(val || '').trim().toLowerCase();
  if (v === 'yes') return 'npi-status--has';
  if (v === 'no_itsco_create' || v === 'no') return 'npi-status--create';
  return '';
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

const applyRoutePanelPrefs = async () => {
  const panel = String(route.query?.panel || '').trim();
  insuranceDefinitionsOpen.value = panel === 'insurance-definitions';

  const queryAgencyId = parseInt(String(route.query?.agencyId || ''), 10);
  if (Number.isInteger(queryAgencyId) && queryAgencyId > 0) {
    const match = (agencies.value || []).find((a) => Number(a.id) === queryAgencyId);
    if (match) selectedAgencyId.value = queryAgencyId;
  }

  if (insuranceDefinitionsOpen.value) {
    await nextTick();
    insuranceDefinitionsDetails.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
};

onMounted(async () => {
  // Use the agency list scoped to the current user (works for admin/support/staff).
  // `fetchAgencies()` hits /agencies which may be restricted for staff.
  await agencyStore.fetchUserAgencies();
  if (!selectedAgencyId.value && agencies.value.length) {
    selectedAgencyId.value = agencies.value[0].id;
  }
  await applyRoutePanelPrefs();
  if (viewMode.value === 'by_insurance' && selectedAgencyId.value) {
    await fetchByInsurance();
  }
});

watch(
  () => [route.query?.panel, route.query?.agencyId, agencies.value?.length],
  () => {
    void applyRoutePanelPrefs();
  }
);

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
/* Read-only cell text — matches column width without triggering browser validation */
.cell-text {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
  font-size: 13px;
  color: var(--text-primary, #1a1a1a);
}

/* Cell alert states */
.cell-alert {
  background: #ffe0e0 !important;
}
.cell-warn {
  background: #fff8e1 !important;
}
.cell-missing {
  color: #c0392b;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.cell-flag {
  display: inline-block;
  margin-left: 4px;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  vertical-align: middle;
}
.cell-flag--expired {
  background: #c0392b;
  color: #fff;
}
.cell-flag--soon {
  background: #f39c12;
  color: #fff;
}

/* License copy column */
.license-copy-cell {
  white-space: nowrap;
}
.license-copy-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
}
.license-copy-link {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-color, #2d6a4f);
  text-decoration: none;
  white-space: nowrap;
}
.license-copy-link:hover {
  text-decoration: underline;
}
.btn-xs {
  font-size: 11px;
  padding: 2px 7px;
  line-height: 1.4;
}
.license-upload-btn {
  flex-shrink: 0;
}

/* NPI status badge */
.npi-status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-alt, #f5f5f5);
  color: var(--text-muted, #888);
}
.npi-status--has {
  background: #d4edda;
  color: #155724;
}
.npi-status--create {
  background: #fff3cd;
  color: #856404;
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
