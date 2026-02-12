<template>
  <div class="guardian-billing">
    <div class="billing-head">
      <div>
        <div class="billing-title">Learning Program Billing</div>
        <div class="billing-sub">Session charges, balances, and payment status for this child.</div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading || !agencyId || !clientId">
        Refresh
      </button>
    </div>

    <div v-if="!clientId" class="hint">Select a child to view billing.</div>
    <div v-else-if="loading" class="hint">Loading billing…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <div class="payment-methods card">
        <div class="payment-head">
          <div class="payment-title">Card on file</div>
          <button class="btn btn-secondary btn-sm" type="button" @click="showAddMethod = !showAddMethod">
            {{ showAddMethod ? 'Close' : 'Add card' }}
          </button>
        </div>
        <div v-if="paymentMethods.length === 0" class="hint">No payment method on file.</div>
        <div v-else class="payment-list">
          <div v-for="m in paymentMethods" :key="`pm-${m.id}`" class="pm-item">
            <div>
              <strong>{{ m.card_brand || 'Card' }} •••• {{ m.last4 || '----' }}</strong>
              <div class="hint">Exp {{ m.exp_month || '--' }}/{{ m.exp_year || '----' }}</div>
            </div>
            <div class="pm-actions">
              <span v-if="m.is_default" class="pill-default">Default</span>
              <button
                v-else
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="settingDefaultMethodId === Number(m.id)"
                @click="setDefaultMethod(m.id)"
              >
                {{ settingDefaultMethodId === Number(m.id) ? 'Setting…' : 'Set default' }}
              </button>
            </div>
          </div>
        </div>
        <div v-if="showAddMethod" class="add-method-form">
          <input v-model="addMethod.brand" class="input" placeholder="Card brand (e.g. Visa)" />
          <input v-model="addMethod.last4" class="input" placeholder="Last 4 digits" maxlength="4" />
          <input v-model.number="addMethod.expMonth" type="number" class="input" min="1" max="12" placeholder="MM" />
          <input v-model.number="addMethod.expYear" type="number" class="input" min="2024" max="2100" placeholder="YYYY" />
          <button class="btn btn-primary btn-sm" type="button" :disabled="addingMethod" @click="addPlaceholderMethod">
            {{ addingMethod ? 'Adding…' : 'Save card' }}
          </button>
        </div>
      </div>

      <div class="summary">
        <div class="summary-item">
          <div class="k">Outstanding</div>
          <div class="v">{{ formatMoney(outstandingCents) }}</div>
        </div>
        <div class="summary-item">
          <div class="k">Total charges</div>
          <div class="v">{{ ledger.length }}</div>
        </div>
        <div class="summary-item">
          <div class="k">Individual tokens</div>
          <div class="v">{{ tokenBalance.individualTokens }}</div>
        </div>
        <div class="summary-item">
          <div class="k">Group tokens</div>
          <div class="v">{{ tokenBalance.groupTokens }}</div>
        </div>
      </div>

      <div class="card">
        <div class="payment-head">
          <div class="payment-title">Subscriptions</div>
        </div>
        <div v-if="subscriptions.length === 0" class="hint">No active or historical subscriptions.</div>
        <div v-else class="subscription-list">
          <div v-for="s in subscriptions" :key="`sub-${s.id}`" class="pm-item">
            <div>
              <strong>{{ s.plan_name || `Plan ${s.plan_id}` }}</strong>
              <div class="hint">Status: {{ s.status }} • {{ fmtDateTime(s.current_period_start) }} - {{ fmtDateTime(s.current_period_end) }}</div>
            </div>
            <div class="pm-actions">
              <button
                v-if="String(s.status).toUpperCase() === 'ACTIVE'"
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="updatingSubscriptionId === Number(s.id)"
                @click="updateSubscriptionStatus(s.id, 'PAUSED')"
              >
                {{ updatingSubscriptionId === Number(s.id) ? 'Updating…' : 'Pause' }}
              </button>
              <button
                v-if="String(s.status).toUpperCase() !== 'CANCELLED'"
                class="btn btn-secondary btn-sm"
                type="button"
                :disabled="updatingSubscriptionId === Number(s.id)"
                @click="updateSubscriptionStatus(s.id, 'CANCELLED')"
              >
                {{ updatingSubscriptionId === Number(s.id) ? 'Updating…' : 'Cancel' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="payment-head">
          <div class="payment-title">Token history</div>
        </div>
        <div v-if="tokenLedgerEntries.length === 0" class="hint">No token activity yet.</div>
        <table v-else class="ledger-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Direction</th>
              <th>Qty</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tokenLedgerEntries" :key="`tle-${t.id}`">
              <td>{{ fmtDateTime(t.effective_at || t.created_at) }}</td>
              <td>{{ t.token_type || 'INDIVIDUAL' }}</td>
              <td>{{ t.direction || '-' }}</td>
              <td>{{ t.quantity || 0 }}</td>
              <td>{{ t.reason_code || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!ledger.length" class="hint">No charges yet.</div>
      <table v-else class="ledger-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Type</th>
            <th>Status</th>
            <th>Amount</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="x in ledger" :key="`chg-${x.id}`">
            <td>{{ fmtDateTime(x.scheduled_start_at || x.created_at) }}</td>
            <td>{{ String(x.charge_type || 'SESSION_FEE').replaceAll('_', ' ') }}</td>
            <td>{{ x.charge_status || 'PENDING' }}</td>
            <td>{{ formatMoney(x.total_cents) }}</td>
            <td>
              <button
                v-if="isPayableStatus(x.charge_status)"
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="payingChargeId === Number(x.id)"
                @click="payNow(x)"
              >
                {{ payingChargeId === Number(x.id) ? 'Processing…' : 'Pay now' }}
              </button>
              <span v-else class="hint">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  clientId: { type: [Number, String], default: null }
});

const loading = ref(false);
const error = ref('');
const ledger = ref([]);
const outstandingCents = ref(0);
const payingChargeId = ref(0);
const paymentMethods = ref([]);
const tokenBalance = ref({ individualTokens: 0, groupTokens: 0 });
const tokenLedgerEntries = ref([]);
const subscriptions = ref([]);
const updatingSubscriptionId = ref(0);
const showAddMethod = ref(false);
const addingMethod = ref(false);
const settingDefaultMethodId = ref(0);
const addMethod = ref({
  brand: '',
  last4: '',
  expMonth: null,
  expYear: null
});

const fmtDateTime = (v) => {
  if (!v) return '-';
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
};
const formatMoney = (cents) => {
  const value = Number(cents || 0) / 100;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
};
const isPayableStatus = (status) => ['PENDING', 'AUTHORIZED', 'FAILED'].includes(String(status || '').toUpperCase());

const payNow = async (charge) => {
  const aid = Number(props.agencyId || 0);
  const chargeId = Number(charge?.id || 0);
  if (!aid || !chargeId) return;
  try {
    payingChargeId.value = chargeId;
    const intent = await api.post('/learning-billing/payments/intent', {
      agencyId: aid,
      chargeId
    });
    const paymentId = Number(intent?.data?.paymentId || 0);
    if (!paymentId) throw new Error('Missing payment id');
    await api.post(`/learning-billing/payments/${paymentId}/attempts`, {
      status: 'SUCCESS',
      requestPayload: { source: 'guardian_billing_tab' },
      responsePayload: { processor: 'PLACEHOLDER' }
    });
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Payment attempt failed';
  } finally {
    payingChargeId.value = 0;
  }
};

const loadPaymentMethods = async () => {
  const aid = Number(props.agencyId || 0);
  const cid = Number(props.clientId || 0);
  if (!aid) {
    paymentMethods.value = [];
    return;
  }
  try {
    const resp = await api.get('/learning-billing/payment-methods', {
      params: { agencyId: aid, clientId: cid || undefined }
    });
    paymentMethods.value = Array.isArray(resp.data?.methods) ? resp.data.methods : [];
  } catch {
    paymentMethods.value = [];
  }
};

const loadTokenBalance = async () => {
  const aid = Number(props.agencyId || 0);
  const cid = Number(props.clientId || 0);
  if (!aid || !cid) {
    tokenBalance.value = { individualTokens: 0, groupTokens: 0 };
    return;
  }
  try {
    const resp = await api.get(`/learning-billing/clients/${cid}/tokens`, { params: { agencyId: aid } });
    tokenBalance.value = {
      individualTokens: Number(resp.data?.individualTokens || 0),
      groupTokens: Number(resp.data?.groupTokens || 0)
    };
  } catch {
    tokenBalance.value = { individualTokens: 0, groupTokens: 0 };
  }
};

const loadTokenLedger = async () => {
  const aid = Number(props.agencyId || 0);
  const cid = Number(props.clientId || 0);
  if (!aid || !cid) {
    tokenLedgerEntries.value = [];
    return;
  }
  try {
    const resp = await api.get(`/learning-billing/clients/${cid}/token-ledger`, { params: { agencyId: aid } });
    tokenLedgerEntries.value = Array.isArray(resp.data?.entries) ? resp.data.entries : [];
  } catch {
    tokenLedgerEntries.value = [];
  }
};

const loadSubscriptions = async () => {
  const aid = Number(props.agencyId || 0);
  const cid = Number(props.clientId || 0);
  if (!aid || !cid) {
    subscriptions.value = [];
    return;
  }
  try {
    const resp = await api.get(`/learning-billing/clients/${cid}/subscriptions`, { params: { agencyId: aid } });
    subscriptions.value = Array.isArray(resp.data?.subscriptions) ? resp.data.subscriptions : [];
  } catch {
    subscriptions.value = [];
  }
};

const updateSubscriptionStatus = async (subscriptionId, status) => {
  const sid = Number(subscriptionId || 0);
  const st = String(status || '').toUpperCase();
  if (!sid || !st) return;
  try {
    updatingSubscriptionId.value = sid;
    await api.post(`/learning-billing/subscriptions/${sid}/status`, { status: st });
    await loadSubscriptions();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update subscription';
  } finally {
    updatingSubscriptionId.value = 0;
  }
};

const addPlaceholderMethod = async () => {
  const aid = Number(props.agencyId || 0);
  const cid = Number(props.clientId || 0);
  if (!aid) return;
  try {
    addingMethod.value = true;
    error.value = '';
    await api.post('/learning-billing/payment-methods/placeholder', {
      agencyId: aid,
      ownerClientId: cid || undefined,
      cardBrand: String(addMethod.value.brand || '').trim(),
      last4: String(addMethod.value.last4 || '').trim(),
      expMonth: Number(addMethod.value.expMonth || 0) || undefined,
      expYear: Number(addMethod.value.expYear || 0) || undefined,
      isDefault: true
    });
    addMethod.value = { brand: '', last4: '', expMonth: null, expYear: null };
    showAddMethod.value = false;
    await loadPaymentMethods();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save card';
  } finally {
    addingMethod.value = false;
  }
};

const setDefaultMethod = async (methodId) => {
  const aid = Number(props.agencyId || 0);
  const mid = Number(methodId || 0);
  if (!aid || !mid) return;
  try {
    settingDefaultMethodId.value = mid;
    await api.post(`/learning-billing/payment-methods/${mid}/default`, { agencyId: aid });
    await loadPaymentMethods();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to set default card';
  } finally {
    settingDefaultMethodId.value = 0;
  }
};

const load = async () => {
  const aid = Number(props.agencyId || 0);
  const cid = Number(props.clientId || 0);
  if (!aid || !cid) {
    ledger.value = [];
    outstandingCents.value = 0;
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    await loadPaymentMethods();
    await loadTokenBalance();
    await loadTokenLedger();
    await loadSubscriptions();
    const r = await api.get(`/learning-billing/clients/${cid}/ledger`, {
      params: { agencyId: aid }
    });
    ledger.value = Array.isArray(r.data?.ledger) ? r.data.ledger : [];
    outstandingCents.value = ledger.value
      .filter((x) => ['PENDING', 'AUTHORIZED', 'FAILED'].includes(String(x.charge_status || '').toUpperCase()))
      .reduce((sum, x) => sum + Number(x.total_cents || 0), 0);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load billing';
    ledger.value = [];
    outstandingCents.value = 0;
  } finally {
    loading.value = false;
  }
};

watch(() => [props.agencyId, props.clientId], () => {
  void load();
}, { immediate: true });
</script>

<style scoped>
.guardian-billing { display: flex; flex-direction: column; gap: 12px; }
.card { border: 1px solid var(--border); border-radius: 10px; background: white; padding: 10px; }
.payment-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.payment-title { font-weight: 800; color: var(--text-primary); }
.payment-list { display: flex; flex-direction: column; gap: 8px; }
.pm-item { border: 1px solid var(--border); border-radius: 8px; padding: 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.pm-actions { display: flex; align-items: center; gap: 8px; }
.pill-default { display: inline-flex; align-items: center; border: 1px solid rgba(16,185,129,0.4); color: #047857; background: rgba(16,185,129,0.12); border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 700; }
.add-method-form { display: grid; grid-template-columns: 1.3fr 1fr 0.6fr 0.8fr auto; gap: 8px; margin-top: 8px; }
.input { border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-size: 13px; }
.billing-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.billing-title { font-weight: 800; color: var(--text-primary); }
.billing-sub { color: var(--text-secondary); font-size: 13px; }
.hint { color: var(--text-secondary); }
.error { color: #b91c1c; }
.summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.summary-item { border: 1px solid var(--border); border-radius: 10px; padding: 10px; background: white; }
.k { color: var(--text-secondary); font-size: 12px; }
.v { font-weight: 800; color: var(--text-primary); margin-top: 4px; }
.ledger-table { width: 100%; border-collapse: collapse; background: white; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.ledger-table th, .ledger-table td { padding: 8px; border-bottom: 1px solid var(--border); text-align: left; font-size: 13px; }
.ledger-table th { background: var(--bg-alt); font-weight: 800; color: var(--text-primary); }
</style>
