<template>
  <div class="container">
    <div class="page-header" data-tour="expenses-header">
      <div>
        <h1 data-tour="expenses-title">Expense/Reimbursements</h1>
        <p class="subtitle">Review company card expenses and reimbursements in one place.</p>
      </div>
    </div>

    <div class="org-bar" data-tour="expenses-org-bar">
      <div class="org-bar-left">
        <div class="org-bar-label">Organization</div>
        <div class="org-bar-value">
          <strong>{{ agencyStore.currentAgency?.name || '—' }}</strong>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top: 12px;" data-tour="expenses-inbox-card">
      <div class="card-header" style="display: flex; justify-content: space-between; gap: 10px; align-items: center;">
        <div>
          <div class="card-title">Inbox</div>
          <div class="hint">Search, sort, and export. Receipts open in a new tab.</div>
        </div>
        <div class="actions" style="margin: 0;" data-tour="expenses-actions">
          <button class="btn btn-secondary btn-sm" type="button" @click="exportCsv" :disabled="!agencyId || exporting">
            {{ exporting ? 'Exporting…' : 'Export CSV' }}
          </button>
          <button class="btn btn-secondary btn-sm" type="button" @click="reload" :disabled="loading || !agencyId">Refresh</button>
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 220px 220px 1fr 220px; align-items: end;" data-tour="expenses-filters">
        <div class="field">
          <label>Type</label>
          <select v-model="typeFilter">
            <option value="all">All</option>
            <option value="company_card">Company card</option>
            <option value="reimbursement">Reimbursement</option>
          </select>
        </div>
        <div class="field">
          <label>Status</label>
          <select v-model="statusFilter">
            <option value="">All</option>
            <option value="submitted">Submitted (pending)</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="deferred">Returned</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <div class="field">
          <label>Search</label>
          <input v-model="q" type="text" placeholder="User, vendor, project, purpose/reason…" />
        </div>
        <div class="field">
          <label>Sort</label>
          <select v-model="sort">
            <option value="expense_date_desc">Expense date (newest)</option>
            <option value="expense_date_asc">Expense date (oldest)</option>
          </select>
        </div>
      </div>

      <div v-if="error" class="error-box" style="margin-top: 10px;">{{ error }}</div>

      <div v-if="agencyId && !driveConfigured && !loading" class="hint" style="margin-top: 10px; padding: 8px 12px; background: rgba(255, 193, 7, 0.12); border-radius: 8px; border: 1px solid rgba(255, 193, 7, 0.3);">
        Send to Drive is unavailable. Google Drive is not configured for this environment. Contact your administrator to set up <code>GOOGLE_WORKSPACE_IMPERSONATE_USER</code> and <code>EXPENSE_RECEIPTS_DRIVE_FOLDER_ID</code>.
      </div>

      <div class="hint" style="margin-top: 10px;" v-if="agencyId">
        Showing <strong>{{ items.length }}</strong> of <strong>{{ total }}</strong>
      </div>

      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table" data-tour="expenses-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>User</th>
              <th>Date</th>
              <th>Vendor</th>
              <th>Project</th>
              <th>Purpose/Reason</th>
              <th class="right">Amount</th>
              <th>Status</th>
              <th>Receipt</th>
              <th>Drive</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="11" class="muted">Loading…</td>
            </tr>
            <tr v-else-if="!items.length">
              <td colspan="11" class="muted">No items</td>
            </tr>
            <tr v-for="c in items" :key="`${c.expense_type}-${c.id}`">
              <td>#{{ c.id }}</td>
              <td>
                <span class="pill" :class="c.expense_type === 'company_card' ? 'pill-blue' : 'pill-green'">
                  {{ c.expense_type === 'company_card' ? 'Company card' : 'Reimbursement' }}
                </span>
              </td>
              <td>
                <div style="line-height: 1.2;">
                  <div><strong>{{ userLabel(c) }}</strong></div>
                  <div class="muted" v-if="c.user_email">{{ c.user_email }}</div>
                </div>
              </td>
              <td>{{ dateYmd(c.expense_date) }}</td>
              <td>{{ c.vendor || '—' }}</td>
              <td>{{ c.project_ref || '—' }}</td>
              <td>
                <div class="muted" style="line-height: 1.25;">
                  <div v-if="c.purpose"><strong>Purpose:</strong> {{ c.purpose }}</div>
                  <div v-if="c.reason"><strong>Reason:</strong> {{ c.reason }}</div>
                  <div v-if="c.purchase_approved_by"><strong>Approver:</strong> {{ c.purchase_approved_by }}</div>
                  <div v-if="c.supervisor_name"><strong>Supervisor:</strong> {{ c.supervisor_name }}</div>
                </div>
              </td>
              <td class="right">{{ fmtMoney(Number(c.amount || 0)) }}</td>
              <td>{{ String(c.status || '').replaceAll('_', ' ') }}</td>
              <td>
                <a v-if="c.receipt_file_path" :href="receiptUrl(c)" target="_blank" rel="noopener noreferrer">View</a>
                <span v-else class="muted">—</span>
              </td>
              <td>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="sendToDrive(c)"
                  :disabled="sendingDriveKey === `${c.expense_type}-${c.id}` || !c.receipt_file_path || !driveConfigured"
                  :title="!driveConfigured ? 'Google Drive is not configured' : ''"
                >
                  {{ sendingDriveKey === `${c.expense_type}-${c.id}` ? 'Sending…' : 'Send' }}
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
const agencyId = computed(() => agencyStore.currentAgency?.id || null);

const typeFilter = ref('all');
const statusFilter = ref('');
const q = ref('');
const sort = ref('expense_date_desc');

const loading = ref(false);
const exporting = ref(false);
const error = ref('');
const items = ref([]);
const total = ref(0);
const sendingDriveKey = ref('');
const driveConfigured = ref(true);

const dateYmd = (v) => {
  if (!v) return '—';
  try {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    const s = String(v).trim();
    if (!s) return '—';
    return s.slice(0, 10);
  } catch {
    return '—';
  }
};

const fmtMoney = (n) => {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

const userLabel = (c) => {
  const fn = String(c?.user_first_name || '').trim();
  const ln = String(c?.user_last_name || '').trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  return c?.user_email || `User ${c?.user_id || '—'}`;
};

const receiptUrl = (c) => {
  const raw = String(c?.receipt_file_path || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/uploads/${raw.substring('uploads/'.length)}`;

  // Legacy: some rows stored only the basename
  if (raw.startsWith('reimbursement-')) return `/uploads/reimbursements/${raw}`;
  if (raw.startsWith('company-card-expense-')) return `/uploads/company_card_expenses/${raw}`;

  return `/uploads/${raw}`;
};

const load = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/payroll/expenses', {
      params: {
        agencyId: agencyId.value,
        type: typeFilter.value,
        status: statusFilter.value || null,
        q: q.value || '',
        sort: sort.value,
        limit: 500,
        offset: 0
      }
    });
    total.value = Number(resp.data?.total || 0);
    items.value = Array.isArray(resp.data?.items) ? resp.data.items : [];
    driveConfigured.value = resp.data?.driveConfigured !== false;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load expenses';
    items.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

const reload = async () => load();

const exportCsv = async () => {
  if (!agencyId.value) return;
  try {
    exporting.value = true;
    error.value = '';
    const resp = await api.get('/payroll/expenses/export.csv', {
      params: {
        agencyId: agencyId.value,
        type: typeFilter.value,
        status: statusFilter.value || null,
        q: q.value || ''
      },
      responseType: 'blob'
    });
    const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${agencyId.value}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to export CSV';
  } finally {
    exporting.value = false;
  }
};

const sendToDrive = async (c) => {
  if (!c?.receipt_file_path) return;
  if (!agencyId.value) return;
  const key = `${c.expense_type}-${c.id}`;
  try {
    sendingDriveKey.value = key;
    error.value = '';
    await api.post(`/payroll/expenses/${c.expense_type}/${c.id}/drive`, {});
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to send to Google Drive';
  } finally {
    sendingDriveKey.value = '';
  }
};

let searchTimer = null;
watch([agencyId, typeFilter, statusFilter, sort], () => load());
watch(q, () => {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => load(), 250);
});

onMounted(() => load());
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.subtitle {
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.75);
}
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}
.pill-blue {
  background: rgba(80, 130, 255, 0.18);
  border: 1px solid rgba(80, 130, 255, 0.35);
}
.pill-green {
  background: rgba(80, 220, 130, 0.15);
  border: 1px solid rgba(80, 220, 130, 0.3);
}
.right {
  text-align: right;
}
</style>

