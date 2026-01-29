<template>
  <div>
    <div class="card" style="margin-bottom: 12px;">
      <h2 class="card-title">Platform Revenue (Totals Upload)</h2>
      <div class="hint">Upload platform-level revenue totals (no client data). Super admin only.</div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="success" class="success-box">{{ success }}</div>

    <div class="card" style="margin-bottom: 12px;">
      <h3 class="card-title" style="margin: 0 0 8px 0;">Upload revenue report</h3>
      <div class="field-row" style="grid-template-columns: 1fr 1fr; align-items: end;">
        <div class="field">
          <label>Report label (optional)</label>
          <input v-model="reportLabel" type="text" placeholder="e.g. January 2026 revenue snapshot" />
        </div>
        <div class="field">
          <label>Report date</label>
          <input v-model="reportDate" type="date" />
        </div>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        @change="onFilePick"
      />
      <div class="hint" v-if="file">Selected: <strong>{{ file.name }}</strong></div>
      <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
        <button class="btn btn-secondary" type="button" @click="clearFile" :disabled="uploading || !file">Remove</button>
        <button class="btn btn-primary" type="button" @click="upload" :disabled="uploading || !file">
          {{ uploading ? 'Uploading…' : 'Upload' }}
        </button>
      </div>
    </div>

    <div class="card" style="margin-bottom: 12px;">
      <h3 class="card-title" style="margin: 0 0 8px 0;">Current summary (latest upload)</h3>
      <div class="actions" style="justify-content: flex-end;">
        <button class="btn btn-secondary" type="button" @click="refreshSummary" :disabled="loadingSummary">
          {{ loadingSummary ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <div v-if="summary?.totals" class="field-row" style="grid-template-columns: repeat(4, 1fr); margin-top: 10px;">
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Managed</div>
          <div style="font-size: 18px;"><strong>{{ fmtMoney(summary.totals.managed_total) }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Collected</div>
          <div style="font-size: 18px;"><strong>{{ fmtMoney(summary.totals.collected_total) }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Outstanding (A/R)</div>
          <div style="font-size: 18px;"><strong>{{ fmtMoney(summary.totals.outstanding_total) }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Gross charges</div>
          <div style="font-size: 18px;"><strong>{{ fmtMoney(summary.totals.gross_charges_total) }}</strong></div>
        </div>
      </div>

      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Agency</th>
              <th>Period</th>
              <th class="right">Managed</th>
              <th class="right">Collected</th>
              <th class="right">Outstanding</th>
              <th class="right">Gross</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in (summary?.agencies || [])" :key="String(a.agency_id || a.agency_name)">
              <td><strong>{{ a.agency_name || '—' }}</strong></td>
              <td>{{ formatPeriod(a.period_start_min, a.period_end_max) }}</td>
              <td class="right">{{ fmtMoney(a.managed_total) }}</td>
              <td class="right">{{ fmtMoney(a.collected_total) }}</td>
              <td class="right"><strong>{{ fmtMoney(a.outstanding_total) }}</strong></td>
              <td class="right">{{ fmtMoney(a.gross_charges_total) }}</td>
            </tr>
            <tr v-if="!(summary?.agencies || []).length">
              <td colspan="6" class="muted">No data yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title" style="margin: 0 0 8px 0;">Upload history</h3>
      <div class="actions" style="justify-content: flex-end;">
        <button class="btn btn-secondary" type="button" @click="refreshUploads" :disabled="loadingUploads">
          {{ loadingUploads ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Report date</th>
              <th>Label</th>
              <th>Filename</th>
              <th>Created</th>
              <th style="width: 120px;"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in uploads" :key="u.id">
              <td>#{{ u.id }}</td>
              <td>{{ (u.report_date || '').slice(0, 10) || '—' }}</td>
              <td>{{ u.report_label || '—' }}</td>
              <td>{{ u.original_filename || '—' }}</td>
              <td>{{ (u.created_at || '').slice(0, 19) || '—' }}</td>
              <td class="right">
                <button class="btn btn-secondary btn-sm" type="button" @click="loadSummaryFor(u.id)">
                  View
                </button>
              </td>
            </tr>
            <tr v-if="!uploads.length">
              <td colspan="6" class="muted">No uploads yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const error = ref('');
const success = ref('');

const fileInput = ref(null);
const file = ref(null);
const uploading = ref(false);

const reportLabel = ref('');
const reportDate = ref('');

const uploads = ref([]);
const loadingUploads = ref(false);

const summary = ref(null);
const loadingSummary = ref(false);

const pad2 = (n) => String(n).padStart(2, '0');
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const fmtMoney = (n) => {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};

const formatPeriod = (start, end) => {
  const a = (start || '').slice(0, 10);
  const b = (end || '').slice(0, 10);
  if (!a && !b) return '—';
  if (a && b) return `${a} – ${b}`;
  return a || b;
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
  if (!file.value) return;
  uploading.value = true;
  error.value = '';
  success.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file.value);
    if (reportLabel.value) fd.append('reportLabel', reportLabel.value);
    if (reportDate.value) fd.append('reportDate', reportDate.value);
    const resp = await api.post('/platform-revenue/uploads', fd);
    success.value = `Uploaded revenue report. Rows: ${resp.data?.file?.rows || 0}`;
    clearFile();
    await refreshUploads();
    await refreshSummary();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Upload failed';
  } finally {
    uploading.value = false;
  }
};

const refreshUploads = async () => {
  loadingUploads.value = true;
  error.value = '';
  try {
    const resp = await api.get('/platform-revenue/uploads');
    uploads.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load uploads';
  } finally {
    loadingUploads.value = false;
  }
};

const refreshSummary = async () => {
  loadingSummary.value = true;
  error.value = '';
  try {
    const resp = await api.get('/platform-revenue/summary');
    summary.value = resp.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load summary';
  } finally {
    loadingSummary.value = false;
  }
};

const loadSummaryFor = async (uploadId) => {
  loadingSummary.value = true;
  error.value = '';
  try {
    const resp = await api.get('/platform-revenue/summary', { params: { uploadId } });
    summary.value = resp.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load summary';
  } finally {
    loadingSummary.value = false;
  }
};

onMounted(async () => {
  reportDate.value = todayYmd();
  await refreshUploads();
  await refreshSummary();
});
</script>

