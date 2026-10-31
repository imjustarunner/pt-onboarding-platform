<template>
 <section class="provider-school-portals" :class="{compact}" aria-label="Schools and programs">
  <button v-if="compact" class="btn btn-secondary" type="button" @click="$emit('open')">Schools &amp; Programs</button>
  <template v-else><h2>Schools &amp; Programs</h2><p>Open a school or program assigned to you. School hours and client spots are requested from its portal or your schedule.</p></template>
  <p v-if="error" role="alert">{{error}} <button type="button" @click="load">Retry</button></p>
  <span v-else-if="loading" role="status">Loading assigned schools…</span>
  <a v-for="school in schools" :key="school.schoolOrganizationId" :href="school.href" target="_blank" rel="noopener">{{school.name}} · Open school portal ↗</a>
  <template v-if="!compact"><p v-if="!loading&&!error&&!schools.length">No active assigned schools are listed for this agency.</p><h3 v-if="programs.length">Assigned programs</h3><button v-for="program in programs" :key="program.id" type="button" class="btn btn-secondary" @click="$emit('open-program',program)">{{program.name}} · Open program portal</button></template>
 </section>
</template>
<script setup>
import {onBeforeUnmount,ref,watch} from 'vue';
import api from '../../services/api';
import {schoolCareBridgeUrl} from '../../utils/schoolCareBridge.js';
const props=defineProps({agencyId:[Number,String],userId:[Number,String],compact:Boolean,programs:{type:Array,default:()=>[]}});
defineEmits(['open','open-program']);
const schools=ref([]),loading=ref(false),error=ref('');let generation=0;
async function load(){const id=++generation;schools.value=[];error.value='';if(!props.agencyId||!props.userId)return;loading.value=true;try{
 const {data}=await api.get('/payroll/me/assigned-schools',{params:{agencyId:props.agencyId},skipGlobalLoading:true});
 if(id!==generation)return;
 schools.value=(Array.isArray(data)?data:[]).filter(s=>Number(s.schoolOrganizationId)>0&&/^[a-z0-9][a-z0-9-]*$/i.test(String(s.schoolSlug||s.slug||''))).map(s=>({...s,href:schoolCareBridgeUrl(s.schoolSlug||s.slug)}));
}catch(e){if(id===generation)error.value=e.response?.data?.error?.message||'Could not load your assigned school portals.';}finally{if(id===generation)loading.value=false;}}
watch(()=>[props.agencyId,props.userId],load,{immediate:true});onBeforeUnmount(()=>generation++);
</script>
<style scoped>
.provider-school-portals{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:16px;border:1px solid var(--border,#dce7ef);border-radius:12px;margin:10px 0 18px;background:var(--bg-card,#fff)}.provider-school-portals:not(.compact){align-items:flex-start;flex-direction:column}.provider-school-portals a{display:inline-block;padding:9px 12px;border-radius:8px;background:#eef7fc;color:#075c91;text-decoration:none;font-weight:600}.provider-school-portals a:focus-visible{outline:3px solid #007cbd;outline-offset:3px}.provider-school-portals h2,.provider-school-portals p{margin:0}
</style>
