<template><main class="session-entry card"><img src="/auricwell-logo.png" alt="AuricWell" width="180" /><h1>Your virtual session</h1><p v-if="error" class="error" role="alert">{{ error }}</p><p>Join from a private place when you are ready.</p><button v-if="!joined" :disabled="busy" @click="join">{{ busy ? 'Connecting…' : 'Join session' }}</button><a v-if="url" :href="url" target="_blank" rel="noopener noreferrer">Open your Google Meet session</a><div id="guest-subscribers"></div><div id="guest-publisher"></div><button v-if="joined" @click="leave">Leave session</button></main></template>
<script setup>
import { ref, nextTick, onBeforeUnmount } from 'vue';
import { api } from './api';
const token=new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null,'',location.pathname);
const error=ref(''),busy=ref(false),joined=ref(false),url=ref('');let session;
async function join(){busy.value=true;error.value='';try{const r=await api('/sessions/join',{method:'POST',body:{token}});if(r.provider==='google_meet'){url.value=r.url;return;}const {default:OT}=await import('@vonage/client-sdk-video');await nextTick();session=OT.initSession(r.apiKey,r.sessionId);session.on('streamCreated',e=>session.subscribe(e.stream,'guest-subscribers',{insertMode:'append',width:'100%',height:420}));session.connect(r.token,e=>{if(e){error.value='Unable to connect. Please try again.';return;}joined.value=true;session.publish(OT.initPublisher('guest-publisher',{width:240,height:180}));});}catch(e){error.value=e.message;}finally{busy.value=false;}}
function leave(){session?.disconnect();session=null;joined.value=false;}
onBeforeUnmount(leave);
</script>
<style scoped>.session-entry{max-width:1000px;margin:32px auto;padding:24px}a{display:block;margin-top:18px}</style>
