<script setup>
import {computed,onMounted,onBeforeUnmount,watch,ref} from 'vue';
import axios from 'axios';
import {useRoute,useRouter} from 'vue-router';
import {trackMobileNavigation} from './mobileNavigation.js';
import {FilePenLine,RefreshCw,ChevronRight,Building2,SlidersHorizontal} from '@lucide/vue';
import {readMobileViewPreference,writeMobileViewPreference} from './mobileViewPreferences.js';
import NoteReviewActions from '../components/clinical/NoteReviewActions.vue';
const route=useRoute(),router=useRouter();trackMobileNavigation(router);
const props=defineProps({apiBase:String,sessionToken:String,visible:{type:Boolean,default:true},userId:[Number,String]});
const emit=defineEmits(['draft','tasks','counts','controls-change']);
const controlsOpen=ref(!readMobileViewPreference(props.userId,'mywork','compact',false));
let scrollStart=0;
function setControls(open){controlsOpen.value=open;writeMobileViewPreference(props.userId,'mywork','compact',!open);emit('controls-change',open);scrollStart=window.scrollY;}
function onWorkScroll(){if(props.visible && controlsOpen.value && window.scrollY>scrollStart+35)setControls(false);}
watch(()=>props.visible,value=>{if(value){scrollStart=window.scrollY;emit('controls-change',controlsOpen.value);}});
onMounted(()=>{scrollStart=window.scrollY;window.addEventListener('scroll',onWorkScroll,{passive:true});emit('controls-change',controlsOpen.value);});
onBeforeUnmount(()=>window.removeEventListener('scroll',onWorkScroll));
const items=ref([]),agencies=ref([]),failures=ref([]),loading=ref(false),error=ref(''),clinicalAvailable=ref(true),ready=ref(false);
const tabs=[{id:'todo',label:'To Do'},{id:'unstarted',label:'Not started'},{id:'started',label:'Started'},{id:'cosign',label:'Co-sign'},{id:'signed',label:'Signed'}];
const currentTab=computed(()=>tabs.some(tab=>tab.id===route.query.workTab)?route.query.workTab:'todo');
const agencyFilter=computed(()=>String(route.query.workAgency || 'all'));
const search=computed(()=>String(route.query.workSearch || ''));
const matches=item=>!search.value.trim() || [item.maskedName,item.clientMaskedName,item.agencyName,item.providerName,item.serviceCode,item.noteKind,item.date,item.dateOfService].filter(Boolean).join(' ').toLowerCase().includes(search.value.trim().toLowerCase());
const agencyItems=computed(()=>items.value.filter(item=>(agencyFilter.value==='all'||String(item.agencyId)===agencyFilter.value)&&matches(item)));
const bucket=item=>item.queueKind==='cosign'||item.status==='awaiting_cosign'?'cosign':item.status==='signed'?'signed':['started','completed','in_progress'].includes(item.status)?'started':'unstarted';
const counts=computed(()=>Object.fromEntries(tabs.map(tab=>[tab.id,agencyItems.value.filter(item=>tab.id==='todo'?bucket(item)!=='signed':bucket(item)===tab.id).length])));
const sortOrder=computed(()=>['oldest','client','agency','service','status'].includes(route.query.workSort)?route.query.workSort:'recent');
const visibleItems=computed(()=>agencyItems.value.filter(item=>currentTab.value==='todo'?bucket(item)!=='signed':bucket(item)===currentTab.value).sort((a,b)=>{
 const byDate=String(a.date || '').localeCompare(String(b.date || '')) || String(a.scheduledStart || a.timeLabel || '').localeCompare(String(b.scheduledStart || b.timeLabel || ''));
 const sortValue=item=>sortOrder.value==='client'?item.maskedName || item.clientMaskedName:sortOrder.value==='agency'?item.agencyName:sortOrder.value==='service'?item.serviceCode:bucket(item);
 const alphabetical=['client','agency','service','status'].includes(sortOrder.value)?String(sortValue(a)||'').localeCompare(String(sortValue(b)||'')):0;
 return alphabetical || (sortOrder.value==='oldest'?byDate:-byDate) || Number(a.agencyId)-Number(b.agencyId);
}));
const activeFailures=computed(()=>failures.value.filter(item=>(agencyFilter.value==='all'||String(item.agencyId)===agencyFilter.value)&&(currentTab.value==='todo'||(currentTab.value==='cosign'?item.section==='cosign':item.section==='notes'))));
function changeView(key,value){router.replace({path:route.path,query:{...route.query,[key]:value==='all'?undefined:value}});}
let generation=0,lastLoaded=0,pendingLoad=null;
const completedSignatures=new Map();
const completionKey=item=>`${item.agencyId}:${item.clinicalNoteId || item.clinical_note_id || item.noteId || ''}`;
function applySignatures(rows){return rows.map(item=>{
 const receipt=completedSignatures.get(completionKey(item)) || [...completedSignatures.values()].find(value=>value.kind==='author' && Number(value.agencyId)===Number(item.agencyId) && value.draftId && Number(value.draftId)===Number(item.draftId || item.draft_id));
 if(!receipt || item.clinicalRevisionId)return item;
 return {...item,queueKind:'note',status:'signed',narriva:{...item.narriva,quickSignEligible:false}};
});}
function recordSignature(receipt){
 if(!receipt?.noteId || !receipt.agencyId)return;
 completedSignatures.set(`${receipt.agencyId}:${receipt.noteId}`,receipt);
 ++generation;loading.value=false;lastLoaded=0;items.value=applySignatures(items.value);
 emit('counts',{mywork:failures.value.length?null:items.value.filter(item=>bucket(item)!=='signed').length});
 void load();
}
async function nextCosign(){
 if(!ready.value){if(pendingLoad){try{await pendingLoad;}catch{/* The list displays its own error. */}await Promise.resolve();}else await load();}
 return visibleItems.value.find(item=>bucket(item)==='cosign' && !item.clinicalRevisionId) || null;
}
defineExpose({recordSignature,nextCosign});
async function load(force=true){
 if(loading.value)return;if(!force && ready.value && Date.now()-lastLoaded<60000)return;const current=++generation,token=props.sessionToken;
 loading.value=true;error.value='';
 try{
  pendingLoad=axios.get(`${props.apiBase}/my-work`,{headers:{'X-Quick-View-Session':token},withCredentials:true});const {data}=await pendingLoad;if(current!==generation || token!==props.sessionToken)return;lastLoaded=Date.now();
  items.value=applySignatures(data.items || []);agencies.value=data.agencies || [];failures.value=data.failures || [];clinicalAvailable.value=data.clinicalAvailable!==false;ready.value=true;emit('counts',{mywork:failures.value.length?null:items.value.filter(item=>bucket(item)!=='signed').length});
 }catch(e){if(current!==generation || token!==props.sessionToken)return;if([401,403].includes(e.response?.status)){items.value=[];agencies.value=[];failures.value=[];ready.value=false;emit('counts',{mywork:null});}error.value=e.response?.status<500?e.response?.data?.error?.message || 'Your work is unavailable for this account.':'Your work could not be loaded. Try again.';}
 finally{if(current===generation){loading.value=false;pendingLoad=null;}}
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
watch(()=>props.visible,value=>{if(value)void load(false);});watch(()=>props.sessionToken,()=>{generation++;loading.value=false;lastLoaded=0;completedSignatures.clear();items.value=[];agencies.value=[];failures.value=[];ready.value=false;if(props.visible)void load();});onMounted(()=>{if(props.visible)void load();});onBeforeUnmount(()=>{generation++;items.value=[];lastLoaded=0;});
</script>
<template>
 <section class="mobile-mywork">
  <div class="work-toolbar"><button class="work-controls-toggle" :aria-expanded="controlsOpen" @click="setControls(!controlsOpen)"><SlidersHorizontal :size="16"/>{{controlsOpen?'Hide filters':'Search and sort'}}</button><button aria-label="Refresh My Work" :disabled="loading" @click="load"><RefreshCw :size="17"/></button></div><div v-show="controlsOpen" class="work-controls"><header><label class="work-search">Search<input type="search" aria-label="Search My Work" placeholder="Client, agency, service or date" :value="search" @input="changeView('workSearch',$event.target.value)" /></label></header>
  <label class="agency-filter">Agency<select aria-label="Filter documentation by agency" :value="agencyFilter" @change="changeView('workAgency',$event.target.value)"><option value="all">All agencies</option><option v-for="agency in agencies" :key="agency.id" :value="String(agency.id)">{{ agency.name }}</option></select></label>
  <label class="agency-filter">Sort<select aria-label="Sort My Work" :value="sortOrder" @change="changeView('workSort',$event.target.value)"><option value="recent">Most recent</option><option value="oldest">Oldest first</option><option value="client">Client A–Z</option><option value="agency">Agency A–Z</option><option value="service">Service code</option><option value="status">Status</option></select></label>
  </div><nav class="work-tabs" aria-label="Documentation status"><button v-for="tab in tabs" :key="tab.id" :aria-pressed="currentTab===tab.id" @click="changeView('workTab',tab.id)">{{ tab.label }} <span v-if="tab.id!=='signed'">{{ ready && !failures.some(f=>(agencyFilter==='all'||String(f.agencyId)===agencyFilter)&&(tab.id==='todo'||(tab.id==='cosign'?f.section==='cosign':f.section==='notes')))?counts[tab.id]:'—' }}</span></button></nav>
  <p v-if="loading && !ready" role="status">Loading your work…</p>
  <p v-if="error" role="alert">{{ error }} <button @click="load">Try again</button></p>
  <div v-if="activeFailures.length" class="work-errors" role="alert"><p v-for="failure in activeFailures" :key="`${failure.agencyId}:${failure.section}`">{{ failure.agencyName }}: {{ failure.message }}</p><button @click="load">Try again</button></div>
  <article v-for="item in visibleItems" :key="`${item.agencyId}:${item.queueKind}:${item.serverId || item.id}`" class="work-row" :class="`work-row--${bucket(item)}`">
   <component :is="item.clinicalRevisionId?'a':'button'" class="work-open" :class="{'qv-workspace-link':item.clinicalRevisionId}" :href="item.clinicalRevisionId?item.desktopReviewUrl:undefined" :target="item.clinicalRevisionId?'_blank':undefined" :rel="item.clinicalRevisionId?'noopener noreferrer':undefined" @click="!item.clinicalRevisionId && emit('draft',item)"><FilePenLine :size="21"/><span class="work-copy"><strong>{{ title(item) }}<template v-if="item.clientAge != null || item.age != null"> · Age {{ item.clientAge ?? item.age }}</template></strong><small>{{ dos(item) }}<template v-if="time(item)"> · {{ time(item) }}</template></small><small v-if="item.serviceCode">{{ item.serviceCode }}<template v-if="item.noteKind"> · {{ item.noteKind }}</template></small><small class="work-agency"><img v-if="item.agencyLogoUrl" :src="agencyLogo(item)" alt=""/><Building2 v-else :size="14"/>{{ item.agencyName || 'Agency' }}<template v-if="item.providerName"> · {{ item.providerName }}</template></small></span><span class="status" :aria-label="status(item)">{{item.status==='signed'?'View note':'Open note'}}</span><ChevronRight :size="17"/></component>
   <p v-if="item.clinicalRevisionId" class="amendment-hint">Review amendment in the full workspace. You may need to sign in there.</p>
   <NoteReviewActions v-if="!item.clinicalRevisionId" :item="item" :load-insights="loadReviewInsights" :access-key="sessionToken" :show-open-note="false" :allow-quick-sign="item.queueKind==='cosign'" @open-note="emit('draft',item)" @quick-sign="emit('draft',{...item,quickSignRequested:true})"/>
  </article>
  <p v-if="!loading && !error && ready && !activeFailures.length && !visibleItems.length">{{ clinicalAvailable?`No ${tabs.find(tab=>tab.id===currentTab).label.toLowerCase()} notes in this view.`:'Clinical documentation is not available for this account.' }}</p>
  <button class="task-link" @click="emit('tasks')">View my tasks <ChevronRight :size="15"/></button>
 </section>
</template>
<style scoped>
.mobile-mywork{background:#fff;padding:18px;color:#1b385d;min-width:0}.mobile-mywork>header{display:flex;align-items:center;justify-content:space-between}.mobile-mywork h2{font-size:19px}.mobile-mywork p{font-size:13px;color:#657d9c;line-height:1.6}.mobile-mywork button,.mobile-mywork select{font:inherit;color:inherit}.mobile-mywork button{cursor:pointer}.mobile-mywork header button{border:0;background:#f1f5fb;border-radius:8px;padding:9px}.agency-filter{display:flex;align-items:center;gap:10px;font-size:12px;margin:12px 0}.agency-filter select{min-width:0;flex:1;border:1px solid #d8e3f6;border-radius:8px;padding:9px;background:white}.work-tabs{display:flex;gap:4px;overflow-x:auto;margin:12px 0}.work-tabs button{white-space:nowrap;border:0;background:#f2f5fa;border-radius:9px;padding:10px 8px;font-size:12px}.work-tabs button[aria-pressed=true]{background:#245be8;color:white}.work-tabs span{font-size:11px;margin-left:2px}.work-row{border-bottom:1px solid #e5ebf5;padding:12px 0}.work-open{display:flex;width:100%;align-items:center;gap:9px;text-align:left;background:transparent;border:0;padding:5px 0}.work-open{font:inherit;color:inherit;text-decoration:none}.amendment-hint{margin:5px 0 0 30px}.work-open>svg{flex-shrink:0}.work-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}.work-copy strong{font-size:13px;overflow-wrap:anywhere}.work-copy small{font-size:11px;color:#657d9c}.work-agency{display:flex;align-items:center;gap:5px;flex-wrap:wrap}.work-agency img{width:20px;height:20px;object-fit:contain}.status{font-size:10px;background:#edf4ff;color:#2757a4;padding:4px 7px;border-radius:7px}.task-link{display:flex;gap:5px;align-items:center;background:#edf3ff;border:1px solid #d8e3f6;border-radius:9px;padding:10px 14px;margin:14px 0}.mw-quick-sign{background:#eaf6ef;border:1px solid #c2dfcd;border-radius:7px;color:#2b6f47;padding:7px 8px;font-size:11px;margin:5px 0 0 30px}.work-errors{padding:10px;background:#fff5f1;border-radius:8px}.work-errors p{margin:0 0 5px}.mobile-mywork button:focus-visible,.mobile-mywork select:focus-visible{outline:2px solid #245be8;outline-offset:2px}
</style>

<style scoped>.work-search{display:grid;gap:5px;font-size:12px;flex:1;margin-right:10px;min-width:0}.work-search input{font:inherit;font-size:16px;min-width:0;padding:9px;border:1px solid #d8e3f6;border-radius:8px}.mobile-mywork>header{gap:8px}</style>

<style scoped>
.work-toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center}.work-toolbar button{display:flex;align-items:center;gap:6px;border:0;background:#f1f5fb;border-radius:8px;padding:9px;font-size:12px}.work-controls header>button{display:none}.work-controls header{display:flex}.work-tabs{position:sticky;top:var(--mobile-header-height,72px);z-index:5;background:white;padding:8px 0;margin:4px 0}.work-row{padding:12px 8px}.work-row--unstarted{background:rgba(54,130,186,.055)}.work-row--started{background:rgba(207,158,60,.075)}.work-row--cosign{background:rgba(111,95,177,.055)}.work-controls-toggle:focus-visible{outline:2px solid #245be8;outline-offset:2px}
</style>
