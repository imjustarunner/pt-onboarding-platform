<template>
 <section class="pending-holds card">
  <h2>Pending weekly intake holds</h2>
  <p>These times stay blocked until placement is resolved. Assigning the client releases their hold. Review unsubmitted or abandoned intakes here.</p>
  <button type="button" :disabled="loading" @click="load">Refresh holds</button>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">Loading holds…</p>
  <p v-else-if="!holds.length && !error">No pending holds.</p>
  <article v-for="hold in holds" :key="hold.id">
   <div><strong>{{ hold.provider_name }}</strong><p>{{ weeklyTime(hold) }} · {{ hold.modality === 'VIRTUAL' ? 'Telehealth' : 'In person' }}</p><p><router-link v-if="hold.client_id" :to="`/${agencySlug}/admin/clients/${hold.client_id}`">Client #{{ hold.client_id }}</router-link><span v-else>Intake not yet submitted</span> · {{ hold.service_type }}</p><small>Selected {{ new Date(hold.created_at).toLocaleString() }}</small></div>
   <label>Resolution<select v-model="reasons[hold.id]"><option disabled value="">Select a reason</option><option value="PLACED">Placed on the schedule</option><option value="PLACED_ELSEWHERE">Placed elsewhere</option><option value="ABANDONED">Intake abandoned</option><option value="DUPLICATE">Duplicate selection</option></select></label>
   <button type="button" :disabled="busy || !reasons[hold.id]" @click="resolve(hold)">Release weekly hold</button>
  </article>
 </section>
</template>
<script setup>
import {ref,reactive,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencySlug:{type:String,required:true}});
const holds=ref([]),loading=ref(false),busy=ref(false),error=ref(''),reasons=reactive({});
const base=()=>`/public/agency-services/${encodeURIComponent(props.agencySlug)}/pending-holds`;
const weeklyTime=h=>new Intl.DateTimeFormat(undefined,{weekday:'long',hour:'numeric',minute:'2-digit',timeZone:h.time_zone}).format(new Date(h.start_at))+` (${h.time_zone})`;
let generation=0;
async function load(){const id=++generation;if(!props.agencySlug)return;loading.value=true;error.value='';try{const {data}=await api.get(base());if(id===generation){holds.value=data.holds||[];holds.value.forEach(h=>reasons[h.id]='');}}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Could not load pending holds.';}finally{if(id===generation)loading.value=false;}}
async function resolve(hold){busy.value=true;error.value='';try{await api.post(`${base()}/${hold.id}/resolve`,{reason:reasons[hold.id]});await load();}catch(e){error.value=e.response?.data?.error?.message||'Could not release this hold.';}finally{busy.value=false;}}
watch(()=>props.agencySlug,load,{immediate:true});
</script>
<style scoped>
.pending-holds article{display:flex;align-items:center;flex-wrap:wrap;gap:20px;padding:18px 0;border-top:1px solid #dce5e0}.pending-holds article>div{flex:1;min-width:200px}.pending-holds p{line-height:1.6}.pending-holds label{display:grid;gap:6px}.pending-holds select,.pending-holds button{padding:10px;border:1px solid #bccfc5;border-radius:8px;background:#fff;color:#1c4939}.pending-holds button{cursor:pointer}.pending-holds button:disabled{opacity:.5}
</style>
