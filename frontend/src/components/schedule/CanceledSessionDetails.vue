<script setup>
import { ref,watch } from 'vue';
import api from '../../services/api';
import AppointmentCommunicationsPanel from './AppointmentCommunicationsPanel.vue';
const props = defineProps({appointmentId:{type:Number,required:true}});
const summary=ref(null),error=ref('');let generation=0;
watch(()=>props.appointmentId,async(id)=>{const run=++generation;summary.value=null;error.value='';try{const {data}=await api.get(`/appointments/${id}/timeline`,{skipGlobalLoading:true});if(run===generation)summary.value=data.cancellation;}catch{if(run===generation)error.value='Cancellation details could not be loaded.';}},{immediate:true});
</script>
<template>
  <section aria-label="Retained session cancellation" class="canceled-session-details">
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="summary"><p><strong>Canceled by {{ summary.actorName || `user #${summary.actorUserId}` }}</strong> for {{ summary.providerName }} · {{ summary.canceledAt }} UTC.</p><p>{{ summary.reason }} · {{ summary.source === 'planned_out' ? 'Planned Out' : summary.source === 'cancel_day' ? 'Cancel day' : 'Individual session cancellation' }}. No service rendered; nonbillable.<template v-if="summary.feeCents === 0"> No cancellation fee.</template></p></template>
    <details><summary>Recipients, delivery results, and receipt confirmations</summary><AppointmentCommunicationsPanel :appointment-id="appointmentId" /></details>
  </section>
</template>
<style scoped>.canceled-session-details{margin:10px 0;overflow-wrap:anywhere;font-size:13px}summary{cursor:pointer;font-weight:600}</style>
