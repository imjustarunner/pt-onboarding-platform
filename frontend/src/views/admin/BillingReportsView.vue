<template>
  <div>
    <div class="card" style="margin-bottom: 12px;">
      <h2 class="card-title">Billing Report Import</h2>
      <div class="hint">
        Upload line-level billing exports to create clinical clients, session encounters, revenue, and receivables.
        Re-uploads update existing lines (no duplicates). Max file size 50MB.
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="success" class="success-box">{{ success }}</div>

    <div class="card" style="margin-bottom: 12px;">
      <h3 class="card-title" style="margin: 0 0 8px 0;">Upload billing report</h3>
      <div class="field-row" style="grid-template-columns: 1fr 1fr; align-items: end;">
        <div class="field">
          <label>Report label (optional)</label>
          <input v-model="reportLabel" type="text" placeholder="e.g. Aug 2025 – Jul 2026 billing" />
        </div>
        <div class="field">
          <label>File</label>
          <input
            ref="fileInput"
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            @change="onFilePick"
          />
        </div>
      </div>
      <div class="hint" v-if="file">Selected: <strong>{{ file.name }}</strong></div>
      <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
        <button class="btn btn-secondary" type="button" @click="clearFile" :disabled="uploading || !file">Remove</button>
        <button class="btn btn-primary" type="button" @click="upload" :disabled="uploading || !file || !agencyId">
          {{ uploading ? 'Importing…' : 'Upload &amp; import' }}
        </button>
      </div>
    </div>

    <div class="card" style="margin-bottom: 12px;" v-if="lastResult">
      <h3 class="card-title" style="margin: 0 0 8px 0;">Last import result</h3>
      <div class="field-row" style="grid-template-columns: repeat(4, 1fr);">
        <div><div class="hint muted">Parsed</div><strong>{{ lastResult.rowsParsed }}</strong></div>
        <div><div class="hint muted">Inserted / Updated</div><strong>{{ lastResult.linesInserted }} / {{ lastResult.linesUpdated }}</strong></div>
        <div><div class="hint muted">Clients created / matched</div><strong>{{ lastResult.clientsCreated }} / {{ lastResult.clientsMatched }}</strong></div>
        <div><div class="hint muted">Encounters</div><strong>{{ lastResult.encountersCreated }}</strong></div>
      </div>
      <div class="hint" style="margin-top: 8px;">
        Patient/insurance outstanding projected to receivables: <strong>{{ lastResult.receivablesProjected || 0 }}</strong>
        · Auto-terminated (60d): <strong>{{ lastResult.autoTerminated || 0 }}</strong>
      </div>
      <div v-if="(lastResult.unmatchedProviders || []).length" class="hint" style="margin-top: 6px;">
        Unmatched clinicians:
        <strong>{{ lastResult.unmatchedProviders.slice(0, 12).join(', ') }}</strong>
        <span v-if="lastResult.unmatchedProviders.length > 12">…</span>
      </div>
    </div>

    <div class="card" style="margin-bottom: 12px;">
      <div class="actions" style="justify-content: space-between;">
        <h3 class="card-title" style="margin: 0;">Revenue from billing lines</h3>
        <button class="btn btn-secondary" type="button" @click="refreshRevenue" :disabled="loadingRevenue || !agencyId">
          {{ loadingRevenue ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
      <div v-if="revenue?.totals" class="field-row" style="grid-template-columns: repeat(5, 1fr); margin-top: 10px;">
        <div><div class="hint muted">Gross</div><strong>{{ fmtMoney(revenue.totals.gross_charges_total) }}</strong></div>
        <div><div class="hint muted">Collected</div><strong>{{ fmtMoney(revenue.totals.collected_total) }}</strong></div>
        <div><div class="hint muted">Patient owed</div><strong>{{ fmtMoney(revenue.totals.patient_outstanding_total) }}</strong></div>
        <div><div class="hint muted">Insurance owed</div><strong>{{ fmtMoney(revenue.totals.insurance_outstanding_total) }}</strong></div>
        <div><div class="hint muted">Lines</div><strong>{{ revenue.totals.line_count || 0 }}</strong></div>
      </div>
      <div v-else class="hint muted" style="margin-top: 8px;">No billing lines yet.</div>
    </div>

    <div class="card">
      <div class="actions" style="justify-content: space-between;">
        <h3 class="card-title" style="margin: 0;">Upload history</h3>
        <button class="btn btn-secondary" type="button" @click="refreshUploads" :disabled="loadingUploads || !agencyId">
          {{ loadingUploads ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Label</th>
              <th>Filename</th>
              <th>Clients</th>
              <th>Lines</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in uploads" :key="u.id">
              <td>#{{ u.id }}</td>
              <td>{{ uploadStatusLabel(u) }}</td>
              <td>{{ u.report_label || '—' }}</td>
              <td>{{ u.original_filename || '—' }}</td>
              <td>{{ u.clients_created || 0 }} / {{ u.clients_matched || 0 }}</td>
              <td>{{ u.lines_inserted || 0 }}+{{ u.lines_updated || 0 }}</td>
              <td>{{ (u.created_at || '').toString().slice(0, 19) || '—' }}</td>
              <td class="right">
                <button
                  v-if="canRevertUpload(u)"
                  class="btn btn-danger btn-sm"
                  type="button"
                  :disabled="revertingId === u.id"
                  @click="confirmRevert(u)"
                >
                  {{ revertingId === u.id ? 'Reverting…' : 'Revert' }}
                </button>
              </td>
            </tr>
            <tr v-if="!uploads.length">
              <td colspan="8" class="muted">No uploads yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';

const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);

const fileInput = ref(null);
const file = ref(null);
const reportLabel = ref('');
const uploading = ref(false);
const error = ref('');
const success = ref('');
const lastResult = ref(null);
const uploads = ref([]);
const loadingUploads = ref(false);
const revenue = ref(null);
const loadingRevenue = ref(false);
const revertingId = ref(null);

const parseUploadSummary = (u) => {
  if (!u?.result_summary_json) return {};
  if (typeof u.result_summary_json === 'object') return u.result_summary_json;
  try {
    return JSON.parse(u.result_summary_json);
  } catch {
    return {};
  }
};

const uploadStatusLabel = (u) => {
  if (parseUploadSummary(u).reverted) return 'reverted';
  return u?.status || '—';
};

const canRevertUpload = (u) => {
  if (!u?.id) return false;
  if (parseUploadSummary(u).reverted) return false;
  if (u.status === 'processing' || u.status === 'queued') return false;
  return (Number(u.lines_inserted || 0) + Number(u.lines_updated || 0)) > 0 || u.status === 'completed';
};

const onFilePick = (e) => {
  file.value = e?.target?.files?.[0] || null;
};

const clearFile = () => {
  file.value = null;
  if (fileInput.value) fileInput.value.value = '';
};

const fmtMoney = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
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
    if (reportLabel.value) fd.append('reportLabel', reportLabel.value);
    const resp = await api.post('/billing-reports/uploads', fd);
    lastResult.value = resp.data || null;
    success.value = `Import #${resp.data?.uploadId} completed.`;
    clearFile();
    await Promise.all([refreshUploads(), refreshRevenue()]);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Upload failed';
  } finally {
    uploading.value = false;
  }
};

const refreshUploads = async () => {
  if (!agencyId.value) return;
  loadingUploads.value = true;
  try {
    const resp = await api.get('/billing-reports/uploads', { params: { agencyId: agencyId.value } });
    uploads.value = resp.data?.uploads || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load uploads';
  } finally {
    loadingUploads.value = false;
  }
};

const confirmRevert = async (upload) => {
  if (!upload?.id || !agencyId.value) return;
  const lines = Number(upload.lines_inserted || 0) + Number(upload.lines_updated || 0);
  const created = Number(upload.clients_created || 0);
  const ok = window.confirm(
    `Revert import #${upload.id}?\n\n` +
    `This will remove ${lines} billing line(s) and related encounters/receivables from this upload. ` +
    `Up to ${created} billing-import client(s) with no remaining sessions may be deleted. ` +
    `Matched clients and termination status changes are not reverted.`
  );
  if (!ok) return;

  revertingId.value = upload.id;
  error.value = '';
  success.value = '';
  try {
    const resp = await api.post(`/billing-reports/uploads/${upload.id}/revert`, {
      agencyId: agencyId.value,
      deleteOrphanClients: true
    });
    success.value =
      `Import #${upload.id} reverted. Removed ${resp.data?.linesRemoved || 0} line(s)` +
      `${resp.data?.clientsDeleted ? ` and deleted ${resp.data.clientsDeleted} orphan client(s)` : ''}.`;
    if (lastResult.value?.uploadId === upload.id) lastResult.value = null;
    await Promise.all([refreshUploads(), refreshRevenue()]);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Revert failed';
  } finally {
    revertingId.value = null;
  }
};

const refreshRevenue = async () => {
  if (!agencyId.value) return;
  loadingRevenue.value = true;
  try {
    const resp = await api.get('/billing-reports/revenue-summary', { params: { agencyId: agencyId.value } });
    revenue.value = resp.data || null;
  } catch (e) {
    // non-fatal
    revenue.value = null;
  } finally {
    loadingRevenue.value = false;
  }
};

watch(agencyId, () => {
  refreshUploads();
  refreshRevenue();
});

onMounted(async () => {
  if (authStore.user?.role === 'super_admin') {
    await agencyStore.fetchAgencies();
  } else {
    await agencyStore.fetchUserAgencies();
  }
  refreshUploads();
  refreshRevenue();
});
</script>
