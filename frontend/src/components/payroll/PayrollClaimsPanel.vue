<template>
  <div class="pcp">
    <div v-if="!guided" class="pcp-head">
      <div>
        <div class="pcp-title">Pending Submissions</div>
        <div class="pcp-hint">
          Approve what belongs in this pay period. You can leave the rest — Run Payroll will offer to carry
          skipped claims to the next period so they stay available to approve later.
        </div>
        <div v-if="periodLabel" class="pcp-period">Period: <strong>{{ periodLabel }}</strong></div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="reload">Refresh</button>
    </div>

    <div v-if="!guided || totalPending" class="pcp-tabs">
      <button type="button" class="pcp-tab" :class="{ active: tab === 'time' }" @click="tab = 'time'">
        Time Claims <span v-if="timeClaims.length" class="pcp-count">{{ timeClaims.length }}</span>
      </button>
      <button type="button" class="pcp-tab" :class="{ active: tab === 'mileage' }" @click="tab = 'mileage'">
        Mileage <span v-if="mileageClaims.length" class="pcp-count">{{ mileageClaims.length }}</span>
      </button>
      <button type="button" class="pcp-tab" :class="{ active: tab === 'reimbursement' }" @click="tab = 'reimbursement'">
        Reimbursements <span v-if="reimbClaims.length" class="pcp-count">{{ reimbClaims.length }}</span>
      </button>
    </div>

    <div v-if="error" class="pcp-error">{{ error }}</div>
    <div v-if="claimNotice" role="status" class="pcp-notice">{{ claimNotice }}</div>
    <div v-if="loading" class="pcp-muted">Loading pending submissions…</div>

    <PayrollWizardEmpty v-else-if="guided && !error && !totalPending" title="No pending claims" message="There are no submitted claims awaiting a decision for this pay period. Continue to Payroll Stage." />
    <template v-else-if="!error">
      <label v-if="guided && totalPending && !locked" class="pcp-defer">
        <input v-model="deferred" type="checkbox" />
        Leave these {{ totalPending }} pending claims for the next payroll. They will remain submitted.
      </label>
      <!-- Time -->
      <div v-if="tab === 'time'" class="pcp-body">
        <div v-if="timeClaims.length" class="pcp-bulk-actions">
          <span>{{ selectedRows('time').length }} selected</span>
          <button class="btn btn-primary btn-sm" :disabled="claimsBusy || locked || !selectedRows('time').length" @click="bulkClaims('time', 'approve')">Approve selected</button>
          <button class="btn btn-secondary btn-sm" :disabled="claimsBusy || locked || !selectedRows('time').length" @click="bulkClaims('time', 'return')">Send back selected</button>
        </div>
        <div v-if="!timeClaims.length" class="pcp-muted">No pending time claims for this pay period.</div>
        <div v-else class="pcp-table-wrap">
          <table class="pcp-table">
            <thead>
              <tr>
                <th><input type="checkbox" :checked="allSelected('time')" :disabled="claimsBusy || locked" aria-label="Select all time claims" @change="review.toggleAll('time', timeClaims, $event.target.checked)" /></th><th>Provider</th>
                <th>Date</th>
                <th>Type</th>
                <th class="right">Hours</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in timeClaims" :key="c.id">
                <td><input type="checkbox" v-model="selectedClaims" :value="claimKey('time', c)" :disabled="claimsBusy || locked" :aria-label="`Select time claim ${c.id} for ${providerName(c)}`" /></td><td>{{ providerName(c) }}<div v-if="claimErrors[claimKey('time',c)]" class="pcp-error" role="alert">{{ claimErrors[claimKey('time',c)] }}</div></td>
                <td>{{ fmtDate(c.claim_date) }}</td>
                <td>
                  <div>{{ timeTypeLabel(c) }}</div><button v-if="c.approvalBlocker?.type === 'event_travel'" class="btn btn-secondary btn-sm" @click="openTimeClaimView(c)">Review travel report</button>
                  <div v-if="logTimeSummary(c)" class="pcp-muted" style="margin-top: 4px; max-width: 240px;">{{ logTimeSummary(c) }}</div>
                </td>
                <td class="right">{{ fmtHours(c) }}</td>
                <td class="right pcp-actions-cell"><div class="pcp-row-actions">
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="claimsBusy" @click="openTimeClaimView(c)">View</button>
                  <button type="button" class="btn btn-primary btn-sm" :disabled="claimsBusy || locked" @click="approveTime(c)">
                    {{ claimsBusy ? '…' : 'Approve' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="claimsBusy || locked" @click="returnTime(c)">Send back…</button>
</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mileage -->
      <div v-else-if="tab === 'mileage'" class="pcp-body">
        <div v-if="mileageClaims.length" class="pcp-bulk-actions">
          <span>{{ selectedRows('mileage').length }} selected</span>
          <button class="btn btn-primary btn-sm" :disabled="claimsBusy || locked || !selectedRows('mileage').length" @click="bulkClaims('mileage', 'approve')">Approve selected</button>
          <button class="btn btn-secondary btn-sm" :disabled="claimsBusy || locked || !selectedRows('mileage').length" @click="bulkClaims('mileage', 'reject')">Reject selected</button>
        </div>
        <div v-if="!mileageClaims.length" class="pcp-muted">No pending mileage submissions for this pay period.</div>
        <div v-else class="pcp-table-wrap">
          <table class="pcp-table">
            <thead>
              <tr>
                <th><input type="checkbox" :checked="allSelected('mileage')" :disabled="claimsBusy || locked" aria-label="Select all mileage claims" @change="review.toggleAll('mileage', mileageClaims, $event.target.checked)" /></th><th>Provider</th>
                <th>Date</th>
                <th class="right">Miles</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in mileageClaims" :key="c.id">
                <td><input type="checkbox" v-model="selectedClaims" :value="claimKey('mileage', c)" :disabled="claimsBusy || locked" :aria-label="`Select mileage claim ${c.id} for ${providerName(c)}`" /></td><td>{{ providerName(c) }}<div v-if="claimErrors[claimKey('mileage',c)]" class="pcp-error" role="alert">{{ claimErrors[claimKey('mileage',c)] }}</div></td>
                <td>{{ fmtDate(c.drive_date || c.claim_date || c.trip_date) }}<details v-if="c.event_travel_report_id"><summary>Review event travel</summary><EventTravelPayrollReview :report-id="c.event_travel_report_id" @reviewed="reload" /></details></td>
                <td class="right">{{ Number(c.miles || c.total_miles || 0).toFixed(1) }}</td>
                <td class="right pcp-actions-cell"><div class="pcp-row-actions">
                  <button type="button" class="btn btn-primary btn-sm" :disabled="claimsBusy || locked" @click="approveMileage(c)">
                    {{ claimsBusy ? '…' : 'Approve' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="claimsBusy || locked" @click="rejectMileage(c)">Reject</button>
</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Reimbursement -->
      <div v-else-if="tab === 'reimbursement'" class="pcp-body">
        <div v-if="reimbClaims.length" class="pcp-bulk-actions">
          <span>{{ selectedRows('reimb').length }} selected</span>
          <button class="btn btn-primary btn-sm" :disabled="claimsBusy || locked || !selectedRows('reimb').length" @click="bulkClaims('reimb', 'approve')">Approve selected</button>
          <button class="btn btn-secondary btn-sm" :disabled="claimsBusy || locked || !selectedRows('reimb').length" @click="bulkClaims('reimb', 'reject')">Reject selected</button>
        </div>
        <div v-if="!reimbClaims.length" class="pcp-muted">No pending reimbursements for this pay period.</div>
        <div v-else class="pcp-table-wrap">
          <table class="pcp-table">
            <thead>
              <tr>
                <th><input type="checkbox" :checked="allSelected('reimb')" :disabled="claimsBusy || locked" aria-label="Select all reimb claims" @change="review.toggleAll('reimb', reimbClaims, $event.target.checked)" /></th><th>Provider</th>
                <th>Date</th>
                <th>Description</th>
                <th class="right">Amount</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in reimbClaims" :key="c.id">
                <td><input type="checkbox" v-model="selectedClaims" :value="claimKey('reimb', c)" :disabled="claimsBusy || locked" :aria-label="`Select reimb claim ${c.id} for ${providerName(c)}`" /></td><td>{{ providerName(c) }}<div v-if="claimErrors[claimKey('reimb',c)]" class="pcp-error" role="alert">{{ claimErrors[claimKey('reimb',c)] }}</div></td>
                <td>{{ fmtDate(c.claim_date) }}</td>
                <td>{{ c.description || c.notes || '—' }}</td>
                <td class="right">${{ Number(c.amount || 0).toFixed(2) }}</td>
                <td class="right pcp-actions-cell"><div class="pcp-row-actions">
                  <button type="button" class="btn btn-primary btn-sm" :disabled="claimsBusy || locked" @click="approveReimb(c)">
                    {{ claimsBusy ? '…' : 'Approve' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="claimsBusy || locked" @click="rejectReimb(c)">Reject</button>
</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="pcp-footer">
        <span class="pcp-muted">
          {{ totalPending }} pending total
          <template v-if="totalPending === 0"> — you're clear to continue.</template>
        </span>
      </div>
    </template>

    <div v-if="timeClaimViewOpen" class="pcp-modal-backdrop" @click.self="closeTimeClaimView">
      <div class="pcp-modal">
        <div class="pcp-modal-head">
          <div>
            <div class="pcp-modal-title">Time Claim Details</div>
            <div class="pcp-muted" v-if="reviewedTimeClaim">
              {{ providerName(reviewedTimeClaim) }} — {{ timeTypeLabel(reviewedTimeClaim) }} — {{ fmtDate(reviewedTimeClaim.claim_date) }}
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" @click="closeTimeClaimView">Close</button>
        </div>
        <div v-if="timeDetailLoading" role="status" class="pcp-muted">Loading claim details…</div>
        <div v-if="timeDetailError" role="alert" class="pcp-error">{{ timeDetailError }}</div>
        <MeetingClaimDetails v-if="reviewedTimeClaim?.payload?.source === 'meeting_compensation_auto'" :claim="reviewedTimeClaim" :employee-name="providerName(reviewedTimeClaim)" :period-label="periodLabel" />
          <div v-else-if="reviewedTimeClaim" class="pcp-modal-body">
          <div class="pcp-detail-grid">
            <div><strong>Claim ID</strong><div>{{ reviewedTimeClaim.id }}</div></div>
            <div><strong>Status</strong><div>{{ String(reviewedTimeClaim.status || '').toUpperCase() }}</div></div>
            <div><strong>Hours</strong><div>{{ fmtHours(reviewedTimeClaim) }}</div></div>
            <div><strong>Type</strong><div>{{ timeTypeLabel(reviewedTimeClaim) }}</div></div>
          </div>
          <template v-if="reviewedTimeClaim.claim_type === 'training_focus_completion'">
            <div><strong>Training Focus</strong><div>{{ reviewedTimeClaim.payload?.trainingFocusName || '—' }}</div></div>
            <div><strong>Total Minutes</strong><div>{{ reviewedTimeClaim.payload?.totalMinutes ?? '—' }}
              <span class="pcp-muted" v-if="reviewedTimeClaim.payload?.minutesSource">({{ reviewedTimeClaim.payload.minutesSource }})</span>
            </div></div>
            <div v-if="Array.isArray(reviewedTimeClaim.payload?.stepBreakdown)" class="pcp-steps">
              <div v-for="step in reviewedTimeClaim.payload.stepBreakdown" :key="step.stepId">
                {{ step.title }} — {{ Math.floor((step.effectiveSeconds || step.timeSpentSeconds || 0) / 60) }} min
              </div>
            </div>
          </template>
          <template v-else-if="reviewedTimeClaim.claim_type === 'indirect_time'">
            <IndirectTimeClaimDetailFields
              :can-review-event-travel="true" @event-travel-reviewed="reload"
              :payload="reviewedTimeClaim.payload"
              :bucket="reviewedTimeClaim.payload?.bucket || reviewedTimeClaim.bucket"
            />
          </template>
          <template v-else-if="reviewedTimeClaim.payload">
            <pre class="pcp-payload">{{ JSON.stringify(reviewedTimeClaim.payload, null, 2) }}</pre>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { usePayrollClaimReview, claimKey } from '../../composables/usePayrollClaimReview';
import EventTravelPayrollReview from './EventTravelPayrollReview.vue';
import { supervisionActivityLabel } from '../../utils/payrollSubmissionReview';
import MeetingClaimDetails from './MeetingClaimDetails.vue';
import { computed, onMounted, ref, watch } from 'vue';
import PayrollWizardEmpty from './PayrollWizardEmpty.vue';
import api from '../../services/api';
import IndirectTimeClaimDetailFields from './IndirectTimeClaimDetailFields.vue';
import { logTimeActivitiesSummary } from '../../utils/logTimeClaimDetails';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  periodId: { type: [Number, String], required: true },
  periodLabel: { type: String, default: '' },
  periodStatus: { type: String, default: '' },
  /** Embedded in wizard — uses full-width layout tweaks from parent. */
  embedded: { type: Boolean, default: false },
  guided: { type: Boolean, default: false }
});

const emit = defineEmits(['changed', 'readiness']);
const deferred = ref(false);
const loaded = ref(false);

const tab = ref('time');
const loading = ref(false);
const error = ref('');
const timeClaimViewOpen = ref(false);
const reviewedTimeClaim = ref(null);

const timeClaims = ref([]);
const mileageClaims = ref([]);
const reimbClaims = ref([]);
const agencyUsers = ref([]);
const review = usePayrollClaimReview({ agencyId: () => props.agencyId,
  queues: { time: timeClaims, mileage: mileageClaims, reimb: reimbClaims },
  onChanged: () => emit('changed'),
  onReview: (kind, claim) => { if (kind === 'time') openTimeClaimView(claim); }
});
const { selected: selectedClaims, errors: claimErrors, busy: claimsBusy, notice: claimNotice } = review;
const pendingRows = kind => ({ time: timeClaims.value, mileage: mileageClaims.value, reimb: reimbClaims.value }[kind] || []);
const selectedRows = kind => pendingRows(kind).filter(c => selectedClaims.value.includes(claimKey(kind,c)));
const allSelected = kind => !!pendingRows(kind).length && selectedRows(kind).length === pendingRows(kind).length;
const timeDetailError = ref('');
const timeDetailLoading = ref(false);
const openTimeClaimView = async c => {
  reviewedTimeClaim.value = c; timeClaimViewOpen.value = true;
  timeDetailError.value = ''; timeDetailLoading.value = true;
  const agency = props.agencyId;
  try {
    const { data } = await api.get(`/payroll/time-claims/${c.id}`);
    if (props.agencyId === agency && timeClaimViewOpen.value && Number(reviewedTimeClaim.value?.id) === Number(c.id) && Number(data?.claim?.id) === Number(c.id)) reviewedTimeClaim.value = { ...c, ...data.claim };
  } catch (e) {
    if (props.agencyId === agency && Number(reviewedTimeClaim.value?.id) === Number(c.id)) timeDetailError.value = e?.response?.data?.error?.message || e.message;
  } finally { if (Number(reviewedTimeClaim.value?.id) === Number(c.id)) timeDetailLoading.value = false; }
};
const closeTimeClaimView = () => { timeClaimViewOpen.value = false; reviewedTimeClaim.value = null; };

const locked = computed(() => {
  const st = String(props.periodStatus || '').toLowerCase();
  return st === 'posted' || st === 'finalized';
});

const totalPending = computed(
  () => timeClaims.value.length + mileageClaims.value.length + reimbClaims.value.length
);

const nameForUserId = (uid) => {
  const id = Number(uid || 0);
  if (!id) return '—';
  const u = (agencyUsers.value || []).find((x) => Number(x.id) === id);
  if (!u) return `User #${id}`;
  const n = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  return n || `User #${id}`;
};

const providerName = (c) => {
  const n = [c.first_name || c.provider_first_name, c.last_name || c.provider_last_name].filter(Boolean).join(' ').trim();
  if (n) return n;
  if (c.provider_name) return c.provider_name;
  return nameForUserId(c.user_id);
};

const fmtDate = (d) => (d ? String(d).slice(0, 10) : '—');

const claimHoursValue = (c) => {
  const stored = Number(c?.hours || c?.credits_hours || c?.requested_hours || 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const mins = Number(c?.payload?.totalMinutes ?? c?.payload_json?.totalMinutes ?? 0);
  if (Number.isFinite(mins) && mins > 0) return Math.round((mins / 60) * 100) / 100;
  return 0;
};

const fmtHours = (c) => {
  const h = claimHoursValue(c);
  return Number.isFinite(h) && h > 0 ? h.toFixed(2) : '—';
};

const timeTypeLabel = (c) => {
  if (c?.event_travel_report_id) return 'Event travel reimbursement';
  if (supervisionActivityLabel(c)) return supervisionActivityLabel(c);
  const t = String(c.claim_type || c.type || c.time_type || '').trim().toLowerCase();
  if (!t) return 'Time';
  if (t === 'indirect_time') {
    const bucket = String(c?.payload?.bucket || c?.bucket || '').trim().toLowerCase();
    return bucket === 'other_1' ? 'Log Time (Other 1)' : 'Log Time';
  }
  if (t === 'training_focus_completion') return 'Training Focus Completion';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const logTimeSummary = (c) => {
  if (String(c?.claim_type || '').toLowerCase() !== 'indirect_time') return '';
  return logTimeActivitiesSummary(c?.payload);
};

const timeClaimApproveBucket = (c) => {
  const payloadBucket = String(c?.payload?.bucket || '').trim().toLowerCase();
  if (payloadBucket === 'other_1' || payloadBucket === 'direct' || payloadBucket === 'indirect') {
    return payloadBucket;
  }
  const stored = String(c?.bucket || '').trim().toLowerCase();
  if (stored === 'other_1' || stored === 'direct' || stored === 'indirect') return stored;
  return 'indirect';
};

const isEventTime = (r) => {
  const t = String(r?.claim_type || r?.type || '').toLowerCase();
  return t.includes('event') || t.includes('skill_builder') || Number(r?.is_event_time) === 1;
};

const reload = async () => {
  if (!props.agencyId || !props.periodId) return;
  const scope = `${props.agencyId}:${props.periodId}`;
  const since = review.revision.value;
  loading.value = true;
  error.value = '';
  try {
    const periodId = Number(props.periodId);
    // Log Time / other employee claims land with target_payroll_period_id NULL until approve.
    // Load agency-wide submitted rows (same as Pending Submissions), then keep those suggested
    // for this period or with no suggestion yet.
    // Agency-wide submitted claims; keep anything not already targeted to another period
    // so skipped/left-behind claims remain easy to approve on a later period.
    const claimParams = { agencyId: props.agencyId, status: 'submitted' };
    const usersPromise = agencyUsers.value.length
      ? Promise.resolve({ data: agencyUsers.value })
      : api.get('/payroll/agency-users', { params: { agencyId: props.agencyId } }).catch(() => ({ data: [] }));
    const [timeResp, mileResp, reimbResp, usersResp] = await Promise.all([
      api.get('/payroll/time-claims', { params: claimParams }),
      api.get('/payroll/mileage-claims', { params: claimParams }),
      api.get('/payroll/reimbursement-claims', { params: claimParams }),
      usersPromise
    ]);
    if (scope !== `${props.agencyId}:${props.periodId}`) return;
    if (!agencyUsers.value.length) agencyUsers.value = usersResp.data || [];
    const actionableForPeriod = (r) => {
      if (!r) return false;
      const target = Number(r.target_payroll_period_id || 0);
      if (target) return target === periodId;
      const suggested = Number(r.suggested_payroll_period_id || 0);
      // Prefer this period’s suggestions, but also keep unassigned / rolled-forward leftovers.
      return !suggested || suggested === periodId;
    };
    timeClaims.value = review.reconcile('time', timeResp.data || [], since).filter((r) => !isEventTime(r) && actionableForPeriod(r));
    mileageClaims.value = review.reconcile('mileage', mileResp.data || [], since).filter(actionableForPeriod);
    reimbClaims.value = review.reconcile('reimb', reimbResp.data || [], since).filter(actionableForPeriod);
    const visible = { time: timeClaims.value, mileage: mileageClaims.value, reimbursement: reimbClaims.value };
    if (!visible[tab.value]?.length) tab.value = timeClaims.value.length ? 'time' : mileageClaims.value.length ? 'mileage' : 'reimbursement';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load pending submissions';
  } finally {
    loading.value = false; loaded.value = true;
  }
};

const approvalBody = (kind, c) => ({ targetPayrollPeriodId: Number(props.periodId),
  ...(kind === 'time' ? { bucket: timeClaimApproveBucket(c), ...(claimHoursValue(c) > 0 ? { creditsHours: claimHoursValue(c) } : {}) } : {}) });
const decide = (kind,c,body) => { deferred.value = false; return review.decide(kind,c,body); };
const approveTime = c => decide('time',c,{ action:'approve', ...approvalBody('time',c) });
const returnTime = c => {
  const note = window.prompt('Send back note (required):', '');
  if (note?.trim()) return decide('time',c,{ action:'return',note:note.trim() });
};
const approveMileage = c => decide('mileage',c,{ action:'approve', ...approvalBody('mileage',c) });
const rejectMileage = c => {
  const reason = window.prompt('Rejection reason (required):', '');
  if (reason?.trim()) return decide('mileage',c,{ action:'reject',rejectionReason:reason.trim() });
};
const approveReimb = c => decide('reimb',c,{ action:'approve', ...approvalBody('reimb',c) });
const rejectReimb = c => {
  const reason = window.prompt('Rejection reason (required):', '');
  if (reason?.trim()) return decide('reimb',c,{ action:'reject',rejectionReason:reason.trim() });
};
const bulkClaims = async (kind, action) => {
  const rows = selectedRows(kind);
  if (!rows.length || locked.value) return;
  let note = '';
  if (action !== 'approve') {
    note = window.prompt('Reason (required for each selected claim):', '');
    if (!note?.trim()) return;
  } else if (!window.confirm(`Approve ${rows.length} selected claims into ${props.periodLabel || 'this pay period'}?`)) return;
  deferred.value = false;
  await review.bulk(rows.map(claim => ({ kind, claim, ...(action === 'approve' ? approvalBody(kind,claim) : { note:note.trim(), rejectionReason:note.trim() }) })), action);
};

const claimSet = computed(() => [...timeClaims.value.map(c => `t${c.id}`), ...mileageClaims.value.map(c => `m${c.id}`), ...reimbClaims.value.map(c => `r${c.id}`)].sort().join(','));
watch(claimSet, () => { deferred.value = false; });
const readiness = computed(() => ({ loading: loading.value || !loaded.value, saving: claimsBusy.value, error: error.value, pendingCount: totalPending.value, deferred: deferred.value, empty: loaded.value && !loading.value && !error.value && !totalPending.value, ready: loaded.value && !loading.value && !claimsBusy.value && !error.value && (!totalPending.value || deferred.value || locked.value), blockers: totalPending.value && !deferred.value ? [{ message: `Review ${totalPending.value} pending claim(s), or explicitly leave them for the next payroll.` }] : [] }));
watch(readiness, state => emit('readiness', state), { immediate: true });
const focusPending = () => {
  tab.value = timeClaims.value.length ? 'time' : mileageClaims.value.length ? 'mileage' : 'reimbursement';
  document.querySelector('.pcp-table button')?.focus();
};
defineExpose({ refresh: reload, focusPending });
watch(() => [props.agencyId, props.periodId], () => {
  review.reset(); closeTimeClaimView();
  loaded.value = false; deferred.value = false;
  agencyUsers.value = [];
  reload();
});
onMounted(reload);
</script>

<style scoped>
.pcp-bulk-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:12px 0; }
.pcp-row-actions { display:inline-flex; gap:6px; align-items:center; flex-wrap:nowrap; white-space:nowrap; }
.pcp-actions-cell { min-width:260px; }
.pcp-notice { margin:10px 0; }
.pcp-defer { display:flex; gap:10px; padding:12px; border:1px solid #c8d9e2; border-radius:8px; background:#f6fafc; align-items:flex-start; }
.pcp {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pcp-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.pcp-title {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--text-primary, #1d2633);
}
.pcp-hint {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  margin-top: 4px;
  max-width: 720px;
}
.pcp-period {
  margin-top: 6px;
  font-size: 13px;
}
.pcp-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border-bottom: 2px solid var(--border, #e2e8f0);
}
.pcp-tab {
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
  white-space: nowrap;
}
.pcp-tab:hover { color: var(--pr-forest, #2d5a3d); }
.pcp-tab.active {
  color: var(--pr-forest, #2d5a3d);
  border-bottom-color: var(--pr-forest, #2d5a3d);
}
.pcp-count {
  display: inline-block;
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 11px;
  font-weight: 700;
}
.pcp-error {
  padding: 8px 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
}
.pcp-muted {
  color: var(--text-secondary, #64748b);
  font-size: 13px;
}
.pcp-table-wrap {
  overflow-x: auto;
  max-height: 420px;
  overflow-y: auto;
}
.pcp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.pcp-table th,
.pcp-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  text-align: left;
  vertical-align: middle;
}
.pcp-table th {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-secondary, #64748b);
  position: sticky;
  top: 0;
  background: #fff;
}
.pcp-table .right { text-align: right; }
.pcp-table .btn { margin-left: 4px; }
.pcp-footer {
  padding-top: 4px;
  border-top: 1px solid var(--border, #e2e8f0);
}
.pcp-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1300;
  padding: 16px;
}
.pcp-modal {
  width: min(640px, 100%);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.18);
  max-height: min(80vh, 720px);
  overflow: auto;
}
.pcp-modal-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.pcp-modal-title { font-weight: 800; }
.pcp-modal-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.pcp-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  font-size: 13px;
}
.pcp-steps { font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
.pcp-payload {
  margin: 0;
  font-size: 12px;
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px;
  overflow: auto;
  max-height: 280px;
}
</style>
