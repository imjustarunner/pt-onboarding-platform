<template>
 <main class="rehearsal-page">
  <header v-if="!guest"><PlotlineSignature context="ITSCO · Rehearsal workspace"/><h1>Try the experience. Start anywhere.</h1><p>Real ITSCO source documents and configured job packets, with fictional applicants and clients. Nothing entered here creates an applicant, client record, email, payroll entry, or real signature transaction.</p><nav><button @click="choose('prehire')" :aria-pressed="mode==='prehire'">Prehire</button><button @click="choose('onboarding')" :aria-pressed="mode==='onboarding'">Onboarding</button><button @click="choose('clinical')" :aria-pressed="mode==='clinical'">Clinical forms</button></nav><p>Use sample information only. Rehearsal progress stays in this page’s memory; refreshing resets it.</p><button @click="createLink" :disabled="linkBusy">{{ linkBusy ? 'Preparing link…' : 'Copy private incognito test link' }}</button><p v-if="shareLink" role="status">{{ linkNotice }} Valid for 24 hours. Paste this link into an incognito window.</p><input v-if="shareLink" :value="shareLink" readonly aria-label="Private incognito test link" @focus="$event.target.select()" /></header>
  <p v-if="error" role="alert">{{error}} <button @click="load">Try again</button></p><p v-else-if="!bundle">Loading ITSCO examples…</p>
  <template v-else><ClinicalRehearsal v-if="mode==='clinical'" :bundle="bundle"/><HireRehearsal v-else :candidate-view="guest" :key="`${bundle.agency.id}:${mode}`" :bundle="bundle" :entry="mode" :i9-url="i9Url"/></template>
 </main>
</template>
<script setup>
import {ref,computed,watch,onBeforeUnmount,inject} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useAgencyStore} from '../../store/agency';
import liveApi from '../../services/api';
const api=inject('rehearsalSourceHttp',liveApi);
const props=defineProps({guest:Boolean});
const shareLink=ref(''),linkBusy=ref(false),linkNotice=ref('');
async function createLink(){linkBusy.value=true;try{const {data}=await api.post('/hiring/rehearsal/link',{agencyId:agencyId.value});shareLink.value=`${window.location.origin}/itsco/hiring-test?mode=${mode.value==='onboarding'?'onboarding':'prehire'}#access=${encodeURIComponent(data.token)}`;try{await navigator.clipboard.writeText(shareLink.value);linkNotice.value='Link copied.';}catch{linkNotice.value='Select and copy the link below.';}}catch(e){error.value=e.response?.data?.error?.message||'Could not create the private test link.';}finally{linkBusy.value=false;}}
import PlotlineSignature from '../../components/plotline/PlotlineSignature.vue';
import HireRehearsal from '../../components/rehearsal/HireRehearsal.vue';
import ClinicalRehearsal from '../../components/rehearsal/ClinicalRehearsal.vue';
const route=useRoute(),router=useRouter(),store=useAgencyStore();
const bundle=ref(null),error=ref(''),i9Url=ref('');let generation=0;
const mode=computed(()=>['onboarding','clinical'].includes(route.query.mode)?route.query.mode:'prehire');
const agencyId=computed(()=>props.guest?0:Number([store.currentAgency,...(store.userAgencies||[])].find(a=>a?.slug==='itsco')?.id||0));
function choose(mode){router.replace({query:{...route.query,mode}});}
async function load(){const g=++generation;bundle.value=null;error.value='';if(i9Url.value)URL.revokeObjectURL(i9Url.value);i9Url.value='';if(!props.guest&&!agencyId.value){error.value='Select ITSCO as your organization to load its rehearsal.';return;}try{const [b,pdf]=await Promise.all([api.get('/hiring/rehearsal',{params:{agencyId:agencyId.value}}),api.get('/hiring/rehearsal/i9',{params:{agencyId:agencyId.value},responseType:'blob'})]);if(g!==generation)return;bundle.value=b.data;i9Url.value=URL.createObjectURL(pdf.data);}catch(e){if(g===generation)error.value=e.response?.data?.error?.message||'The rehearsal could not be loaded.';}}
watch(agencyId,load,{immediate:true});onBeforeUnmount(()=>{generation++;if(i9Url.value)URL.revokeObjectURL(i9Url.value);bundle.value=null;});
</script>
<style scoped>.rehearsal-page{width:100%;max-width:none;box-sizing:border-box;margin:0;padding:16px;color:#203b32}.rehearsal-page>header>input{width:100%;box-sizing:border-box;padding:12px;font:inherit}.rehearsal-page>header{font-family:Montserrat,sans-serif;padding:24px;background:#edf4ef;border:1px solid #cbdcd1;border-radius:16px;margin-bottom:24px}h1{font-size:clamp(25px,4vw,38px)}p{line-height:1.8}nav{display:flex;gap:12px;flex-wrap:wrap}button{font:inherit;padding:12px 18px;border:1px solid #709883;border-radius:8px;background:white;color:#184f3b;cursor:pointer}[aria-pressed=true]{background:#184f3b;color:white}[role=alert]{color:#913322}@media(max-width:600px){.rehearsal-page{padding:8px}.rehearsal-page>header{padding:18px}}</style>
