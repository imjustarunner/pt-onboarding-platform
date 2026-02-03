<template>
  <div>
    <div class="card" style="margin-bottom: 12px;" data-tour="payroll-reports-header">
      <h2 class="card-title" data-tour="payroll-reports-title">Payroll Reports</h2>
      <div class="hint">Build and download the exact report you need.</div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="card" style="margin-bottom: 12px;" data-tour="payroll-reports-filters">
      <div class="field-row" style="grid-template-columns: 1fr 1fr; align-items: end;">
        <div class="field">
          <label>Pay period</label>
          <div class="field-row" style="grid-template-columns: 180px 1fr; align-items: end; margin: 0;">
            <div class="field">
              <label style="font-weight: 700;">Mode</label>
              <select v-model="periodMode" :disabled="!agencyId || !(periods || []).length">
                <option value="single">Single period</option>
                <option value="range">Date range</option>
              </select>
            </div>
            <div class="field" v-if="periodMode === 'single'">
              <label style="font-weight: 700;">Period</label>
              <select v-model="selectedPeriodId" :disabled="!agencyId || !(periods || []).length">
                <option :value="null" disabled>Select a pay period…</option>
                <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
              </select>
            </div>
            <div class="field" v-else>
              <label style="font-weight: 700;">Range</label>
              <div class="field-row" style="grid-template-columns: 1fr 1fr auto; align-items: end; margin: 0;">
                <div class="field">
                  <label>Start</label>
                  <input v-model="rangeStartYmd" type="date" />
                </div>
                <div class="field">
                  <label>End</label>
                  <input v-model="rangeEndYmd" type="date" />
                </div>
                <div class="field">
                  <label>Presets</label>
                  <select v-model="rangePreset" @change="applyRangePreset">
                    <option value="">Custom</option>
                    <option value="this_year">This year</option>
                    <option value="last_year">Last year</option>
                    <option value="ytd">Year to date</option>
                  </select>
                </div>
              </div>
              <div class="hint" style="margin-top: 6px;">
                Matched periods: <strong>{{ selectedPeriodsEffective.length }}</strong>
                <span v-if="selectedPeriodsEffective.length"> • {{ selectedPeriodsEffective[0]?.period_start }} → {{ selectedPeriodsEffective[selectedPeriodsEffective.length - 1]?.period_end }}</span>
              </div>
            </div>
          </div>
          <div class="hint" v-if="selectedPeriodForUi" style="margin-top: 6px;">
            Current: <strong>{{ periodRangeLabel(selectedPeriodForUi) }}</strong>
          </div>
        </div>

        <div class="field">
          <label>Providers</label>
          <input v-model="providerSearch" type="text" placeholder="Search providers…" />
          <div class="hint" style="margin-top: 6px;">
            <button class="btn btn-secondary btn-sm" type="button" @click="selectAllProviders" :disabled="!filteredProviders.length">Select all</button>
            <button class="btn btn-secondary btn-sm" type="button" @click="clearProviders" style="margin-left: 8px;" :disabled="!selectedProviderIds.length">Clear</button>
          </div>
          <div class="hint" style="margin-top: 8px;">
            <label style="display: inline-flex; gap: 8px; align-items: center; margin-right: 12px;">
              <input type="checkbox" v-model="hideInactiveProviders" :disabled="providerStatsLoading" />
              Hide inactive
            </label>
            <label style="display: inline-flex; gap: 8px; align-items: center; margin-right: 12px;">
              <input type="checkbox" v-model="showInactiveProviders" :disabled="hideInactiveProviders" />
              Show inactive (highlighted)
            </label>
            <span class="muted" style="margin-right: 12px;">•</span>
            <label class="muted" style="margin-right: 8px; font-weight: 700;">Role</label>
            <select v-model="roleFilter" style="max-width: 220px;">
              <option value="all">All</option>
              <option value="provider">Providers</option>
              <option value="staff">Staff</option>
              <option value="supervisor">Supervisors</option>
              <option value="cpa">CPAs</option>
              <option value="admin">Admins</option>
              <option value="other">Other</option>
            </select>
            <label style="display: inline-flex; gap: 8px; align-items: center; margin-right: 12px;">
              <input type="checkbox" v-model="onlyProvidersWithRows" :disabled="providerStatsLoading || !selectedPeriodId" />
              Only providers with rows in this period
            </label>
            <label style="display: inline-flex; gap: 8px; align-items: center;">
              <input type="checkbox" v-model="onlyProvidersWithNoNote" :disabled="providerStatsLoading || !selectedPeriodId" />
              Only providers with NO_NOTE rows
            </label>
            <span v-if="providerStatsLoading" class="muted"> • loading…</span>
          </div>
          <div class="pillbox" style="margin-top: 10px;">
            <label v-for="u in filteredProviders" :key="u.id" class="pill" :class="{ inactive: isInactive(u) }">
              <input type="checkbox" :value="u.id" v-model="selectedProviderIds" />
              <span class="pill-text" :title="providerLabel(u)">{{ providerLabelShort(u) }}</span>
            </label>
            <div v-if="!filteredProviders.length" class="muted">No providers found.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 12px;" data-tour="payroll-reports-actions">
      <div class="actions" style="justify-content: flex-start;" data-tour="payroll-reports-report-tabs">
        <button class="btn btn-secondary" type="button" @click="activeTab = 'export'">Payroll export</button>
        <button class="btn btn-secondary" type="button" @click="activeTab = 'sessions'">Sessions / Units</button>
        <button class="btn btn-secondary" type="button" @click="activeTab = 'service_codes'">Service Code Totals</button>
        <button class="btn btn-secondary" type="button" @click="activeTab = 'late_notes'">Late notes (carryover)</button>
        <button class="btn btn-secondary" type="button" @click="activeTab = 'pay_summary'">Provider Pay Summary</button>
        <button class="btn btn-secondary" type="button" @click="activeTab = 'adjustments'">Adjustments Breakdown</button>
        <button class="btn btn-secondary" type="button" @click="copyShareLink">Copy link</button>
      </div>

      <div v-if="activeTab === 'export'" style="margin-top: 10px;">
        <div class="hint">Download the existing payroll export CSV for the selected pay period.</div>
        <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
          <button class="btn btn-primary" type="button" @click="downloadPayrollExportCsv" :disabled="!selectedPeriodId || downloading">
            {{ downloading ? 'Downloading…' : 'Download Payroll Export CSV' }}
          </button>
        </div>
      </div>

      <div v-else-if="activeTab === 'pay_summary'" style="margin-top: 10px;">
        <div class="hint">Salary, service pay, adjustments, and totals by provider.</div>
        <div class="hint" style="margin-top: 6px;">
          <label style="display: inline-flex; gap: 8px; align-items: center;">
            <input type="checkbox" v-model="combinePeriods" :disabled="periodMode === 'single'" />
            Combine periods (sum totals across range)
          </label>
        </div>
        <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
          <button class="btn btn-secondary" type="button" @click="previewPaySummary" :disabled="!selectedPeriodId || previewLoading || downloading">
            {{ previewLoading ? 'Loading…' : 'Preview table' }}
          </button>
          <button class="btn btn-primary" type="button" @click="downloadPaySummaryCsv" :disabled="!selectedPeriodId || downloading">
            {{ downloading ? 'Working…' : 'Download Pay Summary CSV' }}
          </button>
        </div>
        <div v-if="previewError" class="warn-box" style="margin-top: 10px;">{{ previewError }}</div>
        <div v-else-if="previewLoading" class="muted" style="margin-top: 10px;">Loading preview…</div>
        <div v-else-if="previewHeaders.length" class="table-wrap" style="margin-top: 10px;">
          <div class="hint" style="margin-bottom: 8px;">
            Showing <strong>{{ Math.min(50, previewRows.length) }}</strong> of <strong>{{ previewRows.length }}</strong>
          </div>
          <table class="table">
            <thead><tr><th v-for="h in previewHeaders" :key="`ph2-${h}`">{{ headerLabel(h) }}</th></tr></thead>
            <tbody>
              <tr v-for="(r, idx) in previewRows.slice(0, 50)" :key="`pr2-${idx}`">
                <td v-for="h in previewHeaders" :key="`pc2-${idx}-${h}`">{{ r[h] }}</td>
              </tr>
              <tr v-if="!previewRows.length">
                <td :colspan="previewHeaders.length" class="muted">No rows found for this period/filters.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="activeTab === 'adjustments'" style="margin-top: 10px;">
        <div class="hint">All adjustment line items by provider (taxable/non-taxable, amount, bucket).</div>
        <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
          <button class="btn btn-secondary" type="button" @click="previewAdjustments" :disabled="!selectedPeriodId || previewLoading || downloading">
            {{ previewLoading ? 'Loading…' : 'Preview table' }}
          </button>
          <button class="btn btn-primary" type="button" @click="downloadAdjustmentsCsv" :disabled="!selectedPeriodId || downloading">
            {{ downloading ? 'Working…' : 'Download Adjustments CSV' }}
          </button>
        </div>
        <div v-if="previewError" class="warn-box" style="margin-top: 10px;">{{ previewError }}</div>
        <div v-else-if="previewLoading" class="muted" style="margin-top: 10px;">Loading preview…</div>
        <div v-else-if="previewHeaders.length" class="table-wrap" style="margin-top: 10px;">
          <div class="hint" style="margin-bottom: 8px;">
            Showing <strong>{{ Math.min(50, previewRows.length) }}</strong> of <strong>{{ previewRows.length }}</strong>
          </div>
          <table class="table">
            <thead><tr><th v-for="h in previewHeaders" :key="`ph3-${h}`">{{ headerLabel(h) }}</th></tr></thead>
            <tbody>
              <tr v-for="(r, idx) in previewRows.slice(0, 50)" :key="`pr3-${idx}`">
                <td v-for="h in previewHeaders" :key="`pc3-${idx}-${h}`">{{ r[h] }}</td>
              </tr>
              <tr v-if="!previewRows.length">
                <td :colspan="previewHeaders.length" class="muted">No rows found for this period/filters.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="activeTab === 'late_notes'" style="margin-top: 10px;">
        <div class="hint">Totals for notes paid late (carryover) broken into Old Note / Code Changed / Late Addition.</div>
        <div class="hint" style="margin-top: 6px;">
          This report produces <strong>one row per pay period</strong> for the selected period/range.
        </div>

        <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
          <button class="btn btn-secondary" type="button" @click="previewLateNotes" :disabled="!selectedPeriodId || previewLoading || downloading">
            {{ previewLoading ? 'Loading…' : 'Preview table' }}
          </button>
          <button class="btn btn-primary" type="button" @click="downloadLateNotesCsv" :disabled="!selectedPeriodId || downloading">
            {{ downloading ? 'Working…' : 'Download Late Notes CSV' }}
          </button>
        </div>

        <div v-if="previewError" class="warn-box" style="margin-top: 10px;">{{ previewError }}</div>
        <div v-else-if="previewLoading" class="muted" style="margin-top: 10px;">Loading preview…</div>
        <div v-else-if="previewHeaders.length" class="table-wrap" style="margin-top: 10px;">
          <div class="hint" style="margin-bottom: 8px;">
            Showing <strong>{{ Math.min(50, previewRows.length) }}</strong> of <strong>{{ previewRows.length }}</strong>
          </div>
          <table class="table">
            <thead><tr><th v-for="h in previewHeaders" :key="`ph-ln-${h}`">{{ headerLabel(h) }}</th></tr></thead>
            <tbody>
              <tr v-for="(r, idx) in previewRows.slice(0, 50)" :key="`pr-ln-${idx}`">
                <td v-for="h in previewHeaders" :key="`pc-ln-${idx}-${h}`">{{ r[h] }}</td>
              </tr>
              <tr v-if="!previewRows.length">
                <td :colspan="previewHeaders.length" class="muted">No rows found for this period/filters.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else style="margin-top: 10px;">
        <div class="hint" v-if="activeTab === 'sessions'">Choose how to group and which columns to include, then download CSV.</div>
        <div class="hint" v-else>Totals by service code (optionally filtered to selected providers), then download CSV.</div>

        <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
          <div class="field">
            <label>Group by</label>
            <select v-model="sessionsGroupBy">
              <option value="provider">Provider</option>
              <option value="provider_service_code">Provider + Service code</option>
              <option value="service_code">Service code only</option>
            </select>
          </div>
          <div class="field">
            <label>Include columns</label>
            <div class="hint" style="margin-top: 6px;">
              <label style="display: inline-flex; gap: 8px; align-items: center; margin-right: 12px;">
                <input type="checkbox" v-model="cols.sessionCount" />
                Sessions
              </label>
              <label style="display: inline-flex; gap: 8px; align-items: center; margin-right: 12px;">
                <input type="checkbox" v-model="cols.unitsTotal" />
                Units
              </label>
              <label style="display: inline-flex; gap: 8px; align-items: center;">
                <input type="checkbox" v-model="cols.statusBreakdown" />
                Breakdown by status
              </label>
            </div>
          </div>
        </div>
        <div class="hint" style="margin-top: 6px;">
          <label style="display: inline-flex; gap: 8px; align-items: center;">
            <input type="checkbox" v-model="combinePeriods" :disabled="periodMode === 'single'" />
            Combine periods (sum totals across range)
          </label>
        </div>

        <div class="actions" style="margin-top: 10px; justify-content: space-between;">
          <div class="hint muted" style="margin: 0;">
            Preview shows the first 50 rows.
          </div>
          <div class="actions" style="margin: 0;">
            <button class="btn btn-secondary" type="button" @click="previewSessionsUnits" :disabled="!selectedPeriodId || previewLoading || downloading">
              {{ previewLoading ? 'Loading…' : 'Preview table' }}
            </button>
            <button class="btn btn-primary" type="button" @click="downloadSessionsUnitsCsv" :disabled="!selectedPeriodId || downloading">
              {{ downloading ? 'Working…' : 'Download Sessions/Units CSV' }}
            </button>
          </div>
        </div>

        <div v-if="previewError" class="warn-box" style="margin-top: 10px;">{{ previewError }}</div>
        <div v-else-if="previewLoading" class="muted" style="margin-top: 10px;">Loading preview…</div>
        <div v-else-if="previewHeaders.length" class="table-wrap" style="margin-top: 10px;">
          <div class="hint" style="margin-bottom: 8px;">
            Showing <strong>{{ Math.min(50, previewRows.length) }}</strong> of <strong>{{ previewRows.length }}</strong>
          </div>
          <div class="hint" style="margin-bottom: 8px;" v-if="previewTotals">
            Totals:
            <strong v-if="previewTotals.session_count !== null">{{ previewTotals.session_count }}</strong><span v-if="previewTotals.session_count !== null"> sessions</span>
            <span v-if="previewTotals.session_count !== null && previewTotals.units_total !== null"> • </span>
            <strong v-if="previewTotals.units_total !== null">{{ previewTotals.units_total }}</strong><span v-if="previewTotals.units_total !== null"> units</span>
          </div>
          <table class="table">
            <thead>
              <tr>
                <th v-for="h in previewHeaders" :key="`ph-${h}`">{{ headerLabel(h) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="previewTotalsRow">
                <td v-for="h in previewHeaders" :key="`pt-${h}`">
                  <strong>{{ previewTotalsRow[h] }}</strong>
                </td>
              </tr>
              <tr v-for="(r, idx) in previewRows.slice(0, 50)" :key="`pr-${idx}`">
                <td v-for="h in previewHeaders" :key="`pc-${idx}-${h}`">{{ r[h] }}</td>
              </tr>
              <tr v-if="!previewRows.length">
                <td :colspan="previewHeaders.length" class="muted">No rows found for this period/filters.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const error = ref('');
const downloading = ref(false);

// Org context
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);

// Periods
const periods = ref([]);
const selectedPeriodId = ref(null);
const periodMode = ref('single'); // single | range
const rangeStartYmd = ref('');
const rangeEndYmd = ref('');
const rangePreset = ref('');
const combinePeriods = ref(true);

// Providers (for filtering)
const providers = ref([]);
const providerSearch = ref('');
const selectedProviderIds = ref([]);
const onlyProvidersWithRows = ref(false);
const onlyProvidersWithNoNote = ref(false);
const showInactiveProviders = ref(true);
const hideInactiveProviders = ref(false);
const roleFilter = ref('all'); // all | provider | staff | supervisor | cpa | admin | other
const providerStatsLoading = ref(false);
const providerStatsByUserId = ref(new Map()); // userId -> { session_count, no_note_session_count }

const activeTab = ref('sessions'); // export | sessions | service_codes | late_notes | pay_summary | adjustments
const sessionsGroupBy = ref('provider');
const cols = ref({
  sessionCount: true,
  unitsTotal: true,
  statusBreakdown: true
});

const previewLoading = ref(false);
const previewError = ref('');
const previewRows = ref([]);
const previewHeaders = ref([]);
const previewTotals = ref(null);
const previewTotalsRow = ref(null);

const periodRangeLabel = (p) => {
  const ps = String(p?.period_start || p?.periodStart || '').slice(0, 10);
  const pe = String(p?.period_end || p?.periodEnd || '').slice(0, 10);
  const st = String(p?.status || '').toLowerCase();
  return `${ps} → ${pe}${st ? ` (${st})` : ''}`;
};

const selectedPeriodForUi = computed(() => {
  const id = Number(selectedPeriodId.value || 0);
  return (periods.value || []).find((p) => Number(p?.id) === id) || null;
});

const selectedPeriodsEffective = computed(() => {
  if (periodMode.value !== 'range') return [];
  const start = String(rangeStartYmd.value || '').slice(0, 10);
  const end = String(rangeEndYmd.value || '').slice(0, 10);
  if (!start || !end) return [];
  // include periods that overlap the range: period_end >= start && period_start <= end
  return (periods.value || [])
    .filter((p) => {
      const ps = String(p?.period_start || '').slice(0, 10);
      const pe = String(p?.period_end || '').slice(0, 10);
      return pe >= start && ps <= end;
    })
    .sort((a, b) => String(a?.period_start || '').localeCompare(String(b?.period_start || '')));
});

const applyRangePreset = () => {
  const now = new Date();
  const y = now.getFullYear();
  const pad2 = (n) => String(n).padStart(2, '0');
  const today = `${y}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  if (rangePreset.value === 'this_year') {
    rangeStartYmd.value = `${y}-01-01`;
    rangeEndYmd.value = `${y}-12-31`;
  } else if (rangePreset.value === 'last_year') {
    rangeStartYmd.value = `${y - 1}-01-01`;
    rangeEndYmd.value = `${y - 1}-12-31`;
  } else if (rangePreset.value === 'ytd') {
    rangeStartYmd.value = `${y}-01-01`;
    rangeEndYmd.value = today;
  }
};

const effectivePeriodIds = () => {
  if (periodMode.value === 'range') return selectedPeriodsEffective.value.map((p) => Number(p.id)).filter(Boolean);
  return selectedPeriodId.value ? [Number(selectedPeriodId.value)] : [];
};

const lateNotesHeaders = [
  'period_start',
  'period_end',
  'status',
  'total_notes',
  'total_units',
  'old_note_notes',
  'old_note_units',
  'code_changed_notes',
  'code_changed_units',
  'late_addition_notes',
  'late_addition_units'
];

const toLateNotesRow = (r) => {
  const t = r?.totals || {};
  return {
    period_start: String(r?.periodStart || '').slice(0, 10),
    period_end: String(r?.periodEnd || '').slice(0, 10),
    status: String(r?.status || ''),
    total_notes: Number(t?.totalNotes || 0),
    total_units: Number(t?.totalUnits || 0),
    old_note_notes: Number(t?.oldNoteNotes || 0),
    old_note_units: Number(t?.oldNoteUnits || 0),
    code_changed_notes: Number(t?.codeChangedNotes || 0),
    code_changed_units: Number(t?.codeChangedUnits || 0),
    late_addition_notes: Number(t?.lateAdditionNotes || 0),
    late_addition_units: Number(t?.lateAdditionUnits || 0)
  };
};

const previewLateNotes = async () => {
  const pids = effectivePeriodIds();
  if (!pids.length) return;
  previewLoading.value = true;
  previewError.value = '';
  previewRows.value = [];
  previewHeaders.value = lateNotesHeaders.slice();
  previewTotals.value = null;
  previewTotalsRow.value = null;
  try {
    const params = {};
    if (selectedProviderIds.value.length) params.providerIds = selectedProviderIds.value.join(',');
    const all = [];
    for (const pid of pids) {
      const resp = await api.get(`/payroll/periods/${pid}/reports/late-notes`, { params });
      all.push(toLateNotesRow(resp.data || null));
    }
    all.sort((a, b) => String(a.period_start || '').localeCompare(String(b.period_start || '')));
    previewRows.value = all;
  } catch (e) {
    previewError.value = e.response?.data?.error?.message || e.message || 'Failed to load late notes report';
  } finally {
    previewLoading.value = false;
  }
};

const downloadLateNotesCsv = async () => {
  const pids = effectivePeriodIds();
  if (!pids.length) return;
  downloading.value = true;
  error.value = '';
  try {
    const params = {};
    if (selectedProviderIds.value.length) params.providerIds = selectedProviderIds.value.join(',');
    const rows = [];
    for (const pid of pids) {
      const resp = await api.get(`/payroll/periods/${pid}/reports/late-notes`, { params });
      rows.push(toLateNotesRow(resp.data || null));
    }
    rows.sort((a, b) => String(a.period_start || '').localeCompare(String(b.period_start || '')));
    const csv = toCsv(rows, lateNotesHeaders);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'payroll-late-notes.csv');
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to download late notes CSV';
  } finally {
    downloading.value = false;
  }
};

const isInactive = (u) => {
  // server may include is_active; fall back to role-only assumptions if absent.
  if (u?.is_active === 0 || u?.is_active === false) return true;
  if (u?.is_active === 1 || u?.is_active === true) return false;
  return false;
};

const roleKey = (u) => String(u?.role || '').trim().toLowerCase();

const filteredProviders = computed(() => {
  const q = String(providerSearch.value || '').trim().toLowerCase();
  const all = (providers.value || []).slice().sort((a, b) => {
    const al = String(a?.last_name || '').toLowerCase();
    const bl = String(b?.last_name || '').toLowerCase();
    return al.localeCompare(bl) || String(a?.first_name || '').toLowerCase().localeCompare(String(b?.first_name || '').toLowerCase());
  });
  let filtered = all;

  // Role filter
  if (roleFilter.value && roleFilter.value !== 'all') {
    filtered = filtered.filter((u) => {
      const r = roleKey(u);
      if (roleFilter.value === 'provider') return r === 'provider';
      if (roleFilter.value === 'staff') return r === 'staff';
      if (roleFilter.value === 'supervisor') return r === 'supervisor';
      if (roleFilter.value === 'cpa') return r === 'clinical_practice_assistant' || r === 'cpa';
      if (roleFilter.value === 'admin') return r === 'admin' || r === 'super_admin';
      if (roleFilter.value === 'other') return !['provider', 'staff', 'supervisor', 'clinical_practice_assistant', 'cpa', 'admin', 'super_admin'].includes(r);
      return true;
    });
  }

  // Inactive filters/highlighting
  if (hideInactiveProviders.value) {
    filtered = filtered.filter((u) => !isInactive(u));
  } else if (!showInactiveProviders.value) {
    filtered = filtered.filter((u) => !isInactive(u));
  }

  const stats = providerStatsByUserId.value;
  if (onlyProvidersWithRows.value && selectedPeriodId.value && stats && stats.size) {
    filtered = filtered.filter((u) => Number(stats.get(Number(u.id))?.session_count || 0) > 0);
  }
  if (onlyProvidersWithNoNote.value && selectedPeriodId.value && stats && stats.size) {
    filtered = filtered.filter((u) => Number(stats.get(Number(u.id))?.no_note_session_count || 0) > 0);
  }
  if (!q) return filtered;
  return filtered.filter((u) => {
    const name = String(providerLabel(u) || '').toLowerCase();
    return name.includes(q);
  });
});

const providerLabel = (u) => {
  const last = String(u?.last_name ?? u?.lastName ?? '').trim();
  const first = String(u?.first_name ?? u?.firstName ?? '').trim();
  const full = `${last}${last && first ? ', ' : ''}${first}`.trim();
  if (full) return full;
  const providerName = String(u?.provider_name ?? u?.providerName ?? '').trim();
  if (providerName) return providerName;
  const email = String(u?.email || '').trim();
  if (email) return email;
  const id = Number(u?.id || 0);
  return id ? `User #${id}` : '—';
};

const providerLabelShort = (u) => {
  const last = String(u?.last_name ?? u?.lastName ?? '').trim();
  const first = String(u?.first_name ?? u?.firstName ?? '').trim();
  if (last && first) return `${last}, ${first.slice(0, 1)}.`;
  return providerLabel(u);
};

const selectAllProviders = () => {
  selectedProviderIds.value = filteredProviders.value.map((u) => u.id);
};
const clearProviders = () => {
  selectedProviderIds.value = [];
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

const toCsv = (rows, headers) => {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const lines = [];
  lines.push(headers.map(esc).join(','));
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h])).join(','));
  }
  return lines.join('\n');
};

const buildSessionsUnitsHeaders = () => {
  const headers = [];
  if (sessionsGroupBy.value === 'service_code') {
    headers.push('service_code');
  } else {
    headers.push('provider_name');
    if (sessionsGroupBy.value === 'provider_service_code') headers.push('service_code');
  }
  if (cols.value.sessionCount) headers.push('session_count');
  if (cols.value.unitsTotal) headers.push('units_total');
  if (cols.value.statusBreakdown) {
    headers.push('no_note_session_count', 'draft_session_count', 'finalized_session_count');
    headers.push('no_note_units_total', 'draft_units_total', 'finalized_units_total');
  }
  return headers;
};

const normalizeSessionsUnitsRows = (rows) => {
  return (rows || []).map((r) => {
    const providerName =
      (r.last_name || r.first_name)
        ? `${r.last_name || ''}, ${r.first_name || ''}`.replace(/^,\s*/, '').trim()
        : (r.provider_name || '—');
    return {
      provider_name: sessionsGroupBy.value === 'service_code' ? '' : providerName,
      service_code: r.service_code || '',
      session_count: Number(r.session_count || 0),
      units_total: Number(r.units_total || 0),
      no_note_session_count: Number(r.no_note_session_count || 0),
      draft_session_count: Number(r.draft_session_count || 0),
      finalized_session_count: Number(r.finalized_session_count || 0),
      no_note_units_total: Number(r.no_note_units_total || 0),
      draft_units_total: Number(r.draft_units_total || 0),
      finalized_units_total: Number(r.finalized_units_total || 0)
    };
  });
};

const sumForKey = (rows, key) => (rows || []).reduce((a, r) => a + Number(r?.[key] || 0), 0);

const computePreviewTotals = (rows, headers) => {
  const hs = Array.isArray(headers) ? headers : [];
  if (!hs.length) return { totals: null, totalsRow: null };

  const totalsRow = {};
  if (hs.includes('provider_name')) totalsRow.provider_name = 'TOTALS';
  if (hs.includes('service_code')) totalsRow.service_code = '';

  const setSumIfIncluded = (k) => {
    if (!hs.includes(k)) return;
    totalsRow[k] = sumForKey(rows, k);
  };

  setSumIfIncluded('session_count');
  setSumIfIncluded('units_total');
  setSumIfIncluded('no_note_session_count');
  setSumIfIncluded('draft_session_count');
  setSumIfIncluded('finalized_session_count');
  setSumIfIncluded('no_note_units_total');
  setSumIfIncluded('draft_units_total');
  setSumIfIncluded('finalized_units_total');

  for (const h of hs) {
    if (totalsRow[h] === undefined) totalsRow[h] = '';
  }

  const totals = {
    session_count: hs.includes('session_count') ? Number(totalsRow.session_count || 0) : null,
    units_total: hs.includes('units_total') ? Number(totalsRow.units_total || 0) : null
  };

  return { totals, totalsRow };
};

const headerLabel = (key) => {
  const map = {
    provider_name: 'Provider',
    service_code: 'Service code',
    session_count: 'Sessions',
    units_total: 'Units',
    no_note_session_count: 'No-note sessions',
    draft_session_count: 'Draft sessions',
    finalized_session_count: 'Finalized sessions',
    no_note_units_total: 'No-note units',
    draft_units_total: 'Draft units',
    finalized_units_total: 'Finalized units',
    salary_amount: 'Salary',
    salary_include_service_pay: 'Salary includes service pay',
    service_pay_amount: 'Service pay (computed)',
    service_pay_paid_amount: 'Service pay (paid)',
    adjustments_total: 'Adjustments total',
    taxable_adjustments_total: 'Taxable adjustments',
    non_taxable_total: 'Non-taxable total',
    total_pay: 'Total pay',
    type: 'Type',
    label: 'Label',
    taxable: 'Taxable',
    bucket: 'Bucket',
    amount: 'Amount',
    credits_hours: 'Credits hours'
  };
  return map[key] || String(key || '');
};

const copyShareLink = async () => {
  try {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
  } catch {
    // Fallback: copy via hidden textarea
    try {
      const el = document.createElement('textarea');
      el.value = window.location.href;
      el.setAttribute('readonly', 'true');
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    } catch {
      // ignore
    }
  }
};

const downloadPayrollExportCsv = async () => {
  if (!selectedPeriodId.value) return;
  downloading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/export.csv`, { responseType: 'blob' });
    const ps = String(selectedPeriodForUi.value?.period_start || '').slice(0, 10);
    const pe = String(selectedPeriodForUi.value?.period_end || '').slice(0, 10);
    const filename = (ps && pe) ? `${ps}-${pe}.csv` : `payroll-export-period-${selectedPeriodId.value}.csv`;
    downloadBlob(resp.data, filename);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to download payroll export CSV';
  } finally {
    downloading.value = false;
  }
};

const previewSessionsUnits = async () => {
  const pids = effectivePeriodIds();
  if (!pids.length) return;
  previewLoading.value = true;
  previewError.value = '';
  previewRows.value = [];
  previewHeaders.value = buildSessionsUnitsHeaders();
  previewTotals.value = null;
  previewTotalsRow.value = null;

  try {
    const providerIds = (selectedProviderIds.value || []).slice().map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const params = {
      groupBy: sessionsGroupBy.value,
      providerIds: providerIds.length ? providerIds.join(',') : ''
    };
    const all = [];
    for (const pid of pids.slice(0, 60)) {
      const resp = await api.get(`/payroll/periods/${pid}/reports/sessions-units`, { params });
      const rows = Array.isArray(resp.data?.rows) ? resp.data.rows : [];
      const normalized = normalizeSessionsUnitsRows(rows).map((r) => ({
        ...r,
        period_id: pid
      }));
      all.push(...normalized);
    }
    const merged = combinePeriods.value && periodMode.value === 'range'
      ? mergeRowsByKey(all, sessionsGroupBy.value)
      : all;
    previewRows.value = merged;
    const computed = computePreviewTotals(merged, previewHeaders.value);
    previewTotals.value = computed.totals;
    previewTotalsRow.value = computed.totalsRow;
  } catch (e) {
    previewError.value = e.response?.data?.error?.message || e.message || 'Failed to load preview';
  } finally {
    previewLoading.value = false;
  }
};

const downloadSessionsUnitsCsv = async () => {
  const pids = effectivePeriodIds();
  if (!pids.length) return;
  downloading.value = true;
  error.value = '';
  try {
    const providerIds = (selectedProviderIds.value || []).slice().map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const params = {
      groupBy: sessionsGroupBy.value,
      providerIds: providerIds.length ? providerIds.join(',') : ''
    };
    const all = [];
    for (const pid of pids.slice(0, 60)) {
      const resp = await api.get(`/payroll/periods/${pid}/reports/sessions-units`, { params });
      const rows = Array.isArray(resp.data?.rows) ? resp.data.rows : [];
      all.push(...normalizeSessionsUnitsRows(rows).map((r) => ({ ...r, period_id: pid })));
    }

    const headers = buildSessionsUnitsHeaders();
    const normalized = combinePeriods.value && periodMode.value === 'range'
      ? mergeRowsByKey(all, sessionsGroupBy.value)
      : all;

    const csv = toCsv(normalized, headers);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const suffix = sessionsGroupBy.value === 'service_code' ? 'service-codes' : 'sessions-units';
    const fnameSuffix = periodMode.value === 'range' ? `${rangeStartYmd.value}-to-${rangeEndYmd.value}` : `period-${pids[0]}`;
    downloadBlob(blob, `payroll-${suffix}-${fnameSuffix}.csv`);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to download sessions/units report';
  } finally {
    downloading.value = false;
  }
};

const previewPaySummary = async () => {
  const pids = effectivePeriodIds();
  if (!pids.length) return;
  previewLoading.value = true;
  previewError.value = '';
  previewRows.value = [];
  previewHeaders.value = [
    'provider_name',
    'salary_amount',
    'salary_include_service_pay',
    'service_pay_amount',
    'service_pay_paid_amount',
    'adjustments_total',
    'taxable_adjustments_total',
    'non_taxable_total',
    'total_pay'
  ];
  try {
    const providerIds = (selectedProviderIds.value || []).slice().map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const params = { providerIds: providerIds.length ? providerIds.join(',') : '' };
    const all = [];
    for (const pid of pids.slice(0, 60)) {
      const resp = await api.get(`/payroll/periods/${pid}/reports/provider-pay-summary`, { params });
      const rows = Array.isArray(resp.data?.rows) ? resp.data.rows : [];
      all.push(...rows.map((r) => ({ ...r, period_id: pid })));
    }
    previewRows.value = combinePeriods.value && periodMode.value === 'range' ? mergePaySummaryRows(all) : all;
  } catch (e) {
    previewError.value = e.response?.data?.error?.message || e.message || 'Failed to load preview';
  } finally {
    previewLoading.value = false;
  }
};

const downloadPaySummaryCsv = async () => {
  const pids = effectivePeriodIds();
  if (!pids.length) return;
  downloading.value = true;
  error.value = '';
  try {
    const providerIds = (selectedProviderIds.value || []).slice().map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const params = { providerIds: providerIds.length ? providerIds.join(',') : '' };
    const all = [];
    for (const pid of pids.slice(0, 60)) {
      const resp = await api.get(`/payroll/periods/${pid}/reports/provider-pay-summary`, { params });
      const rows = Array.isArray(resp.data?.rows) ? resp.data.rows : [];
      all.push(...rows.map((r) => ({ ...r, period_id: pid })));
    }
    const rows = combinePeriods.value && periodMode.value === 'range' ? mergePaySummaryRows(all) : all;
    const headers = [
      'provider_name',
      'salary_amount',
      'salary_include_service_pay',
      'service_pay_amount',
      'service_pay_paid_amount',
      'adjustments_total',
      'taxable_adjustments_total',
      'non_taxable_total',
      'total_pay'
    ];
    const csv = toCsv(rows, headers);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const fnameSuffix = periodMode.value === 'range' ? `${rangeStartYmd.value}-to-${rangeEndYmd.value}` : `period-${pids[0]}`;
    downloadBlob(blob, `payroll-pay-summary-${fnameSuffix}.csv`);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to download pay summary';
  } finally {
    downloading.value = false;
  }
};

const previewAdjustments = async () => {
  const pids = effectivePeriodIds();
  if (!pids.length) return;
  previewLoading.value = true;
  previewError.value = '';
  previewRows.value = [];
  previewHeaders.value = ['provider_name', 'type', 'label', 'taxable', 'bucket', 'amount', 'credits_hours'];
  try {
    const providerIds = (selectedProviderIds.value || []).slice().map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const params = { providerIds: providerIds.length ? providerIds.join(',') : '' };
    const all = [];
    for (const pid of pids.slice(0, 60)) {
      const resp = await api.get(`/payroll/periods/${pid}/reports/adjustments-breakdown`, { params });
      const rows = Array.isArray(resp.data?.rows) ? resp.data.rows : [];
      all.push(...rows.map((r) => ({ ...r, period_id: pid })));
    }
    previewRows.value = all;
  } catch (e) {
    previewError.value = e.response?.data?.error?.message || e.message || 'Failed to load preview';
  } finally {
    previewLoading.value = false;
  }
};

const downloadAdjustmentsCsv = async () => {
  const pids = effectivePeriodIds();
  if (!pids.length) return;
  downloading.value = true;
  error.value = '';
  try {
    const providerIds = (selectedProviderIds.value || []).slice().map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const params = { providerIds: providerIds.length ? providerIds.join(',') : '' };
    const all = [];
    for (const pid of pids.slice(0, 60)) {
      const resp = await api.get(`/payroll/periods/${pid}/reports/adjustments-breakdown`, { params });
      const rows = Array.isArray(resp.data?.rows) ? resp.data.rows : [];
      all.push(...rows.map((r) => ({ ...r, period_id: pid })));
    }
    const headers = ['provider_name', 'type', 'label', 'taxable', 'bucket', 'amount', 'credits_hours'];
    const csv = toCsv(all, headers);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const fnameSuffix = periodMode.value === 'range' ? `${rangeStartYmd.value}-to-${rangeEndYmd.value}` : `period-${pids[0]}`;
    downloadBlob(blob, `payroll-adjustments-breakdown-${fnameSuffix}.csv`);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to download adjustments breakdown';
  } finally {
    downloading.value = false;
  }
};

const mergeRowsByKey = (rows, groupBy) => {
  const gb = String(groupBy || 'provider');
  const keyFor = (r) => {
    if (gb === 'service_code') return `code|${r.service_code || ''}`;
    if (gb === 'provider_service_code') return `provcode|${r.provider_name || ''}|${r.service_code || ''}`;
    return `prov|${r.provider_name || ''}`;
  };
  const sumKeys = [
    'session_count',
    'units_total',
    'no_note_session_count',
    'draft_session_count',
    'finalized_session_count',
    'no_note_units_total',
    'draft_units_total',
    'finalized_units_total'
  ];
  const map = new Map();
  for (const r of rows || []) {
    const k = keyFor(r);
    const cur = map.get(k) || { ...r };
    for (const sk of sumKeys) {
      cur[sk] = Number(cur[sk] || 0) + Number(r?.[sk] || 0);
    }
    map.set(k, cur);
  }
  return Array.from(map.values());
};

const mergePaySummaryRows = (rows) => {
  const sumKeys = [
    'salary_amount',
    'service_pay_amount',
    'service_pay_paid_amount',
    'adjustments_total',
    'taxable_adjustments_total',
    'non_taxable_total',
    'total_pay'
  ];
  const map = new Map(); // provider_name -> row
  for (const r of rows || []) {
    const k = String(r?.provider_name || '');
    const cur = map.get(k) || { ...r };
    for (const sk of sumKeys) {
      cur[sk] = Number(cur[sk] || 0) + Number(r?.[sk] || 0);
    }
    cur.salary_include_service_pay = Number(cur.salary_include_service_pay || 0) || Number(r?.salary_include_service_pay || 0) ? 1 : 0;
    map.set(k, cur);
  }
  return Array.from(map.values());
};

const loadPeriods = async () => {
  if (!agencyId.value) return;
  const resp = await api.get('/payroll/periods', { params: { agencyId: agencyId.value, alignedOnly: 'true' } });
  periods.value = resp.data || [];
};

const loadProviders = async () => {
  if (!agencyId.value) return;
  // Reuse payroll-scoped agency users endpoint (same as PayrollView).
  const r = await api.get('/payroll/agency-users', { params: { agencyId: agencyId.value, includeInactive: 'true' } });
  providers.value = Array.isArray(r.data) ? r.data : [];
};

const loadProviderStatsForPeriod = async () => {
  providerStatsByUserId.value = new Map();
  if (!selectedPeriodId.value) return;
  try {
    providerStatsLoading.value = true;
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/reports/sessions-units`, { params: { groupBy: 'provider' } });
    const rows = Array.isArray(resp.data?.rows) ? resp.data.rows : [];
    const map = new Map();
    for (const r of rows) {
      const uid = Number(r?.user_id || 0);
      if (!uid) continue;
      map.set(uid, {
        session_count: Number(r?.session_count || 0),
        no_note_session_count: Number(r?.no_note_session_count || 0)
      });
    }
    providerStatsByUserId.value = map;
  } catch {
    providerStatsByUserId.value = new Map();
  } finally {
    providerStatsLoading.value = false;
  }
};

onMounted(async () => {
  // Ensure agencies are loaded for super_admin context, so currentAgency exists.
  if (authStore.user?.role === 'super_admin') {
    await agencyStore.fetchAgencies();
  } else {
    await agencyStore.fetchUserAgencies();
  }

  await loadPeriods();
  await loadProviders();

  const qp = route.query?.periodId ? Number(route.query.periodId) : null;
  if (qp) selectedPeriodId.value = qp;

  const tabQ = String(route.query?.tab || '').trim().toLowerCase();
  if (tabQ === 'export' || tabQ === 'sessions' || tabQ === 'service_codes' || tabQ === 'pay_summary' || tabQ === 'adjustments') activeTab.value = tabQ;

  const groupQ = String(route.query?.groupBy || '').trim();
  if (groupQ === 'provider' || groupQ === 'provider_service_code' || groupQ === 'service_code') sessionsGroupBy.value = groupQ;

  const colsQ = String(route.query?.cols || '').trim().toLowerCase();
  if (colsQ) {
    const set = new Set(colsQ.split(',').map((x) => String(x || '').trim()).filter(Boolean));
    cols.value.sessionCount = set.has('sessions');
    cols.value.unitsTotal = set.has('units');
    cols.value.statusBreakdown = set.has('status');
  }

  const pidsQ = String(route.query?.providerIds || '').trim();
  if (pidsQ) {
    selectedProviderIds.value = pidsQ
      .split(',')
      .map((x) => parseInt(String(x || '').trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  // Prime provider stats if a period is already selected via URL.
  if (selectedPeriodId.value) await loadProviderStatsForPeriod();
});

watch(activeTab, (t) => {
  if (t === 'service_codes') {
    sessionsGroupBy.value = 'service_code';
  } else if (t === 'sessions' && sessionsGroupBy.value === 'service_code') {
    sessionsGroupBy.value = 'provider';
  }
});

watch(selectedPeriodId, async () => {
  // Refresh provider stats so filters can work.
  await loadProviderStatsForPeriod();
});

const serializeCols = () => {
  const out = [];
  if (cols.value.sessionCount) out.push('sessions');
  if (cols.value.unitsTotal) out.push('units');
  if (cols.value.statusBreakdown) out.push('status');
  return out.join(',');
};

watch([selectedPeriodId, activeTab, sessionsGroupBy, selectedProviderIds, cols], () => {
  const pid = Number(selectedPeriodId.value || 0);
  const providerIds = (selectedProviderIds.value || []).slice().map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  const q = {
    ...route.query,
    periodId: pid ? String(pid) : undefined,
    tab: String(activeTab.value || 'sessions'),
    groupBy: String(sessionsGroupBy.value || (activeTab.value === 'service_codes' ? 'service_code' : 'provider')),
    cols: serializeCols() || undefined,
    providerIds: providerIds.length ? providerIds.join(',') : undefined
  };
  // remove undefined keys so URL stays clean
  Object.keys(q).forEach((k) => (q[k] === undefined ? delete q[k] : null));
  router.replace({ query: q });
}, { deep: true });

watch([sessionsGroupBy, cols], () => {
  // Keep preview table columns aligned to current selections
  if (!previewHeaders.value.length) return;
  previewHeaders.value = buildSessionsUnitsHeaders();
  const computed = computePreviewTotals(previewRows.value, previewHeaders.value);
  previewTotals.value = computed.totals;
  previewTotalsRow.value = computed.totalsRow;
}, { deep: true });
</script>

<style scoped>
.pillbox {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
  max-height: 240px;
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
}
.pill {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 10px;
  background: #fff;
  max-width: 100%;
}

.pill.inactive {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.45);
}

.pill-text {
  display: inline-block;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

