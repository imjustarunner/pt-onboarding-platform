<template>
 <section class="return-request" aria-label="Request consideration for services">
  <h3>Request to be considered for services again</h3><p>You can ask the team to review whether services with {{ providerName || 'this provider' }} may be appropriate again. This is a review request; it does not restart services, turn notifications on, or book a session.</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">Loading your request…</p>
  <template v-else-if="request"><p role="status">{{ request.status==='pending'?'Your request is waiting for team review.':request.status==='declined'?'The team reviewed your request and is unable to restart services at this time.':'The team has reviewed your request. Please contact them to discuss next steps.' }}</p><p v-if="request.note"><strong>Your request:</strong> {{ request.note }}</p><p v-if="request.response">{{ request.response }}</p><p>Booking remains unavailable until the team explicitly reactivates the service.</p><button type="button" :disabled="busy" @click="load">Check for an update</button><button v-if="request.status!=='pending'" type="button" @click="another">Request consideration again</button></template>
  <form v-else-if="ready" @submit.prevent="submit"><label>Anything you would like the team to know? (optional)<textarea v-model="note" rows="3" maxlength="1000" /></label><button type="submit" :disabled="busy">{{ busy?'Sending request…':'Send review request' }}</button></form>
  <button v-if="!loading&&!ready" type="button" @click="load">Try again</button>
 </section>
</template>
<script setup>
import {ref,onMounted,onUnmounted} from 'vue';
import {usePortalCareApi} from '../../composables/usePortalCareApi';
const props=defineProps({clientId:{type:Number,required:true},serviceId:{type:Number,required:true},providerName:String});
const api=usePortalCareApi(),request=ref(null),note=ref(''),loading=ref(false),ready=ref(false),busy=ref(false),error=ref('');let requestId=null,disposed=false;
const url=()=>`/guardian-portal/clients/${props.clientId}/services/${props.serviceId}/return-request`;
async function load(){loading.value=true;error.value='';try{const{data}=await api.get(url(),{skipGlobalLoading:true});if(!disposed){request.value=data.request||null;ready.value=true;}}catch(e){if(!disposed)error.value=e.response?.data?.error?.message||'Your request status could not load.';}finally{loading.value=false;}}
async function submit(){if(busy.value)return;busy.value=true;error.value='';requestId ||= crypto.randomUUID();try{const{data}=await api.post(url(),{requestId,note:note.value.trim()});if(!disposed)request.value=data.request;}catch(e){if(!disposed)error.value=e.response?.data?.error?.message||'The connection was interrupted. Retry to check the same request safely.';}finally{busy.value=false;}}
function another(){request.value=null;note.value='';requestId=null;}
onMounted(load);onUnmounted(()=>{disposed=true;});
</script>
<style scoped>
.return-request{margin:18px 0;padding:16px;border:1px solid #cadce3;border-radius:10px;background:#f6fafb}.return-request label{display:grid;gap:7px}.return-request textarea{font:inherit;width:100%;box-sizing:border-box;padding:9px;border:1px solid #9cb4bf;border-radius:7px}.return-request button{font:inherit;min-height:44px;margin:10px 10px 0 0;padding:9px 14px;border:1px solid #7d9cab;border-radius:7px;background:#fff;cursor:pointer}.return-request [role=alert]{color:#9f1f2c}
</style>
