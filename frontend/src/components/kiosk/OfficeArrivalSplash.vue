<template>
  <Teleport to="body">
    <div v-if="arrival" class="arrival-shade" @keydown="trapFocus">
      <section ref="panel" class="arrival-panel" role="alertdialog" aria-modal="true" aria-labelledby="arrival-title" aria-describedby="arrival-message" tabindex="-1">
        <span class="arrival-icon" aria-hidden="true">✓</span>
        <p class="arrival-eyebrow">OFFICE CHECK-IN</p>
        <h2 id="arrival-title">Your client is here.</h2>
        <p id="arrival-message">{{ arrival.message }}</p>
        <p class="arrival-hint">{{ arrival.email_status === 'pending' ? 'Acknowledge now to stop the pending email reminder.' : 'Your arrival alert is saved in Notifications.' }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <button class="arrival-primary" :disabled="saving" @click="acknowledge(false)">{{ saving ? 'Saving…' : 'Got it · I’ll meet them' }}</button>
        <button class="arrival-secondary" :disabled="saving" @click="acknowledge(true)">Got it · Keep future check-ins in-app only</button>
        <small v-if="arrivals.length > 1">{{ arrivals.length - 1 }} more arrival{{ arrivals.length > 2 ? 's' : '' }} waiting</small>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import api from '../../services/api';
const arrivals=ref([]), saving=ref(false), error=ref(''), panel=ref(null);
const arrival=computed(()=>arrivals.value[0] || null);
let version=0;
let timer,disposed=false,fetching=false,previousFocus;
async function load(){
  if(fetching || saving.value || disposed)return;
  fetching=true;const request=version;
  try{const {data}=await api.get('/notifications/office-arrivals',{skipGlobalLoading:true});if(!disposed && request===version)arrivals.value=data.arrivals || [];}
  catch{/* Preserve visible arrivals during a transient network interruption. */}
  finally{fetching=false;}
}
async function acknowledge(inAppOnly){
  if(saving.value || !arrival.value)return;
  const id=arrival.value.id;version++;saving.value=true;error.value='';
  try{await api.post(`/notifications/office-arrivals/${id}/acknowledge`,{inAppOnly},{skipGlobalLoading:true});if(!disposed)arrivals.value=arrivals.value.filter(a=>a.id!==id);}
  catch{error.value='Acknowledgment could not be saved. Please try again.';}
  finally{saving.value=false;}
}
function trapFocus(event){
  if(event.key!=='Tab')return;
  const buttons=[...panel.value.querySelectorAll('button:not(:disabled)')];
  if(!buttons.length){event.preventDefault();return;}
  if(event.shiftKey && [buttons[0],panel.value].includes(document.activeElement)){event.preventDefault();buttons.at(-1).focus();}
  else if(!event.shiftKey && document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus();}
}
watch(()=>arrival.value?.id,async(id,old)=>{
  if(id){if(!old)previousFocus=document.activeElement;await nextTick();panel.value?.focus();}
  else previousFocus?.focus?.();
});
onMounted(()=>{load();timer=setInterval(load,10_000);window.addEventListener('focus',load);});
onUnmounted(()=>{disposed=true;clearInterval(timer);window.removeEventListener('focus',load);previousFocus?.focus?.();});
</script>
<style scoped>
.arrival-shade{position:fixed;inset:0;z-index:19000;background:#122b25a6;backdrop-filter:blur(7px);display:grid;place-items:center;padding:24px;overflow:auto}.arrival-panel{width:min(100%,540px);box-sizing:border-box;padding:42px;border-radius:28px;background:#f7f8f0;color:#24443d;text-align:center;box-shadow:0 24px 80px #0004;font-family:inherit}.arrival-icon{display:grid;place-items:center;margin:auto;width:72px;height:72px;border-radius:50%;font-size:36px;background:#dcebd9;color:#426b3c}.arrival-eyebrow{font-size:11px;letter-spacing:2px;margin:26px 0 12px}h2{font-size:36px;margin:0 0 20px;letter-spacing:-1px}p{line-height:1.65}.arrival-hint{font-size:13px;color:#647567}.arrival-panel button{font:inherit;width:100%;min-height:48px;border-radius:12px;padding:14px;cursor:pointer;margin-top:12px}.arrival-primary{border:0;background:#24443d;color:white}.arrival-secondary{border:1px solid #bdcdbd;background:transparent;color:#24443d;font-size:13px!important}.arrival-panel button:focus-visible{outline:3px solid #b78432;outline-offset:4px}.arrival-panel button:disabled{opacity:.6;cursor:wait}small{display:block;margin-top:16px}@media(max-width:500px){.arrival-panel{padding:26px}h2{font-size:30px}}
</style>
