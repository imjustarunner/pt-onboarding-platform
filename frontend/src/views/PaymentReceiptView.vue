<template>
  <main class="payment-receipt">
    <p v-if="loading" role="status">Opening your payment receipt…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="data">
      <p v-if="data.receipt.simulated" role="status">SIMULATED QA RECORD — no money moved. Stripe and banks were not contacted.</p>
      <header><p>{{ data.receipt.agencyName }}</p><h1>Payment receipt</h1><p>{{ data.receipt.receiptNumber }} · {{ date(data.receipt.receivedAt) }}</p></header>
      <section class="receipt-card" aria-label="Payment details">
        <h2>{{ money(data.receipt.amountCents) }} received</h2>
        <p>{{ data.receipt.payerName }}<span v-if="data.receipt.method"> · {{ data.receipt.method }}</span></p>
        <p v-if="data.receipt.serviceDate">{{ data.receipt.responsibilityType }} · Service date {{ date(data.receipt.serviceDate) }}</p>
        <p v-if="data.receipt.refundedCents">Refunded: {{ money(data.receipt.refundedCents) }} · Net payment: {{ money(data.receipt.netPaidCents) }}</p>
        <button :disabled="busy" @click="download">Download / print receipt</button>
      </section>
      <section v-if="data.credit?.isCredit" class="receipt-card"><h2>Canceled-session credit</h2><p>Available for the next eligible copay: <strong>{{ money(data.credit.availableCents) }}</strong></p><p v-if="data.credit.refundRequested">Your refund request is under review. The related credit is on hold.</p><p v-for="item in data.applications" :key="item.id">{{ item.status==='applied'?'Applied':'Reversed' }} {{ money(item.amountCents) }} · Visit {{ date(item.serviceDate) }} · Balance {{ item.balanceReference }}</p></section>
      <section v-if="data.receipt.responsibilityType==='Copay'" class="receipt-card"><h2>If your session did not occur</h2><p>An automatic copay can be charged before a provider has finished recording a cancellation. If your session did not occur and automatic payments were on, you may request a refund below. Once the session is updated to canceled, the unrefunded copay automatically applies to the next eligible session for the same client, payer and organization. Pending refund requests hold the related credit. Billing reconciles any credit already used before issuing a refund.</p></section>
      <section v-if="data.refundRequests.length" class="receipt-card"><h2>Refund requests</h2><article v-for="request in data.refundRequests" :key="request.id"><p><strong>Request {{ request.id }} · {{ request.status }}</strong> · {{ money(request.amountCents) }}</p><p>{{ request.reason }}</p><p v-if="request.resolution">Billing response: {{ request.resolution }}</p></article></section>
      <form v-if="data.canRequestRefund && !openRequest" id="refund-request" class="receipt-card" @submit.prevent="requestRefund">
        <h2>Request a refund for this payment</h2><p>The request goes directly to billing and stays linked to this receipt. Billing reviews the session correction and any credit already used before processing a refund to the original payment method.</p>
        <label>Amount ($)<input ref="amountInput" v-model="amount" type="number" min="0.01" :max="data.receipt.netPaidCents/100" step="0.01" required /></label>
        <label>Reason<textarea v-model="reason" maxlength="2000" rows="4" required placeholder="For example: the session did not occur and its cancellation was recorded after the automatic copay." /></label>
        <button :disabled="busy">{{ busy?'Sending…':'Send refund request to billing' }}</button>
      </form>
      <p v-if="message" role="status">{{ message }}</p>
      <p class="note">{{ data.receipt.simulated ? 'This receipt records a QA simulation only.' : 'This is a payment receipt, not a new bill. Bank and card details stay with the payment processor.' }}</p>
    </template>
  </main>
</template>
<script setup>
import {ref,computed,watch,nextTick} from 'vue';
import {useRoute} from 'vue-router';
import api from '../services/api';
const route=useRoute(),data=ref(null),loading=ref(false),busy=ref(false),error=ref(''),message=ref(''),amount=ref(''),reason=ref(''),amountInput=ref(null);
const openRequest=computed(()=>data.value?.refundRequests.some(r=>['requested','processing','review'].includes(r.status)));
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:data.value?.receipt.currency||'USD'}).format(Number(value)/100);
const date=value=>String(value||'').slice(0,10);
const params=()=>({agencyId:route.query.agencyId});
let sequence=0;
async function load(){const own=++sequence;data.value=null;error.value='';loading.value=true;try{const result=await api.get(`/family-billing/payments/${encodeURIComponent(route.params.paymentId)}`,{params:params()});if(own!==sequence)return;data.value=result.data;amount.value=(result.data.receipt.netPaidCents/100).toFixed(2);await nextTick();if(route.query.action==='refund'&&!openRequest.value)amountInput.value?.focus();}catch(e){if(own===sequence)error.value=e.response?.data?.error?.message||'This payment is unavailable for your account. Sign in with the account that made the payment.';}finally{if(own===sequence)loading.value=false;}}
async function requestRefund(){busy.value=true;error.value='';try{await api.post(`/family-billing/payments/${encodeURIComponent(route.params.paymentId)}/refund-request`,{...params(),amountCents:Math.round(Number(amount.value)*100),reason:reason.value});await load();message.value='Your refund request was sent to billing and is linked to this payment.';}catch(e){error.value=e.response?.data?.error?.message||'The request could not be sent. Please try again.';}finally{busy.value=false;}}
async function download(){busy.value=true;try{const response=await api.get(`/family-billing/receipts/${encodeURIComponent(route.params.paymentId)}.pdf`,{params:params(),responseType:'blob'});const url=URL.createObjectURL(response.data),a=document.createElement('a');a.href=url;a.download=`${data.value.receipt.receiptNumber}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch{error.value='The receipt could not be downloaded.';}finally{busy.value=false;}}
watch(()=>[route.params.paymentId,route.query.agencyId],()=>{reason.value='';message.value='';void load();},{immediate:true});
</script>
<style scoped>
.payment-receipt{max-width:760px;margin:24px auto;padding:20px;color:var(--text-primary,#26364a)}header{border-top:4px solid #16457c;padding:24px;background:var(--bg-card,#fff)}h1{color:var(--text-primary,#163e70);font-size:28px}.receipt-card{padding:24px;border:1px solid var(--border,#dce4ed);border-radius:10px;margin:18px 0;background:var(--bg-card,#fff);line-height:1.65}h2{font-size:19px}.receipt-card label{display:block;margin:16px 0}.receipt-card input,.receipt-card textarea{display:block;width:100%;box-sizing:border-box;max-width:100%;padding:12px;border:1px solid #aabbd0;border-radius:6px;font:inherit}.receipt-card button{padding:13px 18px;background:#16457c;color:#fff;border:0;border-radius:7px;cursor:pointer;font:inherit}.receipt-card button:disabled{opacity:.6}[role=alert]{color:var(--app-text-red,#ac1a1a)}.note{font-size:13px;color:var(--text-secondary,#627187)}@media(max-width:500px){.payment-receipt{padding:12px;margin:0}.receipt-card,header{padding:18px}}
</style>
