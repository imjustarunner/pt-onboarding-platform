<template>
 <section class="guardian-preferences">
  <header><h2>Communication preferences</h2><p>Master channels apply to each category below. Saved category choices and text opt-outs remain in effect.</p></header>
  <p v-if="loading" role="status">Loading notification preferences…</p><p v-if="error" role="alert">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
  <div class="channel-cards"><div><strong>In-app</strong><span>Always available</span></div><label><input type="checkbox" v-model="master.email_enabled" :disabled="!canEdit || busy" /> Email notifications</label><label><input type="checkbox" v-model="master.sms_enabled" :disabled="!canEdit || busy" /> SMS notifications</label></div>
  <article v-for="client in clients" :key="client.client_id" class="client-choices"><h3>{{client.full_name||client.initials}}</h3><p v-if="clientErrors[client.client_id]" role="alert">{{clientErrors[client.client_id]}}</p>
   <table v-if="choices[client.client_id]"><thead><tr><th>Notification category</th><th>Category enabled</th><th>Email</th><th>SMS</th></tr></thead><tbody><tr v-for="category in categories" :key="category.key"><td>{{category.label}}</td><td><input type="checkbox" v-model="choices[client.client_id][category.key]" :aria-label="category.label" :disabled="!canEdit || busy" /></td><td>{{master.email_enabled && choices[client.client_id][category.key]!==false?'On':'Off'}}</td><td>{{smsLabel(client.client_id,category)}}</td></tr></tbody></table>
   <p v-if="textStatus[client.client_id]?.stopped" class="opt-out">STOP · all texts are stopped for this phone.</p>
   <p v-for="(choice,purpose) in textStatus[client.client_id]?.textChoices||{}" :key="purpose" class="text-status"><strong>{{purpose==='reminders'?'Appointment reminder texts':'Provider texts'}}:</strong> {{choice.keyword || (choice.state==='opted_out'?'Opted out':choice.state==='stopped'?'STOP':choice.state==='on'||choice.state==='verbal'?'Consent recorded':'No active text consent')}}<span v-if="choice.at"> · {{new Date(choice.at).toLocaleString()}}</span></p>
   <details><summary>Review text consent and enrollment</summary><ClientReminderTextConsent :client-id="Number(client.client_id)" :recipient-id="Number(guardianId)" /></details>
  </article>
  <button class="btn btn-primary" type="button" :disabled="!canEdit || busy || loading || !masterReady" @click="save">{{busy?'Saving…':'Save notification preferences'}}</button>
 </section>
</template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
import {guardianNotificationDelivery} from '../../utils/guardianDirectory.js';
import ClientReminderTextConsent from './ClientReminderTextConsent.vue';
const props=defineProps({guardianId:{type:Number,required:true},clients:{type:Array,default:()=>[]},canEdit:Boolean});
const categories=[{key:'optionalRemindersEnabled',label:'Appointment reminders',purpose:'reminders'},{key:'confirmationRequestsEnabled',label:'Confirmation requests',purpose:'reminders'},{key:'schedulingChangesEnabled',label:'Schedule changes',purpose:'reminders'},{key:'providerPushedUpdatesEnabled',label:'Provider updates',purpose:'care'}];
const masterReady=ref(false);
const master=ref({in_app_enabled:true,email_enabled:true,sms_enabled:false}),choices=ref({}),textStatus=ref({}),clientErrors=ref({}),loading=ref(false),busy=ref(false),error=ref(''),notice=ref('');let generation=0;
function smsLabel(id,category){const recipient=textStatus.value[id],choice=recipient?.textChoices?.[category.purpose];if(recipient?.stopped)return 'Off · STOP';if(choice?.state==='opted_out')return `Off · ${choice.keyword||'opted out'}`;if(!master.value.sms_enabled||choices.value[id]?.[category.key]===false)return 'Off';return ['on','verbal'].includes(choice?.state)?'On':'Awaiting consent';}
async function load(){const own=++generation;loading.value=true;busy.value=false;masterReady.value=false;error.value='';choices.value={};textStatus.value={};clientErrors.value={};try{const {data}=await api.get(`/users/${props.guardianId}/preferences`,{skipGlobalLoading:true});if(own!==generation)return;master.value=guardianNotificationDelivery(data);masterReady.value=true;}catch(e){if(own===generation)error.value='Account delivery preferences could not be loaded.';}
 if(own!==generation)return;
 await Promise.all(props.clients.map(async client=>{const id=client.client_id;try{const [{data:preferences},{data:consent}]=await Promise.all([api.get(`/users/${props.guardianId}/guardian-session-preferences/${id}`,{skipGlobalLoading:true}),api.get(`/clients/${id}/reminder-text-consent`,{skipGlobalLoading:true,params:{guardianId:props.guardianId}})]);if(own!==generation)return;choices.value[id]=Object.fromEntries(categories.map(c=>[c.key,preferences[c.key]!==false]));textStatus.value[id]=consent.recipients?.find(r=>Number(r.id)===props.guardianId)||null;}catch(e){if(own===generation)clientErrors.value[id]=e.response?.data?.error?.message||'Client notification choices could not be loaded.';}}));if(own===generation)loading.value=false;}
async function save(){
 if(busy.value||!props.canEdit||!masterReady.value)return;
 const own=generation,target=props.guardianId,clients=props.clients.map(c=>c.client_id),draft=JSON.parse(JSON.stringify(choices.value)),channels={email:master.value.email_enabled,sms:master.value.sms_enabled,in_app:true,phone:false};
 busy.value=true;error.value='';notice.value='';
 try{
  await api.put(`/users/${target}/preferences`,{...master.value,in_app_enabled:true},{skipGlobalLoading:true});
  for(const id of clients){if(own!==generation)return;if(draft[id])await api.put(`/users/${target}/guardian-session-preferences/${id}`,{...draft[id],channels},{skipGlobalLoading:true});}
  if(own===generation){await load();if(target===props.guardianId)notice.value='Notification preferences saved. Recorded text opt-outs are preserved.';}
 }catch(e){if(target===props.guardianId)error.value=e.response?.data?.error?.message||'Preferences could not be saved.';}
 finally{if(target===props.guardianId)busy.value=false;}
}

watch(()=>[props.guardianId,props.clients.map(c=>c.client_id).join(',')],load,{immediate:true});onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>
.guardian-preferences{width:100%;color:var(--guardian-ink,#20354f)}.guardian-preferences header p{color:#65778b;line-height:1.6}.channel-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:22px 0}.channel-cards>div,.channel-cards>label{display:flex;gap:10px;align-items:center;padding:18px;border:1px solid #d6e1ea;border-radius:14px;background:var(--bg-card,#fff)}.channel-cards span{font-size:13px;color:#65778b}.client-choices{padding:24px;border:1px solid #d6e1ea;border-radius:16px;background:var(--bg-card,#fff);margin:16px 0;overflow-x:auto}.client-choices table{width:100%;border-collapse:collapse;margin:16px 0}.client-choices th,.client-choices td{text-align:left;padding:13px;border-bottom:1px solid #e6edf3;font-size:14px}.client-choices th{color:#61758b;font-weight:600}.client-choices details{margin-top:20px}.client-choices summary{font-weight:600;cursor:pointer}.text-status{font-size:13px;line-height:1.6}.opt-out{background:#fff3e0;padding:12px;border-radius:10px}[role=alert]{color:#a32727}@media(max-width:700px){.channel-cards{grid-template-columns:1fr}.client-choices{padding:16px}}
</style>
