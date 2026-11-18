<template>
  <aside v-if="clocks.length || (onChildcarePage && lookupError)" class="clock-notice" aria-label="Childcare time clock">
    <p v-for="shift in clocks" :key="shift.id"><strong>You’re clocked in for {{ shift.title || 'childcare' }}.</strong> Since {{ when(shift) }}. <button type="button" @click="open(shift)">Clock out / review shift</button></p>
    <p v-if="lookupError" role="alert">{{ lookupError }} <button type="button" @click="refresh">Retry</button></p>
    <p v-if="error && !prompt" role="alert">{{error}}</p>
    <teleport to="body"><div v-if="prompt" class="clock-backdrop" @keydown.esc.prevent="stay" @keydown.tab="trapFocus">
      <section ref="dialog" class="clock-dialog" role="dialog" aria-modal="true" aria-labelledby="childcare-clock-title" tabindex="-1">
        <h2 id="childcare-clock-title">You’re still clocked in</h2><p>{{ prompt.title || 'Childcare shift' }} · {{ when(prompt) }}</p>
        <p>Clock out now only if your work is ending now. For an earlier finish, review the shift and request an actual time correction.</p>
        <p>Were the scheduled <strong>{{ prompt.plannedChildren }} children</strong> present?</p>
        <label><input v-model="choice" type="radio" value="planned" /> Yes, {{ prompt.plannedChildren }} children</label>
        <label><input v-model="choice" type="radio" value="actual" /> A different number</label>
        <label v-if="choice==='actual'">Actual children<input v-model="actual" type="number" min="0" step="1" /></label>
        <label><input v-model="choice" type="radio" value="later" /> Attendance needs review; retain my time</label>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="clock-actions"><button type="button" :disabled="busy||!choice" @click="clockOut">Clock out now</button><button type="button" :disabled="busy" @click="stay">Stay clocked in</button><button type="button" :disabled="busy" @click="open(prompt)">Review / correct shift</button></div>
      </section>
    </div></teleport>
  </aside>
</template>
<script setup>
import { computed,ref,watch,onMounted,onBeforeUnmount,nextTick } from 'vue';
import { useAuthStore } from '../../store/auth';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { parseUtcInstant } from '../../utils/timezones';
import { childcareCountPayload } from '../../utils/childcarePresentation';
const auth=useAuthStore(),router=useRouter();
const clocks=ref([]),prompt=ref(null),dialog=ref(null),busy=ref(false),error=ref(''),choice=ref(''),actual=ref('');
const lookupError=ref('');
const onChildcarePage=computed(()=>/\/childcare(?:\/|$)/.test(router.currentRoute?.value?.path||''));
let generation=0,timer,previousFocus,punchKey=null;
const when=shift=>parseUtcInstant(shift.clockedInAt)?.toLocaleString('en-US',{timeZone:shift.timezone||'America/Denver',timeZoneName:'short'})||'the recorded start';
const message=e=>e.response?.data?.error?.message||'Your clock status could not be updated. Review the shift before retrying.';
const acknowledgedClocks=new Set();
const marker=shift=>`${auth.user?.id}:${shift.id}:${shift.clockedInAt}`;
function acknowledged(shift){return acknowledgedClocks.has(marker(shift));}
function dismiss(){if(prompt.value)acknowledgedClocks.add(marker(prompt.value));prompt.value=null;previousFocus?.focus?.();}
async function refresh(){
 const token=++generation,uid=auth.user?.id;
 if(!auth.isAuthenticated||!uid){clocks.value=[];prompt.value=null;lookupError.value='';return;}
 try {
  const {data}=await api.get('/childcare/active-clocks',{skipGlobalLoading:true});
  if(token!==generation||uid!==auth.user?.id)return;
  clocks.value=data.shifts||[];lookupError.value='';
  if(prompt.value&&!clocks.value.some(row=>row.id===prompt.value.id))dismiss();
  if(!prompt.value){const next=clocks.value.find(row=>!acknowledged(row));if(next){previousFocus=document.activeElement;prompt.value=next;choice.value='';actual.value='';punchKey=null;await nextTick();dialog.value?.focus();}}
 }catch(e){if(token===generation){
  if([401,403].includes(e.response?.status)){clocks.value=[];prompt.value=null;lookupError.value='';}
  else lookupError.value=clocks.value.length?'Unable to refresh your clock status. Your last confirmed active shift is shown; open Childcare to review your time.':'Childcare clock status is unavailable. Open Childcare to check your recorded time.';
 }}
}
async function stay(){if(!prompt.value||busy.value)return;busy.value=true;try{await api.post(`/childcare/shifts/${prompt.value.id}/clock-reminder-choice`,{choice:'stay'});dismiss();error.value='';}catch(e){error.value=message(e);}finally{busy.value=false;}}
function open(shift){const target={...shift};dismiss();router.push({path:`/${target.agencySlug}/childcare`,query:{shiftId:String(target.id),focus:'clock-out'}});}
async function clockOut(){
 if(!prompt.value||busy.value)return;
 try {
  const counts=childcareCountPayload(choice.value,actual.value,prompt.value.plannedChildren);busy.value=true;error.value='';
  punchKey||=crypto.randomUUID();
  const shift={...prompt.value};
  await api.post(`/childcare/shifts/${shift.id}/clock-out`,{...counts,idempotencyKey:punchKey});
  dismiss();window.dispatchEvent(new Event('childcare-clock-changed'));await refresh();
  router.push({path:`/${shift.agencySlug}/childcare`,query:{shiftId:String(shift.id),focus:'finalize'}});
 }catch(e){error.value=message(e);}finally{busy.value=false;}
}
function trapFocus(event){const nodes=[...(dialog.value?.querySelectorAll('button:not(:disabled),input,[tabindex="0"]')||[])];if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.value)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
const visibleRefresh=()=>{if(document.visibilityState==='visible')refresh();};
watch(()=>[auth.user?.id,auth.isAuthenticated],()=>{generation++;acknowledgedClocks.clear();clocks.value=[];prompt.value=null;error.value='';lookupError.value='';refresh();},{immediate:true,flush:'sync'});
onMounted(()=>{window.addEventListener('childcare-clock-changed',refresh);document.addEventListener('visibilitychange',visibleRefresh);timer=window.setInterval(visibleRefresh,60000);});
onBeforeUnmount(()=>{generation++;window.clearInterval(timer);window.removeEventListener('childcare-clock-changed',refresh);document.removeEventListener('visibilitychange',visibleRefresh);});
</script>
<style scoped>
.clock-notice{padding:12px 20px;background:#fff1bd;color:#393014;border-top:1px solid #d0a84c;position:fixed;left:16px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:min(480px,calc(100vw - 72px));border-radius:10px;box-shadow:0 3px 18px #102f3233;z-index:1001}.clock-notice p{margin:4px 0}.clock-notice button{margin-left:8px}.clock-backdrop{position:fixed;inset:0;background:#102f32a8;display:grid;place-items:center;z-index:11000;padding:16px}.clock-dialog{background:white;color:#183a35;border-radius:14px;padding:24px;max-width:560px;max-height:90vh;overflow:auto}.clock-dialog label{display:block;margin:12px 0}.clock-dialog input[type=number]{display:block;padding:8px}.clock-actions{display:flex;gap:12px;flex-wrap:wrap}.clock-dialog button{padding:10px}button:focus-visible,input:focus-visible{outline:3px solid #3377b2;outline-offset:2px}
</style>
