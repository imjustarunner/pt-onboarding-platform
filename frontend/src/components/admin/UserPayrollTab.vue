<template>
  <div class="tab-panel">
    <h2>Payroll</h2>
    <p class="section-description">Pay-period totals and service-code breakdown (admin/support only).</p>

    <div v-if="error" class="error-box">{{ error }}</div>
    <div v-if="loading" class="loading">Loading payroll...</div>

    <div v-else>
      <div class="field">
        <label>Agency</label>
        <select v-model="selectedAgencyId">
          <option v-for="a in payrollAgencyOptions" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Pay Period</th>
              <th>Status</th>
              <th class="right">Units</th>
              <th class="right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in periods" :key="p.id" class="clickable" @click="toggleOpen(p)">
              <td>
                <div class="title">{{ p.label }}</div>
                <div class="meta">{{ p.period_start }} → {{ p.period_end }}</div>
              </td>
              <td>{{ p.status }}</td>
              <td class="right">{{ fmtNum(p.total_units) }}</td>
              <td class="right">{{ fmtMoney(p.total_amount) }}</td>
            </tr>
            <tr v-if="!periods.length">
              <td colspan="4" class="muted">No payroll records yet.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="openPeriod" class="breakdown-card">
        <h3 class="breakdown-title">Breakdown: {{ openPeriod.label }}</h3>
        <div v-if="openPeriod">
          <div class="row"><strong>Total Pay:</strong> {{ fmtMoney(openPeriod.total_amount ?? 0) }}</div>
          <div class="row"><strong>Total Credits/Hours:</strong> {{ fmtNum(openPeriod.total_hours ?? 0) }}</div>
          <div class="row"><strong>Tier Credits (Final):</strong> {{ fmtNum(openPeriod.tier_credits_final ?? openPeriod.tier_credits_current ?? 0) }}</div>

          <div
            class="warn-box"
            v-if="openPeriod.breakdown && openPeriod.breakdown.__priorStillUnpaid && (openPeriod.breakdown.__priorStillUnpaid.totalUnits || 0) > 0"
            style="margin-top: 10px; border: 1px solid #ffb5b5; background: #ffecec;"
          >
            <div>
              <strong>Still unpaid from the prior pay period (not paid this period):</strong>
              {{ fmtNum(openPeriod.breakdown.__priorStillUnpaid.totalUnits) }} units
            </div>
            <div class="muted" style="margin-top: 4px;" v-if="openPeriod.breakdown.__priorStillUnpaid.periodStart">
              {{ openPeriod.breakdown.__priorStillUnpaid.periodStart }} → {{ openPeriod.breakdown.__priorStillUnpaid.periodEnd }}
            </div>
            <div class="muted" style="margin-top: 6px;" v-if="(openPeriod.breakdown.__priorStillUnpaid.lines || []).length">
              <div><strong>Details:</strong></div>
              <div v-for="(l, i) in (openPeriod.breakdown.__priorStillUnpaid.lines || [])" :key="`prior-unpaid:${l.serviceCode}:${i}`">
                - {{ l.serviceCode }}: {{ fmtNum(l.unpaidUnits) }} units
              </div>
            </div>
          </div>

          <div class="breakdown-grid" v-if="openPeriod.breakdown && openPeriod.breakdown.__tier" style="margin-top: 10px;">
            <div class="breakdown-row" style="grid-template-columns: 1fr;">
              <div class="code">Benefit Tier</div>
              <div class="muted"><strong>{{ openPeriod.breakdown.__tier.label }}</strong></div>
              <div class="muted"><strong>Status:</strong> {{ openPeriod.breakdown.__tier.status }}</div>
            </div>
          </div>

          <h4 class="breakdown-title" style="margin-top: 12px;">Service Codes</h4>
          <div class="table-wrap" v-if="openPeriodServiceLines.length">
            <table class="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th class="right">No Note</th>
                  <th class="right">Draft</th>
                  <th class="right">Finalized</th>
                  <th class="right">Credits/Hours</th>
                  <th class="right">Rate</th>
                  <th class="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in openPeriodServiceLines" :key="l.code">
                  <td class="code">{{ l.code }}</td>
                  <td class="right muted">{{ fmtNum(l.noNoteUnits ?? 0) }}</td>
                  <td class="right muted">{{ fmtNum(l.draftUnits ?? 0) }}</td>
                  <td class="right">{{ fmtNum(l.finalizedUnits ?? l.units ?? 0) }}</td>
                  <td class="right muted">{{ fmtNum(l.hours ?? 0) }}</td>
                  <td class="right muted">{{ fmtMoney(l.rateAmount ?? 0) }}</td>
                  <td class="right">{{ fmtMoney(l.amount ?? 0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="muted">No breakdown available.</div>
        </div>
      </div>

      <div v-if="selectedAgencyId" class="comp-card">
        <div class="comp-header">
          <div>
            <h3 class="comp-title">Compensation (Rate Sheet)</h3>
            <div class="muted">Per-code rates only. Category/unit math is edited in Agency → Edit Organization → Payroll.</div>
          </div>
          <div class="actions comp-toolbar">
            <select v-model="selectedTemplateId">
              <option :value="null">Select template…</option>
              <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
            <button class="btn btn-secondary" @click="loadTemplate" :disabled="!selectedTemplateId">View</button>
            <button class="btn btn-primary" @click="applyTemplate" :disabled="!selectedTemplateId || applyingTemplate">Apply to this user</button>
            <button v-if="canEditRates && !editingRates" class="btn btn-secondary" @click="beginEditRates">Edit rates</button>
            <button v-if="canEditRates && editingRates" class="btn btn-secondary" @click="cancelEditRates" :disabled="savingRates">Cancel</button>
            <button v-if="canEditRates && editingRates" class="btn btn-primary" @click="saveRates" :disabled="savingRates">Save</button>
          </div>
        </div>

        <div class="comp-subtoolbar" style="margin-top: 10px;">
          <div class="comp-subgroup">
            <input v-model="newTemplateName" type="text" placeholder="New template name…" />
            <button class="btn btn-secondary" @click="createTemplateFromUser" :disabled="creatingTemplate || !newTemplateName">
              Create template
            </button>
          </div>
          <div class="comp-subgroup">
            <input v-model="renameTemplateName" type="text" placeholder="Rename selected template…" />
            <button class="btn btn-secondary" @click="renameTemplate" :disabled="renamingTemplate || !selectedTemplateId || !renameTemplateName">
              Rename
            </button>
              <button class="btn btn-danger" @click="deleteTemplate" :disabled="deletingTemplate || !selectedTemplateId">
                {{ deletingTemplate ? 'Deleting…' : 'Delete' }}
              </button>
          </div>
        </div>

        <div v-if="editingRates" class="muted" style="margin-top: 8px;">
          Tip: leaving a service-code rate blank will not create/change that override.
        </div>
        <div v-if="editError" class="error-box" style="margin-top: 10px;">{{ editError }}</div>

        <div class="template-card" style="margin-top: 10px;">
          <div class="template-title">Hourly rate card (fallback)</div>
          <div class="muted" style="margin-top: 6px;">Used when no per-code rate override exists.</div>
          <div class="table-wrap" style="margin-top: 10px;">
            <table class="table rate-card-table">
              <thead>
                <tr>
                  <th>Direct</th>
                  <th>Indirect</th>
              <th>{{ otherRateTitles.title1 }}</th>
              <th>{{ otherRateTitles.title2 }}</th>
              <th>{{ otherRateTitles.title3 }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td v-if="!editingRates">{{ fmtMoney(rateCard?.direct_rate || 0) }}/hr</td>
                  <td v-else><input v-model="rateCardDraft.directRate" type="number" step="0.01" min="0" /></td>

                  <td v-if="!editingRates">{{ fmtMoney(rateCard?.indirect_rate || 0) }}/hr</td>
                  <td v-else><input v-model="rateCardDraft.indirectRate" type="number" step="0.01" min="0" /></td>

                  <td v-if="!editingRates">{{ fmtMoney(rateCard?.other_rate_1 || 0) }}/hr</td>
                  <td v-else><input v-model="rateCardDraft.otherRate1" type="number" step="0.01" min="0" /></td>

                  <td v-if="!editingRates">{{ fmtMoney(rateCard?.other_rate_2 || 0) }}/hr</td>
                  <td v-else><input v-model="rateCardDraft.otherRate2" type="number" step="0.01" min="0" /></td>

                  <td v-if="!editingRates">{{ fmtMoney(rateCard?.other_rate_3 || 0) }}/hr</td>
                  <td v-else><input v-model="rateCardDraft.otherRate3" type="number" step="0.01" min="0" /></td>
                </tr>

                <tr v-if="editingRates">
                  <td class="muted" style="font-size: 12px;">Counts as</td>
                  <td class="muted" style="font-size: 12px;">Counts as</td>
                  <td>
                    <select v-model="rateCardDraft.otherBucket1">
                      <option value="direct">Direct</option>
                      <option value="indirect">Indirect</option>
                      <option value="other">Other</option>
                    </select>
                  </td>
                  <td>
                    <select v-model="rateCardDraft.otherBucket2">
                      <option value="direct">Direct</option>
                      <option value="indirect">Indirect</option>
                      <option value="other">Other</option>
                    </select>
                  </td>
                  <td>
                    <select v-model="rateCardDraft.otherBucket3">
                      <option value="direct">Direct</option>
                      <option value="indirect">Indirect</option>
                      <option value="other">Other</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="templateDetails?.template" class="template-card" style="margin-top: 10px;">
          <div class="template-title-row">
            <div class="template-title">Template: {{ templateDetails.template.name }}</div>
            <button class="btn btn-secondary" @click="templateDetails = null">Close</button>
          </div>
          <div class="muted" style="margin-top: 6px;">
            Type: {{ templateDetails.template.is_variable ? 'Fee-for-service (variable)' : 'Hourly (direct/indirect)' }}
            <span v-if="!templateDetails.template.is_variable">
              · Direct: {{ fmtMoney(templateDetails.template.direct_rate || 0) }}
              · Indirect: {{ fmtMoney(templateDetails.template.indirect_rate || 0) }}
            </span>
          </div>
          <div class="table-wrap" style="margin-top: 10px;">
            <table class="table">
              <thead>
                <tr>
                  <th>Service code</th>
                  <th>Unit</th>
                  <th class="right">Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in (templateDetails.rates || [])" :key="r.service_code">
                  <td>{{ r.service_code }}</td>
                  <td class="muted">Agency rule</td>
                  <td class="right">{{ fmtMoney(r.rate_amount) }}</td>
                </tr>
                <tr v-if="!(templateDetails.rates || []).length">
                  <td colspan="3" class="muted">This template has no per-code rates.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="compError" class="error-box" style="margin-top: 10px;">{{ compError }}</div>

        <div v-if="compLoading" class="loading">Loading compensation…</div>
        <div v-else style="margin-top: 10px;">
          <div v-if="!(editingRates ? fullRateRows.length : visibleRateRows.length)" class="muted">
            No rates configured yet.
          </div>
          <div v-else class="rate-grid" :class="{ 'rate-grid--edit': editingRates }">
            <div
              v-for="r in (editingRates ? fullRateRows : visibleRateRows)"
              :key="r.serviceCode"
              class="rate-item"
              :class="{ 'rate-item--edit': editingRates, 'rate-item--hidden': editingRates && !r.visible }"
            >
              <div class="rate-code">
                <span class="code-badge">{{ r.serviceCode }}</span>
              </div>

              <div class="rate-value" v-if="!editingRates">{{ fmtMoney(r.rateAmount) }}</div>

              <div class="rate-edit" v-else>
                <button
                  type="button"
                  class="icon-btn"
                  @click="toggleRuleVisibility(r.serviceCode)"
                  :title="r.visible ? 'Visible in rate sheet' : 'Hidden in rate sheet'"
                  aria-label="Toggle rate visibility"
                >
                  <svg v-if="r.visible" viewBox="0 0 24 24" class="icon" aria-hidden="true">
                    <path
                      d="M12 5C6.5 5 2 10.2 2 12s4.5 7 10 7 10-5.2 10-7-4.5-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z"
                    />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" class="icon" aria-hidden="true">
                    <path
                      d="M2.3 3.7 3.7 2.3 21.7 20.3l-1.4 1.4-2.3-2.3c-1.7.9-3.7 1.6-6 1.6-5.5 0-10-5.2-10-7 0-1.1 1.7-3.4 4.4-5.1L2.3 3.7Zm6.1 6.1A3.9 3.9 0 0 0 8 12a4 4 0 0 0 4 4c.8 0 1.6-.2 2.2-.5l-1.1-1.1c-.3.1-.7.2-1.1.2a1.8 1.8 0 0 1-1.8-1.8c0-.4.1-.8.2-1.1L8.4 9.8Zm3.6-3.7c5.5 0 10 5.2 10 7 0 .9-1.2 2.6-3.2 4.1l-2.2-2.2c.9-.9 1.4-2 1.4-3.0a4 4 0 0 0-4-4c-1 0-2.1.4-3 1.4L9 6.8c1-.4 2-.7 3-.7Z"
                    />
                  </svg>
                </button>

                <input v-model="rateDraftByCode[r.serviceCode]" type="number" step="0.01" min="0" class="mini-input" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="selectedAgencyId" class="settings-grid">
        <!-- Other rate titles -->
        <div v-if="canEditRates" class="settings-card">
          <div class="settings-head">
            <div>
              <h3 class="card-title" style="margin: 0;">Other rate titles</h3>
              <div class="muted" style="margin-top: 4px;">Make changes safely: Edit → Save.</div>
            </div>
            <div class="actions">
              <button v-if="!editingOtherRateTitles" class="btn btn-secondary" type="button" @click="beginEditOtherRateTitles">
                Edit
              </button>
              <template v-else>
                <button class="btn btn-secondary" type="button" @click="cancelEditOtherRateTitles" :disabled="savingOtherRateTitles">
                  Cancel
                </button>
                <button class="btn btn-primary" type="button" @click="saveOtherRateTitlesOverride" :disabled="savingOtherRateTitles">
                  {{ savingOtherRateTitles ? 'Saving…' : 'Save' }}
                </button>
              </template>
            </div>
          </div>

          <div class="muted" style="margin-top: 8px;">
            Current titles: <strong>{{ otherRateTitles.title1 }}</strong>, <strong>{{ otherRateTitles.title2 }}</strong>, <strong>{{ otherRateTitles.title3 }}</strong>
          </div>

          <div class="field" style="margin-top: 10px;">
            <label>Other 1 title</label>
            <input v-model="otherRateTitlesDraft.title1" type="text" placeholder="Leave blank to use agency default" :disabled="!editingOtherRateTitles || savingOtherRateTitles" />
          </div>
          <div class="field">
            <label>Other 2 title</label>
            <input v-model="otherRateTitlesDraft.title2" type="text" placeholder="Leave blank to use agency default" :disabled="!editingOtherRateTitles || savingOtherRateTitles" />
          </div>
          <div class="field">
            <label>Other 3 title</label>
            <input v-model="otherRateTitlesDraft.title3" type="text" placeholder="Leave blank to use agency default" :disabled="!editingOtherRateTitles || savingOtherRateTitles" />
          </div>

          <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
            <button class="btn btn-secondary" type="button" @click="clearOtherRateTitlesOverride" :disabled="!editingOtherRateTitles || savingOtherRateTitles">
              Use agency defaults
            </button>
          </div>
        </div>

        <!-- PTO -->
        <div class="settings-card">
          <div class="settings-head">
            <div>
              <h3 class="card-title" style="margin: 0;">PTO (Sick + Training)</h3>
              <div class="muted" style="margin-top: 4px;">Starting balances + eligibility.</div>
            </div>
            <div class="actions">
              <button class="btn btn-secondary" type="button" @click="loadPtoAccount" :disabled="ptoLoading || !selectedAgencyId">Refresh</button>
              <button v-if="!editingPto" class="btn btn-secondary" type="button" @click="beginEditPto" :disabled="ptoLoading">Edit</button>
              <template v-else>
                <button class="btn btn-secondary" type="button" @click="cancelEditPto" :disabled="savingPto">Cancel</button>
                <button class="btn btn-primary" type="button" @click="savePtoAccount" :disabled="savingPto || !selectedAgencyId">
                  {{ savingPto ? 'Saving…' : 'Save' }}
                </button>
              </template>
            </div>
          </div>

          <div v-if="ptoError" class="error-box" style="margin-top: 10px;">{{ ptoError }}</div>
          <div v-if="ptoLoading" class="loading" style="margin-top: 10px;">Loading PTO…</div>
          <div v-else style="margin-top: 10px;">
            <div class="field">
              <label>Employment type</label>
              <select v-model="ptoForm.employmentType" :disabled="!editingPto">
                <option value="hourly">Hourly</option>
                <option value="fee_for_service">Fee-for-service (credits)</option>
                <option value="salaried">Salaried</option>
              </select>
            </div>

            <div class="field">
              <label class="toggle-label" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Training PTO eligible</span>
                <input type="checkbox" v-model="ptoForm.trainingEligible" :disabled="!editingPto || agencyPtoPolicy?.trainingPtoEnabled !== true" />
              </label>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
              <div class="field">
                <label>Starting Sick (hours)</label>
                <input v-model="ptoForm.sickStartHours" type="number" step="0.01" min="0" :disabled="!editingPto" />
              </div>
              <div class="field">
                <label>Sick start date</label>
                <input v-model="ptoForm.sickStartEffectiveDate" type="date" :disabled="!editingPto" />
              </div>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
              <div class="field">
                <label>Starting Training (hours)</label>
                <input v-model="ptoForm.trainingStartHours" type="number" step="0.01" min="0" :disabled="!editingPto || agencyPtoPolicy?.trainingPtoEnabled !== true" />
              </div>
              <div class="field">
                <label>Training start date</label>
                <input v-model="ptoForm.trainingStartEffectiveDate" type="date" :disabled="!editingPto || agencyPtoPolicy?.trainingPtoEnabled !== true" />
              </div>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
              <div class="field">
                <label>Current Sick balance</label>
                <input :value="fmtNum(Number(ptoAccount?.sick_balance_hours || 0))" type="text" disabled />
              </div>
              <div class="field">
                <label>Current Training balance</label>
                <input :value="(agencyPtoPolicy?.trainingPtoEnabled === true && ptoAccount?.training_pto_eligible) ? fmtNum(Number(ptoAccount?.training_balance_hours || 0)) : '—'" type="text" disabled />
              </div>
            </div>
          </div>
        </div>

        <!-- Salary -->
        <div class="settings-card">
          <div class="settings-head">
            <div>
              <h3 class="card-title" style="margin: 0;">Salary</h3>
              <div class="muted" style="margin-top: 4px;">True salary paid each pay period.</div>
            </div>
            <div class="actions">
              <button class="btn btn-secondary" type="button" @click="loadSalaryPositions" :disabled="salaryPositionsLoading || savingSalary">Reload</button>
              <button v-if="!editingSalary" class="btn btn-secondary" type="button" @click="beginEditSalary" :disabled="salaryPositionsLoading">Edit</button>
              <template v-else>
                <button class="btn btn-secondary" type="button" @click="cancelEditSalary" :disabled="savingSalary">Cancel</button>
                <button class="btn btn-danger" type="button" @click="deleteSalaryPosition" :disabled="savingSalary || !(salaryPositions && salaryPositions.length)">Delete</button>
                <button class="btn btn-primary" type="button" @click="saveSalaryPosition" :disabled="savingSalary">
                  {{ savingSalary ? 'Saving…' : 'Save' }}
                </button>
              </template>
            </div>
          </div>

          <div v-if="salaryPositionsError" class="error-box" style="margin-top: 10px;">{{ salaryPositionsError }}</div>
          <div v-if="salaryPositionsLoading" class="muted" style="margin-top: 10px;">Loading salary position…</div>
          <div v-else style="margin-top: 10px;">
            <div class="muted" v-if="!(salaryPositions && salaryPositions.length)" style="margin-bottom: 8px;">No salary position on file.</div>

            <div class="field">
              <label>Salary per pay period ($)</label>
              <input v-model="salaryDraft.salaryPerPayPeriod" type="number" step="0.01" min="0" :disabled="!editingSalary" />
            </div>

            <div class="field">
              <label>Mode</label>
              <div class="muted" style="margin-top: 6px;">
                <label style="display: inline-flex; gap: 8px; align-items: center;">
                  <input v-model="salaryDraft.includeServicePay" type="checkbox" :disabled="!editingSalary" />
                  Also pay per-session service pay
                </label>
              </div>
              <div class="muted" style="margin-top: 6px;">
                <label style="display: inline-flex; gap: 8px; align-items: center;">
                  <input v-model="salaryDraft.prorateByDays" type="checkbox" :disabled="!editingSalary" />
                  Prorate by active days
                </label>
              </div>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
              <div class="field">
                <label>Effective start (optional)</label>
                <input v-model="salaryDraft.effectiveStart" type="date" :disabled="!editingSalary" />
              </div>
              <div class="field">
                <label>Effective end (optional)</label>
                <input v-model="salaryDraft.effectiveEnd" type="date" :disabled="!editingSalary" />
              </div>
            </div>

            <div class="muted" style="margin-top: 8px;" v-if="salaryPositions && salaryPositions.length">
              Current record id #{{ salaryPositions[0].id }} • created {{ String(salaryPositions[0].created_at || '').slice(0, 19).replace('T',' ') }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  userId: { type: Number, required: true },
  userAgencies: { type: Array, default: () => [] }
});

const authStore = useAuthStore();
const myRole = computed(() => String(authStore.user?.role || '').trim());

const selectedAgencyId = ref(null);
const payrollAgencyOptions = computed(() => {
  const list = Array.isArray(props.userAgencies) ? props.userAgencies : [];
  // Payroll runs at the agency organization level only.
  return list.filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency');
});
const loading = ref(false);
const error = ref('');
const periods = ref([]);
const openPeriodId = ref(null);

const compLoading = ref(false);
const compError = ref('');
const hasPayrollAccessForAgency = ref(false);
const rateCard = ref(null);
const perCodeRates = ref([]);
const serviceCodeRules = ref([]);
const userRateVisibilityRows = ref([]);

const ptoLoading = ref(false);
const savingPto = ref(false);
const ptoError = ref('');
const ptoAccount = ref(null);
const agencyPtoPolicy = ref(null);
const ptoForm = ref({
  employmentType: 'hourly',
  trainingEligible: false,
  sickStartHours: 0,
  sickStartEffectiveDate: '',
  trainingStartHours: 0,
  trainingStartEffectiveDate: ''
});

// Salary position (true salary)
const salaryPositionsLoading = ref(false);
const salaryPositionsError = ref('');
const salaryPositions = ref([]); // history (most recent first)
const salaryDraft = ref({
  id: null,
  salaryPerPayPeriod: '',
  includeServicePay: false,
  prorateByDays: true,
  effectiveStart: '',
  effectiveEnd: ''
});
const savingSalary = ref(false);

const loadSalaryPositions = async () => {
  if (!selectedAgencyId.value) return;
  try {
    salaryPositionsLoading.value = true;
    salaryPositionsError.value = '';
    const resp = await api.get(`/payroll/users/${props.userId}/salary-positions`, { params: { agencyId: selectedAgencyId.value } });
    const list = resp.data?.positions || [];
    salaryPositions.value = list;
    const cur = list?.[0] || null;
    salaryDraft.value = {
      id: cur?.id || null,
      salaryPerPayPeriod: cur?.salary_per_pay_period === null || cur?.salary_per_pay_period === undefined ? '' : String(cur.salary_per_pay_period),
      includeServicePay: !!cur?.include_service_pay,
      prorateByDays: cur?.prorate_by_days === undefined || cur?.prorate_by_days === null ? true : !!cur?.prorate_by_days,
      effectiveStart: String(cur?.effective_start || '').slice(0, 10),
      effectiveEnd: String(cur?.effective_end || '').slice(0, 10)
    };
  } catch (e) {
    salaryPositionsError.value = e.response?.data?.error?.message || e.message || 'Failed to load salary position';
    salaryPositions.value = [];
  } finally {
    salaryPositionsLoading.value = false;
  }
};

const saveSalaryPosition = async () => {
  if (!selectedAgencyId.value) return;
  try {
    savingSalary.value = true;
    salaryPositionsError.value = '';
    const salaryPerPayPeriod = Number(salaryDraft.value.salaryPerPayPeriod || 0);
    if (!Number.isFinite(salaryPerPayPeriod) || salaryPerPayPeriod < 0) {
      salaryPositionsError.value = 'Salary per pay period must be a non-negative number.';
      return;
    }
    await api.post(`/payroll/users/${props.userId}/salary-positions`, {
      agencyId: selectedAgencyId.value,
      id: salaryDraft.value.id || null,
      salaryPerPayPeriod,
      includeServicePay: !!salaryDraft.value.includeServicePay,
      prorateByDays: !!salaryDraft.value.prorateByDays,
      effectiveStart: salaryDraft.value.effectiveStart || null,
      effectiveEnd: salaryDraft.value.effectiveEnd || null
    });
    await loadSalaryPositions();
    editingSalary.value = false;
  } catch (e) {
    salaryPositionsError.value = e.response?.data?.error?.message || e.message || 'Failed to save salary position';
  } finally {
    savingSalary.value = false;
  }
};

const deleteSalaryPosition = async () => {
  if (!selectedAgencyId.value) return;
  const cur = salaryPositions.value?.[0] || null;
  if (!cur?.id) return;
  const ok = window.confirm('Delete the current salary position? Payroll will fall back to hourly/per-session unless a salary override is entered per pay period.');
  if (!ok) return;
  try {
    savingSalary.value = true;
    salaryPositionsError.value = '';
    await api.delete(`/payroll/users/${props.userId}/salary-positions/${cur.id}`, { params: { agencyId: selectedAgencyId.value } });
    await loadSalaryPositions();
    editingSalary.value = false;
  } catch (e) {
    salaryPositionsError.value = e.response?.data?.error?.message || e.message || 'Failed to delete salary position';
  } finally {
    savingSalary.value = false;
  }
};

const ruleByCode = computed(() => {
  const m = new Map();
  for (const r of serviceCodeRules.value || []) {
    const code = String(r.service_code || '').trim();
    if (!code) continue;
    m.set(code, r);
  }
  return m;
});

const visibilityByCode = computed(() => {
  const m = new Map();
  for (const r of userRateVisibilityRows.value || []) {
    const code = String(r.service_code || '').trim();
    if (!code) continue;
    m.set(code, r.show_in_rate_sheet === undefined || r.show_in_rate_sheet === null ? true : !!r.show_in_rate_sheet);
  }
  return m;
});

const templates = ref([]);
const selectedTemplateId = ref(null);
const templateDetails = ref(null);
const applyingTemplate = ref(false);
const creatingTemplate = ref(false);
const renamingTemplate = ref(false);
const deletingTemplate = ref(false);
const newTemplateName = ref('');
const renameTemplateName = ref('');

const canEditRates = computed(() => {
  const role = myRole.value;
  if (role === 'super_admin' || role === 'admin') return true;
  if (role === 'staff' || role === 'support') return !!hasPayrollAccessForAgency.value;
  return false;
});

const otherRateTitles = ref({ title1: 'Other 1', title2: 'Other 2', title3: 'Other 3', source: 'default' });
const otherRateTitlesDraft = ref({ title1: '', title2: '', title3: '' });
const savingOtherRateTitles = ref(false);
const editingOtherRateTitles = ref(false);
const otherRateTitlesDraftBeforeEdit = ref({ title1: '', title2: '', title3: '' });
const loadOtherRateTitles = async () => {
  if (!selectedAgencyId.value) return;
  try {
    const resp = await api.get('/payroll/other-rate-titles', { params: { agencyId: selectedAgencyId.value, userId: props.userId } });
    const t = resp.data || {};
    otherRateTitles.value = {
      title1: t.title1 || 'Other 1',
      title2: t.title2 || 'Other 2',
      title3: t.title3 || 'Other 3',
      source: t.source || 'default'
    };
    otherRateTitlesDraft.value = {
      title1: t.userOverrideTitle1 || '',
      title2: t.userOverrideTitle2 || '',
      title3: t.userOverrideTitle3 || ''
    };
    if (!editingOtherRateTitles.value) {
      otherRateTitlesDraftBeforeEdit.value = { ...otherRateTitlesDraft.value };
    }
  } catch {
    otherRateTitles.value = { title1: 'Other 1', title2: 'Other 2', title3: 'Other 3', source: 'default' };
    otherRateTitlesDraft.value = { title1: '', title2: '', title3: '' };
    if (!editingOtherRateTitles.value) {
      otherRateTitlesDraftBeforeEdit.value = { ...otherRateTitlesDraft.value };
    }
  }
};

const beginEditOtherRateTitles = () => {
  if (!canEditRates.value) return;
  editingOtherRateTitles.value = true;
  otherRateTitlesDraftBeforeEdit.value = { ...otherRateTitlesDraft.value };
};

const cancelEditOtherRateTitles = () => {
  otherRateTitlesDraft.value = { ...otherRateTitlesDraftBeforeEdit.value };
  editingOtherRateTitles.value = false;
};

const saveOtherRateTitlesOverride = async () => {
  if (!selectedAgencyId.value || !canEditRates.value) return;
  try {
    savingOtherRateTitles.value = true;
    await api.put(`/payroll/other-rate-titles/users/${props.userId}`, {
      agencyId: selectedAgencyId.value,
      title1: String(otherRateTitlesDraft.value.title1 || '').trim() || null,
      title2: String(otherRateTitlesDraft.value.title2 || '').trim() || null,
      title3: String(otherRateTitlesDraft.value.title3 || '').trim() || null
    });
    await loadOtherRateTitles();
    editingOtherRateTitles.value = false;
  } finally {
    savingOtherRateTitles.value = false;
  }
};

const clearOtherRateTitlesOverride = async () => {
  otherRateTitlesDraft.value = { title1: '', title2: '', title3: '' };
  await saveOtherRateTitlesOverride();
};

const editingPto = ref(false);
const ptoFormBeforeEdit = ref(null);
const beginEditPto = () => {
  editingPto.value = true;
  ptoFormBeforeEdit.value = { ...(ptoForm.value || {}) };
};
const cancelEditPto = () => {
  if (ptoFormBeforeEdit.value) ptoForm.value = { ...(ptoFormBeforeEdit.value || {}) };
  editingPto.value = false;
};

const editingSalary = ref(false);
const salaryDraftBeforeEdit = ref(null);
const beginEditSalary = () => {
  editingSalary.value = true;
  salaryDraftBeforeEdit.value = { ...(salaryDraft.value || {}) };
};
const cancelEditSalary = () => {
  if (salaryDraftBeforeEdit.value) salaryDraft.value = { ...(salaryDraftBeforeEdit.value || {}) };
  editingSalary.value = false;
};

const editingRates = ref(false);
const savingRates = ref(false);
const editError = ref('');
const rateDraftByCode = ref({});
const rateCardDraft = ref({
  directRate: '',
  indirectRate: '',
  otherRate1: '',
  otherRate2: '',
  otherRate3: '',
  otherBucket1: 'other',
  otherBucket2: 'other',
  otherBucket3: 'other'
});

const openPeriod = computed(() => periods.value.find((p) => p.id === openPeriodId.value) || null);

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
    // If there's no carryover, or this is a flat bucket line, show as-is.
    if (!(oldUnits > 1e-9) || bucket === 'flat') {
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

const openPeriodServiceLines = computed(() => splitBreakdownForDisplay(openPeriod.value?.breakdown || null));

const fmtMoney = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};
const fmtNum = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const fullRateRows = computed(() => {
  const codes = new Map();
  for (const r of serviceCodeRules.value || []) {
    const code = String(r.service_code || '').trim();
    if (!code) continue;
    codes.set(code, { serviceCode: code });
  }
  const out = Array.from(codes.values()).sort((a, b) => a.serviceCode.localeCompare(b.serviceCode));
  // listForUser is ordered by service_code ASC, effective_start DESC.
  // Keep the FIRST row for each code so UI matches payroll's "best current" pick.
  const rateByCode = new Map();
  for (const r of perCodeRates.value || []) {
    const code = String(r.service_code || '').trim();
    if (!code) continue;
    if (!rateByCode.has(code)) rateByCode.set(code, r);
  }
  return out.map((x) => {
    const r = rateByCode.get(x.serviceCode) || null;
    const vis = visibilityByCode.value.get(x.serviceCode);
    return {
      serviceCode: x.serviceCode,
      rateAmount: r ? Number(r.rate_amount) : null,
      visible: vis === undefined ? true : !!vis
    };
  });
});

const visibleRateRows = computed(() => {
  // Show only configured rates, and only those marked visible in the dictionary.
  return (fullRateRows.value || []).filter((r) => r.rateAmount !== null && r.visible);
});

const load = async () => {
  if (!selectedAgencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    openPeriodId.value = null;
    const resp = await api.get(`/payroll/users/${props.userId}/periods`, {
      params: { agencyId: selectedAgencyId.value }
    });
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

const loadComp = async () => {
  if (!selectedAgencyId.value) return;
  try {
    compLoading.value = true;
    compError.value = '';
    hasPayrollAccessForAgency.value = false;
    templateDetails.value = null;
    const [rc, rates, rules, vis, tmpl] = await Promise.all([
      api.get('/payroll/rate-cards', { params: { agencyId: selectedAgencyId.value, userId: props.userId } }),
      api.get('/payroll/rates', { params: { agencyId: selectedAgencyId.value, userId: props.userId } }),
      api.get('/payroll/service-code-rules', { params: { agencyId: selectedAgencyId.value } }),
      api.get('/payroll/rate-sheet-visibility', { params: { agencyId: selectedAgencyId.value, userId: props.userId } }),
      api.get('/payroll/rate-templates', { params: { agencyId: selectedAgencyId.value } })
    ]);
    rateCard.value = rc.data || null;
    perCodeRates.value = rates.data || [];
    serviceCodeRules.value = rules.data || [];
    userRateVisibilityRows.value = vis.data || [];
    templates.value = tmpl.data || [];
    await loadOtherRateTitles();
    await loadSalaryPositions();
    hasPayrollAccessForAgency.value = true;
  } catch (e) {
    compError.value = e.response?.data?.error?.message || e.message || 'Failed to load compensation';
    if (e.response?.status === 401 || e.response?.status === 403) hasPayrollAccessForAgency.value = false;
  } finally {
    compLoading.value = false;
  }
};

const loadPtoAccount = async () => {
  if (!selectedAgencyId.value) return;
  try {
    ptoLoading.value = true;
    ptoError.value = '';
    const [acctResp, polResp] = await Promise.all([
      api.get(`/payroll/users/${props.userId}/pto-account`, { params: { agencyId: selectedAgencyId.value } }),
      api.get('/payroll/pto-policy', { params: { agencyId: selectedAgencyId.value } })
    ]);
    agencyPtoPolicy.value = polResp.data?.policy || null;
    const acct = acctResp.data?.account || acctResp.data || null;
    ptoAccount.value = acct;
    ptoForm.value = {
      employmentType: String(acct?.employment_type || 'hourly'),
      trainingEligible: !!acct?.training_pto_eligible,
      sickStartHours: Number(acct?.sick_start_hours || 0),
      sickStartEffectiveDate: String(acct?.sick_start_effective_date || '').slice(0, 10),
      trainingStartHours: Number(acct?.training_start_hours || 0),
      trainingStartEffectiveDate: String(acct?.training_start_effective_date || '').slice(0, 10)
    };
  } catch (e) {
    ptoError.value = e.response?.data?.error?.message || e.message || 'Failed to load PTO account';
    ptoAccount.value = null;
    agencyPtoPolicy.value = null;
  } finally {
    ptoLoading.value = false;
  }
};

const savePtoAccount = async () => {
  if (!selectedAgencyId.value) return;
  try {
    if (!editingPto.value) return;
    savingPto.value = true;
    ptoError.value = '';
    await api.put(`/payroll/users/${props.userId}/pto-account`, {
      agencyId: selectedAgencyId.value,
      employmentType: ptoForm.value.employmentType,
      trainingPtoEligible: ptoForm.value.trainingEligible ? 1 : 0,
      sickStartHours: Number(ptoForm.value.sickStartHours || 0),
      sickStartEffectiveDate: ptoForm.value.sickStartEffectiveDate || null,
      trainingStartHours: Number(ptoForm.value.trainingStartHours || 0),
      trainingStartEffectiveDate: ptoForm.value.trainingStartEffectiveDate || null
    });
    await loadPtoAccount();
    editingPto.value = false;
  } catch (e) {
    ptoError.value = e.response?.data?.error?.message || e.message || 'Failed to save PTO account';
  } finally {
    savingPto.value = false;
  }
};

const loadTemplate = async () => {
  if (!selectedAgencyId.value || !selectedTemplateId.value) return;
  try {
    compError.value = '';
    const resp = await api.get(`/payroll/rate-templates/${selectedTemplateId.value}`, { params: { agencyId: selectedAgencyId.value } });
    templateDetails.value = resp.data || null;
    renameTemplateName.value = templateDetails.value?.template?.name || '';
  } catch (e) {
    compError.value = e.response?.data?.error?.message || e.message || 'Failed to load template';
  }
};

watch(selectedTemplateId, () => {
  templateDetails.value = null;
});

const beginEditRates = () => {
  if (!canEditRates.value) return;
  editError.value = '';
  editingRates.value = true;

  const next = {};
  for (const row of fullRateRows.value || []) {
    const code = row.serviceCode;
    next[code] = row.rateAmount === null || row.rateAmount === undefined ? '' : String(row.rateAmount);
  }
  rateDraftByCode.value = next;

  const rc = rateCard.value || {};
  rateCardDraft.value = {
    directRate: rc?.direct_rate === null || rc?.direct_rate === undefined ? '' : String(rc.direct_rate),
    indirectRate: rc?.indirect_rate === null || rc?.indirect_rate === undefined ? '' : String(rc.indirect_rate),
    otherRate1: rc?.other_rate_1 === null || rc?.other_rate_1 === undefined ? '' : String(rc.other_rate_1),
    otherRate2: rc?.other_rate_2 === null || rc?.other_rate_2 === undefined ? '' : String(rc.other_rate_2),
    otherRate3: rc?.other_rate_3 === null || rc?.other_rate_3 === undefined ? '' : String(rc.other_rate_3),
    otherBucket1: String(rc?.other_rate_1_bucket || 'other').toLowerCase(),
    otherBucket2: String(rc?.other_rate_2_bucket || 'other').toLowerCase(),
    otherBucket3: String(rc?.other_rate_3_bucket || 'other').toLowerCase()
  };
};

const cancelEditRates = () => {
  editingRates.value = false;
  savingRates.value = false;
  editError.value = '';
  rateDraftByCode.value = {};
};

const saveRates = async () => {
  if (!selectedAgencyId.value || !canEditRates.value) return;
  try {
    savingRates.value = true;
    editError.value = '';

    const toNumOrNull = (s) => {
      const t = String(s ?? '').trim();
      if (!t) return null;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) throw new Error('Rates must be non-negative numbers');
      return n;
    };

    // Save hourly card (best-effort). If left blank, treat as 0.
    const dr = toNumOrNull(rateCardDraft.value.directRate);
    const ir = toNumOrNull(rateCardDraft.value.indirectRate);
    const o1 = toNumOrNull(rateCardDraft.value.otherRate1);
    const o2 = toNumOrNull(rateCardDraft.value.otherRate2);
    const o3 = toNumOrNull(rateCardDraft.value.otherRate3);
    await api.post('/payroll/rate-cards', {
      agencyId: selectedAgencyId.value,
      userId: props.userId,
      directRate: dr ?? 0,
      indirectRate: ir ?? 0,
      otherRate1: o1 ?? 0,
      otherRate2: o2 ?? 0,
      otherRate3: o3 ?? 0,
      otherRate1Bucket: String(rateCardDraft.value.otherBucket1 || 'other').trim().toLowerCase(),
      otherRate2Bucket: String(rateCardDraft.value.otherBucket2 || 'other').trim().toLowerCase(),
      otherRate3Bucket: String(rateCardDraft.value.otherBucket3 || 'other').trim().toLowerCase()
    });

    // listForUser is ordered by service_code ASC, effective_start DESC.
    // Compare against the first (most recent/active) row per code.
    const current = new Map();
    for (const r of perCodeRates.value || []) {
      const code = String(r.service_code || '').trim();
      if (!code || current.has(code)) continue;
      current.set(code, { amount: Number(r.rate_amount) });
    }
    const changes = [];
    const deletes = [];
    const allowedCodes = new Set((fullRateRows.value || []).map((r) => String(r.serviceCode || '').trim()).filter(Boolean));
    // Cleanup orphan per-code overrides for service codes no longer in agency rules.
    for (const code of current.keys()) {
      if (!allowedCodes.has(code)) deletes.push(code);
    }
    for (const [code, val] of Object.entries(rateDraftByCode.value || {})) {
      const trimmedCode = String(code || '').trim();
      if (!trimmedCode) continue;
      if (!allowedCodes.has(trimmedCode)) continue;
      const t = String(val ?? '').trim();
      const prev = current.get(trimmedCode);
      if (!t) {
        // Empty = delete existing override so it disappears from the sheet.
        if (prev) deletes.push(trimmedCode);
        continue;
      }
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) throw new Error('Rates must be non-negative numbers');
      if (!prev || Math.abs(prev.amount - n) > 0.000001) {
        changes.push({ serviceCode: trimmedCode, rateAmount: n });
      }
    }

    const dedupDeletes = Array.from(new Set(deletes));
    await Promise.all([
      ...changes.map((c) =>
        api.post('/payroll/rates', {
          agencyId: selectedAgencyId.value,
          userId: props.userId,
          serviceCode: c.serviceCode,
          rateAmount: c.rateAmount,
          effectiveStart: null,
          effectiveEnd: null
        })
      ),
      ...dedupDeletes.map((serviceCode) =>
        api.delete('/payroll/rates', { params: { agencyId: selectedAgencyId.value, userId: props.userId, serviceCode } })
      )
    ]);

    editingRates.value = false;
    await loadComp();
  } catch (e) {
    editError.value = e.response?.data?.error?.message || e.message || 'Failed to save rates';
  } finally {
    savingRates.value = false;
  }
};

const toggleRuleVisibility = async (serviceCode) => {
  if (!selectedAgencyId.value || !canEditRates.value) return;
  const code = String(serviceCode || '').trim();
  if (!code) return;
  // If no explicit per-user override exists yet, treat as visible by default.
  const currentVisible = visibilityByCode.value.has(code) ? !!visibilityByCode.value.get(code) : true;
  const next = !currentVisible;
  try {
    savingRates.value = true;
    editError.value = '';
    await api.put('/payroll/rate-sheet-visibility', {
      agencyId: selectedAgencyId.value,
      userId: props.userId,
      serviceCode: code,
      showInRateSheet: next ? 1 : 0
    });
    await loadComp();
  } catch (e) {
    editError.value = e.response?.data?.error?.message || e.message || 'Failed to update visibility';
  } finally {
    savingRates.value = false;
  }
};

const applyTemplate = async () => {
  if (!selectedAgencyId.value || !selectedTemplateId.value) return;
  try {
    applyingTemplate.value = true;
    compError.value = '';
    await api.post(`/payroll/rate-templates/${selectedTemplateId.value}/apply`, {
      agencyId: selectedAgencyId.value,
      userId: props.userId
    });
    await loadComp();
  } catch (e) {
    compError.value = e.response?.data?.error?.message || e.message || 'Failed to apply template';
  } finally {
    applyingTemplate.value = false;
  }
};

const createTemplateFromUser = async () => {
  if (!selectedAgencyId.value || !newTemplateName.value) return;
  try {
    creatingTemplate.value = true;
    compError.value = '';
    const resp = await api.post('/payroll/rate-templates/from-user', {
      agencyId: selectedAgencyId.value,
      userId: props.userId,
      name: newTemplateName.value
    });
    newTemplateName.value = '';
    await loadComp();
    const createdId = resp.data?.template?.id || null;
    if (createdId) selectedTemplateId.value = createdId;
  } catch (e) {
    compError.value = e.response?.data?.error?.message || e.message || 'Failed to create template';
    // If the name already exists, auto-select it to reduce friction.
    const existingId = e.response?.data?.existingTemplateId || null;
    if (e.response?.status === 409 && existingId) {
      selectedTemplateId.value = existingId;
      await loadTemplate();
    }
  } finally {
    creatingTemplate.value = false;
  }
};

const deleteTemplate = async () => {
  if (!selectedAgencyId.value || !selectedTemplateId.value) return;
  const ok = window.confirm('Delete this template? This cannot be undone.');
  if (!ok) return;
  try {
    deletingTemplate.value = true;
    compError.value = '';
    await api.delete(`/payroll/rate-templates/${selectedTemplateId.value}`, { params: { agencyId: selectedAgencyId.value } });
    selectedTemplateId.value = null;
    templateDetails.value = null;
    renameTemplateName.value = '';
    await loadComp();
  } catch (e) {
    compError.value = e.response?.data?.error?.message || e.message || 'Failed to delete template';
  } finally {
    deletingTemplate.value = false;
  }
};

const renameTemplate = async () => {
  if (!selectedAgencyId.value || !selectedTemplateId.value || !renameTemplateName.value) return;
  try {
    renamingTemplate.value = true;
    compError.value = '';
    await api.patch(`/payroll/rate-templates/${selectedTemplateId.value}`, {
      agencyId: selectedAgencyId.value,
      name: renameTemplateName.value
    });
    await loadComp();
  } catch (e) {
    compError.value = e.response?.data?.error?.message || e.message || 'Failed to rename template';
  } finally {
    renamingTemplate.value = false;
  }
};

const toggleOpen = (p) => {
  openPeriodId.value = openPeriodId.value === p.id ? null : p.id;
};

watch(
  () => props.userAgencies,
  (agencies) => {
    const nextAgencies = payrollAgencyOptions.value;
    if (!Array.isArray(nextAgencies) || !nextAgencies.length) {
      selectedAgencyId.value = null;
      return;
    }
    const validIds = new Set(nextAgencies.map((a) => a?.id).filter(Boolean));
    // If nothing selected yet, or the current agency isn't valid for this user, pick the first available.
    if (!selectedAgencyId.value || !validIds.has(selectedAgencyId.value)) {
      selectedAgencyId.value = nextAgencies[0].id;
    }
  },
  { immediate: true }
);

// When switching users in-place (same component instance), ensure we reload compensation + titles for the new user.
watch(
  () => props.userId,
  async () => {
    const agencies = payrollAgencyOptions.value;
    const validIds = new Set(agencies.map((a) => a?.id).filter(Boolean));
    if (agencies.length && (!selectedAgencyId.value || !validIds.has(selectedAgencyId.value))) {
      // This will trigger the selectedAgencyId watcher which loads everything.
      selectedAgencyId.value = agencies[0].id;
      return;
    }
    // If agency selection didn't change, force reloads because the userId did.
    await load();
    await loadComp();
    await loadPtoAccount();
  }
);

watch(
  selectedAgencyId,
  async () => {
    await load();
    await loadComp();
    await loadPtoAccount();
  },
  { immediate: true }
);
</script>

<style scoped>
.section-description {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
}
.field {
  margin-bottom: 12px;
}
label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  color: var(--text-primary);
}
select option {
  color: var(--text-primary);
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
.right {
  text-align: right;
}
.title {
  font-weight: 600;
}
.meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}
.muted {
  color: var(--text-secondary);
}
.clickable {
  cursor: pointer;
}
.breakdown-card {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
}
.comp-card {
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
}
.template-card {
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: #fafafa;
}
.template-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.template-title {
  font-weight: 700;
}
.rate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.rate-grid--edit {
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 8px;
}
.rate-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  background: #fff;
}
.rate-item--edit {
  grid-template-columns: auto 1fr;
  align-items: center;
  padding: 6px 10px;
}
.rate-item--hidden {
  background: #f9fafb;
  border-style: dashed;
}
.rate-code {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.code-badge {
  display: inline;
  padding: 0;
  border: none;
  background: transparent;
  font-family: inherit;
  letter-spacing: normal;
}
.rate-value {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.rate-edit {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-primary);
  cursor: pointer;
  flex: 0 0 auto;
}
.icon {
  width: 16px;
  height: 16px;
  fill: currentColor;
}
.mini-select {
  width: 92px;
  padding: 4px 6px;
  font-size: 12px;
}
.mini-input {
  width: 92px;
  text-align: right;
  padding: 4px 6px;
  font-size: 12px;
}
.rate-card-table th,
.rate-card-table td {
  text-align: center;
}
.rate-card-table input {
  width: 110px;
  margin: 0 auto;
  text-align: right;
  padding: 6px 8px;
}
.comp-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.comp-title {
  margin: 0;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.comp-toolbar select {
  width: auto;
  min-width: 220px;
  max-width: 420px;
}
.comp-toolbar .btn {
  flex: 0 0 auto;
  width: auto;
}
.comp-subtoolbar {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.comp-subgroup {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.comp-subgroup input {
  width: 240px;
  max-width: 100%;
}
.comp-subgroup .btn {
  flex: 0 0 auto;
  width: auto;
  white-space: nowrap;
}

.settings-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

@media (min-width: 980px) {
  .settings-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
  }
}

.settings-card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
}

.settings-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.btn {
  padding: 6px 10px;
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
input {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: white;
  color: var(--text-primary);
}
.breakdown-title {
  margin: 0 0 10px 0;
}
.breakdown-grid {
  display: grid;
  gap: 6px;
}
.breakdown-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.code {
  font-weight: 600;
}
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
}
.loading {
  color: var(--text-secondary);
}
</style>

