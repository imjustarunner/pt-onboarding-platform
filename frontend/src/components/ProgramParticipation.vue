<template>
  <section v-if="entries.length || error" aria-label="Program participation">
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="current.length"><h5>Current program participation</h5>
      <ul><li v-for="row in current" :key="row.kind + row.id">{{ row.name }}</li></ul>
    </template>
    <details v-if="past.length"><summary>Past programs and classes ({{ past.length }})</summary>
      <ul><li v-for="row in past" :key="row.kind + row.id">{{ row.name }}</li></ul>
    </details>
  </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import api from '../services/api';
const props=defineProps({clientId:Number,agencyId:Number,guardian:Boolean,refreshKey:Number});
const entries=ref([]), error=ref('');
const current=computed(()=>entries.value.filter(row=>row.period==='current'));
const past=computed(()=>entries.value.filter(row=>row.period==='past'));
watch(()=>[props.clientId,props.agencyId,props.refreshKey],async ([clientId,agencyId],_,onCleanup)=>{
  let active=true;
  onCleanup(()=>{active=false;});
  entries.value=[]; error.value='';
  if (!clientId || !agencyId) return;
  try {
    const prefix=props.guardian ? '/guardian-portal/clients' : '/clients';
    const {data}=await api.get(`${prefix}/${clientId}/program-participation`,{params:{agencyId},skipGlobalLoading:true});
    if(active) entries.value=Array.isArray(data)?data:[];
  } catch(e) { if(active && e.response?.status!==403) error.value='Program history could not be loaded.'; }
},{immediate:true});
</script>
