<template>
  <section id="auricwell-portal-guide" class="portal-guide" aria-label="About your AuricWell portal">
    <div class="guide-heading"><strong>AuricWell <span class="beta-badge">Beta</span></strong><span>Established 2026 · Built around your care</span></div>
    <p>A place to keep up with your care and your family’s care. Thank you for helping us make it better.</p>
    <details :open="learnOpen" @toggle="learnOpen = $event.target.open">
      <summary>Learn about your portal and how your information is protected</summary>
      <div class="guide-details">
        <h3>One account, the right information</h3>
        <p>Switch profiles to see your own care or an authorized dependent’s appointments, shared documents, messages and billing. Your agency, school and provider are shown with the relevant profile. The information available depends on your access and what your care team has shared.</p>
        <h3>Your information stays connected to your care</h3>
        <ul>
          <li>Sign-in and profile access checks limit which records you can open. Another guardian’s access can differ from yours.</li>
          <li>Use this portal over its HTTPS connection for sensitive information. Care messages and the text of support reports are encrypted before storage.</li>
          <li>Documents and support screenshots require authorized access. Screenshots submitted through “Report a portal issue” are encrypted before storage and attached to your ticket, not published on a public page.</li>
          <li>Card details are collected by the payment processor. Saving a card and authorizing payments are separate steps.</li>
          <li>You control available notification choices for each profile. Optional text updates require your choice to enroll.</li>
        </ul>
        <p>Your care agency manages your care record. You can ask your care team about access, corrections or records requests. <router-link to="/privacy-policy">Read the privacy policy</router-link>.</p>
        <h3>We are still improving</h3>
        <p>AuricWell is in Beta, so you may occasionally encounter a bug or an unfinished detail. Your reports help us improve the experience. For appointment, care or billing questions, use Messages to reach the appropriate team.</p>
      </div>
    </details>
    <details v-if="clientId && agencyId" class="report-details" :open="reportOpen" @toggle="reportOpen = $event.target.open">
      <summary>Report a portal issue</summary>
      <form @submit.prevent="submit">
        <p>Tell us what you tried and what happened. Your report goes directly to our technology team. You can follow replies in Messages → Support.</p>
        <p class="small">Only you and authorized support staff can view this ticket. Avoid including passwords, full card numbers or unrelated people’s information in screenshots.</p>
        <label>What went wrong?<textarea v-model="question" required minlength="5" maxlength="10000" rows="4" :disabled="busy" placeholder="For example: I tapped Download on my phone and saw an error." /></label>
        <label>Attach screenshots (optional)<input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" multiple :disabled="busy" @change="selectFiles" /></label>
        <p class="small">Up to three PNG, JPG or WebP images, 8 MB each.</p>
        <p v-if="error" role="alert" class="error">{{ error }}</p>
        <p v-if="ticketId" role="status">Thank you. Report #{{ ticketId }} is with our technology team. <button type="button" class="text-button" @click="$emit('navigate','messages')">Open Messages</button></p>
        <button type="submit" :disabled="busy || question.trim().length < 5 || !!fileError">{{ busy ? 'Sending report…' : 'Send report' }}</button>
      </form>
    </details>
  </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import {useRoute} from 'vue-router';
import api from '../../services/api';
const props=defineProps({agencyId:[Number,String],clientId:[Number,String]});
defineEmits(['navigate']);
const route=useRoute();
const learnOpen=ref(route.query.welcome==='learn-more'),reportOpen=ref(false),question=ref(''),files=ref([]),fileInput=ref(null),busy=ref(false),error=ref(''),fileError=ref(''),ticketId=ref(null);
let requestId=null,generation=0;
function selectFiles(event){
  files.value=Array.from(event.target.files||[]);fileError.value='';
  if(files.value.length>3||files.value.some(file=>!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024))fileError.value='Choose up to three PNG, JPG or WebP screenshots, 8 MB each.';
  error.value=fileError.value;
}
async function submit(){
  if(busy.value||fileError.value)return;
  const own=generation;busy.value=true;error.value='';requestId ||= crypto.randomUUID();
  const form=new FormData();for(const [key,value] of Object.entries({agencyId:props.agencyId,clientId:props.clientId,question:question.value,requestId}))form.append(key,String(value));
  for(const file of files.value)form.append('screenshots',file);
  try{const response=await api.post('/guardian-portal/technology-help',form);if(own!==generation)return;ticketId.value=response.data.ticketId;question.value='';files.value=[];if(fileInput.value)fileInput.value.value='';requestId=null;}
  catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Your report could not be sent. Please try again.';}
  finally{if(own===generation)busy.value=false;}
}
watch(()=>[props.agencyId,props.clientId],()=>{generation++;question.value='';files.value=[];error.value='';fileError.value='';ticketId.value=null;busy.value=false;requestId=null;if(fileInput.value)fileInput.value.value='';});
watch(()=>route.query.welcome,value=>{if(value==='learn-more')learnOpen.value=true;});
</script>
<style scoped>
.portal-guide{padding:20px 24px;border:1px solid #d9e5ef;border-radius:14px;background:var(--bg-card,#fff);margin:0 0 24px;line-height:1.6}.guide-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.guide-heading>span,.small{font-size:13px;color:var(--text-secondary,#576b7b)}.beta-badge{font-size:11px;letter-spacing:.05em;background:#e8f1fb;color:#24567d;padding:4px 8px;margin-left:6px;border-radius:12px}.portal-guide summary{cursor:pointer;color:var(--primary,#2467a7);font-weight:600;padding:8px 0}.guide-details{padding:0 8px}.portal-guide h3{font-size:16px;margin-bottom:6px}.portal-guide ul{padding-left:22px}.portal-guide li{margin:8px 0}.report-details{margin-top:8px;border-top:1px solid #e1eaf2;padding-top:8px}.portal-guide label{display:block;font-weight:600;margin:14px 0}.portal-guide textarea{box-sizing:border-box;display:block;width:100%;margin-top:6px;padding:10px;border:1px solid #b9cbdb;border-radius:8px;background:var(--bg-card,#fff);color:inherit;font:inherit}.portal-guide input[type=file]{display:block;width:100%;margin-top:8px;font-weight:400}.portal-guide button{padding:10px 16px;background:#edf5fb;color:#17436f;border:1px solid #bed2e4;border-radius:8px;cursor:pointer}.portal-guide button:disabled{opacity:.6;cursor:default}.portal-guide .text-button{background:none;border:0;text-decoration:underline;padding:0}.error{color:#a02828}@media(max-width:600px){.portal-guide{padding:16px}.guide-heading>span{display:block;width:100%}}
</style>
