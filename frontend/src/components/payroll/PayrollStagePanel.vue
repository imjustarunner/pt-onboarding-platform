<template>
  <div class="psp">
    <div class="psp-head">
      <div>
        <div class="psp-title">Manual Pay &amp; Provider Adjustments</div>
        <div class="psp-hint">
          Add one-off pay lines (individually or in bulk) and edit per-provider adjustments for this pay period.
          Changes save immediately and appear on the Payroll page too.
        </div>
        <div v-if="periodLabel" class="psp-period">Period: <strong>{{ periodLabel }}</strong></div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loadingUsers" @click="reloadAll">Refresh</button>
    </div>

    <div class="psp-tabs">
      <button type="button" class="psp-tab" :class="{ active: tab === 'manual' }" @click="tab = 'manual'">Manual Add</button>
      <button type="button" class="psp-tab" :class="{ active: tab === 'bulk' }" @click="tab = 'bulk'">Manual Bulk</button>
      <button type="button" class="psp-tab" :class="{ active: tab === 'adjust' }" @click="tab = 'adjust'">Provider Adjustments</button>
    </div>

    <div v-if="error" class="psp-error">{{ error }}</div>

    <!-- Manual Add -->
    <div v-if="tab === 'manual'" class="psp-body">
      <div class="psp-hint">Add as many rows as you need, then save in one click. Amount can be negative for corrections.</div>
      <div v-if="locked" class="psp-muted">This pay period is posted (manual lines are locked).</div>
      <div v-else class="psp-table-wrap">
        <table class="psp-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Provider</th>
              <th>Bucket</th>
              <th class="right">Hours</th>
              <th>Note</th>
              <th class="right">Amount ($)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, idx) in draftRows" :key="r._key">
              <td>
                <select v-model="r.lineType" :disabled="saving">
                  <option value="pay">Pay</option>
                  <option value="pto">PTO</option>
                </select>
              </td>
              <td>
                <select v-model="r.userId" :disabled="saving">
                  <option :value="null">Select…</option>
                  <option v-for="u in activeEmployees" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                </select>
              </td>
              <td>
                <select v-if="r.lineType !== 'pto'" v-model="r.category" :disabled="saving">
                  <option value="direct">Direct</option>
                  <option value="indirect">Indirect</option>
                </select>
                <select v-else v-model="r.ptoBucket" :disabled="saving">
                  <option value="sick">Sick PTO</option>
                  <option value="training">Training PTO</option>
                </select>
              </td>
              <td class="right">
                <input v-model="r.creditsHours" type="number" step="0.01" :disabled="saving" style="width: 90px;" />
              </td>
              <td>
                <input v-model="r.label" type="text" placeholder="e.g. Manual correction" :disabled="saving" />
              </td>
              <td class="right">
                <input v-model="r.amount" type="number" step="0.01" :disabled="saving || r.lineType === 'pto'" style="width: 100px;" />
              </td>
              <td>
                <button type="button" class="btn btn-secondary btn-sm" :disabled="saving || draftRows.length <= 1" @click="removeDraft(idx)">Remove</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="psp-actions">
        <button type="button" class="btn btn-secondary" :disabled="saving || locked" @click="addDraft">Add another row</button>
        <button type="button" class="btn btn-primary" :disabled="saving || locked || !hasValidDraft" @click="saveDrafts">
          {{ saving ? 'Saving…' : 'Save manual lines' }}
        </button>
      </div>

      <div class="psp-section-title">Saved manual lines</div>
      <div v-if="linesLoading" class="psp-muted">Loading…</div>
      <div v-else-if="!lines.length" class="psp-muted">No manual lines yet.</div>
      <div v-else class="psp-table-wrap">
        <table class="psp-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Category</th>
              <th>Service</th>
              <th class="right">Hours</th>
              <th class="right">Amount</th>
              <th class="right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lines" :key="l.id">
              <td>{{ nameFor(l.user_id) }}</td>
              <td class="psp-muted">{{ String(l.category || 'direct').toUpperCase() }}</td>
              <td>{{ l.label }}</td>
              <td class="right">{{ Number(l.credits_hours ?? 0).toFixed(2) }} h</td>
              <td class="right">${{ Number(l.amount || 0).toFixed(2) }}</td>
              <td class="right">
                <button type="button" class="btn btn-secondary btn-sm" :disabled="locked || deletingId === l.id" @click="deleteLine(l)">
                  {{ deletingId === l.id ? '…' : 'Delete' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Manual Bulk -->
    <div v-else-if="tab === 'bulk'" class="psp-body">
      <div class="psp-hint">
        Bulk add manual pay for meeting attendees. Enter comma-separated names as <strong>Last, First</strong>
        (e.g. Smith, John, Doe, Jane).
      </div>
      <div v-if="locked" class="psp-muted">This pay period is posted (manual lines are locked).</div>
      <template v-else>
        <div class="psp-grid">
          <div class="field" style="grid-column: 1 / -1;">
            <label>Attendees (comma-separated Last, First)</label>
            <textarea v-model="bulkAttendees" rows="3" placeholder="Smith, John, Doe, Jane" :disabled="bulkSaving" />
          </div>
          <div class="field">
            <label>Service Code</label>
            <select v-model="bulkServiceCode" :disabled="bulkSaving">
              <option v-for="c in serviceCodes" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
          <div class="field">
            <label>{{ bulkInputLabel }}</label>
            <input v-model="bulkQuantity" type="number" step="1" min="1" :disabled="bulkSaving" />
          </div>
          <div class="field">
            <label>Meeting Date</label>
            <input v-model="bulkMeetingDate" type="date" :disabled="bulkSaving" />
          </div>
          <div class="field" style="grid-column: 1 / -1;">
            <label>Reason / Note</label>
            <input v-model="bulkReason" type="text" placeholder="e.g. Weekly team sync" :disabled="bulkSaving" />
          </div>
        </div>
        <div class="psp-actions" style="justify-content: flex-end;">
          <button
            type="button"
            class="btn btn-primary"
            :disabled="bulkSaving || !bulkAttendees.trim() || !bulkQuantity || Number(bulkQuantity) <= 0"
            @click="submitBulk"
          >
            {{ bulkSaving ? 'Submitting…' : 'Submit Manual Bulk' }}
          </button>
        </div>
      </template>
    </div>

    <!-- Provider Adjustments -->
    <div v-else class="psp-body">
      <div class="psp-hint">Select a provider to edit mileage, bonus, reimbursement, salary, and PTO adjustments for this period.</div>
      <div class="field psp-provider-field">
        <label>Provider</label>
        <div class="psp-combo" ref="adjComboEl">
          <div class="psp-combo-trigger" :class="{ open: adjDropOpen, disabled: adjLoading }" @click="!adjLoading && openAdjDrop()">
            <span v-if="adjUserId && !adjDropOpen" class="psp-combo-value">{{ adjSelectedLabel }}</span>
            <input
              v-else
              ref="adjSearchInputEl"
              v-model="adjSearch"
              class="psp-combo-input"
              placeholder="Search by name or email…"
              :disabled="adjLoading"
              @keydown.escape="closeAdjDrop"
              @keydown.enter.prevent="pickFirstAdjResult"
            />
            <button v-if="adjUserId" type="button" class="psp-combo-clear" title="Clear" @click.stop="clearAdjUser">&#x2715;</button>
            <span class="psp-combo-arrow" aria-hidden="true">&#x25BE;</span>
          </div>
          <div v-if="adjDropOpen" class="psp-combo-drop">
            <div v-if="!filteredAdjActive.length && !filteredAdjInactive.length" class="psp-combo-empty">
              No employees match "{{ adjSearch }}"
            </div>
            <template v-if="filteredAdjActive.length">
              <div
                v-for="u in filteredAdjActive"
                :key="u.id"
                class="psp-combo-option"
                :class="{ 'psp-combo-option--selected': Number(u.id) === Number(adjUserId) }"
                @mousedown.prevent="selectAdjUser(u)"
              >{{ u.first_name }} {{ u.last_name }}</div>
            </template>
            <template v-if="filteredAdjInactive.length">
              <div class="psp-combo-group">Inactive / Archived</div>
              <div
                v-for="u in filteredAdjInactive"
                :key="u.id"
                class="psp-combo-option psp-combo-option--inactive"
                :class="{ 'psp-combo-option--selected': Number(u.id) === Number(adjUserId) }"
                @mousedown.prevent="selectAdjUser(u)"
              >{{ u.first_name }} {{ u.last_name }}</div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="!adjUserId" class="psp-muted" style="margin-top: 12px;">Choose a provider to edit adjustments.</div>
      <div v-else-if="adjLoading" class="psp-muted" style="margin-top: 12px;">Loading adjustments…</div>
      <template v-else>
        <div class="psp-adj-grid">
          <div class="field"><label>Mileage ($)</label><input v-model="adj.mileageAmount" type="number" step="0.01" :disabled="locked || adjSaving" /></div>
          <div class="field"><label>MedCancel ($)</label><input v-model="adj.medcancelAmount" type="number" step="0.01" :disabled="locked || adjSaving" /></div>
          <div class="field"><label>Other Taxable ($)</label><input v-model="adj.otherTaxableAmount" type="number" step="0.01" :disabled="locked || adjSaving" /></div>
          <div class="field"><label>Bonus ($)</label><input v-model="adj.bonusAmount" type="number" step="0.01" :disabled="locked || adjSaving" /></div>
          <div class="field"><label>Reimbursement ($)</label><input v-model="adj.reimbursementAmount" type="number" step="0.01" :disabled="locked || adjSaving" /></div>
          <div class="field"><label>Tuition Reimb. ($)</label><input v-model="adj.tuitionReimbursementAmount" type="number" step="0.01" :disabled="locked || adjSaving" /></div>
          <div class="field"><label>Salary ($)</label><input v-model="adj.salaryAmount" type="number" step="0.01" :disabled="locked || adjSaving" /></div>
          <div class="field"><label>Sick PTO (hrs)</label><input v-model="adj.sickPtoHours" type="number" step="0.01" :disabled="locked || adjSaving" /></div>
          <div class="field"><label>Training PTO (hrs)</label><input v-model="adj.trainingPtoHours" type="number" step="0.01" :disabled="locked || adjSaving" /></div>
          <div class="field"><label>PTO Rate ($)</label><input v-model="adj.ptoRate" type="number" step="0.01" :disabled="locked || adjSaving" /></div>
        </div>
        <div class="psp-actions" style="justify-content: flex-end;">
          <button type="button" class="btn btn-primary" :disabled="locked || adjSaving" @click="saveAdjustments">
            {{ adjSaving ? 'Saving…' : 'Save adjustments' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  periodId: { type: [Number, String], required: true },
  periodLabel: { type: String, default: '' },
  periodStatus: { type: String, default: '' }
});

defineEmits(['changed']);

const tab = ref('manual');
const error = ref('');
const loadingUsers = ref(false);
const users = ref([]);

// Roles that are NOT payroll-eligible employees (guardians, clients, school staff, etc.)
const NON_EMPLOYEE_ROLES = new Set(['guardian', 'client_guardian', 'client', 'school_staff', 'school_support', 'applicant']);
const isEmployee = (u) => !NON_EMPLOYEE_ROLES.has(String(u?.role || '').toLowerCase());
const isActiveUser = (u) => u?.is_active == null || Number(u.is_active) === 1 || u.is_active === true;

const activeEmployees = computed(() =>
  users.value.filter((u) => isEmployee(u) && isActiveUser(u))
);
const inactiveEmployees = computed(() =>
  users.value.filter((u) => isEmployee(u) && !isActiveUser(u))
);

// ── Provider Adjustments custom combobox ────────────────────────────────────
const adjSearch = ref('');
const adjDropOpen = ref(false);
const adjComboEl = ref(null);
const adjSearchInputEl = ref(null);

const adjSelectedLabel = computed(() => {
  if (!adjUserId.value) return '';
  const u = users.value.find((x) => Number(x.id) === Number(adjUserId.value));
  return u ? `${u.first_name} ${u.last_name}` : `#${adjUserId.value}`;
});

const normalizeStr = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Fuzzy match: every space-separated token must appear in first/last/email
// Falls back to scattered-char order match for close spelling
const fuzzyMatch = (query, u) => {
  if (!query.trim()) return true;
  const tokens = normalizeStr(query).split(' ').filter(Boolean);
  const haystack = normalizeStr(`${u.first_name} ${u.last_name} ${u.email || ''}`);
  return tokens.every((tok) => {
    if (haystack.includes(tok)) return true;
    let pos = 0;
    for (const ch of tok) {
      const idx = haystack.indexOf(ch, pos);
      if (idx === -1) return false;
      pos = idx + 1;
    }
    return true;
  });
};

const filteredAdjActive = computed(() =>
  activeEmployees.value.filter((u) => fuzzyMatch(adjSearch.value, u))
);
const filteredAdjInactive = computed(() =>
  inactiveEmployees.value.filter((u) => fuzzyMatch(adjSearch.value, u))
);

const openAdjDrop = () => {
  adjSearch.value = '';
  adjDropOpen.value = true;
  nextTick(() => adjSearchInputEl.value?.focus());
};
const closeAdjDrop = () => {
  adjDropOpen.value = false;
};
const clearAdjUser = () => {
  adjUserId.value = null;
  adj.value = emptyAdj();
  adjSearch.value = '';
  adjDropOpen.value = true;
  nextTick(() => adjSearchInputEl.value?.focus());
};
const selectAdjUser = (u) => {
  adjUserId.value = u.id;
  adjDropOpen.value = false;
  adjSearch.value = '';
  loadAdjustments();
};
const pickFirstAdjResult = () => {
  const first = filteredAdjActive.value[0] || filteredAdjInactive.value[0];
  if (first) selectAdjUser(first);
};
const handleAdjClickOutside = (e) => {
  if (adjComboEl.value && !adjComboEl.value.contains(e.target)) closeAdjDrop();
};
// ────────────────────────────────────────────────────────────────────────────

const serviceCodes = ref(['MEETING']);
const serviceRules = ref([]);

const locked = computed(() => {
  const st = String(props.periodStatus || '').toLowerCase();
  return st === 'posted' || st === 'finalized';
});

const nameFor = (id) => {
  const u = users.value.find((x) => Number(x.id) === Number(id));
  return u ? `${u.last_name}, ${u.first_name}` : `#${id}`;
};

// Manual add
const draftSeq = ref(1);
const emptyDraft = () => ({
  _key: draftSeq.value++,
  userId: null,
  lineType: 'pay',
  category: 'indirect',
  ptoBucket: 'sick',
  creditsHours: '',
  label: '',
  amount: ''
});
const draftRows = ref([emptyDraft()]);
const saving = ref(false);
const lines = ref([]);
const linesLoading = ref(false);
const deletingId = ref(null);

const isValidDraft = (r) => {
  const uid = Number(r?.userId || 0);
  const label = String(r?.label || '').trim();
  if (!uid || !label) return false;
  if (String(r.lineType) === 'pto') {
    const hrs = Number(r.creditsHours);
    return Number.isFinite(hrs) && Math.abs(hrs) > 1e-9;
  }
  const amount = Number(r.amount);
  return Number.isFinite(amount) && Math.abs(amount) > 1e-9;
};
const hasValidDraft = computed(() => draftRows.value.some(isValidDraft));

const addDraft = () => { draftRows.value = [...draftRows.value, emptyDraft()]; };
const removeDraft = (idx) => {
  const rows = [...draftRows.value];
  rows.splice(idx, 1);
  draftRows.value = rows.length ? rows : [emptyDraft()];
};

const loadLines = async () => {
  if (!props.periodId) return;
  linesLoading.value = true;
  try {
    const resp = await api.get(`/payroll/periods/${props.periodId}/manual-pay-lines`);
    lines.value = resp.data || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load manual lines';
    lines.value = [];
  } finally {
    linesLoading.value = false;
  }
};

const saveDrafts = async () => {
  saving.value = true;
  error.value = '';
  try {
    const kept = [];
    for (const r of draftRows.value) {
      if (!isValidDraft(r)) {
        kept.push(r);
        continue;
      }
      const lineType = String(r.lineType) === 'pto' ? 'pto' : 'pay';
      await api.post(`/payroll/periods/${props.periodId}/manual-pay-lines`, {
        userId: Number(r.userId),
        lineType,
        ptoBucket: String(r.ptoBucket || 'sick') === 'training' ? 'training' : 'sick',
        category: String(r.category || 'indirect'),
        creditsHours: r.creditsHours === '' ? null : Number(r.creditsHours),
        label: String(r.label || '').trim(),
        amount: lineType === 'pto' ? 0 : Number(r.amount)
      });
    }
    draftRows.value = kept.length ? kept : [emptyDraft()];
    await loadLines();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save manual lines';
  } finally {
    saving.value = false;
  }
};

const deleteLine = async (line) => {
  if (!line?.id || !window.confirm('Delete this manual pay line?')) return;
  deletingId.value = line.id;
  error.value = '';
  try {
    await api.delete(`/payroll/periods/${props.periodId}/manual-pay-lines/${line.id}`);
    await loadLines();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to delete line';
  } finally {
    deletingId.value = null;
  }
};

// Bulk
const bulkAttendees = ref('');
const bulkServiceCode = ref('MEETING');
const bulkQuantity = ref('');
const bulkMeetingDate = ref('');
const bulkReason = ref('');
const bulkSaving = ref(false);

const bulkRule = computed(() => {
  const code = String(bulkServiceCode.value || '').toUpperCase();
  return serviceRules.value.find((r) => String(r.service_code || '').toUpperCase() === code) || null;
});
const bulkInputLabel = computed(() => (Number(bulkRule.value?.pay_divisor ?? 60) === 60 ? 'Minutes' : 'Units'));
const bulkInputType = computed(() => (Number(bulkRule.value?.pay_divisor ?? 60) === 60 ? 'minutes' : 'units'));

const submitBulk = async () => {
  bulkSaving.value = true;
  error.value = '';
  try {
    await api.post(`/payroll/periods/${props.periodId}/manual-bulk`, {
      attendeeNames: String(bulkAttendees.value || '').trim(),
      serviceCode: String(bulkServiceCode.value || 'MEETING').trim().toUpperCase(),
      quantity: Number(bulkQuantity.value),
      inputType: bulkInputType.value,
      meetingDate: String(bulkMeetingDate.value || '').trim().slice(0, 10) || undefined,
      reason: String(bulkReason.value || '').trim() || undefined
    });
    bulkAttendees.value = '';
    bulkQuantity.value = '';
    bulkReason.value = '';
    tab.value = 'manual';
    await loadLines();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to submit bulk';
  } finally {
    bulkSaving.value = false;
  }
};

// Adjustments
const adjUserId = ref(null);
const adjLoading = ref(false);
const adjSaving = ref(false);
const emptyAdj = () => ({
  mileageAmount: 0,
  medcancelAmount: 0,
  otherTaxableAmount: 0,
  imatterAmount: 0,
  missedAppointmentsAmount: 0,
  bonusAmount: 0,
  reimbursementAmount: 0,
  tuitionReimbursementAmount: 0,
  otherRate1Hours: 0,
  otherRate2Hours: 0,
  otherRate3Hours: 0,
  salaryAmount: 0,
  sickPtoHours: 0,
  trainingPtoHours: 0,
  ptoHours: 0,
  ptoRate: 0
});
const adj = ref(emptyAdj());

const loadAdjustments = async () => {
  if (!adjUserId.value || !props.periodId) return;
  adjLoading.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/payroll/periods/${props.periodId}/adjustments`, { params: { userId: adjUserId.value } });
    const a = resp.data || {};
    adj.value = {
      mileageAmount: Number(a.mileage_amount || 0),
      medcancelAmount: Number(a.medcancel_amount || 0),
      otherTaxableAmount: Number(a.other_taxable_amount || 0),
      imatterAmount: Number(a.imatter_amount || 0),
      missedAppointmentsAmount: Number(a.missed_appointments_amount || 0),
      bonusAmount: Number(a.bonus_amount || 0),
      reimbursementAmount: Number(a.reimbursement_amount || 0),
      tuitionReimbursementAmount: Number(a.tuition_reimbursement_amount || 0),
      otherRate1Hours: Number(a.other_rate_1_hours || 0),
      otherRate2Hours: Number(a.other_rate_2_hours || 0),
      otherRate3Hours: Number(a.other_rate_3_hours || 0),
      salaryAmount: Number(a.salary_amount || 0),
      sickPtoHours: Number(a.sick_pto_hours || 0),
      trainingPtoHours: Number(a.training_pto_hours || 0),
      ptoHours: Number(a.pto_hours || 0),
      ptoRate: Number(a.pto_rate || 0)
    };
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load adjustments';
    adj.value = emptyAdj();
  } finally {
    adjLoading.value = false;
  }
};

const saveAdjustments = async () => {
  if (!adjUserId.value) return;
  adjSaving.value = true;
  error.value = '';
  try {
    await api.put(`/payroll/periods/${props.periodId}/adjustments/${adjUserId.value}`, {
      mileageAmount: Number(adj.value.mileageAmount || 0),
      medcancelAmount: Number(adj.value.medcancelAmount || 0),
      otherTaxableAmount: Number(adj.value.otherTaxableAmount || 0),
      imatterAmount: Number(adj.value.imatterAmount || 0),
      missedAppointmentsAmount: Number(adj.value.missedAppointmentsAmount || 0),
      bonusAmount: Number(adj.value.bonusAmount || 0),
      reimbursementAmount: Number(adj.value.reimbursementAmount || 0),
      tuitionReimbursementAmount: Number(adj.value.tuitionReimbursementAmount || 0),
      otherRate1Hours: Number(adj.value.otherRate1Hours || 0),
      otherRate2Hours: Number(adj.value.otherRate2Hours || 0),
      otherRate3Hours: Number(adj.value.otherRate3Hours || 0),
      salaryAmount: Number(adj.value.salaryAmount || 0),
      sickPtoHours: Number(adj.value.sickPtoHours || 0),
      trainingPtoHours: Number(adj.value.trainingPtoHours || 0),
      ptoHours: Number(adj.value.ptoHours || 0),
      ptoRate: Number(adj.value.ptoRate || 0)
    });
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to save adjustments';
  } finally {
    adjSaving.value = false;
  }
};

const loadUsers = async () => {
  if (!props.agencyId) return;
  loadingUsers.value = true;
  try {
    const resp = await api.get('/payroll/agency-users', { params: { agencyId: props.agencyId, includeInactive: true } });
    users.value = (resp.data || []).slice().sort((a, b) =>
      String(a.last_name || '').localeCompare(String(b.last_name || '')) ||
      String(a.first_name || '').localeCompare(String(b.first_name || ''))
    );
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load providers';
  } finally {
    loadingUsers.value = false;
  }
};

const loadServiceCodes = async () => {
  if (!props.agencyId) return;
  try {
    const resp = await api.get('/payroll/service-code-rules', { params: { agencyId: props.agencyId } });
    serviceRules.value = resp.data || [];
    const codes = (serviceRules.value || [])
      .map((r) => String(r.service_code || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    serviceCodes.value = codes.length ? codes : ['MEETING'];
    if (!serviceCodes.value.includes(bulkServiceCode.value)) {
      bulkServiceCode.value = serviceCodes.value.includes('MEETING') ? 'MEETING' : serviceCodes.value[0];
    }
  } catch {
    serviceCodes.value = ['MEETING'];
  }
};

const reloadAll = async () => {
  error.value = '';
  await Promise.all([loadUsers(), loadServiceCodes(), loadLines()]);
  if (adjUserId.value) await loadAdjustments();
};

watch(() => [props.agencyId, props.periodId], reloadAll);
onMounted(() => {
  reloadAll();
  document.addEventListener('mousedown', handleAdjClickOutside);
});
onUnmounted(() => {
  document.removeEventListener('mousedown', handleAdjClickOutside);
});
</script>

<style scoped>
.psp { display: flex; flex-direction: column; gap: 12px; }
.psp-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.psp-title { font-size: 1.05rem; font-weight: 800; color: var(--text-primary, #1d2633); }
.psp-hint { font-size: 13px; color: var(--text-secondary, #64748b); margin-top: 4px; max-width: 820px; }
.psp-period { margin-top: 6px; font-size: 13px; }
.psp-tabs {
  display: flex; flex-wrap: wrap; gap: 0;
  border-bottom: 2px solid var(--border, #e2e8f0);
}
.psp-tab {
  padding: 7px 14px; font-size: 13px; font-weight: 600;
  background: none; border: none; border-bottom: 2px solid transparent;
  margin-bottom: -2px; cursor: pointer; color: var(--text-secondary, #64748b);
}
.psp-tab:hover { color: var(--pr-forest, #2d5a3d); }
.psp-tab.active { color: var(--pr-forest, #2d5a3d); border-bottom-color: var(--pr-forest, #2d5a3d); }
.psp-error {
  padding: 8px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; font-size: 13px;
}
.psp-muted { color: var(--text-secondary, #64748b); font-size: 13px; }
.psp-section-title {
  margin-top: 16px; font-size: 13px; font-weight: 750; color: var(--text-primary, #1d2633);
}
.psp-table-wrap { overflow-x: auto; max-height: 380px; overflow-y: auto; }
.psp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.psp-table th, .psp-table td {
  padding: 8px 10px; border-bottom: 1px solid var(--border, #e2e8f0);
  text-align: left; vertical-align: middle;
}
.psp-table th {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em;
  color: var(--text-secondary, #64748b); position: sticky; top: 0; background: #fff;
}
.psp-table .right { text-align: right; }
.psp-table select, .psp-table input, .psp-grid input, .psp-grid select, .psp-grid textarea,
.psp-adj-grid input, .field select {
  width: 100%; padding: 6px 8px; border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px; font-size: 13px; background: #fff;
}
.psp-actions {
  display: flex; justify-content: space-between; align-items: center;
  gap: 10px; margin-top: 10px; flex-wrap: wrap;
}
.psp-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;
}
.psp-adj-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px; margin-top: 14px;
}
.field label {
  display: block; font-size: 12px; font-weight: 600;
  color: var(--text-secondary, #64748b); margin-bottom: 4px;
}

/* ── Provider combobox ──────────────────────────────────────────────────── */
.psp-provider-field { max-width: 420px; }
.psp-combo { position: relative; }
.psp-combo-trigger {
  display: flex; align-items: center; gap: 4px;
  border: 1px solid var(--border, #e2e8f0); border-radius: 6px;
  background: #fff; padding: 0 8px; min-height: 34px; cursor: text;
  transition: border-color 0.15s;
}
.psp-combo-trigger:hover { border-color: var(--pr-mint, #a8d5ba); }
.psp-combo-trigger.open { border-color: var(--pr-forest, #2d5a3d); box-shadow: 0 0 0 2px rgba(45,90,61,.12); }
.psp-combo-trigger.disabled { opacity: 0.6; cursor: not-allowed; }
.psp-combo-value {
  flex: 1; font-size: 13px; color: var(--text-primary, #1d2633);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 34px;
}
.psp-combo-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 13px; padding: 6px 0; color: var(--text-primary, #1d2633);
  min-width: 0;
}
.psp-combo-clear {
  border: none; background: none; cursor: pointer; padding: 2px 4px;
  font-size: 13px; color: var(--text-secondary, #64748b); line-height: 1;
  flex-shrink: 0;
}
.psp-combo-clear:hover { color: #b91c1c; }
.psp-combo-arrow {
  font-size: 10px; color: var(--text-secondary, #64748b); flex-shrink: 0;
  pointer-events: none;
}
.psp-combo-drop {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 400;
  background: #fff; border: 1px solid var(--border, #e2e8f0); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.12); max-height: 280px; overflow-y: auto;
}
.psp-combo-empty {
  padding: 10px 12px; font-size: 13px; color: var(--text-secondary, #64748b);
  font-style: italic;
}
.psp-combo-group {
  padding: 6px 12px 4px; font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--text-secondary, #64748b); border-top: 1px solid var(--border, #e2e8f0);
  margin-top: 4px; background: #f8fafc;
}
.psp-combo-option {
  padding: 8px 12px; font-size: 13px; cursor: pointer;
  color: var(--text-primary, #1d2633);
  transition: background 0.1s;
}
.psp-combo-option:hover,
.psp-combo-option--selected { background: #f0faf4; color: var(--pr-forest, #2d5a3d); }
.psp-combo-option--inactive { color: var(--text-secondary, #64748b); font-style: italic; }
.psp-combo-option--inactive:hover { background: #f8fafc; color: #475569; }
</style>
