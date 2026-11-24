<template>
  <section v-if="forms.length || error" class="filed-forms" aria-label="Filed clinical records">
    <template v-if="opened">
      <button class="btn btn-secondary" type="button" @click="close">← Filed documents</button>
      <SafetyPlansPanel ref="editor" record-only :initial-record-id="opened.id" :initial-version="opened.version"
        :client-id="clientId" :agency-id="agencyId" />
    </template>
    <template v-else>
      <h4>Filed documents</h4>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="rows">
        <article v-for="form in forms" :key="form.id+':'+(form.version||form.source)">
          <span>{{ form.category }}</span><strong>{{ form.title }}</strong><span>{{ date(form.signedAt) }}</span>
          <button class="btn btn-secondary btn-sm" type="button" @click="open(form)">Open</button>
        </article>
      </div>
    </template>
  </section>
</template>
<script setup>
import {ref,watch} from 'vue';
import api from '../../../services/api';
import {downloadSignedPdf} from '../../../utils/downloadSignedPdf';
import SafetyPlansPanel from '../../safetyPlans/SafetyPlansPanel.vue';
const props=defineProps({agencyId:Number,clientId:Number});
const forms=ref([]),opened=ref(null),editor=ref(null),error=ref('');
let generation=0;
const date=value=>new Date(value).toLocaleDateString();
async function load(){
  const own=++generation;
  error.value='';
  try{
    const {data}=await api.get('/clinical-forms/filed',{params:{clientId:props.clientId}});
    if(own===generation)forms.value=data.forms||[];
  }catch(e){if(own===generation)error.value=e.response?.data?.error?.message||'Filed documents could not be loaded.';}
}
async function open(form){
  if(form.source!=='request-file'){opened.value=form;return;}
  try{
    const {data}=await api.get(`/clinical-document-requests/clients/${props.clientId}/filed-files/${form.id}`,{responseType:'blob'});
    downloadSignedPdf(data);
  }catch(e){error.value=e.response?.data?.error?.message||'The signed document could not be opened.';}
}
function close(){if(editor.value?.confirmDiscard?.()!==false){opened.value=null;load();}}
watch(()=>props.clientId,()=>{opened.value=null;forms.value=[];load();},{immediate:true});
</script>
<style scoped>
.filed-forms{margin:1rem 0}.rows article{display:grid;grid-template-columns:1.2fr 3fr 1fr auto;align-items:center;gap:.65rem;border-top:1px solid #dce4ec;padding:.65rem 0}
@media(max-width:650px){.rows article{grid-template-columns:1fr 2fr}.rows button{justify-self:start}}
</style>
