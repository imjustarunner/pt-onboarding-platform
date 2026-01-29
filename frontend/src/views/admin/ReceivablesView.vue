<template>
  <div>
    <div class="card" style="margin-bottom: 12px;">
      <h2 class="card-title">Billing / Claims (Receivables)</h2>
      <div class="hint">Upload billing reports to track outstanding balances and create draft invoice tasks.</div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="success" class="success-box">{{ success }}</div>

    <div class="card" style="margin-bottom: 12px;">
      <h3 class="card-title" style="margin: 0 0 8px 0;">Upload billing report</h3>
      <input
        ref="fileInput"
        type="file"
        accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        @change="onFilePick"
      />
      <div class="hint" v-if="file">Selected: <strong>{{ file.name }}</strong></div>
      <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
        <button class="btn btn-secondary" type="button" @click="clearFile" :disabled="uploading || !file">Remove</button>
        <button class="btn btn-primary" type="button" @click="upload" :disabled="uploading || !file || !agencyId">
          {{ uploading ? 'Uploading…' : 'Upload' }}
        </button>
      </div>
    </div>

    <div class="card" style="margin-bottom: 12px;">
      <h3 class="card-title" style="margin: 0 0 8px 0;">Outstanding balances</h3>
      <div class="field-row" style="grid-template-columns: 1fr 1fr auto; align-items: end;">
        <div class="field">
          <label>Start</label>
          <input v-model="startYmd" type="date" />
        </div>
        <div class="field">
          <label>End</label>
          <input v-model="endYmd" type="date" />
        </div>
        <div class="field">
          <label>Presets</label>
          <select v-model="preset" @change="applyPreset">
            <option value="">Custom</option>
            <option value="this_year">This year</option>
            <option value="last_year">Last year</option>
            <option value="ytd">Year to date</option>
          </select>
        </div>
      </div>

      <div class="field-row" style="grid-template-columns: 220px 220px 1fr; align-items: end;">
        <div class="field">
          <label>View</label>
          <select v-model="worklistView">
            <option value="patients">Grouped by patient</option>
            <option value="rows">Raw rows</option>
          </select>
        </div>
        <div class="field">
          <label>Stage</label>
          <select v-model="stageFilter">
            <option value="all">All</option>
            <option value="current">Current</option>
            <option value="X">X (14-59 days)</option>
            <option value="Y">Y (60+ days)</option>
          </select>
        </div>
        <div class="field">
          <label>Aging bucket</label>
          <select v-model="bucketFilter">
            <option value="all">All</option>
            <option value="current">Current (0-13)</option>
            <option value="late_2w">2 weeks late (14-27)</option>
            <option value="late_4w">4+ weeks late (28-59)</option>
            <option value="collections_60">60+ (collections)</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
      </div>

      <div class="actions" style="margin-top: 10px; justify-content: space-between;">
        <div class="hint muted" style="margin: 0;">
          Showing <strong>{{ filteredOutstandingRows.length }}</strong> rows
        </div>
        <div class="actions" style="margin: 0;">
          <button class="btn btn-secondary" type="button" @click="refreshOutstanding" :disabled="loadingOutstanding || !agencyId">
            {{ loadingOutstanding ? 'Loading…' : 'Refresh' }}
          </button>
          <button class="btn btn-primary" type="button" @click="createDraftInvoice" :disabled="creatingInvoice || !selectedRowIds.length">
            {{ creatingInvoice ? 'Creating…' : `Create draft invoice (${selectedRowIds.length})` }}
          </button>
        </div>
      </div>

      <div class="table-wrap" style="margin-top: 10px;" v-if="worklistView === 'patients'">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 60px;"></th>
              <th>Patient</th>
              <th>Payer (top)</th>
              <th>Oldest DOS</th>
              <th>Max days overdue</th>
              <th>Stage</th>
              <th class="right">Total outstanding</th>
              <th class="right">Rows</th>
              <th style="width: 120px;"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="p in patientsWorklist" :key="p.key">
              <tr :class="{ highlightY: p.stage === 'Y' }">
                <td>
                  <input type="checkbox" :checked="p.allSelected" @change="togglePatientSelection(p, $event.target.checked)" />
                </td>
                <td><strong>{{ p.patient_name || '—' }}</strong></td>
                <td>{{ p.payer_name || '—' }}</td>
                <td>{{ p.oldest_service_date || '—' }}</td>
                <td>{{ p.max_days_overdue ?? '—' }}</td>
                <td><strong>{{ p.stage || '—' }}</strong></td>
                <td class="right"><strong>{{ fmtMoney(p.total_outstanding) }}</strong></td>
                <td class="right">{{ p.row_count }}</td>
                <td class="right">
                  <button class="btn btn-secondary btn-sm" type="button" @click="togglePatientExpand(p.key)">
                    {{ expandedPatients[p.key] ? 'Hide' : 'View' }}
                  </button>
                </td>
              </tr>
              <tr v-if="expandedPatients[p.key]">
                <td colspan="9" style="background: #fafafa;">
                  <div class="table-wrap" style="margin: 8px 0;">
                    <table class="table">
                      <thead>
                        <tr>
                          <th style="width: 60px;"></th>
                          <th>DOS</th>
                          <th>Days overdue</th>
                          <th>Bucket</th>
                          <th>Stage</th>
                          <th>Status</th>
                          <th class="right">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="r in p.rows" :key="r.id" :class="{ highlightY: r.suggested_collections_stage === 'Y' }">
                          <td><input type="checkbox" :value="r.id" v-model="selectedRowIds" /></td>
                          <td>{{ r.service_date }}</td>
                          <td>{{ r.days_overdue ?? '—' }}</td>
                          <td>{{ r.aging_bucket }}</td>
                          <td>{{ r.suggested_collections_stage || '—' }}</td>
                          <td>{{ r.patient_balance_status || '—' }}</td>
                          <td class="right"><strong>{{ fmtMoney(r.patient_outstanding_amount) }}</strong></td>
                        </tr>
                        <tr v-if="!p.rows.length">
                          <td colspan="7" class="muted">No rows.</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="!patientsWorklist.length">
              <td colspan="9" class="muted">No outstanding balances found for this filter.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="table-wrap" style="margin-top: 10px;" v-else>
        <table class="table">
          <thead>
            <tr>
              <th style="width: 60px;"></th>
              <th>DOS</th>
              <th>Days overdue</th>
              <th>Bucket</th>
              <th>Stage</th>
              <th>Patient</th>
              <th>Payer</th>
              <th class="right">Responsibility</th>
              <th class="right">Paid</th>
              <th class="right">Outstanding</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredOutstandingRows" :key="r.id" :class="{ highlightY: r.suggested_collections_stage === 'Y' }">
              <td>
                <input type="checkbox" :value="r.id" v-model="selectedRowIds" />
              </td>
              <td>{{ r.service_date }}</td>
              <td>{{ r.days_overdue ?? '—' }}</td>
              <td>{{ r.aging_bucket }}</td>
              <td><strong>{{ r.suggested_collections_stage || '—' }}</strong></td>
              <td>{{ r.patient_name || '—' }}</td>
              <td>{{ r.payer_name || '—' }}</td>
              <td class="right">{{ fmtMoney(r.patient_responsibility_amount) }}</td>
              <td class="right">{{ fmtMoney(r.patient_amount_paid) }}</td>
              <td class="right"><strong>{{ fmtMoney(r.patient_outstanding_amount) }}</strong></td>
              <td>{{ r.patient_balance_status || '—' }}</td>
            </tr>
            <tr v-if="!outstanding.length">
              <td colspan="11" class="muted">No outstanding balances found for this filter.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title" style="margin: 0 0 8px 0;">Draft invoice queue</h3>
      <div class="actions" style="justify-content: flex-end;">
        <button class="btn btn-secondary" type="button" @click="refreshInvoices" :disabled="loadingInvoices || !agencyId">
          {{ loadingInvoices ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Stage</th>
              <th>Due</th>
              <th>Created</th>
              <th>External</th>
              <th style="min-width: 220px;">External notes</th>
              <th style="width: 120px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in invoices" :key="i.id">
              <td>#{{ i.id }}</td>
              <td>
                <select v-model="invoiceEdits[i.id].status">
                  <option value="draft">draft</option>
                  <option value="sent">sent</option>
                  <option value="external">external</option>
                  <option value="closed">closed</option>
                </select>
              </td>
              <td>
                <select v-model="invoiceEdits[i.id].collections_stage">
                  <option value="">—</option>
                  <option value="X">X</option>
                  <option value="Y">Y</option>
                </select>
              </td>
              <td>
                <input v-model="invoiceEdits[i.id].due_date" type="date" />
              </td>
              <td>{{ (i.created_at || '').slice(0, 19) || '—' }}</td>
              <td>
                <input type="checkbox" v-model="invoiceEdits[i.id].external_flag" />
              </td>
              <td>
                <input v-model="invoiceEdits[i.id].external_notes" type="text" placeholder="Notes…" />
              </td>
              <td class="right">
                <button class="btn btn-primary btn-sm" type="button" @click="saveInvoice(i)" :disabled="savingInvoiceId === i.id">
                  {{ savingInvoiceId === i.id ? 'Saving…' : 'Save' }}
                </button>
              </td>
            </tr>
            <tr v-if="!invoices.length">
              <td colspan="8" class="muted">No draft invoices yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);

const error = ref('');
const success = ref('');

const fileInput = ref(null);
const file = ref(null);
const uploading = ref(false);

const outstanding = ref([]);
const loadingOutstanding = ref(false);
const selectedRowIds = ref([]);
const creatingInvoice = ref(false);
const worklistView = ref('patients'); // patients | rows
const bucketFilter = ref('all');
const stageFilter = ref('all');
const expandedPatients = ref({});

const invoices = ref([]);
const loadingInvoices = ref(false);
const invoiceEdits = ref({});
const savingInvoiceId = ref(null);

const startYmd = ref('');
const endYmd = ref('');
const preset = ref('ytd');

const pad2 = (n) => String(n).padStart(2, '0');
const applyPreset = () => {
  const now = new Date();
  const y = now.getFullYear();
  const today = `${y}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  if (preset.value === 'this_year') {
    startYmd.value = `${y}-01-01`;
    endYmd.value = `${y}-12-31`;
  } else if (preset.value === 'last_year') {
    startYmd.value = `${y - 1}-01-01`;
    endYmd.value = `${y - 1}-12-31`;
  } else if (preset.value === 'ytd') {
    startYmd.value = `${y}-01-01`;
    endYmd.value = today;
  }
};

const fmtMoney = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};

const filteredOutstandingRows = computed(() => {
  const list = (outstanding.value || []).slice();
  return list.filter((r) => {
    if (bucketFilter.value !== 'all' && String(r.aging_bucket || '') !== bucketFilter.value) return false;
    if (stageFilter.value !== 'all') {
      const st = String(r.suggested_collections_stage || '');
      if (stageFilter.value === 'current') {
        if (st) return false;
      } else if (st !== stageFilter.value) {
        return false;
      }
    }
    return true;
  });
});

const patientsWorklist = computed(() => {
  const rows = filteredOutstandingRows.value;
  const map = new Map();
  for (const r of rows) {
    const key = String(r.patient_name || '').trim().toLowerCase() || `row-${r.id}`;
    const cur = map.get(key) || {
      key,
      patient_name: r.patient_name || '',
      payer_name: r.payer_name || '',
      oldest_service_date: r.service_date || '',
      max_days_overdue: (r.days_overdue ?? null),
      stage: r.suggested_collections_stage || '',
      total_outstanding: 0,
      row_count: 0,
      rows: []
    };
    const dos = String(r.service_date || '');
    if (dos && (!cur.oldest_service_date || dos < cur.oldest_service_date)) cur.oldest_service_date = dos;
    const d = Number(r.days_overdue ?? -1);
    if (Number.isFinite(d) && (cur.max_days_overdue === null || d > cur.max_days_overdue)) cur.max_days_overdue = d;
    const st = String(r.suggested_collections_stage || '');
    // Promote stage to Y if any row is Y
    if (st === 'Y') cur.stage = 'Y';
    else if (!cur.stage && st === 'X') cur.stage = 'X';
    cur.total_outstanding += Number(r.patient_outstanding_amount || 0);
    cur.row_count += 1;
    cur.rows.push(r);
    map.set(key, cur);
  }
  const arr = Array.from(map.values());
  // decorate selection state
  for (const p of arr) {
    p.allSelected = (p.rows || []).every((x) => selectedRowIds.value.includes(x.id));
    // best-effort payer display: pick first non-empty
    if (!p.payer_name) p.payer_name = (p.rows || []).find((x) => x.payer_name)?.payer_name || '';
  }
  // sort by stage desc, then total outstanding desc
  arr.sort((a, b) => {
    const sa = a.stage === 'Y' ? 2 : (a.stage === 'X' ? 1 : 0);
    const sb = b.stage === 'Y' ? 2 : (b.stage === 'X' ? 1 : 0);
    if (sa !== sb) return sb - sa;
    return Number(b.total_outstanding || 0) - Number(a.total_outstanding || 0);
  });
  return arr;
});

const togglePatientExpand = (key) => {
  expandedPatients.value = { ...expandedPatients.value, [key]: !expandedPatients.value[key] };
};

const togglePatientSelection = (p, checked) => {
  const ids = (p.rows || []).map((r) => r.id);
  const cur = new Set(selectedRowIds.value);
  if (checked) {
    for (const id of ids) cur.add(id);
  } else {
    for (const id of ids) cur.delete(id);
  }
  selectedRowIds.value = Array.from(cur);
};

const onFilePick = (evt) => {
  file.value = evt.target.files?.[0] || null;
  success.value = '';
  error.value = '';
};
const clearFile = () => {
  file.value = null;
  if (fileInput.value) fileInput.value.value = '';
};

const upload = async () => {
  if (!file.value || !agencyId.value) return;
  uploading.value = true;
  error.value = '';
  success.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file.value);
    fd.append('agencyId', String(agencyId.value));
    const resp = await api.post('/receivables/uploads', fd);
    success.value = `Uploaded. Rows processed: ${resp.data?.file?.rows || 0}`;
    clearFile();
    await refreshOutstanding();
    await refreshInvoices();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Upload failed';
  } finally {
    uploading.value = false;
  }
};

const refreshOutstanding = async () => {
  if (!agencyId.value) return;
  loadingOutstanding.value = true;
  error.value = '';
  try {
    const resp = await api.get('/receivables/outstanding', {
      params: { agencyId: agencyId.value, start: startYmd.value || undefined, end: endYmd.value || undefined }
    });
    outstanding.value = resp.data?.rows || [];
    selectedRowIds.value = [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load outstanding';
  } finally {
    loadingOutstanding.value = false;
  }
};

const createDraftInvoice = async () => {
  if (!agencyId.value || !selectedRowIds.value.length) return;
  creatingInvoice.value = true;
  error.value = '';
  try {
    await api.post('/receivables/invoices/draft', { agencyId: agencyId.value, rowIds: selectedRowIds.value });
    success.value = 'Draft invoice created.';
    await refreshInvoices();
    await refreshOutstanding();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to create draft invoice';
  } finally {
    creatingInvoice.value = false;
  }
};

const refreshInvoices = async () => {
  if (!agencyId.value) return;
  loadingInvoices.value = true;
  error.value = '';
  try {
    const resp = await api.get('/receivables/invoices', { params: { agencyId: agencyId.value } });
    invoices.value = resp.data || [];
    const next = { ...invoiceEdits.value };
    for (const i of invoices.value || []) {
      next[i.id] = next[i.id] || {};
      next[i.id] = {
        status: String(i.status || 'draft'),
        collections_stage: String(i.collections_stage || ''),
        due_date: i.due_date ? String(i.due_date).slice(0, 10) : '',
        external_flag: !!Number(i.external_flag),
        external_notes: String(i.external_notes || '')
      };
    }
    invoiceEdits.value = next;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load invoices';
  } finally {
    loadingInvoices.value = false;
  }
};

const saveInvoice = async (inv) => {
  if (!agencyId.value || !inv?.id) return;
  const id = Number(inv.id);
  const edit = invoiceEdits.value?.[id] || {};
  savingInvoiceId.value = id;
  error.value = '';
  success.value = '';
  try {
    await api.patch(`/receivables/invoices/${id}`, {
      agencyId: agencyId.value,
      status: edit.status,
      collectionsStage: edit.collections_stage || null,
      externalFlag: !!edit.external_flag,
      externalNotes: edit.external_notes || null,
      dueDate: edit.due_date || null
    });
    success.value = `Invoice #${id} saved.`;
    await refreshInvoices();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save invoice';
  } finally {
    savingInvoiceId.value = null;
  }
};

onMounted(async () => {
  if (authStore.user?.role === 'super_admin') {
    await agencyStore.fetchAgencies();
  } else {
    await agencyStore.fetchUserAgencies();
  }
  applyPreset();
  await refreshOutstanding();
  await refreshInvoices();
});
</script>

<style scoped>
.highlightY {
  background: rgba(239, 68, 68, 0.08);
}
</style>

