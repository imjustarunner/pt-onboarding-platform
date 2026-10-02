<template><section class="payment-preference"><h3>How would you like to share payments?</h3>
<p>Propose an arrangement for copays or other verified patient responsibility. The office and affected payers must agree before billing shares change. This does not authorize a charge.</p>
<p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
<form @submit.prevent="save"><label>My proposed arrangement<select v-model="preference.arrangement"><option value="discuss">Discuss with the office</option><option value="all">I am willing to pay all</option><option value="part">I am willing to pay a share</option><option value="alternate">Alternate sessions with another payer</option></select></label>
<label v-if="preference.arrangement==='part'">My share (%)<input v-model.number="preference.percent" type="number" min="0.01" max="99.99" step="0.01" required /></label>
<label>Agreement details or questions<textarea v-model="preference.notes" maxlength="2000" rows="2" /></label><button :disabled="busy">{{ busy?'Saving…':'Save proposal' }}</button></form></section></template>
<script setup>
import {reactive,ref,watch} from 'vue';import api from '../../services/api.js';
const props=defineProps({agencyId:[String,Number],clientId:[String,Number]});const preference=reactive({arrangement:'discuss',percent:50,notes:''}),error=ref(''),message=ref(''),busy=ref(false);let sequence=0;
async function load(){const own=++sequence;error.value='';message.value='';Object.assign(preference,{arrangement:'discuss',percent:50,notes:''});if(!props.clientId)return;try{const {data}=await api.get('/family-billing/payment-preference',{params:{agencyId:props.agencyId,clientId:props.clientId}});if(own===sequence&&data.preference)Object.assign(preference,data.preference);}catch(e){if(own===sequence)error.value=e.response?.data?.error?.message||'Please accept payment responsibility in Payment methods before proposing an arrangement.';}}
async function save(){busy.value=true;error.value='';try{await api.put('/family-billing/payment-preference',{...preference,agencyId:props.agencyId,clientId:props.clientId});message.value='Proposal saved for billing review. Your current payment agreement is unchanged.';}catch(e){error.value=e.response?.data?.error?.message||'Could not save your proposal.';}finally{busy.value=false;}}
watch(()=>[props.agencyId,props.clientId],load,{immediate:true});
</script>
<style scoped>.payment-preference{border:1px solid #dce4ee;border-radius:10px;padding:20px;margin:16px 0}.payment-preference label{display:grid;gap:6px;margin:12px 0}.payment-preference input,.payment-preference textarea,.payment-preference select{padding:8px;max-width:100%}.payment-preference button{padding:8px 12px}</style>
