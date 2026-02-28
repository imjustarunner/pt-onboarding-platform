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
        Master reference for service-code-based equivalency. Total Included Span = Direct Included Max + Admin Included Max.
        Excess direct/indirect time beyond these limits is paid at the provider's rates.
      </div>
      <div v-if="excessError" class="warn">{{ excessError }}</div>
      <div v-if="excessLoading" class="muted">Loading…</div>
      <div v-else class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Service Code</th>
              <th class="right">Direct Min (mins)</th>
              <th class="right">Direct Included Max (mins)</th>
              <th class="right">Admin Included Max (mins)</th>
              <th class="right">Total Included Span</th>
              <th class="right">Credit Value</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in excessRules" :key="r.service_code">
              <td><strong>{{ r.service_code }}</strong></td>
              <td class="right">
                <input v-model.number="excessDraft[r.service_code].directServiceMinimum" type="number" min="0" style="width: 70px;" />
              </td>
              <td class="right">
                <input v-model.number="excessDraft[r.service_code].directServiceIncludedMax" type="number" min="0" style="width: 80px;" />
              </td>
              <td class="right">
                <input v-model.number="excessDraft[r.service_code].adminIncludedMax" type="number" min="0" style="width: 80px;" />
              </td>
              <td class="right">{{ (excessDraft[r.service_code]?.directServiceIncludedMax || 0) + (excessDraft[r.service_code]?.adminIncludedMax || 0) }}</td>
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
              <td colspan="7" class="empty-state-inline">No excess compensation rules yet. Add one below.</td>
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
          <label class="filters-label">Direct Included Max (mins)</label>
          <input v-model.number="newExcessDirectMax" class="filters-input" type="number" min="0" placeholder="0" />
        </div>
        <div class="filters-group">
          <label class="filters-label">Admin Included Max (mins)</label>
          <input v-model.number="newExcessAdminMax" class="filters-input" type="number" min="0" placeholder="0" />
        </div>
        <div class="filters-group">
          <button type="button" class="btn btn-primary btn-sm" @click="addExcessRule" :disabled="!newExcessServiceCode || excessAdding">
            {{ excessAdding ? 'Adding…' : 'Add' }}
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const agencyStore = useAgencyStore();
const agencyId = computed(() => agencyStore.currentAgency?.id || null);

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
const newExcessDirectMax = ref(0);
const newExcessAdminMax = ref(0);

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
        directServiceMinimum: Number(r.direct_service_minimum || 0),
        directServiceIncludedMax: Number(r.direct_service_included_max || 0),
        adminIncludedMax: Number(r.admin_included_max || 0),
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
      directServiceMinimum: Number(d.directServiceMinimum ?? 0),
      directServiceIncludedMax: Number(d.directServiceIncludedMax ?? 0),
      adminIncludedMax: Number(d.adminIncludedMax ?? 0),
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

const addExcessRule = async () => {
  const code = String(newExcessServiceCode.value || '').trim();
  if (!agencyId.value || !code) return;
  try {
    excessAdding.value = true;
    excessError.value = '';
    await api.post('/payroll/excess-compensation-rules', {
      agencyId: agencyId.value,
      serviceCode: code,
      directServiceMinimum: 0,
      directServiceIncludedMax: Number(newExcessDirectMax.value ?? 0),
      adminIncludedMax: Number(newExcessAdminMax.value ?? 0),
      creditValue: 0
    });
    newExcessServiceCode.value = '';
    newExcessDirectMax.value = 0;
    newExcessAdminMax.value = 0;
    await loadExcessRules();
  } catch (e) {
    excessError.value = e.response?.data?.error?.message || e.message || 'Failed to add';
  } finally {
    excessAdding.value = false;
  }
};

watch(agencyId, async () => {
  await load();
}, { immediate: true });
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
</style>

