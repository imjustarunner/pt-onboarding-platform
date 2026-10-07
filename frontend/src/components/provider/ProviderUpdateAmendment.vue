<template>
 <section class="amendment-review">
  <p v-if="error" role="alert">{{error}}</p>
  <p v-if="loading">Loading your amendment…</p>
  <template v-else-if="amendment">
   <p v-if="amendment.draft" class="draft-note">Private draft for {{amendment.name}}. Not yet assigned for signing.</p>
   <p>Agency countersigner: <strong>{{amendment.countersignerName}}</strong>. The signed copy will remain in your profile’s My Documents.</p>
   <ul v-if="previewOnly && amendment.issues.length"><li v-for="issue in amendment.issues" :key="issue">{{issue}}</li></ul>
   <button type="button" @click="downloadAgreement">Download agreement to read or print</button>
   <iframe sandbox="" title="Your compensation amendment" :srcdoc="documentHtml" />
   <template v-if="amendment.signed">
    <p role="status">{{amendment.countersigned?'Both signatures recorded.':'Your signature is recorded. Awaiting the agency countersignature.'}}</p>
    <button type="button" :disabled="previewOnly || busy" @click="download">Download signed copy</button>
    <button type="button" :disabled="previewOnly || busy" @click="$emit('complete',{amendmentSigned:true})">Mark amendment step complete</button>
   </template>
   <fieldset v-else :disabled="previewOnly || amendment.draft || busy">
    <legend>Electronic signature</legend>
    <p>You may read and download this agreement before signing. You can request a paper copy or a paper signing option from People Operations. Declining electronic signing does not change the agreement’s terms.</p>
    <label><input v-model="consent" type="checkbox" /> I consent to electronic records and signatures for this agreement and can access and retain this document.</label>
    <label><input v-model="intent" type="checkbox" /> I have read this agreement and intend my signature below to be legally binding.</label>
    <SignaturePad v-if="!previewOnly && !amendment.draft" @signed="signature=$event" />
    <div v-else class="signature-preview">Employee signature pad appears here when this amendment is released.</div>
    <button type="button" :disabled="!consent || !intent || !signature || busy" @click="sign">{{busy?'Saving signature…':'Sign my amendment'}}</button>
   </fieldset>
   <p v-if="previewOnly">This preview never signs, completes a task, or sends a message.</p>
  </template>
  <div v-else-if="!loading"><slot name="unassigned"><p>No amendment has been released for this update yet.</p><button class="primary" disabled>Assigned amendment signature required</button></slot></div>
 </section>
</template>
<script setup>
import {computed,onMounted,ref} from 'vue';
import api from '../../services/api';
import SignaturePad from '../SignaturePad.vue';
const props=defineProps({base:{type:String,required:true},agencyId:{type:[String,Number],required:true},previewOnly:Boolean});
const emit=defineEmits(['complete']);
const amendment=ref(null),loading=ref(false),busy=ref(false),error=ref(''),consent=ref(false),intent=ref(false),signature=ref('');
const documentHtml=computed(()=>`<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;color:#243b30;padding:24px;margin:0}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:9px;text-align:left}h1,h2,h3{color:#3e6d54}</style></head><body>${amendment.value?.html||''}</body></html>`);
function downloadAgreement(){const url=URL.createObjectURL(new Blob([documentHtml.value],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='compensation-amendment.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function load(){loading.value=true;try{amendment.value=(await api.get(`${props.base}/amendment`,{params:{agencyId:props.agencyId}})).data.amendment;}catch(e){error.value=e.response?.data?.error?.message||'Could not load your amendment.';}finally{loading.value=false;}}
async function sign(){if(props.previewOnly||amendment.value?.draft||!consent.value||!intent.value||!signature.value)return;busy.value=true;error.value='';try{
 await api.post(`${props.base}/amendment/consent`,{agencyId:props.agencyId,consent:true});
 await api.post(`${props.base}/amendment/intent`,{agencyId:props.agencyId,intent:true});
 await api.post(`${props.base}/amendment/sign`,{agencyId:props.agencyId,signatureData:signature.value});await load();
}catch(e){error.value=e.response?.data?.error?.message||'Could not save your signature. Refresh to check its status before trying again.';}finally{busy.value=false;}}
async function download(){busy.value=true;try{const {data}=await api.get(`${props.base}/amendment/download`,{params:{agencyId:props.agencyId},responseType:'blob'});const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download='signed-compensation-amendment.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{error.value='Could not download the signed copy.';}finally{busy.value=false;}}
onMounted(load);
</script>
<style scoped>
.amendment-review{display:grid;gap:16px}iframe{width:100%;height:70vh;border:1px solid #d5dfd9;border-radius:12px}fieldset{display:grid;gap:16px;padding:20px;border:1px solid #d5dfd9;border-radius:12px}label{display:flex;gap:10px;align-items:start}.signature-preview{padding:40px;border:1px dashed #789388;background:#f3f7f5}.draft-note{background:#fff5de;padding:14px;border-radius:8px}button{width:fit-content;padding:10px 16px;border-radius:8px;border:1px solid #426c54;background:#426c54;color:#fff}button:disabled{opacity:.5}
</style>
