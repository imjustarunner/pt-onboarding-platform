<template><VirtualTutoringSessionView v-if="sessionId" :key="sessionId" :guest-session-id="sessionId"/><main v-else class="guest-entry"><h1>Next Level Up · Session Hub</h1><p v-if="busy" role="status">Opening your session invitation…</p><template v-else><p role="alert">{{error}}</p><p>Ask your tutor or the office for the current appointment invitation.</p><button @click="exchange">Try again</button></template></main></template>
<script setup>
import {ref,onMounted} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import axios from 'axios';
import {getApiBaseUrl} from '../../utils/apiBaseUrl';
import VirtualTutoringSessionView from './VirtualTutoringSessionView.vue';
const route=useRoute(),router=useRouter(),sessionId=ref(route.params.guestSessionId||''),busy=ref(true),error=ref('');
async function exchange(){const token=route.params.token||route.hash.slice(1);if(!token){busy.value=false;error.value='Open the session invitation from your appointment email.';return;}busy.value=true;error.value='';try{const {data}=await axios.post(getApiBaseUrl()+'/tutoring-guest/exchange',{token},{withCredentials:true});const slug=route.params.organizationSlug;await router.replace({path:(slug?'/'+slug:'')+'/tutoring/guest/'+data.sessionId});sessionId.value=data.sessionId;}catch(e){error.value=e.response?.data?.error?.message||'This session invitation could not be opened. It may have expired or changed.';}finally{busy.value=false;}}
onMounted(()=>{let meta=document.querySelector('meta[name="referrer"]');if(!meta){meta=document.createElement('meta');meta.name='referrer';document.head.append(meta);}meta.content='no-referrer';if(!sessionId.value)exchange();});
</script>
<style scoped>.guest-entry{font:16px/1.6 system-ui;max-width:600px;padding:40px;margin:auto;color:#16344d}.guest-entry h1{font-size:24px}.guest-entry button{padding:10px 18px;background:#194d6b;color:white;border:0;border-radius:8px}</style>
