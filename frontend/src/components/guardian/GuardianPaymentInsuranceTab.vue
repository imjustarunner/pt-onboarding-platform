<template>
  <div class="family-billing">
    <header><h3>Billing for your family</h3><p>Each client has a responsible payer. Your cards and insurance records remain private to your account, including when another guardian also pays.</p></header>
    <p v-if="loading" role="status">Loading billing…</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status" class="notice">{{ notice }}</p>
    <template v-if="data">
      <p v-if="!data.clients.length">No clients are linked to this account in this organization.</p>
      <section class="client-grid">
        <article v-for="client in data.clients" :key="client.clientId" class="billing-card">
          <h4>{{ client.clientName }}</h4>
          <p><strong>Responsible payer:</strong> {{ client.responsiblePayers.map(p => p.name).join(', ') || 'Not yet designated' }}</p>
          <template v-if="client.canManageBilling">
            <p class="status">{{ client.paymentCardId ? 'Your payment method is assigned' : 'Payment method required before paid services' }}</p>
            <label>Your card for this client<select v-model="cardSelections[client.clientId]"><option value="">Select a saved card</option><option v-for="card in data.cards" :key="card.id" :value="card.id" :disabled="card.verificationRequired">{{ card.card_brand }} •••• {{ card.card_last4 }}{{ card.verificationRequired ? ' — add again to verify' : '' }}</option></select></label>
            <button class="btn btn-secondary" type="button" :disabled="busy || !cardSelections[client.clientId]" @click="assign(client)">Apply card to this client</button>
            <p v-if="client.recurringEnabled">Recurring authorization active, up to {{ money(client.recurringLimitCents) }} per charge.</p>
            <button v-if="client.recurringEnabled" class="btn btn-secondary" type="button" :disabled="busy" @click="revoke(client)">Revoke recurring authorization</button>
            <button v-else class="btn btn-secondary" type="button" :disabled="busy || !client.paymentCardId" @click="openAuthorization(client,'recurring')">Authorize recurring billing</button>
          </template>
          <button v-else-if="client.canAcceptResponsibility" class="btn btn-secondary" type="button" @click="openAuthorization(client,'responsibility')">Accept financial responsibility</button>
        </article>
      </section>
      <form v-if="authorization" class="billing-card authorization" @submit.prevent="authorize">
        <h4>{{ authorization.purpose === 'recurring' ? 'Authorize recurring payments' : 'Accept financial responsibility' }} for {{ authorization.client.clientName }}</h4>
        <p>{{ data.terms }}</p>
        <label v-if="authorization.purpose === 'recurring'">Maximum amount per charge (USD)<input v-model="limitDollars" type="number" min="0.01" max="10000" step="0.01" required /></label>
        <label>Your full name (electronic signature)<input v-model="signature" required maxlength="255" autocomplete="name" /></label>
        <label class="check"><input v-model="accepted" type="checkbox" required /> I have read and agree to this authorization for this client.</label>
        <div class="actions"><button class="btn btn-primary" :disabled="busy || !accepted">Sign authorization</button><button class="btn btn-secondary" type="button" :disabled="busy" @click="authorization = null">Cancel</button></div>
      </form>
      <template v-if="manageableClients.length">
        <section class="billing-card">
          <div class="section-head"><h4>Your saved cards</h4><button v-if="data.stripe.enabled" class="btn btn-secondary" type="button" @click="showCard = !showCard">{{ showCard ? 'Close card form' : 'Add a card' }}</button></div>
          <p v-if="!data.stripe.enabled">Card collection is not enabled for this organization yet. The office will need to arrange payment before paid services.</p>
          <p v-if="!data.cards.length">No payment method on file.</p>
          <div v-for="card in data.cards" :key="card.id" class="saved-row"><span>{{ card.card_brand }} •••• {{ card.card_last4 }} · expires {{ card.card_exp_month }}/{{ card.card_exp_year }}</span><button class="btn btn-secondary" type="button" :disabled="busy" @click="removingCard = card">Remove</button></div>
          <div v-if="removingCard" class="notice"><p>Remove your card ending in {{ removingCard.card_last4 }}? This also revokes its recurring authorizations for all your clients.</p><button class="btn btn-secondary" :disabled="busy" @click="removeCard">Remove card</button> <button class="btn btn-secondary" @click="removingCard = null">Keep card</button></div>
          <SecureCardSetup v-if="showCard" :key="agencyId" :agency-id="agencyId" @saved="cardSaved" />
        </section>
        <section class="billing-card">
          <div class="section-head"><h4>Your insurance policies</h4><button class="btn btn-secondary" type="button" @click="editInsurance()">Add insurance</button></div>
          <p v-if="!data.profiles.length">No insurance policy has been assigned from your account.</p>
          <article v-for="profile in data.profiles" :key="profile.id" class="policy-summary">
            <h5>{{ profile.primary.insurerName || 'Policy awaiting review' }}</h5>
            <p>Member ID: {{ profile.primary.memberId || 'Missing' }} · Subscriber: {{ profile.primary.subscriberName || 'Missing' }}</p>
            <p>Coverage submitted for: {{ profile.clientIds.map(id => data.clients.find(c => Number(c.clientId) === id)?.clientName).filter(Boolean).join(', ') || 'No client selected' }}</p>
            <p>The office reviews coverage and determines primary and secondary billing before submitting claims.</p>
            <p v-if="profile.secondary">Secondary: {{ profile.secondary.insurerName }} · Member ID: {{ profile.secondary.memberId }}</p>
            <p v-if="profile.hasPrimaryFront || profile.hasPrimaryBack">Insurance card evidence is on file for office review.</p>
            <details v-if="profile.missingClaimFields.length"><summary>Information needed for claims</summary><ul><li v-for="issue in profile.missingClaimFields" :key="issue">{{ issue }}</li></ul></details>
            <button class="btn btn-secondary" type="button" @click="editInsurance(profile)">Review coverage / apply to clients</button>
          </article>
        </section>
        <form v-if="insuranceDraft" class="billing-card" @submit.prevent="saveInsurance">
          <h4>Insurance coverage</h4>
          <label>Policy scope<select v-model="insuranceDraft.coverageScope"><option value="client">One client</option><option value="account_holder">Account holder and covered dependents</option></select></label>
          <fieldset><legend>Clients covered by this policy</legend><label v-for="client in manageableClients" :key="client.clientId" class="check"><input v-model="insuranceDraft.clientIds" type="checkbox" :value="Number(client.clientId)" /> {{ client.clientName }}</label></fieldset>
          <h5>Primary policy</h5><InsurancePolicyFields v-model="insuranceDraft.primary" />
          <label class="check"><input v-model="hasSecondary" type="checkbox" /> Add secondary insurance</label>
          <template v-if="hasSecondary"><h5>Secondary policy</h5><InsurancePolicyFields v-model="insuranceDraft.secondary" /></template>
          <label class="check"><input v-model="coverageConfirmed" type="checkbox" required /> I confirm that the selected clients are covered. I have checked the subscriber and member details; I understand the office must verify benefits.</label>
          <div class="actions"><button class="btn btn-primary" :disabled="busy || !coverageConfirmed">Save coverage</button><button class="btn btn-secondary" type="button" @click="insuranceDraft = null">Cancel</button></div>
        </form>
      </template>
    </template>
  </div>
</template>
<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import SecureCardSetup from '../billing/SecureCardSetup.vue';
import InsurancePolicyFields from '../billing/InsurancePolicyFields.vue';
const props = defineProps({ agencyId:[Number,String], guardianUserId:[Number,String] });
const data = ref(null), loading = ref(false), error = ref(''), notice = ref(''), busy = ref(false), showCard = ref(false), removingCard = ref(null), authorization = ref(null), signature = ref(''), accepted = ref(false), limitDollars = ref(''), cardSelections = ref({}), insuranceDraft = ref(null), hasSecondary = ref(false), coverageConfirmed = ref(false);
const manageableClients = computed(() => (data.value?.clients || []).filter(c => c.canManageBilling));
const money = cents => new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(cents || 0)/100);
let generation = 0;
async function load() {
  const current = ++generation, agencyId = props.agencyId;
  data.value = null; loading.value = true; error.value = '';
  if (!agencyId) { loading.value = false; return; }
  try { const res = await api.get('/guardian-billing/overview',{params:{agencyId}}); if (current !== generation) return; data.value = res.data; cardSelections.value = Object.fromEntries(res.data.clients.map(c => [c.clientId,c.paymentCardId || ''])); }
  catch(e) { if (current === generation) error.value = e.response?.data?.error?.message || 'Billing could not be loaded'; }
  finally { if (current === generation) loading.value = false; }
}
async function perform(fn, message) { if (busy.value) return; busy.value = true; error.value = ''; const current = generation; try { await fn(); if (current !== generation) return; notice.value = message; await load(); } catch(e) { if (current === generation) error.value = e.response?.data?.error?.message || 'Your change could not be saved'; } finally { busy.value = false; } }
function openAuthorization(client,purpose) { authorization.value = {client,purpose}; signature.value=''; accepted.value=false; limitDollars.value=''; }
async function authorize() {
  const a = authorization.value;
  const consent = {accepted:accepted.value,version:data.value.termsVersion,signatureName:signature.value};
  await perform(async () => { await api.post(`/guardian-billing/clients/${a.client.clientId}/${a.purpose === 'recurring' ? 'payment-method' : 'responsibility'}`,{agencyId:props.agencyId,consent,...(a.purpose === 'recurring' ? {cardId:a.client.paymentCardId,recurring:true,limitCents:Math.round(Number(limitDollars.value)*100)} : {})}); authorization.value=null; },'Authorization saved.');
}
function assign(client) { return perform(() => api.post(`/guardian-billing/clients/${client.clientId}/payment-method`,{agencyId:props.agencyId,cardId:cardSelections.value[client.clientId],recurring:false}),'Card assigned. Recurring billing requires separate authorization.'); }
function revoke(client) { return perform(() => api.delete(`/guardian-billing/clients/${client.clientId}/recurring`,{params:{agencyId:props.agencyId}}),'Recurring authorization revoked.'); }
function removeCard() { const id=removingCard.value.id; return perform(async () => {await api.delete(`/guardian-billing/payment-cards/${id}`,{params:{agencyId:props.agencyId}});removingCard.value=null;},'Card removed and its authorizations revoked.'); }
function cardSaved() { showCard.value=false; notice.value='Card saved. Select which clients will use it.'; void load(); }
function editInsurance(profile) { insuranceDraft.value={profileId:profile?.id,coverageScope:profile?.coverageScope || 'client',clientIds:[...(profile?.clientIds || [])],primary:{...(profile?.primary || {})},secondary:{...(profile?.secondary || {})}}; hasSecondary.value=!!profile?.secondary; coverageConfirmed.value=false; }
function saveInsurance() { const payload={...insuranceDraft.value,agencyId:props.agencyId,coverageConfirmed:coverageConfirmed.value,secondary:hasSecondary.value ? insuranceDraft.value.secondary : null}; return perform(async()=>{await api.post('/guardian-billing/insurance',payload);insuranceDraft.value=null;},'Insurance saved to the selected client records.'); }
watch(()=>[props.agencyId,props.guardianUserId],()=>{showCard.value=false;authorization.value=null;insuranceDraft.value=null;removingCard.value=null;notice.value='';void load();},{immediate:true});
</script>
<style scoped>
.family-billing { display:grid; gap:20px; color:var(--text-primary,#0f172a); } header p { max-width:850px; } h3,h4,h5 { margin:0 0 10px; } h5 {font-size:16px} p {line-height:1.5} .client-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px} .billing-card {padding:22px;border:1px solid var(--border,#cbd5e1);border-radius:14px;background:white;display:grid;gap:12px;align-content:start} .billing-card p {margin:0} .section-head,.saved-row,.actions {display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap} .saved-row {padding:12px;background:#f8fafc;border-radius:8px} label {display:grid;gap:6px} input:not([type=checkbox]),select {padding:10px;border:1px solid #94a3b8;border-radius:7px;max-width:100%;color:#0f172a;background:white} .check {display:flex;align-items:flex-start;gap:10px}.check input {margin-top:4px}.authorization {border-color:#2563eb}.notice {padding:14px;background:#eff6ff;border-radius:8px}.error {color:#b91c1c}.status {color:#334155;font-weight:600}.policy-summary {padding:16px;border:1px solid #cbd5e1;border-radius:10px;display:grid;gap:10px} fieldset {border:1px solid #cbd5e1;border-radius:8px;display:grid;gap:10px}button {white-space:normal;text-align:left}
</style>
