<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';
import api from '../../services/api';
const props = defineProps({ appointmentId:Number, timeZone:String, modelValue:{type:Array,default:()=>[]}, pendingRequests:{type:Array,default:()=>[]} });
const emit = defineEmits(['update:modelValue','update:pendingRequests','busy']);
const draft = reactive({date:'',startTime:'09:00',endTime:'12:00',durationMinutes:60,gapMinutes:15,modality:'VIRTUAL',roomId:null});
const busy=ref(false),error=ref(''),result=ref(null);
const room = computed(()=>result.value?.rooms?.find(r=>r.id===draft.roomId));
const input = computed(()=>({localStart:`${draft.date}T${draft.startTime}`,localEnd:`${draft.date}T${draft.endTime}`,
  durationMinutes:draft.durationMinutes,gapMinutes:draft.gapMinutes,modality:draft.modality,roomId:draft.roomId}));
watch(()=>[props.appointmentId,draft.date,draft.startTime,draft.endTime,draft.durationMinutes,draft.gapMinutes,draft.modality],()=>{result.value=null;draft.roomId=null;error.value='';});
watch(()=>draft.roomId,()=>{if(result.value) result.value={...result.value,slots:[],unavailable:[]};});
function setBusy(value){busy.value=value;emit('busy',value);}
async function check(){
  if(busy.value || !props.appointmentId)return;
  setBusy(true);error.value='';
  try{result.value=(await api.post(`/appointments/${props.appointmentId}/change/replacement-options/range`,input.value,{skipGlobalLoading:true})).data;}
  catch(e){result.value=null;error.value=e.response?.data?.error?.message||'Could not check this time window.';}
  finally{setBusy(false);}
}
function selected(slot){return props.modelValue.some(s=>s.key===slot.key);}
function toggle(slot){emit('update:modelValue',selected(slot)?props.modelValue.filter(s=>s.key!==slot.key):[...props.modelValue,slot].slice(0,24));}
function selectAll(){emit('update:modelValue',[...new Map([...props.modelValue,...(result.value?.slots||[])].map(s=>[s.key,s])).values()].slice(0,24));}
async function requestRoom(){
  if(busy.value||!room.value?.needsRequest)return;
  setBusy(true);error.value='';
  const requested={...input.value,label:room.value.label,windowLabel:room.value.windowLabel};
  try{
    const {data}=await api.post(`/appointments/${props.appointmentId}/change/replacement-options/office-request`,{...input.value,confirmOneTime:true},{skipGlobalLoading:true});
    emit('update:pendingRequests',[...props.pendingRequests,{...requested,appointmentId:props.appointmentId,requestId:data.id}]);
    result.value=null;draft.roomId=null;
  }catch(e){error.value=e.response?.data?.error?.message||'Could not submit the office request.';}
  finally{setBusy(false);}
}
async function recheck(request){
  Object.assign(draft,{date:request.localStart.slice(0,10),startTime:request.localStart.slice(11),endTime:request.localEnd.slice(11),durationMinutes:request.durationMinutes,gapMinutes:request.gapMinutes,modality:request.modality});
  // Let the field-change watcher clear the previous room before restoring it.
  await nextTick();
  draft.roomId=request.roomId;await check();
}
</script>
<template>
  <section class="opening-builder" aria-label="Build replacement openings">
    <h4>Create openings from a time window</h4>
    <p>Choose a day and timeframe, then select individual openings to offer. Times use {{ timeZone || 'the provider’s timezone' }}. Session lengths must be allowed by the existing service or package.</p>
    <fieldset :disabled="busy"><legend>Time window</legend>
      <label>Date <input v-model="draft.date" type="date"></label>
      <label>From <input v-model="draft.startTime" type="time"></label>
      <label>Until <input v-model="draft.endTime" type="time"></label>
      <label>Session length <select v-model.number="draft.durationMinutes"><option v-for="minutes in [30,45,60]" :key="minutes" :value="minutes">{{minutes}} minutes</option></select></label>
      <label>Gap between openings <input v-model.number="draft.gapMinutes" type="number" min="0" max="120"> minutes</label>
      <label>Format <select v-model="draft.modality"><option value="VIRTUAL">Virtual</option><option value="IN_PERSON">In office</option><option value="BOTH">In office or virtual — client chooses</option></select></label>
      <label v-if="result?.rooms?.length">Room <select v-model="draft.roomId"><option :value="null">Choose a room</option><option v-for="r in result.rooms" :key="r.id" :value="r.id">{{r.label}} — {{r.needsRequest?'One-time request needed':'Already reserved for you'}}</option></select></label>
    </fieldset>
    <button type="button" :disabled="busy || !appointmentId || !draft.date || !draft.startTime || !draft.endTime" @click="check">{{busy?'Checking…':'Check openings'}}</button>
    <p v-if="error" role="alert">{{error}}</p>
    <template v-if="result">
      <p v-if="draft.modality!=='VIRTUAL' && !result.rooms?.length">No room covers this whole window. Try a smaller window or offer virtual times.</p>
      <div v-if="room?.needsRequest">
        <p>{{room.windowLabel}}. Room approval is required before these in-office openings can be offered.</p>
        <button type="button" :disabled="busy" @click="requestRoom">Confirm and request this room once</button>
      </div>
      <template v-if="result.slots?.length && (draft.modality==='VIRTUAL'||!room?.needsRequest)">
        <p>{{result.slots.length}} available opening(s). {{modelValue.length}} of 24 selected across all windows.</p>
        <button type="button" :disabled="busy || modelValue.length>=24" @click="selectAll">Select available openings</button>
        <label v-for="slot in result.slots" :key="slot.key" class="opening-choice"><input type="checkbox" :checked="selected(slot)" :disabled="busy || (modelValue.length>=24 && !selected(slot))" @change="toggle(slot)"> {{slot.label}}</label>
      </template>
      <p v-if="result.unavailable?.length">{{result.unavailable.length}} opening(s) excluded because of calendar conflicts.</p>
    </template>
    <div v-for="request in pendingRequests.filter(r=>r.localEnd)" :key="request.requestId" role="status">
      <p>Office request #{{request.requestId}} submitted: {{request.label}} · {{request.windowLabel}}. After approval, recheck and select the openings.</p>
      <button type="button" :disabled="busy || (request.appointmentId && request.appointmentId!==appointmentId)" @click="recheck(request)">Recheck room approval</button>
    </div>
  </section>
</template>
<style scoped>
.opening-builder{border:1px solid #dce2eb;border-radius:8px;padding:12px;margin:12px 0}.opening-builder fieldset{display:flex;flex-wrap:wrap;gap:12px;border:0;padding:0 0 12px}.opening-builder label{display:grid;gap:5px}.opening-builder input,.opening-builder select{padding:8px;font:inherit;max-width:100%;border:1px solid #b6c2d2;border-radius:6px}.opening-builder .opening-choice{display:flex;align-items:flex-start;margin:10px 0}.opening-builder p{font-size:14px}.opening-builder button{padding:8px 12px;margin:4px 0;border:1px solid #b6c2d2;border-radius:6px;background:white;cursor:pointer}.opening-builder button:disabled{opacity:.55;cursor:default}
</style>
