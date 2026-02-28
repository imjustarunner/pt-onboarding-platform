<template>
  <div class="my-payroll">
    <div class="header">
      <h1>My Payroll</h1>
      <p class="subtitle">View-only payroll history for the selected organization.</p>
    </div>

    <div v-if="submitSuccess" class="success" style="margin: 10px 0;">
      {{ submitSuccess }}
    </div>

    <div class="claims-grid" style="margin: 10px 0;">
      <details class="card claim-card" open>
        <summary class="claim-summary">
          <div>
            <div class="claim-title">PTO Balances</div>
            <div class="muted">Sick Leave and Training PTO (read-only).</div>
          </div>
          <button class="btn btn-primary btn-sm" @click.stop="openPtoChooserModal" type="button">
            Request PTO
        </button>
        </summary>

        <div v-if="ptoLoading" class="muted" style="margin-top: 10px;">Loading PTO…</div>
        <div v-else>
          <div v-if="ptoError" class="warn-box" style="margin-top: 10px;">{{ ptoError }}</div>
          <div class="table-wrap" style="margin-top: 10px;">
            <table class="table">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th class="right">Balance (hours)</th>
                  <th class="right" v-if="ptoPendingSickHours + ptoPendingTrainingHours > 0">New balance (if pending approved)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Sick Leave</td>
                  <td class="right">{{ fmtNum(ptoBalances.sickHours || 0) }}</td>
                  <td class="right" v-if="ptoPendingSickHours + ptoPendingTrainingHours > 0">
                    {{ fmtNum(Math.max(0, (ptoBalances.sickHours || 0) - ptoPendingSickHours)) }}
                  </td>
                </tr>
                <tr>
                  <td>Training PTO</td>
                  <td class="right">
                    {{ (ptoPolicy?.trainingPtoEnabled === true && ptoAccount?.training_pto_eligible) ? fmtNum(ptoBalances.trainingHours || 0) : '—' }}
                  </td>
                  <td class="right" v-if="ptoPendingSickHours + ptoPendingTrainingHours > 0">
                    {{ (ptoPolicy?.trainingPtoEnabled === true && ptoAccount?.training_pto_eligible) ? fmtNum(Math.max(0, (ptoBalances.trainingHours || 0) - ptoPendingTrainingHours)) : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="hint" style="margin-top: 10px;">
            Policy reminders: Sick Leave accrues at {{ fmtNum(ptoPolicy?.sickAccrualPer30 ?? 1) }} hour per 30 {{ (ptoAccount?.employment_type === 'fee_for_service') ? 'credits' : 'hours' }}.
            <span v-if="ptoPolicy?.trainingPtoEnabled === true">
              Training PTO accrues at {{ fmtNum(ptoPolicy?.trainingAccrualPer30 ?? 0.25) }} hour per 30 {{ (ptoAccount?.employment_type === 'fee_for_service') ? 'credits' : 'hours' }} (if eligible).
            </span>
            PTO over {{ fmtNum(ptoPolicy?.ptoConsecutiveUseLimitHours ?? 15) }} hours consecutively requires {{ fmtNum(ptoPolicy?.ptoConsecutiveUseNoticeDays ?? 30) }} days notice and management approval.
          </div>

          <div class="section-divider" style="margin-top: 12px;"></div>
          <div class="muted" style="margin-top: 10px;">PTO Requests</div>
          <div v-if="ptoRequestsError" class="warn-box" style="margin-top: 10px;">{{ ptoRequestsError }}</div>
          <div v-if="ptoRequestsLoading" class="muted" style="margin-top: 10px;">Loading requests…</div>
          <div v-else-if="(ptoRequests || []).length" class="table-wrap" style="margin-top: 10px;">
            <table class="table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Submitted by</th>
                  <th>Type</th>
                  <th class="right">Hours</th>
                  <th>Status</th>
                  <th>Proof</th>
                  <th class="right"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in ptoRequests" :key="r.id">
                  <td>{{ fmtShortDate(r.created_at) }}</td>
                  <td>{{ submitterLabel(r) }}</td>
                  <td>{{ String(r.request_type || '').toLowerCase() === 'training' ? 'Training PTO' : 'Sick Leave' }}</td>
                  <td class="right">{{ fmtNum(Number(r.total_hours || 0)) }}</td>
                  <td>
                    <div>{{ String(r.status || '').toUpperCase() }}</div>
                    <div v-if="String(r.status||'').toLowerCase()==='deferred' && r.rejection_reason" class="muted" style="margin-top: 4px;">
                      Needs changes: {{ r.rejection_reason }}
                    </div>
                    <div v-if="String(r.status||'').toLowerCase()==='rejected' && r.rejection_reason" class="muted" style="margin-top: 4px;">
                      Rejected: {{ r.rejection_reason }}
                    </div>
                  </td>
                  <td>
                    <a v-if="r.proof_file_path" :href="receiptUrl({ receipt_file_path: r.proof_file_path })" target="_blank" rel="noopener noreferrer">View</a>
                    <span v-else class="muted">—</span>
                  </td>
                  <td class="right">
                    <button
                      v-if="['submitted','deferred','rejected'].includes(String(r.status||'').toLowerCase())"
                      class="btn btn-danger btn-sm"
                      type="button"
                      @click="withdrawPtoRequest(r)"
                    >
                      Withdraw
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="muted" style="margin-top: 10px;">No PTO requests yet.</div>
        </div>
      </details>

      <details class="card claim-card" open>
        <summary class="claim-summary">
          <div>
            <div class="claim-title">Mileage</div>
            <div class="muted">History of your submissions.</div>
          </div>
          <button class="btn btn-secondary btn-sm" @click.stop="loadMileageClaims" type="button" :disabled="mileageClaimsLoading">
          {{ mileageClaimsLoading ? 'Loading…' : 'Refresh' }}
        </button>
        </summary>

      <div v-if="mileageClaimsError" class="warn-box" style="margin-top: 10px;">{{ mileageClaimsError }}</div>
      <div v-if="(mileageClaims || []).length" class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Submitted by</th>
              <th>Date</th>
                <th>Type</th>
                <th class="right">Miles</th>
              <th>Status</th>
              <th class="right">Amount</th>
                <th class="right"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in mileageClaims"
              :key="c.id"
              :class="mileageClaimRowClass(c)"
            >
              <td>{{ fmtShortDate(c.created_at) }}</td>
              <td>{{ submitterLabel(c) }}</td>
              <td>{{ fmtShortDate(c.drive_date) }}</td>
                <td>{{ String(c.claim_type || '').toLowerCase() === 'school_travel' ? 'School' : 'Other' }}</td>
                <td
                  class="right"
                  :title="
                    String(c.claim_type || '').toLowerCase() === 'school_travel'
                      ? (
                          (c.home_school_roundtrip_miles !== null && c.home_school_roundtrip_miles !== undefined && c.home_office_roundtrip_miles !== null && c.home_office_roundtrip_miles !== undefined)
                            ? `Eligible miles = max(0, Home↔School RT (${fmtNum(c.home_school_roundtrip_miles)}) − Home↔Office RT (${fmtNum(c.home_office_roundtrip_miles)}))`
                            : 'Eligible miles = max(0, Home↔School RT − Home↔Office RT)'
                        )
                      : 'Miles as entered'
                  "
                >
                  {{
                    (() => {
                      const isSchool = String(c.claim_type || '').toLowerCase() === 'school_travel';
                      const miles = Number(isSchool ? (c.eligible_miles ?? c.miles ?? 0) : (c.miles ?? 0));
                      if (isSchool && miles <= 1e-9) return '0 (not eligible)';
                      return fmtNum(miles);
                    })()
                  }}
                </td>
                <td>
                  <div>{{ String(c.status || '').toUpperCase() }}</div>
                  <div v-if="String(c.status||'').toLowerCase()==='deferred' && c.rejection_reason" class="muted" style="margin-top: 4px;">
                    Needs changes: {{ c.rejection_reason }}
                  </div>
                  <div v-if="String(c.status||'').toLowerCase()==='rejected' && c.rejection_reason" class="muted" style="margin-top: 4px;">
                    Rejected: {{ c.rejection_reason }}
                  </div>
                </td>
                <td
                  class="right"
                  :title="
                    c.applied_amount
                      ? 'Approved amount'
                      : (
                          (() => {
                            const isSchool = String(c.claim_type || '').toLowerCase() === 'school_travel';
                            const miles = Number(isSchool ? (c.eligible_miles ?? c.miles ?? 0) : (c.miles ?? 0));
                            const rate = isSchool ? Number(mileageRateForTier(c.tier_level) || 0) : rateForOtherMileage();
                            const tier = Number(c.tier_level || 0);
                            if (rate > 0 && miles > 0) {
                              return isSchool
                                ? `Estimated = ${fmtNum(miles)} mi × ${fmtMoney(rate)}/mi (Tier ${tier || '—'})`
                                : `Estimated = ${fmtNum(miles)} mi × ${fmtMoney(rate)}/mi (Tier 3 or national standard; subject to change)`;
                            }
                            if (isSchool && tier > 0 && rate <= 0) return `Tier ${tier} mileage rate is not configured`;
                            return isSchool ? 'Estimated amount will appear once approved' : `Estimated = miles × rate (Tier 3 or national standard)`;
                          })()
                        )
                  "
                >
                  {{
                    (() => {
                      if (c.applied_amount) return fmtMoney(c.applied_amount);
                      const isSchool = String(c.claim_type || '').toLowerCase() === 'school_travel';
                      const miles = Number(isSchool ? (c.eligible_miles ?? c.miles ?? 0) : (c.miles ?? 0));
                      const rate = isSchool ? Number(mileageRateForTier(c.tier_level) || 0) : rateForOtherMileage();
                      const est = miles > 0 && rate > 0 ? (miles * rate) : 0;
                      return est > 0 ? `${fmtMoney(est)} (est.)` : '—';
                    })()
                  }}
                </td>
                <td class="right">
                  <button
                    v-if="['deferred','rejected'].includes(String(c.status||'').toLowerCase())"
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="openEditMileageClaim(c)"
                    style="margin-right: 8px;"
                  >
                    Edit &amp; resubmit
                  </button>
                  <button
                    v-if="['submitted','deferred','rejected'].includes(String(c.status||'').toLowerCase())"
                    class="btn btn-danger btn-sm"
                    type="button"
                    @click="withdrawMileageClaim(c)"
                  >
                    Withdraw
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="muted" style="margin-top: 10px;">No mileage submissions yet.</div>
      </details>

      <details class="card claim-card" open v-if="authStore.user?.medcancelEnabled && medcancelEnabledForAgency">
        <summary class="claim-summary">
          <div>
            <div class="claim-title">Missed Medicaid sessions (Med Cancel)</div>
            <div class="muted">History of your submissions.</div>
          </div>
          <button class="btn btn-secondary btn-sm" @click.stop="loadMedcancelClaims" type="button" :disabled="medcancelClaimsLoading">
            {{ medcancelClaimsLoading ? 'Loading…' : 'Refresh' }}
          </button>
        </summary>

        <div v-if="medcancelClaimsError" class="warn-box" style="margin-top: 10px;">{{ medcancelClaimsError }}</div>
        <div v-if="(medcancelClaims || []).length" class="table-wrap" style="margin-top: 10px;">
          <table class="table">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Submitted by</th>
                <th>Date</th>
                <th class="right">Services</th>
                <th>Status</th>
                <th class="right">Amount</th>
                <th class="right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in medcancelClaims" :key="c.id">
                <td>{{ fmtShortDate(c.created_at) }}</td>
                <td>{{ submitterLabel(c) }}</td>
                <td>{{ fmtShortDate(c.claim_date) }}</td>
                <td class="right">{{ fmtNum(Number((c.items || []).length || c.units || 0)) }}</td>
                <td>
                  <div>{{ String(c.status || '').toUpperCase() }}</div>
                  <div v-if="String(c.status||'').toLowerCase()==='deferred' && c.rejection_reason" class="muted" style="margin-top: 4px;">
                    Needs changes: {{ c.rejection_reason }}
                  </div>
                  <div v-if="String(c.status||'').toLowerCase()==='rejected' && c.rejection_reason" class="muted" style="margin-top: 4px;">
                    Rejected: {{ c.rejection_reason }}
                  </div>
                </td>
                <td class="right">{{ medcancelAmountLabel(c) }}</td>
                <td class="right">
                  <button
                    v-if="['deferred','rejected'].includes(String(c.status||'').toLowerCase())"
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="openEditMedcancelClaim(c)"
                    style="margin-right: 8px;"
                  >
                    Edit &amp; resubmit
                  </button>
                  <button
                    v-if="['submitted','deferred','rejected'].includes(String(c.status||'').toLowerCase())"
                    class="btn btn-danger btn-sm"
                    type="button"
                    @click="withdrawMedcancelClaim(c)"
                  >
                    Withdraw
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="muted" style="margin-top: 10px;">No Med Cancel submissions yet.</div>
      </details>

      <details class="card claim-card" open>
        <summary class="claim-summary">
          <div>
            <div class="claim-title">Reimbursements</div>
            <div class="muted">Upload receipts and track approval.</div>
          </div>
          <button class="btn btn-secondary btn-sm" @click.stop="loadReimbursementClaims" type="button" :disabled="reimbursementClaimsLoading">
            {{ reimbursementClaimsLoading ? 'Loading…' : 'Refresh' }}
          </button>
        </summary>

        <div v-if="reimbursementClaimsError" class="warn-box" style="margin-top: 10px;">{{ reimbursementClaimsError }}</div>
        <div v-if="(reimbursementClaims || []).length" class="table-wrap" style="margin-top: 10px;">
          <table class="table">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Submitted by</th>
                <th>Date</th>
                <th class="right">Amount</th>
                <th>Status</th>
                <th>Receipt</th>
                <th class="right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in reimbursementClaims" :key="c.id">
                <td>{{ fmtShortDate(c.created_at) }}</td>
                <td>{{ submitterLabel(c) }}</td>
                <td>{{ fmtShortDate(c.expense_date) }}</td>
                <td class="right">{{ fmtMoney(Number(c.amount || 0)) }}</td>
                <td>
                  <div>{{ String(c.status || '').toUpperCase() }}</div>
                  <div v-if="String(c.status||'').toLowerCase()==='deferred' && c.rejection_reason" class="muted" style="margin-top: 4px;">
                    Needs changes: {{ c.rejection_reason }}
                  </div>
                  <div v-if="String(c.status||'').toLowerCase()==='rejected' && c.rejection_reason" class="muted" style="margin-top: 4px;">
                    Rejected: {{ c.rejection_reason }}
                  </div>
                </td>
                <td>
                  <a v-if="c.receipt_file_path" :href="receiptUrl(c)" target="_blank" rel="noopener noreferrer">View</a>
                  <span v-else class="muted">—</span>
                </td>
                <td class="right">
                  <button
                    v-if="['deferred','rejected'].includes(String(c.status||'').toLowerCase())"
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="openEditReimbursementModal(c)"
                    style="margin-right: 8px;"
                  >
                    Edit &amp; resubmit
                  </button>
                  <button
                    v-if="['submitted','deferred','rejected'].includes(String(c.status||'').toLowerCase())"
                    class="btn btn-danger btn-sm"
                    type="button"
                    @click="withdrawReimbursementClaim(c)"
                  >
                    Withdraw
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="muted" style="margin-top: 10px;">No reimbursements yet.</div>
      </details>

      <details v-if="authStore.user?.companyCardEnabled" class="card claim-card" open>
        <summary class="claim-summary">
          <div>
            <div class="claim-title">Company Card Expenses</div>
            <div class="muted">Submit company card purchases for tracking/review.</div>
          </div>
          <button class="btn btn-secondary btn-sm" @click.stop="loadCompanyCardExpenses" type="button" :disabled="companyCardExpensesLoading">
            {{ companyCardExpensesLoading ? 'Loading…' : 'Refresh' }}
          </button>
        </summary>

        <div v-if="companyCardExpensesError" class="warn-box" style="margin-top: 10px;">{{ companyCardExpensesError }}</div>
        <div v-if="(companyCardExpenses || []).length" class="table-wrap" style="margin-top: 10px;">
          <table class="table">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Submitted by</th>
                <th>Date</th>
                <th class="right">Amount</th>
                <th>Status</th>
                <th>Receipt</th>
                <th class="right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in companyCardExpenses" :key="c.id">
                <td>{{ fmtShortDate(c.created_at) }}</td>
                <td>{{ submitterLabel(c) }}</td>
                <td>{{ fmtShortDate(c.expense_date) }}</td>
                <td class="right">{{ fmtMoney(Number(c.amount || 0)) }}</td>
                <td>
                  <div>{{ String(c.status || '').toUpperCase() }}</div>
                  <div v-if="String(c.status||'').toLowerCase()==='deferred' && c.rejection_reason" class="muted" style="margin-top: 4px;">
                    Needs changes: {{ c.rejection_reason }}
                  </div>
                  <div v-if="String(c.status||'').toLowerCase()==='rejected' && c.rejection_reason" class="muted" style="margin-top: 4px;">
                    Rejected: {{ c.rejection_reason }}
                  </div>
                </td>
                <td>
                  <a v-if="c.receipt_file_path" :href="receiptUrl(c)" target="_blank" rel="noopener noreferrer">View</a>
                  <span v-else class="muted">—</span>
                </td>
                <td class="right">
                  <button
                    v-if="['deferred','rejected'].includes(String(c.status||'').toLowerCase())"
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="openEditCompanyCardExpenseModal(c)"
                    style="margin-right: 8px;"
                  >
                    Edit &amp; resubmit
                  </button>
                  <button
                    v-if="['submitted','deferred','rejected'].includes(String(c.status||'').toLowerCase())"
                    class="btn btn-danger btn-sm"
                    type="button"
                    @click="withdrawCompanyCardExpense(c)"
                  >
                    Withdraw
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="muted" style="margin-top: 10px;">No company card expenses yet.</div>
      </details>

      <details class="card claim-card" open>
        <summary class="claim-summary">
          <div>
            <div class="claim-title">Time Claims</div>
            <div class="muted">Attendance, holiday/excess time, service corrections.</div>
          </div>
          <button class="btn btn-secondary btn-sm" @click.stop="loadTimeClaims" type="button" :disabled="timeClaimsLoading">
            {{ timeClaimsLoading ? 'Loading…' : 'Refresh' }}
          </button>
        </summary>

        <div v-if="timeClaimsError" class="warn-box" style="margin-top: 10px;">{{ timeClaimsError }}</div>
        <div v-if="(timeClaims || []).length" class="table-wrap" style="margin-top: 10px;">
          <table class="table">
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Submitted by</th>
                <th>Date</th>
                <th>Type</th>
                <th>Status</th>
                <th class="right">Amount</th>
                <th class="right"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in timeClaims" :key="c.id">
                <td>{{ fmtShortDate(c.created_at) }}</td>
                <td>{{ submitterLabel(c) }}</td>
                <td>{{ fmtShortDate(c.claim_date) }}</td>
                <td>{{ timeClaimTypeLabel(c) }}</td>
                <td>
                  <div>{{ String(c.status || '').toUpperCase() }}</div>
                  <div
                    v-if="isMeetingTimeClaim(c) && String(c?.payload?.googleMeetLink || '').trim()"
                    class="muted"
                    style="margin-top: 4px;"
                  >
                    <a :href="c.payload.googleMeetLink" target="_blank" rel="noreferrer">Open Meet link</a>
                  </div>
                  <div
                    v-if="isMeetingTimeClaim(c) && String(c?.payload?.transcriptUrl || '').trim()"
                    class="muted"
                    style="margin-top: 2px;"
                  >
                    <a :href="c.payload.transcriptUrl" target="_blank" rel="noreferrer">Open transcript</a>
                  </div>
                  <div
                    v-else-if="isMeetingTimeClaim(c) && String(c?.payload?.googleMeetLink || '').trim() && isNoTranscriptAvailableYet(c)"
                    class="muted"
                    style="margin-top: 2px;"
                  >
                    No transcript available yet. If Meet transcription was off, add it manually.
                  </div>
                  <div
                    v-else-if="isMeetingTimeClaim(c) && String(c?.payload?.googleMeetLink || '').trim()"
                    class="muted"
                    style="margin-top: 2px;"
                  >
                    Transcript is processing from Google Meet...
                  </div>
                  <div v-if="String(c.status||'').toLowerCase()==='deferred' && c.rejection_reason" class="muted" style="margin-top: 4px;">
                    Needs changes: {{ c.rejection_reason }}
                  </div>
                  <div v-if="String(c.status||'').toLowerCase()==='rejected' && c.rejection_reason" class="muted" style="margin-top: 4px;">
                    Rejected: {{ c.rejection_reason }}
                  </div>
                </td>
              <td class="right">{{ c.applied_amount ? fmtMoney(c.applied_amount) : '—' }}</td>
                <td class="right">
                  <button
                    v-if="['deferred','rejected'].includes(String(c.status||'').toLowerCase())"
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="openEditTimeClaim(c)"
                    style="margin-right: 8px;"
                  >
                    Edit &amp; resubmit
                  </button>
                  <button
                    v-if="['submitted','deferred','rejected'].includes(String(c.status||'').toLowerCase())"
                    class="btn btn-danger btn-sm"
                    type="button"
                    @click="withdrawTimeClaim(c)"
                  >
                    Withdraw
                  </button>
                </td>
            </tr>
          </tbody>
        </table>
      </div>
        <div v-else class="muted" style="margin-top: 10px;">No time claims yet.</div>
      </details>
    </div>

    <div class="controls" v-if="!loading">
      <label class="control">
        <span class="label">Sort by pay period</span>
        <select v-model="sortOrder">
          <option value="desc">Newest → Oldest</option>
          <option value="asc">Oldest → Newest</option>
        </select>
      </label>
      <label class="control" style="flex: 1;">
        <span class="label">Search</span>
        <input
          v-model="periodSearch"
          type="text"
          placeholder="Search pay periods…"
          style="min-width: 220px;"
        />
      </label>
      <label class="control">
        <span class="label">Show</span>
        <select v-model="showCount">
          <option :value="25">Last 25</option>
          <option :value="50">Last 50</option>
          <option :value="100">Last 100</option>
        </select>
      </label>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="loading" class="muted">Loading payroll…</div>

    <div v-else class="periods">
      <div class="periods-head">
        <div>Pay Period</div>
        <div class="right">Tier</div>
        <div class="right">Credits</div>
        <div class="right">Pay</div>
      </div>
      <button
        v-for="(p, idx) in visiblePeriods"
        :key="p.payroll_period_id"
        type="button"
        class="period-row"
        :class="[{ active: expandedId === p.payroll_period_id }, periodShadeClass(idx)]"
        @click="toggle(p.payroll_period_id)"
      >
        <div class="period-main">
          <div class="period-title">
            <span class="title"><strong>{{ fmtDateRange(p.period_start, p.period_end) }}</strong></span>
            <span class="chev">{{ expandedId === p.payroll_period_id ? '▼' : '▶' }}</span>
          </div>
        </div>
        <div class="right tier-cell">
          {{ (p.breakdown && p.breakdown.__tier && p.breakdown.__tier.label) ? p.breakdown.__tier.label : '—' }}
              <span v-if="p.grace_active" class="badge">Grace</span>
        </div>
        <div class="right">{{ fmtNum(p.tier_credits_final ?? p.tier_credits_current ?? 0) }}</div>
        <div class="right">{{ fmtMoney(p.total_amount ?? 0) }}</div>
      </button>
      <div v-if="!visiblePeriods.length" class="muted" style="margin-top: 10px;">
        No finalized payroll periods yet for this organization.
      </div>
    </div>

    <div v-if="expandedId" class="details card">
      <h2 class="card-title">Breakdown</h2>
      <div v-if="expanded">
        <div
          class="warn-box prior-notes-included"
          v-if="expanded.breakdown && expanded.breakdown.__carryover && ((expanded.breakdown.__carryover.carryoverNotesTotal || expanded.breakdown.__carryover.oldDoneNotesNotesTotal || 0) > 0)"
          style="margin-bottom: 10px;"
        >
          <div>
            <strong>Prior notes included in this payroll:</strong>
            {{ fmtNum(expanded.breakdown.__carryover.carryoverNotesTotal ?? expanded.breakdown.__carryover.oldDoneNotesNotesTotal ?? 0) }}
            notes
          </div>
          <div class="muted">Reminder: complete prior-period notes by Sunday 11:59pm after the pay period ends to avoid compensation delays.</div>
        </div>
        <div
          class="warn-box current-unpaid-notes"
          v-if="expanded.breakdown && expanded.breakdown.__priorStillUnpaid && (expanded.breakdown.__priorStillUnpaid.totalUnits || 0) > 0"
          style="margin-bottom: 10px; border: 1px solid #ffb5b5; background: #ffecec;"
        >
          <div>
            <strong>Still unpaid from the prior pay period (not paid this period):</strong>
            {{ fmtNum(expanded.breakdown.__priorStillUnpaid.totalUnits) }} units
          </div>
          <div class="muted" style="margin-top: 4px;" v-if="expanded.breakdown.__priorStillUnpaid.periodStart">
            {{ expanded.breakdown.__priorStillUnpaid.periodStart }} → {{ expanded.breakdown.__priorStillUnpaid.periodEnd }}
          </div>
          <div class="muted" style="margin-top: 6px;" v-if="(expanded.breakdown.__priorStillUnpaid.lines || []).length">
            <div><strong>Details:</strong></div>
            <div v-for="(l, i) in (expanded.breakdown.__priorStillUnpaid.lines || [])" :key="`prior-unpaid:${l.serviceCode}:${i}`">
              - {{ l.serviceCode }}: {{ fmtNum(l.unpaidUnits) }} units
            </div>
          </div>
        </div>
        <div
          class="warn-box old-notes-alert"
          v-if="twoPeriodsAgoUnpaid.total > 0"
          style="margin-bottom: 10px;"
        >
          <div>
            <strong>Reminder: unpaid notes from 2 pay periods ago</strong>
          </div>
          <div style="margin-top: 4px;">
            <strong>{{ fmtDateRange(twoPeriodsAgo.period_start, twoPeriodsAgo.period_end) }}</strong>
          </div>
          <div style="margin-top: 6px;">
            <strong>No Note:</strong> {{ fmtNum(twoPeriodsAgoUnpaid.noNote) }} notes
            <span class="muted">•</span>
            <strong>Draft:</strong> {{ fmtNum(twoPeriodsAgoUnpaid.draft) }} notes
          </div>
          <div class="muted" style="margin-top: 6px;">
            Complete outstanding notes to be included in a future payroll.
          </div>
        </div>

        <div class="warn-box current-unpaid-notes" v-if="expandedUnpaid.total > 0" style="margin-bottom: 10px;">
          <div>
            <strong>Unpaid notes in this pay period</strong>
          </div>
          <div style="margin-top: 6px;">
            <strong>No Note:</strong> {{ fmtNum(expandedUnpaid.noNote) }} notes
            <span class="muted">•</span>
            <strong>Draft:</strong> {{ fmtNum(expandedUnpaid.draft) }} notes
          </div>
          <div class="muted" style="margin-top: 6px;">
            These notes were not paid this period. Complete outstanding notes to be included in a future payroll.
          </div>
          <div class="muted" style="margin-top: 6px;">
            Due to Therapy Notes, we are unable to differentiate a note that is incomplete for a session that did occur from a note that is incomplete for a session that did not occur.
          </div>
        </div>

        <div class="card" style="margin-top: 10px;">
          <h3 class="card-title" style="margin: 0 0 6px 0;">Pay Summary (Posted Payroll)</h3>
        <div class="muted" v-if="!payTypeSummary.rows.length">No pay-type summary available.</div>
        <div v-else class="paytype">
          <div class="paytype-head">
            <div>Pay Type</div>
            <div class="right">Hours</div>
            <div class="right">Rate</div>
            <div class="right">Pay</div>
          </div>
          <div v-for="r in payTypeSummary.rows" :key="r.key" class="paytype-row">
            <div class="code">{{ r.label }}</div>
            <div class="right">{{ fmtNum(r.hours) }}</div>
            <div class="right muted">{{ r.rateLabel }}</div>
            <div class="right">{{ fmtMoney(r.amount) }}</div>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top: 10px;" v-if="hourlyRateSummary.effectiveRate !== null">
          <h3 class="card-title" style="margin: 0 0 6px 0;">Hourly Rate</h3>
          <div class="row"><strong>Effective hourly rate:</strong> {{ fmtMoney(hourlyRateSummary.effectiveRate) }}</div>
          <div class="muted" style="margin-top: 6px;">
            Effective hourly rate represents the total pay divided by earned credits/hours (which can vary by service mix, add-ons, and overrides).
          </div>
        </div>

        <div class="warn-box" v-else-if="hourlyRateSummary.variableRatesNote" style="margin-top: 10px;">
          <div><strong>Note about varying service rates</strong></div>
          <div class="muted" style="margin-top: 6px;">
            {{ hourlyRateSummary.variableRatesNote }}
          </div>
        </div>

        <div class="card" style="margin-top: 10px;" v-if="expanded.breakdown && expanded.breakdown.__tier">
          <h3 class="card-title" style="margin: 0 0 6px 0;">Benefit Tier</h3>
          <div class="row"><strong>{{ expanded.breakdown.__tier.label }}</strong></div>
          <div class="row"><strong>Status:</strong> {{ expanded.breakdown.__tier.status }}</div>
        </div>

        <div
          class="card"
          style="margin-top: 10px;"
          v-if="expanded.breakdown && expanded.breakdown.__practiceSupportMeeting && Number(expanded.breakdown.__practiceSupportMeeting.amount || 0) > 0"
        >
          <h3 class="card-title" style="margin: 0 0 6px 0;">Practice Support Meeting</h3>
          <div class="row">
            <strong>Hours:</strong> {{ fmtNum(expanded.breakdown.__practiceSupportMeeting.units || 0) }}
          </div>
          <div class="row">
            <strong>Pay:</strong> {{ fmtMoney(expanded.breakdown.__practiceSupportMeeting.amount || 0) }}
          </div>
          <div class="muted" style="margin-top: 6px;">
            Paid at your supervision meeting rate.
          </div>
        </div>

        <h3 class="card-title" style="margin-top: 12px;">Totals</h3>
        <div class="row"><strong>Total Pay:</strong> {{ fmtMoney(expanded.total_amount ?? 0) }}</div>
        <div class="row"><strong>Total Credits/Hours:</strong> {{ fmtNum(expanded.total_hours ?? 0) }}</div>
        <div class="row"><strong>Tier Credits (Final):</strong> {{ fmtNum(expanded.tier_credits_final ?? expanded.tier_credits_current ?? 0) }}</div>
        <div class="row" v-if="ytdTotals">
          <strong>Year to date ({{ ytdTotals.year }}):</strong>
          {{ fmtMoney(ytdTotals.totalPay) }} • {{ fmtNum(ytdTotals.totalHours) }} credits/hours
        </div>

        <div class="card" style="margin-top: 10px;">
          <h3 class="card-title" style="margin: 0 0 6px 0;">Direct / Indirect Totals</h3>
          <div class="di-grid">
            <div class="di-head">Type</div>
            <div class="di-head right">Hours</div>
            <div class="di-head right">Pay</div>
            <div class="di-head right">Rate</div>

            <div><strong>Direct</strong></div>
            <div class="right">{{ fmtNum(expanded.direct_hours ?? 0) }}</div>
            <div class="right">{{ fmtMoney(payTotalsFromBreakdown(expanded.breakdown).directAmount ?? 0) }}</div>
            <div class="right muted">
              {{
                (() => {
                  const h = Number(expanded.direct_hours || 0);
                  const amt = Number(payTotalsFromBreakdown(expanded.breakdown).directAmount || 0);
                  return h > 0 ? fmtMoney(amt / h) : '—';
                })()
              }}
          </div>

            <div><strong>Indirect</strong></div>
            <div class="right">{{ fmtNum(expanded.indirect_hours ?? 0) }}</div>
            <div class="right">{{ fmtMoney(payTotalsFromBreakdown(expanded.breakdown).indirectAmount ?? 0) }}</div>
            <div class="right muted">
              {{
                (() => {
                  const h = Number(expanded.indirect_hours || 0);
                  const amt = Number(payTotalsFromBreakdown(expanded.breakdown).indirectAmount || 0);
                  return h > 0 ? fmtMoney(amt / h) : '—';
                })()
              }}
            </div>
          </div>
        </div>

        <h3 class="card-title" style="margin-top: 12px;">Service Codes</h3>
        <div class="muted" v-if="!expanded.breakdown || !Object.keys(expanded.breakdown).length">No breakdown available.</div>
        <div v-else class="codes">
          <div class="codes-head">
            <div>Code</div>
            <div class="right">No Note</div>
            <div class="right">Draft</div>
            <div class="right">Finalized</div>
            <div class="right">Credits/Hours</div>
            <div class="right">Rate</div>
            <div class="right">Amount</div>
          </div>
          <div v-for="l in expandedServiceLines" :key="l.code" class="code-row">
            <div class="code">{{ l.code }}</div>
            <div class="right muted">{{ fmtNum(l.noNoteUnits ?? 0) }}</div>
            <div class="right muted">{{ fmtNum(l.draftUnits ?? 0) }}</div>
            <div class="right">{{ fmtNum(l.finalizedUnits ?? l.units ?? 0) }}</div>
            <div class="right muted">{{ fmtNum(l.hours ?? 0) }}</div>
            <div class="right muted">{{ fmtMoney(l.rateAmount ?? 0) }}</div>
            <div class="right">{{ fmtMoney(l.amount ?? 0) }}</div>
          </div>
          <div v-if="expanded.breakdown && expanded.breakdown.__adjustments" class="adjustments">
            <h3 class="card-title" style="margin-top: 10px;">Additional Pay / Overrides</h3>

            <div v-if="(expanded.breakdown.__adjustments.lines || []).length">
              <div v-for="(l, i) in (expanded.breakdown.__adjustments.lines || [])" :key="`adj:${l.type}:${i}`" class="row">
                <strong>{{ l.label }}:</strong>
                {{ fmtMoney(l.amount ?? 0) }}
                <span class="muted" v-if="l.meta && (l.meta.hours || l.meta.rate)">
                  • {{ fmtNum(l.meta.hours ?? 0) }} hrs @ {{ fmtMoney(l.meta.rate ?? 0) }}
                </span>
                <span class="muted" v-if="l.taxable === false"> • non-taxable</span>
                <span class="muted" v-else> • taxable</span>
              </div>
            </div>
            <div v-else>
              <!-- Backward-compatible fallback (older runs without lines[]) -->
              <div class="row"><strong>Mileage:</strong> {{ fmtMoney(expanded.breakdown.__adjustments.mileageAmount ?? 0) }}</div>
              <div class="row"><strong>Med Cancel:</strong> {{ fmtMoney(expanded.breakdown.__adjustments.medcancelAmount ?? 0) }}</div>
              <div class="row"><strong>Other taxable:</strong> {{ fmtMoney(expanded.breakdown.__adjustments.otherTaxableAmount ?? 0) }}</div>
              <div class="row"><strong>IMatter:</strong> {{ fmtMoney(expanded.breakdown.__adjustments.imatterAmount ?? 0) }}</div>
              <div class="row"><strong>Missed appointments:</strong> {{ fmtMoney(expanded.breakdown.__adjustments.missedAppointmentsAmount ?? 0) }}</div>
              <div class="row"><strong>Bonus:</strong> {{ fmtMoney(expanded.breakdown.__adjustments.bonusAmount ?? 0) }}</div>
              <div class="row"><strong>Reimbursement:</strong> {{ fmtMoney(expanded.breakdown.__adjustments.reimbursementAmount ?? 0) }}</div>
              <div class="row"><strong>Tuition reimbursement (tax-exempt):</strong> {{ fmtMoney(expanded.breakdown.__adjustments.tuitionReimbursementAmount ?? 0) }}</div>
              <div class="row"><strong>Time claims:</strong> {{ fmtMoney(expanded.breakdown.__adjustments.timeClaimsAmount ?? 0) }}</div>
              <div class="row"><strong>Manual pay lines:</strong> {{ fmtMoney(expanded.breakdown.__adjustments.manualPayLinesAmount ?? 0) }}</div>
              <div
                v-if="(expanded.breakdown.__adjustments.manualPayLines || expanded.breakdown.__manualPayLines || []).length"
                class="muted"
                style="margin-top: 6px;"
              >
                <div v-for="(ml, j) in (expanded.breakdown.__adjustments.manualPayLines || expanded.breakdown.__manualPayLines || [])" :key="`${ml.id || j}`">
                  - {{ ml.label }}: {{ fmtMoney(ml.amount ?? 0) }}
                </div>
              </div>
              <div class="row"><strong>PTO:</strong> {{ fmtNum(expanded.breakdown.__adjustments.ptoHours ?? 0) }} hrs @ {{ fmtMoney(expanded.breakdown.__adjustments.ptoRate ?? 0) }} = {{ fmtMoney(expanded.breakdown.__adjustments.ptoPay ?? 0) }}</div>
              <div class="row"><strong>Salary override:</strong> {{ fmtMoney(expanded.breakdown.__adjustments.salaryAmount ?? 0) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Mileage submission modal (Teleport to body so it's always visible) -->
  <Teleport to="body">
    <div v-if="showMileageModal" class="modal-backdrop" @click.self="closeMileageModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Submit Mileage</div>
          <div class="hint">Your submission will be reviewed by payroll before it is added to a pay period.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeMileageModal">Close</button>
      </div>

      <div v-if="submitMileageError" class="warn-box" style="margin-top: 10px;">{{ submitMileageError }}</div>

      <div class="hint" style="margin-top: 10px;">
        <template v-if="mileageForm.claimType === 'school_travel'">
          School Mileage (auto): eligible miles are calculated as (Home↔School RT − Home↔Office RT).
        </template>
        <template v-else>
          Other Mileage (manual): enter miles and include who approved the trip + what it was for.
        </template>
      </div>

      <div
        v-if="mileageForm.claimType !== 'school_travel' && (mileageSchools || []).length"
        class="card"
        style="margin-top: 10px; border-left: 4px solid var(--brand, #4f46e5);"
      >
        <div class="row" style="display: flex; justify-content: space-between; gap: 12px; align-items: center;">
          <div>
            <strong>Did you mean to submit In‑School Mileage?</strong>
            <div class="muted" style="margin-top: 4px;">
              If this was travel to your assigned school, use School Mileage so the eligible miles are calculated correctly.
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" @click="switchToSchoolMileage">
            Go to School Mileage
          </button>
        </div>
      </div>

      <div v-if="mileageForm.claimType === 'school_travel'" class="card" style="margin-top: 10px;">
        <div class="section-header" style="margin: 0;">
          <h3 class="card-title" style="margin: 0;">Home address</h3>
          <div class="actions" style="margin: 0; justify-content: flex-end;">
            <button
              v-if="!editingHomeAddress"
              class="btn btn-secondary btn-sm"
              type="button"
              @click="editingHomeAddress = true"
            >
              {{ hasHomeAddress ? 'Update home address' : 'Enter home address' }}
            </button>
            <template v-else>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                @click="cancelHomeAddressEdit"
                :disabled="savingHomeAddress"
              >
                Cancel
              </button>
              <button class="btn btn-primary btn-sm" type="button" @click="saveHomeAddress" :disabled="savingHomeAddress">
                {{ savingHomeAddress ? 'Saving…' : 'Save' }}
              </button>
            </template>
          </div>
        </div>
        <div class="hint" style="margin-top: 6px;">
          Required for School Mileage auto-calculation.
        </div>

        <div v-if="!editingHomeAddress" style="margin-top: 10px;">
          <div v-if="hasHomeAddress" class="row">
            <strong>Using:</strong>
            {{ mileageForm.homeStreetAddress }}, {{ mileageForm.homeCity }}, {{ mileageForm.homeState }} {{ mileageForm.homePostalCode }}
          </div>
          <div v-else class="warn-box">
            No home address on file. Click <strong>Enter home address</strong> to save it.
          </div>
        </div>

        <div v-else>
        <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
          <div class="field">
            <label>Street</label>
            <input v-model="mileageForm.homeStreetAddress" type="text" placeholder="123 Main St" />
          </div>
          <div class="field">
            <label>City</label>
            <input v-model="mileageForm.homeCity" type="text" placeholder="City" />
          </div>
        </div>
        <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
          <div class="field">
            <label>State</label>
            <input v-model="mileageForm.homeState" type="text" placeholder="State" />
          </div>
          <div class="field">
            <label>Postal code</label>
            <input v-model="mileageForm.homePostalCode" type="text" placeholder="ZIP" />
          </div>
        </div>
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Date of drive</label>
          <input v-model="mileageForm.driveDate" type="date" />
        </div>
        <div class="field" v-if="mileageForm.claimType === 'school_travel'">
          <label>Assigned school</label>
          <select v-model="mileageForm.schoolOrganizationId">
            <option :value="null" disabled>Select a school…</option>
            <option v-for="s in mileageSchools" :key="s.schoolOrganizationId" :value="s.schoolOrganizationId">
              {{ s.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field" v-if="mileageForm.claimType === 'school_travel'">
          <label>Assigned building office</label>
          <select v-model="mileageForm.officeLocationId">
            <option :value="null" disabled>Select an assigned office…</option>
            <option v-for="o in mileageOfficeOptions" :key="o.id" :value="o.id">
              {{ o.name }}{{ o.isPrimary ? ' (Primary)' : '' }}{{ o.addressLine ? ` — ${o.addressLine}` : '' }}
            </option>
          </select>
          <div class="hint" style="margin-top: 6px;">
            {{ (mileageAssignedOffices || []).length
              ? 'Mileage mapping uses this assigned building address.'
              : 'No explicit building assignment found yet; office selection uses agency offices.' }}
          </div>
          <div v-if="selectedMileageOffice?.addressLine" class="muted" style="margin-top: 4px;">
            Using address: {{ selectedMileageOffice.addressLine }}
          </div>
        </div>
        <div class="field" v-if="mileageForm.claimType === 'school_travel'">
          <label>Tier (for rate)</label>
          <select v-model="mileageForm.tierLevel">
            <option :value="null">Unknown / Other</option>
            <option :value="1">Tier 1</option>
            <option :value="2">Tier 2</option>
            <option :value="3">Tier 3</option>
          </select>
        </div>
      </div>

      <div v-if="mileageForm.claimType === 'school_travel'" class="warn-box" style="margin-top: 10px;">
        Eligible miles will be calculated automatically when you submit (Home↔School RT − Home↔Office RT).
      </div>

      <div v-if="mileageForm.claimType !== 'school_travel'" class="card" style="margin-top: 10px;">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Trip details</h3>
        <div class="hint">These details help payroll validate that the trip was approved and eligible.</div>
        <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label>Who approved the trip? (required)</label>
            <input v-model="mileageForm.tripApprovedBy" type="text" placeholder="Name or email" />
          </div>
          <div class="field">
            <label>Was this trip pre-approved? (required)</label>
            <select v-model="mileageForm.tripPreapproved">
              <option :value="null" disabled>Select…</option>
              <option :value="true">Yes</option>
              <option :value="false">No</option>
            </select>
          </div>
        </div>
        <div class="field" style="margin-top: 10px;">
          <label>What was the trip for? (required)</label>
          <textarea v-model="mileageForm.tripPurpose" rows="2" placeholder="Brief purpose (client/school/admin need)…"></textarea>
        </div>
        <div class="field" style="margin-top: 10px;">
          <label>Cost center / client / school (optional)</label>
          <input v-model="mileageForm.costCenter" type="text" placeholder="Optional" />
        </div>
      </div>

      <div
        v-if="mileageForm.claimType === 'school_travel' && schoolTravelManualMilesMode"
        class="card"
        style="margin-top: 10px;"
      >
        <h3 class="card-title" style="margin: 0 0 6px 0;">Manual miles (temporary fallback)</h3>
        <div class="hint">
          Auto-calculation is unavailable. Enter the <strong>eligible miles</strong> you want reimbursed.
          <span v-if="schoolTravelManualMilesReason" class="muted" style="display:block; margin-top: 6px;">
            Details: {{ schoolTravelManualMilesReason }}
          </span>
        </div>
        <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr;">
          <div class="field">
            <label>Eligible miles</label>
            <input v-model="mileageForm.miles" type="number" min="0" step="0.01" placeholder="0" />
          </div>
        </div>
      </div>

      <div v-if="mileageForm.claimType !== 'school_travel'" class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Miles</label>
          <input v-model="mileageForm.miles" type="number" min="0" step="0.01" placeholder="0" />
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <label class="control" style="display: flex; gap: 10px; align-items: center;">
            <input v-model="mileageForm.roundTrip" type="checkbox" />
            <span>Round trip</span>
          </label>
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Start location (optional)</label>
          <input v-model="mileageForm.startLocation" type="text" placeholder="Address or description…" />
        </div>
        <div class="field">
          <label>End location (optional)</label>
          <input v-model="mileageForm.endLocation" type="text" placeholder="Address or description…" />
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes (optional)</label>
        <textarea v-model="mileageForm.notes" rows="3" placeholder="Add any context for payroll review…"></textarea>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="mileageForm.attestation" type="checkbox" />
        <span>I certify this mileage claim is accurate and has not been submitted elsewhere.</span>
      </label>

      <div v-if="mileageForm.claimType === 'school_travel'" class="hint" style="margin-top: 10px;">
        To be paid in the pay period that ends Friday, submit by Sunday 11:59 PM. After that, it will be considered for the next pay period.
        After the next pay period’s Sunday 11:59 PM deadline, you can’t submit it in-app.
        If you are requesting an extension or consideration of an extension to submit a past claim, please reach out directly to your administrative team.
      </div>
      <div v-else class="hint" style="margin-top: 10px;">
        To be paid in the pay period that ends Friday, submit by Sunday 11:59 PM. After that, it will be considered for the next pay period.
        If you submit more than 60 days after the drive date, you can’t submit it in-app.
        If you are requesting an extension or consideration of an extension to submit a past claim, please reach out directly to your administrative team.
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitMileage" :disabled="submittingMileage">
          {{ submittingMileage ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>

  <!-- MedCancel submission modal (Teleport to body so it's visible when opened from hidden Submit-panel tab) -->
  <Teleport to="body">
  <div v-if="showMedcancelModal" class="modal-backdrop" @click.self="closeMedcancelModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Submit Med Cancel</div>
          <div class="hint">Your submission will be reviewed by payroll before it is added to a pay period.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeMedcancelModal">Close</button>
      </div>

      <div v-if="submitMedcancelError" class="warn-box" style="margin-top: 10px;">{{ submitMedcancelError }}</div>

      <div class="warn-box" style="margin-top: 10px;">
        <strong>Reminder:</strong> Med Cancel submissions may be denied if the reason is not aligned with the workplace handbook.
        Include why the client missed and what you did to attempt the session.
      </div>

      <div class="hint" style="margin-top: 10px;">
        To be paid in the pay period that ends Friday, submit by Sunday 11:59 PM. After that, it will be considered for the next pay period.
        If you submit more than 60 days after the reference date, you can’t submit it in-app.
        If you are requesting an extension or consideration of an extension to submit a past claim, please reach out directly to your administrative team.
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Date</label>
          <input v-model="medcancelForm.claimDate" type="date" />
        </div>
        <div class="field">
          <label>Assigned school</label>
          <select v-model="medcancelForm.schoolOrganizationId">
            <option :value="null" disabled>Select a school…</option>
            <option v-for="s in mileageSchools" :key="s.schoolOrganizationId" :value="s.schoolOrganizationId">
              {{ s.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="card" style="margin-top: 10px;">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Missed services (one date)</h3>
        <div class="muted">Add one entry per missed encounter (90832, 90834, 90837). Each requires a note + certification.</div>

        <div class="hint" style="margin-top: 8px;">
          Estimated amount (if approved): <strong>{{ fmtMoney(medcancelEstimatedAmount) }}</strong>
        </div>

        <div v-for="(it, idx) in medcancelForm.items" :key="idx" class="card" style="margin-top: 10px;">
          <div class="field-row" style="grid-template-columns: 200px 1fr; align-items: end;">
            <div class="field">
              <label>Missed service code</label>
              <select v-model="it.missedServiceCode">
                <option value="90832">90832</option>
                <option value="90834">90834</option>
                <option value="90837">90837</option>
              </select>
            </div>
            <div class="field">
              <label>Note (required)</label>
              <textarea v-model="it.note" rows="2" placeholder="Why was the client missing? What did you do to attempt the session?"></textarea>
            </div>
          </div>
          <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
            <div class="field">
              <label>Client initials (required)</label>
              <input v-model="it.clientInitials" type="text" placeholder="e.g., AB" />
            </div>
            <div class="field">
              <label>Session time (required)</label>
              <input v-model="it.sessionTime" type="time" />
            </div>
          </div>
          <label class="control" style="margin-top: 8px; display: flex; gap: 10px; align-items: center;">
            <input v-model="it.attestation" type="checkbox" />
            <span>I certify I attempted this session and it was missed.</span>
          </label>
          <div class="actions" style="margin-top: 8px; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" type="button" @click="removeMedcancelItem(idx)" :disabled="submittingMedcancel">
              Remove
            </button>
          </div>
        </div>

        <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
          <button class="btn btn-secondary btn-sm" type="button" @click="addMedcancelItem" :disabled="submittingMedcancel">
            + Add another missed service (same date)
          </button>
        </div>
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitMedcancel" :disabled="submittingMedcancel">
          {{ submittingMedcancel ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>

  <!-- PTO modals (Teleport to body so visible when opened from hidden Submit-panel tab) -->
  <Teleport to="body">
  <div v-if="showPtoChooser" class="modal-backdrop" @click.self="closePtoChooserModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Request PTO</div>
          <div class="hint">Choose Sick Leave or Training PTO (if eligible).</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closePtoChooserModal">Close</button>
      </div>

      <div v-if="submitPtoError" class="warn-box" style="margin-top: 10px;">{{ submitPtoError }}</div>

      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Bucket</th>
              <th class="right">Balance (hours)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sick Leave</td>
              <td class="right">{{ fmtNum(ptoBalances.sickHours || 0) }}</td>
            </tr>
            <tr>
              <td>Training PTO</td>
              <td class="right">{{ (ptoPolicy?.trainingPtoEnabled === true && ptoAccount?.training_pto_eligible) ? fmtNum(ptoBalances.trainingHours || 0) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="hint" style="margin-top: 10px;">
        PTO over {{ fmtNum(ptoPolicy?.ptoConsecutiveUseLimitHours ?? 15) }} hours consecutively requires
        {{ fmtNum(ptoPolicy?.ptoConsecutiveUseNoticeDays ?? 30) }} days notice and management approval.
        Training PTO requires a description and proof of participation.
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-secondary" type="button" @click="openPtoSick">Sick Leave Request</button>
        <button class="btn btn-secondary" type="button" @click="openPtoTraining" :disabled="ptoPolicy?.trainingPtoEnabled !== true || !ptoAccount?.training_pto_eligible">
          Training PTO Request
        </button>
      </div>
    </div>
  </div>

  <!-- PTO: Sick Leave request modal -->
  <div v-if="showPtoSickModal" class="modal-backdrop" @click.self="closePtoSick">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">PTO Request — Sick Leave</div>
          <div class="hint">Submit date(s) and hours for Sick Leave.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closePtoSick">Close</button>
      </div>

      <div v-if="submitPtoError" class="warn-box" style="margin-top: 10px;">{{ submitPtoError }}</div>

      <div class="hint" style="margin-top: 10px;">
        Policy reminders: PTO over {{ fmtNum(ptoPolicy?.ptoConsecutiveUseLimitHours ?? 15) }} hours consecutively requires
        {{ fmtNum(ptoPolicy?.ptoConsecutiveUseNoticeDays ?? 30) }} days notice and management approval.
      </div>

      <div class="card" style="margin-top: 12px;">
        <div class="muted"><strong>Entries</strong></div>
        <div v-for="(it, idx) in (ptoSickForm.items || [])" :key="idx" class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label>Date</label>
            <input v-model="it.date" type="date" />
          </div>
          <div class="field">
            <label>Hours</label>
            <input v-model="it.hours" type="number" step="0.25" min="0" placeholder="0" />
          </div>
          <div class="actions" style="grid-column: 1 / -1; justify-content: flex-end; margin-top: 6px;">
            <button class="btn btn-secondary btn-sm" type="button" @click="removePtoItem(ptoSickForm, idx)" :disabled="(ptoSickForm.items || []).length <= 1 || submittingPtoRequest">
              Remove
            </button>
          </div>
        </div>
        <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
          <button class="btn btn-secondary btn-sm" type="button" @click="addPtoItem(ptoSickForm)" :disabled="submittingPtoRequest">
            + Add date
          </button>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes (optional)</label>
        <textarea v-model="ptoSickForm.notes" rows="3" placeholder="Any context for payroll review…"></textarea>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="ptoSickForm.attestation" type="checkbox" />
        <span>I certify this request is accurate and complies with the PTO policy.</span>
      </label>

      <div class="hint" style="margin-top: 10px;">
        To be paid in the pay period that ends Friday, submit by Sunday 11:59 PM. After that, it will be considered for the next pay period.
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitPtoSick" :disabled="submittingPtoRequest">
          {{ submittingPtoRequest ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>

  <!-- PTO: Training PTO request modal -->
  <div v-if="showPtoTrainingModal" class="modal-backdrop" @click.self="closePtoTraining">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">PTO Request — Training PTO</div>
          <div class="hint">Training PTO requires a description and proof of participation.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closePtoTraining">Close</button>
      </div>

      <div v-if="submitPtoError" class="warn-box" style="margin-top: 10px;">{{ submitPtoError }}</div>

      <div class="card" style="margin-top: 12px;">
        <div class="muted"><strong>Entries</strong></div>
        <div v-for="(it, idx) in (ptoTrainingForm.items || [])" :key="idx" class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label>Date</label>
            <input v-model="it.date" type="date" />
          </div>
          <div class="field">
            <label>Hours</label>
            <input v-model="it.hours" type="number" step="0.25" min="0" placeholder="0" />
          </div>
          <div class="actions" style="grid-column: 1 / -1; justify-content: flex-end; margin-top: 6px;">
            <button class="btn btn-secondary btn-sm" type="button" @click="removePtoItem(ptoTrainingForm, idx)" :disabled="(ptoTrainingForm.items || []).length <= 1 || submittingPtoRequest">
              Remove
            </button>
          </div>
        </div>
        <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
          <button class="btn btn-secondary btn-sm" type="button" @click="addPtoItem(ptoTrainingForm)" :disabled="submittingPtoRequest">
            + Add date
          </button>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Description (required)</label>
        <textarea v-model="ptoTrainingForm.description" rows="3" placeholder="Brief description of the training…"></textarea>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Proof of participation (required)</label>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/jpg,image/gif,image/webp" @change="onPtoProofPick" />
        <div class="hint" v-if="ptoTrainingForm.proofName">Selected: <strong>{{ ptoTrainingForm.proofName }}</strong></div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes (optional)</label>
        <textarea v-model="ptoTrainingForm.notes" rows="3" placeholder="Any additional context…"></textarea>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="ptoTrainingForm.attestation" type="checkbox" />
        <span>I certify this request is accurate and I have provided required documentation.</span>
      </label>

      <div class="hint" style="margin-top: 10px;">
        To be paid in the pay period that ends Friday, submit by Sunday 11:59 PM. After that, it will be considered for the next pay period.
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitPtoTraining" :disabled="submittingPtoRequest">
          {{ submittingPtoRequest ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>

  <!-- Reimbursement submission modal (Teleport to body so it's visible when opened from hidden Submit-panel tab) -->
  <Teleport to="body">
  <div v-if="showReimbursementModal" class="modal-backdrop" @click.self="closeReimbursementModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">{{ editingReimbursementClaimId ? 'Edit + Resubmit Reimbursement' : 'Submit Reimbursement' }}</div>
          <div class="hint">Upload a receipt and submit for payroll approval.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeReimbursementModal">Close</button>
      </div>

      <div v-if="submitReimbursementError" class="warn-box" style="margin-top: 10px;">{{ submitReimbursementError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Expense date</label>
          <input v-model="reimbursementForm.expenseDate" type="date" />
        </div>
        <div class="field">
          <label>Amount</label>
          <input v-model="reimbursementForm.amount" type="number" step="0.01" min="0" placeholder="0.00" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Payment method (required)</label>
          <select v-model="reimbursementForm.paymentMethod">
            <option :value="null" disabled>Select…</option>
            <option value="personal_card">Personal card</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="field">
          <label>Project / school / client initials (optional)</label>
          <input v-model="reimbursementForm.projectRef" type="text" placeholder="Optional" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Supervisor / approver (required)</label>
          <input v-model="reimbursementForm.purchaseApprovedBy" type="text" placeholder="Name (or name + email)" />
          <div class="hint">Enter the approver who authorized this purchase prior to buying.</div>
        </div>
        <div class="field">
          <label>Was it pre-approved? (required)</label>
          <select v-model="reimbursementForm.purchasePreapproved">
            <option :value="null" disabled>Select…</option>
            <option :value="true">Yes</option>
            <option :value="false">No</option>
          </select>
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Vendor (optional)</label>
          <input v-model="reimbursementForm.vendor" type="text" placeholder="Vendor" />
        </div>
        <div class="field">
          <label>Reason (required)</label>
          <input v-model="reimbursementForm.reason" type="text" placeholder="Why was this expense needed?" />
        </div>
      </div>

      <div class="card" style="margin-top: 10px;">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Category split (optional)</h3>
        <div class="hint">If you split the amount across categories, the split total must match the amount.</div>
        <div
          v-for="(s, idx) in (reimbursementForm.splits || [])"
          :key="idx"
          class="field-row"
          style="margin-top: 10px; grid-template-columns: 1fr 180px;"
        >
          <div class="field">
            <label>Category</label>
            <input v-model="s.category" type="text" placeholder="e.g., Supplies" />
          </div>
          <div class="field">
            <label>Amount</label>
            <input v-model="s.amount" type="number" step="0.01" min="0" placeholder="0.00" />
          </div>
          <div class="actions" style="grid-column: 1 / -1; justify-content: flex-end; margin-top: 6px;">
            <button class="btn btn-secondary btn-sm" type="button" @click="(reimbursementForm.splits || []).splice(idx, 1)" :disabled="(reimbursementForm.splits || []).length <= 1 || submittingReimbursement">
              Remove
            </button>
          </div>
        </div>
        <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
          <button class="btn btn-secondary btn-sm" type="button" @click="(reimbursementForm.splits || []).push({ category: '', amount: '' })" :disabled="submittingReimbursement">
            + Add split
          </button>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes (required)</label>
        <textarea v-model="reimbursementForm.notes" rows="3" placeholder="Add any context for payroll review…"></textarea>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Receipt {{ editingReimbursementClaimId ? '(optional if unchanged)' : '(required)' }}</label>
        <div v-if="editingReimbursementClaimId && editingReimbursementExistingReceiptPath" class="hint" style="margin-bottom: 6px;">
          Current receipt:
          <a :href="receiptUrl({ receipt_file_path: editingReimbursementExistingReceiptPath })" target="_blank" rel="noopener noreferrer">View</a>
        </div>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/jpg,image/gif,image/webp" @change="onReceiptPick" />
        <div class="hint" v-if="reimbursementForm.receiptName">Selected: <strong>{{ reimbursementForm.receiptName }}</strong></div>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="reimbursementForm.attestation" type="checkbox" />
        <span>I certify this reimbursement is accurate and I have not submitted it elsewhere.</span>
      </label>

      <div class="hint" style="margin-top: 10px;">
        To be paid in the pay period that ends Friday, submit by Sunday 11:59 PM. After that, it will be considered for the next pay period.
        If you submit more than 60 days after the expense date, you can’t submit it in-app.
        If you are requesting an extension or consideration of an extension to submit a past claim, please reach out directly to your administrative team.
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitReimbursement" :disabled="submittingReimbursement">
          {{ submittingReimbursement ? 'Submitting…' : (editingReimbursementClaimId ? 'Resubmit for approval' : 'Submit for approval') }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>

  <!-- Company card expense submission modal (Teleport to body so it's visible when opened from Submit panel) -->
  <Teleport to="body">
  <div v-if="showCompanyCardExpenseModal" class="modal-backdrop" @click.self="closeCompanyCardExpenseModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">{{ editingCompanyCardExpenseId ? 'Edit + Resubmit Expense (Company Card)' : 'Submit Expense (Company Card)' }}</div>
          <div class="hint">Submit a company card purchase for tracking/review.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeCompanyCardExpenseModal">Close</button>
      </div>

      <div v-if="submitCompanyCardExpenseError" class="warn-box" style="margin-top: 10px;">{{ submitCompanyCardExpenseError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Expense date</label>
          <input v-model="companyCardExpenseForm.expenseDate" type="date" />
        </div>
        <div class="field">
          <label>Amount</label>
          <input v-model="companyCardExpenseForm.amount" type="number" step="0.01" min="0" placeholder="0.00" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Payment method</label>
          <input :value="'Company card'" type="text" disabled />
        </div>
        <div class="field">
          <label>Project / school / client initials (optional)</label>
          <input v-model="companyCardExpenseForm.projectRef" type="text" placeholder="Optional" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Supervisor / approver (required)</label>
          <input v-model="companyCardExpenseForm.supervisorName" type="text" placeholder="Name (or name + email)" />
        </div>
        <div class="field">
          <label>Reason / purpose (required)</label>
          <input v-model="companyCardExpenseForm.purpose" type="text" placeholder="What was this for?" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Vendor (optional)</label>
          <input v-model="companyCardExpenseForm.vendor" type="text" placeholder="Vendor" />
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <div class="hint">Tip: use project/client initials so payroll can allocate correctly.</div>
        </div>
      </div>

      <div class="card" style="margin-top: 10px;">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Category split (optional)</h3>
        <div class="hint">If you split the amount across categories, the split total must match the amount.</div>
        <div
          v-for="(s, idx) in (companyCardExpenseForm.splits || [])"
          :key="idx"
          class="field-row"
          style="margin-top: 10px; grid-template-columns: 1fr 180px;"
        >
          <div class="field">
            <label>Category</label>
            <input v-model="s.category" type="text" placeholder="e.g., Training" />
          </div>
          <div class="field">
            <label>Amount</label>
            <input v-model="s.amount" type="number" step="0.01" min="0" placeholder="0.00" />
          </div>
          <div class="actions" style="grid-column: 1 / -1; justify-content: flex-end; margin-top: 6px;">
            <button class="btn btn-secondary btn-sm" type="button" @click="(companyCardExpenseForm.splits || []).splice(idx, 1)" :disabled="(companyCardExpenseForm.splits || []).length <= 1 || submittingCompanyCardExpense">
              Remove
            </button>
          </div>
        </div>
        <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
          <button class="btn btn-secondary btn-sm" type="button" @click="(companyCardExpenseForm.splits || []).push({ category: '', amount: '' })" :disabled="submittingCompanyCardExpense">
            + Add split
          </button>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes (required)</label>
        <textarea v-model="companyCardExpenseForm.notes" rows="3" placeholder="Describe the purchase and business purpose…"></textarea>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Receipt {{ editingCompanyCardExpenseId ? '(optional if unchanged)' : '(required)' }}</label>
        <div v-if="editingCompanyCardExpenseId && editingCompanyCardExistingReceiptPath" class="hint" style="margin-bottom: 6px;">
          Current receipt:
          <a :href="receiptUrl({ receipt_file_path: editingCompanyCardExistingReceiptPath })" target="_blank" rel="noopener noreferrer">View</a>
        </div>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/jpg,image/gif,image/webp" @change="onCompanyCardReceiptPick" />
        <div class="hint" v-if="companyCardExpenseForm.receiptName">Selected: <strong>{{ companyCardExpenseForm.receiptName }}</strong></div>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="companyCardExpenseForm.attestation" type="checkbox" />
        <span>I certify this purchase was for business use and the details above are accurate.</span>
      </label>

      <div class="hint" style="margin-top: 10px;">
        To be paid in the pay period that ends Friday, submit by Sunday 11:59 PM. After that, it will be considered for the next pay period.
        If you submit more than 60 days after the expense date, you can’t submit it in-app.
        If you are requesting an extension or consideration of an extension to submit a past claim, please reach out directly to your administrative team.
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitCompanyCardExpense" :disabled="submittingCompanyCardExpense">
          {{ submittingCompanyCardExpense ? 'Submitting…' : (editingCompanyCardExpenseId ? 'Resubmit for review' : 'Submit for review') }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>

  <!-- Time Claim modals (Teleport to body so visible when opened from Submit panel) -->
  <Teleport to="body">
  <div v-if="showTimeMeetingModal" class="modal-backdrop" @click.self="closeTimeMeetingModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Time Claim — Meeting / Training</div>
          <div class="hint">Module 3A: Log attendance for meeting or training.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeTimeMeetingModal">Close</button>
      </div>

      <div v-if="submitTimeClaimError" class="warn-box" style="margin-top: 10px;">{{ submitTimeClaimError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Date</label>
          <input v-model="timeMeetingForm.claimDate" type="date" />
        </div>
        <div class="field">
          <label>Meeting type</label>
          <select v-model="timeMeetingForm.meetingType">
            <option>Admin Update Meeting</option>
            <option>Admin Meeting</option>
            <option>Leadership Circle Meeting</option>
            <option>Admin Town Hall Meeting</option>
            <option>Training</option>
            <option>Evaluation</option>
            <option>Mentor/CPA Individual Meeting</option>
            <option>Not listed</option>
          </select>
        </div>
      </div>

      <div class="field" v-if="timeMeetingForm.meetingType === 'Mentor/CPA Individual Meeting'" style="margin-top: 10px;">
        <label>Meeting with</label>
        <select v-model="timeMeetingForm.mentorRole">
          <option value="intern_mentor">Intern Mentor</option>
          <option value="clinical_practice_assistant">Clinical Practice Assistant (CPA)</option>
        </select>
      </div>

      <div class="field" v-if="timeMeetingForm.meetingType === 'Not listed'" style="margin-top: 10px;">
        <label>Other meeting not listed</label>
        <input v-model="timeMeetingForm.otherMeeting" type="text" placeholder="Describe the meeting" />
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr 1fr;">
        <div class="field">
          <label>Start time</label>
          <input v-model="timeMeetingForm.startTime" type="time" />
        </div>
        <div class="field">
          <label>End time</label>
          <input v-model="timeMeetingForm.endTime" type="time" />
        </div>
        <div class="field">
          <label>Total minutes</label>
          <input v-model="timeMeetingForm.totalMinutes" type="number" step="1" min="0" placeholder="0" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Platform</label>
          <select v-model="timeMeetingForm.platform">
            <option>Google Meet</option>
            <option>In-Person</option>
            <option>Other</option>
          </select>
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <div class="hint">Tip: enter Total Minutes directly if you don’t want to track start/end times.</div>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Event summary</label>
        <textarea v-model="timeMeetingForm.summary" rows="3" placeholder="Include purpose…"></textarea>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="timeMeetingForm.attestation" type="checkbox" />
        <span>I certify that the information is accurate, complete, and in compliance with the workplace handbook.</span>
      </label>

      <div class="hint" style="margin-top: 10px;">
        To be paid in the pay period that ends Friday, submit by Sunday 11:59 PM. After that, it will be considered for the next pay period.
        If you submit more than 60 days after the date of service, you can’t submit it in-app.
        If you are requesting an extension or consideration of an extension to submit a past claim, please reach out directly to your administrative team.
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button
          class="btn btn-primary"
          @click="submitTimeMeeting"
          :disabled="submittingTimeClaim"
        >
          {{ submittingTimeClaim ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>
  <div v-if="showTimeExcessModal" class="modal-backdrop" @click.self="closeTimeExcessModal">
    <div class="modal" style="width: min(800px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Time Claim — Excess Time</div>
          <div class="hint">Per pay period: select code, enter units, see expected totals, enter your actual direct/indirect. Excess is paid at your rates.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeTimeExcessModal">Close</button>
      </div>

      <div v-if="submitTimeClaimError" class="warn-box" style="margin-top: 10px;">{{ submitTimeClaimError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Pay period end date</label>
          <input v-model="timeExcessForm.claimDate" type="date" />
        </div>
      </div>

      <div class="card" style="margin-top: 12px;">
        <div v-if="excessRulesLoading" class="muted">Loading rules…</div>
        <div v-else-if="!excessRules.length" class="muted">
          No excess compensation rules configured. Ask your admin to add service codes in Payroll Settings → Excess Time Rules.
        </div>
        <template v-else>
          <div class="field-row" style="grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="field">
              <label>CPT Code</label>
              <select v-model="timeExcessForm.serviceCode">
                <option value="">Select…</option>
                <option v-for="r in excessRules" :key="r.service_code" :value="r.service_code">{{ r.service_code }}</option>
              </select>
            </div>
            <div class="field">
              <label>Units (this pay period)</label>
              <input v-model.number="timeExcessForm.units" type="number" min="1" step="1" placeholder="1" />
            </div>
          </div>
          <div v-if="timeExcessForm.serviceCode && excessRuleByCode[timeExcessForm.serviceCode]" class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="field">
              <label>Expected direct (mins)</label>
              <div class="readonly-value">{{ excessExpectedDirect }} mins</div>
            </div>
            <div class="field">
              <label>Expected indirect (mins)</label>
              <div class="readonly-value">{{ excessExpectedIndirect }} mins</div>
            </div>
          </div>
          <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="field">
              <label>Actual direct (mins)</label>
              <input v-model.number="timeExcessForm.actualDirectMinutes" type="number" min="0" step="1" placeholder="0" />
            </div>
            <div class="field">
              <label>Actual indirect (mins)</label>
              <input v-model.number="timeExcessForm.actualIndirectMinutes" type="number" min="0" step="1" placeholder="0" />
            </div>
          </div>
          <div v-if="excessComputedDirect > 0 || excessComputedIndirect > 0" class="hint" style="margin-top: 8px;">
            Excess: {{ excessComputedDirect }} direct mins, {{ excessComputedIndirect }} indirect mins (will be paid at your rates)
          </div>
        </template>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Reason for extended time (optional)</label>
        <textarea v-model="timeExcessForm.reason" rows="2" placeholder="e.g., Documentation, care coordination…"></textarea>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="timeExcessForm.attestation" type="checkbox" />
        <span>I certify the information is accurate and complete.</span>
      </label>

      <div class="hint" style="margin-top: 10px;">
        To be paid in the pay period that ends Friday, submit by Sunday 11:59 PM. After that, it will be considered for the next pay period.
        If you submit more than 60 days after the date of service, you can’t submit it in-app.
        If you are requesting an extension or consideration of an extension to submit a past claim, please reach out directly to your administrative team.
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button
          class="btn btn-primary"
          @click="submitTimeExcess"
          :disabled="submittingTimeClaim || !hasValidExcessItems || !timeExcessForm.attestation"
        >
          {{ submittingTimeClaim ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>
  <div v-if="showTimeCorrectionModal" class="modal-backdrop" @click.self="closeTimeCorrectionModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Time Claim — Service Correction</div>
          <div class="hint">Module 3C: Submit a service correction request.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeTimeCorrectionModal">Close</button>
      </div>

      <div v-if="submitTimeClaimError" class="warn-box" style="margin-top: 10px;">{{ submitTimeClaimError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Date of service</label>
          <input v-model="timeCorrectionForm.claimDate" type="date" />
        </div>
        <div class="field">
          <label>Client initials</label>
          <input v-model="timeCorrectionForm.clientInitials" type="text" placeholder="First 3 of first/last name" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Original service submitted</label>
          <input v-model="timeCorrectionForm.originalService" type="text" placeholder="e.g., 90837" />
        </div>
        <div class="field">
          <label>Corrected service</label>
          <input v-model="timeCorrectionForm.correctedService" type="text" placeholder="e.g., 90834" />
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Duration for corrected service</label>
        <input v-model="timeCorrectionForm.duration" type="text" placeholder="e.g., 53 minutes" />
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Reason for correction</label>
        <textarea v-model="timeCorrectionForm.reason" rows="3"></textarea>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="timeCorrectionForm.attestation" type="checkbox" />
        <span>I certify the information is accurate and complete.</span>
      </label>

      <div class="hint" style="margin-top: 10px;">
        To be paid in the pay period that ends Friday, submit by Sunday 11:59 PM. After that, it will be considered for the next pay period.
        If you submit more than 60 days after the date of service, you can’t submit it in-app.
        If you are requesting an extension or consideration of an extension to submit a past claim, please reach out directly to your administrative team.
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button
          class="btn btn-primary"
          @click="submitTimeCorrection"
          :disabled="submittingTimeClaim"
        >
          {{ submittingTimeClaim ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>
  <div v-if="showTimeOvertimeModal" class="modal-backdrop" @click.self="closeTimeOvertimeModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Time Claim — Overtime Evaluation</div>
          <div class="hint">Module 3D: Overtime evaluation.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeTimeOvertimeModal">Close</button>
      </div>

      <div v-if="submitTimeClaimError" class="warn-box" style="margin-top: 10px;">{{ submitTimeClaimError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Reference date</label>
          <input v-model="timeOvertimeForm.claimDate" type="date" />
        </div>
        <div class="field">
          <label>Estimated total work hours this workweek</label>
          <input v-model="timeOvertimeForm.estimatedWorkweekHours" type="number" step="0.1" min="0" placeholder="0" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Did you work over 12 hours in a day?</label>
          <select v-model="timeOvertimeForm.workedOver12Hours">
            <option :value="true">Yes</option>
            <option :value="false">No</option>
          </select>
        </div>
        <div class="field">
          <label>All direct service recorded in Therapy Notes?</label>
          <select v-model="timeOvertimeForm.allDirectServiceRecorded">
            <option :value="true">Yes</option>
            <option :value="false">No</option>
          </select>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Hours worked each day (workweek containing reference date)</label>
        <div class="hint" style="margin-bottom: 8px;">Enter hours for Mon–Sun. Overtime = over 12 hrs/day or over 40 hrs/week.</div>
        <div class="overtime-days-grid">
          <div v-for="d in overtimeDayLabels" :key="d.key" class="overtime-day-cell">
            <label class="overtime-day-label">{{ d.label }}</label>
            <input v-model.number="timeOvertimeForm.daysHours[d.key]" type="number" step="0.25" min="0" max="24" placeholder="0" />
          </div>
        </div>
        <div class="hint" style="margin-top: 6px;">Week total: <strong>{{ overtimeWeekTotal }} hrs</strong></div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Was this overtime approved?</label>
          <select v-model="timeOvertimeForm.overtimeApproved">
            <option :value="true">Yes</option>
            <option :value="false">No</option>
          </select>
        </div>
        <div class="field">
          <label>Who approved this overtime?</label>
          <input v-model="timeOvertimeForm.approvedBy" type="text" placeholder="Name or email" />
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes for payroll</label>
        <textarea v-model="timeOvertimeForm.notesForPayroll" rows="3"></textarea>
      </div>

      <div v-if="isOfficeStaff" class="card" style="margin-top: 12px;">
        <h4 style="margin: 0 0 8px 0;">Holiday pay (office staff only)</h4>
        <div class="hint" style="margin-bottom: 8px;">Request pay for working on an approved agency holiday.</div>
        <label class="control" style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
          <input v-model="timeOvertimeForm.requestHolidayPay" type="checkbox" />
          <span>I worked on an approved holiday and request holiday pay</span>
        </label>
        <div v-if="timeOvertimeForm.requestHolidayPay" class="field-row" style="grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="field">
            <label>Holiday date</label>
            <select v-model="timeOvertimeForm.holidayDate">
              <option value="">Select approved holiday…</option>
              <option v-for="h in agencyHolidays" :key="h.holiday_date" :value="String(h.holiday_date || '').slice(0, 10)">
                {{ String(h.holiday_date || '').slice(0, 10) }} — {{ h.name || 'Holiday' }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Hours worked</label>
            <input v-model.number="timeOvertimeForm.holidayHoursWorked" type="number" step="0.25" min="0" placeholder="e.g., 4" />
          </div>
        </div>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="timeOvertimeForm.attestation" type="checkbox" />
        <span>I certify the information is accurate and complete.</span>
      </label>

      <div class="hint" style="margin-top: 10px;">
        To be paid in the pay period that ends Friday, submit by Sunday 11:59 PM. After that, it will be considered for the next pay period.
        If you submit more than 60 days after the date of service, you can’t submit it in-app.
        If you are requesting an extension or consideration of an extension to submit a past claim, please reach out directly to your administrative team.
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button
          class="btn btn-primary"
          @click="submitTimeOvertime"
          :disabled="submittingTimeClaim || overtimeWeekTotal <= 0"
        >
          {{ submittingTimeClaim ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  /** When set, open mileage modal immediately on mount (e.g. from Submit panel). */
  openMileageOnMount: { type: String, default: null },
  /** When true, open reimbursement modal immediately on mount (e.g. from Submit panel). */
  openReimbursementOnMount: { type: Boolean, default: false },
  /** When true, open medcancel modal immediately on mount (e.g. from Submit panel). */
  openMedcancelOnMount: { type: Boolean, default: false },
  /** When true, open PTO chooser modal immediately on mount (e.g. from Submit panel). */
  openPtoOnMount: { type: Boolean, default: false },
  /** When true, open company card expense modal immediately on mount (e.g. from Submit panel). */
  openCompanyCardOnMount: { type: Boolean, default: false },
  /** When set, open the corresponding time claim modal on mount (e.g. from Submit panel): 'meeting' | 'excess' | 'correction' | 'overtime'. */
  openTimeOnMount: { type: String, default: null }
});
const emit = defineEmits(['mileage-modal-closed', 'mileage-submitted', 'reimbursement-modal-closed', 'reimbursement-submitted', 'medcancel-modal-closed', 'medcancel-submitted', 'pto-modal-closed', 'pto-submitted', 'company-card-modal-closed', 'company-card-submitted', 'time-modal-closed', 'time-submitted']);

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
};
const agencyFlags = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return parseFeatureFlags(a?.feature_flags);
});
const inSchoolEnabled = computed(() => agencyFlags.value?.inSchoolSubmissionsEnabled !== false);
const medcancelEnabledForAgency = computed(() => inSchoolEnabled.value && agencyFlags.value?.medcancelEnabled !== false);

const userId = computed(() => authStore.user?.id || null);

const submitterLabel = (row) => {
  const currentUid = userId.value ? Number(userId.value) : null;
  const submittedById = row?.submitted_by_user_id === null || row?.submitted_by_user_id === undefined ? null : Number(row.submitted_by_user_id);
  if (currentUid && submittedById && submittedById === currentUid) return 'You';

  const fn = String(row?.submitted_by_first_name || '').trim();
  const ln = String(row?.submitted_by_last_name || '').trim();
  const email = String(row?.submitted_by_email || '').trim();

  if (ln || fn) return `${ln}${ln && fn ? ', ' : ''}${fn}`;
  if (email) return email;
  if (submittedById) return `User #${submittedById}`;
  return '—';
};

const mileageClaimRowClass = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'approved' || s === 'paid') return 'mileage-row-approved';
  if (s === 'deferred' || s === 'rejected' || s === 'returned') return 'mileage-row-returned';
  return 'mileage-row-submitted';
};

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  // `currentAgency` is persisted to localStorage and can be hydrated; ensure we always return a plain number id.
  // Some call sites depend on this for query params (backend requires `agencyId`).
  const raw = a?.id?.value ?? a?.id ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const OFFICE_STAFF_ROLES = ['staff', 'admin', 'support', 'clinical_practice_assistant', 'supervisor'];
const isOfficeStaff = computed(() => {
  const r = String(authStore.user?.role || '').trim().toLowerCase();
  return OFFICE_STAFF_ROLES.includes(r);
});

const periods = ref([]);
const loading = ref(false);
const error = ref('');

const showMileageModal = ref(false);
const submittingMileage = ref(false);
const submitMileageError = ref('');
const submitSuccess = ref('');
const mileageClaims = ref([]);
const mileageClaimsLoading = ref(false);
const mileageClaimsError = ref('');
const mileageSchools = ref([]);
const mileageOffices = ref([]);
const mileageAssignedOffices = ref([]);
const savingHomeAddress = ref(false);
const editingHomeAddress = ref(false);
const schoolTravelManualMilesMode = ref(false);
const schoolTravelManualMilesReason = ref('');
const lastLoadedHomeAddress = ref({
  homeStreetAddress: '',
  homeCity: '',
  homeState: '',
  homePostalCode: ''
});
const showMedcancelModal = ref(false);
const submittingMedcancel = ref(false);
const submitMedcancelError = ref('');
const medcancelClaims = ref([]);
const medcancelClaimsLoading = ref(false);
const medcancelClaimsError = ref('');
const medcancelPolicyLoading = ref(false);
const medcancelPolicyError = ref('');
const medcancelPolicy = ref(null);

const ptoLoading = ref(false);
const ptoError = ref('');
const ptoPolicy = ref(null);
const ptoDefaultPayRate = ref(0);
const ptoAccount = ref(null);
const ptoBalances = ref({ sickHours: 0, trainingHours: 0 });
const ptoRequests = ref([]);
const ptoRequestsLoading = ref(false);
const ptoRequestsError = ref('');
const showPtoChooser = ref(false);
const showPtoSickModal = ref(false);
const showPtoTrainingModal = ref(false);
const submittingPtoRequest = ref(false);
const submitPtoError = ref('');

const ptoPendingSickHours = computed(() => {
  const list = Array.isArray(ptoRequests.value) ? ptoRequests.value : [];
  return list
    .filter((r) => String(r.status || '').toLowerCase() === 'submitted' && String(r.request_type || '').toLowerCase() !== 'training')
    .reduce((sum, r) => sum + Number(r.total_hours || 0), 0);
});
const ptoPendingTrainingHours = computed(() => {
  const list = Array.isArray(ptoRequests.value) ? ptoRequests.value : [];
  return list
    .filter((r) => String(r.status || '').toLowerCase() === 'submitted' && String(r.request_type || '').toLowerCase() === 'training')
    .reduce((sum, r) => sum + Number(r.total_hours || 0), 0);
});

const ptoSickForm = ref({
  items: [{ date: '', hours: '' }],
  notes: '',
  attestation: false
});
const ptoTrainingForm = ref({
  items: [{ date: '', hours: '' }],
  description: '',
  notes: '',
  proofFile: null,
  proofName: '',
  attestation: false
});
const showReimbursementModal = ref(false);
const submittingReimbursement = ref(false);
const submitReimbursementError = ref('');
const reimbursementClaims = ref([]);
const reimbursementClaimsLoading = ref(false);
const reimbursementClaimsError = ref('');
const editingReimbursementClaimId = ref(null);
const editingReimbursementExistingReceiptPath = ref('');
const showCompanyCardExpenseModal = ref(false);
const submittingCompanyCardExpense = ref(false);
const submitCompanyCardExpenseError = ref('');
const companyCardExpenses = ref([]);
const companyCardExpensesLoading = ref(false);
const companyCardExpensesError = ref('');
const editingCompanyCardExpenseId = ref(null);
const editingCompanyCardExistingReceiptPath = ref('');
const showTimeMeetingModal = ref(false);
const showTimeExcessModal = ref(false);
const showTimeCorrectionModal = ref(false);
const showTimeOvertimeModal = ref(false);
const submittingTimeClaim = ref(false);
const submitTimeClaimError = ref('');
const timeClaims = ref([]);
const timeClaimsLoading = ref(false);
const timeClaimsError = ref('');
const mileageForm = ref({
  claimType: 'school_travel',
  driveDate: '',
  schoolOrganizationId: null,
  officeLocationId: null,
  tierLevel: null,
  miles: '',
  roundTrip: false,
  startLocation: '',
  endLocation: '',
  notes: '',
  attestation: false,
  homeStreetAddress: '',
  homeCity: '',
  homeState: '',
  homePostalCode: ''
});
const mileageOfficeOptions = computed(() => {
  const assigned = Array.isArray(mileageAssignedOffices.value) ? mileageAssignedOffices.value : [];
  if (assigned.length) return assigned;
  return Array.isArray(mileageOffices.value) ? mileageOffices.value : [];
});
const selectedMileageOffice = computed(() => {
  const id = Number(mileageForm.value.officeLocationId || 0);
  if (!id) return null;
  return mileageOfficeOptions.value.find((o) => Number(o?.id) === id) || null;
});
const medcancelForm = ref({
  claimDate: '',
  schoolOrganizationId: null,
  items: []
});
const reimbursementForm = ref({
  expenseDate: '',
  amount: '',
  vendor: '',
  purchaseApprovedBy: '',
  purchasePreapproved: null,
  category: '',
  notes: '',
  attestation: false,
  receiptFile: null,
  receiptName: ''
});

const companyCardExpenseForm = ref({
  expenseDate: '',
  amount: '',
  vendor: '',
  purpose: '',
  notes: '',
  attestation: false,
  receiptFile: null,
  receiptName: ''
});

const timeMeetingForm = ref({
  claimDate: '',
  meetingType: 'Training',
  mentorRole: 'intern_mentor',
  otherMeeting: '',
  startTime: '',
  endTime: '',
  totalMinutes: '',
  platform: 'Google Meet',
  summary: '',
  attestation: false
});

const timeExcessForm = ref({
  claimDate: '',
  serviceCode: '',
  units: 1,
  actualDirectMinutes: 0,
  actualIndirectMinutes: 0,
  reason: '',
  attestation: false
});

const excessRules = ref([]);
const excessRulesLoading = ref(false);
const excessRuleByCode = computed(() => {
  const map = {};
  for (const r of excessRules.value) {
    map[r.service_code] = r;
  }
  return map;
});
const hasValidExcessItems = computed(() => {
  const f = timeExcessForm.value;
  return f.serviceCode && (Number(f.actualDirectMinutes || 0) > 0 || Number(f.actualIndirectMinutes || 0) > 0);
});

const excessExpectedDirect = computed(() => {
  const code = timeExcessForm.value.serviceCode;
  const rule = code ? excessRuleByCode.value[code] : null;
  const units = Math.max(1, Number(timeExcessForm.value.units || 1));
  return rule ? units * Number(rule.expected_direct_total || 0) : 0;
});
const excessExpectedIndirect = computed(() => {
  const code = timeExcessForm.value.serviceCode;
  const rule = code ? excessRuleByCode.value[code] : null;
  const units = Math.max(1, Number(timeExcessForm.value.units || 1));
  return rule ? units * Number(rule.expected_indirect_total || 0) : 0;
});
const excessComputedDirect = computed(() => Math.max(0, Number(timeExcessForm.value.actualDirectMinutes || 0) - excessExpectedDirect.value));
const excessComputedIndirect = computed(() => Math.max(0, Number(timeExcessForm.value.actualIndirectMinutes || 0) - excessExpectedIndirect.value));

const loadExcessRules = async () => {
  if (!agencyId.value) return;
  excessRulesLoading.value = true;
  try {
    const resp = await api.get('/payroll/me/excess-compensation-rules', { params: { agencyId: agencyId.value } });
    excessRules.value = Array.isArray(resp?.data) ? resp.data : [];
  } catch {
    excessRules.value = [];
  } finally {
    excessRulesLoading.value = false;
  }
};

const timeCorrectionForm = ref({
  claimDate: '',
  clientInitials: '',
  originalService: '',
  correctedService: '',
  duration: '',
  reason: '',
  attestation: false
});

const overtimeDayLabels = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' }
];

const timeOvertimeForm = ref({
  claimDate: '',
  workedOver12Hours: false,
  daysHours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
  estimatedWorkweekHours: '',
  allDirectServiceRecorded: true,
  overtimeApproved: false,
  approvedBy: '',
  notesForPayroll: '',
  requestHolidayPay: false,
  holidayDate: '',
  holidayHoursWorked: 0,
  attestation: false
});

const overtimeWeekTotal = computed(() => {
  const h = timeOvertimeForm.value.daysHours || {};
  return overtimeDayLabels.reduce((sum, d) => sum + (Number(h[d.key]) || 0), 0);
});

function serializeDaysHoursToDatesAndHours(claimDate, daysHours) {
  if (!claimDate || !daysHours) return '';
  const d = new Date(claimDate + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const dayOfWeek = d.getDay();
  const monOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mon = new Date(d);
  mon.setDate(d.getDate() + monOffset);
  const parts = [];
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  for (let i = 0; i < 7; i++) {
    const date = new Date(mon);
    date.setDate(mon.getDate() + i);
    const m = date.getMonth() + 1;
    const day = date.getDate();
    const hrs = Number(daysHours[keys[i]]) || 0;
    parts.push(`${m}/${day} (${labels[i]}): ${hrs}`);
  }
  return parts.join(', ');
}

function parseDatesAndHoursToDaysHours(str) {
  const out = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };
  const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const s = String(str || '').trim();
  if (!s) return out;
  for (let i = 0; i < 7; i++) {
    const re = new RegExp(`\\(${labels[i]}\\):\\s*([\\d.]+)`, 'i');
    const m = s.match(re);
    if (m) out[keys[i]] = Number(m[1]) || 0;
  }
  return out;
}

const agencyHolidays = ref([]);

const dateYmd = (v) => {
  if (!v) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

const medcancelEstimatedAmount = computed(() => {
  const schedule = String(authStore.user?.medcancelRateSchedule || '').toLowerCase();
  const items = Array.isArray(medcancelForm.value.items) ? medcancelForm.value.items : [];
  const pol = medcancelPolicy.value?.policy || medcancelPolicy.value || null;
  const scheduleRates =
    schedule === 'high'
      ? (pol?.schedules?.high || {})
      : (pol?.schedules?.low || {});
  let sum = 0;
  for (const it of items) {
    const code = String(it?.missedServiceCode || '').trim();
    sum += Number(scheduleRates?.[code] || 0);
  }
  sum = Math.round(sum * 100) / 100;
  return Number.isFinite(sum) ? sum : 0;
});

const medcancelEstimatedAmountForClaim = (c) => {
  const schedule = String(authStore.user?.medcancelRateSchedule || '').toLowerCase();
  const pol = medcancelPolicy.value?.policy || medcancelPolicy.value || null;
  const scheduleRates =
    schedule === 'high'
      ? (pol?.schedules?.high || {})
      : (pol?.schedules?.low || {});
  const items = Array.isArray(c?.items) ? c.items : [];
  let sum = 0;
  for (const it of items) {
    const code = String(it?.missed_service_code || it?.missedServiceCode || it?.missedServiceCodeRaw || '').trim();
    sum += Number(scheduleRates?.[code] || 0);
  }
  sum = Math.round(sum * 100) / 100;
  return Number.isFinite(sum) ? sum : 0;
};

const medcancelAmountLabel = (c) => {
  const applied = Number(c?.applied_amount || 0);
  if (Number.isFinite(applied) && applied > 0) return fmtMoney(applied);
  const est = medcancelEstimatedAmountForClaim(c);
  return est > 0 ? `${fmtMoney(est)} (est.)` : '—';
};

const expandedId = ref(null);
const expanded = computed(() => periods.value.find((p) => p.payroll_period_id === expandedId.value) || null);
const expandedUnpaid = computed(() => {
  const p = expanded.value;
  const c = p?.unpaidNotesCounts || null;
  if (c && typeof c === 'object') {
    const noNote = Number(c.noNote || 0);
    const draft = Number(c.draft || 0);
    return { noNote, draft, total: noNote + draft };
  }
  return { noNote: 0, draft: 0, total: 0 };
});

const chronologicalPeriods = computed(() => {
  const copy = [...(periods.value || [])];
  copy.sort((a, b) => {
    const da = new Date(a.period_start || a.period_end || 0).getTime();
    const db = new Date(b.period_start || b.period_end || 0).getTime();
    return da - db;
  });
  return copy;
});

const twoPeriodsAgo = computed(() => {
  if (!expandedId.value) return null;
  const list = chronologicalPeriods.value || [];
  const idx = list.findIndex((p) => p.payroll_period_id === expandedId.value);
  if (idx < 0) return null;
  return list[idx - 2] || null;
});

const twoPeriodsAgoUnpaid = computed(() => {
  const p = twoPeriodsAgo.value;
  const c = p?.unpaidNotesCounts || null;
  if (c && typeof c === 'object') {
    const noNote = Number(c.noNote || 0);
    const draft = Number(c.draft || 0);
    return { noNote, draft, total: noNote + draft };
  }
  return { noNote: 0, draft: 0, total: 0 };
});
const payTypeSummary = computed(() => {
  const b = expanded.value?.breakdown || null;
  const out = {
    rows: []
  };
  if (!b || typeof b !== 'object') return out;

  const lines = Object.entries(b)
    .filter(([code]) => !String(code).startsWith('__'))
    .map(([code, v]) => ({ code, ...(v || {}) }));

  const byKey = new Map();
  for (const l of lines) {
    const category = String(l.category || 'direct');
    const slot = category === 'other' ? Number(l.otherSlot || 1) : null;
    const key = category === 'other' ? `other_${slot || 1}` : category;
    if (!byKey.has(key)) byKey.set(key, { key, category, slot, hours: 0, amount: 0, rateAmounts: [] });
    const agg = byKey.get(key);
    agg.hours += Number(l.hours || 0);
    agg.amount += Number(l.amount || 0);
    if (Number.isFinite(Number(l.rateAmount))) agg.rateAmounts.push(Number(l.rateAmount));
  }

  const labelFor = (key) => {
    if (key === 'direct') return 'Direct';
    if (key === 'indirect') return 'Indirect';
    if (key.startsWith('other_')) return `Other ${key.split('_')[1]}`;
    return key;
  };

  out.rows = Array.from(byKey.values())
    .filter((x) => x.hours > 0 || x.amount > 0)
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .map((x) => {
      const distinctRates = Array.from(new Set((x.rateAmounts || []).map((n) => Number(n.toFixed(4)))));
      let rateLabel = '—';
      if (distinctRates.length === 1) {
        // If rate-card hourly, this will be $/hr; if per-unit, it's still informative alongside service-code details.
        rateLabel = fmtMoney(distinctRates[0]);
      } else if (distinctRates.length > 1) {
        rateLabel = 'Mixed';
      }
      return {
        key: x.key,
        label: labelFor(x.key),
        hours: x.hours,
        amount: x.amount,
        rateLabel
      };
    });

  return out;
});

const payBucketForCategory = (category) => {
  const c = String(category || '').trim().toLowerCase();
  if (c === 'indirect' || c === 'admin' || c === 'meeting') return 'indirect';
  if (c === 'other' || c === 'tutoring') return 'other';
  if (c === 'mileage' || c === 'bonus' || c === 'reimbursement' || c === 'other_pay') return 'flat';
  return 'direct';
};

const splitBreakdownForDisplay = (breakdown) => {
  const out = [];
  if (!breakdown || typeof breakdown !== 'object') return out;
  for (const [code, vRaw] of Object.entries(breakdown)) {
    if (String(code).startsWith('_')) continue;
    const v = vRaw || {};
    const finalizedUnits = Number(v.finalizedUnits ?? v.units ?? 0);
    const oldUnits = Number(v.oldDoneNotesUnits || 0);
    const rateAmount = Number(v.rateAmount || 0);
    const payDivisor = Number(v.payDivisor || 1);
    const safeDiv = Number.isFinite(payDivisor) && payDivisor > 0 ? payDivisor : 1;
    const creditValue = Number(v.creditValue || 0);
    const safeCv = Number.isFinite(creditValue) ? creditValue : 0;
    const bucket = payBucketForCategory(v.category);
    const rateUnit = String(v.rateUnit || '');

    if (!(oldUnits > 1e-9) || rateUnit === 'flat') {
      out.push({ code, ...v });
      continue;
    }

    const baseUnits = Math.max(0, finalizedUnits - oldUnits);
    const oldPayHours = bucket !== 'flat' ? (oldUnits / safeDiv) : 0;
    const oldCredits = oldUnits * safeCv;
    const computedOldAmount = bucket !== 'flat' ? (oldPayHours * rateAmount) : (oldUnits * rateAmount);
    const totalAmount = Number(v.amount || 0);
    const oldAmount = Math.max(0, Math.min(totalAmount, computedOldAmount));
    const baseAmount = Math.max(0, totalAmount - oldAmount);

    if (baseUnits > 1e-9 && baseAmount > 1e-9) {
      out.push({
        code,
        ...v,
        finalizedUnits: baseUnits,
        units: baseUnits,
        hours: baseUnits * safeCv,
        creditsHours: baseUnits * safeCv,
        amount: baseAmount
      });
    }

    if (oldUnits > 1e-9 && oldAmount > 1e-9) {
      out.push({
        code: `${code} (Old Note)`,
        ...v,
        noNoteUnits: 0,
        draftUnits: 0,
        finalizedUnits: oldUnits,
        units: oldUnits,
        hours: oldCredits,
        creditsHours: oldCredits,
        amount: oldAmount
      });
    }
  }
  return out;
};

const payTotalsFromBreakdown = (breakdown) => {
  const out = { directAmount: 0, indirectAmount: 0, otherAmount: 0, flatAmount: 0 };
  if (!breakdown || typeof breakdown !== 'object') return out;
  for (const [code, v] of Object.entries(breakdown)) {
    if (String(code).startsWith('_')) continue;
    const amt = Number(v?.amount || 0);
    const bucket = v?.bucket ? String(v.bucket).trim().toLowerCase() : payBucketForCategory(v?.category);
    if (bucket === 'indirect') out.indirectAmount += amt;
    else if (bucket === 'other') out.otherAmount += amt;
    else if (bucket === 'flat') out.flatAmount += amt;
    else out.directAmount += amt;
  }
  return out;
};

const expandedServiceLines = computed(() => splitBreakdownForDisplay(expanded.value?.breakdown || null));

const hourlyRateSummary = computed(() => {
  const b = expanded.value?.breakdown || null;
  if (!b || typeof b !== 'object') return { directRate: null, indirectRate: null, effectiveRate: null };

  const sums = { directHours: 0, directAmount: 0, indirectHours: 0, indirectAmount: 0, otherHours: 0 };
  const rateSets = { direct: new Set(), indirect: new Set() };
  for (const [code, v] of Object.entries(b)) {
    if (String(code).startsWith('_')) continue;
    const category = String(v?.category || 'direct').trim().toLowerCase();
    const bucket = v?.bucket
      ? String(v.bucket).trim().toLowerCase()
      : ((category === 'indirect' || category === 'admin' || category === 'meeting') ? 'indirect'
        : (category === 'other' || category === 'tutoring') ? 'other'
          : (category === 'mileage' || category === 'bonus' || category === 'reimbursement' || category === 'other_pay') ? 'flat'
            : 'direct');
    const hours = Number(v?.hours || 0);
    const amount = Number(v?.amount || 0);
    const rateAmount = Number(v?.rateAmount || 0);
    if (bucket === 'indirect') { sums.indirectHours += hours; sums.indirectAmount += amount; }
    else if (bucket === 'other') { sums.otherHours += hours; }
    else if (bucket === 'direct') { sums.directHours += hours; sums.directAmount += amount; }

    // Track unique per-code rates to detect varying rates in a direct+indirect setup.
    if (hours > 1e-9 && rateAmount > 1e-9 && (bucket === 'direct' || bucket === 'indirect')) {
      // Round to 4 decimals to avoid tiny float diffs.
      rateSets[bucket].add(Math.round(rateAmount * 10000) / 10000);
    }
  }

  const directRate = sums.directHours > 1e-9 ? (sums.directAmount / sums.directHours) : null;
  const indirectRate = sums.indirectHours > 1e-9 ? (sums.indirectAmount / sums.indirectHours) : null;

  // Effective rate only when the period is direct-only (no indirect/other credits).
  const totalHours = Number(expanded.value?.total_hours || 0);
  const effectiveRate =
    (sums.directHours > 1e-9 && sums.indirectHours <= 1e-9 && sums.otherHours <= 1e-9 && totalHours > 1e-9)
      ? (sums.directAmount / totalHours)
      : null;

  const hasDirectAndIndirect = sums.directHours > 1e-9 && sums.indirectHours > 1e-9;
  const hasVaryingRates = (rateSets.direct.size > 1) || (rateSets.indirect.size > 1);
  const variableRatesNote =
    hasDirectAndIndirect && hasVaryingRates
      ? 'Your default direct and indirect hourly rates are used for most services. Some service codes may have specific contracted rates (often higher than the defaults) and those rates take precedence; services without a specific rate use the defaults. When services are paid at varying rates, your average hourly pay for the period can change—this is due to a limitation of our payroll system.'
      : '';

  return { directRate, indirectRate, effectiveRate, variableRatesNote };
});

const periodShadeClass = (idx) => (Number(idx || 0) % 2 === 0 ? 'shade-a' : 'shade-b');
const sortOrder = ref('desc');
const showCount = ref(50);
const periodSearch = ref('');

const sortedPeriods = computed(() => {
  const copy = [...(periods.value || [])];
  const dir = sortOrder.value === 'asc' ? 1 : -1;
  copy.sort((a, b) => {
    const da = new Date(a.period_start || a.period_end || 0).getTime();
    const db = new Date(b.period_start || b.period_end || 0).getTime();
    return (da - db) * dir;
  });
  return copy;
});

const todayYmd = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const isFuturePeriod = (p) => {
  const start = String(p?.period_start || '').slice(0, 10);
  return start && start > todayYmd();
};

const historyPeriods = computed(() => {
  const all = sortedPeriods.value || [];
  const pastOrCurrent = all.filter((p) => !isFuturePeriod(p));

  // Optionally show *one* upcoming (nearest future) period for context.
  const nextFuture = all
    .filter((p) => isFuturePeriod(p))
    .sort((a, b) => String(a.period_start || '').localeCompare(String(b.period_start || '')))
    .slice(0, 1);

  return [...pastOrCurrent, ...nextFuture];
});

const filteredHistoryPeriods = computed(() => {
  const all = historyPeriods.value || [];
  const q = String(periodSearch.value || '').trim().toLowerCase();
  if (!q) return all;
  return all.filter((p) => {
    const title = String(fmtPeriodTitle(p) || '').toLowerCase();
    const range = String(fmtDateRange(p?.period_start, p?.period_end) || '').toLowerCase();
    const status = String(p?.status || '').toLowerCase();
    const tier = String(p?.breakdown?.__tier?.label || '').toLowerCase();
    const amount = String(p?.total_amount ?? '').toLowerCase();
    const credits = String(p?.tier_credits_final ?? p?.tier_credits_current ?? '').toLowerCase();
    return (
      title.includes(q) ||
      range.includes(q) ||
      status.includes(q) ||
      tier.includes(q) ||
      amount.includes(q) ||
      credits.includes(q)
    );
  });
});

const visiblePeriods = computed(() => filteredHistoryPeriods.value.slice(0, Number(showCount.value) || 50));

const fmtMoney = (v) => Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const parseYmd = (d) => {
  if (!d) return null;
  // Accept 'YYYY-MM-DD' or ISO strings.
  const s = String(d);
  const ymd = s.slice(0, 10);
  const dt = new Date(ymd);
  return Number.isNaN(dt.getTime()) ? null : dt;
};
const fmtShortDate = (d) => {
  const dt = parseYmd(d);
  if (!dt) return String(d || '');
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const fmtDateRange = (start, end) => {
  const s = fmtShortDate(start);
  const e = fmtShortDate(end);
  return s && e ? `${s} → ${e}` : (s || e || '');
};
const fmtPeriodTitle = (p) => {
  // Prefer label if it looks human; otherwise format from dates.
  const raw = String(p?.label || '').trim();
  if (raw && !raw.includes('T00:00:00')) return raw;
  return fmtDateRange(p?.period_start, p?.period_end) || 'Pay Period';
};

const mileageRates = ref({ byTier: new Map() });
const mileageRateForTier = (tierLevel) => {
  const t = Number(tierLevel || 0);
  if (!t) return 0;
  return Number(mileageRates.value.byTier.get(t) || 0);
};

/** Rate for Other mileage: tier 3 or IRS national standard (cents → dollars). */
const NATIONAL_STANDARD_RATE_PER_MILE = 0.725;
const rateForOtherMileage = () => {
  const tier3 = Number(mileageRates.value.byTier.get(3) || 0);
  return tier3 > 0 ? tier3 : NATIONAL_STANDARD_RATE_PER_MILE;
};

const loadMyMileageRates = async () => {
  if (!agencyId.value) return;
  try {
    const resp = await api.get('/payroll/me/mileage-rates', { params: { agencyId: agencyId.value } });
    const rows = resp.data?.rates || [];
    const m = new Map();
    for (const r of rows) m.set(Number(r.tierLevel), Number(r.ratePerMile || 0));
    mileageRates.value = { byTier: m };
  } catch {
    mileageRates.value = { byTier: new Map() };
  }
};

const ytdTotals = computed(() => {
  const exp = expanded.value;
  if (!exp) return null;
  const end = String(exp.period_end || '').slice(0, 10);
  const year = String(end || exp.period_start || '').slice(0, 4);
  if (!year || year.length !== 4) return null;

  const rows = (periods.value || []).filter((p) => {
    const pe = String(p.period_end || '').slice(0, 10);
    return pe && pe.slice(0, 4) === year && (!end || pe <= end);
  });
  const totalPay = rows.reduce((a, p) => a + Number(p.total_amount || 0), 0);
  const totalHours = rows.reduce((a, p) => a + Number(p.total_hours || 0), 0);
  return { year, totalPay, totalHours };
});

const pickDefaultMileageOfficeId = () => {
  const assigned = Array.isArray(mileageAssignedOffices.value) ? mileageAssignedOffices.value : [];
  if (assigned.length) {
    const primary = assigned.find((o) => Boolean(o?.isPrimary || o?.is_primary || o?.isPrimaryAssigned));
    return Number(primary?.id || assigned[0]?.id || 0) || null;
  }
  const all = Array.isArray(mileageOffices.value) ? mileageOffices.value : [];
  if (!all.length) return null;
  const preferred = all.find((o) => Boolean(o?.isPrimaryAssigned));
  return Number(preferred?.id || all[0]?.id || 0) || null;
};

const openMileageModal = async (claimType = 'school_travel') => {
  submitMileageError.value = '';
  schoolTravelManualMilesMode.value = false;
  schoolTravelManualMilesReason.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  mileageForm.value = {
    claimType: String(claimType || 'school_travel'),
    driveDate: ymd,
    schoolOrganizationId: null,
    officeLocationId: null,
    tierLevel: null,
    miles: mileageForm.value?.miles || '',
    roundTrip: false,
    startLocation: '',
    endLocation: '',
    notes: '',
    tripApprovedBy: '',
    tripPreapproved: null,
    tripPurpose: '',
    costCenter: '',
    attestation: false,
    homeStreetAddress: mileageForm.value?.homeStreetAddress || '',
    homeCity: mileageForm.value?.homeCity || '',
    homeState: mileageForm.value?.homeState || '',
    homePostalCode: mileageForm.value?.homePostalCode || ''
  };
  // Show modal immediately so user sees it; load data in background.
  showMileageModal.value = true;
  try {
    if (agencyId.value) {
      await Promise.all([loadMileageSchools(), loadMileageOffices(), loadMileageAssignedOffices(), loadMyHomeAddress()]);
    } else {
      await loadMyHomeAddress();
    }
    if (mileageForm.value.claimType === 'school_travel') {
      mileageForm.value.officeLocationId = pickDefaultMileageOfficeId();
      const schools = mileageSchools.value || [];
      if (schools.length === 1 && !mileageForm.value.schoolOrganizationId) {
        mileageForm.value.schoolOrganizationId = Number(schools[0]?.schoolOrganizationId) || null;
      }
    }
    editingHomeAddress.value = mileageForm.value.claimType === 'school_travel' ? !hasHomeAddress.value : false;
  } catch (e) {
    submitMileageError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load form data.';
  }
};

const openEditMileageClaim = async (c) => {
  if (!c?.id) return;
  submitMileageError.value = '';
  // Ensure dropdown data is loaded so the modal can render selected values.
  await loadMileageSchools();
  await loadMileageOffices();
  await loadMyHomeAddress();

  const claimType = String(c.claim_type || '').toLowerCase() === 'school_travel' ? 'school_travel' : 'standard';
  await openMileageModal(claimType);

  // Default to manual miles for edits (avoids hard-blocks if auto distance is unavailable).
  if (claimType === 'school_travel') {
    schoolTravelManualMilesMode.value = true;
    schoolTravelManualMilesReason.value = 'Editing an existing submission uses manual miles.';
  }

  mileageForm.value = {
    ...mileageForm.value,
    claimType,
    driveDate: String(c.drive_date || '').slice(0, 10),
    schoolOrganizationId: c.school_organization_id ? Number(c.school_organization_id) : null,
    officeLocationId: c.office_location_id ? Number(c.office_location_id) : null,
    tierLevel: c.tier_level === null || c.tier_level === undefined ? null : Number(c.tier_level),
    miles: String((c.miles ?? c.eligible_miles ?? '') || ''),
    roundTrip: !!c.round_trip,
    startLocation: String(c.start_location || ''),
    endLocation: String(c.end_location || ''),
    notes: String(c.notes || ''),
    tripApprovedBy: String(c.trip_approved_by || ''),
    tripPreapproved:
      c.trip_preapproved === null || c.trip_preapproved === undefined
        ? null
        : (Number(c.trip_preapproved) === 1 || c.trip_preapproved === true),
    tripPurpose: String(c.trip_purpose || ''),
    costCenter: String(c.cost_center || ''),
    attestation: false
  };
};

const switchToSchoolMileage = async () => {
  const keepDate = mileageForm.value.driveDate;
  await openMileageModal('school_travel');
  if (keepDate) mileageForm.value.driveDate = keepDate;
};

const closeMileageModal = () => {
  showMileageModal.value = false;
  editingHomeAddress.value = false;
  schoolTravelManualMilesMode.value = false;
  schoolTravelManualMilesReason.value = '';
  emit('mileage-modal-closed');
};

const loadMileageClaims = async () => {
  if (!agencyId.value) return;
  try {
    mileageClaimsLoading.value = true;
    mileageClaimsError.value = '';
    await loadMyMileageRates();
    const resp = await api.get('/payroll/me/mileage-claims', { params: { agencyId: agencyId.value } });
    mileageClaims.value = resp.data || [];
  } catch (e) {
    mileageClaimsError.value = e.response?.data?.error?.message || e.message || 'Failed to load mileage submissions';
    mileageClaims.value = [];
  } finally {
    mileageClaimsLoading.value = false;
  }
};

const loadMileageSchools = async () => {
  if (!agencyId.value) return;
  try {
    const resp = await api.get('/payroll/me/assigned-schools', { params: { agencyId: agencyId.value } });
    mileageSchools.value = resp.data || [];
  } catch {
    mileageSchools.value = [];
  }
};

const loadMileageOffices = async () => {
  if (!agencyId.value) return;
  try {
    const resp = await api.get('/payroll/office-locations', { params: { agencyId: agencyId.value } });
    mileageOffices.value = resp.data || [];
  } catch {
    mileageOffices.value = [];
  }
};

const loadMileageAssignedOffices = async () => {
  if (!agencyId.value) return;
  try {
    const resp = await api.get('/payroll/me/assigned-offices', { params: { agencyId: agencyId.value } });
    mileageAssignedOffices.value = resp.data || [];
  } catch {
    mileageAssignedOffices.value = [];
  }
};

const loadMyHomeAddress = async () => {
  try {
    const resp = await api.get('/payroll/me/home-address');
    const d = resp.data || {};
    mileageForm.value.homeStreetAddress = d.homeStreetAddress || '';
    mileageForm.value.homeCity = d.homeCity || '';
    mileageForm.value.homeState = d.homeState || '';
    mileageForm.value.homePostalCode = d.homePostalCode || '';

    lastLoadedHomeAddress.value = {
      homeStreetAddress: mileageForm.value.homeStreetAddress || '',
      homeCity: mileageForm.value.homeCity || '',
      homeState: mileageForm.value.homeState || '',
      homePostalCode: mileageForm.value.homePostalCode || ''
    };

    // If none on file, default to editing so user can enter+save immediately.
    if (mileageForm.value.claimType === 'school_travel') {
      editingHomeAddress.value = !hasHomeAddress.value;
    }
  } catch {
    // Best-effort.
  }
};

const hasHomeAddress = computed(() => {
  const s = String(mileageForm.value.homeStreetAddress || '').trim();
  const c = String(mileageForm.value.homeCity || '').trim();
  const st = String(mileageForm.value.homeState || '').trim();
  const z = String(mileageForm.value.homePostalCode || '').trim();
  return Boolean(s && c && st && z);
});

const cancelHomeAddressEdit = () => {
  mileageForm.value.homeStreetAddress = lastLoadedHomeAddress.value.homeStreetAddress || '';
  mileageForm.value.homeCity = lastLoadedHomeAddress.value.homeCity || '';
  mileageForm.value.homeState = lastLoadedHomeAddress.value.homeState || '';
  mileageForm.value.homePostalCode = lastLoadedHomeAddress.value.homePostalCode || '';
  editingHomeAddress.value = false;
};

const saveHomeAddress = async () => {
  try {
    savingHomeAddress.value = true;
    await api.put('/payroll/me/home-address', {
      homeStreetAddress: mileageForm.value.homeStreetAddress,
      homeCity: mileageForm.value.homeCity,
      homeState: mileageForm.value.homeState,
      homePostalCode: mileageForm.value.homePostalCode
    });

    lastLoadedHomeAddress.value = {
      homeStreetAddress: mileageForm.value.homeStreetAddress || '',
      homeCity: mileageForm.value.homeCity || '',
      homeState: mileageForm.value.homeState || '',
      homePostalCode: mileageForm.value.homePostalCode || ''
    };
    editingHomeAddress.value = false;
  } catch (e) {
    submitMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to save home address';
  } finally {
    savingHomeAddress.value = false;
  }
};

const submitMileage = async () => {
  if (!agencyId.value) return;
  try {
    submittingMileage.value = true;
    submitMileageError.value = '';
    if (mileageForm.value.claimType !== 'school_travel') {
      if (!String(mileageForm.value.tripApprovedBy || '').trim()) {
        submitMileageError.value = 'Trip approver is required for Other Mileage.';
        return;
      }
      if (mileageForm.value.tripPreapproved !== true && mileageForm.value.tripPreapproved !== false) {
        submitMileageError.value = 'Please select whether the trip was pre-approved.';
        return;
      }
      if (!String(mileageForm.value.tripPurpose || '').trim()) {
        submitMileageError.value = 'Trip purpose is required for Other Mileage.';
        return;
      }
    }
    if (mileageForm.value.claimType === 'school_travel') {
      if (!mileageForm.value.schoolOrganizationId) {
        submitMileageError.value = 'Choose a school.';
        return;
      }
      if (!schoolTravelManualMilesMode.value && !hasHomeAddress.value) {
        submitMileageError.value = 'Home address is required for School Mileage. Click “Enter home address” and save it first.';
        return;
      }
      if (schoolTravelManualMilesMode.value) {
        const n = Number(mileageForm.value.miles);
        if (!Number.isFinite(n) || n < 0) {
          submitMileageError.value = 'Enter a non-negative number of miles.';
          return;
        }
      }
    }
    const resp = await api.post('/payroll/me/mileage-claims', {
      agencyId: agencyId.value,
      claimType: mileageForm.value.claimType || 'school_travel',
      driveDate: mileageForm.value.driveDate,
      schoolOrganizationId: mileageForm.value.schoolOrganizationId,
      officeLocationId: mileageForm.value.officeLocationId,
      tierLevel: mileageForm.value.tierLevel,
      miles: mileageForm.value.miles,
      roundTrip: !!mileageForm.value.roundTrip,
      startLocation: mileageForm.value.startLocation,
      endLocation: mileageForm.value.endLocation,
      notes: mileageForm.value.notes,
      tripApprovedBy: mileageForm.value.tripApprovedBy,
      tripPreapproved: mileageForm.value.tripPreapproved,
      tripPurpose: mileageForm.value.tripPurpose,
      costCenter: mileageForm.value.costCenter,
      attestation: !!mileageForm.value.attestation
    });
    emit('mileage-submitted');
    closeMileageModal();
    const warn = resp?.data?.submissionWarning ? String(resp.data.submissionWarning) : '';
    submitSuccess.value = warn
      ? `Mileage submission sent. Note: ${warn}`
      : 'Mileage submission sent successfully. Payroll will review and approve it before it is added to a pay period.';
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
    await loadMileageClaims();
  } catch (e) {
    let msg = e.response?.data?.error?.message;
    // Some proxies mislabel error bodies, leaving axios with a raw string instead of JSON.
    if (!msg && typeof e.response?.data === 'string') {
      const raw = String(e.response.data || '').trim();
      try {
        msg = JSON.parse(raw)?.error?.message || null;
      } catch {
        msg = raw ? raw.slice(0, 400) : null;
      }
    }
    msg = msg || e.message || 'Failed to submit mileage';
    const s = String(msg || '');
    // If auto mileage isn't available, switch into manual miles mode without closing the modal.
    // Backend uses 409s for business-rule blocks like missing addresses or missing Maps key.
    if (
      s.includes('GOOGLE_MAPS_API_KEY') ||
      s.includes('School address is not configured') ||
      s.includes('Office address is not configured') ||
      s.includes('Home address is required') ||
      s.includes('Failed to compute distance') ||
      s.includes('Distance lookup failed')
    ) {
      schoolTravelManualMilesMode.value = true;
      schoolTravelManualMilesReason.value = s;
      submitMileageError.value = 'Automatic mileage is unavailable. Enter eligible miles manually below and resubmit.';
      return;
    }
    submitMileageError.value = msg;
  } finally {
    submittingMileage.value = false;
  }
};

const openMedcancelModal = () => {
  submitMedcancelError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  medcancelForm.value = {
    claimDate: ymd,
    schoolOrganizationId: null,
    items: [{ missedServiceCode: '90832', clientInitials: '', sessionTime: '', note: '', attestation: false }]
  };
  showMedcancelModal.value = true;
};

const openEditMedcancelClaim = async (c) => {
  if (!c?.id) return;
  submitMedcancelError.value = '';
  await loadMileageSchools();
  const items = Array.isArray(c.items) ? c.items : [];
  medcancelForm.value = {
    claimDate: dateYmd(c.claim_date),
    schoolOrganizationId: c.school_organization_id ? Number(c.school_organization_id) : null,
    items: (items.length ? items : [{}]).map((it) => ({
      missedServiceCode: String(it?.missed_service_code || it?.missedServiceCode || '90832'),
      clientInitials: String(it?.client_initials || it?.clientInitials || ''),
      sessionTime: String(it?.session_time || it?.sessionTime || ''),
      note: String(it?.note || ''),
      attestation: false
    }))
  };
  showMedcancelModal.value = true;
};

const closeMedcancelModal = () => {
  showMedcancelModal.value = false;
  emit('medcancel-modal-closed');
};

const receiptUrl = (c) => {
  const raw = String(c?.receipt_file_path || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/uploads/${raw.substring('uploads/'.length)}`;
  return `/uploads/${raw}`;
};

const openReimbursementModal = () => {
  submitReimbursementError.value = '';
  editingReimbursementClaimId.value = null;
  editingReimbursementExistingReceiptPath.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  reimbursementForm.value = {
    expenseDate: ymd,
    amount: '',
    paymentMethod: null,
    vendor: '',
    purchaseApprovedBy: '',
    purchasePreapproved: null,
    projectRef: '',
    reason: '',
    splits: [{ category: '', amount: '' }],
    notes: '',
    attestation: false,
    receiptFile: null,
    receiptName: ''
  };
  showReimbursementModal.value = true;
};

const openEditReimbursementModal = (c) => {
  if (!c?.id) return;
  submitReimbursementError.value = '';
  editingReimbursementClaimId.value = Number(c.id);
  editingReimbursementExistingReceiptPath.value = String(c.receipt_file_path || '').trim();
  let splits = [{ category: '', amount: '' }];
  try {
    const raw = c.splits_json || c.splitsJson || c.splits || null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : null);
    if (Array.isArray(parsed) && parsed.length) {
      splits = parsed.map((s) => ({ category: String(s?.category || ''), amount: String(s?.amount ?? '') }));
    }
  } catch {
    splits = [{ category: '', amount: '' }];
  }
  reimbursementForm.value = {
    expenseDate: String(c.expense_date || '').slice(0, 10),
    amount: String(c.amount ?? ''),
    paymentMethod: c.payment_method || null,
    vendor: c.vendor || '',
    purchaseApprovedBy: c.purchase_approved_by || '',
    purchasePreapproved:
      c.purchase_preapproved === null || c.purchase_preapproved === undefined
        ? null
        : (Number(c.purchase_preapproved) === 1 || c.purchase_preapproved === true),
    projectRef: c.project_ref || '',
    reason: c.reason || '',
    splits,
    notes: c.notes || '',
    attestation: false,
    receiptFile: null,
    receiptName: ''
  };
  showReimbursementModal.value = true;
};

const closeReimbursementModal = () => {
  showReimbursementModal.value = false;
  editingReimbursementClaimId.value = null;
  editingReimbursementExistingReceiptPath.value = '';
  emit('reimbursement-modal-closed');
};

const onReceiptPick = (e) => {
  const file = e?.target?.files?.[0] || null;
  reimbursementForm.value.receiptFile = file;
  reimbursementForm.value.receiptName = file?.name || '';
};

const openCompanyCardExpenseModal = () => {
  submitCompanyCardExpenseError.value = '';
  editingCompanyCardExpenseId.value = null;
  editingCompanyCardExistingReceiptPath.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  companyCardExpenseForm.value = {
    expenseDate: ymd,
    amount: '',
    paymentMethod: 'company_card',
    vendor: '',
    supervisorName: '',
    projectRef: '',
    splits: [{ category: '', amount: '' }],
    purpose: '',
    notes: '',
    attestation: false,
    receiptFile: null,
    receiptName: ''
  };
  showCompanyCardExpenseModal.value = true;
};

const openEditCompanyCardExpenseModal = (c) => {
  if (!c?.id) return;
  submitCompanyCardExpenseError.value = '';
  editingCompanyCardExpenseId.value = Number(c.id);
  editingCompanyCardExistingReceiptPath.value = String(c.receipt_file_path || '').trim();
  let splits = [{ category: '', amount: '' }];
  try {
    const raw = c.splits_json || c.splitsJson || c.splits || null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : null);
    if (Array.isArray(parsed) && parsed.length) {
      splits = parsed.map((s) => ({ category: String(s?.category || ''), amount: String(s?.amount ?? '') }));
    }
  } catch {
    splits = [{ category: '', amount: '' }];
  }
  companyCardExpenseForm.value = {
    expenseDate: String(c.expense_date || '').slice(0, 10),
    amount: String(c.amount ?? ''),
    paymentMethod: 'company_card',
    vendor: c.vendor || '',
    supervisorName: c.supervisor_name || '',
    projectRef: c.project_ref || '',
    splits,
    purpose: c.purpose || '',
    notes: c.notes || '',
    attestation: false,
    receiptFile: null,
    receiptName: ''
  };
  showCompanyCardExpenseModal.value = true;
};

const closeCompanyCardExpenseModal = () => {
  showCompanyCardExpenseModal.value = false;
  editingCompanyCardExpenseId.value = null;
  editingCompanyCardExistingReceiptPath.value = '';
  emit('company-card-modal-closed');
};

const onCompanyCardReceiptPick = (e) => {
  const file = e?.target?.files?.[0] || null;
  companyCardExpenseForm.value.receiptFile = file;
  companyCardExpenseForm.value.receiptName = file?.name || '';
};

const loadReimbursementClaims = async () => {
  if (!agencyId.value) return;
  try {
    reimbursementClaimsLoading.value = true;
    reimbursementClaimsError.value = '';
    const resp = await api.get('/payroll/me/reimbursement-claims', { params: { agencyId: agencyId.value } });
    reimbursementClaims.value = resp.data || [];
  } catch (e) {
    reimbursementClaimsError.value = e.response?.data?.error?.message || e.message || 'Failed to load reimbursements';
    reimbursementClaims.value = [];
  } finally {
    reimbursementClaimsLoading.value = false;
  }
};

const loadCompanyCardExpenses = async () => {
  if (!agencyId.value) return;
  if (!authStore.user?.companyCardEnabled) return;
  try {
    companyCardExpensesLoading.value = true;
    companyCardExpensesError.value = '';
    const resp = await api.get('/payroll/me/company-card-expenses', { params: { agencyId: agencyId.value } });
    companyCardExpenses.value = resp.data || [];
  } catch (e) {
    companyCardExpensesError.value = e.response?.data?.error?.message || e.message || 'Failed to load company card expenses';
    companyCardExpenses.value = [];
  } finally {
    companyCardExpensesLoading.value = false;
  }
};

const submitReimbursement = async () => {
  if (!agencyId.value) return;
  try {
    submittingReimbursement.value = true;
    submitReimbursementError.value = '';

    const expenseDate = String(reimbursementForm.value.expenseDate || '').slice(0, 10);
    const amount = Number(reimbursementForm.value.amount || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      submitReimbursementError.value = 'Expense date is required.';
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      submitReimbursementError.value = 'Amount must be greater than 0.';
      return;
    }
    if (!String(reimbursementForm.value.paymentMethod || '').trim()) {
      submitReimbursementError.value = 'Payment method is required.';
      return;
    }
    if (!String(reimbursementForm.value.purchaseApprovedBy || '').trim()) {
      submitReimbursementError.value = 'Who approved this purchase is required.';
      return;
    }
    if (reimbursementForm.value.purchasePreapproved !== true && reimbursementForm.value.purchasePreapproved !== false) {
      submitReimbursementError.value = 'Please select whether the purchase was pre-approved.';
      return;
    }
    if (!String(reimbursementForm.value.reason || '').trim()) {
      submitReimbursementError.value = 'Reason is required.';
      return;
    }
    if (!String(reimbursementForm.value.notes || '').trim()) {
      submitReimbursementError.value = 'Notes are required.';
      return;
    }
    const hasExistingReceipt = !!String(editingReimbursementExistingReceiptPath.value || '').trim();
    if (!reimbursementForm.value.receiptFile && !(editingReimbursementClaimId.value && hasExistingReceipt)) {
      submitReimbursementError.value = 'Receipt file is required.';
      return;
    }
    if (!reimbursementForm.value.attestation) {
      submitReimbursementError.value = 'Attestation is required.';
      return;
    }

    const rawSplits = Array.isArray(reimbursementForm.value.splits) ? reimbursementForm.value.splits : [];
    const splits = rawSplits
      .map((s) => ({ category: String(s?.category || '').trim(), amount: Number(s?.amount || 0) }))
      .filter((s) => s.category && Number.isFinite(s.amount) && s.amount > 0);
    if (splits.length) {
      const sum = Math.round(splits.reduce((a, s) => a + Number(s.amount || 0), 0) * 100) / 100;
      const amt = Math.round(amount * 100) / 100;
      if (Math.abs(sum - amt) > 0.009) {
        submitReimbursementError.value = `Category splits must add up to ${amt.toFixed(2)}.`;
        return;
      }
    }

    const fd = new FormData();
    fd.append('agencyId', String(agencyId.value));
    fd.append('expenseDate', expenseDate);
    fd.append('amount', String(amount));
    fd.append('paymentMethod', String(reimbursementForm.value.paymentMethod || '').trim());
    if (String(reimbursementForm.value.vendor || '').trim()) fd.append('vendor', String(reimbursementForm.value.vendor || '').trim());
    fd.append('purchaseApprovedBy', String(reimbursementForm.value.purchaseApprovedBy || '').trim());
    fd.append('purchasePreapproved', reimbursementForm.value.purchasePreapproved ? '1' : '0');
    if (String(reimbursementForm.value.projectRef || '').trim()) fd.append('projectRef', String(reimbursementForm.value.projectRef || '').trim());
    fd.append('reason', String(reimbursementForm.value.reason || '').trim());
    if (splits.length) fd.append('splits', JSON.stringify(splits));
    fd.append('notes', String(reimbursementForm.value.notes || '').trim());
    fd.append('attestation', reimbursementForm.value.attestation ? '1' : '0');
    if (reimbursementForm.value.receiptFile) fd.append('receipt', reimbursementForm.value.receiptFile);

    if (editingReimbursementClaimId.value) {
      await api.put(`/payroll/me/reimbursement-claims/${editingReimbursementClaimId.value}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } else {
      await api.post('/payroll/me/reimbursement-claims', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }

    emit('reimbursement-submitted');
    showReimbursementModal.value = false;
    editingReimbursementClaimId.value = null;
    editingReimbursementExistingReceiptPath.value = '';
    submitSuccess.value = 'Reimbursement submitted successfully. Payroll will review and approve it before it is added to a pay period.';
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
    await loadReimbursementClaims();
  } catch (e) {
    submitReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to submit reimbursement';
  } finally {
    submittingReimbursement.value = false;
  }
};

const submitCompanyCardExpense = async () => {
  if (!agencyId.value) return;
  try {
    submittingCompanyCardExpense.value = true;
    submitCompanyCardExpenseError.value = '';

    const expenseDate = String(companyCardExpenseForm.value.expenseDate || '').slice(0, 10);
    const amount = Number(companyCardExpenseForm.value.amount || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      submitCompanyCardExpenseError.value = 'Expense date is required.';
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      submitCompanyCardExpenseError.value = 'Amount must be greater than 0.';
      return;
    }
    if (!String(companyCardExpenseForm.value.supervisorName || '').trim()) {
      submitCompanyCardExpenseError.value = 'Supervisor / approver is required.';
      return;
    }
    if (!String(companyCardExpenseForm.value.purpose || '').trim()) {
      submitCompanyCardExpenseError.value = 'Reason / purpose is required.';
      return;
    }
    if (!String(companyCardExpenseForm.value.notes || '').trim()) {
      submitCompanyCardExpenseError.value = 'Notes are required.';
      return;
    }
    const hasExistingReceipt = !!String(editingCompanyCardExistingReceiptPath.value || '').trim();
    if (!companyCardExpenseForm.value.receiptFile && !(editingCompanyCardExpenseId.value && hasExistingReceipt)) {
      submitCompanyCardExpenseError.value = 'Receipt file is required.';
      return;
    }
    if (!companyCardExpenseForm.value.attestation) {
      submitCompanyCardExpenseError.value = 'Attestation is required.';
      return;
    }

    const rawSplits = Array.isArray(companyCardExpenseForm.value.splits) ? companyCardExpenseForm.value.splits : [];
    const splits = rawSplits
      .map((s) => ({ category: String(s?.category || '').trim(), amount: Number(s?.amount || 0) }))
      .filter((s) => s.category && Number.isFinite(s.amount) && s.amount > 0);
    if (splits.length) {
      const sum = Math.round(splits.reduce((a, s) => a + Number(s.amount || 0), 0) * 100) / 100;
      const amt = Math.round(amount * 100) / 100;
      if (Math.abs(sum - amt) > 0.009) {
        submitCompanyCardExpenseError.value = `Category splits must add up to ${amt.toFixed(2)}.`;
        return;
      }
    }

    const fd = new FormData();
    fd.append('agencyId', String(agencyId.value));
    fd.append('expenseDate', expenseDate);
    fd.append('amount', String(amount));
    if (String(companyCardExpenseForm.value.vendor || '').trim()) fd.append('vendor', String(companyCardExpenseForm.value.vendor || '').trim());
    fd.append('paymentMethod', 'company_card');
    fd.append('supervisorName', String(companyCardExpenseForm.value.supervisorName || '').trim());
    if (String(companyCardExpenseForm.value.projectRef || '').trim()) fd.append('projectRef', String(companyCardExpenseForm.value.projectRef || '').trim());
    if (splits.length) fd.append('splits', JSON.stringify(splits));
    fd.append('purpose', String(companyCardExpenseForm.value.purpose || '').trim());
    fd.append('notes', String(companyCardExpenseForm.value.notes || '').trim());
    fd.append('attestation', companyCardExpenseForm.value.attestation ? '1' : '0');
    if (companyCardExpenseForm.value.receiptFile) fd.append('receipt', companyCardExpenseForm.value.receiptFile);

    if (editingCompanyCardExpenseId.value) {
      await api.put(`/payroll/me/company-card-expenses/${editingCompanyCardExpenseId.value}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    } else {
      await api.post('/payroll/me/company-card-expenses', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }

    showCompanyCardExpenseModal.value = false;
    editingCompanyCardExpenseId.value = null;
    editingCompanyCardExistingReceiptPath.value = '';
    emit('company-card-submitted');
    submitSuccess.value = 'Company card expense submitted successfully. Admins can review it in payroll submissions.';
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
    await loadCompanyCardExpenses();
  } catch (e) {
    submitCompanyCardExpenseError.value = e.response?.data?.error?.message || e.message || 'Failed to submit company card expense';
  } finally {
    submittingCompanyCardExpense.value = false;
  }
};

const withdrawCompanyCardExpense = async (c) => {
  if (!agencyId.value || !c?.id) return;
  const ok = window.confirm('Withdraw this company card expense submission? You can submit a new one if needed.');
  if (!ok) return;
  try {
    submitCompanyCardExpenseError.value = '';
    await api.delete(`/payroll/me/company-card-expenses/${c.id}`, { params: { agencyId: agencyId.value } });
    await loadCompanyCardExpenses();
  } catch (e) {
    submitCompanyCardExpenseError.value = e.response?.data?.error?.message || e.message || 'Failed to withdraw company card expense';
  }
};

const withdrawReimbursementClaim = async (c) => {
  if (!agencyId.value || !c?.id) return;
  const ok = window.confirm('Withdraw this reimbursement submission? You can submit a new one if needed.');
  if (!ok) return;
  try {
    submitReimbursementError.value = '';
    await api.delete(`/payroll/me/reimbursement-claims/${c.id}`, { params: { agencyId: agencyId.value } });
    await loadReimbursementClaims();
  } catch (e) {
    submitReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to withdraw reimbursement';
  }
};

const loadTimeClaims = async () => {
  if (!agencyId.value) return;
  try {
    timeClaimsLoading.value = true;
    timeClaimsError.value = '';
    const resp = await api.get('/payroll/me/time-claims', { params: { agencyId: agencyId.value } });
    timeClaims.value = resp.data || [];
  } catch (e) {
    timeClaimsError.value = e.response?.data?.error?.message || e.message || 'Failed to load time claims';
    timeClaims.value = [];
  } finally {
    timeClaimsLoading.value = false;
  }
};

const timeClaimTypeLabel = (c) => {
  const t = String(c?.claim_type || '').toLowerCase();
  if (t === 'meeting_training') return 'Meeting/Training';
  if (t === 'mentor_cpa_meeting') return 'Mentor/CPA Meeting';
  if (t === 'excess_holiday') return 'Excess time';
  if (t === 'service_correction') return 'Service correction';
  if (t === 'overtime_evaluation') return 'Overtime eval';
  if (t === 'holiday_pay') return 'Holiday pay';
  return t ? t.replace(/_/g, ' ') : 'Time';
};

const isMeetingTimeClaim = (c) => {
  const t = String(c?.claim_type || '').toLowerCase();
  return t === 'meeting_training' || t === 'mentor_cpa_meeting';
};

const isNoTranscriptAvailableYet = (c) => {
  if (!isMeetingTimeClaim(c)) return false;
  const claimDate = String(c?.claim_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate)) return false;
  const ageMs = Date.now() - new Date(`${claimDate}T00:00:00`).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Number.isFinite(ageMs) && ageMs >= oneDayMs;
};

const submitTimeClaim = async ({ claimType, claimDate, payload }) => {
  if (!agencyId.value) return;
  try {
    submittingTimeClaim.value = true;
    submitTimeClaimError.value = '';
    await api.post('/payroll/me/time-claims', {
      agencyId: agencyId.value,
      claimType,
      claimDate,
      payload
    });
    submitSuccess.value = 'Time claim submitted successfully. Payroll will review and approve it before it is added to a pay period.';
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
    await loadTimeClaims();
  } catch (e) {
    submitTimeClaimError.value = e.response?.data?.error?.message || e.message || 'Failed to submit time claim';
  } finally {
    submittingTimeClaim.value = false;
  }
};

const withdrawTimeClaim = async (c) => {
  if (!agencyId.value || !c?.id) return;
  const ok = window.confirm('Withdraw this time claim? You can submit a new one if needed.');
  if (!ok) return;
  try {
    submitTimeClaimError.value = '';
    await api.delete(`/payroll/me/time-claims/${c.id}`, { params: { agencyId: agencyId.value } });
    await loadTimeClaims();
  } catch (e) {
    submitTimeClaimError.value = e.response?.data?.error?.message || e.message || 'Failed to withdraw time claim';
  }
};

const minutesFromStartEnd = (startTime, endTime) => {
  const s = String(startTime || '').trim();
  const e = String(endTime || '').trim();
  if (!s || !e || !/^\d{1,2}:\d{2}$/.test(s) || !/^\d{1,2}:\d{2}$/.test(e)) return null;
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  const startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins <= startMins) endMins += 24 * 60; // span past midnight
  return endMins - startMins;
};

watch(
  () => [timeMeetingForm.value.startTime, timeMeetingForm.value.endTime],
  ([start, end]) => {
    if (start && end) {
      const mins = minutesFromStartEnd(start, end);
      if (mins != null && mins >= 1) {
        timeMeetingForm.value.totalMinutes = String(mins);
      }
    }
  },
  { deep: true }
);

const openTimeMeetingModal = () => {
  submitTimeClaimError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  timeMeetingForm.value = { ...timeMeetingForm.value, claimDate: ymd, attestation: false };
  showTimeMeetingModal.value = true;
};
const closeTimeMeetingModal = () => {
  showTimeMeetingModal.value = false;
  emit('time-modal-closed');
};

const openTimeExcessModal = () => {
  submitTimeClaimError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  timeExcessForm.value = {
    claimDate: ymd,
    serviceCode: '',
    units: 1,
    actualDirectMinutes: 0,
    actualIndirectMinutes: 0,
    reason: '',
    attestation: false
  };
  showTimeExcessModal.value = true;
  loadExcessRules();
};
const closeTimeExcessModal = () => {
  showTimeExcessModal.value = false;
  emit('time-modal-closed');
};

const openTimeCorrectionModal = () => {
  submitTimeClaimError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  timeCorrectionForm.value = { ...timeCorrectionForm.value, claimDate: ymd, attestation: false };
  showTimeCorrectionModal.value = true;
};
const closeTimeCorrectionModal = () => {
  showTimeCorrectionModal.value = false;
  emit('time-modal-closed');
};

const loadAgencyHolidays = async () => {
  if (!agencyId.value) return;
  try {
    const resp = await api.get('/payroll/me/holidays', { params: { agencyId: agencyId.value } });
    agencyHolidays.value = resp?.data?.holidays || [];
  } catch {
    agencyHolidays.value = [];
  }
};

const openTimeOvertimeModal = () => {
  submitTimeClaimError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  timeOvertimeForm.value = {
    claimDate: ymd,
    workedOver12Hours: false,
    daysHours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
    estimatedWorkweekHours: '',
    allDirectServiceRecorded: true,
    overtimeApproved: false,
    approvedBy: '',
    notesForPayroll: '',
    requestHolidayPay: false,
    holidayDate: '',
    holidayHoursWorked: 0,
    attestation: false
  };
  showTimeOvertimeModal.value = true;
  if (isOfficeStaff.value) loadAgencyHolidays();
};
const closeTimeOvertimeModal = () => {
  showTimeOvertimeModal.value = false;
  emit('time-modal-closed');
};

const openEditTimeClaim = (c) => {
  if (!c?.id) return;
  submitTimeClaimError.value = '';
  const type = String(c.claim_type || '').toLowerCase();
  const payload = c.payload || {};
  if (type === 'meeting_training' || type === 'mentor_cpa_meeting') {
    openTimeMeetingModal();
    timeMeetingForm.value = {
      ...timeMeetingForm.value,
      claimDate: String(c.claim_date || '').slice(0, 10),
      meetingType: (type === 'mentor_cpa_meeting') ? 'Mentor/CPA Individual Meeting' : (payload.meetingType || 'Training'),
      mentorRole: payload.mentorRole || 'intern_mentor',
      otherMeeting: payload.otherMeeting || '',
      startTime: payload.startTime || '',
      endTime: payload.endTime || '',
      totalMinutes: String(payload.totalMinutes ?? ''),
      platform: payload.platform || 'Google Meet',
      summary: payload.summary || '',
      attestation: false
    };
    return;
  }
  if (type === 'excess_holiday') {
    openTimeExcessModal();
    let items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length && (Number((payload.actualDirectMinutes ?? payload.directMinutes) ?? 0) > 0 || Number((payload.actualIndirectMinutes ?? payload.indirectMinutes) ?? 0) > 0)) {
      items = [{
        serviceCode: payload.serviceCode || '',
        units: (payload.units ?? 1),
        actualDirectMinutes: Number((payload.actualDirectMinutes ?? payload.directMinutes) ?? 0),
        actualIndirectMinutes: Number((payload.actualIndirectMinutes ?? payload.indirectMinutes) ?? 0)
      }];
    }
    const it = items[0] || {};
    timeExcessForm.value = {
      claimDate: String(c.claim_date || '').slice(0, 10),
      serviceCode: it.serviceCode || '',
      units: Math.max(1, Number(it.units || 1)),
      actualDirectMinutes: Number((it.actualDirectMinutes ?? it.directMinutes) ?? 0),
      actualIndirectMinutes: Number((it.actualIndirectMinutes ?? it.indirectMinutes) ?? 0),
      reason: payload.reason || '',
      attestation: false
    };
    return;
  }
  if (type === 'service_correction') {
    openTimeCorrectionModal();
    timeCorrectionForm.value = {
      ...timeCorrectionForm.value,
      claimDate: String(c.claim_date || '').slice(0, 10),
      clientInitials: payload.clientInitials || '',
      originalService: payload.originalService || '',
      correctedService: payload.correctedService || '',
      duration: payload.duration || '',
      reason: payload.reason || '',
      attestation: false
    };
    return;
  }
  if (type === 'overtime_evaluation') {
    openTimeOvertimeModal();
    let dh = payload.daysHours || {};
    if (Object.keys(dh).length === 0 && payload.datesAndHours) {
      dh = parseDatesAndHoursToDaysHours(payload.datesAndHours);
    }
    timeOvertimeForm.value = {
      ...timeOvertimeForm.value,
      claimDate: String(c.claim_date || '').slice(0, 10),
      workedOver12Hours: !!payload.workedOver12Hours,
      daysHours: {
        mon: Number(dh.mon) || 0,
        tue: Number(dh.tue) || 0,
        wed: Number(dh.wed) || 0,
        thu: Number(dh.thu) || 0,
        fri: Number(dh.fri) || 0,
        sat: Number(dh.sat) || 0,
        sun: Number(dh.sun) || 0
      },
      estimatedWorkweekHours: String(payload.estimatedWorkweekHours ?? ''),
      allDirectServiceRecorded: payload.allDirectServiceRecorded === undefined ? true : !!payload.allDirectServiceRecorded,
      overtimeApproved: !!payload.overtimeApproved,
      approvedBy: payload.approvedBy || '',
      notesForPayroll: payload.notesForPayroll || '',
      requestHolidayPay: false,
      holidayDate: '',
      holidayHoursWorked: 0,
      attestation: false
    };
    return;
  }
  if (type === 'holiday_pay') {
    openTimeOvertimeModal();
    const hd = String(payload.holidayDate || c.claim_date || '').slice(0, 10);
    timeOvertimeForm.value = {
      ...timeOvertimeForm.value,
      claimDate: hd,
      workedOver12Hours: false,
      daysHours: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 },
      estimatedWorkweekHours: '',
      allDirectServiceRecorded: true,
      overtimeApproved: false,
      approvedBy: '',
      notesForPayroll: '',
      requestHolidayPay: true,
      holidayDate: hd,
      holidayHoursWorked: Number(payload.hoursWorked || 0),
      attestation: false
    };
    return;
  }
  // Fallback: open meeting modal
  openTimeMeetingModal();
};

const submitTimeMeeting = async () => {
  submitTimeClaimError.value = '';
  const f = timeMeetingForm.value;
  let totalMinutes = Number(f.totalMinutes || 0);
  if (totalMinutes < 1 && f.startTime && f.endTime) {
    const computed = minutesFromStartEnd(f.startTime, f.endTime);
    if (computed != null && computed >= 1) totalMinutes = computed;
  }
  const isMentorCpaMeeting = String(f.meetingType || '').trim() === 'Mentor/CPA Individual Meeting';
  await submitTimeClaim({
    claimType: isMentorCpaMeeting ? 'mentor_cpa_meeting' : 'meeting_training',
    claimDate: f.claimDate,
    payload: {
      meetingType: f.meetingType,
      mentorRole: isMentorCpaMeeting ? f.mentorRole : null,
      otherMeeting: f.otherMeeting,
      startTime: f.startTime,
      endTime: f.endTime,
      totalMinutes,
      platform: f.platform,
      summary: f.summary,
      attestation: !!f.attestation
    }
  });
  if (!submitTimeClaimError.value) {
    emit('time-submitted');
    closeTimeMeetingModal();
  }
};

const submitTimeExcess = async () => {
  submitTimeClaimError.value = '';
  const f = timeExcessForm.value;
  await submitTimeClaim({
    claimType: 'excess_holiday',
    claimDate: f.claimDate,
    payload: {
      items: [{
        serviceCode: f.serviceCode,
        units: Math.max(1, Number(f.units || 1)),
        actualDirectMinutes: Number(f.actualDirectMinutes || 0),
        actualIndirectMinutes: Number(f.actualIndirectMinutes || 0)
      }],
      reason: f.reason,
      attestation: !!f.attestation
    }
  });
  if (!submitTimeClaimError.value) {
    emit('time-submitted');
    closeTimeExcessModal();
  }
};

const submitTimeCorrection = async () => {
  submitTimeClaimError.value = '';
  await submitTimeClaim({
    claimType: 'service_correction',
    claimDate: timeCorrectionForm.value.claimDate,
    payload: {
      clientInitials: timeCorrectionForm.value.clientInitials,
      originalService: timeCorrectionForm.value.originalService,
      correctedService: timeCorrectionForm.value.correctedService,
      duration: timeCorrectionForm.value.duration,
      reason: timeCorrectionForm.value.reason,
      attestation: !!timeCorrectionForm.value.attestation
    }
  });
  if (!submitTimeClaimError.value) {
    emit('time-submitted');
    closeTimeCorrectionModal();
  }
};

const submitTimeOvertime = async () => {
  submitTimeClaimError.value = '';
  const f = timeOvertimeForm.value;
  const datesAndHoursStr = serializeDaysHoursToDatesAndHours(f.claimDate, f.daysHours);
  if (!datesAndHoursStr.trim()) {
    submitTimeClaimError.value = 'Please enter a valid reference date and hours for each day.';
    return;
  }
  await submitTimeClaim({
    claimType: 'overtime_evaluation',
    claimDate: f.claimDate,
    payload: {
      workedOver12Hours: !!f.workedOver12Hours,
      datesAndHours: datesAndHoursStr,
      daysHours: f.daysHours,
      estimatedWorkweekHours: Number(f.estimatedWorkweekHours || 0),
      allDirectServiceRecorded: !!f.allDirectServiceRecorded,
      overtimeApproved: !!f.overtimeApproved,
      approvedBy: f.approvedBy,
      notesForPayroll: f.notesForPayroll,
      attestation: !!f.attestation
    }
  });
  if (submitTimeClaimError.value) return;

  if (f.requestHolidayPay && f.holidayDate && Number(f.holidayHoursWorked || 0) > 0) {
    await submitTimeClaim({
      claimType: 'holiday_pay',
      claimDate: String(f.holidayDate).slice(0, 10),
      payload: {
        holidayDate: String(f.holidayDate).slice(0, 10),
        hoursWorked: Number(f.holidayHoursWorked || 0),
        attestation: !!f.attestation
      }
    });
  }

  if (!submitTimeClaimError.value) {
    emit('time-submitted');
    closeTimeOvertimeModal();
  }
};

const loadMedcancelClaims = async () => {
  if (!agencyId.value) return;
  try {
    medcancelClaimsLoading.value = true;
    medcancelClaimsError.value = '';
    const resp = await api.get('/payroll/me/medcancel-claims', { params: { agencyId: agencyId.value } });
    medcancelClaims.value = resp.data || [];
  } catch (e) {
    medcancelClaimsError.value = e.response?.data?.error?.message || e.message || 'Failed to load MedCancel submissions';
    medcancelClaims.value = [];
  } finally {
    medcancelClaimsLoading.value = false;
  }
};

const loadMedcancelPolicy = async () => {
  if (!agencyId.value) return;
  try {
    medcancelPolicyLoading.value = true;
    medcancelPolicyError.value = '';
    const resp = await api.get('/payroll/me/medcancel-policy', { params: { agencyId: agencyId.value } });
    medcancelPolicy.value = resp.data || null;
  } catch (e) {
    medcancelPolicyError.value = e.response?.data?.error?.message || e.message || 'Failed to load MedCancel policy';
    medcancelPolicy.value = null;
  } finally {
    medcancelPolicyLoading.value = false;
  }
};

const loadPto = async () => {
  if (!agencyId.value) return;
  try {
    ptoLoading.value = true;
    ptoError.value = '';
    const resp = await api.get('/payroll/me/pto-balances', { params: { agencyId: agencyId.value } });
    ptoPolicy.value = resp.data?.policy || null;
    ptoDefaultPayRate.value = Number(resp.data?.defaultPayRate || 0);
    ptoAccount.value = resp.data?.account || null;
    ptoBalances.value = {
      sickHours: Number(resp.data?.balances?.sickHours || 0),
      trainingHours: Number(resp.data?.balances?.trainingHours || 0)
    };
  } catch (e) {
    ptoError.value = e.response?.data?.error?.message || e.message || 'Failed to load PTO';
    ptoPolicy.value = null;
    ptoDefaultPayRate.value = 0;
    ptoAccount.value = null;
    ptoBalances.value = { sickHours: 0, trainingHours: 0 };
  } finally {
    ptoLoading.value = false;
  }
};

const loadPtoRequests = async () => {
  if (!agencyId.value) return;
  try {
    ptoRequestsLoading.value = true;
    ptoRequestsError.value = '';
    const resp = await api.get('/payroll/me/pto-requests', { params: { agencyId: agencyId.value } });
    ptoRequests.value = resp.data || [];
  } catch (e) {
    ptoRequestsError.value = e.response?.data?.error?.message || e.message || 'Failed to load PTO requests';
    ptoRequests.value = [];
  } finally {
    ptoRequestsLoading.value = false;
  }
};

const withdrawPtoRequest = async (r) => {
  if (!agencyId.value || !r?.id) return;
  const ok = window.confirm('Withdraw this PTO request? You can submit a new one if needed.');
  if (!ok) return;
  try {
    ptoRequestsError.value = '';
    await api.delete(`/payroll/me/pto-requests/${r.id}`, { params: { agencyId: agencyId.value } });
    await loadPtoRequests();
  } catch (e) {
    ptoRequestsError.value = e.response?.data?.error?.message || e.message || 'Failed to withdraw PTO request';
  }
};

const openPtoChooserModal = async () => {
  submitPtoError.value = '';
  await loadPto();
  showPtoChooser.value = true;
};
const closePtoChooserModal = () => {
  showPtoChooser.value = false;
  emit('pto-modal-closed');
};

const addPtoItem = (formRef) => {
  const next = Array.isArray(formRef.value.items) ? formRef.value.items.slice() : [];
  next.push({ date: '', hours: '' });
  formRef.value.items = next;
};
const removePtoItem = (formRef, idx) => {
  const next = Array.isArray(formRef.value.items) ? formRef.value.items.slice() : [];
  next.splice(idx, 1);
  formRef.value.items = next;
};

const openPtoSick = () => {
  submitPtoError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  ptoSickForm.value = { items: [{ date: ymd, hours: '' }], notes: '', attestation: false };
  showPtoChooser.value = false;
  showPtoSickModal.value = true;
};
const closePtoSick = () => {
  showPtoSickModal.value = false;
  emit('pto-modal-closed');
};

const openPtoTraining = () => {
  submitPtoError.value = '';
  if (ptoPolicy.value?.trainingPtoEnabled !== true) {
    submitPtoError.value = 'Training PTO is disabled for this organization.';
    showPtoChooser.value = false;
    return;
  }
  if (!ptoAccount.value?.training_pto_eligible) {
    submitPtoError.value = 'Training PTO is not enabled for your account.';
    showPtoChooser.value = false;
    return;
  }
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  ptoTrainingForm.value = { items: [{ date: ymd, hours: '' }], description: '', notes: '', proofFile: null, proofName: '', attestation: false };
  showPtoChooser.value = false;
  showPtoTrainingModal.value = true;
};
const closePtoTraining = () => {
  showPtoTrainingModal.value = false;
  emit('pto-modal-closed');
};

const onPtoProofPick = (e) => {
  const file = e?.target?.files?.[0] || null;
  ptoTrainingForm.value.proofFile = file;
  ptoTrainingForm.value.proofName = file?.name || '';
};

const submitPto = async ({ requestType, form }) => {
  if (!agencyId.value) return;
  try {
    submittingPtoRequest.value = true;
    submitPtoError.value = '';

    if (requestType === 'training' && ptoPolicy.value?.trainingPtoEnabled !== true) {
      submitPtoError.value = 'Training PTO is disabled for this organization.';
      return;
    }
    const items = (form.value.items || [])
      .map((it) => ({ date: String(it?.date || '').slice(0, 10), hours: Number(it?.hours || 0) }))
      .filter((it) => /^\d{4}-\d{2}-\d{2}$/.test(it.date) && Number.isFinite(it.hours) && it.hours > 0);

    if (!items.length) {
      submitPtoError.value = 'Add at least one PTO entry (date + hours).';
      return;
    }
    if (!form.value.attestation) {
      submitPtoError.value = 'Attestation is required.';
      return;
    }
    if (requestType === 'training') {
      if (!String(form.value.description || '').trim()) {
        submitPtoError.value = 'Training description is required.';
        return;
      }
      if (!form.value.proofFile) {
        submitPtoError.value = 'Proof upload is required for Training PTO.';
        return;
      }
    }

    const fd = new FormData();
    fd.append('agencyId', String(agencyId.value));
    fd.append('requestType', requestType);
    fd.append('items', JSON.stringify(items));
    if (String(form.value.notes || '').trim()) fd.append('notes', String(form.value.notes || '').trim());
    if (requestType === 'training') {
      fd.append('trainingDescription', String(form.value.description || '').trim());
      fd.append('proof', form.value.proofFile);
    }
    fd.append('policyAck', JSON.stringify({ attested: true }));

    await api.post('/payroll/me/pto-requests', fd, { headers: { 'Content-Type': 'multipart/form-data' } });

    emit('pto-submitted');
    showPtoSickModal.value = false;
    showPtoTrainingModal.value = false;
    submitSuccess.value = 'PTO request submitted successfully. Payroll will review and approve it.';
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
    await Promise.all([loadPto(), loadPtoRequests()]);
  } catch (e) {
    submitPtoError.value = e.response?.data?.error?.message || e.message || 'Failed to submit PTO request';
  } finally {
    submittingPtoRequest.value = false;
  }
};

const submitPtoSick = async () => submitPto({ requestType: 'sick', form: ptoSickForm });
const submitPtoTraining = async () => submitPto({ requestType: 'training', form: ptoTrainingForm });

const addMedcancelItem = () => {
  const next = Array.isArray(medcancelForm.value.items) ? medcancelForm.value.items.slice() : [];
  next.push({ missedServiceCode: '90832', clientInitials: '', sessionTime: '', note: '', attestation: false });
  medcancelForm.value.items = next;
};

const removeMedcancelItem = (idx) => {
  const next = Array.isArray(medcancelForm.value.items) ? medcancelForm.value.items.slice() : [];
  next.splice(idx, 1);
  medcancelForm.value.items = next;
};

const submitMedcancel = async () => {
  if (!agencyId.value) return;
  try {
    submittingMedcancel.value = true;
    submitMedcancelError.value = '';
    const items = Array.isArray(medcancelForm.value.items) ? medcancelForm.value.items : [];
    if (!items.length) {
      submitMedcancelError.value = 'Add at least one missed service.';
      return;
    }
    for (const it of items) {
      if (!String(it.missedServiceCode || '').trim()) {
        submitMedcancelError.value = 'Each missed service requires a code.';
        return;
      }
      if (!String(it.clientInitials || '').trim()) {
        submitMedcancelError.value = 'Each missed service requires client initials.';
        return;
      }
      if (!String(it.sessionTime || '').trim()) {
        submitMedcancelError.value = 'Each missed service requires the session time.';
        return;
      }
      if (!String(it.note || '').trim()) {
        submitMedcancelError.value = 'Each missed service requires a note.';
        return;
      }
      if (!it.attestation) {
        submitMedcancelError.value = 'Each missed service requires attestation.';
        return;
      }
    }
    await api.post('/payroll/me/medcancel-claims', {
      agencyId: agencyId.value,
      claimDate: medcancelForm.value.claimDate,
      schoolOrganizationId: medcancelForm.value.schoolOrganizationId,
      items: items.map((it) => ({
        missedServiceCode: String(it.missedServiceCode || '').trim(),
        clientInitials: String(it.clientInitials || '').trim(),
        sessionTime: String(it.sessionTime || '').trim(),
        note: String(it.note || '').trim(),
        attestation: !!it.attestation
      }))
    });
    emit('medcancel-submitted');
    showMedcancelModal.value = false;
    submitSuccess.value = 'Med Cancel submission sent successfully. Payroll will review and approve it before it is added to a pay period.';
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
    await loadMedcancelClaims();
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Failed to submit MedCancel';
    submitMedcancelError.value = msg;
    const meta = e.response?.data?.error?.meta || null;
    if (meta) {
      // Helpful for debugging pay-period window issues in dev without spamming the UI.
      // eslint-disable-next-line no-console
      console.warn('MedCancel submission window meta:', meta);
    }
  } finally {
    submittingMedcancel.value = false;
  }
};

const withdrawMileageClaim = async (c) => {
  if (!agencyId.value || !c?.id) return;
  const ok = window.confirm('Withdraw this mileage submission? You can submit a new one if needed.');
  if (!ok) return;
  try {
    submitMileageError.value = '';
    await api.delete(`/payroll/me/mileage-claims/${c.id}`, { params: { agencyId: agencyId.value } });
    await loadMileageClaims();
  } catch (e) {
    submitMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to withdraw mileage claim';
  }
};

const withdrawMedcancelClaim = async (c) => {
  if (!agencyId.value || !c?.id) return;
  const ok = window.confirm('Withdraw this Med Cancel submission? You can submit a new one if needed.');
  if (!ok) return;
  try {
    submitMedcancelError.value = '';
    await api.delete(`/payroll/me/medcancel-claims/${c.id}`, { params: { agencyId: agencyId.value } });
    await loadMedcancelClaims();
  } catch (e) {
    submitMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to withdraw Med Cancel claim';
  }
};

const load = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/payroll/me/periods', { params: { agencyId: agencyId.value } });
    periods.value = (resp.data || []).map((p) => {
      if (typeof p.breakdown === 'string') {
        try { p.breakdown = JSON.parse(p.breakdown); } catch { /* ignore */ }
      }
      return p;
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load payroll';
  } finally {
    loading.value = false;
  }
};

const toggle = (id) => {
  expandedId.value = expandedId.value === id ? null : id;
};

watch(agencyId, async () => {
  expandedId.value = null;
  await load();
  await loadMileageClaims();
  await loadMileageSchools();
  await loadMileageOffices();
  await loadMileageAssignedOffices();
  if (authStore.user?.medcancelEnabled && medcancelEnabledForAgency.value) {
    await loadMedcancelPolicy();
    await loadMedcancelClaims();
  } else {
    medcancelClaims.value = [];
    medcancelClaimsError.value = '';
    medcancelPolicy.value = null;
    medcancelPolicyError.value = '';
  }
  await loadPto();
  await loadPtoRequests();
  await loadReimbursementClaims();
  await loadCompanyCardExpenses();
  await loadTimeClaims();
});

watch(
  () => route.query?.submission,
  async (v) => {
    if (!v) return;
    await nextTick();
    const key = String(v || '');
    let opened = false;
    try {
      if (key === 'school_mileage') {
        if (!inSchoolEnabled.value) {
          submitMileageError.value = 'In-School submissions are disabled for this organization.';
          await openMileageModal('school_travel');
          opened = true;
        } else {
          await openMileageModal('school_travel');
          opened = true;
        }
      } else if (key === 'mileage') {
        await openMileageModal('standard');
        opened = true;
      } else if (key === 'medcancel') {
        if (!authStore.user?.medcancelEnabled || !medcancelEnabledForAgency.value) {
          submitMedcancelError.value = 'Med Cancel is disabled for this organization.';
          return;
        }
        openMedcancelModal();
        opened = true;
      } else if (key === 'reimbursement') {
        openReimbursementModal();
        opened = true;
      } else if (key === 'company_card_expense') {
        openCompanyCardExpenseModal();
        opened = true;
      } else if (key === 'time_meeting_training') {
        openTimeMeetingModal();
        opened = true;
      } else if (key === 'time_excess_holiday') {
        openTimeExcessModal();
        opened = true;
      } else if (key === 'time_service_correction') {
        openTimeCorrectionModal();
        opened = true;
      } else if (key === 'time_overtime_evaluation') {
        openTimeOvertimeModal();
        opened = true;
      } else if (key === 'pto') {
        await openPtoChooserModal();
        opened = true;
      }
    } catch (e) {
      console.error('[MyPayrollTab] submission modal error:', e);
      submitMileageError.value = submitMileageError.value || (e?.message || 'Failed to open form.');
      if (key === 'school_mileage' || key === 'mileage') opened = true;
    } finally {
      if (opened) {
        const next = { ...route.query };
        delete next.submission;
        router.replace({ query: next });
      }
    }
  },
  { immediate: true }
);

onMounted(async () => {
  await loadMyHomeAddress();
  await load();
  await loadMileageSchools();
  await loadMileageClaims();
  await loadMileageAssignedOffices();
  if (authStore.user?.medcancelEnabled && medcancelEnabledForAgency.value) {
    await loadMedcancelPolicy();
    await loadMedcancelClaims();
  }
  await loadPto();
  await loadPtoRequests();
  await loadReimbursementClaims();
  await loadCompanyCardExpenses();
  await loadTimeClaims();

  // Open mileage modal immediately when mounted from Submit panel (no navigation).
  if (props.openMileageOnMount) {
    await nextTick();
    const claimType = props.openMileageOnMount === 'standard' ? 'standard' : 'school_travel';
    if (claimType === 'school_travel' && !inSchoolEnabled.value) {
      submitMileageError.value = 'In-School submissions are disabled for this organization.';
    }
    await openMileageModal(claimType);
  }
  // Open reimbursement modal immediately when mounted from Submit panel (no navigation).
  if (props.openReimbursementOnMount) {
    await nextTick();
    openReimbursementModal();
  }
  // Open medcancel modal immediately when mounted from Submit panel (no navigation).
  if (props.openMedcancelOnMount) {
    await nextTick();
    openMedcancelModal();
  }
  // Open PTO chooser modal immediately when mounted from Submit panel (no navigation).
  if (props.openPtoOnMount) {
    await nextTick();
    await openPtoChooserModal();
  }
  // Open company card expense modal immediately when mounted from Submit panel (no navigation).
  if (props.openCompanyCardOnMount) {
    await nextTick();
    openCompanyCardExpenseModal();
  }
  // Open time claim modal immediately when mounted from Submit panel (no navigation).
  if (props.openTimeOnMount) {
    await nextTick();
    const t = String(props.openTimeOnMount || '').toLowerCase();
    if (t === 'meeting') openTimeMeetingModal();
    else if (t === 'excess') openTimeExcessModal();
    else if (t === 'correction') openTimeCorrectionModal();
    else if (t === 'overtime') openTimeOvertimeModal();
  }

  // Fallback: if submission param is in URL but modal didn't open (e.g. route timing), open it now.
  const sub = String(route.query?.submission || '').trim();
  if (sub && !showMileageModal.value && !showMedcancelModal.value && !showReimbursementModal.value) {
    if (sub === 'school_mileage' && inSchoolEnabled.value) {
      await openMileageModal('school_travel');
      const next = { ...route.query };
      delete next.submission;
      router.replace({ query: next });
    } else if (sub === 'mileage') {
      await openMileageModal('standard');
      const next = { ...route.query };
      delete next.submission;
      router.replace({ query: next });
    }
  }

  // If we arrived here from the dashboard "View last paycheck" action, auto-expand once.
  const qp = route.query?.expandPayrollPeriodId;
  const pid = qp ? parseInt(String(qp), 10) : null;
  if (pid) {
    expandedId.value = pid;
    const next = { ...route.query };
    delete next.expandPayrollPeriodId;
    router.replace({ query: next });
  }
});
</script>

<style scoped>
.my-payroll .header .subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary);
}
.table-wrap {
  overflow: auto;
}
.table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
}
.table th {
  white-space: nowrap;
  font-weight: 600;
}
.table th,
.table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.mileage-row-submitted {
  background: #e8f4fc;
}
.mileage-row-approved {
  background: #d4edda;
}
.mileage-row-returned {
  background: #ffe4cc;
}
.right {
  text-align: right;
}
.muted {
  color: var(--text-secondary);
}
.readonly-value {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary, #f5f5f5);
  font-weight: 500;
}
.overtime-days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
}
.overtime-day-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.overtime-day-cell input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}
.overtime-day-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.warn-box {
  border: 1px solid #ffe58f;
  background: #fffbe6;
  border-radius: 10px;
  padding: 10px 12px;
}
.current-unpaid-notes {
  border: 1px solid #ffd8a8;
  background: #fff4e6;
}
.current-unpaid-notes strong {
  color: #b45309;
}
.old-notes-alert {
  border: 1px solid #ffb5b5;
  background: #ffecec;
}
.old-notes-alert strong {
  color: #b42318;
  font-weight: 800;
}
.clickable {
  cursor: pointer;
}
.clickable:hover td {
  background: #f9fafb;
}
.period-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.period-title .chev {
  color: var(--text-secondary);
  font-size: 12px;
}
.controls {
  display: flex;
  gap: 12px;
  margin: 10px 0;
  flex-wrap: wrap;
}
.control {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.control .label {
  font-size: 12px;
  color: var(--text-secondary);
}
select {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
}
.badge {
  display: inline-block;
  margin-left: 6px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.claims-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 12px;
}
@media (max-width: 900px) {
  .claims-grid {
    grid-template-columns: 1fr;
  }
}
.claim-summary {
  list-style: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
}
.claim-summary::-webkit-details-marker {
  display: none;
}
.claim-title {
  font-weight: 700;
  margin-bottom: 2px;
}
.claim-card[open] .claim-summary {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.claim-card {
  padding: 12px 14px;
}
.claim-card .muted {
  font-size: 12px;
}
.periods {
  margin-top: 10px;
  max-width: 980px;
}
.periods-head {
  display: grid;
  grid-template-columns: 1fr 240px 90px 140px;
  gap: 10px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
}
.period-row {
  width: 100%;
  text-align: left;
  display: grid;
  grid-template-columns: 1fr 240px 90px 140px;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  margin-top: 10px;
  cursor: pointer;
}
.period-row.shade-a {
  background: #ffffff;
}
.period-row.shade-b {
  background: #f8fafc;
}
.period-row:hover {
  background: #f9fafb;
}
.period-row.active {
  border-color: #111827;
}
.tier-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.period-title .title strong {
  font-weight: 800;
}
@media (max-width: 860px) {
  .periods-head {
    display: none;
  }
  .period-row {
    grid-template-columns: 1fr;
  }
}
.paytype {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.paytype-head,
.paytype-row {
  display: grid;
  grid-template-columns: 1fr 110px 140px 140px;
  gap: 10px;
  align-items: baseline;
}
.paytype-head {
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
}
.paytype-row .code {
  font-weight: 600;
}
.card {
  margin-top: 12px;
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
}
.card-title {
  margin: 0 0 10px 0;
}
.row {
  margin: 6px 0;
}
.di-grid {
  display: grid;
  grid-template-columns: 1fr 110px 110px 110px;
  gap: 6px 10px;
  align-items: baseline;
}
.di-head {
  font-size: 12px;
  color: var(--text-secondary);
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
.codes {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.codes-head {
  display: grid;
  grid-template-columns: 1fr repeat(6, minmax(72px, 92px));
  gap: 6px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
}
.code-row {
  display: grid;
  grid-template-columns: 1fr repeat(6, minmax(72px, 92px));
  gap: 6px;
  align-items: baseline;
}
.code {
  font-weight: 600;
}
.adjustments {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.error-box {
  background: #ffecec;
  border: 1px solid #ffb5b5;
  padding: 10px 12px;
  border-radius: 10px;
  margin: 10px 0;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 50;
}
.modal {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  width: min(900px, 100%);
  max-height: 90vh;
  overflow: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.modal-title {
  font-weight: 700;
}
.hint {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 4px;
}
.field-row {
  display: grid;
  gap: 10px;
}
.field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  color: var(--text-primary);
}
.btn {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-primary);
  cursor: pointer;
}
.btn.btn-primary {
  background: #111827;
  color: white;
  border-color: #111827;
}
.btn.btn-secondary {
  background: #f9fafb;
}
.btn.btn-sm {
  padding: 6px 8px;
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
</style>

