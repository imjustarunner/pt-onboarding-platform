<template>
  <main class="sms-program">
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-else-if="data">
      <header><img v-if="data.logoUrl" :src="data.logoUrl" alt="" referrerpolicy="no-referrer" /><h1>{{ data.brandName }}</h1><p>{{ data.legalName }}</p></header>
      <nav><a :href="data.website">Organization website</a><RouterLink :to="base+'/consent'">Consent example</RouterLink><RouterLink :to="base+'/privacy'">SMS privacy notice</RouterLink><RouterLink :to="base+'/terms'">SMS terms</RouterLink></nav>
      <SmsConsentForm v-if="page==='consent'" v-bind="data.consent" />
      <article v-else><h2>{{ page==='privacy' ? 'SMS privacy notice' : 'SMS terms and conditions' }}</h2><p>Published {{ new Date(data.publishedAt).toLocaleDateString() }}</p><section v-for="section in data[page]" :key="section.title"><h3>{{ section.title }}</h3><p>{{ section.body }}</p></section></article>
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
let request=0;
watch(()=>[route.params.agencyId,route.params.program,route.query.audience],async()=>{const current=++request;data.value=null;error.value='';try{const result=await api.get(`/sms-numbers/programs/${encodeURIComponent(route.params.agencyId)}/${encodeURIComponent(route.params.program)}`,{skipAuthRedirect:true,skipGlobalLoading:true,params:{audience:route.query.audience||undefined}});if(current===request)data.value=result.data;}catch(e){if(current===request)error.value=e.response?.data?.error?.message||'This messaging program is not available.';}},{immediate:true});
</script>
<style scoped>
.sms-program{max-width:900px;margin:auto;padding:32px 20px;color:#172d36}header img{max-height:90px;max-width:260px}nav{display:flex;flex-wrap:wrap;gap:18px;margin:24px 0}article{padding:24px;background:white;border:1px solid #d5e1e5;border-radius:12px}article p{line-height:1.65;overflow-wrap:anywhere}[role=alert]{color:#b91c1c}@media print{nav{display:none}}
</style>
