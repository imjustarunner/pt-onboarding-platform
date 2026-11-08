<script setup>
import {computed,onMounted,ref} from 'vue';
import axios from 'axios';
import {useRoute,useRouter} from 'vue-router';
import {trackMobileNavigation} from './mobileNavigation.js';
import {FilePenLine,RefreshCw,ChevronRight,Building2} from '@lucide/vue';
import NoteReviewActions from '../components/clinical/NoteReviewActions.vue';
const route=useRoute(),router=useRouter();trackMobileNavigation(router);
const props=defineProps({apiBase:String,sessionToken:String});
const emit=defineEmits(['draft','tasks']);
const items=ref([]),agencies=ref([]),failures=ref([]),loading=ref(false),error=ref(''),clinicalAvailable=ref(true),ready=ref(false);
const tabs=[{id:'all',label:'All'},{id:'todo',label:'To do'},{id:'started',label:'Started'},{id:'cosign',label:'Co-sign'},{id:'signed',label:'Signed'}];
const currentTab=computed(()=>tabs.some(tab=>tab.id===route.query.workTab)?route.query.workTab:'all');
const agencyFilter=computed(()=>String(route.query.workAgency || 'all'));
const agencyItems=computed(()=>items.value.filter(item=>agencyFilter.value==='all'||String(item.agencyId)===agencyFilter.value));
const bucket=item=>item.queueKind==='cosign'||item.status==='awaiting_cosign'?'cosign':item.status==='signed'?'signed':['started','completed','in_progress'].includes(item.status)?'started':'todo';
const counts=computed(()=>Object.fromEntries(tabs.map(tab=>[tab.id,agencyItems.value.filter(item=>tab.id==='all'||bucket(item)===tab.id).length])));
const sortOrder=computed(()=>route.query.workSort==='oldest'?'oldest':'recent');
const visibleItems=computed(()=>agencyItems.value.filter(item=>currentTab.value==='all'||bucket(item)===currentTab.value).sort((a,b)=>{
 const byDate=String(a.date || '').localeCompare(String(b.date || '')) || String(a.scheduledStart || a.timeLabel || '').localeCompare(String(b.scheduledStart || b.timeLabel || ''));
 return (sortOrder.value==='oldest'?byDate:-byDate) || Number(a.agencyId)-Number(b.agencyId);
}));
const activeFailures=computed(()=>failures.value.filter(item=>(agencyFilter.value==='all'||String(item.agencyId)===agencyFilter.value)&&(currentTab.value==='all'||(currentTab.value==='cosign'?item.section==='cosign':item.section==='notes'))));
function changeView(key,value){router.replace({path:route.path,query:{...route.query,[key]:value==='all'?undefined:value}});}
async function load(){
 loading.value=true;error.value='';
 try{
  const {data}=await axios.get(`${props.apiBase}/my-work`,{headers:{'X-Quick-View-Session':props.sessionToken},withCredentials:true});
  items.value=data.items || [];agencies.value=data.agencies || [];failures.value=data.failures || [];clinicalAvailable.value=data.clinicalAvailable!==false;ready.value=true;
 }catch(e){items.value=[];failures.value=[];ready.value=false;error.value=e.response?.status<500?e.response?.data?.error?.message || 'Your work is unavailable for this account.':'Your work could not be loaded. Try again.';}
 finally{loading.value=false;}
}
const agencyLogo=item=>{const value=item.agencyLogoUrl || '';return !value || /^https?:\/\//i.test(value)?value:`${props.apiBase.replace(/\/api\/quick-view$/,'')}/${value.replace(/^\/+/,'')}`;};
const title=item=>item.maskedName || item.clientMaskedName || 'Client documentation';
const dos=item=>String(item.date || item.dateOfService || '').slice(0,10);
function time(item){
 if(item.scheduledStart && item.sourceTimezone){
  const raw=String(item.scheduledStart),instant=new Date(/Z$|[+-]\d\d:\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z');
  try{if(Number.isFinite(instant.getTime()))return new Intl.DateTimeFormat(undefined,{timeZone:item.sourceTimezone,hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(instant);}catch{/* Retain the saved label when a legacy zone cannot be formatted. */}
 }
 return item.timeLabel || '';
}
const status=item=>item.clinicalRevisionId?'Amendment':item.queueKind==='cosign'?'Awaiting co-sign':({not_started:'To do',started:'Started',completed:'Ready to sign',signed:'Signed'}[item.status] || 'To do');
const loadReviewInsights=({noteId,agencyId})=>axios.get(`${props.apiBase}/my-work/notes/${noteId}/review-insights`,{params:{agencyId},headers:{'X-Quick-View-Session':props.sessionToken},withCredentials:true});
onMounted(load);
</script>
<template>
 <section class="mobile-mywork">
  <header><span>All authorized agencies</span><button aria-label="Refresh My Work" :disabled="loading" @click="load"><RefreshCw :size="17"/></button></header>
  <label class="agency-filter">Agency<select aria-label="Filter documentation by agency" :value="agencyFilter" @change="changeView('workAgency',$event.target.value)"><option value="all">All agencies</option><option v-for="agency in agencies" :key="agency.id" :value="String(agency.id)">{{ agency.name }}</option></select></label>
  <label class="agency-filter">Sort<select aria-label="Sort My Work" :value="sortOrder" @change="changeView('workSort',$event.target.value)"><option value="recent">Most recent</option><option value="oldest">Oldest first</option></select></label>
  <nav class="work-tabs" aria-label="Documentation status"><button v-for="tab in tabs" :key="tab.id" :aria-pressed="currentTab===tab.id" @click="changeView('workTab',tab.id)">{{ tab.label }} <span>{{ ready && !failures.some(f=>(agencyFilter==='all'||String(f.agencyId)===agencyFilter)&&(tab.id==='all'||(tab.id==='cosign'?f.section==='cosign':f.section==='notes')))?counts[tab.id]:'—' }}</span></button></nav>
  <p v-if="loading" role="status">Loading your work…</p>
  <p v-if="error" role="alert">{{ error }} <button @click="load">Try again</button></p>
  <div v-if="activeFailures.length" class="work-errors" role="alert"><p v-for="failure in activeFailures" :key="`${failure.agencyId}:${failure.section}`">{{ failure.agencyName }}: {{ failure.message }}</p><button @click="load">Try again</button></div>
  <article v-for="item in visibleItems" :key="`${item.agencyId}:${item.queueKind}:${item.serverId || item.id}`" class="work-row">
   <component :is="item.clinicalRevisionId?'a':'button'" class="work-open" :class="{'qv-workspace-link':item.clinicalRevisionId}" :href="item.clinicalRevisionId?item.desktopReviewUrl:undefined" :target="item.clinicalRevisionId?'_blank':undefined" :rel="item.clinicalRevisionId?'noopener noreferrer':undefined" @click="!item.clinicalRevisionId && emit('draft',item)"><FilePenLine :size="21"/><span class="work-copy"><strong>{{ title(item) }}<template v-if="item.clientAge != null || item.age != null"> · Age {{ item.clientAge ?? item.age }}</template></strong><small>{{ dos(item) }}<template v-if="time(item)"> · {{ time(item) }}</template></small><small v-if="item.serviceCode">{{ item.serviceCode }}<template v-if="item.noteKind"> · {{ item.noteKind }}</template></small><small class="work-agency"><img v-if="item.agencyLogoUrl" :src="agencyLogo(item)" alt=""/><Building2 v-else :size="14"/>{{ item.agencyName || 'Agency' }}<template v-if="item.providerName"> · {{ item.providerName }}</template></small></span><span class="status">{{ status(item) }}</span><ChevronRight :size="17"/></component>
   <p v-if="item.clinicalRevisionId" class="amendment-hint">Review amendment in the full workspace. You may need to sign in there.</p>
   <NoteReviewActions v-if="!item.clinicalRevisionId" :item="item" :load-insights="loadReviewInsights" :access-key="sessionToken" :allow-quick-sign="item.queueKind==='cosign'" @open-note="emit('draft',item)" @quick-sign="emit('draft',{...item,quickSignRequested:true})"/>
  </article>
  <p v-if="!loading && !error && ready && !activeFailures.length && !visibleItems.length">{{ clinicalAvailable?`No ${tabs.find(tab=>tab.id===currentTab).label.toLowerCase()} notes in this view.`:'Clinical documentation is not available for this account.' }}</p>
  <button class="task-link" @click="emit('tasks')">View my tasks <ChevronRight :size="15"/></button>
 </section>
</template>
<style scoped>
.mobile-mywork{background:#fff;padding:18px;color:#1b385d;min-width:0}.mobile-mywork>header{display:flex;align-items:center;justify-content:space-between}.mobile-mywork h2{font-size:19px}.mobile-mywork p{font-size:13px;color:#657d9c;line-height:1.6}.mobile-mywork button,.mobile-mywork select{font:inherit;color:inherit}.mobile-mywork button{cursor:pointer}.mobile-mywork header button{border:0;background:#f1f5fb;border-radius:8px;padding:9px}.agency-filter{display:flex;align-items:center;gap:10px;font-size:12px;margin:12px 0}.agency-filter select{min-width:0;flex:1;border:1px solid #d8e3f6;border-radius:8px;padding:9px;background:white}.work-tabs{display:flex;gap:4px;overflow-x:auto;margin:12px 0}.work-tabs button{white-space:nowrap;border:0;background:#f2f5fa;border-radius:9px;padding:10px 8px;font-size:12px}.work-tabs button[aria-pressed=true]{background:#245be8;color:white}.work-tabs span{font-size:11px;margin-left:2px}.work-row{border-bottom:1px solid #e5ebf5;padding:12px 0}.work-open{display:flex;width:100%;align-items:center;gap:9px;text-align:left;background:white;border:0;padding:5px 0}.work-open{font:inherit;color:inherit;text-decoration:none}.amendment-hint{margin:5px 0 0 30px}.work-open>svg{flex-shrink:0}.work-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}.work-copy strong{font-size:13px;overflow-wrap:anywhere}.work-copy small{font-size:11px;color:#657d9c}.work-agency{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.work-agency img{width:20px;height:20px;object-fit:contain}.status{font-size:10px;background:#edf4ff;color:#2757a4;padding:4px 7px;border-radius:7px}.task-link{display:flex;gap:5px;align-items:center;background:#edf3ff;border:1px solid #d8e3f6;border-radius:9px;padding:10px 14px;margin:14px 0}.mw-quick-sign{background:#eaf6ef;border:1px solid #c2dfcd;border-radius:7px;color:#2b6f47;padding:7px 8px;font-size:11px;margin:5px 0 0 30px}.work-errors{padding:10px;background:#fff5f1;border-radius:8px}.work-errors p{margin:0 0 5px}.mobile-mywork button:focus-visible,.mobile-mywork select:focus-visible{outline:2px solid #245be8;outline-offset:2px}
</style>
