<template>
  <Teleport to="body"><div v-if="current" class="event-splash-overlay" @click.self="dismiss">
    <section class="event-splash" role="dialog" aria-modal="true" aria-labelledby="event-splash-title" tabindex="-1" ref="dialog" @keydown.esc.prevent="dismiss" @keydown.tab="trapFocus">
      <button type="button" class="event-splash-close" :disabled="busy" aria-label="Dismiss event update" @click="dismiss">×</button>
      <span class="event-splash-label">Conversa · {{ current.kind === 'poll' ? 'Your team poll' : current.kind === 'rsvp' ? 'Your invitation' : 'Event update' }}</span>
      <h2 id="event-splash-title">{{ current.title }}</h2><p class="question">{{ current.message }}</p>
      <p v-if="current.closesAt" class="deadline">{{ current.kind === 'poll' ? 'Voting closes' : 'RSVP by' }} {{ date(current.closesAt) }}</p>
      <div v-if="current.options?.length && current.responseUrl" class="answers"><button v-for="option in current.options" :key="option.key" type="button" :disabled="busy" @click="reply(option.key)">{{ option.label }}</button></div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="current.potluck" class="potluck">Joining the potluck? Open the event to choose what you’re bringing.</p>
      <div class="event-splash-footer"><a :href="current.url" class="event-splash-action" @click.prevent="openDetails">{{ current.kind === 'poll' ? 'View poll details' : 'View event & potluck' }} →</a><button type="button" class="event-splash-later" :disabled="busy" @click="dismiss">Dismiss for now</button></div>
      <small>{{ items.length > 1 ? `${items.length} items remaining · ` : '' }}{{ current.kind === 'announcement' ? 'You can revisit this on the event page.' : 'We’ll ask again next time you sign in until you reply.' }}</small>
    </section>
  </div></Teleport>
</template>
<script setup>
import {computed,nextTick,onMounted,onUnmounted,ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({userId:{type:[Number,String],required:true},visitId:{type:String,default:''},agencyId:{type:[Number,String],default:null}});
const items=ref([]),dialog=ref(null),error=ref(''),busy=ref(false),current=computed(()=>items.value[0]);
let timer,viewTimer,previousFocus,generation=0,requestNumber=0,displayId=null,viewPromise=null;
const fallbackVisit=crypto.randomUUID(),handled=new Set(),retryActions=[];
const visit=()=>props.visitId || fallbackVisit;
const date=value=>new Date(value).toLocaleString([],{dateStyle:'medium',timeStyle:'short'});
async function refresh(){
  if(busy.value)return;
  const g=generation,request=++requestNumber;
  try{const {data}=await api.get('/company-events/announcements/mine',{params:{visitId:visit()},skipGlobalLoading:true});
    if(g!==generation||request!==requestNumber||busy.value)return;
    const available=(Array.isArray(data)?data:[]).filter(item=>!handled.has(item.id));
    const old=current.value?.id;
    items.value=[...available.filter(item=>item.id===old),...available.filter(item=>item.id!==old)];
  }catch(e){if(g===generation&&[401,403].includes(e?.response?.status))items.value=[];}
}
function payload(item,action,id=displayId){return {itemId:item.id,displayId:id,action,visitId:visit()};}
async function ensureView(){
  if(!current.value||document.visibilityState==='hidden')return false;
  if(!viewPromise && typeof document.elementFromPoint==='function'){
    const rect=dialog.value?.getBoundingClientRect();
    if(!rect?.width||!rect?.height)return false;
    const top=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,rect.x+rect.width/2)),Math.max(0,Math.min(innerHeight-1,rect.y+rect.height/2)));
    if(!top||!dialog.value.contains(top))return false;
  }
  if(!viewPromise){const data=payload(current.value,'viewed');viewPromise=api.post('/company-events/announcements/interactions',data,{skipGlobalLoading:true}).catch(e=>{viewPromise=null;throw e;});}
  await viewPromise;return true;
}
async function recordAction(item,action,id){
  const g=generation,view=payload(item,'viewed',id),completion=payload(item,action,id);
  try{await ensureView();if(g!==generation)return;await api.post('/company-events/announcements/interactions',completion,{skipGlobalLoading:true});}
  catch{if(g===generation)retryActions.push({view,action:completion});}
}
async function retryTracking(){
  const g=generation;
  for(const pending of [...retryActions]){try{await api.post('/company-events/announcements/interactions',pending.view,{skipGlobalLoading:true});if(g!==generation)return;await api.post('/company-events/announcements/interactions',pending.action,{skipGlobalLoading:true});retryActions.splice(retryActions.indexOf(pending),1);}catch{break;}}
  await ensureView().catch(()=>{});
}
function remove(item){handled.add(item.id);items.value=items.value.filter(value=>value.id!==item.id);error.value='';if(!items.value.length)previousFocus?.focus?.();}
async function dismiss(){if(busy.value||!current.value)return;const item=current.value,id=displayId,g=generation;busy.value=true;await recordAction(item,'dismissed',id);if(g!==generation)return;remove(item);busy.value=false;}
async function reply(key){
  if(busy.value||!current.value)return;
  const item=current.value,id=displayId,g=generation;busy.value=true;error.value='';
  try{await ensureView().catch(()=>{});await api.post(item.responseUrl,item.kind==='poll'?{responseKey:key}:{response:key},{headers:{'X-Agency-Id':item.agencyId}});
    if(g!==generation)return;await recordAction(item,'responded',id);if(g!==generation)return;remove(item);window.dispatchEvent(new CustomEvent('company-event-response-updated',{detail:{eventId:item.eventId}}));
  }catch(e){if(g===generation){error.value=e.response?.data?.error?.message||'We couldn’t save your response. Please try again.';if([404,409].includes(e?.response?.status)){busy.value=false;await refresh();}}}
  finally{if(g===generation)busy.value=false;}
}
async function openDetails(){if(busy.value||!current.value)return;const item=current.value,id=displayId,g=generation;busy.value=true;await recordAction(item,'opened',id);if(g!==generation)return;remove(item);busy.value=false;window.location.assign(item.url);}
function trapFocus(event){const nodes=dialog.value?.querySelectorAll('button:not(:disabled),a[href]');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&[first,dialog.value].includes(document.activeElement)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
watch(()=>current.value?.id,async(value,old)=>{displayId=value?crypto.randomUUID():null;viewPromise=null;error.value='';if(value){if(!old)previousFocus=document.activeElement;const g=generation;await nextTick();if(g!==generation)return;dialog.value?.focus();await ensureView().catch(()=>{});}});
watch(()=>[props.userId,props.visitId,props.agencyId],()=>{generation++;items.value=[];handled.clear();retryActions.length=0;viewPromise=null;busy.value=false;refresh();});
function visibilityChanged(){if(document.visibilityState!=='hidden'){retryTracking();refresh();}}
onMounted(()=>{refresh();viewTimer=setInterval(()=>{if(!viewPromise)ensureView().catch(()=>{});},1000);timer=setInterval(()=>{retryTracking();refresh();},60000);document.addEventListener('visibilitychange',visibilityChanged);window.addEventListener('company-event-response-updated',refresh);});
onUnmounted(()=>{generation++;clearInterval(timer);clearInterval(viewTimer);document.removeEventListener('visibilitychange',visibilityChanged);window.removeEventListener('company-event-response-updated',refresh);previousFocus?.focus?.();});
</script>
<style scoped>
.event-splash-overlay{position:fixed;inset:0;z-index:9900;background:#10274399;backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px}.event-splash{position:relative;width:min(100%,560px);max-height:calc(100dvh - 40px);overflow:auto;box-sizing:border-box;border-radius:22px;padding:36px;background:#fff;color:#183454;box-shadow:0 25px 100px #10271d40;outline:0;border-top:6px solid #6457c9}.event-splash-label{font-size:12px;font-weight:750;letter-spacing:1px;color:#6556b5}.event-splash h2{color:#183454;font-size:27px;line-height:1.2;margin:20px 24px 16px 0}.question{font-size:17px;line-height:1.6;white-space:pre-wrap}.deadline{background:#f0edff;border-radius:8px;padding:10px 12px;font-size:13px;color:#51488c}.event-splash-close{position:absolute;right:18px;top:14px;border:0;background:transparent;font-size:28px;color:#52677f;cursor:pointer}.answers{display:grid;gap:10px;margin:24px 0}.answers button{border:1px solid #b8cbe0;border-radius:12px;background:#f4f8fd;padding:14px 18px;text-align:left;color:#183454;font:inherit;cursor:pointer}.answers button:hover{border-color:#6457c9;background:#f0edff}.event-splash-footer{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.event-splash-action{font-size:14px;color:#5140b2;text-decoration:none;padding:10px 0}.event-splash-later{border:1px solid #cad4df;border-radius:8px;background:#fff;color:#344d6b;padding:11px 14px;cursor:pointer;font:inherit;font-size:14px}.event-splash small,.potluck{display:block;color:#5b6c81;font-size:12px;line-height:1.6;margin-top:15px}.error{color:#a32c27;font-size:14px}button:focus-visible,a:focus-visible{outline:3px solid #9589ef;outline-offset:3px}button:disabled{opacity:.6;cursor:wait}@media(max-width:500px){.event-splash{padding:26px 20px}.event-splash h2{font-size:23px}.event-splash-overlay{padding:12px}}
</style>
