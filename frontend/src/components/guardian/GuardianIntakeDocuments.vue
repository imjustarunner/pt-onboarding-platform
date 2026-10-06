<template>
  <section class="guardian-intake-docs" aria-label="Signed intake documents">
    <h3>Signed intake documents</h3>
    <p>Copies you signed for the selected child. Each guardian’s private intake answers stay separate.</p>
    <p v-if="!clientId">Select a child to view their documents.</p>
    <p v-else-if="loading" role="status">Loading documents…</p>
    <p v-else-if="error" role="alert">{{ error }}</p>
    <ul v-else-if="documents.length"><li v-for="document in documents" :key="document.id"><span>{{ document.document_template_name || 'Signed document' }}<small>{{ document.intake_link_title }}</small></span><button :disabled="downloading" @click="download(document)">Download PDF</button></li></ul>
    <p v-else>No signed intake documents are available for this child yet.</p>
  </section>
</template>
<script setup>
import {ref,watch,onUnmounted} from 'vue';
import api from '../../services/api';
const props=defineProps({clientId:[String,Number]});
const documents=ref([]),loading=ref(false),error=ref(''),downloading=ref(false);let version=0;
watch(()=>props.clientId,async id=>{const request=++version;documents.value=[];error.value='';loading.value=false;if(!id)return;loading.value=true;try{const {data}=await api.get(`/guardian-portal/clients/${id}/intake-documents`);if(request===version)documents.value=data.documents||[];}catch(e){if(request===version)error.value=e.response?.status===403?'These documents are not shared with this account. Contact your care team if you need help.':'Documents could not be loaded. Please try again.';}finally{if(request===version)loading.value=false;}},{immediate:true});
async function download(document){const request=version;downloading.value=true;error.value='';try{const {data}=await api.get(`/guardian-portal/clients/${props.clientId}/intake-documents/${document.id}/download-url`);if(request!==version)return;const url=new URL(data.url,window.location.origin);if(!['https:','http:'].includes(url.protocol))throw new Error('Invalid download');const a=window.document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.click();}catch{if(request===version)error.value='This document could not be downloaded. Please try again or contact your care team.';}finally{downloading.value=false;}}
onUnmounted(()=>{version++;});
</script>
<style scoped>
.guardian-intake-docs{padding:16px;margin-bottom:20px;border:1px solid #dce5ef;border-radius:12px;background:#fff}.guardian-intake-docs h3{margin-top:0}.guardian-intake-docs p{line-height:1.5;color:#52627a}.guardian-intake-docs ul{padding:0;list-style:none}.guardian-intake-docs li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #e2e8f0;flex-wrap:wrap}.guardian-intake-docs small{display:block;color:#64748b}.guardian-intake-docs button{padding:9px 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer}
</style>
