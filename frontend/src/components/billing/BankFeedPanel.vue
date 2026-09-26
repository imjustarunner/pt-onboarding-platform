<template>
  <section class="bank-panel" aria-labelledby="bank-feed-title">
    <header><div><h2 id="bank-feed-title">Payer deposit verification</h2><p>Read-only bank access to verify payer deposits for {{ agencyName }}. Existing payer direct deposits stay in place.</p></div><button :disabled="busy" @click="load()">Refresh view</button></header>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="data">
      <p v-if="!data.enabled" class="notice">Bank connections await activation. Complete Stripe Financial Connections registration before linking an account.</p>
      <form @submit.prevent="connect">
        <label class="consent"><input v-model="ownerAuthorized" type="checkbox" required :disabled="busy || !data.enabled" /> I am authorized to share this agency’s bank transactions and will select only accounts owned by {{ agencyName }}.</label>
        <button :disabled="busy || !data.enabled || !data.stripeConfigured || !ownerAuthorized">Connect agency bank through Stripe</button>
      </form>
      <p class="subtle">Stripe may retrieve a broader bank feed to perform these checks. This app retains only matching deposit evidence, not a general transaction history. Daily updates may be delayed; uncertain matches stay manual.</p>
      <p v-if="!data.accounts.length">No bank accounts connected for this agency.</p>
      <div v-for="account in data.accounts" :key="account.id" class="account">
        <div><strong>{{ account.institution }} · {{ account.name }} · {{ account.last4 ? `•••• ${account.last4}` : 'Account' }}</strong><p>{{ account.livemode ? 'Live' : 'Test' }} · {{ account.status.replaceAll('_', ' ') }} · Last checked: {{ account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : 'Not yet imported' }}</p><p v-if="account.lastError" role="status">{{ account.lastError }}</p></div>
        <div class="actions"><button :disabled="busy" @click="selectAccount(account.id)">View deposit checks</button><button :disabled="busy || !data.enabled || !account.syncEnabled" @click="mutate(account.id, 'sync')">Check available evidence</button><button v-if="account.status !== 'disconnected'" :disabled="busy" @click="disconnectId = account.id">Disconnect</button></div>
        <div v-if="disconnectId === account.id" class="notice"><p>Stop importing this account and revoke transaction sharing through this connection? Previously imported evidence is retained.</p><button :disabled="busy" @click="mutate(account.id, 'disconnect')">Confirm disconnect</button> <button :disabled="busy" @click="disconnectId = null">Cancel</button></div>
      </div>
      <template v-if="selectedId">
        <h3>Deposit checks for this account</h3>
        <form class="actions" @submit.prevent="queueEra"><label>ERA ID from Claim.MD directory<input v-model="eraId" required maxlength="128" /></label><label>Directory page<input v-model.number="eraPage" type="number" min="1" max="10000" required /></label><button :disabled="busy || !data.enabled || !data.accounts.find(a => a.id === selectedId)?.syncEnabled">Verify this ERA’s deposit</button></form>
        <p>Automatic verification requires a posted deposit, exact amount, payment reference and payer originator identity. Missing references, combined deposits and uncertain matches require manual review. These checks do not post payments or change claim balances.</p>
        <div class="table-scroll"><table><thead><tr><th>ERA / payer</th><th>Payment reference</th><th>Amount</th><th>Verification</th></tr></thead><tbody><tr v-for="item in data.verifications" :key="item.id"><td>{{ item.eraId }} · {{ item.payerName }}</td><td>{{ item.trace }}</td><td>{{ money(item.amountCents, item.currency) }}</td><td>{{ item.status === 'verified' ? 'Deposit verified' : item.status === 'manual_review' ? 'Manual review required' : 'Awaiting matching evidence — manual review available' }}</td></tr></tbody></table></div>
        <p v-if="!data.verifications.length">No remittances selected for deposit verification.</p>
        <p>For manual verification, use the payer’s EFT evidence record below after checking the bank payment reference.</p>
      </template>
    </template>
  </section>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { loadStripe } from '@stripe/stripe-js';
import api from '../../services/api';
const props = defineProps({ agencyId: { type: Number, required: true }, agencyName: { type: String, required: true } });
const data = ref(null), error = ref(''), notice = ref(''), busy = ref(false), ownerAuthorized = ref(false), selectedId = ref(null), disconnectId = ref(null), after = ref(0), eraId = ref(''), eraPage = ref(1);
let generation = 0;
const money = (amount, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
async function load(cursor = 0) {
  const version = ++generation;
  busy.value = true; error.value = '';
  try {
    const response = await api.get('/medical-billing/bank-feeds', { params: { agencyId: props.agencyId, ...(selectedId.value ? { accountId: selectedId.value } : {}), ...(cursor ? { after: cursor } : {}) } });
    if (version === generation) { data.value = response.data; after.value = cursor; }
  } catch (e) { if (version === generation) { data.value = null; error.value = e.response?.data?.error?.message || 'Bank connections are unavailable. Check access and setup.'; } }
  finally { if (version === generation) busy.value = false; }
}
function selectAccount(id) { selectedId.value = id; return load(); }
async function connect() {
  const version = generation, agencyId = props.agencyId;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const { data: session } = await api.post('/medical-billing/bank-feeds/sessions', { agencyId, requestKey: crypto.randomUUID(), ownerAuthorized: ownerAuthorized.value });
    if (version !== generation) return;
    const stripe = await loadStripe(session.publishableKey);
    if (version !== generation) return;
    if (!stripe) throw new Error('Bank connection could not load');
    const result = await stripe.collectFinancialConnectionsAccounts({ clientSecret: session.clientSecret });
    if (version !== generation) return;
    if (result.error) { error.value = 'The bank connection did not complete. You can try again.'; return; }
    if (!result.financialConnectionsSession?.accounts?.length) { notice.value = 'No accounts were connected.'; return; }
    // Returned account IDs are intentionally not trusted or forwarded.
    await api.post('/medical-billing/bank-feeds/sessions/complete', { agencyId, sessionKey: session.sessionKey });
    if (version !== generation) return;
    ownerAuthorized.value = false;
    notice.value = 'Connection saved. Select a remittance to verify after the first successful bank refresh.';
    await load();
  } catch (e) { if (version === generation) error.value = e.response?.data?.error?.message || 'Connection could not complete. Refresh to review account status before reconnecting.'; }
  finally { if (version === generation) busy.value = false; }
}
async function queueEra() {
  const version = generation;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await api.post(`/medical-billing/bank-feeds/${selectedId.value}/verify-era`, { agencyId: props.agencyId, eraId: eraId.value.trim(), page: eraPage.value });
    if (version !== generation) return;
    notice.value = 'ERA identity confirmed. Deposit verification queued.';
    eraId.value = ''; await load();
  } catch (e) { if (version === generation) error.value = e.response?.data?.error?.message || 'This remittance needs manual verification.'; }
  finally { if (version === generation) busy.value = false; }
}
async function mutate(id, action) {
  const version = generation;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const { data: result } = await api.post(`/medical-billing/bank-feeds/${id}/${action}`, { agencyId: props.agencyId });
    if (version !== generation) return;
    disconnectId.value = null;
    notice.value = action === 'disconnect' ? 'Transaction sharing disconnected.' : result.noTargets ? 'Select a remittance to verify first.' : result.pending ? 'Waiting for the bank’s next transaction update.' : result.inactive ? 'Bank consent is inactive. Reconnect to continue.' : result.deferred ? 'An import is already running.' : result.more ? 'Evidence saved; remaining checks will continue in the background.' : 'Available bank evidence checked.';
    await load();
  } catch (e) { if (version === generation) error.value = e.response?.data?.error?.message || 'Action could not complete. Refresh to review account status.'; }
  finally { if (version === generation) busy.value = false; }
}
watch(() => props.agencyId, () => { generation++; data.value = null; selectedId.value = null; disconnectId.value = null; ownerAuthorized.value = false; eraId.value = ''; eraPage.value = 1; notice.value = ''; load(); }, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>

<style scoped>
.bank-panel{background:var(--bg-card,#fff);padding:24px;border:1px solid var(--border-color,#dce5ef);border-radius:14px;margin:20px 0}header,.actions{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap}p{line-height:1.6}.consent{display:flex;gap:10px;align-items:flex-start;margin:16px 0}.account{border-top:1px solid var(--border-color,#dce5ef);padding:18px 0}.actions{justify-content:flex-start}button{padding:10px 14px;border:1px solid var(--border-color,#c4d0df);border-radius:7px;background:var(--bg-card,#fff);color:var(--bw-brand,#2463ad);font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}.notice{padding:12px;background:var(--bg-secondary,#eff5fb);border-radius:8px}.subtle{color:var(--text-secondary,#536580)}[role=alert]{color:var(--app-text-red, #b91c1c)}input{padding:8px;border:1px solid var(--border-color,#c4d0df);border-radius:6px;font:inherit}label:not(.consent){display:grid;gap:6px}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:12px;text-align:left;border-bottom:1px solid var(--border-color,#dce5ef)}
</style>
