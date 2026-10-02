<template>
  <section class="private-office">
    <header><div><p class="eyebrow">Your private space</p><h1>My virtual office</h1></div><span v-if="plan">{{ plan.name }}</span></header>
    <p>A permanent link you can share. Every guest takes a snapshot and waits for you to review it and admit them individually.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="room">
      <label>Your office link<input readonly :value="joinUrl" @focus="$event.target.select()" /></label>
      <button @click="copy">{{ copied ? 'Copied' : 'Copy office link' }}</button>
      <p v-if="!plan.multipleOfficeGuests">One guest at a time. Premium Plus supports couples and families.</p>
      <div class="office-layout">
        <div class="office-main"><div v-if="video" class="office-video"><VideoSessionRoom v-bind="video" :is-host-or-cohost="true" :show-layout-controls="true" @connected="connected=true" @leave-request="end" @disconnected="onDisconnect" @meeting-ended="end" /></div>
          <button v-if="!video" :disabled="busy" @click="open">Open office video</button><button v-else :disabled="busy" @click="end">End office visit for everyone</button>
        </div>
        <aside aria-label="Office waiting room"><h2>Waiting · {{ waiting.length }}</h2>
          <p v-if="!waiting.length">No guests waiting.</p>
          <article v-for="guest in waiting" :key="guest.id"><img :src="guest.guestPhotoUrl" :alt="`Snapshot supplied by ${guest.guestDisplayName}`" /><strong>{{ guest.guestDisplayName }}</strong>
            <p>Check the photo and name before admitting.</p><button :disabled="!connected || busy || (!plan.multipleOfficeGuests && admitted.length>0)" @click="admit(guest.id)">Admit {{ guest.guestDisplayName }}</button><button :disabled="busy" @click="dismiss(guest.id)">Dismiss</button>
          </article>
          <h2>Admitted · {{ admitted.length }}</h2><p v-for="guest in admitted" :key="guest.id">{{ guest.guestDisplayName }}</p>
        </aside>
      </div>
    </template>
    <div v-else-if="plan && !plan.privateOffice"><p>Your plan includes Documentation Hub. Upgrade to Premium for a private office, or Premium Plus for multiple office guests.</p></div>
    <p v-if="plan?.grandfathered">Your existing account includes Premium Plus.</p>
  </section>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import VideoSessionRoom from '../video/VideoSessionRoom.vue';
const props=defineProps({agencyId:{type:Number,default:0},request:{type:Function,required:true},publicOrigin:{type:String,default:''}});
const call=(path,method='GET',body)=>props.request(path,{method,body});
const room=ref(null),plan=ref(null),waiting=ref([]),admitted=ref([]),video=ref(null),connected=ref(false),error=ref(''),busy=ref(false),copied=ref(false);
const joinUrl=computed(()=>`${props.publicOrigin||window.location.origin}/join/my-room/${room.value?.slug}`);
let timer,stopped=false;
async function action(fn){if(busy.value)return;busy.value=true;error.value='';try{await fn();}catch(e){error.value=e.response?.data?.error?.message||e.message;}finally{busy.value=false;}}
async function refresh(){try{const data=await call('/me/lobby');waiting.value=data.waiting;admitted.value=data.admitted;if(connected.value)await call('/me/heartbeat','POST');}catch(e){error.value=e.response?.data?.error?.message||e.message;if([401,403,404].includes(Number(e.response?.status||e.status))){video.value=null;connected.value=false;}}}
const open=()=>action(async()=>{video.value=await call('/me/video-token','POST');});
const end=()=>action(async()=>{await call('/me/end','POST');video.value=null;connected.value=false;await refresh();});
function onDisconnect(){connected.value=false;video.value=null;void call('/me/end','POST').catch(e=>{error.value=e.response?.data?.error?.message||e.message;});}
const admit=id=>action(async()=>{await call(`/lobby/${id}/admit`,'POST');await refresh();});
const dismiss=id=>action(async()=>{await call(`/lobby/${id}/dismiss`,'POST');await refresh();});
const copy=()=>action(async()=>{await navigator.clipboard.writeText(joinUrl.value);copied.value=true;});
onMounted(async()=>{await action(async()=>{plan.value=(await call('/me/plan')).plan;if(plan.value.privateOffice){room.value=(await call('/me')).room;await refresh();}});if(!stopped&&room.value)timer=setInterval(refresh,5000);});
onBeforeUnmount(()=>{stopped=true;clearInterval(timer);if(video.value)void call('/me/end','POST').catch(()=>{});});
</script>
<style scoped>
.private-office{box-sizing:border-box;font-family:system-ui,sans-serif;padding:24px;max-width:1200px;margin:auto;background:#f5faf8;color:#173f39;border-radius:18px}.private-office header{display:flex;justify-content:space-between;align-items:center}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.8rem}.private-office input{box-sizing:border-box;display:block;width:100%;padding:12px;margin:8px 0}.private-office button{padding:10px 15px;margin:6px;border-radius:8px;border:1px solid #29745f;background:white;color:#184b3b}.private-office button:disabled{opacity:.5}.office-main{min-width:0}.office-video{height:620px;max-height:75vh;min-height:430px;overflow:hidden;border-radius:12px}.office-layout{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:18px}.private-office aside{max-height:75vh;overflow:auto}.private-office article{padding:12px;border:1px solid #bad4ca;border-radius:12px;margin:12px 0}.private-office img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px}.private-office [role=alert]{color:#a12424}@media(max-width:750px){.office-layout{grid-template-columns:1fr}}
</style>
