<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Payroll</h1>
        <p class="subtitle">Upload your billing report. We’ll auto-detect the correct pay period (Sat→Fri, every 2 weeks).</p>
      </div>
    </div>

    <div class="card" style="margin-bottom: 12px;">
      <h2 class="card-title">Organization</h2>
      <div class="hint">Pick the organization you want to run payroll for.</div>
      <div class="field-row" style="margin-top: 8px; grid-template-columns: 280px 1fr; align-items: flex-end;">
        <div class="field">
          <label>Organization</label>
          <select v-model="selectedOrgId" :key="`org-${(filteredAgencies || []).length}`">
            <option :value="null" disabled>Select an organization…</option>
            <option v-for="a in filteredAgencies" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>Search</label>
          <input v-model="orgSearch" type="text" placeholder="Type to filter organizations…" />
        </div>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="card" v-if="agencyId" style="margin-bottom: 12px;">
      <h2 class="card-title">Process Changes</h2>
      <div class="hint">
        Use this when you re-run a <strong>prior</strong> pay period report to catch late notes. The system will auto-detect which prior pay period the upload belongs to, compare “then vs now”, and let you add only the differences into the <strong>present</strong> pay period.
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr 1fr;">
        <div class="field">
          <label>Present pay period (destination)</label>
          <select v-model="processTargetPeriodId">
            <option :value="-1" v-if="suggestedCurrentPeriodRange">
              Present pay period ({{ suggestedCurrentPeriodRange.label }}){{ suggestedCurrentPeriodId ? '' : ' — will create' }}
            </option>
            <option :value="null" disabled>Select present pay period…</option>
            <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
          </select>
          <div class="hint" v-if="creatingCurrentPeriod">Creating present pay period…</div>
        </div>
        <div class="field">
          <label>Upload updated prior pay period report</label>
          <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onProcessFilePick" />
          <div class="hint" v-if="processDetectedHint">{{ processDetectedHint }}</div>
        </div>
        <div class="field">
          <label>Next</label>
          <div class="actions" style="margin: 0;">
            <button class="btn btn-secondary" @click="processAutoImport" :disabled="processingChanges || !processImportFile || !agencyId">
              {{ processingChanges ? 'Detecting...' : 'Detect prior period (choose) & import' }}
            </button>
            <button class="btn btn-primary" @click="processRunAndCompare" :disabled="processingChanges || !processSourcePeriodId || !processTargetEffectiveId">
              {{ processingChanges ? 'Working...' : 'Run & compare (then → now)' }}
            </button>
          </div>
          <div class="hint" v-if="processSourcePeriodLabel">
            Prior period detected: {{ processSourcePeriodLabel }}
          </div>
          <div class="hint" v-if="processTargetEffectiveLabel">
            Will add differences into: {{ processTargetEffectiveLabel }}
          </div>
          <div class="warn-box" v-if="processError">{{ processError }}</div>
        </div>
      </div>

      <!-- Process Changes: prior-period confirmation modal -->
      <div v-if="processConfirmOpen" class="modal-backdrop" @click.self="processConfirmOpen = false">
        <div class="modal" style="width: min(800px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Confirm Prior Pay Period</div>
              <div class="hint">Verify the prior pay period before importing the updated report.</div>
            </div>
            <button class="btn btn-secondary btn-sm" @click="processConfirmOpen = false">Close</button>
          </div>

          <div class="warn-box" v-if="processDetectResult?.detected">
            Detected: <strong>{{ processDetectResult.detected.periodStart }} → {{ processDetectResult.detected.periodEnd }}</strong>
            <span v-if="processDetectResult.detected.maxServiceDate" class="muted"> • max DOS {{ processDetectResult.detected.maxServiceDate }}</span>
          </div>

          <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Import mode</label>
              <select v-model="processChoiceMode">
                <option value="detected" v-if="processDetectResult?.detected">Use detected period</option>
                <option value="existing">Choose an existing period</option>
                <option value="custom">Enter custom dates</option>
              </select>
            </div>
            <div class="field" v-if="processChoiceMode === 'existing'">
              <label>Existing prior pay period</label>
              <select v-model="processExistingPeriodId">
                <option :value="null" disabled>Select a pay period…</option>
                <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
              </select>
            </div>
            <div class="field" v-else-if="processChoiceMode === 'detected'">
              <label>Detected prior period</label>
              <div class="hint">
                {{ processDetectResult?.detected?.periodStart }} → {{ processDetectResult?.detected?.periodEnd }}
                <span v-if="processExistingPeriodId" class="muted"> • will import into existing period #{{ processExistingPeriodId }}</span>
                <span v-else class="muted"> • will create this period then import</span>
              </div>
            </div>
          </div>

          <div v-if="processChoiceMode === 'custom'" class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Period start</label>
              <input v-model="processCustomStart" type="date" />
            </div>
            <div class="field">
              <label>Period end</label>
              <input v-model="processCustomEnd" type="date" />
            </div>
          </div>

          <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
            <button class="btn btn-primary" @click="confirmProcessImport" :disabled="processingChanges || !processImportFile || !agencyId">
              {{ processingChanges ? 'Importing...' : 'Confirm & Import prior period' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card" v-if="agencyId" style="margin-bottom: 12px;">
      <h2 class="card-title">Current Payroll Run</h2>
      <div class="hint">
        Import the current billing report, stage edits, run payroll, and post payroll. Providers will see posted payroll and any “prior notes included”.
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr 1fr;">
        <div class="field">
          <label>Pay period</label>
          <select v-model="selectedPeriodId" :key="`period-top-${agencyId || 'none'}-${(periods || []).length}`">
            <option :value="null" disabled>Select a pay period…</option>
            <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
          </select>
        </div>
        <div class="field">
          <label>Provider filter</label>
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end;">
            <select v-model="selectedUserId">
              <option :value="null" disabled>Select a provider…</option>
              <option v-for="u in agencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
            </select>
            <button class="btn btn-secondary btn-sm" @click="clearSelectedProvider" :disabled="!selectedUserId">
              Clear
            </button>
          </div>
        </div>
        <div class="field">
          <label>Import billing report</label>
          <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onFilePick" />
          <div class="hint" v-if="detectedPeriodHint">{{ detectedPeriodHint }}</div>
          <div class="actions" style="margin-top: 8px;">
            <button class="btn btn-secondary" @click="autoImport" :disabled="autoImporting || !importFile || !agencyId">
              {{ autoDetecting ? 'Detecting...' : 'Auto-detect Pay Period' }}
            </button>
            <button class="btn btn-primary" @click="openImportConfirmModal" :disabled="importing || !importFile">
              {{ importing ? 'Importing...' : 'Import (choose pay period)' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Auto-detect confirmation modal -->
      <div v-if="confirmAutoImportOpen" class="modal-backdrop" @click.self="confirmAutoImportOpen = false">
        <div class="modal" style="width: min(800px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Confirm Pay Period</div>
              <div class="hint">Verify the pay period before importing.</div>
            </div>
            <button class="btn btn-secondary btn-sm" @click="confirmAutoImportOpen = false">Close</button>
          </div>

          <div class="warn-box" v-if="autoDetectResult?.detected">
            Detected: <strong>{{ autoDetectResult.detected.periodStart }} → {{ autoDetectResult.detected.periodEnd }}</strong>
            <span v-if="autoDetectResult.detected.maxServiceDate" class="muted"> • max DOS {{ autoDetectResult.detected.maxServiceDate }}</span>
          </div>

          <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Import mode</label>
              <select v-model="autoImportChoiceMode">
                <option value="detected" v-if="autoDetectResult?.detected">Use detected period</option>
                <option value="existing">Choose an existing period</option>
                <option value="custom">Enter custom dates</option>
              </select>
            </div>
            <div class="field" v-if="autoImportChoiceMode === 'existing'">
              <label>Existing pay period</label>
              <select v-model="autoImportExistingPeriodId">
                <option :value="null" disabled>Select a pay period…</option>
                <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
              </select>
            </div>
            <div class="field" v-else-if="autoImportChoiceMode === 'detected'">
              <label>Detected period</label>
              <div class="hint">
                {{ autoDetectResult?.detected?.periodStart }} → {{ autoDetectResult?.detected?.periodEnd }}
                <span v-if="autoImportExistingPeriodId" class="muted"> • will import into existing period #{{ autoImportExistingPeriodId }}</span>
                <span v-else class="muted"> • will create this period then import</span>
              </div>
            </div>
          </div>

          <div v-if="autoImportChoiceMode === 'custom'" class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Period start</label>
              <input v-model="autoImportCustomStart" type="date" />
            </div>
            <div class="field">
              <label>Period end</label>
              <input v-model="autoImportCustomEnd" type="date" />
            </div>
          </div>

          <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
            <button class="btn btn-primary" @click="confirmAutoImport" :disabled="autoImporting || !importFile || isPeriodPosted">
              {{ autoImporting ? 'Importing...' : 'Confirm & Import' }}
            </button>
          </div>
        </div>
      </div>

      <div class="actions" style="margin-top: 10px;">
        <button class="btn btn-secondary" @click="showRawModal = true" :disabled="!rawImportRows.length">
          Raw Import (View)
        </button>
        <button class="btn btn-secondary" @click="openCarryoverModal" :disabled="!selectedPeriodId || isPeriodPosted">
          No-note/Draft Unpaid
        </button>
        <button class="btn btn-secondary" @click="showStageModal = true" :disabled="!selectedPeriodId">
          Payroll Stage
        </button>
        <button class="btn btn-primary" @click="runPayroll" :disabled="runningPayroll || isPeriodPosted || !selectedPeriodId">
          {{
            runningPayroll
              ? 'Running...'
              : (isPeriodPosted ? 'Locked' : (canSeeRunResults ? 'Re-run Payroll' : 'Run Payroll'))
          }}
        </button>
        <button class="btn btn-secondary" @click="showRunModal = true" :disabled="!canSeeRunResults">
          View Ran Payroll
        </button>
        <button class="btn btn-secondary" @click="showPreviewPostModal = true" :disabled="!canSeeRunResults">
          Preview Post
        </button>
        <button class="btn btn-secondary" @click="downloadExportCsv" :disabled="!canSeeRunResults">
          Export Payroll CSV
        </button>
        <button class="btn btn-primary" @click="postPayroll" :disabled="postingPayroll || isPeriodPosted || selectedPeriod?.status !== 'ran'">
          {{ postingPayroll ? 'Posting...' : (isPeriodPosted ? 'Posted' : 'Post Payroll') }}
        </button>
        <button class="btn btn-danger" @click="resetPeriod" :disabled="resettingPeriod || !selectedPeriodId">
          {{ resettingPeriod ? 'Resetting...' : 'Reset Pay Period' }}
        </button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2 class="card-title">Pay Periods (History)</h2>
        <div class="hint">Pay periods are created automatically when you import a report.</div>

        <div class="list">
          <button
            v-for="p in historyPeriods"
            :key="p.id"
            class="list-item"
            :class="{ active: selectedPeriodId === p.id }"
            @click="selectPeriod(p.id)"
          >
            <div class="list-item-title">{{ periodRangeLabel(p) }}</div>
            <div class="list-item-meta">
              {{ p.status }}
              <span v-if="p.status === 'finalized' && (p.finalized_by_first_name || p.finalized_by_last_name || p.finalized_at)">
                • Ran by {{ p.finalized_by_first_name }} {{ p.finalized_by_last_name }} <span v-if="p.finalized_at">({{ fmtDateTime(p.finalized_at) }})</span>
              </span>
            </div>
          </button>
        </div>
      </div>

      <div class="card" v-if="selectedPeriod">
        <h2 class="card-title">Period Details</h2>
        <div class="field-row" style="margin-top: 8px;">
          <div class="field">
            <label>Pay Period</label>
            <select v-model="selectedPeriodId" :key="`period-details-${agencyId || 'none'}-${(periods || []).length}`">
              <option :value="null" disabled>Select a pay period…</option>
              <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
            </select>
          </div>
          <div class="field">
            <label>Provider</label>
            <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end;">
              <select v-model="selectedUserId">
                <option :value="null" disabled>Select a provider…</option>
                <option v-for="u in agencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
              </select>
              <button class="btn btn-secondary btn-sm" @click="clearSelectedProvider" :disabled="!selectedUserId">
                Clear
              </button>
            </div>
          </div>
          <div class="field">
            <label>&nbsp;</label>
            <div class="hint">Use this to filter Payroll Stage and review provider totals.</div>
          </div>
        </div>
        <div class="period-meta">
          <div><strong>Pay Period:</strong> {{ periodRangeLabel(selectedPeriod) }}</div>
          <div><strong>Status:</strong> {{ selectedPeriod.status }}</div>
          <div v-if="selectedPeriod.status === 'ran'">
            <strong>Ran:</strong>
            <span v-if="selectedPeriod.ran_at">{{ fmtDateTime(selectedPeriod.ran_at) }}</span>
          </div>
          <div v-if="selectedPeriod.status === 'posted' || selectedPeriod.status === 'finalized'">
            <strong>Posted:</strong>
            <span v-if="selectedPeriod.posted_at">{{ fmtDateTime(selectedPeriod.posted_at) }}</span>
          </div>
        </div>

        <div v-if="canSeeRunResults">
          <h3 class="section-title">Run Payroll (Totals)</h3>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th class="right">No Note</th>
                  <th class="right">Draft</th>
                  <th class="right">Finalized</th>
                  <th class="right">Tier (Final)</th>
                  <th class="right">Credits/Hours</th>
                  <th class="right">Direct Credits</th>
                  <th class="right">Indirect Credits</th>
                  <th class="right">Other Credits</th>
                  <th class="right">Subtotal</th>
                  <th class="right">Direct Hourly Rate</th>
                  <th class="right">Indirect Hourly Rate</th>
                  <th class="right">Effective Hourly Rate</th>
                  <th class="right">Adjustments</th>
                  <th class="right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in summaries" :key="s.id" @click="selectSummary(s)" class="clickable">
                  <!-- compute pay totals from breakdown (non-flat only) -->
                  <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
                  <td>{{ s.first_name }} {{ s.last_name }}</td>
                  <td class="right">{{ fmtNum(s.no_note_units ?? 0) }}</td>
                  <td class="right">{{ fmtNum(s.draft_units ?? 0) }}</td>
                  <td class="right">{{ fmtNum(s.finalized_units ?? s.total_units ?? 0) }}</td>
                  <td class="right">
                    {{ fmtNum(s.tier_credits_final ?? s.tier_credits_current ?? 0) }}
                    <span v-if="s.grace_active" class="muted"> (grace)</span>
                  </td>
                  <td class="right">{{ fmtNum(s.total_hours ?? 0) }}</td>
                  <td class="right">{{ fmtNum(s.direct_hours ?? 0) }}</td>
                  <td class="right">{{ fmtNum(s.indirect_hours ?? 0) }}</td>
                  <td class="right">{{ fmtNum(((s.total_hours ?? 0) - (s.direct_hours ?? 0) - (s.indirect_hours ?? 0)) || 0) }}</td>
                  <td class="right">{{ fmtMoney(s.subtotal_amount) }}</td>
                  <td class="right muted">
                    {{
                      (() => {
                        const { directAmount } = payTotalsFromBreakdown(s.breakdown);
                        const h = Number(s.direct_hours || 0);
                        return h > 0 ? fmtMoney(directAmount / h) : '—';
                      })()
                    }}
                  </td>
                  <td class="right muted">
                    {{
                      (() => {
                        const { indirectAmount } = payTotalsFromBreakdown(s.breakdown);
                        const h = Number(s.indirect_hours || 0);
                        return h > 0 ? fmtMoney(indirectAmount / h) : '—';
                      })()
                    }}
                  </td>
                  <td class="right muted">
                    {{
                      (() => {
                        const total = Number(s.total_hours || 0);
                        const directH = Number(s.direct_hours || 0);
                        const indirectH = Number(s.indirect_hours || 0);
                        const otherH = Math.max(0, total - directH - indirectH);
                        if (directH > 0 && indirectH <= 1e-9 && otherH <= 1e-9) {
                          const { directAmount } = payTotalsFromBreakdown(s.breakdown);
                          return fmtMoney(directAmount / (total || 1));
                        }
                        return '—';
                      })()
                    }}
                  </td>
                  <td class="right">{{ fmtMoney(s.adjustments_amount) }}</td>
                  <td class="right">{{ fmtMoney(s.total_amount) }}</td>
                </tr>
                <tr v-if="!summaries.length">
                  <td colspan="15" class="muted">No run results yet. Click “Run Payroll”.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else class="hint" style="margin-top: 10px;">
          Run results are private until you click <strong>Run Payroll</strong>. Providers will not see anything until <strong>Post Payroll</strong>.
        </div>

        <!-- Payroll Stage modal -->
        <div v-if="showStageModal" class="modal-backdrop" @click.self="showStageModal = false">
          <div class="modal">
            <div class="modal-header">
              <div>
                <div class="modal-title">Payroll Stage</div>
                <div class="hint">Edit the workspace + per-user adjustments before running payroll.</div>
              </div>
              <button class="btn btn-secondary btn-sm" @click="showStageModal = false">Close</button>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Mileage Submissions (Pending)</h3>
              <div class="hint">Payroll cannot be run while mileage submissions for this pay period are still pending approval.</div>
              <div v-if="pendingMileageError" class="warn-box" style="margin-top: 8px;">{{ pendingMileageError }}</div>
              <div v-if="pendingMileageLoading" class="muted" style="margin-top: 8px;">Loading pending submissions…</div>
              <div v-else-if="!pendingMileageClaims.length" class="muted" style="margin-top: 8px;">No pending mileage submissions for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th class="right">Eligible miles</th>
                      <th class="right">Tier</th>
                      <th class="right">Pay period</th>
                      <th class="right">Est.</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingMileageClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.drive_date }}</td>
                      <td class="right">
                        {{ fmtNum(Number(c.eligible_miles ?? c.miles ?? 0)) }}
                      </td>
                      <td class="right">
                        <select v-model="mileageTierByClaimId[c.id]" :disabled="approvingMileageClaimId === c.id">
                          <option :value="1">Tier 1</option>
                          <option :value="2">Tier 2</option>
                          <option :value="3">Tier 3</option>
                        </select>
                      </td>
                      <td class="right">
                        <select v-model="mileageTargetPeriodByClaimId[c.id]" :disabled="approvingMileageClaimId === c.id">
                          <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                        </select>
                      </td>
                      <td class="right" :title="estimateMileageTitle(c)">
                        {{ estimateMileageDisplay(c) }}
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button class="btn btn-secondary btn-sm" @click="openMileageDetails(c)">
                            View
                          </button>
                          <button class="btn btn-primary btn-sm" @click="approveMileageClaim(c)" :disabled="approvingMileageClaimId === c.id || !isValidTargetPeriodId(mileageTargetPeriodByClaimId[c.id]) || isTargetPeriodLocked(mileageTargetPeriodByClaimId[c.id])">
                            {{ approvingMileageClaimId === c.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-secondary btn-sm" @click="returnMileageClaim(c)" :disabled="approvingMileageClaimId === c.id">
                            Send back…
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectMileageClaim(c)" :disabled="approvingMileageClaimId === c.id">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingMileageClaims" :disabled="pendingMileageLoading || !agencyId">
                  Refresh pending
                </button>
                <button class="btn btn-secondary" @click="loadPendingMileageClaims" :disabled="pendingMileageLoading || !selectedPeriodId">
                  This pay period only
                </button>
                <button class="btn btn-secondary" @click="loadAllPendingMileageClaims" :disabled="pendingMileageLoading || !agencyId">
                  Show all pending (any period)
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">MedCancel Submissions (Pending)</h3>
              <div class="hint">Payroll cannot be run while MedCancel submissions for this pay period are still pending approval.</div>
              <div v-if="pendingMedcancelError" class="warn-box" style="margin-top: 8px;">{{ pendingMedcancelError }}</div>
              <div v-if="pendingMedcancelLoading" class="muted" style="margin-top: 8px;">Loading pending submissions…</div>
              <div v-else-if="!pendingMedcancelClaims.length" class="muted" style="margin-top: 8px;">No pending MedCancel submissions for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th class="right">Units</th>
                      <th class="right">Pay period</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingMedcancelClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.claim_date }}</td>
                      <td class="right">{{ fmtNum(Number(c.units ?? 0)) }}</td>
                      <td class="right">
                        <select v-model="medcancelTargetPeriodByClaimId[c.id]" :disabled="approvingMedcancelClaimId === c.id">
                          <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                        </select>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button class="btn btn-primary btn-sm" @click="approveMedcancelClaim(c)" :disabled="approvingMedcancelClaimId === c.id || !isValidTargetPeriodId(medcancelTargetPeriodByClaimId[c.id]) || isTargetPeriodLocked(medcancelTargetPeriodByClaimId[c.id])">
                            {{ approvingMedcancelClaimId === c.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-secondary btn-sm" @click="returnMedcancelClaim(c)" :disabled="approvingMedcancelClaimId === c.id">
                            Send back…
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectMedcancelClaim(c)" :disabled="approvingMedcancelClaimId === c.id">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingMedcancelClaims" :disabled="pendingMedcancelLoading || !agencyId">
                  Refresh pending
                </button>
                <button class="btn btn-secondary" @click="loadPendingMedcancelClaims" :disabled="pendingMedcancelLoading || !selectedPeriodId">
                  This pay period only
                </button>
                <button class="btn btn-secondary" @click="loadAllPendingMedcancelClaims" :disabled="pendingMedcancelLoading || !agencyId">
                  Show all pending (any period)
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Reimbursement Submissions (Pending)</h3>
              <div class="hint">Approved reimbursements are added as adjustments in the selected pay period.</div>
              <div v-if="pendingReimbursementError" class="warn-box" style="margin-top: 8px;">{{ pendingReimbursementError }}</div>
              <div v-if="pendingReimbursementLoading" class="muted" style="margin-top: 8px;">Loading pending submissions…</div>
              <div v-else-if="!pendingReimbursementClaims.length" class="muted" style="margin-top: 8px;">No pending reimbursements for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th class="right">Amount</th>
                      <th>Receipt</th>
                      <th class="right">Pay period</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingReimbursementClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.expense_date }}</td>
                      <td class="right">{{ fmtMoney(Number(c.amount || 0)) }}</td>
                      <td>
                        <a v-if="c.receipt_file_path" :href="receiptUrl(c)" target="_blank" rel="noopener noreferrer">View</a>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="right">
                        <select v-model="reimbursementTargetPeriodByClaimId[c.id]" :disabled="approvingReimbursementClaimId === c.id">
                          <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                        </select>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-primary btn-sm"
                            @click="approveReimbursementClaim(c)"
                            :disabled="approvingReimbursementClaimId === c.id || !isValidTargetPeriodId(reimbursementTargetPeriodByClaimId[c.id]) || isTargetPeriodLocked(reimbursementTargetPeriodByClaimId[c.id])"
                          >
                            {{ approvingReimbursementClaimId === c.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-secondary btn-sm" @click="returnReimbursementClaim(c)" :disabled="approvingReimbursementClaimId === c.id">
                            Send back…
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectReimbursementClaim(c)" :disabled="approvingReimbursementClaimId === c.id">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingReimbursementClaims" :disabled="pendingReimbursementLoading || !agencyId">
                  Show all pending (any period)
                </button>
                <button class="btn btn-secondary" @click="loadPendingReimbursementClaims" :disabled="pendingReimbursementLoading || !selectedPeriodId">
                  This pay period only
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Time Claims (Pending)</h3>
              <div class="hint">Meeting/training, excess/holiday, service corrections, and overtime evaluations.</div>
              <div v-if="pendingTimeError" class="warn-box" style="margin-top: 8px;">{{ pendingTimeError }}</div>
              <div v-if="pendingTimeLoading" class="muted" style="margin-top: 8px;">Loading pending submissions…</div>
              <div v-else-if="!pendingTimeClaims.length" class="muted" style="margin-top: 8px;">No pending time claims for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th class="right">Pay period</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingTimeClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.claim_date }}</td>
                      <td>{{ timeTypeLabel(c) }}</td>
                      <td class="right">
                        <select v-model="timeTargetPeriodByClaimId[c.id]" :disabled="approvingTimeClaimId === c.id">
                          <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                        </select>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-primary btn-sm"
                            @click="approveTimeClaim(c)"
                            :disabled="approvingTimeClaimId === c.id || !isValidTargetPeriodId(timeTargetPeriodByClaimId[c.id]) || isTargetPeriodLocked(timeTargetPeriodByClaimId[c.id])"
                          >
                            {{ approvingTimeClaimId === c.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-secondary btn-sm" @click="returnTimeClaim(c)" :disabled="approvingTimeClaimId === c.id">
                            Send back…
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectTimeClaim(c)" :disabled="approvingTimeClaimId === c.id">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingTimeClaims" :disabled="pendingTimeLoading || !agencyId">
                  Show all pending (any period)
                </button>
                <button class="btn btn-secondary" @click="loadPendingTimeClaims" :disabled="pendingTimeLoading || !selectedPeriodId">
                  This pay period only
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Approved Mileage (This pay period)</h3>
              <div class="hint">After approval, claims leave “Pending” and appear here (and in provider totals).</div>
              <div v-if="approvedMileageListError" class="warn-box" style="margin-top: 8px;">{{ approvedMileageListError }}</div>
              <div v-if="approvedMileageListLoading" class="muted" style="margin-top: 8px;">Loading approved mileage…</div>
              <div v-else-if="!approvedMileageClaims.length" class="muted" style="margin-top: 8px;">No approved mileage claims for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th class="right">Eligible miles</th>
                      <th class="right">Move to</th>
                      <th class="right">Amount</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in approvedMileageClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.drive_date }}</td>
                      <td class="right">{{ fmtNum(Number(c.eligible_miles ?? c.miles ?? 0)) }}</td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <select
                            v-model="approvedMileageMoveTargetByClaimId[c.id]"
                            :disabled="movingMileageClaimId === c.id"
                          >
                            <option v-for="p in periods" :key="p.id" :value="p.id">
                              {{ periodRangeLabel(p) }}
                            </option>
                          </select>
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="moveApprovedMileageClaim(c)"
                            :disabled="
                              movingMileageClaimId === c.id ||
                              !isValidTargetPeriodId(approvedMileageMoveTargetByClaimId[c.id]) ||
                              isTargetPeriodLocked(approvedMileageMoveTargetByClaimId[c.id])
                            "
                          >
                            {{ movingMileageClaimId === c.id ? 'Moving…' : 'Move' }}
                          </button>
                        </div>
                      </td>
                      <td class="right">{{ fmtMoney(Number(c.applied_amount || 0)) }}</td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="unapproveMileageClaim(c)"
                            :disabled="movingMileageClaimId === c.id || isTargetPeriodLocked(c.target_payroll_period_id)"
                          >
                            Unapprove
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadApprovedMileageClaimsList" :disabled="approvedMileageListLoading || !selectedPeriodId">
                  Refresh approved mileage
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Approved Med Cancel (This pay period)</h3>
              <div class="hint">After approval, claims leave “Pending” and appear here (and in provider totals).</div>
              <div v-if="approvedMedcancelListError" class="warn-box" style="margin-top: 8px;">{{ approvedMedcancelListError }}</div>
              <div v-if="approvedMedcancelListLoading" class="muted" style="margin-top: 8px;">Loading approved Med Cancel…</div>
              <div v-else-if="!approvedMedcancelClaims.length" class="muted" style="margin-top: 8px;">No approved Med Cancel claims for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th class="right">Services</th>
                      <th class="right">Amount</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in approvedMedcancelClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.claim_date }}</td>
                      <td class="right">{{ fmtNum(Number(c.units ?? 0)) }}</td>
                      <td class="right">{{ fmtMoney(Number(c.applied_amount || 0)) }}</td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="unapproveMedcancelClaim(c)"
                            :disabled="unapprovingMedcancelClaimId === c.id || isTargetPeriodLocked(c.target_payroll_period_id)"
                          >
                            {{ unapprovingMedcancelClaimId === c.id ? 'Unapproving…' : 'Unapprove' }}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadApprovedMedcancelClaimsList" :disabled="approvedMedcancelListLoading || !selectedPeriodId">
                  Refresh approved Med Cancel
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Approved Reimbursements (This pay period)</h3>
              <div class="hint">Approved reimbursements contribute to payroll adjustments for this pay period.</div>
              <div v-if="approvedReimbursementListError" class="warn-box" style="margin-top: 8px;">{{ approvedReimbursementListError }}</div>
              <div v-if="approvedReimbursementListLoading" class="muted" style="margin-top: 8px;">Loading approved reimbursements…</div>
              <div v-else-if="!approvedReimbursementClaims.length" class="muted" style="margin-top: 8px;">No approved reimbursements for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th class="right">Amount</th>
                      <th>Receipt</th>
                      <th class="right">Move to</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in approvedReimbursementClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.expense_date }}</td>
                      <td class="right">{{ fmtMoney(Number(c.applied_amount || c.amount || 0)) }}</td>
                      <td>
                        <a v-if="c.receipt_file_path" :href="receiptUrl(c)" target="_blank" rel="noopener noreferrer">View</a>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <select v-model="approvedReimbursementMoveTargetByClaimId[c.id]" :disabled="movingReimbursementClaimId === c.id">
                            <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                          </select>
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="moveApprovedReimbursementClaim(c)"
                            :disabled="
                              movingReimbursementClaimId === c.id ||
                              !isValidTargetPeriodId(approvedReimbursementMoveTargetByClaimId[c.id]) ||
                              isTargetPeriodLocked(approvedReimbursementMoveTargetByClaimId[c.id])
                            "
                          >
                            {{ movingReimbursementClaimId === c.id ? 'Moving…' : 'Move' }}
                          </button>
                        </div>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="unapproveReimbursementClaim(c)"
                            :disabled="movingReimbursementClaimId === c.id || isTargetPeriodLocked(c.target_payroll_period_id)"
                          >
                            Unapprove
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadApprovedReimbursementClaimsList" :disabled="approvedReimbursementListLoading || !selectedPeriodId">
                  Refresh approved reimbursements
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Approved Time Claims (This pay period)</h3>
              <div class="hint">Approved time claims contribute to payroll adjustments for this pay period.</div>
              <div v-if="approvedTimeListError" class="warn-box" style="margin-top: 8px;">{{ approvedTimeListError }}</div>
              <div v-if="approvedTimeListLoading" class="muted" style="margin-top: 8px;">Loading approved time claims…</div>
              <div v-else-if="!approvedTimeClaims.length" class="muted" style="margin-top: 8px;">No approved time claims for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th class="right">Amount</th>
                      <th class="right">Move to</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in approvedTimeClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.claim_date }}</td>
                      <td>{{ timeTypeLabel(c) }}</td>
                      <td class="right">{{ fmtMoney(Number(c.applied_amount || 0)) }}</td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <select v-model="approvedTimeMoveTargetByClaimId[c.id]" :disabled="movingTimeClaimId === c.id">
                            <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                          </select>
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="moveApprovedTimeClaim(c)"
                            :disabled="
                              movingTimeClaimId === c.id ||
                              !isValidTargetPeriodId(approvedTimeMoveTargetByClaimId[c.id]) ||
                              isTargetPeriodLocked(approvedTimeMoveTargetByClaimId[c.id])
                            "
                          >
                            {{ movingTimeClaimId === c.id ? 'Moving…' : 'Move' }}
                          </button>
                        </div>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="unapproveTimeClaim(c)"
                            :disabled="movingTimeClaimId === c.id || isTargetPeriodLocked(c.target_payroll_period_id)"
                          >
                            Unapprove
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadApprovedTimeClaimsList" :disabled="approvedTimeListLoading || !selectedPeriodId">
                  Refresh approved time claims
                </button>
              </div>
            </div>

            <!-- Mileage details modal -->
            <div v-if="showMileageDetailsModal" class="modal-backdrop" @click.self="closeMileageDetails">
              <div class="modal" style="width: min(820px, 100%);">
                <div class="modal-header">
                  <div>
                    <div class="modal-title">Mileage Submission Details</div>
                    <div class="hint">This is what the provider submitted (auto or manual).</div>
                  </div>
                  <button class="btn btn-secondary btn-sm" @click="closeMileageDetails">Close</button>
                </div>

                <div v-if="selectedMileageClaim" style="margin-top: 10px;">
                  <div class="row"><strong>Provider:</strong> {{ nameForUserId(selectedMileageClaim.user_id) }}</div>
                  <div class="row"><strong>Date:</strong> {{ selectedMileageClaim.drive_date }}</div>
                  <div class="row"><strong>Type:</strong> {{ String(selectedMileageClaim.claim_type || '').toLowerCase() === 'school_travel' ? 'School Mileage' : 'Other Mileage' }}</div>
                  <div class="row"><strong>Status:</strong> {{ String(selectedMileageClaim.status || '').toUpperCase() }}</div>
                  <div class="row"><strong>Eligible miles:</strong> {{ fmtNum(Number(selectedMileageClaim.eligible_miles ?? selectedMileageClaim.miles ?? 0)) }}</div>
                  <div class="row"><strong>Claim miles (stored):</strong> {{ fmtNum(Number(selectedMileageClaim.miles ?? 0)) }}</div>
                  <div class="row"><strong>Home↔School RT:</strong> {{ fmtNum(Number(selectedMileageClaim.home_school_roundtrip_miles ?? 0)) }}</div>
                  <div class="row"><strong>Home↔Office RT:</strong> {{ fmtNum(Number(selectedMileageClaim.home_office_roundtrip_miles ?? 0)) }}</div>
                  <div class="row"><strong>School org id:</strong> {{ selectedMileageClaim.school_organization_id }}</div>
                  <div class="row"><strong>Office location id:</strong> {{ selectedMileageClaim.office_location_id }}</div>
                  <div class="row"><strong>Start location:</strong> {{ selectedMileageClaim.start_location || '—' }}</div>
                  <div class="row"><strong>End location:</strong> {{ selectedMileageClaim.end_location || '—' }}</div>
                  <div v-if="String(selectedMileageClaim.claim_type || '').toLowerCase() !== 'school_travel'" class="card" style="margin-top: 10px;">
                    <h3 class="card-title" style="margin: 0 0 6px 0;">Trip details (Other Mileage)</h3>
                    <div class="row"><strong>Approved by:</strong> {{ selectedMileageClaim.trip_approved_by || '—' }}</div>
                    <div class="row">
                      <strong>Pre-approved:</strong>
                      {{
                        selectedMileageClaim.trip_preapproved === 1
                          ? 'Yes'
                          : (selectedMileageClaim.trip_preapproved === 0 ? 'No' : '—')
                      }}
                    </div>
                    <div class="row"><strong>Purpose:</strong> {{ selectedMileageClaim.trip_purpose || '—' }}</div>
                    <div class="row"><strong>Cost center / client / school:</strong> {{ selectedMileageClaim.cost_center || '—' }}</div>
                  </div>
                  <div class="row"><strong>Notes:</strong> {{ selectedMileageClaim.notes || '—' }}</div>
                </div>
              </div>
            </div>

            <div class="rates-box" style="padding: 0; border: none;">
              <h3 class="section-title">Staging Workspace (Editable Output)</h3>
              <div class="hint">
                Adjust only these three columns: No Note / Draft / Finalized. Changes will not affect totals until you click <strong>Run Payroll</strong>.
              </div>

          <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Search (service code / provider)</label>
              <input v-model="workspaceSearch" type="text" placeholder="Search service code or provider…" />
            </div>
            <div class="field">
              <label>Provider</label>
              <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end;">
                <select v-model="selectedUserId">
                  <option :value="null">All providers</option>
                  <option v-for="u in agencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                </select>
                <button class="btn btn-secondary btn-sm" @click="clearSelectedProvider" :disabled="!selectedUserId">
                  Clear
                </button>
              </div>
              <div class="hint" style="margin-top: 6px;">
                {{ selectedUserId ? `Showing: ${selectedUserName}` : 'Showing: all providers' }}
              </div>
            </div>
            <div class="field">
              <label>Status</label>
              <div class="hint" v-if="isPeriodPosted">Posted (editing disabled)</div>
              <div class="hint" v-else>Editable</div>
            </div>
          </div>

          <div v-if="stagingLoading" class="muted">Loading staging...</div>
          <div v-else-if="stagingError" class="error-box">{{ stagingError }}</div>
          <div v-else class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Service Code</th>
                  <th class="right">Raw No Note</th>
                  <th class="right">Raw Draft</th>
                  <th class="right">Raw Finalized</th>
                  <th class="right">No Note</th>
                  <th class="right">Draft</th>
                  <th class="right">Finalized</th>
                  <th class="right">Old Done Notes</th>
                  <th class="right">Effective Finalized</th>
                  <th class="right">Pay Divisor</th>
                  <th class="right">Pay-hours</th>
                  <th class="right">Credits/Hours</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in workspaceMatchedRows" :key="stagingKey(r)" :class="{ 'carryover-row': (r.carryover?.oldDoneNotesUnits || 0) > 0 }">
                  <td>{{ r.lastName ? `${r.lastName}, ${r.firstName || ''}` : (r.providerName || '—') }}</td>
                  <td>{{ r.serviceCode }}</td>
                  <td class="right">{{ fmtNum(r.raw.noNoteUnits) }}</td>
                  <td class="right">{{ fmtNum(r.raw.draftUnits) }}</td>
                  <td class="right">{{ fmtNum(r.raw.finalizedUnits) }}</td>
                  <td class="right">
                    <input v-model="stagingEdits[stagingKey(r)].noNoteUnits" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </td>
                  <td class="right">
                    <input v-model="stagingEdits[stagingKey(r)].draftUnits" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </td>
                  <td class="right">
                    <input v-model="stagingEdits[stagingKey(r)].finalizedUnits" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </td>
                  <td class="right carryover-cell">{{ fmtNum(r.carryover?.oldDoneNotesUnits ?? 0) }}</td>
                  <td class="right">
                    {{
                      fmtNum(
                        Number(stagingEdits[stagingKey(r)]?.finalizedUnits || 0) + Number(r.carryover?.oldDoneNotesUnits || 0)
                      )
                    }}
                  </td>
                  <td class="right muted">{{ fmtNum(payDivisorForRow(r)) }}</td>
                  <td class="right muted">{{ fmtNum(payHoursForRow(r)) }}</td>
                  <td class="right muted">{{ fmtNum(creditsHoursForRow(r)) }}</td>
                  <td class="right">
                    <button
                      class="btn btn-secondary btn-sm"
                      @click="saveStagingRow(r)"
                      :disabled="savingStaging || isPeriodPosted"
                    >
                      Save
                    </button>
                  </td>
                </tr>
                <tr v-if="!workspaceMatchedRows.length">
                  <td colspan="14" class="muted">No rows found. Import the billing report for this period to populate the workspace.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="stagingUnmatched?.length" class="warn-box" style="margin-top: 12px;">
            <div><strong>Unmatched rows</strong> (couldn’t map clinician/provider name to a user in this org):</div>
            <div class="hint">These rows are not editable until the provider name matches a user (first+last) in this organization.</div>
            <div class="table-wrap" style="margin-top: 8px;">
              <table class="table">
                <thead>
                  <tr>
                    <th>Provider Name</th>
                    <th>Service Code</th>
                    <th class="right">No Note</th>
                    <th class="right">Draft</th>
                    <th class="right">Finalized</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(u, idx) in stagingUnmatched" :key="idx">
                    <td>{{ u.providerName }}</td>
                    <td>{{ u.serviceCode }}</td>
                    <td class="right">{{ fmtNum(u.effective?.noNoteUnits ?? 0) }}</td>
                    <td class="right">{{ fmtNum(u.effective?.draftUnits ?? 0) }}</td>
                    <td class="right">{{ fmtNum(u.effective?.finalizedUnits ?? 0) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="actions" style="margin-top: 16px; justify-content: flex-end;">
            <button v-if="selectedUserId" class="btn btn-secondary" @click="clearSelectedProvider">
              Clear Provider
            </button>
            <button class="btn btn-primary" @click="nextProvider">
              Next Employee
            </button>
          </div>

          <div v-if="selectedUserId">
          <h3 class="section-title" style="margin-top: 16px;">Adjustments (Add-ons / Overrides) — {{ selectedUserName }}</h3>
          <div class="card" style="margin-top: 10px;">
            <h3 class="card-title" style="margin: 0 0 6px 0;">Benefit Tier (Preview)</h3>
            <div v-if="selectedTier">
              <div class="row"><strong>{{ selectedTier.label }}</strong></div>
              <div class="row"><strong>Status:</strong> {{ selectedTier.status }}</div>
            </div>
            <div v-else class="muted">No tier preview available.</div>
          </div>
          <div v-if="adjustmentsError" class="error-box">{{ adjustmentsError }}</div>
          <div v-if="adjustmentsLoading" class="muted">Loading adjustments...</div>
          <div v-else class="adjustments-grid">
            <div class="field">
              <label>Manual Mileage Override ($)</label>
              <input v-model="adjustments.mileageAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">
                Approved mileage claims (auto): {{ approvedMileageClaimsLoading ? 'Loading…' : fmtMoney(approvedMileageClaimsAmount || 0) }}
              </div>
            </div>
            <div class="field">
              <label>Manual Med Cancel Override ($)</label>
              <input v-model="adjustments.medcancelAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">
                Approved Med Cancel claims (auto): {{ approvedMedcancelClaimsLoading ? 'Loading…' : fmtMoney(approvedMedcancelClaimsAmount || 0) }}
              </div>
            </div>
            <div class="field">
              <label>Other Taxable ($)</label>
              <input v-model="adjustments.otherTaxableAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>Bonus ($)</label>
              <input v-model="adjustments.bonusAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>Manual Reimbursement Override ($)</label>
              <input v-model="adjustments.reimbursementAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">
                Approved reimbursement claims (auto): {{ approvedReimbursementClaimsLoading ? 'Loading…' : fmtMoney(approvedReimbursementClaimsAmount || 0) }}
              </div>
            </div>
            <div class="field">
              <label>Salary Override ($)</label>
              <input v-model="adjustments.salaryAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>PTO Hours</label>
              <input v-model="adjustments.ptoHours" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>PTO Rate ($/hr)</label>
              <input v-model="adjustments.ptoRate" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="actions">
              <button class="btn btn-secondary" @click="saveAdjustments" :disabled="savingAdjustments || isPeriodPosted">
                {{ savingAdjustments ? 'Saving...' : 'Save Adjustments' }}
              </button>
            </div>
          </div>

          <h3 class="section-title" style="margin-top: 16px;">Multi-rate Card (Direct / Indirect / Other)</h3>
          <div v-if="rateCardError" class="error-box">{{ rateCardError }}</div>
          <div v-if="rateCardLoading" class="muted">Loading rate card...</div>
          <div v-else class="adjustments-grid">
            <div class="field">
              <label>Direct Rate ($/hr)</label>
              <input v-model="rateCard.directRate" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>Indirect Rate ($/hr)</label>
              <input v-model="rateCard.indirectRate" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>Other Rate 1 ($/hr)</label>
              <input v-model="rateCard.otherRate1" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>Other Rate 2 ($/hr)</label>
              <input v-model="rateCard.otherRate2" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>Other Rate 3 ($/hr)</label>
              <input v-model="rateCard.otherRate3" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="actions">
              <button class="btn btn-secondary" @click="saveRateCard" :disabled="savingRateCard || isPeriodPosted">
                {{ savingRateCard ? 'Saving...' : 'Save Rate Card' }}
              </button>
              <div class="hint">If a rate card exists, payroll uses it (hourly). Otherwise it falls back to per-service-code rates.</div>
            </div>
          </div>

          <h3 class="section-title" style="margin-top: 16px;">Rates & Breakdown</h3>
          <div class="hint" v-if="!selectedSummary">No computed pay yet for this provider in this period. Import the report to populate totals.</div>

          <div v-if="selectedSummary" class="table-wrap" style="margin-top: 10px;">
            <table class="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th class="right">Finalized</th>
                  <th class="right">Pay Divisor</th>
                  <th class="right">Pay-hours</th>
                  <th class="right">Duration (min)</th>
                  <th class="right">Credits/Hours</th>
                  <th class="right">Rate</th>
                  <th class="right">Amount</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(v, code) in (selectedSummary?.breakdown || {})" :key="code">
                  <tr v-if="!String(code).startsWith('_')">
                    <td class="code">{{ code }}</td>
                    <td class="right">{{ fmtNum(v.finalizedUnits ?? v.units ?? 0) }}</td>
                    <td class="right muted">{{ fmtNum(v.payDivisor ?? 1) }}</td>
                    <td class="right muted">{{ fmtNum(v.payHours ?? 0) }}</td>
                    <td class="right muted">{{ fmtNum(v.durationMinutes ?? 0) }}</td>
                    <td class="right muted">{{ fmtNum(v.hours ?? 0) }}</td>
                    <td class="right muted">{{ fmtMoney(v.rateAmount ?? 0) }}</td>
                    <td class="right">{{ fmtMoney(v.amount ?? 0) }}</td>
                    <td class="muted">{{ v.rateSource || '—' }}</td>
                  </tr>
                </template>
                <tr v-if="!selectedSummary?.breakdown || !Object.keys(selectedSummary.breakdown).filter((k) => !String(k).startsWith('_')).length">
                  <td colspan="9" class="muted">No breakdown available.</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="5" class="right"><strong>Total</strong></td>
                  <td class="right"><strong>{{ fmtNum(selectedSummary.total_hours ?? 0) }}</strong></td>
                  <td class="right muted"><strong>—</strong></td>
                  <td class="right"><strong>{{ fmtMoney(selectedSummary.total_amount ?? 0) }}</strong></td>
                  <td class="muted"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="rate-editor">
            <div class="field-row">
              <div class="field">
                <label>Service Code</label>
                <input v-model="rateServiceCode" type="text" placeholder="e.g., 97110" />
              </div>
              <div class="field">
                <label>Rate</label>
                <input v-model="rateAmount" type="number" step="0.01" placeholder="0.00" />
              </div>
            </div>
            <button class="btn btn-secondary" @click="saveRate" :disabled="savingRate || isPeriodPosted || !rateServiceCode || !selectedUserId">
              {{ savingRate ? 'Saving...' : 'Save Rate' }}
            </button>
            <div class="hint">After saving, re-import (or add a recompute button later) to refresh totals.</div>
          </div>

          </div>
        </div>
          </div>
        </div>

        <!-- View Ran Payroll modal -->
        <div v-if="showRunModal" class="modal-backdrop" @click.self="showRunModal = false">
          <div class="modal">
            <div class="modal-header">
              <div>
                <div class="modal-title">Ran Payroll (Private Totals)</div>
                <div class="hint">Review totals and add manual pay variables (mileage/bonus/etc.) before posting. If you change add-ons, click Re-run Payroll.</div>
              </div>
              <div class="actions" style="margin: 0;">
                <button class="btn btn-secondary btn-sm" @click="nextFlaggedRunProvider" :disabled="(auditFlaggedProviders || []).length <= 0">
                  Next Flagged ({{ (auditFlaggedProviders || []).length }})
                </button>
                <button class="btn btn-secondary btn-sm" @click="nextRunProvider" :disabled="(summaries || []).length <= 1">
                  Next Provider
                </button>
                <button class="btn btn-secondary btn-sm" @click="showRunModal = false">Close</button>
              </div>
            </div>

            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th class="right">Credits/Hours</th>
                    <th class="right">Subtotal</th>
                    <th class="right">Direct Hours</th>
                    <th class="right">Direct Pay</th>
                    <th class="right">Direct Hourly Rate</th>
                    <th class="right">Indirect Hours</th>
                    <th class="right">Indirect Pay</th>
                    <th class="right">Indirect Hourly Rate</th>
                    <th class="right">Effective Hourly Rate</th>
                    <th class="right">Adjustments</th>
                    <th class="right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in summaries" :key="s.id" class="clickable" @click="selectSummary(s)">
                    <td>{{ s.first_name }} {{ s.last_name }}</td>
                    <td class="right">{{ fmtNum(s.total_hours ?? 0) }}</td>
                    <td class="right">{{ fmtMoney(s.subtotal_amount) }}</td>
                    <td class="right">{{ fmtNum(s.direct_hours ?? 0) }}</td>
                    <td class="right">{{ fmtMoney((payTotalsFromBreakdown(s.breakdown).directAmount ?? 0)) }}</td>
                    <td class="right muted">
                      {{
                        (() => {
                          const { directAmount } = payTotalsFromBreakdown(s.breakdown);
                          const h = Number(s.direct_hours || 0);
                          return h > 0 ? fmtMoney(directAmount / h) : '—';
                        })()
                      }}
                    </td>
                    <td class="right">{{ fmtNum(s.indirect_hours ?? 0) }}</td>
                    <td class="right">{{ fmtMoney((payTotalsFromBreakdown(s.breakdown).indirectAmount ?? 0)) }}</td>
                    <td class="right muted">
                      {{
                        (() => {
                          const { indirectAmount } = payTotalsFromBreakdown(s.breakdown);
                          const h = Number(s.indirect_hours || 0);
                          return h > 0 ? fmtMoney(indirectAmount / h) : '—';
                        })()
                      }}
                    </td>
                    <td class="right muted">
                      {{
                        (() => {
                          const total = Number(s.total_hours || 0);
                          const directH = Number(s.direct_hours || 0);
                          const indirectH = Number(s.indirect_hours || 0);
                          const otherH = Math.max(0, total - directH - indirectH);
                          if (directH > 0 && indirectH <= 1e-9 && otherH <= 1e-9) {
                            const { directAmount } = payTotalsFromBreakdown(s.breakdown);
                            return fmtMoney(directAmount / (total || 1));
                          }
                          return '—';
                        })()
                      }}
                    </td>
                    <td class="right">{{ fmtMoney(s.adjustments_amount) }}</td>
                    <td class="right">{{ fmtMoney(s.total_amount) }}</td>
                  </tr>
                  <tr v-if="!summaries.length">
                    <td colspan="12" class="muted">No run results yet. Click Run Payroll first.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="selectedSummary" class="card" style="margin-top: 12px;">
              <h3 class="card-title">Provider Detail (What will be posted)</h3>
              <div class="row"><strong>Provider:</strong> {{ selectedSummary.first_name }} {{ selectedSummary.last_name }}</div>
              <div class="row"><strong>Total:</strong> {{ fmtMoney(selectedSummary.total_amount ?? 0) }}</div>

              <div class="card" style="margin-top: 10px;" v-if="selectedSummary.breakdown && selectedSummary.breakdown.__tier">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Benefit Tier</h3>
                <div class="row"><strong>{{ selectedSummary.breakdown.__tier.label }}</strong></div>
                <div class="row"><strong>Status:</strong> {{ selectedSummary.breakdown.__tier.status }}</div>
              </div>

              <h3 class="card-title" style="margin-top: 10px;">Service Codes</h3>
              <div class="muted" v-if="!selectedSummary.breakdown || !Object.keys(selectedSummary.breakdown).length">No breakdown available.</div>
              <div v-else class="codes">
                <div class="codes-head">
                  <div>Code</div>
                  <div class="right">No Note</div>
                  <div class="right">Draft</div>
                  <div class="right">Finalized</div>
                  <div class="right">Pay-hours</div>
                  <div class="right">Credits/Hours</div>
                  <div class="right">Rate</div>
                  <div class="right">Amount</div>
                </div>
                <div v-for="l in selectedSummaryServiceLines" :key="l.code" class="code-row">
                  <div class="code">{{ l.code }}</div>
                  <div class="right muted">{{ fmtNum(l.noNoteUnits ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.draftUnits ?? 0) }}</div>
                  <div class="right">{{ fmtNum(l.finalizedUnits ?? l.units ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.payHours ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.hours ?? 0) }}</div>
                  <div class="right muted">{{ fmtMoney(l.rateAmount ?? 0) }}</div>
                  <div class="right">{{ fmtMoney(l.amount ?? 0) }}</div>
                </div>
              </div>

              <div style="margin-top: 12px;">
                <h3 class="card-title">Manual Add-ons / Overrides</h3>
                <div class="hint">These are included after you Re-run Payroll.</div>
                <div v-if="adjustmentsError" class="error-box">{{ adjustmentsError }}</div>
                <div v-if="adjustmentsLoading" class="muted">Loading adjustments...</div>
                <div v-else class="adjustments-grid">
                  <div class="field">
                    <label>Mileage ($)</label>
                    <input v-model="adjustments.mileageAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </div>
                  <div class="field">
                    <label>Other Taxable ($)</label>
                    <input v-model="adjustments.otherTaxableAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </div>
                  <div class="field">
                    <label>Bonus ($)</label>
                    <input v-model="adjustments.bonusAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </div>
                  <div class="field">
                    <label>Manual Reimbursement Override ($)</label>
                    <input v-model="adjustments.reimbursementAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                    <div class="hint" style="margin-top: 4px;">
                      Approved reimbursement claims (auto): {{ approvedReimbursementClaimsLoading ? 'Loading…' : fmtMoney(approvedReimbursementClaimsAmount || 0) }}
                    </div>
                  </div>
                  <div class="field">
                    <label>Salary Override ($)</label>
                    <input v-model="adjustments.salaryAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </div>
                  <div class="field">
                    <label>PTO Hours</label>
                    <input v-model="adjustments.ptoHours" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </div>
                  <div class="field">
                    <label>PTO Rate ($/hr)</label>
                    <input v-model="adjustments.ptoRate" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </div>
                  <div class="actions">
                    <button class="btn btn-secondary" @click="saveAdjustments" :disabled="savingAdjustments || isPeriodPosted">
                      {{ savingAdjustments ? 'Saving...' : 'Save Add-ons' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Preview Post modal -->
        <div v-if="showPreviewPostModal" class="modal-backdrop" @click.self="showPreviewPostModal = false">
          <div class="modal">
            <div class="modal-header">
              <div>
                <div class="modal-title">Preview Post (Provider View)</div>
                <div class="hint">This is what providers will see after you click Post Payroll.</div>
              </div>
              <div class="actions" style="margin: 0;">
                <button class="btn btn-secondary btn-sm" @click="nextFlaggedPreviewProvider" :disabled="(auditFlaggedProviders || []).length <= 0">
                  Next Flagged ({{ (auditFlaggedProviders || []).length }})
                </button>
                <button class="btn btn-secondary btn-sm" @click="nextPreviewProvider" :disabled="(summaries || []).length <= 1">
                  Next Provider
                </button>
                <button class="btn btn-secondary btn-sm" @click="showPreviewPostModal = false">Close</button>
              </div>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr;">
              <div class="field">
                <label>Provider</label>
                <select v-model="previewUserId">
                  <option :value="null" disabled>Select a provider…</option>
                  <option v-for="s in summaries" :key="s.user_id" :value="s.user_id">{{ s.last_name }}, {{ s.first_name }}</option>
                </select>
              </div>
              <div class="field">
                <label>Pay period</label>
                <div class="hint">{{ periodRangeLabel(selectedPeriod) }}</div>
              </div>
              <div class="field">
                <label>Status</label>
                <div class="hint">{{ selectedPeriod?.status }}</div>
              </div>
            </div>

            <div v-if="previewSummary" class="card" style="margin-top: 12px;">
              <h3 class="card-title">Totals</h3>
              <div v-if="auditForPreviewProvider && auditForPreviewProvider.flags?.length" class="warn-box" style="margin: 10px 0;">
                <div><strong>Audit flags (review recommended)</strong></div>
                <div v-for="(f, i) in auditForPreviewProvider.flags" :key="i" class="muted">{{ f }}</div>
              </div>

              <div class="card" style="margin-top: 10px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Notifications (sent on Post)</h3>
                <div class="hint">These are alerts that will be created when you click Post Payroll (if applicable).</div>
                <div v-if="previewPostNotificationsError" class="warn-box" style="margin-top: 8px;">{{ previewPostNotificationsError }}</div>
                <div v-else-if="previewPostNotificationsLoading" class="muted" style="margin-top: 8px;">Loading notifications…</div>
                <div v-else-if="!(previewPostNotifications || []).length" class="muted" style="margin-top: 8px;">No post-time notifications for this provider.</div>
                <div v-else style="margin-top: 8px;">
                  <div v-for="(n, idx) in previewPostNotifications" :key="idx" class="row" style="margin-top: 6px;">
                    <div><strong>{{ n.title || n.type }}</strong></div>
                    <div class="muted">{{ n.message }}</div>
                  </div>
                </div>
              </div>

              <div class="card" style="margin-top: 10px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Provider payroll notices</h3>
                <div class="hint">These messages appear in the provider’s My Payroll breakdown.</div>
                <div v-if="previewUserPayrollHistoryError" class="warn-box" style="margin-top: 8px;">{{ previewUserPayrollHistoryError }}</div>
                <div v-else-if="previewUserPayrollHistoryLoading" class="muted" style="margin-top: 8px;">Loading notices…</div>
                <div v-else style="margin-top: 8px;">
                  <div v-if="previewCarryoverUnits > 0" class="warn-box" style="margin-top: 8px;">
                    <div><strong>Prior notes included in this payroll:</strong> {{ fmtNum(previewCarryoverUnits) }} units</div>
                    <div class="muted">Reminder: complete prior-period notes by Sunday 11:59pm after the pay period ends to avoid compensation delays.</div>
                  </div>

                  <div v-if="previewTwoPeriodsAgoUnpaid.total > 0" class="warn-box" style="margin-top: 8px; border: 1px solid #ffb5b5; background: #ffecec;">
                    <div><strong>Reminder: unpaid notes from 2 pay periods ago</strong></div>
                    <div class="muted" style="margin-top: 4px;"><strong>{{ previewTwoPeriodsAgoUnpaid.periodStart }} → {{ previewTwoPeriodsAgoUnpaid.periodEnd }}</strong></div>
                    <div style="margin-top: 6px;">
                      <strong>No Note:</strong> {{ fmtNum(previewTwoPeriodsAgoUnpaid.noNote) }} units
                      <span class="muted">•</span>
                      <strong>Draft:</strong> {{ fmtNum(previewTwoPeriodsAgoUnpaid.draft) }} units
                    </div>
                    <div class="muted" style="margin-top: 6px;">Complete outstanding notes to be included in a future payroll.</div>
                  </div>

                  <div v-if="previewUnpaidInPeriod.total > 0" class="warn-box" style="margin-top: 8px; border: 1px solid #ffd8a8; background: #fff4e6;">
                    <div><strong>Unpaid notes in this pay period</strong></div>
                    <div style="margin-top: 6px;">
                      <strong>No Note:</strong> {{ fmtNum(previewUnpaidInPeriod.noNote) }} units
                      <span class="muted">•</span>
                      <strong>Draft:</strong> {{ fmtNum(previewUnpaidInPeriod.draft) }} units
                    </div>
                    <div class="muted" style="margin-top: 6px;">
                      These units were not paid this period. Complete outstanding notes to be included in a future payroll.
                    </div>
                    <div class="muted" style="margin-top: 6px;">
                      Due to our EHR system, we are unable to differentiate a note that is incomplete for a session that did occur from a note that is incomplete for a session that did not occur.
                    </div>
                  </div>

                  <div v-if="previewCarryoverUnits <= 0 && previewTwoPeriodsAgoUnpaid.total <= 0 && previewUnpaidInPeriod.total <= 0" class="muted" style="margin-top: 8px;">
                    No provider payroll notices for this period.
                  </div>
                </div>
              </div>
              <div class="row"><strong>Total Pay:</strong> {{ fmtMoney(previewSummary.total_amount ?? 0) }}</div>
              <div class="row"><strong>Total Credits/Hours:</strong> {{ fmtNum(previewSummary.total_hours ?? 0) }}</div>
              <div class="row"><strong>Tier Credits (Final):</strong> {{ fmtNum(previewSummary.tier_credits_final ?? previewSummary.tier_credits_current ?? 0) }}</div>

              <div class="card" style="margin-top: 10px;" v-if="previewSummary.breakdown && previewSummary.breakdown.__tier">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Benefit Tier</h3>
                <div class="row"><strong>{{ previewSummary.breakdown.__tier.label }}</strong></div>
                <div class="row"><strong>Status:</strong> {{ previewSummary.breakdown.__tier.status }}</div>
              </div>

              <div class="card" style="margin-top: 10px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Direct / Indirect Totals</h3>
                <div class="row">
                  <strong>Direct:</strong>
                  {{ fmtNum(previewSummary.direct_hours ?? 0) }} hrs •
                  {{ fmtMoney(payTotalsFromBreakdown(previewSummary.breakdown).directAmount ?? 0) }} •
                  <span class="muted">
                    rate {{
                      (() => {
                        const h = Number(previewSummary.direct_hours || 0);
                        const amt = Number(payTotalsFromBreakdown(previewSummary.breakdown).directAmount || 0);
                        return h > 0 ? fmtMoney(amt / h) : '—';
                      })()
                    }}
                  </span>
                </div>
                <div class="row">
                  <strong>Indirect:</strong>
                  {{ fmtNum(previewSummary.indirect_hours ?? 0) }} hrs •
                  {{ fmtMoney(payTotalsFromBreakdown(previewSummary.breakdown).indirectAmount ?? 0) }} •
                  <span class="muted">
                    rate {{
                      (() => {
                        const h = Number(previewSummary.indirect_hours || 0);
                        const amt = Number(payTotalsFromBreakdown(previewSummary.breakdown).indirectAmount || 0);
                        return h > 0 ? fmtMoney(amt / h) : '—';
                      })()
                    }}
                  </span>
                </div>
              </div>

              <h3 class="card-title" style="margin-top: 12px;">Service Codes</h3>
              <div class="muted" v-if="!previewSummary.breakdown || !Object.keys(previewSummary.breakdown).length">No breakdown available.</div>
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
                <div v-for="l in previewSummaryServiceLines" :key="l.code" class="code-row">
                  <div class="code">{{ l.code }}</div>
                  <div class="right muted">{{ fmtNum(l.noNoteUnits ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.draftUnits ?? 0) }}</div>
                  <div class="right">{{ fmtNum(l.finalizedUnits ?? l.units ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.hours ?? 0) }}</div>
                  <div class="right muted">{{ fmtMoney(l.rateAmount ?? 0) }}</div>
                  <div class="right">{{ fmtMoney(l.amount ?? 0) }}</div>
                </div>
              </div>

              <h3 class="card-title" style="margin-top: 12px;">Adjustments (Included in ran payroll)</h3>
              <div v-if="previewAdjustmentsFromRun" class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th class="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Mileage</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.mileageAmount ?? 0) }}</td></tr>
                    <tr><td>Other Taxable</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.otherTaxableAmount ?? 0) }}</td></tr>
                    <tr><td>Bonus</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.bonusAmount ?? 0) }}</td></tr>
                    <tr><td>Reimbursement</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.reimbursementAmount ?? 0) }}</td></tr>
                    <tr><td>PTO Pay</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.ptoPay ?? 0) }}</td></tr>
                    <tr><td>Salary Override</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.salaryAmount ?? 0) }}</td></tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td class="right"><strong>Adjustments Total</strong></td>
                      <td class="right"><strong>{{ fmtMoney(previewSummary.adjustments_amount ?? 0) }}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div v-else class="muted">
                No adjustments were included in this run.
              </div>

              <div v-if="previewAdjustmentsError" class="warn-box" style="margin-top: 10px;">
                {{ previewAdjustmentsError }}
              </div>
            </div>
            <div v-else class="muted">Select a provider to preview.</div>
          </div>
        </div>

        <!-- Raw import modal -->
        <div v-if="showRawModal" class="modal-backdrop" @click.self="showRawModal = false">
          <div class="modal">
            <div class="modal-header">
              <div>
                <div class="modal-title">Raw Import (Draft Audit)</div>
                <div class="hint">
                  Review only DRAFT rows and mark which drafts are payable (default) vs not payable. This updates Payroll Stage immediately.
                </div>
              </div>
              <div class="actions" style="margin: 0;">
                <button class="btn btn-secondary btn-sm" @click="downloadRawCsv" :disabled="!selectedPeriodId">
                  Download CSV
                </button>
                <button class="btn btn-secondary btn-sm" @click="showRawModal = false">Close</button>
              </div>
            </div>
            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 10px;">
              <div class="field">
                <label>Search</label>
                <input v-model="rawDraftSearch" type="text" placeholder="Search provider / code / DOS…" />
              </div>
              <div class="field">
                <label>Rows</label>
                <select v-model="rawDraftOnly">
                  <option :value="true">Draft only</option>
                  <option :value="false">All (read-only)</option>
                </select>
              </div>
              <div class="field">
                <label>Status</label>
                <div class="hint" v-if="isPeriodPosted">Posted (locked)</div>
                <div class="hint" v-else>{{ updatingDraftPayable ? 'Saving…' : 'Editable' }}</div>
              </div>
            </div>
            <div v-if="rawDraftError" class="error-box">{{ rawDraftError }}</div>
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Provider Name</th>
                    <th>Service Code</th>
                    <th>Date</th>
                    <th class="right">Units</th>
                    <th>Note Status</th>
                    <th>Draft Payable?</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in rawDraftRows.slice(0, 200)" :key="r.id">
                    <td>{{ r.provider_name }}</td>
                    <td>{{ r.service_code }}</td>
                    <td class="muted">{{ r.service_date || '' }}</td>
                    <td class="right">{{ fmtNum(r.unit_count) }}</td>
                    <td>{{ r.note_status || '' }}</td>
                    <td>
                      <select
                        v-if="String(r.note_status || '').toUpperCase() === 'DRAFT'"
                        :disabled="isPeriodPosted || !rawDraftOnly"
                        :value="Number(r.draft_payable) ? 'payable' : 'not_payable'"
                        @change="toggleDraftPayable(r, $event.target.value === 'payable')"
                      >
                        <option value="payable">Payable (default)</option>
                        <option value="not_payable">Not payable</option>
                      </select>
                      <span v-else class="muted">—</span>
                    </td>
                  </tr>
                  <tr v-if="!rawDraftRows.length">
                    <td colspan="6" class="muted">No rows found.</td>
                  </tr>
                </tbody>
              </table>
              <div class="hint" v-if="rawDraftRows.length">Showing first 200 rows.</div>
            </div>
          </div>
        </div>

        <!-- No-note/Draft Unpaid carryover modal -->
        <div v-if="showCarryoverModal" class="modal-backdrop" @click.self="showCarryoverModal = false">
          <div class="modal">
            <div class="modal-header">
              <div>
                <div class="modal-title">No-note/Draft Unpaid (Detect Changes)</div>
                <div class="hint">
                  Select the prior pay period and compare two “Run Payroll” snapshots. If No-note/Draft unpaid drops, those units are treated as “Old Done Notes” to add into the current pay period.
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" @click="showCarryoverModal = false">Close</button>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr;">
              <div class="field">
                <label>Current pay period</label>
                <div class="hint">{{ periodRangeLabel(selectedPeriod) }}</div>
              </div>
              <div class="field">
                <label>Prior pay period</label>
                <select v-model="carryoverPriorPeriodId" :disabled="carryoverLoading">
                  <option :value="null" disabled>Select a prior period…</option>
                  <option v-for="p in carryoverCompareOptions" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                </select>
              </div>
              <div class="field">
                <label>Status</label>
                <div class="hint" v-if="isPeriodPosted">Posted (locked)</div>
                <div class="hint" v-else>Editable</div>
              </div>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 8px;">
              <div class="field">
                <label>Baseline run (used as “before”)</label>
                <select v-model="carryoverBaselineRunId" :disabled="carryoverLoading || !carryoverRuns.length">
                  <option :value="null" disabled>Select baseline run…</option>
                  <option v-for="r in carryoverRuns" :key="r.id" :value="r.id">{{ fmtDateTime(r.ran_at) }}</option>
                </select>
              </div>
              <div class="field">
                <label>Compare run (used as “after”)</label>
                <select v-model="carryoverCompareRunId" :disabled="carryoverLoading || !carryoverRuns.length">
                  <option :value="null" disabled>Select compare run…</option>
                  <option v-for="r in carryoverRuns" :key="r.id" :value="r.id">{{ fmtDateTime(r.ran_at) }}</option>
                </select>
              </div>
              <div class="field">
                <label>Tip</label>
                <div class="hint">If the prior period was only run once, there may be no changes to detect.</div>
              </div>
            </div>

            <div v-if="carryoverError" class="error-box">{{ carryoverError }}</div>
            <div v-if="carryoverLoading" class="muted">Computing differences...</div>
            <div v-if="!carryoverLoading && carryoverPreview.some((d) => d.type === 'new_session_detected' && d.flagged)" class="warn-box" style="margin-top: 10px;">
              <div><strong>New session detected</strong> in a past pay period.</div>
              <div class="hint">Adding sessions to a past pay period is ill-advised. If you proceed, confirm this is correct before posting.</div>
            </div>

            <div v-else class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Service Code</th>
                    <th class="right">Prev Unpaid</th>
                    <th class="right">Current Unpaid</th>
                    <th class="right">Finalized Δ</th>
                    <th>Type</th>
                    <th class="right">Old Done Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(d, idx) in carryoverPreview" :key="idx">
                    <td>{{ d.lastName ? `${d.lastName}, ${d.firstName || ''}` : (d.providerName || '—') }}</td>
                    <td>{{ d.serviceCode }}</td>
                    <td class="right">{{ fmtNum(d.prevUnpaidUnits) }}</td>
                    <td class="right">{{ fmtNum(d.currUnpaidUnits) }}</td>
                    <td class="right">{{ fmtNum(d.finalizedDelta ?? 0) }}</td>
                    <td>
                      <span v-if="d.type === 'manual'">Manual entry</span>
                      <span v-else-if="d.type === 'late_note_completion'">Late note completion</span>
                      <span v-else>New session detected</span>
                      <span v-if="d.flagged" class="muted"> (flag)</span>
                      <button
                        v-if="d.type === 'manual'"
                        class="btn btn-secondary btn-sm"
                        style="margin-left: 8px;"
                        @click="removeCarryoverRow(idx)"
                        :disabled="isPeriodPosted"
                      >
                        Remove
                      </button>
                    </td>
                    <td class="right carryover-cell">{{ fmtNum(d.carryoverFinalizedUnits) }}</td>
                  </tr>
                  <tr v-if="!carryoverPreview.length">
                    <td colspan="7" class="muted">No changes detected.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="actions" style="margin-top: 12px; justify-content: space-between;">
              <button class="btn btn-secondary" @click="manualCarryoverEnabled = !manualCarryoverEnabled" :disabled="isPeriodPosted">
                {{ manualCarryoverEnabled ? 'Hide Manual Add' : 'Manual Add' }}
              </button>
              <button class="btn btn-primary" @click="applyCarryover" :disabled="applyingCarryover || !carryoverPriorPeriodId || !carryoverPreview.length || isPeriodPosted">
                {{ applyingCarryover ? 'Applying...' : 'Add to current pay period payroll stage' }}
              </button>
            </div>

            <div v-if="manualCarryoverEnabled" class="card" style="margin-top: 10px;">
              <h3 class="section-title" style="margin-top: 0;">Manual Add (rare)</h3>
              <div class="hint">
                Manually add “Old Done Notes” units into the current pay period payroll stage.
              </div>
              <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 10px;">
                <div class="field">
                  <label>Provider</label>
                  <select v-model="manualCarryover.userId">
                    <option :value="null" disabled>Select a provider…</option>
                    <option v-for="u in agencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                  </select>
                </div>
                <div class="field">
                  <label>Service Code</label>
                  <input v-model="manualCarryover.serviceCode" type="text" placeholder="e.g., 97110" />
                </div>
                <div class="field">
                  <label>Old Done Notes units</label>
                  <input v-model="manualCarryover.oldDoneNotesUnits" type="number" step="0.01" placeholder="0.00" />
                </div>
              </div>
              <div class="actions" style="margin: 0; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="addManualCarryoverRow" :disabled="isPeriodPosted">
                  Add row
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div class="card" v-else>
        <h2 class="card-title">Period Details</h2>
        <div class="muted">Upload a payroll report and we’ll auto-detect the correct pay period (Sat→Fri, 14 days).</div>
        <div class="import-box" style="margin-top: 12px;">
          <div class="import-title">Import Billing Report</div>
          <div class="import-subtitle">CSV/XLSX supported. Must include a service date column (e.g., “Date of Service” / “DOS”).</div>
          <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onFilePick" />
          <div class="hint" v-if="detectedPeriodHint">{{ detectedPeriodHint }}</div>
          <button class="btn btn-primary" @click="autoImport" :disabled="autoImporting || !importFile || !agencyId">
            {{ autoImporting ? 'Detecting...' : 'Auto-detect Pay Period & Import' }}
          </button>
          <div class="hint" v-if="!agencyId">Select an organization first.</div>
        </div>
      </div>
    </div>

    <div class="card" v-if="isSuperAdmin" style="margin-top: 12px;">
      <h2 class="card-title">Rate Sheet Import (Super Admin)</h2>
      <div class="hint">
        Bulk import provider pay rates (CSV/XLSX). This updates Direct/Indirect hourly rates and per-service-code rates.
      </div>
      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr auto;">
        <div class="field">
          <label>Upload rate sheet</label>
          <input
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            @change="onRateSheetPick"
          />
          <div class="hint" v-if="!agencyId">Select an organization first.</div>
          <div class="warn-box" v-if="rateSheetError">{{ rateSheetError }}</div>
          <div class="hint" v-if="rateSheetResult">
            Agency: <strong>{{ rateSheetResult.agencyId }}</strong> •
            Processed: <strong>{{ rateSheetResult.processed }}</strong>
            <span v-if="rateSheetResult.skippedInactive"> • Skipped inactive: <strong>{{ rateSheetResult.skippedInactive }}</strong></span>
            • Updated rate cards: <strong>{{ rateSheetResult.updatedRateCards }}</strong>
            • Per-code rates upserted: <strong>{{ rateSheetResult.upsertedPerCodeRates }}</strong>
            <span v-if="(rateSheetResult.createdUsers || []).length"> • Created users: <strong>{{ rateSheetResult.createdUsers.length }}</strong></span>
            <span v-if="(rateSheetResult.errors || []).length"> • Errors: <strong>{{ rateSheetResult.errors.length }}</strong></span>
          </div>
          <div class="hint" v-if="rateSheetResult?.createdTemplate">
            Template created: <strong>{{ rateSheetResult.createdTemplate.name }}</strong>
          </div>
          <div class="warn-box" v-if="(rateSheetResult?.errors || []).length" style="margin-top: 10px;">
            <div><strong>Import issues (first 5):</strong></div>
            <div v-for="(e, idx) in (rateSheetResult.errors || []).slice(0, 5)" :key="idx" class="hint">
              Row {{ e.row }} — {{ e.employeeName }}: {{ e.error }}
            </div>
          </div>
          <div class="hint" v-if="(rateSheetResult?.rowMatches || []).length" style="margin-top: 10px;">
            <div><strong>Matched users (first 5):</strong></div>
            <div v-for="(m, idx) in (rateSheetResult.rowMatches || []).slice(0, 5)" :key="idx">
              {{ m.employeeName }} → userId {{ m.matchedUserId }}<span v-if="m.createdUser" class="muted"> (created)</span>
            </div>
          </div>
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <button class="btn btn-primary" @click="importRateSheet" :disabled="importingRateSheet || !rateSheetFile || !agencyId">
            {{ importingRateSheet ? 'Importing...' : 'Import Rate Sheet' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useOrganizationStore } from '../../store/organization';
import { useAuthStore } from '../../store/auth';

const agencyStore = useAgencyStore();
const organizationStore = useOrganizationStore();
const authStore = useAuthStore();

const isSuperAdmin = computed(() => authStore.user?.role === 'super_admin');

const orgSearch = ref('');
const selectedOrgId = ref(null);

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || organizationStore.organizationContext?.id || null;
});

const periods = ref([]);
const selectedPeriodId = ref(null);
const selectedPeriod = ref(null);
const summaries = ref([]);
const error = ref('');

const importFile = ref(null);
const importing = ref(false);
const unmatchedProviders = ref([]);
const createdUsers = ref([]);
const autoImporting = ref(false);
const detectedPeriodHint = ref('');
const confirmAutoImportOpen = ref(false);
const autoDetecting = ref(false);
const autoDetectResult = ref(null); // { detected, existingPeriodId }
const autoImportChoiceMode = ref('detected'); // 'detected' | 'existing' | 'custom'
const autoImportExistingPeriodId = ref(null);
const autoImportCustomStart = ref('');
const autoImportCustomEnd = ref('');

const rateSheetFile = ref(null);
const importingRateSheet = ref(false);
const rateSheetError = ref('');
const rateSheetResult = ref(null);

const selectedSummary = ref(null);
const selectedUserId = ref(null);
const agencyUsers = ref([]);
const loadingUsers = ref(false);
const rateServiceCode = ref('');
const rateAmount = ref('');
const savingRate = ref(false);
const submitting = ref(false);

const stagingMatched = ref([]);
const stagingUnmatched = ref([]);
const stagingLoading = ref(false);
const stagingError = ref('');
const tierByUserId = ref({});
const stagingEdits = ref({});
const stagingEditsBaseline = ref({});
const savingStaging = ref(false);
const workspaceSearch = ref('');
const showStageModal = ref(false);
const showRawModal = ref(false);
const showRunModal = ref(false);
const showPreviewPostModal = ref(false);
const previewPostNotificationsLoading = ref(false);
const previewPostNotificationsError = ref('');
const previewPostNotifications = ref([]);
const previewUserPayrollHistoryLoading = ref(false);
const previewUserPayrollHistoryError = ref('');
const previewUserPayrollHistory = ref([]); // PayrollSummary.listForUser rows (includes period_start/end/status)

const previewCarryoverUnits = computed(() => {
  const b = previewSummary.value?.breakdown || null;
  const u = Number(b?.__carryover?.oldDoneNotesUnitsTotal || 0);
  return Number.isFinite(u) ? u : 0;
});

const previewUnpaidInPeriod = computed(() => {
  const noNote = Number(previewSummary.value?.no_note_units || 0);
  const draft = Number(previewSummary.value?.draft_units || 0);
  const safeNo = Number.isFinite(noNote) ? noNote : 0;
  const safeDr = Number.isFinite(draft) ? draft : 0;
  return { noNote: safeNo, draft: safeDr, total: safeNo + safeDr };
});

const previewTwoPeriodsAgoRow = computed(() => {
  const rows = previewUserPayrollHistory.value || [];
  if (!selectedPeriodId.value || !previewUserId.value) return null;
  const idx = rows.findIndex((r) => Number(r.payroll_period_id) === Number(selectedPeriodId.value));
  if (idx < 0) return null;
  // rows are ordered DESC by period_start; 2 periods ago is +2
  return rows[idx + 2] || null;
});

const previewTwoPeriodsAgoUnpaid = computed(() => {
  const r = previewTwoPeriodsAgoRow.value;
  if (!r) return { noNote: 0, draft: 0, total: 0, periodStart: '', periodEnd: '' };
  const noNote = Number(r.no_note_units || 0);
  const draft = Number(r.draft_units || 0);
  const safeNo = Number.isFinite(noNote) ? noNote : 0;
  const safeDr = Number.isFinite(draft) ? draft : 0;
  return {
    noNote: safeNo,
    draft: safeDr,
    total: safeNo + safeDr,
    periodStart: String(r.period_start || '').slice(0, 10),
    periodEnd: String(r.period_end || '').slice(0, 10)
  };
});
const showCarryoverModal = ref(false);
const rawImportRows = ref([]);
const rawDraftSearch = ref('');
const rawDraftOnly = ref(true);
const updatingDraftPayable = ref(false);
const rawDraftError = ref('');
const runningPayroll = ref(false);
const postingPayroll = ref(false);
const resettingPeriod = ref(false);
const previewUserId = ref(null);
const previewAdjustments = ref(null);
const previewAdjustmentsLoading = ref(false);
const previewAdjustmentsError = ref('');

const mileageRatesLoading = ref(false);
const savingMileageRates = ref(false);
const mileageRatesError = ref('');
const mileageRatesDraft = ref({ tier1: 0, tier2: 0, tier3: 0 });

const pendingMileageClaims = ref([]);
const pendingMileageLoading = ref(false);
const pendingMileageError = ref('');
const approvingMileageClaimId = ref(null);
const mileageTierByClaimId = ref({});
const mileageTargetPeriodByClaimId = ref({});

const showMileageDetailsModal = ref(false);
const selectedMileageClaim = ref(null);

const pendingMedcancelClaims = ref([]);
const pendingMedcancelLoading = ref(false);
const pendingMedcancelError = ref('');
const approvingMedcancelClaimId = ref(null);
const medcancelTargetPeriodByClaimId = ref({});

const pendingReimbursementClaims = ref([]);
const pendingReimbursementLoading = ref(false);
const pendingReimbursementError = ref('');
const approvingReimbursementClaimId = ref(null);
const reimbursementTargetPeriodByClaimId = ref({});

const pendingTimeClaims = ref([]);
const pendingTimeLoading = ref(false);
const pendingTimeError = ref('');
const approvingTimeClaimId = ref(null);
const timeTargetPeriodByClaimId = ref({});

const serviceCodeRules = ref([]);
const serviceCodeRulesLoading = ref(false);
const serviceCodeRulesError = ref('');

// Process Changes workflow (late notes carryover)
const processTargetPeriodId = ref(null); // number | null | -1 (auto-create suggested)
const processImportFile = ref(null);
const processingChanges = ref(false);
const processError = ref('');
const processDetectedHint = ref('');
const processSourcePeriodId = ref(null);
const processSourcePeriodLabel = ref('');
const processTargetEffectiveId = ref(null);
const processTargetEffectiveLabel = ref('');

const processConfirmOpen = ref(false);
const processDetectResult = ref(null); // { detected, existingPeriodId }
const processChoiceMode = ref('detected'); // 'detected' | 'existing' | 'custom'
const processExistingPeriodId = ref(null);
const processCustomStart = ref('');
const processCustomEnd = ref('');

// Legacy (removed from UI)
const applyToCurrentPeriodId = ref(null); // keep to avoid breaking older helpers
const creatingCurrentPeriod = ref(false);
const lastImportedPeriodId = ref(null);

const carryoverPriorPeriodId = ref(null);
const carryoverRuns = ref([]);
const carryoverBaselineRunId = ref(null);
const carryoverCompareRunId = ref(null);
const carryoverLoading = ref(false);
const carryoverError = ref('');
const carryoverPreview = ref([]);
const applyingCarryover = ref(false);
const manualCarryoverEnabled = ref(false);
const manualCarryover = ref({
  userId: null,
  serviceCode: '',
  oldDoneNotesUnits: ''
});

const adjustments = ref({
  mileageAmount: 0,
  otherTaxableAmount: 0,
  bonusAmount: 0,
  reimbursementAmount: 0,
  salaryAmount: 0,
  ptoHours: 0,
  ptoRate: 0
});

const approvedMileageClaimsLoading = ref(false);
const approvedMileageClaimsAmount = ref(0);

const loadApprovedMileageClaimsAmount = async () => {
  const uid = selectedUserId.value;
  const pid = selectedPeriodId.value;
  if (!agencyId.value || !uid || !pid) {
    approvedMileageClaimsAmount.value = 0;
    return;
  }
  try {
    approvedMileageClaimsLoading.value = true;
    const resp = await api.get('/payroll/mileage-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: pid,
        userId: uid
      }
    });
    const rows = resp.data || [];
    approvedMileageClaimsAmount.value = rows.reduce((a, c) => a + Number(c?.applied_amount || 0), 0);
  } catch {
    approvedMileageClaimsAmount.value = 0;
  } finally {
    approvedMileageClaimsLoading.value = false;
  }
};

const approvedMedcancelClaimsLoading = ref(false);
const approvedMedcancelClaimsAmount = ref(0);

const loadApprovedMedcancelClaimsAmount = async () => {
  const uid = selectedUserId.value;
  const pid = selectedPeriodId.value;
  if (!agencyId.value || !uid || !pid) {
    approvedMedcancelClaimsAmount.value = 0;
    return;
  }
  try {
    approvedMedcancelClaimsLoading.value = true;
    const resp = await api.get('/payroll/medcancel-claims', {
      params: {
        agencyId: agencyId.value,
        userId: uid,
        status: 'approved',
        targetPeriodId: pid
      }
    });
    const rows = resp.data || [];
    approvedMedcancelClaimsAmount.value = rows.reduce((a, c) => a + Number(c?.applied_amount || 0), 0);
  } catch {
    approvedMedcancelClaimsAmount.value = 0;
  } finally {
    approvedMedcancelClaimsLoading.value = false;
  }
};

const approvedReimbursementClaimsLoading = ref(false);
const approvedReimbursementClaimsAmount = ref(0);

const loadApprovedReimbursementClaimsAmount = async () => {
  const uid = selectedUserId.value;
  const pid = selectedPeriodId.value;
  if (!agencyId.value || !uid || !pid) {
    approvedReimbursementClaimsAmount.value = 0;
    return;
  }
  try {
    approvedReimbursementClaimsLoading.value = true;
    const resp = await api.get('/payroll/reimbursement-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: pid,
        userId: uid
      }
    });
    const rows = resp.data || [];
    approvedReimbursementClaimsAmount.value = rows.reduce((a, c) => a + Number(c?.applied_amount || c?.amount || 0), 0);
  } catch {
    approvedReimbursementClaimsAmount.value = 0;
  } finally {
    approvedReimbursementClaimsLoading.value = false;
  }
};

const loadApprovedTimeClaimsAmount = async () => {
  const uid = selectedUserId.value;
  const pid = selectedPeriodId.value;
  if (!agencyId.value || !uid || !pid) {
    approvedTimeClaimsAmount.value = 0;
    return;
  }
  try {
    approvedTimeClaimsLoading.value = true;
    const resp = await api.get('/payroll/time-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: pid,
        userId: uid
      }
    });
    const rows = resp.data || [];
    approvedTimeClaimsAmount.value = rows.reduce((a, c) => a + Number(c?.applied_amount || 0), 0);
  } catch {
    approvedTimeClaimsAmount.value = 0;
  } finally {
    approvedTimeClaimsLoading.value = false;
  }
};

const approvedMileageListLoading = ref(false);
const approvedMileageListError = ref('');
const approvedMileageClaims = ref([]);
const approvedMileageMoveTargetByClaimId = ref({});
const movingMileageClaimId = ref(null);

const approvedMedcancelListLoading = ref(false);
const approvedMedcancelListError = ref('');
const approvedMedcancelClaims = ref([]);
const unapprovingMedcancelClaimId = ref(null);

const approvedReimbursementListLoading = ref(false);
const approvedReimbursementListError = ref('');
const approvedReimbursementClaims = ref([]);
const approvedReimbursementMoveTargetByClaimId = ref({});
const movingReimbursementClaimId = ref(null);

const approvedTimeClaimsLoading = ref(false);
const approvedTimeClaimsAmount = ref(0);
const approvedTimeListLoading = ref(false);
const approvedTimeListError = ref('');
const approvedTimeClaims = ref([]);
const approvedTimeMoveTargetByClaimId = ref({});
const movingTimeClaimId = ref(null);

const receiptUrl = (c) => {
  const raw = String(c?.receipt_file_path || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/uploads/${raw.substring('uploads/'.length)}`;
  return `/uploads/${raw}`;
};

const timeTypeLabel = (c) => {
  const t = String(c?.claim_type || '').toLowerCase();
  if (t === 'meeting_training') return 'Meeting/Training';
  if (t === 'excess_holiday') return 'Excess/Holiday';
  if (t === 'service_correction') return 'Service correction';
  if (t === 'overtime_evaluation') return 'Overtime eval';
  return t || 'Time';
};

const loadApprovedMileageClaimsList = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    approvedMileageListLoading.value = true;
    approvedMileageListError.value = '';
    const resp = await api.get('/payroll/mileage-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: selectedPeriodId.value
      }
    });
    approvedMileageClaims.value = resp.data || [];
    const next = { ...(approvedMileageMoveTargetByClaimId.value || {}) };
    for (const c of approvedMileageClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || c.target_payroll_period_id || selectedPeriodId.value;
    }
    approvedMileageMoveTargetByClaimId.value = next;
  } catch (e) {
    approvedMileageListError.value = e.response?.data?.error?.message || e.message || 'Failed to load approved mileage claims';
    approvedMileageClaims.value = [];
  } finally {
    approvedMileageListLoading.value = false;
  }
};

const unapproveMileageClaim = async (c) => {
  if (!c?.id) return;
  const ok = window.confirm('Unapprove this mileage claim? It will return to Pending for re-approval.');
  if (!ok) return;
  try {
    movingMileageClaimId.value = c.id;
    approvedMileageListError.value = '';
    await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'unapprove' });
    await loadApprovedMileageClaimsList();
    await loadAllPendingMileageClaims();
  } catch (e) {
    approvedMileageListError.value = e.response?.data?.error?.message || e.message || 'Failed to unapprove mileage claim';
  } finally {
    movingMileageClaimId.value = null;
  }
};

const moveApprovedMileageClaim = async (c) => {
  if (!c?.id) return;
  const targetPayrollPeriodId = Number(approvedMileageMoveTargetByClaimId.value?.[c.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) return;
  if (isTargetPeriodLocked(targetPayrollPeriodId)) {
    approvedMileageListError.value = 'Target pay period is locked (posted/finalized).';
    return;
  }
  const ok = window.confirm('Move this approved claim to the selected pay period?');
  if (!ok) return;
  try {
    movingMileageClaimId.value = c.id;
    approvedMileageListError.value = '';
    await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'move', targetPayrollPeriodId });
    await loadApprovedMileageClaimsList();
    await loadApprovedMileageClaimsAmount();
  } catch (e) {
    approvedMileageListError.value = e.response?.data?.error?.message || e.message || 'Failed to move mileage claim';
  } finally {
    movingMileageClaimId.value = null;
  }
};

const loadApprovedMedcancelClaimsList = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    approvedMedcancelListLoading.value = true;
    approvedMedcancelListError.value = '';
    const resp = await api.get('/payroll/medcancel-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: selectedPeriodId.value
      }
    });
    approvedMedcancelClaims.value = resp.data || [];
  } catch (e) {
    approvedMedcancelListError.value = e.response?.data?.error?.message || e.message || 'Failed to load approved Med Cancel claims';
    approvedMedcancelClaims.value = [];
  } finally {
    approvedMedcancelListLoading.value = false;
  }
};

const unapproveMedcancelClaim = async (c) => {
  if (!c?.id) return;
  const ok = window.confirm('Unapprove this Med Cancel claim? It will return to Pending for re-approval.');
  if (!ok) return;
  try {
    unapprovingMedcancelClaimId.value = c.id;
    approvedMedcancelListError.value = '';
    await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'unapprove' });
    await loadApprovedMedcancelClaimsList();
    await loadAllPendingMedcancelClaims();
    await loadPeriodDetails();
    await loadApprovedMedcancelClaimsAmount();
  } catch (e) {
    approvedMedcancelListError.value = e.response?.data?.error?.message || e.message || 'Failed to unapprove Med Cancel claim';
  } finally {
    unapprovingMedcancelClaimId.value = null;
  }
};

const loadApprovedReimbursementClaimsList = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    approvedReimbursementListLoading.value = true;
    approvedReimbursementListError.value = '';
    const resp = await api.get('/payroll/reimbursement-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: selectedPeriodId.value
      }
    });
    approvedReimbursementClaims.value = resp.data || [];
    const next = { ...(approvedReimbursementMoveTargetByClaimId.value || {}) };
    for (const c of approvedReimbursementClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || c.target_payroll_period_id || selectedPeriodId.value;
    }
    approvedReimbursementMoveTargetByClaimId.value = next;
  } catch (e) {
    approvedReimbursementListError.value = e.response?.data?.error?.message || e.message || 'Failed to load approved reimbursements';
    approvedReimbursementClaims.value = [];
  } finally {
    approvedReimbursementListLoading.value = false;
  }
};

const loadApprovedTimeClaimsList = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    approvedTimeListLoading.value = true;
    approvedTimeListError.value = '';
    const resp = await api.get('/payroll/time-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: selectedPeriodId.value
      }
    });
    approvedTimeClaims.value = resp.data || [];
    const next = { ...(approvedTimeMoveTargetByClaimId.value || {}) };
    for (const c of approvedTimeClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || c.target_payroll_period_id || selectedPeriodId.value;
    }
    approvedTimeMoveTargetByClaimId.value = next;
  } catch (e) {
    approvedTimeListError.value = e.response?.data?.error?.message || e.message || 'Failed to load approved time claims';
    approvedTimeClaims.value = [];
  } finally {
    approvedTimeListLoading.value = false;
  }
};

const loadPendingReimbursementClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    pendingReimbursementLoading.value = true;
    pendingReimbursementError.value = '';
    const resp = await api.get('/payroll/reimbursement-claims', {
      params: { agencyId: agencyId.value, status: 'submitted', targetPeriodId: selectedPeriodId.value }
    });
    pendingReimbursementClaims.value = resp.data || [];
    const next = { ...(reimbursementTargetPeriodByClaimId.value || {}) };
    for (const c of pendingReimbursementClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || selectedPeriodId.value;
    }
    reimbursementTargetPeriodByClaimId.value = next;
  } catch (e) {
    pendingReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending reimbursements';
    pendingReimbursementClaims.value = [];
  } finally {
    pendingReimbursementLoading.value = false;
  }
};

const loadAllPendingReimbursementClaims = async () => {
  if (!agencyId.value) return;
  try {
    pendingReimbursementLoading.value = true;
    pendingReimbursementError.value = '';
    const resp = await api.get('/payroll/reimbursement-claims', {
      params: { agencyId: agencyId.value, status: 'submitted' }
    });
    pendingReimbursementClaims.value = resp.data || [];
    const next = { ...(reimbursementTargetPeriodByClaimId.value || {}) };
    for (const c of pendingReimbursementClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || c.suggested_payroll_period_id || selectedPeriodId.value;
    }
    reimbursementTargetPeriodByClaimId.value = next;
  } catch (e) {
    pendingReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending reimbursements';
    pendingReimbursementClaims.value = [];
  } finally {
    pendingReimbursementLoading.value = false;
  }
};

const loadPendingTimeClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    pendingTimeLoading.value = true;
    pendingTimeError.value = '';
    const resp = await api.get('/payroll/time-claims', {
      params: { agencyId: agencyId.value, status: 'submitted', targetPeriodId: selectedPeriodId.value }
    });
    pendingTimeClaims.value = resp.data || [];
    const next = { ...(timeTargetPeriodByClaimId.value || {}) };
    for (const c of pendingTimeClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || selectedPeriodId.value;
    }
    timeTargetPeriodByClaimId.value = next;
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending time claims';
    pendingTimeClaims.value = [];
  } finally {
    pendingTimeLoading.value = false;
  }
};

const loadAllPendingTimeClaims = async () => {
  if (!agencyId.value) return;
  try {
    pendingTimeLoading.value = true;
    pendingTimeError.value = '';
    const resp = await api.get('/payroll/time-claims', {
      params: { agencyId: agencyId.value, status: 'submitted' }
    });
    pendingTimeClaims.value = resp.data || [];
    const next = { ...(timeTargetPeriodByClaimId.value || {}) };
    for (const c of pendingTimeClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || c.suggested_payroll_period_id || selectedPeriodId.value;
    }
    timeTargetPeriodByClaimId.value = next;
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending time claims';
    pendingTimeClaims.value = [];
  } finally {
    pendingTimeLoading.value = false;
  }
};

const approveTimeClaim = async (c) => {
  if (!c?.id) return;
  const targetPayrollPeriodId = Number(timeTargetPeriodByClaimId.value?.[c.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) return;
  // Optional override: leave blank to let backend compute defaults where possible.
  const overrideRaw = window.prompt('Applied amount override (leave blank to auto-calc):', '') || '';
  const appliedAmount = String(overrideRaw).trim() ? Number(overrideRaw) : null;
  if (appliedAmount !== null && (!Number.isFinite(appliedAmount) || appliedAmount < 0)) {
    pendingTimeError.value = 'Applied amount must be a non-negative number.';
    return;
  }
  try {
    approvingTimeClaimId.value = c.id;
    pendingTimeError.value = '';
    await api.patch(`/payroll/time-claims/${c.id}`, {
      action: 'approve',
      targetPayrollPeriodId,
      appliedAmount
    });
    await loadAllPendingTimeClaims();
    await loadApprovedTimeClaimsList();
    await loadApprovedTimeClaimsAmount();
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to approve time claim';
  } finally {
    approvingTimeClaimId.value = null;
  }
};

const rejectTimeClaim = async (c) => {
  if (!c?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingTimeClaimId.value = c.id;
    pendingTimeError.value = '';
    await api.patch(`/payroll/time-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() });
    await loadAllPendingTimeClaims();
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to reject time claim';
  } finally {
    approvingTimeClaimId.value = null;
  }
};

const returnTimeClaim = async (c) => {
  if (!c?.id) return;
  const note = window.prompt('Send back note (required):', '') || '';
  if (!String(note).trim()) return;
  try {
    approvingTimeClaimId.value = c.id;
    pendingTimeError.value = '';
    await api.patch(`/payroll/time-claims/${c.id}`, { action: 'return', note: String(note).trim() });
    await loadAllPendingTimeClaims();
    await loadApprovedTimeClaimsList();
    await loadApprovedTimeClaimsAmount();
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to send back time claim';
  } finally {
    approvingTimeClaimId.value = null;
  }
};

const unapproveTimeClaim = async (c) => {
  if (!c?.id) return;
  const ok = window.confirm('Unapprove this time claim? It will return to Pending for re-approval.');
  if (!ok) return;
  try {
    movingTimeClaimId.value = c.id;
    approvedTimeListError.value = '';
    await api.patch(`/payroll/time-claims/${c.id}`, { action: 'unapprove' });
    await loadApprovedTimeClaimsList();
    await loadAllPendingTimeClaims();
    await loadApprovedTimeClaimsAmount();
  } catch (e) {
    approvedTimeListError.value = e.response?.data?.error?.message || e.message || 'Failed to unapprove time claim';
  } finally {
    movingTimeClaimId.value = null;
  }
};

const moveApprovedTimeClaim = async (c) => {
  if (!c?.id) return;
  const targetPayrollPeriodId = Number(approvedTimeMoveTargetByClaimId.value?.[c.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) return;
  if (isTargetPeriodLocked(targetPayrollPeriodId)) {
    approvedTimeListError.value = 'Target pay period is locked (posted/finalized).';
    return;
  }
  const ok = window.confirm('Move this approved time claim to the selected pay period?');
  if (!ok) return;
  try {
    movingTimeClaimId.value = c.id;
    approvedTimeListError.value = '';
    await api.patch(`/payroll/time-claims/${c.id}`, { action: 'move', targetPayrollPeriodId });
    await loadApprovedTimeClaimsList();
    await loadApprovedTimeClaimsAmount();
  } catch (e) {
    approvedTimeListError.value = e.response?.data?.error?.message || e.message || 'Failed to move time claim';
  } finally {
    movingTimeClaimId.value = null;
  }
};
const approveReimbursementClaim = async (c) => {
  if (!c?.id) return;
  const targetPayrollPeriodId = Number(reimbursementTargetPeriodByClaimId.value?.[c.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) return;
  try {
    approvingReimbursementClaimId.value = c.id;
    pendingReimbursementError.value = '';
    await api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'approve', targetPayrollPeriodId });
    await loadAllPendingReimbursementClaims();
    await loadApprovedReimbursementClaimsList();
    await loadApprovedReimbursementClaimsAmount();
  } catch (e) {
    pendingReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to approve reimbursement';
  } finally {
    approvingReimbursementClaimId.value = null;
  }
};

const rejectReimbursementClaim = async (c) => {
  if (!c?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingReimbursementClaimId.value = c.id;
    pendingReimbursementError.value = '';
    await api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() });
    await loadAllPendingReimbursementClaims();
  } catch (e) {
    pendingReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to reject reimbursement';
  } finally {
    approvingReimbursementClaimId.value = null;
  }
};

const returnReimbursementClaim = async (c) => {
  if (!c?.id) return;
  const note = window.prompt('Send back note (required):', '') || '';
  if (!String(note).trim()) return;
  try {
    approvingReimbursementClaimId.value = c.id;
    pendingReimbursementError.value = '';
    await api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'return', note: String(note).trim() });
    await loadAllPendingReimbursementClaims();
    await loadApprovedReimbursementClaimsList();
    await loadApprovedReimbursementClaimsAmount();
  } catch (e) {
    pendingReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to send back reimbursement';
  } finally {
    approvingReimbursementClaimId.value = null;
  }
};

const unapproveReimbursementClaim = async (c) => {
  if (!c?.id) return;
  const ok = window.confirm('Unapprove this reimbursement? It will return to Pending for re-approval.');
  if (!ok) return;
  try {
    movingReimbursementClaimId.value = c.id;
    approvedReimbursementListError.value = '';
    await api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'unapprove' });
    await loadApprovedReimbursementClaimsList();
    await loadAllPendingReimbursementClaims();
    await loadApprovedReimbursementClaimsAmount();
  } catch (e) {
    approvedReimbursementListError.value = e.response?.data?.error?.message || e.message || 'Failed to unapprove reimbursement';
  } finally {
    movingReimbursementClaimId.value = null;
  }
};

const moveApprovedReimbursementClaim = async (c) => {
  if (!c?.id) return;
  const targetPayrollPeriodId = Number(approvedReimbursementMoveTargetByClaimId.value?.[c.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) return;
  if (isTargetPeriodLocked(targetPayrollPeriodId)) {
    approvedReimbursementListError.value = 'Target pay period is locked (posted/finalized).';
    return;
  }
  const ok = window.confirm('Move this approved reimbursement to the selected pay period?');
  if (!ok) return;
  try {
    movingReimbursementClaimId.value = c.id;
    approvedReimbursementListError.value = '';
    await api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'move', targetPayrollPeriodId });
    await loadApprovedReimbursementClaimsList();
    await loadApprovedReimbursementClaimsAmount();
  } catch (e) {
    approvedReimbursementListError.value = e.response?.data?.error?.message || e.message || 'Failed to move reimbursement';
  } finally {
    movingReimbursementClaimId.value = null;
  }
};
const adjustmentsLoading = ref(false);
const adjustmentsError = ref('');
const savingAdjustments = ref(false);

const rateCard = ref({
  directRate: 0,
  indirectRate: 0,
  otherRate1: 0,
  otherRate2: 0,
  otherRate3: 0
});
const rateCardLoading = ref(false);
const rateCardError = ref('');
const savingRateCard = ref(false);

const stagingKey = (r) => `${r.userId}:${r.serviceCode}`;

const ruleByCode = computed(() => {
  const m = new Map();
  for (const r of serviceCodeRules.value || []) {
    const k = String(r?.service_code || '').trim().toUpperCase();
    if (k) m.set(k, r);
  }
  return m;
});

const getRuleForCode = (serviceCode) => {
  const k = String(serviceCode || '').trim().toUpperCase();
  return ruleByCode.value.get(k) || null;
};

const payDivisorForRow = (r) => {
  const rule = getRuleForCode(r?.serviceCode);
  const d = Number(rule?.pay_divisor ?? 1);
  return Number.isFinite(d) && d > 0 ? d : 1;
};

const creditValueForRow = (r) => {
  const rule = getRuleForCode(r?.serviceCode);
  const cv = Number(rule?.credit_value ?? 0);
  return Number.isFinite(cv) && cv >= 0 ? cv : 0;
};

const payHoursForRow = (r) => {
  const d = payDivisorForRow(r);
  const effFinal = Number(stagingEdits.value?.[stagingKey(r)]?.finalizedUnits || 0) + Number(r?.carryover?.oldDoneNotesUnits || 0);
  return d > 0 ? (effFinal / d) : 0;
};

const creditsHoursForRow = (r) => {
  const cv = creditValueForRow(r);
  const effFinal = Number(stagingEdits.value?.[stagingKey(r)]?.finalizedUnits || 0) + Number(r?.carryover?.oldDoneNotesUnits || 0);
  return effFinal * cv;
};

const workspaceMatchedRows = computed(() => {
  let rows = (stagingMatched.value || []).slice();

  if (selectedUserId.value) {
    rows = rows.filter((r) => r.userId === selectedUserId.value);
  }

  const q = String(workspaceSearch.value || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const provider = `${r.firstName || ''} ${r.lastName || ''}`.trim().toLowerCase();
      const providerAlt = String(r.providerName || '').toLowerCase();
      const code = String(r.serviceCode || '').toLowerCase();
      return provider.includes(q) || providerAlt.includes(q) || code.includes(q);
    });
  }

  rows.sort((a, b) => {
    const aLast = String(a.lastName || '').toLowerCase();
    const bLast = String(b.lastName || '').toLowerCase();
    if (aLast && bLast && aLast !== bLast) return aLast.localeCompare(bLast);
    const aFirst = String(a.firstName || '').toLowerCase();
    const bFirst = String(b.firstName || '').toLowerCase();
    if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);
    return String(a.serviceCode || '').localeCompare(String(b.serviceCode || ''), undefined, { sensitivity: 'base' });
  });

  return rows;
});

const payrollAgencyOptions = computed(() => {
  // Pinia unwraps refs, so these are usually plain arrays here.
  const ua = agencyStore.userAgencies?.value ?? agencyStore.userAgencies;
  const aa = agencyStore.agencies?.value ?? agencyStore.agencies;

  const base = (Array.isArray(ua) && ua.length > 0)
    ? ua
    : (Array.isArray(aa) ? aa : []);

  // Payroll only runs at the Agency org level (not schools/programs/learning).
  return base.filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
});

const filteredAgencies = computed(() => {
  const all = (payrollAgencyOptions.value || []).slice();
  all.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
  const q = String(orgSearch.value || '').trim().toLowerCase();
  if (!q) return all;
  return all.filter((a) => String(a?.name || '').toLowerCase().includes(q));
});

const sortedPeriods = computed(() => {
  const all = (periods.value || []).slice();
  // Prefer sorting by period_end desc, then id desc
  all.sort((a, b) => {
    const ae = String(a?.period_end || '');
    const be = String(b?.period_end || '');
    if (ae !== be) return be.localeCompare(ae);
    return (b?.id || 0) - (a?.id || 0);
  });
  return all;
});

// History list should show past + at most one upcoming pay period.
// Keep full `periods` for dropdowns (claim targeting / reimbursements into the future).
const historyPeriods = computed(() => {
  const all = (sortedPeriods.value || []).slice();
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const pastOrCurrent = all.filter((p) => String(p?.period_start || '') <= todayYmd);
  const future = all
    .filter((p) => String(p?.period_start || '') > todayYmd)
    // sort by period_start asc so "next" is first
    .sort((a, b) => String(a?.period_start || '').localeCompare(String(b?.period_start || '')));

  const next = future.length ? [future[0]] : [];
  return [...pastOrCurrent, ...next];
});


const selectedUserName = computed(() => {
  const u = agencyUsers.value.find((x) => x.id === selectedUserId.value);
  if (u) return `${u.first_name} ${u.last_name}`.trim();
  if (selectedSummary.value) return `${selectedSummary.value.first_name} ${selectedSummary.value.last_name}`.trim();
  return 'Provider';
});

const isPeriodPosted = computed(() => {
  const st = String(selectedPeriod.value?.status || '').toLowerCase();
  return st === 'posted' || st === 'finalized';
});

const isTargetPeriodLocked = (periodId) => {
  const pid = Number(periodId || 0);
  if (!Number.isFinite(pid) || pid <= 0) return false;
  const p = (periods.value || []).find((x) => Number(x.id) === pid) || null;
  const st = String(p?.status || '').toLowerCase();
  return st === 'posted' || st === 'finalized';
};

const isValidTargetPeriodId = (periodId) => {
  const pid = Number(periodId || 0);
  if (!Number.isFinite(pid) || pid <= 0) return false;
  return Boolean((periods.value || []).find((x) => Number(x.id) === pid));
};

const mileageRateForTier = (tierLevel) => {
  const t = Number(tierLevel || 0);
  if (![1, 2, 3].includes(t)) return 0;
  const raw = mileageRatesDraft.value?.[`tier${t}`];
  const n = Number(raw || 0);
  return Number.isFinite(n) ? n : 0;
};

const billableMilesForClaim = (c) => {
  const claimType = String(c?.claim_type || '').toLowerCase();
  const eligibleMiles = Number(c?.eligible_miles ?? c?.miles ?? 0);
  const miles = Number.isFinite(eligibleMiles) ? eligibleMiles : 0;
  if (claimType === 'school_travel') return Math.max(0, miles);
  const roundTrip = c?.round_trip === 1 || c?.round_trip === true;
  return roundTrip ? (Math.max(0, miles) * 2) : Math.max(0, miles);
};

const estimateMileageAmount = (c) => {
  const tierLevel = Number(mileageTierByClaimId.value?.[c?.id] || c?.tier_level || 0);
  const rate = mileageRateForTier(tierLevel);
  const miles = billableMilesForClaim(c);
  if (!(rate > 0) || !(miles > 0)) return null;
  return Math.round((miles * rate) * 100) / 100;
};

const estimateMileageDisplay = (c) => {
  const tierLevel = Number(mileageTierByClaimId.value?.[c?.id] || c?.tier_level || 0);
  const rate = mileageRateForTier(tierLevel);
  if (!(rate > 0)) return '—';
  const est = estimateMileageAmount(c);
  return est !== null ? fmtMoney(est) : '—';
};

const estimateMileageTitle = (c) => {
  const tierLevel = Number(mileageTierByClaimId.value?.[c?.id] || c?.tier_level || 0);
  const rate = mileageRateForTier(tierLevel);
  if (!(rate > 0)) return `Tier ${tierLevel || '—'} mileage rate is not configured`;
  const miles = billableMilesForClaim(c);
  if (!(miles > 0)) return 'No billable miles';
  return `Estimated = ${fmtNum(miles)} mi × ${fmtMoney(rate)}/mi`;
};

const canSeeRunResults = computed(() => {
  const st = String(selectedPeriod.value?.status || '').toLowerCase();
  return st === 'ran' || st === 'posted' || st === 'finalized';
});

const previewSummary = computed(() => {
  if (!previewUserId.value) return null;
  return (summaries.value || []).find((s) => s.user_id === previewUserId.value) || null;
});

const previewAdjustmentsFromRun = computed(() => {
  const s = previewSummary.value;
  const b = s?.breakdown || null;
  const a = b && typeof b === 'object' ? b.__adjustments : null;
  return a && typeof a === 'object' ? a : null;
});

const immediatePriorPeriod = computed(() => {
  const cur = selectedPeriod.value;
  const start = String(cur?.period_start || '').slice(0, 10);
  if (!start) return null;
  // prior.period_end = current.period_start - 1 day
  const d = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 1);
  const end = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return (periods.value || []).find((p) => String(p?.period_end || '').slice(0, 10) === end) || null;
});

const priorSummaries = ref([]);
const priorSummariesLoading = ref(false);
const priorSummariesError = ref('');

const loadImmediatePriorSummaries = async () => {
  const p = immediatePriorPeriod.value;
  if (!p?.id) {
    priorSummaries.value = [];
    priorSummariesError.value = '';
    return;
  }
  try {
    priorSummariesLoading.value = true;
    priorSummariesError.value = '';
    const resp = await api.get(`/payroll/periods/${p.id}`);
    const next = (resp.data?.summaries || []).map((s) => {
      if (typeof s.breakdown === 'string') {
        try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
      }
      return s;
    });
    priorSummaries.value = next;
  } catch (e) {
    priorSummariesError.value = e.response?.data?.error?.message || e.message || 'Failed to load prior period summaries';
    priorSummaries.value = [];
  } finally {
    priorSummariesLoading.value = false;
  }
};

const priorSummaryByUserId = computed(() => {
  const m = new Map();
  for (const s of priorSummaries.value || []) m.set(s.user_id, s);
  return m;
});

const agencyUserById = computed(() => {
  const m = new Map();
  for (const u of agencyUsers.value || []) {
    if (u?.id) m.set(Number(u.id), u);
  }
  return m;
});

const isSupervisorUserId = (uid) => {
  const u = agencyUserById.value.get(Number(uid)) || null;
  if (!u) return false;
  const role = String(u.role || '').toLowerCase();
  if (role === 'supervisor') return true;
  // Backward-compat flag in some DBs
  return u.has_supervisor_privileges === 1 || u.has_supervisor_privileges === true || u.has_supervisor_privileges === '1';
};

const median = (nums) => {
  const a = (nums || []).filter((n) => Number.isFinite(n)).slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

const auditProviders = computed(() => {
  const cur = (summaries.value || []).slice();
  const priorMap = priorSummaryByUserId.value;
  const totals = cur.map((s) => Number(s.total_amount || 0)).filter((n) => Number.isFinite(n));
  const med = median(totals);

  const out = [];
  for (const s of cur) {
    const uid = s.user_id;
    const prior = priorMap.get(uid) || null;
    const curTotal = Number(s.total_amount || 0);
    const curHours = Number(s.total_hours || 0);
    const curAdj = Number(s.adjustments_amount || 0);
    const curEff = curHours > 0 ? (curTotal / curHours) : 0;

    const flags = [];
    let score = 0;

    // Always-on sanity checks
    if (curAdj >= 250) { flags.push(`Large adjustments: ${fmtMoney(curAdj)}`); score += 2; }
    if (curHours > 0 && curEff >= 65) { flags.push(`High effective hourly: ${fmtMoney(curEff)}/hr`); score += 2; }
    if (curHours > 0 && curEff > 0 && curEff <= 12 && curTotal >= 200) { flags.push(`Low effective hourly: ${fmtMoney(curEff)}/hr`); score += 1; }
    if (med > 0 && curTotal >= med * 2.75 && curTotal >= 800) { flags.push(`High total vs peers: ${fmtMoney(curTotal)} (median ${fmtMoney(med)})`); score += 1; }

    // Supervisors should not be paid under 99414.
    try {
      const b = s?.breakdown || null;
      const has99414 = b && typeof b === 'object' && Object.prototype.hasOwnProperty.call(b, '99414');
      const v = has99414 ? b['99414'] : null;
      const amt = Number(v?.amount || 0);
      const units = Number(v?.finalizedUnits ?? v?.units ?? 0);
      if (has99414 && isSupervisorUserId(uid) && (amt > 1e-9 || units > 1e-9)) {
        flags.push('Supervisor has service code 99414 (should not be included)');
        score += 3;
      }
    } catch { /* ignore */ }

    const tierStatus = s?.breakdown?.__tier?.status;
    if (tierStatus && String(tierStatus).toLowerCase().includes('out of compliance')) { flags.push('Out of compliance tier'); score += 1; }

    // Compare to immediately prior period (if available for this user)
    if (prior) {
      const priorTotal = Number(prior.total_amount || 0);
      const delta = curTotal - priorTotal;
      const absDelta = Math.abs(delta);
      const pct = priorTotal > 0 ? (delta / priorTotal) : null;
      if (absDelta >= 250 && priorTotal > 0 && pct !== null && Math.abs(pct) >= 0.25) {
        flags.push(`Big pay change vs prior: ${fmtMoney(delta)} (${(pct * 100).toFixed(0)}%)`);
        score += 3;
      } else if (absDelta >= 400) {
        flags.push(`Big pay change vs prior: ${fmtMoney(delta)}`);
        score += 2;
      }

      const priorHours = Number(prior.total_hours || 0);
      const priorEff = priorHours > 0 ? (priorTotal / priorHours) : 0;
      if (priorHours > 0 && curHours > 0) {
        const effDelta = curEff - priorEff;
        if (Math.abs(effDelta) >= 15) {
          flags.push(`Effective hourly changed vs prior: ${fmtMoney(effDelta)}/hr`);
          score += 2;
        }
      }
    }

    out.push({
      userId: uid,
      name: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
      flags,
      score
    });
  }

  out.sort((a, b) => (b.score - a.score) || (b.flags.length - a.flags.length) || String(a.name).localeCompare(String(b.name)));
  return out;
});

const auditFlaggedProviders = computed(() => (auditProviders.value || []).filter((x) => (x.flags || []).length > 0));

const auditForPreviewProvider = computed(() => {
  const uid = previewUserId.value;
  if (!uid) return null;
  return (auditProviders.value || []).find((x) => x.userId === uid) || null;
});

const fmtMoney = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};
const fmtNum = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const nameForUserId = (uid) => {
  const id = Number(uid || 0);
  const u = (agencyUsers.value || []).find((x) => Number(x.id) === id) || null;
  if (!u) return `User #${id}`;
  return `${u.first_name || ''} ${u.last_name || ''}`.trim();
};

const loadMileageRates = async () => {
  if (!agencyId.value) return;
  try {
    mileageRatesLoading.value = true;
    mileageRatesError.value = '';
    const resp = await api.get('/payroll/mileage-rates', { params: { agencyId: agencyId.value } });
    const rates = resp.data?.rates || [];
    const byTier = new Map((rates || []).map((r) => [Number(r.tierLevel), Number(r.ratePerMile || 0)]));
    mileageRatesDraft.value = {
      tier1: byTier.get(1) || 0,
      tier2: byTier.get(2) || 0,
      tier3: byTier.get(3) || 0
    };
  } catch (e) {
    mileageRatesError.value = e.response?.data?.error?.message || e.message || 'Failed to load mileage rates';
  } finally {
    mileageRatesLoading.value = false;
  }
};

const saveMileageRates = async () => {
  if (!agencyId.value) return;
  try {
    savingMileageRates.value = true;
    mileageRatesError.value = '';
    const t1 = Number(mileageRatesDraft.value.tier1 || 0);
    const t2 = Number(mileageRatesDraft.value.tier2 || 0);
    const t3 = Number(mileageRatesDraft.value.tier3 || 0);
    await api.put('/payroll/mileage-rates', {
      rates: [
        { tierLevel: 1, ratePerMile: t1 },
        { tierLevel: 2, ratePerMile: t2 },
        { tierLevel: 3, ratePerMile: t3 }
      ]
    }, { params: { agencyId: agencyId.value } });
    await loadMileageRates();
  } catch (e) {
    mileageRatesError.value = e.response?.data?.error?.message || e.message || 'Failed to save mileage rates';
  } finally {
    savingMileageRates.value = false;
  }
};

const loadPendingMileageClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    pendingMileageLoading.value = true;
    pendingMileageError.value = '';
    const resp = await api.get('/payroll/mileage-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'submitted',
        suggestedPeriodId: selectedPeriodId.value
      }
    });
    const rows = resp.data || [];
    pendingMileageClaims.value = rows;

    // Seed defaults for per-row controls
    const nextTier = { ...(mileageTierByClaimId.value || {}) };
    const nextTarget = { ...(mileageTargetPeriodByClaimId.value || {}) };
    for (const c of rows) {
      if (!nextTier[c.id]) nextTier[c.id] = Number(c.tier_level || 1);
      if (!nextTarget[c.id]) nextTarget[c.id] = Number(c.suggested_payroll_period_id || selectedPeriodId.value);
    }
    mileageTierByClaimId.value = nextTier;
    mileageTargetPeriodByClaimId.value = nextTarget;
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending mileage submissions';
    pendingMileageClaims.value = [];
  } finally {
    pendingMileageLoading.value = false;
  }
};

const loadAllPendingMileageClaims = async () => {
  if (!agencyId.value) return;
  try {
    pendingMileageLoading.value = true;
    pendingMileageError.value = '';
    const resp = await api.get('/payroll/mileage-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'submitted'
      }
    });
    const rows = resp.data || [];
    pendingMileageClaims.value = rows;

    const nextTier = { ...(mileageTierByClaimId.value || {}) };
    const nextTarget = { ...(mileageTargetPeriodByClaimId.value || {}) };
    for (const c of rows) {
      if (!nextTier[c.id]) nextTier[c.id] = Number(c.tier_level || 1);
      if (!nextTarget[c.id]) nextTarget[c.id] = Number(c.suggested_payroll_period_id || selectedPeriodId.value || 0) || null;
    }
    mileageTierByClaimId.value = nextTier;
    mileageTargetPeriodByClaimId.value = nextTarget;
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending mileage submissions';
    pendingMileageClaims.value = [];
  } finally {
    pendingMileageLoading.value = false;
  }
};

const openMileageDetails = (c) => {
  selectedMileageClaim.value = c || null;
  showMileageDetailsModal.value = true;
};

const closeMileageDetails = () => {
  showMileageDetailsModal.value = false;
  selectedMileageClaim.value = null;
};

const approveMileageClaim = async (c) => {
  if (!c?.id) return;
  try {
    approvingMileageClaimId.value = c.id;
    pendingMileageError.value = '';
    const tierLevel = Number(mileageTierByClaimId.value?.[c.id] || 1);
    const targetPayrollPeriodId = Number(mileageTargetPeriodByClaimId.value?.[c.id] || selectedPeriodId.value);
    if (isTargetPeriodLocked(targetPayrollPeriodId)) {
      pendingMileageError.value = 'Target pay period is posted (locked). Choose an open pay period.';
      return;
    }
    await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'approve', tierLevel, targetPayrollPeriodId });
    await loadPendingMileageClaims();
    await loadPeriodDetails();
    await loadApprovedMileageClaimsAmount();
    await loadApprovedMileageClaimsList();
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to approve mileage claim';
  } finally {
    approvingMileageClaimId.value = null;
  }
};

const deferMileageClaim = async (c) => {
  if (!c?.id) return;
  try {
    approvingMileageClaimId.value = c.id;
    pendingMileageError.value = '';
    await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'defer' });
    await loadPendingMileageClaims();
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to defer mileage claim';
  } finally {
    approvingMileageClaimId.value = null;
  }
};

const rejectMileageClaim = async (c) => {
  if (!c?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingMileageClaimId.value = c.id;
    pendingMileageError.value = '';
    await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'reject', rejectionReason: reason });
    await loadPendingMileageClaims();
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to reject mileage claim';
  } finally {
    approvingMileageClaimId.value = null;
  }
};

const returnMileageClaim = async (c) => {
  if (!c?.id) return;
  const note = window.prompt('Send back note (required):', '') || '';
  if (!String(note).trim()) return;
  try {
    approvingMileageClaimId.value = c.id;
    pendingMileageError.value = '';
    await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'return', note: String(note).trim() });
    await loadAllPendingMileageClaims();
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to send back mileage claim';
  } finally {
    approvingMileageClaimId.value = null;
  }
};

const loadPendingMedcancelClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    pendingMedcancelLoading.value = true;
    pendingMedcancelError.value = '';
    const resp = await api.get('/payroll/medcancel-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'submitted',
        suggestedPeriodId: selectedPeriodId.value
      }
    });
    const rows = resp.data || [];
    pendingMedcancelClaims.value = rows;

    // Seed defaults for per-row controls
    const nextTarget = { ...(medcancelTargetPeriodByClaimId.value || {}) };
    for (const c of rows) {
      if (!nextTarget[c.id]) nextTarget[c.id] = Number(selectedPeriodId.value);
    }
    medcancelTargetPeriodByClaimId.value = nextTarget;
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending MedCancel submissions';
    pendingMedcancelClaims.value = [];
  } finally {
    pendingMedcancelLoading.value = false;
  }
};

const loadAllPendingMedcancelClaims = async () => {
  if (!agencyId.value) return;
  try {
    pendingMedcancelLoading.value = true;
    pendingMedcancelError.value = '';
    const resp = await api.get('/payroll/medcancel-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'submitted'
      }
    });
    const rows = resp.data || [];
    pendingMedcancelClaims.value = rows;

    const nextTarget = { ...(medcancelTargetPeriodByClaimId.value || {}) };
    for (const c of rows) {
      if (!nextTarget[c.id]) nextTarget[c.id] = Number(selectedPeriodId.value || c.suggested_payroll_period_id || 0) || null;
    }
    medcancelTargetPeriodByClaimId.value = nextTarget;
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending MedCancel submissions';
    pendingMedcancelClaims.value = [];
  } finally {
    pendingMedcancelLoading.value = false;
  }
};

const approveMedcancelClaim = async (c) => {
  if (!c?.id) return;
  try {
    approvingMedcancelClaimId.value = c.id;
    pendingMedcancelError.value = '';
    const targetPayrollPeriodId = Number(medcancelTargetPeriodByClaimId.value?.[c.id] || selectedPeriodId.value);
    if (isTargetPeriodLocked(targetPayrollPeriodId)) {
      pendingMedcancelError.value = 'Target pay period is posted (locked). Choose an open pay period.';
      return;
    }
    await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'approve', targetPayrollPeriodId });
    await loadPendingMedcancelClaims();
    await loadPeriodDetails();
    await loadApprovedMedcancelClaimsAmount();
    await loadApprovedMedcancelClaimsList();
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to approve MedCancel claim';
  } finally {
    approvingMedcancelClaimId.value = null;
  }
};

const deferMedcancelClaim = async (c) => {
  if (!c?.id) return;
  try {
    approvingMedcancelClaimId.value = c.id;
    pendingMedcancelError.value = '';
    await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'defer' });
    await loadPendingMedcancelClaims();
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to defer MedCancel claim';
  } finally {
    approvingMedcancelClaimId.value = null;
  }
};

const rejectMedcancelClaim = async (c) => {
  if (!c?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingMedcancelClaimId.value = c.id;
    pendingMedcancelError.value = '';
    await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'reject', rejectionReason: reason });
    await loadPendingMedcancelClaims();
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to reject MedCancel claim';
  } finally {
    approvingMedcancelClaimId.value = null;
  }
};

const returnMedcancelClaim = async (c) => {
  if (!c?.id) return;
  const note = window.prompt('Send back note (required):', '') || '';
  if (!String(note).trim()) return;
  try {
    approvingMedcancelClaimId.value = c.id;
    pendingMedcancelError.value = '';
    await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'return', note: String(note).trim() });
    await loadAllPendingMedcancelClaims();
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to send back Med Cancel claim';
  } finally {
    approvingMedcancelClaimId.value = null;
  }
};

const payBucketForCategory = (category) => {
  const c = String(category || '').trim().toLowerCase();
  if (c === 'indirect' || c === 'admin' || c === 'meeting') return 'indirect';
  if (c === 'other' || c === 'tutoring') return 'other';
  if (c === 'mileage' || c === 'bonus' || c === 'reimbursement' || c === 'other_pay') return 'flat';
  return 'direct';
};

const payTotalsFromBreakdown = (breakdown) => {
  const out = { directAmount: 0, indirectAmount: 0, otherAmount: 0, flatAmount: 0 };
  if (!breakdown || typeof breakdown !== 'object') return out;
  for (const [code, v] of Object.entries(breakdown)) {
    if (String(code).startsWith('_')) continue;
    const amt = Number(v?.amount || 0);
    const bucket = payBucketForCategory(v?.category);
    if (bucket === 'indirect') out.indirectAmount += amt;
    else if (bucket === 'other') out.otherAmount += amt;
    else if (bucket === 'flat') out.flatAmount += amt;
    else out.directAmount += amt;
  }
  return out;
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

    // If there's no carryover, or this is a flat line, show as-is.
    if (!(oldUnits > 1e-9) || rateUnit === 'flat') {
      out.push({ code, ...v });
      continue;
    }

    const baseUnits = Math.max(0, finalizedUnits - oldUnits);
    const oldPayHours = bucket !== 'flat' ? (oldUnits / safeDiv) : 0;
    const oldCredits = oldUnits * safeCv;
    // Old-note amount: payHours * rate for non-flat categories.
    const computedOldAmount = bucket !== 'flat' ? (oldPayHours * rateAmount) : (oldUnits * rateAmount);
    const totalAmount = Number(v.amount || 0);
    const oldAmount = Math.max(0, Math.min(totalAmount, computedOldAmount));
    const baseAmount = Math.max(0, totalAmount - oldAmount);

    // Base row
    if (baseUnits > 1e-9 && baseAmount > 1e-9) {
      out.push({
        code,
        ...v,
        finalizedUnits: baseUnits,
        units: baseUnits,
        payHours: bucket !== 'flat' ? (baseUnits / safeDiv) : (v.payHours ?? 0),
        hours: baseUnits * safeCv,
        creditsHours: baseUnits * safeCv,
        amount: baseAmount
      });
    }

    // Old Note row (display only)
    if (oldUnits > 1e-9 && oldAmount > 1e-9) {
      out.push({
        code: `${code} (Old Note)`,
        ...v,
        noNoteUnits: 0,
        draftUnits: 0,
        finalizedUnits: oldUnits,
        units: oldUnits,
        payHours: bucket !== 'flat' ? oldPayHours : 0,
        hours: oldCredits,
        creditsHours: oldCredits,
        amount: oldAmount
      });
    }
  }
  return out;
};

const selectedSummaryServiceLines = computed(() => splitBreakdownForDisplay(selectedSummary.value?.breakdown || null));
const previewSummaryServiceLines = computed(() => splitBreakdownForDisplay(previewSummary.value?.breakdown || null));

const fmtDateTime = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : (v || '');
};

const ymd = (v) => {
  if (!v) return '';
  const s = String(v);
  // Prefer showing stored YYYY-MM-DD without timezone conversions.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
};

const rawDraftRows = computed(() => {
  const all = (rawImportRows.value || []).slice();
  let rows = rawDraftOnly.value ? all.filter((r) => String(r.note_status || '').toUpperCase() === 'DRAFT') : all;
  const q = String(rawDraftSearch.value || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const prov = String(r.provider_name || '').toLowerCase();
      const code = String(r.service_code || '').toLowerCase();
      const dos = String(r.service_date || '').toLowerCase();
      return prov.includes(q) || code.includes(q) || dos.includes(q);
    });
  }
  // Prefer most recent first (service_date may be null)
  rows.sort((a, b) => String(b.service_date || '').localeCompare(String(a.service_date || '')));
  return rows;
});

const toggleDraftPayable = async (row, nextVal) => {
  if (!row?.id) return;
  if (isPeriodPosted.value) return;
  try {
    updatingDraftPayable.value = true;
    rawDraftError.value = '';
    const resp = await api.patch(`/payroll/import-rows/${row.id}`, { draftPayable: !!nextVal });
    // Update local row state
    const idx = (rawImportRows.value || []).findIndex((r) => r.id === row.id);
    if (idx >= 0) {
      rawImportRows.value[idx] = { ...rawImportRows.value[idx], draft_payable: nextVal ? 1 : 0 };
    }
    // If period already ran, backend can return refreshed summaries.
    if (resp?.data?.period) selectedPeriod.value = resp.data.period;
    if (Array.isArray(resp?.data?.summaries)) {
      const nextSummaries = resp.data.summaries.map((s) => {
        if (typeof s.breakdown === 'string') {
          try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
        }
        return s;
      });
      summaries.value = nextSummaries;
      if (selectedUserId.value) {
        const found = nextSummaries.find((x) => x.user_id === selectedUserId.value);
        if (found) selectedSummary.value = found;
      }
    }
    await loadStaging();
  } catch (e) {
    rawDraftError.value = e.response?.data?.error?.message || e.message || 'Failed to update draft payable';
  } finally {
    updatingDraftPayable.value = false;
  }
};

const periodRangeLabel = (p) => {
  if (!p) return '';
  return `${ymd(p.period_start)} → ${ymd(p.period_end)}`;
};

const anchorPayPeriodEndYmd = '2025-08-01';
const suggestedCurrentPeriodLabel = computed(() => {
  // Compute suggested current pay period based on today's date and anchor end date.
  try {
    const anchor = new Date(`${anchorPayPeriodEndYmd}T00:00:00Z`);
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // last Friday on or before today (UTC)
    const day = todayUtc.getUTCDay(); // Sunday=0 ... Friday=5
    const diffToFri = (day - 5 + 7) % 7;
    const lastFri = new Date(todayUtc.getTime());
    lastFri.setUTCDate(lastFri.getUTCDate() - diffToFri);

    const daysSinceAnchor = Math.floor((lastFri.getTime() - anchor.getTime()) / 86400000);
    const cycles = Math.floor(daysSinceAnchor / 14);
    const end = new Date(anchor.getTime());
    end.setUTCDate(end.getUTCDate() + cycles * 14);
    // Ensure end is not after lastFri
    while (end.getTime() > lastFri.getTime()) end.setUTCDate(end.getUTCDate() - 14);

    const start = new Date(end.getTime());
    start.setUTCDate(start.getUTCDate() - 13);
    const ymdUtc = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return `${ymdUtc(start)} → ${ymdUtc(end)}`;
  } catch {
    return '';
  }
});

const suggestedCurrentPeriodId = computed(() => {
  const label = suggestedCurrentPeriodLabel.value;
  if (!label) return null;
  const [start, end] = label.split('→').map((s) => String(s || '').trim());
  const match = (periods.value || []).find((p) => String(p?.period_start || '') === start && String(p?.period_end || '') === end);
  return match?.id || null;
});

const suggestedCurrentPeriodRange = computed(() => {
  const label = suggestedCurrentPeriodLabel.value;
  if (!label) return null;
  const [start, end] = label.split('→').map((s) => String(s || '').trim());
  if (!start || !end) return null;
  return { start, end, label };
});

const LS_LAST_ORG_ID = 'payroll:lastOrgId';
const lsLastPeriodKey = (agencyIdVal) => `payroll:lastPeriodId:${agencyIdVal}`;

const loadPeriods = async () => {
  if (!agencyId.value) return;
  try {
    // Ensure upcoming pay periods exist so claims can be approved/targeted without waiting for a billing import.
    // Idempotent: creates only missing periods.
    await api.post('/payroll/periods/ensure-future', { months: 6, pastPeriods: 2 }, { params: { agencyId: agencyId.value } });
    const resp = await api.get('/payroll/periods', { params: { agencyId: agencyId.value } });
    periods.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load pay periods';
    periods.value = [];
  }
};

const selectPeriod = async (id) => {
  selectedPeriodId.value = id;
  selectedSummary.value = null;
  rateServiceCode.value = '';
  rateAmount.value = '';
  await loadPeriodDetails();
};

const loadPeriodDetails = async () => {
  if (!selectedPeriodId.value) return;
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}`);
    selectedPeriod.value = resp.data?.period || null;
    rawImportRows.value = resp.data?.rows || [];
    const nextSummaries = (resp.data?.summaries || []).map((s) => {
      if (typeof s.breakdown === 'string') {
        try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
      }
      return s;
    });
    summaries.value = nextSummaries;
    if (selectedUserId.value) {
      const found = nextSummaries.find((x) => x.user_id === selectedUserId.value);
      if (found) selectedSummary.value = found;
    }
    if (!previewUserId.value && nextSummaries.length) {
      previewUserId.value = nextSummaries[0].user_id;
    }
    await loadStaging();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load pay period details';
    selectedPeriod.value = null;
    rawImportRows.value = [];
    summaries.value = [];
  }
};

const loadAgencyUsers = async () => {
  if (!agencyId.value) return;
  try {
    loadingUsers.value = true;
    const resp = await api.get('/payroll/agency-users', { params: { agencyId: agencyId.value } });
    agencyUsers.value = resp.data || [];
  } finally {
    loadingUsers.value = false;
  }
};

const onRateSheetPick = (e) => {
  const f = e?.target?.files?.[0] || null;
  rateSheetFile.value = f;
  rateSheetError.value = '';
  rateSheetResult.value = null;
};

const importRateSheet = async () => {
  if (!rateSheetFile.value || !agencyId.value) return;
  try {
    importingRateSheet.value = true;
    rateSheetError.value = '';
    rateSheetResult.value = null;
    const fd = new FormData();
    fd.append('agencyId', String(agencyId.value));
    fd.append('file', rateSheetFile.value);
    const resp = await api.post('/payroll/rate-sheet/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    rateSheetResult.value = resp.data || null;
  } catch (e) {
    rateSheetError.value = e.response?.data?.error?.message || e.message || 'Failed to import rate sheet';
  } finally {
    importingRateSheet.value = false;
  }
};

const loadStaging = async () => {
  if (!selectedPeriodId.value) return;
  try {
    stagingLoading.value = true;
    stagingError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/staging`);
    stagingMatched.value = resp.data?.matched || [];
    stagingUnmatched.value = resp.data?.unmatched || [];
    tierByUserId.value = resp.data?.tierByUserId || {};
    seedStagingEdits();
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Failed to load staging';
    stagingError.value = msg;
    // Ensure failures aren't silent (e.g., if stage modal isn't open yet).
    error.value = msg;
  } finally {
    stagingLoading.value = false;
  }
};

const selectedTier = computed(() => {
  const uid = selectedUserId.value;
  if (!uid) return null;
  return tierByUserId.value?.[uid] || null;
});

const loadServiceCodeRules = async () => {
  if (!agencyId.value) return;
  try {
    serviceCodeRulesLoading.value = true;
    serviceCodeRulesError.value = '';
    const resp = await api.get('/payroll/service-code-rules', { params: { agencyId: agencyId.value } });
    serviceCodeRules.value = resp.data || [];
  } catch (e) {
    serviceCodeRulesError.value = e.response?.data?.error?.message || e.message || 'Failed to load service code rules';
    serviceCodeRules.value = [];
  } finally {
    serviceCodeRulesLoading.value = false;
  }
};

const restoreSelectionFromStorage = async () => {
  // If browser restored <select> UI without Vue state, force Vue state from localStorage or defaults.
  try {
    if (!selectedOrgId.value) {
      const savedOrg = localStorage.getItem(LS_LAST_ORG_ID);
      if (savedOrg) selectedOrgId.value = Number(savedOrg) || null;
    }
  } catch { /* ignore */ }

  // Wait for periods to be loaded for current agency before picking a period.
  if (!agencyId.value || !(periods.value || []).length) return;
  if (selectedPeriodId.value) {
    // If Vue state is set (or browser restored the UI) but no watcher fired, force-load details.
    if (selectedPeriod.value?.id !== selectedPeriodId.value) {
      await loadPeriodDetails();
    }
    return;
  }

  try {
    const savedPeriod = localStorage.getItem(lsLastPeriodKey(agencyId.value));
    const savedId = savedPeriod ? Number(savedPeriod) : null;
    const exists = savedId && (periods.value || []).some((p) => p.id === savedId);
    if (exists) {
      selectedPeriodId.value = savedId;
      await loadPeriodDetails();
      return;
    }
  } catch { /* ignore */ }

  // Default: most recent period by end date (same sort logic as UI).
  const ordered = (sortedPeriods.value || []).slice();
  const mostRecentNonDraft = ordered.find((p) => String(p?.status || '').toLowerCase() !== 'draft') || null;
  const mostRecent = mostRecentNonDraft || ordered[0] || null;
  if (mostRecent?.id) {
    selectedPeriodId.value = mostRecent.id;
    await loadPeriodDetails();
  }
};

const seedStagingEdits = () => {
  const next = {};
  for (const r of stagingMatched.value || []) {
    const base = r.override ? {
      noNoteUnits: Number(r.override.noNoteUnits ?? 0),
      draftUnits: Number(r.override.draftUnits ?? 0),
      finalizedUnits: Number(r.override.finalizedUnits ?? 0)
    } : (r.raw || { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 });
    next[stagingKey(r)] = {
      noNoteUnits: String(base.noNoteUnits ?? 0),
      draftUnits: String(base.draftUnits ?? 0),
      finalizedUnits: String(base.finalizedUnits ?? 0)
    };
  }
  stagingEdits.value = next;
  // Keep a snapshot so we can detect unsaved edits and preserve them across reruns.
  stagingEditsBaseline.value = JSON.parse(JSON.stringify(next));
};

const dirtyStagingKeys = computed(() => {
  const keys = new Set([
    ...Object.keys(stagingEdits.value || {}),
    ...Object.keys(stagingEditsBaseline.value || {})
  ]);
  const dirty = [];
  for (const k of keys) {
    const cur = stagingEdits.value?.[k] || null;
    const base = stagingEditsBaseline.value?.[k] || null;
    if (!cur || !base) continue;
    if (String(cur.noNoteUnits) !== String(base.noNoteUnits) ||
        String(cur.draftUnits) !== String(base.draftUnits) ||
        String(cur.finalizedUnits) !== String(base.finalizedUnits)) {
      dirty.push(k);
    }
  }
  return dirty;
});

const saveAllDirtyStagingEdits = async () => {
  if (!selectedPeriodId.value) return;
  const keys = dirtyStagingKeys.value || [];
  if (!keys.length) return;
  try {
    savingStaging.value = true;
    stagingError.value = '';
    for (const k of keys) {
      const [userIdStr, serviceCode] = String(k).split(':');
      const row = stagingEdits.value?.[k];
      if (!row) continue;
      await api.patch(`/payroll/periods/${selectedPeriodId.value}/staging`, {
        userId: Number(userIdStr),
        serviceCode,
        noNoteUnits: Number(row.noNoteUnits),
        draftUnits: Number(row.draftUnits),
        finalizedUnits: Number(row.finalizedUnits)
      });
      // Update baseline for that key after successful save
      if (stagingEditsBaseline.value?.[k]) {
        stagingEditsBaseline.value[k] = { ...stagingEdits.value[k] };
      }
    }
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Failed to save staging edits';
    stagingError.value = msg;
    error.value = msg;
    throw e;
  } finally {
    savingStaging.value = false;
  }
};

const carryoverCompareOptions = computed(() => {
  const all = (periods.value || []).filter((p) => p?.id && p.id !== selectedPeriodId.value);
  // Prefer earlier periods (by end date desc in list, but this dropdown should include all prior)
  all.sort((a, b) => String(b?.period_end || '').localeCompare(String(a?.period_end || '')));
  return all;
});

const defaultPriorPeriodId = computed(() => {
  // Choose the most recent period that ends before the current period end (if possible).
  const curEnd = String(selectedPeriod.value?.period_end || '');
  const options = carryoverCompareOptions.value || [];
  const prior = options.find((p) => String(p?.period_end || '') < curEnd) || options[0] || null;
  return prior?.id || null;
});

const openCarryoverModal = async () => {
  showCarryoverModal.value = true;
  carryoverError.value = '';
  carryoverPreview.value = [];
  carryoverRuns.value = [];
  carryoverBaselineRunId.value = null;
  carryoverCompareRunId.value = null;
  manualCarryoverEnabled.value = false;
  manualCarryover.value = { userId: null, serviceCode: '', oldDoneNotesUnits: '' };
  carryoverPriorPeriodId.value = defaultPriorPeriodId.value;
  if (carryoverPriorPeriodId.value) {
    await loadCarryoverRuns();
    await loadCarryoverPreview();
  }
};

const openCarryoverForPrior = async () => {
  if (!lastImportedPeriodId.value || !applyToCurrentPeriodId.value) {
    openCarryoverModal();
    return;
  }
  // Ensure the "current" period is selected for applying carryover.
  if (selectedPeriodId.value !== applyToCurrentPeriodId.value) {
    await selectPeriod(applyToCurrentPeriodId.value);
  }
  showCarryoverModal.value = true;
  carryoverError.value = '';
  carryoverPreview.value = [];
  carryoverRuns.value = [];
  carryoverBaselineRunId.value = null;
  carryoverCompareRunId.value = null;
  carryoverPriorPeriodId.value = lastImportedPeriodId.value;
  await loadCarryoverRuns();
  await loadCarryoverPreview();
};

const loadCarryoverRuns = async () => {
  if (!carryoverPriorPeriodId.value) return;
  const resp = await api.get(`/payroll/periods/${carryoverPriorPeriodId.value}/runs`);
  carryoverRuns.value = resp.data || [];
  if (carryoverRuns.value.length) {
    carryoverBaselineRunId.value = carryoverRuns.value[0].id;
    carryoverCompareRunId.value = carryoverRuns.value[carryoverRuns.value.length - 1].id;
  }
};

const loadCarryoverPreview = async () => {
  if (!selectedPeriodId.value || !carryoverPriorPeriodId.value || !carryoverBaselineRunId.value || !carryoverCompareRunId.value) return;
  try {
    carryoverLoading.value = true;
    carryoverError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/carryover/preview`, {
      params: {
        priorPeriodId: carryoverPriorPeriodId.value,
        baselineRunId: carryoverBaselineRunId.value,
        compareRunId: carryoverCompareRunId.value
      }
    });
    const deltas = resp.data?.deltas || [];
    carryoverPreview.value = deltas.map((d) => ({
      ...d,
      firstName: d.firstName,
      lastName: d.lastName
    }));
  } catch (e) {
    carryoverError.value = e.response?.data?.error?.message || e.message || 'Failed to compute differences';
  } finally {
    carryoverLoading.value = false;
  }
};

watch(carryoverPriorPeriodId, async () => {
  if (!showCarryoverModal.value) return;
  try {
    carryoverLoading.value = true;
    carryoverError.value = '';
    carryoverPreview.value = [];
    await loadCarryoverRuns();
  } catch (e) {
    carryoverError.value = e.response?.data?.error?.message || e.message || 'Failed to load prior period runs';
  } finally {
    carryoverLoading.value = false;
  }
  await loadCarryoverPreview();
});

watch([carryoverBaselineRunId, carryoverCompareRunId], async () => {
  if (!showCarryoverModal.value) return;
  await loadCarryoverPreview();
});

const applyCarryover = async () => {
  if (!selectedPeriodId.value || !carryoverPriorPeriodId.value || !(carryoverPreview.value || []).length) return;
  try {
    applyingCarryover.value = true;
    carryoverError.value = '';
    const rows = (carryoverPreview.value || [])
      .map((d) => ({
        userId: d.userId,
        serviceCode: d.serviceCode,
        carryoverFinalizedUnits: d.carryoverFinalizedUnits
      }))
      .filter((r) => !!r.userId && !!r.serviceCode && Number(r.carryoverFinalizedUnits || 0) > 0);

    // IMPORTANT: Express json parser is strict; sending `null` causes a 400 parse error.
    await api.post(`/payroll/periods/${selectedPeriodId.value}/carryover/apply`, { rows }, {
      params: {
        priorPeriodId: carryoverPriorPeriodId.value,
        baselineRunId: carryoverBaselineRunId.value || undefined,
        compareRunId: carryoverCompareRunId.value || undefined
      }
    });
    await loadStaging();
    showCarryoverModal.value = false;
  } catch (e) {
    carryoverError.value = e.response?.data?.error?.message || e.message || 'Failed to apply differences';
  } finally {
    applyingCarryover.value = false;
  }
};

const addManualCarryoverRow = () => {
  carryoverError.value = '';
  const userId = manualCarryover.value.userId;
  const serviceCode = String(manualCarryover.value.serviceCode || '').trim();
  const carry = Number(manualCarryover.value.oldDoneNotesUnits);

  if (!userId) {
    carryoverError.value = 'Select a provider for the manual row.';
    return;
  }
  if (!serviceCode) {
    carryoverError.value = 'Enter a service code for the manual row.';
    return;
  }
  if (!Number.isFinite(carry) || carry <= 1e-9) {
    carryoverError.value = 'Old Done Notes units must be a positive number.';
    return;
  }

  const u = (agencyUsers.value || []).find((x) => x.id === userId) || null;
  const firstName = u?.first_name || null;
  const lastName = u?.last_name || null;
  const providerName = u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : null;

  const next = (carryoverPreview.value || []).slice();
  next.push({
    userId,
    serviceCode,
    // Keep these populated for table display even though we’re manually forcing the carryover.
    prevUnpaidUnits: Number(carry.toFixed(2)),
    currUnpaidUnits: 0,
    prevFinalizedUnits: null,
    currFinalizedUnits: null,
    finalizedDelta: null,
    carryoverFinalizedUnits: Number(carry.toFixed(2)),
    type: 'manual',
    flagged: 0,
    firstName,
    lastName,
    providerName
  });
  carryoverPreview.value = next;
  manualCarryover.value = { userId: null, serviceCode: '', oldDoneNotesUnits: '' };
};

const removeCarryoverRow = (idx) => {
  const next = (carryoverPreview.value || []).slice();
  next.splice(idx, 1);
  carryoverPreview.value = next;
};

const downloadRawCsv = async () => {
  if (!selectedPeriodId.value) return;
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/raw.csv`, { responseType: 'blob' });
    const blob = new Blob([resp.data], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-raw-period-${selectedPeriodId.value}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to download raw CSV';
  }
};

const downloadExportCsv = async () => {
  if (!selectedPeriodId.value) return;
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/export.csv`, { responseType: 'blob' });
    const blob = new Blob([resp.data], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-export-period-${selectedPeriodId.value}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to download export CSV';
  }
};

const onFilePick = (evt) => {
  importFile.value = evt.target.files?.[0] || null;
};

const autoImport = async () => {
  try {
    if (!agencyId.value) {
      error.value = 'Select an organization first.';
      return;
    }
    if (!importFile.value) return;
    error.value = '';
    autoDetecting.value = true;
    unmatchedProviders.value = [];
    createdUsers.value = [];
    detectedPeriodHint.value = '';

    const fd = new FormData();
    fd.append('file', importFile.value);
    fd.append('agencyId', String(agencyId.value));
    const resp = await api.post('/payroll/periods/auto/detect', fd);
    autoDetectResult.value = resp.data || null;
    const detected = autoDetectResult.value?.detected;
    if (detected?.periodStart && detected?.periodEnd) {
      detectedPeriodHint.value = `Detected pay period: ${detected.periodStart} → ${detected.periodEnd} (Sat→Fri, 14 days). Please confirm.`;
    }
    // Default confirmation choice
    autoImportChoiceMode.value = 'detected';
    autoImportExistingPeriodId.value = autoDetectResult.value?.existingPeriodId || null;
    autoImportCustomStart.value = detected?.periodStart || '';
    autoImportCustomEnd.value = detected?.periodEnd || '';
    confirmAutoImportOpen.value = true;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to auto-import payroll report';
  } finally {
    autoDetecting.value = false;
  }
};

const confirmAutoImport = async () => {
  try {
    if (!agencyId.value) return;
    if (!importFile.value) return;
    error.value = '';
    autoImporting.value = true;
    createdUsers.value = [];
    unmatchedProviders.value = [];

    let targetPeriodId = null;
    if (autoImportChoiceMode.value === 'existing') {
      targetPeriodId = autoImportExistingPeriodId.value;
      if (!targetPeriodId) {
        error.value = 'Select an existing pay period.';
        return;
      }
    } else if (autoImportChoiceMode.value === 'custom') {
      // Create (or find) by dates
      const start = String(autoImportCustomStart.value || '').slice(0, 10);
      const end = String(autoImportCustomEnd.value || '').slice(0, 10);
      if (!start || !end) {
        error.value = 'Enter a custom pay period start and end.';
        return;
      }
      const resp = await api.post('/payroll/periods', {
        agencyId: agencyId.value,
        periodStart: start,
        periodEnd: end,
        label: `${start} to ${end}`
      });
      targetPeriodId = resp.data?.id || null;
    } else {
      // detected
      if (!autoDetectResult.value?.detected?.periodStart || !autoDetectResult.value?.detected?.periodEnd) {
        error.value = 'No detected pay period available. Choose an existing period or enter custom dates.';
        return;
      }
      targetPeriodId = autoImportExistingPeriodId.value;
      if (!targetPeriodId) {
        const detected = autoDetectResult.value?.detected;
        const start = String(detected?.periodStart || '').slice(0, 10);
        const end = String(detected?.periodEnd || '').slice(0, 10);
        const resp = await api.post('/payroll/periods', {
          agencyId: agencyId.value,
          periodStart: start,
          periodEnd: end,
          label: `${start} to ${end}`
        });
        targetPeriodId = resp.data?.id || null;
      }
    }
    if (!targetPeriodId) {
      error.value = 'Could not determine a pay period to import into.';
      return;
    }

    // Import into the selected/created period.
    selectedPeriodId.value = targetPeriodId;
    await uploadCsv();
    confirmAutoImportOpen.value = false;
  } finally {
    autoImporting.value = false;
  }
};

const uploadCsv = async () => {
  try {
    error.value = '';
    importing.value = true;
    unmatchedProviders.value = [];
    createdUsers.value = [];
    const fd = new FormData();
    fd.append('file', importFile.value);
    const resp = await api.post(`/payroll/periods/${selectedPeriodId.value}/import`, fd);
    createdUsers.value = resp.data?.createdUsers || [];
    unmatchedProviders.value = Array.from(new Set(resp.data?.unmatchedProvidersSample || []));
    importFile.value = null;
    lastImportedPeriodId.value = selectedPeriodId.value;
    await loadPeriodDetails();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to import CSV';
  } finally {
    importing.value = false;
  }
};

// Manual import should use the SAME confirmation modal as auto-detect.
// This lets admins override dates or choose a different pay period before importing.
const openImportConfirmModal = () => {
  if (!importFile.value) return;
  // Default to existing period selection if one is already picked.
  autoDetectResult.value = null;
  autoImportChoiceMode.value = 'existing';
  autoImportExistingPeriodId.value = selectedPeriodId.value || null;
  autoImportCustomStart.value = '';
  autoImportCustomEnd.value = '';
  confirmAutoImportOpen.value = true;
};

const selectSummary = (s) => {
  selectedSummary.value = s;
  selectedUserId.value = s.user_id;
  loadAdjustments();
  loadRateCard();
};

const clearSelectedProvider = () => {
  selectedUserId.value = null;
  selectedSummary.value = null;
};

const nextProvider = () => {
  const ids = (agencyUsers.value || []).map((u) => u.id).filter(Boolean);
  if (!ids.length) return;
  if (!selectedUserId.value) {
    selectedUserId.value = ids[0];
    selectedSummary.value = (summaries.value || []).find((x) => x.user_id === selectedUserId.value) || null;
    return;
  }
  const idx = ids.indexOf(selectedUserId.value);
  const nextIdx = idx >= 0 ? (idx + 1) % ids.length : 0;
  selectedUserId.value = ids[nextIdx];
  selectedSummary.value = (summaries.value || []).find((x) => x.user_id === selectedUserId.value) || null;
};

const nextRunProvider = () => {
  const list = (summaries.value || []).slice();
  if (!list.length) return;
  // If nothing selected yet, select first.
  if (!selectedSummary.value) {
    selectSummary(list[0]);
    return;
  }
  const idx = list.findIndex((s) => s.id === selectedSummary.value?.id);
  const nextIdx = idx >= 0 ? (idx + 1) % list.length : 0;
  selectSummary(list[nextIdx]);
};

const nextPreviewProvider = () => {
  const list = (summaries.value || []).slice();
  if (!list.length) return;
  if (!previewUserId.value) {
    previewUserId.value = list[0].user_id;
    return;
  }
  const idx = list.findIndex((s) => s.user_id === previewUserId.value);
  const nextIdx = idx >= 0 ? (idx + 1) % list.length : 0;
  previewUserId.value = list[nextIdx].user_id;
};

const nextFlaggedPreviewProvider = () => {
  const flagged = (auditFlaggedProviders.value || []).slice();
  if (!flagged.length) return;
  const ids = flagged.map((x) => x.userId);
  if (!previewUserId.value || !ids.includes(previewUserId.value)) {
    previewUserId.value = ids[0];
    return;
  }
  const idx = ids.indexOf(previewUserId.value);
  const nextIdx = idx >= 0 ? (idx + 1) % ids.length : 0;
  previewUserId.value = ids[nextIdx];
};

const nextFlaggedRunProvider = () => {
  const flagged = (auditFlaggedProviders.value || []).slice();
  if (!flagged.length) return;
  const ids = flagged.map((x) => x.userId);
  const currentUid = selectedSummary.value?.user_id || null;
  if (!currentUid || !ids.includes(currentUid)) {
    const s0 = (summaries.value || []).find((s) => s.user_id === ids[0]) || null;
    if (s0) selectSummary(s0);
    return;
  }
  const idx = ids.indexOf(currentUid);
  const nextIdx = idx >= 0 ? (idx + 1) % ids.length : 0;
  const nextSummary = (summaries.value || []).find((s) => s.user_id === ids[nextIdx]) || null;
  if (nextSummary) selectSummary(nextSummary);
};

const loadAdjustments = async () => {
  const uid = selectedUserId.value;
  if (!uid || !selectedPeriodId.value) return;
  try {
    adjustmentsLoading.value = true;
    adjustmentsError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/adjustments`, { params: { userId: uid } });
    const a = resp.data || {};
    adjustments.value = {
      mileageAmount: Number(a.mileage_amount || 0),
      otherTaxableAmount: Number(a.other_taxable_amount || 0),
      bonusAmount: Number(a.bonus_amount || 0),
      reimbursementAmount: Number(a.reimbursement_amount || 0),
      salaryAmount: Number(a.salary_amount || 0),
      ptoHours: Number(a.pto_hours || 0),
      ptoRate: Number(a.pto_rate || 0)
    };
  } catch (e) {
    adjustmentsError.value = e.response?.data?.error?.message || e.message || 'Failed to load adjustments';
  } finally {
    adjustmentsLoading.value = false;
  }
};

const saveAdjustments = async () => {
  const uid = selectedUserId.value;
  if (!uid || !selectedPeriodId.value) return;
  try {
    savingAdjustments.value = true;
    adjustmentsError.value = '';
    const resp = await api.put(`/payroll/periods/${selectedPeriodId.value}/adjustments/${uid}`, {
      mileageAmount: Number(adjustments.value.mileageAmount || 0),
      otherTaxableAmount: Number(adjustments.value.otherTaxableAmount || 0),
      bonusAmount: Number(adjustments.value.bonusAmount || 0),
      reimbursementAmount: Number(adjustments.value.reimbursementAmount || 0),
      salaryAmount: Number(adjustments.value.salaryAmount || 0),
      ptoHours: Number(adjustments.value.ptoHours || 0),
      ptoRate: Number(adjustments.value.ptoRate || 0)
    });
    // If backend returned refreshed summaries (period already ran), update without wiping the run.
    if (resp?.data?.period || resp?.data?.summaries) {
      if (resp.data?.period) selectedPeriod.value = resp.data.period;
      if (Array.isArray(resp.data?.summaries)) {
        const nextSummaries = resp.data.summaries.map((s) => {
          if (typeof s.breakdown === 'string') {
            try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
          }
          return s;
        });
        summaries.value = nextSummaries;
        if (selectedUserId.value) {
          const found = nextSummaries.find((x) => x.user_id === selectedUserId.value);
          if (found) selectedSummary.value = found;
        }
      } else {
        await loadPeriodDetails();
      }
    } else {
      await loadPeriodDetails();
    }
  } catch (e) {
    adjustmentsError.value = e.response?.data?.error?.message || e.message || 'Failed to save adjustments';
  } finally {
    savingAdjustments.value = false;
  }
};

const loadRateCard = async () => {
  const uid = selectedUserId.value;
  if (!uid || !agencyId.value) return;
  try {
    rateCardLoading.value = true;
    rateCardError.value = '';
    const resp = await api.get('/payroll/rate-cards', { params: { agencyId: agencyId.value, userId: uid } });
    const rc = resp.data || {};
    rateCard.value = {
      directRate: Number(rc.direct_rate || 0),
      indirectRate: Number(rc.indirect_rate || 0),
      otherRate1: Number(rc.other_rate_1 || 0),
      otherRate2: Number(rc.other_rate_2 || 0),
      otherRate3: Number(rc.other_rate_3 || 0)
    };
  } catch (e) {
    rateCardError.value = e.response?.data?.error?.message || e.message || 'Failed to load rate card';
  } finally {
    rateCardLoading.value = false;
  }
};

const saveRateCard = async () => {
  const uid = selectedUserId.value;
  if (!uid || !agencyId.value) return;
  try {
    savingRateCard.value = true;
    rateCardError.value = '';
    await api.post('/payroll/rate-cards', {
      agencyId: agencyId.value,
      userId: uid,
      directRate: Number(rateCard.value.directRate || 0),
      indirectRate: Number(rateCard.value.indirectRate || 0),
      otherRate1: Number(rateCard.value.otherRate1 || 0),
      otherRate2: Number(rateCard.value.otherRate2 || 0),
      otherRate3: Number(rateCard.value.otherRate3 || 0)
    });
    await loadPeriodDetails();
  } catch (e) {
    rateCardError.value = e.response?.data?.error?.message || e.message || 'Failed to save rate card';
  } finally {
    savingRateCard.value = false;
  }
};

const saveStagingRow = async (r) => {
  const uid = r?.userId;
  const serviceCode = r?.serviceCode;
  if (!uid || !serviceCode) return;
  const row = stagingEdits.value?.[stagingKey(r)];
  if (!row) return;
  try {
    savingStaging.value = true;
    stagingError.value = '';
    await api.patch(`/payroll/periods/${selectedPeriodId.value}/staging`, {
      userId: uid,
      serviceCode,
      noNoteUnits: Number(row.noNoteUnits),
      draftUnits: Number(row.draftUnits),
      finalizedUnits: Number(row.finalizedUnits)
    });
    await loadPeriodDetails();
  } catch (e) {
    stagingError.value = e.response?.data?.error?.message || e.message || 'Failed to save staging row';
  } finally {
    savingStaging.value = false;
  }
};

const saveRate = async () => {
  try {
    if (!selectedUserId.value) return;
    savingRate.value = true;
    error.value = '';
    await api.post('/payroll/rates', {
      agencyId: agencyId.value,
      userId: selectedUserId.value,
      serviceCode: rateServiceCode.value,
      rateAmount: rateAmount.value
    });
    rateServiceCode.value = '';
    rateAmount.value = '';
    // We don't auto-recompute yet; CSV import already triggers recompute.
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save rate';
  } finally {
    savingRate.value = false;
  }
};

const runPayroll = async () => {
  try {
    if (!selectedPeriodId.value) return;
    // If you edited staging but didn’t click Save, persist before rerun so results match.
    await saveAllDirtyStagingEdits();
    runningPayroll.value = true;
    error.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/run`);
    await loadPeriods();
    await loadPeriodDetails();
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Failed to run payroll';
    error.value = msg;
    // If blocked due to pending mileage approvals, open Payroll Stage and show the list.
    if (e.response?.status === 409 && e.response?.data?.pendingMileage) {
      showStageModal.value = true;
      await loadPendingMileageClaims();
    }
    if (e.response?.status === 409 && e.response?.data?.pendingMedcancel) {
      showStageModal.value = true;
      await loadPendingMedcancelClaims();
    }
  } finally {
    runningPayroll.value = false;
  }
};

const postPayroll = async () => {
  try {
    if (!selectedPeriodId.value) return;
    postingPayroll.value = true;
    error.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/post`);
    await loadPeriods();
    await loadPeriodDetails();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to post payroll';
  } finally {
    postingPayroll.value = false;
  }
};

const resetPeriod = async () => {
  try {
    if (!selectedPeriodId.value) return;
    const ok = window.confirm('Reset this pay period back to Draft and clear ALL related data (imports, staging, adjustments, run results)? The pay period will remain.');
    if (!ok) return;
    resettingPeriod.value = true;
    error.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/reset`);
    await loadPeriods();
    await loadPeriodDetails();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to reset pay period';
  } finally {
    resettingPeriod.value = false;
  }
};


watch(agencyId, async () => {
  selectedPeriodId.value = null;
  selectedPeriod.value = null;
  summaries.value = [];
  selectedUserId.value = null;
  selectedSummary.value = null;
  await loadAgencyUsers();
  await loadPeriods();
  await restoreSelectionFromStorage();
});

watch(filteredAgencies, () => {
  // Keep selection stable when filtering
  if (selectedOrgId.value) return;
  const existing = agencyId.value;
  if (existing) {
    selectedOrgId.value = existing;
    return;
  }
  if (filteredAgencies.value.length === 1) {
    selectedOrgId.value = filteredAgencies.value[0].id;
  }
});

watch(selectedOrgId, async (id) => {
  if (!id) return;
  try { localStorage.setItem(LS_LAST_ORG_ID, String(id)); } catch { /* ignore */ }
  const found = (payrollAgencyOptions.value || []).find((x) => x.id === id);
  if (found) {
    agencyStore.setCurrentAgency(found);
    organizationStore.setCurrentOrganization(found);
  }
});

watch(selectedPeriodId, async (id) => {
  if (!id) return;
  try {
    if (agencyId.value) localStorage.setItem(lsLastPeriodKey(agencyId.value), String(id));
  } catch { /* ignore */ }
  await loadPeriodDetails();
  await loadApprovedMileageClaimsAmount();
  await loadApprovedMedcancelClaimsAmount();
  await loadApprovedMileageClaimsList();
  await loadApprovedMedcancelClaimsList();
});

watch(showStageModal, async (open) => {
  if (!open) return;
  await loadServiceCodeRules();
  await loadMileageRates();
  // Default to *all* pending so nothing “disappears” between pay periods.
  await loadAllPendingMileageClaims();
  await loadAllPendingMedcancelClaims();
  await loadAllPendingReimbursementClaims();
  await loadApprovedMileageClaimsAmount();
  await loadApprovedMedcancelClaimsAmount();
  await loadApprovedReimbursementClaimsAmount();
  await loadApprovedMileageClaimsList();
  await loadApprovedMedcancelClaimsList();
  await loadApprovedReimbursementClaimsList();
});

watch(selectedUserId, async () => {
  await loadAdjustments();
  await loadRateCard();
  await loadApprovedMileageClaimsAmount();
  await loadApprovedMedcancelClaimsAmount();
  await loadApprovedReimbursementClaimsAmount();
});

watch(previewUserId, async () => {
  if (!previewUserId.value || !selectedPeriodId.value) {
    previewAdjustments.value = null;
    previewAdjustmentsError.value = '';
    previewPostNotifications.value = [];
    previewPostNotificationsError.value = '';
    previewUserPayrollHistory.value = [];
    previewUserPayrollHistoryError.value = '';
    return;
  }
  try {
    previewAdjustmentsLoading.value = true;
    previewAdjustmentsError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/adjustments`, { params: { userId: previewUserId.value } });
    previewAdjustments.value = resp.data || null;
  } catch (e) {
    previewAdjustmentsError.value = e.response?.data?.error?.message || e.message || 'Failed to load adjustments';
    previewAdjustments.value = null;
  } finally {
    previewAdjustmentsLoading.value = false;
  }

  // Load post-time notifications preview for this provider.
  try {
    previewPostNotificationsLoading.value = true;
    previewPostNotificationsError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/post/preview`, { params: { userId: previewUserId.value } });
    previewPostNotifications.value = resp.data?.notifications || [];
  } catch (e) {
    previewPostNotificationsError.value = e.response?.data?.error?.message || e.message || 'Failed to load post preview notifications';
    previewPostNotifications.value = [];
  } finally {
    previewPostNotificationsLoading.value = false;
  }

  // Load provider payroll history so we can show the same "old/unpaid notes" banners they see.
  try {
    if (!agencyId.value) return;
    previewUserPayrollHistoryLoading.value = true;
    previewUserPayrollHistoryError.value = '';
    const resp = await api.get(`/payroll/users/${previewUserId.value}/periods`, { params: { agencyId: agencyId.value } });
    previewUserPayrollHistory.value = resp.data || [];
  } catch (e) {
    previewUserPayrollHistoryError.value = e.response?.data?.error?.message || e.message || 'Failed to load provider payroll history';
    previewUserPayrollHistory.value = [];
  } finally {
    previewUserPayrollHistoryLoading.value = false;
  }
});

watch(
  [showRunModal, showPreviewPostModal, selectedPeriodId],
  async () => {
    if (!selectedPeriodId.value) return;
    if (!canSeeRunResults.value) return;
    if (!showRunModal.value && !showPreviewPostModal.value) return;
    await loadImmediatePriorSummaries();
  }
);

onMounted(async () => {
  // Ensure an org list exists even if user didn't pick one elsewhere
  // - super_admin: load all agencies
  // - others: load assigned agencies
  if (authStore.user?.role === 'super_admin') {
    await agencyStore.fetchAgencies();
  } else {
    await agencyStore.fetchUserAgencies();
  }
  // Fallback: if assigned agencies are empty (some edge cases), load all.
  if (!(agencyStore.userAgencies?.length || agencyStore.userAgencies?.value?.length) && !(agencyStore.agencies?.length || agencyStore.agencies?.value?.length)) {
    await agencyStore.fetchAgencies();
  }
  // Seed selector from any pre-existing context
  if (agencyId.value) selectedOrgId.value = agencyId.value;
  await loadAgencyUsers();
  await loadPeriods();
  await restoreSelectionFromStorage();
  // Do NOT auto-create a "present" period on page load.
  // Only create it if the admin explicitly uses the Process Changes workflow.
  if (!processTargetPeriodId.value) processTargetPeriodId.value = suggestedCurrentPeriodId.value || null;
});

const ensureSuggestedCurrentPeriodExists = async () => {
  if (!agencyId.value) return null;
  const range = suggestedCurrentPeriodRange.value;
  if (!range) return null;
  // If it already exists, use it.
  if (suggestedCurrentPeriodId.value) return suggestedCurrentPeriodId.value;

  try {
    creatingCurrentPeriod.value = true;
    const resp = await api.post('/payroll/periods', {
      agencyId: agencyId.value,
      periodStart: range.start,
      periodEnd: range.end,
      label: `${range.start} to ${range.end}`
    });
    await loadPeriods();
    return resp.data?.id || suggestedCurrentPeriodId.value || null;
  } finally {
    creatingCurrentPeriod.value = false;
  }
};

watch(processTargetPeriodId, async (v) => {
  // If user picked the sentinel "present pay period (auto)", ensure it exists then replace selection with actual id.
  if (v !== -1) {
    processTargetEffectiveId.value = v || null;
    const p = (periods.value || []).find((x) => x.id === v) || null;
    processTargetEffectiveLabel.value = p ? periodRangeLabel(p) : '';
    return;
  }
  if (creatingCurrentPeriod.value) return;
  const id = await ensureSuggestedCurrentPeriodExists();
  if (id) {
    processTargetPeriodId.value = id;
    processTargetEffectiveId.value = id;
    const p = (periods.value || []).find((x) => x.id === id) || null;
    processTargetEffectiveLabel.value = p ? periodRangeLabel(p) : (suggestedCurrentPeriodLabel.value || '');
  }
});

const onProcessFilePick = (evt) => {
  processImportFile.value = evt.target.files?.[0] || null;
};

const processAutoImport = async () => {
  try {
    if (!agencyId.value) return;
    if (!processImportFile.value) return;
    processingChanges.value = true;
    processError.value = '';
    processDetectedHint.value = '';
    processSourcePeriodId.value = null;
    processSourcePeriodLabel.value = '';

    const fd = new FormData();
    fd.append('file', processImportFile.value);
    fd.append('agencyId', String(agencyId.value));
    const resp = await api.post('/payroll/periods/auto/detect', fd);
    processDetectResult.value = resp.data || null;
    const detected = processDetectResult.value?.detected;
    if (detected?.periodStart && detected?.periodEnd) {
      processDetectedHint.value = `Detected prior pay period: ${detected.periodStart} → ${detected.periodEnd}`;
    }
    processChoiceMode.value = 'detected';
    processExistingPeriodId.value = processDetectResult.value?.existingPeriodId || null;
    processCustomStart.value = detected?.periodStart || '';
    processCustomEnd.value = detected?.periodEnd || '';
    processConfirmOpen.value = true;
  } catch (e) {
    processError.value = e.response?.data?.error?.message || e.message || 'Failed to auto-detect/import prior pay period';
  } finally {
    processingChanges.value = false;
  }
};

const confirmProcessImport = async () => {
  try {
    if (!agencyId.value) return;
    if (!processImportFile.value) return;
    processingChanges.value = true;
    processError.value = '';

    let sourcePeriodId = null;
    if (processChoiceMode.value === 'existing') {
      sourcePeriodId = processExistingPeriodId.value;
      if (!sourcePeriodId) {
        processError.value = 'Select an existing prior pay period.';
        return;
      }
    } else if (processChoiceMode.value === 'custom') {
      const start = String(processCustomStart.value || '').slice(0, 10);
      const end = String(processCustomEnd.value || '').slice(0, 10);
      if (!start || !end) {
        processError.value = 'Enter a custom pay period start and end.';
        return;
      }
      const resp = await api.post('/payroll/periods', {
        agencyId: agencyId.value,
        periodStart: start,
        periodEnd: end,
        label: `${start} to ${end}`
      });
      sourcePeriodId = resp.data?.id || null;
    } else {
      const detected = processDetectResult.value?.detected;
      if (!detected?.periodStart || !detected?.periodEnd) {
        processError.value = 'No detected prior pay period available. Choose an existing period or enter custom dates.';
        return;
      }
      sourcePeriodId = processExistingPeriodId.value;
      if (!sourcePeriodId) {
        const start = String(detected.periodStart || '').slice(0, 10);
        const end = String(detected.periodEnd || '').slice(0, 10);
        const resp = await api.post('/payroll/periods', {
          agencyId: agencyId.value,
          periodStart: start,
          periodEnd: end,
          label: `${start} to ${end}`
        });
        sourcePeriodId = resp.data?.id || null;
      }
    }
    if (!sourcePeriodId) {
      processError.value = 'Could not determine a prior pay period to import into.';
      return;
    }

    const fd = new FormData();
    fd.append('file', processImportFile.value);
    await api.post(`/payroll/periods/${sourcePeriodId}/import`, fd);

    await loadPeriods();
    const p = (periods.value || []).find((x) => x.id === sourcePeriodId) || null;
    processSourcePeriodId.value = sourcePeriodId;
    processSourcePeriodLabel.value = p ? periodRangeLabel(p) : `Period #${sourcePeriodId}`;

    processImportFile.value = null;
    processConfirmOpen.value = false;
  } catch (e) {
    processError.value = e.response?.data?.error?.message || e.message || 'Failed to import prior pay period report';
  } finally {
    processingChanges.value = false;
  }
};

const processRunAndCompare = async () => {
  try {
    if (!processSourcePeriodId.value) return;
    if (!processTargetEffectiveId.value) return;
    processingChanges.value = true;
    processError.value = '';

    // Run payroll for the prior period to create a new run snapshot.
    await api.post(`/payroll/periods/${processSourcePeriodId.value}/run`);

    // Switch UI context to the present pay period (destination) and open compare modal.
    await selectPeriod(processTargetEffectiveId.value);
    showCarryoverModal.value = true;
    carryoverPriorPeriodId.value = processSourcePeriodId.value;
    await loadCarryoverRuns();
    await loadCarryoverPreview();
  } catch (e) {
    processError.value = e.response?.data?.error?.message || e.message || 'Failed to run prior period and compare changes';
  } finally {
    processingChanges.value = false;
  }
};
</script>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 18px;
}
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.card-title {
  margin: 0 0 12px 0;
}
.subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary);
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1.5fr;
  gap: 10px;
  margin-bottom: 12px;
}
.field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
input[type='text'],
input[type='date'],
input[type='number'] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  flex-direction: row;
}

/* Keep payroll buttons compact (text-sized) */
.btn {
  padding: 6px 10px;
  font-size: 13px;
  line-height: 1.2;
}
.btn.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
.actions .btn {
  width: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  white-space: nowrap;
}
.hint {
  font-size: 12px;
  color: var(--text-secondary);
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.list-item {
  text-align: left;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
}
.list-item.active {
  border-color: #334155;
}
.list-item-title {
  font-weight: 600;
}
.list-item-meta {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.period-meta {
  display: grid;
  gap: 4px;
  margin-bottom: 12px;
  color: var(--text-primary);
}
.import-box {
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 14px;
}
.import-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.import-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.warn-box {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 50;
}
.modal {
  width: min(1100px, 100%);
  max-height: 85vh;
  overflow: auto;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.modal-title {
  font-weight: 700;
  font-size: 16px;
}
.table-wrap {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.carryover-row {
  background: #fff9db;
}
.carryover-cell {
  background: #fff3bf;
  font-weight: 700;
}
.right {
  text-align: right;
}
.muted {
  color: var(--text-secondary);
}
.clickable {
  cursor: pointer;
}
.section-title {
  margin: 16px 0 10px;
}
.rates-box {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.breakdown {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}
.breakdown-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.codes {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.codes-head,
.code-row {
  display: grid;
  grid-template-columns:
    minmax(110px, 1.2fr)
    90px
    90px
    90px
    90px
    90px
    110px
    120px;
  align-items: center;
}

.codes-head {
  font-weight: 700;
  background: var(--bg-alt, #f8fafc);
  border-bottom: 1px solid var(--border);
}

.codes-head > div,
.code-row > div {
  padding: 8px 10px;
}

.code-row {
  border-bottom: 1px solid var(--border);
}

.code-row:last-child {
  border-bottom: none;
}

.code-row .code {
  font-weight: 600;
}
.code {
  font-weight: 600;
}
.rate-editor .field-row {
  grid-template-columns: 1fr 1fr;
}
.adjustments-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 8px;
}
.adjustments-grid .actions {
  grid-column: 1 / -1;
  margin: 0;
}
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
}
@media (max-width: 980px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>

