<template>
  <section class="unit-preview" aria-label="Billing unit preview">
    <h2>Unit preview</h2>
    <p>Check the configured units for a service and its actual duration. A preview creates no clinical record, charge or claim.</p>
    <p v-if="loading" role="status">Loading service codes…</p>
    <form v-else @submit.prevent="preview">
      <label>Service code <select v-model="serviceCode" :disabled="busy || !codes.length" required><option value="" disabled>Select a code</option><option v-for="code in codes" :key="code.service_code" :value="code.service_code">{{ code.service_code }}{{ code.description ? ` · ${code.description}` : '' }}</option></select></label>
      <label>Actual minutes <input v-model.number="minutes" type="number" min="0.1" step="0.1" required :disabled="busy" /></label>
      <button type="submit" :disabled="busy || !serviceCode || !validMinutes">{{ busy ? 'Checking…' : 'Preview units' }}</button>
    </form>
    <p v-if="error" class="unit-error" role="alert">{{ error }}</p>
    <div v-if="result" role="status" :class="{ 'unit-review': result.requiresReview || result.claimable === false }">
      <strong>{{ result.units }} unit(s) · {{ result.effectiveServiceCode || serviceCode }}</strong>
      <p v-if="result.requiresReview || result.claimable === false"><strong>Billing review required.</strong> {{ result.reason || 'Review the duration before preparing a claim.' }}</p>
      <p v-else>Other documentation, coverage and billing checks still apply.</p>
    </div>
  </section>
</template>
<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:[Number,String],required:true}});
const codes=ref([]),serviceCode=ref(''),minutes=ref(60),loading=ref(false),busy=ref(false),error=ref(''),result=ref(null);
const validMinutes=computed(()=>Number.isFinite(Number(minutes.value))&&Number(minutes.value)>0);
let generation=0,request=0;
onBeforeUnmount(()=>{generation++;request++;});
watch(()=>props.agencyId,async value=>{
 const current=++generation;request++;codes.value=[];serviceCode.value='';result.value=null;error.value='';busy.value=false;loading.value=false;
 const id=Number(value);if(!Number.isSafeInteger(id)||id<1)return;
 loading.value=true;
 try{const {data}=await api.get('/medical-billing/service-codes',{params:{agencyId:id,readOnly:1},skipGlobalLoading:true});if(current!==generation)return;codes.value=(data.items||[]).filter(row=>row.service_code&&!['0',0,false].includes(row.is_active));serviceCode.value=codes.value.some(row=>row.service_code==='H0004')?'H0004':codes.value[0]?.service_code||'';if(!codes.value.length)error.value='No active service codes are available for this practice.';}
 catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'Service codes could not be loaded. Refresh this page to try again.';}
 finally{if(current===generation)loading.value=false;}
},{immediate:true});
watch([serviceCode,minutes],()=>{request++;result.value=null;});
async function preview(){
 if(busy.value||loading.value||!serviceCode.value||!validMinutes.value)return;
 const current=generation,attempt=++request,agencyId=Number(props.agencyId);busy.value=true;error.value='';result.value=null;
 try{const {data}=await api.post('/medical-billing/service-codes/preview-units',{agencyId,serviceCode:serviceCode.value,minutes:Number(minutes.value)},{skipGlobalLoading:true});if(current!==generation||attempt!==request)return;if(!Number.isFinite(data?.units))throw Error('Invalid unit preview');result.value=data;}
 catch(e){if(current===generation&&attempt===request)error.value=e.response?.data?.error?.message||'Unit preview could not be completed. Your inputs are preserved.';}
 finally{if(current===generation)busy.value=false;}
}
</script>
<style scoped>
.unit-preview{margin:18px 0;padding:20px;border:1px solid #dce3ec;border-radius:12px;background:#fff;color:#243954}.unit-preview h2{margin:0 0 8px;font-size:18px}.unit-preview p{font-size:14px;line-height:1.5}.unit-preview form{display:flex;align-items:end;flex-wrap:wrap;gap:12px}.unit-preview label{display:grid;gap:5px;font-size:14px}.unit-preview select,.unit-preview input,.unit-preview button{min-height:40px;padding:8px;border:1px solid #b8c5d6;border-radius:6px;font:inherit}.unit-preview select{max-width:min(420px,100%)}.unit-preview input{width:130px}.unit-preview button{background:#1555b0;color:white;cursor:pointer}.unit-preview button:disabled{opacity:.6;cursor:default}.unit-review{margin-top:12px;padding:12px;border-left:4px solid #a57011;background:#fff7e6}.unit-error{color:#a02a24}@media(max-width:500px){.unit-preview form,.unit-preview label{display:grid;width:100%}.unit-preview select,.unit-preview input{width:100%;max-width:100%}}
</style>
