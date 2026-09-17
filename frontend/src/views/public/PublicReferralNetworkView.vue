<template>
 <main class="referral-network">
  <header><router-link :to="`/p/${slug}`">← Back to website</router-link><h1>Referral Network</h1><p>Explore organizations, services, and community resources from our shared referral directory.</p></header>
  <label>Search organizations<input v-model="search" type="search" placeholder="Name, service, or specialty" /></label>
  <p v-if="loading" role="status">Loading organizations…</p>
  <div v-else-if="error" role="alert"><p>We couldn’t load the directory.</p><button @click="load">Try again</button></div>
  <template v-else><p>{{filtered.length}} organizations</p><div class="companies"><article v-for="company in filtered" :key="company.id"><img v-if="safe(company.logoUrl)" :src="safe(company.logoUrl)" :alt="`${company.name} logo`" loading="lazy"/><h2>{{company.name}}</h2><p v-if="company.category">{{company.category}}</p><p v-if="company.specialties">{{company.specialties}}</p><p v-if="company.insurance">Insurance: {{company.insurance}}</p><a v-if="external(company.url)" :href="external(company.url)" target="_blank" rel="noopener noreferrer">Visit website ↗</a><p v-else-if="company.comingSoon">Coming soon</p></article></div><p v-if="!filtered.length">No matching organizations. Try another search.</p></template>
 </main>
</template>
<script setup>
import {computed,ref,onMounted} from 'vue';
import api from '../../services/api';
import {publicWebsiteUrl as safe} from '../../composables/useStandalonePublicWebsite';
defineProps({slug:{type:String,required:true}});
const companies=ref([]),search=ref(''),loading=ref(true),error=ref(false);
const filtered=computed(()=>companies.value.filter(c=>`${c.name} ${c.category||''} ${c.specialties||''}`.toLowerCase().includes(search.value.trim().toLowerCase())));
const external=value=>{const url=safe(value);return /^https?:\/\//i.test(url)?url:'';};
async function load(){loading.value=true;error.value=false;try{const{data}=await api.get('/public/marketing-pages/referral-network',{skipAuthRedirect:true,skipGlobalLoading:true});companies.value=data.companies||[];}catch{error.value=true;}finally{loading.value=false;}}
onMounted(load);
</script>
<style scoped>
.referral-network{max-width:1200px;margin:auto;padding:36px 22px 120px;background:#fff;color:#183c44;min-height:80vh}.referral-network h1{font-size:clamp(30px,5vw,52px);color:#183c44}.referral-network h2{font-size:23px;color:#183c44}.referral-network p{line-height:1.6}.referral-network a{color:#12645b;text-decoration:underline}.referral-network label{display:grid;gap:8px;max-width:580px}.referral-network input{padding:14px;border:1px solid #9aafb0;border-radius:8px;font:inherit}.companies{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.companies article{border:1px solid #d6e2e1;border-radius:14px;padding:24px;overflow-wrap:anywhere}.companies img{width:100%;height:95px;object-fit:contain;object-position:left}.referral-network button{padding:12px;font:inherit}@media(max-width:900px){.companies{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:550px){.companies{grid-template-columns:1fr}}
</style>
