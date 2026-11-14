<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api.js';
import QaPaymentEntry from './QaPaymentEntry.vue';
const props=defineProps({agencyId:[Number,String]});
const emit=defineEmits(['resolved']);
const payments=ref([]),selected=ref(null),entry=ref(null),busy=ref(false),error=ref('');
let generation=0;
const money=(payment)=>new Intl.NumberFormat('en-US',{style:'currency',currency:payment.currency}).format(payment.amount/100);
async function load(){
 const own=++generation;payments.value=[];selected.value=null;error.value='';
 try{const {data}=await api.get('/qa-payments/intents',{params:{agencyId:Number(props.agencyId)}});if(own===generation)payments.value=data.payments;}
 catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'QA payment status could not be loaded.';}
}
async function resolve(){
 if(busy.value)return;
 const own=generation;busy.value=true;error.value='';
 try{
  const result=await entry.value.confirmPayment();
  if(own!==generation)return;
  if(result.error){error.value=result.error.message;return;}
  await load();emit('resolved');
 }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'The QA outcome could not be applied. Refresh before retrying.';
 }finally{if(own===generation||!selected.value)busy.value=false;}
}
watch(()=>props.agencyId,load,{immediate:true});
onBeforeUnmount(()=>generation++);
</script>
<template>
 <section aria-label="Pending QA payment simulations">
  <p v-if="error" role="alert">{{error}}</p>
  <div v-if="payments.length">
   <h4>Resolve a QA payment scenario</h4><p>Only your pending or declined simulations appear here. No money moves.</p>
   <ul><li v-for="payment in payments" :key="payment.id">{{money(payment)}} · {{payment.status}} <button type="button" :disabled="busy" @click="selected=payment">Review simulation {{payment.id}}</button></li></ul>
   <template v-if="selected">
    <QaPaymentEntry ref="entry" :key="selected.id" :agency-id="agencyId" :intent-id="selected.id" :disabled="busy" />
    <button type="button" :disabled="busy" @click="resolve">{{busy?'Resolving…':'Apply simulated outcome'}}</button>
   </template>
  </div>
 </section>
</template>
<style scoped>li{overflow-wrap:anywhere;margin:12px 0}button{min-height:44px;padding:10px;font:inherit}</style>
