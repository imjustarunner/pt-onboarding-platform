<template>
  <section class="aw-portal">
    <header><p class="aw-eyebrow">{{agency.name}}</p><h1>Portal</h1><p>Find a client to review portal access and activity, share documents or assessments, and open a read-only View as.</p></header>
    <nav class="portal-tools" aria-label="Portal tools"><a :href="`/${slug}/library`" target="_blank" rel="noopener">Document library ↗</a><span>Client portal overview · Documents · Assessments · Activity</span></nav>
    <form class="portal-search" @submit.prevent="searchClients"><label>Find a client<input v-model="search" type="search" placeholder="Name or initials"></label><button :disabled="loading">Search</button></form>
    <p v-if="error" role="alert">{{error}}</p><p v-if="loading" role="status">Loading clients…</p>
    <div v-if="clients.length" class="client-results"><button v-for="c in clients" :key="c.id" type="button" :aria-pressed="client?.id===c.id" @click="client=c">{{c.full_name||c.initials}} <small>Chart #{{c.id}}</small></button></div><p v-else-if="searched&&!loading">No clients match this search.</p>
    <ClientPortalOverview v-if="client" :key="client.id" :client="client" :agency="agency" :actor="actor" @share-documents="openChart('documents')" @share-assessments="openChart('assessments')" @manage-access="openChart('guardians')" />
  </section>
</template>
<script setup>
import {ref,onBeforeUnmount} from 'vue';
import api from '../services/api';
import ClientPortalOverview from '../components/clients/ClientPortalOverview.vue';
const props=defineProps({agency:Object,actor:Object,slug:String});
const search=ref(''),clients=ref([]),client=ref(null),loading=ref(false),searched=ref(false),error=ref('');let generation=0;
function openChart(tab){window.open(`/${encodeURIComponent(props.slug)}/admin/clients/${client.value.id}?tab=${tab}`,'_blank','noopener,noreferrer');}
async function searchClients(){const run=++generation;client.value=null;clients.value=[];error.value='';loading.value=true;searched.value=true;try{const {data}=await api.get('/auricwell-preview/directory',{params:{agencyId:props.agency.id,scope:['admin','support','super_admin'].includes(props.actor.role)?'practice':'mine',search:search.value,page:1}});if(run===generation)clients.value=data.clients||data.items||[];}catch(e){if(run===generation)error.value=e.response?.data?.error?.message||'Client search failed.';}finally{if(run===generation)loading.value=false;}}
onBeforeUnmount(()=>++generation);
</script>
<style scoped>
.aw-portal>header{display:block}.aw-portal>header h1{margin:12px 0}.portal-search>button{padding:12px 18px;background:#2467a7;color:white;border:0;border-radius:8px;cursor:pointer}.client-results button{padding:12px 18px;border:1px solid #bdd0e5;border-radius:8px;cursor:pointer}

.portal-tools{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin:24px 0}.portal-tools a{padding:14px 18px;background:white;border:1px solid #cbdcec;border-radius:10px;color:#173c62;text-decoration:none;font-weight:600}.portal-tools span{color:#526d89;font-size:14px}.portal-search{display:flex;gap:12px;align-items:end}.portal-search label{display:grid;gap:8px;flex:1}.portal-search input{font:inherit;padding:12px;border:1px solid #b7cbe0;border-radius:8px;width:100%;box-sizing:border-box}.client-results{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.client-results button{background:#e8f1fa!important;color:#173c62!important}.client-results [aria-pressed=true]{outline:2px solid #2467a7}.client-results small{display:block;margin-top:4px}
</style>
