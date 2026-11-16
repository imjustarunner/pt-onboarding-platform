<template>
<section class="progress-records">
 <header><h2>{{ ft(kind==='checkins'?'{name}’s check-ins & trends':'{name}’s evaluations',{name:clientName}) }}</h2><button @click="load">{{ ft("Refresh") }}</button></header>
 <p v-if="loading" role="status">{{ ft("Loading…") }}</p><p v-if="error" role="alert">{{error}}</p>
 <template v-if="kind==='checkins'">
  <p>{{ ft("Completed kiosk feedback appears after it is connected to the correct client and appointment.") }}</p>
  <article v-for="trend in trends" :key="trend.key"><h3>{{trend.providerName}} · {{ ft(trend.serviceType==='tutoring'?'Learning':'Care') }}</h3>
   <div class="metrics"><div v-for="metric in ['connection','progress']" :key="metric"><strong>{{ ft(metric==='connection'?'Connection':'Progress') }} · {{ ft(trend.metrics[metric].current??'Not rated') }}<span v-if="trend.metrics[metric].current!=null"> / 10</span></strong><meter v-if="trend.metrics[metric].current!=null" min="0" max="10" :value="trend.metrics[metric].current" :aria-label="metric"/><small>{{ ft("Six-week average:") }} {{ ft(trend.metrics[metric].sixWeekAverage??'Not enough responses') }}</small><small v-if="trend.metrics[metric].change!=null">{{ ft("Change over six weeks:") }} {{trend.metrics[metric].change>0?'+':''}}{{trend.metrics[metric].change}}</small></div></div>
  </article>
  <article v-if="visits.length"><h3>{{ ft("Visit history") }}</h3><table><thead><tr><th>{{ ft("Visit") }}</th><th>{{ ft("Connection") }}</th><th>{{ ft("Progress") }}</th></tr></thead><tbody><tr v-for="v in visits" :key="v.id"><th scope="row">{{when(v.scheduledStartAt,v.timezone)}}<small>{{v.providerName}}</small></th><td>{{v.score.connection??'—'}}</td><td>{{v.score.progress??'—'}}</td></tr></tbody></table><p class="hint">{{ ft("Scores are feedback on a 0–10 scale, not a diagnosis or a validated clinical assessment. Missing answers are not scored as zero. Trends are kept separate by provider and type of service.") }}</p></article>
  <p v-if="!loading&&!error&&!visits.length">{{ ft("No completed check-ins have been connected and made available to this profile yet.") }}</p><p v-if="!loading&&!error&&!visits.length"><button type="button" @click="$emit('help')">{{ ft("Ask your team about check-ins") }}</button></p>
 </template>
 <template v-else>
  <p>{{ ft(learning ? "Evaluation results and academic reports shared by your learning team." : "Evaluation results shared by your care team.") }}</p>
  <article v-for="d in documents" :key="d.id"><h3>{{d.title}}</h3><small>{{ ft("Shared") }} {{when(d.sharedAt)}}</small><p class="summary">{{ ft(d.plainSummary||'Open the report to review the results.') }}</p><button :disabled="downloading" @click="download(d)">{{ ft("Download report (PDF)") }}</button></article>
  <article v-for="r in academicReports" :key="`academic-${r.id}`"><h3>{{r.title}}</h3><small>{{r.subjectLabel}} {{ ft("· Published") }} {{when(r.publishedAt)}}</small><div class="academic-report" v-html="safeReport(r.contentHtml)"/></article>
  <p v-if="!loading&&!error&&!documents.length&&!academicReports.length">{{ ft("No evaluation reports have been shared yet.") }}</p><p v-if="!loading&&!error&&!documents.length&&!academicReports.length"><button type="button" @click="$emit('help')">{{ ft("Ask your team about reports") }}</button></p>
 </template>
</section>
</template>
<script setup>
import {useFamilyLocale} from '../../composables/useFamilyLocale';
const {ft}=useFamilyLocale();
defineEmits(['help']);
import DOMPurify from 'dompurify';
import {ref,watch,onBeforeUnmount} from 'vue';import {usePortalCareApi} from '../../composables/usePortalCareApi';
const api=usePortalCareApi();
const props=defineProps({clientId:[Number,String],clientName:{type:String,default:'Client'},kind:{type:String,default:'checkins'},learning:Boolean});
const academicReports=ref([]);const safeReport=html=>DOMPurify.sanitize(String(html||''),{USE_PROFILES:{html:true},FORBID_TAGS:['img','video','audio','iframe','style'],FORBID_ATTR:['style']});
const loading=ref(false),error=ref(''),visits=ref([]),trends=ref([]),documents=ref([]),downloading=ref(false);let seq=0;
const when=(v,tz='America/Denver')=>v?new Date(v).toLocaleDateString(undefined,{timeZone:tz||'America/Denver',month:'short',day:'numeric',year:'numeric'}):'';
async function load(){const own=++seq;error.value='';visits.value=[];trends.value=[];documents.value=[];academicReports.value=[];if(!props.clientId)return;loading.value=true;try{const {data}=await api.get(props.kind==='checkins'?`/guardian-portal/clients/${props.clientId}/checkins`:`/assessment-deliverables/clients/${props.clientId}/shared`);if(own!==seq)return;visits.value=data.visits||[];trends.value=data.trends||[];documents.value=data.deliverables||[];if(props.kind==='evaluations'&&props.learning){const r=await api.get(`/tutoring-learning-os/clients/${props.clientId}/guardian-dashboard`);if(own===seq)academicReports.value=r.data.publishedReports||[];}}catch(e){if(own===seq)error.value=e.response?.status===403?'These records are not currently shared with your account. Contact the care team to review access.':'These records could not be loaded. Please try again.';}finally{if(own===seq)loading.value=false;}}
async function download(d){const own=seq;downloading.value=true;error.value='';try{const{data}=await api.post(`/assessment-deliverables/${d.id}/export`,{format:'pdf'},{responseType:'blob'});if(own!==seq)return;const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=`${d.title.replace(/[^a-z0-9 -]/gi,'')}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{if(own===seq)error.value='The report could not be downloaded.';}finally{downloading.value=false;}}
watch(()=>[props.clientId,props.kind],load,{immediate:true});onBeforeUnmount(()=>{seq++;});
</script>
<style scoped>.progress-records{display:grid;gap:18px;color:#173451}.progress-records header{display:flex;gap:16px;align-items:center;justify-content:space-between}.progress-records article{padding:20px;border:1px solid #d7e3ef;border-radius:14px;background:#fff}.progress-records p{line-height:1.6}.progress-records h3{margin-top:0}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:20px}.metrics>div{display:grid;gap:8px}meter{width:100%}.progress-records small{display:block;color:#536b84}.progress-records table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}.progress-records td,.progress-records th{padding:10px 4px;border-bottom:1px solid #d7e3ef}.hint{font-size:13px;color:#536b84}.summary{white-space:pre-line;max-height:350px;overflow:auto}.progress-records button{font:inherit;border:1px solid #bbcede;background:white;color:#16457c;padding:10px 14px;border-radius:8px;cursor:pointer}[role=alert]{color:#a12727}@media(max-width:500px){.metrics{grid-template-columns:1fr}}</style>
