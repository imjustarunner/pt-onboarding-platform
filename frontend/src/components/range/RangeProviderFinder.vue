<template>
 <section class="range-finder" aria-label="Find providers">
  <div class="range-finder-tools">
   <label class="range-search">Search the network<input v-model="filters.search" type="search" placeholder="Name, specialty, language, or organization…"/></label>
   <label>Service<select v-model="filters.service"><option value="">All services</option><option v-for="[key,label] in services" :key="key" :value="key">{{label}}</option></select></label>
   <label>Session format<select v-model="filters.setting"><option value="all">All formats</option><option value="office">In person</option><option value="virtual">Virtual</option><option value="school">School-based</option></select></label>
   <label>Location<select v-model="filters.city"><option value="">All locations</option><option v-for="v in options('city',cities)" :key="v">{{v}}</option></select></label>
   <button class="range-outline" :aria-expanded="moreFilters" @click="moreFilters=!moreFilters">{{moreFilters?'Fewer filters':'More filters'}} {{activeFilterCount?`(${activeFilterCount})`:''}}</button>
   <template v-if="moreFilters">
    <label>Organization<select v-model="filters.agency"><option value="">All organizations</option><option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{a.name}}</option></select></label>
    <label>Provider gender<select v-model="filters.gender"><option value="">Any gender</option><option v-for="v in options('gender',values('gender'))" :key="v">{{v}}</option></select></label>
    <label>Client age / grade<select v-model="filters.age"><option value="">All ages</option><option v-for="v in options('age',sortClientAges(values('ages')))" :key="v">{{v}}</option></select></label>
    <label>Specialty<select v-model="filters.specialty"><option value="">All specialties</option><option v-for="v in options('specialty',values('specialties'))" :key="v">{{v}}</option></select></label>
    <label>Type of care<select v-model="filters.care"><option value="">All client types</option><option v-for="v in options('care',values('populations'))" :key="v">{{v}}</option></select></label>
    <label>Insurance or self-pay<select v-model="filters.insurance"><option value="">Any payment option</option><option value="self-pay">Self-pay</option><option v-for="v in options('insurance',values('insurances')).filter(v=>v!=='self-pay')" :key="v">{{v}}</option></select></label>
    <label>Provider status<select v-model="filters.accepting"><option value="">Any status</option><option value="yes">Accepting new clients</option><option value="waitlist">Waitlist</option><option value="unavailable">Closed to new clients</option></select></label>
    <label>Openings<select v-model="filters.openings"><option value="">Any availability</option><option value="yes">With openings</option><option value="no">Without posted openings</option></select></label>
    <label v-if="filters.school">School<select v-model="filters.school"><option value="">All schools</option><option v-for="s in schools" :key="s.id" :value="String(s.id)">{{s.name}}</option></select></label>
    <label v-if="filters.state">State<input v-model="filters.state"/></label>
   </template>
   <button type="button" class="range-outline" @click="clear">Clear filters</button><button type="button" class="range-outline" :disabled="checking" @click="refresh">Refresh openings</button>
  </div>
  <p class="range-muted" v-if="filters.openings==='yes'">Showing published openings that match your preferences across the collective. Change the filters to explore other options.</p>
  <p v-if="loading" role="status">Loading published providers…</p>
  <div v-else-if="error" role="alert"><p>{{error}}</p><button class="range-button" @click="load">Try again</button></div>
  <template v-else>
   <div class="range-results-heading"><h2>{{filtered.length}} provider listing{{filtered.length===1?'':'s'}}</h2><label>Sort by<select v-model="sort"><option value="soonest">Next opening</option><option value="name">Name</option></select></label></div>
   <p v-if="checking" role="status">Checking current openings… Results appear as calendars are confirmed.</p>
   <p v-if="failedCount" role="status">{{failedCount}} calendar{{failedCount===1?'':'s'}} could not be checked. <button class="range-outline" @click="retry">Retry availability</button></p>
   <div v-if="!filtered.length&&!checking" class="range-empty"><h3>No confirmed matches.</h3><p>Try another location, format, or fewer filters.</p><button class="range-outline" @click="clear">Clear filters</button><router-link class="range-outline" to="/p/range/network">Meet our organizations →</router-link></div>
   <div class="range-network-grid">
    <article v-for="p in visible" :key="key(p)" class="range-provider-card" :data-analytics-id="`provider-${p.id}`" :data-analytics-label="p.name">
     <div class="range-tenant-brand"><img v-if="safe(p.agencyLogoUrl)" :src="safe(p.agencyLogoUrl)" alt=""/><div><strong>{{p.agencyName}}</strong><span>{{label(p.service)}}</span></div></div>
     <div class="range-provider-overview"><img v-if="safe(p.photoUrl)" class="range-avatar" :src="safe(p.photoUrl)" :alt="p.name" loading="lazy"/><div v-else class="range-initials">{{p.name.split(' ').map(x=>x[0]).slice(0,2).join('')}}</div><div><h3>{{p.name}}<template v-if="p.credential">, {{p.credential}}</template><small>{{p.title}}</small></h3><span class="range-badge">{{status(p)==='accepting'?'Accepting new clients':status(p)==='waitlist'?'Waitlist':'Closed to new clients'}}</span></div></div>
     <p v-if="p.bio" class="range-network-bio">{{p.bio}}</p><div class="range-tags"><span v-for="tag in [...p.specialties,...p.subjects].slice(0,4)" :key="tag">{{tag}}</span></div>
     <div class="range-network-formats"><span v-if="p.virtual"><Icon name="screen"/>Virtual</span><span v-if="p.inPerson" v-for="o in p.locations" :key="o.id"><Icon name="pin"/>{{o.name}} · {{o.city}}</span><span v-if="p.school&&p.schools?.length"><Icon name="school"/>School-based</span></div>
     <details v-if="p.insurances.length"><summary>Insurance · {{p.insurances.length}} plans</summary><p>{{p.insurances.join(', ')}}</p></details>
     <div class="range-network-opening"><strong>Next opening</strong><p v-if="calendars[key(p)]?.loading">Checking calendar…</p><p v-else-if="calendars[key(p)]?.error">Availability could not be confirmed.</p><template v-else><p v-if="slots(p).length">{{date(slots(p)[0].startAt)}}</p><p v-else-if="hasOpenings(p)">School openings · confirm with {{p.agencyName}}</p><p v-else>{{status(p)==='accepting'?'No times are posted. Contact this organization to find a time.':status(p)==='waitlist'?'Contact this organization about joining the waitlist.':'No new-client openings at this organization.'}}</p><ul class="range-slot-list"><li v-for="slot in slots(p).slice(0,3)" :key="`${slot.format}-${slot.startAt}-${slot.buildingId}`">{{date(slot.startAt)}} · {{slot.format==='VIRTUAL'?'Virtual':slot.buildingName||'In person'}}</li></ul></template></div>
     <div class="range-actions"><a class="range-button" :href="profileUrl(p)" @click="guard">View profile →</a><a v-if="p.onlineScheduling&&hasOpenings(p)" class="range-outline" :href="safe(p.bookingUrl)" @click="guard">Book now →</a></div>
    </article>
   </div>
   <button v-if="filtered.length>limit" class="range-outline" @click="limit+=12">Show more providers →</button>
   <p class="range-muted">Each organization confirms its services, fees, insurance, and appointments. Times are shown in {{timezone}}. Selecting a time with one organization reserves that provider’s time across the network.</p>
  </template><p v-if="notice" role="status">{{notice}}</p>
 </section>
</template>
<script setup>
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import api from '../../services/api';
import Icon from '../rise/RiseIcon.vue';
import {publicWebsiteUrl as safe} from '../../composables/useStandalonePublicWebsite';
import {readNetworkSearch} from '../../utils/networkProviderSearch';
import {sortClientAges} from '../../utils/publicProviderFacets';
const props=defineProps({preview:Boolean}),route=useRoute(),router=useRouter();
const rows=ref([]),loading=ref(true),error=ref(''),notice=ref(''),filters=ref({...readNetworkSearch(route.query),setting:route.query.setting||'all'}),moreFilters=ref(false),sort=ref('soonest'),limit=ref(12),calendars=ref({});
const services=[['counseling','Mental health'],['tutoring','Tutoring'],['coaching','Life coaching']];
const key=p=>`${p.agencyId}-${p.id}-${p.service}`,label=v=>services.find(s=>s[0]===v)?.[1]||v;
const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone,date=v=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
const equal=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();
const values=k=>[...new Set(rows.value.flatMap(p=>p[k]||[]))].sort();
const options=(field,values)=>[...new Set([...(filters.value[field]?[filters.value[field]]:[]),...values])];
const cities=computed(()=>[...new Set(rows.value.flatMap(p=>(p.locations||[]).map(o=>[o.city,o.state].filter(Boolean).join(', '))))].sort());
const agencies=computed(()=>[...new Map(rows.value.map(p=>[p.agencyId,{id:p.agencyId,name:p.agencyName}])).values()]);
const schools=computed(()=>{const list=[...new Map(rows.value.flatMap(p=>p.schools||[]).map(s=>[String(s.id),s])).values()];if(filters.value.school&&!list.some(s=>String(s.id)===filters.value.school))list.push({id:filters.value.school,name:'Selected school'});return list;});
const activeFilterCount=computed(()=>['age','specialty','insurance','gender','care','school','state','agency','accepting','openings'].filter(k=>filters.value[k]).length);
const candidates=computed(()=>rows.value.filter(p=>{
 const f=filters.value,q=f.search.trim().toLowerCase();
 return (!f.service||p.service===f.service)&&(!f.agency||String(p.agencyId)===f.agency)&&
 (!f.gender||equal(p.gender,f.gender))&&(!f.age||p.ages.some(v=>equal(v,f.age)))&&(!f.specialty||p.specialties.some(v=>equal(v,f.specialty)))&&
 (!f.care||p.populations.some(v=>equal(v,f.care)))&&(!f.insurance||f.insurance==='self-pay'||p.insurances.some(v=>equal(v,f.insurance)))&&
 (!f.city||(p.locations||[]).some(o=>equal([o.city,o.state].filter(Boolean).join(', '),f.city))||equal(p.location,f.city))&&
 (!f.state||(p.locations||[]).some(o=>equal(o.state,f.state))||p.location?.toLowerCase().endsWith(f.state.toLowerCase()))&&
 (!f.school||p.schools?.some(s=>String(s.id)===f.school))&&
 (f.setting==='office'?p.inPerson:f.setting==='virtual'?p.virtual:f.setting==='school'?p.school&&p.schools?.length:true)&&
 (!q||[p.name,p.title,p.credential,p.agencyName,p.bio,...p.specialties,...p.subjects,...p.languages,...p.ages,...p.schools.map(s=>s.name)].join(' ').toLowerCase().includes(q));
}));
function slots(p){const f=filters.value;if(f.school)return [];return (calendars.value[key(p)]?.slots||[]).filter(s=>
 (f.setting==='office'?s.format==='IN_PERSON':f.setting==='virtual'?s.format==='VIRTUAL':f.setting==='school'?false:true)&&
 (!f.city||s.format==='VIRTUAL'||p.locations.some(o=>Number(o.id)===Number(s.buildingId)&&equal([o.city,o.state].filter(Boolean).join(', '),f.city))));}
function hasOpenings(p){const c=calendars.value[key(p)];return slots(p).length>0||(['all','school',''].includes(filters.value.setting)&&
 (filters.value.school?c?.schools?.some(s=>String(s.id)===filters.value.school&&s.hasOpenings):c?.school?.hasPublishedOpenings));}
function status(p){if(hasOpenings(p))return 'accepting';const c=calendars.value[key(p)],f=filters.value.school?'school':filters.value.setting,k={office:'inPerson',virtual:'virtual',school:'school'}[f];if(k&&c?.[k])return c[k].status;return p.accepting?'accepting':p.waitlistEnabled?'waitlist':'unavailable';}
const filtered=computed(()=>candidates.value.filter(p=>{
 const c=calendars.value[key(p)],f=filters.value,known=c&&!c.loading&&!c.error;
 return (!f.accepting||status(p)===(f.accepting==='yes'?'accepting':f.accepting))&&(!f.openings||(known&&(f.openings==='yes'?hasOpenings(p):!hasOpenings(p))));
}).sort((a,b)=>(sort.value==='soonest'?(Date.parse(slots(a)[0]?.startAt)||8e15)-(Date.parse(slots(b)[0]?.startAt)||8e15):0)||a.name.localeCompare(b.name)));
const visible=computed(()=>filtered.value.slice(0,limit.value));
const checking=computed(()=>!props.preview&&candidates.value.some(p=>!calendars.value[key(p)]||calendars.value[key(p)].loading));
const failedCount=computed(()=>candidates.value.filter(p=>calendars.value[key(p)]?.error).length);
let running=0,disposed=false;
async function pump(){if(props.preview||disposed)return;while(running<3){const p=candidates.value.find(p=>!calendars.value[key(p)]);if(!p)break;const k=key(p);calendars.value[k]={loading:true};running++;
 api.get(`/public/mental-range/providers/${p.agencyId}/${p.id}/availability`,{params:{service:p.service,format:'ALL'},skipAuthRedirect:true,skipGlobalLoading:true,timeout:60000}).then(({data})=>{if(!disposed)calendars.value[k]=data;}).catch(()=>{if(!disposed)calendars.value[k]={error:true};}).finally(()=>{running--;pump();});}}
watch(candidates,pump);
watch(()=>route.query,q=>{const next={...readNetworkSearch(q),setting:q.setting||'all'};if(JSON.stringify(next)!==JSON.stringify(filters.value))filters.value=next;});
watch(filters,()=>{limit.value=12;const query=Object.fromEntries(Object.entries(filters.value).filter(([,v])=>v));router.replace({query});},{deep:true});
function clear(){filters.value={...readNetworkSearch(),setting:'all'};}
function refresh(){for(const p of candidates.value)if(!calendars.value[key(p)]?.loading)delete calendars.value[key(p)];pump();}
function retry(){for(const p of candidates.value)if(calendars.value[key(p)]?.error)delete calendars.value[key(p)];pump();}
async function load(){loading.value=true;error.value='';try{const{data}=await api.get('/public/mental-range/providers',{skipAuthRedirect:true,skipGlobalLoading:true});rows.value=(data.providers||[]).map(p=>({locations:[],populations:[],languages:[],schools:[],...p}));pump();}catch{error.value='We couldn’t load the provider directory.';}finally{loading.value=false;}}
function profileUrl(p){return p.agencySlug==='itsco'?`https://www.itsco.health/providers?provider=${p.id}`:`/${encodeURIComponent(p.agencySlug)}/provider/${p.id}?serviceType=${p.service}`;}
function guard(e){if(props.preview){e.preventDefault();notice.value='Open the published site to contact a provider.';}}
onMounted(load);onBeforeUnmount(()=>{disposed=true;});
</script>
<style scoped>
.range-network-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.range-provider-card{display:flex;flex-direction:column;gap:15px;margin-bottom:0}.range-provider-overview h3{font-size:21px}.range-provider-overview{gap:14px}.range-avatar{width:85px;height:110px}.range-tenant-brand{display:flex;align-items:center;gap:12px;border-bottom:1px solid #dce8df;padding-bottom:14px}.range-tenant-brand img{width:48px;height:48px;object-fit:contain}.range-tenant-brand span{display:block;font-size:12px}.range-network-bio{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:14px}.range-network-formats{display:flex;gap:10px;flex-wrap:wrap;font-size:12px}.range-network-formats span{display:inline-flex;align-items:center;gap:6px}.range-network-formats svg{width:18px;height:18px}.range-network-opening{border-top:1px solid #dce8df;padding-top:16px;margin-top:auto}.range-network-opening p{margin:6px 0;font-size:14px}.range-network-grid+button{margin:24px auto}.range-tags{display:flex;gap:5px;flex-wrap:wrap}.range-tags span{font-size:12px;border-radius:16px;background:#edf5ef;padding:5px 9px}.range-finder>.range-muted{margin-top:15px}.range-finder details p{font-size:13px}.range-finder summary{cursor:pointer;font-size:14px}@media(max-width:1100px){.range-network-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.range-network-grid{grid-template-columns:1fr}.range-network-grid .range-provider-overview{gap:16px}}
</style>
