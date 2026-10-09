<template>
 <aside ref="timerRoot" class="review-timer" aria-label="Co-sign review time">
  <p><strong>Co-sign review: {{ displayTime }}</strong> · {{ status }}</p>
  <p>Tracks active review of this provider’s note. Hidden windows and inactivity pause tracking. Your own notes are excluded.</p>
  <button type="button" @click="toggle" :disabled="!session || !!ended">{{ paused ? 'Resume timer' : 'Pause timer' }}</button>
  <p v-if="error" role="alert">{{ error }} Use Documentation review time to report work the timer missed.</p>
  <p>Review and submit recorded time under Documentation oversight → Documentation review &amp; RPO time.</p>
 </aside>
</template>
<script setup>
import {ref,computed,onMounted,onBeforeUnmount} from 'vue';
import api from '../../services/api.js';
const props=defineProps({agencyId:{type:[Number,String],required:true},providerId:{type:[Number,String],required:true},noteId:{type:[Number,String],required:true},contentHash:{type:String,required:true}});
const timerRoot=ref(null);
const session=ref(null),seconds=ref(0),paused=ref(false),ended=ref(false),error=ref(''),state=ref('Starting…');
const status=computed(()=>state.value),displayTime=computed(()=>`${Math.floor(seconds.value/60)}m ${Math.floor(seconds.value%60)}s`);
let interval,lastInput=Date.now(),disposed=false,queue=Promise.resolve();
const base=`/supervision/supervisee/${props.providerId}/cosign-time`;
const active=()=>!paused.value&&!globalThis.document.hidden&&globalThis.document.hasFocus()&&Date.now()-lastInput<60000;
function pulse(close=false){const isActive=active();queue=queue.catch(()=>{}).then(async()=>{if(!session.value||ended.value)return;try{const {data}=await api.post(`${base}/${session.value}/heartbeat`,{agencyId:Number(props.agencyId),active:isActive,close});seconds.value=Number(data.item.active_seconds);ended.value=!!data.item.ended_at;state.value=ended.value?'Saved':data.item.pausedReason?'Paused — overlapping time':isActive?'Tracking':'Paused';error.value=data.item.pausedReason||'';}catch(e){error.value=e.response?.data?.error?.message||'Time tracking could not save.';state.value='Not saving';}});return queue;}
function input(event){const pane=timerRoot.value?.closest('.document-review, .cosign-review');if(pane?.contains(event.target))lastInput=Date.now();}
function visibility(){pulse();}
function toggle(){paused.value=!paused.value;lastInput=Date.now();pulse();}
const events=['pointerdown','keydown','scroll','pointermove'];
onMounted(async()=>{try{const {data}=await api.post(`${base}/start`,{agencyId:Number(props.agencyId),noteId:Number(props.noteId),contentHash:props.contentHash,sessionKey:crypto.randomUUID()});session.value=data.item.id;seconds.value=Number(data.item.active_seconds||0);if(disposed){await pulse(true);return;}state.value='Tracking';for(const event of events)globalThis.document.addEventListener(event,input,true);globalThis.document.addEventListener('visibilitychange',visibility);globalThis.window.addEventListener('blur',visibility);interval=setInterval(()=>pulse(),15000);}catch(e){error.value=e.response?.data?.error?.message||'Unable to start review time tracking.';state.value='Not tracking';}});
onBeforeUnmount(()=>{disposed=true;clearInterval(interval);for(const event of events)globalThis.document.removeEventListener(event,input,true);globalThis.document.removeEventListener('visibilitychange',visibility);globalThis.window.removeEventListener('blur',visibility);pulse(true);});
</script>
<style scoped>.review-timer{padding:.8rem;border:1px solid #bccbd8;border-radius:8px;background:#edf4fa;color:#173346}.review-timer p{margin:.3rem 0;font-size:.9rem}.review-timer [role=alert]{color:#9c2424}</style>
