<template>
  <div class="container">
    <div class="page-header">
      <div>
        <h1>Payroll</h1>
        <p class="subtitle">Import service-code units—with rates—to compute pay per period.</p>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="grid">
      <div class="card">
        <h2 class="card-title">Pay Periods</h2>

        <div class="field-row">
          <div class="field">
            <label>Start</label>
            <input v-model="newPeriodStart" type="date" />
          </div>
          <div class="field">
            <label>End</label>
            <input v-model="newPeriodEnd" type="date" />
          </div>
          <div class="field">
            <label>Label (optional)</label>
            <input v-model="newPeriodLabel" type="text" placeholder="2026-01-01 to 2026-01-15" />
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-primary" @click="createPeriod" :disabled="creating || !agencyId">
            {{ creating ? 'Creating...' : 'Create Pay Period' }}
          </button>
          <div class="hint" v-if="!agencyId">Select an organization first.</div>
        </div>

        <div class="list">
          <button
            v-for="p in periods"
            :key="p.id"
            class="list-item"
            :class="{ active: selectedPeriodId === p.id }"
            @click="selectPeriod(p.id)"
          >
            <div class="list-item-title">{{ p.label }}</div>
            <div class="list-item-meta">{{ p.period_start }} → {{ p.period_end }} • {{ p.status }}</div>
          </button>
        </div>
      </div>

      <div class="card" v-if="selectedPeriod">
        <h2 class="card-title">Period Details</h2>
        <div class="period-meta">
          <div><strong>Label:</strong> {{ selectedPeriod.label }}</div>
          <div><strong>Dates:</strong> {{ selectedPeriod.period_start }} → {{ selectedPeriod.period_end }}</div>
        </div>

        <div class="import-box">
          <div class="import-title">Import CSV</div>
          <div class="import-subtitle">
            Expected columns (flexible): Provider Name, Service Code, Units.
          </div>
          <input type="file" accept=".csv,text/csv" @change="onFilePick" />
          <button class="btn btn-primary" @click="uploadCsv" :disabled="importing || !importFile">
            {{ importing ? 'Importing...' : 'Import & Recompute' }}
          </button>
          <div v-if="unmatchedProviders.length" class="warn-box">
            <div><strong>Unmatched providers</strong> (name didn’t map to a user in this org):</div>
            <ul>
              <li v-for="(n, idx) in unmatchedProviders" :key="idx">{{ n }}</li>
            </ul>
            <div class="hint">Tip: update the CSV provider names to match user first+last names.</div>
          </div>
        </div>

        <h3 class="section-title">Computed Pay</h3>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Provider</th>
                <th class="right">Units</th>
                <th class="right">Subtotal</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in summaries" :key="s.id" @click="selectSummary(s)" class="clickable">
                <td>{{ s.first_name }} {{ s.last_name }}</td>
                <td class="right">{{ fmtNum(s.total_units) }}</td>
                <td class="right">{{ fmtMoney(s.subtotal_amount) }}</td>
                <td class="right">{{ fmtMoney(s.total_amount) }}</td>
              </tr>
              <tr v-if="!summaries.length">
                <td colspan="4" class="muted">No summaries yet. Import a CSV first.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="selectedSummary" class="rates-box">
          <h3 class="section-title">Rates & Breakdown ({{ selectedSummary.first_name }} {{ selectedSummary.last_name }})</h3>

          <div class="breakdown">
            <div v-for="(v, code) in selectedSummary.breakdown || {}" :key="code" class="breakdown-row">
              <div class="code">{{ code }}</div>
              <div class="muted">{{ fmtNum(v.units) }} units</div>
              <div class="muted">@ {{ fmtMoney(v.rateAmount) }}</div>
              <div class="right">{{ fmtMoney(v.amount) }}</div>
            </div>
            <div v-if="!selectedSummary.breakdown || !Object.keys(selectedSummary.breakdown).length" class="muted">
              No breakdown available.
            </div>
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
            <button class="btn btn-secondary" @click="saveRate" :disabled="savingRate || !rateServiceCode">
              {{ savingRate ? 'Saving...' : 'Save Rate' }}
            </button>
            <div class="hint">After saving, re-import (or add a recompute button later) to refresh totals.</div>
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-secondary" @click="requestAdpExport" :disabled="exporting">
            {{ exporting ? 'Requesting...' : 'Request ADP Export (stub)' }}
          </button>
        </div>
      </div>

      <div class="card" v-else>
        <h2 class="card-title">Period Details</h2>
        <div class="muted">Select a pay period to import CSV and view computed pay.</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || null;
});

const periods = ref([]);
const selectedPeriodId = ref(null);
const selectedPeriod = ref(null);
const summaries = ref([]);
const error = ref('');

const newPeriodStart = ref('');
const newPeriodEnd = ref('');
const newPeriodLabel = ref('');
const creating = ref(false);

const importFile = ref(null);
const importing = ref(false);
const unmatchedProviders = ref([]);

const selectedSummary = ref(null);
const rateServiceCode = ref('');
const rateAmount = ref('');
const savingRate = ref(false);
const exporting = ref(false);

const fmtMoney = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};
const fmtNum = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const loadPeriods = async () => {
  if (!agencyId.value) return;
  const resp = await api.get('/payroll/periods', { params: { agencyId: agencyId.value } });
  periods.value = resp.data || [];
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
  const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}`);
  selectedPeriod.value = resp.data?.period || null;
  summaries.value = (resp.data?.summaries || []).map((s) => {
    if (typeof s.breakdown === 'string') {
      try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
    }
    return s;
  });
};

const createPeriod = async () => {
  try {
    error.value = '';
    creating.value = true;
    const resp = await api.post('/payroll/periods', {
      agencyId: agencyId.value,
      label: newPeriodLabel.value || null,
      periodStart: newPeriodStart.value,
      periodEnd: newPeriodEnd.value
    });
    newPeriodLabel.value = '';
    await loadPeriods();
    await selectPeriod(resp.data.id);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to create pay period';
  } finally {
    creating.value = false;
  }
};

const onFilePick = (evt) => {
  importFile.value = evt.target.files?.[0] || null;
};

const uploadCsv = async () => {
  try {
    error.value = '';
    importing.value = true;
    unmatchedProviders.value = [];
    const fd = new FormData();
    fd.append('file', importFile.value);
    const resp = await api.post(`/payroll/periods/${selectedPeriodId.value}/import`, fd);
    unmatchedProviders.value = resp.data?.unmatchedProvidersSample || [];
    importFile.value = null;
    await loadPeriodDetails();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to import CSV';
  } finally {
    importing.value = false;
  }
};

const selectSummary = (s) => {
  selectedSummary.value = s;
};

const saveRate = async () => {
  try {
    if (!selectedSummary.value) return;
    savingRate.value = true;
    error.value = '';
    await api.post('/payroll/rates', {
      agencyId: agencyId.value,
      userId: selectedSummary.value.user_id,
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

const requestAdpExport = async () => {
  try {
    exporting.value = true;
    error.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/adp/export`);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to request ADP export';
  } finally {
    exporting.value = false;
  }
};

watch(agencyId, async () => {
  selectedPeriodId.value = null;
  selectedPeriod.value = null;
  summaries.value = [];
  await loadPeriods();
});

onMounted(async () => {
  await loadPeriods();
});
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
.code {
  font-weight: 600;
}
.rate-editor .field-row {
  grid-template-columns: 1fr 1fr;
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

