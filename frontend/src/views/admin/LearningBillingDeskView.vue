<template>
  <div class="container learning-billing-desk">
    <div class="header">
      <div>
        <h1 style="margin: 0;">Learning Billing Desk</h1>
        <div class="subtitle">Front-desk/admin billing visibility for learning program participants.</div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary" type="button" @click="runRenewalsNow" :disabled="runningRenewals || !agencyId">
          {{ runningRenewals ? 'Running renewals…' : 'Run due renewals' }}
        </button>
        <button class="btn btn-secondary" type="button" @click="loadParticipants" :disabled="loading || !agencyId">
          Refresh
        </button>
      </div>
    </div>

    <div v-if="!agencyId" class="hint">Select an agency context first.</div>
    <div v-else-if="loading" class="hint">Loading participants…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <div class="layout">
        <div class="left">
          <div class="panel-title">Participants</div>
          <div class="list">
            <button
              v-for="p in participants"
              :key="`p-${p.client_id}`"
              class="item"
              :class="{ active: Number(selectedClientId) === Number(p.client_id) }"
              @click="selectClient(p.client_id)"
            >
              <div class="name">{{ p.client_name }}</div>
              <div class="meta">Outstanding {{ money(p.outstanding_cents) }} • {{ p.charge_count }} charges</div>
            </button>
          </div>
        </div>
        <div class="right">
          <div class="panel-title">Ledger</div>
          <div v-if="!selectedClientId" class="hint">Select a participant to view charges.</div>
          <div v-else-if="ledgerLoading" class="hint">Loading ledger…</div>
          <div v-else class="token-tools">
            <div class="token-balance">
              Tokens: <strong>{{ tokenBalance.individualTokens }}</strong> individual,
              <strong>{{ tokenBalance.groupTokens }}</strong> group
            </div>
            <div class="token-credit-form">
              <select v-model="creditTokenType" class="select-sm">
                <option value="INDIVIDUAL">Individual</option>
                <option value="GROUP">Group</option>
              </select>
              <input v-model.number="creditQuantity" type="number" min="1" class="qty-input" />
              <button class="btn btn-secondary btn-sm" type="button" :disabled="creditingTokens" @click="creditTokens">
                {{ creditingTokens ? 'Crediting…' : 'Credit tokens' }}
              </button>
            </div>
          </div>
          <div v-if="selectedClientId && !ledgerLoading" class="subscription-tools">
            <div class="subscription-header">
              <div class="token-balance">
                Subscriptions: {{ subscriptions.length }}
              </div>
              <div class="subscription-create">
                <select v-model.number="selectedPlanId" class="select-sm">
                  <option :value="0">Select plan…</option>
                  <option v-for="p in subscriptionPlans" :key="`plan-${p.id}`" :value="Number(p.id)">
                    {{ p.name }}
                  </option>
                </select>
                <button class="btn btn-secondary btn-sm" type="button" :disabled="creatingSubscription || !selectedPlanId" @click="createSubscription">
                  {{ creatingSubscription ? 'Creating…' : 'Create subscription' }}
                </button>
              </div>
            </div>
            <div v-if="subscriptions.length" class="subscription-list">
              <div v-for="s in subscriptions" :key="`sub-${s.id}`" class="subscription-item">
                <div>
                  <strong>{{ s.plan_name || `Plan ${s.plan_id}` }}</strong>
                  <div class="hint">Status: {{ s.status }} • Period: {{ fmtDate(s.current_period_start) }} - {{ fmtDate(s.current_period_end) }}</div>
                </div>
                <div class="subscription-actions">
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="updatingSubscriptionId === Number(s.id) || s.status === 'ACTIVE'" @click="setSubscriptionStatus(s.id, 'ACTIVE')">Activate</button>
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="updatingSubscriptionId === Number(s.id) || s.status === 'PAUSED'" @click="setSubscriptionStatus(s.id, 'PAUSED')">Pause</button>
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="updatingSubscriptionId === Number(s.id) || s.status === 'CANCELLED'" @click="setSubscriptionStatus(s.id, 'CANCELLED')">Cancel</button>
                  <button class="btn btn-secondary btn-sm" type="button" :disabled="replenishingSubscriptionId === Number(s.id) || s.status !== 'ACTIVE'" @click="replenishSubscriptionTokensNow(s.id)">
                    {{ replenishingSubscriptionId === Number(s.id) ? 'Replenishing…' : 'Replenish tokens' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <table v-if="selectedClientId && !ledgerLoading" class="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Status</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="x in ledger" :key="`l-${x.id}`">
                <td>{{ fmtDate(x.scheduled_start_at || x.created_at) }}</td>
                <td>{{ x.charge_status || 'PENDING' }}</td>
                <td>{{ String(x.charge_type || 'SESSION_FEE').replaceAll('_', ' ') }}</td>
                <td>{{ money(x.total_cents) }}</td>
                <td>
                  <button
                    v-if="isPayableStatus(x.charge_status)"
                    class="btn btn-secondary btn-sm"
                    type="button"
                    :disabled="payingChargeId === Number(x.id)"
                    @click="payChargeNow(x.id)"
                  >
                    {{ payingChargeId === Number(x.id) ? 'Processing…' : 'Mark paid now' }}
                  </button>
                  <span v-else class="hint">—</span>
                </td>
              </tr>
              <tr v-if="!ledger.length">
                <td colspan="5" class="hint">No charges yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';

const agencyStore = useAgencyStore();
const agencyId = computed(() => Number(agencyStore.currentAgency?.id || 0) || null);

const loading = ref(false);
const error = ref('');
const participants = ref([]);
const selectedClientId = ref(null);
const ledgerLoading = ref(false);
const ledger = ref([]);
const payingChargeId = ref(0);
const tokenBalance = ref({ individualTokens: 0, groupTokens: 0 });
const creditTokenType = ref('INDIVIDUAL');
const creditQuantity = ref(1);
const creditingTokens = ref(false);
const subscriptionPlans = ref([]);
const subscriptions = ref([]);
const selectedPlanId = ref(0);
const creatingSubscription = ref(false);
const updatingSubscriptionId = ref(0);
const replenishingSubscriptionId = ref(0);
const runningRenewals = ref(false);

const money = (cents) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100);
const isPayableStatus = (status) => ['PENDING', 'AUTHORIZED', 'FAILED'].includes(String(status || '').toUpperCase());
const fmtDate = (v) => {
  if (!v) return '-';
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
};

const loadParticipants = async () => {
  if (!agencyId.value) return;
  try {
    loading.value = true;
    error.value = '';
    const r = await api.get('/learning-billing/front-desk/participants', { params: { agencyId: agencyId.value } });
    participants.value = Array.isArray(r.data?.participants) ? r.data.participants : [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load participants';
    participants.value = [];
  } finally {
    loading.value = false;
  }
};

const loadSubscriptionPlans = async () => {
  if (!agencyId.value) {
    subscriptionPlans.value = [];
    return;
  }
  try {
    const r = await api.get('/learning-billing/subscription-plans', { params: { agencyId: agencyId.value } });
    subscriptionPlans.value = Array.isArray(r.data?.plans) ? r.data.plans : [];
  } catch {
    subscriptionPlans.value = [];
  }
};

const selectClient = async (clientId) => {
  selectedClientId.value = Number(clientId || 0) || null;
  if (!selectedClientId.value || !agencyId.value) {
    ledger.value = [];
    return;
  }
  try {
    ledgerLoading.value = true;
    const r = await api.get(`/learning-billing/clients/${selectedClientId.value}/ledger`, {
      params: { agencyId: agencyId.value }
    });
    ledger.value = Array.isArray(r.data?.ledger) ? r.data.ledger : [];
    const t = await api.get(`/learning-billing/clients/${selectedClientId.value}/tokens`, {
      params: { agencyId: agencyId.value }
    });
    tokenBalance.value = {
      individualTokens: Number(t.data?.individualTokens || 0),
      groupTokens: Number(t.data?.groupTokens || 0)
    };
    const subs = await api.get(`/learning-billing/clients/${selectedClientId.value}/subscriptions`, {
      params: { agencyId: agencyId.value }
    });
    subscriptions.value = Array.isArray(subs.data?.subscriptions) ? subs.data.subscriptions : [];
  } catch {
    ledger.value = [];
    tokenBalance.value = { individualTokens: 0, groupTokens: 0 };
    subscriptions.value = [];
  } finally {
    ledgerLoading.value = false;
  }
};

const payChargeNow = async (chargeId) => {
  const aid = Number(agencyId.value || 0);
  const cid = Number(chargeId || 0);
  if (!aid || !cid) return;
  try {
    payingChargeId.value = cid;
    const intent = await api.post('/learning-billing/payments/intent', {
      agencyId: aid,
      chargeId: cid
    });
    const paymentId = Number(intent?.data?.paymentId || 0);
    if (!paymentId) throw new Error('Missing payment id');
    await api.post(`/learning-billing/payments/${paymentId}/attempts`, {
      status: 'SUCCESS',
      requestPayload: { source: 'learning_billing_desk' },
      responsePayload: { processor: 'PLACEHOLDER' }
    });
    await selectClient(selectedClientId.value);
    await loadParticipants();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to process payment';
  } finally {
    payingChargeId.value = 0;
  }
};

const creditTokens = async () => {
  const aid = Number(agencyId.value || 0);
  const clientId = Number(selectedClientId.value || 0);
  const quantity = Number(creditQuantity.value || 0);
  if (!aid || !clientId || quantity <= 0) return;
  try {
    creditingTokens.value = true;
    await api.post('/learning-billing/tokens/credit', {
      agencyId: aid,
      clientId,
      tokenType: String(creditTokenType.value || 'INDIVIDUAL').toUpperCase(),
      quantity,
      reasonCode: 'ADMIN_CREDIT'
    });
    await selectClient(clientId);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to credit tokens';
  } finally {
    creditingTokens.value = false;
  }
};

const createSubscription = async () => {
  const aid = Number(agencyId.value || 0);
  const clientId = Number(selectedClientId.value || 0);
  const planId = Number(selectedPlanId.value || 0);
  if (!aid || !clientId || !planId) return;
  try {
    creatingSubscription.value = true;
    await api.post('/learning-billing/subscriptions', {
      agencyId: aid,
      clientId,
      planId
    });
    await selectClient(clientId);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to create subscription';
  } finally {
    creatingSubscription.value = false;
  }
};

const setSubscriptionStatus = async (subscriptionId, status) => {
  const sid = Number(subscriptionId || 0);
  const st = String(status || '').toUpperCase();
  if (!sid || !st) return;
  try {
    updatingSubscriptionId.value = sid;
    await api.post(`/learning-billing/subscriptions/${sid}/status`, { status: st });
    await selectClient(selectedClientId.value);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to update subscription status';
  } finally {
    updatingSubscriptionId.value = 0;
  }
};

const replenishSubscriptionTokensNow = async (subscriptionId) => {
  const sid = Number(subscriptionId || 0);
  if (!sid) return;
  try {
    replenishingSubscriptionId.value = sid;
    await api.post(`/learning-billing/subscriptions/${sid}/replenish`, {});
    await selectClient(selectedClientId.value);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to replenish subscription tokens';
  } finally {
    replenishingSubscriptionId.value = 0;
  }
};

const runRenewalsNow = async () => {
  if (!agencyId.value) return;
  try {
    runningRenewals.value = true;
    const resp = await api.post('/learning-billing/subscriptions/run-renewals', { agencyId: Number(agencyId.value) });
    const renewed = Number(resp?.data?.renewed || 0);
    if (selectedClientId.value) await selectClient(selectedClientId.value);
    await loadParticipants();
    if (renewed > 0) {
      error.value = '';
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to run renewals';
  } finally {
    runningRenewals.value = false;
  }
};

onMounted(() => {
  void loadParticipants();
  void loadSubscriptionPlans();
});
</script>

<style scoped>
.learning-billing-desk { padding-bottom: 12px; }
.header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin-top: 4px; }
.hint { color: var(--text-secondary); }
.error { color: #b91c1c; }
.layout { display: grid; grid-template-columns: 360px 1fr; gap: 12px; }
.left, .right { border: 1px solid var(--border); border-radius: 12px; background: white; padding: 10px; }
.panel-title { font-weight: 800; margin-bottom: 8px; }
.list { display: flex; flex-direction: column; gap: 8px; max-height: 620px; overflow: auto; }
.item { border: 1px solid var(--border); border-radius: 8px; padding: 8px; text-align: left; background: white; cursor: pointer; }
.item.active { border-color: rgba(59, 130, 246, 0.5); background: rgba(59, 130, 246, 0.06); }
.name { font-weight: 700; color: var(--text-primary); }
.meta { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.token-tools { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.token-balance { font-size: 13px; color: var(--text-secondary); }
.token-credit-form { display: flex; align-items: center; gap: 8px; }
.subscription-tools { border: 1px solid var(--border); border-radius: 10px; padding: 8px; margin-bottom: 10px; background: #fff; }
.subscription-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.subscription-create { display: flex; align-items: center; gap: 8px; }
.subscription-list { display: flex; flex-direction: column; gap: 8px; }
.subscription-item { border: 1px solid var(--border); border-radius: 8px; padding: 8px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.subscription-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.select-sm, .qty-input { border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; font-size: 12px; }
.qty-input { width: 72px; }
.ledger-table { width: 100%; border-collapse: collapse; }
.ledger-table th, .ledger-table td { border-bottom: 1px solid var(--border); padding: 8px; text-align: left; font-size: 13px; }
.ledger-table th { background: var(--bg-alt); font-weight: 800; }
</style>
