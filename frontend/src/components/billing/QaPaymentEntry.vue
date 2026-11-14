<script setup>
import {ref} from 'vue';
import api from '../../services/api.js';
const props=defineProps({agencyId:[Number,String],intentId:String,disabled:Boolean});
const number=ref(''),scenario=ref('success'),error=ref('');
async function confirmPayment(){
 error.value='';
 if(number.value.replace(/\s/g,'')!=='0000000000000000')return {error:{message:'Enter sixteen zeros for this QA simulation. Do not use a real card.'}};
 try{
  const {data}=await api.post(`/qa-payments/intents/${props.intentId}/confirm`,{agencyId:Number(props.agencyId),testCard:number.value,scenario:scenario.value});
  const intent=data.paymentIntent;
  if(intent?.status!=='succeeded')return {error:{message:intent?.status==='processing'?'Simulated payment is pending. Choose Success and retry to resolve it; no package credit has been issued.':'Simulated payment declined. Choose Success and retry; no payment or package credit was issued.'}};
  return {paymentIntent:intent};
 }catch(e){return {error:{message:e.response?.data?.error?.message||'The QA simulation could not be completed.'}};}
}
defineExpose({confirmPayment,clear(){number.value='';error.value='';},ensureReady:()=>true});
</script>
<template>
 <section class="qa-payment" aria-label="QA payment simulator">
  <strong>QA payment simulator</strong><p>No money moves. Stripe and bank accounts are not contacted.</p>
  <label>Test card — sixteen zeros<input v-model="number" inputmode="numeric" autocomplete="off" maxlength="19" placeholder="0000 0000 0000 0000" :disabled="disabled" aria-describedby="qa-card-instructions" /></label>
  <small id="qa-card-instructions">Use only zeros. Never enter a real card.</small>
  <label>Simulated outcome<select v-model="scenario" :disabled="disabled"><option value="success">Success</option><option value="decline">Decline</option><option value="processing">Pending / processing</option></select></label>
  <p v-if="error" role="alert">{{error}}</p>
 </section>
</template>
<style scoped>.qa-payment{padding:18px;border:2px solid #8c641e;border-radius:10px;background:#fff9e8;color:#503b16}.qa-payment p{line-height:1.6}.qa-payment label{display:grid;gap:8px;margin:14px 0}.qa-payment input,.qa-payment select{min-height:44px;box-sizing:border-box;width:100%;font:inherit;padding:10px}.qa-payment small{display:block}</style>
