<template>
  <section v-if="consent && (isProvider || consent.requested)" class="consent-panel">
    <template v-if="isProvider"><label><input type="checkbox" :checked="consent.requested" @change="request($event)">Request optional audio recording and transcription</label><p>Without a signed waiver, this session continues without recording. A signed waiver stays in the client’s file for future sessions.</p><select v-if="!consent.onFile" v-model="templateId"><option value="">Choose the client’s audio recording waiver</option><option v-for="t in consent.templates" :key="t.id" :value="t.id">{{t.name}}</option></select><p v-if="!consent.templates.length && !consent.onFile">Add an audio recording consent template to this agency’s document library first.</p></template>
    <p v-if="consent.onFile">Signed recording consent is on file. <button type="button" @click="withdraw">Withdraw recording consent</button></p>
    <form v-else-if="consent.requested && consent.agreement && !isProvider" @submit.prevent="sign">
      <h3>Optional audio recording consent</h3><p>You can attend without signing. Recording stays off until consent is signed.</p>
      <button v-if="consent.agreement.templateType === 'pdf'" type="button" @click="preview">Open the consent document</button>
      <iframe :src="pdfUrl || undefined" :srcdoc="pdfUrl?undefined:consent.agreement.html" sandbox="" title="Audio recording consent" />
      <label>Your full name<input v-model="signerName" autocomplete="name" required maxlength="255"></label>
      <label>I am signing as<select v-model="relationship"><option value="self">The client</option><option value="parent">Parent</option><option value="legal_guardian">Legal guardian</option></select></label>
      <label v-if="relationship !== 'self'"><input v-model="guardianAuthority" type="checkbox" required>I have legal authority to consent for this client.</label>
      <label><input v-model="accepted" type="checkbox" required>I have read this consent and agree to sign it electronically.</label>
      <AdaptiveSignatureCapture v-model="signatureData" />
      <button class="btn btn-primary" :disabled="busy || !signatureData || !accepted || (consent.agreement.templateType === 'pdf' && !pdfUrl)">{{busy?'Saving signed consent…':'Sign and save to client file'}}</button>
    </form>
    <p v-if="error" role="alert">{{error}}</p>
  </section>
</template>
<script setup>
import{ref,onMounted,onBeforeUnmount}from'vue';import api from '../../services/api';import AdaptiveSignatureCapture from '../adaptive-intake/AdaptiveSignatureCapture.vue';
const props=defineProps({baseUrl:{type:String,required:true},isProvider:Boolean});const consent=ref(null),templateId=ref(''),signerName=ref(''),relationship=ref('self'),guardianAuthority=ref(false),accepted=ref(false),signatureData=ref(''),busy=ref(false),error=ref(''),pdfUrl=ref('');let timer;
async function load(){try{const{data}=await api.get(`${props.baseUrl}/recording-consent`,{skipGlobalLoading:true,skipAuthRedirect:true});consent.value=data;}catch(e){error.value=e.response?.data?.error?.message||'Unable to check recording consent.';}}
async function request(event){const enabled=event.target.checked;event.target.checked=consent.value.requested;error.value='';if(enabled&&!consent.value.onFile&&!templateId.value){error.value='Choose a waiver before requesting recording.';await load();return;}try{await api.post(`${props.baseUrl}/recording-consent/request`,{enabled,templateId:templateId.value});await load();}catch(e){error.value=e.response?.data?.error?.message||'Unable to request consent.';}}
async function sign(){busy.value=true;error.value='';try{await api.post(`${props.baseUrl}/recording-consent/sign`,{documentHash:consent.value.agreement.documentHash,signerName:signerName.value,relationship:relationship.value,guardianAuthority:guardianAuthority.value,accepted:accepted.value,signatureData:signatureData.value});await load();}catch(e){error.value=e.response?.data?.error?.message||'Unable to save consent.';}finally{busy.value=false;}}
async function withdraw(){if(!window.confirm('Withdraw recording consent for this client’s current and future sessions?'))return;try{await api.post(`${props.baseUrl}/recording-consent/withdraw`);await load();}catch(e){error.value=e.response?.data?.error?.message||'Unable to withdraw consent.';}}
async function preview(){try{const{data}=await api.get(`${props.baseUrl}/recording-consent/pdf`,{responseType:'blob',skipAuthRedirect:true});if(pdfUrl.value)URL.revokeObjectURL(pdfUrl.value);pdfUrl.value=URL.createObjectURL(data);}catch{error.value='Unable to open consent PDF.';}}
onMounted(()=>{void load();timer=setInterval(load,5000);});onBeforeUnmount(()=>{clearInterval(timer);if(pdfUrl.value)URL.revokeObjectURL(pdfUrl.value);});
</script>
<style scoped>.consent-panel{background:#fff;color:#263e36;border:1px solid #c7d8cf;border-radius:12px;padding:20px;margin:12px 0}.consent-panel label{display:block;margin:12px 0}.consent-panel p{font-size:14px;line-height:1.5}.consent-panel iframe{width:100%;height:400px;border:1px solid #dce6e2}.consent-panel input:not([type=checkbox]),select{padding:10px;max-width:100%;display:block}.consent-panel [role=alert]{color:#a12727}</style>
