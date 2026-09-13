<template>
 <section class="range-finder" aria-label="Find providers">
  <div class="range-finder-tools">
   <label class="range-search">Search the network<input v-model="search" type="search" placeholder="Name, specialty, subject, or organization…"/></label>
   <label>Service<select v-model="service"><option value="">All services</option><option v-for="[key,label] in services" :key="key" :value="key">{{label}}</option></select></label>
   <label>Organization<select v-model="agency"><option value="">All organizations</option><option v-for="p in agencies" :key="p.id" :value="String(p.id)">{{p.name}}</option></select></label>
   <label>Organization location<select v-model="location"><option value="">All locations</option><option v-for="l in locations" :key="l">{{l}}</option></select></label>
   <label>Age / grade<select v-model="age"><option value="">All ages / grades</option><option v-for="a in ages" :key="a">{{a}}</option></select></label>
   <label>Insurance<select v-model="insurance"><option value="">Any / self-pay</option><option v-for="i in insurances" :key="i">{{i}}</option></select></label>
   <label>Accepting new clients<select v-model="accepting"><option value="">All providers</option><option value="yes">Accepting</option></select></label>
   <button type="button" class="range-button" :disabled="checkingAll" @click="checkAll">{{checkingAll?'Checking openings…':'Search by availability'}}</button>
   <button type="button" class="range-outline" @click="clear">Clear filters</button>
  </div>
  <p v-if="loading" role="status">Loading published providers…</p>
  <div v-else-if="error" role="alert"><p>{{error}}</p><button class="range-button" @click="load">Try again</button></div>
  <template v-else>
   <div class="range-results-heading"><h2>{{grouped.length}} provider{{grouped.length===1?'':'s'}} found</h2><label>Sort by<select v-model="sort"><option value="name">Name A–Z</option><option value="accepting">Accepting first</option><option value="soonest">Earliest checked opening</option></select></label></div>
   <div class="range-directory-layout">
    <div>
     <div v-if="!grouped.length" class="range-empty"><h3>{{rows.length?'No providers match these filters.':'Provider listings are being prepared.'}}</h3><p>{{rows.length?'Try a different service or clear your filters.':'Our directory will show providers as partner organizations publish their services. You can explore our partner organizations in the meantime.'}}</p><button v-if="rows.length" class="range-outline" @click="clear">Clear filters</button><router-link v-else class="range-button" to="/p/range/network">Explore organizations →</router-link></div>
     <article v-for="p in visible" :key="p.id" :data-analytics-id="'provider-'+p.id" :data-analytics-label="p.name" class="range-provider-card">
      <div class="range-provider-overview"><img v-if="safe(p.photoUrl)" class="range-avatar" :src="safe(p.photoUrl)" :alt="p.name" loading="lazy" @error="$event.target.style.display='none'"/><div v-else class="range-initials" aria-hidden="true">{{p.name.split(' ').map(x=>x[0]).slice(0,2).join('')}}</div><div><span v-if="p.affiliations.some(a=>a.accepting===true)" class="range-badge">Accepting new clients</span><h3>{{p.name}}<small v-if="p.title">{{p.title}}</small></h3><p>{{[...new Set(p.affiliations.map(a=>label(a.service)))].join(' · ')}}</p><div class="range-tags"><span v-for="tag in [...new Set([...p.specialties,...p.subjects,...p.ages])].slice(0,6)" :key="tag">{{tag}}</span></div></div></div>
      <p v-if="p.bio" class="range-provider-bio">{{p.bio}}</p>
      <details class="range-provider-details"><summary data-analytics-kind="profile_open">View profile & availability <span>↗</span></summary>
       <section v-for="a in p.affiliations" :key="key(a)" class="range-affiliation">
        <h4>{{a.agencyName}} · {{label(a.service)}}</h4><p v-if="a.location">Organization location: {{a.location}}</p><p v-if="a.insurances.length">Listed insurance: {{a.insurances.join(', ')}}. Confirm coverage with the organization.</p><p v-if="a.ages.length">Ages / grades: {{a.ages.join(', ')}}</p><p v-if="a.bio && a.bio!==p.bio">{{a.bio}}</p>
        <div class="range-actions"><label>Session format<select v-model="formats[key(a)]"><option value="IN_PERSON">In person</option><option value="VIRTUAL">Virtual</option></select></label><button type="button" class="range-outline" :disabled="openings[key(a)]?.loading" @click="check(a)">{{openings[key(a)]?.loading?'Checking…':'Check current openings'}}</button><a class="range-button" :href="`/${encodeURIComponent(a.agencySlug)}/provider/${a.id}?serviceType=${a.service}`" @click="guard">View full profile →</a></div>
        <div v-if="openings[key(a)]" aria-live="polite"><p v-if="openings[key(a)].error">Couldn’t check openings. Please retry or contact the organization.</p><template v-else-if="!openings[key(a)].loading"><p><strong>{{openings[key(a)].format==='VIRTUAL'?'Virtual':'In-person'}} openings</strong> · Times shown in {{timezone}}</p><ul v-if="openings[key(a)].slots?.length" class="range-slot-list"><li v-for="s in openings[key(a)].slots.slice(0,6)" :key="s.startAt">{{date(s.startAt)}}</li></ul><p v-else-if="openings[key(a)].nextAvailableAt">Next published opening: {{date(openings[key(a)].nextAvailableAt)}}</p><p v-else>No openings are published for this format right now.</p><small>Availability can change. Continue to the organization to request and confirm your appointment.</small></template></div>
       </section>
      </details>
     </article>
     <nav v-if="grouped.length>8" class="range-pagination" aria-label="Provider results pages"><button class="range-outline" :disabled="pageNumber===1" @click="pageNumber--">← Previous</button><span>Page {{pageNumber}} of {{Math.ceil(grouped.length/8)}}</span><button class="range-outline" :disabled="pageNumber*8>=grouped.length" @click="pageNumber++">Next →</button></nav>
    </div>
    <aside class="range-directory-aside"><div class="range-soft-card"><Icon name="people"/><h3>A good fit starts with a conversation.</h3><p>Explore specialties and services, then check openings with the organization you choose.</p><router-link class="range-outline" to="/p/range/network">Meet our partners →</router-link></div><div class="range-soft-card"><h3>Three paths to support</h3><button v-for="[key,label] in services" :key="key" class="range-service-choice" @click="service=key">{{label}} →</button></div><p class="range-muted">The collective connects independent organizations. Each organization confirms its services, fees, insurance, and appointment availability.</p></aside>
   </div>
  </template>
  <p v-if="notice" role="status">{{notice}}</p>
 </section>
</template>
<script setup>
import { computed,onMounted,ref,watch } from 'vue';
import api from '../../services/api';
import {useRoute} from 'vue-router';
import Icon from '../rise/RiseIcon.vue';
import { publicWebsiteUrl as safe } from '../../composables/useStandalonePublicWebsite';
const props=defineProps({preview:Boolean});
const route=useRoute();
const rows=ref([]),loading=ref(true),error=ref(''),search=ref(''),service=ref(''),agency=ref(String(route.query.agency||'')),location=ref(''),age=ref(''),insurance=ref(''),accepting=ref(''),sort=ref('name'),checkingAll=ref(false),pageNumber=ref(1),formats=ref({}),openings=ref({}),notice=ref('');
const services=[['counseling','Mental health'],['tutoring','Tutoring'],['coaching','Life coaching']];
const label=k=>services.find(s=>s[0]===k)?.[1]||k;
const key=a=>`${a.agencyId}-${a.id}-${a.service}`;
const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
const date=v=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
const agencies=computed(()=>[...new Map(rows.value.map(p=>[p.agencyId,{id:p.agencyId,name:p.agencyName}])).values()]);
const locations=computed(()=>[...new Set(rows.value.map(p=>p.location).filter(Boolean))].sort());
watch(()=>route.query.agency,id=>agency.value=String(id||''));
const ages=computed(()=>[...new Set(rows.value.flatMap(p=>p.ages))].sort());
const insurances=computed(()=>[...new Set(rows.value.flatMap(p=>p.insurances))].sort());
const grouped=computed(()=>{const q=search.value.trim().toLowerCase();const filtered=rows.value.filter(p=>(!service.value||p.service===service.value)&&(!agency.value||String(p.agencyId)===agency.value)&&(!location.value||p.location===location.value)&&(!age.value||p.ages.includes(age.value))&&(!insurance.value||p.insurances.includes(insurance.value))&&(!accepting.value||p.accepting===true)&&(!q||[p.name,p.agencyName,p.bio,...p.specialties,...p.subjects].join(' ').toLowerCase().includes(q)));const map=new Map();for(const p of filtered){if(!map.has(p.id))map.set(p.id,{...p,affiliations:[]});map.get(p.id).affiliations.push(p);}return [...map.values()].sort((a,b)=>(sort.value==='soonest'?nextTime(a)-nextTime(b):0)||(sort.value==='accepting'?Number(b.affiliations.some(x=>x.accepting))-Number(a.affiliations.some(x=>x.accepting)):0)||a.name.localeCompare(b.name));});
const visible=computed(()=>grouped.value.slice((pageNumber.value-1)*8,pageNumber.value*8));
watch([search,service,agency,location,age,insurance,accepting,sort],()=>pageNumber.value=1);
function nextTime(provider){return Math.min(...provider.affiliations.map(a=>Date.parse(openings.value[key(a)]?.nextAvailableAt)||8640000000000000));}
async function checkAll(){if(props.preview){notice.value='Availability search is available on the published site.';return;}checkingAll.value=true;const queue=grouped.value.flatMap(p=>p.affiliations);await Promise.all(Array.from({length:4},async()=>{while(queue.length){await check(queue.shift());}}));sort.value='soonest';checkingAll.value=false;notice.value='Sorted by checked openings. Expand a provider to see their format and times; unconfirmed availability appears last.';}
function clear(){search.value='';service.value='';agency.value='';location.value='';age.value='';insurance.value='';accepting.value='';}
async function load(){loading.value=true;error.value='';try{const{data}=await api.get('/public/mental-range/providers',{skipAuthRedirect:true,skipGlobalLoading:true});rows.value=data.providers||[];for(const p of rows.value)formats.value[key(p)]='IN_PERSON';}catch{error.value='We couldn’t load the provider directory.';}finally{loading.value=false;}}
async function check(a){const k=key(a);openings.value[k]={loading:true};try{const{data}=await api.get(`/public/mental-range/providers/${a.agencyId}/${a.id}/availability`,{params:{service:a.service,format:formats.value[k]},skipAuthRedirect:true,skipGlobalLoading:true});openings.value[k]=data;}catch{openings.value[k]={error:true};}}
function guard(e){if(props.preview){e.preventDefault();notice.value='Open the published website to continue to booking.';}}
onMounted(load);
</script>
