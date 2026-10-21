<template>
  <section class="tutor-office-status" aria-label="Tutor’s office">
    <h3>Tutor’s office</h3>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!offices.length" class="office-window">Office status and appointment chat are available from 30 minutes before your appointment until 30 minutes after its scheduled end.</p>
    <article v-for="office in offices" :key="`${office.source}-${office.appointmentId}`">
      <div><strong>{{ office.providerName }}</strong><span class="office-presence" :class="office.availability">{{ availabilityLabel(office.availability) }}</span></div>
      <p>{{ availabilityText(office) }}</p>
      <div class="office-actions"><a v-if="office.virtual" :href="office.joinUrl">Join waiting room</a><button :disabled="busy" @click="openChat(office)">{{ busy?'Opening…':`Message ${office.providerName}` }}</button></div>
    </article>
    <OfficeWaitingMessages v-if="activeOffice && visit" :key="visit.id" :request="messageRequest" :recipient="activeOffice.providerName" :notice="availabilityText(activeOffice)" closable @close="selectedKey=''" />
  </section>
</template>
<script setup>
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {usePortalCareApi} from '../../composables/usePortalCareApi';
import OfficeWaitingMessages from '../meetings/OfficeWaitingMessages.vue';
const props=defineProps({clientId:{type:[Number,String],required:true}});
const api=usePortalCareApi();
const offices=ref([]),error=ref(''),busy=ref(false),selectedKey=ref(''),visit=ref(null);
const key=o=>`${o.source}-${o.appointmentId}`;
const activeOffice=computed(()=>offices.value.find(o=>key(o)===selectedKey.value));
const availabilityLabel=value=>({in_session:'In a session',available:'In the office',away:'Away'})[value]||'Away';
const availabilityText=o=>o.availability==='in_session'?`${o.providerName} is currently in a session. You can leave a message; they can reply when they are free.`:o.availability==='available'?`${o.providerName} is in the office. You can send a message while you wait.`:`${o.providerName} is away. You can leave a message for when they return.`;
let timer,stopped=false,version=0,fetching=false;
const endpoint=()=>`/tutoring-learning-os/clients/${props.clientId}`;
async function refresh(){if(fetching)return;fetching=true;const requestVersion=version;try{const {data}=await api.get(`${endpoint()}/office-status`,{skipGlobalLoading:true});if(!stopped&&requestVersion===version){offices.value=data.offices||[];error.value='';if(!activeOffice.value){visit.value=null;selectedKey.value='';}}}catch{if(!stopped&&requestVersion===version){offices.value=[];visit.value=null;error.value='Office status is temporarily unavailable.';}}finally{fetching=false;}}
async function openChat(office){if(busy.value)return;busy.value=true;error.value='';const requestVersion=version;const storageKey=`auricwell-office-visit:${office.officeSlug}`;let previous={};try{previous=JSON.parse(sessionStorage.getItem(storageKey)||'{}');}catch{}
 try{const {data}=await api.post(`${endpoint()}/office-visit`,{appointmentId:office.appointmentId,source:office.source,existingVisitId:previous.id,credential:previous.credential});if(stopped||requestVersion!==version)return;visit.value=data.lobby;selectedKey.value=key(office);try{sessionStorage.setItem(storageKey,JSON.stringify({id:data.lobby.id,credential:data.lobby.credential,displayName:data.lobby.guestDisplayName}));}catch{}}
 catch(e){error.value=e.response?.data?.error?.message||'Could not open the conversation.';}finally{busy.value=false;}}
const messageRequest=async options=>{const url=`/my-room/${encodeURIComponent(activeOffice.value.officeSlug)}/lobby/${visit.value.id}/messages`;const config={headers:{'X-Office-Visit':visit.value.credential},skipGlobalLoading:true};return (options.method==='POST'?await api.post(url,options.body,config):await api.get(url,config)).data;};
watch(()=>props.clientId,()=>{version++;offices.value=[];visit.value=null;selectedKey.value='';void refresh();});
onMounted(()=>{void refresh();timer=setInterval(refresh,15000);});onBeforeUnmount(()=>{stopped=true;version++;clearInterval(timer);});
</script>
<style scoped>
.tutor-office-status{border:1px solid #b8d8d6;border-radius:18px;padding:22px;background:#f4faf9;margin-bottom:22px;color:#183a47}.tutor-office-status h3{margin:0 0 12px}.tutor-office-status article{padding:14px 0}.tutor-office-status article>div:first-child{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.tutor-office-status p{line-height:1.6;font-size:14px}.office-presence{font-size:12px;border-radius:20px;padding:6px 10px;background:#e3e8ed}.office-presence.available{background:#d9eee1;color:#155534}.office-presence.in_session{background:#fff0cd;color:#745512}.office-actions{display:flex;gap:12px;flex-wrap:wrap}.office-actions a,.office-actions button{border:1px solid #24616b;background:#fff;padding:12px 16px;border-radius:10px;color:#17515b;font:600 14px system-ui;text-decoration:none;cursor:pointer}.office-actions button{background:#175b64;color:white}.office-window{color:#486773}
</style>
