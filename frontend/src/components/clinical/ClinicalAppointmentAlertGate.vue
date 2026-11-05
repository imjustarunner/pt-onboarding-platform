<template>
  <section v-if="loading || error || appointments.length || diagnosisAlerts.length" class="session-alerts" aria-label="Schedule clips">
    <p v-if="loading" role="status">Checking schedule clips…</p>
    <p v-if="error" role="alert">{{ error }} <button type="button" @click="load">Retry</button></p>
    <article v-for="alert in appointments" :key="`${alert.appointmentId}:${alert.revision}`" class="appointment-alert">
      <strong>Schedule clip</strong><p>{{ alert.text }}</p>
      <button v-if="alert.needsAcknowledgement && !readOnly" type="button" :disabled="busy" @click="acknowledge(alert)">I have read this schedule clip — continue to note</button>
      <small v-else-if="alert.acknowledgedAt">Acknowledged for this schedule clip.</small>
    </article>
    <article v-for="alert in diagnosisAlerts" :key="`${alert.code}:${alert.diagnosisId}`" class="diagnosis-alert"><strong>Diagnosis review</strong><p>{{ alert.message }}</p><a :href="`/admin/clients/${clientId}?tab=clinical`" target="_blank" rel="noopener">Open clinical record to review</a></article>
  </section>
</template>
<script setup>
import {ref,watch,onUnmounted} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[String,Number],required:true},clientId:{type:[String,Number],required:true},clinicalSessionId:{type:[String,Number],default:null},officeEventId:{type:[String,Number],default:null},dateOfService:{type:String,default:''},readOnly:Boolean});
const emit=defineEmits(['blocked']);
const loading=ref(false),busy=ref(false),error=ref(''),appointments=ref([]),diagnosisAlerts=ref([]);
let generation=0;
function publish(){emit('blocked',!props.readOnly && (loading.value || !!error.value || appointments.value.some(alert=>alert.needsAcknowledgement)));}
async function load(){const g=++generation;if(!props.agencyId||!props.clientId){appointments.value=[];diagnosisAlerts.value=[];loading.value=false;error.value='';publish();return;}loading.value=true;error.value='';publish();try{const {data}=await api.get('/clinical-notes/appointment-alerts',{params:{agencyId:props.agencyId,clientId:props.clientId,clinicalSessionId:props.clinicalSessionId||undefined,officeEventId:props.officeEventId||undefined,dateOfService:props.dateOfService||undefined},skipGlobalLoading:true});if(g!==generation)return;appointments.value=data.appointments||[];diagnosisAlerts.value=data.diagnosisAlerts||[];}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||e.message||'Session alerts could not be loaded.';}finally{if(g===generation){loading.value=false;publish();}}}
async function acknowledge(alert){busy.value=true;error.value='';try{await api.post(`/clinical-notes/appointment-alerts/${alert.appointmentId}/acknowledge`,{revision:alert.revision},{skipGlobalLoading:true});await load();}catch(e){error.value=e.response?.data?.error?.message||e.message;publish();}finally{busy.value=false;}}
watch(()=>[props.agencyId,props.clientId,props.clinicalSessionId,props.officeEventId,props.dateOfService,props.readOnly],load,{immediate:true});
onUnmounted(()=>{generation++;emit('blocked',false);});
</script>
<style scoped>
.session-alerts{display:grid;gap:10px;margin:12px 0}.appointment-alert,.diagnosis-alert{padding:12px 14px;border:1px solid #d8a641;border-left:4px solid #b47812;border-radius:7px;background:#fff6e7}.session-alerts p{white-space:pre-wrap;margin:8px 0}.session-alerts button{padding:8px 12px;border:1px solid #8b692e;background:#fff;border-radius:6px;font:inherit}.session-alerts a{color:#205c80}.session-alerts small{display:block}
</style>
