<template>
  <section class="planned-services" id="planned-services">
    <header><div><h3>Scheduled / planned claims</h3><p>Scheduled appointments and imported service to-dos appear here before a claim draft exists. They are not submitted claims or patient charges. Viewing a session does not mark it started.</p></div><button :disabled="loading" @click="load">Refresh</button></header>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">Loading planned services…</p>
    <table v-else-if="items.length"><thead><tr><th>Client</th><th>Service date</th><th>Service code</th><th>Documentation</th><th></th></tr></thead><tbody><tr v-for="item in items" :key="item.key || item.sessionId"><td>#{{ item.clientId }}</td><td>{{ item.serviceDate || 'Confirm date' }}</td><td>{{ item.serviceCode }}</td><td>{{ item.signedAt ? 'Signed — prepare claim' : item.noteId ? 'Note in progress' : 'Planned — note needed' }}</td><td><button v-if="item.sessionId" @click="selected = item">View progress</button><button v-else @click="openClient(item)">Open client record</button></td></tr></tbody></table>
    <p v-else-if="!error">No scheduled or imported services are awaiting claim preparation.</p>
    <p v-if="hasMore">Showing the latest 200 services. Open the client record for older entries.</p><p v-if="appointmentsUnavailable" role="alert">Scheduled appointment tracking is unavailable; imported clinical services are still shown.</p>
    <AppointmentBillingPanel v-if="selected" :key="selected.sessionId" :agency-id="agencyId" :clinical-session-id="selected.sessionId" :service-date-label="selected.serviceDate || ''" :service-label="selected.serviceCode || ''" @open-note="openNote(selected)" />
  </section>
</template>
<script setup>
import {ref,watch,onBeforeUnmount} from 'vue';
import {useRouter,useRoute} from 'vue-router';
import {navigateToNoteAid} from '../../utils/noteAidLaunch.js';
import api from '../../services/api';
import AppointmentBillingPanel from '../schedule/AppointmentBillingPanel.vue';
const props=defineProps({agencyId:{type:Number,required:true}});
const items=ref([]),selected=ref(null),loading=ref(false),error=ref(''),router=useRouter(),route=useRoute(),hasMore=ref(false),appointmentsUnavailable=ref(false);let seq=0;
async function load(){const key=++seq;items.value=[];selected.value=null;error.value='';loading.value=true;try{const {data}=await api.get('/medical-billing/planned-services',{params:{agencyId:props.agencyId}});if(key===seq){items.value=data.items || [];hasMore.value=!!data.hasMore;appointmentsUnavailable.value=!!data.appointmentsUnavailable;}}catch{if(key===seq)error.value='Planned services could not be loaded.';}finally{if(key===seq)loading.value=false;}}
function openNote(item){navigateToNoteAid(router,{clientId:item.clientId,clinicalSessionId:item.sessionId,dateOfService:item.serviceDate,serviceCode:item.serviceCode},{organizationSlug:route.params.organizationSlug});}
function openClient(item){const prefix=route.params.organizationSlug?`/${route.params.organizationSlug}`:'';router.push({path:`${prefix}/admin/clients/${item.clientId}`,query:{agencyId:String(props.agencyId)}});}
watch(()=>props.agencyId,load,{immediate:true});onBeforeUnmount(()=>{seq++;});
</script>
<style scoped>
.planned-services{border:1px solid var(--border-color,#dce5ed);border-radius:14px;background:var(--bg-primary,#fff);padding:20px;margin:16px 0}.planned-services header{display:flex;justify-content:space-between;gap:16px}.planned-services h3{margin-top:0}.planned-services p{color:var(--text-secondary,#586a80)}table{width:100%;text-align:left;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #e7edf3}button{cursor:pointer;padding:6px 10px;border:1px solid #c9d9e8;background:transparent;border-radius:7px;color:var(--primary-color,#1677bc)}
</style>
