<template><section class="scb-payment"><h3>Pay invoice SCB-{{invoice.id}}</h3><p>{{money(invoice.totalCents)}} · {{invoice.kind==='platform_usage'?'Payable to Plot Twist Co':'Payable to MH4Kidz'}}</p><p v-if="error" role="alert">{{error}}</p><p v-if="loading" role="status">Preparing payment…</p><div ref="paymentHost"></div><button v-if="ready" :disabled="busy" class="scb-button" @click="pay">{{busy?'Processing…':`Pay ${money(invoice.totalCents)}`}}</button><button :disabled="busy" class="scb-button scb-outline" @click="$emit('close')">Close</button><p v-if="notice" role="status">{{notice}}</p></section></template>
<script setup>
import {onMounted,onBeforeUnmount,ref} from 'vue';
import {loadStripe} from '@stripe/stripe-js';
import api from '../../services/api';
const props=defineProps({invoice:{type:Object,required:true}}),emit=defineEmits(['paid','close']);
const paymentHost=ref(null),loading=ref(true),error=ref(''),notice=ref(''),busy=ref(false),ready=ref(false);let stripe,elements,paymentElement;
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
onMounted(async()=>{try{const {data}=await api.post(`/schoolcarebridge/operations/invoices/${props.invoice.id}/payment`);if(data.status==='succeeded'){await refresh();return;}stripe=await loadStripe(data.publishableKey,data.connectedAccountId?{stripeAccount:data.connectedAccountId}:undefined);if(!stripe)throw Error('Payment form could not load.');elements=stripe.elements({clientSecret:data.clientSecret});paymentElement=elements.create('payment');paymentElement.mount(paymentHost.value);ready.value=true;}catch(e){error.value=e.response?.data?.error?.message||e.message||'Payment is unavailable.';}finally{loading.value=false;}});
async function refresh(){const {data}=await api.post(`/schoolcarebridge/operations/invoices/${props.invoice.id}/refresh`);if(data.paidAt)emit('paid');else notice.value='Payment is processing. Refresh the invoice to check for its receipt.';}
async function pay(){busy.value=true;error.value='';try{const result=await stripe.confirmPayment({elements,confirmParams:{return_url:window.location.href},redirect:'if_required'});if(result.error)error.value=result.error.message;else await refresh();}catch(e){error.value=e.response?.data?.error?.message||'Payment needs review. Refresh the invoice before retrying.';}finally{busy.value=false;}}
onBeforeUnmount(()=>paymentElement?.destroy());
</script>
<style scoped>.scb-payment{padding:24px;border:2px solid #168a91;border-radius:14px;max-width:650px;background:white}.scb-payment button{margin:20px 10px 0 0}</style>
