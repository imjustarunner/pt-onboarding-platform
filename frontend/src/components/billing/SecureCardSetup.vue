<template>
  <section v-if="collectionAllowed" class="secure-card">
    <p>{{ tx("Card details go directly to Stripe. Your selected clients and other guardians cannot view your card.") }}</p>
    <p v-if="loading" role="status">{{ tx("Preparing secure card form…") }}</p>
    <template v-else-if="ready && !saved">
      <label>{{ tx("Cardholder name") }} <input v-model="name" autocomplete="cc-name" maxlength="255" /></label>
      <StripeCardEntry ref="cardEntry" :publishable-key="config.publishableKey" :connected-account-id="config.connectedAccountId" :client-secret="clientSecret" :email="billingEmail" :name="name" :context-key="identityKey" :enabled="collectionAllowed" :disabled="busy" :locale="intakeLocale" @change="complete=$event.complete; error=$event.error?.message || ''" @error="error=$event" />
      <details open><summary>{{ tx("Card storage and billing authorization") }}</summary><p>{{ tx(terms) }}</p></details>
      <label class="check"><input v-model="accepted" type="checkbox" /> {{ tx("I have read and accept this authorization to store my card.") }}</label>
      <p>{{ tx("Saving a card does not enable recurring charges. You authorize recurring billing separately for each client in Billing.") }}</p>
      <button type="button" class="btn btn-primary" :disabled="busy || !accepted || !name.trim() || !complete" @click="save">{{ tx(busy ? 'Saving…' : 'Save card securely') }}</button>
    </template>
    <p v-if="saved" role="status">{{ txFmt('{brand} ending in {last4} saved.', saved) }}</p>
    <p v-if="error" role="alert" class="error">{{ tx(error) }}</p>
    <button v-if="!loading && !ready" type="button" class="btn btn-secondary" @click="initialize">{{ tx("Retry secure card setup") }}</button>
  </section>
</template>
<script setup>
import { computed, getCurrentInstance, ref, onBeforeUnmount, inject, watch } from 'vue';
import {useAuthStore} from '../../store/auth';
import StripeCardEntry from './StripeCardEntry.vue';
import {hasMedicaidCoverage} from '../../utils/insurancePaymentPolicy.js';
import {enrollmentCoverageFingerprint} from '../../utils/enrollmentCoverage.js';
import api from '../../services/api';
import { useIntakeStepTx } from '../../composables/useIntakeStepTx.js';
const { tx, txFmt, intakeLocale } = useIntakeStepTx();
const props = defineProps({ agencyId: [String, Number], publicKey: String, submissionId: [String, Number], ownerKey:[String,Number], email:String, insuranceInfo:{type:Object,default:null}, paymentOnly:Boolean, collectionAllowed:{type:Boolean,default:true} });
const emit = defineEmits(['saved', 'unavailable']);
const intakeSession = inject('intakeSessionToken', ref(''));
const cardEntry = ref(null), loading = ref(true), ready = ref(false), busy = ref(false), error = ref(''), name = ref(''), accepted = ref(false), complete = ref(false), saved = ref(''), terms = ref('');
const pinia=getCurrentInstance()?.proxy?.$pinia;
const authStore=pinia?useAuthStore(pinia):null;
const identity=inject('intakePaymentIdentity',ref(null));
const prepareIntakePayment=inject('prepareIntakePayment',null);
const sourceEligible=ref(true);
const config=ref({}),clientSecret=ref(''),billingEmail=ref('');
const identityKey=computed(()=>`${props.publicKey||''}:${props.submissionId||''}:${props.agencyId||''}:${authStore?.user?.id||props.ownerKey||''}:${props.email||identity.value?.email||''}:${enrollmentCoverageFingerprint(props.insuranceInfo||{})}`);
const externalAllowed=computed(()=>props.collectionAllowed && (!props.publicKey || props.insuranceInfo!==null) && !hasMedicaidCoverage(props.insuranceInfo) && (identity.value?.collectionAllowed !== false) && (props.publicKey||!authStore||!!authStore.user?.id));
const collectionAllowed=computed(()=>externalAllowed.value && sourceEligible.value);
let termsVersion,disposed=false,requestGeneration=0;
const intake = () => !!props.publicKey;
const requestOptions = () => intake() ? { headers: { 'x-intake-session': intakeSession.value } } : {};
const coverageReview=()=>({coverageReviewed:true,coverageFingerprint:enrollmentCoverageFingerprint(props.insuranceInfo||{})});
async function initialize() {
  const generation=++requestGeneration;
  loading.value = true; ready.value = false; error.value = '';name.value='';billingEmail.value='';terms.value='';busy.value=false;complete.value=false;saved.value='';accepted.value=false;config.value={};clientSecret.value='';
  if(!collectionAllowed.value){loading.value=false;return;}
  try {
    if(intake()&&prepareIntakePayment)await prepareIntakePayment();
    if(disposed||generation!==requestGeneration||!collectionAllowed.value)return;
    let cfg;
    if(intake())cfg=(await api.get(`/public-intake/${props.publicKey}/stripe-config`)).data;
    else{
      const overview=(await api.get('/guardian-billing/overview',{params:{agencyId:props.agencyId}})).data;
      if(disposed||generation!==requestGeneration)return;
      if(Array.isArray(overview.clients)&&!overview.clients.some(client=>client.canManageBilling&&!client.medicaid)){sourceEligible.value=false;return;}
      cfg=overview.stripe;
    }
    if(disposed||generation!==requestGeneration||!collectionAllowed.value)return;
    if(cfg?.testModeRequired && cfg?.mode!=='test')throw new Error('Secure card collection for this QA organization requires an isolated test-mode payment configuration.');
    if (!cfg?.publishableKey || !cfg?.connectedAccountId) { emit('unavailable'); throw new Error('Card collection is not available for this organization yet. Please contact the office about payment arrangements.'); }
    const setup = await api.post(intake() ? `/public-intake/${props.publicKey}/${props.submissionId}/stripe-setup-intent` : '/guardian-billing/card-setup', intake() ? coverageReview() : { agencyId: props.agencyId }, requestOptions());
    if(disposed||generation!==requestGeneration||!collectionAllowed.value)return;
    clientSecret.value=setup.data.clientSecret;terms.value=setup.data.terms;termsVersion=setup.data.termsVersion;
    billingEmail.value=String(setup.data.billingEmail || props.email || identity.value?.email || '').trim();
    config.value={publishableKey:cfg.publishableKey,connectedAccountId:setup.data.connectedAccountId};
    ready.value=true;
  } catch (e) { if(disposed||generation!==requestGeneration)return;ready.value = false; error.value = e.response?.data?.error?.message || e.message || 'Secure card setup failed'; }
  finally { if(generation===requestGeneration&&!disposed)loading.value = false; }
}
async function save() {
  if (busy.value || !accepted.value || !name.value.trim() || !complete.value) return;
  busy.value = true; error.value = '';
  const generation=requestGeneration;
  try {
    if(intake()&&prepareIntakePayment)await prepareIntakePayment();
    if(disposed||generation!==requestGeneration||!collectionAllowed.value)return;
    const result = await cardEntry.value.confirmSetup();
    if (disposed || generation!==requestGeneration || !collectionAllowed.value) return;
    if (result.error) throw new Error(result.error.message);
    const payload = { ...(intake()?coverageReview():{}), agencyId: props.agencyId, setupIntentId: result.setupIntent.id, consent: { accepted: true, version: termsVersion, signatureName: name.value.trim() } };
    if(intake()&&prepareIntakePayment)await prepareIntakePayment();
    if(disposed||generation!==requestGeneration||!collectionAllowed.value)return;
    const response = await api.post(intake() ? `/public-intake/${props.publicKey}/${props.submissionId}/payment-card` : '/guardian-billing/card-setup/complete', payload, requestOptions());
    if (disposed || generation!==requestGeneration || !collectionAllowed.value) return;
    const value = response.data.card || { id: response.data.cardId, card_brand: response.data.brand, card_last4: response.data.last4 };
    saved.value = { brand: value.card_brand, last4: value.card_last4 };
    emit('saved', value);
  } catch (e) { if(disposed||generation!==requestGeneration)return;error.value = e.response?.data?.error?.message || e.message || 'Card could not be saved'; }
  finally { if(generation===requestGeneration&&!disposed)busy.value = false; }
}
watch([identityKey,externalAllowed],()=>{sourceEligible.value=true;void initialize();},{immediate:true});
onBeforeUnmount(() => { disposed = true; requestGeneration++; });
</script>
<style scoped>
.secure-card { display:grid; gap:14px; max-width:700px; } label { display:grid; gap:6px; } input:not([type=checkbox]) { padding:10px; border:1px solid var(--app-line, #94a3b8); border-radius:6px; } .check { display:flex; align-items:flex-start; gap:10px; } .card-host { padding:16px; border:1px solid var(--app-line, #94a3b8); border-radius:8px; min-height:52px; background:var(--bg-card); } p { margin:0; line-height:1.5; } details { padding:12px; background:var(--bg-muted); border-radius:8px; } details p { padding-top:10px; } .error { color:var(--app-text-red, #b91c1c); }
</style>
