<template>
 <Teleport to="body">
  <div class="public-website-analytics" translate="no" data-analytics-ignore>
   <div v-if="allowed" class="wa-toolbar">
    <button type="button" :aria-pressed="mode" @click="toggleMode">▥ Analytics mode <strong>{{ mode ? 'ON' : 'OFF' }}</strong></button>
    <button v-if="mode" type="button" @click="openArea()">Page stats</button>
   </div>
   <template v-if="allowed && mode && !panel">
    <button v-for="badge in badges" :key="badge.key" class="wa-badge" type="button" :style="badge.style" :aria-label="`Stats for ${badge.label}`" :title="`${badge.label}: ${badge.count} ${badge.area ? 'views' : 'interactions'}`" @click.stop="openArea(badge)">▥ {{ badge.count === null ? '—' : number(badge.count) }} <span>{{ badge.area ? 'views' : 'clicks' }}</span></button>
   </template>
   <div v-if="allowed && panel" class="wa-backdrop" @click.self="closePanel">
    <aside ref="dialog" class="wa-panel" role="dialog" aria-modal="true" aria-labelledby="wa-title" tabindex="-1" @keydown="dialogKeys">
     <header><div><small>INTERNAL WEBSITE ANALYTICS</small><h2 id="wa-title">{{ areaLabel || 'Page analytics' }}</h2><p>{{ report?.site?.title || slug }}</p></div><button type="button" aria-label="Close analytics" @click="closePanel">×</button></header>
     <div class="wa-body">
      <div class="wa-presets"><button v-for="[days,label] in presets" :key="days" type="button" @click="setDays(days)">{{ label }}</button></div>
      <div class="wa-fields"><label>From (UTC)<input v-model="start" type="date" :max="end"></label><label>Through (UTC)<input v-model="end" type="date" :min="start" :max="today"></label></div>
      <label>Website page<select v-model="selectedPage" aria-label="Website page"><option value="">All website pages</option><option v-for="path in pageOptions" :key="path" :value="path">{{ path }}</option></select></label>
      <div v-if="areaKey" class="wa-scope">This area and its contents <button type="button" @click="clearArea">Show full page</button></div>
      <p v-if="loading" role="status">Loading analytics…</p>
      <p v-if="error" role="alert" class="wa-error">{{ error }} <button type="button" @click="loadReport">Retry</button></p>
      <template v-if="report && !error && !loading">
       <div class="wa-metrics"><div v-for="[key,label] in metrics" :key="key"><strong>{{ number(report.totals[key]) }}</strong><span>{{ label }}</span></div></div>
       <p class="wa-note">Anonymous browsers are estimates using a first-party identifier that resets after 30 days. Logged-in visits and known bots are excluded. Section views require at least one second of visibility.</p>
       <p v-if="!report.rows.length" class="wa-empty">No recorded activity for this selection. Tracking begins after deployment; earlier traffic is not reconstructed.</p>
       <details v-if="report.daily.length" open><summary>Activity by day</summary><div class="wa-chart" role="img" aria-label="Daily anonymous browser activity"><div v-for="day in report.daily" :key="day.day" :title="`${day.day}: ${day.visitors} browsers, ${day.views} views, ${day.clicks} clicks`"><span :style="{height: `${Math.max(3, Number(day.visitors)/dailyMax*70)}px`}"></span><small>{{ day.day.slice(5) }}</small></div></div></details>
       <h3>All recorded activity <small>{{ filteredRows.length }}</small></h3>
       <label>Search areas or pages<input v-model="search" type="search" placeholder="Section, button, profile, or page"></label>
       <div class="wa-fields"><label>Activity type<select v-model="kind" aria-label="Activity type"><option value="">All activity</option><option v-for="(label,key) in kinds" :key="key" :value="key">{{ label }}</option></select></label><label>Sort by<select v-model="sort" aria-label="Sort by"><option value="count">Most activity</option><option value="visitors">Most browsers</option><option value="label">Area name</option><option value="lastSeen">Most recent</option></select></label></div>
       <div class="wa-table-wrap"><table><thead><tr><th scope="col">Area / activity</th><th scope="col">Count</th><th scope="col">Browsers</th></tr></thead><tbody><tr v-for="row in pagedRows" :key="`${row.pagePath}:${row.targetKey}:${row.kind}`"><td><button type="button" @click="drillRow(row)">{{ row.label }}</button><small>{{ kinds[row.kind] }} · {{ row.pagePath }}</small><small :title="row.targetKey">{{ dateLabel(row.lastSeen) }}</small></td><td>{{ number(row.count) }}</td><td>{{ number(row.visitors) }}</td></tr></tbody></table></div>
       <div class="wa-pagination"><button type="button" :disabled="rowPage === 1" @click="rowPage--">Previous</button><span>{{ rowPage }} / {{ pageCount }}</span><button type="button" :disabled="rowPage >= pageCount" @click="rowPage++">Next</button></div>
       <button class="wa-export" type="button" :disabled="!filteredRows.length" @click="download">↓ Export filtered report (CSV)</button>
       <details v-if="report.breakdown.length"><summary>Devices, languages & arrival channels</summary><p class="wa-note">Counts below are page views. Arrival channels use only the referrer category.</p><ul><li v-for="(item,index) in report.breakdown" :key="index">{{ item.device }} · {{ item.language }} · {{ item.source }} <strong>{{ number(item.views) }}</strong></li></ul></details>
      </template>
      <p class="wa-note">Reports cover up to 90 days. Event data is retained for 120 days. No form contents, search terms, personal identifiers, or destination query strings are recorded.</p>
     </div>
    </aside>
   </div>
  </div>
 </Teleport>
</template>

<script setup>
import {computed,ref,shallowRef,watch,onMounted,onBeforeUnmount,nextTick} from 'vue';
import {useRoute} from 'vue-router';
import {useAuthStore} from '../../store/auth';
import api from '../../services/api';
import {anonymousWebsiteVisitor,analyticsCsv,createWebsiteTracker} from '../../utils/publicWebsiteAnalytics';
const route=useRoute(),auth=useAuthStore();
const slug=computed(()=>String(route.path).match(/^\/p\/([a-z0-9-]+)/)?.[1]||'');
const allowed=ref(false),mode=ref(false),panel=ref(false),dialog=ref(null),loading=ref(false),error=ref('');
const report=shallowRef(null),baseReport=shallowRef(null),targets=shallowRef([]),badges=shallowRef([]);
const today=new Date().toISOString().slice(0,10),end=ref(today),start=ref(new Date(Date.now()-29*86400000).toISOString().slice(0,10));
const selectedPage=ref(route.path),areaKey=ref(''),areaLabel=ref(''),search=ref(''),sort=ref('count'),kind=ref(''),rowPage=ref(1);
const presets=[[1,'Today'],[7,'Last 7 days'],[30,'Last 30 days']];
const metrics=[['views','Page views'],['visitors','Anonymous browsers'],['clicks','Button & link clicks'],['impressions','Section & card views'],['profileOpens','Profile opens'],['filters','Filter uses'],['searches','Searches']];
const kinds={page_view:'Page view',section_view:'Section view',click:'Click',profile_open:'Profile open',filter_use:'Filter use',search:'Search',scroll_depth:'Scroll depth'};
const options={skipAuthRedirect:true,skipGlobalLoading:true};
const number=value=>Number(value||0).toLocaleString();
const dateLabel=value=>value?new Date(value).toLocaleString():'';
const pageOptions=computed(()=>[...new Set([route.path,...(report.value?.pages||[])])].sort());
const dailyMax=computed(()=>Math.max(1,...(report.value?.daily||[]).map(d=>Number(d.visitors))));
const filteredRows=computed(()=>{
 const q=search.value.trim().toLowerCase();
 return (report.value?.rows||[]).filter(r=>(!kind.value||r.kind===kind.value)&&(!q||`${r.label} ${r.pagePath} ${kinds[r.kind]}`.toLowerCase().includes(q))).slice().sort((a,b)=>sort.value==='label'?a.label.localeCompare(b.label):sort.value==='lastSeen'?String(b.lastSeen).localeCompare(String(a.lastSeen)):Number(b[sort.value])-Number(a[sort.value]));
});
const pageCount=computed(()=>Math.max(1,Math.ceil(filteredRows.value.length/40)));
const pagedRows=computed(()=>filteredRows.value.slice((rowPage.value-1)*40,rowPage.value*40));
watch([search,sort,kind,report],()=>{rowPage.value=1;});
let savedOverflow;
watch(panel,open=>{if(open){savedOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';}else if(savedOverflow!==undefined){document.documentElement.style.overflow=savedOverflow;savedOverflow=undefined;}});
let tracker,flushTimer,reportTimer,frame,resizeObserver,accessGeneration=0,reportGeneration=0,returnFocus,queue=[],visitorId,mounted=false;
const guest=()=>!auth.user&&!route.query.marketingPreview&&window.parent===window;
function enqueue(site,event){if(!guest())return;queue.push({site,event,attempt:0});if(queue.length>200)queue.shift();}
async function flush(keepalive=false){
 if(!guest()){queue=[];return;}
 const batch=queue.splice(0,queue.length);const sites=[...new Set(batch.map(e=>e.site))];
 for(const site of sites){const entries=batch.filter(e=>e.site===site);for(let offset=0;offset<entries.length;offset+=40){const chunk=entries.slice(offset,offset+40);
  try{const base=String(api.defaults.baseURL||'/api').replace(/\/$/,'');const response=await fetch(`${base}/public/marketing-pages/${encodeURIComponent(site)}/analytics/events`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId,events:chunk.map(e=>e.event)}),keepalive});if(!response.ok&&response.status>=500)throw new Error('Retry analytics');}
  catch{if(!keepalive&&guest())queue.push(...chunk.filter(e=>e.attempt<2).map(e=>({...e,attempt:e.attempt+1})));}
 }}
}
const pagehide=()=>{void flush(true);};
async function checkAccess(){
 const generation=++accessGeneration;allowed.value=false;mode.value=false;panel.value=false;report.value=null;baseReport.value=null;++reportGeneration;
 if(!auth.user||auth.user.demoMode||!slug.value||route.query.marketingPreview||window.parent!==window)return;
 try{const {data}=await api.get(`/website-analytics/${slug.value}/access`,options);if(generation===accessGeneration)allowed.value=data.allowed===true;}catch{/* Reports are deliberately invisible to unauthorized visitors. */}
}
function restart(){
 tracker?.stop();targets.value=[];badges.value=[];selectedPage.value=route.path;areaKey.value='';areaLabel.value='';
 if(!slug.value)return;
 const site=slug.value;
 tracker=createWebsiteTracker({document,window,pagePath:route.path,canTrack:guest,emit:event=>enqueue(site,event),onTargets:value=>{targets.value=value;scheduleBadges();}});
}
async function loadReport(){
 if(!allowed.value||!mode.value)return;const generation=++reportGeneration;loading.value=true;error.value='';
 const page=selectedPage.value,target=areaKey.value;
 try{const {data}=await api.get(`/website-analytics/${slug.value}`,{...options,params:{start:start.value,end:end.value,page,target}});
  if(generation!==reportGeneration)return;report.value=data;
  if(!target&&page===route.path)baseReport.value=data;
  scheduleBadges();
 }catch(e){if(generation===reportGeneration){report.value=null;error.value=e.response?.data?.error?.message||'Unable to load analytics. Please try again.';}}
 finally{if(generation===reportGeneration)loading.value=false;}
}
function queueReport(){clearTimeout(reportTimer);reportTimer=setTimeout(loadReport,180);}
watch([start,end,selectedPage,areaKey],queueReport);
watch(selectedPage,()=>{areaKey.value='';areaLabel.value='';});
watch([start,end],()=>{baseReport.value=null;});
watch(()=>[route.path,auth.user?.id,auth.user?.role],()=>{if(!mounted)return;if(auth.user)queue=[];restart();void checkAccess();});
async function toggleMode(){mode.value=!mode.value;if(mode.value){selectedPage.value=route.path;clearArea();await loadReport();scheduleBadges();}else{closePanel();badges.value=[];}}
function clearArea(){areaKey.value='';areaLabel.value='';}
async function openArea(area){returnFocus=document.activeElement;selectedPage.value=route.path;await nextTick();areaKey.value=area?.key||'';areaLabel.value=area?.label||'';panel.value=true;await nextTick();clearTimeout(reportTimer);void loadReport();dialog.value?.focus();}
async function drillRow(row){selectedPage.value=row.pagePath;await nextTick();areaKey.value=row.targetKey;areaLabel.value=row.label;}
function closePanel(){panel.value=false;if(mode.value&&(selectedPage.value!==route.path||!baseReport.value)){selectedPage.value=route.path;clearArea();queueReport();}nextTick(()=>(returnFocus?.isConnected?returnFocus:document.querySelector('.wa-toolbar button'))?.focus());scheduleBadges();}
function setDays(days){end.value=today;start.value=new Date(Date.parse(today)-(days-1)*86400000).toISOString().slice(0,10);}
function dialogKeys(event){if(event.key==='Escape'){event.preventDefault();closePanel();}if(event.key==='Tab'){const items=[...dialog.value.querySelectorAll('button:not(:disabled),input,select,summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);const first=items[0],last=items.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.value)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}
function scheduleBadges(){if(frame)return;frame=requestAnimationFrame(()=>{frame=null;positionBadges();});}
function positionBadges(){
 if(!allowed.value||!mode.value||panel.value){badges.value=[];return;}
 const counts=new Map();for(const row of baseReport.value?.rows||[]){const entry=counts.get(row.targetKey)||{views:0,clicks:0};if(row.kind==='section_view')entry.views+=row.count;else if(['click','profile_open','filter_use','search'].includes(row.kind))entry.clicks+=row.count;counts.set(row.targetKey,entry);}
 const placed=[];
 const obstacles=[...targets.value.filter(t=>!t.area).map(t=>t.element),...document.querySelectorAll('.wa-toolbar, .public-translate-widget, .its-support-launcher')].map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height&&r.bottom>0&&r.top<window.innerHeight);
 const overlaps=(x,y,width,height,r)=>x<r.right+2&&x+width>r.left-2&&y<r.bottom+2&&y+height>r.top-2;
 for(const meta of targets.value){const rect=meta.element.getBoundingClientRect();if(!rect.width||!rect.height||rect.bottom<5||rect.top>window.innerHeight-40)continue;
  const width=105,height=26;let x=Math.min(window.innerWidth-width-8,Math.max(8,meta.area?rect.right-width-5:rect.left+(rect.width-width)/2));let y=meta.area?Math.max(7,rect.top+5):rect.bottom+4;
  while(placed.some(b=>overlaps(x,y,width,height,{left:b.x,right:b.x+width,top:b.y,bottom:b.y+height}))||obstacles.some(r=>overlaps(x,y,width,height,r)))y+=height+3;
  if(y>window.innerHeight-45||y>Math.max(rect.bottom+80,rect.top+100))continue;
  placed.push({...meta,x,y,count:baseReport.value?(counts.get(meta.key)?.[meta.area?'views':'clicks']||0):null,style:{left:`${x}px`,top:`${y}px`}});
  if(placed.length>=65)break;
 }badges.value=placed;
}
function download(){const blob=new Blob(['\uFEFF'+analyticsCsv(filteredRows.value)],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${slug.value}-analytics-${start.value}-${end.value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
onMounted(()=>{mounted=true;visitorId=anonymousWebsiteVisitor(localStorage,crypto);restart();void checkAccess();flushTimer=setInterval(()=>void flush(),3000);window.addEventListener('pagehide',pagehide);window.addEventListener('scroll',scheduleBadges,{passive:true});window.addEventListener('resize',scheduleBadges);resizeObserver=new ResizeObserver(scheduleBadges);resizeObserver.observe(document.body);});
onBeforeUnmount(()=>{if(savedOverflow!==undefined)document.documentElement.style.overflow=savedOverflow;mounted=false;tracker?.stop();void flush(true);clearInterval(flushTimer);clearTimeout(reportTimer);cancelAnimationFrame(frame);resizeObserver?.disconnect();++accessGeneration;++reportGeneration;window.removeEventListener('pagehide',pagehide);window.removeEventListener('scroll',scheduleBadges);window.removeEventListener('resize',scheduleBadges);});
</script>

<style scoped>
.public-website-analytics{font:14px/1.45 system-ui,sans-serif;color:#153f36;letter-spacing:normal;text-align:left}.public-website-analytics *{box-sizing:border-box}.public-website-analytics button,.public-website-analytics input,.public-website-analytics select{font:inherit;color:inherit;border:1px solid #bfd4cc;border-radius:7px;background:#fff;padding:8px 10px;min-width:0}.public-website-analytics button{cursor:pointer}.public-website-analytics button:hover{background:#edf6f1}.public-website-analytics button:focus-visible,.public-website-analytics input:focus-visible,.public-website-analytics select:focus-visible{outline:3px solid #247d64;outline-offset:2px}.public-website-analytics button:disabled{opacity:.45;cursor:default}.wa-toolbar{position:fixed;left:16px;bottom:16px;z-index:10020;display:flex;gap:5px;padding:5px;background:#f9fffc;border:1px solid #bdd5cb;border-radius:10px;box-shadow:0 3px 14px #153f3629}.wa-toolbar strong{display:inline-block;padding:2px 8px;border-radius:20px;background:#185b47;color:white;margin-left:7px}.wa-badge{position:fixed;z-index:10010;max-width:110px;min-height:26px;padding:3px 7px!important;box-shadow:0 1px 5px #193f3630;font-size:11px!important;font-weight:700!important;white-space:nowrap;background:#f5fffa!important}.wa-backdrop{position:fixed;inset:0;z-index:2147483646;background:#071f2b38}.wa-panel{position:absolute;right:12px;top:12px;bottom:12px;width:510px;max-width:calc(100vw - 24px);background:white;border-radius:14px;box-shadow:0 10px 45px #092e3b40;display:flex;flex-direction:column;overflow:hidden}.wa-panel header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:20px;border-bottom:1px solid #dbe8e2}.wa-panel header small{font-size:10px;letter-spacing:.13em}.wa-panel h2{font-size:22px;line-height:1.2;margin:6px 0;overflow-wrap:anywhere}.wa-panel h3{font-size:17px;margin:22px 0 10px}.wa-panel p{margin:8px 0}.wa-panel header p{font-size:12px;color:#637871}.wa-panel header button{font-size:23px;line-height:1}.wa-body{overflow:auto;padding:18px 20px 25px;overscroll-behavior:contain}.wa-body>label{display:grid;gap:5px;margin:12px 0}.wa-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.wa-fields label{display:grid;gap:5px}.wa-presets{display:flex;gap:6px;flex-wrap:wrap}.wa-scope{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:9px;background:#f1f7f3;border-radius:7px;font-size:12px}.wa-metrics{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:18px 0}.wa-metrics>div{display:grid;gap:2px;padding:12px;background:#f1f7f3;border:1px solid #e1ece7;border-radius:9px}.wa-metrics strong{font-size:25px}.wa-metrics span{font-size:12px}.wa-note{font-size:11px;color:#5e716b;line-height:1.6}.wa-error{color:#91332d;padding:12px;background:#fff0ec;border-radius:7px}.wa-empty{padding:18px;background:#f2f6fa;border-radius:7px}.wa-panel details{border-block:1px solid #e2eae6;padding:12px 0;margin:16px 0}.wa-panel summary{cursor:pointer;font-weight:600}.wa-chart{display:flex;align-items:flex-end;gap:4px;overflow-x:auto;padding-top:12px}.wa-chart>div{flex:1;min-width:25px;text-align:center}.wa-chart span{display:block;background:#368c6d;border-radius:3px 3px 0 0}.wa-chart small{font-size:9px}.wa-table-wrap{overflow-x:auto}.wa-panel table{width:100%;border-collapse:collapse;font-size:12px}.wa-panel th,.wa-panel td{padding:10px 5px;border-bottom:1px solid #e2eae6;text-align:right;vertical-align:top}.wa-panel th:first-child,.wa-panel td:first-child{text-align:left;min-width:180px}.wa-panel td small{display:block;color:#687a74;font-size:10px;overflow-wrap:anywhere}.wa-panel td button{border:0;padding:0;background:none;text-align:left;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}.wa-pagination{display:flex;align-items:center;justify-content:space-between;margin:12px 0}.wa-export{width:100%;background:#16563f!important;color:white!important;margin:6px 0}.wa-panel ul{padding-left:18px;font-size:12px}.wa-panel li{padding:5px}.wa-panel li strong{float:right}@media(max-width:550px){.wa-panel{inset:0;width:100%;max-width:100%;border-radius:0}.wa-body{padding:14px}.wa-toolbar{left:8px;bottom:8px;font-size:12px}.wa-fields{gap:7px}.wa-panel header{padding:14px}}@media(prefers-reduced-motion:reduce){.public-website-analytics *{scroll-behavior:auto}}
</style>
