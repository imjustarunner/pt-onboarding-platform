<template>
 <section v-if="review" class="no-show-status" aria-label="No-show review">
  <template v-if="review.state==='pending'"><strong>No-show recorded · correction window open</strong><p>If the client arrives, undo this no-show by {{deadline}}. After that time the client will be notified and the provider will receive a copy. The missed-session consequence is pending.</p><button type="button" :disabled="busy||!review.canUndo" @click="undo">{{busy?'Undoing…':'Undo no-show — client arrived'}}</button></template>
  <p v-else-if="review.state==='undone'" role="status">This no-show was undone. Its signed declaration remains in history. No missed-session consequence or notice was applied.</p>
  <p v-else-if="review.state==='review'" role="alert">Attendance changed. Support must review the no-show outcome before any new consequence or notice.</p>
  <p v-else-if="review.state==='finalizing'">The no-show is being finalized. Refresh to check its result.</p>
  <p v-else>The no-show was finalized after its correction window. Any later correction requires Support review.</p>
  <p v-if="error" role="alert">{{error}} <button type="button" @click="load">Retry</button></p>
 </section>
</template>
<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({appointmentId:{type:Number,required:true},timeZone:{type:String,default:'America/Denver'}}),emit=defineEmits(['undone']);
const review=ref(null),error=ref(''),busy=ref(false);let seq=0,timer;
const deadline=computed(()=>review.value?.undoUntil?new Date(review.value.undoUntil).toLocaleString('en-US',{timeZone:props.timeZone,timeZoneName:'short'}):'the recorded deadline');
async function load(){const own=++seq;try{const {data}=await api.get(`/appointments/${props.appointmentId}/no-show-review`,{skipGlobalLoading:true});if(own===seq)review.value=data.review||null;}catch(e){if(own===seq&&review.value)error.value=e.response?.data?.error?.message||'The no-show status could not be refreshed.';}}
async function undo(){if(busy.value)return;busy.value=true;error.value='';try{const {data}=await api.post(`/appointments/${props.appointmentId}/no-show-review/undo`,{});review.value=data.review;emit('undone',data);window.dispatchEvent(new CustomEvent('appointment-attendance-changed',{detail:{appointmentId:props.appointmentId}}));}catch(e){error.value=e.response?.data?.error?.message||'The no-show could not be undone. Refresh its current status.';}finally{busy.value=false;}}
watch(()=>props.appointmentId,()=>{review.value=null;error.value='';if(props.appointmentId)load();},{immediate:true,flush:'sync'});
timer=setInterval(()=>{if(review.value&&['pending','finalizing'].includes(review.value.state)&&document.visibilityState==='visible')load();},15000);
onBeforeUnmount(()=>{seq++;clearInterval(timer);});
</script>
<style scoped>.no-show-status{margin:12px 0;padding:16px;border:1px solid #ddc26e;background:#fff9e8;color:#45391b;border-radius:10px;line-height:1.5}.no-show-status button{padding:10px 14px;min-height:44px}.no-show-status p{margin:8px 0}</style>
