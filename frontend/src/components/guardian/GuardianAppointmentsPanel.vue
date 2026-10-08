<template>
  <section class="guardian-appointments" aria-label="Appointments">
    <header><h2>Appointments</h2><button type="button" @click="load" :disabled="loading">Refresh</button></header>
    <p>Showing your next six upcoming appointments, followed by past appointments. This display limit does not cancel or release your recurring time slot.</p>
    <p>Authorized clients and guardians can cancel appointments immediately. Rescheduling requests still need provider approval.</p>
    <details v-if="!preview && preferences">
      <summary>My reminder preferences</summary>
      <p>These choices apply to your notifications. Each other recipient has their own choices. Turning texts on requires recorded SMS consent and a working practice number; ask the care team for a consent link if needed. Reply STOP to stop texts from the program.</p>
      <label><input v-model="preferences.channels.email" type="checkbox" /> Email reminders</label>
      <label><input v-model="preferences.channels.sms" type="checkbox" /> Text reminders to my consented number</label>
      <label><input v-model="preferences.optionalRemindersEnabled" type="checkbox" /> Additional reminders</label>
      <label><input v-model="preferences.providerPushedUpdatesEnabled" type="checkbox" /> Provider schedule updates</label>
      <button type="button" :disabled="busy" @click="savePreferences">Save my preferences</button>
      <p v-if="preferenceNotice" role="status">{{ preferenceNotice }}</p>
    </details>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">Loading appointments…</p>
    <p v-else-if="!appointments.length">No appointments are available to display.</p>
    <article v-for="a in appointments" :key="a.id">
      <h3>{{ when(a.startAt, a.timeZone) }}</h3><p>{{ a.providerName }} · {{ a.modality }} · {{ a.status.replaceAll('_',' ') }}</p>
      <p v-if="a.serviceSetting">Service location: {{ a.serviceSetting.locationLabel }}</p>
      <p v-if="a.serviceSetting?.isSchool">No confirmation is needed for this school visit. If your child will be absent or plans change, let your care team know. Continue reporting absences to the school as usual.</p>
      <p v-if="a.canceledBy">Canceled by {{ a.canceledBy }}<span v-if="a.cancellationReason">: {{ a.cancellationReason }}</span></p>
      <div v-for="request in a.requests" :key="request.id" class="request">
        <strong>{{ request.requestedBy }} requested {{ request.type === 'cancel' ? 'cancellation' : 'rescheduling' }}</strong>
        <p>{{ request.reason }}</p><p>{{ request.status === 'pending' ? 'Waiting for provider approval' : request.status }}<span v-if="request.decidedBy"> · {{ request.decidedBy }}</span></p>
        <p v-if="request.decisionReason">{{ request.decisionReason }}</p>
      </div>
      <form v-if="canRequest(a)" @submit.prevent="submit(a)">
        <label>Action <select v-model="draft(a).type"><option value="cancel">Cancel appointment</option><option value="reschedule">Request rescheduling</option></select></label>
        <label v-if="draft(a).type === 'cancel'">Cancel <select v-model="draft(a).scope"><option value="single">Only this appointment</option><option value="future">All future sessions in this recurring series</option></select></label>
        <label>Reason (required)<textarea v-model="draft(a).reason" required maxlength="2000" rows="2" /></label>
        <p>Your reason will be visible to the authorized guardians and care team.</p>
        <label v-if="draft(a).type === 'cancel'"><input v-model="draft(a).confirmed" type="checkbox" required /> I confirm cancellation of the selected session(s). Existing cancellation-fee rules still apply.</label>
        <button :disabled="busy || !draft(a).reason.trim() || (draft(a).type === 'cancel' && !draft(a).confirmed)">{{ draft(a).type === 'cancel' ? (draft(a).scope === 'future' ? 'Cancel all future sessions' : 'Cancel appointment') : 'Request provider approval' }}</button>
      </form>
    </article>
  </section>
</template>
<script setup>
import { ref, reactive, watch } from 'vue';
import api from '../../services/api.js';
const props=defineProps({clientId:{type:Number,default:null},preview:{type:Boolean,default:false}});
const preferences=ref(null),preferenceNotice=ref('');
const appointments=ref([]),loading=ref(false),busy=ref(false),error=ref(''),notice=ref(''),drafts=reactive({});let sequence=0;
const draft=a=>drafts[a.id] ||= {type:'cancel',reason:'',scope:'single',confirmed:false};
const appointmentDate=value=>new Date(typeof value==='string'&&!/(Z|[+-]\d\d:\d\d)$/.test(value)?value.replace(' ','T')+'Z':value);
const canRequest=a=>!props.preview&&['scheduled','confirmed','client_confirmed'].includes(a.status)&&+appointmentDate(a.startAt)>Date.now();
const when=(value,timeZone)=>appointmentDate(value).toLocaleString(undefined,{timeZone:timeZone||'America/Denver',dateStyle:'medium',timeStyle:'short'});
async function load(){const own=++sequence;appointments.value=[];preferences.value=null;preferenceNotice.value='';error.value='';if(!props.clientId||props.preview)return;loading.value=true;try{const {data}=await api.get(`/guardian-portal/clients/${props.clientId}/appointments`,{skipGlobalLoading:true});if(own===sequence) {
  appointments.value=data.appointments||[];
  const response=await api.get(`/guardian-portal/clients/${props.clientId}/reminder-preferences`,{skipGlobalLoading:true});
  if(own===sequence)preferences.value=response.data;
}}catch(e){if(own===sequence)error.value=e.response?.data?.error?.message||'Appointments could not be loaded.';}finally{if(own===sequence)loading.value=false;}}
async function savePreferences(){const own=sequence;busy.value=true;error.value='';preferenceNotice.value='';try{const{data}=await api.put(`/guardian-portal/clients/${props.clientId}/reminder-preferences`,preferences.value);if(own===sequence){preferences.value=data;preferenceNotice.value='Your preferences were saved. Text delivery still requires recorded consent.';}}catch(e){error.value=e.response?.data?.error?.message||'Preferences could not be saved.';}finally{busy.value=false;}}
async function submit(a){if(busy.value)return;const own=sequence;const cancel=draft(a).type==='cancel';busy.value=true;error.value='';notice.value='';try{await api.post(`/guardian-portal/clients/${props.clientId}/appointments/${a.id}/${cancel ? 'cancel' : 'requests'}`,draft(a));delete drafts[a.id];if(own===sequence){notice.value=cancel?'Cancellation confirmed. Selected sessions are canceled; existing cancellation-fee rules apply.':'Rescheduling request sent for provider approval.';await load();}}catch(e){if(own===sequence)error.value=e.response?.data?.error?.message||'Your request could not be saved. Refresh to see current appointment status before retrying.';}finally{busy.value=false;}}
watch(()=>props.clientId,()=>{notice.value='';load();},{immediate:true});
</script>
<style scoped>
.guardian-appointments{padding:20px;background:white;border:1px solid #dce4ee;border-radius:12px;margin-top:20px}.guardian-appointments header{display:flex;align-items:center;justify-content:space-between}.guardian-appointments article{border-top:1px solid #dce4ee;padding:16px 0}.guardian-appointments p{color:#4b5f75}.guardian-appointments label{display:grid;gap:6px;margin:10px 0}.guardian-appointments textarea,.guardian-appointments select{padding:8px;border:1px solid #b4c3d2;border-radius:5px;max-width:100%}.guardian-appointments .request{padding:12px;background:#f1f6fc;margin:10px 0}.guardian-appointments button{padding:8px 12px;cursor:pointer}
</style>
