<template>
  <section class="count-import card" aria-label="Session count catch-up">
    <h3>Session count catch-up</h3>
    <p>Upload the same CSV or Excel billing export used for payroll, starting July 1. This adds visit evidence to the totals shown on client charts and in compliance. It does not run payroll, create clients, change balances, or send reminders.</p>
    <p>Visits are counted, not units. Without a shared encounter ID, report rows are provisional: overlapping exports use the highest daily count per client, provider and code. Review repeated billing lines and separate same-day visits against the source.</p>
    <label>Billing export<input ref="fileInput" type="file" accept=".csv,.xlsx,.xls" :disabled="busy" @change="pick" /></label>
    <div v-for="name in preview?.unmatchedProviders||[]" :key="name" class="provider-match"><label>{{ name }}<select v-model="providerMap[name]" :disabled="busy" @change="invalidate"><option value="">Leave for review</option><option v-for="provider in preview.providers" :key="provider.id" :value="provider.id">{{ provider.name }}</option></select></label></div>
    <button type="button" class="btn btn-secondary" :disabled="busy||!file||!agencyId" @click="run('preview')">{{ busy?'Processing…':'Preview session counts' }}</button>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    <template v-if="preview">
      <p>{{ preview.summary.matchedRows }} matched service rows · {{ preview.summary.reviewRows }} need review · {{ preview.summary.excludedRows }} excluded rows.</p>
      <p v-if="stale">Provider selection changed. Preview again before applying.</p>
      <details><summary>Review source rows and client matches</summary><div class="count-table"><table><thead><tr><th>Source row</th><th>Client</th><th>Provider</th><th>Service date</th><th>Code</th><th>Result</th></tr></thead><tbody><tr v-for="row in preview.rows.slice(0,500)" :key="row.sourceRowNumber"><td>{{row.sourceRowNumber}}</td><td>{{row.clientId?`Client #${row.clientId}`:'—'}}</td><td>{{providerName(row.providerUserId)}}</td><td>{{row.serviceDate}}</td><td>{{row.serviceCode}}</td><td>{{row.reason||'Matched · report evidence'}}</td></tr></tbody></table></div><p v-if="preview.rows.length>500">Showing the first 500 source rows.</p></details>
      <button type="button" class="btn btn-primary" :disabled="busy||stale||applied||!preview.summary.matchedRows" @click="run('apply')">Import matched count evidence</button>
    </template>
    <details><summary @click="history.length||loadHistory()">Count import history</summary><ul><li v-for="item in history" :key="item.id">Import #{{item.id}} · {{item.source_kind}} · {{item.created_at}} · Staff account {{item.actor_user_id}}</li></ul><p v-if="!history.length">No count imports recorded.</p></details>
  </section>
</template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,default:null}});const emit=defineEmits(['imported']);
const fileInput=ref(null),file=ref(null),providerMap=ref({}),preview=ref(null),busy=ref(false),error=ref(''),notice=ref(''),stale=ref(false),applied=ref(false),history=ref([]);let generation=0;
function pick(event){file.value=event.target.files?.[0]||null;preview.value=null;providerMap.value={};notice.value='';error.value='';applied.value=false;stale.value=false;}
function invalidate(){stale.value=true;applied.value=false;}
const providerName=id=>preview.value?.providers.find(p=>Number(p.id)===Number(id))?.name||'Needs match';
async function run(action){if(!file.value||busy.value||!props.agencyId)return;const own=generation;busy.value=true;error.value='';notice.value='';const form=new FormData();form.append('file',file.value);form.append('agencyId',String(props.agencyId));form.append('providerMap',JSON.stringify(providerMap.value));form.append('action',action);if(action==='apply')form.append('snapshot',preview.value.snapshot);
try{const {data}=await api.post('/billing-reports/session-counts',form);if(own!==generation)return;if(action==='preview'){preview.value=data;stale.value=false;applied.value=false;}else{applied.value=true;notice.value=`Count import #${data.importId} ${data.alreadyImported?'was already recorded; counts were not added again.':'saved. Unmatched rows remain for review.'}`;emit('imported');await loadHistory();}}
catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Session count import could not be completed.';}finally{busy.value=false;}}
async function loadHistory(){if(!props.agencyId)return;const own=generation;try{const {data}=await api.get('/billing-reports/session-counts',{params:{agencyId:props.agencyId}});if(own===generation)history.value=data.imports||[];}catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Count import history could not be loaded.';}}
watch(()=>props.agencyId,()=>{generation++;file.value=null;if(fileInput.value)fileInput.value.value='';preview.value=null;history.value=[];providerMap.value={};error.value='';notice.value='';});onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>
.count-import{padding:20px;margin-bottom:16px;border:1px solid #b8d4c7;border-radius:12px;background:#f7fbf8}.count-import h3{margin-top:0}.count-import p{line-height:1.6;max-width:100ch}.count-import label{display:grid;gap:8px;margin:12px 0}.count-import select{font:inherit;padding:8px}.count-import button{margin:10px 10px 10px 0}.count-import details{margin-top:14px}.count-import summary{cursor:pointer}.count-table{overflow:auto;max-height:400px}.count-table table{border-collapse:collapse;min-width:650px}.count-table th,.count-table td{padding:10px;text-align:left;border-bottom:1px solid #d5e2db}.count-import [role=alert]{color:#a12727}
</style>
