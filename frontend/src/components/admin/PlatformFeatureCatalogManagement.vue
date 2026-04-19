<template>
  <div class="feature-catalog">
    <header class="catalog-header">
      <div>
        <h2>Feature Catalog &amp; Pricing</h2>
        <p class="muted">
          Set the platform-wide default monthly price for every feature on each axis. Each tenant inherits these
          values unless they have a per-tenant override under
          <strong>Tenant settings → Features</strong>. Changes here do not retroactively re-bill prior periods.
        </p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn-secondary" @click="reload" :disabled="loading">Reload</button>
        <button type="button" class="btn-primary" @click="save" :disabled="loading || saving">
          {{ saving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="successMessage" class="success-banner">{{ successMessage }}</div>

    <div v-if="loading" class="muted" style="padding: 16px;">Loading…</div>

    <div v-else class="feature-table-wrap">
      <table class="feature-table">
        <thead>
          <tr>
            <th>Feature</th>
            <th>Tenant $/mo</th>
            <th>Bill per user</th>
            <th>Per-user $/mo</th>
            <th>Min pro-ration days</th>
            <th>Available by default</th>
            <th>Tenant self-serve</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="feature in features" :key="feature.key">
            <td class="feature-cell">
              <div class="feature-label">{{ feature.label }}</div>
              <div class="feature-meta">
                <code class="key">{{ feature.key }}</code>
                <span v-if="feature.featureFlagKey" class="muted">flag: {{ feature.featureFlagKey }}</span>
              </div>
              <div v-if="feature.description" class="muted" style="margin-top: 4px;">{{ feature.description }}</div>
            </td>
            <td>
              <div class="money-input">
                <span class="prefix">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="feature.tenantMonthlyDollars"
                  @blur="normalizeRow(feature)"
                />
              </div>
            </td>
            <td class="center">
              <input type="checkbox" v-model="feature.perUserBillable" @change="onToggleUserBillable(feature)" />
            </td>
            <td>
              <div class="money-input">
                <span class="prefix">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="feature.userMonthlyDollars"
                  :disabled="!feature.perUserBillable"
                  @blur="normalizeRow(feature)"
                />
              </div>
            </td>
            <td>
              <input type="number" min="0" max="366" step="1" v-model.number="feature.minProrationDays" />
            </td>
            <td class="center"><input type="checkbox" v-model="feature.defaultAvailable" /></td>
            <td class="center"><input type="checkbox" v-model="feature.tenantSelfServe" /></td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="muted small">
      <strong>Pro-ration:</strong> when a tenant or user enables a feature mid-period, the charge is the daily share of
      the monthly price multiplied by enabled days. If a feature was on for fewer days than its pro-ration floor,
      the floor is applied per enable cycle to prevent rapid on/off gaming.
    </p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import api from '../../services/api';

const features = ref([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const successMessage = ref('');

function centsToDollars(cents) {
  if (!cents) return 0;
  return Math.round(Number(cents)) / 100;
}

function dollarsToCents(d) {
  if (d == null || d === '') return 0;
  const n = Number(d);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function fromCatalogEntry(entry) {
  return {
    key: entry.key,
    label: entry.label,
    description: entry.description || '',
    pricingModel: entry.pricingModel || 'flat_monthly',
    featureFlagKey: entry.featureFlagKey || null,
    tenantMonthlyDollars: centsToDollars(entry.tenantMonthlyCents || 0),
    userMonthlyDollars: centsToDollars(entry.userMonthlyCents || 0),
    perUserBillable: !!entry.perUserBillable || (entry.userMonthlyCents > 0),
    minProrationDays: Number(entry.minProrationDays || 0),
    defaultAvailable: !!entry.defaultAvailable,
    tenantSelfServe: entry.tenantSelfServe !== false,
    unitLabel: entry.unitLabel || 'month',
    unitAmountCents: Number(entry.unitAmountCents || 0)
  };
}

function toPayloadEntry(row) {
  return {
    label: row.label,
    description: row.description,
    pricingModel: row.pricingModel,
    featureFlagKey: row.featureFlagKey,
    tenantMonthlyCents: dollarsToCents(row.tenantMonthlyDollars),
    userMonthlyCents: row.perUserBillable ? dollarsToCents(row.userMonthlyDollars) : 0,
    perUserBillable: !!row.perUserBillable,
    minProrationDays: Math.max(0, Math.min(366, Number(row.minProrationDays || 0))),
    defaultAvailable: !!row.defaultAvailable,
    tenantSelfServe: !!row.tenantSelfServe,
    unitLabel: row.unitLabel,
    unitAmountCents: Number(row.unitAmountCents || 0)
  };
}

function normalizeRow(row) {
  if (!row.perUserBillable) row.userMonthlyDollars = 0;
  if (row.tenantMonthlyDollars < 0) row.tenantMonthlyDollars = 0;
  if (row.userMonthlyDollars < 0) row.userMonthlyDollars = 0;
  if (row.minProrationDays < 0) row.minProrationDays = 0;
  if (row.minProrationDays > 366) row.minProrationDays = 366;
}

function onToggleUserBillable(row) {
  if (!row.perUserBillable) row.userMonthlyDollars = 0;
}

const reload = async () => {
  loading.value = true;
  error.value = '';
  successMessage.value = '';
  try {
    const res = await api.get('/billing/pricing/default');
    const catalog = res.data?.featureCatalog || res.data?.pricing?.featureCatalog || {};
    features.value = Object.values(catalog)
      .map(fromCatalogEntry)
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load feature catalog';
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  saving.value = true;
  error.value = '';
  successMessage.value = '';
  try {
    const platformRes = await api.get('/billing/pricing/default');
    const currentPricing = platformRes.data?.pricing || {};
    const featureCatalogPayload = {};
    for (const row of features.value) featureCatalogPayload[row.key] = toPayloadEntry(row);
    const nextPricing = { ...currentPricing, featureCatalog: featureCatalogPayload };
    await api.put('/billing/pricing/default', { pricing: nextPricing });
    await reload();
    successMessage.value = 'Saved.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save feature catalog';
  } finally {
    saving.value = false;
  }
};

onMounted(reload);
</script>

<style scoped>
.feature-catalog {
  padding: 16px 4px 24px;
  max-width: 1200px;
}
.catalog-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.catalog-header h2 {
  margin: 0 0 6px 0;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.btn-primary {
  background: var(--primary, #059669);
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary {
  background: transparent;
  border: 1px solid var(--border, #d1d5db);
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
}
.muted { color: var(--text-secondary, #6b7280); font-size: 13px; }
.muted.small { font-size: 12px; margin-top: 12px; }
.error-banner {
  background: #fee2e2;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 8px 0;
  font-size: 13px;
}
.success-banner {
  background: #dcfce7;
  color: #166534;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 8px 0;
  font-size: 13px;
}
.feature-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
}
.feature-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.feature-table th, .feature-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  vertical-align: top;
  text-align: left;
}
.feature-table th { background: #f9fafb; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; }
.feature-table tr:last-child td { border-bottom: none; }
.feature-cell { max-width: 320px; }
.feature-label { font-weight: 600; color: var(--text-primary, #111827); }
.feature-meta { display: flex; gap: 8px; align-items: center; margin-top: 2px; flex-wrap: wrap; }
.feature-meta .key { background: #f3f4f6; padding: 1px 6px; border-radius: 4px; font-size: 11px; color: #4b5563; }
.center { text-align: center; }
.money-input {
  display: inline-flex;
  align-items: center;
  background: white;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 0 6px;
}
.money-input .prefix { color: #6b7280; font-size: 12px; padding-right: 4px; }
.money-input input { border: none; outline: none; padding: 6px 0; width: 80px; font-size: 13px; }
input[type='number'] {
  background: white;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 6px 8px;
  width: 80px;
  font-size: 13px;
}
input[type='number']:disabled { background: #f3f4f6; color: #9ca3af; }
</style>
