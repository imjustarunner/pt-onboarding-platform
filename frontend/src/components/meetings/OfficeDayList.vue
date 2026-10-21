<template>
 <section :class="['office-day-list',{compact}]" aria-label="Your virtual day">
  <header><div><p class="eyebrow">YOUR VIRTUAL DAY</p><h2>{{compact ? 'Your virtual day' : 'A place for every conversation'}}</h2></div><div class="day-controls"><button v-if="compact" :aria-expanded="expanded" @click="expanded=!expanded">{{expanded?'Hide day list':'Show day list'}}</button><button aria-label="Previous day" @click="step(-1)">‹</button><input v-model="day" type="date" aria-label="Meeting date" /><button aria-label="Next day" @click="step(1)">›</button><select v-model="agencyFilter" aria-label="Filter agencies"><option value="">All my agencies</option><option v-for="agency in tenants" :key="agency.id" :value="String(agency.id)">{{agency.name}}</option></select></div></header>
  <p v-if="error" role="alert" class="agenda-error">{{error}} <button @click="load">Retry</button></p>
  <p v-if="loading && !items.length" role="status">Loading your day…</p>
  <p v-else-if="!visible.length && !compact" class="agenda-empty">No virtual meetings on this day. Your office is ready for guests using its link.</p>
  <div v-show="!compact||expanded" class="agenda-items">
   <details v-for="item in visible" :key="item.key" class="agenda-item" :style="{'--meeting-color':color(item)}" :open="activeKey===item.key||undefined">
    <summary><span class="agenda-time">{{time(item.startAt)}}<small>{{time(item.endAt)}}</small></span><span class="agenda-copy"><span class="agenda-tenant"><img v-if="logo(item)" :src="logo(item)" alt="" />{{item.agencyName||tenant(item)?.name||'Your agency'}}</span><strong>{{item.title}}</strong><small>{{label(item.kind)}}<span v-if="item.waitingCount"> · {{item.waitingCount}} waiting</span></small></span><span class="agenda-status">{{activeKey===item.key?'Open':item.status==='ended'?'Completed':'Details'}} <ChevronDown :size="14" /></span></summary>
    <div class="agenda-details"><p>{{item.details||`${label(item.kind)} · ${time(item.startAt)}${item.endAt ? ' – '+time(item.endAt):''}`}}</p><p v-if="item.waitingCount" class="arrival-note">Your invited client is waiting.</p><button :disabled="locked||!item.canOpen" @click="$emit('open',item)">{{activeKey===item.key?'Return to session':['clinical','tutoring'].includes(item.type)?'Open session here':'Open full meeting'}}</button><span v-if="locked" class="agenda-hint">End the active visit before opening another.</span></div>
   </details>
  </div>
 </section>
</template>
<script setup>
import { getScheduleSummaryResponse } from '../../utils/scheduleSummaryRequests';
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {ChevronDown} from '@lucide/vue';
import {useAgencyStore} from '../../store/agency';
import {useAuthStore} from '../../store/auth';
import api from '../../services/api';
import {agendaMeeting,officeTypeColors} from '../../utils/officeAgenda';
const props=defineProps({agencyId:Number,locked:Boolean,activeKey:String,compact:Boolean});const emit=defineEmits(['open','loaded']);
const agencies=useAgencyStore(),auth=useAuthStore();const localDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const expanded=ref(false);
const day=ref(localDay(new Date())),agencyFilter=ref(''),items=ref([]),loading=ref(false),error=ref('');let timer,version=0,stopped=false;
const accessibleAgencyIds=ref([]);
const candidates=computed(()=>{const map=new Map();for(const a of [...(agencies.userAgencies||[]),agencies.currentAgency].filter(a=>Number(a?.id)>0))map.set(Number(a.id),a);return [...map.values()];});
const tenants=computed(()=>candidates.value.filter(a=>accessibleAgencyIds.value.includes(Number(a.id))));
const visible=computed(()=>items.value.filter(i=>!agencyFilter.value||Number(i.agencyId)===Number(agencyFilter.value)));
const tenant=i=>tenants.value.find(a=>Number(a.id)===Number(i.agencyId));const logo=i=>i.agencyLogoUrl||tenant(i)?.logoUrl||tenant(i)?.logo_url||'';
const color=i=>/^#[0-9a-f]{6}$/i.test(i.color||'')?i.color:officeTypeColors[i.kind]||'#557f98';
const label=kind=>({mental_health:'Counseling',healthcare:'Clinical session',TEAM_MEETING:'Team meeting',HUDDLE:'Huddle',SUPERVISION:'Supervision',tutoring:'Tutoring',learning:'Learning'}[kind]||String(kind||'Meeting').replaceAll('_',' '));
const time=value=>value?new Date(value).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';
function step(n){const d=new Date(`${day.value}T12:00:00`);d.setDate(d.getDate()+n);day.value=localDay(d);}
async function load(){
 const ticket=++version;loading.value=true;error.value='';
 const start=new Date(`${day.value}T00:00:00`),end=new Date(start);end.setDate(end.getDate()+1);
 const monday=new Date(start);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
 const scopes=candidates.value.length?candidates.value:[{id:props.agencyId}];
 const brands=new Map();
 const [scopeResult,summaryResult]=await Promise.allSettled([
  api.get('/my-room/me/schedule-scopes',{params:{agencyId:props.agencyId},skipGlobalLoading:true}).then(({data})=>{
   const ids=(data.agencyIds||[]).map(Number);
   if(stopped||ticket!==version)return [];
   accessibleAgencyIds.value=ids;
   if(agencyFilter.value&&!ids.includes(Number(agencyFilter.value)))agencyFilter.value='';
   return Promise.allSettled(scopes.filter(a=>ids.includes(Number(a.id))).map(a=>api.get('/my-room/me/schedule',{params:{agencyId:a.id,from:start.toISOString(),to:end.toISOString()},skipGlobalLoading:true}).then(({data})=>{brands.set(Number(a.id),{agencyName:data.branding?.agencyName||a.name,agencyLogoUrl:data.branding?.agencyLogoUrl||data.branding?.logoUrl});return (data.items||[]).map(i=>({...i,type:i.type||'clinical',agencyId:Number(a.id),key:`${a.id}:${i.key}`}));})));
  }),
  getScheduleSummaryResponse(`/users/${auth.user?.id}/schedule-summary`,{params:{agencyId:props.agencyId,weekStart:localDay(monday),includeAllAgencies:1,skipOfficeMaterialize:true,includeGoogleBusy:false},skipGlobalLoading:true}).then(({data})=>[...(data.scheduleEvents||[]),...(data.supervisionSessions||[]).map(i=>({...i,kind:'SUPERVISION'}))].map(agendaMeeting).filter(Boolean).filter(i=>new Date(i.startAt)<end&&new Date(i.endAt)>start))
 ]);
 if(stopped||ticket!==version)return;
 const results=[...(scopeResult.status==='fulfilled'?scopeResult.value:[scopeResult]),summaryResult];
 const loaded=results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value);
 items.value=loaded.map(i=>({...i,...brands.get(i.agencyId)})).sort((a,b)=>new Date(a.startAt)-new Date(b.startAt));
 if(results.some(r=>r.status==='rejected'))error.value='Some of your schedule could not be loaded.';
 emit('loaded',items.value);loading.value=false;
}
watch(day,load);watch(()=>props.agencyId,load);onMounted(()=>{void load();timer=setInterval(load,15000);});onBeforeUnmount(()=>{stopped=true;clearInterval(timer);});
</script>
<style scoped>
.office-day-list.compact{padding:12px 18px}.office-day-list.compact header{margin-bottom:0}.office-day-list.compact .eyebrow{display:none}.office-day-list.compact .agenda-items{margin-top:14px}.office-day-list{margin:0 0 24px;padding:20px;border:1px solid #e3eaf0;border-radius:18px;background:#fff}.office-day-list header{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:16px}.eyebrow{font-size:10px;letter-spacing:.15em;color:#9a8350;margin:0 0 5px}.office-day-list h2{font-size:18px;letter-spacing:-.3px;color:#213449;margin:0}.day-controls{display:flex;align-items:center;gap:6px}.day-controls input,.day-controls select{min-width:0;border:1px solid #e2e8ef;background:#f8fafc;border-radius:8px;padding:7px;font:12px system-ui;color:#435b73}.office-day-list button{border:1px solid #dce5ed;border-radius:8px;background:#fff;padding:7px 11px;color:#28557f;cursor:pointer;font:600 12px system-ui}.office-day-list button:disabled{opacity:.5;cursor:default}.agenda-items{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:10px}.agenda-item{border:1px solid #e4eaf0;border-left:4px solid var(--meeting-color);border-radius:10px;align-self:start;overflow:hidden}.agenda-item summary{display:flex;gap:12px;align-items:center;list-style:none;padding:14px;cursor:pointer}.agenda-item summary::-webkit-details-marker{display:none}.agenda-time{font-size:12px;color:#52657a;min-width:60px;font-variant-numeric:tabular-nums}.agenda-time small{display:block;color:#94a1ae;margin-top:4px;font-size:10px}.agenda-copy{flex:1;min-width:0}.agenda-copy strong{font-size:13px;display:block;overflow-wrap:anywhere;color:#213449;margin:4px 0}.agenda-copy>small{font-size:10px;color:var(--meeting-color)}.agenda-tenant{display:flex;align-items:center;gap:5px;font-size:10px;color:#7a8a99}.agenda-tenant img{width:18px;height:18px;object-fit:contain}.agenda-status{font-size:10px;color:#8a99a7;display:flex;gap:4px;align-items:center}.agenda-details{padding:0 14px 14px;font-size:12px;color:#708295}.agenda-details p{white-space:pre-line;overflow-wrap:anywhere}.agenda-details button{background:#edf4f8}.agenda-hint{display:block;margin-top:8px;font-size:10px}.agenda-empty{font-size:12px;color:#8999a8}.agenda-error{font-size:12px;color:#a64049}.arrival-note{color:#27816f}@media(max-width:800px){.office-day-list header{align-items:flex-start;flex-direction:column}.day-controls{flex-wrap:wrap}}@media(min-width:1100px){.agenda-items{max-height:340px;overflow:auto}}
</style>
