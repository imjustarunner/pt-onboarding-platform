<template>
  <div class="pps-page">
    <div class="pps-header">
      <div class="pps-header-left">
        <button type="button" class="pps-back" @click="goBackToPayroll">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg>
          Back to Payroll
        </button>
        <h1>Pending Submissions</h1>
        <p class="pps-subtitle">
          Approve PTO, time, event time, mileage, reimbursements, and MedCancel — then apply them to an upcoming pay period.
          Changes use the same APIs as Payroll Stage, so they appear everywhere immediately.
        </p>
      </div>
      <div class="pps-header-right">
        <div class="pps-org-chip">
          <span class="pps-org-label">Organization</span>
          <strong>{{ agencyStore.currentAgency?.name || '—' }}</strong>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="loading" @click="reloadAll">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="pageError" class="pps-error">{{ pageError }}</div>

    <div class="pps-toolbar card">
      <div class="field">
        <label>Default apply-to pay period</label>
        <select v-model="defaultTargetPeriodId" :disabled="!periodsForSelect.length">
          <option :value="null" disabled>Select pay period…</option>
          <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">
            {{ periodRangeLabel(p) }}{{ isPeriodLocked(p) ? ' (locked)' : '' }}
          </option>
        </select>
        <div class="hint muted">Used as the default destination when approving. You can override per row.</div>
      </div>
      <div class="pps-toolbar-stats">
        <div class="pps-stat"><span class="pps-stat-n">{{ totalPending }}</span><span class="pps-stat-l">Pending</span></div>
        <div class="pps-stat"><span class="pps-stat-n">{{ ptoPendingCount }}</span><span class="pps-stat-l">PTO</span></div>
        <div class="pps-stat"><span class="pps-stat-n">{{ timeClaims.length }}</span><span class="pps-stat-l">Time</span></div>
        <div class="pps-stat"><span class="pps-stat-n">{{ eventTimePendingCount }}</span><span class="pps-stat-l">Event</span></div>
        <div class="pps-stat"><span class="pps-stat-n">{{ mileageClaims.length }}</span><span class="pps-stat-l">Mileage</span></div>
        <div class="pps-stat"><span class="pps-stat-n">{{ reimbClaims.length }}</span><span class="pps-stat-l">Reimb.</span></div>
        <div class="pps-stat"><span class="pps-stat-n">{{ medClaims.length }}</span><span class="pps-stat-l">MedCancel</span></div>
      </div>
    </div>

    <div class="pps-tabs">
      <button type="button" class="pps-tab" :class="{ active: tab === 'pto' }" @click="setTab('pto')">
        PTO <span v-if="ptoPendingCount" class="pps-count">{{ ptoPendingCount }}</span>
      </button>
      <button type="button" class="pps-tab" :class="{ active: tab === 'time' }" @click="setTab('time')">
        Time Claims <span v-if="timeClaims.length" class="pps-count">{{ timeClaims.length }}</span>
      </button>
      <button type="button" class="pps-tab" :class="{ active: tab === 'event_time' }" @click="setTab('event_time')">
        Event Times <span v-if="eventTimePendingCount" class="pps-count">{{ eventTimePendingCount }}</span>
      </button>
      <button type="button" class="pps-tab" :class="{ active: tab === 'mileage' }" @click="setTab('mileage')">
        Mileage <span v-if="mileageClaims.length" class="pps-count">{{ mileageClaims.length }}</span>
      </button>
      <button type="button" class="pps-tab" :class="{ active: tab === 'reimbursement' }" @click="setTab('reimbursement')">
        Reimbursements <span v-if="reimbClaims.length" class="pps-count">{{ reimbClaims.length }}</span>
      </button>
      <button type="button" class="pps-tab" :class="{ active: tab === 'medcancel' }" @click="setTab('medcancel')">
        MedCancel <span v-if="medClaims.length" class="pps-count">{{ medClaims.length }}</span>
      </button>
    </div>

    <div v-if="loading && !bootstrapped" class="pps-loading">Loading pending submissions…</div>

    <template v-else>
      <!-- PTO -->
      <div v-if="tab === 'pto'" class="card pps-panel">
        <div class="pps-panel-head">
          <div>
            <h2>PTO Requests</h2>
            <p class="hint">Approve to deduct balances and post PTO pay into the selected pay period.</p>
          </div>
          <div class="pps-filter-bar">
            <button type="button" :class="['pps-chip', ptoStatusFilter.includes('submitted') ? 'active submitted' : '']" @click="togglePtoFilter('submitted')">
              Pending<span v-if="ptoStatusCounts.submitted" class="pps-chip-n">{{ ptoStatusCounts.submitted }}</span>
            </button>
            <button type="button" :class="['pps-chip', ptoStatusFilter.includes('approved') ? 'active approved' : '']" @click="togglePtoFilter('approved')">
              Approved<span v-if="ptoStatusCounts.approved" class="pps-chip-n">{{ ptoStatusCounts.approved }}</span>
            </button>
            <button type="button" :class="['pps-chip', ptoStatusFilter.includes('rejected') ? 'active rejected' : '']" @click="togglePtoFilter('rejected')">
              Denied<span v-if="ptoStatusCounts.rejected" class="pps-chip-n">{{ ptoStatusCounts.rejected }}</span>
            </button>
            <button
              v-if="ptoStatusCounts.deferred"
              type="button"
              :class="['pps-chip', ptoStatusFilter.includes('deferred') ? 'active deferred' : '']"
              @click="togglePtoFilter('deferred')"
            >
              Sent back<span class="pps-chip-n">{{ ptoStatusCounts.deferred }}</span>
            </button>
          </div>
        </div>

        <div v-if="actionError" class="pps-error">{{ actionError }}</div>
        <div v-if="!ptoVisible.length" class="muted">No matching PTO requests.</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Created</th>
                <th>Submitted by</th>
                <th>Type</th>
                <th>Status</th>
                <th class="right">Hours</th>
                <th class="right">Starting bal.</th>
                <th class="right">New bal.</th>
                <th>First date</th>
                <th>Proof</th>
                <th>Post to pay period</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in ptoVisible"
                :key="r.id"
                :class="{
                  'row-approved': r.status === 'approved',
                  'row-rejected': r.status === 'rejected',
                  'row-highlight': focusUserId && Number(r.user_id) === focusUserId
                }"
              >
                <td>{{ nameForUserId(r.user_id) }}</td>
                <td>{{ String(r.created_at || '').slice(0, 10) }}</td>
                <td>{{ submitterLabel(r) }}</td>
                <td>{{ String(r.request_type || '').toLowerCase() === 'training' ? 'Training PTO' : 'Sick Leave' }}</td>
                <td><span :class="['status-badge', `st-${String(r.status || 'submitted').toLowerCase()}`]">{{ statusLabel(r.status) }}</span></td>
                <td class="right">{{ fmtNum(r.total_hours) }}</td>
                <td class="right">{{ r.status === 'submitted' ? fmtNum(ptoBalancePreview(r).start) : '—' }}</td>
                <td class="right">
                  <span v-if="r.status === 'submitted'" :class="{ warn: ptoBalancePreview(r).next < -1e-9 }">{{ fmtNum(ptoBalancePreview(r).next) }}</span>
                  <span v-else class="muted">—</span>
                </td>
                <td>{{ firstPtoDate(r) }}</td>
                <td>
                  <a v-if="r.proof_file_path" :href="proofUrl(r.proof_file_path)" target="_blank" rel="noopener noreferrer">View</a>
                  <span v-else class="muted">—</span>
                </td>
                <td>
                  <template v-if="r.status === 'submitted'">
                    <select v-model="ptoTargetById[r.id]" :disabled="busyId === `pto-${r.id}`">
                      <option :value="null" disabled>— choose period —</option>
                      <option v-for="p in periodsForSelect" :key="p.id" :value="p.id" :disabled="isPeriodLocked(p)">
                        {{ periodRangeLabel(p) }}{{ isPeriodLocked(p) ? ' (locked)' : '' }}
                      </option>
                    </select>
                  </template>
                  <span v-else-if="r.approved_period_start" class="muted" style="font-size:12px;">
                    {{ String(r.approved_period_start).slice(0,10) }} – {{ String(r.approved_period_end || '').slice(0,10) }}
                  </span>
                  <span v-else class="muted">—</span>
                </td>
                <td class="right">
                  <div v-if="r.status === 'submitted'" class="actions" style="justify-content:flex-end;margin:0;">
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="busyId === `pto-${r.id}` || !isValidOpenPeriod(ptoTargetById[r.id])"
                      @click="approvePto(r)"
                    >
                      {{ busyId === `pto-${r.id}` ? '…' : 'Approve' }}
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" :disabled="busyId === `pto-${r.id}`" @click="returnPto(r)">Send back…</button>
                    <button type="button" class="btn btn-danger btn-sm" :disabled="busyId === `pto-${r.id}`" @click="rejectPto(r)">Reject</button>
                  </div>
                  <span v-else class="muted" style="font-size:12px;">{{ statusDoneLabel(r) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Time -->
      <div v-else-if="tab === 'time'" class="card pps-panel">
        <div class="pps-panel-head">
          <div>
            <h2>Time Claims</h2>
            <p class="hint">Approve pending time claims into an open pay period.</p>
          </div>
        </div>
        <div v-if="actionError" class="pps-error">{{ actionError }}</div>
        <div v-if="!timeClaims.length" class="muted">No pending time claims.</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Date</th>
                <th>Type</th>
                <th class="right">Hours</th>
                <th>Post to</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in timeClaims" :key="c.id" :class="{ 'row-highlight': focusUserId && Number(c.user_id) === focusUserId }">
                <td>{{ claimName(c) }}</td>
                <td>{{ fmtDate(c.claim_date) }}</td>
                <td>{{ timeTypeLabel(c) }}</td>
                <td class="right">{{ fmtHours(c) }}</td>
                <td>
                  <select v-model="claimTargetByKey[`time-${c.id}`]" :disabled="busyId === `time-${c.id}`">
                    <option v-for="p in periodsForSelect" :key="p.id" :value="p.id" :disabled="isPeriodLocked(p)">
                      {{ periodRangeLabel(p) }}{{ isPeriodLocked(p) ? ' (locked)' : '' }}
                    </option>
                  </select>
                </td>
                <td class="right">
                  <button type="button" class="btn btn-primary btn-sm" :disabled="busyId === `time-${c.id}` || !isValidOpenPeriod(claimTargetByKey[`time-${c.id}`])" @click="approveTime(c)">
                    {{ busyId === `time-${c.id}` ? '…' : 'Approve' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="busyId === `time-${c.id}`" @click="rejectTime(c)">Reject</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Event Times -->
      <div v-else-if="tab === 'event_time'" class="card pps-panel">
        <div class="pps-panel-head">
          <div>
            <h2>Event Times</h2>
            <p class="hint">
              Skill Builders / program event kiosk check-in/out with direct and indirect hour split.
              Each session appears as two rows (direct + indirect). Approving posts to the selected pay period.
            </p>
          </div>
          <div class="pps-filter-bar">
            <button type="button" class="btn btn-secondary btn-sm" :disabled="eventTimeLoading" @click="toggleEventTimeShowApproved">
              {{ eventTimeShowApproved ? 'Show pending only' : 'Show approved / history' }}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="eventTimeLoading" @click="loadEventTimeSubmissions">
              {{ eventTimeLoading ? 'Refreshing…' : 'Refresh' }}
            </button>
          </div>
        </div>
        <div v-if="actionError" class="pps-error">{{ actionError }}</div>
        <div v-if="eventTimeLoading && !eventTimeSubmissions.length" class="muted">Loading event time submissions…</div>
        <div v-else-if="!eventTimeSubmissions.length" class="muted">
          {{ eventTimeShowApproved ? 'No event time submissions.' : 'No pending event time submissions.' }}
        </div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Event</th>
                <th>Clock in</th>
                <th>Clock out</th>
                <th class="right">Worked</th>
                <th>Bucket</th>
                <th class="right">Hours</th>
                <th>Status</th>
                <th>Suggested period</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in eventTimeBucketRows"
                :key="row.rowKey"
                :class="{
                  'row-approved': row.claim?.status === 'approved',
                  'row-rejected': row.claim?.status === 'rejected',
                  'row-highlight': focusUserId && Number(row.submission.userId) === focusUserId
                }"
              >
                <td>{{ row.submission.providerName || nameForUserId(row.submission.userId) }}</td>
                <td>{{ row.submission.eventTitle || '—' }}</td>
                <td>
                  {{ formatEventTimeIso(row.submission.clockInAt) }}
                  <span
                    v-if="row.bucket === 'direct' && row.lateMinutes > 0"
                    class="pps-late-badge"
                    title="Expected report time on this date"
                  >+{{ row.lateMinutes }}m late</span>
                </td>
                <td>{{ formatEventTimeIso(row.submission.clockOutAt) }}</td>
                <td class="right">{{ row.submission.workedHours ?? '—' }}</td>
                <td>{{ row.bucketLabel }}</td>
                <td class="right">{{ row.bucketHours ?? '—' }}</td>
                <td>
                  <span :class="['status-badge', `st-${String(row.claim?.status || 'submitted').toLowerCase()}`]">
                    {{ statusLabel(row.claim?.status || 'submitted') }}
                  </span>
                  <span
                    v-if="row.submission.wasEdited && row.bucket === 'direct'"
                    class="pps-edited-mark"
                    title="Values changed from auto-submitted"
                  >✎ Edited</span>
                </td>
                <td class="muted" style="font-size:12px;">{{ eventTimePeriodLabel(row.claim) }}</td>
                <td class="right">
                  <div class="actions" style="justify-content:flex-end;margin:0;">
                    <template v-if="row.canApprove">
                      <select
                        v-model="eventTimeTargetPeriodByPunchId[row.submission.punchInId]"
                        :disabled="busyId === `event-${row.submission.punchInId}`"
                        style="font-size:11px;max-width:160px;"
                        title="Pay period to post to when approving"
                      >
                        <option :value="null" disabled>— select period —</option>
                        <option v-for="p in periodsForSelect" :key="p.id" :value="p.id" :disabled="isPeriodLocked(p)">
                          {{ periodRangeLabel(p) }}{{ isPeriodLocked(p) ? ' (locked)' : '' }}
                        </option>
                      </select>
                    </template>
                    <button
                      v-if="row.bucket === 'direct' && row.canApprove"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="busyId === `event-${row.submission.punchInId}`"
                      @click="openEventTimeEdit(row.submission)"
                    >
                      Edit time
                    </button>
                    <button
                      v-if="row.canApprove"
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="busyId === `event-${row.submission.punchInId}` || !isValidOpenPeriod(eventTimeTargetPeriodByPunchId[row.submission.punchInId])"
                      @click="approveEventTimeSubmission(row.submission, row.bucket)"
                    >
                      {{ busyId === `event-${row.submission.punchInId}` ? '…' : `Approve ${row.bucketLabel.toLowerCase()}` }}
                    </button>
                    <button
                      v-if="row.bucket === 'direct' && row.canApprove"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="busyId === `event-${row.submission.punchInId}`"
                      @click="returnEventTimeSubmission(row.submission)"
                    >
                      Send back…
                    </button>
                    <button
                      v-if="row.bucket === 'direct' && row.canApprove"
                      type="button"
                      class="btn btn-danger btn-sm"
                      :disabled="busyId === `event-${row.submission.punchInId}`"
                      @click="rejectEventTimeSubmission(row.submission)"
                    >
                      Reject
                    </button>
                    <button
                      v-if="row.bucket === 'direct' && !row.canApprove && row.claim?.status === 'approved'"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      :disabled="busyId === `event-${row.submission.punchInId}`"
                      @click="unapproveEventTimeSubmission(row.submission)"
                    >
                      Unapprove
                    </button>
                    <span v-if="!row.canApprove && row.claim?.status === 'rejected'" class="muted" style="font-size:12px;">Rejected</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mileage -->
      <div v-else-if="tab === 'mileage'" class="card pps-panel">
        <div class="pps-panel-head">
          <div>
            <h2>Mileage Claims</h2>
            <p class="hint">Approve pending mileage into an open pay period.</p>
          </div>
        </div>
        <div v-if="actionError" class="pps-error">{{ actionError }}</div>
        <div v-if="!mileageClaims.length" class="muted">No pending mileage claims.</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Date</th>
                <th class="right">Miles</th>
                <th>Post to</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in mileageClaims" :key="c.id" :class="{ 'row-highlight': focusUserId && Number(c.user_id) === focusUserId }">
                <td>{{ claimName(c) }}</td>
                <td>{{ fmtDate(c.claim_date || c.drive_date || c.trip_date) }}</td>
                <td class="right">{{ Number(c.eligible_miles ?? c.miles ?? c.total_miles ?? 0).toFixed(1) }}</td>
                <td>
                  <select v-model="claimTargetByKey[`mileage-${c.id}`]" :disabled="busyId === `mileage-${c.id}`">
                    <option v-for="p in periodsForSelect" :key="p.id" :value="p.id" :disabled="isPeriodLocked(p)">
                      {{ periodRangeLabel(p) }}{{ isPeriodLocked(p) ? ' (locked)' : '' }}
                    </option>
                  </select>
                </td>
                <td class="right">
                  <button type="button" class="btn btn-primary btn-sm" :disabled="busyId === `mileage-${c.id}` || !isValidOpenPeriod(claimTargetByKey[`mileage-${c.id}`])" @click="approveMileage(c)">
                    {{ busyId === `mileage-${c.id}` ? '…' : 'Approve' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="busyId === `mileage-${c.id}`" @click="rejectMileage(c)">Reject</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Reimbursement -->
      <div v-else-if="tab === 'reimbursement'" class="card pps-panel">
        <div class="pps-panel-head">
          <div>
            <h2>Reimbursements</h2>
            <p class="hint">Approve pending reimbursements into an open pay period.</p>
          </div>
        </div>
        <div v-if="actionError" class="pps-error">{{ actionError }}</div>
        <div v-if="!reimbClaims.length" class="muted">No pending reimbursements.</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Date</th>
                <th>Description</th>
                <th class="right">Amount</th>
                <th>Post to</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in reimbClaims" :key="c.id" :class="{ 'row-highlight': focusUserId && Number(c.user_id) === focusUserId }">
                <td>{{ claimName(c) }}</td>
                <td>{{ fmtDate(c.claim_date) }}</td>
                <td>{{ c.description || c.notes || '—' }}</td>
                <td class="right">${{ Number(c.amount || 0).toFixed(2) }}</td>
                <td>
                  <select v-model="claimTargetByKey[`reimb-${c.id}`]" :disabled="busyId === `reimb-${c.id}`">
                    <option v-for="p in periodsForSelect" :key="p.id" :value="p.id" :disabled="isPeriodLocked(p)">
                      {{ periodRangeLabel(p) }}{{ isPeriodLocked(p) ? ' (locked)' : '' }}
                    </option>
                  </select>
                </td>
                <td class="right">
                  <button type="button" class="btn btn-primary btn-sm" :disabled="busyId === `reimb-${c.id}` || !isValidOpenPeriod(claimTargetByKey[`reimb-${c.id}`])" @click="approveReimb(c)">
                    {{ busyId === `reimb-${c.id}` ? '…' : 'Approve' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="busyId === `reimb-${c.id}`" @click="rejectReimb(c)">Reject</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- MedCancel -->
      <div v-else-if="tab === 'medcancel'" class="card pps-panel">
        <div class="pps-panel-head">
          <div>
            <h2>MedCancel</h2>
            <p class="hint">Approve pending MedCancel claims into an open pay period.</p>
          </div>
        </div>
        <div v-if="actionError" class="pps-error">{{ actionError }}</div>
        <div v-if="!medClaims.length" class="muted">No pending MedCancel claims.</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Date</th>
                <th>Client</th>
                <th>Post to</th>
                <th class="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in medClaims" :key="c.id" :class="{ 'row-highlight': focusUserId && Number(c.user_id) === focusUserId }">
                <td>{{ claimName(c) }}</td>
                <td>{{ fmtDate(c.claim_date || c.service_date) }}</td>
                <td>{{ c.client_hint || c.client_name || '—' }}</td>
                <td>
                  <select v-model="claimTargetByKey[`med-${c.id}`]" :disabled="busyId === `med-${c.id}`">
                    <option v-for="p in periodsForSelect" :key="p.id" :value="p.id" :disabled="isPeriodLocked(p)">
                      {{ periodRangeLabel(p) }}{{ isPeriodLocked(p) ? ' (locked)' : '' }}
                    </option>
                  </select>
                </td>
                <td class="right">
                  <button type="button" class="btn btn-primary btn-sm" :disabled="busyId === `med-${c.id}` || !isValidOpenPeriod(claimTargetByKey[`med-${c.id}`])" @click="approveMed(c)">
                    {{ busyId === `med-${c.id}` ? '…' : 'Approve' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="busyId === `med-${c.id}`" @click="rejectMed(c)">Reject</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Event time edit modal -->
    <teleport to="body">
      <div v-if="eventTimeEditOpen" class="pps-modal-backdrop" @click.self="closeEventTimeEdit">
        <div class="pps-modal">
          <div class="pps-modal-header">
            <div>
              <div class="pps-modal-title">Edit event time</div>
              <div class="hint" v-if="eventTimeEditSubmission">
                {{ eventTimeEditSubmission.providerName || nameForUserId(eventTimeEditSubmission.userId) }}
                · {{ eventTimeEditSubmission.eventTitle || 'Event' }}
              </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" @click="closeEventTimeEdit">Close</button>
          </div>
          <div class="pps-modal-body">
            <div v-if="eventTimeEditError" class="pps-error">{{ eventTimeEditError }}</div>
            <div v-if="eventTimeEditOriginal" class="pps-edit-notice">
              <strong>⚠ Changed from auto-submitted</strong>
              ({{ eventTimeEditSubmission?.lastEditedByRole || 'unknown' }} edited{{ eventTimeEditSubmission?.lastEditedAt ? ' ' + new Date(eventTimeEditSubmission.lastEditedAt).toLocaleString() : '' }})<br>
              Original: Direct {{ eventTimeEditOriginal.directHours ?? '—' }} h · Indirect {{ eventTimeEditOriginal.indirectHours ?? '—' }} h ·
              In {{ eventTimeEditOriginal.clockInAt ? new Date(eventTimeEditOriginal.clockInAt).toLocaleTimeString() : '—' }} ·
              Out {{ eventTimeEditOriginal.clockOutAt ? new Date(eventTimeEditOriginal.clockOutAt).toLocaleTimeString() : '—' }}
            </div>
            <div v-if="eventTimeEditLateArrival" class="pps-late-notice">
              <strong>⏰ Late arrival detected</strong> — event started at {{ eventTimeEditLateArrival.eventStartDisplay }},
              employee clocked in <strong>{{ eventTimeEditLateArrival.lateMinutes }} min late</strong>.
              <span v-if="eventTimeEditLateArrival.adjustedCap != null">
                Adjusted direct cap: <strong>{{ eventTimeEditLateArrival.adjustedCap }} h</strong>
                (reduced from {{ eventTimeEditDirectCap }} h).
              </span>
              <div style="margin-top:6px;">
                <button type="button" class="btn btn-secondary btn-sm" :disabled="eventTimeEditSaving" @click="applyLateArrivalDeduction">
                  Apply late arrival deduction
                </button>
              </div>
            </div>
            <label class="field">
              <span>Clock in</span>
              <input v-model="eventTimeEditClockIn" class="input" type="datetime-local" :disabled="eventTimeEditSaving">
            </label>
            <label class="field">
              <span>Clock out</span>
              <input v-model="eventTimeEditClockOut" class="input" type="datetime-local" :disabled="eventTimeEditSaving">
            </label>
            <label class="field">
              <span>Direct hours cap</span>
              <div style="display:flex;align-items:center;gap:8px;">
                <input
                  v-model="eventTimeEditDirectCap"
                  class="input"
                  type="number"
                  min="0"
                  step="0.25"
                  style="width:100px;"
                  :disabled="eventTimeEditSaving"
                  placeholder="e.g. 3"
                >
                <span class="hint" style="margin:0;">h — defaulted from event settings; edit to override for this submission</span>
              </div>
            </label>
            <div v-if="eventTimeEditPreview" class="hint">
              Worked {{ eventTimeEditPreview.workedHours }} h · Direct {{ eventTimeEditPreview.directHours }} h · Indirect {{ eventTimeEditPreview.indirectHours }} h
            </div>
            <div class="actions" style="justify-content:flex-end;margin:0;">
              <button type="button" class="btn btn-secondary" :disabled="eventTimeEditSaving" @click="closeEventTimeEdit">Cancel</button>
              <button type="button" class="btn btn-primary" :disabled="eventTimeEditSaving || !eventTimeEditPreview" @click="saveEventTimeEdit">
                {{ eventTimeEditSaving ? 'Saving…' : 'Save & recalculate' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);

const loading = ref(false);
const bootstrapped = ref(false);
const pageError = ref('');
const actionError = ref('');
const busyId = ref(null);

const periods = ref([]);
const agencyUsers = ref([]);
const defaultTargetPeriodId = ref(null);

const tab = ref('pto');
const focusUserId = ref(null);

const ptoRequests = ref([]);
const ptoStatusFilter = ref(['submitted']);
const ptoTargetById = reactive({});
const ptoBalancesByUserId = ref({});

const timeClaims = ref([]);
const mileageClaims = ref([]);
const reimbClaims = ref([]);
const medClaims = ref([]);
const claimTargetByKey = reactive({});

const eventTimeSubmissions = ref([]);
const eventTimeLoading = ref(false);
const eventTimeShowApproved = ref(false);
const eventTimeTargetPeriodByPunchId = reactive({});
const eventTimeEditOpen = ref(false);
const eventTimeEditSubmission = ref(null);
const eventTimeEditClockIn = ref('');
const eventTimeEditClockOut = ref('');
const eventTimeEditDirectCap = ref('');
const eventTimeEditSaving = ref(false);
const eventTimeEditError = ref('');

const periodsForSelect = computed(() => {
  const source = periods.value || [];
  let aligned = source.filter((p) => Number(p.schedule_aligned) === 1);
  if (!aligned.length) aligned = source.slice();
  aligned.sort((a, b) => String(b?.period_end || '').localeCompare(String(a?.period_end || '')));
  return aligned;
});

const ptoPendingCount = computed(() =>
  (ptoRequests.value || []).filter((r) => String(r.status || '').toLowerCase() === 'submitted').length
);

const ptoStatusCounts = computed(() => {
  const counts = { submitted: 0, approved: 0, rejected: 0, deferred: 0 };
  for (const r of ptoRequests.value || []) {
    const st = String(r.status || 'submitted').toLowerCase();
    if (counts[st] != null) counts[st] += 1;
  }
  return counts;
});

const ptoVisible = computed(() => {
  const filters = ptoStatusFilter.value || [];
  let list = (ptoRequests.value || []).filter((r) => filters.includes(String(r.status || 'submitted').toLowerCase()));
  if (focusUserId.value && tab.value === 'pto') {
    const focused = list.filter((r) => Number(r.user_id) === focusUserId.value);
    const rest = list.filter((r) => Number(r.user_id) !== focusUserId.value);
    list = [...focused, ...rest];
  }
  return list;
});

const eventTimePendingCount = computed(() => {
  const pendingStatuses = new Set(['submitted', 'deferred']);
  return (eventTimeSubmissions.value || []).filter((s) => {
    const stDirect = String(s?.directClaim?.status || '').toLowerCase();
    const stIndirect = String(s?.indirectClaim?.status || '').toLowerCase();
    return pendingStatuses.has(stDirect) || pendingStatuses.has(stIndirect);
  }).length;
});

const totalPending = computed(
  () =>
    ptoPendingCount.value +
    timeClaims.value.length +
    eventTimePendingCount.value +
    mileageClaims.value.length +
    reimbClaims.value.length +
    medClaims.value.length
);

const calcLateMinutes = (clockInAt, eventStartsAt, employeeReportTime) => {
  if (!clockInAt) return 0;
  const cin = new Date(clockInAt);
  if (!Number.isFinite(cin.getTime())) return 0;
  let h = null;
  let m = 0;
  let s = 0;
  if (employeeReportTime) {
    const parts = String(employeeReportTime).split(':');
    h = Number(parts[0]);
    m = Number(parts[1] || 0);
    s = Number(parts[2] || 0);
  } else if (eventStartsAt) {
    const start = new Date(eventStartsAt);
    if (Number.isFinite(start.getTime())) {
      h = start.getHours();
      m = start.getMinutes();
      s = start.getSeconds();
    }
  }
  if (h === null || !Number.isFinite(h)) return 0;
  const expected = new Date(cin.getFullYear(), cin.getMonth(), cin.getDate(), h, m, s, 0);
  return Math.max(0, Math.round((cin.getTime() - expected.getTime()) / 60000));
};

const eventTimeBucketRows = computed(() => {
  const rows = [];
  const pendingStatuses = new Set(['submitted', 'deferred']);
  const canApproveBucket = (claim) =>
    !!claim?.id && pendingStatuses.has(String(claim?.status || '').toLowerCase());
  for (const s of eventTimeSubmissions.value || []) {
    const lateMinutes = calcLateMinutes(s.clockInAt, s.eventStartsAt, s.eventEmployeeReportTime);
    rows.push({
      submission: s,
      rowKey: `${s.punchInId}-direct`,
      bucket: 'direct',
      bucketLabel: 'Direct',
      bucketHours: s.directHours,
      claim: s.directClaim,
      canApprove: canApproveBucket(s.directClaim),
      lateMinutes
    });
    rows.push({
      submission: s,
      rowKey: `${s.punchInId}-indirect`,
      bucket: 'indirect',
      bucketLabel: 'Indirect',
      bucketHours: s.indirectHours,
      claim: s.indirectClaim,
      canApprove: canApproveBucket(s.indirectClaim),
      lateMinutes
    });
  }
  return rows;
});

const isoToDatetimeLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const datetimeLocalInputToIso = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

const eventTimeEditOriginal = computed(() => {
  const sub = eventTimeEditSubmission.value;
  if (!sub?.wasEdited || !sub.originalValues) return null;
  return sub.originalValues;
});

const eventTimeEditLateArrival = computed(() => {
  const sub = eventTimeEditSubmission.value;
  if (!sub?.clockInAt) return null;
  const cin = new Date(sub.clockInAt);
  if (!Number.isFinite(cin.getTime())) return null;
  let h = null;
  let m = 0;
  let s = 0;
  if (sub.eventEmployeeReportTime) {
    const parts = String(sub.eventEmployeeReportTime).split(':');
    h = Number(parts[0]);
    m = Number(parts[1] || 0);
    s = Number(parts[2] || 0);
  } else if (sub.eventStartsAt) {
    const start = new Date(sub.eventStartsAt);
    if (Number.isFinite(start.getTime())) {
      h = start.getHours();
      m = start.getMinutes();
      s = start.getSeconds();
    }
  }
  if (h === null || !Number.isFinite(h)) return null;
  const expected = new Date(cin.getFullYear(), cin.getMonth(), cin.getDate(), h, m, s, 0);
  const lateMs = cin.getTime() - expected.getTime();
  if (lateMs <= 0) return null;
  const lateMinutes = Math.round(lateMs / 60000);
  const cap = Number(eventTimeEditDirectCap.value);
  const adjustedCap =
    Number.isFinite(cap) && cap > 0 ? Math.max(0, Math.round((cap - lateMinutes / 60) * 100) / 100) : null;
  return {
    lateMinutes,
    eventStartDisplay: expected.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    adjustedCap
  };
});

const applyLateArrivalDeduction = () => {
  const la = eventTimeEditLateArrival.value;
  if (la?.adjustedCap != null) eventTimeEditDirectCap.value = String(la.adjustedCap);
};

const eventTimeEditPreview = computed(() => {
  const clockInAt = datetimeLocalInputToIso(eventTimeEditClockIn.value);
  const clockOutAt = datetimeLocalInputToIso(eventTimeEditClockOut.value);
  if (!clockInAt || !clockOutAt) return null;
  const tIn = new Date(clockInAt);
  const tOut = new Date(clockOutAt);
  if (!Number.isFinite(tIn.getTime()) || !Number.isFinite(tOut.getTime()) || tOut <= tIn) return null;
  const capRaw = Number(eventTimeEditDirectCap.value);
  const cap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : 0;
  const workedHours = Math.max(0, (tOut.getTime() - tIn.getTime()) / 3600000);
  const directHours = Math.min(cap, workedHours);
  const indirectHours = Math.max(0, workedHours - directHours);
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    workedHours: round2(workedHours),
    directHours: round2(directHours),
    indirectHours: round2(indirectHours)
  };
});

const formatEventTimeIso = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
};

const eventTimePeriodLabel = (claim) => {
  if (!claim) return '—';
  const pid = claim.targetPayrollPeriodId || claim.suggestedPayrollPeriodId || null;
  if (!pid) return '—';
  const p = (periods.value || []).find((x) => Number(x.id) === Number(pid));
  return p ? periodRangeLabel(p) : `#${pid}`;
};

const payrollBasePath = () => {
  const slug = String(route.params?.organizationSlug || agencyStore.currentAgency?.slug || '').trim();
  return slug ? `/${slug}/admin/payroll` : '/admin/payroll';
};

const goBackToPayroll = () => router.push({ path: payrollBasePath() });

const periodRangeLabel = (p) => {
  if (!p) return '—';
  const a = String(p.period_start || '').slice(0, 10);
  const b = String(p.period_end || '').slice(0, 10);
  return a && b ? `${a} → ${b}` : (a || b || `Period #${p.id}`);
};

const isPeriodLocked = (p) => {
  const st = String(p?.status || '').toLowerCase();
  return st === 'posted' || st === 'finalized';
};

const isValidOpenPeriod = (periodId) => {
  const pid = Number(periodId || 0);
  if (!Number.isFinite(pid) || pid <= 0) return false;
  const p = (periods.value || []).find((x) => Number(x.id) === pid);
  return Boolean(p) && !isPeriodLocked(p);
};

const nameForUserId = (uid) => {
  const id = Number(uid || 0);
  const u = (agencyUsers.value || []).find((x) => Number(x.id) === id);
  if (!u) return `User #${id}`;
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || `User #${id}`;
};

const claimName = (c) => {
  const n = [c.first_name || c.provider_first_name, c.last_name || c.provider_last_name].filter(Boolean).join(' ').trim();
  if (n) return n;
  if (c.provider_name) return c.provider_name;
  return nameForUserId(c.user_id);
};

const submitterLabel = (row) => {
  const fn = String(row?.submitted_by_first_name || '').trim();
  const ln = String(row?.submitted_by_last_name || '').trim();
  const email = String(row?.submitted_by_email || '').trim();
  if (ln || fn) return `${ln}${ln && fn ? ', ' : ''}${fn}`;
  if (email) return email;
  if (row?.submitted_by_user_id) return nameForUserId(row.submitted_by_user_id);
  return '—';
};

const fmtNum = (n) => {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v.toFixed(2).replace(/\.00$/, '') : '—';
};

const fmtDate = (d) => (d ? String(d).slice(0, 10) : '—');

const fmtHours = (c) => {
  const h = Number(c.hours || c.credits_hours || c.requested_hours || 0);
  return Number.isFinite(h) && h > 0 ? h.toFixed(2) : '—';
};

const timeTypeLabel = (c) => {
  const t = String(c.claim_type || c.type || c.time_type || '').trim();
  if (!t) return 'Time';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const statusLabel = (st) => {
  const s = String(st || 'submitted');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const statusDoneLabel = (r) => {
  const st = String(r.status || '');
  if (st === 'approved') return `Approved ${String(r.approved_at || '').slice(0, 10)}`;
  if (st === 'rejected') return `Denied ${String(r.rejected_at || '').slice(0, 10)}`;
  if (st === 'deferred') return 'Sent back';
  return '';
};

const firstPtoDate = (r) => {
  const items = Array.isArray(r?.items) ? r.items : [];
  const dates = items
    .map((it) => String(it?.request_date || it?.requestDate || '').slice(0, 10))
    .filter(Boolean)
    .sort();
  return dates[0] || '—';
};

const proofUrl = (rawPath) => {
  const raw = String(rawPath || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/uploads/${raw.substring('uploads/'.length)}`;
  return `/uploads/${raw}`;
};

const ptoDefaultTarget = (r) => {
  const first = firstPtoDate(r);
  if (first && first !== '—') {
    const containing = (periods.value || []).find((p) => {
      const start = String(p?.period_start || '').slice(0, 10);
      const end = String(p?.period_end || '').slice(0, 10);
      return start && end && first >= start && first <= end && !isPeriodLocked(p);
    });
    if (containing) return Number(containing.id);
  }
  return Number(defaultTargetPeriodId.value || 0) || null;
};

const ptoBalancePreview = (r) => {
  const uid = Number(r?.user_id || 0);
  const b = ptoBalancesByUserId.value?.[uid] || { sickHours: 0, trainingHours: 0 };
  const hours = Number(r?.total_hours || 0);
  const bucket = String(r?.request_type || '').toLowerCase() === 'training' ? 'training' : 'sick';
  const start = bucket === 'training' ? Number(b.trainingHours || 0) : Number(b.sickHours || 0);
  return { start, next: start - (Number.isFinite(hours) ? hours : 0) };
};

const togglePtoFilter = (status) => {
  const cur = [...(ptoStatusFilter.value || [])];
  const idx = cur.indexOf(status);
  if (idx >= 0) {
    if (cur.length === 1) return;
    cur.splice(idx, 1);
  } else {
    cur.push(status);
  }
  ptoStatusFilter.value = cur;
};

const setTab = (next) => {
  tab.value = next;
  const q = { ...route.query, tab: next };
  router.replace({ path: route.path, query: q }).catch(() => {});
};

const pickDefaultOpenPeriod = () => {
  const open = (periodsForSelect.value || []).filter((p) => !isPeriodLocked(p));
  if (!open.length) return null;
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // Prefer current/upcoming open period (start <= today, newest end), else next future open
  const currentish = open
    .filter((p) => String(p.period_start || '') <= todayYmd)
    .sort((a, b) => String(b.period_end || '').localeCompare(String(a.period_end || '')));
  if (currentish[0]) return Number(currentish[0].id);
  const future = open
    .filter((p) => String(p.period_start || '') > todayYmd)
    .sort((a, b) => String(a.period_start || '').localeCompare(String(b.period_start || '')));
  return future[0] ? Number(future[0].id) : Number(open[0].id);
};

const isEventTime = (r) => {
  const t = String(r?.claim_type || r?.type || '').toLowerCase();
  return t.includes('event') || t.includes('skill_builder') || Number(r?.is_event_time) === 1;
};

const seedClaimTargets = (prefix, list) => {
  const def = Number(defaultTargetPeriodId.value || 0) || null;
  for (const c of list || []) {
    const key = `${prefix}-${c.id}`;
    if (claimTargetByKey[key] == null) claimTargetByKey[key] = def;
  }
};

const loadPeriods = async () => {
  if (!agencyId.value) return;
  const resp = await api.get('/payroll/periods', { params: { agencyId: agencyId.value } });
  periods.value = resp.data || [];
  if (!defaultTargetPeriodId.value) {
    defaultTargetPeriodId.value = pickDefaultOpenPeriod();
  }
};

const loadUsers = async () => {
  if (!agencyId.value) return;
  try {
    const resp = await api.get('/payroll/agency-users', { params: { agencyId: agencyId.value } });
    agencyUsers.value = resp.data || [];
  } catch {
    agencyUsers.value = [];
  }
};

const loadPto = async () => {
  if (!agencyId.value) return;
  const resp = await api.get('/payroll/pto-requests', {
    params: { agencyId: agencyId.value, status: 'submitted,approved,rejected,deferred' }
  });
  ptoRequests.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
  for (const r of ptoRequests.value) {
    if (ptoTargetById[r.id] == null) ptoTargetById[r.id] = ptoDefaultTarget(r);
  }
  const ids = Array.from(new Set(ptoRequests.value.map((x) => Number(x?.user_id || 0)).filter((n) => n > 0)));
  const next = { ...(ptoBalancesByUserId.value || {}) };
  await Promise.all(
    ids
      .filter((uid) => next[uid] === undefined)
      .map(async (uid) => {
        try {
          const b = await api.get(`/payroll/users/${uid}/pto-balances`, { params: { agencyId: agencyId.value } });
          next[uid] = {
            sickHours: Number(b.data?.balances?.sickHours ?? 0),
            trainingHours: Number(b.data?.balances?.trainingHours ?? 0)
          };
        } catch {
          next[uid] = { sickHours: 0, trainingHours: 0 };
        }
      })
  );
  ptoBalancesByUserId.value = next;
};

const loadClaims = async () => {
  if (!agencyId.value) return;
  const params = { agencyId: agencyId.value, status: 'submitted' };
  const [timeResp, mileResp, reimbResp, medResp] = await Promise.all([
    api.get('/payroll/time-claims', { params }),
    api.get('/payroll/mileage-claims', { params }),
    api.get('/payroll/reimbursement-claims', { params }),
    api.get('/payroll/medcancel-claims', { params })
  ]);
  timeClaims.value = (timeResp.data || []).filter((r) => r && !isEventTime(r));
  mileageClaims.value = mileResp.data || [];
  reimbClaims.value = reimbResp.data || [];
  medClaims.value = medResp.data || [];
  seedClaimTargets('time', timeClaims.value);
  seedClaimTargets('mileage', mileageClaims.value);
  seedClaimTargets('reimb', reimbClaims.value);
  seedClaimTargets('med', medClaims.value);
};

const loadEventTimeSubmissions = async () => {
  if (!agencyId.value) return;
  try {
    eventTimeLoading.value = true;
    const resp = await api.get('/payroll/event-time-submissions', {
      params: {
        agencyId: agencyId.value,
        status: eventTimeShowApproved.value ? 'submitted,approved,rejected,deferred' : 'submitted'
      }
    });
    const submissions = Array.isArray(resp.data?.submissions) ? resp.data.submissions : [];
    eventTimeSubmissions.value = submissions;
    const aligned = (periods.value || []).filter((p) => Number(p.schedule_aligned) === 1);
    const def = Number(defaultTargetPeriodId.value || 0) || null;
    for (const s of submissions) {
      if (eventTimeTargetPeriodByPunchId[s.punchInId] != null) continue;
      const claim = s.directClaim || s.indirectClaim;
      const suggestedId = Number(claim?.suggestedPayrollPeriodId || 0);
      const suggestedPeriod = suggestedId ? (periods.value || []).find((p) => Number(p.id) === suggestedId) : null;
      if (suggestedPeriod && Number(suggestedPeriod.schedule_aligned) === 1 && !isPeriodLocked(suggestedPeriod)) {
        eventTimeTargetPeriodByPunchId[s.punchInId] = suggestedId;
        continue;
      }
      const dateStr = String(s.clockOutAt || s.clockInAt || '').slice(0, 10);
      const matchedAligned = dateStr
        ? aligned.find((p) => {
            const ps = String(p.period_start || '').slice(0, 10);
            const pe = String(p.period_end || '').slice(0, 10);
            return dateStr >= ps && dateStr <= pe && !isPeriodLocked(p);
          })
        : null;
      eventTimeTargetPeriodByPunchId[s.punchInId] = matchedAligned ? matchedAligned.id : def;
    }
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load event time submissions';
    eventTimeSubmissions.value = [];
  } finally {
    eventTimeLoading.value = false;
  }
};

const toggleEventTimeShowApproved = async () => {
  eventTimeShowApproved.value = !eventTimeShowApproved.value;
  await loadEventTimeSubmissions();
};

const reloadAll = async () => {
  if (!agencyId.value) return;
  loading.value = true;
  pageError.value = '';
  actionError.value = '';
  try {
    await Promise.all([loadPeriods(), loadUsers()]);
    await Promise.all([loadPto(), loadClaims(), loadEventTimeSubmissions()]);
  } catch (e) {
    pageError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load pending submissions';
  } finally {
    loading.value = false;
    bootstrapped.value = true;
  }
};

const withBusy = async (id, fn, reloadFn) => {
  try {
    busyId.value = id;
    actionError.value = '';
    await fn();
    await reloadFn();
  } catch (e) {
    const status = e?.response?.status || 0;
    const msg = e?.response?.data?.error?.message || e?.message || '';
    const lower = String(msg).toLowerCase();
    const looksLikeDeadline = lower.includes('deadline') || lower.includes('cutoff') || lower.includes('submitted after');
    const looksLikeBalance = lower.includes('insufficient pto balance');
    if (looksLikeBalance) {
      const ok = window.confirm(`${msg}\n\nApprove anyway using an admin override? (May result in a negative PTO balance.)`);
      if (ok) {
        try {
          await fn({ overrideBalance: true });
          await reloadFn();
          return;
        } catch (e2) {
          actionError.value = e2?.response?.data?.error?.message || e2?.message || 'Action failed';
          return;
        }
      }
    } else if ((status === 409 || status === 500) && looksLikeDeadline) {
      const ok = window.confirm(`${msg || 'Submitted after the cutoff.'}\n\nApprove anyway with an admin override?`);
      if (ok) {
        try {
          await fn({ overrideDeadline: true });
          await reloadFn();
          return;
        } catch (e2) {
          actionError.value = e2?.response?.data?.error?.message || e2?.message || 'Action failed';
          return;
        }
      }
    } else {
      actionError.value = msg || 'Action failed';
    }
  } finally {
    busyId.value = null;
  }
};

const approvePto = (r) => {
  const targetPayrollPeriodId = Number(ptoTargetById[r.id] || 0);
  if (!isValidOpenPeriod(targetPayrollPeriodId)) {
    actionError.value = 'Choose an open target pay period for this PTO request.';
    return;
  }
  return withBusy(
    `pto-${r.id}`,
    (override = {}) =>
      api.patch(`/payroll/pto-requests/${r.id}`, {
        action: 'approve',
        targetPayrollPeriodId,
        ...override
      }),
    async () => {
      await loadPto();
      // refresh balance for this user
      try {
        const uid = Number(r.user_id || 0);
        if (uid) {
          const b = await api.get(`/payroll/users/${uid}/pto-balances`, { params: { agencyId: agencyId.value } });
          ptoBalancesByUserId.value = {
            ...ptoBalancesByUserId.value,
            [uid]: {
              sickHours: Number(b.data?.balances?.sickHours ?? 0),
              trainingHours: Number(b.data?.balances?.trainingHours ?? 0)
            }
          };
        }
      } catch { /* best-effort */ }
    }
  );
};

const rejectPto = async (r) => {
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason).trim()) return;
  return withBusy(
    `pto-${r.id}`,
    () => api.patch(`/payroll/pto-requests/${r.id}`, { action: 'reject', rejectionReason: String(reason).trim() }),
    loadPto
  );
};

const returnPto = async (r) => {
  const reason = window.prompt('Send back note (required):', '') || '';
  if (!String(reason).trim()) return;
  return withBusy(
    `pto-${r.id}`,
    () => api.patch(`/payroll/pto-requests/${r.id}`, { action: 'return', reason: String(reason).trim() }),
    loadPto
  );
};

const approveTime = (c) => {
  const targetPayrollPeriodId = Number(claimTargetByKey[`time-${c.id}`] || 0);
  if (!isValidOpenPeriod(targetPayrollPeriodId)) return;
  return withBusy(
    `time-${c.id}`,
    (override = {}) =>
      api.patch(`/payroll/time-claims/${c.id}`, {
        action: 'approve',
        targetPayrollPeriodId,
        bucket: 'indirect',
        ...override
      }),
    loadClaims
  );
};

const rejectTime = (c) => {
  const reason = window.prompt('Rejection reason (optional):', '') ?? null;
  if (reason === null) return;
  return withBusy(
    `time-${c.id}`,
    () => api.patch(`/payroll/time-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() }),
    loadClaims
  );
};

const approveMileage = (c) => {
  const targetPayrollPeriodId = Number(claimTargetByKey[`mileage-${c.id}`] || 0);
  if (!isValidOpenPeriod(targetPayrollPeriodId)) return;
  return withBusy(
    `mileage-${c.id}`,
    (override = {}) =>
      api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'approve', targetPayrollPeriodId, ...override }),
    loadClaims
  );
};

const rejectMileage = (c) => {
  const reason = window.prompt('Rejection reason (optional):', '') ?? null;
  if (reason === null) return;
  return withBusy(
    `mileage-${c.id}`,
    () => api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() }),
    loadClaims
  );
};

const approveReimb = (c) => {
  const targetPayrollPeriodId = Number(claimTargetByKey[`reimb-${c.id}`] || 0);
  if (!isValidOpenPeriod(targetPayrollPeriodId)) return;
  return withBusy(
    `reimb-${c.id}`,
    (override = {}) =>
      api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'approve', targetPayrollPeriodId, ...override }),
    loadClaims
  );
};

const rejectReimb = (c) => {
  const reason = window.prompt('Rejection reason (optional):', '') ?? null;
  if (reason === null) return;
  return withBusy(
    `reimb-${c.id}`,
    () => api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() }),
    loadClaims
  );
};

const approveMed = (c) => {
  const targetPayrollPeriodId = Number(claimTargetByKey[`med-${c.id}`] || 0);
  if (!isValidOpenPeriod(targetPayrollPeriodId)) return;
  return withBusy(
    `med-${c.id}`,
    (override = {}) =>
      api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'approve', targetPayrollPeriodId, ...override }),
    loadClaims
  );
};

const rejectMed = (c) => {
  const reason = window.prompt('Rejection reason (optional):', '') ?? null;
  if (reason === null) return;
  return withBusy(
    `med-${c.id}`,
    () => api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() }),
    loadClaims
  );
};

const openEventTimeEdit = (submission) => {
  if (!submission?.punchInId) return;
  eventTimeEditSubmission.value = submission;
  eventTimeEditClockIn.value = isoToDatetimeLocalInput(submission.clockInAt);
  eventTimeEditClockOut.value = isoToDatetimeLocalInput(submission.clockOutAt);
  eventTimeEditDirectCap.value = submission.directHoursCap != null ? String(submission.directHoursCap) : '';
  eventTimeEditError.value = '';
  eventTimeEditOpen.value = true;
};

const closeEventTimeEdit = () => {
  eventTimeEditOpen.value = false;
  eventTimeEditSubmission.value = null;
  eventTimeEditClockIn.value = '';
  eventTimeEditClockOut.value = '';
  eventTimeEditDirectCap.value = '';
  eventTimeEditError.value = '';
};

const saveEventTimeEdit = async () => {
  const submission = eventTimeEditSubmission.value;
  if (!submission?.punchInId || !agencyId.value) return;
  const clockInAt = datetimeLocalInputToIso(eventTimeEditClockIn.value);
  const clockOutAt = datetimeLocalInputToIso(eventTimeEditClockOut.value);
  if (!clockInAt || !clockOutAt) {
    eventTimeEditError.value = 'Enter valid clock in and clock out times.';
    return;
  }
  eventTimeEditSaving.value = true;
  eventTimeEditError.value = '';
  try {
    const capRaw = Number(eventTimeEditDirectCap.value);
    await api.patch(`/payroll/event-time-submissions/${submission.punchInId}`, {
      agencyId: agencyId.value,
      clockInAt,
      clockOutAt,
      ...(Number.isFinite(capRaw) && capRaw >= 0 ? { directHoursCap: capRaw } : {})
    });
    closeEventTimeEdit();
    await loadEventTimeSubmissions();
  } catch (e) {
    eventTimeEditError.value = e?.response?.data?.error?.message || e?.message || 'Failed to save event time';
  } finally {
    eventTimeEditSaving.value = false;
  }
};

const approveEventTimeSubmission = (submission, bucket) => {
  if (!agencyId.value || !submission) return;
  const targetPayrollPeriodId = Number(eventTimeTargetPeriodByPunchId[submission.punchInId] || 0);
  if (!isValidOpenPeriod(targetPayrollPeriodId)) {
    actionError.value = 'Select an open pay period before approving.';
    return;
  }
  const claim = bucket === 'direct' ? submission.directClaim : submission.indirectClaim;
  if (!claim?.id) return;
  return withBusy(
    `event-${submission.punchInId}`,
    (override = {}) =>
      api.patch(`/payroll/time-claims/${claim.id}`, {
        action: 'approve',
        targetPayrollPeriodId,
        bucket,
        creditsHours: bucket === 'direct' ? submission.directHours : submission.indirectHours,
        ...override
      }),
    loadEventTimeSubmissions
  );
};

const rejectEventTimeSubmission = async (submission) => {
  if (!agencyId.value || !submission) return;
  const reason = window.prompt('Reject this event time? Enter a reason (required):', '') || '';
  if (!String(reason).trim()) return;
  const claimIds = [submission.directClaim?.id, submission.indirectClaim?.id].filter(Boolean);
  if (!claimIds.length) return;
  return withBusy(
    `event-${submission.punchInId}`,
    async () => {
      for (const id of claimIds) {
        await api.patch(`/payroll/time-claims/${id}`, { action: 'reject', rejectionReason: String(reason).trim() });
      }
    },
    loadEventTimeSubmissions
  );
};

const unapproveEventTimeSubmission = async (submission) => {
  if (!agencyId.value || !submission) return;
  const ok = window.confirm('Unapprove this event time? It will return to Pending so it can be edited or re-approved.');
  if (!ok) return;
  const claimIds = [submission.directClaim?.id, submission.indirectClaim?.id].filter(Boolean);
  if (!claimIds.length) return;
  return withBusy(
    `event-${submission.punchInId}`,
    async () => {
      for (const id of claimIds) {
        await api.patch(`/payroll/time-claims/${id}`, { action: 'unapprove' });
      }
    },
    loadEventTimeSubmissions
  );
};

const returnEventTimeSubmission = async (submission) => {
  if (!agencyId.value || !submission) return;
  const note = window.prompt('Send back to employee. Enter a note (required):', '') || '';
  if (!String(note).trim()) return;
  const claimIds = [submission.directClaim?.id, submission.indirectClaim?.id].filter(Boolean);
  if (!claimIds.length) return;
  return withBusy(
    `event-${submission.punchInId}`,
    async () => {
      for (const id of claimIds) {
        await api.patch(`/payroll/time-claims/${id}`, { action: 'return', note: String(note).trim() });
      }
    },
    loadEventTimeSubmissions
  );
};

const applyRouteQuery = () => {
  const t = String(route.query?.tab || '').toLowerCase();
  if (['pto', 'time', 'event_time', 'mileage', 'reimbursement', 'medcancel'].includes(t)) tab.value = t;
  else if (String(route.query?.type || '').toLowerCase().includes('pto') || String(route.query?.type || '').toLowerCase().includes('sick')) tab.value = 'pto';
  else if (String(route.query?.type || '').toLowerCase().includes('event')) tab.value = 'event_time';
  else if (String(route.query?.type || '').toLowerCase() === 'time') tab.value = 'time';
  else if (String(route.query?.type || '').toLowerCase() === 'mileage') tab.value = 'mileage';
  else if (String(route.query?.type || '').toLowerCase().includes('reimb')) tab.value = 'reimbursement';
  else if (String(route.query?.type || '').toLowerCase().includes('med')) tab.value = 'medcancel';

  const uid = Number(route.query?.userId || 0);
  focusUserId.value = Number.isFinite(uid) && uid > 0 ? uid : null;
};

/** When landing without an explicit tab, open the first category that has pending items. */
const selectFirstPendingTabIfNeeded = () => {
  if (String(route.query?.tab || route.query?.type || '').trim()) return;
  const order = [
    ['pto', ptoPendingCount.value],
    ['event_time', eventTimePendingCount.value],
    ['time', timeClaims.value.length],
    ['mileage', mileageClaims.value.length],
    ['reimbursement', reimbClaims.value.length],
    ['medcancel', medClaims.value.length]
  ];
  const first = order.find(([, n]) => Number(n || 0) > 0);
  if (first) setTab(first[0]);
};

watch(agencyId, async (id, prev) => {
  if (id && id !== prev) await reloadAll();
});

watch(
  () => [route.query?.tab, route.query?.type, route.query?.userId],
  () => applyRouteQuery()
);

watch(defaultTargetPeriodId, (pid) => {
  const def = Number(pid || 0) || null;
  for (const key of Object.keys(claimTargetByKey)) {
    // only fill blanks / keep existing overrides
    if (claimTargetByKey[key] == null) claimTargetByKey[key] = def;
  }
  for (const punchId of Object.keys(eventTimeTargetPeriodByPunchId)) {
    if (eventTimeTargetPeriodByPunchId[punchId] == null) eventTimeTargetPeriodByPunchId[punchId] = def;
  }
});

onMounted(async () => {
  applyRouteQuery();
  await reloadAll();
  selectFirstPendingTabIfNeeded();
});
</script>

<style scoped>
.pps-page {
  --pps-forest: #1E3A34;
  --pps-mint: #E8F5E9;
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px 24px 48px;
}
.pps-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.pps-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--pps-forest);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
}
.pps-header h1 {
  margin: 0;
  font-size: 1.75rem;
  color: var(--pps-forest);
}
.pps-subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary, #64748b);
  max-width: 720px;
  font-size: 14px;
  line-height: 1.45;
}
.pps-header-right {
  display: flex;
  gap: 10px;
  align-items: center;
}
.pps-org-chip {
  background: var(--pps-mint);
  border-radius: 10px;
  padding: 8px 12px;
  min-width: 140px;
}
.pps-org-label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #4a7c6a;
  font-weight: 700;
}
.pps-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
.pps-loading { color: var(--text-secondary); padding: 24px 0; }
.pps-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 360px) 1fr;
  gap: 16px;
  align-items: end;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.pps-toolbar-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}
.pps-stat {
  background: #f8faf9;
  border: 1px solid #e2e8e4;
  border-radius: 10px;
  padding: 8px 12px;
  min-width: 72px;
  text-align: center;
}
.pps-stat-n { display: block; font-size: 1.15rem; font-weight: 800; color: var(--pps-forest); }
.pps-stat-l { font-size: 11px; color: #64748b; }
.pps-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}
.pps-tab {
  border: 1px solid #d1d9d4;
  background: #fff;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
}
.pps-tab.active {
  background: var(--pps-forest);
  border-color: var(--pps-forest);
  color: #fff;
}
.pps-count {
  display: inline-flex;
  margin-left: 6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  background: rgba(255,255,255,0.22);
}
.pps-tab:not(.active) .pps-count { background: #e8f5e9; color: var(--pps-forest); }
.pps-panel { padding: 16px; }
.pps-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-start;
  margin-bottom: 12px;
}
.pps-panel h2 { margin: 0 0 4px; font-size: 1.1rem; color: var(--pps-forest); }
.pps-filter-bar { display: flex; flex-wrap: wrap; gap: 6px; }
.pps-chip {
  border: 1px solid #d1d9d4;
  background: #fff;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
}
.pps-chip.active.submitted { background: #fef9c3; border-color: #fde047; }
.pps-chip.active.approved { background: #dcfce7; border-color: #86efac; }
.pps-chip.active.rejected { background: #fee2e2; border-color: #fca5a5; }
.pps-chip.active.deferred { background: #e0e7ff; border-color: #a5b4fc; }
.pps-chip-n {
  margin-left: 5px;
  font-weight: 700;
}
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}
.st-submitted { background: #fef9c3; color: #854d0e; }
.st-approved { background: #dcfce7; color: #166534; }
.st-rejected { background: #fee2e2; color: #991b1b; }
.st-deferred { background: #e0e7ff; color: #3730a3; }
.row-approved { background: #f0fdf4; }
.row-rejected { background: #fef2f2; }
.row-highlight { outline: 2px solid #86efac; outline-offset: -2px; }
.warn { color: #b45309; font-weight: 700; }
.table-wrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table th, .table td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: middle; }
.table th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; }
.table .right { text-align: right; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.field label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.hint { font-size: 13px; color: var(--text-secondary, #64748b); }
.muted { color: #64748b; font-size: 13px; }
.pps-late-badge {
  margin-left: 4px;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  white-space: nowrap;
}
.pps-edited-mark {
  margin-left: 4px;
  color: #b45309;
  font-size: 0.75rem;
  font-weight: 600;
}
.pps-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 16px;
}
.pps-modal {
  width: min(560px, 100%);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0,0,0,0.18);
  overflow: hidden;
}
.pps-modal-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
}
.pps-modal-title { font-weight: 700; color: var(--pps-forest); }
.pps-modal-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pps-edit-notice {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  padding: 10px;
  font-size: 0.875rem;
}
.pps-late-notice {
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 10px;
  font-size: 0.875rem;
}
.input {
  width: 100%;
  border: 1px solid #d1d9d4;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
}
@media (max-width: 900px) {
  .pps-toolbar { grid-template-columns: 1fr; }
  .pps-toolbar-stats { justify-content: flex-start; }
}
</style>
