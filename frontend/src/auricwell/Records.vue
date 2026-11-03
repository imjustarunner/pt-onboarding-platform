<template>
  <section class="aw-records aw-agenda">
    <header><div><p class="aw-eyebrow">{{ agency.name }}</p><h1>{{ title }}</h1><p class="aw-caption">{{ section==='appointments' ? 'Agenda · a read-only view of saved schedule records' : section==='clients' ? 'Find clients within your permitted caseloads' : 'Practice directory · active providers first' }}</p></div><div class="aw-record-actions"><RouterLink v-if="section==='appointments'" class="aw-schedule-link" :to="scheduleLink(slug,workspace.actorId,{},start)">Open My Schedule</RouterLink><button type="button" @click="refresh" :disabled="loading">Refresh</button></div></header>
    <form class="aw-filters" :class="{'aw-filters-open':filtersOpen}" @submit.prevent="apply()" aria-label="Search and filter records">
      <template v-if="section!=='providers'">
        <label>Show<select v-model="scope" @change="providerId='';apply()"><option v-for="s in workspace.scopes" :key="s" :value="s">{{ scopeLabels[s] }}</option></select></label>
        <label v-if="scope!=='mine'">Provider<select v-model="providerId" @change="apply()"><option value="">{{ scope==='supervisees' ? 'All my supervisees' : 'All permitted providers' }}</option><option v-for="p in scopedProviders" :key="p.id" :value="String(p.id)">{{ p.name }}{{ p.active?'':' · inactive' }}</option></select></label>
      </template>
      <label class="aw-record-search">{{ section==='appointments'?'Search agenda':section==='clients'?'Find a client':'Find a provider' }}<input v-model="search" type="search" :placeholder="section==='appointments'?'Client, provider, location, or event':section==='clients'?'Name or initials':'Name or credential'"></label>
      <template v-if="section==='appointments'">
        <button type="button" class="aw-filter-toggle" :aria-expanded="filtersOpen" @click="filtersOpen=!filtersOpen">{{ filtersOpen?'Hide extra filters':'Dates, type & sort' }}</button>
        <label class="aw-advanced-control">From<input v-model="start" type="date" required></label><label class="aw-advanced-control">Through<input v-model="through" type="date" :min="start" required></label>
        <label class="aw-advanced-control">Type<select v-model="kind" @change="apply()"><option value="all">All types</option><option value="appointment">Appointments</option><option value="school">School plans</option><option value="supervision">Supervision</option><option value="block">Schedule blocks</option></select></label>
        <label class="aw-advanced-control">Status<select v-model="status" @change="apply()"><option value="all">All statuses</option><option value="active">Not canceled</option><option value="canceled">Canceled</option></select></label>
      </template>
      <label v-if="section==='providers'">Status<select v-model="history" @change="apply()"><option value="active">Active providers</option><option value="inactive">Inactive / history</option><option value="all">All providers</option></select></label>
      <label :class="{'aw-advanced-control':section==='appointments'}">Sort by<select v-model="sort" @change="apply()"><option :value="section==='appointments'?'date':'name'">{{ section==='appointments'?'Date and time':'Name' }}</option><template v-if="section==='appointments'"><option value="client">Client</option><option value="provider">Provider</option></template><option value="status">Status</option></select></label>
      <label :class="{'aw-advanced-control':section==='appointments'}">Order<select v-model="order" @change="apply()"><option value="asc">{{ sort==='date'?'Earliest first':'A–Z' }}</option><option value="desc">{{ sort==='date'?'Latest first':'Z–A' }}</option></select></label>
      <label v-if="section==='appointments'" class="aw-context aw-advanced-control"><input type="checkbox" v-model="context" @change="apply()"> Include meetings and schedule blocks</label>
      <button :disabled="loading">Search</button>
    </form>
    <p v-if="section==='appointments'" class="aw-caption">Manage appointments and connected calendars in My Schedule. School plans are shown separately. Times: {{ timeZone }}.</p>
    <p role="alert" v-if="error" class="aw-record-error">{{ error }} <button type="button" @click="load">Retry</button></p>
    <p v-else-if="loading" role="status">Loading {{ title.toLowerCase() }}…</p>
    <template v-else>
      <p class="aw-result-count" role="status">{{ total }} {{ section==='appointments'?'schedule records':section }}<template v-if="section==='appointments'"> · {{ start }}–{{ through }}</template>{{ section==='providers'?'':` · ${scopeLabels[scope] || scope}` }}</p>
      <p v-if="!rows.length">No records match these filters.</p>
      <ol v-else-if="section==='appointments'" class="aw-agenda-list">
        <li v-for="r in rows" :key="r.key" :class="{'aw-canceled':/cancel/i.test(r.status)}">
          <div class="aw-agenda-date"><strong>{{ displayDate(r.date) }}</strong><span>{{ agendaTime(r,timeZone) }}</span></div>
          <div class="aw-agenda-content"><span class="aw-kind">{{ kinds[r.kind] }}</span><h2>{{ r.clientName || r.title }}</h2><p v-if="r.clientName">{{ r.title }}</p><p>{{ r.providerName }}<template v-if="r.location"> · {{ r.location }}</template></p><p class="aw-agenda-status" :class="{'aw-record-error':r.attention}">{{ r.status?.replaceAll('_',' ') }}<template v-if="r.notice"> · {{ r.notice }}</template></p><p v-if="r.reason">{{ r.reason }}</p><details v-if="r.explanation"><summary>About this school plan</summary><p>{{ r.explanation }}</p></details></div>
          <RouterLink class="aw-schedule-link" :to="scheduleLink(slug,workspace.actorId,r,start)">View in My Schedule →</RouterLink>
        </li>
      </ol>
      <div v-else-if="rows.length" class="aw-table"><table><thead><tr><th>Name</th><th>{{ section==='providers'?'Credential':'Status' }}</th><th>{{ section==='providers'?'Status / schedule':'Documentation' }}</th></tr></thead><tbody><tr v-for="r in rows" :key="r.id"><td><button v-if="section==='providers'" type="button" @click="selectedProvider=r">{{ r.name }}</button><template v-else>{{ r.full_name||r.initials||`Client #${r.id}` }}</template></td><td>{{ section==='providers'?r.credential||'Credential not recorded':r.status_label||r.status?.replaceAll('_',' ') }}</td><td><template v-if="section==='providers'"><span>{{ r.active?'Active':'Inactive · history' }}</span><RouterLink v-if="r.canViewSchedule" :to="agendaLink(r.id)">View agenda →</RouterLink></template><RouterLink v-else :to="{path:`/${slug}/clients`,query:{clientId:String(r.id)}}">Open chart →</RouterLink></td></tr></tbody></table></div>
      <nav v-if="section!=='providers' && total>0" class="aw-pagination" aria-label="Results pages"><button :disabled="page===1" @click="apply(page-1)">Previous</button><span>Page {{ page }} of {{ Math.max(1,Math.ceil(total/50)) }}</span><button :disabled="page*50>=total" @click="apply(page+1)">Next</button></nav>
    </template>
    <section v-if="section==='providers' && selectedProvider" class="aw-provider-profile" aria-label="Provider profile"><div><h2>{{ selectedProvider.name }}</h2><p>{{ selectedProvider.credential || 'Credential not recorded' }}</p><p>{{ selectedProvider.active?'Active':'Inactive · historical attribution' }}</p><RouterLink v-if="selectedProvider.canViewSchedule" :to="agendaLink(selectedProvider.id)">View provider agenda →</RouterLink></div><button type="button" @click="selectedProvider=null">Close profile</button></section>
    <p v-if="section==='providers'" class="aw-caption">Credentials are shown as recorded. Inactive providers remain available for historical attribution.</p>
  </section>
</template>
<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import api from '../services/api';
import {useAuthStore} from '../store/auth';
import {dayKey,shiftDay} from './workspace';
import {agendaTime,scheduleLink,providerRows} from './agenda';
const props=defineProps({section:String,agency:Object,slug:String});
const route=useRoute(),router=useRouter(),auth=useAuthStore();
const selectedProvider=ref(null),filtersOpen=ref(false);
const workspace=ref({actorId:auth.user?.id,scopes:['mine'],providers:[]});
const scopeLabels={mine:'Mine',supervisees:'My supervisees',practice:'Practice'},kinds={appointment:'Appointment',school:'School plan',supervision:'Supervision',block:'Schedule block'};
const title=computed(()=>({appointments:'My Schedule',clients:'Clients',providers:'Providers'}[props.section]));
const timeZone=ref(auth.user?.timezone||'America/Denver'),scope=ref('mine'),providerId=ref(''),search=ref(''),start=ref(''),through=ref(''),kind=ref('all'),status=ref('all'),sort=ref('date'),order=ref('asc'),context=ref(true),history=ref('active'),page=ref(1),rows=ref([]),total=ref(0),loading=ref(false),error=ref('');
const scopedProviders=computed(()=>workspace.value.providers.filter(p=>scope.value==='practice'||p.supervisee));
let generation=0;
function readQuery(){selectedProvider.value=null;const q=route.query;scope.value=String(q.scope||'mine');providerId.value=String(q.providerId||'');search.value=String(q.search||'');start.value=String(q.start||dayKey(new Date(),timeZone.value));through.value=String(q.through||shiftDay(start.value,6));kind.value=String(q.kind||'all');status.value=String(q.status||'all');sort.value=String(q.sort||(props.section==='appointments'?'date':'name'));order.value=String(q.order||'asc');context.value=q.context!=='false';history.value=String(q.history||'active');page.value=Math.max(1,parseInt(q.page,10)||1);}
const displayDate=date=>new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
function query(nextPage=1){return {scope:scope.value,providerId:providerId.value,search:search.value,start:start.value,through:through.value,kind:kind.value,status:status.value,sort:sort.value,order:order.value,context:String(context.value),history:history.value,page:String(nextPage)};}
function apply(nextPage=1){const q=query(nextPage);if(JSON.stringify(q)===JSON.stringify(route.query)){load();return;}router.push({query:q});}
function agendaLink(id){const p=workspace.value.providers.find(p=>Number(p.id)===Number(id));const nextScope=Number(id)===Number(workspace.value.actorId)?'mine':p?.supervisee?'supervisees':'practice';const path=String(route.path).replace(/\/providers$/,'/appointments');return {path,query:{scope:nextScope,providerId:String(id)}};}
async function load(){const run=++generation;rows.value=[];total.value=0;error.value='';loading.value=true;
 try{if(props.section==='providers'){const filtered=providerRows(workspace.value.providers,{search:search.value,sort:sort.value,order:order.value,history:history.value});rows.value=filtered;total.value=filtered.length;return;}
  const params={agencyId:props.agency.id,...query(page.value)};if(props.section==='appointments'){params.end=shiftDay(through.value,1);}
  const {data}=await api.get(`/auricwell-preview/${props.section==='appointments'?'agenda':'directory'}`,{params,skipGlobalLoading:true});if(run!==generation)return;
  rows.value=data.items||data.clients||[];total.value=Number(data.total)||0;if(data.timeZone)timeZone.value=data.timeZone;
 }catch(e){if(run===generation)error.value=e.response?.data?.error?.message||e.response?.data?.message||e.message;}finally{if(run===generation)loading.value=false;}}
async function refresh(){const run=++generation;rows.value=[];total.value=0;error.value='';loading.value=true;
 try{const {data}=await api.get('/auricwell-preview/workspace-scope',{params:{agencyId:props.agency.id},skipGlobalLoading:true});if(run!==generation)return;workspace.value=data;await load();}catch(e){if(run===generation){error.value=e.response?.data?.error?.message||e.message;loading.value=false;}}}
watch(()=>[props.agency.id,props.section],()=>{readQuery();refresh();},{immediate:true});
watch(()=>route.query,()=>{readQuery();load();});onBeforeUnmount(()=>{generation++;});
</script>
<style scoped>
.aw-filter-toggle{display:none}.aw-records header,.aw-record-actions{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.aw-records header h1{margin-bottom:8px}.aw-record-actions{justify-content:flex-start}.aw-filters{display:flex;align-items:end;gap:14px;flex-wrap:wrap;margin:24px 0;padding:20px;border:1px solid #dbe4ef;border-radius:14px;background:#fff}.aw-filters label{display:flex;gap:7px;flex-direction:column;font-size:14px;font-weight:600;color:#344d68;min-width:130px}.aw-filters .aw-record-search{flex:1 1 230px}.aw-filters input,.aw-filters select{font:inherit;min-height:42px;max-width:100%;border:1px solid #b8c9da;border-radius:8px;padding:9px;color:#17324d;background:#fff}.aw-filters .aw-context{flex-direction:row;align-items:center;min-width:220px}.aw-context input{min-height:18px;width:18px}.aw-schedule-link{display:inline-block;font-size:14px;font-weight:600;padding:10px 12px;border:1px solid #b7cde1;border-radius:8px;white-space:normal;text-decoration:none;color:#175e9a;background:#f5faff}.aw-caption{color:#546b82;line-height:1.6}.aw-result-count{font-size:14px;font-weight:600}.aw-agenda-list{list-style:none;padding:0;margin:14px 0}.aw-agenda-list li{display:flex;gap:24px;align-items:start;padding:22px 18px;border:1px solid #dce5ee;border-left:4px solid #2674ad;border-radius:12px;background:#fff;margin-bottom:12px}.aw-agenda-date{display:flex;flex-direction:column;gap:7px;min-width:160px;font-size:14px}.aw-agenda-content{flex:1;min-width:0;overflow-wrap:anywhere}.aw-agenda-content h2{font-size:19px;margin:8px 0}.aw-agenda-content p{margin:6px 0;font-size:14px}.aw-kind{font-size:12px;font-weight:700;color:#175e9a;background:#eaf3ff;padding:4px 8px;border-radius:6px}.aw-agenda-status{text-transform:capitalize;font-weight:600}.aw-agenda-list .aw-canceled{border-left-color:#a84640;background:#fffafa}.aw-record-error{color:#a12d32}.aw-table td:last-child a{margin-left:12px}.aw-pagination{display:flex;align-items:center;justify-content:center;gap:16px;margin:24px 0}.aw-agenda-list summary{font-size:13px;cursor:pointer;color:#345674}@media(max-width:700px){.aw-filters .aw-filter-toggle{display:block;background:#edf4fb;color:#175e9a!important}.aw-filters:not(.aw-filters-open) .aw-advanced-control{display:none}.aw-agenda-list li{flex-direction:column;gap:14px}.aw-agenda-date{flex-direction:row;flex-wrap:wrap;gap:12px}.aw-filters{padding:14px;gap:12px}.aw-filters label{flex:1 1 130px;min-width:0}.aw-filters .aw-record-search{flex-basis:100%}.aw-filters button{width:100%}.aw-table{overflow-x:auto}.aw-schedule-link{min-height:40px;box-sizing:border-box}}
</style>
