<template>
  <div class="pcp">
    <div class="pcp-head">
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

    <div class="pcp-tabs">
      <button type="button" class="pcp-tab" :class="{ active: tab === 'time' }" @click="tab = 'time'">
        Time Claims <span v-if="timeClaims.length" class="pcp-count">{{ timeClaims.length }}</span>
      </button>
      <button type="button" class="pcp-tab" :class="{ active: tab === 'mileage' }" @click="tab = 'mileage'">
        Mileage <span v-if="mileageClaims.length" class="pcp-count">{{ mileageClaims.length }}</span>
      </button>
      <button type="button" class="pcp-tab" :class="{ active: tab === 'reimbursement' }" @click="tab = 'reimbursement'">
        Reimbursements <span v-if="reimbClaims.length" class="pcp-count">{{ reimbClaims.length }}</span>
      </button>
      <button type="button" class="pcp-tab" :class="{ active: tab === 'medcancel' }" @click="tab = 'medcancel'">
        MedCancel <span v-if="medClaims.length" class="pcp-count">{{ medClaims.length }}</span>
      </button>
    </div>

    <div v-if="error" class="pcp-error">{{ error }}</div>
    <div v-if="loading" class="pcp-muted">Loading pending submissions…</div>

    <template v-else>
      <!-- Time -->
      <div v-if="tab === 'time'" class="pcp-body">
        <div v-if="!timeClaims.length" class="pcp-muted">No pending time claims for this pay period.</div>
        <div v-else class="pcp-table-wrap">
          <table class="pcp-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Date</th>
                <th>Type</th>
                <th class="right">Hours</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in timeClaims" :key="c.id">
                <td>{{ providerName(c) }}</td>
                <td>{{ fmtDate(c.claim_date) }}</td>
                <td>{{ timeTypeLabel(c) }}</td>
                <td class="right">{{ fmtHours(c) }}</td>
                <td class="right">
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="busyId === c.id" @click="openTimeClaimView(c)">View</button>
                  <button type="button" class="btn btn-primary btn-sm" :disabled="busyId === c.id || locked" @click="approveTime(c)">
                    {{ busyId === c.id ? '…' : 'Approve' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="busyId === c.id || locked" @click="rejectTime(c)">Reject</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mileage -->
      <div v-else-if="tab === 'mileage'" class="pcp-body">
        <div v-if="!mileageClaims.length" class="pcp-muted">No pending mileage submissions for this pay period.</div>
        <div v-else class="pcp-table-wrap">
          <table class="pcp-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Date</th>
                <th class="right">Miles</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in mileageClaims" :key="c.id">
                <td>{{ providerName(c) }}</td>
                <td>{{ fmtDate(c.claim_date || c.trip_date) }}</td>
                <td class="right">{{ Number(c.miles || c.total_miles || 0).toFixed(1) }}</td>
                <td class="right">
                  <button type="button" class="btn btn-primary btn-sm" :disabled="busyId === c.id || locked" @click="approveMileage(c)">
                    {{ busyId === c.id ? '…' : 'Approve' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="busyId === c.id || locked" @click="rejectMileage(c)">Reject</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Reimbursement -->
      <div v-else-if="tab === 'reimbursement'" class="pcp-body">
        <div v-if="!reimbClaims.length" class="pcp-muted">No pending reimbursements for this pay period.</div>
        <div v-else class="pcp-table-wrap">
          <table class="pcp-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Date</th>
                <th>Description</th>
                <th class="right">Amount</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in reimbClaims" :key="c.id">
                <td>{{ providerName(c) }}</td>
                <td>{{ fmtDate(c.claim_date) }}</td>
                <td>{{ c.description || c.notes || '—' }}</td>
                <td class="right">${{ Number(c.amount || 0).toFixed(2) }}</td>
                <td class="right">
                  <button type="button" class="btn btn-primary btn-sm" :disabled="busyId === c.id || locked" @click="approveReimb(c)">
                    {{ busyId === c.id ? '…' : 'Approve' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="busyId === c.id || locked" @click="rejectReimb(c)">Reject</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- MedCancel -->
      <div v-else class="pcp-body">
        <div v-if="!medClaims.length" class="pcp-muted">No pending MedCancel submissions for this pay period.</div>
        <div v-else class="pcp-table-wrap">
          <table class="pcp-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Date</th>
                <th>Client</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in medClaims" :key="c.id">
                <td>{{ providerName(c) }}</td>
                <td>{{ fmtDate(c.claim_date || c.service_date) }}</td>
                <td>{{ c.client_hint || c.client_name || '—' }}</td>
                <td class="right">
                  <button type="button" class="btn btn-primary btn-sm" :disabled="busyId === c.id || locked" @click="approveMed(c)">
                    {{ busyId === c.id ? '…' : 'Approve' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="busyId === c.id || locked" @click="rejectMed(c)">Reject</button>
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
        <div v-if="reviewedTimeClaim" class="pcp-modal-body">
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
          <template v-else-if="reviewedTimeClaim.payload">
            <pre class="pcp-payload">{{ JSON.stringify(reviewedTimeClaim.payload, null, 2) }}</pre>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  periodId: { type: [Number, String], required: true },
  periodLabel: { type: String, default: '' },
  periodStatus: { type: String, default: '' },
  /** Embedded in wizard — uses full-width layout tweaks from parent. */
  embedded: { type: Boolean, default: false }
});

defineEmits(['changed']);

const tab = ref('time');
const loading = ref(false);
const error = ref('');
const busyId = ref(null);
const timeClaimViewOpen = ref(false);
const reviewedTimeClaim = ref(null);

const openTimeClaimView = (c) => {
  reviewedTimeClaim.value = c;
  timeClaimViewOpen.value = true;
};
const closeTimeClaimView = () => {
  timeClaimViewOpen.value = false;
  reviewedTimeClaim.value = null;
};

const timeClaims = ref([]);
const mileageClaims = ref([]);
const reimbClaims = ref([]);
const medClaims = ref([]);
const agencyUsers = ref([]);

const locked = computed(() => {
  const st = String(props.periodStatus || '').toLowerCase();
  return st === 'posted' || st === 'finalized';
});

const totalPending = computed(
  () => timeClaims.value.length + mileageClaims.value.length + reimbClaims.value.length + medClaims.value.length
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
  const t = String(c.claim_type || c.type || c.time_type || '').trim().toLowerCase();
  if (!t) return 'Time';
  if (t === 'indirect_time') {
    const bucket = String(c?.payload?.bucket || c?.bucket || '').trim().toLowerCase();
    return bucket === 'other_1' ? 'Log Time (Other 1)' : 'Log Time';
  }
  if (t === 'training_focus_completion') return 'Training Focus Completion';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
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
    const [timeResp, mileResp, reimbResp, medResp, usersResp] = await Promise.all([
      api.get('/payroll/time-claims', { params: claimParams }),
      api.get('/payroll/mileage-claims', { params: claimParams }),
      api.get('/payroll/reimbursement-claims', { params: claimParams }),
      api.get('/payroll/medcancel-claims', { params: claimParams }),
      usersPromise
    ]);
    if (!agencyUsers.value.length) agencyUsers.value = usersResp.data || [];
    const actionableForPeriod = (r) => {
      if (!r) return false;
      const target = Number(r.target_payroll_period_id || 0);
      if (target && target !== periodId) return false;
      const suggested = Number(r.suggested_payroll_period_id || 0);
      // Prefer this period’s suggestions, but also keep unassigned / rolled-forward leftovers.
      return !suggested || suggested === periodId;
    };
    timeClaims.value = (timeResp.data || []).filter((r) => !isEventTime(r) && actionableForPeriod(r));
    mileageClaims.value = (mileResp.data || []).filter(actionableForPeriod);
    reimbClaims.value = (reimbResp.data || []).filter(actionableForPeriod);
    medClaims.value = (medResp.data || []).filter(actionableForPeriod);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load pending submissions';
  } finally {
    loading.value = false;
  }
};

const withBusy = async (id, fn) => {
  try {
    busyId.value = id;
    error.value = '';
    await fn();
    await reload();
  } catch (e) {
    const status = e?.response?.status || 0;
    const msg = e?.response?.data?.error?.message || e?.message || '';
    const looksLikeDeadline =
      String(msg).toLowerCase().includes('deadline') ||
      String(msg).toLowerCase().includes('submitted after') ||
      String(msg).toLowerCase().includes('cannot be added to an earlier pay period');
    if (status === 409 && looksLikeDeadline) {
      const ok = window.confirm('This was submitted after the cutoff.\n\nApprove anyway with an admin override?');
      if (ok) {
        try {
          await fn(true);
          await reload();
          return;
        } catch (e2) {
          error.value = e2?.response?.data?.error?.message || e2?.message || 'Action failed';
          return;
        }
      }
    }
    error.value = msg || 'Action failed';
  } finally {
    busyId.value = null;
  }
};

const approveTime = (c) =>
  withBusy(c.id, (override) => {
    const hours = claimHoursValue(c);
    return api.patch(`/payroll/time-claims/${c.id}`, {
      action: 'approve',
      targetPayrollPeriodId: Number(props.periodId),
      bucket: timeClaimApproveBucket(c),
      ...(hours > 0 ? { creditsHours: hours } : {}),
      ...(override ? { overrideDeadline: true } : {})
    });
  });

const rejectTime = (c) => {
  const reason = window.prompt('Rejection reason (optional):', '') ?? null;
  if (reason === null) return;
  return withBusy(c.id, () =>
    api.patch(`/payroll/time-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() })
  );
};

const approveMileage = (c) =>
  withBusy(c.id, (override) =>
    api.patch(`/payroll/mileage-claims/${c.id}`, {
      action: 'approve',
      targetPayrollPeriodId: Number(props.periodId),
      ...(override ? { overrideDeadline: true } : {})
    })
  );

const rejectMileage = (c) => {
  const reason = window.prompt('Rejection reason (optional):', '') ?? null;
  if (reason === null) return;
  return withBusy(c.id, () =>
    api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() })
  );
};

const approveReimb = (c) =>
  withBusy(c.id, (override) =>
    api.patch(`/payroll/reimbursement-claims/${c.id}`, {
      action: 'approve',
      targetPayrollPeriodId: Number(props.periodId),
      ...(override ? { overrideDeadline: true } : {})
    })
  );

const rejectReimb = (c) => {
  const reason = window.prompt('Rejection reason (optional):', '') ?? null;
  if (reason === null) return;
  return withBusy(c.id, () =>
    api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() })
  );
};

const approveMed = (c) =>
  withBusy(c.id, (override) =>
    api.patch(`/payroll/medcancel-claims/${c.id}`, {
      action: 'approve',
      targetPayrollPeriodId: Number(props.periodId),
      ...(override ? { overrideDeadline: true } : {})
    })
  );

const rejectMed = (c) => {
  const reason = window.prompt('Rejection reason (optional):', '') ?? null;
  if (reason === null) return;
  return withBusy(c.id, () =>
    api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() })
  );
};

watch(() => [props.agencyId, props.periodId], () => {
  agencyUsers.value = [];
  reload();
});
onMounted(reload);
</script>

<style scoped>
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
