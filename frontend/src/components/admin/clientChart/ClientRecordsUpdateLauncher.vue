<template>
 <section class="records-update-launcher">
  <button type="button" class="btn btn-secondary" :disabled="busy" :aria-expanded="open" @click="open=!open">Bring up to date</button>
  <div v-if="open" class="records-update-selection">
   <h4>Which areas do you want to update?</h4><p>Select only the areas you need. Insurance supports primary, secondary, or both. Contact imports let you prepare a parent’s portal account and review their access before inviting them.</p>
   <label v-for="section in sections" :key="section.key"><input v-model="selected" type="checkbox" :value="section.key" :disabled="busy" /> {{section.label}}</label>
   <p v-if="error" role="alert">{{error}}</p>
   <button type="button" class="btn btn-primary" :disabled="busy||!selected.length" @click="start">{{busy?'Opening update…':'Update selected areas'}}</button>
   <button type="button" class="btn btn-secondary" :disabled="busy" @click="open=false">Cancel</button>
  </div>
 </section>
</template>
<script setup>
import {computed,ref,watch} from 'vue';
import api from '../../../services/api';
import {CLIENT_RECORD_SECTIONS} from '../../../utils/clientRecordSections';
const props=defineProps({clientId:[Number,String],agencyId:[Number,String],accountAccess:Boolean});const emit=defineEmits(['started']);
const open=ref(false),selected=ref([]),busy=ref(false),error=ref('');let generation=0;
const sections=computed(()=>CLIENT_RECORD_SECTIONS.filter(s=>s.key!=='payer'&&(props.accountAccess||!['insurance','billingComments'].includes(s.key))));
async function start(){if(busy.value||!selected.value.length)return;const own=generation;busy.value=true;error.value='';try{
 const {data}=await api.post(`/clients/${props.clientId}/chart-import/start`,{sections:[],selectedSections:[...selected.value]},{skipGlobalLoading:true,headers:{'X-Agency-Id':String(props.agencyId)}});
 if(own!==generation)return;open.value=false;emit('started',data.progress);
 }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'The records update could not be opened. Please retry.';}finally{if(own===generation)busy.value=false;}}
watch(()=>[props.clientId,props.agencyId],()=>{generation++;open.value=false;selected.value=[];error.value='';busy.value=false;});
</script>
<style scoped>.records-update-selection{padding:16px;margin-top:12px;border:1px solid #cbd8e9;border-radius:10px;max-width:650px;background:var(--bg-primary,#fff);color:var(--text-primary,#17345c)}.records-update-selection h4{margin:0 0 8px}.records-update-selection p{line-height:1.5}.records-update-selection label{display:flex;align-items:center;gap:8px;margin:10px 0}.records-update-selection button{margin:8px 8px 0 0}.records-update-selection [role=alert]{color:#b42318}</style>
