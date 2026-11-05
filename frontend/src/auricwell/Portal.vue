<template>
  <section class="aw-portal">
    <header><p class="aw-eyebrow">{{agency.name}}</p><h1>Portal</h1><p>Find a client to review portal access and activity, share documents or assessments, and open a read-only View as.</p></header>
    <nav class="portal-tools" aria-label="Portal tools"><a :href="`/${slug}/library`" target="_blank" rel="noopener">Document library ↗</a><span>Client portal overview · Documents · Assessments · Activity</span></nav>
    <form class="portal-search" @submit.prevent="searchClients">
      <label>Find a client<input v-model="search" type="search" placeholder="Name or initials" @input="queueSearch"></label>
      <label>Practice<select v-model="practiceFilter" aria-label="Practice" @change="searchClients"><option value="all">All practices</option><option v-for="practice in practices" :key="practice.id" :value="String(practice.id)">{{practice.name}}</option></select></label>
      <label>Status<select v-model="statusFilter" aria-label="Status" @change="searchClients"><option value="all">All statuses</option><option v-for="status in statuses" :key="status" :value="status">{{status}}</option></select></label>
      <label>Sort<select v-model="sort" aria-label="Sort clients" @change="searchClients"><option value="name">Name</option><option value="practice">Practice</option><option value="status">Status</option></select></label>
      <label>Order<select v-model="order" aria-label="Client order" @change="searchClients"><option value="asc">A–Z</option><option value="desc">Z–A</option></select></label>
      <button :disabled="loading">Search</button>
    </form>
    <div class="result-tools"><p class="search-scope">{{scopeNote}}</p><div class="view-switch" role="group" aria-label="Client layout"><button type="button" :aria-pressed="clientView==='cards'" @click="clientView='cards'">Cards</button><button type="button" :aria-pressed="clientView==='list'" @click="clientView='list'">List</button></div></div>
    <p v-if="error" role="alert">{{error}}</p><p v-if="loading" role="status">Loading clients…</p>
    <p v-if="limitNote" class="limit-note">{{limitNote}}</p>
    <div v-if="clients.length" class="client-results" :class="clientView"><button v-for="c in clients" :key="c.id" type="button" :aria-pressed="client?.id===c.id" @click="client=c"><OrganizationBadge :name="c.agency_name||agency.name" :icon="c.agency_icon" /><span>{{c.full_name||c.initials}} <small>Chart #{{c.id}}<template v-if="c.status_label||c.status"> · {{c.status_label||c.status}}</template></small></span></button></div>
    <p v-else-if="searched&&!loading&&!limitNote">No clients match this search.</p>
    <p v-if="clients.length&&total>clients.length" class="search-scope">Showing {{clients.length}} of {{total}}. Search or filter to narrow the rest.</p>
    <ClientPortalOverview v-if="client" :key="client.id" :client="client" :agency="agency" :actor="actor" @share-documents="openChart('documents')" @share-assessments="openMeasures" @manage-access="openChart('guardians')" />
    <p v-if="client && !samePractice" class="other-practice">This client belongs to {{client.agency_name}}. Open that practice to assign or complete measures there. <a :href="practiceHref(client)">Open {{client.agency_name}}</a></p>
    <PortalMeasures v-else-if="client" :client="client" :agency="agency" :slug="slug" />
  </section>
</template>
<script setup>
import {computed,onMounted,ref,onBeforeUnmount} from 'vue';
import api from '../services/api';
import ClientPortalOverview from '../components/clients/ClientPortalOverview.vue';
import OrganizationBadge from '../components/clients/OrganizationBadge.vue';
import PortalMeasures from './PortalMeasures.vue';
import {auricwellAppBase} from './paths';
const props=defineProps({agency:Object,actor:Object,slug:String});
const search=ref(''),practiceFilter=ref('all'),statusFilter=ref('all'),sort=ref('name'),order=ref('asc'),clientView=ref('cards');
const clients=ref([]),practices=ref([]),statuses=ref([]),limitedBy=ref([]),total=ref(0),client=ref(null),loading=ref(false),searched=ref(false),error=ref('');
let generation=0,timer;
const broad=['admin','super_admin','support'].includes(props.actor.role);
const scopeNote=computed(()=>props.actor.role==='super_admin'?'All clients. Practice and status narrow this search.':props.actor.role==='admin'||props.actor.role==='support'?'All clients in the practices assigned to you. Filters narrow this search.':'Clients assigned to you. Filters narrow this search.');
const samePractice=computed(()=>!client.value?.agency_id||Number(client.value.agency_id)===Number(props.agency.id));
const limitNote=computed(()=>{if(!limitedBy.value.length)return '';const notes=limitedBy.value.map(item=>{if(item.key==='practice'){const name=practices.value.find(practice=>String(practice.id)===practiceFilter.value)?.name||'the selected practice';return `Practice: ${name} (${item.count} without this filter)`;}if(item.key==='status')return `Status: ${statusFilter.value} (${item.count} without this filter)`;return `Practice and Status together (${item.count} without these filters)`;});return `No clients match. Other matches are available. ${notes.length===1?'This filter is limiting the results':'These filters are limiting the results'}: ${notes.join('; ')}.`;});
function practiceHref(row){const name=row.agency_slug==='tisi'?'innerstrength':row.agency_slug||props.slug;return `${auricwellAppBase()}/${encodeURIComponent(name)}/portal`;}
function openChart(tab){window.open(`/${encodeURIComponent(props.slug)}/admin/clients/${client.value.id}?tab=${tab}`,'_blank','noopener,noreferrer');}
function openMeasures(){document.getElementById('portal-measures')?.scrollIntoView({behavior:'smooth',block:'start'});}
function queueSearch(){clearTimeout(timer);timer=setTimeout(searchClients,200);}
async function searchClients(){const term=search.value.trim();const narrowed=practiceFilter.value!=='all'||statusFilter.value!=='all';const run=++generation;error.value='';if(!term&&!narrowed){clients.value=[];limitedBy.value=[];total.value=0;searched.value=false;loading.value=true;try{const {data}=await api.get('/auricwell-preview/directory',{params:params('')});if(run===generation){practices.value=data.practices||[];statuses.value=data.statuses||[];}}catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'Client search failed.';}finally{if(run===generation)loading.value=false;}return;}loading.value=true;searched.value=true;try{const {data}=await api.get('/auricwell-preview/directory',{params:params(term)});if(run!==generation)return;clients.value=data.clients||data.items||[];practices.value=data.practices||practices.value;statuses.value=data.statuses||statuses.value;limitedBy.value=data.limitedBy||[];total.value=Number(data.total||clients.value.length);if(client.value&&!clients.value.some(row=>row.id===client.value.id))client.value=null;}catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'Client search failed.';}finally{if(run===generation)loading.value=false;}}
function params(term){return {agencyId:props.agency.id,scope:broad?'practice':'mine',search:term,page:1,filterAgencyId:practiceFilter.value,status:statusFilter.value,sort:sort.value,order:order.value};}
onMounted(searchClients);
onBeforeUnmount(()=>{++generation;clearTimeout(timer);});
</script>
<style scoped>
.aw-portal>header{display:block}.aw-portal>header h1{margin:12px 0}.portal-search>button,.view-switch button{padding:12px 18px;background:#2467a7;color:white;border:0;border-radius:8px;cursor:pointer}.client-results button{display:flex;align-items:center;gap:10px;padding:12px 18px;border:1px solid #bdd0e5;border-radius:8px;cursor:pointer;text-align:left}
.portal-tools{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin:24px 0}.portal-tools a{padding:14px 18px;background:white;border:1px solid #cbdcec;border-radius:10px;color:#173c62;text-decoration:none;font-weight:600}.portal-tools span,.search-scope,.other-practice{color:#526d89;font-size:14px}.portal-search{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.portal-search label{display:grid;gap:8px}.portal-search label:first-child{flex:1;min-width:220px}.portal-search input,.portal-search select{font:inherit;padding:12px;border:1px solid #b7cbe0;border-radius:8px;width:100%;box-sizing:border-box;background:white}.result-tools{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-top:10px}.view-switch{display:flex;gap:8px}.view-switch [aria-pressed=false]{background:white;color:#173c62;border:1px solid #bdd0e5}.client-results{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.client-results.list{display:grid}.client-results.list button{width:100%;border-radius:8px}.client-results button{background:#e8f1fa!important;color:#173c62!important}.client-results [aria-pressed=true]{outline:2px solid #2467a7}.client-results small{display:block;margin-top:4px}.limit-note{padding:12px 14px;background:#f8eed9;border-radius:8px;color:#5c4818}
</style>
