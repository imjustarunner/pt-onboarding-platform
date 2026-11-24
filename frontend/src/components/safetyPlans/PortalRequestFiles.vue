<template>
  <section v-if="files.length || error" aria-label="Shared files">
    <h4>Shared files</h4>
    <p v-if="error" role="alert">{{ error }}</p>
    <ul>
      <li v-for="file in files" :key="file.id">
        <span>{{ file.document.title }} · {{ file.completed?'Completed':file.action==='sign'?'Review and sign':'Shared copy' }}</span>
        <button type="button" class="btn btn-secondary btn-sm" @click="open(file)">Open PDF</button>
      </li>
    </ul>
    <SafetyPlanSigning v-if="selected && selected.action==='sign' && !selected.completed" :key="selected.id"
      :plan="{version:selected.version,template:{title:selected.document.title}}" :signer="{}" :submit-handler="submit"
      portal @cancel="selected=null" @signed="signed" />
  </section>
</template>
<script setup>
import {inject,ref,watch} from 'vue';
import liveApi from '../../services/api';
import SafetyPlanSigning from './SafetyPlanSigning.vue';
const api=inject('clinicalFormsHttp',liveApi);
const props=defineProps({clientId:[Number,String]});
const files=ref([]),selected=ref(null),error=ref('');
let generation=0;
const base='/portal/clinical-document-requests';
async function load(){
  const own=++generation;
  try{
    const {data}=await api.get(base+'/clients/'+props.clientId+'/files',{skipGlobalLoading:true});
    if(own===generation)files.value=data?.files||[];
  }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Shared files could not be loaded.';}
}
async function open(file){
  selected.value=null;error.value='';
  try{
    const {data}=await api.get(base+'/files/'+file.id,{responseType:'blob'});
    const url=URL.createObjectURL(data);
    const link=document.createElement('a');
    link.href=url;link.download='document.pdf';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    selected.value=file;
  }catch(e){error.value=e.response?.data?.error?.message||'The file could not be opened.';}
}
const submit=payload=>api.post(base+'/files/'+selected.value.id+'/submit',payload);
async function signed(){selected.value=null;await load();}
watch(()=>props.clientId,()=>{files.value=[];selected.value=null;error.value='';load();},{immediate:true});
</script>
<style scoped>
ul{list-style:none;padding:0}li{display:flex;gap:.65rem;align-items:center;margin:.45rem 0}[role=alert]{color:#932d23}
</style>
