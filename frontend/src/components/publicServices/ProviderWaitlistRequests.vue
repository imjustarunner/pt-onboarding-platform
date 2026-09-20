<template>
 <section class="card provider-waitlist"><h2>Provider waitlist requests</h2><p>Requests appear in the order received. Open the conversation to contact the visitor; close it when they are placed or withdraw.</p><button @click="load" :disabled="loading">Refresh waitlist</button><p v-if="error" role="alert">{{error}}</p><p v-else-if="loading">Loading requests…</p><p v-else-if="!requests.length">No active waitlist requests.</p><article v-for="r in requests" :key="r.id"><div><strong>{{r.providerName}}</strong><p>{{r.serviceType}} · {{r.format==='IN_PERSON'?'In person':r.format==='VIRTUAL'?'Virtual':'School-based'}} · {{new Date(r.created_at).toLocaleString()}}</p></div><router-link :to="{path:'/admin/support-tickets',query:{ticketId:r.id}}">Open conversation #{{r.id}} →</router-link></article></section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencySlug:{type:String,required:true}});
const requests=ref([]),error=ref(''),loading=ref(false);let generation=0;
async function load(){const id=++generation;loading.value=true;error.value='';try{const {data}=await api.get(`/public/agency-services/${encodeURIComponent(props.agencySlug)}/provider-waitlist`);if(id===generation)requests.value=data.requests||[];}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Waitlist requests could not be loaded.';}finally{if(id===generation)loading.value=false;}}
watch(()=>props.agencySlug,load,{immediate:true});
</script>
<style scoped>
.provider-waitlist article{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:16px 0;border-top:1px solid #dde8e2}.provider-waitlist article>div{flex:1;min-width:220px}.provider-waitlist button{padding:10px;border:1px solid #bccfc5;border-radius:8px;background:white;color:#1c4939}
</style>
