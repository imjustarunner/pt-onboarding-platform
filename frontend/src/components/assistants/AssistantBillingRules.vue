<template>
 <section class="billing-rules panel">
  <h2>Billing submission authorization</h2>
  <p>You start each batch. Billing Assistant receives only opaque references for fully checked claims; the server retains identifying claim data for transmission.</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <details><summary>Detailed bot instructions</summary><ol><li v-for="line in instructions" :key="line">{{ line }}</li></ol></details>
  <button type="button" :disabled="busy" @click="authorize">Authorize this ready-only rule for ITSCO, NLU and Inner Strength</button>
  <article v-for="rule in rules" :key="rule.id">
   <h3>{{ rule.ruleNumber }} · revision {{ rule.revision }} · {{ rule.status }}</h3>
   <p>Based on rule {{ rule.ruleNumber }} v{{ rule.revision }} and authorization by {{ rule.authorizedBy }}, performed by Billing Assistant.</p>
   <template v-if="rule.status==='active'">
    <label>Company<select v-model="agencyId"><option v-for="id in rule.agencyIds" :key="id" :value="id">{{ names[id] }}</option></select></label>
    <button type="button" :disabled="busy" @click="prepare(rule)">Start an authorized ready-claims batch</button>
    <button type="button" class="secondary" :disabled="busy" @click="revoke(rule)">Revoke rule</button>
   </template>
  </article>
 </section>
</template>
<script setup>
import {ref,onMounted} from 'vue';
import api from '../../services/api';
const rules=ref([]),instructions=ref([]),agencyId=ref(2),busy=ref(false),error=ref(''),notice=ref('');
const names={2:'ITSCO',6:'Next Level Up',377:'The Inner Strength Institute'};
async function load(){const{data}=await api.get('/assistant-accounts/billing-rules');rules.value=data.rules||[];instructions.value=data.instructions||[];}
async function action(fn){busy.value=true;error.value='';notice.value='';try{await fn();}catch(e){error.value=e.response?.data?.error?.message||'Billing authorization is unavailable.';}finally{busy.value=false;}}
const authorize=()=>action(async()=>{await api.post('/assistant-accounts/billing-rules',{agencyIds:[2,6,377]});await load();notice.value='The numbered rule and your authorization are recorded. Submission still requires you to start a batch.';});
const revoke=rule=>action(async()=>{await api.post(`/assistant-accounts/billing-rules/${rule.id}/revoke`);await load();notice.value='Rule revoked. Pending batches can no longer submit.';});
const prepare=rule=>action(async()=>{const{data}=await api.post(`/assistant-accounts/billing-rules/${rule.id}/batches`,{agencyId:agencyId.value});notice.value=data.prepared?`${data.readyCount} fully checked claims assigned to Billing Assistant. Batch ${data.batchRef}.`:'No fully checked claims are available. Unready claims remain with billing staff.';});
onMounted(()=>action(load));
</script>
<style scoped>
.billing-rules{display:grid;gap:16px}.billing-rules article{border-top:1px solid #d8e3e8;padding-top:16px}.billing-rules p,.billing-rules li{line-height:1.6}.billing-rules button{margin:8px 8px 8px 0;padding:10px 14px}.billing-rules label{display:grid;gap:6px;max-width:360px}.billing-rules select{padding:10px}.billing-rules [role=alert]{color:#9b2222}
</style>
