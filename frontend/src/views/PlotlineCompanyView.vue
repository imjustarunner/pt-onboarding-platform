<template>
 <PlotlineCompanyFrame :brand="company?.brand" context="Your company workspace">
  <template #product-action><router-link to="/plotline/app">Switch workspace</router-link></template>
  <main class="pl-company-home">
   <p v-if="loading" role="status">Opening your company…</p><p v-if="error" class="pl-alert error" role="alert">{{error}}</p>
   <template v-if="company"><p class="pl-eyebrow">Start small. Keep growing.</p><h1 class="pl-company-title">Welcome to {{company.name}}.</h1><p>This is your people operations workspace. Choose one next step; everything else can wait.</p>
    <p class="pl-alert">{{company.trial.canWrite?`${company.trial.daysRemaining} days left in your trial`:'Your trial has ended · Read-only'}} · Ends {{trialEnd}}. No card required. No automatic charge.</p>
    <div class="pl-home-grid"><article v-for="step in steps" :key="step.title" class="pl-company-card"><p class="pl-eyebrow">{{step.label}}</p><h2>{{step.title}}</h2><p>{{step.description}}</p><router-link class="pl-company-action" :to="step.to">{{step.action}}</router-link></article></div>
    <section v-if="company.isOwner" class="pl-company-card pl-publication"><h2>Your public front door</h2><p>{{company.careersPublished?'Your careers page is published.':'Your careers page is private. Review your company copy and jobs before publishing.'}}</p><a v-if="company.careersPublished" :href="`https://plotlinepo.com/${company.slug}`" target="_blank" rel="noopener noreferrer">Open your careers page ↗</a><label class="pl-check"><input v-model="publicationReviewed" type="checkbox"><span>I reviewed the company copy and job postings.</span></label><button :disabled="busy||!publicationReviewed||!company.trial.canWrite" @click="setPublication">{{company.careersPublished?'Unpublish careers page':'Publish careers page'}}</button></section>
    <details v-if="company.isOwner" class="pl-company-card"><summary>Company activity</summary><button :disabled="busy" @click="loadAudit">Load recent activity</button><ul><li v-for="event in events" :key="event.id">{{event.action}} · Actor {{event.actorUserId}} · {{event.createdAt}} <span v-if="event.metadata?.automationActor">· QA automation</span></li></ul></details>
    <div class="pl-actions"><button v-if="company.isOwner" :disabled="busy||company.trial.continuationRequested" @click="requestContinuation">{{company.trial.continuationRequested?'Continuation requested':'Ask about continuing after the trial'}}</button><router-link to="/plotline/start">Get setup help</router-link><router-link to="/plotline/app">Your companies</router-link></div><p v-if="message" class="pl-alert" role="status">{{message}}</p>
   </template>
  </main>
 </PlotlineCompanyFrame>
</template>
<script setup>
import {computed,onMounted,ref,watch} from 'vue';
import {useRoute} from 'vue-router';
import {useAgencyStore} from '../store/agency';
import api from '../services/api';
import PlotlineCompanyFrame from '../components/plotline/PlotlineCompanyFrame.vue';
const route=useRoute(),agencies=useAgencyStore(),company=ref(null),loading=ref(false),busy=ref(false),error=ref(''),message=ref(''),publicationReviewed=ref(false),events=ref([]);
const config={headers:{'X-Plotline-Request':'1'},skipGlobalLoading:true,skipAuthRedirect:true};
const base=computed(()=>`/plotline/companies/${route.params.agencyId}`);
const trialEnd=computed(()=>new Intl.DateTimeFormat('en',{timeZone:company.value.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(company.value.trial.trialEndsAt))+` (${company.value.timezone})`);
const steps=computed(()=>{const c=company.value,p=`/${c.slug}`;return [
 {label:'Make it yours',title:'Bring your brand along',description:'Choose colors and a style. Add your logo and mission whenever you’re ready.',action:'Edit branding',to:`/plotline/brand/${c.agencyId}`},
 {label:'Find your people',title:'Create your first job',description:'Start with one role. Review its description and application before publishing.',action:'Create a job',to:`${p}/admin/careers/jobs`},
 {label:'See the journey',title:'Your hiring workspace',description:'Welcome applicants, plan interviews and keep the next step clear.',action:'Open hiring',to:`${p}/admin/hiring`},
 {label:'Prepare a welcome',title:'Set up onboarding',description:'Build a small, useful first set of documents and training for your new hires.',action:'Open onboarding',to:`${p}/admin/onboarding`}
 ];});
async function load(){loading.value=true;error.value='';company.value=null;events.value=[];try{company.value=(await api.get(base.value,config)).data;const {data}=await api.get('/users/me/agencies',config);agencies.applyLoginAgencies(data);const selected=data.find(a=>Number(a.id)===Number(company.value.agencyId));if(selected)agencies.setCurrentAgency({...selected,theme_settings:{plotlineBrand:company.value.brand}});}catch(e){error.value=e.response?.data?.error?.message||'We couldn’t open that company. Please refresh to retry.';}finally{loading.value=false;}}
async function run(fn){if(busy.value)return;busy.value=true;error.value='';try{await fn();}catch(e){error.value=e.response?.data?.error?.message||'We couldn’t save that change. Please retry.';}finally{busy.value=false;}}
const setPublication=()=>run(async()=>{const {data}=await api.post(`${base.value}/publication`,{published:!company.value.careersPublished,reviewed:publicationReviewed.value},config);company.value.careersPublished=data.published;publicationReviewed.value=false;});
const requestContinuation=()=>run(async()=>{company.value=(await api.post(`${base.value}/continuation`,{},config)).data;message.value='Your request is saved. Contact Plotline through setup help to discuss the next step. No charge was made.';});
const loadAudit=()=>run(async()=>{events.value=(await api.get(`${base.value}/audit`,config)).data.events;});
watch(()=>route.params.agencyId,load);onMounted(load);
</script>
<style scoped>
.pl-company-home{max-width:1120px;margin:auto;padding:36px 24px;min-height:80vh}.pl-home-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin:28px 0}.pl-home-grid h2{font-size:24px}.pl-publication,details{margin:22px 0}summary{cursor:pointer;font-weight:600}li{overflow-wrap:anywhere;font-size:13px;margin-top:12px}@media(max-width:650px){.pl-home-grid{grid-template-columns:1fr}.pl-company-home{padding:24px 16px}}
</style>
