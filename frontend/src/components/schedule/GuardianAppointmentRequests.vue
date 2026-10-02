<template>
  <section v-if="requests.length || error" class="guardian-requests">
    <h3>Guardian change requests</h3><p v-if="error" role="alert">{{ error }}</p>
    <article v-for="request in requests" :key="request.id">
      <strong>{{ request.requestedBy }} requested {{ request.type === 'cancel' ? 'cancellation' : 'rescheduling' }}</strong><p>{{ request.reason }}</p>
      <p>{{ request.status === 'pending' ? 'Waiting for your approval; the appointment remains scheduled.' : request.status }}</p>
      <template v-if="request.status==='pending'">
        <button type="button" @click="review(request)">Review and approve through appointment change</button>
        <label>Reason for declining<textarea v-model="declineReasons[request.id]" maxlength="2000" /></label>
        <button type="button" :disabled="busy || !declineReasons[request.id]?.trim()" @click="decline(request)">Decline request</button>
      </template>
    </article>
    <AppointmentChangeWizard :change="change" @completed="load" />
  </section>
</template>
<script setup>
import {ref,reactive,watch} from 'vue';
import api from '../../services/api.js';
import {useAppointmentChange} from '../../composables/useAppointmentChange.js';
import AppointmentChangeWizard from './AppointmentChangeWizard.vue';
const props=defineProps({appointmentId:{type:Number,required:true}});const requests=ref([]),error=ref(''),busy=ref(false),declineReasons=reactive({});const change=useAppointmentChange();let sequence=0;
async function load(){const own=++sequence;requests.value=[];error.value='';if(!props.appointmentId)return;try{const {data}=await api.get(`/appointments/${props.appointmentId}/guardian-requests`,{skipGlobalLoading:true});if(own===sequence)requests.value=data.requests||[];}catch(e){if(own===sequence&&e.response?.status!==403)error.value=e.response?.data?.error?.message||'Change requests could not be loaded.';}}
async function review(request){await change.openWizard({appointmentId:props.appointmentId,context:{clientId:request.clientId}});if(change.workflow.value?.status==='completed')return;change.facts.eventType=request.type==='cancel'?'canceled':'rescheduled';change.facts.initiator='parent_guardian';change.facts.reasons=['other'];change.facts.reasonOther=request.reason;change.facts.waiver={action:'',reason:'',comment:''};}
async function decline(request){busy.value=true;try{await api.post(`/appointments/${props.appointmentId}/guardian-requests/${request.id}/decline`,{reason:declineReasons[request.id]});await load();}catch(e){error.value=e.response?.data?.error?.message||'The decision could not be saved.';}finally{busy.value=false;}}
watch(()=>props.appointmentId,load,{immediate:true});
</script>
<style scoped>
.guardian-requests{background:#fff8e8;padding:18px;border:1px solid #dec793;border-radius:10px}.guardian-requests article{padding:10px 0}.guardian-requests label{display:grid;gap:6px;margin:12px 0}.guardian-requests button{padding:8px}
</style>
