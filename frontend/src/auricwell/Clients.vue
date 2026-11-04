<template>
 <section class="aw-clients">
  <header><div><p class="aw-eyebrow">Your caseload</p><h1>Clients</h1><p>All clients assigned to you, across agencies. Hover for Quick look or pin a preview.</p></div><button v-if="canManage" @click="duplicatesOpen=true">Review duplicates in {{agency.name}}</button></header>
  <nav class="client-scope"><button :aria-pressed="scope==='mine'" @click="setScope('mine')">My clients · All agencies</button><button v-if="canManage" :aria-pressed="scope==='practice'" @click="setScope('practice')">{{agency.name}} clients</button></nav>
  <template v-if="scope==='mine'">
   <form @submit.prevent="apply()"><label class="client-search">Find a client<input v-model="search" type="search" placeholder="Name, initials, agency or affiliation"></label><label>Agency<select aria-label="Agency" v-model="filterAgencyId" @change="apply()"><option value="all">All assigned agencies</option><option v-for="org in agencies" :key="org.id" :value="String(org.id)">{{org.name}} ({{org.client_count}})</option></select></label><label>Sort by<select aria-label="Sort by" v-model="sort" @change="apply()"><option value="name">Name</option><option value="agency">Agency</option><option value="status">Status</option></select></label><label>Order<select aria-label="Order" v-model="order" @change="apply()"><option value="asc">A–Z</option><option value="desc">Z–A</option></select></label><button>Search</button></form>
   <p v-if="loading" role="status">Loading assigned clients…</p><p v-else-if="error" role="alert">{{error}} <button @click="load">Try again</button></p>
   <template v-else><p role="status">{{total}} assigned {{total===1?'client':'clients'}} · {{filterAgencyId==='all'?'All agencies':agencies.find(a=>String(a.id)===filterAgencyId)?.name}}</p><ClientDirectoryTable v-if="clients.length" :clients="clients" :chart-link="chartLink" :time-zone="actor.timezone||'America/Denver'" @preview="scheduleQuickView" @leave="cancelQuickView" @pin="pinClientPanel"/><p v-else>No assigned clients match these filters.</p><nav v-if="total>50" class="client-pages" aria-label="Client result pages"><button :disabled="page===1" @click="apply(page-1)">Previous</button><span>Page {{page}} of {{Math.ceil(total/50)}}</span><button :disabled="page*50>=total" @click="apply(page+1)">Next</button></nav></template>
  </template>
  <Records v-else section="clients" :agency="agency" :slug="slug"/>
  <ClientQuickLook :client="quickViewClient" :pinned="quickViewPinned" :presentation="presentation" @enter="cancelQuickViewClose" @leave="scheduleQuickViewClose" @close="closeClientPanel" @open="openChart"><template #extra="{client}"><ClientCareSnapshot :client="client" :snapshot="care" :loading="careLoading" :error="careError" :time-zone="actor.timezone||'America/Denver'"/><div class="preview-agency"><OrganizationBadge :name="client.agency_name" :icon="client.agency_icon"/><div v-for="org in client.affiliations||[]" :key="org.id"><OrganizationBadge :name="org.name" :icon="org.icon_file_path"/></div></div></template></ClientQuickLook>
  <IdentityReviewDrawer v-if="duplicatesOpen" persona="clients" mode="duplicates" :agency-id="agency.id" @close="duplicatesOpen=false" @changed="load" />
 </section>
</template>
<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import api from '../services/api';
import Records from './Records.vue';
import ClientDirectoryTable from '../components/clients/ClientDirectoryTable.vue';
import ClientCareSnapshot from '../components/clients/ClientCareSnapshot.vue';
import ClientQuickLook from '../components/clients/ClientQuickLook.vue';
import OrganizationBadge from '../components/clients/OrganizationBadge.vue';
import IdentityReviewDrawer from '../components/admin/IdentityReviewDrawer.vue';
import {useClientQuickLook} from '../composables/useClientQuickLook';
const props=defineProps({agency:Object,actor:Object,slug:String});const route=useRoute(),router=useRouter();
const canManage=computed(()=>['admin','support','super_admin'].includes(props.actor.role));
const scope=computed(()=>route.query.scope==='practice'&&canManage.value?'practice':'mine');
const search=ref(''),filterAgencyId=ref('all'),sort=ref('name'),order=ref('asc'),page=ref(1),clients=ref([]),agencies=ref([]),total=ref(0),loading=ref(false),error=ref(''),duplicatesOpen=ref(false);let generation=0;
const {quickViewClient,quickViewPinned,scheduleQuickView,cancelQuickView,pinClientPanel,closeClientPanel,cancelQuickViewClose,scheduleQuickViewClose}=useClientQuickLook();
const chartLink=c=>({path:`/${c.agency_slug||props.slug}/clients`,query:{clientId:String(c.id)}});
function openChart(client){closeClientPanel();router.push(chartLink(client));}
function setScope(value){router.push({query:{scope:value}});}
function apply(nextPage=1){const query={scope:'mine',search:search.value,filterAgencyId:filterAgencyId.value,sort:sort.value,order:order.value,page:String(nextPage)};if(JSON.stringify(query)===JSON.stringify(route.query))load();else router.push({query});}
async function load(){const run=++generation;closeClientPanel();clients.value=[];total.value=0;error.value='';loading.value=true;try{const {data}=await api.get('/auricwell-preview/my-clients',{params:{search:search.value,filterAgencyId:filterAgencyId.value,sort:sort.value,order:order.value,page:page.value}});if(run===generation){clients.value=data.clients;agencies.value=data.agencies;total.value=data.total;}}catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'Could not load assigned clients.';}finally{if(run===generation)loading.value=false;}}
watch(()=>[props.actor.id,props.agency.id,route.query],()=>{++generation;closeClientPanel();clients.value=[];search.value=String(route.query.search||'');filterAgencyId.value=String(route.query.filterAgencyId||'all');sort.value=String(route.query.sort||'name');order.value=String(route.query.order||'asc');page.value=Math.max(1,parseInt(route.query.page,10)||1);if(scope.value==='mine')load();},{immediate:true});
const care=ref(null),careLoading=ref(false),careError=ref('');let careRequest=0;
watch(()=>quickViewClient.value?.id,async id=>{
 const request=++careRequest;care.value=null;careError.value='';careLoading.value=!!id;if(!id)return;
 try{const {data}=await api.get(`/auricwell-preview/my-clients/${id}/preview`);if(request===careRequest)care.value=data;}
 catch(e){if(request===careRequest)careError.value=e.response?.status===403?'Care summary is not available to your account for this agency.':'Could not load the care summary. Reopen the preview to try again.';}
 finally{if(request===careRequest)careLoading.value=false;}
});
onBeforeUnmount(()=>{++generation;++careRequest;});
const presentation={getInitialsStyle:()=>({background:'#2467a7'}),getClientDisplay:c=>c.initials||String(c.full_name||'').split(/\s+/).map(n=>n[0]).slice(0,2).join(''),getStatusPillStyle:()=>({background:'#edf5ff',color:'#205780'}),formatClientStatus:c=>c.status_label||c.status||'Not recorded',affiliationDisplayLabel:c=>[c.agency_name,...(c.affiliations||[]).map(o=>o.name)].filter(Boolean).join(' · '),formatDate:value=>value?new Date(value).toLocaleDateString('en-US'):'—',getDocumentStatusTone:()=> 'neutral',getDocumentStatusIcon:()=> '▤',formatDocumentStatusSummary:c=>c.paperwork_status_label||'Not recorded',roiExpiryClass:()=>''};
</script>
<style scoped>
.aw-clients{color:#233b57}.aw-clients>header{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}.aw-clients h1{margin:8px 0 16px}.aw-clients p{color:#60768e}.aw-clients button{font:inherit;padding:10px 14px;border:1px solid #bfd0e3;border-radius:8px;background:#f2f7fe;color:#235888;cursor:pointer}.aw-clients button:disabled{opacity:.5}.client-scope{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0}.client-scope [aria-pressed=true]{background:#2467a7;color:white;border-color:#2467a7}.aw-clients form{display:flex;gap:14px;align-items:end;flex-wrap:wrap;margin:20px 0;padding:18px;background:white;border:1px solid #dce6f2;border-radius:12px}.aw-clients label{display:grid;gap:7px;color:#435c78;font-size:13px}.client-search{flex:1;min-width:200px}input,select{font:inherit;padding:10px;border:1px solid #bfd0e3;border-radius:7px;min-height:40px}.client-pages{display:flex;justify-content:center;align-items:center;gap:18px;margin:22px 0}.preview-agency{padding:18px 0}.preview-agency>div{margin-top:8px}@media(max-width:600px){.aw-clients form>label{flex:1;min-width:130px}.client-search{flex-basis:100%!important}.aw-clients>header>button{font-size:12px}}
</style>
