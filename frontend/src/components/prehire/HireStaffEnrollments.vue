<template>
 <section><h3>Staff text enrollments</h3><p>Your choices above and signed enrollment work together. Each enrollment is reviewed by People Operations before texts begin. You may choose No for every message type.</p>
  <p v-if="error" role="alert">{{error}}</p><p v-if="loading">Loading available programs…</p>
  <p v-else-if="!programs.length">No staff text programs are ready for enrollment yet. Your choices remain saved.</p>
  <p v-else-if="!phone">Add your personal mobile number in user setup before signing an enrollment.</p>
  <template v-else v-for="program in programs" :key="program.numberId">
   <p v-if="program.signed" role="status">{{program.disclosure.brandName}}: signed enrollment saved for People Operations review.</p>
   <SmsConsentForm v-else :disclosure="program.disclosure" :disclosure-hash="program.disclosureHash" :phone-last-four="program.phoneLastFour" signer-role="staff" :busy="busy" @sign="sign(program.numberId,$event)" />
  </template>
 </section>
</template>
<script setup>
import {ref,onMounted} from 'vue';
import SmsConsentForm from '../communications/SmsConsentForm.vue';
const props=defineProps({http:{type:Object,required:true},token:{type:String,required:true}});
const programs=ref([]),phone=ref(''),error=ref(''),busy=ref(false),loading=ref(true);
const base=()=>`/prehire-portal/${encodeURIComponent(props.token)}/staff-enrollments`;
async function load(){const {data}=await props.http.get(base());programs.value=data.programs;phone.value=data.phone;}
onMounted(async()=>{try{await load();}catch(e){error.value=e.response?.data?.error?.message||'Unable to load text enrollments.';}finally{loading.value=false;}});
async function sign(numberId,input){busy.value=true;error.value='';try{await props.http.post(base(),{...input,numberId});await load();}catch(e){error.value=e.response?.data?.error?.message||'Unable to save enrollment.';}finally{busy.value=false;}}
</script>
