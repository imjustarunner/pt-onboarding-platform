<template>
  <details v-if="eligible" class="resubmission-panel">
    <summary>Resubmit, replace or void this claim</summary>
    <p>Choose the payer’s required transaction. The original submission remains in claim history; the new claim requires a separate review before transmission.</p>
    <form @submit.prevent="create">
      <label>Submission type<select v-model="kind"><option v-if="lifecycle === 'rejected'" value="original_retry">Resubmit rejected claim · original frequency 1</option><option v-else value="replacement">Replacement / corrected claim · frequency 7</option><option v-if="lifecycle !== 'rejected'" value="void">Void / cancellation · frequency 8</option></select></label>
      <label v-if="kind !== 'original_retry'">Original payer claim / control number<input v-model="payerControlNumber" maxlength="32" required autocomplete="off" /></label>
      <label>Reason for this submission<textarea v-model="reason" minlength="10" maxlength="2000" required rows="3" /></label>
      <label v-if="kind !== 'original_retry'" class="check"><input v-model="payerSupportsElectronicCorrection" type="checkbox" required /> I verified that this payer accepts this electronic replacement or void and reviewed the payer’s correction requirements.</label>
      <label class="check"><input v-model="attested" type="checkbox" required /> I reviewed the original submission, payer outcome and payment history. This creates a linked claim for review.</label>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="revision == null" role="status">Refresh this claim to load its current billing revision before creating a resubmission.</p>
      <button :disabled="busy || revision == null || !attested || reason.trim().length < 10 || (kind !== 'original_retry' && (!payerControlNumber.trim() || !payerSupportsElectronicCorrection))">{{ busy ? 'Creating linked claim…' : 'Create linked claim for review' }}</button>
    </form>
  </details>
</template>
<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import api from '../../services/api';
const props=defineProps({agencyId:{type:Number,required:true},claimId:{type:Number,required:true},revision:{type:Number,default:null},lifecycle:String});
const emit=defineEmits(['created']);
const kind=ref(''),payerControlNumber=ref(''),reason=ref(''),payerSupportsElectronicCorrection=ref(false),attested=ref(false),busy=ref(false),error=ref('');let generation=0;
const eligible=computed(()=>['rejected','denied','paid','adjusted'].includes(props.lifecycle));
watch(()=>[props.agencyId,props.claimId,props.lifecycle],()=>{generation++;kind.value=props.lifecycle==='rejected'?'original_retry':'replacement';payerControlNumber.value='';reason.value='';attested.value=false;error.value='';payerSupportsElectronicCorrection.value=false;busy.value=false;},{immediate:true});
watch([kind,payerControlNumber,reason],()=>{attested.value=false;});
async function create(){if(busy.value||props.revision==null||!attested.value||reason.value.trim().length<10||(kind.value!=='original_retry'&&(!payerControlNumber.value.trim()||!payerSupportsElectronicCorrection.value)))return;const current=generation;busy.value=true;error.value='';try{const {data}=await api.post(`/medical-billing/claimmd/claims/${props.claimId}/resubmissions`,{agencyId:props.agencyId,kind:kind.value,payerControlNumber:payerControlNumber.value.trim(),reason:reason.value.trim(),revision:props.revision,attested:true,payerSupportsElectronicCorrection:payerSupportsElectronicCorrection.value},{skipGlobalLoading:true});if(current===generation)emit('created',data);}catch(e){if(current===generation)error.value=e.response?.data?.error?.message||'The linked claim could not be created. Refresh the original claim before retrying.';}finally{if(current===generation)busy.value=false;}}
onBeforeUnmount(()=>generation++);
</script>
<style scoped>
.resubmission-panel{border:1px solid #cbd8e5;padding:15px;border-radius:10px;margin:18px 0}summary{font-weight:650;cursor:pointer}p{line-height:1.5;color:#52647c}form{display:grid;gap:14px}label{display:grid;gap:6px}.check{display:flex;align-items:flex-start;gap:9px}.check input{margin-top:4px}input:not([type=checkbox]),select,textarea{font:inherit;padding:9px;border:1px solid #b7c7db;border-radius:6px;max-width:100%;box-sizing:border-box}button{font:inherit;padding:10px 14px;border:1px solid #1555b0;border-radius:7px;background:#1555b0;color:white;cursor:pointer}button:disabled{opacity:.5;cursor:default}[role=alert]{color:#a71925}
</style>
