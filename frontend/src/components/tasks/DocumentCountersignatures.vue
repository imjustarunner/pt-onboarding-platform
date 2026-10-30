<template>
  <section v-if="items.length || error" class="countersignatures" aria-label="Documents awaiting your countersignature">
    <header>
      <div><h2>Ready to countersign <span>{{ ready.length }}</span></h2><p>Review the signed document, then add your agency signature.</p></div>
      <button type="button" @click="load" :disabled="loading">{{ loading ? 'Refreshing…' : 'Refresh' }}</button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <ul>
      <li v-for="item in visibleReady" :key="item.id">
        <div><strong>{{ item.employeeName }}</strong><p>{{ item.title.replace(/^Countersign\s*[:—-]\s*/i, '') }}</p><small>{{ item.agencyName }} · Signed {{ signedDate(item.signedAt) }}</small></div>
        <router-link :to="signingLink(item)">Review &amp; countersign</router-link>
      </li>
    </ul>
    <button v-if="ready.length > 3" type="button" @click="expanded=!expanded">{{ expanded ? 'Show fewer' : `Show all ${ready.length} ready documents` }}</button>
    <details v-if="waiting.length"><summary>{{ waiting.length }} awaiting an employee signature or review</summary>
      <ul><li v-for="item in waiting" :key="item.id"><div><strong>{{ item.employeeName }}</strong><p>{{ item.title }}</p><small>{{ item.state==='waiting' ? 'Waiting for the employee to sign' : 'Signature record needs review' }}</small></div><router-link :to="signingLink(item)">View status</router-link></li></ul>
    </details>
  </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import {useRoute} from 'vue-router';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[String,Number],default:null}});
const route=useRoute(),items=ref([]),loading=ref(false),error=ref(''),expanded=ref(false);
const ready=computed(()=>items.value.filter(i=>i.state==='ready'));
const waiting=computed(()=>items.value.filter(i=>i.state!=='ready'));
const visibleReady=computed(()=>expanded.value?ready.value:ready.value.slice(0,3));
const signedDate=value=>value?new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value)?value:value.replace(' ','T')+'Z').toLocaleDateString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',year:'numeric'}):'—';
function signingLink(item){return {path:`${route.params.organizationSlug?'/'+route.params.organizationSlug:''}/tasks/documents/${item.documentTaskId}/sign`,query:{returnTo:route.fullPath}};}
let request=0;
async function load(){const current=++request;loading.value=true;error.value='';items.value=[];try{const {data}=await api.get('/tasks/countersignatures',{params:props.agencyId?{agencyId:props.agencyId}:{},skipGlobalLoading:true});if(current===request)items.value=data.items||[];}catch{if(current===request)error.value='Could not load countersignatures. Please refresh.';}finally{if(current===request)loading.value=false;}}
watch(()=>props.agencyId,load,{immediate:true});
</script>
<style scoped>
.countersignatures{padding:20px;border:1px solid var(--border,#d7e1db);border-radius:16px;background:var(--app-surface,#fff);margin-bottom:20px;color:var(--text-primary,#223e32)}header,li{display:flex;justify-content:space-between;gap:16px;align-items:center}h2{margin:0;font-size:20px}h2 span{display:inline-block;padding:2px 9px;border-radius:20px;background:#e3f2e9}p{margin:6px 0}small{color:var(--text-secondary,#53675c)}ul{list-style:none;margin:16px 0;padding:0}li{padding:14px 0;border-top:1px solid var(--border,#d7e1db)}li a{background:#245f46;color:white;text-decoration:none;padding:12px 16px;border-radius:9px;font-weight:600;white-space:nowrap}button{border:1px solid var(--border,#d7e1db);border-radius:8px;padding:10px 14px;cursor:pointer;background:var(--app-surface,#fff);color:inherit}summary{cursor:pointer;padding-top:12px}li div{min-width:0;overflow-wrap:anywhere}@media(max-width:600px){header{align-items:flex-start}li{align-items:stretch;flex-direction:column}li a{text-align:center;white-space:normal}.countersignatures{padding:16px}}
</style>
