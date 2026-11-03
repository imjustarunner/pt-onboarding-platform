<template>
  <Teleport to="body"><div v-if="request" class="verification-overlay" @click.self="close" @keydown.esc.stop.prevent="close"><section ref="panel" class="verification-dialog" role="dialog" aria-modal="true" aria-labelledby="verification-title" tabindex="-1">
    <header><h2 id="verification-title">Verify insurance before continuing</h2><button type="button" aria-label="Close insurance verification" @click="close">Close</button></header>
    <p>{{ request.message }}</p><p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">Checking billing access…</p>
    <ClientInsuranceEditor v-if="readiness?.canVerify && !readiness.ready" :key="`${request.agencyId}-${request.clientId}`" :client-id="request.clientId" :agency-id="request.agencyId" />
    <p v-else-if="readiness && !readiness.canVerify && !readiness.ready">The billing team needs to complete verification. Your assignment or Exchange request has not been saved.</p>
    <p v-if="readiness?.ready" role="status">Coverage is verified. Close this window and retry your assignment or Exchange request.</p>
    <button type="button" :disabled="loading" @click="check">Recheck verification</button>
  </section></div></Teleport>
</template>
<script setup>
import {ref,nextTick,onMounted,onBeforeUnmount} from 'vue';
import api from '../../services/api.js';
import ClientInsuranceEditor from './ClientInsuranceEditor.vue';
const request=ref(null),readiness=ref(null),loading=ref(false),error=ref(''),panel=ref(null);let sequence=0,previousFocus=null;
async function check(){if(!request.value)return;const current=++sequence;loading.value=true;error.value='';readiness.value=null;try{const {data}=await api.get(`/clients/${request.value.clientId}/coverage-readiness`,{skipGlobalLoading:true});if(current===sequence)readiness.value=data;}catch(e){if(current===sequence)error.value=e.response?.data?.error?.message||'Verification status could not be checked.';}finally{if(current===sequence)loading.value=false;}}
function close(){sequence++;request.value=null;readiness.value=null;loading.value=false;if(previousFocus?.isConnected)previousFocus.focus();}
async function open(event){const data=event.detail;if(![data?.clientId,data?.agencyId].every(value=>Number.isSafeInteger(Number(value))&&Number(value)>0))return;previousFocus=document.activeElement;request.value={clientId:Number(data.clientId),agencyId:Number(data.agencyId),message:String(data.message||'Coverage needs verification before this request can continue.')};readiness.value=null;check();await nextTick();panel.value?.focus();}
function trap(event){if(!request.value||event.key!=='Tab'||!panel.value)return;const items=[...panel.value?.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.offsetParent!==null);if(!items.length){event.preventDefault();return;}if(event.shiftKey&&(document.activeElement===items[0]||document.activeElement===panel.value)){event.preventDefault();items.at(-1).focus();}else if(!event.shiftKey&&(document.activeElement===items.at(-1)||document.activeElement===panel.value)){event.preventDefault();items[0].focus();}}
onMounted(()=>{window.addEventListener('pt:insurance-verification-required',open);window.addEventListener('keydown',trap);});onBeforeUnmount(()=>{sequence++;window.removeEventListener('pt:insurance-verification-required',open);window.removeEventListener('keydown',trap);});
</script>
<style scoped>.verification-overlay{position:fixed;inset:0;background:#16324888;z-index:13000;display:flex;align-items:center;justify-content:center;padding:20px}.verification-dialog{background:var(--bg-primary,#fff);color:var(--text-primary,#172b4d);border-radius:16px;padding:24px;max-width:900px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px #0004}.verification-dialog header{display:flex;justify-content:space-between;gap:16px}.verification-dialog h2{margin:0}.verification-dialog button{padding:10px;border:1px solid #b4c9d8;background:var(--bg-primary,#fff);color:inherit;border-radius:8px}.verification-dialog [role=alert]{color:#a32332}</style>
