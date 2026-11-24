<template>
  <section class="activity" aria-label="Sharing activity">
    <header><h4>Sharing activity</h4><button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="load">Refresh</button></header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="!requests.length && !busy">No sharing requests yet.</p>
    <ul v-else class="requests">
      <li v-for="request in requests" :key="request.id">
        <div><strong>{{ request.recipient || 'Recipient' }}</strong><span> · {{ date(request.createdAt) }}</span></div>
        <div>
          <span>{{ request.revokedAt ? 'Revoked' : request.items.filter(item=>item.completed).length+' of '+request.items.length+' completed' }}</span>
          <span v-if="request.deliveries.length"> · {{ latest(request.deliveries).map(delivery=>channelName(delivery.channel)+' '+stateName(delivery.state)).join(' · ') }}</span>
        </div>
        <div v-if="!request.revokedAt && request.items.some(item=>!item.completed)" class="actions">
          <button v-for="delivery in latest(request.deliveries).filter(d=>d.channel!=='portal' && d.state!=='sending')"
            :key="delivery.id" type="button" class="btn btn-secondary btn-sm" :disabled="busy"
            @click="resend(request.id,delivery)">Resend {{ channelName(delivery.channel).toLowerCase() }}</button>
          <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="revoke(request.id)">Revoke request</button>
        </div>
      </li>
    </ul>
  </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({clientId:{type:[Number,String],required:true}});
const requests=ref([]),error=ref(''),busy=ref(false);
let generation=0;
const date=value=>new Date(value).toLocaleDateString();
const channelName=channel=>({email:'Email',sms:'Text',portal:'Portal notice'}[channel]||channel);
const stateName=state=>({queued:'accepted',unconfirmed:'unconfirmed',sending:'sending',sent:'sent',failed:'failed'}[state]||state);
const latest=deliveries=>deliveries.filter((delivery,index)=>deliveries.findIndex(other=>other.channel===delivery.channel)===index);
async function load(){
  const own=++generation;
  busy.value=true;error.value='';
  try{
    const {data}=await api.get(`/clinical-document-requests/clients/${props.clientId}`);
    if(own===generation)requests.value=data.requests||[];
  }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Sharing activity could not be loaded.';}
  finally{if(own===generation)busy.value=false;}
}
async function mutate(id,action,body){
  if(busy.value)return;
  busy.value=true;error.value='';
  try{await api.post(`/clinical-document-requests/${id}/${action}`,body);await load();}
  catch(e){error.value=e.response?.data?.error?.message||'The request could not be updated.';}
  finally{busy.value=false;}
}
function resend(id,delivery){
  if(delivery.state==='unconfirmed'&&!window.confirm('Delivery could not be confirmed. Send a replacement link and retire the earlier one?'))return;
  return mutate(id,'resend',{channel:delivery.channel});
}
function revoke(id){
  if(window.confirm('Revoke access to the unfinished items in this request?'))return mutate(id,'revoke',{});
}
watch(()=>props.clientId,()=>{requests.value=[];load();},{immediate:true});
</script>
<style scoped>
.activity{margin:1.2rem 0}header{display:flex;justify-content:space-between;align-items:center}
h4{margin:0}.requests{list-style:none;padding:0}.requests li{border-top:1px solid #dce4ec;padding:.75rem 0;display:grid;gap:.4rem}
.actions{display:flex;gap:.5rem;flex-wrap:wrap}[role=alert]{color:#932d23}
</style>
