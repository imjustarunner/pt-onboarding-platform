<template>
  <main class="sms-program">
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-else-if="data">
      <header>
        <a class="wordmark" :href="data.website"><img v-if="data.logoUrl" :src="data.logoUrl" alt="" referrerpolicy="no-referrer" />{{ data.brandName }}</a>
        <nav aria-label="Organization policies"><a v-if="data.organizationTermsUrl" :href="data.organizationTermsUrl">Main Terms of Use</a><a v-if="data.organizationPrivacyUrl" :href="data.organizationPrivacyUrl">Privacy Policy</a><a v-if="data.messagingGuideUrl" :href="data.messagingGuideUrl">How messaging works</a><a :href="data.website">Website</a></nav>
        <p class="eyebrow">{{ data.legalName }} · {{ data.programName }}</p>
        <h1>{{ page==='consent' ? 'Text messaging choices' : page==='privacy' ? 'SMS privacy details' : 'SMS program addendum' }}</h1>
        <p v-if="page==='terms'" class="intro">This addendum forms part of <a :href="data.organizationTermsUrl || data.website">{{ data.brandName }}’s main Terms of Use</a>. It explains this SMS program; your other terms remain in effect.</p>
        <p v-else-if="page==='privacy'" class="intro">These details supplement <a :href="data.organizationPrivacyUrl || data.website">{{ data.brandName }}’s Privacy Policy</a> and explain how this SMS program handles your information.</p>
        <p class="date">Published {{ new Date(data.publishedAt).toLocaleDateString() }}</p>
        <button class="print-button" type="button" @click="printPage">Print or save as PDF</button>
      </header>
      <nav class="program-nav" aria-label="SMS program"><RouterLink :to="base+'/consent'" :aria-current="page==='consent'?'page':undefined">Consent example</RouterLink><RouterLink :to="base+'/terms'" :aria-current="page==='terms'?'page':undefined">SMS addendum</RouterLink><RouterLink :to="base+'/privacy'" :aria-current="page==='privacy'?'page':undefined">SMS privacy details</RouterLink></nav>
      <SmsConsentForm v-if="page==='consent'" v-bind="data.consent" />
      <article v-else><p v-if="page==='terms' && data.messagingGuideUrl" class="routing-link">Who receives your messages, what happens after hours, and how to get support: <a :href="data.messagingGuideUrl">Read how messaging works at {{ data.brandName }}</a>.</p><section v-for="section in data[page]" :key="section.title"><h2>{{ section.title }}</h2><p>{{ section.body }}</p></section></article>
      <footer>{{ data.legalName }} · <a :href="data.organizationTermsUrl || data.website">Main Terms of Use</a> · <a :href="data.organizationPrivacyUrl || data.website">Privacy Policy</a></footer>
    </template>
    <p v-else>Loading messaging program…</p>
  </main>
</template>
<script setup>
import { computed,ref,watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import SmsConsentForm from '../../components/communications/SmsConsentForm.vue';
const route=useRoute(),data=ref(null),error=ref('');
const page=computed(()=>route.params.page),base=computed(()=>`/sms-programs/${route.params.agencyId}/${route.params.program}`);
const printPage=()=>window.print();
let request=0;
watch(()=>[route.params.agencyId,route.params.program,route.query.audience],async()=>{const current=++request;data.value=null;error.value='';try{const result=await api.get(`/sms-numbers/programs/${encodeURIComponent(route.params.agencyId)}/${encodeURIComponent(route.params.program)}`,{skipAuthRedirect:true,skipGlobalLoading:true,params:{audience:route.query.audience||undefined}});if(current===request)data.value=result.data;}catch(e){if(current===request)error.value=e.response?.status===401?'This public page is being updated. Please refresh in a moment.':e.response?.data?.error?.message||'This messaging program is not available.';}},{immediate:true});
</script>
<style scoped>
.sms-program{background:#fffdf7;color:#243e3c;min-height:100vh;padding:32px max(24px,calc((100% - 880px)/2));font-family:'Avenir Next',system-ui,sans-serif;line-height:1.75;overflow-wrap:anywhere}.wordmark{font-size:28px;font-weight:750;text-decoration:none}.wordmark img{display:block;width:auto;max-width:230px;height:68px;object-fit:contain;margin-bottom:16px}nav{display:flex;flex-wrap:wrap;gap:12px 24px;padding:20px 0}a{color:#285e51;text-underline-offset:4px}a[aria-current=page]{font-weight:750}.eyebrow{margin-top:28px;font-size:13px}h1{font-family:Georgia,serif;font-weight:500;font-size:clamp(30px,5vw,46px);line-height:1.2;margin:12px 0}.date{font-size:13px;color:#526660}.intro{font-size:18px}.print-button{border:1px solid #285e51;border-radius:6px;padding:12px 18px;background:#285e51;color:white;font:inherit;cursor:pointer}.program-nav{border-block:1px solid #d3ded5;margin-top:28px}section{padding-top:24px}h2{font-size:22px;line-height:1.4}footer{border-top:1px solid #d3ded5;margin-top:40px;padding:24px 0}[role=alert]{color:#b91c1c}:is(a,button):focus-visible{outline:3px solid #2867d7;outline-offset:4px}@media print{.sms-program{padding:0;background:white;color:black;font-size:11pt}nav,.print-button,.eyebrow,footer{display:none}h1{font-size:25pt}h2{font-size:15pt;break-after:avoid}p{orphans:3;widows:3}}
</style>
