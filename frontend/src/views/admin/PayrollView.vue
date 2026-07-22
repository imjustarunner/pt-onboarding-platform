<template>
  <div class="container pr-page">
    <div v-if="wizardReturnPath" class="pr-wizard-return">
      <span>You opened a payroll tool from the Wizard.</span>
      <button type="button" class="btn btn-primary btn-sm" @click="returnToWizard">Return to Wizard</button>
    </div>
    <div class="pr-header" data-tour="payroll-header">
      <div class="pr-header-text">
        <h1 data-tour="payroll-title">Payroll</h1>
        <p class="subtitle">Manage payroll runs, compare pay periods, and process payments.</p>
      </div>
      <div class="pr-header-controls" data-tour="payroll-org-bar">
        <div class="pr-org-picker">
          <div v-if="!showOrgPicker" class="pr-org-value">
            <span class="pr-org-label">Organization</span>
            <strong>{{ agencyStore.currentAgency?.name || '—' }}</strong>
          </div>
          <div v-else class="org-bar-controls">
            <select v-model="selectedOrgId" :key="`org-bar-${(filteredAgencies || []).length}`">
              <option :value="null" disabled>Select an organization…</option>
              <option v-for="a in filteredAgencies" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <input v-model="orgSearch" type="text" placeholder="Search…" />
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedPeriodForUi" class="pr-active-period-banner" role="status" aria-live="polite">
      <div class="pr-active-period-banner-inner">
        <div class="pr-active-period-kicker">Working pay period</div>
        <div class="pr-active-period-range">{{ periodRangeLabel(selectedPeriodForUi) }}</div>
        <span class="pr-status-pill" :class="`pr-status-${dashboardStatusKey || 'draft'}`">{{ dashboardStatusLabel }}</span>
        <span v-if="!hasBillingImport" class="pr-active-period-note">Billing report not uploaded yet</span>
      </div>
    </div>

    <div class="pr-metrics" v-if="agencyId">
      <div class="pr-metric-card">
        <div class="pr-metric-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </div>
        <div class="pr-metric-body">
          <div class="pr-metric-label">Current Pay Period</div>
          <div class="pr-metric-value">{{ selectedPeriodForUi ? periodRangeLabel(selectedPeriodForUi) : '—' }}</div>
          <div class="pr-metric-meta">
            Status:
            <span class="pr-status-pill" :class="`pr-status-${dashboardStatusKey || 'draft'}`">{{ dashboardStatusLabel }}</span>
          </div>
        </div>
      </div>
      <div class="pr-metric-card">
        <div class="pr-metric-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4V8z"/></svg>
        </div>
        <div class="pr-metric-body">
          <div class="pr-metric-label">Next Payroll Run</div>
          <div class="pr-metric-value">Runs on {{ dashboardNextRunLabel }}</div>
          <div class="pr-metric-meta">14 days after last run</div>
        </div>
      </div>
      <div class="pr-metric-card">
        <div class="pr-metric-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div class="pr-metric-body">
          <div class="pr-metric-label">Total Employees</div>
          <div class="pr-metric-value pr-metric-num" :title="`Counts active users with payroll staff roles: provider, supervisor, CPA, provider_plus, staff, facilitator, intern, admin, super_admin, support`">{{ dashboardEmployeeCount }}</div>
          <div class="pr-metric-meta">Active employees</div>
        </div>
      </div>
      <button
        type="button"
        class="pr-metric-card pr-metric-card--action"
        :class="{ 'pr-metric-card--alert': dashboardPendingCount > 0 }"
        @click="openPendingFromDashboard"
        title="Open Pending Submissions"
      >
        <div class="pr-metric-icon pr-metric-icon--alert" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
        </div>
        <div class="pr-metric-body">
          <div class="pr-metric-label">Pending Submissions</div>
          <div class="pr-metric-value pr-metric-num">{{ dashboardPendingCounts != null ? dashboardPendingCount : '—' }}</div>
          <div class="pr-metric-meta">{{ dashboardPendingCount > 0 ? 'Requires review — all periods' : (dashboardPendingCounts != null ? 'All clear' : 'Loading…') }}</div>
        </div>
      </button>
    </div>

    <div class="pr-command" v-if="agencyId" data-tour="payroll-wizard-hero">
      <div class="pr-command-col pr-command-actions">
        <div class="card pr-wizard-card">
          <h2 class="card-title">Payroll Wizard</h2>
          <p class="hint">Step-by-step guide for submitting payroll. Select a pay period; it drives the whole page.</p>
          <div class="field wizard-period pr-period-field" data-tour="payroll-period-picker" style="margin-top: 12px;">
            <label>Pay period</label>
            <select v-model="selectedPeriodId" :disabled="!agencyId || !(periodsForSelect || []).length" :key="`period-wizard-${agencyId || 'none'}`">
              <option :value="null" disabled>Select a pay period…</option>
              <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }} · {{ periodStatusForDisplay(p).label }}</option>
            </select>
          </div>
          <div class="wizard-cta" data-tour="payroll-open-wizard" style="margin-top: 12px;">
            <button class="btn btn-primary wizard-btn" type="button" @click="openPayrollWizard" :disabled="!agencyId || !periodsForSelect.length">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: -2px;"><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/></svg>
              {{ selectedPeriodId && hasBillingImport ? 'Open / Resume Wizard' : 'Open Payroll Wizard' }}
            </button>
          </div>
          <div class="hint" style="margin-top: 10px;" v-if="selectedPeriodForUi">
            Current: <strong>{{ periodRangeLabel(selectedPeriodForUi) }}</strong>
          </div>
        </div>

        <div class="card pr-quick-card">
          <h2 class="card-title">Quick Actions</h2>
          <div class="pr-quick-grid" data-tour="payroll-wizard-controls">
            <button class="pr-quick-btn" type="button" @click="runPayroll" :disabled="runningPayroll || isPeriodPosted || !selectedPeriodId">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              {{ runningPayroll ? 'Running…' : (canSeeRunResults ? 'Re-run Payroll' : 'Run Payroll') }}
            </button>
            <button class="pr-quick-btn" type="button" @click.prevent.stop="openPayrollReports" :disabled="!selectedPeriodId">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
              View Reports
            </button>
            <button class="pr-quick-btn" type="button" @click="postPayroll" :disabled="postingPayroll || isPeriodPosted || selectedPeriodStatus !== 'ran'">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              {{ postingPayroll ? 'Posting…' : (isPeriodPosted ? 'Posted' : 'Post Payroll') }}
            </button>
            <button class="pr-quick-btn" type="button" @click="triggerCurrentPayrollUpload" :disabled="!agencyId || importing">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import Payroll
            </button>
            <button class="pr-quick-btn" type="button" @click="openManageImportsModal" :disabled="!agencyId">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Manage Imports
            </button>
            <button class="pr-quick-btn" type="button" @click="openTodoModal" :disabled="!selectedPeriodId">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>
              Add Note
            </button>
            <button class="pr-quick-btn" type="button" @click="openPtoSheetModal" :disabled="!agencyId">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
              PTO Sheet
            </button>
            <button class="pr-quick-btn" type="button" @click="openSupervisionSheetModal" :disabled="!agencyId">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Supervision Sheet
            </button>
          </div>
          <div class="pr-secondary-actions">
            <button class="btn btn-secondary btn-sm" type="button" @click="showStageModal = true" :disabled="!selectedPeriodId">Payroll Stage</button>
            <button class="btn btn-secondary btn-sm" type="button" @click="openRawModal" :disabled="!selectedPeriodId">Raw Import Audit</button>
            <button class="btn btn-secondary btn-sm" type="button" @click="openRunsSideBySideModal" :disabled="!selectedPeriodId">Runs Side-by-Side</button>
            <button class="btn btn-secondary btn-sm" type="button" @click="openSubmitOnBehalfModal" :disabled="!agencyId">Submit on behalf</button>
            <button v-if="canSeeRunResults" class="btn btn-secondary btn-sm" type="button" @click.prevent.stop="openRunResultsModalV2" :disabled="!selectedPeriodId">View Ran Payroll</button>
            <button v-if="canSeeRunResults" class="btn btn-secondary btn-sm" type="button" @click.prevent.stop="openPreviewPostModalV2" :disabled="!selectedPeriodId">Preview Post</button>
            <button
              v-if="isPeriodPosted"
              class="btn btn-danger btn-sm"
              type="button"
              @click.prevent.stop="unpostPayroll"
              :disabled="unpostingPayroll || !selectedPeriodId"
            >{{ unpostingPayroll ? 'Unposting…' : 'Unpost' }}</button>
            <button class="btn btn-danger btn-sm" type="button" @click="resetPeriod" :disabled="resettingPeriod || !selectedPeriodId">
              {{ resettingPeriod ? 'Resetting…' : 'Reset Period' }}
            </button>
          </div>
        </div>

        <div class="pr-autodetect">
          <div class="pr-autodetect-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div>
            <div class="pr-autodetect-title">Auto-Detect is On</div>
            <div class="hint">Uploads auto-detect the correct pay period (Sat→Fri, every 2 weeks).</div>
          </div>
        </div>
      </div>

      <div class="card pr-command-col pr-history-card">
        <h2 class="card-title">Pay Periods (History)</h2>
        <div class="field" style="margin-top: 8px;">
          <label style="display: inline-flex; gap: 8px; align-items: center; font-weight: 600;">
            <input type="checkbox" v-model="showOffSchedulePeriods" />
            Show off-schedule periods
          </label>
        </div>
        <div class="pr-search-wrap" style="margin-top: 10px;">
          <svg class="pr-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
          <input
            v-model="historySearch"
            type="text"
            class="pr-search-input"
            placeholder="Search pay periods…"
          />
        </div>
        <div class="list pr-period-list">
          <button
            v-for="p in historyPeriodsFiltered"
            :key="p.id"
            class="list-item"
            :class="{ active: selectedPeriodId === p.id }"
            @click="selectPeriod(p.id)"
          >
            <div class="list-item-title">{{ periodRangeLabel(p) }}</div>
            <div class="list-item-meta">
              <span class="pr-status-dot" :class="`pr-dot-${periodStatusForDisplay(p).key}`"></span>
              <span class="pr-status-pill" :class="`pr-status-${periodStatusForDisplay(p).key}`">
                {{ periodStatusForDisplay(p).label }}
              </span>
              <span v-if="p.status === 'finalized' && (p.finalized_by_first_name || p.finalized_by_last_name || p.finalized_at)" class="muted">
                · {{ p.finalized_by_first_name }} {{ p.finalized_by_last_name }}
              </span>
            </div>
          </button>
          <div v-if="!(historyPeriodsFiltered || []).length" class="muted" style="padding: 12px 4px;">No pay periods found.</div>
        </div>
      </div>

      <div class="card pr-command-col pr-details-card">
        <h2 class="card-title">Period Details</h2>
        <template v-if="selectedPeriodForUi">
          <div class="field-row pr-details-filters" style="margin-top: 8px;">
            <div class="field pr-period-field">
              <label>Pay Period</label>
              <select v-model="selectedPeriodId" :key="`period-details-top-${agencyId || 'none'}`">
                <option :value="null" disabled>Select a pay period…</option>
                <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }} · {{ periodStatusForDisplay(p).label }}</option>
              </select>
            </div>
            <div class="field">
              <label>Provider</label>
              <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end;">
                <select v-model="selectedUserId">
                  <option :value="null" disabled>Select a provider…</option>
                  <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                </select>
                <button class="btn btn-secondary btn-sm" @click="clearSelectedProvider" :disabled="!selectedUserId">Clear</button>
              </div>
            </div>
          </div>
          <div class="period-meta pr-period-meta">
            <div class="pr-period-meta-range"><strong>Pay Period:</strong> <span class="pr-period-chip">{{ periodRangeLabel(selectedPeriodForUi) }}</span></div>
            <div>
              <strong>Status:</strong>
              <span class="pr-status-pill" :class="`pr-status-${dashboardStatusKey || 'draft'}`">{{ dashboardStatusLabel }}</span>
            </div>
            <div v-if="selectedPeriodStatus === 'ran' && selectedPeriodForUi?.ran_at">
              <strong>Ran:</strong> {{ fmtDateTime(selectedPeriodForUi.ran_at) }}
            </div>
            <div v-if="(selectedPeriodStatus === 'posted' || selectedPeriodStatus === 'finalized') && selectedPeriodForUi?.posted_at">
              <strong>Posted:</strong> {{ fmtDateTime(selectedPeriodForUi.posted_at) }}
            </div>
          </div>
          <div v-if="!canSeeRunResults" class="pr-info-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>Run results are private until you click <strong>Run Payroll</strong>. Providers will not see anything until <strong>Post Payroll</strong>.</span>
          </div>
          <div v-else class="pr-info-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Run results are available. Scroll down for totals, or use <strong>View Ran Payroll</strong> / <strong>Reports</strong>.</span>
          </div>
        </template>
        <div v-else class="hint" style="margin-top: 10px;">Select a pay period to view details.</div>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <!-- Typed-confirmation modal for destructive actions (Unpost / Reset) -->
    <teleport to="body">
      <div v-if="dangerConfirm.show" class="modal-backdrop" @click.self="dangerConfirm.show = false">
        <div class="modal" style="max-width: 520px;">
          <div class="modal-header">
            <div>
              <div class="modal-title" style="color: #c0392b;">{{ dangerConfirm.title }}</div>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" @click="dangerConfirm.show = false">Cancel</button>
          </div>
          <div style="padding: 20px 20px 4px;">
            <div
              style="background: #fff8f7; border: 1px solid #f5c6c2; border-radius: 8px; padding: 14px 16px; font-size: 0.93em; line-height: 1.6; margin-bottom: 18px;"
              v-html="dangerConfirm.description"
            ></div>
            <div class="field">
              <label style="font-weight: 600;">
                Type <strong style="letter-spacing: 0.05em; color: #c0392b;">{{ dangerConfirm.word }}</strong> to confirm
              </label>
              <input
                v-model="dangerConfirm.typed"
                type="text"
                :placeholder="`Type ${dangerConfirm.word} here`"
                autocomplete="off"
                spellcheck="false"
                style="font-family: monospace; font-size: 1em; letter-spacing: 0.05em;"
                @keyup.enter="dangerConfirmOk"
              />
            </div>
          </div>
          <div style="padding: 12px 20px 20px; display: flex; gap: 8px; justify-content: flex-end;">
            <button class="btn btn-secondary" type="button" @click="dangerConfirm.show = false">Cancel</button>
            <button
              class="btn btn-danger"
              type="button"
              :disabled="dangerConfirm.typed !== dangerConfirm.word || dangerConfirm.loading"
              @click="dangerConfirmOk"
            >
              {{ dangerConfirm.loading ? 'Please wait…' : dangerConfirm.buttonLabel }}
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- Global modals (must not be nested under Payroll Stage) -->
    <teleport to="body">
      <PayrollPtoSheetModal
        :open="showPtoSheetModal"
        :agency-id="agencyId"
        @close="showPtoSheetModal = false"
      />
      <PayrollSupervisionSheetModal
        :open="showSupervisionSheetModal"
        :agency-id="agencyId"
        @close="showSupervisionSheetModal = false"
      />
      <div v-if="showTodoModal" class="modal-backdrop">
        <div class="modal" style="width: min(920px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Payroll To‑Dos</div>
              <div class="hint">These block running payroll until marked Done.</div>
            </div>
            <div class="actions" style="margin: 0;">
              <button class="btn btn-secondary btn-sm" type="button" @click="showTodoModal = false">Close</button>
            </div>
          </div>

          <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
            <button class="btn btn-secondary btn-sm" type="button" @click="todoTab = 'period'">This pay period</button>
            <button class="btn btn-secondary btn-sm" type="button" @click="todoTab = 'templates'">Recurring templates</button>
          </div>

          <div v-if="todoTab === 'period'">
            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Add a To‑Do (single)</h3>
              <div class="field-row" style="grid-template-columns: 180px 1fr; margin-top: 10px;">
                <div class="field">
                  <label>Scope</label>
                  <select v-model="newTodoDraft.scope">
                    <option value="agency">Agency-wide</option>
                    <option value="provider">Per-provider</option>
                  </select>
                </div>
                <div v-if="newTodoDraft.scope === 'provider'" class="field">
                  <label>Provider</label>
                  <select v-model="newTodoDraft.targetUserId">
                    <option :value="null">Select provider…</option>
                    <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                  </select>
                </div>
              </div>
              <div class="field" style="margin-top: 10px;">
                <label>Title</label>
                <input v-model="newTodoDraft.title" type="text" placeholder="e.g., Verify X before running payroll" />
              </div>
              <div class="field" style="margin-top: 10px;">
                <label>Description (optional)</label>
                <textarea v-model="newTodoDraft.description" rows="3" placeholder="Optional details…" />
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-primary" type="button" @click="createTodoForPeriod" :disabled="!String(newTodoDraft.title||'').trim()">
                  Add To‑Do
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">To‑Dos for this pay period</h3>
              <div v-if="payrollTodosError" class="warn-box" style="margin-top: 8px;">{{ payrollTodosError }}</div>
              <div v-if="payrollTodosLoading" class="muted" style="margin-top: 8px;">Loading…</div>
              <div v-else-if="!(payrollTodos||[]).length" class="muted" style="margin-top: 8px;">No To‑Dos yet.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th style="width: 90px;">Done</th>
                      <th>To‑Do</th>
                      <th style="width: 220px;">Scope</th>
                      <th style="width: 160px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in payrollTodos" :key="t.id">
                      <td>
                        <input
                          type="checkbox"
                          :checked="String(t.status || '').toLowerCase() === 'done'"
                          :disabled="updatingPayrollTodoId === t.id"
                          @change="togglePayrollTodoDone(t, $event.target.checked)"
                        />
                      </td>
                      <td>
                        <div v-if="editingPeriodTodoId !== t.id">
                          <div><strong>{{ t.title }}</strong></div>
                          <div v-if="t.description" class="muted" style="margin-top: 4px;">{{ t.description }}</div>
                        </div>
                        <div v-else>
                          <div class="field">
                            <label style="margin-bottom: 4px;">Title</label>
                            <input v-model="editPeriodTodoDraft.title" type="text" />
                          </div>
                          <div class="field" style="margin-top: 8px;">
                            <label style="margin-bottom: 4px;">Description</label>
                            <textarea v-model="editPeriodTodoDraft.description" rows="2" />
                          </div>
                        </div>
                      </td>
                      <td class="muted">
                        <div v-if="editingPeriodTodoId !== t.id">
                          <span v-if="String(t.scope||'agency')==='provider'">Provider: {{ nameForUserId(Number(t.target_user_id || 0)) }}</span>
                          <span v-else>Agency-wide</span>
                        </div>
                        <div v-else>
                          <div class="field">
                            <label style="margin-bottom: 4px;">Scope</label>
                            <select v-model="editPeriodTodoDraft.scope">
                              <option value="agency">Agency-wide</option>
                              <option value="provider">Per-provider</option>
                            </select>
                          </div>
                          <div class="field" style="margin-top: 8px;" v-if="editPeriodTodoDraft.scope === 'provider'">
                            <label style="margin-bottom: 4px;">Provider</label>
                            <select v-model="editPeriodTodoDraft.targetUserId">
                              <option :value="null">Select provider…</option>
                              <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                            </select>
                          </div>
                        </div>
                      </td>
                      <td class="right">
                        <div v-if="editingPeriodTodoId !== t.id">
                          <button class="btn btn-secondary btn-sm" type="button" @click="beginEditPeriodTodo(t)" :disabled="updatingPayrollTodoId === t.id">
                            Edit
                          </button>
                          <button
                            v-if="!t.template_id"
                            class="btn btn-danger btn-sm"
                            type="button"
                            style="margin-left: 8px;"
                            @click="deletePeriodTodo(t)"
                            :disabled="updatingPayrollTodoId === t.id"
                            title="Deletes only ad-hoc To-Dos (recurring template items cannot be deleted here)."
                          >
                            Delete
                          </button>
                        </div>
                        <div v-else>
                          <button class="btn btn-secondary btn-sm" type="button" @click="cancelEditPeriodTodo" :disabled="savingPeriodTodoEdits">
                            Cancel
                          </button>
                          <button class="btn btn-primary btn-sm" type="button" @click="savePeriodTodoEdits" :disabled="savingPeriodTodoEdits">
                            {{ savingPeriodTodoEdits ? 'Saving…' : 'Save' }}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div v-else>
            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Create recurring template</h3>
              <div v-if="todoTemplatesError" class="warn-box" style="margin-top: 8px;">{{ todoTemplatesError }}</div>
              <div class="field-row" style="grid-template-columns: 180px 1fr; margin-top: 10px;">
                <div class="field">
                  <label>Scope</label>
                  <select v-model="templateDraft.scope">
                    <option value="agency">Agency-wide</option>
                    <option value="provider">Per-provider</option>
                  </select>
                </div>
                <div v-if="templateDraft.scope === 'provider'" class="field">
                  <label>Provider</label>
                  <select v-model="templateDraft.targetUserId">
                    <option :value="null">Select provider…</option>
                    <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                  </select>
                </div>
              </div>
              <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
                <div class="field">
                  <label>Start at pay period</label>
                  <select v-model="templateDraft.startPayrollPeriodId">
                    <option :value="null">Start immediately</option>
                    <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                  </select>
                </div>
                <div class="field">
                  <label>Active</label>
                  <select v-model="templateDraft.isActive">
                    <option :value="true">Active</option>
                    <option :value="false">Inactive</option>
                  </select>
                </div>
              </div>
              <div class="field" style="margin-top: 10px;">
                <label>Title</label>
                <input v-model="templateDraft.title" type="text" placeholder="e.g., Confirm XYZ is correct" />
              </div>
              <div class="field" style="margin-top: 10px;">
                <label>Description (optional)</label>
                <textarea v-model="templateDraft.description" rows="3" placeholder="Optional details…" />
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-primary" type="button" @click="createTodoTemplate" :disabled="savingTodoTemplate || !String(templateDraft.title||'').trim()">
                  {{ savingTodoTemplate ? 'Saving…' : 'Create template' }}
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Templates</h3>
              <div v-if="todoTemplatesLoading" class="muted" style="margin-top: 8px;">Loading templates…</div>
              <div v-else-if="!(todoTemplates||[]).length" class="muted" style="margin-top: 8px;">No templates yet.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th style="width: 90px;">Active</th>
                      <th>Template</th>
                      <th style="width: 240px;">Starts</th>
                      <th style="width: 120px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in todoTemplates" :key="t.id">
                      <td>
                        <input
                          type="checkbox"
                          :checked="Number(t.is_active) === 1"
                          :disabled="deletingTodoTemplateId === t.id"
                          @change="toggleTodoTemplateActive(t, $event.target.checked)"
                        />
                      </td>
                      <td>
                        <div><strong>{{ t.title }}</strong></div>
                        <div class="muted" style="margin-top: 4px;">
                          <span v-if="String(t.scope||'agency')==='provider'">Provider: {{ nameForUserId(Number(t.target_user_id || 0)) }}</span>
                          <span v-else>Agency-wide</span>
                        </div>
                        <div v-if="t.description" class="muted" style="margin-top: 4px;">{{ t.description }}</div>
                      </td>
                      <td class="muted">
                        <span v-if="Number(t.start_payroll_period_id||0) > 0">From period #{{ t.start_payroll_period_id }}</span>
                        <span v-else>Immediately</span>
                      </td>
                      <td class="right">
                        <button class="btn btn-secondary btn-sm" type="button" @click="openEditTodoTemplate(t)" :disabled="deletingTodoTemplateId === t.id">
                          Edit
                        </button>
                        <button class="btn btn-danger btn-sm" type="button" :disabled="deletingTodoTemplateId === t.id" @click="deleteTodoTemplate(t)">
                          {{ deletingTodoTemplateId === t.id ? 'Deleting…' : 'Delete' }}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <div v-if="editTodoTemplateOpen" class="modal-backdrop" @click.self="closeEditTodoTemplate">
        <div class="modal" style="width: min(760px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Edit recurring To‑Do template</div>
              <div class="hint">Edits affect future pay periods. Existing period To‑Dos are unchanged.</div>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" @click="closeEditTodoTemplate">Close</button>
          </div>

          <div v-if="editTodoTemplateError" class="warn-box" style="margin-top: 10px;">{{ editTodoTemplateError }}</div>

          <div class="field-row" style="grid-template-columns: 180px 1fr; margin-top: 10px;">
            <div class="field">
              <label>Scope</label>
              <select v-model="editTodoTemplateDraft.scope">
                <option value="agency">Agency-wide</option>
                <option value="provider">Per-provider</option>
              </select>
            </div>
            <div v-if="editTodoTemplateDraft.scope === 'provider'" class="field">
              <label>Provider</label>
              <select v-model="editTodoTemplateDraft.targetUserId">
                <option :value="null">Select provider…</option>
                <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
              </select>
            </div>
          </div>

          <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Start at pay period</label>
              <select v-model="editTodoTemplateDraft.startPayrollPeriodId">
                <option :value="null">Start immediately</option>
                <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
              </select>
            </div>
            <div class="field">
              <label>Active</label>
              <select v-model="editTodoTemplateDraft.isActive">
                <option :value="true">Active</option>
                <option :value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div class="field" style="margin-top: 10px;">
            <label>Title</label>
            <input v-model="editTodoTemplateDraft.title" type="text" />
          </div>

          <div class="field" style="margin-top: 10px;">
            <label>Description (optional)</label>
            <textarea v-model="editTodoTemplateDraft.description" rows="3" />
          </div>

          <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
            <button class="btn btn-secondary" type="button" @click="closeEditTodoTemplate" :disabled="savingEditTodoTemplate">
              Cancel
            </button>
            <button class="btn btn-primary" type="button" @click="saveEditTodoTemplate" :disabled="savingEditTodoTemplate || !String(editTodoTemplateDraft.title||'').trim()">
              {{ savingEditTodoTemplate ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <div v-if="showPayrollWizardModal" class="modal-backdrop">
        <div class="modal" style="width: min(980px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Payroll Wizard</div>
              <div class="hint">Step-by-step guide. Save anytime; no click-out close.</div>
            </div>
            <div class="actions" style="margin: 0;">
              <button class="btn btn-secondary btn-sm" type="button" @click="wizardSaveAndExit" :disabled="wizardSaving">Save edits & exit</button>
              <button class="btn btn-danger btn-sm" type="button" @click="wizardDiscardAndExit" :disabled="wizardSaving" style="margin-left: 8px;">Don’t save & exit</button>
            </div>
          </div>

          <div v-if="wizardError" class="warn-box" style="margin-top: 10px;">{{ wizardError }}</div>
          <div v-if="wizardLoading" class="muted" style="margin-top: 10px;">Loading wizard…</div>
          <div v-else style="margin-top: 10px;">
            <div class="card">
              <div class="hint" style="font-weight: 700;">Step {{ wizardStepIdx + 1 }} of {{ wizardSteps.length }} — {{ wizardStep?.title }}</div>
              <div class="hint" style="margin-top: 6px;">You can use Back/Next; the wizard saves progress as you move.</div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Current step actions</h3>

              <div v-if="wizardStep?.key === 'select_period'" class="hint">
                <label>Current pay period</label>
                <select v-model="selectedPeriodId" class="wizard-period-select" :disabled="!agencyId || !(periodsForSelect || []).length" style="margin-top: 6px; min-width: 280px;">
                  <option :value="null" disabled>Select a pay period…</option>
                  <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                </select>
                <div class="hint" style="margin-top: 8px;">This period will be used for all following steps.</div>
              </div>

              <div v-else-if="wizardStep?.key === 'upload_prior_run1'" class="hint">
                <div>Upload the <strong>first</strong> billing report for the prior pay period. This will be imported so you can mark drafts as unpaid (draft audit) before comparing with Run 2.</div>
                <div class="field" style="margin-top: 10px;">
                  <label>Prior pay period</label>
                  <select v-model="wizardPriorPeriodId" :disabled="!agencyId || !(wizardPriorPeriodOptions || []).length" style="min-width: 260px;">
                    <option :value="null" disabled>Select prior period…</option>
                    <option v-for="p in wizardPriorPeriodOptions" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                  </select>
                </div>
                <div class="field" style="margin-top: 10px;">
                  <label>Run 1 file</label>
                  <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onWizardPriorRun1Pick" />
                </div>
                <div class="actions" style="margin-top: 10px;">
                  <button class="btn btn-primary" type="button" @click="wizardImportPriorRun1AndNext" :disabled="wizardPriorImportLoading || !wizardPriorRun1File || !wizardPriorPeriodId">
                    {{ wizardPriorImportLoading ? 'Importing…' : 'Import Run 1 & Next' }}
                  </button>
                  <button class="btn btn-secondary" type="button" @click="wizardNext">Skip</button>
                </div>
                <div v-if="wizardPriorImportResult" class="hint" style="color: var(--success); margin-top: 8px;">{{ wizardPriorImportResult }}</div>
                <div v-if="wizardPriorImportError" class="warn-box" style="margin-top: 10px;">{{ wizardPriorImportError }}</div>
              </div>

              <div v-else-if="wizardStep?.key === 'draft_audit_prior'" class="hint">
                <div>Mark drafts as <strong>unpaid</strong> for the prior period (Run 1). This tracks providers who are skirting the system. Required before comparing with Run 2.</div>
                <div class="field" style="margin-top: 10px;">
                  <label>Prior pay period</label>
                  <select v-model="wizardPriorPeriodId" :disabled="!agencyId || !(wizardPriorPeriodOptions || []).length" style="min-width: 260px;">
                    <option :value="null" disabled>Select prior period…</option>
                    <option v-for="p in wizardPriorPeriodOptions" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                  </select>
                </div>
                <div class="actions" style="margin-top: 10px;">
                  <button class="btn btn-primary" type="button" @click="wizardOpenPriorDraftAudit" :disabled="!wizardPriorPeriodId">
                    Open Draft Audit (Raw Import)
                  </button>
                  <button class="btn btn-secondary" type="button" @click="wizardCreatePriorBaselineRun" :disabled="wizardPriorBaselineLoading || !wizardPriorPeriodId">
                    {{ wizardPriorBaselineLoading ? 'Creating…' : 'Create baseline run (after draft audit)' }}
                  </button>
                  <button class="btn btn-secondary" type="button" @click="wizardNext">Skip</button>
                </div>
                <div class="hint muted" style="margin-top: 8px;">Open Draft Audit, mark drafts unpaid, then click Create baseline run. Then proceed to Batch catch-up.</div>
                <div v-if="wizardPriorBaselineResult" class="hint" style="color: var(--success); margin-top: 8px;">{{ wizardPriorBaselineResult }}</div>
                <div v-if="wizardPriorBaselineError" class="warn-box" style="margin-top: 10px;">{{ wizardPriorBaselineError }}</div>
              </div>

              <div v-else-if="wizardStep?.key === 'batch_catchup'" class="hint">
                <div v-if="wizardPriorPeriodId" class="hint" style="margin-bottom: 10px;">
                  <strong>Import + draft audit path:</strong> Prior period has Run 1 + draft audit. Upload Run 2 to compare.
                </div>
                <div class="hint muted" style="margin-bottom: 8px;">Or <strong>double-check with file compare:</strong> Upload 2 or 3 files (unchanged logic).</div>
                <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                  <div class="field">
                    <label>First run</label>
                    <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onBatchFilePick($event, 1)" />
                  </div>
                  <div class="field">
                    <label>Second run</label>
                    <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onBatchFilePick($event, 2)" />
                  </div>
                  <div class="field">
                    <label>Latest (optional)</label>
                    <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onBatchFilePick($event, 3)" />
                  </div>
                </div>
                <div class="field" style="margin-top: 10px;">
                  <label>Add late notes to</label>
                  <select v-model="batchCatchUpDestinationPeriodId" :disabled="!agencyId || !periodsForSelect.length" style="min-width: 260px;">
                    <option :value="null" disabled>Select pay period…</option>
                    <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                  </select>
                </div>
                <div v-if="wizardPriorPeriodId" class="card" style="margin-top: 10px; padding: 10px; background: #f0f8ff;">
                  <div class="hint" style="font-weight: 600;">Import + draft audit path</div>
                  <div class="field" style="margin-top: 8px;">
                    <label>Run 2 file</label>
                    <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onBatchFilePick($event, 2)" />
                  </div>
                  <button class="btn btn-primary" type="button" @click="wizardRunBatchCatchUpDbBaseline" :disabled="batchCatchUpLoading || !batchFiles[2] || !agencyId || !batchCatchUpDestinationPeriodId" style="margin-top: 8px;">
                    {{ batchCatchUpLoading ? 'Comparing…' : 'Upload Run 2 & compare' }}
                  </button>
                </div>
                <div class="actions" style="margin-top: 10px; justify-content: flex-start; flex-wrap: wrap; gap: 8px;">
                  <button class="btn btn-primary" type="button" @click="wizardRunBatchCatchUp" :disabled="batchCatchUpLoading || !batchFiles[1] || !batchFiles[2] || !agencyId">
                    {{ batchCatchUpLoading ? 'Comparing…' : (batchFiles[3] ? 'Upload 3 & compare (file)' : 'Upload 2 & compare (file)') }}
                  </button>
                  <button class="btn btn-secondary" type="button" @click="wizardNext">Skip</button>
                </div>
                <div v-if="batchCatchUpResult && !batchCatchUpResult.applied" style="margin-top: 10px;">
                  <div class="hint">Compare complete. Select rows, edit units if needed, then add.</div>
                  <div v-if="(batchCatchUpResult.carryoverApplied || []).length > 0" class="card" style="margin-top: 10px; padding: 12px;">
                    <strong>Late add + notes to be paid ({{ batchCatchUpSelectedCount }} of {{ batchCatchUpResult.carryoverRowsApplied }} selected)</strong>
                    <div class="actions" style="margin-top: 10px;">
                      <button class="btn btn-primary" type="button" @click="wizardApplyBatchCatchUpAndNext" :disabled="batchCatchUpApplying || !batchCatchUpDestinationPeriodId || batchCatchUpSelectedCount === 0 || isBatchCatchUpDestPosted">
                        {{ batchCatchUpApplying ? 'Adding…' : 'Add selected & Next' }}
                      </button>
                    </div>
                    <table class="table" style="margin-top: 8px; font-size: 0.9em;">
                      <thead>
                        <tr><th style="width: 36px;"></th><th>User</th><th>Service code</th><th>Client</th><th>DOS</th><th>Type</th><th class="right">Units</th></tr>
                      </thead>
                      <tbody>
                        <tr v-for="c in batchCatchUpFilteredRows" :key="`wz-${c.userId}-${c.serviceCode}`" :style="!batchCatchUpRowSelected(c) ? { opacity: 0.5 } : {}">
                          <td><input type="checkbox" :checked="batchCatchUpRowSelected(c)" @change="batchCatchUpToggleRow(c, $event.target.checked)" /></td>
                          <td>{{ c.providerName || getUserName(c.userId) }}</td>
                          <td>{{ c.serviceCode }}</td>
                          <td class="muted">{{ c.clientHint || '—' }}</td>
                          <td class="muted">{{ ymd(c.serviceDate) || '—' }}</td>
                          <td><span class="badge" :class="batchCatchUpTypeBadgeClass(c)">{{ batchCatchUpTypeLabel(c) }}</span></td>
                          <td class="right"><input type="number" :value="batchCatchUpRowUnits(c)" @input="batchCatchUpSetRowUnits(c, $event.target.value)" min="0" step="0.01" style="width: 80px; text-align: right;" /></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-if="batchCatchUpResult.superFlagCount > 0" class="warn-box" style="margin-top: 10px; padding: 10px; font-size: 0.9em;">
                    <strong>No note ({{ batchCatchUpResult.superFlagCount }}):</strong> Please address before continuing.
                  </div>
                  <div v-if="(batchCatchUpResult.h0031PendingCount || 0) + (batchCatchUpResult.h0032PendingCount || 0) + (batchCatchUpResult.h2014PendingCount || 0) + (batchCatchUpResult.h90853PendingCount || 0) + (batchCatchUpResult.h2032PendingCount || 0) > 0" class="warn-box" style="margin-top: 8px; padding: 10px; font-size: 0.9em;">
                    {{ batchCatchUpResult.h0031PendingCount || 0 }} H0031, {{ batchCatchUpResult.h0032PendingCount || 0 }} H0032, {{ batchCatchUpResult.h2014PendingCount || 0 }} H2014, {{ batchCatchUpResult.h90853PendingCount || 0 }} 90853, {{ batchCatchUpResult.h2032PendingCount || 0 }} H2032 rows need minutes updated (you’ll do that in later steps).
                  </div>
                </div>
                <div v-if="batchCatchUpResult?.applied" style="margin-top: 10px;">
                  <div class="actions" style="align-items: center; gap: 12px;">
                    <div class="hint" style="color: var(--success); margin: 0;">Added {{ batchCatchUpResult.carryoverRowsApplied }} rows to payroll staging{{ batchCatchUpDestPeriodLabel ? ` for ${batchCatchUpDestPeriodLabel}` : '' }}.</div>
                    <button class="btn btn-secondary btn-sm" type="button" @click="resetBatchCatchUp">Reset</button>
                    <button class="btn btn-primary" type="button" @click="wizardNext">Next</button>
                  </div>
                </div>
                <div v-if="batchCatchUpError" class="warn-box" style="margin-top: 10px;">{{ batchCatchUpError }}</div>
              </div>

              <div v-else-if="wizardStep?.key === 'upload_current'" class="hint">
                <div>Upload the billing report for the current pay period: <strong>{{ selectedPeriodForUi ? periodRangeLabel(selectedPeriodForUi) : '—' }}</strong></div>
                <div class="field" style="margin-top: 10px;">
                  <input
                    ref="wizardCurrentPeriodFileInput"
                    type="file"
                    accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    @change="onWizardCurrentPeriodFilePick"
                    style="max-width: 400px;"
                  />
                </div>
                <div class="actions" style="margin-top: 10px; justify-content: flex-start; flex-wrap: wrap; gap: 8px;">
                  <button class="btn btn-primary" type="button" @click="wizardImportCurrentPeriodAndNext" :disabled="wizardImportLoading || !wizardCurrentPeriodFile || !selectedPeriodId">
                    {{ wizardImportLoading ? 'Importing…' : 'Import and Next' }}
                  </button>
                  <button class="btn btn-secondary" type="button" @click="wizardNext" :disabled="wizardImportLoading">Skip (already imported)</button>
                </div>
                <div v-if="wizardCurrentPeriodFile" class="hint" style="margin-top: 8px;">Selected: <strong>{{ wizardCurrentPeriodFile.name }}</strong></div>
                <div v-if="wizardImportResult" class="hint" style="margin-top: 8px; color: var(--success);">{{ wizardImportResult }}</div>
                <div v-if="wizardImportError" class="warn-box" style="margin-top: 10px;">{{ wizardImportError }}</div>
              </div>

              <div v-else-if="wizardStep?.key === 'drafts'" class="hint">
                Edit draft-payable decisions in Raw Import (Draft Audit).
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('draft_audit')" :disabled="!selectedPeriodId">Open Raw Import (Draft Audit)</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'h0031'" class="hint">
                Process H0031 minutes + mark Done.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h0031')" :disabled="!selectedPeriodId">Open Raw Import (H0031)</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'h0032'" class="hint">
                Process H0032 minutes + mark Done.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h0032')" :disabled="!selectedPeriodId">Open Raw Import (H0032)</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'h2014'" class="hint">
                Process H2014 minutes + mark Done.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h2014')" :disabled="!selectedPeriodId">Open Raw Import (H2014)</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === '90853'" class="hint">
                Process 90853 (group therapy) minutes + mark Done.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_90853')" :disabled="!selectedPeriodId">Open Raw Import (90853)</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'h2032'" class="hint">
                Process H2032 minutes + mark Done.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h2032')" :disabled="!selectedPeriodId">Open Raw Import (H2032)</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'stage'" class="hint">
                <div>Review Payroll Stage: add submitted claims, manual pay lines, adjustments, and work through To‑Dos. This is the most important step before running payroll.</div>
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="showStageModal = true" :disabled="!selectedPeriodId">Open Payroll Stage</button>
                  <button class="btn btn-secondary" type="button" @click="openTodoModal" :disabled="!selectedPeriodId" style="margin-left: 8px;">Manage To‑Dos</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'run'" class="hint">
                Run payroll to compute totals (blocked if To‑Dos or submissions are pending).
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-primary" type="button" @click="runPayroll" :disabled="runningPayroll || isPeriodPosted || !selectedPeriodId">
                    {{ runningPayroll ? 'Running…' : 'Run Payroll' }}
                  </button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'preview'" class="hint">
                Preview provider view + post-time notifications.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="openPreviewPostModalV2" :disabled="!selectedPeriodId || !canSeeRunResults">Open Preview Post</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'post'" class="hint">
                Post payroll to make it visible to providers.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-primary" type="button" @click="postPayroll" :disabled="postingPayroll || isPeriodPosted || selectedPeriodStatus !== 'ran'">
                    {{ postingPayroll ? 'Posting…' : 'Post Payroll' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="actions" style="margin-top: 12px; justify-content: space-between;">
              <button class="btn btn-secondary" type="button" @click="wizardBack" :disabled="wizardStepIdx <= 0 || wizardSaving">Back</button>
              <button
                class="btn btn-primary"
                type="button"
                @click="wizardNext"
                :disabled="wizardStepIdx >= wizardSteps.length - 1 || wizardSaving || (wizardStep?.key === 'select_period' && !selectedPeriodId)"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </teleport>

    <!-- V2 modals: isolated from page state -->
    <teleport to="body">
      <div v-if="showRunModalV2" class="modal-backdrop" @click.self="confirmClose(() => { showRunModalV2 = false; })">
        <div class="modal modal-payroll-results">
          <div class="modal-header">
            <div>
              <div class="modal-title">Ran Payroll</div>
              <div class="hint">Read-only viewer (loads directly from the API).</div>
            </div>
            <div class="actions" style="margin: 0;">
              <button class="btn btn-secondary btn-sm" type="button" @click="refreshRunModalV2" :disabled="runModalV2Loading">
                {{ runModalV2Loading ? 'Loading…' : 'Refresh' }}
              </button>
              <button class="btn btn-secondary btn-sm" type="button" @click="confirmClose(() => { showRunModalV2 = false; })" style="margin-left: 8px;">Close</button>
            </div>
          </div>
          <div v-if="runModalV2Error" class="warn-box">{{ runModalV2Error }}</div>
          <div v-else-if="runModalV2Loading" class="muted">Loading…</div>
          <div v-else class="table-wrap">
            <div class="field-row" style="grid-template-columns: 1fr auto; gap: 10px; align-items: end; margin: 8px 0 10px 0;">
              <div class="field">
                <label>Search provider</label>
                <input v-model="runModalV2Search" type="text" placeholder="Type a name…" />
              </div>
              <div class="field">
                <label>Sort</label>
                <select v-model="runModalV2SortKey">
                  <option value="provider">Provider</option>
                  <option value="total_hours">Total Hours</option>
                  <option value="subtotal_amount">Subtotal</option>
                  <option value="adjustments_amount">Adjustments</option>
                  <option value="total_amount">Total</option>
                </select>
                <div class="hint" style="margin-top: 4px;">
                  <button class="btn btn-secondary btn-sm" type="button" @click="runModalV2SortDir = (runModalV2SortDir === 'asc' ? 'desc' : 'asc')">
                    {{ runModalV2SortDir === 'asc' ? 'Asc' : 'Desc' }}
                  </button>
                </div>
              </div>
            </div>

            <table class="table">
              <thead>
                <tr>
                  <th>
                    <button class="link-btn" type="button" @click="setRunModalV2Sort('provider')">
                      Provider <span class="muted" v-if="runModalV2SortIndicator('provider')">{{ runModalV2SortIndicator('provider') }}</span>
                    </button>
                  </th>
                  <th class="right">
                    <button class="link-btn right" type="button" @click="setRunModalV2Sort('total_hours')">
                      Total Hours <span class="muted" v-if="runModalV2SortIndicator('total_hours')">{{ runModalV2SortIndicator('total_hours') }}</span>
                    </button>
                  </th>
                  <th class="right">
                    <button class="link-btn right" type="button" @click="setRunModalV2Sort('subtotal_amount')">
                      Subtotal <span class="muted" v-if="runModalV2SortIndicator('subtotal_amount')">{{ runModalV2SortIndicator('subtotal_amount') }}</span>
                    </button>
                  </th>
                  <th class="right">
                    <button class="link-btn right" type="button" @click="setRunModalV2Sort('adjustments_amount')">
                      Adjustments <span class="muted" v-if="runModalV2SortIndicator('adjustments_amount')">{{ runModalV2SortIndicator('adjustments_amount') }}</span>
                    </button>
                  </th>
                  <th class="right">
                    <button class="link-btn right" type="button" @click="setRunModalV2Sort('total_amount')">
                      Total <span class="muted" v-if="runModalV2SortIndicator('total_amount')">{{ runModalV2SortIndicator('total_amount') }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in (runModalV2Rows || [])" :key="s.id || `${s.user_id}`">
                  <td>{{ s.last_name }}, {{ s.first_name }}</td>
                  <td class="right">{{ fmtNum(s.total_hours ?? 0) }}</td>
                  <td class="right">{{ fmtMoney(s.subtotal_amount ?? 0) }}</td>
                  <td class="right">{{ fmtMoney(s.adjustments_amount ?? 0) }}</td>
                  <td class="right"><strong>{{ fmtMoney(s.total_amount ?? 0) }}</strong></td>
                </tr>
                <tr v-if="!(runModalV2Rows || []).length">
                  <td colspan="5" class="muted">No results found.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <div v-if="showPreviewPostModalV2" class="modal-backdrop" @click.self="confirmClose(() => { showPreviewPostModalV2 = false; })">
        <div class="modal modal-payroll-results">
          <div class="modal-header">
            <div>
              <div class="modal-title">Preview Post</div>
              <div class="hint">Read-only provider view (loads directly from the API).</div>
            </div>
            <div class="actions" style="margin: 0;">
              <button class="btn btn-secondary btn-sm" type="button" @click="refreshPreviewPostModalV2" :disabled="previewPostV2Loading">
                {{ previewPostV2Loading ? 'Loading…' : 'Refresh' }}
              </button>
              <button class="btn btn-secondary btn-sm" type="button" @click="confirmClose(() => { showPreviewPostModalV2 = false; })" style="margin-left: 8px;">Close</button>
            </div>
          </div>

          <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 8px;">
            <div class="field">
              <label>Provider</label>
              <div class="row" style="gap: 8px; align-items: center;">
                <select v-model="previewPostV2UserId" :disabled="previewPostV2Loading" style="flex: 1 1 auto;">
                <option :value="null" disabled>Select a provider…</option>
                <option v-for="s in (previewPostV2ProviderOptions || [])" :key="s.user_id" :value="s.user_id">{{ s.last_name }}, {{ s.first_name }}</option>
                </select>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="previewPostV2PrevUser"
                  :disabled="previewPostV2Loading || !previewPostV2CanPrev"
                  title="Previous employee"
                >
                  Prev
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="previewPostV2NextUser"
                  :disabled="previewPostV2Loading || !previewPostV2CanNext"
                  title="Next employee"
                >
                  Next
                </button>
              </div>
            </div>
            <div class="field">
              <label>Pay period</label>
              <div class="hint">{{ periodRangeLabel(selectedPeriodForUi) }}</div>
            </div>
          </div>

          <div v-if="previewPostV2Error" class="warn-box" style="margin-top: 10px;">{{ previewPostV2Error }}</div>
          <div v-else-if="previewPostV2Loading" class="muted" style="margin-top: 10px;">Loading…</div>
          <div v-else class="card" style="margin-top: 12px;">
            <div v-if="!previewPostV2UserId" class="muted">Select a provider.</div>
            <div v-else-if="previewPostV2Summary">
              <div v-if="auditForPreviewProviderV2 && auditForPreviewProviderV2.flags?.length" class="warn-box" style="margin: 10px 0;">
                <div><strong>Audit flags (review recommended)</strong></div>
                <div v-for="(f, i) in auditForPreviewProviderV2.flags" :key="`v2-audit:${i}`" class="muted">{{ f }}</div>
              </div>

              <!-- These match provider-facing notices in My Payroll -->
              <div class="warn-box prior-notes-included" v-if="previewPostV2CarryoverNotes > 0" style="margin-bottom: 10px;">
                <div><strong>Prior notes included in this payroll:</strong> {{ fmtNum(previewPostV2CarryoverNotes) }} notes</div>
                <div class="muted">Reminder: complete prior-period notes by Sunday 11:59pm after the pay period ends to avoid compensation delays.</div>
              </div>

              <div
                class="warn-box"
                v-if="previewPostV2PriorStillUnpaid.totalUnits > 0"
                style="margin-bottom: 10px; border: 1px solid #ffb5b5; background: #ffecec;"
              >
                <div>
                  <strong>Still unpaid from the prior pay period (not paid this period):</strong>
                  {{ fmtNum(previewPostV2PriorStillUnpaid.totalUnits) }} units
                </div>
                <div class="muted" style="margin-top: 4px;" v-if="previewPostV2PriorStillUnpaid.periodStart">
                  {{ previewPostV2PriorStillUnpaid.periodStart }} → {{ previewPostV2PriorStillUnpaid.periodEnd }}
                </div>
                <div class="muted" style="margin-top: 6px;" v-if="(previewPostV2PriorStillUnpaid.lines || []).length">
                  <div><strong>Details:</strong></div>
                  <div v-for="(l, i) in (previewPostV2PriorStillUnpaid.lines || [])" :key="`v2-prior-unpaid:${l.serviceCode}:${i}`">
                    - {{ l.serviceCode }}: {{ fmtNum(l.unpaidUnits) }} units
                  </div>
                </div>
              </div>

              <div
                class="warn-box"
                v-if="previewPostV2UnpaidInPeriod.total > 0"
                style="margin-bottom: 10px; border: 1px solid #ffd8a8; background: #fff4e6;"
              >
                <div><strong>Unpaid notes in this pay period</strong></div>
                <div style="margin-top: 6px;">
                  <strong>No Note:</strong> {{ fmtNum(previewPostV2UnpaidInPeriod.noNote) }} notes
                  <span class="muted">•</span>
                  <strong>Draft:</strong> {{ fmtNum(previewPostV2UnpaidInPeriod.draft) }} notes
                </div>
                <div class="muted" style="margin-top: 6px;">
                  These notes were not paid this period. Complete outstanding notes to be included in a future payroll.
                </div>
              </div>

              <div class="row"><strong>Total Pay:</strong> {{ fmtMoney(previewPostV2Summary.total_amount ?? 0) }}</div>
              <div class="row"><strong>Total Credits/Hours:</strong> {{ fmtNum(previewPostV2Summary.total_hours ?? 0) }}</div>
              <div class="row"><strong>Tier Credits (Final):</strong> {{ fmtNum(previewPostV2Summary.tier_credits_final ?? previewPostV2Summary.tier_credits_current ?? 0) }}</div>

              <div class="card" style="margin-top: 10px;" v-if="previewPostV2Summary.breakdown && previewPostV2Summary.breakdown.__tier">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Benefit Tier</h3>
                <div class="row"><strong>{{ previewPostV2Summary.breakdown.__tier.label }}</strong></div>
                <div class="row"><strong>Status:</strong> {{ previewPostV2Summary.breakdown.__tier.status }}</div>
              </div>

              <div class="card" style="margin-top: 10px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Direct / Indirect Totals</h3>
                <div class="row">
                  <strong>Direct:</strong>
                  {{ fmtNum(previewPostV2Summary.direct_hours ?? 0) }} hrs •
                  {{ fmtMoney(payTotalsFromBreakdown(previewPostV2Summary.breakdown).directAmount ?? 0) }}
                </div>
                <div class="row">
                  <strong>Indirect:</strong>
                  {{ fmtNum(previewPostV2Summary.indirect_hours ?? 0) }} hrs •
                  {{ fmtMoney(payTotalsFromBreakdown(previewPostV2Summary.breakdown).indirectAmount ?? 0) }}
                </div>
                <div v-if="(previewPostV2IndirectBreakdown || []).length" class="muted" style="margin-top: 8px; padding-left: 12px; border-left: 2px solid var(--border);">
                  <div style="margin-bottom: 4px;"><strong>Indirect breakdown:</strong></div>
                  <div v-for="l in previewPostV2IndirectBreakdown" :key="`v2-indirect:${l.code}`" class="row" style="margin: 4px 0;">
                    {{ l.code }}: {{ fmtNum(l.hours ?? 0) }} hrs • {{ fmtMoney(l.amount ?? 0) }}{{ isSupervisionCode(l.code) && (l.amount ?? 0) < 0.01 ? ' (benefit, no pay)' : '' }}
                  </div>
                </div>
              </div>

              <h3 class="card-title" style="margin-top: 12px;">Service Codes</h3>
              <div class="muted" v-if="!previewPostV2Summary.breakdown || !Object.keys(previewPostV2Summary.breakdown).length">No breakdown available.</div>
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
                <div
                  v-for="l in (previewPostV2ServiceLines || []).filter(Boolean)"
                  :key="`v2-line:${l?.code || '—'}`"
                  class="code-row"
                  :style="
                    (String(l?.code || '').includes('(Old Note)') || String(l?.code || '').includes('(Late Addition)') || String(l?.code || '').includes('(Code Changed)'))
                      ? { background: '#fffbe6', borderLeft: '3px solid #f0b429', paddingLeft: '9px' }
                      : (Number(l?.noNoteUnits ?? 0) > 0)
                        ? { background: '#fff0f0', borderLeft: '3px solid #e53e3e', paddingLeft: '9px' }
                        : {}
                  "
                >
                  <div class="code">{{ l?.code || '—' }}</div>
                  <div class="right muted">{{ fmtNum(l?.noNoteUnits ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l?.draftUnits ?? 0) }}</div>
                  <div class="right">{{ fmtNum(l?.finalizedUnits ?? l?.units ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l?.hours ?? 0) }}</div>
                  <div class="right muted">{{ fmtBreakdownRate(l) }}</div>
                  <div class="right">{{ fmtMoney(l?.amount ?? 0) }}</div>
                </div>
              </div>

              <div class="card" style="margin-top: 10px;" v-if="previewPostV2Summary.breakdown && previewPostV2Summary.breakdown.__adjustments">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Additional Pay / Overrides</h3>
                <div class="muted" v-if="!(previewPostV2Summary.breakdown.__adjustments.lines || []).length">
                  No adjustments.
                </div>
                <div v-else>
                  <div v-for="(l, i) in (previewPostV2Summary.breakdown.__adjustments.lines || [])" :key="`v2-adj:${l.type}:${i}`" class="row" style="margin-top: 6px;">
                    <div>
                      <strong>{{ l.label }}</strong>
                      <span class="muted" v-if="l.taxable === false"> (non-taxable)</span>
                      <span class="muted" v-else> (taxable)</span>
                      <span class="muted" v-if="l.meta && (l.meta.hours || l.meta.rate)"> • {{ fmtNum(l.meta.hours ?? 0) }} hrs @ {{ fmtMoney(l.meta.rate ?? 0) }}</span>
                      <details v-if="l.meta && Array.isArray(l.meta.details) && l.meta.details.length" style="margin-top: 6px;">
                        <summary class="muted" style="cursor: pointer;">View details</summary>
                        <div class="muted" style="margin-top: 6px;">
                          <div v-for="(d, j) in l.meta.details" :key="`adj-detail:${i}:${j}`">{{ d.label }}: {{ d.value }}</div>
                        </div>
                      </details>
                    </div>
                    <div class="right">{{ fmtMoney(l.amount ?? 0) }}</div>
                  </div>
                </div>
              </div>

              <div class="card" style="margin-top: 10px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Notifications (sent on Post)</h3>
                <div class="muted" v-if="!(previewPostV2Notifications || []).length">No post-time notifications for this provider.</div>
                <div v-else>
                  <div v-for="(n, idx) in (previewPostV2Notifications || [])" :key="`v2-n:${idx}`" class="row" style="margin-top: 6px;">
                    <div><strong>{{ n.title || n.type }}</strong></div>
                    <div class="muted">{{ n.message }}</div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="muted">No run results found for this provider.</div>
          </div>
        </div>
      </div>
    </teleport>

    <div ref="processChangesCard" class="card pr-process-card" v-if="agencyId">
      <div class="pr-process-head">
        <div>
          <h2 class="card-title" style="margin-bottom: 4px;">Process Changes</h2>
          <div class="hint">
            Catch late notes by comparing prior pay period reports. Differences are added into the <strong>present</strong> pay period.
          </div>
        </div>
        <button class="btn btn-secondary" type="button" @click="openManageImportsModal" :disabled="!agencyId">
          View & Manage Imports
        </button>
      </div>

      <div class="pr-process-steps">
        <div class="pr-process-step">
          <div class="pr-process-step-num">1</div>
          <div class="pr-process-step-body">
            <div class="pr-process-step-title">Select Prior Period</div>
            <div class="field" style="margin-top: 8px;">
              <label>Prior period (runs in DB)</label>
              <select v-model="batchCatchUpPriorPeriodId" :disabled="!agencyId || !(processPriorPeriodOptions || []).length">
                <option :value="null">None (use file compare)</option>
                <option v-for="p in processPriorPeriodOptions" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
              </select>
              <div class="hint muted" style="font-size: 0.85em; margin-top: 4px;">If prior has import + draft audit, select it and upload only Run 2.</div>
            </div>
          </div>
        </div>

        <div class="pr-process-step">
          <div class="pr-process-step-num">2</div>
          <div class="pr-process-step-body">
            <div class="pr-process-step-title">Upload Reports</div>
            <div class="hint muted" style="margin-top: 4px;">Import + draft audit path, or file compare (2 or 3 files).</div>
            <div class="pr-upload-slots" :key="`batch-files-${batchCatchUpResetKey}`">
              <div class="field">
                <label>First Run Report</label>
                <div class="pr-file-row">
                  <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onBatchFilePick($event, 1)" :disabled="batchCatchUpRun1Disabled" :title="batchCatchUpRun1Disabled ? 'Run 1 already in DB for this period' : ''" :key="`file1-${batchCatchUpResetKey}`" />
                  <button v-if="batchFiles[1] && !batchCatchUpRun1Disabled" type="button" class="btn btn-secondary btn-sm" @click="clearBatchFileSlot(1)">Replace</button>
                </div>
                <div v-if="batchCatchUpPriorPeriodId && (batchCatchUpPriorPeriodImports || [])[0]" class="hint" style="margin-top: 4px;">
                  <button type="button" class="btn btn-secondary btn-sm" @click="openRawModalForPeriodAndImport(batchCatchUpPriorPeriodId, (batchCatchUpPriorPeriodImports || [])[0].id)">View import</button>
                </div>
              </div>
              <div class="field">
                <label>Second Run Report</label>
                <div class="pr-file-row">
                  <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onBatchFilePick($event, 2)" :disabled="batchCatchUpRun2Disabled" :title="batchCatchUpRun2Disabled ? 'Run 2 already in DB for this period' : ''" :key="`file2-${batchCatchUpResetKey}`" />
                  <button v-if="batchFiles[2] && !batchCatchUpRun2Disabled" type="button" class="btn btn-secondary btn-sm" @click="clearBatchFileSlot(2)">Replace</button>
                </div>
                <div v-if="batchCatchUpPriorPeriodId && (batchCatchUpPriorPeriodImports || [])[1]" class="hint" style="margin-top: 4px;">
                  <button type="button" class="btn btn-secondary btn-sm" @click="openRawModalForPeriodAndImport(batchCatchUpPriorPeriodId, (batchCatchUpPriorPeriodImports || [])[1].id)">View import</button>
                </div>
                <div v-else-if="batchCatchUpPriorPeriodId && (batchCatchUpPriorPeriodImports || []).length >= 1 && batchFiles[2]" class="hint" style="margin-top: 4px;">
                  <button type="button" class="btn btn-secondary btn-sm" @click="uploadRun2Only" :disabled="batchCatchUpLoading">
                    {{ batchCatchUpLoading ? 'Uploading…' : 'Upload Run 2 only' }}
                  </button>
                  <span class="muted" style="font-size: 0.85em;"> Save to DB so it persists.</span>
                </div>
              </div>
              <div class="field">
                <label>Latest (optional)</label>
                <div class="pr-file-row">
                  <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onBatchFilePick($event, 3)" :disabled="batchCatchUpRun3Disabled" :title="batchCatchUpRun3Disabled ? 'Run 3 already in DB for this period' : ''" :key="`file3-${batchCatchUpResetKey}`" />
                  <button v-if="batchFiles[3] && !batchCatchUpRun3Disabled" type="button" class="btn btn-secondary btn-sm" @click="clearBatchFileSlot(3)">Replace</button>
                </div>
                <div class="hint muted" style="font-size: 0.85em;">Leave empty for 2-run: Run 1 vs Run 2 only.</div>
                <div v-if="batchCatchUpPriorPeriodId && (batchCatchUpPriorPeriodImports || [])[2]" class="hint" style="margin-top: 4px;">
                  <button type="button" class="btn btn-secondary btn-sm" @click="openRawModalForPeriodAndImport(batchCatchUpPriorPeriodId, (batchCatchUpPriorPeriodImports || [])[2].id)">View import</button>
                </div>
                <div v-else-if="batchCatchUpPriorPeriodId && (batchCatchUpPriorPeriodImports || []).length >= 2 && batchFiles[3]" class="hint" style="margin-top: 4px;">
                  <button type="button" class="btn btn-secondary btn-sm" @click="uploadRun3Only" :disabled="batchCatchUpLoading">
                    {{ batchCatchUpLoading ? 'Uploading…' : 'Upload Run 3 only' }}
                  </button>
                  <span class="muted" style="font-size: 0.85em;"> Save to DB so it persists after refresh.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="pr-process-step">
          <div class="pr-process-step-num">3</div>
          <div class="pr-process-step-body">
            <div class="pr-process-step-title">Compare & Add Differences</div>
            <div class="field" style="margin-top: 8px;">
              <label>Add late notes to (destination period)</label>
              <select v-model="batchCatchUpDestinationPeriodId" :disabled="!agencyId || !periodsForSelect.length">
                <option :value="null" disabled>Select pay period…</option>
                <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
              </select>
              <div class="hint muted" style="margin-top: 4px;">Differences will be added to the selected destination period.</div>
            </div>
            <div class="pr-compare-actions">
              <button v-if="batchCatchUpPriorPeriodId" class="btn btn-primary" @click="runBatchCatchUpDbBaseline" :disabled="batchCatchUpLoading || !batchCatchUpDbBaselineFileReady || !agencyId">
                {{ batchCatchUpLoading ? 'Comparing…' : batchCatchUpDbBaselineButtonLabel }}
              </button>
              <button class="btn btn-primary pr-compare-btn" @click="runBatchCatchUp" :disabled="batchCatchUpLoading || !batchFiles[1] || !batchFiles[2] || !agencyId">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: -2px;"><path d="M12 3v18M3 12h18"/><path d="M5 8h4M15 16h4M8 5v4M16 15v4"/></svg>
                {{ batchCatchUpLoading ? 'Comparing…' : (batchFiles[3] ? 'Upload & Compare' : 'Upload & Compare') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="pr-process-results" v-if="batchCatchUpResult || batchCatchUpError || isBatchCatchUpDestPosted">
        <div v-if="batchCatchUpResult" ref="batchCatchUpResultsRef" style="margin-top: 10px;">
          <div v-if="batchCatchUpResult.applied" class="actions" style="align-items: center; gap: 12px;">
            <div class="hint" style="color: var(--success); margin: 0;">Added {{ batchCatchUpResult.carryoverRowsApplied }} rows to payroll staging{{ batchCatchUpDestPeriodLabel ? ` for ${batchCatchUpDestPeriodLabel}` : '' }}. Select the period above to review.</div>
            <button class="btn btn-secondary btn-sm" @click="resetBatchCatchUp">Reset</button>
          </div>
          <div class="hint" v-else>
            Compare complete. Review what would be added below, then click <strong>Add to current period</strong> when ready.
          </div>
          <div
            v-if="batchCatchUpResult.twoRunMode && !batchCatchUpResult.applied && ((batchCatchUpResult.carryoverApplied || []).length > 0 || (batchCatchUpResult.superFlag || []).length > 0)"
            class="actions"
            style="margin-top: 10px;"
          >
            <button
              v-if="(batchCatchUpResult.carryoverApplied || []).length > 0 && (batchCatchUpResult.superFlag || []).length > 0"
              class="btn btn-primary"
              @click="applyBatchCatchUpAllToPeriod"
              :disabled="batchCatchUpApplying || !batchCatchUpDestinationPeriodId || isBatchCatchUpDestPosted"
            >
              {{ batchCatchUpApplying ? 'Adding…' : 'Add all (late add + notes to be paid + no note) to current period' }}
            </button>
          </div>

          <!-- ── Section 1: Late Add & Notes to be Paid ── -->
          <div v-if="batchCatchUpResult.twoRunMode && (batchCatchUpResult.carryoverApplied || []).length > 0" class="card" style="margin-top: 16px; padding: 16px; border-left: 4px solid var(--pr-forest, #1E3A34);">
            <div style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
              <h3 class="card-title" style="margin: 0; font-size: 1.05em;">
                Section 1 — Late Add &amp; Notes to be Paid
                <span class="muted" style="font-weight: 400; font-size: 0.88em; margin-left: 8px;">{{ batchCatchUpSelectedCount }} of {{ batchCatchUpResult.carryoverRowsApplied }} rows selected</span>
              </h3>
            </div>
            <div class="hint muted" style="margin-bottom: 10px;">{{ batchCatchUpResult.twoRunMode ? 'Late add: new in Run 2. Notes to be paid: no note or draft unpaid in Run 1 → finalized or draft in Run 2.' : 'Late add: new in Run 3. Notes to be paid: no note or draft unpaid in Run 2 → finalized or draft in Run 3.' }} Check rows, edit units if needed, then click Add.</div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
              <input
                v-model="batchCatchUpSearch"
                type="text"
                placeholder="Search provider, code, client, date…"
                class="input"
                style="max-width: 300px;"
              />
              <button
                v-if="!batchCatchUpResult.applied && (batchCatchUpResult.rowsForApply || []).length > 0"
                class="btn btn-primary"
                @click="applyBatchCatchUpToPeriod"
                :disabled="batchCatchUpApplying || !batchCatchUpDestinationPeriodId || batchCatchUpSelectedCount === 0 || isBatchCatchUpDestPosted"
              >
                {{ batchCatchUpApplying ? 'Adding…' : 'Add selected to current period' }}
              </button>
            </div>
            <table class="table" style="font-size: 0.9em;">
              <thead>
                <tr>
                  <th style="width: 36px;"></th>
                  <th class="th-sortable" @click="batchCatchUpSortBy('providerName')">Provider{{ batchCatchUpSortIndicator('providerName') }}</th>
                  <th class="th-sortable" @click="batchCatchUpSortBy('serviceCode')">Service Code{{ batchCatchUpSortIndicator('serviceCode') }}</th>
                  <th class="th-sortable" @click="batchCatchUpSortBy('clientHint')">Client{{ batchCatchUpSortIndicator('clientHint') }}</th>
                  <th class="th-sortable" @click="batchCatchUpSortBy('serviceDate')">DOS{{ batchCatchUpSortIndicator('serviceDate') }}</th>
                  <th class="th-sortable" @click="batchCatchUpSortBy('carryoverType')">Type{{ batchCatchUpSortIndicator('carryoverType') }}</th>
                  <th class="right">Units</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in batchCatchUpFilteredRows" :key="`${c.userId}-${c.serviceCode}`" :style="!batchCatchUpRowSelected(c) ? { opacity: 0.5 } : {}">
                  <td>
                    <input type="checkbox" :checked="batchCatchUpRowSelected(c)" @change="batchCatchUpToggleRow(c, $event.target.checked)" />
                  </td>
                  <td>{{ c.providerName || getUserName(c.userId) }}</td>
                  <td>{{ c.serviceCode }}</td>
                  <td class="muted">{{ c.clientHint || '—' }}</td>
                  <td class="muted">{{ ymd(c.serviceDate) || '—' }}</td>
                  <td><span class="badge" :class="batchCatchUpTypeBadgeClass(c)">{{ batchCatchUpTypeLabel(c) }}</span></td>
                  <td class="right">
                    <input type="number" :value="batchCatchUpRowUnits(c)" @input="batchCatchUpSetRowUnits(c, $event.target.value)" min="0" step="0.01" style="width: 80px; text-align: right;" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- ── Section 2: Persistent No-Notes ── -->
          <div v-if="batchCatchUpResult.superFlagCount > 0" class="card" style="margin-top: 16px; padding: 16px; border-left: 4px solid #e53e3e;">
            <div style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
              <h3 class="card-title" style="margin: 0; font-size: 1.05em; color: #c53030;">
                Section 2 — Persistent No-Notes
                <span class="muted" style="font-weight: 400; font-size: 0.88em; margin-left: 8px; color: var(--text-secondary);">{{ batchCatchUpResult.superFlagCount }} rows</span>
              </h3>
            </div>
            <div class="hint muted" style="margin-bottom: 10px;">{{ batchCatchUpResult.twoRunMode ? 'No note in Run 1, still no note in Run 2.' : 'No note in Run 2, still no note in Run 3.' }} Add these to the current period so providers know what they're missing.</div>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
              <input
                v-model="superFlagSearch"
                type="text"
                placeholder="Search provider, code…"
                class="input"
                style="max-width: 300px;"
              />
              <button
                class="btn btn-primary"
                @click="applyStillNoNoteToPeriod"
                :disabled="batchCatchUpApplying || !batchCatchUpDestinationPeriodId || isBatchCatchUpDestPosted"
              >
                {{ batchCatchUpApplying ? 'Adding…' : 'Add no-note to current period' }}
              </button>
            </div>
            <table class="table" style="font-size: 0.9em;">
              <thead>
                <tr>
                  <th class="th-sortable" @click="superFlagSortBy('providerName')">Provider{{ superFlagSortIndicator('providerName') }}</th>
                  <th class="th-sortable" @click="superFlagSortBy('serviceCode')">Service Code{{ superFlagSortIndicator('serviceCode') }}</th>
                  <th class="th-sortable right" @click="superFlagSortBy('run2')">{{ batchCatchUpResult.twoRunMode ? 'Run 1 No Note' : 'Run 2 No Note' }}{{ superFlagSortIndicator('run2') }}</th>
                  <th class="th-sortable right" @click="superFlagSortBy('run3')">{{ batchCatchUpResult.twoRunMode ? 'Run 2 No Note' : 'Run 3 No Note' }}{{ superFlagSortIndicator('run3') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in superFlagFilteredRows" :key="`${f.userId}-${f.serviceCode}`">
                  <td>{{ f.providerName || getUserName(f.userId) }}</td>
                  <td>{{ f.serviceCode }}</td>
                  <td class="right">{{ fmtNum(f.run2NoNoteUnits ?? f.run2UnpaidUnits) }}</td>
                  <td class="right">{{ fmtNum(f.run3NoNoteUnits ?? f.run3UnpaidUnits) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- ── H-code minutes warning ── -->
          <div
            v-if="(batchCatchUpResult.h0031PendingCount || 0) + (batchCatchUpResult.h0032PendingCount || 0) + (batchCatchUpResult.h2014PendingCount || 0) + (batchCatchUpResult.h90853PendingCount || 0) + (batchCatchUpResult.h2032PendingCount || 0) > 0"
            class="warn-box"
            style="margin-top: 10px; padding: 12px;"
          >
            <strong>H0031/H0032/H2014 minutes:</strong>
            {{ batchCatchUpResult.h0031PendingCount || 0 }} H0031, {{ batchCatchUpResult.h0032PendingCount || 0 }} H0032, {{ batchCatchUpResult.h2014PendingCount || 0 }} H2014, {{ batchCatchUpResult.h90853PendingCount || 0 }} 90853, {{ batchCatchUpResult.h2032PendingCount || 0 }} H2032 rows need minutes updated.
            Open <strong>Raw Import</strong> → <strong>Process H0031</strong> / <strong>Process H0032</strong> / <strong>Process H2014</strong> / <strong>Process 90853</strong> / <strong>Process H2032</strong> to edit. Unpaid rows are highlighted in amber.
          </div>
        </div>
        <div v-if="isBatchCatchUpDestPosted" class="warn-box" style="margin-top: 10px;">
          The selected destination period is posted/finalized. Choose a different pay period above for late notes.
        </div>
        <div v-else-if="batchCatchUpError" class="warn-box" style="margin-top: 10px;">{{ batchCatchUpError }}</div>
      </div>

      <details class="pr-process-advanced" style="margin-top: 16px;">
        <summary class="hint" style="cursor: pointer; font-weight: 600;">Advanced: single-file prior period compare</summary>
        <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr 1fr;">
          <div class="field">
            <label>Present pay period (destination)</label>
            <div class="hint">
              Late notes will be added to:
              <strong>{{ selectedPeriodForUi ? periodRangeLabel(selectedPeriodForUi) : '—' }}</strong>
            </div>
            <div class="hint muted">If the period in your files is already posted, select the next pay period above so late notes are added there.</div>
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
                {{ processingChanges ? 'Detecting...' : 'Detect prior period (choose)' }}
              </button>
              <button class="btn btn-primary" @click="processRunAndCompare" :disabled="processingChanges || !processSourcePeriodId || !selectedPeriodId">
                {{ processingChanges ? 'Working...' : 'Run & compare (then → now)' }}
              </button>
            </div>
            <div class="hint" v-if="processSourcePeriodLabel">
              Prior period detected: {{ processSourcePeriodLabel }}
            </div>
            <div class="hint" v-if="selectedPeriodForUi">
              Will add differences into: {{ periodRangeLabel(selectedPeriodForUi) }}
            </div>
            <div class="warn-box" v-if="processError">{{ processError }}</div>
          </div>
        </div>
      </details>

      <!-- Manage Imports modal -->
      <div v-if="showManageImportsModal" class="modal-backdrop" @click.self="confirmClose(() => { showManageImportsModal = false; })">
        <div class="modal" style="width: min(700px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">View & Manage Imports</div>
              <div class="hint">View imports in order, delete wrong ones, or open Raw Import. <strong>To make Run 2 become Run 1:</strong> delete Run 1 — the remaining imports are renumbered automatically (no re-upload needed).</div>
            </div>
            <button class="btn btn-secondary btn-sm" @click="confirmClose(() => { showManageImportsModal = false; })">Close</button>
          </div>
          <div class="field" style="margin-top: 10px;">
            <label>Pay period</label>
            <select v-model="manageImportsPeriodId" @change="loadManageImportsList" style="min-width: 280px;">
              <option :value="null" disabled>Select a pay period…</option>
              <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
            </select>
          </div>
          <div v-if="manageImportsError" class="warn-box" style="margin-top: 10px;">{{ manageImportsError }}</div>
          <div v-if="manageImportsPeriodIsPosted && manageImportsList.length" class="warn-box" style="margin-top: 10px;">
            Imports that were used in the payroll run cannot be deleted when the period is posted. Imports added after posting (e.g. Run 2) can be deleted.
            <span v-if="manageImportsCanForceDeleteEmptyRun1" style="margin-left: 8px;">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                @click="forceDeleteEmptyRun1"
                :disabled="manageImportsDeleting !== null"
                style="margin-left: 8px;"
              >
                {{ manageImportsDeleting ? 'Deleting…' : 'Force delete empty Run 1 (Run 2 → Run 1)' }}
              </button>
            </span>
          </div>
          <div v-if="manageImportsList.length" class="table-wrap" style="margin-top: 12px;">
            <table class="table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Date</th>
                  <th>Filename</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="imp in manageImportsList" :key="imp.id">
                  <td><strong>Run {{ imp.slot_number || imp.import_sequence }}</strong></td>
                  <td class="muted">{{ String(imp.created_at || '').slice(0, 19) }}</td>
                  <td>{{ imp.original_filename || '—' }}</td>
                  <td>
                    <button type="button" class="btn btn-secondary btn-sm" @click="openRawModalForPeriodAndImport(manageImportsPeriodId, imp.id); showManageImportsModal = false">View</button>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      @click="triggerReplaceImport(imp)"
                      :disabled="manageImportsReplacing === imp.id"
                      title="Replace this run with a new file (keeps Run 1/2/3 slot)"
                      style="margin-left: 6px;"
                    >
                      {{ manageImportsReplacing === imp.id ? 'Replacing…' : 'Replace' }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-danger btn-sm"
                      @click="deleteManageImport(imp)"
                      :disabled="manageImportsDeleting === imp.id"
                      :title="(imp.slot_number || imp.import_sequence) === 1 ? 'Delete Run 1 — Run 2 will become the new Run 1' : 'Delete this import'"
                      style="margin-left: 6px;"
                    >
                      {{ manageImportsDeleting === imp.id ? 'Deleting…' : ((imp.slot_number || imp.import_sequence) === 1 && manageImportsList.length > 1 ? 'Delete Run 1 (Run 2 → Run 1)' : 'Delete') }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else-if="manageImportsPeriodId && !manageImportsLoading" class="hint muted" style="margin-top: 12px;">No imports for this period.</div>
          <div v-else-if="manageImportsLoading" class="hint" style="margin-top: 12px;">Loading…</div>
          <input
            ref="manageImportsReplaceInput"
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            style="display: none;"
            @change="onReplaceImportFilePick"
          />
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
              </select>
            </div>
            <div class="field" v-if="processChoiceMode === 'existing'">
              <label>Existing prior pay period</label>
              <select v-model="processExistingPeriodId">
                <option :value="null" disabled>Select a pay period…</option>
                <option v-for="p in processPriorPeriodOptions" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
              </select>
            </div>
            <div class="field" v-else-if="processChoiceMode === 'detected'">
              <label>Detected prior period</label>
              <div class="hint">
                {{ processDetectResult?.detected?.periodStart }} → {{ processDetectResult?.detected?.periodEnd }}
                <span v-if="processExistingPeriodId" class="muted"> • matched existing period #{{ processExistingPeriodId }}</span>
                <span v-else class="muted"> • no matching period found — choose an existing prior period</span>
              </div>
            </div>
          </div>

          <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
            <button class="btn btn-primary" @click="confirmProcessImport" :disabled="processingChanges || !processImportFile || !agencyId">
              {{ processingChanges ? 'Working...' : 'Confirm & run compare' }}
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- Process Changes Aggregate (scoped to current agency) -->
    <div class="card" v-if="(processChangesAggregateForAgency || []).length" style="margin-bottom: 12px;">
      <div class="actions" style="justify-content: space-between; cursor: pointer;" @click="processChangesAggregateCollapsed = !processChangesAggregateCollapsed">
        <div>
          <h2 class="card-title" style="margin-bottom: 4px;">
            Process Changes Aggregate
            <span class="muted" style="font-size: 0.9em; font-weight: normal;">({{ processChangesAggregateCollapsed ? 'click to expand' : 'click to collapse' }})</span>
          </h2>
          <div class="hint">
            Tracks carryover you’ve applied for this agency.
          </div>
        </div>
        <div class="actions" style="margin: 0;" @click.stop>
          <button class="btn btn-secondary" type="button" @click="clearProcessChangesAggregate">
            Clear
          </button>
        </div>
      </div>

      <div v-show="!processChangesAggregateCollapsed" class="field-row" style="grid-template-columns: repeat(4, 1fr); margin-top: 10px;">
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Agencies</div>
          <div style="font-size: 18px;"><strong>{{ processChangesAggregateTotals.agencyCount }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Total units applied</div>
          <div style="font-size: 18px;"><strong>{{ fmtNum(processChangesAggregateTotals.unitsAppliedTotal) }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Notes (rows) applied</div>
          <div style="font-size: 18px;"><strong>{{ fmtNum(processChangesAggregateTotals.notesAppliedTotal) }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Rows inserted</div>
          <div style="font-size: 18px;"><strong>{{ fmtNum(processChangesAggregateTotals.rowsInsertedTotal) }}</strong></div>
        </div>
      </div>

      <div v-show="!processChangesAggregateCollapsed" class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Agency</th>
              <th>Prior period</th>
              <th>Destination period</th>
              <th class="right">Units applied</th>
              <th class="right">Rows inserted</th>
              <th>Applied</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in (processChangesAggregateForAgency || [])" :key="r.key">
              <td><strong>{{ r.agencyName || `Agency #${r.agencyId}` }}</strong></td>
              <td>{{ r.priorPeriodLabel || (r.priorPeriodId ? `Period #${r.priorPeriodId}` : '—') }}</td>
              <td>{{ r.destinationPeriodLabel || (r.destinationPeriodId ? `Period #${r.destinationPeriodId}` : '—') }}</td>
              <td class="right"><strong>{{ fmtNum(r.unitsApplied || 0) }}</strong></td>
              <td class="right">{{ fmtNum(r.rowsInserted || 0) }}</td>
              <td class="muted">{{ String(r.appliedAt || '').slice(0, 19) || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card pr-run-card" v-if="agencyId">
      <div class="pr-run-head">
        <div>
          <h2 class="card-title" style="margin-bottom: 4px;">Current Payroll Run</h2>
          <div class="hint">
            Import the current billing report, stage edits, run payroll, and post payroll. Providers will see posted payroll and any “prior notes included”.
          </div>
          <div v-if="selectedPeriodForUi" class="pr-run-period-chip">
            <span class="pr-active-period-kicker" style="opacity: 1; color: var(--pr-forest);">Pay period</span>
            <strong>{{ periodRangeLabel(selectedPeriodForUi) }}</strong>
            <span class="pr-status-pill" :class="`pr-status-${dashboardStatusKey || 'draft'}`">{{ dashboardStatusLabel }}</span>
          </div>
        </div>
      </div>

      <div class="pr-stepper" aria-label="Payroll run progress">
        <div class="pr-step" :class="{ done: payrollRunStepIndex > 0, active: payrollRunStepIndex === 0 }">
          <div class="pr-step-icon">
            <svg v-if="payrollRunStepIndex > 0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span v-else>1</span>
          </div>
          <div class="pr-step-text">
            <div class="pr-step-title">Import Report</div>
            <div class="pr-step-sub">Upload billing CSV</div>
          </div>
        </div>
        <div class="pr-step-line" :class="{ done: payrollRunStepIndex > 0 }"></div>
        <div class="pr-step" :class="{ done: payrollRunStepIndex > 1, active: payrollRunStepIndex === 1 }">
          <div class="pr-step-icon">
            <svg v-if="payrollRunStepIndex > 1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span v-else>2</span>
          </div>
          <div class="pr-step-text">
            <div class="pr-step-title">Stage Edits</div>
            <div class="pr-step-sub">Review & adjust</div>
          </div>
        </div>
        <div class="pr-step-line" :class="{ done: payrollRunStepIndex > 1 }"></div>
        <div class="pr-step" :class="{ done: payrollRunStepIndex > 2, active: payrollRunStepIndex === 2 }">
          <div class="pr-step-icon">
            <svg v-if="payrollRunStepIndex > 2" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span v-else>3</span>
          </div>
          <div class="pr-step-text">
            <div class="pr-step-title">Run Payroll</div>
            <div class="pr-step-sub">Calculate payments</div>
          </div>
        </div>
        <div class="pr-step-line" :class="{ done: payrollRunStepIndex > 2 }"></div>
        <div class="pr-step" :class="{ done: payrollRunStepIndex > 3, active: payrollRunStepIndex === 3 || payrollRunStepIndex === 4 }">
          <div class="pr-step-icon">
            <svg v-if="payrollRunStepIndex > 3" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span v-else>4</span>
          </div>
          <div class="pr-step-text">
            <div class="pr-step-title">Reports</div>
            <div class="pr-step-sub">Review outputs</div>
          </div>
        </div>
        <div class="pr-step-line" :class="{ done: payrollRunStepIndex > 4 }"></div>
        <div class="pr-step" :class="{ done: payrollRunStepIndex >= 5, active: payrollRunStepIndex === 4 }">
          <div class="pr-step-icon">
            <svg v-if="payrollRunStepIndex >= 5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span v-else>5</span>
          </div>
          <div class="pr-step-text">
            <div class="pr-step-title">Post Payroll</div>
            <div class="pr-step-sub">Publish to providers</div>
          </div>
        </div>
      </div>

      <div class="field-row" style="margin-top: 16px; grid-template-columns: 1fr 2fr;">
        <div class="field pr-period-field">
          <label>Pay period</label>
          <select v-model="selectedPeriodId" :key="`period-top-${agencyId || 'none'}`">
            <option :value="null" disabled>Select a pay period…</option>
            <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }} · {{ periodStatusForDisplay(p).label }}</option>
          </select>
        </div>
        <div class="field">
          <label>Import billing report</label>
          <input
            ref="currentPayrollFileInput"
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            @change="onFilePick"
            style="display: none;"
          />
          <div class="actions" style="margin-top: 8px; justify-content: flex-start;">
            <button
              :class="importFile ? 'btn btn-secondary' : 'btn btn-primary'"
              type="button"
              @click="triggerCurrentPayrollUpload"
              :disabled="!agencyId || importing"
            >
              Upload Current Pay Period
            </button>
            <button class="btn btn-secondary" type="button" @click="clearImportFile" :disabled="importing || !importFile">
              Remove file
            </button>
            <button class="btn btn-primary" type="button" @click="openImportConfirmModal" :disabled="importing || !importFile || !selectedPeriodId">
              {{ importing ? 'Importing...' : 'Import' }}
            </button>
          </div>
          <div class="hint" v-if="importFile">
            Selected file: <strong>{{ importFile.name }}</strong>
          </div>
          <div class="hint" v-if="detectedPeriodHint">{{ detectedPeriodHint }}</div>
        </div>
      </div>

      <!-- Auto-detect confirmation modal -->
      <div v-if="confirmAutoImportOpen" class="modal-backdrop" @click.self="confirmAutoImportOpen = false">
        <div class="modal" style="width: min(800px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Confirm Pay Period</div>
              <div class="hint">Verify which existing pay period to import into.</div>
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
              </select>
            </div>
            <div class="field" v-if="autoImportChoiceMode === 'existing'">
              <label>Existing pay period</label>
              <select v-model="autoImportExistingPeriodId">
                <option :value="null" disabled>Select a pay period…</option>
                <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
              </select>
            </div>
            <div class="field" v-else-if="autoImportChoiceMode === 'detected'">
              <label>Detected period</label>
              <div class="hint">
                {{ autoDetectResult?.detected?.periodStart }} → {{ autoDetectResult?.detected?.periodEnd }}
                <span v-if="autoImportExistingPeriodId" class="muted"> • will import into existing period #{{ autoImportExistingPeriodId }}</span>
                <span v-else class="muted"> • no matching period found — choose an existing period</span>
              </div>
            </div>
          </div>

          <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
            <button class="btn btn-primary" @click="confirmAutoImport" :disabled="autoImporting || !importFile || isPeriodPosted">
              {{ autoImporting ? 'Importing...' : 'Confirm & Import' }}
            </button>
          </div>
        </div>
      </div>

      <div class="pr-run-actions">
        <div class="pr-run-actions-primary">
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
          <button
            class="btn btn-secondary"
            type="button"
            @click.prevent.stop="openPayrollReports"
            :disabled="!selectedPeriodId"
          >
            Reports
          </button>
          <button class="btn btn-primary" @click="postPayroll" :disabled="postingPayroll || isPeriodPosted || selectedPeriodStatus !== 'ran'">
            {{ postingPayroll ? 'Posting...' : (isPeriodPosted ? 'Posted' : 'Post Payroll') }}
          </button>
        </div>
        <div class="pr-run-actions-secondary">
          <button class="btn btn-secondary btn-sm" @click="openRawModal" :disabled="!selectedPeriodId">
            Raw Import Audit
          </button>
          <button class="btn btn-secondary btn-sm" @click="openRunsSideBySideModal" :disabled="!selectedPeriodId">
            Runs Side-by-Side
          </button>
          <button class="btn btn-secondary btn-sm" @click="openManageImportsModal" :disabled="!selectedPeriodId">
            Manage Imports
          </button>
          <button class="btn btn-secondary btn-sm" type="button" @click="openSubmitOnBehalfModal" :disabled="!agencyId">
            Submit on behalf
          </button>
          <button class="btn btn-secondary btn-sm" type="button" @click="openPtoSheetModal" :disabled="!agencyId">
            PTO Sheet
          </button>
          <button class="btn btn-secondary btn-sm" type="button" @click="openSupervisionSheetModal" :disabled="!agencyId">
            Supervision Sheet
          </button>
          <button class="btn btn-secondary btn-sm" type="button" @click="openTodoModal" :disabled="!selectedPeriodId">
            Add Note / To-Do
          </button>
          <button
            v-if="canSeeRunResults"
            class="btn btn-secondary btn-sm"
            type="button"
            @click.prevent.stop="openRunResultsModalV2"
            :disabled="!selectedPeriodId"
          >
            View Ran Payroll
          </button>
          <button
            v-if="canSeeRunResults"
            class="btn btn-secondary btn-sm"
            type="button"
            @click.prevent.stop="openPreviewPostModalV2"
            :disabled="!selectedPeriodId"
          >
            Preview Post
          </button>
          <button
            v-if="isPeriodPosted"
            class="btn btn-danger btn-sm"
            type="button"
            @click.prevent.stop="unpostPayroll"
            :disabled="unpostingPayroll || !selectedPeriodId"
            title="Revert this posted period back to Ran so you can make corrections, then re-run and re-post."
          >
            {{ unpostingPayroll ? 'Unposting...' : 'Unpost Pay Period' }}
          </button>
          <button class="btn btn-danger btn-sm" @click="resetPeriod" :disabled="resettingPeriod || !selectedPeriodId">
            {{ resettingPeriod ? 'Resetting...' : 'Reset Pay Period' }}
          </button>
        </div>
      </div>
    </div>

    <div class="pr-below" v-if="agencyId">
      <div class="card pr-totals-card" v-if="selectedPeriodForUi">
        <div class="pr-totals-head">
          <div>
            <h2 class="card-title" style="margin-bottom: 4px;">Run Payroll (Totals)</h2>
            <div class="hint">Filter by provider above in Period Details. Click a row to inspect.</div>
          </div>
          <span class="pr-status-pill" :class="`pr-status-${dashboardStatusKey || 'draft'}`">{{ dashboardStatusLabel }}</span>
        </div>

        <div v-if="canSeeRunResults">
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
                <tr v-for="s in summariesSortedByProvider" :key="s.id" @click="selectSummary(s)" class="clickable">
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

        <!-- Submit on behalf modal -->
        <teleport to="body">
          <div v-if="showSubmitOnBehalfModal" class="modal-backdrop" @click.self="closeSubmitOnBehalfModal">
            <div class="modal" style="width: min(1100px, 100%);">
              <div class="modal-header">
                <div>
                  <div class="modal-title">Submit on behalf</div>
                  <div class="hint">
                    Submit payroll requests on behalf of a provider. These will appear in their history and in the normal payroll queues.
                  </div>
                </div>
                <div class="actions" style="margin: 0; justify-content: flex-end;">
                  <button class="btn btn-secondary btn-sm" type="button" @click="closeSubmitOnBehalfModal">Close</button>
                </div>
              </div>

              <div class="card" style="margin-top: 12px;">
                <div v-if="!agencyId" class="warn-box">
                  Select an organization first to use Submit on behalf.
                </div>

                <div v-else>
                  <div class="field-row" style="grid-template-columns: 1fr 1fr auto; align-items: end; gap: 10px;">
                    <div class="field">
                      <label>Search provider</label>
                      <input v-model="submitOnBehalfSearch" type="text" placeholder="Search name or email…" />
                    </div>
                    <div class="field">
                      <label>Provider</label>
                      <select v-model="submitOnBehalfUserId">
                        <option :value="null" disabled>Select a provider…</option>
                        <option v-for="u in submitOnBehalfUsers" :key="u.id" :value="u.id">
                          {{ u.last_name }}, {{ u.first_name }} <span v-if="u.email">({{ u.email }})</span>
                        </option>
                      </select>
                      <div class="hint" style="margin-top: 6px;">
                        {{ submitOnBehalfUserId ? `Selected: ${submitOnBehalfUserName}` : 'Select a provider to submit requests.' }}
                      </div>
                      <div v-if="submitOnBehalfUserId && submitOnBehalfTierUi" class="hint" style="margin-top: 6px;">
                        {{ submitOnBehalfTierUi.label }}
                      </div>
                    </div>
                    <div class="actions" style="margin: 0; justify-content: flex-end; gap: 8px;">
                      <button class="btn btn-secondary btn-sm" type="button" @click="clearSubmitOnBehalfProvider" :disabled="!submitOnBehalfUserId">
                        Clear
                      </button>
                      <button class="btn btn-secondary btn-sm" type="button" @click="nextSubmitOnBehalfProvider" :disabled="!submitOnBehalfUsers.length">
                        Next
                      </button>
                    </div>
                  </div>

                  <div v-if="loadingUsers" class="muted" style="margin-top: 10px;">Loading providers…</div>
                  <div v-else-if="submitOnBehalfUserId" style="margin-top: 10px;">
                    <AdminPayrollSubmitOverride
                      :agency-id="agencyId"
                      :user-id="submitOnBehalfUserId"
                      :user-name="submitOnBehalfUserName"
                      :user-role="submitOnBehalfUser?.role || null"
                      :user-medcancel-rate-schedule="submitOnBehalfUser?.medcancel_rate_schedule || null"
                    />
                  </div>
                  <div v-else class="hint" style="margin-top: 10px;">
                    Pick a provider above to begin submitting.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="showHolidayHoursModal" class="modal-backdrop">
            <div class="modal" style="width: min(980px, 100%);">
              <div class="modal-header">
                <div>
                  <div class="modal-title">Holiday hours (review)</div>
                  <div class="hint">Payable services from the latest import that occurred on configured holiday dates.</div>
                </div>
                <div class="actions" style="margin: 0;">
                  <button class="btn btn-secondary btn-sm" type="button" @click="loadHolidayHoursReport" :disabled="holidayHoursLoading || !selectedPeriodId">
                    Refresh
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" @click="showHolidayHoursModal = false" style="margin-left: 8px;">
                    Close
                  </button>
                </div>
              </div>

              <div v-if="holidayHoursError" class="warn-box" style="margin-top: 12px;">{{ holidayHoursError }}</div>
              <div v-if="holidayHoursLoading" class="muted" style="margin-top: 12px;">Loading holiday hours…</div>

              <div v-else style="margin-top: 12px;">
                <div v-if="!(holidayHoursMatched || []).length" class="muted">
                  No payable services on configured holiday dates were found for this pay period (latest import).
                </div>

                <div v-else class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Service code</th>
                        <th>Holiday dates</th>
                        <th class="right">Sessions</th>
                        <th class="right">Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in holidayHoursMatched" :key="`${r.user_id}:${r.service_code}`">
                        <td>{{ holidayHoursProviderLabel(r) }}</td>
                        <td>{{ r.service_code }}</td>
                        <td class="muted">{{ r.holiday_dates_csv || '—' }}</td>
                        <td class="right">{{ fmtNum(Number(r.session_count || 0)) }}</td>
                        <td class="right"><strong>{{ fmtNum(Number(r.units_total || 0)) }}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div v-if="(holidayHoursUnmatched || []).length" class="warn-box" style="margin-top: 12px;">
                  <div><strong>Unmatched providers</strong> (no user match on import row):</div>
                  <div class="muted" style="margin-top: 6px;">
                    {{ holidayHoursUnmatched.slice(0, 25).map((x) => `${x.provider_name || '—'} (${x.service_code})`).join(', ') }}
                    <span v-if="holidayHoursUnmatched.length > 25" class="muted">… (+{{ holidayHoursUnmatched.length - 25 }} more)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="showSupervisionConflictsModal" class="modal-backdrop">
            <div class="modal" style="width: min(1080px, 100%);">
              <div class="modal-header">
                <div>
                  <div class="modal-title">Supervision conflicts (legacy + app)</div>
                  <div class="hint">Rows that may cause duplicate supervision pay in this period.</div>
                </div>
                <div class="actions" style="margin: 0;">
                  <button class="btn btn-secondary btn-sm" type="button" @click="loadSupervisionConflictsReport" :disabled="supervisionConflictsLoading || !selectedPeriodId">
                    Refresh
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" @click="showSupervisionConflictsModal = false" style="margin-left: 8px;">
                    Close
                  </button>
                </div>
              </div>

              <div v-if="supervisionConflictsError" class="warn-box" style="margin-top: 12px;">{{ supervisionConflictsError }}</div>
              <div v-if="supervisionConflictsLoading" class="muted" style="margin-top: 12px;">Loading supervision conflicts…</div>

              <div v-else style="margin-top: 12px;">
                <div class="hint" style="margin-bottom: 8px;">
                  Unresolved rows: <strong>{{ supervisionConflictsUnresolvedCount }}</strong>
                </div>
                <div v-if="!(supervisionConflictsRows || []).length" class="muted">
                  No duplicate supervision rows detected for this period.
                </div>

                <div v-else class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Date</th>
                        <th>Legacy code</th>
                        <th class="right">Legacy units</th>
                        <th class="right">App minutes</th>
                        <th>Session types</th>
                        <th class="right">Delta min</th>
                        <th>Confidence</th>
                        <th>Decision</th>
                        <th class="right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in supervisionConflictsRows" :key="`${r.user_id}:${r.service_date}:${r.legacy_service_code}`">
                        <td>{{ nameForUserId(Number(r.user_id || 0)) }}</td>
                        <td>{{ r.service_date || '—' }}</td>
                        <td>{{ r.legacy_service_code || '—' }}</td>
                        <td class="right">{{ fmtNum(Number(r.legacy_units_total || 0)) }}</td>
                        <td class="right">{{ fmtNum(Number(r.app_attended_minutes || 0)) }}</td>
                        <td class="muted">{{ Array.isArray(r.app_session_types) ? r.app_session_types.join(', ') : '—' }}</td>
                        <td class="right">{{ fmtNum(Number(r.delta_minutes || 0)) }}</td>
                        <td>
                          <span :class="String(r.confidence || '') === 'high' ? 'ok' : (String(r.confidence || '') === 'medium' ? 'warn' : 'muted')">
                            {{ String(r.confidence || 'low') }}
                          </span>
                        </td>
                        <td>
                          <div v-if="r.resolution">
                            <div>{{ supervisionConflictResolutionLabel(r.resolution) }}</div>
                            <div class="muted" v-if="r.resolution_by_user_id || r.resolution_at">
                              {{ r.resolution_by_user_id ? `by ${nameForUserId(Number(r.resolution_by_user_id || 0))}` : '' }}
                              <span v-if="r.resolution_by_user_id && r.resolution_at"> • </span>
                              {{ r.resolution_at ? fmtDateTime(r.resolution_at) : '' }}
                            </div>
                            <div class="muted" v-if="r.resolution_note">{{ r.resolution_note }}</div>
                          </div>
                          <span v-else class="warn">Unresolved</span>
                        </td>
                        <td class="right">
                          <div class="actions" style="justify-content: flex-end; margin: 0;">
                            <button class="btn btn-secondary btn-sm" type="button" :disabled="supervisionConflictSavingKey === supervisionConflictRowKey(r)" @click="saveSupervisionConflictResolution(r, 'use_app_attendance')">
                              Use app
                            </button>
                            <button class="btn btn-secondary btn-sm" type="button" :disabled="supervisionConflictSavingKey === supervisionConflictRowKey(r)" @click="saveSupervisionConflictResolution(r, 'use_legacy_import')">
                              Use legacy
                            </button>
                            <button class="btn btn-secondary btn-sm" type="button" :disabled="supervisionConflictSavingKey === supervisionConflictRowKey(r)" @click="saveSupervisionConflictResolution(r, 'ignore')">
                              Ignore
                            </button>
                            <button class="btn btn-secondary btn-sm" type="button" :disabled="supervisionConflictSavingKey === supervisionConflictRowKey(r)" @click="saveSupervisionConflictResolution(r, 'clear')">
                              Clear
                            </button>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div v-if="showSupervisionAttendanceModal" class="modal-backdrop">
            <div class="modal" style="width: min(1200px, 100%);">
              <div class="modal-header">
                <div>
                  <div class="modal-title">Supervision attendance & pay</div>
                  <div class="hint">Tracked supervision rows with transcript links and session summaries.</div>
                </div>
                <div class="actions" style="margin: 0;">
                  <button class="btn btn-secondary btn-sm" type="button" @click="loadSupervisionAttendanceReport" :disabled="supervisionAttendanceLoading || !selectedPeriodId">
                    Refresh
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" @click="downloadSupervisionAttendanceCsv" :disabled="supervisionAttendanceLoading || !selectedPeriodId || !agencyId">
                    Export CSV
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" @click="showSupervisionAttendanceModal = false" style="margin-left: 8px;">
                    Close
                  </button>
                </div>
              </div>

              <div v-if="supervisionAttendanceError" class="warn-box" style="margin-top: 12px;">{{ supervisionAttendanceError }}</div>
              <div v-if="supervisionAttendanceLoading" class="muted" style="margin-top: 12px;">Loading supervision attendance…</div>

              <div v-else style="margin-top: 12px;">
                <div class="hint" style="margin-bottom: 8px;">
                  Rows: <strong>{{ (supervisionAttendanceRows || []).length }}</strong>
                  <span v-if="supervisionAttendanceStartDate && supervisionAttendanceEndDate"> • {{ supervisionAttendanceStartDate }} → {{ supervisionAttendanceEndDate }}</span>
                </div>
                <div v-if="!(supervisionAttendanceRows || []).length" class="muted">
                  No tracked supervision attendance rows found for this period.
                </div>

                <div v-else class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Participant</th>
                        <th>Date</th>
                        <th class="right">Hours</th>
                        <th>Service code</th>
                        <th class="right">Rate</th>
                        <th class="right">Amount</th>
                        <th>Transcript</th>
                        <th>Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in supervisionAttendanceRows" :key="`supv-att-${r.sessionId}-${r.userId}`">
                        <td>
                          <div><strong>#{{ Number(r.sessionId || 0) }}</strong></div>
                          <div class="muted">{{ r.sessionType || 'individual' }}</div>
                        </td>
                        <td>
                          <div>{{ r.participantName || nameForUserId(Number(r.userId || 0)) }}</div>
                          <div class="muted">{{ r.participantRole || 'supervisee' }}</div>
                        </td>
                        <td>
                          <div>{{ fmtDateTime(r.startAt) }}</div>
                          <div class="muted">to {{ fmtDateTime(r.endAt) }}</div>
                        </td>
                        <td class="right">{{ fmtNum(Number(r.totalHours || 0)) }}</td>
                        <td>{{ r?.pay?.serviceCode || '—' }}</td>
                        <td class="right">
                          <span v-if="Number(r?.pay?.rateAmount || 0) > 0">{{ fmtMoney(Number(r?.pay?.rateAmount || 0)) }}</span>
                          <span v-else class="muted">—</span>
                        </td>
                        <td class="right">
                          <span v-if="Number(r?.pay?.computedAmount || 0) > 0">{{ fmtMoney(Number(r?.pay?.computedAmount || 0)) }}</span>
                          <span v-else class="muted">{{ r?.pay?.payable ? '$0.00' : 'Not payable' }}</span>
                        </td>
                        <td>
                          <a
                            v-if="r.transcriptUrl"
                            :href="r.transcriptUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open transcript
                          </a>
                          <span v-else class="muted">—</span>
                        </td>
                        <td>
                          <details v-if="r.summaryText">
                            <summary>View summary</summary>
                            <div class="muted" style="white-space: pre-wrap; margin-top: 6px;">{{ r.summaryText }}</div>
                          </details>
                          <span v-else class="muted">—</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div v-if="showMeetingAttendanceModal" class="modal-backdrop">
            <div class="modal" style="width: min(1000px, 100%);">
              <div class="modal-header">
                <div>
                  <div class="modal-title">Meeting attendance (TEAM_MEETING)</div>
                  <div class="hint">Attendance synced from Google Meet. Participants must join with their Google account (signed in) to be tracked.</div>
                </div>
                <div class="actions" style="margin: 0;">
                  <button
                    class="btn btn-primary btn-sm"
                    type="button"
                    @click="syncMeetingAttendance"
                    :disabled="meetingAttendanceSyncing || !selectedPeriodId || !agencyId"
                  >
                    {{ meetingAttendanceSyncing ? 'Syncing…' : 'Sync from Google Meet' }}
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" @click="loadMeetingAttendanceReport" :disabled="meetingAttendanceLoading || !selectedPeriodId">
                    Refresh
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" @click="showMeetingAttendanceModal = false" style="margin-left: 8px;">
                    Close
                  </button>
                </div>
              </div>

              <div v-if="meetingAttendanceError" class="warn-box" style="margin-top: 12px;">{{ meetingAttendanceError }}</div>
              <div v-if="meetingAttendanceLoading" class="muted" style="margin-top: 12px;">Loading meeting attendance…</div>

              <div v-else style="margin-top: 12px;">
                <div class="hint" style="margin-bottom: 8px;">
                  Rows: <strong>{{ (meetingAttendanceRows || []).length }}</strong>
                  <span v-if="meetingAttendanceStartDate && meetingAttendanceEndDate"> • {{ meetingAttendanceStartDate }} → {{ meetingAttendanceEndDate }}</span>
                </div>
                <div v-if="!(meetingAttendanceRows || []).length" class="muted">
                  No meeting attendance found. Create TEAM_MEETING events with Meet links, then click &quot;Sync from Google Meet&quot; after meetings occur.
                </div>

                <div v-else class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Meeting</th>
                        <th>Provider</th>
                        <th>Date</th>
                        <th class="right">Minutes</th>
                        <th>Synced</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in meetingAttendanceRows" :key="`meet-att-${r.event_id}-${r.user_id}`">
                        <td>
                          <div><strong>{{ r.title || 'Meeting' }}</strong></div>
                          <div class="muted">#{{ r.event_id }}</div>
                        </td>
                        <td>{{ nameForUserId(Number(r.user_id || 0)) }}</td>
                        <td>{{ String(r.service_date || '').slice(0, 10) }}</td>
                        <td class="right">{{ fmtNum(Math.round(Number(r.total_seconds || 0) / 60 * 100) / 100) }}</td>
                        <td class="muted">{{ fmtDateTime(r.synced_at) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </teleport>

        <!-- Payroll Stage modal -->
        <div v-show="showStageModal" class="modal-backdrop" @click.self="confirmClose(() => { showStageModal = false; })">
          <div class="modal" style="width: min(95vw, 1800px); max-height: 95vh;">
            <div class="modal-header">
              <div>
                <div class="modal-title">Payroll Stage</div>
                <div class="hint">Edit the workspace + per-user adjustments before running payroll.</div>
              </div>
              <div class="actions" style="margin: 0; justify-content: flex-end;">
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="restagePeriod"
                  :disabled="restagingPeriod || isPeriodPosted || selectedPeriodStatus !== 'ran'"
                  :title="isPeriodPosted ? 'This pay period is posted. Unpost first if you need to restage.' : 'Clear run results and return this pay period to staging (does not delete imports or edits).'"
                >
                  {{ restagingPeriod ? 'Restaging…' : 'Restage' }}
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="openHolidayHoursModal"
                  :disabled="!selectedPeriodId"
                  style="margin-left: 8px;"
                  title="Review payable imported services that occurred on configured holiday dates (latest import)."
                >
                  Review holiday hours
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="openSupervisionAttendanceModal"
                  :disabled="!selectedPeriodId"
                  style="margin-left: 8px;"
                  title="View tracked supervision attendance, transcript links, and session summaries for this pay period."
                >
                  Supervision attendance & pay
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="openSupervisionConflictsModal"
                  :disabled="!selectedPeriodId"
                  style="margin-left: 8px;"
                  title="Flag potential double-pay rows where legacy supervision billing and in-app supervision attendance both exist."
                >
                  Review supervision conflicts
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="openMeetingAttendanceModal"
                  :disabled="!selectedPeriodId"
                  style="margin-left: 8px;"
                  title="View agency meeting (TEAM_MEETING) attendance synced from Google Meet. Sync to pull latest."
                >
                  Meeting attendance
                </button>
                <button
                  v-if="isPeriodPosted"
                  class="btn btn-danger btn-sm"
                  type="button"
                  @click.prevent.stop="unpostPayroll"
                  style="margin-left: 8px;"
                  title="Revert this posted period back to Ran so you can make corrections, then re-run and re-post."
                >
                  Unpost Pay Period
                </button>
                <button class="btn btn-secondary btn-sm" @click="confirmClose(() => { showStageModal = false; })" style="margin-left: 8px;">Close</button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px; border-left: 4px solid var(--danger);">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Blocking Payroll To‑Dos</h3>
              <div class="hint">Payroll cannot be run until all To‑Dos for this pay period are marked Done.</div>
              <div v-if="payrollTodosError" class="warn-box" style="margin-top: 8px;">{{ payrollTodosError }}</div>
              <div v-if="payrollTodosLoading" class="muted" style="margin-top: 8px;">Loading To‑Dos…</div>
              <div v-else-if="!(payrollTodos || []).length" class="muted" style="margin-top: 8px;">No To‑Dos yet.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th style="width: 90px;">Done</th>
                      <th>To‑Do</th>
                      <th style="width: 220px;">Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in payrollTodos" :key="t.id">
                      <td>
                        <input
                          type="checkbox"
                          :checked="String(t.status || '').toLowerCase() === 'done'"
                          :disabled="updatingPayrollTodoId === t.id"
                          @change="togglePayrollTodoDone(t, $event.target.checked)"
                        />
                      </td>
                      <td>
                        <div><strong>{{ t.title }}</strong></div>
                        <div v-if="t.description" class="muted" style="margin-top: 4px;">{{ t.description }}</div>
                      </td>
                      <td class="muted">
                        <span v-if="String(t.scope||'agency')==='provider'">Provider: {{ nameForUserId(Number(t.target_user_id || 0)) }}</span>
                        <span v-else>Agency-wide</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" type="button" @click="openTodoModal" :disabled="!selectedPeriodId">
                  Manage To‑Dos
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Providers in this payroll (Tier — live)</h3>
              <div class="hint">
                Based on the raw import for this pay period. Tier preview updates as you save workspace edits / draft-payable decisions.
              </div>
              <div class="field-row" style="grid-template-columns: 1fr auto; margin-top: 10px; align-items: end;">
                <div />
                <div class="field" style="min-width: 220px;">
                  <label>Sort</label>
                  <select v-model="payrollStageTierSort">
                    <option value="tier_desc">Tier (high → low)</option>
                    <option value="tier_asc">Tier (low → high)</option>
                    <option value="name_asc">Name (A → Z)</option>
                  </select>
                </div>
              </div>
              <div v-if="!(payrollStageProviderTierRows.matched || []).length && !(payrollStageProviderTierRows.unmatched || []).length" class="muted" style="margin-top: 8px;">
                No providers found in the raw import yet.
              </div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th class="right">Salary</th>
                      <th>Current (this pay period)</th>
                      <th>Last pay period tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="p in (payrollStageProviderTierRows.matched || [])" :key="p.key">
                      <td>{{ p.name }}</td>
                      <td class="right" :title="p.salaryTooltip || ''">
                        <strong v-if="p.salaryAmount !== null">{{ fmtMoney(p.salaryAmount) }}</strong>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="muted" :title="p.currentTooltip || ''">
                        <span>{{ p.currentLabel }}</span>
                        <span v-if="p.currentStatus" class="tier-chip" :class="{ grace: p.currentStatus === 'Grace' }">
                          {{ p.currentStatus }}
                        </span>
                      </td>
                      <td class="muted">{{ p.lastTierLabel }}</td>
                    </tr>
                    <tr v-if="(payrollStageProviderTierRows.unmatched || []).length">
                      <td colspan="4" class="warn-box" style="margin-top: 8px;">
                        <div><strong>Unmatched provider names in raw import</strong> (no user match):</div>
                        <div class="muted" style="margin-top: 6px;">
                          {{ (payrollStageProviderTierRows.unmatched || []).slice(0, 25).join(', ') }}
                          <span v-if="(payrollStageProviderTierRows.unmatched || []).length > 25" class="muted">
                            … (+{{ (payrollStageProviderTierRows.unmatched || []).length - 25 }} more)
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
                      <th>Submitted</th>
                      <th>Submitted by</th>
                      <th>Date</th>
                      <th class="right">Eligible miles</th>
                      <th class="right">Rate / Tier</th>
                      <th class="right">Pay period</th>
                      <th class="right">Est.</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingMileageClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ submittedAtYmd(c) }}</td>
                      <td>{{ submitterLabel(c) }}</td>
                      <td>{{ c.drive_date }}</td>
                      <td class="right">
                        {{ fmtNum(Number(c.eligible_miles ?? c.miles ?? 0)) }}
                      </td>
                      <td class="right">
                        <select v-if="mileageClaimUsesTierRate(c)" v-model="mileageTierByClaimId[c.id]" :disabled="approvingMileageClaimId === c.id">
                          <option :value="1">Tier 1</option>
                          <option :value="2">Tier 2</option>
                          <option :value="3">Tier 3</option>
                        </select>
                        <span v-else>{{ fmtMoney(mileageStandardRatePerMile) }}/mi</span>
                      </td>
                      <td class="right">
                        <select v-model="mileageTargetPeriodByClaimId[c.id]" :disabled="approvingMileageClaimId === c.id">
                          <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
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
                      <th>Submitted</th>
                      <th>Submitted by</th>
                      <th>Date</th>
                      <th class="right">Units</th>
                      <th class="right">Pay period</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingMedcancelClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ submittedAtYmd(c) }}</td>
                      <td>{{ submitterLabel(c) }}</td>
                      <td>{{ fmtClaimDate(c.claim_date) }}</td>
                      <td class="right">{{ fmtNum(Number(c.units ?? 0)) }}</td>
                      <td class="right">
                        <select v-model="medcancelTargetPeriodByClaimId[c.id]" :disabled="approvingMedcancelClaimId === c.id">
                          <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                        </select>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button class="btn btn-secondary btn-sm" @click="openMedcancelReview(c)" type="button">
                            Review
                          </button>
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
                      <th>Submitted</th>
                      <th>Submitted by</th>
                      <th>Date</th>
                      <th class="right">Amount</th>
                      <th>Details</th>
                      <th>Receipt</th>
                      <th class="right">Pay period</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingReimbursementClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ submittedAtYmd(c) }}</td>
                      <td>{{ submitterLabel(c) }}</td>
                      <td>{{ c.expense_date }}</td>
                      <td class="right">{{ fmtMoney(Number(c.amount || 0)) }}</td>
                      <td>
                        <div class="muted" style="line-height: 1.25;">
                          <div v-if="c.payment_method"><strong>Payment:</strong> {{ String(c.payment_method || '').replaceAll('_',' ') }}</div>
                          <div v-if="c.purchase_approved_by"><strong>Approver:</strong> {{ c.purchase_approved_by }}</div>
                          <div v-if="c.project_ref"><strong>Project:</strong> {{ c.project_ref }}</div>
                          <div v-if="c.reason"><strong>Reason:</strong> {{ c.reason }}</div>
                          <div v-if="splitSummary(c)"><strong>Split:</strong> {{ splitSummary(c) }}</div>
                        </div>
                      </td>
                      <td>
                        <a v-if="c.receipt_file_path" :href="receiptUrl(c)" target="_blank" rel="noopener noreferrer">View</a>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="right">
                        <select v-model="reimbursementTargetPeriodByClaimId[c.id]" :disabled="approvingReimbursementClaimId === c.id">
                          <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
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
              <div class="hint">Meeting/training, excess time, service corrections, overtime evaluations, holiday pay, and other employee-submitted extra pay. Skill Builders event kiosk hours are reviewed in Event time (Pending) below. Late submissions can still be added to this payroll if payroll chooses to approve with an override.</div>
              <div v-if="pendingTimeError" class="warn-box" style="margin-top: 8px;">{{ pendingTimeError }}</div>
              <div v-if="pendingTimeLoading" class="muted" style="margin-top: 8px;">Loading pending submissions…</div>
              <div v-else-if="!pendingTimeClaims.length" class="muted" style="margin-top: 8px;">No pending time claims for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Submitted</th>
                      <th>Submitted by</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th class="right">Requested time</th>
                      <th class="right">Bucket</th>
                      <th class="right">Hours/Credits</th>
                      <th class="right">Applied $</th>
                      <th class="right">Pay period</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingTimeClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ submittedAtYmd(c) }}</td>
                      <td>{{ submitterLabel(c) }}</td>
                      <td>{{ fmtClaimDate(c.claim_date) }}</td>
                      <td>{{ timeTypeLabel(c) }}</td>
                      <td class="right">{{ timeRequestedLabel(c) }}</td>
                      <td class="right">
                        <select v-model="timeBucketByClaimId[c.id]" :disabled="approvingTimeClaimId === c.id">
                          <option value="indirect">Indirect</option>
                          <option value="direct">Direct</option>
                        </select>
                      </td>
                      <td class="right">
                        <input
                          v-model="timeCreditsHoursByClaimId[c.id]"
                          type="number"
                          step="0.01"
                          placeholder="(blank)"
                          :disabled="approvingTimeClaimId === c.id"
                          style="width: 120px;"
                        />
                      </td>
                      <td class="right">
                        <input
                          v-model="timeAppliedAmountOverrideByClaimId[c.id]"
                          type="number"
                          step="0.01"
                          placeholder="(blank)"
                          :disabled="approvingTimeClaimId === c.id"
                          style="width: 120px;"
                        />
                      </td>
                      <td class="right">
                        <div>
                          <select v-model="timeTargetPeriodByClaimId[c.id]" :disabled="approvingTimeClaimId === c.id">
                            <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                          </select>
                          <div
                            v-if="timeClaimNeedsLateOverrideWarning(c)"
                            class="hint"
                            style="margin-top: 4px; color: #b45309;"
                          >
                            Submitted after cutoff. Adding to this earlier pay period will require payroll override.
                          </div>
                        </div>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button class="btn btn-secondary btn-sm" @click="openTimeClaimReview(c)" type="button">
                            Review
                          </button>
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
              <h3 class="card-title" style="margin: 0 0 6px 0;">Event time (Pending)</h3>
              <div class="hint">
                Skill Builders / program event kiosk check-in/out with direct and indirect hour split. Each session appears as two rows (direct + indirect). Direct hours are defaulted from the event settings and locked; edit the indirect hours if needed before approving each bucket. Edits are logged with the original values.
                All pending submissions are shown here regardless of pay period. <strong>Approving posts to the currently selected pay period.</strong> Switch pay periods before approving to control where each submission is posted.
              </div>
              <div v-if="eventTimeError" class="warn-box" style="margin-top: 8px;">{{ eventTimeError }}</div>
              <div v-if="eventTimeLoading" class="muted" style="margin-top: 8px;">Loading event time submissions…</div>
              <div v-else-if="!eventTimeSubmissions.length" class="muted" style="margin-top: 8px;">
                {{ eventTimeShowApproved ? 'No event time submissions.' : 'No pending event time submissions.' }}
              </div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
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
                      :class="{ 'pto-row-approved': row.claim?.status === 'approved', 'pto-row-rejected': row.claim?.status === 'rejected' }"
                    >
                      <td>{{ row.submission.providerName || nameForUserId(row.submission.userId) }}</td>
                      <td>{{ row.submission.eventTitle || '—' }}</td>
                      <td>
                        {{ formatEventTimeIso(row.submission.clockInAt) }}
                        <span
                          v-if="row.bucket === 'direct' && row.lateMinutes > 0"
                          :title="`Expected report time on this date`"
                          style="margin-left:4px;background:#fef3c7;color:#92400e;font-size:0.7rem;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;"
                        >+{{ row.lateMinutes }}m late</span>
                      </td>
                      <td>{{ formatEventTimeIso(row.submission.clockOutAt) }}</td>
                      <td class="right">{{ row.submission.workedHours ?? '—' }}</td>
                      <td>{{ row.bucketLabel }}</td>
                      <td class="right">{{ row.bucketHours ?? '—' }}</td>
                      <td>
                        <span :class="['pto-status-badge', `pto-status-${String(row.claim?.status || 'submitted').toLowerCase()}`]">
                          {{ (row.claim?.status || 'submitted').charAt(0).toUpperCase() + (row.claim?.status || 'submitted').slice(1) }}
                        </span>
                        <span
                          v-if="row.submission.wasEdited && row.bucket === 'direct'"
                          title="Values changed from auto-submitted"
                          style="margin-left:4px;color:#b45309;font-size:0.75rem;font-weight:600;"
                        >✎ Edited</span>
                      </td>
                      <td class="muted" style="font-size: 12px;">{{ eventTimePeriodLabel(row.claim) }}</td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0; flex-wrap: wrap; gap: 6px;">
                          <template v-if="row.canApprove">
                            <select
                              v-model="eventTimeTargetPeriodByPunchId[row.submission.punchInId]"
                              :disabled="eventTimeSavingId === row.submission.punchInId"
                              style="font-size: 11px; max-width: 160px;"
                              :title="'Pay period to post to when approving'"
                            >
                              <option :value="null" disabled>— select period —</option>
                              <option v-for="p in alignedPeriods" :key="p.id" :value="p.id">
                                {{ periodRangeLabel(p) }}
                              </option>
                            </select>
                          </template>
                          <button
                            v-if="row.bucket === 'direct' && row.canApprove"
                            class="btn btn-secondary btn-sm"
                            type="button"
                            :disabled="eventTimeSavingId === row.submission.punchInId"
                            @click="openEventTimeEdit(row.submission)"
                          >
                            Edit time
                          </button>
                          <button
                            v-if="row.canApprove"
                            class="btn btn-primary btn-sm"
                            type="button"
                            :disabled="eventTimeSavingId === row.submission.punchInId || !eventTimeTargetPeriodByPunchId[row.submission.punchInId]"
                            @click="approveEventTimeSubmission(row.submission, row.bucket)"
                          >
                            Approve {{ row.bucketLabel.toLowerCase() }}
                          </button>
                          <button
                            v-if="row.bucket === 'direct' && row.canApprove"
                            class="btn btn-secondary btn-sm"
                            type="button"
                            :disabled="eventTimeSavingId === row.submission.punchInId"
                            @click="returnEventTimeSubmission(row.submission)"
                          >
                            Send back…
                          </button>
                          <button
                            v-if="row.bucket === 'direct' && row.canApprove"
                            class="btn btn-danger btn-sm"
                            type="button"
                            :disabled="eventTimeSavingId === row.submission.punchInId"
                            @click="rejectEventTimeSubmission(row.submission)"
                          >
                            Reject
                          </button>
                          <button
                            v-if="row.bucket === 'direct' && !row.canApprove && row.claim?.status === 'approved'"
                            class="btn btn-secondary btn-sm"
                            type="button"
                            :disabled="eventTimeSavingId === row.submission.punchInId"
                            @click="unapproveEventTimeSubmission(row.submission)"
                          >
                            Unapprove
                          </button>
                          <span v-if="!row.canApprove && row.claim?.status === 'rejected'" class="muted" style="font-size: 12px;">Rejected</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end; gap: 8px;">
                <button class="btn btn-secondary" @click="toggleEventTimeShowApproved" :disabled="eventTimeLoading || !agencyId">
                  {{ eventTimeShowApproved ? 'Show pending only' : 'Show approved / history' }}
                </button>
                <button class="btn btn-secondary" @click="loadEventTimeSubmissions" :disabled="eventTimeLoading || !agencyId">
                  Refresh event time queue
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Holiday Bonus (Pending)</h3>
              <div class="hint">
                System-generated approvals when payable services occur on configured agency holiday dates. Approve/reject to include/exclude Holiday Bonus in payroll.
              </div>
              <div v-if="pendingHolidayBonusError" class="warn-box" style="margin-top: 8px;">{{ pendingHolidayBonusError }}</div>
              <div v-if="pendingHolidayBonusLoading" class="muted" style="margin-top: 8px;">Loading pending holiday bonuses…</div>
              <div v-else-if="!pendingHolidayBonusClaims.length" class="muted" style="margin-top: 8px;">No pending holiday bonuses for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Holiday dates</th>
                      <th class="right">Base service pay</th>
                      <th class="right">%</th>
                      <th class="right">Bonus</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingHolidayBonusClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td class="muted">{{ holidayBonusDatesLabel(c) }}</td>
                      <td class="right">{{ fmtMoney(Number(c.base_service_pay_amount || 0)) }}</td>
                      <td class="right">{{ fmtNum(Number(c.holiday_bonus_percent || 0)) }}</td>
                      <td class="right"><strong>{{ fmtMoney(Number(c.applied_amount || 0)) }}</strong></td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-primary btn-sm"
                            @click="approveHolidayBonusClaim(c)"
                            :disabled="updatingHolidayBonusClaimId === c.id"
                          >
                            {{ updatingHolidayBonusClaimId === c.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectHolidayBonusClaim(c)" :disabled="updatingHolidayBonusClaimId === c.id">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingHolidayBonusClaims" :disabled="pendingHolidayBonusLoading || !agencyId">
                  Show all pending (any period)
                </button>
                <button class="btn btn-secondary" @click="loadPendingHolidayBonusClaims" :disabled="pendingHolidayBonusLoading || !selectedPeriodId">
                  This pay period only
                </button>
              </div>
            </div>

            <div ref="ptoSectionRef" class="card" style="margin-top: 12px;">
              <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                <div>
                  <h3 class="card-title" style="margin: 0 0 4px 0;">PTO Requests</h3>
                  <div class="hint">Approve to deduct PTO balances and post PTO pay into the selected pay period.</div>
                </div>
              </div>

              <!-- Status filter chips -->
              <div class="pto-filter-bar" style="margin-top: 8px;">
                <button
                  :class="['pto-chip', ptoStatusFilter.includes('submitted') ? 'pto-chip--active pto-chip--submitted' : '']"
                  type="button"
                  @click="togglePtoStatusFilter('submitted')"
                >
                  Pending<span v-if="ptoStatusCounts.submitted" class="pto-chip-count">{{ ptoStatusCounts.submitted }}</span>
                </button>
                <button
                  :class="['pto-chip', ptoStatusFilter.includes('approved') ? 'pto-chip--active pto-chip--approved' : '']"
                  type="button"
                  @click="togglePtoStatusFilter('approved')"
                >
                  Approved<span v-if="ptoStatusCounts.approved" class="pto-chip-count">{{ ptoStatusCounts.approved }}</span>
                </button>
                <button
                  :class="['pto-chip', ptoStatusFilter.includes('rejected') ? 'pto-chip--active pto-chip--rejected' : '']"
                  type="button"
                  @click="togglePtoStatusFilter('rejected')"
                >
                  Denied<span v-if="ptoStatusCounts.rejected" class="pto-chip-count">{{ ptoStatusCounts.rejected }}</span>
                </button>
                <button
                  :class="['pto-chip', ptoStatusFilter.includes('deferred') ? 'pto-chip--active pto-chip--deferred' : '']"
                  type="button"
                  @click="togglePtoStatusFilter('deferred')"
                  v-if="ptoStatusCounts.deferred"
                >
                  Sent back<span class="pto-chip-count">{{ ptoStatusCounts.deferred }}</span>
                </button>
              </div>

              <div v-if="pendingPtoError" class="warn-box" style="margin-top: 8px;">{{ pendingPtoError }}</div>
              <div v-if="pendingPtoLoading" class="muted" style="margin-top: 8px;">Loading requests…</div>
              <div v-else-if="!ptoVisibleRequests.length" class="muted" style="margin-top: 8px;">
                No {{ ptoStatusFilter.length === 1 && ptoStatusFilter[0] === 'submitted' ? 'pending' : '' }} PTO requests.
              </div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Created</th>
                      <th>Submitted by</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th class="right">Hours</th>
                      <th class="right">Starting balance</th>
                      <th class="right">New balance</th>
                      <th>First date</th>
                      <th>Proof</th>
                      <th class="right">Post to pay period</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in ptoVisibleRequests" :key="r.id" :class="{ 'pto-row-approved': r.status === 'approved', 'pto-row-rejected': r.status === 'rejected' }">
                      <td>{{ nameForUserId(r.user_id) }}</td>
                      <td>{{ String(r.created_at || '').slice(0, 10) }}</td>
                      <td>{{ submitterLabel(r) }}</td>
                      <td>{{ String(r.request_type || '').toLowerCase() === 'training' ? 'Training PTO' : 'Sick Leave' }}</td>
                      <td>
                        <span :class="['pto-status-badge', `pto-status-${String(r.status || 'submitted').toLowerCase()}`]">
                          {{ String(r.status || 'submitted').charAt(0).toUpperCase() + String(r.status || 'submitted').slice(1) }}
                        </span>
                      </td>
                      <td class="right">{{ fmtNum(Number(r.total_hours || 0)) }}</td>
                      <td class="right">
                        {{ r.status === 'submitted' ? fmtNum(ptoBalancePreviewForRequest(r).start) : '—' }}
                      </td>
                      <td class="right">
                        <span v-if="r.status === 'submitted'" :class="ptoBalancePreviewForRequest(r).next < -1e-9 ? 'warn' : ''">
                          {{ fmtNum(ptoBalancePreviewForRequest(r).next) }}
                        </span>
                        <span v-else class="muted">—</span>
                      </td>
                      <td>
                        {{
                          (() => {
                            const items = Array.isArray(r?.items) ? r.items : [];
                            const dates = items
                              .map((it) => String(it?.request_date || it?.requestDate || '').slice(0, 10))
                              .filter(Boolean)
                              .sort();
                            return dates[0] || '—';
                          })()
                        }}
                      </td>
                      <td>
                        <a v-if="r.proof_file_path" :href="receiptUrl({ receipt_file_path: r.proof_file_path })" target="_blank" rel="noopener noreferrer">View</a>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="right">
                        <template v-if="r.status === 'submitted'">
                          <div class="muted" style="font-size: 11px; margin-bottom: 3px;">Select pay period to post to:</div>
                          <select v-model="ptoTargetPeriodByRequestId[r.id]" :disabled="approvingPtoRequestId === r.id">
                            <option :value="null" disabled>— choose period —</option>
                            <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                          </select>
                        </template>
                        <span v-else-if="r.approved_period_start" class="muted" style="font-size: 12px;">
                          {{ String(r.approved_period_start || '').slice(0,10) }} – {{ String(r.approved_period_end || '').slice(0,10) }}
                        </span>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="right">
                        <div v-if="r.status === 'submitted'" class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-primary btn-sm"
                            @click="approvePtoRequest(r)"
                            :disabled="approvingPtoRequestId === r.id || !isValidTargetPeriodId(ptoTargetPeriodByRequestId[r.id]) || isTargetPeriodLocked(ptoTargetPeriodByRequestId[r.id])"
                          >
                            {{ approvingPtoRequestId === r.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-secondary btn-sm" @click="returnPtoRequest(r)" :disabled="approvingPtoRequestId === r.id">
                            Send back…
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectPtoRequest(r)" :disabled="approvingPtoRequestId === r.id">
                            Reject
                          </button>
                        </div>
                        <span v-else class="muted" style="font-size: 12px;">
                          {{ r.status === 'approved' ? `Approved ${String(r.approved_at || '').slice(0,10)}` : r.status === 'rejected' ? `Denied ${String(r.rejected_at || '').slice(0,10)}` : r.status === 'deferred' ? 'Sent back' : '' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingPtoRequests" :disabled="pendingPtoLoading || !agencyId">
                  Show all (any period)
                </button>
                <button class="btn btn-secondary" @click="loadPendingPtoRequests" :disabled="pendingPtoLoading || !selectedPeriodId">
                  This pay period only
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Supervision Hours (Import CSV)</h3>
              <div class="hint">
                Upload a CSV for this pay period. Columns: <code>email</code> (or <code>user_id</code>), <code>individual_hours</code>, <code>group_hours</code>.
              </div>
              <div v-if="supervisionImportError" class="warn-box" style="margin-top: 8px;">{{ supervisionImportError }}</div>

              <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr auto;">
                <div class="field">
                  <input type="file" accept=".csv,text/csv" @change="onSupervisionCsvPick" />
                  <div class="muted" v-if="supervisionCsvName" style="margin-top: 6px;">Selected: <strong>{{ supervisionCsvName }}</strong></div>
                </div>
                <div class="actions" style="justify-content: flex-end; margin-top: 0;">
                  <button class="btn btn-primary" @click="uploadSupervisionCsv" :disabled="supervisionImporting || !supervisionCsvFile || !selectedPeriodId">
                    {{ supervisionImporting ? 'Uploading…' : 'Upload' }}
                  </button>
                </div>
              </div>

              <div v-if="supervisionImportResult" class="muted" style="margin-top: 10px;">
                Applied {{ supervisionImportResult.counts?.ok || 0 }} rows; skipped {{ supervisionImportResult.counts?.skipped || 0 }}.
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
                            <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">
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
                      <td>{{ fmtClaimDate(c.claim_date) }}</td>
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
                            <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
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
              <h3 class="card-title" style="margin: 0 0 6px 0;">Approved Holiday Bonus (This pay period)</h3>
              <div class="hint">Approved holiday bonuses contribute as a single “Holiday Bonus” line item in payroll adjustments.</div>
              <div v-if="approvedHolidayBonusListError" class="warn-box" style="margin-top: 8px;">{{ approvedHolidayBonusListError }}</div>
              <div v-if="approvedHolidayBonusListLoading" class="muted" style="margin-top: 8px;">Loading approved holiday bonuses…</div>
              <div v-else-if="!approvedHolidayBonusClaims.length" class="muted" style="margin-top: 8px;">No approved holiday bonuses for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Holiday dates</th>
                      <th class="right">Base service pay</th>
                      <th class="right">%</th>
                      <th class="right">Bonus</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in approvedHolidayBonusClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td class="muted">{{ holidayBonusDatesLabel(c) }}</td>
                      <td class="right">{{ fmtMoney(Number(c.base_service_pay_amount || 0)) }}</td>
                      <td class="right">{{ fmtNum(Number(c.holiday_bonus_percent || 0)) }}</td>
                      <td class="right"><strong>{{ fmtMoney(Number(c.applied_amount || 0)) }}</strong></td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="unapproveHolidayBonusClaim(c)"
                            :disabled="unapprovingHolidayBonusClaimId === c.id || isTargetPeriodLocked(Number(c.payroll_period_id || selectedPeriodId))"
                          >
                            {{ unapprovingHolidayBonusClaimId === c.id ? 'Unapproving…' : 'Unapprove' }}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadApprovedHolidayBonusClaimsList" :disabled="approvedHolidayBonusListLoading || !selectedPeriodId">
                  Refresh approved holiday bonuses
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
                      <th class="right">Bucket</th>
                      <th class="right">Hours/Credits</th>
                      <th class="right">Amount</th>
                      <th class="right">Move to</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in approvedTimeClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ fmtClaimDate(c.claim_date) }}</td>
                      <td>{{ timeTypeLabel(c) }}</td>
                      <td class="right">{{ String(c.bucket || 'indirect').toLowerCase() === 'direct' ? 'Direct' : 'Indirect' }}</td>
                      <td class="right">{{ fmtNum(timeClaimHours(c)) }}</td>
                      <td class="right">{{ fmtMoney(Number(c.applied_amount || 0)) }}</td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <select v-model="approvedTimeMoveTargetByClaimId[c.id]" :disabled="movingTimeClaimId === c.id">
                            <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
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
                            @click="openTimeClaimReview(c)"
                          >
                            Review
                          </button>
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

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Manual Pay Lines (This pay period)</h3>
              <div class="hint">
                One-off fixes that should appear in Run Payroll and Posted Payroll for this pay period.
              </div>
              <div v-if="manualPayLinesError" class="warn-box" style="margin-top: 8px;">{{ manualPayLinesError }}</div>

              <div class="tabs" style="margin-top: 12px;">
                <button
                  type="button"
                  class="tab"
                  :class="{ active: manualPayLinesTab === 'add' }"
                  @click="manualPayLinesTab = 'add'"
                >
                  Manual Add
                </button>
                <button
                  type="button"
                  class="tab"
                  :class="{ active: manualPayLinesTab === 'bulk' }"
                  @click="manualPayLinesTab = 'bulk'"
                >
                  Manual Bulk
                </button>
              </div>

              <div v-if="manualPayLinesTab === 'add'">
                <div class="hint" style="margin-top: 8px;">
                  Add as many rows as you need, then save them in one click. Amount can be negative for corrections.
                </div>

                <div v-if="isPeriodPosted" class="muted" style="margin-top: 8px;">This pay period is posted (manual lines are locked).</div>

                <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th style="width: 120px;">Type</th>
                      <th style="width: 260px;">Provider</th>
                      <th style="width: 130px;">Bucket</th>
                      <th class="right" style="width: 140px;">Hours/Credits</th>
                      <th>Service / note</th>
                      <th class="right" style="width: 160px;">Amount ($)</th>
                      <th class="right" style="width: 140px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, idx) in manualPayLineDraftRows" :key="r._key">
                      <td>
                        <select v-model="r.lineType" :disabled="savingManualPayLines">
                          <option value="pay">Pay</option>
                          <option value="pto">PTO</option>
                        </select>
                      </td>
                      <td>
                        <select v-model="r.userId" :disabled="savingManualPayLines">
                          <option :value="null">Select provider…</option>
                          <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                        </select>
                      </td>
                      <td>
                        <select v-if="String(r.lineType||'pay') !== 'pto'" v-model="r.category" :disabled="savingManualPayLines">
                          <option value="direct">Direct</option>
                          <option value="indirect">Indirect</option>
                        </select>
                        <select v-else v-model="r.ptoBucket" :disabled="savingManualPayLines">
                          <option value="sick">Sick PTO</option>
                          <option value="training">Training PTO</option>
                        </select>
                      </td>
                      <td class="right">
                        <input
                          v-model="r.creditsHours"
                          type="number"
                          step="0.01"
                          :placeholder="String(r.lineType||'pay') === 'pto' ? 'required' : '(blank)'"
                          :disabled="savingManualPayLines"
                          style="width: 120px;"
                        />
                      </td>
                      <td>
                        <input v-model="r.label" type="text" placeholder="e.g., Manual correction" :disabled="savingManualPayLines" />
                      </td>
                      <td class="right">
                        <input
                          v-model="r.amount"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          :disabled="savingManualPayLines || String(r.lineType||'pay') === 'pto'"
                        />
                      </td>
                      <td class="right">
                        <button
                          class="btn btn-secondary btn-sm"
                          type="button"
                          @click="removeManualPayLineDraftRow(idx)"
                          :disabled="savingManualPayLines || manualPayLineDraftRows.length <= 1"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

                <div class="actions" style="margin-top: 10px; justify-content: space-between;">
                  <button class="btn btn-secondary" type="button" @click="addManualPayLineDraftRow" :disabled="savingManualPayLines || isPeriodPosted">
                    Add another row
                  </button>
                  <button
                    class="btn btn-primary"
                    type="button"
                    @click="saveManualPayLines"
                    :disabled="savingManualPayLines || isPeriodPosted || !hasValidManualPayLineDraft"
                  >
                    {{ savingManualPayLines ? 'Saving…' : 'Save manual lines' }}
                  </button>
                </div>
              </div>

              <div v-if="manualPayLinesTab === 'bulk'" class="manual-bulk-section">
                <div class="hint" style="margin-top: 8px;">
                  Bulk add manual pay for meeting attendees. Enter comma-separated names as <strong>Last, First</strong> (e.g. Smith, John, Doe, Jane).
                  Each provider must have a rate for the selected service code. Input is <strong>Minutes</strong> for codes like MEETING (60 min = 1 hr), or <strong>Units</strong> for codes like H2014 (4 units = 1 hr).
                </div>
                <div v-if="isPeriodPosted" class="muted" style="margin-top: 8px;">This pay period is posted (manual lines are locked).</div>
                <div v-else class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 12px; gap: 12px;">
                  <div class="field" style="grid-column: 1 / -1;">
                    <label>Attendees (comma-separated Last, First)</label>
                    <textarea
                      v-model="manualBulkAttendees"
                      placeholder="Smith, John, Doe, Jane"
                      rows="3"
                      :disabled="savingManualBulk"
                      style="width: 100%; resize: vertical;"
                    />
                  </div>
                  <div class="field">
                    <label>Service Code</label>
                    <select v-model="manualBulkServiceCode" :disabled="savingManualBulk">
                      <option v-for="r in manualBulkServiceCodeOptions" :key="r.service_code" :value="r.service_code">
                        {{ r.service_code }}
                      </option>
                    </select>
                  </div>
                  <div class="field">
                    <label>{{ manualBulkInputLabel }}</label>
                    <input
                      v-model="manualBulkQuantity"
                      type="number"
                      step="1"
                      min="1"
                      :placeholder="manualBulkInputPlaceholder"
                      :disabled="savingManualBulk"
                    />
                    <div class="hint" style="margin-top: 4px;">
                      {{ manualBulkInputLabel === 'Minutes' ? 'e.g. 60 = 1 hour' : 'e.g. 4 = 1 hour (15 min/unit)' }}
                    </div>
                  </div>
                  <div class="field">
                    <label>Meeting Date</label>
                    <input v-model="manualBulkMeetingDate" type="date" :disabled="savingManualBulk" />
                  </div>
                  <div class="field" style="grid-column: 1 / -1;">
                    <label>Reason / Note</label>
                    <input v-model="manualBulkReason" type="text" placeholder="e.g., Weekly team sync" :disabled="savingManualBulk" />
                  </div>
                </div>
                <div v-if="manualBulkError" class="warn-box" style="margin-top: 8px;">{{ manualBulkError }}</div>
                <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
                  <button
                    class="btn btn-primary"
                    type="button"
                    @click="submitManualBulk"
                    :disabled="savingManualBulk || isPeriodPosted || !manualBulkAttendees.trim() || !manualBulkQuantity || Number(manualBulkQuantity) <= 0"
                  >
                    {{ savingManualBulk ? 'Submitting…' : (manualBulkError ? 'Resubmit' : 'Submit Manual Bulk') }}
                  </button>
                </div>
              </div>

              <div v-if="manualPayLinesLoading" class="muted" style="margin-top: 8px;">Loading manual pay lines…</div>
              <div v-else-if="!manualPayLines.length" class="muted" style="margin-top: 8px;">No manual lines yet.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
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
                    <tr v-for="l in manualPayLines" :key="l.id">
                      <td>{{ nameForUserId(l.user_id) }}</td>
                      <td>
                        <template v-if="editingManualPayLineId === l.id">
                          <select v-model="editingManualPayLineDraft.category" style="min-width: 100px;">
                            <option value="direct">Direct</option>
                            <option value="indirect">Indirect</option>
                          </select>
                        </template>
                        <span v-else class="muted">{{ String(l.category || 'direct').toUpperCase() }}</span>
                      </td>
                      <td>{{ l.label }}</td>
                      <td class="right">
                        <template v-if="editingManualPayLineId === l.id">
                          <input
                            v-model.number="editingManualPayLineDraft.creditsHours"
                            type="number"
                            step="0.01"
                            style="width: 70px; text-align: right;"
                            title="Credits/hours (negative allowed for reductions)"
                          />
                        </template>
                        <template v-else>{{ fmtNum(Number(l.credits_hours ?? l.creditsHours ?? 0)) }} h</template>
                      </td>
                      <td class="right">
                        <template v-if="editingManualPayLineId === l.id">
                          <input
                            v-model.number="editingManualPayLineDraft.amount"
                            type="number"
                            step="0.01"
                            style="width: 90px; text-align: right;"
                          />
                        </template>
                        <template v-else>{{ fmtMoney(Number(l.amount || 0)) }}</template>
                      </td>
                      <td class="right">
                        <template v-if="editingManualPayLineId === l.id">
                          <button
                            class="btn btn-primary btn-sm"
                            type="button"
                            @click="saveEditManualPayLine(l)"
                            :disabled="updatingManualPayLineId === l.id"
                          >
                            {{ updatingManualPayLineId === l.id ? 'Saving…' : 'Save' }}
                          </button>
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="cancelEditManualPayLine"
                            :disabled="updatingManualPayLineId === l.id"
                            style="margin-left: 6px;"
                          >
                            Cancel
                          </button>
                        </template>
                        <template v-else>
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="beginEditManualPayLine(l)"
                            :disabled="isPeriodPosted || deletingManualPayLineId === l.id"
                          >
                            Edit
                          </button>
                          <button
                            class="btn btn-danger btn-sm"
                            type="button"
                            @click="deleteManualPayLine(l)"
                            :disabled="isPeriodPosted || deletingManualPayLineId === l.id"
                            style="margin-left: 6px;"
                          >
                            {{ deletingManualPayLineId === l.id ? 'Deleting…' : 'Delete' }}
                          </button>
                        </template>
                      </td>
                    </tr>
                  </tbody>
                </table>
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
                  <div class="row"><strong>Submitted:</strong> {{ submittedAtYmd(selectedMileageClaim) }}</div>
                  <div class="row"><strong>Submitted by:</strong> {{ submitterLabel(selectedMileageClaim) }}</div>
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
                Adjust only these three columns: No Note / Draft / Finalized. Changes will not affect totals until you click <strong>Run Payroll</strong>. Manual edits for unpaid and no-note rows remain editable until the period is posted.
              </div>

          <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Search (service code / provider)</label>
              <input v-model="workspaceSearch" type="text" placeholder="Search service code or provider…" />
              <div class="hint" style="margin-top: 6px;" v-if="priorStillUnpaidStageError">
                <span class="error-box" style="display: inline-block; padding: 6px 10px;">{{ priorStillUnpaidStageError }}</span>
              </div>
            </div>
            <div class="field">
              <label>Provider</label>
              <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end;">
                <select v-model="selectedUserId">
                  <option :value="null">All providers</option>
                  <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ payrollUserOptionLabel(u) }}</option>
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
              <div class="actions" style="margin: 6px 0 0 0; justify-content: flex-start;">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="loadPriorStillUnpaidForStage(true)"
                  :disabled="loadingPriorStillUnpaidForStage || !selectedPeriodId"
                  title="Reload prior-period still-unpaid snapshot (drives the red indicators)"
                >
                  {{ loadingPriorStillUnpaidForStage ? 'Loading…' : 'Reload prior unpaid' }}
                </button>
                <button
                  v-if="!stageCarryoverEditMode"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="beginStageCarryoverEdit"
                  :disabled="isPeriodPosted || !selectedPeriodId"
                  title="Edit Old Done Notes (yellow) and Prior still unpaid (red)"
                  style="margin-left: 8px;"
                >
                  Edit carryover columns
                </button>
                <span v-else>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    @click="saveStageCarryoverEdits"
                    :disabled="savingStageCarryoverEdits || isPeriodPosted"
                    style="margin-left: 8px;"
                  >
                    {{ savingStageCarryoverEdits ? 'Saving…' : 'Save Old Done Notes' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    @click="saveStagePriorUnpaidEdits"
                    :disabled="savingStagePriorUnpaidEdits || isPeriodPosted"
                    style="margin-left: 8px;"
                  >
                    {{ savingStagePriorUnpaidEdits ? 'Saving…' : 'Save Prior still unpaid' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="cancelStageCarryoverEdit" style="margin-left: 8px;">
                    Cancel
                  </button>
                </span>
              </div>
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
                  <th class="right">
                    Prior still unpaid
                    <span
                      class="muted"
                      v-if="(carryoverPriorStillUnpaid || []).length"
                      title="Count of provider+code rows from the selected prior period comparison run that still have unpaid units."
                    >
                      ({{ (carryoverPriorStillUnpaid || []).length }})
                    </span>
                    <div class="hint" style="margin-top: 2px;" v-if="carryoverPriorStillUnpaidPeriodLabel">
                      {{ carryoverPriorStillUnpaidPeriodLabel }}
                    </div>
                  </th>
                  <th class="right">Effective Finalized</th>
                  <th class="right">Pay Divisor</th>
                  <th class="right">Pay-hours</th>
                  <th class="right">Credits/Hours</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="priorStillUnpaidOrphanRowsForStage.length" class="prior-unpaid-row">
                  <td colspan="15">
                    <strong>Still unpaid from prior period (no matching row in this pay period)</strong>
                    <span class="muted" v-if="carryoverPriorStillUnpaidPeriodLabel">({{ carryoverPriorStillUnpaidPeriodLabel }})</span>
                    <span class="muted">— these won’t show inline because this pay period has no row for that code</span>
                  </td>
                </tr>
                <tr
                  v-for="p in priorStillUnpaidOrphanRowsForStage"
                  :key="`prior-unpaid-orphan:${p.userId}:${p.serviceCode}`"
                  class="prior-unpaid-row"
                >
                  <td>{{ p.lastName ? `${p.lastName}, ${p.firstName || ''}` : (p.providerName || '—') }}</td>
                  <td>{{ p.serviceCode }}</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right prior-unpaid-cell">{{ fmtNum(Number(p.stillUnpaidUnits || 0)) }}</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                </tr>
                <tr v-for="r in workspaceMatchedRows" :key="stagingKey(r)" :class="{ 'carryover-row': (r.carryover?.oldDoneNotesUnits || 0) > 0 }">
                  <td>{{ r.lastName ? `${r.lastName}, ${r.firstName || ''}` : (r.providerName || '—') }}</td>
                  <td>{{ r.serviceCode }}</td>
                  <td class="right">{{ fmtNum(r.raw?.noNoteUnits ?? 0) }}</td>
                  <td class="right">{{ fmtNum(r.raw?.draftUnits ?? 0) }}</td>
                  <td class="right">{{ fmtNum(r.raw?.finalizedUnits ?? 0) }}</td>
                  <td class="right">
                    <input
                      v-model.number="(stagingEdits[stagingKey(r)] || (stagingEdits[stagingKey(r)] = { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 })).noNoteUnits"
                      class="stage-num-input"
                      type="number"
                      inputmode="numeric"
                      step="1"
                      :disabled="isPeriodPosted"
                    />
                  </td>
                  <td class="right">
                    <input
                      v-model.number="(stagingEdits[stagingKey(r)] || (stagingEdits[stagingKey(r)] = { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 })).draftUnits"
                      class="stage-num-input"
                      type="number"
                      inputmode="numeric"
                      step="1"
                      :disabled="isPeriodPosted"
                    />
                  </td>
                  <td class="right">
                    <input
                      v-model.number="(stagingEdits[stagingKey(r)] || (stagingEdits[stagingKey(r)] = { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 })).finalizedUnits"
                      class="stage-num-input"
                      type="number"
                      inputmode="numeric"
                      step="1"
                      :disabled="isPeriodPosted"
                    />
                  </td>
                  <td class="right carryover-cell">
                    <span v-if="stageCarryoverEditMode">
                      <input
                        v-model.number="stageCarryoverEdits[stagingKey(r)]"
                        class="stage-num-input"
                        type="number"
                        inputmode="numeric"
                        step="1"
                        :disabled="isPeriodPosted"
                      />
                    </span>
                    <span v-else>
                      {{ fmtNum(r.carryover?.oldDoneNotesUnits ?? 0) }}
                    </span>
                  </td>
                  <td
                    class="right"
                    :class="{ 'prior-unpaid-cell': Number(priorStillUnpaidUnitsByStageKey[stageKeyNormalized(r.userId, r.serviceCode)] || 0) > 0 }"
                    :title="Number(priorStillUnpaidUnitsByStageKey[stageKeyNormalized(r.userId, r.serviceCode)] || 0) > 0 ? 'Still unpaid in the prior pay period after the selected comparison run.' : ''"
                  >
                    <span v-if="stageCarryoverEditMode">
                      <input
                        v-model.number="stagePriorUnpaidEdits[stagingKey(r)]"
                        class="stage-num-input"
                        type="number"
                        inputmode="decimal"
                        step="0.01"
                        :disabled="isPeriodPosted"
                      />
                    </span>
                    <span v-else>
                      {{
                        Number(priorStillUnpaidUnitsByStageKey[stageKeyNormalized(r.userId, r.serviceCode)] || 0) > 0
                          ? fmtNum(priorStillUnpaidUnitsByStageKey[stageKeyNormalized(r.userId, r.serviceCode)])
                          : '—'
                      }}
                    </span>
                  </td>
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
                  <td colspan="15" class="muted">No rows found. Import the billing report for this period to populate the workspace.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="filteredStagingUnmatched?.length" class="warn-box" style="margin-top: 12px;">
            <div>
              <strong>Unmatched rows</strong>
              <span v-if="selectedUserId"> for {{ selectedUserName }}</span>
              <span v-else> (couldn’t map provider name to a user in this org)</span>
            </div>
            <div class="hint">
              <span v-if="selectedUserId">These rows could not be automatically matched to {{ selectedUserName }}. If the import name is slightly different, update it in the billing system and re-import.</span>
              <span v-else>These rows are not editable until the provider name matches a user (first+last) in this organization.</span>
            </div>
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
                  <tr v-for="(u, idx) in filteredStagingUnmatched" :key="idx">
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

          <!-- Keep this section mounted when modals are open (even if no provider is selected yet). -->
          <div v-if="selectedUserId || showRunModal || showPreviewPostModal || showRawModal">
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
                <label>IMatter ($)</label>
                <input v-model="adjustments.imatterAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              </div>
              <div class="field">
                <label>Missed Appointments ($)</label>
                <input v-model="adjustments.missedAppointmentsAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              </div>
            <div class="field">
              <label>Bonus ($)</label>
              <input v-model="adjustments.bonusAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">
                Approved Holiday Bonus (auto): {{ approvedHolidayBonusClaimsLoading ? 'Loading…' : fmtMoney(approvedHolidayBonusClaimsAmount || 0) }}
              </div>
            </div>
            <div class="field">
              <label>Manual Reimbursement Override ($)</label>
              <input v-model="adjustments.reimbursementAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">
                Approved reimbursement claims (auto): {{ approvedReimbursementClaimsLoading ? 'Loading…' : fmtMoney(approvedReimbursementClaimsAmount || 0) }}
              </div>
            </div>
            <div class="field">
              <label>Tuition Reimbursement (Tax-exempt) ($)</label>
              <input v-model="adjustments.tuitionReimbursementAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">Shows as a separate non-taxable line item on export + pay statement.</div>
            </div>
            <div class="field">
              <label>{{ otherRateTitlesForAdjustments.title1 }} hours</label>
              <input v-model="adjustments.otherRate1Hours" type="number" step="0.01" min="0" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">Paid at the provider’s configured rate card.</div>
            </div>
            <div class="field">
              <label>{{ otherRateTitlesForAdjustments.title2 }} hours</label>
              <input v-model="adjustments.otherRate2Hours" type="number" step="0.01" min="0" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">Paid at the provider’s configured rate card.</div>
            </div>
            <div class="field">
              <label>{{ otherRateTitlesForAdjustments.title3 }} hours</label>
              <input v-model="adjustments.otherRate3Hours" type="number" step="0.01" min="0" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">Paid at the provider’s configured rate card.</div>
            </div>
            <div class="field">
              <label>Salary Override ($)</label>
              <input v-model="adjustments.salaryAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div
                class="hint"
                style="margin-top: 4px;"
                v-if="Number(adjustments.salaryAmount || 0) <= 0 && String(adjustments.salarySource || '') === 'position' && Number(adjustments.salaryEffectiveAmount || 0) > 0"
              >
                Auto from profile salary: {{ fmtMoney(adjustments.salaryEffectiveAmount) }}
                <span class="muted" v-if="adjustments.salaryIsProrated"> (prorated)</span>
                <span class="muted" v-if="adjustments.salaryIncludeServicePay"> • includes service pay</span>
              </div>
            </div>
            <div class="field">
              <label>Sick Leave Hours</label>
              <input v-model="adjustments.sickPtoHours" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>Training PTO Hours</label>
              <input v-model="adjustments.trainingPtoHours" type="number" step="0.01" :disabled="isPeriodPosted" />
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
                <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
                <tr v-for="(v, code) in (selectedSummary?.breakdown || {})" :key="code" v-if="!String(code).startsWith('_')">
                  <td class="code">{{ code }}</td>
                  <td class="right">{{ fmtNum(v?.finalizedUnits ?? v?.units ?? 0) }}</td>
                  <td class="right muted">{{ fmtNum(v?.payDivisor ?? 1) }}</td>
                  <td class="right muted">{{ fmtNum(v?.payHours ?? 0) }}</td>
                  <td class="right muted">{{ fmtNum(v?.durationMinutes ?? 0) }}</td>
                  <td class="right muted">{{ fmtNum(v?.hours ?? 0) }}</td>
                  <td class="right muted">{{ fmtBreakdownRate(v) }}</td>
                  <td class="right">{{ fmtMoney(v?.amount ?? 0) }}</td>
                  <td class="muted">{{ v?.rateSource || '—' }}</td>
                </tr>
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

        <!-- View Ran Payroll modal -->
        <teleport to="body">
          <div v-if="showRunModal" class="modal-backdrop" @click.self="confirmClose(() => { showRunModal = false; })">
            <div class="modal modal-payroll-results">
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
                <button class="btn btn-secondary btn-sm" @click="confirmClose(() => { showRunModal = false; })">Close</button>
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
                  <div class="right muted">{{ fmtBreakdownRate(l) }}</div>
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
                    <div class="hint" style="margin-top: 4px;">
                      Approved Holiday Bonus (auto): {{ approvedHolidayBonusClaimsLoading ? 'Loading…' : fmtMoney(approvedHolidayBonusClaimsAmount || 0) }}
                    </div>
                  </div>
                  <div class="field">
                    <label>Manual Reimbursement Override ($)</label>
                    <input v-model="adjustments.reimbursementAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                    <div class="hint" style="margin-top: 4px;">
                      Approved reimbursement claims (auto): {{ approvedReimbursementClaimsLoading ? 'Loading…' : fmtMoney(approvedReimbursementClaimsAmount || 0) }}
                    </div>
                  </div>
                  <div class="field">
                    <label>Tuition Reimbursement (Tax-exempt) ($)</label>
                    <input v-model="adjustments.tuitionReimbursementAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                    <div class="hint" style="margin-top: 4px;">Shows as a separate non-taxable line item on export + pay statement.</div>
                  </div>
                  <div class="field">
                    <label>Salary Override ($)</label>
                    <input v-model="adjustments.salaryAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                    <div
                      class="hint"
                      style="margin-top: 4px;"
                      v-if="Number(adjustments.salaryAmount || 0) <= 0 && String(adjustments.salarySource || '') === 'position' && Number(adjustments.salaryEffectiveAmount || 0) > 0"
                    >
                      Auto from profile salary: {{ fmtMoney(adjustments.salaryEffectiveAmount) }}
                      <span class="muted" v-if="adjustments.salaryIsProrated"> (prorated)</span>
                      <span class="muted" v-if="adjustments.salaryIncludeServicePay"> • includes service pay</span>
                    </div>
                  </div>
                  <div class="field">
                    <label>Sick Leave Hours</label>
                    <input v-model="adjustments.sickPtoHours" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </div>
                  <div class="field">
                    <label>Training PTO Hours</label>
                    <input v-model="adjustments.trainingPtoHours" type="number" step="0.01" :disabled="isPeriodPosted" />
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
        </teleport>

        <!-- Preview Post modal -->
        <teleport to="body">
          <div v-if="showPreviewPostModal" class="modal-backdrop" @click.self="confirmClose(() => { showPreviewPostModal = false; })">
            <div class="modal modal-payroll-results">
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
                <button class="btn btn-secondary btn-sm" @click="confirmClose(() => { showPreviewPostModal = false; })">Close</button>
              </div>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr;">
              <div class="field">
                <label>Provider</label>
                <select v-model="previewUserId">
                  <option :value="null" disabled>Select a provider…</option>
                  <option v-for="s in summariesSortedByProvider" :key="s.user_id" :value="s.user_id">{{ s.last_name }}, {{ s.first_name }}</option>
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
                  <div v-if="previewCarryoverNotes > 0" class="warn-box" style="margin-top: 8px;">
                    <div><strong>Prior notes included in this payroll:</strong> {{ fmtNum(previewCarryoverNotes) }} notes</div>
                    <div class="muted">Reminder: complete prior-period notes by Sunday 11:59pm after the pay period ends to avoid compensation delays.</div>
                  </div>

                  <div v-if="previewTwoPeriodsAgoUnpaid.total > 0" class="warn-box" style="margin-top: 8px; border: 1px solid #ffb5b5; background: #ffecec;">
                    <div><strong>Reminder: unpaid notes from 2 pay periods ago</strong></div>
                    <div class="muted" style="margin-top: 4px;"><strong>{{ previewTwoPeriodsAgoUnpaid.periodStart }} → {{ previewTwoPeriodsAgoUnpaid.periodEnd }}</strong></div>
                    <div style="margin-top: 6px;">
                      <strong>No Note:</strong> {{ fmtNum(previewTwoPeriodsAgoUnpaid.noNote) }} notes
                      <span class="muted">•</span>
                      <strong>Draft:</strong> {{ fmtNum(previewTwoPeriodsAgoUnpaid.draft) }} notes
                    </div>
                    <div class="muted" style="margin-top: 6px;">Complete outstanding notes to be included in a future payroll.</div>
                  </div>

                  <div v-if="previewUnpaidInPeriod.total > 0" class="warn-box" style="margin-top: 8px; border: 1px solid #ffd8a8; background: #fff4e6;">
                    <div><strong>Unpaid notes in this pay period</strong></div>
                    <div style="margin-top: 6px;">
                      <strong>No Note:</strong> {{ fmtNum(previewUnpaidInPeriod.noNote) }} notes
                      <span class="muted">•</span>
                      <strong>Draft:</strong> {{ fmtNum(previewUnpaidInPeriod.draft) }} notes
                    </div>
                    <div class="muted" style="margin-top: 6px;">
                      These notes were not paid this period. Complete outstanding notes to be included in a future payroll.
                    </div>
                    <div class="muted" style="margin-top: 6px;">
                      Due to Therapy Notes, we are unable to differentiate a note that is incomplete for a session that did occur from a note that is incomplete for a session that did not occur.
                    </div>
                  </div>

                  <div v-if="previewCarryoverNotes <= 0 && previewTwoPeriodsAgoUnpaid.total <= 0 && previewUnpaidInPeriod.total <= 0" class="muted" style="margin-top: 8px;">
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
                <div
                  v-for="l in previewSummaryServiceLines"
                  :key="l.code"
                  class="code-row"
                  :style="
                    (String(l.code).includes('(Old Note)') || String(l.code).includes('(Late Addition)') || String(l.code).includes('(Code Changed)'))
                      ? { background: '#fffbe6', borderLeft: '3px solid #f0b429', paddingLeft: '9px' }
                      : (Number(l.noNoteUnits ?? 0) > 0)
                        ? { background: '#fff0f0', borderLeft: '3px solid #e53e3e', paddingLeft: '9px' }
                        : {}
                  "
                >
                  <div class="code">{{ l.code }}</div>
                  <div class="right muted">{{ fmtNum(l.noNoteUnits ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.draftUnits ?? 0) }}</div>
                  <div class="right">{{ fmtNum(l.finalizedUnits ?? l.units ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.hours ?? 0) }}</div>
                  <div class="right muted">{{ fmtBreakdownRate(l) }}</div>
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
                    <tr><td>IMatter</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.imatterAmount ?? 0) }}</td></tr>
                    <tr><td>Missed Appointments</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.missedAppointmentsAmount ?? 0) }}</td></tr>
                    <tr><td>Bonus</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.bonusAmount ?? 0) }}</td></tr>
                    <tr><td>Reimbursement</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.reimbursementAmount ?? 0) }}</td></tr>
                    <tr><td>Tuition Reimbursement (Tax-exempt)</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.tuitionReimbursementAmount ?? 0) }}</td></tr>
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
        </teleport>

        <!-- Raw import modal -->
        <teleport to="body">
          <div v-if="showRawModal" class="modal-backdrop" @click.self="confirmClose(closeRawModal)">
            <div class="modal">
            <div class="modal-header">
              <div>
                <div class="modal-title">
                  <span v-if="rawMode === 'draft_audit'">Raw Import (Draft Audit)</span>
                  <span v-else-if="rawMode === 'process_h0031'">Raw Import (Process H0031)</span>
                  <span v-else-if="rawMode === 'process_h0032'">Raw Import (Process H0032)</span>
                  <span v-else-if="rawMode === 'process_h2014'">Raw Import (Process H2014)</span>
                  <span v-else-if="rawMode === 'process_90853'">Raw Import (Process 90853)</span>
                  <span v-else-if="rawMode === 'process_h2032'">Raw Import (Process H2032)</span>
                  <span v-else-if="rawMode === 'missed_appts_paid_in_full'">Raw Import (Missed Appointments • Paid in Full)</span>
                  <span v-else>Raw Import (Processed)</span>
                </div>
                <div class="hint">
                  <span v-if="rawMode === 'draft_audit'">
                    Review only DRAFT rows and mark which drafts are payable (default) vs not payable. This updates Payroll Stage immediately.
                  </span>
                  <span v-else-if="rawMode === 'process_h0031'">
                    Enter the correct minutes for H0031 rows, then mark Done. Payroll cannot run until these are processed.
                    <strong>Unpaid rows</strong> (no note or draft not payable) are included — update minutes so they are correct when notes are added later.
                  </span>
                  <span v-else-if="rawMode === 'process_h0032'">
                    Enter the correct minutes for H0032 Cat1 Hour rows, then mark Done. Payroll cannot run until these are processed. (Cat2 Flat providers do not appear here; they default to 30 minutes per line.)
                    <strong>Unpaid rows</strong> are included — update minutes so they are correct when notes are added later.
                  </span>
                  <span v-else-if="rawMode === 'process_h2014'">
                    See, approve, and change all H2014 (Skills Training) rows before moving past raw import. Enter correct minutes and mark Done. Payroll cannot run until these are processed.
                  </span>
                  <span v-else-if="rawMode === 'process_90853'">
                    See, approve, and change all 90853 (Group therapy) rows before moving past raw import. Enter correct minutes and mark Done. Payroll cannot run until these are processed.
                  </span>
                  <span v-else-if="rawMode === 'process_h2032'">
                    See, approve, and change all H2032 (Activity therapy) rows before moving past raw import. Enter correct minutes and mark Done. Payroll cannot run until these are processed.
                  </span>
                  <span v-else-if="rawMode === 'missed_appts_paid_in_full'">
                    Flags from the billing report upload where Type contains "Missed Appointment" and Patient Balance Status is "Paid in Full". Display-only (no pay math).
                  </span>
                  <span v-else>
                    Review rows that have been processed (Done).
                  </span>
                </div>
              </div>
              <div class="actions" style="margin: 0;">
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'draft_audit'">Draft Audit</button>
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'process_h0031'">Process H0031</button>
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'process_h0032'">Process H0032</button>
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'process_h2014'">Process H2014</button>
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'process_90853'">Process 90853</button>
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'process_h2032'">Process H2032</button>
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'missed_appts_paid_in_full'">Missed Appts (Paid in Full)</button>
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'processed'">Processed</button>
                <button class="btn btn-secondary btn-sm" @click="downloadRawCsv" :disabled="!selectedPeriodId">
                  Download CSV
                </button>
                <button
                  v-if="batchCatchUpPriorPeriodId && (batchCatchUpPriorPeriodImports || []).length >= 2"
                  class="btn btn-primary btn-sm"
                  @click="viewAddToCurrentPeriod"
                  title="Close this modal and scroll to the Add to Current Period results"
                >
                  View Add to Current Period
                </button>
                <button class="btn btn-secondary btn-sm" @click="confirmClose(closeRawModal)">Close</button>
              </div>
            </div>
            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 10px;">
              <div class="field">
                <label>Imported Snapshot</label>
                <select v-model="rawAuditSelectedImportId" :disabled="rawAuditLoading || !(rawAuditImports || []).length">
                  <option v-for="imp in rawAuditImports" :key="`imp-${imp.id}`" :value="imp.id">{{ rawAuditImportOptionLabel(imp) }}</option>
                </select>
              </div>
              <div class="field">
                <label>Compare Against Import</label>
                <select v-model="rawAuditBaselineImportId" :disabled="rawAuditLoading || !(rawAuditImports || []).length">
                  <option v-for="imp in rawAuditImports" :key="`baseline-imp-${imp.id}`" :value="imp.id">{{ rawAuditImportOptionLabel(imp) }}</option>
                </select>
              </div>
              <div class="field">
                <label>Run Audit</label>
                <div class="hint">
                  <span v-if="rawAuditLoading">Loading run data…</span>
                  <span v-else>
                    Showing {{ rawAuditChangeCount }} change{{ rawAuditChangeCount === 1 ? '' : 's' }} from selected baseline import
                  </span>
                </div>
                <label v-if="!rawAuditLoading && rawAuditChanges.length" class="muted" style="display: inline-flex; align-items: center; gap: 6px; margin-top: 6px;">
                  <input type="checkbox" v-model="rawAuditShowAllChanges" />
                  Show All (including rows already paid in baseline)
                </label>
              </div>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 10px;">
              <div class="field">
                <label>Search</label>
                <input
                  v-model="rawDraftSearch"
                  type="text"
                  :placeholder="rawMode === 'missed_appts_paid_in_full' ? 'Search provider…' : 'Search provider / code / DOS…'"
                />
              </div>
              <div class="field">
                <label>Rows</label>
                <div class="hint" v-if="rawMode !== 'draft_audit'">Filtered by mode</div>
                <select v-else v-model="rawRowFilter">
                  <option value="unpaid_only">Unpaid only (no note + draft unpaid)</option>
                  <option value="draft_only">Draft only</option>
                  <option value="payable">Payable (finalized + draft paid)</option>
                  <option value="all">Show All</option>
                </select>
              </div>
              <div class="field">
                <label>Status</label>
                <div class="hint" v-if="isPeriodPosted">
                  Posted (locked)
                  <span v-if="rawMode === 'process_h0031' || rawMode === 'process_h0032' || rawMode === 'process_h2014' || rawMode === 'process_90853' || rawMode === 'process_h2032'">
                    •
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="margin-left: 8px;"
                      @click="unlockPostedRawProcessing"
                    >
                      {{ rawPostedProcessingUnlocked ? 'Unlocked' : 'Unlock H0031/H0032/H2014/H2032/90853 editing' }}
                    </button>
                  </span>
                </div>
                <div class="hint" v-else-if="isRawAuditHistoricalRun">
                  Historical run (read-only)
                </div>
                <div class="hint" v-else>{{ updatingDraftPayable ? 'Saving…' : 'Editable' }}</div>
              </div>
            </div>
            <div v-if="rawDraftError" class="error-box">{{ rawDraftError }}</div>
            <div v-if="rawMode === 'draft_audit' && rawRowFilter === 'unpaid_only' && !rawModeRows.length && rawImportRows.length" class="hint muted" style="margin-top: 8px;">
              No unpaid rows. Try <strong>Payable</strong> or <strong>Show All</strong> to see finalized rows, or review the Run Audit section above for late notes to add to current period.
            </div>
            <div
              v-if="isPeriodPosted && rawPostedProcessingUnlocked && (rawMode === 'process_h0031' || rawMode === 'process_h0032' || rawMode === 'process_h2014' || rawMode === 'process_90853' || rawMode === 'process_h2032')"
              class="warn-box"
              style="margin-top: 10px;"
            >
                    You are editing a <strong>posted</strong> period. This is allowed only for H0031/H0032/H2014/H2032/90853 minutes + Done processing.
              It updates Raw Import and Payroll Stage totals, but does not automatically recompute posted payroll totals.
            </div>
            <div class="table-wrap">
              <table v-if="rawMode !== 'missed_appts_paid_in_full'" class="table">
                <thead>
                  <tr>
                    <th class="th-sortable" @click="toggleRawSort('provider_name')">
                      Provider Name <span class="th-sort-indicator">{{ rawSortIndicator('provider_name') }}</span>
                    </th>
                    <th class="th-sortable" @click="toggleRawSort('client')">
                      Client <span class="th-sort-indicator">{{ rawSortIndicator('client') }}</span>
                    </th>
                    <th class="th-sortable" @click="toggleRawSort('service_code')">
                      Service Code <span class="th-sort-indicator">{{ rawSortIndicator('service_code') }}</span>
                    </th>
                    <th class="th-sortable" @click="toggleRawSort('service_date')">
                      DOS <span class="th-sort-indicator">{{ rawSortIndicator('service_date') }}</span>
                    </th>
                    <th class="right">
                      <span v-if="rawMode === 'draft_audit'">Units</span>
                      <span v-else>Minutes</span>
                    </th>
                    <th class="th-sortable" @click="toggleRawSort('note_status')">
                      Note Status <span class="th-sort-indicator">{{ rawSortIndicator('note_status') }}</span>
                    </th>
                    <th>Paid?</th>
                    <th v-if="rawMode === 'draft_audit'">Draft Payable?</th>
                    <th v-else>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="r in rawModeRowsLimited"
                    :key="r.id"
                    :class="{
                      'row-unpaid-h003': (rawMode === 'process_h0031' || rawMode === 'process_h0032' || rawMode === 'process_h2014' || rawMode === 'process_90853' || rawMode === 'process_h2032') && !willBePaid(r),
                      'row-paid-muted': Number(r.is_paid) === 1
                    }"
                  >
                    <td>{{ r.provider_name }}</td>
                    <td class="muted">{{ rawClientHint(r) || '—' }}</td>
                    <td>{{ r.service_code }}</td>
                    <td class="muted">{{ ymd(r.service_date) }}</td>
                    <td class="right">
                      <span v-if="rawMode === 'draft_audit'">{{ fmtNum(r.unit_count) }}</span>
                      <input
                        v-else
                        type="number"
                        step="1"
                        min="1"
                        :value="Number(r.unit_count || 0)"
                        :disabled="(isPeriodPosted && !rawPostedProcessingUnlocked) || isRawAuditHistoricalRun"
                        style="width: 90px;"
                        @change="updateRawMinutes(r, $event.target.value)"
                      />
                    </td>
                    <td>
                      <span class="status-pill" :class="rawStatusPillClass(r)">{{ rawStatusLabel(r) }}</span>
                    </td>
                    <td>
                      <strong>{{ rawPaidStateLabel(r) }}</strong>
                    </td>
                    <td v-if="rawMode === 'draft_audit'">
                      <select
                        v-if="String(r.note_status || '').toUpperCase() === 'DRAFT'"
                        :disabled="isPeriodPosted || rawRowFilter === 'all' || isRawAuditHistoricalRun"
                        :value="Number(r.draft_payable) ? 'payable' : 'not_payable'"
                        @change="toggleDraftPayable(r, $event.target.value === 'payable')"
                      >
                        <option value="payable">Payable (default)</option>
                        <option value="not_payable">Not payable</option>
                      </select>
                      <span v-else class="muted">—</span>
                    </td>
                    <td v-else>
                      <div style="display: flex; align-items: center; gap: 10px; justify-content: flex-end;">
                        <label
                          v-if="rawMode === 'process_h0031' || rawMode === 'process_h0032' || rawMode === 'process_h2014' || rawMode === 'process_90853' || rawMode === 'process_h2032'"
                          class="muted"
                          style="display: inline-flex; align-items: center; gap: 6px; margin-right: 6px;"
                          title="Local checklist only (not saved)"
                        >
                          <input
                            type="checkbox"
                            :checked="!!(rawProcessChecklistByRowId || {})[Number(r.id)]"
                            @change="setRawProcessChecked(r.id, $event.target.checked)"
                          />
                          <span>Check</span>
                        </label>
                        <span class="muted">{{ r.processed_at ? 'Done' : 'Not done' }}</span>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          :disabled="(isPeriodPosted && !rawPostedProcessingUnlocked) || isRawAuditHistoricalRun || !(Number(r.requires_processing) === 1)"
                          @click="toggleRawProcessed(r, !r.processed_at)"
                        >
                          {{ r.processed_at ? 'Undo' : 'Mark done' }}
                        </button>
                      </div>
                    </td>
                    <td>
                      <button type="button" class="btn btn-secondary btn-sm" @click="openRawRowNotes(r)">Notes</button>
                    </td>
                  </tr>
                  <tr v-if="!rawModeRows.length">
                    <td colspan="9" class="muted">No rows found.</td>
                  </tr>
                </tbody>
              </table>

              <table v-else class="table">
                <thead>
                  <tr>
                    <th>Clinician Name</th>
                    <th class="right">Total Patient Amount Paid</th>
                    <th class="right">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in missedAppointmentsPaidInFullRows" :key="r.clinician_name">
                    <td>{{ r.clinician_name }}</td>
                    <td class="right">{{ fmtMoney(Number(r.total_patient_amount_paid || 0)) }}</td>
                    <td class="right">{{ fmtNum(Number(r.row_count || 0)) }}</td>
                  </tr>
                  <tr v-if="!missedAppointmentsPaidInFullRows.length">
                    <td colspan="3" class="muted">No Paid-in-Full missed appointment rows were detected in the latest billing import.</td>
                  </tr>
                </tbody>
              </table>

              <div v-if="rawMode !== 'missed_appts_paid_in_full'" class="table-wrap" style="margin-top: 10px;">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Change</th>
                      <th>Provider</th>
                      <th>Client</th>
                      <th>DOS</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Units</th>
                      <th>Paid?</th>
                      <th v-if="rawAuditHasDraftRows">Draft Payable?</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(c, idx) in rawAuditChangesLimited" :key="`${c.rowMatchKey || idx}-${idx}`" :style="c.redFlag ? 'background-color: #ffecec; border-left: 3px solid #dc3545;' : null">
                      <td><strong v-if="c.redFlag" style="color: #dc3545;">{{ rawChangeTypeLabel(c.changeType) }}</strong><template v-else>{{ rawChangeTypeLabel(c.changeType) }}</template></td>
                      <td>{{ c.provider_name || '—' }}</td>
                      <td class="muted">{{ rawClientHint(c) || '—' }}</td>
                      <td class="muted">{{ ymd(c.service_date) || '—' }}</td>
                      <td>
                        <span class="status-pill" :class="rawStatusPillClass({ normalized_status: c.from_status })">
                          {{ c.from_status || '—' }}
                        </span>
                        <span class="muted"> • {{ c.from_service_code || '—' }}</span>
                        <div v-if="rawAuditLocationLabel(c, 'from')" class="muted" style="margin-top: 4px;">{{ rawAuditLocationLabel(c, 'from') }}</div>
                      </td>
                      <td>
                        <span class="status-pill" :class="rawStatusPillClass({ normalized_status: c.to_status })">
                          {{ c.to_status || '—' }}
                        </span>
                        <span class="muted"> • {{ c.to_service_code || '—' }}</span>
                        <div v-if="rawAuditLocationLabel(c, 'to')" class="muted" style="margin-top: 4px;">{{ rawAuditLocationLabel(c, 'to') }}</div>
                      </td>
                      <td class="right">{{ fmtNum(c.from_units || 0) }} → {{ fmtNum(c.to_units || 0) }}</td>
                      <td><strong>{{ c.paid_state || 'UNPAID' }}</strong></td>
                      <td v-if="rawAuditHasDraftRows">
                        <select
                          v-if="rawAuditChangeCanToggleDraft(c)"
                          :disabled="isPeriodPosted || isRawAuditHistoricalRun || rawAuditDraftUnpaidUpdating === (c.metadata_json?.compareRowId)"
                          :value="c.to_status === 'DRAFT_PAID' ? 'payable' : 'not_payable'"
                          @change="rawAuditToggleDraftPayable(c, $event.target.value === 'payable')"
                        >
                          <option value="payable">Payable (default)</option>
                          <option value="not_payable">Not payable</option>
                        </select>
                        <span v-else class="muted">—</span>
                      </td>
                      <td>
                        <button type="button" class="btn btn-secondary btn-sm" @click="openRawRowNotes(c)">Notes</button>
                      </td>
                    </tr>
                    <tr v-if="!rawAuditChangesLimited.length">
                      <td :colspan="rawAuditHasDraftRows ? 10 : 9" class="muted">No run-to-run changes found for this selection.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                v-if="rawMode !== 'missed_appts_paid_in_full' && rawAddToCurrentPeriodFiltered.length > 0 && rawAuditBaselineImportId !== rawAuditSelectedImportId"
                class="card"
                style="margin-top: 12px; padding: 12px;"
              >
                <strong>Add to current period</strong>
                <div class="hint muted" style="margin-top: 4px;">
                  {{ rawAddToCurrentPeriodFiltered.length }} actionable row(s). Review flagged rows, choose whether to add or reduce them, then apply to the destination period.
                </div>
                <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr auto;">
                  <div class="field">
                    <label>Destination period</label>
                    <select v-model="rawAddToCurrentPeriodDestinationId" :disabled="rawAddToCurrentPeriodApplying">
                      <option :value="null" disabled>Select pay period…</option>
                      <option v-for="p in rawAddToCurrentPeriodDestOptions" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                    </select>
                  </div>
                  <div class="field" style="align-self: flex-end;">
                    <button
                      class="btn btn-primary"
                      @click="applyRawAddToCurrentPeriod"
                      :disabled="rawAddToCurrentPeriodApplying || !rawAddToCurrentPeriodDestinationId || rawAddToCurrentPeriodSelectedCount === 0 || isRawAddToCurrentPeriodDestPosted"
                    >
                      {{ rawAddToCurrentPeriodApplying ? 'Applying…' : 'Apply selected to current period' }}
                    </button>
                  </div>
                </div>
                <div v-if="rawAddToCurrentPeriodError" class="warn-box" style="margin-top: 8px;">{{ rawAddToCurrentPeriodError }}</div>
                <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr auto;">
                  <div class="field">
                    <label>Search actionable rows</label>
                    <input v-model="rawAddToCurrentPeriodSearch" type="text" placeholder="Search provider, client, code, location, change…" />
                  </div>
                  <div class="hint muted" style="align-self: end;">
                    {{ rawAddToCurrentPeriodSelectedCount }} selected
                  </div>
                </div>
                <table class="table" style="margin-top: 10px; font-size: 0.9em;">
                  <thead>
                    <tr>
                      <th class="th-sortable" @click="toggleRawAddToCurrentPeriodSort('provider_name')">Provider <span class="th-sort-indicator">{{ rawAddToCurrentPeriodSortIndicator('provider_name') }}</span></th>
                      <th class="th-sortable" @click="toggleRawAddToCurrentPeriodSort('client')">Client <span class="th-sort-indicator">{{ rawAddToCurrentPeriodSortIndicator('client') }}</span></th>
                      <th class="th-sortable" @click="toggleRawAddToCurrentPeriodSort('service_date')">DOS <span class="th-sort-indicator">{{ rawAddToCurrentPeriodSortIndicator('service_date') }}</span></th>
                      <th class="th-sortable" @click="toggleRawAddToCurrentPeriodSort('service_code')">Service code <span class="th-sort-indicator">{{ rawAddToCurrentPeriodSortIndicator('service_code') }}</span></th>
                      <th class="th-sortable" @click="toggleRawAddToCurrentPeriodSort('location')">Location <span class="th-sort-indicator">{{ rawAddToCurrentPeriodSortIndicator('location') }}</span></th>
                      <th class="th-sortable" @click="toggleRawAddToCurrentPeriodSort('change')">Change <span class="th-sort-indicator">{{ rawAddToCurrentPeriodSortIndicator('change') }}</span></th>
                      <th class="th-sortable" @click="toggleRawAddToCurrentPeriodSort('type')">Type <span class="th-sort-indicator">{{ rawAddToCurrentPeriodSortIndicator('type') }}</span></th>
                      <th class="th-sortable right" @click="toggleRawAddToCurrentPeriodSort('units')">Units <span class="th-sort-indicator">{{ rawAddToCurrentPeriodSortIndicator('units') }}</span></th>
                      <th>Action</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in rawAddToCurrentPeriodFiltered" :key="c.rowMatchKey" :style="rawAddToCurrentPeriodRowAction(c) === 'skip' ? { opacity: 0.55 } : {}">
                      <td>{{ c.provider_name || getUserName(c.user_id) }}</td>
                      <td class="muted">{{ rawClientHint(c) || '—' }}</td>
                      <td class="muted">{{ ymd(c.service_date) || '—' }}</td>
                      <td>{{ c.to_service_code || c.from_service_code || '—' }}</td>
                      <td class="muted">{{ rawAuditLocationLabel(c, 'to') || rawAuditLocationLabel(c, 'from') || '—' }}</td>
                      <td>{{ rawChangeTypeLabel(c.changeType) }}</td>
                      <td><span class="badge badge-success">{{ rawAuditPayableTypeBadge(c) }}</span></td>
                      <td class="right">
                        <input type="number" :value="rawAddToCurrentPeriodRowUnits(c)" @input="rawAddToCurrentPeriodSetRowUnits(c, $event.target.value)" min="0" step="0.01" style="width: 80px; text-align: right;" />
                      </td>
                      <td>
                        <select :value="rawAddToCurrentPeriodRowAction(c)" @change="rawAddToCurrentPeriodSetRowAction(c, $event.target.value)">
                          <option v-for="opt in rawAddToCurrentPeriodActionOptions(c)" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                        </select>
                      </td>
                      <td>
                        <button type="button" class="btn btn-secondary btn-sm" @click="openRawRowNotes(c)">Notes</button>
                      </td>
                    </tr>
                    <tr v-if="!rawAddToCurrentPeriodFiltered.length">
                      <td colspan="10" class="muted">No actionable rows found.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                v-if="rawMode !== 'missed_appts_paid_in_full'"
                class="actions"
                style="margin-top: 10px; justify-content: space-between; align-items: center;"
              >
                <div style="display: flex; align-items: center; gap: 10px;" v-if="rawModeRows.length">
                  <div class="hint">
                    Showing {{ Math.min(rawModeRows.length, rawRowLimit) }} of {{ rawModeRows.length }} rows.
                  </div>
                  <label class="muted" style="display: inline-flex; align-items: center; gap: 6px;">
                    Show
                    <select v-model.number="rawRowLimit">
                      <option :value="200">200</option>
                      <option :value="500">500</option>
                      <option :value="1000">1000</option>
                      <option :value="rawModeRows.length">All</option>
                    </select>
                  </label>
                </div>
                <div class="actions" style="margin: 0;" v-if="rawModeRows.length > rawRowLimit">
                  <button type="button" class="btn btn-secondary btn-sm" @click="showNextRawRows">
                    Show next 200
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" style="margin-left: 8px;" @click="rawRowLimit = rawModeRows.length">
                    Show all
                  </button>
                </div>
              </div>
            </div>
            </div>
          </div>
        </teleport>

        <teleport to="body">
          <div v-if="rawRowNotesOpen" class="modal-backdrop" @click.self="rawRowNotesOpen = false">
            <div class="modal" style="width: min(92vw, 720px);">
              <div class="modal-header">
                <div>
                  <div class="modal-title">Raw Import Notes</div>
                  <div class="hint">{{ rawRowNotesContext }}</div>
                </div>
                <div class="actions" style="margin: 0;">
                  <button class="btn btn-secondary btn-sm" @click="rawRowNotesOpen = false">Close</button>
                </div>
              </div>
              <div v-if="rawRowNotesError" class="warn-box" style="margin-top: 10px;">{{ rawRowNotesError }}</div>
              <div class="field" style="margin-top: 10px;">
                <label>Add note</label>
                <textarea v-model="rawRowNoteDraft" rows="3" placeholder="Add a payroll note with context for future review…"></textarea>
              </div>
              <div class="actions" style="margin-top: 10px;">
                <button class="btn btn-primary" :disabled="rawRowNotesSaving || !String(rawRowNoteDraft || '').trim()" @click="saveRawRowNote">
                  {{ rawRowNotesSaving ? 'Saving…' : 'Save note' }}
                </button>
              </div>
              <div style="margin-top: 14px;">
                <strong>History</strong>
                <div v-if="rawRowNotesLoading" class="muted" style="margin-top: 8px;">Loading notes…</div>
                <div v-else-if="!rawRowNotes.length" class="muted" style="margin-top: 8px;">No notes yet.</div>
                <div v-else class="stack" style="margin-top: 10px;">
                  <div v-for="n in rawRowNotes" :key="n.id" class="card" style="padding: 10px; margin-top: 8px;">
                    <div style="display: flex; justify-content: space-between; gap: 10px;">
                      <strong>{{ n.authorName || 'Unknown user' }}</strong>
                      <span class="muted">{{ n.changedAt ? fmtDateTime(n.changedAt) : 'Unknown time' }}</span>
                    </div>
                    <div style="margin-top: 6px; white-space: pre-wrap;">{{ n.note }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </teleport>

        <!-- Runs Side-by-Side (Audit) modal -->
        <teleport to="body">
          <div v-if="showRunsSideBySideModal" class="modal-backdrop" @click.self="confirmClose(() => { showRunsSideBySideModal = false; })">
            <div class="modal" style="width: min(95vw, 1200px); max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;">
              <div class="modal-header">
                <div>
                  <div class="modal-title">Runs Side-by-Side (Audit)</div>
                  <div class="hint">
                    Clinician, service, date, client, units, and status for Run 1, Run 2, Run 3. Rows that appear only in Run 2 or Run 3 show as late adds.
                  </div>
                </div>
                <button class="btn btn-secondary btn-sm" @click="confirmClose(() => { showRunsSideBySideModal = false; })">Close</button>
              </div>
              <div v-if="runsSideBySideLoading" class="hint" style="padding: 20px;">Loading…</div>
              <div v-else-if="runsSideBySideData?.rows?.length" class="table-wrap" style="flex: 1; overflow: auto; padding: 0 16px 16px;">
                <div class="field-row" style="margin-bottom: 10px; grid-template-columns: 1fr auto; align-items: center; gap: 12px;">
                  <div class="field" style="margin: 0;">
                    <input
                      v-model="runsSideBySideSearch"
                      type="text"
                      placeholder="Search clinician, service code, client, date, status…"
                      class="input"
                      style="width: 100%;"
                    />
                  </div>
                  <div class="hint" style="margin: 0;">
                    {{ periodRangeLabel(runsSideBySideData.period) }} — {{ runsSideBySideFilteredRows.length }} of {{ runsSideBySideData.rows.length }} row(s)
                  </div>
                </div>
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th class="th-sortable" @click="toggleRunsSideBySideSort('provider_name')">Clinician{{ runsSideBySideSortIndicator('provider_name') }}</th>
                      <th class="th-sortable" @click="toggleRunsSideBySideSort('service_code')">Service{{ runsSideBySideSortIndicator('service_code') }}</th>
                      <th class="th-sortable" @click="toggleRunsSideBySideSort('service_date')">Date{{ runsSideBySideSortIndicator('service_date') }}</th>
                      <th class="th-sortable" @click="toggleRunsSideBySideSort('client_hint')">Client{{ runsSideBySideSortIndicator('client_hint') }}</th>
                      <th class="th-sortable right" @click="toggleRunsSideBySideSort('run1_units')">Run 1 Units{{ runsSideBySideSortIndicator('run1_units') }}</th>
                      <th class="th-sortable" @click="toggleRunsSideBySideSort('run1_status')">Run 1 Status{{ runsSideBySideSortIndicator('run1_status') }}</th>
                      <th class="th-sortable right" @click="toggleRunsSideBySideSort('run2_units')">Run 2 Units{{ runsSideBySideSortIndicator('run2_units') }}</th>
                      <th class="th-sortable" @click="toggleRunsSideBySideSort('run2_status')">Run 2 Status{{ runsSideBySideSortIndicator('run2_status') }}</th>
                      <th class="th-sortable right" @click="toggleRunsSideBySideSort('run3_units')">Run 3 Units{{ runsSideBySideSortIndicator('run3_units') }}</th>
                      <th class="th-sortable" @click="toggleRunsSideBySideSort('run3_status')">Run 3 Status{{ runsSideBySideSortIndicator('run3_status') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, idx) in runsSideBySideFilteredRows" :key="idx">
                      <td>{{ r.provider_name || '—' }}</td>
                      <td>{{ r.service_code || '—' }}</td>
                      <td class="muted">{{ r.service_date || '—' }}</td>
                      <td class="muted">{{ r.client_hint || '—' }}</td>
                      <td class="right">{{ r.run1_units != null ? fmtNum(r.run1_units) : '—' }}</td>
                      <td>
                        <span v-if="r.run1_status" class="status-pill" :class="rawStatusPillClass({ normalized_status: r.run1_status })">{{ r.run1_status }}</span>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="right">{{ r.run2_units != null ? fmtNum(r.run2_units) : '—' }}</td>
                      <td>
                        <span v-if="r.run2_status" class="status-pill" :class="rawStatusPillClass({ normalized_status: r.run2_status })">{{ r.run2_status }}</span>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="right">{{ r.run3_units != null ? fmtNum(r.run3_units) : '—' }}</td>
                      <td>
                        <span v-if="r.run3_status" class="status-pill" :class="rawStatusPillClass({ normalized_status: r.run3_status })">{{ r.run3_status }}</span>
                        <span v-else class="muted">—</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="hint" style="padding: 20px;">
                {{ runsSideBySideData && !runsSideBySideData.rows?.length ? 'No imports for this period.' : 'Select a pay period and click the button to load.' }}
              </div>
            </div>
          </div>
        </teleport>

        <!-- No-note/Draft Unpaid carryover modal -->
        <teleport to="body">
          <div v-if="showCarryoverModal" class="modal-backdrop" @click.self="confirmClose(() => { showCarryoverModal = false; })">
            <div class="modal">
            <div class="modal-header">
              <div>
                <div class="modal-title">No-note/Draft Unpaid (Detect Changes)</div>
                <div class="hint">
                  Select the prior pay period and compare two “Run Payroll” snapshots. If No-note/Draft unpaid drops, those units are treated as “Old Done Notes” to add into the current pay period.
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" @click="confirmClose(() => { showCarryoverModal = false; })">Close</button>
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
                  <option v-for="r in carryoverRuns" :key="r.id" :value="r.id">{{ carryoverRunLabelById[r.id] || fmtDateTime(r.ran_at) }}</option>
                </select>
              </div>
              <div class="field">
                <label>Compare run (used as “after”)</label>
                <select v-model="carryoverCompareRunId" :disabled="carryoverLoading || !carryoverRuns.length">
                  <option :value="null" disabled>Select compare run…</option>
                  <option v-for="r in carryoverRuns" :key="r.id" :value="r.id">{{ carryoverRunLabelById[r.id] || fmtDateTime(r.ran_at) }}</option>
                </select>
              </div>
              <div class="field">
                <label>Tip</label>
                <div class="hint">Defaults to previous run → latest run. If the prior period was only run once, there may be no changes to detect.</div>
              </div>
            </div>

            <div v-if="carryoverMultiPeriodLoading" class="muted" style="margin-top: 10px;">Loading 2 ago vs 1 ago comparison…</div>
            <div v-if="!carryoverMultiPeriodLoading && (carryoverPriorPeriods || []).length" class="card" style="margin-top: 10px;">
              <h3 class="section-title" style="margin-top: 0;">2 payrolls ago vs 1 payroll ago vs today</h3>
              <div class="hint">
                Comparison across prior periods. Each section shows late-note completions and still-unpaid for that prior period.
              </div>
              <div v-for="(pp, idx) in carryoverPriorPeriods" :key="pp.priorPeriodId" class="period-block" style="margin-top: 12px; padding: 10px; border: 1px solid var(--border); border-radius: 6px;">
                <div class="field-row" style="grid-template-columns: 1fr auto;">
                  <span class="period-label"><strong>{{ idx === 0 ? '2 payrolls ago' : '1 payroll ago' }}</strong> — {{ pp.prior?.period_start ? pp.prior.period_start.slice(0, 10) : '' }} → {{ pp.prior?.period_end ? pp.prior.period_end.slice(0, 10) : '' }}</span>
                  <span class="muted">{{ (pp.deltas || []).length }} delta(s), {{ (pp.stillUnpaid || []).length }} still unpaid</span>
                </div>
                <div class="table-wrap" style="margin-top: 8px;">
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Code</th>
                        <th class="right">Prev Unpaid</th>
                        <th class="right">Cur Unpaid</th>
                        <th class="right">Finalized Δ</th>
                        <th>Type</th>
                        <th class="right">Carry</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(d, i) in (pp.deltas || []).slice(0, 15)" :key="i">
                        <td>{{ d.lastName ? `${d.lastName}, ${d.firstName || ''}` : (d.providerName || '—') }}</td>
                        <td>{{ d.serviceCode }}</td>
                        <td class="right">{{ fmtNum(d.prevUnpaidUnits) }}</td>
                        <td class="right">{{ fmtNum(d.currUnpaidUnits) }}</td>
                        <td class="right">{{ fmtNum(d.finalizedDelta ?? 0) }}</td>
                        <td class="muted">{{ d.type === 'late_note_completion' ? 'Late note' : (d.type || '—') }}</td>
                        <td class="right">{{ fmtNum(d.carryoverFinalizedUnits) }}</td>
                      </tr>
                      <tr v-if="(pp.deltas || []).length > 15">
                        <td colspan="7" class="muted">… and {{ (pp.deltas || []).length - 15 }} more</td>
                      </tr>
                      <tr v-if="!(pp.deltas || []).length">
                        <td colspan="7" class="muted">No changes detected.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-if="(pp.stillUnpaid || []).length" class="hint" style="margin-top: 6px;">
                  Still unpaid: {{ (pp.stillUnpaid || []).map((s) => `${s.serviceCode} (${fmtNum(s.stillUnpaidUnits)})`).join(', ') }}
                </div>
              </div>
            </div>

            <div v-if="carryoverError" class="error-box">{{ carryoverError }}</div>
            <div v-if="carryoverApplyResult" class="warn-box" style="margin-top: 10px;">
              <div><strong>Applied carryover:</strong> {{ Number(carryoverApplyResult.inserted || 0) }} row(s) added to payroll stage.</div>
              <div v-if="(carryoverApplyResult.warnings || []).length" class="hint" style="margin-top: 6px;">
                <div><strong>Warnings:</strong></div>
                <div v-for="(w, idx) in (carryoverApplyResult.warnings || [])" :key="idx">
                  - {{ w?.message || String(w) }}
                </div>
              </div>
              <div class="hint" style="margin-top: 6px;">
                Next: open <strong>Payroll Stage</strong> and verify the destination staging rows (especially H0031/H0032) before running payroll.
              </div>
            </div>

            <div v-if="!isPeriodPosted && (carryoverDraftReviewFiltered || []).length" class="card" style="margin-top: 10px;">
              <h3 class="section-title" style="margin-top: 0;">Draft items needing confirmation</h3>
              <div class="hint">
                These are <strong>DRAFT</strong> rows in the <strong>current</strong> pay period that match a prior <strong>NO_NOTE</strong> or a prior <strong>DRAFT not payable</strong>.
                Confirm whether each draft should be payable. Finalized rows are not shown here.
              </div>

              <div class="field-row" style="grid-template-columns: 1fr auto; align-items: end; margin-top: 10px;">
                <div class="field">
                  <label>Search</label>
                  <input v-model="carryoverDraftReviewSearch" type="text" placeholder="Search provider / code / DOS / client…" />
                </div>
                <div class="hint muted">Showing {{ carryoverDraftReviewFiltered.length }} row(s)</div>
              </div>

              <div class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th style="width: 90px;">Client</th>
                      <th style="width: 110px;">Code</th>
                      <th style="width: 120px;">DOS</th>
                      <th class="right" style="width: 110px;">Units</th>
                      <th style="width: 170px;">Current draft payable?</th>
                      <th>Why flagged</th>
                      <th style="width: 210px;">Prior</th>
                      <th style="width: 240px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in carryoverDraftReviewFiltered" :key="r.rowId">
                      <td>{{ r.providerName || '—' }}</td>
                      <td class="muted">{{ r.clientHint || '—' }}</td>
                      <td>{{ r.serviceCode || '—' }}</td>
                      <td class="muted">{{ r.serviceDate || '—' }}</td>
                      <td class="right">{{ fmtNum(Number(r.unitCount || 0)) }}</td>
                      <td>
                        <span v-if="Number(r.draftPayable) === 1">Payable</span>
                        <span v-else class="muted">Not payable</span>
                      </td>
                      <td>
                        <div v-for="(c, idx) in (r.reasons || [])" :key="`${r.rowId}:reason:${idx}`" class="muted">
                          - {{ carryoverDraftReasonLabel(c) }}
                        </div>
                      </td>
                      <td class="muted">
                        <div v-for="(p, idx) in (r.prior || []).slice(0, 2)" :key="`${r.rowId}:prior:${idx}`">
                          {{ p.periodStart }}→{{ p.periodEnd }} • {{ p.noteStatus }}{{ p.noteStatus === 'DRAFT' ? (p.draftPayable ? ' (payable)' : ' (not payable)') : '' }}
                        </div>
                      </td>
                      <td class="right">
                        <button
                          class="btn btn-secondary btn-sm"
                          type="button"
                          @click="setDraftPayableByRowId(r.rowId, true)"
                          :disabled="updatingDraftPayable || updatingCarryoverDraftRowId === r.rowId"
                        >
                          Mark payable
                        </button>
                        <button
                          class="btn btn-secondary btn-sm"
                          type="button"
                          style="margin-left: 8px;"
                          @click="setDraftPayableByRowId(r.rowId, false)"
                          :disabled="updatingDraftPayable || updatingCarryoverDraftRowId === r.rowId"
                        >
                          Mark not payable
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-if="carryoverLoading" class="muted">Computing differences...</div>
            <div v-if="!carryoverLoading" class="table-wrap">
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
                  <tr
                    v-for="(d, idx) in carryoverPreview"
                    :key="idx"
                  >
                    <td>{{ d.lastName ? `${d.lastName}, ${d.firstName || ''}` : (d.providerName || '—') }}</td>
                    <td>{{ d.serviceCode }}</td>
                    <td class="right">{{ fmtNum(d.prevUnpaidUnits) }}</td>
                    <td class="right">{{ fmtNum(d.currUnpaidUnits) }}</td>
                    <td class="right">{{ fmtNum(d.finalizedDelta ?? 0) }}</td>
                    <td>
                      <span v-if="d.type === 'manual'">Manual entry</span>
                      <span v-else-if="d.type === 'late_note_completion'">Late note completion</span>
                      <span v-else-if="d.type === 'code_changed'">
                        Code changed
                        <span v-if="d.codeChangedStatus" class="muted">({{ d.codeChangedStatus }})</span>
                        <span v-if="d.fromServiceCode && d.toServiceCode" class="muted"> • {{ d.fromServiceCode }} → {{ d.toServiceCode }}</span>
                      </span>
                      <span v-else-if="d.type === 'late_added_service'">
                        Late added service
                        <span v-if="d.lateAddedStatus" class="muted">({{ d.lateAddedStatus }})</span>
                      </span>
                      <span v-else>—</span>
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
        </teleport>

      </div>

      <div class="card" v-if="!selectedPeriod">
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

      <!-- Payroll To-Dos modal -->
      <teleport to="body">
        <div v-if="false && showTodoModal" class="modal-backdrop">
          <div class="modal" style="width: min(920px, 100%);">
            <div class="modal-header">
              <div>
                <div class="modal-title">Payroll To‑Dos</div>
                <div class="hint">These block running payroll until marked Done.</div>
              </div>
              <div class="actions" style="margin: 0;">
                <button class="btn btn-secondary btn-sm" type="button" @click="showTodoModal = false">Close</button>
              </div>
            </div>

            <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
              <button class="btn btn-secondary btn-sm" type="button" @click="todoTab = 'period'">This pay period</button>
              <button class="btn btn-secondary btn-sm" type="button" @click="todoTab = 'templates'">Recurring templates</button>
            </div>

            <div v-if="todoTab === 'period'">
              <div class="card" style="margin-top: 12px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Add a To‑Do (single)</h3>
                <div class="field-row" style="grid-template-columns: 180px 1fr; margin-top: 10px;">
                  <div class="field">
                    <label>Scope</label>
                    <select v-model="newTodoDraft.scope">
                      <option value="agency">Agency-wide</option>
                      <option value="provider">Per-provider</option>
                    </select>
                  </div>
                  <div v-if="newTodoDraft.scope === 'provider'" class="field">
                    <label>Provider</label>
                    <select v-model="newTodoDraft.targetUserId">
                      <option :value="null">Select provider…</option>
                      <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                    </select>
                  </div>
                </div>
                <div class="field" style="margin-top: 10px;">
                  <label>Title</label>
                  <input v-model="newTodoDraft.title" type="text" placeholder="e.g., Verify X before running payroll" />
                </div>
                <div class="field" style="margin-top: 10px;">
                  <label>Description (optional)</label>
                  <textarea v-model="newTodoDraft.description" rows="3" placeholder="Optional details…" />
                </div>
                <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                  <button class="btn btn-primary" type="button" @click="createTodoForPeriod" :disabled="!String(newTodoDraft.title||'').trim()">
                    Add To‑Do
                  </button>
                </div>
              </div>

              <div class="card" style="margin-top: 12px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">To‑Dos for this pay period</h3>
                <div v-if="payrollTodosError" class="warn-box" style="margin-top: 8px;">{{ payrollTodosError }}</div>
                <div v-if="payrollTodosLoading" class="muted" style="margin-top: 8px;">Loading…</div>
                <div v-else-if="!(payrollTodos||[]).length" class="muted" style="margin-top: 8px;">No To‑Dos yet.</div>
                <div v-else class="table-wrap" style="margin-top: 10px;">
                  <table class="table">
                    <thead>
                      <tr>
                        <th style="width: 90px;">Done</th>
                        <th>To‑Do</th>
                        <th style="width: 220px;">Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="t in payrollTodos" :key="t.id">
                        <td>
                          <input
                            type="checkbox"
                            :checked="String(t.status || '').toLowerCase() === 'done'"
                            :disabled="updatingPayrollTodoId === t.id"
                            @change="togglePayrollTodoDone(t, $event.target.checked)"
                          />
                        </td>
                        <td>
                          <div><strong>{{ t.title }}</strong></div>
                          <div v-if="t.description" class="muted" style="margin-top: 4px;">{{ t.description }}</div>
                        </td>
                        <td class="muted">
                          <span v-if="String(t.scope||'agency')==='provider'">Provider: {{ nameForUserId(Number(t.target_user_id || 0)) }}</span>
                          <span v-else>Agency-wide</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div v-else>
              <div class="card" style="margin-top: 12px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Create recurring template</h3>
                <div v-if="todoTemplatesError" class="warn-box" style="margin-top: 8px;">{{ todoTemplatesError }}</div>
                <div class="field-row" style="grid-template-columns: 180px 1fr; margin-top: 10px;">
                  <div class="field">
                    <label>Scope</label>
                    <select v-model="templateDraft.scope">
                      <option value="agency">Agency-wide</option>
                      <option value="provider">Per-provider</option>
                    </select>
                  </div>
                  <div v-if="templateDraft.scope === 'provider'" class="field">
                    <label>Provider</label>
                    <select v-model="templateDraft.targetUserId">
                      <option :value="null">Select provider…</option>
                      <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                    </select>
                  </div>
                </div>
                <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
                  <div class="field">
                    <label>Start at pay period</label>
                    <select v-model="templateDraft.startPayrollPeriodId">
                      <option :value="null">Start immediately</option>
                      <option v-for="p in periodsForSelect" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Active</label>
                    <select v-model="templateDraft.isActive">
                      <option :value="true">Active</option>
                      <option :value="false">Inactive</option>
                    </select>
                  </div>
                </div>
                <div class="field" style="margin-top: 10px;">
                  <label>Title</label>
                  <input v-model="templateDraft.title" type="text" placeholder="e.g., Confirm XYZ is correct" />
                </div>
                <div class="field" style="margin-top: 10px;">
                  <label>Description (optional)</label>
                  <textarea v-model="templateDraft.description" rows="3" placeholder="Optional details…" />
                </div>
                <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                  <button class="btn btn-primary" type="button" @click="createTodoTemplate" :disabled="savingTodoTemplate || !String(templateDraft.title||'').trim()">
                    {{ savingTodoTemplate ? 'Saving…' : 'Create template' }}
                  </button>
                </div>
              </div>

              <div class="card" style="margin-top: 12px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Templates</h3>
                <div v-if="todoTemplatesLoading" class="muted" style="margin-top: 8px;">Loading templates…</div>
                <div v-else-if="!(todoTemplates||[]).length" class="muted" style="margin-top: 8px;">No templates yet.</div>
                <div v-else class="table-wrap" style="margin-top: 10px;">
                  <table class="table">
                    <thead>
                      <tr>
                        <th style="width: 90px;">Active</th>
                        <th>Template</th>
                        <th style="width: 240px;">Starts</th>
                        <th style="width: 120px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="t in todoTemplates" :key="t.id">
                        <td>
                          <input
                            type="checkbox"
                            :checked="Number(t.is_active) === 1"
                            :disabled="deletingTodoTemplateId === t.id"
                            @change="toggleTodoTemplateActive(t, $event.target.checked)"
                          />
                        </td>
                        <td>
                          <div><strong>{{ t.title }}</strong></div>
                          <div class="muted" style="margin-top: 4px;">
                            <span v-if="String(t.scope||'agency')==='provider'">Provider: {{ nameForUserId(Number(t.target_user_id || 0)) }}</span>
                            <span v-else>Agency-wide</span>
                          </div>
                          <div v-if="t.description" class="muted" style="margin-top: 4px;">{{ t.description }}</div>
                        </td>
                        <td class="muted">
                          <span v-if="Number(t.start_payroll_period_id||0) > 0">From period #{{ t.start_payroll_period_id }}</span>
                          <span v-else>Immediately</span>
                        </td>
                        <td class="right">
                          <button class="btn btn-danger btn-sm" type="button" :disabled="deletingTodoTemplateId === t.id" @click="deleteTodoTemplate(t)">
                            {{ deletingTodoTemplateId === t.id ? 'Deleting…' : 'Delete' }}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </teleport>

      <!-- Payroll Wizard modal (no click-out close) -->
      <teleport to="body">
        <div v-if="false && showPayrollWizardModal" class="modal-backdrop">
          <div class="modal" style="width: min(980px, 100%);">
            <div class="modal-header">
              <div>
                <div class="modal-title">Payroll Wizard</div>
                <div class="hint">Step-by-step guide. Save anytime; no click-out close.</div>
              </div>
              <div class="actions" style="margin: 0;">
                <button class="btn btn-secondary btn-sm" type="button" @click="wizardSaveAndExit" :disabled="wizardSaving">Save edits & exit</button>
                <button class="btn btn-danger btn-sm" type="button" @click="wizardDiscardAndExit" :disabled="wizardSaving" style="margin-left: 8px;">Don’t save & exit</button>
              </div>
            </div>

            <div v-if="wizardError" class="warn-box" style="margin-top: 10px;">{{ wizardError }}</div>
            <div v-if="wizardLoading" class="muted" style="margin-top: 10px;">Loading wizard…</div>
            <div v-else style="margin-top: 10px;">
              <div class="card">
                <div class="hint" style="font-weight: 700;">Step {{ wizardStepIdx + 1 }} of {{ wizardSteps.length }} — {{ wizardStep?.title }}</div>
                <div class="hint" style="margin-top: 6px;">You can use Back/Next; the wizard saves progress as you move.</div>
              </div>

              <div class="card" style="margin-top: 12px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Current step actions</h3>

              <div v-if="wizardStep?.key === 'prior'" class="hint">
                Post the <strong>prior</strong> pay period first so you can properly process late notes/changes.
                Then use <strong>Process Changes</strong> to re-run the prior report and compare “then → now”.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardGoToProcessChanges" :disabled="!selectedPeriodId">Go to Process Changes</button>
                  </div>
                </div>

              <div v-else-if="wizardStep?.key === 'apply'" class="hint">
                Post the <strong>differences</strong> into the current pay period (carryover), then continue.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="openCarryoverModal" :disabled="!selectedPeriodId || isPeriodPosted">Open carryover tool</button>
                  <button class="btn btn-secondary" type="button" @click="showStageModal = true" :disabled="!selectedPeriodId" style="margin-left: 8px;">Open Payroll Stage</button>
                  </div>
                </div>

              <div v-else-if="wizardStep?.key === 'review'" class="hint">
                Review what changed (No-note/Draft unpaid → Old Done Notes) before running payroll.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="openCarryoverModal" :disabled="!selectedPeriodId || isPeriodPosted">Open No-note/Draft Unpaid</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'drafts'" class="hint">
                  Edit draft-payable decisions in Raw Import (Draft Audit).
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('draft_audit')" :disabled="!selectedPeriodId">Open Raw Import (Draft Audit)</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'h0031'" class="hint">
                  Process H0031 minutes + mark Done.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h0031')" :disabled="!selectedPeriodId">Open Raw Import (H0031)</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'h0032'" class="hint">
                  Process H0032 minutes + mark Done.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h0032')" :disabled="!selectedPeriodId">Open Raw Import (H0032)</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'h2014'" class="hint">
                  Process H2014 minutes + mark Done.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h2014')" :disabled="!selectedPeriodId">Open Raw Import (H2014)</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === '90853'" class="hint">
                  Process 90853 (group therapy) minutes + mark Done.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_90853')" :disabled="!selectedPeriodId">Open Raw Import (90853)</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'h2032'" class="hint">
                  Process H2032 minutes + mark Done.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h2032')" :disabled="!selectedPeriodId">Open Raw Import (H2032)</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'stage'" class="hint">
                  Review Payroll Stage workspace edits, claims, To‑Dos, and adjustments.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="showStageModal = true" :disabled="!selectedPeriodId">Open Payroll Stage</button>
                    <button class="btn btn-secondary" type="button" @click="openTodoModal" :disabled="!selectedPeriodId" style="margin-left: 8px;">Manage To‑Dos</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'run'" class="hint">
                  Run payroll to compute totals (blocked if To‑Dos or submissions are pending).
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-primary" type="button" @click="runPayroll" :disabled="runningPayroll || isPeriodPosted || !selectedPeriodId">
                      {{ runningPayroll ? 'Running…' : 'Run Payroll' }}
                    </button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'preview'" class="hint">
                  Preview provider view + post-time notifications.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="openPreviewPostModalV2" :disabled="!selectedPeriodId || !canSeeRunResults">Open Preview Post</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'post'" class="hint">
                  Post payroll to make it visible to providers.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-primary" type="button" @click="postPayroll" :disabled="postingPayroll || isPeriodPosted || selectedPeriodStatus !== 'ran'">
                      {{ postingPayroll ? 'Posting…' : 'Post Payroll' }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="actions" style="margin-top: 12px; justify-content: space-between;">
                <button class="btn btn-secondary" type="button" @click="wizardBack" :disabled="wizardStepIdx <= 0 || wizardSaving">Back</button>
                <button class="btn btn-primary" type="button" @click="wizardNext" :disabled="wizardStepIdx >= wizardSteps.length - 1 || wizardSaving">
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </teleport>
    </div>

    <!-- Rate Sheet Import removed (no longer needed) -->

    <!-- MedCancel Review Modal -->
    <teleport to="body">
      <div v-if="showMedcancelReviewModal" class="modal-backdrop" @click.self="showMedcancelReviewModal = false">
        <div class="modal" style="max-width: 600px;">
          <div class="modal-header">
            <div>
              <div class="modal-title">MedCancel Submission Details</div>
              <div class="hint" v-if="reviewedMedcancelClaim">
                {{ nameForUserId(reviewedMedcancelClaim.user_id) }} — {{ fmtClaimDate(reviewedMedcancelClaim.claim_date) }}
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" @click="showMedcancelReviewModal = false">Close</button>
          </div>
          <div v-if="reviewedMedcancelClaim" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
            <div class="field-row" style="grid-template-columns: 1fr 1fr;">
              <div class="field"><label>Date</label><div>{{ fmtClaimDate(reviewedMedcancelClaim.claim_date) }}</div></div>
              <div class="field"><label>Total Units</label><div>{{ fmtNum(Number(reviewedMedcancelClaim.units ?? 0)) }}</div></div>
            </div>
            <div class="field-row" style="grid-template-columns: 1fr 1fr;" v-if="reviewedMedcancelClaim.school_organization_id">
              <div class="field"><label>School/Org ID</label><div>{{ reviewedMedcancelClaim.school_organization_id }}</div></div>
            </div>

            <div v-if="(reviewedMedcancelClaim.items || []).length">
              <label style="font-weight: 600; font-size: 0.85em; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">Session Items</label>
              <div
                v-for="(it, idx) in reviewedMedcancelClaim.items"
                :key="idx"
                style="margin-top: 8px; padding: 10px 12px; background: #f8f9fa; border-radius: 6px;"
              >
                <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr;">
                  <div class="field"><label>Client Initials</label><div>{{ it.client_initials || it.clientInitials || '—' }}</div></div>
                  <div class="field"><label>Missed Service Code</label><div>{{ it.missed_service_code || it.missedServiceCode || '—' }}</div></div>
                  <div class="field"><label>Session Time</label><div>{{ it.session_time || it.sessionTime || '—' }}</div></div>
                </div>
                <div class="field" v-if="it.note" style="margin-top: 6px;"><label>Note</label><div>{{ it.note }}</div></div>
              </div>
            </div>
            <div v-else class="muted">No session detail items found.</div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr; border-top: 1px solid #eee; padding-top: 12px; margin-top: 4px;">
              <div class="field"><label>Submitted by</label><div>{{ submitterLabel(reviewedMedcancelClaim) }}</div></div>
              <div class="field"><label>Submitted on</label><div>{{ submittedAtYmd(reviewedMedcancelClaim) }}</div></div>
            </div>
            <div class="field" v-if="reviewedMedcancelClaim.rejection_reason" style="border-top: 1px solid #eee; padding-top: 12px;">
              <label>Admin Note / Send-back Reason</label>
              <div style="white-space: pre-wrap; color: #c05600;">{{ reviewedMedcancelClaim.rejection_reason }}</div>
            </div>
          </div>
          <div style="padding: 12px 16px; border-top: 1px solid #eee; display: flex; justify-content: flex-end;">
            <button class="btn btn-secondary" @click="showMedcancelReviewModal = false">Close</button>
          </div>
        </div>
      </div>
    </teleport>

    <!-- Event time edit modal -->
    <teleport to="body">
      <div v-if="eventTimeEditOpen" class="modal-backdrop" @click.self="closeEventTimeEdit">
        <div class="modal" style="width: min(560px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Edit event time</div>
              <div class="hint" v-if="eventTimeEditSubmission">
                {{ eventTimeEditSubmission.providerName || nameForUserId(eventTimeEditSubmission.userId) }}
                · {{ eventTimeEditSubmission.eventTitle || 'Event' }}
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" @click="closeEventTimeEdit">Close</button>
          </div>
          <div style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
            <div v-if="eventTimeEditError" class="warn-box">{{ eventTimeEditError }}</div>
            <!-- Show original values whenever they differ from the current values -->
            <div
              v-if="eventTimeEditOriginal"
              style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px;font-size:0.875rem;"
            >
              <strong>⚠ Changed from auto-submitted</strong>
              ({{ eventTimeEditSubmission?.lastEditedByRole || 'unknown' }} edited{{ eventTimeEditSubmission?.lastEditedAt ? ' ' + new Date(eventTimeEditSubmission.lastEditedAt).toLocaleString() : '' }})<br>
              Original: Direct {{ eventTimeEditOriginal.directHours ?? '—' }} h · Indirect {{ eventTimeEditOriginal.indirectHours ?? '—' }} h ·
              In {{ eventTimeEditOriginal.clockInAt ? new Date(eventTimeEditOriginal.clockInAt).toLocaleTimeString() : '—' }} ·
              Out {{ eventTimeEditOriginal.clockOutAt ? new Date(eventTimeEditOriginal.clockOutAt).toLocaleTimeString() : '—' }}
            </div>
            <!-- Late arrival warning -->
            <div
              v-if="eventTimeEditLateArrival"
              style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px;font-size:0.875rem;"
            >
              <strong>⏰ Late arrival detected</strong> — event started at {{ eventTimeEditLateArrival.eventStartDisplay }},
              employee clocked in <strong>{{ eventTimeEditLateArrival.lateMinutes }} min late</strong>.
              <span v-if="eventTimeEditLateArrival.adjustedCap != null">
                Adjusted direct cap: <strong>{{ eventTimeEditLateArrival.adjustedCap }} h</strong>
                (reduced from {{ eventTimeEditDirectCap }} h).
              </span>
              <div style="margin-top:6px;">
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  :disabled="eventTimeEditSaving"
                  @click="applyLateArrivalDeduction"
                >Apply late arrival deduction</button>
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
            <div class="actions" style="justify-content: flex-end; margin: 0;">
              <button class="btn btn-secondary" type="button" :disabled="eventTimeEditSaving" @click="closeEventTimeEdit">Cancel</button>
              <button class="btn btn-primary" type="button" :disabled="eventTimeEditSaving || !eventTimeEditPreview" @click="saveEventTimeEdit">
                {{ eventTimeEditSaving ? 'Saving…' : 'Save & recalculate' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </teleport>

    <!-- Time Claim Review Modal -->
    <teleport to="body">
      <div v-if="showTimeClaimReviewModal" class="modal-backdrop" @click.self="showTimeClaimReviewModal = false">
        <div class="modal" style="width: min(820px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Time Claim Details</div>
              <div class="hint" v-if="reviewedTimeClaim">
                {{ nameForUserId(reviewedTimeClaim.user_id) }} — {{ timeTypeLabel(reviewedTimeClaim) }} — {{ fmtClaimDate(reviewedTimeClaim.claim_date) }}
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" @click="showTimeClaimReviewModal = false">Close</button>
          </div>
          <div v-if="reviewedTimeClaim" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">

            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr;">
              <div class="field"><label>Claim ID</label><div>{{ reviewedTimeClaim.id || '—' }}</div></div>
              <div class="field"><label>Status</label><div>{{ String(reviewedTimeClaim.status || '—').toUpperCase() }}</div></div>
              <div class="field"><label>Claim date</label><div>{{ fmtClaimDate(reviewedTimeClaim.claim_date) }}</div></div>
            </div>
            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr;">
              <div class="field"><label>Requested time</label><div>{{ timeRequestedLabel(reviewedTimeClaim) }}</div></div>
              <div class="field"><label>Suggested pay period</label><div>{{ timeClaimPeriodLabel(reviewedTimeClaim.suggested_payroll_period_id) }}</div></div>
              <div class="field"><label>Target pay period</label><div>{{ timeClaimPeriodLabel(timeClaimReviewTargetPeriodId(reviewedTimeClaim)) }}</div></div>
            </div>
            <div
              v-if="String(reviewedTimeClaim.status || '').toLowerCase() === 'approved'"
              class="field-row"
              style="grid-template-columns: 1fr 1fr 1fr;"
            >
              <div class="field">
                <label>Bucket</label>
                <div>{{ String(reviewedTimeClaim.bucket || 'indirect').toLowerCase() === 'direct' ? 'Direct' : 'Indirect' }}</div>
              </div>
              <div class="field"><label>Hours / credits</label><div>{{ fmtNum(timeClaimHours(reviewedTimeClaim)) }}</div></div>
              <div class="field"><label>Applied amount</label><div>{{ fmtMoney(Number(reviewedTimeClaim.applied_amount || 0)) }}</div></div>
            </div>

            <!-- service_correction -->
            <template v-if="reviewedTimeClaim.claim_type === 'service_correction'">
              <div class="field-row" style="grid-template-columns: 1fr 1fr;">
                <div class="field"><label>Client Initials</label><div>{{ reviewedTimeClaim.payload?.clientInitials || '—' }}</div></div>
                <div class="field"><label>Duration</label><div>{{ reviewedTimeClaim.payload?.duration || '—' }}</div></div>
              </div>
              <div class="field-row" style="grid-template-columns: 1fr 1fr;">
                <div class="field"><label>Original Service</label><div>{{ reviewedTimeClaim.payload?.originalService || '—' }}</div></div>
                <div class="field"><label>Corrected Service</label><div>{{ reviewedTimeClaim.payload?.correctedService || '—' }}</div></div>
              </div>
              <div class="field"><label>Reason</label><div style="white-space: pre-wrap;">{{ reviewedTimeClaim.payload?.reason || '—' }}</div></div>
              <div class="field"><label>Attestation</label><div>{{ timeClaimBoolLabel(reviewedTimeClaim.payload?.attestation) }}</div></div>
            </template>

            <!-- overtime_evaluation -->
            <template v-else-if="reviewedTimeClaim.claim_type === 'overtime_evaluation'">
              <div class="field-row" style="grid-template-columns: 1fr 1fr;">
                <div class="field"><label>Worked Over 12h?</label><div>{{ timeClaimBoolLabel(reviewedTimeClaim.payload?.workedOver12Hours) }}</div></div>
                <div class="field"><label>Estimated Workweek Hours</label><div>{{ reviewedTimeClaim.payload?.estimatedWorkweekHours ?? '—' }}</div></div>
              </div>
              <div class="field">
                <label>Hours worked each day</label>
                <div class="field-row" style="grid-template-columns: repeat(7, 1fr); gap: 8px; margin-top: 6px;">
                  <div v-for="d in timeClaimOvertimeDayLabels" :key="d.key" class="field" style="margin: 0;">
                    <label style="font-size: 0.8em;">{{ d.label }}</label>
                    <div>{{ reviewedTimeClaim.payload?.daysHours?.[d.key] ?? '—' }}</div>
                  </div>
                </div>
              </div>
              <div class="field"><label>Dates &amp; Hours (submitted text)</label><div style="white-space: pre-wrap;">{{ reviewedTimeClaim.payload?.datesAndHours || '—' }}</div></div>
              <div class="field-row" style="grid-template-columns: 1fr 1fr;">
                <div class="field"><label>Overtime Approved?</label><div>{{ timeClaimBoolLabel(reviewedTimeClaim.payload?.overtimeApproved) }}</div></div>
                <div class="field"><label>Approved By</label><div>{{ reviewedTimeClaim.payload?.approvedBy || '—' }}</div></div>
              </div>
              <div class="field">
                <label>All direct service recorded in Therapy Notes?</label>
                <div>{{ timeClaimBoolLabel(reviewedTimeClaim.payload?.allDirectServiceRecorded) }}</div>
              </div>
              <div class="field"><label>Notes for Payroll</label><div style="white-space: pre-wrap;">{{ reviewedTimeClaim.payload?.notesForPayroll || '—' }}</div></div>
              <div class="field"><label>Attestation</label><div>{{ timeClaimBoolLabel(reviewedTimeClaim.payload?.attestation) }}</div></div>
            </template>

            <!-- training_focus_completion -->
            <template v-else-if="reviewedTimeClaim.claim_type === 'training_focus_completion'">
              <div class="field"><label>Training Focus</label><div>{{ reviewedTimeClaim.payload?.trainingFocusName || '—' }}</div></div>
              <div class="field-row" style="grid-template-columns: 1fr 1fr;">
                <div class="field"><label>Total Minutes</label><div>{{ reviewedTimeClaim.payload?.totalMinutes ?? '—' }}</div></div>
                <div class="field"><label>Completed</label><div>{{ reviewedTimeClaim.payload?.completedAt ? String(reviewedTimeClaim.payload.completedAt).slice(0, 10) : '—' }}</div></div>
              </div>
              <div v-if="Array.isArray(reviewedTimeClaim.payload?.stepBreakdown) && reviewedTimeClaim.payload.stepBreakdown.length" class="card" style="margin-top: 8px;">
                <h4 style="margin: 0 0 8px 0;">Step breakdown</h4>
                <div v-for="step in reviewedTimeClaim.payload.stepBreakdown" :key="step.stepId" style="font-size: 13px; margin-bottom: 6px;">
                  {{ step.title }} ({{ step.stepType }}) — {{ Math.floor((step.timeSpentSeconds || 0) / 60) }} min
                </div>
              </div>
            </template>

            <!-- indirect_time (hourly log) -->
            <template v-else-if="reviewedTimeClaim.claim_type === 'indirect_time'">
              <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr;">
                <div class="field"><label>Entry method</label><div>{{ reviewedTimeClaim.payload?.entryMethod || '—' }}</div></div>
                <div class="field"><label>Start</label><div>{{ reviewedTimeClaim.payload?.startTime || '—' }}</div></div>
                <div class="field"><label>End</label><div>{{ reviewedTimeClaim.payload?.endTime || '—' }}</div></div>
              </div>
              <div class="field"><label>Total Minutes</label><div>{{ reviewedTimeClaim.payload?.totalMinutes ?? '—' }}</div></div>
              <div v-if="Array.isArray(reviewedTimeClaim.payload?.allocations) && reviewedTimeClaim.payload.allocations.length" class="card" style="margin-top: 8px;">
                <h4 style="margin: 0 0 8px 0;">Allocations</h4>
                <div
                  v-for="(a, idx) in reviewedTimeClaim.payload.allocations"
                  :key="idx"
                  style="font-size: 13px; margin-bottom: 6px;"
                >
                  {{ a.serviceTypeLabel || a.label || 'Type' }} — {{ a.minutes ?? 0 }} min
                </div>
              </div>
              <div class="field"><label>Attestation</label><div>{{ timeClaimBoolLabel(reviewedTimeClaim.payload?.attestation) }}</div></div>
            </template>

            <!-- meeting_training / mentor_cpa_meeting -->
            <template v-else-if="reviewedTimeClaim.claim_type === 'meeting_training' || reviewedTimeClaim.claim_type === 'mentor_cpa_meeting'">
              <div class="field-row" style="grid-template-columns: 1fr 1fr;">
                <div class="field"><label>Attendance Type</label><div>{{ reviewedTimeClaim.payload?.meetingType || '—' }}</div></div>
                <div class="field"><label>Platform</label><div>{{ reviewedTimeClaim.payload?.platform || '—' }}</div></div>
              </div>
              <div
                v-if="reviewedTimeClaim.claim_type === 'mentor_cpa_meeting' || reviewedTimeClaim.payload?.mentorRole"
                class="field"
              >
                <label>Meeting with</label>
                <div>{{ timeClaimMentorRoleLabel(reviewedTimeClaim.payload?.mentorRole) }}</div>
              </div>
              <div
                v-if="String(reviewedTimeClaim.payload?.meetingType || '').trim() === 'Not listed'"
                class="field"
              >
                <label>Other meeting not listed</label>
                <div>{{ reviewedTimeClaim.payload?.otherMeeting || '—' }}</div>
              </div>
              <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr;">
                <div class="field"><label>Start Time</label><div>{{ reviewedTimeClaim.payload?.startTime || '—' }}</div></div>
                <div class="field"><label>End Time</label><div>{{ reviewedTimeClaim.payload?.endTime || '—' }}</div></div>
                <div class="field"><label>Total Minutes</label><div>{{ reviewedTimeClaim.payload?.totalMinutes ?? '—' }}</div></div>
              </div>
              <template v-if="String(reviewedTimeClaim.payload?.meetingType || '').trim() === 'Outreach'">
                <div class="field-row" style="grid-template-columns: 1fr 1fr;">
                  <div class="field"><label>Approved By</label><div>{{ reviewedTimeClaim.payload?.approvedBy || '—' }}</div></div>
                  <div class="field"><label>Locations Visited</label><div style="white-space: pre-wrap;">{{ reviewedTimeClaim.payload?.outreachLocations || '—' }}</div></div>
                </div>
              </template>
              <div class="field">
                <label>Event Summary</label>
                <div style="white-space: pre-wrap;">{{ reviewedTimeClaim.payload?.summary || reviewedTimeClaim.payload?.description || '—' }}</div>
              </div>
              <div class="field"><label>Attestation</label><div>{{ timeClaimBoolLabel(reviewedTimeClaim.payload?.attestation) }}</div></div>
              <div class="card" style="margin-top: 4px;">
                <h4 style="margin: 0 0 8px 0;">Google Meet / transcript</h4>
                <div class="field">
                  <label>Google Meet Link</label>
                  <div v-if="reviewedTimeClaim.payload?.googleMeetLink">
                    <a :href="reviewedTimeClaim.payload.googleMeetLink" target="_blank" rel="noopener noreferrer">{{ reviewedTimeClaim.payload.googleMeetLink }}</a>
                  </div>
                  <div v-else class="muted">—</div>
                </div>
                <div class="field-row" style="grid-template-columns: 1fr 1fr;">
                  <div class="field"><label>Google Event ID</label><div>{{ reviewedTimeClaim.payload?.googleEventId || '—' }}</div></div>
                  <div class="field"><label>Host Email</label><div>{{ reviewedTimeClaim.payload?.googleHostEmail || '—' }}</div></div>
                </div>
                <div class="field">
                  <label>Transcript URL</label>
                  <div v-if="reviewedTimeClaim.payload?.transcriptUrl">
                    <a :href="reviewedTimeClaim.payload.transcriptUrl" target="_blank" rel="noopener noreferrer">Open transcript</a>
                  </div>
                  <div v-else class="muted">—</div>
                </div>
                <div v-if="reviewedTimeClaim.payload?.transcriptText" class="field">
                  <label>Transcript Text</label>
                  <details>
                    <summary>View transcript</summary>
                    <pre style="white-space: pre-wrap; margin-top: 8px; max-height: 240px; overflow: auto;">{{ reviewedTimeClaim.payload.transcriptText }}</pre>
                  </details>
                </div>
              </div>
            </template>

            <!-- excess_holiday -->
            <template v-else-if="reviewedTimeClaim.claim_type === 'excess_holiday'">
              <div v-if="(reviewedTimeClaim.payload?.items || []).length">
                <label style="font-weight: 600; font-size: 0.85em; color: #888; text-transform: uppercase; letter-spacing: 0.05em;">Service code entries</label>
                <div
                  v-for="(it, idx) in reviewedTimeClaim.payload.items"
                  :key="idx"
                  style="margin-top: 8px; padding: 10px 12px; background: #f8f9fa; border-radius: 6px;"
                >
                  <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr;">
                    <div class="field"><label>CPT Code</label><div>{{ it.serviceCode || '—' }}</div></div>
                    <div class="field"><label>Units</label><div>{{ it.units ?? '—' }}</div></div>
                    <div class="field"><label>Description</label><div>{{ it.description || '—' }}</div></div>
                  </div>
                  <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 6px;">
                    <div class="field"><label>Actual direct (mins)</label><div>{{ timeClaimExcessDirectMinutes(it) }}</div></div>
                    <div class="field"><label>Actual indirect (mins)</label><div>{{ timeClaimExcessIndirectMinutes(it) }}</div></div>
                  </div>
                </div>
              </div>
              <div v-else class="field-row" style="grid-template-columns: 1fr 1fr;">
                <div class="field"><label>Direct Minutes (legacy)</label><div>{{ reviewedTimeClaim.payload?.directMinutes ?? reviewedTimeClaim.payload?.actualDirectMinutes ?? '—' }}</div></div>
                <div class="field"><label>Indirect Minutes (legacy)</label><div>{{ reviewedTimeClaim.payload?.indirectMinutes ?? reviewedTimeClaim.payload?.actualIndirectMinutes ?? '—' }}</div></div>
              </div>
              <div class="field"><label>Reason for extended time</label><div style="white-space: pre-wrap;">{{ reviewedTimeClaim.payload?.reason || '—' }}</div></div>
              <div class="field"><label>Attestation</label><div>{{ timeClaimBoolLabel(reviewedTimeClaim.payload?.attestation) }}</div></div>
            </template>

            <!-- holiday_pay -->
            <template v-else-if="reviewedTimeClaim.claim_type === 'holiday_pay'">
              <div class="field-row" style="grid-template-columns: 1fr 1fr;">
                <div class="field"><label>Holiday Date</label><div>{{ fmtClaimDate(reviewedTimeClaim.payload?.holidayDate) }}</div></div>
                <div class="field"><label>Hours Worked</label><div>{{ reviewedTimeClaim.payload?.hoursWorked ?? '—' }}</div></div>
              </div>
              <div class="field"><label>Attestation</label><div>{{ timeClaimBoolLabel(reviewedTimeClaim.payload?.attestation) }}</div></div>
            </template>

            <!-- jury_duty -->
            <template v-else-if="reviewedTimeClaim.claim_type === 'jury_duty'">
              <div class="field-row" style="grid-template-columns: 1fr 1fr;">
                <div class="field"><label>Court Date</label><div>{{ fmtClaimDate(reviewedTimeClaim.payload?.courtDate) }}</div></div>
                <div class="field"><label>Uploaded file name</label><div>{{ reviewedTimeClaim.payload?.proofOriginalName || '—' }}</div></div>
              </div>
              <div class="field"><label>Description</label><div style="white-space: pre-wrap;">{{ reviewedTimeClaim.payload?.description || '—' }}</div></div>
              <div class="field">
                <label>Court Summons</label>
                <div v-if="reviewedTimeClaim.payload?.proofFilePath">
                  <a :href="receiptUrl({ receipt_file_path: reviewedTimeClaim.payload.proofFilePath })" target="_blank" rel="noopener noreferrer">View uploaded summons</a>
                </div>
                <div v-else class="muted">—</div>
              </div>
              <div class="field"><label>Attestation</label><div>{{ timeClaimBoolLabel(reviewedTimeClaim.payload?.attestation) }}</div></div>
            </template>

            <!-- fallback: show raw payload -->
            <template v-else>
              <div class="field" v-for="(val, key) in reviewedTimeClaim.payload" :key="key">
                <label>{{ key }}</label>
                <div style="white-space: pre-wrap;">{{ timeClaimPayloadText(val) }}</div>
              </div>
            </template>

            <div class="field-row" style="grid-template-columns: 1fr 1fr; border-top: 1px solid #eee; padding-top: 12px; margin-top: 4px;">
              <div class="field"><label>Submitted by</label><div>{{ submitterLabel(reviewedTimeClaim) }}</div></div>
              <div class="field"><label>Submitted on</label><div>{{ submittedAtYmd(reviewedTimeClaim) }}</div></div>
            </div>
            <div v-if="reviewedTimeClaim.rejection_reason" class="field" style="border-top: 1px solid #eee; padding-top: 12px;">
              <label>Admin note / send-back reason</label>
              <div style="white-space: pre-wrap; color: #c05600;">{{ reviewedTimeClaim.rejection_reason }}</div>
            </div>
          </div>
          <div style="padding: 12px 16px; border-top: 1px solid #eee; display: flex; justify-content: flex-end;">
            <button class="btn btn-secondary" @click="showTimeClaimReviewModal = false">Close</button>
          </div>
        </div>
      </div>
    </teleport>
    </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useOrganizationStore } from '../../store/organization';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import AdminPayrollSubmitOverride from '../../components/admin/AdminPayrollSubmitOverride.vue';
import PayrollPtoSheetModal from '../../components/admin/PayrollPtoSheetModal.vue';
import PayrollSupervisionSheetModal from '../../components/admin/PayrollSupervisionSheetModal.vue';

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const organizationStore = useOrganizationStore();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

const openPayrollReports = async () => {
  const pid = Number(selectedPeriodId.value || 0);
  if (!pid) return;
  const slug = String(
    route.params?.organizationSlug ||
    agencyStore.currentAgency?.slug ||
    organizationStore.organizationContext?.slug ||
    ''
  ).trim();
  const path = slug ? `/${slug}/admin/payroll/reports` : '/admin/payroll/reports';
  await router.push({ path, query: { periodId: String(pid) } });
};

// super-admin-only rate sheet import removed

const orgSearch = ref('');
const historySearch = ref('');
const selectedOrgId = ref(null);

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || organizationStore.organizationContext?.id || null;
});

const periods = ref([]);
// Only schedule-aligned periods — used for claim target dropdowns so off-schedule periods
// are never offered as posting targets.
const alignedPeriods = computed(() => (periods.value || []).filter((p) => Number(p.schedule_aligned) === 1));
const selectedPeriodId = ref(null);
const selectedPeriod = ref(null);
const summaries = ref([]);
const error = ref('');

const formatPayrollImportError = (e, fallbackMessage) => {
  const msg = e?.response?.data?.error?.message || e?.message || fallbackMessage || 'Request failed';
  const meta = e?.response?.data?.error?.errorMeta || null;
  const parts = [String(msg)];
  if (meta?.rowNumber) parts.push(`Row: ${meta.rowNumber}`);
  if (Array.isArray(meta?.detectedHeaders) && meta.detectedHeaders.length) {
    parts.push(`Detected columns: ${meta.detectedHeaders.slice(0, 30).join(', ')}`);
  }
  return parts.join(' | ');
};

const importFile = ref(null);
const importing = ref(false);
const unmatchedProviders = ref([]);
const createdUsers = ref([]);
const autoImporting = ref(false);
const detectedPeriodHint = ref('');
const currentPayrollFileInput = ref(null);
const confirmAutoImportOpen = ref(false);
const autoDetecting = ref(false);
const autoDetectResult = ref(null); // { detected, existingPeriodId }
const autoImportChoiceMode = ref('detected'); // 'detected' | 'existing'
const autoImportExistingPeriodId = ref(null);

const triggerCurrentPayrollUpload = () => {
  try {
    if (currentPayrollFileInput.value) currentPayrollFileInput.value.click();
  } catch {
    // ignore
  }
};

const clearImportFile = () => {
  importFile.value = null;
  detectedPeriodHint.value = '';
  autoDetectResult.value = null;
  try {
    if (currentPayrollFileInput.value) currentPayrollFileInput.value.value = '';
  } catch {
    // ignore
  }
};

// rate sheet import removed

const selectedSummary = ref(null);
const selectedUserId = ref(null);
const agencyUsers = ref([]);
const loadingUsers = ref(false);
const sortedAgencyUsers = computed(() => {
  const list = (agencyUsers.value || []).slice();
  list.sort((a, b) => {
    const al = String(a?.last_name || '').trim().toLowerCase();
    const bl = String(b?.last_name || '').trim().toLowerCase();
    const af = String(a?.first_name || '').trim().toLowerCase();
    const bf = String(b?.first_name || '').trim().toLowerCase();
    return al.localeCompare(bl) || af.localeCompare(bf) || (Number(a?.id || 0) - Number(b?.id || 0));
  });
  return list;
});

const payrollNameKey = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const nameKeyCandidates = (raw) => {
  const parts = payrollNameKey(raw).split(' ').filter(Boolean);
  const keys = new Set();
  const full = payrollNameKey(raw);
  if (full) keys.add(full);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    const a = payrollNameKey(`${first} ${last}`);
    const b = payrollNameKey(`${last} ${first}`);
    if (a) keys.add(a);
    if (b) keys.add(b);
  }
  return Array.from(keys);
};

const payrollUserNameKeys = (u) => {
  const first = String(u?.first_name || '').trim();
  const last = String(u?.last_name || '').trim();
  const keys = new Set();
  const a = payrollNameKey(`${first} ${last}`);
  const b = payrollNameKey(`${last} ${first}`);
  if (a) keys.add(a);
  if (b) keys.add(b);
  return Array.from(keys);
};

const duplicatePayrollNameCounts = computed(() => {
  const counts = new Map();
  for (const u of agencyUsers.value || []) {
    const key = payrollNameKey(`${u?.last_name || ''} ${u?.first_name || ''}`);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
});

const payrollUserOptionLabel = (u) => {
  const base = `${u?.last_name || ''}, ${u?.first_name || ''}`.replace(/^,\s*|,\s*$/g, '').trim() || `User #${u?.id || ''}`;
  const key = payrollNameKey(`${u?.last_name || ''} ${u?.first_name || ''}`);
  if ((duplicatePayrollNameCounts.value.get(key) || 0) <= 1) return base;
  const email = String(u?.email || '').trim();
  return `${base} (${email || `ID ${u?.id}`})`;
};

// When a specific provider is selected, show only unmatched rows whose name plausibly
// belongs to that provider. Otherwise show all unmatched rows for admins to triage.
const filteredStagingUnmatched = computed(() => {
  const all = stagingUnmatched.value || [];
  const uid = Number(selectedUserId.value || 0);
  if (!uid) return all;
  const selectedUser = (agencyUsers.value || []).find((u) => Number(u?.id) === uid) || null;
  if (!selectedUser) return all;
  const selectedKeys = new Set(payrollUserNameKeys(selectedUser));
  return all.filter((row) => {
    const rowKeys = nameKeyCandidates(String(row.providerName || ''));
    return rowKeys.some((k) => selectedKeys.has(k));
  });
});

const summariesSortedByProvider = computed(() => {
  const list = (summaries.value || []).slice();
  list.sort((a, b) => {
    const al = String(a?.last_name || '').trim().toLowerCase();
    const bl = String(b?.last_name || '').trim().toLowerCase();
    const af = String(a?.first_name || '').trim().toLowerCase();
    const bf = String(b?.first_name || '').trim().toLowerCase();
    return al.localeCompare(bl) || af.localeCompare(bf) || (Number(a?.user_id || 0) - Number(b?.user_id || 0));
  });
  return list;
});
const rateServiceCode = ref('');
const rateAmount = ref('');
const savingRate = ref(false);
const submitting = ref(false);

const stagingMatched = ref([]);
const stagingUnmatched = ref([]);
const stagingLoading = ref(false);
const stagingError = ref('');
const tierByUserId = ref({});
const salaryByUserId = ref({});
const stagingEdits = ref({});
const stagingEditsBaseline = ref({});
const savingStaging = ref(false);
const workspaceSearch = ref('');
const showStageModal = ref(false);
const showRawModal = ref(false);

// Fast pending counts loaded alongside period details (no Stage required).
const dashboardPendingCounts = ref(null); // null = not yet loaded
const showRunsSideBySideModal = ref(false);
const runsSideBySideData = ref(null);
const runsSideBySideLoading = ref(false);
const runsSideBySideSearch = ref('');
const runsSideBySideSortColumn = ref('provider_name');
const runsSideBySideSortDirection = ref('asc');
const showRunModal = ref(false);
const showSubmitOnBehalfModal = ref(false);
const showTodoModal = ref(false);
const showPtoSheetModal = ref(false);
const showSupervisionSheetModal = ref(false);
const showHolidayHoursModal = ref(false);
const showSupervisionAttendanceModal = ref(false);
const showSupervisionConflictsModal = ref(false);
const showPayrollWizardModal = ref(false);
const wizardReturnPath = ref(''); // when deep-linked from wizard page, offer return CTA

const holidayHoursLoading = ref(false);
const holidayHoursError = ref('');
const holidayHoursMatched = ref([]);
const holidayHoursUnmatched = ref([]);
const supervisionAttendanceLoading = ref(false);
const supervisionAttendanceError = ref('');
const supervisionAttendanceRows = ref([]);
const supervisionAttendanceStartDate = ref('');
const supervisionAttendanceEndDate = ref('');
const supervisionConflictsLoading = ref(false);
const supervisionConflictsError = ref('');
const supervisionConflictsRows = ref([]);
const supervisionConflictSavingKey = ref('');
const showMeetingAttendanceModal = ref(false);
const meetingAttendanceLoading = ref(false);
const meetingAttendanceError = ref('');
const meetingAttendanceRows = ref([]);
const meetingAttendanceStartDate = ref('');
const meetingAttendanceEndDate = ref('');
const meetingAttendanceSyncing = ref(false);


const submitOnBehalfSearch = ref('');
const submitOnBehalfUserId = ref(null);
const submitOnBehalfTierLoading = ref(false);
const submitOnBehalfTierError = ref('');
const submitOnBehalfTierResp = ref(null); // { payrollPeriodId, periodStart, periodEnd, graceActive, tier }

const submitOnBehalfUsers = computed(() => {
  const qRaw = String(submitOnBehalfSearch.value || '').trim().toLowerCase();
  const list = sortedAgencyUsers.value || [];
  if (!qRaw) return list;
  // Support multi-word searches like "john sm" or "smith john".
  const tokens = qRaw
    .replace(/,+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length) return list;
  return list.filter((u) => {
    const first = String(u?.first_name || '').trim().toLowerCase();
    const last = String(u?.last_name || '').trim().toLowerCase();
    const email = String(u?.email || '').trim().toLowerCase();
    const hay = `${first} ${last} ${last}, ${first} ${email}`.trim();
    return tokens.every((t) => hay.includes(t));
  });
});

const loadSubmitOnBehalfTier = async () => {
  const uid = submitOnBehalfUserId.value ? Number(submitOnBehalfUserId.value) : null;
  const aid = agencyId.value ? Number(agencyId.value) : null;
  if (!uid || !aid) {
    submitOnBehalfTierResp.value = null;
    submitOnBehalfTierError.value = '';
    return;
  }
  try {
    submitOnBehalfTierLoading.value = true;
    submitOnBehalfTierError.value = '';
    const resp = await api.get(`/payroll/users/${uid}/current-tier`, { params: { agencyId: aid } });
    submitOnBehalfTierResp.value = resp.data || null;
  } catch (e) {
    submitOnBehalfTierError.value = e.response?.data?.error?.message || e.message || 'Failed to load provider tier';
    submitOnBehalfTierResp.value = null;
  } finally {
    submitOnBehalfTierLoading.value = false;
  }
};

const submitOnBehalfTierUi = computed(() => {
  const r = submitOnBehalfTierResp.value || null;
  if (!submitOnBehalfUserId.value) return null;
  if (submitOnBehalfTierLoading.value) return { label: 'Loading tier…' };
  if (String(submitOnBehalfTierError.value || '').trim()) return { label: `Tier: — (${submitOnBehalfTierError.value})` };
  const tier = r?.tier || null;
  if (!r?.payrollPeriodId || !tier) return { label: 'Most recent tier: — (no posted payroll yet)' };
  const grace = r?.graceActive ? 'Grace' : 'Current';
  const tierLabel = String(tier?.label || '').trim() || `Tier ${Number(tier?.tierLevel || 0) || '—'}`;
  const range = (r?.periodStart && r?.periodEnd) ? `${String(r.periodStart).slice(0, 10)} → ${String(r.periodEnd).slice(0, 10)}` : null;
  return { label: `Most recent tier: ${tierLabel} (${grace})${range ? ` • ${range}` : ''}` };
});

// UX: when the search narrows to a single provider, auto-select them so the UI doesn't
// misleadingly stay on the placeholder ("Select a provider…") while the dropdown only has one option.
watch([showSubmitOnBehalfModal, submitOnBehalfSearch, submitOnBehalfUsers], () => {
  if (!showSubmitOnBehalfModal.value) return;
  const q = String(submitOnBehalfSearch.value || '').trim();
  if (!q) return;
  const matches = submitOnBehalfUsers.value || [];
  const ids = matches.map((u) => u?.id).filter(Boolean);
  if (ids.length === 1) {
    submitOnBehalfUserId.value = ids[0];
    return;
  }
  // If the current selection is no longer visible in the filtered results, clear it.
  if (submitOnBehalfUserId.value && !ids.includes(submitOnBehalfUserId.value)) {
    submitOnBehalfUserId.value = null;
  }
});

watch([showSubmitOnBehalfModal, submitOnBehalfUserId, agencyId], async () => {
  if (!showSubmitOnBehalfModal.value) return;
  await loadSubmitOnBehalfTier();
});
const submitOnBehalfUserName = computed(() => {
  const id = submitOnBehalfUserId.value ? Number(submitOnBehalfUserId.value) : null;
  const u = (agencyUsers.value || []).find((x) => Number(x?.id) === id) || null;
  if (!u) return id ? `User #${id}` : '';
  const ln = String(u.last_name || '').trim();
  const fn = String(u.first_name || '').trim();
  return (ln || fn) ? `${ln}${ln && fn ? ', ' : ''}${fn}` : `User #${id}`;
});

const submitOnBehalfUser = computed(() => {
  const id = submitOnBehalfUserId.value ? Number(submitOnBehalfUserId.value) : null;
  return (agencyUsers.value || []).find((x) => Number(x?.id) === id) || null;
});



const showPreviewPostModal = ref(false);
const previewPostNotificationsLoading = ref(false);
const previewPostNotificationsError = ref('');
const previewPostNotifications = ref([]);
const previewUserPayrollHistoryLoading = ref(false);
const previewUserPayrollHistoryError = ref('');
const previewUserPayrollHistory = ref([]); // PayrollSummary.listForUser rows (includes period_start/end/status)

const previewCarryoverNotes = computed(() => {
  const b = previewSummary.value?.breakdown || null;
  const n = Number(b?.__carryover?.carryoverNotesTotal ?? b?.__carryover?.oldDoneNotesNotesTotal ?? 0);
  return Number.isFinite(n) ? n : 0;
});

const previewUnpaidInPeriod = computed(() => {
  const b = previewSummary.value?.breakdown || null;
  const c = b?.__unpaidNotesCounts || null;
  const noNote = Number(c?.noNoteNotes || 0);
  const draft = Number(c?.draftNotes || 0);
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
  const c = r?.unpaidNotesCounts || null;
  const noNote = Number(c?.noNote ?? 0);
  const draft = Number(c?.draft ?? 0);
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
const rawAuditRuns = ref([]);
const rawAuditImports = ref([]);
const rawAuditSelectedRunId = ref(null);
const rawAuditBaselineRunId = ref(null);
const rawAuditLatestRunId = ref(null);
const rawAuditSelectedImportId = ref(null);
const rawAuditBaselineImportId = ref(null);
const rawAuditLatestImportId = ref(null);
// Tracks the period being viewed in the raw modal independently of selectedPeriodId,
// so opening a prior-period import never switches the main pay period.
const rawModalActivePeriodId = ref(null);
const rawAuditChanges = ref([]);
const rawAuditShowAllChanges = ref(false);
const rawAuditLoading = ref(false);
const missedAppointmentsPaidInFull = ref([]); // display-only flags from billing import
const rawDraftSearch = ref('');
const rawAddToCurrentPeriodSearch = ref('');
const rawRowFilter = ref('unpaid_only'); // unpaid_only | draft_only | all
const rawRowLimit = ref(200);
const rawSortColumn = ref('service_date'); // provider_name | client | service_code | service_date | unit_count | note_status | draft_payable
const rawSortDirection = ref('desc'); // asc | desc
const rawAddToCurrentPeriodSortColumn = ref('provider_name');
const rawAddToCurrentPeriodSortDirection = ref('asc');
const rawProcessChecklistByRowId = ref({}); // UI-only checklist (not saved anywhere)
const rawPostedProcessingUnlocked = ref(false);
const updatingDraftPayable = ref(false);
const rawDraftError = ref('');
const rawRowNotesOpen = ref(false);
const rawRowNotesLoading = ref(false);
const rawRowNotesSaving = ref(false);
const rawRowNotesError = ref('');
const rawRowNotesRowId = ref(null);
const rawRowNotesContext = ref('');
const rawRowNotes = ref([]);
const rawRowNoteDraft = ref('');
const runningPayroll = ref(false);
const postingPayroll = ref(false);
const unpostingPayroll = ref(false);
const resettingPeriod = ref(false);
const restagingPeriod = ref(false);
const previewUserId = ref(null);
const previewAdjustments = ref(null);
const previewAdjustmentsLoading = ref(false);
const previewAdjustmentsError = ref('');

const mileageRatesLoading = ref(false);
const savingMileageRates = ref(false);
const mileageRatesError = ref('');
const mileageRatesDraft = ref({ tier1: 0, tier2: 0, tier3: 0, standard: 0, standardUsesTierRates: false });

const pendingMileageClaims = ref([]);
const pendingMileageLoading = ref(false);
const pendingMileageError = ref('');
const approvingMileageClaimId = ref(null);
const mileageTierByClaimId = ref({});
const mileageTargetPeriodByClaimId = ref({});
// Preserve the user's view when approving (all pending vs this period only)
const pendingMileageMode = ref('period'); // 'period' | 'all'

const showMileageDetailsModal = ref(false);
const selectedMileageClaim = ref(null);

const pendingMedcancelClaims = ref([]);
const pendingMedcancelLoading = ref(false);
const pendingMedcancelError = ref('');
const showMedcancelReviewModal = ref(false);
const reviewedMedcancelClaim = ref(null);
const openMedcancelReview = (c) => {
  reviewedMedcancelClaim.value = c;
  showMedcancelReviewModal.value = true;
};
const approvingMedcancelClaimId = ref(null);
const medcancelTargetPeriodByClaimId = ref({});
const pendingMedcancelMode = ref('period'); // 'period' | 'all'

const pendingReimbursementClaims = ref([]);
const pendingReimbursementLoading = ref(false);
const pendingReimbursementError = ref('');
const approvingReimbursementClaimId = ref(null);
const reimbursementTargetPeriodByClaimId = ref({});
const pendingReimbursementMode = ref('period'); // 'period' | 'all'

const pendingTimeClaims = ref([]);
const pendingTimeLoading = ref(false);
const eventTimeSubmissions = ref([]);
const eventTimeLoading = ref(false);
const eventTimeError = ref('');
const eventTimeSavingId = ref(null);
const eventTimeShowApproved = ref(false); // when true, include approved/rejected history
// Per-submission target period selector (keyed by punchInId).
const eventTimeTargetPeriodByPunchId = ref({});
const eventTimeEditOpen = ref(false);
const eventTimeEditSubmission = ref(null);
const eventTimeEditClockIn = ref('');
const eventTimeEditClockOut = ref('');
const eventTimeEditDirectCap = ref('');
const eventTimeEditSaving = ref(false);
const eventTimeEditError = ref('');
const pendingTimeError = ref('');
const approvingTimeClaimId = ref(null);

const showTimeClaimReviewModal = ref(false);
const reviewedTimeClaim = ref(null);
const openTimeClaimReview = (c) => {
  reviewedTimeClaim.value = c;
  showTimeClaimReviewModal.value = true;
};
const timeTargetPeriodByClaimId = ref({});
const pendingTimeMode = ref('period'); // 'period' | 'all'

const pendingHolidayBonusClaims = ref([]);
const pendingHolidayBonusLoading = ref(false);
const pendingHolidayBonusError = ref('');
const updatingHolidayBonusClaimId = ref(null);
const pendingHolidayBonusMode = ref('period'); // 'period' | 'all'

const pendingPtoRequests = ref([]);
const pendingPtoLoading = ref(false);
const pendingPtoError = ref('');
const approvingPtoRequestId = ref(null);
const ptoBalancesByUserId = ref({}); // userId -> { sickHours, trainingHours }
const ptoTargetPeriodByRequestId = ref({});
const pendingPtoMode = ref('period'); // 'period' | 'all'
// Status filter chips — default to showing only pending (submitted) requests.
const ptoStatusFilter = ref(['submitted']);
const ptoAllRequests = ref([]); // full unfiltered list from last fetch

const ptoVisibleRequests = computed(() => {
  const all = ptoAllRequests.value || [];
  if (!ptoStatusFilter.value.length) return all;
  return all.filter((r) => ptoStatusFilter.value.includes(String(r.status || 'submitted').toLowerCase()));
});

const ptoStatusCounts = computed(() => {
  const all = ptoAllRequests.value || [];
  return {
    submitted: all.filter((r) => String(r.status || '') === 'submitted').length,
    approved: all.filter((r) => String(r.status || '') === 'approved').length,
    rejected: all.filter((r) => String(r.status || '') === 'rejected').length,
    deferred: all.filter((r) => String(r.status || '') === 'deferred').length,
  };
});

const togglePtoStatusFilter = (status) => {
  const cur = ptoStatusFilter.value;
  if (cur.includes(status)) {
    ptoStatusFilter.value = cur.filter((s) => s !== status);
  } else {
    ptoStatusFilter.value = [...cur, status];
  }
};

const serviceCodeRules = ref([]);
const serviceCodeRulesLoading = ref(false);
const serviceCodeRulesError = ref('');

// Process Changes workflow (late notes carryover)
const processImportFile = ref(null);
const processingChanges = ref(false);
const processError = ref('');
const batchFiles = ref({ 1: null, 2: null, 3: null });
const batchCatchUpLoading = ref(false);
const batchCatchUpApplying = ref(false);
const batchCatchUpResult = ref(null);
const batchCatchUpError = ref('');
const batchCatchUpDestinationPeriodId = ref(null);
const batchCatchUpSelection = ref({}); // { 'userId:code': { selected, units } }
const batchCatchUpResetKey = ref(0);
const batchCatchUpPriorPeriodId = ref(null);
const batchCatchUpPriorPeriodImports = ref([]);
const batchCatchUpPriorImportsRequestId = ref(0);

const batchCatchUpRun1Disabled = computed(() => {
  const imp = batchCatchUpPriorPeriodImports.value || [];
  return imp.length >= 1;
});
const batchCatchUpRun2Disabled = computed(() => {
  const imp = batchCatchUpPriorPeriodImports.value || [];
  return imp.length >= 2;
});
const batchCatchUpRun3Disabled = computed(() => {
  const imp = batchCatchUpPriorPeriodImports.value || [];
  return imp.length >= 3;
});

const batchCatchUpDbBaselineFileReady = computed(() => {
  const imp = batchCatchUpPriorPeriodImports.value || [];
  if (imp.length < 1) return false;
  if (imp.length >= 2) return !!batchFiles.value[3];
  return !!batchFiles.value[2];
});

const batchCatchUpDbBaselineButtonLabel = computed(() => {
  const imp = batchCatchUpPriorPeriodImports.value || [];
  if (imp.length >= 2) return 'Upload Run 3 & compare (Run 3 vs Run 2)';
  return 'Upload Run 2 & compare (Run 2 vs Run 1)';
});

const wizardPriorPeriodId = ref(null);
const wizardPriorRun1File = ref(null);
const wizardPriorImportLoading = ref(false);
const wizardPriorImportResult = ref('');
const wizardPriorImportError = ref('');
const wizardPriorBaselineLoading = ref(false);
const wizardPriorBaselineResult = ref('');
const wizardPriorBaselineError = ref('');
const processDetectedHint = ref('');
const processSourcePeriodId = ref(null);
const processSourcePeriodLabel = ref('');

const wizardPriorPeriodOptions = computed(() => {
  const dest = selectedPeriodForUi.value || selectedPeriod.value || null;
  const destStart = String(dest?.period_start || '').slice(0, 10);
  const destId = Number(selectedPeriodId.value || 0);
  const list = Array.isArray(periods.value) ? periods.value : [];
  const filtered = list.filter((p) => {
    if (!p?.id) return false;
    const pid = Number(p.id || 0);
    if (destId && pid === destId) return false;
    if (String(p?.status || '').toLowerCase() === 'draft') return false;
    if (destStart) {
      const end = String(p?.period_end || '').slice(0, 10);
      if (end && end >= destStart) return false;
    }
    return true;
  });
  filtered.sort((a, b) => String(b?.period_end || '').localeCompare(String(a?.period_end || '')));
  return filtered;
});

const processPriorPeriodOptions = computed(() => {
  const dest = selectedPeriodForUi.value || selectedPeriod.value || null;
  const destStart = String(dest?.period_start || '').slice(0, 10);
  const destId = Number(selectedPeriodId.value || 0);
  const list = Array.isArray(periods.value) ? periods.value : [];
  const filtered = list.filter((p) => {
    if (!p?.id) return false;
    const pid = Number(p.id || 0);
    if (destId && pid === destId) return false;
    if (String(p?.status || '').toLowerCase() === 'draft') return false;
    // Exclude periods that START on or after the destination — they are not prior periods.
    // We intentionally allow periods whose end overlaps the destination start (e.g. a 14-day
    // period ending after the destination begins) because they are still valid "prior" sources.
    if (destStart) {
      const pStart = String(p?.period_start || '').slice(0, 10);
      if (pStart && pStart >= destStart) return false;
    }
    return true;
  });
  filtered.sort((a, b) => String(b?.period_end || '').localeCompare(String(a?.period_end || '')));
  return filtered;
});

const processConfirmOpen = ref(false);
const processDetectResult = ref(null); // { detected, existingPeriodId }
const processChoiceMode = ref('detected'); // 'detected' | 'existing'
const processExistingPeriodId = ref(null);

// Legacy (removed from UI)
const applyToCurrentPeriodId = ref(null); // keep to avoid breaking older helpers
const lastImportedPeriodId = ref(null);

const carryoverPriorPeriodId = ref(null);
const carryoverRuns = ref([]);
const carryoverBaselineRunId = ref(null);
const carryoverCompareRunId = ref(null);
const carryoverLoading = ref(false);
const carryoverError = ref('');
const carryoverPreview = ref([]);
const carryoverDraftReview = ref([]); // destination/current period DRAFT rows that likely need draft-pay confirmation
const carryoverDraftReviewSearch = ref('');
const updatingCarryoverDraftRowId = ref(null);
const carryoverPriorStillUnpaid = ref([]); // rows in the prior period that are STILL unpaid after the comparison run
const carryoverPriorStillUnpaidMeta = ref(null); // { priorPeriodId, baselineRunId, compareRunId }
const carryoverPriorPeriods = ref([]); // multi-period: [{ priorPeriodId, prior, deltas, stillUnpaid }] for 2 ago, 1 ago
const carryoverMultiPeriodLoading = ref(false);
const loadingPriorStillUnpaidForStage = ref(false);
const priorStillUnpaidStageError = ref('');
const applyingCarryover = ref(false);
const carryoverApplyResult = ref(null); // { inserted: number, warnings?: any[] }
const manualCarryoverEnabled = ref(false);

const pickDefaultCarryoverRunPair = (runs) => {
  const list = Array.isArray(runs) ? runs : [];
  if (!list.length) return { baselineRunId: null, compareRunId: null };
  if (list.length === 1) {
    const only = Number(list[0]?.id || 0) || null;
    return { baselineRunId: only, compareRunId: only };
  }
  // Default to "previous -> latest" so Process Changes compares the newest upload
  // against the immediately prior snapshot of that same pay period.
  const compare = Number(list[list.length - 1]?.id || 0) || null;
  const baseline = Number(list[list.length - 2]?.id || 0) || null;
  return { baselineRunId: baseline, compareRunId: compare };
};

const carryoverRunLabelById = computed(() => {
  const rows = Array.isArray(carryoverRuns.value) ? carryoverRuns.value : [];
  const out = {};
  const total = rows.length;
  rows.forEach((r, idx) => {
    const id = Number(r?.id || 0);
    if (!id) return;
    const runNumber = Number(r?.run_number || (idx + 1));
    const when = fmtDateTime(r?.ran_at);
    const byNameRaw = `${r?.ran_by_first_name || ''} ${r?.ran_by_last_name || ''}`.trim();
    const by = byNameRaw || 'Unknown user';
    const tags = [];
    if (idx === total - 1) tags.push('latest');
    if (idx === total - 2) tags.push('previous');
    const tagSuffix = tags.length ? ` [${tags.join(', ')}]` : '';
    out[id] = `Run ${runNumber} (${idx + 1}/${total}) - ${when} - ${by}${tagSuffix}`;
  });
  return out;
});

// Stage editing for yellow/red columns (persisted)
const stageCarryoverEditMode = ref(false);
const stageCarryoverEdits = ref({}); // key -> number (old done notes)
const stagePriorUnpaidEdits = ref({}); // key -> number (prior still unpaid)
const savingStageCarryoverEdits = ref(false);
const savingStagePriorUnpaidEdits = ref(false);
const manualCarryover = ref({
  userId: null,
  serviceCode: '',
  oldDoneNotesUnits: ''
});

const adjustments = ref({
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
  // Display-only: derived from payroll salary positions when no manual override exists.
  salaryEffectiveAmount: 0,
  salarySource: 'none', // none | position | manual_override
  salaryPerPayPeriod: 0,
  salaryIncludeServicePay: 0,
  salaryIsProrated: 0,
  sickPtoHours: 0,
  trainingPtoHours: 0,
  ptoHours: 0,
  ptoRate: 0
});

const otherRateTitlesForAdjustments = ref({ title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' });
const loadOtherRateTitlesForAdjustments = async () => {
  const uid = selectedUserId.value;
  if (!agencyId.value || !uid) {
    otherRateTitlesForAdjustments.value = { title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' };
    return;
  }
  try {
    const resp = await api.get('/payroll/other-rate-titles', { params: { agencyId: agencyId.value, userId: uid } });
    otherRateTitlesForAdjustments.value = {
      title1: resp.data?.title1 || 'Other 1',
      title2: resp.data?.title2 || 'Other 2',
      title3: resp.data?.title3 || 'Other 3'
    };
  } catch {
    otherRateTitlesForAdjustments.value = { title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' };
  }
};

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

// Supervision import (CSV per pay period)
const supervisionImporting = ref(false);
const supervisionImportError = ref('');
const supervisionImportResult = ref(null);
const supervisionCsvFile = ref(null);
const supervisionCsvName = ref('');

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

const approvedHolidayBonusClaimsLoading = ref(false);
const approvedHolidayBonusClaimsAmount = ref(0);

const loadApprovedHolidayBonusClaimsAmount = async () => {
  const uid = selectedUserId.value;
  const pid = selectedPeriodId.value;
  if (!agencyId.value || !uid || !pid) {
    approvedHolidayBonusClaimsAmount.value = 0;
    return;
  }
  try {
    approvedHolidayBonusClaimsLoading.value = true;
    const resp = await api.get('/payroll/holiday-bonus-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        payrollPeriodId: pid,
        userId: uid
      }
    });
    const rows = resp.data || [];
    approvedHolidayBonusClaimsAmount.value = rows.reduce((a, c) => a + Number(c?.applied_amount || 0), 0);
  } catch {
    approvedHolidayBonusClaimsAmount.value = 0;
  } finally {
    approvedHolidayBonusClaimsLoading.value = false;
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

const approvedHolidayBonusListLoading = ref(false);
const approvedHolidayBonusListError = ref('');
const approvedHolidayBonusClaims = ref([]);
const unapprovingHolidayBonusClaimId = ref(null);

const approvedTimeClaimsLoading = ref(false);
const approvedTimeClaimsAmount = ref(0);
const approvedTimeListLoading = ref(false);
const approvedTimeListError = ref('');
const approvedTimeClaims = ref([]);
const approvedTimeMoveTargetByClaimId = ref({});
const movingTimeClaimId = ref(null);
const timeBucketByClaimId = ref({});
const timeCreditsHoursByClaimId = ref({});
const timeAppliedAmountOverrideByClaimId = ref({});

// Manual pay lines (one-off corrections)
const manualPayLinesTab = ref('add'); // 'add' | 'bulk'
const manualPayLinesLoading = ref(false);
const manualPayLinesError = ref('');
const manualPayLines = ref([]);
const savingManualPayLines = ref(false);
const deletingManualPayLineId = ref(null);
const editingManualPayLineId = ref(null);
const editingManualPayLineDraft = ref({ category: 'direct', creditsHours: null, amount: null });
const updatingManualPayLineId = ref(null);
const manualPayLineDraftRowSeq = ref(1);
const manualPayLineDraftRows = ref([
  { _key: manualPayLineDraftRowSeq.value++, userId: null, lineType: 'pay', category: 'indirect', ptoBucket: 'sick', creditsHours: '', label: '', amount: '' }
]);

const addManualPayLineDraftRow = () => {
  manualPayLineDraftRows.value = [
    ...(manualPayLineDraftRows.value || []),
    { _key: manualPayLineDraftRowSeq.value++, userId: null, lineType: 'pay', category: 'indirect', ptoBucket: 'sick', creditsHours: '', label: '', amount: '' }
  ];
};

const removeManualPayLineDraftRow = (idx) => {
  const rows = [...(manualPayLineDraftRows.value || [])];
  rows.splice(idx, 1);
  manualPayLineDraftRows.value = rows.length
    ? rows
    : [{ _key: manualPayLineDraftRowSeq.value++, userId: null, lineType: 'pay', category: 'indirect', ptoBucket: 'sick', creditsHours: '', label: '', amount: '' }];
};

const isValidManualPayLineDraftRow = (r) => {
  const uid = Number(r?.userId || 0);
  const lineType = String(r?.lineType || 'pay').trim().toLowerCase() === 'pto' ? 'pto' : 'pay';
  const label = String(r?.label || '').trim();
  const cat = String(r?.category || 'indirect').trim().toLowerCase();
  const amount = (r?.amount === null || r?.amount === undefined || r?.amount === '') ? null : Number(r?.amount);
  const hrsRaw = (r?.creditsHours === null || r?.creditsHours === undefined || r?.creditsHours === '') ? null : Number(r?.creditsHours);
  if (!uid || !label) return false;
  if (lineType === 'pto') {
    // PTO adjustments: creditsHours required and can be +/-.
    if (hrsRaw === null || !Number.isFinite(hrsRaw) || Math.abs(hrsRaw) < 1e-9) return false;
    return true;
  }
  if (!(cat === 'direct' || cat === 'indirect')) return false;
  if (hrsRaw !== null && (!Number.isFinite(hrsRaw) || hrsRaw < 0)) return false;
  if (!Number.isFinite(amount) || Math.abs(amount) < 1e-9) return false;
  return true;
};

const hasValidManualPayLineDraft = computed(() => (manualPayLineDraftRows.value || []).some(isValidManualPayLineDraftRow));

// Manual Bulk
const manualBulkAttendees = ref('');
const manualBulkServiceCode = ref('MEETING');
const manualBulkQuantity = ref('');
const manualBulkMeetingDate = ref('');
const manualBulkReason = ref('');
const manualBulkError = ref('');
const savingManualBulk = ref(false);
const manualBulkServiceCodeOptions = computed(() => {
  const rules = (serviceCodeRules.value || []).filter((r) => r?.service_code);
  return rules
    .map((r) => ({ service_code: String(r.service_code || '').trim() }))
    .filter((r) => r.service_code)
    .sort((a, b) => a.service_code.localeCompare(b.service_code));
});

const manualBulkRuleForCode = computed(() => {
  const code = String(manualBulkServiceCode.value || '').trim().toUpperCase();
  const rules = serviceCodeRules.value || [];
  return rules.find((r) => String(r?.service_code || '').trim().toUpperCase() === code) || null;
});

const manualBulkInputLabel = computed(() => {
  const payDivisor = Number(manualBulkRuleForCode.value?.pay_divisor ?? 60);
  return payDivisor === 60 ? 'Minutes' : 'Units';
});

const manualBulkInputPlaceholder = computed(() => {
  const payDivisor = Number(manualBulkRuleForCode.value?.pay_divisor ?? 60);
  return payDivisor === 60 ? '60' : '4';
});

const manualBulkInputType = computed(() => {
  const payDivisor = Number(manualBulkRuleForCode.value?.pay_divisor ?? 60);
  return payDivisor === 60 ? 'minutes' : 'units';
});

const submitManualBulk = async () => {
  if (!selectedPeriodId.value) return;
  const attendees = String(manualBulkAttendees.value || '').trim();
  const quantity = Number(manualBulkQuantity.value);
  const serviceCode = String(manualBulkServiceCode.value || 'MEETING').trim().toUpperCase();
  const meetingDate = String(manualBulkMeetingDate.value || '').trim().slice(0, 10);
  const reason = String(manualBulkReason.value || '').trim();
  if (!attendees || !Number.isFinite(quantity) || quantity <= 0) return;
  try {
    savingManualBulk.value = true;
    manualBulkError.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/manual-bulk`, {
      attendeeNames: attendees,
      serviceCode,
      quantity,
      inputType: manualBulkInputType.value,
      meetingDate: meetingDate || undefined,
      reason: reason || undefined
    });
    manualBulkAttendees.value = '';
    manualBulkQuantity.value = '';
    manualBulkReason.value = '';
    await loadManualPayLines();
    await loadPeriodDetails();
  } catch (e) {
    manualBulkError.value = e.response?.data?.error?.message || e.message || 'Failed to add manual bulk lines';
  } finally {
    savingManualBulk.value = false;
  }
};

const loadManualPayLines = async () => {
  if (!selectedPeriodId.value) return;
  try {
    manualPayLinesLoading.value = true;
    manualPayLinesError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/manual-pay-lines`);
    manualPayLines.value = resp.data || [];
  } catch (e) {
    manualPayLinesError.value = e.response?.data?.error?.message || e.message || 'Failed to load manual pay lines';
    manualPayLines.value = [];
  } finally {
    manualPayLinesLoading.value = false;
  }
};

// Payroll To-Dos (blocking)
const payrollTodosLoading = ref(false);
const payrollTodosError = ref('');
const payrollTodos = ref([]);
const updatingPayrollTodoId = ref(null);
const editingPeriodTodoId = ref(null);
const savingPeriodTodoEdits = ref(false);
const editPeriodTodoDraft = ref({ title: '', description: '', scope: 'agency', targetUserId: null });
const editPeriodTodoDraftBefore = ref({ title: '', description: '', scope: 'agency', targetUserId: null });

const beginEditPeriodTodo = (t) => {
  if (!t?.id) return;
  editingPeriodTodoId.value = t.id;
  editPeriodTodoDraft.value = {
    title: String(t.title || ''),
    description: String(t.description || ''),
    scope: String(t.scope || 'agency') === 'provider' ? 'provider' : 'agency',
    targetUserId: Number(t.target_user_id || 0) || null
  };
  editPeriodTodoDraftBefore.value = { ...editPeriodTodoDraft.value };
};

const cancelEditPeriodTodo = () => {
  editPeriodTodoDraft.value = { ...editPeriodTodoDraftBefore.value };
  editingPeriodTodoId.value = null;
};

const savePeriodTodoEdits = async () => {
  if (!selectedPeriodId.value || !editingPeriodTodoId.value) return;
  const todoId = editingPeriodTodoId.value;
  const title = String(editPeriodTodoDraft.value?.title || '').trim();
  const description = String(editPeriodTodoDraft.value?.description || '').trim();
  const scope = String(editPeriodTodoDraft.value?.scope || 'agency') === 'provider' ? 'provider' : 'agency';
  const targetUserId = Number(editPeriodTodoDraft.value?.targetUserId || 0);
  if (!title) return;
  if (scope === 'provider' && !(targetUserId > 0)) return;
  try {
    savingPeriodTodoEdits.value = true;
    payrollTodosError.value = '';
    await api.patch(`/payroll/periods/${selectedPeriodId.value}/todos/${todoId}`, {
      title,
      description: description || null,
      scope,
      targetUserId: scope === 'provider' ? targetUserId : 0
    });
    editingPeriodTodoId.value = null;
    await loadPayrollTodos();
  } catch (e) {
    payrollTodosError.value = e.response?.data?.error?.message || e.message || 'Failed to update To‑Do';
  } finally {
    savingPeriodTodoEdits.value = false;
  }
};

const deletePeriodTodo = async (t) => {
  if (!selectedPeriodId.value || !t?.id) return;
  if (t.template_id) {
    alert('This To‑Do comes from a recurring template. Edit or delete the template instead.');
    return;
  }
  const ok = window.confirm('Delete this To‑Do for this pay period?');
  if (!ok) return;
  try {
    updatingPayrollTodoId.value = t.id;
    payrollTodosError.value = '';
    await api.delete(`/payroll/periods/${selectedPeriodId.value}/todos/${t.id}`);
    await loadPayrollTodos();
  } catch (e) {
    payrollTodosError.value = e.response?.data?.error?.message || e.message || 'Failed to delete To‑Do';
  } finally {
    updatingPayrollTodoId.value = null;
  }
};

const loadPayrollTodos = async () => {
  if (!selectedPeriodId.value) return;
  try {
    payrollTodosLoading.value = true;
    payrollTodosError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/todos`);
    payrollTodos.value = resp.data || [];
  } catch (e) {
    payrollTodosError.value = e.response?.data?.error?.message || e.message || 'Failed to load payroll To-Dos';
    payrollTodos.value = [];
  } finally {
    payrollTodosLoading.value = false;
  }
};

const togglePayrollTodoDone = async (t, done) => {
  if (!selectedPeriodId.value || !t?.id) return;
  try {
    updatingPayrollTodoId.value = t.id;
    payrollTodosError.value = '';
    await api.patch(`/payroll/periods/${selectedPeriodId.value}/todos/${t.id}`, { status: done ? 'done' : 'pending' });
    await loadPayrollTodos();
  } catch (e) {
    payrollTodosError.value = e.response?.data?.error?.message || e.message || 'Failed to update To-Do';
  } finally {
    updatingPayrollTodoId.value = null;
  }
};

// To-Do modal: templates + ad-hoc
const todoTab = ref('period'); // period | templates
const todoTemplatesLoading = ref(false);
const todoTemplatesError = ref('');
const todoTemplates = ref([]);
const savingTodoTemplate = ref(false);
const deletingTodoTemplateId = ref(null);

const editTodoTemplateOpen = ref(false);
const editTodoTemplateError = ref('');
const savingEditTodoTemplate = ref(false);
const editTodoTemplateId = ref(null);
const editTodoTemplateDraft = ref({ scope: 'agency', targetUserId: null, startPayrollPeriodId: null, title: '', description: '', isActive: true });

const openEditTodoTemplate = (t) => {
  if (!t?.id) return;
  editTodoTemplateError.value = '';
  editTodoTemplateOpen.value = true;
  editTodoTemplateId.value = t.id;
  editTodoTemplateDraft.value = {
    scope: String(t.scope || 'agency') === 'provider' ? 'provider' : 'agency',
    targetUserId: Number(t.target_user_id || 0) || null,
    startPayrollPeriodId: Number(t.start_payroll_period_id || 0) > 0 ? Number(t.start_payroll_period_id) : null,
    title: String(t.title || ''),
    description: String(t.description || ''),
    isActive: Number(t.is_active) === 1
  };
};

const closeEditTodoTemplate = () => {
  editTodoTemplateOpen.value = false;
  editTodoTemplateId.value = null;
  editTodoTemplateError.value = '';
};

const saveEditTodoTemplate = async () => {
  if (!agencyId.value || !editTodoTemplateId.value) return;
  const id = editTodoTemplateId.value;
  const title = String(editTodoTemplateDraft.value?.title || '').trim();
  const description = String(editTodoTemplateDraft.value?.description || '').trim();
  const scope = String(editTodoTemplateDraft.value?.scope || 'agency') === 'provider' ? 'provider' : 'agency';
  const targetUserId = Number(editTodoTemplateDraft.value?.targetUserId || 0);
  const startPayrollPeriodIdRaw = editTodoTemplateDraft.value?.startPayrollPeriodId;
  const startPayrollPeriodId = startPayrollPeriodIdRaw ? Number(startPayrollPeriodIdRaw) : null;
  const isActive = !!editTodoTemplateDraft.value?.isActive;
  if (!title) return;
  if (scope === 'provider' && !(targetUserId > 0)) return;
  try {
    savingEditTodoTemplate.value = true;
    editTodoTemplateError.value = '';
    await api.patch(`/payroll/todo-templates/${id}`, {
      agencyId: agencyId.value,
      title,
      description: description || null,
      scope,
      targetUserId: scope === 'provider' ? targetUserId : 0,
      startPayrollPeriodId: startPayrollPeriodId || null,
      isActive
    });
    await loadTodoTemplates();
    closeEditTodoTemplate();
  } catch (e) {
    editTodoTemplateError.value = e.response?.data?.error?.message || e.message || 'Failed to update template';
  } finally {
    savingEditTodoTemplate.value = false;
  }
};

const newTodoDraft = ref({ scope: 'agency', targetUserId: null, title: '', description: '' });
const templateDraft = ref({ scope: 'agency', targetUserId: null, startPayrollPeriodId: null, title: '', description: '', isActive: true });

const loadTodoTemplates = async () => {
  if (!agencyId.value) return;
  try {
    todoTemplatesLoading.value = true;
    todoTemplatesError.value = '';
    const resp = await api.get('/payroll/todo-templates', { params: { agencyId: agencyId.value } });
    todoTemplates.value = resp.data || [];
  } catch (e) {
    todoTemplatesError.value = e.response?.data?.error?.message || e.message || 'Failed to load recurring To-Do templates';
    todoTemplates.value = [];
  } finally {
    todoTemplatesLoading.value = false;
  }
};

const createTodoForPeriod = async () => {
  if (!selectedPeriodId.value) return;
  const title = String(newTodoDraft.value?.title || '').trim();
  const description = String(newTodoDraft.value?.description || '').trim();
  const scope = String(newTodoDraft.value?.scope || 'agency') === 'provider' ? 'provider' : 'agency';
  const targetUserId = Number(newTodoDraft.value?.targetUserId || 0);
  if (!title) return;
  if (scope === 'provider' && !(targetUserId > 0)) return;
  try {
    payrollTodosError.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/todos`, {
      title,
      description: description || null,
      scope,
      targetUserId: scope === 'provider' ? targetUserId : 0
    });
    newTodoDraft.value = { scope: 'agency', targetUserId: null, title: '', description: '' };
    await loadPayrollTodos();
  } catch (e) {
    payrollTodosError.value = e.response?.data?.error?.message || e.message || 'Failed to create To-Do';
  }
};

const createTodoTemplate = async () => {
  if (!agencyId.value) return;
  const title = String(templateDraft.value?.title || '').trim();
  const description = String(templateDraft.value?.description || '').trim();
  const scope = String(templateDraft.value?.scope || 'agency') === 'provider' ? 'provider' : 'agency';
  const targetUserId = Number(templateDraft.value?.targetUserId || 0);
  const startPayrollPeriodIdRaw = templateDraft.value?.startPayrollPeriodId;
  const startPayrollPeriodId = startPayrollPeriodIdRaw ? Number(startPayrollPeriodIdRaw) : null;
  const isActive = templateDraft.value?.isActive ? true : false;
  if (!title) return;
  if (scope === 'provider' && !(targetUserId > 0)) return;
  try {
    savingTodoTemplate.value = true;
    todoTemplatesError.value = '';
    await api.post('/payroll/todo-templates', {
      agencyId: agencyId.value,
      title,
      description: description || null,
      scope,
      targetUserId: scope === 'provider' ? targetUserId : 0,
      startPayrollPeriodId: startPayrollPeriodId || null,
      isActive
    });
    templateDraft.value = { scope: 'agency', targetUserId: null, startPayrollPeriodId: null, title: '', description: '', isActive: true };
    await loadTodoTemplates();
  } catch (e) {
    todoTemplatesError.value = e.response?.data?.error?.message || e.message || 'Failed to create recurring To-Do template';
  } finally {
    savingTodoTemplate.value = false;
  }
};

const toggleTodoTemplateActive = async (tpl, nextActive) => {
  if (!tpl?.id || !agencyId.value) return;
  try {
    deletingTodoTemplateId.value = tpl.id;
    await api.patch(`/payroll/todo-templates/${tpl.id}`, { agencyId: agencyId.value, ...tpl, isActive: !!nextActive, targetUserId: tpl.target_user_id, startPayrollPeriodId: tpl.start_payroll_period_id });
    await loadTodoTemplates();
  } catch (e) {
    todoTemplatesError.value = e.response?.data?.error?.message || e.message || 'Failed to update template';
  } finally {
    deletingTodoTemplateId.value = null;
  }
};

const deleteTodoTemplate = async (tpl) => {
  if (!tpl?.id || !agencyId.value) return;
  const ok = window.confirm('Delete this recurring To-Do template? (Existing pay period To-Dos will remain.)');
  if (!ok) return;
  try {
    deletingTodoTemplateId.value = tpl.id;
    await api.delete(`/payroll/todo-templates/${tpl.id}`, { params: { agencyId: agencyId.value } });
    await loadTodoTemplates();
  } catch (e) {
    todoTemplatesError.value = e.response?.data?.error?.message || e.message || 'Failed to delete template';
  } finally {
    deletingTodoTemplateId.value = null;
  }
};

const openTodoModal = async () => {
  if (!selectedPeriodId.value) return;
  showTodoModal.value = true;
  todoTab.value = 'period';
  await loadPayrollTodos();
  await loadTodoTemplates();
};

const openPtoSheetModal = () => {
  if (!agencyId.value) return;
  showPtoSheetModal.value = true;
};

const openSupervisionSheetModal = () => {
  if (!agencyId.value) return;
  showSupervisionSheetModal.value = true;
};

// ==========================
// Payroll Wizard (step-by-step)
// ==========================

const wizardLoading = ref(false);
const wizardError = ref('');
const wizardSaving = ref(false);
const wizardStepIdx = ref(0);
const wizardState = ref(null); // { stepIdx, priorPeriodId, completed?: any }
const wizardCurrentPeriodFile = ref(null);
const wizardImportLoading = ref(false);
const wizardImportResult = ref('');
const wizardImportError = ref('');

const wizardSteps = computed(() => {
  const steps = [
    { key: 'select_period', title: 'Select current pay period' },
    { key: 'upload_prior_run1', title: 'Upload prior period Run 1 (optional)' },
    { key: 'draft_audit_prior', title: 'Draft audit prior period (required if Run 1)' },
    { key: 'batch_catchup', title: 'Batch catch-up (prior period, optional)' },
    { key: 'upload_current', title: 'Upload current period billing report' },
    { key: 'drafts', title: 'Draft audit (mark unpaid)' },
    { key: 'h0031', title: 'Process H0031' },
    { key: 'h0032', title: 'Process H0032' },
    { key: 'h2014', title: 'Process H2014' },
    { key: '90853', title: 'Process 90853' },
    { key: 'h2032', title: 'Process H2032' },
    { key: 'stage', title: 'Payroll Stage (edits, todos, manual adds)' },
    { key: 'run', title: 'Run payroll' },
    { key: 'preview', title: 'Preview post' },
    { key: 'post', title: 'Post payroll' }
  ];
  return steps;
});

const wizardStep = computed(() => wizardSteps.value[wizardStepIdx.value] || wizardSteps.value[0] || null);

const loadPayrollWizardProgress = async () => {
  if (!selectedPeriodId.value) return;
  try {
    wizardLoading.value = true;
    wizardError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/wizard-progress`);
    const state = resp.data?.state || null;
    wizardState.value = state && typeof state === 'object' ? state : null;
    let idx = Number(wizardState.value?.stepIdx || 0);
    const key = String(wizardState.value?.stepKey || '').trim();
    if (key) {
      const byKey = wizardSteps.value.findIndex((s) => s?.key === key);
      if (byKey >= 0) idx = byKey;
    }
    wizardStepIdx.value = Number.isFinite(idx) && idx >= 0 ? Math.min(idx, Math.max(0, wizardSteps.value.length - 1)) : 0;
  } catch (e) {
    wizardError.value = e.response?.data?.error?.message || e.message || 'Failed to load wizard progress';
    wizardState.value = null;
    wizardStepIdx.value = 0;
  } finally {
    wizardLoading.value = false;
  }
};

const processChangesCard = ref(null);
const ptoSectionRef = ref(null);
const wizardGoToProcessChanges = async () => {
  // Wizard is a modal; close it then scroll to the Process Changes section.
  showPayrollWizardModal.value = false;
  await nextTick();
  try {
    processChangesCard.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  } catch {
    // ignore
  }
};

const savePayrollWizardProgress = async () => {
  if (!selectedPeriodId.value) return;
  try {
    wizardSaving.value = true;
    const state = {
      ...(wizardState.value && typeof wizardState.value === 'object' ? wizardState.value : {}),
      stepIdx: wizardStepIdx.value,
      stepKey: wizardStep.value?.key || null,
      updatedAt: new Date().toISOString()
    };
    const resp = await api.put(`/payroll/periods/${selectedPeriodId.value}/wizard-progress`, { state });
    wizardState.value = resp.data?.state || state;
  } finally {
    wizardSaving.value = false;
  }
};

const openPayrollWizard = async () => {
  // Dedicated wizard page (keeps dashboard tools intact; resumes by period)
  const slug = String(
    route.params?.organizationSlug ||
    agencyStore.currentAgency?.slug ||
    organizationStore.organizationContext?.slug ||
    ''
  ).trim();
  const pid = selectedPeriodId.value ? String(selectedPeriodId.value) : '';
  const path = slug
    ? (pid ? `/${slug}/admin/payroll/wizard/${pid}` : `/${slug}/admin/payroll/wizard`)
    : (pid ? `/admin/payroll/wizard/${pid}` : '/admin/payroll/wizard');
  await router.push({ path });
};

const wizardNext = async () => {
  if (!wizardSteps.value.length) return;
  await savePayrollWizardProgress();
  wizardStepIdx.value = Math.min(wizardStepIdx.value + 1, wizardSteps.value.length - 1);
  await savePayrollWizardProgress();
};

const wizardBack = async () => {
  if (!wizardSteps.value.length) return;
  await savePayrollWizardProgress();
  wizardStepIdx.value = Math.max(0, wizardStepIdx.value - 1);
  await savePayrollWizardProgress();
};

const wizardSaveAndExit = async () => {
  await savePayrollWizardProgress();
  showPayrollWizardModal.value = false;
};

const wizardDiscardAndExit = async () => {
  if (!selectedPeriodId.value) {
    showPayrollWizardModal.value = false;
    return;
  }
  // Best-effort: overwrite with empty progress so reopening starts fresh.
  try {
    await api.put(`/payroll/periods/${selectedPeriodId.value}/wizard-progress`, { state: {} });
  } catch {
    // ignore
  }
  wizardState.value = null;
  wizardStepIdx.value = 0;
  showPayrollWizardModal.value = false;
};

const wizardOpenRawMode = async (mode) => {
  rawMode.value = mode;
  showRawModal.value = true;
};

const onWizardPriorRun1Pick = (evt) => {
  wizardPriorRun1File.value = evt.target.files?.[0] || null;
  wizardPriorImportResult.value = '';
  wizardPriorImportError.value = '';
};

const wizardImportPriorRun1AndNext = async () => {
  if (!wizardPriorPeriodId.value || !wizardPriorRun1File.value || !agencyId.value) return;
  try {
    wizardPriorImportLoading.value = true;
    wizardPriorImportResult.value = '';
    wizardPriorImportError.value = '';
    const fd = new FormData();
    fd.append('file', wizardPriorRun1File.value);
    const resp = await api.post(`/payroll/periods/${wizardPriorPeriodId.value}/import`, fd);
    wizardPriorImportResult.value = `Imported ${resp.data?.inserted ?? '?'} rows. Do draft audit next.`;
    wizardPriorRun1File.value = null;
    await loadPeriods();
    await wizardNext();
  } catch (e) {
    wizardPriorImportError.value = e.response?.data?.error?.message || e.message || 'Import failed';
  } finally {
    wizardPriorImportLoading.value = false;
  }
};

const wizardOpenPriorDraftAudit = async () => {
  if (!wizardPriorPeriodId.value) return;
  await selectPeriod(wizardPriorPeriodId.value);
  rawMode.value = 'draft_audit';
  showRawModal.value = true;
  showPayrollWizardModal.value = false;
};

const wizardCreatePriorBaselineRun = async () => {
  if (!wizardPriorPeriodId.value) return;
  try {
    wizardPriorBaselineLoading.value = true;
    wizardPriorBaselineResult.value = '';
    wizardPriorBaselineError.value = '';
    await api.post(`/payroll/periods/${wizardPriorPeriodId.value}/runs/snapshot`);
    wizardPriorBaselineResult.value = 'Baseline run created. You can now upload Run 2 in Batch catch-up.';
    await loadPeriods();
  } catch (e) {
    wizardPriorBaselineError.value = e.response?.data?.error?.message || e.message || 'Failed to create baseline run';
  } finally {
    wizardPriorBaselineLoading.value = false;
  }
};

const wizardRunBatchCatchUpDbBaseline = async () => {
  if (!agencyId.value || !batchFiles.value[2] || !wizardPriorPeriodId.value) return;
  try {
    batchCatchUpLoading.value = true;
    batchCatchUpError.value = '';
    batchCatchUpResult.value = null;
    batchCatchUpSelection.value = {};
    const fd = new FormData();
    fd.append('file2', batchFiles.value[2]);
    fd.append('agencyId', String(agencyId.value));
    fd.append('priorPeriodId', String(wizardPriorPeriodId.value));
    fd.append('useDbBaseline', 'true');
    const destId = batchCatchUpDestinationPeriodId.value || selectedPeriodId.value;
    if (destId) fd.append('destinationPeriodId', String(destId));
    const resp = await api.post('/payroll/periods/batch-catch-up', fd);
    batchCatchUpResult.value = resp.data || null;
    const applied = batchCatchUpResult.value?.carryoverApplied || [];
    const sel = {};
    for (const c of applied) {
      const k = `${c.userId}:${(c.serviceCode || '').toUpperCase()}`;
      sel[k] = { selected: true, units: Number(c.run2To3Units ?? c.totalUnits ?? 0) };
    }
    batchCatchUpSelection.value = sel;
    if (batchCatchUpResult.value?.destinationPeriodId && !batchCatchUpDestinationPeriodId.value) {
      batchCatchUpDestinationPeriodId.value = batchCatchUpResult.value.destinationPeriodId;
    }
    await loadPeriods();
  } catch (e) {
    batchCatchUpError.value = e.response?.data?.error?.message || e.message || 'Batch catch-up failed';
  } finally {
    batchCatchUpLoading.value = false;
  }
};

const wizardRunBatchCatchUp = async () => {
  if (!agencyId.value || !batchFiles.value[1] || !batchFiles.value[2]) return;
  const savedPeriodId = selectedPeriodId.value;
  try {
    batchCatchUpLoading.value = true;
    batchCatchUpError.value = '';
    batchCatchUpResult.value = null;
    batchCatchUpSelection.value = {};
    const fd = new FormData();
    fd.append('file1', batchFiles.value[1]);
    fd.append('file2', batchFiles.value[2]);
    if (batchFiles.value[3]) fd.append('file3', batchFiles.value[3]);
    fd.append('agencyId', String(agencyId.value));
    const destId = batchCatchUpDestinationPeriodId.value || selectedPeriodId.value;
    if (destId) fd.append('destinationPeriodId', String(destId));
    const resp = await api.post('/payroll/periods/batch-catch-up', fd);
    batchCatchUpResult.value = resp.data || null;
    const applied = batchCatchUpResult.value?.carryoverApplied || [];
    const sel = {};
    for (const c of applied) {
      const k = `${c.userId}:${(c.serviceCode || '').toUpperCase()}`;
      sel[k] = { selected: true, units: Number(c.run2To3Units ?? c.totalUnits ?? 0) };
    }
    batchCatchUpSelection.value = sel;
    if (batchCatchUpResult.value?.destinationPeriodId && !batchCatchUpDestinationPeriodId.value) {
      batchCatchUpDestinationPeriodId.value = batchCatchUpResult.value.destinationPeriodId;
    }
    await loadPeriods();
    if (savedPeriodId) selectedPeriodId.value = savedPeriodId;
  } catch (e) {
    batchCatchUpError.value = e.response?.data?.error?.message || e.message || 'Batch catch-up failed';
  } finally {
    batchCatchUpLoading.value = false;
  }
};

const wizardRunBatchCatchUpAndNext = async () => {
  await wizardRunBatchCatchUp();
  if (!batchCatchUpError.value) await wizardNext();
};

const wizardApplyBatchCatchUpAndNext = async () => {
  await applyBatchCatchUpToPeriod();
  if (!batchCatchUpError.value) await wizardNext();
};

const onWizardCurrentPeriodFilePick = (evt) => {
  wizardCurrentPeriodFile.value = evt.target.files?.[0] || null;
  wizardImportResult.value = '';
  wizardImportError.value = '';
};

const wizardImportCurrentPeriod = async () => {
  if (!wizardCurrentPeriodFile.value || !selectedPeriodId.value) return;
  try {
    wizardImportLoading.value = true;
    wizardImportError.value = '';
    wizardImportResult.value = '';
    const fd = new FormData();
    fd.append('file', wizardCurrentPeriodFile.value);
    const resp = await api.post(`/payroll/periods/${selectedPeriodId.value}/import`, fd);
    wizardImportResult.value = `Imported ${resp.data?.inserted ?? '?'} rows.`;
    wizardCurrentPeriodFile.value = null;
    lastImportedPeriodId.value = selectedPeriodId.value;
    await loadPeriodDetails();
  } catch (e) {
    wizardImportError.value = e.response?.data?.error?.message || e.message || 'Import failed';
  } finally {
    wizardImportLoading.value = false;
  }
};

const wizardImportCurrentPeriodAndNext = async () => {
  await wizardImportCurrentPeriod();
  if (!wizardImportError.value) await wizardNext();
};

const saveManualPayLines = async () => {
  if (!selectedPeriodId.value) return;
  try {
    savingManualPayLines.value = true;
    manualPayLinesError.value = '';
    const rows = [...(manualPayLineDraftRows.value || [])];
    const kept = [];
    for (const r of rows) {
      if (!isValidManualPayLineDraftRow(r)) {
        kept.push(r);
        continue;
      }
      const uid = Number(r.userId || 0);
      const lineType = String(r?.lineType || 'pay').trim().toLowerCase() === 'pto' ? 'pto' : 'pay';
      const category = String(r.category || 'indirect').trim().toLowerCase();
      const ptoBucket = String(r?.ptoBucket || 'sick').trim().toLowerCase() === 'training' ? 'training' : 'sick';
      const creditsHours = (r?.creditsHours === null || r?.creditsHours === undefined || r?.creditsHours === '') ? null : Number(r?.creditsHours);
      const label = String(r.label || '').trim();
      const amount = lineType === 'pto' ? 0 : Number(r.amount);
      await api.post(`/payroll/periods/${selectedPeriodId.value}/manual-pay-lines`, { userId: uid, lineType, ptoBucket, category, creditsHours, label, amount });
    }
    manualPayLineDraftRows.value = kept.length
      ? kept
      : [{ _key: manualPayLineDraftRowSeq.value++, userId: null, lineType: 'pay', category: 'indirect', ptoBucket: 'sick', creditsHours: '', label: '', amount: '' }];
    await loadManualPayLines();
    await loadPeriodDetails();
  } catch (e) {
    manualPayLinesError.value = e.response?.data?.error?.message || e.message || 'Failed to add manual pay line';
  } finally {
    savingManualPayLines.value = false;
  }
};

const beginEditManualPayLine = (line) => {
  editingManualPayLineId.value = line.id;
  editingManualPayLineDraft.value = {
    category: String(line.category || 'direct').toLowerCase() === 'indirect' ? 'indirect' : 'direct',
    creditsHours: Number(line.credits_hours ?? line.creditsHours ?? 0),
    amount: Number(line.amount ?? 0)
  };
};

const cancelEditManualPayLine = () => {
  editingManualPayLineId.value = null;
  editingManualPayLineDraft.value = { category: 'direct', creditsHours: null, amount: null };
};

const saveEditManualPayLine = async (line) => {
  if (!selectedPeriodId.value || !line?.id) return;
  const creditsHours = editingManualPayLineDraft.value?.creditsHours;
  const amount = editingManualPayLineDraft.value?.amount;
  const category = editingManualPayLineDraft.value?.category;
  if (creditsHours === null || creditsHours === undefined || creditsHours === '' || !Number.isFinite(Number(creditsHours))) {
    manualPayLinesError.value = 'Hours/credits must be a number (negative allowed for reductions)';
    return;
  }
  if (amount === null || amount === undefined || amount === '' || !Number.isFinite(Number(amount))) {
    manualPayLinesError.value = 'Amount must be a valid number';
    return;
  }
  try {
    updatingManualPayLineId.value = line.id;
    manualPayLinesError.value = '';
    await api.patch(`/payroll/periods/${selectedPeriodId.value}/manual-pay-lines/${line.id}`, {
      category: String(category || 'direct'),
      creditsHours: Number(creditsHours),
      amount: Number(amount)
    });
    cancelEditManualPayLine();
    await loadManualPayLines();
    await loadPeriodDetails();
  } catch (e) {
    manualPayLinesError.value = e.response?.data?.error?.message || e.message || 'Failed to update manual pay line';
  } finally {
    updatingManualPayLineId.value = null;
  }
};

const deleteManualPayLine = async (line) => {
  if (!selectedPeriodId.value || !line?.id) return;
  const ok = window.confirm('Delete this manual pay line?');
  if (!ok) return;
  try {
    deletingManualPayLineId.value = line.id;
    manualPayLinesError.value = '';
    await api.delete(`/payroll/periods/${selectedPeriodId.value}/manual-pay-lines/${line.id}`);
    if (editingManualPayLineId.value === line.id) cancelEditManualPayLine();
    await loadManualPayLines();
    await loadPeriodDetails();
  } catch (e) {
    manualPayLinesError.value = e.response?.data?.error?.message || e.message || 'Failed to delete manual pay line';
  } finally {
    deletingManualPayLineId.value = null;
  }
};

const receiptUrl = (c) => {
  const raw = String(c?.receipt_file_path || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/uploads/${raw.substring('uploads/'.length)}`;
  // Legacy: some rows stored only the basename (no folder prefix)
  if (raw.startsWith('reimbursement-')) return `/uploads/reimbursements/${raw}`;
  if (raw.startsWith('company-card-expense-')) return `/uploads/company_card_expenses/${raw}`;
  return `/uploads/${raw}`;
};

const onSupervisionCsvPick = (e) => {
  const file = e?.target?.files?.[0] || null;
  supervisionCsvFile.value = file;
  supervisionCsvName.value = file?.name || '';
};

const uploadSupervisionCsv = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  if (!supervisionCsvFile.value) return;
  try {
    supervisionImporting.value = true;
    supervisionImportError.value = '';
    supervisionImportResult.value = null;
    const fd = new FormData();
    fd.append('file', supervisionCsvFile.value);
    const resp = await api.post(`/payroll/periods/${selectedPeriodId.value}/supervision/import`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    supervisionImportResult.value = resp.data || null;
  } catch (e) {
    supervisionImportError.value = e.response?.data?.error?.message || e.message || 'Failed to import supervision CSV';
  } finally {
    supervisionImporting.value = false;
  }
};

const splitSummary = (c) => {
  const raw = String(c?.splits_json || '').trim();
  if (!raw) return '';
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return '';
    return arr
      .map((s) => {
        const cat = String(s?.category || '').trim();
        const amt = Number(s?.amount || 0);
        if (!cat || !(amt > 0)) return null;
        return `${cat} ${fmtMoney(amt)}`;
      })
      .filter(Boolean)
      .join(', ');
  } catch {
    return '';
  }
};

const timeTypeLabel = (c) => {
  const t = String(c?.claim_type || '').toLowerCase();
  if (t === 'meeting_training') return 'Meeting/Training/Outreach';
  if (t === 'training_focus_completion') return 'Training Focus Completion';
  if (t === 'mentor_cpa_meeting') return 'Mentor/CPA Meeting';
  if (t === 'excess_holiday') return 'Excess time';
  if (t === 'service_correction') return 'Service correction';
  if (t === 'overtime_evaluation') return 'Overtime eval';
  if (t === 'holiday_pay') return 'Holiday pay';
  if (t === 'jury_duty') return 'Jury Duty';
  if (t === 'indirect_time') return 'Indirect time';
  return t ? t.replace(/_/g, ' ') : 'Time';
};

const timeClaimPayload = (c) => (c && typeof c.payload === 'object' && c.payload) ? c.payload : {};

const timeClaimNeedsLateOverrideWarning = (c) => {
  const suggestedId = Number(c?.suggested_payroll_period_id || 0);
  const targetId = Number(timeTargetPeriodByClaimId.value?.[c?.id] || 0);
  if (!suggestedId || !targetId || suggestedId === targetId) return false;
  const suggested = (periods.value || []).find((p) => Number(p?.id || 0) === suggestedId) || null;
  const target = (periods.value || []).find((p) => Number(p?.id || 0) === targetId) || null;
  const suggestedStart = String(suggested?.period_start || '').slice(0, 10);
  const targetStart = String(target?.period_start || '').slice(0, 10);
  if (suggestedStart && targetStart) return targetStart < suggestedStart;
  return false;
};

const timeClaimMinutes = (c) => {
  const payload = timeClaimPayload(c);
  const claimType = String(c?.claim_type || c?.claimType || '').toLowerCase();
  if (claimType === 'skill_builder_event') {
    const role = String(c?.bucket || payload?.bucketRole || '').toLowerCase();
    const hrs = role === 'direct'
      ? Number(payload?.directHours || 0)
      : (role === 'indirect' ? Number(payload?.indirectHours || 0) : Number(payload?.workedHours || 0));
    if (Number.isFinite(hrs) && hrs > 0) return Math.round(hrs * 60);
  }
  const explicit = Number(payload?.totalMinutes);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length) {
    let sum = 0;
    for (const it of items) {
      sum += Number(it?.directMinutes || 0) + Number(it?.indirectMinutes || 0);
    }
    if (Number.isFinite(sum) && sum > 0) return sum;
  }
  const direct = Number(payload?.directMinutes || 0);
  const indirect = Number(payload?.indirectMinutes || 0);
  const combined = direct + indirect;
  const hrs = Number(payload?.hoursWorked || 0);
  if (Number.isFinite(hrs) && hrs > 0) return Math.round(hrs * 60);
  // overtime_evaluation: sum hours from daysHours object (e.g. { mon: 2, tue: 3.5, ... })
  const daysHours = payload?.daysHours;
  if (daysHours && typeof daysHours === 'object') {
    const dayVals = Object.values(daysHours).map((v) => Number(v || 0)).filter((v) => v > 0);
    const daysTotal = dayVals.reduce((s, v) => s + v, 0);
    if (daysTotal > 0) return Math.round(daysTotal * 60);
  }
  // overtime_evaluation: sum hours from datesAndHours string (e.g. "4/7 (Mon): 2, 4/8 (Tue): 3.5, ...")
  const dah = String(payload?.datesAndHours || '');
  if (dah) {
    const matches = [...dah.matchAll(/\((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\):\s*([\d.]+)/gi)];
    const totalHrs = matches.reduce((s, m) => s + Number(m[1] || 0), 0);
    if (totalHrs > 0) return Math.round(totalHrs * 60);
  }
  return (Number.isFinite(combined) && combined > 0) ? combined : 0;
};

const timeClaimHours = (c) => {
  const col = Number(c?.credits_hours ?? c?.creditsHours);
  if (Number.isFinite(col) && col >= 0) return col;
  const mins = timeClaimMinutes(c);
  if (!(mins > 0)) return 0;
  return Math.round((mins / 60) * 100) / 100;
};

const timeRequestedLabel = (c) => {
  const mins = timeClaimMinutes(c);
  if (!(mins > 0)) return '—';
  const hrs = Math.round((mins / 60) * 100) / 100;
  return `${mins} min (${hrs} h)`;
};

const timeClaimOvertimeDayLabels = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' }
];

const timeClaimBoolLabel = (v) => {
  if (v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true') return 'Yes';
  if (v === false || v === 0 || v === '0' || String(v).toLowerCase() === 'false') return 'No';
  return '—';
};

const timeClaimMentorRoleLabel = (role) => {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'intern_mentor') return 'Intern Mentor';
  if (r === 'clinical_practice_assistant') return 'Clinical Practice Assistant (CPA)';
  return role || '—';
};

const timeClaimPeriodLabel = (periodId) => {
  const id = Number(periodId || 0);
  if (!id) return '—';
  const p = (periods.value || []).find((row) => Number(row?.id || 0) === id) || null;
  return p ? periodRangeLabel(p) : `Pay period #${id}`;
};

const timeClaimExcessDirectMinutes = (it) => {
  const n = Number(it?.actualDirectMinutes ?? it?.directMinutes ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const timeClaimExcessIndirectMinutes = (it) => {
  const n = Number(it?.actualIndirectMinutes ?? it?.indirectMinutes ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const timeClaimPayloadText = (val) => {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
};

const timeClaimReviewTargetPeriodId = (c) => {
  const fromDraft = Number(timeTargetPeriodByClaimId.value?.[c?.id] || 0);
  if (fromDraft) return fromDraft;
  return Number(c?.target_payroll_period_id || 0);
};

const defaultBucketForTimeClaim = (c) => {
  const bucket = String(c?.bucket || '').toLowerCase();
  if (bucket === 'direct' || bucket === 'indirect') return bucket;
  const payload = timeClaimPayload(c);
  const role = String(payload?.bucketRole || '').toLowerCase();
  if (role === 'direct' || role === 'indirect') return role;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length) {
    let totalDirect = 0;
    let totalIndirect = 0;
    for (const it of items) {
      totalDirect += Number(it?.directMinutes || 0);
      totalIndirect += Number(it?.indirectMinutes || 0);
    }
    if (totalDirect > 0 && !(totalIndirect > 0)) return 'direct';
    return 'indirect';
  }
  const direct = Number(payload?.directMinutes || 0);
  const indirect = Number(payload?.indirectMinutes || 0);
  if (direct > 0 && !(indirect > 0)) return 'direct';
  return 'indirect';
};

const isSkillBuilderEventTimeClaim = (c) =>
  String(c?.claim_type || c?.claimType || '').toLowerCase() === 'skill_builder_event';

const calcLateMinutes = (clockInAt, eventStartsAt, employeeReportTime) => {
  if (!clockInAt) return 0;
  const cin = new Date(clockInAt);
  if (!Number.isFinite(cin.getTime())) return 0;

  // Determine the expected time-of-day. Prefer the event's employee_report_time
  // (a local "HH:MM:SS" value); otherwise use the time-of-day from starts_at.
  let h = null, m = 0, s = 0;
  if (employeeReportTime) {
    const parts = String(employeeReportTime).split(':');
    h = Number(parts[0]); m = Number(parts[1] || 0); s = Number(parts[2] || 0);
  } else if (eventStartsAt) {
    const start = new Date(eventStartsAt);
    if (Number.isFinite(start.getTime())) {
      h = start.getHours(); m = start.getMinutes(); s = start.getSeconds();
    }
  }
  if (h === null || !Number.isFinite(h)) return 0;

  // Compare against the expected time on the clock-in's OWN date. This avoids
  // huge bogus values when a recurring event's starts_at is the series' first
  // occurrence (days/weeks before the actual session).
  const expected = new Date(cin.getFullYear(), cin.getMonth(), cin.getDate(), h, m, s, 0);
  return Math.max(0, Math.round((cin.getTime() - expected.getTime()) / 60000));
};

const eventTimeBucketRows = computed(() => {
  const rows = [];
  for (const s of eventTimeSubmissions.value || []) {
    const pendingStatuses = new Set(['submitted', 'deferred']);
    const canApproveBucket = (claim) =>
      !!claim?.id && pendingStatuses.has(String(claim?.status || '').toLowerCase());
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

// Show original values only when this submission has been edited from its auto-generated state.
const eventTimeEditOriginal = computed(() => {
  const sub = eventTimeEditSubmission.value;
  if (!sub?.wasEdited || !sub.originalValues) return null;
  return sub.originalValues;
});

// Late arrival info for the edit modal — compares the expected report time-of-day
// (on the clock-in's own date) to the actual clock-in.
const eventTimeEditLateArrival = computed(() => {
  const sub = eventTimeEditSubmission.value;
  if (!sub?.clockInAt) return null;
  const cin = new Date(sub.clockInAt);
  if (!Number.isFinite(cin.getTime())) return null;

  let h = null, m = 0, s = 0;
  if (sub.eventEmployeeReportTime) {
    const parts = String(sub.eventEmployeeReportTime).split(':');
    h = Number(parts[0]); m = Number(parts[1] || 0); s = Number(parts[2] || 0);
  } else if (sub.eventStartsAt) {
    const start = new Date(sub.eventStartsAt);
    if (Number.isFinite(start.getTime())) { h = start.getHours(); m = start.getMinutes(); s = start.getSeconds(); }
  }
  if (h === null || !Number.isFinite(h)) return null;

  const expected = new Date(cin.getFullYear(), cin.getMonth(), cin.getDate(), h, m, s, 0);
  const lateMs = cin.getTime() - expected.getTime();
  if (lateMs <= 0) return null;
  const lateMinutes = Math.round(lateMs / 60000);
  const cap = Number(eventTimeEditDirectCap.value);
  const adjustedCap = Number.isFinite(cap) && cap > 0
    ? Math.max(0, Math.round((cap - lateMinutes / 60) * 100) / 100)
    : null;
  return {
    lateMinutes,
    eventStartDisplay: expected.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    adjustedCap
  };
});

const applyLateArrivalDeduction = () => {
  const la = eventTimeEditLateArrival.value;
  if (la?.adjustedCap != null) {
    eventTimeEditDirectCap.value = String(la.adjustedCap);
  }
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

const loadApprovedHolidayBonusClaimsList = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    approvedHolidayBonusListLoading.value = true;
    approvedHolidayBonusListError.value = '';
    const resp = await api.get('/payroll/holiday-bonus-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        payrollPeriodId: selectedPeriodId.value
      }
    });
    approvedHolidayBonusClaims.value = resp.data || [];
  } catch (e) {
    approvedHolidayBonusListError.value = e.response?.data?.error?.message || e.message || 'Failed to load approved holiday bonuses';
    approvedHolidayBonusClaims.value = [];
  } finally {
    approvedHolidayBonusListLoading.value = false;
  }
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
    await reloadPendingMileageClaims();
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
    await reloadPendingMedcancelClaims();
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
    approvedTimeClaims.value = (resp.data || []).filter((r) => !isSkillBuilderEventTimeClaim(r));
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
  pendingReimbursementMode.value = 'period';
  try {
    pendingReimbursementLoading.value = true;
    pendingReimbursementError.value = '';
    const resp = await api.get('/payroll/reimbursement-claims', {
      params: { agencyId: agencyId.value, status: 'submitted', targetPeriodId: selectedPeriodId.value }
    });
    pendingReimbursementClaims.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
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
  pendingReimbursementMode.value = 'all';
  try {
    pendingReimbursementLoading.value = true;
    pendingReimbursementError.value = '';
    const resp = await api.get('/payroll/reimbursement-claims', {
      params: { agencyId: agencyId.value, status: 'submitted' }
    });
    pendingReimbursementClaims.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
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

const reloadPendingReimbursementClaims = async () => {
  if (pendingReimbursementMode.value === 'all') return await loadAllPendingReimbursementClaims();
  return await loadPendingReimbursementClaims();
};

const loadPendingTimeClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  pendingTimeMode.value = 'period';
  try {
    pendingTimeLoading.value = true;
    pendingTimeError.value = '';
    // Submitted claims usually have null target until approve — use agency-wide + suggested/period filter.
    const resp = await api.get('/payroll/time-claims', {
      params: { agencyId: agencyId.value, status: 'submitted' }
    });
    const periodId = Number(selectedPeriodId.value);
    pendingTimeClaims.value = (resp.data || []).filter((r) => {
      if (!r || typeof r !== 'object' || isSkillBuilderEventTimeClaim(r)) return false;
      const target = Number(r.target_payroll_period_id || 0);
      if (target && target !== periodId) return false;
      const suggested = Number(r.suggested_payroll_period_id || 0);
      return !suggested || suggested === periodId;
    });
    const next = { ...(timeTargetPeriodByClaimId.value || {}) };
    const bNext = { ...(timeBucketByClaimId.value || {}) };
    const hNext = { ...(timeCreditsHoursByClaimId.value || {}) };
    const aNext = { ...(timeAppliedAmountOverrideByClaimId.value || {}) };
    for (const c of pendingTimeClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || selectedPeriodId.value;
      bNext[c.id] = bNext[c.id] || defaultBucketForTimeClaim(c);
      if (hNext[c.id] === undefined) hNext[c.id] = timeClaimHours(c) > 0 ? String(timeClaimHours(c)) : '';
      if (aNext[c.id] === undefined) aNext[c.id] = '';
    }
    timeTargetPeriodByClaimId.value = next;
    timeBucketByClaimId.value = bNext;
    timeCreditsHoursByClaimId.value = hNext;
    timeAppliedAmountOverrideByClaimId.value = aNext;
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending time claims';
    pendingTimeClaims.value = [];
  } finally {
    pendingTimeLoading.value = false;
  }
};

const loadAllPendingTimeClaims = async () => {
  if (!agencyId.value) return;
  pendingTimeMode.value = 'all';
  try {
    pendingTimeLoading.value = true;
    pendingTimeError.value = '';
    const resp = await api.get('/payroll/time-claims', {
      params: { agencyId: agencyId.value, status: 'submitted' }
    });
    pendingTimeClaims.value = (resp.data || []).filter((r) => !!r && typeof r === 'object' && !isSkillBuilderEventTimeClaim(r));
    const next = { ...(timeTargetPeriodByClaimId.value || {}) };
    const bNext = { ...(timeBucketByClaimId.value || {}) };
    const hNext = { ...(timeCreditsHoursByClaimId.value || {}) };
    const aNext = { ...(timeAppliedAmountOverrideByClaimId.value || {}) };
    for (const c of pendingTimeClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || c.suggested_payroll_period_id || selectedPeriodId.value;
      bNext[c.id] = bNext[c.id] || defaultBucketForTimeClaim(c);
      if (hNext[c.id] === undefined) hNext[c.id] = timeClaimHours(c) > 0 ? String(timeClaimHours(c)) : '';
      if (aNext[c.id] === undefined) aNext[c.id] = '';
    }
    timeTargetPeriodByClaimId.value = next;
    timeBucketByClaimId.value = bNext;
    timeCreditsHoursByClaimId.value = hNext;
    timeAppliedAmountOverrideByClaimId.value = aNext;
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending time claims';
    pendingTimeClaims.value = [];
  } finally {
    pendingTimeLoading.value = false;
  }
};

const reloadPendingTimeClaims = async () => {
  if (pendingTimeMode.value === 'all') await loadAllPendingTimeClaims();
  else await loadPendingTimeClaims();
  await loadEventTimeSubmissions();
};

const formatEventTimeIso = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
};

const loadEventTimeSubmissions = async () => {
  if (!agencyId.value) return;
  try {
    eventTimeLoading.value = true;
    eventTimeError.value = '';
    const resp = await api.get('/payroll/event-time-submissions', {
      params: {
        agencyId: agencyId.value,
        status: eventTimeShowApproved.value ? 'submitted,approved,rejected,deferred' : 'submitted',
        // For pending view: show ALL unapproved submissions agency-wide so nothing falls
        // through the cracks (e.g. claims whose suggested period doesn't match the open period).
        // For history view: filter to the selected period so you see what was approved into it.
        suggestedPeriodId: eventTimeShowApproved.value ? (selectedPeriodId.value || undefined) : undefined
      }
    });
    const submissions = Array.isArray(resp.data?.submissions) ? resp.data.submissions : [];
    eventTimeSubmissions.value = submissions;
    // Seed per-submission target period. Always prefer a schedule-aligned period:
    // 1. If the claim's suggested period is aligned → use it.
    // 2. Otherwise find the aligned period whose date range contains the clock-out date.
    // 3. Fall back to the currently selected period.
    const next = { ...(eventTimeTargetPeriodByPunchId.value || {}) };
    const aligned = (periods.value || []).filter((p) => Number(p.schedule_aligned) === 1);
    for (const s of submissions) {
      if (next[s.punchInId]) continue; // keep user's manual selection
      const claim = s.directClaim || s.indirectClaim;
      const suggestedId = Number(claim?.suggestedPayrollPeriodId || 0);
      const suggestedPeriod = suggestedId ? (periods.value || []).find((p) => Number(p.id) === suggestedId) : null;
      if (suggestedPeriod && Number(suggestedPeriod.schedule_aligned) === 1) {
        next[s.punchInId] = suggestedId;
        continue;
      }
      // Suggested period is missing or off-schedule — find aligned period by date.
      const dateStr = String(s.clockOutAt || s.clockInAt || '').slice(0, 10);
      const matchedAligned = dateStr
        ? aligned.find((p) => {
            const ps = String(p.period_start || '').slice(0, 10);
            const pe = String(p.period_end || '').slice(0, 10);
            return dateStr >= ps && dateStr <= pe;
          })
        : null;
      next[s.punchInId] = matchedAligned ? matchedAligned.id : (Number(selectedPeriodId.value) || null);
    }
    eventTimeTargetPeriodByPunchId.value = next;
  } catch (e) {
    eventTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to load event time submissions';
    eventTimeSubmissions.value = [];
  } finally {
    eventTimeLoading.value = false;
  }
};

const toggleEventTimeShowApproved = async () => {
  eventTimeShowApproved.value = !eventTimeShowApproved.value;
  await loadEventTimeSubmissions();
};

// Label for the pay period an event-time claim is posted to (target) or suggested for.
const eventTimePeriodLabel = (claim) => {
  if (!claim) return '—';
  const pid = claim.targetPayrollPeriodId || claim.suggestedPayrollPeriodId || null;
  if (!pid) return '—';
  const p = (periods.value || []).find((x) => Number(x.id) === Number(pid));
  return p ? periodRangeLabel(p) : `#${pid}`;
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
    eventTimeEditError.value = e.response?.data?.error?.message || e.message || 'Failed to save event time';
  } finally {
    eventTimeEditSaving.value = false;
  }
};

const approveEventTimeSubmission = async (submission, bucket) => {
  if (!agencyId.value || !submission) return;
  const targetPeriodId = Number(eventTimeTargetPeriodByPunchId.value?.[submission.punchInId] || selectedPeriodId.value || 0);
  if (!targetPeriodId) {
    eventTimeError.value = 'Select a pay period before approving.';
    return;
  }
  const claim = bucket === 'direct' ? submission.directClaim : submission.indirectClaim;
  if (!claim?.id) return;
  eventTimeSavingId.value = submission.punchInId;
  try {
    await api.patch(`/payroll/time-claims/${claim.id}`, {
      action: 'approve',
      targetPayrollPeriodId: targetPeriodId,
      bucket,
      creditsHours: bucket === 'direct' ? submission.directHours : submission.indirectHours
    });
    await loadEventTimeSubmissions();
    await reloadPendingTimeClaims();
  } catch (e) {
    eventTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to approve event time claim';
  } finally {
    eventTimeSavingId.value = null;
  }
};

// Reject both buckets (direct + indirect) of an event-time submission.
const rejectEventTimeSubmission = async (submission) => {
  if (!agencyId.value || !submission) return;
  const reason = window.prompt('Reject this event time? Enter a reason (required):', '') || '';
  if (!String(reason).trim()) return;
  const claimIds = [submission.directClaim?.id, submission.indirectClaim?.id].filter(Boolean);
  if (!claimIds.length) return;
  eventTimeSavingId.value = submission.punchInId;
  try {
    for (const id of claimIds) {
      await api.patch(`/payroll/time-claims/${id}`, { action: 'reject', rejectionReason: String(reason).trim() });
    }
    await loadEventTimeSubmissions();
    await reloadPendingTimeClaims();
  } catch (e) {
    eventTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to reject event time';
  } finally {
    eventTimeSavingId.value = null;
  }
};

// Unapprove both buckets of an approved event-time submission (returns to Pending).
const unapproveEventTimeSubmission = async (submission) => {
  if (!agencyId.value || !submission) return;
  const ok = window.confirm('Unapprove this event time? It will return to Pending so it can be edited or re-approved.');
  if (!ok) return;
  const claimIds = [submission.directClaim?.id, submission.indirectClaim?.id].filter(Boolean);
  if (!claimIds.length) return;
  eventTimeSavingId.value = submission.punchInId;
  try {
    for (const id of claimIds) {
      await api.patch(`/payroll/time-claims/${id}`, { action: 'unapprove' });
    }
    await loadEventTimeSubmissions();
    await reloadPendingTimeClaims();
  } catch (e) {
    eventTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to unapprove event time';
  } finally {
    eventTimeSavingId.value = null;
  }
};

// Send back both buckets of an event-time submission to the employee for changes.
const returnEventTimeSubmission = async (submission) => {
  if (!agencyId.value || !submission) return;
  const note = window.prompt('Send back to employee. Enter a note (required):', '') || '';
  if (!String(note).trim()) return;
  const claimIds = [submission.directClaim?.id, submission.indirectClaim?.id].filter(Boolean);
  if (!claimIds.length) return;
  eventTimeSavingId.value = submission.punchInId;
  try {
    for (const id of claimIds) {
      await api.patch(`/payroll/time-claims/${id}`, { action: 'return', note: String(note).trim() });
    }
    await loadEventTimeSubmissions();
    await reloadPendingTimeClaims();
  } catch (e) {
    eventTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to send back event time';
  } finally {
    eventTimeSavingId.value = null;
  }
};

const loadPendingHolidayBonusClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  pendingHolidayBonusMode.value = 'period';
  try {
    pendingHolidayBonusLoading.value = true;
    pendingHolidayBonusError.value = '';
    const resp = await api.get('/payroll/holiday-bonus-claims', {
      params: { agencyId: agencyId.value, status: 'submitted', payrollPeriodId: selectedPeriodId.value }
    });
    pendingHolidayBonusClaims.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
  } catch (e) {
    pendingHolidayBonusError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending holiday bonuses';
    pendingHolidayBonusClaims.value = [];
  } finally {
    pendingHolidayBonusLoading.value = false;
  }
};

const loadAllPendingHolidayBonusClaims = async () => {
  if (!agencyId.value) return;
  pendingHolidayBonusMode.value = 'all';
  try {
    pendingHolidayBonusLoading.value = true;
    pendingHolidayBonusError.value = '';
    const resp = await api.get('/payroll/holiday-bonus-claims', {
      params: { agencyId: agencyId.value, status: 'submitted' }
    });
    pendingHolidayBonusClaims.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
  } catch (e) {
    pendingHolidayBonusError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending holiday bonuses';
    pendingHolidayBonusClaims.value = [];
  } finally {
    pendingHolidayBonusLoading.value = false;
  }
};

const reloadPendingHolidayBonusClaims = async () => {
  if (pendingHolidayBonusMode.value === 'all') return await loadAllPendingHolidayBonusClaims();
  return await loadPendingHolidayBonusClaims();
};

const approveHolidayBonusClaim = async (c) => {
  if (!c?.id) return;
  try {
    updatingHolidayBonusClaimId.value = c.id;
    pendingHolidayBonusError.value = '';
    await api.patch(`/payroll/holiday-bonus-claims/${c.id}`, { action: 'approve' });
    await reloadPendingHolidayBonusClaims();
    await loadApprovedHolidayBonusClaimsList();
    await loadApprovedHolidayBonusClaimsAmount();
    await loadPeriodDetails();
  } catch (e) {
    pendingHolidayBonusError.value = e.response?.data?.error?.message || e.message || 'Failed to approve holiday bonus';
  } finally {
    updatingHolidayBonusClaimId.value = null;
  }
};

const rejectHolidayBonusClaim = async (c) => {
  if (!c?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason || '').trim()) return;
  try {
    updatingHolidayBonusClaimId.value = c.id;
    pendingHolidayBonusError.value = '';
    await api.patch(`/payroll/holiday-bonus-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() });
    await reloadPendingHolidayBonusClaims();
    await loadPeriodDetails();
  } catch (e) {
    pendingHolidayBonusError.value = e.response?.data?.error?.message || e.message || 'Failed to reject holiday bonus';
  } finally {
    updatingHolidayBonusClaimId.value = null;
  }
};

const unapproveHolidayBonusClaim = async (c) => {
  if (!c?.id) return;
  const ok = window.confirm('Unapprove this holiday bonus? It will return to Pending for re-approval.');
  if (!ok) return;
  try {
    unapprovingHolidayBonusClaimId.value = c.id;
    approvedHolidayBonusListError.value = '';
    await api.patch(`/payroll/holiday-bonus-claims/${c.id}`, { action: 'unapprove' });
    await loadApprovedHolidayBonusClaimsList();
    await reloadPendingHolidayBonusClaims();
    await loadApprovedHolidayBonusClaimsAmount();
    await loadPeriodDetails();
  } catch (e) {
    approvedHolidayBonusListError.value = e.response?.data?.error?.message || e.message || 'Failed to unapprove holiday bonus';
  } finally {
    unapprovingHolidayBonusClaimId.value = null;
  }
};

const isPtoRequestInSelectedPeriod = (r) => {
  const p = selectedPeriod.value || null;
  if (!p) return true; // if no selection, treat as visible
  const start = String(p.period_start || '').slice(0, 10);
  const end = String(p.period_end || '').slice(0, 10);
  if (!start || !end) return true;
  const items = Array.isArray(r?.items) ? r.items : [];
  return items.some((it) => {
    const d = String(it?.request_date || it?.requestDate || '').slice(0, 10);
    return d && d >= start && d <= end;
  });
};

const ptoDefaultTargetPeriodId = (r) => {
  const items = Array.isArray(r?.items) ? r.items : [];
  const firstDate = items
    .map((it) => String(it?.request_date || it?.requestDate || '').slice(0, 10))
    .filter(Boolean)
    .sort()[0] || '';
  const containing = firstDate
    ? (periods.value || []).find((p) => {
        const start = String(p?.period_start || '').slice(0, 10);
        const end = String(p?.period_end || '').slice(0, 10);
        return start && end && firstDate >= start && firstDate <= end;
      })
    : null;
  return Number(containing?.id || selectedPeriodId.value || 0) || null;
};

const fetchAllPendingPtoRequests = async () => {
  if (!agencyId.value) return;
  try {
    pendingPtoLoading.value = true;
    pendingPtoError.value = '';
    const resp = await api.get('/payroll/pto-requests', {
      params: { agencyId: agencyId.value, status: 'submitted,approved,rejected,deferred' }
    });
    pendingPtoRequests.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
    ptoAllRequests.value = pendingPtoRequests.value;
    const nextTarget = { ...(ptoTargetPeriodByRequestId.value || {}) };
    for (const r of pendingPtoRequests.value || []) {
      if (!nextTarget[r.id]) nextTarget[r.id] = ptoDefaultTargetPeriodId(r);
    }
    ptoTargetPeriodByRequestId.value = nextTarget;

    // Fetch balances for preview (starting balance / projected balance).
    const ids = Array.from(
      new Set((pendingPtoRequests.value || []).map((x) => Number(x?.user_id || 0)).filter((n) => Number.isFinite(n) && n > 0))
    );
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
  } catch (e) {
    pendingPtoError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending PTO requests';
    pendingPtoRequests.value = [];
    ptoAllRequests.value = [];
  } finally {
    pendingPtoLoading.value = false;
  }
};

const loadAllPendingPtoRequests = async () => {
  pendingPtoMode.value = 'all';
  await fetchAllPendingPtoRequests();
};

const loadPendingPtoRequests = async () => {
  pendingPtoMode.value = 'period';
  await fetchAllPendingPtoRequests();
  if (!selectedPeriodId.value) return;
  // Period filter only applies to submitted (pending) requests; approved/rejected always remain visible.
  const filtered = (ptoAllRequests.value || []).filter((r) => {
    const st = String(r.status || '').toLowerCase();
    if (st !== 'submitted') return true; // always show non-pending
    return isPtoRequestInSelectedPeriod(r);
  });
  ptoAllRequests.value = filtered;
  pendingPtoRequests.value = filtered;
};

const reloadPendingPtoRequests = async () => {
  if (pendingPtoMode.value === 'all') return await loadAllPendingPtoRequests();
  return await loadPendingPtoRequests();
};

const ptoBalancePreviewForRequest = (r) => {
  const uid = Number(r?.user_id || 0);
  const b = ptoBalancesByUserId.value?.[uid] || { sickHours: 0, trainingHours: 0 };
  const hours = Number(r?.total_hours || 0);
  const bucket = String(r?.request_type || '').toLowerCase() === 'training' ? 'training' : 'sick';
  const start = bucket === 'training' ? Number(b.trainingHours || 0) : Number(b.sickHours || 0);
  const requested = Number.isFinite(hours) ? hours : 0;
  const next = start - requested;
  return { bucket, start, requested, next };
};

const approvePtoRequest = async (r) => {
  if (!r?.id) return;
  const targetPayrollPeriodId = Number(ptoTargetPeriodByRequestId.value?.[r.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) {
    pendingPtoError.value = 'Choose a target pay period for this PTO request.';
    return;
  }
  if (isTargetPeriodLocked(targetPayrollPeriodId)) {
    pendingPtoError.value = 'Target pay period is posted (locked). Choose an open pay period.';
    return;
  }
  try {
    approvingPtoRequestId.value = r.id;
    pendingPtoError.value = '';
    try {
      await api.patch(`/payroll/pto-requests/${r.id}`, { action: 'approve', targetPayrollPeriodId });
    } catch (e) {
      const status = e.response?.status || 0;
      const msg = e.response?.data?.error?.message || e.message || '';
      const lower = String(msg).toLowerCase();
      const looksLikeDeadline = lower.includes('deadline') || lower.includes('cutoff') || lower.includes('past the submission deadline');
      const looksLikeBalance = lower.includes('insufficient pto balance');

      if (looksLikeBalance) {
        const ok = window.confirm(
          `${msg}\n\nApprove anyway using an admin override? (This can result in a negative PTO balance.)`
        );
        if (!ok) throw e;
        await api.patch(`/payroll/pto-requests/${r.id}`, { action: 'approve', targetPayrollPeriodId, overrideBalance: true });
      } else if ((status === 409 || status === 500) && looksLikeDeadline) {
        const ok = window.confirm(
          `${msg || 'This request was submitted after the cutoff for the intended pay period.'}\n\nApprove anyway using an admin override?`
        );
        if (!ok) throw e;
        await api.patch(`/payroll/pto-requests/${r.id}`, { action: 'approve', targetPayrollPeriodId, overrideDeadline: true });
      } else {
        throw e;
      }
    }
    await reloadPendingPtoRequests();
    // Refresh balances for this user so previews reflect the approval.
    try {
      const uid = Number(r?.user_id || 0);
      if (uid && agencyId.value) {
        const b = await api.get(`/payroll/users/${uid}/pto-balances`, { params: { agencyId: agencyId.value } });
        ptoBalancesByUserId.value = {
          ...(ptoBalancesByUserId.value || {}),
          [uid]: {
            sickHours: Number(b.data?.balances?.sickHours ?? 0),
            trainingHours: Number(b.data?.balances?.trainingHours ?? 0)
          }
        };
      }
    } catch { /* best-effort */ }
    await loadPeriodDetails();
  } catch (e) {
    pendingPtoError.value = e.response?.data?.error?.message || e.message || 'Failed to approve PTO request';
  } finally {
    approvingPtoRequestId.value = null;
  }
};

const rejectPtoRequest = async (r) => {
  if (!r?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingPtoRequestId.value = r.id;
    pendingPtoError.value = '';
    await api.patch(`/payroll/pto-requests/${r.id}`, { action: 'reject', rejectionReason: String(reason).trim() });
    await reloadPendingPtoRequests();
  } catch (e) {
    pendingPtoError.value = e.response?.data?.error?.message || e.message || 'Failed to reject PTO request';
  } finally {
    approvingPtoRequestId.value = null;
  }
};

const returnPtoRequest = async (r) => {
  if (!r?.id) return;
  const reason = window.prompt('Send back note (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingPtoRequestId.value = r.id;
    pendingPtoError.value = '';
    await api.patch(`/payroll/pto-requests/${r.id}`, { action: 'return', reason: String(reason).trim() });
    await reloadPendingPtoRequests();
  } catch (e) {
    pendingPtoError.value = e.response?.data?.error?.message || e.message || 'Failed to send back PTO request';
  } finally {
    approvingPtoRequestId.value = null;
  }
};

const approveTimeClaim = async (c) => {
  if (!c?.id) return;
  const targetPayrollPeriodId = Number(timeTargetPeriodByClaimId.value?.[c.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) return;
  const bucket = String(timeBucketByClaimId.value?.[c.id] || 'indirect').trim().toLowerCase() === 'direct' ? 'direct' : 'indirect';
  const creditsRaw = timeCreditsHoursByClaimId.value?.[c.id];
  const creditsHours = (creditsRaw === null || creditsRaw === undefined || String(creditsRaw).trim() === '') ? null : Number(creditsRaw);
  if (creditsHours !== null && (!Number.isFinite(creditsHours) || creditsHours < 0)) {
    pendingTimeError.value = 'Hours/Credits must be a non-negative number (or blank).';
    return;
  }
  const overrideRaw = timeAppliedAmountOverrideByClaimId.value?.[c.id];
  const appliedAmount = (overrideRaw === null || overrideRaw === undefined || String(overrideRaw).trim() === '') ? null : Number(overrideRaw);
  if (appliedAmount !== null && (!Number.isFinite(appliedAmount) || appliedAmount < 0)) {
    pendingTimeError.value = 'Applied amount must be a non-negative number (or blank).';
    return;
  }
  try {
    approvingTimeClaimId.value = c.id;
    pendingTimeError.value = '';
    try {
      await api.patch(`/payroll/time-claims/${c.id}`, {
        action: 'approve',
        targetPayrollPeriodId,
        bucket,
        creditsHours,
        appliedAmount
      });
    } catch (e) {
      const status = e.response?.status || 0;
      const msg = e.response?.data?.error?.message || e.message || '';
      const looksLikeDeadline =
        String(msg).toLowerCase().includes('deadline') ||
        String(msg).toLowerCase().includes('submitted after') ||
        String(msg).toLowerCase().includes('cannot be added to an earlier pay period');
      if (status === 409 && looksLikeDeadline) {
        const ok = window.confirm(
          'This submission was entered after the cutoff for this pay period.\n\nAdd it to this payroll anyway using an admin override?'
        );
        if (!ok) throw e;
        await api.patch(`/payroll/time-claims/${c.id}`, {
          action: 'approve',
          targetPayrollPeriodId,
          bucket,
          creditsHours,
          appliedAmount,
          overrideDeadline: true
        });
      } else {
        throw e;
      }
    }
    await reloadPendingTimeClaims();
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
    await reloadPendingTimeClaims();
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
    await reloadPendingTimeClaims();
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
    await reloadPendingTimeClaims();
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
    await reloadPendingReimbursementClaims();
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
    await reloadPendingReimbursementClaims();
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
    await reloadPendingReimbursementClaims();
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
    await reloadPendingReimbursementClaims();
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
const normalizeServiceCodeKey = (v) => String(v || '').trim().toUpperCase();
const stageKeyNormalized = (userId, serviceCode) => `${Number(userId)}:${normalizeServiceCodeKey(serviceCode)}`;

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

const carryoverPriorStillUnpaidPeriodLabel = computed(() => {
  const priorId = carryoverPriorStillUnpaidMeta.value?.priorPeriodId || carryoverPriorPeriodId.value || null;
  if (!priorId) return '';
  const p = (periods.value || []).find((x) => Number(x.id) === Number(priorId)) || null;
  return p ? periodRangeLabel(p) : `Pay period #${priorId}`;
});

const priorStillUnpaidUnitsByStageKey = computed(() => {
  // Guard against showing stale comparison results when switching pay periods.
  if (
    carryoverPriorStillUnpaidMeta.value?.currentPeriodId &&
    Number(carryoverPriorStillUnpaidMeta.value.currentPeriodId) !== Number(selectedPeriodId.value)
  ) {
    return {};
  }
  const m = {};
  for (const r of carryoverPriorStillUnpaid.value || []) {
    if (!r?.userId || !r?.serviceCode) continue;
    const k = stageKeyNormalized(r.userId, r.serviceCode);
    const v = Number(r.stillUnpaidUnits || 0);
    if (Number.isFinite(v) && v > 0) m[k] = v;
  }
  return m;
});

const priorStillUnpaidOrphanRowsForStage = computed(() => {
  // Orphans = still unpaid rows from prior period that do NOT have a matching row
  // in the current staging table (so they can’t be displayed inline).
  if (
    carryoverPriorStillUnpaidMeta.value?.currentPeriodId &&
    Number(carryoverPriorStillUnpaidMeta.value.currentPeriodId) !== Number(selectedPeriodId.value)
  ) {
    return [];
  }

  const stagingKeys = new Set(
    (stagingMatched.value || []).map((r) => stageKeyNormalized(r?.userId, r?.serviceCode))
  );

  let rows = (carryoverPriorStillUnpaid.value || [])
    .filter((r) => !!r?.userId && !!r?.serviceCode && Number(r?.stillUnpaidUnits || 0) > 0)
    .filter((r) => !stagingKeys.has(stageKeyNormalized(r.userId, r.serviceCode)));

  if (selectedUserId.value) {
    rows = rows.filter((r) => Number(r.userId) === Number(selectedUserId.value));
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

  // Super admins should always see the full org list from /agencies, even if some
  // other view populated userAgencies earlier (which may be a subset).
  const role = String(authStore.user?.role || '').trim().toLowerCase();
  const base = (role === 'super_admin')
    ? (Array.isArray(aa) ? aa : [])
    : ((Array.isArray(ua) && ua.length > 0) ? ua : (Array.isArray(aa) ? aa : []));

  // Payroll only runs at the Agency org level.
  //
  // Important: some child orgs (schools/programs) may appear here depending on how the
  // org list is hydrated. We treat any org with an active `affiliated_agency_id` as a child
  // org and exclude it, even if organization_type is missing/incorrect.
  return base.filter((a) => {
    const orgType = String(a?.organization_type || '').toLowerCase();
    const isAgencyType = !orgType || orgType === 'agency';
    const isAffiliatedChildOrg = Number(a?.affiliated_agency_id || 0) > 0;
    return isAgencyType && !isAffiliatedChildOrg;
  });
});

const filteredAgencies = computed(() => {
  const all = (payrollAgencyOptions.value || []).slice();
  all.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
  const q = String(orgSearch.value || '').trim().toLowerCase();
  if (!q) return all;
  return all.filter((a) => String(a?.name || '').toLowerCase().includes(q));
});

const showOrgPicker = computed(() => {
  // Only show the organization selector if the user can actually switch payroll orgs.
  // Super admins can always switch; others only if they have more than one payroll agency option.
  if (isSuperAdmin.value) return true;
  return (payrollAgencyOptions.value || []).length > 1;
});

const sortedPeriods = computed(() => {
  // When "Show off-schedule periods" is off, hide unaligned periods from the list view.
  // All periods are still loaded for label/picker resolution (see loadPeriods).
  const all = (periods.value || [])
    .filter((p) => showOffSchedulePeriods.value || Number(p.schedule_aligned) === 1)
    .slice();
  // Sort by period_end desc, then id desc
  all.sort((a, b) => {
    const ae = String(a?.period_end || '');
    const be = String(b?.period_end || '');
    if (ae !== be) return be.localeCompare(ae);
    return (b?.id || 0) - (a?.id || 0);
  });
  return all;
});

// Ensures the selected period is always in the dropdown (e.g. when filtered out by alignedOnly).
const periodsForSelect = computed(() => {
  const source = periods.value || [];

  // Filter to org-relevant (schedule-aligned) periods only, same as the wizard.
  let aligned = source.filter((p) => Number(p.schedule_aligned) === 1);
  // Fallback: if no periods have the flag set yet, show everything
  if (!aligned.length) aligned = source.slice();

  // Sort newest first
  aligned.sort((a, b) => {
    const ae = String(a?.period_end || '');
    const be = String(b?.period_end || '');
    if (ae !== be) return be.localeCompare(ae);
    return (b?.id || 0) - (a?.id || 0);
  });

  // Always keep the currently selected period visible even if filtered out
  const selId = selectedPeriodId.value;
  const selPeriod = selectedPeriod.value;
  if (selId && selPeriod && !aligned.some((p) => Number(p.id) === Number(selId))) {
    aligned = [...aligned, selPeriod];
  }

  return aligned;
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

const historyPeriodsFiltered = computed(() => {
  const all = (historyPeriods.value || []).slice();
  const q = String(historySearch.value || '').trim().toLowerCase();
  if (!q) return all;
  return all.filter((p) => {
    const label = String(periodRangeLabel(p) || '').toLowerCase();
    const status = String(p?.status || '').toLowerCase();
    const ranBy = `${p?.finalized_by_first_name || ''} ${p?.finalized_by_last_name || ''}`.trim().toLowerCase();
    const ranAt = String(p?.finalized_at || '').slice(0, 19).toLowerCase();
    return (
      label.includes(q) ||
      status.includes(q) ||
      ranBy.includes(q) ||
      ranAt.includes(q)
    );
  });
});


const selectedUserName = computed(() => {
  const u = agencyUsers.value.find((x) => x.id === selectedUserId.value);
  if (u) return `${u.first_name} ${u.last_name}`.trim();
  if (selectedSummary.value) return `${selectedSummary.value.first_name} ${selectedSummary.value.last_name}`.trim();
  return 'Provider';
});

// Selected period status can temporarily be null if `loadPeriodDetails` fails.
// Use the cached period list as a fallback so core actions (view/export) don't "silently disable".
const selectedPeriodStatus = computed(() => {
  const id = Number(selectedPeriodId.value || 0);
  const cur = selectedPeriod.value && Number(selectedPeriod.value.id) === id ? selectedPeriod.value : null;
  const fromList = !cur && id ? (periods.value || []).find((p) => Number(p?.id) === id) : null;
  const st = String((cur || fromList)?.status || '').trim().toLowerCase();
  return st;
});

const selectedPeriodForUi = computed(() => {
  const id = Number(selectedPeriodId.value || 0);
  if (!id) return selectedPeriod.value || null;
  if (selectedPeriod.value && Number(selectedPeriod.value.id) === id) return selectedPeriod.value;
  return (periods.value || []).find((p) => Number(p?.id) === id) || selectedPeriod.value || null;
});

const isPeriodPosted = computed(() => selectedPeriodStatus.value === 'posted' || selectedPeriodStatus.value === 'finalized');

const isPeriodRan = computed(() => selectedPeriodStatus.value === 'ran');

// Strict allowlist — only roles that receive payroll (clinical/therapy staff + admin/support).
const PAYROLL_STAFF_ROLES = new Set([
  'provider',
  'supervisor',
  'clinical_practice_assistant',
  'provider_plus',
  'staff',
  'facilitator',
  'intern',
  'admin',
  'super_admin',
  'support',
]);

const dashboardEmployeeCount = computed(() =>
  (agencyUsers.value || []).filter((u) => {
    const role = String(u?.role || '').toLowerCase();
    return PAYROLL_STAFF_ROLES.has(role);
  }).length
);

const dashboardPendingCount = computed(() => {
  // Use the fast backend count loaded with period details whenever available.
  if (dashboardPendingCounts.value != null) return Number(dashboardPendingCounts.value.total || 0);
  // Fallback: sum from the lazy-loaded Stage arrays (will be 0 until Stage opens — intentional).
  const eventPending = (eventTimeSubmissions.value || []).filter((s) => {
    const pending = new Set(['submitted', 'deferred']);
    return pending.has(String(s?.directClaim?.status || '').toLowerCase())
      || pending.has(String(s?.indirectClaim?.status || '').toLowerCase());
  }).length;
  return (
    (pendingMileageClaims.value || []).length
    + (pendingMedcancelClaims.value || []).length
    + (pendingReimbursementClaims.value || []).length
    + (pendingTimeClaims.value || []).length
    + eventPending
    + (pendingHolidayBonusClaims.value || []).length
    + (pendingPtoRequests.value || []).length
  );
});

const dashboardNextPeriod = computed(() => {
  const all = (periods.value || []).slice();
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const future = all
    .filter((p) => String(p?.period_start || '') > todayYmd)
    .sort((a, b) => String(a?.period_start || '').localeCompare(String(b?.period_start || '')));
  return future[0] || null;
});

/**
 * Human-facing status for a period.
 * DB status can be "staged" from carryovers/claims before any billing CSV exists —
 * those periods should show as "Not started", not mid-review.
 */
const periodDisplayStatus = (p) => {
  const st = String(p?.status || '').trim().toLowerCase();
  const hasImport = Number(p?.import_count || 0) > 0
    || (selectedPeriodForUi.value && Number(p?.id) === Number(selectedPeriodForUi.value?.id)
      && Array.isArray(rawImportRows.value) && rawImportRows.value.length > 0);
  if (st === 'posted' || st === 'finalized') return { key: 'posted', label: 'Posted' };
  if (st === 'ran') return { key: 'ran', label: 'Ran' };
  if (!hasImport && (!st || st === 'draft' || st === 'staged' || st === 'raw_imported')) {
    return { key: 'not_started', label: 'Not started' };
  }
  if (st === 'raw_imported') return { key: 'raw_imported', label: 'Imported' };
  if (st === 'staged') return { key: 'staged', label: 'Staged' };
  if (!st) return { key: 'draft', label: 'Draft' };
  return { key: st, label: st.charAt(0).toUpperCase() + st.slice(1) };
};

const dashboardStatusLabel = computed(() => periodDisplayStatus(selectedPeriodForUi.value).label);
const dashboardStatusKey = computed(() => periodDisplayStatus(selectedPeriodForUi.value).key);

/** True when this period has at least one billing import (CSV upload). */
const hasBillingImport = computed(() => {
  const fromList = Number(selectedPeriodForUi.value?.import_count || 0) > 0;
  if (fromList) return true;
  // Live rows from period details (more current right after an upload).
  return Array.isArray(rawImportRows.value) && rawImportRows.value.length > 0;
});

const dashboardNextRunLabel = computed(() => {
  // Find the most recently ran or posted period to anchor the +14-day schedule.
  const ranStatuses = new Set(['ran', 'posted', 'finalized']);
  const allPeriods = (periods.value || []).slice();
  const ranPeriods = allPeriods
    .filter((p) => ranStatuses.has(String(p?.status || '').toLowerCase()) && p?.period_end)
    .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)));
  const lastRan = ranPeriods[0] || null;

  const anchorEnd = String(lastRan?.period_end || selectedPeriodForUi.value?.period_end || '').slice(0, 10);
  if (!anchorEnd) return '—';
  const d = new Date(`${anchorEnd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return anchorEnd;
  // Next run is 14 days (one biweekly period) after the last run's period end.
  d.setDate(d.getDate() + 14);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
});

/**
 * 0=Import, 1=Stage, 2=Run, 3=Reports, 4=Post; 5=all complete.
 * Import/Stage must not show as done until a billing CSV exists — a period can
 * be DB-status "staged" from carryovers/claims before any report is uploaded.
 */
const payrollRunStepIndex = computed(() => {
  const st = selectedPeriodStatus.value;
  if (st === 'posted' || st === 'finalized') return 5;
  if (st === 'ran') return 4;
  if (!hasBillingImport.value) return 0;
  if (st === 'staged') return 2;
  if (st === 'raw_imported') return 1;
  return 1;
});

/** Display status for history list / pills (accounts for missing billing import). */
const periodStatusForDisplay = (p) => periodDisplayStatus(p);

const openPendingFromDashboard = () => {
  const slug = String(route.params?.organizationSlug || agencyStore.currentAgency?.slug || '').trim();
  const path = slug ? `/${slug}/admin/payroll/pending` : '/admin/payroll/pending';
  const counts = dashboardPendingCounts.value || {};
  const order = [
    ['pto', 'pto'],
    ['eventTime', 'event_time'],
    ['timeClaims', 'time'],
    ['mileage', 'mileage'],
    ['reimbursement', 'reimbursement'],
    ['medcancel', 'medcancel']
  ];
  const first = order.find(([key]) => Number(counts[key] || 0) > 0);
  const query = first ? { tab: first[1] } : {};
  router.push({ path, query });
};

// V2 modal state (isolated: always fetches fresh from API on open)
const showRunModalV2 = ref(false);
const runModalV2Loading = ref(false);
const runModalV2Error = ref('');
const runModalV2Summaries = ref([]);
const runModalV2Search = ref('');
const runModalV2SortKey = ref('provider'); // provider | total_hours | subtotal_amount | adjustments_amount | total_amount
const runModalV2SortDir = ref('asc'); // asc | desc

const runModalV2SortIndicator = (key) => {
  if (runModalV2SortKey.value !== key) return '';
  return runModalV2SortDir.value === 'asc' ? '▲' : '▼';
};

const setRunModalV2Sort = (key) => {
  if (runModalV2SortKey.value === key) {
    runModalV2SortDir.value = runModalV2SortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    runModalV2SortKey.value = key;
    runModalV2SortDir.value = key === 'provider' ? 'asc' : 'desc';
  }
};

const runModalV2Rows = computed(() => {
  const q = String(runModalV2Search.value || '').trim().toLowerCase();
  const base = (runModalV2Summaries.value || []).slice();

  const filtered = !q ? base : base.filter((s) => {
    const name = `${s?.last_name || ''}, ${s?.first_name || ''}`.toLowerCase();
    return name.includes(q);
  });

  const dir = runModalV2SortDir.value === 'asc' ? 1 : -1;
  const key = runModalV2SortKey.value;

  filtered.sort((a, b) => {
    if (key === 'provider') {
      const an = `${a?.last_name || ''}, ${a?.first_name || ''}`.trim();
      const bn = `${b?.last_name || ''}, ${b?.first_name || ''}`.trim();
      return dir * an.localeCompare(bn, undefined, { sensitivity: 'base' });
    }
    const av = Number(a?.[key] ?? 0);
    const bv = Number(b?.[key] ?? 0);
    if (av === bv) {
      const an = `${a?.last_name || ''}, ${a?.first_name || ''}`.trim();
      const bn = `${b?.last_name || ''}, ${b?.first_name || ''}`.trim();
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    }
    return dir * (av - bv);
  });

  return filtered;
});

const showPreviewPostModalV2 = ref(false);
const previewPostV2Loading = ref(false);
const previewPostV2Error = ref('');
const previewPostV2Summaries = ref([]);
const previewPostV2UserId = ref(null);
const previewPostV2Notifications = ref([]);

const previewPostV2ProviderOptions = computed(() => {
  const base = (previewPostV2Summaries.value || []).slice();
  base.sort((a, b) => {
    const al = String(a?.last_name || '').trim();
    const bl = String(b?.last_name || '').trim();
    const af = String(a?.first_name || '').trim();
    const bf = String(b?.first_name || '').trim();
    return al.localeCompare(bl, undefined, { sensitivity: 'base' })
      || af.localeCompare(bf, undefined, { sensitivity: 'base' })
      || (Number(a?.user_id || 0) - Number(b?.user_id || 0));
  });
  return base;
});

const previewPostV2UserIndex = computed(() => {
  const uid = Number(previewPostV2UserId.value || 0);
  if (!uid) return -1;
  return (previewPostV2ProviderOptions.value || []).findIndex((s) => Number(s.user_id) === uid);
});

const previewPostV2CanPrev = computed(() => previewPostV2UserIndex.value > 0);
const previewPostV2CanNext = computed(() => {
  const idx = previewPostV2UserIndex.value;
  const n = (previewPostV2ProviderOptions.value || []).length;
  return idx >= 0 && idx < n - 1;
});

const previewPostV2PrevUser = () => {
  const idx = previewPostV2UserIndex.value;
  if (idx <= 0) return;
  const next = previewPostV2ProviderOptions.value[idx - 1];
  previewPostV2UserId.value = next?.user_id || null;
};

const previewPostV2NextUser = () => {
  const idx = previewPostV2UserIndex.value;
  const next = previewPostV2ProviderOptions.value[idx + 1];
  if (!next?.user_id) return;
  previewPostV2UserId.value = next.user_id;
};

const previewPostV2Summary = computed(() => {
  const uid = Number(previewPostV2UserId.value || 0);
  if (!uid) return null;
  return (previewPostV2Summaries.value || []).find((s) => Number(s.user_id) === uid) || null;
});

const previewPostV2ServiceLines = computed(() => splitBreakdownForDisplay(previewPostV2Summary.value?.breakdown || null));

const isSupervisionCode = (code) => ['99414', '99415', '99416'].includes(String(code || '').trim());

const previewPostV2IndirectBreakdown = computed(() => {
  const b = previewPostV2Summary.value?.breakdown || null;
  if (!b || typeof b !== 'object') return [];
  const out = [];
  for (const [code, v] of Object.entries(b)) {
    if (String(code).startsWith('_')) continue;
    const bucket = v?.bucket ? String(v.bucket).trim().toLowerCase() : payBucketForCategory(v?.category);
    if (bucket !== 'indirect') continue;
    const hours = Number(v?.hours ?? v?.creditsHours ?? 0);
    const amount = Number(v?.amount ?? 0);
    if (hours > 1e-9 || amount > 1e-9) {
      out.push({ code, hours, amount });
    }
  }
  return out.sort((a, b) => String(a.code).localeCompare(String(b.code)));
});

const previewPostV2CarryoverNotes = computed(() => {
  const b = previewPostV2Summary.value?.breakdown || null;
  return Number(b?.__carryover?.carryoverNotesTotal ?? b?.__carryover?.oldDoneNotesNotesTotal ?? 0);
});

const previewPostV2PriorStillUnpaid = computed(() => {
  const b = previewPostV2Summary.value?.breakdown || null;
  const p = b?.__priorStillUnpaid || null;
  return {
    totalUnits: Number(p?.totalUnits || 0),
    periodStart: String(p?.periodStart || ''),
    periodEnd: String(p?.periodEnd || ''),
    lines: Array.isArray(p?.lines) ? p.lines : []
  };
});

const previewPostV2UnpaidInPeriod = computed(() => {
  const b = previewPostV2Summary.value?.breakdown || null;
  const c = b?.__unpaidNotesCounts || null;
  const noNote = Number(c?.noNoteNotes || 0);
  const draft = Number(c?.draftNotes || 0);
  return { noNote, draft, total: noNote + draft };
});

const previewPostV2Totals = computed(() => {
  const uid = Number(previewPostV2UserId.value || 0);
  const s = (previewPostV2Summaries.value || []).find((x) => Number(x.user_id) === uid) || null;
  return {
    total: Number(s?.total_amount || 0),
    noNote: Number(s?.no_note_units || 0),
    draft: Number(s?.draft_units || 0)
  };
});

const refreshRunModalV2 = async () => {
  if (!selectedPeriodId.value) return;
  runModalV2Loading.value = true;
  runModalV2Error.value = '';
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}`);
    const next = (resp.data?.summaries || []).map((s) => {
      if (typeof s.breakdown === 'string') {
        try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
      }
      return s;
    });
    runModalV2Summaries.value = next;
  } catch (e) {
    runModalV2Error.value = e.response?.data?.error?.message || e.message || 'Failed to load ran payroll';
    runModalV2Summaries.value = [];
  } finally {
    runModalV2Loading.value = false;
  }
};

const openRunResultsModalV2 = async () => {
  if (!selectedPeriodId.value) return;
  runModalV2Search.value = '';
  runModalV2SortKey.value = 'provider';
  runModalV2SortDir.value = 'asc';
  showRunModalV2.value = true;
  await refreshRunModalV2();
};

const loadPreviewPostV2Notifications = async () => {
  if (!selectedPeriodId.value) return;
  const uid = Number(previewPostV2UserId.value || 0);
  if (!uid) {
    previewPostV2Notifications.value = [];
    return;
  }
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/post/preview`, { params: { userId: uid } });
    previewPostV2Notifications.value = resp.data?.notifications || [];
  } catch (e) {
    // Keep modal usable even if notification preview fails.
    previewPostV2Notifications.value = [];
    previewPostV2Error.value = e.response?.data?.error?.message || e.message || 'Failed to load post preview';
  }
};

const refreshPreviewPostModalV2 = async () => {
  if (!selectedPeriodId.value) return;
  previewPostV2Loading.value = true;
  previewPostV2Error.value = '';
  try {
    // Used for audit flags (compare to immediately prior period).
    await loadImmediatePriorSummaries();
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}`);
    const next = (resp.data?.summaries || []).map((s) => {
      if (typeof s.breakdown === 'string') {
        try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
      }
      return s;
    });
    previewPostV2Summaries.value = next;
    if (!previewPostV2UserId.value && (previewPostV2Summaries.value || []).length) {
      previewPostV2UserId.value = (previewPostV2Summaries.value[0] || {}).user_id || null;
    }
    await loadPreviewPostV2Notifications();
  } catch (e) {
    previewPostV2Error.value = e.response?.data?.error?.message || e.message || 'Failed to load preview post';
    previewPostV2Summaries.value = [];
    previewPostV2Notifications.value = [];
  } finally {
    previewPostV2Loading.value = false;
  }
};

const openPreviewPostModalV2 = async () => {
  if (!selectedPeriodId.value) return;
  showPreviewPostModalV2.value = true;
  await refreshPreviewPostModalV2();
};

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

const mileageStandardRatePerMile = computed(() => {
  const n = Number(mileageRatesDraft.value?.standard || 0);
  return Number.isFinite(n) ? n : 0;
});

const mileageClaimUsesTierRate = (c) => {
  return String(c?.claim_type || '').toLowerCase() === 'school_travel'
    || mileageRatesDraft.value?.standardUsesTierRates === true;
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
  const rate = mileageClaimUsesTierRate(c)
    ? mileageRateForTier(Number(mileageTierByClaimId.value?.[c?.id] || c?.tier_level || 0))
    : mileageStandardRatePerMile.value;
  const miles = billableMilesForClaim(c);
  if (!(rate > 0) || !(miles > 0)) return null;
  return Math.round((miles * rate) * 100) / 100;
};

const estimateMileageDisplay = (c) => {
  const rate = mileageClaimUsesTierRate(c)
    ? mileageRateForTier(Number(mileageTierByClaimId.value?.[c?.id] || c?.tier_level || 0))
    : mileageStandardRatePerMile.value;
  if (!(rate > 0)) return '—';
  const est = estimateMileageAmount(c);
  return est !== null ? fmtMoney(est) : '—';
};

const estimateMileageTitle = (c) => {
  const tierLevel = Number(mileageTierByClaimId.value?.[c?.id] || c?.tier_level || 0);
  const usesTierRate = mileageClaimUsesTierRate(c);
  const rate = usesTierRate ? mileageRateForTier(tierLevel) : mileageStandardRatePerMile.value;
  if (!(rate > 0)) {
    return usesTierRate
      ? `Tier ${tierLevel || '—'} mileage rate is not configured`
      : 'Other Mileage agency rate is not configured';
  }
  const miles = billableMilesForClaim(c);
  if (!(miles > 0)) return 'No billable miles';
  return `Estimated = ${fmtNum(miles)} mi × ${fmtMoney(rate)}/mi`;
};

const canSeeRunResults = computed(() => {
  const st = selectedPeriodStatus.value;
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

const isCpaUserId = (uid) => {
  const u = agencyUserById.value.get(Number(uid)) || null;
  if (!u) return false;
  return String(u.role || '').toLowerCase() === 'clinical_practice_assistant';
};

const isProviderPlusUserId = (uid) => {
  const u = agencyUserById.value.get(Number(uid)) || null;
  if (!u) return false;
  return String(u.role || '').toLowerCase() === 'provider_plus';
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

    // 99415 should only be used by supervisors / CPA / provider_plus.
    try {
      const b = s?.breakdown || null;
      const has99415 = b && typeof b === 'object' && Object.prototype.hasOwnProperty.call(b, '99415');
      const v = has99415 ? b['99415'] : null;
      const amt = Number(v?.amount || 0);
      const units = Number(v?.finalizedUnits ?? v?.units ?? 0);
      if (has99415 && !isSupervisorUserId(uid) && !isCpaUserId(uid) && !isProviderPlusUserId(uid) && (amt > 1e-9 || units > 1e-9)) {
        flags.push('Non-supervisor/CPA/provider_plus has service code 99415 (review recommended)');
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

// V2 Preview Post uses isolated summaries; compute the same audit flags against the V2 dataset.
const auditProvidersV2 = computed(() => {
  const cur = (previewPostV2Summaries.value || []).slice();
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

    // 99415 should only be used by supervisors / CPA / provider_plus.
    try {
      const b = s?.breakdown || null;
      const has99415 = b && typeof b === 'object' && Object.prototype.hasOwnProperty.call(b, '99415');
      const v = has99415 ? b['99415'] : null;
      const amt = Number(v?.amount || 0);
      const units = Number(v?.finalizedUnits ?? v?.units ?? 0);
      if (has99415 && !isSupervisorUserId(uid) && !isCpaUserId(uid) && !isProviderPlusUserId(uid) && (amt > 1e-9 || units > 1e-9)) {
        flags.push('Non-supervisor/CPA/provider_plus has service code 99415 (review recommended)');
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

const auditForPreviewProviderV2 = computed(() => {
  const uid = Number(previewPostV2UserId.value || 0);
  if (!uid) return null;
  return (auditProvidersV2.value || []).find((x) => Number(x.userId) === uid) || null;
});

const fmtMoney = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};
const fmtBreakdownRate = (line) => {
  const method = String(line?.payMethod || '').trim().toLowerCase();
  const pct = line?.payPercent;
  if (method === 'percent_of_charge' && pct !== null && pct !== undefined && pct !== '') {
    const n = Number(pct);
    if (Number.isFinite(n)) {
      return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
    }
  }
  return fmtMoney(line?.rateAmount ?? 0);
};
const fmtNum = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const getUserName = (userId) => {
  const u = (sortedAgencyUsers.value || []).find((x) => Number(x?.id) === Number(userId));
  return u ? `${u.last_name || ''}, ${u.first_name || ''}`.replace(/^,\s*|,\s*$/g, '').trim() || `User #${userId}` : `User #${userId}`;
};
const fmtInt = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const nameForUserId = (uid) => {
  const id = Number(uid || 0);
  const u = (agencyUsers.value || []).find((x) => Number(x.id) === id) || null;
  if (!u) return `User #${id}`;
  return `${u.first_name || ''} ${u.last_name || ''}`.trim();
};

const submittedAtYmd = (row) => String(row?.created_at || '').slice(0, 10) || '—';

const fmtClaimDate = (d) => {
  if (!d) return '';
  const ymd = String(d).slice(0, 10);
  const dt = new Date(ymd + 'T12:00:00');
  return Number.isNaN(dt.getTime()) ? ymd : dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const submitterLabel = (row) => {
  const submittedById = row?.submitted_by_user_id === null || row?.submitted_by_user_id === undefined ? null : Number(row.submitted_by_user_id);
  const fn = String(row?.submitted_by_first_name || '').trim();
  const ln = String(row?.submitted_by_last_name || '').trim();
  const email = String(row?.submitted_by_email || '').trim();

  if (ln || fn) return `${ln}${ln && fn ? ', ' : ''}${fn}`;
  if (email) return email;
  if (submittedById) return nameForUserId(submittedById);
  return '—';
};

const holidayBonusDatesLabel = (row) => {
  const raw = row?.holiday_dates_json ?? row?.holidayDatesJson ?? null;
  let arr = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      arr = Array.isArray(parsed) ? parsed : [];
    } catch {
      arr = raw.split(',').map((s) => String(s || '').trim()).filter(Boolean);
    }
  }
  const uniq = Array.from(new Set((arr || []).map((x) => String(x || '').slice(0, 10)).filter((x) => /^\\d{4}-\\d{2}-\\d{2}$/.test(x)))).sort();
  return uniq.length ? uniq.join(', ') : '—';
};

const loadMileageRates = async () => {
  if (!agencyId.value) return;
  try {
    mileageRatesLoading.value = true;
    mileageRatesError.value = '';
    const resp = await api.get('/payroll/mileage-rates', { params: { agencyId: agencyId.value } });
    const rates = resp.data?.rates || [];
    const settings = resp.data?.settings || {};
    const byTier = new Map((rates || []).map((r) => [Number(r.tierLevel), Number(r.ratePerMile || 0)]));
    mileageRatesDraft.value = {
      tier1: byTier.get(1) || 0,
      tier2: byTier.get(2) || 0,
      tier3: byTier.get(3) || 0,
      standard: Number(settings.standardMileageRatePerMile || 0),
      standardUsesTierRates: !!settings.standardMileageUsesTierRates
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
    const standard = Number(mileageRatesDraft.value.standard || 0);
    await api.put('/payroll/mileage-rates', {
      rates: [
        { tierLevel: 1, ratePerMile: t1 },
        { tierLevel: 2, ratePerMile: t2 },
        { tierLevel: 3, ratePerMile: t3 }
      ],
      standardMileageRatePerMile: standard,
      standardMileageUsesTierRates: !!mileageRatesDraft.value.standardUsesTierRates
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
  pendingMileageMode.value = 'period';
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
    const rows = (resp.data || []).filter((r) => !!r && typeof r === 'object');
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
  pendingMileageMode.value = 'all';
  try {
    pendingMileageLoading.value = true;
    pendingMileageError.value = '';
    const resp = await api.get('/payroll/mileage-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'submitted'
      }
    });
    const rows = (resp.data || []).filter((r) => !!r && typeof r === 'object');
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

const reloadPendingMileageClaims = async () => {
  if (pendingMileageMode.value === 'all') return await loadAllPendingMileageClaims();
  return await loadPendingMileageClaims();
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
    const usesTierRate = mileageClaimUsesTierRate(c);
    const tierLevel = usesTierRate ? Number(mileageTierByClaimId.value?.[c.id] || 1) : null;
    const targetPayrollPeriodId = Number(mileageTargetPeriodByClaimId.value?.[c.id] || selectedPeriodId.value);
    if (isTargetPeriodLocked(targetPayrollPeriodId)) {
      pendingMileageError.value = 'Target pay period is posted (locked). Choose an open pay period.';
      return;
    }
    try {
      await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'approve', tierLevel, targetPayrollPeriodId });
    } catch (e) {
      const status = e.response?.status || 0;
      const msg = e.response?.data?.error?.message || e.message || '';
      const looksLikeDeadline =
        String(msg).toLowerCase().includes('deadline') ||
        String(msg).toLowerCase().includes('submitted after') ||
        String(msg).toLowerCase().includes('cannot be added to an earlier pay period');
      if (status === 409 && looksLikeDeadline) {
        const ok = window.confirm(
          'This claim was submitted after the cutoff for this pay period.\n\nApprove anyway using an admin override?'
        );
        if (!ok) throw e;
        await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'approve', tierLevel, targetPayrollPeriodId, overrideDeadline: true });
      } else {
        throw e;
      }
    }
    await reloadPendingMileageClaims();
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
    await reloadPendingMileageClaims();
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
    await reloadPendingMileageClaims();
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
    await reloadPendingMileageClaims();
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to send back mileage claim';
  } finally {
    approvingMileageClaimId.value = null;
  }
};

const loadPendingMedcancelClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  pendingMedcancelMode.value = 'period';
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
    const rows = (resp.data || []).filter((r) => !!r && typeof r === 'object');
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
  pendingMedcancelMode.value = 'all';
  try {
    pendingMedcancelLoading.value = true;
    pendingMedcancelError.value = '';
    const resp = await api.get('/payroll/medcancel-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'submitted'
      }
    });
    const rows = (resp.data || []).filter((r) => !!r && typeof r === 'object');
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

const reloadPendingMedcancelClaims = async () => {
  if (pendingMedcancelMode.value === 'all') return await loadAllPendingMedcancelClaims();
  return await loadPendingMedcancelClaims();
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
    try {
      await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'approve', targetPayrollPeriodId });
    } catch (e) {
      const status = e.response?.status || 0;
      const msg = e.response?.data?.error?.message || e.message || '';
      const looksLikeDeadline =
        String(msg).toLowerCase().includes('deadline') ||
        String(msg).toLowerCase().includes('submitted after') ||
        String(msg).toLowerCase().includes('cannot be added to an earlier pay period');
      if (status === 409 && looksLikeDeadline) {
        const ok = window.confirm(
          'This claim was submitted after the cutoff for this pay period.\n\nApprove anyway using an admin override?'
        );
        if (!ok) throw e;
        await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'approve', targetPayrollPeriodId, overrideDeadline: true });
      } else {
        throw e;
      }
    }
    await reloadPendingMedcancelClaims();
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
    await reloadPendingMedcancelClaims();
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
    await reloadPendingMedcancelClaims();
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
    await reloadPendingMedcancelClaims();
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
    const bucket = v?.bucket ? String(v.bucket).trim().toLowerCase() : payBucketForCategory(v?.category);
    if (bucket === 'indirect') out.indirectAmount += amt;
    else if (bucket === 'other') out.otherAmount += amt;
    else if (bucket === 'flat') out.flatAmount += amt;
    else out.directAmount += amt;
  }
  // Also sum adjustment lines (time claims, manual pay lines, etc.) by bucket so that
  // providers whose only pay comes from event time still show correct direct/indirect totals.
  const adjLines = breakdown?.__adjustments?.lines;
  if (Array.isArray(adjLines)) {
    for (const line of adjLines) {
      const amt = Number(line?.amount || 0);
      if (Math.abs(amt) <= 1e-9) continue;
      const bucket = line?.bucket ? String(line.bucket).trim().toLowerCase() : 'direct';
      if (bucket === 'indirect') out.indirectAmount += amt;
      else if (bucket === 'other') out.otherAmount += amt;
      else if (bucket === 'flat') out.flatAmount += amt;
      else out.directAmount += amt;
    }
  }
  const manualPayInAdj = Array.isArray(adjLines) && adjLines.some(
    (line) => String(line?.type || '').trim().toLowerCase() === 'manual_pay_line'
  );
  if (!manualPayInAdj) {
    const manualList = breakdown?.__adjustments?.manualPayLines || breakdown?.__manualPayLines || [];
    for (const ml of (Array.isArray(manualList) ? manualList : [])) {
      const amt = Number(ml?.amount || 0);
      if (Math.abs(amt) <= 1e-9) continue;
      const bucket = String(ml?.category || 'direct').trim().toLowerCase() === 'indirect' ? 'indirect' : 'direct';
      if (bucket === 'indirect') out.indirectAmount += amt;
      else out.directAmount += amt;
    }
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
    const rateAmount = Number(v.rateAmount || 0);
    const payDivisor = Number(v.payDivisor || 1);
    const safeDiv = Number.isFinite(payDivisor) && payDivisor > 0 ? payDivisor : 1;
    const creditValue = Number(v.creditValue || 0);
    const safeCv = Number.isFinite(creditValue) ? creditValue : 0;
    const bucket = v?.bucket ? String(v.bucket).trim().toLowerCase() : payBucketForCategory(v.category);
    const rateUnit = String(v.rateUnit || '');

    const oldNoteUnits = Number(v.oldNoteUnits ?? v.oldDoneNotesUnits ?? 0);
    const codeChangedUnits = Number(v.codeChangedUnits || 0);
    const lateAdditionUnits = Number(v.lateAdditionUnits || 0);
    const carryUnits = Math.max(0, oldNoteUnits) + Math.max(0, codeChangedUnits) + Math.max(0, lateAdditionUnits);

    // If there's no carryover, or this is a flat line, show as-is.
    if (!(carryUnits > 1e-9) || rateUnit === 'flat') {
      out.push({ code, ...v });
      continue;
    }

    const totalAmount = Number(v.amount || 0);
    const totalUnits = Math.max(0, finalizedUnits);
    const baseUnits = Math.max(0, totalUnits - carryUnits);
    const isPercentPay = String(v.payMethod || '').trim().toLowerCase() === 'percent_of_charge'
      && v.payPercent !== null && v.payPercent !== undefined && v.payPercent !== '';
    const payPct = isPercentPay ? Number(v.payPercent) : null;

    let oldNoteAmount = 0;
    let codeChangedAmount = 0;
    let lateAdditionAmount = 0;
    let baseAmount = 0;

    if (isPercentPay && Number.isFinite(payPct)) {
      const presentPaid = Number(v.presentClientPaidAmount ?? 0);
      const oldPaid = Number(v.oldNoteClientPaidAmount ?? 0);
      const latePaid = Number(v.lateAdditionClientPaidAmount ?? 0);
      const codeChangedPaid = Number(v.codeChangedClientPaidAmount ?? 0);
      const carryPaid = Number(v.carryoverClientPaidAmount ?? 0);
      const hasSplitPaid = presentPaid > 0 || oldPaid > 0 || latePaid > 0 || codeChangedPaid > 0;
      if (hasSplitPaid) {
        baseAmount = presentPaid > 0 ? Math.round((presentPaid * payPct / 100) * 100) / 100 : 0;
        oldNoteAmount = oldPaid > 0 ? Math.round((oldPaid * payPct / 100) * 100) / 100 : 0;
        lateAdditionAmount = latePaid > 0 ? Math.round((latePaid * payPct / 100) * 100) / 100 : 0;
        codeChangedAmount = codeChangedPaid > 0 ? Math.round((codeChangedPaid * payPct / 100) * 100) / 100 : 0;
      } else if (carryPaid > 0) {
        const allocAmount = (u) => (carryUnits > 1e-9 ? Number((carryPaid * (u / carryUnits)).toFixed(2)) : 0);
        oldNoteAmount = allocAmount(Math.max(0, oldNoteUnits));
        codeChangedAmount = allocAmount(Math.max(0, codeChangedUnits));
        lateAdditionAmount = allocAmount(Math.max(0, lateAdditionUnits));
        baseAmount = presentPaid > 0 ? Math.round((presentPaid * payPct / 100) * 100) / 100 : 0;
      } else {
        const allocAmount = (u) => (totalUnits > 1e-9 ? Number((totalAmount * (u / totalUnits)).toFixed(2)) : 0);
        oldNoteAmount = allocAmount(Math.max(0, oldNoteUnits));
        codeChangedAmount = allocAmount(Math.max(0, codeChangedUnits));
        lateAdditionAmount = allocAmount(Math.max(0, lateAdditionUnits));
        baseAmount = Math.max(0, Number((totalAmount - oldNoteAmount - codeChangedAmount - lateAdditionAmount).toFixed(2)));
      }
    } else {
      const allocAmount = (u) => (totalUnits > 1e-9 ? Number((totalAmount * (u / totalUnits)).toFixed(2)) : 0);
      oldNoteAmount = allocAmount(Math.max(0, oldNoteUnits));
      codeChangedAmount = allocAmount(Math.max(0, codeChangedUnits));
      lateAdditionAmount = allocAmount(Math.max(0, lateAdditionUnits));
      baseAmount = Math.max(0, Number((totalAmount - oldNoteAmount - codeChangedAmount - lateAdditionAmount).toFixed(2)));
    }

    // Base row — always show codes with units, even when amount is $0 (e.g. no-pay benefit codes).
    if (baseUnits > 1e-9) {
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

    // Old Note row (display only) — show even when amount is $0 (e.g. percent pay pending client-paid data).
    if (oldNoteUnits > 1e-9) {
      const oldPayHours = bucket !== 'flat' ? (oldNoteUnits / safeDiv) : 0;
      out.push({
        code: `${code} (Old Note)`,
        ...v,
        noNoteUnits: 0,
        draftUnits: 0,
        finalizedUnits: oldNoteUnits,
        units: oldNoteUnits,
        payHours: bucket !== 'flat' ? oldPayHours : 0,
        hours: oldNoteUnits * safeCv,
        creditsHours: oldNoteUnits * safeCv,
        amount: oldNoteAmount
      });
    }

    if (codeChangedUnits > 1e-9) {
      const fromCodes = Array.isArray(v.codeChangedFromCodes) ? v.codeChangedFromCodes.filter(Boolean) : [];
      const label = (fromCodes.length === 1)
        ? `${code} (Code Changed: ${fromCodes[0]}→${code})`
        : `${code} (Code Changed)`;
      const payHours = bucket !== 'flat' ? (codeChangedUnits / safeDiv) : 0;
      out.push({
        code: label,
        ...v,
        noNoteUnits: 0,
        draftUnits: 0,
        finalizedUnits: codeChangedUnits,
        units: codeChangedUnits,
        payHours: bucket !== 'flat' ? payHours : 0,
        hours: codeChangedUnits * safeCv,
        creditsHours: codeChangedUnits * safeCv,
        amount: codeChangedAmount
      });
    }

    if (lateAdditionUnits > 1e-9) {
      const payHours = bucket !== 'flat' ? (lateAdditionUnits / safeDiv) : 0;
      out.push({
        code: `${code} (Late Addition)`,
        ...v,
        noNoteUnits: 0,
        draftUnits: 0,
        finalizedUnits: lateAdditionUnits,
        units: lateAdditionUnits,
        payHours: bucket !== 'flat' ? payHours : 0,
        hours: lateAdditionUnits * safeCv,
        creditsHours: lateAdditionUnits * safeCv,
        amount: lateAdditionAmount
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
  const filter = String(rawRowFilter.value || 'unpaid_only');
  let rows = all;
  if (filter === 'unpaid_only') rows = all.filter((r) => !willBePaid(r));
  else if (filter === 'draft_only') rows = all.filter((r) => String(r.note_status || '').toUpperCase() === 'DRAFT');
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

const rawMode = ref('draft_audit'); // draft_audit | process_h0031 | process_h0032 | process_h2014 | process_90853 | process_h2032 | processed | missed_appts_paid_in_full

const isRawImportProcessMode = (mode) => (
  mode === 'process_h0031'
  || mode === 'process_h0032'
  || mode === 'process_h2014'
  || mode === 'process_90853'
  || mode === 'process_h2032'
);

const rawModeRowsLimited = computed(() => {
  const all = rawModeRows.value || [];
  const lim = Number(rawRowLimit.value || 200);
  if (!Number.isFinite(lim) || lim <= 0) return all.slice(0, 200);
  return all.slice(0, lim);
});

const showNextRawRows = () => {
  rawRowLimit.value = Number(rawRowLimit.value || 0) + 200;
};

const rawClientHint = (r) => {
  const raw = String(r?.patient_first_name || '').trim();
  if (!raw) return '';
  const firstToken = raw.split(/\s+/)[0] || '';
  return String(firstToken || '').slice(0, 3).toUpperCase();
};

const toggleRawSort = (column) => {
  const col = String(column || '').trim();
  if (!col) return;
  if (rawSortColumn.value === col) {
    rawSortDirection.value = rawSortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  rawSortColumn.value = col;
  // Default direction: numbers/dates descend, strings ascend.
  if (col === 'service_date' || col === 'unit_count' || col === 'draft_payable') rawSortDirection.value = 'desc';
  else rawSortDirection.value = 'asc';
};

const rawSortIndicator = (column) => {
  const col = String(column || '').trim();
  if (!col || rawSortColumn.value !== col) return '';
  return rawSortDirection.value === 'asc' ? '↑' : '↓';
};

const setRawProcessChecked = (rowId, checked) => {
  const id = Number(rowId || 0);
  if (!Number.isFinite(id) || id <= 0) return;
  rawProcessChecklistByRowId.value = { ...(rawProcessChecklistByRowId.value || {}), [id]: !!checked };
};

watch([rawMode, rawDraftSearch, rawRowFilter, showRawModal], ([mode, q, filter, open]) => {
  // Reset paging when changing modes/search or reopening modal.
  if (open) rawRowLimit.value = 200;
});

const rawModeRows = computed(() => {
  const all = (rawImportRows.value || []).slice();
  const mode = String(rawMode.value || 'draft_audit');
  const q = String(rawDraftSearch.value || '').trim().toLowerCase();

  let rows = all;
  if (mode === 'missed_appts_paid_in_full') {
    return [];
  }
  if (mode === 'draft_audit') {
    const filter = String(rawRowFilter.value || 'unpaid_only');
    if (filter === 'unpaid_only') rows = rows.filter((r) => !willBePaid(r));
    else if (filter === 'draft_only') rows = rows.filter((r) => String(r.note_status || '').toUpperCase() === 'DRAFT');
    else if (filter === 'payable') rows = rows.filter((r) => willBePaid(r));
  } else if (mode === 'process_h0031') {
    rows = rows.filter((r) =>
      Number(r.requires_processing) === 1 &&
      String(r.service_code || '').trim().toUpperCase() === 'H0031'
    );
  } else if (mode === 'process_h0032') {
    rows = rows.filter((r) =>
      Number(r.requires_processing) === 1 &&
      String(r.service_code || '').trim().toUpperCase() === 'H0032'
    );
  } else if (mode === 'process_h2014') {
    rows = rows.filter((r) =>
      Number(r.requires_processing) === 1 &&
      String(r.service_code || '').trim().toUpperCase() === 'H2014'
    );
  } else if (mode === 'process_90853') {
    rows = rows.filter((r) =>
      Number(r.requires_processing) === 1 &&
      String(r.service_code || '').trim().toUpperCase() === '90853'
    );
  } else if (mode === 'process_h2032') {
    rows = rows.filter((r) =>
      Number(r.requires_processing) === 1 &&
      String(r.service_code || '').trim().toUpperCase() === 'H2032'
    );
  } else {
    // processed
    rows = rows.filter((r) => Number(r.requires_processing) === 1 && !!r.processed_at && willBePaid(r));
  }

  if (q) {
    rows = rows.filter((r) => {
      const prov = String(r.provider_name || '').toLowerCase();
      const code = String(r.service_code || '').toLowerCase();
      const dos = String(r.service_date || '').toLowerCase();
      return prov.includes(q) || code.includes(q) || dos.includes(q);
    });
  }
  const processedRank = (r) => (r?.processed_at ? 1 : 0);
  rows.sort((a, b) => {
    // In processing views, keep unfinished rows at the top and done rows at the bottom,
    // so users can undo mistakes without rows disappearing.
    if (isRawImportProcessMode(mode)) {
      const ra = processedRank(a);
      const rb = processedRank(b);
      if (ra !== rb) return ra - rb;
    }
    const dir = rawSortDirection.value === 'asc' ? 1 : -1;
    const col = String(rawSortColumn.value || 'service_date');
    const s = (v) => String(v || '').trim().toLowerCase();
    const dateStr = (v) => String(v || '').slice(0, 10); // YYYY-MM-DD

    let cmp = 0;
    if (col === 'provider_name') cmp = s(a?.provider_name).localeCompare(s(b?.provider_name));
    else if (col === 'client') cmp = s(rawClientHint(a)).localeCompare(s(rawClientHint(b)));
    else if (col === 'service_code') cmp = s(a?.service_code).localeCompare(s(b?.service_code));
    else if (col === 'note_status') cmp = s(a?.note_status).localeCompare(s(b?.note_status));
    else if (col === 'unit_count') cmp = (Number(a?.unit_count || 0) - Number(b?.unit_count || 0));
    else if (col === 'draft_payable') cmp = (Number(a?.draft_payable || 0) - Number(b?.draft_payable || 0));
    else cmp = dateStr(a?.service_date).localeCompare(dateStr(b?.service_date));

    if (cmp) return cmp * dir;
    // Tie-breaker: most recent DOS first, then provider name.
    const dos = dateStr(b?.service_date).localeCompare(dateStr(a?.service_date));
    if (dos) return dos;
    return s(a?.provider_name).localeCompare(s(b?.provider_name));
  });
  return rows;
});

const willBePaid = (r) => {
  const st = String(r?.note_status || '').trim().toUpperCase();
  if (st === 'FINALIZED') return true;
  if (st === 'DRAFT') return Number(r?.draft_payable) === 1;
  return false;
};

const rawAuditChangesFiltered = computed(() => {
  const all = (rawAuditChanges.value || []).slice();
  if (rawAuditShowAllChanges.value) return all;
  return all.filter((c) => {
    const changeType = String(c?.changeType || '').toLowerCase();
    if (changeType === 'added') return true;
    if (changeType === 'overpaid_deleted') return true;
    if (changeType === 'code_change') return true;
    if (changeType === 'location_changed') return true;
    if (changeType === 'service_code_changed') return true;
    const fromStatus = String(c?.from_status || '').toUpperCase();
    const wasPaidInBaseline = fromStatus === 'FINALIZED' || fromStatus === 'DRAFT_PAID';
    return !wasPaidInBaseline;
  });
});
const rawAuditChangeCount = computed(() => (rawAuditChangesFiltered.value || []).length);
const isRawAuditHistoricalRun = computed(() => {
  const selImport = Number(rawAuditSelectedImportId.value || 0);
  const latestImport = Number(rawAuditLatestImportId.value || 0);
  if (selImport && latestImport) return selImport !== latestImport;
  const sel = Number(rawAuditSelectedRunId.value || 0);
  const latest = Number(rawAuditLatestRunId.value || 0);
  if (!sel || !latest) return false;
  return sel !== latest;
});

const rawAuditChangesLimited = computed(() => {
  const q = String(rawDraftSearch.value || '').trim().toLowerCase();
  let rows = (rawAuditChangesFiltered.value || []).slice();
  if (q) {
    rows = rows.filter((r) => {
      const prov = String(r?.provider_name || '').toLowerCase();
      const client = String(r?.patient_first_name || '').toLowerCase();
      const codeFrom = String(r?.from_service_code || '').toLowerCase();
      const codeTo = String(r?.to_service_code || '').toLowerCase();
      const dos = String(r?.service_date || '').toLowerCase();
      const changeType = rawChangeTypeLabel(r?.changeType).toLowerCase();
      const fromLoc = String(r?.metadata_json?.fromLocation || '').toLowerCase();
      const toLoc = String(r?.metadata_json?.toLocation || '').toLowerCase();
      return prov.includes(q) || client.includes(q) || codeFrom.includes(q) || codeTo.includes(q) || dos.includes(q) || changeType.includes(q) || fromLoc.includes(q) || toLoc.includes(q);
    });
  }
  return rows.slice(0, 500);
});

const rawAuditHasDraftRows = computed(() => {
  return (rawAuditChangesFiltered.value || []).some((c) => {
    const to = String(c?.to_status || '').toUpperCase();
    return to === 'DRAFT_PAID' || to === 'DRAFT_UNPAID';
  });
});

const rawAuditChangeCanToggleDraft = (c) => {
  const to = String(c?.to_status || '').toUpperCase();
  if (to !== 'DRAFT_PAID' && to !== 'DRAFT_UNPAID') return false;
  return !!c?.metadata_json?.compareRowId;
};

const rawAuditDraftUnpaidUpdating = ref(null);

const rawAuditLocationLabel = (c, side = 'to') => {
  if (side === 'from') return String(c?.metadata_json?.fromLocation || '').trim();
  return String(c?.metadata_json?.toLocation || '').trim();
};

const rawAuditCanAddAsCarryover = (c) => {
  const toStatus = String(c?.to_status || '').toUpperCase();
  const fromStatus = String(c?.from_status || '').toUpperCase();
  const toUnits = Number(c?.to_units || 0);
  const userId = Number(c?.user_id || 0);
  if (!userId || !(toUnits > 1e-9)) return false;
  if (toStatus === 'DRAFT_PAID') return true;
  if (toStatus === 'FINALIZED') {
    if (fromStatus === 'DRAFT_PAID') return false;
    return true;
  }
  return false;
};

const rawAuditCanAddAsReduction = (c) => {
  const changeType = String(c?.changeType || '').trim().toLowerCase();
  const fromUnits = Number(c?.from_units || 0);
  const userId = Number(c?.user_id || 0);
  return changeType === 'overpaid_deleted' && userId > 0 && fromUnits > 1e-9;
};

const rawAuditPayableTypeBadge = (c) => {
  const changeType = String(c?.changeType || '').toLowerCase();
  if (changeType === 'overpaid_deleted') return 'Reduction';
  if (changeType === 'location_changed') return 'Review location';
  if (changeType === 'service_code_changed') return 'Review code';
  if (changeType === 'code_change') return 'Review code';
  if (changeType === 'added') return 'Added';
  const to = String(c?.to_status || '').toUpperCase();
  if (to === 'DRAFT_PAID') return 'Draft';
  return 'Finalized';
};

const rawAuditToggleDraftPayable = async (c, isPayable) => {
  const rowId = c?.metadata_json?.compareRowId;
  if (!rowId) return;
  if (isPeriodPosted.value) return;
  try {
    rawAuditDraftUnpaidUpdating.value = rowId;
    rawDraftError.value = '';
    await api.patch(`/payroll/import-rows/${rowId}`, { draftPayable: !!isPayable });
    await loadRawAuditData();
  } catch (e) {
    rawDraftError.value = e.response?.data?.error?.message || e.message || 'Failed to update draft payable';
  } finally {
    rawAuditDraftUnpaidUpdating.value = null;
  }
};

const rawAuditActionableChanges = computed(() => {
  const all = (rawAuditChanges.value || []).slice();
  return all.filter((c) => rawAuditCanAddAsCarryover(c) || rawAuditCanAddAsReduction(c));
});

const rawAddToCurrentPeriodDestinationId = ref(null);
const rawAddToCurrentPeriodSelection = ref({});
const rawAddToCurrentPeriodApplying = ref(false);
const rawAddToCurrentPeriodError = ref('');
const rawAuditActivePeriodId = computed(() => Number((rawModalActivePeriodId.value ?? selectedPeriodId.value) || 0) || null);
const rawAuditActivePeriod = computed(() => {
  const activeId = Number(rawAuditActivePeriodId.value || 0);
  if (!activeId) return null;
  if (selectedPeriod.value && Number(selectedPeriod.value.id) === activeId) return selectedPeriod.value;
  return (periods.value || []).find((p) => Number(p?.id) === activeId) || null;
});

const rawAddToCurrentPeriodDestOptions = computed(() => {
  const priorId = Number(rawAuditActivePeriodId.value || 0);
  const priorEnd = String(rawAuditActivePeriod.value?.period_end || '').slice(0, 10);
  const list = Array.isArray(periods.value) ? periods.value : [];
  return list.filter((p) => {
    if (!p?.id) return false;
    const pid = Number(p.id || 0);
    if (priorId && pid === priorId) return false;
    if (priorEnd) {
      const pStart = String(p?.period_start || '').slice(0, 10);
      if (pStart && pStart <= priorEnd) return false;
    }
    return true;
  }).sort((a, b) => String(a?.period_start || '').localeCompare(String(b?.period_start || '')));
});

const rawAddToCurrentPeriodDefaultAction = (c) => {
  const changeType = String(c?.changeType || '').trim().toLowerCase();
  if (changeType === 'overpaid_deleted') return 'skip';
  if (changeType === 'location_changed' || changeType === 'service_code_changed' || changeType === 'code_change') return 'skip';
  return rawAuditCanAddAsCarryover(c) ? 'add' : 'skip';
};

const rawAddToCurrentPeriodActionOptions = (c) => {
  if (rawAuditCanAddAsReduction(c)) {
    return [
      { value: 'skip', label: 'Do not add' },
      { value: 'reduction', label: 'Add to pay period as reduction' }
    ];
  }
  return [
    { value: 'skip', label: 'Do not add' },
    { value: 'add', label: 'Add to current period' }
  ];
};

watch(rawAuditActionableChanges, (payable) => {
  const sel = {};
  for (const c of payable || []) {
    const k = c?.rowMatchKey;
    if (k) {
      sel[k] = {
        action: rawAddToCurrentPeriodDefaultAction(c),
        units: Number((c?.to_units ?? c?.from_units) || 0)
      };
    }
  }
  rawAddToCurrentPeriodSelection.value = sel;
}, { immediate: true });

watch([rawAuditActionableChanges, rawAddToCurrentPeriodDestOptions], () => {
  const payable = rawAuditActionableChanges.value || [];
  const opts = rawAddToCurrentPeriodDestOptions.value || [];
  if (!payable.length) {
    rawAddToCurrentPeriodDestinationId.value = null;
    return;
  }
  const currentDest = Number(rawAddToCurrentPeriodDestinationId.value || 0);
  if (currentDest && opts.some((p) => Number(p?.id) === currentDest)) return;
  const batchDest = Number(batchCatchUpDestinationPeriodId.value || 0);
  const selectedDest = Number(selectedPeriodId.value || 0);
  if (batchDest && opts.some((p) => Number(p?.id) === batchDest)) {
    rawAddToCurrentPeriodDestinationId.value = batchDest;
  } else if (selectedDest && opts.some((p) => Number(p?.id) === selectedDest)) {
    rawAddToCurrentPeriodDestinationId.value = selectedDest;
  } else {
    rawAddToCurrentPeriodDestinationId.value = opts[0]?.id || null;
  }
}, { immediate: true });

const rawAddToCurrentPeriodFiltered = computed(() => {
  const q = String(rawAddToCurrentPeriodSearch.value || '').trim().toLowerCase();
  let rows = (rawAuditActionableChanges.value || []).slice();
  if (q) {
    rows = rows.filter((r) => {
      const provider = String(r?.provider_name || '').toLowerCase();
      const client = String(r?.patient_first_name || '').toLowerCase();
      const clientHint = String(rawClientHint(r) || '').toLowerCase();
      const fromCode = String(r?.from_service_code || '').toLowerCase();
      const toCode = String(r?.to_service_code || '').toLowerCase();
      const dos = String(r?.service_date || '').toLowerCase();
      const type = String(rawAuditPayableTypeBadge(r) || '').toLowerCase();
      const changeLabel = String(rawChangeTypeLabel(r?.changeType) || '').toLowerCase();
      const fromLoc = String(r?.metadata_json?.fromLocation || '').toLowerCase();
      const toLoc = String(r?.metadata_json?.toLocation || '').toLowerCase();
      return provider.includes(q) || client.includes(q) || clientHint.includes(q) || fromCode.includes(q) || toCode.includes(q) || dos.includes(q) || type.includes(q) || changeLabel.includes(q) || fromLoc.includes(q) || toLoc.includes(q);
    });
  }
  const dir = rawAddToCurrentPeriodSortDirection.value === 'asc' ? 1 : -1;
  const col = String(rawAddToCurrentPeriodSortColumn.value || 'provider_name');
  const str = (v) => String(v || '').trim().toLowerCase();
  const dateStr = (v) => String(v || '').slice(0, 10);
  rows.sort((a, b) => {
    let cmp = 0;
    if (col === 'provider_name') cmp = str(a?.provider_name).localeCompare(str(b?.provider_name));
    else if (col === 'client') cmp = str(a?.patient_first_name).localeCompare(str(b?.patient_first_name));
    else if (col === 'service_date') cmp = dateStr(a?.service_date).localeCompare(dateStr(b?.service_date));
    else if (col === 'service_code') cmp = str(a?.to_service_code || a?.from_service_code).localeCompare(str(b?.to_service_code || b?.from_service_code));
    else if (col === 'location') cmp = str(rawAuditLocationLabel(a, 'to') || rawAuditLocationLabel(a, 'from')).localeCompare(str(rawAuditLocationLabel(b, 'to') || rawAuditLocationLabel(b, 'from')));
    else if (col === 'change') cmp = str(rawChangeTypeLabel(a?.changeType)).localeCompare(str(rawChangeTypeLabel(b?.changeType)));
    else if (col === 'type') cmp = str(rawAuditPayableTypeBadge(a)).localeCompare(str(rawAuditPayableTypeBadge(b)));
    else if (col === 'units') cmp = Number(rawAddToCurrentPeriodRowUnits(a) || 0) - Number(rawAddToCurrentPeriodRowUnits(b) || 0);
    if (cmp) return cmp * dir;
    const dosCmp = dateStr(b?.service_date).localeCompare(dateStr(a?.service_date));
    if (dosCmp) return dosCmp;
    return str(a?.provider_name).localeCompare(str(b?.provider_name));
  });
  return rows;
});

const rawAddToCurrentPeriodSelectedCount = computed(() => {
  const sel = rawAddToCurrentPeriodSelection.value || {};
  return (rawAuditActionableChanges.value || []).filter((c) => String(sel[c.rowMatchKey]?.action || 'skip') !== 'skip').length;
});

const isRawAddToCurrentPeriodDestPosted = computed(() => {
  const destId = rawAddToCurrentPeriodDestinationId.value;
  if (!destId) return false;
  const p = (periods.value || []).find((x) => Number(x?.id) === Number(destId));
  return (p?.status || '').toLowerCase() === 'posted' || (p?.status || '').toLowerCase() === 'finalized';
});

const rawAddToCurrentPeriodRowAction = (c) => {
  const k = c?.rowMatchKey;
  const s = rawAddToCurrentPeriodSelection.value?.[k];
  return s ? s.action : rawAddToCurrentPeriodDefaultAction(c);
};
const rawAddToCurrentPeriodSetRowAction = (c, action) => {
  const k = c?.rowMatchKey;
  const base = rawAddToCurrentPeriodSelection.value[k] || { action: rawAddToCurrentPeriodDefaultAction(c), units: Number((c?.to_units ?? c?.from_units) || 0) };
  rawAddToCurrentPeriodSelection.value = { ...rawAddToCurrentPeriodSelection.value, [k]: { ...base, action: String(action || 'skip') } };
};
const rawAddToCurrentPeriodRowUnits = (c) => {
  const k = c?.rowMatchKey;
  const s = rawAddToCurrentPeriodSelection.value?.[k];
  const def = Number((c?.to_units ?? c?.from_units) || 0);
  return s ? s.units : def;
};
const rawAddToCurrentPeriodSetRowUnits = (c, val) => {
  const k = c?.rowMatchKey;
  const num = Math.max(0, Number(val) || 0);
  const base = rawAddToCurrentPeriodSelection.value[k] || { action: rawAddToCurrentPeriodDefaultAction(c), units: Number((c?.to_units ?? c?.from_units) || 0) };
  rawAddToCurrentPeriodSelection.value = { ...rawAddToCurrentPeriodSelection.value, [k]: { ...base, units: num } };
};

const toggleRawAddToCurrentPeriodSort = (column) => {
  const col = String(column || '').trim();
  if (!col) return;
  if (rawAddToCurrentPeriodSortColumn.value === col) {
    rawAddToCurrentPeriodSortDirection.value = rawAddToCurrentPeriodSortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  rawAddToCurrentPeriodSortColumn.value = col;
  rawAddToCurrentPeriodSortDirection.value = (col === 'service_date' || col === 'units') ? 'desc' : 'asc';
};

const rawAddToCurrentPeriodSortIndicator = (column) => {
  const col = String(column || '').trim();
  if (!col || rawAddToCurrentPeriodSortColumn.value !== col) return '';
  return rawAddToCurrentPeriodSortDirection.value === 'asc' ? '↑' : '↓';
};

const rawAddToCurrentPeriodCarryoverMeta = (c, units) => {
  const changeType = String(c?.changeType || '').trim().toLowerCase();
  const safeUnits = Number(units || 0);
  const categories = {
    old_note: { units: 0, notes: 0 },
    late_addition: { units: 0, notes: 0 },
    code_changed: { units: 0, notes: 0, fromCodes: [] }
  };
  if (changeType === 'service_code_changed' || changeType === 'code_change') {
    categories.code_changed.units = safeUnits;
    categories.code_changed.notes = 1;
    categories.code_changed.fromCodes = [String(c?.from_service_code || '').trim()].filter(Boolean);
  } else {
    categories.late_addition.units = safeUnits;
    categories.late_addition.notes = 1;
  }
  return {
    categories,
    rawAuditRows: [{
      rowMatchKey: c?.rowMatchKey || null,
      changeType,
      fromServiceCode: c?.from_service_code || null,
      toServiceCode: c?.to_service_code || null,
      providerName: c?.provider_name || null,
      patientFirstName: c?.patient_first_name || null,
      serviceDate: c?.service_date || null,
      fromStatus: c?.from_status || null,
      toStatus: c?.to_status || null,
      fromLocation: c?.metadata_json?.fromLocation || null,
      toLocation: c?.metadata_json?.toLocation || null,
      clientPaidAmount: Number(c?.client_paid_amount || 0) || null
    }]
  };
};

const applyRawAddToCurrentPeriod = async () => {
  const destId = rawAddToCurrentPeriodDestinationId.value;
  if (!destId) return;
  const payable = rawAddToCurrentPeriodFiltered.value || [];
  const sel = rawAddToCurrentPeriodSelection.value || {};
  const rowsToApply = [];
  for (const c of payable) {
    const action = String(sel[c.rowMatchKey]?.action || 'skip');
    if (action === 'skip') continue;
    const units = rawAddToCurrentPeriodRowUnits(c);
    if (!(units > 1e-9)) continue;
    const userId = Number(c?.user_id || 0);
    if (!userId) continue;
    const serviceCode = String(c?.to_service_code || c?.from_service_code || '').trim();
    if (!serviceCode) continue;
    if (action === 'reduction') {
      rowsToApply.push({
        actionType: 'reduction',
        userId,
        serviceCode,
        units: Number(units.toFixed(2)),
        rowMatchKey: c?.rowMatchKey || null,
        providerName: c?.provider_name || null,
        patientFirstName: c?.patient_first_name || null,
        serviceDate: c?.service_date || null,
        fromStatus: c?.from_status || null,
        location: c?.metadata_json?.fromLocation || c?.metadata_json?.toLocation || null,
        baselineRowId: c?.metadata_json?.baselineRowId || null,
        compareRowId: c?.metadata_json?.compareRowId || null
      });
    } else {
      rowsToApply.push({
        actionType: 'add',
        userId,
        serviceCode,
        rowMatchKey: c?.rowMatchKey || null,
        carryoverFinalizedUnits: Number(units.toFixed(2)),
        carryoverFinalizedRowCount: 1,
        carryoverMeta: rawAddToCurrentPeriodCarryoverMeta(c, units)
      });
      const changeType = String(c?.changeType || '').trim().toLowerCase();
      const fromCode = String(c?.from_service_code || '').trim().toUpperCase();
      const fromUnits = Number(c?.from_units || 0);
      if (
        (changeType === 'service_code_changed' || changeType === 'code_change') &&
        fromCode &&
        fromCode !== String(serviceCode || '').trim().toUpperCase() &&
        fromUnits > 1e-9
      ) {
        rowsToApply.push({
          actionType: 'reduction',
          userId,
          serviceCode: fromCode,
          units: Number(fromUnits.toFixed(2)),
          rowMatchKey: c?.rowMatchKey ? `${c.rowMatchKey}:from-code-reduction` : null,
          providerName: c?.provider_name || null,
          patientFirstName: c?.patient_first_name || null,
          serviceDate: c?.service_date || null,
          fromStatus: c?.from_status || null,
          location: c?.metadata_json?.fromLocation || c?.metadata_json?.toLocation || null,
          baselineRowId: c?.metadata_json?.baselineRowId || null,
          compareRowId: c?.metadata_json?.compareRowId || null,
          fromServiceCode: fromCode,
          toServiceCode: String(serviceCode || '').trim().toUpperCase(),
          reason: 'service_code_changed'
        });
      }
    }
  }
  if (!rowsToApply.length) return;
  try {
    rawAddToCurrentPeriodApplying.value = true;
    rawAddToCurrentPeriodError.value = '';
    await api.post(`/payroll/periods/${destId}/raw-audit-actions/apply`, {
      sourcePayrollPeriodId: rawAuditActivePeriodId.value,
      rows: rowsToApply
    });
    rawAddToCurrentPeriodError.value = '';
    rawAddToCurrentPeriodSelection.value = {};
    await loadPeriods();
    await loadRawAuditData();
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || '';
    if (e.response?.status === 409 && (String(msg).includes('H0031') || String(msg).includes('H0032') || String(msg).includes('H2014') || String(msg).includes('H2032') || String(msg).includes('90853'))) {
      const ok = window.confirm('Carryover is blocked by H0031/H0032/H2014/H2032/90853 processing. Apply anyway (skip processing gate)?');
      if (ok) {
        await api.post(`/payroll/periods/${destId}/raw-audit-actions/apply`, {
          sourcePayrollPeriodId: rawAuditActivePeriodId.value,
          rows: rowsToApply
        }, { params: { skipProcessingGate: 'true' } });
        rawAddToCurrentPeriodError.value = '';
        rawAddToCurrentPeriodSelection.value = {};
        await loadPeriods();
        await loadRawAuditData();
      } else {
        rawAddToCurrentPeriodError.value = msg;
      }
    } else {
      rawAddToCurrentPeriodError.value = msg || 'Failed to add to current period';
    }
  } finally {
    rawAddToCurrentPeriodApplying.value = false;
  }
};

const rawStatusLabel = (r) => {
  const direct = String(r?.normalized_status || '').trim().toUpperCase();
  if (direct) return direct;
  const st = String(r?.note_status || '').trim().toUpperCase();
  if (st === 'FINALIZED') return 'FINALIZED';
  if (st === 'DRAFT') return Number(r?.draft_payable || 0) ? 'DRAFT_PAID' : 'DRAFT_UNPAID';
  return 'NO_NOTE';
};

const rawPaidStateLabel = (r) => {
  const direct = String(r?.paid_state || '').trim().toUpperCase();
  if (direct) return direct;
  const status = rawStatusLabel(r);
  return (status === 'FINALIZED' || status === 'DRAFT_PAID') ? 'PAID' : 'UNPAID';
};

const rawStatusPillClass = (r) => {
  const st = rawStatusLabel(r);
  if (st === 'FINALIZED') return 'status-pill-finalized';
  if (st === 'DRAFT_PAID') return 'status-pill-draft-paid';
  if (st === 'DRAFT_UNPAID') return 'status-pill-draft-unpaid';
  return 'status-pill-no-note';
};

const rawChangeTypeLabel = (type) => {
  const t = String(type || '').trim().toLowerCase();
  if (t === 'status_change') return 'Status changed';
  if (t === 'code_change') return 'Code changed';
  if (t === 'unit_change') return 'Units changed';
  if (t === 'added') return 'Added in selected run';
  if (t === 'removed') return 'Removed in selected run';
  if (t === 'location_changed') return 'Place of service changed';
  if (t === 'service_code_changed') return 'Service code changed';
  if (t === 'overpaid_deleted') return 'Overpaid—session deleted';
  return type || 'Changed';
};

const rawAuditNoteTargetRowId = (item) => {
  if (!item) return null;
  if (Number(item?.id || 0) > 0) return Number(item.id);
  const compareRowId = Number(item?.metadata_json?.compareRowId || 0);
  if (compareRowId > 0) return compareRowId;
  const baselineRowId = Number(item?.metadata_json?.baselineRowId || 0);
  if (baselineRowId > 0) return baselineRowId;
  return null;
};

const rawAuditNoteContextLabel = (item) => {
  const provider = String(item?.provider_name || '').trim() || 'Unknown provider';
  const client = String(item?.patient_first_name || '').trim() || 'Unknown client';
  const code = String(item?.service_code || item?.to_service_code || item?.from_service_code || '').trim() || 'Unknown code';
  const dos = ymd(item?.service_date) || 'Unknown DOS';
  return `${provider} • ${client} • ${code} • ${dos}`;
};

const openRawRowNotes = async (item) => {
  const rowId = rawAuditNoteTargetRowId(item);
  if (!rowId) {
    rawRowNotesError.value = 'This row does not have a note target.';
    return;
  }
  rawRowNotesOpen.value = true;
  rawRowNotesRowId.value = rowId;
  rawRowNotesContext.value = rawAuditNoteContextLabel(item);
  rawRowNotesError.value = '';
  rawRowNoteDraft.value = '';
  rawRowNotesLoading.value = true;
  try {
    const resp = await api.get(`/payroll/import-rows/${rowId}/audit-notes`);
    rawRowNotes.value = resp.data?.notes || [];
  } catch (e) {
    rawRowNotesError.value = e.response?.data?.error?.message || e.message || 'Failed to load notes';
    rawRowNotes.value = [];
  } finally {
    rawRowNotesLoading.value = false;
  }
};

const saveRawRowNote = async () => {
  const rowId = Number(rawRowNotesRowId.value || 0);
  const note = String(rawRowNoteDraft.value || '').trim();
  if (!rowId || !note) return;
  try {
    rawRowNotesSaving.value = true;
    rawRowNotesError.value = '';
    const resp = await api.post(`/payroll/import-rows/${rowId}/audit-notes`, { note });
    rawRowNotes.value = resp.data?.notes || [];
    rawRowNoteDraft.value = '';
  } catch (e) {
    rawRowNotesError.value = e.response?.data?.error?.message || e.message || 'Failed to save note';
  } finally {
    rawRowNotesSaving.value = false;
  }
};

const missedAppointmentsPaidInFullRows = computed(() => {
  const all = (missedAppointmentsPaidInFull.value || []).slice();
  const q = String(rawDraftSearch.value || '').trim().toLowerCase();
  let rows = all;
  if (q) {
    rows = rows.filter((r) => String(r?.clinician_name || '').toLowerCase().includes(q));
  }
  rows.sort((a, b) => String(a?.clinician_name || '').localeCompare(String(b?.clinician_name || '')));
  return rows;
});

const carryoverDraftReviewFiltered = computed(() => {
  const all = Array.isArray(carryoverDraftReview.value) ? carryoverDraftReview.value : [];
  const q = String(carryoverDraftReviewSearch.value || '').trim().toLowerCase();
  if (!q) return all;
  return all.filter((r) => {
    const prov = String(r?.providerName || '').toLowerCase();
    const code = String(r?.serviceCode || '').toLowerCase();
    const dos = String(r?.serviceDate || '').toLowerCase();
    const client = String(r?.clientHint || '').toLowerCase();
    return prov.includes(q) || code.includes(q) || dos.includes(q) || client.includes(q);
  });
});

const carryoverDraftReasonLabel = (code) => {
  const c = String(code || '').trim().toLowerCase();
  if (c === 'prior_no_note') return 'Was NO_NOTE in a prior pay period';
  if (c === 'prior_draft_unpaid') return 'Was DRAFT not payable in a prior pay period';
  return String(code || '');
};

const setDraftPayableByRowId = async (rowId, nextVal) => {
  const id = Number(rowId || 0);
  if (!Number.isFinite(id) || id <= 0) return;
  if (isPeriodPosted.value) return;
  if (isRawAuditHistoricalRun.value) return;
  try {
    updatingDraftPayable.value = true;
    updatingCarryoverDraftRowId.value = id;
    rawDraftError.value = '';
    carryoverError.value = '';

    const resp = await api.patch(`/payroll/import-rows/${id}`, { draftPayable: !!nextVal });

    // Update local raw row state
    const idx = (rawImportRows.value || []).findIndex((r) => Number(r?.id) === id);
    if (idx >= 0) {
      rawImportRows.value[idx] = { ...rawImportRows.value[idx], draft_payable: nextVal ? 1 : 0 };
    }

    // Update local carryover draft review state
    const didx = (carryoverDraftReview.value || []).findIndex((r) => Number(r?.rowId) === id);
    if (didx >= 0) {
      carryoverDraftReview.value[didx] = { ...carryoverDraftReview.value[didx], draftPayable: nextVal ? 1 : 0 };
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
    const msg = e.response?.data?.error?.message || e.message || 'Failed to update draft payable';
    rawDraftError.value = msg;
    carryoverError.value = msg;
  } finally {
    updatingCarryoverDraftRowId.value = null;
    updatingDraftPayable.value = false;
  }
};

const toggleDraftPayable = async (row, nextVal) => {
  if (!row?.id) return;
  await setDraftPayableByRowId(row.id, nextVal);
};

const updateRawMinutes = async (row, nextValRaw) => {
  if (!row?.id) return;
  if (isPeriodPosted.value && !rawPostedProcessingUnlocked.value) return;
  if (isRawAuditHistoricalRun.value) return;
  if (Number(row.requires_processing) !== 1) return;
  try {
    const nextMinutes = Math.round(Number(nextValRaw));
    if (!Number.isFinite(nextMinutes) || nextMinutes <= 0) return;
    updatingDraftPayable.value = true;
    rawDraftError.value = '';
    const qs = (isPeriodPosted.value && rawPostedProcessingUnlocked.value) ? '?allowPostedProcessing=true' : '';
    const resp = await api.patch(`/payroll/import-rows/${row.id}${qs}`, { unitCount: nextMinutes });
    const idx = (rawImportRows.value || []).findIndex((r) => r.id === row.id);
    if (idx >= 0) {
      rawImportRows.value[idx] = { ...rawImportRows.value[idx], unit_count: nextMinutes };
    }
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
    rawDraftError.value = e.response?.data?.error?.message || e.message || 'Failed to update minutes';
  } finally {
    updatingDraftPayable.value = false;
  }
};

const toggleRawProcessed = async (row, nextDone) => {
  if (!row?.id) return;
  if (isPeriodPosted.value && !rawPostedProcessingUnlocked.value) return;
  if (isRawAuditHistoricalRun.value) return;
  if (Number(row.requires_processing) !== 1) return;
  try {
    updatingDraftPayable.value = true;
    rawDraftError.value = '';
    const qs = (isPeriodPosted.value && rawPostedProcessingUnlocked.value) ? '?allowPostedProcessing=true' : '';
    const resp = await api.patch(`/payroll/import-rows/${row.id}${qs}`, { processed: !!nextDone });
    const idx = (rawImportRows.value || []).findIndex((r) => r.id === row.id);
    if (idx >= 0) {
      rawImportRows.value[idx] = {
        ...rawImportRows.value[idx],
        processed_at: nextDone ? (new Date().toISOString()) : null
      };
    }
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
    rawDraftError.value = e.response?.data?.error?.message || e.message || 'Failed to update processed status';
  } finally {
    updatingDraftPayable.value = false;
  }
};

const unlockPostedRawProcessing = () => {
  if (!isPeriodPosted.value) return;
  if (!isRawImportProcessMode(rawMode.value)) return;
  if (rawPostedProcessingUnlocked.value) return;
  const ok = window.confirm(
    'Unlock editing for a POSTED pay period?\n\nThis will allow editing H0031/H0032 minutes and marking Done in Raw Import so you can correct time for Category-1 providers.\n\nIt does NOT automatically recompute posted payroll totals.'
  );
  if (ok) rawPostedProcessingUnlocked.value = true;
};

watch([showRawModal, rawMode, selectedPeriodId], ([open, mode]) => {
  // Default back to locked when reopening/switching.
  if (!open) rawPostedProcessingUnlocked.value = false;
  if (!isRawImportProcessMode(mode)) rawPostedProcessingUnlocked.value = false;
});

watch([rawAuditSelectedImportId, rawAuditBaselineImportId, rawAuditSelectedRunId, rawAuditBaselineRunId], async ([importId, baselineImportId, runId, baselineRunId], [prevImportId, prevBaselineImportId, prevRunId, prevBaselineRunId]) => {
  if (!showRawModal.value) return;
  if (rawAuditLoading.value) return;
  const hasImports = Array.isArray(rawAuditImports.value) && rawAuditImports.value.length > 0;
  if (hasImports) {
    if (!importId || !baselineImportId) return;
    if (Number(importId) === Number(prevImportId) && Number(baselineImportId) === Number(prevBaselineImportId)) return;
    await loadRawAuditData({ importId, baselineImportId });
    return;
  }
  if (!runId || !baselineRunId) return;
  if (Number(runId) === Number(prevRunId) && Number(baselineRunId) === Number(prevBaselineRunId)) return;
  await loadRawAuditData({ runId, baselineRunId });
});

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
const LS_PROCESS_CHANGES_AGGREGATE = 'payroll:processChangesAggregate:v1';

const safeJsonParse = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

// ---- Process Changes aggregate (cross-agency) ----
// Persisted so super admins can switch orgs while processing and still see totals.
const processChangesAggregateCollapsed = ref(false);
const showManageImportsModal = ref(false);
const manageImportsPeriodId = ref(null);
const manageImportsList = ref([]);
const manageImportsLoading = ref(false);
const manageImportsError = ref('');
const manageImportsDeleting = ref(null);
const manageImportsReplacing = ref(null);
const manageImportsReplaceImp = ref(null);
const manageImportsReplaceInput = ref(null);

const manageImportsPeriodIsPosted = computed(() => {
  const pid = manageImportsPeriodId.value;
  if (!pid) return false;
  const p = (periods.value || []).find((x) => Number(x?.id) === Number(pid));
  return (p?.status || '').toLowerCase() === 'posted' || (p?.status || '').toLowerCase() === 'finalized';
});

const manageImportsCanForceDeleteEmptyRun1 = computed(() => {
  const list = manageImportsList.value || [];
  const run1 = list.find((imp) => (imp.slot_number || imp.import_sequence) === 1);
  return manageImportsPeriodIsPosted.value && run1 && (run1.row_count ?? 0) === 0 && list.length >= 2;
});
const processChangesAggregate = ref(
  safeJsonParse(localStorage.getItem(LS_PROCESS_CHANGES_AGGREGATE) || '[]', [])
);

const processChangesAggregateForAgency = computed(() => {
  const aid = Number(agencyId.value || 0);
  if (!aid) return [];
  const rows = Array.isArray(processChangesAggregate.value) ? processChangesAggregate.value : [];
  return rows.filter((r) => Number(r?.agencyId || 0) === aid);
});

const persistProcessChangesAggregate = () => {
  try {
    localStorage.setItem(LS_PROCESS_CHANGES_AGGREGATE, JSON.stringify(processChangesAggregate.value || []));
  } catch {
    // ignore
  }
};

const clearProcessChangesAggregate = () => {
  processChangesAggregate.value = [];
  try {
    localStorage.removeItem(LS_PROCESS_CHANGES_AGGREGATE);
  } catch {
    // ignore
  }
};

const recordProcessChangesAggregateEntry = (entry) => {
  const e = entry || {};
  const agencyIdVal = Number(e.agencyId || 0) || null;
  if (!agencyIdVal) return;
  const next = Array.isArray(processChangesAggregate.value) ? processChangesAggregate.value.slice() : [];
  // De-dupe: same agency + destination + prior => update, else append.
  const key = `${agencyIdVal}:${Number(e.destinationPeriodId || 0) || 0}:${Number(e.priorPeriodId || 0) || 0}`;
  const idx = next.findIndex((x) => String(x?.key || '') === key);
  const row = {
    key,
    agencyId: agencyIdVal,
    agencyName: String(e.agencyName || '').trim() || `Agency #${agencyIdVal}`,
    destinationPeriodId: Number(e.destinationPeriodId || 0) || null,
    destinationPeriodLabel: String(e.destinationPeriodLabel || '').trim() || '',
    priorPeriodId: Number(e.priorPeriodId || 0) || null,
    priorPeriodLabel: String(e.priorPeriodLabel || '').trim() || '',
    unitsApplied: Number(e.unitsApplied || 0) || 0,
    notesApplied: Number(e.notesApplied || 0) || 0,
    rowsInserted: Number(e.rowsInserted || 0) || 0,
    appliedAt: String(e.appliedAt || new Date().toISOString())
  };
  if (idx >= 0) next[idx] = row;
  else next.unshift(row);
  processChangesAggregate.value = next;
  persistProcessChangesAggregate();
};

const processChangesAggregateTotals = computed(() => {
  const rows = Array.isArray(processChangesAggregateForAgency.value) ? processChangesAggregateForAgency.value : [];
  let units = 0;
  let notes = 0;
  let inserted = 0;
  const agencies = new Set();
  for (const r of rows) {
    agencies.add(Number(r?.agencyId || 0));
    units += Number(r?.unitsApplied || 0) || 0;
    notes += Number(r?.notesApplied || 0) || 0;
    inserted += Number(r?.rowsInserted || 0) || 0;
  }
  return {
    agencyCount: Array.from(agencies).filter((x) => x > 0).length,
    unitsAppliedTotal: Number(units.toFixed(2)),
    notesAppliedTotal: Math.max(0, parseInt(notes, 10) || 0),
    rowsInsertedTotal: inserted
  };
});

const showOffSchedulePeriods = ref(false);

const loadPeriods = async () => {
  if (!agencyId.value) return;
  // Fire ensure-future in the background so it never blocks the page render.
  // It is idempotent — missing periods will be created asynchronously.
  api.post('/payroll/periods/ensure-future', { months: 6, pastPeriods: 2 }, { params: { agencyId: agencyId.value } }).catch(() => {/* silent */});
  try {
    const resp = await api.get('/payroll/periods', {
      // Always load all periods so off-schedule/older periods resolve labels correctly.
      params: { agencyId: agencyId.value, alignedOnly: 'false' }
    });
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

const rawAuditImportOptionLabel = (imp) => {
  const slot = Number(imp?.slot_number || 0);
  const imported = ymd(imp?.created_at);
  const name = String(imp?.original_filename || '').trim();
  const suffix = name ? ` - ${name}` : '';
  return `Run ${slot || 1} - ${imported}${suffix}`;
};

const loadRawAuditData = async ({ runId = null, baselineRunId = null, importId = null, baselineImportId = null } = {}) => {
  const activePeriodId = rawModalActivePeriodId.value ?? selectedPeriodId.value;
  if (!activePeriodId) return;
  try {
    rawAuditLoading.value = true;
    const resp = await api.get(`/payroll/periods/${activePeriodId}/raw-audit`, {
      params: {
        runId: runId || rawAuditSelectedRunId.value || undefined,
        baselineRunId: baselineRunId || rawAuditBaselineRunId.value || undefined,
        importId: importId || rawAuditSelectedImportId.value || undefined,
        baselineImportId: baselineImportId || rawAuditBaselineImportId.value || undefined
      }
    });
    rawAuditRuns.value = resp.data?.runs || [];
    rawAuditImports.value = resp.data?.imports || [];
    rawAuditSelectedRunId.value = Number(resp.data?.selectedRunId || 0) || null;
    rawAuditBaselineRunId.value = Number(resp.data?.baselineRunId || 0) || null;
    rawAuditLatestRunId.value = Number(resp.data?.latestRunId || 0) || null;
    rawAuditSelectedImportId.value = Number(resp.data?.selectedImportId || 0) || null;
    rawAuditBaselineImportId.value = Number(resp.data?.baselineImportId || 0) || null;
    rawAuditLatestImportId.value = Number(rawAuditImports.value?.[rawAuditImports.value.length - 1]?.id || 0) || null;
    rawImportRows.value = resp.data?.rows || [];
    rawAuditChanges.value = resp.data?.changes || [];
  } catch (e) {
    rawDraftError.value = e.response?.data?.error?.message || e.message || 'Failed to load raw run audit';
    rawAuditRuns.value = [];
    rawAuditImports.value = [];
    rawAuditChanges.value = [];
  } finally {
    rawAuditLoading.value = false;
  }
};

const loadRunsSideBySide = async () => {
  if (!selectedPeriodId.value) return;
  try {
    runsSideBySideLoading.value = true;
    runsSideBySideData.value = null;
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/runs-side-by-side`);
    runsSideBySideData.value = resp.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load runs side-by-side';
    runsSideBySideData.value = null;
  } finally {
    runsSideBySideLoading.value = false;
  }
};

const openRunsSideBySideModal = async () => {
  if (!selectedPeriodId.value) return;
  showRunsSideBySideModal.value = true;
  runsSideBySideSearch.value = '';
  runsSideBySideSortColumn.value = 'provider_name';
  runsSideBySideSortDirection.value = 'asc';
  await loadRunsSideBySide();
};

const runsSideBySideFilteredRows = computed(() => {
  const rows = runsSideBySideData.value?.rows || [];
  const q = String(runsSideBySideSearch.value || '').trim().toLowerCase();
  const matches = (r) => {
    if (!q) return true;
    const prov = String(r.provider_name || '').toLowerCase();
    const code = String(r.service_code || '').toLowerCase();
    const client = String(r.client_hint || '').toLowerCase();
    const date = String(r.service_date || '').toLowerCase();
    const s1 = String(r.run1_status || '').toLowerCase();
    const s2 = String(r.run2_status || '').toLowerCase();
    const s3 = String(r.run3_status || '').toLowerCase();
    return prov.includes(q) || code.includes(q) || client.includes(q) || date.includes(q) ||
      s1.includes(q) || s2.includes(q) || s3.includes(q);
  };
  const sorted = [...rows].sort((a, b) => {
    if (q) {
      const ma = matches(a) ? 1 : 0;
      const mb = matches(b) ? 1 : 0;
      if (ma !== mb) return mb - ma;
    }
    const col = runsSideBySideSortColumn.value || 'provider_name';
    const dir = runsSideBySideSortDirection.value === 'asc' ? 1 : -1;
    let cmp = 0;
    if (col === 'provider_name') cmp = String(a.provider_name || '').localeCompare(String(b.provider_name || ''), undefined, { sensitivity: 'base' });
    else if (col === 'service_code') cmp = String(a.service_code || '').localeCompare(String(b.service_code || ''), undefined, { sensitivity: 'base' });
    else if (col === 'service_date') cmp = String(a.service_date || '').localeCompare(String(b.service_date || ''), undefined, { sensitivity: 'base' });
    else if (col === 'client_hint') cmp = String(a.client_hint || '').localeCompare(String(b.client_hint || ''), undefined, { sensitivity: 'base' });
    else if (col === 'run1_units') cmp = (Number(a.run1_units ?? -1) || -1) - (Number(b.run1_units ?? -1) || -1);
    else if (col === 'run1_status') cmp = String(a.run1_status || '').localeCompare(String(b.run1_status || ''), undefined, { sensitivity: 'base' });
    else if (col === 'run2_units') cmp = (Number(a.run2_units ?? -1) || -1) - (Number(b.run2_units ?? -1) || -1);
    else if (col === 'run2_status') cmp = String(a.run2_status || '').localeCompare(String(b.run2_status || ''), undefined, { sensitivity: 'base' });
    else if (col === 'run3_units') cmp = (Number(a.run3_units ?? -1) || -1) - (Number(b.run3_units ?? -1) || -1);
    else if (col === 'run3_status') cmp = String(a.run3_status || '').localeCompare(String(b.run3_status || ''), undefined, { sensitivity: 'base' });
    else cmp = 0;
    return cmp * dir;
  });
  return sorted;
});

const toggleRunsSideBySideSort = (col) => {
  if (runsSideBySideSortColumn.value === col) {
    runsSideBySideSortDirection.value = runsSideBySideSortDirection.value === 'asc' ? 'desc' : 'asc';
  } else {
    runsSideBySideSortColumn.value = col;
    runsSideBySideSortDirection.value = ['run1_units', 'run2_units', 'run3_units', 'service_date'].includes(col) ? 'desc' : 'asc';
  }
};

const runsSideBySideSortIndicator = (col) => {
  if (runsSideBySideSortColumn.value !== col) return '';
  return runsSideBySideSortDirection.value === 'asc' ? ' ↑' : ' ↓';
};

const loadPeriodDetails = async () => {
  if (!selectedPeriodId.value) return;
  try {
    // Staging is intentionally NOT loaded here — it is heavy (per-provider salary/tier math)
    // and only needed when Payroll Stage is open. See watch(showStageModal).
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}`);
    selectedPeriod.value = resp.data?.period || null;
    rawImportRows.value = resp.data?.rows || [];
    // Keep import_count in sync so display status / stepper stay accurate after upload.
    if (selectedPeriod.value) {
      const countFromRows = Array.isArray(rawImportRows.value) && rawImportRows.value.length > 0 ? 1 : 0;
      selectedPeriod.value = {
        ...selectedPeriod.value,
        import_count: Number(selectedPeriod.value.import_count || 0) || countFromRows
      };
      const idx = (periods.value || []).findIndex((p) => Number(p?.id) === Number(selectedPeriod.value.id));
      if (idx >= 0) {
        periods.value[idx] = { ...periods.value[idx], import_count: selectedPeriod.value.import_count };
      }
    }
    missedAppointmentsPaidInFull.value = resp.data?.missedAppointmentsPaidInFull || [];
    // Persist the fast pending counts for the dashboard metric card.
    if (resp.data?.pendingCounts != null) {
      dashboardPendingCounts.value = resp.data.pendingCounts;
    }
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
    if (!previewUserId.value && summariesSortedByProvider.value.length) {
      previewUserId.value = summariesSortedByProvider.value[0].user_id;
    }
    if (showRawModal.value) {
      await loadRawAuditData();
    }
    // If Stage is already open (period switch while modal visible), refresh staging.
    if (showStageModal.value) {
      loadStaging().catch(() => {/* loadStaging sets stagingError */});
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load pay period details';
    // Preserve the last-known selectedPeriod (or fall back to the cached period list) so modals can still mount.
    const id = Number(selectedPeriodId.value || 0);
    if (!selectedPeriod.value && id) {
      selectedPeriod.value = (periods.value || []).find((p) => Number(p?.id) === id) || null;
    }
  }
};

const openRawModal = async () => {
  if (!selectedPeriodId.value) return;
  error.value = '';
  // Clear any prior-period override so we use selectedPeriodId for the current-period view.
  rawModalActivePeriodId.value = null;
  // Open immediately so a failed refresh doesn't feel like a dead click.
  showRawModal.value = true;
  await loadRawAuditData();
  // Keep legacy data paths for display-only sections that still read /periods/:id payload.
  if (!Array.isArray(missedAppointmentsPaidInFull.value) || missedAppointmentsPaidInFull.value.length === 0) {
    try { await loadPeriodDetails(); } catch { /* surfaced via error.value */ }
  }
  rawProcessChecklistByRowId.value = {};
  rawRowLimit.value = 200;
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

// rate sheet import removed

const loadStaging = async () => {
  if (!selectedPeriodId.value) return;
  try {
    stagingLoading.value = true;
    stagingError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/staging`);
    stagingMatched.value = (resp.data?.matched || []).filter((r) => !!r && typeof r === 'object');
    stagingUnmatched.value = (resp.data?.unmatched || []).filter((r) => !!r && typeof r === 'object');
    tierByUserId.value = resp.data?.tierByUserId || {};
    salaryByUserId.value = resp.data?.salaryByUserId || {};
    // Use persisted prior-unpaid snapshot (red column) if present.
    if (Array.isArray(resp.data?.priorStillUnpaid)) {
      carryoverPriorStillUnpaid.value = resp.data.priorStillUnpaid.map((d) => ({
        userId: d.userId,
        serviceCode: d.serviceCode,
        stillUnpaidUnits: Number(d.stillUnpaidUnits || 0),
        firstName: d.firstName,
        lastName: d.lastName,
        providerName: d.providerName
      }));
      carryoverPriorStillUnpaidMeta.value = {
        currentPeriodId: Number(selectedPeriodId.value),
        priorPeriodId: resp.data?.priorStillUnpaidMeta?.sourcePayrollPeriodId || null,
        baselineRunId: null,
        compareRunId: null
      };
    }
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

const loadHolidayHoursReport = async () => {
  if (!selectedPeriodId.value) return;
  try {
    holidayHoursLoading.value = true;
    holidayHoursError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/reports/holiday-hours`);
    holidayHoursMatched.value = (resp.data?.matched || []).filter((r) => !!r && typeof r === 'object');
    holidayHoursUnmatched.value = (resp.data?.unmatched || []).filter((r) => !!r && typeof r === 'object');
  } catch (e) {
    holidayHoursError.value = e.response?.data?.error?.message || e.message || 'Failed to load holiday hours report';
    holidayHoursMatched.value = [];
    holidayHoursUnmatched.value = [];
  } finally {
    holidayHoursLoading.value = false;
  }
};

const openHolidayHoursModal = async () => {
  showHolidayHoursModal.value = true;
  await loadHolidayHoursReport();
};

const loadSupervisionAttendanceReport = async () => {
  if (!agencyId.value || !selectedPeriod.value) return;
  try {
    supervisionAttendanceLoading.value = true;
    supervisionAttendanceError.value = '';
    const startDate = String(selectedPeriod.value?.period_start || '').slice(0, 10);
    const endDate = String(selectedPeriod.value?.period_end || '').slice(0, 10);
    supervisionAttendanceStartDate.value = startDate;
    supervisionAttendanceEndDate.value = endDate;
    const resp = await api.get('/supervision/attendance-logs', {
      params: {
        agencyId: Number(agencyId.value),
        startDate,
        endDate
      }
    });
    supervisionAttendanceRows.value = (resp.data?.logs || []).filter((r) => !!r && typeof r === 'object');
  } catch (e) {
    supervisionAttendanceError.value = e.response?.data?.error?.message || e.message || 'Failed to load supervision attendance report';
    supervisionAttendanceRows.value = [];
  } finally {
    supervisionAttendanceLoading.value = false;
  }
};

const downloadSupervisionAttendanceCsv = async () => {
  if (!agencyId.value || !selectedPeriod.value) return;
  try {
    supervisionAttendanceLoading.value = true;
    supervisionAttendanceError.value = '';
    const startDate = String(selectedPeriod.value?.period_start || '').slice(0, 10);
    const endDate = String(selectedPeriod.value?.period_end || '').slice(0, 10);
    const resp = await api.get('/supervision/attendance-logs/export', {
      params: {
        agencyId: Number(agencyId.value),
        startDate,
        endDate
      },
      responseType: 'blob'
    });
    const blob = new Blob([resp.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `supervision-attendance-${Number(agencyId.value)}-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    supervisionAttendanceError.value = e.response?.data?.error?.message || e.message || 'Failed to export supervision attendance CSV';
  } finally {
    supervisionAttendanceLoading.value = false;
  }
};

const loadSupervisionConflictsReport = async () => {
  if (!selectedPeriodId.value) return;
  try {
    supervisionConflictsLoading.value = true;
    supervisionConflictsError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/reports/supervision-conflicts`);
    supervisionConflictsRows.value = (resp.data?.rows || []).filter((r) => !!r && typeof r === 'object');
  } catch (e) {
    supervisionConflictsError.value = e.response?.data?.error?.message || e.message || 'Failed to load supervision conflict report';
    supervisionConflictsRows.value = [];
  } finally {
    supervisionConflictsLoading.value = false;
  }
};

const supervisionConflictRowKey = (r) => `${Number(r?.user_id || 0)}:${String(r?.service_date || '').slice(0, 10)}`;

const supervisionConflictResolutionLabel = (v) => {
  const k = String(v || '').trim().toLowerCase();
  if (k === 'use_app_attendance') return 'Use app attendance';
  if (k === 'use_legacy_import') return 'Use legacy import';
  if (k === 'ignore') return 'Ignore';
  return '—';
};

const supervisionConflictsUnresolvedCount = computed(() => {
  const rows = Array.isArray(supervisionConflictsRows.value) ? supervisionConflictsRows.value : [];
  const unresolvedKeys = new Set();
  for (const r of rows) {
    if (String(r?.resolution || '').trim()) continue;
    unresolvedKeys.add(supervisionConflictRowKey(r));
  }
  return unresolvedKeys.size;
});

const saveSupervisionConflictResolution = async (row, resolution) => {
  if (!selectedPeriodId.value || !row) return;
  const userId = Number(row.user_id || 0);
  const serviceDate = String(row.service_date || '').slice(0, 10);
  if (!userId || !serviceDate) return;
  const key = supervisionConflictRowKey(row);
  try {
    supervisionConflictSavingKey.value = key;
    supervisionConflictsError.value = '';
    await api.put(`/payroll/periods/${selectedPeriodId.value}/supervision-conflicts/resolution`, {
      userId,
      serviceDate,
      resolution
    });
    await loadSupervisionConflictsReport();
  } catch (e) {
    supervisionConflictsError.value = e.response?.data?.error?.message || e.message || 'Failed to save supervision conflict resolution';
  } finally {
    supervisionConflictSavingKey.value = '';
  }
};

const openSupervisionConflictsModal = async () => {
  showSupervisionConflictsModal.value = true;
  await loadSupervisionConflictsReport();
};

const openSupervisionAttendanceModal = async () => {
  showSupervisionAttendanceModal.value = true;
  await loadSupervisionAttendanceReport();
};

const loadMeetingAttendanceReport = async () => {
  if (!agencyId.value || !selectedPeriod.value) return;
  try {
    meetingAttendanceLoading.value = true;
    meetingAttendanceError.value = '';
    const startDate = String(selectedPeriod.value?.period_start || '').slice(0, 10);
    const endDate = String(selectedPeriod.value?.period_end || '').slice(0, 10);
    meetingAttendanceStartDate.value = startDate;
    meetingAttendanceEndDate.value = endDate;
    const resp = await api.get('/payroll/meeting-attendance', {
      params: {
        agencyId: Number(agencyId.value),
        periodStart: startDate,
        periodEnd: endDate
      }
    });
    meetingAttendanceRows.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
  } catch (e) {
    meetingAttendanceError.value = e.response?.data?.error?.message || e.message || 'Failed to load meeting attendance';
    meetingAttendanceRows.value = [];
  } finally {
    meetingAttendanceLoading.value = false;
  }
};

const syncMeetingAttendance = async () => {
  if (!agencyId.value || !selectedPeriod.value) return;
  try {
    meetingAttendanceSyncing.value = true;
    meetingAttendanceError.value = '';
    const startDate = String(selectedPeriod.value?.period_start || '').slice(0, 10);
    const endDate = String(selectedPeriod.value?.period_end || '').slice(0, 10);
    await api.post('/payroll/meeting-attendance/sync', {
      agencyId: Number(agencyId.value),
      periodStart: startDate,
      periodEnd: endDate
    });
    await loadMeetingAttendanceReport();
    await loadPeriodDetails();
    if (showStageModal.value) await loadStaging();
  } catch (e) {
    meetingAttendanceError.value = e.response?.data?.error?.message || e.message || 'Failed to sync meeting attendance';
  } finally {
    meetingAttendanceSyncing.value = false;
  }
};

const openMeetingAttendanceModal = async () => {
  showMeetingAttendanceModal.value = true;
  await loadMeetingAttendanceReport();
};

const holidayHoursProviderLabel = (r) => {
  const uid = Number(r?.user_id || 0);
  if (uid > 0) return nameForUserId(uid);
  const raw = String(r?.provider_name || '').trim();
  return raw || '—';
};

const beginStageCarryoverEdit = () => {
  stageCarryoverEditMode.value = true;
  const nextCarry = {};
  const nextPrior = {};
  for (const r of stagingMatched.value || []) {
    if (!r?.userId || !r?.serviceCode) continue;
    const k = stagingKey(r);
    nextCarry[k] = Number(r?.carryover?.oldDoneNotesUnits || 0);
    // prefer backend-provided persisted value if present
    nextPrior[k] = Number(r?.carryover?.priorStillUnpaidUnits || 0);
  }
  stageCarryoverEdits.value = nextCarry;
  stagePriorUnpaidEdits.value = nextPrior;
};

const cancelStageCarryoverEdit = () => {
  stageCarryoverEditMode.value = false;
  stageCarryoverEdits.value = {};
  stagePriorUnpaidEdits.value = {};
};

const saveStageCarryoverEdits = async () => {
  if (!selectedPeriodId.value) return;
  try {
    savingStageCarryoverEdits.value = true;
    stagingError.value = '';
    const rows = Object.entries(stageCarryoverEdits.value || {}).map(([k, v]) => {
      const [userId, serviceCode] = String(k).split(':');
      return { userId: Number(userId), serviceCode, carryoverFinalizedUnits: Number(v || 0) };
    });
    const doApply = async (params) => {
      const resp = await api.post(`/payroll/periods/${selectedPeriodId.value}/carryover/apply`, { rows }, { params });
      return resp?.data || null;
    };
    try {
      await doApply(undefined);
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message || '';
      // Catch-up workflow: allow explicit bypass of H0031/H0032 processing gates for carryover edits.
      if (e.response?.status === 409 && (String(msg).includes('H0031') || String(msg).includes('H0032') || String(msg).includes('H2014') || String(msg).includes('H2032') || String(msg).includes('90853') || e.response?.data?.pendingProcessing)) {
        const ok = window.confirm(
          'Old Done Notes is blocked by H0031/H0032 processing requirements.\n\nSave anyway (skip processing gate)?\n\nUse this only for catch-up/backfill. You must verify/correct final units in the destination payroll stage before running payroll.'
        );
        if (!ok) throw e;
        await doApply({ skipProcessingGate: 'true' });
      } else {
        throw e;
      }
    }
    await loadStaging();
  } catch (e) {
    stagingError.value = e.response?.data?.error?.message || e.message || 'Failed to save Old Done Notes edits';
  } finally {
    savingStageCarryoverEdits.value = false;
  }
};

const saveStagePriorUnpaidEdits = async () => {
  if (!selectedPeriodId.value) return;
  try {
    savingStagePriorUnpaidEdits.value = true;
    priorStillUnpaidStageError.value = '';
    const rows = Object.entries(stagePriorUnpaidEdits.value || {}).map(([k, v]) => {
      const [userId, serviceCode] = String(k).split(':');
      return { userId: Number(userId), serviceCode, stillUnpaidUnits: Number(v || 0) };
    });
    await api.put(`/payroll/periods/${selectedPeriodId.value}/prior-unpaid`, {
      sourcePayrollPeriodId: carryoverPriorStillUnpaidMeta.value?.priorPeriodId || null,
      rows
    });
    await loadStaging();
  } catch (e) {
    priorStillUnpaidStageError.value = e.response?.data?.error?.message || e.message || 'Failed to save Prior still unpaid edits';
  } finally {
    savingStagePriorUnpaidEdits.value = false;
  }
};

const selectedTier = computed(() => {
  const uid = selectedUserId.value;
  if (!uid) return null;
  return tierByUserId.value?.[uid] || null;
});

const payrollStageTierSort = ref('tier_desc'); // tier_desc | tier_asc | name_asc

const payrollStageProviderTierRows = computed(() => {
  const rows = rawImportRows.value || [];
  const selectedUid = Number(selectedUserId.value || 0);
  const selectedUser = selectedUid
    ? (agencyUsers.value || []).find((u) => Number(u?.id) === selectedUid) || null
    : null;
  const selectedNameKeys = new Set(selectedUser ? payrollUserNameKeys(selectedUser) : []);

  const matchedUserIds = new Set();
  const unmatchedNames = new Set();
  for (const r of rows || []) {
    const uid = Number(r?.user_id || r?.userId || 0);
    if (Number.isFinite(uid) && uid > 0) {
      if (!selectedUid || uid === selectedUid) matchedUserIds.add(uid);
    }
    else {
      const nm = String(r?.provider_name || r?.providerName || '').trim();
      if (!nm) continue;
      // When a provider is selected, don't show every unmatched import name under that provider.
      // Only keep unmatched names that could plausibly be this selected provider.
      if (!selectedUid || nameKeyCandidates(nm).some((k) => selectedNameKeys.has(k))) {
        unmatchedNames.add(nm);
      }
    }
  }

  const out = [];
  for (const uid of Array.from(matchedUserIds)) {
    const tier = tierByUserId.value?.[uid] || null;
    const sal = salaryByUserId.value?.[uid] || null;
    const currentTierLevel = Number(tier?.currentPeriodTierLevel ?? tier?.rolling?.displayTierLevel ?? tier?.tierLevel ?? 0);
    const lastTierLevel = Number(tier?.lastPayPeriodTierLevel ?? tier?.rolling?.lastPayPeriod?.tierLevel ?? 0);
    const graceActive = Number(tier?.graceActive || 0) === 1;
    const currentStatus = graceActive ? 'Grace' : (currentTierLevel >= 1 ? 'Current' : 'Out of Compliance');
    const salaryAmount = (sal && typeof sal === 'object' && sal.salaryAmount !== undefined && sal.salaryAmount !== null)
      ? Number(sal.salaryAmount || 0)
      : null;
    const salaryTooltip = (() => {
      if (!sal || typeof sal !== 'object') return '';
      const rec = Number(sal.recordId || 0);
      const per = Number(sal.salaryPerPayPeriod || 0);
      const inc = !!sal.includeServicePay;
      const pro = !!sal.prorateByDays;
      const ad = Number(sal.activeDays || 0);
      const pd = Number(sal.periodDays || 0);
      const parts = [];
      if (rec) parts.push(`Salary record #${rec}`);
      if (per > 0) parts.push(`Per pay period: ${fmtMoney(per)}`);
      parts.push(`Include service pay: ${inc ? 'Yes' : 'No'}`);
      if (pro && pd > 0 && ad > 0) parts.push(`Prorated: ${ad}/${pd} days`);
      return parts.join(' • ');
    })();
    out.push({
      key: `u:${uid}`,
      userId: uid,
      name: nameForUserId(uid),
      salaryAmount,
      salaryTooltip,
      tierLevel: currentTierLevel,
      currentLabel: currentTierLevel >= 1 ? `Tier ${currentTierLevel}` : 'Out of Compliance',
      currentStatus,
      currentTooltip: tier?.label || tier?.status || '',
      lastTierLabel: lastTierLevel >= 1 ? `Tier ${lastTierLevel}` : '—'
    });
  }

  out.sort((a, b) => {
    const byName = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    const byTierAsc = (Number(a.tierLevel || 0) - Number(b.tierLevel || 0)) || byName;
    const byTierDesc = (Number(b.tierLevel || 0) - Number(a.tierLevel || 0)) || byName;
    switch (String(payrollStageTierSort.value || 'tier_desc')) {
      case 'tier_asc':
        return byTierAsc;
      case 'name_asc':
        return byName;
      case 'tier_desc':
      default:
        return byTierDesc;
    }
  });

  const unmatched = Array.from(unmatchedNames).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return { matched: out, unmatched };
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
    if (savedId && exists) {
      // Only set the id — watch(selectedPeriodId) loads details (avoids a duplicate fetch).
      selectedPeriodId.value = savedId;
      return;
    }
  } catch { /* ignore */ }

  // Default: most recent period by end date (same sort logic as UI).
  const ordered = (sortedPeriods.value || []).slice();
  const mostRecentNonDraft = ordered.find((p) => String(p?.status || '').toLowerCase() !== 'draft') || null;
  const mostRecent = mostRecentNonDraft || ordered[0] || null;
  if (mostRecent?.id) {
    selectedPeriodId.value = mostRecent.id;
  }
};

const seedStagingEdits = () => {
  const next = {};
  for (const r of stagingMatched.value || []) {
    if (!r?.userId || !r?.serviceCode) continue;
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

const loadCarryoverMultiPeriod = async () => {
  if (!selectedPeriodId.value) return;
  const opts = carryoverCompareOptions.value || [];
  const priorIds = opts.slice(0, 2).map((p) => p.id).filter(Boolean);
  if (priorIds.length < 2) {
    carryoverPriorPeriods.value = [];
    return;
  }
  try {
    carryoverMultiPeriodLoading.value = true;
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/carryover/preview`, {
      params: { priorPeriodIds: priorIds.join(',') }
    });
    carryoverPriorPeriods.value = resp.data?.priorPeriods || [];
  } catch {
    carryoverPriorPeriods.value = [];
  } finally {
    carryoverMultiPeriodLoading.value = false;
  }
};

const openCarryoverModal = async () => {
  showCarryoverModal.value = true;
  carryoverError.value = '';
  carryoverApplyResult.value = null;
  carryoverPreview.value = [];
  carryoverPriorStillUnpaid.value = [];
  carryoverPriorStillUnpaidMeta.value = null;
  carryoverPriorPeriods.value = [];
  carryoverRuns.value = [];
  carryoverBaselineRunId.value = null;
  carryoverCompareRunId.value = null;
  manualCarryoverEnabled.value = false;
  manualCarryover.value = { userId: null, serviceCode: '', oldDoneNotesUnits: '' };
  carryoverPriorPeriodId.value = defaultPriorPeriodId.value;
  loadCarryoverMultiPeriod();
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
  carryoverApplyResult.value = null;
  carryoverPreview.value = [];
  carryoverPriorStillUnpaid.value = [];
  carryoverPriorStillUnpaidMeta.value = null;
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
    const pair = pickDefaultCarryoverRunPair(carryoverRuns.value || []);
    carryoverBaselineRunId.value = pair.baselineRunId;
    carryoverCompareRunId.value = pair.compareRunId;
  }
};

const loadPriorStillUnpaidForStage = async (force = false) => {
  if (!selectedPeriodId.value) return;
  try {
    loadingPriorStillUnpaidForStage.value = true;
    priorStillUnpaidStageError.value = '';

    // Prefer persisted snapshot context for this selected period (saved from previous preview/apply).
    // This avoids silently switching to a different prior period when opening Stage.
    const persistedMeta = (
      carryoverPriorStillUnpaidMeta.value &&
      Number(carryoverPriorStillUnpaidMeta.value.currentPeriodId) === Number(selectedPeriodId.value)
    ) ? carryoverPriorStillUnpaidMeta.value : null;
    if (!force && persistedMeta?.priorPeriodId) {
      return;
    }

    const priorId = Number(persistedMeta?.priorPeriodId || 0) || Number(defaultPriorPeriodId.value || 0) || null;
    if (!priorId) {
      carryoverPriorStillUnpaid.value = [];
      carryoverPriorStillUnpaidMeta.value = null;
      return;
    }

    // Choose baseline+compare runs from the prior period.
    // Default is previous -> latest so we compare the most recent Process Changes cycle.
    const runsResp = await api.get(`/payroll/periods/${priorId}/runs`);
    const runs = runsResp.data || [];
    if (!runs.length) {
      carryoverPriorStillUnpaid.value = [];
      carryoverPriorStillUnpaidMeta.value = { currentPeriodId: Number(selectedPeriodId.value), priorPeriodId: Number(priorId), baselineRunId: null, compareRunId: null };
      return;
    }
    let baselineId = Number(persistedMeta?.baselineRunId || 0) || null;
    let compareId = Number(persistedMeta?.compareRunId || 0) || null;
    if (!baselineId || !compareId) {
      const pair = pickDefaultCarryoverRunPair(runs);
      baselineId = pair.baselineRunId;
      compareId = pair.compareRunId;
    }

    const previewResp = await api.get(`/payroll/periods/${selectedPeriodId.value}/carryover/preview`, {
      params: { priorPeriodId: priorId, baselineRunId: baselineId, compareRunId: compareId }
    });

    const still = Array.isArray(previewResp.data?.stillUnpaid) ? previewResp.data.stillUnpaid : [];
    carryoverPriorStillUnpaid.value = still.map((d) => ({
      userId: d.userId,
      serviceCode: d.serviceCode,
      stillUnpaidUnits: Number(d.stillUnpaidUnits || 0),
      firstName: d.firstName,
      lastName: d.lastName,
      providerName: d.providerName
    }));
    carryoverPriorStillUnpaidMeta.value = {
      currentPeriodId: Number(selectedPeriodId.value),
      priorPeriodId: Number(priorId),
      baselineRunId: Number(baselineId),
      compareRunId: Number(compareId)
    };
  } catch (e) {
    priorStillUnpaidStageError.value = e.response?.data?.error?.message || e.message || 'Failed to load prior unpaid snapshot';
  } finally {
    loadingPriorStillUnpaidForStage.value = false;
  }
};

const loadCarryoverPreview = async () => {
  if (!selectedPeriodId.value || !carryoverPriorPeriodId.value || !carryoverBaselineRunId.value || !carryoverCompareRunId.value) return;
  try {
    carryoverLoading.value = true;
    carryoverError.value = '';
    carryoverDraftReview.value = [];
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
    carryoverDraftReview.value = Array.isArray(resp.data?.draftReview) ? resp.data.draftReview : [];

    // Track rows that are STILL unpaid in the prior period after the selected comparison run.
    // Backend provides this explicitly because `deltas` only includes rows where finalized increased.
    const still = Array.isArray(resp.data?.stillUnpaid) ? resp.data.stillUnpaid : null;
    if (still) {
      carryoverPriorStillUnpaid.value = still.map((d) => ({
        userId: d.userId,
        serviceCode: d.serviceCode,
        stillUnpaidUnits: Number(d.stillUnpaidUnits || 0),
        firstName: d.firstName,
        lastName: d.lastName,
        providerName: d.providerName
      }));
    } else {
      // Backward compatible fallback (older backend)
      carryoverPriorStillUnpaid.value = (deltas || [])
        .filter((d) => !!d?.userId && !!d?.serviceCode && Number(d?.currUnpaidUnits || 0) > 0)
        .map((d) => ({
          userId: d.userId,
          serviceCode: d.serviceCode,
          stillUnpaidUnits: Number(d.currUnpaidUnits || 0),
          firstName: d.firstName,
          lastName: d.lastName,
          providerName: d.providerName
        }));
    }
    carryoverPriorStillUnpaidMeta.value = {
      currentPeriodId: Number(selectedPeriodId.value),
      priorPeriodId: Number(carryoverPriorPeriodId.value),
      baselineRunId: Number(carryoverBaselineRunId.value),
      compareRunId: Number(carryoverCompareRunId.value)
    };
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
    carryoverDraftReview.value = [];
    carryoverDraftReviewSearch.value = '';
    carryoverPriorStillUnpaid.value = [];
    carryoverPriorStillUnpaidMeta.value = null;
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
    carryoverApplyResult.value = null;
    const keyed = new Map(); // `${userId}:${CODE}` -> merged row
    for (const d of (carryoverPreview.value || [])) {
      const userId = Number(d?.userId || 0);
      const serviceCode = String(d?.serviceCode || '').trim().toUpperCase();
      const units = Number(d?.carryoverFinalizedUnits || 0);
      const noteCount = Number(d?.noteCount || 0);
      if (!userId || !serviceCode || !(units > 1e-9)) continue;

      const patchMeta =
        d?.type === 'code_changed'
          ? { categories: { code_changed: { units, notes: noteCount, fromCodes: [d?.fromServiceCode].filter(Boolean) } } }
          : (d?.type === 'late_added_service'
            ? { categories: { late_addition: { units, notes: noteCount } } }
            : (d?.type === 'late_note_completion'
              ? { categories: { old_note: { units, notes: noteCount } } }
              : null));

      const k = `${userId}:${serviceCode}`;
      if (!keyed.has(k)) {
        keyed.set(k, {
          userId,
          serviceCode,
          carryoverFinalizedUnits: 0,
          carryoverFinalizedRowCount: 0,
          carryoverMeta: null
        });
      }
      const t = keyed.get(k);
      t.carryoverFinalizedUnits = Number((Number(t.carryoverFinalizedUnits || 0) + units).toFixed(2));
      t.carryoverFinalizedRowCount = Math.max(0, parseInt(Number(t.carryoverFinalizedRowCount || 0) + (noteCount || 0), 10) || 0);

      if (patchMeta && !t.carryoverMeta) {
        t.carryoverMeta = { categories: { old_note: { units: 0, notes: 0 }, late_addition: { units: 0, notes: 0 }, code_changed: { units: 0, notes: 0, fromCodes: [] } } };
      }
      const cats = (t.carryoverMeta && t.carryoverMeta.categories) ? t.carryoverMeta.categories : null;
      const patchCats = patchMeta?.categories || null;
      if (cats && patchCats) {
        if (patchCats.old_note) {
          cats.old_note.units = Number((Number(cats.old_note.units || 0) + Number(patchCats.old_note.units || 0)).toFixed(2));
          cats.old_note.notes = Math.max(0, parseInt(Number(cats.old_note.notes || 0) + Number(patchCats.old_note.notes || 0), 10) || 0);
        }
        if (patchCats.late_addition) {
          cats.late_addition.units = Number((Number(cats.late_addition.units || 0) + Number(patchCats.late_addition.units || 0)).toFixed(2));
          cats.late_addition.notes = Math.max(0, parseInt(Number(cats.late_addition.notes || 0) + Number(patchCats.late_addition.notes || 0), 10) || 0);
        }
        if (patchCats.code_changed) {
          cats.code_changed.units = Number((Number(cats.code_changed.units || 0) + Number(patchCats.code_changed.units || 0)).toFixed(2));
          cats.code_changed.notes = Math.max(0, parseInt(Number(cats.code_changed.notes || 0) + Number(patchCats.code_changed.notes || 0), 10) || 0);
          const from = Array.isArray(cats.code_changed.fromCodes) ? cats.code_changed.fromCodes : [];
          const add = Array.isArray(patchCats.code_changed.fromCodes) ? patchCats.code_changed.fromCodes : [];
          const merged = Array.from(new Set([...from, ...add].map((x) => String(x || '').trim()).filter(Boolean)));
          cats.code_changed.fromCodes = merged;
        }
      }
    }

    const rows = Array.from(keyed.values()).filter((r) => Number(r?.carryoverFinalizedUnits || 0) > 1e-9);

    const unitsApplied = (rows || []).reduce((acc, r) => acc + (Number(r?.carryoverFinalizedUnits || 0) || 0), 0);
    const notesApplied = (rows || []).reduce((acc, r) => acc + (Number(r?.carryoverFinalizedRowCount || 0) || 0), 0);

    const doApply = async (params) => {
      const resp = await api.post(`/payroll/periods/${selectedPeriodId.value}/carryover/apply`, { rows }, { params });
      return resp?.data || null;
    };

    // IMPORTANT: Express json parser is strict; do not send `null`.
    try {
      const data = await doApply({
        priorPeriodId: carryoverPriorPeriodId.value,
        baselineRunId: carryoverBaselineRunId.value || undefined,
        compareRunId: carryoverCompareRunId.value || undefined
      });
      carryoverApplyResult.value = data ? { inserted: Number(data.inserted || 0), warnings: data.warnings || [] } : { inserted: rows.length, warnings: [] };
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message || '';
      // Catch-up workflow: allow explicit bypass of H0031/H0032 processing gates for carryover apply.
      if (e.response?.status === 409 && (String(msg).includes('H0031') || String(msg).includes('H0032') || String(msg).includes('H2014') || String(msg).includes('H2032') || String(msg).includes('90853') || e.response?.data?.pendingProcessing)) {
        const ok = window.confirm(
          'Carryover is blocked by H0031/H0032 processing requirements.\n\nApply carryover anyway (skip processing gate)?\n\nUse this only for catch-up/backfill. You must verify/correct final units in the destination payroll stage before running payroll.'
        );
        if (ok) {
          const data2 = await doApply({
            priorPeriodId: carryoverPriorPeriodId.value,
            baselineRunId: carryoverBaselineRunId.value || undefined,
            compareRunId: carryoverCompareRunId.value || undefined,
            skipProcessingGate: 'true'
          });
          carryoverApplyResult.value = data2 ? { inserted: Number(data2.inserted || 0), warnings: data2.warnings || [] } : { inserted: rows.length, warnings: [] };
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    // Record cross-agency aggregate so users can switch agencies and still see totals.
    try {
      const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
      const agencyName = String(a?.name || '').trim();
      const destLabel = selectedPeriodForUi.value ? periodRangeLabel(selectedPeriodForUi.value) : '';
      const prior = (periods.value || []).find((p) => Number(p?.id) === Number(carryoverPriorPeriodId.value)) || null;
      const priorLabel = prior ? periodRangeLabel(prior) : (carryoverPriorPeriodId.value ? `Period #${carryoverPriorPeriodId.value}` : '');
      recordProcessChangesAggregateEntry({
        agencyId: agencyId.value,
        agencyName: agencyName || undefined,
        destinationPeriodId: selectedPeriodId.value,
        destinationPeriodLabel: destLabel || undefined,
        priorPeriodId: carryoverPriorPeriodId.value,
        priorPeriodLabel: priorLabel || undefined,
        unitsApplied: Number(unitsApplied.toFixed(2)),
        notesApplied: Math.max(0, parseInt(notesApplied, 10) || 0),
        rowsInserted: Number(carryoverApplyResult.value?.inserted || 0) || rows.length
      });
    } catch {
      // ignore (best-effort)
    }

    await loadStaging();
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

// Some large sections (including the Run/Preview modals) are currently nested under provider-selection UI.
// Ensure we have a selected provider before opening those modals so the modal DOM is mounted.
const ensureProviderSelectedForModals = async () => {
  if (selectedUserId.value) return;
  const list = (summariesSortedByProvider.value || []).slice();
  const first = list[0] || null;
  const uid = first?.user_id || null;
  if (!uid) return;
  selectedUserId.value = uid;
  selectedSummary.value = (summaries.value || []).find((s) => s.user_id === uid) || null;
  if (!previewUserId.value) previewUserId.value = uid;
  await nextTick();
};

// Explicit open handlers (some browsers + forms can swallow plain ref-assign clicks)
const openRunResultsModal = async () => {
  if (!selectedPeriodId.value) return;
  error.value = '';
  await ensureProviderSelectedForModals();
  showRunModal.value = true; // open immediately
  if (!canSeeRunResults.value) {
    // Still open the modal (it will show "No run results yet"), but show an explicit message.
    error.value = 'No run results yet for this pay period. Click Run Payroll first.';
    return;
  }
  // Best-effort; do not block modal open if this fails.
  try { await loadImmediatePriorSummaries(); } catch { /* ignore */ }
};

const openPreviewPostModal = async () => {
  if (!selectedPeriodId.value) return;
  error.value = '';
  await ensureProviderSelectedForModals();
  showPreviewPostModal.value = true; // open immediately
  if (!canSeeRunResults.value) {
    error.value = 'No run results yet for this pay period. Click Run Payroll first.';
    return;
  }
  try { await loadImmediatePriorSummaries(); } catch { /* ignore */ }
};

const exportPayrollCsv = async () => {
  if (!selectedPeriodId.value) return;
  error.value = '';
  if (!canSeeRunResults.value) {
    // Try anyway; backend will respond with a helpful error if it can't export.
    error.value = 'This pay period has no run results yet. Export may fail until you Run Payroll.';
  }
  await downloadExportCsv();
};

const onFilePick = (evt) => {
  importFile.value = evt.target.files?.[0] || null;
  detectedPeriodHint.value = '';
  autoDetectResult.value = null;
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
    confirmAutoImportOpen.value = true;
  } catch (e) {
    error.value = formatPayrollImportError(e, 'Failed to auto-import payroll report');
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
    } else {
      // detected
      if (!autoDetectResult.value?.detected?.periodStart || !autoDetectResult.value?.detected?.periodEnd) {
        error.value = 'No detected pay period available. Choose an existing period.';
        return;
      }
      targetPeriodId = autoImportExistingPeriodId.value;
      if (!targetPeriodId) {
        error.value = 'No existing pay period matched the detected period. Choose an existing pay period (or sync future drafts / show off-schedule periods).';
        return;
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
    error.value = formatPayrollImportError(e, 'Failed to import payroll report');
  } finally {
    importing.value = false;
  }
};

// Manual import should use the SAME confirmation modal as auto-detect.
// This lets admins override dates or choose a different pay period before importing.
const openImportConfirmModal = async () => {
  if (!importFile.value) return;
  if (!agencyId.value) return;

  // Detect in the background so we can pre-select the "right" existing pay period,
  // but never create a pay period from this flow.
  error.value = '';
  autoDetecting.value = true;
  detectedPeriodHint.value = '';
  autoDetectResult.value = null;

  try {
    const fd = new FormData();
    fd.append('file', importFile.value);
    fd.append('agencyId', String(agencyId.value));
    const resp = await api.post('/payroll/periods/auto/detect', fd);
    autoDetectResult.value = resp.data || null;

    const detected = autoDetectResult.value?.detected;
    if (detected?.periodStart && detected?.periodEnd) {
      detectedPeriodHint.value = `Detected pay period: ${detected.periodStart} → ${detected.periodEnd} (Sat→Fri, 14 days). Please confirm.`;
    }
  } catch (e) {
    // If detect fails, still allow manual selection via existing periods.
    autoDetectResult.value = null;
  } finally {
    autoDetecting.value = false;
  }

  // Default selection:
  // - Prefer the detected match (existingPeriodId)
  // - Otherwise fall back to the currently selected pay period
  autoImportExistingPeriodId.value = autoDetectResult.value?.existingPeriodId || selectedPeriodId.value || null;
  autoImportChoiceMode.value = autoDetectResult.value?.detected ? 'detected' : 'existing';
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
  const ids = (sortedAgencyUsers.value || []).map((u) => u.id).filter(Boolean);
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

const openSubmitOnBehalfModal = async () => {
  showSubmitOnBehalfModal.value = true;
  // Ensure provider list is available (shared with staging selector).
  try {
    if (agencyId.value && !(agencyUsers.value || []).length && !loadingUsers.value) {
      await loadAgencyUsers();
    }
  } catch {
    // ignore; UI will show loading/errors elsewhere
  }
};

const closeSubmitOnBehalfModal = () => {
  showSubmitOnBehalfModal.value = false;
};

const clearSubmitOnBehalfProvider = () => {
  submitOnBehalfUserId.value = null;
};

const nextSubmitOnBehalfProvider = () => {
  const ids = (submitOnBehalfUsers.value || []).map((u) => u.id).filter(Boolean);
  if (!ids.length) return;
  if (!submitOnBehalfUserId.value || !ids.includes(submitOnBehalfUserId.value)) {
    submitOnBehalfUserId.value = ids[0];
    return;
  }
  const idx = ids.indexOf(submitOnBehalfUserId.value);
  const nextIdx = idx >= 0 ? (idx + 1) % ids.length : 0;
  submitOnBehalfUserId.value = ids[nextIdx];
};

const nextRunProvider = () => {
  const list = (summariesSortedByProvider.value || []).slice();
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
  const list = (summariesSortedByProvider.value || []).slice();
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
      salaryEffectiveAmount: Number(a.salary_effective_amount || 0),
      salarySource: String(a.salary_effective_source || 'none'),
      salaryPerPayPeriod: Number(a.salary_per_pay_period || 0),
      salaryIncludeServicePay: Number(a.salary_include_service_pay || 0),
      salaryIsProrated: Number(a.salary_is_prorated || 0),
      sickPtoHours: Number(a.sick_pto_hours || 0),
      trainingPtoHours: Number(a.training_pto_hours || 0),
      ptoHours: Number(a.pto_hours || 0),
      ptoRate: Number(a.pto_rate || 0)
    };
    await loadOtherRateTitlesForAdjustments();
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
      medcancelAmount: Number(adjustments.value.medcancelAmount || 0),
      otherTaxableAmount: Number(adjustments.value.otherTaxableAmount || 0),
      imatterAmount: Number(adjustments.value.imatterAmount || 0),
      missedAppointmentsAmount: Number(adjustments.value.missedAppointmentsAmount || 0),
      bonusAmount: Number(adjustments.value.bonusAmount || 0),
      reimbursementAmount: Number(adjustments.value.reimbursementAmount || 0),
      tuitionReimbursementAmount: Number(adjustments.value.tuitionReimbursementAmount || 0),
      otherRate1Hours: Number(adjustments.value.otherRate1Hours || 0),
      otherRate2Hours: Number(adjustments.value.otherRate2Hours || 0),
      otherRate3Hours: Number(adjustments.value.otherRate3Hours || 0),
      salaryAmount: Number(adjustments.value.salaryAmount || 0),
      sickPtoHours: Number(adjustments.value.sickPtoHours || 0),
      trainingPtoHours: Number(adjustments.value.trainingPtoHours || 0),
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
    const data = e.response?.data || {};
    // Leave pending employee submissions for the next period and run anyway.
    if (
      e.response?.status === 409 &&
      data.allowPendingClaims &&
      (data.pendingTime || data.pendingMileage || data.pendingMedcancel || data.pendingReimbursement)
    ) {
      const parts = [];
      if (data.pendingTime?.count) parts.push(`${data.pendingTime.count} time claim(s)`);
      if (data.pendingMileage?.count) parts.push(`${data.pendingMileage.count} mileage`);
      if (data.pendingMedcancel?.count) parts.push(`${data.pendingMedcancel.count} MedCancel`);
      if (data.pendingReimbursement?.count) parts.push(`${data.pendingReimbursement.count} reimbursement(s)`);
      const ok = window.confirm(
        `${data?.error?.message || 'Pending submissions are still awaiting approval.'}\n\n` +
          `Leave ${parts.join(', ') || 'pending submissions'} for the next pay period and run anyway?\n\n` +
          'Skipped claims stay submitted and will be available to approve on the next period.'
      );
      if (ok) {
        try {
          await api.post(
            `/payroll/periods/${selectedPeriodId.value}/run`,
            {},
            { params: { allowPendingClaims: 'true' } }
          );
          await loadPeriods();
          await loadPeriodDetails();
          return;
        } catch (e2) {
          error.value = e2.response?.data?.error?.message || e2.message || 'Failed to run payroll';
          return;
        }
      }
      error.value = 'Run cancelled. Approve/reject claims, or confirm leaving them for the next period.';
      if (data.pendingTime || data.pendingMileage || data.pendingMedcancel || data.pendingReimbursement) {
        showStageModal.value = true;
        try {
          if (data.pendingTime) await loadPendingTimeClaims();
          if (data.pendingMileage) await loadPendingMileageClaims();
          if (data.pendingMedcancel) await loadPendingMedcancelClaims();
        } catch { /* ignore */ }
      }
      return;
    }

    // If trying to re-run a historical pay period just to compare unpaid/no-note changes,
    // allow bypassing the H0031/H0032 processing gate.
    if (e.response?.status === 409 && data.pendingProcessing && selectedPeriod.value?.period_end) {
      const endYmd = String(selectedPeriod.value.period_end || '').slice(0, 10);
      const now = new Date();
      const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const isHistorical = endYmd && endYmd < todayYmd;
      if (isHistorical) {
        const ok = window.confirm(
          'This looks like an older pay period. Run payroll anyway (skip H0031/H0032 minutes gate) so you can compare No-note/Draft unpaid?\n\nThis is intended for historical checks; do not use if you are paying this period.'
        );
        if (ok) {
          try {
            await api.post(`/payroll/periods/${selectedPeriodId.value}/run`, {}, { params: { skipProcessingGate: 'true' } });
            await loadPeriods();
            await loadPeriodDetails();
            return;
          } catch (e2) {
            const msg2 = e2.response?.data?.error?.message || e2.message || 'Failed to run payroll';
            error.value = msg2;
          }
        }
      }
    }

    const msg = data?.error?.message || e.message || 'Failed to run payroll';
    error.value = msg;
    // If blocked due to pending todos, open Payroll Stage.
    if (e.response?.status === 409 && data.pendingTodos) {
      showStageModal.value = true;
      try { await loadPayrollTodos(); } catch { /* ignore */ }
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

// Typed-confirmation modal state for destructive payroll actions.
const dangerConfirm = ref({
  show: false,
  title: '',
  description: '',
  word: '',
  typed: '',
  buttonLabel: '',
  loading: false,
  action: null
});

const dangerConfirmOk = async () => {
  if (dangerConfirm.value.typed !== dangerConfirm.value.word) return;
  if (!dangerConfirm.value.action) return;
  dangerConfirm.value.loading = true;
  try {
    await dangerConfirm.value.action();
    dangerConfirm.value.show = false;
  } finally {
    dangerConfirm.value.loading = false;
    dangerConfirm.value.typed = '';
  }
};

const unpostPayroll = () => {
  if (!selectedPeriodId.value) return;
  dangerConfirm.value = {
    show: true,
    title: 'Unpost Pay Period',
    description: `
      <strong>What this does:</strong>
      <ul style="margin: 8px 0 0 16px; padding: 0;">
        <li>Reverts the period from <em>Posted</em> back to <em>Ran</em></li>
        <li>Rolls back PTO accrual entries that were created at posting time</li>
        <li>Clears any notification records tied to this post so they re-send correctly when you re-post</li>
      </ul>
      <br>
      <strong>What this does NOT do:</strong>
      <ul style="margin: 4px 0 0 16px; padding: 0;">
        <li>Does <em>not</em> delete billing import rows</li>
        <li>Does <em>not</em> delete staging edits or overrides</li>
        <li>Does <em>not</em> delete run results</li>
      </ul>
      <br>
      After unposting, use <strong>Restage</strong> to go back to the staging workspace, make your correction, re-run payroll, then re-post.
    `,
    word: 'UNPOST',
    typed: '',
    buttonLabel: 'Unpost Pay Period',
    loading: false,
    action: async () => {
      unpostingPayroll.value = true;
      error.value = '';
      try {
        await api.post(`/payroll/periods/${selectedPeriodId.value}/unpost`);
        await loadPeriods();
        await loadPeriodDetails();
      } finally {
        unpostingPayroll.value = false;
      }
    }
  };
};

const resetPeriod = () => {
  if (!selectedPeriodId.value) return;
  dangerConfirm.value = {
    show: true,
    title: 'Reset Pay Period',
    description: `
      <strong style="color: #c0392b;">⚠ This is permanent and cannot be undone.</strong>
      <br><br>
      <strong>What this deletes:</strong>
      <ul style="margin: 8px 0 0 16px; padding: 0;">
        <li>All billing import rows for this period</li>
        <li>All staging edits, overrides, and adjustments</li>
        <li>All run results</li>
        <li>All carryover and prior-unpaid records for this period</li>
      </ul>
      <br>
      <strong>What is kept:</strong>
      <ul style="margin: 4px 0 0 16px; padding: 0;">
        <li>The pay period record itself (dates, status reset to Draft)</li>
      </ul>
      <br>
      You will need to re-import the billing report and redo all staging work from scratch.
      Only use this if you need to start completely over. To fix a single person, use <strong>Unpost → Restage</strong> instead.
    `,
    word: 'RESET',
    typed: '',
    buttonLabel: 'Reset Everything',
    loading: false,
    action: async () => {
      resettingPeriod.value = true;
      error.value = '';
      try {
        await api.post(`/payroll/periods/${selectedPeriodId.value}/reset`);
        await loadPeriods();
        await loadPeriodDetails();
      } finally {
        resettingPeriod.value = false;
      }
    }
  };
};

const restagePeriod = async () => {
  try {
    if (!selectedPeriodId.value) return;
    if (!isPeriodRan.value) return;
    const ok = window.confirm('Restage this pay period? This will clear Run Payroll results and return the period to Staged (does not delete imports or staging edits).');
    if (!ok) return;
    restagingPeriod.value = true;
    error.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/restage`);
    await loadPeriods();
    await loadPeriodDetails();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to restage pay period';
  } finally {
    restagingPeriod.value = false;
  }
};


watch(agencyId, async (newId, oldId) => {
  if (newId === oldId) return;
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

    // Ensure we have the full agency record (theme settings, parsed palettes).
    const hydrated = await agencyStore.hydrateAgencyById(found.id);
    const org = hydrated || found;

    // Apply theme immediately (so the user sees the branding switch right away).
    try {
      const paletteRaw = org?.color_palette ?? org?.colorPalette ?? null;
      const themeRaw = org?.theme_settings ?? org?.themeSettings ?? null;
      const colorPalette = typeof paletteRaw === 'string' ? JSON.parse(paletteRaw) : (paletteRaw || {});
      const themeSettings = typeof themeRaw === 'string' ? JSON.parse(themeRaw) : (themeRaw || {});
      brandingStore.applyTheme({
        brandingAgencyId: org?.id,
        agencyId: org?.id,
        colorPalette,
        themeSettings
      });
    } catch {
      // ignore
    }

    // Update the URL to the org-scoped payroll route for a clean context switch.
    const slug = String(org?.slug || org?.portal_url || '').trim();
    const curSlug = String(route.params?.organizationSlug || '').trim();
    if (slug && slug !== curSlug) {
      try {
        await router.push(`/${slug}/admin/payroll`);
      } catch {
        // ignore - router will remain on current route
      }
    }
  }
});

watch(batchCatchUpPriorPeriodId, () => {
  batchCatchUpResult.value = null;
  batchCatchUpError.value = '';
  batchCatchUpSelection.value = {};
  batchCatchUpSearch.value = '';
  superFlagSearch.value = '';
  if (showRawModal.value && rawModalActivePeriodId.value) {
    closeRawModal();
  }
  loadBatchCatchUpPriorImports();
});

watch(selectedPeriodId, async (id) => {
  if (!id) return;
  if (id && (batchCatchUpDestinationPeriodId.value == null || batchCatchUpDestinationPeriodId.value === '')) batchCatchUpDestinationPeriodId.value = id;
  try {
    if (agencyId.value) localStorage.setItem(lsLastPeriodKey(agencyId.value), String(id));
  } catch { /* ignore */ }
  dashboardPendingCounts.value = null; // clear stale count while loading
  // Keep the dashboard light: only period details (summaries/status). Stage-only data
  // (staging aggregates, claims lists, manual pay, todos) loads when Stage opens.
  await loadPeriodDetails();
});

watch(showStageModal, async (open) => {
  if (!open) return;
  // Kick the heavy staging payload first, then load Stage UI data in parallel.
  await Promise.all([
    loadStaging(),
    loadServiceCodeRules(),
    loadMileageRates(),
    loadAllPendingMileageClaims(),
    loadAllPendingMedcancelClaims(),
    loadAllPendingReimbursementClaims(),
    loadAllPendingTimeClaims(),
    loadPendingHolidayBonusClaims(),
    loadAllPendingPtoRequests(),
    loadApprovedMileageClaimsAmount(),
    loadApprovedMedcancelClaimsAmount(),
    loadApprovedHolidayBonusClaimsAmount(),
    loadApprovedReimbursementClaimsAmount(),
    loadApprovedMileageClaimsList(),
    loadApprovedMedcancelClaimsList(),
    loadApprovedHolidayBonusClaimsList(),
    loadApprovedReimbursementClaimsList(),
    loadManualPayLines(),
    loadPayrollTodos(),
    loadPriorStillUnpaidForStage()
  ]);
});

watch(selectedUserId, async () => {
  await loadAdjustments();
  await loadRateCard();
  await loadApprovedMileageClaimsAmount();
  await loadApprovedMedcancelClaimsAmount();
  await loadApprovedHolidayBonusClaimsAmount();
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

watch(previewPostV2UserId, async () => {
  if (!showPreviewPostModalV2.value) return;
  if (previewPostV2Loading.value) return;
  previewPostV2Error.value = '';
  await loadPreviewPostV2Notifications();
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
  // Only re-fetch agencies if the store is still empty (e.g., first page visit).
  // Hot navigations skip this round-trip entirely.
  const hasAgencies = (agencyStore.agencies?.length || agencyStore.userAgencies?.length);
  if (!hasAgencies) {
    if (authStore.user?.role === 'super_admin') {
      await agencyStore.fetchAgencies();
    } else {
      await agencyStore.fetchUserAgencies();
    }
    // Fallback: if assigned agencies are empty (some edge cases), load all.
    if (!(agencyStore.userAgencies?.length || agencyStore.userAgencies?.value?.length) && !(agencyStore.agencies?.length || agencyStore.agencies?.value?.length)) {
      await agencyStore.fetchAgencies();
    }
  }
  // Seed selector from any pre-existing context
  if (agencyId.value) selectedOrgId.value = agencyId.value;
  // Users and periods are independent — fetch them in parallel.
  await Promise.all([loadAgencyUsers(), loadPeriods()]);
  await restoreSelectionFromStorage();
  await consumeWizardDeepLink();
});

/** Deep-links from Payroll Wizard page: ?wizardOpen=stage|raw|process|import|run|post|preview|todos&periodId=&rawMode= */
const consumeWizardDeepLink = async () => {
  const open = String(route.query?.wizardOpen || '').trim();
  if (!open) return;

  const pid = Number(route.query?.periodId || 0) || null;
  if (pid && pid !== Number(selectedPeriodId.value || 0)) {
    await selectPeriod(pid);
  }

  const returnStep = String(route.query?.wizardStep || '').trim();
  if (route.query?.wizardReturn) {
    const slug = String(route.params?.organizationSlug || agencyStore.currentAgency?.slug || '').trim();
    const periodPart = pid || selectedPeriodId.value;
    wizardReturnPath.value = slug
      ? `/${slug}/admin/payroll/wizard/${periodPart || ''}`
      : `/admin/payroll/wizard/${periodPart || ''}`;
    if (returnStep) {
      try {
        // Scope by agency so returning from NLU tools can't jump ITSCO (or vice versa) to the wrong step.
        const aid = Number(agencyId.value || agencyStore.currentAgency?.id || 0) || null;
        sessionStorage.setItem(
          'payroll:wizardReturnStep',
          JSON.stringify({ step: returnStep, agencyId: aid, periodId: periodPart || null })
        );
      } catch {
        // ignore
      }
    }
  }

  await nextTick();

  if (open === 'process') {
    try {
      processChangesCard.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    } catch {
      // ignore
    }
  } else if (open === 'import') {
    try {
      currentPayrollFileInput.value?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    } catch {
      // ignore
    }
    triggerCurrentPayrollUpload();
  } else if (open === 'raw') {
    const mode = String(route.query?.rawMode || 'draft_audit').trim() || 'draft_audit';
    rawMode.value = mode;
    showRawModal.value = true;
  } else if (open === 'stage') {
    showStageModal.value = true;
  } else if (open === 'pto') {
    showStageModal.value = true;
    await nextTick();
    setTimeout(() => {
      ptoSectionRef.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }, 350);
  } else if (open === 'todos') {
    await openTodoModal();
  } else if (open === 'run') {
    await runPayroll();
  } else if (open === 'preview') {
    await openPreviewPostModalV2();
  } else if (open === 'post') {
    await postPayroll();
  }

  // Clear deep-link query so refresh doesn't re-trigger; keep periodId
  const nextQuery = { ...route.query };
  delete nextQuery.wizardOpen;
  delete nextQuery.rawMode;
  delete nextQuery.wizardReturn;
  delete nextQuery.wizardStep;
  try {
    await router.replace({ path: route.path, query: nextQuery });
  } catch {
    // ignore
  }
};

const returnToWizard = async () => {
  const path = wizardReturnPath.value;
  wizardReturnPath.value = '';
  if (path) await router.push({ path });
};

watch(
  () => route.query?.wizardOpen,
  async (v) => {
    if (v) await consumeWizardDeepLink();
  }
);

const onProcessFilePick = (evt) => {
  processImportFile.value = evt.target.files?.[0] || null;
};

const onBatchFilePick = (evt, slot) => {
  batchFiles.value = { ...batchFiles.value, [slot]: evt.target.files?.[0] || null };
  batchCatchUpResult.value = null;
  batchCatchUpError.value = '';
};

const clearBatchFileSlot = (slot) => {
  batchFiles.value = { ...batchFiles.value, [slot]: null };
  batchCatchUpResult.value = null;
  batchCatchUpError.value = '';
  batchCatchUpResetKey.value += 1;
};

const resetBatchCatchUp = () => {
  batchCatchUpResult.value = null;
  batchCatchUpSelection.value = {};
  batchCatchUpError.value = '';
  batchFiles.value = { 1: null, 2: null, 3: null };
  batchCatchUpResetKey.value += 1;
};

const loadBatchCatchUpPriorImports = async () => {
  const priorId = batchCatchUpPriorPeriodId.value;
  const requestId = batchCatchUpPriorImportsRequestId.value + 1;
  batchCatchUpPriorImportsRequestId.value = requestId;
  batchCatchUpPriorPeriodImports.value = [];
  if (!priorId) {
    return;
  }
  try {
    const resp = await api.get(`/payroll/periods/${priorId}/imports`);
    if (requestId !== batchCatchUpPriorImportsRequestId.value) return;
    batchCatchUpPriorPeriodImports.value = resp.data?.imports || [];
  } catch {
    if (requestId !== batchCatchUpPriorImportsRequestId.value) return;
    batchCatchUpPriorPeriodImports.value = [];
  }
};

// Ask "are you sure?" before closing any payroll modal to prevent accidental data loss.
const confirmClose = (fn) => {
  if (window.confirm("Are you sure you're done? Any unsaved changes will be lost.")) fn();
};

const closeRawModal = () => {
  showRawModal.value = false;
  rawModalActivePeriodId.value = null;
};

const viewAddToCurrentPeriod = async () => {
  // Close the raw modal without the "are you sure" prompt — user is just navigating
  showRawModal.value = false;
  rawModalActivePeriodId.value = null;
  await nextTick();
  batchCatchUpResultsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const openRawModalForPeriodAndImport = async (periodId, importId) => {
  // Set the modal's own active period WITHOUT touching selectedPeriodId so the
  // main pay-period selection stays unchanged.
  rawModalActivePeriodId.value = periodId;
  rawAuditSelectedImportId.value = importId;
  // Default baseline to previous import so we see Run 3 vs Run 2 (or Run 2 vs Run 1) changes
  let baselineImportId = importId;
  try {
    const resp = await api.get(`/payroll/periods/${periodId}/imports`);
    const imports = resp.data?.imports || [];
    const idx = imports.findIndex((imp) => Number(imp?.id) === Number(importId));
    if (idx > 0 && imports[idx - 1]?.id) {
      baselineImportId = imports[idx - 1].id;
    }
  } catch { /* fallback to same-as-selected */ }
  rawAuditBaselineImportId.value = baselineImportId;
  showRawModal.value = true;
  await loadRawAuditData({ importId, baselineImportId });
};

const openManageImportsModal = () => {
  showManageImportsModal.value = true;
  manageImportsPeriodId.value = batchCatchUpPriorPeriodId.value || selectedPeriodId.value;
  manageImportsError.value = '';
  manageImportsList.value = [];
  if (manageImportsPeriodId.value) loadManageImportsList();
};

const loadManageImportsList = async () => {
  const pid = manageImportsPeriodId.value;
  if (!pid) return;
  manageImportsLoading.value = true;
  manageImportsError.value = '';
  try {
    const resp = await api.get(`/payroll/periods/${pid}/imports`);
    manageImportsList.value = resp.data?.imports || [];
  } catch (e) {
    manageImportsError.value = e.response?.data?.error?.message || e.message || 'Failed to load imports';
    manageImportsList.value = [];
  } finally {
    manageImportsLoading.value = false;
  }
};

const deleteManageImport = async (imp, forceDeleteEmpty = false) => {
  const pid = manageImportsPeriodId.value;
  if (!pid || !imp?.id) return;
  const slot = imp.slot_number || imp.import_sequence;
  const hasNext = (manageImportsList.value || []).length > 1;
  const promoteMsg = slot === 1 && hasNext
    ? 'Run 2 will become the new Run 1. No re-upload needed.'
    : slot === 2 && hasNext
      ? 'Run 3 will become the new Run 2.'
      : '';
  const msg = `Delete Run ${slot} (${imp.original_filename || 'import'})?${promoteMsg ? ` ${promoteMsg}` : ''} This cannot be undone.`;
  if (!confirm(msg)) return;
  manageImportsDeleting.value = imp.id;
  manageImportsError.value = '';
  try {
    const url = forceDeleteEmpty
      ? `/payroll/periods/${pid}/imports/${imp.id}?forceDeleteEmpty=true`
      : `/payroll/periods/${pid}/imports/${imp.id}`;
    await api.delete(url);
    await loadManageImportsList();
    await loadBatchCatchUpPriorImports();
    await loadPeriods();
    if (selectedPeriodId.value === pid) await loadPeriodDetails();
  } catch (e) {
    manageImportsError.value = e.response?.data?.error?.message || e.message || 'Failed to delete import';
  } finally {
    manageImportsDeleting.value = null;
  }
};

const forceDeleteEmptyRun1 = () => {
  const run1 = (manageImportsList.value || []).find((imp) => (imp.slot_number || imp.import_sequence) === 1);
  if (!run1) return;
  if (!confirm('Force delete empty Run 1? Run 2 will become Run 1. This cannot be undone.')) return;
  deleteManageImport(run1, true);
};

const triggerReplaceImport = (imp) => {
  manageImportsReplaceImp.value = imp;
  manageImportsReplaceInput.value?.click();
};

const onReplaceImportFilePick = async (e) => {
  const imp = manageImportsReplaceImp.value;
  const pid = manageImportsPeriodId.value;
  const file = e?.target?.files?.[0];
  if (!imp || !pid || !file) {
    manageImportsReplaceImp.value = null;
    e.target.value = '';
    return;
  }
  manageImportsReplacing.value = imp.id;
  manageImportsError.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await api.post(`/payroll/periods/${pid}/imports/${imp.id}/replace`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    await loadManageImportsList();
    if (selectedPeriodId.value === pid) await loadPeriodDetails();
    manageImportsError.value = '';
  } catch (err) {
    manageImportsError.value = err.response?.data?.error?.message || err.message || 'Failed to replace import';
  } finally {
    manageImportsReplacing.value = null;
    manageImportsReplaceImp.value = null;
    e.target.value = '';
  }
};

const uploadRun2Only = async () => {
  const imports = batchCatchUpPriorPeriodImports.value || [];
  if (imports.length < 1 || !batchFiles.value[2] || !batchCatchUpPriorPeriodId.value || !agencyId.value) return;
  try {
    batchCatchUpLoading.value = true;
    batchCatchUpError.value = '';
    const fd = new FormData();
    fd.append('file2', batchFiles.value[2]);
    fd.append('agencyId', String(agencyId.value));
    fd.append('priorPeriodId', String(batchCatchUpPriorPeriodId.value));
    fd.append('useDbBaseline', 'true');
    fd.append('persistOnly', 'true');
    await api.post('/payroll/periods/batch-catch-up', fd);
    batchCatchUpError.value = '';
    await loadBatchCatchUpPriorImports();
    await loadPeriods();
    // Auto-open the raw import viewer (Run 2 vs Run 1) so the user can review immediately.
    const freshImports = batchCatchUpPriorPeriodImports.value || [];
    if (freshImports.length >= 2) {
      const run2 = freshImports[freshImports.length - 1];
      const run1 = freshImports[freshImports.length - 2];
      if (run2?.id && run1?.id) {
        await openRawModalForPeriodAndImport(batchCatchUpPriorPeriodId.value, run2.id);
      }
    }
  } catch (e) {
    batchCatchUpError.value = e.response?.data?.error?.message || e.message || 'Upload failed';
  } finally {
    batchCatchUpLoading.value = false;
  }
};

const uploadRun3Only = async () => {
  const imports = batchCatchUpPriorPeriodImports.value || [];
  if (imports.length < 2 || !batchFiles.value[3] || !batchCatchUpPriorPeriodId.value || !agencyId.value) return;
  try {
    batchCatchUpLoading.value = true;
    batchCatchUpError.value = '';
    const fd = new FormData();
    fd.append('file2', batchFiles.value[3]);
    fd.append('agencyId', String(agencyId.value));
    fd.append('priorPeriodId', String(batchCatchUpPriorPeriodId.value));
    fd.append('useDbBaseline', 'true');
    fd.append('persistOnly', 'true');
    await api.post('/payroll/periods/batch-catch-up', fd);
    batchCatchUpError.value = '';
    await loadBatchCatchUpPriorImports();
    await loadPeriods();
    // Auto-open the raw import viewer (Run 3 vs Run 2) so the user can review immediately.
    const freshImports = batchCatchUpPriorPeriodImports.value || [];
    if (freshImports.length >= 2) {
      const latestRun = freshImports[freshImports.length - 1];
      const prevRun = freshImports[freshImports.length - 2];
      if (latestRun?.id && prevRun?.id) {
        await openRawModalForPeriodAndImport(batchCatchUpPriorPeriodId.value, latestRun.id);
      }
    }
  } catch (e) {
    batchCatchUpError.value = e.response?.data?.error?.message || e.message || 'Upload failed';
  } finally {
    batchCatchUpLoading.value = false;
  }
};

const runBatchCatchUpDbBaseline = async () => {
  const imports = batchCatchUpPriorPeriodImports.value || [];
  const fileForCompare = imports.length >= 2 ? batchFiles.value[3] : batchFiles.value[2];
  if (!agencyId.value || !fileForCompare || !batchCatchUpPriorPeriodId.value) return;
  try {
    batchCatchUpLoading.value = true;
    batchCatchUpError.value = '';
    batchCatchUpResult.value = null;
    batchCatchUpSelection.value = {};
    const fd = new FormData();
    fd.append('file2', fileForCompare);
    fd.append('agencyId', String(agencyId.value));
    fd.append('priorPeriodId', String(batchCatchUpPriorPeriodId.value));
    fd.append('useDbBaseline', 'true');
    const destId = batchCatchUpDestinationPeriodId.value || selectedPeriodId.value;
    if (destId) fd.append('destinationPeriodId', String(destId));
    const resp = await api.post('/payroll/periods/batch-catch-up', fd);
    batchCatchUpResult.value = resp.data || null;
    const applied = batchCatchUpResult.value?.carryoverApplied || [];
    const sel = {};
    for (const c of applied) {
      const k = `${c.userId}:${(c.serviceCode || '').toUpperCase()}`;
      sel[k] = { selected: true, units: Number(c.run2To3Units ?? c.totalUnits ?? 0) };
    }
    batchCatchUpSelection.value = sel;
    if (batchCatchUpResult.value?.destinationPeriodId && !batchCatchUpDestinationPeriodId.value) {
      batchCatchUpDestinationPeriodId.value = batchCatchUpResult.value.destinationPeriodId;
    }
    await loadPeriods();
    await loadBatchCatchUpPriorImports();
    // Auto-open the raw import viewer so the user can review the diff immediately.
    const freshImports = batchCatchUpPriorPeriodImports.value || [];
    if (freshImports.length >= 2 && batchCatchUpPriorPeriodId.value) {
      const latestRun = freshImports[freshImports.length - 1];
      const prevRun = freshImports[freshImports.length - 2];
      if (latestRun?.id && prevRun?.id) {
        await openRawModalForPeriodAndImport(batchCatchUpPriorPeriodId.value, latestRun.id);
      }
    }
  } catch (e) {
    batchCatchUpError.value = e.response?.data?.error?.message || e.message || 'Batch catch-up failed';
  } finally {
    batchCatchUpLoading.value = false;
  }
};

const runBatchCatchUp = async () => {
  if (!agencyId.value || !batchFiles.value[1] || !batchFiles.value[2]) return;
  try {
    batchCatchUpLoading.value = true;
    batchCatchUpError.value = '';
    batchCatchUpResult.value = null;
    batchCatchUpSelection.value = {};
    const fd = new FormData();
    fd.append('file1', batchFiles.value[1]);
    fd.append('file2', batchFiles.value[2]);
    if (batchFiles.value[3]) fd.append('file3', batchFiles.value[3]);
    fd.append('agencyId', String(agencyId.value));
    const destId = batchCatchUpDestinationPeriodId.value || selectedPeriodId.value;
    if (destId) fd.append('destinationPeriodId', String(destId));
    const resp = await api.post('/payroll/periods/batch-catch-up', fd);
    batchCatchUpResult.value = resp.data || null;
    batchCatchUpSearch.value = '';
    superFlagSearch.value = '';
    // Initialize selection: all selected, original units
    const applied = batchCatchUpResult.value?.carryoverApplied || [];
    const sel = {};
    for (const c of applied) {
      const k = `${c.userId}:${(c.serviceCode || '').toUpperCase()}`;
      sel[k] = { selected: true, units: Number(c.run2To3Units ?? c.totalUnits ?? 0) };
    }
    batchCatchUpSelection.value = sel;
    await loadPeriods();
    if (batchCatchUpResult.value?.destinationPeriodId && !batchCatchUpDestinationPeriodId.value) {
      batchCatchUpDestinationPeriodId.value = batchCatchUpResult.value.destinationPeriodId;
    }
    if (batchCatchUpPriorPeriodId.value) await loadBatchCatchUpPriorImports();
  } catch (e) {
    batchCatchUpError.value = e.response?.data?.error?.message || e.message || 'Batch catch-up failed';
  } finally {
    batchCatchUpLoading.value = false;
  }
};

const batchCatchUpSearch = ref('');
const batchCatchUpResultsRef = ref(null);
const batchCatchUpSortColumn = ref('providerName');
const batchCatchUpSortDirection = ref('asc');

const batchCatchUpFilteredRows = computed(() => {
  const rows = batchCatchUpResult.value?.carryoverApplied || [];
  const q = String(batchCatchUpSearch.value || '').trim().toLowerCase();
  let filtered = rows;
  if (q) {
    filtered = rows.filter((r) => {
      const prov = String(r.providerName || '').toLowerCase();
      const code = String(r.serviceCode || '').toLowerCase();
      const client = String(r.clientHint || '').toLowerCase();
      const date = String(ymd(r.serviceDate) || '').toLowerCase();
      const type = String(batchCatchUpTypeLabel(r)).toLowerCase();
      return prov.includes(q) || code.includes(q) || client.includes(q) || date.includes(q) || type.includes(q);
    });
  }
  const col = batchCatchUpSortColumn.value || 'providerName';
  const dir = batchCatchUpSortDirection.value === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    let cmp = 0;
    if (col === 'providerName') cmp = String(a.providerName || '').localeCompare(String(b.providerName || ''), undefined, { sensitivity: 'base' });
    else if (col === 'serviceCode') cmp = String(a.serviceCode || '').localeCompare(String(b.serviceCode || ''), undefined, { sensitivity: 'base' });
    else if (col === 'clientHint') cmp = String(a.clientHint || '').localeCompare(String(b.clientHint || ''), undefined, { sensitivity: 'base' });
    else if (col === 'serviceDate') cmp = String(a.serviceDate || '').localeCompare(String(b.serviceDate || ''), undefined, { sensitivity: 'base' });
    else if (col === 'carryoverType') cmp = String(batchCatchUpTypeLabel(a)).localeCompare(String(batchCatchUpTypeLabel(b)), undefined, { sensitivity: 'base' });
    return cmp * dir;
  });
});

const batchCatchUpSortBy = (col) => {
  if (batchCatchUpSortColumn.value === col) batchCatchUpSortDirection.value = batchCatchUpSortDirection.value === 'asc' ? 'desc' : 'asc';
  else { batchCatchUpSortColumn.value = col; batchCatchUpSortDirection.value = 'asc'; }
};
const batchCatchUpSortIndicator = (col) => (batchCatchUpSortColumn.value === col ? (batchCatchUpSortDirection.value === 'asc' ? ' ↑' : ' ↓') : '');

const superFlagSearch = ref('');
const superFlagSortColumn = ref('providerName');
const superFlagSortDirection = ref('asc');
const superFlagFilteredRows = computed(() => {
  const rows = batchCatchUpResult.value?.superFlag || [];
  const q = String(superFlagSearch.value || '').trim().toLowerCase();
  let filtered = rows;
  if (q) {
    filtered = rows.filter((f) => {
      const prov = String(f.providerName || '').toLowerCase();
      const code = String(f.serviceCode || '').toLowerCase();
      return prov.includes(q) || code.includes(q);
    });
  }
  const col = superFlagSortColumn.value || 'providerName';
  const dir = superFlagSortDirection.value === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    let cmp = 0;
    if (col === 'providerName') cmp = String(a.providerName || '').localeCompare(String(b.providerName || ''), undefined, { sensitivity: 'base' });
    else if (col === 'serviceCode') cmp = String(a.serviceCode || '').localeCompare(String(b.serviceCode || ''), undefined, { sensitivity: 'base' });
    else if (col === 'run2') cmp = (Number(a.run2NoNoteUnits ?? a.run2UnpaidUnits ?? 0) - Number(b.run2NoNoteUnits ?? b.run2UnpaidUnits ?? 0));
    else if (col === 'run3') cmp = (Number(a.run3NoNoteUnits ?? a.run3UnpaidUnits ?? 0) - Number(b.run3NoNoteUnits ?? b.run3UnpaidUnits ?? 0));
    return cmp * dir;
  });
});
const superFlagSortBy = (col) => {
  if (superFlagSortColumn.value === col) superFlagSortDirection.value = superFlagSortDirection.value === 'asc' ? 'desc' : 'asc';
  else { superFlagSortColumn.value = col; superFlagSortDirection.value = 'asc'; }
};
const superFlagSortIndicator = (col) => (superFlagSortColumn.value === col ? (superFlagSortDirection.value === 'asc' ? ' ↑' : ' ↓') : '');

const batchCatchUpDestPeriodLabel = computed(() => {
  const id = batchCatchUpDestinationPeriodId.value || batchCatchUpResult.value?.destinationPeriodId;
  if (!id) return '';
  const p = (periods.value || []).find((x) => Number(x.id) === Number(id));
  return p ? periodRangeLabel(p) : `Period #${id}`;
});

const batchCatchUpRowKey = (c) => `${c.userId}:${(c.serviceCode || '').toUpperCase()}`;
const batchCatchUpRowSelected = (c) => {
  const k = batchCatchUpRowKey(c);
  const s = batchCatchUpSelection.value[k];
  return s ? s.selected : true;
};
const batchCatchUpToggleRow = (c, checked) => {
  const k = batchCatchUpRowKey(c);
  const base = batchCatchUpSelection.value[k] || { selected: true, units: Number(c.run2To3Units ?? c.totalUnits ?? 0) };
  batchCatchUpSelection.value = { ...batchCatchUpSelection.value, [k]: { ...base, selected: !!checked } };
};
const batchCatchUpRowUnits = (c) => {
  const k = batchCatchUpRowKey(c);
  const s = batchCatchUpSelection.value[k];
  const def = Number(c.run2To3Units ?? c.totalUnits ?? 0);
  return s ? s.units : def;
};
const batchCatchUpSetRowUnits = (c, val) => {
  const k = batchCatchUpRowKey(c);
  const num = Math.max(0, Number(val) || 0);
  const base = batchCatchUpSelection.value[k] || { selected: true, units: Number(c.run2To3Units ?? c.totalUnits ?? 0) };
  batchCatchUpSelection.value = { ...batchCatchUpSelection.value, [k]: { ...base, units: num } };
};
const batchCatchUpTypeLabel = (c) => {
  const t = c.carryoverType || '';
  if (t === 'late_add') return 'Late add';
  if (t === 'old_note') return 'Notes to be paid';
  if (t === 'both') return 'Late add + notes to be paid';
  return '—';
};
const batchCatchUpTypeBadgeClass = (c) => {
  const t = c.carryoverType || '';
  if (t === 'late_add') return 'badge-info';
  if (t === 'old_note') return 'badge-warning';
  if (t === 'both') return 'badge-secondary';
  return '';
};
const batchCatchUpSelectedCount = computed(() => {
  const applied = batchCatchUpResult.value?.carryoverApplied || [];
  let n = 0;
  for (const c of applied) {
    if (batchCatchUpRowSelected(c)) n++;
  }
  return n;
});
const isBatchCatchUpDestPosted = computed(() => {
  const pid = batchCatchUpDestinationPeriodId.value;
  if (!pid) return false;
  const p = (periods.value || []).find((x) => Number(x?.id) === Number(pid));
  const s = String(p?.status || '').toLowerCase();
  return s === 'posted' || s === 'finalized';
});

const applyBatchCatchUpAllToPeriod = async () => {
  const result = batchCatchUpResult.value;
  const destId = batchCatchUpDestinationPeriodId.value || result?.destinationPeriodId || selectedPeriodId.value;
  if (!result || !destId) return;
  const hasLateNotes = (result.carryoverApplied || []).length > 0;
  const hasStillNoNote = (result.superFlag || []).length > 0;
  if (!hasLateNotes && !hasStillNoNote) return;
  try {
    batchCatchUpApplying.value = true;
    batchCatchUpError.value = '';
    let totalApplied = 0;
    if (hasLateNotes) {
      const applied = result.carryoverApplied || [];
      const rowsToApply = [];
      for (const c of applied) {
        if (!batchCatchUpRowSelected(c)) continue;
        const units = batchCatchUpRowUnits(c);
        if (!(units > 0)) continue;
        const row = (result.rowsForApply || []).find((r) => Number(r.userId) === Number(c.userId) && String(r.serviceCode || '').toUpperCase() === String(c.serviceCode || '').toUpperCase());
        rowsToApply.push({
          userId: c.userId,
          serviceCode: c.serviceCode,
          carryoverFinalizedUnits: units,
          carryoverFinalizedRowCount: row?.carryoverFinalizedRowCount ?? 1,
          carryoverMeta: row?.carryoverMeta ?? null
        });
      }
      if (rowsToApply.length > 0) {
        try {
          await api.post(`/payroll/periods/${destId}/carryover/apply`, { rows: rowsToApply });
          totalApplied += rowsToApply.length;
        } catch (e) {
          if (e.response?.status === 409 && (String(e.response?.data?.error?.message || '').includes('H0031') || String(e.response?.data?.error?.message || '').includes('H0032'))) {
            const ok = window.confirm('Carryover is blocked by H0031/H0032/H2014/H2032/90853 processing. Apply anyway (skip processing gate)?');
            if (ok) {
              await api.post(`/payroll/periods/${destId}/carryover/apply`, { rows: rowsToApply }, { params: { skipProcessingGate: 'true' } });
              totalApplied += rowsToApply.length;
            } else throw e;
          } else throw e;
        }
      }
    }
    if (hasStillNoNote) {
      const rows = (result.superFlag || []).map((f) => ({
        userId: f.userId,
        serviceCode: f.serviceCode,
        stillUnpaidUnits: Number(f.run2NoNoteUnits ?? f.run3NoNoteUnits ?? f.run2UnpaidUnits ?? f.run3UnpaidUnits ?? 0)
      })).filter((r) => r.stillUnpaidUnits > 0);
      if (rows.length > 0) {
        await api.put(`/payroll/periods/${destId}/prior-unpaid`, {
          sourcePayrollPeriodId: batchCatchUpPriorPeriodId.value || result.period?.id,
          rows
        });
        totalApplied += rows.length;
      }
    }
    batchCatchUpResult.value = { ...result, applied: true, carryoverRowsApplied: totalApplied };
    await loadPeriods();
    await selectPeriod(destId);
  } catch (e) {
    batchCatchUpError.value = e.response?.data?.error?.message || e.message || 'Failed to add to current period';
  } finally {
    batchCatchUpApplying.value = false;
  }
};

const applyStillNoNoteToPeriod = async () => {
  const result = batchCatchUpResult.value;
  if (!result || !(result.superFlag || []).length) return;
  const destId = batchCatchUpDestinationPeriodId.value || result.destinationPeriodId || selectedPeriodId.value;
  if (!destId) return;
  const rows = (result.superFlag || []).map((f) => ({
    userId: f.userId,
    serviceCode: f.serviceCode,
    stillUnpaidUnits: Number(f.run2NoNoteUnits ?? f.run3NoNoteUnits ?? f.run2UnpaidUnits ?? f.run3UnpaidUnits ?? 0)
  })).filter((r) => r.stillUnpaidUnits > 0);
  if (!rows.length) return;
  try {
    batchCatchUpApplying.value = true;
    batchCatchUpError.value = '';
    await api.put(`/payroll/periods/${destId}/prior-unpaid`, {
      sourcePayrollPeriodId: batchCatchUpPriorPeriodId.value || result.period?.id,
      rows
    });
    batchCatchUpResult.value = { ...result, applied: true };
    await loadPeriods();
    await selectPeriod(destId);
  } catch (e) {
    batchCatchUpError.value = e.response?.data?.error?.message || e.message || 'Failed to add still no-note';
  } finally {
    batchCatchUpApplying.value = false;
  }
};

const applyBatchCatchUpToPeriod = async () => {
  const result = batchCatchUpResult.value;
  if (!result || !(result.rowsForApply || []).length) return;
  const destId = batchCatchUpDestinationPeriodId.value || result.destinationPeriodId || selectedPeriodId.value;
  if (!destId) return;
  const applied = result.carryoverApplied || [];
  const rowsToApply = [];
  for (const c of applied) {
    if (!batchCatchUpRowSelected(c)) continue;
    const units = batchCatchUpRowUnits(c);
    if (!(units > 0)) continue;
    const row = (result.rowsForApply || []).find((r) => Number(r.userId) === Number(c.userId) && String(r.serviceCode || '').toUpperCase() === String(c.serviceCode || '').toUpperCase());
    rowsToApply.push({
      userId: c.userId,
      serviceCode: c.serviceCode,
      carryoverFinalizedUnits: units,
      carryoverFinalizedRowCount: row?.carryoverFinalizedRowCount ?? 1,
      carryoverMeta: row?.carryoverMeta ?? null
    });
  }
  if (!rowsToApply.length) return;
  try {
    batchCatchUpApplying.value = true;
    batchCatchUpError.value = '';
    await api.post(`/payroll/periods/${destId}/carryover/apply`, { rows: rowsToApply });
    batchCatchUpResult.value = { ...result, applied: true, carryoverRowsApplied: rowsToApply.length };
    await loadPeriods();
    await selectPeriod(destId);
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || '';
    if (e.response?.status === 409 && (String(msg).includes('H0031') || String(msg).includes('H0032') || String(msg).includes('H2014') || String(msg).includes('H2032') || String(msg).includes('90853'))) {
      const ok = window.confirm('Carryover is blocked by H0031/H0032/H2014/H2032/90853 processing. Apply anyway (skip processing gate)?');
      if (ok) {
        await api.post(`/payroll/periods/${destId}/carryover/apply`, { rows: rowsToApply }, { params: { skipProcessingGate: 'true' } });
        batchCatchUpResult.value = { ...result, applied: true, carryoverRowsApplied: rowsToApply.length };
        await loadPeriods();
        await selectPeriod(destId);
      } else {
        batchCatchUpError.value = msg;
      }
    } else {
      batchCatchUpError.value = msg || 'Failed to add to current period';
    }
  } finally {
    batchCatchUpApplying.value = false;
  }
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
    // Ensure suggested match is actually a valid "prior period" option for this destination period.
    if (processExistingPeriodId.value && !(processPriorPeriodOptions.value || []).some((p) => Number(p?.id) === Number(processExistingPeriodId.value))) {
      processExistingPeriodId.value = null;
    }
    processConfirmOpen.value = true;
  } catch (e) {
    processError.value = e.response?.data?.error?.message || e.message || 'Failed to auto-detect/import prior pay period';
  } finally {
    processingChanges.value = false;
  }
};

const runProcessCompareFlow = async (sourcePeriodId) => {
  if (!sourcePeriodId) {
    processError.value = 'Could not determine a prior pay period to import into.';
    return;
  }
  if (!selectedPeriodId.value) {
    processError.value = 'Select a present pay period (destination) first.';
    return;
  }
  if (!processImportFile.value) {
    processError.value = 'Please choose the updated prior-period report file again.';
    return;
  }

  await loadPeriods();
  const p = (periods.value || []).find((x) => Number(x.id) === Number(sourcePeriodId)) || null;
  processSourcePeriodId.value = Number(sourcePeriodId);
  processSourcePeriodLabel.value = p ? periodRangeLabel(p) : `Period #${sourcePeriodId}`;

  // Create a snapshot-only run from the uploaded prior-period report.
  const fd = new FormData();
  fd.append('file', processImportFile.value);
  await api.post(`/payroll/periods/${processSourcePeriodId.value}/runs/snapshot-from-file`, fd);

  // Switch UI context to the present pay period (destination) and open compare modal.
  await selectPeriod(selectedPeriodId.value);
  showCarryoverModal.value = true;
  carryoverPriorPeriodId.value = processSourcePeriodId.value;
  await loadCarryoverRuns();
  await loadCarryoverPreview();
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
    } else {
      const detected = processDetectResult.value?.detected;
      if (!detected?.periodStart || !detected?.periodEnd) {
        processError.value = 'No detected prior pay period available. Choose an existing period.';
        return;
      }
      sourcePeriodId = processExistingPeriodId.value;
      if (!sourcePeriodId) {
        processError.value = 'No existing pay period matched the detected prior period. Choose an existing prior pay period (or enable off-schedule periods / sync drafts).';
        return;
      }
    }

    processConfirmOpen.value = false;
    await runProcessCompareFlow(sourcePeriodId);
  } catch (e) {
    processError.value = e.response?.data?.error?.message || e.message || 'Failed to run prior period and compare changes';
  } finally {
    processingChanges.value = false;
  }
};

const processRunAndCompare = async () => {
  try {
    if (!processSourcePeriodId.value) return;
    processingChanges.value = true;
    processError.value = '';
    await runProcessCompareFlow(processSourcePeriodId.value);
  } catch (e) {
    processError.value = e.response?.data?.error?.message || e.message || 'Failed to run prior period and compare changes';
  } finally {
    processingChanges.value = false;
  }
};
</script>

<style scoped>
.pr-wizard-return {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--pr-mint, #E8F5E9);
  border: 1px solid var(--pr-mint-border, #C8E6C9);
  color: var(--pr-forest, #1E3A34);
  font-size: 13px;
  font-weight: 600;
}

.pr-page {
  --pr-forest: #1E3A34;
  --pr-forest-hover: #16302b;
  --pr-mint: #E8F5E9;
  --pr-mint-border: #C8E6C9;
  --pr-mint-text: #2E7D32;
  --pr-alert-bg: #FCE8E6;
  --pr-alert-icon: #C62828;
  --pr-card-shadow: 0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04);
  --pr-radius: 12px;
  background: #F7F8F7;
  padding-bottom: 32px;
  min-height: 100%;
}

.pr-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}
.pr-header h1 {
  margin: 0;
  font-size: 1.85rem;
  font-weight: 800;
  color: var(--text-primary, #1D2633);
  letter-spacing: -0.02em;
}
.pr-header-text .subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 0.95rem;
}
.pr-header-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pr-active-period-banner {
  position: sticky;
  top: 0;
  z-index: 40;
  margin: 0 0 16px;
  padding: 12px 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1E3A34 0%, #2A5248 100%);
  color: #fff;
  box-shadow: 0 10px 28px rgba(30, 58, 52, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.pr-active-period-banner-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
}
.pr-active-period-kicker {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.85;
}
.pr-active-period-range {
  font-size: 1.2rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.pr-active-period-banner .pr-status-pill {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.28);
}
.pr-active-period-note {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.9;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(255, 193, 7, 0.22);
  border: 1px solid rgba(255, 193, 7, 0.45);
}

.pr-period-field label {
  font-weight: 800 !important;
  color: var(--pr-forest) !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 11px !important;
}
.pr-period-field select {
  border: 2px solid var(--pr-forest) !important;
  background: #F3FBF6 !important;
  font-weight: 700 !important;
  font-size: 15px !important;
  color: var(--pr-forest) !important;
  box-shadow: 0 0 0 3px rgba(30, 58, 52, 0.08);
}
.pr-period-field select:focus {
  outline: none;
  box-shadow: 0 0 0 4px rgba(30, 58, 52, 0.18);
}
.pr-period-chip {
  display: inline-block;
  margin-left: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  background: #E8F5E9;
  border: 1px solid #A5D6A7;
  color: var(--pr-forest);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.pr-period-meta {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #F3FBF6;
  border: 1px solid #C8E6C9;
}
.pr-period-meta-range {
  margin-bottom: 6px;
}

.pr-status-not_started {
  background: #F1F5F9;
  color: #475569;
  border-color: #E2E8F0;
}
.pr-dot-not_started {
  background: #94A3B8;
}

.pr-org-picker {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 14px;
  box-shadow: var(--pr-card-shadow);
}
.pr-org-value {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 120px;
}
.pr-org-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pr-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}
.pr-metric-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--pr-radius);
  padding: 16px;
  box-shadow: var(--pr-card-shadow);
  text-align: left;
}
button.pr-metric-card {
  font: inherit;
  color: inherit;
  cursor: pointer;
  appearance: none;
  width: 100%;
}
button.pr-metric-card:disabled {
  cursor: default;
  opacity: 0.85;
}
.pr-metric-card--alert {
  border-color: #f5c6c2;
}
.pr-metric-icon {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--pr-mint);
  color: var(--pr-forest);
  display: flex;
  align-items: center;
  justify-content: center;
}
.pr-metric-icon--alert {
  background: var(--pr-alert-bg);
  color: var(--pr-alert-icon);
}
.pr-metric-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.pr-metric-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}
.pr-metric-card:first-child {
  border: 2px solid var(--pr-forest);
  box-shadow: 0 6px 18px rgba(30, 58, 52, 0.12);
}
.pr-metric-card:first-child .pr-metric-value {
  color: var(--pr-forest);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.pr-metric-meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.pr-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: capitalize;
  background: var(--pr-mint);
  color: var(--pr-mint-text);
  border: 1px solid var(--pr-mint-border);
}
.pr-status-posted,
.pr-status-finalized {
  background: var(--pr-mint);
  color: var(--pr-mint-text);
}
.pr-status-staged,
.pr-status-raw_imported,
.pr-status-imported {
  background: #E3F2FD;
  color: #1565C0;
  border-color: #BBDEFB;
}
.pr-status-ran {
  background: #FFF8E1;
  color: #F57F17;
  border-color: #FFE082;
}
.pr-status-draft {
  background: #F1F5F9;
  color: #475569;
  border-color: #E2E8F0;
}

.pr-command {
  display: grid;
  grid-template-columns: 1fr 1fr 1.15fr;
  gap: 14px;
  margin-bottom: 18px;
  align-items: start;
}
.pr-command-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pr-wizard-card .wizard-btn {
  width: 100%;
  padding: 12px 16px;
  font-size: 15px;
  font-weight: 700;
  border-radius: 10px;
  background: var(--pr-forest) !important;
  border-color: var(--pr-forest) !important;
  color: #fff !important;
  box-shadow: 0 8px 20px rgba(30, 58, 52, 0.22);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pr-wizard-card .wizard-btn:hover:not(:disabled) {
  background: var(--pr-forest-hover) !important;
  border-color: var(--pr-forest-hover) !important;
}
.pr-wizard-card .wizard-btn:disabled {
  box-shadow: none;
  opacity: 0.55;
}

.pr-quick-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.pr-quick-btn {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}
.pr-quick-btn:hover:not(:disabled) {
  background: var(--pr-mint);
  border-color: var(--pr-mint-border);
}
.pr-quick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.pr-secondary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.pr-autodetect {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: var(--pr-radius);
  background: var(--pr-mint);
  border: 1px solid var(--pr-mint-border);
}
.pr-autodetect-icon {
  color: var(--pr-forest);
  flex: 0 0 auto;
  margin-top: 2px;
}
.pr-autodetect-title {
  font-weight: 700;
  font-size: 13px;
  color: var(--pr-forest);
  margin-bottom: 2px;
}

.pr-history-card,
.pr-details-card {
  min-height: 280px;
}
.pr-search-wrap {
  position: relative;
}
.pr-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
  pointer-events: none;
}
.pr-search-input {
  width: 100%;
  padding: 9px 12px 9px 36px !important;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
  background: #fff;
}
.pr-period-list {
  margin-top: 12px;
  max-height: 360px;
  overflow: auto;
  padding-right: 2px;
}
.pr-period-list .list-item {
  border-radius: 10px;
  border: 1px solid transparent;
  background: #fff;
  transition: background 0.15s, border-color 0.15s;
}
.pr-period-list .list-item:hover {
  background: #f8faf9;
  border-color: var(--border);
}
.pr-period-list .list-item.active {
  background: linear-gradient(135deg, #E8F5E9 0%, #F1F8F4 100%);
  border: 2px solid var(--pr-forest);
  box-shadow: 0 4px 14px rgba(30, 58, 52, 0.12);
}
.pr-period-list .list-item.active .list-item-title {
  color: var(--pr-forest);
  font-weight: 800;
}
.list-item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.pr-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
  flex: 0 0 auto;
}
.pr-dot-posted,
.pr-dot-finalized {
  background: #2E7D32;
}
.pr-dot-staged,
.pr-dot-raw_imported {
  background: #1565C0;
}
.pr-dot-ran {
  background: #F57F17;
}

.pr-details-filters {
  grid-template-columns: 1fr 1fr !important;
}
.pr-period-meta {
  margin-top: 12px;
  padding: 12px;
  background: #f8faf9;
  border-radius: 10px;
  border: 1px solid var(--border);
}
.pr-info-banner {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--pr-mint);
  border: 1px solid var(--pr-mint-border);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.45;
}
.pr-info-banner svg {
  flex: 0 0 auto;
  color: var(--pr-forest);
  margin-top: 2px;
}

.pr-process-card,
.pr-run-card,
.pr-totals-card {
  margin-bottom: 14px;
}
.pr-process-head,
.pr-run-head,
.pr-totals-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.pr-process-steps {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1fr;
  gap: 14px;
}
.pr-process-step {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: #f8faf9;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.pr-process-step-num {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--pr-forest);
  color: #fff;
  font-weight: 800;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pr-process-step-title {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 2px;
}
.pr-upload-slots {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.pr-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pr-compare-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.pr-compare-btn {
  background: var(--pr-forest) !important;
  border-color: var(--pr-forest) !important;
  color: #fff !important;
  display: inline-flex;
  align-items: center;
}
.pr-process-advanced {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.pr-process-advanced summary {
  list-style: none;
}
.pr-process-advanced summary::-webkit-details-marker {
  display: none;
}

.pr-run-period-chip {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #F3FBF6;
  border: 2px solid var(--pr-forest);
  color: var(--pr-forest);
  font-size: 15px;
}
.pr-run-period-chip .pr-active-period-kicker {
  font-size: 10px;
}

.pr-stepper {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 16px 8px;
  background: #f8faf9;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow-x: auto;
}
.pr-step {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  padding: 0 8px;
  opacity: 0.55;
}
.pr-step.active,
.pr-step.done {
  opacity: 1;
}
.pr-step-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.pr-step.active .pr-step-icon {
  border-color: var(--pr-forest);
  color: var(--pr-forest);
  box-shadow: 0 0 0 3px rgba(30, 58, 52, 0.12);
}
.pr-step.done .pr-step-icon {
  background: var(--pr-forest);
  border-color: var(--pr-forest);
  color: #fff;
}
.pr-step-title {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.pr-step-sub {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}
.pr-step-line {
  flex: 1 1 24px;
  height: 2px;
  min-width: 16px;
  background: var(--border);
  border-radius: 2px;
}
.pr-step-line.done {
  background: var(--pr-forest);
}

.pr-run-actions {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pr-run-actions-primary,
.pr-run-actions-secondary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.pr-run-actions-secondary {
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.pr-below {
  margin-top: 4px;
}

.th-sortable {
  cursor: pointer;
  user-select: none;
}
.th-sort-indicator {
  margin-left: 6px;
  opacity: 0.7;
  font-size: 12px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 18px;
}
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--pr-radius);
  padding: 16px;
  box-shadow: var(--pr-card-shadow);
}
.card-title {
  margin: 0 0 12px 0;
  font-size: 1.05rem;
  font-weight: 750;
  color: var(--text-primary);
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
  font-weight: 600;
}
input[type='text'],
input[type='date'],
input[type='number'],
select,
textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font: inherit;
}

.link-btn {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-decoration: underline;
}
.link-btn.right {
  width: 100%;
  text-align: right;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  flex-direction: row;
}

.btn {
  padding: 6px 10px;
  font-size: 13px;
  line-height: 1.2;
  border-radius: 8px;
}
.btn.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
.pr-page :deep(.btn-primary),
.pr-page .btn.btn-primary {
  background: var(--pr-forest);
  border-color: var(--pr-forest);
  color: #fff;
}
.pr-page :deep(.btn-primary:hover:not(:disabled)),
.pr-page .btn.btn-primary:hover:not(:disabled) {
  background: var(--pr-forest-hover);
  border-color: var(--pr-forest-hover);
}
.pr-page .btn.btn-secondary {
  background: #fff;
  border: 1px solid var(--border);
  color: var(--text-primary);
}
.pr-page .btn.btn-secondary:hover:not(:disabled) {
  background: var(--pr-mint);
  border-color: var(--pr-mint-border);
}
.actions .btn {
  width: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  white-space: nowrap;
}
.tabs {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.tabs .tab {
  padding: 6px 12px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-secondary, #f5f5f5);
  cursor: pointer;
}
.tabs .tab:hover {
  background: var(--bg-hover, #eee);
}
.tabs .tab.active {
  background: var(--pr-forest);
  color: white;
  border-color: var(--pr-forest);
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
  border-color: var(--pr-mint-border);
  background: var(--pr-mint);
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
.warn {
  color: var(--danger);
  font-weight: 700;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 9999;
}
.modal {
  width: min(1100px, 100%);
  max-height: 85vh;
  overflow: auto;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
}

.modal-payroll-results {
  width: min(1500px, 96vw) !important;
  max-width: 96vw !important;
  max-height: 92vh !important;
}

.wizard-hero {
  border: 1px solid var(--pr-mint-border);
  background: #fff;
}
.org-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 0 10px 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
}
.org-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.org-bar-label {
  font-weight: 800;
  letter-spacing: 0.2px;
}
.org-bar-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.org-bar select,
.org-bar input,
.pr-org-picker select,
.pr-org-picker input {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
}
.org-bar input {
  min-width: 200px;
}
.org-bar-value {
  color: var(--text-primary);
}
.wizard-hero-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.wizard-hero-controls {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 14px;
  margin-top: 12px;
  align-items: end;
}
.wizard-btn {
  width: 100%;
  padding: 14px 16px;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.2px;
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(30, 58, 52, 0.22);
}
.wizard-btn:disabled {
  box-shadow: none;
}
@media (max-width: 900px) {
  .wizard-hero-controls {
    grid-template-columns: 1fr;
  }
  .org-bar input {
    min-width: 160px;
    width: 100%;
  }
}
.modal .table th,
.modal .table td {
  padding: 8px 10px;
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
.row-unpaid-h003 {
  background: rgba(255, 193, 7, 0.15);
}
.row-unpaid-h003 td:first-child {
  border-left: 3px solid #ff9800;
}
.row-paid-muted {
  opacity: 0.62;
}
.status-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid var(--border);
}
.status-pill-no-note {
  background: rgba(245, 158, 11, 0.16);
}
.status-pill-draft-unpaid {
  background: rgba(59, 130, 246, 0.16);
}
.status-pill-draft-paid {
  background: rgba(16, 185, 129, 0.14);
}
.status-pill-finalized {
  background: rgba(34, 197, 94, 0.2);
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
.prior-unpaid-row {
  background: #ffecec;
}
.prior-unpaid-cell {
  background: #ffd6d6;
  font-weight: 700;
  color: #b00020;
}
.right {
  text-align: right;
}
.stage-num-input {
  width: 80px;
  min-width: 80px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.stage-num-input:disabled {
  background: #f3f4f6;
  color: #6b7280;
}
.muted {
  color: var(--text-secondary);
}
.tier-chip {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #f8fafc;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  vertical-align: middle;
}
.tier-chip.grace {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
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
@media (max-width: 1100px) {
  .pr-command {
    grid-template-columns: 1fr 1fr;
  }
  .pr-command-actions {
    grid-column: 1 / -1;
  }
  .pr-process-steps {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 980px) {
  .pr-metrics {
    grid-template-columns: 1fr 1fr;
  }
  .pr-command {
    grid-template-columns: 1fr;
  }
  .grid {
    grid-template-columns: 1fr;
  }
  .field-row {
    grid-template-columns: 1fr;
  }
  .pr-details-filters {
    grid-template-columns: 1fr !important;
  }
}
@media (max-width: 640px) {
  .pr-metrics {
    grid-template-columns: 1fr;
  }
  .pr-quick-grid {
    grid-template-columns: 1fr;
  }
  .pr-step-text {
    display: none;
  }
}

.pto-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pto-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 20px;
  border: 1.5px solid #d1d5db;
  background: #f9fafb;
  color: #4b5563;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.pto-chip:hover { border-color: #9ca3af; background: #f3f4f6; }
.pto-chip--active { border-color: transparent; color: #fff; }
.pto-chip--active.pto-chip--submitted { background: #d97706; border-color: #d97706; }
.pto-chip--active.pto-chip--approved  { background: #166534; border-color: #166534; }
.pto-chip--active.pto-chip--rejected  { background: #b91c1c; border-color: #b91c1c; }
.pto-chip--active.pto-chip--deferred  { background: #475569; border-color: #475569; }
.pto-chip-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: rgba(0,0,0,0.18);
  font-size: 11px;
  font-weight: 700;
}
.pto-chip:not(.pto-chip--active) .pto-chip-count {
  background: #e5e7eb;
  color: #374151;
}

.pto-status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.pto-status-submitted { background: #fef3c7; color: #92400e; }
.pto-status-approved  { background: #dcfce7; color: #166534; }
.pto-status-rejected  { background: #fee2e2; color: #991b1b; }
.pto-status-deferred  { background: #f1f5f9; color: #475569; }

tr.pto-row-approved td { background: #f0fdf4; }
tr.pto-row-rejected td { background: #fff5f5; opacity: 0.8; }
</style>

