<template>
  <section class="agreement-card">
    <header><div><span class="eyebrow">{{ agreement.document.agencyName }}</span><h3>Supervision agreement</h3><p>{{ agreement.document.parties.map(p => p.name).join(' · ') }}</p></div><span class="status">{{ agreement.complete ? 'Both signatures saved' : 'Signature needed' }}</span></header>
    <p>Supervisor: {{ agreement.supervisorSignedAt ? 'Signed' : 'Awaiting signature' }} · Supervisee: {{ agreement.superviseeSignedAt ? 'Signed' : 'Awaiting signature' }}</p>
    <details :open="!mySigned"><summary>Review the agreement and signatures</summary><iframe :srcdoc="agreement.html" sandbox="" title="Supervision agreement" /></details>
    <form v-if="agreement.myRole && !mySigned" @submit.prevent="sign">
      <label class="check"><input v-model="accepted" type="checkbox">I have read and agree to this document and consent to an electronic signature.</label>
      <div class="signature-tabs"><button type="button" :aria-pressed="mode === 'type'" @click="mode='type'">Type signature</button><button type="button" :aria-pressed="mode === 'draw'" @click="mode='draw'">Draw with finger or pointer</button></div>
      <label v-if="mode === 'type'">Your full name<input v-model="typedName" autocomplete="name" maxlength="255" required class="typed"></label>
      <AdaptiveSignatureCapture v-else v-model="signatureData" />
      <button class="btn btn-primary" :disabled="busy || !accepted || !(mode === 'type' ? typedName.trim() : signatureData)">{{ busy ? 'Saving signature…' : 'Sign this agreement' }}</button>
    </form>
    <button v-if="agreement.supervisorSignedAt || agreement.superviseeSignedAt" type="button" class="btn btn-secondary" @click="download">Download signed copy</button>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup>
import {computed,ref} from 'vue';
import api from '../../services/api';
import AdaptiveSignatureCapture from '../adaptive-intake/AdaptiveSignatureCapture.vue';
const props=defineProps({agreement:{type:Object,required:true},baseUrl:{type:String,default:'/supervision/agreements'},http:{type:Object,default:null}});
const emit=defineEmits(['signed']);
const accepted=ref(false),typedName=ref(''),signatureData=ref(''),mode=ref('type'),busy=ref(false),error=ref('');
const mySigned=computed(()=>props.agreement.myRole==='supervisor'?props.agreement.supervisorSignedAt:props.agreement.superviseeSignedAt);
async function sign(){busy.value=true;error.value='';try{const {data}=await (props.http||api).post(`${props.baseUrl}/${props.agreement.id}/sign`,{accepted:accepted.value,typedName:mode.value==='type'?typedName.value:null,signatureData:mode.value==='draw'?signatureData.value:null,documentHash:props.agreement.documentHash});emit('signed',data);}catch(e){error.value=e.response?.data?.error?.message||'Unable to save your signature.';}finally{busy.value=false;}}
async function download(){try{const {data}=await (props.http||api).get(`${props.baseUrl}/${props.agreement.id}/pdf`,{responseType:'blob'});const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download='supervision-agreement.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){error.value='Unable to download the agreement.';}}
</script>
<style scoped>
.agreement-card{background:#fff;border:1px solid #dce6e2;border-top:5px solid #126253;border-radius:14px;padding:24px;color:#243d38;margin:16px 0}.agreement-card header{display:flex;justify-content:space-between;gap:20px}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:1px}h3{font-size:24px;margin:8px 0}p{line-height:1.5}.status{align-self:flex-start;background:#edf5f1;padding:8px 12px;border-radius:20px;font-size:12px}.agreement-card iframe{width:100%;height:520px;border:1px solid #dce6e2;margin:16px 0}.agreement-card label{display:block;margin:16px 0}.check{display:flex!important;gap:10px}.signature-tabs{display:flex;gap:8px}.typed{display:block;width:100%;padding:12px;font:italic 26px Georgia,serif;border:1px solid #c4d4ce;border-radius:8px}.agreement-card button{margin:8px 8px 0 0}summary{cursor:pointer;font-weight:600}[role=alert]{color:#a12727}@media(max-width:600px){.agreement-card header{display:block}.agreement-card{padding:16px}}
</style>
