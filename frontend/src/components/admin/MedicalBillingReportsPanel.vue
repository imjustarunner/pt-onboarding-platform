<template>
  <section class="mbr-panel">
    <div class="mbr-heading">
      <div>
        <h2>Billing Reports</h2>
        <p>Filter, review, and export data from the medical billing system.</p>
      </div>
      <button class="mbr-btn mbr-btn--secondary" type="button" :disabled="loadingCatalog" @click="loadCatalog">
        Refresh reports
      </button>
    </div>

    <div v-if="catalogError" class="mbr-error">{{ catalogError }}</div>
    <template v-else>
      <div class="mbr-filters">
        <label class="mbr-field mbr-field--wide">
          <span>Report</span>
          <select v-model="filters.type" @change="handleTypeChange">
            <option v-for="report in reports" :key="report.type" :value="report.type" :disabled="report.available === false">
              {{ report.label }}{{ report.available === false ? ' — migration required' : '' }}
            </option>
          </select>
        </label>

        <label v-if="supports('dateRange')" class="mbr-field">
          <span>Start date</span>
          <input v-model="filters.startDate" type="date" />
        </label>
        <label v-if="supports('dateRange')" class="mbr-field">
          <span>End date</span>
          <input v-model="filters.endDate" type="date" />
        </label>
        <label v-if="supports('clientId')" class="mbr-field">
          <span>Client ID</span>
          <input v-model="filters.clientId" type="number" min="1" placeholder="All clients" />
        </label>
        <label v-if="supports('providerId')" class="mbr-field">
          <span>Provider/User ID</span>
          <input v-model="filters.providerId" type="number" min="1" placeholder="All providers" />
        </label>
        <label v-if="supports('status')" class="mbr-field">
          <span>Status</span>
          <select v-model="filters.status">
            <option value="">All statuses</option>
            <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <label v-if="supports('serviceCode')" class="mbr-field">
          <span>Service code</span>
          <input v-model="filters.serviceCode" placeholder="All codes" />
        </label>
        <label v-if="supports('payer')" class="mbr-field">
          <span>Payer</span>
          <input v-model="filters.payer" placeholder="All payers" />
        </label>
        <label v-if="supports('placeOfService')" class="mbr-field">
          <span>Place of service</span>
          <input v-model="filters.placeOfService" maxlength="2" placeholder="All POS" />
        </label>
        <label v-if="supports('search')" class="mbr-field mbr-field--wide">
          <span>Search report fields</span>
          <input v-model="filters.search" :placeholder="searchPlaceholder" @keyup.enter="runReport(true)" />
        </label>
        <label class="mbr-field mbr-field--small">
          <span>Rows</span>
          <select v-model.number="pagination.limit">
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="200">200</option>
          </select>
        </label>
      </div>

      <div class="mbr-actions">
        <button class="mbr-btn" type="button" :disabled="loading || !selectedReport?.available" @click="runReport(true)">
          {{ loading ? 'Running…' : 'Run report' }}
        </button>
        <button class="mbr-btn mbr-btn--secondary" type="button" :disabled="loading" @click="resetFilters">Reset filters</button>
        <button class="mbr-btn mbr-btn--secondary" type="button" :disabled="loading || exporting || !selectedReport?.available" @click="exportCsv">
          {{ exporting ? 'Exporting…' : 'Export CSV' }}
        </button>
      </div>

      <div v-if="selectedReport" class="mbr-description">
        <strong>{{ selectedReport.label }}</strong> — {{ selectedReport.description }}
      </div>
      <div v-if="notice || selectedReport?.unavailableReason" class="mbr-notice">
        {{ notice || selectedReport.unavailableReason }}
      </div>
      <div v-if="error" class="mbr-error">{{ error }}</div>

      <div v-if="summaryCards.length" class="mbr-summary">
        <div v-for="card in summaryCards" :key="card.key" class="mbr-summary-card">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </div>
      </div>

      <div class="mbr-table-wrap">
        <table class="mbr-table">
          <thead>
            <tr>
              <th v-for="column in columns" :key="column.key">{{ column.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="Math.max(columns.length, 1)" class="mbr-empty">Running report…</td>
            </tr>
            <tr v-else-if="!rows.length">
              <td :colspan="Math.max(columns.length, 1)" class="mbr-empty">
                {{ hasRun ? 'No records match the current filters.' : 'Choose filters and run the report.' }}
              </td>
            </tr>
            <tr v-for="row in rows" :key="`${filters.type}-${row.id}`">
              <td v-for="column in columns" :key="column.key">
                <span v-if="column.format === 'status'" class="mbr-status">{{ formatCell(row[column.key], column) }}</span>
                <template v-else>{{ formatCell(row[column.key], column) }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mbr-footer">
        <span>{{ pagination.total.toLocaleString() }} records · showing {{ rows.length.toLocaleString() }}</span>
        <div>
          <button class="mbr-btn mbr-btn--secondary mbr-btn--small" type="button" :disabled="loading || pagination.offset === 0" @click="previousPage">Previous</button>
          <button class="mbr-btn mbr-btn--secondary mbr-btn--small" type="button" :disabled="loading || !pagination.hasNextPage" @click="nextPage">Next</button>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: Number, required: true }
});

const reports = ref([]);
const rows = ref([]);
const summary = ref({});
const loadingCatalog = ref(false);
const loading = ref(false);
const exporting = ref(false);
const hasRun = ref(false);
const catalogError = ref('');
const error = ref('');
const notice = ref('');

const filters = reactive({
  type: 'claims', startDate: '', endDate: '', clientId: '', providerId: '',
  status: '', serviceCode: '', payer: '', placeOfService: '', search: ''
});
const pagination = reactive({ total: 0, limit: 50, offset: 0, hasNextPage: false });

const selectedReport = computed(() => reports.value.find((report) => report.type === filters.type) || null);
const columns = computed(() => selectedReport.value?.columns || []);
const supports = (filter) => (selectedReport.value?.filters || []).includes(filter);

const STATUS_OPTIONS = {
  claims: ['pending', 'draft', 'ready', 'queued', 'submitted', 'accepted', 'rejected', 'denied', 'paid', 'adjusted'],
  claim_lines: ['pending', 'draft', 'ready', 'queued', 'submitted', 'accepted', 'rejected', 'denied', 'paid', 'adjusted'],
  encounters: ['scheduled', 'checked_in', 'completed', 'no_show', 'cancelled'],
  notes: ['unsigned', 'signed', 'awaiting_cosign', 'cosigned', 'billable'],
  diagnoses: ['active', 'inactive', 'primary'],
  treatment_plans: ['active', 'inactive', 'completed'],
  fee_schedule: ['active', 'inactive'],
  service_codes: ['active', 'inactive'],
  service_locations: ['active', 'inactive']
};
const statusOptions = computed(() => (STATUS_OPTIONS[filters.type] || []).map((value) => ({
  value,
  label: value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
})));

const searchPlaceholder = computed(() => {
  if (filters.type === 'claims' || filters.type === 'claim_lines') return 'Claim number, payer, status, or code';
  if (filters.type === 'notes' || filters.type === 'treatment_plans') return 'Title, type, status, or source';
  if (filters.type === 'diagnoses') return 'ICD-10 code or description';
  return 'Code, description, status, or location';
});

const SUMMARY_LABELS = {
  record_count: 'Records', client_count: 'Clients', claim_count: 'Claims', provider_count: 'Providers',
  total_amount_cents: 'Total amount', average_amount_cents: 'Average price', total_units: 'Total units',
  total_minutes: 'Total time', paid_count: 'Paid claims', exception_count: 'Rejected/denied',
  blocked_count: 'Billing blocked', unsigned_count: 'Unsigned', awaiting_cosign_count: 'Awaiting cosign',
  billable_count: 'Billable', active_count: 'Active', primary_count: 'Primary', overflow_count: 'Overflow rules',
  credentialing_count: 'Credentialing required', place_of_service_count: 'POS types'
};

const formatCurrency = (cents) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);
const formatMinutes = (minutes) => {
  const value = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(value / 60);
  const remainder = Math.round(value % 60);
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
};
const summaryCards = computed(() => Object.entries(summary.value || {})
  .filter(([key]) => SUMMARY_LABELS[key])
  .map(([key, raw]) => ({
    key,
    label: SUMMARY_LABELS[key],
    value: key.includes('amount_cents')
      ? formatCurrency(raw)
      : (key === 'total_minutes' ? formatMinutes(raw) : Number(raw || 0).toLocaleString())
  })));

const reportParams = () => ({
  agencyId: props.agencyId,
  type: filters.type,
  startDate: filters.startDate || undefined,
  endDate: filters.endDate || undefined,
  clientId: filters.clientId || undefined,
  providerId: filters.providerId || undefined,
  status: filters.status || undefined,
  serviceCode: filters.serviceCode || undefined,
  payer: filters.payer || undefined,
  placeOfService: filters.placeOfService || undefined,
  search: filters.search || undefined,
  limit: pagination.limit,
  offset: pagination.offset
});

const loadCatalog = async () => {
  if (!props.agencyId) return;
  loadingCatalog.value = true;
  catalogError.value = '';
  try {
    const response = await api.get('/medical-billing/reports/catalog', { params: { agencyId: props.agencyId } });
    reports.value = Array.isArray(response.data?.reports) ? response.data.reports : [];
    if (!reports.value.some((report) => report.type === filters.type && report.available !== false)) {
      filters.type = reports.value.find((report) => report.available !== false)?.type || reports.value[0]?.type || 'claims';
    }
  } catch (e) {
    catalogError.value = e.response?.data?.error?.message || 'Failed to load billing report definitions.';
  } finally {
    loadingCatalog.value = false;
  }
};

const runReport = async (resetPage = false) => {
  if (!props.agencyId || !selectedReport.value?.available) return;
  if (resetPage) pagination.offset = 0;
  loading.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response = await api.get('/medical-billing/reports', { params: reportParams() });
    rows.value = Array.isArray(response.data?.rows) ? response.data.rows : [];
    summary.value = response.data?.summary || {};
    if (response.data?.report) {
      const index = reports.value.findIndex((report) => report.type === response.data.report.type);
      if (index >= 0) reports.value[index] = response.data.report;
    }
    const page = response.data?.pagination || {};
    pagination.total = Number(page.total || 0);
    pagination.hasNextPage = !!page.hasNextPage;
    notice.value = response.data?.notice || '';
    hasRun.value = true;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to run billing report.';
    rows.value = [];
    summary.value = {};
    pagination.total = 0;
    pagination.hasNextPage = false;
  } finally {
    loading.value = false;
  }
};

const clearTypeFilters = () => {
  filters.clientId = '';
  filters.providerId = '';
  filters.status = '';
  filters.serviceCode = '';
  filters.payer = '';
  filters.placeOfService = '';
  filters.search = '';
};
const handleTypeChange = async () => {
  clearTypeFilters();
  rows.value = [];
  summary.value = {};
  hasRun.value = false;
  await runReport(true);
};
const resetFilters = async () => {
  const type = filters.type;
  Object.assign(filters, {
    type, startDate: '', endDate: '', clientId: '', providerId: '', status: '',
    serviceCode: '', payer: '', placeOfService: '', search: ''
  });
  await runReport(true);
};

const formatCell = (value, column) => {
  if (value == null || value === '') return '—';
  if (column.format === 'currency') return formatCurrency(value);
  if (column.format === 'boolean') return Number(value) === 1 || value === true ? 'Yes' : 'No';
  if (column.format === 'number') return Number(value).toLocaleString();
  if (column.format === 'date') {
    const match = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (!match) return String(value);
    const [year, month, day] = match.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, day)));
  }
  if (column.format === 'datetime') return new Date(value).toLocaleString();
  return String(value);
};

const downloadBlob = (data, filename) => {
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
const exportCsv = async () => {
  exporting.value = true;
  error.value = '';
  try {
    const params = reportParams();
    delete params.limit;
    delete params.offset;
    const response = await api.get('/medical-billing/reports/export.csv', { params, responseType: 'blob' });
    downloadBlob(response.data, `medical-billing-${filters.type}.csv`);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to export billing report.';
  } finally {
    exporting.value = false;
  }
};

const previousPage = async () => {
  pagination.offset = Math.max(0, pagination.offset - pagination.limit);
  await runReport(false);
};
const nextPage = async () => {
  pagination.offset += pagination.limit;
  await runReport(false);
};

const initialize = async () => {
  rows.value = [];
  summary.value = {};
  hasRun.value = false;
  pagination.offset = 0;
  await loadCatalog();
  if (selectedReport.value?.available) await runReport(true);
};

watch(() => props.agencyId, (next, previous) => {
  if (next && next !== previous) initialize();
});
onMounted(initialize);
</script>

<style scoped>
.mbr-panel { background: #fff; border: 1px solid #dfe5eb; border-radius: 12px; padding: 1rem 1.1rem; margin-top: 1rem; }
.mbr-heading { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
.mbr-heading h2 { margin: 0; }
.mbr-heading p { color: #5c6570; margin: 0.3rem 0 0; }
.mbr-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.7rem; margin-top: 1rem; }
.mbr-field { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; }
.mbr-field span { color: #4f5964; font-size: 0.78rem; font-weight: 600; }
.mbr-field input, .mbr-field select { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid #cbd4dd; border-radius: 7px; padding: 0.48rem 0.55rem; background: #fff; }
.mbr-field--wide { grid-column: span 2; }
.mbr-field--small { max-width: 110px; }
.mbr-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.8rem; }
.mbr-btn { border: 1px solid #2f5d8c; background: #2f5d8c; color: #fff; border-radius: 7px; padding: 0.45rem 0.75rem; cursor: pointer; }
.mbr-btn:disabled { cursor: not-allowed; opacity: 0.55; }
.mbr-btn--secondary { background: #fff; color: #2f5d8c; }
.mbr-btn--small { padding: 0.3rem 0.55rem; }
.mbr-description, .mbr-notice, .mbr-error { margin-top: 0.8rem; padding: 0.65rem 0.75rem; border-radius: 7px; font-size: 0.88rem; }
.mbr-description { background: #f5f8fb; color: #44515e; }
.mbr-notice { background: #fff8e6; border: 1px solid #f1d48b; color: #795600; }
.mbr-error { background: #fff1f0; border: 1px solid #f0b8b5; color: #9b2924; }
.mbr-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.6rem; margin-top: 0.8rem; }
.mbr-summary-card { border: 1px solid #e0e6ec; border-radius: 8px; padding: 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.2rem; }
.mbr-summary-card span { color: #66717d; font-size: 0.76rem; }
.mbr-summary-card strong { font-size: 1.02rem; }
.mbr-table-wrap { overflow: auto; border: 1px solid #dfe5eb; border-radius: 9px; margin-top: 0.8rem; }
.mbr-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
.mbr-table th, .mbr-table td { padding: 0.55rem 0.6rem; border-bottom: 1px solid #edf0f3; text-align: left; vertical-align: top; white-space: nowrap; }
.mbr-table th { background: #f5f7f9; color: #4d5864; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.02em; position: sticky; top: 0; }
.mbr-table tbody tr:hover { background: #fafbfd; }
.mbr-status { display: inline-block; border: 1px solid #cbd4dd; border-radius: 999px; padding: 0.12rem 0.38rem; font-size: 0.75rem; }
.mbr-empty { text-align: center !important; color: #68737f; padding: 1.2rem !important; }
.mbr-footer { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 0.7rem; color: #64707b; font-size: 0.83rem; }
.mbr-footer > div { display: flex; gap: 0.4rem; }
@media (max-width: 720px) {
  .mbr-heading, .mbr-footer { align-items: stretch; flex-direction: column; }
  .mbr-field--wide { grid-column: span 1; }
  .mbr-field--small { max-width: none; }
}
</style>
