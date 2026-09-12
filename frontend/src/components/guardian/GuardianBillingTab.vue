<template>
  <section class="guardian-ledger">
    <h4>Charges for the selected client</h4>
    <p v-if="loading" role="status">Loading charges…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="!loading && access">
      <p v-if="!ledger.length">No charges on file.</p>
      <article v-for="charge in ledger" :key="charge.id" class="charge">
        <div><strong>{{ money(charge.total_cents) }}</strong><p>{{ charge.charge_type?.replaceAll('_',' ') || 'Session charge' }} · {{ charge.charge_status }}</p><small v-if="charge.created_at">{{ new Date(charge.created_at).toLocaleDateString() }}</small></div>
        <button v-if="['PENDING','AUTHORIZED','FAILED'].includes(charge.charge_status)" class="btn btn-primary" :disabled="!!paying" @click="pay(charge)">{{ paying === charge.id ? 'Processing…' : `Pay ${money(charge.total_cents)} with my assigned card` }}</button>
      </article>
      <section aria-label="Session credits and subscriptions">
        <h4>Session credits</h4>
        <p v-if="accountError" role="alert">{{ accountError }}</p>
        <p v-if="credits">Individual: {{ credits.individualTokens }} · Group: {{ credits.groupTokens }}</p>
        <details v-if="creditHistory.length"><summary>Credit history</summary><p v-for="entry in creditHistory" :key="entry.id">{{ entry.token_type }} · {{ entry.direction === 'DEBIT' ? '−' : '+' }}{{ entry.quantity }} · {{ entry.reason_code?.replaceAll('_',' ') }}</p></details>
        <h4>Your subscriptions</h4>
        <p v-if="!accountError && !subscriptions.length">No subscriptions on file for your payer account.</p>
        <article v-for="subscription in subscriptions" :key="subscription.id" class="charge">
          <div><strong>{{ subscription.plan_name }}</strong><p>{{ subscription.status }}</p></div>
          <div class="subscription-actions" v-if="['ACTIVE','PAUSED'].includes(subscription.status)">
            <button v-if="subscription.status === 'ACTIVE'" class="btn btn-secondary" :disabled="!!updatingSubscription" @click="updateSubscription(subscription, 'PAUSED')">Pause subscription</button>
            <button class="btn btn-secondary" :disabled="!!updatingSubscription" @click="updateSubscription(subscription, 'CANCELLED')">Cancel subscription</button>
          </div>
        </article>
      </section>
    </template>
    <p v-else-if="!loading && !error">Responsible payer: {{ payerNames || 'Not yet designated' }}</p>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import { loadStripe } from '@stripe/stripe-js';
const props = defineProps({agencyId:[Number,String],clientId:[Number,String]});
const loading=ref(false),error=ref(''),notice=ref(''),access=ref(false),payerNames=ref(''),ledger=ref([]),paying=ref(null);
const credits=ref(null),creditHistory=ref([]),subscriptions=ref([]),accountError=ref(''),updatingSubscription=ref(null);
let sequence=0;
const money=cents=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(cents)/100);
async function load() {
  const seq=++sequence;credits.value=null;creditHistory.value=[];subscriptions.value=[];accountError.value='';ledger.value=[];access.value=false;error.value='';payerNames.value='';
  if(!props.agencyId || !props.clientId)return;
  loading.value=true;
  try {
    const overview=await api.get('/guardian-billing/overview',{params:{agencyId:props.agencyId}});
    if(seq!==sequence)return;
    const client=overview.data.clients.find(c=>Number(c.clientId)===Number(props.clientId));
    payerNames.value=(client?.responsiblePayers || []).map(p=>p.name).join(', ');
    if(!client?.canManageBilling)return;
    const res=await api.get(`/learning-billing/clients/${props.clientId}/ledger`,{params:{agencyId:props.agencyId}});
    if(seq!==sequence)return;access.value=true;ledger.value=res.data.ledger || [];
    const extra=await Promise.allSettled(['tokens','token-ledger','subscriptions'].map(path=>api.get(`/learning-billing/clients/${props.clientId}/${path}`,{params:{agencyId:props.agencyId}})));
    if(seq!==sequence)return;
    if(extra[0].status==='fulfilled' && extra[0].value.data.individualTokens !== undefined)credits.value=extra[0].value.data;
    if(extra[1].status==='fulfilled')creditHistory.value=extra[1].value.data.entries || [];
    if(extra[2].status==='fulfilled')subscriptions.value=extra[2].value.data.subscriptions || [];
    if(extra.some(result=>result.status==='rejected'))accountError.value='Some credit or subscription details could not be loaded. Refresh to try again.';
  } catch(e) {if(seq===sequence)error.value=e.response?.data?.error?.message || 'Charges could not be loaded';}
  finally {if(seq===sequence)loading.value=false;}
}
async function updateSubscription(subscription,status) {
  if(updatingSubscription.value)return;
  updatingSubscription.value=subscription.id;const seq=sequence;error.value='';
  try {await api.post(`/learning-billing/subscriptions/${subscription.id}/status`,{status});if(seq===sequence)await load();}
  catch(e){if(seq===sequence)error.value=e.response?.data?.error?.message || 'Subscription could not be updated';}
  finally{updatingSubscription.value=null;}
}
async function pay(charge) {
  if(paying.value)return;paying.value=charge.id;error.value='';notice.value='';const seq=sequence;
  try {
    const payload={agencyId:props.agencyId,chargeId:charge.id,expectedAmountCents:Number(charge.total_cents)};
    let result=await api.post('/learning-billing/payments/intent',payload);
    if(seq!==sequence)return;
    if(result.data.requiresAction){const stripe=await loadStripe(result.data.publishableKey,{stripeAccount:result.data.connectedAccountId});const confirmation=await stripe.confirmCardPayment(result.data.clientSecret,result.data.paymentMethodId ? {payment_method:result.data.paymentMethodId} : {});if(confirmation.error)throw new Error(confirmation.error.message);if(seq!==sequence)return;result=await api.post('/learning-billing/payments/intent',payload);}
    if(seq!==sequence)return;if(result.data.paid!==true)throw new Error('Payment is not yet confirmed');notice.value='Payment confirmed by Stripe.';await load();
  }
  catch(e){if(seq===sequence)error.value=e.response?.data?.error?.message || e.message || 'Payment failed';}
  finally{paying.value=null;}
}
watch(()=>[props.agencyId,props.clientId],()=>{notice.value='';void load();},{immediate:true});
</script>
<style scoped>.guardian-ledger{display:grid;gap:14px}.charge{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;padding:18px;border:1px solid #cbd5e1;border-radius:10px;background:white}p[role=alert]{color:#b91c1c}.charge p{margin:6px 0}.subscription-actions{display:flex;flex-wrap:wrap;gap:8px}</style>
