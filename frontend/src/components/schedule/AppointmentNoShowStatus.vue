<template>
 <section v-if="review" class="no-show-status" aria-label="No-show review">
  <template v-if="review.state==='pending'"><strong>No-show recorded · correction window {{windowClosed?'closed':'open'}}</strong><p v-if="!windowClosed">If the client arrives, undo this no-show by {{deadline}}. After that time the client will be notified and the provider will receive a copy. The missed-session consequence is pending.</p><p v-else>The correction window closed {{deadline}}. The missed-session outcome is awaiting processing.</p><button type="button" :disabled="busy||windowClosed||!review.canUndo" @click="confirming=true">{{busy?'Undoing…':'Undo no-show — client arrived'}}</button><p v-if="windowClosed">The time to undo this has passed. Contact Support to review.</p></template>
  <p v-else-if="review.state==='undone'" role="status">This no-show was undone. Its signed declaration remains in history. No missed-session consequence or notice was applied.</p>
  <p v-else-if="review.state==='review'" role="alert">Attendance changed. Support must review the no-show outcome before any new consequence or notice.</p>
  <p v-else-if="review.state==='finalizing'">The no-show is being finalized. Refresh to check its result.</p>
  <p v-else>The no-show was finalized after its correction window. Any later correction requires Support review.</p>
  <p v-if="error" role="alert">{{error}} <button type="button" @click="load">Retry</button></p>
  <form v-if="confirming" @submit.prevent="undo" aria-label="Undo no-show confirmation"><label>Reason for undoing this no-show<textarea v-model="reason" required maxlength="2000" rows="2" /></label><p>The original signed declaration stays in history. Record the attended work separately.</p><button :disabled="busy||!reason.trim()">Confirm undo</button><button type="button" :disabled="busy" @click="confirming=false">Keep no-show</button></form>
  <details v-if="history.length"><summary>Attendance correction history</summary><p v-for="row in history" :key="row.id">{{actionLabel(row.action)}} · {{format(row.at)}} · Actor #{{row.actorId||'system'}}<span v-if="row.reason"> · {{row.reason}}</span></p></details>
 </section>
</template>
<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({appointmentId:{type:Number,required:true},timeZone:{type:String,default:'America/Denver'}}),emit=defineEmits(['undone','changed']);
const review=ref(null),history=ref([]),error=ref(''),busy=ref(false),confirming=ref(false),reason=ref(''),now=ref(Date.now());let seq=0,timer;
const windowClosed=computed(()=>review.value?.correctionWindowClosed||now.value>=new Date(review.value?.undoUntil).getTime());
const format=value=>value?new Date(value).toLocaleString('en-US',{timeZone:props.timeZone,timeZoneName:'short'}):'Recorded time';
const actionLabel=value=>({no_show_declared:'No-show signed',no_show_undone:'No-show undone',no_show_finalized:'No-show finalized',no_show_finalization_needs_review:'Support review required'}[value]||'Attendance updated');
const deadline=computed(()=>review.value?.undoUntil?new Date(review.value.undoUntil).toLocaleString('en-US',{timeZone:props.timeZone,timeZoneName:'short'}):'the recorded deadline');
async function load(){const own=++seq;try{const {data}=await api.get(`/appointments/${props.appointmentId}/no-show-review`,{skipGlobalLoading:true});if(own===seq){const previous=review.value?.state;review.value=data.review||null;history.value=data.history||[];if(previous&&previous!==review.value?.state)emit('changed',data);}}catch(e){if(own===seq&&review.value)error.value=e.response?.data?.error?.message||'The no-show status could not be refreshed.';}}
async function undo(){if(busy.value||!reason.value.trim())return;busy.value=true;error.value='';seq++;try{const {data}=await api.post(`/appointments/${props.appointmentId}/no-show-review/undo`,{reason:reason.value.trim()},{skipGlobalLoading:true});review.value=data.review;confirming.value=false;emit('undone',data);window.dispatchEvent(new CustomEvent('appointment-attendance-changed',{detail:{appointmentId:props.appointmentId,status:data.status}}));await load();}catch(e){error.value=e.response?.data?.error?.message||'The no-show could not be undone. Refresh its current status.';}finally{busy.value=false;}}
watch(()=>props.appointmentId,()=>{review.value=null;history.value=[];confirming.value=false;reason.value='';error.value='';if(props.appointmentId)load();},{immediate:true,flush:'sync'});
timer=setInterval(()=>{now.value=Date.now();if(review.value&&['pending','finalizing'].includes(review.value.state)&&document.visibilityState==='visible'&&!busy.value)load();},15000);
onBeforeUnmount(()=>{seq++;clearInterval(timer);});
</script>
<style scoped>.no-show-status{margin:12px 0;padding:16px;border:1px solid #ddc26e;background:#fff9e8;color:#45391b;border-radius:10px;line-height:1.5}.no-show-status button{padding:10px 14px;min-height:44px}.no-show-status p{margin:8px 0}</style>
