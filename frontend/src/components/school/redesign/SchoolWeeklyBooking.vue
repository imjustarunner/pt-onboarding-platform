<template>
  <section v-if="context" class="weekly-booking" aria-label="Book school sessions">
    <h4>Weekly appointments from this school schedule</h4>
    <p>The school’s planning times stay the same when one appointment changes. Save any regular school-time changes in the schedule above, then book the new weekly appointments here.</p>
    <p v-if="!context.enabled" class="hint">{{ context.reason }}</p>
    <template v-else>
      <p v-if="!context.slots.length" class="hint">Save a client and start/end time in the school schedule first.</p>
      <form v-else @submit.prevent="book(false)">
        <label>Saved school slot
          <select v-model="slotId" required :disabled="busy">
            <option value="">Choose a client and time</option>
            <option v-for="slot in context.slots" :key="slot.id" :value="slot.id">{{ slotLabel(slot) }}</option>
          </select>
        </label>
        <label>Service
          <select v-model="tenantServiceId" required :disabled="busy">
            <option value="">Choose a service</option>
            <option v-for="service in context.services" :key="service.id" :value="service.id">{{ service.serviceCode }} · {{ service.name }}</option>
          </select>
        </label>
        <label>Start
          <select v-model="startMode" :disabled="busy">
            <option value="this_week">This week</option>
            <option value="next_week">Next week</option>
            <option value="date">Choose a start date</option>
          </select>
        </label>
        <label v-if="startMode === 'date'">On or after
          <input v-model="startDate" type="date" :min="context.today" required :disabled="busy" />
        </label>
        <label>Weekly sessions
          <input v-model.number="occurrenceCount" type="number" min="1" max="52" required :disabled="busy" />
        </label>
        <p class="hint">{{ weekday }} · {{ context.timeZone }}. These are real appointments with the practice’s usual conflict checks and notifications. Booking does not submit an insurance claim.</p>
        <button class="btn btn-primary btn-sm" :disabled="busy || completed || !context.services.length">{{ busy ? 'Booking…' : 'Book weekly sessions' }}</button>
      </form>
    </template>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div v-if="sameDayWarning" class="warning" role="alert">
      <p>{{ sameDayWarning }}</p>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="book(true)">I reviewed the existing services; continue</button>
      <button type="button" class="btn btn-secondary btn-sm" @click="sameDayWarning = ''">Go back</button>
    </div>
    <p v-if="success" role="status">{{ success }}</p>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue';
import api from '../../../services/api';
const props = defineProps({ schoolOrganizationId:{type:[Number,String],required:true}, providerUserId:{type:[Number,String],required:true}, weekday:{type:String,required:true}, revision:{type:Array,default:()=>[]} });
const context=ref(null), slotId=ref(''), tenantServiceId=ref(''), startMode=ref('next_week'), startDate=ref(''), occurrenceCount=ref(8);
const busy=ref(false), error=ref(''), success=ref(''), sameDayWarning=ref(''), completed=ref(false);
const url=()=>`/school-portal/${props.schoolOrganizationId}/days/${encodeURIComponent(props.weekday)}/providers/${props.providerUserId}/weekly-booking`;
let loadVersion=0;
async function load() {
  if (!props.weekday || !props.schoolOrganizationId || !props.providerUserId) {context.value=null;return;}
  const version=++loadVersion;
  try {
    const response=await api.get(url());
    if(version!==loadVersion) return;
    context.value=response.data;
  } catch(e) { if(version===loadVersion) {context.value=null;error.value=e.response?.data?.error?.message || 'School booking could not be loaded.';} }
}
const clock=value=>String(value || '').slice(0,5);
const slotLabel=slot=>`${slot.initials || 'Client'} · ${clock(slot.start_time)}–${clock(slot.end_time)}`;
async function book(acknowledgeSameDayServices) {
  if(busy.value || completed.value) return;
  busy.value=true;error.value='';success.value='';sameDayWarning.value='';
  try {
    const response=await api.post(url(),{slotId:slotId.value,tenantServiceId:tenantServiceId.value,startMode:startMode.value,startDate:startDate.value,occurrenceCount:occurrenceCount.value,acknowledgeSameDayServices});
    completed.value=true;
    const count=response.data?.appointments?.length || 1;
    success.value=`${count} weekly appointment${count===1?'':'s'} booked. Review them on your calendar. The school’s planning times are unchanged.`;
  } catch(e) {
    const data=e.response?.data;
    if(data?.error?.code==='SAME_DAY_SERVICE_WARNING') sameDayWarning.value=data.error.message;
    else {
      error.value=data?.error?.message || 'The appointments could not be booked.';
      if(data?.createdAppointmentIds?.length) {completed.value=true;error.value+=` Some appointments were saved (${data.createdAppointmentIds.join(', ')}). Review your calendar before booking more.`;}
    }
  } finally {busy.value=false;}
}
watch(()=>[props.schoolOrganizationId,props.providerUserId,props.weekday,props.revision],()=>{slotId.value='';error.value='';success.value='';sameDayWarning.value='';completed.value=false;load();},{immediate:true});
watch([slotId,tenantServiceId,startMode,startDate,occurrenceCount],()=>{success.value='';sameDayWarning.value='';completed.value=false;});
</script>

<style scoped>
.weekly-booking{border:1px solid var(--border,#d4dce6);border-radius:12px;background:#f6f9fd;padding:14px;margin-top:12px}
h4{margin:0 0 8px}p{font-size:13px;line-height:1.5}form{display:flex;flex-wrap:wrap;gap:12px;align-items:end}label{display:grid;gap:5px;font-size:12px;font-weight:700}select,input{border:1px solid var(--border,#cad3df);border-radius:7px;padding:8px;background:white;color:var(--text-primary,#22334a)}.hint{color:var(--text-secondary,#526278);flex-basis:100%}.error{color:#a32323}.warning{padding:10px;background:#fff3d4;border-radius:8px}.warning button{margin-right:8px}
</style>
