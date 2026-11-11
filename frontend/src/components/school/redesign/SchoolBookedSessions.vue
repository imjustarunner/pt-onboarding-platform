<template>
  <section v-if="context?.transition || allowSetup" class="booked-school" aria-label="Booked school sessions">
    <h4>Booked school sessions</h4>
    <p>This shows the provider’s full booked school week, including appointments moved to a different day. Provider changes appear when you refresh. School time changes update the same appointment.</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="success" role="status">{{ success }}</p>
    <form v-if="allowSetup && context?.canManage" class="setup" @submit.prevent="saveTransition">
      <label>School appointment transition date<input v-model="effectiveDate" type="date" required :disabled="busy" /></label>
      <label class="review"><input v-model="transitionReviewed" type="checkbox" required :disabled="busy" /> I reviewed the provider, school, and date. Linked appointments replace their planning entries.</label>
      <button :disabled="busy || !transitionReviewed" type="submit">Save transition date</button>
      <p class="hint">Provider session booking must already be enabled. Untimed entries remain planning until a real appointment is booked and linked.</p>
    </form>
    <template v-if="context?.transition">
      <p class="hint">Effective {{ context.transition.effectiveDate }} · {{ context.timeZone }}</p>
      <div class="week-controls">
        <button type="button" :disabled="busy" @click="shift(-7)">Previous week</button>
        <label>Week starting<input v-model="startDate" type="date" :disabled="busy" @change="load" /></label>
        <button type="button" :disabled="busy" @click="shift(7)">Next week</button>
        <button type="button" :disabled="busy" @click="load">Refresh appointments</button>
      </div>
      <p v-if="!context.appointments.length" class="hint">No linked appointments in this week. Save a client and time in school planning, then use Book weekly sessions or link an existing appointment below.</p>
      <ul v-else class="sessions">
        <li v-for="appointment in context.appointments" :key="appointment.id">
          <div><strong>{{ appointment.clientLabel }}</strong><p>{{ display(appointment.startAt) }}–{{ clock(appointment.endAt) }} · {{ appointment.status }}</p></div>
          <button v-if="appointment.canMove" type="button" :disabled="busy" @click="edit(appointment)">Change appointment time</button>
          <p v-else class="hint">This appointment is retained. Its history is not changed here.</p>
        </li>
      </ul>
      <form v-if="editing" class="move" @submit.prevent="move">
        <strong>Change {{ editing.clientLabel }} · appointment {{ editing.id }}</strong>
        <label>Date<input v-model="moveDate" type="date" required :disabled="busy" /></label>
        <label>Start<input v-model="moveStart" type="time" required :disabled="busy" /></label>
        <label>End<input v-model="moveEnd" type="time" required :disabled="busy" /></label>
        <p class="hint">This changes this appointment only. School hours, closures, conflicts, and signed records are checked. Recurring appointments can be changed from the provider’s calendar.</p>
        <button :disabled="busy" type="submit">Save actual appointment</button>
        <button :disabled="busy" type="button" @click="editing=null">Cancel</button>
      </form>
      <form v-if="allowSetup && context.canManage" class="links" @submit.prevent="link">
        <h5>Connect existing appointments to a school slot</h5>
        <label>Saved school slot<select v-model="slotId" :disabled="busy" required><option value="">Choose a client and slot</option><option v-for="slot in context.slots.filter(s=>s.client_id)" :key="slot.id" :value="slot.id">{{ slot.identifier_code || slot.initials || `Client ${slot.client_id}` }} · {{ slot.weekday }} · {{ clock(slot.start_time) }}–{{ clock(slot.end_time) }}</option></select></label>
        <p v-if="slotId && !candidateAppointments.length" class="hint">No unlinked appointments for this client in the selected week. Select the correct week or import the provider’s agenda first.</p>
        <label v-for="appointment in candidateAppointments" :key="appointment.id" class="review"><input v-model="appointmentIds" type="checkbox" :value="Number(appointment.id)" :disabled="busy" /> Appointment {{ appointment.id }} · {{ display(appointment.start_at) }}–{{ clock(appointment.end_at) }}</label>
        <label class="review"><input v-model="linksReviewed" type="checkbox" :disabled="busy" required /> I verified that these appointments belong to this client and school slot.</label>
        <button :disabled="busy || !appointmentIds.length || !linksReviewed" type="submit">Link reviewed appointments</button>
      </form>
    </template>
    <p v-else-if="context" class="hint">Choose the transition date to connect actual appointments with the school schedule.</p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import api from '../../../services/api';
const props=defineProps({schoolOrganizationId:{type:[Number,String],required:true},providerUserId:{type:[Number,String],required:true},allowSetup:Boolean,revision:{default:null}});
const emit=defineEmits(['busy']);
const context=ref(null),error=ref(''),success=ref(''),busy=ref(false),startDate=ref(''),effectiveDate=ref(''),transitionReviewed=ref(false);
const slotId=ref(''),appointmentIds=ref([]),linksReviewed=ref(false),editing=ref(null),moveDate=ref(''),moveStart=ref(''),moveEnd=ref('');
const base=()=>`/school-appointment-transition/${props.schoolOrganizationId}/providers/${props.providerUserId}`;
const dateObject=value=>value instanceof Date?value:new Date(String(value).includes('T')?value:String(value).replace(' ','T')+'Z');
const parts=value=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:context.value?.timeZone||'America/Denver',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(dateObject(value)).map(part=>[part.type,part.value]));
const clock=value=>/^\d{2}:\d{2}/.test(String(value||''))?String(value).slice(0,5):value?`${parts(value).hour}:${parts(value).minute}`:'Time not set';
const display=value=>new Intl.DateTimeFormat('en-US',{timeZone:context.value?.timeZone||'America/Denver',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(dateObject(value));
const addDays=(date,count)=>{const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+count);return next.toISOString().slice(0,10);};
let version=0,alive=true;
onBeforeUnmount(()=>{alive=false;version++;emit('busy',false);});
async function load(){
  if(!props.schoolOrganizationId||!props.providerUserId){context.value=null;return;}
  const token=++version;
  try{
    const params=startDate.value?{startDate:startDate.value,endDate:addDays(startDate.value,7)}:{};
    const response=await api.get(base(),{params});
    if(!alive||token!==version)return;
    context.value=response.data;startDate.value=response.data.startDate;effectiveDate.value=response.data.transition?.effectiveDate||response.data.today;
    editing.value=null;error.value='';
  }catch(e){if(alive&&token===version){context.value=null;error.value=e.response?.data?.error?.message||'School appointments could not be loaded.';}}
}
async function run(work){if(busy.value||!alive)return;const token=version;busy.value=true;emit('busy',true);error.value='';success.value='';try{if(!alive||token!==version)return;const message=await work();if(alive&&token===version){transitionReviewed.value=false;appointmentIds.value=[];linksReviewed.value=false;success.value=message;await load();}}catch(e){if(alive&&token===version)error.value=e.response?.data?.error?.message||'The school appointment change could not be saved.';}finally{busy.value=false;emit('busy',false);}}
const shift=count=>{startDate.value=addDays(startDate.value,count);load();};
async function saveTransition(){await run(async()=>{await api.put(base(),{effectiveDate:effectiveDate.value,revision:context.value?.transition?.revision||0,reviewed:transitionReviewed.value});return 'School transition date saved.';});}
const candidateAppointments=computed(()=>{const slot=context.value?.slots.find(s=>Number(s.id)===Number(slotId.value));return slot?(context.value?.candidates||[]).filter(a=>Number(a.client_id)===Number(slot.client_id)&&!a.linked_slot_id):[];});
async function link(){await run(async()=>{await api.post(`${base()}/links`,{slotId:Number(slotId.value),appointmentIds:appointmentIds.value,reviewed:linksReviewed.value});return 'Appointments linked. Their actual times now appear in the school schedule.';});}
function edit(appointment){editing.value=appointment;const p=parts(appointment.startAt);moveDate.value=`${p.year}-${p.month}-${p.day}`;moveStart.value=`${p.hour}:${p.minute}`;moveEnd.value=clock(appointment.endAt);}
async function move(){const appointment=editing.value;await run(async()=>{await api.put(`${base()}/appointments/${appointment.id}`,{date:moveDate.value,startTime:moveStart.value,endTime:moveEnd.value,fingerprint:appointment.fingerprint});return 'The actual appointment time changed. The provider and school now see the same booking.';});}
watch(slotId,()=>{appointmentIds.value=[];linksReviewed.value=false;});
watch(()=>[props.schoolOrganizationId,props.providerUserId,props.revision],()=>{startDate.value='';context.value=null;editing.value=null;success.value='';slotId.value='';load();},{immediate:true});
</script>

<style scoped>
.booked-school{padding:16px;border:1px solid var(--border,#cedbe8);border-radius:12px;background:var(--bg-primary,#fff);margin-top:12px;color:var(--text-primary,#22334a)}h4,h5{margin:0 0 10px}p{font-size:13px;line-height:1.5}.hint{color:var(--text-secondary,#526278)}.error{color:#a32323}.setup,.links,.move{padding:12px;border:1px solid var(--border,#cedbe8);border-radius:10px;margin:12px 0;display:flex;flex-wrap:wrap;gap:12px;align-items:end}.setup p,.move p,.links h5{flex-basis:100%}.links{display:grid}.review{display:flex;align-items:start;gap:8px;font-weight:400}.week-controls{display:flex;align-items:end;flex-wrap:wrap;gap:10px}label{display:grid;gap:6px;font-size:13px}button,input,select{font:inherit;padding:8px;border:1px solid var(--border,#b7c8da);border-radius:7px;background:var(--bg-primary,#fff);color:inherit}button{cursor:pointer}button:disabled{opacity:.6;cursor:default}.sessions{list-style:none;padding:0}.sessions li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--border,#dbe4ed);padding:12px 0}.sessions li p{margin:6px 0}input[type=checkbox]{margin-top:2px}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
</style>
