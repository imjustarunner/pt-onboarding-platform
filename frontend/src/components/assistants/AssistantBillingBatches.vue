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
   <ul class="ready-claims"><li v-for="item in batch.items" :key="item.ref">
    <label><input type="checkbox" :checked="selected.includes(item.ref)" :disabled="busy" @change="select(item.ref,$event.target.checked)" />{{ item.ref }} · {{ item.status }}</label>
    <details><summary>All required checks passed</summary><ul><li v-for="check in checkLabels" :key="check">{{ check }}</li></ul></details>
    <button type="button" :disabled="busy" @click="submit(batch,[item.ref])">Submit this claim</button>
   </li></ul>
   <div class="submission-actions">
    <button type="button" :disabled="busy || !selectedIn(batch).length" @click="submit(batch,selectedIn(batch))">Submit selected claims ({{ selectedIn(batch).length }})</button>
    <button type="button" :disabled="busy" @click="submit(batch,batch.items.map(item=>item.ref))">Submit these authorized ready claims</button>
   </div>
  </article>
 </section>
</template>
<script setup>
import {ref,onMounted} from 'vue';
import api from '../../services/api';
const batches=ref([]),selected=ref([]),busy=ref(false),error=ref(''),notice=ref('');
const checkLabels=['Clinical signatures','Required documentation','Insurance coverage and identity','Provider and payer mapping','AI consistency review','Required claim data','Duplicate and prior submission protection'];
const selectedIn=batch=>batch.items.filter(item=>selected.value.includes(item.ref)).map(item=>item.ref);
function select(ref,checked){selected.value=checked?[...new Set([...selected.value,ref])]:selected.value.filter(value=>value!==ref);}
async function refresh(){const{data}=await api.get('/assistant-work/billing/batches');batches.value=data.batches||[];selected.value=[];}
async function load(){busy.value=true;error.value='';try{await refresh();}catch(e){batches.value=[];selected.value=[];error.value=e.response?.data?.error?.message||'Ready batches are unavailable.';}finally{busy.value=false;}}
async function submit(batch,itemRefs){if(busy.value||!itemRefs.length)return;busy.value=true;error.value='';notice.value='';try{
 const{data}=await api.post(`/assistant-work/billing/batches/${batch.ref}/submit`,{ruleNumber:batch.rule.ruleNumber,ruleRevision:batch.rule.revision,itemRefs});
 const sent=(data.results||[]).filter(r=>r.status==='CLAIMMD_ACKNOWLEDGED').length,held=(data.results||[]).length-sent;
 notice.value=`${sent} acknowledged by Claim.MD; ${held} held for billing review. Acknowledgement does not confirm payer acceptance or payment.`;
 if(data.reconciliationRequired)notice.value+=' The batch stopped for reconciliation. Do not retry it.';
 batches.value=batches.value.filter(b=>b.ref!==batch.ref);selected.value=[];
 if(!data.reconciliationRequired&&data.remainingCount>0){try{await refresh();}catch{error.value='Submission results are recorded above. Refresh to load remaining claims; do not resubmit completed claims.';}}
 }catch(e){batches.value=[];selected.value=[];error.value=e.response?.data?.error?.message||'Submission outcome needs reconciliation. Do not retry the batch.';}finally{busy.value=false;}}
onMounted(load);
</script>
<style scoped>
.billing-batches{display:grid;gap:16px}.billing-batches article{padding-top:16px;border-top:1px solid #d8e3e8}.billing-batches li{overflow-wrap:anywhere;line-height:1.6}.billing-batches button{padding:10px 14px}.billing-batches [role=alert]{color:#9b2222}.ready-claims{padding-left:20px}.ready-claims>li{margin:16px 0}.ready-claims label{display:flex;align-items:flex-start;gap:8px}.ready-claims input{flex:none;margin-top:6px}.ready-claims details{margin:8px 0}.submission-actions{display:flex;flex-wrap:wrap;gap:10px}
</style>
