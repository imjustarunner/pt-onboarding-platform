<template>
  <section class="exit-feedback" aria-labelledby="service-exit-feedback-title">
    <h3 id="service-exit-feedback-title">{{ ft('Help us improve (optional)') }}</h3>
    <p>{{ ft('This service has ended. Your feedback can help us improve care for others. You can skip this form.') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">{{ ft('Loading feedback form…') }}</p>
    <p v-else-if="submitted" role="status">{{ ft('Thank you for helping us improve. Your feedback has been shared with our team. This service and its notifications remain off.') }}</p>
    <form v-else-if="ready" @submit.prevent="submit">
      <label>{{ ft('How was your experience?') }}
        <select v-model="rating"><option value="">{{ ft('Prefer not to rate') }}</option><option v-for="score in 5" :key="score" :value="score">{{ score }} / 5{{ score===1?' — Very poor':score===5?' — Very good':'' }}</option></select>
      </label>
      <label>{{ ft('What could we do better?') }}<textarea v-model="comments" rows="3" maxlength="1000" /></label>
      <p>{{ ft('Your response is shared with our team. Please leave out medical details.') }}</p>
      <label class="follow-up"><input v-model="contactRequested" type="checkbox" /> {{ ft('Our team may contact me about this feedback only.') }}</label>
      <p>{{ ft('Submitting feedback does not restart services or turn notifications back on.') }}</p>
      <button type="submit" :disabled="busy||(!rating&&!comments.trim()&&!contactRequested)">{{ busy?ft('Sending…'):ft('Send feedback') }}</button>
    </form>
    <button v-if="!loading&&!ready&&!submitted" type="button" @click="load">{{ ft('Try again') }}</button>
    <button type="button" :disabled="busy" @click="emit('close')">{{ submitted?ft('Close'):ft('Skip feedback') }}</button>
  </section>
</template>
<script setup>
import {onMounted,onUnmounted,ref} from 'vue';
import {useFamilyLocale} from '../../composables/useFamilyLocale';
import {usePortalCareApi} from '../../composables/usePortalCareApi';
const props=defineProps({clientId:{type:Number,required:true},operationId:{type:String,required:true}});
const emit=defineEmits(['close']);
const {ft}=useFamilyLocale(),api=usePortalCareApi();
const rating=ref(''),comments=ref(''),contactRequested=ref(false),loading=ref(false),busy=ref(false),ready=ref(false),submitted=ref(false),error=ref('');
let disposed=false;
const url=()=>`/guardian-portal/clients/${props.clientId}/cancellations/${props.operationId}/feedback`;
async function load(){
  loading.value=true;error.value='';ready.value=false;
  try{const{data}=await api.get(url(),{skipGlobalLoading:true});if(!disposed){submitted.value=data.submitted===true;ready.value=true;}}
  catch(e){if(!disposed)error.value=e.response?.data?.error?.message||'The feedback form could not load. You can try again or skip it.';}
  finally{loading.value=false;}
}
async function submit(){
  if(busy.value)return;busy.value=true;error.value='';
  try{await api.post(url(),{rating:rating.value||null,comments:comments.value.trim(),contactRequested:contactRequested.value});if(!disposed)submitted.value=true;}
  catch(e){if(!disposed){if(e.response?.data?.error?.code==='EXIT_FEEDBACK_ALREADY_RECEIVED')submitted.value=true;else error.value=e.response?.data?.error?.message||'Your feedback could not be sent. Please try again.';}}
  finally{busy.value=false;}
}
onMounted(load);onUnmounted(()=>{disposed=true;});
</script>
<style scoped>
.exit-feedback{margin:16px 0;padding:20px;border:1px solid #c9dadd;border-radius:12px;background:#f3f9f8}.exit-feedback h3{margin-top:0}.exit-feedback label{display:grid;gap:6px;margin:12px 0}.exit-feedback .follow-up{display:flex;align-items:flex-start;gap:10px}.exit-feedback select,.exit-feedback textarea{width:100%;box-sizing:border-box;font:inherit;padding:9px;border:1px solid #91adb4;border-radius:7px}.exit-feedback input{width:20px;height:20px;flex:0 0 auto;margin:0}.exit-feedback button{font:inherit;min-height:44px;margin:8px 10px 0 0;padding:8px 14px;border:1px solid #7c9ca7;border-radius:7px;background:#fff;cursor:pointer}.exit-feedback button:disabled{opacity:.55;cursor:default}.exit-feedback [role=alert]{color:#9f1f2c}
</style>
