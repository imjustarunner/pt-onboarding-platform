<template>
 <section class="billing-batches panel">
  <h2>Authorized ready-claims batches</h2>
  <p>Only server-verified ready claims appear here. Identifying claim details remain in the secure billing service.</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <button type="button" :disabled="busy" @click="load">Refresh ready batches</button>
  <p v-if="!busy&&!batches.length">No owner-requested ready batch is available.</p>
  <article v-for="batch in batches" :key="batch.ref">
   <h3>{{ batch.rule.ruleNumber }} · revision {{ batch.rule.revision }}</h3>
   <p>Based on rule {{ batch.rule.ruleNumber }} v{{ batch.rule.revision }} and authorization by {{ batch.rule.authorizedBy }}, performed by Billing Assistant.</p>
   <p>{{ batch.items.length }} ready items · expires {{ new Date(batch.expiresAt).toLocaleString() }}</p>
   <details><summary>Rule instructions</summary><ol><li v-for="line in batch.rule.instructions" :key="line">{{ line }}</li></ol></details>
   <ul><li v-for="item in batch.items" :key="item.ref">{{ item.ref }} · {{ item.status }} · All required checks passed</li></ul>
   <button type="button" :disabled="busy" @click="submit(batch)">Submit these authorized ready claims</button>
  </article>
 </section>
</template>
<script setup>
import {ref,onMounted} from 'vue';
import api from '../../services/api';
const batches=ref([]),busy=ref(false),error=ref(''),notice=ref('');
async function load(){busy.value=true;error.value='';try{const{data}=await api.get('/assistant-work/billing/batches');batches.value=data.batches||[];}catch(e){batches.value=[];error.value=e.response?.data?.error?.message||'Ready batches are unavailable.';}finally{busy.value=false;}}
async function submit(batch){if(busy.value)return;busy.value=true;error.value='';try{
 const{data}=await api.post(`/assistant-work/billing/batches/${batch.ref}/submit`,{ruleNumber:batch.rule.ruleNumber,ruleRevision:batch.rule.revision,itemRefs:batch.items.map(i=>i.ref)});
 const sent=(data.results||[]).filter(r=>r.status==='CLAIMMD_ACKNOWLEDGED').length,held=(data.results||[]).length-sent;
 notice.value=`${sent} acknowledged by Claim.MD; ${held} held for billing review. Acknowledgement does not confirm payer acceptance or payment.`;
 if(data.reconciliationRequired)notice.value+=' The batch stopped for reconciliation. Do not retry it.';
 batches.value=batches.value.filter(b=>b.ref!==batch.ref);
 }catch(e){batches.value=[];error.value=e.response?.data?.error?.message||'Submission outcome needs reconciliation. Do not retry the batch.';}finally{busy.value=false;}}
onMounted(load);
</script>
<style scoped>
.billing-batches{display:grid;gap:16px}.billing-batches article{padding-top:16px;border-top:1px solid #d8e3e8}.billing-batches li{overflow-wrap:anywhere;line-height:1.6}.billing-batches button{padding:10px 14px}.billing-batches [role=alert]{color:#9b2222}
</style>
