<template>
  <section v-if="items.length || error" class="screening-work" aria-label="Screening documentation to do">
    <h4>Screening documentation to do</h4>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-for="item in items" :key="item.clinical_session_id" type="button" @click="openClinicalNote({agencyId,clientId,row:item})">
      H0002 screening · {{ item.note_status === 'draft' ? 'Draft — in progress' : 'Not started' }} · Open in Notes Workspace
    </button>
    <p>Unsigned screening work stays here until documentation is completed. Claim readiness is tracked separately.</p>
  </section>
</template>
<script setup>
import { ref, watch } from 'vue';
import api from '../../services/api';
import { useClientEncounterNote } from '../../composables/useClientEncounterNote.js';
const props = defineProps({ agencyId: Number, clientId: Number });
const items=ref([]),error=ref('');let request=0;
const {openClinicalNote}=useClientEncounterNote();
watch(()=>[props.agencyId,props.clientId],async()=>{
  const version=++request;items.value=[];error.value='';
  if(!props.agencyId||!props.clientId)return;
  try{const r=await api.get(`/billing-reports/clients/${props.clientId}/medical-record`,{params:{agencyId:props.agencyId}});if(version!==request)return;const rows=r.data?.encounters||r.data?.rows||r.data;items.value=(Array.isArray(rows)?rows:[]).filter(row=>row.note_kind==='h0002_screening'&&row.note_status!=='signed');}
  catch{if(version===request)error.value='Could not load screening work.';}
},{immediate:true});
</script>
<style scoped>
.screening-work{padding:16px;border:1px solid var(--border-color,#ccd);border-radius:10px;margin:12px 0}.screening-work button{display:block;margin:8px 0;padding:10px;cursor:pointer}.screening-work p{font-size:13px}
</style>
