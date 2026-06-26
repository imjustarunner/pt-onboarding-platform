<template>
  <div class="wrap">
    <div class="header">
      <div>
        <h2 style="margin: 0;">Payroll Settings</h2>
        <div class="hint">Schedule, excess time compensation rules, and more.</div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary" type="button" @click="syncFutureDrafts" :disabled="saving || syncing || !agencyId">
          {{ syncing ? 'Syncing…' : 'Sync future drafts' }}
        </button>
        <button class="btn btn-secondary" type="button" @click="cleanupFuture" :disabled="saving || syncing || cleaning || !agencyId">
          {{ cleaning ? 'Cleaning…' : 'Reset empty future “ran”' }}
        </button>
      </div>
    </div>

    <div v-if="!agencyId" class="empty">Select an agency first.</div>

    <div v-else>
      <div class="tabs" style="margin-bottom: 12px;">
        <button type="button" class="tab" :class="{ active: payrollTab === 'schedule' }" @click="payrollTab = 'schedule'">
          Schedule
        </button>
        <button type="button" class="tab" :class="{ active: payrollTab === 'excess' }" @click="payrollTab = 'excess'; loadExcessRules()">
          Excess Time Rules
        </button>
        <button type="button" class="tab" :class="{ active: payrollTab === 'time_claims' }" @click="payrollTab = 'time_claims'; loadTimeClaimSettings()">
          Time claims
        </button>
        <button type="button" class="tab" :class="{ active: payrollTab === 'percent_pay' }" @click="payrollTab = 'percent_pay'; loadPercentPay()">
          Percent-of-charge pay
        </button>
        <button type="button" class="tab" :class="{ active: payrollTab === 'med_cancel' }" @click="payrollTab = 'med_cancel'; loadMedcancel()">
          Med Cancel
        </button>
        <button type="button" class="tab" :class="{ active: payrollTab === 'mileage' }" @click="payrollTab = 'mileage'; loadMileage()">
          Mileage Rates
        </button>
        <button type="button" class="tab" :class="{ active: payrollTab === 'pto' }" @click="payrollTab = 'pto'; loadPto()">
          PTO Policy
        </button>
        <button type="button" class="tab" :class="{ active: payrollTab === 'supervision' }" @click="payrollTab = 'supervision'; loadSupervision()">
          Supervision
        </button>
        <button type="button" class="tab" :class="{ active: payrollTab === 'holidays' }" @click="payrollTab = 'holidays'; loadHolidays()">
          Holidays
        </button>
        <button type="button" class="tab" :class="{ active: payrollTab === 'service_codes' }" @click="payrollTab = 'service_codes'; loadServiceCodes()">
          Service Codes
        </button>
        <button type="button" class="tab" :class="{ active: payrollTab === 'rate_titles' }" @click="payrollTab = 'rate_titles'; loadRateTitles()">
          Rate Titles
        </button>
        <button type="button" class="tab" :class="{ active: payrollTab === 'comp_levels' }" @click="payrollTab = 'comp_levels'">
          Compensation Levels
        </button>
      </div>

      <div v-if="payrollTab === 'schedule'" class="card">
      <div v-if="error" class="warn">{{ error }}</div>
      <div v-if="loading" class="muted">Loading…</div>

      <div v-else>
        <div class="grid">
          <div class="field">
            <label>Schedule type</label>
            <select v-model="draft.scheduleType">
              <option value="biweekly">Biweekly (anchor end date)</option>
              <option value="semi_monthly">Semi-monthly (two end days)</option>
            </select>
          </div>

          <div class="field">
            <label>Keep future drafts</label>
            <input v-model.number="draft.futureDraftCount" type="number" min="1" max="60" />
            <div class="hint">We’ll ensure at least this many future pay periods exist as drafts.</div>
          </div>
        </div>

        <div v-if="draft.scheduleType === 'biweekly'" class="field" style="margin-top: 12px;">
          <label>Biweekly anchor period end</label>
          <input v-model="draft.biweeklyAnchorPeriodEnd" type="date" />
          <div class="hint">Pick a known correct pay period end date. Future periods advance every 14 days.</div>
        </div>

        <div v-else class="grid" style="margin-top: 12px;">
          <div class="field">
            <label>Semi-monthly end day #1</label>
            <input v-model.number="draft.semiMonthlyDay1" type="number" min="1" max="31" />
          </div>
          <div class="field">
            <label>Semi-monthly end day #2</label>
            <input v-model.number="draft.semiMonthlyDay2" type="number" min="1" max="31" />
            <div class="hint">If a day doesn’t exist in a month, we clamp to the last day.</div>
          </div>
        </div>

        <div class="actions" style="margin-top: 14px;">
          <button class="btn btn-primary" type="button" @click="save" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save schedule' }}
          </button>
        </div>

        <div class="card" style="margin-top: 14px;">
          <div class="hint" style="font-weight: 700;">What this fixes</div>
          <ul class="hint" style="margin-top: 6px;">
            <li>Stops auto-detect/import from matching “interim” (off-schedule) periods.</li>
            <li>Keeps at least N future draft pay periods so reimbursements/adjustments can be saved into the future.</li>
          </ul>
        </div>
      </div>
    </div>

    <div v-else-if="payrollTab === 'excess'" class="card">
      <h3 style="margin: 0 0 8px 0;">Excess Time Compensation Rules</h3>
      <div class="hint" style="margin-bottom: 12px;">
        Per-pay-period expected totals per service code. Excess = actual − expected; only positive excess is paid at the provider's rates.
      </div>
      <div v-if="excessError" class="warn">{{ excessError }}</div>
      <div v-if="excessLoading" class="muted">Loading…</div>
      <div v-else class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Service Code</th>
              <th class="right">Expected Direct Total (mins)</th>
              <th class="right">Expected Indirect Total (mins)</th>
              <th class="right">Credit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in excessRules" :key="r.service_code">
              <td><strong>{{ r.service_code }}</strong></td>
              <td class="right">
                <input v-model.number="excessDraft[r.service_code].expectedDirectTotal" type="number" min="0" style="width: 90px;" />
              </td>
              <td class="right">
                <input v-model.number="excessDraft[r.service_code].expectedIndirectTotal" type="number" min="0" style="width: 90px;" />
              </td>
              <td class="right">
                <input v-model.number="excessDraft[r.service_code].creditValue" type="number" step="0.01" min="0" style="width: 80px;" />
              </td>
              <td>
                <button type="button" class="btn btn-primary btn-sm" @click="saveExcessRule(r)" :disabled="excessSaving[r.service_code]">
                  {{ excessSaving[r.service_code] ? 'Saving…' : 'Save' }}
                </button>
                <button type="button" class="btn btn-danger btn-sm" @click="deleteExcessRule(r)" :disabled="excessSaving[r.service_code]">
                  Delete
                </button>
              </td>
            </tr>
            <tr v-if="!excessRules.length">
              <td colspan="5" class="empty-state-inline">No excess compensation rules yet. Add one below.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="settings-section-divider" style="margin-top: 18px;">
        <h4>Add Service Code</h4>
      </div>
      <div class="filters-row" style="align-items: flex-end;">
        <div class="filters-group">
          <label class="filters-label">Service Code</label>
          <input v-model="newExcessServiceCode" class="filters-input" type="text" placeholder="e.g., 90837, 90834, H0004" />
        </div>
        <div class="filters-group">
          <label class="filters-label">Expected Direct Total (mins)</label>
          <input v-model.number="newExcessExpectedDirect" class="filters-input" type="number" min="0" placeholder="0" />
        </div>
        <div class="filters-group">
          <label class="filters-label">Expected Indirect Total (mins)</label>
          <input v-model.number="newExcessExpectedIndirect" class="filters-input" type="number" min="0" placeholder="0" />
        </div>
        <div class="filters-group">
          <button type="button" class="btn btn-primary btn-sm" @click="addExcessRule" :disabled="!newExcessServiceCode || excessAdding">
            {{ excessAdding ? 'Adding…' : 'Add' }}
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="payrollTab === 'time_claims'" class="card">
      <h3 style="margin: 0 0 8px 0;">Time claim modules</h3>
      <div class="hint" style="margin-bottom: 12px;">
        Show or hide excess time and service correction on the dashboard Submit tab. When excess time is off, providers cannot submit excess claims even if rules exist below.
        Turn off the Therapy Notes question when your agency does not use Therapy Notes for direct service documentation.
      </div>
      <div v-if="timeClaimSettingsError" class="warn">{{ timeClaimSettingsError }}</div>
      <div v-if="timeClaimSettingsLoading" class="muted">Loading…</div>
      <div v-else class="time-claim-toggles">
        <label class="toggle-row">
          <input v-model="timeClaimDraft.excessEnabled" type="checkbox" />
          <span>Allow excess time claims</span>
        </label>
        <label class="toggle-row">
          <input v-model="timeClaimDraft.serviceCorrectionEnabled" type="checkbox" />
          <span>Allow service correction claims</span>
        </label>
        <label class="toggle-row">
          <input v-model="timeClaimDraft.overtimeTherapyNotesAttestationEnabled" type="checkbox" />
          <span>Ask “All direct service recorded in Therapy Notes?” on overtime evaluation</span>
        </label>
        <div class="actions" style="margin-top: 14px;">
          <button class="btn btn-primary" type="button" @click="saveTimeClaimSettings" :disabled="timeClaimSettingsSaving">
            {{ timeClaimSettingsSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Med Cancel ─────────────────────────────────────────────────────── -->
    <div v-else-if="payrollTab === 'med_cancel'" class="card">
      <h3 style="margin:0 0 4px 0;">Med Cancel</h3>
      <p class="hint" style="margin:0 0 14px 0;">Configure the pay service code and per-missed-service rates for providers marked "Low" or "High".</p>
      <div v-if="mcError" class="warn">{{ mcError }}</div>
      <div v-if="mcLoading" class="muted">Loading…</div>
      <template v-else>
        <div class="filters-row" style="align-items:flex-end;">
          <div class="filters-group" style="min-width:240px;">
            <label class="filters-label">Display name (UI label)</label>
            <input v-model="mcDraft.displayName" class="filters-input" type="text" :disabled="mcSaving" />
            <div class="hint" style="margin-top:4px;">What users see instead of "Med Cancel".</div>
          </div>
          <div class="filters-group" style="min-width:200px;">
            <label class="filters-label">Pay service code</label>
            <input v-model="mcDraft.serviceCode" class="filters-input" type="text" :disabled="mcSaving" />
          </div>
          <div class="filters-group">
            <button class="btn btn-primary" type="button" @click="saveMedcancel" :disabled="mcSaving">{{ mcSaving ? 'Saving…' : 'Save' }}</button>
          </div>
        </div>
        <div class="filters-row" style="align-items:flex-end; margin-top:12px;">
          <div class="filters-group" style="min-width:200px;">
            <label class="filters-label">Add missed service code</label>
            <input v-model="mcNewCode" class="filters-input" type="text" placeholder="e.g., 90832" :disabled="mcSaving" />
          </div>
          <div class="filters-group">
            <button class="btn btn-secondary" type="button" @click="mcAddCode" :disabled="mcSaving || !String(mcNewCode||'').trim()">Add</button>
          </div>
        </div>
        <div class="table-wrap" style="margin-top:10px;">
          <table class="table">
            <thead><tr><th>Missed code</th><th class="right">Low ($)</th><th class="right">High ($)</th><th></th></tr></thead>
            <tbody>
              <tr v-for="code in mcMissedCodes" :key="code">
                <td><strong>{{ code }}</strong></td>
                <td class="right"><input v-model.number="mcDraft.schedules.low[code]" type="number" step="0.01" min="0" style="width:120px;" :disabled="mcSaving" /></td>
                <td class="right"><input v-model.number="mcDraft.schedules.high[code]" type="number" step="0.01" min="0" style="width:120px;" :disabled="mcSaving" /></td>
                <td><button class="btn btn-danger btn-sm" type="button" @click="mcRemoveCode(code)" :disabled="mcSaving">Remove</button></td>
              </tr>
              <tr v-if="!mcMissedCodes.length"><td colspan="4" class="empty-state-inline">No missed service codes configured.</td></tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- ── Mileage Rates ─────────────────────────────────────────────────── -->
    <div v-else-if="payrollTab === 'mileage'" class="card">
      <h3 style="margin:0 0 4px 0;">Mileage Rates</h3>
      <p class="hint" style="margin:0 0 14px 0;">Per-mile reimbursement rates used for approving School Mileage submissions.</p>
      <div v-if="mileageError" class="warn">{{ mileageError }}</div>
      <div v-if="mileageLoading" class="muted">Loading…</div>
      <template v-else>
        <div class="filters-row" style="align-items:flex-end;">
          <div class="filters-group">
            <label class="filters-label">Tier 1 ($/mile)</label>
            <input v-model="mileageDraft.tier1" class="filters-input" type="number" step="0.0001" min="0" :disabled="mileageSaving" />
          </div>
          <div class="filters-group">
            <label class="filters-label">Tier 2 ($/mile)</label>
            <input v-model="mileageDraft.tier2" class="filters-input" type="number" step="0.0001" min="0" :disabled="mileageSaving" />
          </div>
          <div class="filters-group">
            <label class="filters-label">Tier 3 ($/mile)</label>
            <input v-model="mileageDraft.tier3" class="filters-input" type="number" step="0.0001" min="0" :disabled="mileageSaving" />
          </div>
          <div class="filters-group">
            <label class="filters-label">Other Mileage ($/mile)</label>
            <input v-model="mileageDraft.standard" class="filters-input" type="number" step="0.0001" min="0" :disabled="mileageSaving || mileageDraft.standardUsesTierRates" />
          </div>
          <div class="filters-group">
            <button class="btn btn-primary" type="button" @click="saveMileage" :disabled="mileageSaving">{{ mileageSaving ? 'Saving…' : 'Save rates' }}</button>
          </div>
        </div>
        <div class="toggle-row" style="margin-top:10px;">
          <input id="mileage-tier" type="checkbox" v-model="mileageDraft.standardUsesTierRates" :disabled="mileageSaving" />
          <label for="mileage-tier">Use tier rates for Other Mileage</label>
        </div>
        <p class="hint" style="margin-top:4px;">Other Mileage uses the flat rate unless this is checked.</p>
      </template>
    </div>

    <!-- ── PTO Policy ────────────────────────────────────────────────────── -->
    <div v-else-if="payrollTab === 'pto'" class="card">
      <h3 style="margin:0 0 4px 0;">PTO Policy</h3>
      <p class="hint" style="margin:0 0 14px 0;">Sick leave + training PTO accrual, caps, and default pay rate.</p>
      <div v-if="ptoError" class="warn">{{ ptoError }}</div>
      <div v-if="ptoLoading" class="muted">Loading…</div>
      <template v-else>
        <div class="grid">
          <div class="field">
            <label>PTO enabled</label>
            <select v-model="ptoDraft.ptoEnabled" :disabled="ptoSaving">
              <option :value="true">Enabled</option><option :value="false">Disabled</option>
            </select>
          </div>
          <div class="field">
            <label>Default PTO pay rate ($/hr)</label>
            <input v-model="ptoDraft.defaultPayRate" type="number" step="0.01" min="0" :disabled="ptoSaving" />
          </div>
          <div class="field">
            <label>Sick accrual (hrs per 30)</label>
            <input v-model="ptoDraft.sickAccrualPer30" type="number" step="0.01" min="0" :disabled="ptoSaving" />
          </div>
          <div class="field">
            <label>Sick annual rollover cap (hrs)</label>
            <input v-model="ptoDraft.sickAnnualRolloverCap" type="number" step="0.01" min="0" :disabled="ptoSaving" />
          </div>
          <div class="field">
            <label>Sick max accrual (hrs)</label>
            <input v-model="ptoDraft.sickAnnualMaxAccrual" type="number" step="0.01" min="0" :disabled="ptoSaving" />
          </div>
          <div class="field">
            <label>Training PTO enabled</label>
            <select v-model="ptoDraft.trainingPtoEnabled" :disabled="ptoSaving">
              <option :value="true">Enabled</option><option :value="false">Disabled</option>
            </select>
          </div>
          <div class="field">
            <label>Training accrual (hrs per 30)</label>
            <input v-model="ptoDraft.trainingAccrualPer30" type="number" step="0.01" min="0" :disabled="ptoSaving || ptoDraft.trainingPtoEnabled !== true" />
          </div>
          <div class="field">
            <label>Training max balance (hrs)</label>
            <input v-model="ptoDraft.trainingMaxBalance" type="number" step="0.01" min="0" :disabled="ptoSaving || ptoDraft.trainingPtoEnabled !== true" />
          </div>
          <div class="field">
            <label>Forfeit training PTO on termination</label>
            <select v-model="ptoDraft.trainingForfeitOnTermination" :disabled="ptoSaving || ptoDraft.trainingPtoEnabled !== true">
              <option :value="true">Yes</option><option :value="false">No</option>
            </select>
          </div>
          <div class="field">
            <label>Consecutive use limit (hrs)</label>
            <input v-model="ptoDraft.ptoConsecutiveUseLimitHours" type="number" step="0.01" min="0" :disabled="ptoSaving" />
          </div>
          <div class="field">
            <label>Notice days</label>
            <input v-model="ptoDraft.ptoConsecutiveUseNoticeDays" type="number" step="1" min="0" :disabled="ptoSaving" />
          </div>
        </div>
        <div class="actions" style="margin-top:14px; justify-content:flex-start;">
          <button class="btn btn-primary" type="button" @click="savePto" :disabled="ptoSaving">{{ ptoSaving ? 'Saving…' : 'Save PTO policy' }}</button>
        </div>
      </template>
    </div>

    <!-- ── Supervision Tracking ──────────────────────────────────────────── -->
    <div v-else-if="payrollTab === 'supervision'" class="card">
      <h3 style="margin:0 0 4px 0;">Supervision Tracking (Pre-licensed)</h3>
      <p class="hint" style="margin:0 0 14px 0;">Enable supervision hour tracking for pre-licensed providers and configure the default schedule after 50 individual hours.</p>
      <div v-if="supError" class="warn">{{ supError }}</div>
      <div v-if="supLoading" class="muted">Loading…</div>
      <template v-else>
        <div class="grid">
          <div class="field">
            <label>Enabled</label>
            <select v-model="supDraft.enabled" :disabled="supSaving">
              <option :value="true">Enabled</option><option :value="false">Disabled</option>
            </select>
          </div>
          <div class="field">
            <label>Eligible credentials (comma-separated)</label>
            <input v-model="supDraft.eligibleCredentialCodesCsv" type="text" :disabled="supSaving" />
          </div>
          <div class="field">
            <label>After 50 individual hours: cadence (weeks)</label>
            <input v-model="supDraft.after50CadenceWeeks" type="number" step="1" min="1" :disabled="supSaving || supDraft.enabled !== true" />
          </div>
          <div class="field">
            <label>After 50 individual hours: minutes</label>
            <input v-model="supDraft.after50Minutes" type="number" step="5" min="5" :disabled="supSaving || supDraft.enabled !== true" />
          </div>
        </div>
        <p class="hint" style="margin-top:8px;">CSV import per pay period in Payroll → selected period → Supervision import. Columns: <code>email</code>, <code>individual_hours</code>, <code>group_hours</code>.</p>
        <div class="actions" style="margin-top:14px; justify-content:flex-start;">
          <button class="btn btn-primary" type="button" @click="saveSupervision" :disabled="supSaving">{{ supSaving ? 'Saving…' : 'Save supervision policy' }}</button>
        </div>
      </template>
    </div>

    <!-- ── Agency Holidays ───────────────────────────────────────────────── -->
    <div v-else-if="payrollTab === 'holidays'" class="card">
      <h3 style="margin:0 0 4px 0;">Agency Holidays</h3>
      <p class="hint" style="margin:0 0 14px 0;">Configure holiday dates and the holiday bonus policy (% of service pay on those dates).</p>
      <div v-if="holError" class="warn">{{ holError }}</div>
      <div v-if="holLoading" class="muted">Loading…</div>
      <template v-else>
        <div class="settings-section-divider">
          <h4 style="margin:0 0 4px 0;">Holiday pay policy</h4>
        </div>
        <div class="filters-row" style="align-items:flex-end; margin-bottom:10px;">
          <div class="filters-group" style="min-width:200px;">
            <label class="filters-label">Holiday bonus (%)</label>
            <input v-model.number="holPolicyDraft.percentage" class="filters-input" type="number" step="0.01" min="0" max="100" :disabled="holPolicySaving" />
          </div>
          <div class="filters-group">
            <button class="btn btn-primary" type="button" @click="saveHolPolicy" :disabled="holPolicySaving">{{ holPolicySaving ? 'Saving…' : 'Save policy' }}</button>
          </div>
        </div>
        <div class="toggle-row" style="margin-bottom:4px;">
          <input id="hol-notify" type="checkbox" v-model="holPolicyDraft.notifyMissingApproval" :disabled="holPolicySaving" />
          <label for="hol-notify">Notify if Holiday Bonus assessed but not approved/rejected</label>
        </div>
        <div class="toggle-row" style="margin-bottom:14px;">
          <input id="hol-strict" type="checkbox" v-model="holPolicyDraft.notifyStrictMessage" :disabled="holPolicySaving || !holPolicyDraft.notifyMissingApproval" />
          <label for="hol-strict">Use strict handbook/remediation message</label>
        </div>

        <div class="settings-section-divider">
          <h4 style="margin:0 0 4px 0;">Holiday dates</h4>
        </div>
        <div class="filters-row" style="align-items:flex-end; margin-top:8px;">
          <div class="filters-group" style="min-width:180px;">
            <label class="filters-label">Date</label>
            <input v-model="holNewDate" class="filters-input" type="date" :disabled="holSaving" />
          </div>
          <div class="filters-group" style="min-width:220px;">
            <label class="filters-label">Name</label>
            <input v-model="holNewName" class="filters-input" type="text" placeholder="e.g., New Year's Day" :disabled="holSaving" />
          </div>
          <div class="filters-group">
            <button class="btn btn-secondary" type="button" @click="addHoliday" :disabled="holSaving || !holNewDate || !holNewName">Add</button>
          </div>
          <div class="filters-group">
            <button class="btn btn-secondary" type="button" @click="loadHolidays" :disabled="holLoading">Reload</button>
          </div>
        </div>
        <div class="table-wrap" style="margin-top:10px;">
          <table class="table">
            <thead><tr><th style="width:160px;">Date</th><th>Name</th><th style="width:120px;"></th></tr></thead>
            <tbody>
              <tr v-for="h in holidays" :key="h.id">
                <td><strong>{{ String(h.holiday_date || h.holidayDate || '').slice(0,10) }}</strong></td>
                <td>{{ h.name }}</td>
                <td class="right"><button class="btn btn-danger btn-sm" type="button" @click="removeHoliday(h)" :disabled="holSaving">Remove</button></td>
              </tr>
              <tr v-if="!holidays.length"><td colspan="3" class="empty-state-inline">No holidays configured.</td></tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- ── Service Codes ─────────────────────────────────────────────────── -->
    <div v-else-if="payrollTab === 'service_codes'" class="card">
      <h3 style="margin:0 0 4px 0;">Payroll Service Codes</h3>
      <p class="hint" style="margin:0 0 14px 0;">How each service code converts units → hours, counts for tier credits, and other pay calculation settings.</p>
      <div v-if="scError" class="warn">{{ scError }}</div>
      <div v-if="scLoading" class="muted">Loading…</div>
      <template v-else>
        <div class="filters-row" style="align-items:flex-end; margin-bottom:8px;">
          <div class="filters-group">
            <button class="btn btn-secondary" type="button" @click="loadServiceCodes" :disabled="scLoading">Reload</button>
          </div>
          <div class="filters-group">
            <button class="btn btn-primary" type="button" @click="scSaveAll" :disabled="scSaving || !scDirtyCodes.length">
              {{ scSaving ? 'Saving…' : `Save all (${scDirtyCodes.length})` }}
            </button>
          </div>
          <div class="filters-group" v-if="scDirtyCodes.length">
            <span class="hint"><strong>Unsaved:</strong> {{ scDirtyCodes.slice(0,10).join(', ') }}<span v-if="scDirtyCodes.length > 10">…</span></span>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Category</th>
                <th>Pay method</th>
                <th class="right">Pay %</th>
                <th>Pay unit</th>
                <th class="right">Pay divisor</th>
                <th class="right">Credit value</th>
                <th>Tier?</th>
                <th>Other slot</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in scRules" :key="r.service_code">
                <td><strong>{{ r.service_code }}</strong></td>
                <td>
                  <select v-model="r.category" @change="scOnChange(r)" style="min-width:100px;">
                    <option value="direct">direct</option><option value="indirect">indirect</option>
                    <option value="admin">admin</option><option value="meeting">meeting</option>
                    <option value="other">other</option><option value="tutoring">tutoring</option>
                    <option value="mileage">mileage</option><option value="bonus">bonus</option>
                    <option value="reimbursement">reimbursement</option><option value="other_pay">other_pay</option>
                  </select>
                </td>
                <td>
                  <select v-model="r.pay_method" @change="scOnChange(r)">
                    <option value="fixed_rate">fixed_rate</option>
                    <option value="percent_of_charge">percent_of_charge</option>
                  </select>
                </td>
                <td class="right">
                  <input v-model.number="r.pay_percent" @change="scOnChange(r)" type="number" min="0" max="100" step="0.01" style="width:80px;"
                    :disabled="r.pay_method !== 'percent_of_charge'"
                    :placeholder="r.pay_method === 'percent_of_charge' ? `default ${pctDraft.defaultPercent || 0}%` : '—'" />
                </td>
                <td>
                  <select v-model="r.pay_rate_unit" @change="scOnChange(r)">
                    <option value="per_unit">per_unit</option><option value="per_hour">per_hour</option>
                  </select>
                </td>
                <td class="right"><input v-model.number="r.pay_divisor" @change="scOnChange(r)" type="number" min="1" step="1" style="width:90px;" /></td>
                <td class="right"><input v-model.number="r.credit_value" @change="scOnChange(r)" type="number" min="0" step="0.00000000001" style="width:110px;" /></td>
                <td>
                  <input type="checkbox" :checked="!!r.counts_for_tier" @change="r.counts_for_tier = $event.target.checked ? 1 : 0; scOnChange(r)" />
                </td>
                <td>
                  <select v-model.number="r.other_slot" @change="scOnChange(r)" :disabled="!(r.category === 'other' || r.category === 'tutoring')">
                    <option :value="1">1</option><option :value="2">2</option><option :value="3">3</option>
                  </select>
                </td>
                <td>
                  <div style="display:flex;gap:4px;align-items:center;">
                    <button class="btn btn-secondary btn-sm" type="button" @click="scSaveOne(r)" :disabled="scSavingByCode[r.service_code] || !scIsDirty(r)">Save</button>
                    <button class="btn btn-danger btn-sm" type="button" @click="scDelete(r)" :disabled="scSaving">Del</button>
                    <span v-if="scSavingByCode[r.service_code]" class="hint">…</span>
                    <span v-else-if="scIsDirty(r)" class="hint" style="color:#d97706;">●</span>
                  </div>
                </td>
              </tr>
              <tr v-if="!scRules.length"><td colspan="10" class="empty-state-inline">No service codes yet.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="settings-section-divider" style="margin-top:16px;"><h4>Add Service Code</h4></div>
        <div class="filters-row" style="align-items:flex-end;">
          <div class="filters-group">
            <label class="filters-label">Service Code</label>
            <input v-model="scNewCode" class="filters-input" type="text" placeholder="e.g., 90791" />
          </div>
          <div class="filters-group">
            <button class="btn btn-primary" type="button" @click="scAddCode" :disabled="!scNewCode || scSaving">Add</button>
          </div>
        </div>
      </template>
    </div>

    <!-- ── Other Rate Titles ─────────────────────────────────────────────── -->
    <div v-else-if="payrollTab === 'rate_titles'" class="card">
      <h3 style="margin:0 0 4px 0;">Other Rate Titles</h3>
      <p class="hint" style="margin:0 0 14px 0;">Labels shown for the three "Other" hourly rate slots on provider compensation screens.</p>
      <div v-if="rtError" class="warn">{{ rtError }}</div>
      <div v-if="rtLoading" class="muted">Loading…</div>
      <template v-else>
        <div class="grid">
          <div class="field"><label>Other 1 title</label><input v-model="rtDraft.title1" type="text" :disabled="rtSaving" /></div>
          <div class="field"><label>Other 2 title</label><input v-model="rtDraft.title2" type="text" :disabled="rtSaving" /></div>
          <div class="field"><label>Other 3 title</label><input v-model="rtDraft.title3" type="text" :disabled="rtSaving" /></div>
        </div>
        <div class="actions" style="margin-top:14px; justify-content:flex-start;">
          <button class="btn btn-primary" type="button" @click="saveRateTitles" :disabled="rtSaving">{{ rtSaving ? 'Saving…' : 'Save titles' }}</button>
        </div>
      </template>
    </div>

    <!-- ── Compensation Levels ──────────────────────────────────────────────── -->
    <div v-else-if="payrollTab === 'comp_levels'">
      <CompensationLevelsSettings :agency-id="agencyId" />
    </div>

    <div v-else-if="payrollTab === 'percent_pay'" class="card">
      <h3 style="margin: 0 0 4px 0;">Percent-of-client-paid pay</h3>
      <p class="hint" style="margin: 0 0 14px 0;">
        Pay providers a percentage of the client's Patient Amount Paid from billing imports.
        Enable the feature, optionally set a fallback default %, then configure each service code's pay method below.
        Per-employee overrides are set on each user's Payroll tab.
      </p>

      <div v-if="pctError" class="warn">{{ pctError }}</div>
      <div v-if="pctLoading" class="muted">Loading…</div>

      <template v-else>
        <!-- Feature toggle -->
        <div class="toggle-row" style="margin-bottom: 10px;">
          <input id="pct-enabled" type="checkbox" v-model="pctDraft.enabled" />
          <label for="pct-enabled" style="font-weight: 600;">Enable percent-of-client-paid pay for this agency</label>
        </div>

        <!-- Optional agency-wide default percent -->
        <div class="field" style="max-width: 260px; margin-bottom: 14px;">
          <label>Agency default % <span class="hint">(optional fallback when no per-code or per-user % is set)</span></label>
          <div style="display:flex; gap:6px; align-items:center;">
            <input
              v-model.number="pctDraft.defaultPercent"
              type="number" step="0.01" min="0" max="100"
              :disabled="!pctDraft.enabled"
              placeholder="e.g. 70"
              style="width:100px;"
            />
            <span class="hint">%</span>
          </div>
        </div>

        <div class="actions" style="justify-content: flex-start; margin-bottom: 18px;">
          <button class="btn btn-primary" type="button" @click="savePercentPay" :disabled="pctSaving">
            {{ pctSaving ? 'Saving…' : 'Save feature settings' }}
          </button>
        </div>

        <!-- Per-service-code pay method -->
        <div class="settings-section-divider">
          <h4 style="margin: 0 0 4px 0;">Per-service-code pay method</h4>
          <p class="hint" style="margin: 0 0 10px 0;">
            Switch individual codes between fixed-rate and percent-of-charge.
            A code-level % overrides the agency default; leave blank to use the agency default.
          </p>
        </div>

        <div v-if="pctRulesLoading" class="muted">Loading service codes…</div>
        <div v-else-if="!pctRules.length" class="muted">No service codes configured yet. Add them in Agency → Payroll first.</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Service code</th>
                <th>Pay method</th>
                <th>Code-level % <span class="hint">(optional)</span></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in pctRules" :key="r.service_code">
                <td><strong>{{ r.service_code }}</strong></td>
                <td>
                  <select v-model="pctRuleDraft[r.service_code].payMethod" :disabled="!pctDraft.enabled">
                    <option value="fixed_rate">Fixed rate ($/unit)</option>
                    <option value="percent_of_charge">Percent of charge (%)</option>
                  </select>
                </td>
                <td>
                  <div style="display:flex;gap:4px;align-items:center;">
                    <input
                      v-model="pctRuleDraft[r.service_code].payPercent"
                      type="number" step="0.01" min="0" max="100"
                      :disabled="!pctDraft.enabled || pctRuleDraft[r.service_code].payMethod !== 'percent_of_charge'"
                      :placeholder="`default ${pctDraft.defaultPercent || 0}%`"
                      style="width:90px;"
                    />
                    <span v-if="pctRuleDraft[r.service_code].payMethod === 'percent_of_charge'" class="hint">%</span>
                  </div>
                </td>
                <td>
                  <button type="button" class="btn btn-primary btn-sm" @click="savePercentRule(r.service_code)" :disabled="pctRuleSaving[r.service_code] || !pctDraft.enabled">
                    {{ pctRuleSaving[r.service_code] ? 'Saving…' : 'Save' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import CompensationLevelsSettings from './CompensationLevelsSettings.vue';

const props = defineProps({
  scopedAgencyId: { type: Number, default: null }
});

const agencyStore = useAgencyStore();
const agencyId = computed(() => {
  const sid = Number(props.scopedAgencyId || 0);
  if (Number.isFinite(sid) && sid > 0) return sid;
  return agencyStore.currentAgency?.id || null;
});

const payrollTab = ref('schedule');

const loading = ref(false);
const saving = ref(false);
const syncing = ref(false);
const cleaning = ref(false);
const error = ref('');

const draft = ref({
  scheduleType: 'biweekly',
  biweeklyAnchorPeriodEnd: '',
  semiMonthlyDay1: 15,
  semiMonthlyDay2: 30,
  futureDraftCount: 6
});

const load = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get('/payroll/schedule-settings', { params: { agencyId: agencyId.value } });
    const row = resp.data || null;
    if (!row) return;
    draft.value = {
      scheduleType: String(row.schedule_type || 'biweekly'),
      biweeklyAnchorPeriodEnd: row.biweekly_anchor_period_end ? String(row.biweekly_anchor_period_end).slice(0, 10) : '',
      semiMonthlyDay1: Number(row.semi_monthly_day1 || 15),
      semiMonthlyDay2: Number(row.semi_monthly_day2 || 30),
      futureDraftCount: Number(row.future_draft_count || 6)
    };
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load payroll schedule settings';
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  if (!agencyId.value) return;
  try {
    saving.value = true;
    error.value = '';
    await api.put('/payroll/schedule-settings', {
      agencyId: agencyId.value,
      scheduleType: draft.value.scheduleType,
      biweeklyAnchorPeriodEnd: draft.value.biweeklyAnchorPeriodEnd || null,
      semiMonthlyDay1: Number(draft.value.semiMonthlyDay1 || 15),
      semiMonthlyDay2: Number(draft.value.semiMonthlyDay2 || 30),
      futureDraftCount: Number(draft.value.futureDraftCount || 6)
    });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save payroll schedule';
  } finally {
    saving.value = false;
  }
};

const syncFutureDrafts = async () => {
  if (!agencyId.value) return;
  try {
    syncing.value = true;
    error.value = '';
    // Uses schedule-based generation when schedule settings exist.
    await api.post('/payroll/periods/ensure-future', { agencyId: agencyId.value, minFutureDrafts: Number(draft.value.futureDraftCount || 6) });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to sync future drafts';
  } finally {
    syncing.value = false;
  }
};

const cleanupFuture = async () => {
  if (!agencyId.value) return;
  try {
    cleaning.value = true;
    error.value = '';
    await api.post('/payroll/periods/cleanup-future', { agencyId: agencyId.value });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to cleanup future periods';
  } finally {
    cleaning.value = false;
  }
};

// Excess compensation rules
const excessRules = ref([]);
const excessDraft = ref({});
const excessLoading = ref(false);
const excessError = ref('');
const excessSaving = ref({});
const excessAdding = ref(false);
const newExcessServiceCode = ref('');
const newExcessExpectedDirect = ref(0);
const newExcessExpectedIndirect = ref(0);

const loadExcessRules = async () => {
  if (!agencyId.value) return;
  try {
    excessLoading.value = true;
    excessError.value = '';
    const resp = await api.get('/payroll/excess-compensation-rules', { params: { agencyId: agencyId.value } });
    excessRules.value = resp.data || [];
    excessDraft.value = {};
    for (const r of excessRules.value) {
      excessDraft.value[r.service_code] = {
        expectedDirectTotal: Number(r.expected_direct_total || 0),
        expectedIndirectTotal: Number(r.expected_indirect_total || 0),
        creditValue: Number(r.credit_value || 0)
      };
    }
  } catch (e) {
    excessError.value = e.response?.data?.error?.message || e.message || 'Failed to load excess rules';
    excessRules.value = [];
  } finally {
    excessLoading.value = false;
  }
};

const saveExcessRule = async (r) => {
  if (!agencyId.value || !r?.service_code) return;
  const d = excessDraft.value[r.service_code];
  if (!d) return;
  try {
    excessSaving.value = { ...excessSaving.value, [r.service_code]: true };
    excessError.value = '';
    await api.post('/payroll/excess-compensation-rules', {
      agencyId: agencyId.value,
      serviceCode: r.service_code,
      expectedDirectTotal: Number(d.expectedDirectTotal ?? 0),
      expectedIndirectTotal: Number(d.expectedIndirectTotal ?? 0),
      creditValue: Number(d.creditValue ?? 0)
    });
    await loadExcessRules();
  } catch (e) {
    excessError.value = e.response?.data?.error?.message || e.message || 'Failed to save';
  } finally {
    excessSaving.value = { ...excessSaving.value, [r.service_code]: false };
  }
};

const deleteExcessRule = async (r) => {
  if (!agencyId.value || !r?.service_code) return;
  if (!window.confirm(`Delete excess rule for ${r.service_code}?`)) return;
  try {
    excessSaving.value = { ...excessSaving.value, [r.service_code]: true };
    excessError.value = '';
    await api.delete('/payroll/excess-compensation-rules', {
      params: { agencyId: agencyId.value, serviceCode: r.service_code }
    });
    await loadExcessRules();
  } catch (e) {
    excessError.value = e.response?.data?.error?.message || e.message || 'Failed to delete';
  } finally {
    excessSaving.value = { ...excessSaving.value, [r.service_code]: false };
  }
};

function parseFeatureFlagsJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
}

const timeClaimDraft = ref({
  excessEnabled: true,
  serviceCorrectionEnabled: true,
  overtimeTherapyNotesAttestationEnabled: true
});
const timeClaimSettingsLoading = ref(false);
const timeClaimSettingsSaving = ref(false);
const timeClaimSettingsError = ref('');

const loadTimeClaimSettings = async () => {
  if (!agencyId.value) return;
  try {
    timeClaimSettingsLoading.value = true;
    timeClaimSettingsError.value = '';
    const res = await api.get(`/agencies/${agencyId.value}`);
    const flags = parseFeatureFlagsJson(res.data?.feature_flags);
    timeClaimDraft.value = {
      excessEnabled: flags.timeClaimExcessEnabled !== false,
      serviceCorrectionEnabled: flags.timeClaimServiceCorrectionEnabled !== false,
      overtimeTherapyNotesAttestationEnabled: flags.overtimeTherapyNotesAttestationEnabled !== false
    };
  } catch (e) {
    timeClaimSettingsError.value = e.response?.data?.error?.message || e.message || 'Failed to load agency flags';
  } finally {
    timeClaimSettingsLoading.value = false;
  }
};

const saveTimeClaimSettings = async () => {
  if (!agencyId.value) return;
  try {
    timeClaimSettingsSaving.value = true;
    timeClaimSettingsError.value = '';
    const res = await api.get(`/agencies/${agencyId.value}`);
    const prev = parseFeatureFlagsJson(res.data?.feature_flags);
    const next = {
      ...prev,
      timeClaimExcessEnabled: !!timeClaimDraft.value.excessEnabled,
      timeClaimServiceCorrectionEnabled: !!timeClaimDraft.value.serviceCorrectionEnabled,
      overtimeTherapyNotesAttestationEnabled: !!timeClaimDraft.value.overtimeTherapyNotesAttestationEnabled
    };
    await api.put(`/agencies/${agencyId.value}`, { featureFlags: next });
    await agencyStore.hydrateAgencyById(agencyId.value);
  } catch (e) {
    timeClaimSettingsError.value = e.response?.data?.error?.message || e.message || 'Failed to save';
  } finally {
    timeClaimSettingsSaving.value = false;
  }
};

const addExcessRule = async () => {
  const code = String(newExcessServiceCode.value || '').trim();
  if (!agencyId.value || !code) return;
  try {
    excessAdding.value = true;
    excessError.value = '';
    await api.post('/payroll/excess-compensation-rules', {
      agencyId: agencyId.value,
      serviceCode: code,
      expectedDirectTotal: Number(newExcessExpectedDirect.value ?? 0),
      expectedIndirectTotal: Number(newExcessExpectedIndirect.value ?? 0),
      creditValue: 0
    });
    newExcessServiceCode.value = '';
    newExcessExpectedDirect.value = 0;
    newExcessExpectedIndirect.value = 0;
    await loadExcessRules();
  } catch (e) {
    excessError.value = e.response?.data?.error?.message || e.message || 'Failed to add';
  } finally {
    excessAdding.value = false;
  }
};

// ── Percent-of-charge pay ─────────────────────────────────────────────────────
const pctLoading = ref(false);
const pctSaving  = ref(false);
const pctError   = ref('');
const pctDraft   = ref({ enabled: false, defaultPercent: 0 });

const pctRules       = ref([]);
const pctRuleDraft   = ref({});
const pctRulesLoading = ref(false);
const pctRuleSaving  = ref({});

const loadPercentPay = async () => {
  if (!agencyId.value) return;
  try {
    pctLoading.value = true;
    pctError.value = '';
    const [policyResp, rulesResp] = await Promise.all([
      api.get('/payroll/percentage-pay-policy', { params: { agencyId: agencyId.value } }),
      api.get('/payroll/service-code-rules',    { params: { agencyId: agencyId.value } })
    ]);
    const pol = policyResp.data || {};
    pctDraft.value = {
      enabled: !!pol.enabled,
      defaultPercent: Number(pol.policy?.defaultPercent ?? 0)
    };
    pctRules.value = rulesResp.data || [];
    const draft = {};
    for (const r of pctRules.value) {
      draft[r.service_code] = {
        payMethod:  String(r.pay_method || 'fixed_rate'),
        payPercent: r.pay_percent === null || r.pay_percent === undefined ? '' : String(r.pay_percent)
      };
    }
    pctRuleDraft.value = draft;
  } catch (e) {
    pctError.value = e.response?.data?.error?.message || e.message || 'Failed to load percent pay settings';
  } finally {
    pctLoading.value = false;
    pctRulesLoading.value = false;
  }
};

const savePercentPay = async () => {
  if (!agencyId.value) return;
  try {
    pctSaving.value = true;
    pctError.value = '';
    // Save feature flag + default percent
    const agencyResp = await api.get(`/agencies/${agencyId.value}`);
    const prev = parseFeatureFlagsJson(agencyResp.data?.feature_flags);
    await api.put(`/agencies/${agencyId.value}`, {
      featureFlags: { ...prev, percentOfChargePayEnabled: !!pctDraft.value.enabled }
    });
    await api.put('/payroll/percentage-pay-policy', {
      agencyId: agencyId.value,
      policy: { defaultPercent: Number(pctDraft.value.defaultPercent || 0) }
    });
  } catch (e) {
    pctError.value = e.response?.data?.error?.message || e.message || 'Failed to save';
  } finally {
    pctSaving.value = false;
  }
};

const savePercentRule = async (serviceCode) => {
  if (!agencyId.value || !serviceCode) return;
  const d = pctRuleDraft.value[serviceCode];
  if (!d) return;
  try {
    pctRuleSaving.value = { ...pctRuleSaving.value, [serviceCode]: true };
    pctError.value = '';
    const payPercent = d.payMethod === 'percent_of_charge' && d.payPercent !== ''
      ? Number(d.payPercent)
      : null;
    await api.post('/payroll/service-code-rules', {
      agencyId: agencyId.value,
      serviceCode,
      payMethod: d.payMethod,
      payPercent
    });
  } catch (e) {
    pctError.value = e.response?.data?.error?.message || e.message || 'Failed to save rule';
  } finally {
    pctRuleSaving.value = { ...pctRuleSaving.value, [serviceCode]: false };
  }
};

// ─── Med Cancel ──────────────────────────────────────────────────────────────
const mcLoading = ref(false);
const mcSaving = ref(false);
const mcError = ref('');
const mcNewCode = ref('');
const mcDraft = ref({ displayName: 'Med Cancel', serviceCode: 'MEDCANCEL', schedules: { low: {}, high: {} } });
const mcMissedCodes = computed(() => {
  const pol = mcDraft.value || {};
  const all = new Set([
    ...Object.keys(pol?.schedules?.low || {}),
    ...Object.keys(pol?.schedules?.high || {})
  ].map(s => String(s || '').trim()).filter(Boolean));
  return Array.from(all).sort((a, b) => a.localeCompare(b));
});
const loadMedcancel = async () => {
  if (!agencyId.value) return;
  try {
    mcLoading.value = true; mcError.value = '';
    const resp = await api.get('/payroll/medcancel-policy', { params: { agencyId: agencyId.value } });
    const pol = resp.data?.policy || {};
    mcDraft.value = {
      displayName: String(pol?.displayName || 'Med Cancel').trim() || 'Med Cancel',
      serviceCode: String(pol?.serviceCode || 'MEDCANCEL').trim().toUpperCase() || 'MEDCANCEL',
      schedules: {
        low: (pol?.schedules?.low && typeof pol.schedules.low === 'object') ? pol.schedules.low : {},
        high: (pol?.schedules?.high && typeof pol.schedules.high === 'object') ? pol.schedules.high : {}
      }
    };
  } catch (e) {
    mcError.value = e.response?.data?.error?.message || e.message || 'Failed to load Med Cancel policy';
  } finally { mcLoading.value = false; }
};
const mcAddCode = () => {
  const code = String(mcNewCode.value || '').trim();
  if (!code) return;
  const next = JSON.parse(JSON.stringify(mcDraft.value));
  if (!next.schedules) next.schedules = { low: {}, high: {} };
  if (next.schedules.low[code] === undefined) next.schedules.low[code] = 0;
  if (next.schedules.high[code] === undefined) next.schedules.high[code] = 0;
  mcDraft.value = next; mcNewCode.value = '';
};
const mcRemoveCode = (code) => {
  const k = String(code || '').trim();
  if (!k) return;
  const next = JSON.parse(JSON.stringify(mcDraft.value));
  if (next?.schedules?.low) delete next.schedules.low[k];
  if (next?.schedules?.high) delete next.schedules.high[k];
  mcDraft.value = next;
};
const saveMedcancel = async () => {
  if (!agencyId.value) return;
  try {
    mcSaving.value = true; mcError.value = '';
    const toNum = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 10000) / 10000 : 0; };
    const normalize = (m) => {
      const out = {};
      for (const [k, v] of Object.entries(m || {})) { const c = String(k || '').trim(); if (c) out[c] = toNum(v); }
      return out;
    };
    const pol = mcDraft.value;
    await api.put('/payroll/medcancel-policy', {
      agencyId: agencyId.value,
      policy: {
        displayName: String(pol?.displayName || 'Med Cancel').trim() || 'Med Cancel',
        serviceCode: String(pol?.serviceCode || 'MEDCANCEL').trim().toUpperCase(),
        schedules: { low: normalize(pol?.schedules?.low), high: normalize(pol?.schedules?.high) }
      }
    });
    await loadMedcancel();
  } catch (e) {
    mcError.value = e.response?.data?.error?.message || e.message || 'Failed to save';
  } finally { mcSaving.value = false; }
};

// ─── Mileage Rates ────────────────────────────────────────────────────────────
const mileageLoading = ref(false);
const mileageSaving = ref(false);
const mileageError = ref('');
const mileageDraft = ref({ tier1: 0, tier2: 0, tier3: 0, standard: 0, standardUsesTierRates: false });
const loadMileage = async () => {
  if (!agencyId.value) return;
  try {
    mileageLoading.value = true; mileageError.value = '';
    const resp = await api.get('/payroll/mileage-rates', { params: { agencyId: agencyId.value } });
    const rates = resp.data?.rates || [];
    const settings = resp.data?.settings || {};
    const byTier = new Map((rates).map(r => [Number(r.tierLevel), Number(r.ratePerMile || 0)]));
    mileageDraft.value = {
      tier1: byTier.get(1) || 0, tier2: byTier.get(2) || 0, tier3: byTier.get(3) || 0,
      standard: Number(settings.standardMileageRatePerMile || 0),
      standardUsesTierRates: !!settings.standardMileageUsesTierRates
    };
  } catch (e) {
    mileageError.value = e.response?.data?.error?.message || e.message || 'Failed to load mileage rates';
  } finally { mileageLoading.value = false; }
};
const saveMileage = async () => {
  if (!agencyId.value) return;
  try {
    mileageSaving.value = true; mileageError.value = '';
    await api.put('/payroll/mileage-rates', {
      rates: [
        { tierLevel: 1, ratePerMile: Number(mileageDraft.value.tier1 || 0) },
        { tierLevel: 2, ratePerMile: Number(mileageDraft.value.tier2 || 0) },
        { tierLevel: 3, ratePerMile: Number(mileageDraft.value.tier3 || 0) }
      ],
      standardMileageRatePerMile: Number(mileageDraft.value.standard || 0),
      standardMileageUsesTierRates: !!mileageDraft.value.standardUsesTierRates
    }, { params: { agencyId: agencyId.value } });
    await loadMileage();
  } catch (e) {
    mileageError.value = e.response?.data?.error?.message || e.message || 'Failed to save mileage rates';
  } finally { mileageSaving.value = false; }
};

// ─── PTO Policy ───────────────────────────────────────────────────────────────
const ptoLoading = ref(false);
const ptoSaving = ref(false);
const ptoError = ref('');
const ptoDraft = ref({
  ptoEnabled: true, defaultPayRate: 0, sickAccrualPer30: 1.0, trainingAccrualPer30: 0.25,
  trainingPtoEnabled: false, sickAnnualRolloverCap: 10, sickAnnualMaxAccrual: 65,
  trainingMaxBalance: 20, trainingForfeitOnTermination: true,
  ptoConsecutiveUseLimitHours: 15, ptoConsecutiveUseNoticeDays: 30
});
const loadPto = async () => {
  if (!agencyId.value) return;
  try {
    ptoLoading.value = true; ptoError.value = '';
    const resp = await api.get('/payroll/pto-policy', { params: { agencyId: agencyId.value } });
    const policy = resp.data?.policy || {};
    ptoDraft.value = {
      ptoEnabled: resp.data?.policy?.ptoEnabled !== false && resp.data?.ptoEnabled !== false,
      defaultPayRate: Number(resp.data?.defaultPayRate || 0),
      sickAccrualPer30: Number(policy.sickAccrualPer30 ?? 1.0),
      trainingAccrualPer30: Number(policy.trainingAccrualPer30 ?? 0.25),
      trainingPtoEnabled: policy.trainingPtoEnabled === true,
      sickAnnualRolloverCap: Number(policy.sickAnnualRolloverCap ?? 10),
      sickAnnualMaxAccrual: Number(policy.sickAnnualMaxAccrual ?? 65),
      trainingMaxBalance: Number(policy.trainingMaxBalance ?? 20),
      trainingForfeitOnTermination: policy.trainingForfeitOnTermination !== false,
      ptoConsecutiveUseLimitHours: Number(policy.ptoConsecutiveUseLimitHours ?? 15),
      ptoConsecutiveUseNoticeDays: Number(policy.ptoConsecutiveUseNoticeDays ?? 30)
    };
  } catch (e) {
    ptoError.value = e.response?.data?.error?.message || e.message || 'Failed to load PTO policy';
  } finally { ptoLoading.value = false; }
};
const savePto = async () => {
  if (!agencyId.value) return;
  try {
    ptoSaving.value = true; ptoError.value = '';
    await api.put('/payroll/pto-policy', {
      agencyId: agencyId.value,
      ptoEnabled: ptoDraft.value.ptoEnabled !== false,
      defaultPayRate: Number(ptoDraft.value.defaultPayRate || 0),
      policy: {
        sickAccrualPer30: Number(ptoDraft.value.sickAccrualPer30 || 0),
        trainingAccrualPer30: Number(ptoDraft.value.trainingAccrualPer30 || 0),
        trainingPtoEnabled: ptoDraft.value.trainingPtoEnabled === true,
        sickAnnualRolloverCap: Number(ptoDraft.value.sickAnnualRolloverCap || 0),
        sickAnnualMaxAccrual: Number(ptoDraft.value.sickAnnualMaxAccrual || 0),
        trainingMaxBalance: Number(ptoDraft.value.trainingMaxBalance || 0),
        trainingForfeitOnTermination: ptoDraft.value.trainingForfeitOnTermination !== false,
        ptoConsecutiveUseLimitHours: Number(ptoDraft.value.ptoConsecutiveUseLimitHours || 0),
        ptoConsecutiveUseNoticeDays: Number(ptoDraft.value.ptoConsecutiveUseNoticeDays || 0),
        ptoEnabled: ptoDraft.value.ptoEnabled !== false
      }
    });
    await loadPto();
  } catch (e) {
    ptoError.value = e.response?.data?.error?.message || e.message || 'Failed to save PTO policy';
  } finally { ptoSaving.value = false; }
};

// ─── Supervision Tracking ─────────────────────────────────────────────────────
const supLoading = ref(false);
const supSaving = ref(false);
const supError = ref('');
const supDraft = ref({ enabled: false, eligibleCredentialCodesCsv: 'LPCC,LMFT,MFTC,LSW,SWC', after50CadenceWeeks: 2, after50Minutes: 30 });
const loadSupervision = async () => {
  if (!agencyId.value) return;
  try {
    supLoading.value = true; supError.value = '';
    const resp = await api.get('/payroll/supervision-policy', { params: { agencyId: agencyId.value } });
    const pol = resp.data?.policy || {};
    supDraft.value = {
      enabled: pol.enabled === true,
      eligibleCredentialCodesCsv: Array.isArray(pol.eligibleCredentialCodes) ? pol.eligibleCredentialCodes.join(',') : 'LPCC,LMFT,MFTC,LSW,SWC',
      after50CadenceWeeks: Number(pol?.after50Individual?.cadenceWeeks ?? 2),
      after50Minutes: Number(pol?.after50Individual?.minutes ?? 30)
    };
  } catch (e) {
    supError.value = e.response?.data?.error?.message || e.message || 'Failed to load supervision policy';
  } finally { supLoading.value = false; }
};
const saveSupervision = async () => {
  if (!agencyId.value) return;
  try {
    supSaving.value = true; supError.value = '';
    const codes = String(supDraft.value.eligibleCredentialCodesCsv || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    await api.put('/payroll/supervision-policy', {
      agencyId: agencyId.value,
      enabled: supDraft.value.enabled === true,
      policy: {
        eligibleCredentialCodes: codes,
        after50Individual: { cadenceWeeks: Number(supDraft.value.after50CadenceWeeks || 2), minutes: Number(supDraft.value.after50Minutes || 30) }
      }
    });
    await loadSupervision();
  } catch (e) {
    supError.value = e.response?.data?.error?.message || e.message || 'Failed to save supervision policy';
  } finally { supSaving.value = false; }
};

// ─── Holidays ─────────────────────────────────────────────────────────────────
const holLoading = ref(false);
const holSaving = ref(false);
const holPolicySaving = ref(false);
const holError = ref('');
const holNewDate = ref('');
const holNewName = ref('');
const holidays = ref([]);
const holPolicyDraft = ref({ percentage: 0, notifyMissingApproval: false, notifyStrictMessage: false });
const loadHolidays = async () => {
  if (!agencyId.value) return;
  holLoading.value = true; holError.value = '';
  try {
    const [polResp, holResp] = await Promise.all([
      api.get('/payroll/holiday-pay-policy', { params: { agencyId: agencyId.value } }),
      api.get('/payroll/holidays', { params: { agencyId: agencyId.value } })
    ]);
    const pol = polResp.data?.policy || {};
    holPolicyDraft.value = {
      percentage: Number(pol?.percentage || 0),
      notifyMissingApproval: Boolean(pol?.notifyMissingApproval),
      notifyStrictMessage: Boolean(pol?.notifyStrictMessage)
    };
    holidays.value = holResp.data?.holidays || [];
  } catch (e) {
    holError.value = e.response?.data?.error?.message || e.message || 'Failed to load holidays';
  } finally { holLoading.value = false; }
};
const saveHolPolicy = async () => {
  if (!agencyId.value) return;
  try {
    holPolicySaving.value = true; holError.value = '';
    await api.put('/payroll/holiday-pay-policy', {
      agencyId: agencyId.value,
      policy: {
        percentage: Number(holPolicyDraft.value.percentage || 0),
        notifyMissingApproval: Boolean(holPolicyDraft.value.notifyMissingApproval),
        notifyStrictMessage: Boolean(holPolicyDraft.value.notifyStrictMessage)
      }
    });
  } catch (e) {
    holError.value = e.response?.data?.error?.message || e.message || 'Failed to save holiday policy';
  } finally { holPolicySaving.value = false; }
};
const addHoliday = async () => {
  if (!agencyId.value) return;
  const date = String(holNewDate.value || '').trim().slice(0, 10);
  const name = String(holNewName.value || '').trim();
  if (!date || !name) return;
  try {
    holSaving.value = true; holError.value = '';
    await api.post('/payroll/holidays', { agencyId: agencyId.value, holidayDate: date, name });
    holNewDate.value = ''; holNewName.value = '';
    await loadHolidays();
  } catch (e) {
    holError.value = e.response?.data?.error?.message || e.message || 'Failed to add holiday';
  } finally { holSaving.value = false; }
};
const removeHoliday = async (h) => {
  if (!agencyId.value) return;
  const id = Number(h?.id || 0);
  if (!id) return;
  if (!window.confirm('Remove this holiday?')) return;
  try {
    holSaving.value = true; holError.value = '';
    await api.delete(`/payroll/holidays/${id}`);
    await loadHolidays();
  } catch (e) {
    holError.value = e.response?.data?.error?.message || e.message || 'Failed to remove holiday';
  } finally { holSaving.value = false; }
};

// ─── Service Codes ────────────────────────────────────────────────────────────
const scLoading = ref(false);
const scSaving = ref(false);
const scError = ref('');
const scNewCode = ref('');
const scRules = ref([]);
const scBaseline = ref({});
const scSavingByCode = ref({});
const scSerialize = (r) => JSON.stringify({
  service_code: String(r?.service_code || '').trim(),
  category: String(r?.category || 'direct').toLowerCase(),
  pay_method: String(r?.pay_method || 'fixed_rate').toLowerCase(),
  pay_percent: r?.pay_percent === '' || r?.pay_percent == null ? null : Number(r.pay_percent),
  pay_rate_unit: String(r?.pay_rate_unit || 'per_unit').toLowerCase(),
  pay_divisor: Number(r?.pay_divisor ?? 1),
  credit_value: Number(r?.credit_value ?? 0),
  counts_for_tier: r?.counts_for_tier ? 1 : 0,
  other_slot: Number(r?.other_slot ?? 1)
});
const scIsDirty = (r) => {
  const code = String(r?.service_code || '').trim();
  const base = scBaseline.value?.[code];
  return !base || base !== scSerialize(r);
};
const scDirtyCodes = computed(() => (scRules.value || []).filter(r => scIsDirty(r)).map(r => r.service_code).sort());
const scOnChange = (r) => {
  const cat = String(r.category || 'direct').toLowerCase();
  r.category = cat;
  if (!(cat === 'other' || cat === 'tutoring')) r.other_slot = 1;
  else r.other_slot = [1, 2, 3].includes(Number(r.other_slot)) ? Number(r.other_slot) : 1;
};
const loadServiceCodes = async () => {
  if (!agencyId.value) return;
  try {
    scLoading.value = true; scError.value = '';
    const resp = await api.get('/payroll/service-code-rules', { params: { agencyId: agencyId.value } });
    const normalized = (resp.data || []).map(r => ({
      ...r,
      category: r.category || 'direct',
      pay_method: r.pay_method || 'fixed_rate',
      pay_percent: r.pay_percent === null || r.pay_percent === undefined || r.pay_percent === '' ? '' : Number(r.pay_percent),
      pay_rate_unit: r.pay_rate_unit || 'per_unit',
      other_slot: Number(r.other_slot || 1),
      pay_divisor: r.pay_divisor ?? 1,
      credit_value: r.credit_value ?? 0,
      counts_for_tier: r.counts_for_tier === 0 ? false : true
    }));
    scRules.value = normalized;
    const base = {};
    for (const r of normalized) { const c = String(r?.service_code || '').trim(); if (c) base[c] = scSerialize(r); }
    scBaseline.value = base;
  } catch (e) {
    scError.value = e.response?.data?.error?.message || e.message || 'Failed to load service codes';
    scRules.value = [];
  } finally { scLoading.value = false; }
};
const scSaveOne = async (r) => {
  if (!agencyId.value || !r?.service_code) return;
  const code = String(r.service_code || '').trim();
  if (!code) return;
  try {
    scSaving.value = true; scSavingByCode.value = { ...scSavingByCode.value, [code]: true }; scError.value = '';
    scOnChange(r);
    await api.post('/payroll/service-code-rules', {
      agencyId: agencyId.value, serviceCode: code, category: r.category, otherSlot: r.other_slot,
      payMethod: r.pay_method || 'fixed_rate',
      payPercent: r.pay_method === 'percent_of_charge' ? (r.pay_percent === '' ? null : r.pay_percent) : null,
      payRateUnit: r.pay_rate_unit || 'per_unit', durationMinutes: null,
      countsForTier: r.counts_for_tier ? 1 : 0, payDivisor: r.pay_divisor, creditValue: r.credit_value
    });
    scBaseline.value = { ...scBaseline.value, [code]: scSerialize(r) };
  } catch (e) {
    scError.value = e.response?.data?.error?.message || e.message || 'Failed to save service code';
  } finally { scSaving.value = false; scSavingByCode.value = { ...scSavingByCode.value, [code]: false }; }
};
const scSaveAll = async () => {
  const dirty = (scRules.value || []).filter(r => scIsDirty(r));
  for (const r of dirty) await scSaveOne(r);
  await loadServiceCodes();
};
const scDelete = async (r) => {
  if (!agencyId.value || !r?.service_code) return;
  if (!window.confirm(`Delete service code ${r.service_code}?`)) return;
  try {
    scSaving.value = true; scError.value = '';
    await api.delete(`/payroll/service-code-rules/${r.service_code}`, { params: { agencyId: agencyId.value } });
    await loadServiceCodes();
  } catch (e) {
    scError.value = e.response?.data?.error?.message || e.message || 'Failed to delete service code';
  } finally { scSaving.value = false; }
};
const scAddCode = async () => {
  if (!agencyId.value || !scNewCode.value) return;
  const code = String(scNewCode.value || '').trim().toUpperCase();
  if (!code) return;
  try {
    scSaving.value = true; scError.value = '';
    await api.post('/payroll/service-code-rules', {
      agencyId: agencyId.value, serviceCode: code, category: 'direct', payMethod: 'fixed_rate',
      payRateUnit: 'per_unit', countsForTier: 1, payDivisor: 1, creditValue: 0, otherSlot: 1
    });
    scNewCode.value = '';
    await loadServiceCodes();
  } catch (e) {
    scError.value = e.response?.data?.error?.message || e.message || 'Failed to add service code';
  } finally { scSaving.value = false; }
};

// ─── Other Rate Titles ────────────────────────────────────────────────────────
const rtLoading = ref(false);
const rtSaving = ref(false);
const rtError = ref('');
const rtDraft = ref({ title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' });
const loadRateTitles = async () => {
  if (!agencyId.value) return;
  try {
    rtLoading.value = true; rtError.value = '';
    const resp = await api.get('/payroll/other-rate-titles', { params: { agencyId: agencyId.value } });
    rtDraft.value = { title1: resp.data?.title1 || 'Other 1', title2: resp.data?.title2 || 'Other 2', title3: resp.data?.title3 || 'Other 3' };
  } catch (e) {
    rtError.value = e.response?.data?.error?.message || e.message || 'Failed to load rate titles';
  } finally { rtLoading.value = false; }
};
const saveRateTitles = async () => {
  if (!agencyId.value) return;
  try {
    rtSaving.value = true; rtError.value = '';
    await api.put('/payroll/other-rate-titles', { agencyId: agencyId.value, title1: rtDraft.value.title1, title2: rtDraft.value.title2, title3: rtDraft.value.title3 });
  } catch (e) {
    rtError.value = e.response?.data?.error?.message || e.message || 'Failed to save rate titles';
  } finally { rtSaving.value = false; }
};

watch(agencyId, async () => {
  await load();
  if (payrollTab.value === 'time_claims') await loadTimeClaimSettings();
  if (payrollTab.value === 'percent_pay') await loadPercentPay();
  if (payrollTab.value === 'med_cancel') await loadMedcancel();
  if (payrollTab.value === 'mileage') await loadMileage();
  if (payrollTab.value === 'pto') await loadPto();
  if (payrollTab.value === 'supervision') await loadSupervision();
  if (payrollTab.value === 'holidays') await loadHolidays();
  if (payrollTab.value === 'service_codes') await loadServiceCodes();
  if (payrollTab.value === 'rate_titles') await loadRateTitles();
}, { immediate: true });

watch(payrollTab, async (t) => {
  if (t === 'time_claims') await loadTimeClaimSettings();
  if (t === 'percent_pay') await loadPercentPay();
  if (t === 'med_cancel') await loadMedcancel();
  if (t === 'mileage') await loadMileage();
  if (t === 'pto') await loadPto();
  if (t === 'supervision') await loadSupervision();
  if (t === 'holidays') await loadHolidays();
  if (t === 'service_codes') await loadServiceCodes();
  if (t === 'rate_titles') await loadRateTitles();
});
</script>

<style scoped>
.wrap {
  padding: 16px;
}
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.hint {
  color: var(--text-secondary);
  font-size: 13px;
}
.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  background: white;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}
.field input, .field select, .field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.warn {
  background: rgba(220, 53, 69, 0.08);
  border: 1px solid rgba(220, 53, 69, 0.25);
  padding: 10px 12px;
  border-radius: 10px;
  color: #b02a37;
  margin-bottom: 10px;
}
.empty, .muted {
  color: var(--text-secondary);
  padding: 10px 0;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tab {
  padding: 8px 16px;
  border: 1px solid var(--border);
  background: #f8f9fa;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
}
.tab:hover {
  background: #eee;
}
.tab.active {
  background: var(--primary, #0d6efd);
  color: white;
  border-color: var(--primary, #0d6efd);
}
.table-wrap {
  overflow-x: auto;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th, .table td {
  padding: 8px 10px;
  border: 1px solid var(--border);
  text-align: left;
}
.table th.right, .table td.right {
  text-align: right;
}
.empty-state-inline {
  color: var(--text-secondary);
  padding: 12px;
  font-style: italic;
}
.settings-section-divider {
  border-top: 1px solid var(--border);
  padding-top: 12px;
}
.filters-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.filters-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.filters-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.filters-input {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  min-width: 120px;
}
.time-claim-toggles .toggle-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 10px;
  font-weight: 500;
}
.time-claim-toggles .toggle-row input {
  margin-top: 3px;
}
.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.toggle-row label {
  cursor: pointer;
}
</style>

