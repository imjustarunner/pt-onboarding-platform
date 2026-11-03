<template>
  <section class="verification-queue">
    <header><div><h2>Insurance verification</h2><p>New clients and coverage changes. Verify primary and secondary coverage before provider assignment or Exchange posting.</p></div><form @submit.prevent="page=1;load()"><input v-model="search" aria-label="Search insurance verification clients" placeholder="Patient name or ID" /><button :disabled="loading">Search</button></form></header>
    <p v-if="loading" role="status">Loading verification queue…</p><p v-if="error" role="alert">{{ error }}</p>
    <div class="table-scroll"><table><thead><tr><th>Organization</th><th>Patient</th><th>Primary / secondary insurance</th><th>Verification</th><th>Action</th></tr></thead><tbody><tr v-for="row in items" :key="`${row.agencyId}-${row.clientId}`"><td>{{ row.organizationName }}</td><td>{{ row.clientName }}</td><td>{{ row.primary }}<small v-if="row.secondary">Secondary: {{ row.secondary }}</small></td><td><strong>{{ row.ready ? row.selfPay ? 'Self-pay' : row.required ? 'Verified' : 'Not required' : 'Needs verification' }}</strong><small v-if="!row.ready">{{ row.reason }}</small></td><td><button type="button" @click="open(row)">{{ row.ready ? 'Review coverage' : 'Verify insurance' }}</button><small v-if="row.taskId">Billing task #{{ row.taskId }}</small></td></tr><tr v-if="!loading&&!items.length"><td colspan="5">No clients match this scope and search.</td></tr></tbody></table></div>
    <footer><button :disabled="loading||page===1" @click="page--;load()">Previous</button><span>Page {{ page }} · {{ total }} clients</span><button :disabled="loading||page*40>=total" @click="page++;load()">Next</button></footer>
    <Teleport to="body"><div v-if="selected" class="coverage-overlay" @click.self="close" @keydown.esc.stop.prevent="close" @keydown.tab="trap"><section ref="panel" role="dialog" aria-modal="true" aria-labelledby="coverage-dialog-title" tabindex="-1" class="coverage-dialog"><header><h2 id="coverage-dialog-title">{{ selected.clientName }} · Insurance verification</h2><button type="button" @click="close">Close</button></header><ClientInsuranceEditor :key="`${selected.agencyId}-${selected.clientId}`" :client-id="selected.clientId" :agency-id="selected.agencyId" /></section></div></Teleport>
  </section>
</template>
<script setup>
import {ref,watch,nextTick,onBeforeUnmount} from 'vue';
import api from '../../services/api.js';
import ClientInsuranceEditor from './ClientInsuranceEditor.vue';
const props=defineProps({agencyId:{type:[Number,String],default:0},clientId:{type:[Number,String],default:null}});
const items=ref([]),total=ref(0),page=ref(1),search=ref(''),error=ref(''),loading=ref(false),selected=ref(null),panel=ref(null);
let sequence=0,previousFocus=null,requestedClient=null;
const validId=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null;
async function load(){
  const current=++sequence;loading.value=true;error.value='';items.value=[];total.value=0;
  try{
    const {data}=await api.get('/medical-billing/workspace/insurance-verification',{params:{agencyId:validId(props.agencyId)||undefined,clientId:validId(props.clientId)||undefined,page:page.value,search:search.value},skipGlobalLoading:true});
    if(current!==sequence)return;
    items.value=data.items||[];total.value=data.total||0;
    if(requestedClient){
      const match=items.value.find(row=>Number(row.clientId)===requestedClient&&(!validId(props.agencyId)||Number(row.agencyId)===validId(props.agencyId)));
      requestedClient=null;
      if(match)await open(match);
    }
  }catch(e){if(current===sequence){selected.value=null;error.value=e.response?.data?.error?.message||'Insurance verification could not be loaded.';}}
  finally{if(current===sequence)loading.value=false;}
}
async function open(row){previousFocus=document.activeElement;selected.value=row;await nextTick();panel.value?.focus();}
function close(){selected.value=null;if(previousFocus?.isConnected)previousFocus.focus();load();}
function trap(event){
  const controls=[...(panel.value?.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')||[])].filter(el=>!el.disabled&&el.getClientRects().length);
  if(!controls.length){event.preventDefault();panel.value?.focus();return;}
  if(event.shiftKey&&(document.activeElement===controls[0]||document.activeElement===panel.value)){event.preventDefault();controls.at(-1).focus();}
  else if(!event.shiftKey&&(document.activeElement===controls.at(-1)||document.activeElement===panel.value)){event.preventDefault();controls[0].focus();}
}
watch(()=>[props.agencyId,props.clientId],()=>{page.value=1;selected.value=null;search.value='';requestedClient=validId(props.clientId);load();},{immediate:true});
onBeforeUnmount(()=>{sequence++;if(selected.value&&previousFocus?.isConnected)previousFocus.focus();});
</script>
<style scoped>
.verification-queue{display:grid;gap:16px}header,footer,form{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}h2{margin:0}p,small{color:var(--text-secondary,#576a81)}small{display:block;margin-top:6px}input,button{padding:10px;border:1px solid #b8cbd9;border-radius:7px;background:var(--bg-primary,#fff);color:inherit}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #dce5ed;padding:12px;vertical-align:top}.table-scroll{overflow:auto}td small{max-width:360px}.coverage-overlay{position:fixed;inset:0;background:#16324888;z-index:12000;display:flex;justify-content:center;align-items:center;padding:20px}.coverage-dialog{background:var(--bg-primary,#fff);color:var(--text-primary,#172b4d);border-radius:16px;padding:24px;max-width:1000px;width:100%;max-height:90vh;overflow:auto}[role=alert]{color:#a32332}@media(max-width:600px){.coverage-overlay{padding:8px}.coverage-dialog{padding:16px}input{max-width:100%;min-width:0}}
</style>
