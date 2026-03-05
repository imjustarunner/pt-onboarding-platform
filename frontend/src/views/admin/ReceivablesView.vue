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

      <div class="field-row" style="grid-template-columns: 220px 220px 220px 1fr; align-items: end;">
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
            <option value="days_0_29">0-29 days</option>
            <option value="days_30_59">30-59 days</option>
            <option value="days_60_89">60-89 days</option>
            <option value="days_90_plus">90+ days</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div class="field">
          <label>Managed status</label>
          <select v-model="collectionsStatusFilter">
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="managed">Managed</option>
            <option value="closed">Closed</option>
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
          <button class="btn btn-secondary" type="button" @click="downloadEvidenceCsv" :disabled="!selectedRowIds.length || downloadingEvidence">
            {{ downloadingEvidence ? 'Preparing…' : `Export evidence CSV (${selectedRowIds.length})` }}
          </button>
          <button class="btn btn-primary" type="button" @click="createDraftInvoice" :disabled="creatingInvoice || !selectedRowIds.length">
            {{ creatingInvoice ? 'Creating…' : `Create draft invoice (${selectedRowIds.length})` }}
          </button>
        </div>
      </div>

      <div class="field-row" style="grid-template-columns: 260px 140px 1fr auto; margin-top: 10px; align-items: end;">
        <div class="field">
          <label>Bulk action</label>
          <select v-model="bulkAction">
            <option value="">Select action…</option>
            <option value="mark_managed">Mark managed</option>
            <option value="mark_open">Mark open</option>
            <option value="mark_closed">Mark closed</option>
            <option value="mark_paid">Mark paid</option>
            <option value="mark_unpaid">Mark unpaid</option>
            <option value="set_reimbursed_percent">Set reimbursed %</option>
          </select>
        </div>
        <div class="field">
          <label v-if="bulkAction === 'set_reimbursed_percent'">Reimbursed %</label>
          <label v-else>Value</label>
          <input
            v-if="bulkAction === 'set_reimbursed_percent'"
            v-model="bulkReimbursedPercent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="0-100"
          />
          <div v-else class="hint muted">—</div>
        </div>
        <div class="field">
          <label>Note (optional)</label>
          <input v-model="bulkNote" type="text" placeholder="Applied note for this bulk action" />
        </div>
        <div class="field">
          <button class="btn btn-secondary" type="button" :disabled="applyingBulkAction || !selectedRowIds.length || !bulkAction" @click="applyBulkAction">
            {{ applyingBulkAction ? 'Applying…' : `Apply to ${selectedRowIds.length} selected` }}
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
                          <th>Run</th>
                          <th>DOS</th>
                          <th>Days overdue</th>
                          <th>Bucket</th>
                          <th>Stage</th>
                          <th>Managed</th>
                          <th>Paid</th>
                          <th class="right">Reimbursed %</th>
                          <th>Status</th>
                          <th class="right">Outstanding</th>
                          <th style="width: 420px;">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="r in p.rows" :key="r.id" :class="{ highlightY: r.suggested_collections_stage === 'Y' }">
                          <td><input type="checkbox" :value="r.id" v-model="selectedRowIds" /></td>
                          <td>{{ r.upload_run_number ? `Run ${r.upload_run_number}` : '—' }}</td>
                          <td>{{ r.service_date }}</td>
                          <td>{{ r.days_overdue ?? '—' }}</td>
                          <td>{{ r.aging_bucket }}</td>
                          <td>{{ r.suggested_collections_stage || '—' }}</td>
                          <td><strong>{{ (r.collections_status || 'open').toUpperCase() }}</strong></td>
                          <td><strong>{{ r.paid_at ? 'PAID' : 'UNPAID' }}</strong></td>
                          <td class="right">
                            <div style="display:flex; align-items:center; justify-content:flex-end; gap:6px;">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                style="width:85px;"
                                :value="reimbursementDraftByRowId[r.id] ?? r.reimbursed_percent ?? 0"
                                @input="setReimbursementDraft(r.id, $event.target.value)"
                              />
                              <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="saveReimbursedPercent(r)">Save</button>
                            </div>
                          </td>
                          <td>{{ r.patient_balance_status || '—' }}</td>
                          <td class="right"><strong>{{ fmtMoney(r.patient_outstanding_amount) }}</strong></td>
                          <td>
                            <div class="actions" style="margin:0;">
                              <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="setManagedStatus(r, 'managed')">Managed</button>
                              <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="setManagedStatus(r, 'open')">Open</button>
                              <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="setManagedStatus(r, 'closed')">Closed</button>
                              <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="setPaidStatus(r, true)">Mark Paid</button>
                              <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="setPaidStatus(r, false)">Mark Unpaid</button>
                              <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="openCommentsModal(r)">Comments</button>
                              <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="openEmailDraftModal(r)">Email Draft</button>
                            </div>
                          </td>
                        </tr>
                        <tr v-if="!p.rows.length">
                          <td colspan="12" class="muted">No rows.</td>
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
              <th>Run</th>
              <th>DOS</th>
              <th>Days overdue</th>
              <th>Bucket</th>
              <th>Stage</th>
              <th>Managed</th>
              <th>Paid</th>
              <th class="right">Reimbursed %</th>
              <th>Patient</th>
              <th>Payer</th>
              <th class="right">Responsibility</th>
              <th class="right">Paid</th>
              <th class="right">Outstanding</th>
              <th>Status</th>
              <th style="width: 420px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredOutstandingRows" :key="r.id" :class="{ highlightY: r.suggested_collections_stage === 'Y' }">
              <td>
                <input type="checkbox" :value="r.id" v-model="selectedRowIds" />
              </td>
              <td>{{ r.upload_run_number ? `Run ${r.upload_run_number}` : '—' }}</td>
              <td>{{ r.service_date }}</td>
              <td>{{ r.days_overdue ?? '—' }}</td>
              <td>{{ r.aging_bucket }}</td>
              <td><strong>{{ r.suggested_collections_stage || '—' }}</strong></td>
              <td><strong>{{ (r.collections_status || 'open').toUpperCase() }}</strong></td>
              <td><strong>{{ r.paid_at ? 'PAID' : 'UNPAID' }}</strong></td>
              <td class="right">
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:6px;">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    style="width:85px;"
                    :value="reimbursementDraftByRowId[r.id] ?? r.reimbursed_percent ?? 0"
                    @input="setReimbursementDraft(r.id, $event.target.value)"
                  />
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="saveReimbursedPercent(r)">Save</button>
                </div>
              </td>
              <td>{{ r.patient_name || '—' }}</td>
              <td>{{ r.payer_name || '—' }}</td>
              <td class="right">{{ fmtMoney(r.patient_responsibility_amount) }}</td>
              <td class="right">{{ fmtMoney(r.patient_amount_paid) }}</td>
              <td class="right"><strong>{{ fmtMoney(r.patient_outstanding_amount) }}</strong></td>
              <td>{{ r.patient_balance_status || '—' }}</td>
              <td>
                <div class="actions" style="margin:0;">
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="setManagedStatus(r, 'managed')">Managed</button>
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="setManagedStatus(r, 'open')">Open</button>
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="setManagedStatus(r, 'closed')">Closed</button>
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="setPaidStatus(r, true)">Mark Paid</button>
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="setPaidStatus(r, false)">Mark Unpaid</button>
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="openCommentsModal(r)">Comments</button>
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="managingRowId === r.id" @click="openEmailDraftModal(r)">Email Draft</button>
                </div>
              </td>
            </tr>
            <tr v-if="!outstanding.length">
              <td colspan="16" class="muted">No outstanding balances found for this filter.</td>
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

    <teleport to="body">
      <div v-if="showCommentsModal" class="modal-backdrop" @click.self="closeCommentsModal">
        <div class="modal">
          <div class="modal-header">
            <div>
              <div class="modal-title">Claim Comments</div>
              <div class="hint">Track handling notes per claim row for audit and collections follow-up.</div>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" @click="closeCommentsModal">Close</button>
          </div>
          <div class="field">
            <label>New Comment</label>
            <textarea v-model="newCommentText" rows="4" placeholder="Add manager note..." />
          </div>
          <div class="actions" style="justify-content:flex-end;">
            <button class="btn btn-primary" type="button" :disabled="savingComment || !newCommentText.trim()" @click="saveComment">
              {{ savingComment ? 'Saving…' : 'Add Comment' }}
            </button>
          </div>
          <div class="card" style="margin-top:10px;">
            <h4 class="card-title" style="margin:0 0 8px 0;">Comment History</h4>
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>By</th>
                    <th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in rowComments" :key="c.id">
                    <td>{{ (c.created_at || '').slice(0, 19) || '—' }}</td>
                    <td>{{ [c.created_by_first_name, c.created_by_last_name].filter(Boolean).join(' ') || '—' }}</td>
                    <td style="white-space:pre-wrap;">{{ c.comment_text }}</td>
                  </tr>
                  <tr v-if="!rowComments.length">
                    <td colspan="3" class="muted">No comments yet for this claim row.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <div v-if="showEmailDraftModal" class="modal-backdrop" @click.self="closeEmailDraftModal">
        <div class="modal">
          <div class="modal-header">
            <div>
              <div class="modal-title">Receivables Email Draft</div>
              <div class="hint">Generate branded outreach text, then copy/send manually through your workflow.</div>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" @click="closeEmailDraftModal">Close</button>
          </div>
          <div class="field-row" style="grid-template-columns: 1fr 1fr;">
            <div class="field">
              <label>Recipient Email</label>
              <input v-model="draftRecipientEmail" type="email" placeholder="patient@example.com" />
            </div>
            <div class="field">
              <label>EHR Portal Link</label>
              <input v-model="draftPortalLink" type="url" placeholder="https://ehr.example.com/portal" />
            </div>
          </div>
          <div class="actions" style="justify-content:flex-end;">
            <button class="btn btn-primary" type="button" :disabled="generatingDraft" @click="generateEmailDraft">
              {{ generatingDraft ? 'Generating…' : 'Generate Draft' }}
            </button>
          </div>
          <div v-if="emailDraftPreview" class="card" style="margin-top:10px;">
            <div><strong>Subject:</strong> {{ emailDraftPreview.subject }}</div>
            <div style="margin-top:8px;"><strong>Body:</strong></div>
            <pre style="white-space: pre-wrap; margin: 6px 0 0;">{{ emailDraftPreview.body }}</pre>
          </div>
          <div class="card" style="margin-top:10px;">
            <h4 class="card-title" style="margin:0 0 8px 0;">Draft History</h4>
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Created</th>
                    <th>Recipient</th>
                    <th>Portal Link</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in emailDraftHistory" :key="d.id">
                    <td>#{{ d.id }}</td>
                    <td>{{ (d.created_at || '').slice(0, 19) || '—' }}</td>
                    <td>{{ d.recipient_email || '—' }}</td>
                    <td class="muted">{{ d.ehr_portal_link || '—' }}</td>
                  </tr>
                  <tr v-if="!emailDraftHistory.length">
                    <td colspan="4" class="muted">No drafts yet for this claim row.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </teleport>
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
const downloadingEvidence = ref(false);
const worklistView = ref('patients'); // patients | rows
const bucketFilter = ref('all');
const stageFilter = ref('all');
const collectionsStatusFilter = ref('all');
const expandedPatients = ref({});

const invoices = ref([]);
const loadingInvoices = ref(false);
const invoiceEdits = ref({});
const savingInvoiceId = ref(null);
const bulkAction = ref('');
const bulkReimbursedPercent = ref('');
const bulkNote = ref('');
const applyingBulkAction = ref(false);

const startYmd = ref('');
const endYmd = ref('');
const preset = ref('ytd');
const managingRowId = ref(null);
const reimbursementDraftByRowId = ref({});

const showCommentsModal = ref(false);
const commentsRow = ref(null);
const rowComments = ref([]);
const newCommentText = ref('');
const savingComment = ref(false);

const showEmailDraftModal = ref(false);
const emailDraftRow = ref(null);
const draftRecipientEmail = ref('');
const draftPortalLink = ref('');
const generatingDraft = ref(false);
const emailDraftPreview = ref(null);
const emailDraftHistory = ref([]);

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
    if (collectionsStatusFilter.value !== 'all') {
      if (String(r.collections_status || 'open') !== collectionsStatusFilter.value) return false;
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
      params: {
        agencyId: agencyId.value,
        start: startYmd.value || undefined,
        end: endYmd.value || undefined,
        collectionsStatus: collectionsStatusFilter.value === 'all' ? undefined : collectionsStatusFilter.value
      }
    });
    outstanding.value = resp.data?.rows || [];
    reimbursementDraftByRowId.value = Object.fromEntries(
      (outstanding.value || []).map((r) => [r.id, Number(r.reimbursed_percent || 0)])
    );
    selectedRowIds.value = [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load outstanding';
  } finally {
    loadingOutstanding.value = false;
  }
};

const setManagedStatus = async (row, status) => {
  if (!agencyId.value || !row?.id) return;
  const action = status === 'managed' ? 'mark_managed' : (status === 'closed' ? 'mark_closed' : 'mark_open');
  try {
    managingRowId.value = row.id;
    error.value = '';
    await api.patch(`/receivables/rows/${row.id}/manage`, {
      agencyId: agencyId.value,
      action
    });
    success.value = `Row #${row.id} updated to ${status}.`;
    await refreshOutstanding();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to update managed status';
  } finally {
    managingRowId.value = null;
  }
};

const setPaidStatus = async (row, nextPaid) => {
  if (!agencyId.value || !row?.id) return;
  const action = nextPaid ? 'mark_paid' : 'mark_unpaid';
  try {
    managingRowId.value = row.id;
    error.value = '';
    await api.patch(`/receivables/rows/${row.id}/manage`, {
      agencyId: agencyId.value,
      action
    });
    success.value = `Row #${row.id} updated to ${nextPaid ? 'paid' : 'unpaid'}.`;
    await refreshOutstanding();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to update paid status';
  } finally {
    managingRowId.value = null;
  }
};

const setReimbursementDraft = (rowId, v) => {
  reimbursementDraftByRowId.value = {
    ...(reimbursementDraftByRowId.value || {}),
    [rowId]: String(v || '')
  };
};

const saveReimbursedPercent = async (row) => {
  if (!agencyId.value || !row?.id) return;
  const raw = reimbursementDraftByRowId.value?.[row.id];
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    error.value = 'Reimbursed percent must be between 0 and 100';
    return;
  }
  try {
    managingRowId.value = row.id;
    error.value = '';
    await api.patch(`/receivables/rows/${row.id}/reimbursement`, {
      agencyId: agencyId.value,
      reimbursedPercent: n
    });
    success.value = `Row #${row.id} reimbursement saved (${n.toFixed(2)}%).`;
    await refreshOutstanding();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save reimbursement percent';
  } finally {
    managingRowId.value = null;
  }
};

const closeCommentsModal = () => {
  showCommentsModal.value = false;
  commentsRow.value = null;
  rowComments.value = [];
  newCommentText.value = '';
};

const loadComments = async () => {
  if (!agencyId.value || !commentsRow.value?.id) return;
  try {
    const resp = await api.get(`/receivables/rows/${commentsRow.value.id}/comments`, {
      params: { agencyId: agencyId.value }
    });
    rowComments.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load comments';
    rowComments.value = [];
  }
};

const openCommentsModal = async (row) => {
  commentsRow.value = row || null;
  rowComments.value = [];
  newCommentText.value = '';
  showCommentsModal.value = true;
  await loadComments();
};

const saveComment = async () => {
  if (!agencyId.value || !commentsRow.value?.id) return;
  const txt = String(newCommentText.value || '').trim();
  if (!txt) return;
  try {
    savingComment.value = true;
    error.value = '';
    await api.post(`/receivables/rows/${commentsRow.value.id}/comments`, {
      agencyId: agencyId.value,
      commentText: txt
    });
    newCommentText.value = '';
    await loadComments();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save comment';
  } finally {
    savingComment.value = false;
  }
};

const closeEmailDraftModal = () => {
  showEmailDraftModal.value = false;
  emailDraftRow.value = null;
  draftRecipientEmail.value = '';
  draftPortalLink.value = '';
  generatingDraft.value = false;
  emailDraftPreview.value = null;
  emailDraftHistory.value = [];
};

const loadEmailDraftHistory = async () => {
  if (!agencyId.value || !emailDraftRow.value?.id) return;
  try {
    const resp = await api.get(`/receivables/rows/${emailDraftRow.value.id}/email-drafts`, {
      params: { agencyId: agencyId.value }
    });
    emailDraftHistory.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load draft history';
    emailDraftHistory.value = [];
  }
};

const openEmailDraftModal = async (row) => {
  emailDraftRow.value = row || null;
  draftRecipientEmail.value = '';
  draftPortalLink.value = '';
  emailDraftPreview.value = null;
  emailDraftHistory.value = [];
  showEmailDraftModal.value = true;
  await loadEmailDraftHistory();
};

const generateEmailDraft = async () => {
  if (!agencyId.value || !emailDraftRow.value?.id) return;
  try {
    generatingDraft.value = true;
    error.value = '';
    const resp = await api.post(`/receivables/rows/${emailDraftRow.value.id}/email-drafts`, {
      agencyId: agencyId.value,
      recipientEmail: draftRecipientEmail.value || null,
      ehrPortalLink: draftPortalLink.value || null
    });
    emailDraftPreview.value = resp.data?.draft || null;
    success.value = `Created draft #${resp.data?.draft?.id || ''}`.trim();
    await loadEmailDraftHistory();
    await refreshOutstanding();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to generate email draft';
  } finally {
    generatingDraft.value = false;
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

const downloadEvidenceCsv = async () => {
  if (!agencyId.value || !selectedRowIds.value.length) return;
  try {
    downloadingEvidence.value = true;
    error.value = '';
    const resp = await api.post('/receivables/rows/export-evidence.csv', {
      agencyId: agencyId.value,
      rowIds: selectedRowIds.value
    }, { responseType: 'blob' });

    const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
    a.href = url;
    a.download = `receivables-evidence-${agencyId.value}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to export evidence CSV';
  } finally {
    downloadingEvidence.value = false;
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

const applyBulkAction = async () => {
  if (!agencyId.value || !selectedRowIds.value.length || !bulkAction.value) return;
  if (bulkAction.value === 'set_reimbursed_percent') {
    const n = Number(bulkReimbursedPercent.value);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      error.value = 'Bulk reimbursed percent must be between 0 and 100';
      return;
    }
  }
  try {
    applyingBulkAction.value = true;
    error.value = '';
    success.value = '';
    await api.post('/receivables/rows/bulk-manage', {
      agencyId: agencyId.value,
      rowIds: selectedRowIds.value,
      action: bulkAction.value,
      reimbursedPercent: bulkAction.value === 'set_reimbursed_percent' ? Number(bulkReimbursedPercent.value) : undefined,
      note: bulkNote.value || undefined
    });
    success.value = `Bulk action "${bulkAction.value}" applied to ${selectedRowIds.value.length} row(s).`;
    bulkNote.value = '';
    if (bulkAction.value === 'set_reimbursed_percent') bulkReimbursedPercent.value = '';
    selectedRowIds.value = [];
    await refreshOutstanding();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to apply bulk action';
  } finally {
    applyingBulkAction.value = false;
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
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal {
  width: min(900px, 96vw);
  max-height: 92vh;
  overflow: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.modal-title {
  font-size: 16px;
  font-weight: 700;
}
</style>

