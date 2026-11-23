<template>
  <div class="family-billing">
    <header><h3>{{ ft(section === 'authorization' ? 'Payment authorization' : section === 'payment' ? 'Payment method' : learningOnly ? 'Payment methods' : 'Insurance & payment methods') }}</h3><p>{{ ft(learningOnly ? 'Your saved payment methods remain private to your account, including when another guardian also pays.' : 'Each client has a responsible payer. Your cards and insurance records remain private to your account, including when another guardian also pays.') }}</p></header>
    <p v-if="loading" role="status">{{ ft("Loading billing…") }}</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status" class="notice">{{ notice }}</p>
    <InsuranceCardTasks v-if="section === 'all' && insurableClients.length" :key="insuranceRevision" :agency-id="agencyId" :client-id="clientId" />
    <template v-if="data">
      <p v-if="!data.clients.length">{{ ft(learningOnly?'No student payment profiles are available under your current access in this organization.':'No client billing profiles are available under your current access in this organization.') }}</p>
      <section class="client-grid">
        <article v-for="client in scopedClients" :key="client.clientId" class="billing-card">
          <h4>{{ client.clientName }}</h4>
          <p><strong>{{ ft("Responsible payer:") }}</strong> {{ ft(client.responsiblePayers.map(p => p.name).join(', ') || 'Not selected') }}</p>
          <p v-if="!client.responsiblePayers.length" class="status">{{ ft("A payer has not been selected. This setup status does not mean you owe a balance.") }}</p>
          <p v-if="client.canAcceptResponsibility" class="status">{{ ft("Financial responsibility is a separate authorization for future verified charges. Reviewing it does not make a payment or turn on automatic payments.") }}</p>
          <p v-if="!learningOnly && client.insuranceOnFile && client.insuranceApplicable !== false">{{ ft("Coverage is recorded for this client. Review the policies you hold below; policies held by another guardian remain private.") }}</p>
          <p v-if="!learningOnly && client.medicaid" class="status">{{ ft("You can save a card if you wish. We do not collect copays or charge you out of pocket for Medicaid-covered care.") }}</p>
          <p v-else-if="client.paymentSetupRequested" role="status">{{ ft("Billing requested payment setup. In order to prevent interruption of services, please add a payment method below. Contact Billing if you need help or wish to discuss an arrangement.") }}</p>
          <button v-if="!client.medicaid && section === 'authorization' && (client.canManageBilling || client.canAcceptResponsibility)" type="button" @click="openAuthorization(client,'responsibility')">{{ ft("Review and sign payment authorization") }}</button>
          <template v-else-if="client.canManageBilling && !client.medicaid">
            <p v-if="!client.medicaid" class="status">{{ ft(client.paymentCardId ? 'Your payment method is assigned' : learningOnly ? 'Payment is handled separately under your agreed tutoring arrangement. Contact the office if you need help.' : 'Add a payment method for your agreed charges') }}</p>
            <label>{{ ft("Your card for this") }} {{ ft(learningOnly?'student':'client') }}<select v-model="cardSelections[client.clientId]"><option value="">{{ ft("Select a saved card") }}</option><option v-for="card in data.cards" :key="card.id" :value="card.id" :disabled="card.verificationRequired">{{ card.card_brand }} •••• {{ card.card_last4 }}{{ card.verificationRequired ? ' — add again to verify' : '' }}</option></select></label>
            <button class="btn btn-secondary" type="button" :disabled="busy || !cardSelections[client.clientId]" @click="assign(client)">{{ ft("Apply card to this") }} {{ ft(learningOnly?'student':'client') }}</button>
            <p v-if="client.recurringEnabled">{{ ft("Recurring authorization active, up to") }} {{ money(client.recurringLimitCents) }} {{ ft("per charge.") }}</p>
            <button v-if="client.recurringEnabled" class="btn btn-secondary" type="button" :disabled="busy" @click="revoke(client)">{{ ft("Revoke recurring authorization") }}</button>
            <button v-else-if="!client.medicaid" class="btn btn-secondary" type="button" :disabled="busy || !client.paymentCardId" @click="openAuthorization(client,'recurring')">{{ ft("Authorize recurring billing") }}</button>
          </template>
          <button v-else-if="!client.medicaid && client.canAcceptResponsibility" class="btn btn-secondary" type="button" @click="openAuthorization(client,'responsibility')">{{ ft("Review financial responsibility") }}</button>
        </article>
      </section>
      <form v-if="authorization" class="billing-card authorization" @submit.prevent="authorize">
        <h4>{{ ft(authorization.purpose === 'recurring' ? 'Authorize recurring payments' : 'Accept financial responsibility') }} {{ ft("for") }} {{ authorization.client.clientName }}</h4>
        <p>{{ data.terms }}</p>
        <label v-if="authorization.purpose === 'recurring'">{{ ft("Maximum amount per charge (USD)") }}<input v-model="limitDollars" type="number" min="0.01" max="10000" step="0.01" required /></label>
        <label>{{ ft("Your full name (electronic signature)") }}<input v-model="signature" required maxlength="255" autocomplete="name" /></label>
        <label class="check"><input v-model="accepted" type="checkbox" required /> {{ ft("I have read and agree to this authorization for this") }} {{ ft(learningOnly?'student':'client') }}.</label>
        <div class="actions"><button class="btn btn-primary" :disabled="busy || !accepted">{{ ft("Sign authorization") }}</button><button class="btn btn-secondary" type="button" :disabled="busy" @click="authorization = null">{{ ft("Cancel") }}</button></div>
      </form>
      <template v-if="paymentEligibleClients.length || insurableClients.length">
        <section v-if="paymentEligibleClients.length && section !== 'authorization'" class="billing-card wallet-section">
          <p v-if="data.paymentSimulator?.enabled" class="qa-payment-notice" role="status">{{ ft("QA payment simulation is enabled. These records do not move money or contact a bank.") }}</p>
          <div class="section-head"><h4>{{ ft("Your saved cards") }}</h4><button v-if="data.stripe.enabled||data.paymentSimulator?.enabled" class="btn btn-secondary" type="button" @click="showCard = !showCard">{{ ft(showCard ? 'Close card form' : data.paymentSimulator?.enabled?'Add a QA test card':'Add a card') }}</button></div>
          <p v-if="!data.stripe.enabled&&!data.paymentSimulator?.enabled">{{ ft("Online card setup is not available yet because this agency has not completed its payment connection. Your financial authorization is saved separately.") }}</p>
          <QaPendingPayments v-if="data.paymentSimulator?.enabled" :agency-id="agencyId" :key="`${agencyId}:${guardianUserId || ''}`" @resolved="load" />
          <p v-if="!data.cards.length">{{ ft("No payment method on file.") }}</p>
          <div v-for="card in data.cards" :key="card.id" class="saved-row"><span>{{ card.card_brand }} •••• {{ card.card_last4 }} <template v-if="card.simulated"> {{ ft("· Simulated ·") }} {{card.simulationScenario}}</template><template v-else> · {{ ft(expired(card) ? 'Expired' : 'Expires') }} {{ card.card_exp_month }}/{{ card.card_exp_year }}</template></span><button class="btn btn-secondary" type="button" :disabled="busy" @click="removingCard = card">{{ ft("Remove") }}</button></div>
          <div v-if="removingCard" class="notice"><p>{{ ft("Remove your card ending in") }} {{ removingCard.card_last4 }}{{ ft("? This also revokes its recurring authorizations for your clients at this agency.") }}</p><button class="btn btn-secondary" :disabled="busy" @click="removeCard">{{ ft("Remove card") }}</button> <button class="btn btn-secondary" @click="removingCard = null">{{ ft("Keep card") }}</button></div>
          <QaTestCardSetup v-if="showCard&&paymentEligibleClients.length&&data.paymentSimulator?.enabled" :key="`${agencyId}:${guardianUserId || ''}:${clientId || ''}`" :agency-id="agencyId" :terms="data.terms" :terms-version="data.termsVersion" @saved="cardSaved" />
          <SecureCardSetup v-else-if="showCard && paymentEligibleClients.length" :key="`${agencyId}:${guardianUserId || ''}:${clientId || ''}`" :agency-id="agencyId" :owner-key="guardianUserId" :collection-allowed="paymentEligibleClients.length > 0" @saved="cardSaved" />
        </section>
        <section v-if="insurableClients.length && section === 'all'" class="billing-card insurance-section">
          <div class="section-head"><h4>{{ ft("Your insurance policies") }}</h4><button class="btn btn-secondary" type="button" @click="editInsurance()">{{ ft("Add insurance") }}</button></div>
          <p>{{ ft("You may add coverage you hold for your child without accepting payment responsibility. Additional coverage is submitted for office review and does not replace another parent’s policy.") }}</p>
          <p v-if="!scopedProfiles.length">{{ ft("No insurance policy has been assigned from your account.") }}</p>
          <article v-for="profile in scopedProfiles" :key="profile.id" class="policy-summary">
            <h5>{{ ft(profile.primary.insurerName || 'Policy awaiting review') }}</h5>
            <p>{{ ft("Member ID:") }} {{ ft(profile.primary.memberId || 'Missing') }} {{ ft("· Subscriber:") }} {{ ft(profile.primary.subscriberName || 'Missing') }}</p>
            <p>{{ ft("Coverage submitted for:") }} {{ ft(profile.clientIds.map(id => data.clients.find(c => Number(c.clientId) === id)?.clientName).filter(Boolean).join(', ') || 'No client selected') }}</p>
            <p>{{ ft("The office reviews coverage and determines primary and secondary billing before submitting claims.") }}</p>
            <p v-if="profile.secondary">{{ ft("Secondary:") }} {{ profile.secondary.insurerName }} {{ ft("· Member ID:") }} {{ profile.secondary.memberId }}</p>
            <details v-if="profile.missingClaimFields.length"><summary>{{ ft("Information needed for claims") }}</summary><ul><li v-for="issue in profile.missingClaimFields" :key="issue">{{ issue }}</li></ul></details>
            <button class="btn btn-secondary" type="button" @click="editInsurance(profile)">{{ ft("Review coverage / apply to clients") }}</button>
          </article>
        </section>
        <form v-if="!learningOnly && insuranceDraft" ref="insuranceForm" class="billing-card" @submit.prevent="saveInsurance">
          <h4>{{ ft("Insurance coverage") }}</h4>
          <label>{{ ft("Policy scope") }}<select v-model="insuranceDraft.coverageScope"><option value="client">{{ ft("One client") }}</option><option value="account_holder">{{ ft("Account holder and covered dependents") }}</option></select></label>
          <fieldset><legend>{{ ft("Clients covered by this policy") }}</legend><label v-for="client in insurableClients" :key="client.clientId" class="check"><input v-model="insuranceDraft.clientIds" type="checkbox" :value="Number(client.clientId)" /> {{ client.clientName }}</label></fieldset>
          <InsuranceCardReader :key="`primary:${draftVersion}`" :agency-id="agencyId" :client-id="insuranceDraft.clientIds[0]" :disabled="busy" @fields="applyCardFields('primary',$event)" @files="cardFiles.primary=$event"/><h5>{{ ft("Your policy") }}</h5><p>{{ ft("The office determines whether this is primary or secondary coverage for each client.") }}</p><InsurancePolicyFields :scope-key="`${insuranceDraft.clientIds.join(',')}:${draftVersion}:primary`" v-model="insuranceDraft.primary" />
          <label class="check"><input v-model="hasSecondary" type="checkbox" /> {{ ft("Add another policy you hold") }}</label>
          <template v-if="hasSecondary"><InsuranceCardReader :key="`secondary:${draftVersion}`" :agency-id="agencyId" :client-id="insuranceDraft.clientIds[0]" :disabled="busy" @fields="applyCardFields('secondary',$event)" @files="cardFiles.secondary=$event"/><h5>{{ ft("Additional policy") }}</h5><InsurancePolicyFields :scope-key="`${insuranceDraft.clientIds.join(',')}:${draftVersion}:secondary`" v-model="insuranceDraft.secondary" /></template>
          <label class="check"><input v-model="coverageConfirmed" type="checkbox" required /> {{ ft("I confirm that the selected clients are covered. I have checked the subscriber and member details; I understand the office must verify benefits.") }}</label>
          <div class="actions"><button class="btn btn-primary" :disabled="busy || !coverageConfirmed">{{ ft("Save coverage") }}</button><button class="btn btn-secondary" type="button" @click="insuranceDraft = null">{{ ft("Cancel") }}</button></div>
        </form>
      </template>
    </template>
  </div>
</template>
<script setup>
import {useFamilyLocale} from '../../composables/useFamilyLocale';
const {ft,locale:familyLocale}=useFamilyLocale();
import InsuranceCardReader from '../billing/InsuranceCardReader.vue';
import InsuranceCardTasks from '../billing/InsuranceCardTasks.vue';
import { ref, computed, watch, nextTick } from 'vue';
import api from '../../services/api';
import SecureCardSetup from '../billing/SecureCardSetup.vue';
import QaTestCardSetup from '../billing/QaTestCardSetup.vue';
import QaPendingPayments from '../billing/QaPendingPayments.vue';
import InsurancePolicyFields from '../billing/InsurancePolicyFields.vue';
const insuranceRevision = ref(0),draftVersion=ref(0),cardFiles=ref({primary:{},secondary:{}});
function applyCardFields(slot,fields){if(!insuranceDraft.value)return;for(const [key,value] of Object.entries(fields))if(value&&!insuranceDraft.value[slot][key])insuranceDraft.value[slot][key]=value;coverageConfirmed.value=false;}
const props = defineProps({ agencyId:[Number,String], guardianUserId:[Number,String], clientId:[Number,String], learningOnly:Boolean, section:{type:String,default:'all'} });
const data = ref(null), loading = ref(false), error = ref(''), notice = ref(''), busy = ref(false), showCard = ref(false), removingCard = ref(null), authorization = ref(null), signature = ref(''), accepted = ref(false), limitDollars = ref(''), cardSelections = ref({}), insuranceDraft = ref(null), hasSecondary = ref(false), coverageConfirmed = ref(false);
const scopedClients = computed(() => (data.value?.clients || []).filter(c => !props.clientId || Number(c.clientId) === Number(props.clientId)));
const scopedProfiles = computed(() => (data.value?.profiles || []).filter(p => !props.clientId || p.clientIds?.some(id => Number(id) === Number(props.clientId))));
const manageableClients = computed(() => scopedClients.value.filter(c => c.canManageBilling));
const paymentEligibleClients=computed(()=>scopedClients.value.filter(c=>c.canSaveCard));
const insurableClients = computed(() => props.learningOnly ? [] : scopedClients.value.filter(c => c.insuranceApplicable !== false && (c.canManageInsurance ?? c.canManageBilling)));
const expired = card => Number(card.card_exp_year) < new Date().getFullYear() || (Number(card.card_exp_year) === new Date().getFullYear() && Number(card.card_exp_month) < new Date().getMonth() + 1);
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
  const consent = {accepted:accepted.value,version:data.value.termsVersion,signatureName:signature.value,locale:familyLocale.value};
  await perform(async () => { await api.post(`/guardian-billing/clients/${a.client.clientId}/${a.purpose === 'recurring' ? 'payment-method' : 'responsibility'}`,{agencyId:props.agencyId,consent,...(a.purpose === 'recurring' ? {cardId:a.client.paymentCardId,recurring:true,limitCents:Math.round(Number(limitDollars.value)*100)} : {})}); authorization.value=null; },'Authorization saved.');
}
function assign(client) { return perform(() => api.post(`/guardian-billing/clients/${client.clientId}/payment-method`,{agencyId:props.agencyId,cardId:cardSelections.value[client.clientId],recurring:false}),'Card assigned. Recurring billing requires separate authorization.'); }
function revoke(client) { return perform(() => api.delete(`/guardian-billing/clients/${client.clientId}/recurring`,{params:{agencyId:props.agencyId}}),'Recurring authorization revoked.'); }
function removeCard() { const id=removingCard.value.id; return perform(async () => {await api.delete(`/guardian-billing/payment-cards/${id}`,{params:{agencyId:props.agencyId}});removingCard.value=null;},'Card removed and its authorizations revoked.'); }
function cardSaved() { showCard.value=false; notice.value='Card saved. Select which clients will use it.'; void load(); }
const insuranceForm = ref(null);
async function editInsurance(profile) { draftVersion.value++;cardFiles.value={primary:{},secondary:{}};insuranceDraft.value={profileId:profile?.id,coverageScope:profile?.coverageScope || 'client',clientIds:[...(profile?.clientIds || (props.clientId ? [Number(props.clientId)] : []))],primary:{...(profile?.primary || {})},secondary:{...(profile?.secondary || {})}}; hasSecondary.value=!!profile?.secondary; coverageConfirmed.value=false; await nextTick(); insuranceForm.value?.scrollIntoView?.({block:"start",behavior:"smooth"}); insuranceForm.value?.querySelector("input,select")?.focus({preventScroll:true}); }
async function saveInsurance() {
 if(busy.value||!insuranceDraft.value||!coverageConfirmed.value)return;
 const payload={...insuranceDraft.value,agencyId:props.agencyId,coverageConfirmed:coverageConfirmed.value,secondary:hasSecondary.value?insuranceDraft.value.secondary:null};
 const files=Object.entries(cardFiles.value).filter(([slot])=>slot==='primary'||hasSecondary.value).flatMap(([slot,sides])=>Object.entries(sides).map(([side,file])=>({slot:`${slot}_${side}`,file})));
 busy.value=true;error.value='';notice.value='';const current=generation;
 try{
  const {data:result}=await api.post('/guardian-billing/insurance',payload);
  if(current!==generation)return;
  insuranceDraft.value.profileId=result.profileId; // retries update this policy, never create duplicates
  if(files.length){const {data:tasks}=await api.get('/family-billing/insurance-cards',{params:{agencyId:props.agencyId}});const task=tasks.tasks.find(t=>Number(t.profileId)===Number(result.profileId));if(!task)throw new Error('Coverage saved. Card upload is unavailable; refresh and try the card upload section.');
   for(const item of files){if(!task.uploadSlots.includes(item.slot))continue;const form=new FormData();form.append('file',item.file);form.append('slot',item.slot);form.append('cycle',task.cycle);await api.post(`/family-billing/insurance-cards/${result.profileId}/upload`,form,{params:{agencyId:props.agencyId},headers:{'Content-Type':'multipart/form-data'}});}
  }
  if(current!==generation)return;insuranceDraft.value=null;cardFiles.value={primary:{},secondary:{}};insuranceRevision.value++;notice.value='Your coverage and selected card images were saved for billing review.';await load();
 }catch(e){if(current===generation)error.value=e.response?.data?.error?.message||e.message||'Coverage could not be saved. Please try again.';}finally{busy.value=false;}
}
watch(()=>[props.agencyId,props.guardianUserId,props.clientId,props.section,props.learningOnly],()=>{showCard.value=false;authorization.value=null;insuranceDraft.value=null;removingCard.value=null;notice.value='';void load();},{immediate:true});
</script>
<style scoped>
.family-billing{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.family-billing>header,.family-billing>.client-grid,.family-billing>p,.family-billing>form{grid-column:1/-1}.family-billing>header p{font-size:14px;color:#566b84;margin-top:6px}.family-billing .section-head h4{font-size:18px;color:#1d3554}.family-billing .saved-row{background:var(--portal-tint,#f2f6fb);padding:18px;border:1px solid #e0e8f3}.family-billing .policy-summary{border-color:#dfe8f1;padding:20px}.family-billing .policy-summary h5{color:var(--portal-accent,#2459ad);font-size:20px}.family-billing .billing-card{box-shadow:0 3px 14px #193e7310}.family-billing input,.family-billing select{font:inherit}.family-billing :deep(.btn-primary){background:var(--portal-accent,#2459ad);color:var(--portal-on-accent,#fff)}
@media(max-width:1100px){.family-billing{grid-template-columns:minmax(0,1fr)}}

.family-billing { display:grid; gap:20px; color:var(--text-primary,#0f172a); } header p { max-width:850px; } h3,h4,h5 { margin:0 0 10px; } h5 {font-size:16px} p {line-height:1.5} .client-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px} .billing-card {padding:22px;border:1px solid var(--border,#cbd5e1);border-radius:14px;background:white;display:grid;gap:12px;align-content:start} .billing-card p {margin:0} .section-head,.saved-row,.actions {display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap} .saved-row {padding:12px;background:#f8fafc;border-radius:8px} label {display:grid;gap:6px} input:not([type=checkbox]),select {padding:10px;border:1px solid #94a3b8;border-radius:7px;max-width:100%;color:#0f172a;background:white} .check {display:flex;align-items:flex-start;gap:10px}.check input {margin-top:4px}form.billing-card {scroll-margin-top:190px}.authorization {border-color:#2563eb}.notice {padding:14px;background:#eff6ff;border-radius:8px}.error {color:#b91c1c}.status {color:#334155;font-weight:600}.policy-summary {padding:16px;border:1px solid #cbd5e1;border-radius:10px;display:grid;gap:10px} fieldset {border:1px solid #cbd5e1;border-radius:8px;display:grid;gap:10px}button {white-space:normal;text-align:left}
</style>
