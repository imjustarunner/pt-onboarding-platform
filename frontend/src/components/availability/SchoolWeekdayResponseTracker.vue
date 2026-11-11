<script setup>
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true}});
const providers=ref([]),counts=ref({pending:0,opened:0,completed:0}),search=ref(''),status=ref('all'),loading=ref(false),error=ref(''),checkedAt=ref(null);
const labels={pending:'Pending · no recorded open',opened:'Opened · unfinished',completed:'Completed'};
const delivery={not_sent:'Not sent',not_scheduled:'Not scheduled',pending:'Queued',waiting:'Scheduled',sending:'Sending',sent:'Sent',review:'Needs review',suppressed:'Not eligible for texts',skipped:'Skipped',cancelled:'Stopped'};
const filtered=computed(()=>providers.value.filter(person=>person.name.toLowerCase().includes(search.value.trim().toLowerCase())&&(status.value==='all'||status.value==='unfinished'&&person.status!=='completed'||person.status===status.value)).sort((a,b)=>a.name.localeCompare(b.name)));
const when=value=>value?new Date(value).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
let generation=0,timer;
async function load(){const current=++generation;loading.value=true;error.value='';try{const{data}=await api.get('/availability/admin/school-weekdays/progress',{params:{agencyId:props.agencyId},skipGlobalLoading:true});if(current!==generation)return;providers.value=data.providers||[];counts.value=data.counts;checkedAt.value=new Date().toISOString();}catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'Could not refresh response tracking.';}finally{if(current===generation)loading.value=false;}}
watch(()=>props.agencyId,()=>{providers.value=[];counts.value={pending:0,opened:0,completed:0};search.value='';status.value='all';load();},{immediate:true});
onMounted(()=>{timer=setInterval(()=>{if(document.visibilityState!=='hidden')load();},30000);});
onBeforeUnmount(()=>{++generation;clearInterval(timer);});
</script>
<template>
  <section class="response-tracker" aria-label="School availability responses">
    <h3>School availability responses</h3>
    <p>Completed means all five weekdays are assigned or explicitly answered. Opened records the provider opening their own form. Historical opens before tracking began are not available.</p>
    <div class="response-counts"><button v-for="key in ['pending','opened','completed']" :key="key" type="button" :aria-pressed="status===key" @click="status=key"><strong>{{counts[key]}}</strong>{{labels[key]}}</button></div>
    <div class="response-controls"><label>Find a provider<input v-model="search" type="search" placeholder="Provider name"/></label><label>Show<select v-model="status"><option value="all">All responses</option><option value="unfinished">Needs completion</option><option value="pending">Pending · no recorded open</option><option value="opened">Opened · unfinished</option><option value="completed">Completed</option></select></label><button type="button" class="btn btn-secondary" :disabled="loading" @click="load">Refresh responses</button></div>
    <p v-if="error" role="alert">{{error}}</p><p v-if="loading&&!checkedAt" role="status">Loading responses…</p>
    <p class="muted">Updates every 30 seconds while this view is open. {{checkedAt?`Last refreshed ${when(checkedAt)} Mountain time.`:''}}</p>
    <div class="response-table"><table><caption class="sr-only">Provider form status and follow-up delivery</caption><thead><tr><th>Provider</th><th>Status</th><th>Weekdays</th><th>Modal opened</th><th>Completed</th><th>Email</th><th>Follow-up text</th><th>Thank-you</th></tr></thead><tbody><tr v-for="person in filtered" :key="person.providerId"><th scope="row">{{person.name}}</th><td>{{labels[person.status]}}</td><td>{{person.accounted}} / 5</td><td>{{when(person.openedAt)}}</td><td>{{when(person.completedAt)}}</td><td>{{delivery[person.invitationStatus]||person.invitationStatus}}</td><td :title="person.smsReason||''">{{delivery[person.smsStatus]||person.smsStatus}}<small v-if="person.smsStatus==='waiting'&&person.smsDueAt">After {{when(person.smsDueAt)}} · weekdays, 9 AM–5 PM Mountain</small></td><td>{{person.thankyouStatus==='waiting'?'After completion':delivery[person.thankyouStatus]||person.thankyouStatus}}</td></tr></tbody></table></div>
    <p v-if="!loading&&!filtered.length">No providers match this view.</p>
  </section>
</template>
<style scoped>
.response-counts,.response-controls{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}.response-counts button{display:grid;gap:6px;flex:1;min-width:130px;padding:14px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;color:#183b32;text-align:left}.response-counts strong{font-size:24px}.response-counts button[aria-pressed=true]{border-color:#176745;background:#e8f6ef}.response-controls{align-items:end}.response-controls label{display:grid;gap:5px}.response-controls input,.response-controls select{font:inherit;padding:9px;border:1px solid #cbd5e1;border-radius:8px}.response-table{overflow:auto}table{width:100%;min-width:950px;border-collapse:collapse}th,td{padding:12px 9px;text-align:left;border-bottom:1px solid #dce5df;vertical-align:top}thead{background:#f4f8f5}small{display:block;max-width:200px;margin-top:5px}.muted,small{color:#64748b;font-size:12px}p{line-height:1.5}[role=alert]{color:#b91c1c}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
</style>
