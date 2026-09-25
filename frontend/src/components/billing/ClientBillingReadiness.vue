<template>
  <section class="card readiness">
    <h2>Client billing readiness</h2>
    <p>Missing insurance never means self-pay. Verify coverage or agreed self-pay terms before releasing patient balances.</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="message" role="status">{{ message }}</p>
    <label>Client<select v-model="clientId"><option :value="null">Select a client</option><option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option></select></label>
    <form v-if="clientId" @submit.prevent="save">
      <label>Payment basis<select v-model="coverageMode"><option value="unknown">Coverage not yet verified</option><option value="insured">Verified insurance</option><option value="self_pay">Explicitly agreed self-pay</option></select></label>
      <label>Billing setup<select v-model="setupStatus"><option value="incomplete">Incomplete — hold patient billing</option><option value="ready">Ready — responsibility verified</option><option value="paused">Paused — review required</option></select></label>
      <label>Automatic copays<select v-model="collectionPolicy"><option value="manual">Manual payments only</option><option value="verified_copay">Verified copay after completed visit</option><option value="after_era">Wait for verified payer remittance</option></select></label>
      <p>Automatic collection uses only the responsible payer’s assigned card and current signed recurring authorization. Enabling it does not collect historical balances. Medicaid-protected services cannot be charged to the family.</p>
      <label>Verification evidence / agreed self-pay terms<textarea v-model="reason" required maxlength="2000" rows="3" /></label>
      <button :disabled="busy || !reason.trim()">{{ busy ? 'Saving…' : 'Save billing setup' }}</button>
    </form>
  </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:[Number,String],clients:{type:Array,default:()=>[]}});
const profiles=ref([]),clientId=ref(null),coverageMode=ref('unknown'),setupStatus=ref('incomplete'),collectionPolicy=ref('manual'),reason=ref(''),busy=ref(false),error=ref(''),message=ref('');
let generation=0;
watch(()=>props.agencyId,async()=>{const own=++generation;profiles.value=[];clientId.value=null;error.value='';message.value='';if(!props.agencyId)return;try{const result=await api.get('/family-billing/staff/readiness',{params:{agencyId:props.agencyId}});if(own===generation)profiles.value=result.data.profiles;}catch{if(own===generation)error.value='Billing readiness could not be loaded.';}},{immediate:true});
watch(clientId,()=>{const p=profiles.value.find(p=>Number(p.clientId)===Number(clientId.value));coverageMode.value=p?.coverageMode||'unknown';setupStatus.value=p?.setupStatus||'incomplete';collectionPolicy.value=p?.collectionPolicy||'manual';reason.value='';message.value='';});
async function save(){if(busy.value)return;busy.value=true;error.value='';const own=generation,id=clientId.value;try{const payload={agencyId:props.agencyId,coverageMode:coverageMode.value,setupStatus:setupStatus.value,collectionPolicy:collectionPolicy.value,reason:reason.value};await api.post(`/family-billing/staff/clients/${id}/readiness`,payload);if(own!==generation)return;profiles.value=[...profiles.value.filter(p=>Number(p.clientId)!==Number(id)),{clientId:id,...payload}];message.value='Billing setup saved. No card was charged.';}catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Billing setup could not be saved.';}finally{busy.value=false;}}
</script>
<style scoped>
.readiness{padding:24px;background:var(--card-bg,#fff);border:1px solid var(--border-color,#d8e1ed);border-radius:12px;margin-bottom:20px}.readiness label{display:grid;gap:8px;margin:16px 0}.readiness select,.readiness textarea{padding:10px;border:1px solid #aabbd0;border-radius:6px;max-width:640px;font:inherit}.readiness p{max-width:800px;line-height:1.5}.readiness button{padding:10px 16px;font:inherit}.readiness [role=alert]{color:#a21c28}
</style>
