<template>
  <main class="packet-preview">
    <PlotlineSignature context="Prehire & onboarding" />
    <header><p class="eyebrow">Hiring preview</p><h1>See the real packet.</h1><p>Choose a real job posting and its pay level. Review your agency’s reference release, job description and configured employment agreement with Alex Demo as the fictional applicant.</p><p class="notice">Preview only. No applicant record, signature, reference request, email or payroll entry is created.</p></header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading">Loading your agency’s hiring documents…</p>
    <form v-if="options" @submit.prevent="prepare">
      <label>Job posting<select aria-label="Job posting" v-model="jobId" required @change="chooseJob"><option value="">Select a job</option><option v-for="j in options.jobs" :key="j.id" :value="String(j.id)">{{ j.title }}</option></select></label>
      <label>Contract configuration<select aria-label="Contract configuration" v-model="configId" required><option value="">Select a contract</option><option v-for="c in options.configs" :key="c.id" :value="String(c.id)">{{ c.name }} · {{ c.payMode }}</option></select></label>
      <label>Pay category and level<select aria-label="Pay category and level" v-model="payKey" required><option value="">Select configured compensation</option><option v-for="l in options.levels" :key="`${l.category}:${l.level}`" :value="`${l.category}:${l.level}`">Category {{ l.category }} · Level {{ l.level }}{{ l.label ? ` · ${l.label}` : '' }}</option></select></label>
      <button :disabled="busy || !jobId || !configId || !payKey">{{ busy ? 'Preparing…' : 'Preview this packet' }}</button>
    </form>
    <p v-if="job && !job.defaultConfigId" class="notice">This posting has no default contract linked. Select the appropriate configuration for this preview. This does not change the posting’s saved settings.</p>
    <section v-if="packet">
      <h2>{{ packet.title }}</h2><p>Alex Demo · Category {{ packet.category }} · Level {{ packet.level }} · {{ packet.configName }}</p>
      <nav aria-label="Packet documents"><button v-for="t in tabs" :key="t.key" :aria-pressed="tab===t.key" @click="tab=t.key">{{ t.label }}</button></nav>
      <section v-if="tab==='job'" class="job-description"><h2>{{ packet.title }}</h2><p>{{ packet.description || 'This posting uses an attached document. Open it below.' }}</p><button v-if="packet.hasFile" @click="openJobFile">View attached job description</button><iframe v-if="jobFileUrl" :src="jobFileUrl" title="Job description attachment" /></section>
      <section v-else-if="tab==='contract'"><p v-if="packet.contractError" role="alert">{{ packet.contractError }}</p><p v-if="packet.unresolvedTokens.length" class="notice">Fields to complete for a real hire: {{ packet.unresolvedTokens.join(', ') }}. These remain visible so you can review the setup.</p><iframe v-if="packet.html" :srcdoc="packet.html" sandbox="" title="Employment agreement preview" /></section>
      <iframe v-else :src="referenceUrl" title="Reference release preview" />
    </section>
    <footer><router-link :to="`${prefix}/workplace-handbook`">Review the workplace handbook</router-link><router-link :to="`${prefix}/admin/hiring`">Back to hiring</router-link></footer>
  </main>
</template>
<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import {useRoute} from 'vue-router';
import {useAgencyStore} from '../../store/agency';
import api from '../../services/api';
import PlotlineSignature from '../../components/plotline/PlotlineSignature.vue';
const props=defineProps({agencyIdOverride:[Number,String]});
const emit=defineEmits(['ready']);
const route=useRoute(),agencyStore=useAgencyStore();
const agencyId=computed(()=>Number(props.agencyIdOverride || route.query.agencyId || agencyStore.currentAgency?.id || 0));
const prefix=computed(()=>route.params.organizationSlug?`/${encodeURIComponent(route.params.organizationSlug)}`:'');
const options=ref(null),jobId=ref(''),configId=ref(''),payKey=ref(''),error=ref(''),loading=ref(false),busy=ref(false),packet=ref(null),referenceUrl=ref(''),jobFileUrl=ref(''),tab=ref('reference');
const tabs=[{key:'reference',label:'Reference release'},{key:'job',label:'Job description'},{key:'contract',label:'Employment agreement'}];
const job=computed(()=>options.value?.jobs.find(j=>String(j.id)===jobId.value));
let generation=0, optionsGeneration=0;
function clearFiles(){for(const r of [referenceUrl,jobFileUrl]){if(r.value)URL.revokeObjectURL(r.value);r.value='';}}
function chooseJob(){configId.value=job.value?.defaultConfigId?String(job.value.defaultConfigId):'';const suggestion=job.value?.suggested;const match=options.value?.levels.find(l=>Number(l.category)===Number(suggestion?.compensationCategory)&&Number(l.level)===Number(suggestion?.compensationLevel));payKey.value=match?`${match.category}:${match.level}`:'';packet.value=null;clearFiles();}
async function load(){const id=++optionsGeneration;++generation;busy.value=false;loading.value=false;clearFiles();options.value=null;packet.value=null;jobId.value='';configId.value='';payKey.value='';error.value='';if(!agencyId.value){error.value='Select an agency in the app to preview its hiring packet.';return;}loading.value=true;try{const {data}=await api.get('/hiring/packet-preview/options',{params:{agencyId:agencyId.value}});if(id===optionsGeneration)options.value=data;}catch(e){if(id===optionsGeneration)error.value=e.response?.data?.error?.message||'Could not load the hiring documents.';}finally{if(id===optionsGeneration)loading.value=false;}}
async function prepare(){const id=++generation;busy.value=true;error.value='';packet.value=null;clearFiles();const chosen={...job.value},[category,level]=payKey.value.split(':').map(Number),config=configId.value;try{const [contractResult,referenceResult]=await Promise.allSettled([api.post('/hiring/packet-preview/contract',{agencyId:agencyId.value,jobId:chosen.id,configId:config,category,level}),api.get('/hiring/packet-preview/reference',{params:{agencyId:agencyId.value,jobId:chosen.id},responseType:'blob'})]);if(id!==generation)return;if(referenceResult.status==='fulfilled')referenceUrl.value=URL.createObjectURL(referenceResult.value.data);else error.value='The reference release could not be loaded.';const contract=contractResult.status==='fulfilled'?contractResult.value.data:{html:'',unresolvedTokens:[],category,level,contractError:contractResult.reason.response?.data?.error?.message||'The agreement could not be prepared.'};packet.value={...chosen,...contract,configName:options.value.configs.find(c=>String(c.id)===config)?.name};tab.value='reference';emit('ready',packet.value);}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Could not prepare this packet. Check its contract and compensation setup.';}finally{if(id===generation)busy.value=false;}}
async function openJobFile(){try{const id=packet.value.id;const {data}=await api.get(`/hiring/job-descriptions/${id}/view`,{params:{agencyId:agencyId.value},responseType:'blob'});if(packet.value?.id!==id)return;if(jobFileUrl.value)URL.revokeObjectURL(jobFileUrl.value);jobFileUrl.value=URL.createObjectURL(data);}catch(e){error.value='Could not load the attached job description.';}}
watch(agencyId,load,{immediate:true});watch([jobId,configId,payKey],()=>{++generation;busy.value=false;packet.value=null;clearFiles();});onBeforeUnmount(()=>{++generation;++optionsGeneration;clearFiles();});
</script>
<style scoped>
.packet-preview{max-width:1440px;margin:auto;padding:24px;font-family:Montserrat,Arial,sans-serif;color:#193d32}.eyebrow{text-transform:uppercase;letter-spacing:.15em;font-size:12px}h1{font-size:36px}header>p{line-height:1.8;max-width:950px}.notice{padding:14px 18px;background:#f4f0e2;border-radius:8px;font-size:13px;line-height:1.7}form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin:28px 0}label{display:grid;gap:8px;font-size:13px}select,button{font:inherit;padding:12px;border:1px solid #b6c9bf;border-radius:8px;background:white;color:#193d32}button{cursor:pointer}button:disabled{opacity:.5}form>button{background:#193d32;color:white}nav{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}nav [aria-pressed=true]{background:#193d32;color:white}iframe{width:100%;height:85vh;border:1px solid #d2ded7;background:white;border-radius:10px}.job-description>p{white-space:pre-wrap;line-height:1.85}footer{display:flex;gap:24px;margin:28px 0}a{color:inherit}[role=alert]{color:#8a2f27;padding:16px;background:#ffefeb}@media(max-width:800px){form{grid-template-columns:1fr}.packet-preview{padding:15px}}
</style>
