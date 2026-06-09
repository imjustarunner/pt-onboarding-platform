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

watch(agencyId, async () => {
  await load();
  if (payrollTab.value === 'time_claims') await loadTimeClaimSettings();
  if (payrollTab.value === 'percent_pay') await loadPercentPay();
}, { immediate: true });

watch(payrollTab, async (t) => {
  if (t === 'time_claims') await loadTimeClaimSettings();
  if (t === 'percent_pay') await loadPercentPay();
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
</style>

