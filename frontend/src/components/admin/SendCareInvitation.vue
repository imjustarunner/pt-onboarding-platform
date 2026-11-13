<template>
 <button type="button" class="care-send" @click="open">Send care invitation</button>
 <dialog ref="dialog" class="care-dialog" @close="opened=false">
  <form @submit.prevent="send">
   <h2>Send care invitation</h2><p>Invite a family to complete and sign the full enrollment packet. Assignment and scheduling wait for verified insurance.</p>
   <label>Practice<select v-model="agencyId" required @change="load"><option value="">Choose a practice</option><option v-for="a in agencies" :key="a.id" :value="Number(a.id)">{{ a.name }}</option></select></label>
   <label>Provider<select v-model="providerId" required><option value="">Choose a provider</option><option v-for="p in providers" :key="p.id" :value="Number(p.id)">{{ p.name }}</option></select></label>
   <label>Parent or guardian email<input v-model="email" type="email" required autocomplete="off"></label>
   <label>Care format<select v-model="modality"><option value="IN_PERSON">In person</option><option value="VIRTUAL">Virtual</option></select></label>
   <label v-if="modality==='IN_PERSON'">Assigned office<select v-model="officeId" required><option value="">Choose an office</option><option v-for="o in officeChoices" :key="o.officeId" :value="Number(o.officeId)">{{ o.name }}</option></select></label>
   <label>First appointment (optional)<input v-model="startAt" type="datetime-local"><small>{{ selectedTimeZone }}. In-person times must match the provider’s office reservation.</small></label>
   <label v-if="modality==='VIRTUAL'">Time zone<input v-model="timeZone" required></label>
   <label v-if="startAt">Repeat<select v-model="frequency"><option value="ONCE">Once</option><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every other week</option><option value="EVERY_3_WEEKS">Every three weeks</option><option value="EVERY_4_WEEKS">Every four weeks</option><option value="MONTHLY">Monthly</option></select><small>Recurring invitations schedule up to one year. Renew the series when needed.</small></label>
   <p v-if="startAt">Individual therapy · 90837 · 60 minutes</p>
   <label>Personal note (optional)<textarea v-model="note" maxlength="2000" rows="4"></textarea><small>Shown in italics in the invitation email.</small></label>
   <p v-if="error" role="alert">{{ error }}</p><p v-if="result" role="status">{{ result.status==='invited'?'Invitation sent.': 'Invitation recorded: '+result.status.replaceAll('_',' ')+'. Check delivery before sending again.' }} <a :href="result.url" target="_blank" rel="noopener">Enrollment link</a></p>
   <div class="care-actions"><button type="button" :disabled="sending" @click="dialog.close()">Close</button><button v-if="!result" type="submit" :disabled="sending||loading">{{ sending?'Sending…':'Send invitation' }}</button></div>
  </form>
  <section v-if="existingClients.length" aria-label="Existing client review"><h3>Use an existing client record</h3><p>This review is private to staff. Choose the client’s existing file to prepare a secure re-enrollment package. The public form does not identify prior clients.</p><article v-for="c in existingClients" :key="c.id"><strong>{{c.name}}</strong><ClientReenrollment :client-id="c.id" :agency-id="Number(agencyId)" /></article><label><input type="checkbox" v-model="newSubjectConfirmed" /> I reviewed these records; this invitation is for a different, new client.</label></section>
  <section v-if="invitations.length"><h3>Recent invitations</h3><ul><li v-for="i in invitations" :key="i.id"><strong>{{ i.recipient_email }}</strong> · {{ i.provider_name }}<br>{{ i.status.replaceAll('_',' ') }} · {{ i.modality==='IN_PERSON'?'In person':'Virtual' }}<p v-if="i.last_error">{{ i.last_error }}</p><a :href="i.url" target="_blank" rel="noopener">Copy or open enrollment link</a></li></ul></section>
 </dialog>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import ClientReenrollment from './ClientReenrollment.vue';
import api from '../../services/api';
import {zonedDatetimeLocalToIso} from '../../utils/timezones.js';
const props=defineProps({agencies:{type:Array,default:()=>[]},initialAgencyId:{type:Number,default:null}});
const dialog=ref(),opened=ref(false),agencyId=ref(''),providerId=ref(''),email=ref(''),modality=ref('IN_PERSON'),officeId=ref(''),startAt=ref(''),timeZone=ref('America/Denver'),frequency=ref('BIWEEKLY'),note=ref('');
const existingClients=ref([]),newSubjectConfirmed=ref(false);
watch([email,agencyId],()=>{existingClients.value=[];newSubjectConfirmed.value=false;});
const providers=ref([]),offices=ref([]),invitations=ref([]),loading=ref(false),sending=ref(false),error=ref(''),result=ref(null);let requestKey='';let loadId=0;
const officeChoices=computed(()=>[...new Map(offices.value.filter(o=>Number(o.providerId)===Number(providerId.value)).map(o=>[o.officeId,o])).values()]);
const selectedTimeZone=computed(()=>modality.value==='IN_PERSON'?(officeChoices.value.find(o=>Number(o.officeId)===Number(officeId.value))?.timezone||'America/Denver'):timeZone.value);
async function open(){result.value=null;existingClients.value=[];newSubjectConfirmed.value=false;requestKey=crypto.randomUUID();agencyId.value=props.initialAgencyId|| (props.agencies.length===1?Number(props.agencies[0].id):'');dialog.value.showModal();opened.value=true;if(agencyId.value)await load();}
async function load(){const version=++loadId;providers.value=[];offices.value=[];invitations.value=[];providerId.value='';officeId.value='';error.value='';if(!agencyId.value)return;loading.value=true;try{const [options,recent]=await Promise.all([api.get('/office-clients/care-invitations/options',{params:{agencyId:agencyId.value}}),api.get('/office-clients/care-invitations',{params:{agencyId:agencyId.value}})]);if(version!==loadId)return;providers.value=options.data.providers;offices.value=options.data.offices;invitations.value=recent.data.invitations;}catch(e){if(version===loadId)error.value=e.response?.data?.error?.message||'Could not load care invitation options.';}finally{if(version===loadId)loading.value=false;}}
async function send(){sending.value=true;error.value='';try{let instant=null;if(startAt.value){instant=zonedDatetimeLocalToIso(startAt.value,selectedTimeZone.value);if(!instant)throw Error('Choose a valid appointment time.');}const {data}=await api.post('/office-clients/care-invitations',{agencyId:Number(agencyId.value),providerId:Number(providerId.value),email:email.value,modality:modality.value,officeId:modality.value==='IN_PERSON'?Number(officeId.value):null,startAt:instant,timeZone:selectedTimeZone.value,frequency:frequency.value,note:note.value,requestKey,...(existingClients.value.length?{newSubjectConfirmed:newSubjectConfirmed.value,reviewedClientIds:existingClients.value.map(c=>c.id)}:{})},{timeout:60000});result.value=data;}catch(e){if(e.response?.data?.error?.code==='EXISTING_RECORD_REVIEW'){existingClients.value=e.response.data.error.clients||[];newSubjectConfirmed.value=false;}error.value=e.response?.data?.error?.message||'Could not confirm sending. Check recent invitations before retrying; the same request will not send twice.';}finally{sending.value=false;}}
</script>
<style scoped>
.care-send,.care-actions button{border:1px solid #adc5c8;border-radius:8px;padding:10px 16px;background:#1e626a;color:white;cursor:pointer}.care-dialog{width:min(600px,92vw);max-height:88vh;border:1px solid #bdcdd0;border-radius:16px;padding:26px;color:#173e43}.care-dialog::backdrop{background:#102f3a77}.care-dialog label{display:flex;flex-direction:column;gap:6px;margin:14px 0}.care-dialog input,.care-dialog select,.care-dialog textarea{padding:10px;border:1px solid #b9cdd0;border-radius:7px;font:inherit}.care-dialog small{color:#536f76}.care-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:20px}.care-dialog li{margin:15px 0;overflow-wrap:anywhere}
</style>
